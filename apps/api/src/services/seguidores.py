"""
Seguidores y Vector Tracker (migración 056): quien sigue los vuelos que un piloto le asigna.

El piloto genera un **link de invitación** (`/invitacion/<token>` en tracker.vectoraero.ar) y lo
manda él por donde quiera. Quien lo abre entra con Google (o, con sesión, lo acepta) y queda como
seguidor de ese piloto. Después el piloto **asigna a mano** cada vuelo que comparte a los seguidores
que quiere: sin asignación, el seguidor no ve nada.

Está partido a propósito, como `avisos_seguimiento`:

- **Lo puro** (testeado en `test_seguidores.py`): el token y su vigencia, el apodo, el tope, el orden
  de la lista (`ordenar_vuelos`) y el texto de los avisos (`armar_aviso_tracker`, `armar_aviso_compartido`).
- **La plomería**: las lecturas y escrituras con el service role y el envío de los push.

**Seguridad:** el token es de un solo uso (al aceptarlo se borra de la fila, con un update
condicional: si dos lo aceptan a la vez, gana uno) y vence a los 7 días. Los vuelos se leen con el
service role **después** de filtrar por las asignaciones de las filas de `seguidores` del usuario,
en cada pedido: quitar a alguien (o desasignarle un vuelo) corta el acceso al instante. De un vuelo
sale lo mismo que ve el link público (`vista_publica`) más el nombre de pila del piloto y su @; nada
de la bitácora (invariante 14).
"""

from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, field_validator

from src.services.avisos import mandar_a
from src.services.seguimientos import _fecha

log = logging.getLogger(__name__)

#: Cuántas personas puede invitar un piloto (las pendientes cuentan).
TOPE_SEGUIDORES = 20
#: Cuánto dura un link de invitación sin usar.
VIGENCIA_INVITACION = timedelta(days=7)
#: Una cuenta creada hace menos que esto, al aceptar una invitación, nació entrando al tracker.
CUENTA_NUEVA = timedelta(minutes=15)
#: El tracker vive en su propio origen: la suscripción push es de ese origen, así que el aviso
#: lleva una ruta relativa (`destinoDelAviso` del service worker no acepta otra cosa).
RUTA_VUELO_TRACKER = "/vuelo/"


def nuevo_token_invitacion() -> str:
    """43 caracteres de 256 bits al azar (`secrets`): imposible de adivinar."""
    return secrets.token_urlsafe(32)


def token_con_forma(token: Any) -> bool:
    return isinstance(token, str) and 32 <= len(token) <= 64 and all(c.isalnum() or c in "-_" for c in token)


def vence_la_invitacion(ahora: datetime) -> datetime:
    return ahora + VIGENCIA_INVITACION


def invitacion_vigente(fila: Optional[Dict[str, Any]], ahora: datetime) -> bool:
    """¿Se puede aceptar? Sin seguidor todavía, con token y sin vencer."""
    if not fila or fila.get("seguidor_id") or not fila.get("invitacion_token"):
        return False
    vence = _fecha(fila.get("invitacion_vence_at"))
    return vence is not None and ahora < vence


def normalizar_apodo(texto: Any) -> Optional[str]:
    """El apodo con los espacios juntos y a lo sumo 40 letras; vacío es `None`."""
    if not isinstance(texto, str):
        return None
    limpio = " ".join(texto.split())[:40].strip()
    return limpio or None


class InvitacionIn(BaseModel):
    apodo: Optional[str] = None

    @field_validator("apodo")
    @classmethod
    def _apodo(cls, valor: Optional[str]) -> Optional[str]:
        return normalizar_apodo(valor)


class ApodoIn(InvitacionIn):
    pass


class AsignacionIn(BaseModel):
    """`PUT /seguimientos/{id}/seguidores`: la lista completa de quienes ven ese vuelo (reemplaza)."""

    seguidor_ids: List[str]

    @field_validator("seguidor_ids")
    @classmethod
    def _ids(cls, valor: List[str]) -> List[str]:
        if len(valor) > TOPE_SEGUIDORES:
            raise ValueError("Demasiados seguidores.")
        return sorted({str(v) for v in valor})


def mensaje_del_tope(cantidad: int) -> Optional[str]:
    if cantidad >= TOPE_SEGUIDORES:
        return f"Ya invitaste a {TOPE_SEGUIDORES} personas, que es el máximo. Quitá a alguien para sumar a otra."
    return None


def nacio_ahora(usuario: Any, ahora: datetime) -> bool:
    """¿La cuenta se creó hace pocos minutos? Entonces nació entrando al tracker."""
    creada = usuario.get("created_at") if isinstance(usuario, dict) else getattr(usuario, "created_at", None)
    fecha = _fecha(creada)
    return fecha is not None and timedelta(0) <= ahora - fecha <= CUENTA_NUEVA


# --- la lista -------------------------------------------------------------------------------

