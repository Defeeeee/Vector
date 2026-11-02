import { eobtVigente, type Demora } from "./demora-plan";
import { localDesdeUtc, type FormularioPlan } from "./formulario-plan";

/**
 * Cómo termina un plan de vuelo: registrado en la bitácora, cancelado (CNL) o "no lo
 * volé" (migración 026 del backend).
 *
 * **El inicio pregunta "¿ya volaste?" recién después de la EOBT más la duración**
 * (Federico, 2026-10-20): antes de llegar no hay nada que registrar. Pregunta por los planes
 * que se presentaron (mandados o con el PDF bajado), no por un borrador, y sólo de los
 * últimos días: un plan de hace un mes ya no es un recordatorio, es ruido.
 *
 * **Un plan no es un vuelo** (como `planned_flights`, invariante 3): esto sólo precarga el
 * formulario de registrar. Nada cuenta hasta que el piloto lo guarda.
 *
 * Puro: la hora actual entra como parámetro.
 */

/** Hasta cuántos días después de la salida se sigue preguntando. */
export const DIAS_PARA_REGISTRAR = 3;

/** Lo que la lista del backend dice de un plan, sin el formulario. */
export interface ResumenParaCierre {
  id: string;
  completo: boolean;
  dof: string | null;
  descargado_at: string | null;
  enviado_at?: string | null;
  vuelo_id?: string | null;
  cancelado_at?: string | null;
  descartado_at?: string | null;
}

/**
 * Si vale la pena leer el plan entero para ver si ya se voló: presentado, sin cerrar, y con
 * fecha entre `DIAS_PARA_REGISTRAR` días atrás y hoy (UTC). Es el filtro barato, para no
 * pedir cincuenta planes en cada inicio.
 */
export function candidatoARegistrar(p: ResumenParaCierre, ahoraIso: string): boolean {
  if (!p.completo || !(p.enviado_at || p.descargado_at)) return false;
  if (p.vuelo_id || p.cancelado_at || p.descartado_at) return false;
  if (!p.dof) return false;
  const hoy = Date.parse(`${ahoraIso.slice(0, 10)}T00:00:00Z`);
  const dof = Date.parse(`${p.dof}T00:00:00Z`);
  // Un día más hacia atrás: una demora puede pasar la salida al día siguiente.
  return dof <= hoy && dof >= hoy - (DIAS_PARA_REGISTRAR + 1) * 86_400_000;
}

function msUtc(dof: string, hhmm: string): number {
  return Date.parse(`${dof}T${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}:00Z`);
}

const dos = (n: number) => String(n).padStart(2, "0");
const isoAHhmm = (ms: number) => `${dos(new Date(ms).getUTCHours())}${dos(new Date(ms).getUTCMinutes())}`;

/**
 * La salida vigente (la del plan, o la de la última demora) y la llegada estimada: la
 * salida más la duración (casilla 16). Sin duración, la llegada es la salida.
 */
export function horariosDelPlan(
  f: FormularioPlan,
  demoras: Demora[]
): { salidaMs: number; llegadaMs: number; dof: string; eobt: string; llegada: string } | null {
  const vigente = eobtVigente(f, demoras);
  if (!vigente || !/^\d{4}$/.test(vigente.eobt)) return null;
  const salidaMs = msUtc(vigente.dof, vigente.eobt);
  if (!Number.isFinite(salidaMs)) return null;
  const eet = /^(\d{2})(\d{2})$/.exec(f.eet ?? "");
  const llegadaMs = salidaMs + (eet ? (+eet[1] * 60 + +eet[2]) * 60_000 : 0);
  return { salidaMs, llegadaMs, dof: vigente.dof, eobt: vigente.eobt, llegada: isoAHhmm(llegadaMs) };
}

/**
 * Si el inicio pregunta por este plan: ya pasó la llegada estimada y todavía no pasaron
 * `DIAS_PARA_REGISTRAR` días.
 */
export function preguntarSiVolo(f: FormularioPlan, demoras: Demora[], ahoraIso: string): boolean {
  const h = horariosDelPlan(f, demoras);
  if (!h) return false;
  const ahora = Date.parse(ahoraIso);
  return ahora >= h.llegadaMs && ahora <= h.llegadaMs + DIAS_PARA_REGISTRAR * 86_400_000;
}

/** El mail "¿Cargamos tu vuelo?" sale una hora y media después de la llegada estimada. */
export const RECORDATORIO_MIN = 90;

/**
 * Si es hora del mail "¿Cargamos tu vuelo?" (Federico, 2026-10-20): pasó la llegada estimada
 * más `RECORDATORIO_MIN`, y no pasó un día. Un barrido que se cayó no manda, al volver, el
 * mail de un vuelo de antes de ayer.
 */
export function recordarAhora(f: FormularioPlan, demoras: Demora[], ahoraIso: string): boolean {
  const h = horariosDelPlan(f, demoras);
  if (!h) return false;
  const desde = h.llegadaMs + RECORDATORIO_MIN * 60_000;
  const ahora = Date.parse(ahoraIso);
  return ahora >= desde && ahora <= desde + 86_400_000;
}

/**
 * Si el vuelo ya está en la bitácora aunque no se haya registrado desde el plan (con el
 * copiloto o a mano): un vuelo de ese día (argentino) que sale del mismo aeródromo. Con eso
 * ni el inicio pregunta ni sale el mail.
 */
export function yaEstaEnLaBitacora(f: FormularioPlan, demoras: Demora[], vuelos: { date?: string | null; route?: string | null }[]): boolean {
  const h = horariosDelPlan(f, demoras);
  const salida = f.salida?.codigo?.trim().toUpperCase();
  if (!h || !salida) return false;
  const dia = localDesdeUtc(h.dof, h.eobt)?.fecha;
  return vuelos.some((v) => v.date === dia && (v.route ?? "").trim().toUpperCase().split(/\s+/)[0] === salida);
}

/** "SADF SADM": como guarda la ruta la bitácora. Un local repite el aeródromo. */
export function rutaParaBitacora(f: FormularioPlan): string | null {
  const salida = f.salida?.codigo?.trim().toUpperCase();
  if (!salida) return null;
  const destino = f.destino?.codigo?.trim().toUpperCase() || salida;
  return `${salida} ${destino}`;
}

/**
 * Lo que se precarga en "Registrar vuelo" (`lib/prefill.ts`): el avión, la ruta y la fecha
 * argentina de la salida. **Los horarios no** (Federico, 2026-10-20): la EOBT es la hora de
 * calzos estimada y en la práctica no coincide con el despegue ni el aterrizaje, y un
 * horario precargado se guarda sin mirarlo. Se escriben los reales.
 */
export function prefillDesdePlan(f: FormularioPlan, demoras: Demora[]) {
  const h = horariosDelPlan(f, demoras);
  if (!h) return null;
  return {
    aircraft_id: f.aircraftId ?? undefined,
    route: rutaParaBitacora(f) ?? undefined,
    date: localDesdeUtc(h.dof, h.eobt)?.fecha,
  };
}

/** El link a "Registrar vuelo" con lo del plan, y el plan para unirlo al vuelo al guardar. */
export function hrefRegistrarDesdePlan(id: string, f: FormularioPlan, demoras: Demora[]): string {
  const p = prefillDesdePlan(f, demoras);
  const q = new URLSearchParams({ prefill: "true", plan_vuelo_id: id });
  if (p) for (const [k, v] of Object.entries(p)) if (v) q.set(k, v);
  return `/dashboard/log-flight?${q.toString()}`;
}
