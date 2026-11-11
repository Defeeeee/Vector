import type { Aircraft, Flight, PilotDocument, Profile } from "@/types";
import { documentStatus } from "./utils";
import { recencyByClass, recencyWindowDays } from "./recency";
import { pilotStatus } from "./pilot-status";
import { esAlumno } from "./licencias";
import { soloVolados } from "./simulador";
import { frescura, horaDeObservacion } from "./frescura";
import { antiguedad } from "./anac-vigencia";
import { paraPdf, type Piernera } from "./piernera";

/**
 * El briefing de la ruta en PDF (A4, blanco y negro): qué va en cada sección y cómo se escribe.
 * Puro y testeado; el dibujo está en `briefing-pdf.ts`.
 *
 * ## Qué es y qué no es
 *
 * No es `lib/briefing.ts` (el veredicto meteorológico de la ruta en pantalla): esto es la hoja que
 * se lleva, con lo que el piloto mira antes de salir. Las reglas que no se rompen:
 *
 * - **"No sé" no es "no hay"** (invariante 2): un dato que no se pudo leer dice "no se pudo
 *   leer", nunca "podés volar" ni "sin NOTAM".
 * - **Fechas hechas a mano, en UTC** (invariante 1): nada de `toLocaleString`.
 * - **De cuándo es cada dato**: el METAR, los NOTAM y la hora en que se armó la hoja. Un papel no
 *   se actualiza, así que tiene que decir cuándo se escribió.
 */

/* ------------------------------------------------------------------ fechas a mano --- */

const dos = (n: number) => String(n).padStart(2, "0");

/** "11/11/2026 14:05 UTC". */
export function fechaHoraUtc(d: Date): string {
  return `${dos(d.getUTCDate())}/${dos(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())} UTC`;
}

/** "14:05 UTC". */
export function horaUtc(d: Date): string {
  return `${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())} UTC`;
}

/** "2026-11-11" o un ISO largo → "11/11/2026". Lo que no es una fecha vuelve igual. */
export function fechaCorta(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Las fechas ISO que aparecen adentro de un texto, a dd/mm/aaaa. */
export function fechasLegibles(texto: string): string {
  return texto.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, "$3/$2/$1");
}

/* ------------------------------------------------------------ ¿puedo volar hoy? --- */

/** Las secciones del payload de `/dashboard` sin las que no se puede decir nada. */
const NECESARIAS: Record<string, string> = {
  profile: "tu perfil",
  documents: "tus documentos",
  flights: "tus vuelos",
  aircraft: "tus aviones",
};

export interface EntradaPiloto {
  profile: Profile | null;
  documents: PilotDocument[];
  /** El libro entero: acá se le saca el simulador (`soloVolados`). */
  flights: Flight[];
  aircraft: Aircraft[];
  /** Lo que el backend nombró como no leído (`unavailable` de `/dashboard`). */
  unavailable: string[];
}

export interface ResumenPiloto {
  /** Cuándo se armó (UTC, ya escrito en el server). */
  armadoEn: string;
  /**
   * La respuesta de `pilotStatus` ("Podés volar…"), o `null` si faltó algo que leer: entonces
   * **no hay respuesta** y la hoja dice por qué.
   */
  puede: string | null;
  detalle: string | null;
  paraVolver: string | null;
  seccion: string | null;
  /** Lo que no se pudo leer, con nombre. */
  noLeido: string[];
  /** Vencimientos y recencia, ya escritos. */
  items: { etiqueta: string; valor: string }[];
}

export const MAX_DOCUMENTOS = 8;

/**
 * El resumen del piloto con la misma lógica del inicio (`pilotStatus`), ya escrito. Corre en el
 * server (`actions/briefing.ts`).
 *
 * Si falta cualquiera de las cuatro lecturas, **no se responde**: con los vuelos sin leer, la
 * lista de recencias queda vacía y `pilotStatus` diría "vigente".
 */
