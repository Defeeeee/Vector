"""
El repaso de un vuelo planeado (`services/repaso_vuelo.py`): lo que vio el ADS-B contra el plan.

Las muestras tienen la forma real medida en la base: la señal arranca en el aire a 150 ft y 60 kt,
hay un hueco de cobertura en crucero y se corta en la final a 100 ft y 65 kt cerca del destino.
Offline. `python test_repaso_vuelo.py`; sale con código 1 si algo falla.
"""

import math
import sys
from datetime import datetime, timedelta, timezone

from src.services.repaso_vuelo import (
    TOPE_RECORRIDO,
    cortar_en_el_aterrizaje,
    desvio_lateral,
    eet_del_plan,
    millas_planeadas,
    parsear_puntos,
    puntos_del_seguimiento,
    ralear_recorrido,
    repasar,
    ventana_del_repaso,
)
from src.services.seguimientos import muestras_de_adsb

resultados = []


def check(label, condition):
    print(f"{'✅' if condition else '❌'} {label}")
    resultados.append(bool(condition))


T0 = datetime(2026, 11, 12, 12, 0, 0, tzinfo=timezone.utc)  # la salida del plan (EOBT)
A = (-34.45, -58.59, "SADF")
B = (-34.45, -59.59, "SAZZ")  # 1° de longitud al oeste: ~49,5 NM
RUTA = [A, B]
PLAN = {
    "dof": "2026-11-12",
    "eobt": "1200",
    "matricula": "LV-ABC",
    "demoras": [],
    "formulario": {"eet": "0100", "matricula": "LV-ABC"},
    "cancelado_at": None,
}


def fila(minuto, lat, lon, alt, gs, seg=0, tierra=False):
    t = T0 + timedelta(minutes=minuto, seconds=seg)
    return {"visto_at": t.isoformat(), "lat": lat, "lon": lon, "altitud": alt, "velocidad": gs, "en_tierra": tierra}


def vuelo(desde=5, hasta=65, hueco=(0.4, 0.6), desvio_deg=0.05, toque_y_despegue=False, cada_s=10):
    """De A a B, 60 min: 150 ft/60 kt al principio, 2000 ft/95 kt en crucero, 100 ft/65 kt en la final."""
    filas = []
    n = int((hasta - desde) * 60 / cada_s)
    for i in range(n + 1):
        f = i / n
        if hueco and hueco[0] <= f <= hueco[1]:
            continue
        lat = A[0] - desvio_deg * math.sin(math.pi * f)
        lon = A[1] + (B[1] - A[1]) * f
        if f < 0.1:
            alt, gs = 150 + 1850 * (f / 0.1), 60 + 35 * (f / 0.1)
        elif f > 0.9:
            k = (f - 0.9) / 0.1
            alt, gs = 2000 - 1900 * k, 95 - 30 * k
        else:
            alt, gs = 2000, 95
        if toque_y_despegue and 0.7 <= f <= 0.705:
            alt = 100
        filas.append(fila(desde, lat, lon, round(alt), round(gs), seg=i * cada_s))
    return filas


AHORA = T0 + timedelta(hours=3)

# --- el vuelo completo ---
r = repasar(PLAN, vuelo(), RUTA, AHORA)
check("el vuelo completo: estado completo", r["estado"] == "completo" and r["motivo"] is None)
check("despegue y aterrizaje son de cuándo lo vio el ADS-B, y avisa que no son de la bitácora",
      r["despegue_adsb"] == "2026-11-12T12:05:00+00:00" and r["aterrizaje_adsb"] == "2026-11-12T13:05:00+00:00" and "bitácora" in r["aviso"])
check("60 minutos en el aire contra 60 de la casilla 16: diferencia 0", r["minutos_en_aire"] == 60 and r["eet_min"] == 60 and r["diferencia_min"] == 0)
check("altitud máxima (baro) y velocidades", r["altitud_max_ft"] == 2000 and r["gs_max_kt"] == 95 and 85 <= r["gs_media_kt"] <= 95)
check("distancia planeada ~49,5 NM y volada algo más (zigzag de 3 NM)", 49 <= r["millas_planeadas"] <= 50 and r["millas_planeadas"] <= r["millas_voladas"] <= r["millas_planeadas"] + 3)
check("el desvío lateral máximo es el conocido (~3 NM) y dice en qué tramo",
      r["desvio"] is not None and 2.7 <= r["desvio"]["max_nm"] <= 3.1 and r["desvio"]["tramo"] == {"indice": 0, "desde": "SADF", "hasta": "SAZZ"})
