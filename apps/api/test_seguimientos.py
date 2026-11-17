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
    SeguimientoSinPlan,
    PuntoRuta,
    TOPE_ACTIVOS,
    mensaje_del_tope,
    puntos_sin_plan,
    resumen_de_activo,
    ruta_sin_plan,
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
    SILENCIO_ATERRIZAJE_S,
    HUECO_ENTRE_VUELOS_S,
    EN_CURSO_AL_ABRIR_S,
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
    ADELANTO_ENCADENADO,
    DestinoNuevo,
    CORTE_REAPARECE_S,
    candidatos_a_tramo_anterior,
    cierre_del_vuelo,
    con_destino_nuevo,
    detectar_aterrizaje,
    indice_de_reaparicion,
    _destino,
    fin_del_tramo,
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
CLAVES_PUBLICAS = {"nombre", "ruta", "puntos", "avion", "inicio", "estado", "fase", "salida_prevista", "con_adsb", "ultima", "recorrido", "ahora", "ruta_orientativa", "aterrizo_at", "aterrizo_en", "aterrizo_sin_ver"}
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
# (Arranca justo al abrirse la ventana, en T0: así es "ya estaba volando".)
anterior = [adsb(0, -34.7, -58.9, 1200, 90), adsb(1, -34.7, -58.9, 700, 80), adsb(2, -34.7, -58.9, 50, 55), adsb(3, -34.7, -58.9, None, 15, True), adsb(4, -34.7, -58.9, None, 0, True)]
check("un vuelo anterior de otro piloto (ya en el aire al empezar la ventana) no cuenta", sin_el_vuelo_anterior(muestras_de_adsb(anterior), T0)[0]["tierra"] is True and len(sin_el_vuelo_anterior(muestras_de_adsb(anterior), T0)) == 2)
vista_ant = vista_publica(fila_plan, T0 + timedelta(minutes=25), anterior)
check("...ni lo termina antes de que salgas, ni dice 'volando'", vista_ant["fase"] == "antes_de_salir" and vista_ant["estado"] == "en_vuelo" and evaluar_vuelo(fila_plan, anterior, T0 + timedelta(minutes=25))["aterrizo_at"] is None)
check("siempre en el aire desde el principio de la ventana: no se sabe de quién es, no se muestra", sin_el_vuelo_anterior(muestras_de_adsb(anterior[:3]), T0) == [] and vista_publica(fila_plan, T0 + timedelta(minutes=18), anterior[:3])["ultima"] is None)
check("la ventana de ADS-B de un plan arranca un rato antes de la salida, no cuando se creó", ventana_adsb(fila_plan, AHORA)[0] == T0 + timedelta(minutes=30) - ADELANTO_ADSB == T0 and ventana_adsb(fila_plan, AHORA)[1] == AHORA and ADELANTO_ADSB == timedelta(minutes=30))
check("la del Mapa, desde que se creó", ventana_adsb({**base, "salida_prevista": None}, AHORA)[0] == T0 - timedelta(hours=3))
check("sin matrícula para ADS-B no hay ventana", ventana_adsb({**base, "matricula_adsb": None}, AHORA) is None and vista_publica({**base, "matricula_adsb": None}, AHORA, anterior)["recorrido"] == [] and vista_publica({**base, "matricula_adsb": None}, AHORA, [])["con_adsb"] is False)
check("lo anterior a la ventana no entra", vista_publica(fila_plan, T0 + timedelta(minutes=40), [adsb(-60, 1, 1, None, 0, True)] + despegue)["recorrido"][0][3] >= int(T0.timestamp()))
# --- ADS-B real: casi nunca se ve al avión en tierra ---
# Despegue que arranca en el aire (150 ft, 60 kt) y final que se corta bajo y lento. Altitudes None y negativas.
LAT0, LON0 = -34.45, -58.59
DEST = (-34.56, -58.96)  # SADM, el último punto de `base`


def tramo(m0, n, lat, lon, alt, gs, paso_s=10):
    """`n` muestras cada `paso_s` desde el minuto `m0`, siempre en el aire (tierra=False)."""
    return [adsb(m0, lat + i * 0.0002, lon, alt, gs, seg=i * paso_s) for i in range(n)]


def a_t(filas, desde=T0):
    return sin_el_vuelo_anterior(muestras_de_adsb(filas), desde)


# 1. El anterior está en el aire al abrir, aterriza (se corta a 100 ft y 65 kt), 25 minutos sin nada, despega el piloto.
ant1 = tramo(0, 12, -34.7, -58.9, 1200, 95, 10) + [adsb(2, -34.7, -58.9, 300, 75), adsb(2, -34.7, -58.9, 100, 65, seg=10)]
ant1.sort(key=lambda f: f["visto_at"])
mio1 = [adsb(30, LAT0, LON0, 150, 60), adsb(30, LAT0, LON0, 400, 70, seg=10), adsb(30, LAT0, LON0, 700, 85, seg=20)] + tramo(31, 6, -34.46, -58.6, 1500, 95)
filas1 = ant1 + mio1
r1 = a_t(filas1)
check("el anterior aterrizó sin que lo vean en tierra y hay 25 min de silencio: queda sólo el vuelo del piloto", len(r1) == len(mio1) and r1[0]["alt"] == 150 and all(m["t"] >= (T0 + timedelta(minutes=30)).timestamp() for m in r1))
check("...y la vista pública lo muestra desde el despegue del piloto", vista_publica(base, T0 + timedelta(minutes=33), filas1)["recorrido"][0][3] == int((T0 + timedelta(minutes=30)).timestamp()))

