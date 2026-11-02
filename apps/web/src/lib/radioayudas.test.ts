import { describe, expect, it } from "vitest";
import { allRadioayudas, getRadioayuda } from "./radioayudas";
import { puntoPorRadial } from "./puntos";
import { distanciaNmPrecisa } from "./distance";

/**
 * Estos tests corren contra **el archivo de verdad**, no contra un fixture.
 *
 * Es a propósito: lo que puede romperse acá no es la lógica —son treinta líneas de
 * `split("\t")`— sino el dato. `build-navaids.mjs` se vuelve a correr cuando OurAirports
 * publica, y una columna que se corre de lugar no rompe nada visible: devuelve una
 * variación donde iba una frecuencia y los puntos por radial salen a cualquier lado, con
 * pinta de razonables. Un fixture no atraparía eso; el archivo real sí.
 */

describe("el directorio de radioayudas", () => {
  it("carga las 96 radioayudas", () => {
    expect(allRadioayudas().length).toBe(96);
  });

  it("BAR es el VOR-DME de Bariloche, con su frecuencia y su variación", () => {
    const bar = getRadioayuda("BAR")!;
    expect(bar.tipo).toBe("VOR-DME");
    expect(bar.khz).toBe(117400);
    expect(bar.lat).toBeCloseTo(-41.1403, 4);
    expect(bar.lon).toBeCloseTo(-71.1889, 4);
    // 8° **este**, o sea `variacionW` negativa. Es la parte que un corrimiento de
    // columnas rompe sin hacer ruido.
    expect(bar.variacionW).toBe(-8);
    expect(bar.origenVariacion).toBe("slaved");
  });

  it("el ident se normaliza", () => {
    expect(getRadioayuda("bar")?.ident).toBe("BAR");
    expect(getRadioayuda("  bar  ")?.ident).toBe("BAR");
  });

  it("un ident que no existe devuelve null", () => {
    expect(getRadioayuda("ZZZZ")).toBeNull();
    expect(getRadioayuda("")).toBeNull();
  });

  it("no hay dos radioayudas con el mismo ident", () => {
    /*
      **La regla que hace que un ident en una ruta signifique una cosa sola.** El
      generador descarta los 62 NDB ambiguos —`L` aparece cinco veces, `A` son Ezeiza,
      Reconquista y Tartagal—. Si alguna vez vuelven a entrar, un `A` en una ruta pondría
      un punto a mil kilómetros del que el piloto quiso, sin avisar.
    */
    const idents = allRadioayudas().map((r) => r.ident);
    expect(new Set(idents).size).toBe(idents.length);
  });

  it("todas tienen posición dentro de Argentina", () => {
    for (const r of allRadioayudas()) {
      expect(Number.isFinite(r.lat)).toBe(true);
      expect(Number.isFinite(r.lon)).toBe(true);
      expect(r.lat).toBeGreaterThan(-56);
      expect(r.lat).toBeLessThan(-21);
      expect(r.lon).toBeGreaterThan(-74);
      expect(r.lon).toBeLessThan(-53);
    }
  });

  it("las variaciones caen en el rango real del país", () => {
    /*
      Argentina va de ~18° W en Misiones a ~13° E en Santa Cruz, y estos datos son de
      2007, así que el rango es un poco más ancho. Fuera de ±20° hay un error de unidad o
      de signo, no una estación exótica.
    */
    for (const r of allRadioayudas()) {
      if (r.variacionW === undefined) continue;
      expect(Math.abs(r.variacionW)).toBeLessThanOrEqual(20);
    }
  });

  it("todos los VOR tienen frecuencia de VOR y variación", () => {
    const vors = allRadioayudas().filter((r) => r.tipo.includes("VOR"));
    expect(vors.length).toBe(57);
    for (const v of vors) {
      // Banda VOR: 108,00 a 117,95 MHz.
      expect(v.khz).toBeGreaterThanOrEqual(108000);
      expect(v.khz).toBeLessThanOrEqual(117950);
      // Sin variación no se puede construir un punto por radial, que es para lo que
      // están acá.
      expect(v.variacionW).not.toBeUndefined();
    }
  });

  it("un punto por radial de una estación real cae donde tiene que caer", () => {
    // La prueba de que el directorio y la geometría se hablan: 25 NM en el radial 045
    // de Bariloche tienen que quedar a 25 NM de Bariloche.
    const bar = getRadioayuda("BAR")!;
    const p = puntoPorRadial(bar, 45, 25)!;
    expect(distanciaNmPrecisa(bar.lat, bar.lon, p.lat, p.lon)).toBeCloseTo(25, 3);
  });
});
