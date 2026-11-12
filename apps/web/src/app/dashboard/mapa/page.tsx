import { apiFetch } from "@/lib/api";
import type { Aircraft } from "@/types";
import { tokensDeRuta } from "@/lib/mapa-ruta";
import type { SearchParams } from "@/lib/prefill";
import { leerPlan, listarPlanes, pilotoParaPlan } from "@/lib/plan-de-vuelo-servidor";
import { candidatoParaElMapa, planAlMapa, planParaElMapa, type PlanParaElMapa } from "@/lib/plan-al-mapa";
import { leerSeguimientoDelPlan } from "@/actions/seguimiento";
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

/**
 * "Tus planes" (la tarjeta de la ruta): los planes en pie con salida desde hace 3 h hasta dentro de
 * 7 días. La lista del backend no trae las demoras, así que se leen enteros los pocos que caen cerca
 * de la ventana y se mide con la salida vigente. `null` si la lista no se pudo leer: la tarjeta no
 * muestra la sección en vez de decir "no tenés planes" (invariante 2).
 */
async function planesParaElMapa(ahoraIso: string): Promise<PlanParaElMapa[] | null> {
  try {
    const lista = await listarPlanes();
    if (!lista) return null;
    const cerca = lista.filter((p) => candidatoParaElMapa(p, ahoraIso)).slice(0, 12);
    const filas = await Promise.all(
      cerca.map(async (p) => {
        // Un plan que no se pudo leer entero se omite: sin su formulario no hay ruta que cargar.
        const entero = await leerPlan(p.id).catch(() => null);
        return entero ? planParaElMapa(p, entero.formulario, entero.demoras ?? [], ahoraIso) : null;
      })
    );
    return filas.filter((f): f is PlanParaElMapa => f !== null).sort((a, b) => a.salidaMs - b.salidaMs);
  } catch {
    return null;
  }
}

export default async function MapaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const planId = unParametro(params.plan).trim();
  const ahoraIso = new Date().toISOString();
  const [aeronaves, piloto, rutas, planes, plan, seguimiento] = await Promise.all([
    flota(),
    pilotoParaPlan(),
    rutasGuardadas(),
    planesParaElMapa(ahoraIso),
    // Un plan que no existe o no es del piloto es `null`: el Mapa abre normal, sin error.
    planId ? leerPlan(planId).catch(() => null) : Promise.resolve(null),
    planId ? leerSeguimientoDelPlan(planId) : Promise.resolve(null),
  ]);

  const delPlan = plan ? planAlMapa(plan.formulario, plan.aircraft_id) : null;
  // `?ruta=` gana: es la que el piloto fue editando (el Mapa la deja en la URL junto al plan).
  const rutaDeLaUrl = tokensDeRuta(unParametro(params.ruta)).join(" ");
  const rutaInicial = rutaDeLaUrl || delPlan?.ruta || "";
  const avion = unParametro(params.av) || (delPlan?.aircraftId && aeronaves.some((a) => a.id === delPlan.aircraftId) ? delPlan.aircraftId : "");
  const f = plan?.formulario as { salida?: { codigo?: string }; destino?: { codigo?: string } } | undefined;

  return (
    <MapaClient
      // Otro plan es otra pantalla: se arma de cero (la ruta, el avión y el link compartido).
      key={plan?.id ?? ""}
      rutaInicial={rutaInicial}
      aeronaves={aeronaves}
      aeronaveInicial={avion}
      piloto={piloto}
      rutasGuardadas={rutas}
      planes={planes}
      planActual={
        plan && delPlan
          ? {
              id: plan.id,
              titulo: [f?.salida?.codigo, f?.destino?.codigo].filter(Boolean).join(" → "),
              // Lo salteado se avisa al cargar el plan; con `?ruta=` el piloto ya lo vio.
              salteados: rutaDeLaUrl ? [] : delPlan.salteados,
            }
          : null
      }
      seguimientoDelPlan={seguimiento?.activo ? seguimiento : null}
    />
  );
}
