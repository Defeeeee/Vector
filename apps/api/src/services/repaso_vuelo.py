"""
El repaso de un vuelo planeado: lo que el ADS-B vio del avión de un plan de vuelo, contra lo
que decía el plan. Es la parte pura de `GET /planes-de-vuelo/{id}/repaso`: toma el plan, las
filas de `adsb_posiciones` y los puntos de la ruta, y devuelve los números. No lee nada.

Lo que hay que saber de la señal (medido en `services/seguimientos.py`): ADS-B casi nunca ve al
avión en tierra. Arranca en el aire, a 50-300 ft y 55-65 kt, y se corta en la final, a 0-300 ft
y 60-70 kt. Por eso las horas de acá son **de cuándo el ADS-B lo vio en el aire**, no horarios
de la bitácora (el piloto anota los suyos, de tacómetro o de calzos), y el vuelo se corta con
las mismas reglas que el link público.

Invariante 2: "no lo vio el ADS-B" no es "no voló". Sin datos se dice `sin_datos` con el
motivo, nunca un vuelo en cero.
"""

from __future__ import annotations

import math
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from src.services.adsb import aterrizajes as aterrizajes_de_tramo
from src.services.seguimientos import (
    ADELANTO_ADSB,
    COLA_TRAS_ATERRIZAR,
    HUECO_ENTRE_VUELOS_S,
    Muestra,
    _de_aproximacion,
    _en_aire,
    _en_tierra,
    _llegando,
    aterrizaje,
    duracion_del_plan,
    hubo_vuelo,
    matricula_para_adsb,
    muestras_de_adsb,
    salida_del_plan,
    sin_el_vuelo_anterior,
)

#: Cuánto después de la llegada estimada (salida + EET) se sigue buscando al avión.
MARGEN_DESPUES_DE_LA_LLEGADA = timedelta(hours=3)
#: La ventana nunca pasa de esto, aunque la casilla 16 diga 24 horas: son filas de más.
VENTANA_MAXIMA = timedelta(hours=14)
#: Puntos del recorrido que sale en la respuesta (sin horas: es para dibujar).
TOPE_RECORRIDO = 400
#: Máximo de puntos de ruta que acepta el pedido.
TOPE_PUNTOS_RUTA = 60
#: Cerca de la salida y del destino el avión hace circuito y rodaje: ahí no hay "desvío".
RADIO_SIN_DESVIO_NM = 2.0
#: Una ruta de menos que esto (un vuelo local, un solo punto) no tiene contra qué medir el desvío.
RUTA_MINIMA_NM = 3.0

AVISO = (
    "Las horas son de cuándo el ADS-B vio al avión en el aire. No son los horarios de la "
    "bitácora: el ADS-B casi nunca lo ve en tierra, así que el despegue y el aterrizaje reales "
    "son un poco antes y un poco después."
)


# --- la ruta ------------------------------------------------------------------------------

Punto = Tuple[float, float, str]


def parsear_puntos(texto: Optional[str]) -> List[Punto]:
    """
    Los puntos de la ruta como los manda la web: `lat,lon,CODIGO;lat,lon,CODIGO` (el código es
    opcional). Lo que no se entiende se descarta; nunca tira.
    """
    salida: List[Punto] = []
    for trozo in (texto or "").split(";")[:TOPE_PUNTOS_RUTA]:
        partes = trozo.strip().split(",")
        if len(partes) < 2:
            continue
        try:
            lat, lon = float(partes[0]), float(partes[1])
        except ValueError:
            continue
        if not (math.isfinite(lat) and math.isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180):
            continue
        codigo = re.sub(r"[^A-Za-z0-9 _-]", "", partes[2].strip())[:16] if len(partes) > 2 else ""
        salida.append((lat, lon, codigo))
    return salida


