// Scénarios normaux et tentatives de fraude du parcours de pointage.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { reinitialiserBase, connecter, creerScenario, gpsConforme } from './aide.js';

await reinitialiserBase();
const { creerApp } = await import('../src/app.js');
const { pool } = await import('../src/db.js');
const { fixerHeureTest } = await import('../src/lib/horloge.js');
const { traiterEcheances } = await import('../src/services/seances.js');

const app = creerApp();
let admin;
let superviseur;
// Lundi 23 novembre 2026 (Abidjan = UTC+0)
const a = (hhmm) => fixerHeureTest(`2026-11-23T${hhmm}:00Z`);
const pointer = (jeton, corps) => request(app).post(`/api/pointage/${jeton}`).send(corps);
const seance = async (enseignantId) => (await pool.query(
  "SELECT * FROM seances WHERE enseignant_id = ? AND date_seance = '2026-11-23'", [enseignantId]))[0][0];
const anomalies = async (enseignantId, type) => (await pool.query(
  'SELECT * FROM anomalies WHERE enseignant_id = ? AND type = ?', [enseignantId, type]))[0];

before(async () => {
  a('07:00');
  admin = await connecter(app, 'admin@test.ci');
  superviseur = await connecter(app, 'superviseur@test.ci');
});
after(async () => {
  fixerHeureTest(null);
  await pool.end();
});

describe('Parcours normal', () => {
  let s;
  before(async () => { a('07:00'); s = await creerScenario(admin); });

  test("arrivée à l'heure : séance ouverte", async () => {
    a('16:03');
    const r = await pointer(s.jeton, { ...s.identite, position: gpsConforme });
    assert.equal(r.body.statut, 'arrivee_enregistree', JSON.stringify(r.body));
    assert.equal(r.body.heure_arrivee, '16:03');
    const se = await seance(s.enseignant.id);
    assert.equal(se.statut, 'en_cours');
    assert.equal(se.statut_arrivee, 'a_l_heure');
    assert.equal(se.retard_minutes, 3);
  });

  test("nouveau scan juste après l'arrivée : refusé comme double pointage", async () => {
    a('16:05');
    const r = await pointer(s.jeton, { ...s.identite, position: gpsConforme });
    assert.equal(r.body.statut, 'deja_arrive');
    assert.equal((await anomalies(s.enseignant.id, 'double_pointage')).length, 1);
    assert.equal((await seance(s.enseignant.id)).statut, 'en_cours');
  });

  test('départ en fin de cours : séance clôturée, durée calculée', async () => {
    a('18:02');
    const r = await pointer(s.jeton, { ...s.identite, position: gpsConforme });
    assert.equal(r.body.statut, 'depart_enregistre', JSON.stringify(r.body));
    const se = await seance(s.enseignant.id);
    assert.equal(se.statut, 'terminee');
    assert.equal(se.duree_effective_minutes, 119);
    assert.equal(se.depart_anticipe_minutes, 0);
  });

  test('scan après clôture : refusé, une seule arrivée et un seul départ acceptés', async () => {
    a('18:10');
    const r = await pointer(s.jeton, { ...s.identite, position: gpsConforme });
    assert.equal(r.body.statut, 'rejete');
    const [acceptes] = await pool.query("SELECT type FROM pointages WHERE enseignant_id = ? AND resultat = 'accepte'", [s.enseignant.id]);
    assert.deepEqual(acceptes.map((x) => x.type).sort(), ['arrivee', 'depart']);
  });
});