export function armarResumenPiloto(e: EntradaPiloto, ahora: Date): ResumenPiloto {
  const armadoEn = fechaHoraUtc(ahora);
  const noLeido = Object.entries(NECESARIAS)
    .filter(([clave]) => e.unavailable.includes(clave) || (clave === "profile" && !e.profile))
    .map(([, nombre]) => nombre);
  if (noLeido.length) {
    return { armadoEn, puede: null, detalle: null, paraVolver: null, seccion: null, noLeido, items: [] };
  }

  const alumno = esAlumno(e.profile?.license_type);
  const volados = soloVolados(e.flights, e.aircraft);
  const recencias = recencyByClass(volados, e.aircraft, recencyWindowDays(e.profile?.license_type), ahora);
  const estado = pilotStatus(e.documents, recencias, volados, ahora, true, { alumno });

  const items: ResumenPiloto["items"] = [];
  const conFecha = e.documents
    .map((d) => ({ d, st: documentStatus(d.expiry_date, ahora) }))
    .sort((a, b) => (a.st.daysRemaining ?? 1e9) - (b.st.daysRemaining ?? 1e9));
  for (const { d, st } of conFecha.slice(0, MAX_DOCUMENTOS)) {
    items.push({
      etiqueta: paraPdf(d.name),
      valor: d.expiry_date ? `${fechaCorta(d.expiry_date)} (${st.label.toLowerCase()})` : "sin vencimiento",
    });
  }
  if (conFecha.length > MAX_DOCUMENTOS) {
    items.push({ etiqueta: "...", valor: `y ${conFecha.length - MAX_DOCUMENTOS} documentos más en el Hangar` });
  }
  // El alumno no tiene experiencia reciente (61.140 es de quien ejerce una licencia).
  if (!alumno) {
    if (recencias.length === 0) {
      items.push({ etiqueta: "Experiencia reciente", valor: "sin vuelos computables cargados" });
    }
    for (const r of recencias) {
      items.push({
        etiqueta: paraPdf(`Experiencia reciente ${r.clase}`),
        valor: r.vigente && r.expiresOn ? `vigente hasta el ${fechaCorta(r.expiresOn)}` : "vencida o sin los 3 aterrizajes",
      });
    }
  }

  return {
    armadoEn,
    puede: paraPdf(estado.puede),
    detalle: estado.detalle ? paraPdf(fechasLegibles(estado.detalle)) : null,
    paraVolver: estado.paraVolver ? paraPdf(estado.paraVolver) : null,
    seccion: estado.seccion ? `RAAC ${estado.seccion}` : null,
    noLeido: [],
    items,
  };
}

/** Las líneas de la sección "¿Puedo volar hoy?" para el PDF. */
export function lineasDelPiloto(r: ResumenPiloto | null): { titulo: string; lineas: string[]; items: ResumenPiloto["items"] } {
  const titulo = "PUEDO VOLAR HOY";
  if (!r) {
    return { titulo, lineas: ["No se pudo leer tu estado. Esta hoja no dice si podés volar: mirá el inicio de Vector."], items: [] };
  }
  if (r.puede === null) {
    return {
      titulo,
      lineas: [
        `No se pudo leer ${r.noLeido.join(", ")}.`,
        "Esta hoja no dice si podés volar: mirá el inicio de Vector cuando tengas señal.",
      ],
      items: [],
    };
  }
  const lineas = [r.puede];
  if (r.paraVolver) lineas.push(r.paraVolver);
  if (r.detalle) lineas.push(r.detalle);
  lineas.push(
    `${r.seccion ? `${r.seccion}. ` : ""}Según los documentos y vuelos cargados en Vector al ${r.armadoEn}. No mira el avión, el aeroclub ni el clima.`
  );
  return { titulo, lineas, items: r.items };
}

/* ------------------------------------------------------------------- aeródromos --- */

export interface NotamBriefing {
  code: string;
  from: string;
  to: string;
  textRaw?: string;
  textEsp?: string;
}

/** Lo que se trajo de un aeródromo (`briefing-pdf-consulta.ts`). */
export interface EstacionBriefing {
  codigo: string;
  nombre: string;
  /** `/api/weather` contestó. Si no, ni el METAR ni el TAF se saben. */
  climaRespondio: boolean;
  metar: string | null;
  taf: string | null;
  /** ISO, si el upstream lo mandó (`observadoEn`). */
  observadoEn: string | null;
  estacionCercana: { icao: string; name: string; distanceNm: number } | null;
  /** `null` = no se pudo preguntar. `[]` = no hay. No es lo mismo. */
  notams: NotamBriefing[] | null;
  notamsCapturadosEn: string | null;
  notamsFuente: "descarga" | "anac" | "navegador" | null;
}

