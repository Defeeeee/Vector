import asyncio
import datetime as dt
import hmac
from typing import Any, Dict, List, Optional
from uuid import UUID

from litestar import Controller, Request, delete, get, patch, post, put
from litestar.exceptions import ClientException, NotAuthorizedException, NotFoundException
from pydantic import BaseModel, Field
from supabase import Client

from src.auth.guards import auth_guard
from src.config import settings
from src.services.avisos import armar_aviso_respuesta_plan, enviar_aviso
from src.services.recordatorio_plan import armar_pendientes
from src.supabase_client import SupabaseManager
from src.models.plan_vuelo import (
    FirmaPlanVuelo,
    PlanVuelo,
    PlanVueloCreate,
    PlanVueloResumen,
    PlanVueloUpdate,
    RespuestaEntrante,
    RespuestaPlan,
    MAX_ENVIOS,
    resumen_para_lista,
)

#: Cuántos planes trae la lista. FPL.AR muestra 30 en su plan pago; un piloto que vuela
#: tres veces por semana llega a 50 en cuatro meses.
LIMITE_LISTA = 50

COLUMNAS_LISTA = (
    "id,aircraft_id,completo,salida,destino,matricula,dof,eobt,descargado_at,enviado_at,"
    "vuelo_id,cancelado_at,descartado_at,respuesta_estado,respuesta_at,created_at,updated_at"
)


def _leer_plan(supabase_client: Client, user_id: str, plan_id: UUID) -> PlanVuelo:
    """
    El plan del piloto. Función aparte porque un route handler de Litestar no se puede llamar
    desde otro (`self.leer(...)` es el handler, no el método): así el PATCH de un envío daba 500
    y ningún envío quedaba anotado, aunque el mail saliera (arreglado el 2026-11-12).
    """
    resp = (
        supabase_client.table("planes_de_vuelo")
        .select("*")
        .eq("id", str(plan_id))
        .eq("user_id", user_id)
        .execute()
    )
    if not resp.data:
        raise NotFoundException("Ese plan de vuelo no existe.")
    return PlanVuelo(**resp.data[0])


