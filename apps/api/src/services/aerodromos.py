"""
Los aeródromos argentinos con coordenadas (`src/data/aerodromos_ar.json`, de `generar_aerodromos_ar.py`),
para saber **dónde** aterrizó un vuelo compartido cuando no fue en el destino cargado. Sin red: un
JSON chico, commiteado, que se lee una vez.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any, Dict, List, Optional

_ARCHIVO = Path(__file__).resolve().parent.parent / "data" / "aerodromos_ar.json"
_FILAS: Optional[List[List[Any]]] = None


def _cargar() -> List[List[Any]]:
    global _FILAS
    if _FILAS is None:
        try:
            _FILAS = json.loads(_ARCHIVO.read_text(encoding="utf8"))
        except (OSError, ValueError):
            _FILAS = []
    return _FILAS


def _millas(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    f1, f2 = math.radians(lat1), math.radians(lat2)
    h = math.sin((f2 - f1) / 2) ** 2 + math.cos(f1) * math.cos(f2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * 3440.065 * math.asin(min(1.0, math.sqrt(h)))


def mas_cercano(lat: float, lon: float, radio_nm: float) -> Optional[Dict[str, Any]]:
    """
    El aeródromo más cercano a `radio_nm` o menos: `{"codigo", "nombre", "lat", "lon", "distancia_nm"}`, o
    `None`. Un recorte por latitud primero (1° son 60 NM) para no medir los 600.
    """
    banda = radio_nm / 60.0 + 0.01
    mejor: Optional[Dict[str, Any]] = None
    for codigo, nombre, a_lat, a_lon in _cargar():
        if abs(a_lat - lat) > banda:
            continue
        d = _millas(lat, lon, a_lat, a_lon)
        if d <= radio_nm and (mejor is None or d < mejor["distancia_nm"]):
            mejor = {"codigo": codigo, "nombre": nombre, "lat": a_lat, "lon": a_lon, "distancia_nm": d}
    return mejor
