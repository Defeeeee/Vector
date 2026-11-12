"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles, Wind } from "lucide-react";
import { distanciaNmPrecisa } from "@/lib/distance";
import type { Viento } from "@/lib/navegacion";
import { horasDeMitadDeTramo, horaUtcDeTextos, textoHoraUtc } from "@/lib/viento-ruta";
import {
  IAS_ASCENSO_KT,
  REGIMEN_ASCENSO_FPM,
  altitudesPorDefecto,
  eetDeMinutos,
  textoDuracion,
  tramosDePuntos,
  vientosPorAltitud,
  type MotivoSinDato,
} from "@/lib/vientos-por-altitud";
import type { AerodromoForm } from "@/lib/formulario-plan";
import type { NodoResuelto } from "./useRutaResuelta";

/**
 * "Vientos en altura": la tabla de altitudes con el viento de la ruta, la componente de
 * frente o de cola, la GS y el tiempo (con el ascenso). No se pide sola al abrir el plan:
 * es un pedido a un servicio externo (Open-Meteo, vía `/api/viento` con `altitudesFt`).
 *
 * **Sugerir, no llenar:** tocar una fila ofrece su tiempo como EET (casilla 16); no
 * cambia el nivel de la casilla 15. La cuenta está en `lib/vientos-por-altitud.ts`.
 */

interface RespuestaMulti {
  puntos: ({ direccion: number; velocidad: number; horaModelo: number } | null)[][];
}

interface Traido {
  clave: string;
  /** `vientos[altitud][tramo]` */
  vientos: (Viento | null)[][];
  horaModeloMin: number | null;
  horaModeloMax: number | null;
  elevacionFt: number | null;
}

const MOTIVOS: Record<MotivoSinDato, string> = {
  viento: "sin dato de viento",
  imposible: "no se puede volar con este viento",
  "no-nivela": "no llega a nivelar",
};

/** 4500 → "4.500", a mano (invariante 1). */
const miles = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+$)/g, ".");
const dir3 = (d: number) => String(Math.round(d) % 360 || 360).padStart(3, "0");

function numero(s: string, defecto: number, min: number, max: number): number {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n >= min && n <= max ? n : defecto;
}

