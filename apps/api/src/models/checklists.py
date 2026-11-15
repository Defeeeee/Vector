"""
Las checklists del avión (migración 054).

El piloto carga el texto de su checklist en el formato de Vector (ver `parsear` más abajo, que
repite el de `apps/web/src/lib/checklist.ts`). Acá sólo se valida la forma y los topes: Vector
no interpreta ni completa procedimientos.
"""
from datetime import datetime
from typing import List, Optional, Tuple
from uuid import UUID

from pydantic import BaseModel, field_validator

MAX_NOMBRE = 80
MAX_TEXTO = 40_000
MAX_SECCIONES = 40
MAX_ELEMENTOS = 80
MAX_LARGO_ELEMENTO = 300
MAX_SUB = 12
MAX_AVIONES_POR_CHECKLIST = 100


def parsear(texto: str) -> List[Tuple[Optional[str], List[Tuple[str, str, List[str]]]]]:
    """Lo mismo que `parsearChecklist` de la web: [(titulo, [(tipo, texto, [sub])])]."""
    secciones: List[Tuple[Optional[str], List[Tuple[str, str, List[str]]]]] = []
    for cruda in texto.replace("\r", "").split("\n"):
        linea = cruda.strip()
        if not linea:
            continue
        if linea.startswith("#"):
            secciones.append((linea.lstrip("#").strip(), []))
            continue
        if not secciones:
            secciones.append((None, []))
        elementos = secciones[-1][1]
        con_sangria = cruda.startswith("  ") or cruda.startswith("\t")
        if con_sangria and linea.startswith("- ") and elementos:
            elementos[-1][2].append(linea[2:].strip())
        elif linea.startswith(">"):
            elementos.append(("nota", linea[1:].strip(), []))
        elif linea.startswith("- ") or linea == "-":
            elementos.append(("paso", linea[1:].strip(), []))
        else:
            # Antes del primer `#` una línea suelta es una nota de introducción; después, un paso.
            intro = len(secciones) == 1 and secciones[0][0] is None
            elementos.append(("nota" if intro else "paso", linea, []))
    return secciones


def validar_forma(texto: str) -> Optional[str]:
    """None si el texto cumple los topes; si no, el motivo en castellano."""
    if len(texto) > MAX_TEXTO:
        return f"La checklist es demasiado larga (máximo {MAX_TEXTO} letras)."
    secciones = parsear(texto)
    if len(secciones) > MAX_SECCIONES:
        return f"Hay demasiadas secciones (máximo {MAX_SECCIONES})."
    for titulo, elementos in secciones:
        if titulo is not None and len(titulo) > MAX_LARGO_ELEMENTO:
            return f"Un título pasa de {MAX_LARGO_ELEMENTO} letras."
        if len(elementos) > MAX_ELEMENTOS:
            return f"Una sección tiene más de {MAX_ELEMENTOS} elementos."
        for _tipo, t, sub in elementos:
            if len(t) > MAX_LARGO_ELEMENTO or any(len(s) > MAX_LARGO_ELEMENTO for s in sub):
                return f"Un paso o nota pasa de {MAX_LARGO_ELEMENTO} letras."
            if len(sub) > MAX_SUB:
                return f"Un elemento tiene más de {MAX_SUB} sub-pasos."
    return None


def _nombre(v: str) -> str:
    v = " ".join(v.split())
    if not v:
        raise ValueError("Ponele un nombre a la checklist.")
    if len(v) > MAX_NOMBRE:
        raise ValueError(f"El nombre pasa de {MAX_NOMBRE} letras.")
    return v


def _texto(v: str) -> str:
    motivo = validar_forma(v)
    if motivo:
        raise ValueError(motivo)
    return v


class ChecklistIn(BaseModel):
    nombre: str
    texto: str = ""

    @field_validator("nombre")
    @classmethod
    def _v_nombre(cls, v: str) -> str:
        return _nombre(v)

    @field_validator("texto")
    @classmethod
    def _v_texto(cls, v: str) -> str:
        return _texto(v)


class ChecklistEdicion(BaseModel):
    nombre: str
    texto: str

    @field_validator("nombre")
    @classmethod
    def _v_nombre(cls, v: str) -> str:
        return _nombre(v)

    @field_validator("texto")
    @classmethod
    def _v_texto(cls, v: str) -> str:
        return _texto(v)


class ChecklistBreve(BaseModel):
    id: UUID
    nombre: str
    updated_at: Optional[datetime] = None


class Checklist(ChecklistBreve):
    texto: str


class AsignarAviones(BaseModel):
    aircraft_ids: List[UUID]

    @field_validator("aircraft_ids")
    @classmethod
    def _ids(cls, v: List[UUID]) -> List[UUID]:
        if len(v) > MAX_AVIONES_POR_CHECKLIST:
            raise ValueError("Demasiados aviones.")
        return list(dict.fromkeys(v))