check("el hueco de cobertura en crucero (12 min) no corta el vuelo y se cuenta como tiempo sin señal", r["minutos_sin_senal"] >= 9)
check("un aterrizaje (el final)", r["aterrizajes_estimados"] == 1)
check("la señal se cortó en la final cerca del destino", r["cerca_del_destino"] is True)
check("el recorrido sale sin horas, ralo, con ambos extremos",
      len(r["recorrido"]) <= TOPE_RECORRIDO and all(len(p) == 3 for p in r["recorrido"]) and r["recorrido"][0][0] == -34.45)
check("nada de la matrícula en la respuesta", "ABC" not in repr(r))

# --- lo que pasa después ---
despues = vuelo(desde=100, hasta=140, hueco=None, desvio_deg=0)  # otro piloto, 13:40-14:20
r2 = repasar(PLAN, vuelo() + despues, RUTA, AHORA)
check("el vuelo de otro piloto después del aterrizaje no entra", r2["estado"] == "completo" and r2["minutos_en_aire"] == 60 and r2["aterrizaje_adsb"] == r["aterrizaje_adsb"])

# --- el vuelo anterior ---
# Un vuelo anterior en el aire cuando abre la ventana (11:31), que baja a la final y calla 33 minutos.
anterior_final = [fila(-29, -34.45, -58.60, 900, 80), fila(-28.5, -34.45, -58.60, 400, 70), fila(-28, -34.45, -58.59, 120, 65)]
con_anterior = anterior_final + vuelo()
r3 = repasar(PLAN, con_anterior, RUTA, AHORA)
check("el vuelo anterior, en el aire al abrir la ventana, se descarta y el propio queda entero",
      r3["estado"] == "completo" and r3["despegue_adsb"] == r["despegue_adsb"] and r3["minutos_en_aire"] == 60)
sin_fin = [fila(-29.5 + i * 0.5, -34.46, -58.60, 2000, 95) for i in range(100)]
r4 = repasar(PLAN, sin_fin, RUTA, T0 + timedelta(minutes=40))
check("si sólo hay un vuelo en curso que no se puede separar: sin datos con el motivo", r4["estado"] == "sin_datos" and "otro vuelo" in r4["motivo"])

# --- parcial ---
ahora_vuelo = T0 + timedelta(minutes=45)
r5 = repasar(PLAN, [f for f in vuelo() if f["visto_at"] <= ahora_vuelo.isoformat()], RUTA, ahora_vuelo)
check("volando todavía: parcial, sin aterrizaje, con lo que se vio", r5["estado"] == "parcial" and r5["aterrizaje_adsb"] is None and r5["minutos_en_aire"] > 30 and r5["motivo"])
cortado = [f for f in vuelo() if f["visto_at"] <= (T0 + timedelta(minutes=30)).isoformat()]
r6 = repasar(PLAN, cortado, RUTA, AHORA)
check("la señal se perdió en crucero y nunca volvió: parcial (no se inventa un aterrizaje)", r6["estado"] == "parcial" and r6["aterrizaje_adsb"] is None)
aterrizo_link = T0 + timedelta(minutes=64)
r7 = repasar(PLAN, cortado, RUTA, AHORA, aterrizo_at=aterrizo_link)
check("si el link del plan vio aterrizar, es completo y el aterrizaje es el del link", r7["estado"] == "completo" and r7["aterrizaje_adsb"] == aterrizo_link.isoformat(timespec="seconds"))

# --- con el avión visto en tierra ---
con_tierra = vuelo() + [fila(65, B[0], B[1], None, 10, seg=40, tierra=True), fila(66, B[0], B[1], None, 0, tierra=True)]
r8 = repasar(PLAN, con_tierra, RUTA, AHORA)
check("una muestra en tierra después del aire cierra el vuelo", r8["estado"] == "completo")

# --- toque y despegue ---
r9 = repasar(PLAN, vuelo(toque_y_despegue=True, hueco=None), RUTA, AHORA)
check("un toque y despegue suma un aterrizaje estimado", r9["aterrizajes_estimados"] == 2)

