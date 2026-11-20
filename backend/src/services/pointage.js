/**
 * Moteur de pointage des enseignants.
 *
 * Principes :
 *  - l'heure utilisée est TOUJOURS celle du serveur ;
 *  - le lieu est déterminé par le QR Code, jamais choisi par l'enseignant ;
 *  - l'intervention attendue est retrouvée automatiquement (affectation + emploi du temps) ;
 *  - chaque tentative, acceptée ou rejetée, est journalisée (table pointages, ajout seul) ;
 *  - une réponse positive n'est renvoyée qu'après validation de la transaction en base.
 *
 * Limites assumées : un QR photographié ou une position GPS falsifiée restent possibles.
 * Le système les rend plus difficiles et trace les incohérences pour examen humain.
 */
import { transaction } from '../db.js';
import { maintenant, dateLocale, heureLocale, minutesEntre, ajouterMinutes } from '../lib/horloge.js';
import { lireParametres } from '../lib/parametres.js';
import { evaluerPosition } from '../lib/geo.js';
import { identiteConforme, normaliserTelephone } from '../lib/identite.js';
import { sha256, signer, verifierSignature } from '../lib/securite.js';
import { creerAnomalie } from './anomalies.js';
import { genererSeances, traiterEcheances } from './seances.js';

const DUREE_CONFIRMATION_S = 15 * 60;
const MSG_IDENTIFICATION = "Identification impossible. Vérifiez votre numéro de téléphone et votre nom, puis réessayez.";

