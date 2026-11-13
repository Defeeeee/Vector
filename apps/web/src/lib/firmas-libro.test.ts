import { describe, expect, it } from "vitest";
import { ajustarEnCaja, dorsosPorHoja, fechaDelDorso, firmaParaVuelo, normalizarNombre, type FirmaCertificante } from "./firmas-libro";

const f = (id: string, nombre: string, autoridad_id: number | null = null): FirmaCertificante => ({ id, nombre, autoridad_id, png: "data:image/png;base64,AAAA" });

describe("firmaParaVuelo", () => {
  const firmas = [f("1", "JUAN PÉREZ", 5), f("2", "MARÍA GÓMEZ", 5), f("3", "LUIS ROSSI", 7)];

  it("busca por nombre, sin importar acentos, mayúsculas ni espacios", () => {
    expect(firmaParaVuelo({ autoridadId: 5, nombre: "  juan   perez " }, firmas)?.id).toBe("1");
  });

  it("acepta las mismas palabras en otro orden", () => {
    expect(firmaParaVuelo({ autoridadId: 5, nombre: "Gómez, María" }, firmas)?.id).toBe("2");
  });

  it("un nombre que no está no cae en otra firma del mismo cargo", () => {
    expect(firmaParaVuelo({ autoridadId: 5, nombre: "PEDRO NADIE" }, firmas)).toBeNull();
  });

  it("sin nombre, por cargo sólo si hay una firma de ese cargo", () => {
    expect(firmaParaVuelo({ autoridadId: 7, nombre: "" }, firmas)?.id).toBe("3");
    expect(firmaParaVuelo({ autoridadId: 5, nombre: "" }, firmas)).toBeNull();
    expect(firmaParaVuelo({ autoridadId: 9, nombre: "" }, firmas)).toBeNull();
  });

  it("un vuelo sin certificante o sin firmas queda en blanco", () => {
    expect(firmaParaVuelo(null, firmas)).toBeNull();
    expect(firmaParaVuelo({ autoridadId: 5, nombre: "JUAN PÉREZ" }, [])).toBeNull();
  });
});

describe("las piezas", () => {
  it("normaliza nombres", () => {
    expect(normalizarNombre("  Ñandú-Pérez, J. ")).toBe("NANDU PEREZ J");
    expect(normalizarNombre(null)).toBe("");
  });

  it("ajusta en la caja sin deformar", () => {
    expect(ajustarEnCaja(400, 100, 200, 100)).toEqual({ w: 200, h: 50 });
    // No agranda a menos que se pida.
    expect(ajustarEnCaja(40, 10, 200, 100)).toEqual({ w: 40, h: 10 });
    expect(ajustarEnCaja(40, 10, 200, 100, true)).toEqual({ w: 200, h: 50 });
    expect(ajustarEnCaja(0, 10, 200, 100)).toEqual({ w: 0, h: 0 });
  });

  it("los dorsos van por hoja y de un solo libro, y sin nada cargado no cuentan", () => {
    const m = dorsosPorHoja(
      [
        { id: "a", logbook_id: "L1", hoja: 1, png: "x" },
        { id: "b", logbook_id: "L2", hoja: 1, png: "y" },
        { id: "c", logbook_id: "L1", hoja: 2, aclaracion: "  " },
        { id: "d", logbook_id: "L1", hoja: 3, fecha: "2026-11-02" },
      ],
      "L1"
    );
    expect([...m.keys()]).toEqual([1, 3]);
  });

  it("la fecha del dorso no pasa por Date", () => {
    expect(fechaDelDorso("2026-11-02")).toBe("02/11/2026");
    expect(fechaDelDorso(null)).toBe("");
  });
});
