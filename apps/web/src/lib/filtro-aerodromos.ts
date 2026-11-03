import { distanciaNmPrecisa } from "./distance";

/**
 * Los filtros de la pestaña Aeropuertos: "a menos de 100 NM de San Fernando, con 100LL y
 * pista de asfalto de más de 800 m". La parte pura: qué pasa cada aeródromo, en qué orden
 * van y cómo viajan los filtros en la URL. Los candidatos los arma `airports.ts`, que lee
 * el disco.
 *
 * ## "No sé" no es "no hay" (invariante 2)
 *
 * El combustible sale del AIP (51 aeródromos controlados) y las pistas de `runways.tsv` (117);
 * del resto, de las fichas de MADHEL que baja el workflow mensual (`madhel-fichas.tsv`).
 * Aun así hay aeródromos con la ficha incompleta, y MADHEL deja vacío el combustible de
 * muchos. Así que cada criterio tiene tres respuestas
 * —sí, no, no se sabe— y un aeródromo sin el dato **no se descarta en silencio**: se
 * cuenta aparte, y la pantalla ofrece mostrarlo marcado "sin dato".
 */

export type Superficie = "dura" | "blanda";
export type Combustible = "100LL" | "JETA1";

export interface FiltrosAerodromo {
  /** El aeródromo desde el que se mide, por ICAO o designador ANAC ("SADF", "GEZ"). */
  desde?: string;
  radioNm?: number;
  largoMinM?: number;
  superficie?: Superficie;
  combustible?: Combustible;
  controlado?: boolean;
  uso?: "publico" | "privado";
  provincia?: string;
  /** Mostrar también los que no tienen el dato pedido, marcados. */
  conSinDato?: boolean;
}

/** Un aeródromo como lo necesita el filtro. Sólo los argentinos: no hay otros en MADHEL. */
export interface AerodromoFiltrable {
  icao: string;
  local?: string;
  label: string;
  provincia: string;
  lat?: number;
  lon?: number;
  helipuerto: boolean;
  controlado: boolean | null;
  /** "PUBLICO", "PRIVADO" o "" si MADHEL no lo dice. */
  uso: string;
  /** El estado de MADHEL: "OK", "CERRADO", "SIN IDENTIFICACION VISUAL"… */
  estado: string;
  pistas: { largoFt?: number; superficie?: string }[];
  /** Del AIP, tal cual ("AVGAS 100LL, JET A-1"). "" es que no lo sabemos. */
  combustible: string;
}

export type DatoFaltante = "ubicación" | "pista" | "combustible" | "control" | "uso";

export interface AerodromoFiltrado {
  icao: string;
  local?: string;
  label: string;
  provincia: string;
  distanciaNm: number | null;
  /** La pista más larga que se conoce, en metros. */
  largoM: number | null;
  superficie: Superficie | null;
  combustible: string | null;
  controlado: boolean | null;
  uso: string;
  estado: string;
  /** De lo que se pidió, lo que no se sabe de este aeródromo. Vacío si cumple todo. */
  sinDato: DatoFaltante[];
}

export interface ResultadoFiltro {
  resultados: AerodromoFiltrado[];
  /** Cuántos cumplen, aunque la lista venga cortada. */
  total: number;
  /** Cuántos no se descartaron ni se muestran porque les falta un dato pedido. */
  conDatoFaltante: number;
}

export const MAX_RESULTADOS = 60;
const PIES_A_METROS = 0.3048;

/**
 * Asfalto, hormigón y parecidos: los códigos de OurAirports y sus variantes, y las palabras
 * de MADHEL ("Asfalto", "Hormigón", "Carpeta asfáltica").
 */
const DURAS = /^(ASP|ASPH|ASPHALT|CON|CONC|CONCRETE|BIT|BITUMEN|PEM|PAVED|ASFALT|HORMIGON|CONCRETO|PAVIMENT|CARPETA)/i;
const BLANDAS = /^(GRE|GRS|GRASS|TURF|DIRT|EARTH|GRV|GRAVEL|GVL|SAND|TIERRA|CESPED|PASTO|RIPIO|GRAVA|ARENA|CONCHILLA|GRANZA|SUELO)/i;

