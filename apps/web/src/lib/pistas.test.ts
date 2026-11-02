import { describe, expect, it } from "vitest";
import { getAirport } from "./airports";
import { mejorPista } from "./briefing";

/**
 * Las pistas de `runways.tsv`, contra el archivo de verdad y contra el directorio.
 *
 * Es un test de datos: lo que puede romperse no es una fórmula sino que alguien
 * regenere el TSV y deje los aeródromos sin pista, o que el parser se corra de columna.
 */
describe("las pistas llegan al directorio", () => {
  it("SADM tiene su 02/20 con rumbo verdadero 013", () => {
    // El designador dice 02 —o sea ~020 magnéticos— y el rumbo verdadero es 013.
    // La diferencia es la variación de Morón, ~10° W: coherente.
    const p = getAirport("SADM")?.pistas ?? [];
    expect(p).toHaveLength(1);
    expect(p[0].le).toBe("02");
    expect(p[0].he).toBe("20");
    expect(p[0].rumboT).toBeCloseTo(13, 1);
  });

  it("SAEZ tiene las dos", () => {
    const p = getAirport("SAEZ")?.pistas ?? [];
    expect(p).toHaveLength(2);
    expect(p.map((x) => x.le).sort()).toEqual(["11", "17"]);
  });

  it("un aeródromo sin ICAO no tiene pistas, y eso es un array vacío", () => {
    /*
      GEZ existe sólo en MADHEL. OurAirports no lo conoce, así que no hay pista.
      **Vacío y no `undefined`**: el consumidor no tiene que distinguir "no cargamos el
      archivo" de "este campo no tiene pista publicada".
    */
    expect(getAirport("GEZ")?.pistas).toEqual([]);
  });

  it("todos los rumbos están en 0–360", () => {
    for (const icao of ["SADM", "SAEZ", "SACO", "SABE", "SAZS"]) {
      for (const p of getAirport(icao)?.pistas ?? []) {
        expect(p.rumboT).toBeGreaterThanOrEqual(0);
        expect(p.rumboT).toBeLessThan(360);
      }
    }
  });

  it("se pueden usar directo para el cruzado, sin conversiones", () => {
    // La cadena completa: directorio → pistas → componentes. Viento del 103 (013+90).
    const c = mejorPista(getAirport("SADM")!.pistas!, 103, 18)!;
    expect(c.cruzadoKt).toBeCloseTo(18, 1);
    expect(c.desde).toBe("derecha");
  });
});