# 2. Hueco de 12 minutos en crucero (1400 ft, 98 kt): no es fin de vuelo.
cr = tramo(0, 6, -34.7, -58.9, 1400, 98) + tramo(13, 4, -34.8, -58.9, 1400, 98)
check("un hueco de 12 minutos en crucero no es fin de vuelo: no se sabe de quién es, no se muestra", a_t(cr) == [] and HUECO_ENTRE_VUELOS_S == 600)
cr2 = tramo(0, 6, -34.7, -58.9, 625, 94) + tramo(13, 4, -34.8, -58.9, 625, 94)
check("ni a 625 ft y 94 kt (lento para un Cessna, pero más que 85 kt)", a_t(cr2) == [])
check("un hueco de menos de 10 minutos tras una aproximación tampoco", a_t(tramo(0, 4, -34.7, -58.9, 100, 65) + tramo(8, 4, -34.7, -58.9, 150, 60)) == [])
check("sin altitud y lento sí es aproximación; con la GS de la anterior si falta", len(a_t([adsb(0, 1, 1, None, 70), adsb(0, 1, 1, None, None, seg=10), adsb(15, 1, 1, 100, 60)])) == 1)
check("una altitud negativa también es baja", len(a_t([adsb(0, 1, 1, -100, 70), adsb(0, 1, 1, -80, 65, seg=10), adsb(15, 1, 1, 100, 60)])) == 1)

# 3. El anterior aterrizó antes de la ventana: la primera muestra es el despegue del propio piloto, 8 minutos después.
mio3 = [adsb(8, LAT0, LON0, 150, 60), adsb(8, LAT0, LON0, 500, 75, seg=10)] + tramo(9, 5, -34.46, -58.6, 1500, 95)
check("el primer dato es el despegue del piloto a 8 min del inicio de la ventana: no se descarta nada", a_t(mio3) == muestras_de_adsb(mio3) and EN_CURSO_AL_ABRIR_S == 180)
check("a menos de 3 minutos del inicio sí es un vuelo en curso", a_t(tramo(0, 3, 1, 1, 150, 60)) == [])
check("sin la ventana (epoch) también anda", len(sin_el_vuelo_anterior(muestras_de_adsb(mio3), T0.timestamp())) == len(mio3))

# 4. La señal se corta en la final a 1,5 NM del destino, 120 ft, 65 kt.
lat_f = DEST[0] + 1.5 / 60  # 1,5 NM al norte
crucero = tramo(30, 6, -34.46, -58.6, 1500, 95)
final = [adsb(36, lat_f + 0.01, DEST[1], 400, 70), adsb(36, lat_f, DEST[1], 120, 65, seg=10)]
ult_t = datetime.fromtimestamp(muestras_de_adsb(final)[-1]["t"], tz=timezone.utc)
ev2 = evaluar_vuelo(base, crucero + final, ult_t + timedelta(minutes=2))
check("cortada en la final a 1,5 NM: a los 2 minutos todavía 'volando'", ev2["fase"] == "volando" and ev2["aterrizo_at"] is None)
ev6 = evaluar_vuelo(base, crucero + final, ult_t + timedelta(minutes=6))
check("a los 6 minutos 'aterrizo', a la hora de la última muestra", ev6["fase"] == "aterrizo" and ev6["aterrizo_at"] == ult_t and SILENCIO_ATERRIZAJE_S == 300)
check("justo antes de los 300 s no", evaluar_vuelo(base, crucero + final, ult_t + timedelta(seconds=SILENCIO_ATERRIZAJE_S - 1))["aterrizo_at"] is None and evaluar_vuelo(base, crucero + final, ult_t + timedelta(seconds=SILENCIO_ATERRIZAJE_S))["aterrizo_at"] == ult_t)
check("la vista pública dice 'aterrizo' (y 'volando' a los 2 minutos)", vista_publica(base, ult_t + timedelta(minutes=2), crucero + final)["fase"] == "volando")