export function clasificarSuperficie(s: string | undefined): Superficie | null {
  const t = s?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (!t) return null;
  if (DURAS.test(t)) return "dura";
  if (BLANDAS.test(t)) return "blanda";
  return null;
}

/**
 * Una pista como la escribe MADHEL: "17/35 1400x21 M – Tierra." o "01/19 1200x40 M - Asfalto".
 * El largo va en metros y se pasa a pies, como el resto de las pistas del directorio. Lo que
 * no se entiende queda sin dato, nunca inventado.
 */
export function pistaDeMadhel(texto: string): { largoFt?: number; superficie?: string } {
  const largo = texto.match(/(\d{2,5})\s*[xX×]\s*\d+(?:[.,]\d+)?\s*M\b/);
  const superficie = texto.match(/\bM\b\s*[–—-]\s*([^.|]+)/);
  const metros = largo ? Number(largo[1]) : NaN;
  return {
    largoFt: Number.isFinite(metros) && metros > 0 ? Math.round(metros / PIES_A_METROS) : undefined,
    superficie: superficie?.[1].trim() || undefined,
  };
}

export function tieneCombustible(texto: string, c: Combustible): boolean {
  return c === "100LL" ? /100\s*LL/i.test(texto) : /JET\s*A[\s-]*1/i.test(texto);
}

const sinTildes = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

type Tri = boolean | null;

/** Una pista cumple si todo lo pedido es sí; es dudosa si nada es no pero algo no se sabe. */
function evaluarPistas(a: AerodromoFiltrable, f: FiltrosAerodromo): Tri {
  if (f.largoMinM === undefined && f.superficie === undefined) return true;
  let dudosa = false;
  for (const p of a.pistas) {
    const largo: Tri =
      f.largoMinM === undefined ? true : p.largoFt === undefined ? null : p.largoFt * PIES_A_METROS >= f.largoMinM;
    const sup = clasificarSuperficie(p.superficie);
    const superficie: Tri = f.superficie === undefined ? true : sup === null ? null : sup === f.superficie;
    if (largo === true && superficie === true) return true;
    if (largo !== false && superficie !== false) dudosa = true;
  }
  return a.pistas.length === 0 || dudosa ? null : false;
}

/**
 * Los aeródromos que cumplen los filtros: del más cercano al más lejano si hay un
 * `desde`, y por nombre si no. Nunca los helipuertos ni los cerrados: no son un lugar
 * adonde llevar un avión. `desde` tiene que venir resuelto (con coordenadas).
 */
