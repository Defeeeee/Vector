"""
Seguir el vuelo en vivo (migración 041, `controllers/seguimientos.py`).

Lo puro, para probarlo sin la base: el token, las validaciones de la posición, el raleo, el
estado de un seguimiento y **lo único que sale a un link público** (`vista_publica`).

**ADS-B (migración 045):** el seguimiento puede tener la matrícula del avión en una columna
**interna** (`matricula_adsb`, nunca pública) para completar el recorrido con las posiciones de
`adsb_posiciones` cuando el teléfono no manda, y puede nacer de un plan de vuelo (`plan_id`,
`salida_prevista`), sin teléfono. `fusionar`, `evaluar_vuelo` y `vista_publica` son puros: el
controlador sólo lee las filas de ADS-B y se las pasa.

**Qué sale y qué no (invariante 14, en espíritu):** el nombre de pila, la ruta que el piloto
tenía en el Mapa (con el nombre de cada punto), el tipo de avión, cuándo empezó, el estado, la
última posición y el recorrido con altura y hora. **La matrícula sólo si el piloto prendió
"Mostrar la matrícula"** (migración 042; apagado por defecto). Nada de la bitácora, ni el
`user_id`, ni el email. `vista_publica` arma el dict campo por campo: lo que
no está nombrado acá no sale, aunque la fila tenga más.
"""

from __future__ import annotations

import bisect
import math
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from src.services.adsb import normalizar_matricula

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

# --- ADS-B y plan de vuelo (migración 045) --------------------------------------------------

#: Las fases que ve quien abre el link. `estado` (en_vuelo/terminado/vencido) sigue siendo lo que
#: decide si acepta posiciones; la fase es lo que se le cuenta a la familia.
FASES = ("esperando", "antes_de_salir", "volando", "sin_datos", "aterrizo", "terminado")
#: Sobre el suelo: a partir de 40 kt un avión liviano está en el aire (la pérdida de un ultraliviano
#: ronda los 30; un 152 despega a ~55). Debajo de 30 kt está en tierra (rodaje, 20 kt como mucho).
#: Entre 30 y 40 no se afirma nada: es el margen que evita que un rodaje rápido o una aproximación
#: lenta con viento de frente cambien la fase de ida y vuelta.
GS_AIRE_KT = 40.0
GS_TIERRA_KT = 30.0
#: Un vuelo de verdad: al menos 3 muestras en el aire que abarquen 90 s. Un salto suelto de la
#: velocidad (un GPS que se cuelga) no lo es.
MUESTRAS_MINIMAS_VUELO = 3
SEGUNDOS_MINIMOS_VUELO = 90
#: Aterrizó cuando, después de la última muestra en el aire, hay una en tierra de hace 3 minutos o
#: más. Un toque y despegue no cuenta (a los segundos vuelve a haber muestras en el aire, y la
#: última en el aire pasa a ser posterior); un avión que apaga el transpondedor al parar tampoco
#: se pierde (la espera es desde el primer toque, no desde la última muestra).
SEGUNDOS_PARA_ATERRIZAR = 180
#: Más viejo que esto sin muestras nuevas, el dato es viejo (lo mismo que `DATOS_VIEJOS_S` de la web).
DATOS_VIEJOS_S = 120
#: En tierra y sin ver nada nuevo tanto tiempo, pasada la salida, ya no es "antes de salir".
SIN_DATOS_EN_TIERRA_S = 600
#: Cuánto después de la salida prevista sin ver ni una muestra se pasa a "sin datos".
ESPERA_SIN_VER_AL_AVION = timedelta(minutes=30)
#: ADS-B se busca desde un rato antes de la salida prevista (las demoras de escuela son así), pero
#: no desde que se creó el link: el avión pudo haber volado antes con otro piloto.
ADELANTO_ADSB = timedelta(minutes=30)
#: Cuánto después de aterrizar se siguen mostrando las posiciones (el rodaje).
COLA_TRAS_ATERRIZAR = timedelta(minutes=10)
#: El GPS del teléfono manda cada ~15 s. Si hay una posición suya a menos de esto, la de ADS-B de
#: esa hora sobra: dos fuentes para el mismo momento hacen zigzag.
GPS_VIGENTE_S = 45
#: ADS-B se guarda cada ~10 s en movimiento; para el link alcanza una cada tanto.
ADSB_CADA_S = 20
#: Cuántos puntos tiene el recorrido público, sumadas las dos fuentes.
TOPE_RECORRIDO_PUBLICO = 400
#: Cuántas filas de ADS-B lee el controlador por pedido público (las primeras y las últimas).
ADSB_PRIMERAS = 200
ADSB_ULTIMAS = 800

