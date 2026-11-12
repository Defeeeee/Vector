import { describe, expect, it } from "vitest";
import {
  aComponentes,
  camposHourlyViento,
  deComponentes,
  horaDeOpenMeteo,
  horaMasCercana,
  horasDeMitadDeTramo,
  horaUtcDeTextos,
  leerRespuestaOpenMeteo,
  textoHoraUtc,
  validarPedidoViento,
  vientoEnPunto,
  vientoPromedioPonderado,
  NIVELES_HPA_RUTA,
  type PronosticoLugar,
} from "./viento-ruta";

const H = (t: string) => Date.parse(`${t}:00Z`);

/** Forma real de Open-Meteo (pedido del 2026-11-11), con niveles armados a mano. */
function respuesta(over: Record<string, unknown[]> = {}, elevation = 5) {
  const hourly: Record<string, unknown[]> = { time: ["2026-11-11T12:00", "2026-11-11T13:00", "2026-11-11T14:00"] };
  // Alturas aproximadas de 1000 → 500 hPa, en metros.
  const alturas = [150, 330, 520, 760, 990, 1500, 2000, 3000, 4200, 5600];
  NIVELES_HPA_RUTA.forEach((p, k) => {
    hourly[`wind_speed_${p}hPa`] = [10 + k, 10 + k, 10 + k];
    hourly[`wind_direction_${p}hPa`] = [360, 360, 360];
    hourly[`geopotential_height_${p}hPa`] = [alturas[k], alturas[k], alturas[k]];
  });
  return { latitude: -34.48, longitude: -58.6, elevation, hourly: { ...hourly, ...over } };
}

describe("campos y lectura", () => {
  it("pide velocidad, dirección y altura de los diez niveles", () => {
    const campos = camposHourlyViento().split(",");
    expect(campos).toHaveLength(30);
    expect(campos).toContain("wind_speed_850hPa");
    expect(campos).toContain("wind_direction_1000hPa");
    expect(campos).toContain("geopotential_height_500hPa");
  });

  it("la hora de Open-Meteo sin zona es UTC", () => {
    expect(horaDeOpenMeteo("2026-11-11T14:00")).toBe(Date.UTC(2026, 10, 11, 14));
    expect(horaDeOpenMeteo("basura")).toBeNaN();
    expect(horaDeOpenMeteo(null)).toBeNaN();
  });

  it("un lugar viene como objeto y varios como lista, en orden", () => {
    const uno = leerRespuestaOpenMeteo(respuesta(), 1);
    expect(uno).toHaveLength(1);
    expect(uno[0]?.horas).toHaveLength(3);
    expect(uno[0]?.elevacionM).toBe(5);
    const dos = leerRespuestaOpenMeteo([respuesta(), { sin: "hourly" }], 2);
    expect(dos[0]).not.toBeNull();
    expect(dos[1]).toBeNull();
  });

  it("si faltan lugares en la respuesta, quedan null", () => {
    expect(leerRespuestaOpenMeteo([respuesta()], 3).map((x) => x === null)).toEqual([false, true, true]);
    expect(leerRespuestaOpenMeteo({ error: true }, 1)).toEqual([null]);
  });
});

describe("hora más cercana", () => {
  const horas = [H("2026-11-11T12:00"), H("2026-11-11T13:00"), H("2026-11-11T14:00")];
  it("elige la más próxima", () => {
    expect(horaMasCercana(horas, H("2026-11-11T13:20"))).toBe(1);
    expect(horaMasCercana(horas, H("2026-11-11T13:40"))).toBe(2);
  });
  it("si la más cercana está a más de 3 h, null", () => {
    expect(horaMasCercana(horas, H("2026-11-11T20:00"))).toBeNull();
    expect(horaMasCercana([], H("2026-11-11T20:00"))).toBeNull();
  });
});

describe("componentes del viento", () => {
  it("ida y vuelta", () => {
    for (const dir of [0, 45, 90, 180, 270, 359]) {
      const c = aComponentes({ direccion: dir, velocidad: 20 });
      const v = deComponentes(c.u, c.v);
      expect(v.velocidad).toBeCloseTo(20, 6);
      expect(v.direccion).toBeCloseTo(dir, 6);
    }
  });
  it("viento del norte empuja hacia el sur", () => {
    const c = aComponentes({ direccion: 0, velocidad: 10 });
    expect(c.u).toBeCloseTo(0, 9);
    expect(c.v).toBeCloseTo(-10, 9);
  });
  it("calma no tiene dirección inventada", () => {
    expect(deComponentes(0, 0)).toEqual({ direccion: 0, velocidad: 0 });
  });
});

