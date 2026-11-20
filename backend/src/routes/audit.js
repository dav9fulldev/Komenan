import { Router } from 'express';
import { requete } from '../db.js';
import { exiger } from '../middleware/auth.js';
import { pagination } from '../lib/pagination.js';

const r = Router();
r.use(exiger('audit.voir'));

r.get('/', async (req, res) => {
  const { limite, decalage, page, taille } = pagination(req.query);
  const where = ['1=1'];
  const params = [];
  if (req.query.entite) { where.push('a.entite = ?'); params.push(req.query.entite); }
  if (req.query.action) { where.push('a.action = ?'); params.push(req.query.action); }
  if (req.query.utilisateur_id) { where.push('a.utilisateur_id = ?'); params.push(req.query.utilisateur_id); }
  if (req.query.debut) { where.push('a.date_action >= ?'); params.push(`${req.query.debut} 00:00:00`); }
  if (req.query.fin) { where.push('a.date_action <= ?'); params.push(`${req.query.fin} 23:59:59`); }
  const w = where.join(' AND ');
  const [{ total }] = await requete(`SELECT COUNT(*) AS total FROM journal_audit a WHERE ${w}`, params);
  const donnees = await requete(
    `SELECT a.*, u.nom, u.prenoms FROM journal_audit a LEFT JOIN utilisateurs u ON u.id = a.utilisateur_id
     WHERE ${w} ORDER BY a.date_action DESC LIMIT ? OFFSET ?`, [...params, limite, decalage]);
  res.json({ donnees, total, page, taille });
});

r.get('/actions', async (req, res) => {
  res.json((await requete('SELECT DISTINCT action FROM journal_audit ORDER BY action')).map((x) => x.action));
});

export default r;
