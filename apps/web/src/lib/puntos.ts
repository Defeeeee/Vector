import { puntoDesde } from "./navegacion";

/**
 * Qué puede ser un punto de una ruta, más allá de un aeródromo.
 *
 * Hasta acá el planificador sólo aceptaba códigos de aeródromo. Un vuelo VFR de travesía
 * se planifica con más cosas: la radioayuda que se sintoniza en el camino, un punto
 * definido por radial y distancia desde un VOR, y sobre todo **el punto visual que no
 * está en ninguna base** — el pueblo, el cruce de rutas, la laguna.
 *
 * ## Los cuatro tipos de token
 *
 * | Se escribe | Es |
 * |---|---|
 * | `SADM`, `MOR` | aeródromo, por ICAO o designador ANAC |
 * | `BAR`, `CBA` | radioayuda (VOR/VOR-DME, y NDB de ident único) |
 * | `DORVO`, `AKNOS` | punto significativo del AIP: siempre cinco letras |
 * | `S34.68/W58.64` | un punto propio, por coordenada |
 * | `BAR/045/25` | 25 NM en el radial 045 de BAR |
 *
 * Los tres primeros son "un código" para esta función: **acá sólo se decide la forma, no
 * contra qué catálogo resuelve**. Que un token de cinco letras sólo pueda ser un fix es
 * una propiedad de los datos —los códigos de aeródromo tienen tres o cuatro caracteres y
 * los idents de radioayuda, tres— y quien la usa es `/api/puntos`.
 *
 * La barra separa **adentro** de un punto; los espacios, comas y guiones separan **entre**
 * puntos. Por eso las coordenadas no se escriben `-34.68,-58.64`: la coma partiría el
 * punto en dos, y el signo menos también.
 *
 * Y por eso mismo **el decimal es el punto, nunca la coma**, aunque medio país escriba
 * los números con coma. No es pereza: aceptarla en el campo y no en el resto sería tener
 * dos gramáticas. `S34,68/W58,64` sobrevive mientras se tipea en su casilla, pero
 * `parsearRuta` lo parte en cuatro puntos de ruta en cuanto la ruta se pega entera o
 * vuelve de la URL — que es donde vive el estado de esta pantalla. Un formato que se
 * rompe solo al compartir el link es peor que uno que se rechaza de entrada.
 *
 * ## El radial es magnético, y no del año que corre
 *
 * Ésta es la parte delicada. **Un radial de VOR está referido a la variación con la que
 * la estación fue alineada**, no a la de hoy. Las estaciones se realinean cada muchos
 * años: OurAirports publica Bariloche con 8,0° E, y el modelo actual da 5,4° E. Casi tres
 * grados, que a 25 NM son **más de una milla** de error lateral.
 *
 * Por eso la conversión usa la variación **de la estación** (`variacionW` de
 * `navaids.tsv`, que sale de `slaved_variation_deg`) y no la del aeródromo ni la del WMM.
 */

export interface Radioayuda {
  ident: string;
  tipo: string;
  nombre: string;
  lat: number;
  lon: number;
  /** Frecuencia en kHz, tal como la publica la fuente. */
  khz?: number;
  /**
   * Variación **de la estación**, en grados oeste positivos. Es a la que están
   * referidos sus radiales. `undefined` si la fuente no la publica: sin ella no se puede
   * construir un punto por radial, y no se inventa.
   */
  variacionW?: number;
  /** `"slaved"` si es la alineación real de la estación; `"modelo"` si es un respaldo. */
  origenVariacion?: string;
}

export type Punto = { lat: number; lon: number };

/**
 * `etiqueta` es cómo se muestra; **`canonico` es cómo se escribe**, y son cosas
 * distintas. El canónico es el que vuelve al campo, a la URL y a la ruta pegada, así que
 * tiene que atravesar `parsearRuta` sin partirse: sin espacios, sin comas y sin guiones.
 * El de la etiqueta puede tener los tres, porque sólo se lee.
 *
 * De paso normaliza: `BAR/45/25` y `BAR/045/25` son el mismo punto y quedan escritos
 * igual, que es como se canta por radio.
 */