function lireGps(position) {
  if (!position) return { erreur: 'indisponible' };
  if (position.erreur) return { erreur: position.erreur === 'refuse' ? 'refuse' : 'indisponible' };
  const lat = Number(position.latitude);
  const lng = Number(position.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return { erreur: 'indisponible' };
  const precision = Number(position.precision);
  return { latitude: lat, longitude: lng, precision: Number.isFinite(precision) ? Math.round(precision * 10) / 10 : null };
}

async function journaliser(conn, ctx, p) {
  const gps = ctx.gps && !ctx.gps.erreur ? ctx.gps : {};
  const [r] = await conn.query(
    `INSERT INTO pointages (type, resultat, motif_rejet, seance_id, qr_code_id, domicile_id, enseignant_id,
       telephone_saisi, nom_saisi, heure_serveur, heure_appareil, latitude, longitude, precision_m, distance_m,
       statut_gps, controles, ip, user_agent)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [p.type || 'inconnu', p.resultat, p.motif || null, p.seance_id ?? null, ctx.qr?.id ?? null, ctx.qr?.domicile_id ?? null,
      ctx.enseignant?.id ?? null, String(ctx.entree.telephone || '').slice(0, 30), String(ctx.entree.nom || '').slice(0, 255),
      p.heure || ctx.t, ctx.entree.heureAppareil ? String(ctx.entree.heureAppareil).slice(0, 40) : null,
      gps.latitude ?? null, gps.longitude ?? null, gps.precision ?? null, p.evalGps?.distance ?? null,
      p.evalGps?.statut ?? null, JSON.stringify(p.controles || ctx.controles), ctx.entree.ip || null,
      String(ctx.entree.userAgent || '').slice(0, 255)],
  );
  return r.insertId;
}

function rejet(message, extra = {}) {
  return { statut: 'rejete', message, ...extra };
}

/** Point d'entrée unique du pointage (arrivée ou départ, déterminé par le serveur). */
export async function traiterPointage(entree) {
  const t = maintenant();
  const aujourdHui = dateLocale(t);
  const p = await lireParametres();
  // Garantit l'existence des séances du jour (idempotent) et clôt les séances échues
  // (absences présumées, départs non pointés) même si la tâche planifiée n'est pas encore passée :
  // une séance ancienne restée ouverte ne doit jamais être clôturée par un scan ultérieur.
  await genererSeances(aujourdHui, aujourdHui);
  await traiterEcheances();

  return transaction(async (conn) => {
    const ctx = { t, entree, controles: {}, gps: lireGps(entree.position) };

    // 1-2. Validité du QR Code et domicile correspondant
    const [[qr]] = await conn.query(
      `SELECT q.id, q.statut, q.domicile_id, d.code AS domicile_code, d.actif AS domicile_actif,
              d.latitude, d.longitude, d.rayon_tolerance_m
       FROM qr_codes q JOIN domiciles d ON d.id = q.domicile_id WHERE q.jeton_hash = ?`,
      [sha256(String(entree.jeton || ''))],
    );
    if (!qr) {
      ctx.controles.qr = 'inconnu';
      const pid = await journaliser(conn, ctx, { resultat: 'rejete', motif: 'qr_inconnu' });
      await creerAnomalie(conn, {
        type: 'qr_invalide', gravite: 'moyenne', pointage_id: pid,
        description: `Scan d'un QR Code inconnu (numéro saisi : ${String(entree.telephone || '-').slice(0, 20)})`,
        cle: `qr-inconnu-${entree.ip || ''}-${aujourdHui}-${t.getUTCHours()}`,
      });
      return rejet("Ce QR Code n'est pas reconnu. Signalez-le à l'administration.");
    }
    ctx.qr = qr;
    if (qr.statut !== 'actif' || !qr.domicile_actif) {
      ctx.controles.qr = qr.statut !== 'actif' ? 'revoque' : 'domicile_inactif';
      const pid = await journaliser(conn, ctx, { resultat: 'rejete', motif: qr.statut !== 'actif' ? 'qr_revoque' : 'domicile_inactif' });
      await creerAnomalie(conn, {
        type: 'qr_invalide', gravite: 'elevee', pointage_id: pid, domicile_id: qr.domicile_id,
        description: `Scan d'un QR Code ${qr.statut !== 'actif' ? 'révoqué' : "d'un domicile désactivé"} (domicile ${qr.domicile_code})`,
        cle: `qr-revoque-${qr.id}-${aujourdHui}`,
      });
      return rejet("Ce QR Code n'est plus valide. Contactez l'administration.");
    }
    ctx.controles.qr = 'valide';

    // 3. Identité de l'enseignant
    const tel = normaliserTelephone(entree.telephone);
    if (!tel) {
      return rejet('Numéro de téléphone invalide. Saisissez les 10 chiffres de votre numéro.', { champ: 'telephone' });
    }
    const [[ens]] = await conn.query(
      'SELECT id, nom, prenoms, telephone, actif FROM enseignants WHERE telephone = ? FOR UPDATE', [tel]);
    if (!ens) {
      ctx.controles.identite = 'telephone_inconnu';
      await journaliser(conn, ctx, { resultat: 'rejete', motif: 'telephone_inconnu' });
      return rejet(MSG_IDENTIFICATION);
    }
    ctx.enseignant = ens;
    if (!identiteConforme(entree.nom, ens.nom, ens.prenoms)) {
      ctx.controles.identite = 'nom_non_conforme';
      const pid = await journaliser(conn, ctx, { resultat: 'rejete', motif: 'identite_non_conforme' });
      await creerAnomalie(conn, {
        type: 'identite_non_conforme', gravite: 'moyenne', pointage_id: pid, enseignant_id: ens.id, domicile_id: qr.domicile_id,
        description: `Le nom saisi (« ${String(entree.nom || '').slice(0, 80)} ») ne correspond pas au titulaire du numéro`,
        cle: `identite-${ens.id}-${qr.domicile_id}-${aujourdHui}`,
      });
      return rejet(MSG_IDENTIFICATION);
    }
    if (!ens.actif) {
      ctx.controles.identite = 'enseignant_inactif';
      await journaliser(conn, ctx, { resultat: 'rejete', motif: 'enseignant_inactif' });
      return rejet("Votre compte enseignant est désactivé. Contactez l'administration.");
    }
    ctx.controles.identite = 'conforme';

    // Confirmation après saisie d'une justification (jeton signé émis au premier scan)
    let confirmation = null;
    if (entree.confirmation) {
      confirmation = verifierSignature(entree.confirmation, t.getTime());
      if (!confirmation || confirmation.e !== ens.id || confirmation.q !== qr.id) {
        return rejet('La confirmation a expiré. Veuillez scanner à nouveau le QR Code.');
      }
    }

    // Séance déjà ouverte : départ, ou conflit si elle est ailleurs
    const [ouvertes] = await conn.query(
      `SELECT s.*, d.code AS domicile_code FROM seances s JOIN domiciles d ON d.id = s.domicile_id
       WHERE s.enseignant_id = ? AND s.statut = 'en_cours' ORDER BY s.arrivee_reelle DESC FOR UPDATE`, [ens.id]);
    const ouverteIci = ouvertes.find((s) => s.domicile_id === qr.domicile_id);
    if (ouverteIci) return traiterDepart(conn, ctx, p, ouverteIci, entree, confirmation);
    if (ouvertes.length) {
      const autre = ouvertes[0];
      ctx.controles.seance = 'ouverte_ailleurs';
      const pid = await journaliser(conn, ctx, { type: 'arrivee', resultat: 'rejete', motif: 'seance_ouverte_ailleurs' });
      await creerAnomalie(conn, {
        type: 'double_pointage', gravite: 'elevee', pointage_id: pid, seance_id: autre.id, enseignant_id: ens.id, domicile_id: qr.domicile_id,
        description: `Tentative d'arrivée au domicile ${qr.domicile_code} alors qu'une séance est encore ouverte au domicile ${autre.domicile_code}`,
        cle: `conflit-${autre.id}-${qr.domicile_id}`,
      });
      return rejet(`Une séance est encore ouverte à votre nom dans un autre domicile (${autre.domicile_code}). Pointez d'abord votre départ là-bas ou contactez l'administration.`);
    }

    return traiterArrivee(conn, ctx, p, entree, confirmation);
  });
}

