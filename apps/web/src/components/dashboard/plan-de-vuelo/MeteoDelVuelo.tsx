"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CloudSun, Loader2 } from "lucide-react";

/**
 * METAR, TAF y NOTAM de los aeródromos del plan, a la hora del vuelo
 * (`/api/plan-de-vuelo/meteo`, `lib/meteo-plan.ts`).
 *
 * Todo lo que se muestra viene escrito del server (invariante 1). Los NOTAM que no caen en
 * tu horario y los permanentes no se esconden: van plegados, porque un horario mal leído
 * no puede hacer desaparecer un NOTAM.
 */

interface Notam {
  codigo: string;
  texto: string;
  vigencia: string;
}

interface Aerodromo {
  rol: string;
  codigo: string;
  hora: string;
  metar: { estacion: string; distanciaNm: number | null; texto: string; hace: string | null; viejo: boolean } | null;
  taf: { estacion: string; distanciaNm: number | null; lineas: string[] | null; aviso: string | null } | null;
  notams: { afectan: Notam[]; revisar: Notam[]; noEnTuHorario: Notam[]; permanentes: Notam[] } | null;
}

interface Respuesta {
  ventana: string;
  aerodromos: Aerodromo[];
}

const de = (estacion: string, codigo: string, nm: number | null) => (estacion !== codigo ? ` de ${estacion}${nm ? `, a ${nm} NM` : ""}` : "");

export default function MeteoDelVuelo({
  aerodromos,
  salidaIso,
  llegadaIso,
}: {
  aerodromos: { rol: "salida" | "destino" | "alternativa"; codigo: string }[];
  salidaIso: string;
  llegadaIso: string;
}) {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [estado, setEstado] = useState<"cargando" | "listo" | "error">("cargando");
  const clave = `${aerodromos.map((a) => `${a.rol}:${a.codigo}`).join(",")}|${salidaIso}|${llegadaIso}`;

  useEffect(() => {
    const control = new AbortController();
    // Se espera un poco: mientras el piloto escribe la hora, no se pide en cada tecla.
    const t = setTimeout(async () => {
      setEstado("cargando");
      const q = new URLSearchParams({ salida: salidaIso, llegada: llegadaIso });
      for (const a of aerodromos) q.append("ad", `${a.rol}:${a.codigo}`);
      try {
        const r = await fetch(`/api/plan-de-vuelo/meteo?${q.toString()}`, { signal: control.signal });
        if (!r.ok) throw new Error(String(r.status));
        setDatos(await r.json());
        setEstado("listo");
      } catch {
        if (!control.signal.aborted) setEstado("error");
      }
    }, 700);
    return () => {
      clearTimeout(t);
      control.abort();
    };
    // `clave` resume las tres props: los arrays nuevos en cada render no disparan otro pedido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  if (estado === "error") {
    return <p className="text-xs text-zinc-500 dark:text-zinc-400">No pudimos leer la meteo ni los NOTAM. Probá de nuevo en un rato.</p>;
  }
  if (!datos) {
    return (
      <p className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando METAR, TAF y NOTAM…
      </p>
    );
  }

  return (
    <div className={`space-y-4 transition-opacity ${estado === "cargando" ? "opacity-60" : ""}`}>
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
        Los NOTAM se cruzan con tu ventana, <span className="data">{datos.ventana}</span>: una hora antes de la salida y una
        después de la llegada. Es una ayuda: el briefing sigue siendo tuyo.
      </p>
      {datos.aerodromos.map((a) => (
        <div key={`${a.rol}-${a.codigo}`} className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-4 space-y-3">
          <p className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              {a.rol} · <span className="data text-zinc-900 dark:text-white text-xs">{a.codigo}</span>
            </span>
            <span className="data text-[11px] text-zinc-500 dark:text-zinc-400">{a.hora}</span>
          </p>

          <div className="space-y-1">
            <p className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
              METAR ahora
              {a.metar && (
                <span className={`font-normal ${a.metar.viejo ? "text-amber-700 dark:text-amber-400" : "text-zinc-500 dark:text-zinc-400"}`}>
                  {de(a.metar.estacion, a.codigo, a.metar.distanciaNm)}
                  {a.metar.hace ? ` · ${a.metar.hace}` : " · sin hora de observación"}
                </span>
              )}
            </p>
            {a.metar ? (
              <p className="data text-[11px] leading-relaxed text-zinc-800 dark:text-zinc-200 break-words">{a.metar.texto}</p>
            ) : (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Sin METAR en {a.codigo} ni a menos de 60 NM.</p>
            )}
          </div>

          <div className="space-y-1">
            <p className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
              TAF a las <span className="data">{a.hora.slice(-5)}</span>
              {a.taf && <span className="font-normal text-zinc-500 dark:text-zinc-400">{de(a.taf.estacion, a.codigo, a.taf.distanciaNm)}</span>}
            </p>
            {a.taf?.lineas ? (
              <ul className="space-y-0.5">
                {a.taf.lineas.map((l, i) => (
                  <li key={i} className="data text-[11px] leading-relaxed text-zinc-800 dark:text-zinc-200 break-words">
                    {l}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{a.taf?.aviso ?? `Sin TAF en ${a.codigo} ni a menos de 60 NM.`}</p>
            )}
          </div>

          <Notams n={a.notams} />
        </div>
      ))}
    </div>
  );
}

function Notams({ n }: { n: Aerodromo["notams"] }) {
  if (!n) return <p className="text-[11px] text-amber-700 dark:text-amber-400">No pudimos leer los NOTAM de ANAC: revisalos antes de salir.</p>;
  const importantes = [...n.afectan.map((x) => ({ ...x, revisar: false })), ...n.revisar.map((x) => ({ ...x, revisar: true }))];
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">NOTAM</p>
      {importantes.length === 0 ? (
        <p className="flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-400">
          <CloudSun className="w-3.5 h-3.5" /> Ninguno en tu horario.
        </p>
      ) : (
        <ul className="space-y-2">
          {importantes.map((x) => (
            <li key={x.codigo} className="rounded-xl bg-amber-50 dark:bg-amber-500/10 px-3 py-2 space-y-0.5">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span className="data">{x.codigo}</span>
                <span className="font-normal">· {x.revisar ? "revisá su horario" : "en tu horario"}</span>
              </p>
              <p className="text-[11px] leading-relaxed text-zinc-800 dark:text-zinc-200">{x.texto}</p>
              <p className="data text-[10px] text-zinc-500 dark:text-zinc-400">{x.vigencia}</p>
            </li>
          ))}
        </ul>
      )}
      <Plegados titulo="vigentes, pero no en tu horario" lista={n.noEnTuHorario} />
      <Plegados titulo="permanentes (obstáculos, cambios al AIP)" lista={n.permanentes} />
    </div>
  );
}

function Plegados({ titulo, lista }: { titulo: string; lista: Notam[] }) {
  if (lista.length === 0) return null;
  return (
    <details className="group">
      <summary className="cursor-pointer text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white">
        <span className="data">{lista.length}</span> {titulo}
      </summary>
      <ul className="mt-2 space-y-2">
        {lista.map((x) => (
          <li key={x.codigo} className="space-y-0.5">
            <p className="data text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
              {x.codigo} · {x.vigencia}
            </p>
            <p className="text-[11px] leading-relaxed text-zinc-700 dark:text-zinc-300">{x.texto}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}
