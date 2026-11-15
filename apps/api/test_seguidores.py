"""
Seguidores y Vector Tracker (migración 056): invitación por link de un solo uso, vuelos asignados a mano,
avisos push sólo a los asignados.

Offline, con una base en memoria. `python test_seguidores.py`; sale con código 1 si algo falla.
"""

import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import UUID, uuid4

os.environ.setdefault("SUPABASE_URL", "https://dummy.supabase.co")
os.environ.setdefault("SUPABASE_PUBLISHABLE_KEY", "dummy-key")

from litestar.exceptions import ClientException, NotFoundException
from pydantic import ValidationError

import src.controllers.seguimientos as ctrl_seg
import src.services.avisos_seguimiento as av
import src.services.seguidores as sg
from src.controllers.seguidores import SeguidoresController as Pil, TrackerController as Trk, TrackerPublicoController as Pub
from src.controllers.seguimientos import SeguimientosController as Seg
from src.services.avisos_seguimiento import barrer
from src.services.seguidores import (
    TOPE_SEGUIDORES,
    ApodoIn,
    AsignacionIn,
    InvitacionIn,
    armar_aviso_compartido,
    armar_aviso_tracker,
    invitacion_vigente,
    nacio_ahora,
    normalizar_apodo,
    nuevo_token_invitacion,
    ordenar_vuelos,
    token_con_forma,
)
from src.supabase_client import SupabaseManager

resultados = []


def check(label, condition):
    print(f"{'✅' if condition else '❌'} {label}")
    resultados.append(bool(condition))


def falla(fn, *tipos):
    try:
        fn()
    except tipos or (Exception,) as exc:
        return getattr(exc, "status_code", True)
    return False


def correr(corutina_fn, *a):
    """Un handler de Litestar (`.fn`) con los argumentos tal cual: sin servidor."""
    return asyncio.run(corutina_fn(*a))


AHORA = datetime.now(timezone.utc)

# --- lo puro -------------------------------------------------------------------------------------
t1, t2 = nuevo_token_invitacion(), nuevo_token_invitacion()
check("el token es largo, distinto cada vez y con forma de token", len(t1) >= 32 and t1 != t2 and token_con_forma(t1))
check("un token corto o con caracteres raros no tiene forma", not token_con_forma("abc") and not token_con_forma("a" * 40 + "/") and not token_con_forma(None))
vig = {"seguidor_id": None, "invitacion_token": t1, "invitacion_vence_at": (AHORA + timedelta(days=1)).isoformat()}
check("una invitación sin usar y sin vencer es vigente", invitacion_vigente(vig, AHORA))
check("vencida, no", not invitacion_vigente({**vig, "invitacion_vence_at": (AHORA - timedelta(seconds=1)).isoformat()}, AHORA))
check("usada (sin token, con seguidor), no", not invitacion_vigente({**vig, "invitacion_token": None, "seguidor_id": "x"}, AHORA) and not invitacion_vigente(None, AHORA))
check("dura 7 días", sg.vence_la_invitacion(AHORA) - AHORA == timedelta(days=7))
check("el apodo se limpia: espacios juntos, 40 letras, vacío es nada", normalizar_apodo("  Mamá   querida ") == "Mamá querida" and normalizar_apodo("x" * 80) == "x" * 40 and normalizar_apodo("   ") is None and normalizar_apodo(None) is None)
check("los modelos de entrada limpian el apodo", InvitacionIn(apodo=" Papá ").apodo == "Papá" and ApodoIn().apodo is None)
check("la asignación saca repetidos y tiene tope", AsignacionIn(seguidor_ids=["b", "a", "a"]).seguidor_ids == ["a", "b"] and bool(falla(lambda: AsignacionIn(seguidor_ids=[str(i) for i in range(TOPE_SEGUIDORES + 1)]), ValidationError)))
check("una cuenta de hace 2 minutos nació ahora; una de hace un mes, no", nacio_ahora({"created_at": (AHORA - timedelta(minutes=2)).isoformat()}, AHORA) and not nacio_ahora({"created_at": (AHORA - timedelta(days=30)).isoformat()}, AHORA) and not nacio_ahora({}, AHORA))
check("el tope es 20", TOPE_SEGUIDORES == 20)

