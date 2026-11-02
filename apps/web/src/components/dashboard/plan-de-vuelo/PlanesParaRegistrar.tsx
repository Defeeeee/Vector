import Link from "next/link";
import { FileCheck2 } from "lucide-react";
import { descartarPlanForm } from "@/actions/plan-de-vuelo";
import BotonPendiente from "@/components/BotonPendiente";
import { leerFormulario, localDesdeUtc } from "@/lib/formulario-plan";
import { candidatoARegistrar, horariosDelPlan, hrefRegistrarDesdePlan, preguntarSiVolo, yaEstaEnLaBitacora } from "@/lib/plan-cierre";
import { leerPlan, listarPlanes } from "@/lib/plan-de-vuelo-servidor";

const CARD =
  "rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none";

/**
 * "¿Ya volaste?" — el plan de vuelo presentado cuya llegada estimada ya pasó.
 *
 * **Sólo después de la EOBT más la duración** (Federico, 2026-10-20): antes no hay nada que
 * registrar. Es la excepción de la regla del inicio (`AGENTS.md`), como "Vuelos
 * programados": le pide algo al piloto, y un vuelo sin registrar es un agujero en el libro.
 *
 * Va por `Suspense`, como "Tu red": son viajes al backend de más y nunca tienen que demorar
 * lo de arriba. Si algo falla, no se dibuja (un recordatorio, no un dato).
 *
 * La hora sale del server (invariante 1), y mirar no escribe (invariante 15): "No lo volé"
 * es un submit del piloto.
 */
export default async function PlanesParaRegistrar({ vuelos }: { vuelos: { date?: string | null; route?: string | null }[] }) {
  const ahoraIso = new Date().toISOString();
  const lista = await listarPlanes();
  if (!lista) return null;
  const candidatos = lista.filter((p) => candidatoARegistrar(p, ahoraIso)).slice(0, 5);
  if (candidatos.length === 0) return null;

  const planes = (await Promise.all(candidatos.map((p) => leerPlan(p.id)))).flatMap((plan) => {
    if (!plan) return [];
    const f = leerFormulario(plan.formulario);
    const demoras = plan.demoras ?? [];
    // Si ya lo cargó por otro lado (el copiloto, a mano), no se pregunta.
    if (!preguntarSiVolo(f, demoras, ahoraIso) || yaEstaEnLaBitacora(f, demoras, vuelos)) return [];
    const h = horariosDelPlan(f, demoras);
    const salida = h ? localDesdeUtc(h.dof, h.eobt) : null;
    const llegada = h ? localDesdeUtc(new Date(h.llegadaMs).toISOString().slice(0, 10), h.llegada) : null;
    return [
      {
        id: plan.id,
        ruta: `${f.salida?.codigo ?? "????"} → ${f.destino?.codigo ?? f.salida?.codigo ?? "????"}`,
        matricula: f.matricula,
        cuando: salida ? `${salida.fecha.slice(8, 10)}/${salida.fecha.slice(5, 7)}, salida ${salida.hora}${llegada ? ` y llegada ${llegada.hora}` : ""}` : "",
        href: hrefRegistrarDesdePlan(plan.id, f, demoras),
      },
    ];
  });
  if (planes.length === 0) return null;

  return (
    <div className={`${CARD} p-6 md:p-8 space-y-5`}>
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-zinc-100 dark:bg-white/10 flex items-center justify-center">
          <FileCheck2 className="w-5 h-5 text-zinc-500 dark:text-zinc-400" />
        </div>
        <div>
          <p className="eyebrow">Plan de vuelo</p>
          <h3 className="text-lg font-bold text-zinc-900 dark:text-white leading-tight">¿Ya volaste?</h3>
        </div>
      </div>

      <div className="space-y-4">
        {planes.map((p) => (
          <div
            key={p.id}
            className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 pt-4 first:pt-0 border-t first:border-t-0 border-zinc-100 dark:border-white/5"
          >
            <div className="flex-1 min-w-0">
              <p className="data text-sm font-bold text-zinc-900 dark:text-white truncate">
                {p.ruta}
                {p.matricula && <span className="text-zinc-400 dark:text-zinc-500"> · {p.matricula}</span>}
              </p>
              {p.cuando && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Según el plan: <span className="data">{p.cuando}</span>, hora argentina
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Los horarios del plan son estimados: el formulario los deja corregir. */}
              <Link href={p.href} className="px-5 py-2.5 rounded-full bg-aviation-blue text-white text-sm font-bold whitespace-nowrap">
                Registrar el vuelo
              </Link>
              <form action={descartarPlanForm.bind(null, p.id)}>
                <BotonPendiente
                  pendiente="Guardando…"
                  className="px-3 py-2.5 text-sm font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors whitespace-nowrap"
                >
                  No lo volé
                </BotonPendiente>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
