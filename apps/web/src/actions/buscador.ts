"use server";

import { apiFetch } from "@/lib/api";
import { searchAirports } from "@/lib/airports";
import { esErrorDeRedirect } from "@/lib/redirect-error";
import type { Aircraft, Flight } from "@/types";

export interface VueloEncontrado {
  id: string;
  /** "12/10/2026", armada acá: el cliente no formatea fechas (invariante 1). */
  fecha: string;
  ruta: string;
  matricula: string | null;
  horas: number;
}

export interface AerodromoEncontrado {
  icao: string;
  nombre: string;
  ciudad: string;
}

const fechaCorta = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

/**
 * Lo que el buscador (⌘K, `BuscadorGlobal`) necesita del server: vuelos y aeródromos.
 *
 * - Los vuelos, por ruta u observaciones (`/flights/history?q=`, el `ilike` del backend) y,
 *   si lo escrito es la matrícula de un avión del Hangar, por ese avión: el backend no busca
 *   en la matrícula (ver `controllers/flights.py`).
 * - Los aeródromos, del directorio en memoria, como `/api/airports/search`.
 *
 * Es una lectura: no revalida nada. La coma y los paréntesis se sacan porque el backend arma
 * un `or_` de PostgREST con el texto, y ahí son sintaxis.
 */
export async function buscarEnVector(texto: string): Promise<{ vuelos: VueloEncontrado[]; aerodromos: AerodromoEncontrado[] }> {
  const q = String(texto ?? "").replace(/[,()%*\\]/g, " ").trim().slice(0, 60);
  if (q.length < 2) return { vuelos: [], aerodromos: [] };

  let aerodromos = searchAirports(q, 3).map((a) => ({ icao: a.icao, nombre: a.name, ciudad: a.city }));
  let vuelos: VueloEncontrado[] = [];
  try {
    const avionesRes = await apiFetch("/aircraft");
    const aviones: Aircraft[] = avionesRes.ok ? await avionesRes.json() : [];
    const matricula = (a: Aircraft) => a.registration.replace(/-/g, "").toUpperCase();
    const buscado = q.replace(/[-\s]/g, "").toUpperCase();
    // "LV-ABC", "lvabc" o, como se dice en el aeroclub, "ABC".
    const avion = buscado.length >= 3 ? aviones.find((a) => matricula(a) === buscado || (buscado.length === 3 && matricula(a).endsWith(buscado))) : undefined;
    // Si es una matrícula, un aeródromo con ese código IATA ("ABC", Albacete) es ruido.
    if (avion) aerodromos = [];

    const r = await apiFetch(
      avion ? `/flights/history?aeronaveId=${avion.id}&limit=6` : `/flights/history?q=${encodeURIComponent(q)}&limit=6`
    );
    if (r.ok) {
      const { items } = (await r.json()) as { items: Flight[] };
      const porId = new Map(aviones.map((a) => [a.id, a.registration]));
      vuelos = items.map((f) => ({
        id: f.id,
        fecha: fechaCorta(f.date),
        ruta: f.route,
        matricula: f.aircraft_id ? porId.get(f.aircraft_id) ?? null : null,
        horas: f.duration,
      }));
    }
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
  }
  return { vuelos, aerodromos };
}
