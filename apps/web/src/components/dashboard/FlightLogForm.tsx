"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AUTORIDADES_CAD } from "@/lib/cad";
import { useRouter } from "next/navigation";
import { Aircraft, AirportRef, Logbook } from "@/types";
import { logFlight } from "@/actions/flight";
import { pasarVueloAlCad } from "@/actions/cad-vector";
import { esErrorDeRedirect } from "@/lib/redirect-error";
import { useAvisos } from "./Avisos";
import { aLocal, aUtc } from "@/lib/horarios";
import SugerenciaAdsb from "@/components/dashboard/SugerenciaAdsb";
import { ArrowRight, Loader2, Compass, User, MonitorPlay, AlertCircle, Percent, Minus, Plus, SlidersHorizontal, ChevronRight, ChevronLeft } from "lucide-react";
import {
  calculateBlockMinutes,
  calculateFlightDuration,
  formatBlockTime,
} from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import AirportResolver from "./AirportResolver";
import StyledSelect from "./StyledSelect";
import TimeAllocator, { TimeCategory } from "./TimeAllocator";
import { useAnacBreakdown } from "@/hooks/useAnacBreakdown";
import { splitRoute } from "@/lib/route";
import {
  RUTA_SIMULADOR,
  duracionQueSeGuarda,
  esAeronaveSimulador,
  normalizarRutaSimulador,
} from "@/lib/simulador";
import { legDistanceNm } from "@/lib/distance";

const PURPOSE_OPTIONS = [
  { value: "ACR", label: "ACR – Acrobacia" },
  { value: "ADAP", label: "ADAP – Adaptación" },
  { value: "AER", label: "AER – Aeroaplicación" },
  { value: "CI", label: "CI – Combate contra Incendios" },
  { value: "ENT", label: "ENT – Entrenamiento" },
  { value: "EXA", label: "EXA – Examen" },
  { value: "FOR", label: "FOR – Formación" },
  { value: "FOT", label: "FOT – Fotografía" },
  { value: "I", label: "I – Instructor (Impartición Instrucción)" },
  { value: "INST", label: "INST – Instrucción (Recepción Instrucción)" },
  { value: "IP", label: "IP – Inspector (Inspección de Pilotos o Alumnos)" },
  { value: "LA", label: "LA – Línea Aérea (RAAC 121)" },
  { value: "LP", label: "LP – Lanzamiento Paracaidistas" },
  { value: "N", label: "N – Transporte Aéreo no Regular (RAAC 135)" },
  { value: "PA", label: "PA – Prueba de Aeronaves" },
  { value: "READ", label: "READ – Readaptación" },
  { value: "RP", label: "RP – Remolque Planeadores" },
  { value: "SAN", label: "SAN – Sanitario" },
  { value: "TA", label: "TA – Trabajo Aéreo" },
  { value: "TAXI", label: "TAXI – Taxi Aéreo" },
  { value: "VO", label: "VO – Vuelo Oficial" },
  { value: "VP", label: "VP – Vuelo Privado" },
];

const DISCOUNT_OPTIONS = [
  { value: "", label: "Sin descuento" },
  { value: "value", label: "Valor fijo ($)" },
  { value: "percent", label: "Porcentaje (%)" },
];

/** Field names below are exactly what the backend already accepts. */
const PIC_SIC_CATEGORIES: TimeCategory[] = [
  { key: "pic_day_loc", label: "PIC Día Local" },
  { key: "pic_day_tra", label: "PIC Día Travesía" },
  { key: "pic_night_loc", label: "PIC Noche Local" },
  { key: "pic_night_tra", label: "PIC Noche Travesía" },
  { key: "sic_day_loc", label: "SIC Día Local" },
  { key: "sic_day_tra", label: "SIC Día Travesía" },
  { key: "sic_night_loc", label: "SIC Noche Local" },
  { key: "sic_night_tra", label: "SIC Noche Travesía" },
];

const CONDITION_CATEGORIES: TimeCategory[] = [
  { key: "imc_pil", label: "IMC Piloto" },
  { key: "imc_cop", label: "IMC Copiloto" },
  { key: "capota", label: "Capota" },
  { key: "sim_instructor", label: "Sim. Instrumentos" },
  { key: "sim_pil_en_inst", label: "Sim. Piloto" },
];

const PIC_SIC_KEYS = PIC_SIC_CATEGORIES.map((c) => c.key);
const CONDITION_KEYS = CONDITION_CATEGORIES.map((c) => c.key);

interface FlightLogFormProps {
  aircraft: Aircraft[];
  /**
   * The pilot's logbooks. The picker only renders when there is more than one:
   * with a single book the question has one possible answer, and the form just
   * went from 2.05 screens of scroll to 1.09 — that space is not spent on a
   * field that decides nothing.
   */
  logbooks?: Logbook[];
  initialData?: {
    aircraft_id?: string;
    route?: string;
    takeoff?: string;
    landing?: string;
    date?: string;
    landings?: number;
    duration?: string;
    discount_type?: string;
    discount_amount?: number;
    purpose?: string;
  };
  onSuccess?: () => void;
  /**
   * A dónde navegar tras guardar, cuando no hay un `onSuccess` que cierre un
   * modal — el caso de `/dashboard/log-flight` como página completa, sin
   * diálogo que cerrar. Un string y no una función porque quien renderiza esta
   * pantalla es un Server Component, y una función no cruza esa frontera.
   *
   * `router.replace` y no `push`: `logFlight` ya no hace su propio `redirect()`
   * —antes lo hacía, y ese `redirect` empujaba una entrada de historial que el
   * gesto de volver del teléfono deshacía reabriendo este mismo formulario
   * vacío—, así que el reemplazo evita dejar la carga anterior en la pila para
   * que alguien vuelva a caer en ella sin querer.
   */
  redirectTo?: string;
  /**
   * Sin la tarjeta propia: la dibuja el modal que cierra una sesión en vivo
   * (`FlightLogModal`). Hubo otro, el de Nuevo Vuelo, que además traía un
   * "Cancelar" y las acciones fijas abajo; se sacó en septiembre de 2026 junto
   * con esas dos opciones, que sólo usaba él.
   */
  inModal?: boolean;
  /**
   * El vuelo programado que esta carga cierra, si el piloto llegó por "Completar".
   *
   * Viaja como `<input type="hidden">` y no como argumento de la acción porque
   * `handleSubmit` recibe el `FormData` del form y nada más: sumarlo al payload es
   * una línea, y así `logFlight` lo encuentra igual venga de la página o del modal.
   */
  plannedId?: string;
  /** El plan de vuelo que se está registrando: `logFlight` lo une al vuelo. */
  planVueloId?: string;
  /**
   * La última autoridad certificante usada en cada finalidad (`autoridadesPorFinalidad`):
   * la que el formulario propone para el CAD. Vacío, los campos arrancan vacíos.
   */
  autoridades?: Record<string, { id: number; nombre: string }>;
  /**
   * El piloto conectó su cuenta de ANAC ("Pasar al CAD desde Vector", 2.33.0): se ofrece
   * cargarlo también en el CAD al guardar. Sin cuenta conectada no se muestra nada.
   */
  cadConectado?: boolean;
}

