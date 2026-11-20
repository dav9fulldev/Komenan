// Formatage des dates et heures dans le fuseau de la structure (Abidjan).
const FUSEAU = 'Africa/Abidjan';
const f = (opts) => new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, ...opts });
const fDate = f({ day: '2-digit', month: '2-digit', year: 'numeric' });
const fHeure = f({ hour: '2-digit', minute: '2-digit' });
const fDateHeure = f({ day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fJour = f({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const enDate = (v) => (v instanceof Date ? v : new Date(v));
export const date = (v) => (v ? (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('/') : fDate.format(enDate(v))) : '—');
export const heure = (v) => (v ? fHeure.format(enDate(v)) : '—');
export const dateHeure = (v) => (v ? fDateHeure.format(enDate(v)) : '—');
export const jourLong = (v) => fJour.format(enDate(v));
export const duree = (min) => (min == null ? '—' : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`);
export const telephone = (t) => (t ? t.replace(/^\+225(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, '$1 $2 $3 $4 $5') : '—');

export function aujourdhui() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSEAU }).format(new Date());
}
export function decalerJours(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const JOURS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
export const FREQUENCES = { hebdomadaire: 'Chaque semaine', quinzaine: 'Une semaine sur deux', ponctuelle: 'Séance unique' };

export const STATUTS_SEANCE = {
  prevue: { libelle: 'Prévue', ton: 'neutre' },
  en_cours: { libelle: 'En cours', ton: 'bleu' },
  terminee: { libelle: 'Terminée', ton: 'vert' },
  absence_presumee: { libelle: 'Absence présumée', ton: 'rouge' },
  depart_non_pointe: { libelle: 'Départ non pointé', ton: 'orange' },
  annulee: { libelle: 'Annulée', ton: 'neutre' },
};
export const STATUTS_ARRIVEE = {
  a_l_heure: { libelle: "À l'heure", ton: 'vert' },
  retard_en_attente: { libelle: 'Retard à examiner', ton: 'orange' },
  retard_justifie: { libelle: 'Retard justifié', ton: 'orange' },
  retard_non_justifie: { libelle: 'Retard non justifié', ton: 'rouge' },
};
export const STATUTS_ABSENCE = {
  a_verifier: { libelle: 'À vérifier', ton: 'orange' },
  confirmee: { libelle: 'Absence confirmée', ton: 'rouge' },
  justifiee: { libelle: 'Absence justifiée', ton: 'neutre' },
};
export const STATUTS_ANOMALIE = {
  a_examiner: { libelle: 'À examiner', ton: 'rouge' },
  en_cours: { libelle: "En cours d'examen", ton: 'orange' },
  traitee: { libelle: 'Traitée', ton: 'vert' },
  classee: { libelle: 'Classée sans suite', ton: 'neutre' },
};
export const GRAVITES = {
  info: { libelle: 'Information', ton: 'neutre' },
  moyenne: { libelle: 'Moyenne', ton: 'orange' },
  elevee: { libelle: 'Élevée', ton: 'rouge' },
};
export const STATUTS_JUSTIFICATION = {
  en_attente: { libelle: 'En attente', ton: 'orange' },
  acceptee: { libelle: 'Acceptée', ton: 'vert' },
  refusee: { libelle: 'Refusée', ton: 'rouge' },
};
export const TYPES_JUSTIFICATION = { retard: 'Retard', depart_anticipe: 'Départ anticipé', absence: 'Absence' };
export const TYPES_OBSERVATION = {
  observation: 'Observation', demande_precision: 'Demande de précision', signalement: 'Signalement', reponse: 'Réponse',
};
export const STATUTS_GPS = {
  conforme: 'Conforme', hors_zone: 'Hors zone', imprecis: 'Imprécis', indisponible: 'Indisponible', refuse: 'Refusé par le téléphone', non_verifiable: 'Non vérifiable (domicile sans coordonnées)',
};
export const MOTIFS_REJET = {
  qr_inconnu: 'QR Code inconnu', qr_revoque: 'QR Code révoqué', domicile_inactif: 'Domicile désactivé', telephone_inconnu: 'Numéro inconnu',
  identite_non_conforme: 'Nom non conforme', enseignant_inactif: 'Enseignant désactivé', non_affecte: 'Non affecté au domicile',
  arrivee_anticipee: 'Arrivée anticipée', double_pointage: 'Double pointage', fenetre_fermee: 'Fenêtre de pointage fermée',
  hors_planning: 'Hors planning', gps_non_conforme: 'GPS non conforme', seance_ouverte_ailleurs: 'Séance ouverte ailleurs',
};
