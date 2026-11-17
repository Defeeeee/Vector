"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Loader2, Send } from "lucide-react";
import { cambiarDestinoSeguimiento, compartirSinPlan, terminarSeguimiento } from "@/actions/seguimiento";
import { asignarSeguidores } from "@/actions/seguidores";
import ChipsDeSeguidores from "@/components/dashboard/compartir/ChipsDeSeguidores";
import SeguidoresDelTracker from "@/components/dashboard/compartir/SeguidoresDelTracker";
import { alternarAsignado, vinculados, type Seguidor } from "@/lib/seguidores";
import CampoAerodromo from "@/components/dashboard/plan-de-vuelo/CampoAerodromo";
import { mandarLink } from "@/components/dashboard/mapa/CompartirSeguimiento";
import type { AerodromoForm } from "@/lib/formulario-plan";
import { minutosDeDuracion, sugerirDuracion, textoDeDuracion, TOPE_ACTIVOS, validarSinPlan } from "@/lib/compartir-sin-plan";
import { detalleDeVistas, urlDeSeguimiento } from "@/lib/seguimiento";
import type { SeguimientoActivo } from "@/lib/seguimientos-activos";
import type { Aircraft } from "@/types";

/**
 * "Compartir tu vuelo" (3.41.0, migración 055): los links que están andando y un formulario para
 * uno **sin plan**: origen, destino, salida y duración. La familia ve esos dos puntos con una línea
 * directa, orientativa, y —si el avión transmite ADS-B— lo ve volar.
 *
 * - La hora que se escribe es **argentina** (24 h); el server de la pantalla ya resolvió "hoy" y el
 *   texto de cada salida (invariante 1). Acá no se lee el reloj del navegador.
 * - **Sugerir, no llenar**: la duración sale de la distancia directa y la velocidad de crucero del
 *   avión, arriba del campo, y se aplica con un toque. Sin velocidad cargada, no hay sugerencia.
 * - "Cambiar el horario" de uno sin plan reabre el formulario con su `seguimiento_id`: el link es el
 *   mismo y el token no cambia, así que no hay que mandarle otro a la familia.
 * - **"Cambiar el destino"** (migración 057), en cualquier vuelo en marcha (del Mapa, de un plan o sin plan):
 *   un selector de aeródromo y listo, sin cargar la ruta ni tocar el plan guardado. Para el piloto que se
 *   desvió y aterriza en otro lado.
 * - La matrícula sólo sale si se prende "Mostrar la matrícula" (apagado por defecto).
 * - **Vector Tracker** (migración 056): "Quiénes siguen tus vuelos" invita a la familia con un link; en cada
 *   vuelo, "Lo ven en el tracker:" asigna a mano quién lo ve (por defecto ninguno; guarda al tocar), y
 *   el formulario sin plan lo hace antes de crear el link. Sin seguidores que ya entraron, no hay chips.
 */

export interface ActivoParaMostrar extends SeguimientoActivo {
  trayecto: string;
  origenTexto: string;
  salidaTexto: string | null;
  /** AAAA-MM-DD y HH:MM argentinos de la salida, para reabrir el formulario. */
  salidaFecha: string | null;
  salidaHora: string | null;
}

const ROTULO = "font-mono text-[10px] font-bold uppercase tracking-wider";
const CAMPO = "w-full rounded-xl border border-white/10 bg-transparent px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-aviation-cyan focus:outline-none";
const CLAVE_AVION = "vector-compartir-avion";

interface Resultado {
  id: string;
  token: string;
  cambio: boolean;
}

