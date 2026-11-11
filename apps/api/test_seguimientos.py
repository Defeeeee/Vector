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
    SEGUNDOS_ENTRE_VISTAS,
    TOPE_RECORRIDO,
    TOPE_VISITANTES,
    VENTANA_MIRANDO_S,
    agregar_al_recorrido,
    anotar_vista,
    estado_de,
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
    "recorrido": [[-34.45, -58.59], [-34.5, -58.7, 1800, 1_800_000_900]],
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
check("el recorrido viejo se lee, con altura y hora en null", v["recorrido"][0] == [-34.45, -58.59, None, None] and v["recorrido"][1] == [-34.5, -58.7, 1800, 1_800_000_900])
check("los puntos con nombre", vista_publica({**fila, "puntos": [[-34.45, -58.59, "SADF", "San Fernando"]]}, T0)["puntos"] == [[-34.45, -58.59, "SADF", "San Fernando"]])
check("la hora de inicio", v["inicio"] == T0.isoformat())
check("el avión, sin matrícula", v["avion"] == {"tipo": "Cessna 152", "icao": "C152"})
check("las claves son exactamente las permitidas", set(v) == {"nombre", "ruta", "puntos", "avion", "inicio", "estado", "ultima", "recorrido", "ahora"})
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
check("sin posición todavía: ultima es null", vista_publica({**fila, "ultima_lat": None, "ultima_lon": None}, T0)["ultima"] is None)
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
check("la vista pública no ganó claves ni cuenta vistas", set(vp) == {"nombre", "ruta", "puntos", "avion", "inicio", "estado", "ultima", "recorrido", "ahora"} and A not in repr(vp))

# --- el borrado ---
check("se borra a los 30 días", limite_de_retencion(T0).startswith("2026-10-12T12:00:00") and DIAS_DE_RETENCION == 30)

fallas = resultados.count(False)
print(f"\n{len(resultados) - fallas}/{len(resultados)} bien")
sys.exit(1 if fallas else 0)
