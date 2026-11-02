"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import type { Aircraft } from "@/types";
import type { FlightPrefill } from "@/lib/prefill";
import { addAircraft, logFlight } from "@/actions/flight";
import { calculateFlightDuration } from "@/lib/utils";
import { aLocal, aUtc } from "@/lib/horarios";
import SugerenciaAdsb from "@/components/dashboard/SugerenciaAdsb";
import { useAvisos } from "@/components/dashboard/Avisos";

/**
 * Registrar un vuelo, versión alumno piloto (Federico, 2026-09-24).
 *
 * El alumno no tiene libro de vuelo, así que no necesita el desglose ANAC, la finalidad
 * ni el libro: fecha, horarios, aterrizajes y avión. El tiempo sale de los horarios con
 * la misma regla que el formulario completo (`calculateFlightDuration`, el cuadro
 * centesimal).
 *
 * Tres elecciones, porque las pide el camino a la PPA (RAAC 61.520(a)):
 * - **Con instructor / Solo**: doble mando (finalidad INST) o vuelo solo (ENT).
 * - **Día / Noche**: la instrucción nocturna y sus aterrizajes.
 * - **Local / Travesía**: en local, un aeródromo o ninguno (queda "LOCAL"); en
 *   travesía, los dos. La ruta no es obligatoria para un local.
 *
 * Los horarios se escriben en hora local y se guardan en UTC, como en el formulario
 * completo (`lib/horarios.ts`).
 */

const CODIGO = /^[A-Z0-9]{3,4}$/;
const campo =
  "w-full bg-transparent border border-zinc-200 dark:border-white/10 rounded-2xl py-3.5 px-4 outline-none focus:border-zinc-900 dark:focus:border-white/50 text-zinc-900 dark:text-white font-semibold placeholder:text-zinc-400 dark:placeholder:text-zinc-600";

function Selector<T extends string>({ opciones, valor, alCambiar }: { opciones: [T, string][]; valor: T; alCambiar: (v: T) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-zinc-100 dark:bg-white/5">
      {opciones.map(([v, etiqueta]) => (
        <button
          key={v}
          type="button"
          onClick={() => alCambiar(v)}
          className={`rounded-xl py-2.5 text-sm font-semibold transition-colors ${
            valor === v ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm" : "text-zinc-500 dark:text-zinc-400"
          }`}
        >
          {etiqueta}
        </button>
      ))}
    </div>
  );
}

