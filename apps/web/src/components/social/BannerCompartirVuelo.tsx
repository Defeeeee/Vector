"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { PartyPopper, Share2, X } from "lucide-react";

/**
 * "¿Lo compartís con tu red?", recién registrado un vuelo.
 *
 * Aparece una sola vez: `FlightLogForm` vuelve a la Bitácora con `?nuevo=<id>`, y la
 * Bitácora lo muestra sólo si ese vuelo existe, no es de simulador y el piloto tiene @.
 * "Ahora no" saca el parámetro de la URL, así que tampoco vuelve con el botón atrás ni
 * al recargar.
 *
 * Si el vuelo cruzó un hito de horas (`hitoCruzado`), lo festeja, y Publicar arranca con
 * el texto escrito (`?hito=`). Ése aparece aunque el piloto no tenga @: Publicar lo deja
 * crear ahí mismo.
 */
export default function BannerCompartirVuelo({
  vueloId,
  resumen,
  hito = null,
}: {
  vueloId: string;
  resumen: string;
  hito?: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const cerrar = () => router.replace(pathname, { scroll: false });

  return (
    <div
      role="status"
      className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-[2rem] border border-aviation-blue/20 dark:border-aviation-cyan/20 bg-aviation-blue/[0.06] dark:bg-aviation-cyan/[0.06] p-5"
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="w-10 h-10 rounded-2xl bg-aviation-blue dark:bg-aviation-cyan text-white dark:text-zinc-900 flex items-center justify-center shrink-0">
          {hito ? <PartyPopper className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-zinc-900 dark:text-white">
            {hito ? `¡Llegaste a las ${hito} horas de vuelo!` : "¿Lo compartís con tu red?"}
          </p>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
            <span className="font-mono">{resumen}</span> · vos elegís qué datos se ven, y la matrícula nunca.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href={`/dashboard/pilotos/publicar?vuelo=${encodeURIComponent(vueloId)}${hito ? `&hito=${hito}` : ""}`}
          className="inline-flex items-center justify-center rounded-2xl bg-aviation-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-aviation-blue-dark transition-colors"
        >
          {hito ? "Contalo" : "Compartir"}
        </Link>
        <button
          type="button"
          onClick={cerrar}
          className="inline-flex items-center gap-1.5 rounded-2xl px-3 py-2.5 text-sm font-semibold text-zinc-500 dark:text-zinc-400 hover:bg-white/60 dark:hover:bg-white/5 transition-colors"
        >
          <X className="w-4 h-4" />
          Ahora no
        </button>
      </div>
    </div>
  );
}