describe("vientoEnPunto", () => {
  const lugar = (o = respuesta()) => leerRespuestaOpenMeteo(o, 1)[0] as PronosticoLugar;
  const t = H("2026-11-11T13:00");
  const ft = (m: number) => m / 0.3048;

  it("interpola a mitad de camino entre dos niveles", () => {
    // 925 hPa (760 m, 13 kt) y 900 hPa (990 m, 14 kt): a 875 m, mitad.
    const r = vientoEnPunto(lugar(), t, ft(875));
    expect(r?.nivelesHPa).toEqual([925, 900]);
    expect(r?.viento.velocidad).toBeCloseTo(13.5, 6);
    expect(r?.viento.direccion === 0 || Math.abs((r?.viento.direccion ?? 0) - 360) < 1e-6).toBe(true);
  });

  it("en la altura exacta de un nivel da ese nivel", () => {
    const r = vientoEnPunto(lugar(), t, ft(1500));
    expect(r?.viento.velocidad).toBeCloseTo(15, 6);
  });

  it("interpola u/v y no los ángulos: 350° y 010° dan norte, no sur", () => {
    const l = lugar(
      respuesta({
        wind_direction_925hPa: [350, 350, 350],
        wind_direction_900hPa: [10, 10, 10],
        wind_speed_925hPa: [20, 20, 20],
        wind_speed_900hPa: [20, 20, 20],
      })
    );
    const r = vientoEnPunto(l, t, ft(875));
    const d = r!.viento.direccion;
    expect(Math.min(d, 360 - d)).toBeLessThan(0.001);
    // Un poco menos de 20: las componentes se promedian, no las velocidades.
    expect(r!.viento.velocidad).toBeCloseTo(20 * Math.cos((10 * Math.PI) / 180), 6);
  });

  it("fuera de los niveles es null: arriba del 500 y abajo del primero sobre el terreno", () => {
    expect(vientoEnPunto(lugar(), t, ft(6000))).toBeNull();
    expect(vientoEnPunto(lugar(), t, ft(100))).toBeNull(); // bajo el 1000 hPa
  });

  it("un nivel bajo tierra no cuenta", () => {
    // Terreno a 400 m: 1000 (150 m) y 975 (330 m) están bajo tierra; 950 está a 520 m.
    const l = lugar(respuesta({}, 400));
    expect(vientoEnPunto(l, t, ft(250))).toBeNull();
    expect(vientoEnPunto(l, t, ft(450))).toBeNull(); // entre suelo y el primer nivel útil
    expect(vientoEnPunto(l, t, ft(600))?.nivelesHPa).toEqual([950, 925]);
  });

  it("un dato faltante en uno de los dos niveles que encierran es null, no se salta", () => {
    const l = lugar(respuesta({ wind_speed_900hPa: [null, null, null] }));
    expect(vientoEnPunto(l, t, ft(875))).toBeNull();
    expect(vientoEnPunto(l, t, ft(1200))).toBeNull(); // el par 900-850 también depende de él
    expect(vientoEnPunto(l, t, ft(1700))?.nivelesHPa).toEqual([850, 800]); // los demás siguen
  });

  it("null no se lee como cero", () => {
    const l = lugar(respuesta({ wind_direction_925hPa: [null, null, null] }));
    expect(vientoEnPunto(l, t, ft(875))).toBeNull();
  });

  it("sin lugar, sin hora cercana o con altitud inválida es null", () => {
    expect(vientoEnPunto(null, t, 3000)).toBeNull();
    expect(vientoEnPunto(lugar(), H("2026-11-20T00:00"), ft(875))).toBeNull();
    expect(vientoEnPunto(lugar(), t, Number.NaN)).toBeNull();
  });

  it("devuelve la hora del modelo usada, no la pedida", () => {
    const r = vientoEnPunto(lugar(), H("2026-11-11T13:20"), ft(875));
    expect(r?.horaModeloMs).toBe(H("2026-11-11T13:00"));
  });
});

describe("promedio ponderado", () => {
  it("pondera por distancia", () => {
    const v = vientoPromedioPonderado([
      { distanciaNm: 100, viento: { direccion: 90, velocidad: 20 }, horaModeloMs: 0 },
      { distanciaNm: 100, viento: { direccion: 90, velocidad: 10 }, horaModeloMs: 0 },
    ]);
    expect(v?.direccion).toBeCloseTo(90, 6);
    expect(v?.velocidad).toBeCloseTo(15, 6);
  });
  it("vientos opuestos se anulan", () => {
    const v = vientoPromedioPonderado([
      { distanciaNm: 50, viento: { direccion: 0, velocidad: 20 }, horaModeloMs: 0 },
      { distanciaNm: 50, viento: { direccion: 180, velocidad: 20 }, horaModeloMs: 0 },
    ]);
    expect(v?.velocidad).toBeCloseTo(0, 6);
  });
  it("si falta el viento de un tramo, null", () => {
    expect(
      vientoPromedioPonderado([
        { distanciaNm: 50, viento: { direccion: 0, velocidad: 20 }, horaModeloMs: 0 },
        { distanciaNm: 50, viento: null, horaModeloMs: null },
      ])
    ).toBeNull();
    expect(vientoPromedioPonderado([])).toBeNull();
  });
});

