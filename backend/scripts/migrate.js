import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from '../src/config.js';

const dossier = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export async function migrer({ silencieux = false } = {}) {
  const conn = await mysql.createConnection({ ...config.db, multipleStatements: true, timezone: 'Z' });
  try {
    await conn.query("SET time_zone = '+00:00'");
    await conn.query('CREATE TABLE IF NOT EXISTS schema_migrations (nom VARCHAR(190) PRIMARY KEY, appliquee_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    const [faites] = await conn.query('SELECT nom FROM schema_migrations');
    const deja = new Set(faites.map((f) => f.nom));
    for (const f of fs.readdirSync(dossier).filter((x) => x.endsWith('.sql')).sort()) {
      if (deja.has(f)) continue;
      if (!silencieux) console.log(`→ Application de ${f}`);
      await conn.query(fs.readFileSync(path.join(dossier, f), 'utf8'));
      await conn.query('INSERT INTO schema_migrations (nom) VALUES (?)', [f]);
    }
    if (!silencieux) console.log('Base de données à jour.');
  } finally {
    await conn.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrer().catch((e) => { console.error(e.message); process.exit(1); });
}