describe('Retard et justification', () => {
  let s;
  before(async () => { a('07:00'); s = await creerScenario(admin); });

  test("retard : justification exigée et rien n'est enregistré avant confirmation", async () => {
    a('16:25');
    const r = await pointer(s.jeton, { ...s.identite, position: gpsConforme });
    assert.equal(r.body.statut, 'justification_requise');
    assert.equal(r.body.retard_minutes, 25);
    assert.equal(r.body.heure_prevue, '16:00');
    assert.ok(r.body.confirmation);
    assert.equal((await seance(s.enseignant.id)).statut, 'prevue');
    s.confirmation = r.body.confirmation;
  });

  test('justification trop courte : refusée', async () => {
    a('16:27');
    const r = await pointer(s.jeton, { ...s.identite, position: gpsConforme, confirmation: s.confirmation, justification: 'bouchon' });
    assert.equal(r.body.statut, 'justification_requise');
    assert.ok(r.body.erreur);
  });

  test("confirmation : retard calculé à l'heure du premier scan, justification conservée", async () => {
    a('16:28');
    const r = await pointer(s.jeton, {
      ...s.identite, position: gpsConforme, confirmation: s.confirmation, justification: 'Embouteillage important sur le boulevard Latrille',
    });
    assert.equal(r.body.statut, 'arrivee_enregistree', JSON.stringify(r.body));
    const se = await seance(s.enseignant.id);
    assert.equal(se.retard_minutes, 25);
    assert.equal(se.statut_arrivee, 'retard_en_attente');
    const [[j]] = await pool.query('SELECT * FROM justifications WHERE seance_id = ?', [se.id]);
    assert.match(j.texte, /Embouteillage/);
    assert.equal((await anomalies(s.enseignant.id, 'retard_non_justifie')).length, 1);
  });

  test("réutilisation de la confirmation : refusée", async () => {
    a('16:30');
    const r = await pointer(s.jeton, { ...s.identite, position: gpsConforme, confirmation: s.confirmation, justification: 'Embouteillage important encore' });
    assert.notEqual(r.body.statut, 'arrivee_enregistree');
  });

  test("acceptation de la justification : le retard constaté n'est pas effacé", async () => {
    const se = await seance(s.enseignant.id);
    const [[j]] = await pool.query('SELECT id FROM justifications WHERE seance_id = ?', [se.id]);
    const r = await superviseur.post(`/api/justifications/${j.id}/decision`).send({ decision: 'acceptee' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const apres = await seance(s.enseignant.id);
    assert.equal(apres.statut_arrivee, 'retard_justifie');
    assert.equal(apres.retard_minutes, 25);
    assert.equal((await anomalies(s.enseignant.id, 'retard_justifie')).length, 1);
  });

  test('départ anticipé : justification exigée puis enregistrée', async () => {
    a('17:20');
    const r1 = await pointer(s.jeton, { ...s.identite, position: gpsConforme });
    assert.equal(r1.body.statut, 'justification_requise');
    assert.equal(r1.body.type, 'depart_anticipe');
    a('17:22');
    const r2 = await pointer(s.jeton, { ...s.identite, position: gpsConforme, confirmation: r1.body.confirmation, justification: "L'élève est malade, le parent a écourté le cours" });
    assert.equal(r2.body.statut, 'depart_enregistre', JSON.stringify(r2.body));
    const se = await seance(s.enseignant.id);
    assert.equal(se.depart_anticipe_minutes, 40);
    assert.equal(se.duree_effective_minutes, 55);
    assert.equal((await anomalies(s.enseignant.id, 'depart_anticipe')).length, 1);
  });
});

describe('Arrivée anticipée', () => {
  test("avant l'ouverture du pointage : refus, séance non ouverte", async () => {
    a('07:00');
    const s = await creerScenario(admin);
    a('15:30');
    const r = await pointer(s.jeton, { ...s.identite, position: gpsConforme });
    assert.equal(r.body.statut, 'trop_tot');
    assert.equal(r.body.heure_ouverture, '15:45');
    assert.equal((await seance(s.enseignant.id)).statut, 'prevue');
    a('15:46');
    const r2 = await pointer(s.jeton, { ...s.identite, position: gpsConforme });
    assert.equal(r2.body.statut, 'arrivee_enregistree');
  });
});

describe('Tentatives de fraude et erreurs', () => {
  let s;
  let autre;
  before(async () => {
    a('07:00');
    s = await creerScenario(admin);
    autre = await creerScenario(admin, { debut: '16:30', fin: '17:30' });
  });

  test('QR Code inconnu : rejeté et signalé', async () => {
    a('16:00');
    const r = await pointer('jeton-invente-par-un-fraudeur', { ...s.identite, position: gpsConforme });
    assert.equal(r.body.statut, 'rejete');
    const [[n]] = await pool.query("SELECT COUNT(*) AS n FROM anomalies WHERE type = 'qr_invalide'");
    assert.ok(n.n >= 1);
  });

  test('numéro inconnu : message générique, tentative journalisée', async () => {
    const r = await pointer(s.jeton, { telephone: '0102030405', nom: 'Paul YAO', position: gpsConforme });
    assert.equal(r.body.statut, 'rejete');
    assert.match(r.body.message, /Identification impossible/);
    const [[p]] = await pool.query("SELECT * FROM pointages WHERE motif_rejet = 'telephone_inconnu' ORDER BY id DESC LIMIT 1");
    assert.equal(p.resultat, 'rejete');
  });

  test("bon numéro mais nom différent (pointage pour un collègue) : rejeté", async () => {
    const r = await pointer(s.jeton, { telephone: s.identite.telephone, nom: 'Konan Serge', position: gpsConforme });
    assert.equal(r.body.statut, 'rejete');
    assert.equal((await anomalies(s.enseignant.id, 'identite_non_conforme')).length, 1);
  });

  test('enseignant non affecté à ce domicile : rejeté et signalé', async () => {
    const r = await pointer(s.jeton, { ...autre.identite, position: gpsConforme });
    assert.equal(r.body.statut, 'rejete');
    assert.match(r.body.message, /pas affecté/);
    assert.equal((await anomalies(autre.enseignant.id, 'enseignant_non_affecte')).length, 1);
  });

  test("falsification du jeton de confirmation par un autre enseignant : rejetée", async () => {
    a('16:55');
    const r1 = await pointer(autre.jeton, { ...autre.identite, position: gpsConforme });
    assert.equal(r1.body.statut, 'justification_requise');
    const r2 = await pointer(s.jeton, { ...s.identite, position: gpsConforme, confirmation: r1.body.confirmation, justification: 'Tentative de réutilisation du jeton' });
    assert.equal(r2.body.statut, 'rejete');
    const altere = r1.body.confirmation.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
    const r3 = await pointer(autre.jeton, { ...autre.identite, position: gpsConforme, confirmation: altere, justification: 'Signature modifiée volontairement' });
    assert.equal(r3.body.statut, 'rejete');
  });

  test('position GPS hors zone (non bloquant) : pointage accepté mais anomalie élevée', async () => {
    a('16:01');
    const r = await pointer(s.jeton, { ...s.identite, position: { latitude: 5.3200, longitude: -4.0200, precision: 10 } });
    assert.equal(r.body.statut, 'arrivee_enregistree');
    assert.match(r.body.gps, /examiné/);
    const [an] = await anomalies(s.enseignant.id, 'gps_non_conforme');
    assert.equal(an.gravite, 'elevee');
    const [[p]] = await pool.query("SELECT statut_gps, distance_m FROM pointages WHERE enseignant_id = ? AND resultat = 'accepte'", [s.enseignant.id]);
    assert.equal(p.statut_gps, 'hors_zone');
    assert.ok(p.distance_m > 5000);
  });

  test('GPS bloquant activé : localisation refusée => pointage refusé', async () => {
    a('07:00');
    const b = await creerScenario(admin);
    await admin.put('/api/parametres').send({ gps_bloquant: 1 });
    a('16:00');
    const r = await pointer(b.jeton, { ...b.identite, position: { erreur: 'refuse' } });
    assert.equal(r.body.statut, 'rejete');
    assert.equal((await seance(b.enseignant.id)).statut, 'prevue');
    const r2 = await pointer(b.jeton, { ...b.identite, position: gpsConforme });
    assert.equal(r2.body.statut, 'arrivee_enregistree');
    await admin.put('/api/parametres').send({ gps_bloquant: 0 });
  });

  test('QR Code révoqué : rejeté', async () => {
    a('07:00');
    const b = await creerScenario(admin);
    const rv = await admin.post(`/api/domiciles/${b.domicile.id}/qrcode/revoquer`).send({ motif: 'QR photographié et diffusé' });
    assert.equal(rv.status, 200);
    a('16:00');
    const r = await pointer(b.jeton, { ...b.identite, position: gpsConforme });
    assert.equal(r.body.statut, 'rejete');
    assert.match(r.body.message, /plus valide/);
  });

  test('deux scans simultanés : une seule arrivée acceptée', async () => {
    a('07:00');
    const b = await creerScenario(admin);
    a('16:00');
    const rs = await Promise.all([1, 2, 3].map(() => pointer(b.jeton, { ...b.identite, position: gpsConforme })));
    const statuts = rs.map((r) => r.body.statut);
    assert.equal(statuts.filter((x) => x === 'arrivee_enregistree').length, 1, statuts.join(','));
    const [[n]] = await pool.query("SELECT COUNT(*) AS n FROM pointages WHERE enseignant_id = ? AND resultat = 'accepte'", [b.enseignant.id]);
    assert.equal(n.n, 1);
  });

  test("séance encore ouverte ailleurs : arrivée refusée (conflit de séances)", async () => {
    a('07:00');
    const b = await creerScenario(admin, { debut: '08:00', fin: '09:00' });
    // Deuxième domicile pour le même enseignant à 11h
    const d2 = await admin.post('/api/domiciles').send({
      marche_id: b.marcheId, commune: 'Yopougon', adresse: 'Villa test bis', latitude: 5.33, longitude: -4.07,
      parent: { nom: 'PARENTBIS', prenoms: 'Test', telephone: '0500000099' },
    });
    const a2 = await admin.post('/api/affectations').send({ enseignant_id: b.enseignant.id, domicile_id: d2.body.id, matiere_id: b.matiere.id, date_debut: '2026-11-02' });
    const c2 = await admin.post('/api/plannings').send({ affectation_id: a2.body.id, jour_semaine: 1, heure_debut: '11:00', heure_fin: '12:00', frequence: 'hebdomadaire', date_debut: '2026-11-02' });
    assert.equal(c2.status, 201, JSON.stringify(c2.body));
    await admin.post(`/api/domiciles/${d2.body.id}/qrcode`).send({});
    const jeton2 = (await admin.get(`/api/domiciles/${d2.body.id}/qrcode`)).body.url.split('/p/')[1];
    a('08:00');
    assert.equal((await pointer(b.jeton, { ...b.identite, position: gpsConforme })).body.statut, 'arrivee_enregistree');
    a('09:50');
    const r = await pointer(jeton2, { ...b.identite, position: { latitude: 5.33, longitude: -4.07, precision: 10 } });
    assert.equal(r.body.statut, 'rejete');
    assert.match(r.body.message, /encore ouverte/);
  });
});

describe('Échéances automatiques', () => {
  test('aucune arrivée : absence présumée à vérifier ; pas de départ : séance signalée', async () => {
    a('07:00');
    const absent = await creerScenario(admin, { debut: '09:00', fin: '10:00' });
    const oublieux = await creerScenario(admin, { debut: '09:00', fin: '10:00' });
    a('09:00');
    await pointer(oublieux.jeton, { ...oublieux.identite, position: gpsConforme });
    a('10:30');
    await traiterEcheances();
    assert.equal((await seance(absent.enseignant.id)).statut, 'absence_presumee');
    assert.equal((await seance(absent.enseignant.id)).statut_absence, 'a_verifier');
    assert.equal((await anomalies(absent.enseignant.id, 'absence_presumee')).length, 1);
    assert.equal((await seance(oublieux.enseignant.id)).statut, 'en_cours');
    a('11:01');
    await traiterEcheances();
    assert.equal((await seance(oublieux.enseignant.id)).statut, 'depart_non_pointe');
    // Arrivée après fermeture de la fenêtre : refusée
    const r = await pointer(absent.jeton, { ...absent.identite, position: gpsConforme });
    assert.equal(r.body.statut, 'rejete');
  });
});

describe('Séance oubliée ouverte', () => {
  test("un scan la semaine suivante n'est pas pris pour le départ de l'ancienne séance", async () => {
    a('07:00');
    const s = await creerScenario(admin, { debut: '12:00', fin: '13:00' });
    a('12:00');
    assert.equal((await pointer(s.jeton, { ...s.identite, position: gpsConforme })).body.statut, 'arrivee_enregistree');
    // Aucune tâche planifiée entre-temps ; lundi suivant, 12:00
    fixerHeureTest('2026-11-30T12:00:00Z');
    const r = await pointer(s.jeton, { ...s.identite, position: gpsConforme });
    assert.equal(r.body.statut, 'arrivee_enregistree', JSON.stringify(r.body));
    const [lignes] = await pool.query('SELECT date_seance, statut FROM seances WHERE enseignant_id = ? ORDER BY date_seance', [s.enseignant.id]);
    const ancienne = lignes.find((l) => l.date_seance === '2026-11-23');
    assert.equal(ancienne.statut, 'depart_non_pointe');
  });
});

describe('Intégrité des historiques', () => {
  test('le journal des pointages ne peut être ni modifié ni supprimé', async () => {
    await assert.rejects(pool.query("UPDATE pointages SET resultat = 'accepte' WHERE resultat = 'rejete'"), /ne peut pas être modifié/);
    await assert.rejects(pool.query('DELETE FROM pointages'), /ne peut pas être supprimé/);
    await assert.rejects(pool.query('DELETE FROM journal_audit'), /ne peut pas être supprimé/);
  });
  test("l'heure d'arrivée réelle d'une séance ne peut pas être réécrite", async () => {
    await assert.rejects(pool.query("UPDATE seances SET arrivee_reelle = '2026-11-23 16:00:00' WHERE arrivee_reelle IS NOT NULL"), /ne peuvent pas être modifiées/);
  });
});

describe('Planning et droits', () => {
  test('chevauchement horaire pour un même enseignant : refusé', async () => {
    a('07:00');
    const s = await creerScenario(admin, { debut: '14:00', fin: '15:00' });
    const r = await admin.post('/api/plannings').send({
      affectation_id: s.affectation.id, jour_semaine: 1, heure_debut: '14:30', heure_fin: '15:30', frequence: 'hebdomadaire', date_debut: '2026-11-02',
    });
    assert.equal(r.status, 409);
    assert.ok(r.body.details.conflits.length >= 1);
  });

  test('superviseur : consultation autorisée, modification interdite', async () => {
    assert.equal((await superviseur.get('/api/affectations')).status, 200);
    assert.equal((await superviseur.post('/api/affectations').send({})).status, 403);
    assert.equal((await superviseur.post('/api/plannings').send({})).status, 403);
    assert.equal((await superviseur.post('/api/domiciles/1/qrcode').send({})).status, 403);
    assert.equal((await superviseur.get('/api/utilisateurs')).status, 403);
    const perm = await admin.put('/api/utilisateurs/permissions/superviseur').send({ permissions: ['plannings.gerer'] });
    assert.equal(perm.status, 400);
  });

  test("sans session : accès refusé", async () => {
    assert.equal((await request(app).get('/api/enseignants')).status, 401);
  });

  test("chaque modification importante est tracée dans le journal d'audit", async () => {
    const [actions] = await pool.query('SELECT DISTINCT action FROM journal_audit');
    const liste = actions.map((x) => x.action);
    for (const attendu of ['creation_enseignant', 'creation_affectation', 'creation_planning', 'generation_qrcode', 'revocation_qrcode', 'decision_justification']) {
      assert.ok(liste.includes(attendu), `action manquante : ${attendu}`);
    }
  });
});

describe('Consultation et exports', () => {
  test('tableau de bord, suivi, calendrier, anomalies, audit, rapports', async () => {
    for (const url of ['/api/tableau-de-bord', '/api/presences?debut=2026-11-01&fin=2026-11-30', '/api/plannings/calendrier?debut=2026-11-23&fin=2026-11-29',
      '/api/anomalies?ouvertes=1', '/api/justifications', '/api/audit', '/api/utilisateurs/connexions', '/api/marches/1', '/api/enseignants/1', '/api/domiciles/1']) {
      const r = await admin.get(url);
      assert.equal(r.status, 200, `${url} : ${JSON.stringify(r.body)}`);
    }
    const cal = await admin.get('/api/plannings/calendrier?debut=2026-11-23&fin=2026-11-29');
    assert.ok(cal.body.length > 0);
    for (const type of ['presences-enseignants', 'retards', 'absences', 'durees', 'marches']) {
      const j = await superviseur.get(`/api/rapports/${type}?debut=2026-11-01&fin=2026-11-30`);
      assert.equal(j.status, 200, JSON.stringify(j.body));
      for (const format of ['pdf', 'xlsx']) {
        const f = await superviseur.get(`/api/rapports/${type}?debut=2026-11-01&fin=2026-11-30&format=${format}`).buffer(true).parse((res, cb) => {
          const morceaux = []; res.on('data', (c) => morceaux.push(c)); res.on('end', () => cb(null, Buffer.concat(morceaux)));
        });
        assert.equal(f.status, 200);
        assert.ok(f.body.length > 500, `${type}.${format} vide`);
      }
    }
  });
});
