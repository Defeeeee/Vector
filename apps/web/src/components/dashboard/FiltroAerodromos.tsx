"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, Fuel, Loader2, Sparkles, X } from "lucide-react";
import {
  filtrosDeParams,
  hayFiltros,
  paramsDeFiltros,
  type AerodromoFiltrado,
  type DatoFaltante,
  type FiltrosAerodromo,
  type ResultadoFiltro,
} from "@/lib/filtro-aerodromos";
import type { AirportHistory } from "./AirportsClient";

interface Respuesta extends ResultadoFiltro {
  desde: { icao: string; label: string } | null;
  desdeError: string | null;
  provincias: string[];
}

/** Las claves de la URL que son de los filtros: el resto (`icao`) no se toca. */
const CLAVES = ["desde", "nm", "largo", "sup", "comb", "ctrl", "uso", "prov", "sindato"];

const QUE_FALTA: Record<DatoFaltante, string> = {
  "ubicación": "la ubicación",
  pista: "las pistas",
  combustible: "el combustible",
  control: "si es controlado",
  uso: "si es público",
};

const MINUSCULAS = new Set(["de", "del", "la", "las", "los", "y", "el"]);
const titulo = (s: string) =>
  s
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && MINUSCULAS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");

const combustibles = (texto: string) =>
  [/100\s*LL/i.test(texto) && "100LL", /JET\s*A[\s-]*1/i.test(texto) && "JET A-1"].filter(Boolean).join(" · ");

const CAMPO =
  "h-10 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-carbon px-3 text-sm font-semibold text-zinc-900 dark:text-white outline-none focus:border-aviation-blue transition-colors";

function Selector<T extends string>({
  etiqueta,
  valor,
  opciones,
  alCambiar,
}: {
  etiqueta: string;
  valor: T | "";
  opciones: [T | "", string][];
  alCambiar: (v: T | "") => void;
}) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{etiqueta}</span>
      <span className="relative">
        <select
          value={valor}
          onChange={(e) => alCambiar(e.target.value as T | "")}
          className={`${CAMPO} w-full appearance-none pr-8 ${valor ? "" : "text-zinc-500 dark:text-zinc-400"}`}
        >
          {opciones.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
      </span>
    </label>
  );
}

function Fila({ a, visitas, alElegir }: { a: AerodromoFiltrado; visitas?: number; alElegir: () => void }) {
  const pista =
    a.largoM !== null
      ? `${String(a.largoM).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} m${a.superficie ? ` · ${a.superficie === "dura" ? "asfalto/hormigón" : "pasto/tierra"}` : ""}`
      : null;
  return (
    <li>
      <button
        type="button"
        onClick={alElegir}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors"
      >
        <span className="w-14 shrink-0">
          <span className="data block text-sm font-bold text-zinc-900 dark:text-white">{a.icao}</span>
          {a.local && a.local !== a.icao && <span className="data block text-[10px] text-zinc-400">{a.local}</span>}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">{a.label}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            {a.provincia && <span>{titulo(a.provincia)}</span>}
            {pista && <span className="data">{pista}</span>}
            {a.combustible && combustibles(a.combustible) && (
              <span className="inline-flex items-center gap-1">
                <Fuel className="w-3 h-3" />
                {combustibles(a.combustible)}
              </span>
            )}
            {a.controlado !== null && <span>{a.controlado ? "Controlado" : "No controlado"}</span>}
            {a.uso === "PRIVADO" && <span>Privado</span>}
            {a.sinDato.map((d) => (
              <span key={d} className="rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-0.5 font-semibold">
                sin dato de {QUE_FALTA[d].replace(/^(la|las|el) /, "")}
              </span>
            ))}
          </span>
        </span>
        <span className="shrink-0 text-right">
          {a.distanciaNm !== null && <span className="data block text-sm font-bold text-zinc-900 dark:text-white">{a.distanciaNm} NM</span>}
          {visitas !== undefined && <span className="data block text-[10px] text-zinc-400">{visitas}× volado</span>}
        </span>
      </button>
    </li>
  );
}

