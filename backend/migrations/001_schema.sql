-- =====================================================================
-- Schéma initial : suivi des présences des enseignants à domicile
-- Toutes les dates/heures sont stockées en UTC (Abidjan = UTC+0).
-- =====================================================================

-- ---------- Comptes administratifs ----------
CREATE TABLE utilisateurs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(100) NOT NULL,
  prenoms VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL,
  mot_de_passe_hash VARCHAR(100) NOT NULL,
  role ENUM('admin','superviseur') NOT NULL,
  actif TINYINT(1) NOT NULL DEFAULT 1,
  derniere_connexion DATETIME NULL,
  cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modifie_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_utilisateurs_email (email)
) ENGINE=InnoDB;

-- Permissions accordées au rôle superviseur (l'administrateur a tous les droits).
CREATE TABLE permissions_role (
  role ENUM('superviseur') NOT NULL,
  permission VARCHAR(60) NOT NULL,
  PRIMARY KEY (role, permission)
) ENGINE=InnoDB;

CREATE TABLE connexions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  utilisateur_id INT UNSIGNED NULL,
  email_saisi VARCHAR(190) NOT NULL,
  succes TINYINT(1) NOT NULL,
  motif VARCHAR(60) NULL,
  ip VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  date_connexion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_connexions_email_date (email_saisi, date_connexion),
  CONSTRAINT fk_connexions_utilisateur FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id)
) ENGINE=InnoDB;

CREATE TABLE reinitialisations_mdp (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  utilisateur_id INT UNSIGNED NOT NULL,
  jeton_hash CHAR(64) NOT NULL,
  expire_le DATETIME NOT NULL,
  utilise_le DATETIME NULL,
  cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_reinit_jeton (jeton_hash),
  CONSTRAINT fk_reinit_utilisateur FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id)
) ENGINE=InnoDB;

-- ---------- Référentiels ----------
CREATE TABLE matieres (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  libelle VARCHAR(100) NOT NULL,
  UNIQUE KEY uq_matieres_libelle (libelle)
) ENGINE=InnoDB;

CREATE TABLE enseignants (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  matricule VARCHAR(30) NOT NULL,
  nom VARCHAR(100) NOT NULL,
  prenoms VARCHAR(150) NOT NULL,
  telephone VARCHAR(20) NOT NULL COMMENT 'Format normalisé +225XXXXXXXXXX',
  email VARCHAR(190) NULL,
  actif TINYINT(1) NOT NULL DEFAULT 1,
  cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modifie_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_enseignants_matricule (matricule),
  UNIQUE KEY uq_enseignants_telephone (telephone)
) ENGINE=InnoDB;

CREATE TABLE enseignant_matieres (
  enseignant_id INT UNSIGNED NOT NULL,
  matiere_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (enseignant_id, matiere_id),
  CONSTRAINT fk_em_enseignant FOREIGN KEY (enseignant_id) REFERENCES enseignants(id) ON DELETE CASCADE,
  CONSTRAINT fk_em_matiere FOREIGN KEY (matiere_id) REFERENCES matieres(id)
) ENGINE=InnoDB;

CREATE TABLE marches (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(30) NOT NULL,
  nom VARCHAR(150) NOT NULL,
  description VARCHAR(500) NULL,
  actif TINYINT(1) NOT NULL DEFAULT 1,
  cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modifie_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_marches_code (code)
) ENGINE=InnoDB;

CREATE TABLE enseignant_marches (
  enseignant_id INT UNSIGNED NOT NULL,
  marche_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (enseignant_id, marche_id),
  CONSTRAINT fk_emar_enseignant FOREIGN KEY (enseignant_id) REFERENCES enseignants(id) ON DELETE CASCADE,
  CONSTRAINT fk_emar_marche FOREIGN KEY (marche_id) REFERENCES marches(id)
) ENGINE=InnoDB;

CREATE TABLE parents (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(100) NOT NULL,
  prenoms VARCHAR(150) NOT NULL,
  telephone VARCHAR(20) NOT NULL,
  email VARCHAR(190) NULL,
  cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modifie_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_parents_telephone (telephone)
) ENGINE=InnoDB;

