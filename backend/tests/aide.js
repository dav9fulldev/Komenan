import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { config } from '../src/config.js';
import { migrer } from '../scripts/migrate.js';

if (config.env !== 'test' || !config.db.database.includes('test')) {
  throw new Error('Les tests doivent tourner sur la base de test (.env.test)');
}

export const MDP = 'MotDePasse2026';
export const DOMICILE_GPS = { latitude: 5.3600, longitude: -3.9800 };

export async function reinitialiserBase() {
  const conn = await mysql.createConnection({ ...config.db, database: undefined });
  await conn.query(`DROP DATABASE IF EXISTS \`${config.db.database}\``);
  await conn.query(`CREATE DATABASE \`${config.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.end();
  await migrer({ silencieux: true });
  const { pool } = await import('../src/db.js');
  const hash = await bcrypt.hash(MDP, 4);
  await pool.query(`INSERT INTO utilisateurs (nom, prenoms, email, role, mot_de_passe_hash) VALUES
    ('TEST', 'Admin', 'admin@test.ci', 'admin', ?), ('TEST', 'Superviseur', 'superviseur@test.ci', 'superviseur', ?)`, [hash, hash]);
}

export async function connecter(app, email) {
  const agent = request.agent(app);
  const r = await agent.post('/api/auth/connexion').send({ email, mot_de_passe: MDP });
  if (r.status !== 200) throw new Error(`Connexion impossible : ${JSON.stringify(r.body)}`);
  return agent;
}

let compteur = 0;

/** Crée un enseignant affecté à un domicile avec un créneau et un QR Code. */
export async function creerScenario(admin, { jour = 1, debut = '16:00', fin = '18:00', dateDebut = '2026-11-02', marcheId } = {}) {
  compteur++;
  const n = String(compteur).padStart(2, '0');
  if (!marcheId) {
    const m = await admin.post('/api/marches').send({ code: `M-T${n}`, nom: `Marché test ${n}` });
    marcheId = m.body.id;
  }
  let matiere = (await admin.get('/api/matieres')).body.find((x) => x.libelle === 'Mathématiques');
  if (!matiere) matiere = (await admin.post('/api/matieres').send({ libelle: 'Mathématiques' })).body;
  const e = await admin.post('/api/enseignants').send({
    nom: `KOUASSI${n}`, prenoms: 'Jean Marc', telephone: `07000000${n}`, matieres: [matiere.id], marches: [marcheId],
  });
  if (e.status !== 201) throw new Error(JSON.stringify(e.body));
  const d = await admin.post('/api/domiciles').send({
    marche_id: marcheId, commune: 'Cocody', quartier: 'Riviera', adresse: `Villa test ${n}`,
    ...DOMICILE_GPS, parent: { nom: `PARENT${n}`, prenoms: 'Test', telephone: `05000000${n}` },
  });
  if (d.status !== 201) throw new Error(JSON.stringify(d.body));
  const a = await admin.post('/api/affectations').send({
    enseignant_id: e.body.id, domicile_id: d.body.id, matiere_id: matiere.id, date_debut: dateDebut,
  });
  if (a.status !== 201) throw new Error(JSON.stringify(a.body));
  const c = await admin.post('/api/plannings').send({
    affectation_id: a.body.id, jour_semaine: jour, heure_debut: debut, heure_fin: fin, frequence: 'hebdomadaire', date_debut: dateDebut,
  });
  if (c.status !== 201) throw new Error(JSON.stringify(c.body));
  await admin.post(`/api/domiciles/${d.body.id}/qrcode`).send({});
  const qr = await admin.get(`/api/domiciles/${d.body.id}/qrcode`);
  const jeton = qr.body.url.split('/p/')[1];
  return {
    jeton, enseignant: e.body, domicile: d.body, affectation: a.body, creneau: c.body, marcheId, matiere,
    identite: { telephone: `07 00 00 00 ${n}`, nom: `Jean KOUASSI${n}` },
  };
}

export const gpsConforme = { ...DOMICILE_GPS, precision: 15 };
