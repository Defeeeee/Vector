import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { catalogoServidor } from "./catalogo-servidor";
import { catalogoDesdeJson, type CatalogoSerializado } from "./catalogo-json";
import { resolverPunto } from "./resolucion-puntos";
import { allAerovias } from "./aerovias";
import { armarCatalogo } from "../../scripts/catalogo-fuente";

/**
 * El dispositivo anti-deriva.
 *
 * ## Por qué este archivo es el que importa de toda la Fase 3
 *
 * Porque hay **dos implementaciones del catálogo** —el de disco, en el servidor, y el
 * JSON precacheado que usa el planificador sin señal— y la única forma de que no se
 * separen en silencio es correrles la misma tabla de casos y exigir salida idéntica.
 *
 * Si se separaran, el síntoma sería que **la ruta que planificás sin señal no es la
 * que planificás con señal**: mismas coordenadas escritas, distinto punto resuelto,
 * distinto rumbo en la planilla. Y nadie lo notaría hasta estar volando.
 *
 * Este repo ya sabe cómo termina eso: `splitRoute` llegó a estar escrita cinco veces,
 * y la composición de la ficha de aeródromo estuvo duplicada hasta que una copia le
 * mostró al piloto una pista de tierra donde ANAC publica asfalto.
 */

const JSON_CATALOGO = path.join(process.cwd(), "public", "catalogo-aeronautico.json");
const serializado = JSON.parse(fs.readFileSync(JSON_CATALOGO, "utf8")) as CatalogoSerializado;
const catalogoBordo = catalogoDesdeJson(serializado);

/**
 * Los tokens de las cuatro clases, más los bordes que ya rompieron algo alguna vez.
 *
 * `W67` contiguo está por una razón concreta: BCA→AKNOS no tiene ningún punto en el
 * medio, el tramo viene vacío, y leer `tramo[tramo.length - 1]` reventaba con un 500
 * que dejaba la planilla sin calcular y sin ninguna pista de por qué.
 */
const CASOS: { q: string; desde?: string; hasta?: string; nota: string }[] = [
  { q: "SADM", nota: "aeródromo por ICAO" },
  { q: "GEZ", nota: "aeródromo por designador ANAC (resuelve SRDR)" },
  { q: "sadf", nota: "en minúsculas" },
  { q: "MOR", nota: "código que es aeródromo y radioayuda a la vez: gana el aeródromo" },
  { q: "BAR", nota: "ídem, Bariloche" },
  { q: "BAR/045/25", nota: "punto por radial y distancia" },
  { q: "BAR/45/25", nota: "radial sin el cero de relleno" },
  { q: "S34.68/W58.64", nota: "coordenada propia" },
  /*
    **Un aeródromo sin variación magnética publicada**, que son 31 en el directorio.
    Está en la tabla porque es el caso que un mutante deliberado dejó pasar: leer el
    `null` del JSON como cero en vez de como "no la sabemos". Cero es un valor
    perfectamente válido en Argentina —la línea agónica cruza la Patagonia— así que la
    confusión no falla, **corrige el rumbo con un número inventado**. Acá son 5,7° de
    error silencioso en la planilla.
  */
  { q: "SACI", nota: "aeródromo sin variación magnética: null no es cero" },
  /*
    El único del directorio al que le faltan **las dos** cosas. Vale lo mismo para la
    elevación: cero es el nivel del mar, no "no sabemos a qué altura está", y la
    elevación alimenta la altitud de densidad — o sea el largo de pista que hace falta.
  */
  { q: "SAMP", nota: "aeródromo sin elevación ni variación" },
  { q: "DORVO", nota: "punto significativo del ENR 4.4" },
  { q: "DOR", nota: "prefijo que no resuelve pero sugiere fixes" },
  { q: "W67", desde: "BCA", hasta: "OSA", nota: "aerovía con puntos en el medio" },
  { q: "W67", desde: "BCA", hasta: "AKNOS", nota: "aerovía contigua: el tramo va vacío" },
  { q: "ZZZZ", nota: "código que no existe" },
  { q: "!!", nota: "basura" },
  { q: "", nota: "vacío" },
];

