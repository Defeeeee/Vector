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
}

const texto = (v: unknown): string => (typeof v === "string" ? v : "");
const lista = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

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

  /*
    **El AIP rellena, nunca pisa.** Para un aeródromo controlado MADHEL devuelve
    `rwy: []`, `radio: []`, `fuel: ""` y `telephone: []` —ANAC publica eso en el AIP
    y no acá—, así que el hueco es real y hay que llenarlo. Lo que no se puede es
    llenarlo cuando MADHEL sí contestó: la versión anterior de esto hacía
    `fallback ? fallback.rwy : ...`, y con eso La Plata mostraba una pista de tierra
    escrita a mano en vez de la de asfalto que ANAC publica.

    Se elige por campo y no por aeródromo, que es lo que hace que la regla se sostenga
    sola cuando MADHEL empiece a publicar alguno de estos datos.
  */
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

  return {
    name: texto(mJson.metadata.identifiers?.icao) || icao,
    fullName: texto(mJson.human_readable_identifier) || texto(mJson.the_geom?.properties?.name),
    state: texto(mJson.metadata.localization?.state),
    fir: texto(mJson.metadata.localization?.fir),
    elevation: typeof mJson.metadata.localization?.elevation === "number" ? mJson.metadata.localization.elevation : 0,
    condition: texto(mJson.metadata.condition),
    control: texto(mJson.metadata.control),
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
