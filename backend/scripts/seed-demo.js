/**
 * Données de DÉMONSTRATION entièrement fictives, clairement identifiées (« DÉMO »).
 * Usage : npm run seed:demo   (refuse de s'exécuter si des enseignants existent déjà)
 * L'historique des 14 derniers jours est produit en rejouant le vrai moteur de pointage.
 */
process.env.SIMULATION_DEMO = '1';
const bcrypt = (await import('bcryptjs')).default;
const { pool } = await import('../src/db.js');
const { chiffrer, jetonAleatoire, sha256 } = await import('../src/lib/securite.js');
const { fixerHeureTest, dateLocale, ajouterJours, ajouterMinutes } = await import('../src/lib/horloge.js');
const { genererSeances, traiterEcheances, genererHorizon } = await import('../src/services/seances.js');
const { traiterPointage } = await import('../src/services/pointage.js');

const MDP_DEMO = 'DemoPresences2026';
const q = (sql, p = []) => pool.query(sql, p).then((r) => r[0]);

const [{ n }] = await q('SELECT COUNT(*) AS n FROM enseignants');
if (n > 0 && !process.argv.includes('--forcer')) {
  console.error('La base contient déjà des enseignants : données de démonstration non ajoutées.');
  process.exit(1);
}

// Générateur pseudo-aléatoire déterministe
let graine = 20261120;
const alea = () => { graine = (graine * 1664525 + 1013904223) % 4294967296; return graine / 4294967296; };
const entre = (a, b) => a + Math.floor(alea() * (b - a + 1));

const hash = await bcrypt.hash(MDP_DEMO, 12);
await q(`INSERT IGNORE INTO utilisateurs (nom, prenoms, email, role, mot_de_passe_hash) VALUES
  ('DÉMO', 'Administrateur', 'admin@demo.local', 'admin', ?), ('DÉMO', 'Superviseur', 'superviseur@demo.local', 'superviseur', ?)`, [hash, hash]);
const [{ id: adminId }] = await q("SELECT id FROM utilisateurs WHERE email = 'admin@demo.local'");

for (const m of ['Mathématiques', 'Français', 'Anglais', 'Physique-Chimie', 'SVT']) await q('INSERT IGNORE INTO matieres (libelle) VALUES (?)', [m]);
const matieres = Object.fromEntries((await q('SELECT id, libelle FROM matieres')).map((m) => [m.libelle, m.id]));

const marches = [];
for (const [code, nom] of [['DEMO-COC', 'DÉMO – Cocody'], ['DEMO-YOP', 'DÉMO – Yopougon'], ['DEMO-MAR', 'DÉMO – Marcory']]) {
  const r = await q('INSERT INTO marches (code, nom, description) VALUES (?,?,?)', [code, nom, 'Marché fictif de démonstration']);
  marches.push(r.insertId);
}

const ENSEIGNANTS = [
  ['Awa', '0700000101', ['Mathématiques', 'Physique-Chimie']],
  ['Koffi', '0700000102', ['Français', 'Anglais']],
  ['Mariam', '0700000103', ['Mathématiques', 'SVT']],
  ['Yao', '0700000104', ['Anglais']],
  ['Aminata', '0700000105', ['Physique-Chimie', 'SVT']],
  ['Serge', '0700000106', ['Français']],
];
const ens = [];
for (const [i, [prenom, tel, mats]] of ENSEIGNANTS.entries()) {
  const r = await q("INSERT INTO enseignants (matricule, nom, prenoms, telephone) VALUES (?, 'DEMO', ?, ?)", [`DEMO-ENS-${String(i + 1).padStart(2, '0')}`, prenom, `+225${tel}`]);
  for (const m of mats) await q('INSERT INTO enseignant_matieres VALUES (?,?)', [r.insertId, matieres[m]]);
  ens.push({ id: r.insertId, prenom, tel, mats });
}

