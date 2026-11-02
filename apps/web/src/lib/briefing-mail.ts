import { severidadDe, veredictoDeRuta, type CategoriaVuelo, type EstacionRuta, type Veredicto } from "./briefing";
import { BORDE, GRIS, MONO, FUENTE, NEGRO, bloque, boton, escapar, estado, etiqueta, parrafo, plantillaMail } from "./mail-plantilla";

/**
 * El briefing del vuelo de mañana, armado para mandar.
 *
 * ## Qué problema resuelve
 *
 * Vector arma un briefing excelente **y hay que entrar a buscarlo**. El vuelo del sábado
 * se decide el viernes a la noche, que es cuando el TAF del día siguiente ya está publicado
 * y todavía se está a tiempo de cambiar el plan. Si el aviso llega cuando el piloto abre la
 * app, llega tarde para eso.
 *
 * ## Lo que este módulo **no** hace, a propósito
 *
 * **No reemplaza al briefing en vivo, y lo dice.** Un mail armado a las seis de la tarde y
 * leído a las siete de la mañana tiene trece horas: el METAR cambió, el TAF se enmendó y
 * puede haber un NOTAM nuevo. Así que lleva la hora en la que se armó, bien visible, y un
 * link al planificador con la ruta cargada — que sí es en vivo.
 *
 * Un mail que se presenta como el briefing definitivo es peor que ningún mail: reemplaza
 * una consulta que el piloto iba a hacer igual por una foto vieja.
 *
 * ## Es puro
 *
 * Recibe los datos ya buscados y devuelve texto. Es lo único de esta feature que se puede
 * testear —el cron y el envío no— y es donde vive todo lo que se puede equivocar: el
 * veredicto, los redondeos y, sobre todo, **qué se dice cuando el servicio no contestó**.
 */

export interface PuntoBriefing {
  icao: string;
  label: string;
  metar?: string;
  taf?: string;
  categoria: CategoriaVuelo;
  /** Nudos de viento cruzado sobre la mejor pista, si se pudo calcular. */
  cruzadoKt?: number;
  /** La cabecera que conviene con ese viento. */
  pista?: string;
  /** Nudos de viento en superficie. `null` si no vino. */
  vientoKt?: number | null;
  /** Cuántos NOTAM activos. `null` si el servicio no contestó. */
  notams?: number | null;
  respondio: boolean;
}

export interface DatosBriefing {
  /** ISO `YYYY-MM-DD` del vuelo. */
  fecha: string;
  /** Como lo escribió el piloto: `SADM SAAJ`. */
  ruta: string;
  matricula?: string;
  puntos: PuntoBriefing[];
  /** Link al planificador con la ruta cargada. Es el briefing que sí está vivo. */
  urlPlanificador: string;
  /** Cuándo se armó esto, ya formateado en hora local. */
  armadoA: string;
  /** El sitio, para el logo y los íconos. Si falta, se toma del link al planificador. */
  appUrl?: string;
}

export interface Mensaje {
  asunto: string;
  texto: string;
  html: string;
}

/** Cómo se lee cada categoría, sin siglas para quien no las tenga presentes. */
const CATEGORIA: Record<CategoriaVuelo, string> = {
  VFR: "VFR",
  MVFR: "VFR marginal",
  IFR: "IFR",
  LIFR: "IFR bajo",
  UNK: "sin datos",
};

/**
 * A partir de cuántos nudos de cruzado el mail lo menciona.
 *
 * Quince es el mismo umbral que usa la pantalla (`VIENTO_ATENCION_KT`) y no se elige otro
 * acá: dos umbrales para la misma cosa harían que el mail y el briefing discreparan sobre
 * si hay que prestar atención, y el piloto tendría que decidir a cuál creerle.
 */
export const CRUZADO_A_MENCIONAR_KT = 15;

/** El veredicto de la ruta, con las estaciones que respondieron. */
export function veredictoDe(puntos: PuntoBriefing[]): Veredicto {
  const estaciones: EstacionRuta[] = puntos.map((p) => ({
    icao: p.icao,
    categoria: p.categoria,
    // `null` y no cero: cero nudos es calma, que es un dato; la ausencia es otra cosa.
    vientoKt: p.vientoKt ?? null,
    notams: p.notams ?? null,
    respondio: p.respondio,
  }));
  return veredictoDeRuta(estaciones);
}

/**
 * Lo que hay que mirar antes de salir, en una línea por cosa.
 *
 * **Sólo lo que se aparta de lo normal.** Un mail que enumera las diez cosas que están bien
 * entierra la única que no, y se deja de leer a la tercera vez. Si no hay nada que marcar,
 * lo dice en una línea y se termina.
 */
export function avisos(puntos: PuntoBriefing[]): string[] {
  const out: string[] = [];

  for (const p of puntos) {
    if (!p.respondio) {
      out.push(`${p.icao}: no pudimos consultar el estado. No es que esté bien, es que no lo sabemos.`);
      continue;
    }
    const sev = severidadDe(p.categoria);
    if (sev !== null && sev > 0) {
      out.push(`${p.icao}: ${CATEGORIA[p.categoria]}.`);
    }
    if (p.cruzadoKt !== undefined && p.cruzadoKt >= CRUZADO_A_MENCIONAR_KT) {
      out.push(`${p.icao}: ${Math.round(p.cruzadoKt)} kt de cruzado${p.pista ? ` en la ${p.pista}` : ""}.`);
    }
    if (p.notams) {
      out.push(`${p.icao}: ${p.notams} NOTAM ${p.notams === 1 ? "activo" : "activos"}.`);
    }
  }

  return out;
}