/** Lo último que eligió el piloto en "Cargarlo también en tu CAD", en este navegador. */
const CLAVE_AL_CAD = "vector-cad-al-registrar";

/** "INSTRUCTOR DE VUELO" → "Instructor de vuelo": la lista del CAD viene en mayúsculas. */
const comoOracion = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const OPCIONES_AUTORIDAD = AUTORIDADES_CAD.map((a) => ({ value: String(a.id), label: comoOracion(a.nombre) }));

/**
 * What actually gets stored for a typed code.
 *
 * A pilot may reach General Rodríguez as GEZ or as SRDR; both have to land on the
 * same aerodrome in the logbook, or one field's history splits in two.
 */
function canonical(code: string, airport: AirportRef | null): string {
  if (airport?.icao) return airport.icao;
  return code.trim().toUpperCase();
}

/**
 * A code that resolves is always fine. One that does not is only accepted at four
 * characters — the escape hatch for a foreign strip the directory has never heard
 * of, which is how this field behaved before ANAC designators existed.
 *
 * Three characters get no such benefit of the doubt: a three-letter code means
 * nothing except as a MADHEL designator, so one that resolves to nothing is a
 * typo. Letting it through would write a phantom aerodrome into the logbook that
 * then shows up for good in the history and in the unique-aerodrome count.
 */
function isValidCode(code: string, airport: AirportRef | null): boolean {
  if (airport) return true;
  const cleaned = code.trim().toUpperCase();
  return cleaned.length === 4 && /^[A-Z0-9]+$/.test(cleaned);
}