class PlanesDeVueloController(Controller):
    """
    Los planes de vuelo (FPL) guardados del piloto, y su firma.

    Usa el cliente por usuario: lo que protege es el RLS de la migración 024, no un
    `eq("user_id", ...)`. El filtro igual va, para que la consulta use el índice.

    **Un plan de vuelo no es un vuelo**: nada de acá toca `flights` ni el saldo.
    """

    path = "/planes-de-vuelo"
    guards = [auth_guard]

    @get()
    async def listar(self, request: Request, supabase_client: Client) -> List[PlanVueloResumen]:
        user_id = str(request.state.user.id)
        resp = (
            supabase_client.table("planes_de_vuelo")
            .select(COLUMNAS_LISTA)
            .eq("user_id", user_id)
            .order("updated_at", desc=True)
            .limit(LIMITE_LISTA)
            .execute()
        )
        return [PlanVueloResumen(**fila) for fila in (resp.data or [])]

    @get("/{plan_id:uuid}")
    async def leer(self, request: Request, supabase_client: Client, plan_id: UUID) -> PlanVuelo:
        return _leer_plan(supabase_client, str(request.state.user.id), plan_id)

    @get("/{plan_id:uuid}/respuestas")
    async def respuestas(self, request: Request, supabase_client: Client, plan_id: UUID) -> List[RespuestaPlan]:
        """Lo que contestó la oficina, la más nueva primero. Las protege el RLS (migración 043)."""
        user_id = str(request.state.user.id)
        resp = (
            supabase_client.table("planes_respuestas")
            .select("id,plan_id,de,asunto,texto,clasificacion,de_oficina,recibido_at")
            .eq("plan_id", str(plan_id))
            .eq("user_id", user_id)
            .order("recibido_at", desc=True)
            .limit(50)
            .execute()
        )
        return [RespuestaPlan(**fila) for fila in (resp.data or [])]

    @post()
    async def crear(self, request: Request, supabase_client: Client, data: PlanVueloCreate) -> PlanVuelo:
        user_id = str(request.state.user.id)
        fila: Dict[str, Any] = {
            "user_id": user_id,
            "formulario": data.formulario,
            "completo": data.completo,
            "aircraft_id": str(data.aircraft_id) if data.aircraft_id else None,
            **resumen_para_lista(data.formulario),
        }
        resp = supabase_client.table("planes_de_vuelo").insert(fila).execute()
        if not resp.data:
            raise ClientException(detail="No se pudo guardar el plan de vuelo.")
        return PlanVuelo(**resp.data[0])

    @patch("/{plan_id:uuid}")
    async def actualizar(
        self, request: Request, supabase_client: Client, plan_id: UUID, data: PlanVueloUpdate
    ) -> PlanVuelo:
        user_id = str(request.state.user.id)
        cambios: Dict[str, Any] = {}
        enviados = data.model_dump(exclude_unset=True, mode="json")
        if "formulario" in enviados and data.formulario is not None:
            cambios["formulario"] = data.formulario
            cambios.update(resumen_para_lista(data.formulario))
        if "aircraft_id" in enviados:
            cambios["aircraft_id"] = enviados["aircraft_id"]
        if data.completo is not None:
            cambios["completo"] = data.completo
        if data.descargado:
            # La hora del servidor: que no dependa del reloj del teléfono.
            cambios["descargado_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
        if data.vuelo_id is not None:
            # El RLS de `flights` sólo deja ver los del piloto: si no aparece, no es suyo.
            vuelo = (
                supabase_client.table("flights")
                .select("id")
                .eq("id", str(data.vuelo_id))
                .eq("user_id", user_id)
                .execute()
            )
            if not vuelo.data:
                raise ClientException(detail="Ese vuelo no existe.")
            cambios["vuelo_id"] = str(data.vuelo_id)
        if data.cancelado:
            cambios["cancelado_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
        if data.descartado:
            cambios["descartado_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
        if "demoras" in enviados and data.demoras is not None:
            cambios["demoras"] = enviados["demoras"]
        if data.envio is not None:
            actual = _leer_plan(supabase_client, user_id, plan_id)
            if len(actual.envios) >= MAX_ENVIOS:
                raise ClientException(detail=f"Este plan ya se mandó {MAX_ENVIOS} veces.")
            ahora = dt.datetime.now(dt.timezone.utc).isoformat()
            envio = {**data.envio.model_dump(mode="json", exclude={"at"}), "at": ahora}
            cambios["envios"] = [e.model_dump(mode="json") for e in actual.envios] + [envio]
            if data.envio.modo == "aro":
                cambios["enviado_at"] = ahora
        if not cambios:
            return _leer_plan(supabase_client, user_id, plan_id)

        resp = (
            supabase_client.table("planes_de_vuelo")
            .update(cambios)
            .eq("id", str(plan_id))
            .eq("user_id", user_id)
            .execute()
        )
        if not resp.data:
            raise NotFoundException("Ese plan de vuelo no existe.")
        return PlanVuelo(**resp.data[0])

    @delete("/{plan_id:uuid}")
    async def borrar(self, request: Request, supabase_client: Client, plan_id: UUID) -> None:
        user_id = str(request.state.user.id)
        resp = (
            supabase_client.table("planes_de_vuelo")
            .delete()
            .eq("id", str(plan_id))
            .eq("user_id", user_id)
            .execute()
        )
        if not resp.data:
            raise NotFoundException("Ese plan de vuelo no existe.")

    # ------------------------------------------------------------------ firma

    @get("/firma")
    async def leer_firma(self, request: Request, supabase_client: Client) -> Optional[FirmaPlanVuelo]:
        user_id = str(request.state.user.id)
        resp = (
            supabase_client.table("firmas_plan_vuelo").select("png").eq("user_id", user_id).execute()
        )
        return FirmaPlanVuelo(png=resp.data[0]["png"]) if resp.data else None

    @put("/firma")
    async def guardar_firma(
        self, request: Request, supabase_client: Client, data: FirmaPlanVuelo
    ) -> FirmaPlanVuelo:
        user_id = str(request.state.user.id)
        resp = (
            supabase_client.table("firmas_plan_vuelo")
            .upsert(
                {"user_id": user_id, "png": data.png, "updated_at": dt.datetime.now(dt.timezone.utc).isoformat()},
                on_conflict="user_id",
            )
            .execute()
        )
        if not resp.data:
            raise ClientException(detail="No se pudo guardar la firma.")
        return FirmaPlanVuelo(png=resp.data[0]["png"])

    @delete("/firma")
    async def borrar_firma(self, request: Request, supabase_client: Client) -> None:
        user_id = str(request.state.user.id)
        supabase_client.table("firmas_plan_vuelo").delete().eq("user_id", user_id).execute()


def envios_a_oficina(envios: Any) -> List[str]:
    """Las direcciones a las que se mandó el plan a la oficina (no las pruebas, que van al piloto)."""
    return sorted(
        {
            str(e["a"]).strip().lower()
            for e in (envios if isinstance(envios, list) else [])
            if isinstance(e, dict) and e.get("modo") == "aro" and isinstance(e.get("a"), str) and "@" in e["a"]
        }
    )


class PlanesEnviados(BaseModel):
    ids: List[UUID] = Field(default_factory=list, max_length=500)


#: Hasta cuántos días atrás (por la DOF/) un plan puede necesitar el mail.
DIAS_RECORDATORIO = 2


class PlanesRecordatoriosController(Controller):
    """
    El mail "¿Cargamos tu vuelo?" de los planes presentados (`services/recordatorio_plan.py`).

    Sin sesión, con el secreto de los barridos (`X-Cron-Secret`), como
    `/onboarding/recordatorios`: un cron no tiene sesión. Usa el cliente de servicio porque
    lee planes de todos los pilotos; por eso devuelve sólo lo que el mail necesita.
    """

    path = "/planes-de-vuelo/recordatorios"

    def _verificar(self, request: Request) -> None:
        esperado = settings.documents_alert_secret
        recibido = request.headers.get("X-Cron-Secret") or ""
        if not esperado:
            raise NotAuthorizedException("El barrido no está configurado.")
        if not recibido or not hmac.compare_digest(recibido, esperado):
            raise NotAuthorizedException("Invalid secret token.")

    @get()
    async def pendientes(self, request: Request) -> List[Dict[str, Any]]:
        self._verificar(request)
        cliente = SupabaseManager.get_service_client()
        hoy = dt.datetime.now(dt.timezone.utc).date()
        desde = hoy - dt.timedelta(days=DIAS_RECORDATORIO)

        def _planes() -> List[Dict[str, Any]]:
            return (
                cliente.table("planes_de_vuelo")
                .select("id,user_id,formulario,demoras")
                .eq("completo", True)
                .is_("vuelo_id", "null")
                .is_("cancelado_at", "null")
                .is_("descartado_at", "null")
                .is_("recordatorio_at", "null")
                .gte("dof", desde.isoformat())
                .lte("dof", hoy.isoformat())
                .or_("enviado_at.not.is.null,descargado_at.not.is.null")
                .limit(200)
                .execute()
                .data
                or []
            )

        planes = await asyncio.to_thread(_planes)
        ids = sorted({str(p["user_id"]) for p in planes})
        if not ids:
            return []

        def _resto():
            admin = cliente.auth.admin
            usuarios = {}
            for uid in ids:
                u = getattr(admin.get_user_by_id(uid), "user", None)
                if u:
                    usuarios[uid] = {"email": getattr(u, "email", None), "email_confirmed_at": getattr(u, "email_confirmed_at", None)}
            perfiles = {str(p["id"]): p for p in (cliente.table("profiles").select("id,first_name").in_("id", ids).execute().data or [])}
            vuelos = (
                cliente.table("flights")
                .select("user_id,date,route")
                .in_("user_id", ids)
                .gte("date", (desde - dt.timedelta(days=1)).isoformat())
                .execute()
                .data
                or []
            )
            return usuarios, perfiles, vuelos

        usuarios, perfiles, vuelos = await asyncio.to_thread(_resto)
        return armar_pendientes(planes, usuarios, perfiles, vuelos)

    @post("/enviados", status_code=200)
    async def marcar(self, request: Request, data: PlanesEnviados) -> Dict[str, int]:
        """Marca los planes cuyo mail salió: no se vuelven a elegir."""
        self._verificar(request)
        if not data.ids:
            return {"marcados": 0}
        cliente = SupabaseManager.get_service_client()
        ahora = dt.datetime.now(dt.timezone.utc).isoformat()
        resp = await asyncio.to_thread(
            lambda: cliente.table("planes_de_vuelo")
            .update({"recordatorio_at": ahora})
            .in_("id", [str(i) for i in data.ids])
            .execute()
        )
        return {"marcados": len(resp.data or [])}



class PlanesRespuestasInternoController(Controller):
    """
    Lo que la web le pide al backend cuando la oficina contesta un plan (el webhook
    `email.received` de Resend, `apps/web/src/app/api/mail/entrante`).

    Sin sesión, con el secreto de los barridos (`X-Cron-Secret`), como los recordatorios.
    La web ya verificó la firma de Svix y la de la dirección del plan; acá se guarda y se
    avisa. Usa el cliente de servicio: escribe en nombre del dueño del plan.
    """

    path = "/planes-de-vuelo/interno"

    def _verificar(self, request: Request) -> None:
        esperado = settings.documents_alert_secret
        recibido = request.headers.get("X-Cron-Secret") or ""
        if not esperado:
            raise NotAuthorizedException("El webhook no está configurado.")
        if not recibido or not hmac.compare_digest(recibido, esperado):
            raise NotAuthorizedException("Invalid secret token.")

    @get("/{plan_id:uuid}")
    async def plan(self, request: Request, plan_id: UUID) -> Dict[str, Any]:
        """Del plan, lo que hace falta para decidir si un mail es de su oficina."""
        self._verificar(request)
        cliente = SupabaseManager.get_service_client()

        def _leer():
            filas = (
                cliente.table("planes_de_vuelo").select("user_id,envios").eq("id", str(plan_id)).execute().data or []
            )
            if not filas:
                return None
            usuario = getattr(cliente.auth.admin.get_user_by_id(str(filas[0]["user_id"])), "user", None)
            return filas[0], getattr(usuario, "email", None)

        leido = await asyncio.to_thread(_leer)
        if leido is None:
            raise NotFoundException("Ese plan de vuelo no existe.")
        fila, email = leido
        return {"email": email, "envios_a_oficina": envios_a_oficina(fila.get("envios"))}

    @post("/{plan_id:uuid}/respuestas", status_code=200)
    async def registrar(self, request: Request, plan_id: UUID, data: RespuestaEntrante) -> Dict[str, bool]:
        """
        Guarda la respuesta (una sola vez por `email_id`) y, si es de la oficina, anota el
        estado en el plan y avisa al dueño por push.
        """
        self._verificar(request)
        cliente = SupabaseManager.get_service_client()

        def _guardar():
            plan = (
                cliente.table("planes_de_vuelo")
                .select("user_id,matricula,salida,destino")
                .eq("id", str(plan_id))
                .execute()
                .data
                or []
            )
            if not plan:
                return None
            if cliente.table("planes_respuestas").select("id").eq("email_id", data.email_id).execute().data:
                return plan[0], True
            try:
                cliente.table("planes_respuestas").insert(
                    {
                        "plan_id": str(plan_id),
                        "user_id": plan[0]["user_id"],
                        "email_id": data.email_id,
                        "de": data.de,
                        "asunto": data.asunto,
                        "texto": data.texto,
                        "clasificacion": data.clasificacion,
                        "de_oficina": data.avisar,
                    }
                ).execute()
            except Exception as exc:  # noqa: BLE001 — un reintento simultáneo cae en el índice único
                if "duplicate" in str(exc).lower() or "23505" in str(exc):
                    return plan[0], True
                raise
            if data.avisar:
                cliente.table("planes_de_vuelo").update(
                    {"respuesta_estado": data.clasificacion, "respuesta_at": dt.datetime.now(dt.timezone.utc).isoformat()}
                ).eq("id", str(plan_id)).execute()
            return plan[0], False

        guardado = await asyncio.to_thread(_guardar)
        if guardado is None:
            raise NotFoundException("Ese plan de vuelo no existe.")
        plan, duplicada = guardado
        if not duplicada and data.avisar:
            enviar_aviso(
                str(plan["user_id"]),
                armar_aviso_respuesta_plan(
                    str(plan_id),
                    matricula=plan.get("matricula"),
                    salida=plan.get("salida"),
                    destino=plan.get("destino"),
                    clasificacion=data.clasificacion,
                    oficina=data.de,
                    resumen=data.resumen or data.texto,
                ),
            )
        return {"duplicada": duplicada}
