import { pool, transaction } from '../db.js';
import { ajouterJours, dateLocale, ecartJours, jourSemaine, maintenant, versInstant, ajouterMinutes } from '../lib/horloge.js';
import { lireParametres } from '../lib/parametres.js';
import { creerAnomalie } from './anomalies.js';

const HORIZON_JOURS = 14;

export function premiereOccurrence(c) {
  let d = c.date_debut;
  for (let i = 0; i < 7 && jourSemaine(d) !== c.jour_semaine; i++) d = ajouterJours(d, 1);
  return d;
}

/** Le créneau a-t-il lieu à cette date ? */
export function creneauALieu(c, date) {
  if (date < c.date_debut || (c.date_fin && date > c.date_fin)) return false;
  if (jourSemaine(date) !== c.jour_semaine) return false;
  const premiere = premiereOccurrence(c);
  if (c.frequence === 'ponctuelle') return date === premiere;
  if (c.frequence === 'quinzaine') return ecartJours(premiere, date) % 14 === 0;
  return true;
}

const SQL_CRENEAUX_ACTIFS = `
  SELECT c.*, a.enseignant_id, a.domicile_id, a.date_debut AS aff_debut, a.date_fin AS aff_fin
  FROM creneaux c
  JOIN affectations a ON a.id = c.affectation_id AND a.actif = 1
  JOIN enseignants e ON e.id = a.enseignant_id AND e.actif = 1
  JOIN domiciles d ON d.id = a.domicile_id AND d.actif = 1
  WHERE c.actif = 1 AND c.date_debut <= ? AND (c.date_fin IS NULL OR c.date_fin >= ?)`;

function occurrenceValide(c, date) {
  return creneauALieu(c, date) && date >= c.aff_debut && (!c.aff_fin || date <= c.aff_fin);
}

/** Crée les séances prévues (occurrences) entre deux dates incluses. Idempotent. */
export async function genererSeances(dateDebut, dateFin, conn = pool, creneauId = null) {
  let sql = SQL_CRENEAUX_ACTIFS;
  const params = [dateFin, dateDebut];
  if (creneauId) { sql += ' AND c.id = ?'; params.push(creneauId); }
  const [creneaux] = await conn.query(sql, params);
  const valeurs = [];
  for (let d = dateDebut; d <= dateFin; d = ajouterJours(d, 1)) {
    for (const c of creneaux) {
      if (!occurrenceValide(c, d)) continue;
      valeurs.push([c.id, c.affectation_id, c.enseignant_id, c.domicile_id, d,
        versInstant(d, c.heure_debut), versInstant(d, c.heure_fin)]);
    }
  }
  if (valeurs.length) {
    await conn.query(
      `INSERT IGNORE INTO seances (creneau_id, affectation_id, enseignant_id, domicile_id, date_seance, debut_prevu, fin_prevue) VALUES ?`,
      [valeurs],
    );
  }
  return valeurs.length;
}

/**
 * Après modification d'un créneau ou d'une affectation : met à jour les séances futures non commencées.
 * Les séances ayant un historique ne sont jamais supprimées (elles sont annulées).
 */
