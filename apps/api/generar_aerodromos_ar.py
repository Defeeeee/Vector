"""
Arma `src/data/aerodromos_ar.json`: los aeródromos argentinos con coordenadas, para decir dónde
aterrizó un vuelo compartido (`services/aerodromos.py`). Sin red, desde los TSV de la web:

    python3 generar_aerodromos_ar.py

- `apps/web/src/data/madhel.tsv` (711 de ANAC; helipuertos afuera) y, para los que tienen código OACI
  y no están ahí, los 164 de `airports.tsv` con país AR.
- Código: el OACI si existe, si no el local de MADHEL. Nombre: la localidad (como en la web).
Se vuelve a correr cuando cambian esos TSV.
"""

import json
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
DATOS = RAIZ.parent / "web" / "src" / "data"
SALIDA = RAIZ / "src" / "data" / "aerodromos_ar.json"

MENORES = {"de", "del", "la", "las", "lo", "los", "y", "el", "en"}


def titulo(texto: str) -> str:
    palabras = texto.strip().split()
    return " ".join(p.lower() if i and p.lower() in MENORES else p[:1].upper() + p[1:].lower() for i, p in enumerate(palabras))


def numero(valor: str):
    try:
        return float(valor)
    except ValueError:
        return None


def main() -> None:
    por_codigo = {}
    # airports.tsv: icao, name, city, country, size, iata, elev, lat, lon
    base = {}
    for linea in (DATOS / "airports.tsv").read_text(encoding="utf8").splitlines():
        c = linea.split("\t")
        if len(c) >= 9 and c[3] == "AR":
            base[c[0]] = c
    # madhel.tsv: local, icao, iata, name, city, province, kind, condition, control, status, elev, lat, lon, magvar
    for linea in (DATOS / "madhel.tsv").read_text(encoding="utf8").splitlines():
        c = linea.split("\t")
        if len(c) < 13 or c[6] == "HEL":
            continue
        lat, lon = numero(c[11]), numero(c[12])
        codigo = c[1] or c[0]
        if not codigo or lat is None or lon is None:
            continue
        b = base.get(c[1]) if c[1] else None
        nombre = (b[2] or re.sub(r"\s+(International )?(Airport|Airfield|Aerodrome)$", "", b[1])) if b else (titulo(c[4]) if c[4] else titulo(c[3]))
        por_codigo[codigo] = [codigo, nombre[:40], round(lat, 4), round(lon, 4)]
    for codigo, b in base.items():
        lat, lon = numero(b[7]), numero(b[8])
        if codigo in por_codigo or lat is None or lon is None:
            continue
        por_codigo[codigo] = [codigo, (b[2] or b[1])[:40], round(lat, 4), round(lon, 4)]
    filas = sorted(por_codigo.values())
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(json.dumps(filas, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf8")
    print(f"{len(filas)} aeródromos en {SALIDA}")


if __name__ == "__main__":
    main()
