"use client";

import { useState, useTransition } from "react";
import { Aircraft } from "@/types";
import { CustomStat, MAX_PATTERN_LENGTH, presets } from "@/lib/custom-stats";
import { createCustomStat, deleteCustomStat } from "@/actions/custom-stat";
import { Plus, Trash2, Loader2 } from "lucide-react";
import StyledSelect from "./StyledSelect";

/**
 * Constructor de métricas propias.
 *
 * **Está pensado para cualquier alumno, no para un power user.** Por eso la UI
 * manda y el regex vive detrás de "Filtro avanzado": quien no sepa qué es una
 * expresión regular no debería tropezarse con una.
 *
 * Los presets existen por lo mismo. Nadie aprende un constructor vacío; se
 * aprende tocando algo que ya funciona y viendo qué cambia.
 */
export default function CustomStatsManager({
  stats,
  aircraft,
  recencyWindow,
}: {
  stats: CustomStat[];
  aircraft: Aircraft[];
  /** Ventana de recencia del piloto (90 o 180 según la licencia, RAAC 61.140). */
  recencyWindow: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const yaTiene = new Set(stats.map((s) => s.name));
  const sugeridos = presets(recencyWindow).filter((p) => !yaTiene.has(p.name));

  const agregar = (payload: Record<string, unknown>) => {
    setError(null);
    startTransition(async () => {
      try {
        await createCustomStat(payload as never);
        setAbierto(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo crear la métrica");
      }
    });
  };

  return (
    <div className="space-y-4">
      {stats.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {stats.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{s.name}</p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {descripcion(s, aircraft)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => startTransition(() => void deleteCustomStat(s.id))}
                aria-label={`Borrar ${s.name}`}
                className="shrink-0 p-2 rounded-xl text-zinc-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {sugeridos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {sugeridos.map((p) => (
            <button
              key={p.name}
              type="button"
              disabled={pendiente}
              onClick={() =>
                agregar({
                  name: p.name, metric: p.metric,
                  window_days: p.windowDays ?? null, target: p.target ?? null,
                  purpose: p.purpose ?? null,
                })
              }
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-full border border-zinc-200 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              <Plus className="w-3 h-3" />
              {p.name}
            </button>
          ))}
        </div>
      )}

      {abierto ? (
        <Formulario
          aircraft={aircraft}
          pendiente={pendiente}
          error={error}
          onCancel={() => { setAbierto(false); setError(null); }}
          onSubmit={agregar}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="inline-flex items-center gap-2 border border-zinc-200 dark:border-white/10 hover:bg-zinc-50 dark:hover:bg-white/5 text-zinc-900 dark:text-white font-semibold text-sm px-5 py-3.5 rounded-xl transition-all shadow-sm active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          <span>Crear una métrica</span>
        </button>
      )}
    </div>
  );
}

/** Una línea que explica qué mide, para no tener que abrir nada. */
function descripcion(s: CustomStat, aircraft: Aircraft[]): string {
  const partes: string[] = [s.metric];
  if (s.target) partes.push(`objetivo ${s.target}`);
  if (s.windowDays) partes.push(`últimos ${s.windowDays} días`);
  if (s.clase) partes.push(s.clase);
  if (s.aircraftId) {
    const a = aircraft.find((x) => x.id === s.aircraftId);
    if (a) partes.push(a.registration);
  }
  if (s.purpose) partes.push(s.purpose);
  if (s.airport) partes.push(s.airport);
  if (s.regexPattern) partes.push(`filtro en ${s.regexField}`);
  return partes.join(" · ");
}