export default function FlightLogForm({ aircraft, logbooks = [], initialData, onSuccess, redirectTo, inModal = false, plannedId, planVueloId, autoridades = {}, cadConectado = false }: FlightLogFormProps) {
  const router = useRouter();
  const { notificar } = useAvisos();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Repetir el origen cuando la ruta trae un solo código es propio de este
  // formulario: prefija los dos campos de un circuito local. La función
  // compartida no lo hace, porque en una agregación contaría el aeródromo dos
  // veces y un vuelo local pasaría por travesía consigo mismo.
  const [rawOrigin, rawDestination] = splitRoute(initialData?.route);
  const initialOrigin = rawOrigin;
  const initialDestination = rawDestination || rawOrigin;
  const [origin, setOrigin] = useState(initialOrigin);
  const [destination, setDestination] = useState(initialDestination);
  const [originAirport, setOriginAirport] = useState<AirportRef | null>(null);
  const [destinationAirport, setDestinationAirport] = useState<AirportRef | null>(null);

  const [takeoff, setTakeoff] = useState(initialData?.takeoff || "");
  const [landing, setLanding] = useState(initialData?.landing || "");
  const [manualDuration, setManualDuration] = useState(initialData?.duration || "");
  const [landings, setLandings] = useState(initialData?.landings?.toString() || "1");
  const [aircraftId, setAircraftId] = useState(initialData?.aircraft_id || "");
  const [date, setDate] = useState(initialData?.date || new Date().toISOString().split("T")[0]);

  const [discountType, setDiscountType] = useState(initialData?.discount_type || "");
  const [discountAmount, setDiscountAmount] = useState(
    initialData?.discount_amount ? String(initialData.discount_amount) : ""
  );
  const [purpose, setPurpose] = useState(initialData?.purpose || "VP");

  /** null = follow origin/destination; set once the pilot overrides the toggle. */
  const [crossCountryOverride, setCrossCountryOverride] = useState<boolean | null>(null);

  /** Slide-over with the ANAC breakdown (sections 02 and 03). */
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const [remarks, setRemarks] = useState("");

  /*
    Quién certifica el vuelo en el CAD (opcional, migración 032). Propone la última usada
    para la finalidad, y la sigue al cambiar de finalidad hasta que el piloto la toca.
  */
  const sugerida = (p: string) => autoridades[(p || "").toUpperCase()];
  const [autoridadId, setAutoridadId] = useState(() => (sugerida(initialData?.purpose || "VP") ? String(sugerida(initialData?.purpose || "VP")!.id) : ""));
  const [autoridadNombre, setAutoridadNombre] = useState(() => sugerida(initialData?.purpose || "VP")?.nombre ?? "");
  const autoridadTocada = useRef(false);
  const [alCad, setAlCad] = useState(false);
  const [cargandoCad, setCargandoCad] = useState(false);
  useEffect(() => {
    try {
      setAlCad(localStorage.getItem(CLAVE_AL_CAD) === "1");
    } catch {
      /* sin almacenamiento, arranca apagado */
    }
  }, []);
  const elegirAlCad = (v: boolean) => {
    setAlCad(v);
    try {
      localStorage.setItem(CLAVE_AL_CAD, v ? "1" : "0");
    } catch {
      /* sin almacenamiento, no se recuerda */
    }
  };
  const [cierraHoja, setCierraHoja] = useState(false);

  /**
   * Una sesión de simulador se anota como una fila más del libro —fecha, horarios,
   * equipo— pero la columna de tiempo total va vacía y la de instrucción terrestre
   * lleva las horas. Con la marca puesta en el equipo, el formulario se acomoda solo:
   * no hay una casilla de "esto es un simu" que se pueda olvidar.
   */
  const esSimulador = esAeronaveSimulador(aircraftId, aircraft);

  /**
   * La ruta de un simulador es texto libre.
   *
   * En el libro esa columna dice `LOCAL`, que no es un aeródromo y no entra por los
   * dos campos de código: cortan en cuatro caracteres y exigen que resuelva. Esa
   * exigencia es correcta para un vuelo —impide escribir un aeródromo fantasma que
   * después queda para siempre en el directorio— y no tiene sentido acá, donde no
   * hubo despegue.
   */
  const [rutaSimulador, setRutaSimulador] = useState(RUTA_SIMULADOR);

  /**
   * Las dos columnas de simulador, en horas.
   *
   * `sim_pil_en_inst` arranca siguiendo a los horarios —2230 a 2330 son 1.0— y deja de
   * seguirlos apenas el piloto escribe algo. Es la misma idea que el prellenado de
   * "PIC Día" con el vuelo entero: el caso normal ya está escrito y corregirlo sigue
   * siendo posible.
   */
  const [simPilEnInst, setSimPilEnInst] = useState("");
  const [simInstructor, setSimInstructor] = useState("");

  /**
   * Whether the two time fields are being typed in local time.
   *
   * `takeoff`/`landing` are stored — and read by the audit engine — as the UTC
   * value the pilot typed. So this only shifts what is *displayed*: the hidden
   * inputs always post UTC. Getting that backwards would move every flight by
   * three hours and quietly break overlap detection.
   */
  const [localTime, setLocalTime] = useState(false);

  const [logbookId, setLogbookId] = useState(
    () => logbooks.find((l) => l.is_default)?.id ?? logbooks[0]?.id ?? ""
  );

  useEffect(() => {
    if (initialData?.purpose) setPurpose(initialData.purpose);
  }, [initialData?.purpose]);

  // Raw block time vs. the ANAC-rounded decimal that actually goes on the books.
  const blockMinutes = calculateBlockMinutes(takeoff, landing);
  const computedDuration = takeoff && landing ? calculateFlightDuration(takeoff, landing) : 0;
  // A hand-typed duration wins, so correcting the number stays possible.
  const total = manualDuration !== "" ? parseFloat(manualDuration) || 0 : computedDuration;

  useEffect(() => {
    if (takeoff && landing) setManualDuration("");
  }, [takeoff, landing]);

  // La conversión vive en `src/lib/horarios.ts`, con tests: el calendario de vuelos
  // programados muestra horas también, y dos copias del offset es cómo una se
  // queda vieja sin que nadie lo note.
  const toDisplay = (utc: string) => (localTime ? aLocal(utc) : utc);
  const fromDisplay = (shown: string) => (localTime ? aUtc(shown) : shown);

  // Compared canonical, not as typed: GEZ out and SRDR back is one aerodrome, so
  // it is a local flight. Comparing the keystrokes would call it travesía and
  // silently drop the time into the pic_day_tra bucket instead of pic_day_loc.
  const canonicalOrigin = canonical(origin, originAirport);
  const canonicalDestination = canonical(destination, destinationAirport);
  // Se calcula con las coordenadas que ya trae `AirportRef` — las trajo el
  // dataset de MADHEL. Null cuando algún extremo no tiene posición, que pasa
  // en varios aeródromos chicos.
  //
  // **Es información, no una regla.** No cambia el criterio de travesía: cuál es
  // la distancia a partir de la cual un vuelo deja de ser local es una pregunta
  // regulatoria, y poner un número inventado reclasificaría en silencio los
  // buckets ANAC de vuelos ya cargados. El piloto ve la distancia y decide.
  const legDistance = legDistanceNm(originAirport, destinationAirport);

  const isCrossCountry =
    crossCountryOverride ??
    (Boolean(origin) && Boolean(destination) && canonicalOrigin !== canonicalDestination);

  const remainderKey = isCrossCountry ? "pic_day_tra" : "pic_day_loc";

  const picSicKeys = useMemo(() => PIC_SIC_KEYS, []);
  const conditionKeys = useMemo(() => CONDITION_KEYS, []);

  const breakdown = useAnacBreakdown({ total, keys: picSicKeys, pooled: true, remainderKey });
  const conditions = useAnacBreakdown({ total, keys: conditionKeys, pooled: false });

  // ── Lo que se guarda cuando la fila es de simulador ───────────────────────
  //
  // La decisión de fondo —el tiempo total va en cero— vive en `src/lib/simulador.ts`
  // con sus tests, porque es la que sostiene el tracker de la licencia. Acá sólo se
  // aplica.
  const duracionAGuardar = duracionQueSeGuarda(esSimulador, total);
  const rutaAGuardar = esSimulador
    ? normalizarRutaSimulador(rutaSimulador)
    : `${canonicalOrigin} ${canonicalDestination}`.trim();

  /** Las horas de instrucción, siguiendo a los horarios hasta que el piloto escriba. */
  const horasInstruccion = simPilEnInst !== "" ? simPilEnInst : total > 0 ? total.toFixed(1) : "";
  const horasInstruccionNum = parseFloat(horasInstruccion) || 0;
  const horasInstructorNum = parseFloat(simInstructor) || 0;

  async function handleSubmit(formData: FormData) {
    setError(null);

    if (esSimulador) {
      // No se validan aeródromos: no los hay. Lo que no puede faltar es la única
      // columna que una sesión de simulador llena — sin horas ahí la fila no dice
      // nada, y como el tiempo total va en cero se guardaría un renglón vacío.
      if (horasInstruccionNum <= 0 && horasInstructorNum <= 0) {
        setError("Cargá las horas de simulador en la columna de instrucción.");
        return;
      }
    } else {
      if (!isValidCode(origin, originAirport)) {
        setError("Ingresá un aeródromo de salida válido.");
        return;
      }
      if (!isValidCode(destination, destinationAirport)) {
        setError("Ingresá un aeródromo de llegada válido.");
        return;
      }
      if (total <= 0) {
        setError("El vuelo necesita un tiempo total mayor a cero.");
        return;
      }
    }

    // El CAD pide la autoridad y su nombre en cada vuelo: sin ellos no se puede cargar.
    const vaAlCad = cadConectado && alCad;
    if (vaAlCad && (!autoridadId || !autoridadNombre.trim())) {
      setError("Para cargarlo en tu CAD, completá la autoridad certificante y su nombre (o destildá Cargarlo también en tu CAD).");
      return;
    }

    setIsPending(true);
    // The allocator can't produce an over-assigned breakdown, so there is no
    // sum check here any more — the backend still validates as a backstop.
    formData.set("route", rutaAGuardar);
    formData.set("duration", duracionAGuardar.toFixed(1));

    try {
      const resultado = await logFlight(formData);
      if ("error" in resultado) {
        setError(resultado.error);
        setIsPending(false);
        return;
      }
      /*
        La única confirmación real de que el vuelo se guardó. Antes de esto no había
        ninguna — cerrar el modal o volver a Historial no le dice al piloto que la
        carga salió bien, sólo que el formulario terminó. Con los datos que este
        mismo formulario ya tiene, sin pedirle nada más al backend.
      */
      const matricula = aircraft.find((a) => a.id === aircraftId)?.registration;
      notificar({
        tipo: "exito",
        titulo: esSimulador ? "Sesión cargada" : "Vuelo cargado",
        detalle: [
          esSimulador ? rutaAGuardar : `${canonicalOrigin} → ${canonicalDestination}`,
          `${(esSimulador ? horasInstruccionNum : duracionAGuardar).toFixed(1)} h`,
          matricula,
        ]
          .filter(Boolean)
          .join(" · "),
      });
      if (vaAlCad && resultado.id) {
        setCargandoCad(true);
        const cad = await pasarVueloAlCad(resultado.id);
        setCargandoCad(false);
        notificar(
          cad.ok
            ? { tipo: "exito", titulo: "En tu CAD", detalle: `${cad.mensaje}. Queda "Pendiente de DDJJ".` }
            : { tipo: "error", titulo: "No se cargó en el CAD", detalle: `${cad.mensaje} Podés pasarlo desde Pasar al CAD.` }
        );
      }
      if (onSuccess) onSuccess();
      else if (redirectTo) {
        // Con el id, la Bitácora ofrece compartir el vuelo recién cargado
        // (`BannerCompartirVuelo`).
        const separador = redirectTo.includes("?") ? "&" : "?";
        router.replace(resultado.id ? `${redirectTo}${separador}nuevo=${encodeURIComponent(resultado.id)}` : redirectTo);
      }
    } catch (e: any) {
      /*
        `logFlight` ya no redirige — devuelve `{error}` o `{success}`, como el
        resto de las acciones de este archivo — así que este `catch` es sólo para
        fallas de red reales. `esErrorDeRedirect` es el mismo chequeo que ya usan
        `updateFlight` y `deleteFlight` en `actions/flight.ts`, con test propio en
        `redirect-error.test.ts`: si alguna vez vuelve a haber un redirect en el
        camino, tiene que llegar al `RedirectBoundary` en vez de pintarse acá como
        si el vuelo no se hubiera guardado.
      */
      if (esErrorDeRedirect(e)) throw e;
      setError(e.message || "Error al registrar el vuelo");
      setIsPending(false);
    }
  }

  const ledgerInput =
    "w-full bg-transparent border-b-2 border-zinc-200 dark:border-white/10 focus:border-zinc-900 dark:focus:border-white py-2 text-sm font-semibold text-zinc-900 dark:text-white outline-none transition-colors placeholder:text-zinc-300 dark:placeholder:text-zinc-700";

  return (
    <form 
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit(new FormData(e.currentTarget));
      }} 
      className="w-full"
    >
      {/* Lo que después cierra el vuelo programado. Ver `logFlight`. */}
      {plannedId && <input type="hidden" name="planned_id" value={plannedId} />}
      {planVueloId && <input type="hidden" name="plan_vuelo_id" value={planVueloId} />}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{ opacity: 1, height: "auto", marginBottom: 24 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
            className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-[2rem] p-6 flex items-center space-x-4 text-red-600 dark:text-red-500 shadow-sm overflow-hidden"
          >
            <AlertCircle className="w-6 h-6 flex-shrink-0" />
            <p className="text-sm font-medium leading-relaxed">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* On the page this is the card, and `overflow-hidden` clips its rounded
          corners. Inside a dialog the dialog draws its own card, so this box
          stays bare. */}
      <div
        className={`${
          inModal
            ? ""
            : "bg-white dark:bg-[#111111] border border-zinc-200 dark:border-white/10 rounded-3xl md:rounded-[2.5rem] shadow-cal dark:shadow-none overflow-hidden"
        } flex flex-col transition-colors`}
      >
        {!inModal && (
          <div className="p-6 md:p-8 border-b border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5 flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="text-lg md:text-xl font-bold font-display text-zinc-900 dark:text-white tracking-tight">
                Nueva entrada
              </h3>
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Bitácora electrónica</p>
            </div>
            <div className="w-10 h-10 md:w-12 md:h-12 bg-white dark:bg-[#111111] rounded-xl md:rounded-2xl flex items-center justify-center shadow-sm border border-zinc-200 dark:border-white/10 transition-colors">
              <Compass className="w-5 h-5 md:w-6 md:h-6 text-zinc-900 dark:text-white" />
            </div>
          </div>
        )}

        <div className={`${inModal ? "p-0" : "p-6 md:p-8"} space-y-8 md:space-y-10`}>
          {/* 01. General */}
          <div className="space-y-6">
            <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">01. Información general</p>

            {/* Two columns from `lg` up. Below that it stays a single stack:
                on a phone side-by-side fields would each be ~150px wide, and a
                time input does not fit in that. */}
            <div className="lg:grid lg:grid-cols-2 lg:gap-x-10 lg:items-start space-y-6 lg:space-y-0">
              {/* Left column — the flight itself. */}
              <div className="space-y-6">
            {/* Route — two resolving chips joined by an arrow, or, on a simulator,
                the one free-text column the paper book has. */}
            <div className="space-y-4">
              {esSimulador ? (
                <LedgerField label="Ruta">
                  <input
                    value={rutaSimulador}
                    onChange={(e) => setRutaSimulador(e.target.value.toUpperCase())}
                    maxLength={20}
                    placeholder={RUTA_SIMULADOR}
                    className={`${ledgerInput} uppercase`}
                  />
                </LedgerField>
              ) : (
                <div className="flex items-start gap-3 md:gap-4">
                  <div className="flex-1 min-w-0">
                    <AirportResolver
                      label="Salida"
                      lad
                      value={origin}
                      onChange={setOrigin}
                      onResolve={setOriginAirport}
                      placeholder="SADM"
                    />
                  </div>
                  <ArrowRight className="w-5 h-5 text-zinc-300 dark:text-zinc-600 shrink-0 mt-9" />
                  <div className="flex-1 min-w-0">
                    <AirportResolver
                      label="Llegada"
                      lad
                      value={destination}
                      onChange={setDestination}
                      onResolve={setDestinationAirport}
                      placeholder="SAEZ"
                    />
                  </div>
                </div>
              )}
              {/* Canonical, matching what handleSubmit sets. It overwrites this
                  field anyway, so a raw value here would never reach the server —
                  but a hidden input that disagrees with what gets posted is the
                  kind of thing someone debugs for an hour. */}
              <input type="hidden" name="route" value={rutaAGuardar} />

              {/* Auto-set from the two codes, but still the pilot's call. En un
                  simulador no hay travesía posible: no se recorrió distancia. */}
              {!esSimulador && (
                <div className="flex items-center gap-2">
                  <SegmentToggle
                    active={!isCrossCountry}
                    onClick={() => setCrossCountryOverride(false)}
                    label="Local"
                  />
                  <SegmentToggle
                    active={isCrossCountry}
                    onClick={() => setCrossCountryOverride(true)}
                    label="Travesía"
                  />
                  {legDistance !== null && legDistance > 0 && (
                    <span className="text-[10px] font-bold data text-zinc-400 dark:text-zinc-500 uppercase tracking-wide">
                      {legDistance} NM
                    </span>
                  )}
                  {crossCountryOverride !== null && (
                    <button
                      type="button"
                      onClick={() => setCrossCountryOverride(null)}
                      className="text-[10px] font-semibold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 uppercase tracking-wide"
                    >
                      Auto
                    </button>
                  )}
                </div>
              )}
            </div>

              {/* Times sit with the route because together they *are* the
                  flight: where it went and how long it took. The right column
                  is everything that classifies it. */}

              {/* The stored value is always UTC — these two hidden inputs are
                  what actually posts. The visible fields only change what the
                  pilot reads, so flipping the toggle can never move a flight. */}
              <input type="hidden" name="takeoff" value={takeoff} />
              <input type="hidden" name="landing" value={landing} />

              <div className="flex items-center gap-1.5">
                <SegmentToggle active={!localTime} onClick={() => setLocalTime(false)} label="UTC" />
                <SegmentToggle active={localTime} onClick={() => setLocalTime(true)} label="Local (−3)" />
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-6">
                <LedgerField label={localTime ? "Hora de salida (local)" : "Hora de salida (UTC)"}>
                  <input
                    type="time"
                    required
                    value={toDisplay(takeoff)}
                    onChange={(e) => setTakeoff(fromDisplay(e.target.value))}
                    className={`${ledgerInput} [color-scheme:light] dark:[color-scheme:dark]`}
                  />
                </LedgerField>

                <LedgerField label={localTime ? "Hora de llegada (local)" : "Hora de llegada (UTC)"}>
                  <input
                    type="time"
                    required
                    value={toDisplay(landing)}
                    onChange={(e) => setLanding(fromDisplay(e.target.value))}
                    className={`${ledgerInput} [color-scheme:light] dark:[color-scheme:dark]`}
                  />
                </LedgerField>
              </div>

              {/* Lo que vio ADS-B ese día con ese avión (2.30.0): los aterrizajes con un toque, y las
                  horas en el aire como referencia (se anotan las de tacómetro). */}
              {!esSimulador && (
                <SugerenciaAdsb
                  aircraftId={aircraftId}
                  matricula={aircraft.find((a) => a.id === aircraftId)?.registration}
                  fecha={date}
                  onAplicar={(v) => setLandings(String(v.aterrizajes))}
                  onUsarHoras={(v) => {
                    setTakeoff(v.takeoffUtc);
                    setLanding(v.landingUtc);
                  }}
                />
              )}

              {/* Block time vs. ANAC time — the distinction the old single
                  "Tiempo (h)" field hid. En un simulador la columna del total va
                  vacía, así que en vez del editor se explica por qué. */}
              {esSimulador ? (
                <>
                  <SesionDeSimulador duracion={total} />
                  {/* `handleSubmit` lo vuelve a poner igual. Está acá para que el
                      formulario diga por sí solo lo que manda: el `duration` de
                      `TimeSummary` no se monta en este modo, y un campo que sólo
                      existe dentro de la función es el que después nadie encuentra. */}
                  <input type="hidden" name="duration" value={duracionAGuardar.toFixed(1)} />
                </>
              ) : (
                <TimeSummary
                  blockMinutes={blockMinutes}
                  total={total}
                  manualDuration={manualDuration}
                  onManualDuration={setManualDuration}
                />
              )}
            </div>

            {/* Right column — what classifies the flight. */}
            <div className="space-y-6">
              <LedgerField label="Aeronave">
                <StyledSelect
                  name="aircraft_id"
                  required
                  value={aircraftId}
                  onChange={setAircraftId}
                  placeholder="Seleccionar aeronave..."
                  options={aircraft.map((ac) => ({
                    value: ac.id,
                    label: ac.registration,
                    hint: ac.type,
                  }))}
                />
              </LedgerField>

              <LedgerField label="Finalidad">
                <StyledSelect
                  name="purpose"
                  required
                  searchable
                  value={purpose}
                  onChange={(p) => {
                    setPurpose(p);
                    if (!autoridadTocada.current) {
                      const a = sugerida(p);
                      setAutoridadId(a ? String(a.id) : "");
                      setAutoridadNombre(a?.nombre ?? "");
                    }
                  }}
                  placeholder="Seleccionar finalidad..."
                  options={PURPOSE_OPTIONS}
                />
              </LedgerField>

              {logbooks.length > 1 && (
                <LedgerField label="Libro de vuelo">
                  <StyledSelect
                    name="logbook_id"
                    required
                    value={logbookId}
                    onChange={setLogbookId}
                    placeholder="Seleccionar libro..."
                    options={logbooks.map((l) => ({ value: l.id, label: l.name }))}
                  />
                </LedgerField>
              )}

              <div className="grid grid-cols-2 gap-x-6 gap-y-6">
                <LedgerField label="Fecha">
                  <input
                    type="date"
                    name="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className={`${ledgerInput} [color-scheme:light] dark:[color-scheme:dark]`}
                  />
                </LedgerField>

                {/* Un simulador no aterriza. Contarle un aterrizaje inflaría el
                    requisito de aterrizajes nocturnos con uno que nunca pasó. */}
                {!esSimulador && (
                  <LedgerField label="Aterrizajes">
                    <LandingsStepper value={landings} onChange={setLandings} />
                  </LedgerField>
                )}
                {esSimulador && <input type="hidden" name="landings" value="0" />}
              </div>

              {/* The paper ANAC logbook has an observations column and Vector
                  had nowhere to write one. Kept last and unlabelled-optional:
                  most flights never need it. */}
              <LedgerField label="Observaciones">
                <textarea
                  name="remarks"
                  rows={2}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Opcional — instrucción, desvío, algo para acordarte"
                  className={`${ledgerInput} resize-none`}
                />
              </LedgerField>

              {/* La autoridad certificante para el CAD de ANAC: opcional. Si se carga acá, el
                  panel de "Pasar al CAD" ya la tiene. Desde la 2.33.0 también va en un simulador. */}
              {(
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-6">
                    <LedgerField label="Autoridad para el CAD">
                      <StyledSelect
                        name="cad_autoridad_id"
                        searchable
                        value={autoridadId}
                        onChange={(v) => {
                          autoridadTocada.current = true;
                          setAutoridadId(v);
                        }}
                        placeholder="Opcional"
                        options={OPCIONES_AUTORIDAD}
                      />
                    </LedgerField>
                    <LedgerField label="Nombre y apellido">
                      <input
                        name="cad_autoridad_nombre"
                        value={autoridadNombre}
                        maxLength={120}
                        onChange={(e) => {
                          autoridadTocada.current = true;
                          setAutoridadNombre(e.target.value);
                        }}
                        placeholder="Opcional — quien certifica el vuelo"
                        className={ledgerInput}
                      />
                    </LedgerField>
                  </div>
                  <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                    El CAD de ANAC la pide en cada vuelo. Si la cargás acá, la tenés lista para pasarlo.
                  </p>
                  {cadConectado && (
                    <label className="flex items-start gap-3 cursor-pointer rounded-2xl border border-aviation-blue/20 dark:border-aviation-cyan/20 bg-aviation-blue/[0.04] dark:bg-aviation-cyan/[0.05] px-4 py-3">
                      <input
                        type="checkbox"
                        checked={alCad}
                        onChange={(e) => elegirAlCad(e.target.checked)}
                        className="mt-0.5 w-4 h-4 shrink-0 accent-zinc-900 dark:accent-white"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-zinc-900 dark:text-white">Cargarlo también en tu CAD</span>
                        <span className="block text-[12px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                          Con tu cuenta de ANAC conectada. Queda &quot;Pendiente de DDJJ&quot;: la declaración la hacés vos.
                        </span>
                      </span>
                    </label>
                  )}
                </div>
              )}

              {/* En el libro de papel a veces se cierra la hoja antes de llenarla (para
                  foliar, para certificar): este vuelo pasa a ser su último renglón, y en el
                  PDF lo que queda en blanco se tacha. Ver `lib/libro-anac.ts`. */}
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="cierra_hoja"
                  value="true"
                  checked={cierraHoja}
                  onChange={(e) => setCierraHoja(e.target.checked)}
                  className="mt-0.5 w-4 h-4 shrink-0 accent-zinc-900 dark:accent-white"
                />
                <span>
                  <span className="block text-sm font-semibold text-zinc-900 dark:text-white">
                    Cerrar la hoja del libro después de este vuelo
                  </span>
                  <span className="block text-[12px] text-zinc-500 dark:text-zinc-400">
                    El próximo empieza hoja nueva. En el PDF, lo que quede en blanco se tacha.
                  </span>
                </span>
              </label>
            </div>
          </div>
        </div>

          {/* 02 and 03 side by side too: both are short now, and stacking two
              short blocks was what still forced a scroll after the breakdown
              moved into the panel. */}
          <div className="lg:grid lg:grid-cols-2 lg:gap-x-10 lg:items-start space-y-8 lg:space-y-0 md:space-y-10 lg:md:space-y-0">

          {/* 02 — now a trigger, not thirteen rows.
              The whole breakdown lives in the slide-over below. Inline, those
              rows were ~700px of a 1400px form, so the pilot scrolled two
              screens past controls that most flights never touch; FlightDeck
              fits its form without scrolling for exactly this reason. The
              summary here has to carry enough state that opening the panel is a
              choice and not an obligation — hence assigned/total and the
              unassigned warning right on the button. */}
          <div className="space-y-3 pt-6 border-t border-zinc-200 dark:border-white/10">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
                {esSimulador ? "02. Instrucción terrestre" : "02. Desglose ANAC"}
              </p>
              {esSimulador ? (
                <MonitorPlay className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
              ) : (
                <User className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
              )}
            </div>

            {/* En un simulador las trece filas del desglose sobran: doce de ellas
                reparten tiempo de vuelo y acá no hay. Quedan las dos columnas que el
                libro de papel sí llena, escritas directo en vez de detrás del panel. */}
            {esSimulador ? (
              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <LedgerField label="Piloto en instrucción (h)">
                  <input
                    type="number"
                    name="sim_pil_en_inst"
                    min="0"
                    step="0.1"
                    placeholder="0.0"
                    value={horasInstruccion}
                    onChange={(e) => setSimPilEnInst(e.target.value)}
                    className={ledgerInput}
                  />
                </LedgerField>
                <LedgerField label="Instructor (h)">
                  <input
                    type="number"
                    name="sim_instructor"
                    min="0"
                    step="0.1"
                    placeholder="0.0"
                    value={simInstructor}
                    onChange={(e) => setSimInstructor(e.target.value)}
                    className={ledgerInput}
                  />
                </LedgerField>
              </div>
            ) : (
            <button
              type="button"
              onClick={() => setBreakdownOpen(true)}
              aria-expanded={breakdownOpen}
              className="w-full flex items-center gap-4 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-4 py-3.5 text-left hover:border-zinc-300 dark:hover:border-white/20 transition-colors"
            >
              <SlidersHorizontal className="w-4 h-4 shrink-0 text-zinc-400 dark:text-zinc-500" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold text-zinc-900 dark:text-white">
                  Ajustar valores y desglose
                </span>
                <span className="block text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                  PIC / SIC, día y noche, IMC, capota y simulador
                </span>
              </span>
              <span className="shrink-0 flex items-center gap-2">
                {breakdown.unassigned > 0 && total > 0 && (
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-500 bg-amber-500/10 px-2 py-1 rounded-full whitespace-nowrap">
                    {breakdown.unassigned.toFixed(1)} sin asignar
                  </span>
                )}
                <span className="data text-sm font-bold text-zinc-900 dark:text-white whitespace-nowrap">
                  {breakdown.assigned.toFixed(1)}
                  <span className="text-zinc-400 dark:text-zinc-500">/{total.toFixed(1)}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-600" />
              </span>
            </button>
            )}
          </div>

          {/* 03. Discounts — untouched, this is Vector's own concept. Renumbered from
              04 when sections 02 and 03 merged into the slide-over. */}
          <div className="space-y-4 pt-6 border-t border-zinc-200 dark:border-white/10">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">03. Descuento aplicado</p>
              <Percent className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
            </div>
            {/* Stacked, not two-up: this block now lives inside a half-width
                column, where two fields side by side would be ~150px each. */}
            <div className="grid grid-cols-1 gap-y-6">
              <LedgerField label="Tipo de descuento">
                <StyledSelect
                  name="discount_type"
                  value={discountType}
                  onChange={setDiscountType}
                  placeholder="Sin descuento"
                  options={DISCOUNT_OPTIONS}
                />
              </LedgerField>
              {discountType && (
                <LedgerField
                  label={discountType === "value" ? "Monto de descuento ($)" : "Porcentaje de descuento (%)"}
                >
                  <input
                    type="number"
                    name="discount_amount"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(e.target.value)}
                    className={ledgerInput}
                  />
                </LedgerField>
              )}
            </div>
          </div>
          </div>
        </div>

        {/* ANAC breakdown slide-over.

            It is ALWAYS MOUNTED — closing it only translates it off-screen and
            drops pointer events. That is load-bearing, not styling: TimeAllocator
            emits one `<input type="hidden" name=...>` per category, and those are
            what actually post the breakdown. Unmounting the panel (the obvious
            AnimatePresence approach) removes them from the form, and every flight
            saves with an empty breakdown — silently, because the server action
            accepts a missing field as zero. `display:none` inputs still submit,
            so hiding is safe; unmounting is not.

            La excepción es el simulador, donde el panel **sí** se desmonta: ahí
            "todo en cero" es la respuesta correcta y no un accidente. Las trece
            columnas reparten tiempo de vuelo y una sesión de simulador no tiene;
            dejarlas montadas con el total en cero funcionaría igual, pero mantendría
            en pantalla un panel que sólo puede contestar cero. Las dos columnas que
            sí se llenan están escritas arriba, en la sección 02. */}
        {!esSimulador && (
        <div
          className={`fixed inset-0 z-[120] ${breakdownOpen ? "" : "pointer-events-none"}`}
          aria-hidden={!breakdownOpen}
        >
          <div
            onClick={() => setBreakdownOpen(false)}
            className={`absolute inset-0 bg-zinc-900/40 dark:bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
              breakdownOpen ? "opacity-100" : "opacity-0"
            }`}
          />

          <div
            className={`absolute right-0 top-0 h-full w-full sm:max-w-md bg-white dark:bg-[#0a0a0a] border-l border-zinc-200 dark:border-white/10 shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
              breakdownOpen ? "translate-x-0" : "translate-x-full"
            }`}
          >
            <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-200 dark:border-white/10 shrink-0">
              <button
                type="button"
                onClick={() => setBreakdownOpen(false)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors"
                aria-label="Cerrar desglose"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <p className="font-display font-bold text-zinc-900 dark:text-white tracking-tight">
                Ajustar valores
              </p>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 space-y-7">
              {/* Pinned reference: every slider below is capped against this. */}
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-zinc-900 dark:bg-white/5 px-4 py-3">
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-white/50">
                  Total del vuelo
                </span>
                <span className="data text-base font-bold text-white">
                  {breakdown.assigned.toFixed(1)}
                  <span className="text-white/40">/{total.toFixed(1)}</span>
                </span>
              </div>

              {breakdown.unassigned > 0 && total > 0 && (
                <p className="font-mono text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-500 bg-amber-500/10 px-3 py-2 rounded-xl">
                  {breakdown.unassigned.toFixed(1)} h sin asignar
                </p>
              )}

              <div className="space-y-3">
                <p className="eyebrow">Tiempo de vuelo · PIC / SIC</p>
                <TimeAllocator
                  categories={PIC_SIC_CATEGORIES}
                  breakdown={breakdown}
                  remainderKey={remainderKey}
                />
              </div>

              {/* Kept apart from the pool above on purpose: these overlap PIC time
                  instead of partitioning it, so each is capped independently. */}
              <div className="space-y-3 pt-2 border-t border-zinc-200 dark:border-white/10">
                <p className="eyebrow">Condiciones y simulador</p>
                <TimeAllocator categories={CONDITION_CATEGORIES} breakdown={conditions} />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-zinc-200 dark:border-white/10 shrink-0">
              <button
                type="button"
                onClick={() => setBreakdownOpen(false)}
                className="w-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold py-3.5 rounded-2xl hover:opacity-90 transition-opacity"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
        )}

        <div
          className={
            inModal
              ? "p-0 pt-6 flex items-center gap-3"
              : "p-6 md:p-8 border-t border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-white/5"
          }
        >
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            disabled={isPending}
            type="submit"
            className="flex-1 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold text-sm py-5 md:py-6 rounded-xl md:rounded-[1.5rem] shadow-cal-highlight dark:shadow-none flex items-center justify-center space-x-3 transition-all disabled:opacity-50"
          >
            {isPending ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {cargandoCad && <span>Cargando en tu CAD…</span>}
              </>
            ) : (
              <>
                <span>{esSimulador ? "Registrar sesión" : "Registrar vuelo"}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </motion.button>
        </div>
      </div>
    </form>
  );
}

