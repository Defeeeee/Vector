"""
Los avisos a quien mira el vuelo (migración 046): "despegó" y "aterrizó".

Offline, con una base en memoria. `python test_avisos_seguimiento.py`; sale con código 1 si algo falla.
"""

import sys
from datetime import datetime, timedelta, timezone

from pydantic import ValidationError

import src.services.avisos_seguimiento as av
from src.services.avisos_seguimiento import (
    AVISO_VIGENTE,
    TOPE_SUSCRIPCIONES,
    BajaAvisoIn,
    SuscripcionAvisoIn,
    armar_aviso_seguimiento,
    atender,
    avisar_fin_manual,
    barrer,
    decidir,
    endpoint_de_push_valido,
)
from src.services.seguimientos import vista_publica

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


T0 = datetime(2026, 11, 11, 12, 0, 0, tzinfo=timezone.utc)
TOKEN = "t" * 40

# --- los endpoints de push ---------------------------------------------------------------------
buenos = [
    "https://fcm.googleapis.com/fcm/send/abc:APA91b",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
    "https://web.push.apple.com/QOPlzx",
    "https://par02p.notify.windows.com/w/?token=BQYAAAB",
    "https://jmt17.google.com.push.apple.com/x",
]
malos = [
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://evil.example.com/fcm.googleapis.com",
    "https://fcm.googleapis.com.evil.com/send/abc",
    "https://evilfcm.googleapis.com.attacker.net/x",
    "https://fcm.googleapis.com@evil.com/x",
    "https://user:pw@fcm.googleapis.com/x",
    "https://fcm.googleapis.com:8443/x",
    "https://127.0.0.1/x",
    "https://localhost/x",
    "https://notify.windows.com.evil.io/x",
    "https://fcm.googleapis.com",
    "ftp://fcm.googleapis.com/x",
    " https://fcm.googleapis.com/x",
    "",
    None,
    123,
    "https://fcm.googleapis.com/" + "a" * 1000,
]
check("los servicios de push conocidos se aceptan", all(endpoint_de_push_valido(e) for e in buenos))
check("cualquier otra URL se rechaza (http, host ajeno, usuario, puerto, IP, vacío)", not any(endpoint_de_push_valido(e) for e in malos))
ok = SuscripcionAvisoIn(endpoint=buenos[0], keys={"p256dh": "BNc-abc_def", "auth": "x1_-Y="})
check("el pedido válido pasa", ok.endpoint == buenos[0] and ok.keys.auth == "x1_-Y=")
check("el pedido con endpoint ajeno o claves vacías o raras falla", falla(lambda: SuscripcionAvisoIn(endpoint="https://evil.example.com/x", keys={"p256dh": "a", "auth": "b"})) and falla(lambda: SuscripcionAvisoIn(endpoint=buenos[0], keys={"p256dh": "", "auth": "b"})) and falla(lambda: SuscripcionAvisoIn(endpoint=buenos[0], keys={"p256dh": "a b", "auth": "b"})) and falla(lambda: SuscripcionAvisoIn(endpoint=buenos[0], keys={"p256dh": "a" * 201, "auth": "b"})))
check("la baja pide el mismo tipo de endpoint", BajaAvisoIn(endpoint=buenos[1]).endpoint == buenos[1] and falla(lambda: BajaAvisoIn(endpoint="https://evil.example.com/x")))
check("el tope de navegadores por vuelo es 30", TOPE_SUSCRIPCIONES == 30)

