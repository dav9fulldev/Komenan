import { Router } from 'express';
import { requete } from '../db.js';
import { exiger } from '../middleware/auth.js';
import { dateLocale } from '../lib/horloge.js';
import { traiterEcheances } from '../services/seances.js';
import { SELECT_SEANCE } from './presences.js';

const r = Router();

r.get('/', exiger('tableau_de_bord.voir'), async (req, res) => {
  await traiterEcheances();
  const jour = dateLocale();
  const [ind] = await requete(
    `SELECT
       (SELECT COUNT(*) FROM enseignants WHERE actif = 1) AS enseignants_actifs,
       (SELECT COUNT(*) FROM seances WHERE date_seance = ? AND statut <> 'annulee') AS cours_programmes,
       (SELECT COUNT(*) FROM seances WHERE date_seance = ? AND arrivee_reelle IS NOT NULL) AS presences,
       (SELECT COUNT(*) FROM seances WHERE statut = 'en_cours') AS seances_en_cours,
       (SELECT COUNT(*) FROM seances WHERE date_seance = ? AND statut_arrivee IN ('retard_en_attente','retard_justifie','retard_non_justifie')) AS retards,
       (SELECT COUNT(*) FROM seances WHERE date_seance = ? AND statut = 'absence_presumee') AS absences_presumees,
       (SELECT COUNT(*) FROM seances WHERE statut = 'absence_presumee' AND statut_absence = 'a_verifier') AS absences_a_verifier,
       (SELECT COUNT(*) FROM anomalies WHERE statut IN ('a_examiner','en_cours')) AS anomalies_a_examiner,
       (SELECT COUNT(*) FROM justifications WHERE statut = 'en_attente') AS justifications_en_attente`,
    [jour, jour, jour, jour]);
  const liste = (where, ordre, n = 8) => requete(`${SELECT_SEANCE} WHERE ${where} ORDER BY ${ordre} LIMIT ${n}`);
  const [dernieresPresences, derniersDeparts, retardsRecents, sansPointage] = await Promise.all([
    liste('s.arrivee_reelle IS NOT NULL', 's.arrivee_reelle DESC'),
    liste('s.depart_reel IS NOT NULL', 's.depart_reel DESC'),
    liste("s.statut_arrivee IN ('retard_en_attente','retard_justifie','retard_non_justifie')", 's.arrivee_reelle DESC'),
    liste("(s.statut = 'absence_presumee' AND s.statut_absence = 'a_verifier') OR (s.statut = 'prevue' AND s.debut_prevu < UTC_TIMESTAMP())", 's.debut_prevu DESC'),
  ]);
  const justifications = await requete(
    `SELECT j.id, j.type, j.texte, j.cree_le, s.retard_minutes, s.depart_anticipe_minutes, CONCAT(e.nom, ' ', e.prenoms) AS enseignant, d.code AS domicile_code
     FROM justifications j JOIN seances s ON s.id = j.seance_id JOIN enseignants e ON e.id = s.enseignant_id JOIN domiciles d ON d.id = s.domicile_id
     WHERE j.statut = 'en_attente' ORDER BY j.cree_le DESC LIMIT 8`);
  res.json({ date: jour, indicateurs: ind, dernieresPresences, derniersDeparts, retardsRecents, sansPointage, justifications });
});

export default r;
