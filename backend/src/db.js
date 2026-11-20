import mysql from 'mysql2/promise';
import { config } from './config.js';

export const pool = mysql.createPool({
  ...config.db,
  timezone: 'Z',
  dateStrings: ['DATE'],
  connectionLimit: 10,
  charset: 'utf8mb4',
  decimalNumbers: true,
});

pool.on('connection', (conn) => conn.query("SET time_zone = '+00:00'"));

export async function requete(sql, params = []) {
  const [lignes] = await pool.query(sql, params);
  return lignes;
}

export async function uneLigne(sql, params = []) {
  const lignes = await requete(sql, params);
  return lignes[0] || null;
}

/** Exécute fn(conn) dans une transaction. */
export async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const r = await fn(conn);
    await conn.commit();
    return r;
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}
