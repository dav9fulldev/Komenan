import { config } from '../config.js';

// Seule source de l'heure pour toute la logique métier : l'heure du serveur.
// En test, ou dans le script de démonstration (variable SIMULATION_DEMO posée par ce script seul),
// l'heure peut être fixée pour rejouer des scénarios. Aucune route de l'API n'y a accès.
let decalageTest = null;

export function maintenant() {
  if (decalageTest !== null) return new Date(decalageTest);
  return new Date();
}

export function fixerHeureTest(date) {
  if (config.env !== 'test' && process.env.SIMULATION_DEMO !== '1') throw new Error("Interdit hors environnement de test");
  decalageTest = date === null ? null : new Date(date).getTime();
}

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: config.fuseau, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function parties(date) {
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return p;
}

/** Date locale (fuseau de la structure) au format AAAA-MM-JJ. */
export function dateLocale(date = maintenant()) {
  const p = parties(date);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Heure locale HH:MM. */
export function heureLocale(date) {
  const p = parties(date);
  return `${p.hour}:${p.minute}`;
}

/** Décalage (ms) du fuseau à un instant donné. */
function decalageFuseau(date) {
  const p = parties(date);
  const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return local - Math.floor(date.getTime() / 1000) * 1000;
}

/** Convertit une date locale (AAAA-MM-JJ) + heure locale (HH:MM[:SS]) en instant UTC. */
export function versInstant(dateStr, heureStr) {
  const [a, m, j] = dateStr.split('-').map(Number);
  const [h, mi, s = 0] = heureStr.split(':').map(Number);
  const naif = Date.UTC(a, m - 1, j, h, mi, s);
  return new Date(naif - decalageFuseau(new Date(naif)));
}

/** Jour ISO de la semaine (1 = lundi ... 7 = dimanche) d'une date AAAA-MM-JJ. */
export function jourSemaine(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export function ajouterJours(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function ecartJours(dateA, dateB) {
  return Math.round((new Date(`${dateB}T00:00:00Z`) - new Date(`${dateA}T00:00:00Z`)) / 86400000);
}

export const minutesEntre = (a, b) => Math.round((b.getTime() - a.getTime()) / 60000);
export const ajouterMinutes = (date, n) => new Date(date.getTime() + n * 60000);