/** Los aeródromos que entran en una hoja: más pedidos a ANAC y más papel no ayudan a decidir. */
export const MAX_AERODROMOS_BRIEFING = 10;
export const MAX_NOTAMS = 15;
export const MAX_TEXTO_NOTAM = 600;

/** Cortar lo largo, sin partir una palabra y diciendo que se cortó. */
export function cortar(texto: string, max: number): string {
  const t = texto.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, max);
  const sinPalabraMedia = corte.includes(" ") ? corte.slice(0, corte.lastIndexOf(" ")) : corte;
  return `${sinPalabraMedia} [...cortado: el texto entero, en el NOTAM]`;
}

const FUENTE_NOTAM: Record<NonNullable<EstacionBriefing["notamsFuente"]>, string> = {
  descarga: "descarga de ANAC",
  anac: "ANAC",
  navegador: "ANAC",
};

export interface BloqueEstacion {
  titulo: string;
  /** Avisos arriba (METAR de otra estación, dato viejo…). */
  avisos: string[];
  metar: string | null;
  taf: string | null;
  /** Si no hay METAR/TAF, por qué. */
  notaClima: string | null;
  /** De cuándo es lo del clima. */
  fechaClima: string;
  notams: { encabezado: string; texto: string }[];
  /** "Sin NOTAM vigentes." / "No se pudo consultar los NOTAM." / "y 3 más…" */
  notaNotams: string;
  /** De cuándo son los NOTAM. */
  fechaNotams: string;
}

export function armarEstacion(e: EstacionBriefing, ahora: Date): BloqueEstacion {
  const avisos: string[] = [];
  let notaClima: string | null = null;
  const metar = e.metar ? paraPdf(e.metar.replace(/\s+/g, " ")) : null;
  const taf = e.taf ? paraPdf(e.taf.replace(/\s+/g, " ")) : null;

  if (!e.climaRespondio) {
    notaClima = "No se pudo leer el METAR ni el TAF.";
  } else if (!metar && !taf) {
    notaClima = "Sin METAR ni TAF publicados para este aeródromo.";
  }

  if (e.estacionCercana) {
    avisos.push(
      paraPdf(`Sin METAR propio: el de abajo es de ${e.estacionCercana.name} (${e.estacionCercana.icao}), a ${e.estacionCercana.distanceNm} NM.`)
    );
  }
  if (metar) {
    const f = frescura(horaDeObservacion(e.observadoEn, metar, ahora), ahora);
    if (!f) avisos.push("No se pudo saber de cuándo es el METAR.");
    else if (f.nivel === "inservible") avisos.push(`METAR VIEJO (${f.texto}): no sirve para decidir.`);
    else if (f.nivel === "viejo") avisos.push(`METAR de ${f.texto}: ya no es reciente.`);
  }
  const fechaClima = e.climaRespondio ? `METAR y TAF consultados a las ${horaUtc(ahora)}.` : "";

  let notams: BloqueEstacion["notams"] = [];
  let notaNotams: string;
  let fechaNotams = "";
  if (e.notams === null) {
    notaNotams = "No se pudo consultar los NOTAM: no es que no haya. Miralos antes de salir.";
  } else {
    const lista = e.notams.slice(0, MAX_NOTAMS);
    notams = lista.map((n) => ({
      encabezado: paraPdf(`${n.code}  ${n.from} -> ${n.to}`.replace(/\s+/g, " ").trim()),
      texto: paraPdf(cortar(n.textEsp || n.textRaw || "", MAX_TEXTO_NOTAM)).replace(/\s+/g, " ").trim(),
    }));
    notaNotams =
      e.notams.length === 0
        ? "Sin NOTAM vigentes."
        : e.notams.length > MAX_NOTAMS
          ? `${e.notams.length} NOTAM vigentes; acá van los primeros ${MAX_NOTAMS}. Faltan ${e.notams.length - MAX_NOTAMS}.`
          : `${e.notams.length} NOTAM vigentes.`;
    const t = e.notamsCapturadosEn ? new Date(e.notamsCapturadosEn) : null;
    if (t && !Number.isNaN(t.getTime())) {
      const hace = antiguedad(e.notamsCapturadosEn, ahora);
      fechaNotams = `NOTAM de ${e.notamsFuente ? FUENTE_NOTAM[e.notamsFuente] : "ANAC"}, verificados a las ${horaUtc(t)}${hace ? ` (${hace})` : ""}.`;
    } else {
      fechaNotams = "No se sabe de cuándo son estos NOTAM.";
    }
  }

  return {
    titulo: paraPdf(e.nombre && e.nombre !== e.codigo ? `${e.codigo}  ${e.nombre}` : e.codigo),
    avisos,
    metar,
    taf,
    notaClima,
    fechaClima,
    notams,
    notaNotams,
    fechaNotams,
  };
}

