import { describe, expect, it } from "vitest";
import { armarMensajeImportacion, resumenDeLectura } from "./importar-libro-mail";

const base = { nombre: "Berni", estado: "listo" as const, vuelos: 143, avionesNuevos: 2, paginasTotal: 40, fallidos: [], appUrl: "https://vectoraero.ar", revisar: "https://vectoraero.ar/dashboard/log-flight/import?importacion=abc" };

describe("mail de la importación", () => {
  it("cuenta lo leído y los aviones nuevos", () => {
    expect(resumenDeLectura(base)).toBe("leímos 143 vuelos y encontramos 2 aviones que no están en tu Hangar");
    expect(resumenDeLectura({ ...base, vuelos: 1, avionesNuevos: 1 })).toBe("leímos 1 vuelo y encontramos 1 avión que no está en tu Hangar");
    expect(resumenDeLectura({ ...base, avionesNuevos: 0 })).toBe("leímos 143 vuelos");
  });
  it("si faltó algo lo dice", () => {
    const m = armarMensajeImportacion({ ...base, fallidos: [{ desde: 37, hasta: 40 }] });
    expect(m.texto).toContain("No pudimos leer las hojas 37 a 40");
    expect(m.asunto).toContain("casi listo");
  });
  it("lleva el link y no hay matrículas ni rutas", () => {
    const m = armarMensajeImportacion(base);
    expect(m.texto).toContain("importacion=abc");
    expect(m.html).toContain("importacion=abc");
    expect(m.texto).not.toMatch(/LV-|SAD[A-Z]/);
  });
  it("si falló todo, dice cómo seguir", () => {
    const m = armarMensajeImportacion({ ...base, estado: "error", vuelos: 0, avionesNuevos: 0 });
    expect(m.asunto).toBe("No pudimos leer tu libro");
    expect(m.texto).toContain("Probá de nuevo");
  });
});
