"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Image as ImagenIcono, RotateCw } from "lucide-react";
import {
  ANCHO_MAX_DORSO,
  ANCHO_MAX_FIRMA,
  TOPE_CHARS_DORSO,
  TOPE_CHARS_FIRMA,
  limpiarFirma,
  reducir,
  rotar90,
  type ImagenRgba,
  type TintaFirma,
} from "@/lib/limpiar-firma";

/**
 * Sacarle una foto a una firma (o elegirla de la galería) y dejarla limpia: sin el papel,
 * sobre transparente. **Todo en el navegador** (`lib/limpiar-firma.ts`): la imagen original
 * no sale del teléfono; al padre sólo le llega el PNG ya limpio, y recién cuando el piloto
 * lo guarda se manda a su cuenta.
 *
 * - `modo="firma"`: la de la celda de certificaciones (un solo color de tinta por defecto, hasta 800 px).
 * - `modo="dorso"`: la firma con su sello o aclaración, que es otra imagen: arranca
 *   "conservando los colores" (el sello suele ser de tinta clara) y llega a 1200 px.
 */
export default function CapturaFirma({
  modo,
  alCambiar,
}: {
  modo: "firma" | "dorso";
  /** El PNG limpio como data URL, o `null` si todavía no hay (o no se encontró firma). */
  alCambiar: (png: string | null) => void;
}) {
  const dorso = modo === "dorso";
  const [crudo, setCrudo] = useState<ImagenRgba | null>(null);
  const [giros, setGiros] = useState(0);
  const [ajuste, setAjuste] = useState(0);
  const [colores, setColores] = useState(dorso);
  const [tinta, setTinta] = useState<TintaFirma>("azul");
  const [estado, setEstado] = useState<"vacio" | "leyendo" | "listo" | "sin-firma" | "error">("vacio");
  const lienzo = useRef<HTMLCanvasElement>(null);
  const cambiar = useRef(alCambiar);
  useEffect(() => {
    cambiar.current = alCambiar;
  });

  const elegir = useCallback(async (archivo: File | undefined) => {
    if (!archivo) return;
    setEstado("leyendo");
    try {
      // `createImageBitmap` ya respeta la orientación EXIF de la foto del teléfono.
      const bmp = await createImageBitmap(archivo);
      const esc = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(bmp.width * esc));
      c.height = Math.max(1, Math.round(bmp.height * esc));
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("sin canvas");
      ctx.drawImage(bmp, 0, 0, c.width, c.height);
      bmp.close?.();
      const d = ctx.getImageData(0, 0, c.width, c.height);
      setGiros(0);
      setCrudo({ width: d.width, height: d.height, data: d.data });
    } catch {
      setEstado("error");
      cambiar.current(null);
    }
  }, []);

  // Limpiar (con una pausa corta mientras se mueve el control).
  useEffect(() => {
    if (!crudo) return;
    setEstado("leyendo");
    const t = setTimeout(() => {
      const tope = dorso ? TOPE_CHARS_DORSO : TOPE_CHARS_FIRMA;
      let ancho = dorso ? ANCHO_MAX_DORSO : ANCHO_MAX_FIRMA;
      let img = limpiarFirma(rotar90(crudo, giros), { ajuste, conservarColores: colores, tinta, anchoMax: ancho });
      if (!img) {
        setEstado("sin-firma");
        cambiar.current(null);
        return;
      }
      const c = lienzo.current;
      if (!c) return;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      let url = "";
      // Si el PNG no entra en el tope del backend, se achica de a poco.
      for (let i = 0; i < 8; i++) {
        c.width = img.width;
        c.height = img.height;
        ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
        url = c.toDataURL("image/png");
        if (url.length <= tope) break;
        ancho = Math.round(ancho * 0.8);
        img = reducir(img, ancho);
      }
      if (url.length > tope) {
        setEstado("error");
        cambiar.current(null);
        return;
      }
      setEstado("listo");
      cambiar.current(url);
    }, 140);
    return () => clearTimeout(t);
  }, [crudo, giros, ajuste, colores, tinta, dorso]);

  const boton =
    "inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-full border border-zinc-200 dark:border-white/10 text-sm font-semibold text-zinc-900 dark:text-white hover:bg-white/[0.06] transition-colors";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <label className={`${boton} cursor-pointer`}>
          <Camera className="w-4 h-4" aria-hidden="true" />
          Sacar foto
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { void elegir(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <label className={`${boton} cursor-pointer`}>
          <ImagenIcono className="w-4 h-4" aria-hidden="true" />
          Elegir de la galería
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => { void elegir(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
      </div>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        {dorso
          ? "Fotografiá la firma con su sello o aclaración, sobre papel liso y con buena luz. La foto se limpia en tu teléfono: el sello conserva su color."
          : "Fotografiá la firma sobre papel liso y con buena luz. La foto se limpia en tu teléfono y no sale de ahí hasta que guardes."}
      </p>

      {crudo && (
        <div className="space-y-4">
          {/* El damero muestra qué quedó transparente. */}
          <div
            className="rounded-2xl border border-zinc-200 dark:border-white/10 overflow-hidden flex items-center justify-center min-h-28 p-3"
            style={{
              backgroundColor: "#d4d4d8",
              backgroundImage:
                "linear-gradient(45deg,#f4f4f5 25%,transparent 25%,transparent 75%,#f4f4f5 75%),linear-gradient(45deg,#f4f4f5 25%,transparent 25%,transparent 75%,#f4f4f5 75%)",
              backgroundSize: "16px 16px",
              backgroundPosition: "0 0,8px 8px",
            }}
          >
            <canvas ref={lienzo} aria-label="Vista previa de la firma limpia" className={`max-w-full max-h-64 h-auto w-auto ${estado === "listo" ? "" : "opacity-40"}`} />
          </div>
          {estado === "sin-firma" && (
            <p role="status" className="text-sm text-amber-600 dark:text-amber-400">
              No encontramos la firma en la foto. Probá con «Más trazo», con más luz o sobre un papel más liso.
            </p>
          )}
          {estado === "error" && (
            <p role="alert" className="text-sm text-red-500">No se pudo leer o achicar esa imagen. Probá con otra foto.</p>
          )}

          <div className="space-y-2">
            <label className="flex items-center justify-between text-xs font-medium text-zinc-500 dark:text-zinc-400" htmlFor={`trazo-${modo}`}>
              <span>Menos trazo</span>
              <span>Más trazo</span>
            </label>
            <input
              id={`trazo-${modo}`}
              type="range"
              min={-1}
              max={1}
              step={0.05}
              value={ajuste}
              onChange={(e) => setAjuste(Number(e.target.value))}
              className="w-full accent-[#2bd4ff] h-8"
              aria-label="Cuánto trazo se conserva"
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <label className="flex items-center gap-2 text-sm text-zinc-900 dark:text-white min-h-11">
              <input type="checkbox" checked={colores} onChange={(e) => setColores(e.target.checked)} className="w-5 h-5 accent-[#2bd4ff]" />
              Conservar los colores (sello)
            </label>
            {!colores && (
              <div className="flex items-center gap-2" role="group" aria-label="Color de la tinta">
                {(["azul", "negro"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTinta(t)}
                    aria-pressed={tinta === t}
                    className={`min-h-11 px-4 rounded-full text-sm font-semibold border transition-colors ${
                      tinta === t ? "bg-aviation-cyan text-noche border-transparent" : "border-zinc-200 dark:border-white/10 text-zinc-900 dark:text-white"
                    }`}
                  >
                    Tinta {t}
                  </button>
                ))}
              </div>
            )}
            <button type="button" onClick={() => setGiros((g) => (g + 1) % 4)} className={boton}>
              <RotateCw className="w-4 h-4" aria-hidden="true" />
              Girar
            </button>
          </div>
        </div>
      )}
      {estado === "leyendo" && !crudo && <p className="text-sm text-zinc-500">Leyendo la foto…</p>}
    </div>
  );
}
