"""
Los planes de vuelo guardados (migración 024): lo que el backend decide por su cuenta.

El formulario lo valida el frontend; acá se prueban la copia para la lista, los topes de
tamaño y el máximo de tres demoras por vuelo (AIP ENR 1.10, 7.3).

    python test_planes_de_vuelo.py
"""
import sys

from pydantic import ValidationError

from src.models.aircraft import AircraftUpdate
from src.models.plan_vuelo import (
    MAX_FORMULARIO_BYTES,
    FirmaPlanVuelo,
    PlanVueloCreate,
    PlanVueloResumen,
    PlanVueloUpdate,
    resumen_para_lista,
)

resultados = []


def check(label, condition):
    print(f"{'✅' if condition else '❌'} {label}")
    resultados.append(bool(condition))


def falla(fn):
    try:
        fn()
    except (ValidationError, ValueError):
        return True
    return False


form = {
    "matricula": "lv-s114",
    "salida": {"codigo": "sadf", "nombre": "San Fernando"},
    "destino": {"codigo": "SAAK", "nombre": "Martín García"},
    "dofUtc": "2026-10-20",
    "eobtUtc": "1830",
}
r = resumen_para_lista(form)
check("la lista copia salida, destino y matrícula en mayúsculas", (r["salida"], r["destino"], r["matricula"]) == ("SADF", "SAAK", "LV-S114"))
check("y la fecha y hora de salida", r["dof"] == "2026-10-20" and r["eobt"] == "1830")

malo = resumen_para_lista({"salida": "SADF", "dofUtc": "20/10/2026", "eobtUtc": "18:30"})
check("lo que no tiene la forma esperada queda en NULL, no inventado", malo == {"salida": None, "destino": None, "matricula": None, "dof": None, "eobt": None})
check("una fecha imposible también", resumen_para_lista({"dofUtc": "2026-02-31"})["dof"] is None)

check("un formulario normal se acepta", not falla(lambda: PlanVueloCreate(formulario=form)))
grande = {"x": "A" * (MAX_FORMULARIO_BYTES + 10)}
check("un formulario gigante se rechaza", falla(lambda: PlanVueloCreate(formulario=grande)))
check("también al actualizar", falla(lambda: PlanVueloUpdate(formulario=grande)))

tres = [{"eobt": "1900", "dof": "2026-10-20"}] * 3
check("hasta tres demoras por vuelo", not falla(lambda: PlanVueloUpdate(demoras=tres)))
check("la cuarta no (AIP ENR 1.10, 7.3)", falla(lambda: PlanVueloUpdate(demoras=tres + [{"eobt": "2000", "dof": "2026-10-20"}])))
check("una hora de demora mal escrita se rechaza", falla(lambda: PlanVueloUpdate(demoras=[{"eobt": "19:00", "dof": "2026-10-20"}])))

check("un envío de prueba o a la oficina se acepta", not falla(lambda: PlanVueloUpdate(envio={"modo": "prueba", "a": "piloto@example.com"})))
check("un envío de otro modo no", falla(lambda: PlanVueloUpdate(envio={"modo": "spam", "a": "x@example.com"})))
check("un envío sin tipo es del plan", PlanVueloUpdate(envio={"modo": "aro", "a": "x@example.com"}).envio.tipo == "fpl")
check("una demora se anota como dla", PlanVueloUpdate(envio={"modo": "aro", "tipo": "dla", "a": "x@example.com"}).envio.tipo == "dla")
check("un tipo inventado no", falla(lambda: PlanVueloUpdate(envio={"modo": "aro", "tipo": "spam", "a": "x@example.com"})))
check("la cancelación se anota como cnl", PlanVueloUpdate(envio={"modo": "aro", "tipo": "cnl", "a": "x@example.com"}).envio.tipo == "cnl")
check("cancelar es sólo true", falla(lambda: PlanVueloUpdate(cancelado=False)))
check("descartar es sólo true", PlanVueloUpdate(descartado=True).descartado is True and falla(lambda: PlanVueloUpdate(descartado=False)))
check("el vuelo es un uuid", falla(lambda: PlanVueloUpdate(vuelo_id="no-es-uuid")))
check("la lista trae cómo terminó", {"vuelo_id", "cancelado_at", "descartado_at"} <= set(PlanVueloResumen.model_fields))
check("la firma tiene que ser un PNG", falla(lambda: FirmaPlanVuelo(png="data:image/jpeg;base64,AAAA")))
check("un PNG se acepta", not falla(lambda: FirmaPlanVuelo(png="data:image/png;base64,iVBORw0KGgo=")))

