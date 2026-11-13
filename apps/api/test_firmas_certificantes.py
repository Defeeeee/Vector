"""
Las firmas de los certificantes y el dorso de las hojas (migración 047): lo que valida el modelo.

    python test_firmas_certificantes.py
"""
import base64
import sys
from uuid import uuid4

from pydantic import ValidationError

import asyncio
from types import SimpleNamespace

from litestar.exceptions import ClientException, NotFoundException

from src.controllers.firmas import FirmasController
from src.controllers.flights import FlightsController
from src.models.firmas import (
    MAX_FIRMA_CHARS,
    AsignarVuelos,
    DorsoHojaIn,
    FirmaCertificanteEdicion,
    FirmaCertificanteIn,
)
from src.models.flight import FlightCreate, FlightUpdate
from src.services import certificantes as svc

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


CABECERA = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20
PNG = "data:image/png;base64," + base64.b64encode(CABECERA).decode()
JPG = "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8\xff").decode()
FALSO = "data:image/png;base64," + base64.b64encode(b"<svg onload=alert(1)>").decode()

f = FirmaCertificanteIn(nombre="  juan   pérez ", licencia=" ina 12345 ", autoridad_id=7, png=PNG)
check("la aclaración va en mayúsculas y sin espacios de más", f.nombre == "JUAN PÉREZ")
check("la licencia también", f.licencia == "INA 12345")
check("sin licencia queda en None", FirmaCertificanteIn(nombre="A", licencia="  ", png=PNG).licencia is None)
check("una firma sin nombre no pasa", falla(lambda: FirmaCertificanteIn(nombre="   ", png=PNG)))
check("un JPG no pasa", falla(lambda: FirmaCertificanteIn(nombre="A", png=JPG)))
check("un PNG que no lo es (cabecera) no pasa", falla(lambda: FirmaCertificanteIn(nombre="A", png=FALSO)))
check("base64 roto no pasa", falla(lambda: FirmaCertificanteIn(nombre="A", png="data:image/png;base64,@@@")))
check(
    "pasar el tope no pasa",
    falla(lambda: FirmaCertificanteIn(nombre="A", png="data:image/png;base64," + "A" * MAX_FIRMA_CHARS)),
)

lb = uuid4()
d = DorsoHojaIn(logbook_id=lb, hoja=3, png=PNG, aclaracion=" pedro  gómez ", fecha="2026-11-02")
check("el dorso normaliza la aclaración", d.aclaracion == "PEDRO GÓMEZ")
check("el dorso toma la fecha", d.fecha.isoformat() == "2026-11-02")
check("el dorso admite hasta MAX_DORSO_CHARS", DorsoHojaIn(logbook_id=lb, hoja=1, png=PNG).png == PNG)
check("el dorso puede ir sin imagen", DorsoHojaIn(logbook_id=lb, hoja=1, aclaracion="X").png is None)
check("la hoja 0 no existe", falla(lambda: DorsoHojaIn(logbook_id=lb, hoja=0)))
check("un dorso con JPG no pasa", falla(lambda: DorsoHojaIn(logbook_id=lb, hoja=1, png=JPG)))


# --------------------------------------------------------------- 048: modelos

f2 = FirmaCertificanteIn(nombre="A", png=PNG, alias=[" gustavo emilio  macedo IV", "Gustavo Macedo", "GUSTAVO MACEDO"], automatica=False)
check("los alias van normalizados y sin repetir", f2.alias == ["GUSTAVO EMILIO MACEDO IV", "GUSTAVO MACEDO"])
check("automatica llega como se mandó", f2.automatica is False)
check("sin alias ni sello no se mandan (no pisan lo guardado)", "alias" not in FirmaCertificanteIn(nombre="A", png=PNG).model_fields_set)
check("más de 20 alias no pasan", falla(lambda: FirmaCertificanteIn(nombre="A", png=PNG, alias=[f"N{i}" for i in range(21)])))
check("el sello es un PNG", falla(lambda: FirmaCertificanteIn(nombre="A", png=PNG, png_sello=JPG)))
check("el sello admite el tope del dorso", FirmaCertificanteIn(nombre="A", png=PNG, png_sello=PNG).png_sello == PNG)
e = FirmaCertificanteEdicion(png_sello=None, alias=["pérez"])
check("la edición distingue 'quitar el sello' de 'no tocarlo'", "png_sello" in e.model_fields_set and "png" not in e.model_fields_set)
check("la edición normaliza alias", e.alias == ["PEREZ"])
check("un nombre vacío en la edición no pasa", falla(lambda: FirmaCertificanteEdicion(nombre="  ")))
check("firma 'quizás' no existe", falla(lambda: AsignarVuelos(vuelo_ids=[uuid4()], firma="quizas")))
check("hay que elegir al menos un vuelo", falla(lambda: AsignarVuelos(vuelo_ids=[])))
check("el dorso toma las personas", len(DorsoHojaIn(logbook_id=lb, hoja=1, certificante_ids=[uuid4(), uuid4()]).certificante_ids) == 2)
check("más de 12 personas en un dorso no pasan", falla(lambda: DorsoHojaIn(logbook_id=lb, hoja=1, certificante_ids=[uuid4() for _ in range(13)])))
check("el vuelo trae certificante_firma si o no", FlightUpdate(certificante_firma="si").certificante_firma == "si")
check("el vuelo no admite otra anulación", falla(lambda: FlightUpdate(certificante_firma="tal vez")))

