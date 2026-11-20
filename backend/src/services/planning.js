import { ajouterJours, jourSemaine } from '../lib/horloge.js';
import { creneauALieu } from './seances.js';

const enMinutes = (h) => { const [a, b] = String(h).split(':').map(Number); return a * 60 + b; };

/** Première date commune où deux créneaux ont lieu (ou null). */
function dateCommune(a, b) {
  if (a.jour_semaine !== b.jour_semaine) return null;
  const debut = a.date_debut > b.date_debut ? a.date_debut : b.date_debut;
  const finA = a.date_fin || '9999-12-31';
  const finB = b.date_fin || '9999-12-31';
  const fin = finA < finB ? finA : finB;
  if (debut > fin) return null;
  let d = debut;
  while (jourSemaine(d) !== a.jour_semaine) d = ajouterJours(d, 1);
  // Deux fréquences au plus quinzaine : 3 semaines suffisent pour trouver une date commune.
  for (let i = 0; i < 3 && d <= fin; i++, d = ajouterJours(d, 7)) {
    if (creneauALieu(a, d) && creneauALieu(b, d)) return d;
  }
  return null;
}

/**
 * Détecte les créneaux incompatibles pour un même enseignant :
 * chevauchement horaire, ou temps de trajet insuffisant entre deux domiciles différents.
 */
export async function chercherConflits(conn, nouveau, delaiTrajet) {
  const [autres] = await conn.query(
    `SELECT c.*, a.domicile_id, d.code AS domicile_code
     FROM creneaux c JOIN affectations a ON a.id = c.affectation_id JOIN domiciles d ON d.id = a.domicile_id
     WHERE a.enseignant_id = ? AND c.actif = 1 AND a.actif = 1 AND c.jour_semaine = ? AND c.id <> ?`,
    [nouveau.enseignant_id, nouveau.jour_semaine, nouveau.id || 0],
  );
  const conflits = [];
  const nd = enMinutes(nouveau.heure_debut);
  const nf = enMinutes(nouveau.heure_fin);
  for (const c of autres) {
    const date = dateCommune(nouveau, c);
    if (!date) continue;
    const marge = c.domicile_id === nouveau.domicile_id ? 0 : delaiTrajet;
    const cd = enMinutes(c.heure_debut);
    const cf = enMinutes(c.heure_fin);
    if (nd < cf + marge && cd < nf + marge) {
      const chevauche = nd < cf && cd < nf;
      conflits.push({
        creneau_id: c.id,
        date,
        message: chevauche
          ? `Chevauchement avec le créneau ${String(c.heure_debut).slice(0, 5)}–${String(c.heure_fin).slice(0, 5)} au domicile ${c.domicile_code} (à partir du ${date})`
          : `Temps de trajet insuffisant (${delaiTrajet} min exigées) avec le créneau ${String(c.heure_debut).slice(0, 5)}–${String(c.heure_fin).slice(0, 5)} au domicile ${c.domicile_code}`,
      });
    }
  }
  return conflits;
}
