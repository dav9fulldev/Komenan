function requis(nom) {
  const v = process.env[nom];
  if (!v || v === 'a_remplacer') throw new Error(`Variable d'environnement manquante : ${nom}`);
  return v;
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  urlPublique: (process.env.URL_PUBLIQUE || 'http://localhost:5173').replace(/\/$/, ''),
  origineBackoffice: process.env.ORIGINE_BACKOFFICE || 'http://localhost:5173',
  fuseau: process.env.FUSEAU_HORAIRE || 'Africa/Abidjan',
  db: {
    host: process.env.DB_HOTE || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    database: requis('DB_NOM'),
    user: requis('DB_UTILISATEUR'),
    password: process.env.DB_MOT_DE_PASSE || '',
  },
  secretSession: requis('SECRET_SESSION'),
  cleQr: Buffer.from(requis('CLE_CHIFFREMENT_QR'), 'hex'),
  smtp: {
    hote: process.env.SMTP_HOTE || '',
    port: Number(process.env.SMTP_PORT || 587),
    utilisateur: process.env.SMTP_UTILISATEUR || '',
    motDePasse: process.env.SMTP_MOT_DE_PASSE || '',
    expediteur: process.env.SMTP_EXPEDITEUR || '',
  },
};

if (config.cleQr.length !== 32) throw new Error('CLE_CHIFFREMENT_QR doit contenir 64 caractères hexadécimaux');
