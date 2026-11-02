import type { Airport } from "./airports";
import type { Catalogo } from "./catalogo";
import type { ClasePunto } from "./ruta-planificada";
import { esAerovia, tramoDeAerovia } from "./ruta-planificada";
import { clasificarToken, frecuencia, puntoPorRadial } from "./puntos";

/**
 * Resolver un token de ruta a un punto con coordenadas. **El algoritmo, sin la
 * fuente de datos.**
 *
 * ## De dónde salió esto
 *
 * Vivía adentro de `src/app/api/puntos/route.ts`, mezclado con el parseo de la query
 * y el armado de la respuesta HTTP. Ahí no se podía testear —el archivo arrastra
 * `next/server`— y, peor, **no se podía correr en el navegador**, que es lo que hace
 * falta para que el planificador funcione sin señal.
 *
 * Salió entero y con sus comentarios, que son la mitad del valor: la precedencia, por
 * qué el radial va contra la estación, y por qué los puntos que no son aeródromo no
 * traen variación. Lo que cambió es de dónde vienen los datos: ahora entran por el
 * puerto `Catalogo` en vez de por seis imports con `fs` detrás.
 *
 * ## Lo que no está acá
 *
 * La gramática de tokens (`clasificarToken`) y la trigonometría (`puntoPorRadial`,
 * `puntoDesde`) siguen en `lib/puntos.ts` y `lib/navegacion.ts`, que ya eran puras y
 * ya estaban testeadas. Este archivo es la **composición**: qué se prueba primero,
 * qué gana, y qué se devuelve.
 */

export type { ClasePunto };

export interface PuntoResuelto {
  /** El token tal como se tipeó, normalizado. Es lo que vuelve a la URL. */
  codigo: string;
  clase: ClasePunto;
  label: string;
  lat: number;
  lon: number;
  variacionW?: number;
  elevacionFt?: number;
  pistas?: { le: string; he: string; rumboT: number; largoFt?: number; superficie?: string; fuente?: "medida" | "estimada" }[];
  /** Qué sintonizar. Sólo en los puntos que nacen de una radioayuda. */
  estacion?: { ident: string; tipo: string; nombre: string; frecuencia: string | null };
  /** Las aerovías del punto significativo: `W67-SID BCA`. Sólo en los `fix`. */
  rutas?: string;
  /**
   * Los puntos que aporta una aerovía, ya resueltos y en orden. Sólo en `clase: "aerovia"`.
   *
   * **No incluye el punto de entrada**, que ya está en la ruta: repetirlo daría un tramo
   * de cero millas en el medio de la planilla.
   */
  tramo?: PuntoResuelto[];
  /**
   * De cuándo es el dato, cuando sale del AIP. El AIP se enmienda cada 28 días, así que
   * un punto de aerovía sin fecha obliga al piloto a suponer que está vigente.
   */
  vigencia?: { documento: string; edicion: string; vigenteDesde: string; url: string };
}

/**
 * Un código a un punto: **aeródromo, radioayuda, punto significativo**, en ese orden.
 *
 * El orden importa sólo en el primer escalón —`BAR` es Bariloche aeródromo y no el VOR,
 * ver arriba—; entre radioayuda y fix no hay competencia posible: los idents de radioayuda
 * tienen tres caracteres como máximo y los designadores de fix son **exactamente cinco**.
 * Está verificado contra los catálogos reales en `fixes.test.ts`, no razonado.
 *
 * Vive como función aparte porque la usan dos caminos: el token que el piloto escribe y
 * cada punto que aporta una aerovía. Cuando eso estaba escrito dos veces —era el caso de
 * la composición de la ficha de aeródromo— las dos copias terminaron distintas.
 */
function resolverCodigo(codigo: string, catalogo: Catalogo): PuntoResuelto | null {
  const aeropuerto = catalogo.aerodromo(codigo);
  if (aeropuerto?.lat !== undefined && aeropuerto?.lon !== undefined) {
    return {
      codigo,
      clase: "aerodromo",
      label: aeropuerto.label,
      lat: aeropuerto.lat,
      lon: aeropuerto.lon,
      variacionW: aeropuerto.variacionW,
      elevacionFt: aeropuerto.elevation,
      pistas: aeropuerto.pistas,
    };
  }

  const estacion = catalogo.radioayuda(codigo);
  if (estacion) {
    return {
      codigo,
      clase: "radioayuda",
      label: estacion.nombre,
      lat: estacion.lat,
      lon: estacion.lon,
      estacion: {
        ident: estacion.ident,
        tipo: estacion.tipo,
        nombre: estacion.nombre,
        frecuencia: frecuencia(estacion.khz, estacion.tipo),
      },
    };
  }

  const fix = catalogo.fix(codigo);
  if (fix) {
    const fuente = catalogo.fuenteAip("ENR4.4");
    return {
      codigo,
      clase: "fix",
      // El designador **es** el nombre: un fix no tiene otro. Se muestran las aerovías al
      // lado, que es lo que le dice al piloto dónde está parado.
      label: fix.rutas || "Punto significativo",
      lat: fix.lat,
      lon: fix.lon,
      rutas: fix.rutas,
      vigencia: fuente
        ? { documento: "ENR 4.4", edicion: fuente.edicion, vigenteDesde: fuente.vigenteDesde, url: fuente.url }
        : undefined,
    };
  }

  return null;
}

