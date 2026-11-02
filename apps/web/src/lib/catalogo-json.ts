import type { Pista } from "./briefing";
import type { Catalogo } from "./catalogo";
import type { Fix } from "./fixes";
import type { FuenteAip } from "./aip";
import type { Radioayuda } from "./puntos";
/*
  Se importa de `busqueda-aerodromos` y **no de `airports`**: este módulo lo empaqueta
  el service worker, y `airports.ts` abre archivos con `fs`. Es el mismo código —aquél
  lo reexporta— pero por la puerta que existe en el navegador.
*/
import {
  buscarEnIndice,
  construirIndice,
  type Airport,
} from "./busqueda-aerodromos";

/**
 * El `Catalogo` de a bordo: el mismo algoritmo, leyendo un JSON en vez del disco.
 *
 * Lo genera `scripts/build-catalogo.mjs` a `public/catalogo-aeronautico.json`, y lo
 * usa el service worker cuando `/api/puntos` no se puede alcanzar. Que exista es lo
 * que hace que el planificador calcule una ruta sin señal.
 *
 * ## La forma: filas, no objetos
 *
 * Repetir las claves en cada registro llevaría el archivo de ~170 KB a más de 400 KB,
 * y esto es un generado que nadie lee a ojo. Va como filas de arrays con el orden de
 * columnas fijado por los tipos de abajo — la misma forma que ya tienen los TSV de
 * los que sale.
 *
 * ## Lo que este catálogo **no** sabe
 *
 * **Sólo Argentina.** El directorio mundial son 17.129 aeródromos y 469 KB
 * comprimido: diez veces todo lo demás junto. Un código extranjero resuelve con señal
 * y no resuelve sin ella, y eso hay que decirlo en pantalla en vez de dejar al piloto
 * pensando que el punto no existe.
 */

/** Índices de las columnas, para que el orden esté escrito y no contado con el dedo. */
type FilaAerodromo = [
  icao: string,
  name: string,
  city: string,
  country: string,
  size: string,
  iata: string,
  label: string,
  lat: number,
  lon: number,
  elevation: number | null,
  variacionW: number | null,
  pistas: Pista[] | null,
  /*
    El designador de ANAC, cuando difiere del ICAO. **No es opcional aunque lo
    parezca**: sin él, `GEZ` no resolvería a General Rodríguez, y el designador es
    lo que un piloto argentino escribe para los campos sin indicador ICAO.
  */
  local: string | null,
];

type FilaRadioayuda = [
  ident: string,
  tipo: string,
  nombre: string,
  lat: number,
  lon: number,
  khz: number | null,
  variacionW: number | null,
];

type FilaFix = [designador: string, lat: number, lon: number, rutas: string];
/** Los puntos van en una sola cadena separada por espacios: es como se leen. */
type FilaAerovia = [designador: string, puntos: string];
type FilaFuente = [clave: string, documento: string, edicion: string, vigenteDesde: string, url: string];

export interface CatalogoSerializado {
  /**
   * La forma del archivo, no la versión de la app.
   *
   * Sube sólo si cambia el orden de las columnas o se agrega una tabla — o sea, si un
   * catálogo viejo dejaría de poder leerse. Con la versión de la app acá, cada deploy
   * invalidaría un catálogo que no cambió, y el piloto se quedaría sin resolución de
   * puntos hasta volver a tener señal.
   */
  esquema: number;
  aerodromos: FilaAerodromo[];
  radioayudas: FilaRadioayuda[];
  fixes: FilaFix[];
  aerovias: FilaAerovia[];
  fuentes: FilaFuente[];
}

/** La versión de esquema que este código sabe leer. */
export const ESQUEMA_CATALOGO = 1;

function aAerodromo(f: FilaAerodromo): Airport {
  return {
    icao: f[0],
    name: f[1],
    city: f[2],
    country: f[3],
    size: f[4] as Airport["size"],
    iata: f[5],
    label: f[6],
    lat: f[7],
    lon: f[8],
    // `?? undefined` y no `?? 0`: cero es una variación válida en Argentina, y una
    // elevación de cero también existe. El nulo del JSON significa "no la sabemos".
    elevation: f[9] ?? undefined,
    variacionW: f[10] ?? undefined,
    pistas: f[11] ?? undefined,
    local: f[12] ?? undefined,
  };
}

