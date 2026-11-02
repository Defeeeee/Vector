"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { FotoPublicacion } from "@/types";

/**
 * Las fotos de una publicación: una grande, dos lado a lado, tres con la primera
 * ancha, cuatro en cuadrícula. Tocando una se abre el visor.
 *
 * Una foto sola respeta su proporción pero acotada entre 4:5 y 2:1, como hacen las
 * redes: una vertical de teléfono a lo ancho de la columna mediría un metro.
 */
export default function GaleriaFotos({ fotos, autor }: { fotos: FotoPublicacion[]; autor: string }) {
  const [abierta, setAbierta] = useState<number | null>(null);
  const cerrar = useCallback(() => setAbierta(null), []);
  const n = fotos.length;
  if (n === 0) return null;

  const proporcion = (f: FotoPublicacion, i: number) => {
    if (n === 1) return Math.min(Math.max(f.ancho / Math.max(f.alto, 1), 0.8), 2);
    if (n === 3 && i === 0) return 2;
    return 1;
  };

  return (
    <>
      <div className={`grid gap-1 overflow-hidden rounded-2xl ${n === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
        {fotos.map((f, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setAbierta(i)}
            aria-label={n === 1 ? "Ver la foto en grande" : `Ver la foto ${i + 1} de ${n} en grande`}
            className={`relative block overflow-hidden bg-zinc-100 dark:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-aviation-blue ${
              n === 3 && i === 0 ? "col-span-2" : ""
            }`}
            style={{ aspectRatio: proporcion(f, i) }}
          >
            <img
              src={f.url}
              alt=""
              width={f.ancho}
              height={f.alto}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover"
            />
          </button>
        ))}
      </div>
      {abierta !== null && <VisorFotos fotos={fotos} inicial={abierta} autor={autor} alCerrar={cerrar} />}
    </>
  );
}

/**
 * Las fotos en pantalla completa. Por portal al `body`: las páginas del dashboard entran
 * con una animación que usa `transform`, y un `position: fixed` adentro de un elemento
 * transformado se posiciona contra ese elemento y no contra la pantalla.
 *
 * Escape cierra; las flechas —o deslizar el dedo— pasan de foto.
 */
function VisorFotos({
  fotos,
  inicial,
  autor,
  alCerrar,
}: {
  fotos: FotoPublicacion[];
  inicial: number;
  autor: string;
  alCerrar: () => void;
}) {
  const [i, setI] = useState(inicial);
  const cerrarRef = useRef<HTMLButtonElement>(null);
  const toqueX = useRef<number | null>(null);
  const n = fotos.length;
  const anterior = useCallback(() => setI((x) => Math.max(x - 1, 0)), []);
  const siguiente = useCallback(() => setI((x) => Math.min(x + 1, n - 1)), [n]);

  useEffect(() => {
    const previo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cerrarRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") alCerrar();
      else if (e.key === "ArrowLeft") anterior();
      else if (e.key === "ArrowRight") siguiente();
    };
    window.addEventListener("keydown", alTeclear);
    return () => {
      window.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = overflow;
      previo?.focus();
    };
  }, [alCerrar, anterior, siguiente]);

  const foto = fotos[i];
  const boton =
    "absolute p-2.5 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors focus-visible:outline-2 focus-visible:outline-white";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Fotos de ${autor}`}
      className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
      onClick={alCerrar}
      onTouchStart={(e) => {
        toqueX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const inicio = toqueX.current;
        const fin = e.changedTouches[0]?.clientX;
        toqueX.current = null;
        if (inicio == null || fin == null || Math.abs(fin - inicio) < 40) return;
        if (fin < inicio) siguiente();
        else anterior();
      }}
    >
      <img
        src={foto.url}
        alt={n > 1 ? `Foto ${i + 1} de ${n} de ${autor}` : `Foto de ${autor}`}
        className="max-w-full max-h-[100dvh] object-contain select-none"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        ref={cerrarRef}
        type="button"
        onClick={alCerrar}
        aria-label="Cerrar"
        className={`${boton} top-[max(1rem,env(safe-area-inset-top))] right-4`}
      >
        <X className="w-5 h-5" />
      </button>
      {n > 1 && (
        <>
          {i > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                anterior();
              }}
              aria-label="Foto anterior"
              className={`${boton} left-3 top-1/2 -translate-y-1/2`}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          {i < n - 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                siguiente();
              }}
              aria-label="Foto siguiente"
              className={`${boton} right-3 top-1/2 -translate-y-1/2`}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
          <p className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 font-mono text-xs text-white/80">
            {i + 1} / {n}
          </p>
        </>
      )}
    </div>,
    document.body,
  );
}
