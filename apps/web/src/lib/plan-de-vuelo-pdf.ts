import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { PlanOaci } from "./plan-de-vuelo";

/**
 * El plan de vuelo en el **formulario de EANA**: el que imprimen las oficinas ARO/AIS,
 * con "EANA Navegación Aérea Argentina" arriba y el lugar para la firma del comandante.
 *
 * **De dónde sale el fondo.** `plan-de-vuelo-eana.jpg` es el formulario en blanco, sacado
 * del PDF con el que Federico presentó un plan el 10/10/2026 y se lo aceptaron. En ese
 * PDF el formulario es una imagen de 1240×1754 (150 dpi en A4) y los datos van como texto
 * encima. Se le sacaron los datos, la firma y los metadatos; la imagen quedó intacta.
 *
 * **De dónde salen las coordenadas.** Las cajas se midieron sobre esa imagen (los
 * rectángulos blancos) y las letras de la casilla 19, de las cruces de aquel PDF. Están
 * en puntos PDF, con el origen abajo a la izquierda. La letra también es la de aquel
 * PDF: Helvetica de 11, negrita en las cajas, y en la casilla 18 el indicador en negrita
 * y el dato no.
 *
 * Corre en el navegador: el planificador anda sin señal, y el plan de vuelo también.
 * El fondo se lo pasa quien llama, para que este archivo no sepa de URLs.
 */

const ANCHO = 595.28; // A4
const ALTO = 841.89;
const NEGRO = rgb(0, 0, 0);
const TAMANO = 11;

type Caja = [x1: number, y1: number, x2: number, y2: number];

/** Las cajas del formulario de EANA, en puntos. */
const CAJAS = {
  c7: [179.1, 632.6, 305.8, 646.0],
  c8reglas: [396.1, 632.6, 412.4, 646.0],
  c8tipo: [503.1, 632.6, 519.4, 646.0],
  c9numero: [54.7, 590.3, 88.8, 603.8],
  c9tipo: [143.5, 590.3, 215.1, 603.8],
  c9estela: [297.2, 590.3, 313.5, 603.8],
  // La casilla 10 trae la barra impresa en x≈491: a la izquierda 10 a), a la derecha 10 b).
  c10a: [338.0, 590.3, 488.0, 603.8],
  c10b: [494.0, 590.3, 547.8, 603.8],
  c13ad: [161.3, 553.9, 232.8, 567.3],
  c13hora: [360.5, 553.9, 430.1, 567.3],
  c15velocidad: [37.4, 512.6, 124.3, 525.0],
  c15nivel: [161.3, 512.6, 252.0, 525.0],
  c16ad: [90.3, 411.3, 159.9, 424.7],
  c16eet: [216.5, 411.3, 288.0, 424.7],
  c16altn1: [342.8, 411.3, 412.4, 424.7],
  c16altn2: [467.6, 411.3, 537.2, 424.7],
  autonomia: [54.7, 266.8, 124.3, 279.7],
  personas: [197.3, 266.8, 252.0, 279.7],
  botesNumero: [72.5, 166.0, 106.6, 179.4],
  botesCapacidad: [143.5, 166.0, 215.1, 179.4],
  botesColor: [325.0, 166.0, 483.9, 179.4],
  colorMarcas: [72.5, 129.5, 555.0, 142.9],
  observaciones: [72.5, 99.2, 501.7, 112.2],
  piloto: [72.5, 68.5, 394.6, 81.5],
  presentadoPor: [18.2, 22.4, 215.1, 58.9],
} satisfies Record<string, Caja>;

/** Los renglones de la ruta (casilla 15) y de otros datos (18). */
const RENGLONES_RUTA: Caja[] = [
  [289.5, 512.6, 572.7, 525.0],
  [18.2, 498.6, 572.7, 511.1],
  [18.2, 484.2, 572.7, 496.7],
  [18.2, 470.3, 572.7, 482.8],
  [18.2, 455.9, 537.2, 468.9],
];
const RENGLONES_18: Caja[] = [
  [54.7, 375.7, 572.7, 388.2],
  [18.2, 361.3, 572.7, 374.3],
  [18.2, 347.4, 572.7, 359.9],
  [18.2, 333.0, 537.2, 346.0],
];

