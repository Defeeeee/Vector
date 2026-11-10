import { cifrasDeCarrera } from "@/lib/horas-carrera";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { apiFetch } from "@/lib/api";
import { Flight, Aircraft, FlightPack, PilotDocument, Logbook, Transaction, Profile } from "@/types";
import ChangelogNotice from "@/components/dashboard/ChangelogNotice";
import PlanesParaRegistrar from "@/components/dashboard/plan-de-vuelo/PlanesParaRegistrar";
import PrimerosPasos from "@/components/dashboard/PrimerosPasos";
import FlightStatusCard from "@/components/dashboard/FlightStatusCard";
import ProximoVencimiento from "@/components/dashboard/ProximoVencimiento";
import PCATracker from "@/components/dashboard/PCATracker";
import PPATracker from "@/components/dashboard/PPATracker";
import { esAlumno, vuelosDesdeLaPpa } from "@/lib/licencias";
import { horasQueFaltanPPA, requisitosPPA } from "@/lib/ppa-progress";
import { horasQueFaltan, requisitosLicencia } from "@/lib/pca-progress";
import ResumenRapido, { type Mitad, type VueloCorto } from "@/components/dashboard/ResumenRapido";
import InstalarVector from "@/components/dashboard/InstalarVector";
import { splitRoute } from "@/lib/route";
import { horasDeLaFila } from "@/lib/simulador";
import { pesos } from "@/lib/costos";
import { esTravesiaLarga } from "@/lib/travesia-larga";
import SaldoCard from "@/components/dashboard/SaldoCard";
import FlightPackWidget from "@/components/dashboard/FlightPackWidget";
import TuRedInicio from "@/components/social/TuRedInicio";
import { estadoOnboarding } from "@/lib/onboarding";
import { soloVolados } from "@/lib/simulador";
import { costosPorVuelo, gastoDelMes } from "@/lib/costos";
import PendientesDdjj from "@/components/dashboard/cad/PendientesDdjj";
import { cuantosPendientesDeDdjj, leidoDelCad } from "@/lib/cad";
import InicioEscritorio, { type FajaVuelo, type ItemChequeo, type Queda } from "@/components/dashboard/InicioEscritorio";
import { recencyByClass, recencyWindowDays } from "@/lib/recency";
import { pilotStatus } from "@/lib/pilot-status";
import { documentStatus } from "@/lib/utils";
import { alcanceDelPack, horasQueAlcanzaElSaldo } from "@/lib/pack-adelante";
import { SECCIONES, hrefDeSeccion } from "@/lib/secciones";

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
  // Los vuelos programados ya no se piden (3.12.0): nadie los usaba y se sacaron de la app.
  const [response, logbooksResponse] = await Promise.all([apiFetch("/dashboard"), apiFetch("/logbooks")]);

  if (response.status === 401) {
    console.log("Dashboard: 401 Unauthorized. Redirecting to logout...");
    redirect("/api/auth/logout?redirect=/login?expirada=1");
  }

  if (!response.ok) {
    // Nada de esto es "no hay": es "no pudimos preguntar". `unavailable` con
    // todas las secciones para que abajo nadie saque conclusiones de las listas
    // vacías. Ver `pilotStatus`.
    return {
      flights: [], aircraft: [], profile: null, packs: [],
      documents: [], logbooks: [] as Logbook[],
      transactions: [] as Transaction[], balance: 0,
      unavailable: ["profile", "aircraft", "flights", "packs", "transactions", "audit", "documents"],
    };
  }

  const data = await response.json();

  // Logbooks are not in the /dashboard payload yet; fetched alongside so the
  // totals on this page can include carried-forward hours.
  const logbooks: Logbook[] = logbooksResponse.ok ? await logbooksResponse.json() : [];

  return {
    logbooks,
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
  const { flights: bitacora, aircraft, profile, packs, documents, logbooks, unavailable, transactions, balance } =
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

  /*
    El inicio en el teléfono (3.4.0): "te quedan" y "te falta" en una fila, después de "¿Puedo
    volar hoy?". En el escritorio no se usa (ver `ResumenRapido`).
  */
  const packsActivos = (packs as FlightPack[]).filter((p) => p.is_active);
  const queda: Mitad | null =
    profile?.tracking_mode === "balance"
      ? saldoConocido
        ? { etiqueta: "Saldo", valor: pesos(balance), detalle: balance < 0 ? "Debés" : "A favor", porcentaje: null, href: "/dashboard/balance" }
        : null
      : packsActivos.length
        ? (() => {
            const resta = packsActivos.reduce((s, p) => s + p.remaining_hours, 0);
            const total = packsActivos.reduce((s, p) => s + p.total_hours, 0);
            return {
              etiqueta: "Te quedan",
              valor: resta.toFixed(1).replace(".", ","),
              unidad: `/ ${total.toFixed(0)} h`,
              detalle: packsActivos.length === 1 ? packsActivos[0].name : `${packsActivos.length} packs`,
              porcentaje: total > 0 ? (resta / total) * 100 : null,
              href: "/dashboard/balance",
            };
          })()
        : null;
  const requisitos = alumno
    ? requisitosPPA(bitacora as Flight[], { aircraft: aircraft as Aircraft[], logbooks: logbooks as Logbook[], travesiaLarga: esTravesiaLarga })
    : vaALaComercial
      ? requisitosLicencia(desdeLaPpa, logbooks as Logbook[], aircraft as Aircraft[])
      : null;
  const faltaHoras = requisitos ? (alumno ? horasQueFaltanPPA(requisitos) : horasQueFaltan(requisitos)) : null;
  // La barra de "te falta" es la del requisito que frena: el total en la PPA y, en la PCA,
  // el de horas con más camino por delante (el mismo que da `horasQueFaltan`).
  const frena = requisitos
    ? alumno
      ? requisitos.find((r) => r.clave === "total")
      : requisitos.filter((r) => r.esHoras).sort((a, b) => b.objetivo - b.actual - (a.objetivo - a.actual))[0]
    : undefined;
  const falta: Mitad | null =
    faltaHoras === null || !disponible("flights")
      ? null
      : {
          etiqueta: "Te falta",
          valor: faltaHoras.toFixed(1).replace(".", ","),
          unidad: "h",
          detalle: alumno ? "para la PPA" : "para la PCA",
          porcentaje: frena && frena.objetivo > 0 ? (frena.actual / frena.objetivo) * 100 : null,
          tono: "neutro",
          href: "#tracker",
        };
  // Los últimos tres renglones del libro, escritos acá (invariante 1): en el teléfono van en una
  // tarjeta compacta en vez de `RecentFlights`.
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const ultimos: VueloCorto[] = [...(bitacora as Flight[])]
    .sort((a, b) => (b.date + (b.takeoff ?? "")).localeCompare(a.date + (a.takeoff ?? "")))
    .slice(0, 3)
    .map((f) => {
      const sim = Boolean((aircraft as Aircraft[]).find((a) => a.id === f.aircraft_id)?.is_simulator);
      const [o, d] = splitRoute(f.route, "");
      return {
        id: f.id,
        fecha: `${f.date.slice(8, 10)} ${MESES[Number(f.date.slice(5, 7)) - 1] ?? ""}`,
        ruta: sim ? `SIM · ${o}` : d ? `${o} → ${d}` : o,
        horas: horasDeLaFila(f, sim).toFixed(1).replace(".", ","),
      };
    });
  const carrera = cifrasDeCarrera(vuelosDesdeLaPpa(flights as Flight[], alumno ? null : profile?.fecha_ppa), logbooks as Logbook[], todayIso, { alumno });

  /* ----------------------------------------------- el inicio del escritorio (3.11.0) --- */
  const estado = pilotStatus(
    documents as PilotDocument[],
    recencyByClass(flights as Flight[], aircraft as Aircraft[], recencyWindowDays(profile?.license_type)),
    flights as Flight[],
    new Date(),
    documentosDisponibles,
    { alumno }
  );
  const MESES_MAY = MESES.map((m) => m.toUpperCase());
  const fajas: FajaVuelo[] = [...(bitacora as Flight[])]
    .sort((a, b) => (b.date + (b.takeoff ?? "")).localeCompare(a.date + (a.takeoff ?? "")))
    .slice(0, 5)
    .map((f) => {
      const avion = (aircraft as Aircraft[]).find((a) => a.id === f.aircraft_id);
      const sim = Boolean(avion?.is_simulator);
      const [o, d] = splitRoute(f.route, "");
      return {
        id: f.id,
        tipo: sim ? "SIM" : d && d !== o ? "TRV" : "LOC",
        fecha: `${f.date.slice(8, 10)} ${MESES_MAY[Number(f.date.slice(5, 7)) - 1] ?? ""}`,
        ruta: d ? `${o} → ${d}` : o,
        matricula: avion?.registration ?? "",
        modelo: avion?.icao || avion?.type || "",
        horas: horasDeLaFila(f, sim).toFixed(1).replace(".", ","),
      };
    });
  // La lista de chequeo: lo que vence, de lo más cercano a lo más lejano, y lo que pide el CAD.
  const chequeo: ItemChequeo[] = [];
  if (disponible("flights")) {
    chequeo.push({
      etiqueta: "Experiencia reciente",
      valor: estado.estado === "sin_recencia" ? "Vencida" : estado.estado === "inactividad_prolongada" ? "Inactivo" : "Al día",
      tono: estado.estado === "sin_recencia" || estado.estado === "inactividad_prolongada" ? "mal" : "ok",
    });
  }
  if (documentosDisponibles) {
    (documents as PilotDocument[])
      .map((d) => ({ d, st: documentStatus(d.expiry_date) }))
      .filter((x) => x.st.daysRemaining !== null)
      .sort((a, b) => (a.st.daysRemaining ?? 0) - (b.st.daysRemaining ?? 0))
      .slice(0, 4)
      .forEach(({ d, st }) => {
        const dias = st.daysRemaining ?? 0;
        chequeo.push({
          etiqueta: d.name,
          valor: dias < 0 ? "Vencido" : dias === 0 ? "Hoy" : dias > 90 ? `${Math.round(dias / 30)} m` : `${dias} d`,
          tono: st.tone === "expired" || st.tone === "critical" ? "mal" : st.tone === "warning" ? "aviso" : "ok",
        });
      });
  }
  const pendientesDdjj = cuantosPendientesDeDdjj(bitacora as Flight[]);
  // Sólo para quien usa el CAD desde Vector: a los demás, un "0" sería ruido.
  if (profile?.cad_leido_at) {
    chequeo.push({ etiqueta: "CAD · DDJJ pendientes", valor: String(pendientesDdjj), tono: pendientesDdjj > 0 ? "aviso" : "neutro" });
  }
  const DIA_MES = (iso: string) => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1] ?? ""}`;
  const quedaEscritorio: Queda | null =
    profile?.tracking_mode === "balance"
      ? saldoConocido
        ? (() => {
            const porHora = gastoMes.horas > 0 ? gastoMes.pesos / gastoMes.horas : null;
            const alcanza = horasQueAlcanzaElSaldo(balance, porHora);
            return {
              modo: "saldo" as const,
              saldo: balance,
              saldoTexto: `${balance < 0 ? "−" : ""}${pesos(Math.abs(balance))}`,
              mes: gastoMes.pesos > 0 ? `${pesos(gastoMes.pesos)} · ${gastoMes.vuelos} ${gastoMes.vuelos === 1 ? "vuelo" : "vuelos"} · ${gastoMes.horas.toFixed(1).replace(".", ",")} h` : null,
              porHora: porHora !== null ? pesos(porHora) : null,
              alcanzaHoras: alcanza !== null ? alcanza.toFixed(1).replace(".", ",") : null,
            };
          })()
        : null
      : packsActivos.length
        ? (() => {
            const restan = packsActivos.reduce((t, p) => t + p.remaining_hours, 0);
            const total = packsActivos.reduce((t, p) => t + p.total_hours, 0);
            const alcance = alcanceDelPack(restan, carrera.ultimos30, todayIso);
            return {
              modo: "pack" as const,
              restan,
              total,
              detalle: packsActivos.length === 1 ? packsActivos[0].name : `${packsActivos.length} packs`,
              alcanza: alcance.fecha ? DIA_MES(alcance.fecha) : null,
              ritmo: alcance.ritmoMensual,
              poco: alcance.poco,
            };
          })()
        : null;
  const licenciaEscritorio =
    requisitos && disponible("flights")
      ? {
          meta: (alumno ? "PPA" : "PCA") as "PPA" | "PCA",
          seccion: alumno ? "61.520(a)" : "61.620",
          requisitos: requisitos.filter((r) => r.grupo === "pca"),
          faltan: faltaHoras ?? 0,
        }
      : null;
  const preparar = SECCIONES.find((x) => x.clave === "preparar");

  /*
    En el teléfono el orden es otro (`max-lg:order-*`): primero "¿Puedo volar hoy?", después
    cuánto te queda y te falta, lo que te pide algo, los últimos vuelos y al final el detalle
    del saldo y del tracker. En el escritorio, el de siempre.
  */
  return (
    <div className="flex flex-col gap-8 md:gap-10 max-lg:gap-3 app:pt-[13px] animate-in fade-in slide-in-from-bottom-4 duration-1000 w-full">
      {/* Header */}
      {/* En el teléfono no hay título: en el navegador ya está el logo arriba y en la app el
          saludo con la fecha (`TituloTelefono`, en el layout). */}
      <div className="lg:hidden app:hidden max-lg:order-0 empty:hidden">
        <InstalarVector />
      </div>
      {/* El escritorio (3.11.0): hero, camino a la licencia, cuánto queda, vuelos y chequeo. */}
      <div className="max-lg:hidden">
        <InicioEscritorio
          nombre={profile?.first_name || "Comandante"}
          estado={disponible("flights") || documentosDisponibles ? estado : null}
          carrera={disponible("flights") ? carrera : null}
          licencia={licenciaEscritorio}
          queda={quedaEscritorio}
          fajas={disponible("flights") ? fajas : []}
          chequeo={chequeo}
          hrefPreparar={preparar ? hrefDeSeccion(preparar) : "/dashboard/mapa/planilla"}
        />
      </div>

      {/* 1. ¿Puedo volar hoy? — las cuatro condiciones de RAAC 61.060(a)(1), y
          debajo lo que vence primero. Va arriba de todo porque es la única pregunta
          de esta pantalla con consecuencias antes de despegar. */}
      <div className="space-y-3 max-lg:order-1 lg:hidden">
        <FlightStatusCard
          flights={flights as Flight[]}
          aircraft={aircraft as Aircraft[]}
          documents={documents as PilotDocument[]}
          profile={profile}
          documentosDisponibles={documentosDisponibles}
        />
        {documentosDisponibles && <ProximoVencimiento documents={documents as PilotDocument[]} />}
      </div>

      <div className="max-lg:order-2">
        <ResumenRapido queda={queda} falta={falta} totalHoras={carrera.total > 0 ? carrera.total.toFixed(1).replace(".", ",") : null} ultimos={ultimos} />
      </div>

      <div className="contents max-lg:block max-lg:order-3 max-lg:space-y-5">
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

      </div>

      {/* Las novedades hablan del libro, la PCA y demás: al alumno no le aplican. */}
      {!alumno && (
        <div className="max-lg:order-6">
          <ChangelogNotice />
        </div>
      )}

      {/* 3. ¿Cuánto me queda? — pesos para quien lleva saldo, horas para quien lleva
          packs. Ninguno de los dos se dibuja si no tiene nada que decir. */}
      <div className="max-lg:order-5 empty:hidden lg:hidden">
      {profile?.tracking_mode === "balance" ? (
        saldoConocido && <SaldoCard saldo={balance} gasto={gastoMes} />
      ) : (
        <FlightPackWidget packs={packs} />
      )}
      </div>

      {/* ¿Cuánto me falta? — Ya no es lo principal (Federico, 2026-10-10): va después del
          saldo, y las horas totales encabezan la pantalla. Recibe el libro entero, no `flights`: las horas de
          instrumento en simulador cuentan para el requisito, y el tracker hace su
          propio corte con `separarSimuladores` para que no cuenten para nada más. */}
      <div id="tracker" className="max-lg:order-5 empty:hidden scroll-mt-24 lg:hidden">
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
      </div>

      {/* "Tu red": la única tarjeta que no contesta una de las tres preguntas, por
          decisión de Federico. Chica, al final, y por `Suspense`: el feed es un viaje
          más al backend y nunca puede demorar el "¿puedo volar hoy?". */}
      <div className="max-lg:order-7 empty:hidden">
        <Suspense fallback={null}>
          <TuRedInicio />
        </Suspense>
      </div>
    </div>
  );
}