CREATE TABLE domiciles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(30) NOT NULL,
  parent_id INT UNSIGNED NOT NULL,
  marche_id INT UNSIGNED NOT NULL,
  commune VARCHAR(100) NOT NULL,
  quartier VARCHAR(150) NULL,
  adresse VARCHAR(300) NOT NULL,
  latitude DECIMAL(9,6) NULL,
  longitude DECIMAL(9,6) NULL,
  rayon_tolerance_m INT UNSIGNED NULL COMMENT 'Si NULL, le paramètre global s''applique',
  actif TINYINT(1) NOT NULL DEFAULT 1,
  cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modifie_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_domiciles_code (code),
  CONSTRAINT fk_domiciles_parent FOREIGN KEY (parent_id) REFERENCES parents(id),
  CONSTRAINT fk_domiciles_marche FOREIGN KEY (marche_id) REFERENCES marches(id),
  CONSTRAINT ck_domiciles_lat CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CONSTRAINT ck_domiciles_lng CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
) ENGINE=InnoDB;

-- Un QR Code = un lieu d'intervention. Il ne contient qu'un jeton opaque.
CREATE TABLE qr_codes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  domicile_id INT UNSIGNED NOT NULL,
  jeton_hash CHAR(64) NOT NULL COMMENT 'SHA-256 du jeton, utilisé pour la recherche',
  jeton_chiffre VARCHAR(255) NOT NULL COMMENT 'Jeton chiffré (AES-256-GCM) pour réimpression',
  statut ENUM('actif','revoque') NOT NULL DEFAULT 'actif',
  -- Garantit un seul QR Code actif par domicile.
  domicile_actif INT UNSIGNED AS (IF(statut = 'actif', domicile_id, NULL)) STORED,
  cree_par INT UNSIGNED NOT NULL,
  cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoque_par INT UNSIGNED NULL,
  revoque_le DATETIME NULL,
  motif_revocation VARCHAR(300) NULL,
  UNIQUE KEY uq_qr_jeton (jeton_hash),
  UNIQUE KEY uq_qr_un_actif_par_domicile (domicile_actif),
  CONSTRAINT fk_qr_domicile FOREIGN KEY (domicile_id) REFERENCES domiciles(id),
  CONSTRAINT fk_qr_cree_par FOREIGN KEY (cree_par) REFERENCES utilisateurs(id),
  CONSTRAINT fk_qr_revoque_par FOREIGN KEY (revoque_par) REFERENCES utilisateurs(id)
) ENGINE=InnoDB;

-- ---------- Affectations et emplois du temps ----------
CREATE TABLE affectations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  enseignant_id INT UNSIGNED NOT NULL,
  domicile_id INT UNSIGNED NOT NULL,
  matiere_id INT UNSIGNED NOT NULL,
  date_debut DATE NOT NULL,
  date_fin DATE NULL,
  actif TINYINT(1) NOT NULL DEFAULT 1,
  cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modifie_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_aff_enseignant (enseignant_id),
  KEY idx_aff_domicile (domicile_id),
  CONSTRAINT fk_aff_enseignant FOREIGN KEY (enseignant_id) REFERENCES enseignants(id),
  CONSTRAINT fk_aff_domicile FOREIGN KEY (domicile_id) REFERENCES domiciles(id),
  CONSTRAINT fk_aff_matiere FOREIGN KEY (matiere_id) REFERENCES matieres(id),
  CONSTRAINT ck_aff_periode CHECK (date_fin IS NULL OR date_fin >= date_debut)
) ENGINE=InnoDB;

-- Le parent, le domicile et le marché sont déduits de l'affectation : aucune incohérence possible.
CREATE TABLE creneaux (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  affectation_id INT UNSIGNED NOT NULL,
  jour_semaine TINYINT UNSIGNED NOT NULL COMMENT '1 = lundi ... 7 = dimanche',
  heure_debut TIME NOT NULL,
  heure_fin TIME NOT NULL,
  frequence ENUM('hebdomadaire','quinzaine','ponctuelle') NOT NULL DEFAULT 'hebdomadaire',
  date_debut DATE NOT NULL,
  date_fin DATE NULL,
  actif TINYINT(1) NOT NULL DEFAULT 1,
  cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modifie_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_creneaux_affectation (affectation_id),
  CONSTRAINT fk_creneaux_affectation FOREIGN KEY (affectation_id) REFERENCES affectations(id),
  CONSTRAINT ck_creneaux_jour CHECK (jour_semaine BETWEEN 1 AND 7),
  CONSTRAINT ck_creneaux_heures CHECK (heure_fin > heure_debut),
  CONSTRAINT ck_creneaux_periode CHECK (date_fin IS NULL OR date_fin >= date_debut)
) ENGINE=InnoDB;

