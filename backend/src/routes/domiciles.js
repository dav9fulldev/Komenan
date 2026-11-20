import { Router } from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import { pool, requete, uneLigne, transaction } from '../db.js';
import { valider, txt, txtOpt, id, booleen } from '../lib/validation.js';
import { exiger } from '../middleware/auth.js';
import { auditer } from '../lib/audit.js';
import { ErreurMetier, nonTrouve } from '../lib/erreurs.js';
import { normaliserTelephone } from '../lib/identite.js';
import { chiffrer, dechiffrer, jetonAleatoire, sha256 } from '../lib/securite.js';
import { config } from '../config.js';
import { resynchroniserCreneaux } from '../services/seances.js';

const r = Router();

const telephone = z.string({ error: 'Le téléphone est obligatoire' }).transform((v, ctx) => {
  const n = normaliserTelephone(v);
  if (!n) ctx.addIssue({ code: 'custom', message: 'Numéro invalide : 10 chiffres attendus' });
  return n;
});
const schemaParent = z.object({
  nom: txt(100, 'Le nom du parent'), prenoms: txt(150, 'Les prénoms du parent'), telephone,
  email: z.string().trim().toLowerCase().email('Adresse e-mail invalide').max(190).optional().nullable().or(z.literal('')).transform((v) => v || null),
});
const coord = (min, max, lib) => z.union([z.coerce.number().min(min, `${lib} invalide`).max(max, `${lib} invalide`), z.literal(''), z.null()])
  .optional().transform((v) => (v === '' || v == null ? null : v));
const schemaDomicile = z.object({
  code: txtOpt(30),
  parent_id: id.optional().nullable(),
  parent: schemaParent.optional().nullable(),
  marche_id: id,
  commune: txt(100, 'La commune'),
  quartier: txtOpt(150),
  adresse: txt(300, "L'adresse"),
  latitude: coord(-90, 90, 'Latitude'),
  longitude: coord(-180, 180, 'Longitude'),
  rayon_tolerance_m: z.union([z.coerce.number().int().min(20).max(5000), z.literal(''), z.null()]).optional().transform((v) => (v === '' || v == null ? null : v)),
}).refine((d) => d.parent_id || d.parent, { message: 'Le parent est obligatoire', path: ['parent_id'] })
  .refine((d) => (d.latitude == null) === (d.longitude == null), { message: 'Renseignez la latitude et la longitude ensemble', path: ['latitude'] });

// ---------- Parents ----------
export const parents = Router();
parents.get('/', exiger('domiciles.voir'), async (req, res) => {
  res.json(await requete(
    `SELECT p.*, (SELECT COUNT(*) FROM domiciles d WHERE d.parent_id = p.id) AS nb_domiciles FROM parents p ORDER BY p.nom, p.prenoms`));
});
parents.put('/:id', exiger('domiciles.gerer'), async (req, res) => {
  const pid = valider(id, req.params.id);
  const d = valider(schemaParent, req.body);
  const avant = await uneLigne('SELECT * FROM parents WHERE id = ?', [pid]);
  if (!avant) throw nonTrouve('Parent');
  await requete('UPDATE parents SET nom = ?, prenoms = ?, telephone = ?, email = ? WHERE id = ?', [d.nom, d.prenoms, d.telephone, d.email, pid]);
  await auditer(req, 'modification_parent', 'parent', pid, avant, d);
  res.json({ id: pid, ...d });
});

// ---------- Domiciles ----------
const SELECT_DOMICILE = `
  SELECT d.*, p.nom AS parent_nom, p.prenoms AS parent_prenoms, p.telephone AS parent_telephone, p.email AS parent_email,
    m.nom AS marche, m.code AS marche_code,
    (SELECT q.statut FROM qr_codes q WHERE q.domicile_id = d.id ORDER BY q.id DESC LIMIT 1) AS qr_statut,
    (SELECT COUNT(*) FROM affectations a WHERE a.domicile_id = d.id AND a.actif = 1 AND (a.date_fin IS NULL OR a.date_fin >= CURDATE())) AS nb_affectations
  FROM domiciles d JOIN parents p ON p.id = d.parent_id JOIN marches m ON m.id = d.marche_id`;