async function verifierGps(conn, ctx, p, type, seance) {
  const evalGps = evaluerPosition({
    position: ctx.gps, domicile: ctx.qr, rayonDefaut: p.rayon_gps_metres, precisionMax: p.precision_gps_max_metres,
  });
  ctx.controles.gps = evalGps;
  const conforme = evalGps.statut === 'conforme';
  const bloque = !conforme && evalGps.statut !== 'non_verifiable' && p.gps_bloquant === 1;
  if (bloque) {
    const pid = await journaliser(conn, ctx, { type, resultat: 'rejete', motif: 'gps_non_conforme', seance_id: seance.id, evalGps });
    await creerAnomalie(conn, {
      type: 'gps_non_conforme', gravite: 'elevee', pointage_id: pid, seance_id: seance.id,
      enseignant_id: ctx.enseignant.id, domicile_id: ctx.qr.domicile_id,
      description: `Pointage refusé : ${evalGps.message}`, cle: `gps-bloque-${seance.id}-${type}`,
    });
  }
  return { evalGps, conforme, bloque };
}

async function anomalieGps(conn, ctx, evalGps, pid, seance, type) {
  if (evalGps.statut === 'conforme') return;
  const nonVerifiable = evalGps.statut === 'non_verifiable';
  await creerAnomalie(conn, {
    type: 'gps_non_conforme',
    gravite: nonVerifiable ? 'info' : evalGps.statut === 'hors_zone' ? 'elevee' : 'moyenne',
    pointage_id: pid, seance_id: seance.id, enseignant_id: ctx.enseignant.id, domicile_id: ctx.qr.domicile_id,
    description: `${type === 'arrivee' ? 'Arrivée' : 'Départ'} : ${evalGps.message}`,
    cle: nonVerifiable ? `gps-nv-${ctx.qr.domicile_id}-${dateLocale(ctx.t)}` : `gps-${seance.id}-${type}`,
  });
}

function messageGps(evalGps) {
  if (evalGps.statut === 'conforme') return 'Position vérifiée.';
  return "Votre position n'a pas pu être confirmée : ce pointage sera examiné par l'administration.";
}

