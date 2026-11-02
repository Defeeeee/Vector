import { apiFetch } from "@/lib/api";
import { Flight, Aircraft, Logbook, Profile, Transaction } from "@/types";
import { costosPorVuelo } from "@/lib/costos";
import { hitoCruzado } from "@/lib/hitos";
import { soloVolados } from "@/lib/simulador";
import { openingTotals } from "@/lib/summary";
import { Plus, Clock, LandPlot, Plane } from "lucide-react";
import Link from "next/link";
import ExportarBitacora from "@/components/dashboard/ExportarBitacora";
import { esAlumno } from "@/lib/licencias";
import FlightListClient from "@/components/dashboard/FlightListClient";
import PageHeader from "@/components/dashboard/PageHeader";
import BannerCompartirVuelo from "@/components/social/BannerCompartirVuelo";
import { leerResumenSocial } from "@/lib/resumen-social";
import { rutaLegible } from "@/lib/social";
import { leidoDelCad, pendientesDelCad } from "@/lib/cad";
import LeidoDelCad from "@/components/dashboard/cad/LeidoDelCad";

import { redirect } from "next/navigation";

async function getHistoryData() {
  const response = await apiFetch("/dashboard");

  if (response.status === 401) {
    console.log("HistoryPage: 401 Unauthorized. Redirecting to logout...");
    redirect("/api/auth/logout?redirect=/?expired=true");
  }

  if (!response.ok) {
    return { flights: [], aircraft: [], profile: null, transactions: [] as Transaction[] };
  }

  const data = await response.json();
  return {
    flights: (data.flights || []) as Flight[],
    aircraft: (data.aircraft || []) as Aircraft[],
    profile: (data.profile || null) as Profile | null,
    // Ya venían en el payload y se descartaban: son de dónde sale cuánto costó
    // cada vuelo y cada mes del libro. Ver `src/lib/costos.ts`.
    transactions: (data.transactions || []) as Transaction[]
  };
}

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ nuevo?: string; editar?: string; ver?: string }> }) {
  const [{ flights, aircraft, transactions, profile }, resumen, librosRes, { nuevo, editar, ver }] = await Promise.all([
    getHistoryData(),
    leerResumenSocial(),
    // Para el PDF (se arma de a un libro) y para el hito: la apertura suma al total.
    apiFetch("/logbooks"),
    searchParams,
  ]);
  const libros: Logbook[] = librosRes.ok ? await librosRes.json() : [];

  const costos = costosPorVuelo(transactions);

  const sortedFlights = [...flights].sort(
    (a, b) => new Date(b.takeoff).getTime() - new Date(a.takeoff).getTime()
  );

  /*
    "¿Lo compartís con tu red?", recién registrado un vuelo: `FlightLogForm` vuelve acá
    con `?nuevo=<id>`. Sólo si el vuelo existe, no es de simulador —una sesión es un
    renglón del libro, no un vuelo (invariante 4)— y el piloto tiene @.
  */
  const recienCargado = nuevo ? sortedFlights.find((f) => f.id === nuevo) : undefined;
  const avionDelNuevo = recienCargado ? aircraft.find((a) => a.id === recienCargado.aircraft_id) : undefined;
  const ofrecerCompartir = !!resumen.handle && !!recienCargado && !avionDelNuevo?.is_simulator;

  /*
    El hito: si el vuelo recién cargado cruzó las 50, 100, 150… horas. El total es el
    mismo del perfil público —lo volado sin simuladores, más la apertura—, así que el
    hito que se festeja acá es el que después se ve en el perfil. Se festeja aunque no
    tenga @: Publicar lo deja crear ahí mismo.
  */
  const totalVolado =
    soloVolados(flights, aircraft).reduce((t, f) => t + (f.duration || 0), 0) + openingTotals(libros).totalHours;
  const hito =
    recienCargado && !avionDelNuevo?.is_simulator
      ? hitoCruzado(totalVolado - (recienCargado.duration || 0), totalVolado)
      : null;

  // Lo que falta declarar en el CAD (desde el 1/11/2025, sin simuladores ni omitidos).
  const sinPasarAlCad = esAlumno(profile?.license_type) ? 0 : pendientesDelCad(flights, aircraft);

  const totalHours = sortedFlights.reduce((acc, f) => acc + f.duration, 0);
  const totalLandings = sortedFlights.reduce((acc, f) => acc + f.landings, 0);

  return (
    <div className="space-y-8 md:space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-1000 w-full">
      <PageHeader
        eyebrow="Historial completo"
        title="Bitácora"
        action={
          <>
            <ExportarBitacora flights={sortedFlights} aircraft={aircraft} libros={libros} alumno={esAlumno(profile?.license_type)} />
            {!esAlumno(profile?.license_type) && (
              <Link
                href="/dashboard/history/cad"
                className="whitespace-nowrap border border-zinc-200 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-white/5 text-zinc-900 dark:text-white font-semibold text-sm px-5 py-3.5 rounded-xl transition-all flex items-center justify-center gap-2"
              >
                Pasar al CAD
                {sinPasarAlCad > 0 && (
                  <span
                    title={`${sinPasarAlCad} ${sinPasarAlCad === 1 ? "vuelo" : "vuelos"} sin pasar al CAD`}
                    className="data min-w-5 h-5 px-1.5 rounded-full bg-amber-400 text-zinc-900 text-[11px] font-bold flex items-center justify-center"
                  >
                    {sinPasarAlCad}
                  </span>
                )}
              </Link>
            )}
            <Link href="/dashboard/log-flight" className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold text-sm px-6 py-3.5 rounded-xl shadow-cal-highlight dark:shadow-none transition-all hover:bg-zinc-800 dark:hover:bg-zinc-200 flex items-center justify-center gap-2">
              <span>Nuevo registro</span>
              <Plus className="w-4 h-4" />
            </Link>
          </>
        }
      >
        <div className="flex items-center gap-5 pt-1 text-sm text-zinc-500 dark:text-zinc-400">
          <span className="flex items-center gap-1.5"><Plane className="w-3.5 h-3.5" /> {sortedFlights.length} vuelos</span>
          <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {totalHours.toFixed(1)} hs</span>
          <span className="flex items-center gap-1.5"><LandPlot className="w-3.5 h-3.5" /> {totalLandings} aterrizajes</span>
        </div>
        {/* Las marcas "En el CAD" y "Falta la DDJJ" son de la última lectura del CAD (2.36.0). */}
        {!esAlumno(profile?.license_type) && flights.some((f) => f.cad_vuelo_id) && <LeidoDelCad leido={leidoDelCad(profile?.cad_leido_at, new Date())} />}
      </PageHeader>

      {(ofrecerCompartir || hito) && recienCargado && (
        <BannerCompartirVuelo
          vueloId={recienCargado.id}
          resumen={[rutaLegible(recienCargado.route), `${recienCargado.duration.toFixed(1)} h`].filter(Boolean).join(" · ")}
          hito={hito}
        />
      )}
      <FlightListClient flights={sortedFlights} aircraft={aircraft} costos={costos} alumno={esAlumno(profile?.license_type)} fechaPpa={profile?.fecha_ppa ?? null} editar={editar} ver={ver} />
    </div>
  );
}