r.get('/', exiger('domiciles.voir'), async (req, res) => {
  const where = ['1=1'];
  const params = [];
  if (req.query.q) {
    const q = `%${req.query.q}%`;
    where.push('(d.code LIKE ? OR p.nom LIKE ? OR p.prenoms LIKE ? OR d.commune LIKE ? OR d.quartier LIKE ?)');
    params.push(q, q, q, q, q);
  }
  if (req.query.marche_id) { where.push('d.marche_id = ?'); params.push(req.query.marche_id); }
  if (req.query.actif === '1' || req.query.actif === '0') { where.push('d.actif = ?'); params.push(Number(req.query.actif)); }
  res.json(await requete(`${SELECT_DOMICILE} WHERE ${where.join(' AND ')} ORDER BY d.code`, params));
});

r.get('/:id', exiger('domiciles.voir'), async (req, res) => {
  const did = valider(id, req.params.id);
  const d = await uneLigne(`${SELECT_DOMICILE} WHERE d.id = ?`, [did]);
  if (!d) throw nonTrouve('Domicile');
  d.qr_codes = await requete(
    `SELECT q.id, q.statut, q.cree_le, q.revoque_le, q.motif_revocation,
       CONCAT(u.prenoms, ' ', u.nom) AS cree_par, CONCAT(v.prenoms, ' ', v.nom) AS revoque_par
     FROM qr_codes q JOIN utilisateurs u ON u.id = q.cree_par LEFT JOIN utilisateurs v ON v.id = q.revoque_par
     WHERE q.domicile_id = ? ORDER BY q.id DESC`, [did]);
  d.affectations = await requete(
    `SELECT a.*, CONCAT(e.nom, ' ', e.prenoms) AS enseignant, e.telephone, mt.libelle AS matiere
     FROM affectations a JOIN enseignants e ON e.id = a.enseignant_id JOIN matieres mt ON mt.id = a.matiere_id
     WHERE a.domicile_id = ? ORDER BY a.actif DESC, a.date_debut DESC`, [did]);
  res.json(d);
});

async function codeSuivant(conn) {
  const [[{ n }]] = await conn.query('SELECT COALESCE(MAX(id), 0) + 1 AS n FROM domiciles');
  return `DOM-${String(n).padStart(4, '0')}`;
}

async function parentId(conn, d) {
  if (d.parent_id) {
    const [[p]] = await conn.query('SELECT id FROM parents WHERE id = ?', [d.parent_id]);
    if (!p) throw nonTrouve('Parent');
    return p.id;
  }
  const [x] = await conn.query('INSERT INTO parents (nom, prenoms, telephone, email) VALUES (?,?,?,?)',
    [d.parent.nom, d.parent.prenoms, d.parent.telephone, d.parent.email]);
  return x.insertId;
}

