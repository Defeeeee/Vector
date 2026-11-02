/**
 * Vuelos programados: qué preguntar, cuándo, y cómo se convierte en vuelo.
 *
 * Todo lo decidible del calendario vive acá y no en la vista, por una razón
 * concreta: `vitest.config.mts` corre en `environment: "node"` con
 * `include: ["src/**\/*.test.ts"]`, así que **un componente no se puede testear en
 * este repo**. Lo que esté en un `.tsx` se verifica a mano para siempre.
 *
 * Regla de oro del módulo: **`todayIso` entra siempre por parámetro y nunca se lee
 * del reloj acá adentro.** Es la misma disciplina de `filterByPeriod`
 * (`summary.ts:43`) y del heatmap, y existe porque este repo ya se comió dos bugs
 * de hidratación: `new Date("2026-08-14")` es medianoche UTC, que leída en UTC-3
 * cae el 13, y el servidor y el navegador terminan discrepando de día.
 *
 * Todas las comparaciones de fecha son entre cadenas ISO "YYYY-MM-DD", que ordenan
 * lexicográficamente igual que cronológicamente. Ningún `Date` de por medio.
 */

import { soloHoraYMinuto } from "./horarios";
import type { Flight, PlannedFlight } from "@/types";

/**
 * A los cuántos días se deja de preguntar por un vuelo programado.
 *
 * Un plan de hace dos meses que el piloto nunca contestó ya no es un recordatorio
 * útil: es ruido que entrena a ignorar la tarjeta. Sigue visible en el calendario
 * —"no volé el martes" es información— pero deja de interrumpir el dashboard.
 *
 * Derivado de la fecha, no guardado en una columna ni barrido por un cron. El
 * único cron del repo es el de vencimientos y no hace falta un segundo.
 */
export const DIAS_HASTA_VENCIDO = 30;

/** Cuántos pendientes se listan antes de que la tarjeta se colapse a un link. */
export const MAX_PENDIENTES_EN_LISTA = 2;

export type EstadoProgramado =
  | "futuro"
  | "hoy"
  | "pendiente"
  | "pospuesto"
  | "vencido"
  | "completado"
  | "descartado";

/**
 * Suma días a una fecha ISO y devuelve otra fecha ISO.
 *
 * Todo en UTC: `Date.UTC` normaliza el mes y el año, así que el 31 de diciembre + 1
 * da el 1 de enero sin casos especiales, y no hay horario de verano que corra el
 * día. Lo usa "Después" para calcular hasta cuándo posponer.
 */
