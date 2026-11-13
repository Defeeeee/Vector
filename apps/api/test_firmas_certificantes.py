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
    DorsoFotoIn,
    DorsoHojaIn,
    DorsoTexto,
    ConstanciaIn,
    FirmaCertificanteEdicion,
    FirmaCertificanteIn,
    SelloEdicion,
    SelloIn,
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
check("un png de una web vieja se ignora (la columna se borró en la 053)", not hasattr(DorsoHojaIn(logbook_id=lb, hoja=1, png=PNG), "png"))
check("la hoja 0 no existe", falla(lambda: DorsoHojaIn(logbook_id=lb, hoja=0)))


# --------------------------------------------------------------- 048: modelos

f2 = FirmaCertificanteIn(nombre="A", png=PNG, alias=[" gustavo emilio  macedo IV", "Gustavo Macedo", "GUSTAVO MACEDO"], automatica=False)
check("los alias van normalizados y sin repetir", f2.alias == ["GUSTAVO EMILIO MACEDO IV", "GUSTAVO MACEDO"])
check("automatica llega como se mandó", f2.automatica is False)
check("sin alias ni sello no se mandan (no pisan lo guardado)", "alias" not in FirmaCertificanteIn(nombre="A", png=PNG).model_fields_set)
check("más de 20 alias no pasan", falla(lambda: FirmaCertificanteIn(nombre="A", png=PNG, alias=[f"N{i}" for i in range(21)])))
e = FirmaCertificanteEdicion(alias=["pérez"])
check("la edición normaliza alias", e.alias == ["PEREZ"])
check("un nombre vacío en la edición no pasa", falla(lambda: FirmaCertificanteEdicion(nombre="  ")))
check("firma 'quizás' no existe", falla(lambda: AsignarVuelos(vuelo_ids=[uuid4()], firma="quizas")))
check("hay que elegir al menos un vuelo", falla(lambda: AsignarVuelos(vuelo_ids=[])))
check("el dorso toma los sellos", len(DorsoHojaIn(logbook_id=lb, hoja=1, sello_ids=[uuid4(), uuid4()]).sello_ids) == 2)
# 050: textos del dorso con su firma.
LARGO = "EN EL DÍA DE LA FECHA 12/03/26 EL TITULAR DEL PRESENTE LIBRO, FEDERICO DIAZ NEMETH TITULAR DE LA LICENCIA PPA 48225513 QUEDA HABILITAD0 PARA TRANSPORTAR PASAJEROS"
check("un texto de 163 letras entra (el que falló como aclaración)", DorsoHojaIn(logbook_id=lb, hoja=4, textos=[{"texto": LARGO}]).textos[0].texto == LARGO)
check("un texto respeta lo escrito y junta los espacios", DorsoTexto(texto="  Habilitado   para  pasajeros ").texto == "Habilitado para pasajeros")
check("un texto de más de 600 letras no pasa", falla(lambda: DorsoTexto(texto="x" * 601)))
check("un texto vacío no pasa", falla(lambda: DorsoTexto(texto="   ")))
u = uuid4()
check("la firma de un texto es foto:<id> o sello:<id>", DorsoTexto(texto="x", firma=f"sello:{u}").firma == f"sello:{u}" and DorsoTexto(texto="x", firma=f"foto:{u}").firma == f"foto:{u}")
check("sin firma, el texto va solo", DorsoTexto(texto="x", firma="").firma is None)
check("otra cosa como firma no pasa", falla(lambda: DorsoTexto(texto="x", firma=f"persona:{u}")) and falla(lambda: DorsoTexto(texto="x", firma="foto:123")))
check("más de 12 textos en un dorso no pasan", falla(lambda: DorsoHojaIn(logbook_id=lb, hoja=1, textos=[{"texto": "x"}] * 13)))
check("la aclaración sigue con su tope de 160", falla(lambda: DorsoHojaIn(logbook_id=lb, hoja=1, aclaracion=LARGO)))
check("más de 12 sellos en un dorso no pasan", falla(lambda: DorsoHojaIn(logbook_id=lb, hoja=1, sello_ids=[uuid4() for _ in range(13)])))

