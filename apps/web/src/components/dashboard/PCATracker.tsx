"use client";

import { Aircraft, Flight, Logbook } from "@/types";
import { Award, CheckCircle2, Clock, Compass, Navigation, Moon, Radar, Target, TrendingUp, Wallet } from "lucide-react";
import { motion } from "framer-motion";
import {
  MESES_DE_RITMO,
  costoPorHora,
  horasQueFaltan,
  loQueFrena,
  mesesRestantes,
  requisitosLicencia,
  ritmoMensual,
} from "@/lib/pca-progress";

/**
 * El ícono de cada requisito, por clave.
 *
 * Fuera del módulo de aritmética a propósito: `lib/pca-progress.ts` no importa JSX
 * ni lucide, y así se lo puede testear en `environment: "node"`.
 */
const ICONOS: Record<string, React.ReactNode> = {
  pic: <Target className="w-4 h-4" />,
  picTravesia: <Compass className="w-4 h-4" />,
  instrumentos: <Navigation className="w-4 h-4" />,
  // Ícono distinto del de la PCA a propósito: son dos sellos con el mismo nombre y
  // números que no coinciden, y dos veces la misma flecha los hace ver un duplicado.
  instrumentosHvi: <Radar className="w-4 h-4" />,
  nocturno: <Moon className="w-4 h-4" />,
  aterrizajesNocturnos: <Award className="w-4 h-4" />,
};

interface PCATrackerProps {
  flights: Flight[];
  /**
   * Hours carried into the logbooks without their flights.
   *
   * These have to count here or the tracker under-reports a pilot who migrated
   * from paper — and under-reporting licence progress is worse than not showing
   * it, because it is wrong in the direction that makes someone think they are
   * further away than they are.
   */
  logbooks?: Logbook[];
  /** Para estimar el precio de la hora. Sin esto, la card no habla de plata. */
  aircraft?: Aircraft[];
  /**
   * "Hoy" resuelto en el server, "YYYY-MM-DD".
   *
   * El ritmo se mide sobre una ventana que termina hoy, y dejar que este componente
   * llame a `new Date()` haría que el server (UTC) y el browser (UTC−3) puedan estar
   * en días distintos y renderizar números distintos.
   */
  todayIso: string;
}

