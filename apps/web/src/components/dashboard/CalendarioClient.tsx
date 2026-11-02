"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Trash2, X } from "lucide-react";
import {
  createPlannedFlight,
  deletePlannedFlight,
  updatePlannedFlight,
} from "@/actions/planned-flight";
import BotonPendiente from "@/components/BotonPendiente";
import {
  aLocal,
  aUtc,
  filtrarHoraTipeada,
  normalizarHoraTipeada,
  problemaDeHoras,
  soloHoraYMinuto,
} from "@/lib/horarios";
import {
  horasDelMes,
  mesDe,
  prefillHref,
  type DiaCalendario,
} from "@/lib/planned-flights";
import type { Aircraft, Flight, PlannedFlight } from "@/types";

/**
 * La grilla del mes.
 *
 * Recibe `mesIso` y `todayIso` ya resueltos desde el server: **este componente no
 * llama a `new Date()` para decidir nada de eso**, y por lo tanto servidor y
 * navegador no pueden discrepar de día. Lo único que hace con fechas es pasárselas
 * a `mesDe`, que es puro y está testeado.
 *
 * Dos presentaciones sobre **una sola estructura de datos**: grilla en escritorio y
 * agenda en el teléfono. Abajo de `sm`, siete columnas dan celdas de ~44 px y no
 * entra "SADF SADR"; una segunda grilla calculada aparte sería un segundo cálculo
 * que mantener sincronizado.
 */

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const CARD =
  "rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none";

const INPUT =
  "w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-transparent px-3 py-2.5 text-sm text-zinc-900 dark:text-white";

interface Props {
  planned: PlannedFlight[];
  flights: Flight[];
  aircraft: Aircraft[];
  mesIso: string;
  todayIso: string;
}

