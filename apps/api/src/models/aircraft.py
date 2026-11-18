from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Any, Dict, Optional
from uuid import UUID

from src.models.plan_vuelo import validar_perfil_avion


CLASES_SIMULADOR = {"ATD", "BATD", "PCATD", "A", "B", "C", "D", "1", "2", "3", "4", "5", "6", "7"}


def validar_simulador_cad(v: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """
    El simulador del CAD de un equipo (migración 036): id y nombre de `GetSimuladoresListItem`,
    la clase del dispositivo y el modelo que el CAD le asocia. Lo elige el piloto en el panel.
    """
    if v is None:
        return None
    if not isinstance(v, dict):
        raise ValueError("cad_simulador inválido")
    try:
        sid = int(v.get("id"))
    except (TypeError, ValueError):
        raise ValueError("cad_simulador.id inválido")
    nombre = str(v.get("nombre") or "").strip()[:200]
    clase = str(v.get("clase") or "").strip().upper()
    if sid <= 0 or not nombre or clase not in CLASES_SIMULADOR:
        raise ValueError("cad_simulador incompleto")
    try:
        modelo_id = int(v.get("modeloId")) if v.get("modeloId") is not None else None
    except (TypeError, ValueError):
        modelo_id = None
    modelo = str(v.get("modelo") or "").strip()[:80] or None
    return {"id": sid, "nombre": nombre, "clase": clase, "modeloId": modelo_id if modelo else None, "modelo": modelo if modelo_id else None}

class Aircraft(BaseModel):
    id: UUID
    user_id: UUID
    registration: str
    icao: str
    type: str
    type_acft: Optional[str] = None
    cost_per_hour: Optional[float] = None
    # Performance de crucero. Los tres son opcionales y **sin default**: un 110
    # inventado se vería igual que uno cargado por el piloto. Null es "no lo sé", y
    # el planificador lo dice en pantalla en vez de taparlo.
    cruise_tas_kt: Optional[float] = None
    fuel_burn_lph: Optional[float] = None
    fuel_capacity_l: Optional[float] = None
    #: Caballos de fuerza; la total si es multimotor. La pide la hoja del libro de
    #: vuelo de ANAC (Res. 147/2013). Opcional: en blanco, se completa a mano.
    potencia_hp: Optional[int] = Field(default=None, gt=0, le=100000)
    #: `true` = dispositivo de entrenamiento, no aeronave.
    #:
    #: El piloto anota el simulador en el libro como cualquier vuelo —fecha, horarios,
    #: el equipo— y las horas van a la columna de instrucción terrestre. Esta marca es
    #: lo que le permite al tracker de 61.620 **no** sumar esas horas a la experiencia
    #: total: las 200 h son horas de vuelo, y una sesión de simulador no lo es.
    #:
    #: Va en la aeronave y no en el vuelo porque así no se puede olvidar: se carga una
    #: vez al dar de alta el equipo y cada fila que lo use queda marcada sola.
    is_simulator: bool = False
    #: Lo fijo del avión para el plan de vuelo (migración 024): casilla 10,
    #: NAV/PBN/PER/OPR, color, ELT, observación fija. Lo arma y lo lee el frontend.
    plan_vuelo: Optional[Dict[str, Any]] = None
    #: Si es simulador, cuál es en el CAD de ANAC (migración 036).
    cad_simulador: Optional[Dict[str, Any]] = None
    #: La checklist asignada a este avión (migración 054). Se asigna desde `/checklists`.
    checklist_id: Optional[UUID] = None
    #: `false` = lo agregamos solo desde el libro importado (migración 059), con matrícula y
    #: modelo: faltan el tipo OACI y la categoría, que completa el piloto en el Hangar. Se apaga
    #: sola al guardarlos (`controllers/aircraft.py`). Un avión sin este dato es uno completo.
    datos_completos: bool = True

    model_config = ConfigDict(from_attributes=True)

class AircraftCreate(BaseModel):
    registration: str
    icao: str
    type: str
    type_acft: Optional[str] = None
    cost_per_hour: Optional[float] = None
    # Performance de crucero. Los tres son opcionales y **sin default**: un 110
    # inventado se vería igual que uno cargado por el piloto. Null es "no lo sé", y
    # el planificador lo dice en pantalla en vez de taparlo.
    cruise_tas_kt: Optional[float] = None
    fuel_burn_lph: Optional[float] = None
    fuel_capacity_l: Optional[float] = None
    #: Caballos de fuerza; la total si es multimotor. La pide la hoja del libro de
    #: vuelo de ANAC (Res. 147/2013). Opcional: en blanco, se completa a mano.
    potencia_hp: Optional[int] = Field(default=None, gt=0, le=100000)
    #: `true` = dispositivo de entrenamiento, no aeronave.
    #:
    #: El piloto anota el simulador en el libro como cualquier vuelo —fecha, horarios,
    #: el equipo— y las horas van a la columna de instrucción terrestre. Esta marca es
    #: lo que le permite al tracker de 61.620 **no** sumar esas horas a la experiencia
    #: total: las 200 h son horas de vuelo, y una sesión de simulador no lo es.
    #:
    #: Va en la aeronave y no en el vuelo porque así no se puede olvidar: se carga una
    #: vez al dar de alta el equipo y cada fila que lo use queda marcada sola.
    is_simulator: bool = False
    #: Lo fijo del avión para el plan de vuelo (migración 024): casilla 10,
    #: NAV/PBN/PER/OPR, color, ELT, observación fija. Lo arma y lo lee el frontend.
    plan_vuelo: Optional[Dict[str, Any]] = None
    #: `false` sólo desde el importador del libro (migración 059); el formulario del Hangar no lo manda.
    datos_completos: bool = True

    @field_validator("plan_vuelo")
    @classmethod
    def _plan_vuelo(cls, v: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        return validar_perfil_avion(v)


class AvionDelLibro(BaseModel):
    """Un avión leído del libro de vuelo: lo mínimo, y el resto lo completa el piloto."""

    registration: str = Field(min_length=1, max_length=16)
    #: Marca y modelo como figura en el libro ("Cessna 152"). Puede venir vacío.
    type: str = Field(default="", max_length=80)
    #: Sólo si se deduce con seguridad del modelo; si no, vacío.
    icao: str = Field(default="", max_length=8)
    type_acft: Optional[str] = Field(default=None, max_length=8)
    #: Una sesión de simulador del libro (fila sin matrícula): el equipo se crea marcado.
    is_simulator: bool = False

    @field_validator("registration", "type", "icao")
    @classmethod
    def _limpiar(cls, v: str) -> str:
        return " ".join((v or "").split())

    @field_validator("type_acft")
    @classmethod
    def _categoria(cls, v: Optional[str]) -> Optional[str]:
        v = (v or "").strip().upper()
        return v if v in {"MONT-T", "MULT-T", "MONT-H", "MULT-H"} else None


class AvionesDelLibro(BaseModel):
    aviones: list[AvionDelLibro] = Field(min_length=1, max_length=30)


class AircraftUpdate(BaseModel):
    registration: Optional[str] = None
    icao: Optional[str] = None
    type: Optional[str] = None
    type_acft: Optional[str] = None
    cost_per_hour: Optional[float] = None
    # Performance de crucero. Los tres son opcionales y **sin default**: un 110
    # inventado se vería igual que uno cargado por el piloto. Null es "no lo sé", y
    # el planificador lo dice en pantalla en vez de taparlo.
    cruise_tas_kt: Optional[float] = None
    fuel_burn_lph: Optional[float] = None
    fuel_capacity_l: Optional[float] = None
    #: Caballos de fuerza; la total si es multimotor. La pide la hoja del libro de
    #: vuelo de ANAC (Res. 147/2013). Opcional: en blanco, se completa a mano.
    potencia_hp: Optional[int] = Field(default=None, gt=0, le=100000)
    is_simulator: Optional[bool] = None
    #: Lo fijo del avión para el plan de vuelo (migración 024): casilla 10,
    #: NAV/PBN/PER/OPR, color, ELT, observación fija. Lo arma y lo lee el frontend.
    plan_vuelo: Optional[Dict[str, Any]] = None

    @field_validator("plan_vuelo")
    @classmethod
    def _plan_vuelo(cls, v: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        return validar_perfil_avion(v)


    #: Si es simulador, cuál es en el CAD de ANAC (migración 036). Lo elige el panel.
    cad_simulador: Optional[Dict[str, Any]] = None

    @field_validator("cad_simulador")
    @classmethod
    def _cad_simulador(cls, v: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        return validar_simulador_cad(v)