#: Un seguimiento desde un plan vence a la salida más la duración más esto. Dos horas cubren una
#: demora de escuela y un vuelo que se alarga; si la salida cambia, el piloto vuelve a compartir
#: desde el plan y el vencimiento se recalcula.
MARGEN_DE_VENCIMIENTO = timedelta(hours=2)
#: El plan sin duración (casilla 16) vale por esto.
DURACION_POR_DEFECTO_MIN = 120
#: Se puede compartir un vuelo que sale dentro de 24 h como mucho (si no, el link ocuparía el
#: "uno activo por piloto" y tomaría el Mapa de hoy) y uno que salió hace 12 h como mucho.
SALIDA_MAXIMA_ADELANTO = timedelta(hours=24)
SALIDA_MAXIMA_ATRASO = timedelta(hours=12)

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
    """
    El avión elegido en el Mapa. La matrícula viaja siempre, pero se guarda en dos lugares con reglas
    distintas: para mostrar (`avion_matricula`) sólo si el piloto prendió "Mostrar la matrícula", y
    para buscar el avión en ADS-B (`matricula_adsb`, migración 045) siempre, sin que salga nunca.
    """

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


class SeguimientoDesdePlan(BaseModel):
    """
    Compartir un plan de vuelo sin el teléfono (migración 045). **La matrícula, la salida y la
    duración no vienen en el pedido**: salen del plan guardado, que el backend lee con la sesión
    del piloto (sólo el dueño lo ve). Del navegador vienen sólo la ruta con sus puntos ya resueltos
    (el directorio vive en la web) y el tipo de avión.
    """

    plan_id: UUID
    ruta: str = Field(default="", max_length=600)
    puntos: List[PuntoRuta] = Field(default_factory=list, max_length=TOPE_PUNTOS_RUTA)
    avion: Optional[AvionCompartido] = None
    #: Apagado por defecto, como en el Mapa.
    mostrar_matricula: bool = False

    @field_validator("ruta")
    @classmethod
    def _sin_espacios_de_mas(cls, v: str) -> str:
        return " ".join(v.split())


class RutaNueva(BaseModel):
    """
    La ruta cambiada en vuelo (directo a…, otra ruta): reemplaza `ruta` y `puntos` del seguimiento
    que ya está en marcha. Los mismos topes que al empezar (`SeguimientoCrear`). No toca el
    recorrido: lo ya volado queda como está.
    """

    ruta: str = Field(default="", max_length=600)
    puntos: List[PuntoRuta] = Field(default_factory=list, max_length=TOPE_PUNTOS_RUTA)

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


# --- el plan de vuelo como origen (migración 045) -----------------------------------------

def salida_del_plan(plan: Dict[str, Any]) -> Optional[datetime]:
    """
    La EOBT vigente del plan en UTC: la de la última demora (DLA) o la del plan. Sale de las
    columnas de la lista (`dof`, `eobt`, `demoras`), con el formulario de respaldo. `None` si no
    hay fecha y hora con la forma esperada: nunca se inventa una salida.
    """
    dof, eobt = plan.get("dof"), plan.get("eobt")
    demoras = plan.get("demoras")
    if isinstance(demoras, list) and demoras and isinstance(demoras[-1], dict):
        dof, eobt = demoras[-1].get("dof"), demoras[-1].get("eobt")
    form = plan.get("formulario")
    if (not dof or not eobt) and isinstance(form, dict) and not (isinstance(demoras, list) and demoras):
        dof, eobt = form.get("dofUtc"), form.get("eobtUtc")
    if not isinstance(dof, str) or not isinstance(eobt, str):
        return None
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", dof[:10]) or not re.fullmatch(r"\d{4}", eobt):
        return None
    try:
        return datetime(int(dof[:4]), int(dof[5:7]), int(dof[8:10]), int(eobt[:2]), int(eobt[2:]), tzinfo=timezone.utc)
    except ValueError:
        return None


