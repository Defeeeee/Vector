from litestar import Controller, get, post, patch, delete, Request
from litestar.exceptions import NotFoundException
from supabase import Client
from typing import List
from uuid import UUID
import asyncio
import re

from src.models.aircraft import Aircraft, AircraftCreate, AircraftUpdate, AvionesDelLibro
from src.auth.guards import auth_guard
from src.services.avisos import armar_aviso, enviar_aviso


def clave_de_matricula(registration: str) -> str:
    """La matrícula como se compara: sin guiones ni espacios, en mayúsculas ("lv-abc" = "LVABC")."""
    return re.sub(r"[^A-Z0-9]", "", (registration or "").upper())


def datos_completos(fila: dict) -> bool:
    """
    Qué es un avión completo: lo que el formulario del Hangar pide como obligatorio —matrícula,
    marca y modelo, tipo OACI— más la categoría. La potencia y la performance son opcionales.
    """
    return all(str(fila.get(c) or "").strip() for c in ("registration", "type", "icao", "type_acft"))

class AircraftController(Controller):
    path = "/aircraft"
    guards = [auth_guard]

    @get()
    async def list_aircraft(self, request: Request, supabase_client: Client) -> List[Aircraft]:
        """Fetch all aircraft belonging to the authenticated user."""
        user_id = str(request.state.user.id)
        response = supabase_client.table("aircraft").select("*").eq("user_id", user_id).execute()
        return [Aircraft(**data) for data in response.data]

    @get("/{aircraft_id:uuid}")
    async def get_aircraft(self, request: Request, supabase_client: Client, aircraft_id: UUID) -> Aircraft:
        """Fetch a specific aircraft by ID, scoped to the authenticated user."""
        user_id = str(request.state.user.id)
        response = supabase_client.table("aircraft").select("*").eq("id", str(aircraft_id)).eq("user_id", user_id).execute()
        if not response.data:
            raise NotFoundException(f"Aircraft with ID {aircraft_id} not found")
        return Aircraft(**response.data[0])

    @post()
    async def create_aircraft(self, request: Request, supabase_client: Client, data: AircraftCreate) -> Aircraft:
        """Create a new aircraft for the authenticated user."""
        insert_data = data.model_dump()
        # Antes de la migración 059 la columna no existe: sólo se manda cuando importa (false).
        if insert_data.get("datos_completos", True):
            insert_data.pop("datos_completos", None)
        # Ensure the aircraft is linked to the authenticated user's UUID
        insert_data["user_id"] = str(request.state.user.id)
        
        response = supabase_client.table("aircraft").insert(insert_data).execute()
        return Aircraft(**response.data[0])

    @patch("/{aircraft_id:uuid}")
    async def update_aircraft(self, request: Request, supabase_client: Client, aircraft_id: UUID, data: AircraftUpdate) -> Aircraft:
        """Update a specific aircraft."""
        user_id = str(request.state.user.id)
        update_data = data.model_dump(exclude_unset=True)
        response = supabase_client.table("aircraft").update(update_data).eq("id", str(aircraft_id)).eq("user_id", user_id).execute()
        if not response.data:
            raise NotFoundException(f"Aircraft with ID {aircraft_id} not found or permission denied")
        fila = response.data[0]
        # Un avión agregado desde el libro queda completo al guardar lo que le faltaba.
        if fila.get("datos_completos") is False and ("icao" in update_data or "type_acft" in update_data) and datos_completos(fila):
            listo = supabase_client.table("aircraft").update({"datos_completos": True}).eq("id", str(aircraft_id)).eq("user_id", user_id).execute()
            if listo.data:
                fila = listo.data[0]
        return Aircraft(**fila)

    @post("/desde-libro")
    async def crear_desde_libro(self, request: Request, supabase_client: Client, data: AvionesDelLibro) -> List[Aircraft]:
        """
        Los aviones de un libro importado que no están en el Hangar (migración 059).

        Se crean con matrícula y modelo, marcados como incompletos, y sirven para que los vuelos
        importados ya tengan avión. **Idempotente por matrícula**: si ya existe (por un reintento
        o porque el piloto lo cargó mientras tanto), se devuelve el que está, sin duplicar.
        Devuelve uno por cada matrícula pedida, en el mismo orden. Si se creó alguno, avisa por
        push (si el piloto los tiene prendidos): "Agregamos N aviones de tu libro".
        """
        user_id = str(request.state.user.id)

        def _crear() -> tuple[List[dict], int]:
            existentes = supabase_client.table("aircraft").select("*").eq("user_id", user_id).execute().data or []
            por_clave = {clave_de_matricula(a["registration"]): a for a in existentes}
            salida: List[dict] = []
            nuevos = 0
            for a in data.aviones:
                clave = clave_de_matricula(a.registration)
                if not clave:
                    continue
                fila = por_clave.get(clave)
                if fila is None:
                    insertar = {
                        "user_id": user_id,
                        "registration": a.registration.upper(),
                        "icao": a.icao.upper(),
                        "type": a.type,
                        "type_acft": a.type_acft,
                        "is_simulator": a.is_simulator,
                    }
                    # Si el libro trajo todo (modelo, OACI y clase), ya está completo: no se lo pide.
                    insertar["datos_completos"] = datos_completos(insertar)
                    fila = supabase_client.table("aircraft").insert(insertar).execute().data[0]
                    por_clave[clave] = fila
                    nuevos += 1
                salida.append(fila)
            return salida, nuevos

        filas, nuevos = await asyncio.to_thread(_crear)
        if nuevos:
            aviso = armar_aviso("aviones_del_libro", "", texto=str(nuevos))
            enviar_aviso(user_id, aviso)
        return [Aircraft(**f) for f in filas]

    @delete("/{aircraft_id:uuid}")
    async def delete_aircraft(self, request: Request, supabase_client: Client, aircraft_id: UUID) -> None:
        """Delete a specific aircraft."""
        user_id = str(request.state.user.id)
        response = supabase_client.table("aircraft").delete().eq("id", str(aircraft_id)).eq("user_id", user_id).execute()
        if not response.data:
            raise NotFoundException(f"Aircraft with ID {aircraft_id} not found or permission denied")