# 5. Se corta bajo y lento pero lejos del destino: nunca 'aterrizó'.
lejos = [adsb(36, DEST[0] + 15 / 60, DEST[1], 400, 70), adsb(36, DEST[0] + 15 / 60, DEST[1], 120, 65, seg=10)]
ev_l = evaluar_vuelo(base, crucero + lejos, ult_t + timedelta(minutes=6))
check("bajo y lento a 15 NM del destino: 'sin_datos', nunca 'aterrizo'", ev_l["fase"] == "sin_datos" and ev_l["aterrizo_at"] is None)
check("y a las 2 horas, igual", evaluar_vuelo(base, crucero + lejos, ult_t + timedelta(hours=2))["fase"] == "sin_datos")
# 6. Cerca pero alto.
alto = [adsb(36, lat_f + 0.01, DEST[1], 2800, 90), adsb(36, lat_f, DEST[1], 2500, 85, seg=10)]
ev_a = evaluar_vuelo(base, crucero + alto, ult_t + timedelta(minutes=6))
check("cerca del destino pero a 2500 ft: no aterrizó", ev_a["aterrizo_at"] is None and ev_a["fase"] == "sin_datos")
# 7. Altitud None en la última.
sin_alt = [adsb(36, lat_f + 0.01, DEST[1], 400, 70), adsb(36, lat_f, DEST[1], None, 65, seg=10)]
ev_n = evaluar_vuelo(base, crucero + sin_alt, ult_t + timedelta(minutes=6))
check("altitud desconocida en la última: no se afirma el aterrizaje", ev_n["aterrizo_at"] is None and ev_n["fase"] == "sin_datos")
sin_gs = [adsb(36, lat_f + 0.01, DEST[1], 400, 70), adsb(36, lat_f, DEST[1], 120, None, seg=10)]
check("velocidad desconocida en la última: tampoco", evaluar_vuelo(base, crucero + sin_gs, ult_t + timedelta(minutes=6))["aterrizo_at"] is None)
check("sin destino en la ruta: tampoco", evaluar_vuelo({**base, "puntos": []}, crucero + final, ult_t + timedelta(minutes=6))["aterrizo_at"] is None)
check("sin un vuelo de por medio: tampoco", aterrizaje(muestras_de_adsb(final), ult_t + timedelta(minutes=6), {"lat": DEST[0], "lon": DEST[1]}) is None)
# 8. La regla vieja sigue andando (muestras en tierra), incluso con destino.
check("la regla vieja (muestras en tierra) sigue: aterrizo en el primer toque", aterrizaje(rod, T0 + timedelta(minutes=56), {"lat": 0.0, "lon": 0.0}) == toque_t and aterrizaje(rod, T0 + timedelta(minutes=56)) == toque_t)
check("la fase y las claves públicas no cambian", set(vista_publica(base, ult_t + timedelta(minutes=6), crucero + final)) == CLAVES_PUBLICAS)
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

# --- varios a la vez y compartir sin plan (migración 055) ---
check("el tope de activos es 5", TOPE_ACTIVOS == 5)
check("con 4 activos cabe uno más", mensaje_del_tope(4) is None)
check("con 5 no cabe y el mensaje es claro", "máximo" in (mensaje_del_tope(5) or "") and mensaje_del_tope(9) is not None)
_o = PuntoRuta(lat=-34.56, lon=-58.96, codigo="SADM", nombre="Morón")
_d = PuntoRuta(lat=-34.8, lon=-58.5, codigo="SAEZ", nombre="Ezeiza")
check("la ruta sin plan son los dos códigos", ruta_sin_plan(_o, _d) == "SADM SAEZ")
check("sin código, el nombre", ruta_sin_plan(PuntoRuta(lat=0, lon=0, nombre="Campo"), _d) == "Campo SAEZ")
check("los puntos sin plan son origen y destino, con nombre", puntos_sin_plan(_o, _d) == [[-34.56, -58.96, "SADM", "Morón"], [-34.8, -58.5, "SAEZ", "Ezeiza"]])
_base = {"aircraft_id": "11111111-1111-1111-1111-111111111111", "origen": _o.model_dump(), "destino": _d.model_dump(), "salida": "2026-11-15T15:30:00Z", "duracion_min": 90}
sp = SeguimientoSinPlan(**_base)
check("sin plan: la salida queda en UTC y la matrícula apagada por defecto", sp.salida.utcoffset() == timedelta(0) and sp.mostrar_matricula is False and sp.seguimiento_id is None)
check("sin plan: una hora con otra zona se pasa a UTC", SeguimientoSinPlan(**{**_base, "salida": "2026-11-15T12:30:00-03:00"}).salida == sp.salida)
check("sin plan: una hora sin zona se rechaza", falla(lambda: SeguimientoSinPlan(**{**_base, "salida": "2026-11-15T12:30:00"})))
check("sin plan: menos de 10 minutos se rechaza", falla(lambda: SeguimientoSinPlan(**{**_base, "duracion_min": 9})))
check("sin plan: más de 12 horas se rechaza", falla(lambda: SeguimientoSinPlan(**{**_base, "duracion_min": 721})))
check("sin plan: sin avión se rechaza", falla(lambda: SeguimientoSinPlan(**{k: x for k, x in _base.items() if k != "aircraft_id"})))
check("sin plan: vence a la salida más la duración más el margen", vencimiento_desde_plan(sp.salida, 90, sp.salida - timedelta(hours=1)) == sp.salida + timedelta(minutes=90) + MARGEN_DE_VENCIMIENTO)
check("sin plan: vale la misma regla de salida que un plan", salida_aceptable(sp.salida + timedelta(hours=30), sp.salida) is not None and salida_aceptable(sp.salida, sp.salida) is None)
_fila_sp = {"nombre": "Lucía", "ruta": "SADM SAEZ", "puntos": puntos_sin_plan(_o, _d), "ruta_orientativa": True, "salida_prevista": sp.salida.isoformat(), "matricula_adsb": "LVABC", "avion_matricula": None, "mostrar_matricula": False,
            "vence_at": (sp.salida + timedelta(hours=4)).isoformat(), "terminado_at": None, "created_at": T0.isoformat(), "plan_id": None, "user_id": "u-secreto"}
