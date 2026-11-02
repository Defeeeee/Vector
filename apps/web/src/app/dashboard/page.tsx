import { Activity, ArrowRight, CalendarDays, Clock, CloudFog, Moon, Plane, Plus, Sunrise } from "lucide-react";
import { Odometer, StatTile } from "@/components/dashboard/Cifras";
import { cifrasDeCarrera } from "@/lib/horas-carrera";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { apiFetch } from "@/lib/api";
import { Flight, Aircraft, FlightPack, PilotDocument, Logbook, PlannedFlight, Transaction, Profile } from "@/types";
import ChangelogNotice from "@/components/dashboard/ChangelogNotice";
import VuelosPendientes from "@/components/dashboard/VuelosPendientes";
import PlanesParaRegistrar from "@/components/dashboard/plan-de-vuelo/PlanesParaRegistrar";
import PrimerosPasos from "@/components/dashboard/PrimerosPasos";
import FlightStatusCard from "@/components/dashboard/FlightStatusCard";
import ProximoVencimiento from "@/components/dashboard/ProximoVencimiento";
import PCATracker from "@/components/dashboard/PCATracker";
import PPATracker from "@/components/dashboard/PPATracker";
import { esAlumno, vuelosDesdeLaPpa } from "@/lib/licencias";
import { requisitosPPA } from "@/lib/ppa-progress";
import { esTravesiaLarga } from "@/lib/travesia-larga";
import SaldoCard from "@/components/dashboard/SaldoCard";
import FlightPackWidget from "@/components/dashboard/FlightPackWidget";
import RecentFlights from "@/components/dashboard/RecentFlights";
import TuRedInicio from "@/components/social/TuRedInicio";
import { listPlannedFlights } from "@/actions/planned-flight";
import { estadoOnboarding } from "@/lib/onboarding";
import { soloVolados } from "@/lib/simulador";
import { costosPorVuelo, gastoDelMes } from "@/lib/costos";
import PendientesDdjj from "@/components/dashboard/cad/PendientesDdjj";
import { cuantosPendientesDeDdjj, leidoDelCad } from "@/lib/cad";

/**
 * Los endpoints que necesita esta pantalla, en paralelo.
 *
 * Estaban encadenados sin que ninguno dependiera del anterior. Medido contra
 * producción, una llamada trivial al backend tarda ~547 ms: en serie es cerca de un
 * segundo y medio de espera que se puede colapsar al tiempo de la más lenta.
 *
 * `Promise.all` y no `allSettled`: si `/dashboard` falla, la página no tiene nada
 * que mostrar igual. Los otros dos degradan solos a lista vacía más abajo.
 *
 * Las métricas propias ya no se piden acá: se mudaron al Resumen con el resto de
 * los números sobre lo que se voló.
 */
async function getDashboardData() {
  const [response, logbooksResponse, planned] = await Promise.all([
    apiFetch("/dashboard"),
    apiFetch("/logbooks"),
    // Aparte y no como extensión de `/dashboard`: ese endpoint ya devuelve la
    // bitácora entera sin paginar. `listPlannedFlights` degrada a lista vacía sola,
    // así que un backend sin la migración 009 no rompe esta pantalla.
    listPlannedFlights(),
  ]);

  if (response.status === 401) {
    console.log("Dashboard: 401 Unauthorized. Redirecting to logout...");
    redirect("/api/auth/logout?redirect=/?expired=true");
  }

  if (!response.ok) {
    // Nada de esto es "no hay": es "no pudimos preguntar". `unavailable` con
    // todas las secciones para que abajo nadie saque conclusiones de las listas
    // vacías. Ver `pilotStatus`.
    return {
      flights: [], aircraft: [], profile: null, session: { active: false }, packs: [],
      documents: [], logbooks: [] as Logbook[], planned: [] as PlannedFlight[],
      transactions: [] as Transaction[], balance: 0,
      unavailable: ["profile", "aircraft", "flights", "session", "packs", "transactions", "audit", "documents"],
    };
  }

  const data = await response.json();

  // Logbooks are not in the /dashboard payload yet; fetched alongside so the
  // totals on this page can include carried-forward hours.
  const logbooks: Logbook[] = logbooksResponse.ok ? await logbooksResponse.json() : [];

  return {
    logbooks,
    planned,
    /**
     * Qué secciones del payload no se pudieron leer. El backend las nombra en vez
     * de mandar `[]` a secas: una consulta que falla y una tabla vacía llegaban
     * idénticas, y el semáforo le decía "no tenés certificado médico" a pilotos
     * que sí lo tienen cargado.
     */
    unavailable: (data.unavailable as string[]) || [],
    flights: data.flights || [],
    aircraft: data.aircraft || [],
    profile: (data.profile as Profile) || null,
    session: data.session || { active: false },
    packs: (data.packs as FlightPack[]) || [],
    documents: (data.documents as PilotDocument[]) || [],
    // Son lo que hace posible mostrar cuánto salió cada vuelo. Ver `src/lib/costos.ts`.
    transactions: (data.transactions as Transaction[]) || [],
    /** Suma de las transacciones, calculada en el backend. Ver `SaldoCard`. */
    balance: typeof data.balance === "number" ? data.balance : 0,
  };
}

