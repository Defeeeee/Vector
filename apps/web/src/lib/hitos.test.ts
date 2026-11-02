import { describe, expect, it } from "vitest";
import { estadoHitos, hitoCruzado } from "./hitos";

describe("estadoHitos", () => {
  it("una cuenta nueva va hacia las 50 horas", () => {
    expect(estadoHitos(0)).toEqual({ alcanzados: [], proximo: 50, faltan: 50, avance: 0 });
  });

  it("mide el avance desde el hito anterior, no desde cero", () => {
    const e = estadoHitos(125);
    expect(e.alcanzados).toEqual([50, 100]);
    expect(e.proximo).toBe(150);
    expect(e.faltan).toBe(25);
    expect(e.avance).toBeCloseTo(0.5);
  });

  it("justo en un hito, ese cuenta como alcanzado", () => {
    expect(estadoHitos(200).alcanzados).toContain(200);
    expect(estadoHitos(200).proximo).toBe(250);
  });

  it("redondea lo que falta a un decimal", () => {
    expect(estadoHitos(32.04).faltan).toBe(18);
  });

  it("pasadas las mil horas no hay próximo", () => {
    expect(estadoHitos(1200)).toMatchObject({ proximo: null, faltan: null, avance: 1 });
  });

  it("un valor raro cuenta como cero", () => {
    expect(estadoHitos(Number.NaN).proximo).toBe(50);
    expect(estadoHitos(-5).alcanzados).toEqual([]);
  });
});

describe("hitoCruzado", () => {
  it("avisa el hito que cruzó el vuelo recién cargado", () => {
    expect(hitoCruzado(49.2, 50.4)).toBe(50);
    expect(hitoCruzado(98, 100)).toBe(100);
  });

  it("llegar justo cuenta; quedarse cerca, no", () => {
    expect(hitoCruzado(49.9, 50)).toBe(50);
    expect(hitoCruzado(48, 49.9)).toBeNull();
    expect(hitoCruzado(50, 51.2)).toBeNull();
  });

  it("suma en décimas: 49,9 más una décima llega a 50", () => {
    expect(hitoCruzado(49.9, 49.9 + 0.1)).toBe(50);
  });

  it("si un vuelo cruza dos, festeja el más alto", () => {
    expect(hitoCruzado(45, 105)).toBe(100);
  });

  it("sin horas nuevas, o con datos que no son números, no hay hito", () => {
    expect(hitoCruzado(60, 60)).toBeNull();
    expect(hitoCruzado(60, 55)).toBeNull();
    expect(hitoCruzado(Number.NaN, 55)).toBeNull();
  });
});
