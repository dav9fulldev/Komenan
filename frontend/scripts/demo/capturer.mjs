// Capture de l'instantané utilisé par la démonstration statique (GitHub Pages).
// Interroge un serveur lancé sur la base « presences_vitrine » (données DÉMO fictives)
// et enregistre toutes les réponses GET dont l'interface a besoin.
//
// Usage : node scripts/demo/capturer.mjs [http://localhost:4100]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
const SORTIE = path.resolve(ici, '../../demo-statique');
const BASE = (process.argv[2] || 'http://localhost:4100').replace(/\/$/, '');
const MDP = 'DemoPresences2026';

fs.rmSync(path.join(SORTIE, 'exports'), { recursive: true, force: true });
fs.mkdirSync(path.join(SORTIE, 'exports'), { recursive: true });

// --- Client HTTP minimal (cookie de session géré à la main) ---
const NAVIGATEURS = {
  bureau: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
  mobile: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36',
};

function client(navigateur = NAVIGATEURS.bureau) {
  let cookie = '';
  async function appel(methode, url, corps, binaire = false) {
    const r = await fetch(BASE + '/api' + url, {
      method: methode,
      headers: { 'user-agent': navigateur, ...(cookie ? { cookie } : {}), ...(corps ? { 'content-type': 'application/json' } : {}) },
      body: corps ? JSON.stringify(corps) : undefined,
    });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    if (binaire) return { statut: r.status, octets: Buffer.from(await r.arrayBuffer()) };
    const texte = await r.text();
    let donnees = null;
    try { donnees = JSON.parse(texte); } catch { /* vide */ }
    if (!r.ok) throw new Error(`${methode} ${url} → ${r.status} ${texte.slice(0, 200)}`);
    return donnees;
  }
  return { get: (u) => appel('GET', u), post: (u, c = {}) => appel('POST', u, c), patch: (u, c) => appel('PATCH', u, c), binaire: (u) => appel('GET', u, null, true) };
}

/** Clé normalisée : paramètres triés, valeurs vides et paramètres techniques retirés. */
export function cle(url) {
  const [chemin, qs = ''] = url.split('?');
  const p = new URLSearchParams(qs);
  const garde = [...p.entries()].filter(([k, v]) => v !== '' && k !== '_' && k !== 'v').sort(([a], [b]) => a.localeCompare(b));
  return garde.length ? `${chemin}?${new URLSearchParams(garde)}` : chemin;
}

const admin = client();
const instantane = { meta: {}, get: {}, comptes: {} };
const prendre = async (url, c = admin) => { instantane.get[cle(url)] = await c.get(url); return instantane.get[cle(url)]; };

// --- Connexions (dont une tentative échouée, pour le journal des connexions) ---
await client(NAVIGATEURS.mobile).post('/auth/connexion', { email: 'superviseur@demo.local', mot_de_passe: 'mauvais-mot-de-passe' }).catch(() => {});
const sup = client(NAVIGATEURS.mobile);
await sup.post('/auth/connexion', { email: 'superviseur@demo.local', mot_de_passe: MDP });
instantane.comptes['superviseur@demo.local'] = await sup.get('/auth/moi');
await admin.post('/auth/connexion', { email: 'admin@demo.local', mot_de_passe: MDP });

// --- Un peu d'activité réelle, pour alimenter le journal d'audit et les décisions ---
const justifs = await admin.get('/justifications?statut=en_attente');
if (justifs[0]) await admin.post(`/justifications/${justifs[0].id}/decision`, { decision: 'acceptee', commentaire: 'Retard confirmé par le parent (DÉMO).' });
if (justifs[1]) await admin.post(`/justifications/${justifs[1].id}/decision`, { decision: 'refusee', commentaire: 'Motif non confirmé par le parent (DÉMO).' });
const anos = await admin.get('/anomalies?ouvertes=1&taille=50');
const ano = anos.donnees.find((a) => a.type !== 'absence_presumee') || anos.donnees[0];
if (ano) {
  await admin.patch(`/anomalies/${ano.id}/statut`, { statut: 'en_cours' });
  await admin.post(`/anomalies/${ano.id}/observations`, { type: 'observation', texte: 'Appel au parent prévu pour vérifier les faits (DÉMO).' });
}
const terminees = await admin.get('/presences?statut=terminee&taille=5');
if (terminees.donnees[0]) await sup.post(`/presences/${terminees.donnees[0].id}/observations`, { type: 'observation', texte: 'Le parent confirme le bon déroulement du cours (DÉMO).' });

