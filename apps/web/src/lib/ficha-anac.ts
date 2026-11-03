import { componerFicha, type DatosAip } from "./aip";

/**
 * Lo que devuelve `/api/notams`: la ficha de MADHEL (completada con el AIP) y los NOTAM de
 * un aeródromo, leídos de lo que contestó ANAC. Sólo servidor (`componerFicha` vive en
 * `aip.ts`, que lee el disco).
 *
 * Separado de la ruta porque ahora lo que contestó ANAC puede llegar de dos lados: de un
 * pedido del servidor (el mail del briefing) o **del navegador del piloto**, que es el que
 * ANAC no bloquea (`lib/anac-navegador.ts`). Las dos se leen igual.
 */
export interface NotamItem {
  code: string;
  from: string;
  to: string;
  textRaw: string;
  textEsp: string;
}

export interface MadhelData {
  name: string;
  fullName: string;
  state: string;
  fir: string;
  elevation: number;
  condition: string;
  control: string;
  traffic: string;
  status: string;
  runways: string[];
  radio: string[];
  localization: string;
  fuel: string;
  telephone: string[];
  particularNorms: string;
  generalNorms: string;
  /** De dónde salió lo de arriba, y de cuándo es. `null` cuando todo vino de MADHEL. */
  aip: { edicion: string; vigenteDesde: string; url: string } | null;
  /** Las cartas oficiales del AIP, con su edición. Vacío si el aeródromo no tiene. */
  cartas: { letra: string; titulo: string; edicion: string; vigenteDesde: string; url: string }[];
}

export interface FichaAnac {
  icao: string;
  indicator: string;
  madhel: MadhelData | null;
  /**
   * `null` si no se pudo preguntar, que no es lo mismo que `[]` (invariante 2): con ANAC
   * caído, la ficha decía "No hay NOTAMs vigentes".
   */
  notams: NotamItem[] | null;
  /** Cuándo se obtuvieron los NOTAM (ISO): la última verificación de la descarga, o el pedido del navegador. */
  notamsCapturadosEn?: string | null;
  /** De dónde salieron: la descarga del país (`lib/notams-descargados.ts`), ANAC desde el servidor, o el navegador. */
  notamsFuente?: "descarga" | "anac" | "navegador" | null;
  /** La "Última actualización" de ANAC, tal cual ("02 Nov 2026 21:33"), si vino de la descarga. */
  notamsActualizacion?: string | null;
}

const texto = (v: unknown): string => (typeof v === "string" ? v : "");
const lista = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/**
 * Uso (público o privado) y control, **del texto que muestra ANAC** en su sitio
 * ("LUJÁN - (LJN / SRDL) - DRCE - PÚBLICO NO CONTROLADO"). Los campos `metadata.condition` y
 * `metadata.control` a veces lo contradicen: de 547 fichas (2026-11-03), 6 en el uso —Luján
 * figuraba privado— y 5 en el control. El campo vale sólo si el texto no lo dice.
 */
export function usoYControl(texto: string, condition: string, control: string): { condition: string; control: string } {
  const t = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const uso = /\bPUBLICO\b/.test(t) ? "PUBLICO" : /\bPRIVADO\b/.test(t) ? "PRIVADO" : condition;
  const ctrl = /\bNO CONTROLADO\b/.test(t) ? "NON-CONTROLLED" : /\bCONTROLADO\b/.test(t) ? "CONTROLLED" : control;
  return { condition: uso, control: ctrl };
}

/** Los NOTAM, de lo que contesta `ais.anac.gob.ar/notam/json`. `null` si no es una lista. */
export function leerNotams(json: unknown): NotamItem[] | null {
  if (!Array.isArray(json)) return null;
  return json.map((item: Record<string, unknown>) => {
    const rawBody = texto(item?.novedad).replace(/<\/?[^>]+(>|$)/g, ""); // Strip HTML tags
    let textRaw = rawBody.trim();
    let textEsp = rawBody.trim();

    if (rawBody.includes("Versión en Español:")) {
      const parts = rawBody.split("Versión en Español:");
      textRaw = parts[0].trim();
      textEsp = parts[1].trim();
    }

    const toVal = item?.hasta === "0000-00-00 00:00:00" ? "PERMANENTE" : texto(item?.hasta);

    return {
      code: texto(item?.notam) || "NOTAM",
      from: texto(item?.desde),
      to: toVal,
      textRaw,
      textEsp,
    };
  });
}

/** La ficha de MADHEL completada con el AIP. `null` si MADHEL no contestó una ficha. */
export function leerMadhel(json: unknown, icao: string, datosDelAip: DatosAip | null): MadhelData | null {
  const mJson = json as Record<string, any> | null;
  if (!mJson || typeof mJson !== "object" || !mJson.metadata) return null;

  const particularContent = texto(mJson.data?.norms?.particular?.content);
  const generalContent = texto(mJson.data?.norms?.general?.content);

  // Parse radio frequencies from norms or helpers
  let radioList = lista(mJson.data?.helpers_system?.radio);
  if (radioList.length === 0 && particularContent) {
    const freqMatch = particularContent.match(/(?:Frecuencia|canal de llamada|Frec)[^0-9]*(\d+[\,\.]\d+)\s*MHz/i);
    if (freqMatch) radioList = [`Frecuencia común: ${freqMatch[1]} MHz`];
  }

  let locStr = texto(mJson.data?.human_readable_localization);
  if (locStr.includes("***Consultar en el sitio web")) {
    locStr = ""; // Clear the useless AIP reference string
  }

  // **El AIP manda donde publica; MADHEL llena el resto**, campo por campo (`componerFicha`).
  const ficha = componerFicha(
    {
      runways: lista(mJson.data?.rwy),
      radio: radioList,
      localization: locStr,
      fuel: texto(mJson.data?.fuel),
      telephone: lista(mJson.data?.telephone),
    },
    datosDelAip,
  );

  const fullName = texto(mJson.human_readable_identifier) || texto(mJson.the_geom?.properties?.name);
  const { condition, control } = usoYControl(fullName, texto(mJson.metadata.condition), texto(mJson.metadata.control));

  return {
    name: texto(mJson.metadata.identifiers?.icao) || icao,
    fullName,
    state: texto(mJson.metadata.localization?.state),
    fir: texto(mJson.metadata.localization?.fir),
    elevation: typeof mJson.metadata.localization?.elevation === "number" ? mJson.metadata.localization.elevation : 0,
    condition,
    control,
    traffic: texto(mJson.metadata.traffic),
    status: texto(mJson.metadata.status) || "OK",

    // Detail fields
    runways: ficha.runways,
    radio: ficha.radio,
    localization: ficha.localization,
    fuel: ficha.fuel || "No especificado",
    telephone: ficha.telephone,
    particularNorms: particularContent,
    generalNorms: generalContent,
    aip: ficha.aip,
    cartas: datosDelAip?.cartas ?? [],
  };
}