def puntos_del_seguimiento(puntos: Any) -> List[Punto]:
    """Los `puntos` guardados en el link (`[lat, lon, codigo, nombre]`) como puntos de ruta."""
    salida: List[Punto] = []
    for p in puntos if isinstance(puntos, list) else []:
        if isinstance(p, (list, tuple)) and len(p) >= 2 and all(isinstance(x, (int, float)) for x in p[:2]):
            codigo = str(p[2]) if len(p) > 2 and p[2] else ""
            salida.append((float(p[0]), float(p[1]), codigo[:16]))
    return salida[:TOPE_PUNTOS_RUTA]


def distancia_nm(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    f1, f2 = math.radians(lat1), math.radians(lat2)
    h = math.sin((f2 - f1) / 2) ** 2 + math.cos(f1) * math.cos(f2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * 3440.065 * math.asin(min(1.0, math.sqrt(h)))


def millas_planeadas(puntos: List[Punto]) -> float:
    return sum(distancia_nm(a[0], a[1], b[0], b[1]) for a, b in zip(puntos, puntos[1:]))


def _a_plano(lat: float, lon: float, lat0: float, lon0: float) -> Tuple[float, float]:
    """Millas al este y al norte de un origen: sobra para tramos de cientos de millas."""
    return (lon - lon0) * math.cos(math.radians(lat0)) * 60.0, (lat - lat0) * 60.0


def _a_segmento_nm(lat: float, lon: float, a: Punto, b: Punto) -> float:
    px, py = _a_plano(lat, lon, lat, lon)
    ax, ay = _a_plano(a[0], a[1], lat, lon)
    bx, by = _a_plano(b[0], b[1], lat, lon)
    dx, dy = bx - ax, by - ay
    largo2 = dx * dx + dy * dy
    t = 0.0 if largo2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / largo2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def desvio_lateral(muestras: List[Muestra], puntos: List[Punto]) -> Optional[Dict[str, Any]]:
    """
    Lo más que se apartó de la línea de la ruta del plan, en millas, y en qué tramo. Se mide
    contra el segmento más cercano (no hay que haber pasado por los puntos en orden). Se dejan
    afuera las muestras a `RADIO_SIN_DESVIO_NM` o menos de la salida y del destino. `None` si
    la ruta es demasiado corta para medir.
    """
    if len(puntos) < 2 or millas_planeadas(puntos) < RUTA_MINIMA_NM or not muestras:
        return None
    salida, destino = puntos[0], puntos[-1]
    mejor: Optional[Tuple[float, int]] = None
    for m in muestras:
        if distancia_nm(m["lat"], m["lon"], salida[0], salida[1]) <= RADIO_SIN_DESVIO_NM:
            continue
        if distancia_nm(m["lat"], m["lon"], destino[0], destino[1]) <= RADIO_SIN_DESVIO_NM:
            continue
        d, i = min((_a_segmento_nm(m["lat"], m["lon"], a, b), i) for i, (a, b) in enumerate(zip(puntos, puntos[1:])))
        if mejor is None or d > mejor[0]:
            mejor = (d, i)
    if mejor is None:
        return None
    d, i = mejor
    return {"max_nm": round(d, 1), "tramo": {"indice": i, "desde": puntos[i][2] or None, "hasta": puntos[i + 1][2] or None}}


# --- el plan ------------------------------------------------------------------------------

def eet_del_plan(plan: Dict[str, Any]) -> Optional[int]:
    """Minutos de la casilla 16 (`0130`), o `None` si no está: acá no se inventa una duración."""
    form = plan.get("formulario")
    eet = form.get("eet") if isinstance(form, dict) else None
    if isinstance(eet, str) and re.fullmatch(r"\d{4}", eet) and int(eet[2:]) < 60:
        minutos = int(eet[:2]) * 60 + int(eet[2:])
        if 1 <= minutos <= 1440:
            return minutos
    return None


def matricula_del_plan(plan: Dict[str, Any]) -> Optional[str]:
    form = plan.get("formulario") if isinstance(plan.get("formulario"), dict) else {}
    return matricula_para_adsb(plan.get("matricula") or form.get("matricula"))


def ventana_del_repaso(plan: Dict[str, Any], aterrizo_at: Optional[datetime], ahora: datetime) -> Optional[Tuple[datetime, datetime]]:
    """
    De media hora antes de la salida vigente a la llegada estimada más 3 horas (o, si el link
    del plan ya vio aterrizar, ese momento más la cola del rodaje), sin pasar de ahora. `None`
    si el plan no tiene salida.
    """
    salida = salida_del_plan(plan)
    if salida is None:
        return None
    desde = salida - ADELANTO_ADSB
    if aterrizo_at is not None:
        hasta = aterrizo_at + COLA_TRAS_ATERRIZAR
    else:
        hasta = salida + timedelta(minutes=duracion_del_plan(plan)) + MARGEN_DESPUES_DE_LA_LLEGADA
    return desde, min(hasta, desde + VENTANA_MAXIMA, ahora)


# --- el vuelo dentro de las muestras --------------------------------------------------------

def cortar_en_el_aterrizaje(muestras: List[Muestra], destino: Optional[Muestra]) -> Tuple[List[Muestra], bool]:
    """
    El vuelo, sin lo que el avión haga después (otro piloto, el mismo avión). `(muestras, cortó)`:
    cortó es que se vio el final. Termina en la primera muestra en tierra después de haber estado
    en el aire, o antes de un silencio de `HUECO_ENTRE_VUELOS_S` que sigue a una aproximación o
    a una muestra baja y lenta cerca del destino. Un silencio después de un crucero es falta de
    cobertura en vuelo y no corta.
    """
    en_el_aire = False
    for i, m in enumerate(muestras):
        if _en_aire(m):
            en_el_aire = True
        elif en_el_aire and _en_tierra(m):
            return muestras[: i + 1], True
        if en_el_aire and i + 1 < len(muestras) and muestras[i + 1]["t"] - m["t"] >= HUECO_ENTRE_VUELOS_S:
            if _de_aproximacion(muestras, i) or _llegando(m, destino):
                return muestras[: i + 1], True
    return muestras, False


def _iso(t: float) -> str:
    return datetime.fromtimestamp(t, tz=timezone.utc).isoformat(timespec="seconds")


def ralear_recorrido(muestras: List[Muestra], tope: int = TOPE_RECORRIDO) -> List[List[Any]]:
    """`[lat, lon, altitud]` de a lo sumo `tope` puntos, parejos, siempre con el primero y el último. Sin horas."""
    n = len(muestras)
    paso = max(1, math.ceil(n / tope)) if n > tope else 1
    elegidas = muestras[::paso]
    if elegidas and elegidas[-1] is not muestras[-1]:
        if len(elegidas) >= tope:
            elegidas = elegidas[: tope - 1]
        elegidas.append(muestras[-1])
    return [[round(m["lat"], 5), round(m["lon"], 5), round(m["alt"]) if m.get("alt") is not None else None] for m in elegidas]


def _sin_datos(motivo: str, **extra: Any) -> Dict[str, Any]:
    return {"estado": "sin_datos", "motivo": motivo, **extra}


def repasar(
    plan: Dict[str, Any],
    filas_adsb: Any,
    puntos: List[Punto],
    ahora: datetime,
    aterrizo_at: Optional[datetime] = None,
) -> Dict[str, Any]:
    """
    El repaso. `estado`:

    - `completo`: se vio el vuelo y su final (aterrizó según el ADS-B, o el link del plan ya lo
      había visto aterrizar);
    - `parcial`: se lo vio en el aire pero no el final (sigue volando, o se perdió la señal
      antes): los números son de lo que se vio;
    - `sin_datos`: no hay ADS-B de ese vuelo, con el motivo. No dice que no haya volado.
    """
    if plan.get("cancelado_at"):
        return _sin_datos("El plan está cancelado.")
    matricula = matricula_del_plan(plan)
    if not matricula:
        return _sin_datos("El plan no tiene matrícula (casilla 7): sin ella no se sabe qué avión mirar.")
    ventana = ventana_del_repaso(plan, aterrizo_at, ahora)
    if ventana is None:
        return _sin_datos("El plan no tiene fecha y hora de salida.")
    desde, hasta = ventana
    if hasta <= desde:
        return _sin_datos("Todavía no es la hora de salida del plan.")

    muestras = [m for m in muestras_de_adsb(filas_adsb) if desde.timestamp() <= m["t"] <= hasta.timestamp()]
    if not muestras:
        return _sin_datos(
            "El ADS-B no vio a ese avión en el horario del plan. Puede que no transmita, que haya "
            "volado fuera de la cobertura o que haya salido muy distinto de lo planeado: no quiere decir que no haya volado.",
            ventana={"desde": desde.isoformat(timespec="seconds"), "hasta": hasta.isoformat(timespec="seconds")},
        )
    muestras = sin_el_vuelo_anterior(muestras, desde)
    if not muestras:
        return _sin_datos(
            "Cuando se abrió el horario del plan el avión ya estaba en el aire (otro vuelo) y no se pudo separar el tuyo."
        )

    ult = puntos[-1] if puntos else None
    destino: Optional[Muestra] = {"lat": ult[0], "lon": ult[1]} if ult else None
    vuelo, corto = cortar_en_el_aterrizaje(muestras, destino)
    if not hubo_vuelo(vuelo):
        return _sin_datos("El ADS-B vio al avión, pero no hay pruebas de un vuelo (muy pocas posiciones en el aire).")

    aterrizo = corto or aterrizaje(vuelo, ahora, destino) is not None or aterrizo_at is not None
    aire = [m for m in vuelo if _en_aire(m)]
    primera, ultima = aire[0], vuelo[-1]
    # Si el recorte no vio el final pero el link del plan sí (el teléfono, o el ADS-B con la cobertura
    # que había), el aterrizaje es el del link; si no, la última muestra.
    fin_t = aterrizo_at.timestamp() if (aterrizo_at is not None and not corto and aterrizo_at.timestamp() >= ultima["t"]) else ultima["t"]
    minutos = round((fin_t - primera["t"]) / 60)

    alts = [m["alt"] for m in vuelo if m.get("alt") is not None]
    gss = [m["gs"] for m in aire if m.get("gs") is not None]
    millas = sum(distancia_nm(a["lat"], a["lon"], b["lat"], b["lon"]) for a, b in zip(vuelo, vuelo[1:]))
    sin_senal = sum(max(0.0, b["t"] - a["t"] - 120) for a, b in zip(vuelo, vuelo[1:]) if b["t"] - a["t"] > 120) / 60
    eet = eet_del_plan(plan)
    planeadas = millas_planeadas(puntos) if len(puntos) >= 2 else None

    return {
        "estado": "completo" if aterrizo else "parcial",
        "motivo": None if aterrizo else "El ADS-B no vio el final: el avión sigue en el aire o se perdió la señal antes de aterrizar. Los números son de lo que se vio.",
        "aviso": AVISO,
        "despegue_adsb": _iso(primera["t"]),
        "aterrizaje_adsb": _iso(fin_t) if aterrizo else None,
        "ultima_vista": _iso(ultima["t"]),
        "minutos_en_aire": minutos,
        "eet_min": eet,
        "diferencia_min": (minutos - eet) if eet is not None else None,
        "altitud_max_ft": round(max(alts)) if alts else None,
        "gs_max_kt": round(max(gss)) if gss else None,
        "gs_media_kt": round(sum(gss) / len(gss)) if gss else None,
        "millas_voladas": round(millas, 1),
        "millas_planeadas": round(planeadas, 1) if planeadas is not None else None,
        "desvio": desvio_lateral(vuelo, puntos),
        "aterrizajes_estimados": aterrizajes_de_tramo([{"visto_at": datetime.fromtimestamp(m["t"], tz=timezone.utc), "altitud": m.get("alt")} for m in vuelo]),
        "minutos_sin_senal": round(sin_senal),
        "cerca_del_destino": _llegando(ultima, destino) if destino is not None else None,
        "recorrido": ralear_recorrido(vuelo),
    }