TOKEN = "v" * 40
fila_aviso = {
    "id": "s1", "token": TOKEN, "nombre": "Federico", "avion_matricula": "LV-ABC", "mostrar_matricula": False,
    "puntos": [[-34.56, -58.96, "SADM", "Morón"], [-35.0, -59.0, "SAZS", "Dolores"]],
    "salida_prevista": "2026-11-15T19:30:00+00:00",
}
c = armar_aviso_compartido(fila_aviso)
check("compartió un vuelo: 'Federico compartió un vuelo', 'SADM → SAZS, sale a las 16:30' (hora argentina)", c["titulo"] == "Federico compartió un vuelo" and c["cuerpo"] == "SADM → SAZS, sale a las 16:30")
check("abre el vuelo en el tracker (ruta relativa) y no dice la matrícula", c["url"] == f"/vuelo/{TOKEN}" and "LV-ABC" not in repr(c))
check("sin salida ni ruta igual dice algo", armar_aviso_compartido({**fila_aviso, "salida_prevista": None, "puntos": []})["cuerpo"] == "Seguilo en vivo.")
check("sin horario, sólo la ruta", armar_aviso_compartido({**fila_aviso, "salida_prevista": None})["cuerpo"] == "SADM → SAZS")
d = armar_aviso_tracker("despegue", fila_aviso)
a = armar_aviso_tracker("aterrizaje", fila_aviso)
check("despegue y aterrizaje del tracker: el mismo texto del link, con el link del tracker", d["titulo"] == "Federico despegó de SADM" and a["titulo"] == "Federico aterrizó en SAZS" and d["url"] == a["url"] == f"/vuelo/{TOKEN}")
check("sin la matrícula si el piloto no la prendió", "LV-ABC" not in repr(d) and "LV-ABC" not in repr(a))
check("las etiquetas del tracker no pisan a las del link", d["etiqueta"].startswith("tracker-") and d["etiqueta"] != a["etiqueta"])
check("en el aire primero, después lo que sale, al final lo que terminó", [v["k"] for v in ordenar_vuelos([
    {"k": "t", "estado": "terminado"}, {"k": "sale-tarde", "estado": "en_vuelo", "fase": "antes_de_salir", "salida_prevista": "2026-11-15T20:00:00+00:00"},
    {"k": "sale-antes", "estado": "en_vuelo", "fase": "antes_de_salir", "salida_prevista": "2026-11-15T18:00:00+00:00"}, {"k": "aire", "estado": "en_vuelo", "fase": "volando"},
])] == ["aire", "sale-antes", "sale-tarde", "t"])


# --- una base en memoria -------------------------------------------------------------------------
class Resp:
    def __init__(self, data, count=None):
        self.data, self.count = data, count


class NoEs:
    def __init__(self, q):
        self.q = q

    def is_(self, c, v):
        self.q.filtros.append(lambda r: r.get(c) is not None)
        return self.q


