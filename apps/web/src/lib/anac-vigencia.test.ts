import { describe, expect, it } from "vitest";
import { VIGENCIA_MADHEL_MIN, VIGENCIA_NOTAM_MIN, antiguedad, hayQuePreguntar } from "./anac-vigencia";

const ahora = new Date("2026-11-02T22:00:00Z");
const hace = (min: number) => new Date(ahora.getTime() - min * 60000).toISOString();

describe("hayQuePreguntar", () => {
  it("sin nada guardado, sí", () => {
    expect(hayQuePreguntar(null, VIGENCIA_NOTAM_MIN, ahora)).toBe(true);
  });

  it("los NOTAM se reusan 15 minutos", () => {
    expect(hayQuePreguntar(hace(10), VIGENCIA_NOTAM_MIN, ahora)).toBe(false);
    expect(hayQuePreguntar(hace(16), VIGENCIA_NOTAM_MIN, ahora)).toBe(true);
  });

  it("la ficha de MADHEL, un día", () => {
    expect(hayQuePreguntar(hace(23 * 60), VIGENCIA_MADHEL_MIN, ahora)).toBe(false);
    expect(hayQuePreguntar(hace(25 * 60), VIGENCIA_MADHEL_MIN, ahora)).toBe(true);
  });
});

describe("antiguedad", () => {
  it("no dice nada si es de recién", () => {
    expect(antiguedad(hace(1), ahora)).toBeNull();
    expect(antiguedad(null, ahora)).toBeNull();
  });

  it("en minutos y después en horas", () => {
    expect(antiguedad(hace(12), ahora)).toBe("hace 12 min");
    expect(antiguedad(hace(180), ahora)).toBe("hace 3 h");
  });
});
