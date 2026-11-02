import { describe, expect, it } from "vitest";
import { distanceNm, distanciaNmPrecisa, legDistanceNm } from "./distance";

/**
 * Los aeródromos y sus coordenadas salen de `madhel.tsv`. Los valores esperados
 * se contrastaron contra distancias publicadas: sirven para detectar que alguien
 * rompió la fórmula, no para navegar.
 */
describe("distanceNm", () => {
  const SADF = { lat: -34.4545, lon: -58.5909 }; // San Fernando
  const SAEZ = { lat: -34.8222, lon: -58.5358 }; // Ezeiza
  const SAZS = { lat: -41.1512, lon: -71.1575 }; // Bariloche

  it("mide un salto corto del área metropolitana", () => {
    // ~41 km en línea recta
    expect(distanceNm(SADF.lat, SADF.lon, SAEZ.lat, SAEZ.lon)).toBeGreaterThan(15);
    expect(distanceNm(SADF.lat, SADF.lon, SAEZ.lat, SAEZ.lon)).toBeLessThan(30);
  });

  it("mide una travesía larga", () => {
    const d = distanceNm(SADF.lat, SADF.lon, SAZS.lat, SAZS.lon);
    expect(d).toBeGreaterThan(700);
    expect(d).toBeLessThan(900);
  });

  it("da cero entre un punto y sí mismo", () => {
    expect(distanceNm(SADF.lat, SADF.lon, SADF.lat, SADF.lon)).toBe(0);
  });

  it("es el redondeo de la versión precisa", () => {
    // Una sola fórmula con dos salidas, no dos implementaciones. Este archivo ya
    // advierte que `splitRoute` llegó a existir cinco veces.
    const crudo = distanciaNmPrecisa(SADF.lat, SADF.lon, SAZS.lat, SAZS.lon);
    expect(distanceNm(SADF.lat, SADF.lon, SAZS.lat, SAZS.lon)).toBe(Math.round(crudo));
    expect(Number.isInteger(crudo)).toBe(false);
  });

  it("la precisa no redondea, que es todo el punto", () => {
    // 113,2855 NM de Morón a Junín. Encadenados por cuatro tramos, los redondeos de
    // `distanceNm` se comen millas enteras del total.
    const SADM = { lat: -34.6792, lon: -58.6436 };
    const SAAJ = { lat: -34.5459, lon: -60.9305 };
    expect(distanciaNmPrecisa(SADM.lat, SADM.lon, SAAJ.lat, SAAJ.lon)).toBeCloseTo(113.2855, 3);
  });

  it("es simétrica", () => {
    expect(distanceNm(SADF.lat, SADF.lon, SAZS.lat, SAZS.lon)).toBe(
      distanceNm(SAZS.lat, SAZS.lon, SADF.lat, SADF.lon)
    );
  });
});

describe("legDistanceNm", () => {
  const conCoords = { lat: -34.4545, lon: -58.5909 };

  it("mide cuando los dos extremos tienen posición", () => {
    expect(legDistanceNm(conCoords, { lat: -34.8222, lon: -58.5358 })).toBeGreaterThan(0);
  });

  /**
   * Null y no cero: un cero se confundiría con un circuito local, que es
   * justamente la distinción que esto viene a informar.
   */
  it("devuelve null cuando falta una coordenada, no cero", () => {
    expect(legDistanceNm(conCoords, { lat: undefined, lon: undefined })).toBeNull();
    expect(legDistanceNm(conCoords, {})).toBeNull();
    expect(legDistanceNm(null, conCoords)).toBeNull();
    expect(legDistanceNm(conCoords, null)).toBeNull();
  });
});

import { CIRCUIT_SPEED_KT, MIN_ESTIMABLE_H, TAXI_ALLOWANCE_H, estimatedLocalNm } from "./distance";

/**
 * El tiempo del libro es motor encendido a motor apagado —lo que pide ANAC—,
 * así que incluye rodaje y prueba de motor. Estos tests fijan que se descuente
 * antes de multiplicar, y que no se estime donde el número no diría nada.
 */
describe("estimatedLocalNm", () => {
  it("descuenta el rodaje antes de multiplicar", () => {
    // 1.0 h de motor → 0.7 h de aire → 63 NM
    expect(estimatedLocalNm(1.0)).toBe(Math.round((1.0 - TAXI_ALLOWANCE_H) * CIRCUIT_SPEED_KT));
    expect(estimatedLocalNm(1.0)).toBe(63);
  });

  /**
   * Un vuelo de 0.5 h quedaría con 0.2 h de aire: 60% rodaje. Estimar ahí es
   * inventar con cara de dato.
   */
  it("no estima por debajo del mínimo", () => {
    expect(estimatedLocalNm(0.3)).toBe(0);
    expect(estimatedLocalNm(MIN_ESTIMABLE_H - 0.01)).toBe(0);
  });

  it("nunca devuelve negativo", () => {
    expect(estimatedLocalNm(0)).toBe(0);
    expect(estimatedLocalNm(-2)).toBe(0);
  });

  it("aguanta basura sin romperse", () => {
    expect(estimatedLocalNm(NaN)).toBe(0);
    expect(estimatedLocalNm(Infinity)).toBe(0);
  });

  it("crece con la duración", () => {
    expect(estimatedLocalNm(2)).toBeGreaterThan(estimatedLocalNm(1));
  });
});
