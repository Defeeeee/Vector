"""
Seguir el vuelo en vivo (migración 041, `controllers/seguimientos.py`).

Lo puro, para probarlo sin la base: el token, las validaciones de la posición, el raleo, el
estado de un seguimiento y **lo único que sale a un link público** (`vista_publica`).

**Qué sale y qué no (invariante 14, en espíritu):** el nombre de pila, la ruta que el piloto
tenía en el Mapa (con el nombre de cada punto), el tipo de avión, cuándo empezó, el estado, la
última posición y el recorrido con altura y hora. **La matrícula sólo si el piloto prendió
"Mostrar la matrícula"** (migración 042; apagado por defecto). Nada de la bitácora, ni el
`user_id`, ni el email. `vista_publica` arma el dict campo por campo: lo que
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

#: Migración 044: quién mira el link. Un id al azar del navegador de quien mira; nada más.
VENTANA_MIRANDO_S = 45
#: Una consulta del mismo id se anota como mucho cada tanto (la página pregunta cada ~15 s).
SEGUNDOS_ENTRE_VISTAS = 30
#: Cuántos ids recientes se guardan.
TOPE_VISITANTES = 20


def id_de_visitante_valido(visitante: Any) -> bool:
    """16 a 32 caracteres url-safe. Lo demás no se anota (la consulta funciona igual)."""
    return (
        isinstance(visitante, str)
        and 16 <= len(visitante) <= 32
        and all(c.isascii() and (c.isalnum() or c in "-_") for c in visitante)
    )


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
    #: "San Fernando": para que la familia lea la ruta con nombres.
    nombre: str = Field(default="", max_length=60)

    @field_validator("codigo", "nombre")
    @classmethod
    def _limpio(cls, v: str) -> str:
        return " ".join(v.split())


class AvionCompartido(BaseModel):
    """El avión elegido en el Mapa. La matrícula viaja acá pero sólo se guarda si el piloto la prendió."""

    tipo: str = Field(default="", max_length=60)
    icao: str = Field(default="", max_length=8)
    matricula: str = Field(default="", max_length=12)

    @field_validator("tipo", "icao", "matricula")
    @classmethod
    def _limpio(cls, v: str) -> str:
        return " ".join(v.split())


class SeguimientoCrear(BaseModel):
    ruta: str = Field(default="", max_length=600)
    puntos: List[PuntoRuta] = Field(default_factory=list, max_length=TOPE_PUNTOS_RUTA)
    avion: Optional[AvionCompartido] = None
    #: Apagado por defecto: la matrícula no sale a menos que el piloto lo pida.
    mostrar_matricula: bool = False

    @field_validator("ruta")
    @classmethod
    def _sin_espacios_de_mas(cls, v: str) -> str:
        return " ".join(v.split())


class MatriculaVisible(BaseModel):
    """Prender o apagar la matrícula mientras se comparte. Para prenderla hay que mandarla."""

    mostrar: bool
    matricula: str = Field(default="", max_length=12)

    @field_validator("matricula")
    @classmethod
    def _limpia(cls, v: str) -> str:
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
    recorrido: List[List[Any]],
    lat: float,
    lon: float,
    alt_ft: Optional[float] = None,
    epoch_s: Optional[int] = None,
    tope: int = TOPE_RECORRIDO,
) -> List[List[Any]]:
    """
    Suma un punto al recorrido: [lat, lon] a 5 decimales (~1 m), o [lat, lon, alt_ft, epoch_s] si
    se sabe la altura o la hora (migración 042; la hora es la del servidor, en segundos). Los
    puntos viejos de dos elementos se conservan tal cual. Quieto (a menos de ~11 m del último) no
    suma. Al pasarse del tope se queda con un punto de cada dos —conservando el primero y el
    último—, así que un vuelo largo pierde detalle y nunca el principio ni el final.
    """
    punto: List[Any] = [round(lat, 5), round(lon, 5)]
    if alt_ft is not None or epoch_s is not None:
        punto += [None if alt_ft is None else int(round(alt_ft)), None if epoch_s is None else int(epoch_s)]
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


# --- quién mira (migración 044) ------------------------------------------------------------

def _vistas_limpias(vistas: Any) -> Dict[str, int]:
    """El `{id: epoch_s}` de la fila, sin basura."""
    if not isinstance(vistas, dict):
        return {}
    return {k: int(v) for k, v in vistas.items() if isinstance(k, str) and _es_numero(v)}


def anotar_vista(
    vistas: Any, vistos_total: Any, visitante: Any, ahora: datetime
) -> Optional[Dict[str, Any]]:
    """
    Qué escribir cuando alguien consulta el link, o `None` si no hay nada que escribir: el id no
    tiene la forma o ya se anotó hace menos de `SEGUNDOS_ENTRE_VISTAS` (para no escribir en cada
    consulta de cada visitante). Se guarda el id y la hora del servidor, **nada más**. Quedan los
    `TOPE_VISITANTES` más recientes; `vistos_total` suma uno si el id no estaba.
    """
    if not id_de_visitante_valido(visitante):
        return None
    actuales = _vistas_limpias(vistas)
    ahora_s = int(ahora.timestamp())
    previa = actuales.get(visitante)
    if previa is not None and ahora_s - previa < SEGUNDOS_ENTRE_VISTAS:
        return None
    actuales[visitante] = ahora_s
    recientes = sorted(actuales.items(), key=lambda kv: kv[1], reverse=True)[:TOPE_VISITANTES]
    total = int(vistos_total) if _es_numero(vistos_total) else 0
    return {
        "vistas": dict(recientes),
        "vistos_total": total + (0 if previa is not None else 1),
        "ultima_vista_at": ahora.astimezone(timezone.utc).isoformat(),
    }


def resumen_de_vistas(fila: Dict[str, Any], ahora: datetime) -> Dict[str, Any]:
    """**Sólo para el piloto** (la respuesta de `/posicion`): cuántos miran ahora y cuántos vieron."""
    ahora_s = ahora.timestamp()
    mirando = sum(1 for t in _vistas_limpias(fila.get("vistas")).values() if 0 <= ahora_s - t <= VENTANA_MIRANDO_S)
    total = fila.get("vistos_total")
    ultima = _fecha(fila.get("ultima_vista_at"))
    return {
        "mirando_ahora": mirando,
        "vistos_total": max(int(total) if _es_numero(total) else 0, mirando),
        "ultima_vista_at": ultima.astimezone(timezone.utc).isoformat() if ultima else None,
        "ahora": ahora.astimezone(timezone.utc).isoformat(),
    }


# --- lo que sale a un link público --------------------------------------------------------

def _es_numero(x: Any) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def _puntos_publicos(puntos: Any) -> List[List[Any]]:
    """[lat, lon, codigo, nombre]. Los viejos de tres elementos salen con el nombre vacío."""
    salida: List[List[Any]] = []
    if not isinstance(puntos, list):
        return salida
    for p in puntos[:TOPE_PUNTOS_RUTA]:
        if isinstance(p, (list, tuple)) and len(p) >= 2 and all(_es_numero(x) for x in p[:2]):
            salida.append(
                [
                    p[0],
                    p[1],
                    str(p[2])[:20] if len(p) > 2 and p[2] is not None else "",
                    str(p[3])[:60] if len(p) > 3 and p[3] is not None else "",
                ]
            )
    return salida


def _recorrido_publico(recorrido: Any) -> List[List[Any]]:
    """[lat, lon, alt_ft, epoch_s]: los viejos de dos elementos salen con altura y hora en null."""
    salida: List[List[Any]] = []
    if not isinstance(recorrido, list):
        return salida
    for p in recorrido[:400]:
        if isinstance(p, (list, tuple)) and len(p) >= 2 and all(_es_numero(x) for x in p[:2]):
            alt = p[2] if len(p) > 2 and _es_numero(p[2]) else None
            hora = p[3] if len(p) > 3 and _es_numero(p[3]) else None
            salida.append([p[0], p[1], alt, hora])
    return salida


def _avion_publico(fila: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    El avión: tipo y designador siempre; **la matrícula sólo con el interruptor prendido**, y la
    clave ni aparece si no. Se piden las dos cosas (el interruptor y la matrícula guardada): la
    base ya impide guardarla sin permiso, y esto es el segundo seguro.
    """
    tipo = (fila.get("avion_tipo") or "").strip()
    icao = (fila.get("avion_icao") or "").strip()
    matricula = (fila.get("avion_matricula") or "").strip()
    avion: Dict[str, Any] = {}
    if tipo:
        avion["tipo"] = tipo[:60]
    if icao:
        avion["icao"] = icao[:8]
    if fila.get("mostrar_matricula") is True and matricula:
        avion["matricula"] = matricula[:12]
    return avion or None


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
    inicio = _fecha(fila.get("created_at"))
    return {
        "nombre": fila.get("nombre") or "Un piloto",
        "ruta": fila.get("ruta") or "",
        "puntos": _puntos_publicos(fila.get("puntos")),
        "avion": _avion_publico(fila),
        "inicio": inicio.astimezone(timezone.utc).isoformat() if inicio else None,
        "estado": estado_de(fila, ahora),
        "ultima": ultima,
        "recorrido": _recorrido_publico(fila.get("recorrido")),
        # La hora del servidor, para que "hace 40 s" no dependa del reloj de quien mira.
        "ahora": ahora.astimezone(timezone.utc).isoformat(),
    }
