import { pool } from '../db.js';

/** Enregistre une action importante dans le journal d'audit (ajout seul). */
export async function auditer(req, action, entite, entiteId, avant = null, apres = null, conn = null) {
  const exec = conn || pool;
  await exec.query(
    'INSERT INTO journal_audit (utilisateur_id, action, entite, entite_id, avant, apres, ip) VALUES (?,?,?,?,?,?,?)',
    [req?.utilisateur?.id ?? null, action, entite, entiteId != null ? String(entiteId) : null,
      avant ? JSON.stringify(avant) : null, apres ? JSON.stringify(apres) : null, req?.ip ?? null],
  );
}
