import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buscarGuias, buscarPantallas, sinTildes } from "./buscador";

describe("el buscador de la app", () => {
  it("encuentra pestañas por su nombre y por lo que la gente escribe", () => {
    expect(buscarPantallas("vuelos").map((r) => r.href)).toContain("/dashboard/history");
    expect(buscarPantallas("metar").map((r) => r.href)).toContain("/dashboard/clima");
    expect(buscarPantallas("ddjj")[0].href).toBe("/dashboard/history/cad");
    expect(buscarPantallas("plan de vuelo")[0].href).toBe("/dashboard/plan-de-vuelo");
    expect(buscarPantallas("CMA")[0].href).toBe("/dashboard/settings");
  });

  it("sin tildes ni mayúsculas", () => {
    expect(sinTildes("Bitácora ÁÉ")).toBe("bitacora ae");
    expect(buscarPantallas("bitacora").length).toBeGreaterThan(0);
    expect(buscarPantallas("AUDITORÍA")[0].href).toBe("/dashboard/audit");
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
