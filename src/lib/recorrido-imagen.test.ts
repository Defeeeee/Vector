import { describe, expect, it } from "vitest";
import { ESCALA, TILE, encuadrar, mercator, proyectar, tramos, ZOOM_MAX } from "./recorrido-imagen";
import type { RecorridoCompacto } from "./recorrido";

// Un circuito chico en San Fernando y una navegación a Rosario.
const SADF: [number, number] = [-34.4532, -58.5896];
const CIRCUITO: [number, number][] = [SADF, [-34.44, -58.57], [-34.43, -58.6], [-34.45, -58.61], SADF];
const NAVEGACION: [number, number][] = [SADF, [-33.5, -59.6], [-32.9035, -60.7856]];

const CAJA = { x: 60, y: 160, ancho: 960, alto: 760 };

describe("mercator", () => {
  it("el origen del mundo y el ecuador", () => {
    expect(mercator(0, 0, 0)).toEqual([128, 128]);
    const [x, y] = mercator(0, -180, 1);
    expect(x).toBe(0);
    expect(y).toBeCloseTo(256);
  });
});

describe("encuadrar", () => {
  it("un circuito usa el zoom más cercano", () => {
    expect(encuadrar(CIRCUITO, 1080, 1350, CAJA).z).toBe(ZOOM_MAX);
  });

  it("una navegación se aleja hasta entrar en la caja", () => {
    const e = encuadrar(NAVEGACION, 1080, 1350, CAJA);
    expect(e.z).toBeLessThan(ZOOM_MAX);
    for (const [la, lo] of NAVEGACION) {
      const [x, y] = proyectar(e, la, lo);
      expect(x).toBeGreaterThanOrEqual(CAJA.x - 1);
      expect(x).toBeLessThanOrEqual(CAJA.x + CAJA.ancho + 1);
      expect(y).toBeGreaterThanOrEqual(CAJA.y - 1);
      expect(y).toBeLessThanOrEqual(CAJA.y + CAJA.alto + 1);
    }
  });

  it("el recorrido queda centrado en la caja", () => {
    const e = encuadrar(NAVEGACION, 1080, 1350, CAJA);
    const xy = NAVEGACION.map(([la, lo]) => proyectar(e, la, lo));
    const cx = (Math.min(...xy.map((p) => p[0])) + Math.max(...xy.map((p) => p[0]))) / 2;
    const cy = (Math.min(...xy.map((p) => p[1])) + Math.max(...xy.map((p) => p[1]))) / 2;
    expect(cx).toBeCloseTo(CAJA.x + CAJA.ancho / 2, 0);
    expect(cy).toBeCloseTo(CAJA.y + CAJA.alto / 2, 0);
  });

  it("los tiles cubren la imagen entera, sin huecos, y son pocos", () => {
    const e = encuadrar(CIRCUITO, 1080, 1350, CAJA);
    const lado = TILE * ESCALA;
    expect(e.tiles.length).toBeLessThanOrEqual(16);
    for (const [px, py] of [
      [0, 0],
      [1079, 0],
      [0, 1349],
      [1079, 1349],
      [540, 675],
    ]) {
      expect(e.tiles.some((t) => t.izq <= px && px < t.izq + lado && t.arriba <= py && py < t.arriba + lado)).toBe(true);
    }
  });
});

describe("tramos", () => {
  const r: RecorridoCompacto = {
    t0: 0,
    fuente: "adsb.fi",
    p: [
      [0, -34.45, -58.59, 300, 80],
      [10, -34.44, -58.58, 300, 85],
      [20, -34.43, -58.57, 300, 90],
      [200, -34.42, -58.56, 1000, 95],
      [210, -34.41, -58.55, 1000, 95],
    ],
  };

  it("junta los puntos seguidos del mismo color y marca los cortes de señal", () => {
    const e = encuadrar(r.p.map(([, la, lo]) => [la, lo]), 1080, 1350, CAJA);
    const t = tramos(e, r, 1000);
    expect(t[0].corte).toBe(false);
    expect(t[0].d.match(/L/g)?.length).toBe(2);
    expect(t.some((x) => x.corte)).toBe(true);
    expect(t.at(-1)!.corte).toBe(false);
  });
});
