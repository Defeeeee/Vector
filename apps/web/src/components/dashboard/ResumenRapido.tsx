import Link from "next/link";

/**
 * **El inicio en el teléfono** (3.4.0): después de "¿Puedo volar hoy?", las otras dos
 * preguntas en una fila —cuánto te queda y cuánto te falta— y las horas totales en un
 * renglón. En el escritorio no se dibuja: ahí siguen las horas grandes arriba de todo
 * (Federico, 2026-10-10), el saldo y el tracker completos.
 *
 * Cada mitad es opcional: sin pack activo ni saldo conocido no hay "te quedan", y sin
 * licencia en camino (ni alumno ni PPA) no hay "te falta". Nunca se dibuja un cero que
 * no se sabe (invariante 2): eso lo deciden los números que llegan, ya filtrados.
 */
export interface Mitad {
  etiqueta: string;
  valor: string;
  unidad?: string;
  detalle: string;
  /** 0–100, para la barra; `null` sin barra. */
  porcentaje: number | null;
  /** La barra de lo que queda es azul; la de lo que falta, neutra (como en el diseño). */
  tono?: "azul" | "neutro";
  href: string;
}

/** Un renglón de "últimos vuelos" del teléfono, ya escrito en el server. */
export interface VueloCorto {
  id: string;
  fecha: string;
  ruta: string;
  horas: string;
}

export default function ResumenRapido({
  queda,
  falta,
  totalHoras,
  ultimos = [],
}: {
  queda: Mitad | null;
  falta: Mitad | null;
  totalHoras: string | null;
  ultimos?: VueloCorto[];
}) {
  if (!queda && !falta && !totalHoras && ultimos.length === 0) return null;
  const mitades = [queda, falta].filter((m): m is Mitad => m !== null);
  return (
    <section className="lg:hidden flex flex-col gap-3">
      {mitades.length > 0 && (
        <div className={`grid gap-3 ${mitades.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
          {mitades.map((m) => (
            <Link
              key={m.etiqueta}
              href={m.href}
              className="rounded-[20px] bg-white dark:bg-[#111111] border border-zinc-200 dark:border-white/10 app:border-transparent app:dark:border-transparent p-3.5 flex flex-col gap-1.5 active:scale-[0.98] transition-transform"
            >
              <span className="eyebrow">{m.etiqueta}</span>
              <span className="data text-[26px] leading-tight font-semibold text-zinc-900 dark:text-white">
                {m.valor}
                {m.unidad && <span className="text-sm text-zinc-500 dark:text-zinc-400 font-medium"> {m.unidad}</span>}
              </span>
              {m.porcentaje !== null && (
                <span className="h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden" aria-hidden="true">
                  <span className={`block h-full rounded-full ${m.tono === "neutro" ? "bg-zinc-900 dark:bg-white" : "bg-aviation-blue"}`} style={{ width: `${Math.max(0, Math.min(100, m.porcentaje))}%` }} />
                </span>
              )}
              <span className="text-xs text-zinc-600 dark:text-zinc-400 truncate">{m.detalle}</span>
            </Link>
          ))}
        </div>
      )}
      {totalHoras && (
        <Link
          href="/dashboard/summary"
          className="rounded-[20px] bg-white dark:bg-[#111111] border border-zinc-200 dark:border-white/10 app:border-transparent app:dark:border-transparent px-4 py-3.5 flex items-baseline gap-2"
        >
          <span className="eyebrow flex-1">Horas totales</span>
          <span className="data text-[28px] leading-none font-semibold text-zinc-900 dark:text-white">{totalHoras}</span>
          <span className="app:hidden text-[13px] font-bold text-aviation-blue-dark dark:text-aviation-cyan">Resumen</span>
        </Link>
      )}
      {ultimos.length > 0 && (
        <div className="rounded-[20px] bg-white dark:bg-[#111111] border border-zinc-200 dark:border-white/10 app:border-transparent app:dark:border-transparent px-4 py-1.5 divide-y divide-zinc-100 dark:divide-white/5">
          {ultimos.map((v) => (
            <Link key={v.id} href={`/dashboard/history?ver=${v.id}`} className="flex items-center gap-3 py-2.5 app:py-[11px]">
              <span className="data text-xs text-zinc-500 dark:text-zinc-400 w-11 shrink-0">{v.fecha}</span>
              <span className="data text-sm font-semibold text-zinc-900 dark:text-white flex-1 min-w-0 truncate">{v.ruta}</span>
              <span className="data text-sm font-semibold text-zinc-900 dark:text-white">{v.horas}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