export default function CompartirTuVuelo({
  aviones,
  activos,
  hoy,
  ahoraIso,
  origenInicial,
  destinoInicial,
  seguidores,
}: {
  aviones: Aircraft[];
  /** `null`: no se pudieron leer (no se dice "no compartís nada"). */
  activos: ActivoParaMostrar[] | null;
  /** AAAA-MM-DD argentino de hoy, resuelto en el server. */
  hoy: string;
  ahoraIso: string;
  origenInicial: string;
  destinoInicial: string;
  /** Migración 056. `null`: no se pudieron leer. */
  seguidores: Seguidor[] | null;
}) {
  const [avionId, setAvionId] = useState(aviones.length === 1 ? aviones[0].id : "");
  const [origen, setOrigen] = useState<AerodromoForm | null>(null);
  const [destino, setDestino] = useState<AerodromoForm | null>(null);
  const [fecha, setFecha] = useState(hoy);
  const [hora, setHora] = useState("");
  const [duracion, setDuracion] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [editando, setEditando] = useState<ActivoParaMostrar | null>(null);
  const [estado, setEstado] = useState<"" | "creando">("");
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [terminando, setTerminando] = useState<string | null>(null);
  const formulario = useRef<HTMLFormElement>(null);
  // "Cambiar el destino": de qué vuelo, a qué aeródromo y si se está guardando.
  const [cambiandoDestino, setCambiandoDestino] = useState<string | null>(null);
  const [destinoNuevo, setDestinoNuevo] = useState<AerodromoForm | null>(null);
  const [guardandoDestino, setGuardandoDestino] = useState(false);
  // Vector Tracker: los que ya entraron, quiénes ven cada vuelo y quiénes van a ver el que se está armando.
  const entraron = useMemo(() => vinculados(seguidores ?? []), [seguidores]);
  const [asignados, setAsignados] = useState<Record<string, string[]>>({});
  const [guardandoAsignacion, setGuardandoAsignacion] = useState<string | null>(null);
  const [paraElNuevo, setParaElNuevo] = useState<string[]>([]);

  // El último avión usado (o el único). Sólo comodidad: sin `localStorage` queda el único o ninguno.
  useEffect(() => {
    try {
      const guardado = localStorage.getItem(CLAVE_AVION);
      if (guardado && aviones.some((a) => a.id === guardado)) setAvionId(guardado);
      else if (aviones.length > 0) setAvionId((actual) => actual || aviones[0].id);
    } catch {
      /* sin almacenamiento */
    }
  }, [aviones]);

  // ?origen= y ?destino=: se buscan por código y se elige el que coincide exacto.
  useEffect(() => {
    let vivo = true;
    const buscar = async (codigo: string, poner: (a: AerodromoForm) => void) => {
      if (!codigo) return;
      try {
        const res = await fetch(`/api/airports/search?q=${encodeURIComponent(codigo)}&limit=8`);
        const data = (await res.json()) as { results?: { icao: string; local?: string; name: string; label: string; lat?: number; lon?: number }[] };
        const r = (data.results ?? []).find((x) => x.icao.toUpperCase() === codigo || (x.local ?? "").toUpperCase() === codigo);
        if (vivo && r) poner({ codigo: r.icao, nombre: r.label || r.name, lat: r.lat, lon: r.lon });
      } catch {
        /* queda el campo vacío */
      }
    };
    void buscar(origenInicial, setOrigen);
    void buscar(destinoInicial, setDestino);
    return () => {
      vivo = false;
    };
  }, [origenInicial, destinoInicial]);

  const avion = aviones.find((a) => a.id === avionId) ?? null;
  const sugerencia = useMemo(() => sugerirDuracion(origen, destino, avion?.cruise_tas_kt), [origen, destino, avion]);
  const tope = activos !== null && activos.length >= TOPE_ACTIVOS && !editando;

  const empezarCambio = (s: ActivoParaMostrar) => {
    setEditando(s);
    setResultado(null);
    setError(null);
    setOrigen(s.puntos[0] ? { codigo: s.puntos[0].codigo, nombre: s.puntos[0].nombre, lat: s.puntos[0].lat, lon: s.puntos[0].lon } : null);
    const ultimo = s.puntos[s.puntos.length - 1];
    setDestino(s.puntos.length > 1 && ultimo ? { codigo: ultimo.codigo, nombre: ultimo.nombre, lat: ultimo.lat, lon: ultimo.lon } : null);
    setParaElNuevo(asignadosDe(s));
    if (s.salidaFecha) setFecha(s.salidaFecha);
    setHora(s.salidaHora ?? "");
    setDuracion(s.duracionPrevistaMin ? textoDeDuracion(s.duracionPrevistaMin) : "");
    setMostrar(s.mostrarMatricula);
    formulario.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const asignadosDe = (s: ActivoParaMostrar) => asignados[s.id] ?? s.seguidorIds;

  const alternar = async (s: ActivoParaMostrar, seguidorId: string) => {
    const antes = asignadosDe(s);
    const despues = alternarAsignado(antes, seguidorId);
    setAsignados((a) => ({ ...a, [s.id]: despues }));
    setGuardandoAsignacion(s.id);
    setError(null);
    try {
      const r = await asignarSeguidores(s.id, despues);
      if ("error" in r) {
        setAsignados((a) => ({ ...a, [s.id]: antes }));
        setError(r.error);
      } else setAsignados((a) => ({ ...a, [s.id]: r.seguidorIds }));
    } finally {
      setGuardandoAsignacion(null);
    }
  };

  const limpiar = () => {
    setParaElNuevo([]);
    setEditando(null);
    setOrigen(null);
    setDestino(null);
    setHora("");
    setDuracion("");
    setMostrar(false);
    setFecha(hoy);
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (estado) return;
    setError(null);
    setAviso(null);
    const v = validarSinPlan(
      {
        avionId,
        origen: origen && { codigo: origen.codigo, nombre: origen.nombre, lat: origen.lat, lon: origen.lon },
        destino: destino && { codigo: destino.codigo, nombre: destino.nombre, lat: destino.lat, lon: destino.lon },
        fecha,
        hora,
        duracion,
      },
      ahoraIso
    );
    if ("error" in v) {
      setError(v.error);
      return;
    }
    setEstado("creando");
    try {
      const r = await compartirSinPlan({
        aircraftId: v.datos.aircraft_id,
        origen: v.datos.origen,
        destino: v.datos.destino,
        salida: v.datos.salida,
        duracionMin: v.datos.duracion_min,
        mostrarMatricula: mostrar && Boolean(avion?.registration),
        seguimientoId: editando?.id ?? null,
      });
      if ("error" in r) {
        setError(r.error);
        return;
      }
      try {
        localStorage.setItem(CLAVE_AVION, avionId);
      } catch {
        /* nada */
      }
      // Quiénes lo ven en el tracker: recién con el vuelo creado hay un id al que asignar.
      if (entraron.length > 0 && (paraElNuevo.length > 0 || editando)) {
        const a = await asignarSeguidores(r.seguimiento.id, paraElNuevo);
        if ("error" in a) setAviso(`El link está creado, pero no se pudo guardar quiénes lo ven en el tracker: ${a.error}`);
      }
      setResultado({ id: r.seguimiento.id, token: r.seguimiento.token, cambio: Boolean(editando) });
      limpiar();
    } finally {
      setEstado("");
    }
  };

  const url = (token: string) => urlDeSeguimiento(window.location.origin, token);

  const mandar = async (token: string) => {
    setAviso(null);
    const m = await mandarLink(url(token));
    if (m === "copiado") setAviso("Link copiado.");
    else if (m === "manual") setAviso(url(token));
  };

  const copiar = async (token: string) => {
    try {
      await navigator.clipboard.writeText(url(token));
      setAviso("Link copiado.");
    } catch {
      setAviso(url(token));
    }
  };

  const guardarDestino = async (s: ActivoParaMostrar) => {
    if (!destinoNuevo || typeof destinoNuevo.lat !== "number" || typeof destinoNuevo.lon !== "number") {
      setError("Elegí un aeródromo de la lista: necesitamos saber dónde está.");
      return;
    }
    setGuardandoDestino(true);
    setError(null);
    setAviso(null);
    try {
      const r = await cambiarDestinoSeguimiento(s.id, { lat: destinoNuevo.lat, lon: destinoNuevo.lon, codigo: destinoNuevo.codigo, nombre: destinoNuevo.nombre });
      if ("error" in r) {
        setError(r.terminado ? "Ese vuelo ya terminó: no se puede cambiar el destino." : r.error);
        return;
      }
      setCambiandoDestino(null);
      setDestinoNuevo(null);
      setAviso(`Listo: el link ahora va a ${destinoNuevo.nombre || destinoNuevo.codigo}.`);
    } finally {
      setGuardandoDestino(false);
    }
  };

  const dejar = async (s: ActivoParaMostrar) => {
    setTerminando(s.id);
    setError(null);
    try {
      const r = await terminarSeguimiento(s.id);
      if ("error" in r) setError(r.error);
      setConfirmando(null);
      if (editando?.id === s.id) limpiar();
    } finally {
      setTerminando(null);
    }
  };

  return (
    <div className="space-y-10">
      <section className="space-y-4 border-t border-white/10 pt-8" aria-label="Lo que estás compartiendo">
        <p className={`${ROTULO} text-zinc-500`}>Lo que estás compartiendo</p>
        {activos === null ? (
          <p className="text-sm text-amber-300">No pudimos leer lo que estás compartiendo. Probá de nuevo en un rato.</p>
        ) : activos.length === 0 ? (
          <p className="max-w-2xl text-sm text-zinc-400">
            No estás compartiendo ningún vuelo. Armá uno acá abajo, compartí un plan desde su pantalla o tocá &ldquo;Compartir mi vuelo&rdquo; cuando volás con el Mapa.
          </p>
        ) : (
          <ul className="divide-y divide-white/10 border-y border-white/10">
            {activos.map((s) => (
              <li key={s.id} className="space-y-2 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="text-lg font-semibold text-white">{s.trayecto}</span>
                  <span className={`${ROTULO} text-aviation-cyan`}>{s.origenTexto}</span>
                </div>
                {s.salidaTexto && <p className="text-sm text-zinc-300">{s.salidaTexto}</p>}
                <p className="text-xs text-zinc-500">
                  {detalleDeVistas({ mirandoAhora: s.mirandoAhora, vistosTotal: s.vistosTotal, ultimaVistaAt: s.ultimaVistaAt, ahora: s.ahora })}
                  {s.avionTipo ? ` · ${s.avionTipo}` : ""}
                </p>
                <ChipsDeSeguidores seguidores={entraron} seleccion={asignadosDe(s)} ocupado={guardandoAsignacion === s.id} onCambio={(id) => void alternar(s, id)} />
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
                  <button type="button" onClick={() => void mandar(s.token)} className={`${ROTULO} inline-flex min-h-9 items-center gap-1.5 text-aviation-cyan hover:underline`}>
                    <Send className="h-3 w-3" /> Compartir
                  </button>
                  <button type="button" onClick={() => void copiar(s.token)} className={`${ROTULO} inline-flex min-h-9 items-center gap-1.5 text-zinc-400 hover:text-white`}>
                    <Copy className="h-3 w-3" /> Copiar el link
                  </button>
                  {s.origen === "sin-plan" && (
                    <button type="button" onClick={() => empezarCambio(s)} className={`${ROTULO} min-h-9 text-zinc-400 hover:text-white`}>
                      Cambiar el horario
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setCambiandoDestino(cambiandoDestino === s.id ? null : s.id);
                      setDestinoNuevo(null);
                      setError(null);
                    }}
                    className={`${ROTULO} min-h-9 text-zinc-400 hover:text-white`}
                  >
                    Cambiar el destino
                  </button>
                  {confirmando === s.id ? (
                    <span className="flex items-center gap-3 text-xs text-zinc-300">
                      ¿Dejar de compartir?
                      <button type="button" disabled={terminando === s.id} onClick={() => void dejar(s)} className={`${ROTULO} min-h-9 text-red-400 hover:text-red-300 disabled:opacity-50`}>
                        {terminando === s.id ? "Terminando…" : "Sí, dejar"}
                      </button>
                      <button type="button" onClick={() => setConfirmando(null)} className={`${ROTULO} min-h-9 text-zinc-400 hover:text-white`}>
                        No
                      </button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirmando(s.id)} className={`${ROTULO} min-h-9 text-red-400 hover:text-red-300`}>
                      Dejar de compartir
                    </button>
                  )}
                </div>
                {cambiandoDestino === s.id && (
                  <div className="max-w-md space-y-3 border-l-2 border-white/20 pl-4">
                    <span className={`${ROTULO} block text-zinc-500`}>Nuevo destino</span>
                    <CampoAerodromo valor={destinoNuevo} onCambio={setDestinoNuevo} placeholder="SAZT o Tandil" claseInput={CAMPO} />
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        disabled={guardandoDestino || !destinoNuevo}
                        onClick={() => void guardarDestino(s)}
                        className="inline-flex items-center gap-2 rounded-full bg-aviation-cyan px-4 py-2 text-xs font-bold text-noche transition-colors hover:bg-sky-300 disabled:opacity-40"
                      >
                        {guardandoDestino && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {guardandoDestino ? "Guardando…" : "Guardar el destino"}
                      </button>
                      <button type="button" onClick={() => { setCambiandoDestino(null); setDestinoNuevo(null); }} className={`${ROTULO} text-zinc-400 hover:text-white`}>
                        Cancelar
                      </button>
                    </div>
                    <p className="text-[11px] text-zinc-500">Cambia sólo el final del link: lo que tu familia ve. No toca tu plan de vuelo.</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {aviso && (aviso.startsWith("http") ? <input readOnly value={aviso} onFocus={(e) => e.currentTarget.select()} className="w-full rounded-xl border border-white/10 bg-transparent px-3 py-2 font-mono text-xs text-white/80" /> : <p className="text-xs text-zinc-400">{aviso}</p>)}
      </section>

      <section className="space-y-5 border-t border-white/10 pt-8" aria-label="Compartir un vuelo sin plan">
        <div className="space-y-1.5">
          <p className={`${ROTULO} text-zinc-500`}>{editando ? "Cambiar el horario" : "Compartir un vuelo sin plan"}</p>
          <p className="max-w-2xl text-sm text-zinc-400">
            {editando
              ? `Es el mismo link de ${editando.trayecto}: tu familia no tiene que recibir otro. Elegí el avión de nuevo y corregí lo que haga falta.`
              : "Para cuando no armaste un plan de vuelo: tu familia ve de dónde salís, adónde vas y a qué hora."}
          </p>
        </div>

        {resultado && (
          <div className="space-y-3 border-l-2 border-aviation-cyan pl-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-white">
              <Check className="h-4 w-4 text-emerald-400" /> {resultado.cambio ? "Listo: el link ya tiene el horario nuevo." : "Listo: este es el link."}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => void mandar(resultado.token)} className="inline-flex items-center gap-2 rounded-full bg-aviation-cyan px-4 py-2.5 text-xs font-bold text-noche transition-colors hover:bg-sky-300">
                <Send className="h-3.5 w-3.5" /> Mandar el link
              </button>
              <button type="button" onClick={() => void copiar(resultado.token)} className={`${ROTULO} inline-flex min-h-9 items-center gap-1.5 text-zinc-400 hover:text-white`}>
                <Copy className="h-3 w-3" /> Copiar
              </button>
            </div>
          </div>
        )}

        {aviones.length === 0 ? (
          <p className="text-sm text-amber-300">Para compartir un vuelo necesitás un avión en el Hangar.</p>
        ) : tope ? (
          <p className="text-sm text-amber-300">Ya estás compartiendo {TOPE_ACTIVOS} vuelos, que es el máximo. Dejá de compartir alguno para sumar otro.</p>
        ) : (
          <form ref={formulario} onSubmit={enviar} className="max-w-2xl space-y-5" noValidate>
            <label className="block space-y-1.5">
              <span className={`${ROTULO} text-zinc-500`}>Avión</span>
              <select value={avionId} onChange={(e) => setAvionId(e.target.value)} className={CAMPO}>
                <option value="" disabled>
                  Elegí el avión
                </option>
                {aviones.map((a) => (
                  <option key={a.id} value={a.id} className="bg-zinc-900">
                    {a.registration} · {a.type}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <span className={`${ROTULO} text-zinc-500`}>Salís de</span>
                <CampoAerodromo valor={origen} onCambio={setOrigen} placeholder="SADM o Morón" claseInput={CAMPO} />
              </div>
              <div className="space-y-1.5">
                <span className={`${ROTULO} text-zinc-500`}>Vas a</span>
                <CampoAerodromo valor={destino} onCambio={setDestino} placeholder="SAZS o Tandil" claseInput={CAMPO} alinear="derecha" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className={`${ROTULO} text-zinc-500`}>Día de salida</span>
                <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={CAMPO} />
              </label>
              <label className="block space-y-1.5">
                <span className={`${ROTULO} text-zinc-500`}>Hora de salida (argentina, 24 h)</span>
                <input value={hora} onChange={(e) => setHora(e.target.value)} inputMode="numeric" placeholder="09:30" maxLength={5} className={CAMPO} />
              </label>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="duracion-sin-plan" className={`${ROTULO} block text-zinc-500`}>
                Duración estimada (h:mm)
              </label>
              {sugerencia && minutosDeDuracion(duracion) !== sugerencia.minutos && (
                <button type="button" onClick={() => setDuracion(textoDeDuracion(sugerencia.minutos))} className="block text-left text-xs text-aviation-cyan hover:underline">
                  Sugerencia: {textoDeDuracion(sugerencia.minutos)} ({sugerencia.motivo}, sin viento). Tocá para usarla.
                </button>
              )}
              <input id="duracion-sin-plan" value={duracion} onChange={(e) => setDuracion(e.target.value)} inputMode="numeric" placeholder="1:30" maxLength={5} className={CAMPO} />
              {!sugerencia && avion && !avion.cruise_tas_kt && (
                <p className="text-[11px] text-zinc-500">Cargá la velocidad de crucero del {avion.registration} en el Hangar y te sugerimos la duración.</p>
              )}
            </div>

            <label className={`flex items-center justify-between gap-3 text-xs ${avion?.registration ? "cursor-pointer" : "opacity-50"}`}>
              <span className="text-white/80">
                Mostrar la matrícula
                <span className="block text-[11px] text-white/50">{mostrar ? "Prendido: el link muestra la matrícula." : "Apagado: el link dice el modelo, no la matrícula."}</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={mostrar}
                disabled={!avion?.registration}
                onChange={(e) => setMostrar(e.target.checked)}
                className="relative h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full bg-white/20 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-transform checked:bg-aviation-cyan checked:after:translate-x-4 disabled:cursor-not-allowed"
              />
            </label>

            <ChipsDeSeguidores seguidores={entraron} seleccion={paraElNuevo} onCambio={(id) => setParaElNuevo((a) => alternarAsignado(a, id))} etiqueta="Que lo vean en el tracker:" />

            <p className="text-[11px] leading-relaxed text-zinc-500">
              El link muestra origen, destino y horario, sin cuenta. La línea del mapa entre los dos es directa y sólo orientativa: no es tu ruta. Si el avión transmite ADS-B y hay un receptor
              cerca, tu familia lo ve volar y el link termina solo cuando aterriza.
            </p>

            <div className="flex flex-wrap items-center gap-4">
              <button type="submit" disabled={estado === "creando"} className="inline-flex items-center gap-2 rounded-full bg-aviation-cyan px-5 py-2.5 text-sm font-bold text-noche transition-colors hover:bg-sky-300 disabled:opacity-40">
                {estado === "creando" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {estado === "creando" ? "Creando el link…" : editando ? "Guardar el horario" : "Crear el link"}
              </button>
              {editando && (
                <button type="button" onClick={limpiar} className={`${ROTULO} text-zinc-400 hover:text-white`}>
                  Cancelar
                </button>
              )}
            </div>
            {error && <p className="text-sm font-semibold text-red-400">{error}</p>}
          </form>
        )}
      </section>

      <SeguidoresDelTracker inicial={seguidores} />
    </div>
  );
}
