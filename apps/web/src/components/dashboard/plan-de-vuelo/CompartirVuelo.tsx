"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Loader2, Send } from "lucide-react";
import { cambiarMatriculaVisible, compartirPlanDeVuelo, leerSeguimientoDelPlan, terminarSeguimiento, type SeguimientoDelPlan } from "@/actions/seguimiento";
import { motivoParaNoCompartir, puntosParaCompartir, rutaParaCompartir, salidaIso, type NodoParaCompartir } from "@/lib/compartir-plan";
import { type Demora } from "@/lib/demora-plan";
import type { FormularioPlan } from "@/lib/formulario-plan";
import { detalleDeVistas, urlDeSeguimiento } from "@/lib/seguimiento";
import { horaArgentina, horaUtc, textoSalida } from "@/lib/seguimiento-calculos";
import { mandarLink } from "@/components/dashboard/mapa/CompartirSeguimiento";

/**
 * "Compartir este vuelo" (migración 045 del backend), la sección del editor de un plan: manda a la
 * familia un link para seguir el vuelo **sin el teléfono**. El backend toma del plan guardado la
 * matrícula, la salida (EOBT vigente) y la duración; con ADS-B muestra "Sale a las 12:30 (15:30Z)"
 * antes de despegar, el vuelo en vivo cuando el avión está en el aire y "Aterrizó" cuando toca tierra.
 *
 * - **No todos los aviones transmiten ADS-B** ni hay receptores en todos lados: se dice antes de
 *   compartir. Si el piloto después vuela con el Mapa y toca "Compartir mi vuelo", se usa este mismo
 *   link y el GPS del teléfono se suma al ADS-B.
 * - **La matrícula sólo sale si se prende "Mostrar la matrícula"** (apagado por defecto). El backend
 *   guarda aparte la matrícula para buscar el avión en ADS-B; esa nunca sale.
 * - Antes de pedir, espera a que el plan esté guardado en el servidor (el backend lo lee de ahí).
 * - Las horas se arman a mano (invariante 1): `textoSalida` y `horaArgentina`.
 */

interface Props {
  planId: string;
  f: FormularioPlan;
  demoras: Demora[];
  avion: { type: string; icao: string } | null;
  nodos: NodoParaCompartir[];
  inicial: SeguimientoDelPlan | null;
  /** La hora del servidor, para decir "Sale a las…" sin el reloj del navegador. */
  ahoraIso: string;
  cancelado: boolean;
  /** Que el plan guardado en el servidor sea el que se ve en pantalla. */
  esperarGuardado: () => Promise<void>;
}

const ROTULO = "font-mono text-[10px] font-bold uppercase tracking-wider";
const POLL_MS = 20_000;

