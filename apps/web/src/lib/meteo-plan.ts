/**
 * La meteorología y los NOTAM **a la hora del vuelo**, para el plan de vuelo.
 *
 * ## Por qué a la hora y no "los de hoy"
 *
 * FPL.AR avisa de NOTAM con sólo mirar si están vigentes, y le marcó a Federico un NOTAM
 * que no aplicaba a su horario (2026-10-19). Muchos NOTAM de ANAC son de una ventana
 * larga (semanas) con un horario adentro, escrito al final del texto:
 *
 *     RWY 05/23 CLSD WIP MAINT 07 0530-0830 09, 14, 16, 21, 23, 28 AND 30 0430-0830
 *     ACFT STAND PSN 4B AND H4 CLSD 1000-2200
 *
 * Acá se lee ese horario y se cruza con la ventana del vuelo. **Cuando el horario no se
 * entiende sin dudas** (días de la semana, salida y puesta del sol, "EXC"…), el NOTAM va
 * como "revisá el horario": decir que no afecta a algo que afecta es peor que no decirlo
 * ("no sé" no es "no hay", invariante 2).
 *
 * ## El TAF, a la hora
 *
 * Del TAF se muestran los grupos que valen a esa hora, tal cual están escritos: el
 * pronóstico de base o el último `FM`, los `BECMG` que ya empezaron, y los `TEMPO` y
 * `PROB` que la cubren. No se traduce ni se resume: el piloto lee el mismo texto que el
 * briefing oficial, sólo que recortado a su hora.
 *
 * Todo en UTC, como los NOTAM (casillas B y C) y el TAF. Puro: la hora entra como
 * parámetro.
 */

const HORA_MS = 3_600_000;
const DIA_MS = 24 * HORA_MS;

/* -------------------------------------------------------------------------- */
/* La ventana del vuelo                                                        */
/* -------------------------------------------------------------------------- */

/** Margen antes de la salida y después de la llegada: rodaje, demora, espera. */
export const MARGEN_VENTANA_MIN = 60;

export interface Ventana {
  desde: number;
  hasta: number;
}

export function ventanaDelVuelo(salidaMs: number, llegadaMs: number): Ventana {
  return { desde: salidaMs - MARGEN_VENTANA_MIN * 60_000, hasta: llegadaMs + MARGEN_VENTANA_MIN * 60_000 };
}

const seCruzan = (a: Ventana, b: Ventana) => a.desde < b.hasta && b.desde < a.hasta;

/* -------------------------------------------------------------------------- */
/* TAF                                                                          */
/* -------------------------------------------------------------------------- */

export interface GrupoTaf {
  tipo: "BASE" | "FM" | "BECMG" | "TEMPO" | "PROB";
  desde: number;
  hasta: number;
  /** El grupo tal cual, con su encabezado (`BECMG 2017/2019 10015KT`). */
  texto: string;
}

export interface Taf {
  estacion: string;
  desde: number;
  hasta: number;
  grupos: GrupoTaf[];
}

/**
 * Un `DDHHMM` del TAF, que no trae mes: se elige el mes (el de la referencia, el anterior o
 * el siguiente) que deja la fecha más cerca de la referencia. La hora 24 es la medianoche
 * siguiente (`2124` en un período).
 */
function fechaDelTaf(dia: number, hora: number, minuto: number, referencia: number): number | null {
  if (dia < 1 || dia > 31 || hora > 24 || minuto > 59) return null;
  const r = new Date(referencia);
  let mejor: number | null = null;
  for (const delta of [-1, 0, 1]) {
    const base = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + delta, dia));
    // El 31 en un mes de 30 desborda al mes siguiente: no es esa fecha.
    if (base.getUTCDate() !== dia) continue;
    const ms = base.getTime() + hora * HORA_MS + minuto * 60_000;
    if (mejor === null || Math.abs(ms - referencia) < Math.abs(mejor - referencia)) mejor = ms;
  }
  return mejor;
}

function periodo(token: string, referencia: number): Ventana | null {
  const m = /^(\d{2})(\d{2})\/(\d{2})(\d{2})$/.exec(token);
  if (!m) return null;
  const desde = fechaDelTaf(+m[1], +m[2], 0, referencia);
  if (desde === null) return null;
  // El fin se resuelve contra el comienzo: un período nunca va para atrás.
  const hasta = fechaDelTaf(+m[3], +m[4], 0, desde + 12 * HORA_MS);
  return hasta !== null && hasta > desde ? { desde, hasta } : null;
}

/**
 * Lee un TAF crudo (`TAF SADF 201100Z 2012/2112 07010KT CAVOK …`). `null` si no tiene la
 * forma de un TAF: un texto que no se entiende no se recorta.
 */
