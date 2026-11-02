import { apiFetch } from "@/lib/api";
import { Aircraft, Flight, Profile } from "@/types";
import { esAlumno } from "@/lib/licencias";
import VueloAlumnoForm from "@/components/dashboard/VueloAlumnoForm";
import Link from "next/link";
import FlightLogForm from "@/components/dashboard/FlightLogForm";
import LiveSessionController from "@/components/dashboard/LiveSessionController";
import SinAeronaves from "@/components/dashboard/SinAeronaves";
import { parsePrefill } from "@/lib/prefill";
import { ChevronLeft } from "lucide-react";
import { autoridadesPorFinalidad } from "@/lib/cad";
import { estadoConexionCad } from "@/actions/cad-vector";

import { redirect } from "next/navigation";

async function getData() {
  // Order matters and has already bitten once: `/logbooks` was added in the
  // middle of this array without moving the names, so `logbooks` got the session
  // object and the page died on `logbooks.find is not a function`.
  const [acRes, lbRes, sessionRes, perfilRes, recientesRes] = await Promise.all([
    apiFetch("/aircraft"),
    apiFetch("/logbooks"),
    apiFetch("/flight-helper/session"),
    // Al final, por lo de arriba: el alumno piloto ve un formulario más simple.
    apiFetch("/profiles"),
    // Los últimos vuelos, del más nuevo al más viejo: de ahí sale la autoridad para el CAD
    // que el formulario propone en cada finalidad (`autoridadesPorFinalidad`).
    apiFetch("/flights/history?limit=100"),
  ]);

  if (acRes.status === 401 || sessionRes.status === 401) {
    console.log("LogFlightPage: 401 Unauthorized. Redirecting to logout...");
    redirect("/api/auth/logout?redirect=/?expired=true");
  }
  
  const aircraft: Aircraft[] = acRes.ok ? await acRes.json() : [];
  const logbooks = lbRes.ok ? await lbRes.json() : [];
  const session = sessionRes.ok ? await sessionRes.json() : { active: false };
  const perfiles: Profile[] = perfilRes.ok ? await perfilRes.json() : [];
  const recientes = recientesRes.ok ? ((await recientesRes.json()) as { items?: Flight[] }).items ?? [] : [];

  return { aircraft, session, logbooks, alumno: esAlumno(perfiles[0]?.license_type), autoridades: autoridadesPorFinalidad(recientes) };
}

interface PageProps {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }> | { [key: string]: string | string[] | undefined };
}

export default async function LogFlightPage({ searchParams }: PageProps) {
  const resolvedParams = searchParams ? (searchParams instanceof Promise ? await searchParams : searchParams) : {};
  // El mismo parser que usan los links de "Completar" del calendario y los atajos
  // de iOS. Ver `src/lib/prefill.ts`.
  const { initialData: prefillData, plannedId, planVueloId } = parsePrefill(resolvedParams);

  const [{ aircraft, session, logbooks, alumno, autoridades }, conexionCad] = await Promise.all([getData(), estadoConexionCad()]);
  // "Cargarlo también en tu CAD" sólo con la cuenta de ANAC conectada y andando.
  const cadConectado = !!conexionCad?.disponible && conexionCad.conectado && conexionCad.estado === "ok";

  return (
    <div className="space-y-8 md:space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-1000 w-full pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-8">
        <div className="space-y-2 md:space-y-4">
          <div className="flex items-center space-x-3 md:space-x-4">
            <Link href="/dashboard" className="p-2 md:p-3 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-full transition-colors group bg-white dark:bg-[#111111] shadow-sm border border-zinc-200 dark:border-white/10 md:border-transparent md:bg-transparent md:shadow-none">
              <ChevronLeft className="w-5 h-5 md:w-6 md:h-6 text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-white" />
            </Link>
            <h2 className="text-4xl md:text-6xl font-display font-bold tracking-tighter text-zinc-900 dark:text-white leading-none">Registrar</h2>
          </div>
          <p className="eyebrow ml-14 md:ml-16">Operaciones de vuelo</p>
        </div>

        {!alumno && <Link 
          href="/dashboard/log-flight/import" 
          className="border border-zinc-200 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-white/5 text-zinc-900 dark:text-white font-semibold text-sm px-5 py-3.5 rounded-xl transition-all shadow-sm active:scale-[0.98] self-start md:self-auto flex items-center space-x-2"
        >
          <span>Importar tu libro (PDF o fotos)</span>
        </Link>}
      </div>

      {/*
        Sin aeronaves no hay nada que completar: el select queda vacío y el
        `required` bloquea el submit sin salida. La cabecera se mantiene arriba
        para no dejar al piloto sin el botón de volver.
      */}
      {/* El alumno no tiene libro de vuelo: fecha, horarios, aterrizajes y avión, sin
          desglose ANAC ni finalidad (ver `VueloAlumnoForm`). Puede agregar el avión ahí. */}
      {alumno ? (
        <VueloAlumnoForm aircraft={aircraft} todayIso={new Date().toISOString().slice(0, 10)} inicial={prefillData} planVueloId={planVueloId} />
      ) : aircraft.length === 0 ? (
        <SinAeronaves />
      ) : (
      /*
        Ésta es la única forma de registrar un vuelo desde que se sacó el modal
        interceptado, así que el formulario va primero y a lo ancho: al lado del
        cronómetro, en dos tercios de la pantalla, sus dos columnas quedaban
        apretadas en casi cualquier notebook. El cronómetro va al costado recién
        donde sobra lugar (`xl`), y abajo en el resto.

        La excepción es un vuelo en curso: ahí el piloto vino a cortar el
        cronómetro —el cartel "Vuelo en curso" del inicio trae acá—, así que va
        arriba del formulario.
      */
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-8 md:gap-12 items-start">
        <div className={session?.active ? "order-2 xl:order-1" : undefined}>
          <FlightLogForm
            aircraft={aircraft}
            logbooks={logbooks}
            initialData={prefillData}
            plannedId={plannedId}
            planVueloId={planVueloId}
            autoridades={autoridades}
            cadConectado={cadConectado}
            /*
              Antes de esto, `logFlight` redirigía sola con `push`, así que volver
              atrás desde `/dashboard/history` reabría este mismo formulario vacío.
              `replace` no deja esa entrada.
            */
            redirectTo="/dashboard/history"
          />
        </div>

        <div className={session?.active ? "order-1 xl:order-2" : undefined}>
          <LiveSessionController aircraft={aircraft} activeSession={session} />
        </div>
      </div>
      )}
    </div>
  );
}
