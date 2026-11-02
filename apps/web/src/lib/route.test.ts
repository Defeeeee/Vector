import { describe, expect, it } from "vitest";
import { splitRoute } from "./route";

/**
 * Los tres formatos existen todos en la base, guardados en distintas épocas y
 * por distintas puertas. Ninguno se puede dejar de leer.
 */
describe("splitRoute", () => {
  it("lee el formato que escribe el formulario hoy", () => {
    expect(splitRoute("SADF SADM")).toEqual(["SADF", "SADM"]);
  });

  it("lee el formato viejo con guion", () => {
    expect(splitRoute("SADF-SADM")).toEqual(["SADF", "SADM"]);
    expect(splitRoute("SADF - SADM")).toEqual(["SADF", "SADM"]);
  });

  it("normaliza a mayúsculas", () => {
    expect(splitRoute("sadf sadm")).toEqual(["SADF", "SADM"]);
  });

  /**
   * El caso que separa esta función de la del formulario: un circuito local
   * trae un solo código y el destino queda vacío **a propósito**. Repetirlo
   * haría que las agregaciones contaran ese aeródromo dos veces y que un vuelo
   * local figurara como travesía consigo mismo.
   */
  it("no inventa un destino en un circuito local", () => {
    expect(splitRoute("SADF")).toEqual(["SADF", ""]);
    expect(splitRoute("SADF", "???")).toEqual(["SADF", "???"]);
  });

  it("devuelve el fallback pedido cuando no hay ruta", () => {
    expect(splitRoute("")).toEqual(["", ""]);
    expect(splitRoute(undefined)).toEqual(["", ""]);
    expect(splitRoute("   ", "???")).toEqual(["???", "???"]);
  });

  it("aguanta separadores repetidos y espacios de más", () => {
    expect(splitRoute("  SADF   SADM  ")).toEqual(["SADF", "SADM"]);
    expect(splitRoute("SADF--SADM")).toEqual(["SADF", "SADM"]);
  });

  it("ignora un tercer código en vez de romperse", () => {
    expect(splitRoute("SADF SADM SAEZ")).toEqual(["SADF", "SADM"]);
  });
});

/**
 * `distanceTotals` vive en summary.ts pero se prueba acá junto al resto de la
 * lectura de rutas: lo que valida es cómo se comporta ante una ruta que no se
 * puede medir, no la trigonometría —eso está en distance.test.ts—.
 */
import { distanceTotals } from "./summary";

describe("distanceTotals", () => {
  const coords = {
    SADF: { lat: -34.4545, lon: -58.5909 },
    SAEZ: { lat: -34.8222, lon: -58.5358 },
    SINPOS: {},
  };
  const vuelo = (route: string) => ({ route }) as any;

  it("suma tramo por tramo", () => {
    const { totalNm } = distanceTotals([vuelo("SADF SAEZ"), vuelo("SAEZ SADF")], coords);
    expect(totalNm).toBeGreaterThan(40);
  });

  it("cuenta cero para un circuito local, que es lo correcto", () => {
    expect(distanceTotals([vuelo("SADF SADF")], coords).totalNm).toBe(0);
  });

  /** Un total al que le faltan tramos y no lo dice es peor que no mostrarlo. */
  it("no estima los tramos sin posición y avisa cuántos quedaron afuera", () => {
    const r = distanceTotals([vuelo("SADF SINPOS"), vuelo("SADF SAEZ")], coords);
    expect(r.sinPosicion).toBe(1);
    expect(r.totalNm).toBeGreaterThan(0);
  });

  it("guarda el tramo más largo", () => {
    const r = distanceTotals([vuelo("SADF SAEZ"), vuelo("SADF SADF")], coords);
    expect(r.masLargo).toBeGreaterThan(0);
  });
});

describe("distanceTotals con vuelos locales", () => {
  const coords = { SADF: { lat: -34.4545, lon: -58.5909 }, SAEZ: { lat: -34.8222, lon: -58.5358 } };
  const vuelo = (route: string, duration: number) => ({ route, duration }) as any;

  /**
   * Lo medido y lo estimado no se mezclan nunca. Un total mitad real y mitad
   * inventado, sin que se note, es peor que no tener total.
   */
  it("estima el local aparte y no lo suma al medido", () => {
    const r = distanceTotals([vuelo("SADF SADF", 1.0), vuelo("SADF SAEZ", 0.5)], coords);
    expect(r.estimadasNm).toBe(63);
    expect(r.totalNm).toBeGreaterThan(15);
    expect(r.totalNm).toBeLessThan(30);
  });

  it("trata una ruta de un solo código como local", () => {
    expect(distanceTotals([vuelo("SADF", 1.0)], coords).estimadasNm).toBe(63);
  });

  it("no estima un local demasiado corto", () => {
    expect(distanceTotals([vuelo("SADF SADF", 0.3)], coords).estimadasNm).toBe(0);
  });
});