# --------------------------------------------------------------- 049: modelos
sl = SelloIn(etiqueta="  Jefe  de IV's ", autoridad_id=6, nombre_cad=" gustavo emilio macedo ", png=PNG)
check("el sello limpia la etiqueta y pone el nombre del CAD en mayúsculas", sl.etiqueta == "Jefe de IV's" and sl.nombre_cad == "GUSTAVO EMILIO MACEDO")
check("un sello sin etiqueta no pasa", falla(lambda: SelloIn(etiqueta="  ", png=PNG)))
check("un sello con JPG no pasa", falla(lambda: SelloIn(etiqueta="X", png=JPG)))
check("el sello admite el tope del dorso", SelloIn(etiqueta="X", png=PNG).png == PNG)
check("la edición del sello distingue 'quitar el cargo' de 'no tocarlo'",
      "autoridad_id" in SelloEdicion(autoridad_id=None).model_fields_set and "autoridad_id" not in SelloEdicion(etiqueta="Y").model_fields_set)
check("una foto del dorso es un PNG de verdad", falla(lambda: DorsoFotoIn(logbook_id=lb, hoja=1, png=FALSO)) and DorsoFotoIn(logbook_id=lb, hoja=2, png=PNG).hoja == 2)
check("la hoja 0 no existe para una foto", falla(lambda: DorsoFotoIn(logbook_id=lb, hoja=0, png=PNG)))
check("el vuelo trae su sello", FlightUpdate(certificante_sello_id=uuid4()).certificante_sello_id is not None)
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

    def upsert(self, valores, on_conflict="", **_k):
        self.modo, self.valores, self.conflicto = "upsert", valores, [c for c in on_conflict.split(",") if c]
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

    def is_(self, col, v):
        self.filtros.append(lambda f: f.get(col) is None)
        return self

    def limit(self, *_a):
        return self

    def order(self, *_a):
        return self

    def execute(self):
        if self.modo == "upsert":
            igual = next((f for f in self.filas if self.conflicto and all(str(f.get(c)) == str(self.valores.get(c)) for c in self.conflicto)), None)
            if igual is None:
                igual = {"id": str(uuid4()), "textos": [], **self.valores}
                self.filas.append(igual)
            else:
                igual.update(self.valores)
            return SimpleNamespace(data=[dict(igual)], count=1)
        if self.modo == "insert":
            fila = {"id": str(uuid4()), **self.valores}
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
S_JEFE, S_IV, S_AJENO = str(uuid4()), str(uuid4()), str(uuid4())
LIBRO, LIBRO_AJENO = str(uuid4()), str(uuid4())
base = BaseFalsa(
    certificante_sellos=[
        {"id": S_JEFE, "user_id": YO, "certificante_id": P_YO, "etiqueta": "Jefe de instructores", "autoridad_id": 6, "nombre_cad": None, "orden": 0, "png": PNG},
        {"id": S_IV, "user_id": YO, "certificante_id": P_YO, "etiqueta": "Instructor de vuelo", "autoridad_id": 5, "nombre_cad": "GUSTAVO EMILIO MACEDO IV 25358574", "orden": 1, "png": PNG},
        {"id": S_AJENO, "user_id": OTRO, "certificante_id": P_OTRO, "etiqueta": "Otro", "autoridad_id": None, "nombre_cad": None, "orden": 0, "png": PNG},
    ],
    logbooks=[{"id": LIBRO, "user_id": YO}, {"id": LIBRO_AJENO, "user_id": OTRO}],
    libro_hojas_dorso=[],
    libro_hojas_dorso_fotos=[],
    vuelo_constancias=[],
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
check("no se asigna con el sello de otra persona", lanza(NotFoundException, asignar(ctl, pedido(YO), base, __import__("uuid").UUID(P_YO), AsignarVuelos(vuelo_ids=[VA], sello_id=__import__("uuid").UUID(S_AJENO)))))
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
check("desasociar desde el vuelo limpia la anulación y el sello", cambios == {"certificante_id": None, "certificante_firma": None, "certificante_sello_id": None})
cambios = {"certificante_id": _u.UUID(P_YO)}
resolver(base, YO, cambios, {"cad_autoridad_nombre": "PEDRO NADIE"})
check("editar un vuelo con otro nombre no lo pisa", "cad_autoridad_nombre" not in cambios)

# ------------------------------------------------ 049: sellos con su cargo

SEL = [{"id": S_JEFE, "autoridad_id": 6, "orden": 0}, {"id": S_IV, "autoridad_id": 5, "orden": 1}, {"id": "sin-cargo", "autoridad_id": None, "orden": 2}]
check("el sello sugerido es el del mismo cargo", svc.sello_para_cargo(SEL, 6)["id"] == S_JEFE and svc.sello_para_cargo(SEL, 5)["id"] == S_IV)
check("sin sello de ese cargo, el que no declara cargo", svc.sello_para_cargo(SEL, 9)["id"] == "sin-cargo")
check("sin cargo en el vuelo, el que no declara cargo", svc.sello_para_cargo(SEL, None)["id"] == "sin-cargo")
check("sin ninguno que sirva, ninguno", svc.sello_para_cargo(SEL[:2], 9) is None and svc.sello_para_cargo([], 6) is None)

MAC2 = {**MACEDO, "sellos": [{"id": "s-jefe", "autoridad_id": 6, "orden": 0}, {"id": "s-iv", "autoridad_id": 5, "orden": 1}]}
V2 = lambda i, n, cargo: {"id": f"w{i}", "cad_autoridad_nombre": n, "cad_autoridad_id": cargo, "certificante_id": None}
vuelos2 = [V2(i, "GUSTAVO EMILIO MACEDO", 6) for i in range(45)] + [V2(45, "GUSTAVO EMILIO MACEDO IV 25358574", 5)]
sug2 = {x["nombre_en_vuelos"]: x for x in svc.sugerencias([MAC2], vuelos2)}
check("los 45 de cargo 6 van con su sello de jefe", sug2["GUSTAVO EMILIO MACEDO"]["sello_id"] == "s-jefe" and len(sug2["GUSTAVO EMILIO MACEDO"]["vuelo_ids"]) == 45)
check("el de cargo 5 va con su sello de instructor", sug2["GUSTAVO EMILIO MACEDO IV 25358574"]["sello_id"] == "s-iv")
mismo_nombre = svc.sugerencias([MAC2], [V2(1, "GUSTAVO EMILIO MACEDO", 6), V2(2, "GUSTAVO EMILIO MACEDO", 5)])
check("el mismo nombre con dos cargos son dos sugerencias", sorted(x["sello_id"] for x in mismo_nombre) == ["s-iv", "s-jefe"])
check("una persona sin sellos sugiere sin sello", svc.sugerencias([MACEDO], [V2(1, "GUSTAVO EMILIO MACEDO", 6)])[0]["sello_id"] is None)

c, _ = svc.completar_autoridad({"cad_autoridad_nombre": None}, MACEDO, {"autoridad_id": 6, "nombre_cad": None})
check("sin nombre toma el cargo del sello, no el de la persona", c == {"cad_autoridad_nombre": "GUSTAVO EMILIO MACEDO", "cad_autoridad_id": 6})
c, _ = svc.completar_autoridad({"cad_autoridad_nombre": None}, MACEDO, {"autoridad_id": 5, "nombre_cad": "GUSTAVO EMILIO MACEDO IV 25358574"})
check("sin nombre toma el nombre para el CAD del sello", c["cad_autoridad_nombre"] == "GUSTAVO EMILIO MACEDO IV 25358574" and c["cad_autoridad_id"] == 5)
c, _ = svc.completar_autoridad({"cad_autoridad_nombre": None}, MACEDO, {"autoridad_id": None, "nombre_cad": None})
check("un sello sin cargo deja el de la persona", c["cad_autoridad_id"] == 4)
c, aviso = svc.completar_autoridad({"cad_autoridad_nombre": "GUSTAVO GIMENEZ", "cad_autoridad_id": 5}, MACEDO, {"autoridad_id": 6, "nombre_cad": None})
check("con otro nombre y otro cargo no se pisa nada y avisa", c == {} and aviso is not None)

uid = __import__("uuid").UUID
base.tablas["flights"][0].update({"cad_autoridad_nombre": None, "cad_autoridad_id": None, "certificante_id": None})
r = corre(asignar(ctl, pedido(YO), base, uid(P_YO), AsignarVuelos(vuelo_ids=[VA], sello_id=uid(S_IV))))
check("asignar con sello lo guarda en el vuelo", vuelo(VA)["certificante_sello_id"] == S_IV)
check("…y completa el nombre y el cargo de ese sello para el CAD", vuelo(VA)["cad_autoridad_nombre"] == "GUSTAVO EMILIO MACEDO IV 25358574" and vuelo(VA)["cad_autoridad_id"] == 5)
corre(desasociar(ctl, pedido(YO), base, VA))
check("desasociar también saca el sello", vuelo(VA)["certificante_sello_id"] is None)

carga = {"cad_autoridad_nombre": None, "certificante_id": uid(P_YO), "certificante_sello_id": uid(S_JEFE)}
resolver(base, YO, carga)
check("un vuelo con persona y sello completa el cargo del sello", carga["cad_autoridad_id"] == 6)
try:
    resolver(base, YO, {"certificante_id": uid(P_YO), "certificante_sello_id": uid(S_AJENO)})
    ok = False
except NotFoundException:
    ok = True
check("un vuelo no admite el sello de otra persona", ok)
cambios = {"certificante_id": uid(P_YO)}
resolver(base, YO, cambios, {"cad_autoridad_nombre": "X", "certificante_id": str(P_OTRO)})
check("cambiar de persona sin elegir sello borra el sello anterior", cambios["certificante_sello_id"] is None)
cambios = {"certificante_firma": "si"}
resolver(base, YO, {"certificante_id": uid(P_YO)}, {"cad_autoridad_nombre": "X", "certificante_id": P_YO})
check("el alta con persona y sin sello no manda la columna nueva", True)
alta = {"certificante_id": uid(P_YO), "cad_autoridad_nombre": "X"}
resolver(base, YO, alta)
check("…de verdad no la manda", "certificante_sello_id" not in alta)

# Sellos de una persona: agregar (tope), editar, borrar; siempre del mismo piloto.
agregar = FirmasController.agregar_sello.fn
editar_sello = FirmasController.editar_sello.fn
borrar_sello = FirmasController.borrar_sello.fn
nuevo = corre(agregar(ctl, pedido(YO), base, uid(P_YO), SelloIn(etiqueta="Examinador", autoridad_id=7, png=PNG)))
check("agrega un sello con el orden siguiente", nuevo.etiqueta == "Examinador" and nuevo.orden == 2)
check("no se agrega un sello a la persona de otro", lanza(NotFoundException, agregar(ctl, pedido(YO), base, uid(P_OTRO), SelloIn(etiqueta="X", png=PNG))))
for i in range(3):
    corre(agregar(ctl, pedido(YO), base, uid(P_YO), SelloIn(etiqueta=f"Extra {i}", png=PNG)))
check("hasta 6 sellos por persona", lanza(ClientException, agregar(ctl, pedido(YO), base, uid(P_YO), SelloIn(etiqueta="Uno más", png=PNG))))
r = corre(editar_sello(ctl, pedido(YO), base, nuevo.id, SelloEdicion(etiqueta="Examinador de vuelo", autoridad_id=None)))
check("edita la etiqueta y quita el cargo", r.etiqueta == "Examinador de vuelo" and r.autoridad_id is None)
check("no se edita el sello de otro", lanza(NotFoundException, editar_sello(ctl, pedido(YO), base, uid(S_AJENO), SelloEdicion(etiqueta="X"))))
check("una edición vacía falla", lanza(ClientException, editar_sello(ctl, pedido(YO), base, uid(S_JEFE), SelloEdicion())))
check("la etiqueta no se puede quitar", lanza(ClientException, editar_sello(ctl, pedido(YO), base, uid(S_JEFE), SelloEdicion.model_construct(etiqueta=None, _fields_set={"etiqueta"}))))
corre(borrar_sello(ctl, pedido(YO), base, nuevo.id))
check("borra el sello", not any(x["id"] == str(nuevo.id) for x in base.tablas["certificante_sellos"]))
check("no borra el de otro", lanza(NotFoundException, borrar_sello(ctl, pedido(YO), base, uid(S_AJENO))))

lista = corre(FirmasController.listar_certificantes.fn(ctl, pedido(YO), base))
check("la lista de personas trae sus sellos con imagen y por orden", [x.etiqueta for x in lista[0].sellos][:2] == ["Jefe de instructores", "Instructor de vuelo"] and lista[0].sellos[0].png == PNG)
nom = corre(FirmasController.nombres_certificantes.fn(ctl, pedido(YO), base))
check("la lista breve trae los sellos sin imagen y el cargo de la persona", len(nom[0].sellos) >= 2 and not hasattr(nom[0].sellos[0], "png") and nom[0].autoridad_id == 4)

# Fotos del dorso: una por pedido, hasta 12, del libro propio.
agregar_foto = FirmasController.agregar_foto_dorso.fn
borrar_foto = FirmasController.borrar_foto_dorso.fn
listar_dorsos = FirmasController.listar_dorsos.fn
borrar_dorso = FirmasController.borrar_dorso.fn
check("no se agrega una foto al libro de otro", lanza(NotFoundException, agregar_foto(ctl, pedido(YO), base, DorsoFotoIn(logbook_id=uid(LIBRO_AJENO), hoja=1, png=PNG))))
fotos = [corre(agregar_foto(ctl, pedido(YO), base, DorsoFotoIn(logbook_id=uid(LIBRO), hoja=2, png=PNG))) for _ in range(3)]
check("agrega varias fotos a una misma hoja, en orden", [f.orden for f in fotos] == [0, 1, 2])
check("la hoja sin dorso lo recibe vacío para figurar en la lista", len(base.tablas["libro_hojas_dorso"]) == 1)
corre(agregar_foto(ctl, pedido(YO), base, DorsoFotoIn(logbook_id=uid(LIBRO), hoja=2, png=PNG)))
check("la segunda foto no duplica el dorso", len(base.tablas["libro_hojas_dorso"]) == 1)
for _ in range(8):
    corre(agregar_foto(ctl, pedido(YO), base, DorsoFotoIn(logbook_id=uid(LIBRO), hoja=2, png=PNG)))
check("hasta 12 fotos por hoja", lanza(ClientException, agregar_foto(ctl, pedido(YO), base, DorsoFotoIn(logbook_id=uid(LIBRO), hoja=2, png=PNG))))
check("otra hoja tiene su propio tope", corre(agregar_foto(ctl, pedido(YO), base, DorsoFotoIn(logbook_id=uid(LIBRO), hoja=3, png=PNG))).orden == 0)
dorsos = corre(listar_dorsos(ctl, pedido(YO), base, uid(LIBRO)))
check("el dorso lista todas sus fotos", [len(d.fotos) for d in dorsos if d.hoja == 2] == [12])
corre(borrar_foto(ctl, pedido(YO), base, fotos[0].id))
check("quita una foto", len([f for f in base.tablas["libro_hojas_dorso_fotos"] if f["hoja"] == 2]) == 11)
check("no quita la foto de otro", lanza(NotFoundException, borrar_foto(ctl, pedido(YO), base, uid(str(uuid4())))))
dorso2 = next(d for d in dorsos if d.hoja == 2)
base.tablas["libro_hojas_dorso"][0]["id"] = str(dorso2.id)
corre(borrar_dorso(ctl, pedido(YO), base, dorso2.id))
check("quitar el dorso quita también todas sus fotos", not [f for f in base.tablas["libro_hojas_dorso_fotos"] if f["hoja"] == 2])

# 050: guardar textos con su firma. La hoja 3 tiene una foto (la de "otra hoja tiene su propio tope").
guardar = FirmasController.guardar_dorso.fn
foto3 = next(f for f in base.tablas["libro_hojas_dorso_fotos"] if f["hoja"] == 3)
r = corre(guardar(ctl, pedido(YO), base, DorsoHojaIn(logbook_id=uid(LIBRO), hoja=3, textos=[
    {"texto": LARGO, "firma": f"foto:{foto3['id']}"},
    {"texto": "Readaptación", "firma": f"sello:{S_JEFE}"},
    {"texto": "Sin firma"},
])))
check("guarda los textos con su firma, en orden", [t.firma for t in r.textos] == [f"foto:{foto3['id']}", f"sello:{S_JEFE}", None])
check("un dorso sólo con textos se puede guardar", corre(guardar(ctl, pedido(YO), base, DorsoHojaIn(logbook_id=uid(LIBRO), hoja=7, textos=[{"texto": "x"}]))).hoja == 7)
check("un texto no puede apuntar a una foto de otra hoja", lanza(NotFoundException, guardar(ctl, pedido(YO), base, DorsoHojaIn(logbook_id=uid(LIBRO), hoja=5, textos=[{"texto": "x", "firma": f"foto:{foto3['id']}"}]))))
check("un texto no puede apuntar al sello de otro", lanza(NotFoundException, guardar(ctl, pedido(YO), base, DorsoHojaIn(logbook_id=uid(LIBRO), hoja=3, textos=[{"texto": "x", "firma": f"sello:{S_AJENO}"}]))))
corre(guardar(ctl, pedido(YO), base, DorsoHojaIn(logbook_id=uid(LIBRO), hoja=3, aclaracion="Macedo")))
fila3 = next(d for d in base.tablas["libro_hojas_dorso"] if d["hoja"] == 3)
check("una web vieja (sin el campo textos) no los borra", len(fila3["textos"]) == 3 and fila3["aclaracion"] == "MACEDO")
corre(guardar(ctl, pedido(YO), base, DorsoHojaIn(logbook_id=uid(LIBRO), hoja=3, aclaracion="Macedo", textos=[])))
check("con la lista vacía, se quitan", fila3["textos"] == [])
check("la lista trae los textos", any(d.hoja == 7 and d.textos[0].texto == "x" for d in corre(listar_dorsos(ctl, pedido(YO), base, uid(LIBRO)))))

# 052: si la hoja suma las firmas de sus vuelos.
check("apagar las firmas de los vuelos alcanza para guardar un dorso vacío", corre(guardar(ctl, pedido(YO), base, DorsoHojaIn(logbook_id=uid(LIBRO), hoja=9, firmas_de_los_vuelos=False))).firmas_de_los_vuelos is False)
fila9 = next(d for d in base.tablas["libro_hojas_dorso"] if d["hoja"] == 9)
corre(guardar(ctl, pedido(YO), base, DorsoHojaIn(logbook_id=uid(LIBRO), hoja=9, aclaracion="X")))
check("una web vieja (sin el campo) no la cambia", fila9["firmas_de_los_vuelos"] is False)
corre(guardar(ctl, pedido(YO), base, DorsoHojaIn(logbook_id=uid(LIBRO), hoja=9, aclaracion="X", firmas_de_los_vuelos=None)))
check("con null vuelve a lo de siempre", fila9["firmas_de_los_vuelos"] is None)
check("sin nada y con null, no hay nada que guardar", lanza(ClientException, guardar(ctl, pedido(YO), base, DorsoHojaIn(logbook_id=uid(LIBRO), hoja=11, firmas_de_los_vuelos=None))))

# 051: constancias en el frente (la foto del sello real), por vuelo.
check("una constancia es un PNG de verdad", falla(lambda: ConstanciaIn(flight_id=uuid4(), png=JPG)))
agregar_c = FirmasController.agregar_constancia.fn
listar_c = FirmasController.listar_constancias.fn
borrar_c = FirmasController.borrar_constancia.fn
c1 = corre(agregar_c(ctl, pedido(YO), base, ConstanciaIn(flight_id=uid(VA), png=PNG)))
check("agrega la constancia a un vuelo propio", str(c1.flight_id) == VA and c1.orden == 0)
check("no se agrega al vuelo de otro", lanza(NotFoundException, agregar_c(ctl, pedido(YO), base, ConstanciaIn(flight_id=uid(VAJENO), png=PNG))))
check("la segunda va después", corre(agregar_c(ctl, pedido(YO), base, ConstanciaIn(flight_id=uid(VA), png=PNG))).orden == 1)
check("hasta 2 por vuelo", lanza(ClientException, agregar_c(ctl, pedido(YO), base, ConstanciaIn(flight_id=uid(VA), png=PNG))))
check("la lista trae sólo las propias", len(corre(listar_c(ctl, pedido(YO), base))) == 2 and corre(listar_c(ctl, pedido(OTRO), base)) == [])
check("otro no la puede borrar", lanza(NotFoundException, borrar_c(ctl, pedido(OTRO), base, c1.id)))
corre(borrar_c(ctl, pedido(YO), base, c1.id))
check("la borra", len(base.tablas["vuelo_constancias"]) == 1)

if not all(resultados):
    print(f"\n{resultados.count(False)} fallaron")
    sys.exit(1)
print(f"\n{len(resultados)} ok")
