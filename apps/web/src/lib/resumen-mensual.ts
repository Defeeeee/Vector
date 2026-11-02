/**
 * El resumen del mes por mail: qué dice y cómo se escribe.
 *
 * Sale el día 1 con el mes anterior (`/api/cron/resumen-mensual`) para cada piloto con al
 * menos un vuelo cargado (a quién, lo decide el backend: `services/resumen_mensual.py`).
 * Contesta las tres preguntas del inicio mirando el mes:
 *
 * - **Qué volaste:** vuelos, horas, aterrizajes, aeródromos y el vuelo más largo, contra
 *   el mes anterior.
 * - **Cuánto te falta:** el camino a la PPA para un alumno, a la PCA para quien tiene la
 *   privada, con los mismos cálculos del inicio (`requisitosPPA`, `requisitosLicencia`).
 *   Así el mail y la app nunca dicen dos números distintos.
 * - **Cuánto te queda:** el saldo o las horas del pack, y lo gastado en el mes.
 *
 * Y si el CMA vence pronto, lo avisa. Un mes sin vuelos no se saltea: "¿volaste y no lo
 * cargaste?" es justamente lo que trae de vuelta a quien dejó de usar la app.
 *
 * Puro, sin fechas del sistema ni `toLocaleString`: el mes y "hoy" entran como texto.
 */
import { aperturaDelAlumno, horasDeAperturaPPA } from "@/lib/apertura-alumno";
import type { Aircraft, Flight, FlightPack, Logbook, Transaction } from "@/types";
import { esAlumno, vuelosDesdeLaPpa } from "@/lib/licencias";
import { pendientesDelCad } from "@/lib/cad";
import { horasQueFaltan, requisitosLicencia } from "@/lib/pca-progress";
import { horasQueFaltanPPA, requisitosPPA } from "@/lib/ppa-progress";
import { costosPorVuelo, gastoDelMes } from "@/lib/costos";
import { nightLandingsOf } from "@/lib/landings";
import { idsDeSimuladores, separarSimuladores } from "@/lib/simulador";
import { allAirports, openingTotals } from "@/lib/summary";
import { rutaLegible } from "@/lib/social";
import { bloque, boton as botonMail, numeroGrande, parrafo, plantillaMail, type Icono } from "@/lib/mail-plantilla";

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "2026-09" → "septiembre de 2026". */
export function nombreDelMes(mes: string): string {
  const [anio, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]} de ${anio}`;
}

/** "2026-09" → "2026-08". */
export function mesAnteriorA(mes: string): string {
  const [anio, m] = mes.split("-").map(Number);
  return m > 1 ? `${anio}-${String(m - 1).padStart(2, "0")}` : `${anio - 1}-12`;
}

/** Horas con coma, como se escriben en Argentina: 6,2. */
export const horas = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace(".", ",");

/** Pesos con punto de miles, sin centavos y sin depender del locale de Node. */
export const pesosAR = (n: number) => {
  const signo = n < 0 ? "-" : "";
  return `${signo}$ ${String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
};

/** "2026-11-12" → "12/11/2026". */
const fechaCorta = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};

export interface EntradaResumen {
  /** "YYYY-MM", el mes que se resume. */
  mes: string;
  /** "YYYY-MM-DD" en Argentina: el día que sale el mail. Para el aviso del CMA. */
  hoyIso: string;
  nombre: string | null;
  licencia: string | null;
  fechaPpa: string | null;
  trackingMode: string | null;
  flights: Flight[];
  aircraft: Aircraft[];
  logbooks: Logbook[];
  transactions: Transaction[];
  documents: { kind: string; expiry_date: string | null }[];
  packs: FlightPack[];
  /** La travesía de 150 NM de la PPA: la mide el server, con las coordenadas. */
  travesiaLarga?: (f: Flight) => boolean;
}

export interface Resumen {
  mes: string;
  nombreMes: string;
  nombre: string | null;
  vuelos: number;
  horas: number;
  aterrizajes: number;
  aterrizajesNocturnos: number;
  horasNoche: number;
  aerodromos: string[];
  masLargo: { ruta: string; horas: number } | null;
  simulador: { sesiones: number; horas: number };
  /** Horas del mes anterior al resumido, para comparar. */
  horasMesAnterior: number;
  /** Lo acumulado al cierre del mes, con la apertura de los libros. */
  horasTotales: number;
  /** Cuánto falta para la próxima licencia, al cierre del mes y al empezarlo. */
  progreso: { meta: "PPA" | "PCA"; faltan: number; faltabanAlEmpezar: number } | null;
  /** En pesos, para quien lleva saldo. `null` si no aplica o no hay dato. */
  gasto: number | null;
  saldo: number | null;
  packs: { nombre: string; quedan: number }[];
  /** El CMA, si vence en los próximos 60 días o ya venció. */
  cma: { vence: string; vencido: boolean } | null;
  /** Vuelos sin pasar al CAD de ANAC al cierre del mes (`pendientesDelCad`). El alumno no declara en el CAD: 0. */
  cadPendientes: number;
}

