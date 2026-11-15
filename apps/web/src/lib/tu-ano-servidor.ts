import { apiFetch, TIMEOUT_IMAGEN_MS } from "@/lib/api";
import { getAirport } from "@/lib/airports";
import { openingTotals } from "@/lib/summary";
import { esAlumno } from "@/lib/licencias";
import { aniosConVuelos, anioActualArgentina, calcularTuAno, type TuAno } from "@/lib/tu-ano";
import type { Aircraft, Flight, Logbook, Profile } from "@/types";

/**
 * Lo que "Tu año en vuelo" lee del backend, y el cálculo, para la página y para la imagen.
 * Sólo del server: usa el directorio de aeródromos (`getAirport`, TSV en memoria).
 */

export type ResultadoTuAno =
  | { estado: "sin-sesion" }
  | { estado: "error" }
  | { estado: "ok"; datos: TuAno; anios: number[]; anioActual: number };

/**
 * `anioPedido` null = el año en curso en hora argentina. Si el año pedido no tiene vuelos, igual
 * se calcula (queda en cero): quien llama decide qué hacer con eso.
 *
 * `fresco`: la imagen se pide sin cache (se comparte como si fuera un dato) y con el presupuesto
 * largo de las imágenes; la página usa los 20 s de siempre.
 */
export async function cargarTuAno(anioPedido: number | null, fresco = false): Promise<ResultadoTuAno> {
  const opciones = fresco ? ({ cache: "no-store" } as const) : {};
  const tope = fresco ? { timeoutMs: TIMEOUT_IMAGEN_MS } : undefined;
  const [dashRes, lbRes] = await Promise.all([
    apiFetch("/dashboard", opciones, tope),
    apiFetch("/logbooks", opciones, tope),
  ]);
  if (dashRes.status === 401 || lbRes.status === 401) return { estado: "sin-sesion" };
  if (!dashRes.ok) return { estado: "error" };

  const data = await dashRes.json();
  const flights: Flight[] = data.flights || [];
  const aircraft: Aircraft[] = data.aircraft || [];
  const perfil: Profile | null = data.profile || null;
  const logbooks: Logbook[] = lbRes.ok ? await lbRes.json() : [];

  const anioActual = anioActualArgentina(new Date());
  const anios = aniosConVuelos(flights, aircraft);
  const anio = anioPedido ?? anioActual;

  const datos = calcularTuAno({
    flights,
    aircraft,
    anio,
    ubicar: (codigo) => {
      const a = getAirport(codigo);
      return a && typeof a.lat === "number" && typeof a.lon === "number"
        ? { lat: a.lat, lon: a.lon, nombre: a.label || a.name }
        : null;
    },
    fechaPpa: perfil?.fecha_ppa,
    aperturaHoras: openingTotals(logbooks, { alumno: esAlumno(perfil?.license_type) }).totalHours,
  });
  return { estado: "ok", datos, anios, anioActual };
}

/** `?anio=2026`: un entero de cuatro cifras razonable, o null. */
export function anioDeLaUrl(valor: string | null | undefined): number | null {
  if (!valor || !/^\d{4}$/.test(valor)) return null;
  const n = Number(valor);
  return n >= 1990 && n <= 2100 ? n : null;
}
