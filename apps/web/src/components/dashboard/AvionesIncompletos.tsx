import Link from "next/link";
import type { Aircraft } from "@/types";

/**
 * "Completá los datos de LV-ABC": los aviones que agregamos solos desde el libro importado
 * (migración 059) con matrícula y modelo. Una banda de borde a borde, en mono chica; se va cuando
 * el avión queda completo (el backend lo marca al guardar el tipo OACI y la categoría).
 *
 * Sólo lee lo que ya vino: no escribe nada al dibujarse (invariante 15). `datos_completos`
 * ausente es un avión completo, así que un backend viejo no muestra nada.
 */
export function avionesIncompletos(aviones: Pick<Aircraft, "id" | "registration" | "datos_completos" | "is_simulator">[]) {
  return aviones.filter((a) => a.datos_completos === false && !a.is_simulator);
}

export default function AvionesIncompletos({ aviones }: { aviones: Pick<Aircraft, "id" | "registration" | "datos_completos" | "is_simulator">[] }) {
  const faltan = avionesIncompletos(aviones);
  if (faltan.length === 0) return null;
  return (
    <section className="border-y border-aviation-cyan/30 bg-aviation-cyan/[0.05] px-1 py-3 font-mono text-[11px] uppercase tracking-[0.08em] leading-relaxed text-zinc-300">
      Completá los datos de{" "}
      {faltan.map((a, i) => (
        <span key={a.id}>
          {i > 0 && (i === faltan.length - 1 ? " y " : ", ")}
          <Link href={`/dashboard/settings?editar=${a.id}#aeronaves`} className="font-bold text-aviation-cyan underline underline-offset-4">
            {a.registration}
          </Link>
        </span>
      ))}
      : los agregamos desde tu libro con matrícula y modelo.
    </section>
  );
}