/** Los recuadros de las letras de la casilla 19: [x1, y1, x2, y2]. */
const ALTO_LETRA = 17.2;
const letraEn = (x: number, y: number): Caja => [x, y, x + 20.2, y + ALTO_LETRA];
const LETRAS = {
  radioU: letraEn(429.4, 265.3),
  radioV: letraEn(464.4, 265.3),
  radioE: letraEn(499.4, 265.3),
  supS: letraEn(70.4, 215.3),
  supP: letraEn(106.4, 215.3),
  supD: letraEn(142.4, 215.3),
  supM: letraEn(176.4, 215.3),
  supJ: letraEn(210.4, 215.3),
  chalJ: letraEn(288.4, 215.3),
  chalL: letraEn(341.4, 215.3),
  chalF: letraEn(394.4, 215.3),
  chalU: letraEn(447.4, 215.3),
  chalV: letraEn(501.4, 215.3),
  botesD: letraEn(35.4, 164.3),
  botesC: letraEn(252.4, 164.3),
  obsN: letraEn(35.4, 97.9),
};

/** La firma va arriba del rótulo impreso "Firma del Comandante de la aeronave". */
const FIRMA: Caja = [300, 33, 565, 58];

interface Fuentes {
  normal: PDFFont;
  negrita: PDFFont;
}

/** El renglón base que centra mayúsculas en la caja (alto de mayúscula de Helvetica ≈ 0,718). */
function base(c: Caja, size: number) {
  return c[1] + (c[3] - c[1] - size * 0.718) / 2;
}

/** Centrado en la caja; se achica si no entra. */
function centrado(page: PDFPage, f: PDFFont, texto: string, c: Caja) {
  if (!texto) return;
  let size = TAMANO;
  while (size > 6 && f.widthOfTextAtSize(texto, size) > c[2] - c[0] - 4) size -= 0.5;
  const w = f.widthOfTextAtSize(texto, size);
  page.drawText(texto, { x: c[0] + (c[2] - c[0] - w) / 2, y: base(c, size), size, font: f, color: NEGRO });
}

/** Alineado a la izquierda, como A/, N/ y C/ en el formulario presentado. */
function izquierda(page: PDFPage, f: PDFFont, texto: string, c: Caja) {
  if (!texto) return;
  let size = TAMANO;
  while (size > 6 && f.widthOfTextAtSize(texto, size) > c[2] - c[0] - 3) size -= 0.5;
  page.drawText(texto, { x: c[0] + 1.5, y: base(c, size), size, font: f, color: NEGRO });
}

/**
 * Texto que corre por renglones, cortando entre palabras. Con `indicadores`, lo que va
 * antes de la barra (`DOF/`) sale en negrita, como en la casilla 18 del formulario.
 * Devuelve `false` si no entró.
 */
function enRenglones(page: PDFPage, f: Fuentes, texto: string, renglones: Caja[], indicadores: boolean): boolean {
  const espacio = f.normal.widthOfTextAtSize(" ", TAMANO);
  const partes = (palabra: string) => {
    const m = indicadores ? /^([A-Z]{2,4}\/)(.*)$/.exec(palabra) : null;
    return m ? [{ t: m[1], font: f.negrita }, { t: m[2], font: f.normal }] : [{ t: palabra, font: f.normal }];
  };
  const ancho = (palabra: string) => partes(palabra).reduce((s, p) => s + p.font.widthOfTextAtSize(p.t, TAMANO), 0);

  let r = 0;
  let x = renglones[0][0] + 3;
  for (const palabra of texto.split(" ").filter(Boolean)) {
    const w = ancho(palabra);
    if (x + w > renglones[r][2] - 3 && x > renglones[r][0] + 3) {
      r += 1;
      if (r >= renglones.length) return false;
      x = renglones[r][0] + 3;
    }
    for (const p of partes(palabra)) {
      page.drawText(p.t, { x, y: base(renglones[r], TAMANO), size: TAMANO, font: p.font, color: NEGRO });
      x += p.font.widthOfTextAtSize(p.t, TAMANO);
    }
    x += espacio;
  }
  return true;
}

/**
 * La cruz sobre una letra de la casilla 19: "TÁCHESE U si no está disponible la
 * frecuencia UHF" (AIP ENR 1.10). Como en el formulario presentado, de esquina a esquina.
 */
function tachar(page: PDFPage, c: Caja) {
  const t = { thickness: 1.3, color: NEGRO };
  page.drawLine({ start: { x: c[0] + 2, y: c[1] + 2 }, end: { x: c[2] - 2, y: c[3] - 2 }, ...t });
  page.drawLine({ start: { x: c[0] + 2, y: c[3] - 2 }, end: { x: c[2] - 2, y: c[1] + 2 }, ...t });
}