export function filtrarAerodromos(
  candidatos: AerodromoFiltrable[],
  f: FiltrosAerodromo,
  desde: { lat: number; lon: number } | null = null,
  max = MAX_RESULTADOS,
): ResultadoFiltro {
  const provincia = f.provincia ? sinTildes(f.provincia) : null;
  const cumplen: AerodromoFiltrado[] = [];
  let conDatoFaltante = 0;

  for (const a of candidatos) {
    if (a.helipuerto || a.estado === "CERRADO") continue;
    if (provincia && sinTildes(a.provincia) !== provincia) continue;

    const sinDato: DatoFaltante[] = [];
    let descartado = false;
    const anotar = (t: Tri, dato: DatoFaltante) => {
      if (t === false) descartado = true;
      else if (t === null) sinDato.push(dato);
    };

    let distanciaNm: number | null = null;
    if (desde) {
      if (a.lat === undefined || a.lon === undefined) anotar(null, "ubicación");
      else {
        distanciaNm = distanciaNmPrecisa(desde.lat, desde.lon, a.lat, a.lon);
        // El propio aeródromo de partida no es una respuesta a "cerca de".
        if (distanciaNm < 0.5) continue;
        if (f.radioNm !== undefined) anotar(distanciaNm <= f.radioNm, "ubicación");
      }
    }
    anotar(evaluarPistas(a, f), "pista");
    if (f.combustible) anotar(a.combustible ? tieneCombustible(a.combustible, f.combustible) : null, "combustible");
    if (f.controlado !== undefined) anotar(a.controlado === null ? null : a.controlado === f.controlado, "control");
    if (f.uso) anotar(a.uso ? sinTildes(a.uso) === f.uso.toUpperCase() : null, "uso");

    if (descartado) continue;
    if (sinDato.length > 0 && !f.conSinDato) {
      conDatoFaltante++;
      continue;
    }

    const conocidas = a.pistas.filter((p) => p.largoFt !== undefined);
    const larga = conocidas.sort((x, y) => (y.largoFt ?? 0) - (x.largoFt ?? 0))[0];
    cumplen.push({
      icao: a.icao,
      local: a.local,
      label: a.label,
      provincia: a.provincia,
      distanciaNm: distanciaNm === null ? null : Math.round(distanciaNm),
      largoM: larga?.largoFt !== undefined ? Math.round(larga.largoFt * PIES_A_METROS) : null,
      superficie: clasificarSuperficie((larga ?? a.pistas[0])?.superficie),
      combustible: a.combustible || null,
      controlado: a.controlado,
      uso: a.uso,
      estado: a.estado,
      sinDato,
    });
  }

  cumplen.sort((x, y) =>
    x.distanciaNm !== null && y.distanciaNm !== null
      ? x.distanciaNm - y.distanciaNm
      : x.label.localeCompare(y.label, "es"),
  );
  return { resultados: cumplen.slice(0, max), total: cumplen.length, conDatoFaltante };
}

/** ¿Hay algo que filtrar? Sin filtros la pantalla no muestra la lista de los 500. */
export function hayFiltros(f: FiltrosAerodromo): boolean {
  return Boolean(
    f.desde || f.largoMinM !== undefined || f.superficie || f.combustible ||
      f.controlado !== undefined || f.uso || f.provincia,
  );
}

const entero = (v: string | null, min: number, max: number): number | undefined => {
  if (v === null || !/^\d+$/.test(v.trim())) return undefined;
  const n = Number(v);
  return n >= min && n <= max ? n : undefined;
};

/**
 * Los filtros, de la URL (`?desde=SADF&nm=100&largo=800&sup=dura&comb=100LL&ctrl=si&uso=publico&prov=…&sindato=1`).
 * Lo que no es válido se ignora: una URL vieja o editada a mano no rompe la pantalla.
 */
export function filtrosDeParams(p: URLSearchParams): FiltrosAerodromo {
  const f: FiltrosAerodromo = {};
  const desde = p.get("desde")?.trim().toUpperCase();
  if (desde && /^[A-Z0-9]{3,4}$/.test(desde)) f.desde = desde;
  const nm = entero(p.get("nm"), 1, 1000);
  if (nm !== undefined && f.desde) f.radioNm = nm;
  const largo = entero(p.get("largo"), 1, 5000);
  if (largo !== undefined) f.largoMinM = largo;
  const sup = p.get("sup");
  if (sup === "dura" || sup === "blanda") f.superficie = sup;
  const comb = p.get("comb")?.toUpperCase();
  if (comb === "100LL" || comb === "JETA1") f.combustible = comb;
  const ctrl = p.get("ctrl");
  if (ctrl === "si" || ctrl === "no") f.controlado = ctrl === "si";
  const uso = p.get("uso");
  if (uso === "publico" || uso === "privado") f.uso = uso;
  const prov = p.get("prov")?.trim();
  if (prov && prov.length <= 60) f.provincia = prov;
  if (p.get("sindato") === "1") f.conSinDato = true;
  return f;
}

export function paramsDeFiltros(f: FiltrosAerodromo): URLSearchParams {
  const p = new URLSearchParams();
  if (f.desde) p.set("desde", f.desde);
  if (f.desde && f.radioNm !== undefined) p.set("nm", String(f.radioNm));
  if (f.largoMinM !== undefined) p.set("largo", String(f.largoMinM));
  if (f.superficie) p.set("sup", f.superficie);
  if (f.combustible) p.set("comb", f.combustible);
  if (f.controlado !== undefined) p.set("ctrl", f.controlado ? "si" : "no");
  if (f.uso) p.set("uso", f.uso);
  if (f.provincia) p.set("prov", f.provincia);
  if (f.conSinDato) p.set("sindato", "1");
  return p;
}

