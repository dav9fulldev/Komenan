import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool, requete, uneLigne, transaction } from '../db.js';
import { valider, txt, email, id, booleen } from '../lib/validation.js';
import { exiger } from '../middleware/auth.js';
import { auditer } from '../lib/audit.js';
import { ErreurMetier, nonTrouve } from '../lib/erreurs.js';
import { PERMISSIONS, RESERVEES_ADMIN } from '../lib/permissions.js';
import { schemaMotDePasse } from './auth.js';

const r = Router();
r.use(exiger('utilisateurs.gerer'));

const CHAMPS = 'id, nom, prenoms, email, role, actif, derniere_connexion, cree_le';

r.get('/', async (req, res) => {
  res.json(await requete(`SELECT ${CHAMPS} FROM utilisateurs ORDER BY nom, prenoms`));
});

r.post('/', async (req, res) => {
  const d = valider(z.object({
    nom: txt(100, 'Le nom'), prenoms: txt(150, 'Les prénoms'), email,
    role: z.enum(['admin', 'superviseur'], { error: 'Rôle invalide' }), mot_de_passe: schemaMotDePasse,
  }), req.body);
  const [res2] = await pool.query(
    'INSERT INTO utilisateurs (nom, prenoms, email, role, mot_de_passe_hash) VALUES (?,?,?,?,?)',
    [d.nom, d.prenoms, d.email, d.role, await bcrypt.hash(d.mot_de_passe, 12)]);
  const cree = await uneLigne(`SELECT ${CHAMPS} FROM utilisateurs WHERE id = ?`, [res2.insertId]);
  await auditer(req, 'creation_compte', 'utilisateur', cree.id, null, cree);
  res.status(201).json(cree);
});

r.put('/:id', async (req, res) => {
  const uid = valider(id, req.params.id);
  const d = valider(z.object({
    nom: txt(100, 'Le nom'), prenoms: txt(150, 'Les prénoms'), email,
    role: z.enum(['admin', 'superviseur'], { error: 'Rôle invalide' }),
  }), req.body);
  const avant = await uneLigne(`SELECT ${CHAMPS} FROM utilisateurs WHERE id = ?`, [uid]);
  if (!avant) throw nonTrouve('Compte');
  if (uid === req.utilisateur.id && d.role !== 'admin') throw new ErreurMetier(400, 'Vous ne pouvez pas retirer votre propre rôle administrateur');
  await requete('UPDATE utilisateurs SET nom=?, prenoms=?, email=?, role=? WHERE id=?', [d.nom, d.prenoms, d.email, d.role, uid]);
  const apres = await uneLigne(`SELECT ${CHAMPS} FROM utilisateurs WHERE id = ?`, [uid]);
  await auditer(req, 'modification_compte', 'utilisateur', uid, avant, apres);
  res.json(apres);
});

r.patch('/:id/statut', async (req, res) => {
  const uid = valider(id, req.params.id);
  const { actif } = valider(z.object({ actif: booleen }), req.body);
  if (uid === req.utilisateur.id) throw new ErreurMetier(400, 'Vous ne pouvez pas désactiver votre propre compte');
  const avant = await uneLigne(`SELECT ${CHAMPS} FROM utilisateurs WHERE id = ?`, [uid]);
  if (!avant) throw nonTrouve('Compte');
  await requete('UPDATE utilisateurs SET actif = ? WHERE id = ?', [actif, uid]);
  await auditer(req, actif ? 'activation_compte' : 'desactivation_compte', 'utilisateur', uid, { actif: avant.actif }, { actif });
  res.json({ message: actif ? 'Compte activé' : 'Compte désactivé' });
});

r.post('/:id/mot-de-passe', async (req, res) => {
  const uid = valider(id, req.params.id);
  const { mot_de_passe } = valider(z.object({ mot_de_passe: schemaMotDePasse }), req.body);
  const u = await uneLigne('SELECT id FROM utilisateurs WHERE id = ?', [uid]);
  if (!u) throw nonTrouve('Compte');
  await requete('UPDATE utilisateurs SET mot_de_passe_hash = ? WHERE id = ?', [await bcrypt.hash(mot_de_passe, 12), uid]);
  await auditer(req, 'reinitialisation_mot_de_passe_par_admin', 'utilisateur', uid);
  res.json({ message: 'Mot de passe réinitialisé' });
});

r.get('/connexions', async (req, res) => {
  const lignes = await requete(
    `SELECT c.id, c.email_saisi, c.succes, c.motif, c.ip, c.user_agent, c.date_connexion, u.nom, u.prenoms
     FROM connexions c LEFT JOIN utilisateurs u ON u.id = c.utilisateur_id
     WHERE (? IS NULL OR c.utilisateur_id = ?) ORDER BY c.date_connexion DESC LIMIT 300`,
    [req.query.utilisateur_id || null, req.query.utilisateur_id || null]);
  res.json(lignes);
});

r.get('/permissions', async (req, res) => {
  const accordees = (await requete("SELECT permission FROM permissions_role WHERE role = 'superviseur'")).map((x) => x.permission);
  res.json(Object.entries(PERMISSIONS).map(([cle, libelle]) => ({
    cle, libelle, reservee_admin: RESERVEES_ADMIN.has(cle), superviseur: accordees.includes(cle),
  })));
});

r.put('/permissions/superviseur', async (req, res) => {
  const { permissions } = valider(z.object({ permissions: z.array(z.string()) }), req.body);
  for (const p of permissions) {
    if (!PERMISSIONS[p]) throw new ErreurMetier(400, `Permission inconnue : ${p}`);
    if (RESERVEES_ADMIN.has(p)) throw new ErreurMetier(400, `La permission « ${PERMISSIONS[p]} » est réservée à l'administrateur`);
  }
  const avant = (await requete("SELECT permission FROM permissions_role WHERE role = 'superviseur'")).map((x) => x.permission);
  await transaction(async (conn) => {
    await conn.query("DELETE FROM permissions_role WHERE role = 'superviseur'");
    if (permissions.length) await conn.query('INSERT INTO permissions_role (role, permission) VALUES ?', [permissions.map((p) => ['superviseur', p])]);
    await auditer(req, 'modification_permissions', 'role', 'superviseur', avant, permissions, conn);
  });
  res.json({ message: 'Permissions du superviseur enregistrées' });
});

export default r;
