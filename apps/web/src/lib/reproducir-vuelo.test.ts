import { describe, expect, it } from "vitest";
import { desdeRecorrido, desdeTrack, diaMesArgentina, estadoEn, hayMovimiento, hhmmArgentina, hhmmssArgentina, huecosSinSenal, perfilDeAltura, transcurrido, type SerieVuelo } from "./reproducir-vuelo";

const T0 = Date.UTC(2026, 2, 12, 15, 0, 0);
const serie = (m: [number, number, number, number | null, number | null][], fuente: "adsb" | "gps" = "adsb"): SerieVuelo => ({
  fuente,
  muestras: m.map(([s, lat, lon, altFt, gsKt]) => ({ t: T0 + s * 1000, lat, lon, altFt, gsKt })),
});

describe("normalización", () => {
  it("desdeRecorrido pasa a ms, ordena y descarta basura y tiempos repetidos", () => {
    const s = desdeRecorrido({
      t0: T0 / 1000,
      fuente: "adsb.lol",
      p: [
        [20, -34.5, -58.6, 1000, 90],
        [0, -34.4, -58.6, 500, 80],
        [10, NaN, -58.6, 700, 85],
        [10, -34.45, -58.6, 700, 85],
        [10, -34.46, -58.6, 700, 85],
        [30, -34.6, -58.6, Number.NaN, null],
      ],
    });
    expect(s.proveedor).toBe("adsb.lol");
    expect(s.muestras.map((m) => m.t - T0)).toEqual([0, 10_000, 20_000, 30_000]);
    expect(s.muestras[1].lat).toBe(-34.45);
    expect(s.muestras[3].altFt).toBeNull();
  });
  it("desdeTrack ordena por hora y descarta los repetidos", () => {
    const s = desdeTrack({ inicio: T0, ruta: "SADF", terminado: null, puntos: [[T0, -34, -58, 100, 0], [T0 + 4000, -34.001, -58, null, 10], [T0 + 2000, -34, -58, 1, 1], [T0 + 4000, -34.5, -58, 1, 1]] });
    expect(s.fuente).toBe("gps");
    expect(s.muestras.map((m) => m.t - T0)).toEqual([0, 2000, 4000]);
    expect(s.muestras[2].lat).toBe(-34.001);
  });
});

describe("estadoEn", () => {
  const s = serie([[0, -34.0, -58.0, 1000, 80], [60, -34.1, -58.0, 2000, 100]]);
  it("interpola a mitad de tramo", () => {
    const e = estadoEn(s, T0 + 30_000);
    expect(e.lat).toBeCloseTo(-34.05, 6);
    expect(e.altFt).toBeCloseTo(1500, 6);
    expect(e.gsKt).toBeCloseTo(90, 6);
    expect(e.indice).toBe(0);
  });
  it("acota t al inicio y al final", () => {
    expect(estadoEn(s, T0 - 99999).t).toBe(T0);
    const f = estadoEn(s, T0 + 9e9);
    expect(f.t).toBe(T0 + 60_000);
    expect(f.lat).toBeCloseTo(-34.1, 6);
    expect(f.indice).toBe(1);
  });
  it("con un solo vecino con altura usa ése; sin ninguno, null", () => {
    const a = serie([[0, -34, -58, null, null], [10, -34.01, -58, 800, 70], [20, -34.02, -58, null, null]]);
    expect(estadoEn(a, T0 + 5000).altFt).toBe(800);
    expect(estadoEn(a, T0 + 5000).gsKt).toBe(70);
    const b = serie([[0, -34, -58, null, null], [10, -34.01, -58, null, null]]);
    expect(estadoEn(b, T0 + 5000).altFt).toBeNull();
    expect(estadoEn(b, T0 + 5000).varioFtMin).toBeNull();
  });
  it("marca el hueco sin señal y no calcula vario ahí", () => {
    const h = serie([[0, -34, -58, 1000, 90], [10, -34.01, -58, 1000, 90], [130, -34.2, -58, 1000, 90], [140, -34.21, -58, 1000, 90]]);
    expect(estadoEn(h, T0 + 5000).sinSenal).toBe(false);
    const e = estadoEn(h, T0 + 70_000);
    expect(e.sinSenal).toBe(true);
    expect(e.varioFtMin).toBeNull();
    expect(huecosSinSenal(h)).toEqual([[T0 + 10_000, T0 + 130_000]]);
  });
  it("el GPS tolera un minuto quieto: no es un corte", () => {
    const g = serie([[0, -34, -58, 10, 0], [61, -34, -58, 10, 0]], "gps");
    expect(estadoEn(g, T0 + 30_000).sinSenal).toBe(false);
  });
  it("rumbo: norte, este, y se conserva quieto", () => {
    const norte = serie([[0, -34.0, -58, 500, 90], [60, -33.9, -58, 500, 90]]);
    expect(estadoEn(norte, T0 + 30_000).rumbo).toBeCloseTo(0, 0);
    const este = serie([[0, -34, -58.0, 500, 90], [60, -34, -57.9, 500, 90]]);
    expect(estadoEn(este, T0 + 30_000).rumbo).toBeCloseTo(90, 0);
    const quieto = serie([[0, -34.0, -58.0, 0, 0], [60, -34.1, -58.0, 0, 90], [120, -34.1, -58.0, 0, 0], [180, -34.1, -58.0, 0, 0]]);
    expect(estadoEn(quieto, T0 + 60_000).rumbo).toBeCloseTo(180, 0);
    expect(estadoEn(quieto, T0 + 150_000).rumbo).toBeCloseTo(180, 0);
    expect(estadoEn(quieto, T0 + 180_000).rumbo).toBeCloseTo(180, 0);
  });
  it("al principio quieto toma el primer rumbo que haya", () => {
    const s2 = serie([[0, -34, -58, 0, 0], [30, -34, -58, 0, 0], [90, -33.9, -58, 0, 90]]);
    expect(estadoEn(s2, T0).rumbo).toBeCloseTo(0, 0);
  });
  it("vario de un ascenso de 500 ft/min", () => {
    const asc = serie(Array.from({ length: 13 }, (_, k) => [k * 10, -34 + k * 0.001, -58, 1000 + (500 / 6) * k, 80] as [number, number, number, number, number]));
    const e = estadoEn(asc, T0 + 60_000);
    expect(e.varioFtMin).toBeCloseTo(500, 0);
  });
});

