import { Router } from 'express';
import { z } from 'zod';
import { requete, uneLigne, transaction } from '../db.js';
import { valider, id, dateAMJ, heureHM, booleen } from '../lib/validation.js';
import { exiger } from '../middleware/auth.js';
import { auditer } from '../lib/audit.js';
import { ErreurMetier, invalide, nonTrouve } from '../lib/erreurs.js';
import { lireParametres } from '../lib/parametres.js';
import { ajouterJours, jourSemaine, versInstant } from '../lib/horloge.js';
import { chercherConflits } from '../services/planning.js';
import { creneauALieu, resynchroniserCreneaux } from '../services/seances.js';

const r = Router();

const schema = z.object({
  affectation_id: id,
  jour_semaine: z.coerce.number().int().min(1).max(7).optional(),
  heure_debut: heureHM, heure_fin: heureHM,
  frequence: z.enum(['hebdomadaire', 'quinzaine', 'ponctuelle'], { error: 'Fréquence invalide' }),
  date_debut: dateAMJ,
  date_fin: dateAMJ.optional().nullable().or(z.literal('')).transform((v) => v || null),
}).refine((d) => d.heure_fin > d.heure_debut, { message: "L'heure de fin doit suivre l'heure de début", path: ['heure_fin'] })
  .refine((d) => !d.date_fin || d.date_fin >= d.date_debut, { message: 'La date de fin doit suivre la date de début', path: ['date_fin'] })
  .refine((d) => d.frequence === 'ponctuelle' || d.jour_semaine, { message: 'Le jour est obligatoire', path: ['jour_semaine'] });

const SELECT_CRENEAU = `
  SELECT c.*, TIME_FORMAT(c.heure_debut, '%H:%i') AS heure_debut, TIME_FORMAT(c.heure_fin, '%H:%i') AS heure_fin,
    a.enseignant_id, a.domicile_id, a.matiere_id, d.marche_id,
    CONCAT(e.nom, ' ', e.prenoms) AS enseignant, d.code AS domicile_code, d.commune, d.quartier,
    m.nom AS marche, CONCAT(p.nom, ' ', p.prenoms) AS parent, mt.libelle AS matiere
  FROM creneaux c JOIN affectations a ON a.id = c.affectation_id JOIN enseignants e ON e.id = a.enseignant_id
  JOIN domiciles d ON d.id = a.domicile_id JOIN marches m ON m.id = d.marche_id JOIN parents p ON p.id = d.parent_id
  JOIN matieres mt ON mt.id = a.matiere_id`;

function filtres(q) {
  const where = ['1=1'];
  const params = [];
  for (const [k, col] of [['enseignant_id', 'a.enseignant_id'], ['domicile_id', 'a.domicile_id'], ['marche_id', 'd.marche_id']]) {
    if (q[k]) { where.push(`${col} = ?`); params.push(q[k]); }
  }
  return { where, params };
}

r.get('/', exiger('plannings.voir'), async (req, res) => {
  const { where, params } = filtres(req.query);
  if (req.query.actif !== 'tous') where.push('c.actif = 1');
  res.json(await requete(`${SELECT_CRENEAU} WHERE ${where.join(' AND ')} ORDER BY c.jour_semaine, c.heure_debut, e.nom`, params));
});

// Vue calendrier : occurrences calculées sur la période, enrichies du statut réel des séances.
r.get('/calendrier', exiger('plannings.voir'), async (req, res) => {
  const { debut, fin } = valider(z.object({ debut: dateAMJ, fin: dateAMJ }), req.query);
  if (fin < debut || ajouterJours(debut, 62) < fin) throw invalide('Période invalide (62 jours maximum)');
  const { where, params } = filtres(req.query);
  where.push('c.actif = 1 AND a.actif = 1 AND c.date_debut <= ? AND (c.date_fin IS NULL OR c.date_fin >= ?)');
  params.push(fin, debut);
  const creneaux = await requete(`${SELECT_CRENEAU.replace('SELECT c.*,', 'SELECT c.*, a.date_debut AS aff_debut, a.date_fin AS aff_fin,')} WHERE ${where.join(' AND ')}`, params);
  const seances = await requete(
    `SELECT id, creneau_id, date_seance, statut, statut_arrivee, arrivee_reelle, depart_reel, retard_minutes
     FROM seances WHERE date_seance BETWEEN ? AND ?`, [debut, fin]);
  const index = new Map(seances.map((s) => [`${s.creneau_id}|${s.date_seance}`, s]));
  const evenements = [];
  for (let d = debut; d <= fin; d = ajouterJours(d, 1)) {
    for (const c of creneaux) {
      if (!creneauALieu(c, d) || d < c.aff_debut || (c.aff_fin && d > c.aff_fin)) continue;
      const s = index.get(`${c.id}|${d}`);
      evenements.push({
        creneau_id: c.id, seance_id: s?.id ?? null, date: d, debut: versInstant(d, c.heure_debut), fin: versInstant(d, c.heure_fin),
        heure_debut: c.heure_debut, heure_fin: c.heure_fin, enseignant: c.enseignant, domicile_code: c.domicile_code,
        parent: c.parent, marche: c.marche, matiere: c.matiere, statut: s?.statut ?? 'prevue', statut_arrivee: s?.statut_arrivee ?? null,
      });
    }
  }
  evenements.sort((a, b) => a.debut - b.debut);
  res.json(evenements);
});

