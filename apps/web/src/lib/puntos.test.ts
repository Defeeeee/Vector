import { describe, expect, it } from "vitest";
import { clasificarToken, frecuencia, puntoPorRadial, type Radioayuda } from "./puntos";
import { distanciaNmPrecisa } from "./distance";
import { rumboVerdadero } from "./navegacion";

/**
 * Los puntos esperados salen de una implementación aparte del problema directo
 * loxodrómico, escrita en Python desde la fórmula de Bowditch y no desde el TypeScript
 * de acá. Comparar el código contra sí mismo no prueba nada.
 *
 * Las estaciones son las de `navaids.tsv`, con su variación real. **Bariloche tiene
 * variación este** (`variacionW: -8`), que es justo lo que hace que un error de signo se
 * vea: con el signo al revés el punto se va dieciséis grados para el otro lado.
 */

const BAR: Radioayuda = {
  ident: "BAR",
  tipo: "VOR-DME",
  nombre: "San Carlos De Bariloche",
  lat: -41.1403,
  lon: -71.1889,
  khz: 117400,
  variacionW: -8,
  origenVariacion: "slaved",
};

const EZE: Radioayuda = {
  ident: "EZE",
  tipo: "VOR-DME",
  nombre: "Ezeiza",
  lat: -34.8242,
  lon: -58.5353,
  khz: 116500,
  variacionW: 4,
  origenVariacion: "slaved",
};

