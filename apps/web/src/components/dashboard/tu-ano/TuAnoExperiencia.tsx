"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import type { TuAno } from "@/lib/tu-ano";
import { historiasDe } from "./historias";

/**
 * "Tu año en vuelo": las historias a pantalla completa. Un portal sobre `body` (lo `fixed`
 * dentro de una página que entra con `animate-in` queda atrapado por su `transform`).
 *
 * Tocar la mitad derecha avanza y la izquierda retrocede; mantener apretado pausa; cada
 * historia pasa sola a los ~6 s (salvo con movimiento reducido: ahí sólo avanza quien toca).
 * En la compu va ←, → y Esc. Los números ya vienen calculados por el server.
 */

const DURACION_MS = 6000;
const PAUSA_TRAS_MS = 220;

function Barras({
  total, indice, pausado, auto, onFin,
}: {
  total: number; indice: number; pausado: boolean; auto: boolean; onFin: () => void;
}) {
  const [p, setP] = useState(0);
  const pRef = useRef(0);
  const alFin = useRef(onFin);
  alFin.current = onFin;

  useEffect(() => {
    pRef.current = 0;
    setP(0);
  }, [indice]);

  useEffect(() => {
    if (!auto || pausado) return;
    let ultimo = performance.now();
    const id = setInterval(() => {
      const ahora = performance.now();
      // Con la pestaña de fondo el reloj se atrasa: un salto grande no tiene que saltar una historia.
      pRef.current += Math.min(ahora - ultimo, 100) / DURACION_MS;
      ultimo = ahora;
      if (pRef.current >= 1) {
        pRef.current = 1;
        setP(1);
        clearInterval(id);
        alFin.current();
      } else {
        setP(pRef.current);
      }
    }, 50);
    return () => clearInterval(id);
  }, [indice, auto, pausado]);

  return (
    <div className="flex gap-1.5" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => {
        const lleno = i < indice || (i === indice && !auto);
        const ancho = lleno ? 1 : i === indice ? p : 0;
        return (
          <div key={i} className="flex-1 h-[3px] rounded-full bg-white/25 overflow-hidden">
            <div className="h-full w-full bg-white origin-left" style={{ transform: `scaleX(${ancho})` }} />
          </div>
        );
      })}
    </div>
  );
}

export default function TuAnoExperiencia({ datos, anios }: { datos: TuAno; anios: number[] }) {
  const router = useRouter();
  const reducido = useReducedMotion();
  const historias = useMemo(() => historiasDe(datos, anios), [datos, anios]);
  const [montado, setMontado] = useState(false);
  const [indice, setIndice] = useState(0);
  const [pausado, setPausado] = useState(false);
  const apretadoDesde = useRef<number | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const marco = useRef<HTMLDivElement>(null);

  useEffect(() => setMontado(true), []);

  // Sin scroll de la página de atrás mientras las historias están abiertas.
  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, []);

  const cerrar = useCallback(() => router.push("/dashboard/summary"), [router]);
  const siguiente = useCallback(() => setIndice((i) => Math.min(i + 1, historias.length - 1)), [historias.length]);
  const anterior = useCallback(() => setIndice((i) => Math.max(i - 1, 0)), []);

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === "ArrowRight") siguiente();
      else if (e.key === "ArrowLeft") anterior();
      else if (e.key === "Escape") cerrar();
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [siguiente, anterior, cerrar]);

  function alApretar(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("[data-no-tap]")) return;
    apretadoDesde.current = performance.now();
    temporizador.current = setTimeout(() => setPausado(true), PAUSA_TRAS_MS);
  }

  function alSoltar(e: React.PointerEvent) {
    if (apretadoDesde.current === null) return;
    const duro = performance.now() - apretadoDesde.current;
    apretadoDesde.current = null;
    if (temporizador.current) clearTimeout(temporizador.current);
    setPausado(false);
    if (duro >= PAUSA_TRAS_MS) return; // era una pausa, no un toque
    const caja = marco.current?.getBoundingClientRect();
    if (!caja) return;
    if (e.clientX - caja.left < caja.width / 2) anterior();
    else siguiente();
  }

  function alCancelar() {
    apretadoDesde.current = null;
    if (temporizador.current) clearTimeout(temporizador.current);
    setPausado(false);
  }

  if (!montado) return null;
  const h = historias[indice];

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Tu ${datos.anio} en vuelo`}
    >
      <div
        ref={marco}
        className="@container relative h-full w-full lg:h-[min(calc(100dvh-2rem),980px)] lg:w-auto lg:aspect-[9/16] lg:rounded-[2rem] lg:ring-1 lg:ring-white/10 overflow-hidden select-none touch-manipulation"
        style={{ background: h.fondo, transition: "background 0.5s" }}
        onPointerDown={alApretar}
        onPointerUp={alSoltar}
        onPointerCancel={alCancelar}
        onPointerLeave={alCancelar}
        onContextMenu={(e) => e.preventDefault()}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={h.id}
            className="absolute inset-0"
            initial={reducido ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reducido ? undefined : { opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            {h.contenido}
          </motion.div>
        </AnimatePresence>

        {/* Barras y cerrar, arriba de todo. */}
        <div className="absolute inset-x-0 top-0 z-10 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-6 bg-gradient-to-b from-black/45 to-transparent pointer-events-none">
          <Barras total={historias.length} indice={indice} pausado={pausado} auto={h.auto && !reducido} onFin={siguiente} />
          <div className="mt-3 flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/70">Vector · {datos.anio}</span>
            <button
              type="button"
              data-no-tap
              onClick={cerrar}
              aria-label="Cerrar y volver al Resumen"
              className="pointer-events-auto -mr-2 w-11 h-11 inline-flex items-center justify-center rounded-full text-white/85 hover:text-white"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
