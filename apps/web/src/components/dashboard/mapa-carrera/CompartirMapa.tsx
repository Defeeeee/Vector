"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, Share2 } from "lucide-react";
import { compartirImagen } from "@/components/dashboard/compartir-imagen";
import { ESQUEMAS, ORDEN_ESQUEMAS, type EsquemaId } from "@/lib/tu-ano-esquemas";

type Formato = "post" | "historia";
const FORMATOS: { id: Formato; nombre: string; proporcion: string }[] = [
  { id: "post", nombre: "Post · 1080 × 1350", proporcion: "aspect-[4/5]" },
  { id: "historia", nombre: "Historia · 1080 × 1920", proporcion: "aspect-[9/16]" },
];

/**
 * "Compartir como imagen": la miniatura **es la imagen final** (el mismo endpoint) y los números
 * los calcula el server a partir de la sesión: acá sólo viajan los filtros, el formato y el
 * nombre del esquema (invariante 10).
 */
export default function CompartirMapa({ anio, avionId }: { anio: number | null; avionId: string | null }) {
  const [esquema, setEsquema] = useState<EsquemaId>("noche");
  const [formato, setFormato] = useState<Formato>("post");
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState(false);
  const [puedeCompartir, setPuedeCompartir] = useState(false);
  const [compartiendo, setCompartiendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const q = new URLSearchParams();
  if (anio !== null) q.set("anio", String(anio));
  if (avionId !== null) q.set("avion", avionId);
  q.set("esquema", esquema);
  q.set("formato", formato);
  const src = `/api/mapa-carrera/imagen?${q.toString()}`;
  const nombreArchivo = `vector-mapa${anio !== null ? `-${anio}` : ""}-${formato}.png`;

  useEffect(() => {
    try {
      const prueba = new File([new Blob([""])], "vector.png", { type: "image/png" });
      setPuedeCompartir(typeof navigator.canShare === "function" && navigator.canShare({ files: [prueba] }));
    } catch {
      setPuedeCompartir(false);
    }
  }, []);

  // Cambiar de imagen vuelve a mostrar «Generando…».
  useEffect(() => {
    setCargando(true);
    setFallo(false);
  }, [src]);

  async function compartir() {
    setAviso(null);
    setCompartiendo(true);
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error("No se pudo generar la imagen");
      await compartirImagen(await res.blob(), nombreArchivo);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "No se pudo generar la imagen");
    } finally {
      setCompartiendo(false);
    }
  }

  const principal = "inline-flex items-center justify-center gap-2 min-h-12 px-7 rounded-full bg-aviation-cyan text-noche font-bold text-[15px] disabled:opacity-50";
  const secundario = "inline-flex items-center justify-center gap-2 min-h-12 px-6 rounded-full border border-white/25 text-white font-semibold text-[15px]";
  const proporcion = FORMATOS.find((f) => f.id === formato)!.proporcion;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,360px)_1fr] items-start">
      <div className={`relative w-full max-w-[360px] ${proporcion} rounded-2xl overflow-hidden bg-white/5 ring-1 ring-white/15`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={src}
          src={src}
          alt={`Vista previa de la imagen de tu mapa, esquema ${ESQUEMAS[esquema].nombre}`}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${cargando || fallo ? "opacity-0" : "opacity-100"}`}
          onLoad={() => setCargando(false)}
          onError={() => {
            setCargando(false);
            setFallo(true);
          }}
        />
        {cargando && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/70">
            <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
            <span className="font-mono text-[11px] uppercase tracking-[0.14em]">Generando…</span>
          </div>
        )}
        {fallo && <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-white/70">No se pudo generar la imagen. Probá de nuevo en un rato.</div>}
      </div>

      <div className="space-y-6">
        <div role="radiogroup" aria-label="Formato" className="flex flex-wrap gap-2">
          {FORMATOS.map((f) => (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={f.id === formato}
              onClick={() => setFormato(f.id)}
              className={`inline-flex items-center min-h-11 px-4 rounded-full font-mono text-[13px] font-semibold border ${f.id === formato ? "bg-aviation-cyan text-noche border-aviation-cyan" : "border-white/15 text-zinc-400"}`}
            >
              {f.nombre}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Esquema de color">
          {ORDEN_ESQUEMAS.map((id) => {
            const e = ESQUEMAS[id];
            const activo = id === esquema;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={activo}
                onClick={() => setEsquema(id)}
                className={`inline-flex items-center justify-center gap-2 min-h-11 pl-2 pr-3.5 rounded-full text-[13px] font-semibold border transition-colors ${activo ? "text-white bg-white/10 border-aviation-cyan" : "border-white/15 text-white/70"}`}
              >
                <span aria-hidden="true" className="w-6 h-6 rounded-full ring-1 ring-white/30" style={{ background: `linear-gradient(135deg, ${e.fondo}, ${e.acento})` }} />
                {e.nombre}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2.5">
          {puedeCompartir ? (
            <>
              <button type="button" onClick={compartir} disabled={compartiendo || fallo} className={principal}>
                {compartiendo ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Share2 className="w-4 h-4" aria-hidden="true" />}
                Compartir
              </button>
              <a href={src} download={nombreArchivo} className={secundario}>
                <Download className="w-4 h-4" aria-hidden="true" /> Descargar
              </a>
            </>
          ) : (
            <a href={src} download={nombreArchivo} className={principal}>
              <Download className="w-4 h-4" aria-hidden="true" /> Descargar
            </a>
          )}
        </div>
        {aviso && <p role="status" className="text-sm text-red-300">{aviso}</p>}
        <p className="text-sm text-zinc-500">La imagen lleva tus cifras, el mapa y las matrículas de tus aviones más volados; no lleva tu nombre.</p>
      </div>
    </div>
  );
}