export async function resynchroniserCreneaux(conn, creneauIds) {
  const t = maintenant();
  const aujourdHui = dateLocale(t);
  for (const cid of creneauIds) {
    const [[c]] = await conn.query(SQL_CRENEAUX_ACTIFS.replace('WHERE c.actif = 1 AND', 'WHERE') + ' AND c.id = ?', ['9999-12-31', '1000-01-01', cid]);
    const [futures] = await conn.query(
      `SELECT s.id, s.date_seance,
         (EXISTS(SELECT 1 FROM pointages p WHERE p.seance_id = s.id)
          OR EXISTS(SELECT 1 FROM anomalies x WHERE x.seance_id = s.id)
          OR EXISTS(SELECT 1 FROM justifications j WHERE j.seance_id = s.id)
          OR EXISTS(SELECT 1 FROM observations o WHERE o.seance_id = s.id)) AS reference
       FROM seances s WHERE s.creneau_id = ? AND s.statut = 'prevue' AND s.debut_prevu > ?`,
      [cid, t],
    );
    const actifComplet = c && c.actif === 1 ? await estActif(conn, c) : false;
    for (const s of futures) {
      if (actifComplet && occurrenceValide(c, s.date_seance)) {
        await conn.query('UPDATE seances SET debut_prevu = ?, fin_prevue = ? WHERE id = ?',
          [versInstant(s.date_seance, c.heure_debut), versInstant(s.date_seance, c.heure_fin), s.id]);
      } else if (s.reference) {
        await conn.query("UPDATE seances SET statut = 'annulee' WHERE id = ?", [s.id]);
      } else {
        await conn.query('DELETE FROM seances WHERE id = ?', [s.id]);
      }
    }
    if (actifComplet) await genererSeances(aujourdHui, ajouterJours(aujourdHui, HORIZON_JOURS), conn, cid);
  }
}

async function estActif(conn, c) {
  const [[r]] = await conn.query(
    `SELECT a.actif AND e.actif AND d.actif AS ok FROM affectations a
     JOIN enseignants e ON e.id = a.enseignant_id JOIN domiciles d ON d.id = a.domicile_id WHERE a.id = ?`, [c.affectation_id]);
  return !!r?.ok;
}

export async function genererHorizon() {
  const j = dateLocale();
  return genererSeances(j, ajouterJours(j, HORIZON_JOURS));
}

/**
 * Tâche périodique : repère les interventions programmées sans arrivée (absence présumée à vérifier)
 * et les séances ouvertes sans départ dans les délais.
 */
export async function traiterEcheances() {
  const p = await lireParametres();
  const t = maintenant();
  let absences = 0;
  let sansDepart = 0;
  await transaction(async (conn) => {
    const [aFermer] = await conn.query(
      `SELECT s.id, s.enseignant_id, s.domicile_id, s.debut_prevu FROM seances s
       WHERE s.statut = 'prevue' AND s.debut_prevu < ? FOR UPDATE`,
      [ajouterMinutes(t, -p.fermeture_pointage_minutes)],
    );
    for (const s of aFermer) {
      await conn.query("UPDATE seances SET statut = 'absence_presumee', statut_absence = 'a_verifier' WHERE id = ? AND statut = 'prevue'", [s.id]);
      await creerAnomalie(conn, {
        type: 'absence_presumee', gravite: 'elevee', seance_id: s.id, enseignant_id: s.enseignant_id, domicile_id: s.domicile_id,
        description: "Intervention programmée sans arrivée enregistrée — absence présumée à vérifier", cle: `absence-${s.id}`,
      });
      absences++;
    }
    const [ouvertes] = await conn.query(
      `SELECT id, enseignant_id, domicile_id, fin_prevue, arrivee_reelle FROM seances WHERE statut = 'en_cours' FOR UPDATE`);
    for (const s of ouvertes) {
      const limite = new Date(Math.min(
        ajouterMinutes(s.fin_prevue, p.fermeture_depart_minutes).getTime(),
        ajouterMinutes(s.arrivee_reelle, p.duree_max_seance_minutes).getTime(),
      ));
      if (t <= limite) continue;
      await conn.query("UPDATE seances SET statut = 'depart_non_pointe' WHERE id = ? AND statut = 'en_cours'", [s.id]);
      await creerAnomalie(conn, {
        type: 'depart_non_pointe', gravite: 'moyenne', seance_id: s.id, enseignant_id: s.enseignant_id, domicile_id: s.domicile_id,
        description: "Séance ouverte sans pointage de départ dans le délai autorisé", cle: `sansdepart-${s.id}`,
      });
      sansDepart++;
    }
  });
  return { absences, sansDepart };
}
