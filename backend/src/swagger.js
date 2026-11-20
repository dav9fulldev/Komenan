// Documentation OpenAPI de l'API (consultable sur /api/docs).
const ok = { 200: { description: 'Succès' }, 400: { description: 'Données invalides' }, 401: { description: 'Non connecté' }, 403: { description: 'Droits insuffisants' } };
const op = (tag, summary, extra = {}) => ({ tags: [tag], summary, responses: ok, ...extra });
const corps = (props, requis = []) => ({ requestBody: { content: { 'application/json': { schema: { type: 'object', properties: props, required: requis } } } } });
const S = { type: 'string' };
const N = { type: 'integer' };
const idParam = { parameters: [{ name: 'id', in: 'path', required: true, schema: N }] };

const p = {};
const ajouter = (chemin, methode, def) => { p[chemin] = { ...(p[chemin] || {}), [methode]: def }; };

ajouter('/auth/connexion', 'post', op('Authentification', 'Se connecter (ouvre une session par cookie sécurisé)', { security: [], ...corps({ email: S, mot_de_passe: S }, ['email', 'mot_de_passe']) }));
ajouter('/auth/deconnexion', 'post', op('Authentification', 'Se déconnecter'));
ajouter('/auth/moi', 'get', op('Authentification', 'Utilisateur connecté et ses permissions'));
ajouter('/auth/mot-de-passe-oublie', 'post', op('Authentification', 'Demander un lien de réinitialisation', { security: [], ...corps({ email: S }, ['email']) }));
ajouter('/auth/reinitialiser-mot-de-passe', 'post', op('Authentification', 'Définir un nouveau mot de passe', { security: [], ...corps({ jeton: S, mot_de_passe: S }) }));
ajouter('/auth/changer-mot-de-passe', 'post', op('Authentification', 'Changer son mot de passe', corps({ actuel: S, nouveau: S })));

ajouter('/tableau-de-bord', 'get', op('Tableau de bord', 'Indicateurs du jour et listes de suivi'));

for (const [base, tag, nom] of [['/enseignants', 'Enseignants', 'enseignant'], ['/marches', 'Marchés', 'marché'], ['/domiciles', 'Parents et domiciles', 'domicile'], ['/affectations', 'Affectations', 'affectation'], ['/plannings', 'Emplois du temps', 'créneau']]) {
  ajouter(base, 'get', op(tag, `Lister (${nom}s)`));
  ajouter(base, 'post', op(tag, `Créer un ${nom}`));
  ajouter(`${base}/{id}`, 'put', op(tag, `Modifier un ${nom}`, idParam));
  ajouter(`${base}/{id}/statut`, 'patch', op(tag, `Activer / désactiver un ${nom}`, { ...idParam, ...corps({ actif: { type: 'boolean' } }) }));
  if (base !== '/plannings' && base !== '/affectations') ajouter(`${base}/{id}`, 'get', op(tag, `Fiche ${nom}`, idParam));
}
ajouter('/matieres', 'get', op('Enseignants', 'Lister les matières'));
ajouter('/matieres', 'post', op('Enseignants', 'Créer une matière', corps({ libelle: S })));
ajouter('/parents', 'get', op('Parents et domiciles', 'Lister les parents'));
ajouter('/parents/{id}', 'put', op('Parents et domiciles', 'Modifier un parent', idParam));
ajouter('/domiciles/{id}/qrcode', 'get', op('QR Codes', 'Image et lien du QR Code actif', idParam));
ajouter('/domiciles/{id}/qrcode', 'post', op('QR Codes', 'Générer ou renouveler le QR Code (révoque l\'ancien)', { ...idParam, ...corps({ motif: S }) }));
ajouter('/domiciles/{id}/qrcode/revoquer', 'post', op('QR Codes', 'Révoquer le QR Code actif', { ...idParam, ...corps({ motif: S }, ['motif']) }));
ajouter('/plannings/calendrier', 'get', op('Emplois du temps', 'Occurrences sur une période (vue calendrier)', { parameters: [{ name: 'debut', in: 'query', required: true, schema: S }, { name: 'fin', in: 'query', required: true, schema: S }] }));

