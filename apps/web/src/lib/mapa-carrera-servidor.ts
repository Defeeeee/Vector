import { apiFetch, TIMEOUT_IMAGEN_MS } from "@/lib/api";
import { getAirport } from "@/lib/airports";
import {
  calcularMapaCarrera,
  filtrosDeLaUrl,
  opcionesDelMapa,
  type FiltrosMapa,
  type MapaCarrera,
  type OpcionesMapa,
} from "@/lib/mapa-carrera";
import type { Aircraft, Flight } from "@/types";

/**
 * Lo que "Tu mapa" lee del backend, y el cálculo, para la pantalla y para la imagen. Sólo del
 * server: usa el directorio de aeródromos (`getAirport`, TSV en memoria).
 */

export type ResultadoMapaCarrera =
  | { estado: "sin-sesion" }
  | { estado: "error" }
  | { estado: "ok"; datos: MapaCarrera; opciones: OpcionesMapa; invalido: boolean };

/**
 * `anio` y `avion` vienen crudos de la URL y se validan contra lo que el piloto tiene
 * (`filtrosDeLaUrl`). `fresco`: la imagen se pide sin cache y con el presupuesto largo.
 */
export async function cargarMapaCarrera(anio: string | null | undefined, avion: string | null | undefined, fresco = false): Promise<ResultadoMapaCarrera> {
  const opciones = fresco ? ({ cache: "no-store" } as const) : {};
  const tope = fresco ? { timeoutMs: TIMEOUT_IMAGEN_MS } : undefined;
  const res = await apiFetch("/dashboard", opciones, tope);
  if (res.status === 401) return { estado: "sin-sesion" };
  if (!res.ok) return { estado: "error" };

  const data = await res.json();
  const flights: Flight[] = data.flights || [];
  const aircraft: Aircraft[] = data.aircraft || [];

  const disponibles = opcionesDelMapa(flights, aircraft);
  const { filtros, invalido } = filtrosDeLaUrl(anio, avion, disponibles);
  const datos = calcularMapaCarrera({
    flights,
    aircraft,
    filtros,
    ubicar: (codigo) => {
      const a = getAirport(codigo);
      return a && typeof a.lat === "number" && typeof a.lon === "number"
        ? { lat: a.lat, lon: a.lon, nombre: a.label || a.name, provincia: a.madhel?.province || undefined }
        : null;
    },
  });
  return { estado: "ok", datos, opciones: disponibles, invalido };
}

/** La URL de la pantalla con unos filtros: sólo lo que está puesto. */
export function urlDelMapa(f: FiltrosMapa): string {
  const q = new URLSearchParams();
  if (f.anio !== null) q.set("anio", String(f.anio));
  if (f.avionId !== null) q.set("avion", f.avionId);
  const s = q.toString();
  return `/dashboard/summary/mapa${s ? `?${s}` : ""}`;
}