async function traiterArrivee(conn, ctx, p, entree, confirmation) {
  const { t, qr, enseignant: ens } = ctx;
  const aujourdHui = dateLocale(t);

  // 4. Affectation valide à ce domicile
  const [[aff]] = await conn.query(
    `SELECT id FROM affectations WHERE enseignant_id = ? AND domicile_id = ? AND actif = 1
       AND date_debut <= ? AND (date_fin IS NULL OR date_fin >= ?) LIMIT 1`,
    [ens.id, qr.domicile_id, aujourdHui, aujourdHui]);
  if (!aff) {
    ctx.controles.affectation = 'absente';
    const pid = await journaliser(conn, ctx, { type: 'arrivee', resultat: 'rejete', motif: 'non_affecte' });
    await creerAnomalie(conn, {
      type: 'enseignant_non_affecte', gravite: 'elevee', pointage_id: pid, enseignant_id: ens.id, domicile_id: qr.domicile_id,
      description: `Tentative de pointage au domicile ${qr.domicile_code} sans affectation valide`,
      cle: `nonaff-${ens.id}-${qr.domicile_id}-${aujourdHui}`,
    });
    return rejet("Vous n'êtes pas affecté(e) à ce domicile. Votre tentative a été transmise à l'administration.");
  }
  ctx.controles.affectation = 'valide';

  // 5-6. Emploi du temps et heure du serveur : recherche automatique de l'intervention attendue
  const [seances] = await conn.query(
    `SELECT s.*, m.libelle AS matiere FROM seances s
     JOIN affectations a ON a.id = s.affectation_id JOIN matieres m ON m.id = a.matiere_id
     WHERE s.enseignant_id = ? AND s.domicile_id = ? AND s.date_seance = ? AND s.statut <> 'annulee'
     ORDER BY s.debut_prevu FOR UPDATE`,
    [ens.id, qr.domicile_id, aujourdHui]);

  let seance = null;
  let heureArrivee = t;
  if (confirmation) {
    seance = seances.find((s) => s.id === confirmation.s && confirmation.type === 'arrivee');
    if (!seance || seance.statut !== 'prevue') return rejet('La confirmation ne correspond plus à une séance ouverte au pointage. Scannez à nouveau.');
    heureArrivee = new Date(confirmation.t);
  } else {
    seance = seances.find((s) => s.statut === 'prevue'
      && t >= ajouterMinutes(s.debut_prevu, -p.ouverture_pointage_minutes)
      && t <= ajouterMinutes(s.debut_prevu, p.fermeture_pointage_minutes));
  }

  if (!seance) {
    const aVenir = seances.find((s) => s.statut === 'prevue' && ajouterMinutes(s.debut_prevu, -p.ouverture_pointage_minutes) > t);
    if (aVenir) {
      // Arrivée anticipée : on ne valide rien, l'enseignant doit patienter.
      ctx.controles.planning = 'avant_ouverture';
      const ouverture = ajouterMinutes(aVenir.debut_prevu, -p.ouverture_pointage_minutes);
      const pid = await journaliser(conn, ctx, { type: 'arrivee', resultat: 'rejete', motif: 'arrivee_anticipee', seance_id: aVenir.id });
      await creerAnomalie(conn, {
        type: 'arrivee_anticipee', gravite: 'info', pointage_id: pid, seance_id: aVenir.id, enseignant_id: ens.id, domicile_id: qr.domicile_id,
        description: `Scan à ${heureLocale(t)} pour un cours prévu à ${heureLocale(aVenir.debut_prevu)} (pointage ouvert à ${heureLocale(ouverture)})`,
        cle: `anticipee-${aVenir.id}`,
      });
      return {
        statut: 'trop_tot',
        message: `Vous êtes arrivé(e) avant l'heure autorisée. Le pointage ouvrira à ${heureLocale(ouverture)}. Merci de patienter puis de scanner à nouveau.`,
        heure_prevue: heureLocale(aVenir.debut_prevu),
        heure_ouverture: heureLocale(ouverture),
        heure_actuelle: heureLocale(t),
      };
    }
    const cloturee = [...seances].reverse().find((s) => ['terminee', 'depart_non_pointe'].includes(s.statut));
    const manquee = [...seances].reverse().find((s) => ['prevue', 'absence_presumee'].includes(s.statut));
    if (cloturee && !manquee) {
      ctx.controles.planning = 'seance_cloturee';
      const pid = await journaliser(conn, ctx, { type: 'arrivee', resultat: 'rejete', motif: 'double_pointage', seance_id: cloturee.id });
      await creerAnomalie(conn, {
        type: 'double_pointage', gravite: 'moyenne', pointage_id: pid, seance_id: cloturee.id, enseignant_id: ens.id, domicile_id: qr.domicile_id,
        description: `Nouveau scan à ${heureLocale(t)} alors que la séance du jour est déjà clôturée`,
        cle: `double-cloturee-${cloturee.id}`,
      });
      return rejet(cloturee.statut === 'terminee'
        ? `Votre séance du jour est déjà clôturée (arrivée ${heureLocale(cloturee.arrivee_reelle)}, départ ${heureLocale(cloturee.depart_reel)}).`
        : "Votre séance a été clôturée automatiquement faute de pointage de départ dans le délai. Contactez l'administration.");
    }
    if (manquee) {
      ctx.controles.planning = 'fenetre_fermee';
      const retard = minutesEntre(manquee.debut_prevu, t);
      const pid = await journaliser(conn, ctx, { type: 'arrivee', resultat: 'rejete', motif: 'fenetre_fermee', seance_id: manquee.id });
      await creerAnomalie(conn, {
        type: 'hors_planning', gravite: 'elevee', pointage_id: pid, seance_id: manquee.id, enseignant_id: ens.id, domicile_id: qr.domicile_id,
        description: `Arrivée à ${heureLocale(t)} après la fermeture du pointage (cours prévu à ${heureLocale(manquee.debut_prevu)}, ${retard} min de retard)`,
        cle: `fenetre-${manquee.id}`,
      });
      return rejet(`Le pointage de votre cours de ${heureLocale(manquee.debut_prevu)} est fermé (${retard} minutes de retard). Votre passage a été signalé à l'administration.`);
    }
    ctx.controles.planning = 'aucun_cours';
    const pid = await journaliser(conn, ctx, { type: 'arrivee', resultat: 'rejete', motif: 'hors_planning' });
    await creerAnomalie(conn, {
      type: 'hors_planning', gravite: 'moyenne', pointage_id: pid, enseignant_id: ens.id, domicile_id: qr.domicile_id,
      description: `Scan à ${heureLocale(t)} sans cours programmé ce jour à ce domicile`,
      cle: `horsplanning-${ens.id}-${qr.domicile_id}-${aujourdHui}`,
    });
    return rejet("Aucun cours n'est programmé pour vous à ce domicile aujourd'hui. Contactez l'administration en cas d'erreur.");
  }
  ctx.controles.planning = 'conforme';

  // 7. Position GPS
  const { evalGps, bloque } = await verifierGps(conn, ctx, p, 'arrivee', seance);
  if (bloque) return rejet(`${evalGps.message}. Activez la localisation de votre téléphone et réessayez depuis le domicile.`, { gps: evalGps.statut });

  const retard = minutesEntre(seance.debut_prevu, heureArrivee);
  const enRetard = retard > p.tolerance_retard_minutes;
  ctx.controles.horaire = { heure_prevue: seance.debut_prevu, retard_minutes: retard, tolerance: p.tolerance_retard_minutes };

  if (enRetard) {
    const texte = String(entree.justification || '').trim();
    if (!confirmation || texte.length < 10) {
      // Rien n'est enregistré tant que l'enseignant n'a pas justifié et confirmé.
      return {
        statut: 'justification_requise',
        type: 'retard',
        message: `Vous êtes en retard de ${retard} minutes. Expliquez la raison de votre retard pour enregistrer votre arrivée.`,
        heure_prevue: heureLocale(seance.debut_prevu),
        heure_reelle: heureLocale(heureArrivee),
        retard_minutes: retard,
        erreur: confirmation ? 'La justification doit contenir au moins 10 caractères.' : undefined,
        confirmation: confirmation ? entree.confirmation
          : signer({ s: seance.id, e: ens.id, q: qr.id, t: heureArrivee.getTime(), type: 'arrivee' }, DUREE_CONFIRMATION_S, t.getTime()),
      };
    }
  }

  // 8. Enregistrement (contrainte d'unicité + garde sur le statut contre le double pointage)
  const pid = await journaliser(conn, ctx, {
    type: 'arrivee', resultat: 'accepte', seance_id: seance.id, heure: heureArrivee, evalGps,
    controles: { ...ctx.controles, heure_confirmation: confirmation ? t : undefined },
  });
  const [maj] = await conn.query(
    `UPDATE seances SET arrivee_reelle = ?, retard_minutes = ?, statut = 'en_cours', statut_arrivee = ?
     WHERE id = ? AND statut = 'prevue'`,
    [heureArrivee, Math.max(0, retard), enRetard ? 'retard_en_attente' : 'a_l_heure', seance.id]);
  if (maj.affectedRows !== 1) throw new Error('Conflit de mise à jour de séance');

  if (enRetard) {
    await conn.query('INSERT INTO justifications (seance_id, pointage_id, type, texte, cree_le) VALUES (?,?,?,?,?)',
      [seance.id, pid, 'retard', String(entree.justification).trim().slice(0, 2000), t]);
    await creerAnomalie(conn, {
      type: 'retard_non_justifie', gravite: 'moyenne', pointage_id: pid, seance_id: seance.id, enseignant_id: ens.id, domicile_id: qr.domicile_id,
      description: `Retard de ${retard} min (prévu ${heureLocale(seance.debut_prevu)}, arrivée ${heureLocale(heureArrivee)}) — justification en attente d'examen`,
      cle: `retard-${seance.id}`,
    });
  }
  await anomalieGps(conn, ctx, evalGps, pid, seance, 'arrivee');

  return {
    statut: 'arrivee_enregistree',
    message: enRetard
      ? 'Votre arrivée en retard et votre justification ont été enregistrées. Bon cours !'
      : 'Vérifications conformes. Votre arrivée est enregistrée. Bon cours !',
    heure_prevue: heureLocale(seance.debut_prevu),
    heure_arrivee: heureLocale(heureArrivee),
    fin_prevue: heureLocale(seance.fin_prevue),
    retard_minutes: Math.max(0, retard),
    en_retard: enRetard,
    matiere: seance.matiere,
    domicile: qr.domicile_code,
    gps: messageGps(evalGps),
  };
}

