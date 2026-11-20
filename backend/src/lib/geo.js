/** Distance en mètres entre deux points GPS (formule de haversine). */
export function distanceMetres(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Évalue la position du téléphone par rapport au domicile.
 * Ne prétend pas détecter toutes les fraudes : une position falsifiée reste possible.
 */
export function evaluerPosition({ position, domicile, rayonDefaut, precisionMax }) {
  if (domicile.latitude == null || domicile.longitude == null) {
    return { statut: 'non_verifiable', message: "Les coordonnées GPS du domicile ne sont pas renseignées" };
  }
  if (!position || position.erreur) {
    const refuse = position?.erreur === 'refuse';
    return {
      statut: refuse ? 'refuse' : 'indisponible',
      message: refuse ? "L'accès à la position a été refusé sur le téléphone" : 'Position GPS indisponible',
    };
  }
  const distance = distanceMetres(position.latitude, position.longitude, Number(domicile.latitude), Number(domicile.longitude));
  const rayon = domicile.rayon_tolerance_m ?? rayonDefaut;
  const res = { distance: Math.round(distance * 10) / 10, rayon, precision: position.precision ?? null };
  if (position.precision == null || position.precision > precisionMax) {
    return { ...res, statut: 'imprecis', message: `Précision GPS insuffisante (${position.precision ?? '?'} m, maximum ${precisionMax} m)` };
  }
  if (distance > rayon) {
    return { ...res, statut: 'hors_zone', message: `Position à ${Math.round(distance)} m du domicile (tolérance ${rayon} m)` };
  }
  return { ...res, statut: 'conforme', message: `Position conforme (${Math.round(distance)} m du domicile)` };
}
