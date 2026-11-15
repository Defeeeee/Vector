"""
Las checklists del avión (migración 054).

Usa el cliente por usuario (lo protege el RLS de la 054; el filtro por `user_id` igual va).
Vector sólo guarda y muestra lo que cargó el piloto: no hay ninguna checklist de fábrica.
"""
from datetime import datetime, timezone
from typing import List
from uuid import UUID

from litestar import Controller, Request, delete, get, post, put
from litestar.exceptions import ClientException, NotFoundException
from supabase import Client

from src.auth.guards import auth_guard
from src.models.checklists import (
    AsignarAviones,
    Checklist,
    ChecklistBreve,
    ChecklistEdicion,
    ChecklistIn,
)

#: Un piloto tiene un puñado: esto sólo evita que la tabla sea un depósito.
LIMITE_CHECKLISTS = 40
COLUMNAS_BREVES = "id,nombre,updated_at"
COLUMNAS = "id,nombre,texto,updated_at"


class ChecklistsController(Controller):
    path = "/checklists"
    guards = [auth_guard]

    @get()
    async def listar(self, request: Request, supabase_client: Client) -> List[ChecklistBreve]:
        user_id = str(request.state.user.id)
        resp = (
            supabase_client.table("checklists")
            .select(COLUMNAS_BREVES)
            .eq("user_id", user_id)
            .order("nombre")
            .limit(LIMITE_CHECKLISTS)
            .execute()
        )
        return [ChecklistBreve(**c) for c in (resp.data or [])]

    @get("/{checklist_id:uuid}")
    async def leer(self, request: Request, supabase_client: Client, checklist_id: UUID) -> Checklist:
        user_id = str(request.state.user.id)
        resp = (
            supabase_client.table("checklists")
            .select(COLUMNAS)
            .eq("id", str(checklist_id))
            .eq("user_id", user_id)
            .execute()
        )
        if not resp.data:
            raise NotFoundException("Esa checklist no existe.")
        return Checklist(**resp.data[0])

    @post()
    async def crear(self, request: Request, supabase_client: Client, data: ChecklistIn) -> Checklist:
        user_id = str(request.state.user.id)
        cuantas = (
            supabase_client.table("checklists").select("id", count="exact").eq("user_id", user_id).execute()
        )
        if (cuantas.count or 0) >= LIMITE_CHECKLISTS:
            raise ClientException(detail=f"Ya tenés {LIMITE_CHECKLISTS} checklists. Borrá alguna para crear otra.")
        resp = (
            supabase_client.table("checklists")
            .insert({"user_id": user_id, "nombre": data.nombre, "texto": data.texto})
            .execute()
        )
        if not resp.data:
            raise ClientException(detail="No se pudo crear la checklist.")
        return Checklist(**resp.data[0])

    @put("/{checklist_id:uuid}")
    async def guardar(
        self, request: Request, supabase_client: Client, checklist_id: UUID, data: ChecklistEdicion
    ) -> Checklist:
        user_id = str(request.state.user.id)
        resp = (
            supabase_client.table("checklists")
            .update({"nombre": data.nombre, "texto": data.texto, "updated_at": datetime.now(timezone.utc).isoformat()})
            .eq("id", str(checklist_id))
            .eq("user_id", user_id)
            .execute()
        )
        if not resp.data:
            raise NotFoundException("Esa checklist no existe.")
        return Checklist(**resp.data[0])

    @delete("/{checklist_id:uuid}")
    async def borrar(self, request: Request, supabase_client: Client, checklist_id: UUID) -> None:
        user_id = str(request.state.user.id)
        resp = (
            supabase_client.table("checklists")
            .delete()
            .eq("id", str(checklist_id))
            .eq("user_id", user_id)
            .execute()
        )
        if not resp.data:
            raise NotFoundException("Esa checklist no existe.")

    @put("/{checklist_id:uuid}/aviones")
    async def asignar_aviones(
        self, request: Request, supabase_client: Client, checklist_id: UUID, data: AsignarAviones
    ) -> dict:
        """Deja la checklist asignada exactamente a esos aviones: los demás quedan sin ella."""
        user_id = str(request.state.user.id)
        cid = str(checklist_id)
        propia = (
            supabase_client.table("checklists").select("id").eq("id", cid).eq("user_id", user_id).execute()
        )
        if not propia.data:
            raise NotFoundException("Esa checklist no existe.")
        ids = [str(a) for a in data.aircraft_ids]
        if ids:
            mios = (
                supabase_client.table("aircraft").select("id").eq("user_id", user_id).in_("id", ids).execute()
            )
            if len(mios.data or []) != len(ids):
                raise NotFoundException("Alguno de esos aviones no es tuyo.")
        # Primero se suelta lo que ya no va, después se asigna lo que va.
        con_ella = (
            supabase_client.table("aircraft").select("id").eq("user_id", user_id).eq("checklist_id", cid).execute()
        )
        soltar = [a["id"] for a in (con_ella.data or []) if str(a["id"]) not in ids]
        if soltar:
            (
                supabase_client.table("aircraft")
                .update({"checklist_id": None})
                .eq("user_id", user_id)
                .in_("id", soltar)
                .execute()
            )
        if ids:
            (
                supabase_client.table("aircraft")
                .update({"checklist_id": cid})
                .eq("user_id", user_id)
                .in_("id", ids)
                .execute()
            )
        return {"aircraft_ids": ids}
