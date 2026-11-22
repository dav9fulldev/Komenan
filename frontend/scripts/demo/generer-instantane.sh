#!/usr/bin/env bash
# Régénère l'instantané de la démonstration statique (données DÉMO fictives).
# Crée une base séparée « presences_vitrine » (la base de développement n'est pas touchée),
# y joue le script de démonstration à une heure simulée, capture les réponses de l'API,
# puis supprime cette base.
#
# Prérequis : conteneur MySQL « presences-mysql » démarré, backend/.env configuré.
# Usage : frontend/scripts/demo/generer-instantane.sh [AAAA-MM-JJTHH:MM:SSZ]
set -euo pipefail
ICI="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ICI/../../../backend"
export DEMO_MAINTENANT="${1:-2026-11-16T17:20:00Z}"   # un lundi, 17 h 20 : cours en cours
export DB_NOM=presences_vitrine
export URL_PUBLIQUE="${DEMO_URL_PUBLIQUE:-https://dav9fulldev.github.io/Komenan}"
PORT_CAPTURE=4100
MYSQL_ROOT="${MYSQL_ROOT_MDP:-root_dev_local}"

sql() { docker exec -i presences-mysql mysql -uroot -p"$MYSQL_ROOT" "$@" 2>&1 | grep -v 'Using a password' || true; }

echo "→ Base presences_vitrine (heure simulée : $DEMO_MAINTENANT)"
sql -e "DROP DATABASE IF EXISTS presences_vitrine; CREATE DATABASE presences_vitrine CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL PRIVILEGES ON presences_vitrine.* TO 'presences'@'%';"
cd "$BACKEND"
node --env-file=.env scripts/migrate.js
node --env-file=.env --import "$ICI/faux-temps.mjs" scripts/seed-demo.js > /dev/null

# Fiches de référence créées à la mise en place de la structure, avant la période simulée
sql presences_vitrine -e "
SET @t = DATE_SUB(DATE('${DEMO_MAINTENANT:0:10}'), INTERVAL 17 DAY) + INTERVAL 8 HOUR;
UPDATE utilisateurs SET cree_le=@t, modifie_le=@t; UPDATE marches SET cree_le=@t, modifie_le=@t;
UPDATE enseignants SET cree_le=@t, modifie_le=@t; UPDATE parents SET cree_le=@t, modifie_le=@t;
UPDATE domiciles SET cree_le=@t, modifie_le=@t; UPDATE affectations SET cree_le=@t, modifie_le=@t;
UPDATE creneaux SET cree_le=@t, modifie_le=@t; UPDATE qr_codes SET cree_le=@t + INTERVAL 5 MINUTE;
UPDATE parametres SET modifie_le=@t;"

echo "→ Serveur de capture sur le port $PORT_CAPTURE"
PORT=$PORT_CAPTURE node --env-file=.env --import "$ICI/faux-temps.mjs" src/server.js > /tmp/capture-demo.log 2>&1 &
SERVEUR=$!
trap 'kill $SERVEUR 2>/dev/null || true' EXIT
for _ in $(seq 1 40); do curl -sf "http://localhost:$PORT_CAPTURE/api/sante" > /dev/null && break; sleep 0.25; done

node "$ICI/capturer.mjs" "http://localhost:$PORT_CAPTURE"
kill $SERVEUR; trap - EXIT
sql -e "DROP DATABASE presences_vitrine;"
echo "→ Terminé. Construisez ensuite la démonstration : cd frontend && npm run build:demo"
