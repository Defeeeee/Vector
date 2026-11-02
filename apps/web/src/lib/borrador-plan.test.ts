import { describe, expect, it } from "vitest";
import { borradorParaRecuperar, claveBorrador, leerBorrador } from "./borrador-plan";

describe("el borrador del plan en el teléfono", () => {
  const f = { salida: "SADF" };
  it("se recupera si es más nuevo que lo del servidor", () => {
    expect(borradorParaRecuperar({ formulario: f, at: "2026-10-23T12:05:00Z" }, "2026-10-23T12:00:00Z")).toBe(f);
  });
  it("gana el servidor si se guardó después (en otro dispositivo)", () => {
    expect(borradorParaRecuperar({ formulario: f, at: "2026-10-23T11:00:00Z" }, "2026-10-23T12:00:00Z")).toBeNull();
    expect(borradorParaRecuperar({ formulario: f, at: "2026-10-23T12:00:00Z" }, "2026-10-23T12:00:00Z")).toBeNull();
  });
  it("sin fecha del servidor, se recupera; sin borrador o roto, nada", () => {
    expect(borradorParaRecuperar({ formulario: f, at: "2026-10-23T12:05:00Z" }, null)).toBe(f);
    expect(borradorParaRecuperar(null, "2026-10-23T12:00:00Z")).toBeNull();
    expect(borradorParaRecuperar({ formulario: f, at: "ayer" }, null)).toBeNull();
  });
  it("lee lo guardado como texto", () => {
    expect(leerBorrador('{"formulario":{"salida":"SADF"},"at":"2026-10-23T12:05:00Z"}')).toEqual({ formulario: f, at: "2026-10-23T12:05:00Z" });
    expect(leerBorrador("{roto")).toBeNull();
    expect(leerBorrador('{"at":"x"}')).toBeNull();
    expect(leerBorrador(null)).toBeNull();
    expect(claveBorrador("abc")).toBe("vector-plan-borrador-abc");
  });
});
