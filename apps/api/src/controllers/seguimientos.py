"""
Seguir el vuelo en vivo (migración 041, `services/seguimientos.py`).

- `POST /seguimientos`, `POST /seguimientos/{id}/posicion`, `.../ruta`, `.../matricula` y `.../terminar`: con sesión, del
  piloto, contra su RLS. Lo llama el Mapa en modo vuelo ("Compartir mi vuelo").
- `GET /publico/seguimientos/{token}`: **sin guard**, lo que abre el link que se manda por
  WhatsApp. Lee con el service role y devuelve `vista_publica`, una lista fija de campos.
  Un token que no existe y uno que ya no se puede ver dan el mismo 404.

- `POST /seguimientos/desde-plan` y `GET /seguimientos/de-plan/{plan_id}` (migración 045): compartir un
  plan de vuelo sin el teléfono. La matrícula, la salida y la duración salen **del plan guardado**,
  no del pedido.
- En la lectura pública, si el seguimiento tiene matrícula para ADS-B se leen las posiciones de
  `adsb_posiciones` de su ventana y se las junta con las del teléfono (`services/seguimientos.py`).
  Si un plan aterrizó, el primero que mira lo termina.

- **Varios a la vez** (migración 055): hasta `TOPE_ACTIVOS` por cuenta. `POST /seguimientos` crea siempre
  uno nuevo (la web retoma el suyo por `localStorage`); `desde-plan` busca el existente por `plan_id`;
  `POST /seguimientos/sin-plan` comparte un vuelo sin ruta (origen, destino y horario); y
  `GET /seguimientos/activos` lista los del piloto para su pantalla.

Una posición es de pantalla prendida: el teléfono no le da el GPS a una página en segundo plano.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
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
    RutaNueva,
    SeguimientoCrear,
    SeguimientoDesdePlan,
    SeguimientoSinPlan,
    agregar_al_recorrido,
    anotar_vista,
    duracion_del_plan,
    esta_activo,
    evaluar_vuelo,
    matricula_para_adsb,
    mensaje_del_tope,
    nombre_de_pila,
    puntos_sin_plan,
    resumen_de_activo,
    ruta_sin_plan,
    nuevo_token,
    puede_aceptar_posicion,
    resumen_de_vistas,
    salida_aceptable,
    salida_del_plan,
    vence_en,
    vencimiento_desde_plan,
    visible,
    vista_publica,
)
from src.services.avisos import avisos_configurados, en_segundo_plano
from src.services.avisos_seguimiento import (
    TOPE_SUSCRIPCIONES,
    BajaAvisoIn,
    SuscripcionAvisoIn,
    avisar_fin_manual,
    leer_adsb,
)
from src.config import settings
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
    #: Migración 045: la salida prevista, si es un seguimiento desde un plan.
    salida_prevista: Optional[str] = None


class PosicionAceptada(BaseModel):
    #: False si llegó antes de los 10 s de la anterior: no es un error, se ignora.
    aceptada: bool
    vence_at: str
    #: Migración 044, **sólo para el piloto**: cuántos ids distintos consultaron el link en los
    #: últimos 45 s, cuántos desde que empezó y cuándo fue la última vez. `ahora` es la hora del
    #: servidor, para escribir "hace 3 min" sin depender del reloj del teléfono.
    mirando_ahora: int = 0
    vistos_total: int = 0
    ultima_vista_at: Optional[str] = None
    ahora: Optional[str] = None


def _cerrar_vencidos(tabla: Any, user_id: str, ahora: datetime) -> None:
    tabla().update({"terminado_at": ahora.isoformat()}).eq("user_id", user_id).is_("terminado_at", "null").lte(
        "vence_at", ahora.isoformat()
    ).execute()


def _controlar_tope(tabla: Any, user_id: str) -> None:
    """Un 400 claro si la cuenta ya tiene `TOPE_ACTIVOS` sin terminar (los vencidos ya se cerraron)."""
    cuenta = tabla().select("id", count="exact", head=True).eq("user_id", user_id).is_("terminado_at", "null").execute()
    motivo = mensaje_del_tope(cuenta.count or 0)
    if motivo:
        raise ClientException(detail=motivo, status_code=400)


class SeguimientosController(Controller):
    path = "/seguimientos"
    guards = [auth_guard]

    @post(status_code=200)
    async def crear(self, request: Request, supabase_client: Client, data: SeguimientoCrear) -> SeguimientoCreado:
        user_id = str(request.state.user.id)
        ahora = _ahora()

        def _crear() -> SeguimientoCreado:
            tabla = lambda: supabase_client.table("seguimientos_en_vivo")  # noqa: E731
            # Un seguimiento vencido que nadie terminó sigue "sin terminar" en la base: se cierra
            # acá, antes de contar los activos para el tope.
            _cerrar_vencidos(tabla, user_id, ahora)

            _controlar_tope(tabla, user_id)

            matricula = (data.avion.matricula if data.avion else "") or None
            # Para buscar el avión en ADS-B (migración 045): interna, nunca pública, aunque el
            # interruptor esté apagado. `avion_matricula` es la que se muestra.
            matricula_adsb = matricula_para_adsb(matricula)
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
                "matricula_adsb": matricula_adsb,
                "vence_at": vence_en(ahora).isoformat(),
            }
            r = tabla().insert(fila).execute()
            if not r.data:
                raise ClientException(detail="No se pudo empezar a compartir el vuelo.")
            f = r.data[0]
            return SeguimientoCreado(id=f["id"], token=f["token"], vence_at=f["vence_at"])

        return await asyncio.to_thread(_crear)

    @post("/desde-plan", status_code=200)
    async def desde_plan(self, request: Request, supabase_client: Client, data: SeguimientoDesdePlan) -> SeguimientoCreado:
        """
        Comparte un plan de vuelo sin el teléfono. Sólo el dueño del plan (el RLS lo esconde a los
        demás: un plan ajeno es un 404). El plan necesita matrícula (casilla 7) y salida; con
        ADS-B el link muestra el vuelo cuando el avión despega. Si ya hay un seguimiento de este
        plan sin terminar se lo actualiza con el plan de ahora (la salida pudo cambiar con una
        demora). Desde la 055 el "ya existe" es por plan: otro vuelo en marcha no lo impide (hay un tope de
        `TOPE_ACTIVOS` por cuenta). El vencimiento es la salida más la duración más un margen.
        """
        user_id = str(request.state.user.id)
        ahora = _ahora()

        def _crear() -> SeguimientoCreado:
            plan = (
                supabase_client.table("planes_de_vuelo")
                .select("id,matricula,dof,eobt,demoras,formulario,cancelado_at")
                .eq("id", str(data.plan_id))
                .eq("user_id", user_id)
                .limit(1)
                .execute()
                .data
                or []
            )
            if not plan:
                raise NotFoundException("Ese plan de vuelo no existe.")
            plan = plan[0]
            if plan.get("cancelado_at"):
                raise ClientException(detail="Ese plan está cancelado.", status_code=400)
            form = plan.get("formulario") if isinstance(plan.get("formulario"), dict) else {}
            texto_matricula = (plan.get("matricula") or form.get("matricula") or "").strip()
            matricula_adsb = matricula_para_adsb(texto_matricula)
            if not matricula_adsb:
                raise ClientException(detail="El plan no tiene matrícula (casilla 7).", status_code=400)
            salida = salida_del_plan(plan)
            if salida is None:
                raise ClientException(detail="El plan no tiene fecha y hora de salida.", status_code=400)
            motivo = salida_aceptable(salida, ahora)
            if motivo:
                raise ClientException(detail=motivo, status_code=400)
            duracion = duracion_del_plan(plan)
            vence = vencimiento_desde_plan(salida, duracion, ahora)
            mostrar = bool(data.mostrar_matricula)
            tabla = lambda: supabase_client.table("seguimientos_en_vivo")  # noqa: E731
            _cerrar_vencidos(tabla, user_id, ahora)

            cuerpo = {
                "ruta": data.ruta,
                "puntos": [[p.lat, p.lon, p.codigo, p.nombre] for p in data.puntos],
                "avion_tipo": (data.avion.tipo if data.avion else "") or None,
                "avion_icao": (data.avion.icao if data.avion else "") or None,
                "matricula_adsb": matricula_adsb,
                "plan_id": str(data.plan_id),
                "ruta_orientativa": False,
                "salida_prevista": salida.isoformat(),
                "duracion_prevista_min": duracion,
                "vence_at": vence.isoformat(),
            }

            def _activo() -> List[Dict[str, Any]]:
                return (
                    tabla()
                    .select("id,token,vence_at,mostrar_matricula,plan_id")
                    .eq("user_id", user_id)
                    .eq("plan_id", str(data.plan_id))
                    .is_("terminado_at", "null")
                    .limit(1)
                    .execute()
                    .data
                    or []
                )

            def _respuesta(f: Dict[str, Any], ya: bool) -> SeguimientoCreado:
                return SeguimientoCreado(
                    id=f["id"],
                    token=f["token"],
                    vence_at=f["vence_at"],
                    ya_existia=ya,
                    mostrar_matricula=bool(f.get("mostrar_matricula")),
                    salida_prevista=f.get("salida_prevista") or salida.isoformat(),
                )

            existente = _activo()
            if existente:
                f = existente[0]
                cambios = dict(cuerpo)
                if f.get("mostrar_matricula"):
                    cambios["avion_matricula"] = texto_matricula[:12] or None
                r = tabla().update(cambios).eq("id", f["id"]).eq("user_id", user_id).execute()
                return _respuesta({**f, **(r.data[0] if r.data else cuerpo)}, True)

            _controlar_tope(tabla, user_id)
            fila = {
                "user_id": user_id,
                "token": nuevo_token(),
                "nombre": nombre_de_pila(
                    ((supabase_client.table("profiles").select("first_name").eq("id", user_id).limit(1).execute().data) or [{}])[0].get("first_name")
                ),
                **cuerpo,
                "mostrar_matricula": mostrar,
                "avion_matricula": (texto_matricula[:12] or None) if mostrar else None,
            }
            try:
                r = tabla().insert(fila).execute()
            except APIError:
                # Dos pedidos a la vez para el mismo plan: se devuelve el que ganó.
                otra = _activo()
                if otra:
                    return _respuesta(otra[0], True)
                raise
            if not r.data:
                raise ClientException(detail="No se pudo empezar a compartir el vuelo.")
            return _respuesta(r.data[0], False)

        return await asyncio.to_thread(_crear)

    @post("/sin-plan", status_code=200)
    async def sin_plan(self, request: Request, supabase_client: Client, data: SeguimientoSinPlan) -> SeguimientoCreado:
        """
        Comparte un vuelo **sin plan ni ruta** (migración 055): origen, destino y horario, para que la
        familia sepa más o menos qué esperar. El avión se lee de la base con la sesión del piloto
        (uno ajeno es un 404, un simulador un 400); la matrícula nunca viene del pedido. Con
        `seguimiento_id` se actualiza ese link —el token no cambia— si es del piloto, sigue sin
        terminar y es de los de sin plan. Si el avión tiene ADS-B, la familia lo ve volar.
        """
        user_id = str(request.state.user.id)
        ahora = _ahora()

        def _crear() -> SeguimientoCreado:
            avion = (
                supabase_client.table("aircraft")
                .select("id,registration,icao,type,is_simulator")
                .eq("id", str(data.aircraft_id))
                .eq("user_id", user_id)
                .limit(1)
                .execute()
                .data
                or []
            )
            if not avion:
                raise NotFoundException("Ese avión no existe.")
            avion = avion[0]
            if avion.get("is_simulator"):
                raise ClientException(detail="Un simulador no se comparte: no vuela.", status_code=400)
            texto_matricula = (avion.get("registration") or "").strip()
            matricula_adsb = matricula_para_adsb(texto_matricula)
            motivo = salida_aceptable(data.salida, ahora)
            if motivo:
                raise ClientException(detail=motivo, status_code=400)
            vence = vencimiento_desde_plan(data.salida, data.duracion_min, ahora)
            mostrar = bool(data.mostrar_matricula and texto_matricula)
            tabla = lambda: supabase_client.table("seguimientos_en_vivo")  # noqa: E731
            _cerrar_vencidos(tabla, user_id, ahora)

            cuerpo = {
                "ruta": ruta_sin_plan(data.origen, data.destino),
                "puntos": puntos_sin_plan(data.origen, data.destino),
                "ruta_orientativa": True,
                "plan_id": None,
                "avion_tipo": ((avion.get("type") or "")[:60]) or None,
                "avion_icao": ((avion.get("icao") or "")[:8]) or None,
                "matricula_adsb": matricula_adsb,
                "mostrar_matricula": mostrar,
                "avion_matricula": (texto_matricula[:12] or None) if mostrar else None,
                "salida_prevista": data.salida.isoformat(),
                "duracion_prevista_min": data.duracion_min,
                "vence_at": vence.isoformat(),
            }

            def _respuesta(f: Dict[str, Any], ya: bool) -> SeguimientoCreado:
                return SeguimientoCreado(
                    id=f["id"],
                    token=f["token"],
                    vence_at=f["vence_at"],
                    ya_existia=ya,
                    mostrar_matricula=bool(f.get("mostrar_matricula")),
                    salida_prevista=f.get("salida_prevista") or data.salida.isoformat(),
                )

            if data.seguimiento_id:
                previo = (
                    tabla()
                    .select("id,token,ruta_orientativa")
                    .eq("id", str(data.seguimiento_id))
                    .eq("user_id", user_id)
                    .is_("terminado_at", "null")
                    .limit(1)
                    .execute()
                    .data
                    or []
                )
                if not previo or not previo[0].get("ruta_orientativa"):
                    raise NotFoundException(_NO_EXISTE)
                r = tabla().update(cuerpo).eq("id", str(data.seguimiento_id)).eq("user_id", user_id).execute()
                if not r.data:
                    raise NotFoundException(_NO_EXISTE)
                return _respuesta(r.data[0], True)

            _controlar_tope(tabla, user_id)
            perfil = supabase_client.table("profiles").select("first_name").eq("id", user_id).limit(1).execute().data or []
            fila = {
                "user_id": user_id,
                "token": nuevo_token(),
                "nombre": nombre_de_pila(perfil[0].get("first_name") if perfil else None),
                **cuerpo,
            }
            r = tabla().insert(fila).execute()
            if not r.data:
                raise ClientException(detail="No se pudo empezar a compartir el vuelo.")
            return _respuesta(r.data[0], False)

        return await asyncio.to_thread(_crear)

    @get("/activos")
    async def activos(self, request: Request, supabase_client: Client) -> List[Dict[str, Any]]:
        """
        Los seguimientos del piloto que siguen sin terminar ni vencer (migración 055), para su pantalla
        "Compartir tu vuelo": link, ruta, salida, de dónde vienen y quién los mira. Sólo los suyos
        (`user_id` más el RLS), con la sesión; nada de esto sale a un link público.
        """
        user_id = str(request.state.user.id)
        ahora = _ahora()

        def _leer() -> List[Dict[str, Any]]:
            filas = (
                supabase_client.table("seguimientos_en_vivo")
                .select(
                    "id,token,ruta,puntos,salida_prevista,duracion_prevista_min,vence_at,terminado_at,plan_id,ruta_orientativa,"
                    "mostrar_matricula,avion_tipo,aterrizo_at,created_at,vistas,vistos_total,ultima_vista_at"
                )
                .eq("user_id", user_id)
                .is_("terminado_at", "null")
                .order("created_at", desc=True)
                .limit(50)
                .execute()
                .data
                or []
            )
            return [resumen_de_activo(f, ahora) for f in filas if esta_activo(f, ahora)]

        return await asyncio.to_thread(_leer)

    @get("/de-plan/{plan_id:uuid}")
    async def de_plan(self, request: Request, supabase_client: Client, plan_id: UUID) -> Dict[str, Any]:
        """
        El último seguimiento de este plan, para que el editor sepa si ya se está compartiendo y
        con qué link. 404 si nunca se compartió. `activo` es que sigue sin terminar ni vencer;
        `aterrizo_at` es que ADS-B lo vio tocar tierra. Trae también quién mira (migración 044).
        """
        user_id = str(request.state.user.id)
        ahora = _ahora()

        def _leer() -> Dict[str, Any]:
            filas = (
                supabase_client.table("seguimientos_en_vivo")
                .select("id,token,vence_at,terminado_at,aterrizo_at,mostrar_matricula,salida_prevista,vistas,vistos_total,ultima_vista_at")
                .eq("plan_id", str(plan_id))
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
                .data
                or []
            )
            if not filas:
                raise NotFoundException(_NO_EXISTE)
            f = filas[0]
            return {
                "id": f["id"],
                "token": f["token"],
                "vence_at": f["vence_at"],
                "activo": esta_activo(f, ahora),
                "aterrizo_at": f.get("aterrizo_at"),
                "terminado_at": f.get("terminado_at"),
                "mostrar_matricula": bool(f.get("mostrar_matricula")),
                "salida_prevista": f.get("salida_prevista"),
                **resumen_de_vistas(f, ahora),
            }

        return await asyncio.to_thread(_leer)

    @post("/{seguimiento_id:uuid}/posicion", status_code=200)
    async def posicion(
        self, request: Request, supabase_client: Client, seguimiento_id: UUID, data: PosicionEnVivo
    ) -> PosicionAceptada:
        user_id = str(request.state.user.id)
        ahora = _ahora()

        def _agregar() -> PosicionAceptada:
            tabla = supabase_client.table("seguimientos_en_vivo")
            filas = (
                tabla.select("vence_at,terminado_at,ultima_at,recorrido,vistas,vistos_total,ultima_vista_at")
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
                return PosicionAceptada(aceptada=False, vence_at=fila["vence_at"], **resumen_de_vistas(fila, ahora))
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
            return PosicionAceptada(aceptada=True, vence_at=fila["vence_at"], **resumen_de_vistas(fila, ahora))

        return await asyncio.to_thread(_agregar)

    @post("/{seguimiento_id:uuid}/ruta", status_code=200)
    async def ruta(self, request: Request, supabase_client: Client, seguimiento_id: UUID, data: RutaNueva) -> Dict[str, bool]:
        """
        Cambia la ruta y los puntos mientras se vuela ("directo a…"). Sólo el dueño (RLS más el
        `user_id`), y sólo si sigue en vuelo: terminado o vencido es un 410, como la posición.
        """
        user_id = str(request.state.user.id)
        ahora = _ahora()

        def _cambiar() -> None:
            tabla = supabase_client.table("seguimientos_en_vivo")
            filas = (
                tabla.select("vence_at,terminado_at").eq("id", str(seguimiento_id)).eq("user_id", user_id).limit(1).execute().data or []
            )
            if not filas:
                raise NotFoundException(_NO_EXISTE)
            if not esta_activo(filas[0], ahora):
                raise ClientException(detail="Este seguimiento ya terminó.", status_code=410)
            tabla.update(
                # Con una ruta de verdad cargada (el Mapa en vuelo), deja de ser "orientativa" (055).
                {"ruta": data.ruta, "puntos": [[p.lat, p.lon, p.codigo, p.nombre] for p in data.puntos], "ruta_orientativa": False}
            ).eq("id", str(seguimiento_id)).eq("user_id", user_id).execute()

        await asyncio.to_thread(_cambiar)
        return {"ok": True}

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
                # Quien pidió avisos se entera de que el vuelo terminó (migración 046). En segundo
                # plano y con el service role: las suscripciones no tienen política de lectura, y
                # nada de esto puede demorar ni tirar abajo el "Terminar" del piloto.
                fila = r.data[0]
                en_segundo_plano(lambda: avisar_fin_manual(SupabaseManager.get_service_client(), fila))
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


_leer_adsb = leer_adsb


def _token_con_forma(token: str) -> bool:
    return 32 <= len(token) <= 64 and all(c.isalnum() or c in "-_" for c in token)


class PushPublicoController(Controller):
    """`GET /publico/push/clave`, sin guard: la clave pública VAPID para quien mira un vuelo sin cuenta."""

    path = "/publico/push"

    @get("/clave")
    async def clave(self) -> Response[Dict[str, Optional[str]]]:
        # Sin las claves configuradas la página no ofrece avisos (como la red).
        valor = settings.vapid_public_key if avisos_configurados() else None
        return Response({"clave": valor}, headers={"Cache-Control": "no-store"})


class SeguimientosPublicosController(Controller):
    """`GET /publico/seguimientos/{token}`, sin guard: el link que se manda a la familia."""

    path = "/publico/seguimientos"

    @get("/{token:str}")
    async def ver(self, request: Request, token: str) -> Response[Dict[str, Any]]:
        # Un token con otra forma no puede existir: 404 sin ir a la base.
        if not (32 <= len(token) <= 64) or not all(c.isalnum() or c in "-_" for c in token):
            raise NotFoundException(_NO_EXISTE)
        ahora = _ahora()
        # Un id al azar del navegador de quien mira (migración 044). Sin él, o mal formado, la
        # consulta anda igual y no se anota. Ni IP ni user agent: no se leen.
        visitante = request.headers.get("x-visitante")

        def _leer() -> Dict[str, Any]:
            cliente = SupabaseManager.get_service_client()
            filas = (
                cliente.table("seguimientos_en_vivo")
                .select("nombre,ruta,puntos,created_at,avion_tipo,avion_icao,avion_matricula,mostrar_matricula,vence_at,terminado_at,ultima_lat,ultima_lon,ultima_alt_ft,ultima_gs_kt,ultima_track,ultima_at,recorrido,vistas,vistos_total,matricula_adsb,salida_prevista,aterrizo_at,ruta_orientativa")
                .eq("token", token)
                .limit(1)
                .execute()
                .data
                or []
            )
            if not filas or not visible(filas[0], ahora):
                raise NotFoundException(_NO_EXISTE)
            fila = filas[0]
            adsb = _leer_adsb(cliente, fila, ahora)
            # Un plan que aterrizó termina solo (migración 045): el primero que mira lo guarda.
            # Lo que se muestra sale de la misma cuenta, así que no depende de que el guardado ande.
            if fila.get("salida_prevista") and esta_activo(fila, ahora):
                aterrizo = evaluar_vuelo(fila, adsb, ahora)["aterrizo_at"]
                if aterrizo is not None:
                    marca = aterrizo.isoformat()
                    fila = {**fila, "terminado_at": marca, "aterrizo_at": marca}
                    try:
                        cliente.table("seguimientos_en_vivo").update({"terminado_at": marca, "aterrizo_at": marca}).eq("token", token).is_(
                            "terminado_at", "null"
                        ).execute()
                    except Exception:  # noqa: BLE001
                        pass
            # Sólo se anota mientras el vuelo sigue en curso; una falla acá nunca rompe la consulta.
            if esta_activo(fila, ahora):
                try:
                    cambios = anotar_vista(fila.get("vistas"), fila.get("vistos_total"), visitante, ahora)
                    if cambios:
                        cliente.table("seguimientos_en_vivo").update(cambios).eq("token", token).execute()
                except Exception:  # noqa: BLE001
                    pass
            return vista_publica(fila, ahora, adsb)

        cuerpo = await asyncio.to_thread(_leer)
        return Response(cuerpo, headers={"Cache-Control": "no-store"})

    @post("/{token:str}/avisos", status_code=201)
    async def pedir_avisos(self, token: str, data: SuscripcionAvisoIn) -> Dict[str, bool]:
        """
        Quien mira pide un push cuando el avión despegue y cuando aterrice (migración 046). Sin cuenta:
        se guarda sólo la suscripción del navegador para este seguimiento. Sólo mientras sigue en
        vuelo; un token que no existe, vencido o terminado da el mismo 404 de siempre. Hay un tope de
        navegadores por vuelo, y pedirlo dos veces desde el mismo es lo mismo que una.
        """
        if not _token_con_forma(token):
            raise NotFoundException(_NO_EXISTE)
        if not avisos_configurados():
            raise ClientException(detail="Los avisos no están disponibles.", status_code=503)
        ahora = _ahora()

        def _guardar() -> None:
            cliente = SupabaseManager.get_service_client()
            filas = cliente.table("seguimientos_en_vivo").select("id,vence_at,terminado_at").eq("token", token).limit(1).execute().data or []
            if not filas or not esta_activo(filas[0], ahora):
                raise NotFoundException(_NO_EXISTE)
            sid = filas[0]["id"]
            tabla = lambda: cliente.table("seguimientos_avisos")  # noqa: E731
            ya = tabla().select("id").eq("seguimiento_id", sid).eq("endpoint", data.endpoint).limit(1).execute().data or []
            if not ya:
                cuenta = tabla().select("id", count="exact", head=True).eq("seguimiento_id", sid).execute()
                if (cuenta.count or 0) >= TOPE_SUSCRIPCIONES:
                    raise ClientException(detail="Este vuelo ya tiene todos los avisos que admite.", status_code=409)
            tabla().upsert(
                {"seguimiento_id": sid, "endpoint": data.endpoint, "p256dh": data.keys.p256dh, "auth": data.keys.auth},
                on_conflict="seguimiento_id,endpoint",
            ).execute()

        await asyncio.to_thread(_guardar)
        return {"ok": True}

    @post("/{token:str}/avisos/baja", status_code=200)
    async def dar_de_baja_avisos(self, token: str, data: BajaAvisoIn) -> Dict[str, bool]:
        """Darse de baja de los avisos de este vuelo. Borra sólo la suscripción de ese navegador; nunca devuelve otras."""
        if not _token_con_forma(token):
            raise NotFoundException(_NO_EXISTE)

        def _borrar() -> None:
            cliente = SupabaseManager.get_service_client()
            filas = cliente.table("seguimientos_en_vivo").select("id").eq("token", token).limit(1).execute().data or []
            if not filas:
                raise NotFoundException(_NO_EXISTE)
            cliente.table("seguimientos_avisos").delete().eq("seguimiento_id", filas[0]["id"]).eq("endpoint", data.endpoint).execute()

        await asyncio.to_thread(_borrar)
        return {"ok": True}