/** `2026-08-20` → `jueves 20 de agosto`. */
export function fechaLarga(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  // Mediodía UTC para que el día no se corra al leerlo en UTC-3, que es el bug de
  // hidratación que este repo ya se comió dos veces. Ver `planned-flights.ts`.
  const fecha = new Date(Date.UTC(a, m - 1, d, 12));
  return `${dias[fecha.getUTCDay()]} ${d} de ${meses[m - 1]}`;
}

/**
 * El mensaje completo, en texto y en HTML.
 *
 * Los dos, y no sólo HTML, porque un cliente de correo que no renderiza —o un piloto que
 * lee desde el reloj— tiene que poder entenderlo igual. El texto no es un resumen del HTML:
 * es el mismo contenido.
 */
export function armarMensaje(datos: DatosBriefing): Mensaje {
  const veredicto = veredictoDe(datos.puntos);
  const lista = avisos(datos.puntos);
  const cuando = fechaLarga(datos.fecha);

  const asunto = `Vuelo del ${cuando}: ${datos.ruta} — ${veredicto.titulo}`;

  const lineas = [
    `Vuelo del ${cuando}`,
    `${datos.ruta}${datos.matricula ? ` · ${datos.matricula}` : ""}`,
    "",
    veredicto.titulo,
    veredicto.detalle,
    "",
  ];

  if (lista.length) {
    lineas.push("Para mirar antes de salir:", ...lista.map((a) => `  · ${a}`), "");
  } else {
    lineas.push("No hay nada que marcar en los puntos de la ruta.", "");
  }

  for (const p of datos.puntos) {
    lineas.push(`${p.icao} — ${p.label || ""}`.trim());
    lineas.push(`  ${p.respondio ? CATEGORIA[p.categoria] : "sin datos"}`);
    if (p.metar) lineas.push(`  METAR  ${p.metar}`);
    if (p.taf) lineas.push(`  TAF    ${p.taf}`);
    lineas.push("");
  }

  lineas.push(
    /*
      **El párrafo que evita que este mail haga daño.** Un briefing congelado a la tarde y
      leído a la mañana tiene medio día encima, y presentado como definitivo reemplaza una
      consulta que el piloto iba a hacer igual.
    */
    "Ver el briefing completo — METAR y TAF actualizados, NOTAM, viento cruzado, planilla de navegación",
    "y aeródromos cerca:",
    datos.urlPlanificador,
    "",
    `Esto se armó el ${datos.armadoA} y el clima cambia. Mirá el briefing en vivo antes de salir.`,
    "",
    "Vector"
  );

  const appUrl = datos.appUrl ?? new URL(datos.urlPlanificador).origin;

  /** Un aeródromo de la ruta: el código, el nombre, la categoría y el METAR y el TAF. */
  const estacion = (p: PuntoBriefing) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px;border:1px solid ${BORDE};border-radius:16px"><tr><td style="padding:14px 16px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="middle">
        <span style="font-family:${MONO};font-size:15px;font-weight:700;letter-spacing:.06em;color:${NEGRO}">${escapar(p.icao)}</span>
        <span style="font-family:${FUENTE};font-size:13px;color:#71717a">&nbsp;&nbsp;${escapar(p.label || "")}</span>
      </td>
      <td align="right" valign="middle" style="font-family:${MONO};font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${GRIS};white-space:nowrap">${escapar(p.respondio ? CATEGORIA[p.categoria] : "sin datos")}</td>
    </tr></table>
    ${p.metar ? `<p style="margin:10px 0 0;font-family:${MONO};font-size:11px;line-height:1.5;color:${GRIS};word-break:break-all">${escapar(p.metar)}</p>` : ""}
    ${p.taf ? `<p style="margin:6px 0 0;font-family:${MONO};font-size:11px;line-height:1.5;color:#71717a;word-break:break-all">${escapar(p.taf)}</p>` : ""}
  </td></tr></table>`;

  const html = plantillaMail({
    appUrl,
    preencabezado: `${veredicto.titulo}. ${datos.ruta}, ${cuando}.`,
    pildora: `Vuelo del ${cuando}`,
    titulo: [datos.matricula ? `${datos.ruta} · ${datos.matricula}` : datos.ruta, "El briefing de tu vuelo."],
    cuerpo: [
      estado({ tono: veredicto.tono, titulo: veredicto.titulo, detalle: veredicto.detalle }),
      lista.length
        ? bloque(appUrl, { icono: "triangle-alert", titulo: "Para mirar antes de salir", filas: lista })
        : parrafo("No hay nada que marcar en los puntos de la ruta."),
      `<div style="height:6px;line-height:6px">&nbsp;</div>`,
      etiqueta("Los aeródromos de la ruta"),
      ...datos.puntos.map(estacion),
      `<div style="height:10px;line-height:10px">&nbsp;</div>`,
      boton("Ver el briefing completo", datos.urlPlanificador),
      /*
        **El párrafo que evita que este mail haga daño**, igual que en el texto: armado a la
        tarde y leído a la mañana, el METAR y el TAF ya cambiaron.
      */
      `<p style="margin:12px 0 0;font-family:${FUENTE};font-size:13px;line-height:1.6;color:${GRIS}">Ahí están el METAR y el TAF actualizados, los NOTAM, el viento cruzado sobre la pista, la planilla de navegación y los aeródromos cerca. <strong style="color:${NEGRO}">Esto se armó el ${escapar(datos.armadoA)} y el clima cambia.</strong></p>`,
    ].join("\n"),
    pie: "Te llega la tarde antes de cada vuelo que programás en Vector.",
  });

  return { asunto, texto: lineas.join("\n"), html };
}
