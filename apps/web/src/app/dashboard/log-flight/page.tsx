import { apiFetch } from "@/lib/api";
import EncabezadoRegistrar from "@/components/dashboard/EncabezadoRegistrar";
import { Aircraft, Flight, Profile } from "@/types";
import { esAlumno } from "@/lib/licencias";
import VueloAlumnoForm from "@/components/dashboard/VueloAlumnoForm";
import Link from "next/link";
import FlightLogForm from "@/components/dashboard/FlightLogForm";
import SinAeronaves from "@/components/dashboard/SinAeronaves";
import { parsePrefill } from "@/lib/prefill";
import { autoridadesPorFinalidad } from "@/lib/cad";
import { estadoConexionCad } from "@/actions/cad-vector";

import { redirect } from "next/navigation";

async function getData() {
  // El orden importa y ya mordió una vez: se agregó `/logbooks` en el medio del array
  // sin mover los nombres y la página murió con `logbooks.find is not a function`.
  const [acRes, lbRes, perfilRes, recientesRes] = await Promise.all([
    apiFetch("/aircraft"),
    apiFetch("/logbooks"),
    // El alumno piloto ve un formulario más simple.
    apiFetch("/profiles"),
    // Los últimos vuelos, del más nuevo al más viejo: de ahí sale la autoridad para el CAD
    // que el formulario propone en cada finalidad (`autoridadesPorFinalidad`).
    apiFetch("/flights/history?limit=100"),
  ]);

  if (acRes.status === 401) {
    console.log("LogFlightPage: 401 Unauthorized. Redirecting to logout...");
    redirect("/api/auth/logout?redirect=/?expired=true");
  }
  
  const aircraft: Aircraft[] = acRes.ok ? await acRes.json() : [];
  const logbooks = lbRes.ok ? await lbRes.json() : [];
  const perfiles: Profile[] = perfilRes.ok ? await perfilRes.json() : [];
  const recientes = recientesRes.ok ? ((await recientesRes.json()) as { items?: Flight[] }).items ?? [] : [];

  return { aircraft, logbooks, alumno: esAlumno(perfiles[0]?.license_type), autoridades: autoridadesPorFinalidad(recientes) };
}

interface PageProps {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }> | { [key: string]: string | string[] | undefined };
}

export default async function LogFlightPage({ searchParams }: PageProps) {
  const resolvedParams = searchParams ? (searchParams instanceof Promise ? await searchParams : searchParams) : {};
  // El mismo parser que usan los links de "Completar" del calendario y los atajos
  // de iOS. Ver `src/lib/prefill.ts`.
  const { initialData: prefillData, plannedId, planVueloId } = parsePrefill(resolvedParams);

  const [{ aircraft, logbooks, alumno, autoridades }, conexionCad] = await Promise.all([getData(), estadoConexionCad()]);
  // "Cargarlo también en tu CAD" sólo con la cuenta de ANAC conectada y andando.
  const cadConectado = !!conexionCad?.disponible && conexionCad.conectado && conexionCad.estado === "ok";

  return (
    <div className="space-y-8 md:space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-1000 w-full pb-20">
      <EncabezadoRegistrar importar={!alumno} guardar={alumno || aircraft.length > 0} />
      <div className="max-lg:hidden flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-8">
        {/* Como `PageHeader` (3.13.0): el rótulo con el punto cian arriba y el título grande. */}
        <div className="space-y-3">
          <p className="eyebrow flex items-center gap-2.5 tracking-[0.14em] text-zinc-500">
            <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-aviation-cyan" />
            Operaciones de vuelo
          </p>
          <h2 className="text-[clamp(52px,5.2vw,80px)] font-display font-extrabold tracking-[-0.05em] text-white leading-[0.92]">Registrar un vuelo</h2>
        </div>

        {!alumno && <Link 
          href="/dashboard/log-flight/import" 
          className="border border-white/20 hover:border-white/40 hover:bg-white/[0.04] text-white font-semibold text-sm px-5 py-3 rounded-full transition-colors self-start md:self-auto flex items-center space-x-2"
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
        interceptado. Hasta la 3.0.0 tenía al costado el cronómetro de la sesión en
        vivo, que casi nadie usaba; se sacó y el formulario quedó solo, a lo ancho.
      */
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
      )}
    </div>
  );
}