/** Lo que contesta `/api/puntos`, armado sin saber que existe HTTP. */
export interface Resolucion {
  punto: PuntoResuelto | null;
  /**
   * El punto de salida de una aerovía, ya resuelto. Sólo cuando el token es aerovía.
   *
   * Viaja aparte porque **la banda de aerovía se come su casillero**: el punto de
   * salida se elige en un desplegable y no tiene campo propio, así que nadie lo
   * resolvía y la planilla se quedaba sin calcular sin decir por qué.
   */
  salida?: PuntoResuelto;
  sugerencias: Airport[];
  error?: string | null;
}

/**
 * El token que el piloto escribió, a punto de ruta.
 *
 * `desde` y `hasta` sólo hacen falta para las aerovías, que son **el único token que
 * no se resuelve solo**: necesitan saber por dónde se entra y por dónde se sale, y
 * eso lo sabe el planificador, que conoce los vecinos del token en la ruta.
 */
export function resolverPunto(
  consulta: string,
  vecinos: { desde?: string; hasta?: string },
  catalogo: Catalogo
): Resolucion {
  const q = (consulta ?? "").trim();
  if (!q) return { punto: null, sugerencias: [] };

  const desde = (vecinos.desde ?? "").trim().toUpperCase();
  const hasta = (vecinos.hasta ?? "").trim().toUpperCase();

  if (esAerovia(q)) return resolverAerovia(q, desde, hasta, catalogo);

  const token = clasificarToken(q);
  if (!token) return { punto: null, sugerencias: [] };

  if (token.tipo === "coordenada") {
    return {
      punto: {
        codigo: token.canonico,
        clase: "coordenada",
        label: token.etiqueta,
        lat: token.lat,
        lon: token.lon,
      },
      sugerencias: [],
    };
  }

  if (token.tipo === "radial") {
    const estacion = catalogo.radioayuda(token.estacion);
    if (!estacion) return { punto: null, sugerencias: [] };

    const p = puntoPorRadial(estacion, token.radial, token.distanciaNm);
    // `null` cuando la estación no publica su variación. No se supone cero: ver
    // `lib/puntos.ts`.
    if (!p) return { punto: null, sugerencias: [] };

    return {
      punto: {
        codigo: token.canonico,
        clase: "radial",
        label: token.etiqueta,
        lat: p.lat,
        lon: p.lon,
        estacion: {
          ident: estacion.ident,
          tipo: estacion.tipo,
          nombre: estacion.nombre,
          frecuencia: frecuencia(estacion.khz, estacion.tipo),
        },
      },
      sugerencias: [],
    };
  }

  const codigo = token.codigo;
  const sugerencias = catalogo.buscarAerodromos(codigo, 8);

  const punto = resolverCodigo(codigo, catalogo);
  if (punto) return { punto, sugerencias };

  /*
    Sin resolver. Las sugerencias suman los fixes que empiezan igual: alguien que
    escribió `DOR` a lo mejor va a `DORVO`, y sin esto no tendría forma de
    descubrirlo — un designador de cinco letras no se adivina.
  */
  const porPrefijo: Airport[] = catalogo.buscarFixes(codigo, 6).map((f) => ({
    icao: f.designador,
    name: f.designador,
    city: "",
    country: "AR",
    size: "S" as const,
    iata: "",
    label: f.rutas || "Punto significativo",
    lat: f.lat,
    lon: f.lon,
  }));

  return { punto: null, sugerencias: [...sugerencias, ...porPrefijo] };
}

function resolverAerovia(
  q: string,
  desde: string,
  hasta: string,
  catalogo: Catalogo
): Resolucion {
  const secuencia = catalogo.aerovia(q);
  if (!secuencia) return { punto: null, sugerencias: [], error: null };

  const { puntos, error } = tramoDeAerovia(secuencia, desde, hasta, q);
  if (error) return { punto: null, sugerencias: [], error };

  // Cada punto del tramo se resuelve como cualquier otro. Si alguno no resolviera, la
  // aerovía no se publicaría — lo garantiza `aerovias.test.ts` — así que esto no
  // silencia nada: sólo evita un `null` que rompería la planilla entera.
  const tramo = puntos
    .map((p) => resolverCodigo(p, catalogo))
    .filter((p): p is PuntoResuelto => p !== null);
  if (tramo.length !== puntos.length) {
    return { punto: null, sugerencias: [], error: `No pudimos ubicar todos los puntos de ${q}.` };
  }

  /*
    La posición nominal de la aerovía es la de su punto de salida: es donde deja al
    avión. **No se toma del último punto del tramo**, y eso es lo que arregla el caso
    contiguo: `W67` de BCA a AKNOS no tiene ningún punto en el medio, el tramo viene
    vacío y leer `tramo[tramo.length - 1].lat` reventaba con un 500. La ruta se quedaba
    sin calcular y en la pantalla no había ninguna pista de por qué.
  */
  const salida = resolverCodigo(hasta, catalogo);
  if (!salida) return { punto: null, sugerencias: [], error: `No pudimos ubicar ${hasta}.` };

  const fuente = catalogo.fuenteAip("ENR3.1");
  const punto: PuntoResuelto = {
    codigo: q,
    clase: "aerovia",
    label: `vía ${q}`,
    lat: salida.lat,
    lon: salida.lon,
    tramo,
    vigencia: fuente
      ? { documento: "ENR 3", edicion: fuente.edicion, vigenteDesde: fuente.vigenteDesde, url: fuente.url }
      : undefined,
  };
  return { punto, salida, sugerencias: [], error: null };
}
