"use client";

import { useState } from "react";
import { BookOpen, Download, FileSpreadsheet, Loader2, PenLine } from "lucide-react";
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
}: {
  flights: Flight[];
  aircraft: Aircraft[];
  libros: Logbook[];
  /** El alumno piloto no lleva libro de vuelo: sólo la planilla. */
  alumno?: boolean;
}) {
  const [armando, setArmando] = useState(false);
  const { notificar } = useAvisos();

  const descargarLibro = async (libro?: Logbook, conFirma = false) => {
    if (armando) return;
    setArmando(true);
    try {
      const q = new URLSearchParams({ ...(libro ? { libro: libro.id } : {}), ...(conFirma ? { firma: "1" } : {}) }).toString();
      const res = await fetch(`/api/bitacora/libro-anac${q ? `?${q}` : ""}`);
      if (!res.ok) {
        const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null;
        notificar({ tipo: "error", titulo: cuerpo?.error ?? "No se pudo armar el libro." });
        return;
      }
      const nombre =
        /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "libro-de-vuelo.pdf";
      bajar(await res.blob(), nombre);
      notificar({ tipo: "exito", titulo: "Libro descargado", detalle: conFirma ? "Con tu firma en cada hoja, listo para imprimir." : "Listo para imprimir y firmar." });
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

  const detalleLibro = "La hoja del libro de vuelo, para imprimir y firmar";
  const detalleFirmado = "Con la firma que guardaste en el plan de vuelo, en cada hoja";
  const acciones: AccionDeMenu[] = [
    ...(alumno ? [] : libros.length > 1
      ? libros.flatMap((l) => [
          { etiqueta: `Libro «${l.name}» · PDF`, detalle: detalleLibro, icono: BookOpen, alElegir: () => void descargarLibro(l) },
          { etiqueta: `Libro «${l.name}» · PDF firmado`, detalle: detalleFirmado, icono: PenLine, alElegir: () => void descargarLibro(l, true) },
        ])
      : [
          { etiqueta: "Libro de vuelo · PDF", detalle: detalleLibro, icono: BookOpen, alElegir: () => void descargarLibro() },
          { etiqueta: "Libro de vuelo · PDF firmado", detalle: detalleFirmado, icono: PenLine, alElegir: () => void descargarLibro(undefined, true) },
        ]),
    ...(flights.length > 0
      ? [{ etiqueta: "Planilla · CSV", detalle: "Todos los vuelos, para Excel o Sheets", icono: FileSpreadsheet, alElegir: descargarCsv }]
      : []),
  ];

  return (
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
