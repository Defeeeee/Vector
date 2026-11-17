"""
Registrar un vuelo sin señal (migración 058): el mismo alta reintentado es un solo vuelo y no
cobra el saldo dos veces. Offline: base de mentira, sin Supabase.

    SUPABASE_URL=https://dummy.supabase.co SUPABASE_PUBLISHABLE_KEY=dummy-key python test_flights_clave_cliente.py
"""
import asyncio
import sys
from types import SimpleNamespace
from uuid import uuid4

from src.controllers.flights import FlightsController
from src.models.flight import FlightCreate
from src.services import derived_expiries

resultados = []


def check(label, condition):
    print(f"{'✅' if condition else '❌'} {label}")
    resultados.append(bool(condition))


class Consulta:
    def __init__(self, filas):
        self.filas, self.modo, self.valores, self.filtros = filas, "select", None, []

    def select(self, *_a, **_k):
        return self

    def insert(self, valores):
        self.modo, self.valores = "insert", valores
        return self

    def eq(self, col, v):
        self.filtros.append(lambda f: str(f.get(col)) == str(v))
        return self

    def limit(self, *_a):
        return self

    def execute(self):
        if self.modo == "insert":
            fila = {"id": str(uuid4()), **self.valores}
            self.filas.append(fila)
            return SimpleNamespace(data=[dict(fila)], count=1)
        hallados = [f for f in self.filas if all(fl(f) for fl in self.filtros)]
        return SimpleNamespace(data=[dict(f) for f in hallados], count=len(hallados))


class Base:
    def __init__(self):
        self.flights = []
        self.logbooks = [{"id": str(uuid4()), "user_id": YO, "is_default": True}]

    def table(self, nombre):
        return Consulta(self.flights if nombre == "flights" else self.logbooks)


YO, OTRO = "11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"
pedido = lambda u: SimpleNamespace(state=SimpleNamespace(user=SimpleNamespace(id=u)))
ctl = FlightsController(owner=None)

cobros, auditorias = [], []


async def cobrar(**kw):
    cobros.append(kw)


ctl._sync_flight_transaction = cobrar
ctl._refresh_audit = lambda *a, **k: auditorias.append(a)
derived_expiries.recompute_for_user_safe = lambda *a, **k: None
crear = FlightsController.create_flight.fn


def alta(clave=None):
    return FlightCreate(
        date="2026-11-17", route="SADF SADF", landings=1, duration=1.0,
        takeoff="2026-11-17T13:00:00Z", landing="2026-11-17T14:00:00Z", clave_cliente=clave,
    )


base = Base()
k = uuid4()
v1 = asyncio.run(crear(ctl, pedido(YO), base, alta(k)))
check("crea el vuelo y guarda la clave", len(base.flights) == 1 and base.flights[0]["clave_cliente"] == str(k))
v2 = asyncio.run(crear(ctl, pedido(YO), base, alta(k)))
check("el reintento devuelve el mismo vuelo", v2.id == v1.id)
check("…sin crear otro", len(base.flights) == 1)
check("…ni cobrar de nuevo el saldo", len(cobros) == 1)
check("…ni rehacer la auditoría", len(auditorias) == 1)

v3 = asyncio.run(crear(ctl, pedido(OTRO), base, alta(k)))
check("la clave es por piloto: otro con la misma clave crea el suyo", v3.id != v1.id and len(base.flights) == 2)

asyncio.run(crear(ctl, pedido(YO), base, alta(uuid4())))
check("otra clave, otro vuelo", len(base.flights) == 3 and len(cobros) == 3)

asyncio.run(crear(ctl, pedido(YO), base, alta()))
asyncio.run(crear(ctl, pedido(YO), base, alta()))
check("sin clave se crea como siempre (no deduplica)", len(base.flights) == 5 and "clave_cliente" not in base.flights[3])

if not all(resultados):
    print(f"\n{resultados.count(False)} fallaron")
    sys.exit(1)
print(f"\n{len(resultados)} ok")
