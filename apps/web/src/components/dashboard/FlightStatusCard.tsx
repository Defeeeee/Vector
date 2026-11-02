import Link from "next/link";
import { ArrowRight, CheckCircle2, HelpCircle, ShieldAlert, TriangleAlert } from "lucide-react";
import { Flight, PilotDocument, Profile } from "@/types";
import { recencyByClass, recencyWindowDays } from "@/lib/recency";
import { pilotStatus } from "@/lib/pilot-status";
import { esAlumno } from "@/lib/licencias";
import type { Aircraft } from "@/types";

/**
 * "¿Puedo volar hoy?" — las cuatro condiciones de RAAC 61.060(a)(1) en un lugar.
 *
 * Vector ya tenía tres repartidas en pantallas distintas —el CMA en Hangar, los
 * vuelos en la bitácora— y ninguna que las juntara. La pregunta que un piloto se
 * hace de verdad no es "cuántas horas llevo" sino "¿estoy en condiciones?".
 *
 * **Compacta en verde, expandida cuando hay algo que mirar.** Mismo criterio que
 * `WhatsAppMissingNotice`: una card que grita cuando todo está bien se vuelve
 * ruido y se deja de leer, y entonces no sirve el día que sí importa.
 *
 * Cada estado cita la sección de la norma. No es decoración: es para que el piloto
 * pueda verificarlo y para que quien lea el código sepa de dónde salió el número.
 */
export default function FlightStatusCard({
  flights,
  aircraft,
  documents,
  profile,
  documentosDisponibles = true,
}: {
  flights: Flight[];
  aircraft: Aircraft[];
  documents: PilotDocument[];
  profile: Profile | null;
  /** `false` si la consulta de documentos falló. Ver `pilotStatus`. */
  documentosDisponibles?: boolean;
}) {
  const ventana = recencyWindowDays(profile?.license_type);
  const recencias = recencyByClass(flights, aircraft, ventana);
  const estado = pilotStatus(documents, recencias, flights, new Date(), documentosDisponibles, {
    alumno: esAlumno(profile?.license_type),
  });

  const ok = estado.estado === "vigente";
  const grave = estado.estado === "inactividad_prolongada" || estado.estado === "documento_vencido";

  if (ok) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.07] px-4 py-3">
        <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-500" />
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">{estado.puede}</p>
        {estado.detalle && (
          <p className="hidden sm:block ml-auto text-[13px] text-zinc-500 dark:text-zinc-400">
            {estado.detalle}
          </p>
        )}
      </div>
    );
  }

  // Tres tonos, no dos. `documento_faltante` no es una advertencia: es la
  // ausencia del dato. En ámbar se lee como "algo está mal con tu CMA", y lo que
  // pasa es que no hay ninguno cargado. Gris dice lo que corresponde —falta el
  // dato— sin afirmar ni desmentir nada sobre el piloto.
  //
  // `datos_no_disponibles` va en el mismo gris por el mismo motivo, un escalón
  // más atrás: ahí ni siquiera sabemos si falta.
  const desconocido =
    estado.estado === "documento_faltante" || estado.estado === "datos_no_disponibles";

  const tono = grave
    ? "border-red-500/25 bg-red-500/[0.07] text-red-600 dark:text-red-500"
    : desconocido
      ? "border-zinc-300 dark:border-white/15 bg-zinc-500/[0.06] text-zinc-500 dark:text-zinc-400"
      : "border-amber-500/25 bg-amber-500/[0.07] text-amber-600 dark:text-amber-500";
  const Icono = grave ? ShieldAlert : desconocido ? HelpCircle : TriangleAlert;

  return (
    <div className={`flex flex-col sm:flex-row sm:items-start gap-3 rounded-2xl border px-4 py-3.5 ${tono}`}>
      <Icono className="w-5 h-5 shrink-0 mt-0.5" />

      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">{estado.puede}</p>
        {estado.detalle && (
          <p className="text-[13px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
            {estado.detalle}
          </p>
        )}
        {estado.paraVolver && (
          <p className="text-[13px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
            {estado.paraVolver}
          </p>
        )}
        {/* La cita va chica pero va: es lo que hace verificable la afirmación. */}
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500 pt-0.5">
          RAAC {estado.seccion}
        </p>
      </div>

      <Link
        href="/dashboard/settings"
        className="shrink-0 self-start inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-white hover:opacity-70 transition-opacity"
      >
        Ir al Hangar
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}
