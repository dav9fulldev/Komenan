import { Router } from 'express';
import { z } from 'zod';
import { requete, uneLigne, transaction } from '../db.js';
import { valider, id, txt, txtOpt } from '../lib/validation.js';
import { exiger } from '../middleware/auth.js';
import { auditer } from '../lib/audit.js';
import { ErreurMetier, nonTrouve } from '../lib/erreurs.js';
import { pagination } from '../lib/pagination.js';
import { LIBELLES_ANOMALIES } from '../services/anomalies.js';

const r = Router();

const SELECT = `
  SELECT x.*, CONCAT(e.nom, ' ', e.prenoms) AS enseignant, e.telephone, d.code AS domicile_code, m.nom AS marche,
    s.date_seance, s.debut_prevu, CONCAT(u.prenoms, ' ', u.nom) AS traitee_par_nom,
    (SELECT COUNT(*) FROM observations o WHERE o.anomalie_id = x.id) AS nb_observations
  FROM anomalies x LEFT JOIN enseignants e ON e.id = x.enseignant_id LEFT JOIN domiciles d ON d.id = x.domicile_id
  LEFT JOIN marches m ON m.id = d.marche_id LEFT JOIN seances s ON s.id = x.seance_id
  LEFT JOIN utilisateurs u ON u.id = x.traitee_par`;

r.get('/types', (req, res) => res.json(LIBELLES_ANOMALIES));

r.get('/', exiger('anomalies.voir'), async (req, res) => {
  const { limite, decalage, page, taille } = pagination(req.query);
  const where = ['1=1'];
  const params = [];
  for (const [k, col] of [['type', 'x.type'], ['statut', 'x.statut'], ['gravite', 'x.gravite'], ['enseignant_id', 'x.enseignant_id'], ['domicile_id', 'x.domicile_id'], ['marche_id', 'd.marche_id']]) {
    if (req.query[k]) { where.push(`${col} = ?`); params.push(req.query[k]); }
  }
  if (req.query.ouvertes === '1') where.push("x.statut IN ('a_examiner','en_cours')");
  if (req.query.debut) { where.push('x.cree_le >= ?'); params.push(`${req.query.debut} 00:00:00`); }
  if (req.query.fin) { where.push('x.cree_le <= ?'); params.push(`${req.query.fin} 23:59:59`); }
  const w = where.join(' AND ');
  const [{ total }] = await requete(`SELECT COUNT(*) AS total FROM anomalies x LEFT JOIN domiciles d ON d.id = x.domicile_id WHERE ${w}`, params);
  const donnees = await requete(`${SELECT} WHERE ${w} ORDER BY x.cree_le DESC LIMIT ? OFFSET ?`, [...params, limite, decalage]);
  res.json({ donnees, total, page, taille });
});

r.get('/:id', exiger('anomalies.voir'), async (req, res) => {
  const aid = valider(id, req.params.id);
  const a = await uneLigne(`${SELECT} WHERE x.id = ?`, [aid]);
  if (!a) throw nonTrouve('Anomalie');
  a.pointage = a.pointage_id ? await uneLigne(
    `SELECT id, type, resultat, motif_rejet, telephone_saisi, nom_saisi, heure_serveur, heure_appareil, latitude, longitude,
       precision_m, distance_m, statut_gps, controles, ip, user_agent FROM pointages WHERE id = ?`, [a.pointage_id]) : null;
  a.observations = await requete(
    `SELECT o.*, CONCAT(u.prenoms, ' ', u.nom) AS auteur, u.role FROM observations o JOIN utilisateurs u ON u.id = o.utilisateur_id
     WHERE o.anomalie_id = ? ORDER BY o.id`, [aid]);
  res.json(a);
});

r.post('/:id/observations', exiger('anomalies.observer'), async (req, res) => {
  const aid = valider(id, req.params.id);
  const d = valider(z.object({
    type: z.enum(['observation', 'demande_precision', 'signalement', 'reponse']).default('observation'),
    texte: txt(2000, "L'observation"),
  }), req.body);
  await transaction(async (conn) => {
    const [[a]] = await conn.query('SELECT id, statut FROM anomalies WHERE id = ? FOR UPDATE', [aid]);
    if (!a) throw nonTrouve('Anomalie');
    await conn.query('INSERT INTO observations (anomalie_id, utilisateur_id, type, texte) VALUES (?,?,?,?)', [aid, req.utilisateur.id, d.type, d.texte]);
    if (a.statut === 'a_examiner') await conn.query("UPDATE anomalies SET statut = 'en_cours' WHERE id = ?", [aid]);
    await auditer(req, 'ajout_observation', 'anomalie', aid, null, d, conn);
  });
  res.status(201).json({ message: 'Observation enregistrée' });
});

r.patch('/:id/statut', exiger('anomalies.traiter'), async (req, res) => {
  const aid = valider(id, req.params.id);
  const d = valider(z.object({
    statut: z.enum(['a_examiner', 'en_cours', 'traitee', 'classee'], { error: 'Statut invalide' }),
    conclusion: txtOpt(1000),
  }), req.body);
  if (['traitee', 'classee'].includes(d.statut) && !d.conclusion) throw new ErreurMetier(400, 'Une conclusion est obligatoire pour clôturer une anomalie');
  const avant = await uneLigne('SELECT id, statut, conclusion FROM anomalies WHERE id = ?', [aid]);
  if (!avant) throw nonTrouve('Anomalie');
  const cloture = ['traitee', 'classee'].includes(d.statut);
  await requete(
    `UPDATE anomalies SET statut = ?, conclusion = COALESCE(?, conclusion),
       traitee_par = IF(?, ?, traitee_par), traitee_le = IF(?, UTC_TIMESTAMP(), traitee_le) WHERE id = ?`,
    [d.statut, d.conclusion, cloture, req.utilisateur.id, cloture, aid]);
  await auditer(req, 'traitement_anomalie', 'anomalie', aid, avant, d);
  res.json({ message: 'Anomalie mise à jour' });
});

export default r;