/**
 * Lo que ocupa el lugar del resumen de tiempo cuando la fila es de simulador.
 *
 * Dice el número que sale de los horarios y, en la misma línea, que ese número **no**
 * va a la columna de tiempo total. La alternativa —esconder el bloque— dejaría al
 * piloto sin saber si el formulario entendió que son 1.0 h, y la peor de todas sería
 * mostrar "1.0 h" a secas: idéntico a un vuelo, y contando distinto.
 */
function SesionDeSimulador({ duracion }: { duracion: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-zinc-900 dark:bg-white/5 px-5 py-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          Sesión
        </p>
        <p className="data text-2xl font-bold text-white leading-tight">
          {duracion.toFixed(1)} <span className="text-base text-white/40">h</span>
        </p>
      </div>
      <p className="text-[11px] text-white/50 leading-relaxed flex-1 min-w-[12rem]">
        No suma tiempo total de vuelo. Va entero a la columna de instrucción terrestre,
        acá abajo.
      </p>
    </div>
  );
}

/** Block time chip + the ANAC decimal that the rest of the form is bounded by. */
function TimeSummary({
  blockMinutes,
  total,
  manualDuration,
  onManualDuration,
}: {
  blockMinutes: number;
  total: number;
  manualDuration: string;
  onManualDuration: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const hasTimes = blockMinutes > 0;

  return (
    <div className="flex flex-wrap items-center gap-3 md:gap-4 rounded-2xl bg-zinc-900 dark:bg-white/5 px-5 py-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          Block time
        </p>
        <p className="text-2xl font-bold data text-white leading-tight">
          {hasTimes ? formatBlockTime(blockMinutes) : "—:—"}
        </p>
      </div>

      <div className="w-px h-9 bg-white/15" />

      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          Tiempo ANAC
        </p>
        {editing ? (
          <input
            type="number"
            step="0.1"
            min="0"
            autoFocus
            value={manualDuration || total.toFixed(1)}
            onChange={(e) => onManualDuration(e.target.value)}
            onBlur={() => setEditing(false)}
            className="w-20 bg-transparent border-b border-aviation-cyan text-2xl font-bold data text-aviation-cyan outline-none leading-tight"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="Editar el tiempo redondeado"
            className="text-2xl font-bold data text-aviation-cyan leading-tight hover:opacity-80 transition-opacity"
          >
            {total > 0 ? total.toFixed(1) : "0.0"}
          </button>
        )}
      </div>

      <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 ml-auto max-w-[14rem] leading-snug">
        {hasTimes
          ? "Redondeado por la regla de 0.3 (15 min = 0.3 h). Tocá el número para corregirlo."
          : "Completá despegue y aterrizaje para calcularlo."}
      </p>

      <input type="hidden" name="duration" value={total > 0 ? total.toFixed(1) : ""} />
    </div>
  );
}

function SegmentToggle({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`relative px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
        active ? "text-white" : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
      }`}
    >
      {active && (
        <motion.span
          layoutId="route-kind"
          className="absolute inset-0 rounded-full bg-aviation-blue"
          transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
        />
      )}
      <span className="relative z-10">{label}</span>
    </button>
  );
}