# --- el texto ---------------------------------------------------------------------------------
fila_base = {
    "id": "s1", "token": TOKEN, "nombre": "Federico", "ruta": "SADM SRDL",
    "puntos": [[-34.56, -58.96, "SADM", "Morón"], [-34.7, -58.9, "", "Punto intermedio"], [-35.0, -59.0, "SRDL", "Dolores"]],
    "created_at": (T0 - timedelta(hours=3)).isoformat(), "vence_at": (T0 + timedelta(hours=6)).isoformat(), "terminado_at": None,
    "recorrido": [], "ultima_lat": None, "ultima_lon": None, "ultima_at": None,
    "avion_matricula": None, "mostrar_matricula": False, "matricula_adsb": "LVABC",
    "salida_prevista": (T0 + timedelta(minutes=30)).isoformat(), "aterrizo_at": None,
    "despego_at": None, "aviso_despegue_at": None, "aviso_aterrizaje_at": None,
}
d = armar_aviso_seguimiento("despegue", fila_base)
a = armar_aviso_seguimiento("aterrizaje", fila_base)
f = armar_aviso_seguimiento("fin", fila_base)
check("despegue: 'Federico despegó de SADM', y abre el link", d["titulo"] == "Federico despegó de SADM" and d["url"] == f"/seguir/{TOKEN}")
check("aterrizaje: 'Federico aterrizó en SRDL'", a["titulo"] == "Federico aterrizó en SRDL")
check("fin a mano: 'Federico terminó el vuelo'", f["titulo"] == "Federico terminó el vuelo")
check("sin la matrícula, en ningún campo, si el piloto no la prendió", all("LV-ABC" not in repr(x) and "LVABC" not in repr(x) for x in (d, a, f)))
con = {**fila_base, "mostrar_matricula": True, "avion_matricula": "LV-ABC"}
check("con la matrícula prendida, va en el cuerpo", armar_aviso_seguimiento("despegue", con)["cuerpo"].startswith("LV-ABC"))
check("prendida pero sin matrícula guardada: no sale nada raro", "None" not in repr(armar_aviso_seguimiento("despegue", {**fila_base, "mostrar_matricula": True, "avion_matricula": None})))
check("sin puntos, el aviso igual dice algo", armar_aviso_seguimiento("despegue", {**fila_base, "puntos": []})["titulo"] == "Federico despegó" and armar_aviso_seguimiento("aterrizaje", {**fila_base, "puntos": [fila_base["puntos"][0]]})["titulo"] == "Federico aterrizó")
check("un aviso de despegue no tapa al de aterrizaje (etiquetas distintas)", d["etiqueta"] != a["etiqueta"] and a["etiqueta"] == f["etiqueta"])
check("un evento desconocido es un error", falla(lambda: armar_aviso_seguimiento("otra", fila_base)))


# --- una base en memoria -------------------------------------------------------------------------
class Resp:
    def __init__(self, data, count=None):
        self.data, self.count = data, count


class Consulta:
    def __init__(self, base, nombre):
        self.base, self.nombre, self.accion, self.cambios, self.filtros, self.tope, self.orden = base, nombre, "select", None, [], None, None
        self.cuenta = False

    def select(self, *_a, count=None, head=None):
        self.accion, self.cuenta = "select", bool(count)
        return self

    def update(self, cambios):
        self.accion, self.cambios = "update", cambios
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
        self.filtros.append(lambda r: r.get(c) >= v)
        return self

    def lte(self, c, v):
        self.filtros.append(lambda r: r.get(c) <= v)
        return self

    def order(self, c, desc=False):
        self.orden = (c, desc)
        return self

    def limit(self, n):
        self.tope = n
        return self

    def execute(self):
        filas = self.base[self.nombre]
        hay = [r for r in filas if all(f(r) for f in self.filtros)]
        if self.accion == "update":
            for r in hay:
                r.update(self.cambios)
            return Resp([dict(r) for r in hay])
        if self.accion == "delete":
            for r in hay:
                filas.remove(r)
            return Resp([])
        if self.orden:
            hay.sort(key=lambda r: r[self.orden[0]], reverse=self.orden[1])
        if self.tope:
            hay = hay[: self.tope]
        return Resp([dict(r) for r in hay], len(hay) if self.cuenta else None)


class Base:
    def __init__(self, seguimientos, subs, adsb):
        self.t = {"seguimientos_en_vivo": seguimientos, "seguimientos_avisos": subs, "adsb_posiciones": adsb}

    def table(self, nombre):
        return Consulta(self.t, nombre)


def adsb(minutos, lat, lon, alt=None, gs=None, tierra=False, seg=0):
    return {"matricula": "LVABC", "visto_at": (T0 + timedelta(minutes=minutos, seconds=seg)).isoformat(), "lat": lat, "lon": lon, "altitud": alt, "velocidad": gs, "en_tierra": tierra}


sin_volar = [adsb(m, -34.56, -58.96, None, 0, True) for m in (20, 22, 24)]
despegue = [adsb(31, -34.56, -58.97, 300, 60), adsb(32, -34.57, -58.98, 900, 85), adsb(33, -34.58, -59.0, 1500, 95), adsb(34, -34.59, -59.05, 1500, 95)]
crucero = [adsb(35, -34.7, -59.0, 1500, 95)]
llegada = [adsb(50, -34.99, -59.0, 80, 45), adsb(51, -34.99, -59.0, None, 20, True), adsb(52, -34.99, -59.0, None, 8, True)]