describe("los dos catálogos resuelven igual", () => {
  for (const caso of CASOS) {
    it(`${caso.q || "(vacío)"} — ${caso.nota}`, () => {
      const vecinos = { desde: caso.desde, hasta: caso.hasta };
      const enServidor = resolverPunto(caso.q, vecinos, catalogoServidor);
      const aBordo = resolverPunto(caso.q, vecinos, catalogoBordo);

      /*
        **Igualdad estricta en lo que tiene consecuencia de navegación**: el punto
        resuelto, el punto de salida de la aerovía y el error. Si acá aparece una
        diferencia, la ruta que planificás sin señal dejó de ser la que planificás con
        señal, y eso no se negocia.
      */
      expect(aBordo.punto).toEqual(enServidor.punto);
      expect(aBordo.salida).toEqual(enServidor.salida);
      expect(aBordo.error).toEqual(enServidor.error);

      /*
        Las sugerencias son autocompletado, no navegación, y **sí difieren**: el
        servidor mezcla aeródromos del mundo entero y el de a bordo sólo tiene los
        argentinos, así que rellena esos lugares con más argentinos. Escribir "MOR" da
        `SADM KMOR* AYPY*…` con señal y `SADM SAWP BAI…` sin ella.

        Lo que sí tiene que valer, y es lo que fija este test: **los argentinos que
        propone el servidor son exactamente los primeros que propone el de a bordo, en
        el mismo orden.** Es lo que detectaría que el ranking se separó — que
        `buscarEnIndice` dejó de ser una sola función y volvió a haber dos búsquedas.
      */
      const argentinosDelServidor = enServidor.sugerencias.filter((a) => a.country === "AR");
      const primerosDeBordo = aBordo.sugerencias.slice(0, argentinosDelServidor.length);
      expect(primerosDeBordo.map((a) => a.icao)).toEqual(argentinosDelServidor.map((a) => a.icao));
    });
  }

  it("**el catálogo de a bordo no conoce el mundo, y eso es a propósito**", () => {
    /*
      La única asimetría admitida entre los dos, y por eso está fijada acá: el
      servidor tiene los 17.129 aeródromos del directorio mundial y el de a bordo
      tiene los argentinos. Bajar el resto serían 469 KB comprimidos —diez veces todo
      lo demás junto— para resolver aeródromos de Kazajistán en la plataforma.

      Si alguna vez se decide bajar el mundo entero, este test se pone rojo y obliga a
      pensarlo, en vez de que el cambio pase inadvertido.
    */
    expect(resolverPunto("KJFK", {}, catalogoServidor).punto?.clase).toBe("aerodromo");
    expect(resolverPunto("KJFK", {}, catalogoBordo).punto).toBeNull();
  });
});

describe("el catálogo de a bordo", () => {
  it("resuelve **todos** los puntos de las 220 aerovías publicadas", () => {
    /*
      El mismo invariante que `aerovias.test.ts` garantiza del lado del servidor: una
      aerovía no se publica si alguno de sus puntos no ubica. Sin esto, el generador
      podría olvidarse una columna y el planificador sin señal rompería justo en la
      ruta que el piloto necesitaba.
    */
    const faltantes: string[] = [];
    for (const via of allAerovias()) {
      for (const punto of via.puntos) {
        const r = resolverPunto(punto, {}, catalogoBordo);
        if (!r.punto) faltantes.push(`${via.designador}/${punto}`);
      }
    }
    expect(faltantes).toEqual([]);
  });

  it("está al día con los datos del repo", () => {
    /*
      **El test que atrapa el olvido más probable de todos**: alguien corrige un TSV o
      un parser y no vuelve a generar el catálogo. Sin esto, el planificador sin señal
      seguiría contestando con los datos viejos —incluida una frecuencia o un largo de
      pista ya corregidos— y nadie se enteraría hasta estar sin señal.

      Comparar contra el generador y no contra un hash también cubre el otro caso: que
      alguien haya editado el JSON a mano.
    */
    expect(armarCatalogo()).toEqual(serializado);
  });

  it("rechaza un catálogo de otro esquema en vez de leerlo mal", () => {
    // Un catálogo viejo con las columnas corridas daría coordenadas equivocadas sin
    // fallar. Mejor negarse a leerlo.
    expect(() => catalogoDesdeJson({ ...serializado, esquema: 99 })).toThrow(/esquema/);
  });
});