class Consulta:
    def __init__(self, base, nombre):
        self.base, self.nombre, self.accion, self.cuerpo, self.filtros, self.tope, self.orden, self.cuenta = base, nombre, "select", None, [], None, None, False

    @property
    def not_(self):
        return NoEs(self)

    def select(self, *_a, count=None, head=None):
        self.cuenta = bool(count)
        return self

    def insert(self, cuerpo):
        self.accion, self.cuerpo = "insert", cuerpo
        return self

    def upsert(self, cuerpo, on_conflict=None):
        self.accion, self.cuerpo, self.conflicto = "upsert", cuerpo, on_conflict
        return self

    def update(self, cuerpo):
        self.accion, self.cuerpo = "update", cuerpo
        return self

    def delete(self):
        self.accion = "delete"
        return self

    def eq(self, c, v):
        self.filtros.append(lambda r: r.get(c) == v)
        return self

    def is_(self, c, v):
        self.filtros.append(lambda r: r.get(c) is None)
        return self

    def in_(self, c, vs):
        self.filtros.append(lambda r: r.get(c) in vs)
        return self

    def gte(self, c, v):
        self.filtros.append(lambda r: r.get(c) is not None and r.get(c) >= v)
        return self

    def lte(self, c, v):
        self.filtros.append(lambda r: r.get(c) is not None and r.get(c) <= v)
        return self

    def order(self, c, desc=False):
        self.orden = (c, desc)
        return self

    def limit(self, n):
        self.tope = n
        return self

    def execute(self):
        filas = self.base.t.setdefault(self.nombre, [])
        if self.accion in ("insert", "upsert"):
            nuevos = self.cuerpo if isinstance(self.cuerpo, list) else [self.cuerpo]
            salida = []
            for n in nuevos:
                n = dict(n)
                if self.nombre in ("seguidores", "tracker_suscripciones"):
                    n.setdefault("id", str(uuid4()))
                if self.nombre == "seguidores":
                    n.setdefault("seguidor_id", None)
                    n.setdefault("creado_at", AHORA.isoformat())
                    n.setdefault("vinculado_at", None)
                if self.accion == "upsert" and self.conflicto:
                    claves = self.conflicto.split(",")
                    if any(all(r.get(k) == n.get(k) for k in claves) for r in filas):
                        continue
                filas.append(n)
                salida.append(dict(n))
            return Resp(salida)
        hay = [r for r in filas if all(f(r) for f in self.filtros)]
        if self.accion == "update":
            for r in hay:
                r.update(self.cuerpo)
            return Resp([dict(r) for r in hay])
        if self.accion == "delete":
            for r in hay:
                filas.remove(r)
                if self.nombre == "seguidores":  # cascada, como la base
                    self.base.t["seguimiento_seguidores"][:] = [a for a in self.base.t["seguimiento_seguidores"] if a["seguidor_fila_id"] != r["id"]]
            return Resp([dict(r) for r in hay])
        if self.orden:
            hay.sort(key=lambda r: r.get(self.orden[0]) or "", reverse=self.orden[1])
        if self.tope:
            hay = hay[: self.tope]
        return Resp([dict(r) for r in hay], len(hay) if self.cuenta else None)


class Admin:
    def __init__(self, base):
        self.base = base

    def get_user_by_id(self, uid):
        return SimpleNamespace(user=SimpleNamespace(created_at=self.base.creadas.get(uid, (AHORA - timedelta(days=90)).isoformat())))


class Base:
    def __init__(self):
        self.t = {n: [] for n in ("seguidores", "seguimiento_seguidores", "seguimientos_en_vivo", "tracker_suscripciones", "seguimientos_avisos", "profiles", "perfiles_publicos", "adsb_posiciones")}
        self.creadas = {}
        self.auth = SimpleNamespace(admin=Admin(self))

    def table(self, nombre):
        return Consulta(self, nombre)


base = Base()
SupabaseManager.get_service_client = staticmethod(lambda: base)
ctrl_seg._leer_adsb = lambda *a, **k: []
ctrl_seg.en_segundo_plano = lambda f: f()  # sin hilos: el aviso sale en el acto
enviados = []
sg.mandar_a = lambda subs, aviso, borrar: enviados.append((sorted(s["id"] for s in subs), aviso["titulo"], aviso["url"])) or len(subs)
av.avisos_configurados = lambda: True

