import { apiFetch } from "@/lib/api";
import type { Aircraft } from "@/types";
import { tokensDeRuta } from "@/lib/mapa-ruta";
import type { SearchParams } from "@/lib/prefill";
import MapaClient from "@/components/dashboard/mapa/MapaClient";

/**
 * **El Mapa** (3.0.0): planificar una ruta sobre el mapa y, con "Volar", seguirla con el GPS
 * del teléfono. Todo el trabajo es del cliente; el servidor sólo lee la ruta de la URL
 * (`?ruta=SADF-SADM`, como el Planificador) y la velocidad del primer avión que la tenga.
 */

const unParametro = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));

async function tasDelHangar(): Promise<number | null> {
  try {
    const res = await apiFetch("/aircraft");
    if (!res.ok) return null;
    const flota = (await res.json()) as Aircraft[];
    return flota.find((a) => !a.is_simulator && a.cruise_tas_kt)?.cruise_tas_kt ?? null;
  } catch {
    return null;
  }
}

export default async function MapaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, tas] = await Promise.all([searchParams, tasDelHangar()]);
  return <MapaClient rutaInicial={tokensDeRuta(unParametro(params.ruta)).join(" ")} tasDelHangar={tas} />;
}