-- ---------- Séances (occurrences datées d'un créneau) ----------
CREATE TABLE seances (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  creneau_id INT UNSIGNED NOT NULL,
  affectation_id INT UNSIGNED NOT NULL,
  enseignant_id INT UNSIGNED NOT NULL,
  domicile_id INT UNSIGNED NOT NULL,
  date_seance DATE NOT NULL,
  debut_prevu DATETIME NOT NULL,
  fin_prevue DATETIME NOT NULL,
  arrivee_reelle DATETIME NULL,
  depart_reel DATETIME NULL,
  retard_minutes INT NULL COMMENT 'Retard constaté, jamais effacé par une justification',
  depart_anticipe_minutes INT NULL,
  duree_effective_minutes INT NULL,
  statut ENUM('prevue','en_cours','terminee','absence_presumee','depart_non_pointe','annulee') NOT NULL DEFAULT 'prevue',
  statut_arrivee ENUM('a_l_heure','retard_en_attente','retard_justifie','retard_non_justifie') NULL,
  statut_absence ENUM('a_verifier','confirmee','justifiee') NULL,
  cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  modifie_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_seance_creneau_date (creneau_id, date_seance),
  KEY idx_seances_date (date_seance),
  KEY idx_seances_ens_date (enseignant_id, date_seance),
  KEY idx_seances_dom_date (domicile_id, date_seance),
  KEY idx_seances_statut (statut),
  CONSTRAINT fk_seances_creneau FOREIGN KEY (creneau_id) REFERENCES creneaux(id),
  CONSTRAINT fk_seances_affectation FOREIGN KEY (affectation_id) REFERENCES affectations(id),
  CONSTRAINT fk_seances_enseignant FOREIGN KEY (enseignant_id) REFERENCES enseignants(id),
  CONSTRAINT fk_seances_domicile FOREIGN KEY (domicile_id) REFERENCES domiciles(id),
  CONSTRAINT ck_seances_depart CHECK (depart_reel IS NULL OR (arrivee_reelle IS NOT NULL AND depart_reel >= arrivee_reelle))
) ENGINE=InnoDB;

-- ---------- Journal des pointages (ajout seul) ----------
CREATE TABLE pointages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type ENUM('arrivee','depart','inconnu') NOT NULL,
  resultat ENUM('accepte','rejete') NOT NULL,
  motif_rejet VARCHAR(60) NULL,
  seance_id INT UNSIGNED NULL,
  qr_code_id INT UNSIGNED NULL,
  domicile_id INT UNSIGNED NULL,
  enseignant_id INT UNSIGNED NULL,
  telephone_saisi VARCHAR(30) NULL,
  nom_saisi VARCHAR(255) NULL,
  heure_serveur DATETIME(3) NOT NULL,
  heure_appareil VARCHAR(40) NULL COMMENT 'Information seulement, jamais utilisée pour le calcul',
  latitude DECIMAL(9,6) NULL,
  longitude DECIMAL(9,6) NULL,
  precision_m DECIMAL(8,1) NULL,
  distance_m DECIMAL(10,1) NULL,
  statut_gps ENUM('conforme','hors_zone','imprecis','indisponible','refuse','non_verifiable') NULL,
  controles JSON NULL COMMENT 'Résultat détaillé de chaque contrôle',
  ip VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  -- Une seule arrivée et un seul départ acceptés par séance.
  cle_unicite VARCHAR(40) AS (IF(resultat = 'accepte', CONCAT(seance_id, '-', type), NULL)) STORED,
  UNIQUE KEY uq_pointage_accepte (cle_unicite),
  KEY idx_pointages_date (heure_serveur),
  KEY idx_pointages_enseignant (enseignant_id),
  CONSTRAINT fk_pt_seance FOREIGN KEY (seance_id) REFERENCES seances(id),
  CONSTRAINT fk_pt_qr FOREIGN KEY (qr_code_id) REFERENCES qr_codes(id),
  CONSTRAINT fk_pt_domicile FOREIGN KEY (domicile_id) REFERENCES domiciles(id),
  CONSTRAINT fk_pt_enseignant FOREIGN KEY (enseignant_id) REFERENCES enseignants(id)
) ENGINE=InnoDB;

