import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getAirport } from "./airports";

/**
 * La columna de variación magnética de `madhel.tsv`, contra el archivo de verdad.
 *
 * Es un test de **datos**, no de lógica, y por eso lee el TSV real: lo que puede
 * romperse acá no es una fórmula sino que alguien corra `build-madhel.mjs` sin correr
 * después `build-magvar.mjs` y deje 711 aeródromos sin variación. Un mock reproduciría
 * el archivo bueno y no diría nada.
 *
 * **El signo es lo único que importa de verdad.** Equivocarlo no aproxima: duplica el
 * error, y en Argentina eso son entre 10 y 35 grados de rumbo.
 */

const TSV = path.join(process.cwd(), "src", "data", "madhel.tsv");
const LINEAS = fs.readFileSync(TSV, "utf8").split("\n").filter((l) => l.trim());

describe("la columna de variación magnética", () => {
  it("está en las 711 filas y ninguna quedó vacía", () => {
    // Si esto falla, lo más probable es que se haya regenerado el TSV desde ANAC sin
    // volver a correr `npm run build:magvar`.
    const sinVariacion = LINEAS.filter((l) => {
      const campos = l.split("\t");
      return campos.length < 14 || !campos[13].trim();
    });
    expect(sinVariacion).toHaveLength(0);
    expect(LINEAS.length).toBeGreaterThan(700);
  });

  it("no agregó columnas de más", () => {
    // El script recorta a 13 antes de agregar la 14ª justamente para poder correrse
    // dos veces. Si alguien saca ese recorte, el archivo crece una columna por corrida.
    const anchos = new Set(LINEAS.map((l) => l.split("\t").length));
    expect([...anchos]).toEqual([14]);
  });

  it("todos los valores son números en un rango físicamente posible", () => {
    for (const linea of LINEAS) {
      const v = Number(linea.split("\t")[13]);
      expect(Number.isFinite(v)).toBe(true);
      // Argentina real va de -12,6 a 17,8. Los ±30 son para atajar un desastre
      // (columna corrida, signo del hemisferio invertido), no para validar geofísica.
      expect(Math.abs(v)).toBeLessThan(30);
    }
  });
});

describe("el signo, que es lo que no se puede errar", () => {
  it("Morón tiene variación OESTE, o sea positiva", () => {
    // ~10° W. Es el aeródromo desde el que se vuela casi todo lo que hay en esta app,
    // así que si el signo global se invierte, este test es el primero que lo dice.
    const sadm = getAirport("SADM");
    expect(sadm?.variacionW).toBeGreaterThan(8);
    expect(sadm?.variacionW).toBeLessThan(12);
  });

  it("Bariloche tiene variación ESTE, o sea negativa", () => {
    /*
      **Éste es el test que desmiente la premisa del plan.** Decía que "Argentina va de
      ~5° a 15° W", y es falso: la línea agónica cruza la Patagonia y el signo se da
      vuelta adentro del país. Bariloche tiene ~5,4° E.

      Por eso la variación es una columna por aeródromo y no una constante nacional:
      una constante estaría equivocada por el doble de la variación en medio país.
    */
    const sazs = getAirport("SAZS");
    expect(sazs?.variacionW).toBeLessThan(0);
  });

  it("el país entero abarca los dos signos", () => {
    const valores = LINEAS.map((l) => Number(l.split("\t")[13]));
    expect(Math.min(...valores)).toBeLessThan(0);
    expect(Math.max(...valores)).toBeGreaterThan(0);
    // Treinta grados de punta a punta: Misiones contra Santa Cruz.
    expect(Math.max(...valores) - Math.min(...valores)).toBeGreaterThan(25);
  });

  it("Ushuaia es la punta este y Misiones la punta oeste", () => {
    const sawh = getAirport("SAWH"); // Ushuaia
    const sari = getAirport("SARI"); // Iguazú
    expect(sawh?.variacionW).toBeLessThan(-10);
    expect(sari?.variacionW).toBeGreaterThan(15);
  });
});

describe("la variación llega al objeto Airport", () => {
  it("está tanto en los aeródromos que ya existían como en los que sólo trae MADHEL", () => {
    // SADM viene de `airports.tsv` y MADHEL lo enriquece; GEZ (General Rodríguez) sólo
    // existe en MADHEL. Son dos ramas distintas del parser y las dos tienen que setearla.
    expect(getAirport("SADM")?.variacionW).toBeTypeOf("number");
    expect(getAirport("GEZ")?.variacionW).toBeTypeOf("number");
  });

  it("es la misma por ICAO que por designador ANAC", () => {
    expect(getAirport("SADM")?.variacionW).toBe(getAirport("MOR")?.variacionW);
  });
});
