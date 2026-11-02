"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Flag, Loader2, X } from "lucide-react";
import { useAvisos } from "@/components/dashboard/Avisos";
import { reportar, type TipoReporte } from "@/actions/social";

const MOTIVOS = [
  "Spam o publicidad",
  "Acoso o insultos",
  "Contenido inapropiado",
  "Se hace pasar por otra persona",
  "Información falsa o peligrosa",
  "Otro",
] as const;

const QUE: Record<TipoReporte, string> = {
  perfil: "este perfil",
  publicacion: "esta publicación",
  comentario: "este comentario",
};

/**
 * Reportar un perfil, una publicación o un comentario: un motivo, y un detalle si hace
 * falta. Lo revisa quien administra la red; el reportado no se entera de quién fue.
 *
 * "Otro" pide el detalle, porque un reporte sin motivo no se puede revisar. El motivo y
 * el detalle viajan juntos en un solo texto, con el tope del backend (500).
 */
export default function DialogoReportar({
  tipo,
  objetivo,
  alCerrar,
}: {
  tipo: TipoReporte;
  /** El @ del perfil, o el id de la publicación o del comentario. */
  objetivo: string;
  alCerrar: () => void;
}) {
  const [motivo, setMotivo] = useState<(typeof MOTIVOS)[number] | null>(null);
  const [detalle, setDetalle] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { notificar } = useAvisos();
  const titulo = useId();
  const primero = useRef<HTMLInputElement>(null);
  // En una ref: si quien lo abre se vuelve a dibujar, el efecto no se repite (y el foco
  // no salta al primer motivo mientras se escribe).
  const cerrar = useRef(alCerrar);
  useEffect(() => {
    cerrar.current = alCerrar;
  });

  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    primero.current?.focus();
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar.current();
    };
    window.addEventListener("keydown", alTeclear);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", alTeclear);
    };
  }, []);

  const faltaDetalle = motivo === "Otro" && !detalle.trim();

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!motivo || faltaDetalle || enviando) return;
    setEnviando(true);
    setError(null);
    const texto = detalle.trim() ? `${motivo}: ${detalle.trim()}` : motivo;
    const r = await reportar(tipo, objetivo, texto);
    setEnviando(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    notificar({ tipo: "exito", titulo: "Gracias por avisar", detalle: "Lo vamos a revisar." });
    alCerrar();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-6"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) alCerrar();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titulo}
        onSubmit={enviar}
        className="w-full sm:max-w-md bg-white dark:bg-[#111111] rounded-t-[2rem] sm:rounded-[2rem] border border-zinc-200 dark:border-white/10 p-6 space-y-4 max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titulo} className="text-lg font-display font-bold text-zinc-900 dark:text-white tracking-tight">
              Reportar {QUE[tipo]}
            </h2>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
              No se entera de quién lo reportó. Si querés dejar de verlo, también podés bloquearlo.
            </p>
          </div>
          <button
            type="button"
            onClick={alCerrar}
            aria-label="Cerrar"
            className="-mr-2 -mt-1 p-2 rounded-full text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <fieldset className="space-y-1.5">
          <legend className="sr-only">Motivo</legend>
          {MOTIVOS.map((m, i) => (
            <label
              key={m}
              className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-medium cursor-pointer transition-colors ${
                motivo === m
                  ? "border-zinc-900 dark:border-white bg-zinc-50 dark:bg-white/5 text-zinc-900 dark:text-white"
                  : "border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-white/5"
              }`}
            >
              <input
                ref={i === 0 ? primero : undefined}
                type="radio"
                name="motivo"
                value={m}
                checked={motivo === m}
                onChange={() => setMotivo(m)}
                className="accent-zinc-900 dark:accent-white"
              />
              {m}
            </label>
          ))}
        </fieldset>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {motivo === "Otro" ? "Contanos qué pasa" : "Algo más (opcional)"}
          </span>
          <textarea
            value={detalle}
            onChange={(e) => setDetalle(e.target.value)}
            maxLength={400}
            rows={3}
            className="w-full resize-none rounded-2xl border border-zinc-200 dark:border-white/10 bg-transparent px-4 py-3 text-sm text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-zinc-900/20 dark:focus:ring-white/20"
          />
        </label>

        {error && <p className="text-[13px] font-medium text-red-600 dark:text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={!motivo || faltaDetalle || enviando}
          className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 py-3.5 text-sm font-semibold text-white hover:bg-red-700 transition-colors disabled:opacity-50"
        >
          {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />}
          Enviar reporte
        </button>
      </form>
    </div>,
    document.body
  );
}