async function traiterDepart(conn, ctx, p, seance, entree, confirmation) {
  const { t, qr, enseignant: ens } = ctx;
  ctx.controles.seance = 'ouverte';

  const depuisArrivee = minutesEntre(seance.arrivee_reelle, t);
  if (!confirmation && depuisArrivee < p.delai_min_avant_depart_minutes) {
    ctx.controles.depart = 'trop_proche_arrivee';
    const pid = await journaliser(conn, ctx, { type: 'depart', resultat: 'rejete', motif: 'double_pointage', seance_id: seance.id });
    await creerAnomalie(conn, {
      type: 'double_pointage', gravite: 'info', pointage_id: pid, seance_id: seance.id, enseignant_id: ens.id, domicile_id: qr.domicile_id,
      description: `Nouveau scan ${depuisArrivee} min après l'arrivée`, cle: `double-arrivee-${seance.id}`,
    });
    return {
      statut: 'deja_arrive',
      message: `Votre arrivée a déjà été enregistrée à ${heureLocale(seance.arrivee_reelle)}. Scannez à nouveau le QR Code à la fin du cours pour pointer votre départ.`,
      heure_arrivee: heureLocale(seance.arrivee_reelle),
      fin_prevue: heureLocale(seance.fin_prevue),
    };
  }

  let heureDepart = t;
  if (confirmation) {
    if (confirmation.type !== 'depart' || confirmation.s !== seance.id) return rejet('La confirmation a expiré. Veuillez scanner à nouveau le QR Code.');
    heureDepart = new Date(confirmation.t);
  }

  const { evalGps, bloque } = await verifierGps(conn, ctx, p, 'depart', seance);
  if (bloque) return rejet(`${evalGps.message}. Activez la localisation de votre téléphone et réessayez depuis le domicile.`, { gps: evalGps.statut });

  const avance = minutesEntre(heureDepart, seance.fin_prevue);
  const anticipe = avance > p.depart_anticipe_seuil_minutes;
  const texte = String(entree.justification || '').trim();
  if (anticipe && p.justification_depart_anticipe_obligatoire === 1 && (!confirmation || texte.length < 10)) {
    return {
      statut: 'justification_requise',
      type: 'depart_anticipe',
      message: `Votre cours se termine à ${heureLocale(seance.fin_prevue)}. Vous partez ${avance} minutes plus tôt : expliquez la raison pour enregistrer votre départ.`,
      heure_prevue: heureLocale(seance.fin_prevue),
      heure_reelle: heureLocale(heureDepart),
      avance_minutes: avance,
      erreur: confirmation ? 'La justification doit contenir au moins 10 caractères.' : undefined,
      confirmation: confirmation ? entree.confirmation
        : signer({ s: seance.id, e: ens.id, q: qr.id, t: heureDepart.getTime(), type: 'depart' }, DUREE_CONFIRMATION_S, t.getTime()),
    };
  }

  const duree = minutesEntre(seance.arrivee_reelle, heureDepart);
  ctx.controles.depart = { fin_prevue: seance.fin_prevue, avance_minutes: avance, duree_minutes: duree };
  const pid = await journaliser(conn, ctx, {
    type: 'depart', resultat: 'accepte', seance_id: seance.id, heure: heureDepart, evalGps,
    controles: { ...ctx.controles, heure_confirmation: confirmation ? t : undefined },
  });
  const [maj] = await conn.query(
    `UPDATE seances SET depart_reel = ?, duree_effective_minutes = ?, depart_anticipe_minutes = ?, statut = 'terminee'
     WHERE id = ? AND statut = 'en_cours'`,
    [heureDepart, duree, anticipe ? avance : 0, seance.id]);
  if (maj.affectedRows !== 1) throw new Error('Conflit de mise à jour de séance');

  if (anticipe) {
    if (texte.length >= 10) {
      await conn.query('INSERT INTO justifications (seance_id, pointage_id, type, texte, cree_le) VALUES (?,?,?,?,?)',
        [seance.id, pid, 'depart_anticipe', texte.slice(0, 2000), t]);
    }
    await creerAnomalie(conn, {
      type: 'depart_anticipe', gravite: 'moyenne', pointage_id: pid, seance_id: seance.id, enseignant_id: ens.id, domicile_id: qr.domicile_id,
      description: `Départ à ${heureLocale(heureDepart)} pour une fin prévue à ${heureLocale(seance.fin_prevue)} (${avance} min plus tôt)`,
      cle: `depart-anticipe-${seance.id}`,
    });
  }
  if (duree > p.duree_max_seance_minutes) {
    await creerAnomalie(conn, {
      type: 'hors_planning', gravite: 'moyenne', pointage_id: pid, seance_id: seance.id, enseignant_id: ens.id, domicile_id: qr.domicile_id,
      description: `Durée de séance de ${duree} min supérieure au maximum autorisé (${p.duree_max_seance_minutes} min)`,
      cle: `duree-max-${seance.id}`,
    });
  }
  await anomalieGps(conn, ctx, evalGps, pid, seance, 'depart');

  return {
    statut: 'depart_enregistre',
    message: 'Votre départ est enregistré. La séance est clôturée. Merci !',
    heure_arrivee: heureLocale(seance.arrivee_reelle),
    heure_depart: heureLocale(heureDepart),
    duree_minutes: duree,
    depart_anticipe: anticipe,
    domicile: qr.domicile_code,
    gps: messageGps(evalGps),
  };
}