export default function VueloAlumnoForm({
  aircraft,
  todayIso,
  inicial,
  planVueloId,
}: {
  aircraft: Aircraft[];
  todayIso: string;
  /** Lo que viene de un plan de vuelo ya volado (`lib/plan-cierre.ts`): avión, ruta y fecha. */
  inicial?: FlightPrefill;
  planVueloId?: string;
}) {
  const router = useRouter();
  const { notificar } = useAvisos();
  const [pendiente, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const aviones = useMemo(() => aircraft.filter((a) => !a.is_simulator), [aircraft]);
  const [origenInicial, destinoInicial] = (inicial?.route ?? "").split(" ");
  const [fecha, setFecha] = useState(inicial?.date ?? todayIso);
  const [salida, setSalida] = useState("");
  const [llegada, setLlegada] = useState("");
  const [aterrizajes, setAterrizajes] = useState("1");
  const [avionId, setAvionId] = useState(
    (inicial?.aircraft_id && aviones.some((a) => a.id === inicial.aircraft_id) ? inicial.aircraft_id : null) ?? aviones[0]?.id ?? ""
  );
  const [conInstructor, setConInstructor] = useState<"si" | "no">("si");
  const [momento, setMomento] = useState<"dia" | "noche">("dia");
  const [tipo, setTipo] = useState<"local" | "travesia">(origenInicial && destinoInicial && origenInicial !== destinoInicial ? "travesia" : "local");
  const [desde, setDesde] = useState(origenInicial ?? "");
  const [hasta, setHasta] = useState(origenInicial !== destinoInicial ? (destinoInicial ?? "") : "");

  // Alta rápida de un avión, sin ir al Hangar.
  const [agregando, setAgregando] = useState(aviones.length === 0);
  const [matricula, setMatricula] = useState("");
  const [modelo, setModelo] = useState("");
  const [matriculaNueva, setMatriculaNueva] = useState<string | null>(null);
  useEffect(() => {
    if (!matriculaNueva) return;
    const nuevo = aviones.find((a) => a.registration?.toUpperCase() === matriculaNueva);
    if (nuevo) {
      setAvionId(nuevo.id);
      setMatriculaNueva(null);
    }
  }, [aviones, matriculaNueva]);

  const horas = salida && llegada ? calculateFlightDuration(salida, llegada) : 0;

  function agregarAvion() {
    setError(null);
    const m = matricula.trim().toUpperCase();
    const t = modelo.trim();
    if (!m || !t) {
      setError("Completá la matrícula y el modelo del avión.");
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("registration", m);
      fd.set("type", t);
      fd.set("icao", t.toUpperCase().replace(/\s+/g, "").slice(0, 4));
      try {
        await addAircraft(fd);
        setMatriculaNueva(m);
        setAgregando(false);
        setMatricula("");
        setModelo("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo agregar el avión.");
      }
    });
  }

  function guardar() {
    setError(null);
    if (!avionId) return setError("Elegí el avión.");
    if (horas <= 0) return setError("Completá la hora de salida y la de llegada.");
    const origen = desde.trim().toUpperCase();
    const destino = hasta.trim().toUpperCase();
    if (tipo === "travesia" && (!CODIGO.test(origen) || !CODIGO.test(destino))) {
      return setError("En una travesía poné los dos aeródromos, con su código (ej. SADF y SAZS).");
    }
    if (tipo === "local" && origen && !CODIGO.test(origen)) {
      return setError("El aeródromo va con su código, por ejemplo SADF. También podés dejarlo vacío.");
    }
    const ruta = tipo === "travesia" ? `${origen} ${destino}` : origen ? `${origen} ${origen}` : "LOCAL";
    const columna = `pic_${momento === "dia" ? "day" : "night"}_${tipo === "travesia" ? "tra" : "loc"}`;

    startTransition(async () => {
      const fd = new FormData();
      fd.set("aircraft_id", avionId);
      fd.set("date", fecha);
      fd.set("takeoff", aUtc(salida));
      fd.set("landing", aUtc(llegada));
      fd.set("duration", horas.toFixed(1));
      fd.set("landings", String(Math.max(0, parseInt(aterrizajes, 10) || 0)));
      fd.set("route", ruta);
      fd.set("purpose", conInstructor === "si" ? "INST" : "ENT");
      fd.set(columna, horas.toFixed(1));
      if (planVueloId) fd.set("plan_vuelo_id", planVueloId);
      const r = await logFlight(fd);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      notificar({
        tipo: "exito",
        titulo: "Vuelo cargado",
        detalle: [ruta === "LOCAL" ? "Local" : ruta.replace(" ", " → "), `${horas.toFixed(1)} h`, conInstructor === "si" ? "con instructor" : "solo"].join(" · "),
      });
      router.replace(r.id ? `/dashboard/history?nuevo=${encodeURIComponent(r.id)}` : "/dashboard/history");
    });
  }

  return (
    <div className="max-w-xl space-y-6 rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none p-6 md:p-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="space-y-2 sm:col-span-2">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 ml-1">Fecha</span>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={`${campo} [color-scheme:light] dark:[color-scheme:dark]`} />
        </label>
        <label className="space-y-2">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 ml-1">Salida (hora local)</span>
          <input type="time" value={salida} onChange={(e) => setSalida(e.target.value)} className={`${campo} [color-scheme:light] dark:[color-scheme:dark]`} />
        </label>
        <label className="space-y-2">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 ml-1">Llegada (hora local)</span>
          <input type="time" value={llegada} onChange={(e) => setLlegada(e.target.value)} className={`${campo} [color-scheme:light] dark:[color-scheme:dark]`} />
        </label>
      </div>

      {/* Lo que vio ADS-B ese día con ese avión (2.30.0). Este formulario va en hora local. */}
      <SugerenciaAdsb
        aircraftId={avionId}
        matricula={aviones.find((a) => a.id === avionId)?.registration}
        fecha={fecha}
        onAplicar={(v) => setAterrizajes(String(v.aterrizajes))}
        onUsarHoras={(v) => {
          setSalida(aLocal(v.takeoffUtc));
          setLlegada(aLocal(v.landingUtc));
        }}
      />

      <div className="rounded-2xl bg-zinc-50 dark:bg-white/[0.03] px-5 py-4 flex items-baseline justify-between">
        <span className="text-sm text-zinc-500 dark:text-zinc-400">Tiempo de vuelo</span>
        <span className="data text-2xl font-bold text-zinc-900 dark:text-white">{horas > 0 ? `${horas.toFixed(1).replace(".", ",")} h` : "—"}</span>
      </div>

      <div className="space-y-2">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 ml-1">Avión</span>
        {!agregando && aviones.length > 0 ? (
          <div className="flex gap-2">
            <select value={avionId} onChange={(e) => setAvionId(e.target.value)} className={`${campo} flex-1`}>
              {aviones.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.registration} · {a.type}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => setAgregando(true)} className="shrink-0 rounded-2xl border border-zinc-200 dark:border-white/10 px-4 text-zinc-700 dark:text-zinc-300" aria-label="Agregar avión">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
            <input value={matricula} onChange={(e) => setMatricula(e.target.value)} placeholder="Matrícula, ej. LV-ABC" className={`${campo} uppercase`} />
            <input value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="Modelo, ej. C152" className={campo} />
            <button type="button" onClick={agregarAvion} disabled={pendiente} className="rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold text-sm px-5 py-3 disabled:opacity-50">
              Agregar
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 ml-1">¿Con quién?</span>
          <Selector opciones={[["si", "Con instructor"], ["no", "Solo"]]} valor={conInstructor} alCambiar={setConInstructor} />
        </div>
        <div className="space-y-2">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 ml-1">¿Cuándo?</span>
          <Selector opciones={[["dia", "De día"], ["noche", "De noche"]]} valor={momento} alCambiar={setMomento} />
        </div>
      </div>

      <div className="space-y-3">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 ml-1">Tipo de vuelo</span>
        <Selector opciones={[["local", "Local"], ["travesia", "Travesía"]]} valor={tipo} alCambiar={setTipo} />
        {tipo === "local" ? (
          <input value={desde} onChange={(e) => setDesde(e.target.value)} maxLength={4} placeholder="Aeródromo (opcional), ej. SADF" className={`${campo} uppercase`} />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <input value={desde} onChange={(e) => setDesde(e.target.value)} maxLength={4} placeholder="Desde, ej. SADF" className={`${campo} uppercase`} />
            <input value={hasta} onChange={(e) => setHasta(e.target.value)} maxLength={4} placeholder="Hasta, ej. SAZS" className={`${campo} uppercase`} />
          </div>
        )}
      </div>

      <label className="block space-y-2 max-w-[10rem]">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 ml-1">Aterrizajes</span>
        <input type="number" min={0} value={aterrizajes} onChange={(e) => setAterrizajes(e.target.value)} className={campo} />
      </label>

      {error && <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="button"
        onClick={guardar}
        disabled={pendiente}
        className="w-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold text-sm py-5 rounded-2xl disabled:opacity-50 flex items-center justify-center"
      >
        {pendiente ? <Loader2 className="w-5 h-5 animate-spin" /> : "Guardar vuelo"}
      </button>
    </div>
  );
}
