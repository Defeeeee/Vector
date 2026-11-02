import { describe, expect, it } from "vitest";
import { esAlumno, esVueloDeAlumno, vuelosDesdeLaPpa } from "./licencias";

describe("esAlumno", () => {
  it("reconoce el valor del alta y variantes escritas a mano", () => {
    expect(esAlumno("ALUMNO")).toBe(true);
    expect(esAlumno("alumno piloto")).toBe(true);
  });
  it("una licencia no es alumno", () => {
    expect(esAlumno("PPA")).toBe(false);
    expect(esAlumno("PPA-HVI")).toBe(false);
    expect(esAlumno("-")).toBe(false);
    expect(esAlumno(null)).toBe(false);
  });
});

describe("vuelosDesdeLaPpa", () => {
  const vuelos = [{ date: "2026-03-01" }, { date: "2026-06-15" }, { date: "2026-06-16T10:00:00Z" }, { date: "2026-09-01" }];

  it("sin fecha de PPA cuentan todos: nada cambia para quien nunca fue alumno", () => {
    expect(vuelosDesdeLaPpa(vuelos, null)).toHaveLength(4);
    expect(vuelosDesdeLaPpa(vuelos, undefined)).toHaveLength(4);
    expect(vuelosDesdeLaPpa(vuelos, "")).toHaveLength(4);
  });

  it("con fecha, desde ese día inclusive", () => {
    expect(vuelosDesdeLaPpa(vuelos, "2026-06-15").map((v) => v.date)).toEqual(["2026-06-15", "2026-06-16T10:00:00Z", "2026-09-01"]);
  });

  it("marca los de alumno sólo si hay fecha", () => {
    expect(esVueloDeAlumno("2026-03-01", "2026-06-15")).toBe(true);
    expect(esVueloDeAlumno("2026-06-15", "2026-06-15")).toBe(false);
    expect(esVueloDeAlumno("2026-03-01", null)).toBe(false);
  });
});
