"""
Las checklists del avión (migración 054): topes, forma y que cada piloto sólo toque las suyas.

    python test_checklists.py
"""
import asyncio
import sys
from types import SimpleNamespace
from uuid import UUID, uuid4

from litestar.exceptions import ClientException, NotFoundException
from pydantic import ValidationError

from src.controllers.checklists import ChecklistsController
from src.models.aircraft import Aircraft
from src.models.checklists import (
    AsignarAviones,
    ChecklistEdicion,
    ChecklistIn,
    parsear,
    validar_forma,
)

resultados = []


def check(label, condition):
    print(f"{'✅' if condition else '❌'} {label}")
    resultados.append(bool(condition))


def falla(fn):
    try:
        fn()
    except ValidationError:
        return True
    return False


EJEMPLO = """Revisá el tanque antes.
# Antes del despegue
- Frenos: PUESTOS
- Mezcla: RICA
  - A. Tocar la palanca
  - B. Verificar el tope
> NOTA: con viento cruzado:
  - Alerones hacia el viento
# Cierre
algo suelto
"""

p = parsear(EJEMPLO)
check("la introducción es una sección sin título y sus líneas sueltas son notas", p[0][0] is None and p[0][1][0][0] == "nota")
check("hay tres secciones", len(p) == 3 and p[1][0] == "Antes del despegue")
check("los sub-pasos cuelgan del paso", p[1][1][1][2] == ["A. Tocar la palanca", "B. Verificar el tope"])
check("las notas llevan sub-pasos", p[1][1][2][0] == "nota" and p[1][1][2][2] == ["Alerones hacia el viento"])
check("una línea suelta es un paso", p[2][1][0] == ("paso", "algo suelto", []))
check("el formato pasa la validación", validar_forma(EJEMPLO) is None)

check("el nombre se compacta", ChecklistIn(nombre="  Astore   general ", texto="").nombre == "Astore general")
check("sin nombre no pasa", falla(lambda: ChecklistIn(nombre="  ", texto="")))
check("nombre de más de 80 no pasa", falla(lambda: ChecklistIn(nombre="a" * 81, texto="")))
check("texto de más de 40.000 no pasa", falla(lambda: ChecklistIn(nombre="a", texto="- x\n" * 20_000)))
check("41 secciones no pasan", falla(lambda: ChecklistIn(nombre="a", texto="\n".join(f"# S{i}" for i in range(41)))))
check("40 secciones pasan", ChecklistIn(nombre="a", texto="\n".join(f"# S{i}" for i in range(40))) is not None)
check("81 elementos en una sección no pasan", falla(lambda: ChecklistIn(nombre="a", texto="# S\n" + "\n".join(f"- p{i}" for i in range(81)))))
check("un paso de 301 letras no pasa", falla(lambda: ChecklistIn(nombre="a", texto="- " + "x" * 301)))
check("13 sub-pasos no pasan", falla(lambda: ChecklistIn(nombre="a", texto="- p\n" + "\n".join(f"  - s{i}" for i in range(13)))))
check("la edición valida igual", falla(lambda: ChecklistEdicion(nombre="a", texto="- " + "x" * 301)))
check("avioness repetidos se compactan", len(AsignarAviones(aircraft_ids=[UUID(int=1), UUID(int=1)]).aircraft_ids) == 1)

# El modelo del avión expone la checklist.
a = Aircraft(id=uuid4(), user_id=uuid4(), registration="LV-X", icao="P92", type="Tecnam", checklist_id=uuid4())
check("Aircraft trae checklist_id", a.checklist_id is not None)

# ------------------------------------------------ controlador, base de mentira


class Consulta:
    def __init__(self, filas):
        self.filas = filas
        self.modo, self.valores, self.filtros = "select", None, []

    def select(self, *_a, **_k):
        return self

    def update(self, valores):
        self.modo, self.valores = "update", valores
        return self

    def insert(self, valores):
        self.modo, self.valores = "insert", valores
        return self

    def delete(self):
        self.modo = "delete"
        return self

    def eq(self, col, v):
        self.filtros.append(lambda f: str(f.get(col)) == str(v))
        return self

    def in_(self, col, vs):
        vs = {str(x) for x in vs}
        self.filtros.append(lambda f: str(f.get(col)) in vs)
        return self

    def limit(self, *_a):
        return self

    def order(self, *_a):
        return self

    def execute(self):
        if self.modo == "insert":
            fila = {"id": str(uuid4()), "updated_at": None, **self.valores}
            self.filas.append(fila)
            return SimpleNamespace(data=[dict(fila)], count=1)
        hallados = [f for f in self.filas if all(fl(f) for fl in self.filtros)]
        if self.modo == "delete":
            for f in hallados:
                self.filas.remove(f)
        if self.modo == "update":
            for f in hallados:
                f.update(self.valores)
        return SimpleNamespace(data=[dict(f) for f in hallados], count=len(hallados))