FEDE, ANA, LUIS, SOFI = (str(uuid4()) for _ in range(4))  # Federico (piloto), Ana, Luis, Sofía
OTRO_PILOTO = str(uuid4())
for uid, nombre in ((FEDE, "Federico"), (ANA, "Ana María"), (LUIS, "Luis"), (SOFI, "Sofía"), (OTRO_PILOTO, "Rosa")):
    base.t["profiles"].append({"id": uid, "first_name": nombre})
base.t["perfiles_publicos"].append({"user_id": FEDE, "handle": "fede"})


def pedido(uid):
    return SimpleNamespace(state=SimpleNamespace(user=SimpleNamespace(id=uid)))


def hora(minutos):
    return (AHORA + timedelta(minutes=minutos)).isoformat()


def vuelo(uid, token_, salida_min, **extra):
    f = {
        "id": str(uuid4()), "user_id": uid, "token": token_ * 40, "nombre": "Federico", "ruta": "SADM SAZS",
        "puntos": [[-34.56, -58.96, "SADM", "Morón"], [-35.0, -59.0, "SAZS", "Dolores"]],
        "created_at": hora(-5), "vence_at": hora(180), "terminado_at": None, "aviso_despegue_at": None, "aviso_aterrizaje_at": None,
        "salida_prevista": hora(salida_min), "recorrido": [], "ultima_at": None, "ultima_lat": None, "matricula_adsb": None,
        "avion_matricula": "LV-ABC", "mostrar_matricula": False, "aterrizo_at": None, "ruta_orientativa": False,
    }
    f.update(extra)
    base.t["seguimientos_en_vivo"].append(f)
    return f


def invitar(apodo=None):
    return correr(Pil.invitar.fn, None, pedido(FEDE), base, InvitacionIn(apodo=apodo))


def aceptar(uid, token_):
    return correr(Trk.aceptar.fn, None, pedido(uid), token_)


# --- invitar --------------------------------------------------------------------------------------
inv_ana = invitar("Mamá")
check("la invitación es un link de un solo uso: token largo, vence en 7 días, pendiente", inv_ana["invitacion_token"] and token_con_forma(inv_ana["invitacion_token"]) and not inv_ana["vinculado"] and not inv_ana["vencida"])
pub = correr(Pub.invitacion.fn, None, inv_ana["invitacion_token"])
check("el link público dice sólo el nombre de pila del piloto y que sigue vigente", pub == {"vigente": True, "nombre": "Federico"})
check("un token inventado o con mala forma: no vigente, sin nombre", correr(Pub.invitacion.fn, None, "z" * 40) == {"vigente": False, "nombre": None} and correr(Pub.invitacion.fn, None, "x") == {"vigente": False, "nombre": None})
lista = correr(Pil.listar.fn, None, pedido(FEDE), base)
check("el piloto ve la pendiente con su apodo y su token", len(lista) == 1 and lista[0]["apodo"] == "Mamá" and lista[0]["invitacion_token"] == inv_ana["invitacion_token"] and not lista[0]["vinculado"])

# --- aceptar --------------------------------------------------------------------------------------
check("un piloto no puede aceptar su propia invitación", falla(lambda: aceptar(FEDE, inv_ana["invitacion_token"]), ClientException) == 400)
check("un token que no existe: 410", falla(lambda: aceptar(ANA, "q" * 43), ClientException) == 410)
r = aceptar(ANA, inv_ana["invitacion_token"])
check("aceptarla vincula a esa cuenta y dice de quién es", r == {"piloto": {"nombre": "Federico"}, "ya_seguia": False})
check("el token se gasta: queda vinculada y sin token", base.t["seguidores"][0]["seguidor_id"] == ANA and base.t["seguidores"][0]["invitacion_token"] is None and base.t["seguidores"][0]["vinculado_at"])
check("aceptarla de nuevo (otra cuenta o la misma) es 410: de un solo uso", falla(lambda: aceptar(LUIS, inv_ana["invitacion_token"]), ClientException) == 410 and falla(lambda: aceptar(ANA, inv_ana["invitacion_token"]), ClientException) == 410)
check("el link público ya no está vigente", correr(Pub.invitacion.fn, None, inv_ana["invitacion_token"])["vigente"] is False)
lista = correr(Pil.listar.fn, None, pedido(FEDE), base)
check("el piloto ve 'Ana entró' (nombre de pila) y ya no el token", lista[0]["vinculado"] and lista[0]["nombre"] == "Ana" and lista[0]["invitacion_token"] is None)

