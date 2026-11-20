import { Router } from 'express';
import { z } from 'zod';
import { pool, requete, uneLigne } from '../db.js';
import { valider, txt, txtOpt, id, booleen } from '../lib/validation.js';
import { exiger } from '../middleware/auth.js';
import { auditer } from '../lib/audit.js';
import { nonTrouve } from '../lib/erreurs.js';

const r = Router();
const schema = z.object({ code: txt(30, 'Le code'), nom: txt(150, 'Le nom'), description: txtOpt(500) });

r.get('/', exiger('marches.voir'), async (req, res) => {
  res.json(await requete(
    `SELECT m.*,
       (SELECT COUNT(*) FROM enseignant_marches em JOIN enseignants e ON e.id = em.enseignant_id AND e.actif = 1 WHERE em.marche_id = m.id) AS nb_enseignants,
       (SELECT COUNT(*) FROM domiciles d WHERE d.marche_id = m.id AND d.actif = 1) AS nb_domiciles
     FROM marches m ORDER BY m.nom`));
});

r.get('/:id', exiger('marches.voir'), async (req, res) => {
  const mid = valider(id, req.params.id);
  const m = await uneLigne('SELECT * FROM marches WHERE id = ?', [mid]);
  if (!m) throw nonTrouve('Marché');
  m.enseignants = await requete(
    `SELECT e.id, e.matricule, e.nom, e.prenoms, e.telephone, e.actif FROM enseignant_marches em
     JOIN enseignants e ON e.id = em.enseignant_id WHERE em.marche_id = ? ORDER BY e.nom`, [mid]);
  m.domiciles = await requete(
    `SELECT d.id, d.code, d.commune, d.quartier, d.actif, CONCAT(p.nom, ' ', p.prenoms) AS parent
     FROM domiciles d JOIN parents p ON p.id = d.parent_id WHERE d.marche_id = ? ORDER BY d.code`, [mid]);
  [m.statistiques] = await requete(
    `SELECT COUNT(*) AS seances,
       SUM(s.arrivee_reelle IS NOT NULL) AS presences,
       SUM(s.statut_arrivee IN ('retard_en_attente','retard_justifie','retard_non_justifie')) AS retards,
       SUM(s.statut = 'absence_presumee') AS absences,
       COALESCE(SUM(s.duree_effective_minutes), 0) AS minutes_effectives
     FROM seances s JOIN domiciles d ON d.id = s.domicile_id
     WHERE d.marche_id = ? AND s.debut_prevu <= UTC_TIMESTAMP() AND s.statut <> 'annulee'
       AND s.date_seance >= CURDATE() - INTERVAL 30 DAY`, [mid]);
  res.json(m);
});

r.post('/', exiger('marches.gerer'), async (req, res) => {
  const d = valider(schema, req.body);
  const [x] = await pool.query('INSERT INTO marches (code, nom, description) VALUES (?,?,?)', [d.code, d.nom, d.description]);
  await auditer(req, 'creation_marche', 'marche', x.insertId, null, d);
  res.status(201).json({ id: x.insertId, ...d });
});

r.put('/:id', exiger('marches.gerer'), async (req, res) => {
  const mid = valider(id, req.params.id);
  const d = valider(schema, req.body);
  const avant = await uneLigne('SELECT * FROM marches WHERE id = ?', [mid]);
  if (!avant) throw nonTrouve('Marché');
  await requete('UPDATE marches SET code = ?, nom = ?, description = ? WHERE id = ?', [d.code, d.nom, d.description, mid]);
  await auditer(req, 'modification_marche', 'marche', mid, avant, d);
  res.json({ id: mid, ...d });
});

r.patch('/:id/statut', exiger('marches.gerer'), async (req, res) => {
  const mid = valider(id, req.params.id);
  const { actif } = valider(z.object({ actif: booleen }), req.body);
  await requete('UPDATE marches SET actif = ? WHERE id = ?', [actif, mid]);
  await auditer(req, actif ? 'activation_marche' : 'desactivation_marche', 'marche', mid, null, { actif });
  res.json({ message: actif ? 'Marché activé' : 'Marché désactivé' });
});

export default r;
