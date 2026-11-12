"use client";

import { useEffect, useState } from "react";
import { decodificarMetar, explicarCategoria } from "@/lib/metar-simple";
import { duracion, horaArgentinaConDia } from "@/lib/seguimiento-calculos";
import type { ClimaDestino as Clima } from "@/lib/clima-destino";

/**
 * El clima en el destino, en palabras simples, con el METAR crudo abajo y de cuándo es. Lo pide a
 * `/api/seguimiento/clima/[token]` (que sólo contesta por el destino de este seguimiento) al abrir y cada
 * 5 minutos. Si no hay clima, lo dice: no es "buen tiempo" (invariante 2).
 */

const CADA_MS = 5 * 60_000;

export default function ClimaDestino({ token, ahora, activo }: { token: string; ahora: string; activo: boolean }) {
  const [clima, setClima] = useState<Clima | null | undefined>(undefined);

  useEffect(() => {
    let vivo = true;
    const pedir = async () => {
      try {
        const res = await fetch(`/api/seguimiento/clima/${encodeURIComponent(token)}`);
        if (!res.ok) throw new Error();
        const j = (await res.json()) as { clima: Clima | null };
        if (vivo) setClima(j.clima);
      } catch {
        // Un corte no borra el clima que ya se tenía.
        if (vivo) setClima((c) => (c === undefined ? null : c));
      }
    };
    void pedir();
    if (!activo) return () => { vivo = false; };
    const i = window.setInterval(() => void pedir(), CADA_MS);
    return () => {
      vivo = false;
      window.clearInterval(i);
    };
  }, [token, activo]);

  if (clima === undefined) return <p className="text-sm text-white/70">Buscando el clima del destino…</p>;
  if (clima === null) return <p className="text-sm text-white/70">No hay un informe meteorológico del destino para mostrar ahora.</p>;

  const dec = decodificarMetar(clima.crudo);
  const cat = explicarCategoria(clima.categoria);
  const edadS = clima.observadoEn ? (Date.parse(ahora) - Date.parse(clima.observadoEn)) / 1000 : null;
  const cuando = horaArgentinaConDia(clima.observadoEn, ahora);

  return (
    <div>
      {clima.estacion !== clima.destino && (
        <p className="mb-2 text-sm text-white/60">
          {clima.destino} no publica informe: se muestra el de {clima.estacion}
          {clima.distanciaNm !== null ? `, a unas ${Math.round(clima.distanciaNm)} NM` : ""}.
        </p>
      )}
      {cat && (
        <p className="text-base font-bold text-white">
          {cat.titulo}
          <span className="block text-sm font-normal text-white/75">{cat.detalle}</span>
        </p>
      )}
      <dl className="mt-3 space-y-2">
        {dec.lineas.map((l) => (
          <div key={l.rotulo} className="grid grid-cols-[6.5rem_1fr] gap-2 text-sm">
            <dt className="font-mono text-[11px] font-bold uppercase tracking-wider text-white/60 pt-0.5">{l.rotulo}</dt>
            <dd className="text-white">{l.texto}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 font-mono text-[11px] leading-relaxed text-white/60 break-words">{clima.crudo}</p>
      <p className="mt-1 text-xs text-white/60">
        {cuando ? `Informe de las ${cuando} (hora argentina)` : "Hora del informe desconocida"}
        {edadS !== null && edadS >= 60 ? `, hace ${duracion(edadS)}` : ""}.
        {edadS !== null && edadS > 3 * 3600 ? " Es un informe viejo." : ""}
      </p>
    </div>
  );
}