_vsp = vista_publica(_fila_sp, sp.salida - timedelta(minutes=20))
check("público: marca la ruta como orientativa", _vsp["ruta_orientativa"] is True and vista_publica({**_fila_sp, "ruta_orientativa": False}, T0)["ruta_orientativa"] is False)
check("público: un vuelo sin plan sale 'antes de salir' y sin nada de más", _vsp["fase"] == "antes_de_salir" and set(_vsp) == CLAVES_PUBLICAS and "u-secreto" not in repr(_vsp) and "LVABC" not in repr(_vsp))
check("público: sin ruta_orientativa en la fila (viejos) es falso", vista_publica({k: x for k, x in _fila_sp.items() if k != "ruta_orientativa"}, T0)["ruta_orientativa"] is False)
_act = resumen_de_activo({**_fila_sp, "id": "i1", "token": "t1", "vistas": {"abcdefghijklmnop": int(T0.timestamp())}, "vistos_total": 2, "duracion_prevista_min": 90, "avion_tipo": "Tecnam P2008"}, T0 + timedelta(seconds=10))
check("activo: trae lo que necesita la pantalla del piloto", _act["id"] == "i1" and _act["token"] == "t1" and _act["ruta_orientativa"] is True and _act["plan_id"] is None and _act["duracion_prevista_min"] == 90 and _act["mirando_ahora"] == 1 and _act["vistos_total"] == 2)
check("activo: no filtra la matrícula de ADS-B ni el user_id", "LVABC" not in repr(_act) and "u-secreto" not in repr(_act))


# =====================================================================================
# Aterrizar en cualquier aeródromo, el avión que reaparece y los tramos encadenados (migración 057)
# El caso real del 2026-11-16 (LV-S048), con posiciones sintéticas en esos puntos y horas.
# =====================================================================================
D0 = datetime(2026, 11, 16, 0, 0, 0, tzinfo=timezone.utc)
SADM = (-34.6792, -58.6436)
SAZM = (-37.9342, -57.5733)
SAZT = (-37.2344, -59.2286)


def ar(h, m, lat, lon, alt=None, gs=None, tierra=False, seg=0):
    """Una fila de `adsb_posiciones` del 2026-11-16 a las `h:m` UTC."""
    return {"visto_at": (D0 + timedelta(hours=h, minutes=m, seconds=seg)).isoformat(), "lat": lat, "lon": lon, "altitud": alt, "velocidad": gs, "en_tierra": tierra}


def recta(h0, m0, n, a, b, alt0, alt1, gs0, gs1, paso_s=60):
    """`n` muestras en el aire cada `paso_s` de `a` a `b`, subiendo o bajando de `alt0` a `alt1`."""
    filas = []
    for i in range(n):
        f = i / max(1, n - 1)
        filas.append(ar(h0, m0, a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, round(alt0 + (alt1 - alt0) * f), round(gs0 + (gs1 - gs0) * f), seg=i * paso_s))
    return filas


# La ida, sin plan, SADM -> SAZM: salida prevista 11:30Z. ADS-B ve el despegue de SADM a las 12:04Z y la señal se
# pierde a las 13:49Z a 7000 ft en -37,07 -58,92 (cambió de destino en vuelo y no lo actualizó en Vector).
IDA_ADSB = recta(12, 4, 106, SADM, (-37.07, -58.92), 150, 7000, 60, 100)
check("la ida: el último dato es de las 13:49 a 7000 ft", IDA_ADSB[-1]["visto_at"] == (D0 + timedelta(hours=13, minutes=49)).isoformat() and IDA_ADSB[-1]["altitud"] == 7000)
ida = {"id": "ida", "user_id": "u1", "nombre": "Federico", "ruta": "SADM SAZM", "puntos": [[SADM[0], SADM[1], "SADM", "Morón"], [SAZM[0], SAZM[1], "SAZM", "Mar del Plata"]],
       "ruta_orientativa": True, "created_at": (D0 + timedelta(hours=11)).isoformat(), "salida_prevista": (D0 + timedelta(hours=11, minutes=30)).isoformat(),
       "vence_at": (D0 + timedelta(hours=15, minutes=30)).isoformat(), "terminado_at": None, "aterrizo_at": None, "aterrizo_en": None, "aterrizo_sin_ver": False,
       "matricula_adsb": "LVS048", "avion_matricula": None, "mostrar_matricula": False, "avion_tipo": "Tecnam P2008", "avion_icao": "P2008", "recorrido": [],
       "ultima_lat": None, "ultima_lon": None, "ultima_at": None, "plan_id": None, "desde_tramo_at": None}
v_ida = vista_publica(ida, D0 + timedelta(hours=14, minutes=30), IDA_ADSB)
check("la ida: ve el vuelo pero lejos de todo aeródromo no aterrizó (sin datos, no 'aterrizó')", v_ida["fase"] == "sin_datos" and v_ida["aterrizo_at"] is None and v_ida["aterrizo_en"] is None and v_ida["aterrizo_sin_ver"] is False and v_ida["ultima"]["alt_ft"] == 7000)

