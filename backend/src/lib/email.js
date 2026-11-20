import nodemailer from 'nodemailer';
import { config } from '../config.js';

export async function envoyerEmail({ a, sujet, texte }) {
  if (!config.smtp.hote) {
    console.log(`[E-MAIL NON ENVOYÉ – SMTP non configuré] À : ${a}\nSujet : ${sujet}\n${texte}\n`);
    return false;
  }
  const t = nodemailer.createTransport({
    host: config.smtp.hote, port: config.smtp.port, secure: config.smtp.port === 465,
    auth: config.smtp.utilisateur ? { user: config.smtp.utilisateur, pass: config.smtp.motDePasse } : undefined,
  });
  await t.sendMail({ from: config.smtp.expediteur, to: a, subject: sujet, text: texte });
  return true;
}
