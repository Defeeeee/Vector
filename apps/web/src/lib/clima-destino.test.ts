import { describe, expect, it } from "vitest";
import { destinoDeLaRuta, elegirMetar, limpiarCrudo } from "./clima-destino";

describe("el clima del destino", () => {
  it("el destino es el último punto, y tiene que ser un aeródromo del directorio", () => {
    expect(destinoDeLaRuta([[-34, -58, "SADF", "San Fernando"], [-31.7, -60.8, "SAAV", "Sauce Viejo"]])?.icao).toBe("SAAV");
    expect(destinoDeLaRuta([[0, 0, "SAAV", ""], [0, 0, "BENAVIDEZ", ""]])).toBeNull();
    expect(destinoDeLaRuta([[0, 0, "ZZZZ", ""]])).toBeNull();
    expect(destinoDeLaRuta([])).toBeNull();
    expect(destinoDeLaRuta(null)).toBeNull();
    expect(destinoDeLaRuta([[0, 0, "../x", ""]])).toBeNull();
  });
  it("saca el prefijo METAR del texto crudo", () => {
    expect(limpiarCrudo("METAR SAAV 112100Z 09008KT CAVOK 29/21 Q1011")).toBe("SAAV 112100Z 09008KT CAVOK 29/21 Q1011");
    expect(limpiarCrudo("SPECI SAAV 1")).toBe("SAAV 1");
  });
  it("elige la primera estación candidata con METAR", () => {
    const filas = [
      { icaoId: "SAAV", rawOb: "METAR SAAV 112100Z CAVOK", reportTime: "2026-11-11T21:00:00.000Z", fltCat: "VFR" },
      { icaoId: "SAAR", rawOb: "METAR SAAR 112100Z CAVOK", obsTime: 1794430800 },
    ];
    expect(elegirMetar(filas, ["SAAV"])).toEqual({ icao: "SAAV", crudo: "SAAV 112100Z CAVOK", observadoEn: "2026-11-11T21:00:00.000Z", categoria: "VFR" });
    expect(elegirMetar(filas, ["SAEZ", "SAAR"])?.observadoEn).toBe("2026-11-11T21:00:00.000Z");
    expect(elegirMetar(filas, ["SAEZ"])).toBeNull();
    expect(elegirMetar({}, ["SAAV"])).toBeNull();
    expect(elegirMetar([{ icaoId: "SAAV", rawOb: "" }], ["SAAV"])).toBeNull();
  });
});
