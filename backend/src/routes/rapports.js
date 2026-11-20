import { Router } from 'express';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { requete } from '../db.js';
import { valider, dateAMJ } from '../lib/validation.js';
import { exiger, peut } from '../middleware/auth.js';
import { interdit } from '../lib/erreurs.js';
import { config } from '../config.js';

const r = Router();
r.use(exiger('rapports.voir'));

const fmtHeure = (d) => (d ? new Intl.DateTimeFormat('fr-FR', { timeZone: config.fuseau, hour: '2-digit', minute: '2-digit' }).format(d) : '');
const fmtDate = (s) => (s ? s.split('-').reverse().join('/') : '');
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : '—');
const STATUTS = { prevue: 'Prévue', en_cours: 'En cours', terminee: 'Terminée', absence_presumee: 'Absence présumée', depart_non_pointe: 'Départ non pointé' };
const ARRIVEES = { a_l_heure: "À l'heure", retard_en_attente: 'Retard (à examiner)', retard_justifie: 'Retard justifié', retard_non_justifie: 'Retard non justifié' };
const ABSENCES = { a_verifier: 'À vérifier', confirmee: 'Confirmée', justifiee: 'Justifiée' };

const BASE = `FROM seances s JOIN enseignants e ON e.id = s.enseignant_id JOIN domiciles d ON d.id = s.domicile_id
  JOIN marches m ON m.id = d.marche_id JOIN parents p ON p.id = d.parent_id
  WHERE s.statut <> 'annulee' AND s.debut_prevu <= UTC_TIMESTAMP() AND s.date_seance BETWEEN ? AND ?`;

function filtres(q) {
  let sql = '';
  const params = [];
  if (q.marche_id) { sql += ' AND d.marche_id = ?'; params.push(q.marche_id); }
  if (q.enseignant_id) { sql += ' AND s.enseignant_id = ?'; params.push(q.enseignant_id); }
  return { sql, params };
}

const AGREGATS = `COUNT(*) AS programmees, SUM(s.arrivee_reelle IS NOT NULL) AS presences,
  SUM(s.statut_arrivee = 'a_l_heure') AS a_l_heure,
  SUM(s.statut_arrivee IN ('retard_en_attente','retard_justifie','retard_non_justifie')) AS retards,
  SUM(s.statut = 'absence_presumee') AS absences, SUM(s.depart_anticipe_minutes > 0) AS departs_anticipes,
  SUM(s.statut = 'depart_non_pointe') AS sans_depart,
  SUM(TIMESTAMPDIFF(MINUTE, s.debut_prevu, s.fin_prevue)) AS minutes_prevues,
  COALESCE(SUM(s.duree_effective_minutes), 0) AS minutes_effectives`;

