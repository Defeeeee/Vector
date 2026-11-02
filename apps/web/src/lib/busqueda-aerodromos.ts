import type { Pista } from "./briefing";

/**
 * El directorio de aeródromos como **datos y búsqueda**, sin leer el disco.
 *
 * ## Por qué está separado de `airports.ts`
 *
 * Porque `airports.ts` abre archivos con `fs`, y esto tiene que poder correr **en el
 * navegador**: el service worker resuelve puntos de ruta cuando no hay señal, y para
 * eso necesita esta misma búsqueda sobre el catálogo precacheado.
 *
 * La alternativa era escribir una búsqueda "más simple para offline", y el resultado
 * habría sido que **el orden de las sugerencias cambia según haya o no red**. El
 * ranking de `compare` —exacto, después prefijo, después texto libre; y entre iguales
 * por tamaño y Argentina primero— no es de los que se replican de memoria.
 *
 * `airports.ts` sigue siendo la puerta de entrada del servidor y reexporta todo esto,
 * así que ningún llamador cambió.
 */

export interface MadhelInfo {
  /** Province, as MADHEL spells it (uppercase). */
  province: string;
  /** AD = aeródromo, HEL = helipuerto. */
  kind: "AD" | "HEL";
  /** PUBLICO / PRIVADO. Blank where MADHEL does not state it. */
  condition: string;
  /** null where MADHEL does not state it — not the same as "uncontrolled". */
  controlled: boolean | null;
  /** OK, CERRADO, SIN IDENTIFICACION VISUAL… verbatim, so a closed field says so. */
  status: string;
  /** Elevation in metres, the unit MADHEL and Argentine charts publish. */
  elevationM?: number;
}

export interface Airport {
  /** Canonical code: the ICAO indicator, or the ANAC designator when there is no
   *  ICAO. This is what gets written into a flight's route — see `local`. */
  icao: string;
  name: string;
  city: string;
  country: string;
  /** L = large, M = medium, S = small, H = heliport/seaplane. */
  size: "L" | "M" | "S" | "H";
  iata: string;
  /** Short label to show under an input, FlightDeck-style: SADM -> "Morón". */
  label: string;
  /** Field elevation in feet. Missing upstream for a handful of entries. */
  elevation?: number;
  /** Decimal degrees, 4dp (~11 m) — enough to plot, small enough not to bloat. */
  lat?: number;
  lon?: number;
  /**
   * Variación magnética en **grados oeste positivos**, precalculada con WMM por
   * `scripts/build-magvar.mjs` y guardada en la 14ª columna de `madhel.tsv`.
   *
   * Oeste positivo y no declinación este porque es la que se **suma** al rumbo
   * verdadero para obtener el magnético, que es lo único que el piloto hace con ella.
   *
   * Sólo la tienen los aeródromos de MADHEL. `undefined` es "no la sabemos" — y ojo
   * con confundirlo con cero: **cero es un valor válido en Argentina**, la línea
   * agónica cruza la Patagonia. El país va de 17,8° W en Misiones a 12,6° E en Santa
   * Cruz, así que una constante nacional estaría equivocada por treinta grados de
   * punta a punta.
   */
  variacionW?: number;
  /**
   * Pistas con **rumbo verdadero**, de `runways.tsv`. Vacío —no `undefined`— cuando el
   * aeródromo no tiene ninguna publicada, que es el caso de 618 de los 711 de MADHEL:
   * OurAirports sólo conoce los que tienen indicador ICAO.
   */
  pistas?: Pista[];
  /**
   * ANAC's three-letter designator — GEZ for General Rodríguez, MOR for Morón.
   * Argentine aerodromes only, and it is how pilots here actually refer to the
   * field. Resolves as an alias of `icao`; it is never what gets stored.
   */
  local?: string;
  madhel?: MadhelInfo;
}

/** Uppercase + strip diacritics, so "moron" matches "Morón". */
export function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
}

const SIZE_RANK: Record<Airport["size"], number> = { L: 0, M: 1, S: 2, H: 3 };