export interface OpcionesPdfPlan {
  /** El formulario en blanco (`plan-de-vuelo-eana.jpg`). */
  fondoJpg: Uint8Array;
  /** La firma dibujada en la pantalla, como PNG. Sin firma queda el lugar para firmar a mano. */
  firmaPng?: Uint8Array;
}

export async function pdfPlanDeVuelo(p: PlanOaci, opciones: OpcionesPdfPlan): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Plan de vuelo ${p.c7} ${p.c13ad}-${p.c16ad}`);
  doc.setAuthor(p.presentadoPor || p.c19.piloto);
  doc.setCreator("Vector");
  doc.setProducer("Vector");
  doc.setSubject("Formulario de plan de vuelo de EANA (modelo OACI)");

  const f: Fuentes = {
    normal: await doc.embedFont(StandardFonts.Helvetica),
    negrita: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const page = doc.addPage([ANCHO, ALTO]);
  const fondo = await doc.embedJpg(opciones.fondoJpg);
  page.drawImage(fondo, { x: 0, y: 0, width: ANCHO, height: ALTO });

  const n = f.negrita;
  centrado(page, n, p.c7, CAJAS.c7);
  centrado(page, n, p.c8reglas, CAJAS.c8reglas);
  centrado(page, n, p.c8tipo, CAJAS.c8tipo);
  centrado(page, n, p.c9numero, CAJAS.c9numero);
  centrado(page, n, p.c9tipo, CAJAS.c9tipo);
  centrado(page, n, p.c9estela, CAJAS.c9estela);
  centrado(page, n, p.c10a, CAJAS.c10a);
  centrado(page, n, p.c10b, CAJAS.c10b);
  centrado(page, n, p.c13ad, CAJAS.c13ad);
  centrado(page, n, p.c13hora, CAJAS.c13hora);
  centrado(page, n, p.c15velocidad, CAJAS.c15velocidad);
  centrado(page, n, p.c15nivel, CAJAS.c15nivel);
  enRenglones(page, f, p.c15ruta, RENGLONES_RUTA, false);
  centrado(page, n, p.c16ad, CAJAS.c16ad);
  centrado(page, n, p.c16eet, CAJAS.c16eet);
  centrado(page, n, p.c16altn1, CAJAS.c16altn1);
  centrado(page, n, p.c16altn2, CAJAS.c16altn2);
  enRenglones(page, f, p.c18, RENGLONES_18, true);

  const c = p.c19;
  centrado(page, n, c.autonomia, CAJAS.autonomia);
  centrado(page, n, c.personas, CAJAS.personas);
  if (!c.radio.u) tachar(page, LETRAS.radioU);
  if (!c.radio.v) tachar(page, LETRAS.radioV);
  if (!c.radio.e) tachar(page, LETRAS.radioE);
  if (!c.supervivencia.s) tachar(page, LETRAS.supS);
  if (!c.supervivencia.p) tachar(page, LETRAS.supP);
  if (!c.supervivencia.d) tachar(page, LETRAS.supD);
  if (!c.supervivencia.m) tachar(page, LETRAS.supM);
  if (!c.supervivencia.j) tachar(page, LETRAS.supJ);
  if (!c.chalecos.j) tachar(page, LETRAS.chalJ);
  if (!c.chalecos.l) tachar(page, LETRAS.chalL);
  if (!c.chalecos.f) tachar(page, LETRAS.chalF);
  if (!c.chalecos.u) tachar(page, LETRAS.chalU);
  if (!c.chalecos.v) tachar(page, LETRAS.chalV);
  if (!c.botes.d) tachar(page, LETRAS.botesD);
  if (!c.botes.c) tachar(page, LETRAS.botesC);
  centrado(page, n, c.botes.numero, CAJAS.botesNumero);
  centrado(page, n, c.botes.capacidad, CAJAS.botesCapacidad);
  izquierda(page, n, c.botes.color, CAJAS.botesColor);
  izquierda(page, n, c.colorMarcas, CAJAS.colorMarcas);
  if (c.observaciones === null) tachar(page, LETRAS.obsN);
  else izquierda(page, n, c.observaciones, CAJAS.observaciones);
  izquierda(page, n, c.piloto, CAJAS.piloto);

  // Presentado por: el nombre, arriba a la izquierda de su caja.
  const pp = CAJAS.presentadoPor;
  izquierda(page, n, p.presentadoPor, [pp[0] + 2, pp[3] - 16, pp[2] - 2, pp[3] - 3]);

  if (opciones.firmaPng) {
    const firma = await doc.embedPng(opciones.firmaPng);
    const escala = Math.min((FIRMA[2] - FIRMA[0]) / firma.width, (FIRMA[3] - FIRMA[1]) / firma.height);
    const w = firma.width * escala;
    page.drawImage(firma, { x: FIRMA[0] + (FIRMA[2] - FIRMA[0] - w) / 2, y: FIRMA[1], width: w, height: firma.height * escala });
  }

  return doc.save();
}

/* -------------------------------------------------------------------------- */
/* La demora (DLA)                                                             */
/* -------------------------------------------------------------------------- */

/**
 * El formulario de demora del Apéndice 4 de la AIP ENR 1.10 (`plan-de-vuelo-dla.png`).
 *
 * En la AIP el formulario es una imagen puesta en x 42,55–552,75 pt; acá va en el mismo
 * lugar de la hoja A4, así que las cajas se miden en píxeles de esa imagen y `pdfMensaje`
 * las pasa a puntos. La cancelación (Apéndice 5) es la misma planilla.
 */
/**
 * Un carácter por celda, como en el formulario impreso. Si no entra —una licencia de 8
 * cifras en las 6 celdas de "LIC NRO" de la AIP—, se tapan las divisiones y va centrado de
 * corrido: el número entero y legible, no pisado por las rayitas.
 */
function enCeldas(page: PDFPage, f: PDFFont, texto: string, c: Caja, n: number) {
  if (!texto) return;
  if (texto.length > n) {
    page.drawRectangle({ x: c[0] + 1, y: c[1], width: c[2] - c[0] - 2, height: c[3] - c[1], color: rgb(1, 1, 1) });
    // Los bordes de arriba y de abajo, que el blanco tapó a medias.
    for (const y of [c[1], c[3]]) page.drawLine({ start: { x: c[0], y }, end: { x: c[2], y }, thickness: 0.6, color: NEGRO });
    return centrado(page, f, texto, c);
  }
  const ancho = (c[2] - c[0]) / n;
  [...texto].forEach((ch, i) => {
    const w = f.widthOfTextAtSize(ch, TAMANO);
    page.drawText(ch, { x: c[0] + ancho * i + (ancho - w) / 2, y: base(c, TAMANO), size: TAMANO, font: f, color: NEGRO });
  });
}

export interface DatosPdfDemora {
  plan: PlanOaci;
  /** La nueva EOBT (UTC) y la casilla 18 con la DOF/ de la nueva fecha. */
  eobt: string;
  c18: string;
  nombre: string;
  licencia: string;
}

/**
 * Un formulario de mensaje ATS de la AIP (demora o cancelación): son la misma planilla con
 * otro título, así que cambian el fondo, dónde lo puso la AIP y las cajas medidas en él.
 */
interface FormularioMensaje {
  /** Ancho de la imagen en píxeles, y dónde la puso la AIP: pt desde el borde de arriba. */
  anchoPx: number;
  altoPx: number;
  arribaPt: number;
  cajas: Record<"c7" | "c13ad" | "c13hora" | "c16ad" | "c16eet" | "c16altn" | "nombre" | "licencia" | "firma", [number, number, number, number]>;
  renglones: [number, number][];
}

async function pdfMensaje(
  m: FormularioMensaje,
  d: DatosPdfDemora,
  opciones: { fondoPng: Uint8Array; firmaPng?: Uint8Array },
  meta: { titulo: string; asunto: string }
): Promise<Uint8Array> {
  const k = (552.75 - 42.55) / m.anchoPx;
  const x = (px: number) => 42.55 + px * k;
  const y = (py: number) => ALTO - (m.arribaPt + py * k);
  const caja = ([x1, y1, x2, y2]: [number, number, number, number]): Caja => [x(x1), y(y2), x(x2), y(y1)];

  const doc = await PDFDocument.create();
  doc.setTitle(meta.titulo);
  doc.setCreator("Vector");
  doc.setProducer("Vector");
  doc.setSubject(meta.asunto);
  const f: Fuentes = {
    normal: await doc.embedFont(StandardFonts.Helvetica),
    negrita: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const page = doc.addPage([ANCHO, ALTO]);
  const fondo = await doc.embedPng(opciones.fondoPng);
  page.drawImage(fondo, { x: x(0), y: y(m.altoPx), width: x(m.anchoPx) - x(0), height: y(0) - y(m.altoPx) });

  const n = f.negrita;
  enCeldas(page, n, d.plan.c7, caja(m.cajas.c7), 7);
  enCeldas(page, n, d.plan.c13ad, caja(m.cajas.c13ad), 4);
  enCeldas(page, n, d.eobt, caja(m.cajas.c13hora), 4);
  enCeldas(page, n, d.plan.c16ad, caja(m.cajas.c16ad), 4);
  enCeldas(page, n, d.plan.c16eet, caja(m.cajas.c16eet), 4);
  enCeldas(page, n, d.plan.c16altn1, caja(m.cajas.c16altn), 4);
  enRenglones(page, f, d.c18, m.renglones.map(([y1, y2]) => caja([6, y1, m.anchoPx - 12, y2])), true);
  izquierda(page, n, d.nombre, caja(m.cajas.nombre));
  enCeldas(page, n, d.licencia, caja(m.cajas.licencia), 6);

  if (opciones.firmaPng) {
    const firma = await doc.embedPng(opciones.firmaPng);
    const c = caja(m.cajas.firma);
    const escala = Math.min((c[2] - c[0]) / firma.width, (c[3] - c[1]) / firma.height);
    const w = firma.width * escala;
    page.drawImage(firma, { x: c[0] + (c[2] - c[0] - w) / 2, y: c[1], width: w, height: firma.height * escala });
  }
  return doc.save();
}

/** La demora: Apéndice 4, imagen de 895×835 px a 140,9 pt del borde de arriba. */
const DLA: FormularioMensaje = {
  anchoPx: 895,
  altoPx: 835,
  arribaPt: 140.9,
  cajas: {
    c7: [277, 344, 518, 382],
    c13ad: [128, 425, 260, 451],
    c13hora: [372, 425, 502, 451],
    c16ad: [128, 540, 260, 566],
    c16eet: [372, 540, 502, 566],
    c16altn: [579, 540, 715, 566],
    nombre: [8, 795, 384, 826],
    licencia: [390, 802, 594, 826],
    firma: [610, 795, 880, 830],
  },
  renglones: [622, 644, 666, 688, 710, 732, 754].map((y) => [y, y + 22]),
};

/**
 * La cancelación: Apéndice 5 (ENR 1.10-41, AIRAC AMDT 2/2025), `plan-de-vuelo-cnl.png`.
 * La imagen de la AIP es de 876×847 px, en x 42,55–552,75 pt y a 148,22 pt del borde de
 * arriba. Las cajas se midieron con las líneas negras de la imagen, y se le borró el
 * recuadro verde de selección que quedó en la casilla 18 cuando la exportaron de una planilla.
 */
const CNL: FormularioMensaje = {
  anchoPx: 876,
  altoPx: 847,
  arribaPt: 148.22,
  cajas: {
    c7: [278, 329, 512, 367],
    c13ad: [130, 410, 262, 437],
    c13hora: [366, 410, 496, 437],
    c16ad: [130, 506, 262, 533],
    c16eet: [366, 506, 496, 533],
    c16altn: [562, 506, 699, 533],
    nombre: [8, 795, 380, 836],
    licencia: [382, 816, 580, 840],
    firma: [585, 795, 865, 838],
  },
  renglones: [589, 614, 636, 658, 680, 702, 724, 746, 768].map((y, i, a) => [y, a[i + 1] ?? 790]),
};

export function pdfDemora(d: DatosPdfDemora, opciones: { fondoPng: Uint8Array; firmaPng?: Uint8Array }): Promise<Uint8Array> {
  return pdfMensaje(DLA, d, opciones, {
    titulo: `Demora ${d.plan.c7} ${d.plan.c13ad} ${d.eobt}`,
    asunto: "Formulario de demora (DLA), AIP Argentina ENR 1.10, Apéndice 4",
  });
}

/** La cancelación (CNL): la EOBT y la DOF/ son las vigentes (la de la última demora, si hubo). */
export function pdfCancelacion(d: DatosPdfDemora, opciones: { fondoPng: Uint8Array; firmaPng?: Uint8Array }): Promise<Uint8Array> {
  return pdfMensaje(CNL, d, opciones, {
    titulo: `Cancelación ${d.plan.c7} ${d.plan.c13ad} ${d.eobt}`,
    asunto: "Formulario de cancelación (CNL), AIP Argentina ENR 1.10, Apéndice 5",
  });
}
