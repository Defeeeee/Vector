"use client";

import { useState, useTransition } from "react";
import { agregarConstancia, quitarConstancia } from "@/actions/firmas";
import { useAvisos } from "@/components/dashboard/Avisos";
import CapturaFirma from "@/components/dashboard/CapturaFirma";
import { fechaDelDorso, type ConstanciaVuelo } from "@/lib/firmas-libro";
import type { Flight } from "@/types";
import { campo, Miniatura, peligro, principal, rotulo, subtitulo, unaFila } from "./comun";

/**
 * Constancias en el frente (migración 051): la foto del sello que una autoridad estampó en el
 * frente de la hoja (el de ANAC en un examen), por vuelo. **Es la foto del sello real**: Vector no
 * dibuja sellos. Sale en el PDF «Con las firmas de los certificantes».
 */
export default function Constancias({ constancias, vuelos }: { constancias: ConstanciaVuelo[]; vuelos: Flight[] }) {
  // Los exámenes primero (donde suele haber un sello de la autoridad), después los más nuevos.
  const ordenados = [...vuelos].sort((a, b) => Number(b.purpose === "EXA") - Number(a.purpose === "EXA") || b.date.localeCompare(a.date));
  const [agregando, setAgregando] = useState(constancias.length === 0);
  const [vueloId, setVueloId] = useState(ordenados[0]?.id ?? "");
  const [nueva, setNueva] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const { notificar } = useAvisos();
  const nombre = (id: string) => {
    const v = vuelos.find((x) => x.id === id);
    return v ? [fechaDelDorso(v.date), v.route, v.purpose].filter(Boolean).join(" · ") : "Vuelo borrado";
  };
  if (!vuelos.length) return <p className="text-sm text-zinc-500">Cuando tengas vuelos cargados, vas a poder sumarles constancias.</p>;

  const agregar = () =>
    empezar(async () => {
      if (!nueva || !vueloId) return;
      setError(null);
      const r = await agregarConstancia({ vueloId, png: nueva });
      if ("error" in r) return setError(r.error);
      setNueva(null);
      setIntento((n) => n + 1);
      setAgregando(false);
      notificar({ tipo: "exito", titulo: "Constancia guardada" });
    });
  const quitar = (id: string) =>
    empezar(async () => {
      const r = await quitarConstancia(id);
      if ("error" in r) setError(r.error);
    });

  return (
    <div className="space-y-5">
      {constancias.length > 0 && (
        <ul className={unaFila}>
          {constancias.map((c) => (
            <li key={c.id} className="py-3 flex items-center gap-3">
              <Miniatura png={c.png} alto="h-12" />
              <span className="flex-1 min-w-0 text-sm text-zinc-900 dark:text-white truncate">{nombre(c.flight_id)}</span>
              <button type="button" onClick={() => quitar(c.id)} disabled={pendiente} className={peligro}>
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
      {!agregando ? (
        <button type="button" onClick={() => setAgregando(true)} className={principal}>
          Agregar una constancia
        </button>
      ) : (
        <div className="space-y-4">
          {constancias.length > 0 && <p className={subtitulo}>Nueva constancia</p>}
          <div className="space-y-1.5 max-w-md">
            <label className={rotulo} htmlFor="constancia-vuelo">Vuelo</label>
            <select id="constancia-vuelo" value={vueloId} onChange={(e) => setVueloId(e.target.value)} className={campo}>
              {ordenados.map((v) => (
                <option key={v.id} value={v.id}>{nombre(v.id)}</option>
              ))}
            </select>
          </div>
          <CapturaFirma key={intento} modo="dorso" alCambiar={setNueva} />
          {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
          <div className="flex flex-wrap gap-3">
            {nueva && (
              <button type="button" onClick={agregar} disabled={pendiente || !vueloId} className={principal}>
                {pendiente ? "Guardando…" : "Agregar al vuelo"}
              </button>
            )}
            {constancias.length > 0 && (
              <button type="button" onClick={() => setAgregando(false)} className="min-h-12 px-5 text-sm font-semibold text-zinc-500 dark:text-zinc-400">
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
