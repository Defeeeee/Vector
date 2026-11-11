import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import {
  PIE,
  armarEstacion,
  envolver,
  fechaHoraUtc,
  lineasDeEspacios,
  lineasDelPiloto,
  tituloBriefing,
  type DatosBriefing,
} from "./briefing-pdf-datos";
import { paraPdf } from "./piernera";

/**
 * El briefing de la ruta en PDF: un A4 vertical en blanco y negro para imprimir o llevar. Se arma
 * en el navegador con pdf-lib (como la piernera y el plan de vuelo). Qué va en cada sección y cómo
 * se escribe lo decide `briefing-pdf-datos.ts`; acá sólo se dibuja, con saltos de hoja.
 */

const A4 = { ancho: 595.28, alto: 841.89 };
const MARGEN = 36;
const PIE_ALTO = 30;
const UTIL = A4.ancho - 2 * MARGEN;
const NEGRO = rgb(0.07, 0.08, 0.1);
const GRIS = rgb(0.42, 0.45, 0.5);
const LINEA = rgb(0.78, 0.8, 0.83);

/** Las columnas de la tabla de tramos (suman `UTIL`). */
const COLUMNAS: { rotulo: string; ancho: number; derecha?: boolean }[] = [
  { rotulo: "#", ancho: 22 },
  { rotulo: "TRAMO", ancho: 215.28 },
  { rotulo: "RUMBO", ancho: 70, derecha: true },
  { rotulo: "NM", ancho: 70, derecha: true },
  { rotulo: "TIEMPO", ancho: 70, derecha: true },
  { rotulo: "ACUM.", ancho: 70, derecha: true },
];