/**
 * Ranks by how the query matched (exact ICAO beats prefix beats free text),
 * then by aerodrome size, then Argentina first — Vector's pilots fly SA*, so a
 * two-letter query like "SA" should surface local fields, not Saudi ones.
 */
function compare(a: Airport, b: Airport, rankA: number, rankB: number): number {
  if (rankA !== rankB) return rankA - rankB;
  if (SIZE_RANK[a.size] !== SIZE_RANK[b.size]) return SIZE_RANK[a.size] - SIZE_RANK[b.size];
  const arA = a.country === "AR" ? 0 : 1;
  const arB = b.country === "AR" ? 0 : 1;
  if (arA !== arB) return arA - arB;
  return a.icao.localeCompare(b.icao);
}

/**
 * Lo que necesita la búsqueda para funcionar, sin decir de dónde salió.
 *
 * Existe para que **el catálogo de a bordo use esta misma búsqueda** en vez de una
 * parecida. `catalogo-json.ts` arma este índice con los ~875 aeródromos argentinos
 * del JSON precacheado y llama acá; el servidor lo arma con los 17.129 del TSV.
 *
 * Sin esto, el orden de las sugerencias sin señal sería distinto del orden con señal
 * —el ranking de `compare` no es obvio de replicar— y el piloto vería otra lista
 * según tuviera o no red. Es la misma razón por la que la resolución de puntos se
 * sacó del route handler.
 */
export interface IndiceAerodromos {
  byIcao: Map<string, Airport>;
  byPrefix: Map<string, Airport[]>;
  all: Airport[];
  /** Texto normalizado y concatenado por aeródromo, en el mismo orden que `all`. */
  haystacks: string[];
}

/** Arma el índice desde una lista suelta. Lo usa el catálogo de a bordo. */
export function construirIndice(aerodromos: Airport[]): IndiceAerodromos {
  const byIcao = new Map<string, Airport>();
  const byPrefix = new Map<string, Airport[]>();
  const all: Airport[] = [];
  const haystacks: string[] = [];

  for (const a of aerodromos) {
    byIcao.set(normalize(a.icao), a);
    if (a.local && a.local !== a.icao) byIcao.set(normalize(a.local), a);
    all.push(a);
    haystacks.push(normalize(`${a.local ?? ""} ${a.icao} ${a.city} ${a.name}`));
    const p = normalize(a.icao).slice(0, 2);
    const bucket = byPrefix.get(p);
    if (bucket) bucket.push(a);
    else byPrefix.set(p, [a]);
  }

  return { byIcao, byPrefix, all, haystacks };
}

export function buscarEnIndice(indice: IndiceAerodromos, query: string, limit = 8): Airport[] {
  const q = normalize(query);
  if (q.length < 2) return [];

  const { byIcao, byPrefix, all, haystacks } = indice;
  const ranks = new Map<Airport, number>();

  const consider = (airport: Airport, rank: number) => {
    const current = ranks.get(airport);
    if (current === undefined || rank < current) ranks.set(airport, rank);
  };

  // 0 — exact ICAO. This is the common case: the pilot knows the code.
  const exact = byIcao.get(q);
  if (exact) consider(exact, 0);

  // 1 — ICAO prefix, restricted to the matching bucket.
  if (q.length >= 2 && /^[A-Z]{2,4}$/.test(q)) {
    for (const airport of byPrefix.get(q.slice(0, 2)) ?? []) {
      if (airport.icao.startsWith(q)) consider(airport, 1);
    }
  }

  // 2/3 — IATA, then city/name text. Only worth scanning when the prefix pass
  // came up short, since this is the only path that walks the whole table.
  if (ranks.size < limit) {
    for (let i = 0; i < all.length; i++) {
      if (q.length === 3 && all[i].iata === q) consider(all[i], 2);
      else if (haystacks[i].includes(q)) consider(all[i], 3);
    }
  }

  return [...ranks.entries()]
    .sort(([a, ra], [b, rb]) => compare(a, b, ra, rb))
    .slice(0, limit)
    .map(([airport]) => airport);
}
