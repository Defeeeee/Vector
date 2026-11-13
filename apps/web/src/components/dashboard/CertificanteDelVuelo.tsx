"use client";

import { useState } from "react";
import { opcionesDeCertificante, valorDeOpcion, type CertificanteBreve } from "@/lib/firmas-libro";

/**
 * "Certificó" y "Firma en el PDF" de un vuelo (migración 048): quién firmó el vuelo en el libro
 * y si su firma se pone sola, siempre o nunca en la celda de ese vuelo. Los dos campos viajan con
 * el formulario (`certificante_id`, `certificante_firma`); sin personas guardadas no se muestra
 * nada, salvo que el vuelo ya tenga una (que se pueda desasociar).
 *
 * Elegir a alguien **no cambia el nombre para el CAD**: si el vuelo no tiene, el servidor lo
 * completa con el de la persona; si ya dice otro, lo deja.
 */
export default function CertificanteDelVuelo({
  certificantes,
  certificanteId,
  selloId,
  autoridadId,
  firma,
  variante,
}: {
  certificantes: CertificanteBreve[];
  certificanteId?: string | null;
  /** Con qué sello/cargo lo certificó (migración 049). */
  selloId?: string | null;
  /** El cargo del CAD del vuelo: elige por defecto el sello que coincide. */
  autoridadId?: number | null;
  firma?: "si" | "no" | null;
  /** `tarjeta`: la edición del vuelo en la Bitácora; `formulario`: Registrar vuelo. */
  variante: "tarjeta" | "formulario";
}) {
  // Una opción por persona, o por sello si la persona tiene varios: `persona|sello`.
  const [opcion, setOpcion] = useState(valorDeOpcion(certificantes, certificanteId, selloId, autoridadId));
  const [id, selloElegido] = opcion.split("|");
  const [anula, setAnula] = useState(firma ?? "");
  if (!certificantes.length && !certificanteId) return null;

  const clase =
    variante === "tarjeta"
      ? "w-full bg-transparent border-b border-zinc-300 dark:border-zinc-700 py-2 text-sm md:text-base text-zinc-900 dark:text-white outline-none focus:border-zinc-900 dark:focus:border-white transition-all font-bold"
      : "w-full bg-transparent border border-zinc-200 dark:border-white/10 rounded-2xl py-3 px-4 min-h-12 text-zinc-900 dark:text-white outline-none focus:border-zinc-900 dark:focus:border-aviation-cyan/50 [color-scheme:dark]";
  const rotulo = `text-xs font-medium text-zinc-500 dark:text-zinc-400 ${variante === "formulario" ? "ml-1" : ""}`;
  const persona = certificantes.find((c) => c.id === id);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 sm:col-span-2 md:col-span-2">
      <div className="space-y-2">
        <label className={rotulo} htmlFor={`certifico-${variante}`}>Certificó</label>
        <select
          id={`certifico-${variante}`}
          value={opcion}
          onChange={(e) => {
            setOpcion(e.target.value);
            if (!e.target.value) setAnula("");
          }}
          className={clase}
        >
          <option value="" className="dark:bg-zinc-900">Nadie asignado</option>
          {opcionesDeCertificante(certificantes).map((o) => (
            <option key={o.valor} value={o.valor} className="dark:bg-zinc-900">{o.texto}</option>
          ))}
        </select>
        <input type="hidden" name="certificante_id" value={id ?? ""} />
        <input type="hidden" name="certificante_sello_id" value={selloElegido ?? ""} />
      </div>
      <div className="space-y-2">
        <label className={rotulo} htmlFor={`firma-pdf-${variante}`}>Firma en el PDF</label>
        <select
          id={`firma-pdf-${variante}`}
          name="certificante_firma"
          value={id ? anula : ""}
          disabled={!id}
          onChange={(e) => setAnula(e.target.value as "" | "si" | "no")}
          className={`${clase} disabled:opacity-40`}
        >
          <option value="" className="dark:bg-zinc-900">
            {persona?.automatica === false ? "Automática (esta persona no se pone sola)" : "Automática"}
          </option>
          <option value="si" className="dark:bg-zinc-900">Sí, en este vuelo</option>
          <option value="no" className="dark:bg-zinc-900">No, sin firma</option>
        </select>
      </div>
    </div>
  );
}
