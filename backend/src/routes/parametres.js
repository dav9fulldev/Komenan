import { Router } from 'express';
import { z } from 'zod';
import { requete, transaction } from '../db.js';
import { valider } from '../lib/validation.js';
import { exiger } from '../middleware/auth.js';
import { auditer } from '../lib/audit.js';
import { DEFINITIONS_PARAMETRES, lireParametres } from '../lib/parametres.js';
import { ErreurMetier } from '../lib/erreurs.js';

const r = Router();

r.get('/', async (req, res) => {
  const valeurs = await lireParametres();
  const lignes = await requete('SELECT cle, modifie_le FROM parametres');
  const dates = Object.fromEntries(lignes.map((l) => [l.cle, l.modifie_le]));
  res.json(Object.entries(DEFINITIONS_PARAMETRES).map(([cle, def]) => ({ cle, ...def, valeur: valeurs[cle], modifie_le: dates[cle] })));
});

r.put('/', exiger('parametres.gerer'), async (req, res) => {
  const d = valider(z.record(z.string(), z.coerce.number({ error: 'Valeur numérique attendue' }).int('Nombre entier attendu')), req.body);
  const avant = await lireParametres();
  for (const [cle, v] of Object.entries(d)) {
    const def = DEFINITIONS_PARAMETRES[cle];
    if (!def) throw new ErreurMetier(400, `Paramètre inconnu : ${cle}`);
    if (v < def.min || v > def.max) throw new ErreurMetier(400, `« ${def.libelle} » doit être compris entre ${def.min} et ${def.max}`);
  }
  await transaction(async (conn) => {
    for (const [cle, v] of Object.entries(d)) {
      await conn.query('UPDATE parametres SET valeur = ?, modifie_par = ? WHERE cle = ?', [String(v), req.utilisateur.id, cle]);
    }
    await auditer(req, 'modification_parametres', 'parametres', null,
      Object.fromEntries(Object.keys(d).map((k) => [k, avant[k]])), d, conn);
  });
  res.json({ message: 'Paramètres enregistrés' });
});

export default r;
