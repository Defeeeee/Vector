"use client";

import { useState } from "react";
import type { SeguimientoEnVivo } from "./useSeguimientoEnVivo";

/**
 * "Compartir mi vuelo": el botón del Mapa en modo vuelo. Crea el seguimiento, abre el menú de
 * compartir del teléfono (`navigator.share`) con el link, y si no hay —o falla— lo copia. Después
 * muestra "Compartiendo · Dejar de compartir".
 *
 * El estado es del hook (`useSeguimientoEnVivo`), que vive arriba, en el Mapa, junto al GPS: acá
 * sólo se dibuja. Estética de la pantalla de vuelo: rótulos en mono y cian, sin caja.
 *
 * Qué ve la familia está dicho antes de compartir: ahí mismo, en una línea.
 */

type Aviso = "copiado" | "manual" | null;

async function mandarLink(url: string): Promise<"compartido" | "cancelado" | Aviso> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "Seguí mi vuelo", text: "Seguí mi vuelo en vivo:", url });
      return "compartido";
    } catch (e) {
      // El piloto cerró el menú: no es un error, el link ya está creado y puede volver a mandarlo.
      if (e instanceof DOMException && e.name === "AbortError") return "cancelado";
      // Safari corta `share` si pasó mucho desde el toque (NotAllowedError): se copia.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copiado";
  } catch {
    return "manual";
  }
}

export default function CompartirSeguimiento({ seguimiento, className = "" }: { seguimiento: SeguimientoEnVivo; className?: string }) {
  const { estado, url, error, sinSenal, compartir, dejarDeCompartir } = seguimiento;
  const [aviso, setAviso] = useState<Aviso>(null);

  const alCompartir = async () => {
    setAviso(null);
    const link = await compartir();
    if (!link) return;
    const r = await mandarLink(link);
    if (r === "copiado" || r === "manual") setAviso(r);
  };

  const volverAMandar = async () => {
    if (!url) return;
    const r = await mandarLink(url);
    setAviso(r === "copiado" || r === "manual" ? r : null);
  };

  const rotulo = "font-mono text-[10px] font-bold uppercase tracking-wider";

  if (estado !== "compartiendo") {
    return (
      <div className={className}>
        <button
          type="button"
          onClick={alCompartir}
          disabled={estado === "creando"}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-aviation-cyan px-4 py-2.5 text-sm font-bold text-noche transition-colors hover:bg-sky-300 disabled:opacity-50"
        >
          {estado === "creando" ? "Creando el link…" : "Compartir mi vuelo"}
        </button>
        <p className="mt-1.5 text-center text-[11px] leading-snug text-white/50">
          Quien tenga el link ve dónde vas, sin cuenta, hasta que toques Terminar.
        </p>
        {error && <p className="mt-1.5 text-center text-xs font-semibold text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3">
        <span className={`${rotulo} flex items-center gap-2 text-aviation-cyan`}>
          <span className="h-1.5 w-1.5 rounded-full bg-aviation-cyan" />
          Compartiendo
        </span>
        <div className="flex items-center gap-4">
          <button type="button" onClick={volverAMandar} className={`${rotulo} text-white/60 hover:text-white`}>
            Mandar el link
          </button>
          <button type="button" onClick={() => void dejarDeCompartir()} className={`${rotulo} text-red-400 hover:text-red-300`}>
            Dejar de compartir
          </button>
        </div>
      </div>
      {sinSenal && <p className="mt-1.5 text-xs text-amber-300">Sin señal: el link muestra la última posición que llegó.</p>}
      {aviso === "copiado" && <p className="mt-1.5 text-xs text-white/60">Link copiado.</p>}
      {aviso === "manual" && url && (
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="mt-1.5 w-full rounded-lg border border-white/10 bg-transparent px-2 py-1.5 font-mono text-xs text-white/80"
        />
      )}
      {error && <p className="mt-1.5 text-xs font-semibold text-red-400">{error}</p>}
    </div>
  );
}
