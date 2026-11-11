"""
Seguir el vuelo en vivo (migración 041): el token, las posiciones, el raleo, el estado y,
sobre todo, lo único que ve quien abre el link.

Offline. `python test_seguimientos.py`; sale con código 1 si algo falla.
"""

import sys
from datetime import datetime, timedelta, timezone

from pydantic import ValidationError

from src.services.seguimientos import (
    DIAS_DE_RETENCION,
    GRACIA_DESPUES_DE_TERMINAR,
    PosicionEnVivo,
    SeguimientoCrear,
    TOPE_RECORRIDO,
    agregar_al_recorrido,
    estado_de,
    esta_activo,
    limite_de_retencion,
    nombre_de_pila,
    nuevo_token,
    puede_aceptar_posicion,
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

# --- el raleo del servidor ---
check("la primera posición entra", puede_aceptar_posicion(None, T0))
check("a los 5 s no", not puede_aceptar_posicion(T0.isoformat(), T0 + timedelta(seconds=5)))
check("a los 10 s sí", puede_aceptar_posicion(T0.isoformat(), T0 + timedelta(seconds=10)))

# --- el recorrido ---
r = agregar_al_recorrido([], -34.45, -58.59)
check("el primer punto", r == [[-34.45, -58.59]])
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
    "recorrido": [[-34.45, -58.59], [-34.5, -58.7]],
}
v = vista_publica(fila, T0 + timedelta(minutes=21))
check("estado, nombre y ruta", (v["estado"], v["nombre"], v["ruta"]) == ("en_vuelo", "Lucía", "SADF SADM"))
check("la última posición, con su hora", v["ultima"]["lat"] == -34.5 and v["ultima"]["hora"] == fila["ultima_at"] and v["ultima"]["alt_ft"] == 1800)
check("el recorrido y los puntos de la ruta", len(v["recorrido"]) == 2 and v["puntos"][0] == [-34.45, -58.59, "SADF"])
check("las claves son exactamente las permitidas", set(v) == {"nombre", "ruta", "puntos", "estado", "ultima", "recorrido", "ahora"})
texto = repr(v)
for secreto in ("LV-ABC", "piloto@example.com", fila["user_id"], fila["id"], fila["token"], fila["aircraft_id"]):
    check(f"no sale {secreto[:12]}…", secreto not in texto)
check("sin posición todavía: ultima es null", vista_publica({**fila, "ultima_lat": None, "ultima_lon": None}, T0)["ultima"] is None)
check("un campo nuevo en la fila no sale solo", "secreto" not in vista_publica({**fila, "secreto": "x"}, T0))
check("terminada: lo dice", vista_publica({**fila, "terminado_at": T0.isoformat()}, T0)["estado"] == "terminado")
check("puntos con basura se descartan", vista_publica({**fila, "puntos": [["a", "b"], None, [1, 2]]}, T0)["puntos"] == [[1, 2, ""]])

# --- el borrado ---
check("se borra a los 30 días", limite_de_retencion(T0).startswith("2026-10-12T12:00:00") and DIAS_DE_RETENCION == 30)

fallas = resultados.count(False)
print(f"\n{len(resultados) - fallas}/{len(resultados)} bien")
sys.exit(1 if fallas else 0)
