"""
Las firmas de los certificantes y el dorso de cada hoja del libro (migración 047).

Usa el cliente por usuario: lo que protege es el RLS de la 047; el filtro por `user_id` igual
va. **Estas imágenes sólo sirven para el PDF del libro del piloto**: no hay ningún endpoint
público ni ninguna que las comparta.
"""
from typing import List, Optional
from uuid import UUID

from litestar import Controller, Request, delete, get, patch, post, put
from litestar.exceptions import ClientException, NotFoundException
from supabase import Client

from src.auth.guards import auth_guard
from src.models.firmas import (
    MAX_ALIAS,
    MAX_VUELOS_POR_PEDIDO,
    AsignacionResultado,
    AsignarVuelos,
    AvisoVuelo,
    CertificanteBreve,
    DorsoHoja,
    DorsoHojaIn,
    FirmaCertificante,
    FirmaCertificanteEdicion,
    FirmaCertificanteIn,
    SugerenciaCertificante,
    limpiar_alias,
)
from src.services import certificantes as svc

COLUMNAS_CERTIFICANTE = "id,nombre,licencia,autoridad_id,png,alias,png_sello,automatica,updated_at"

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
            .select(COLUMNAS_CERTIFICANTE)
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
        fila = {
            "user_id": user_id,
            "nombre": data.nombre,
            "licencia": data.licencia,
            "autoridad_id": data.autoridad_id,
            "png": data.png,
        }
        # Lo nuevo de la 048 sólo se escribe si vino: guardar de nuevo una firma no borra los alias.
        for campo in ("alias", "png_sello", "automatica"):
            if campo in data.model_fields_set:
                fila[campo] = getattr(data, campo)
        resp = (
            supabase_client.table("firmas_certificantes")
            .upsert(fila, on_conflict="user_id,nombre")
            .execute()
        )
        if not resp.data:
            raise ClientException(detail="No se pudo guardar la firma.")
        return FirmaCertificante(**resp.data[0])

    @get("/certificantes/nombres")
    async def nombres_certificantes(self, request: Request, supabase_client: Client) -> List[CertificanteBreve]:
        """Las personas sin sus imágenes (decenas de KB cada una): para elegir una en un vuelo."""
        user_id = str(request.state.user.id)
        return [CertificanteBreve(**p) for p in sorted(_personas(supabase_client, user_id), key=lambda p: p["nombre"])]

    @get("/certificantes/sugerencias")
    async def sugerencias_certificantes(self, request: Request, supabase_client: Client) -> List[SugerenciaCertificante]:
        """
        Por cada nombre que aparece en vuelos sin certificante asignado y que es de una persona
        guardada (o de uno de sus alias), con los vuelos. Sólo lee: asignar es un toque del piloto.
        """
        user_id = str(request.state.user.id)
        personas = _personas(supabase_client, user_id)
        if not personas:
            return []
        vuelos = (
            supabase_client.table("flights")
            .select("id,cad_autoridad_nombre,certificante_id")
            .eq("user_id", user_id)
            .is_("certificante_id", "null")
            .execute()
        )
        return [SugerenciaCertificante(**s) for s in svc.sugerencias(personas, vuelos.data or [])]

    @patch("/certificantes/{firma_id:uuid}")
    async def editar_certificante(
        self, request: Request, supabase_client: Client, firma_id: UUID, data: FirmaCertificanteEdicion
    ) -> FirmaCertificante:
        user_id = str(request.state.user.id)
        cambios = data.model_dump(exclude_unset=True)
        # Los que no admiten null: mandarlo no es "quitar", es un error.
        for campo in ("nombre", "png", "alias", "automatica"):
            if campo in cambios and cambios[campo] is None:
                raise ClientException(detail=f"El campo {campo} no puede ir vacío.")
        if not cambios:
            raise ClientException(detail="No hay nada para cambiar.")
        resp = (
            supabase_client.table("firmas_certificantes")
            .update(cambios)
            .eq("id", str(firma_id))
            .eq("user_id", user_id)
            .execute()
        )
        if not resp.data:
            raise NotFoundException("Esa firma no existe.")
        return FirmaCertificante(**resp.data[0])

    @post("/certificantes/{firma_id:uuid}/vuelos")
    async def asignar_vuelos(
        self, request: Request, supabase_client: Client, firma_id: UUID, data: AsignarVuelos
    ) -> AsignacionResultado:
        """
        Pone a esta persona como quien certificó esos vuelos (sólo los del piloto), con la
        anulación `firma` (null = lo que diga la persona). Un vuelo sin certificante para el CAD
        toma el nombre de la persona; **uno que ya dice otro nombre no se pisa**: va un aviso.
        """
        user_id = str(request.state.user.id)
        persona = _persona(supabase_client, user_id, firma_id)
        ids = list(dict.fromkeys(str(v) for v in data.vuelo_ids))
        vuelos = (
            supabase_client.table("flights")
            .select("id,cad_autoridad_nombre,cad_autoridad_id")
            .eq("user_id", user_id)
            .in_("id", ids)
            .execute()
        ).data or []
        if len(vuelos) != len(ids):
            raise NotFoundException("Alguno de esos vuelos no existe.")

        supabase_client.table("flights").update(
            {"certificante_id": str(firma_id), "certificante_firma": data.firma}
        ).eq("user_id", user_id).in_("id", ids).execute()

        avisos: List[AvisoVuelo] = []
        a_completar: dict = {}
        for v in vuelos:
            cambios, aviso = svc.completar_autoridad(v, persona)
            if aviso:
                avisos.append(AvisoVuelo(vuelo_id=v["id"], mensaje=aviso))
            elif cambios:
                a_completar[v["id"]] = cambios
        # Casi todos llevan lo mismo (el nombre de la persona y su cargo): un update por grupo.
        grupos: dict = {}
        for vid, cambios in a_completar.items():
            grupos.setdefault(tuple(sorted(cambios.items())), []).append(vid)
        for cambios, vids in grupos.items():
            supabase_client.table("flights").update(dict(cambios)).eq("user_id", user_id).in_("id", vids).execute()

        if data.sumar_alias:
            nuevo = limpiar_alias(list(persona.get("alias") or []) + [data.sumar_alias]) or []
            if len(nuevo) > MAX_ALIAS:
                raise ClientException(detail=f"Hasta {MAX_ALIAS} alias por persona.")
            conocidos = {svc.normalizar(persona["nombre"])} | set(persona.get("alias") or [])
            if svc.normalizar(data.sumar_alias) not in conocidos:
                supabase_client.table("firmas_certificantes").update({"alias": nuevo}).eq("id", str(firma_id)).eq(
                    "user_id", user_id
                ).execute()
        return AsignacionResultado(asignados=len(ids), completados=len(a_completar), avisos=avisos)

    @delete("/certificantes/vuelos", status_code=200)
    async def desasociar_vuelos(
        self, request: Request, supabase_client: Client, vuelo_ids: str
    ) -> dict:
        """
        Le saca el certificante a los vuelos (`?vuelo_ids=a,b,c`). No toca `cad_autoridad_*`:
        lo que se completó para el CAD queda, y se cambia desde el vuelo.
        """
        user_id = str(request.state.user.id)
        try:
            ids = list(dict.fromkeys(str(UUID(x.strip())) for x in vuelo_ids.split(",") if x.strip()))
        except ValueError:
            raise ClientException(detail="Los vuelos no son válidos.")
        if not ids or len(ids) > MAX_VUELOS_POR_PEDIDO:
            raise ClientException(detail=f"Elegí de 1 a {MAX_VUELOS_POR_PEDIDO} vuelos.")
        resp = (
            supabase_client.table("flights")
            .update({"certificante_id": None, "certificante_firma": None})
            .eq("user_id", user_id)
            .in_("id", ids)
            .execute()
        )
        return {"desasociados": len(resp.data or [])}

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
            .select("id,logbook_id,hoja,png,aclaracion,fecha,certificante_ids")
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
        elegidos = [str(c) for c in dict.fromkeys(data.certificante_ids or [])]
        if not data.png and not data.aclaracion and not data.fecha and not elegidos:
            raise ClientException(detail="No hay nada para guardar en el dorso.")
        if elegidos:
            propios = (
                supabase_client.table("firmas_certificantes")
                .select("id")
                .eq("user_id", user_id)
                .in_("id", elegidos)
                .execute()
            ).data or []
            if len(propios) != len(elegidos):
                raise NotFoundException("Alguna de esas firmas no existe.")
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
                    "certificante_ids": elegidos,
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


def _personas(supabase_client: Client, user_id: str) -> List[dict]:
    """Las personas del piloto, sin las imágenes: para comparar nombres no hacen falta."""
    resp = (
        supabase_client.table("firmas_certificantes")
        .select("id,nombre,licencia,autoridad_id,alias,automatica")
        .eq("user_id", user_id)
        .limit(LIMITE_CERTIFICANTES)
        .execute()
    )
    return list(resp.data or [])


def _persona(supabase_client: Client, user_id: str, firma_id: UUID) -> dict:
    """Una persona **del mismo piloto**, o 404: nunca se asigna el certificante de otro."""
    resp = (
        supabase_client.table("firmas_certificantes")
        .select("id,nombre,licencia,autoridad_id,alias,automatica")
        .eq("id", str(firma_id))
        .eq("user_id", user_id)
        .execute()
    )
    if not resp.data:
        raise NotFoundException("Esa persona no existe.")
    return resp.data[0]
