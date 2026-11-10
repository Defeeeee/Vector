"""
Las rutas guardadas del Mapa (migración 039): un nombre, la ruta como se escribe en el Mapa
y, si se eligió, el avión. Se arman en la compu y se vuelan con el teléfono.

Usa el cliente por usuario: lo que protege es el RLS de la 039. El filtro por `user_id`
igual va, para el índice. **Una ruta guardada no es un vuelo ni un plan de vuelo.**
"""
from typing import List, Optional
from uuid import UUID

from litestar import Controller, Request, delete, get, patch, post
from litestar.exceptions import ClientException, NotFoundException
from pydantic import BaseModel, Field, field_validator
from supabase import Client

from src.auth.guards import auth_guard

#: Cuántas rutas trae la lista. Federico repite tres o cuatro (SADF local, SADF–SAAK,
#: SADM–SRDL); cien es holgado y evita que alguien use la tabla de depósito.
LIMITE_RUTAS = 100


def _limpiar(valor: str) -> str:
    return " ".join(valor.split())


class RutaGuardada(BaseModel):
    id: UUID
    nombre: str
    ruta: str
    aircraft_id: Optional[UUID] = None
    created_at: str
    updated_at: str


class RutaGuardadaCrear(BaseModel):
    nombre: str = Field(min_length=1, max_length=80)
    ruta: str = Field(min_length=1, max_length=600)
    aircraft_id: Optional[UUID] = None

    @field_validator("nombre", "ruta")
    @classmethod
    def _sin_espacios_de_mas(cls, v: str) -> str:
        v = _limpiar(v)
        if not v:
            raise ValueError("No puede estar vacío.")
        return v


class RutaGuardadaCambio(BaseModel):
    nombre: Optional[str] = Field(default=None, min_length=1, max_length=80)
    ruta: Optional[str] = Field(default=None, min_length=1, max_length=600)
    aircraft_id: Optional[UUID] = None

    @field_validator("nombre", "ruta")
    @classmethod
    def _sin_espacios_de_mas(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = _limpiar(v)
        if not v:
            raise ValueError("No puede estar vacío.")
        return v


class RutasGuardadasController(Controller):
    path = "/rutas"
    guards = [auth_guard]

    @get()
    async def listar(self, request: Request, supabase_client: Client) -> List[RutaGuardada]:
        user_id = str(request.state.user.id)
        resp = (
            supabase_client.table("rutas_guardadas")
            .select("*")
            .eq("user_id", user_id)
            .order("updated_at", desc=True)
            .limit(LIMITE_RUTAS)
            .execute()
        )
        return [RutaGuardada(**fila) for fila in (resp.data or [])]

    @post()
    async def crear(self, request: Request, supabase_client: Client, data: RutaGuardadaCrear) -> RutaGuardada:
        user_id = str(request.state.user.id)
        cuantas = (
            supabase_client.table("rutas_guardadas").select("id", count="exact").eq("user_id", user_id).execute()
        )
        if (cuantas.count or 0) >= LIMITE_RUTAS:
            raise ClientException(detail=f"Ya tenés {LIMITE_RUTAS} rutas guardadas. Borrá alguna para guardar otra.")
        fila = {
            "user_id": user_id,
            "nombre": data.nombre,
            "ruta": data.ruta,
            "aircraft_id": str(data.aircraft_id) if data.aircraft_id else None,
        }
        resp = supabase_client.table("rutas_guardadas").insert(fila).execute()
        if not resp.data:
            raise ClientException(detail="No se pudo guardar la ruta.")
        return RutaGuardada(**resp.data[0])

    @patch("/{ruta_id:uuid}")
    async def cambiar(
        self, request: Request, supabase_client: Client, ruta_id: UUID, data: RutaGuardadaCambio
    ) -> RutaGuardada:
        user_id = str(request.state.user.id)
        cambios = data.model_dump(exclude_unset=True, mode="json")
        if not cambios:
            raise ClientException(detail="No hay nada para cambiar.")
        resp = (
            supabase_client.table("rutas_guardadas")
            .update(cambios)
            .eq("id", str(ruta_id))
            .eq("user_id", user_id)
            .execute()
        )
        if not resp.data:
            raise NotFoundException("Esa ruta no existe.")
        return RutaGuardada(**resp.data[0])

    @delete("/{ruta_id:uuid}")
    async def borrar(self, request: Request, supabase_client: Client, ruta_id: UUID) -> None:
        user_id = str(request.state.user.id)
        resp = (
            supabase_client.table("rutas_guardadas")
            .delete()
            .eq("id", str(ruta_id))
            .eq("user_id", user_id)
            .execute()
        )
        if not resp.data:
            raise NotFoundException("Esa ruta no existe.")
