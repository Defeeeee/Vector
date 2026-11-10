import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buscarGuias, buscarPantallas, copilotoPrimero, sinTildes } from "./buscador";

describe("el buscador de la app", () => {
  it("encuentra pestañas por su nombre y por lo que la gente escribe", () => {
    expect(buscarPantallas("vuelos").map((r) => r.href)).toContain("/dashboard/history");
    expect(buscarPantallas("metar").map((r) => r.href)).toContain("/dashboard/airports");
    expect(buscarPantallas("ddjj")[0].href).toBe("/dashboard/history/cad");
    expect(buscarPantallas("plan de vuelo")[0].href).toBe("/dashboard/plan-de-vuelo");
    expect(buscarPantallas("CMA")[0].href).toBe("/dashboard/settings");
  });

  it("sin tildes ni mayúsculas", () => {
    expect(sinTildes("Bitácora ÁÉ")).toBe("bitacora ae");
    expect(buscarPantallas("bitacora").length).toBeGreaterThan(0);
    expect(buscarPantallas("AUDITORÍA")[0].href).toBe("/dashboard/history/auditoria");
  });

  it("con menos de dos letras no busca", () => {
    expect(buscarPantallas("a")).toEqual([]);
    expect(buscarGuias(" ")).toEqual([]);
  });

  it("encuentra las guías, el examen incluido", () => {
    expect(buscarGuias("examen")[0].href).toBe("/guias/examen-ppa");
    expect(buscarGuias("centesimal")[0].href).toBe("/guias/horas-centesimales");
  });

  it("cada pantalla que ofrece existe", () => {
    for (const q of ["inicio", "vuelos", "cad", "importar", "hangar", "novedades", "publicar", "saldo", "plan", "herramientas", "actividad", "registrar"])
      for (const r of buscarPantallas(q, 20)) expect(existsSync(`src/app${r.href}/page.tsx`), r.href).toBe(true);
  });
});

describe("cuándo ⌘K ofrece primero el copiloto", () => {
  it("si no se encontró nada", () => {
    expect(copilotoPrimero("asdfgh", 0)).toBe(true);
  });

  it("si es una pregunta, aunque alguna pantalla coincida", () => {
    expect(copilotoPrimero("¿cuántas horas tengo?", 2)).toBe(true);
    expect(copilotoPrimero("puedo llevar un pasajero", 1)).toBe(true);
    expect(copilotoPrimero("cual fue mi vuelo mas largo", 1)).toBe(true);
  });

  it("no si se buscó algo concreto y apareció", () => {
    expect(copilotoPrimero("SADF", 3)).toBe(false);
    expect(copilotoPrimero("plan de vuelo", 1)).toBe(false);
    expect(copilotoPrimero("LV-S114", 2)).toBe(false);
  });

  it("no antes de escribir", () => {
    expect(copilotoPrimero("", 0)).toBe(false);
    expect(copilotoPrimero("a", 0)).toBe(false);
  });
});
