"""
Las firmas de los certificantes y el dorso de cada hoja del libro (migración 047).

Usa el cliente por usuario: lo que protege es el RLS de la 047; el filtro por `user_id` igual
va. **Estas imágenes sólo sirven para el PDF del libro del piloto**: no hay ningún endpoint
público ni ninguna que las comparta.
"""
from typing import List, Optional
from uuid import UUID

from litestar import Controller, Request, delete, get, put
from litestar.exceptions import ClientException, NotFoundException
from supabase import Client

from src.auth.guards import auth_guard
from src.models.firmas import DorsoHoja, DorsoHojaIn, FirmaCertificante, FirmaCertificanteIn

#: Cuántos certificantes y cuántas hojas con dorso. Un piloto tiene un puñado de instructores
#: y un libro de unas decenas de hojas; esto sólo evita que la tabla sea un depósito.
LIMITE_CERTIFICANTES = 40
LIMITE_DORSOS = 400


class FirmasController(Controller):
    path = "/firmas"
    guards = [auth_guard]

    # ------------------------------------------------------ certificantes

    @get("/certificantes")
    async def listar_certificantes(self, request: Request, supabase_client: Client) -> List[FirmaCertificante]:
        user_id = str(request.state.user.id)
        resp = (
            supabase_client.table("firmas_certificantes")
            .select("id,nombre,licencia,autoridad_id,png,updated_at")
            .eq("user_id", user_id)
            .order("nombre")
            .limit(LIMITE_CERTIFICANTES)
            .execute()
        )
        return [FirmaCertificante(**f) for f in (resp.data or [])]

    @put("/certificantes")
    async def guardar_certificante(
        self, request: Request, supabase_client: Client, data: FirmaCertificanteIn
    ) -> FirmaCertificante:
        user_id = str(request.state.user.id)
        existe = (
            supabase_client.table("firmas_certificantes")
            .select("id")
            .eq("user_id", user_id)
            .eq("nombre", data.nombre)
            .execute()
        )
        if not existe.data:
            cuantas = (
                supabase_client.table("firmas_certificantes")
                .select("id", count="exact")
                .eq("user_id", user_id)
                .execute()
            )
            if (cuantas.count or 0) >= LIMITE_CERTIFICANTES:
                raise ClientException(
                    detail=f"Ya tenés {LIMITE_CERTIFICANTES} firmas guardadas. Borrá alguna para guardar otra."
                )
        resp = (
            supabase_client.table("firmas_certificantes")
            .upsert(
                {
                    "user_id": user_id,
                    "nombre": data.nombre,
                    "licencia": data.licencia,
                    "autoridad_id": data.autoridad_id,
                    "png": data.png,
                },
                on_conflict="user_id,nombre",
            )
            .execute()
        )
        if not resp.data:
            raise ClientException(detail="No se pudo guardar la firma.")
        return FirmaCertificante(**resp.data[0])

    @delete("/certificantes/{firma_id:uuid}")
    async def borrar_certificante(self, request: Request, supabase_client: Client, firma_id: UUID) -> None:
        user_id = str(request.state.user.id)
        resp = (
            supabase_client.table("firmas_certificantes")
            .delete()
            .eq("id", str(firma_id))
            .eq("user_id", user_id)
            .execute()
        )
        if not resp.data:
            raise NotFoundException("Esa firma no existe.")

    # ------------------------------------------------------------- dorsos

    @get("/dorsos")
    async def listar_dorsos(
        self, request: Request, supabase_client: Client, logbook_id: Optional[UUID] = None
    ) -> List[DorsoHoja]:
        user_id = str(request.state.user.id)
        q = (
            supabase_client.table("libro_hojas_dorso")
            .select("id,logbook_id,hoja,png,aclaracion,fecha")
            .eq("user_id", user_id)
        )
        if logbook_id:
            q = q.eq("logbook_id", str(logbook_id))
        resp = q.order("hoja").limit(LIMITE_DORSOS).execute()
        return [DorsoHoja(**f) for f in (resp.data or [])]

    @put("/dorsos")
    async def guardar_dorso(self, request: Request, supabase_client: Client, data: DorsoHojaIn) -> DorsoHoja:
        user_id = str(request.state.user.id)
        libro = (
            supabase_client.table("logbooks")
            .select("id")
            .eq("id", str(data.logbook_id))
            .eq("user_id", user_id)
            .execute()
        )
        if not libro.data:
            raise NotFoundException("Ese libro no existe.")
        if not data.png and not data.aclaracion and not data.fecha:
            raise ClientException(detail="No hay nada para guardar en el dorso.")
        resp = (
            supabase_client.table("libro_hojas_dorso")
            .upsert(
                {
                    "user_id": user_id,
                    "logbook_id": str(data.logbook_id),
                    "hoja": data.hoja,
                    "png": data.png,
                    "aclaracion": data.aclaracion,
                    "fecha": data.fecha.isoformat() if data.fecha else None,
                },
                on_conflict="logbook_id,hoja",
            )
            .execute()
        )
        if not resp.data:
            raise ClientException(detail="No se pudo guardar el dorso.")
        return DorsoHoja(**resp.data[0])

    @delete("/dorsos/{dorso_id:uuid}")
    async def borrar_dorso(self, request: Request, supabase_client: Client, dorso_id: UUID) -> None:
        user_id = str(request.state.user.id)
        resp = (
            supabase_client.table("libro_hojas_dorso")
            .delete()
            .eq("id", str(dorso_id))
            .eq("user_id", user_id)
            .execute()
        )
        if not resp.data:
            raise NotFoundException("Ese dorso no existe.")
