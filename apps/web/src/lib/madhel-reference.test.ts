import { describe, expect, it } from "vitest";
import { anacIndicator, canonicalRoute } from "./madhel-reference";

/**
 * Estos tests leen `src/data/madhel.tsv` y `airports.tsv` de verdad. Es a
 * propósito: lo que rompió antes no fue la lógica sino los datos —una tabla a
 * mano con seis mapeos mal— y un mock los habría reproducido sin chistar.
 */

describe("anacIndicator", () => {
  it("traduce ICAO a designador ANAC", () => {
    expect(anacIndicator("SADM")).toBe("MOR");
    expect(anacIndicator("SADF")).toBe("FDO");
    expect(anacIndicator("SRDR")).toBe("GEZ");
  });

  it("deja pasar un designador que ya viene bien", () => {
    expect(anacIndicator("GEZ")).toBe("GEZ");
    expect(anacIndicator("gez")).toBe("GEZ");
  });

  /**
   * Los seis que estaban mal en la tabla escrita a mano. Si alguien la reintroduce,
   * esto lo agarra.
   */
  it("no repite los mapeos que estaban mal", () => {
    expect(anacIndicator("SAWE")).toBe("GRA"); // Río Grande, no Ushuaia
    expect(anacIndicator("SAZY")).toBe("CHP"); // San Martín de los Andes, no El Calafate
    expect(anacIndicator("SAWD")).toBe("ADO"); // Puerto Deseado, no Puerto Madryn
    expect(anacIndicator("SACO")).toBe("CBA"); // Córdoba, no Formosa
    expect(anacIndicator("SAWC")).toBe("ECA"); // El Calafate
  });

  it("no confunde El Palomar con La Plata", () => {
    expect(anacIndicator("SADP")).toBe("PAL"); // El Palomar
    expect(anacIndicator("SADL")).toBe("PTA"); // La Plata
  });

  it("devuelve el código tal cual si no lo conoce", () => {
    expect(anacIndicator("ZZZZ")).toBe("ZZZZ");
  });
});

describe("canonicalRoute", () => {
  it("lleva las dos formas de nombrar un aeródromo al mismo código", () => {
    expect(canonicalRoute("GEZ - SRDR")).toBe("SRDR SRDR");
    expect(canonicalRoute("gez srdr")).toBe("SRDR SRDR");
    expect(canonicalRoute("MOR SADM")).toBe("SADM SADM");
  });

  it("normaliza el separador, para no dejar una tercera forma de escribir lo mismo", () => {
    expect(canonicalRoute("SADF-SADM")).toBe("SADF SADM");
    expect(canonicalRoute("SADF  SADM")).toBe("SADF SADM");
  });

  /**
   * Un split ciego partía la Í y devolvía "GENERAL RODR GUEZ": peor que no
   * haber tocado nada. Si el modelo manda un nombre, se deja como vino.
   */
  it("no destroza un nombre cuando el modelo manda texto en vez de códigos", () => {
    expect(canonicalRoute("General Rodríguez")).toBe("General Rodríguez");
    expect(canonicalRoute("Aeródromo San Fernando")).toBe("Aeródromo San Fernando");
  });

  it("deja intactos los códigos que no resuelven en vez de inventar", () => {
    expect(canonicalRoute("XXXX YYYY")).toBe("XXXX YYYY");
  });

  it("no explota con vacío", () => {
    expect(canonicalRoute("")).toBe("");
  });
});
