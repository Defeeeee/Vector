import { describe, expect, it } from "vitest";
import { alternarCapa, CAPAS_POR_DEFECTO, GRUPOS_CAPAS, leerCapas, VERSION_CAPAS } from "./capas-mapa";
import { CAPAS_CARTAS } from "./cartas-aip";

describe("las capas del Mapa", () => {
  it("de entrada se ve todo lo que dibuja Vector y ninguna carta", () => {
    expect(CAPAS_POR_DEFECTO).toContain("tma");
    expect(CAPAS_POR_DEFECTO).toContain("aerodromos");
    expect(CAPAS_POR_DEFECTO.some((c) => c.startsWith("carta-"))).toBe(false);
  });

  it("cada carta del menú tiene sus teselas", () => {
    const cartas = GRUPOS_CAPAS.flatMap((g) => g.capas).filter((c) => c.id.startsWith("carta-"));
    expect(cartas.map((c) => c.id.replace("carta-", "")).sort()).toEqual(CAPAS_CARTAS.map((c) => c.id).sort());
  });

  it("la carta inferior y la superior van una a la vez; la VFR va con cualquiera", () => {
    let v = alternarCapa([], "carta-inf");
    v = alternarCapa(v, "carta-vfr");
    v = alternarCapa(v, "carta-sup");
    expect(v.sort()).toEqual(["carta-sup", "carta-vfr"]);
    expect(alternarCapa(v, "carta-sup")).toEqual(["carta-vfr"]);
  });

  it("lo guardado se valida: lo que no se entiende vuelve a lo de siempre", () => {
    expect(leerCapas(null).visibles).toEqual(CAPAS_POR_DEFECTO);
    expect(leerCapas("{no es json").visibles).toEqual(CAPAS_POR_DEFECTO);
    expect(leerCapas(JSON.stringify({ version: VERSION_CAPAS, visibles: ["tma", "inventada", "tma"], opacidad: 7 }))).toEqual({ visibles: ["tma"], opacidad: 1 });
    expect(leerCapas(JSON.stringify({ version: VERSION_CAPAS, visibles: ["carta-inf", "carta-sup"], opacidad: 0.6 }))).toEqual({ visibles: ["carta-inf"], opacidad: 0.6 });
    // Apagar todo también se recuerda.
    expect(leerCapas(JSON.stringify({ version: VERSION_CAPAS, visibles: [] })).visibles).toEqual([]);
  });

  it("lo guardado antes de los procedimientos visuales los recibe prendidos, una sola vez", () => {
    const viejo = leerCapas(JSON.stringify({ visibles: ["tma"], opacidad: 1 })).visibles;
    expect(viejo.sort()).toEqual(["tma", "vis-02", "vis-20", "vis-llegadas", "vis-referencias", "vis-salidas"]);
    // Ya con la versión nueva, lo que apagó a propósito queda apagado.
    expect(leerCapas(JSON.stringify({ version: VERSION_CAPAS, visibles: ["tma", "vis-02"] })).visibles).toEqual(["tma", "vis-02"]);
  });
});
