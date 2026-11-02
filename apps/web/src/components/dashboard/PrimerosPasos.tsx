import Link from "next/link";
import { Check, ArrowRight } from "lucide-react";
import { EstadoOnboarding } from "@/lib/onboarding";

/**
 * Los primeros pasos, hasta que estén hechos.
 *
 * Reemplaza al gate binario que tenía el overlay: apenas el piloto escribía una
 * licencia, `license_type === "-"` dejaba de ser cierto y el alta no volvía nunca
 * más, aunque no tuviera ni aeronaves ni vuelos. **Los que saltean pasos en el
 * wizard necesitan un lugar donde volver**, y bloquear de nuevo no es la forma.
 *
 * Se renderiza sólo si falta algo y desaparece sola cuando están los cuatro: sin
 * estado persistido ni columna nueva, porque los cuatro se derivan de datos que
 * `dashboard/page.tsx` ya tiene en memoria.
 */
export default function PrimerosPasos({ estado, alumno = false }: { estado: EstadoOnboarding; alumno?: boolean }) {
  if (estado.completo) return null;

  // Los pasos que no se pudieron verificar (`null`) no se dibujan. Ver
  // `PasoOnboarding`: pedirle a alguien que cargue el CMA que ya tiene, porque
  // una consulta nuestra falló, es peor que no decir nada.
  const pasos = [
    { hecho: estado.licencia, texto: "Cargá el tipo de licencia", href: "/dashboard/settings" },
    { hecho: estado.cma, texto: "Cargá tu certificado médico", href: "/dashboard/settings" },
    { hecho: estado.aeronave, texto: "Agregá tu primera aeronave", href: "/dashboard/settings" },
    { hecho: estado.vuelo, texto: "Registrá tu primer vuelo", href: "/dashboard/log-flight" },
  ].filter((p) => p.hecho !== null);

  const hechos = pasos.filter((p) => p.hecho).length;

  return (
    <div className="bg-white dark:bg-white/[0.02] rounded-[2rem] border border-dashed border-zinc-200 dark:border-white/10 p-6 md:p-8 space-y-5">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-base font-bold font-display text-zinc-900 dark:text-white">Primeros pasos</h3>
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          {hechos} de {pasos.length}
        </span>
      </div>

      <ul className="space-y-1">
        {pasos.map((p) => (
          <li key={p.texto}>
            {p.hecho ? (
              <div className="flex items-center gap-3 py-2.5">
                <span className="w-5 h-5 shrink-0 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Check className="w-3 h-3" strokeWidth={3} />
                </span>
                <span className="text-sm font-medium text-zinc-400 dark:text-zinc-600 line-through">{p.texto}</span>
              </div>
            ) : (
              <>
                <Link
                  href={p.href}
                  className="group flex items-center gap-3 py-2.5 -mx-2 px-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-white/[0.03] transition-colors"
                >
                  <span className="w-5 h-5 shrink-0 rounded-full border border-zinc-300 dark:border-white/20" />
                  <span className="text-sm font-semibold text-zinc-900 dark:text-white">{p.texto}</span>
                  <ArrowRight className="w-4 h-4 ml-auto text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors" />
                </Link>
                {/* Sin vuelos, lo más rápido es arrancar con los totales (2026-10-20). */}
                {p.href === "/dashboard/log-flight" && (
                  <Link
                    href={alumno ? "/dashboard/settings#horas-de-antes" : "/dashboard/settings#libros"}
                    className="block pl-8 pb-1 text-xs font-semibold text-aviation-blue dark:text-aviation-cyan hover:underline underline-offset-2"
                  >
                    {alumno ? "o cargá las horas que ya volaste →" : "o copiá los totales de tu libro de papel →"}
                  </Link>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
