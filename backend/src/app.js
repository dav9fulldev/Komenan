import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import swaggerUi from 'swagger-ui-express';
import { config } from './config.js';
import { exigerConnexion } from './middleware/auth.js';
import { gestionErreurs } from './middleware/erreurs.js';
import { specification } from './swagger.js';
import auth from './routes/auth.js';
import enseignants, { matieres } from './routes/enseignants.js';
import marches from './routes/marches.js';
import domiciles, { parents } from './routes/domiciles.js';
import affectations from './routes/affectations.js';
import plannings from './routes/plannings.js';
import presences from './routes/presences.js';
import justifications from './routes/justifications.js';
import anomalies from './routes/anomalies.js';
import tableauDeBord from './routes/tableau-de-bord.js';
import rapports from './routes/rapports.js';
import utilisateurs from './routes/utilisateurs.js';
import audit from './routes/audit.js';
import parametres from './routes/parametres.js';
import pointage from './routes/pointage.js';

const ici = path.dirname(fileURLToPath(import.meta.url));

export function creerApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"], imgSrc: ["'self'", 'data:'], styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"], connectSrc: ["'self'"], frameAncestors: ["'none'"],
      },
    },
    // La géolocalisation doit rester autorisée pour la page de pointage.
    permissionsPolicy: false,
  }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // ---- API publique ----
  app.use('/api/auth', auth);
  app.use('/api/pointage', pointage);
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(specification, { customSiteTitle: 'Documentation API – Présences' }));
  app.get('/api/sante', (req, res) => res.json({ statut: 'ok' }));

  // ---- API protégée ----
  const api = express.Router();
  api.use(exigerConnexion);
  api.use('/tableau-de-bord', tableauDeBord);
  api.use('/enseignants', enseignants);
  api.use('/matieres', matieres);
  api.use('/marches', marches);
  api.use('/parents', parents);
  api.use('/domiciles', domiciles);
  api.use('/affectations', affectations);
  api.use('/plannings', plannings);
  api.use('/presences', presences);
  api.use('/justifications', justifications);
  api.use('/anomalies', anomalies);
  api.use('/rapports', rapports);
  api.use('/utilisateurs', utilisateurs);
  api.use('/audit', audit);
  api.use('/parametres', parametres);
  app.use('/api', api);
  app.use('/api', (req, res) => res.status(404).json({ message: 'Ressource introuvable' }));

  // ---- Page mobile de pointage (ouverte par le QR Code) ----
  const dossierPointage = path.join(ici, '..', 'public', 'pointage');
  app.use('/pointage-ressources', express.static(dossierPointage, { maxAge: '1h' }));
  app.get('/p/:jeton', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    res.sendFile(path.join(dossierPointage, 'index.html'));
  });

  // ---- Back-office (version compilée) ----
  const dist = path.join(ici, '..', '..', 'frontend', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false }));
    app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(gestionErreurs);
  return app;
}

export { config };