def ordenar_vuelos(vuelos: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    En el aire primero, después los que todavía no salieron por hora de salida, y al final los que
    terminaron hace poco. Estable: lo que empata queda como llegó (de lo más nuevo a lo más viejo).
    """
    def clave(v: Dict[str, Any]) -> Any:
        salida = str(v.get("salida_prevista") or v.get("inicio") or "")
        if v.get("estado") != "en_vuelo":
            return (2, "")
        return (0, "") if v.get("fase") == "volando" else (1, salida)

    return sorted(vuelos, key=clave)


# --- los avisos ------------------------------------------------------------------------------

def _hora_argentina(salida: Any) -> Optional[str]:
    """`16:30` en hora argentina (UTC−3, sin horario de verano), de una fecha ISO."""
    fecha = _fecha(salida)
    if fecha is None:
        return None
    return (fecha.astimezone(timezone.utc) - timedelta(hours=3)).strftime("%H:%M")


def _extremos(fila: Dict[str, Any]) -> tuple[str, str]:
    from src.services.avisos_seguimiento import _codigo_de

    puntos = fila.get("puntos") if isinstance(fila.get("puntos"), list) else []
    origen = _codigo_de(puntos[0]) if puntos else ""
    destino = _codigo_de(puntos[-1]) if len(puntos) > 1 else ""
    return origen, destino


def armar_aviso_tracker(evento: str, fila: Dict[str, Any]) -> Dict[str, str]:
    """
    El aviso de despegue, aterrizaje o fin para quien sigue en el tracker: el mismo texto que el del
    link (`armar_aviso_seguimiento`, que nunca lleva datos de la bitácora) con la ruta del tracker.
    """
    from src.services.avisos_seguimiento import armar_aviso_seguimiento

    aviso = armar_aviso_seguimiento(evento, fila)
    token = str(fila.get("token") or "")
    return {**aviso, "url": f"{RUTA_VUELO_TRACKER}{token}", "etiqueta": f"tracker-{aviso['etiqueta']}"}


def armar_aviso_compartido(fila: Dict[str, Any]) -> Dict[str, str]:
    """"Federico compartió un vuelo": "SADM → SAZS, sale a las 16:30" (hora argentina)."""
    nombre = " ".join(str(fila.get("nombre") or "").split())[:40] or "Un piloto"
    origen, destino = _extremos(fila)
    ruta = f"{origen} → {destino}" if origen and destino else (origen or destino)
    hora = _hora_argentina(fila.get("salida_prevista"))
    partes = [p for p in (ruta, f"sale a las {hora}" if hora else "") if p]
    token = str(fila.get("token") or "")
    return {
        "titulo": f"{nombre} compartió un vuelo",
        "cuerpo": ", ".join(partes) if partes else "Seguilo en vivo.",
        "url": f"{RUTA_VUELO_TRACKER}{token}",
        "etiqueta": f"tracker-compartido-{token[:12]}",
    }


# --- la base ---------------------------------------------------------------------------------

def _suscripciones_de(cliente: Any, user_ids: List[str]) -> List[Dict[str, Any]]:
    if not user_ids:
        return []
    return cliente.table("tracker_suscripciones").select("id,endpoint,p256dh,auth").in_("user_id", user_ids).execute().data or []


def _mandar(cliente: Any, user_ids: List[str], aviso: Dict[str, str]) -> int:
    subs = _suscripciones_de(cliente, user_ids)
    if not subs:
        return 0
    return mandar_a(subs, aviso, lambda i: cliente.table("tracker_suscripciones").delete().eq("id", i).execute())


def seguidores_asignados(cliente: Any, seguimiento_id: str) -> List[str]:
    """Los `user_id` de los seguidores **vinculados** a los que se asignó este vuelo."""
    asignadas = cliente.table("seguimiento_seguidores").select("seguidor_fila_id").eq("seguimiento_id", seguimiento_id).execute().data or []
    filas = sorted({a["seguidor_fila_id"] for a in asignadas})
    if not filas:
        return []
    seguidores = cliente.table("seguidores").select("seguidor_id").in_("id", filas).execute().data or []
    return sorted({s["seguidor_id"] for s in seguidores if s.get("seguidor_id")})


def enviar_a_asignados(cliente: Any, seguimiento_id: str, aviso: Dict[str, str]) -> int:
    """Manda `aviso` a los navegadores de quienes ven este vuelo. Devuelve cuántos salieron."""
    return _mandar(cliente, seguidores_asignados(cliente, seguimiento_id), aviso)


def avisar_compartido(cliente: Any, fila: Dict[str, Any], seguidor_user_ids: List[str]) -> int:
    """Se le asignó un vuelo a estas cuentas: "Federico compartió un vuelo". `fila` es el seguimiento."""
    return _mandar(cliente, sorted(set(seguidor_user_ids)), armar_aviso_compartido(fila))


def ids_de_seguimientos_con_seguidores(cliente: Any) -> List[str]:
    """
    Los seguimientos sin terminar asignados a alguien que prendió los avisos: el barrido de
    `avisos_seguimiento` los mira además de los que tienen suscripciones del link. Una falla acá
    nunca frena el barrido del link.
    """
    try:
        usuarios = {s["user_id"] for s in (cliente.table("tracker_suscripciones").select("user_id").execute().data or [])}
        if not usuarios:
            return []
        filas = {f["id"] for f in (cliente.table("seguidores").select("id").in_("seguidor_id", sorted(usuarios)).execute().data or [])}
        if not filas:
            return []
        ids = {a["seguimiento_id"] for a in (cliente.table("seguimiento_seguidores").select("seguimiento_id").in_("seguidor_fila_id", sorted(filas)).execute().data or [])}
        if not ids:
            return []
        vivos = (
            cliente.table("seguimientos_en_vivo")
            .select("id")
            .in_("id", sorted(ids))
            .is_("terminado_at", "null")
            .is_("aviso_aterrizaje_at", "null")
            .execute()
            .data
            or []
        )
        return [f["id"] for f in vivos]
    except Exception as exc:  # noqa: BLE001
        log.warning("[tracker] no se pudieron leer los seguimientos con seguidores: %r", exc)
        return []