# ------------------------------------------------------- 048: comparar nombres

MACEDO = {"id": "p-macedo", "nombre": "GUSTAVO EMILIO MACEDO", "alias": [], "autoridad_id": 4}
GIMENEZ = {"id": "p-gim", "nombre": "GUSTAVO GIMENEZ", "alias": []}
check("mismo nombre", svc.forma_de_coincidir("Gustavo Emilio Macedo", "GUSTAVO EMILIO MACEDO") == svc.EXACTA)
check("con acentos y comas", svc.forma_de_coincidir("Macedo, Gustavo Emilio", "gustavo emílio macedo") == svc.PALABRAS)
check("con la licencia pegada", svc.forma_de_coincidir("GUSTAVO EMILIO MACEDO IV 25358574", MACEDO["nombre"]) == svc.CON_LICENCIA)
check("sólo números después", svc.forma_de_coincidir("GUSTAVO EMILIO MACEDO 25358574", MACEDO["nombre"]) == svc.CON_LICENCIA)
check("otro apellido no es la misma persona", svc.forma_de_coincidir("GUSTAVO GIMENEZ", MACEDO["nombre"]) == 0)
check("un nombre de más no es licencia", svc.forma_de_coincidir("GUSTAVO EMILIO MACEDO JUAN", MACEDO["nombre"]) == 0)
check("un nombre de menos no alcanza", svc.forma_de_coincidir("GUSTAVO MACEDO", MACEDO["nombre"]) == 0)
check("vacío no coincide con nada", svc.forma_de_coincidir("", MACEDO["nombre"]) == 0 and svc.forma_de_coincidir("X", "") == 0)
con_alias = {**MACEDO, "alias": ["GUSTAVO MACEDO"]}
check("un alias suma", svc.mejor_forma("gustavo macedo", con_alias) == svc.EXACTA)
check("persona_de elige la de mejor coincidencia", svc.persona_de("GUSTAVO GIMENEZ", [MACEDO, GIMENEZ])["id"] == "p-gim")
dos = [MACEDO, {**MACEDO, "id": "otro"}]
check("empate: no elige a ninguna", svc.persona_de("GUSTAVO EMILIO MACEDO", dos) is None)
check("sin nombre en el vuelo: nadie", svc.persona_de(None, [MACEDO]) is None)

V = lambda i, n, c=None: {"id": f"v{i}", "cad_autoridad_nombre": n, "certificante_id": c}
vuelos = (
    [V(i, "GUSTAVO EMILIO MACEDO") for i in range(45)]
    + [V(45, "GUSTAVO EMILIO MACEDO IV 25358574"), V(46, "GUSTAVO GIMENEZ"), V(47, None), V(48, ""), V(49, "PEDRO NADIE")]
    + [V(50, "GUSTAVO EMILIO MACEDO", c="p-macedo")]
)
sug = svc.sugerencias([MACEDO, GIMENEZ], vuelos)
por_nombre = {s["nombre_en_vuelos"]: s for s in sug}
check("45 vuelos dicen el nombre exacto (el ya asignado no cuenta)", len(por_nombre["GUSTAVO EMILIO MACEDO"]["vuelo_ids"]) == 45)
check("el nombre exacto no pide sumar alias", por_nombre["GUSTAVO EMILIO MACEDO"]["sumar_alias"] is False)
check("con licencia: asocia a Macedo y suma el alias", por_nombre["GUSTAVO EMILIO MACEDO IV 25358574"]["certificante_id"] == "p-macedo"
      and por_nombre["GUSTAVO EMILIO MACEDO IV 25358574"]["sumar_alias"] is True)
check("Giménez va a Giménez", por_nombre["GUSTAVO GIMENEZ"]["certificante_id"] == "p-gim")
check("sin nombre o de nadie, sin sugerencia", len(sug) == 3 and "PEDRO NADIE" not in por_nombre)
check("las sugerencias van de la más grande a la más chica", sug[0]["nombre_en_vuelos"] == "GUSTAVO EMILIO MACEDO")

