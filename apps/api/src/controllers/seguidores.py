"""
Seguidores y Vector Tracker (migración 056, `services/seguidores.py`).

- `/seguidores`, con sesión y el RLS del piloto: genera links de invitación (con un apodo que sólo ve
  el piloto), los lista (pendiente o "<nombre> entró"), los anula y quita a un seguidor. Quitar corta
  el acceso al instante. A qué vuelos ve cada uno se asigna en `PUT /seguimientos/{id}/seguidores`.
- `GET /publico/tracker/invitaciones/{token}`, sin sesión: el nombre de pila del piloto y si el link
  sigue vigente, para decir "Federico te invitó a seguir sus vuelos" antes de entrar. Nada más.
- `/tracker`, con sesión de quien sigue (cualquier cuenta de Vector): aceptar una invitación, ver **los
  vuelos que le asignaron** y pedir los avisos push. Lee con el service role **después** de filtrar
  por las filas de `seguidores` y `seguimiento_seguidores` del usuario.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List
from uuid import UUID

from litestar import Controller, Request, delete, get, patch, post
from litestar.exceptions import ClientException, NotFoundException
from supabase import Client

from src.auth.guards import auth_guard
from src.controllers.seguimientos import COLUMNAS_VISTA, leer_vista
from src.services.avisos import avisos_configurados
from src.services.avisos_seguimiento import BajaAvisoIn, SuscripcionAvisoIn
from src.services.seguidores import (
    ApodoIn,
    InvitacionIn,
    invitacion_vigente,
    mensaje_del_tope,
    nacio_ahora,
    nuevo_token_invitacion,
    ordenar_vuelos,
    token_con_forma,
    vence_la_invitacion,
)
from src.services.seguimientos import TRACKER_TERMINADOS_RECIENTES, esta_activo, nombre_de_pila, reciente_para_el_tracker, visible
from src.supabase_client import SupabaseManager

#: Cuántos vuelos como mucho se leen para un seguidor.
TOPE_VUELOS = 60
#: Cuántas suscripciones push como mucho por cuenta (un teléfono, una compu, una tablet...).
TOPE_SUSCRIPCIONES_CUENTA = 10

_INVITACION_INVALIDA = "Esta invitación ya se usó o venció. Pedile al piloto que te mande otra."


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


def _nombres_de_pila(cliente: Any, ids: List[str]) -> Dict[str, str]:
    if not ids:
        return {}
    filas = cliente.table("profiles").select("id,first_name").in_("id", ids).execute().data or []
    return {f["id"]: nombre_de_pila(f.get("first_name")) for f in filas}


def _fila_de_seguidor(f: Dict[str, Any], nombres: Dict[str, str], ahora: datetime) -> Dict[str, Any]:
    vinculado = bool(f.get("seguidor_id"))
    return {
        "id": f["id"],
        "apodo": f.get("apodo"),
        "vinculado": vinculado,
        "nombre": nombres.get(f.get("seguidor_id") or "") if vinculado else None,
        # El link sólo mientras está pendiente: es de un solo uso y se borra al aceptarlo.
        "invitacion_token": f.get("invitacion_token") if not vinculado else None,
        "invitacion_vence_at": f.get("invitacion_vence_at") if not vinculado else None,
        "vencida": (not vinculado) and not invitacion_vigente(f, ahora),
        "creado_at": f.get("creado_at"),
        "vinculado_at": f.get("vinculado_at"),
    }


_COLUMNAS_SEGUIDOR = "id,apodo,invitacion_token,invitacion_vence_at,seguidor_id,creado_at,vinculado_at"


class SeguidoresController(Controller):
    """Lo del piloto: a quién invitó a seguir sus vuelos."""

    path = "/seguidores"
    guards = [auth_guard]

    @get()
    async def listar(self, request: Request, supabase_client: Client) -> List[Dict[str, Any]]:
        user_id = str(request.state.user.id)
        ahora = _ahora()

        def _leer() -> List[Dict[str, Any]]:
            filas = (
                supabase_client.table("seguidores").select(_COLUMNAS_SEGUIDOR).eq("piloto_id", user_id).order("creado_at").limit(100).execute().data or []
            )
            # El nombre de pila de quien entró sale de su perfil: el RLS no deja leerlo con la sesión del piloto.
            nombres = _nombres_de_pila(SupabaseManager.get_service_client(), [f["seguidor_id"] for f in filas if f.get("seguidor_id")])
            return [_fila_de_seguidor(f, nombres, ahora) for f in filas]

        return await asyncio.to_thread(_leer)

    @post(status_code=201)
    async def invitar(self, request: Request, supabase_client: Client, data: InvitacionIn) -> Dict[str, Any]:
        """Genera un link de invitación de un solo uso que vence a los 7 días. Hasta `TOPE_SEGUIDORES` (pendientes incluidas)."""
        user_id = str(request.state.user.id)
        ahora = _ahora()

        def _crear() -> Dict[str, Any]:
            tabla = lambda: supabase_client.table("seguidores")  # noqa: E731
            # Las invitaciones vencidas sin usar no cuentan para el tope: se limpian.
            tabla().delete().eq("piloto_id", user_id).is_("seguidor_id", "null").lte("invitacion_vence_at", ahora.isoformat()).execute()
            cuenta = tabla().select("id", count="exact", head=True).eq("piloto_id", user_id).execute()
            motivo = mensaje_del_tope(cuenta.count or 0)
            if motivo:
                raise ClientException(detail=motivo, status_code=400)
            r = (
                tabla()
                .insert(
                    {
                        "piloto_id": user_id,
                        "apodo": data.apodo,
                        "invitacion_token": nuevo_token_invitacion(),
                        "invitacion_vence_at": vence_la_invitacion(ahora).isoformat(),
                    }
                )
                .execute()
            )
            if not r.data:
                raise ClientException(detail="No se pudo crear la invitación.")
            return _fila_de_seguidor(r.data[0], {}, ahora)

        return await asyncio.to_thread(_crear)

    @patch("/{seguidor_id:uuid}")
    async def renombrar(self, request: Request, supabase_client: Client, seguidor_id: UUID, data: ApodoIn) -> Dict[str, Any]:
        user_id = str(request.state.user.id)
        ahora = _ahora()

        def _cambiar() -> Dict[str, Any]:
            r = supabase_client.table("seguidores").update({"apodo": data.apodo}).eq("id", str(seguidor_id)).eq("piloto_id", user_id).execute()
            if not r.data:
                raise NotFoundException("Esa persona no existe.")
            return _fila_de_seguidor(r.data[0], {}, ahora)

        return await asyncio.to_thread(_cambiar)

    @delete("/{seguidor_id:uuid}", status_code=200)
    async def quitar(self, request: Request, supabase_client: Client, seguidor_id: UUID) -> Dict[str, bool]:
        """
        Anula una invitación pendiente o quita a un seguidor. Borra la fila, y con ella las asignaciones (en
        cascada): deja de ver todo en el próximo pedido. Quitar dos veces es un 404.
        """
        user_id = str(request.state.user.id)

        def _borrar() -> None:
            r = supabase_client.table("seguidores").delete().eq("id", str(seguidor_id)).eq("piloto_id", user_id).execute()
            if not r.data:
                raise NotFoundException("Esa persona no existe.")

        await asyncio.to_thread(_borrar)
        return {"ok": True}


class TrackerPublicoController(Controller):
    """Sin guard: lo que se ve del link de invitación antes de entrar."""

    path = "/publico/tracker"

    @get("/invitaciones/{token:str}")
    async def invitacion(self, token: str) -> Dict[str, Any]:
        """`{vigente, nombre}`: el nombre de pila del piloto sólo si el link sirve. Un token malo, usado o vencido es `vigente: false`."""
        if not token_con_forma(token):
            return {"vigente": False, "nombre": None}
        ahora = _ahora()

        def _leer() -> Dict[str, Any]:
            cliente = SupabaseManager.get_service_client()
            filas = cliente.table("seguidores").select("piloto_id,seguidor_id,invitacion_token,invitacion_vence_at").eq("invitacion_token", token).limit(1).execute().data or []
            if not filas or not invitacion_vigente(filas[0], ahora):
                return {"vigente": False, "nombre": None}
            return {"vigente": True, "nombre": _nombres_de_pila(cliente, [filas[0]["piloto_id"]]).get(filas[0]["piloto_id"]) or "Un piloto"}

        return await asyncio.to_thread(_leer)


def _mis_filas(cliente: Any, user_id: str) -> List[Dict[str, Any]]:
    """Las filas de `seguidores` donde esta cuenta es la que sigue: a quiénes sigue."""
    return cliente.table("seguidores").select("id,piloto_id").eq("seguidor_id", user_id).execute().data or []


def _asignados(cliente: Any, filas: List[str]) -> List[str]:
    """Los seguimientos asignados a alguna de estas filas."""
    if not filas:
        return []
    return sorted({a["seguimiento_id"] for a in (cliente.table("seguimiento_seguidores").select("seguimiento_id").in_("seguidor_fila_id", filas).execute().data or [])})


def _perfiles_de_pilotos(cliente: Any, ids: List[str]) -> Dict[str, Dict[str, Any]]:
    """`{piloto_id: {nombre, handle}}`: el nombre de pila y el @ si lo tiene. Nada más."""
    if not ids:
        return {}
    nombres = _nombres_de_pila(cliente, ids)
    handles = {h["user_id"]: h["handle"] for h in (cliente.table("perfiles_publicos").select("user_id,handle").in_("user_id", ids).execute().data or [])}
    return {i: {"nombre": nombres.get(i) or "Un piloto", "handle": handles.get(i)} for i in ids}


class TrackerController(Controller):
    """Lo de quien sigue: cualquier cuenta de Vector entrando por tracker.vectoraero.ar."""

    path = "/tracker"
    guards = [auth_guard]

    @post("/invitaciones/{token:str}/aceptar", status_code=200)
    async def aceptar(self, request: Request, token: str) -> Dict[str, Any]:
        """
        Acepta una invitación: esta cuenta pasa a seguir a ese piloto. De un solo uso (el token se borra con un
        update condicional: si dos la aceptan a la vez, gana una), vence a los 7 días, y un piloto no puede
        aceptar la suya. Si ya seguía a ese piloto no pasa nada: la invitación sobrante se descarta. Si la
        cuenta se creó hace minutos, se marca `alta_desde = 'tracker'`.
        """
        user_id = str(request.state.user.id)
        ahora = _ahora()
        if not token_con_forma(token):
            raise NotFoundException(_INVITACION_INVALIDA)

        def _aceptar() -> Dict[str, Any]:
            cliente = SupabaseManager.get_service_client()
            tabla = lambda: cliente.table("seguidores")  # noqa: E731
            filas = tabla().select("id,piloto_id,seguidor_id,invitacion_token,invitacion_vence_at").eq("invitacion_token", token).limit(1).execute().data or []
            if not filas or not invitacion_vigente(filas[0], ahora):
                raise ClientException(detail=_INVITACION_INVALIDA, status_code=410)
            fila = filas[0]
            piloto = fila["piloto_id"]
            if piloto == user_id:
                raise ClientException(detail="Es tu propia invitación: se la mandás a quien quieras que te siga.", status_code=400)
            nombre = _nombres_de_pila(cliente, [piloto]).get(piloto) or "Un piloto"
            ya = tabla().select("id").eq("piloto_id", piloto).eq("seguidor_id", user_id).limit(1).execute().data or []
            if ya:
                tabla().delete().eq("id", fila["id"]).is_("seguidor_id", "null").execute()
                return {"piloto": {"nombre": nombre}, "ya_seguia": True}
            r = (
                tabla()
                .update({"seguidor_id": user_id, "vinculado_at": ahora.isoformat(), "invitacion_token": None, "invitacion_vence_at": None})
                .eq("id", fila["id"])
                .eq("invitacion_token", token)
                .is_("seguidor_id", "null")
                .execute()
            )
            if not r.data:
                raise ClientException(detail=_INVITACION_INVALIDA, status_code=410)
            try:
                usuario = getattr(cliente.auth.admin.get_user_by_id(user_id), "user", None)
                if usuario is not None and nacio_ahora(usuario, ahora):
                    cliente.table("profiles").update({"alta_desde": "tracker"}).eq("id", user_id).is_("alta_desde", "null").execute()
            except Exception:  # noqa: BLE001 — la marca es una métrica: nunca tira abajo el alta
                pass
            return {"piloto": {"nombre": nombre}, "ya_seguia": False}

        return await asyncio.to_thread(_aceptar)

    @get("/pilotos")
    async def pilotos(self, request: Request) -> List[Dict[str, Any]]:
        """A quiénes sigue: nombre de pila, @ y si tiene algo asignado en marcha ahora."""
        user_id = str(request.state.user.id)
        ahora = _ahora()

        def _leer() -> List[Dict[str, Any]]:
            cliente = SupabaseManager.get_service_client()
            mias = _mis_filas(cliente, user_id)
            if not mias:
                return []
            ids = sorted({m["piloto_id"] for m in mias})
            asignados = _asignados(cliente, [m["id"] for m in mias])
            activos = set()
            if asignados:
                activos = {
                    f["user_id"]
                    for f in (
                        cliente.table("seguimientos_en_vivo")
                        .select("user_id,vence_at,terminado_at")
                        .in_("id", asignados)
                        .is_("terminado_at", "null")
                        .execute()
                        .data
                        or []
                    )
                    if esta_activo(f, ahora)
                }
            perfiles = _perfiles_de_pilotos(cliente, ids)
            return [{**perfiles[i], "activo": i in activos} for i in ids if i in perfiles]

        return await asyncio.to_thread(_leer)

    @get("/vuelos")
    async def vuelos(self, request: Request) -> List[Dict[str, Any]]:
        """
        **Sólo los vuelos que el piloto le asignó a esta cuenta**: los que siguen activos y, por
        `TRACKER_TERMINADOS_RECIENTES`, los que terminaron hace poco (para que "aterrizó" no desaparezca de golpe).
        Cada uno es lo que ve el link público (`vista_publica`, con ADS-B) más `token` y `piloto` (nombre de pila y @).
        En el aire primero.
        """
        user_id = str(request.state.user.id)
        ahora = _ahora()

        def _leer() -> List[Dict[str, Any]]:
            cliente = SupabaseManager.get_service_client()
            mias = _mis_filas(cliente, user_id)
            asignados = _asignados(cliente, [m["id"] for m in mias])
            if not asignados:
                return []
            filas = (
                cliente.table("seguimientos_en_vivo")
                .select(f"token,{COLUMNAS_VISTA}")
                .in_("id", asignados)
                .gte("vence_at", (ahora - TRACKER_TERMINADOS_RECIENTES).isoformat())
                .order("created_at", desc=True)
                .limit(TOPE_VUELOS)
                .execute()
                .data
                or []
            )
            perfiles = _perfiles_de_pilotos(cliente, sorted({f["user_id"] for f in filas}))
            salida: List[Dict[str, Any]] = []
            for f in filas:
                # En la lista del tracker, sólo lo que sigue en marcha o terminó hace poco (el link
                # en sí se sigue viendo una semana, `GRACIA_DESPUES_DE_TERMINAR`).
                if not visible(f, ahora) or not reciente_para_el_tracker(f, ahora):
                    continue
                try:
                    vista = leer_vista(cliente, f, ahora, f["token"])
                except Exception:  # noqa: BLE001 — un vuelo que no se puede armar no tira la lista
                    continue
                piloto = perfiles.get(f["user_id"], {})
                salida.append({**vista, "token": f["token"], "piloto": {"nombre": piloto.get("nombre") or vista.get("nombre"), "handle": piloto.get("handle")}})
            return ordenar_vuelos(salida)

        return await asyncio.to_thread(_leer)

    @get("/vuelos/{token:str}")
    async def vuelo(self, request: Request, token: str) -> Dict[str, Any]:
        """Quién es el piloto de un vuelo, sólo si está **asignado a esta cuenta** (si no, 404: no se confirma que exista)."""
        user_id = str(request.state.user.id)
        ahora = _ahora()
        if not token_con_forma(token):
            raise NotFoundException("Ese vuelo no existe.")

        def _leer() -> Dict[str, Any]:
            cliente = SupabaseManager.get_service_client()
            filas = cliente.table("seguimientos_en_vivo").select("id,user_id,token,vence_at,terminado_at").eq("token", token).limit(1).execute().data or []
            if not filas or not visible(filas[0], ahora):
                raise NotFoundException("Ese vuelo no existe.")
            mias = [m["id"] for m in _mis_filas(cliente, user_id)]
            if filas[0]["id"] not in _asignados(cliente, mias):
                raise NotFoundException("Ese vuelo no existe.")
            return {"token": token, "piloto": _perfiles_de_pilotos(cliente, [filas[0]["user_id"]]).get(filas[0]["user_id"], {})}

        return await asyncio.to_thread(_leer)

    @post("/avisos", status_code=201)
    async def pedir_avisos(self, request: Request, data: SuscripcionAvisoIn) -> Dict[str, bool]:
        """Prende los avisos de despegue y aterrizaje de esta cuenta, en este navegador. Pedirlo dos veces es lo mismo."""
        user_id = str(request.state.user.id)
        if not avisos_configurados():
            raise ClientException(detail="Los avisos no están disponibles.", status_code=503)

        def _guardar() -> None:
            cliente = SupabaseManager.get_service_client()
            tabla = lambda: cliente.table("tracker_suscripciones")  # noqa: E731
            ya = tabla().select("id").eq("user_id", user_id).eq("endpoint", data.endpoint).limit(1).execute().data or []
            if not ya:
                cuenta = tabla().select("id", count="exact", head=True).eq("user_id", user_id).execute()
                if (cuenta.count or 0) >= TOPE_SUSCRIPCIONES_CUENTA:
                    raise ClientException(detail="Esta cuenta ya tiene todos los dispositivos con avisos que admite.", status_code=409)
            tabla().upsert(
                {"user_id": user_id, "endpoint": data.endpoint, "p256dh": data.keys.p256dh, "auth": data.keys.auth},
                on_conflict="user_id,endpoint",
            ).execute()

        await asyncio.to_thread(_guardar)
        return {"ok": True}

    @post("/avisos/baja", status_code=200)
    async def dar_de_baja_avisos(self, request: Request, data: BajaAvisoIn) -> Dict[str, bool]:
        """Apaga los avisos de este navegador para esta cuenta. Sólo borra la suya."""
        user_id = str(request.state.user.id)

        def _borrar() -> None:
            SupabaseManager.get_service_client().table("tracker_suscripciones").delete().eq("user_id", user_id).eq("endpoint", data.endpoint).execute()

        await asyncio.to_thread(_borrar)
        return {"ok": True}

    @get("/avisos")
    async def estado_de_avisos(self, request: Request) -> Dict[str, Any]:
        """Cuántos dispositivos de esta cuenta tienen los avisos prendidos (sin devolver ninguna credencial)."""
        user_id = str(request.state.user.id)

        def _contar() -> int:
            r = SupabaseManager.get_service_client().table("tracker_suscripciones").select("id", count="exact", head=True).eq("user_id", user_id).execute()
            return r.count or 0

        return {"dispositivos": await asyncio.to_thread(_contar), "disponibles": avisos_configurados()}
