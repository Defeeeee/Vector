"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { BookOpen, Download, FileSpreadsheet, Loader2, X } from "lucide-react";
import MenuAcciones, { type AccionDeMenu } from "@/components/MenuAcciones";
import { useAvisos } from "@/components/dashboard/Avisos";
import { horaUtc } from "@/lib/libro-anac";
import type { Aircraft, Flight, Logbook } from "@/types";

/**
 * Exportar la Bitácora: el libro de vuelo en PDF, con la hoja de siempre, o la planilla
 * en CSV.
 *
 * - **El PDF lo arma el server** (`/api/bitacora/libro-anac`): necesita los libros, las
 *   horas de apertura y los aviones, y es el mismo cálculo testeado de `lib/libro-anac.ts`.
 *   Se pide con `fetch` y no con un link para poder avisar si falla, en vez de bajar un
 *   JSON de error con nombre de PDF.
 * - **Un PDF por libro**: quien lleva más de uno elige cuál, porque la hoja arrastra los
 *   totales de un solo libro.
 * - **El CSV se arma acá**, con lo que la pantalla ya tiene.
 */
export default function ExportarBitacora({
  flights,
  aircraft,
  libros,
  alumno = false,
  variante = "boton",
}: {
  flights: Flight[];
  aircraft: Aircraft[];
  libros: Logbook[];
  /** El alumno piloto no lleva libro de vuelo: sólo la planilla. */
  alumno?: boolean;
  /** "chip": el del encabezado de la Bitácora en el teléfono (3.4.0), con texto y sin ícono. */
  variante?: "boton" | "chip";
}) {
  const [armando, setArmando] = useState(false);
  const [opciones, setOpciones] = useState(false);
  const { notificar } = useAvisos();

  const descargarLibro = async (libro: Logbook | undefined, o: OpcionesPdf) => {
    if (armando) return;
    setArmando(true);
    try {
      const q = new URLSearchParams({
        ...(libro ? { libro: libro.id } : {}),
        ...(o.firma ? { firma: "1" } : {}),
        ...(o.certificaciones ? { certificaciones: "1" } : {}),
        ...(o.dorsos ? { dorsos: "1" } : {}),
      }).toString();
      const res = await fetch(`/api/bitacora/libro-anac${q ? `?${q}` : ""}`);
      if (!res.ok) {
        const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null;
        notificar({ tipo: "error", titulo: cuerpo?.error ?? "No se pudo armar el libro." });
        return;
      }
      const nombre =
        /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "libro-de-vuelo.pdf";
      bajar(await res.blob(), nombre);
      setOpciones(false);
      notificar({
        tipo: "exito",
        titulo: "Libro descargado",
        detalle: o.dorsos ? "Con el dorso de cada hoja: imprimilo a doble faz." : o.firma || o.certificaciones ? "Con las firmas que pediste, listo para imprimir." : "Listo para imprimir y firmar.",
      });
    } catch {
      notificar({ tipo: "error", titulo: "Sin conexión: no se pudo armar el libro." });
    } finally {
      setArmando(false);
    }
  };

  const descargarCsv = () => {
    const aviones = new Map(aircraft.map((a) => [a.id, a]));
    const celda = (x: unknown) => {
      const s = String(x ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const encabezado = [
      "Fecha", "Matrícula", "Tipo", "Categoría", "Ruta", "Aterrizajes", "Duración", "Despegue", "Aterrizaje",
      "PIC_Dia_Loc", "PIC_Dia_Tra", "PIC_Noche_Loc", "PIC_Noche_Tra",
      "SIC_Dia_Loc", "SIC_Dia_Tra", "SIC_Noche_Loc", "SIC_Noche_Tra",
      "IMC_Pil", "IMC_Cop", "Capota", "Sim_Instructor", "Sim_Pil_Inst",
    ].join(",");
    const filas = flights.map((f) => {
      const a = f.aircraft_id ? aviones.get(f.aircraft_id) : undefined;
      const hora = (iso: string) => (horaUtc(iso) ? `${horaUtc(iso)}Z` : "");
      return [
        f.date, a?.registration ?? "N/A", a?.type ?? "N/A", a?.type_acft ?? "N/A", f.route, f.landings, f.duration,
        hora(f.takeoff), hora(f.landing),
        f.pic_day_loc || 0, f.pic_day_tra || 0, f.pic_night_loc || 0, f.pic_night_tra || 0,
        f.sic_day_loc || 0, f.sic_day_tra || 0, f.sic_night_loc || 0, f.sic_night_tra || 0,
        f.imc_pil || 0, f.imc_cop || 0, f.capota || 0, f.sim_instructor || 0, f.sim_pil_en_inst || 0,
      ].map(celda).join(",");
    });
    bajar(
      new Blob([[encabezado, ...filas].join("\n")], { type: "text/csv;charset=utf-8;" }),
      `vector-bitacora-${new Date().toISOString().slice(0, 10)}.csv`
    );
  };

  const acciones: AccionDeMenu[] = [
    ...(alumno ? [] : [{ etiqueta: "Libro de vuelo · PDF…", detalle: "La hoja del libro, con las firmas y el dorso que elijas", icono: BookOpen, alElegir: () => setOpciones(true) }]),
    ...(flights.length > 0
      ? [{ etiqueta: "Planilla · CSV", detalle: "Todos los vuelos, para Excel o Sheets", icono: FileSpreadsheet, alElegir: descargarCsv }]
      : []),
  ];

  const dialogo = opciones && !alumno ? <OpcionesLibro libros={libros} armando={armando} alCerrar={() => setOpciones(false)} alDescargar={descargarLibro} /> : null;

  if (variante === "chip") {
    return (
      <>
      <MenuAcciones
        acciones={acciones}
        etiqueta={armando ? "Armando el libro…" : "Exportar"}
        claseBoton="h-9 px-3 rounded-full bg-white dark:bg-white/5 border border-zinc-200 dark:border-white/10 flex items-center gap-1.5 text-[13px] font-bold text-zinc-900 dark:text-white"
      >
        {armando && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
        {armando ? "Armando…" : alumno ? "Planilla" : "Libro en PDF"}
      </MenuAcciones>
      {dialogo}
      </>
    );
  }

  return (
    <>
    <MenuAcciones
      acciones={acciones}
      etiqueta={armando ? "Armando el libro…" : "Exportar"}
      claseBoton="p-4 md:py-5 md:px-6 bg-white dark:bg-white/[0.05] text-zinc-900 dark:text-white border border-zinc-200 dark:border-white/10 rounded-xl shadow-sm dark:shadow-none hover:bg-zinc-50 dark:hover:bg-white/[0.1] transition-all flex items-center justify-center gap-3"
    >
      {armando ? (
        <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin" aria-hidden="true" />
      ) : (
        <Download className="w-4 h-4 md:w-5 md:h-5" aria-hidden="true" />
      )}
      <span className="hidden md:inline font-semibold text-sm">{armando ? "Armando…" : "Exportar"}</span>
    </MenuAcciones>
    {dialogo}
    </>
  );
}

interface OpcionesPdf {
  firma: boolean;
  certificaciones: boolean;
  dorsos: boolean;
}

/**
 * Las opciones del libro en PDF, juntas: qué firmas lleva. **Todo apagado por defecto**:
 * firmar es de quien firma, y el dorso sólo tiene sentido si se va a imprimir a doble faz.
 * Las firmas de los certificantes y el dorso se cargan en «Firmas del libro» (`/dashboard/history/firmas`).
 */
function OpcionesLibro({
  libros,
  armando,
  alCerrar,
  alDescargar,
}: {
  libros: Logbook[];
  armando: boolean;
  alCerrar: () => void;
  alDescargar: (libro: Logbook | undefined, o: OpcionesPdf) => Promise<void>;
}) {
  const [libroId, setLibroId] = useState(libros.find((l) => l.is_default)?.id ?? libros[0]?.id ?? "");
  const [o, setO] = useState<OpcionesPdf>({ firma: false, certificaciones: false, dorsos: false });
  const libro = libros.length > 1 ? libros.find((l) => l.id === libroId) : undefined;
  const fila = (clave: keyof OpcionesPdf, titulo: string, detalle: string) => (
    <label className="flex items-start gap-3 min-h-11 py-2 cursor-pointer">
      <input type="checkbox" checked={o[clave]} onChange={(e) => setO({ ...o, [clave]: e.target.checked })} className="w-5 h-5 mt-0.5 accent-[#2bd4ff] shrink-0" />
      <span>
        <span className="block text-sm font-semibold text-white">{titulo}</span>
        <span className="block text-xs text-zinc-400 mt-0.5">{detalle}</span>
      </span>
    </label>
  );

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" onClick={alCerrar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Libro de vuelo en PDF"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && alCerrar()}
        className="w-full sm:max-w-md bg-noche border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 space-y-4 max-h-[92dvh] overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Libro de vuelo en PDF</h2>
          <button onClick={alCerrar} aria-label="Cerrar" className="w-11 h-11 -mr-2 flex items-center justify-center text-zinc-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {libros.length > 1 && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400" htmlFor="pdf-libro">Libro</label>
            <select id="pdf-libro" value={libroId} onChange={(e) => setLibroId(e.target.value)} className="w-full min-h-12 rounded-2xl bg-transparent border border-white/10 px-4 text-white [color-scheme:dark]">
              {libros.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="divide-y divide-white/10 border-y border-white/10">
          {fila("firma", "Con mi firma de titular", "«Tu firma», la misma de tus planes de vuelo, en cada hoja.")}
          {fila("certificaciones", "Con las firmas de los certificantes", "En la celda de certificaciones de cada vuelo, con su aclaración, y las constancias (la foto del sello real) en el frente de su hoja. Un vuelo sin certificante o sin firma guardada queda en blanco.")}
          {fila("dorsos", "Con el dorso de cada hoja", "Una página después de cada hoja, para imprimir a doble faz. La hoja sin dorso cargado lleva el dorso en blanco.")}
        </div>

        <p className="text-xs text-zinc-400">
          Las firmas, los sellos y el dorso se cargan en <Link href="/dashboard/history/firmas" className="underline text-aviation-cyan" onClick={alCerrar}>Firmas del libro</Link>.
          Usá la de otra persona sólo con su autorización.
        </p>

        <button
          onClick={() => void alDescargar(libro, o)}
          disabled={armando}
          className="w-full min-h-12 rounded-full bg-aviation-cyan text-noche font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {armando ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Download className="w-4 h-4" aria-hidden="true" />}
          {armando ? "Armando el libro…" : "Descargar el PDF"}
        </button>
      </div>
    </div>,
    document.body
  );
}

function bajar(blob: Blob, nombre: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Diferido, como hace FileSaver: liberar el blob en el mismo tick puede cortar la
  // descarga en algunos navegadores. Sin liberarlo, queda vivo hasta recargar la pestaña.
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
