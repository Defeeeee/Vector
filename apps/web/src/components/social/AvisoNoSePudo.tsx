import { CloudOff } from "lucide-react";

/**
 * "No pudimos preguntar", dicho como tal. **No es lo mismo que "no hay"** (invariante 2):
 * una Red que no cargó no puede decir "no seguís a nadie".
 */
export default function AvisoNoSePudo({ texto }: { texto: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-[2rem] border border-amber-200 dark:border-amber-400/20 bg-amber-50 dark:bg-amber-400/[0.06] p-5"
    >
      <CloudOff className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" aria-hidden="true" />
      <div>
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">{texto}</p>
        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Probá de nuevo en un momento.</p>
      </div>
    </div>
  );
}
