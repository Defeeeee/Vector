import { apiFetch } from "@/lib/api";
import type { Aircraft } from "@/types";
import { tokensDeRuta } from "@/lib/mapa-ruta";
import type { SearchParams } from "@/lib/prefill";
import { pilotoParaPlan } from "@/lib/plan-de-vuelo-servidor";
import type { RutaGuardada } from "@/lib/rutas-guardadas";
import MapaClient from "@/components/dashboard/mapa/MapaClient";

/**
 * **El Mapa** (3.0.0): planificar una ruta sobre el mapa y, con "Volar", seguirla con el GPS
 * del teléfono. Todo el trabajo es del cliente; el servidor lee la ruta de la URL
 * (`?ruta=SADF-SADM`), los aviones del Hangar, el piloto (para el plan de vuelo) y las rutas
 * guardadas (3.13.0).
 */

const unParametro = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));

async function flota(): Promise<Aircraft[]> {
  try {
    const res = await apiFetch("/aircraft");
    if (!res.ok) return [];
    // Sin simuladores: no se mueven, y la ruta no les dice nada.
    return ((await res.json()) as Aircraft[]).filter((a) => !a.is_simulator);
  } catch {
    return [];
  }
}

/** `null` si no se pudieron leer: la tarjeta no ofrece guardar en vez de decir "no tenés rutas". */
async function rutasGuardadas(): Promise<RutaGuardada[] | null> {
  try {
    // Sin cache: una ruta recién guardada en el teléfono tiene que estar al abrir la compu.
    const res = await apiFetch("/rutas", { next: { revalidate: 0 } });
    if (!res.ok) return null;
    return (await res.json()) as RutaGuardada[];
  } catch {
    return null;
  }
}

export default async function MapaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const [params, aeronaves, piloto, rutas] = await Promise.all([searchParams, flota(), pilotoParaPlan(), rutasGuardadas()]);
  return (
    <MapaClient
      rutaInicial={tokensDeRuta(unParametro(params.ruta)).join(" ")}
      aeronaves={aeronaves}
      aeronaveInicial={unParametro(params.av)}
      piloto={piloto}
      rutasGuardadas={rutas}
    />
  );
}
