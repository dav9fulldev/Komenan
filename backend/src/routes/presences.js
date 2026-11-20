import { Router } from 'express';
import { z } from 'zod';
import { requete, uneLigne, transaction } from '../db.js';
import { valider, id, txt } from '../lib/validation.js';
import { exiger } from '../middleware/auth.js';
import { auditer } from '../lib/audit.js';
import { ErreurMetier, nonTrouve } from '../lib/erreurs.js';
import { pagination } from '../lib/pagination.js';

const r = Router();

export const SELECT_SEANCE = `
  SELECT s.*, e.matricule, CONCAT(e.nom, ' ', e.prenoms) AS enseignant, e.telephone,
    d.code AS domicile_code, d.commune, d.quartier, m.id AS marche_id, m.nom AS marche,
    CONCAT(p.nom, ' ', p.prenoms) AS parent, mt.libelle AS matiere,
    (SELECT j.texte FROM justifications j WHERE j.seance_id = s.id AND j.type = 'retard' ORDER BY j.id DESC LIMIT 1) AS justification_retard,
    (SELECT j.statut FROM justifications j WHERE j.seance_id = s.id AND j.type = 'retard' ORDER BY j.id DESC LIMIT 1) AS statut_justification
  FROM seances s JOIN enseignants e ON e.id = s.enseignant_id JOIN domiciles d ON d.id = s.domicile_id
  JOIN marches m ON m.id = d.marche_id JOIN parents p ON p.id = d.parent_id
  JOIN affectations a ON a.id = s.affectation_id JOIN matieres mt ON mt.id = a.matiere_id`;

export function filtresSeances(q) {
  const where = ["s.statut <> 'annulee'"];
  const params = [];
  if (q.debut) { where.push('s.date_seance >= ?'); params.push(q.debut); }
  if (q.fin) { where.push('s.date_seance <= ?'); params.push(q.fin); }
  for (const [k, col] of [['enseignant_id', 's.enseignant_id'], ['domicile_id', 's.domicile_id'], ['marche_id', 'd.marche_id']]) {
    if (q[k]) { where.push(`${col} = ?`); params.push(q[k]); }
  }
  if (q.statut === 'en_retard') where.push("s.statut_arrivee IN ('retard_en_attente','retard_justifie','retard_non_justifie')");
  else if (q.statut === 'depart_anticipe') where.push('s.depart_anticipe_minutes > 0');
  else if (q.statut) { where.push('s.statut = ?'); params.push(q.statut); }
  if (q.statut !== 'prevue' && q.inclure_futures !== '1') where.push("(s.debut_prevu <= UTC_TIMESTAMP() OR s.statut <> 'prevue')");
  return { where: where.join(' AND '), params };
}

r.get('/', exiger('presences.voir'), async (req, res) => {
  const { limite, decalage, page, taille } = pagination(req.query);
  const { where, params } = filtresSeances(req.query);
  const [{ total }] = await requete(
    `SELECT COUNT(*) AS total FROM seances s JOIN domiciles d ON d.id = s.domicile_id WHERE ${where}`, params);
  const donnees = await requete(`${SELECT_SEANCE} WHERE ${where} ORDER BY s.debut_prevu DESC LIMIT ? OFFSET ?`, [...params, limite, decalage]);
  res.json({ donnees, total, page, taille });
});

r.get('/:id', exiger('presences.voir'), async (req, res) => {
  const sid = valider(id, req.params.id);
  const s = await uneLigne(`${SELECT_SEANCE} WHERE s.id = ?`, [sid]);
  if (!s) throw nonTrouve('Séance');
  s.pointages = await requete(
    `SELECT id, type, resultat, motif_rejet, heure_serveur, latitude, longitude, precision_m, distance_m, statut_gps, controles, ip, user_agent
     FROM pointages WHERE seance_id = ? ORDER BY heure_serveur`, [sid]);
  s.justifications = await requete(
    `SELECT j.*, CONCAT(u.prenoms, ' ', u.nom) AS decideur FROM justifications j LEFT JOIN utilisateurs u ON u.id = j.decision_par
     WHERE j.seance_id = ? ORDER BY j.id`, [sid]);
  s.anomalies = await requete('SELECT id, type, gravite, statut, description, cree_le FROM anomalies WHERE seance_id = ? ORDER BY id', [sid]);
  s.observations = await requete(
    `SELECT o.*, CONCAT(u.prenoms, ' ', u.nom) AS auteur, u.role FROM observations o JOIN utilisateurs u ON u.id = o.utilisateur_id
     WHERE o.seance_id = ? ORDER BY o.id`, [sid]);
  res.json(s);
});

r.post('/:id/observations', exiger('anomalies.observer'), async (req, res) => {
  const sid = valider(id, req.params.id);
  const d = valider(z.object({
    type: z.enum(['observation', 'demande_precision', 'signalement', 'reponse']).default('observation'),
    texte: txt(2000, "L'observation"),
  }), req.body);
  const s = await uneLigne('SELECT id FROM seances WHERE id = ?', [sid]);
  if (!s) throw nonTrouve('Séance');
  await requete('INSERT INTO observations (seance_id, utilisateur_id, type, texte) VALUES (?,?,?,?)', [sid, req.utilisateur.id, d.type, d.texte]);
  await auditer(req, 'ajout_observation', 'seance', sid, null, d);
  res.status(201).json({ message: 'Observation enregistrée' });
});

// Traitement d'une absence présumée : décision tracée, jamais d'effacement de l'historique.
r.patch('/:id/absence', exiger('anomalies.traiter'), async (req, res) => {
  const sid = valider(id, req.params.id);
  const d = valider(z.object({
    decision: z.enum(['confirmee', 'justifiee'], { error: 'Décision invalide' }),
    commentaire: txt(1000, 'Le commentaire'),
  }), req.body);
  await transaction(async (conn) => {
    const [[s]] = await conn.query('SELECT id, statut, statut_absence FROM seances WHERE id = ? FOR UPDATE', [sid]);
    if (!s) throw nonTrouve('Séance');
    if (s.statut !== 'absence_presumee') throw new ErreurMetier(409, "Cette séance n'est pas une absence présumée");
    await conn.query('UPDATE seances SET statut_absence = ? WHERE id = ?', [d.decision, sid]);
    await conn.query("INSERT INTO observations (seance_id, utilisateur_id, type, texte) VALUES (?,?, 'observation', ?)",
      [sid, req.utilisateur.id, `Décision : absence ${d.decision === 'confirmee' ? 'confirmée (non justifiée)' : 'justifiée'}. ${d.commentaire}`]);
    await conn.query(
      "UPDATE anomalies SET statut = 'traitee', traitee_par = ?, traitee_le = UTC_TIMESTAMP(), conclusion = ? WHERE seance_id = ? AND type = 'absence_presumee'",
      [req.utilisateur.id, d.commentaire, sid]);
    await auditer(req, 'traitement_absence', 'seance', sid, { statut_absence: s.statut_absence }, d, conn);
  });
  res.json({ message: 'Décision enregistrée' });
});

export default r;
