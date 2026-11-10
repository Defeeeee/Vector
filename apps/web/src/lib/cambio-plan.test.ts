import { describe, expect, it } from "vitest";
import { cambiosMandados, enmienda, revisarCambio } from "./cambio-plan";
import type { FormularioPlan } from "./formulario-plan";

const f = { dofUtc: "2026-11-12", eobtUtc: "1930" } as FormularioPlan;

describe("la modificación (CHG) — AIP ENR 1.10, punto 6", () => {
  it("la casilla 22: número, barra y dato, cada una más con guion", () => {
    expect(enmienda([{ casilla: "19", dato: "e/0430  p/3" }, { casilla: "15", dato: "N0100VFR DCT" }])).toBe("19/E/0430 P/3 -15/N0100VFR DCT");
    expect(enmienda([{ casilla: "19", dato: " " }])).toBe("");
  });

  it("como máximo tres por vuelo (6.2)", () => {
    expect(revisarCambio(f, [], 3, "2026-11-12T12:00:00Z").error).toMatch(/tres/);
    expect(revisarCambio(f, [], 2, "2026-11-12T12:00:00Z")).toEqual({ error: null, aviso: null });
  });

  it("avisa a menos de 15 minutos de la salida vigente (6.1 y 6.4)", () => {
    expect(revisarCambio(f, [], 0, "2026-11-12T19:20:00Z").aviso).toMatch(/15 minutos/);
    // Con una demora, cuenta la nueva salida.
    expect(revisarCambio(f, [{ dof: "2026-11-12", eobt: "2030" }], 0, "2026-11-12T19:20:00Z").aviso).toBeNull();
  });

  it("cuenta sólo las CHG mandadas a la oficina", () => {
    expect(cambiosMandados([{ modo: "aro", tipo: "chg" }, { modo: "prueba", tipo: "chg" }, { modo: "aro", tipo: "dla" }])).toBe(1);
  });
});
