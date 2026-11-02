import { celdasDeAperturaPPA } from "@/lib/apertura-alumno";
import { Flight, Aircraft, Logbook } from "@/types";

// Vive en lib/route.ts. Se reexporta para no tocar a todos los que la
// importan desde acá desde antes de unificarla.
export { splitRoute } from "./route";
import { estimatedLocalNm, legDistanceNm } from "./distance";
import { splitRoute } from "./route";

/**
 * Aggregations for the "Resumen de horas" page.
 *
 * Pure functions over the flights the dashboard endpoint already returns — no
 * new backend call. Every number here is derived from columns that the log form
 * already writes, so nothing needs a migration.
 */

export type Period = "28d" | "90d" | "6m" | "1a" | "todo";

export const PERIODS: { key: Period; label: string }[] = [
  { key: "28d", label: "28D" },
  { key: "90d", label: "90D" },
  { key: "6m", label: "6M" },
  { key: "1a", label: "1A" },
  { key: "todo", label: "Todo" },
];

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/** Days back per period; `todo` has no cutoff. */
const WINDOW: Record<Exclude<Period, "todo">, number> = {
  "28d": 28,
  "90d": 90,
  "6m": 183,
  "1a": 365,
};

/**
 * `todayIso` is passed in rather than read from the clock so the caller decides
 * what "today" means. The page renders on the server (UTC) and is read in
 * UTC-3; letting each side compute its own cutoff is exactly the hydration trap
 * the heatmap and the documents card already hit.
 */
export function filterByPeriod(flights: Flight[], period: Period, todayIso: string): Flight[] {
  if (period === "todo") return flights;
  const cutoff = new Date(todayIso + "T00:00:00Z");
  cutoff.setUTCDate(cutoff.getUTCDate() - WINDOW[period]);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  return flights.filter((f) => f.date >= cutoffIso);
}

const n = (v?: number) => (typeof v === "number" && isFinite(v) ? v : 0);
const sum = (flights: Flight[], pick: (f: Flight) => number) =>
  flights.reduce((acc, f) => acc + pick(f), 0);

export interface HeadlineStats {
  totalHours: number;
  pic: number;
  imc: number;
  night: number;
  hood: number;
  landings: number;
  flights: number;
}

/**
 * Hours carried into the logbooks without their flights.
 *
 * Every aggregate on this page has to add these, or a pilot who migrated 500 h
 * from paper sees a summary that says 0. They are added **only when the period
 * is "todo"** — an opening balance has no date, so counting it inside "last 28
 * days" would be inventing recent flying that never happened.
 */
export function openingTotals(logbooks: Logbook[], opciones: { alumno?: boolean } = {}) {
  /*
    Las horas de antes de un alumno (`apertura_ppa`, `lib/apertura-alumno.ts`) suman en las
    columnas de piloto, como sus vuelos. **Salvo que quien llama sepa que ya no es alumno**
    (`alumno: false`): esas horas no cuentan una vez rendida la PPA, como sus vuelos
    (`vuelosDesdeLaPpa`). Sin el dato, cuentan, igual que los vuelos en las pantallas que
    no aplican esa regla.
  */
  const conAlumno = opciones.alumno !== false;
  const delAlumno = (l: Logbook) => (conAlumno && l.apertura_ppa ? celdasDeAperturaPPA(l.apertura_ppa) : null);
  const add = (pick: (l: Logbook) => number) =>
    logbooks.reduce((acc, l) => acc + n(pick(l)), 0);
  const addAlumno = (pick: (c: ReturnType<typeof celdasDeAperturaPPA>) => number) =>
    logbooks.reduce((acc, l) => {
      const c = delAlumno(l);
      return acc + (c ? n(pick(c)) : 0);
    }, 0);

  const alumnoDiaLoc = addAlumno((c) => c.pic_day_loc);
  const alumnoDiaTra = addAlumno((c) => c.pic_day_tra);
  const alumnoNoche = addAlumno((c) => c.pic_night_loc);
  const pic =
    add((l) => l.opening_pic_day_loc) + add((l) => l.opening_pic_day_tra) +
    add((l) => l.opening_pic_night_loc) + add((l) => l.opening_pic_night_tra) +
    alumnoDiaLoc + alumnoDiaTra + alumnoNoche;
  const sic =
    add((l) => l.opening_sic_day_loc) + add((l) => l.opening_sic_day_tra) +
    add((l) => l.opening_sic_night_loc) + add((l) => l.opening_sic_night_tra);

  return {
    // IMC and hood overlap flight time instead of partitioning it, so they are
    // excluded from the total — the same rule the log form applies.
    totalHours: pic + sic,
    pic,
    imc: add((l) => l.opening_imc_pil) + add((l) => l.opening_imc_cop),
    night:
      add((l) => l.opening_pic_night_loc) + add((l) => l.opening_pic_night_tra) +
      add((l) => l.opening_sic_night_loc) + add((l) => l.opening_sic_night_tra) + alumnoNoche,
    hood: add((l) => l.opening_capota),
    landings: add((l) => l.opening_landings),
    cells: {
      local: [
        add((l) => l.opening_pic_day_loc) + alumnoDiaLoc,
        add((l) => l.opening_sic_day_loc),
        add((l) => l.opening_pic_night_loc) + alumnoNoche,
        add((l) => l.opening_sic_night_loc),
      ],
      travesia: [
        add((l) => l.opening_pic_day_tra) + alumnoDiaTra,
        add((l) => l.opening_sic_day_tra),
        add((l) => l.opening_pic_night_tra),
        add((l) => l.opening_sic_night_tra),
      ],
      imcPil: add((l) => l.opening_imc_pil),
      imcCop: add((l) => l.opening_imc_cop),
      capota: add((l) => l.opening_capota),
    },
  };
}