function LedgerField({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className="font-mono text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide block">
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * −/+ stepper for the landings count.
 *
 * Replaces a bare number input. Landings are almost always adjusted by one at a
 * time — a circuit session is "three, no wait, four" — and on a phone a tap
 * beats selecting the field and retyping. The value still posts through a
 * hidden input under the same `landings` name, so the server action is
 * untouched.
 *
 * Typing stays available: the middle is a real input, not a label, for the
 * pilot who did eleven touch-and-goes and doesn't want to press + eleven times.
 */
function LandingsStepper({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const current = parseInt(value, 10);
  const safe = Number.isFinite(current) ? current : 1;

  const step = (delta: number) => onChange(String(Math.max(0, safe + delta)));

  const buttonClass =
    "w-9 h-9 shrink-0 rounded-xl border border-zinc-200 dark:border-white/10 flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 hover:text-zinc-900 dark:hover:text-white transition-colors disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <div className="flex items-center gap-2 py-1">
      <button type="button" onClick={() => step(-1)} disabled={safe <= 0} aria-label="Un aterrizaje menos" className={buttonClass}>
        <Minus className="w-4 h-4" strokeWidth={2.5} />
      </button>

      <input
        type="number"
        name="landings"
        min="0"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Aterrizajes"
        className="w-full min-w-0 bg-transparent text-center text-lg font-bold data text-zinc-900 dark:text-white outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />

      <button type="button" onClick={() => step(1)} aria-label="Un aterrizaje más" className={buttonClass}>
        <Plus className="w-4 h-4" strokeWidth={2.5} />
      </button>
    </div>
  );
}