export async function armarPdfBriefing(d: DatosBriefing): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(tituloBriefing(d));
  doc.setCreator("Vector");
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);

  let pagina: PDFPage = doc.addPage([A4.ancho, A4.alto]);
  // `y` se cuenta desde arriba, como se lee la hoja; pdf-lib la cuenta desde abajo.
  let y = MARGEN;

  const asegurar = (alto: number) => {
    if (y + alto > A4.alto - MARGEN - PIE_ALTO) {
      pagina = doc.addPage([A4.ancho, A4.alto]);
      y = MARGEN;
    }
  };
  const texto = (t: string, x: number, f: PDFFont, tam: number, color = NEGRO) =>
    pagina.drawText(paraPdf(t), { x, y: A4.alto - y - tam, size: tam, font: f, color });
  const linea = (grosor = 0.5, color = LINEA) =>
    pagina.drawLine({ start: { x: MARGEN, y: A4.alto - y }, end: { x: A4.ancho - MARGEN, y: A4.alto - y }, thickness: grosor, color });
  const recortar = (t: string, f: PDFFont, tam: number, ancho: number) => {
    let s = paraPdf(t);
    const entero = s;
    while (s.length > 1 && f.widthOfTextAtSize(s, tam) > ancho) s = s.slice(0, -1);
    return s === entero ? s : `${s.slice(0, -1)}.`;
  };

  /** Un párrafo envuelto al ancho útil (menos `sangria`), renglón por renglón con salto de hoja. */
  const parrafo = (t: string, f: PDFFont, tam: number, opts: { color?: typeof NEGRO; sangria?: number; hueco?: number } = {}) => {
    const sangria = opts.sangria ?? 0;
    const interlineado = tam * 1.3;
    for (const r of envolver(paraPdf(t), (s) => f.widthOfTextAtSize(s, tam), UTIL - sangria)) {
      asegurar(interlineado);
      texto(r, MARGEN + sangria, f, tam, opts.color);
      y += interlineado;
    }
    y += opts.hueco ?? 0;
  };

  const seccion = (titulo: string) => {
    asegurar(60);
    y += 10;
    texto(titulo, MARGEN, mono, 8, GRIS);
    y += 12;
    linea(0.8, NEGRO);
    y += 8;
  };

  /* ------------------------------------------------------------------ encabezado --- */
  texto("VECTOR  -  BRIEFING DE LA RUTA", MARGEN, mono, 8, GRIS);
  y += 14;
  texto(recortar(d.ruta, negrita, 15, UTIL), MARGEN, negrita, 15);
  y += 22;
  if (d.avion) {
    texto(recortar(d.avion, fuente, 10, UTIL), MARGEN, fuente, 10, GRIS);
    y += 15;
  }
  texto(`Armado el ${fechaHoraUtc(d.armado)}. Los datos son de esa hora: cambian.`, MARGEN, fuente, 9, GRIS);
  y += 13;

  /* ------------------------------------------------------------ ¿puedo volar hoy? --- */
  const piloto = lineasDelPiloto(d.piloto);
  seccion(piloto.titulo);
  piloto.lineas.forEach((l, i) => parrafo(l, i === 0 ? negrita : fuente, i === 0 ? 10.5 : 9, { color: i === 0 ? NEGRO : GRIS, hueco: 3 }));
  if (piloto.items.length) {
    y += 3;
    for (const it of piloto.items) {
      asegurar(14);
      texto(recortar(it.etiqueta, fuente, 9, 200), MARGEN, fuente, 9, GRIS);
      texto(recortar(it.valor, mono, 9, UTIL - 210), MARGEN + 210, mono, 9);
      y += 13;
    }
  }

  /* ------------------------------------------------------------------ aeródromos --- */
  seccion("AERODROMOS: METAR, TAF Y NOTAM");
  if (!d.estaciones.length) {
    parrafo("La ruta no pasa por aeródromos.", fuente, 9, { color: GRIS });
  }
  for (const e of d.estaciones) {
    const b = armarEstacion(e, d.armado);
    asegurar(70);
    y += 4;
    texto(recortar(b.titulo, negrita, 11, UTIL), MARGEN, negrita, 11);
    y += 16;
    for (const a of b.avisos) parrafo(a, negrita, 8.5, { hueco: 2 });
    if (b.notaClima) parrafo(b.notaClima, negrita, 8.5, { hueco: 2 });
    if (b.metar) {
      texto("METAR", MARGEN, mono, 7, GRIS);
      y += 9;
      parrafo(b.metar, mono, 8.5, { hueco: 3 });
    }
    if (b.taf) {
      texto("TAF", MARGEN, mono, 7, GRIS);
      y += 9;
      parrafo(b.taf, mono, 8.5, { hueco: 3 });
    }
    if (b.fechaClima) parrafo(b.fechaClima, fuente, 7.5, { color: GRIS, hueco: 3 });

    asegurar(30);
    texto("NOTAM", MARGEN, mono, 7, GRIS);
    y += 9;
    parrafo(b.notaNotams, negrita, 8.5, { hueco: 2 });
    for (const n of b.notams) {
      asegurar(24);
      parrafo(n.encabezado, mono, 8, { hueco: 0 });
      if (n.texto) parrafo(n.texto, fuente, 8, { color: GRIS, sangria: 8, hueco: 3 });
    }
    if (b.fechaNotams) parrafo(b.fechaNotams, fuente, 7.5, { color: GRIS, hueco: 3 });
    y += 4;
    linea();
    y += 4;
  }
  if (d.estacionesOmitidas > 0) {
    parrafo(
      `Faltan ${d.estacionesOmitidas} aeródromos de la ruta: son demasiados para una hoja. Miralos en Meteo y NOTAM de la ruta.`,
      negrita,
      8.5
    );
  }

  /* ------------------------------------------------------------------------ ruta --- */
  seccion("RUTA");
  const p = d.piernera;
  const encabezado = () => {
    let x = MARGEN;
    for (const c of COLUMNAS) {
      const w = mono.widthOfTextAtSize(c.rotulo, 7);
      texto(c.rotulo, c.derecha ? x + c.ancho - w - 3 : x + 2, mono, 7, GRIS);
      x += c.ancho;
    }
    y += 11;
    linea(0.8, NEGRO);
  };
  asegurar(60);
  encabezado();
  const ALTO = 17;
  for (const r of p.renglones) {
    if (y + ALTO > A4.alto - MARGEN - PIE_ALTO) {
      asegurar(1e6);
      encabezado();
    }
    const valores = [r.n, r.tramo, r.rumbo, r.distancia, r.tiempo, r.acumulado];
    let x = MARGEN;
    COLUMNAS.forEach((c, k) => {
      const f = k === 1 ? negrita : mono;
      const v = recortar(valores[k], f, 8.5, c.ancho - 5);
      const w = f.widthOfTextAtSize(v, 8.5);
      y += 4;
      texto(v, c.derecha ? x + c.ancho - w - 3 : x + 2, f, 8.5);
      y -= 4;
      x += c.ancho;
    });
    y += ALTO;
    linea();
  }
  y += 8;
  asegurar(16);
  texto(
    [`Total ${p.totales.distancia}`, `${p.totales.tiempo} sin viento`, p.totales.combustible].filter(Boolean).join("     "),
    MARGEN,
    negrita,
    9.5
  );
  y += 16;
  parrafo(
    "Tiempos sin viento, con la TAS cargada. El combustible es el estimado del tiempo por el consumo del avión, sin reserva: el de verdad está en la planilla de navegación.",
    fuente,
    7.5,
    { color: GRIS, hueco: 6 }
  );

  asegurar(40);
  texto("CON QUIEN HABLAS", MARGEN, mono, 7, GRIS);
  y += 11;
  if (!p.comunicaciones.length) {
    parrafo("No se pudieron calcular las dependencias de la ruta (faltaron los datos del mapa).", fuente, 8.5, { color: GRIS });
  }
  for (const c of p.comunicaciones) {
    asegurar(13);
    texto(recortar(c.donde, fuente, 8.5, 190), MARGEN, fuente, 8.5, GRIS);
    texto(recortar(c.quien, negrita, 8.5, 150), MARGEN + 195, negrita, 8.5);
    texto(recortar(c.frecuencias, mono, 8.5, UTIL - 350), MARGEN + 350, mono, 8.5);
    y += 13;
  }

  y += 6;
  asegurar(40);
  texto("ESPACIOS AEREOS QUE CRUZA", MARGEN, mono, 7, GRIS);
  y += 11;
  const esp = lineasDeEspacios(d.espacios);
  for (const l of esp.lineas) parrafo(l, fuente, 8.5, { hueco: 2 });
  if (esp.nota) parrafo(esp.nota, fuente, 7.5, { color: GRIS });

  /* ------------------------------------------------------------------------- pie --- */
  const hojas = doc.getPages();
  hojas.forEach((pg, i) => {
    const renglones = envolver(paraPdf(PIE), (s) => fuente.widthOfTextAtSize(s, 7), UTIL - 50);
    renglones.forEach((r, k) => pg.drawText(r, { x: MARGEN, y: MARGEN + 12 - k * 9, size: 7, font: fuente, color: GRIS }));
    const n = `Hoja ${i + 1} de ${hojas.length}`;
    pg.drawText(n, { x: A4.ancho - MARGEN - fuente.widthOfTextAtSize(n, 7), y: MARGEN + 12, size: 7, font: fuente, color: GRIS });
  });
  return doc.save();
}