-- ---------- Justifications ----------
CREATE TABLE justifications (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  seance_id INT UNSIGNED NOT NULL,
  pointage_id BIGINT UNSIGNED NULL,
  type ENUM('retard','depart_anticipe','absence') NOT NULL,
  texte TEXT NOT NULL,
  statut ENUM('en_attente','acceptee','refusee') NOT NULL DEFAULT 'en_attente',
  decision_par INT UNSIGNED NULL,
  decision_le DATETIME NULL,
  commentaire_decision VARCHAR(1000) NULL,
  cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_justif_statut (statut),
  CONSTRAINT fk_justif_seance FOREIGN KEY (seance_id) REFERENCES seances(id),
  CONSTRAINT fk_justif_pointage FOREIGN KEY (pointage_id) REFERENCES pointages(id),
  CONSTRAINT fk_justif_decision FOREIGN KEY (decision_par) REFERENCES utilisateurs(id)
) ENGINE=InnoDB;

-- ---------- Anomalies ----------
CREATE TABLE anomalies (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type ENUM(
    'retard_justifie','retard_non_justifie','arrivee_anticipee','depart_anticipe',
    'absence_presumee','depart_non_pointe','qr_invalide','enseignant_non_affecte',
    'gps_non_conforme','double_pointage','hors_planning','identite_non_conforme'
  ) NOT NULL,
  gravite ENUM('info','moyenne','elevee') NOT NULL DEFAULT 'moyenne',
  statut ENUM('a_examiner','en_cours','traitee','classee') NOT NULL DEFAULT 'a_examiner',
  description VARCHAR(500) NOT NULL,
  seance_id INT UNSIGNED NULL,
  pointage_id BIGINT UNSIGNED NULL,
  enseignant_id INT UNSIGNED NULL,
  domicile_id INT UNSIGNED NULL,
  cle_dedoublonnage VARCHAR(120) NULL,
  traitee_par INT UNSIGNED NULL,
  traitee_le DATETIME NULL,
  conclusion VARCHAR(1000) NULL,
  cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_anomalie_dedoublonnage (cle_dedoublonnage),
  KEY idx_anomalies_statut (statut),
  KEY idx_anomalies_type (type),
  CONSTRAINT fk_ano_seance FOREIGN KEY (seance_id) REFERENCES seances(id),
  CONSTRAINT fk_ano_pointage FOREIGN KEY (pointage_id) REFERENCES pointages(id),
  CONSTRAINT fk_ano_enseignant FOREIGN KEY (enseignant_id) REFERENCES enseignants(id),
  CONSTRAINT fk_ano_domicile FOREIGN KEY (domicile_id) REFERENCES domiciles(id),
  CONSTRAINT fk_ano_traitee FOREIGN KEY (traitee_par) REFERENCES utilisateurs(id)
) ENGINE=InnoDB;

CREATE TABLE observations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  anomalie_id INT UNSIGNED NULL,
  seance_id INT UNSIGNED NULL,
  utilisateur_id INT UNSIGNED NOT NULL,
  type ENUM('observation','demande_precision','signalement','reponse') NOT NULL DEFAULT 'observation',
  texte TEXT NOT NULL,
  cree_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_obs_anomalie FOREIGN KEY (anomalie_id) REFERENCES anomalies(id),
  CONSTRAINT fk_obs_seance FOREIGN KEY (seance_id) REFERENCES seances(id),
  CONSTRAINT fk_obs_utilisateur FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id),
  CONSTRAINT ck_obs_cible CHECK (anomalie_id IS NOT NULL OR seance_id IS NOT NULL)
) ENGINE=InnoDB;

