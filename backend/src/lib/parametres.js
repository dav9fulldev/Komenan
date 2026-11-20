import { requete } from '../db.js';

export const DEFINITIONS_PARAMETRES = {
  tolerance_retard_minutes: { libelle: 'Tolérance de retard (minutes)', min: 0, max: 120 },
  ouverture_pointage_minutes: { libelle: "Ouverture du pointage avant l'heure de début (minutes)", min: 0, max: 120 },
  fermeture_pointage_minutes: { libelle: "Fermeture du pointage d'arrivée après l'heure de début (minutes)", min: 5, max: 240 },
  depart_anticipe_seuil_minutes: { libelle: "Départ anticipé : seuil avant l'heure de fin (minutes)", min: 0, max: 120 },
  justification_depart_anticipe_obligatoire: { libelle: 'Justification obligatoire en cas de départ anticipé (1 = oui, 0 = non)', min: 0, max: 1 },
  delai_min_avant_depart_minutes: { libelle: "Délai minimum entre l'arrivée et le départ (minutes)", min: 0, max: 120 },
  fermeture_depart_minutes: { libelle: "Délai après l'heure de fin pour pointer le départ (minutes)", min: 5, max: 480 },
  duree_max_seance_minutes: { libelle: "Durée maximale autorisée d'une séance (minutes)", min: 30, max: 720 },
  rayon_gps_metres: { libelle: 'Rayon de tolérance autour du domicile (mètres)', min: 20, max: 5000 },
  precision_gps_max_metres: { libelle: 'Précision GPS minimale exigée (mètres)', min: 10, max: 5000 },
  gps_bloquant: { libelle: 'Refuser le pointage si la position est non conforme (1 = oui, 0 = enregistrer une anomalie)', min: 0, max: 1 },
  delai_trajet_minutes: { libelle: 'Temps de trajet minimum entre deux domiciles différents (minutes)', min: 0, max: 240 },
};

export async function lireParametres(conn) {
  const exec = conn ? (s) => conn.query(s).then((r) => r[0]) : requete;
  const lignes = await exec('SELECT cle, valeur FROM parametres');
  const p = {};
  for (const l of lignes) p[l.cle] = Number(l.valeur);
  return p;
}