/**
 * Lo que devuelve el modelo al leer una frase (`/api/airports/frase`). **Las cuentas las
 * hace el código**: el modelo dice "100 km" y acá se pasa a millas; no se le pide que
 * convierta.
 */
export interface FiltrosDelModelo {
  lugar?: string | null;
  radio?: { valor: number; unidad: string } | null;
  largoMinimo?: { valor: number; unidad: string } | null;
  superficie?: string | null;
  combustible?: string | null;
  controlado?: boolean | null;
  uso?: string | null;
  provincia?: string | null;
  noEntendido?: string[] | null;
}

const NM_POR = { nm: 1, km: 1 / 1.852, mi: 1.609344 / 1.852 } as const;

/**
 * Del JSON del modelo a filtros válidos. `lugar` queda aparte: lo resuelve el server
 * contra el directorio (`resolverLugar`), porque un aeródromo que el modelo "conoce" y el
 * directorio no, no existe para Vector. Lo que no se pudo usar va en `noEntendido`.
 */
export function filtrosDeModelo(
  m: FiltrosDelModelo,
  resolverLugar: (texto: string) => string | null,
  provincias: string[],
): { filtros: FiltrosAerodromo; noEntendido: string[] } {
  const f: FiltrosAerodromo = {};
  const noEntendido = (m.noEntendido ?? []).filter((s) => typeof s === "string" && s.trim()).slice(0, 5);

  if (m.lugar?.trim()) {
    const codigo = resolverLugar(m.lugar.trim());
    if (codigo) f.desde = codigo;
    else noEntendido.push(`No encontré el aeródromo «${m.lugar.trim()}».`);
  }
  if (m.radio && Number.isFinite(m.radio.valor) && m.radio.valor > 0) {
    const factor = NM_POR[m.radio.unidad?.toLowerCase() as keyof typeof NM_POR];
    if (!factor) noEntendido.push(`La unidad «${m.radio.unidad}» de la distancia.`);
    else if (!f.desde) noEntendido.push("Una distancia, pero no desde dónde medirla.");
    else f.radioNm = Math.min(1000, Math.max(1, Math.round(m.radio.valor * factor)));
  }
  if (m.largoMinimo && Number.isFinite(m.largoMinimo.valor) && m.largoMinimo.valor > 0) {
    const u = m.largoMinimo.unidad?.toLowerCase();
    const metros = u === "m" ? m.largoMinimo.valor : u === "ft" ? m.largoMinimo.valor * PIES_A_METROS : NaN;
    if (Number.isFinite(metros)) f.largoMinM = Math.min(5000, Math.round(metros));
    else noEntendido.push(`La unidad «${m.largoMinimo.unidad}» del largo de pista.`);
  }
  if (m.superficie === "dura" || m.superficie === "blanda") f.superficie = m.superficie;
  if (m.combustible) {
    const c = m.combustible.toUpperCase().replace(/[\s-]/g, "");
    if (c.includes("100LL") || c === "AVGAS") f.combustible = "100LL";
    else if (c.includes("JETA1") || c === "JET") f.combustible = "JETA1";
    else noEntendido.push(`El combustible «${m.combustible}».`);
  }
  if (typeof m.controlado === "boolean") f.controlado = m.controlado;
  if (m.uso === "publico" || m.uso === "privado") f.uso = m.uso;
  if (m.provincia?.trim()) {
    const buscada = sinTildes(m.provincia);
    const p = provincias.find((x) => sinTildes(x) === buscada || sinTildes(x).includes(buscada));
    if (p) f.provincia = p;
    else noEntendido.push(`La provincia «${m.provincia.trim()}».`);
  }
  return { filtros: f, noEntendido };
}
