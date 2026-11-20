import { Router } from 'express';
import { z } from 'zod';
import { requete, uneLigne, transaction } from '../db.js';
import { valider, id, dateAMJ, booleen } from '../lib/validation.js';
import { exiger } from '../middleware/auth.js';
import { auditer } from '../lib/audit.js';
import { ErreurMetier, invalide, nonTrouve } from '../lib/erreurs.js';
import { resynchroniserCreneaux } from '../services/seances.js';

const r = Router();

const schema = z.object({
  enseignant_id: id, domicile_id: id, matiere_id: id, date_debut: dateAMJ,
  date_fin: dateAMJ.optional().nullable().or(z.literal('')).transform((v) => v || null),
}).refine((d) => !d.date_fin || d.date_fin >= d.date_debut, { message: 'La date de fin doit suivre la date de début', path: ['date_fin'] });

export const SELECT_AFFECTATION = `
  SELECT a.*, e.matricule, CONCAT(e.nom, ' ', e.prenoms) AS enseignant, e.telephone AS enseignant_telephone,
    d.code AS domicile_code, d.commune, d.quartier, d.marche_id, m.nom AS marche,
    CONCAT(p.nom, ' ', p.prenoms) AS parent, mt.libelle AS matiere,
    (SELECT COUNT(*) FROM creneaux c WHERE c.affectation_id = a.id AND c.actif = 1) AS nb_creneaux
  FROM affectations a JOIN enseignants e ON e.id = a.enseignant_id JOIN domiciles d ON d.id = a.domicile_id
  JOIN marches m ON m.id = d.marche_id JOIN parents p ON p.id = d.parent_id JOIN matieres mt ON mt.id = a.matiere_id`;

r.get('/', exiger('affectations.voir'), async (req, res) => {
  const where = ['1=1'];
  const params = [];
  for (const [q, col] of [['enseignant_id', 'a.enseignant_id'], ['domicile_id', 'a.domicile_id'], ['marche_id', 'd.marche_id']]) {
    if (req.query[q]) { where.push(`${col} = ?`); params.push(req.query[q]); }
  }
  if (req.query.en_cours === '1') where.push('a.actif = 1 AND a.date_debut <= CURDATE() AND (a.date_fin IS NULL OR a.date_fin >= CURDATE())');
  res.json(await requete(`${SELECT_AFFECTATION} WHERE ${where.join(' AND ')} ORDER BY a.actif DESC, e.nom, d.code`, params));
});

async function verifier(conn, d) {
  const [[e]] = await conn.query('SELECT id, actif FROM enseignants WHERE id = ?', [d.enseignant_id]);
  if (!e) throw nonTrouve('Enseignant');
  if (!e.actif) throw invalide("L'enseignant est désactivé");
  const [[dom]] = await conn.query('SELECT id, actif, marche_id FROM domiciles WHERE id = ?', [d.domicile_id]);
  if (!dom) throw nonTrouve('Domicile');
  if (!dom.actif) throw invalide('Le domicile est désactivé');
  const [[mt]] = await conn.query('SELECT 1 AS ok FROM enseignant_matieres WHERE enseignant_id = ? AND matiere_id = ?', [d.enseignant_id, d.matiere_id]);
  if (!mt) throw invalide("Cette matière ne figure pas parmi les matières enseignées par l'enseignant", { matiere_id: 'Matière non enseignée' });
  return dom;
}

r.post('/', exiger('affectations.gerer'), async (req, res) => {
  const d = valider(schema, req.body);
  const aid = await transaction(async (conn) => {
    const dom = await verifier(conn, d);
    const [[doublon]] = await conn.query(
      `SELECT id FROM affectations WHERE enseignant_id = ? AND domicile_id = ? AND matiere_id = ? AND actif = 1
         AND date_debut <= COALESCE(?, '9999-12-31') AND COALESCE(date_fin, '9999-12-31') >= ?`,
      [d.enseignant_id, d.domicile_id, d.matiere_id, d.date_fin, d.date_debut]);
    if (doublon) throw new ErreurMetier(409, 'Une affectation identique existe déjà sur cette période');
    const [x] = await conn.query('INSERT INTO affectations (enseignant_id, domicile_id, matiere_id, date_debut, date_fin) VALUES (?,?,?,?,?)',
      [d.enseignant_id, d.domicile_id, d.matiere_id, d.date_debut, d.date_fin]);
    // L'enseignant est rattaché automatiquement au marché du domicile.
    await conn.query('INSERT IGNORE INTO enseignant_marches (enseignant_id, marche_id) VALUES (?,?)', [d.enseignant_id, dom.marche_id]);
    return x.insertId;
  });
  const cree = await uneLigne(`${SELECT_AFFECTATION} WHERE a.id = ?`, [aid]);
  await auditer(req, 'creation_affectation', 'affectation', aid, null, cree);
  res.status(201).json(cree);
});

r.put('/:id', exiger('affectations.gerer'), async (req, res) => {
  const aid = valider(id, req.params.id);
  const d = valider(schema, req.body);
  const avant = await uneLigne(`${SELECT_AFFECTATION} WHERE a.id = ?`, [aid]);
  if (!avant) throw nonTrouve('Affectation');
  await transaction(async (conn) => {
    if (avant.enseignant_id !== d.enseignant_id || avant.domicile_id !== d.domicile_id) {
      const [[s]] = await conn.query("SELECT COUNT(*) AS n FROM seances WHERE affectation_id = ? AND statut <> 'prevue'", [aid]);
      if (s.n > 0) throw new ErreurMetier(409, "Cette affectation a déjà un historique : clôturez-la (date de fin) et créez-en une nouvelle pour changer d'enseignant ou de domicile");
    }
    const dom = await verifier(conn, d);
    await conn.query('UPDATE affectations SET enseignant_id = ?, domicile_id = ?, matiere_id = ?, date_debut = ?, date_fin = ? WHERE id = ?',
      [d.enseignant_id, d.domicile_id, d.matiere_id, d.date_debut, d.date_fin, aid]);
    await conn.query('INSERT IGNORE INTO enseignant_marches (enseignant_id, marche_id) VALUES (?,?)', [d.enseignant_id, dom.marche_id]);
    const [cr] = await conn.query('SELECT id FROM creneaux WHERE affectation_id = ?', [aid]);
    await resynchroniserCreneaux(conn, cr.map((c) => c.id));
  });
  const apres = await uneLigne(`${SELECT_AFFECTATION} WHERE a.id = ?`, [aid]);
  await auditer(req, 'modification_affectation', 'affectation', aid, avant, apres);
  res.json(apres);
});

r.patch('/:id/statut', exiger('affectations.gerer'), async (req, res) => {
  const aid = valider(id, req.params.id);
  const { actif } = valider(z.object({ actif: booleen }), req.body);
  const avant = await uneLigne('SELECT id, actif FROM affectations WHERE id = ?', [aid]);
  if (!avant) throw nonTrouve('Affectation');
  await transaction(async (conn) => {
    await conn.query('UPDATE affectations SET actif = ? WHERE id = ?', [actif, aid]);
    const [cr] = await conn.query('SELECT id FROM creneaux WHERE affectation_id = ?', [aid]);
    await resynchroniserCreneaux(conn, cr.map((c) => c.id));
    await auditer(req, actif ? 'activation_affectation' : 'desactivation_affectation', 'affectation', aid, { actif: avant.actif }, { actif }, conn);
  });
  res.json({ message: actif ? 'Affectation réactivée' : 'Affectation désactivée : les séances futures sont annulées' });
});

export default r;
