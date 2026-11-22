// Serveur de DÉMONSTRATION exécuté dans le navigateur (version GitHub Pages uniquement).
// Il répond aux appels de l'interface à partir d'un instantané de données fictives (DÉMO)
// capturé sur la vraie API (scripts/demo/capturer.mjs). Aucune donnée réelle, aucun serveur.
//
// - Les dates de l'instantané sont avancées d'un nombre entier de semaines pour paraître récentes
//   (les jours de la semaine restent cohérents avec les emplois du temps).
// - Les filtres et la pagination des listes sont rejoués ici.
// - Les modifications sont simulées en mémoire et disparaissent au rechargement de la page.

import { DECALAGE_JOURS, INSTANT } from './horlogeDemo.js';

const MDP_DEMO = 'DemoPresences2026';
const CLE_SESSION = 'demo_compte';
let instantane = null;
async function charger() {
  if (!instantane) {
    const r = await fetch(`${import.meta.env.BASE_URL}demo/instantane.json`, { cache: 'no-cache' });
    if (!r.ok) throw new Error('instantané introuvable');
    instantane = await r.json();
  }
  return instantane;
}

// ---------- Dates ----------
function decalerIso(iso, jours) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}
function decalerTexte(texte, jours) {
  if (!jours) return texte;
  return texte
    .replace(/\b(\d{4}-\d{2}-\d{2})(?=[T"])/g, (m, iso) => decalerIso(iso, jours))
    .replace(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g, (m, j, mo, a) => {
      const [y, mm, dd] = decalerIso(`${a}-${mo}-${j}`, jours).split('-');
      return `${dd}/${mm}/${y}`;
    });
}
const versVisiteur = (donnees) => JSON.parse(decalerTexte(JSON.stringify(donnees), DECALAGE_JOURS));
const versInstantane = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? decalerIso(iso, -DECALAGE_JOURS) : iso);

// ---------- Clés d'instantané ----------
function analyser(url) {
  const [chemin, qs = ''] = url.split('?');
  const params = {};
  for (const [k, v] of new URLSearchParams(qs)) if (v !== '' && k !== '_' && k !== 'v') params[k] = versInstantane(v);
  return { chemin, params };
}
function cle(chemin, params) {
  const p = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  return p.length ? `${chemin}?${new URLSearchParams(p)}` : chemin;
}
const copie = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));

// ---------- Modifications simulées (mémoire de l'onglet) ----------
const modifs = {}; // "ressource:id" -> champs fusionnés
const crees = {}; // ressource -> éléments ajoutés
const observations = {}; // "ressource:id" -> observations ajoutées
let parametres = null;
let permissionsSup = null;
let idSuivant = 9000;

function fusionner(ressource, id, champs) {
  const k = `${ressource}:${id}`;
  modifs[k] = { ...(modifs[k] || {}), ...champs };
}
function appliquer(ressource, el) {
  if (!el || typeof el !== 'object' || el.id == null) return el;
  const m = modifs[`${ressource}:${el.id}`];
  const obs = observations[`${ressource}:${el.id}`];
  const r = m ? { ...el, ...m } : el;
  if (obs && Array.isArray(r.observations)) r.observations = [...r.observations, ...obs];
  return r;
}

// ---------- Filtres des listes (mêmes règles que l'API) ----------
function marcheDe(donnees, el) {
  if (el.marche_id != null) return String(el.marche_id);
  const d = (donnees.get['/domiciles'] || []).find((x) => x.id === el.domicile_id);
  return d ? String(d.marche_id) : '';
}
function egal(champ) {
  return (el, v) => String(el[champ]) === String(v);
}
const FILTRES = {
  '/presences': {
    base: '/presences?debut=2000-01-01&fin=2100-01-01&inclure_futures=1&taille=200',
    regles: {
      debut: (el, v) => el.date_seance >= v,
      fin: (el, v) => el.date_seance <= v,
      enseignant_id: egal('enseignant_id'),
      domicile_id: egal('domicile_id'),
      statut: (el, v) => (v === 'en_retard' ? ['retard_en_attente', 'retard_justifie', 'retard_non_justifie'].includes(el.statut_arrivee)
        : v === 'depart_anticipe' ? el.depart_anticipe_minutes > 0 : el.statut === v),
    },
    toujours: (el, p) => el.statut !== 'annulee'
      && (p.statut === 'prevue' || p.inclure_futures === '1' || el.statut !== 'prevue' || Date.parse(el.debut_prevu) <= INSTANT),
  },
  '/anomalies': {
    base: '/anomalies?taille=200',
    regles: {
      type: egal('type'), statut: egal('statut'), gravite: egal('gravite'),
      enseignant_id: egal('enseignant_id'), domicile_id: egal('domicile_id'),
      ouvertes: (el, v) => v !== '1' || ['a_examiner', 'en_cours'].includes(el.statut),
      debut: (el, v) => el.cree_le.slice(0, 10) >= v,
      fin: (el, v) => el.cree_le.slice(0, 10) <= v,
    },
  },
  '/audit': {
    base: '/audit?taille=200',
    regles: {
      entite: egal('entite'), action: egal('action'), utilisateur_id: egal('utilisateur_id'),
      debut: (el, v) => el.date_action.slice(0, 10) >= v,
      fin: (el, v) => el.date_action.slice(0, 10) <= v,
    },
  },
  '/justifications': { base: '/justifications', regles: { statut: egal('statut'), type: egal('type') } },
  '/affectations': {
    base: '/affectations',
    regles: {
      enseignant_id: egal('enseignant_id'), domicile_id: egal('domicile_id'),
      en_cours: (el, v) => v !== '1' || (el.actif === 1 && (!el.date_fin || el.date_fin >= instantane.meta.date)),
    },
  },
  '/plannings': {
    base: '/plannings?actif=tous',
    regles: { enseignant_id: egal('enseignant_id'), domicile_id: egal('domicile_id'), actif: () => true },
    toujours: (el, p) => p.actif === 'tous' || el.actif === 1,
  },
};