export function headlineStats(flights: Flight[]): HeadlineStats {
  return {
    totalHours: sum(flights, (f) => f.duration),
    pic: sum(flights, (f) => n(f.pic_day_loc) + n(f.pic_day_tra) + n(f.pic_night_loc) + n(f.pic_night_tra)),
    imc: sum(flights, (f) => n(f.imc_pil) + n(f.imc_cop)),
    night: sum(
      flights,
      (f) => n(f.pic_night_loc) + n(f.pic_night_tra) + n(f.sic_night_loc) + n(f.sic_night_tra)
    ),
    hood: sum(flights, (f) => n(f.capota)),
    landings: sum(flights, (f) => f.landings),
    flights: flights.length,
  };
}

export interface AnacMatrix {
  /** Rows are Local / Travesía; columns are Día PIC, Día SIC, Noche PIC, Noche SIC. */
  rows: { label: string; total: number; cells: number[] }[];
  columns: string[];
  /** Categories that overlap with the grid above rather than partitioning it. */
  extras: { label: string; value: number }[];
  total: number;
}

export function anacMatrix(flights: Flight[]): AnacMatrix {
  const local = [
    sum(flights, (f) => n(f.pic_day_loc)),
    sum(flights, (f) => n(f.sic_day_loc)),
    sum(flights, (f) => n(f.pic_night_loc)),
    sum(flights, (f) => n(f.sic_night_loc)),
  ];
  const travesia = [
    sum(flights, (f) => n(f.pic_day_tra)),
    sum(flights, (f) => n(f.sic_day_tra)),
    sum(flights, (f) => n(f.pic_night_tra)),
    sum(flights, (f) => n(f.sic_night_tra)),
  ];
  const add = (a: number[]) => a.reduce((x, y) => x + y, 0);

  return {
    columns: ["Día PIC", "Día SIC", "Noche PIC", "Noche SIC"],
    rows: [
      { label: "Local", total: add(local), cells: local },
      { label: "Travesía", total: add(travesia), cells: travesia },
    ],
    // Kept out of the grid on purpose: IMC, capota and simulator overlap with
    // PIC time instead of partitioning it — the same reason section 03 of the
    // log form does not share a pool with section 02.
    extras: [
      { label: "IMC Piloto", value: sum(flights, (f) => n(f.imc_pil)) },
      { label: "IMC Copiloto", value: sum(flights, (f) => n(f.imc_cop)) },
      { label: "Capota", value: sum(flights, (f) => n(f.capota)) },
      { label: "Sim. Instr.", value: sum(flights, (f) => n(f.sim_instructor)) },
      { label: "Sim. Piloto", value: sum(flights, (f) => n(f.sim_pil_en_inst)) },
    ],
    total: add(local) + add(travesia),
  };
}

