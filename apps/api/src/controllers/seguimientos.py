"""
Seguir el vuelo en vivo (migración 041, `services/seguimientos.py`).

- `POST /seguimientos`, `POST /seguimientos/{id}/posicion`, `.../matricula` y `.../terminar`: con sesión, del
  piloto, contra su RLS. Lo llama el Mapa en modo vuelo ("Compartir mi vuelo").
- `GET /publico/seguimientos/{token}`: **sin guard**, lo que abre el link que se manda por
  WhatsApp. Lee con el service role y devuelve `vista_publica`, una lista fija de campos.
  Un token que no existe y uno que ya no se puede ver dan el mismo 404.

Una posición es de pantalla prendida: el teléfono no le da el GPS a una página en segundo plano.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List
from uuid import UUID

from litestar import Controller, Request, Response, get, post
from litestar.exceptions import ClientException, NotFoundException
from postgrest.exceptions import APIError
from pydantic import BaseModel
from supabase import Client

from src.auth.guards import auth_guard
from src.services.seguimientos import (
    MatriculaVisible,
    PosicionEnVivo,
    SeguimientoCrear,
    agregar_al_recorrido,
    esta_activo,
    nombre_de_pila,
    nuevo_token,
    puede_aceptar_posicion,
    vence_en,
    visible,
    vista_publica,
)
from src.supabase_client import SupabaseManager

_NO_EXISTE = "Ese seguimiento no existe."


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


class SeguimientoCreado(BaseModel):
    id: UUID
    token: str
    vence_at: str
    ya_existia: bool = False
    #: Si la matrícula se está mostrando (un seguimiento retomado puede tenerla prendida).
    mostrar_matricula: bool = False


class PosicionAceptada(BaseModel):
    #: False si llegó antes de los 10 s de la anterior: no es un error, se ignora.
    aceptada: bool
    vence_at: str


class SeguimientosController(Controller):
    path = "/seguimientos"
    guards = [auth_guard]

    @post(status_code=200)
    async def crear(self, request: Request, supabase_client: Client, data: SeguimientoCrear) -> SeguimientoCreado:
        user_id = str(request.state.user.id)
        ahora = _ahora()

        def _crear() -> SeguimientoCreado:
            tabla = lambda: supabase_client.table("seguimientos_en_vivo")  # noqa: E731
            # Un seguimiento vencido que nadie terminó sigue "sin terminar" para el índice único:
            # se cierra acá, antes de mirar si hay uno activo.
            tabla().update({"terminado_at": ahora.isoformat()}).eq("user_id", user_id).is_(
                "terminado_at", "null"
            ).lte("vence_at", ahora.isoformat()).execute()

            def _activo() -> List[Dict[str, Any]]:
                return (
                    tabla().select("id,token,vence_at,mostrar_matricula").eq("user_id", user_id).is_("terminado_at", "null").limit(1).execute().data
                    or []
                )

            existente = _activo()
            if existente:
                f = existente[0]
                return SeguimientoCreado(
                    id=f["id"], token=f["token"], vence_at=f["vence_at"], ya_existia=True, mostrar_matricula=bool(f.get("mostrar_matricula"))
                )

            matricula = (data.avion.matricula if data.avion else "") or None
            mostrar = bool(data.mostrar_matricula and matricula)
            if not mostrar:
                matricula = None
            perfil = supabase_client.table("profiles").select("first_name").eq("id", user_id).limit(1).execute().data or []
            fila = {
                "user_id": user_id,
                "token": nuevo_token(),
                "nombre": nombre_de_pila(perfil[0].get("first_name") if perfil else None),
                "ruta": data.ruta,
                "puntos": [[p.lat, p.lon, p.codigo, p.nombre] for p in data.puntos],
                "avion_tipo": (data.avion.tipo if data.avion else "") or None,
                "avion_icao": (data.avion.icao if data.avion else "") or None,
                # La matrícula se guarda sólo si el piloto la prendió (migración 042).
                "mostrar_matricula": mostrar,
                "avion_matricula": matricula,
                "vence_at": vence_en(ahora).isoformat(),
            }
            try:
                r = tabla().insert(fila).execute()
            except APIError:
                # Dos pedidos a la vez: ganó el otro (índice único). Se devuelve el suyo.
                otra = _activo()
                if otra:
                    return SeguimientoCreado(
                        id=otra[0]["id"],
                        token=otra[0]["token"],
                        vence_at=otra[0]["vence_at"],
                        ya_existia=True,
                        mostrar_matricula=bool(otra[0].get("mostrar_matricula")),
                    )
                raise
            if not r.data:
                raise ClientException(detail="No se pudo empezar a compartir el vuelo.")
            f = r.data[0]
            return SeguimientoCreado(id=f["id"], token=f["token"], vence_at=f["vence_at"])

        return await asyncio.to_thread(_crear)

    @post("/{seguimiento_id:uuid}/posicion", status_code=200)
    async def posicion(
        self, request: Request, supabase_client: Client, seguimiento_id: UUID, data: PosicionEnVivo
    ) -> PosicionAceptada:
        user_id = str(request.state.user.id)
        ahora = _ahora()

        def _agregar() -> PosicionAceptada:
            tabla = supabase_client.table("seguimientos_en_vivo")
            filas = (
                tabla.select("vence_at,terminado_at,ultima_at,recorrido")
                .eq("id", str(seguimiento_id))
                .eq("user_id", user_id)
                .limit(1)
                .execute()
                .data
                or []
            )
            if not filas:
                raise NotFoundException(_NO_EXISTE)
            fila = filas[0]
            if not esta_activo(fila, ahora):
                # 410: el teléfono sabe que tiene que dejar de mandar.
                raise ClientException(detail="Este seguimiento ya terminó.", status_code=410)
            if not puede_aceptar_posicion(fila.get("ultima_at"), ahora):
                return PosicionAceptada(aceptada=False, vence_at=fila["vence_at"])
            tabla.update(
                {
                    "ultima_lat": data.lat,
                    "ultima_lon": data.lon,
                    "ultima_alt_ft": data.alt_ft,
                    "ultima_gs_kt": data.gs_kt,
                    "ultima_track": data.track,
                    "ultima_at": ahora.isoformat(),
                    "recorrido": agregar_al_recorrido(
                        fila.get("recorrido") or [], data.lat, data.lon, data.alt_ft, int(ahora.timestamp())
                    ),
                }
            ).eq("id", str(seguimiento_id)).eq("user_id", user_id).execute()
            return PosicionAceptada(aceptada=True, vence_at=fila["vence_at"])

        return await asyncio.to_thread(_agregar)

    @post("/{seguimiento_id:uuid}/matricula", status_code=200)
    async def matricula(
        self, request: Request, supabase_client: Client, seguimiento_id: UUID, data: MatriculaVisible
    ) -> Dict[str, bool]:
        """Prende o apaga la matrícula del link. Apagada, se borra de la base; prenderla pide mandarla."""
        user_id = str(request.state.user.id)
        if data.mostrar and not data.matricula:
            raise ClientException(detail="Falta la matrícula para mostrarla.", status_code=400)

        def _cambiar() -> None:
            r = (
                supabase_client.table("seguimientos_en_vivo")
                .update(
                    {
                        "mostrar_matricula": data.mostrar,
                        "avion_matricula": data.matricula if data.mostrar else None,
                    }
                )
                .eq("id", str(seguimiento_id))
                .eq("user_id", user_id)
                .execute()
            )
            if not r.data:
                raise NotFoundException(_NO_EXISTE)

        await asyncio.to_thread(_cambiar)
        return {"mostrar_matricula": data.mostrar}

    @post("/{seguimiento_id:uuid}/terminar", status_code=200)
    async def terminar(self, request: Request, supabase_client: Client, seguimiento_id: UUID) -> Dict[str, bool]:
        user_id = str(request.state.user.id)

        def _terminar() -> None:
            r = (
                supabase_client.table("seguimientos_en_vivo")
                .update({"terminado_at": _ahora().isoformat()})
                .eq("id", str(seguimiento_id))
                .eq("user_id", user_id)
                .is_("terminado_at", "null")
                .execute()
            )
            if r.data:
                return
            # Ya estaba terminado: terminar dos veces es lo mismo. Sólo un id ajeno es un 404.
            ya = (
                supabase_client.table("seguimientos_en_vivo")
                .select("id")
                .eq("id", str(seguimiento_id))
                .eq("user_id", user_id)
                .limit(1)
                .execute()
                .data
            )
            if not ya:
                raise NotFoundException(_NO_EXISTE)

        await asyncio.to_thread(_terminar)
        return {"terminado": True}


class SeguimientosPublicosController(Controller):
    """`GET /publico/seguimientos/{token}`, sin guard: el link que se manda a la familia."""

    path = "/publico/seguimientos"

    @get("/{token:str}")
    async def ver(self, token: str) -> Response[Dict[str, Any]]:
        # Un token con otra forma no puede existir: 404 sin ir a la base.
        if not (32 <= len(token) <= 64) or not all(c.isalnum() or c in "-_" for c in token):
            raise NotFoundException(_NO_EXISTE)
        ahora = _ahora()

        def _leer() -> Dict[str, Any]:
            filas = (
                SupabaseManager.get_service_client()
                .table("seguimientos_en_vivo")
                .select("nombre,ruta,puntos,created_at,avion_tipo,avion_icao,avion_matricula,mostrar_matricula,vence_at,terminado_at,ultima_lat,ultima_lon,ultima_alt_ft,ultima_gs_kt,ultima_track,ultima_at,recorrido")
                .eq("token", token)
                .limit(1)
                .execute()
                .data
                or []
            )
            if not filas or not visible(filas[0], ahora):
                raise NotFoundException(_NO_EXISTE)
            return vista_publica(filas[0], ahora)

        cuerpo = await asyncio.to_thread(_leer)
        return Response(cuerpo, headers={"Cache-Control": "no-store"})
