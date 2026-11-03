#!/usr/bin/env bash
# Dispara la descarga de NOTAM (.github/workflows/notam.yml) cada 15 minutos.
#
# El programador de GitHub no la sostenía: el 2026-11-03 corrió sola una vez en
# nueve horas, cuando tenían que ser 36. Este script sólo toca el timbre: el pedido
# a ANAC lo sigue haciendo la corrida de GitHub, con el User-Agent de Vector, nunca
# el VPS (ANAC bloqueó su IP).
#
# Usa el `gh` del VPS, ya logueado. Si el workflow se apagó solo (4 fallas de ANAC
# seguidas), `gh` falla y queda anotado; **no se vuelve a prender desde acá**: eso
# lo decide una persona (`gh workflow enable notam.yml`).
#
# En el crontab del VPS (instalado en ~/bin/vector-notam.sh):
#   7,22,37,52 * * * * /home/ubuntu/bin/vector-notam.sh >> /home/ubuntu/logs/notam.log 2>&1
set -uo pipefail

if ! salida=$(gh workflow run notam.yml -R Defeeeee/Vector 2>&1); then
  echo "$(date -uIs) ERROR: $salida"
  exit 1
fi