vencida = invitar("Tío")
for f in base.t["seguidores"]:
    if f["id"] == vencida["id"]:
        f["invitacion_vence_at"] = hora(-1)
check("una invitación vencida no se acepta ni se muestra vigente", falla(lambda: aceptar(LUIS, vencida["invitacion_token"]), ClientException) == 410 and correr(Pub.invitacion.fn, None, vencida["invitacion_token"])["vigente"] is False)
check("el piloto la ve como vencida", [x for x in correr(Pil.listar.fn, None, pedido(FEDE), base) if x["id"] == vencida["id"]][0]["vencida"])
inv_otra = invitar("Ana de nuevo")
check("quien ya seguía al piloto y acepta otra invitación: sigue igual, la sobrante se descarta", aceptar(ANA, inv_otra["invitacion_token"])["ya_seguia"] is True and not [f for f in base.t["seguidores"] if f["id"] == inv_otra["id"]])
check("la cuenta que nació hace días no se marca 'tracker'", [p for p in base.t["profiles"] if p["id"] == ANA][0].get("alta_desde") is None)
inv_luis = invitar("Luis")
base.creadas[LUIS] = (AHORA - timedelta(minutes=3)).isoformat()
aceptar(LUIS, inv_luis["invitacion_token"])
check("la cuenta que nació hace minutos al aceptar queda con alta_desde = 'tracker'", [p for p in base.t["profiles"] if p["id"] == LUIS][0].get("alta_desde") == "tracker")

# --- el tope ----------------------------------------------------------------------------------------
creadas = 0
while True:
    try:
        invitar()
        creadas += 1
    except ClientException as e:
        check("el tope de 20 cuenta las pendientes: la 21ª es un 400", e.status_code == 400 and "20" in e.detail)
        break
check("el tope se alcanzó con 20 en total", len([f for f in base.t["seguidores"] if f["piloto_id"] == FEDE]) == TOPE_SEGUIDORES)
check("las vencidas sin usar se limpiaron al invitar", not [f for f in base.t["seguidores"] if f["id"] == vencida["id"]])
base.t["seguidores"][:] = [f for f in base.t["seguidores"] if f["seguidor_id"]]  # dejo sólo a Ana y Luis

# --- asignar vuelos ---------------------------------------------------------------------------------
fila_ana = [f for f in base.t["seguidores"] if f["seguidor_id"] == ANA][0]["id"]
fila_luis = [f for f in base.t["seguidores"] if f["seguidor_id"] == LUIS][0]["id"]
v1 = vuelo(FEDE, "1", 30)
v2 = vuelo(FEDE, "2", 60)
vr = vuelo(OTRO_PILOTO, "r", 45)
for uid in (ANA, LUIS, SOFI):
    base.t["tracker_suscripciones"].append({"id": f"sub-{uid[:4]}", "user_id": uid, "endpoint": "https://fcm.googleapis.com/x/" + uid, "p256dh": "k", "auth": "a"})


def asignar(v, filas):
    return correr(Seg.asignar_seguidores.fn, None, pedido(FEDE), base, UUID(v["id"]), AsignacionIn(seguidor_ids=filas))


def vuelos_de(uid):
    return correr(Trk.vuelos.fn, None, pedido(uid))


