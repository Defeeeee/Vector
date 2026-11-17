#!/usr/bin/env bash
# El barrido de las importaciones del libro (apps/web/src/app/api/cron/importaciones): retoma
# las lecturas que un deploy cortó, manda el mail que no salió y borra los archivos viejos.
#
# Lee el secreto del .env de la web, como los otros barridos (~/bin/vector-*.sh).
# En el crontab del VPS (instalado en ~/bin/vector-importaciones.sh):
#   */5 * * * * /home/ubuntu/bin/vector-importaciones.sh >> /home/ubuntu/logs/importaciones.log 2>&1
set -uo pipefail

ENV_WEB="$HOME/Vector/web/apps/web/.env"
SECRETO=$(grep -E '^DOCUMENTS_ALERT_SECRET=' "$ENV_WEB" | head -1 | cut -d= -f2- | tr -d '"')
if [ -z "$SECRETO" ]; then
  echo "$(date -uIs) ERROR: falta DOCUMENTS_ALERT_SECRET en $ENV_WEB"
  exit 1
fi

if ! salida=$(curl -fsS --max-time 60 -X POST -H "X-Cron-Secret: $SECRETO" http://127.0.0.1:3010/api/cron/importaciones 2>&1); then
  echo "$(date -uIs) ERROR: $salida"
  exit 1
fi
echo "$(date -uIs) $salida"