def duracion_del_plan(plan: Dict[str, Any]) -> int:
    """Minutos de la casilla 16 (EET, `0130`), o `DURACION_POR_DEFECTO_MIN` si no está o no es válida."""
    form = plan.get("formulario")
    eet = form.get("eet") if isinstance(form, dict) else None
    if isinstance(eet, str) and re.fullmatch(r"\d{4}", eet) and int(eet[2:]) < 60:
        minutos = int(eet[:2]) * 60 + int(eet[2:])
        if 1 <= minutos <= 1440:
            return minutos
    return DURACION_POR_DEFECTO_MIN


def vencimiento_desde_plan(salida: datetime, duracion_min: int, ahora: datetime) -> datetime:
    """
    La salida más la duración más `MARGEN_DE_VENCIMIENTO`; nunca antes de una hora desde ahora (se
    puede compartir un vuelo que ya salió). No son 12 horas desde que se creó: un link de un plan
    que sale mañana a las 8 no tiene que vencer esta noche.
    """
    return max(salida + timedelta(minutes=duracion_min) + MARGEN_DE_VENCIMIENTO, ahora + timedelta(hours=1))


def salida_aceptable(salida: datetime, ahora: datetime) -> Optional[str]:
    """`None` si se puede compartir un vuelo que sale a esa hora, o por qué no."""
    if salida - ahora > SALIDA_MAXIMA_ADELANTO:
        return "Ese vuelo sale dentro de más de 24 horas: compartilo más cerca de la salida."
    if ahora - salida > SALIDA_MAXIMA_ATRASO:
        return "La salida de ese plan fue hace más de 12 horas."
    return None


def matricula_para_adsb(crudo: Optional[str]) -> Optional[str]:
    """`LV-ABC` → `LVABC`, la forma de `adsb_aviones.matricula`; `None` si no parece una."""
    return normalizar_matricula(crudo)


# --- las posiciones de las dos fuentes ----------------------------------------------------

#: Una muestra: `t` (epoch s), `lat`, `lon`, `alt` (ft o None), `gs` (kt o None), `tierra`
#: (True/False/None si no se sabe), `fuente` ("gps" | "adsb") y, sólo en la última del teléfono,
#: `track` y `hora` (el texto que guardó la base).
Muestra = Dict[str, Any]


def _epoch(valor: Any) -> Optional[float]:
    d = _fecha(valor)
    return d.timestamp() if d else None


def _millas(a: Muestra, b: Muestra) -> float:
    """Distancia en NM entre dos muestras (haversine)."""
    f1, f2 = math.radians(a["lat"]), math.radians(b["lat"])
    df, dl = f2 - f1, math.radians(b["lon"] - a["lon"])
    h = math.sin(df / 2) ** 2 + math.cos(f1) * math.cos(f2) * math.sin(dl / 2) ** 2
    return 2 * 3440.065 * math.asin(min(1.0, math.sqrt(h)))


