"""
Avisos a quien mira el vuelo (migración 046): "Federico despegó de SADM", "Federico aterrizó en SRDL".

Quien abre `/seguir/<token>` (sin cuenta) puede pedir un push web en su navegador. Esto es lo
que hay detrás, y está partido a propósito:

- **Lo puro** (testeado en `test_avisos_seguimiento.py`): qué endpoints de push se aceptan
  (`endpoint_de_push_valido`), el texto de cada aviso (`armar_aviso_seguimiento`) y qué pasó
  desde la última vez que se miró este vuelo (`decidir`).
- **La plomería**: `barrer` (lo corre el grabador ADS-B cada ~30 s), `avisar_fin_manual` (lo llama
  el controlador cuando el piloto termina el vuelo a mano) y las lecturas de la base.

**Dónde corre la detección: en `grabador_adsb.py`**, no al leer el link. La familia puede no tener
la página abierta —de eso se trata un aviso—, así que no puede depender de que alguien consulte. El
grabador ya corre cada 10 s, ya habla con la base y ya lee ADS-B.

**Cada aviso sale una sola vez**, aunque el barrido corra seguido o dos procesos coincidan: antes de
mandar se "reserva" la columna (`aviso_despegue_at`, `aviso_aterrizaje_at`) con un update
condicional, y sólo manda quien la ganó. Es "como mucho una vez": si el proceso cae justo después de
reservar, ese aviso no sale; es preferible a mandarlo dos veces.

Un aviso viejo no se manda: si el despegue se detecta recién 20 minutos después (el link se abrió con
el avión ya en el aire, o el barrido estuvo parado), se anota sin avisar. Quien mira no necesita
enterarse tarde de algo que ya pasó.

**Nada de la bitácora ni la matrícula**: el nombre de pila (el mismo de lo público), el aeródromo de
la ruta y, sólo si el piloto prendió "Mostrar la matrícula", la matrícula en el cuerpo. Una
suscripción es una credencial para mandarle notificaciones a un navegador: se guarda sólo con
service role y no sale por ninguna API.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlsplit

from pydantic import BaseModel, field_validator

from src.services.avisos import avisos_configurados, mandar_a
from src.services.seguimientos import (
    ADSB_PRIMERAS,
    ADSB_ULTIMAS,
    _en_aire,
    _fecha,
    _muestras_del_seguimiento,
    estado_de,
    evaluar_vuelo,
    hubo_vuelo,
    matricula_para_adsb,
    unir_filas_adsb,
    ventana_adsb,
)

log = logging.getLogger(__name__)

#: Cuántos navegadores pueden pedir avisos de un mismo vuelo. Una familia, no un grupo de WhatsApp
#: de media ciudad: acota lo que cualquiera con el link puede escribir en la base.
TOPE_SUSCRIPCIONES = 30
#: Un aviso de algo que pasó hace más que esto no se manda (se anota, sin avisar).
AVISO_VIGENTE = timedelta(minutes=20)
#: Cada cuánto el grabador mira los vuelos con avisos pedidos.
BARRIDO_CADA_S = 30

#: Los servicios de push de los navegadores. El `endpoint` lo escribe quien llama a un endpoint
#: público, y el backend le hace un POST: sin esta lista serviría para pegarle a cualquier URL.
#: Se compara el host entero (o su sufijo, con el punto) y se exige https y el puerto 443.
HOSTS_DE_PUSH_EXACTOS = frozenset(
    {
        "fcm.googleapis.com",  # Chrome, Edge, Brave, Opera, Samsung Internet
        "updates.push.services.mozilla.com",  # Firefox
        "web.push.apple.com",  # Safari / Vector instalada en iOS
    }
)
HOSTS_DE_PUSH_SUFIJOS = (
    ".push.apple.com",
    ".notify.windows.com",  # WNS (Edge viejo)
    ".push.services.mozilla.com",
)


def endpoint_de_push_valido(endpoint: Any) -> bool:
    """¿Es la URL de un servicio de push conocido? https, sin usuario, puerto 443, host de la lista."""
    if not isinstance(endpoint, str) or len(endpoint) > 1000 or endpoint != endpoint.strip():
        return False
    try:
        partes = urlsplit(endpoint)
        puerto = partes.port
    except ValueError:
        return False
    host = (partes.hostname or "").lower()
    if partes.scheme != "https" or partes.username or partes.password or puerto not in (None, 443):
        return False
    if not host or not partes.path.strip("/"):
        return False
    return host in HOSTS_DE_PUSH_EXACTOS or any(host.endswith(s) for s in HOSTS_DE_PUSH_SUFIJOS)


class ClavesAviso(BaseModel):
    p256dh: str
    auth: str

    @field_validator("p256dh", "auth")
    @classmethod
    def _clave(cls, valor: str) -> str:
        limpio = (valor or "").strip()
        # base64url: lo que devuelve `PushSubscription.toJSON()`.
        if not (1 <= len(limpio) <= 200) or not all(c.isalnum() or c in "-_=" for c in limpio):
            raise ValueError("Suscripción inválida.")
        return limpio


class SuscripcionAvisoIn(BaseModel):
    """Lo que devuelve `PushManager.subscribe()` en el navegador, tal cual."""

    endpoint: str
    keys: ClavesAviso

    @field_validator("endpoint")
    @classmethod
    def _endpoint(cls, valor: str) -> str:
        if not endpoint_de_push_valido(valor):
            raise ValueError("Suscripción inválida.")
        return valor


class BajaAvisoIn(BaseModel):
    endpoint: str

    @field_validator("endpoint")
    @classmethod
    def _endpoint(cls, valor: str) -> str:
        if not endpoint_de_push_valido(valor):
            raise ValueError("Suscripción inválida.")
        return valor


# --- el texto ------------------------------------------------------------------------------

def _codigo_de(punto: Any) -> str:
    """El código (o el nombre) de un punto `[lat, lon, codigo, nombre]`, o `""`."""
    if not isinstance(punto, (list, tuple)):
        return ""
    for i in (2, 3):
        if len(punto) > i and isinstance(punto[i], str) and punto[i].strip():
            return " ".join(punto[i].split())[:40]
    return ""


def armar_aviso_seguimiento(evento: str, fila: Dict[str, Any]) -> Dict[str, str]:
    """
    El aviso para mostrar (`titulo`, `cuerpo`, `url`, `etiqueta`). `evento` es `despegue`,
    `aterrizaje` o `fin` (el piloto terminó el vuelo a mano). Sale de la fila del seguimiento y
    **nunca lleva la matrícula** salvo que el piloto haya prendido `mostrar_matricula`.
    """
    nombre = " ".join(str(fila.get("nombre") or "").split())[:40] or "Un piloto"
    puntos = fila.get("puntos") if isinstance(fila.get("puntos"), list) else []
    origen = _codigo_de(puntos[0]) if puntos else ""
    destino = _codigo_de(puntos[-1]) if len(puntos) > 1 else ""
    if evento == "despegue":
        titulo = f"{nombre} despegó de {origen}" if origen else f"{nombre} despegó"
        cuerpo = "Seguí el vuelo en vivo."
    elif evento == "aterrizaje":
        titulo = f"{nombre} aterrizó en {destino}" if destino else f"{nombre} aterrizó"
        cuerpo = "El seguimiento terminó."
    elif evento == "fin":
        titulo = f"{nombre} terminó el vuelo"
        cuerpo = "El seguimiento terminó."
    else:
        raise ValueError(f"Evento de aviso desconocido: {evento}")
    matricula = " ".join(str(fila.get("avion_matricula") or "").split())[:12]
    if fila.get("mostrar_matricula") and matricula:
        cuerpo = f"{matricula} · {cuerpo}"
    token = str(fila.get("token") or "")
    return {
        "titulo": titulo,
        "cuerpo": cuerpo,
        "url": f"/seguir/{token}",
        # Una etiqueta por evento: el de aterrizaje no tapa al de despegue que quizás no se vio.
        "etiqueta": f"vector-vuelo-{token[:12]}-{'despegue' if evento == 'despegue' else 'fin'}",
    }


# --- qué pasó ------------------------------------------------------------------------------

def decidir(fila: Dict[str, Any], adsb: Any, ahora: datetime) -> Dict[str, Any]:
    """
    Qué hay que hacer con un vuelo que tiene avisos pedidos. Puro: no toca la base.

    Devuelve:
    - `despego_at`: el despegue que se vio recién (la hora de la primera muestra en el aire) o `None`;
    - `reservar_despegue` / `enviar_despegue`: hay que reservar `aviso_despegue_at`; y mandarlo
      (si es reciente) o sólo anotarlo;
    - `aterrizo_at`: el aterrizaje que se detectó recién (hay que guardarlo y terminar el vuelo);
    - `reservar_aterrizaje` / `enviar_aterrizaje`: lo mismo con `aviso_aterrizaje_at`.

    Cubre los tres casos: el vuelo sigue en curso (se evalúa con ADS-B y GPS); terminó por
    aterrizaje y nadie avisó todavía (lo terminó la lectura pública del link, que no manda
    avisos); y terminó a mano o venció (no se avisa: de lo manual se encarga el controlador).
    """
    nada: Dict[str, Any] = {
        "despego_at": None,
        "reservar_despegue": False,
        "enviar_despegue": False,
        "aterrizo_at": None,
        "reservar_aterrizaje": False,
        "enviar_aterrizaje": False,
    }
    if fila.get("aviso_aterrizaje_at"):
        return nada
    estado = estado_de(fila, ahora)
    aterrizo = _fecha(fila.get("aterrizo_at"))
    if estado == "vencido" or (estado == "terminado" and aterrizo is None):
        return nada

    salida = dict(nada)
    despego = _fecha(fila.get("despego_at"))
    muestras = _muestras_del_seguimiento(fila, adsb, ahora)
    if despego is None and hubo_vuelo(muestras):
        primera = next(m for m in muestras if _en_aire(m))
        despego = datetime.fromtimestamp(primera["t"], tz=timezone.utc)
        salida["despego_at"] = despego
    if estado == "en_vuelo" and aterrizo is None:
        aterrizo = evaluar_vuelo(fila, adsb, ahora, muestras)["aterrizo_at"]
        salida["aterrizo_at"] = aterrizo

    if despego is not None and not fila.get("aviso_despegue_at"):
        salida["reservar_despegue"] = True
        salida["enviar_despegue"] = ahora - despego <= AVISO_VIGENTE
    if aterrizo is not None:
        salida["reservar_aterrizaje"] = True
        salida["enviar_aterrizaje"] = ahora - aterrizo <= AVISO_VIGENTE
    return salida


# --- la base --------------------------------------------------------------------------------

def leer_adsb(cliente: Any, fila: Dict[str, Any], ahora: datetime) -> List[Dict[str, Any]]:
    """
    Las posiciones ADS-B del avión en la ventana del seguimiento (`ventana_adsb`): las primeras y las
    últimas, para que un vuelo largo no pierda ni el principio ni lo más nuevo (PostgREST corta en
    1.000 filas). Es un respaldo: si la lectura falla, se sigue con lo del teléfono. La usan la
    lectura pública del link y el barrido de avisos.
    """
    ventana = ventana_adsb(fila, ahora)
    if ventana is None:
        return []
    matricula = matricula_para_adsb(fila.get("matricula_adsb"))
    columnas = "visto_at,lat,lon,altitud,velocidad,en_tierra"

    def _base():
        return (
            cliente.table("adsb_posiciones")
            .select(columnas)
            .eq("matricula", matricula)
            .gte("visto_at", ventana[0].isoformat())
            .lte("visto_at", ventana[1].isoformat())
        )

    try:
        primeras = _base().order("visto_at").limit(ADSB_PRIMERAS).execute().data or []
        ultimas = _base().order("visto_at", desc=True).limit(ADSB_ULTIMAS).execute().data or []
    except Exception:  # noqa: BLE001
        return []
    return unir_filas_adsb(primeras, ultimas)


_COLUMNAS = (
    "id,token,nombre,puntos,created_at,vence_at,terminado_at,ultima_lat,ultima_lon,ultima_alt_ft,ultima_gs_kt,ultima_track,ultima_at,recorrido,"
    "matricula_adsb,salida_prevista,aterrizo_at,despego_at,aviso_despegue_at,aviso_aterrizaje_at,"
    "mostrar_matricula,avion_matricula"
)


def _enviar(cliente: Any, seguimiento_id: str, aviso: Dict[str, str]) -> int:
    subs = (
        cliente.table("seguimientos_avisos").select("id,endpoint,p256dh,auth").eq("seguimiento_id", seguimiento_id).execute().data
        or []
    )
    return mandar_a(subs, aviso, lambda i: cliente.table("seguimientos_avisos").delete().eq("id", i).execute())


def _reservar(cliente: Any, seguimiento_id: str, cambios: Dict[str, Any], columna: str) -> bool:
    """Reserva un aviso: sólo el que escribe `columna` estando vacía lo manda."""
    r = cliente.table("seguimientos_en_vivo").update(cambios).eq("id", seguimiento_id).is_(columna, "null").execute()
    return bool(r.data)


def atender(cliente: Any, fila: Dict[str, Any], ahora: datetime) -> List[str]:
    """Mira un vuelo con avisos pedidos, guarda lo que pasó y manda lo que corresponda. Devuelve los eventos enviados."""
    adsb = leer_adsb(cliente, fila, ahora)
    d = decidir(fila, adsb, ahora)
    enviados: List[str] = []
    sid = fila["id"]
    ahora_iso = ahora.isoformat()
    if d["reservar_despegue"]:
        cambios = {"aviso_despegue_at": ahora_iso}
        if d["despego_at"] is not None:
            cambios["despego_at"] = d["despego_at"].isoformat()
        if _reservar(cliente, sid, cambios, "aviso_despegue_at") and d["enviar_despegue"]:
            _enviar(cliente, sid, armar_aviso_seguimiento("despegue", fila))
            enviados.append("despegue")
    elif d["despego_at"] is not None:
        cliente.table("seguimientos_en_vivo").update({"despego_at": d["despego_at"].isoformat()}).eq("id", sid).execute()
    if d["aterrizo_at"] is not None:
        marca = d["aterrizo_at"].isoformat()
        # Si la lectura pública del link ya lo terminó, no se pisa: el aviso sale igual abajo.
        cliente.table("seguimientos_en_vivo").update({"terminado_at": marca, "aterrizo_at": marca}).eq("id", sid).is_(
            "terminado_at", "null"
        ).execute()
    if d["reservar_aterrizaje"] and _reservar(cliente, sid, {"aviso_aterrizaje_at": ahora_iso}, "aviso_aterrizaje_at") and d["enviar_aterrizaje"]:
        _enviar(cliente, sid, armar_aviso_seguimiento("aterrizaje", fila))
        enviados.append("aterrizaje")
    return enviados


def barrer(cliente: Any, ahora: Optional[datetime] = None) -> int:
    """
    Una vuelta de avisos: los vuelos que tienen suscripciones y todavía no avisaron el aterrizaje.
    Una falla en un vuelo no frena a los demás. Devuelve cuántos avisos salieron.
    """
    if not avisos_configurados():
        return 0
    ahora = ahora or datetime.now(timezone.utc)
    ids = sorted({s["seguimiento_id"] for s in (cliente.table("seguimientos_avisos").select("seguimiento_id").execute().data or [])})
    if not ids:
        return 0
    filas = cliente.table("seguimientos_en_vivo").select(_COLUMNAS).in_("id", ids).is_("aviso_aterrizaje_at", "null").execute().data or []
    total = 0
    for fila in filas:
        try:
            total += len(atender(cliente, fila, ahora))
        except Exception as exc:  # noqa: BLE001 — un vuelo con problemas no frena a los otros
            log.warning("[avisos-vuelo] falló %s: %r", str(fila.get("id"))[:8], exc)
    return total


def avisar_fin_manual(cliente: Any, fila: Dict[str, Any]) -> None:
    """
    El piloto terminó el vuelo desde el Mapa: "Federico terminó el vuelo". `fila` es el seguimiento
    ya terminado. Reserva `aviso_aterrizaje_at` para que el barrido no mande además un aterrizaje.
    """
    if fila.get("aviso_aterrizaje_at") or fila.get("aterrizo_at"):
        return
    ahora = datetime.now(timezone.utc)
    if _reservar(cliente, fila["id"], {"aviso_aterrizaje_at": ahora.isoformat()}, "aviso_aterrizaje_at"):
        _enviar(cliente, fila["id"], armar_aviso_seguimiento("fin", fila))
