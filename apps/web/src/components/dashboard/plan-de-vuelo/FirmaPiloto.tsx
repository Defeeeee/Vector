"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser, Loader2, PenLine } from "lucide-react";
import { guardarFirma } from "@/actions/plan-de-vuelo";

/**
 * La firma del piloto: se dibuja una vez y queda guardada (`firmas_plan_vuelo`, migración
 * 024), para todos los planes y las demoras. "Firmar de nuevo" la reemplaza.
 *
 * Tinta oscura sobre fondo transparente, que es como queda en el PDF, también en modo oscuro.
 */
export default function FirmaPiloto({
  inicial,
  onCambio,
}: {
  inicial: string | null;
  onCambio: (png: string | null) => void;
}) {
  const [firma, setFirma] = useState<string | null>(inicial);
  const [dibujando, setDibujando] = useState(!inicial);
  const [hayTrazo, setHayTrazo] = useState(false);
  const [estado, setEstado] = useState<"" | "guardando" | "error">("");
  const lienzo = useRef<HTMLCanvasElement>(null);
  const trazando = useRef(false);

  useEffect(() => {
    if (!dibujando) return;
    const c = lienzo.current;
    if (!c) return;
    const escala = window.devicePixelRatio || 1;
    c.width = c.clientWidth * escala;
    c.height = c.clientHeight * escala;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(escala, escala);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0b1f6b";
  }, [dibujando]);

  const punto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const guardar = async () => {
    const c = lienzo.current;
    if (!c || !hayTrazo) return;
    const png = c.toDataURL("image/png");
    setEstado("guardando");
    const r = await guardarFirma(png);
    if ("error" in r) {
      setEstado("error");
      return;
    }
    setEstado("");
    setFirma(png);
    setDibujando(false);
    setHayTrazo(false);
    onCambio(png);
  };

  if (!dibujando && firma) {
    return (
      <div className="space-y-2">
        <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={firma} alt="Tu firma" className="h-24 mx-auto object-contain" />
        </div>
        <button
          type="button"
          onClick={() => setDibujando(true)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
        >
          <PenLine className="w-3.5 h-3.5" /> Firmar de nuevo
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative rounded-2xl border-2 border-dashed border-zinc-200 dark:border-white/15 bg-white overflow-hidden">
        <canvas
          ref={lienzo}
          className="w-full h-32 touch-none cursor-crosshair block"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            trazando.current = true;
            const ctx = e.currentTarget.getContext("2d");
            const p = punto(e);
            ctx?.beginPath();
            ctx?.moveTo(p.x, p.y);
          }}
          onPointerMove={(e) => {
            if (!trazando.current) return;
            const ctx = e.currentTarget.getContext("2d");
            const p = punto(e);
            ctx?.lineTo(p.x, p.y);
            ctx?.stroke();
            setHayTrazo(true);
          }}
          onPointerUp={() => {
            trazando.current = false;
          }}
        />
        <span className="pointer-events-none absolute left-4 bottom-2 text-[10px] font-mono uppercase tracking-wider text-zinc-300">
          Firmá acá
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={guardar}
          disabled={!hayTrazo || estado === "guardando"}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-bold disabled:opacity-40"
        >
          {estado === "guardando" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Guardar firma
        </button>
        <button
          type="button"
          onClick={() => {
            const c = lienzo.current;
            c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
            setHayTrazo(false);
          }}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
        >
          <Eraser className="w-3.5 h-3.5" /> Borrar
        </button>
        {firma && (
          <button
            type="button"
            onClick={() => setDibujando(false)}
            className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
          >
            Usar la guardada
          </button>
        )}
        {estado === "error" && <span className="text-xs text-red-600">No se pudo guardar la firma.</span>}
      </div>
      <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Se guarda una vez y va en todos tus planes y demoras.</p>
    </div>
  );
}
