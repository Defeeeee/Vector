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
#: Elementos de un dorso (fotos más sellos) y topes de la migración 049.
MAX_SELLOS_POR_DORSO = 12
MAX_FOTOS_POR_DORSO = 12
MAX_SELLOS_POR_PERSONA = 6
#: Textos de un dorso (migración 050): constancias y habilitaciones, cada una con su firma.
MAX_TEXTOS_POR_DORSO = 12
#: Constancias en el frente (migración 051): fotos del sello real, por vuelo.
MAX_CONSTANCIAS_POR_VUELO = 2
MAX_LARGO_TEXTO_DORSO = 600


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
    automatica: Optional[bool] = None

    @field_validator("alias")
    @classmethod
    def _alias(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        return limpiar_alias(v)

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

    @field_validator("png")
    @classmethod
    def _png(cls, v: Optional[str]) -> Optional[str]:
        return None if v is None else validar_png(v)


class SelloIn(BaseModel):
    """Un sello nuevo de una persona (migración 049): la imagen, su etiqueta y su cargo del CAD."""

    etiqueta: str = Field(min_length=1, max_length=60)
    autoridad_id: Optional[int] = Field(default=None, ge=0, le=32767)
    nombre_cad: Optional[str] = Field(default=None, max_length=160)
    png: str = Field(max_length=MAX_DORSO_CHARS)

    @field_validator("etiqueta")
    @classmethod
    def _etiqueta(cls, v: str) -> str:
        v = limpiar_texto(v)
        if not v:
            raise ValueError("Falta la etiqueta del sello.")
        return v

    @field_validator("nombre_cad")
    @classmethod
    def _nombre_cad(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return limpiar_texto(v).upper() or None

    @field_validator("png")
    @classmethod
    def _png(cls, v: str) -> str:
        return validar_png(v)


class SelloEdicion(BaseModel):
    """Lo que se cambia de un sello: sólo lo que viene (`exclude_unset`); `null` quita el cargo o el nombre."""

    etiqueta: Optional[str] = Field(default=None, min_length=1, max_length=60)
    autoridad_id: Optional[int] = Field(default=None, ge=0, le=32767)
    nombre_cad: Optional[str] = Field(default=None, max_length=160)
    png: Optional[str] = Field(default=None, max_length=MAX_DORSO_CHARS)

    @field_validator("etiqueta")
    @classmethod
    def _etiqueta(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = limpiar_texto(v)
        if not v:
            raise ValueError("Falta la etiqueta del sello.")
        return v

    @field_validator("nombre_cad")
    @classmethod
    def _nombre_cad(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return limpiar_texto(v).upper() or None

    @field_validator("png")
    @classmethod
    def _png(cls, v: Optional[str]) -> Optional[str]:
        return None if v is None else validar_png(v)


class SelloBreve(BaseModel):
    """Un sello sin su imagen: para elegirlo en un vuelo o sugerirlo."""

    id: UUID
    etiqueta: str
    autoridad_id: Optional[int] = None
    nombre_cad: Optional[str] = None
    orden: int = 0


class Sello(SelloBreve):
    png: str


class FirmaCertificante(BaseModel):
    id: UUID
    nombre: str
    licencia: Optional[str] = None
    autoridad_id: Optional[int] = None
    png: str
    alias: List[str] = Field(default_factory=list)
    automatica: bool = True
    updated_at: Optional[str] = None
    #: Sus sellos, con la imagen (migración 049), por `orden`.
    sellos: List[Sello] = Field(default_factory=list)


class CertificanteBreve(BaseModel):
    """Una persona sin sus imágenes: para los selectores de la Bitácora y del formulario del vuelo."""

    id: UUID
    nombre: str
    licencia: Optional[str] = None
    autoridad_id: Optional[int] = None
    automatica: bool = True
    #: Sus sellos sin imagen: para elegir con qué cargo certificó un vuelo.
    sellos: List[SelloBreve] = Field(default_factory=list)


class AsignarVuelos(BaseModel):
    """Asignar una persona a uno o varios vuelos. `firma`: null = lo que diga la persona."""

    vuelo_ids: List[UUID] = Field(min_length=1, max_length=MAX_VUELOS_POR_PEDIDO)
    firma: Optional[Literal["si", "no"]] = None
    #: Con qué sello/cargo de la persona certificó (migración 049); null = ninguno.
    sello_id: Optional[UUID] = None
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
    #: El sello de la persona con el mismo cargo que esos vuelos (migración 049), si lo hay.
    sello_id: Optional[UUID] = None


class DorsoTexto(BaseModel):
    """
    Un texto del dorso (migración 050), p. ej. "QUEDA HABILITADO PARA TRANSPORTAR PASAJEROS", y la
    firma que lo avala: `foto:<id>` (una foto de ese dorso) o `sello:<id>` (un sello de una
    persona). Sin firma, va solo. Se respeta lo que escribió el piloto (no se pasa a mayúsculas).
    """

    texto: str = Field(min_length=1, max_length=MAX_LARGO_TEXTO_DORSO)
    firma: Optional[str] = Field(default=None, max_length=60)

    @field_validator("texto")
    @classmethod
    def _texto(cls, v: str) -> str:
        v = limpiar_texto(v)
        if not v:
            raise ValueError("El texto está vacío.")
        return v

    @field_validator("firma")
    @classmethod
    def _firma(cls, v: Optional[str]) -> Optional[str]:
        if not v:
            return None
        tipo, _, ident = v.partition(":")
        if tipo not in ("foto", "sello"):
            raise ValueError("La firma de un texto es una foto o un sello del dorso.")
        try:
            return f"{tipo}:{UUID(ident)}"
        except ValueError:
            raise ValueError("La firma de un texto es una foto o un sello del dorso.")


class DorsoHojaIn(BaseModel):
    """
    El dorso de una hoja: aclaración, fecha y los sellos elegidos. **Las fotos van aparte**
    (`/dorsos/fotos`, una por pedido). La columna `png` de la foto única se borró en la
    migración 053; un `png` que mande una web vieja se ignora como cualquier campo de más.
    """

    logbook_id: UUID
    hoja: int = Field(ge=1, le=100_000)
    aclaracion: Optional[str] = Field(default=None, max_length=160)
    fecha: Optional[dt.date] = None
    #: Los sellos (de cualquier persona) que van en este dorso, junto a sus fotos.
    sello_ids: Optional[List[UUID]] = Field(default=None, max_length=MAX_SELLOS_POR_DORSO)
    #: Los textos del dorso con su firma (migración 050). Sin el campo (web vieja), no se tocan.
    textos: Optional[List[DorsoTexto]] = Field(default=None, max_length=MAX_TEXTOS_POR_DORSO)
    #: Si suma las firmas de los vuelos de la hoja (migración 052). `None` = lo de siempre
    #: (sí, salvo que la hoja tenga fotos). Sin el campo (web vieja), no se toca.
    firmas_de_los_vuelos: Optional[bool] = None

    @field_validator("aclaracion")
    @classmethod
    def _aclaracion(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = limpiar_texto(v).upper()
        return v or None

class DorsoFotoIn(BaseModel):
    logbook_id: UUID
    hoja: int = Field(ge=1, le=100_000)
    png: str = Field(max_length=MAX_DORSO_CHARS)

    @field_validator("png")
    @classmethod
    def _png(cls, v: str) -> str:
        return validar_png(v)


class DorsoFoto(BaseModel):
    id: UUID
    png: str
    orden: int = 0


class DorsoHoja(BaseModel):
    id: UUID
    logbook_id: UUID
    hoja: int
    aclaracion: Optional[str] = None
    fecha: Optional[str] = None
    sello_ids: List[UUID] = Field(default_factory=list)
    textos: List[DorsoTexto] = Field(default_factory=list)
    firmas_de_los_vuelos: Optional[bool] = None
    fotos: List[DorsoFoto] = Field(default_factory=list)


class ConstanciaIn(BaseModel):
    """
    La foto del sello real de una autoridad (p. ej. el de ANAC en un examen) para el frente de
    la hoja de un vuelo (migración 051). Vector nunca dibuja un sello: sólo estampa la foto.
    """

    flight_id: UUID
    png: str = Field(max_length=MAX_DORSO_CHARS)

    @field_validator("png")
    @classmethod
    def _png(cls, v: str) -> str:
        return validar_png(v)


class Constancia(BaseModel):
    id: UUID
    flight_id: UUID
    png: str
    orden: int = 0