# La vuelta, de plan, SAZM -> SADM: salida prevista 19:30Z. Salió mucho antes desde otro aeródromo: ADS-B lo vio en el aire desde
# 17:38Z y aterrizó en SADM a las 18:36Z (la señal se corta a 100 ft y 62 kt, a 1 NM de la pista).
CERCA_SADM = (-34.69, -58.66)
VUELTA_ADSB = recta(17, 38, 58, (-35.57, -58.02), CERCA_SADM, 150, 100, 62, 62) + [ar(18, 36, CERCA_SADM[0], CERCA_SADM[1], 100, 62)]
VUELTA_ADSB = [f for f in VUELTA_ADSB if f["visto_at"] <= (D0 + timedelta(hours=18, minutes=36)).isoformat()]
FIN_VUELTA = datetime.fromisoformat(VUELTA_ADSB[-1]["visto_at"])
vuelta = {**ida, "id": "vuelta", "ruta": "SAZM SADM", "puntos": [[SAZM[0], SAZM[1], "SAZM", "Mar del Plata"], [SADM[0], SADM[1], "SADM", "Morón"]], "ruta_orientativa": False,
          "plan_id": "p1", "created_at": (D0 + timedelta(hours=14)).isoformat(), "salida_prevista": (D0 + timedelta(hours=19, minutes=30)).isoformat(),
          "vence_at": (D0 + timedelta(hours=23, minutes=30)).isoformat()}
TODO = IDA_ADSB + VUELTA_ADSB
AHORA_V = FIN_VUELTA + timedelta(minutes=14)
v_hoy = vista_publica(vuelta, AHORA_V, TODO)
check("sin tramo anterior (la regla de siempre) la vuelta se descarta: la ventana arranca 30 min antes de la salida prevista", v_hoy["ultima"] is None and v_hoy["recorrido"] == [] and ventana_adsb(vuelta, AHORA_V)[0] == D0 + timedelta(hours=19))
# Sin encadenar, ni la ida ni la vuelta se ven; encadenada la vuelta arranca donde terminó la ida.
FIN_IDA = datetime.fromisoformat(IDA_ADSB[-1]["visto_at"])
check("el tramo anterior termina en la última posición que se le vio (13:49Z), no cuando alguien lo cerró", fin_del_tramo({**ida, "terminado_at": (D0 + timedelta(hours=18)).isoformat()}, IDA_ADSB + VUELTA_ADSB[:5], D0 + timedelta(hours=19)) == FIN_IDA)
check("...y si estaba aterrizado, el aterrizaje guardado", fin_del_tramo({**ida, "aterrizo_at": (D0 + timedelta(hours=13)).isoformat(), "terminado_at": (D0 + timedelta(hours=13)).isoformat()}, IDA_ADSB, D0 + timedelta(hours=19)) == D0 + timedelta(hours=13))
check("...y uno que sigue volando no terminó", fin_del_tramo({**ida, "vence_at": (D0 + timedelta(hours=23)).isoformat()}, IDA_ADSB, D0 + timedelta(hours=13, minutes=50)) is None)
check("un tramo anterior sin una sola posición termina en su fin", fin_del_tramo({**ida, "terminado_at": (D0 + timedelta(hours=12)).isoformat()}, [], D0 + timedelta(hours=19)) == D0 + timedelta(hours=12))
check("...o en su vencimiento si lo cerraron más tarde", fin_del_tramo({**ida, "terminado_at": (D0 + timedelta(hours=20)).isoformat()}, [], D0 + timedelta(hours=21)) == D0 + timedelta(hours=15, minutes=30))
enc = {**vuelta, "desde_tramo_at": FIN_IDA.isoformat()}
check(
    "encadenada, la ventana empieza 3 h antes de la salida (19:30Z → 16:30Z) y no 30 min antes: el anterior terminó antes (13:49Z)",
    ventana_adsb(enc, AHORA_V)[0] == max(FIN_IDA, datetime.fromisoformat(vuelta["salida_prevista"]) - ADELANTO_ENCADENADO) == datetime.fromisoformat(vuelta["salida_prevista"]) - ADELANTO_ENCADENADO,
)
_cerca = datetime.fromisoformat(vuelta["salida_prevista"]) - timedelta(hours=1)
check("...y si el anterior terminó después de eso, desde que terminó", ventana_adsb({**vuelta, "desde_tramo_at": _cerca.isoformat()}, AHORA_V)[0] == _cerca)
check(
    "un corte en crucero que reaparece lejos, a la velocidad de siempre, no cierra el tramo",
    indice_de_reaparicion(
        [{"t": k * 60, "lat": -34.0 - k * 95 / 60 / 60, "lon": -58.0, "alt": 3000, "gs": 95.0, "tierra": False} for k in range(20)]
        + [{"t": 19 * 60 + 1800, "lat": -34.0 - (19 + 30) * 95 / 60 / 60, "lon": -58.0, "alt": 3000, "gs": 95.0, "tierra": False}]
    ) is None,
)
check(
    "...y el mismo corte que reaparece casi en el mismo lugar (paró y volvió a salir) sí lo cierra",
    indice_de_reaparicion(
        [{"t": k * 60, "lat": -34.0 - k * 95 / 60 / 60, "lon": -58.0, "alt": 3000, "gs": 95.0, "tierra": False} for k in range(20)]
        + [{"t": 19 * 60 + 1800, "lat": -34.0 - 19 * 95 / 60 / 60, "lon": -58.0, "alt": 800, "gs": 80.0, "tierra": False}]
    ) == 20,
)
v_enc = vista_publica(enc, AHORA_V, TODO)
check("encadenada, la vuelta toma el vuelo de 17:38Z (lo que ya traía en el aire cuenta)", v_enc["recorrido"][0][3] == int(datetime.fromisoformat(VUELTA_ADSB[0]["visto_at"]).timestamp()) and v_enc["recorrido"][0][3] > int(FIN_IDA.timestamp()))
check("...sin ninguna posición de la ida (la última de la ida no entra: es del anterior)", all(p[3] > int(FIN_IDA.timestamp()) for p in v_enc["recorrido"]))
check("...y lo cierra al aterrizar en SADM a las 18:36Z", v_enc["fase"] == "aterrizo" and v_enc["aterrizo_at"] == FIN_VUELTA.isoformat() and v_enc["aterrizo_en"] == {"codigo": "SADM", "nombre": "Morón"} and v_enc["aterrizo_sin_ver"] is False)
ev_enc = evaluar_vuelo(enc, TODO, AHORA_V)
check("evaluar_vuelo devuelve cuándo, dónde y que lo vio", ev_enc["aterrizo_at"] == FIN_VUELTA and ev_enc["aterrizo_en"]["codigo"] == "SADM" and ev_enc["aterrizo_sin_ver"] is False)
check("a los 2 minutos de la última muestra, todavía 'volando'", evaluar_vuelo(enc, TODO, FIN_VUELTA + timedelta(minutes=2))["fase"] == "volando")
check("el tramo anterior: sólo cuenta uno del mismo avión y del mismo piloto, hasta 12 h antes de la salida", [c["id"] for c in candidatos_a_tramo_anterior(vuelta, [ida, vuelta, {**ida, "id": "otro-avion", "matricula_adsb": "LVABC"}, {**ida, "id": "muy-viejo", "salida_prevista": (D0 - timedelta(hours=2)).isoformat()}, {**ida, "id": "sin-salida", "salida_prevista": None}, {**ida, "id": "despues", "salida_prevista": (D0 + timedelta(hours=20)).isoformat()}])] == ["ida"])
check("...y el más nuevo primero", [c["id"] for c in candidatos_a_tramo_anterior(vuelta, [ida, {**ida, "id": "mas-nuevo", "salida_prevista": (D0 + timedelta(hours=14)).isoformat()}])] == ["mas-nuevo", "ida"])
check("la matrícula de ADS-B sigue sin salir, ni la fecha del encadenado", "LVS048" not in repr(v_enc) and "desde_tramo_at" not in v_enc and set(v_enc) == CLAVES_PUBLICAS)
v_ter = vista_publica({**enc, "terminado_at": FIN_VUELTA.isoformat(), "aterrizo_at": FIN_VUELTA.isoformat(), "aterrizo_en": {"codigo": "SADM", "nombre": "Morón"}}, AHORA_V + timedelta(hours=1), TODO)
check("ya guardado, lo público trae el lugar de la fila", v_ter["aterrizo_en"] == {"codigo": "SADM", "nombre": "Morón"} and v_ter["aterrizo_at"] == FIN_VUELTA.isoformat() and v_ter["fase"] == "aterrizo")
check("un seguimiento cerrado tarde no se lleva los vuelos de después de su vencimiento", ventana_adsb({**ida, "terminado_at": (D0 + timedelta(hours=20)).isoformat()}, D0 + timedelta(hours=21))[1] == D0 + timedelta(hours=15, minutes=30))