const DIAS_AVISO_CMA = 60;

export function calcularResumen(e: EntradaResumen): Resumen {
  const finDelMes = `${e.mes}-31`;
  const hastaElCierre = e.flights.filter((f) => (f.date || "").slice(0, 10) <= finDelMes);
  const antesDelMes = hastaElCierre.filter((f) => (f.date || "").slice(0, 7) < e.mes);

  const simuladores = idsDeSimuladores(e.aircraft);
  const delMes = separarSimuladores(
    hastaElCierre.filter((f) => (f.date || "").startsWith(e.mes)),
    simuladores
  );
  const volados = delMes.volados;
  const delAnterior = separarSimuladores(
    hastaElCierre.filter((f) => (f.date || "").startsWith(mesAnteriorA(e.mes))),
    simuladores
  ).volados;

  const suma = (vs: Flight[], fn: (f: Flight) => number) => vs.reduce((t, f) => t + (fn(f) || 0), 0);
  const noche = (f: Flight) =>
    (f.pic_night_loc || 0) + (f.pic_night_tra || 0) + (f.sic_night_loc || 0) + (f.sic_night_tra || 0);

  const masLargoVuelo = volados.reduce<Flight | null>((m, f) => (!m || f.duration > m.duration ? f : m), null);

  const alumno = esAlumno(e.licencia);
  const licencia = (e.licencia || "").toUpperCase();
  const vaALaComercial = (licencia.includes("PPA") || licencia.includes("PRIVADO")) && !licencia.includes("PCA");

  let progreso: Resumen["progreso"] = null;
  if (alumno) {
    const faltan = (vs: Flight[]) =>
      horasQueFaltanPPA(requisitosPPA(vs, { aircraft: e.aircraft, logbooks: e.logbooks, travesiaLarga: e.travesiaLarga }));
    progreso = { meta: "PPA", faltan: faltan(hastaElCierre), faltabanAlEmpezar: faltan(antesDelMes) };
  } else if (vaALaComercial) {
    const faltan = (vs: Flight[]) =>
      horasQueFaltan(requisitosLicencia(vuelosDesdeLaPpa(vs, e.fechaPpa), e.logbooks, e.aircraft));
    progreso = { meta: "PCA", faltan: faltan(hastaElCierre), faltabanAlEmpezar: faltan(antesDelMes) };
  }

  const acumulados = separarSimuladores(vuelosDesdeLaPpa(hastaElCierre, alumno ? null : e.fechaPpa), simuladores).volados;

  const conSaldo = e.trackingMode === "balance";
  const gasto = conSaldo ? gastoDelMes(e.flights, costosPorVuelo(e.transactions), e.mes).pesos : 0;

  const cmas = e.documents.filter((d) => d.kind === "cma" && d.expiry_date).map((d) => d.expiry_date!.slice(0, 10)).sort();
  const ultimoCma = cmas.at(-1);
  const limiteAviso = new Date(Date.parse(`${e.hoyIso}T00:00:00Z`) + DIAS_AVISO_CMA * 86_400_000).toISOString().slice(0, 10);
  // Sin CMA cargado no se avisa nada: "no sé" no es "no hay" (invariante 2).
  const cma = ultimoCma && ultimoCma <= limiteAviso ? { vence: ultimoCma, vencido: ultimoCma < e.hoyIso } : null;

  return {
    mes: e.mes,
    nombreMes: nombreDelMes(e.mes),
    nombre: e.nombre?.trim() || null,
    vuelos: volados.length,
    horas: suma(volados, (f) => f.duration),
    aterrizajes: suma(volados, (f) => f.landings),
    aterrizajesNocturnos: suma(volados, nightLandingsOf),
    horasNoche: suma(volados, noche),
    aerodromos: allAirports(volados).map((a) => a.icao).filter((c) => c !== "LOCAL"),
    masLargo: masLargoVuelo ? { ruta: rutaLegible(masLargoVuelo.route) ?? "", horas: masLargoVuelo.duration } : null,
    simulador: { sesiones: delMes.simulados.length, horas: suma(delMes.simulados, (f) => f.duration) },
    horasMesAnterior: suma(delAnterior, (f) => f.duration),
    // Como en el inicio: con PPA rendida, desde la fecha de la PPA (`vuelosDesdeLaPpa`).
    // El alumno no lleva libro, así que no tiene horas de apertura.
    // El alumno no lleva libro: de los libros, sólo sus horas de antes (`apertura_ppa`).
    // Quien ya no es alumno deja esas afuera, como sus vuelos de alumno.
    horasTotales:
      suma(acumulados, (f) => f.duration) +
      (alumno ? horasDeAperturaPPA(aperturaDelAlumno(e.logbooks)) : openingTotals(e.logbooks, { alumno: false }).totalHours),
    progreso,
    gasto: conSaldo && gasto > 0 ? gasto : null,
    // El mismo saldo del inicio: la suma de los movimientos (`balance` en `/dashboard`).
    saldo: conSaldo && e.transactions.length > 0 ? e.transactions.reduce((t, x) => t + (Number(x.amount) || 0), 0) : null,
    packs: conSaldo ? [] : e.packs.filter((p) => p.is_active !== false).map((p) => ({ nombre: p.name, quedan: p.remaining_hours ?? 0 })),
    cma,
    cadPendientes: alumno ? 0 : pendientesDelCad(e.flights, e.aircraft, finDelMes),
  };
}

