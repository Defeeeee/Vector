"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, Share2 } from "lucide-react";
import { compartirImagen } from "@/components/dashboard/compartir-imagen";
import { ESQUEMAS, ORDEN_ESQUEMAS, type EsquemaId } from "@/lib/tu-ano-esquemas";

/**
 * La última historia: la imagen tamaño historia de Instagram (1080 × 1920), con sus cuatro
 * esquemas. La miniatura **es la imagen final** (el mismo endpoint), y los números los calcula
 * el server a partir de la sesión: acá sólo viajan el año y el nombre del esquema.
 */
export default function ExportarImagen({ anio, acento }: { anio: number; acento: string }) {
  const [esquema, setEsquema] = useState<EsquemaId>("noche");
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState(false);
  const [puedeCompartir, setPuedeCompartir] = useState(false);
  const [compartiendo, setCompartiendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const src = `/api/tu-ano/imagen?anio=${anio}&esquema=${esquema}`;

  useEffect(() => {
    try {
      const prueba = new File([new Blob([""])], "vector.png", { type: "image/png" });
      setPuedeCompartir(typeof navigator.canShare === "function" && navigator.canShare({ files: [prueba] }));
    } catch {
      setPuedeCompartir(false);
    }
  }, []);

  function elegir(id: EsquemaId) {
    if (id === esquema) return;
    setCargando(true);
    setFallo(false);
    setEsquema(id);
  }

  async function compartir() {
    setAviso(null);
    setCompartiendo(true);
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error("No se pudo generar la imagen");
      await compartirImagen(await res.blob(), `vector-${anio}.png`);
    } catch (e) {
      setAviso(e instanceof Error ? e.message : "No se pudo generar la imagen");
    } finally {
      setCompartiendo(false);
    }
  }

  const principal =
    "inline-flex items-center justify-center gap-2 min-h-12 px-7 rounded-full bg-aviation-cyan text-noche font-bold text-[15px] disabled:opacity-50";
  const secundario =
    "inline-flex items-center justify-center gap-2 min-h-12 px-6 rounded-full border border-white/25 text-white font-semibold text-[15px]";

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-[3.2cqw]" data-no-tap>
      {/* La miniatura, en 9:16, con lo que alcance de alto. */}
      <div className="relative flex-1 min-h-0 flex items-center justify-center">
        <div className="relative h-full aspect-[9/16] max-w-full rounded-2xl overflow-hidden bg-white/5 ring-1 ring-white/15">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={src}
            src={src}
            alt={`Vista previa de la imagen «Mi ${anio} en vuelo», esquema ${ESQUEMAS[esquema].nombre}`}
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
          {fallo && (
            <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-white/70">
              No se pudo generar la imagen. Probá de nuevo en un rato.
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Esquema de color">
        {ORDEN_ESQUEMAS.map((id) => {
          const e = ESQUEMAS[id];
          const activo = id === esquema;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={activo}
              onClick={() => elegir(id)}
              className={`inline-flex items-center justify-center gap-2 min-h-11 pl-2 pr-3.5 rounded-full text-[13px] font-semibold border transition-colors ${
                activo ? "text-white bg-white/10" : "border-white/15 text-white/70"
              }`}
              style={activo ? { borderColor: acento } : undefined}
            >
              <span aria-hidden="true" className="w-6 h-6 rounded-full ring-1 ring-white/30" style={{ background: `linear-gradient(135deg, ${e.fondo}, ${e.acento})` }} />
              {e.nombre}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap justify-center gap-2.5">
        {puedeCompartir ? (
          <>
            <button type="button" onClick={compartir} disabled={compartiendo || fallo} className={principal}>
              {compartiendo ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Share2 className="w-4 h-4" aria-hidden="true" />}
              Compartir
            </button>
            <a href={src} download={`vector-${anio}.png`} className={secundario}>
              <Download className="w-4 h-4" aria-hidden="true" /> Descargar
            </a>
          </>
        ) : (
          <a href={src} download={`vector-${anio}.png`} className={principal}>
            <Download className="w-4 h-4" aria-hidden="true" /> Descargar
          </a>
        )}
      </div>
      {aviso && <p role="status" className="text-center text-sm text-red-300">{aviso}</p>}
    </div>
  );
}
