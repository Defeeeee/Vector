import { apiFetch } from "@/lib/api";
import { Aircraft, Flight } from "@/types";
import { redirect } from "next/navigation";
import PageHeader from "@/components/dashboard/PageHeader";
import WeatherWidget from "@/components/dashboard/WeatherWidget";
import { soloVolados } from "@/lib/simulador";
import { topAirports } from "@/lib/summary";

/**
 * El METAR y el TAF de un aeródromo, decodificados.
 *
 * Vivía en el inicio, al lado del heatmap. El inicio pasó a contestar sólo tres
 * preguntas —si podés volar, cuánto te falta y cuánto te queda— y el clima se mudó a
 * "Preparar vuelo", junto al planificador, que es donde se mira antes de salir.
 *
 * Arranca en el aeródromo que más volaste, igual que antes: para un alumno es su base,
 * y es el que va a mirar todas las mañanas.
 */
async function aerodromoDeSiempre(): Promise<string> {
  const res = await apiFetch("/dashboard");
  if (res.status === 401) {
    redirect("/api/auth/logout?redirect=/?expired=true");
  }
  // Sin datos no hay base que adivinar: el widget cae a su default y se puede buscar
  // cualquier otro. No es un error que haya que mostrar.
  if (!res.ok) return "";
  try {
    const data = await res.json();
    const flights = soloVolados((data.flights || []) as Flight[], (data.aircraft || []) as Aircraft[]);
    return topAirports(flights, 1)[0]?.icao.toUpperCase() ?? "";
  } catch {
    return "";
  }
}

export default async function ClimaPage() {
  const aerodromo = await aerodromoDeSiempre();

  return (
    <div className="space-y-8 md:space-y-12 w-full animate-in fade-in slide-in-from-bottom-4 duration-700">
      <PageHeader eyebrow="METAR y TAF decodificados" title="Clima" />
      <div className="max-w-3xl">
        <WeatherWidget defaultAirport={aerodromo} />
      </div>
    </div>
  );
}
