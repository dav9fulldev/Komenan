export function pagination(q) {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const taille = Math.min(200, Math.max(1, parseInt(q.taille, 10) || 25));
  return { page, taille, limite: taille, decalage: (page - 1) * taille };
}
