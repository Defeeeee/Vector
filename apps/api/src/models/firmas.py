"""
Las firmas de los certificantes y el dorso de cada hoja del libro (migración 047).

Las imágenes llegan ya limpias del navegador del piloto (`limpiar-firma.ts`): un PNG como
data URL. Acá se valida que sea PNG de verdad (la cabecera, no sólo el prefijo) y el tope.
"""
import base64
import datetime as dt
from typing import Optional
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


class FirmaCertificanteIn(BaseModel):
    nombre: str = Field(min_length=1, max_length=120)
    licencia: Optional[str] = Field(default=None, max_length=40)
    autoridad_id: Optional[int] = Field(default=None, ge=0, le=32767)
    png: str = Field(max_length=MAX_FIRMA_CHARS)

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


class FirmaCertificante(BaseModel):
    id: UUID
    nombre: str
    licencia: Optional[str] = None
    autoridad_id: Optional[int] = None
    png: str
    updated_at: Optional[str] = None


class DorsoHojaIn(BaseModel):
    logbook_id: UUID
    hoja: int = Field(ge=1, le=100_000)
    png: Optional[str] = Field(default=None, max_length=MAX_DORSO_CHARS)
    aclaracion: Optional[str] = Field(default=None, max_length=160)
    fecha: Optional[dt.date] = None

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