r.post('/', exiger('domiciles.gerer'), async (req, res) => {
  const d = valider(schemaDomicile, req.body);
  const did = await transaction(async (conn) => {
    const pid = await parentId(conn, d);
    const [x] = await conn.query(
      `INSERT INTO domiciles (code, parent_id, marche_id, commune, quartier, adresse, latitude, longitude, rayon_tolerance_m)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [d.code || await codeSuivant(conn), pid, d.marche_id, d.commune, d.quartier, d.adresse, d.latitude, d.longitude, d.rayon_tolerance_m]);
    return x.insertId;
  });
  const cree = await uneLigne(`${SELECT_DOMICILE} WHERE d.id = ?`, [did]);
  await auditer(req, 'creation_domicile', 'domicile', did, null, cree);
  res.status(201).json(cree);
});

r.put('/:id', exiger('domiciles.gerer'), async (req, res) => {
  const did = valider(id, req.params.id);
  const d = valider(schemaDomicile, req.body);
  const avant = await uneLigne(`${SELECT_DOMICILE} WHERE d.id = ?`, [did]);
  if (!avant) throw nonTrouve('Domicile');
  if (avant.marche_id !== d.marche_id && avant.nb_affectations > 0) {
    throw new ErreurMetier(409, "Le marché ne peut pas être changé tant que le domicile a des affectations actives");
  }
  await transaction(async (conn) => {
    const pid = await parentId(conn, d);
    await conn.query(
      `UPDATE domiciles SET code = ?, parent_id = ?, marche_id = ?, commune = ?, quartier = ?, adresse = ?,
         latitude = ?, longitude = ?, rayon_tolerance_m = ? WHERE id = ?`,
      [d.code || avant.code, pid, d.marche_id, d.commune, d.quartier, d.adresse, d.latitude, d.longitude, d.rayon_tolerance_m, did]);
  });
  const apres = await uneLigne(`${SELECT_DOMICILE} WHERE d.id = ?`, [did]);
  await auditer(req, 'modification_domicile', 'domicile', did, avant, apres);
  res.json(apres);
});

r.patch('/:id/statut', exiger('domiciles.gerer'), async (req, res) => {
  const did = valider(id, req.params.id);
  const { actif } = valider(z.object({ actif: booleen }), req.body);
  await transaction(async (conn) => {
    await conn.query('UPDATE domiciles SET actif = ? WHERE id = ?', [actif, did]);
    const [cr] = await conn.query('SELECT c.id FROM creneaux c JOIN affectations a ON a.id = c.affectation_id WHERE a.domicile_id = ?', [did]);
    await resynchroniserCreneaux(conn, cr.map((c) => c.id));
    await auditer(req, actif ? 'activation_domicile' : 'desactivation_domicile', 'domicile', did, null, { actif }, conn);
  });
  res.json({ message: actif ? 'Domicile activé' : 'Domicile désactivé : ses séances futures sont annulées' });
});

// ---------- QR Codes ----------
const urlPointage = (jeton) => `${config.urlPublique}/p/${jeton}`;

r.get('/:id/qrcode', exiger('qrcodes.gerer'), async (req, res) => {
  const did = valider(id, req.params.id);
  const q = await uneLigne(
    `SELECT q.*, d.code AS domicile_code, m.nom AS marche FROM qr_codes q JOIN domiciles d ON d.id = q.domicile_id
     JOIN marches m ON m.id = d.marche_id WHERE q.domicile_id = ? AND q.statut = 'actif'`, [did]);
  if (!q) throw nonTrouve('QR Code actif');
  const url = urlPointage(dechiffrer(q.jeton_chiffre));
  const image = await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 2, width: 600 });
  res.json({ id: q.id, domicile_code: q.domicile_code, marche: q.marche, cree_le: q.cree_le, url, image });
});

r.post('/:id/qrcode', exiger('qrcodes.gerer'), async (req, res) => {
  const did = valider(id, req.params.id);
  const { motif } = valider(z.object({ motif: txtOpt(300) }), req.body || {});
  const resultat = await transaction(async (conn) => {
    const [[d]] = await conn.query('SELECT id, actif FROM domiciles WHERE id = ? FOR UPDATE', [did]);
    if (!d) throw nonTrouve('Domicile');
    if (!d.actif) throw new ErreurMetier(409, 'Impossible de générer un QR Code pour un domicile désactivé');
    const [[ancien]] = await conn.query("SELECT id FROM qr_codes WHERE domicile_id = ? AND statut = 'actif'", [did]);
    if (ancien) {
      await conn.query("UPDATE qr_codes SET statut = 'revoque', revoque_par = ?, revoque_le = UTC_TIMESTAMP(), motif_revocation = ? WHERE id = ?",
        [req.utilisateur.id, motif || 'Renouvellement', ancien.id]);
    }
    const jeton = jetonAleatoire(32);
    const [x] = await conn.query('INSERT INTO qr_codes (domicile_id, jeton_hash, jeton_chiffre, cree_par) VALUES (?,?,?,?)',
      [did, sha256(jeton), chiffrer(jeton), req.utilisateur.id]);
    await auditer(req, ancien ? 'renouvellement_qrcode' : 'generation_qrcode', 'domicile', did,
      ancien ? { qr_code_id: ancien.id } : null, { qr_code_id: x.insertId, motif }, conn);
    return { id: x.insertId, renouvele: !!ancien };
  });
  res.status(201).json({ ...resultat, message: resultat.renouvele ? "QR Code renouvelé : l'ancien est désormais invalide" : 'QR Code généré' });
});

r.post('/:id/qrcode/revoquer', exiger('qrcodes.gerer'), async (req, res) => {
  const did = valider(id, req.params.id);
  const { motif } = valider(z.object({ motif: txt(300, 'Le motif') }), req.body);
  const [x] = await pool.query(
    "UPDATE qr_codes SET statut = 'revoque', revoque_par = ?, revoque_le = UTC_TIMESTAMP(), motif_revocation = ? WHERE domicile_id = ? AND statut = 'actif'",
    [req.utilisateur.id, motif, did]);
  if (!x.affectedRows) throw nonTrouve('QR Code actif');
  await auditer(req, 'revocation_qrcode', 'domicile', did, null, { motif });
  res.json({ message: 'QR Code révoqué : il ne permet plus aucun pointage' });
});

export default r;
