import Link from "next/link";
import { ArrowRight, CalendarClock } from "lucide-react";
import { PilotDocument } from "@/types";
import { documentStatus } from "@/lib/utils";

/**
 * El documento que vence primero, en una línea, debajo de "¿Podés volar hoy?".
 *
 * Es la mitad que quedó de `LogbookHealthCard`. La otra mitad —la salud del libro—
 * se mudó a la pestaña Auditoría de la Bitácora, que lleva el contador de hallazgos en
 * la barra. Ésta se queda en el inicio porque contesta la misma pregunta que el
 * semáforo, pero para la semana que viene: el semáforo en verde es compacto y no dice
 * que el CMA vence en doce días.
 *
 * **No aparece si no tiene un vencimiento que mostrar.** Sin documentos, o con la
 * consulta caída, el semáforo ya lo dice con más contexto —y `PrimerosPasos` pide
 * cargar el CMA—; repetirlo acá sería el mismo cartel dos veces.
 */
export default function ProximoVencimiento({ documents }: { documents: PilotDocument[] }) {
  // Los que no vencen quedan afuera: no hay cuenta regresiva que mostrar ni nada que
  // renovar.
  const ranked = documents
    .map((doc) => ({ doc, status: documentStatus(doc.expiry_date) }))
    .filter((d) => d.status.daysRemaining !== null)
    .sort((a, b) => (a.status.daysRemaining ?? Infinity) - (b.status.daysRemaining ?? Infinity));

  const next = ranked[0];
  if (!next) return null;

  const urgentes = ranked.filter((d) => d.status.tone !== "ok").length;
  // Mismos umbrales que el barrido de avisos (60/30/7): el color de acá y el mensaje
  // de WhatsApp dicen lo mismo el mismo día. Ver `documentStatus`.
  const tono =
    next.status.tone === "ok"
      ? "text-zinc-900 dark:text-white"
      : next.status.tone === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";

  return (
    <Link
      href="/dashboard/settings"
      className="group flex items-center gap-3 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] px-4 py-3 hover:bg-zinc-50 dark:hover:bg-white/[0.04] transition-colors"
    >
      <CalendarClock className="w-5 h-5 shrink-0 text-zinc-400 dark:text-zinc-500" />
      <p className="flex-1 min-w-0 text-sm text-zinc-600 dark:text-zinc-300 truncate">
        <span className={`font-bold ${tono}`}>{next.status.label}</span>
        <span className="text-zinc-400 dark:text-zinc-500"> · </span>
        {next.doc.name}
        {urgentes > 1 && (
          <span className="text-amber-600 dark:text-amber-400 font-semibold">
            {" "}
            · {urgentes} documentos necesitan atención
          </span>
        )}
      </p>
      <span className="hidden sm:flex items-center gap-1.5 text-[11px] font-bold text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors shrink-0">
        Gestionar
        <ArrowRight className="w-3.5 h-3.5" />
      </span>
    </Link>
  );
}
