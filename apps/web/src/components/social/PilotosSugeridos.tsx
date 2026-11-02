import { apiFetch } from "@/lib/api";
import FilaPiloto from "./FilaPiloto";
import BotonSeguir from "./BotonSeguir";
import type { PilotoResumen } from "@/types";

/**
 * Pilotos públicos que todavía no seguís (`GET /pilotos/sugeridos`, los seis más
 * nuevos). Es lo que llena una Red vacía: con pocos pilotos en la app, esperar a que
 * alguien busque un nombre que no conoce es esperar para siempre.
 *
 * Si no hay ninguno, o no se pudo preguntar, no dibuja nada: es una sugerencia.
 */
export default async function PilotosSugeridos({ tieneHandle }: { tieneHandle: boolean }) {
  let sugeridos: PilotoResumen[] = [];
  try {
    const res = await apiFetch("/pilotos/sugeridos", { cache: "no-store" });
    if (res.ok) sugeridos = (await res.json()) as PilotoResumen[];
  } catch {
    sugeridos = [];
  }
  if (sugeridos.length === 0) return null;

  return (
    <section className="rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none p-5 md:p-6">
      <h3 className="text-lg font-display font-bold text-zinc-900 dark:text-white tracking-tight">
        Pilotos para seguir
      </h3>
      <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-0.5 mb-2">Los últimos que se sumaron a la red.</p>
      <div className="divide-y divide-zinc-100 dark:divide-white/10">
        {sugeridos.map((p) => (
          <FilaPiloto
            key={p.handle}
            piloto={p}
            accion={
              <BotonSeguir
                handle={p.handle}
                relacion={p.relacion}
                visibilidad={p.visibilidad}
                tieneHandle={tieneHandle}
                compacto
              />
            }
          />
        ))}
      </div>
    </section>
  );
}
