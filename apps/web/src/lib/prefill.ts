/**
 * El prefill de "Nuevo Vuelo", en un solo lugar.
 *
 * Salió de las páginas cuando había dos —`/dashboard/log-flight` y un modal
 * interceptado que parseaba los mismos parámetros con el mismo objeto literal
 * escrito dos veces—. El modal ya no existe, pero el parser se queda acá: es un
 * `.ts` puro, así que —a diferencia de las páginas— se puede testear, y el
 * `vitest.config.mts` de este repo sólo mira `src/**\/*.test.ts`.
 *
 * Quién genera estas URLs:
 * - el backend, al cerrar una sesión de vuelo desde WhatsApp o desde un Atajo de
 *   iOS (`flight_helper.py`);
 * - `prefillHref` en `planned-flights.ts`, al completar un vuelo programado;
 * - `hrefRegistrarDesdePlan` en `plan-cierre.ts`, al registrar un plan de vuelo ya volado
 *   (con `plan_vuelo_id`, y sin horarios).
 */

export interface FlightPrefill {
  aircraft_id?: string;
  route?: string;
  takeoff?: string;
  landing?: string;
  date?: string;
  landings?: number;
  duration?: string;
  purpose?: string;
}

export type SearchParams = { [key: string]: string | string[] | undefined };

/** Un parámetro repetido (`?route=a&route=b`) llega como array; nos quedamos con el primero. */
function texto(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  // El vacío se descarta igual que el ausente: `?route=` no es una ruta.
  return typeof s === "string" && s.length > 0 ? s : undefined;
}

/**
 * Lee los parámetros de prefill y, si viene, el id del vuelo programado que esta
 * carga tiene que cerrar.
 *
 * **Las claves ausentes no aparecen en el objeto.** Antes se asignaban con un cast
 * (`resolvedParams.route as string`), que para una clave que no vino deja
 * `undefined` en una propiedad declarada como `string` — el tipo miente y cualquier
 * consumidor que confíe en él recibe algo que no es. Acá se omiten de verdad.
 */
export function parsePrefill(params: SearchParams | undefined): {
  initialData?: FlightPrefill;
  plannedId?: string;
  /** El plan de vuelo que se está registrando: se une al vuelo cuando se guarda. */
  planVueloId?: string;
} {
  const p = params || {};
  if (texto(p.prefill) !== "true") return {};

  const data: FlightPrefill = {};
  const aircraft_id = texto(p.aircraft_id);
  const route = texto(p.route);
  const takeoff = texto(p.takeoff);
  const landing = texto(p.landing);
  const date = texto(p.date);
  const duration = texto(p.duration);
  const purpose = texto(p.purpose);
  const landings = texto(p.landings);

  if (aircraft_id) data.aircraft_id = aircraft_id;
  if (route) data.route = route;
  if (takeoff) data.takeoff = takeoff;
  if (landing) data.landing = landing;
  if (date) data.date = date;
  if (duration) data.duration = duration;
  // `purpose` viajaba en la URL y se descartaba al parsear, aunque el formulario
  // siempre lo aceptó. Un vuelo de instrucción programado puede llegar con INST.
  if (purpose) data.purpose = purpose;

  if (landings) {
    const n = parseInt(landings, 10);
    // Un `?landings=hola` dejaba `NaN` en un campo numérico del formulario.
    if (Number.isFinite(n)) data.landings = n;
  }

  const planVueloId = texto(p.plan_vuelo_id);
  return {
    initialData: data,
    plannedId: texto(p.planned_id),
    // Un id con otra forma no llega al backend: el PATCH lo rechazaría igual.
    ...(planVueloId && /^[0-9a-f-]{36}$/i.test(planVueloId) ? { planVueloId } : {}),
  };
}
