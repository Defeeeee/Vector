import Link from "next/link";
import { ExternalLink, Landmark } from "lucide-react";
import LeidoDelCad from "@/components/dashboard/cad/LeidoDelCad";

/**
 * El recordatorio del inicio: vuelos que ya están en el CAD y esperan la declaración jurada
 * (`cad_estado`, de la sincronización). Vector carga los vuelos; la DDJJ la hace el piloto.
 */
export default function PendientesDdjj({ cuantos, leido }: { cuantos: number; leido: { cuando: string; viejo: boolean } | null }) {
  if (cuantos <= 0) return null;
  return (
    <section className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-3xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/70 dark:bg-amber-500/[0.07] px-5 py-4">
      <span className="grid place-items-center w-10 h-10 rounded-2xl bg-amber-400/90 shrink-0">
        <Landmark className="w-5 h-5 text-zinc-900" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-zinc-900 dark:text-white">
          {cuantos === 1 ? "1 vuelo espera tu declaración jurada" : `${cuantos} vuelos esperan tu declaración jurada`} en el CAD
        </p>
        <p className="text-xs text-zinc-600 dark:text-zinc-300">
          Ya están cargados. Declaralos en &quot;DDJJ de Horas de vuelo&quot;: eso lo hacés vos.{" "}
          <Link href="/dashboard/history/cad" className="font-semibold underline underline-offset-2">
            Ver en Vector
          </Link>
        </p>
        <div className="mt-1">
          <LeidoDelCad leido={leido} />
        </div>
      </div>
      <a
        href="https://cad.anac.gob.ar/portalApp/"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold shrink-0"
      >
        Abrir el CAD <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
      </a>
    </section>
  );
}
