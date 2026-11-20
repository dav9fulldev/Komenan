import { Router } from 'express';
import { z } from 'zod';
import { requete, transaction } from '../db.js';
import { valider, id, txtOpt } from '../lib/validation.js';
import { exiger } from '../middleware/auth.js';
import { auditer } from '../lib/audit.js';
import { ErreurMetier, nonTrouve } from '../lib/erreurs.js';

const r = Router();

r.get('/', exiger('justifications.voir'), async (req, res) => {
  const where = ['1=1'];
  const params = [];
  if (req.query.statut) { where.push('j.statut = ?'); params.push(req.query.statut); }
  if (req.query.type) { where.push('j.type = ?'); params.push(req.query.type); }
  res.json(await requete(
    `SELECT j.*, s.date_seance, s.debut_prevu, s.fin_prevue, s.arrivee_reelle, s.depart_reel, s.retard_minutes, s.depart_anticipe_minutes,
       CONCAT(e.nom, ' ', e.prenoms) AS enseignant, e.telephone, d.code AS domicile_code, m.nom AS marche,
       CONCAT(u.prenoms, ' ', u.nom) AS decideur
     FROM justifications j JOIN seances s ON s.id = j.seance_id JOIN enseignants e ON e.id = s.enseignant_id
     JOIN domiciles d ON d.id = s.domicile_id JOIN marches m ON m.id = d.marche_id
     LEFT JOIN utilisateurs u ON u.id = j.decision_par
     WHERE ${where.join(' AND ')} ORDER BY j.statut = 'en_attente' DESC, j.cree_le DESC LIMIT 500`, params));
});

r.post('/:id/decision', exiger('justifications.decider'), async (req, res) => {
  const jid = valider(id, req.params.id);
  const d = valider(z.object({
    decision: z.enum(['acceptee', 'refusee'], { error: 'Décision invalide' }),
    commentaire: txtOpt(1000),
  }), req.body);
  if (d.decision === 'refusee' && !d.commentaire) throw new ErreurMetier(400, 'Un commentaire est obligatoire pour refuser une justification');
  await transaction(async (conn) => {
    const [[j]] = await conn.query('SELECT * FROM justifications WHERE id = ? FOR UPDATE', [jid]);
    if (!j) throw nonTrouve('Justification');
    if (j.statut !== 'en_attente') throw new ErreurMetier(409, 'Cette justification a déjà été examinée');
    await conn.query('UPDATE justifications SET statut = ?, decision_par = ?, decision_le = UTC_TIMESTAMP(), commentaire_decision = ? WHERE id = ?',
      [d.decision, req.utilisateur.id, d.commentaire, jid]);
    if (j.type === 'retard') {
      // Le retard constaté (retard_minutes) n'est jamais effacé : seule sa qualification change.
      await conn.query('UPDATE seances SET statut_arrivee = ? WHERE id = ?',
        [d.decision === 'acceptee' ? 'retard_justifie' : 'retard_non_justifie', j.seance_id]);
      await conn.query(
        `UPDATE anomalies SET type = ?, statut = 'traitee', traitee_par = ?, traitee_le = UTC_TIMESTAMP(),
           conclusion = ?, description = REPLACE(description, 'justification en attente d''examen', ?)
         WHERE seance_id = ? AND type IN ('retard_non_justifie','retard_justifie')`,
        [d.decision === 'acceptee' ? 'retard_justifie' : 'retard_non_justifie', req.utilisateur.id,
          d.commentaire || (d.decision === 'acceptee' ? 'Justification acceptée' : 'Justification refusée'),
          d.decision === 'acceptee' ? 'justification acceptée' : 'justification refusée', j.seance_id]);
    } else {
      await conn.query(
        "UPDATE anomalies SET statut = 'traitee', traitee_par = ?, traitee_le = UTC_TIMESTAMP(), conclusion = ? WHERE seance_id = ? AND type = 'depart_anticipe'",
        [req.utilisateur.id, `Justification ${d.decision}${d.commentaire ? ' : ' + d.commentaire : ''}`, j.seance_id]);
    }
    await auditer(req, 'decision_justification', 'justification', jid, { statut: j.statut }, d, conn);
  });
  res.json({ message: d.decision === 'acceptee' ? 'Justification acceptée' : 'Justification refusée' });
});

export default r;