// Domiciles fictifs (coordonnées approximatives de quartiers, aucune adresse réelle)
const DOMICILES = [
  [0, 'Cocody', 'Riviera 2', 5.3530, -3.9750], [0, 'Cocody', 'Angré', 5.3940, -3.9890], [0, 'Cocody', 'II Plateaux', 5.3700, -3.9990],
  [1, 'Yopougon', 'Niangon', 5.3290, -4.0870], [1, 'Yopougon', 'Selmer', 5.3460, -4.0700],
  [2, 'Marcory', 'Zone 4', 5.2950, -3.9800], [2, 'Marcory', 'Résidentiel', 5.3030, -3.9900], [2, 'Marcory', 'Biétry', 5.2880, -3.9700],
];
const dom = [];
for (const [i, [mi, commune, quartier, lat, lng]] of DOMICILES.entries()) {
  const p = await q('INSERT INTO parents (nom, prenoms, telephone) VALUES (?,?,?)', ['DÉMO', `Parent ${i + 1}`, `+2250500000${String(i + 1).padStart(3, '0')}`.slice(0, 14)]);
  const d = await q('INSERT INTO domiciles (code, parent_id, marche_id, commune, quartier, adresse, latitude, longitude) VALUES (?,?,?,?,?,?,?,?)',
    [`DEMO-DOM-${String(i + 1).padStart(2, '0')}`, p.insertId, marches[mi], commune, quartier, 'Adresse fictive de démonstration', lat, lng]);
  const jeton = jetonAleatoire(32);
  await q('INSERT INTO qr_codes (domicile_id, jeton_hash, jeton_chiffre, cree_par) VALUES (?,?,?,?)', [d.insertId, sha256(jeton), chiffrer(jeton), adminId]);
  dom.push({ id: d.insertId, marche: marches[mi], lat, lng, jeton });
}

// Affectations et créneaux (sans chevauchement)
const debut = ajouterJours(dateLocale(), -21);
const PLANNING = [
  // enseignant, domicile, matière, [jour, début, fin]...
  [0, 0, 'Mathématiques', [1, '16:00', '18:00'], [4, '16:00', '18:00']],
  [0, 1, 'Physique-Chimie', [3, '14:00', '16:00'], [6, '09:00', '11:00']],
  [1, 3, 'Français', [2, '16:30', '18:30'], [5, '16:30', '18:30']],
  [1, 4, 'Anglais', [3, '10:00', '12:00']],
  [2, 2, 'Mathématiques', [1, '17:00', '19:00'], [3, '15:00', '17:00']],
  [2, 5, 'SVT', [6, '10:00', '12:00']],
  [3, 6, 'Anglais', [2, '17:00', '18:30'], [4, '17:00', '18:30']],
  [4, 7, 'Physique-Chimie', [1, '16:00', '18:00'], [5, '16:00', '18:00']],
  [4, 1, 'SVT', [6, '14:00', '16:00']],
  [5, 0, 'Français', [3, '09:00', '11:00'], [5, '18:30', '20:00']],
];
for (const [ei, di, mat, ...creneaux] of PLANNING) {
  const a = await q('INSERT INTO affectations (enseignant_id, domicile_id, matiere_id, date_debut) VALUES (?,?,?,?)', [ens[ei].id, dom[di].id, matieres[mat], debut]);
  await q('INSERT IGNORE INTO enseignant_marches VALUES (?,?)', [ens[ei].id, dom[di].marche]);
  for (const [j, hd, hf] of creneaux) {
    await q("INSERT INTO creneaux (affectation_id, jour_semaine, heure_debut, heure_fin, frequence, date_debut) VALUES (?,?,?,?, 'hebdomadaire', ?)", [a.insertId, j, hd, hf, debut]);
  }
}

// Historique simulé des 14 derniers jours
const maintenantReel = new Date();
const depuis = ajouterJours(dateLocale(), -14);
await genererSeances(depuis, dateLocale());
const seances = await q(
  `SELECT s.*, e.prenoms, e.telephone, d.latitude, d.longitude FROM seances s JOIN enseignants e ON e.id = s.enseignant_id
   JOIN domiciles d ON d.id = s.domicile_id WHERE s.date_seance >= ? AND s.debut_prevu < ? ORDER BY s.debut_prevu`, [depuis, maintenantReel]);
const jetonDe = (did) => dom.find((d) => d.id === did).jeton;
const pos = (s, ecart = 0.0002) => ({ latitude: Number(s.latitude) + (alea() - 0.5) * ecart, longitude: Number(s.longitude) + (alea() - 0.5) * ecart, precision: entre(8, 40) });
const identite = (s) => ({ telephone: s.telephone.replace('+225', ''), nom: `${s.prenoms} DEMO` });
const RAISONS_RETARD = ['Embouteillage important au carrefour de la Riviera', 'Panne de gbaka sur le trajet', 'Pluie forte, circulation bloquée', 'Cours précédent terminé en retard'];
const RAISONS_DEPART = ["Le parent a demandé d'écourter la séance", "L'élève était souffrant", 'Urgence familiale signalée au parent'];

