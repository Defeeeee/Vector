"use client";

import { useState } from "react";
import { seguimientoParaAdoptar } from "@/actions/seguimiento";
import { detalleDeVistas, type SeguimientoGuardado } from "@/lib/seguimiento";
import type { SeguimientoEnVivo } from "./useSeguimientoEnVivo";

/**
 * "Compartir mi vuelo": el botón del Mapa en modo vuelo. Crea el seguimiento, abre el menú de
 * compartir del teléfono (`navigator.share`) con el link, y si no hay —o falla— lo copia. Después
 * muestra "Compartiendo · Dejar de compartir".
 *
 * El estado es del hook (`useSeguimientoEnVivo`), que vive arriba, en el Mapa, junto al GPS: acá
 * sólo se dibuja. Estética de la pantalla de vuelo: rótulos en mono y cian, sin caja.
 *
 * **Con varios links a la vez** (3.41.0): si el piloto ya mandó el de un vuelo "sin plan" que sale por
 * estas horas, al tocar "Compartir mi vuelo" se le ofrece **usar ese** (el GPS se manda al mismo token
 * y la familia no recibe otro) o crear uno nuevo. La búsqueda es un pedido al tocar, nunca al dibujar
 * (invariante 15).
 *
 * Qué ve la familia está dicho antes de compartir: ahí mismo, en una línea. **La matrícula no sale a
 * menos que el piloto prenda "Mostrar la matrícula"**: apagado por defecto, y se puede cambiar
 * mientras se comparte.
 */

type Aviso = "copiado" | "manual" | null;

function InterruptorMatricula({ seguimiento }: { seguimiento: SeguimientoEnVivo }) {
  const { mostrarMatricula, sinMatricula, cambiarMostrarMatricula } = seguimiento;
  return (
    <label className={`mt-2 flex items-center justify-between gap-3 text-xs ${sinMatricula ? "opacity-50" : "cursor-pointer"}`}>
      <span className="text-white/80">
        Mostrar la matrícula
        <span className="block text-[11px] text-white/50">{sinMatricula ? "Elegí un avión para poder mostrarla." : mostrarMatricula ? "Prendido: el link muestra la matrícula." : "Apagado: el link dice el modelo, no la matrícula."}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={mostrarMatricula}
        disabled={sinMatricula}
        onChange={(e) => void cambiarMostrarMatricula(e.target.checked)}
        className="h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full bg-white/20 transition-colors checked:bg-aviation-cyan disabled:cursor-not-allowed relative after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform checked:after:translate-x-4"
      />
    </label>
  );
}

export async function mandarLink(url: string): Promise<"compartido" | "cancelado" | Aviso> {
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
  const { estado, url, error, sinSenal, vistas, delPlan, linkPrevio, usarLinkPrevio, compartir, dejarDeCompartir } = seguimiento;
  const [aviso, setAviso] = useState<Aviso>(null);
  const [buscando, setBuscando] = useState(false);
  const [oferta, setOferta] = useState<{ guardado: SeguimientoGuardado; trayecto: string } | null>(null);

  // Al tocar: si hay un link sin plan de este vuelo, se ofrece usarlo; si no (o no se pudo leer), uno nuevo.
  const alTocar = async () => {
    setAviso(null);
    setBuscando(true);
    let previo: { guardado: SeguimientoGuardado; trayecto: string } | null = null;
    try {
      previo = await seguimientoParaAdoptar();
    } catch {
      previo = null;
    } finally {
      setBuscando(false);
    }
    if (previo) {
      setOferta(previo);
      return;
    }
    await alCompartir();
  };

  const alCompartir = async () => {
    setAviso(null);
    setOferta(null);
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
          onClick={alTocar}
          disabled={estado === "creando" || buscando || oferta !== null}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-aviation-cyan px-4 py-2.5 text-sm font-bold text-noche transition-colors hover:bg-sky-300 disabled:opacity-50"
        >
          {estado === "creando" ? "Creando el link…" : buscando ? "Un momento…" : "Compartir mi vuelo"}
        </button>
        {oferta && (
          <div className="mt-2 space-y-1.5 border-t border-white/10 pt-2">
            <p className="text-xs text-white/70">Ya le mandaste a tu familia el link de este vuelo.</p>
            <button
              type="button"
              onClick={() => {
                usarLinkPrevio(oferta.guardado);
                setOferta(null);
              }}
              className="w-full rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-white/20"
            >
              Usar el link que ya mandaste ({oferta.trayecto})
            </button>
            <button type="button" onClick={() => void alCompartir()} className={`${rotulo} w-full py-2 text-white/60 hover:text-white`}>
              Uno nuevo
            </button>
          </div>
        )}
        <p className="mt-1.5 text-center text-[11px] leading-snug text-white/50">
          Quien tenga el link ve dónde vas, tu ruta, el modelo del avión y el clima del destino, sin cuenta, hasta que toques Terminar.
        </p>
        <InterruptorMatricula seguimiento={seguimiento} />
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
      {delPlan && (
        <p className="mt-1.5 text-xs text-white/70">Tu familia ya tiene el link de este vuelo, el del plan: el GPS del teléfono se suma al ADS-B en el mismo link.</p>
      )}
      {linkPrevio && (
        <p className="mt-1.5 text-xs text-white/70">Estás usando el link que ya mandaste: el GPS del teléfono se suma y la ruta que volás reemplaza la línea directa.</p>
      )}
      {detalleDeVistas(vistas) && <p className="mt-1.5 text-xs text-white/70">{detalleDeVistas(vistas)}</p>}
      <InterruptorMatricula seguimiento={seguimiento} />
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
