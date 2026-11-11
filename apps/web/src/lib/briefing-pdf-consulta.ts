import { fichaDesdeElNavegador } from "./anac-navegador";
import type { CategoriaVuelo } from "./briefing";
import type { EstacionBriefing } from "./briefing-pdf-datos";

/**
 * Lo que el briefing en PDF le pregunta a cada aeródromo: **lo mismo y por el mismo camino** que
 * `components/dashboard/BriefingRuta.tsx` (`/api/weather` y `fichaDesdeElNavegador`, que reusa
 * lo guardado según `lib/anac-vigencia.ts`: MADHEL 24 h, NOTAM 15 min). No hay ningún pedido
 * nuevo a ANAC ni desde el server. Sólo navegador.
 *
 * Se repite en vez de extraerse porque `BriefingRuta` no se toca; si cambia allá (el presupuesto,
 * el camino), hay que cambiarlo acá.
 */

/** El mismo presupuesto de `BriefingRuta`: sin esto, ANAC cuelga la pantalla. */
export const TIMEOUT_MS = 10000;

/** `/api/weather` devuelve el literal "No disponible" en vez de `null`. */
const texto = (v: unknown): string | null =>
  typeof v === "string" && v.trim() && v.trim() !== "No disponible" ? v.trim() : null;

export async function consultarAerodromo(codigo: string, nombre: string, signal: AbortSignal): Promise<EstacionBriefing> {
  const q = encodeURIComponent(codigo);
  const [clima, ficha] = await Promise.allSettled([
    fetch(`/api/weather?icao=${q}`, { signal }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))),
    fichaDesdeElNavegador(codigo, undefined, signal),
  ]);
  // `null` y no `[]`: "no pudimos preguntar" no es "no hay NOTAM".
  const notams = ficha.status === "fulfilled" && Array.isArray(ficha.value.notams) ? ficha.value.notams : null;
  const base = {
    codigo,
    nombre,
    notams,
    notamsCapturadosEn: ficha.status === "fulfilled" ? ficha.value.notamsCapturadosEn ?? null : null,
    notamsFuente: ficha.status === "fulfilled" ? ficha.value.notamsFuente ?? null : null,
  };
  if (clima.status !== "fulfilled") {
    return { ...base, climaRespondio: false, metar: null, taf: null, observadoEn: null, estacionCercana: null };
  }
  const c = clima.value as {
    metar?: unknown;
    taf?: unknown;
    category?: CategoriaVuelo;
    observadoEn?: unknown;
    nearestStation?: EstacionBriefing["estacionCercana"];
  };
  return {
    ...base,
    climaRespondio: true,
    metar: texto(c.metar),
    taf: texto(c.taf),
    observadoEn: typeof c.observadoEn === "string" ? c.observadoEn : null,
    estacionCercana: c.nearestStation ?? null,
  };
}

/** Los aeródromos de la ruta, en paralelo y con un solo corte de tiempo, como `BriefingRuta`. */
export async function consultarAerodromos(puntos: { codigo: string; nombre: string }[]): Promise<EstacionBriefing[]> {
  const controlador = new AbortController();
  const reloj = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  try {
    return await Promise.all(puntos.map((p) => consultarAerodromo(p.codigo, p.nombre, controlador.signal)));
  } finally {
    clearTimeout(reloj);
  }
}
