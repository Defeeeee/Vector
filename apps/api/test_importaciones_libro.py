"""
Importaciones del libro y aviones agregados desde él (migración 059).

    python test_importaciones_libro.py
"""
import asyncio
import datetime as dt
import sys
from types import SimpleNamespace
from uuid import uuid4

from litestar.exceptions import NotAuthorizedException, NotFoundException
from pydantic import ValidationError

import src.controllers.importaciones_libro as il
import src.controllers.aircraft as ac
from src.config import settings
from src.models.aircraft import Aircraft, AvionesDelLibro, AvionDelLibro

resultados = []


def check(label, condition):
    print(f"{'✅' if condition else '❌'} {label}")
    resultados.append(bool(condition))


class Consulta:
    def __init__(self, filas):
        self.filas, self.modo, self.valores, self.filtros = filas, "select", None, []

    def select(self, *_a, **_k): return self
    def update(self, v): self.modo, self.valores = "update", v; return self
    def insert(self, v): self.modo, self.valores = "insert", v; return self
    def limit(self, *_a): return self
    def order(self, *_a, **_k): return self

    def eq(self, c, v): self.filtros.append(lambda f: str(f.get(c)) == str(v)); return self
    def in_(self, c, vs): self.filtros.append(lambda f: f.get(c) in set(vs)); return self
    def is_(self, c, _n): self.filtros.append(lambda f: f.get(c) is None); return self

    def execute(self):
        if self.modo == "insert":
            fila = {"id": str(uuid4()), "estado": "subido", "aviso_enviado_at": None, "datos_completos": True, **self.valores}
            self.filas.append(fila)
            return SimpleNamespace(data=[dict(fila)])
        hallados = [f for f in self.filas if all(fl(f) for fl in self.filtros)]
        if self.modo == "update":
            for f in hallados:
                f.update(self.valores)
        return SimpleNamespace(data=[dict(f) for f in hallados])


class Base:
    def __init__(self, **t): self.t = t
    def table(self, n): return Consulta(self.t[n])


def pedido(u, cabeceras=None):
    return SimpleNamespace(state=SimpleNamespace(user=SimpleNamespace(id=u)), headers=cabeceras or {})


def corre(c): return asyncio.run(c)


def lanza(clase, c):
    try:
        corre(c)
    except clase:
        return True
    return False


YO, OTRO = "11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"
ahora = dt.datetime(2026, 11, 17, 12, 0, tzinfo=dt.timezone.utc)

# ---- lo puro
c = il.cambios_de_progreso(il.Progreso(paginas_leidas=6), ahora)
check("el progreso siempre marca el latido y no pisa lo no mandado", c == {"paginas_leidas": 6, "latido_at": ahora.isoformat()})
check("terminar marca terminado_at", "terminado_at" in il.cambios_de_progreso(il.Progreso(estado="listo"), ahora))
viejo = (ahora - dt.timedelta(minutes=11)).isoformat()
fresco = (ahora - dt.timedelta(minutes=2)).isoformat()
check("procesando sin latido se retoma", il.hay_que_retomar({"estado": "procesando", "latido_at": viejo}, ahora))
check("procesando con latido fresco no", not il.hay_que_retomar({"estado": "procesando", "latido_at": fresco}, ahora))
check("listo sin mail se retoma para avisar", il.hay_que_retomar({"estado": "listo", "latido_at": fresco, "aviso_enviado_at": None}, ahora))
check("listo con mail no", not il.hay_que_retomar({"estado": "listo", "latido_at": viejo, "aviso_enviado_at": "x"}, ahora))
check("importado no se retoma", not il.hay_que_retomar({"estado": "importado", "latido_at": viejo}, ahora))
try:
    il.NuevaImportacion(paginas_total=121)
    tope = False
except ValidationError:
    tope = True
check("más de 120 hojas no pasa", tope)

# ---- controlador del piloto y el interno, con base de mentira
tabla = []
il._cliente = lambda: Base(importaciones_libro=tabla)
L = il.ImportacionesLibroController
I = il.ImportacionesInternasController
ctl = L(owner=None)
interno = I(owner=None)

mia = corre(L.crear.fn(ctl, pedido(YO), il.NuevaImportacion(paginas_total=40)))
ajena = corre(L.crear.fn(ctl, pedido(OTRO), il.NuevaImportacion(paginas_total=3)))
check("crea para quien pide", mia["user_id"] == YO and mia["estado"] == "subido")
check("lista sólo las propias", [f["id"] for f in corre(L.listar.fn(ctl, pedido(YO)))] == [mia["id"]])
check("lee la propia", corre(L.leer.fn(ctl, pedido(YO), mia["id"]))["id"] == mia["id"])
check("no lee la de otro", lanza(NotFoundException, L.leer.fn(ctl, pedido(YO), ajena["id"])))
check("no descarta la de otro", lanza(NotFoundException, L.descartar.fn(ctl, pedido(YO), ajena["id"])))
check("no se da por importada una que no está lista", lanza(NotFoundException, L.importado.fn(ctl, pedido(YO), mia["id"])))