export function parsearTaf(crudo: string, referenciaIso: string): Taf | null {
  const t = crudo.replace(/=\s*$/, "").trim().split(/\s+/);
  let i = 0;
  if (t[i] === "TAF") i++;
  while (t[i] === "AMD" || t[i] === "COR") i++;
  const estacion = t[i++];
  if (!/^[A-Z]{4}$/.test(estacion ?? "")) return null;
  const referencia = Date.parse(referenciaIso);
  const emision = /^(\d{2})(\d{2})(\d{2})Z$/.exec(t[i] ?? "");
  const refEmision = emision ? fechaDelTaf(+emision[1], +emision[2], +emision[3], referencia) ?? referencia : referencia;
  if (emision) i++;
  const validez = periodo(t[i++] ?? "", refEmision);
  if (!validez) return null;

  // Se corta en grupos: cada palabra clave abre uno nuevo.
  const crudos: string[][] = [[]];
  for (; i < t.length; i++) {
    const tok = t[i];
    const abre = /^FM\d{6}$/.test(tok) || tok === "BECMG" || tok === "TEMPO" || /^PROB\d{2}$/.test(tok);
    // `PROB30 TEMPO` es un solo grupo.
    if (abre && !(tok === "TEMPO" && /^PROB\d{2}$/.test(crudos[crudos.length - 1][0] ?? "") && crudos[crudos.length - 1].length === 1)) {
      crudos.push([]);
    }
    crudos[crudos.length - 1].push(tok);
  }

  const grupos: GrupoTaf[] = [{ tipo: "BASE", desde: validez.desde, hasta: validez.hasta, texto: crudos[0].join(" ") }];
  for (const g of crudos.slice(1)) {
    const cabeza = g[0];
    const fm = /^FM(\d{2})(\d{2})(\d{2})$/.exec(cabeza);
    if (fm) {
      const desde = fechaDelTaf(+fm[1], +fm[2], +fm[3], validez.desde + 12 * HORA_MS);
      if (desde === null) return null;
      grupos.push({ tipo: "FM", desde, hasta: validez.hasta, texto: g.join(" ") });
      continue;
    }
    const idx = g.findIndex((x) => /^\d{4}\/\d{4}$/.test(x));
    const p = idx >= 0 ? periodo(g[idx], validez.desde + 12 * HORA_MS) : null;
    if (!p) return null;
    grupos.push({ tipo: cabeza === "BECMG" ? "BECMG" : cabeza === "TEMPO" ? "TEMPO" : "PROB", desde: p.desde, hasta: p.hasta, texto: g.join(" ") });
  }

  // Un FM termina donde empieza el siguiente, y la base donde empieza el primero.
  const cambios = grupos.filter((g) => g.tipo === "BASE" || g.tipo === "FM");
  cambios.forEach((g, k) => {
    if (cambios[k + 1]) g.hasta = cambios[k + 1].desde;
  });
  return { estacion, desde: validez.desde, hasta: validez.hasta, grupos };
}

/**
 * Los grupos del TAF que valen a una hora: el pronóstico vigente (base o último FM), los
 * BECMG que ya empezaron después de él, y los TEMPO y PROB que cubren esa hora. `null` si la
 * hora está fuera de la validez del TAF.
 */
export function tafALaHora(taf: Taf, hora: number): string[] | null {
  if (hora < taf.desde || hora >= taf.hasta) return null;
  const vigente = taf.grupos.filter((g) => (g.tipo === "BASE" || g.tipo === "FM") && g.desde <= hora).pop()!;
  const lineas = [vigente.tipo === "BASE" ? vigente.texto.replace(/\s*\bT[XN]M?\d{2}\/\d{4}Z\b/g, "") : vigente.texto];
  for (const g of taf.grupos) {
    if (g.tipo === "BECMG" && g.desde >= vigente.desde && g.desde <= hora) lineas.push(g.texto);
    if ((g.tipo === "TEMPO" || g.tipo === "PROB") && g.desde <= hora && hora < g.hasta) lineas.push(g.texto);
  }
  return lineas;
}

/* -------------------------------------------------------------------------- */
/* NOTAM                                                                        */
/* -------------------------------------------------------------------------- */

export interface NotamAnac {
  codigo: string;
  /** `YYYY-MM-DD HH:MM:SS` en UTC, como lo publica ANAC. */
  desde: string;
  /** `null` = permanente (ANAC manda `0000-00-00 00:00:00`). */
  hasta: string | null;
  texto: string;
}

export type ClaseNotam = "afecta" | "revisar" | "noEnTuHorario" | "permanente" | "fuera";

function msAnac(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(s);
  if (!m || m[1] === "0000") return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
}

/** Palabras de un horario que este lector no resuelve: con ellas, "revisá el horario". */
const HORARIO_DUDOSO = /\b(SR|SS|MON|TUE|WED|THU|FRI|SAT|SUN|LUN|MAR|MIE|JUE|VIE|SAB|DOM|DLY|DAILY|EXC|HJ|HN|H24|WKD|WEEKDAYS?|DIARIO)\b/;
const RANGO = /^(\d{2})(\d{2})-(\d{2})(\d{2})$/;

/**
 * El horario del final de un NOTAM de ANAC: grupos de "días del mes, hora-hora", leídos de
 * atrás para adelante. `[]` si el texto no termina en un horario (vale toda la vigencia), y
 * `null` si termina en algo que parece horario y no se entiende.
 */