describe("clasificarToken", () => {
  it("un código de aeródromo o de radioayuda", () => {
    expect(clasificarToken("SADM")).toEqual({ tipo: "codigo", codigo: "SADM" });
    expect(clasificarToken("BAR")).toEqual({ tipo: "codigo", codigo: "BAR" });
    // Los designadores ANAC de dos letras existen: MOR, JUN, y también los de dos.
    expect(clasificarToken("AZ")).toEqual({ tipo: "codigo", codigo: "AZ" });
  });

  it("normaliza a mayúsculas y sin espacios", () => {
    expect(clasificarToken("  sadm ")).toEqual({ tipo: "codigo", codigo: "SADM" });
    expect(clasificarToken("bar/045/25")).toMatchObject({ tipo: "radial", estacion: "BAR" });
    expect(clasificarToken(" bar/045/25 ")).toMatchObject({ canonico: "BAR/045/25" });
    expect(clasificarToken("s34.68/w58.64")).toMatchObject({ tipo: "coordenada" });
  });

  it("una coordenada propia, con hemisferio", () => {
    expect(clasificarToken("S34.68/W58.64")).toEqual({
      tipo: "coordenada",
      lat: -34.68,
      lon: -58.64,
      etiqueta: "S34.68 W58.64",
      canonico: "S34.68/W58.64",
    });
    expect(clasificarToken("N10/E20")).toMatchObject({ tipo: "coordenada", lat: 10, lon: 20 });
  });

  it("la coma NO sirve de decimal, aunque así se escriba acá", () => {
    /*
      **Es la decisión, no un olvido.** Medio país escribe 34,68 y aceptarlo sería lo
      amable — pero la coma es separador entre puntos, así que un `S34,68/W58,64` que se
      tipea bien en su casilla se parte en cuatro puntos de ruta en cuanto la ruta se
      pega entera o vuelve de la URL, que es donde vive el estado de esta pantalla. Un
      formato que se rompe solo al compartir el link es peor que uno que se rechaza de
      entrada.
    */
    expect(clasificarToken("S34,68/W58,64")).toBeNull();
    expect(clasificarToken("BAR/045/25,5")).toBeNull();
    // Con punto, los mismos números entran.
    expect(clasificarToken("S34.68/W58.64")).toMatchObject({ lat: -34.68, lon: -58.64 });
    expect(clasificarToken("BAR/045/25.5")).toMatchObject({ distanciaNm: 25.5 });
  });

  it("rechaza coordenadas fuera del planeta", () => {
    expect(clasificarToken("S91/W58")).toBeNull();
    expect(clasificarToken("S34/W181")).toBeNull();
  });

  it("un punto por radial y distancia", () => {
    expect(clasificarToken("BAR/045/25")).toEqual({
      tipo: "radial",
      estacion: "BAR",
      radial: 45,
      distanciaNm: 25,
      etiqueta: "R-045 25 NM de BAR",
      canonico: "BAR/045/25",
    });
  });

  it("el radial se acepta con o sin los ceros de adelante", () => {
    // Por radio se cantan los tres dígitos, pero nadie los tipea.
    expect(clasificarToken("BAR/45/25")).toMatchObject({ radial: 45 });
    expect(clasificarToken("BAR/045/25")).toMatchObject({ radial: 45 });
    // Y la forma canónica los pone igual, para que la planilla se lea como se canta y
    // para que dos maneras de tipear el mismo punto no den dos puntos distintos.
    expect(clasificarToken("BAR/45/25")).toMatchObject({ canonico: "BAR/045/25" });
  });

  it("el radial 360 es el 000", () => {
    // Los dos se cantan y quieren decir lo mismo. Rechazar 360 sería pedantería.
    expect(clasificarToken("BAR/360/10")).toMatchObject({ radial: 0, canonico: "BAR/000/10" });
    expect(clasificarToken("BAR/000/10")).toMatchObject({ radial: 0, canonico: "BAR/000/10" });
  });

  it("la forma canónica atraviesa parsearRuta sin partirse", () => {
    /*
      **La propiedad que hace que un link compartido abra el mismo plan.** El canónico es
      lo que vuelve a la URL, y `parsearRuta` corta por espacios, comas y guiones: si el
      canónico tuviera cualquiera de los tres, un punto se convertiría en varios al
      recargar. Se comprueba acá y no sólo en `ruta-planificada.test.ts` porque el que
      puede romperlo es este archivo.
    */
    for (const t of ["BAR/45/25", "BAR/045/25.5", "S34.68/W58.64", "N10/E20"]) {
      const token = clasificarToken(t);
      expect(token).not.toBeNull();
      const canonico = (token as { canonico: string }).canonico;
      expect(canonico).not.toMatch(/[\s,\-]/);
      // Y vuelve a clasificar como el mismo punto: la forma canónica es un punto fijo.
      expect(clasificarToken(canonico)).toEqual(token);
    }
  });

  it("rechaza un radial que no existe y una distancia que no es distancia", () => {
    expect(clasificarToken("BAR/400/25")).toBeNull();
    expect(clasificarToken("BAR/045/0")).toBeNull();
  });

  it("rechaza lo que no es ninguna de las tres formas", () => {
    expect(clasificarToken("")).toBeNull();
    expect(clasificarToken("   ")).toBeNull();
    expect(clasificarToken("A")).toBeNull();
    expect(clasificarToken("SADMXX")).toBeNull();
    expect(clasificarToken("SADM/")).toBeNull();
    expect(clasificarToken("BAR/045")).toBeNull();
    expect(clasificarToken("-34.68/-58.64")).toBeNull();
  });
});

