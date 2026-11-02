import { describe, expect, it } from "vitest";
import { allFixes, buscarFixes, getFix } from "./fixes";
import { getAirport } from "./airports";
import { getRadioayuda } from "./radioayudas";
import { clasificarToken } from "./puntos";

/**
 * Corre contra el archivo de verdad, no contra un fixture, por el mismo motivo que
 * `radioayudas.test.ts`: lo que puede romperse no es la lógica —treinta líneas de
 * `split("\t")`— sino el dato. `build-fixes.mjs` se vuelve a correr cada ciclo AIRAC, y
 * una columna corrida devuelve una longitud donde iba una latitud sin romper nada
 * visible: el punto cae en otro lado y la planilla se calcula igual.
 */

describe("el catálogo de puntos significativos", () => {
  it("carga los 1018 del ENR 4.4", () => {
    expect(allFixes().length).toBe(1018);
  });

  it("AKNOS está donde dice el AIP", () => {
    // 380005S-0625304W, de la primera página de la tabla.
    const f = getFix("AKNOS")!;
    expect(f.lat).toBeCloseTo(-(38 + 0 / 60 + 5 / 3600), 5);
    expect(f.lon).toBeCloseTo(-(62 + 53 / 60 + 4 / 3600), 5);
    expect(f.rutas).toContain("W67");
  });

  it("el designador se normaliza y el que no existe da null", () => {
    expect(getFix("aknos")?.designador).toBe("AKNOS");
    expect(getFix("  aknos  ")?.designador).toBe("AKNOS");
    expect(getFix("ZZZZZ")).toBeNull();
    expect(getFix("")).toBeNull();
  });

  it("todos son de cinco letras", () => {
    /*
      **La propiedad que permite aceptarlos sin desambiguar.** Si algún día entrara un
      designador de otro largo, dejaría de ser cierto que un token de cinco letras sólo
      puede ser un fix, y la resolución tendría que elegir entre candidatos — que es
      exactamente lo que no queremos que haga sola.
    */
    for (const f of allFixes()) {
      expect(f.designador, f.designador).toMatch(/^[A-Z]{5}$/);
    }
  });

  it("no hay designadores repetidos", () => {
    const d = allFixes().map((f) => f.designador);
    expect(new Set(d).size).toBe(d.length);
  });

  it("ninguno choca con un aeródromo ni con una radioayuda", () => {
    /*
      La comprobación que cierra el argumento de arriba, y contra los catálogos reales en
      vez de contra un razonamiento sobre largos. Si mañana ANAC publica un aeródromo con
      designador de cinco letras, esto se pone rojo antes de que una ruta resuelva mal.
    */
    for (const f of allFixes()) {
      expect(getAirport(f.designador), f.designador).toBeNull();
      expect(getRadioayuda(f.designador), f.designador).toBeNull();
    }
  });

  it("la lista de aerovías nunca queda cortada al medio", () => {
    /*
      El generador recorta a 60 caracteres porque hay puntos con doce aerovías, pero corta
      **por el separador**: un corte crudo dejaba `…SID CBA-STAR CBA-`, con un guión
      colgando y la última aerovía partida, que se lee como un dato incompleto en vez de
      como una lista recortada.
    */
    for (const f of allFixes()) {
      expect(f.rutas, f.designador).not.toMatch(/-\s*$/);
      expect(f.rutas.length, f.designador).toBeLessThanOrEqual(60);
    }
  });

  it("todos caen en la región del AIP argentino", () => {
    /*
      El rango incluye el sector antártico y la FIR oceánica, así que es más ancho que el
      continente: llega a -63° de latitud y a -10° de longitud. Fuera de eso hay un error
      de conversión de grados-minutos-segundos, no un punto exótico.
    */
    for (const f of allFixes()) {
      expect(f.lat, f.designador).toBeGreaterThan(-70);
      expect(f.lat, f.designador).toBeLessThan(-20);
      expect(f.lon, f.designador).toBeGreaterThan(-80);
      expect(f.lon, f.designador).toBeLessThan(-5);
    }
  });

  it("el token de cinco letras clasifica como código", () => {
    // `clasificarToken` acepta de dos a cinco: un fix entra por la misma puerta que un
    // ICAO, y quien resuelve decide contra qué catálogo.
    expect(clasificarToken("AKNOS")).toEqual({ tipo: "codigo", codigo: "AKNOS" });
  });
});

describe("buscarFixes", () => {
  it("busca por prefijo", () => {
    const r = buscarFixes("AKN");
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((f) => f.designador.startsWith("AKN"))).toBe(true);
    expect(r.map((f) => f.designador)).toContain("AKNOS");
  });

  it("viene ordenado alfabéticamente", () => {
    const r = buscarFixes("AL", 50);
    expect(r).toEqual([]);
    const s = buscarFixes("ALG", 50).map((f) => f.designador);
    expect(s).toEqual([...s].sort());
  });

  it("no sugiere con menos de tres letras", () => {
    /*
      Con dos, `DO` devuelve decenas de puntos que no ayudan a elegir y encima compite con
      los designadores ANAC de tres letras en la misma lista.
    */
    expect(buscarFixes("A")).toEqual([]);
    expect(buscarFixes("AK")).toEqual([]);
    expect(buscarFixes("")).toEqual([]);
  });

  it("ignora lo que no son letras", () => {
    expect(buscarFixes("AK1")).toEqual([]);
    expect(buscarFixes("BAR/045")).toEqual([]);
  });

  it("respeta el límite", () => {
    expect(buscarFixes("A", 3).length).toBeLessThanOrEqual(3);
    expect(buscarFixes("AKR", 2).length).toBeLessThanOrEqual(2);
  });
});