ajouter('/presences', 'get', op('Présences', 'Suivi des séances (filtres : debut, fin, enseignant_id, marche_id, domicile_id, statut)'));
ajouter('/presences/{id}', 'get', op('Présences', 'Détail d\'une séance avec pointages, justifications et anomalies', idParam));
ajouter('/presences/{id}/observations', 'post', op('Présences', 'Ajouter une observation à une séance', idParam));
ajouter('/presences/{id}/absence', 'patch', op('Présences', 'Statuer sur une absence présumée', { ...idParam, ...corps({ decision: { type: 'string', enum: ['confirmee', 'justifiee'] }, commentaire: S }) }));
ajouter('/justifications', 'get', op('Justifications', 'Lister les justifications'));
ajouter('/justifications/{id}/decision', 'post', op('Justifications', 'Accepter ou refuser une justification', { ...idParam, ...corps({ decision: { type: 'string', enum: ['acceptee', 'refusee'] }, commentaire: S }) }));
ajouter('/anomalies', 'get', op('Anomalies', 'Lister les anomalies'));
ajouter('/anomalies/types', 'get', op('Anomalies', 'Types d\'anomalies'));
ajouter('/anomalies/{id}', 'get', op('Anomalies', 'Détail d\'une anomalie', idParam));
ajouter('/anomalies/{id}/observations', 'post', op('Anomalies', 'Ajouter une observation / demande de précision / signalement', idParam));
ajouter('/anomalies/{id}/statut', 'patch', op('Anomalies', 'Changer le statut de traitement', idParam));
ajouter('/rapports/{type}', 'get', op('Rapports', 'Rapport (presences-enseignants, retards, absences, durees, marches) en JSON, PDF ou Excel', {
  parameters: [{ name: 'type', in: 'path', required: true, schema: S }, { name: 'debut', in: 'query', required: true, schema: S }, { name: 'fin', in: 'query', required: true, schema: S }, { name: 'format', in: 'query', schema: { type: 'string', enum: ['json', 'pdf', 'xlsx'] } }],
}));
ajouter('/utilisateurs', 'get', op('Utilisateurs', 'Lister les comptes'));
ajouter('/utilisateurs', 'post', op('Utilisateurs', 'Créer un compte'));
ajouter('/utilisateurs/{id}', 'put', op('Utilisateurs', 'Modifier un compte', idParam));
ajouter('/utilisateurs/{id}/statut', 'patch', op('Utilisateurs', 'Activer / désactiver un compte', idParam));
ajouter('/utilisateurs/{id}/mot-de-passe', 'post', op('Utilisateurs', 'Réinitialiser le mot de passe d\'un compte', idParam));
ajouter('/utilisateurs/connexions', 'get', op('Utilisateurs', 'Historique des connexions'));
ajouter('/utilisateurs/permissions', 'get', op('Utilisateurs', 'Matrice des permissions'));
ajouter('/utilisateurs/permissions/superviseur', 'put', op('Utilisateurs', 'Modifier les permissions du superviseur', corps({ permissions: { type: 'array', items: S } })));
ajouter('/audit', 'get', op('Journal d\'audit', 'Consulter le journal d\'audit'));
ajouter('/parametres', 'get', op('Paramètres', 'Lire les paramètres horaires et GPS'));
ajouter('/parametres', 'put', op('Paramètres', 'Modifier les paramètres'));
ajouter('/pointage/{jeton}', 'post', op('Pointage (public)', 'Pointer une arrivée ou un départ (le serveur détermine l\'opération)', {
  security: [],
  parameters: [{ name: 'jeton', in: 'path', required: true, schema: S, description: 'Jeton opaque contenu dans le QR Code' }],
  ...corps({
    telephone: S, nom: S,
    position: { type: 'object', properties: { latitude: { type: 'number' }, longitude: { type: 'number' }, precision: { type: 'number' }, erreur: { type: 'string', enum: ['refuse', 'indisponible', 'delai'] } } },
    justification: S, confirmation: { type: 'string', description: 'Jeton signé renvoyé quand une justification est requise' },
  }, ['telephone', 'nom']),
  responses: { 200: { description: 'statut : arrivee_enregistree | depart_enregistre | justification_requise | trop_tot | deja_arrive | rejete' } },
}));

export const specification = {
  openapi: '3.0.3',
  info: { title: 'API – Suivi des présences des enseignants à domicile', version: '1.0.0', description: 'Toutes les routes (sauf pointage public et authentification) exigent une session ouverte par /auth/connexion.' },
  servers: [{ url: '/api' }],
  components: { securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: 'session_presences' } } },
  security: [{ session: [] }],
  paths: p,
};