export function horarioDelNotam(texto: string): { dias: number[]; desde: string; hasta: string }[] | null {
  const tokens = texto.trim().replace(/[.)]+$/, "").split(/\s+/);
  const grupos: { dias: number[]; desde: string; hasta: string }[] = [];
  let i = tokens.length - 1;
  while (i >= 0) {
    const r = RANGO.exec(tokens[i]);
    if (!r) break;
    if (+r[1] > 24 || +r[2] > 59 || +r[3] > 24 || +r[4] > 59) return null;
    i--;
    const dias: number[] = [];
    while (i >= 0) {
      const tok = tokens[i];
      if (tok === "AND" || tok === "Y") {
        i--;
        continue;
      }
      const d = /^(\d{1,2}),?$/.exec(tok);
      if (!d || +d[1] < 1 || +d[1] > 31) break;
      dias.unshift(+d[1]);
      i--;
    }
    grupos.unshift({ dias, desde: `${r[1]}${r[2]}`, hasta: `${r[3]}${r[4]}` });
  }
  // Un grupo sin días sólo se entiende si es el único ("CLSD 1000-2200": todos los días).
  if (grupos.length > 1 && grupos.some((g) => g.dias.length === 0)) return null;
  return grupos;
}

/** Los intervalos en que rige el horario, dentro de la vigencia del NOTAM. */
function intervalos(grupos: { dias: number[]; desde: string; hasta: string }[], vigencia: Ventana): Ventana[] {
  const out: Ventana[] = [];
  const dia0 = Date.UTC(new Date(vigencia.desde).getUTCFullYear(), new Date(vigencia.desde).getUTCMonth(), new Date(vigencia.desde).getUTCDate());
  const enElDia = (diaMs: number, g: { desde: string; hasta: string }) => {
    const a = diaMs + +g.desde.slice(0, 2) * HORA_MS + +g.desde.slice(2) * 60_000;
    let b = diaMs + +g.hasta.slice(0, 2) * HORA_MS + +g.hasta.slice(2) * 60_000;
    if (b <= a) b += DIA_MS;
    out.push({ desde: Math.max(a, vigencia.desde), hasta: Math.min(b, vigencia.hasta) });
  };
  let cursor = dia0;
  for (const g of grupos) {
    if (g.dias.length === 0) {
      for (let d = dia0; d < vigencia.hasta; d += DIA_MS) enElDia(d, g);
      continue;
    }
    for (const dia of g.dias) {
      // El primer día con ese número desde el cursor: los días van en orden y pueden pasar de mes.
      let d = cursor;
      for (let k = 0; k < 62 && new Date(d).getUTCDate() !== dia; k++) d += DIA_MS;
      if (new Date(d).getUTCDate() !== dia) return [];
      enElDia(d, g);
      cursor = d;
    }
  }
  return out.filter((v) => v.hasta > v.desde);
}

/**
 * Cómo pega un NOTAM en la ventana del vuelo:
 * - `fuera`: su vigencia no la toca;
 * - `permanente`: sin fecha de fin (obstáculos, enmiendas al AIP);
 * - `afecta`: rige en algún momento de la ventana;
 * - `noEnTuHorario`: está vigente pero su horario no cae en la ventana;
 * - `revisar`: está vigente y su horario no se entiende sin dudas.
 */
export function clasificarNotam(n: NotamAnac, ventana: Ventana): ClaseNotam {
  const desde = msAnac(n.desde) ?? -Infinity;
  const hasta = n.hasta ? msAnac(n.hasta) : null;
  if (desde >= ventana.hasta) return "fuera";
  if (hasta !== null && hasta <= ventana.desde) return "fuera";
  const grupos = horarioDelNotam(n.texto);
  if (hasta === null) return grupos && grupos.length > 0 ? "revisar" : "permanente";
  if (grupos === null) return "revisar";
  if (grupos.length === 0) return HORARIO_DUDOSO.test(n.texto) ? "revisar" : "afecta";
  const rigen = intervalos(grupos, { desde, hasta });
  if (rigen.length === 0) return "revisar";
  return rigen.some((v) => seCruzan(v, ventana)) ? "afecta" : "noEnTuHorario";
}

/** "21/10 0100Z": sin `toLocaleString` (invariante 1). */
export function horaZ(ms: number): string {
  const d = new Date(ms);
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${dos(d.getUTCDate())}/${dos(d.getUTCMonth() + 1)} ${dos(d.getUTCHours())}${dos(d.getUTCMinutes())}Z`;
}

/** La vigencia de un NOTAM para mostrar: "21/10 0100Z – 21/10 0800Z" o "permanente". */
export function vigenciaNotam(n: NotamAnac): string {
  const desde = msAnac(n.desde);
  const hasta = n.hasta ? msAnac(n.hasta) : null;
  if (hasta === null) return desde !== null ? `desde ${horaZ(desde)}, permanente` : "permanente";
  return `${desde !== null ? horaZ(desde) : "?"} – ${horaZ(hasta)}`;
}
