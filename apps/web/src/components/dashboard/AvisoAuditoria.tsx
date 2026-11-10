import Link from "next/link";
import { ChevronRight, ShieldCheck } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { AUDITORIA_HREF } from "@/lib/secciones";
import type { AuditSummary } from "@/types";

/**
 * La Auditoría arriba de los vuelos (3.12.0). Hasta ahí era una pestaña de la Bitácora con su
 * contador; ahora es un aviso donde se mira el libro, y la pantalla cuelga de Vuelos.
 *
 * Si no se pudo leer, no dice nada (invariante 2: "no sé" no es "está todo bien"). Sin
 * observaciones, queda un link discreto para llegar igual.
 */
export default async function AvisoAuditoria() {
  let abiertas: number | null = null;
  try {
    const res = await apiFetch("/audit/summary");
    if (res.ok) abiertas = ((await res.json()) as AuditSummary).open_total ?? 0;
  } catch {
    abiertas = null;
  }
  if (abiertas === null) return null;

  if (abiertas === 0) {
    return (
      <Link
        href={AUDITORIA_HREF}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
      >
        <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
        Auditoría: tu libro no tiene observaciones
      </Link>
    );
  }

  return (
    <Link
      href={AUDITORIA_HREF}
      className="flex items-center gap-2.5 rounded-[14px] border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-[13.5px] font-bold text-amber-900 dark:text-amber-200"
    >
      <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">
        {abiertas} {abiertas === 1 ? "cosa para revisar" : "cosas para revisar"} en tu libro
      </span>
      <span className="max-sm:hidden font-semibold">Ver la auditoría</span>
      <ChevronRight className="w-4 h-4" aria-hidden="true" />
    </Link>
  );
}
