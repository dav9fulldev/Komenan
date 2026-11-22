// Préchargement réservé à la génération de la démo statique (jamais pour la plateforme réelle).
// Fige l'heure du processus Node ET celle des connexions MySQL sur DEMO_MAINTENANT,
// pour obtenir un instantané cohérent « à telle heure, tel jour ».
import { createRequire } from 'node:module';

const cible = Date.parse(process.env.DEMO_MAINTENANT || '');
if (Number.isNaN(cible)) throw new Error('DEMO_MAINTENANT manquant ou invalide');

const DateReelle = Date;
class DateDemo extends DateReelle {
  constructor(...args) {
    if (args.length === 0) super(cible);
    else super(...args);
  }
  static now() { return cible; }
}
globalThis.Date = DateDemo;

// Horloge MySQL : NOW(), UTC_TIMESTAMP() et CURDATE() renvoient l'heure simulée.
const exiger = createRequire(new URL('../../../backend/package.json', import.meta.url));
const mysql = exiger('mysql2/promise');
const creerPool = mysql.createPool;
mysql.createPool = (...args) => {
  const pool = creerPool(...args);
  pool.pool.on('connection', (c) => c.query(`SET timestamp = ${Math.floor(cible / 1000)}`));
  return pool;
};