-- ---------- Paramètres et audit ----------
CREATE TABLE parametres (
  cle VARCHAR(60) PRIMARY KEY,
  valeur VARCHAR(100) NOT NULL,
  modifie_par INT UNSIGNED NULL,
  modifie_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_param_utilisateur FOREIGN KEY (modifie_par) REFERENCES utilisateurs(id)
) ENGINE=InnoDB;

CREATE TABLE journal_audit (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  utilisateur_id INT UNSIGNED NULL,
  action VARCHAR(60) NOT NULL,
  entite VARCHAR(40) NOT NULL,
  entite_id VARCHAR(40) NULL,
  avant JSON NULL,
  apres JSON NULL,
  ip VARCHAR(64) NULL,
  date_action DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_audit_date (date_action),
  KEY idx_audit_entite (entite, entite_id),
  CONSTRAINT fk_audit_utilisateur FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id)
) ENGINE=InnoDB;

-- ---------- Immuabilité des historiques ----------
CREATE TRIGGER trg_pointages_no_update BEFORE UPDATE ON pointages FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Le journal des pointages ne peut pas être modifié';
CREATE TRIGGER trg_pointages_no_delete BEFORE DELETE ON pointages FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Le journal des pointages ne peut pas être supprimé';
CREATE TRIGGER trg_audit_no_update BEFORE UPDATE ON journal_audit FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Le journal d''audit ne peut pas être modifié';
CREATE TRIGGER trg_audit_no_delete BEFORE DELETE ON journal_audit FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Le journal d''audit ne peut pas être supprimé';
CREATE TRIGGER trg_justif_texte_fige BEFORE UPDATE ON justifications FOR EACH ROW
  BEGIN
    IF NOT (NEW.texte <=> OLD.texte) OR NOT (NEW.seance_id <=> OLD.seance_id) OR NOT (NEW.type <=> OLD.type) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Le texte d''une justification ne peut pas être modifié';
    END IF;
  END;
CREATE TRIGGER trg_seances_horaires_figes BEFORE UPDATE ON seances FOR EACH ROW
  BEGIN
    IF (OLD.arrivee_reelle IS NOT NULL AND NOT (NEW.arrivee_reelle <=> OLD.arrivee_reelle))
       OR (OLD.depart_reel IS NOT NULL AND NOT (NEW.depart_reel <=> OLD.depart_reel))
       OR (OLD.retard_minutes IS NOT NULL AND NOT (NEW.retard_minutes <=> OLD.retard_minutes)) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Les heures réelles d''une séance ne peuvent pas être modifiées';
    END IF;
  END;
CREATE TRIGGER trg_seances_no_delete_pointee BEFORE DELETE ON seances FOR EACH ROW
  BEGIN
    IF OLD.arrivee_reelle IS NOT NULL OR OLD.statut <> 'prevue' THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Une séance ayant un historique ne peut pas être supprimée';
    END IF;
  END;

-- ---------- Données de référence ----------
INSERT INTO parametres (cle, valeur) VALUES
  ('tolerance_retard_minutes', '10'),
  ('ouverture_pointage_minutes', '15'),
  ('fermeture_pointage_minutes', '60'),
  ('depart_anticipe_seuil_minutes', '10'),
  ('justification_depart_anticipe_obligatoire', '1'),
  ('delai_min_avant_depart_minutes', '10'),
  ('fermeture_depart_minutes', '60'),
  ('duree_max_seance_minutes', '240'),
  ('rayon_gps_metres', '150'),
  ('precision_gps_max_metres', '100'),
  ('gps_bloquant', '0'),
  ('delai_trajet_minutes', '30');

INSERT INTO permissions_role (role, permission) VALUES
  ('superviseur','tableau_de_bord.voir'),
  ('superviseur','enseignants.voir'),
  ('superviseur','marches.voir'),
  ('superviseur','domiciles.voir'),
  ('superviseur','affectations.voir'),
  ('superviseur','plannings.voir'),
  ('superviseur','presences.voir'),
  ('superviseur','justifications.voir'),
  ('superviseur','justifications.decider'),
  ('superviseur','anomalies.voir'),
  ('superviseur','anomalies.observer'),
  ('superviseur','anomalies.traiter'),
  ('superviseur','rapports.voir'),
  ('superviseur','rapports.exporter');