/**
 * Arma los índices una sola vez, igual que los cinco catálogos del servidor.
 *
 * El patrón se copia a propósito de `src/lib/airports.ts`: un `Map` memoizado en el
 * scope del módulo. En el service worker eso importa más que en el servidor — el
 * worker se duerme y despierta seguido, y `JSON.parse` de 170 KB en cada pedido de
 * autocompletado se sentiría al tipear.
 */
export function catalogoDesdeJson(datos: CatalogoSerializado): Catalogo {
  if (datos.esquema !== ESQUEMA_CATALOGO) {
    throw new Error(
      `El catálogo de a bordo es de esquema ${datos.esquema} y este código lee ${ESQUEMA_CATALOGO}.`
    );
  }

  const aerodromos = new Map<string, Airport>();
  for (const fila of datos.aerodromos) {
    const a = aAerodromo(fila);
    aerodromos.set(a.icao.toUpperCase(), a);
    // El designador entra como clave propia, igual que en el índice del servidor:
    // `GEZ` y `SRDR` tienen que devolver el mismo aeródromo.
    if (a.local && a.local !== a.icao) aerodromos.set(a.local.toUpperCase(), a);
  }

  const radioayudas = new Map<string, Radioayuda>();
  for (const f of datos.radioayudas) {
    radioayudas.set(f[0].toUpperCase(), {
      ident: f[0],
      tipo: f[1],
      nombre: f[2],
      lat: f[3],
      lon: f[4],
      khz: f[5] ?? undefined,
      variacionW: f[6] ?? undefined,
    } as Radioayuda);
  }

  const fixes = new Map<string, Fix>();
  for (const f of datos.fixes) fixes.set(f[0].toUpperCase(), { designador: f[0], lat: f[1], lon: f[2], rutas: f[3] });

  const aerovias = new Map<string, string[]>();
  for (const f of datos.aerovias) aerovias.set(f[0].toUpperCase(), f[1].split(" ").filter(Boolean));

  const fuentes = new Map<string, FuenteAip>();
  for (const f of datos.fuentes) {
    fuentes.set(f[0].toUpperCase(), { documento: f[1], edicion: f[2], vigenteDesde: f[3], url: f[4] });
  }

  const indice = construirIndice([...new Set(aerodromos.values())]);
  const listaFixes = [...fixes.values()];

  return {
    aerodromo: (codigo) => aerodromos.get((codigo ?? "").trim().toUpperCase()) ?? null,

    /*
      **La misma búsqueda que el servidor, no una parecida.** `buscarEnIndice` es la
      función que hay detrás de `searchAirports`; acá se le pasa un índice armado con
      los aeródromos del JSON en vez de con los del TSV.

      Escribir una búsqueda propia "más simple para offline" habría hecho que el orden
      de las sugerencias cambiara según hubiera o no señal, y el ranking de `compare`
      —exacto, después prefijo, después texto; y entre iguales, por tamaño y Argentina
      primero— no es de los que se replican de memoria.
    */
    buscarAerodromos: (consulta, limite) => buscarEnIndice(indice, consulta, limite),

    radioayuda: (ident) => radioayudas.get((ident ?? "").trim().toUpperCase()) ?? null,
    fix: (designador) => fixes.get((designador ?? "").trim().toUpperCase()) ?? null,

    buscarFixes: (prefijo, limite) => {
      const p = (prefijo ?? "").trim().toUpperCase();
      if (!p) return [];
      return listaFixes.filter((f) => f.designador.startsWith(p)).slice(0, limite);
    },

    aerovia: (designador) => aerovias.get((designador ?? "").trim().toUpperCase()) ?? null,
    fuenteAip: (clave) => fuentes.get((clave ?? "").trim().toUpperCase()) ?? null,
  };
}