c, aviso = svc.completar_autoridad({"cad_autoridad_nombre": None}, MACEDO)
check("sin nombre se completa con el de la persona y su cargo", c == {"cad_autoridad_nombre": "GUSTAVO EMILIO MACEDO", "cad_autoridad_id": 4} and aviso is None)
c, aviso = svc.completar_autoridad({"cad_autoridad_nombre": "  ", "cad_autoridad_id": 9}, MACEDO)
check("si ya tiene cargo no lo pisa", c == {"cad_autoridad_nombre": "GUSTAVO EMILIO MACEDO"})
c, aviso = svc.completar_autoridad({"cad_autoridad_nombre": "GUSTAVO GIMENEZ"}, MACEDO)
check("con otro nombre no se pisa y avisa", c == {} and "GUSTAVO GIMENEZ" in aviso and "no lo cambié" in aviso)
c, aviso = svc.completar_autoridad({"cad_autoridad_nombre": "GUSTAVO EMILIO MACEDO IV 25358574"}, MACEDO)
check("con otra grafía de la misma persona no hace falta avisar", c == {} and aviso is None)

# --------------------------------------------- 048: controladores, base de mentira


class Consulta:
    def __init__(self, filas, tabla):
        self.filas, self.tabla = filas, tabla
        self.modo, self.valores, self.filtros = "select", None, []

    def select(self, *_a, **_k):
        return self

    def update(self, valores):
        self.modo, self.valores = "update", valores
        return self

    def upsert(self, *_a, **_k):
        return self

    def eq(self, col, v):
        self.filtros.append(lambda f: str(f.get(col)) == str(v))
        return self

    def in_(self, col, vs):
        vs = {str(x) for x in vs}
        self.filtros.append(lambda f: str(f.get(col)) in vs)
        return self

    def is_(self, col, v):
        self.filtros.append(lambda f: f.get(col) is None)
        return self

    def limit(self, *_a):
        return self

    def order(self, *_a):
        return self

    def execute(self):
        hallados = [f for f in self.filas if all(fl(f) for fl in self.filtros)]
        if self.modo == "update":
            for f in hallados:
                f.update(self.valores)
        return SimpleNamespace(data=[dict(f) for f in hallados], count=len(hallados))


class BaseFalsa:
    def __init__(self, **tablas):
        self.tablas = tablas

    def table(self, nombre):
        return Consulta(self.tablas[nombre], nombre)


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
P_YO, P_OTRO = str(uuid4()), str(uuid4())
VA, VB, VC, VAJENO = str(uuid4()), str(uuid4()), str(uuid4()), str(uuid4())
base = BaseFalsa(
    firmas_certificantes=[
        {"id": P_YO, "user_id": YO, "nombre": "GUSTAVO EMILIO MACEDO", "licencia": None, "autoridad_id": 4, "alias": [], "automatica": True, "png": PNG},
        {"id": P_OTRO, "user_id": OTRO, "nombre": "OTRO INSTRUCTOR", "autoridad_id": None, "alias": [], "automatica": True, "png": PNG},
    ],
    flights=[
        {"id": VA, "user_id": YO, "cad_autoridad_nombre": None, "cad_autoridad_id": None, "certificante_id": None, "certificante_firma": None},
        {"id": VB, "user_id": YO, "cad_autoridad_nombre": "GUSTAVO GIMENEZ", "cad_autoridad_id": 5, "certificante_id": None, "certificante_firma": None},
        {"id": VC, "user_id": YO, "cad_autoridad_nombre": "GUSTAVO EMILIO MACEDO IV 25358574", "cad_autoridad_id": 4, "certificante_id": None, "certificante_firma": None},
        {"id": VAJENO, "user_id": OTRO, "cad_autoridad_nombre": None, "cad_autoridad_id": None, "certificante_id": None, "certificante_firma": None},
    ],
)
asignar = FirmasController.asignar_vuelos.fn
ctl = FirmasController(owner=None)
vuelo = lambda i: next(f for f in base.tablas["flights"] if f["id"] == i)

check("no se asigna la persona de otro piloto", lanza(NotFoundException, asignar(ctl, pedido(YO), base, __import__("uuid").UUID(P_OTRO), AsignarVuelos(vuelo_ids=[VA]))))
check("no se asigna un vuelo de otro piloto", lanza(NotFoundException, asignar(ctl, pedido(YO), base, __import__("uuid").UUID(P_YO), AsignarVuelos(vuelo_ids=[VA, VAJENO]))))
check("…y el del otro no cambió", vuelo(VAJENO)["certificante_id"] is None and vuelo(VA)["certificante_id"] is None)

