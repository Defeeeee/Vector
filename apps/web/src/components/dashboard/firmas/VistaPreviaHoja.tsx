"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Loader2 } from "lucide-react";
import { campo, rotulo } from "./comun";

/** El evento con que el editor de un dorso pide ver su hoja acá («Ver cómo queda»). */
export const VER_HOJA = "vector:ver-hoja";
export function verHoja(libroId: string, hoja: number) {
  window.dispatchEvent(new CustomEvent(VER_HOJA, { detail: { libroId, hoja } }));
}

/**
 * La vista previa de una hoja del libro (3.38.0): el frente y el dorso **tal como salen en el
 * PDF**, con todas las firmas que haya. No es un dibujo aparte: es el mismo PDF que se baja
 * (`/api/bitacora/libro-anac?vista=1&hoja=N`), recortado a esa hoja y dibujado con pdf.js, que
 * se carga sólo en esta pantalla. Así lo que se ve es lo que se imprime, y no hay dos maquetas
 * de la hoja que se desfasen.
 *
 * `version` cambia cuando el server vuelve a dibujar la pantalla con datos nuevos (se guardó una
 * firma, un sello, un dorso): entonces se vuelve a pedir.
 */
export default function VistaPreviaHoja({
  libros,
  hojasPorLibro,
  version,
}: {
  libros: { id: string; name: string }[];
  hojasPorLibro: Record<string, number>;
  version: string;
}) {
  const [libroId, setLibroId] = useState(libros[0]?.id ?? "");
  const total = hojasPorLibro[libroId] ?? 1;
  // La hoja que se está llenando, la última, es la que más se quiere ver.
  const [hoja, setHoja] = useState(total);
  const [estado, setEstado] = useState<"cargando" | "listo" | "error">("cargando");
  const [error, setError] = useState<string | null>(null);
  const frente = useRef<HTMLCanvasElement>(null);
  const dorso = useRef<HTMLCanvasElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const cola = useRef<Promise<void>>(Promise.resolve());
  const url = `/api/bitacora/libro-anac?vista=1&hoja=${hoja}${libros.length > 1 ? `&libro=${encodeURIComponent(libroId)}` : ""}`;

  // «Ver cómo queda» desde el editor de un dorso.
  useEffect(() => {
    const ver = (e: Event) => {
      const { libroId: l, hoja: h } = (e as CustomEvent<{ libroId: string; hoja: number }>).detail;
      setLibroId(l);
      setHoja(h);
      caja.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener(VER_HOJA, ver);
    return () => window.removeEventListener(VER_HOJA, ver);
  }, []);

  useEffect(() => {
    let cancelado = false;
    let tarea: { destroy: () => Promise<void> } | null = null;
    let dibujo: { cancel: () => void } | null = null;
    const trabajo = async () => {
      if (cancelado) return;
      setEstado("cargando");
      setError(null);
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(cuerpo?.error ?? "No se pudo armar la hoja.");
        }
        const datos = new Uint8Array(await res.arrayBuffer());
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        if (cancelado) return;
        const carga = pdfjs.getDocument({ data: datos });
        tarea = carga;
        const doc = await carga.promise;
        const lienzos = [frente.current, dorso.current];
        for (let i = 0; i < lienzos.length; i++) {
          const lienzo = lienzos[i];
          if (cancelado) return;
          if (!lienzo) continue;
          if (i >= doc.numPages) {
            lienzo.width = 0;
            lienzo.height = 0;
            continue;
          }
          const pagina = await doc.getPage(i + 1);
          const base = pagina.getViewport({ scale: 1 });
          // Al ancho de la caja, con la densidad de la pantalla (con tope, para no pesar de más).
          const ancho = Math.min(2600, (caja.current?.clientWidth ?? 800) * Math.min(2, window.devicePixelRatio || 1));
          const vista = pagina.getViewport({ scale: ancho / base.width });
          lienzo.width = Math.round(vista.width);
          lienzo.height = Math.round(vista.height);
          const ctx = lienzo.getContext("2d");
          if (!ctx) throw new Error("Tu navegador no puede dibujar la hoja.");
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, lienzo.width, lienzo.height);
          // `print`: sin requestAnimationFrame. Con "display", pdf.js dibuja de a cuadros y una
          // pestaña en segundo plano no avanza nunca; esta hoja no tiene nada interactivo.
          const render = pagina.render({ canvas: lienzo, canvasContext: ctx, viewport: vista, intent: "print" });
          dibujo = render;
          await render.promise;
          dibujo = null;
        }
        if (!cancelado) setEstado("listo");
      } catch (e) {
        if (cancelado) return;
        setError(e instanceof Error ? e.message : "No se pudo armar la hoja.");
        setEstado("error");
      } finally {
        // Libera el worker y la memoria del documento.
        await tarea?.destroy().catch(() => {});
      }
    };
    // Un dibujo por vez: el siguiente espera a que el anterior termine (o se cancele), así dos
    // nunca pisan el mismo lienzo si se cambia de hoja a mitad de camino.
    const turno = cola.current.then(trabajo);
    cola.current = turno.catch(() => {});
    return () => {
      cancelado = true;
      dibujo?.cancel();
    };
  }, [url, version]);

  const ir = (h: number) => setHoja(Math.min(total, Math.max(1, h)));

  return (
    <div ref={caja} className="space-y-4 scroll-mt-24">
      <div className="flex flex-wrap items-end gap-3">
        {libros.length > 1 && (
          <div className="space-y-1.5">
            <label className={rotulo} htmlFor="vista-libro">Libro</label>
            <select
              id="vista-libro"
              value={libroId}
              onChange={(e) => {
                setLibroId(e.target.value);
                setHoja(hojasPorLibro[e.target.value] ?? 1);
              }}
              className={campo}
            >
              {libros.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => ir(hoja - 1)} disabled={hoja <= 1} aria-label="Hoja anterior" className="w-11 h-11 grid place-items-center rounded-full border border-white/10 text-zinc-900 dark:text-white disabled:opacity-30">
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          <label className="font-mono text-xs tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
            HOJA
            <select value={hoja} onChange={(e) => ir(Number(e.target.value))} aria-label="Hoja" className="h-11 rounded-xl bg-white/5 border border-white/10 px-2 text-sm text-zinc-900 dark:text-white [color-scheme:dark]">
              {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            DE {total}
          </label>
          <button type="button" onClick={() => ir(hoja + 1)} disabled={hoja >= total} aria-label="Hoja siguiente" className="w-11 h-11 grid place-items-center rounded-full border border-white/10 text-zinc-900 dark:text-white disabled:opacity-30">
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <a href={url} target="_blank" rel="noopener" className="ml-auto inline-flex items-center gap-1.5 min-h-11 text-sm font-semibold text-aviation-cyan">
          Abrir en grande <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
        </a>
      </div>

      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      <div className={`relative space-y-4 ${estado === "error" ? "hidden" : ""}`}>
        {estado === "cargando" && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-noche/40">
            <Loader2 className="w-6 h-6 animate-spin text-aviation-cyan" aria-label="Armando la hoja" />
          </div>
        )}
        <figure className="space-y-1.5">
          <figcaption className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500">Frente</figcaption>
          <canvas ref={frente} className="w-full h-auto rounded-lg bg-white min-h-24" />
        </figure>
        <figure className="space-y-1.5">
          <figcaption className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500">Dorso</figcaption>
          <canvas ref={dorso} className="w-full h-auto rounded-lg bg-white min-h-24" />
        </figure>
      </div>
    </div>
  );
}