function filtrer(donnees, chemin, params) {
  const f = FILTRES[chemin];
  const brut = copie(donnees.get[f.base]);
  const pagine = !Array.isArray(brut);
  const ressource = chemin.slice(1);
  let liste = [...(crees[ressource] || []), ...(pagine ? brut.donnees : brut)].map((el) => appliquer(ressource, el));
  liste = liste.filter((el) => (!f.toujours || f.toujours(el, params))
    && Object.entries(params).every(([k, v]) => {
      if (k === 'marche_id') return marcheDe(donnees, el) === String(v);
      const regle = f.regles[k];
      return !regle || regle(el, v);
    }));
  if (!pagine) return liste;
  const taille = Math.min(200, Math.max(1, parseInt(params.taille, 10) || 25));
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  return { donnees: liste.slice((page - 1) * taille, page * taille), total: liste.length, page, taille };
}

// ---------- Réponses ----------
const ok = (donnees) => ({ statut: 200, donnees });
const erreur = (statut, message) => ({ statut, donnees: { message } });
const INDISPONIBLE = "Cette action n'est pas disponible dans la démonstration en ligne. Installez la plateforme pour l'utiliser réellement.";

function session(donnees) {
  let email = null;
  try { email = localStorage.getItem(CLE_SESSION); } catch { /* stockage indisponible */ }
  return email ? donnees.comptes[email] : null;
}

function lire(donnees, url) {
  const { chemin, params } = analyser(url);
  if (FILTRES[chemin]) return ok(filtrer(donnees, chemin, params));

  if (chemin === '/plannings/calendrier') {
    const evts = copie(donnees.get[cle(chemin, { debut: params.debut, fin: params.fin })]) || [];
    const plannings = donnees.get['/plannings?actif=tous'];
    const garde = Object.entries(params).filter(([k]) => ['enseignant_id', 'domicile_id', 'marche_id'].includes(k));
    if (!garde.length) return ok(evts);
    return ok(evts.filter((e) => {
      const c = plannings.find((x) => x.id === e.creneau_id);
      return c && garde.every(([k, v]) => String(c[k]) === String(v));
    }));
  }

  if (chemin.startsWith('/rapports/')) {
    const exact = donnees.get[cle(chemin, params)];
    if (exact) return ok(copie(exact));
    // Autre période : on garde la période capturée (30 jours) avec le même filtre.
    const defaut = Object.keys(donnees.get).find((k) => k.startsWith(`${chemin}?`)
      && ['marche_id', 'enseignant_id'].every((f) => (params[f] ? k.includes(`${f}=${params[f]}&`) || k.endsWith(`${f}=${params[f]}`) : !k.includes(f))));
    return defaut ? ok(copie(donnees.get[defaut])) : erreur(404, 'Rapport indisponible dans la démonstration.');
  }

  if (chemin === '/parametres' && parametres) {
    return ok(copie(donnees.get['/parametres']).map((p) => (p.cle in parametres ? { ...p, valeur: parametres[p.cle] } : p)));
  }
  if (chemin === '/utilisateurs/permissions' && permissionsSup) {
    return ok(copie(donnees.get[chemin]).map((p) => ({ ...p, superviseur: permissionsSup.includes(p.cle) })));
  }

  const [, ressource, id] = chemin.split('/');
  const exact = donnees.get[cle(chemin, params)] ?? donnees.get[chemin];
  if (exact !== undefined) {
    const r = copie(exact);
    if (Array.isArray(r)) return ok([...(crees[ressource] || []), ...r].map((el) => appliquer(ressource, el)));
    return ok(appliquer(ressource, r));
  }
  if (id && (crees[ressource] || []).some((x) => String(x.id) === id)) {
    return erreur(404, "La fiche détaillée d'un élément ajouté pendant la démonstration n'est pas disponible.");
  }
  return erreur(404, "Cette donnée n'existe pas dans la démonstration.");
}

