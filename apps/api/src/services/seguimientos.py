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
from src.services.aerodromos import mas_cercano

#: Cuánto dura un seguimiento si el piloto no toca Terminar.
HORAS_DE_VIDA = 12
#: Cuánto se sigue viendo el link después de terminar o vencer ("El vuelo terminó" con la última
#: posición y el recorrido, para que la familia vea dónde quedó y lo pueda volver a mirar). Pasado
#: esto es un 404. Una semana desde la 3.45.1 (Federico: "quiero que duren 1 semana"); hasta ahí,
#: 2 h. Mirarlo no lee ADS-B posterior al vuelo: la ventana corta en su fin (`ventana_adsb`).
GRACIA_DESPUES_DE_TERMINAR = timedelta(days=7)
#: En el inicio de Vector Tracker, los vuelos que terminaron hace poco (para que "aterrizó" no
#: desaparezca de golpe). No es lo mismo que la vida del link: una semana ahí sería ruido.
TRACKER_TERMINADOS_RECIENTES = timedelta(hours=2)
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
#: La cobertura de ADS-B casi nunca ve al avión en tierra (de 68 vuelos grabados del LV-S048, sólo 3
#: tienen alguna muestra en tierra): arranca en el aire a 50-300 ft y 55-65 kt y se corta en la final
#: a 0-300 ft y 60-70 kt. Por eso "de aproximación" es una muestra baja y lenta: GS de 85 kt o menos
#: y altitud de 800 ft o menos (o sin altitud). La altitud de ADS-B es barométrica y puede ser
#: negativa; en crucero se ve a 90-100 kt y más de 600 ft, y eso no es una aproximación.
ALT_APROXIMACION_FT = 800
GS_APROXIMACION_KT = 85
#: Un silencio de ADS-B de 10 minutos o más entre dos muestras. Después de una aproximación, es el
#: avión que aterrizó y estuvo parado; después de un crucero, un hueco de cobertura en vuelo.
HUECO_ENTRE_VUELOS_S = 600
#: Si la primera muestra de la ventana está a menos de 3 minutos de su inicio, el avión ya estaba
#: volando cuando se abrió; más tarde es un despegue que empieza dentro de la ventana.
EN_CURSO_AL_ABRIR_S = 180
#: Aterrizó sin que nadie lo vea en tierra: la última muestra es baja, lenta y cerca del destino, y
#: pasaron 5 minutos sin una nueva. Más lejos del destino, o más alto, un avión que desaparece es
#: "sin datos" (no sé no es no hay).
RADIO_DESTINO_NM = 3.0
ALT_LLEGADA_FT = 1000
GS_LLEGADA_KT = 90
SILENCIO_ATERRIZAJE_S = 300
#: Un avión que desaparece y **vuelve a verse en el aire** después de tanto tiempo sin señal: el tramo de
#: antes terminó en algún lado que ADS-B no vio (un corte en altura que no vuelve nunca no cuenta).
CORTE_REAPARECE_S = 1200
#: Aterrizar en el mismo aeródromo del que se despegó, sin haberse alejado: antes de esto la señal que se
#: corta baja y lenta es el ascenso inicial, no una llegada.
VUELO_MINIMO_PARA_VOLVER_S = 900
#: Un tramo encadenado (mismo piloto, mismo avión): el anterior tiene que haber salido hasta tanto antes.
CADENA_MAXIMA_ATRAS = timedelta(hours=12)
#: Más viejo que esto sin muestras nuevas, el dato es viejo (lo mismo que `DATOS_VIEJOS_S` de la web).
DATOS_VIEJOS_S = 120
#: En tierra y sin ver nada nuevo tanto tiempo, pasada la salida, ya no es "antes de salir".
SIN_DATOS_EN_TIERRA_S = 600
#: Cuánto después de la salida prevista sin ver ni una muestra se pasa a "sin datos".
ESPERA_SIN_VER_AL_AVION = timedelta(minutes=30)
#: ADS-B se busca desde un rato antes de la salida prevista (las demoras de escuela son así), pero
#: no desde que se creó el link: el avión pudo haber volado antes con otro piloto.
ADELANTO_ADSB = timedelta(minutes=30)
#: Un tramo encadenado (mismo piloto y avión) mira desde que terminó el anterior, pero como mucho
#: esto antes de su salida prevista (el 2026-11-16 la vuelta salió 2 h 30 antes de lo previsto).
ADELANTO_ENCADENADO = timedelta(hours=3)
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

#: Migración 055: cuántos seguimientos sin terminar (y sin vencer) puede tener una cuenta a la vez.
TOPE_ACTIVOS = 5
#: Compartir un vuelo sin plan: la duración que se acepta, en minutos.
DURACION_MINIMA_SIN_PLAN_MIN = 10
DURACION_MAXIMA_SIN_PLAN_MIN = 720

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