describe("puntoPorRadial", () => {
  it("25 NM en el radial 045 de BAR", () => {
    const p = puntoPorRadial(BAR, 45, 25)!;
    expect(p.lat).toBeCloseTo(-40.8897127, 6);
    expect(p.lon).toBeCloseTo(-70.7481782, 6);
  });

  it("los cuatro radiales cardinales de BAR", () => {
    const casos: [number, number, number, number][] = [
      [0, 10, -40.9753665, -71.1581593],
      [90, 30, -41.2098397, -70.5315339],
      [180, 15, -41.3877002, -71.2351563],
      [270, 40, -41.0475805, -72.0643050],
    ];
    for (const [radial, dist, lat, lon] of casos) {
      const p = puntoPorRadial(BAR, radial, dist)!;
      expect(p.lat).toBeCloseTo(lat, 6);
      expect(p.lon).toBeCloseTo(lon, 6);
    }
  });

  it("una estación con variación oeste, para que el signo no sea simétrico", () => {
    const p = puntoPorRadial(EZE, 90, 20)!;
    expect(p.lat).toBeCloseTo(-34.8009635, 6);
    expect(p.lon).toBeCloseTo(-58.1305648, 6);
  });

  it("el punto queda a la distancia pedida", () => {
    /*
      La distancia de vuelta se mide con la ortodrómica de `distanciaNmPrecisa`, así que
      no cierra al infinito: en 25 NM el residuo loxodrómico-ortodrómico es de
      milésimas de milla. La tolerancia está medida, no elegida.
    */
    const p = puntoPorRadial(BAR, 45, 25)!;
    expect(distanciaNmPrecisa(BAR.lat, BAR.lon, p.lat, p.lon)).toBeCloseTo(25, 3);
  });

  it("el rumbo al punto es el radial ya pasado a verdadero", () => {
    // Radial 045 magnético con 8° este de variación son 053° verdaderos.
    const p = puntoPorRadial(BAR, 45, 25)!;
    expect(rumboVerdadero({ lat: BAR.lat, lon: BAR.lon }, p)).toBeCloseTo(53, 6);
  });

  it("la variación se aplica de verdad, y con el signo correcto", () => {
    /*
      **El test que atrapa el bug caro.** Con la variación ignorada el punto quedaría en
      el radial 045 verdadero; con el signo invertido, dieciséis grados para el otro
      lado. Los tres puntos se ven igual de razonables en un mapa: la única forma de
      distinguirlos es medir el rumbo.
    */
    const sinVariacion: Radioayuda = { ...BAR, variacionW: 0 };
    const invertida: Radioayuda = { ...BAR, variacionW: 8 };
    const origen = { lat: BAR.lat, lon: BAR.lon };

    expect(rumboVerdadero(origen, puntoPorRadial(sinVariacion, 45, 25)!)).toBeCloseTo(45, 6);
    expect(rumboVerdadero(origen, puntoPorRadial(BAR, 45, 25)!)).toBeCloseTo(53, 6);
    expect(rumboVerdadero(origen, puntoPorRadial(invertida, 45, 25)!)).toBeCloseTo(37, 6);
  });

  it("dieciséis grados a 25 NM son casi siete millas", () => {
    // Por qué importa el signo, en millas y no en grados.
    const invertida: Radioayuda = { ...BAR, variacionW: 8 };
    const bien = puntoPorRadial(BAR, 45, 25)!;
    const mal = puntoPorRadial(invertida, 45, 25)!;
    expect(distanciaNmPrecisa(bien.lat, bien.lon, mal.lat, mal.lon)).toBeGreaterThan(6.9);
  });

  it("el radial 0 y el 360 dan el mismo punto", () => {
    const a = puntoPorRadial(BAR, 0, 10)!;
    const b = puntoPorRadial(BAR, 360, 10)!;
    expect(b.lat).toBeCloseTo(a.lat, 9);
    expect(b.lon).toBeCloseTo(a.lon, 9);
  });

  it("sin variación de la estación no hay punto", () => {
    /*
      **No se supone cero.** En Argentina la variación va de 12° E a 18° W, así que
      suponerla sería inventar hasta treinta grados de error: trece millas a 25 NM. Un
      punto que no resuelve se ve; uno inventado, no.
    */
    const sinDato: Radioayuda = { ...BAR, variacionW: undefined, origenVariacion: undefined };
    expect(puntoPorRadial(sinDato, 45, 25)).toBeNull();
  });

  it("una distancia que no es distancia no da punto", () => {
    expect(puntoPorRadial(BAR, 45, 0)).toBeNull();
    expect(puntoPorRadial(BAR, 45, -10)).toBeNull();
    expect(puntoPorRadial(BAR, 45, Number.NaN)).toBeNull();
  });
});

describe("frecuencia", () => {
  it("un VOR se canta en MHz con dos decimales", () => {
    expect(frecuencia(117400, "VOR-DME")).toBe("117.40 MHz");
    expect(frecuencia(112900, "VOR")).toBe("112.90 MHz");
  });

  it("un NDB se canta en kHz enteros", () => {
    expect(frecuencia(305, "NDB")).toBe("305 kHz");
    expect(frecuencia(210, "NDB")).toBe("210 kHz");
  });

  it("sin frecuencia no se muestra nada", () => {
    expect(frecuencia(undefined, "VOR")).toBeNull();
    expect(frecuencia(Number.NaN, "VOR")).toBeNull();
  });
});