def _rumbo(a: Muestra, b: Muestra) -> float:
    f1, f2 = math.radians(a["lat"]), math.radians(b["lat"])
    dl = math.radians(b["lon"] - a["lon"])
    y = math.sin(dl) * math.cos(f2)
    x = math.cos(f1) * math.sin(f2) - math.sin(f1) * math.cos(f2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def muestras_del_telefono(fila: Dict[str, Any]) -> List[Muestra]:
    """
    Las posiciones que mandó el teléfono: el `recorrido` guardado más la última posición. Los
    puntos viejos (de dos elementos) no tienen hora: se les pone la del anterior, para que queden
    donde estaban. El recorrido no guarda la velocidad, así que se la calcula entre puntos
    seguidos (si pasó poco entre uno y otro); la última sí trae la suya.
    """
    salida: List[Muestra] = []
    recorrido = fila.get("recorrido")
    t_prev = 0.0
    if isinstance(recorrido, list):
        for p in recorrido[:400]:
            if not (isinstance(p, (list, tuple)) and len(p) >= 2 and all(_es_numero(x) for x in p[:2])):
                continue
            t = float(p[3]) if len(p) > 3 and _es_numero(p[3]) else t_prev
            t_prev = t
            salida.append(
                {
                    "t": t,
                    "lat": float(p[0]),
                    "lon": float(p[1]),
                    "alt": float(p[2]) if len(p) > 2 and _es_numero(p[2]) else None,
                    "gs": None,
                    "tierra": None,
                    "fuente": "gps",
                }
            )
    for anterior, m in zip(salida, salida[1:]):
        dt = m["t"] - anterior["t"]
        if 1 <= dt <= 240:
            m["gs"] = _millas(anterior, m) / (dt / 3600)
    ultima_t = _epoch(fila.get("ultima_at"))
    if fila.get("ultima_lat") is not None and fila.get("ultima_lon") is not None and ultima_t is not None:
        ultima: Muestra = {
            "t": ultima_t,
            "lat": float(fila["ultima_lat"]),
            "lon": float(fila["ultima_lon"]),
            "alt": float(fila["ultima_alt_ft"]) if _es_numero(fila.get("ultima_alt_ft")) else None,
            "gs": float(fila["ultima_gs_kt"]) if _es_numero(fila.get("ultima_gs_kt")) else None,
            "tierra": None,
            "fuente": "gps",
            "track": float(fila["ultima_track"]) if _es_numero(fila.get("ultima_track")) else None,
            "hora": fila.get("ultima_at"),
        }
        # El recorrido ya trae esa posición (misma hora): se queda la de `ultima_*`, que tiene la velocidad.
        salida = [m for m in salida if int(m["t"]) != int(ultima_t)]
        salida.append(ultima)
    salida.sort(key=lambda m: m["t"])
    return salida


def muestras_de_adsb(filas: Any) -> List[Muestra]:
    """Las filas de `adsb_posiciones` (visto_at, lat, lon, altitud, velocidad, en_tierra) como muestras."""
    salida: List[Muestra] = []
    if not isinstance(filas, list):
        return salida
    for f in filas:
        if not isinstance(f, dict):
            continue
        t = _epoch(f.get("visto_at"))
        if t is None or not _es_numero(f.get("lat")) or not _es_numero(f.get("lon")):
            continue
        tierra = f.get("en_tierra")
        salida.append(
            {
                "t": t,
                "lat": float(f["lat"]),
                "lon": float(f["lon"]),
                "alt": float(f["altitud"]) if _es_numero(f.get("altitud")) and tierra is not True else None,
                "gs": float(f["velocidad"]) if _es_numero(f.get("velocidad")) else None,
                "tierra": tierra if isinstance(tierra, bool) else None,
                "fuente": "adsb",
            }
        )
    salida.sort(key=lambda m: m["t"])
    return salida


def ralear_adsb(muestras: List[Muestra], cada_s: int = ADSB_CADA_S) -> List[Muestra]:
    """
    Una muestra de ADS-B cada `cada_s` segundos como mucho. Se conservan siempre la primera, la
    última y las que cambian entre tierra y aire (el despegue y el aterrizaje no se pierden en el
    raleo, y de ahí sale la fase).
    """
    if len(muestras) <= 2:
        return list(muestras)
    salida = [muestras[0]]
    for m in muestras[1:-1]:
        if m["t"] - salida[-1]["t"] >= cada_s or _en_aire(m) != _en_aire(salida[-1]):
            salida.append(m)
    salida.append(muestras[-1])
    return salida


def fusionar(telefono: List[Muestra], adsb: List[Muestra]) -> List[Muestra]:
    """
    Las dos fuentes en una sola línea de tiempo. Donde el teléfono mandó hace poco (a menos de
    `GPS_VIGENTE_S` de la muestra de ADS-B) manda el teléfono y esa muestra de ADS-B se descarta;
    donde calló, llena ADS-B. Ordenado por hora; la última es la más nueva de las dos.
    """
    gps_t = sorted(m["t"] for m in telefono)
    propias: List[Muestra] = []
    for m in adsb:
        i = bisect.bisect_left(gps_t, m["t"])
        cerca = min((abs(gps_t[j] - m["t"]) for j in (i - 1, i) if 0 <= j < len(gps_t)), default=None)
        if cerca is None or cerca > GPS_VIGENTE_S:
            propias.append(m)
    todas = list(telefono) + propias
    # Estable: con la misma hora, el teléfono primero.
    todas.sort(key=lambda m: (m["t"], 0 if m["fuente"] == "gps" else 1))
    return todas


def _en_aire(m: Muestra) -> bool:
    return m.get("tierra") is not True and m.get("gs") is not None and m["gs"] >= GS_AIRE_KT


def _en_tierra(m: Muestra) -> bool:
    return m.get("tierra") is True or (m.get("gs") is not None and m["gs"] < GS_TIERRA_KT)


def hubo_vuelo(muestras: List[Muestra]) -> bool:
    """¿Hay pruebas de un vuelo? Al menos `MUESTRAS_MINIMAS_VUELO` en el aire, abarcando `SEGUNDOS_MINIMOS_VUELO`."""
    aire = [m for m in muestras if _en_aire(m)]
    return len(aire) >= MUESTRAS_MINIMAS_VUELO and aire[-1]["t"] - aire[0]["t"] >= SEGUNDOS_MINIMOS_VUELO


def aterrizaje(muestras: List[Muestra], ahora: datetime) -> Optional[datetime]:
    """
    Cuándo tocó tierra, o `None` si no aterrizó (o no hay pruebas todavía). Hubo un vuelo, la última
    muestra en el aire quedó atrás y la primera en tierra después de ella es de hace
    `SEGUNDOS_PARA_ATERRIZAR` o más. Sin ninguna muestra en tierra no se afirma nada: un avión que
    desaparece en el aire (fuera de cobertura) es "sin datos", no "aterrizó".
    """
    if not hubo_vuelo(muestras):
        return None
    ultimo_aire = max(i for i, m in enumerate(muestras) if _en_aire(m))
    toque = next((m for m in muestras[ultimo_aire + 1 :] if _en_tierra(m)), None)
    if toque is None or ahora.timestamp() - toque["t"] < SEGUNDOS_PARA_ATERRIZAR:
        return None
    return datetime.fromtimestamp(toque["t"], tz=timezone.utc)


def ventana_adsb(fila: Dict[str, Any], ahora: datetime) -> Optional[Tuple[datetime, datetime]]:
    """
    El rango de horas de `adsb_posiciones` que se lee para este seguimiento, o `None` si no tiene
    matrícula para buscar. **Desde** un rato antes de la salida prevista (un seguimiento desde un
    plan) o desde que se creó (el del Mapa); **hasta** ahora, o el fin si ya terminó.
    """
    if not matricula_para_adsb(fila.get("matricula_adsb")):
        return None
    salida = _fecha(fila.get("salida_prevista"))
    desde = salida - ADELANTO_ADSB if salida else _fecha(fila.get("created_at"))
    if desde is None:
        return None
    fin = _fecha(fila.get("terminado_at"))
    if fin is not None:
        hasta = fin + COLA_TRAS_ATERRIZAR if fila.get("aterrizo_at") else fin
    elif estado_de(fila, ahora) == "vencido":
        hasta = _fecha(fila.get("vence_at")) or ahora
    else:
        hasta = ahora
    return desde, min(hasta, ahora)


def sin_el_vuelo_anterior(adsb: List[Muestra]) -> List[Muestra]:
    """
    Un avión de escuela vuela con otros pilotos: si a la hora en que empieza la ventana de un plan
    ya está en el aire, ese vuelo es de otro (o es el tramo anterior) y no se muestra. Se descarta
    todo hasta la primera muestra en tierra; si nunca toca tierra, no se puede saber de quién es
    y no se muestra nada (es "sin datos", no un vuelo inventado). Si la primera muestra no está
    en el aire —en tierra, o sin velocidad— no se descarta nada.
    """
    if not adsb or not _en_aire(adsb[0]):
        return adsb
    for i, m in enumerate(adsb):
        if _en_tierra(m):
            return adsb[i:]
    return []


def unir_filas_adsb(*listas: Any) -> List[Dict[str, Any]]:
    """Las filas de ADS-B de varias lecturas (las primeras y las últimas de la ventana) sin repetir, por hora."""
    vistas: Dict[str, Dict[str, Any]] = {}
    for lista in listas:
        for f in lista if isinstance(lista, list) else []:
            if isinstance(f, dict) and isinstance(f.get("visto_at"), str):
                vistas[f["visto_at"]] = f
    return [vistas[k] for k in sorted(vistas)]


def _muestras_del_seguimiento(fila: Dict[str, Any], adsb: Any, ahora: datetime) -> List[Muestra]:
    """Las dos fuentes juntas, sin nada posterior al fin de la ventana ni (en un plan) anterior a ella."""
    telefono = muestras_del_telefono(fila)
    ventana = ventana_adsb(fila, ahora)
    propias = muestras_de_adsb(adsb) if ventana else []
    if ventana:
        propias = [m for m in propias if ventana[0].timestamp() <= m["t"] <= ventana[1].timestamp()]
        if fila.get("salida_prevista"):
            propias = sin_el_vuelo_anterior(propias)
    todas = fusionar(telefono, ralear_adsb(propias))
    # Terminado por aterrizaje: el link muestra hasta el rodaje, no lo que haga el avión después.
    if fila.get("aterrizo_at") and ventana:
        todas = [m for m in todas if m["t"] <= ventana[1].timestamp()]
    return todas


def evaluar_vuelo(fila: Dict[str, Any], adsb: Any, ahora: datetime, muestras: Optional[List[Muestra]] = None) -> Dict[str, Any]:
    """
    La fase del link y, si se detectó, cuándo aterrizó. `{"fase": …, "aterrizo_at": datetime | None}`.

    - Un seguimiento desde un plan (`salida_prevista`) distingue **antes de salir** (todavía en
      tierra o sin que nadie lo vea), **volando**, **aterrizó** y **sin datos**. Nunca inventa un
      vuelo: sin muestras, antes de la salida es "antes de salir"; media hora después de la salida,
      sin haber visto al avión ni una vez, es "sin datos" (puede que no transmita ADS-B o que no
      haya receptores cerca).
    - Uno del Mapa no tiene salida: "esperando" sin posiciones, "volando" con una reciente, "sin
      datos" si pasaron más de `DATOS_VIEJOS_S`. El detalle (en tierra, nivelado…) lo calcula la web.
    - `aterrizo_at` sólo se devuelve para un seguimiento desde un plan que sigue en vuelo; el
      controlador lo guarda y lo termina. Uno ya terminado por aterrizaje dice "aterrizo".
    """
    if fila.get("aterrizo_at"):
        return {"fase": "aterrizo", "aterrizo_at": None}
    if estado_de(fila, ahora) != "en_vuelo":
        return {"fase": "terminado", "aterrizo_at": None}
    if muestras is None:
        muestras = _muestras_del_seguimiento(fila, adsb, ahora)
    salida = _fecha(fila.get("salida_prevista"))
    if not muestras:
        if salida is None:
            return {"fase": "esperando", "aterrizo_at": None}
        return {"fase": "antes_de_salir" if ahora < salida + ESPERA_SIN_VER_AL_AVION else "sin_datos", "aterrizo_at": None}
    ultima = muestras[-1]
    edad = ahora.timestamp() - ultima["t"]
    if salida is None:
        return {"fase": "sin_datos" if edad > DATOS_VIEJOS_S else "volando", "aterrizo_at": None}
    toque = aterrizaje(muestras, ahora)
    if toque is not None:
        return {"fase": "aterrizo", "aterrizo_at": toque}
    if _en_aire(ultima) and edad <= DATOS_VIEJOS_S:
        return {"fase": "volando", "aterrizo_at": None}
    if hubo_vuelo(muestras):
        # Hubo vuelo y la última ya no es en el aire: rodando tras tocar (espera de 3 min) o sin datos.
        return {"fase": "sin_datos" if edad > DATOS_VIEJOS_S else "volando", "aterrizo_at": None}
    if edad > SIN_DATOS_EN_TIERRA_S and ahora >= salida + ESPERA_SIN_VER_AL_AVION:
        return {"fase": "sin_datos", "aterrizo_at": None}
    return {"fase": "antes_de_salir", "aterrizo_at": None}


def _recorrido_publico(muestras: List[Muestra], tope: int = TOPE_RECORRIDO_PUBLICO) -> List[List[Any]]:
    """
    `[lat, lon, alt_ft, epoch_s, fuente]` con `fuente` "gps" o "adsb". Si pasa de `tope` se queda con
    puntos parejos —el primero y el último siempre—. Los puntos viejos del teléfono salen con altura
    y hora en null. La altura de ADS-B es barométrica (1013 hPa) y la del teléfono es GPS: la web
    no las compara entre sí.
    """
    if len(muestras) > tope:
        paso = (len(muestras) - 1) / (tope - 1)
        indices = sorted({round(i * paso) for i in range(tope)})
        muestras = [muestras[i] for i in indices]
    salida: List[List[Any]] = []
    for m in muestras:
        con_hora = m["t"] > 0
        salida.append(
            [
                m["lat"],
                m["lon"],
                int(round(m["alt"])) if m["alt"] is not None else None,
                int(m["t"]) if con_hora else None,
                m["fuente"],
            ]
        )
    return salida


def _ultima_publica(muestras: List[Muestra]) -> Optional[Dict[str, Any]]:
    """La muestra más nueva de las dos fuentes, con de dónde salió. El rumbo de ADS-B se calcula con las dos últimas."""
    if not muestras:
        return None
    m = muestras[-1]
    track = m.get("track")
    if track is None and m["fuente"] == "adsb":
        previa = next((p for p in reversed(muestras[:-1]) if p["fuente"] == "adsb" and _millas(p, m) >= 0.03), None)
        track = round(_rumbo(previa, m)) if previa else None
    gs = m["gs"]
    if gs is not None and m["fuente"] == "gps" and "hora" not in m:
        gs = None  # una velocidad calculada entre puntos no es la que midió el GPS: no se muestra como tal
    hora = m.get("hora") or datetime.fromtimestamp(m["t"], tz=timezone.utc).isoformat()
    return {
        "lat": m["lat"],
        "lon": m["lon"],
        "alt_ft": int(round(m["alt"])) if m["alt"] is not None else None,
        "gs_kt": round(gs, 1) if gs is not None else None,
        "track": track,
        "hora": hora,
        "fuente": m["fuente"],
    }


def vista_publica(fila: Dict[str, Any], ahora: datetime, adsb: Any = None) -> Dict[str, Any]:
    """
    **Lo único que ve quien abre el link.** Campo por campo, no "la fila menos algunos": un
    campo que se agregue a la tabla no sale hasta que se lo nombre acá, y el test lo fija.

    `adsb` son las filas de `adsb_posiciones` que leyó el controlador (ver `ventana_adsb`); sin
    ellas el link es el del teléfono solo, como hasta la 044. **La matrícula de ADS-B
    (`matricula_adsb`) no sale**: sólo dice, en `con_adsb`, que el respaldo existe.
    """
    muestras = _muestras_del_seguimiento(fila, adsb, ahora)
    inicio = _fecha(fila.get("created_at"))
    salida = _fecha(fila.get("salida_prevista"))
    return {
        "nombre": fila.get("nombre") or "Un piloto",
        "ruta": fila.get("ruta") or "",
        "puntos": _puntos_publicos(fila.get("puntos")),
        "avion": _avion_publico(fila),
        "inicio": inicio.astimezone(timezone.utc).isoformat() if inicio else None,
        "estado": estado_de(fila, ahora),
        # Migración 045: en qué está el vuelo, la salida prevista de un plan y si hay respaldo ADS-B.
        "fase": evaluar_vuelo(fila, adsb, ahora, muestras)["fase"],
        "salida_prevista": salida.astimezone(timezone.utc).isoformat() if salida else None,
        "con_adsb": bool(matricula_para_adsb(fila.get("matricula_adsb"))),
        "ultima": _ultima_publica(muestras),
        "recorrido": _recorrido_publico(muestras),
        # La hora del servidor, para que "hace 40 s" no dependa del reloj de quien mira.
        "ahora": ahora.astimezone(timezone.utc).isoformat(),
    }