function Formulario({
  aircraft, pendiente, error, onCancel, onSubmit,
}: {
  aircraft: Aircraft[];
  pendiente: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  const [avanzado, setAvanzado] = useState(false);
  // StyledSelect es controlado y postea por un input oculto, así que necesita
  // estado propio aunque el envío después salga por FormData.
  const [metric, setMetric] = useState("vuelos");
  const [clase, setClase] = useState("");
  const [aircraftId, setAircraftId] = useState("");
  const [regexField, setRegexField] = useState("remarks");

  const campo =
    "w-full bg-transparent border-b-2 border-zinc-200 dark:border-white/10 focus:border-zinc-900 dark:focus:border-white py-2 text-sm font-semibold text-zinc-900 dark:text-white outline-none transition-colors placeholder:text-zinc-300 dark:placeholder:text-zinc-700";

  const enviar = (fd: FormData) => {
    const num = (k: string) => {
      const v = fd.get(k);
      return v && String(v).trim() ? Number(v) : null;
    };
    const txt = (k: string) => {
      const v = fd.get(k);
      return v && String(v).trim() ? String(v).trim() : null;
    };
    onSubmit({
      name: txt("name") ?? "Métrica",
      metric: txt("metric") ?? "vuelos",
      aircraft_id: txt("aircraft_id"),
      clase: txt("clase"),
      purpose: txt("purpose"),
      airport: txt("airport")?.toUpperCase() ?? null,
      window_days: num("window_days"),
      target: num("target"),
      regex_field: avanzado ? txt("regex_field") : null,
      regex_pattern: avanzado ? txt("regex_pattern") : null,
    });
  };

  const clases = Array.from(
    new Set(aircraft.map((a) => (a.type_acft || "").trim()).filter(Boolean))
  );

  return (
    <form
      action={enviar}
      className="rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] p-6 md:p-8 space-y-5"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <label className="space-y-1.5">
          <span className="eyebrow">Nombre</span>
          <input name="name" required placeholder="Recencia multimotor" className={campo} />
        </label>

        <label className="space-y-1.5">
          <span className="eyebrow">Qué contar</span>
          <StyledSelect
            name="metric"
            value={metric}
            onChange={setMetric}
            options={[
              { value: "vuelos", label: "Vuelos" },
              { value: "horas", label: "Horas" },
              { value: "aterrizajes", label: "Aterrizajes" },
            ]}
          />
        </label>

        <label className="space-y-1.5">
          <span className="eyebrow">Objetivo (opcional)</span>
          <input name="target" type="number" step="any" min="0" placeholder="3" className={campo} />
        </label>

        <label className="space-y-1.5">
          <span className="eyebrow">Últimos N días (opcional)</span>
          <input name="window_days" type="number" min="1" placeholder="180" className={campo} />
        </label>

        {clases.length > 0 && (
          <label className="space-y-1.5">
            <span className="eyebrow">Clase (opcional)</span>
            <StyledSelect
              name="clase"
              value={clase}
              onChange={setClase}
              options={[{ value: "", label: "Cualquiera" }, ...clases.map((c) => ({ value: c, label: c }))]}
            />
          </label>
        )}

        <label className="space-y-1.5">
          <span className="eyebrow">Aeronave (opcional)</span>
          <StyledSelect
            name="aircraft_id"
            value={aircraftId}
            onChange={setAircraftId}
            options={[
              { value: "", label: "Cualquiera" },
              ...aircraft.map((a) => ({ value: a.id, label: a.registration })),
            ]}
          />
        </label>

        <label className="space-y-1.5">
          <span className="eyebrow">Finalidad (opcional)</span>
          <input name="purpose" placeholder="INST" className={campo} />
        </label>

        <label className="space-y-1.5">
          <span className="eyebrow">Aeródromo (opcional)</span>
          <input name="airport" placeholder="SADF" maxLength={4} className={campo} />
        </label>
      </div>

      {/* Detrás de un toggle a propósito: quien no sepa qué es una expresión
          regular no debería tropezarse con una. */}
      <div className="pt-1">
        <button
          type="button"
          onClick={() => setAvanzado((v) => !v)}
          className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
        >
          {avanzado ? "− Ocultar filtro avanzado" : "+ Filtro avanzado (texto)"}
        </button>
      </div>

      {avanzado && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <label className="space-y-1.5">
            <span className="eyebrow">Buscar en</span>
            <StyledSelect
              name="regex_field"
              value={regexField}
              onChange={setRegexField}
              options={[
                { value: "remarks", label: "Observaciones" },
                { value: "route", label: "Ruta" },
                { value: "purpose", label: "Finalidad" },
              ]}
            />
          </label>
          <label className="space-y-1.5">
            <span className="eyebrow">Texto o expresión regular</span>
            <input name="regex_pattern" maxLength={MAX_PATTERN_LENGTH} placeholder="instructor" className={campo} />
          </label>
        </div>
      )}

      {error && <p className="text-sm font-medium text-red-500">{error}</p>}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={pendiente}
          className="inline-flex items-center gap-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold text-sm px-5 py-3 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {pendiente && <Loader2 className="w-4 h-4 animate-spin" />}
          Crear
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