/**
 * Buscar aeródromos con filtros, o con una frase que Gemini pasa a esos mismos filtros
 * (`/api/airports/frase`). La búsqueda la hace `/api/airports/filtrar` sobre el directorio,
 * y los filtros viven en la URL: un link a esta pantalla abre la misma lista.
 */
export default function FiltroAerodromos({
  inicial,
  historial,
  alElegir,
}: {
  /** Los parámetros de la URL con que se abrió la pantalla. */
  inicial: string;
  historial: Record<string, AirportHistory>;
  alElegir: (icao: string) => void;
}) {
  const [filtros, setFiltros] = useState<FiltrosAerodromo>(() => filtrosDeParams(new URLSearchParams(inicial)));
  const [desdeTexto, setDesdeTexto] = useState(filtros.desde ?? "");
  const [frase, setFrase] = useState("");
  const [leyendo, setLeyendo] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "error" | "noEntendido"; texto: string } | null>(null);
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(false);
  const [provincias, setProvincias] = useState<string[]>([]);
  const [abiertos, setAbiertos] = useState(() => hayFiltros(filtrosDeParams(new URLSearchParams(inicial))));

  const cambiar = (parche: Partial<FiltrosAerodromo>) => setFiltros((f) => ({ ...f, ...parche }));
  const activos = hayFiltros(filtros);
  const clave = useMemo(() => paramsDeFiltros(filtros).toString(), [filtros]);

  // El código de "Desde" se aplica cuando parece uno: tipear "SA" no dispara nada.
  useEffect(() => {
    const t = desdeTexto.trim().toUpperCase();
    if (t === "") cambiar({ desde: undefined, radioNm: undefined });
    else if (/^[A-Z0-9]{3,4}$/.test(t)) cambiar({ desde: t });
  }, [desdeTexto]);

  useEffect(() => {
    const url = new URL(window.location.href);
    for (const k of CLAVES) url.searchParams.delete(k);
    new URLSearchParams(clave).forEach((v, k) => url.searchParams.set(k, v));
    window.history.replaceState(window.history.state, "", url);

    if (!activos) {
      setDatos(null);
      return;
    }
    setCargando(true);
    let vigente = true;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/airports/filtrar?${clave}`);
        const body: Respuesta | null = res.ok ? await res.json() : null;
        if (!vigente) return;
        setDatos(body);
        if (body?.provincias) setProvincias(body.provincias);
      } catch {
        if (vigente) setDatos(null);
      } finally {
        if (vigente) setCargando(false);
      }
    }, 250);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [clave, activos]);

  // Las provincias para el selector, aunque todavía no haya filtros.
  useEffect(() => {
    if (!abiertos || provincias.length) return;
    fetch("/api/airports/filtrar?sindato=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => b?.provincias && setProvincias(b.provincias))
      .catch(() => {});
  }, [abiertos, provincias.length]);

  async function leerFrase(e: React.FormEvent) {
    e.preventDefault();
    if (frase.trim().length < 3 || leyendo) return;
    setLeyendo(true);
    setAviso(null);
    try {
      const res = await fetch("/api/airports/frase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frase }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || typeof body?.params !== "string") {
        setAviso({ tipo: "error", texto: body?.error ?? "No pude leer la frase. Usá los filtros." });
        return;
      }
      const nuevos = filtrosDeParams(new URLSearchParams(body.params));
      setFiltros(nuevos);
      setDesdeTexto(nuevos.desde ?? "");
      setAbiertos(true);
      if (body.noEntendido?.length) setAviso({ tipo: "noEntendido", texto: `No pude usar: ${body.noEntendido.join(" ")}` });
      else if (!hayFiltros(nuevos)) setAviso({ tipo: "noEntendido", texto: "No encontré filtros en la frase. Probá con distancia, pista, combustible o provincia." });
    } catch {
      setAviso({ tipo: "error", texto: "No pude leer la frase. Usá los filtros." });
    } finally {
      setLeyendo(false);
    }
  }

  function limpiar() {
    setFiltros({});
    setDesdeTexto("");
    setFrase("");
    setAviso(null);
  }

  const faltan = datos
    ? [...new Set(datos.resultados.flatMap((a) => a.sinDato))]
    : [];

  return (
    <section className="rounded-3xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-carbon p-4 md:p-6 space-y-4 shadow-cal dark:shadow-none">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-display font-bold text-zinc-900 dark:text-white tracking-tight">Buscar aeródromos</h2>
          <p className="text-[13px] text-zinc-500 dark:text-zinc-400">Escribí lo que necesitás, o usá los filtros.</p>
        </div>
        {activos && (
          <button
            type="button"
            onClick={limpiar}
            className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
            Limpiar
          </button>
        )}
      </div>

      <form onSubmit={leerFrase} className="flex gap-2">
        <div className="relative flex-1 min-w-0">
          <Sparkles className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-aviation-blue" />
          <input
            value={frase}
            onChange={(e) => setFrase(e.target.value)}
            maxLength={240}
            placeholder="Con 100LL y pista de asfalto, a menos de 100 NM de San Fernando"
            aria-label="Qué aeródromos buscás"
            className="w-full h-11 bg-zinc-50 dark:bg-carbon border border-zinc-200 dark:border-white/10 rounded-2xl pl-11 pr-3 text-sm font-medium text-zinc-900 dark:text-white outline-none focus:border-aviation-blue transition-colors placeholder:text-zinc-400 dark:placeholder:text-zinc-600"
          />
        </div>
        <button
          type="submit"
          disabled={frase.trim().length < 3 || leyendo}
          className="shrink-0 h-11 px-4 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-bold disabled:opacity-30 transition-opacity inline-flex items-center gap-2"
        >
          {leyendo && <Loader2 className="w-4 h-4 animate-spin" />}
          Buscar
        </button>
      </form>

      {aviso && (
        <p
          className={`flex items-start gap-2 text-xs rounded-xl px-3 py-2 ${
            aviso.tipo === "error"
              ? "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400"
              : "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400"
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {aviso.texto}
        </p>
      )}

      <button
        type="button"
        onClick={() => setAbiertos((a) => !a)}
        aria-expanded={abiertos}
        className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
      >
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${abiertos ? "rotate-180" : ""}`} />
        Filtros
      </button>

      {abiertos && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="flex flex-col gap-1 min-w-0">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Desde</span>
            <input
              value={desdeTexto}
              onChange={(e) => setDesdeTexto(e.target.value.toUpperCase().slice(0, 4))}
              placeholder="SADF"
              className={`${CAMPO} data uppercase placeholder:normal-case placeholder:font-normal placeholder:text-zinc-400`}
            />
          </label>
          <label className="flex flex-col gap-1 min-w-0">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">A menos de (NM)</span>
            <input
              inputMode="numeric"
              value={filtros.radioNm ?? ""}
              disabled={!filtros.desde}
              onChange={(e) => {
                const n = Number.parseInt(e.target.value.replace(/\D/g, ""), 10);
                cambiar({ radioNm: Number.isFinite(n) && n > 0 ? Math.min(n, 1000) : undefined });
              }}
              placeholder={filtros.desde ? "100" : "elegí Desde"}
              className={`${CAMPO} data disabled:opacity-40 placeholder:font-normal placeholder:text-zinc-400`}
            />
          </label>
          <label className="flex flex-col gap-1 min-w-0">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Pista mínima (m)</span>
            <input
              inputMode="numeric"
              value={filtros.largoMinM ?? ""}
              onChange={(e) => {
                const n = Number.parseInt(e.target.value.replace(/\D/g, ""), 10);
                cambiar({ largoMinM: Number.isFinite(n) && n > 0 ? Math.min(n, 5000) : undefined });
              }}
              placeholder="800"
              className={`${CAMPO} data placeholder:font-normal placeholder:text-zinc-400`}
            />
          </label>
          <Selector
            etiqueta="Superficie"
            valor={filtros.superficie ?? ""}
            opciones={[["", "Cualquiera"], ["dura", "Asfalto u hormigón"], ["blanda", "Pasto o tierra"]]}
            alCambiar={(v) => cambiar({ superficie: v || undefined })}
          />
          <Selector
            etiqueta="Combustible"
            valor={filtros.combustible ?? ""}
            opciones={[["", "Cualquiera"], ["100LL", "AVGAS 100LL"], ["JETA1", "JET A-1"]]}
            alCambiar={(v) => cambiar({ combustible: v || undefined })}
          />
          <Selector
            etiqueta="Control"
            valor={filtros.controlado === undefined ? "" : filtros.controlado ? "si" : "no"}
            opciones={[["", "Todos"], ["si", "Controlados"], ["no", "No controlados"]]}
            alCambiar={(v) => cambiar({ controlado: v === "" ? undefined : v === "si" })}
          />
          <Selector
            etiqueta="Uso"
            valor={filtros.uso ?? ""}
            opciones={[["", "Todos"], ["publico", "Públicos"], ["privado", "Privados"]]}
            alCambiar={(v) => cambiar({ uso: v || undefined })}
          />
          <Selector
            etiqueta="Provincia"
            valor={filtros.provincia ?? ""}
            opciones={[["", "Todas"], ...provincias.map((p) => [p, titulo(p)] as [string, string])]}
            alCambiar={(v) => cambiar({ provincia: v || undefined })}
          />
        </div>
      )}

      {activos && (
        <div className="space-y-3">
          {datos?.desdeError && <p className="text-xs text-amber-700 dark:text-amber-400">{datos.desdeError}</p>}

          <div className="flex items-center gap-2 text-sm">
            {cargando && <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />}
            {datos && (
              <p className="font-semibold text-zinc-900 dark:text-white">
                {datos.total === 0
                  ? "Ningún aeródromo cumple todo eso."
                  : `${datos.total} ${datos.total === 1 ? "aeródromo" : "aeródromos"}${datos.desde ? ` desde ${datos.desde.icao}` : ""}`}
                {datos.total > datos.resultados.length && (
                  <span className="font-normal text-zinc-500"> · los {datos.resultados.length} primeros</span>
                )}
              </p>
            )}
          </div>

          {datos && datos.conDatoFaltante > 0 && (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Hay {datos.conDatoFaltante} más que no puedo confirmar: no tengo todos sus datos.{" "}
              <button type="button" onClick={() => cambiar({ conSinDato: true })} className="font-semibold text-aviation-blue hover:underline">
                Mostrarlos
              </button>
            </p>
          )}
          {filtros.conSinDato && faltan.length > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Los marcados «sin dato» pueden no cumplir: confirmá {faltan.map((d) => QUE_FALTA[d]).join(", ")} en su ficha.{" "}
              <button type="button" onClick={() => cambiar({ conSinDato: undefined })} className="font-semibold underline">
                Ocultarlos
              </button>
            </p>
          )}

          {datos && datos.resultados.length > 0 && (
            <ul className="max-h-[28rem] overflow-y-auto rounded-2xl border border-zinc-200 dark:border-white/10 divide-y divide-zinc-100 dark:divide-white/5">
              {datos.resultados.map((a) => (
                <Fila key={a.icao} a={a} visitas={historial[a.icao]?.visits} alElegir={() => alElegir(a.icao)} />
              ))}
            </ul>
          )}

          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
            Las pistas y el combustible salen del AIP para los aeródromos controlados, y de MADHEL (ANAC) para el
            resto, que se actualiza una vez por mes. Lo de hoy está en la ficha de cada aeródromo.
          </p>
        </div>
      )}
    </section>
  );
}