export default function CompartirVuelo({ planId, f, demoras, avion, nodos, inicial, ahoraIso, cancelado, esperarGuardado }: Props) {
  const [seg, setSeg] = useState<SeguimientoDelPlan | null>(inicial);
  const [estado, setEstado] = useState<"" | "creando" | "terminando">("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<"copiado" | "manual" | null>(null);
  const [mostrar, setMostrar] = useState(inicial?.mostrarMatricula ?? false);
  const ocupado = useRef(false);

  const compartiendo = Boolean(seg?.activo);
  const salida = salidaIso(f, demoras);
  const motivo = useMemo(() => motivoParaNoCompartir(f, demoras, ahoraIso, cancelado), [f, demoras, ahoraIso, cancelado]);
  const url = seg ? urlDeSeguimiento(typeof window === "undefined" ? "" : window.location.origin, seg.token) : null;
  const salidaCambio = compartiendo && salida !== null && seg?.salidaPrevista != null && Date.parse(seg.salidaPrevista) !== Date.parse(salida);

  // Mientras se comparte, quién mira y si ya aterrizó (el backend lo termina cuando alguien abre el link).
  useEffect(() => {
    if (!compartiendo) return;
    const leer = async () => {
      if (document.visibilityState !== "visible" || ocupado.current) return;
      const nuevo = await leerSeguimientoDelPlan(planId);
      if (nuevo && !ocupado.current) setSeg(nuevo);
    };
    const t = window.setInterval(() => void leer(), POLL_MS);
    document.addEventListener("visibilitychange", leer);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", leer);
    };
  }, [compartiendo, planId]);

  const compartir = useCallback(
    async (mandar: boolean) => {
      if (ocupado.current) return;
      ocupado.current = true;
      setError(null);
      setAviso(null);
      setEstado("creando");
      try {
        await esperarGuardado();
        const r = await compartirPlanDeVuelo({
          planId,
          ruta: rutaParaCompartir(f, nodos),
          puntos: puntosParaCompartir(f, nodos),
          avion: avion ? { tipo: avion.type, icao: avion.icao } : null,
          mostrarMatricula: mostrar && f.matricula.trim() !== "",
        });
        if ("error" in r) {
          setError(r.error);
          return;
        }
        const leido = await leerSeguimientoDelPlan(planId);
        setSeg(
          leido ?? {
            id: r.seguimiento.id,
            token: r.seguimiento.token,
            venceAt: r.seguimiento.venceAt,
            activo: true,
            aterrizoAt: null,
            mostrarMatricula: r.seguimiento.mostrarMatricula,
            salidaPrevista: r.seguimiento.salidaPrevista ?? null,
            mirandoAhora: 0,
            vistosTotal: 0,
            ultimaVistaAt: null,
            ahora: new Date().toISOString(),
          }
        );
        setMostrar(r.seguimiento.mostrarMatricula);
        if (mandar) {
          const link = urlDeSeguimiento(window.location.origin, r.seguimiento.token);
          const m = await mandarLink(link);
          if (m === "copiado" || m === "manual") setAviso(m);
        }
      } finally {
        ocupado.current = false;
        setEstado("");
      }
    },
    [avion, esperarGuardado, f, mostrar, nodos, planId]
  );

  const volverAMandar = async () => {
    if (!url) return;
    const m = await mandarLink(url);
    setAviso(m === "copiado" || m === "manual" ? m : null);
  };

  const dejarDeCompartir = async () => {
    if (!seg || ocupado.current) return;
    ocupado.current = true;
    setEstado("terminando");
    setError(null);
    try {
      const r = await terminarSeguimiento(seg.id);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setSeg({ ...seg, activo: false });
      setAviso(null);
    } finally {
      ocupado.current = false;
      setEstado("");
    }
  };

  const cambiarMatricula = async (prender: boolean) => {
    setMostrar(prender);
    if (!seg || !compartiendo) return;
    const r = await cambiarMatriculaVisible(seg.id, prender, f.matricula.trim());
    if ("error" in r) {
      setMostrar(!prender);
      setError(r.error);
    } else {
      setSeg({ ...seg, mostrarMatricula: prender });
    }
  };

  const interruptor = (
    <label className={`mt-3 flex items-center justify-between gap-3 text-xs ${f.matricula.trim() ? "cursor-pointer" : "opacity-50"}`}>
      <span className="text-zinc-700 dark:text-white/80">
        Mostrar la matrícula
        <span className="block text-[11px] text-zinc-500 dark:text-white/50">
          {!f.matricula.trim() ? "Cargá la matrícula (casilla 7) para poder mostrarla." : mostrar ? "Prendido: el link muestra la matrícula." : "Apagado: el link dice el modelo, no la matrícula."}
        </span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={mostrar}
        disabled={!f.matricula.trim()}
        onChange={(e) => void cambiarMatricula(e.target.checked)}
        className="relative h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full bg-zinc-300 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform checked:bg-aviation-cyan checked:after:translate-x-4 disabled:cursor-not-allowed dark:bg-white/20"
      />
    </label>
  );

  // Terminó por aterrizaje (ADS-B lo vio tocar tierra).
  const aterrizo = seg && !seg.activo && seg.aterrizoAt ? seg : null;

  if (!compartiendo) {
    return (
      <div>
        {aterrizo && (
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            <Check className="h-4 w-4 shrink-0 text-emerald-600" />
            Aterrizó a las {horaArgentina(aterrizo.aterrizoAt)} ({horaUtc(aterrizo.aterrizoAt)}). El link ya terminó.
          </p>
        )}
        <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          Mandale a tu familia un link para seguir el vuelo, <strong className="text-zinc-700 dark:text-zinc-200">sin que lleves el teléfono abierto</strong>. Antes de la salida dice
          {salida ? ` "${textoSalida(salida, ahoraIso)}"` : " a qué hora sale"}; cuando el avión despega se ve en el mapa con las posiciones ADS-B, y cuando aterriza el link termina solo.
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          Depende de que el avión transmita ADS-B y de que haya un receptor cerca: si no, el link lo dice y no inventa nada. Si después volás con el Mapa y tocás &ldquo;Compartir mi vuelo&rdquo;, se
          usa este mismo link y el GPS del teléfono se suma. Ve la ruta, el modelo del avión y el clima del destino, sin cuenta.
        </p>
        {interruptor}
        <button
          type="button"
          onClick={() => void compartir(true)}
          disabled={Boolean(motivo) || estado === "creando"}
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-aviation-cyan px-4 py-2.5 text-xs font-bold text-noche transition-colors hover:bg-sky-300 disabled:opacity-40"
        >
          {estado === "creando" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          {estado === "creando" ? "Creando el link…" : aterrizo ? "Compartir de nuevo" : "Compartir este vuelo"}
        </button>
        {motivo && <p className="mt-2 text-xs text-amber-600 dark:text-amber-300">{motivo}</p>}
        {error && <p className="mt-2 text-xs font-semibold text-red-600 dark:text-red-400">{error}</p>}
        {aviso === "copiado" && <p className="mt-2 text-xs text-zinc-500 dark:text-white/60">Link copiado.</p>}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className={`${ROTULO} flex items-center gap-2 text-aviation-blue dark:text-aviation-cyan`}>
          <span className="h-1.5 w-1.5 rounded-full bg-aviation-blue dark:bg-aviation-cyan" />
          Compartiendo
        </span>
        <div className="flex items-center gap-4">
          <button type="button" onClick={volverAMandar} className={`${ROTULO} inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-900 dark:text-white/60 dark:hover:text-white`}>
            <Copy className="h-3 w-3" /> Mandar el link
          </button>
          <button
            type="button"
            onClick={() => void dejarDeCompartir()}
            disabled={estado === "terminando"}
            className={`${ROTULO} text-red-600 hover:text-red-500 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300`}
          >
            Dejar de compartir
          </button>
        </div>
      </div>
      {seg?.salidaPrevista && <p className="mt-2 text-sm font-semibold text-zinc-800 dark:text-white">{textoSalida(seg.salidaPrevista, ahoraIso)}</p>}
      {seg && detalleDeVistas({ mirandoAhora: seg.mirandoAhora, vistosTotal: seg.vistosTotal, ultimaVistaAt: seg.ultimaVistaAt, ahora: seg.ahora }) && (
        <p className="mt-1.5 text-xs text-zinc-500 dark:text-white/70">{detalleDeVistas({ mirandoAhora: seg.mirandoAhora, vistosTotal: seg.vistosTotal, ultimaVistaAt: seg.ultimaVistaAt, ahora: seg.ahora })}</p>
      )}
      <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
        El link sigue al avión por ADS-B y termina solo cuando aterriza. Si el avión no transmite o no hay receptores cerca, dice &ldquo;sin datos&rdquo;.
      </p>
      {salidaCambio && (
        <div className="mt-2">
          <p className="text-xs text-amber-600 dark:text-amber-300">La salida del plan cambió ({textoSalida(salida, ahoraIso)}): el link todavía tiene la anterior.</p>
          <button type="button" onClick={() => void compartir(false)} disabled={estado === "creando"} className={`${ROTULO} mt-1 text-aviation-blue hover:underline disabled:opacity-50 dark:text-aviation-cyan`}>
            Actualizar el link
          </button>
        </div>
      )}
      {interruptor}
      {aviso === "copiado" && <p className="mt-2 text-xs text-zinc-500 dark:text-white/60">Link copiado.</p>}
      {aviso === "manual" && url && (
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="mt-2 w-full rounded-lg border border-zinc-200 bg-transparent px-2 py-1.5 font-mono text-xs text-zinc-700 dark:border-white/10 dark:text-white/80" />
      )}
      {error && <p className="mt-2 text-xs font-semibold text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