describe("perfilDeAltura", () => {
  it("ralea, deja los máximos de las muestras y corta en los huecos", () => {
    const s = serie([[0, -34, -58, 1000, 90], [10, -34.01, -58, 3000, 110], [20, -34.02, -58, 1000, 90], [200, -34.1, -58, 1000, 90]]);
    const p = perfilDeAltura(s, 50);
    expect(p.puntos).toHaveLength(50);
    expect(p.altMax).toBe(3000);
    expect(p.gsMax).toBe(110);
    expect(p.huecos).toEqual([[T0 + 20_000, T0 + 200_000]]);
    expect(p.puntos.some(([t, a]) => t > T0 + 30_000 && t < T0 + 190_000 && a === null)).toBe(true);
  });
});

describe("hayMovimiento", () => {
  it("pide al menos dos muestras lejos de la primera", () => {
    expect(hayMovimiento(serie([[0, -34, -58, 0, 0], [10, -34, -58, 0, 0]]))).toBe(false);
    expect(hayMovimiento(serie([[0, -34, -58, 0, 0], [10, -34.01, -58, 0, 0]]))).toBe(false);
    expect(hayMovimiento(serie([[0, -34, -58, 0, 0], [10, -34.01, -58, 0, 0], [20, -34.02, -58, 0, 0]]))).toBe(true);
  });
});

describe("horas", () => {
  it("hora argentina por cuenta, cruzando la medianoche UTC", () => {
    expect(hhmmArgentina(Date.UTC(2026, 2, 12, 15, 5))).toBe("12:05");
    expect(hhmmArgentina(Date.UTC(2026, 2, 13, 1, 30))).toBe("22:30");
    expect(hhmmssArgentina(Date.UTC(2026, 2, 13, 2, 59, 59))).toBe("23:59:59");
    expect(diaMesArgentina(Date.UTC(2026, 2, 13, 1, 30))).toBe("12 de marzo");
    expect(diaMesArgentina(Date.UTC(2026, 2, 13, 3, 0))).toBe("13 de marzo");
  });
  it("transcurrido", () => {
    expect(transcurrido(0)).toBe("0:00:00");
    expect(transcurrido((42 * 60 + 10) * 1000)).toBe("0:42:10");
    expect(transcurrido(3_725_000)).toBe("1:02:05");
    expect(transcurrido(-5)).toBe("0:00:00");
  });
});
