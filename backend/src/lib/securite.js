import crypto from 'node:crypto';
import { config } from '../config.js';

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const jetonAleatoire = (octets = 32) => crypto.randomBytes(octets).toString('base64url');

export function chiffrer(texte) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', config.cleQr, iv);
  const enc = Buffer.concat([c.update(texte, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.');
}

export function dechiffrer(paquet) {
  const [iv, tag, enc] = paquet.split('.').map((x) => Buffer.from(x, 'base64url'));
  const d = crypto.createDecipheriv('aes-256-gcm', config.cleQr, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

/** Jeton signé (HMAC) à courte durée de vie : fige l'heure du premier scan pendant la saisie d'une justification. */
export function signer(donnees, dureeSecondes, maintenantMs) {
  const charge = Buffer.from(JSON.stringify({ ...donnees, exp: maintenantMs + dureeSecondes * 1000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', config.secretSession).update(charge).digest('base64url');
  return `${charge}.${sig}`;
}

export function verifierSignature(jeton, maintenantMs) {
  if (typeof jeton !== 'string' || !jeton.includes('.')) return null;
  const [charge, sig] = jeton.split('.');
  const attendu = crypto.createHmac('sha256', config.secretSession).update(charge).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(attendu);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const d = JSON.parse(Buffer.from(charge, 'base64url').toString());
  if (d.exp < maintenantMs) return null;
  return d;
}
