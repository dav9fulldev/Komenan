import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { requete, uneLigne, transaction } from '../db.js';
import { valider, email } from '../lib/validation.js';
import { ErreurMetier } from '../lib/erreurs.js';
import { exigerConnexion, fermerSession, ouvrirSession, permissionsDe } from '../middleware/auth.js';
import { jetonAleatoire, sha256 } from '../lib/securite.js';
import { envoyerEmail } from '../lib/email.js';
import { config } from '../config.js';
import { auditer } from '../lib/audit.js';

const r = Router();
const MAX_ECHECS = 5;
const FENETRE_MIN = 15;
// Empreinte factice : le temps de réponse est identique que le compte existe ou non.
const HASH_FACTICE = bcrypt.hashSync('compte-inexistant', 12);

export const schemaMotDePasse = z.string()
  .min(10, 'Le mot de passe doit contenir au moins 10 caractères')
  .max(100)
  .regex(/[A-Za-z]/, 'Le mot de passe doit contenir au moins une lettre')
  .regex(/\d/, 'Le mot de passe doit contenir au moins un chiffre');

async function tracerConnexion(req, emailSaisi, utilisateurId, succes, motif) {
  await requete('INSERT INTO connexions (utilisateur_id, email_saisi, succes, motif, ip, user_agent) VALUES (?,?,?,?,?,?)',
    [utilisateurId, emailSaisi.slice(0, 190), succes ? 1 : 0, motif, req.ip, String(req.get('user-agent') || '').slice(0, 255)]);
}

r.post('/connexion', async (req, res) => {
  const { email: mail, mot_de_passe } = valider(z.object({ email, mot_de_passe: z.string().min(1, 'Le mot de passe est obligatoire').max(200) }), req.body);
  const [{ n }] = await requete(
    'SELECT COUNT(*) AS n FROM connexions WHERE email_saisi = ? AND succes = 0 AND date_connexion > UTC_TIMESTAMP() - INTERVAL ? MINUTE',
    [mail, FENETRE_MIN]);
  if (n >= MAX_ECHECS) {
    await tracerConnexion(req, mail, null, false, 'compte_temporairement_bloque');
    throw new ErreurMetier(429, `Trop de tentatives échouées. Réessayez dans ${FENETRE_MIN} minutes.`);
  }
  const u = await uneLigne('SELECT * FROM utilisateurs WHERE email = ?', [mail]);
  const ok = u ? await bcrypt.compare(mot_de_passe, u.mot_de_passe_hash) : await bcrypt.compare(mot_de_passe, HASH_FACTICE).then(() => false);
  if (!u || !ok) {
    await tracerConnexion(req, mail, u?.id ?? null, false, 'identifiants_incorrects');
    throw new ErreurMetier(401, 'Adresse e-mail ou mot de passe incorrect');
  }
  if (!u.actif) {
    await tracerConnexion(req, mail, u.id, false, 'compte_desactive');
    throw new ErreurMetier(403, "Votre compte est désactivé. Contactez l'administrateur.");
  }
  await requete('UPDATE utilisateurs SET derniere_connexion = UTC_TIMESTAMP() WHERE id = ?', [u.id]);
  await tracerConnexion(req, mail, u.id, true, null);
  ouvrirSession(res, u);
  res.json({ id: u.id, nom: u.nom, prenoms: u.prenoms, email: u.email, role: u.role, permissions: await permissionsDe(u.role) });
});

r.post('/deconnexion', (req, res) => {
  fermerSession(res);
  res.json({ message: 'Vous êtes déconnecté(e)' });
});

r.get('/moi', exigerConnexion, (req, res) => {
  const { id, nom, prenoms, email: mail, role, permissions } = req.utilisateur;
  res.json({ id, nom, prenoms, email: mail, role, permissions });
});

r.post('/mot-de-passe-oublie', async (req, res) => {
  const { email: mail } = valider(z.object({ email }), req.body);
  const u = await uneLigne('SELECT id, prenoms, actif FROM utilisateurs WHERE email = ?', [mail]);
  if (u && u.actif) {
    const jeton = jetonAleatoire(32);
    await requete('INSERT INTO reinitialisations_mdp (utilisateur_id, jeton_hash, expire_le) VALUES (?,?, UTC_TIMESTAMP() + INTERVAL 1 HOUR)',
      [u.id, sha256(jeton)]);
    const lien = `${config.urlPublique}/reinitialiser-mot-de-passe?jeton=${jeton}`;
    await envoyerEmail({
      a: mail,
      sujet: 'Réinitialisation de votre mot de passe',
      texte: `Bonjour ${u.prenoms},\n\nPour définir un nouveau mot de passe, ouvrez ce lien (valable 1 heure) :\n${lien}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
    }).catch((e) => console.error('[E-MAIL] Échec d\'envoi', e.message));
  }
  // Réponse identique que le compte existe ou non (ne pas révéler les adresses enregistrées).
  res.json({ message: 'Si cette adresse correspond à un compte actif, un lien de réinitialisation vient d\'être envoyé.' });
});

r.post('/reinitialiser-mot-de-passe', async (req, res) => {
  const d = valider(z.object({ jeton: z.string().min(20).max(200), mot_de_passe: schemaMotDePasse }), req.body);
  await transaction(async (conn) => {
    const [[demande]] = await conn.query(
      'SELECT * FROM reinitialisations_mdp WHERE jeton_hash = ? AND utilise_le IS NULL AND expire_le > UTC_TIMESTAMP() FOR UPDATE',
      [sha256(d.jeton)]);
    if (!demande) throw new ErreurMetier(400, 'Ce lien est invalide ou a expiré. Faites une nouvelle demande.');
    await conn.query('UPDATE utilisateurs SET mot_de_passe_hash = ? WHERE id = ?', [await bcrypt.hash(d.mot_de_passe, 12), demande.utilisateur_id]);
    await conn.query('UPDATE reinitialisations_mdp SET utilise_le = UTC_TIMESTAMP() WHERE id = ?', [demande.id]);
    await auditer({ utilisateur: { id: demande.utilisateur_id }, ip: req.ip }, 'reinitialisation_mot_de_passe', 'utilisateur', demande.utilisateur_id, null, null, conn);
  });
  res.json({ message: 'Votre mot de passe a été modifié. Vous pouvez vous connecter.' });
});

r.post('/changer-mot-de-passe', exigerConnexion, async (req, res) => {
  const d = valider(z.object({ actuel: z.string().min(1), nouveau: schemaMotDePasse }), req.body);
  const u = await uneLigne('SELECT mot_de_passe_hash FROM utilisateurs WHERE id = ?', [req.utilisateur.id]);
  if (!(await bcrypt.compare(d.actuel, u.mot_de_passe_hash))) throw new ErreurMetier(400, 'Le mot de passe actuel est incorrect');
  await requete('UPDATE utilisateurs SET mot_de_passe_hash = ? WHERE id = ?', [await bcrypt.hash(d.nouveau, 12), req.utilisateur.id]);
  await auditer(req, 'changement_mot_de_passe', 'utilisateur', req.utilisateur.id);
  res.json({ message: 'Mot de passe modifié' });
});

export default r;