async function preparer(conn, d, creneauId = null) {
  const [[aff]] = await conn.query(
    'SELECT a.*, e.actif AS ens_actif FROM affectations a JOIN enseignants e ON e.id = a.enseignant_id WHERE a.id = ?', [d.affectation_id]);
  if (!aff) throw nonTrouve('Affectation');
  if (!aff.actif) throw invalide("L'affectation est désactivée");
  const c = { ...d, id: creneauId, enseignant_id: aff.enseignant_id, domicile_id: aff.domicile_id };
  if (c.frequence === 'ponctuelle') {
    c.date_fin = c.date_debut;
    c.jour_semaine = jourSemaine(c.date_debut);
  }
  if (c.date_debut < aff.date_debut) throw invalide(`Le créneau ne peut pas commencer avant le début de l'affectation (${aff.date_debut})`, { date_debut: 'Hors période de l’affectation' });
  if (aff.date_fin && (!c.date_fin || c.date_fin > aff.date_fin)) c.date_fin = aff.date_fin;
  if (c.date_fin && c.date_fin < c.date_debut) throw invalide("La période du créneau est en dehors de celle de l'affectation");
  const p = await lireParametres(conn);
  const conflits = await chercherConflits(conn, c, p.delai_trajet_minutes);
  if (conflits.length) throw new ErreurMetier(409, 'Horaire incompatible avec le planning existant de cet enseignant', { conflits });
  return c;
}

r.post('/', exiger('plannings.gerer'), async (req, res) => {
  const d = valider(schema, req.body);
  const cid = await transaction(async (conn) => {
    const [[verrou]] = await conn.query('SELECT a.enseignant_id FROM affectations a WHERE a.id = ?', [d.affectation_id]);
    if (verrou) await conn.query('SELECT id FROM enseignants WHERE id = ? FOR UPDATE', [verrou.enseignant_id]);
    const c = await preparer(conn, d);
    const [x] = await conn.query(
      'INSERT INTO creneaux (affectation_id, jour_semaine, heure_debut, heure_fin, frequence, date_debut, date_fin) VALUES (?,?,?,?,?,?,?)',
      [c.affectation_id, c.jour_semaine, c.heure_debut, c.heure_fin, c.frequence, c.date_debut, c.date_fin]);
    await resynchroniserCreneaux(conn, [x.insertId]);
    return x.insertId;
  });
  const cree = await uneLigne(`${SELECT_CRENEAU} WHERE c.id = ?`, [cid]);
  await auditer(req, 'creation_planning', 'creneau', cid, null, cree);
  res.status(201).json(cree);
});

r.put('/:id', exiger('plannings.gerer'), async (req, res) => {
  const cid = valider(id, req.params.id);
  const d = valider(schema, req.body);
  const avant = await uneLigne(`${SELECT_CRENEAU} WHERE c.id = ?`, [cid]);
  if (!avant) throw nonTrouve('Créneau');
  await transaction(async (conn) => {
    await conn.query('SELECT id FROM enseignants WHERE id = ? FOR UPDATE', [avant.enseignant_id]);
    const c = await preparer(conn, d, cid);
    await conn.query(
      'UPDATE creneaux SET affectation_id = ?, jour_semaine = ?, heure_debut = ?, heure_fin = ?, frequence = ?, date_debut = ?, date_fin = ? WHERE id = ?',
      [c.affectation_id, c.jour_semaine, c.heure_debut, c.heure_fin, c.frequence, c.date_debut, c.date_fin, cid]);
    await resynchroniserCreneaux(conn, [cid]);
  });
  const apres = await uneLigne(`${SELECT_CRENEAU} WHERE c.id = ?`, [cid]);
  await auditer(req, 'modification_planning', 'creneau', cid, avant, apres);
  res.json(apres);
});

r.patch('/:id/statut', exiger('plannings.gerer'), async (req, res) => {
  const cid = valider(id, req.params.id);
  const { actif } = valider(z.object({ actif: booleen }), req.body);
  const avant = await uneLigne(`${SELECT_CRENEAU} WHERE c.id = ?`, [cid]);
  if (!avant) throw nonTrouve('Créneau');
  await transaction(async (conn) => {
    if (actif) {
      await preparer(conn, { ...avant, affectation_id: avant.affectation_id }, cid);
    }
    await conn.query('UPDATE creneaux SET actif = ? WHERE id = ?', [actif, cid]);
    await resynchroniserCreneaux(conn, [cid]);
    await auditer(req, actif ? 'activation_planning' : 'suppression_planning', 'creneau', cid, { actif: avant.actif }, { actif }, conn);
  });
  res.json({ message: actif ? 'Créneau réactivé' : 'Créneau désactivé : les séances futures sont annulées' });
});

export default r;