check("por defecto nadie ve nada: ni quien sigue, ni quien no sigue a nadie", vuelos_de(ANA) == [] and vuelos_de(SOFI) == [])
asignar(v1, [fila_ana])
visto = vuelos_de(ANA)
check("asignado a Ana, Ana ve ese vuelo (y sólo ése)", [x["token"] for x in visto] == [v1["token"]])
check("trae lo del link público más el piloto con su @, y nada de la bitácora ni de la matrícula", visto[0]["piloto"] == {"nombre": "Federico", "handle": "fede"} and "avion_matricula" not in visto[0] and "user_id" not in visto[0] and "LV-ABC" not in repr(visto[0]) and visto[0]["estado"] == "en_vuelo")
check("Luis, que también sigue a Federico pero no fue asignado, no ve nada", vuelos_de(LUIS) == [])
check("el vuelo de otro piloto, que no asignó a nadie, no aparece", all(x["token"] != vr["token"] for x in vuelos_de(ANA)))
check("el detalle de un vuelo no asignado es 404 (y el asignado anda)", falla(lambda: correr(Trk.vuelo.fn, None, pedido(LUIS), v1["token"]), NotFoundException) == 404 and falla(lambda: correr(Trk.vuelo.fn, None, pedido(ANA), v2["token"]), NotFoundException) == 404 and correr(Trk.vuelo.fn, None, pedido(ANA), v1["token"])["token"] == v1["token"])
check("quien no sigue a nadie recibe 404 en cualquier vuelo", falla(lambda: correr(Trk.vuelo.fn, None, pedido(SOFI), v1["token"]), NotFoundException) == 404)
check("'a quiénes sigue': Ana ve a Federico con algo en marcha; Sofía, a nadie", correr(Trk.pilotos.fn, None, pedido(ANA)) == [{"nombre": "Federico", "handle": "fede", "activo": True}] and correr(Trk.pilotos.fn, None, pedido(SOFI)) == [])
check("el aviso 'compartió un vuelo' sale sólo a quien se suma", enviados == [(["sub-" + ANA[:4]], "Federico compartió un vuelo", f"/vuelo/{v1['token']}")])
enviados.clear()
asignar(v1, [fila_ana])
check("asignar de nuevo a la misma persona no repite el aviso", enviados == [])
asignar(v1, [fila_ana, fila_luis])
check("sumar a Luis le avisa sólo a Luis", enviados == [(["sub-" + LUIS[:4]], "Federico compartió un vuelo", f"/vuelo/{v1['token']}")])
enviados.clear()

pendiente = invitar("Todavía no entró")
check("no se puede asignar a una invitación pendiente (400)", falla(lambda: asignar(v2, [pendiente["id"]]), ClientException) == 400)
check("ni a un seguidor de otro piloto o un id inventado (400)", falla(lambda: asignar(v2, [str(uuid4())]), ClientException) == 400)
check("ni un vuelo ajeno (404)", falla(lambda: correr(Seg.asignar_seguidores.fn, None, pedido(FEDE), base, UUID(vr["id"]), AsignacionIn(seguidor_ids=[])), NotFoundException) == 404)
terminado = vuelo(FEDE, "t", 0, terminado_at=hora(-10))
check("ni un vuelo que ya terminó (410)", falla(lambda: asignar(terminado, [fila_ana]), ClientException) == 410)
base.t["seguidores"][:] = [f for f in base.t["seguidores"] if f["id"] != pendiente["id"]]

# --- los avisos del despegue y el aterrizaje van sólo a los asignados ------------------------------------
ids_barrido = av.ids_de_seguimientos_con_seguidores(base)
check("el barrido mira los vuelos asignados a quien tiene avisos prendidos (no el que no está asignado)", sorted(ids_barrido) == sorted([v1["id"]]))
despegue = av.enviar_a_asignados(base, v1["id"], armar_aviso_tracker("despegue", v1))
check("el despegue le llega a Ana y a Luis (asignados), no a Sofía ni a otros", despegue == 2 and enviados[-1][0] == sorted(["sub-" + ANA[:4], "sub-" + LUIS[:4]]) and enviados[-1][1] == "Federico despegó de SADM")
enviados.clear()
check("un vuelo sin asignados no manda nada", av.enviar_a_asignados(base, v2["id"], armar_aviso_tracker("aterrizaje", v2)) == 0 and enviados == [])
av._enviar_a_seguidores(base, v1, "aterrizaje")
check("el aviso de aterrizaje por el camino del barrido: a los asignados, con el link al tracker", enviados == [(sorted(["sub-" + ANA[:4], "sub-" + LUIS[:4]]), "Federico aterrizó en SAZS", f"/vuelo/{v1['token']}")])
enviados.clear()
check("el barrido completo corre con seguidores asignados", isinstance(barrer(base, AHORA), int))
enviados.clear()

