/** Normalise un numéro ivoirien au format +225XXXXXXXXXX (10 chiffres). */
export function normaliserTelephone(saisie) {
  if (!saisie) return null;
  let n = String(saisie).replace(/[\s.\-()]/g, '');
  if (n.startsWith('00')) n = '+' + n.slice(2);
  if (n.startsWith('+225')) n = n.slice(4);
  else if (n.startsWith('225') && n.length === 13) n = n.slice(3);
  if (!/^\d{10}$/.test(n)) return null;
  return '+225' + n;
}

export function normaliserNom(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z\s'-]/g, ' ').replace(/[-']/g, ' ')
    .split(/\s+/).filter(Boolean);
}

/**
 * Compare le nom saisi à l'identité enregistrée.
 * Conforme si le nom de famille complet est présent et au moins un prénom,
 * sans mot étranger à l'identité enregistrée (ordre indifférent, accents ignorés).
 */
export function identiteConforme(saisie, nom, prenoms) {
  const mots = normaliserNom(saisie);
  const motsNom = normaliserNom(nom);
  const motsPrenoms = normaliserNom(prenoms);
  if (mots.length < 2) return false;
  const connus = new Set([...motsNom, ...motsPrenoms]);
  if (!mots.every((m) => connus.has(m))) return false;
  if (!motsNom.every((m) => mots.includes(m))) return false;
  return motsPrenoms.some((m) => mots.includes(m));
}