export type TokenRuta =
  | { tipo: "codigo"; codigo: string }
  | { tipo: "coordenada"; lat: number; lon: number; etiqueta: string; canonico: string }
  | {
      tipo: "radial";
      estacion: string;
      radial: number;
      distanciaNm: number;
      etiqueta: string;
      canonico: string;
    };

/**
 * Qué clase de punto es un token de la ruta.
 *
 * **No resuelve nada**: no sabe si `BAR` existe ni dónde queda. Sólo dice de qué forma es.
 * La resolución necesita el directorio, que vive en el servidor.
 */
export function clasificarToken(token: string): TokenRuta | null {
  const t = (token ?? "").trim().toUpperCase();
  if (!t) return null;

  // BAR/045/25 — radial y distancia. El radial va de 3 dígitos como se canta por radio.
  const radial = /^([A-Z0-9]{2,5})\/(\d{1,3})\/(\d{1,3}(?:\.\d+)?)$/.exec(t);
  if (radial) {
    const grados = Number(radial[2]);
    const distancia = Number(radial[3]);
    // Un radial va de 0 a 360; 360 y 0 son el mismo y los dos se cantan.
    if (grados > 360 || !(distancia > 0)) return null;
    const tresDigitos = String(grados % 360).padStart(3, "0");
    return {
      tipo: "radial",
      estacion: radial[1],
      radial: grados % 360,
      distanciaNm: distancia,
      etiqueta: `R-${tresDigitos} ${distancia} NM de ${radial[1]}`,
      canonico: `${radial[1]}/${tresDigitos}/${distancia}`,
    };
  }

  // S34.68/W58.64 — coordenada propia. Con hemisferio y no con signo, porque el menos
  // es separador de puntos y partiría el token.
  const coord = /^([NS])(\d{1,2}(?:\.\d+)?)\/([EW])(\d{1,3}(?:\.\d+)?)$/.exec(t);
  if (coord) {
    const lat = Number(coord[2]) * (coord[1] === "S" ? -1 : 1);
    const lon = Number(coord[4]) * (coord[3] === "W" ? -1 : 1);
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return {
      tipo: "coordenada",
      lat,
      lon,
      etiqueta: `${coord[1]}${coord[2]} ${coord[3]}${coord[4]}`,
      canonico: `${coord[1]}${coord[2]}/${coord[3]}${coord[4]}`,
    };
  }

  // Lo demás es un código: aeródromo o radioayuda.
  if (/^[A-Z0-9]{2,5}$/.test(t)) return { tipo: "codigo", codigo: t };

  return null;
}

/**
 * El punto que define un radial y una distancia desde una estación.
 *
 * `null` cuando la estación no publica su variación: sin ella no se puede pasar el radial
 * de magnético a verdadero, y **suponer cero sería inventar un punto** — en Argentina la
 * variación va de 12° E a 18° W, así que el error puede pasar los treinta grados, que a
 * 25 NM son trece millas.
 */
export function puntoPorRadial(
  estacion: Radioayuda,
  radialMagnetico: number,
  distanciaNm: number
): Punto | null {
  if (estacion.variacionW === undefined) return null;
  if (!(distanciaNm > 0)) return null;

  /*
    De magnético a verdadero: se **resta** la variación oeste. Es la inversa exacta de
    `aMagnetico` en `navegacion.ts`, la misma que usa el parser de pistas de MADHEL.
  */
  const rumboT = ((radialMagnetico - estacion.variacionW) % 360 + 360) % 360;

  return puntoDesde({ lat: estacion.lat, lon: estacion.lon }, rumboT, distanciaNm);
}

/**
 * Cómo se muestra una frecuencia. La fuente la da en kHz para todo.
 *
 * Un VOR en 117400 kHz se canta "117.40"; un NDB en 305 kHz se canta "305". Mostrar
 * `117400 kHz` sería técnicamente cierto y operativamente inútil.
 */
export function frecuencia(khz: number | undefined, tipo: string): string | null {
  if (khz === undefined || !Number.isFinite(khz)) return null;
  if (tipo.includes("VOR") || tipo.includes("DME")) return `${(khz / 1000).toFixed(2)} MHz`;
  return `${Math.round(khz)} kHz`;
}