export interface AirportCount {
  icao: string;
  visits: number;
}

export function topAirports(flights: Flight[], limit = 6): AirportCount[] {
  return allAirports(flights).slice(0, limit);
}

/** Unsliced, for the "N aeródromos" caption — the top-6 list must not be
 *  mistaken for the total, which is what the caption is actually counting. */
export function allAirports(flights: Flight[]): AirportCount[] {
  const freq = new Map<string, number>();
  for (const f of flights) {
    for (const icao of splitRoute(f.route)) {
      if (!icao || icao === "???") continue;
      freq.set(icao, (freq.get(icao) || 0) + 1);
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([icao, visits]) => ({ icao, visits }));
}

export interface RouteCount {
  origin: string;
  destination: string;
  times: number;
  hours: number;
}

export function topRoutes(flights: Flight[], limit = 4): RouteCount[] {
  return allRoutes(flights).slice(0, limit);
}

/** Only real cross-country legs — a circuit session is not a "route". */
export function allRoutes(flights: Flight[]): RouteCount[] {
  const acc = new Map<string, RouteCount>();
  for (const f of flights) {
    const [o, d] = splitRoute(f.route);
    if (!o || !d || o === d || o === "???" || d === "???") continue;
    const key = `${o}>${d}`;
    const cur = acc.get(key) || { origin: o, destination: d, times: 0, hours: 0 };
    cur.times += 1;
    cur.hours += f.duration;
    acc.set(key, cur);
  }
  return [...acc.values()].sort((a, b) => b.times - a.times || b.hours - a.hours);
}

export interface TimeOfDay {
  bands: { label: string; range: string; hours: number }[];
  /** Hour 0–23 with the most flight time, or null when nothing is logged. */
  peakHour: number | null;
  /** Hours flown per hour-of-day slot, for the radial chart. */
  byHour: number[];
}

/**
 * Distribution by hour of departure, in UTC.
 *
 * UTC and not local time on purpose: `takeoff` is stored as the UTC value the
 * pilot typed into the form, and re-interpreting it in a local zone would shift
 * every flight by three hours and quietly move the peak.
 */
export function timeOfDay(flights: Flight[]): TimeOfDay {
  const byHour = new Array(24).fill(0);
  for (const f of flights) {
    if (!f.takeoff) continue;
    const d = new Date(f.takeoff);
    if (isNaN(d.getTime())) continue;
    byHour[d.getUTCHours()] += f.duration;
  }
  const band = (from: number, to: number) =>
    byHour.slice(from, to).reduce((a, b) => a + b, 0);

  const maxHours = Math.max(...byHour);
  return {
    byHour,
    peakHour: maxHours > 0 ? byHour.indexOf(maxHours) : null,
    bands: [
      { label: "Mañana", range: "06-12", hours: band(6, 12) },
      { label: "Tarde", range: "12-18", hours: band(12, 18) },
      { label: "Atardecer", range: "18-24", hours: band(18, 24) },
      { label: "Madrugada", range: "00-06", hours: band(0, 6) },
    ],
  };
}

export interface AircraftRow {
  registration: string;
  type: string;
  flights: number;
  pic: number;
  total: number;
}

export function byAircraft(flights: Flight[], aircraft: Aircraft[], limit = 6): AircraftRow[] {
  const index = new Map(aircraft.map((a) => [a.id, a]));
  const acc = new Map<string, AircraftRow>();
  for (const f of flights) {
    const ac = f.aircraft_id ? index.get(f.aircraft_id) : undefined;
    const reg = ac?.registration || "Sin matrícula";
    const cur = acc.get(reg) || { registration: reg, type: ac?.type || "—", flights: 0, pic: 0, total: 0 };
    cur.flights += 1;
    cur.total += f.duration;
    cur.pic += n(f.pic_day_loc) + n(f.pic_day_tra) + n(f.pic_night_loc) + n(f.pic_night_tra);
    acc.set(reg, cur);
  }
  return [...acc.values()].sort((a, b) => b.total - a.total).slice(0, limit);
}

export interface Insight {
  eyebrow: string;
  headline: string;
  detail: string;
}

/**
 * Short natural-language read-outs over the same numbers.
 *
 * Rule-based, not generated: these are three arithmetic facts with a sentence
 * attached. Running a model over them would add latency and a bill for
 * something a percentage already answers, and it could get the number wrong.
 *
 * Anything the data does not support is omitted rather than padded — a card
 * that says "0% de tus horas" to a pilot with four flights is noise.
 */
export function buildInsights(flights: Flight[], aircraft: Aircraft[]): Insight[] {
  const out: Insight[] = [];
  if (flights.length === 0) return out;

  const total = flights.reduce((a, f) => a + f.duration, 0);

  // Weekend share.
  const weekendHours = flights.reduce((acc, f) => {
    const [y, m, d] = f.date.split("-").map(Number);
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return acc + (wd === 0 || wd === 6 ? f.duration : 0);
  }, 0);
  if (total > 0) {
    const pct = Math.round((weekendHours / total) * 100);
    out.push(
      pct >= 60
        ? {
            eyebrow: "Patrón semanal",
            headline: "Volás sobre todo los fines de semana",
            detail: `${pct}% de tus horas caen sábado o domingo.`,
          }
        : pct <= 20
          ? {
              eyebrow: "Patrón semanal",
              headline: "Preferís días de semana",
              detail: `Solo ${pct}% de tus horas son sábado o domingo.`,
            }
          : {
              eyebrow: "Patrón semanal",
              headline: "Volás repartido en la semana",
              detail: `${pct}% de tus horas caen el fin de semana.`,
            }
    );
  }

  // Busiest month.
  const perMonth = new Map<string, number>();
  for (const f of flights) {
    const key = f.date.slice(0, 7);
    perMonth.set(key, (perMonth.get(key) || 0) + f.duration);
  }
  const best = [...perMonth.entries()].sort((a, b) => b[1] - a[1])[0];
  if (best) {
    const [y, m] = best[0].split("-").map(Number);
    out.push({
      eyebrow: "Mejor mes",
      headline: `${MONTHS[m - 1]} ${y} fue tu techo · ${best[1].toFixed(1)} hs`,
      detail: "Tu mes más intenso en este período.",
    });
  }

  // Most-flown aircraft.
  const rows = byAircraft(flights, aircraft, 1);
  if (rows[0] && rows[0].registration !== "Sin matrícula") {
    const r = rows[0];
    out.push({
      eyebrow: "Favorita",
      headline: `${r.registration} te conoce mejor`,
      detail: `${r.flights} ${r.flights === 1 ? "vuelo registrado" : "vuelos registrados"} · ${r.total.toFixed(1)} hs.`,
    });
  }

  return out;
}

/** Coordenadas por código, tal como las resuelve la página del Resumen. */
type Coords = Record<string, { lat?: number; lon?: number }>;

/**
 * Millas náuticas recorridas, sumando tramo por tramo.
 *
 * Los vuelos cuyos aeródromos no tienen posición **no se cuentan y no se
 * estiman**: `legDistanceNm` devuelve null y acá se saltean. Por eso la función
 * devuelve también cuántos quedaron afuera — un total al que le faltan tramos y
 * no lo dice es peor que no mostrar total, porque el piloto no tiene forma de
 * saber que está mirando un número incompleto.
 *
 * Un circuito local mide cero, que es correcto: despegar y aterrizar en el mismo
 * campo no recorre distancia entre aeródromos.
 */
export function distanceTotals(flights: Flight[], coords: Coords) {
  let totalNm = 0;
  let estimadasNm = 0;
  let sinPosicion = 0;
  let masLargo = 0;

  for (const f of flights) {
    const [origin, destination] = splitRoute(f.route);
    if (!origin) continue;

    // Un vuelo local —mismo campo en los dos extremos, o un solo código— no
    // tiene distancia entre aeródromos que medir. Se estima aparte y **nunca**
    // se suma al total medido: mezclarlos daría un número mitad real y mitad
    // inventado sin que se note.
    if (!destination || destination === origin) {
      estimadasNm += estimatedLocalNm(f.duration ?? 0);
      continue;
    }

    const nm = legDistanceNm(coords[origin] ?? null, coords[destination] ?? null);
    if (nm === null) {
      sinPosicion++;
      continue;
    }
    totalNm += nm;
    if (nm > masLargo) masLargo = nm;
  }

  return { totalNm, estimadasNm, masLargo, sinPosicion };
}