# --- el listado del piloto -----------------------------------------------------------------------------------
base_chica = base.t["seguimiento_seguidores"]
check("la asignación quedó en la base: v1 con Ana y Luis", sorted(a["seguidor_fila_id"] for a in base_chica if a["seguimiento_id"] == v1["id"]) == sorted([fila_ana, fila_luis]))
activos = correr(Seg.activos.fn, None, pedido(FEDE), base)
check("`GET /seguimientos/activos` trae a quiénes está asignado cada vuelo", [x for x in activos if x["id"] == v1["id"]][0]["seguidor_ids"] == sorted([fila_ana, fila_luis]) and [x for x in activos if x["id"] == v2["id"]][0]["seguidor_ids"] == [])

# --- sacar la asignación y quitar a un seguidor --------------------------------------------------------------
asignar(v1, [fila_ana])
check("sacar a Luis de un vuelo se nota en el pedido siguiente", vuelos_de(LUIS) == [] and len(vuelos_de(ANA)) == 1)
correr(Pil.quitar.fn, None, pedido(FEDE), base, UUID(fila_ana))
check("quitar a un seguidor le saca todos los vuelos al instante", vuelos_de(ANA) == [] and falla(lambda: correr(Trk.vuelo.fn, None, pedido(ANA), v1["token"]), NotFoundException) == 404 and correr(Trk.pilotos.fn, None, pedido(ANA)) == [])
check("y se borran sus asignaciones", not [a for a in base.t["seguimiento_seguidores"] if a["seguidor_fila_id"] == fila_ana])
check("quitar dos veces es un 404; quitar la de otro, también", falla(lambda: correr(Pil.quitar.fn, None, pedido(FEDE), base, UUID(fila_ana)), NotFoundException) == 404 and falla(lambda: correr(Pil.quitar.fn, None, pedido(OTRO_PILOTO), base, UUID(fila_luis)), NotFoundException) == 404)
check("y los avisos dejan de llegarle: nadie asignado en v1", av.ids_de_seguimientos_con_seguidores(base) == [] and av.enviar_a_asignados(base, v1["id"], armar_aviso_tracker("despegue", v1)) == 0)

# --- los vuelos terminados hace poco y los viejos ------------------------------------------------------------
asignar(v2, [fila_luis])
reciente = vuelo(FEDE, "a", 0, terminado_at=hora(-30), vence_at=hora(-20), aterrizo_at=hora(-30))
viejo = vuelo(FEDE, "b", 0, terminado_at=hora(-60 * 5), vence_at=hora(-60 * 5))
for x in (reciente, viejo):
    base.t["seguimiento_seguidores"].append({"seguimiento_id": x["id"], "seguidor_fila_id": fila_luis})
visto = vuelos_de(LUIS)
check("un vuelo que terminó hace 30 min sigue visible ('aterrizó'), uno de hace 5 h no", [x["token"] for x in visto] == [v2["token"], reciente["token"]] or sorted(x["token"] for x in visto) == sorted([v2["token"], reciente["token"]]))
check("y los terminados van al final", visto[-1]["estado"] == "terminado")

print(f"\n{sum(resultados)}/{len(resultados)} ok")
sys.exit(0 if all(resultados) else 1)
