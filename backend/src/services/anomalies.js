import { maintenant } from '../lib/horloge.js';

export const LIBELLES_ANOMALIES = {
  retard_justifie: 'Retard justifié',
  retard_non_justifie: 'Retard non justifié',
  arrivee_anticipee: 'Arrivée anticipée',
  depart_anticipe: 'Départ anticipé',
  absence_presumee: 'Absence présumée',
  depart_non_pointe: 'Aucun pointage de départ',
  qr_invalide: 'QR Code invalide',
  enseignant_non_affecte: 'Enseignant non affecté au domicile',
  gps_non_conforme: 'Position GPS non conforme',
  double_pointage: 'Tentative de double pointage',
  hors_planning: 'Pointage hors planning',
  identite_non_conforme: 'Identité non conforme',
};

/** Crée une anomalie. La clé de dédoublonnage évite de répéter la même anomalie. */
export async function creerAnomalie(conn, a) {
  const [r] = await conn.query(
    `INSERT IGNORE INTO anomalies (type, gravite, description, seance_id, pointage_id, enseignant_id, domicile_id, cle_dedoublonnage, cree_le)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [a.type, a.gravite || 'moyenne', a.description.slice(0, 500), a.seance_id ?? null, a.pointage_id ?? null,
      a.enseignant_id ?? null, a.domicile_id ?? null, a.cle ?? null, maintenant()],
  );
  return r.insertId || null;
}
