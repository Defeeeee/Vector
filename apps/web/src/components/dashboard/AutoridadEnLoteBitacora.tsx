"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import type { Aircraft, Flight } from "@/types";
import { AUTORIDADES_CAD } from "@/lib/cad";
import { asignarAutoridad } from "@/actions/cad";

/**
 * La autoridad certificante para varios vuelos de la Bitácora (3.17.0, Federico): se eligen los
 * vuelos —los filtros de arriba ayudan: fechas, avión, propósito— y se les pone la autoridad y
 * su nombre de una vez, estén o no en el CAD.
 *
 * Un vuelo que ya está en el CAD con otra autoridad no se cambia allá desde acá: en la próxima
 * conexión, "Pasar al CAD" lo marca como que no coincide (`diferenciasConElCad`, campo `autoridad`)
 * y, si está pendiente de DDJJ, ofrece "Actualizar en el CAD" (3.18.0).
 */

export function FilaElegible({
  flight,
  aircraft,
  elegido,
  alCambiar,
}: {
  flight: Flight;
  aircraft?: Aircraft;
  elegido: boolean;
  alCambiar: (v: boolean) => void;
}) {
  const [, mes, dia] = flight.date.split("-");
  const autoridad = flight.cad_autoridad_nombre?.trim();
  const tipo = AUTORIDADES_CAD.find((a) => a.id === flight.cad_autoridad_id)?.nombre;
  return (
    <label className={`flex items-center gap-3 px-4 md:px-6 py-3 cursor-pointer transition-colors ${elegido ? "bg-aviation-cyan/10" : "hover:bg-white/[0.03]"}`}>
      <input type="checkbox" checked={elegido} onChange={(e) => alCambiar(e.target.checked)} className="w-4 h-4 accent-aviation-cyan shrink-0" />
      <span className="data text-xs text-zinc-500 w-12 shrink-0">
        {dia}/{mes}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-zinc-900 dark:text-white truncate">
          {flight.route} <span className="font-normal text-zinc-500">· {aircraft?.registration ?? "—"}</span>
        </span>
        <span className="block text-[11px] text-zinc-500 truncate">
          {autoridad ? `${tipo ?? "Autoridad"} · ${autoridad}` : "Sin autoridad"}
          {flight.cad_vuelo_id ? " · en el CAD" : ""}
        </span>
      </span>
      <span className="data text-sm text-zinc-700 dark:text-zinc-300 shrink-0">{Number(flight.duration).toFixed(1)}</span>
    </label>
  );
}

export function BandaAutoridad({ elegidos, alSalir }: { elegidos: Flight[]; alSalir: () => void }) {
  const router = useRouter();
  const [id, setId] = useState("");
  const [nombre, setNombre] = useState("");
  const [estado, setEstado] = useState<{ tipo: "" | "guardando" | "listo" | "error"; texto?: string; enElCad?: number }>({ tipo: "" });
  const listo = !!id && !!nombre.trim() && elegidos.length > 0;

  const aplicar = async () => {
    const nuevoNombre = nombre.trim().replace(/\s+/g, " ").toUpperCase();
    // Los que ya están en el CAD y cambian de verdad: ésos hay que actualizarlos allá.
    const enElCad = elegidos.filter(
      (f) => f.cad_vuelo_id && (String(f.cad_autoridad_id ?? "") !== id || (f.cad_autoridad_nombre ?? "").trim().toUpperCase() !== nuevoNombre)
    ).length;
    setEstado({ tipo: "guardando" });
    const r = await asignarAutoridad(
      elegidos.map((f) => f.id),
      { id, nombre: nuevoNombre }
    );
    if ("error" in r && r.error) return setEstado({ tipo: "error", texto: r.error });
    if (r.guardados < elegidos.length) {
      setEstado({ tipo: "error", texto: `Se guardó en ${r.guardados} de ${elegidos.length}. Probá de nuevo con los que faltan.` });
      router.refresh();
      return;
    }
    setEstado({ tipo: "listo", texto: `Listo: ${elegidos.length === 1 ? "1 vuelo" : `${elegidos.length} vuelos`} con esa autoridad.`, enElCad });
    router.refresh();
  };

  return createPortal(
    <div
      role="region"
      aria-label="Autoridad certificante para los vuelos elegidos"
      className="fixed inset-x-0 lg:left-20 z-[45] bottom-[calc(env(safe-area-inset-bottom)+4rem)] lg:bottom-0 bg-noche/95 backdrop-blur-xl border-t border-white/10 shadow-[0_-12px_40px_-8px_rgb(0_0_0/0.6)]"
    >
      <div className="max-w-5xl mx-auto px-4 lg:px-8 py-2.5 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
            Autoridad certificante · {elegidos.length === 1 ? "1 elegido" : `${elegidos.length} elegidos`}
          </p>
          <button onClick={alSalir} aria-label="Dejar de elegir" className="w-8 h-8 -mr-1 rounded-full flex items-center justify-center text-zinc-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_auto] gap-2">
          <select
            value={id}
            onChange={(e) => setId(e.target.value)}
            aria-label="Autoridad certificante"
            className="h-10 min-w-0 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-white [color-scheme:dark]"
          >
            <option value="">Autoridad certificante…</option>
            {AUTORIDADES_CAD.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre y apellido"
            aria-label="Nombre y apellido de la autoridad"
            className="h-10 min-w-0 rounded-xl bg-white/5 border border-white/10 px-3 text-sm text-white uppercase placeholder:normal-case placeholder:text-zinc-500"
          />
          <button
            onClick={() => void aplicar()}
            disabled={!listo || estado.tipo === "guardando"}
            className="max-sm:col-span-2 h-10 px-5 rounded-full bg-aviation-cyan text-noche text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40"
          >
            {estado.tipo === "guardando" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Poner a {elegidos.length === 1 ? "1 vuelo" : `los ${elegidos.length}`}
          </button>
        </div>
        {estado.texto && (
          <p role="status" className={`text-xs ${estado.tipo === "error" ? "text-red-400" : "text-emerald-400"}`}>
            {estado.texto}
            {estado.tipo === "listo" && !!estado.enElCad && (
              <span className="block text-amber-300">
                {estado.enElCad === 1 ? "1 ya estaba en el CAD" : `${estado.enElCad} ya estaban en el CAD`} con otra autoridad. En{" "}
                <Link href="/dashboard/history/cad" className="font-semibold underline underline-offset-2">
                  Pasar al CAD
                </Link>{" "}
                {estado.enElCad === 1 ? "aparece" : "aparecen"} para actualizarla allá con un toque, si todavía no hiciste la declaración jurada.
              </span>
            )}
          </p>
        )}
      </div>
    </div>,
    document.body
  );
}