// --- Capture ---
instantane.comptes['admin@demo.local'] = await admin.get('/auth/moi');
const tdb = await prendre('/tableau-de-bord');
const aujourdhui = tdb.date;
const decaler = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const enseignants = await prendre('/enseignants');
for (const a of ['1', '0']) await prendre(`/enseignants?actif=${a}`);
for (const e of enseignants) await prendre(`/enseignants/${e.id}`);
await prendre('/matieres');
const marches = await prendre('/marches');
for (const m of marches) await prendre(`/marches/${m.id}`);
await prendre('/parents');
const domiciles = await prendre('/domiciles');
for (const a of ['', '1', '0']) for (const m of ['', ...marches.map((x) => x.id)]) await prendre(`/domiciles?actif=${a}&marche_id=${m}`);
instantane.jetons = {};
for (const d of domiciles) {
  await prendre(`/domiciles/${d.id}`);
  const qr = await prendre(`/domiciles/${d.id}/qrcode`);
  const jeton = (qr?.url || '').split('/p/')[1];
  if (jeton) instantane.jetons[jeton] = d.id;
}
await prendre('/affectations');
await prendre('/affectations?en_cours=0');
await prendre('/plannings?actif=tous');

// Calendrier : semaines de 4 semaines avant à 2 semaines après l'instant de la démo
const lundi = decaler(aujourdhui, -((new Date(`${aujourdhui}T00:00:00Z`).getUTCDay() + 6) % 7));
for (let s = -4; s <= 2; s++) await prendre(`/plannings/calendrier?debut=${decaler(lundi, 7 * s)}&fin=${decaler(lundi, 7 * s + 6)}`);

const presences = await prendre('/presences?inclure_futures=1&taille=200&debut=2000-01-01&fin=2100-01-01');
for (const s of presences.donnees) await prendre(`/presences/${s.id}`);
const anomalies = await prendre('/anomalies?taille=200');
for (const a of anomalies.donnees) await prendre(`/anomalies/${a.id}`);
await prendre('/anomalies/types');
await prendre('/justifications');

// Rapports : période par défaut de l'écran (30 derniers jours), sans filtre puis par marché et par enseignant
const periode = `debut=${decaler(aujourdhui, -30)}&fin=${aujourdhui}`;
const TYPES = ['presences-enseignants', 'retards', 'absences', 'durees', 'marches'];
for (const t of TYPES) {
  await prendre(`/rapports/${t}?${periode}`);
  for (const m of marches) await prendre(`/rapports/${t}?${periode}&marche_id=${m.id}`);
  for (const e of enseignants) await prendre(`/rapports/${t}?${periode}&enseignant_id=${e.id}`);
  for (const ext of ['pdf', 'xlsx']) {
    const f = await admin.binaire(`/rapports/${t}?${periode}&format=${ext}`);
    if (f.statut !== 200) throw new Error(`Export ${t}.${ext} → ${f.statut}`);
    fs.writeFileSync(path.join(SORTIE, 'exports', `${t}.${ext}`), f.octets);
  }
}

await prendre('/utilisateurs');
await prendre('/utilisateurs/permissions');
await prendre('/utilisateurs/connexions');
await prendre('/audit?taille=200');
await prendre('/audit/actions');
await prendre('/parametres');

const moi = instantane.comptes['admin@demo.local'];
instantane.meta = {
  maintenant: process.env.DEMO_MAINTENANT,
  date: aujourdhui,
  avertissement: 'Données entièrement fictives (DÉMO) générées pour la démonstration statique.',
  admin: moi.email,
};
fs.writeFileSync(path.join(SORTIE, 'instantane.json'), JSON.stringify(instantane));
console.log(`Instantané : ${Object.keys(instantane.get).length} réponses, ${Object.keys(instantane.jetons).length} QR Codes, date ${aujourdhui}`);
console.log(`Taille : ${(fs.statSync(path.join(SORTIE, 'instantane.json')).size / 1024).toFixed(0)} Ko`);