export interface MensajeResumen {
  asunto: string;
  texto: string;
  html: string;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Las líneas del mail, en el orden de las tres preguntas. Las comparten texto y HTML. */
function secciones(r: Resumen, appUrl = ""): { titulo: string; filas: string[]; link?: { texto: string; url: string } }[] {
  const salida: { titulo: string; filas: string[]; link?: { texto: string; url: string } }[] = [];

  const volado: string[] = [];
  if (r.vuelos > 0) {
    volado.push(`${plural(r.vuelos, "vuelo", "vuelos")}, ${horas(r.horas)} h y ${plural(r.aterrizajes, "aterrizaje", "aterrizajes")}.`);
    if (r.horasNoche > 0) {
      volado.push(`De noche: ${horas(r.horasNoche)} h y ${plural(r.aterrizajesNocturnos, "aterrizaje", "aterrizajes")}.`);
    }
    if (r.aerodromos.length) {
      volado.push(`${r.aerodromos.length === 1 ? "Aeródromo" : "Aeródromos"}: ${r.aerodromos.join(", ")}.`);
    }
    if (r.vuelos > 1 && r.masLargo) {
      volado.push(`El más largo: ${r.masLargo.ruta ? `${r.masLargo.ruta}, ` : ""}${horas(r.masLargo.horas)} h.`);
    }
    if (r.horasMesAnterior > 0) {
      const dif = Math.round((r.horas - r.horasMesAnterior) * 10) / 10;
      volado.push(
        dif === 0
          ? "Lo mismo que el mes anterior."
          : `${horas(Math.abs(dif))} h ${dif > 0 ? "más" : "menos"} que el mes anterior.`
      );
    }
  } else {
    volado.push(
      r.horasMesAnterior > 0
        ? `No cargaste vuelos (el mes anterior fueron ${horas(r.horasMesAnterior)} h). Si volaste, cargalo y queda al día.`
        : "No cargaste vuelos. Si volaste, cargalo y queda al día."
    );
  }
  if (r.simulador.sesiones > 0) {
    volado.push(`Simulador: ${plural(r.simulador.sesiones, "sesión", "sesiones")}, ${horas(r.simulador.horas)} h.`);
  }
  volado.push(`En total llevás ${horas(r.horasTotales)} h.`);
  salida.push({ titulo: "Lo que volaste", filas: volado });

  if (r.progreso) {
    const { meta, faltan, faltabanAlEmpezar } = r.progreso;
    const avance = Math.round((faltabanAlEmpezar - faltan) * 10) / 10;
    const filas =
      faltan <= 0
        ? [`Tenés las horas de experiencia que pide la ${meta}. Revisá el detalle en Vector antes de presentarte.`]
        : [
            meta === "PPA"
              ? `Te faltan ${horas(faltan)} h para las 40 de la PPA.`
              : `Te faltan al menos ${horas(faltan)} h para la PCA y la habilitación por instrumentos.`,
            ...(avance > 0 ? [`Este mes avanzaste ${horas(avance)} h.`] : []),
          ];
    salida.push({ titulo: `Camino a la ${meta}`, filas });
  }

  const queda: string[] = [];
  if (r.gasto !== null) queda.push(`Gastaste ${pesosAR(r.gasto)} en vuelos.`);
  if (r.saldo !== null) queda.push(r.saldo >= 0 ? `Tu saldo es de ${pesosAR(r.saldo)}.` : `Debés ${pesosAR(-r.saldo)}.`);
  for (const p of r.packs) queda.push(`${p.nombre}: te ${p.quedan === 1 ? "queda" : "quedan"} ${horas(p.quedan)} h.`);
  if (queda.length) salida.push({ titulo: "Lo que te queda", filas: queda });

  // Lo que falta declarar (Res. ANAC 470/2025): con los vuelos del mes cargados, el paso siguiente.
  if (r.cadPendientes > 0) {
    salida.push({
      titulo: "Para el CAD",
      filas: [`Te ${r.cadPendientes === 1 ? "falta pasar 1 vuelo" : `faltan pasar ${r.cadPendientes} vuelos`} al CAD de ANAC.`],
      link: { texto: "Pasarlos al CAD", url: `${appUrl}/dashboard/history/cad` },
    });
  }

  if (r.cma) {
    salida.push({
      titulo: "Atención",
      filas: [r.cma.vencido ? `Tu CMA venció el ${fechaCorta(r.cma.vence)}.` : `Tu CMA vence el ${fechaCorta(r.cma.vence)}.`],
    });
  }
  return salida;
}

export function armarMensajeResumen(r: Resumen, d: { appUrl: string; linkBaja: string }): MensajeResumen {
  const mes = r.nombreMes.split(" ")[0];
  const asunto =
    r.vuelos > 0
      ? `Tu ${mes} en Vector: ${horas(r.horas)} h en ${plural(r.vuelos, "vuelo", "vuelos")}`
      : `Tu ${mes} en Vector`;
  const saludo = r.nombre ? `Hola ${r.nombre}:` : "Hola:";
  const intro = `Tu resumen de ${r.nombreMes}.`;
  const partes = secciones(r, d.appUrl);
  const boton = r.vuelos > 0 ? { texto: "Ver tu bitácora", link: `${d.appUrl}/dashboard` } : { texto: "Cargar un vuelo", link: `${d.appUrl}/dashboard/log-flight` };
  const pie = "Te llega el primer día de cada mes.";

  const texto = [
    saludo,
    "",
    intro,
    ...partes.flatMap((s) => ["", s.titulo.toUpperCase(), ...s.filas.map((f) => `- ${f}`), ...(s.link ? [`  ${s.link.url}`] : [])]),
    "",
    `${boton.texto}: ${boton.link}`,
    "",
    `${pie} Para no recibirlo más: ${d.linkBaja}`,
    "",
    "Vector · Tu bitácora de vuelo, siempre al día.",
  ].join("\n");

  const icono = (titulo: string): Icono =>
    titulo === "Lo que volaste"
      ? "plane"
      : titulo === "Lo que te queda"
        ? "wallet"
        : titulo === "Atención"
          ? "triangle-alert"
          : titulo === "Para el CAD"
            ? "pencil-line"
            : "target";
  const html = plantillaMail({
    appUrl: d.appUrl,
    preencabezado:
      r.vuelos > 0
        ? `${horas(r.horas)} h en ${plural(r.vuelos, "vuelo", "vuelos")}, y lo que te falta para la próxima licencia.`
        : "¿Volaste y no lo cargaste? Tu resumen del mes.",
    pildora: `Resumen de ${r.nombreMes}`,
    // Los números van en la tarjeta negra; el título no los repite.
    titulo: r.vuelos > 0 ? [`Tu ${mes}`, "en Vector."] : [`Tu ${mes} en Vector.`, "¿Volaste y no lo cargaste?"],
    cuerpo: [
      parrafo(r.nombre ? `Hola ${r.nombre}, este es tu resumen de ${r.nombreMes}.` : `Este es tu resumen de ${r.nombreMes}.`),
      r.vuelos > 0
        ? numeroGrande({
            etiqueta: r.nombreMes,
            numero: horas(r.horas),
            unidad: "h",
            detalle: `${plural(r.vuelos, "vuelo", "vuelos")} · ${plural(r.aterrizajes, "aterrizaje", "aterrizajes")}`,
          })
        : "",
      ...partes.map((s) => bloque(d.appUrl, { icono: icono(s.titulo), titulo: s.titulo, filas: s.filas, link: s.link, alerta: s.titulo === "Atención" })),
      `<div style="height:8px;line-height:8px">&nbsp;</div>`,
      botonMail(boton.texto, boton.link),
    ].join("\n"),
    pie,
    pieLink: { texto: "No recibirlo más", url: d.linkBaja },
  });

  return { asunto, texto, html };
}