# --- aterrizar en cualquier aeródromo (no sólo el destino) ---
a_tandil = recta(12, 4, 40, SADM, SAZT, 150, 500, 62, 90) + [ar(12, 44, SAZT[0] + 0.005, SAZT[1], 120, 65)]
ult_tandil = datetime.fromisoformat(a_tandil[-1]["visto_at"])
mtandil = muestras_de_adsb(a_tandil)
check("la señal se corta baja y lenta sobre Tandil, que no es el destino (SAZM): a los 5 min aterrizó en Tandil", (lambda r: r["en"] == {"codigo": "SAZT", "nombre": "Tandil"} and r["at"] == ult_tandil)(detectar_aterrizaje(mtandil, ult_tandil + timedelta(seconds=SILENCIO_ATERRIZAJE_S), _destino_sazm := {"lat": SAZM[0], "lon": SAZM[1], "codigo": "SAZM", "nombre": "Mar del Plata"})))
check("...y antes de los 5 minutos no", detectar_aterrizaje(mtandil, ult_tandil + timedelta(seconds=SILENCIO_ATERRIZAJE_S - 1), _destino_sazm) is None)
v_t = vista_publica(ida, ult_tandil + timedelta(minutes=6), a_tandil)
check("público: 'Aterrizó en Tandil' con la hora", v_t["fase"] == "aterrizo" and v_t["aterrizo_en"] == {"codigo": "SAZT", "nombre": "Tandil"} and v_t["aterrizo_at"] == ult_tandil.isoformat() and v_t["aterrizo_sin_ver"] is False)
check("si es el destino, el del vuelo (con su nombre)", detectar_aterrizaje(mtandil, ult_tandil + timedelta(minutes=6), {"lat": SAZT[0], "lon": SAZT[1], "codigo": "SAZT", "nombre": "Aeródromo Tandil"})["en"]["nombre"] == "Aeródromo Tandil")
sin_aero = a_tandil[:-1] + [ar(12, 44, -46.0, -70.5, 120, 65)]
check("baja y lenta pero lejos de todo aeródromo: sin datos, nunca 'aterrizó'", detectar_aterrizaje(muestras_de_adsb(sin_aero), ult_tandil + timedelta(hours=1), _destino_sazm) is None and vista_publica(ida, ult_tandil + timedelta(hours=1), sin_aero)["fase"] == "sin_datos")
check("cerca de un aeródromo pero a 2500 ft: tampoco", detectar_aterrizaje(muestras_de_adsb(a_tandil[:-1] + [ar(12, 44, SAZT[0] + 0.005, SAZT[1], 2500, 65)]), ult_tandil + timedelta(hours=1), _destino_sazm) is None)
check("un destino que no está en la lista (LAD, campo) sigue valiendo", (lambda r: r is not None and r["en"] == {"codigo": "LAD9", "nombre": "Mi campo"})(detectar_aterrizaje(muestras_de_adsb(recta(12, 4, 30, SADM, (-35.0, -59.5), 150, 300, 62, 80) + [ar(12, 34, -35.002, -59.5, 100, 60)]), D0 + timedelta(hours=13), {"lat": -35.0, "lon": -59.5, "codigo": "LAD9", "nombre": "Mi campo"})))
# Perder la señal subiendo, sobre el aeródromo de salida, no es llegar.
sube = [ar(12, 4, SADM[0], SADM[1], 150, 60), ar(12, 4, SADM[0] + 0.005, SADM[1], 250, 65, seg=30), ar(12, 5, SADM[0] + 0.01, SADM[1], 400, 70), ar(12, 6, SADM[0] + 0.02, SADM[1], 600, 80), ar(12, 7, SADM[0] + 0.03, SADM[1], 800, 85)]
check("despegar y perder la señal subiendo sobre el aeródromo de salida no es aterrizar", detectar_aterrizaje(muestras_de_adsb(sube), D0 + timedelta(hours=13), _destino_sazm) is None and vista_publica(ida, D0 + timedelta(hours=12, minutes=20), sube)["fase"] != "aterrizo")
circuito = sube + [ar(12, 8 + i, SADM[0] + 0.02, SADM[1] + 0.01 * (i % 3), 700, 80) for i in range(14)] + [ar(12, 22, SADM[0] + 0.004, SADM[1], 100, 65)]
check("pero un vuelo local de 15 minutos o más que vuelve a su aeródromo sí aterrizó ahí", (lambda r: r is not None and r["en"]["codigo"] == "SADM")(detectar_aterrizaje(muestras_de_adsb(circuito), D0 + timedelta(hours=13), _destino_sazm)))
check("y si el destino es el mismo aeródromo de salida, vale desde el principio (como hasta ahora)", detectar_aterrizaje(muestras_de_adsb(sube[:3] + [ar(12, 6, SADM[0] + 0.004, SADM[1], 100, 65)]), D0 + timedelta(hours=13), {"lat": SADM[0], "lon": SADM[1], "codigo": "SADM", "nombre": "Morón"}) is not None)
toque_otro = recta(12, 4, 30, SADM, SAZT, 150, 500, 62, 90) + [ar(12, 34, SAZT[0], SAZT[1], None, 10, True), ar(12, 35, SAZT[0], SAZT[1], None, 5, True)]
check("una muestra en tierra también dice dónde (y a los 3 minutos)", (lambda r: r is not None and r["en"]["codigo"] == "SAZT")(detectar_aterrizaje(muestras_de_adsb(toque_otro), D0 + timedelta(hours=12, minutes=40), _destino_sazm)))
check("en tierra lejos de todo aeródromo: aterrizó y no se sabe dónde (el lugar queda vacío)", (lambda r: r is not None and r["en"] is None)(detectar_aterrizaje(muestras_de_adsb(recta(12, 4, 30, SADM, (-46.0, -70.5), 150, 500, 62, 90) + [ar(12, 34, -46.0, -70.5, None, 10, True), ar(12, 35, -46.0, -70.5, None, 5, True)]), D0 + timedelta(hours=12, minutes=40), _destino_sazm)))