const RAPPORTS = {
  'presences-enseignants': {
    titre: 'Rapport des présences par enseignant',
    colonnes: [['enseignant', 'Enseignant', 150], ['telephone', 'Téléphone', 80], ['programmees', 'Programmées', 55], ['presences', 'Présences', 50],
      ['taux', 'Taux', 40], ['a_l_heure', "À l'heure", 45], ['retards', 'Retards', 45], ['absences', 'Absences', 50], ['departs_anticipes', 'Départs anticipés', 55], ['sans_depart', 'Sans départ', 50]],
    async donnees(debut, fin, f) {
      const l = await requete(`SELECT CONCAT(e.nom, ' ', e.prenoms) AS enseignant, e.telephone, ${AGREGATS} ${BASE}${f.sql} GROUP BY e.id ORDER BY e.nom`, [debut, fin, ...f.params]);
      return l.map((x) => ({ ...x, taux: pct(x.presences, x.programmees) }));
    },
  },
  retards: {
    titre: 'Rapport des retards',
    colonnes: [['date', 'Date', 55], ['enseignant', 'Enseignant', 130], ['marche', 'Marché', 90], ['domicile', 'Domicile', 60], ['prevue', 'Prévue', 40],
      ['reelle', 'Arrivée', 40], ['retard_minutes', 'Retard (min)', 50], ['statut', 'Qualification', 90], ['justification', 'Justification', 160]],
    async donnees(debut, fin, f) {
      const l = await requete(
        `SELECT s.date_seance, s.debut_prevu, s.arrivee_reelle, s.retard_minutes, s.statut_arrivee, CONCAT(e.nom, ' ', e.prenoms) AS enseignant,
           m.nom AS marche, d.code AS domicile,
           (SELECT j.texte FROM justifications j WHERE j.seance_id = s.id AND j.type = 'retard' ORDER BY j.id DESC LIMIT 1) AS justification
         ${BASE}${f.sql} AND s.statut_arrivee IN ('retard_en_attente','retard_justifie','retard_non_justifie') ORDER BY s.debut_prevu`, [debut, fin, ...f.params]);
      return l.map((x) => ({ ...x, date: fmtDate(x.date_seance), prevue: fmtHeure(x.debut_prevu), reelle: fmtHeure(x.arrivee_reelle), statut: ARRIVEES[x.statut_arrivee] }));
    },
  },
  absences: {
    titre: 'Rapport des absences présumées',
    colonnes: [['date', 'Date', 60], ['prevue', 'Heure prévue', 55], ['enseignant', 'Enseignant', 150], ['telephone', 'Téléphone', 85], ['marche', 'Marché', 100], ['domicile', 'Domicile', 60], ['parent', 'Parent', 130], ['traitement', 'Traitement', 70]],
    async donnees(debut, fin, f) {
      const l = await requete(
        `SELECT s.date_seance, s.debut_prevu, s.statut_absence, CONCAT(e.nom, ' ', e.prenoms) AS enseignant, e.telephone, m.nom AS marche, d.code AS domicile,
           CONCAT(p.nom, ' ', p.prenoms) AS parent ${BASE}${f.sql} AND s.statut = 'absence_presumee' ORDER BY s.debut_prevu`, [debut, fin, ...f.params]);
      return l.map((x) => ({ ...x, date: fmtDate(x.date_seance), prevue: fmtHeure(x.debut_prevu), traitement: ABSENCES[x.statut_absence] || '' }));
    },
  },
  durees: {
    titre: 'Rapport des durées effectives',
    colonnes: [['enseignant', 'Enseignant', 160], ['seances_terminees', 'Séances clôturées', 70], ['heures_prevues', 'Heures prévues', 70], ['heures_effectives', 'Heures effectives', 70], ['ecart', 'Écart', 60], ['taux', 'Réalisation', 60]],
    async donnees(debut, fin, f) {
      const l = await requete(
        `SELECT CONCAT(e.nom, ' ', e.prenoms) AS enseignant, COUNT(*) AS seances_terminees,
           SUM(TIMESTAMPDIFF(MINUTE, s.debut_prevu, s.fin_prevue)) AS minutes_prevues, SUM(s.duree_effective_minutes) AS minutes_effectives
         ${BASE}${f.sql} AND s.statut = 'terminee' GROUP BY e.id ORDER BY e.nom`, [debut, fin, ...f.params]);
      const h = (m) => `${Math.floor(Math.abs(m) / 60)} h ${String(Math.abs(m) % 60).padStart(2, '0')}`;
      return l.map((x) => ({
        ...x, heures_prevues: h(x.minutes_prevues), heures_effectives: h(x.minutes_effectives),
        ecart: `${x.minutes_effectives - x.minutes_prevues < 0 ? '−' : '+'}${h(x.minutes_effectives - x.minutes_prevues)}`,
        taux: pct(x.minutes_effectives, x.minutes_prevues),
      }));
    },
  },
  marches: {
    titre: 'Rapport par marché',
    colonnes: [['marche', 'Marché', 140], ['programmees', 'Programmées', 60], ['presences', 'Présences', 55], ['taux', 'Taux', 45], ['retards', 'Retards', 50], ['absences', 'Absences', 55], ['departs_anticipes', 'Départs anticipés', 65], ['heures_effectives', 'Heures effectives', 70]],
    async donnees(debut, fin, f) {
      const l = await requete(`SELECT m.nom AS marche, ${AGREGATS} ${BASE}${f.sql} GROUP BY m.id ORDER BY m.nom`, [debut, fin, ...f.params]);
      return l.map((x) => ({ ...x, taux: pct(x.presences, x.programmees), heures_effectives: `${Math.floor(x.minutes_effectives / 60)} h ${String(x.minutes_effectives % 60).padStart(2, '0')}` }));
    },
  },
};