check("el perfil del avión para el plan se acepta", not falla(lambda: AircraftUpdate(plan_vuelo={"equipo": "SDGZ", "vigilancia": "EB2", "per": "A"})))
check("y se rechaza si es enorme", falla(lambda: AircraftUpdate(plan_vuelo={"x": "A" * 9000})))
check("no mandarlo deja el campo como está", "plan_vuelo" not in AircraftUpdate(icao="ECHO").model_dump(exclude_unset=True))

from src.services.recordatorio_plan import armar_pendientes  # noqa: E402

_planes = [{"id": "p1", "user_id": "u1", "formulario": {"eet": "0045"}, "demoras": []}, {"id": "p2", "user_id": "u2", "formulario": {}}]
_usuarios = {"u1": {"email": "a@x.com", "email_confirmed_at": "2026-10-01T00:00:00Z"}, "u2": {"email": "b@x.com", "email_confirmed_at": None}}
_pend = armar_pendientes(_planes, _usuarios, {"u1": {"first_name": "Lucía"}}, [{"user_id": "u1", "date": "2026-10-20", "route": "SADF SADM"}, {"user_id": "u9", "date": "2026-10-20", "route": "X"}])
check("el recordatorio no le escribe a un mail sin confirmar", [p["id"] for p in _pend] == ["p1"])
check("el recordatorio lleva el nombre y sólo los vuelos de ese piloto", _pend[0]["first_name"] == "Lucía" and _pend[0]["vuelos"] == [{"date": "2026-10-20", "route": "SADF SADM"}])

# --- Respuestas de la oficina (migración 043) ---------------------------------------------
from pydantic import ValidationError as _VE  # noqa: E402

from src.controllers.planes_de_vuelo import envios_a_oficina  # noqa: E402
from src.models.plan_vuelo import RespuestaEntrante  # noqa: E402
from src.services.avisos import armar_aviso_respuesta_plan  # noqa: E402

_envios = [
    {"modo": "prueba", "tipo": "fpl", "a": "Piloto@x.com"},
    {"modo": "aro", "tipo": "fpl", "a": "ACMOR@eana.com.ar "},
    {"modo": "aro", "tipo": "dla", "a": "acmor@eana.com.ar"},
]
check("las oficinas del plan son los envíos 'aro', sin repetir ni contar las pruebas", envios_a_oficina(_envios) == ["acmor@eana.com.ar"])
check("sin envíos no hay oficinas (ni se rompe con basura)", envios_a_oficina(None) == [] and envios_a_oficina([1, {"modo": "aro"}]) == [])
check("la lista trae el estado de la última respuesta", {"respuesta_estado", "respuesta_at"} <= set(PlanVueloResumen.model_fields))
check("una respuesta con clasificación inventada no entra", falla(lambda: RespuestaEntrante(email_id="e1", de="a@b.c", clasificacion="genial")))
check("ni una con el texto sin tope", falla(lambda: RespuestaEntrante(email_id="e1", de="a@b.c", texto="x" * 4001)))
check("una normal sí, y avisa por defecto", RespuestaEntrante(email_id="e1", de="a@b.c").avisar is True)

_av = armar_aviso_respuesta_plan(
    "p-1", matricula="LV-ABC", salida="SADF", destino="SADM", clasificacion="aceptado",
    oficina="acmor@eana.com.ar", resumen="Plan aceptado, buen vuelo.",
)
check("el aviso dice el plan y el estado", _av["titulo"] == "Plan LV-ABC SADF→SADM: aceptado")
check("el cuerpo lleva la oficina y el resumen", _av["cuerpo"] == "acmor@eana.com.ar · Plan aceptado, buen vuelo.")
check("tocarlo abre el plan", _av["url"] == "/dashboard/plan-de-vuelo/p-1")
check(
    "'corregir' se lee 'piden corregir', y lo desconocido, genérico",
    armar_aviso_respuesta_plan("p", matricula=None, salida=None, destino=None, clasificacion="corregir", oficina=None, resumen=None)["titulo"]
    == "Plan ????→????: piden corregir"
    and armar_aviso_respuesta_plan("p", matricula="X", salida="A", destino="B", clasificacion="otra", oficina=None, resumen=None)["titulo"].endswith("respuesta de la oficina"),
)
check("sin oficina ni texto, el cuerpo manda a mirar el plan", "plan" in armar_aviso_respuesta_plan("p", matricula=None, salida=None, destino=None, clasificacion="otra", oficina=None, resumen=None)["cuerpo"])