r = corre(asignar(ctl, pedido(YO), base, __import__("uuid").UUID(P_YO), AsignarVuelos(vuelo_ids=[VA, VB, VC], firma="si", sumar_alias="Gustavo Emilio Macedo IV 25358574")))
check("asigna a los tres", r.asignados == 3 and all(vuelo(i)["certificante_id"] == P_YO and vuelo(i)["certificante_firma"] == "si" for i in (VA, VB, VC)))
check("completa el vuelo sin nombre para el CAD, con su cargo", vuelo(VA)["cad_autoridad_nombre"] == "GUSTAVO EMILIO MACEDO" and vuelo(VA)["cad_autoridad_id"] == 4 and r.completados == 1)
check("no pisa otro nombre y avisa", vuelo(VB)["cad_autoridad_nombre"] == "GUSTAVO GIMENEZ" and vuelo(VB)["cad_autoridad_id"] == 5
      and len(r.avisos) == 1 and str(r.avisos[0].vuelo_id) == VB)
check("la otra grafía de la misma persona queda como está, sin aviso", vuelo(VC)["cad_autoridad_nombre"].endswith("25358574"))
check("suma el alias", base.tablas["firmas_certificantes"][0]["alias"] == ["GUSTAVO EMILIO MACEDO IV 25358574"])

desasociar = FirmasController.desasociar_vuelos.fn
r = corre(desasociar(ctl, pedido(YO), base, f"{VA},{VAJENO}"))
check("desasocia sólo los propios", r["desasociados"] == 1 and vuelo(VA)["certificante_id"] is None and vuelo(VA)["certificante_firma"] is None)
check("desasociar no toca el nombre del CAD", vuelo(VA)["cad_autoridad_nombre"] == "GUSTAVO EMILIO MACEDO")
check("ids que no son uuid no pasan", lanza(ClientException, desasociar(ctl, pedido(YO), base, "abc")))

base.tablas["flights"][0]["certificante_id"] = None
sugerir = FirmasController.sugerencias_certificantes.fn
base.tablas["flights"][2]["certificante_id"] = None
s = corre(sugerir(ctl, pedido(YO), base))
check("las sugerencias salen de los vuelos propios sin certificante", all(str(v) in (VA, VB, VC) for x in s for v in x.vuelo_ids) and len(s) >= 1)

nombres = corre(FirmasController.nombres_certificantes.fn(ctl, pedido(YO), base))
check("la lista breve es sólo de las personas propias y sin imágenes", [n.nombre for n in nombres] == ["GUSTAVO EMILIO MACEDO"] and not hasattr(nombres[0], "png"))
editar = FirmasController.editar_certificante.fn
r = corre(editar(ctl, pedido(YO), base, __import__("uuid").UUID(P_YO), FirmaCertificanteEdicion(automatica=False)))
check("devuelve la persona con lo nuevo", r.automatica is False and r.nombre == "GUSTAVO EMILIO MACEDO")
check("no se edita la persona de otro", lanza(NotFoundException, editar(ctl, pedido(YO), base, __import__("uuid").UUID(P_OTRO), FirmaCertificanteEdicion(automatica=False))))
check("apagar 'ponerla sola' se guarda", base.tablas["firmas_certificantes"][0]["automatica"] is False and base.tablas["firmas_certificantes"][1]["automatica"] is True)

# Alta y edición de un vuelo con certificante: el controlador lo valida y lo completa.
resolver = FlightsController._resolver_certificante
import uuid as _u
carga = {"cad_autoridad_nombre": None, "certificante_id": _u.UUID(P_YO)}
resolver(base, YO, carga)
check("un alta con certificante propio completa el nombre", carga["cad_autoridad_nombre"] == "GUSTAVO EMILIO MACEDO")
try:
    resolver(base, YO, {"certificante_id": _u.UUID(P_OTRO)})
    ok = False
except NotFoundException:
    ok = True
check("un alta con el certificante de otro falla", ok)
carga = FlightCreate(date="2026-01-01", route="X", landings=1, duration=1, takeoff="2026-01-01T10:00:00Z", landing="2026-01-01T11:00:00Z").model_dump(by_alias=True, mode="json")
resolver(base, YO, carga)
check("un alta sin certificante no manda columnas nuevas", "certificante_id" not in carga and "certificante_firma" not in carga)
cambios = {"certificante_id": None}
resolver(base, YO, cambios, {"cad_autoridad_nombre": "X"})
check("desasociar desde el vuelo limpia la anulación", cambios == {"certificante_id": None, "certificante_firma": None})
cambios = {"certificante_id": _u.UUID(P_YO)}
resolver(base, YO, cambios, {"cad_autoridad_nombre": "PEDRO NADIE"})
check("editar un vuelo con otro nombre no lo pisa", "cad_autoridad_nombre" not in cambios)

if not all(resultados):
    print(f"\n{resultados.count(False)} fallaron")
    sys.exit(1)
print(f"\n{len(resultados)} ok")
