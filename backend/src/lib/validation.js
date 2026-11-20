import { z } from 'zod';
import { invalide } from './erreurs.js';

export function valider(schema, donnees) {
  const r = schema.safeParse(donnees);
  if (!r.success) {
    const champs = {};
    for (const i of r.error.issues) champs[i.path.join('.') || '_'] = i.message;
    throw invalide('Certaines informations sont invalides', champs);
  }
  return r.data;
}

export const txt = (max, libelle = 'Ce champ') =>
  z.string({ error: `${libelle} est obligatoire` }).trim().min(1, `${libelle} est obligatoire`).max(max, `${libelle} est trop long`);
export const txtOpt = (max) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
export const dateAMJ = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (AAAA-MM-JJ)');
export const heureHM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:00)?$/, 'Heure invalide (HH:MM)').transform((h) => h.slice(0, 5));
export const id = z.coerce.number({ error: 'Identifiant invalide' }).int().positive('Identifiant invalide');
export const email = z.string().trim().toLowerCase().email('Adresse e-mail invalide').max(190);
export const booleen = z.union([z.boolean(), z.literal(0), z.literal(1)]).transform((v) => (v ? 1 : 0));
