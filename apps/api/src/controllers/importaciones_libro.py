"""
Las importaciones del libro de vuelo (migración 059): leer un libro largo con Gemini lleva
minutos, así que es un trabajo con estado y el piloto no tiene que quedarse en la página.

- `/importaciones-libro` (con sesión): crear, listar, leer una, descartar o dar por importada.
  Siempre las del piloto: se filtra por su id.
- `/importaciones-libro-interno` (con el secreto de los barridos, `X-Cron-Secret`): lo que usa
  el server de la web mientras lee —progreso, resultado, reservar el aviso— y el barrido que
  retoma los trabajos que un deploy cortó.

El archivo del libro **no** pasa por acá: vive en el VPS, en la carpeta de datos de la web.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import hmac
from typing import Any, Dict, List, Literal, Optional
from uuid import UUID

from litestar import Controller, Request, get, patch, post
from litestar.exceptions import NotAuthorizedException, NotFoundException
from pydantic import BaseModel, Field

from src.auth.guards import auth_guard
from src.config import settings
from src.services.avisos import enviar_aviso
from src.supabase_client import SupabaseManager

Estado = Literal["subido", "procesando", "listo", "error", "importado", "descartado"]

#: Hojas por libro: el mismo tope que la web (120 páginas de PDF u 80 fotos).
TOPE_HOJAS = 120
#: Un trabajo que no avanza hace este tiempo se retoma.
MINUTOS_SIN_LATIDO = 10
#: Cuánto vive un libro subido que nadie revisó.
DIAS_DE_VIDA = 7

COLUMNAS_LISTA = "id,estado,paginas_total,paginas_leidas,lotes_fallidos,error,creado_at,terminado_at,latido_at"


class NuevaImportacion(BaseModel):
    paginas_total: int = Field(ge=1, le=TOPE_HOJAS)


class Progreso(BaseModel):
    estado: Optional[Estado] = None
    paginas_total: Optional[int] = Field(default=None, ge=0, le=1000)
    paginas_leidas: Optional[int] = Field(default=None, ge=0, le=1000)
    lotes_fallidos: Optional[List[Dict[str, int]]] = None
    resultado: Optional[Dict[str, Any]] = None
    error: Optional[str] = Field(default=None, max_length=500)


def cambios_de_progreso(p: Progreso, ahora: dt.datetime) -> Dict[str, Any]:
    """Lo que se escribe en la fila: sólo lo mandado, y siempre el latido."""
    c = p.model_dump(exclude_none=True)
    c["latido_at"] = ahora.isoformat()
    if p.estado in ("listo", "error"):
        c["terminado_at"] = ahora.isoformat()
    return c


def hay_que_retomar(fila: Dict[str, Any], ahora: dt.datetime) -> bool:
    """
    Un trabajo 'subido' o 'procesando' sin latido hace más de `MINUTOS_SIN_LATIDO` quedó
    cortado (un deploy reinicia el server). Los terminados cuyo mail no salió también vuelven.
    """
    estado = fila.get("estado")
    if estado in ("listo", "error"):
        return fila.get("aviso_enviado_at") is None
    if estado not in ("subido", "procesando"):
        return False
    latido = dt.datetime.fromisoformat(str(fila["latido_at"]).replace("Z", "+00:00"))
    return ahora - latido > dt.timedelta(minutes=MINUTOS_SIN_LATIDO)


def _cliente():
    return SupabaseManager.get_service_client()


class ImportacionesLibroController(Controller):
    path = "/importaciones-libro"
    guards = [auth_guard]

    @post()
    async def crear(self, request: Request, data: NuevaImportacion) -> Dict[str, Any]:
        user_id = str(request.state.user.id)

        def _crear() -> Dict[str, Any]:
            return _cliente().table("importaciones_libro").insert({"user_id": user_id, "paginas_total": data.paginas_total}).execute().data[0]

        return await asyncio.to_thread(_crear)

    @get()
    async def listar(self, request: Request) -> List[Dict[str, Any]]:
        """Las que están en curso o esperando revisión (sin el resultado: pesa)."""
        user_id = str(request.state.user.id)

        def _leer() -> List[Dict[str, Any]]:
            return (
                _cliente().table("importaciones_libro").select(COLUMNAS_LISTA)
                .eq("user_id", user_id).in_("estado", ["subido", "procesando", "listo", "error"])
                .order("creado_at", desc=True).limit(10).execute().data or []
            )

        return await asyncio.to_thread(_leer)

    @get("/{importacion_id:uuid}")
    async def leer(self, request: Request, importacion_id: UUID) -> Dict[str, Any]:
        user_id = str(request.state.user.id)

        def _leer() -> List[Dict[str, Any]]:
            return _cliente().table("importaciones_libro").select("*").eq("id", str(importacion_id)).eq("user_id", user_id).execute().data or []

        filas = await asyncio.to_thread(_leer)
        if not filas:
            raise NotFoundException("No encontramos esa importación.")
        return filas[0]

    async def _cerrar(self, request: Request, importacion_id: UUID, estado: str, desde: List[str]) -> Dict[str, Any]:
        user_id = str(request.state.user.id)

        def _escribir() -> List[Dict[str, Any]]:
            return (
                _cliente().table("importaciones_libro").update({"estado": estado})
                .eq("id", str(importacion_id)).eq("user_id", user_id).in_("estado", desde).execute().data or []
            )

        filas = await asyncio.to_thread(_escribir)
        if not filas:
            raise NotFoundException("No encontramos esa importación, o ya estaba cerrada.")
        return {"id": str(importacion_id), "estado": estado}

    @post("/{importacion_id:uuid}/descartar", status_code=200)
    async def descartar(self, request: Request, importacion_id: UUID) -> Dict[str, Any]:
        return await self._cerrar(request, importacion_id, "descartado", ["subido", "procesando", "listo", "error"])

    @post("/{importacion_id:uuid}/importado", status_code=200)
    async def importado(self, request: Request, importacion_id: UUID) -> Dict[str, Any]:
        # Sólo una que estaba lista para revisar se da por importada.
        return await self._cerrar(request, importacion_id, "importado", ["listo"])


class ImportacionesInternasController(Controller):
    path = "/importaciones-libro-interno"

    def _verificar(self, request: Request) -> None:
        esperado = settings.documents_alert_secret
        recibido = request.headers.get("X-Cron-Secret") or ""
        if not esperado:
            raise NotAuthorizedException("El barrido no está configurado.")
        if not recibido or not hmac.compare_digest(recibido, esperado):
            raise NotAuthorizedException("Invalid secret token.")

    @get("/retomar")
    async def retomar(self, request: Request) -> List[Dict[str, Any]]:
        """Los trabajos a retomar o a terminar de avisar: `[{id, estado}]`."""
        self._verificar(request)
        ahora = dt.datetime.now(dt.timezone.utc)

        def _leer() -> List[Dict[str, Any]]:
            return (
                _cliente().table("importaciones_libro").select("id,estado,latido_at,aviso_enviado_at")
                .in_("estado", ["subido", "procesando", "listo", "error"]).limit(100).execute().data or []
            )

        filas = await asyncio.to_thread(_leer)
        return [{"id": f["id"], "estado": f["estado"]} for f in filas if hay_que_retomar(f, ahora)]

    @get("/para-borrar")
    async def para_borrar(self, request: Request) -> List[str]:
        """
        Las carpetas que ya no hacen falta: las importadas o descartadas y las que nadie revisó
        en `DIAS_DE_VIDA` días (que de paso se descartan). Es idempotente: borrar dos veces no daña.
        """
        self._verificar(request)
        ahora = dt.datetime.now(dt.timezone.utc)
        limite = (ahora - dt.timedelta(days=DIAS_DE_VIDA)).isoformat()
        hace_un_mes = (ahora - dt.timedelta(days=30)).isoformat()

        def _correr() -> List[str]:
            cliente = _cliente()
            cliente.table("importaciones_libro").update({"estado": "descartado"}).in_("estado", ["subido", "procesando", "listo", "error"]).lt("creado_at", limite).execute()
            filas = cliente.table("importaciones_libro").select("id").in_("estado", ["importado", "descartado"]).gte("creado_at", hace_un_mes).limit(500).execute().data or []
            return [f["id"] for f in filas]

        return await asyncio.to_thread(_correr)

    @get("/{importacion_id:uuid}")
    async def leer(self, request: Request, importacion_id: UUID) -> Dict[str, Any]:
        """La fila entera, más el mail, el nombre y las matrículas del Hangar de su dueño."""
        self._verificar(request)

        def _leer() -> Optional[Dict[str, Any]]:
            cliente = _cliente()
            filas = cliente.table("importaciones_libro").select("*").eq("id", str(importacion_id)).execute().data or []
            if not filas:
                return None
            fila = filas[0]
            u = getattr(cliente.auth.admin.get_user_by_id(fila["user_id"]), "user", None)
            perfil = cliente.table("profiles").select("first_name").eq("id", fila["user_id"]).execute().data or []
            fila["email"] = getattr(u, "email", None) if u else None
            fila["first_name"] = perfil[0].get("first_name") if perfil else None
            # Las matrículas del Hangar: con ellas se calculan los aviones que faltan.
            aviones = cliente.table("aircraft").select("registration").eq("user_id", fila["user_id"]).execute().data or []
            fila["matriculas"] = [a["registration"] for a in aviones]
            return fila

        fila = await asyncio.to_thread(_leer)
        if fila is None:
            raise NotFoundException("No existe.")
        return fila

    @patch("/{importacion_id:uuid}")
    async def progreso(self, request: Request, importacion_id: UUID, data: Progreso) -> Dict[str, Any]:
        """Avanza el trabajo y marca el latido. Un trabajo cerrado por el piloto no se reabre."""
        self._verificar(request)
        cambios = cambios_de_progreso(data, dt.datetime.now(dt.timezone.utc))

        def _escribir() -> List[Dict[str, Any]]:
            return (
                _cliente().table("importaciones_libro").update(cambios)
                .eq("id", str(importacion_id)).in_("estado", ["subido", "procesando", "listo", "error"]).execute().data or []
            )

        filas = await asyncio.to_thread(_escribir)
        return {"actualizada": bool(filas)}

    @post("/{importacion_id:uuid}/aviso", status_code=200)
    async def reservar_aviso(self, request: Request, importacion_id: UUID) -> Dict[str, Any]:
        """
        Reserva el mail de aviso con un update condicional (sólo si `aviso_enviado_at` es null):
        quien lo reserva es quien lo manda, y uno por trabajo. Manda también el push, si el
        piloto lo tiene prendido; no lleva nada de la bitácora.
        """
        self._verificar(request)
        ahora = dt.datetime.now(dt.timezone.utc).isoformat()

        def _reservar() -> Optional[Dict[str, Any]]:
            filas = (
                _cliente().table("importaciones_libro").update({"aviso_enviado_at": ahora})
                .eq("id", str(importacion_id)).is_("aviso_enviado_at", "null").in_("estado", ["listo", "error"]).execute().data or []
            )
            return filas[0] if filas else None

        fila = await asyncio.to_thread(_reservar)
        if not fila:
            return {"reservado": False}
        listo = fila["estado"] == "listo"
        enviar_aviso(
            fila["user_id"],
            {
                "titulo": "Tu libro está listo para revisar" if listo else "No pudimos leer tu libro",
                "cuerpo": "Revisá los vuelos antes de importarlos." if listo else "Probá de nuevo desde Importar tu libro.",
                "url": f"/dashboard/log-flight/import?importacion={fila['id']}",
                "etiqueta": "vector-importacion",
            },
        )
        return {"reservado": True}

    @post("/{importacion_id:uuid}/liberar-aviso", status_code=200)
    async def liberar_aviso(self, request: Request, importacion_id: UUID) -> Dict[str, bool]:
        """Si el mail no pudo salir, se suelta la reserva para que el barrido lo reintente."""
        self._verificar(request)

        def _soltar() -> None:
            _cliente().table("importaciones_libro").update({"aviso_enviado_at": None}).eq("id", str(importacion_id)).execute()

        await asyncio.to_thread(_soltar)
        return {"liberado": True}
