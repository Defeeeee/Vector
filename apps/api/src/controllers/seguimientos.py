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
    ADSB_PRIMERAS,
    ADSB_ULTIMAS,
    MatriculaVisible,
    PosicionEnVivo,
    RutaNueva,
    SeguimientoCrear,
    SeguimientoDesdePlan,
    agregar_al_recorrido,
    anotar_vista,
    duracion_del_plan,
    esta_activo,
    evaluar_vuelo,
    matricula_para_adsb,
    nombre_de_pila,
    nuevo_token,
    puede_aceptar_posicion,
    resumen_de_vistas,
    salida_aceptable,
    salida_del_plan,
    unir_filas_adsb,
    vence_en,
    vencimiento_desde_plan,
    ventana_adsb,
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

    @post("/desde-plan", status_code=200)
    async def desde_plan(self, request: Request, supabase_client: Client, data: SeguimientoDesdePlan) -> SeguimientoCreado:
        """
        Comparte un plan de vuelo sin el teléfono. Sólo el dueño del plan (el RLS lo esconde a los
        demás: un plan ajeno es un 404). El plan necesita matrícula (casilla 7) y salida; con
        ADS-B el link muestra el vuelo cuando el avión despega. Si ya hay un seguimiento de este
        plan sin terminar se lo actualiza con el plan de ahora (la salida pudo cambiar con una
        demora); si hay otro, es un 409. El vencimiento es la salida más la duración más un margen.
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
            tabla().update({"terminado_at": ahora.isoformat()}).eq("user_id", user_id).is_(
                "terminado_at", "null"
            ).lte("vence_at", ahora.isoformat()).execute()

            cuerpo = {
                "ruta": data.ruta,
                "puntos": [[p.lat, p.lon, p.codigo, p.nombre] for p in data.puntos],
                "avion_tipo": (data.avion.tipo if data.avion else "") or None,
                "avion_icao": (data.avion.icao if data.avion else "") or None,
                "matricula_adsb": matricula_adsb,
                "plan_id": str(data.plan_id),
                "salida_prevista": salida.isoformat(),
                "duracion_prevista_min": duracion,
                "vence_at": vence.isoformat(),
            }

            def _activo() -> List[Dict[str, Any]]:
                return (
                    tabla()
                    .select("id,token,vence_at,mostrar_matricula,plan_id")
                    .eq("user_id", user_id)
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
                if f.get("plan_id") != str(data.plan_id):
                    raise ClientException(
                        detail="Ya estás compartiendo otro vuelo. Dejá de compartirlo antes de compartir éste.",
                        status_code=409,
                    )
                cambios = dict(cuerpo)
                if f.get("mostrar_matricula"):
                    cambios["avion_matricula"] = texto_matricula[:12] or None
                r = tabla().update(cambios).eq("id", f["id"]).eq("user_id", user_id).execute()
                return _respuesta({**f, **(r.data[0] if r.data else cuerpo)}, True)

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
                otra = _activo()
                if otra and otra[0].get("plan_id") == str(data.plan_id):
                    return _respuesta(otra[0], True)
                raise
            if not r.data:
                raise ClientException(detail="No se pudo empezar a compartir el vuelo.")
            return _respuesta(r.data[0], False)

        return await asyncio.to_thread(_crear)

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
                {"ruta": data.ruta, "puntos": [[p.lat, p.lon, p.codigo, p.nombre] for p in data.puntos]}
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


def _leer_adsb(cliente: Client, fila: Dict[str, Any], ahora: datetime) -> List[Dict[str, Any]]:
    """
    Las posiciones ADS-B del avión en la ventana del seguimiento (`ventana_adsb`): las primeras y las
    últimas, para que un vuelo largo no pierda ni el principio ni lo más nuevo (PostgREST corta en
    1.000 filas). Es un respaldo: si la lectura falla, el link sigue con lo del teléfono.
    """
    ventana = ventana_adsb(fila, ahora)
    if ventana is None:
        return []
    matricula = matricula_para_adsb(fila.get("matricula_adsb"))
    columnas = "visto_at,lat,lon,altitud,velocidad,en_tierra"

    def _base():
        return (
            cliente.table("adsb_posiciones")
            .select(columnas)
            .eq("matricula", matricula)
            .gte("visto_at", ventana[0].isoformat())
            .lte("visto_at", ventana[1].isoformat())
        )

    try:
        primeras = _base().order("visto_at").limit(ADSB_PRIMERAS).execute().data or []
        ultimas = _base().order("visto_at", desc=True).limit(ADSB_ULTIMAS).execute().data or []
    except Exception:  # noqa: BLE001
        return []
    return unir_filas_adsb(primeras, ultimas)


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
                .select("nombre,ruta,puntos,created_at,avion_tipo,avion_icao,avion_matricula,mostrar_matricula,vence_at,terminado_at,ultima_lat,ultima_lon,ultima_alt_ft,ultima_gs_kt,ultima_track,ultima_at,recorrido,vistas,vistos_total,matricula_adsb,salida_prevista,aterrizo_at")
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