/**
 * El inicio contesta tres preguntas, y en este orden:
 *
 * 1. **¿Puedo volar hoy?** — el semáforo de RAAC 61.060 y el próximo vencimiento.
 * 2. **¿Cuánto me falta?** — el tracker de la PCA, o las horas totales si la
 *    licencia no va camino a la comercial.
 * 3. **¿Cuánto me queda?** — el saldo con la escuela, o las horas del pack.
 *
 * Y cierra con lo último que se voló. Todo lo demás que vivía acá —gráficos, heatmap,
 * récords, promedios, métricas propias— se mudó al Resumen, que es donde se va a
 * mirar lo que ya pasó; el clima, a "Preparar vuelo"; y la salud del libro, a la
 * pestaña Auditoría, que lleva el contador en la barra. Eran más de una docena de
 * bloques para alguien que abre la app a ver si puede volar el sábado.
 */
export default async function Dashboard() {
  const { flights: bitacora, aircraft, profile, session, packs, documents, logbooks, planned, unavailable, transactions, balance } =
    await getDashboardData();

  /*
    `bitacora` es el libro entero; `flights` es lo que se voló.

    Una sesión de simulador es una fila del libro —el de papel la tiene— pero no es un
    vuelo: no cuenta para la vigencia de 61.060 ni para el gasto del mes. Las dos
    excepciones se pasan a mano y están marcadas donde se usan: el tracker de la PCA,
    que necesita las horas de instrucción del simulador y hace su propio corte, y los
    últimos vuelos, que muestran el libro.
  */
  const flights = soloVolados(bitacora as Flight[], aircraft as Aircraft[]);
  const todayIso = new Date().toISOString().slice(0, 10);

  /** Si esa sección del payload se pudo leer. Ver `unavailable` más arriba. */
  const disponible = (seccion: string) => !unavailable.includes(seccion);
  const documentosDisponibles = disponible("documents");

  // Cuánto salió cada vuelo, del cobro que quedó registrado. Vacío en modo `packs`,
  // donde el vuelo consume horas y no pesos. Ver `src/lib/costos.ts`.
  const costos = costosPorVuelo(transactions as Transaction[]);
  const gastoMes = gastoDelMes(flights as Flight[], costos, todayIso.slice(0, 7));

  /*
    El saldo sólo se muestra si se sabe. Con la consulta de transacciones caída, o sin
    un solo movimiento cargado, el backend manda cero — y "$ 0" se leería como "no
    tenés plata" cuando lo cierto es "no lo sabemos".
  */
  const saldoConocido =
    profile?.tracking_mode === "balance" && disponible("transactions") && transactions.length > 0;

  const licencia = profile?.license_type?.toUpperCase() ?? "";
  const vaALaComercial = (licencia.includes("PPA") || licencia.includes("PRIVADO")) && !licencia.includes("PCA");
  // El alumno va a la PPA. Y quien ya la rindió cuenta desde esa fecha: las horas de
  // alumno no suman para la PCA (ver `lib/licencias.ts`). Sin fecha, cuentan todas.
  const alumno = esAlumno(profile?.license_type);
  const desdeLaPpa = vuelosDesdeLaPpa(bitacora as Flight[], profile?.fecha_ppa);

  return (
    <div className="space-y-8 md:space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-1000 w-full">
      {/* Header */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-8 pt-4">
        <div className="space-y-2 md:space-y-3">
          <p className="eyebrow flex items-center gap-2">
            <Activity className="w-3.5 h-3.5" />
            <span>Centro de operaciones</span>
          </p>
          <h2 className="text-5xl md:text-6xl lg:text-7xl font-display font-bold tracking-tighter text-zinc-900 dark:text-white leading-none">
            {profile?.first_name || "Comandante"}
          </h2>
        </div>

        {session.active ? (
          <Link
            href="/dashboard/log-flight"
            className="inline-flex items-center gap-3 pl-3 pr-4 py-2.5 rounded-full bg-green-500/10 border border-green-500/20 hover:bg-green-500/15 transition-colors self-start md:self-auto"
          >
            <span className="relative flex w-2 h-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-green-500 animate-blip" />
            </span>
            <span className="text-sm font-semibold text-green-600 dark:text-green-400">
              Vuelo en curso · {(aircraft as Aircraft[]).find((a) => a.id === session.session?.aircraft_id)?.registration || "Unknown"}
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
          </Link>
        ) : (
          // La acción principal de la app, con su nombre. El "+" del rail y de la
          // píldora del teléfono no dicen qué hacen, y un alumno nuevo no tiene por
          // qué adivinarlo.
          <Link
            href="/dashboard/log-flight"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold shadow-cal-highlight dark:shadow-none hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors self-start md:self-auto"
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            Registrar vuelo
          </Link>
        )}
      </section>

      {/* Las horas de la carrera, como en el Resumen. Federico pidió el 2026-10-10 que el
          inicio arranque por acá y que el tracker de la PCA deje de ser lo principal. */}
      <HorasDeCarrera
        flights={vuelosDesdeLaPpa(flights as Flight[], alumno ? null : profile?.fecha_ppa)}
        logbooks={logbooks as Logbook[]}
        todayIso={todayIso}
        alumno={alumno}
      />

      {/* 1. ¿Puedo volar hoy? — las cuatro condiciones de RAAC 61.060(a)(1), y
          debajo lo que vence primero. Va arriba de todo porque es la única pregunta
          de esta pantalla con consecuencias antes de despegar. */}
      <div className="space-y-3">
        <FlightStatusCard
          flights={flights as Flight[]}
          aircraft={aircraft as Aircraft[]}
          documents={documents as PilotDocument[]}
          profile={profile}
          documentosDisponibles={documentosDisponibles}
        />
        {documentosDisponibles && <ProximoVencimiento documents={documents as PilotDocument[]} />}
      </div>

      {/* "¿Volaste esto?" — el vuelo que el piloto programó y cuya fecha ya pasó.
          Es lo único de la pantalla, además del semáforo, que le pide algo: un vuelo
          sin registrar es un agujero en el libro. "Hoy" baja resuelto desde el
          server, como en el resumen y el heatmap. */}
      <VuelosPendientes
        planned={planned as PlannedFlight[]}
        aircraft={aircraft as Aircraft[]}
        todayIso={todayIso}
        tieneVuelos={bitacora.length > 0}
      />

      {/* "¿Ya volaste?" — un plan de vuelo presentado cuya llegada estimada ya pasó
          (Federico, 2026-10-20). Por `Suspense`: lee los planes y nunca demora lo de arriba. */}
      <Suspense fallback={null}>
        <PlanesParaRegistrar vuelos={(bitacora as Flight[]).map((v) => ({ date: v.date, route: v.route }))} />
      </Suspense>

      {/* Vuelos que están en el CAD sin la declaración jurada (lo sabe la sincronización, 037):
          la DDJJ es lo único del CAD que Vector no hace, así que lo recuerda. */}
      <PendientesDdjj cuantos={cuantosPendientesDeDdjj(bitacora as Flight[])} leido={leidoDelCad(profile?.cad_leido_at, new Date())} />

      {/* Desaparece solo cuando los cuatro pasos están hechos. Los datos ya vienen
          del Promise.all de arriba: no agrega ni un viaje al backend. */}
      <PrimerosPasos
        // `null` y no `false` en cada paso cuya consulta falló: el paso no se
        // dibuja, en vez de pedirle al piloto que cargue algo que ya tiene.
        //
        // **Los cuatro, no sólo el CMA.** El 2026-08-17 una request perdió siete
        // de las ocho consultas y el checklist le marcó tres pasos en falso a un
        // piloto que tenía todo cargado.
        estado={estadoOnboarding({
          profile,
          perfilDisponible: disponible("profile"),
          tieneCma: documentosDisponibles
            ? (documents as PilotDocument[]).some((d) => d.kind === "cma")
            : null,
          aeronaves: disponible("aircraft") ? aircraft.length : null,
          vuelos: disponible("flights") ? flights.length : null,
        })}
        alumno={alumno}
      />

      {/* Las novedades hablan del libro, la PCA y demás: al alumno no le aplican. */}
      {!alumno && <ChangelogNotice />}

      {/* 3. ¿Cuánto me queda? — pesos para quien lleva saldo, horas para quien lleva
          packs. Ninguno de los dos se dibuja si no tiene nada que decir. */}
      {profile?.tracking_mode === "balance" ? (
        saldoConocido && <SaldoCard saldo={balance} gasto={gastoMes} />
      ) : (
        <FlightPackWidget packs={packs} />
      )}

      {/* ¿Cuánto me falta? — Ya no es lo principal (Federico, 2026-10-10): va después del
          saldo, y las horas totales encabezan la pantalla. Recibe el libro entero, no `flights`: las horas de
          instrumento en simulador cuentan para el requisito, y el tracker hace su
          propio corte con `separarSimuladores` para que no cuenten para nada más. */}
      {alumno ? (
        <PPATracker
          requisitos={requisitosPPA(bitacora as Flight[], {
            aircraft: aircraft as Aircraft[],
            logbooks: logbooks as Logbook[],
            travesiaLarga: esTravesiaLarga,
          })}
        />
      ) : vaALaComercial ? (
        <PCATracker
          flights={desdeLaPpa}
          logbooks={logbooks as Logbook[]}
          aircraft={aircraft as Aircraft[]}
          todayIso={todayIso}
        />
      ) : null}

      {/* Cierra con el libro mismo. Todo lo de arriba es estado; esto es lo último
          que pasó. Una sesión de simulador es un renglón como cualquier otro y
          esconderla acá sería esconder algo que el piloto acaba de cargar. */}
      <RecentFlights flights={bitacora as Flight[]} aircraft={aircraft as Aircraft[]} costos={costos} limit={3} />

      {/* "Tu red": la única tarjeta que no contesta una de las tres preguntas, por
          decisión de Federico. Chica, al final, y por `Suspense`: el feed es un viaje
          más al backend y nunca puede demorar el "¿puedo volar hoy?". */}
      <Suspense fallback={null}>
        <TuRedInicio />
      </Suspense>
    </div>
  );
}

/**
 * Las horas totales y la fila de cifras, arriba de todo y con la misma forma que en el
 * Resumen (`components/dashboard/Cifras.tsx`). Las cuentas están en `lib/horas-carrera.ts`.
 *
 * Una cuenta nueva no tiene nada que contar todavía, y de eso ya se ocupa
 * `PrimerosPasos`: un cero grande acá sería ruido.
 */
function HorasDeCarrera({ flights, logbooks, todayIso, alumno }: { flights: Flight[]; logbooks: Logbook[]; todayIso: string; alumno: boolean }) {
  const c = cifrasDeCarrera(flights, logbooks, todayIso, { alumno });
  if (c.total === 0) return null;
  const h = (n: number) => n.toFixed(1);
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-3">
          <p className="eyebrow">Horas de vuelo · carrera total</p>
          <Odometer value={c.total} />
        </div>
        <Link href="/dashboard/summary" className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white mb-2">
          Ver resumen <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatTile icon={<CalendarDays className="w-3.5 h-3.5" />} label="30 días" value={h(c.ultimos30)} caption="Horas en el último mes" />
        <StatTile icon={<Clock className="w-3.5 h-3.5" />} label="PIC" value={h(c.pic)} caption="Al mando" />
        <StatTile icon={<Moon className="w-3.5 h-3.5" />} label="Noche" value={h(c.noche)} caption="Vuelo nocturno" />
        <StatTile icon={<CloudFog className="w-3.5 h-3.5" />} label="IMC" value={h(c.imc)} caption="En instrumentos" />
        <StatTile icon={<Sunrise className="w-3.5 h-3.5" />} label="Ater." value={String(c.aterrizajes)} caption="Aterrizajes totales" />
        <StatTile icon={<Plane className="w-3.5 h-3.5" />} label="Vuelos" value={String(c.vuelos)} caption="Entradas de log" />
      </div>
      <Link href="/dashboard/summary" className="sm:hidden inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-500 dark:text-zinc-400">
        Ver resumen <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </section>
  );
}
