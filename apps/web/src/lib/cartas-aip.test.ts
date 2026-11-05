import { describe, expect, it } from "vitest";
import datos from "../data/cartas-aip.json";
import { puntoEnCarta } from "../../scripts/cartas/lambert.mjs";
import { CAPAS_CARTAS, teselaValida, urlTeselaCarta } from "./cartas-aip";

type Ajuste = (typeof datos.cartas)[keyof typeof datos.cartas];
const cartas = Object.entries(datos.cartas) as [string, Ajuste][];

describe("el ajuste de las cartas del AIP (scripts/build-cartas.mjs)", () => {
  it("están las ocho: INF 1–3, SUP 1–3 y las VFR de Baires y Córdoba, cada una en una capa del Mapa", () => {
    expect(cartas.map(([d]) => d).sort()).toEqual(["ENR 6.1", "ENR 6.10", "ENR 6.2", "ENR 6.3", "ENR 6.4", "ENR 6.5", "ENR 6.6", "ENR 6.9"]);
    for (const [, c] of cartas) expect(CAPAS_CARTAS.map((k) => k.id)).toContain(c.capa);
  });

  it("cada cruce de la grilla cae, con la proyección ajustada, a menos de 0,25 pt de donde está en la carta", () => {
    for (const [documento, c] of cartas) {
      expect(c.gcps.length, documento).toBeGreaterThanOrEqual(12);
      for (const g of c.gcps) {
        const [x, y] = puntoEnCarta(c, g.lon, g.lat);
        expect(Math.hypot(x - g.x, y - g.y), `${documento} ${g.lat},${g.lon}`).toBeLessThan(0.25);
      }
    }
  });

  it("las seis ENR en ruta dan la misma constante del cono: son una sola proyección", () => {
    const ns = cartas.filter(([d]) => /^ENR 6\.[1-6]$/.test(d)).map(([, c]) => c.n);
    expect(ns).toHaveLength(6);
    expect(Math.max(...ns) - Math.min(...ns)).toBeLessThan(0.002);
  });

  it("la escala sale como la que imprime la carta (1:2.300.000 y 1:500.000)", () => {
    // Un grado de latitud cerca de 34°S son ~110,9 km; en la carta, a 1:N, son 110,9 km / N.
    const ptPorGrado = (c: Ajuste, lat: number, lon: number) => {
      const [x1, y1] = puntoEnCarta(c, lon, lat);
      const [x2, y2] = puntoEnCarta(c, lon, lat + 1);
      return Math.hypot(x2 - x1, y2 - y1);
    };
    const escala = (c: Ajuste, lat: number, lon: number) => (110_900 / (ptPorGrado(c, lat, lon) * 0.0254 / 72)) / 1;
    expect(escala(datos.cartas["ENR 6.3"], -34.5, -60) / 2_300_000).toBeCloseTo(1, 1);
    expect(escala(datos.cartas["ENR 6.10"], -34.8, -58.5) / 500_000).toBeCloseTo(1, 1);
  });
});

describe("la ruta de las teselas", () => {
  it("acepta sólo capas conocidas y niveles dentro de su rango", () => {
    expect(teselaValida("vfr", "12", "1381", "2465")).toMatchObject({ z: 12, x: 1381, y: 2465 });
    expect(teselaValida("vfr", "13", "1", "1")).toBeNull();
    expect(teselaValida("inf", "4", "1", "1")).toBeNull();
    expect(teselaValida("otra", "9", "1", "1")).toBeNull();
    expect(teselaValida("sup", "9", "../../etc", "1")).toBeNull();
    expect(teselaValida("sup", "9", "512", "1")).toBeNull();
  });

  it("la URL lleva el ciclo AIRAC, para que uno nuevo no salga del cache", () => {
    expect(urlTeselaCarta("inf")).toMatch(/^\/api\/cartas\/inf\/\{z\}\/\{x\}\/\{y\}\?airac=\d{4}-\d{2}-\d{2}$/);
  });
});
