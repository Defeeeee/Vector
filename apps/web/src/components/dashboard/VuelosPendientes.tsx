import Link from "next/link";
import { CalendarClock, ChevronRight } from "lucide-react";
import { descartarProgramadoForm, posponerProgramadoForm } from "@/actions/planned-flight";
import {
  pendientesDeConfirmar,
  prefillHref,
  resumenPendientes,
  sumarDias,
} from "@/lib/planned-flights";
import BotonPendiente from "@/components/BotonPendiente";
import { soloHoraYMinuto } from "@/lib/horarios";
import type { Aircraft, PlannedFlight } from "@/types";

/**
 * "¿Volaste esto?"
 *
 * El punto del calendario entero. El piloto anotó la ruta, la aeronave y la fecha
 * **antes** de volar, cuando las tenía frescas; acá lo único que queda es confirmar.
 * Registrar deja de ser cargar datos de memoria y pasa a ser tocar un botón.
 *
 * Va entre `FlightStatusCard` y `CustomStatsRow`: es la única cosa de la pantalla,
 * además del semáforo, que le pide algo al piloto — un vuelo sin registrar es un
 * agujero en el libro. Y va **arriba** de las métricas propias porque todas se
 * calculan sobre los vuelos: hasta que este se cargue, todas están cortas.
 *
 * **Un vuelo programado nunca suma horas.** Vive en otra tabla justamente para eso.
 */

const CARD =
  "rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none";

interface Props {
  planned: PlannedFlight[];
  aircraft: Aircraft[];
  todayIso: string;
  /**
   * Si el piloto todavía no cargó ningún vuelo, esta tarjeta no aparece.
   *
   * `PrimerosPasos` ya es dueño de esa pantalla y su cuarto paso es exactamente
   * "registrá tu primer vuelo". Dos tarjetas insistiendo con lo mismo es una
   * pantalla que enseña a saltear tarjetas que insisten.
   */
  tieneVuelos: boolean;
}

export default function VuelosPendientes({ planned, aircraft, todayIso, tieneVuelos }: Props) {
  if (!tieneVuelos) return null;

  const pendientes = pendientesDeConfirmar(planned, todayIso);
  if (pendientes.length === 0) return null;

  const { modo, visibles, total } = resumenPendientes(pendientes);
  const matriculas = new Map(aircraft.map((a) => [a.id, a.registration]));

  if (modo === "resumen") {
    return (
      <Link href="/dashboard/calendario" className={`${CARD} p-6 flex items-center gap-4 group`}>
        <div className="w-11 h-11 rounded-xl bg-zinc-100 dark:bg-white/10 flex items-center justify-center flex-shrink-0">
          <CalendarClock className="w-5 h-5 text-zinc-500 dark:text-zinc-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-zinc-900 dark:text-white">
            Tenés <span className="data">{total}</span> vuelos programados sin confirmar
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Resolvelos desde el calendario.</p>
        </div>
        <ChevronRight className="w-5 h-5 text-zinc-400 group-hover:translate-x-0.5 transition-transform" />
      </Link>
    );
  }

  return (
    <div className={`${CARD} p-6 md:p-8 space-y-5`}>
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-zinc-100 dark:bg-white/10 flex items-center justify-center">
          <CalendarClock className="w-5 h-5 text-zinc-500 dark:text-zinc-400" />
        </div>
        <div>
          <p className="eyebrow">Vuelos programados</p>
          <h3 className="text-lg font-bold text-zinc-900 dark:text-white leading-tight">
            {total === 1 ? "¿Volaste este?" : "¿Volaste estos?"}
          </h3>
        </div>
      </div>

      <div className="space-y-4">
        {visibles.map((p) => (
          <Fila key={p.id} plan={p} matricula={p.aircraft_id ? matriculas.get(p.aircraft_id) : undefined} todayIso={todayIso} />
        ))}
      </div>
    </div>
  );
}

function Fila({
  plan,
  matricula,
  todayIso,
}: {
  plan: PlannedFlight;
  matricula?: string;
  todayIso: string;
}) {
  // Los `.bind` son cómo una server action recibe el id desde un `<form>` sin
  // necesidad de JavaScript en el cliente.
  const descartar = descartarProgramadoForm.bind(null, plan.id);
  const posponer = posponerProgramadoForm.bind(null, plan.id, sumarDias(todayIso, 1));

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 pt-4 first:pt-0 border-t first:border-t-0 border-zinc-100 dark:border-white/5">
      <div className="flex-1 min-w-0">
        <p className="data text-sm font-bold text-zinc-900 dark:text-white truncate">
          {plan.route || "Sin ruta"}
          {matricula && <span className="text-zinc-400 dark:text-zinc-500"> · {matricula}</span>}
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Programado para el <span className="data">{plan.date}</span>
          {/* En UTC, que es como se guarda y como lo va a pedir el formulario. */}
          {soloHoraYMinuto(plan.takeoff_time) && (
            <>
              {" a las "}
              <span className="data">{soloHoraYMinuto(plan.takeoff_time)}</span> UTC
            </>
          )}
          {plan.notes && ` · ${plan.notes}`}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {/*
          "Lo volé distinto" no lleva botón propio: el formulario prellenado es
          editable, así que se entra por acá y se cambia lo que haga falta. Un
          segundo botón al mismo destino es un segundo botón.
        */}
        <Link
          href={prefillHref(plan)}
          className="px-5 py-2.5 rounded-full bg-aviation-blue text-white text-sm font-bold whitespace-nowrap"
        >
          Completar
        </Link>
        {/*
          Cada botón en su propio `<form>`: `useFormStatus` lee el formulario padre
          más cercano, así que dos submits en uno solo se prenderían juntos.
        */}
        <form action={descartar}>
          <BotonPendiente
            pendiente="Guardando…"
            className="px-3 py-2.5 text-sm font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors whitespace-nowrap"
          >
            No lo volé
          </BotonPendiente>
        </form>
        <form action={posponer}>
          <BotonPendiente
            pendiente="Guardando…"
            className="px-3 py-2.5 text-sm font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            Después
          </BotonPendiente>
        </form>
      </div>
    </div>
  );
}