class BaseFalsa:
    def __init__(self, **tablas):
        self.tablas = tablas

    def table(self, nombre):
        return Consulta(self.tablas[nombre])


def pedido(user):
    return SimpleNamespace(state=SimpleNamespace(user=SimpleNamespace(id=user)))


def corre(coro):
    return asyncio.run(coro)


def lanza(clase, coro):
    try:
        corre(coro)
    except clase:
        return True
    return False


YO, OTRO = "11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"
A1, A2, A3, AJENO = (str(uuid4()) for _ in range(4))
base = BaseFalsa(
    checklists=[],
    aircraft=[
        {"id": A1, "user_id": YO, "checklist_id": None},
        {"id": A2, "user_id": YO, "checklist_id": None},
        {"id": A3, "user_id": YO, "checklist_id": None},
        {"id": AJENO, "user_id": OTRO, "checklist_id": None},
    ],
)
ctl = ChecklistsController(owner=None)
C = ChecklistsController

c = corre(C.crear.fn(ctl, pedido(YO), base, ChecklistIn(nombre="Astore general", texto=EJEMPLO)))
check("crea y devuelve el texto", c.nombre == "Astore general" and c.texto == EJEMPLO)
ajena = corre(C.crear.fn(ctl, pedido(OTRO), base, ChecklistIn(nombre="De otro", texto="- x")))

lista = corre(C.listar.fn(ctl, pedido(YO), base))
check("la lista es sólo la propia y sin texto", [x.nombre for x in lista] == ["Astore general"] and not hasattr(lista[0], "texto"))
check("se lee la propia", corre(C.leer.fn(ctl, pedido(YO), base, c.id)).texto == EJEMPLO)
check("no se lee la de otro", lanza(NotFoundException, C.leer.fn(ctl, pedido(YO), base, ajena.id)))

g = corre(C.guardar.fn(ctl, pedido(YO), base, c.id, ChecklistEdicion(nombre="Astore", texto="- uno")))
check("guarda nombre y texto", g.nombre == "Astore" and g.texto == "- uno" and g.updated_at is not None)
check("no guarda la de otro", lanza(NotFoundException, C.guardar.fn(ctl, pedido(YO), base, ajena.id, ChecklistEdicion(nombre="x", texto=""))))

av = lambda i: next(a for a in base.tablas["aircraft"] if a["id"] == i)
r = corre(C.asignar_aviones.fn(ctl, pedido(YO), base, c.id, AsignarAviones(aircraft_ids=[UUID(A1), UUID(A2)])))
check("asigna a los dos", av(A1)["checklist_id"] == str(c.id) and av(A2)["checklist_id"] == str(c.id) and av(A3)["checklist_id"] is None)
corre(C.asignar_aviones.fn(ctl, pedido(YO), base, c.id, AsignarAviones(aircraft_ids=[UUID(A2), UUID(A3)])))
check("deja exactamente esos: el que no está queda sin checklist", av(A1)["checklist_id"] is None and av(A2)["checklist_id"] == str(c.id) and av(A3)["checklist_id"] == str(c.id))
check("no asigna un avión de otro", lanza(NotFoundException, C.asignar_aviones.fn(ctl, pedido(YO), base, c.id, AsignarAviones(aircraft_ids=[UUID(A1), UUID(AJENO)]))))
check("…y no cambió nada", av(AJENO)["checklist_id"] is None and av(A1)["checklist_id"] is None)
check("no asigna la checklist de otro", lanza(NotFoundException, C.asignar_aviones.fn(ctl, pedido(YO), base, ajena.id, AsignarAviones(aircraft_ids=[UUID(A1)]))))
corre(C.asignar_aviones.fn(ctl, pedido(YO), base, c.id, AsignarAviones(aircraft_ids=[])))
check("con la lista vacía la suelta de todos", all(av(i)["checklist_id"] is None for i in (A1, A2, A3)))

check("no borra la de otro", lanza(NotFoundException, C.borrar.fn(ctl, pedido(YO), base, ajena.id)))
corre(C.borrar.fn(ctl, pedido(YO), base, c.id))
check("borra la propia", [x["nombre"] for x in base.tablas["checklists"]] == ["De otro"])

for i in range(40):
    corre(C.crear.fn(ctl, pedido(YO), base, ChecklistIn(nombre=f"c{i}", texto="")))
check("hasta 40 checklists", lanza(ClientException, C.crear.fn(ctl, pedido(YO), base, ChecklistIn(nombre="una más", texto=""))))

if not all(resultados):
    print(f"\n{resultados.count(False)} fallaron")
    sys.exit(1)
print(f"\n{len(resultados)} ok")