r.get('/:type', async (req, res) => {
  const def = RAPPORTS[req.params.type];
  if (!def) return res.status(404).json({ message: 'Rapport inconnu' });
  const q = valider(z.object({ debut: dateAMJ, fin: dateAMJ, format: z.enum(['json', 'xlsx', 'pdf']).default('json') }), req.query);
  if (q.format !== 'json' && !peut(req, 'rapports.exporter')) throw interdit();
  const lignes = (await def.donnees(q.debut, q.fin, filtres(req.query))).map((l) =>
    Object.fromEntries(Object.entries(l).map(([k, v]) => [k, typeof v === 'string' && /^\d+(\.\d+)?$/.test(v) && k !== 'telephone' ? Number(v) : v])));
  const periode = `Du ${fmtDate(q.debut)} au ${fmtDate(q.fin)}`;
  const nomFichier = `${req.params.type}_${q.debut}_${q.fin}`;

  if (q.format === 'json') return res.json({ titre: def.titre, periode, colonnes: def.colonnes.map(([cle, libelle]) => ({ cle, libelle })), lignes });

  if (q.format === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Rapport');
    ws.addRow([def.titre]).font = { bold: true, size: 14 };
    ws.addRow([periode]);
    ws.addRow([]);
    const entete = ws.addRow(def.colonnes.map((c) => c[1]));
    entete.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    entete.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF142D4E' } }; });
    for (const l of lignes) ws.addRow(def.colonnes.map((c) => l[c[0]] ?? ''));
    def.colonnes.forEach((c, i) => { ws.getColumn(i + 1).width = Math.max(12, Math.round(c[2] / 5)); });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${nomFichier}.xlsx"`);
    await wb.xlsx.write(res);
    return res.end();
  }

  // PDF
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${nomFichier}.pdf"`);
  doc.pipe(res);
  doc.fillColor('#142D4E').fontSize(16).text(def.titre);
  doc.fillColor('#475569').fontSize(10).text(`${periode} — édité le ${new Intl.DateTimeFormat('fr-FR', { timeZone: config.fuseau, dateStyle: 'long', timeStyle: 'short' }).format(new Date())}`);
  doc.moveDown();
  const total = def.colonnes.reduce((s, c) => s + c[2], 0);
  const echelle = (doc.page.width - 60) / total;
  const largeurs = def.colonnes.map((c) => c[2] * echelle);
  const ligne = (vals, entete = false) => {
    const hauteur = Math.max(...vals.map((v, i) => doc.fontSize(8).heightOfString(String(v ?? ''), { width: largeurs[i] - 6 }))) + 8;
    if (doc.y + hauteur > doc.page.height - 30) doc.addPage();
    const y = doc.y;
    let x = 30;
    if (entete) doc.rect(30, y, doc.page.width - 60, hauteur).fill('#142D4E');
    vals.forEach((v, i) => {
      doc.fillColor(entete ? '#FFFFFF' : '#0F172A').fontSize(8).text(String(v ?? ''), x + 3, y + 4, { width: largeurs[i] - 6 });
      x += largeurs[i];
    });
    doc.moveTo(30, y + hauteur).lineTo(doc.page.width - 30, y + hauteur).strokeColor('#E2E8F0').stroke();
    doc.x = 30;
    doc.y = y + hauteur;
  };
  ligne(def.colonnes.map((c) => c[1]), true);
  if (!lignes.length) doc.fillColor('#475569').fontSize(10).text('Aucune donnée sur cette période.', 30, doc.y + 10);
  for (const l of lignes) ligne(def.colonnes.map((c) => l[c[0]]));
  doc.end();
});

export default r;
