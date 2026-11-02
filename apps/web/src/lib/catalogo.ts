import type { Airport } from "./airports";
import type { Fix } from "./fixes";
import type { FuenteAip } from "./aip";
import type { Radioayuda } from "./puntos";

/**
 * De dónde salen los datos aeronáuticos, sin decir de dónde salen.
 *
 * ## Por qué existe este puerto
 *
 * Porque el mismo algoritmo de resolución de puntos tiene que correr en **dos lados
 * con fuentes distintas**: en el servidor, leyendo los TSV con `fs`; y en el
 * navegador cuando no hay señal, leyendo un JSON precacheado.
 *
 * La alternativa —escribir la resolución dos veces, una "para offline"— es
 * exactamente el error que este repo ya cometió. `splitRoute` llegó a estar escrita
 * **cinco veces**, y la composición de la ficha de aeródromo estuvo duplicada hasta
 * que las dos copias terminaron distintas y una le mostró al piloto una pista de
 * tierra donde ANAC publica asfalto.
 *
 * Dos implementaciones de "resolver un punto" que se separan en silencio significan
 * que **la ruta que planificás sin señal no es la que planificás con señal**. Un
 * puerto con dos adaptadores es la forma barata de que eso no pueda pasar, y
 * `resolucion-puntos.test.ts` corre la misma tabla de casos contra los dos y exige
 * salida idéntica.
 *
 * ## Todo síncrono
 *
 * Ni `fs` ni `fetch` aparecen en esta interfaz. Los dos adaptadores cargan su fuente
 * una vez y arman índices en memoria —es el patrón que ya usan los cuatro catálogos
 * de `src/lib/`—, así que la resolución no tiene por qué ser asíncrona y el
 * algoritmo queda legible de arriba a abajo.
 */
export interface Catalogo {
  /** Por código ICAO o designador ANAC. `null` si no está. */
  aerodromo(codigo: string): Airport | null;
  /** Las sugerencias del autocompletado, en el orden en que se muestran. */
  buscarAerodromos(consulta: string, limite: number): Airport[];
  /** Por ident: `BAR`, `MOR`. */
  radioayuda(ident: string): Radioayuda | null;
  /** Por designador de cinco letras: `DORVO`. */
  fix(designador: string): Fix | null;
  /** Los fixes que empiezan con el prefijo, para el autocompletado. */
  buscarFixes(prefijo: string, limite: number): Fix[];
  /** La secuencia de puntos de una aerovía, o `null` si no está publicada. */
  aerovia(designador: string): string[] | null;
  /**
   * De cuándo es el documento del AIP: `"ENR3.1"`, `"ENR4.4"`.
   *
   * No es un adorno. El AIP se enmienda cada 28 días, y un punto de aerovía sin
   * fecha obliga al piloto a suponer que sigue vigente — y lo que suponga va a ser
   * optimista.
   */
  fuenteAip(clave: string): FuenteAip | null;
}
