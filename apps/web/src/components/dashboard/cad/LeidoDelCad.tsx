import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { DIAS_PARA_ACTUALIZAR_CAD } from "@/lib/cad";

/**
 * De cuándo es el estado del CAD que muestra Vector (`leidoDelCad`, migración 038), y la
 * recomendación de actualizarlo pasados unos días (Federico, 2026-10-29). Actualizar es abrir
 * "Pasar al CAD" con el CAD abierto (extensión o marcador): Vector lo lee solo.
 */
export default function LeidoDelCad({ leido }: { leido: { cuando: string; viejo: boolean } | null }) {
  if (!leido) return null;
  return (
    <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-xs ${leido.viejo ? "text-amber-700 dark:text-amber-400" : "text-zinc-500 dark:text-zinc-400"}`}>
      <span>Estado del CAD leído {leido.cuando}.</span>
      {leido.viejo && (
        <Link href="/dashboard/history/cad" className="inline-flex items-center gap-1 font-semibold underline underline-offset-2">
          <RefreshCw className="w-3 h-3" aria-hidden="true" />
          Pasaron más de {DIAS_PARA_ACTUALIZAR_CAD} días: actualizalo
        </Link>
      )}
    </p>
  );
}
