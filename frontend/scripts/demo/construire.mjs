// Construit la démonstration statique publiée sur GitHub Pages (dossier docs/ du dépôt).
// Prérequis : demo-statique/instantane.json produit par scripts/demo/capturer.mjs.
//
// Usage : npm run build:demo
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const ici = path.dirname(fileURLToPath(import.meta.url));
const front = path.resolve(ici, '../..');
const racine = path.resolve(front, '..');
const sortie = path.join(racine, 'docs');
const BASE = process.env.DEMO_BASE || '/Komenan/';
const source = path.join(front, 'demo-statique');

const instantane = JSON.parse(fs.readFileSync(path.join(source, 'instantane.json'), 'utf8'));

// 1. Interface React en mode démonstration
process.env.VITE_DEMO = '1';
process.env.VITE_DEMO_MAINTENANT = instantane.meta.maintenant;
await build({ root: front, base: BASE, logLevel: 'warn', build: { outDir: sortie, emptyOutDir: true } });

// 2. Données de l'instantané et exports pré-générés
fs.mkdirSync(path.join(sortie, 'demo'), { recursive: true });
fs.copyFileSync(path.join(source, 'instantane.json'), path.join(sortie, 'demo', 'instantane.json'));
fs.cpSync(path.join(source, 'exports'), path.join(sortie, 'demo', 'exports'), { recursive: true });

// 3. Page de pointage mobile (copie de la vraie page + simulation du serveur)
const g = instantane.get;
const extrait = {
  jetons: instantane.jetons,
  enseignants: g['/enseignants'].map(({ id, nom, prenoms, telephone, actif }) => ({ id, nom, prenoms, telephone, actif })),
  affectations: g['/affectations'].map(({ enseignant_id, domicile_id, actif }) => ({ enseignant_id, domicile_id, actif })),
  domiciles: g['/domiciles'].map(({ id }) => {
    const d = g[`/domiciles/${id}`];
    return { id, code: d.code, latitude: Number(d.latitude), longitude: Number(d.longitude), rayon_tolerance_m: d.rayon_tolerance_m };
  }),
};
fs.writeFileSync(path.join(sortie, 'demo', 'pointage.json'), JSON.stringify(extrait));

const pagePointage = path.join(racine, 'backend', 'public', 'pointage');
const ciblePointage = path.join(sortie, 'pointage');
fs.cpSync(pagePointage, ciblePointage, { recursive: true });
let html = fs.readFileSync(path.join(ciblePointage, 'index.html'), 'utf8')
  .replaceAll('/pointage-ressources/', './')
  .replace('<script src="./pointage.js"', '<script src="./pointage-demo.js"></script>\n  <script src="./pointage.js"');
if (!html.includes('pointage-demo.js')) throw new Error("Impossible d'insérer la simulation dans la page de pointage");
fs.writeFileSync(path.join(ciblePointage, 'index.html'), html);
let js = fs.readFileSync(path.join(ciblePointage, 'pointage.js'), 'utf8');
const lecture = "var jeton = (location.pathname.split('/p/')[1] || '')";
if (!js.includes(lecture)) throw new Error('Lecture du jeton introuvable dans pointage.js');
fs.writeFileSync(path.join(ciblePointage, 'pointage.js'), js.replace(lecture, "var jeton = (window.JETON_DEMO || location.pathname.split('/p/')[1] || '')"));
fs.copyFileSync(path.join(ici, 'pointage-demo.js'), path.join(ciblePointage, 'pointage-demo.js'));
fs.appendFileSync(path.join(ciblePointage, 'pointage.css'),
  '\n.note-demo { background: #FFF4D6; color: #6B4E00; border: 1px solid #F4C21B; border-radius: 10px; padding: 10px 12px; font-size: 14px; margin-bottom: 14px; }\n');

// 4. Redirections GitHub Pages : liens des QR Codes (/p/<jeton>) et routes de l'application
fs.writeFileSync(path.join(sortie, '404.html'), `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>KOMENAN FORMATION – Redirection</title>
<script>
  var base = ${JSON.stringify(BASE)};
  var chemin = location.pathname;
  if (chemin.indexOf(base + 'p/') === 0) {
    location.replace(base + 'pointage/#' + chemin.slice((base + 'p/').length));
  } else {
    try { sessionStorage.setItem('redirection_spa', chemin + location.search + location.hash); } catch (e) {}
    location.replace(base);
  }
</script></head><body></body></html>
`);
fs.writeFileSync(path.join(sortie, '.nojekyll'), '');

const taille = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((n, f) => n + (f.isDirectory() ? taille(path.join(d, f.name)) : fs.statSync(path.join(d, f.name)).size), 0);
console.log(`Démonstration construite dans ${path.relative(racine, sortie)}/ (${(taille(sortie) / 1024).toFixed(0)} Ko, instantané du ${instantane.meta.date}, base ${BASE})`);