# --- sin datos (invariante 2: no lo vio el ADS-B no es que no voló) ---
r10 = repasar(PLAN, [], RUTA, AHORA)
check("sin una sola posición: sin datos, y dice que no quiere decir que no voló", r10["estado"] == "sin_datos" and "no quiere decir que no haya volado" in r10["motivo"])
check("dos posiciones sueltas no son un vuelo", repasar(PLAN, vuelo()[:2], RUTA, AHORA)["estado"] == "sin_datos")
check("un plan cancelado no se repasa", repasar({**PLAN, "cancelado_at": "2026-11-12T11:00:00+00:00"}, vuelo(), RUTA, AHORA)["estado"] == "sin_datos")
check("sin matrícula, sin datos", repasar({**PLAN, "matricula": None, "formulario": {"eet": "0100"}}, vuelo(), RUTA, AHORA)["estado"] == "sin_datos")
check("sin salida, sin datos", repasar({**PLAN, "dof": None, "eobt": None, "formulario": {"eet": "0100", "matricula": "LV-ABC"}}, vuelo(), RUTA, AHORA)["estado"] == "sin_datos")
check("antes de la salida todavía no hay nada que repasar", repasar(PLAN, vuelo(), RUTA, T0 - timedelta(minutes=40))["estado"] == "sin_datos")
check("posiciones de otro día no cuentan", repasar(PLAN, [{**f, "visto_at": (datetime.fromisoformat(f["visto_at"]) - timedelta(days=2)).isoformat()} for f in vuelo()], RUTA, AHORA)["estado"] == "sin_datos")

# --- sin ruta, sin EET ---
r11 = repasar({**PLAN, "formulario": {"matricula": "LV-ABC"}}, vuelo(), [], AHORA)
check("sin ruta ubicada: los números del ADS-B igual salen, sin desvío ni distancia planeada, y sin destino no se da por aterrizado", r11["estado"] == "parcial" and r11["minutos_en_aire"] == 60 and r11["desvio"] is None and r11["millas_planeadas"] is None and r11["cerca_del_destino"] is None)
check("sin casilla 16 no se inventa una duración", r11["eet_min"] is None and r11["diferencia_min"] is None)
check("una ruta corta (vuelo local) no tiene desvío que medir", desvio_lateral(muestras_de_adsb(vuelo()), [A, (A[0] - 0.01, A[1], "X")]) is None)
check("el desvío ignora el circuito cerca del aeródromo", desvio_lateral(muestras_de_adsb(vuelo(desvio_deg=0)), RUTA)["max_nm"] < 0.2)

# --- la ventana ---
v = ventana_del_repaso(PLAN, None, AHORA)
check("la ventana va de media hora antes de la salida a la llegada más 3 horas, sin pasar de ahora", v == (T0 - timedelta(minutes=30), T0 + timedelta(hours=1) + timedelta(hours=3)) or v == (T0 - timedelta(minutes=30), AHORA))
check("si el link vio aterrizar, termina ahí (más la cola del rodaje)", ventana_del_repaso(PLAN, T0 + timedelta(hours=1), AHORA)[1] == T0 + timedelta(hours=1, minutes=10))
check("con la demora, la salida vigente es la última", ventana_del_repaso({**PLAN, "demoras": [{"dof": "2026-11-12", "eobt": "1300"}]}, None, T0 + timedelta(days=1))[0] == T0 + timedelta(minutes=30))
check("la casilla 16 se lee o es None", eet_del_plan(PLAN) == 60 and eet_del_plan({"formulario": {"eet": "9999"}}) is None and eet_del_plan({}) is None)

# --- lo chico ---
check("los puntos del pedido", parsear_puntos("-34.45,-58.59,SADF;-34.45,-59.59") == [(-34.45, -58.59, "SADF"), (-34.45, -59.59, "")])
check("lo que no se entiende se descarta", parsear_puntos("x,y;91,0;1,2,A;;") == [(1.0, 2.0, "A")] and parsear_puntos(None) == [])
check("no más de 60 puntos", len(parsear_puntos(";".join(["1,2"] * 100))) == 60)
check("los puntos del link guardado", puntos_del_seguimiento([[-34.4, -58.5, "SADF", "San Fernando"], ["x"], [1, 2]]) == [(-34.4, -58.5, "SADF"), (1.0, 2.0, "")])
check("la distancia planeada suma los tramos", abs(millas_planeadas([A, B, A]) - 2 * millas_planeadas([A, B])) < 0.5)
m1000 = muestras_de_adsb([fila(0, -34 - i * 0.001, -58, 1500, 95, seg=i) for i in range(1000)])
rr = ralear_recorrido(m1000)
check("el recorrido raleado nunca pasa de 400 y conserva el primero y el último", len(rr) <= TOPE_RECORRIDO and rr[0][0] == -34.0 and rr[-1][0] == round(m1000[-1]["lat"], 5))
check("uno corto queda entero", len(ralear_recorrido(m1000[:50])) == 50)
_, corto = cortar_en_el_aterrizaje(muestras_de_adsb(vuelo(hasta=45)), {"lat": B[0], "lon": B[1]})
check("el corte avisa si no vio el final", corto is False)

fallas = resultados.count(False)
print(f"\n{len(resultados) - fallas}/{len(resultados)} bien")
sys.exit(1 if fallas else 0)