# --- el avión que reaparece en el aire ---
ida_y_vuelta = muestras_de_adsb(IDA_ADSB + VUELTA_ADSB)
i = indice_de_reaparicion(ida_y_vuelta)
check("tras un corte de más de 20 minutos y con un vuelo antes, el avión que reaparece en el aire se marca", i is not None and ida_y_vuelta[i]["t"] == datetime.fromisoformat(VUELTA_ADSB[0]["visto_at"]).timestamp() and CORTE_REAPARECE_S == 1200)
cierre = cierre_del_vuelo(ida_y_vuelta, FIN_VUELTA + timedelta(hours=1), {"lat": SAZM[0], "lon": SAZM[1], "codigo": "SAZM", "nombre": "Mar del Plata"})
check("el tramo de antes se cierra como aterrizado sin saber dónde: a la hora de la última posición, sin lugar", cierre == {"at": FIN_IDA, "en": None, "sin_ver": True})
check("un corte de 15 minutos no es un cierre", indice_de_reaparicion(muestras_de_adsb(recta(12, 4, 20, SADM, (-35.5, -58.9), 150, 5000, 60, 100) + recta(12, 39, 10, (-35.6, -58.9), (-36.0, -58.9), 5000, 5000, 100, 100))) is None)
check("un corte largo que no vuelve a aparecer no es aterrizaje (sin datos, como hasta ahora)", cierre_del_vuelo(muestras_de_adsb(IDA_ADSB), D0 + timedelta(hours=20), {"lat": SAZM[0], "lon": SAZM[1]}) is None)
check("ni si lo que reaparece está en tierra (no es un avión en el aire)", indice_de_reaparicion(muestras_de_adsb(IDA_ADSB + [ar(17, 38, SADM[0], SADM[1], None, 0, True)])) is None)
check("sin un vuelo antes del corte, tampoco", indice_de_reaparicion(muestras_de_adsb([ar(12, 4, 1, 1, 100, 60), ar(12, 5, 1, 1, 100, 60)] + VUELTA_ADSB)) is None)
ida_larga = {**ida, "vence_at": (D0 + timedelta(hours=23)).isoformat()}
v_sv = vista_publica(ida_larga, D0 + timedelta(hours=18, minutes=40), TODO)
check("público: la ida se cierra 'sin ver dónde' y no muestra el vuelo de después", v_sv["fase"] == "aterrizo" and v_sv["aterrizo_sin_ver"] is True and v_sv["aterrizo_en"] is None and v_sv["aterrizo_at"] == FIN_IDA.isoformat() and v_sv["recorrido"][-1][3] == int(FIN_IDA.timestamp()) and v_sv["ultima"]["alt_ft"] == 7000)
v_sv2 = vista_publica({**ida_larga, "terminado_at": FIN_IDA.isoformat(), "aterrizo_at": FIN_IDA.isoformat(), "aterrizo_sin_ver": True}, D0 + timedelta(hours=19), TODO)
check("ya guardado, sigue diciéndolo", v_sv2["aterrizo_sin_ver"] is True and v_sv2["fase"] == "aterrizo" and v_sv2["recorrido"][-1][3] <= int((FIN_IDA + COLA_TRAS_ATERRIZAR).timestamp()))

