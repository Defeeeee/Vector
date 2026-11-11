"""
Seguir el vuelo en vivo (migración 041, `controllers/seguimientos.py`).

Lo puro, para probarlo sin la base: el token, las validaciones de la posición, el raleo, el
estado de un seguimiento y **lo único que sale a un link público** (`vista_publica`).

**Qué sale y qué no (invariante 14, en espíritu):** el nombre de pila, la ruta que el piloto
tenía en el Mapa, el estado, la última posición y el recorrido. Nada de la bitácora, ni la
matrícula, ni el `user_id`, ni el email. `vista_publica` arma el dict campo por campo: lo que
no está nombrado acá no sale, aunque la fila tenga más.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator

#: Cuánto dura un seguimiento si el piloto no toca Terminar.
HORAS_DE_VIDA = 12
#: Cuánto se sigue viendo después de terminar o vencer ("El vuelo terminó" con la última
#: posición, para que la familia vea dónde quedó). Pasado esto es un 404.
GRACIA_DESPUES_DE_TERMINAR = timedelta(hours=2)
#: No se acepta más de una posición cada tanto: el teléfono manda cada ~15 s, esto es el piso.
SEGUNDOS_ENTRE_POSICIONES = 10
#: Cuántos puntos guarda el recorrido; al pasarse se ralea a la mitad.
TOPE_RECORRIDO = 300
#: Un punto a menos de esto (en grados, ~11 m) del último guardado no suma al recorrido.
MOVIDO_MINIMO_GRADOS = 0.0001
#: A los cuántos días se borra todo.
DIAS_DE_RETENCION = 30
TOPE_PUNTOS_RUTA = 60

ESTADOS = ("en_vuelo", "terminado", "vencido")


def nuevo_token() -> str:
    """32 caracteres url-safe, 192 bits de azar: no se adivina ni se recorre."""
    return secrets.token_urlsafe(24)


def nombre_de_pila(first_name: Optional[str]) -> str:
    """Sólo la primera palabra del nombre: "María José" se muestra "María"."""
    partes = (first_name or "").split()
    return partes[0][:40] if partes else "Un piloto"


def _fecha(texto: Any) -> Optional[datetime]:
    if isinstance(texto, datetime):
        return texto if texto.tzinfo else texto.replace(tzinfo=timezone.utc)
    if not isinstance(texto, str):
        return None
    try:
        d = datetime.fromisoformat(texto.replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


# --- los modelos de entrada ---------------------------------------------------------------

class PuntoRuta(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    codigo: str = Field(default="", max_length=20)

    @field_validator("codigo")
    @classmethod
    def _limpio(cls, v: str) -> str:
        return " ".join(v.split())


class SeguimientoCrear(BaseModel):
    ruta: str = Field(default="", max_length=600)
    puntos: List[PuntoRuta] = Field(default_factory=list, max_length=TOPE_PUNTOS_RUTA)

    @field_validator("ruta")
    @classmethod
    def _sin_espacios_de_mas(cls, v: str) -> str:
        return " ".join(v.split())


class PosicionEnVivo(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    #: Altura GPS en pies. La atmósfera de la Argentina llega a unos 22.000 ft; el piso del
    #: GPS bajo el nivel del mar no baja de unos -1.500.
    alt_ft: Optional[int] = Field(default=None, ge=-1500, le=60000)
    gs_kt: Optional[float] = Field(default=None, ge=0, le=1000)
    track: Optional[float] = Field(default=None, ge=0, le=360)


# --- el estado y la visibilidad ----------------------------------------------------------

def estado_de(fila: Dict[str, Any], ahora: datetime) -> str:
    if fila.get("terminado_at"):
        return "terminado"
    vence = _fecha(fila.get("vence_at"))
    if vence is None or ahora >= vence:
        return "vencido"
    return "en_vuelo"


def esta_activo(fila: Dict[str, Any], ahora: datetime) -> bool:
    """¿Acepta posiciones? Sólo en vuelo."""
    return estado_de(fila, ahora) == "en_vuelo"


def visible(fila: Dict[str, Any], ahora: datetime) -> bool:
    """
    ¿Lo abre alguien con el link? En vuelo, sí; terminado o vencido, sólo
    `GRACIA_DESPUES_DE_TERMINAR` más: pasado eso es lo mismo que un link que no existe.
    """
    estado = estado_de(fila, ahora)
    if estado == "en_vuelo":
        return True
    desde = _fecha(fila.get("terminado_at")) if estado == "terminado" else _fecha(fila.get("vence_at"))
    return desde is not None and ahora < desde + GRACIA_DESPUES_DE_TERMINAR


def puede_aceptar_posicion(ultima_at: Any, ahora: datetime) -> bool:
    """El raleo del servidor: una posición cada `SEGUNDOS_ENTRE_POSICIONES` como mucho."""
    ultima = _fecha(ultima_at)
    if ultima is None:
        return True
    return (ahora - ultima).total_seconds() >= SEGUNDOS_ENTRE_POSICIONES


def agregar_al_recorrido(
    recorrido: List[List[float]], lat: float, lon: float, tope: int = TOPE_RECORRIDO
) -> List[List[float]]:
    """
    Suma un punto al recorrido ([lat, lon], a 5 decimales: ~1 m). Quieto (a menos de ~11 m del
    último) no suma. Al pasarse del tope se queda con un punto de cada dos —conservando el
    primero y el último—, así que un vuelo largo pierde detalle y nunca el principio ni el final.
    """
    punto = [round(lat, 5), round(lon, 5)]
    nuevo = [list(p) for p in recorrido]
    if nuevo:
        u = nuevo[-1]
        if abs(u[0] - punto[0]) < MOVIDO_MINIMO_GRADOS and abs(u[1] - punto[1]) < MOVIDO_MINIMO_GRADOS:
            return nuevo
    nuevo.append(punto)
    if len(nuevo) > tope:
        ultimo = nuevo[-1]
        nuevo = nuevo[::2]
        if nuevo[-1] != ultimo:
            nuevo.append(ultimo)
    return nuevo


def vence_en(ahora: datetime) -> datetime:
    return ahora + timedelta(hours=HORAS_DE_VIDA)


def limite_de_retencion(ahora: datetime) -> str:
    return (ahora - timedelta(days=DIAS_DE_RETENCION)).astimezone(timezone.utc).isoformat()


# --- lo que sale a un link público --------------------------------------------------------

def _puntos_publicos(puntos: Any) -> List[List[Any]]:
    salida: List[List[Any]] = []
    if not isinstance(puntos, list):
        return salida
    for p in puntos[:TOPE_PUNTOS_RUTA]:
        if isinstance(p, (list, tuple)) and len(p) >= 2 and all(isinstance(x, (int, float)) for x in p[:2]):
            salida.append([p[0], p[1], str(p[2])[:20] if len(p) > 2 else ""])
    return salida


def vista_publica(fila: Dict[str, Any], ahora: datetime) -> Dict[str, Any]:
    """
    **Lo único que ve quien abre el link.** Campo por campo, no "la fila menos algunos": un
    campo que se agregue a la tabla no sale hasta que se lo nombre acá, y el test lo fija.
    """
    ultima = None
    if fila.get("ultima_lat") is not None and fila.get("ultima_lon") is not None:
        ultima = {
            "lat": fila["ultima_lat"],
            "lon": fila["ultima_lon"],
            "alt_ft": fila.get("ultima_alt_ft"),
            "gs_kt": fila.get("ultima_gs_kt"),
            "track": fila.get("ultima_track"),
            "hora": fila.get("ultima_at"),
        }
    recorrido = fila.get("recorrido")
    return {
        "nombre": fila.get("nombre") or "Un piloto",
        "ruta": fila.get("ruta") or "",
        "puntos": _puntos_publicos(fila.get("puntos")),
        "estado": estado_de(fila, ahora),
        "ultima": ultima,
        "recorrido": recorrido if isinstance(recorrido, list) else [],
        # La hora del servidor, para que "hace 40 s" no dependa del reloj de quien mira.
        "ahora": ahora.astimezone(timezone.utc).isoformat(),
    }
