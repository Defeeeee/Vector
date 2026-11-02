import { Aircraft, Flight } from "@/types";
import { splitRoute } from "@/lib/route";

/**
 * Métricas que define el piloto.
 *
 * **Por qué existe.** `PCATracker` funciona bien pero está atado a un único camino
 * —PPA hacia PCA— con los mínimos escritos en el código. Un alumno de otra escuela,
 * o alguien persiguiendo una habilitación distinta, no tiene nada. Y cada vez que
 * apareciera un requisito nuevo habría que hardcodear otra regulación.
 *
 * Con esto, la experiencia reciente y los hitos dejan de ser features separadas y
 * pasan a ser **presets**: la misma máquina con distintos parámetros.
 *
 * Se evalúa en el cliente a propósito. Ver `MAX_PATTERN_LENGTH`.
 */

export type StatMetric = "horas" | "aterrizajes" | "vuelos";
export type RegexField = "route" | "purpose" | "remarks";

export interface CustomStat {
  id: string;
  name: string;
  metric: StatMetric;
  /** Todos opcionales; los que estén se aplican en conjunto (AND). */
  aircraftId?: string | null;
  clase?: string | null;
  purpose?: string | null;
  /** ICAO que tiene que aparecer en alguno de los dos extremos de la ruta. */
  airport?: string | null;
  windowDays?: number | null;
  /** Sin objetivo es un contador; con objetivo es una barra de progreso. */
  target?: number | null;
  regexField?: RegexField | null;
  regexPattern?: string | null;
}

export interface StatResult {
  value: number;
  target: number | null;
  /** null cuando la métrica no tiene objetivo: no es ni cumplida ni incumplida. */
  met: boolean | null;
  /** Cuántos vuelos entraron en el cálculo. Ayuda a entender un número raro. */
  flights: number;
  /** Presente cuando el patrón se descartó, con el motivo. */
  regexError?: string;
}

/**
 * Tope de largo del patrón.
 *
 * El regex se evalúa **en el navegador del piloto que lo escribió**, no en el
 * servidor, y eso es una decisión de diseño y no una casualidad: el dashboard ya
 * tiene todos los vuelos cargados, así que un patrón catastrófico cuelga una
 * pestaña en vez del proceso que atiende a todos.
 *
 * El tope y la validación de sintaxis achican el problema; **no lo eliminan**.
 * JavaScript no permite interrumpir un regex una vez que arrancó, así que una
 * expresión con cuantificadores anidados sobre un texto largo puede colgar la
 * pestaña igual. Resolverlo de verdad pide RE2 o un worker con timeout, que no
 * está en las dependencias y no se justifica para esto.
 */
export const MAX_PATTERN_LENGTH = 200;

/** Heurística barata contra el caso clásico: un cuantificador dentro de otro. */
const CUANTIFICADOR_ANIDADO = /\([^)]*[+*]\)[+*]/;

function compilar(stat: CustomStat): { re: RegExp | null; error?: string } {
  const patron = stat.regexPattern?.trim();
  if (!patron || !stat.regexField) return { re: null };
  if (patron.length > MAX_PATTERN_LENGTH) {
    return { re: null, error: `El patrón supera los ${MAX_PATTERN_LENGTH} caracteres.` };
  }
  if (CUANTIFICADOR_ANIDADO.test(patron)) {
    return { re: null, error: "El patrón tiene cuantificadores anidados y puede colgar la página." };
  }
  try {
    return { re: new RegExp(patron, "i") };
  } catch {
    return { re: null, error: "El patrón no es una expresión regular válida." };
  }
}

const dentroDeVentana = (fecha: string, windowDays: number | null | undefined, hoy: Date): boolean => {
  if (!windowDays) return true;
  const desde = new Date(hoy);
  desde.setUTCDate(desde.getUTCDate() - windowDays);
  return fecha.slice(0, 10) >= desde.toISOString().slice(0, 10);
};

const horasDe = (f: Flight): number => f.duration || 0;

/**
 * Evalúa una métrica contra los vuelos.
 *
 * Los filtros se combinan con AND, que es lo que espera alguien que marca dos
 * casillas. Un filtro vacío no filtra.
 */
export function evaluateStat(
  stat: CustomStat,
  flights: Flight[],
  aircraft: Aircraft[],
  hoy = new Date()
): StatResult {
  const claseDe = new Map(aircraft.map((a) => [a.id, (a.type_acft || "").trim()]));
  const { re, error } = compilar(stat);

  const seleccion = flights.filter((f) => {
    if (stat.aircraftId && f.aircraft_id !== stat.aircraftId) return false;
    if (stat.clase && (f.aircraft_id ? claseDe.get(f.aircraft_id) : "") !== stat.clase) return false;
    if (stat.purpose && f.purpose !== stat.purpose) return false;
    if (!dentroDeVentana(f.date, stat.windowDays, hoy)) return false;

    if (stat.airport) {
      const buscado = stat.airport.trim().toUpperCase();
      const [origen, destino] = splitRoute(f.route);
      if (origen !== buscado && destino !== buscado) return false;
    }

    if (re && stat.regexField) {
      const texto = (f[stat.regexField] ?? "") as string;
      if (!re.test(texto)) return false;
    }

    return true;
  });

  const value =
    stat.metric === "horas"
      ? Number(seleccion.reduce((acc, f) => acc + horasDe(f), 0).toFixed(1))
      : stat.metric === "aterrizajes"
        ? seleccion.reduce((acc, f) => acc + (f.landings || 0), 0)
        : seleccion.length;

  const target = stat.target ?? null;

  return {
    value,
    target,
    met: target === null ? null : value >= target,
    flights: seleccion.length,
    ...(error ? { regexError: error } : {}),
  };
}

/**
 * Métricas que se ofrecen armadas, para que nadie tenga que aprender el
 * constructor antes de sacarle provecho.
 *
 * La recencia está acá y no hardcodeada en otro lado: es el mismo motor. La
 * ventana correcta depende de la licencia (RAAC 61.140(a)(2) la extiende a 180
 * días para piloto privado), así que se recibe en vez de suponerse.
 */
export function presets(windowDays: number): Omit<CustomStat, "id">[] {
  return [
    {
      name: "Experiencia reciente",
      metric: "aterrizajes",
      windowDays,
      target: 3,
    },
    { name: "Primeras 100 horas", metric: "horas", target: 100 },
    { name: "Horas de instrucción recibida", metric: "horas", purpose: "INST" },
    { name: "Aterrizajes este año", metric: "aterrizajes", windowDays: 365 },
  ];
}
