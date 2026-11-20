import { Router } from 'express';
import { z } from 'zod';
import { pool, requete, uneLigne, transaction } from '../db.js';
import { valider, txt, txtOpt, id, booleen } from '../lib/validation.js';
import { exiger } from '../middleware/auth.js';
import { auditer } from '../lib/audit.js';
import { invalide, nonTrouve } from '../lib/erreurs.js';
import { normaliserTelephone } from '../lib/identite.js';
import { resynchroniserCreneaux } from '../services/seances.js';

const r = Router();

const schema = z.object({
  matricule: txtOpt(30),
  nom: txt(100, 'Le nom'),
  prenoms: txt(150, 'Les prénoms'),
  telephone: z.string({ error: 'Le téléphone est obligatoire' }).transform((v, ctx) => {
    const n = normaliserTelephone(v);
    if (!n) ctx.addIssue({ code: 'custom', message: 'Numéro invalide : 10 chiffres attendus (ex. 07 01 02 03 04)' });
    return n;
  }),
  email: z.string().trim().toLowerCase().email('Adresse e-mail invalide').max(190).optional().nullable().or(z.literal('')).transform((v) => v || null),
  matieres: z.array(id).default([]),
  marches: z.array(id).default([]),
});

async function fiche(eid) {
  const e = await uneLigne('SELECT * FROM enseignants WHERE id = ?', [eid]);
  if (!e) return null;
  e.matieres = await requete('SELECT m.id, m.libelle FROM enseignant_matieres em JOIN matieres m ON m.id = em.matiere_id WHERE em.enseignant_id = ? ORDER BY m.libelle', [eid]);
  e.marches = await requete('SELECT m.id, m.code, m.nom FROM enseignant_marches em JOIN marches m ON m.id = em.marche_id WHERE em.enseignant_id = ? ORDER BY m.nom', [eid]);
  return e;
}

async function enregistrerLiens(conn, eid, d) {
  await conn.query('DELETE FROM enseignant_matieres WHERE enseignant_id = ?', [eid]);
  if (d.matieres.length) await conn.query('INSERT INTO enseignant_matieres (enseignant_id, matiere_id) VALUES ?', [d.matieres.map((m) => [eid, m])]);
  await conn.query('DELETE FROM enseignant_marches WHERE enseignant_id = ?', [eid]);
  if (d.marches.length) await conn.query('INSERT INTO enseignant_marches (enseignant_id, marche_id) VALUES ?', [d.marches.map((m) => [eid, m])]);
}

r.get('/', exiger('enseignants.voir'), async (req, res) => {
  const where = ['1=1'];
  const params = [];
  if (req.query.q) {
    where.push('(e.nom LIKE ? OR e.prenoms LIKE ? OR e.telephone LIKE ? OR e.matricule LIKE ?)');
    const q = `%${req.query.q}%`;
    params.push(q, q, q, q);
  }
  if (req.query.actif === '1' || req.query.actif === '0') { where.push('e.actif = ?'); params.push(Number(req.query.actif)); }
  if (req.query.marche_id) { where.push('EXISTS (SELECT 1 FROM enseignant_marches x WHERE x.enseignant_id = e.id AND x.marche_id = ?)'); params.push(req.query.marche_id); }
  res.json(await requete(
    `SELECT e.*,
       (SELECT GROUP_CONCAT(m.libelle ORDER BY m.libelle SEPARATOR ', ') FROM enseignant_matieres em JOIN matieres m ON m.id = em.matiere_id WHERE em.enseignant_id = e.id) AS matieres,
       (SELECT GROUP_CONCAT(m.nom ORDER BY m.nom SEPARATOR ', ') FROM enseignant_marches em JOIN marches m ON m.id = em.marche_id WHERE em.enseignant_id = e.id) AS marches,
       (SELECT COUNT(*) FROM affectations a WHERE a.enseignant_id = e.id AND a.actif = 1 AND (a.date_fin IS NULL OR a.date_fin >= CURDATE())) AS nb_affectations
     FROM enseignants e WHERE ${where.join(' AND ')} ORDER BY e.nom, e.prenoms`, params));
});