# --- El PATCH que anota un envío (2026-11-12) -------------------------------------------------
# `self.leer(...)` adentro del PATCH era el route handler de Litestar, no el método: tiraba
# TypeError y ningún envío quedó anotado nunca, aunque el mail saliera.
import ast as _ast
import asyncio as _asyncio
import pathlib as _pathlib
import types as _types
import uuid as _uuid

from src.controllers.planes_de_vuelo import PlanesDeVueloController
from src.models.plan_vuelo import PlanVueloUpdate


def _llamadas_a_handlers(ruta: _pathlib.Path) -> list:
    """`self.<handler>(…)` donde <handler> es un método decorado con @get/@post/@patch/…"""
    arbol = _ast.parse(ruta.read_text())
    malas = []
    for clase in [n for n in arbol.body if isinstance(n, _ast.ClassDef)]:
        handlers = {
            m.name
            for m in clase.body
            if isinstance(m, (_ast.FunctionDef, _ast.AsyncFunctionDef))
            and any(
                isinstance(d, _ast.Call) and getattr(d.func, "id", "") in {"get", "post", "put", "patch", "delete", "route"}
                or getattr(d, "id", "") in {"get", "post", "put", "patch", "delete"}
                for d in m.decorator_list
            )
        }
        for nodo in _ast.walk(clase):
            if (
                isinstance(nodo, _ast.Call)
                and isinstance(nodo.func, _ast.Attribute)
                and isinstance(nodo.func.value, _ast.Name)
                and nodo.func.value.id == "self"
                and nodo.func.attr in handlers
            ):
                malas.append(f"{ruta.name}:{nodo.lineno} self.{nodo.func.attr}")
    return malas


_malas = [m for f in sorted(_pathlib.Path("src/controllers").glob("*.py")) for m in _llamadas_a_handlers(f)]
check(f"ningún controlador llama a un route handler como método ({_malas})", _malas == [])


class _Resp:
    def __init__(self, data):
        self.data = data


class _Consulta:
    def __init__(self, base, filas):
        self.base, self.filas, self.cambios = base, filas, None

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def update(self, cambios):
        self.cambios = cambios
        self.base.updates.append(cambios)
        return self

    def execute(self):
        if self.cambios is not None:
            return _Resp([{**self.filas[0], **self.cambios}])
        return _Resp(self.filas)


class _Cliente:
    def __init__(self, fila):
        self.fila, self.updates = fila, []

    def table(self, _nombre):
        return _Consulta(self, [self.fila])


_pid = _uuid.uuid4()
_uid = str(_uuid.uuid4())
_fila = {
    "id": str(_pid), "user_id": _uid, "aircraft_id": None, "formulario": {}, "completo": True,
    "salida": "SADM", "destino": "SRDL", "matricula": "LV-S048", "dof": "2026-11-12", "eobt": "1930",
    "descargado_at": None, "demoras": [], "created_at": "2026-11-12T10:00:00+00:00",
    "updated_at": "2026-11-12T10:00:00+00:00", "envios": [], "enviado_at": None, "vuelo_id": None,
    "cancelado_at": None, "descartado_at": None, "recordatorio_at": None,
    "respuesta_estado": None, "respuesta_at": None,
}
_cli = _Cliente(_fila)
_req = _types.SimpleNamespace(state=_types.SimpleNamespace(user=_types.SimpleNamespace(id=_uid)))
_ctrl = PlanesDeVueloController.__new__(PlanesDeVueloController)
try:
    _plan = _asyncio.run(
        PlanesDeVueloController.actualizar.fn(
            _ctrl, _req, _cli, _pid, PlanVueloUpdate(envio={"modo": "aro", "tipo": "fpl", "a": "acmor@eana.com.ar"})
        )
    )
    _ok = True
except Exception as e:  # noqa: BLE001
    print("  ", type(e).__name__, e)
    _ok, _plan = False, None
check("el PATCH con un envío no se rompe", _ok)
check(
    "y anota el envío a la oficina con enviado_at",
    _ok and len(_cli.updates) == 1 and len(_cli.updates[0]["envios"]) == 1
    and _cli.updates[0]["envios"][0]["a"] == "acmor@eana.com.ar" and bool(_cli.updates[0].get("enviado_at")),
)

if not all(resultados):
    print(f"\n{resultados.count(False)} check(s) fallaron")
    sys.exit(1)
print(f"\n{len(resultados)} checks OK")
