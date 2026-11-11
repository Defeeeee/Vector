import { describe, expect, it, vi } from "vitest";
import { clasificarRespuesta, palabraDelModelo } from "./respuesta-plan-gemini";

describe("palabraDelModelo", () => {
  it("toma la primera palabra si es una de las cinco", () => {
    expect(palabraDelModelo("aceptado")).toBe("aceptado");
    expect(palabraDelModelo(" Corregir.\n")).toBe("corregir");
    expect(palabraDelModelo("otra cosa")).toBe("otra");
  });
  it("lo demás es null", () => {
    expect(palabraDelModelo("no sé")).toBeNull();
    expect(palabraDelModelo("")).toBeNull();
    expect(palabraDelModelo(null)).toBeNull();
  });
});

describe("clasificarRespuesta", () => {
  it("si las reglas deciden, no llama al modelo", async () => {
    const pedir = vi.fn();
    expect(await clasificarRespuesta("Plan rechazado", "Re: plan", pedir)).toBe("rechazado");
    expect(pedir).not.toHaveBeenCalled();
  });
  it("si no deciden, usa lo que contesta el modelo", async () => {
    const pedir = vi.fn().mockResolvedValue("corregir");
    expect(await clasificarRespuesta("Sírvase revisar el equipo declarado", "Re: plan", pedir)).toBe("corregir");
    expect(pedir).toHaveBeenCalledOnce();
  });
  it("si el modelo falla o contesta cualquier cosa, es otra", async () => {
    expect(await clasificarRespuesta("Nos comunicamos luego", "Re: plan", async () => { throw new Error("503"); })).toBe("otra");
    expect(await clasificarRespuesta("Nos comunicamos luego", "Re: plan", async () => "no tengo idea")).toBe("otra");
    expect(await clasificarRespuesta("Nos comunicamos luego", "Re: plan", async () => null)).toBe("otra");
  });
  it("un texto vacío es otra sin llamar al modelo", async () => {
    const pedir = vi.fn();
    expect(await clasificarRespuesta("  ", "Re: plan", pedir)).toBe("otra");
    expect(pedir).not.toHaveBeenCalled();
  });
});
