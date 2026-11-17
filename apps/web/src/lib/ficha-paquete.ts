import { componerFicha, type CartaAip, type DatosAip } from "./aip-compuesta";
import type { Airport } from "./busqueda-aerodromos";
import type { FichaAnac, MadhelData } from "./ficha-anac";

/**
 * La ficha de un aeródromo **armada con el paquete de datos** (`lib/sin-senal.ts`), para cuando no
 * hay señal y no hay una ficha guardada de ese aeródromo (3.47.0, Federico: «la ficha de los
 * aeródromos no carga sin señal: pistas, CTAF»).
 *
 * Con señal, la ficha sale de `POST /api/notams`: el servidor junta el AIP con MADHEL y le suma los
 * NOTAM que trajo el navegador. Sin señal eso no se puede, pero **el AIP y las fichas de MADHEL son
 * archivos del repo** (`aip-*.tsv`, `madhel-fichas.tsv`, `frecuencias-zona.tsv`): el servidor los
 * junta una vez al armar el paquete **con la misma `componerFicha`** (el AIP manda donde publica,
 * MADHEL llena el resto) y la ficha de acá es lo que ya estaba compuesto.
 *
 * ## Lo que trae y lo que no
 *
 * - Trae: pistas, frecuencias del AIP, **el canal de llamada** de los no controlados (el de MADHEL, o
 *   el de la lista de la zona, **que no es del AIP y lo dice**), combustible, ubicación, cartas del
 *   AIP con su edición, y lo de MADHEL que el directorio ya tenía (uso, control, provincia, estado).
 * - **No trae NOTAM**: `notams: null`, que no es `[]` (invariante 2). La pantalla dice "NOTAM no
 *   disponibles", nunca "no hay".
 * - **No trae teléfonos ni normas particulares**: la copia completa de MADHEL vive en el VPS y no en
 *   el repo, que es público (trae teléfonos de aeródromos privados). Ni acá ni en el paquete.
 *
 * Puro: corre en el servidor (arma el paquete) y en el service worker (lo lee).
 */

/** La ficha de un aeródromo ya compuesta. Va en el paquete, por `icao`. */
export interface FichaDePaquete {
  runways: string[];
  radio: string[];
  localization: string;
  fuel: string;
  aip: { edicion: string; vigenteDesde: string; url: string } | null;
  cartas: CartaAip[];
}

/** Lo que el servidor tiene de MADHEL para un aeródromo (`madhel-fichas.tsv` y `frecuencias-zona.tsv`). */
export interface DeMadhelParaPaquete {
  combustible: string;
  pistas: string[];
  canal: { mhz: string[]; fuente: "madhel" | "lista" } | null;
}

/**
 * La línea de radio del canal de llamada de un aeródromo no controlado. El de MADHEL se dice como lo
 * dice la ficha con señal ("Frecuencia común"); el de la lista de la zona **aclara que no es del AIP**.
 */
export function lineaDeCanal(canal: { mhz: string[]; fuente: "madhel" | "lista" }): string {
  const mhz = canal.mhz.join(" / ");
  return canal.fuente === "madhel"
    ? `Frecuencia común: ${mhz} MHz`
    : `Canal de llamada: ${mhz} MHz (de la lista de la zona; no es del AIP, confirmalo)`;
}

/**
 * La ficha compuesta de un aeródromo, o `null` si no hay nada que mostrar (ni pistas, ni frecuencias,
 * ni combustible, ni ubicación, ni cartas): no se guarda una ficha vacía.
 */
export function fichaParaPaquete(aip: DatosAip | null, madhel: DeMadhelParaPaquete | undefined): FichaDePaquete | null {
  const ficha = componerFicha(
    {
      runways: madhel?.pistas ?? [],
      radio: madhel?.canal ? [lineaDeCanal(madhel.canal)] : [],
      localization: "",
      fuel: madhel?.combustible ?? "",
      telephone: [],
    },
    aip,
  );
  const cartas = aip?.cartas ?? [];
  if (!ficha.runways.length && !ficha.radio.length && !ficha.localization && !ficha.fuel && !cartas.length) return null;
  return {
    runways: ficha.runways,
    radio: ficha.radio,
    localization: ficha.localization,
    fuel: ficha.fuel,
    aip: ficha.aip,
    cartas,
  };
}

/**
 * La ficha como la espera la pantalla (`FichaAnac`), armada con el paquete. `notams` es `null` y la
 * ficha lleva `fichaDelPaquete` con la versión de lo guardado.
 */
export function fichaAnacDelPaquete(aeropuerto: Airport, ficha: FichaDePaquete | undefined, version: string): FichaAnac {
  const m = aeropuerto.madhel;
  const madhel: MadhelData = {
    name: aeropuerto.icao,
    fullName: aeropuerto.name,
    state: m?.province ?? "",
    fir: "",
    elevation: m?.elevationM ?? 0,
    condition: m?.condition ?? "",
    control: m?.controlled === true ? "CONTROLLED" : m?.controlled === false ? "NON-CONTROLLED" : "",
    traffic: "",
    status: m?.status || "OK",
    runways: ficha?.runways ?? [],
    radio: ficha?.radio ?? [],
    localization: ficha?.localization ?? "",
    fuel: ficha?.fuel || "No especificado",
    telephone: [],
    particularNorms: "",
    generalNorms: "",
    aip: ficha?.aip ?? null,
    cartas: ficha?.cartas ?? [],
  };
  return {
    icao: aeropuerto.icao,
    indicator: aeropuerto.local ?? aeropuerto.icao,
    madhel,
    notams: null,
    notamsFuente: null,
    fichaDelPaquete: { version },
  };
}

/** Lo que dice la franja de arriba de la ficha armada con el paquete. */
export function textoFichaDelPaquete(version: string): string {
  return `SIN SEÑAL · Ficha guardada en el teléfono (Vector ${version}): pistas, frecuencias y combustible del AIP y de MADHEL, sin teléfonos ni normas particulares. Pueden haber cambiado: confirmalas en el AIP antes de volar.`;
}

/** Lo que dice la ficha donde irían los NOTAM cuando no se pudieron consultar por falta de señal. */
export const TEXTO_NOTAM_SIN_SENAL =
  "SIN SEÑAL · NOTAM no disponibles: no se pudieron consultar. Revisalos en ais.anac.gob.ar antes de volar.";

/**
 * El aeródromo que pide la barra de direcciones (`?icao=SADM`), o `null`. Sin señal el service worker
 * sirve la pantalla de Aeropuertos guardada **sin** query (`urlSinQuery`, `lib/pwa.ts`), así que el
 * aeródromo pedido —del buscador ⌘K o de un link— se lee acá, en el navegador. Mismo formato que valida
 * el servidor (3 o 4 letras o cifras).
 */
export function icaoDeLaUrl(search: string): string | null {
  const pedido = new URLSearchParams(search).get("icao")?.trim().toUpperCase() ?? "";
  return /^[A-Z0-9]{3,4}$/.test(pedido) ? pedido : null;
}