export default function CalendarioClient({ planned, flights, aircraft, mesIso, todayIso }: Props) {
  /** La fecha con la que abre el alta, o `null` si está cerrada. */
  const [alta, setAlta] = useState<string | null>(null);
  const [editando, setEditando] = useState<PlannedFlight | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * Si las horas se escriben en hora local.
   *
   * **Lo guardado siempre es UTC**, igual que `flights.takeoff`: esto sólo cambia
   * lo que se ve y lo que se lee del campo. Arranca en UTC como el formulario de
   * vuelo, para que las dos pantallas digan lo mismo por defecto.
   */
  const [horaLocal, setHoraLocal] = useState(false);

  const mes = useMemo(
    () => mesDe({ mesIso, todayIso, planned, flights }),
    [mesIso, todayIso, planned, flights]
  );

  const horas = useMemo(() => horasDelMes(mes.semanas), [mes]);

  const matriculas = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of aircraft) m.set(a.id, a.registration);
    return m;
  }, [aircraft]);

  const conAlgo = useMemo(
    () => mes.semanas.flat().filter((d) => d.delMes && (d.planned.length || d.flights.length)),
    [mes]
  );

  function abrirAlta(fecha: string) {
    setError(null);
    setEditando(null);
    setAlta(fecha);
  }

  /*
    Existe para que el cartel se limpie en un solo lugar. Estaba escrito en línea y
    duplicado en la grilla y en la lista de móvil.
  */
  function abrirEdicion(p: PlannedFlight) {
    setError(null);
    setAlta(null);
    setEditando(p);
  }

  async function programar(formData: FormData) {
    setError(null);
    const mal = problemaDeHoras(
      String(formData.get("takeoff_time") || ""),
      String(formData.get("landing_time") || "")
    );
    if (mal) return setError(mal);
    const res = await createPlannedFlight(leerForm(formData, horaLocal));
    if (res && "error" in res && res.error) setError(res.error);
    else setAlta(null);
  }

  async function guardarEdicion(formData: FormData) {
    if (!editando) return;
    setError(null);
    const mal = problemaDeHoras(
      String(formData.get("takeoff_time") || ""),
      String(formData.get("landing_time") || "")
    );
    if (mal) return setError(mal);
    const res = await updatePlannedFlight(editando.id, leerForm(formData, horaLocal));
    if (res && "error" in res && res.error) setError(res.error);
    else setEditando(null);
  }

  async function borrar() {
    if (!editando) return;
    setError(null);
    const res = await deletePlannedFlight(editando.id);
    if (res && "error" in res && res.error) setError(res.error);
    else setEditando(null);
  }

  return (
    <div className="space-y-6">
      {/* Barra de mes ------------------------------------------------------ */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/calendario?mes=${mes.anterior}`}
            aria-label="Mes anterior"
            className="w-10 h-10 rounded-full border border-zinc-200 dark:border-white/10 flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-[10rem] text-center">
            <span className="font-display font-bold text-xl md:text-2xl text-zinc-900 dark:text-white block leading-tight">
              {mes.etiqueta}
            </span>
            {/* Sólo los vuelos del mes propio: ver `horasDelMes`. */}
            <span className="data text-[11px] text-zinc-400 dark:text-zinc-500">
              {horas.toFixed(1)} hs voladas
            </span>
          </div>
          <Link
            href={`/dashboard/calendario?mes=${mes.siguiente}`}
            aria-label="Mes siguiente"
            className="w-10 h-10 rounded-full border border-zinc-200 dark:border-white/10 flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        <button
          type="button"
          onClick={() => (alta ? setAlta(null) : abrirAlta(todayIso))}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-bold shadow-cal-highlight"
        >
          {alta ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {alta ? "Cancelar" : "Programar"}
        </button>
      </div>

      {error && !editando && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {/*
        Alta.

        `noValidate` a propósito: con la validación nativa activa el navegador corta el
        envío con su propio globo —"invalid value"— que no dice qué campo ni qué falta. El
        piloto ve una hora escrita y un cartel que no le sirve. Ver `avisoDeHorarios`.
      */}
      {alta && (
        <form action={programar} noValidate className={`${CARD} p-6 md:p-8 space-y-5`}>
          <Campos aircraft={aircraft} fecha={alta} horaLocal={horaLocal} onHoraLocal={setHoraLocal} />
          <BotonPendiente
            pendiente="Programando…"
            className="px-8 py-3 rounded-full bg-aviation-blue text-white text-sm font-bold"
          >
            Programar
          </BotonPendiente>
        </form>
      )}

      {/* Grilla ------------------------------------------------------------ */}
      <div className={`${CARD} p-4 md:p-6 hidden sm:block`}>
        <div className="grid grid-cols-7 gap-1.5 mb-2">
          {DIAS.map((d) => (
            <div key={d} className="eyebrow text-center py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {mes.semanas.flat().map((dia) => (
            <Celda
              key={dia.iso}
              dia={dia}
              matriculas={matriculas}
              todayIso={todayIso}
              onDia={abrirAlta}
              onPlan={abrirEdicion}
            />
          ))}
        </div>
      </div>

      {/* Agenda (teléfono) ------------------------------------------------- */}
      <div className="sm:hidden space-y-3">
        {conAlgo.length === 0 ? (
          <div className="rounded-[2rem] border border-dashed border-zinc-200 dark:border-white/10 p-10 text-center">
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">Nada este mes</h3>
            <p className="mt-1.5 text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Ni vuelos registrados ni programados.
            </p>
          </div>
        ) : (
          conAlgo.map((dia) => (
            <div key={dia.iso} className={`${CARD} p-4`}>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="data text-lg font-bold text-zinc-900 dark:text-white">{dia.dia}</span>
                <span className="eyebrow">{DIAS[(new Date(`${dia.iso}T00:00:00Z`).getUTCDay() + 6) % 7]}</span>
              </div>
              <Contenido
                dia={dia}
                matriculas={matriculas}
                todayIso={todayIso}
                onPlan={abrirEdicion}
              />
            </div>
          ))
        )}
      </div>

      <p className="text-xs text-zinc-400 dark:text-zinc-500 px-2">
        Los vuelos registrados van en sólido; los programados, con borde punteado.
        Tocá un día vacío para programar ahí, o un programado para editarlo. Un vuelo
        programado nunca suma horas.
      </p>

      {/* Edición ----------------------------------------------------------- */}
      {editando && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-6">
          <div className="w-full sm:max-w-lg bg-white dark:bg-[#111111] rounded-t-[2.5rem] sm:rounded-[2.5rem] border border-zinc-200 dark:border-white/10 p-6 md:p-8 space-y-5 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">Vuelo programado</p>
                <h3 className="text-2xl font-display font-bold text-zinc-900 dark:text-white">
                  {editando.status === "programado" ? "Editar" : "Cerrado"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditando(null)}
                aria-label="Cerrar"
                className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            <form action={guardarEdicion} noValidate className="space-y-5">
              {/*
                La `key` reinicia los horarios al pasar de un vuelo a otro. Sin ella el
                modal no se desmonta al clickear otro día y los campos —que ahora tienen
                estado propio— mostrarían los del vuelo anterior.
              */}
              <Campos
                key={editando.id}
                aircraft={aircraft}
                plan={editando}
                horaLocal={horaLocal}
                onHoraLocal={setHoraLocal}
              />
              <BotonPendiente
                pendiente="Guardando…"
                className="px-8 py-3 rounded-full bg-aviation-blue text-white text-sm font-bold"
              >
                Guardar cambios
              </BotonPendiente>
            </form>

            <div className="flex items-center justify-between gap-3 pt-4 border-t border-zinc-100 dark:border-white/5">
              {editando.status === "programado" ? (
                <Link
                  href={prefillHref(editando)}
                  className="text-sm font-bold text-aviation-blue dark:text-aviation-cyan"
                >
                  Completar como vuelo →
                </Link>
              ) : (
                <span className="text-xs text-zinc-400 dark:text-zinc-500">
                  Este plan ya está {editando.status}.
                </span>
              )}

              {/*
                Borrar es distinto de descartar: descartar deja constancia de que el
                piloto contestó "no lo volé", y el calendario lo muestra tachado.
                Esto es para el que se cargó por error, y por eso no deja rastro.

                En su propio `<form>` para que el pendiente sea el de esta acción y
                no el de guardar — y porque un form dentro de otro no es HTML válido.
              */}
              <form action={borrar}>
                <BotonPendiente
                  pendiente="Borrando…"
                  title="Borra el plan sin dejar rastro"
                  className="text-sm font-semibold text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Borrar
                </BotonPendiente>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** El mismo juego de campos para el alta y para la edición. */
function Campos({
  aircraft,
  plan,
  fecha,
  horaLocal,
  onHoraLocal,
}: {
  aircraft: Aircraft[];
  plan?: PlannedFlight;
  fecha?: string;
  horaLocal: boolean;
  onHoraLocal: (v: boolean) => void;
}) {
  /*
    Los dos horarios viven en estado, y no como campos no controlados con `defaultValue`,
    por el interruptor de UTC/local: **antes cambiar de unidad borraba lo que estaba
    escrito.** El truco era una `key` que forzaba a React a recrear el input, porque si no
    el valor se quedaba en la unidad anterior mientras el rótulo decía la nueva. Recrear el
    input arregla el rótulo tirando el dato, que es la misma pérdida silenciosa que este
    formulario ya tuvo una vez.

    Con el valor en estado el interruptor **convierte** en vez de borrar.
  */
  const inicial = (v: string | null | undefined) => {
    const utc = soloHoraYMinuto(v);
    return utc && horaLocal ? aLocal(utc) : utc;
  };
  const [despegue, setDespegue] = useState(() => inicial(plan?.takeoff_time));
  const [aterrizaje, setAterrizaje] = useState(() => inicial(plan?.landing_time));

  /*
    Cambiar de unidad. Lo escrito se corre las tres horas; lo que no sea una hora entera
    —el piloto a mitad de tipear— se deja como está, porque `correrReloj` devuelve intacto
    lo que no entiende y no hay nada que convertir todavía.
  */
  function cambiarUnidad() {
    const convertir = horaLocal ? aUtc : aLocal;
    setDespegue((v) => convertir(normalizarHoraTipeada(v)));
    setAterrizaje((v) => convertir(normalizarHoraTipeada(v)));
    onHoraLocal(!horaLocal);
  }
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <label className="space-y-1.5">
        <span className="eyebrow">Fecha</span>
        <input type="date" name="date" required defaultValue={plan?.date ?? fecha} className={INPUT} />
      </label>
      <label className="space-y-1.5">
        <span className="eyebrow">Aeronave</span>
        <select name="aircraft_id" defaultValue={plan?.aircraft_id ?? ""} className={INPUT}>
          <option value="">Sin definir</option>
          {aircraft.map((a) => (
            <option key={a.id} value={a.id}>
              {a.registration}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1.5">
        <span className="eyebrow">Ruta</span>
        <input
          type="text"
          name="route"
          placeholder="SADF SADR"
          defaultValue={plan?.route ?? ""}
          className={`${INPUT} data`}
        />
      </label>
      <label className="space-y-1.5">
        <span className="eyebrow">Nota</span>
        <input
          type="text"
          name="notes"
          placeholder="Opcional"
          defaultValue={plan?.notes ?? ""}
          className={INPUT}
        />
      </label>

      {/*
        Horarios tentativos. Van al prefill, así que completar el vuelo llega con
        los dos horarios puestos en vez de pedirlos de nuevo.
      */}
      <CampoHora
        name="takeoff_time"
        etiqueta={`Despegue ${horaLocal ? "(local)" : "(UTC)"}`}
        valor={despegue}
        onValor={setDespegue}
      />
      <CampoHora
        name="landing_time"
        etiqueta={`Aterrizaje ${horaLocal ? "(local)" : "(UTC)"}`}
        valor={aterrizaje}
        onValor={setAterrizaje}
      />

      <div className="sm:col-span-2 lg:col-span-4 flex items-center gap-3">
        <button
          type="button"
          onClick={cambiarUnidad}
          className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors underline underline-offset-4"
        >
          Escribir en hora {horaLocal ? "UTC" : "local"}
        </button>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          El libro guarda UTC; esto sólo cambia cómo lo escribís.
        </span>
      </div>
    </div>
  );
}

/**
 * Un horario del plan. **Campo de texto, no `<input type="time">`.**
 *
 * El widget nativo se sacó porque para un piloto no producía ningún valor: el vuelo se
 * guardaba con los dos horarios en `null` **teniéndolos escritos en pantalla**, y la
 * consulta a la base lo confirmó. Toda la explicación está en `normalizarHoraTipeada`.
 *
 * Lo que se gana además de que funcione: se puede tipear `1530` sin los dos puntos, que es
 * como se escribe una hora en una planilla y más rápido que pelear con un selector. El
 * `inputMode` numérico hace que en el teléfono salga el teclado de números.
 *
 * `onChange` filtra mientras se escribe —sólo dígitos y dos puntos— y `onBlur` normaliza al
 * salir del campo. Se mutan los inputs directamente porque son no controlados, igual que el
 * resto del formulario.
 */
function CampoHora({
  name,
  etiqueta,
  valor,
  onValor,
}: {
  name: string;
  etiqueta: string;
  valor: string;
  onValor: (v: string) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className="eyebrow">{etiqueta}</span>
      <input
        type="text"
        name={name}
        inputMode="numeric"
        autoComplete="off"
        placeholder="HH:MM"
        maxLength={5}
        value={valor}
        onChange={(e) => onValor(filtrarHoraTipeada(e.target.value))}
        onBlur={(e) => onValor(normalizarHoraTipeada(e.target.value))}
        className={`${INPUT} data`}
      />
    </label>
  );
}

/**
 * Lee el formulario y **normaliza las horas a UTC**, que es lo único que se guarda.
 *
 * Si el piloto está tipeando en local, lo que escribió hay que correrlo antes de
 * mandarlo. Hacerlo al revés —guardar local y convertir al mostrar— es lo que el
 * comentario de `FlightLogForm` avisa que movería todos los vuelos tres horas.
 */
function leerForm(formData: FormData, horaLocal: boolean) {
  const hora = (campo: string) => {
    /*
      `soloHoraYMinuto` no está de adorno: hay navegadores que le agregan segundos al
      `<input type="time">`, y `aUtc` devuelve intacto lo que no sea `HH:MM` — o sea que un
      `"12:30:00"` escrito en local se guardaría **sin correr las tres horas**.
    */
    const v = soloHoraYMinuto((formData.get(campo) as string) || "");
    if (!v) return null;
    return horaLocal ? aUtc(v) : v;
  };
  return {
    date: String(formData.get("date") || ""),
    aircraft_id: (formData.get("aircraft_id") as string) || null,
    route: ((formData.get("route") as string) || "").trim().toUpperCase() || null,
    notes: ((formData.get("notes") as string) || "").trim() || null,
    takeoff_time: hora("takeoff_time"),
    landing_time: hora("landing_time"),
  };
}

function Celda({
  dia,
  matriculas,
  todayIso,
  onDia,
  onPlan,
}: {
  dia: DiaCalendario;
  matriculas: Map<string, string>;
  todayIso: string;
  onDia: (iso: string) => void;
  onPlan: (p: PlannedFlight) => void;
}) {
  return (
    <div
      // El día entero es la zona de click para programar. Los chips de adentro
      // paran la propagación, así que tocar un vuelo no abre el alta.
      onClick={() => onDia(dia.iso)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onDia(dia.iso);
        }
      }}
      aria-label={`Programar un vuelo el ${dia.iso}`}
      className={`min-h-[5.5rem] rounded-xl p-1.5 border cursor-pointer transition-colors hover:border-zinc-300 dark:hover:border-white/20 ${
        dia.delMes
          ? "border-zinc-100 dark:border-white/5"
          : "border-transparent bg-zinc-50/50 dark:bg-white/[0.01]"
      }`}
    >
      <div
        className={`data text-[11px] mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
          dia.esHoy
            ? "ring-2 ring-aviation-blue dark:ring-aviation-cyan text-zinc-900 dark:text-white font-bold"
            : dia.delMes
              ? "text-zinc-500 dark:text-zinc-400"
              : "text-zinc-300 dark:text-zinc-700"
        }`}
      >
        {dia.dia}
      </div>
      <Contenido dia={dia} matriculas={matriculas} todayIso={todayIso} onPlan={onPlan} />
    </div>
  );
}

/**
 * Lo que pasó y lo que se planea, en el mismo día.
 *
 * El vuelo registrado es un hecho: relleno sólido, y linkea a la bitácora. El
 * programado es una intención: borde punteado, que es el vocabulario que la app ya
 * usa para lo pendiente, y abre el panel de edición. El programado que ya pasó y
 * sigue sin contestar lleva ámbar — nunca rojo, porque un plan sin confirmar no es
 * una infracción.
 */
function Contenido({
  dia,
  matriculas,
  todayIso,
  onPlan,
}: {
  dia: DiaCalendario;
  matriculas: Map<string, string>;
  todayIso: string;
  onPlan: (p: PlannedFlight) => void;
}) {
  return (
    <div className="space-y-1">
      {dia.flights.map((f) => (
        <Link
          key={f.id}
          href="/dashboard/history"
          onClick={(e) => e.stopPropagation()}
          title={`${f.route} · ${f.duration} hs`}
          className="block data text-[10px] leading-tight truncate px-1.5 py-1 rounded-md bg-zinc-900 dark:bg-white/90 text-white dark:text-zinc-900"
        >
          {f.route}
        </Link>
      ))}
      {dia.planned.map((p) => {
        const vencido = p.status === "programado" && p.date < todayIso;
        const cerrado = p.status !== "programado";
        return (
          <button
            key={p.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPlan(p);
            }}
            title={p.notes || p.route || "Vuelo programado"}
            className={`w-full text-left data text-[10px] leading-tight truncate px-1.5 py-1 rounded-md border border-dashed ${
              cerrado
                ? "border-zinc-200 dark:border-white/10 text-zinc-300 dark:text-zinc-600 line-through"
                : vencido
                  ? "border-amber-500/40 text-amber-600 dark:text-amber-500"
                  : "border-zinc-300 dark:border-white/20 text-zinc-500 dark:text-zinc-400"
            }`}
          >
            {soloHoraYMinuto(p.takeoff_time) && (
              <span className="opacity-70">{soloHoraYMinuto(p.takeoff_time)} </span>
            )}
            {p.route || (p.aircraft_id && matriculas.get(p.aircraft_id)) || "Programado"}
          </button>
        );
      })}
    </div>
  );
}
