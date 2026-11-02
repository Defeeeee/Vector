import { apiFetch } from "@/lib/api";
import { Flight, Aircraft, Logbook } from "@/types";
import { redirect } from "next/navigation";
import PageHeader from "@/components/dashboard/PageHeader";
import CompartirTarjeta from "@/components/dashboard/CompartirTarjeta";
import SummaryClient from "@/components/dashboard/SummaryClient";
import ComoVenisVolando from "@/components/dashboard/ComoVenisVolando";
import CustomStatsRow from "@/components/dashboard/CustomStatsRow";
import GraficosDeHoras from "@/components/dashboard/GraficosDeHorasLazy";
import ActivityHeatmap from "@/components/dashboard/ActivityHeatmap";
import { listCustomStats } from "@/actions/custom-stat";
import { getAirport } from "@/lib/airports";
import { openingTotals, splitRoute } from "@/lib/summary";
import { soloVolados } from "@/lib/simulador";
import { buildActivityHeatmap } from "@/lib/utils";
import { horasAcumuladas, horasPorMes } from "@/lib/tendencia";

/**
 * Los tres pedidos en paralelo. `/logbooks` iba después de `/dashboard` sin depender
 * de él, y cada viaje al backend cuesta lo suyo; las métricas propias se sumaron al
 * mudarse desde el inicio y degradan solas a lista vacía.
 */
async function getSummaryData() {
  const [response, logbooksResponse, customStats] = await Promise.all([
    apiFetch("/dashboard"),
    apiFetch("/logbooks"),
    listCustomStats(),
  ]);

  if (response.status === 401) {
    console.log("SummaryPage: 401 Unauthorized. Redirecting to logout...");
    redirect("/api/auth/logout?redirect=/?expired=true");
  }

  if (!response.ok) {
    return { flights: [] as Flight[], aircraft: [] as Aircraft[], logbooks: [] as Logbook[], customStats };
  }

  const data = await response.json();
  // `/dashboard` does not carry logbooks yet, so they come from their own endpoint.
  const logbooks: Logbook[] = logbooksResponse.ok ? await logbooksResponse.json() : [];

  return {
    flights: (data.flights || []) as Flight[],
    aircraft: (data.aircraft || []) as Aircraft[],
    logbooks,
    customStats,
  };
}

export default async function SummaryPage() {
  const { flights: bitacora, aircraft, logbooks, customStats } = await getSummaryData();

  /*
    Esta pantalla responde "qué volé", y una sesión de simulador no es algo que se
    voló. Sus horas ya llegan en cero —el formulario no las escribe en el total—, así
    que los promedios no se moverían; lo que sí se rompe sin este filtro es todo lo que
    sale de la columna de ruta: `LOCAL` aparecería como un aeródromo visitado, y una
    vez adentro del directorio no se va más.
  */
  const flights = soloVolados(bitacora, aircraft);

  // Resolved here rather than in the client: `getAirport` reads the in-memory
  // TSV index, which is server-only. Only the codes this pilot actually flew
  // get sent, so the payload stays a handful of strings instead of 755 KB.
  const airportNames: Record<string, string> = {};
  const airportDetails: Record<string, { name: string; label: string; lat?: number; lon?: number; city?: string }> = {};
  for (const f of flights) {
    for (const icao of splitRoute(f.route)) {
      if (!icao || icao === "???" || airportNames[icao]) continue;
      const hit = getAirport(icao);
      if (hit) {
        airportNames[icao] = hit.name;
        airportDetails[icao] = {
          name: hit.name,
          label: hit.label,
          lat: hit.lat,
          lon: hit.lon,
          city: hit.city,
        };
      }
    }
  }

  // "Today" is decided on the server and passed down, so the period cutoffs do
  // not shift between a UTC server and a UTC-3 browser. Same rule as the
  // heatmap and the documents card.
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-8 md:space-y-12 w-full animate-in fade-in slide-in-from-bottom-4 duration-700">
      <PageHeader
        eyebrow="Tu carrera como piloto, narrada por los datos"
        title="Resumen de horas"
        action={<CompartirTarjeta />}
      />

      {/* Lo reciente primero: la racha y este mes contra tu promedio. Se mudó desde
          el inicio junto con los gráficos y el heatmap de más abajo. */}
      <ComoVenisVolando flights={flights} todayIso={todayIso} />

      <CustomStatsRow stats={customStats} flights={flights} aircraft={aircraft} />

      <SummaryClient
        flights={flights}
        aircraft={aircraft}
        logbooks={logbooks}
        todayIso={todayIso}
        airportNames={airportNames}
        airportDetails={airportDetails}
      />

      {/* Carrera entera, sin filtro de período: la curva arranca en las horas de
          apertura para que su total coincida con el de arriba. */}
      <GraficosDeHoras
        monthlyData={horasPorMes(flights, todayIso)}
        cumulativeData={horasAcumuladas(flights, todayIso, openingTotals(logbooks).totalHours)}
      />

      <ActivityHeatmap data={buildActivityHeatmap(flights)} />
    </div>
  );
}
