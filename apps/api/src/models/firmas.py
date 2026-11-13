"""
Las firmas de los certificantes y el dorso de cada hoja del libro (migración 047).

Las imágenes llegan ya limpias del navegador del piloto (`limpiar-firma.ts`): un PNG como
data URL. Acá se valida que sea PNG de verdad (la cabecera, no sólo el prefijo) y el tope.
"""
import base64
import datetime as dt
from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

#: El mismo tope que `FirmaPlanVuelo`: ~180 KB de imagen en base64.
MAX_FIRMA_CHARS = 250_000
#: El dorso lleva la firma con el sello, a color y más grande.
MAX_DORSO_CHARS = 450_000
PREFIJO_PNG = "data:image/png;base64,"
CABECERA_PNG = b"\x89PNG\r\n\x1a\n"


def validar_png(v: str) -> str:
    if not v.startswith(PREFIJO_PNG):
        raise ValueError("La firma tiene que ser un PNG.")
    try:
        crudo = base64.b64decode(v[len(PREFIJO_PNG):], validate=True)
    except Exception:
        raise ValueError("La imagen de la firma no es válida.")
    if not crudo.startswith(CABECERA_PNG):
        raise ValueError("La firma tiene que ser un PNG.")
    return v


def limpiar_texto(v: str) -> str:
    return " ".join(v.split())


MAX_ALIAS = 20
MAX_VUELOS_POR_PEDIDO = 200
MAX_CERTIFICANTES_POR_DORSO = 12


def limpiar_alias(v: Optional[List[str]]) -> Optional[List[str]]:
    """Los alias van normalizados (mayúsculas, sin acentos), sin repetidos ni vacíos."""
    if v is None:
        return None
    from src.services.certificantes import normalizar

    vistos: List[str] = []
    for a in v:
        n = normalizar(a)[:120]
        if n and n not in vistos:
            vistos.append(n)
    if len(vistos) > MAX_ALIAS:
        raise ValueError(f"Hasta {MAX_ALIAS} alias por persona.")
    return vistos


class FirmaCertificanteIn(BaseModel):
    nombre: str = Field(min_length=1, max_length=120)
    licencia: Optional[str] = Field(default=None, max_length=40)
    autoridad_id: Optional[int] = Field(default=None, ge=0, le=32767)
    png: str = Field(max_length=MAX_FIRMA_CHARS)
    alias: Optional[List[str]] = None
    png_sello: Optional[str] = Field(default=None, max_length=MAX_DORSO_CHARS)
    automatica: Optional[bool] = None

    @field_validator("alias")
    @classmethod
    def _alias(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        return limpiar_alias(v)

    @field_validator("png_sello")
    @classmethod
    def _png_sello(cls, v: Optional[str]) -> Optional[str]:
        return None if v is None else validar_png(v)

    @field_validator("nombre")
    @classmethod
    def _nombre(cls, v: str) -> str:
        v = limpiar_texto(v).upper()
        if not v:
            raise ValueError("Falta la aclaración.")
        return v

    @field_validator("licencia")
    @classmethod
    def _licencia(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = limpiar_texto(v).upper()
        return v or None

    @field_validator("png")
    @classmethod
    def _png(cls, v: str) -> str:
        return validar_png(v)


class FirmaCertificanteEdicion(BaseModel):
    """Lo que se cambia de una persona ya guardada: sólo lo que viene (`exclude_unset`)."""

    nombre: Optional[str] = Field(default=None, min_length=1, max_length=120)
    licencia: Optional[str] = Field(default=None, max_length=40)
    autoridad_id: Optional[int] = Field(default=None, ge=0, le=32767)
    png: Optional[str] = Field(default=None, max_length=MAX_FIRMA_CHARS)
    #: `null` quita el sello.
    png_sello: Optional[str] = Field(default=None, max_length=MAX_DORSO_CHARS)
    alias: Optional[List[str]] = None
    automatica: Optional[bool] = None

    @field_validator("nombre")
    @classmethod
    def _nombre(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = limpiar_texto(v).upper()
        if not v:
            raise ValueError("Falta la aclaración.")
        return v

    @field_validator("licencia")
    @classmethod
    def _licencia(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return limpiar_texto(v).upper() or None

    @field_validator("alias")
    @classmethod
    def _alias(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        return limpiar_alias(v)

    @field_validator("png", "png_sello")
    @classmethod
    def _png(cls, v: Optional[str]) -> Optional[str]:
        return None if v is None else validar_png(v)


class FirmaCertificante(BaseModel):
    id: UUID
    nombre: str
    licencia: Optional[str] = None
    autoridad_id: Optional[int] = None
    png: str
    alias: List[str] = Field(default_factory=list)
    png_sello: Optional[str] = None
    automatica: bool = True
    updated_at: Optional[str] = None


class CertificanteBreve(BaseModel):
    """Una persona sin sus imágenes: para los selectores de la Bitácora y del formulario del vuelo."""

    id: UUID
    nombre: str
    licencia: Optional[str] = None
    automatica: bool = True


class AsignarVuelos(BaseModel):
    """Asignar una persona a uno o varios vuelos. `firma`: null = lo que diga la persona."""

    vuelo_ids: List[UUID] = Field(min_length=1, max_length=MAX_VUELOS_POR_PEDIDO)
    firma: Optional[Literal["si", "no"]] = None
    #: Un nombre con el que aparece en estos vuelos, para sumarlo a los alias de la persona.
    sumar_alias: Optional[str] = Field(default=None, max_length=120)


class AvisoVuelo(BaseModel):
    vuelo_id: UUID
    mensaje: str


class AsignacionResultado(BaseModel):
    asignados: int
    #: Cuántos vuelos sin certificante en el CAD se completaron con el nombre de la persona.
    completados: int = 0
    avisos: List[AvisoVuelo] = Field(default_factory=list)


class SugerenciaCertificante(BaseModel):
    certificante_id: UUID
    nombre_en_vuelos: str
    vuelo_ids: List[UUID]
    sumar_alias: bool


class DorsoHojaIn(BaseModel):
    logbook_id: UUID
    hoja: int = Field(ge=1, le=100_000)
    png: Optional[str] = Field(default=None, max_length=MAX_DORSO_CHARS)
    aclaracion: Optional[str] = Field(default=None, max_length=160)
    fecha: Optional[dt.date] = None
    #: Las personas cuyas firmas con sello van en este dorso si no tiene foto propia.
    certificante_ids: Optional[List[UUID]] = Field(default=None, max_length=MAX_CERTIFICANTES_POR_DORSO)

    @field_validator("aclaracion")
    @classmethod
    def _aclaracion(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = limpiar_texto(v).upper()
        return v or None

    @field_validator("png")
    @classmethod
    def _png(cls, v: Optional[str]) -> Optional[str]:
        return None if v is None else validar_png(v)


class DorsoHoja(BaseModel):
    id: UUID
    logbook_id: UUID
    hoja: int
    png: Optional[str] = None
    aclaracion: Optional[str] = None
    fecha: Optional[str] = None
    certificante_ids: List[UUID] = Field(default_factory=list)