enviados = []
av.avisos_configurados = lambda: True
av.mandar_a = lambda subs, aviso, borrar: enviados.append((len(subs), aviso["titulo"], aviso["url"])) or len(subs)


def nueva_base(adsb_rows, **cambios):
    fila = {**fila_base, **cambios}
    return Base([fila], [{"id": "a1", "seguimiento_id": "s1", "endpoint": buenos[0], "p256dh": "k", "auth": "x"}], list(adsb_rows)), fila


# --- las transiciones, una sola vez -------------------------------------------------------------
base, fila = nueva_base(sin_volar)
base.t["adsb_posiciones"] = list(sin_volar)
check("antes de salir: nada", barrer(base, T0 + timedelta(minutes=25)) == 0 and enviados == [])

base.t["adsb_posiciones"] = sin_volar + despegue
check("despega: avisa 'despegó de SADM' al navegador suscripto", barrer(base, T0 + timedelta(minutes=34, seconds=20)) == 1 and enviados == [(1, "Federico despegó de SADM", f"/seguir/{TOKEN}")])
check("y guarda cuándo despegó (la primera muestra en el aire) y cuándo avisó", fila["despego_at"] == (T0 + timedelta(minutes=31)).isoformat() and fila["aviso_despegue_at"] is not None)
n = len(enviados)
check("el barrido siguiente no lo repite", barrer(base, T0 + timedelta(minutes=34, seconds=50)) == 0 and len(enviados) == n)
base.t["adsb_posiciones"] = sin_volar + despegue + crucero
check("ni mientras sigue volando", barrer(base, T0 + timedelta(minutes=36)) == 0 and len(enviados) == n)

base.t["adsb_posiciones"] = sin_volar + despegue + crucero + llegada
check("antes de los 3 minutos en tierra no hay aterrizaje", barrer(base, T0 + timedelta(minutes=52)) == 0 and fila["terminado_at"] is None)
check("aterriza: avisa 'aterrizó en SRDL'", barrer(base, T0 + timedelta(minutes=56)) == 1 and enviados[-1][1] == "Federico aterrizó en SRDL")
check("y termina el seguimiento, con el aterrizaje guardado", fila["terminado_at"] is not None and fila["aterrizo_at"] == fila["terminado_at"] and fila["aviso_aterrizaje_at"] is not None)
n = len(enviados)
check("después, el vuelo ya no se mira ni se repite nada", barrer(base, T0 + timedelta(minutes=57)) == 0 and barrer(base, T0 + timedelta(minutes=70)) == 0 and len(enviados) == n)
check("en total, dos avisos: despegue y aterrizaje", [e[1] for e in enviados] == ["Federico despegó de SADM", "Federico aterrizó en SRDL"])

# El mismo barrido corrido dos veces a la vez: el segundo pierde la reserva.
enviados.clear()
base2, fila2 = nueva_base(sin_volar + despegue)
d1 = decidir(fila2, base2.t["adsb_posiciones"], T0 + timedelta(minutes=34, seconds=20))
check("decidir pide reservar y mandar el despegue", d1["reservar_despegue"] and d1["enviar_despegue"] and not d1["reservar_aterrizaje"])
atender(base2, dict(fila2), T0 + timedelta(minutes=34, seconds=20))
atender(base2, dict(fila2), T0 + timedelta(minutes=34, seconds=21))  # con la fila vieja, como un segundo proceso
check("dos procesos con la misma foto vieja: sale una sola vez", len(enviados) == 1)

# Un despegue que se ve tarde se anota y no se avisa.
enviados.clear()
base3, fila3 = nueva_base(sin_volar + despegue + crucero)
tarde = T0 + timedelta(minutes=31) + AVISO_VIGENTE + timedelta(minutes=1)
atender(base3, dict(fila3), tarde)
check("un despegue visto 20 min tarde no se avisa, pero queda anotado", enviados == [] and fila3["aviso_despegue_at"] is not None and fila3["despego_at"] is not None)

# Lo terminó la lectura pública del link (que no manda avisos): el barrido avisa el aterrizaje.
enviados.clear()
toque = (T0 + timedelta(minutes=51)).isoformat()
base4, fila4 = nueva_base(sin_volar + despegue + crucero + llegada, terminado_at=toque, aterrizo_at=toque, despego_at=(T0 + timedelta(minutes=31)).isoformat(), aviso_despegue_at=T0.isoformat())
check("terminado por aterrizaje desde la lectura pública: el barrido avisa", barrer(base4, T0 + timedelta(minutes=57)) == 1 and enviados[-1][1] == "Federico aterrizó en SRDL")
check("...y una vez", barrer(base4, T0 + timedelta(minutes=58)) == 0)

