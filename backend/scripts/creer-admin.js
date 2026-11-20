// Crée le premier compte administrateur : npm run creer-admin -- email@exemple.ci "Nom" "Prénoms"
import bcrypt from 'bcryptjs';
import readline from 'node:readline/promises';
import { pool } from '../src/db.js';

const [email, nom, prenoms] = process.argv.slice(2);
if (!email || !nom || !prenoms) {
  console.error('Usage : npm run creer-admin -- <email> <nom> <prénoms>');
  process.exit(1);
}
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const mdp = await rl.question('Mot de passe (10 caractères minimum, lettres et chiffres) : ');
rl.close();
if (mdp.length < 10 || !/\d/.test(mdp) || !/[A-Za-z]/.test(mdp)) {
  console.error('Mot de passe trop faible.');
  process.exit(1);
}
await pool.query('INSERT INTO utilisateurs (nom, prenoms, email, role, mot_de_passe_hash) VALUES (?,?,?,?,?)',
  [nom, prenoms, email.toLowerCase(), 'admin', await bcrypt.hash(mdp, 12)]);
console.log(`Administrateur ${email} créé.`);
await pool.end();