export default function VientosEnAltura({
  avionId,
  salida,
  destino,
  nodos,
  tasKt,
  salidaUtc,
  consumoLh,
  eetActual,
  onUsarEet,
}: {
  avionId: string;
  salida: AerodromoForm | null;
  destino: AerodromoForm | null;
  nodos: NodoResuelto[];
  tasKt: number | null;
  /** La salida vigente (con las demoras): día "AAAA-MM-DD" y hora "HHMM" en UTC. */
  salidaUtc: { dof: string; eobt: string } | null;
  consumoLh: number | null;
  eetActual: string;
  onUsarEet: (eet: string) => void;
}) {
  const [estado, setEstado] = useState<"quieto" | "cargando" | "error">("quieto");
  const [error, setError] = useState<string>("");
  const [traido, setTraido] = useState<Traido | null>(null);
  const [elegida, setElegida] = useState<number | null>(null);
  const [ias, setIas] = useState(String(IAS_ASCENSO_KT));
  const [regimen, setRegimen] = useState(String(REGIMEN_ASCENSO_FPM));

  // Lo del ascenso se recuerda por avión: es una conveniencia, la pantalla anda sin esto.
  const claveLs = `vector-ascenso-${avionId || "sin-avion"}`;
  useEffect(() => {
    try {
      const g = JSON.parse(localStorage.getItem(claveLs) ?? "null") as { ias?: string; regimen?: string } | null;
      setIas(g?.ias ?? String(IAS_ASCENSO_KT));
      setRegimen(g?.regimen ?? String(REGIMEN_ASCENSO_FPM));
    } catch {
      /* sin almacenamiento */
    }
  }, [claveLs]);
  const guardarAscenso = (i: string, r: string) => {
    try {
      localStorage.setItem(claveLs, JSON.stringify({ ias: i, regimen: r }));
    } catch {
      /* sin almacenamiento */
    }
  };

  // Los puntos de la ruta, en orden: salida, lo ubicado (con el tramo de las aerovías) y destino.
  const puntos = useMemo(() => {
    if (!salida || salida.lat === undefined || !destino || destino.lat === undefined) return [];
    const p: { lat: number; lon: number }[] = [{ lat: salida.lat, lon: salida.lon! }];
    for (const n of nodos) {
      if (n.estado !== "ubicado") continue;
      if (n.tipo === "aerovia") p.push(...(n.tramo ?? []));
      else p.push({ lat: n.lat!, lon: n.lon! });
    }
    p.push({ lat: destino.lat, lon: destino.lon! });
    return p;
  }, [salida, destino, nodos]);

  const tramos = useMemo(() => tramosDePuntos(puntos, (a, b) => distanciaNmPrecisa(a.lat, a.lon, b.lat, b.lon)), [puntos]);
  const mitades = useMemo(() => {
    const m: { lat: number; lon: number }[] = [];
    for (let i = 1; i < puntos.length; i++) {
      const d = distanciaNmPrecisa(puntos[i - 1].lat, puntos[i - 1].lon, puntos[i].lat, puntos[i].lon);
      if (d > 0.05) m.push({ lat: (puntos[i - 1].lat + puntos[i].lat) / 2, lon: (puntos[i - 1].lon + puntos[i].lon) / 2 });
    }
    return m;
  }, [puntos]);

  const salidaMs = salidaUtc && /^\d{4}$/.test(salidaUtc.eobt) ? horaUtcDeTextos(salidaUtc.dof, `${salidaUtc.eobt.slice(0, 2)}:${salidaUtc.eobt.slice(2)}`) : NaN;

  const falta: string[] = [];
  if (puntos.length < 2 || tramos.length === 0) falta.push("una ruta con la salida y el destino ubicados");
  else if (tramos.length > 29) falta.push("una ruta de hasta 29 tramos");
  if (!tasKt) falta.push("la velocidad de crucero (casilla 15)");
  if (!Number.isFinite(salidaMs)) falta.push("la fecha y la hora de salida");

  const altitudes = useMemo(() => altitudesPorDefecto(), []);
  const clave = JSON.stringify([mitades, tramos.map((t) => Math.round(t.distanciaNm)), tasKt, salidaMs]);
  const vigente = traido && traido.clave === clave ? traido : null;

  async function traer() {
    if (falta.length || !tasKt) return;
    setEstado("cargando");
    setError("");
    const pedida = clave;
    try {
      const horas = horasDeMitadDeTramo(salidaMs, tramos.map((t) => t.distanciaNm), tasKt);
      const [res, elev] = await Promise.all([
        fetch("/api/viento", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            puntos: mitades.map((m, i) => ({ lat: m.lat, lon: m.lon, hora: new Date(horas[i]).toISOString() })),
            altitudesFt: altitudes,
          }),
        }),
        salida?.codigo
          ? fetch(`/api/airports/search?icao=${encodeURIComponent(salida.codigo)}`)
              .then((r) => (r.ok ? (r.json() as Promise<{ elevation?: number }>) : null))
              .catch(() => null)
          : Promise.resolve(null),
      ]);
      if (!res.ok) {
        const m = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(m?.error ?? String(res.status));
      }
      const datos = (await res.json()) as RespuestaMulti;
      const todos = datos.puntos.flat().filter((x): x is NonNullable<typeof x> => !!x).map((x) => x.horaModelo);
      setTraido({
        clave: pedida,
        // por punto → por altitud: se da vuelta a [altitud][tramo]
        vientos: altitudes.map((_, a) =>
          datos.puntos.map((p) => (p[a] ? { direccion: p[a]!.direccion, velocidad: p[a]!.velocidad } : null))
        ),
        horaModeloMin: todos.length ? Math.min(...todos) : null,
        horaModeloMax: todos.length ? Math.max(...todos) : null,
        elevacionFt: typeof elev?.elevation === "number" ? elev.elevation : null,
      });
      setElegida(null);
      setEstado("quieto");
    } catch (e) {
      setError(e instanceof Error && e.message && !/^\d+$/.test(e.message) ? e.message : "No se pudo traer el pronóstico.");
      setEstado("error");
    }
  }

  const iasN = numero(ias, IAS_ASCENSO_KT, 30, 200);
  const regN = numero(regimen, REGIMEN_ASCENSO_FPM, 50, 3000);
  const filas = useMemo(
    () =>
      vigente && tasKt
        ? vientosPorAltitud({
            tramos,
            tasKt,
            altitudesFt: altitudes,
            vientos: vigente.vientos,
            ascenso: { iasKt: iasN, regimenFpm: regN, elevacionFt: vigente.elevacionFt ?? 0 },
            consumoLh,
          })
        : [],
    [vigente, tasKt, tramos, altitudes, iasN, regN, consumoLh]
  );
  const conLitros = filas.some((f) => f.datos?.litros != null);
  const sinUbicar = nodos.filter((n) => n.estado !== "ubicado").map((n) => n.texto);
  const sinDatoN = filas.filter((f) => !f.datos).length;

  const campo =
    "w-14 bg-transparent border-b border-zinc-300 dark:border-white/20 text-center data text-sm font-bold text-zinc-900 dark:text-white outline-none focus:border-zinc-900 dark:focus:border-white";
  const celda = "py-2 px-1 text-right data text-[12px] whitespace-nowrap";
  const cab = "py-1.5 px-1 text-right font-mono text-[9px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500";

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
        El viento de la ruta a cada altitud, a la hora de la salida: cuál conviene y cuánto cuesta subir.
      </p>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-zinc-600 dark:text-zinc-300">
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Ascenso</span>
        <input
          aria-label="Velocidad de ascenso, en nudos"
          value={ias}
          inputMode="numeric"
          maxLength={3}
          className={campo}
          onChange={(e) => {
            setIas(e.target.value);
            guardarAscenso(e.target.value, regimen);
          }}
        />
        <span>kt ·</span>
        <input
          aria-label="Régimen de ascenso, en pies por minuto"
          value={regimen}
          inputMode="numeric"
          maxLength={4}
          className={campo}
          onChange={(e) => {
            setRegimen(e.target.value);
            guardarAscenso(ias, e.target.value);
          }}
        />
        <span>ft/min</span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void traer()}
          disabled={estado === "cargando" || falta.length > 0}
          className="inline-flex items-center gap-1.5 rounded-full bg-aviation-cyan px-4 py-2 text-xs font-bold text-noche disabled:opacity-50"
        >
          {estado === "cargando" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wind className="w-3.5 h-3.5" />}
          {vigente ? "Actualizar vientos en altura" : "Ver vientos en altura"}
        </button>
        {falta.length > 0 && (
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Falta {falta.join(", ")}.</p>
        )}
      </div>
      {estado === "error" && <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}
      {traido && !vigente && estado !== "cargando" && (
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">La ruta, la velocidad o la salida cambiaron: volvé a pedir los vientos.</p>
      )}

      {vigente && (
        <>
          <div className="overflow-x-auto -mx-1">
            <table className="w-full min-w-[330px] border-collapse">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-white/10">
                  <th className={`${cab} text-left`}>Alt ft</th>
                  <th className={cab}>Viento</th>
                  <th className={cab}>Cola/frente</th>
                  <th className={cab}>Cruz</th>
                  <th className={cab}>GS</th>
                  <th className={cab}>Tiempo</th>
                  {conLitros && <th className={cab}>L</th>}
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const d = f.datos;
                  const abierta = elegida === f.altitudFt;
                  const cols = conLitros ? 7 : 6;
                  return (
                    <tr
                      key={f.altitudFt}
                      onClick={d ? () => setElegida(abierta ? null : f.altitudFt) : undefined}
                      className={`border-b border-zinc-100 dark:border-white/5 ${d ? "cursor-pointer" : "opacity-60"} ${
                        f.esMejor ? "bg-aviation-cyan/10" : abierta ? "bg-white/[0.03]" : ""
                      }`}
                    >
                      <td className="py-2 px-1 text-left data text-[12px] whitespace-nowrap font-bold text-zinc-900 dark:text-white">
                        {miles(f.altitudFt)}
                        {f.esMejor && <span className="block font-mono text-[8px] uppercase tracking-wider text-aviation-cyan">Menos tiempo</span>}
                      </td>
                      {d ? (
                        <>
                          <td className={celda}>
                            {dir3(d.viento.direccion)}/{Math.round(d.viento.velocidad)}
                          </td>
                          <td className={`${celda} font-bold ${d.colaKt >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-sky-600 dark:text-sky-400"}`}>
                            {d.colaKt >= 0 ? "+" : "−"}
                            {Math.abs(Math.round(d.colaKt))}
                          </td>
                          <td className={celda}>
                            {Math.round(d.cruzadaKt)}
                            {d.ladoCruzada ? (d.ladoCruzada === "derecha" ? "D" : "I") : ""}
                          </td>
                          <td className={celda}>{Math.round(d.gsKt)}</td>
                          <td className={`${celda} font-bold text-zinc-900 dark:text-white`}>{textoDuracion(d.minutos)}</td>
                          {conLitros && <td className={celda}>{d.litros != null ? Math.round(d.litros) : "—"}</td>}
                        </>
                      ) : (
                        <td colSpan={cols - 1} className="py-2 px-1 text-left text-[11px] text-zinc-500">
                          {f.motivo ? MOTIVOS[f.motivo] : ""}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {elegida !== null &&
            (() => {
              const f = filas.find((x) => x.altitudFt === elegida);
              if (!f?.datos) return null;
              const eet = eetDeMinutos(f.datos.minutos);
              const igual = eet === eetActual;
              return (
                <button
                  type="button"
                  onClick={() => onUsarEet(eet)}
                  disabled={igual}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-sky-50 dark:bg-sky-500/10 px-3 py-1 text-[11px] font-semibold text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-500/20 disabled:opacity-60 transition-colors text-left"
                >
                  <Sparkles className="w-3 h-3 shrink-0" />
                  <span>
                    Usar <span className="data font-bold">{textoDuracion(f.datos.minutos)}</span> como EET (casilla 16) · a{" "}
                    {miles(f.altitudFt)} ft
                    {!igual && <span className="ml-1 underline underline-offset-2">usar</span>}
                  </span>
                </button>
              );
            })()}
          {elegida === null && <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Tocá una fila para ofrecerla como duración (EET).</p>}

          <div className="space-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            <p>
              Cola/frente y cruzada en nudos (+ cola, − frente; D/I, de qué lado); viento en grados verdaderos. El tiempo incluye el
              ascenso desde {Math.round(vigente.elevacionFt ?? 0)} ft{vigente.elevacionFt == null ? " (no se sabe la elevación de la salida: se tomó 0)" : ""} a{" "}
              {Math.round(iasN)} kt indicados (TAS +2 % cada 1.000 ft) y {Math.round(regN)} ft/min; el descenso no suma tiempo
              y el combustible usa el mismo consumo en todo el vuelo (en ascenso se gasta más).
            </p>
            <p>
              {vigente.horaModeloMin !== null
                ? `Pronóstico de ${textoHoraUtc(vigente.horaModeloMin)}${
                    vigente.horaModeloMax !== null && vigente.horaModeloMax !== vigente.horaModeloMin ? ` a ${textoHoraUtc(vigente.horaModeloMax)}` : ""
                  }. `
                : ""}
              Open-Meteo, pronóstico; no reemplaza el briefing.
              {sinUbicar.length > 0 && ` La ruta no cuenta lo que no se ubicó (${sinUbicar.join(", ")}).`}
              {sinDatoN > 0 && ` ${sinDatoN} ${sinDatoN === 1 ? "altitud sin dato" : "altitudes sin dato"}: no se completan con otras.`}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
