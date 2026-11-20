// Liste exhaustive des permissions. L'administrateur les possède toutes.
export const PERMISSIONS = {
  'tableau_de_bord.voir': 'Consulter le tableau de bord',
  'enseignants.voir': 'Consulter les enseignants',
  'enseignants.gerer': 'Créer et modifier les enseignants',
  'marches.voir': 'Consulter les marchés',
  'marches.gerer': 'Créer et modifier les marchés',
  'domiciles.voir': 'Consulter les parents et domiciles',
  'domiciles.gerer': 'Créer et modifier les parents et domiciles',
  'qrcodes.gerer': 'Générer, révoquer et imprimer les QR Codes',
  'affectations.voir': 'Consulter les affectations',
  'affectations.gerer': 'Créer et modifier les affectations',
  'plannings.voir': 'Consulter les emplois du temps',
  'plannings.gerer': 'Créer et modifier les emplois du temps',
  'presences.voir': 'Suivre les présences',
  'justifications.voir': 'Consulter les justifications',
  'justifications.decider': 'Accepter ou refuser les justifications',
  'anomalies.voir': 'Consulter les anomalies',
  'anomalies.observer': 'Ajouter des observations et signalements',
  'anomalies.traiter': 'Changer le statut de traitement des anomalies',
  'rapports.voir': 'Consulter les rapports',
  'rapports.exporter': 'Exporter les rapports (PDF, Excel)',
  'audit.voir': "Consulter le journal d'audit",
  'utilisateurs.gerer': 'Gérer les comptes administratifs',
  'parametres.gerer': 'Modifier les paramètres horaires et GPS',
};

// Permissions qui ne peuvent jamais être accordées au superviseur (règles du cahier des charges).
export const RESERVEES_ADMIN = new Set([
  'enseignants.gerer', 'marches.gerer', 'domiciles.gerer', 'qrcodes.gerer',
  'affectations.gerer', 'plannings.gerer', 'utilisateurs.gerer', 'parametres.gerer',
]);
