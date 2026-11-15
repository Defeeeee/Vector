"use client";

import { rotuloDeSeguidor, type Seguidor } from "@/lib/seguidores";

/**
 * "Lo ven en el tracker:" (migración 056): los seguidores que ya entraron, como chips que se prenden
 * y se apagan. **Por defecto ninguno**: un seguidor ve sólo los vuelos a los que el piloto lo asignó.
 * Es presentacional; guardar al tocar (en un vuelo ya creado) o al crear el link (en el formulario
 * "sin plan") lo decide quien lo usa. Si no hay seguidores que ya entraron, no dibuja nada.
 */
export default function ChipsDeSeguidores({
  seguidores,
  seleccion,
  onCambio,
  ocupado = false,
  etiqueta = "Lo ven en el tracker:",
}: {
  /** Los que ya entraron. */
  seguidores: Seguidor[];
  seleccion: string[];
  onCambio: (id: string) => void;
  ocupado?: boolean;
  etiqueta?: string;
}) {
  if (seguidores.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2" role="group" aria-label={etiqueta}>
      <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-500">{etiqueta}</span>
      {seguidores.map((s) => {
        const prendido = seleccion.includes(s.id);
        return (
          <button
            key={s.id}
            type="button"
            aria-pressed={prendido}
            disabled={ocupado}
            onClick={() => onCambio(s.id)}
            className={`min-h-9 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
              prendido ? "border-aviation-cyan bg-aviation-cyan text-noche" : "border-white/20 text-white/70 hover:border-white/40 hover:text-white"
            }`}
          >
            {rotuloDeSeguidor(s)}
          </button>
        );
      })}
    </div>
  );
}
