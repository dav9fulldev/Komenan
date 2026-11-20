import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { valider } from '../lib/validation.js';
import { traiterPointage } from '../services/pointage.js';
import { config } from '../config.js';

const r = Router();

const limiteur = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: config.env === 'test' ? 10000 : 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { statut: 'rejete', message: 'Trop de tentatives. Patientez quelques minutes avant de réessayer.' },
});

const schema = z.object({
  telephone: z.string().trim().max(30).default(''),
  nom: z.string().trim().max(200).default(''),
  position: z.object({
    latitude: z.number().optional(), longitude: z.number().optional(), precision: z.number().optional(),
    erreur: z.enum(['refuse', 'indisponible', 'delai']).optional(),
  }).optional().nullable(),
  justification: z.string().trim().max(2000).optional().nullable(),
  confirmation: z.string().max(1000).optional().nullable(),
  heure_appareil: z.string().max(40).optional().nullable(),
});

r.post('/:jeton', limiteur, async (req, res) => {
  const d = valider(schema, req.body);
  if (!d.telephone || !d.nom) {
    return res.status(400).json({ statut: 'rejete', message: 'Saisissez votre numéro de téléphone et votre nom complet.' });
  }
  const resultat = await traiterPointage({
    jeton: String(req.params.jeton).slice(0, 100),
    telephone: d.telephone, nom: d.nom, position: d.position, justification: d.justification,
    confirmation: d.confirmation, heureAppareil: d.heure_appareil, ip: req.ip, userAgent: req.get('user-agent'),
  });
  res.json(resultat);
});

export default r;
