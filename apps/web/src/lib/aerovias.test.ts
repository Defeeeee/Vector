import { describe, expect, it } from "vitest";
import { aeroviasPorPunto, allAerovias, puntosDeAerovia } from "./aerovias";
import { esAerovia, salidasDesde, tramoDeAerovia } from "./ruta-planificada";
import { getFix } from "./fixes";
import { getRadioayuda } from "./radioayudas";

/**
 * Contra el archivo de verdad, por el mismo motivo que `fixes.test.ts` y
 * `radioayudas.test.ts`: lo que puede romperse no es la lógica —que se testea aparte con
 * tablas inventadas— sino el dato. Y acá el dato malo es peor que en los otros dos: una
 * aerovía a la que le falta un punto **no falla**, expande una travesía más corta que la
 * real y con pinta de válida.
 */

describe("el catálogo de aerovías", () => {
  const todas = allAerovias();

  it("publica 220 de las 258 que nombra el AIP", () => {
    /*
      Las otras 38 no pasaron la validación cruzada de `build-aerovias.mjs` y **es a
      propósito que no resuelvan**. Este número baja si ANAC publica mejor o si el parser
      mejora; que suba sin que nadie toque el generador sería la señal de que se relajó la
      validación.
    */
    expect(todas.length).toBe(220);
  });

  it("W67 pasa por donde dice el AIP", () => {
    expect(puntosDeAerovia("W67")).toEqual(["BCA", "AKNOS", "OGLER", "OSA"]);
  });

  it("el designador se normaliza y el que no existe da null", () => {
    expect(puntosDeAerovia("w67")).toEqual(["BCA", "AKNOS", "OGLER", "OSA"]);
    expect(puntosDeAerovia("  w67 ")).not.toBeNull();
    expect(puntosDeAerovia("ZZ999")).toBeNull();
    expect(puntosDeAerovia("")).toBeNull();
  });

  it("todas tienen al menos dos puntos", () => {
    // Con uno no hay tramo que expandir y no habría forma de entrar y salir.
    for (const a of todas) expect(a.puntos.length, a.designador).toBeGreaterThanOrEqual(2);
  });

  it("**todos los puntos de todas las aerovías resuelven**", () => {
    /*
      El test que hace publicable a la feature. Un punto que no resuelve rompe la planilla
      entera —`puntosCalculables` devuelve `null` y el plan no se calcula—, así que una
      aerovía con un punto fantasma convierte una ruta válida en una pantalla que dice "no
      reconocemos X" sin que el piloto haya escrito X.

      Se comprueba contra los catálogos reales, que es lo mismo que hace el generador: si
      alguna vez se regeneran los fixes sin regenerar las aerovías, esto lo agarra.
    */
    for (const a of todas) {
      for (const p of a.puntos) {
        const resuelve = getFix(p) !== null || getRadioayuda(p) !== null;
        expect(resuelve, `${a.designador} → ${p}`).toBe(true);
      }
    }
  });

  it("ningún designador se confunde con un punto", () => {
    // `esAerovia` decide por la forma —letra y dígitos—, y ningún fix ni ident la tiene.
    for (const a of todas) {
      expect(esAerovia(a.designador), a.designador).toBe(true);
      expect(getFix(a.designador), a.designador).toBeNull();
      expect(getRadioayuda(a.designador), a.designador).toBeNull();
    }
  });

  it("no repite un punto dos veces seguidas", () => {
    /*
      El AIP repite el punto de corte cuando la tabla sigue en la página siguiente, y el
      generador lo colapsa. Sin eso, la planilla tendría un tramo de cero millas en el
      medio: distancia 0, rumbo indefinido y tiempo cero.
    */
    for (const a of todas) {
      for (let i = 1; i < a.puntos.length; i++) {
        expect(a.puntos[i], `${a.designador} repite ${a.puntos[i]}`).not.toBe(a.puntos[i - 1]);
      }
    }
  });
});

describe("recortar tramos contra el catálogo real", () => {
  it("una aerovía de verdad se recorta de punta a punta", () => {
    expect(tramoDeAerovia(puntosDeAerovia("W67")!, "BCA", "OSA", "W67")).toEqual({
      puntos: ["AKNOS", "OGLER"],
      error: null,
    });
  });

  it("y al revés también", () => {
    expect(tramoDeAerovia(puntosDeAerovia("W67")!, "OSA", "BCA").puntos).toEqual(["OGLER", "AKNOS"]);
  });

  it("desde cualquier punto de una aerovía se puede llegar a todos los demás", () => {
    /*
      La propiedad que hace usable al selector: el segundo desplegable se llena con
      `salidasDesde`, y cada opción tiene que producir un tramo válido. Si alguna no lo
      hiciera, la pantalla ofrecería un destino que después falla.
    */
    for (const a of allAerovias()) {
      const entrada = a.puntos[0];
      for (const salida of salidasDesde(a.puntos, entrada)) {
        const r = tramoDeAerovia(a.puntos, entrada, salida, a.designador);
        // Las de más de 30 puntos las rechaza el tope, y eso es correcto.
        if (r.error) {
          expect(r.error, `${a.designador} ${entrada}→${salida}`).toContain("tope");
          continue;
        }
        // Los puntos del medio nunca incluyen las puntas.
        expect(r.puntos, `${a.designador} ${entrada}→${salida}`).not.toContain(entrada);
        expect(r.puntos, `${a.designador} ${entrada}→${salida}`).not.toContain(salida);
      }
    }
  });

  it("todos los puntos de todos los tramos se pueden ubicar", () => {
    /*
      Si un punto no tiene posición, `puntosCalculables` anula el plan entero: una aerovía
      con un punto fantasma convertiría una ruta válida en una pantalla que dice "no
      reconocemos X" sin que el piloto haya escrito X.
    */
    for (const a of allAerovias()) {
      const r = tramoDeAerovia(a.puntos, a.puntos[0], a.puntos[a.puntos.length - 1], a.designador);
      if (r.error) continue;
      for (const p of r.puntos) {
        expect(getFix(p) ?? getRadioayuda(p), `${a.designador} → ${p}`).not.toBeNull();
      }
    }
  });
});

describe("aeroviasPorPunto", () => {
  it("encuentra las aerovías que pasan por un punto", () => {
    const r = aeroviasPorPunto("AKNOS").map((a) => a.designador);
    expect(r).toContain("W67");
  });

  it("viene ordenado y sin repetir", () => {
    const r = aeroviasPorPunto("EZE").map((a) => a.designador);
    expect(r).toEqual([...r].sort());
    expect(new Set(r).size).toBe(r.length);
  });

  it("un punto que no está en ninguna devuelve vacío", () => {
    expect(aeroviasPorPunto("SADM")).toEqual([]);
    expect(aeroviasPorPunto("")).toEqual([]);
  });

  it("cada aerovía que devuelve realmente contiene el punto", () => {
    for (const p of ["EZE", "AKNOS", "BCA", "DORVO"]) {
      for (const a of aeroviasPorPunto(p)) {
        expect(a.puntos, `${a.designador} debería contener ${p}`).toContain(p);
      }
    }
  });
});