export function sumarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Días entre dos fechas ISO, sin construir un `Date` local. */
function diasEntre(desdeIso: string, hastaIso: string): number {
  const a = Date.parse(`${desdeIso}T00:00:00Z`);
  const b = Date.parse(`${hastaIso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * En qué situación está un plan hoy.
 *
 * El estado guardado gana sobre la fecha: un plan `completado` con fecha de ayer es
 * `completado`, no `pendiente`. Sólo los que siguen abiertos se clasifican por
 * calendario.
 */
export function estadoProgramado(p: PlannedFlight, todayIso: string): EstadoProgramado {
  if (p.status === "completado") return "completado";
  if (p.status === "descartado") return "descartado";

  // Un vuelo programado **para hoy no es pendiente**: el día no terminó.
  // Preguntarle a las 9 de la mañana si ya voló es la forma más rápida de
  // enseñarle a ignorar la tarjeta.
  if (p.date > todayIso) return "futuro";
  if (p.date === todayIso) return "hoy";

  // El postergado vence *el* día, no *después* del día: si pidió "mañana", mañana
  // se vuelve a preguntar.
  if (p.postponed_until && p.postponed_until > todayIso) return "pospuesto";

  if (diasEntre(p.date, todayIso) > DIAS_HASTA_VENCIDO) return "vencido";
  return "pendiente";
}

/**
 * Los que la tarjeta del dashboard tiene que preguntar, del más viejo al más nuevo.
 *
 * El más viejo primero a propósito: es el que más riesgo tiene de que el piloto ya
 * no se acuerde, y el que más conviene resolver antes de que se pierda del todo.
 */
export function pendientesDeConfirmar(
  planned: PlannedFlight[],
  todayIso: string
): PlannedFlight[] {
  return planned
    .filter((p) => estadoProgramado(p, todayIso) === "pendiente")
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export interface ResumenPendientes {
  /** `lista` muestra cada uno con sus botones; `resumen` es una línea con un link. */
  modo: "lista" | "resumen";
  visibles: PlannedFlight[];
  total: number;
}

/**
 * Dónde la tarjeta deja de ser una lista y pasa a ser un link al calendario.
 *
 * La tarjeta es una interrupción arriba del pliegue, compitiendo con
 * `FlightStatusCard` y `PrimerosPasos`. Una interrupción que enumera cinco cosas ya
 * no es una interrupción, es una pantalla — y el calendario ya es esa pantalla, con
 * mejores herramientas para trabajo en lote.
 */
export function resumenPendientes(pendientes: PlannedFlight[]): ResumenPendientes {
  if (pendientes.length > MAX_PENDIENTES_EN_LISTA) {
    return { modo: "resumen", visibles: [], total: pendientes.length };
  }
  return { modo: "lista", visibles: pendientes, total: pendientes.length };
}

/**
 * El link para completar un plan: el **único** lugar que arma esta URL.
 *
 * Reusa el prefill que ya existe (`log-flight/page.tsx` lo parsea desde que lo
 * estrenó el camino de WhatsApp/Atajos), así que completar un vuelo programado **no
 * necesita un formulario nuevo**: es un link al que ya está.
 *
 * Las claves ausentes **no se emiten**. Un `?aircraft_id=undefined` llega al form
 * como la cadena literal `"undefined"` y queda seleccionado un avión que no existe:
 * es indistinguible de un valor real para el que lo lee.
 */
export function prefillQuery(p: PlannedFlight): string {
  const params = new URLSearchParams({ prefill: "true", planned_id: p.id, date: p.date });
  if (p.aircraft_id) params.set("aircraft_id", p.aircraft_id);
  if (p.route) params.set("route", p.route);
  // Las horas van tal cual: guardadas en UTC y leídas en UTC por el formulario,
  // que es donde el interruptor local/UTC decide cómo mostrarlas. Recortadas a
  // "HH:MM" porque Postgres manda los segundos y un `<input type="time">` con
  // segundos se queda vacío sin decir nada.
  const despegue = soloHoraYMinuto(p.takeoff_time);
  const aterrizaje = soloHoraYMinuto(p.landing_time);
  if (despegue) params.set("takeoff", despegue);
  if (aterrizaje) params.set("landing", aterrizaje);
  return params.toString();
}

export function prefillHref(p: PlannedFlight): string {
  return `/dashboard/log-flight?${prefillQuery(p)}`;
}

// ---------------------------------------------------------------------------
// La grilla del mes
// ---------------------------------------------------------------------------

export interface DiaCalendario {
  /** "YYYY-MM-DD" */
  iso: string;
  dia: number;
  /** Falso para los días de relleno del mes anterior y el siguiente. */
  delMes: boolean;
  esHoy: boolean;
  planned: PlannedFlight[];
  flights: Flight[];
}

/** `true` si es un "YYYY-MM" válido. Es la guarda del searchParam del calendario. */
export function esMesIso(raw: unknown): raw is string {
  return typeof raw === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw);
}

/** Corre un "YYYY-MM" tantos meses, hacia adelante o atrás. */
export function correrMes(mesIso: string, delta: number): string {
  const [y, m] = mesIso.split("-").map(Number);
  // `m - 1 + delta` puede ser negativo o pasarse de 11; `Date.UTC` normaliza el año.
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function etiquetaMes(mesIso: string): string {
  const [y, m] = mesIso.split("-").map(Number);
  return `${MESES[m - 1]} ${y}`;
}

export interface Mes {
  semanas: DiaCalendario[][];
  etiqueta: string;
  anterior: string;
  siguiente: string;
}

/**
 * Horas voladas en el mes que se está mirando.
 *
 * **Sólo los días del propio mes.** La grilla arrastra días de relleno del mes
 * anterior y el siguiente —con sus vuelos, para que no aparezca un agujero al
 * cambiar de mes— y sumarlos haría que agosto incluya el 31 de julio.
 *
 * Y sólo vuelos: un programado no tiene duración y, aunque la tuviera, sumar una
 * intención a un total de horas es exactamente lo que este plan evita.
 */
export function horasDelMes(semanas: DiaCalendario[][]): number {
  let total = 0;
  for (const semana of semanas) {
    for (const dia of semana) {
      if (!dia.delMes) continue;
      for (const f of dia.flights) total += Number(f.duration) || 0;
    }
  }
  return total;
}

/**
 * La grilla de un mes, mezclando lo programado y lo ya volado.
 *
 * Siempre **6 filas de 7**, aunque sobren días: si la grilla cambiara de alto entre
 * un mes de 5 semanas y uno de 6, la página saltaría al navegar.
 *
 * Los días de relleno —los del mes anterior y el siguiente— **igual llevan sus
 * vuelos**, en gris. Si no, un vuelo del 31 de agosto desaparece al mirar
 * septiembre y el piloto ve un agujero donde hay un vuelo.
 *
 * Semana arrancando en lunes, con la misma expresión que usa el heatmap
 * (`(getUTCDay() + 6) % 7`), para que las dos grillas de la app coincidan en dónde
 * empieza la semana.
 */
export function mesDe(input: {
  mesIso: string;
  todayIso: string;
  planned: PlannedFlight[];
  flights: Flight[];
}): Mes {
  const { mesIso, todayIso, planned, flights } = input;
  const [y, m] = mesIso.split("-").map(Number);

  const porFecha = new Map<string, { planned: PlannedFlight[]; flights: Flight[] }>();
  const casillero = (iso: string) => {
    let c = porFecha.get(iso);
    if (!c) porFecha.set(iso, (c = { planned: [], flights: [] }));
    return c;
  };
  for (const p of planned) casillero(p.date).planned.push(p);
  // `f.date` puede venir con hora pegada de algún origen viejo; el prefijo alcanza.
  for (const f of flights) casillero(String(f.date).slice(0, 10)).flights.push(f);

  // Dentro de un día, por hora de despegue. Los que no tienen hora van al final:
  // un plan sin hora es "en algún momento del sábado", y ponerlo primero afirmaría
  // que sale antes que uno de las 07:00.
  //
  // Comparación explícita y no `localeCompare` con un centinela: la colación de
  // ICU le da poco peso a la puntuación, así que un `"~"` **no** queda después de
  // los dígitos y los sin hora terminaban primero. Como son "HH:MM:SS", el orden
  // lexicográfico directo ya es el cronológico.
  for (const casilla of porFecha.values()) {
    casilla.planned.sort((a, b) => {
      const ha = a.takeoff_time || "";
      const hb = b.takeoff_time || "";
      if (!ha !== !hb) return ha ? -1 : 1;
      return ha < hb ? -1 : ha > hb ? 1 : 0;
    });
  }

  const primero = new Date(Date.UTC(y, m - 1, 1));
  const desplazamiento = (primero.getUTCDay() + 6) % 7;

  const semanas: DiaCalendario[][] = [];
  for (let semana = 0; semana < 6; semana++) {
    const fila: DiaCalendario[] = [];
    for (let dia = 0; dia < 7; dia++) {
      const offset = semana * 7 + dia - desplazamiento;
      const fecha = new Date(Date.UTC(y, m - 1, 1 + offset));
      const iso = fecha.toISOString().slice(0, 10);
      const contenido = porFecha.get(iso);
      fila.push({
        iso,
        dia: fecha.getUTCDate(),
        delMes: fecha.getUTCMonth() === m - 1 && fecha.getUTCFullYear() === y,
        esHoy: iso === todayIso,
        planned: contenido?.planned ?? [],
        flights: contenido?.flights ?? [],
      });
    }
    semanas.push(fila);
  }

  return {
    semanas,
    etiqueta: etiquetaMes(mesIso),
    anterior: correrMes(mesIso, -1),
    siguiente: correrMes(mesIso, 1),
  };
}
