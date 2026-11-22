# Suivi des présences des enseignants à domicile

Plateforme web (MVP) de vérification des présences des enseignants intervenant à domicile (Abidjan).
Pointage par **QR Code propre à chaque domicile**, contrôlé par le serveur (identité, affectation, emploi du temps, heure du serveur, position GPS), avec back-office administrateur / superviseur.

## Architecture

| Dossier | Rôle | Technologies |
|---|---|---|
| `backend/` | API sécurisée, règles métier, tâches planifiées, page mobile de pointage | Node.js, Express 5, MySQL (mysql2), Zod, Swagger |
| `backend/public/pointage/` | Page ouverte par le QR Code (HTML/JS natif, très légère) | — |
| `frontend/` | Back-office (administrateur et superviseur) | React 18, Vite, React Router |
| `backend/migrations/` | Schéma SQL versionné (contraintes d'intégrité, déclencheurs d'immuabilité) | MySQL 8 |

Principales règles :
- l'heure utilisée est **toujours celle du serveur** ; le lieu est **déterminé par le QR Code** ;
- le QR Code ne contient qu'un **jeton opaque** (256 bits), stocké haché (et chiffré pour réimpression), révocable ;
- le journal des pointages et le journal d'audit sont **en ajout seul** (déclencheurs MySQL) ; les heures réelles d'une séance ne peuvent pas être réécrites ;
- une justification ne supprime jamais le retard constaté : elle est examinée (acceptée / refusée) ;
- aucune séance n'est ouverte avant la fenêtre de pointage ; une seule arrivée et un seul départ acceptés par séance ;
- les séances sans arrivée deviennent « absence présumée à vérifier » (tâche toutes les 2 minutes), jamais une absence injustifiée automatique ;
- toutes les règles horaires et GPS sont **paramétrables** (écran Paramètres).

> Limites assumées : un QR Code photographié ou une position GPS falsifiée restent possibles. Le système les rend plus difficiles (contrôle de position et de précision, identité, planning, horodatage serveur) et **trace chaque incohérence** pour examen humain ; il ne rend pas la fraude impossible.

## Démarrage en local

Prérequis : Node.js 20+, Docker (ou un serveur MySQL 8).

```bash
# 1. Base de données (conteneur isolé, port 3307)
docker run -d --name presences-mysql -p 127.0.0.1:3307:3306 \
  -e MYSQL_ROOT_PASSWORD=root_dev_local -e MYSQL_DATABASE=presences_enseignants \
  -e MYSQL_USER=presences -e MYSQL_PASSWORD=presences_dev -e TZ=UTC \
  mysql:8.4 --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci --log-bin-trust-function-creators=1

# 2. API
cd backend
cp .env.example .env        # puis renseigner SECRET_SESSION et CLE_CHIFFREMENT_QR
npm install
npm run migrate
npm run creer-admin -- admin@exemple.ci "NOM" "Prénoms"    # premier administrateur
npm run seed:demo           # (facultatif) données fictives « DÉMO »
npm run dev                 # http://localhost:4000  —  documentation : /api/docs

# 3. Back-office (développement)
cd ../frontend
npm install
npm run dev                 # http://localhost:5173
```

En production, `npm run build` dans `frontend/` : l'API sert alors le back-office compilé sur le même domaine.

### Données de démonstration
`npm run seed:demo` crée des données **entièrement fictives** (marchés, domiciles et parents « DÉMO », enseignants nommés « DEMO ») et rejoue 14 jours de pointages via le vrai moteur.
Comptes : `admin@demo.local` et `superviseur@demo.local`, mot de passe `DemoPresences2026`. **À supprimer avant la mise en production.**

### Tester le pointage sur un téléphone
La géolocalisation du navigateur exige **HTTPS**. Pour un essai sur téléphone, exposer `http://localhost:4000` via un tunnel HTTPS (ex. Cloudflare Tunnel, ngrok) et mettre son adresse dans `URL_PUBLIQUE`, puis régénérer les QR Codes.

## Tests

```bash
cd backend && npm test
```
30 tests (base `presences_test` recréée à chaque exécution) : parcours normal, retard et justification, arrivée anticipée, départ anticipé, QR inconnu / révoqué, numéro inconnu, nom non conforme, enseignant non affecté, jeton de confirmation falsifié ou réutilisé, GPS hors zone (bloquant / non bloquant), scans simultanés, séance ouverte ailleurs, séance oubliée ouverte, absences présumées, départ non pointé, immuabilité des historiques, chevauchement de planning, droits du superviseur, audit, rapports PDF/Excel.

## Avant la mise en production
- Hébergement avec **HTTPS** obligatoire et `NODE_ENV=production` (cookies `Secure`).
- Secrets forts et uniques (`SECRET_SESSION`, `CLE_CHIFFREMENT_QR`) ; **ne jamais perdre `CLE_CHIFFREMENT_QR`** (sans elle, les QR existants ne peuvent plus être réimprimés — il faudrait les renouveler).
- Configurer le SMTP pour « Mot de passe oublié ».
- Supprimer les données et comptes de démonstration.
- Sauvegardes régulières de la base.
- Formalités de protection des données personnelles (loi n° 2013-450, ARTCI) : la géolocalisation est une donnée personnelle.

## Page de présentation
Une présentation statique de la plateforme est publiée par GitHub Pages depuis le dossier `docs/` : https://dav9fulldev.github.io/Komenan/

## Identité visuelle

L'interface applique la charte graphique KOMENAN FORMATION v1.0 :

- **Couleurs** : bleu profond `#102F87` (principal), orange `#F15A24` (accent), bleu vif `#087FE0`, violet `#5824B8`, vert `#23945B`, jaune `#F4C21B`.
- **Polices** : Montserrat (titres) et Open Sans (texte). Elles sont embarquées dans l'application et ne dépendent pas d'Internet.
- **Logo officiel** : `marque/logo-komenan-officiel.png`. C'est le fichier source, à ne pas modifier. Les versions web en sont dérivées :
  - `logo-komenan.png` : symbole seul, pour les petits espaces ;
  - `logo-komenan-complet.png` : logo complet, pour la connexion et la fiche QR.

Les boutons utilisent le bleu profond. Un texte blanc sur l'orange ou le bleu vif ne serait pas assez contrasté. Les couleurs d'état restent distinctes pour la lisibilité : rouge pour l'absence, orange pour le retard, vert pour l'arrivée à l'heure.