# Terminado a mano: no hay aterrizaje; lo avisa el controlador.
enviados.clear()
base5, fila5 = nueva_base(sin_volar + despegue + crucero, terminado_at=(T0 + timedelta(minutes=40)).isoformat(), despego_at=(T0 + timedelta(minutes=31)).isoformat(), aviso_despegue_at=T0.isoformat())
check("terminado a mano: el barrido no inventa un aterrizaje", barrer(base5, T0 + timedelta(minutes=41)) == 0 and enviados == [])
avisar_fin_manual(base5, fila5)
check("el controlador avisa 'terminó el vuelo'", enviados == [(1, "Federico terminó el vuelo", f"/seguir/{TOKEN}")])
avisar_fin_manual(base5, base5.t["seguimientos_en_vivo"][0])
check("y no dos veces", len(enviados) == 1)
check("ni 'terminó' si ya había aterrizado", (avisar_fin_manual(base4, {**fila4, "aviso_aterrizaje_at": None}), len(enviados))[1] == 1)

# Vencido: nadie avisa nada.
enviados.clear()
base6, fila6 = nueva_base(sin_volar + despegue, vence_at=(T0 + timedelta(minutes=33)).isoformat())
check("un vuelo vencido no manda avisos", barrer(base6, T0 + timedelta(hours=1)) == 0 and enviados == [])

# Sin suscripciones, ni se lee.
base7, _ = nueva_base(sin_volar + despegue)
base7.t["seguimientos_avisos"].clear()
check("sin nadie suscripto no se manda ni se anota nada", barrer(base7, T0 + timedelta(minutes=34, seconds=20)) == 0 and base7.t["seguimientos_en_vivo"][0]["aviso_despegue_at"] is None)

# Vuelo del Mapa (sólo GPS del teléfono, sin salida prevista): el despegue sale igual.
enviados.clear()
def tel(m, lat, lon, seg=0):
    return [lat, lon, 1500, int((T0 + timedelta(minutes=m, seconds=seg)).timestamp())]
rec = [tel(1, -34.5, -58.6), tel(1, -34.505, -58.6, seg=10), tel(1, -34.51, -58.6, seg=20), tel(1, -34.515, -58.6, seg=30), tel(1, -34.52, -58.6, seg=40),
       tel(1, -34.525, -58.6, seg=50), tel(2, -34.53, -58.6), tel(2, -34.535, -58.6, seg=10)]
mapa = {"salida_prevista": None, "matricula_adsb": None, "created_at": T0.isoformat(), "recorrido": rec, "ultima_lat": -34.54, "ultima_lon": -58.6, "ultima_alt_ft": 1500,
        "ultima_gs_kt": 95.0, "ultima_track": 180.0, "ultima_at": (T0 + timedelta(minutes=2, seconds=40)).isoformat(), "vence_at": (T0 + timedelta(hours=12)).isoformat()}
base8, fila8 = nueva_base([], **mapa)
check("vuelo del Mapa con GPS del teléfono: avisa el despegue", barrer(base8, T0 + timedelta(minutes=2, seconds=50)) == 1 and enviados[-1][1] == "Federico despegó de SADM")
check("...y el aterrizaje no se inventa (lo cierra el piloto)", barrer(base8, T0 + timedelta(minutes=30)) == 0)

# Sin las claves VAPID, nada.
av.avisos_configurados = lambda: False
base9, _ = nueva_base(sin_volar + despegue)
check("sin claves VAPID no se manda nada", barrer(base9, T0 + timedelta(minutes=34, seconds=20)) == 0)
av.avisos_configurados = lambda: True

# --- lo público no filtra nada --------------------------------------------------------------------
vp = vista_publica({**fila_base, "despego_at": T0.isoformat(), "aviso_despegue_at": T0.isoformat(), "aviso_aterrizaje_at": T0.isoformat(), "endpoint": buenos[0]}, T0 + timedelta(minutes=5), [])
check("la vista pública no trae suscripciones, endpoints ni las marcas de aviso", not any(k in vp for k in ("despego_at", "aviso_despegue_at", "aviso_aterrizaje_at", "endpoint", "avisos", "suscripciones")) and buenos[0] not in repr(vp))

fallas = resultados.count(False)
print(f"\n{len(resultados) - fallas}/{len(resultados)} bien")
sys.exit(1 if fallas else 0)
