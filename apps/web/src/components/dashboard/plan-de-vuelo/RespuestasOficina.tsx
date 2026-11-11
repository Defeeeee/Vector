import type { ClasificacionRespuesta } from "@/lib/respuesta-plan";
import type { RespuestaOficina } from "@/lib/plan-de-vuelo-servidor";

/**
 * Lo que contestó la oficina ARO/AIS a un plan (migración 043): el estado bien visible, de
 * quién, cuándo y el texto plegable (`<details>`, sin JavaScript). Sin hooks: sirve igual
 * adentro del editor, que es cliente.
 *
 * La fecha viene escrita del server (`cuando`, invariante 1).
 */
export type RespuestaConFecha = RespuestaOficina & { cuando: string };

const ESTADOS: Record<ClasificacionRespuesta, { texto: string; clase: string }> = {
  aceptado: { texto: "Aceptado", clase: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" },
  rechazado: { texto: "Rechazado", clase: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400" },
  corregir: { texto: "Piden corregir", clase: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400" },
  recibido: { texto: "Recibido", clase: "bg-zinc-100 text-zinc-600 dark:bg-white/5 dark:text-zinc-400" },
  otra: { texto: "Respuesta", clase: "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400" },
};

/** La etiqueta de color: la de la lista de planes y la de cada respuesta. */
export function EstadoRespuesta({ estado, titulo }: { estado: ClasificacionRespuesta; titulo?: string }) {
  const e = ESTADOS[estado] ?? ESTADOS.otra;
  return (
    <span title={titulo} className={`px-2 py-0.5 rounded-full text-[10px] font-sans font-bold ${e.clase}`}>
      {e.texto}
    </span>
  );
}

export default function RespuestasOficina({ respuestas }: { respuestas: RespuestaConFecha[] }) {
  if (respuestas.length === 0) return null;
  return (
    <div className="space-y-2.5 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-carbon p-4">
      <p className="text-sm font-semibold text-zinc-900 dark:text-white">Respuestas de la oficina</p>
      <ul className="space-y-2">
        {respuestas.map((r) => (
          <li key={r.id} className="space-y-1">
            <p className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              {r.de_oficina ? <EstadoRespuesta estado={r.clasificacion} /> : <span className="font-semibold">De otra dirección</span>}
              <span className="font-semibold break-all">{r.de}</span>
              <span>· {r.cuando}</span>
            </p>
            {r.texto.trim() ? (
              <details className="group text-xs text-zinc-600 dark:text-zinc-300">
                <summary className="cursor-pointer select-none text-zinc-500 dark:text-zinc-400 group-open:mb-1">Ver el mensaje</summary>
                <pre className="whitespace-pre-wrap break-words font-sans leading-relaxed">{r.texto}</pre>
              </details>
            ) : (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">No pudimos leer el texto: miralo en tu correo.</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
