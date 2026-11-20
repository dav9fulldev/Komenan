import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { requete, uneLigne } from '../db.js';
import { PERMISSIONS } from '../lib/permissions.js';
import { ErreurMetier, interdit } from '../lib/erreurs.js';

export const NOM_COOKIE = 'session_presences';
export const DUREE_SESSION_H = 8;

export function ouvrirSession(res, utilisateur) {
  const jeton = jwt.sign({ uid: utilisateur.id }, config.secretSession, { expiresIn: `${DUREE_SESSION_H}h` });
  res.cookie(NOM_COOKIE, jeton, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.env === 'production',
    maxAge: DUREE_SESSION_H * 3600 * 1000,
    path: '/',
  });
}

export function fermerSession(res) {
  res.clearCookie(NOM_COOKIE, { path: '/' });
}

export async function permissionsDe(role) {
  if (role === 'admin') return Object.keys(PERMISSIONS);
  const lignes = await requete('SELECT permission FROM permissions_role WHERE role = ?', [role]);
  return lignes.map((l) => l.permission);
}

/** Vérifie la session et recharge l'utilisateur (compte désactivé = accès coupé immédiatement). */
export async function exigerConnexion(req, res, next) {
  try {
    const jeton = req.cookies?.[NOM_COOKIE];
    if (!jeton) throw new ErreurMetier(401, 'Veuillez vous connecter');
    let charge;
    try {
      charge = jwt.verify(jeton, config.secretSession);
    } catch {
      throw new ErreurMetier(401, 'Votre session a expiré, veuillez vous reconnecter');
    }
    const u = await uneLigne('SELECT id, nom, prenoms, email, role, actif FROM utilisateurs WHERE id = ?', [charge.uid]);
    if (!u || !u.actif) throw new ErreurMetier(401, 'Compte inactif ou inexistant');
    u.permissions = await permissionsDe(u.role);
    req.utilisateur = u;
    next();
  } catch (e) {
    next(e);
  }
}

export const exiger = (...permissions) => (req, res, next) => {
  const p = req.utilisateur?.permissions || [];
  if (!permissions.every((x) => p.includes(x))) return next(interdit());
  next();
};

export const peut = (req, permission) => (req.utilisateur?.permissions || []).includes(permission);