export default function PCATracker({ flights, logbooks = [], aircraft = [], todayIso }: PCATrackerProps) {
  // Toda la aritmética de 61.620 vive en `lib/pca-progress.ts`. Estaba acá adentro y
  // por lo tanto sin un solo test: el proyecto corre vitest en `environment: "node"`
  // y no puede testear componentes, así que lo que queda en un `.tsx` no se verifica.
  /*
    Las aeronaves entran para poder descontar los simuladores: sin ellas, una sesión de
    simulador sumaría a las 200 h de experiencia total. El componente ya las recibía
    para el costo por hora y no se las pasaba.
  */
  const requisitos = requisitosLicencia(flights, logbooks, aircraft);
  const porClave = (clave: string) => requisitos.find((r) => r.clave === clave)!;

  const totalHours = porClave("total").actual;

  // Las tres respuestas: qué frena, cuándo se cierra, cuánto sale.
  const freno = loQueFrena(requisitos);
  const pendientes = requisitos.filter((r) => r.actual < r.objetivo).length;
  const ritmo = freno ? ritmoMensual(flights, freno.clave, todayIso) : 0;
  const meses = freno ? mesesRestantes(freno.faltan, ritmo) : null;
  const precioHora = costoPorHora(flights, aircraft, todayIso);
  const horasFaltantes = horasQueFaltan(requisitos);

  const totalProgress = Math.min((totalHours / 200) * 100, 100);

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between px-2">
        <div className="space-y-1">
          {/* Las dos juntas y no la PCA sola: casi nadie hace la comercial sin la
              habilitación por instrumentos, y una card que muestra media regulación da
              una respuesta tranquilizadora a la pregunta equivocada. */}
          <h3 className="text-xl md:text-2xl font-bold font-display text-zinc-900 dark:text-white tracking-tight transition-colors">Tracker PCA + HVI</h3>
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Reg. 61.620 y habilitación por instrumentos</p>
        </div>
        <div className="px-3 md:px-4 py-1.5 md:py-2 bg-zinc-900 dark:bg-white rounded-full shadow-cal-highlight flex items-center space-x-2 transition-colors">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <p className="text-xs font-semibold text-white dark:text-zinc-900">En progreso</p>
        </div>
      </div>

      <div className="bg-white dark:bg-[#111111] border border-zinc-200 dark:border-white/10 rounded-3xl md:rounded-[2.5rem] shadow-cal dark:shadow-none overflow-hidden flex flex-col lg:flex-row transition-all">
        
        {/* Main Gauge / Total Experience */}
        <div className="lg:w-2/5 p-8 md:p-10 bg-zinc-50 dark:bg-black/20 border-b lg:border-b-0 lg:border-r border-zinc-200 dark:border-white/10 flex flex-col items-center justify-center text-center space-y-6">
          <div className="relative w-32 h-32 md:w-48 md:h-48 flex items-center justify-center">
             <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8" className="text-zinc-200 dark:text-white/5" />
                <motion.circle
                  cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8"
                  strokeDasharray={`${totalProgress * 2.83} 283`}
                  className="text-aviation-blue-dark dark:text-aviation-cyan"
                  initial={{ strokeDasharray: "0 283" }}
                  animate={{ strokeDasharray: `${totalProgress * 2.83} 283` }}
                  transition={{ duration: 1.5, ease: "easeOut" }}
                  strokeLinecap="round"
                />
             </svg>
             <div className="absolute flex flex-col items-center justify-center space-y-0.5 md:space-y-1">
                <Clock className="w-4 h-4 md:w-5 md:h-5 text-zinc-400 dark:text-zinc-500 mb-0.5 md:mb-1" />
                <span className="text-2xl md:text-4xl font-display font-bold text-zinc-900 dark:text-white tracking-tighter leading-none">{totalHours.toFixed(1)}</span>
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">/ 200 hs</span>
             </div>
          </div>
          <div className="space-y-1">
             <h4 className="text-base md:text-lg font-bold text-zinc-900 dark:text-white tracking-tight">Experiencia total</h4>
             <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 leading-relaxed">Progreso hacia la meta</p>
          </div>
        </div>

        {/* Requirements — license stamps instead of progress bars: each requirement is an official stamp waiting to be earned */}
        <div className="flex-1 p-6 md:p-10 grid grid-cols-2 sm:grid-cols-3 gap-4 md:gap-6 place-items-center">
          {requisitos.filter((r) => r.clave !== "total").map((req, i) => {
            const isComplete = req.actual >= req.objetivo;
            const isSubComplete = req.subObjetivo ? req.actual >= req.subObjetivo : false;
            const rotation = i % 3 === 0 ? -4 : i % 3 === 1 ? 3 : -2;

            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1, rotate: isComplete ? rotation : 0 }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="flex flex-col items-center text-center gap-2.5"
              >
                <div
                  className={`relative w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center border-2 transition-colors ${
                    isComplete
                      ? "border-green-500 text-green-600 dark:text-green-500"
                      : isSubComplete
                        ? "border-amber-500 border-dashed text-amber-600 dark:text-amber-500"
                        : "border-zinc-300 dark:border-white/15 border-dashed text-zinc-400 dark:text-zinc-500"
                  }`}
                >
                  {ICONOS[req.clave]}
                  {isComplete && (
                    <span className="absolute -bottom-1 -right-1 w-5 h-5 md:w-6 md:h-6 rounded-full bg-green-500 text-white flex items-center justify-center border-2 border-white dark:border-[#111111]">
                      <CheckCircle2 className="w-3 h-3 md:w-3.5 md:h-3.5" />
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-zinc-900 dark:text-white leading-tight">{req.label}</p>
                  <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {req.esHoras ? req.actual.toFixed(1) : Math.round(req.actual)} / {req.objetivo} {req.unidad}
                  </p>
                  {/*
                    Los dos sellos de instrumentos se ven casi iguales y llevan números
                    distintos —10 contra 40, y topes de simulador de 5 contra 20—. Sin
                    la etiqueta y sin el tope escrito son dos diales que nadie puede
                    distinguir, y el que los mire va a suponer que uno está mal.
                  */}
                  <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 mt-0.5">
                    <span className="font-bold uppercase tracking-wide">{req.grupo}</span>
                    {req.nota && <span> · {req.nota}</span>}
                  </p>
                </div>
                {isComplete && (
                  <span
                    className="text-[7px] font-black uppercase tracking-widest text-green-600 dark:text-green-500 border-2 border-green-500/50 rounded px-1.5 py-0.5"
                    style={{ transform: `rotate(${-rotation}deg)` }}
                  >
                    Cumplido
                  </span>
                )}
              </motion.div>
            );
          })}
        </div>

      </div>

      {/*
        La conclusión de los seis diales.

        Sin esto la card es un informe: seis números y el piloto adivinando cuál pesa.
        Y el que pesa **rota** — se puede estar al 97% del total y trabado por dos
        horas de travesía, o sea con el medidor grande casi lleno y el dial chiquito
        decidiendo qué vuelo conviene hacer.
      */}
      <div className="bg-white dark:bg-[#111111] border border-zinc-200 dark:border-white/10 rounded-3xl md:rounded-[2.5rem] shadow-cal dark:shadow-none p-6 md:p-8 space-y-4">
        {freno ? (
          <>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-white/10 flex items-center justify-center shrink-0">
                <TrendingUp className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
              </div>
              <div className="min-w-0">
                {/*
                  El título depende de cuántos falten, porque "te frena" es una
                  afirmación fuerte. Con uno solo pendiente es literal. Con cinco, el
                  que sale acá es el que está más lejos en proporción, y puede ser una
                  brecha de 5 hs mientras hay otra de 150: llamarlo "lo que te frena"
                  sería sugerir que cerrándolo terminaste.
                */}
                <p className="eyebrow">{pendientes === 1 ? "Lo que te frena" : "Lo que más lejos tenés"}</p>
                <p className="text-sm md:text-base font-bold text-zinc-900 dark:text-white leading-snug mt-0.5">
                  Te faltan{" "}
                  <span className="data">
                    {freno.esHoras ? freno.faltan.toFixed(1) : Math.ceil(freno.faltan)}
                  </span>{" "}
                  {freno.unidad === "hs" ? "hs" : "aterrizajes"} de {freno.label}
                  {/* "Lo único" sólo si de verdad es lo único: con dos pendientes,
                      cerrar éste no habilita nada y decirlo sería mentir. */}
                  {pendientes === 1 ? " — es lo único que te separa del examen." : "."}
                </p>
                <p className="text-[13px] text-zinc-500 dark:text-zinc-400 leading-relaxed mt-1">
                  {meses === null
                    ? `No volaste nada de eso en los últimos ${MESES_DE_RITMO} meses, así que no hay ritmo del que proyectar.`
                    : `A tu ritmo de los últimos ${MESES_DE_RITMO} meses, unos ${Math.ceil(meses)} ${
                        Math.ceil(meses) === 1 ? "mes" : "meses"
                      }.`}
                </p>
              </div>
            </div>

            {/*
              La plata sólo si hay de dónde sacarla. Sin ningún `cost_per_hour`
              cargado, un cero se leería como "gratis".
            */}
            {precioHora !== null && horasFaltantes > 0 && (
              <div className="flex items-start gap-3 pt-4 border-t border-zinc-100 dark:border-white/5">
                <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-white/10 flex items-center justify-center shrink-0">
                  <Wallet className="w-4 h-4 text-zinc-500 dark:text-zinc-400" />
                </div>
                <div className="min-w-0">
                  <p className="eyebrow">Cuánto sale terminar</p>
                  <p className="text-sm md:text-base font-bold text-zinc-900 dark:text-white leading-snug mt-0.5">
                    Al menos <span className="data">{horasFaltantes.toFixed(1)}</span> hs ·{" "}
                    <span className="data">
                      $ {Math.round(horasFaltantes * precioHora).toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                    </span>
                  </p>
                  {/*
                    "Al menos" no es una cortesía: un mismo vuelo avanza varios
                    requisitos a la vez, así que lo mínimo que se puede volar es la
                    brecha más grande, no la suma de las brechas. Y el precio es el
                    promedio ponderado de lo que este piloto viene volando.
                  */}
                  <p className="text-[13px] text-zinc-500 dark:text-zinc-400 leading-relaxed mt-1">
                    Es un piso: un mismo vuelo puede cumplir varios requisitos a la vez.
                    Calculado a{" "}
                    <span className="data">
                      $ {Math.round(precioHora).toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                    </span>{" "}
                    la hora, el promedio de lo que venís volando.
                  </p>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-green-500 shrink-0" />
            <div>
              <p className="text-sm font-bold text-zinc-900 dark:text-white">
                Cumplís las horas de 61.620 y las de instrumentos de la HVI.
              </p>
              {/*
                "Las horas", no "los requisitos". La HVI pide además cosas que no viven
                en ninguna columna del libro —la travesía IFR con aproximaciones en tres
                aeródromos, el chequeo de pericia—, así que Vector no puede saber si
                están. Decir "cumplís los requisitos" con todos los diales en verde
                sería afirmar lo que no se sabe, que es el error que parió media app.
              */}
              <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
                Son las horas que se leen del libro. La HVI pide además cosas que Vector
                no puede ver —la travesía IFR y el chequeo—, y eso lo confirmás vos.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