class SeguimientoSinPlan(BaseModel):
    """
    Compartir un vuelo **sin plan ni ruta** (migración 055): origen, destino, salida y duración
    estimada. **El avión no viene con su matrícula**: el backend lee el `aircraft` del piloto con su
    sesión (un avión ajeno es un 404) y de ahí salen la matrícula, el tipo y el ICAO. Con
    `seguimiento_id` se actualiza ese link (el piloto sale más tarde) sin cambiar el token.
    """

    aircraft_id: UUID
    origen: PuntoRuta
    destino: PuntoRuta
    #: ISO con zona; se pasa a UTC. Una hora sin zona no se acepta: sería adivinar.
    salida: datetime
    duracion_min: int = Field(ge=DURACION_MINIMA_SIN_PLAN_MIN, le=DURACION_MAXIMA_SIN_PLAN_MIN)
    mostrar_matricula: bool = False
    seguimiento_id: Optional[UUID] = None

    @field_validator("salida")
    @classmethod
    def _con_zona(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            raise ValueError("La salida necesita zona horaria (UTC).")
        return v.astimezone(timezone.utc)


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


class DestinoNuevo(BaseModel):
    """
    Cambiar sólo el destino de un seguimiento en marcha (`POST /seguimientos/{id}/destino`): el piloto
    se desvió o aterrizó en otro lado y no quiere cargar la ruta de nuevo.
    """

    punto: PuntoRuta


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


def reciente_para_el_tracker(fila: Dict[str, Any], ahora: datetime) -> bool:
    """¿Va en la lista del inicio de Vector Tracker? En vuelo, o terminado/vencido hace menos de `TRACKER_TERMINADOS_RECIENTES`."""
    estado = estado_de(fila, ahora)
    if estado == "en_vuelo":
        return True
    desde = _fecha(fila.get("terminado_at")) if estado == "terminado" else _fecha(fila.get("vence_at"))
    return desde is not None and ahora < desde + TRACKER_TERMINADOS_RECIENTES


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


def mensaje_del_tope(activos: int) -> Optional[str]:
    """`None` si cabe uno más; si no, qué decirle al piloto (migración 055)."""
    if activos >= TOPE_ACTIVOS:
        return f"Ya estás compartiendo {TOPE_ACTIVOS} vuelos a la vez, que es el máximo. Dejá de compartir alguno para sumar otro."
    return None


def ruta_sin_plan(origen: "PuntoRuta", destino: "PuntoRuta") -> str:
    """"SADM SAZS": los códigos de los dos puntos (o el nombre si no hay código)."""
    return " ".join(x for x in ((origen.codigo or origen.nombre), (destino.codigo or destino.nombre)) if x)[:600]


def puntos_sin_plan(origen: "PuntoRuta", destino: "PuntoRuta") -> List[List[Any]]:
    return [[p.lat, p.lon, p.codigo, p.nombre] for p in (origen, destino)]


def resumen_de_activo(fila: Dict[str, Any], ahora: datetime) -> Dict[str, Any]:
    """
    Un seguimiento activo para **la pantalla del propio piloto** (`GET /seguimientos/activos`): su
    link, de dónde viene, cuándo sale y quién lo mira. Nunca sale de acá a un link público.
    """
    return {
        "id": fila.get("id"),
        "token": fila.get("token"),
        "ruta": fila.get("ruta") or "",
        "puntos": _puntos_publicos(fila.get("puntos")),
        "salida_prevista": fila.get("salida_prevista"),
        "duracion_prevista_min": fila.get("duracion_prevista_min"),
        "vence_at": fila.get("vence_at"),
        "plan_id": fila.get("plan_id"),
        "ruta_orientativa": bool(fila.get("ruta_orientativa")),
        "mostrar_matricula": bool(fila.get("mostrar_matricula")),
        "avion_tipo": fila.get("avion_tipo"),
        "aterrizo_at": fila.get("aterrizo_at"),
        "aterrizo_en": _lugar_publico(fila.get("aterrizo_en")),
        "created_at": fila.get("created_at"),
        **resumen_de_vistas(fila, ahora),
    }


def con_destino_nuevo(fila: Dict[str, Any], punto: "PuntoRuta") -> Dict[str, Any]:
    """
    `{"ruta", "puntos"}` con el último punto de la ruta reemplazado por `punto`. Sin puntos, la ruta pasa a
    ser sólo ese; con uno solo (el origen), se suma como destino. La ruta orientativa se rearma entre el
    origen y el destino nuevo (`ruta_sin_plan`); la de verdad cambia su última palabra. **No toca**
    `ruta_orientativa`: una ruta que era orientativa sigue siéndolo, y una cargada no pasa a serlo.
    """
    previos = [
        list(p)
        for p in (fila.get("puntos") if isinstance(fila.get("puntos"), list) else [])
        if isinstance(p, (list, tuple)) and len(p) >= 2 and _es_numero(p[0]) and _es_numero(p[1])
    ]
    nuevo = [punto.lat, punto.lon, punto.codigo, punto.nombre]
    etiqueta = punto.codigo or punto.nombre
    if len(previos) >= 2:
        puntos = previos[:-1] + [nuevo]
    else:
        puntos = previos + [nuevo]
    if fila.get("ruta_orientativa") and len(puntos) >= 2:
        o = puntos[0]
        origen = PuntoRuta(
            lat=o[0],
            lon=o[1],
            codigo=str(o[2])[:20] if len(o) > 2 and o[2] else "",
            nombre=str(o[3])[:60] if len(o) > 3 and o[3] else "",
        )
        ruta = ruta_sin_plan(origen, punto)
    else:
        palabras = (fila.get("ruta") or "").split()
        if palabras and len(previos) >= 2:
            palabras[-1] = etiqueta
        elif etiqueta:
            palabras.append(etiqueta)
        ruta = " ".join(palabras)[:600]
    return {"ruta": ruta, "puntos": puntos[:TOPE_PUNTOS_RUTA]}


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


def _destino(fila: Dict[str, Any]) -> Optional[Muestra]:
    """
    El último punto de la ruta (`[lat, lon, codigo, nombre]`) como muestra (con `codigo` y `nombre` si
    los tiene), o `None` si no hay.
    """
    puntos = fila.get("puntos")
    if not isinstance(puntos, list) or not puntos:
        return None
    p = puntos[-1]
    if not (isinstance(p, (list, tuple)) and len(p) >= 2 and _es_numero(p[0]) and _es_numero(p[1])):
        return None
    return {
        "lat": float(p[0]),
        "lon": float(p[1]),
        "codigo": str(p[2])[:20] if len(p) > 2 and p[2] else "",
        "nombre": str(p[3])[:60] if len(p) > 3 and p[3] else "",
    }


def _lugar_cerca(m: Muestra, destino: Optional[Muestra]) -> Optional[Dict[str, str]]:
    """
    Dónde está la muestra, si está a `RADIO_DESTINO_NM` o menos de un aeródromo: **el destino cargado
    primero** (aunque no esté en la lista: un LAD, un campo) y si no el aeródromo argentino más
    cercano. `{"codigo", "nombre"}` o `None`.
    """
    if destino is not None and _millas(m, destino) <= RADIO_DESTINO_NM:
        # Un destino sin nombre ni código (sólo coordenadas) también cuenta: "llegó", sin decir dónde.
        return {"codigo": destino.get("codigo") or "", "nombre": destino.get("nombre") or ""}
    a = mas_cercano(m["lat"], m["lon"], RADIO_DESTINO_NM)
    return {"codigo": a["codigo"], "nombre": a["nombre"]} if a else None


def _con_nombre(lugar: Optional[Dict[str, str]]) -> Optional[Dict[str, str]]:
    """El lugar sólo si dice algo (código o nombre)."""
    return lugar if lugar and (lugar.get("codigo") or lugar.get("nombre")) else None


def _lugar_de_llegada(m: Muestra, destino: Optional[Muestra]) -> Optional[Dict[str, str]]:
    """
    ¿La muestra es de un avión terminando la final **de algún aeródromo**? Altitud conocida de
    `ALT_LLEGADA_FT` o menos, GS conocida de `GS_LLEGADA_KT` o menos y a `RADIO_DESTINO_NM` o menos del
    destino o de cualquier aeródromo argentino (`_lugar_cerca`). Sin altitud o sin velocidad no se
    afirma. Devuelve dónde, o `None`.
    """
    if m.get("alt") is None or m.get("gs") is None:
        return None
    if m["alt"] > ALT_LLEGADA_FT or m["gs"] > GS_LLEGADA_KT:
        return None
    return _lugar_cerca(m, destino)


def _llegando(m: Muestra, destino: Optional[Muestra]) -> bool:
    return _lugar_de_llegada(m, destino) is not None


def detectar_aterrizaje(muestras: List[Muestra], ahora: datetime, destino: Optional[Muestra] = None) -> Optional[Dict[str, Any]]:
    """
    Cuándo y dónde tocó tierra: `{"at": datetime, "en": {"codigo", "nombre"} | None}`, o `None` si no
    aterrizó (o no hay pruebas todavía). Dos caminos, siempre con un vuelo de por medio (`hubo_vuelo`):

    - Una muestra en tierra después de la última en el aire, de hace `SEGUNDOS_PARA_ATERRIZAR` o más.
      Dónde: el destino o el aeródromo más cercano a 3 NM de esa muestra; si no hay, `en` es `None`.
    - La cobertura de ADS-B casi nunca ve al avión en tierra (se corta en la final, a 0-300 ft y
      60-70 kt), así que también vale que la última muestra sea baja, lenta y a `RADIO_DESTINO_NM`
      o menos **de cualquier aeródromo** (`_lugar_de_llegada`) y lleve `SILENCIO_ATERRIZAJE_S` o más sin
      muestras nuevas: aterrizó a la hora de esa última muestra. Despegar de un aeródromo y perder la señal
      subiendo, cerca de ese mismo aeródromo, no es aterrizar (`VUELO_MINIMO_PARA_VOLVER_S`).

    Un avión que desaparece lejos de todo aeródromo, alto o sin altitud no se da por aterrizado: es
    "sin datos", no "aterrizó".
    """
    if not hubo_vuelo(muestras):
        return None
    aire = [i for i, m in enumerate(muestras) if _en_aire(m)]
    ultimo_aire = aire[-1]
    toque = next((m for m in muestras[ultimo_aire + 1 :] if _en_tierra(m)), None)
    if toque is not None and ahora.timestamp() - toque["t"] >= SEGUNDOS_PARA_ATERRIZAR:
        return {"at": datetime.fromtimestamp(toque["t"], tz=timezone.utc), "en": _con_nombre(_lugar_cerca(toque, destino))}
    ultima = muestras[-1]
    lugar = _lugar_de_llegada(ultima, destino)
    if lugar is not None and ahora.timestamp() - ultima["t"] >= SILENCIO_ATERRIZAJE_S:
        primera = muestras[aire[0]]
        salio_de = _lugar_cerca(primera, destino)
        misma = salio_de is not None and (salio_de["codigo"], salio_de["nombre"]) == (lugar["codigo"], lugar["nombre"])
        propio_destino = destino is not None and _millas(ultima, destino) <= RADIO_DESTINO_NM
        if misma and not propio_destino and ultima["t"] - primera["t"] < VUELO_MINIMO_PARA_VOLVER_S:
            return None
        return {"at": datetime.fromtimestamp(ultima["t"], tz=timezone.utc), "en": _con_nombre(lugar)}
    return None


def aterrizaje(muestras: List[Muestra], ahora: datetime, destino: Optional[Muestra] = None) -> Optional[datetime]:
    """Cuándo tocó tierra (ver `detectar_aterrizaje`), o `None`."""
    r = detectar_aterrizaje(muestras, ahora, destino)
    return r["at"] if r else None


def _gs_antes_del_corte(muestras: List[Muestra]) -> float:
    """La GS típica (mediana) en el aire antes de un corte, o 90 kt si no hay dato."""
    v = sorted(m["gs"] for m in muestras[-30:] if _en_aire(m) and isinstance(m.get("gs"), (int, float)) and m["gs"] > 30)
    return v[len(v) // 2] if v else 90.0


def se_detuvo_en_el_corte(antes: Muestra, despues: Muestra, gs_crucero: float) -> bool:
    """
    ¿El avión paró durante el corte? La distancia entre la última muestra antes y la primera después,
    dividida por el tiempo sin señal, da la velocidad "promedio" del corte: si es menos de la mitad del
    crucero, estuvo en tierra un rato (el 2026-11-16: 81 NM en 229 min, 21 kt contra 95). Un corte en
    crucero por una zona sin antenas recorre casi lo mismo que volando, y **no** cierra el tramo.
    """
    horas = (despues["t"] - antes["t"]) / 3600
    if horas <= 0:
        return False
    return _millas(antes, despues) / horas < 0.5 * gs_crucero


def indice_de_reaparicion(muestras: List[Muestra]) -> Optional[int]:
    """
    El índice de la primera muestra **en el aire** que aparece después de `CORTE_REAPARECE_S` sin ninguna
    señal, cuando antes de ese corte hubo un vuelo (`hubo_vuelo`) **y en el corte el avión se detuvo**
    (`se_detuvo_en_el_corte`). Es el avión que "vuelve a verse" en otro vuelo: lo anterior terminó en
    algún lado que ADS-B no vio. `None` si no pasó.
    """
    for i in range(1, len(muestras)):
        if (
            muestras[i]["t"] - muestras[i - 1]["t"] > CORTE_REAPARECE_S
            and _en_aire(muestras[i])
            and hubo_vuelo(muestras[:i])
            and se_detuvo_en_el_corte(muestras[i - 1], muestras[i], _gs_antes_del_corte(muestras[:i]))
        ):
            return i
    return None


def cierre_del_vuelo(muestras: List[Muestra], ahora: datetime, destino: Optional[Muestra] = None) -> Optional[Dict[str, Any]]:
    """
    Cómo y cuándo terminó el vuelo de estas muestras, o `None` si sigue (o no se sabe):
    `{"at", "en", "sin_ver"}`. Si el avión reaparece en el aire tras un corte largo, sólo se mira el
    tramo de antes (`indice_de_reaparicion`): si aterrizó en un aeródromo se dice cuál; si no, cierra
    "sin ver dónde" a la hora de su última muestra (`sin_ver`: estaba fuera de la cobertura).
    """
    i = indice_de_reaparicion(muestras)
    tramo = muestras if i is None else muestras[:i]
    r = detectar_aterrizaje(tramo, ahora, destino)
    if r is not None:
        return {"at": r["at"], "en": r["en"], "sin_ver": False}
    if i is not None:
        return {"at": datetime.fromtimestamp(tramo[-1]["t"], tz=timezone.utc), "en": None, "sin_ver": True}
    return None


def ventana_adsb(fila: Dict[str, Any], ahora: datetime) -> Optional[Tuple[datetime, datetime]]:
    """
    El rango de horas de `adsb_posiciones` que se lee para este seguimiento, o `None` si no tiene
    matrícula para buscar. **Desde** un rato antes de la salida prevista (un seguimiento desde un
    plan) o desde que se creó (el del Mapa); si es un **tramo encadenado** (`desde_tramo_at`, migración
    057: el mismo piloto voló antes ese avión), desde que terminó el tramo anterior. **Hasta** ahora, o
    el fin si ya terminó (nunca después de su vencimiento: un seguimiento cerrado tarde no se lleva los
    vuelos de después).
    """
    if not matricula_para_adsb(fila.get("matricula_adsb")):
        return None
    salida = _fecha(fila.get("salida_prevista"))
    encadenado = _fecha(fila.get("desde_tramo_at"))
    if salida and encadenado:
        # Desde que terminó el tramo anterior, pero no más de `ADELANTO_ENCADENADO` antes de la salida
        # prevista: entre un tramo y otro el avión de escuela puede volar con otro alumno.
        desde: Optional[datetime] = max(encadenado, salida - ADELANTO_ENCADENADO)
    else:
        desde = salida - ADELANTO_ADSB if salida else _fecha(fila.get("created_at"))
    if desde is None:
        return None
    fin = _fecha(fila.get("terminado_at"))
    vence = _fecha(fila.get("vence_at"))
    if fin is not None:
        if fila.get("aterrizo_at"):
            hasta = fin + COLA_TRAS_ATERRIZAR
        else:
            hasta = min(fin, vence) if vence else fin
    elif estado_de(fila, ahora) == "vencido":
        hasta = vence or ahora
    else:
        hasta = ahora
    return desde, min(hasta, ahora)


def _de_aproximacion(adsb: List[Muestra], i: int) -> bool:
    """
    ¿La muestra `i` es baja y lenta (`ALT_APROXIMACION_FT`, `GS_APROXIMACION_KT`)? Sin altitud se
    cuenta como baja; si no trae GS se usa la de la muestra anterior más cercana que la tenga, y
    sin ninguna no se afirma.
    """
    m = adsb[i]
    if m.get("alt") is not None and m["alt"] > ALT_APROXIMACION_FT:
        return False
    for j in range(i, -1, -1):
        gs = adsb[j].get("gs")
        if gs is not None:
            return gs <= GS_APROXIMACION_KT
    return False


def sin_el_vuelo_anterior(adsb: List[Muestra], desde: Any) -> List[Muestra]:
    """
    Un avión de escuela vuela con otros pilotos: si cuando se abre la ventana de un plan (`desde`)
    el avión ya está en el aire, ese vuelo es de otro (o es el tramo anterior) y no se muestra.
    Sólo cuenta como "ya estaba volando" si la primera muestra está en el aire **y** a
    `EN_CURSO_AL_ABRIR_S` o menos de `desde`: si el vuelo anterior aterrizó antes de abrirse la
    ventana, la primera muestra en el aire es el despegue del propio piloto y no se descarta nada.

    La cobertura casi nunca ve al avión en tierra (3 de 68 vuelos), así que el fin del vuelo
    anterior es lo primero que pase de: una muestra en tierra (se conserva desde ella) o un hueco de
    `HUECO_ENTRE_VUELOS_S` o más después de una muestra de aproximación (se conserva desde la
    muestra posterior al hueco). Un hueco después de un crucero (600-1400 ft, 90-100 kt) es
    cobertura en vuelo, no un fin. Sin fin de vuelo no se puede saber de quién es: no se muestra
    nada (es "sin datos", no un vuelo inventado).
    """
    if not adsb or not _en_aire(adsb[0]):
        return adsb
    desde_t = desde.timestamp() if isinstance(desde, datetime) else float(desde)
    if adsb[0]["t"] - desde_t > EN_CURSO_AL_ABRIR_S:
        return adsb
    for i, m in enumerate(adsb):
        if _en_tierra(m):
            return adsb[i:]
        if i + 1 < len(adsb) and adsb[i + 1]["t"] - m["t"] >= HUECO_ENTRE_VUELOS_S and _de_aproximacion(adsb, i):
            return adsb[i + 1 :]
    return []


def unir_filas_adsb(*listas: Any) -> List[Dict[str, Any]]:
    """Las filas de ADS-B de varias lecturas (las primeras y las últimas de la ventana) sin repetir, por hora."""
    vistas: Dict[str, Dict[str, Any]] = {}
    for lista in listas:
        for f in lista if isinstance(lista, list) else []:
            if isinstance(f, dict) and isinstance(f.get("visto_at"), str):
                vistas[f["visto_at"]] = f
    return [vistas[k] for k in sorted(vistas)]


# --- tramos encadenados del mismo piloto (migración 057) -------------------------------------------

def candidatos_a_tramo_anterior(fila: Dict[str, Any], candidatos: Any) -> List[Dict[str, Any]]:
    """
    Los seguimientos del **mismo avión** (`matricula_adsb`) que salieron hasta `CADENA_MAXIMA_ATRAS` antes
    que éste, del más nuevo al más viejo. El que llama los lee ya del mismo piloto; acá se descarta a
    uno mismo, otra matrícula, los que no tienen salida y los fuera de la ventana. Puro.
    """
    salida = _fecha(fila.get("salida_prevista"))
    matricula = matricula_para_adsb(fila.get("matricula_adsb"))
    if salida is None or not matricula or not isinstance(candidatos, list):
        return []
    elegidos: List[Tuple[datetime, Dict[str, Any]]] = []
    for c in candidatos:
        if not isinstance(c, dict) or (c.get("id") is not None and c.get("id") == fila.get("id")):
            continue
        if matricula_para_adsb(c.get("matricula_adsb")) != matricula:
            continue
        s_c = _fecha(c.get("salida_prevista"))
        if s_c is not None and salida - CADENA_MAXIMA_ATRAS <= s_c < salida:
            elegidos.append((s_c, c))
    elegidos.sort(key=lambda x: x[0], reverse=True)
    return [c for _, c in elegidos]


def fin_del_tramo(previo: Dict[str, Any], adsb_previo: Any, ahora: datetime) -> Optional[datetime]:
    """
    Cuándo terminó el tramo anterior, o `None` si sigue en marcha. En orden: el aterrizaje guardado; el
    cierre que se ve en sus muestras (aterrizó en un aeródromo, o el avión reapareció en el aire tras un
    corte: `cierre_del_vuelo`); si ya terminó o venció sin eso, **la última posición** que se le vio (no la
    hora en que alguien lo cerró, que puede ser mucho después); y sin ninguna, el menor de su fin y su
    vencimiento. Puro.
    """
    aterrizo = _fecha(previo.get("aterrizo_at"))
    if aterrizo is not None:
        return aterrizo
    ventana = ventana_adsb(previo, ahora)
    propias = muestras_de_adsb(adsb_previo) if ventana else []
    if ventana:
        propias = [m for m in propias if ventana[0].timestamp() <= m["t"] <= ventana[1].timestamp()]
    muestras = fusionar(muestras_del_telefono(previo), ralear_adsb(propias))
    cierre = cierre_del_vuelo(muestras, ahora, _destino(previo)) if muestras else None
    if cierre is not None:
        return cierre["at"]
    if estado_de(previo, ahora) == "en_vuelo":
        return None
    if muestras:
        return datetime.fromtimestamp(muestras[-1]["t"], tz=timezone.utc)
    fechas = [d for d in (_fecha(previo.get("terminado_at")), _fecha(previo.get("vence_at"))) if d is not None]
    return min(fechas) if fechas else None


def _muestras_del_seguimiento(fila: Dict[str, Any], adsb: Any, ahora: datetime) -> List[Muestra]:
    """Las dos fuentes juntas, sin nada posterior al fin de la ventana ni (en un plan) anterior a ella."""
    telefono = muestras_del_telefono(fila)
    ventana = ventana_adsb(fila, ahora)
    propias = muestras_de_adsb(adsb) if ventana else []
    if ventana:
        # En un tramo encadenado la muestra del fin del anterior es del anterior: `>` y no `>=`.
        encadenado = bool(_fecha(fila.get("desde_tramo_at")))
        propias = [m for m in propias if (ventana[0].timestamp() < m["t"] if encadenado else ventana[0].timestamp() <= m["t"]) and m["t"] <= ventana[1].timestamp()]
        # Un tramo encadenado (el mismo piloto voló antes ese avión) empieza donde terminó el anterior, y
        # lo que el avión ya traía en el aire es de este piloto: no se descarta. Sin tramo anterior, un
        # avión de escuela vuela con otros pilotos y lo que ya traía no es de quien comparte.
        if fila.get("salida_prevista") and not _fecha(fila.get("desde_tramo_at")):
            propias = sin_el_vuelo_anterior(propias, ventana[0])
    todas = fusionar(telefono, ralear_adsb(propias))
    # Terminado por aterrizaje: el link muestra hasta el rodaje, no lo que haga el avión después.
    if fila.get("aterrizo_at") and ventana:
        todas = [m for m in todas if m["t"] <= ventana[1].timestamp()]
    return todas


def _fase(fase: str, cierre: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """El resultado de `evaluar_vuelo`: la fase y, si se detectó un cierre, cuándo, dónde y si fue sin ver dónde."""
    return {
        "fase": fase,
        "aterrizo_at": cierre["at"] if cierre else None,
        "aterrizo_en": cierre["en"] if cierre else None,
        "aterrizo_sin_ver": bool(cierre and cierre["sin_ver"]),
    }


def evaluar_vuelo(fila: Dict[str, Any], adsb: Any, ahora: datetime, muestras: Optional[List[Muestra]] = None) -> Dict[str, Any]:
    """
    La fase del link y, si se detectó, cuándo y dónde aterrizó:
    `{"fase", "aterrizo_at": datetime | None, "aterrizo_en": {"codigo","nombre"} | None, "aterrizo_sin_ver": bool}`.

    - Un seguimiento desde un plan (`salida_prevista`) distingue **antes de salir** (todavía en
      tierra o sin que nadie lo vea), **volando**, **aterrizó** y **sin datos**. Nunca inventa un
      vuelo: sin muestras, antes de la salida es "antes de salir"; media hora después de la salida,
      sin haber visto al avión ni una vez, es "sin datos" (puede que no transmita ADS-B o que no
      haya receptores cerca).
    - Uno del Mapa no tiene salida: "esperando" sin posiciones, "volando" con una reciente, "sin
      datos" si pasaron más de `DATOS_VIEJOS_S`. El detalle (en tierra, nivelado…) lo calcula la web.
    - **Aterrizó en cualquier aeródromo**, no sólo en el destino cargado (el piloto cambia de destino en
      vuelo y no siempre lo actualiza): si la última muestra es de una final cerca de un aeródromo
      (`_lugar_de_llegada`), la fase es "volando" hasta que pasan `SILENCIO_ATERRIZAJE_S` y entonces
      "aterrizo", con el lugar: ADS-B casi nunca ve el toque.
    - **Si el avión reaparece en el aire** tras `CORTE_REAPARECE_S` sin señal (`cierre_del_vuelo`), el
      tramo de antes se cierra como aterrizado "sin ver dónde" (`aterrizo_sin_ver`).
    - `aterrizo_at` sólo se devuelve para un seguimiento desde un plan que sigue en vuelo; el
      controlador lo guarda y lo termina. Uno ya terminado por aterrizaje dice "aterrizo".
    """
    if fila.get("aterrizo_at"):
        return _fase("aterrizo")
    if estado_de(fila, ahora) != "en_vuelo":
        return _fase("terminado")
    if muestras is None:
        muestras = _muestras_del_seguimiento(fila, adsb, ahora)
    salida = _fecha(fila.get("salida_prevista"))
    if not muestras:
        if salida is None:
            return _fase("esperando")
        return _fase("antes_de_salir" if ahora < salida + ESPERA_SIN_VER_AL_AVION else "sin_datos")
    ultima = muestras[-1]
    edad = ahora.timestamp() - ultima["t"]
    if salida is None:
        return _fase("sin_datos" if edad > DATOS_VIEJOS_S else "volando")
    destino = _destino(fila)
    cierre = cierre_del_vuelo(muestras, ahora, destino)
    if cierre is not None:
        return _fase("aterrizo", cierre)
    if _en_aire(ultima) and edad <= DATOS_VIEJOS_S:
        return _fase("volando")
    if hubo_vuelo(muestras) and _llegando(ultima, destino):
        # Terminando la final: la señal se cortó bajo y cerca de un aeródromo, y todavía no pasaron los
        # `SILENCIO_ATERRIZAJE_S` que hacen falta para decir que aterrizó.
        return _fase("volando")
    if hubo_vuelo(muestras):
        # Hubo vuelo y la última ya no es en el aire: rodando tras tocar (espera de 3 min) o sin datos.
        return _fase("sin_datos" if edad > DATOS_VIEJOS_S else "volando")
    if edad > SIN_DATOS_EN_TIERRA_S and ahora >= salida + ESPERA_SIN_VER_AL_AVION:
        return _fase("sin_datos")
    return _fase("antes_de_salir")


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


def _lugar_publico(lugar: Any) -> Optional[Dict[str, str]]:
    """`{"codigo", "nombre"}` acotado, o `None` si la fila no trae un lugar con algo escrito."""
    if not isinstance(lugar, dict):
        return None
    codigo = " ".join(str(lugar.get("codigo") or "").split())[:20]
    nombre = " ".join(str(lugar.get("nombre") or "").split())[:60]
    return {"codigo": codigo, "nombre": nombre} if codigo or nombre else None


def _duracion_publica(v: Any) -> Optional[int]:
    """Minutos de duración prevista, o `None` si no es un entero razonable (hasta 24 h)."""
    try:
        n = int(v)
    except (TypeError, ValueError):
        return None
    return n if 0 < n <= 24 * 60 else None


def vista_publica(fila: Dict[str, Any], ahora: datetime, adsb: Any = None) -> Dict[str, Any]:
    """
    **Lo único que ve quien abre el link.** Campo por campo, no "la fila menos algunos": un
    campo que se agregue a la tabla no sale hasta que se lo nombre acá, y el test lo fija.

    `adsb` son las filas de `adsb_posiciones` que leyó el controlador (ver `ventana_adsb`); sin
    ellas el link es el del teléfono solo, como hasta la 044. **La matrícula de ADS-B
    (`matricula_adsb`) no sale**: sólo dice, en `con_adsb`, que el respaldo existe.
    """
    muestras = _muestras_del_seguimiento(fila, adsb, ahora)
    evaluacion = evaluar_vuelo(fila, adsb, ahora, muestras)
    # Un cierre recién detectado (todavía sin guardar) corta el recorrido donde terminó el tramo: lo que
    # el avión haga después (rodaje aparte, o el vuelo de otro piloto) no es de este link.
    if evaluacion["aterrizo_at"] is not None:
        limite = evaluacion["aterrizo_at"].timestamp() + COLA_TRAS_ATERRIZAR.total_seconds()
        muestras = [m for m in muestras if m["t"] <= limite]
    inicio = _fecha(fila.get("created_at"))
    salida = _fecha(fila.get("salida_prevista"))
    aterrizo = _fecha(fila.get("aterrizo_at")) or evaluacion["aterrizo_at"]
    if fila.get("aterrizo_at"):
        en, sin_ver = _lugar_publico(fila.get("aterrizo_en")), bool(fila.get("aterrizo_sin_ver"))
    else:
        en, sin_ver = _lugar_publico(evaluacion["aterrizo_en"]), evaluacion["aterrizo_sin_ver"]
    return {
        "nombre": fila.get("nombre") or "Un piloto",
        "ruta": fila.get("ruta") or "",
        "puntos": _puntos_publicos(fila.get("puntos")),
        # Migración 055: el piloto no cargó la ruta; la línea entre origen y destino es directa.
        "ruta_orientativa": bool(fila.get("ruta_orientativa")),
        "avion": _avion_publico(fila),
        "inicio": inicio.astimezone(timezone.utc).isoformat() if inicio else None,
        "estado": estado_de(fila, ahora),
        # Migración 045: en qué está el vuelo, la salida prevista de un plan y si hay respaldo ADS-B.
        "fase": evaluacion["fase"],
        "salida_prevista": salida.astimezone(timezone.utc).isoformat() if salida else None,
        # La duración prevista (plan o sin plan), para la llegada "prevista" antes de despegar; la web la corrige en el aire.
        "duracion_prevista_min": _duracion_publica(fila.get("duracion_prevista_min")),
        # Migración 057: cuándo y **dónde** aterrizó (cualquier aeródromo, no sólo el destino), o que no se
        # vio dónde (el avión volvió a aparecer en el aire más tarde: estaba fuera de la cobertura de ADS-B).
        "aterrizo_at": aterrizo.astimezone(timezone.utc).isoformat() if aterrizo else None,
        "aterrizo_en": en,
        "aterrizo_sin_ver": bool(sin_ver),
        "con_adsb": bool(matricula_para_adsb(fila.get("matricula_adsb"))),
        "ultima": _ultima_publica(muestras),
        "recorrido": _recorrido_publico(muestras),
        # La hora del servidor, para que "hace 40 s" no dependa del reloj de quien mira.
        "ahora": ahora.astimezone(timezone.utc).isoformat(),
    }