function ecrire(donnees, methode, url, corpsVisiteur = {}) {
  const { chemin } = analyser(url);
  // Les dates saisies par le visiteur sont ramenées dans le repère de l'instantané.
  const corps = JSON.parse(decalerTexte(JSON.stringify(corpsVisiteur ?? {}), -DECALAGE_JOURS));
  const morceaux = chemin.split('/').filter(Boolean);
  const [ressource, id, action] = morceaux;
  const instant = new Date(INSTANT).toISOString(); // repère de l'instantané
  const utilisateur = session(donnees);
  const auteur = utilisateur ? `${utilisateur.prenoms} ${utilisateur.nom}` : 'DÉMO';

  if (chemin === '/auth/connexion') {
    const compte = donnees.comptes[String(corps.email || '').trim().toLowerCase()];
    if (!compte || corps.mot_de_passe !== MDP_DEMO) return erreur(401, 'Adresse e-mail ou mot de passe incorrect.');
    try { localStorage.setItem(CLE_SESSION, compte.email); } catch { /* stockage indisponible */ }
    return ok(copie(compte));
  }
  if (chemin === '/auth/deconnexion') {
    try { localStorage.removeItem(CLE_SESSION); } catch { /* stockage indisponible */ }
    return ok({ message: 'Déconnexion effectuée.' });
  }
  if (chemin === '/auth/mot-de-passe-oublie') {
    return ok({ message: 'Dans la démonstration, aucun e-mail n’est envoyé. Utilisez les comptes de démonstration indiqués.' });
  }
  if (!utilisateur) return erreur(401, 'Session expirée. Reconnectez-vous.');

  if (chemin === '/parametres' && methode === 'PUT') {
    parametres = { ...(parametres || {}), ...corps };
    return ok({ message: 'Paramètres enregistrés (simulation : non conservés après rechargement).' });
  }
  if (chemin === '/utilisateurs/permissions/superviseur') {
    permissionsSup = corps.permissions || [];
    return ok({ message: 'Droits du superviseur enregistrés (simulation).' });
  }
  if (action === 'observations') {
    const k = `${ressource}:${id}`;
    observations[k] = [...(observations[k] || []), {
      id: idSuivant++, type: corps.type || 'observation', texte: corps.texte, cree_le: instant, auteur, role: utilisateur.role,
    }];
    return ok({ message: 'Observation ajoutée (simulation).' });
  }
  if (ressource === 'justifications' && action === 'decision') {
    fusionner('justifications', id, { statut: corps.decision, commentaire_decision: corps.commentaire || null, decision_le: instant, decideur: auteur });
    return ok({ message: corps.decision === 'acceptee' ? 'Justification acceptée (simulation).' : 'Justification refusée (simulation).' });
  }
  if (ressource === 'presences' && action === 'absence') {
    fusionner('presences', id, { statut_absence: corps.decision });
    return ok({ message: 'Décision enregistrée (simulation).' });
  }
  if (ressource === 'anomalies' && action === 'statut') {
    const close = ['traitee', 'classee'].includes(corps.statut);
    fusionner('anomalies', id, { statut: corps.statut, conclusion: corps.conclusion || null, ...(close ? { traitee_le: instant, traitee_par_nom: auteur } : {}) });
    return ok({ message: 'Statut de l’anomalie mis à jour (simulation).' });
  }
  if (action === 'statut' && methode === 'PATCH') {
    fusionner(ressource, id, corps);
    return ok({ message: 'Statut mis à jour (simulation).' });
  }
  if (methode === 'PUT' && id && !action) {
    fusionner(ressource, id, corps);
    return ok({ message: 'Modifications enregistrées (simulation : non conservées après rechargement).' });
  }
  if (methode === 'POST' && !id && ['enseignants', 'marches', 'domiciles', 'affectations', 'plannings', 'utilisateurs', 'matieres'].includes(ressource)) {
    const el = { ...corps, id: idSuivant++, actif: 1, cree_le: instant, modifie_le: instant };
    delete el.mot_de_passe;
    crees[ressource] = [el, ...(crees[ressource] || [])];
    return ok({ ...el, message: 'Élément ajouté (simulation : non conservé après rechargement).' });
  }
  return erreur(403, INDISPONIBLE);
}

/** Point d'entrée : même contrat que fetch('/api' + url). */
export async function repondre(methode, url, corps) {
  const donnees = await charger();
  await new Promise((r) => setTimeout(r, 120)); // petite latence réaliste
  if (methode === 'GET') {
    if (url === '/auth/moi') {
      const u = session(donnees);
      return u ? ok(copie(u)) : erreur(401, 'Non connecté');
    }
    if (!session(donnees)) return erreur(401, 'Session expirée. Reconnectez-vous.');
    const r = lire(donnees, url);
    return r.statut === 200 ? ok(versVisiteur(r.donnees)) : r;
  }
  const r = ecrire(donnees, methode, url, corps);
  return r.statut === 200 ? ok(versVisiteur(r.donnees)) : r;
}