# --- cambiar sólo el destino ---
check("destino: el modelo pide un punto", DestinoNuevo(punto={"lat": -37.23, "lon": -59.22, "codigo": " SAZT ", "nombre": "Tandil"}).punto.codigo == "SAZT" and falla(lambda: DestinoNuevo(punto={"lat": 91, "lon": 0})) and falla(lambda: DestinoNuevo()))
tandil = PuntoRuta(lat=SAZT[0], lon=SAZT[1], codigo="SAZT", nombre="Tandil")
c1 = con_destino_nuevo(ida, tandil)
check("destino: una ruta sin plan reemplaza el último punto y se rearma 'SADM SAZT'", c1["puntos"] == [ida["puntos"][0], [SAZT[0], SAZT[1], "SAZT", "Tandil"]] and c1["ruta"] == "SADM SAZT")
c2 = con_destino_nuevo({**vuelta, "ruta": "SAZM DCT BAIRES SADM", "puntos": [[1, 1, "SAZM", ""], [2, 2, "BAIRES", ""], [3, 3, "SADM", ""]]}, tandil)
check("destino: una ruta cargada cambia su último punto y su última palabra", c2["puntos"][-1] == [SAZT[0], SAZT[1], "SAZT", "Tandil"] and len(c2["puntos"]) == 3 and c2["ruta"] == "SAZM DCT BAIRES SAZT")
check("destino: sin puntos la ruta es sólo ese", con_destino_nuevo({"ruta": "", "puntos": []}, tandil) == {"ruta": "SAZT", "puntos": [[SAZT[0], SAZT[1], "SAZT", "Tandil"]]})
check("destino: con un solo punto (el origen), el nuevo se suma como destino", [p[2] for p in con_destino_nuevo({"ruta": "SADM", "puntos": [[1, 1, "SADM", ""]]}, tandil)["puntos"]] == ["SADM", "SAZT"] and con_destino_nuevo({"ruta": "SADM", "puntos": [[1, 1, "SADM", ""]]}, tandil)["ruta"] == "SADM SAZT")
check("destino: no toca la ruta orientativa ni inventa claves", set(c1) == {"ruta", "puntos"} and set(c2) == {"ruta", "puntos"})
check("destino: sin código usa el nombre", con_destino_nuevo(ida, PuntoRuta(lat=-35, lon=-59, nombre="Campo López"))["ruta"] == "SADM Campo López")

# --- el borrado ---
check("se borra a los 30 días", limite_de_retencion(T0).startswith("2026-10-12T12:00:00") and DIAS_DE_RETENCION == 30)

fallas = resultados.count(False)
print(f"\n{len(resultados) - fallas}/{len(resultados)} bien")
sys.exit(1 if fallas else 0)
