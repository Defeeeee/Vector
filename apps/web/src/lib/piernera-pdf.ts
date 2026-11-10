import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { Piernera } from "./piernera";

/**
 * La piernera en PDF (3.15.0): una hoja A5 vertical, en blanco y negro para imprimir y llevar en
 * la pierna. Se arma en el navegador con pdf-lib, como el plan de vuelo: anda sin señal.
 * Lo que va en cada renglón lo decide `piernera.ts`.
 */

const A5 = { ancho: 419.53, alto: 595.28 };
const MARGEN = 28;
const NEGRO = rgb(0.07, 0.08, 0.1);
const GRIS = rgb(0.42, 0.45, 0.5);
const LINEA = rgb(0.78, 0.8, 0.83);

/** Las columnas de la tabla: rótulo, ancho y si el texto va a la derecha. */
const COLUMNAS: { rotulo: string; ancho: number; derecha?: boolean }[] = [
  { rotulo: "#", ancho: 16 },
  { rotulo: "TRAMO", ancho: 128 },
  { rotulo: "RUMBO", ancho: 46, derecha: true },
  { rotulo: "NM", ancho: 36, derecha: true },
  { rotulo: "TIEMPO", ancho: 40, derecha: true },
  { rotulo: "ACUM.", ancho: 40, derecha: true },
  { rotulo: "ETA", ancho: 28, derecha: true },
  { rotulo: "ATA", ancho: 29.5, derecha: true },
];

export async function armarPdfPiernera(p: Piernera): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Piernera ${p.titulo}`);
  doc.setCreator("Vector");
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);
  let pagina = doc.addPage([A5.ancho, A5.alto]);
  // `y` se cuenta desde arriba, como se lee la hoja; pdf-lib la cuenta desde abajo.
  let y = MARGEN;
  const texto = (pg: PDFPage, t: string, x: number, yy: number, f: PDFFont, tam: number, color = NEGRO) =>
    pg.drawText(t, { x, y: A5.alto - yy - tam, size: tam, font: f, color });
  const recortar = (t: string, f: PDFFont, tam: number, ancho: number) => {
    let s = t;
    while (s.length > 1 && f.widthOfTextAtSize(s, tam) > ancho) s = s.slice(0, -1);
    return s === t ? s : `${s.slice(0, -1)}.`;
  };
  const linea = (pg: PDFPage, yy: number, grosor = 0.5, color = LINEA) =>
    pg.drawLine({ start: { x: MARGEN, y: A5.alto - yy }, end: { x: A5.ancho - MARGEN, y: A5.alto - yy }, thickness: grosor, color });

  texto(pagina, "VECTOR  -  PIERNERA", MARGEN, y, mono, 7.5, GRIS);
  y += 14;
  texto(pagina, recortar(p.titulo, negrita, 15, A5.ancho - 2 * MARGEN), MARGEN, y, negrita, 15);
  y += 20;
  if (p.subtitulo) {
    texto(pagina, recortar(p.subtitulo, fuente, 9, A5.ancho - 2 * MARGEN), MARGEN, y, fuente, 9, GRIS);
    y += 16;
  }

  // La tabla de tramos.
  const encabezado = (pg: PDFPage, yy: number) => {
    let x = MARGEN;
    for (const c of COLUMNAS) {
      const w = mono.widthOfTextAtSize(c.rotulo, 6.5);
      texto(pg, c.rotulo, c.derecha ? x + c.ancho - w - 3 : x + 2, yy, mono, 6.5, GRIS);
      x += c.ancho;
    }
    linea(pg, yy + 11, 0.8, NEGRO);
  };
  encabezado(pagina, y);
  y += 13;
  const ALTO = 19;
  for (const r of p.renglones) {
    if (y + ALTO > A5.alto - 150) {
      pagina = doc.addPage([A5.ancho, A5.alto]);
      y = MARGEN;
      encabezado(pagina, y);
      y += 13;
    }
    const valores = [r.n, r.tramo, r.rumbo, r.distancia, r.tiempo, r.acumulado, "", ""];
    let x = MARGEN;
    COLUMNAS.forEach((c, k) => {
      const f = k === 1 ? negrita : mono;
      const tam = k === 1 ? 8.5 : 8.5;
      const v = recortar(valores[k], f, tam, c.ancho - 5);
      const w = f.widthOfTextAtSize(v, tam);
      texto(pagina, v, c.derecha ? x + c.ancho - w - 3 : x + 2, y + 5, f, tam);
      x += c.ancho;
    });
    linea(pagina, y + ALTO);
    y += ALTO;
  }

  // Los totales.
  y += 8;
  const totales = [`Total ${p.totales.distancia}`, `${p.totales.tiempo} sin viento`, p.totales.combustible].filter(Boolean).join("     ");
  texto(pagina, totales, MARGEN, y, negrita, 9.5);
  y += 22;

  // Con quién hablás.
  if (p.comunicaciones.length) {
    texto(pagina, "CON QUIÉN HABLÁS", MARGEN, y, mono, 7, GRIS);
    y += 12;
    for (const c of p.comunicaciones) {
      if (y > A5.alto - 90) break;
      texto(pagina, recortar(c.donde, fuente, 8, 150), MARGEN, y, fuente, 8, GRIS);
      texto(pagina, recortar(c.quien, negrita, 8.5, 120), MARGEN + 155, y, negrita, 8.5);
      texto(pagina, recortar(c.frecuencias, mono, 8.5, A5.ancho - 2 * MARGEN - 280), MARGEN + 280, y, mono, 8.5);
      y += 14;
    }
    y += 8;
  }

  // Lugar para anotar: autorizaciones, ATIS, QNH.
  texto(pagina, "NOTAS  -  AUTORIZACIONES  -  QNH", MARGEN, y, mono, 7, GRIS);
  y += 14;
  while (y < A5.alto - 44) {
    linea(pagina, y + 14);
    y += 18;
  }

  // La advertencia, al pie de cada hoja.
  for (const pg of doc.getPages()) {
    const t = recortar(p.advertencia, fuente, 6.5, A5.ancho - 2 * MARGEN);
    texto(pg, t, MARGEN, A5.alto - MARGEN - 4, fuente, 6.5, GRIS);
  }
  return doc.save();
}
