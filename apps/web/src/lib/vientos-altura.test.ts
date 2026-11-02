import { describe, expect, it } from "vitest";
import {
  NIVELES_HPA,
  diferenciaConSuperficie,
  indiceDeHora,
  nivelParaAltitud,
  nivelesDesdeOpenMeteo,
  type NivelViento,
} from "./vientos-altura";

/**
 * La respuesta de ejemplo es **real**: se pidió a Open-Meteo para Morón antes de
 * escribir el parser, así que los nombres de campo y las unidades son los que manda de
 * verdad y no los que dice la documentación.
 */
const RESPUESTA_REAL = {
  hourly: {
    time: ["2026-08-19T00:00", "2026-08-19T12:00", "2026-08-20T00:00"],
    wind_speed_925hPa: [9, 14.1, 11],
    wind_direction_925hPa: [140, 155, 160],
    geopotential_height_925hPa: [830, 845, 840],
    wind_speed_850hPa: [10, 13.1, 12],
    wind_direction_850hPa: [160, 174, 180],
    geopotential_height_850hPa: [1530, 1543, 1540],
    wind_speed_700hPa: [14, 15.9, 16],
    wind_direction_700hPa: [230, 242, 250],
    geopotential_height_700hPa: [3100, 3116, 3110],
  },
};

const nivel = (over: Partial<NivelViento> = {}): NivelViento => ({
  hPa: 850,
  altitudFt: 5000,
  direccion: 270,
  velocidad: 20,
  ...over,
});

describe("nivelesDesdeOpenMeteo", () => {
  it("saca los tres niveles con la altura del modelo, en pies", () => {
    const n = nivelesDesdeOpenMeteo(RESPUESTA_REAL, 1);
    expect(n).toHaveLength(3);
    // 845 m → 2772 ft. La altura sale del modelo y no de una tabla hPa→pies, porque la
    // correspondencia cambia con la presión y la temperatura del día.
    expect(n[0]).toMatchObject({ hPa: 925, altitudFt: 2772, direccion: 155, velocidad: 14 });
    expect(n[1].hPa).toBe(850);
    expect(n[2].hPa).toBe(700);
  });

  it("viene ordenado de abajo hacia arriba", () => {
    const n = nivelesDesdeOpenMeteo(RESPUESTA_REAL, 1);
    for (let i = 0; i + 1 < n.length; i++) {
      expect(n[i].altitudFt).toBeLessThan(n[i + 1].altitudFt);
    }
  });

  it("descarta el nivel entero si algún campo viene null", () => {
    /*
      **El caso que importa.** Open-Meteo contesta 200 con `null` en los niveles que el
      modelo no publica. Un `Number(null)` daría 0, y cero es "calmo del norte": el dato
      faltante disfrazado del más tranquilizador posible.
    */
    const conNulls = {
      hourly: {
        ...RESPUESTA_REAL.hourly,
        wind_speed_850hPa: [10, null, 12],
        geopotential_height_700hPa: [3100, null, 3110],
      },
    };
    const n = nivelesDesdeOpenMeteo(conNulls, 1);
    expect(n.map((x) => x.hPa)).toEqual([925]);
  });

  it("una respuesta sin hourly no rompe, devuelve vacío", () => {
    expect(nivelesDesdeOpenMeteo({}, 0)).toEqual([]);
    expect(nivelesDesdeOpenMeteo(null, 0)).toEqual([]);
    expect(nivelesDesdeOpenMeteo({ error: true }, 0)).toEqual([]);
  });

  it("un índice fuera de rango devuelve vacío en vez de inventar", () => {
    expect(nivelesDesdeOpenMeteo(RESPUESTA_REAL, 99)).toEqual([]);
  });

  it("pide exactamente los niveles declarados", () => {
    expect([...NIVELES_HPA]).toEqual([925, 850, 700]);
  });
});

describe("nivelParaAltitud", () => {
  const niveles = [
    nivel({ hPa: 925, altitudFt: 2772 }),
    nivel({ hPa: 850, altitudFt: 5062 }),
    nivel({ hPa: 700, altitudFt: 10223 }),
  ];

  it("elige el más cercano en altura", () => {
    expect(nivelParaAltitud(niveles, 3000)?.hPa).toBe(925);
    expect(nivelParaAltitud(niveles, 5500)?.hPa).toBe(850);
    expect(nivelParaAltitud(niveles, 9500)?.hPa).toBe(700);
  });

  it("por debajo del primero elige el primero, no extrapola", () => {
    expect(nivelParaAltitud(niveles, 500)?.hPa).toBe(925);
  });

  it("por encima del último elige el último", () => {
    expect(nivelParaAltitud(niveles, 20000)?.hPa).toBe(700);
  });

  it("sin niveles devuelve null, no un cero", () => {
    expect(nivelParaAltitud([], 5000)).toBeNull();
  });
});

describe("diferenciaConSuperficie", () => {
  it("mide cuánto rola y cuánto arrecia", () => {
    // Lo típico: en altura gira a la derecha y sopla más.
    const d = diferenciaConSuperficie({ direccion: 180, velocidad: 8 }, { direccion: 205, velocidad: 22 });
    expect(d.giroGrados).toBe(25);
    expect(d.masNudos).toBe(14);
  });

  it("un giro a la izquierda da negativo", () => {
    const d = diferenciaConSuperficie({ direccion: 180, velocidad: 10 }, { direccion: 160, velocidad: 10 });
    expect(d.giroGrados).toBe(-20);
  });

  it("cruza el norte por el lado corto", () => {
    // De 350 a 010 son 20° a la derecha, no 340 a la izquierda.
    expect(diferenciaConSuperficie({ direccion: 350, velocidad: 5 }, { direccion: 10, velocidad: 5 }).giroGrados).toBe(20);
    expect(diferenciaConSuperficie({ direccion: 10, velocidad: 5 }, { direccion: 350, velocidad: 5 }).giroGrados).toBe(-20);
  });

  it("sin diferencia da cero", () => {
    const d = diferenciaConSuperficie({ direccion: 270, velocidad: 15 }, { direccion: 270, velocidad: 15 });
    expect(d.giroGrados).toBe(0);
    expect(d.masNudos).toBe(0);
  });
});

describe("indiceDeHora", () => {
  const tiempos = RESPUESTA_REAL.hourly.time;

  it("elige la hora más cercana en UTC", () => {
    expect(indiceDeHora(tiempos, new Date("2026-08-19T11:30:00Z"))).toBe(1);
    expect(indiceDeHora(tiempos, new Date("2026-08-19T01:00:00Z"))).toBe(0);
    expect(indiceDeHora(tiempos, new Date("2026-08-19T23:00:00Z"))).toBe(2);
  });

  it("sin tiempos devuelve cero y no rompe", () => {
    expect(indiceDeHora([], new Date())).toBe(0);
  });
});