describe("horas y textos", () => {
  it("la hora de paso por la mitad de cada tramo", () => {
    const s = H("2026-11-11T12:00");
    const h = horasDeMitadDeTramo(s, [60, 60], 120);
    expect(h[0] - s).toBe(15 * 60_000);
    expect(h[1] - s).toBe(45 * 60_000);
    expect(horasDeMitadDeTramo(s, [60, 60], 0)).toEqual([s, s]);
  });
  it("arma la hora a mano en UTC", () => {
    expect(textoHoraUtc(H("2026-11-11T09:05"))).toBe("2026-11-11 09:05 UTC");
    expect(horaUtcDeTextos("2026-11-11", "9:05")).toBe(H("2026-11-11T09:05"));
    expect(horaUtcDeTextos("2026-11-11", "25:00")).toBeNaN();
    expect(horaUtcDeTextos("11/11", "09:00")).toBeNaN();
  });
});

describe("validarPedidoViento", () => {
  const ahora = new Date().toISOString();
  const ok = { puntos: [{ lat: -34.5, lon: -58.6, hora: ahora }], altitudFt: 4500 };
  it("acepta un pedido válido", () => {
    const r = validarPedidoViento(ok);
    expect("error" in r).toBe(false);
  });
  it("rechaza lo inválido", () => {
    expect("error" in validarPedidoViento(null)).toBe(true);
    expect("error" in validarPedidoViento({ ...ok, puntos: [] })).toBe(true);
    expect("error" in validarPedidoViento({ ...ok, altitudFt: -1 })).toBe(true);
    expect("error" in validarPedidoViento({ ...ok, altitudFt: 90000 })).toBe(true);
    expect("error" in validarPedidoViento({ ...ok, altitudFt: "4500" })).toBe(true);
    expect("error" in validarPedidoViento({ ...ok, puntos: [{ lat: 95, lon: 0, hora: ahora }] })).toBe(true);
    expect("error" in validarPedidoViento({ ...ok, puntos: [{ lat: 0, lon: 200, hora: ahora }] })).toBe(true);
    expect("error" in validarPedidoViento({ ...ok, puntos: [{ lat: 0, lon: 0, hora: "ayer" }] })).toBe(true);
    expect("error" in validarPedidoViento({ ...ok, puntos: [{ lat: 0, lon: 0, hora: "2020-01-01T00:00:00Z" }] })).toBe(true);
  });
  it("topa la cantidad de puntos", () => {
    const muchos = Array.from({ length: 31 }, () => ok.puntos[0]);
    expect("error" in validarPedidoViento({ ...ok, puntos: muchos })).toBe(true);
  });
});

describe("validarPedidoViento con varias altitudes", () => {
  const ahora = new Date().toISOString();
  const puntos = [{ lat: -34.5, lon: -58.6, hora: ahora }];
  it("acepta una lista y deja altitudFt en null", () => {
    const r = validarPedidoViento({ puntos, altitudesFt: [1500, 2500, 9500] });
    expect("error" in r).toBe(false);
    if (!("error" in r)) {
      expect(r.altitudesFt).toEqual([1500, 2500, 9500]);
      expect(r.altitudFt).toBeNull();
    }
  });
  it("la altitud sola sigue igual", () => {
    const r = validarPedidoViento({ puntos, altitudFt: 4500 });
    if ("error" in r) throw new Error("debía andar");
    expect(r.altitudFt).toBe(4500);
    expect(r.altitudesFt).toBeNull();
  });
  it("rechaza lo inválido", () => {
    expect("error" in validarPedidoViento({ puntos, altitudesFt: [] })).toBe(true);
    expect("error" in validarPedidoViento({ puntos, altitudesFt: "1500" })).toBe(true);
    expect("error" in validarPedidoViento({ puntos, altitudesFt: [1500, -1] })).toBe(true);
    expect("error" in validarPedidoViento({ puntos, altitudesFt: [1500, 90000] })).toBe(true);
    expect("error" in validarPedidoViento({ puntos, altitudesFt: [1500, "x"] })).toBe(true);
    expect("error" in validarPedidoViento({ puntos, altitudesFt: Array.from({ length: 13 }, () => 2500) })).toBe(true);
    expect("error" in validarPedidoViento({ puntos, altitudFt: 4500, altitudesFt: [1500] })).toBe(true);
  });
});