/* ------------------------------------------------------------------------ ruta --- */

export interface EspacioBriefing {
  tipo: string;
  nombre: string;
  clase: string | null;
  limites: string;
  aproximado: boolean;
}

/** "CTR  SAN FERNANDO - Clase D" y debajo los límites. `null` = no se calcularon. */
export function lineasDeEspacios(espacios: EspacioBriefing[] | null): { lineas: string[]; nota: string } {
  const nota = "Del AIP (AD 2.17 y ENR 2.1). Sólo los que dibuja el mapa; la altura la decidís vos con sus límites.";
  if (espacios === null) return { lineas: ["No se pudieron calcular los espacios aéreos de la ruta."], nota: "" };
  if (!espacios.length) return { lineas: ["Ninguno de los que dibuja el mapa."], nota };
  return {
    lineas: espacios.map((e) =>
      paraPdf(
        `${e.tipo} ${e.nombre.replace(/^(CTR|ATZ|TMA)\s+/, "")}${e.clase ? `, clase ${e.clase}` : ""}: ${e.limites}${e.aproximado ? " (contorno aproximado)" : ""}`
      )
    ),
    nota,
  };
}

export interface DatosBriefing {
  armado: Date;
  ruta: string;
  avion: string | null;
  piloto: ResumenPiloto | null;
  estaciones: EstacionBriefing[];
  /** Los aeródromos de la ruta que no entraron (tope), para decirlo. */
  estacionesOmitidas: number;
  piernera: Piernera;
  espacios: EspacioBriefing[] | null;
}

export const PIE =
  "Armado por Vector con datos del AIP (espacios, frecuencias, aeródromos), de aviationweather.gov (METAR y TAF) y de ANAC (NOTAM). No reemplaza el briefing oficial.";

export function tituloBriefing(d: DatosBriefing): string {
  return paraPdf(`Briefing ${d.ruta}`);
}

/** "Briefing-SADF-SADM.pdf". */
export function nombreBriefing(tokens: string[]): string {
  const t = tokens.filter((x) => x && x !== "DCT");
  return `Briefing-${(t.length ? [t[0], t[t.length - 1]] : ["ruta"]).join("-").replace(/[^A-Z0-9-]/gi, "")}.pdf`;
}

/* ------------------------------------------------------------------------ texto --- */

/**
 * Parte un texto en renglones que entren en `ancho`, según `medir`. Una palabra más larga que el
 * renglón (un METAR pegado, una URL) se parte a la fuerza: nunca se corta de más ni se sale.
 */
export function envolver(texto: string, medir: (s: string) => number, ancho: number): string[] {
  const salida: string[] = [];
  let actual = "";
  for (const palabra of texto.replace(/\s+/g, " ").trim().split(" ")) {
    if (!palabra) continue;
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (medir(prueba) <= ancho) {
      actual = prueba;
      continue;
    }
    if (actual) salida.push(actual);
    actual = "";
    let resto = palabra;
    while (medir(resto) > ancho && resto.length > 1) {
      let n = resto.length - 1;
      while (n > 1 && medir(resto.slice(0, n)) > ancho) n--;
      salida.push(resto.slice(0, n));
      resto = resto.slice(n);
    }
    actual = resto;
  }
  if (actual) salida.push(actual);
  return salida;
}