async function a(heure, s, extra = {}) {
  if (heure > maintenantReel) return null;
  fixerHeureTest(heure);
  return traiterPointage({ jeton: jetonDe(s.domicile_id), ...identite(s), position: pos(s), ip: '127.0.0.1', userAgent: 'Simulation DÉMO', ...extra });
}

// Chaque scan est planifié puis rejoué dans l'ordre chronologique réel.
const evenements = [];
const planifier = (t, fn) => evenements.push({ t, fn });
// Répartition fixe et variée des scénarios (cycles de longueurs différentes)
const ARRIVEES = [0.5, 0.5, 0.1, 0.5, 0.22, 0.5, 0.27, 0.5, 0.05, 0.15, 0.5, 0.5];
const DEPARTS = [0.5, 0.1, 0.5, 0.5, 0.5, 0.03, 0.5, 0.5, 0.12, 0.5, 0.5];
let compte = 0;
for (const [i, s] of seances.entries()) {
  const r = ARRIVEES[i % ARRIVEES.length];
  const debutS = new Date(s.debut_prevu);
  const finS = new Date(s.fin_prevue);
  compte++;
  if (r < 0.08) continue; // absence : aucun scan
  if (r < 0.20) {
    // retard avec justification
    const t1 = ajouterMinutes(debutS, entre(14, 40));
    planifier(t1, async () => {
      const r1 = await a(t1, s);
      if (r1?.statut === 'justification_requise') await a(ajouterMinutes(t1, 1), s, { confirmation: r1.confirmation, justification: RAISONS_RETARD[entre(0, 3)] });
    });
  } else if (r < 0.25) {
    // arrivée anticipée puis arrivée à l'heure
    planifier(ajouterMinutes(debutS, -40), () => a(ajouterMinutes(debutS, -40), s));
    planifier(ajouterMinutes(debutS, -5), () => a(ajouterMinutes(debutS, -5), s));
  } else if (r < 0.30) {
    // position hors zone à l'arrivée
    const t = ajouterMinutes(debutS, entre(-5, 5));
    planifier(t, () => a(t, s, { position: { latitude: Number(s.latitude) + 0.02, longitude: Number(s.longitude) - 0.015, precision: 15 } }));
  } else {
    const t = ajouterMinutes(debutS, entre(-10, 8));
    planifier(t, () => a(t, s));
  }
  const r2 = DEPARTS[i % DEPARTS.length];
  if (r2 < 0.06) continue; // oubli du départ
  if (r2 < 0.14) {
    const t2 = ajouterMinutes(finS, -entre(20, 35));
    planifier(t2, async () => {
      const d1 = await a(t2, s);
      if (d1?.statut === 'justification_requise') await a(ajouterMinutes(t2, 1), s, { confirmation: d1.confirmation, justification: RAISONS_DEPART[entre(0, 2)] });
    });
  } else {
    const t = ajouterMinutes(finS, entre(-3, 10));
    planifier(t, () => a(t, s));
  }
}
evenements.sort((x, y) => x.t - y.t);
for (const e of evenements) await e.fn();

// Quelques tentatives suspectes
const s0 = seances[seances.length - 1];
if (s0) {
  await a(ajouterMinutes(new Date(s0.debut_prevu), 2), s0, { jeton: 'jeton-falsifie-demo' });
  await a(ajouterMinutes(new Date(s0.debut_prevu), 3), s0, { nom: 'Inconnu Collègue' });
  const autre = seances.find((x) => x.enseignant_id !== s0.enseignant_id && !PLANNING.some(([ei, di]) => ens[ei].id === x.enseignant_id && dom[di].id === s0.domicile_id));
  if (autre) await a(ajouterMinutes(new Date(s0.debut_prevu), 4), { ...autre, domicile_id: s0.domicile_id, latitude: s0.latitude, longitude: s0.longitude });
}

fixerHeureTest(null);
await genererHorizon();
await traiterEcheances();

console.log(`\nDonnées de DÉMONSTRATION créées (${compte} séances simulées sur 14 jours).`);
console.log('Comptes de démonstration (à supprimer avant la mise en production) :');
console.log(`  Administrateur : admin@demo.local / ${MDP_DEMO}`);
console.log(`  Superviseur    : superviseur@demo.local / ${MDP_DEMO}`);
console.log('Enseignants fictifs : nom « DEMO », prénoms Awa, Koffi, Mariam, Yao, Aminata, Serge ; téléphones 07 00 00 01 01 à 07 00 00 01 06.');
await pool.end();