settings.documents_alert_secret = "secreto"
check("el progreso sin secreto no entra", lanza(NotAuthorizedException, I.progreso.fn(interno, pedido(YO), mia["id"], il.Progreso(paginas_leidas=1))))
bien = pedido(YO, {"X-Cron-Secret": "secreto"})
r = corre(I.progreso.fn(interno, bien, mia["id"], il.Progreso(estado="procesando", paginas_leidas=12)))
check("con el secreto avanza", r["actualizada"] and tabla[0]["paginas_leidas"] == 12 and tabla[0]["estado"] == "procesando")
corre(I.progreso.fn(interno, bien, mia["id"], il.Progreso(estado="listo", resultado={"vuelos": []})))
check("una descartada por el piloto no se reabre", (corre(L.descartar.fn(ctl, pedido(OTRO), ajena["id"])) or True) and not corre(I.progreso.fn(interno, bien, ajena["id"], il.Progreso(estado="listo")))["actualizada"])

enviados = []
il.enviar_aviso = lambda uid, aviso: enviados.append((uid, aviso))
a1 = corre(I.reservar_aviso.fn(interno, bien, mia["id"]))
a2 = corre(I.reservar_aviso.fn(interno, bien, mia["id"]))
check("el aviso se reserva una sola vez", a1["reservado"] and not a2["reservado"] and len(enviados) == 1)
check("el push no lleva datos del libro", "importacion=" in enviados[0][1]["url"] and not any(ch.isdigit() for ch in enviados[0][1]["cuerpo"]))
corre(I.liberar_aviso.fn(interno, bien, mia["id"]))
check("liberar permite reintentar", corre(I.reservar_aviso.fn(interno, bien, mia["id"]))["reservado"])
corre(L.importado.fn(ctl, pedido(YO), mia["id"]))
check("lista -> importada", tabla[0]["estado"] == "importado")

# ---- aviones desde el libro
ahora_av = []
aviones = [{"id": str(uuid4()), "user_id": YO, "registration": "LV-ABC", "type": "Cessna 152", "icao": "C152", "type_acft": "MONT-T", "datos_completos": True}]
base = Base(aircraft=aviones)
ac.enviar_aviso = lambda uid, aviso: ahora_av.append(aviso)
A = ac.AircraftController
cc = A(owner=None)
pedidos = AvionesDelLibro(aviones=[AvionDelLibro(registration="lv abc", type="Cessna 152"), AvionDelLibro(registration="LV-XYZ", type="Tecnam P2008", icao="P2008", type_acft="MONT-T")])
res = corre(A.crear_desde_libro.fn(cc, pedido(YO), base, pedidos))
check("no duplica uno que ya está (misma matrícula normalizada)", len(aviones) == 2 and str(res[0].id) == aviones[0]["id"])
check("crea el que falta, incompleto", res[1].registration == "LV-XYZ" and res[1].datos_completos is False)
check("devuelve uno por matrícula, en orden", [a.registration for a in res] == ["LV-ABC", "LV-XYZ"])
check("avisa con la cantidad de nuevos", len(ahora_av) == 1 and "1 avión" in ahora_av[0]["titulo"])
check("GET trae datos_completos", Aircraft(**aviones[1]).datos_completos is False and Aircraft(**aviones[0]).datos_completos is True)
check("completo = modelo, OACI y categoría", not ac.datos_completos(aviones[1] | {"icao": ""}) and ac.datos_completos(aviones[1] | {"icao": "P208"}))
check("la categoría inválida se descarta", AvionDelLibro(registration="X", type_acft="otra").type_acft is None)

# Completarlo desde el Hangar lo apaga.
from src.models.aircraft import AircraftUpdate
r2 = corre(A.update_aircraft.fn(cc, pedido(YO), base, __import__("uuid").UUID(aviones[1]["id"]), AircraftUpdate(icao="P2008", type_acft="MONT-T", type="Tecnam P2008")))
check("al guardar lo que faltaba queda completo", r2.datos_completos is True and aviones[1]["datos_completos"] is True)

if not all(resultados):
    print(f"\n{resultados.count(False)} fallaron")
    sys.exit(1)
print(f"\n{len(resultados)} ok")