r.get('/:id', exiger('enseignants.voir'), async (req, res) => {
  const eid = valider(id, req.params.id);
  const e = await fiche(eid);
  if (!e) throw nonTrouve('Enseignant');
  e.affectations = await requete(
    `SELECT a.*, d.code AS domicile_code, d.commune, d.quartier, ma.nom AS marche, mt.libelle AS matiere,
       CONCAT(p.nom, ' ', p.prenoms) AS parent
     FROM affectations a JOIN domiciles d ON d.id = a.domicile_id JOIN marches ma ON ma.id = d.marche_id
     JOIN parents p ON p.id = d.parent_id JOIN matieres mt ON mt.id = a.matiere_id
     WHERE a.enseignant_id = ? ORDER BY a.actif DESC, a.date_debut DESC`, [eid]);
  [e.statistiques] = await requete(
    `SELECT COUNT(*) AS seances,
       SUM(arrivee_reelle IS NOT NULL) AS presences,
       SUM(statut_arrivee IN ('retard_en_attente','retard_justifie','retard_non_justifie')) AS retards,
       SUM(statut = 'absence_presumee') AS absences,
       COALESCE(SUM(duree_effective_minutes), 0) AS minutes_effectives
     FROM seances WHERE enseignant_id = ? AND debut_prevu <= UTC_TIMESTAMP() AND statut <> 'annulee'
       AND date_seance >= CURDATE() - INTERVAL 30 DAY`, [eid]);
  res.json(e);
});

async function matriculeSuivant(conn) {
  const [[{ n }]] = await conn.query('SELECT COALESCE(MAX(id), 0) + 1 AS n FROM enseignants');
  return `ENS-${String(n).padStart(4, '0')}`;
}

r.post('/', exiger('enseignants.gerer'), async (req, res) => {
  const d = valider(schema, req.body);
  const eid = await transaction(async (conn) => {
    const matricule = d.matricule || await matriculeSuivant(conn);
    const [x] = await conn.query('INSERT INTO enseignants (matricule, nom, prenoms, telephone, email) VALUES (?,?,?,?,?)',
      [matricule, d.nom, d.prenoms, d.telephone, d.email]);
    await enregistrerLiens(conn, x.insertId, d);
    return x.insertId;
  });
  const e = await fiche(eid);
  await auditer(req, 'creation_enseignant', 'enseignant', eid, null, e);
  res.status(201).json(e);
});

r.put('/:id', exiger('enseignants.gerer'), async (req, res) => {
  const eid = valider(id, req.params.id);
  const d = valider(schema, req.body);
  const avant = await fiche(eid);
  if (!avant) throw nonTrouve('Enseignant');
  // Une matière encore utilisée dans une affectation active ne peut pas être retirée.
  const utilisees = await requete(
    `SELECT DISTINCT m.id, m.libelle FROM affectations a JOIN matieres m ON m.id = a.matiere_id
     WHERE a.enseignant_id = ? AND a.actif = 1 AND (a.date_fin IS NULL OR a.date_fin >= CURDATE())`, [eid]);
  const manquantes = utilisees.filter((m) => !d.matieres.includes(m.id));
  if (manquantes.length) throw invalide(`Matière(s) utilisée(s) dans une affectation active : ${manquantes.map((m) => m.libelle).join(', ')}`);
  await transaction(async (conn) => {
    await conn.query('UPDATE enseignants SET matricule = ?, nom = ?, prenoms = ?, telephone = ?, email = ? WHERE id = ?',
      [d.matricule || avant.matricule, d.nom, d.prenoms, d.telephone, d.email, eid]);
    await enregistrerLiens(conn, eid, d);
  });
  const apres = await fiche(eid);
  await auditer(req, 'modification_enseignant', 'enseignant', eid, avant, apres);
  res.json(apres);
});

r.patch('/:id/statut', exiger('enseignants.gerer'), async (req, res) => {
  const eid = valider(id, req.params.id);
  const { actif } = valider(z.object({ actif: booleen }), req.body);
  const avant = await uneLigne('SELECT id, actif FROM enseignants WHERE id = ?', [eid]);
  if (!avant) throw nonTrouve('Enseignant');
  await transaction(async (conn) => {
    await conn.query('UPDATE enseignants SET actif = ? WHERE id = ?', [actif, eid]);
    const [cr] = await conn.query('SELECT c.id FROM creneaux c JOIN affectations a ON a.id = c.affectation_id WHERE a.enseignant_id = ?', [eid]);
    await resynchroniserCreneaux(conn, cr.map((c) => c.id));
    await auditer(req, actif ? 'activation_enseignant' : 'desactivation_enseignant', 'enseignant', eid, { actif: avant.actif }, { actif }, conn);
  });
  res.json({ message: actif ? 'Enseignant activé' : 'Enseignant désactivé : ses séances futures sont annulées' });
});

export default r;

// ---------- Matières ----------
export const matieres = Router();
matieres.get('/', async (req, res) => res.json(await requete('SELECT * FROM matieres ORDER BY libelle')));
matieres.post('/', exiger('enseignants.gerer'), async (req, res) => {
  const d = valider(z.object({ libelle: txt(100, 'Le libellé') }), req.body);
  const [x] = await pool.query('INSERT INTO matieres (libelle) VALUES (?)', [d.libelle]);
  await auditer(req, 'creation_matiere', 'matiere', x.insertId, null, d);
  res.status(201).json({ id: x.insertId, libelle: d.libelle });
});
