"""
Seguir el vuelo en vivo (migración 041): el token, las posiciones, el raleo, el estado y,
sobre todo, lo único que ve quien abre el link.

Offline. `python test_seguimientos.py`; sale con código 1 si algo falla.
"""

import sys
from datetime import datetime, timedelta, timezone

from pydantic import ValidationError

from src.services.seguimientos import (
    AvionCompartido,
    DIAS_DE_RETENCION,
    GRACIA_DESPUES_DE_TERMINAR,
    MatriculaVisible,
    PosicionEnVivo,
    RutaNueva,
    SeguimientoCrear,
    SeguimientoDesdePlan,
    SEGUNDOS_ENTRE_VISTAS,
    TOPE_RECORRIDO,
    TOPE_VISITANTES,
    VENTANA_MIRANDO_S,
    ADELANTO_ADSB,
    COLA_TRAS_ATERRIZAR,
    DURACION_POR_DEFECTO_MIN,
    GPS_VIGENTE_S,
    MARGEN_DE_VENCIMIENTO,
    SEGUNDOS_PARA_ATERRIZAR,
    TOPE_RECORRIDO_PUBLICO,
    agregar_al_recorrido,
    anotar_vista,
    aterrizaje,
    duracion_del_plan,
    estado_de,
    evaluar_vuelo,
    fusionar,
    hubo_vuelo,
    matricula_para_adsb,
    muestras_de_adsb,
    muestras_del_telefono,
    ralear_adsb,
    salida_aceptable,
    salida_del_plan,
    sin_el_vuelo_anterior,
    unir_filas_adsb,
    vencimiento_desde_plan,
    ventana_adsb,
    id_de_visitante_valido,
    esta_activo,
    limite_de_retencion,
    nombre_de_pila,
    nuevo_token,
    puede_aceptar_posicion,
    resumen_de_vistas,
    vence_en,
    visible,
    vista_publica,
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


T0 = datetime(2026, 11, 11, 12, 0, 0, tzinfo=timezone.utc)

# --- el token ---
tokens = {nuevo_token() for _ in range(500)}
check("500 tokens, ninguno repetido", len(tokens) == 500)
check("de 32 caracteres url-safe", all(len(t) == 32 and all(c.isalnum() or c in "-_" for c in t) for t in tokens))

# --- el nombre ---
check("sólo el nombre de pila", nombre_de_pila("María José") == "María" and nombre_de_pila("  Federico ") == "Federico")
check("sin nombre: un piloto", nombre_de_pila(None) == "Un piloto" and nombre_de_pila("   ") == "Un piloto")

# --- la posición ---
check("una posición válida", PosicionEnVivo(lat=-34.45, lon=-58.59, alt_ft=1500, gs_kt=95, track=270).lat == -34.45)
check("sólo lat y lon alcanzan", PosicionEnVivo(lat=-34.45, lon=-58.59).alt_ft is None)
check("latitud fuera de rango", falla(lambda: PosicionEnVivo(lat=91, lon=0)))
check("longitud fuera de rango", falla(lambda: PosicionEnVivo(lat=0, lon=-181)))
check("altura imposible", falla(lambda: PosicionEnVivo(lat=0, lon=0, alt_ft=90000)))
check("velocidad negativa", falla(lambda: PosicionEnVivo(lat=0, lon=0, gs_kt=-1)))
check("track fuera de 0–360", falla(lambda: PosicionEnVivo(lat=0, lon=0, track=361)))
check("no acepta texto en las coordenadas", falla(lambda: PosicionEnVivo(lat="x", lon=0)))

# --- la ruta que se manda al empezar ---
c = SeguimientoCrear(ruta="  SADF   SADM ", puntos=[{"lat": -34.45, "lon": -58.59, "codigo": "SADF"}])
check("la ruta se limpia", c.ruta == "SADF SADM" and c.puntos[0].codigo == "SADF")
check("la ruta no pasa de 600", falla(lambda: SeguimientoCrear(ruta="X" * 601)))
check("no más de 60 puntos", falla(lambda: SeguimientoCrear(puntos=[{"lat": 0, "lon": 0}] * 61)))
check("el punto lleva su nombre, limpio", SeguimientoCrear(puntos=[{"lat": 0, "lon": 0, "codigo": "SADF", "nombre": " San   Fernando "}]).puntos[0].nombre == "San Fernando")
check("el nombre de un punto no pasa de 60", falla(lambda: SeguimientoCrear(puntos=[{"lat": 0, "lon": 0, "nombre": "N" * 61}])))
check("la matrícula se pide apagada por defecto", SeguimientoCrear().mostrar_matricula is False)
check("el avión se limpia", AvionCompartido(tipo=" Cessna  152 ", icao="C152", matricula="LV-ABC").tipo == "Cessna 152")
check("la matrícula no pasa de 12", falla(lambda: AvionCompartido(matricula="X" * 13)))
check("prender la matrícula la lleva", MatriculaVisible(mostrar=True, matricula="LV-ABC").matricula == "LV-ABC")
check("un punto de la ruta con coordenada imposible", falla(lambda: SeguimientoCrear(puntos=[{"lat": 100, "lon": 0}])))

# --- el estado y cuánto se ve ---
viva = {"vence_at": vence_en(T0).isoformat(), "terminado_at": None}
check("vence a las 12 horas", vence_en(T0) - T0 == timedelta(hours=12))
check("en vuelo", estado_de(viva, T0 + timedelta(hours=1)) == "en_vuelo" and esta_activo(viva, T0))
check("pasadas las 12 horas: vencido", estado_de(viva, T0 + timedelta(hours=12, seconds=1)) == "vencido")
check("un vencido no acepta posiciones", not esta_activo(viva, T0 + timedelta(hours=13)))
terminada = {"vence_at": vence_en(T0).isoformat(), "terminado_at": (T0 + timedelta(hours=1)).isoformat()}
check("terminada: terminado, aunque no haya vencido", estado_de(terminada, T0 + timedelta(hours=2)) == "terminado")
check("una terminada no acepta posiciones", not esta_activo(terminada, T0 + timedelta(hours=2)))
check("se ve en vuelo", visible(viva, T0 + timedelta(hours=5)))
check("terminada se sigue viendo un rato", visible(terminada, T0 + timedelta(hours=1) + GRACIA_DESPUES_DE_TERMINAR - timedelta(minutes=1)))
check("y después es un 404", not visible(terminada, T0 + timedelta(hours=1) + GRACIA_DESPUES_DE_TERMINAR))
check("vencida sin terminar: la misma gracia desde que venció", visible(viva, T0 + timedelta(hours=13)) and not visible(viva, T0 + timedelta(hours=14, seconds=1)))
check("con la hora tal como la devuelve Supabase", estado_de({"vence_at": "2026-11-11T20:00:00.5+00:00", "terminado_at": None}, T0) == "en_vuelo")
check("sin fecha de vencimiento: vencido", estado_de({"vence_at": None, "terminado_at": None}, T0) == "vencido")

# --- la ruta cambiada en vuelo ---
rn = RutaNueva(ruta="  S34.4091/W58.6847   SADM ", puntos=[{"lat": -34.4091, "lon": -58.6847, "codigo": "S34.4091/W58.6847"}, {"lat": -34.56, "lon": -58.96, "codigo": "SADM", "nombre": " Morón "}])
check("la ruta nueva se limpia", rn.ruta == "S34.4091/W58.6847 SADM" and rn.puntos[1].nombre == "Morón")
check("la ruta nueva no pasa de 600", falla(lambda: RutaNueva(ruta="X" * 601)))
check("ni más de 60 puntos", falla(lambda: RutaNueva(puntos=[{"lat": 0, "lon": 0}] * 61)) and len(RutaNueva(puntos=[{"lat": 0, "lon": 0}] * 60).puntos) == 60)
check("ni coordenadas imposibles", falla(lambda: RutaNueva(puntos=[{"lat": 0, "lon": 181}])))
check("sin nada es una ruta vacía (se puede borrar la ruta)", RutaNueva().ruta == "" and RutaNueva().puntos == [])
check("el código de un punto no pasa de 20", falla(lambda: RutaNueva(puntos=[{"lat": 0, "lon": 0, "codigo": "C" * 21}])))
# Cambiar la ruta sólo vale mientras se vuela: el controlador usa `esta_activo` (410 si no).
check("sólo en vuelo acepta una ruta nueva", esta_activo(viva, T0) and not esta_activo(terminada, T0 + timedelta(hours=2)) and not esta_activo(viva, T0 + timedelta(hours=13)))
check("la ruta nueva se ve en el link (vista_publica lee ruta y puntos de la fila)", vista_publica({"nombre": "L", "vence_at": vence_en(T0).isoformat(), "terminado_at": None, "ruta": rn.ruta, "puntos": [[p.lat, p.lon, p.codigo, p.nombre] for p in rn.puntos]}, T0)["puntos"][1] == [-34.56, -58.96, "SADM", "Morón"])

# --- el raleo del servidor ---
check("la primera posición entra", puede_aceptar_posicion(None, T0))
check("a los 5 s no", not puede_aceptar_posicion(T0.isoformat(), T0 + timedelta(seconds=5)))
check("a los 10 s sí", puede_aceptar_posicion(T0.isoformat(), T0 + timedelta(seconds=10)))

# --- el recorrido ---
r = agregar_al_recorrido([], -34.45, -58.59)
check("el primer punto", r == [[-34.45, -58.59]])
rc = agregar_al_recorrido([], -34.45, -58.59, 1523.4, 1_800_000_000)
check("con altura y hora: [lat, lon, alt_ft, epoch_s]", rc == [[-34.45, -58.59, 1523, 1_800_000_000]])
check("un recorrido viejo de dos elementos sigue valiendo y suma al nuevo formato", agregar_al_recorrido(r, -34.46, -58.59, 900, 5) == [[-34.45, -58.59], [-34.46, -58.59, 900, 5]])
check("quieto no suma", agregar_al_recorrido(r, -34.450001, -58.590001) == r)
check("movido suma", len(agregar_al_recorrido(r, -34.46, -58.59)) == 2)
check("no modifica el arreglo que recibe", r == [[-34.45, -58.59]])
largo: list = []
for i in range(2000):
    largo = agregar_al_recorrido(largo, -34.0 - i * 0.001, -58.0)
check(f"nunca pasa de {TOPE_RECORRIDO} puntos", len(largo) <= TOPE_RECORRIDO)
check("conserva el principio y el final", largo[0] == [-34.0, -58.0] and largo[-1] == [round(-34.0 - 1999 * 0.001, 5), -58.0])
check("y sigue en orden", all(largo[i][0] > largo[i + 1][0] for i in range(len(largo) - 1)))

# --- lo que ve quien abre el link ---
fila = {
    "id": "11111111-1111-1111-1111-111111111111",
    "user_id": "22222222-2222-2222-2222-222222222222",
    "token": "T" * 32,
    "email": "piloto@example.com",
    "matricula": "LV-ABC",
    "aircraft_id": "33333333-3333-3333-3333-333333333333",
    "nombre": "Lucía",
    "ruta": "SADF SADM",
    "puntos": [[-34.45, -58.59, "SADF"], [-34.56, -58.96, "SADM"]],
    "vence_at": vence_en(T0).isoformat(),
    "terminado_at": None,
    "ultima_lat": -34.5,
    "ultima_lon": -58.7,
    "ultima_alt_ft": 1800,
    "ultima_gs_kt": 92.0,
    "ultima_track": 250.0,
    "ultima_at": (T0 + timedelta(minutes=20)).isoformat(),
    "recorrido": [[-34.45, -58.59], [-34.5, -58.7, 1800, int((T0 + timedelta(minutes=20)).timestamp())]],
    "created_at": T0.isoformat(),
    "avion_tipo": "Cessna 152",
    "avion_icao": "C152",
    "avion_matricula": None,
    "mostrar_matricula": False,
}
v = vista_publica(fila, T0 + timedelta(minutes=21))
check("estado, nombre y ruta", (v["estado"], v["nombre"], v["ruta"]) == ("en_vuelo", "Lucía", "SADF SADM"))
check("la última posición, con su hora", v["ultima"]["lat"] == -34.5 and v["ultima"]["hora"] == fila["ultima_at"] and v["ultima"]["alt_ft"] == 1800)
check("el recorrido y los puntos de la ruta", len(v["recorrido"]) == 2 and v["puntos"][0] == [-34.45, -58.59, "SADF", ""])
check("el recorrido viejo se lee, con altura y hora en null, y es del teléfono", v["recorrido"][0] == [-34.45, -58.59, None, None, "gps"] and v["recorrido"][1] == [-34.5, -58.7, 1800, int((T0 + timedelta(minutes=20)).timestamp()), "gps"])
check("la última posición dice de dónde salió", v["ultima"]["fuente"] == "gps")
check("los puntos con nombre", vista_publica({**fila, "puntos": [[-34.45, -58.59, "SADF", "San Fernando"]]}, T0)["puntos"] == [[-34.45, -58.59, "SADF", "San Fernando"]])
check("la hora de inicio", v["inicio"] == T0.isoformat())
check("el avión, sin matrícula", v["avion"] == {"tipo": "Cessna 152", "icao": "C152"})
CLAVES_PUBLICAS = {"nombre", "ruta", "puntos", "avion", "inicio", "estado", "fase", "salida_prevista", "con_adsb", "ultima", "recorrido", "ahora"}
check("las claves son exactamente las permitidas", set(v) == CLAVES_PUBLICAS)
check("las claves de la última posición", set(v["ultima"]) == {"lat", "lon", "alt_ft", "gs_kt", "track", "hora", "fuente"})
# La matrícula: sólo con el interruptor prendido. Apagado no sale aunque la fila la tuviera.
apagado_con_dato = vista_publica({**fila, "avion_matricula": "LV-ABC", "mostrar_matricula": False}, T0)
check("interruptor apagado: la matrícula NO sale, aunque esté en la fila", "LV-ABC" not in repr(apagado_con_dato) and "matricula" not in apagado_con_dato["avion"])
check("interruptor sin definir: tampoco", "LV-ABC" not in repr(vista_publica({k: x for k, x in {**fila, "avion_matricula": "LV-ABC"}.items() if k != "mostrar_matricula"}, T0)))
prendido = vista_publica({**fila, "avion_matricula": "LV-ABC", "mostrar_matricula": True}, T0)
check("interruptor prendido: sale", prendido["avion"] == {"tipo": "Cessna 152", "icao": "C152", "matricula": "LV-ABC"})
check("prendido pero sin matrícula guardada: no inventa una", "matricula" not in vista_publica({**fila, "mostrar_matricula": True}, T0)["avion"])
check("sin datos del avión: null", vista_publica({**fila, "avion_tipo": None, "avion_icao": None}, T0)["avion"] is None)
texto = repr(v)
for secreto in ("LV-ABC", "piloto@example.com", fila["user_id"], fila["id"], fila["token"], fila["aircraft_id"]):
    check(f"no sale {secreto[:12]}…", secreto not in texto)
check("sin posición todavía: ultima es null", vista_publica({**fila, "ultima_lat": None, "ultima_lon": None, "ultima_at": None, "recorrido": []}, T0)["ultima"] is None)
check("un campo nuevo en la fila no sale solo", "secreto" not in vista_publica({**fila, "secreto": "x"}, T0))
check("terminada: lo dice", vista_publica({**fila, "terminado_at": T0.isoformat()}, T0)["estado"] == "terminado")
check("puntos con basura se descartan", vista_publica({**fila, "puntos": [["a", "b"], None, [1, 2]]}, T0)["puntos"] == [[1, 2, "", ""]])

# --- quién mira (migración 044) ---
check("un id de 16 caracteres sirve", id_de_visitante_valido("aB3_-xYz09kLmNoP"))
check("mal formados no sirven", not any(id_de_visitante_valido(x) for x in (None, "", "corto", "a" * 33, "con espacios 123456", "ñandú" * 4, 12345, "<script>alert(1)</script>")))

A, B, C = "aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb", "cccccccccccccccc"
check("un id mal formado no se anota", anotar_vista({}, 0, "x", T0) is None and anotar_vista({}, 0, None, T0) is None)
w = anotar_vista({}, 0, A, T0)
check("el primer id se anota con su hora y suma uno", w["vistas"] == {A: int(T0.timestamp())} and w["vistos_total"] == 1 and w["ultima_vista_at"] == T0.isoformat())
check("se guarda el id y la hora, nada más", set(w) == {"vistas", "vistos_total", "ultima_vista_at"})
check("el mismo id antes de 30 s no escribe", anotar_vista(w["vistas"], 1, A, T0 + timedelta(seconds=SEGUNDOS_ENTRE_VISTAS - 1)) is None)
w2 = anotar_vista(w["vistas"], 1, A, T0 + timedelta(seconds=SEGUNDOS_ENTRE_VISTAS))
check("el mismo id pasados 30 s se actualiza y no suma otro visitante", w2["vistos_total"] == 1 and w2["vistas"][A] == int(T0.timestamp()) + SEGUNDOS_ENTRE_VISTAS)
w3 = anotar_vista(w2["vistas"], 1, B, T0 + timedelta(seconds=31))
check("otro id suma un visitante", w3["vistos_total"] == 2 and set(w3["vistas"]) == {A, B})
muchos = {f"{i:016d}": int(T0.timestamp()) + i for i in range(TOPE_VISITANTES)}
w4 = anotar_vista(muchos, TOPE_VISITANTES, C, T0 + timedelta(seconds=100))
check("el tope de 20 deja a los más recientes", len(w4["vistas"]) == TOPE_VISITANTES and C in w4["vistas"] and f"{0:016d}" not in w4["vistas"] and w4["vistos_total"] == TOPE_VISITANTES + 1)
check("vistas con basura no rompen", anotar_vista("raro", None, A, T0)["vistos_total"] == 1)

def fila_con(vistas, total, ultima=None):
    return {"vistas": vistas, "vistos_total": total, "ultima_vista_at": ultima}

ep = int(T0.timestamp())
r = resumen_de_vistas(fila_con({A: ep - 10, B: ep - VENTANA_MIRANDO_S, C: ep - VENTANA_MIRANDO_S - 1}, 3, T0.isoformat()), T0)
check("mirando ahora: los de los últimos 45 s (el borde entra)", r["mirando_ahora"] == 2 and VENTANA_MIRANDO_S == 45)
check("vistos en total y última vista", r["vistos_total"] == 3 and r["ultima_vista_at"] == T0.isoformat() and r["ahora"] == T0.isoformat())
check("nadie vio: ceros y sin fecha", resumen_de_vistas({}, T0) == {"mirando_ahora": 0, "vistos_total": 0, "ultima_vista_at": None, "ahora": T0.isoformat()})
check("el total nunca es menor que los que miran", resumen_de_vistas(fila_con({A: ep, B: ep}, 0), T0)["vistos_total"] == 2)
# Lo terminado o vencido no anota: el controlador lo decide con `esta_activo`.
check("lo terminado no está activo (no anota)", not esta_activo({"terminado_at": T0.isoformat(), "vence_at": (T0 + timedelta(hours=5)).isoformat()}, T0))
check("lo vencido no está activo (no anota)", not esta_activo({"vence_at": (T0 - timedelta(minutes=1)).isoformat()}, T0))
vp = vista_publica({**fila, "vistas": {A: ep}, "vistos_total": 7, "ultima_vista_at": T0.isoformat()}, T0)
check("la vista pública no ganó claves ni cuenta vistas", set(vp) == CLAVES_PUBLICAS and A not in repr(vp))

# =====================================================================================
# ADS-B y el plan de vuelo (migración 045)
# =====================================================================================
def adsb(minutos, lat, lon, alt=None, gs=None, tierra=False, seg=0):
    """Una fila de `adsb_posiciones` a `minutos` de T0."""
    return {"visto_at": (T0 + timedelta(minutes=minutos, seconds=seg)).isoformat(), "lat": lat, "lon": lon, "altitud": alt, "velocidad": gs, "en_tierra": tierra}

def tel(minutos, lat, lon, alt=1500, gs=95.0, seg=0):
    """Un punto del recorrido del teléfono a `minutos` de T0."""
    return [lat, lon, alt, int((T0 + timedelta(minutes=minutos, seconds=seg)).timestamp())]

# --- la matrícula para ADS-B ---
check("LV-ABC -> LVABC", matricula_para_adsb("LV-ABC") == "LVABC" and matricula_para_adsb(" lv s114 ") == "LVS114")
check("sin matrícula, nada", matricula_para_adsb("") is None and matricula_para_adsb(None) is None and matricula_para_adsb("X") is None)

# --- el plan de vuelo como origen ---
plan = {"dof": "2026-11-11", "eobt": "1530", "demoras": [], "formulario": {"eet": "0130", "matricula": "LV-ABC"}}
check("la salida del plan, en UTC", salida_del_plan(plan) == datetime(2026, 11, 11, 15, 30, tzinfo=timezone.utc))
check("la última demora manda", salida_del_plan({**plan, "demoras": [{"dof": "2026-11-11", "eobt": "1600"}, {"dof": "2026-11-11", "eobt": "1700"}]}) == datetime(2026, 11, 11, 17, 0, tzinfo=timezone.utc))
check("sin las columnas, el formulario", salida_del_plan({"formulario": {"dofUtc": "2026-11-12", "eobtUtc": "0045"}}) == datetime(2026, 11, 12, 0, 45, tzinfo=timezone.utc))
check("sin salida o con basura: None, nunca inventada", salida_del_plan({}) is None and salida_del_plan({"dof": "2026-11-11", "eobt": "25"}) is None and salida_del_plan({"dof": "2026-13-45", "eobt": "9999"}) is None)
check("la duración es la casilla 16", duracion_del_plan(plan) == 90 and duracion_del_plan({"formulario": {"eet": "0035"}}) == 35)
check("sin duración válida: la de por defecto", duracion_del_plan({"formulario": {"eet": ""}}) == DURACION_POR_DEFECTO_MIN and duracion_del_plan({"formulario": {"eet": "0090"}}) == DURACION_POR_DEFECTO_MIN and duracion_del_plan({}) == DURACION_POR_DEFECTO_MIN)
sal = datetime(2026, 11, 11, 15, 30, tzinfo=timezone.utc)
check("vence a la salida + duración + el margen", vencimiento_desde_plan(sal, 90, T0) == sal + timedelta(minutes=90) + MARGEN_DE_VENCIMIENTO == datetime(2026, 11, 11, 19, 0, tzinfo=timezone.utc))
check("no es 12 horas desde que se creó", vencimiento_desde_plan(sal, 90, T0) - T0 != timedelta(hours=12))
check("un vuelo que ya salió vence al menos en una hora", vencimiento_desde_plan(sal, 30, sal + timedelta(hours=5)) == sal + timedelta(hours=6))
check("se puede compartir uno que sale en 23 h", salida_aceptable(T0 + timedelta(hours=23), T0) is None)
check("no uno que sale en 25 h", salida_aceptable(T0 + timedelta(hours=25), T0) is not None)
check("ni uno que salió hace 13 h", salida_aceptable(T0 - timedelta(hours=13), T0) is not None and salida_aceptable(T0 - timedelta(hours=11), T0) is None)
check("el pedido desde un plan limpia la ruta y exige un id de plan", SeguimientoDesdePlan(plan_id="11111111-1111-1111-1111-111111111111", ruta=" SADF  SADM ").ruta == "SADF SADM" and falla(lambda: SeguimientoDesdePlan(plan_id="no-es-un-uuid")))
check("y no trae matrícula, salida ni duración: salen del plan", not ({"matricula", "salida", "salida_prevista", "duracion"} & set(SeguimientoDesdePlan.model_fields)))

# --- las muestras ---
base = {"id": "i", "nombre": "Lucía", "ruta": "SADF SADM", "puntos": [[-34.45, -58.59, "SADF", "San Fernando"], [-34.56, -58.96, "SADM", "Morón"]],
        "created_at": (T0 - timedelta(hours=3)).isoformat(), "terminado_at": None, "recorrido": [], "ultima_lat": None, "ultima_lon": None,
        "avion_tipo": "Cessna 152", "avion_icao": "C152", "avion_matricula": None, "mostrar_matricula": False,
        "matricula_adsb": "LVABC", "plan_id": "p", "salida_prevista": (T0 + timedelta(minutes=30)).isoformat(), "aterrizo_at": None,
        "vence_at": (T0 + timedelta(hours=6)).isoformat()}
m_adsb = muestras_de_adsb([adsb(31, -34.45, -58.59, None, 0, True), adsb(32, -34.46, -58.6, 900, 85)])
check("ADS-B: la hora, la velocidad y el estado; la altura de tierra no existe", m_adsb[0]["gs"] == 0 and m_adsb[0]["tierra"] is True and m_adsb[0]["alt"] is None and m_adsb[1]["alt"] == 900 and m_adsb[1]["fuente"] == "adsb")
check("ADS-B con basura se descarta", muestras_de_adsb([{"visto_at": "x", "lat": 1, "lon": 2}, {"visto_at": T0.isoformat(), "lat": "a", "lon": 2}, None]) == [] and muestras_de_adsb(None) == [])
tt = muestras_del_telefono({"recorrido": [tel(0, -34.45, -58.59), tel(1, -34.46, -58.59)], "ultima_lat": -34.47, "ultima_lon": -58.59, "ultima_alt_ft": 1600, "ultima_gs_kt": 90.0, "ultima_track": 180.0, "ultima_at": (T0 + timedelta(minutes=2)).isoformat()})
check("teléfono: el recorrido más la última, en orden, y la velocidad entre puntos", len(tt) == 3 and [m["t"] for m in tt] == sorted(m["t"] for m in tt) and 30 < tt[1]["gs"] < 40 and tt[2]["gs"] == 90.0 and tt[2]["track"] == 180.0)
check("la última no se repite si el recorrido ya la trae", len(muestras_del_telefono({"recorrido": [tel(2, -34.47, -58.59)], "ultima_lat": -34.47, "ultima_lon": -58.59, "ultima_at": (T0 + timedelta(minutes=2)).isoformat(), "ultima_gs_kt": 90.0})) == 1)
rr = ralear_adsb(muestras_de_adsb([adsb(0, -34.0, -58.0, 100, 90, seg=s) for s in range(0, 600, 10)]))
check("ADS-B se ralea a una cada 20 s sin perder la primera ni la última", len(rr) <= 32 and rr[0]["t"] == (T0).timestamp() and rr[-1]["t"] == (T0 + timedelta(seconds=590)).timestamp())
mixto = muestras_de_adsb([adsb(0, 1, 1, None, 0, True, seg=0), adsb(0, 1, 1, None, 0, True, seg=5), adsb(0, 1, 1, 200, 70, False, seg=10), adsb(0, 1, 1, 300, 70, False, seg=12)])
check("el raleo conserva el cambio de tierra a aire", any(m["t"] == (T0 + timedelta(seconds=10)).timestamp() for m in ralear_adsb(mixto)))

# --- la fusión por hora ---
g = muestras_del_telefono({"recorrido": [tel(10, -34.5, -58.7), tel(10, -34.51, -58.7, seg=15), tel(10, -34.52, -58.7, seg=30)]})
a = muestras_de_adsb([adsb(10, -34.5, -58.7, 1400, 95, seg=5), adsb(10, -34.52, -58.7, 1400, 95, seg=40), adsb(11, -34.55, -58.7, 1400, 95, seg=30), adsb(12, -34.6, -58.7, 1400, 95)])
f = fusionar(g, a)
check("fusión: ordenado por hora", [m["t"] for m in f] == sorted(m["t"] for m in f))
check("fusión: donde el teléfono mandó (a menos de 45 s) manda el teléfono", [m["fuente"] for m in f].count("gps") == 3 and not any(m["fuente"] == "adsb" and abs(m["t"] - x["t"]) <= GPS_VIGENTE_S for m in f for x in g) and GPS_VIGENTE_S == 45)
check("fusión: donde calló, llena ADS-B (y se pierde sólo lo duplicado)", [m["fuente"] for m in f] == ["gps", "gps", "gps", "adsb", "adsb"])
check("fusión sin teléfono: es ADS-B", all(m["fuente"] == "adsb" for m in fusionar([], a)) and len(fusionar([], a)) == 4)
check("fusión sin ADS-B: es el teléfono", fusionar(g, []) == g)

# --- fase y estado de un plan ---
AHORA = T0 + timedelta(minutes=5)
fila_plan = {**base}
v0 = vista_publica(fila_plan, AHORA, [])
check("antes de salir, sin ver al avión: 'antes_de_salir', con la salida prevista", v0["fase"] == "antes_de_salir" and v0["salida_prevista"] == (T0 + timedelta(minutes=30)).isoformat() and v0["ultima"] is None and v0["recorrido"] == [])
check("un seguimiento desde un plan dice que tiene respaldo ADS-B, sin la matrícula", v0["con_adsb"] is True and "LVABC" not in repr(v0) and "matricula_adsb" not in v0)
check("las claves públicas no cambian por venir de un plan", set(v0) == CLAVES_PUBLICAS)
suelo = [adsb(m, -34.45, -58.59, None, 0, True) for m in (20, 22, 24)]
v1 = vista_publica(fila_plan, T0 + timedelta(minutes=25), suelo)
check("en tierra antes de la salida: sigue 'antes_de_salir', con su posición y su fuente", v1["fase"] == "antes_de_salir" and v1["ultima"]["fuente"] == "adsb" and v1["recorrido"][0][4] == "adsb")
despegue = suelo + [adsb(31, -34.45, -58.6, 300, 60), adsb(32, -34.46, -58.62, 900, 85), adsb(33, -34.47, -58.65, 1500, 95), adsb(34, -34.48, -58.7, 1500, 95)]
v2 = vista_publica(fila_plan, T0 + timedelta(minutes=34, seconds=20), despegue)
check("ADS-B lo ve en el aire: 'volando', con velocidad y rumbo de ADS-B", v2["fase"] == "volando" and v2["ultima"]["gs_kt"] == 95 and v2["ultima"]["fuente"] == "adsb" and v2["ultima"]["track"] is not None and 180 < v2["ultima"]["track"] < 270)
check("y el estado sigue en vuelo", v2["estado"] == "en_vuelo")
check("el recorrido lleva la fuente de cada punto", all(len(p) == 5 and p[4] == "adsb" for p in v2["recorrido"]) and len(v2["recorrido"]) == len(despegue))
mient = despegue + [adsb(35, -34.5, -58.75, 1500, 95)]
check("dos minutos sin ver nada nuevo en el aire: 'sin_datos'", vista_publica(fila_plan, T0 + timedelta(minutes=38), mient)["fase"] == "sin_datos")
check("y con datos de hace menos de 2 minutos sigue 'volando'", vista_publica(fila_plan, T0 + timedelta(minutes=36), mient)["fase"] == "volando")
rodaje = mient + [adsb(50, -34.7, -58.9, 80, 45), adsb(51, -34.7, -58.9, None, 20, True), adsb(52, -34.7, -58.9, None, 8, True)]
rod = muestras_de_adsb(ralear_adsb(muestras_de_adsb(rodaje)) and rodaje)
check("hubo un vuelo en el aire", hubo_vuelo(rod))
check("recién tocó tierra: todavía 'volando' (esperan 3 minutos)", vista_publica(fila_plan, T0 + timedelta(minutes=52), rodaje)["fase"] == "volando")
toque_t = datetime.fromtimestamp(muestras_de_adsb([adsb(51, 0, 0, None, 20, True)])[0]["t"], tz=timezone.utc)
check("el aterrizaje es el primer toque, y recién cuenta a los 3 minutos", aterrizaje(rod, T0 + timedelta(minutes=51, seconds=SEGUNDOS_PARA_ATERRIZAR - 1)) is None and aterrizaje(rod, T0 + timedelta(minutes=51, seconds=SEGUNDOS_PARA_ATERRIZAR)) == toque_t and SEGUNDOS_PARA_ATERRIZAR == 180)
ev = evaluar_vuelo(fila_plan, rodaje, T0 + timedelta(minutes=56))
check("3 minutos en tierra: 'aterrizo', y se devuelve cuándo", ev["fase"] == "aterrizo" and ev["aterrizo_at"] == toque_t)
terminada_aterrizando = {**fila_plan, "terminado_at": toque_t.isoformat(), "aterrizo_at": toque_t.isoformat()}
vt = vista_publica(terminada_aterrizando, T0 + timedelta(minutes=57), rodaje)
check("ya terminado por aterrizaje: estado terminado, fase 'aterrizo'", vt["estado"] == "terminado" and vt["fase"] == "aterrizo" and evaluar_vuelo(terminada_aterrizando, rodaje, T0 + timedelta(minutes=57))["aterrizo_at"] is None)
check("y no se muestra lo que el avión haga después del rodaje", ventana_adsb(terminada_aterrizando, T0 + timedelta(hours=2))[1] == toque_t + COLA_TRAS_ATERRIZAR and COLA_TRAS_ATERRIZAR == timedelta(minutes=10))
despues = rodaje + [adsb(80, -34.7, -58.9, 500, 80), adsb(81, -34.71, -58.9, 900, 85), adsb(82, -34.72, -58.9, 1500, 95)]
check("lo que pasó 10 minutos después del toque no entra", all(p[3] <= int((toque_t + COLA_TRAS_ATERRIZAR).timestamp()) for p in vista_publica(terminada_aterrizando, T0 + timedelta(minutes=90), despues)["recorrido"]))
check("un toque y despegue no es aterrizar", evaluar_vuelo(fila_plan, mient + [adsb(36, -34.6, -58.8, None, 35, True), adsb(36, -34.6, -58.8, 400, 60, seg=20), adsb(37, -34.6, -58.9, 900, 85)], T0 + timedelta(minutes=45))["aterrizo_at"] is None)
check("un avión que desaparece en el aire no 'aterrizó': sin datos", evaluar_vuelo(fila_plan, mient, T0 + timedelta(hours=1))["fase"] == "sin_datos" and evaluar_vuelo(fila_plan, mient, T0 + timedelta(hours=1))["aterrizo_at"] is None)
check("un salto suelto de velocidad no es un vuelo", not hubo_vuelo(muestras_de_adsb([adsb(20, 1, 1, None, 0, True), adsb(21, 1, 1, 100, 60), adsb(22, 1, 1, None, 0, True)])) and evaluar_vuelo(fila_plan, [adsb(20, 1, 1, None, 0, True), adsb(21, 1, 1, 100, 60), adsb(22, 1, 1, None, 0, True)], T0 + timedelta(minutes=40))["aterrizo_at"] is None)
check("30 a 40 kt no afirma ni aire ni tierra", not hubo_vuelo(muestras_de_adsb([adsb(m, 1, 1, 200, 35) for m in range(30, 40)])))
# El vuelo de otro piloto con el mismo avión, antes del tuyo.
anterior = [adsb(15, -34.7, -58.9, 1200, 90), adsb(16, -34.7, -58.9, 700, 80), adsb(17, -34.7, -58.9, 50, 55), adsb(18, -34.7, -58.9, None, 15, True), adsb(19, -34.7, -58.9, None, 0, True)]
check("un vuelo anterior de otro piloto (ya en el aire al empezar la ventana) no cuenta", sin_el_vuelo_anterior(muestras_de_adsb(anterior))[0]["tierra"] is True and len(sin_el_vuelo_anterior(muestras_de_adsb(anterior))) == 2)
vista_ant = vista_publica(fila_plan, T0 + timedelta(minutes=25), anterior)
check("...ni lo termina antes de que salgas, ni dice 'volando'", vista_ant["fase"] == "antes_de_salir" and vista_ant["estado"] == "en_vuelo" and evaluar_vuelo(fila_plan, anterior, T0 + timedelta(minutes=25))["aterrizo_at"] is None)
check("siempre en el aire desde el principio de la ventana: no se sabe de quién es, no se muestra", sin_el_vuelo_anterior(muestras_de_adsb(anterior[:3])) == [] and vista_publica(fila_plan, T0 + timedelta(minutes=18), anterior[:3])["ultima"] is None)
check("la ventana de ADS-B de un plan arranca un rato antes de la salida, no cuando se creó", ventana_adsb(fila_plan, AHORA)[0] == T0 + timedelta(minutes=30) - ADELANTO_ADSB == T0 and ventana_adsb(fila_plan, AHORA)[1] == AHORA and ADELANTO_ADSB == timedelta(minutes=30))
check("la del Mapa, desde que se creó", ventana_adsb({**base, "salida_prevista": None}, AHORA)[0] == T0 - timedelta(hours=3))
check("sin matrícula para ADS-B no hay ventana", ventana_adsb({**base, "matricula_adsb": None}, AHORA) is None and vista_publica({**base, "matricula_adsb": None}, AHORA, anterior)["recorrido"] == [] and vista_publica({**base, "matricula_adsb": None}, AHORA, [])["con_adsb"] is False)
check("lo anterior a la ventana no entra", vista_publica(fila_plan, T0 + timedelta(minutes=40), [adsb(-60, 1, 1, None, 0, True)] + despegue)["recorrido"][0][3] >= int(T0.timestamp()))
# Sin ver al avión.
check("sin muestras 20 minutos después de la salida: sigue 'antes de salir'", vista_publica(fila_plan, T0 + timedelta(minutes=50), [])["fase"] == "antes_de_salir")
check("media hora después de la salida sin ver nada: 'sin_datos', nunca un vuelo inventado", (lambda w: w["fase"] == "sin_datos" and w["ultima"] is None and w["recorrido"] == [])(vista_publica(fila_plan, T0 + timedelta(minutes=61), [])))
check("en tierra y callado por mucho tiempo, pasada la salida: sin datos", vista_publica(fila_plan, T0 + timedelta(minutes=80), suelo)["fase"] == "sin_datos")
check("vencido: 'terminado'", vista_publica({**fila_plan, "vence_at": (T0 + timedelta(minutes=1)).isoformat()}, T0 + timedelta(hours=1), suelo)["fase"] == "terminado")
check("terminado a mano (Dejar de compartir): 'terminado'", vista_publica({**fila_plan, "terminado_at": T0.isoformat()}, AHORA, [])["fase"] == "terminado")

# --- el teléfono y ADS-B juntos ---
fila_mapa = {**base, "plan_id": None, "salida_prevista": None, "created_at": T0.isoformat(), "vence_at": (T0 + timedelta(hours=12)).isoformat(),
             "recorrido": [tel(1, -34.45, -58.6), tel(1, -34.46, -58.62, seg=15), tel(1, -34.47, -58.64, seg=30)],
             "ultima_lat": -34.47, "ultima_lon": -58.64, "ultima_alt_ft": 1500, "ultima_gs_kt": 92.0, "ultima_track": 250.0, "ultima_at": (T0 + timedelta(minutes=1, seconds=30)).isoformat()}
solo_tel = vista_publica(fila_mapa, T0 + timedelta(minutes=1, seconds=45), [])
check("Mapa: sólo teléfono, como siempre ('volando'; el detalle lo calcula la web)", solo_tel["fase"] == "volando" and solo_tel["ultima"]["fuente"] == "gps" and solo_tel["ultima"]["gs_kt"] == 92.0 and solo_tel["ultima"]["track"] == 250.0 and solo_tel["salida_prevista"] is None)
respaldo = [adsb(4, -34.5, -58.7, 1500, 95), adsb(4, -34.51, -58.71, 1500, 95, seg=10), adsb(5, -34.53, -58.74, 1500, 95)]
v3 = vista_publica(fila_mapa, T0 + timedelta(minutes=5, seconds=5), respaldo)
check("el teléfono calló: ADS-B sigue mostrando el avión, y la última es la más nueva", v3["ultima"]["fuente"] == "adsb" and v3["ultima"]["lat"] == -34.53 and v3["fase"] == "volando")
check("el recorrido junta las dos fuentes por hora", [p[4] for p in v3["recorrido"]] == ["gps", "gps", "gps", "adsb", "adsb"] and [p[3] for p in v3["recorrido"]] == sorted(p[3] for p in v3["recorrido"]))
vuelve = {**fila_mapa, "recorrido": fila_mapa["recorrido"] + [tel(6, -34.56, -58.78), tel(6, -34.57, -58.8, seg=15)], "ultima_lat": -34.57, "ultima_lon": -58.8, "ultima_at": (T0 + timedelta(minutes=6, seconds=15)).isoformat()}
v4 = vista_publica(vuelve, T0 + timedelta(minutes=6, seconds=20), respaldo)
check("el teléfono vuelve: la última es la suya otra vez", v4["ultima"]["fuente"] == "gps" and v4["ultima"]["lat"] == -34.57)
check("...y el recorrido pasa de ADS-B a GPS", [p[4] for p in v4["recorrido"]] == ["gps", "gps", "gps", "adsb", "adsb", "gps", "gps"])
check("en la misma hora no hay dos fuentes (sin zigzag)", all(not (a1[4] != b1[4] and abs(a1[3] - b1[3]) <= GPS_VIGENTE_S) for a1 in v4["recorrido"] for b1 in v4["recorrido"]))
check("el teléfono calló y ADS-B tampoco: sin datos, con la última que llegó", vista_publica(fila_mapa, T0 + timedelta(minutes=10), [])["fase"] == "sin_datos")
many = [adsb(0, -34.0 - i * 0.0005, -58.0, 1500, 95, seg=i * 12) for i in range(900)]
vm = vista_publica({**fila_mapa, "recorrido": [], "ultima_lat": None, "ultima_lon": None, "ultima_at": None, "created_at": (T0 - timedelta(minutes=1)).isoformat(), "vence_at": (T0 + timedelta(hours=12)).isoformat()}, T0 + timedelta(hours=4), many)
check(f"el recorrido público nunca pasa de {TOPE_RECORRIDO_PUBLICO} puntos y conserva el principio y el final", len(vm["recorrido"]) <= TOPE_RECORRIDO_PUBLICO and vm["recorrido"][0][0] == -34.0 and vm["recorrido"][-1][0] == vm["ultima"]["lat"])
unidas = unir_filas_adsb([adsb(0, 1, 1), adsb(1, 1, 1)], [adsb(1, 1, 1), adsb(2, 1, 1)], None)
check("las primeras y las últimas filas de ADS-B se unen sin repetir, por hora", len(unidas) == 3 and [u["visto_at"] for u in unidas] == sorted(u["visto_at"] for u in unidas))
# La matrícula para ADS-B es interna, siempre.
for etiqueta, vv in (("plan", v2), ("mapa", v3)):
    check(f"({etiqueta}) la matrícula de ADS-B no sale en ningún campo", "LVABC" not in repr(vv) and "LV-ABC" not in repr(vv))
con_matricula = vista_publica({**fila_plan, "avion_matricula": "LV-ABC", "mostrar_matricula": True}, AHORA, [])
check("la visible sigue siendo sólo con el interruptor", con_matricula["avion"]["matricula"] == "LV-ABC" and "matricula" not in v0["avion"])

# --- el borrado ---
check("se borra a los 30 días", limite_de_retencion(T0).startswith("2026-10-12T12:00:00") and DIAS_DE_RETENCION == 30)

fallas = resultados.count(False)
print(f"\n{len(resultados) - fallas}/{len(resultados)} bien")
sys.exit(1 if fallas else 0)
