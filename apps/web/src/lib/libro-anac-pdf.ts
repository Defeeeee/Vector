import { PDFDocument, PDFFont, PDFPage, StandardFonts, degrees, rgb } from "pdf-lib";
import {
  COLUMNAS_LIBRO,
  RENGLONES_POR_HOJA,
  formatoLibro,
  totalHorasDeVuelo,
  type ColumnaLibro,
  type HojaLibro,
  type RenglonLibro,
  type ValoresLibro,
} from "./libro-anac";

/**
 * El PDF del libro de vuelo, dibujado con la hoja de siempre: la del Adjunto A de la Res.
 * ANAC 147/2013, que es la de los libros en papel y la que usa el Libro de Vuelo
 * Electrónico del CAD. La Res. ANAC 470/2025 (Anexo I, 9(b)(ii)) admite anotar y
 * certificar en un "libro de vuelo en formato digital impreso": esto es eso. Ver
 * `libro-anac.ts` para qué va en cada casillero y `docs/normativa/libro-de-vuelo-anac.md`
 * para las fuentes.
 *
 * - **El tamaño es el de la hoja: 35,5 × 16,5 cm.** Impreso al 100 % en papel oficio
 *   apaisado (35,56 cm de ancho) sale igual que la hoja del libro.
 * - **El orden de las columnas es el de la hoja**, con su encabezado de cuatro niveles,
 *   la fila de "Totales página anterior" arriba, 15 renglones y la de "Totales a la
 *   página siguiente" abajo. La columna de certificaciones queda en blanco: la firma la
 *   ponen el instructor o la autoridad, no Vector.
 * - Sólo usa las fuentes estándar del PDF (Helvetica), así que no embebe nada: pesa poco
 *   y abre en cualquier lado. Esas fuentes sólo saben Latin-1: el texto pasa por
 *   `seguro()` antes de dibujarse, para que un emoji en un nombre no tire abajo el PDF.
 */

const CM = 28.3465;
export const ANCHO_HOJA = 35.5 * CM;
export const ALTO_HOJA = 16.5 * CM;

const MARGEN = 0.5 * CM;
const ALTO_TITULO = 18;
const BANDAS = [0, 15, 25, 35, 45]; // cuatro niveles de encabezado
const ALTO_ENCABEZADO = BANDAS[4];
/**
 * El alto de la tabla es fijo —la hoja mide lo que mide— y se reparte entre los renglones
 * que tenga el libro del piloto. Con los 15 del Adjunto A, cada renglón mide 20 pt.
 */
const ALTO_TABLA = (RENGLONES_POR_HOJA + 2) * 20;

/** El alto de las filas de totales y el de cada renglón, según cuántos tiene la hoja. */
export function altosDeLaHoja(capacidad: number): { totales: number; renglon: number } {
  const totales = capacidad <= RENGLONES_POR_HOJA ? 20 : 16;
  return { totales, renglon: Math.min(30, (ALTO_TABLA - 2 * totales) / capacidad) };
}
const NEGRO = rgb(0, 0, 0);
const GRIS = rgb(0.45, 0.45, 0.45);
const LINEA = rgb(0.55, 0.55, 0.55);

type ClaveTexto = Exclude<keyof RenglonLibro, "valores">;
type Clave = ClaveTexto | ColumnaLibro | "certificaciones";

/** Anchos en puntos, en el orden del Adjunto A. Certificaciones se lleva lo que sobra. */
const ANCHOS: [Clave, number][] = [
  ["dia", 17],
  ["mes", 17],
  ["horaSalida", 30],
  ["desde", 34],
  ["hasta", 34],
  ["horaLlegada", 30],
  ["finalidad", 26],
  // Angosta: va el tipo (C152, ECHO), como se escribe en el libro. Lo que sobra es para
  // certificaciones, que es donde se firma.
  ["marcaModelo", 40],
  ["matricula", 42],
  ["potencia", 32],
  ["clase", 34],
  ["aeroDiaPiloto", 27],
  ["aeroDiaCopiloto", 27],
  ["aeroNochePiloto", 27],
  ["aeroNocheCopiloto", 27],
  ["travDiaPiloto", 27],
  ["travDiaCopiloto", 27],
  ["travNochePiloto", 27],
  ["travNocheCopiloto", 27],
  ["aterrizajes", 30],
  ["instructor", 28],
  ["multimotor", 28],
  ["reactor", 26],
  ["turbohelice", 28],
  ["aeroaplicador", 30],
  ["imcPiloto", 26],
  ["imcCopiloto", 28],
  ["capota", 26],
  ["simInstructor", 30],
  ["simPilotoEnInstruccion", 34],
];

interface Columna {
  x: number;
  w: number;
}

function columnas(): Record<Clave, Columna> {
  const cols = {} as Record<Clave, Columna>;
  let x = MARGEN;
  for (const [clave, w] of ANCHOS) {
    cols[clave] = { x, w };
    x += w;
  }
  cols.certificaciones = { x, w: ANCHO_HOJA - MARGEN - x };
  return cols;
}

/**
 * Lo que Helvetica (WinAnsi) sabe dibujar. Lo demás —un emoji en un nombre— se saca en
 * vez de tirar abajo el PDF: dibujar un carácter que la fuente no tiene es una excepción.
 */
export function seguro(texto: string | null | undefined): string {
  return (texto ?? "")
    .normalize("NFC")
    .replace(/[\u2192\u27F6\u2794]/g, "-")
    .replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u20AC]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Achica la letra hasta que entre; si ni al mínimo entra, corta con "…". */
function ajustar(fuente: PDFFont, texto: string, ancho: number, tamano: number, minimo = 4.2): { texto: string; tamano: number } {
  let t = tamano;
  while (t > minimo && fuente.widthOfTextAtSize(texto, t) > ancho) t -= 0.2;
  if (fuente.widthOfTextAtSize(texto, t) <= ancho) return { texto, tamano: t };
  let corto = texto;
  while (corto.length > 1 && fuente.widthOfTextAtSize(`${corto}…`, t) > ancho) corto = corto.slice(0, -1);
  return { texto: `${corto}…`, tamano: t };
}

/** Parte un rótulo en renglones que entren en el ancho. */
function renglonesDe(fuente: PDFFont, texto: string, ancho: number, tamano: number): string[] {
  const palabras = texto.split(" ");
  const lineas: string[] = [];
  let actual = "";
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (fuente.widthOfTextAtSize(prueba, tamano) <= ancho || !actual) actual = prueba;
    else {
      lineas.push(actual);
      actual = p;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

class Dibujo {
  constructor(
    private page: PDFPage,
    private normal: PDFFont,
    private negrita: PDFFont
  ) {}

  /** `y` se cuenta desde arriba, como se lee la hoja; pdf-lib la cuenta desde abajo. */
  private y(desdeArriba: number) {
    return ALTO_HOJA - desdeArriba;
  }

  caja(x: number, yArriba: number, w: number, h: number, grosor = 0.5, color = LINEA) {
    this.page.drawRectangle({ x, y: this.y(yArriba + h), width: w, height: h, borderColor: color, borderWidth: grosor });
  }

  linea(x1: number, yA: number, x2: number, yB: number, grosor = 0.5, color = LINEA) {
    this.page.drawLine({ start: { x: x1, y: this.y(yA) }, end: { x: x2, y: this.y(yB) }, thickness: grosor, color });
  }

  texto(
    t: string,
    x: number,
    yArriba: number,
    { tamano = 6.5, negrita = false, color = NEGRO }: { tamano?: number; negrita?: boolean; color?: ReturnType<typeof rgb> } = {}
  ) {
    const s = seguro(t);
    if (!s) return;
    this.page.drawText(s, { x, y: this.y(yArriba), size: tamano, font: negrita ? this.negrita : this.normal, color });
  }

  /** Texto centrado en una celda, achicado si hace falta. */
  centrado(t: string, x: number, yArriba: number, w: number, h: number, { tamano = 6.5, negrita = false } = {}) {
    const fuente = negrita ? this.negrita : this.normal;
    // En un libro de muchos renglones la celda es baja: la letra no puede ser más alta.
    const a = ajustar(fuente, seguro(t), w - 3, Math.min(tamano, h * 0.62));
    if (!a.texto) return;
    const ancho = fuente.widthOfTextAtSize(a.texto, a.tamano);
    this.page.drawText(a.texto, {
      x: x + (w - ancho) / 2,
      y: this.y(yArriba + h / 2 + a.tamano * 0.35),
      size: a.tamano,
      font: fuente,
      color: NEGRO,
    });
  }

  /** Un rótulo de encabezado: en negrita, partido en renglones si no entra en uno. */
  rotulo(t: string, x: number, yArriba: number, w: number, h: number, tamano = 5.2) {
    this.caja(x, yArriba, w, h, 0.5, NEGRO);
    const lineas = renglonesDe(this.negrita, t, w - 2, tamano);
    const alto = lineas.length * (tamano + 0.8);
    lineas.forEach((l, i) => {
      const a = ajustar(this.negrita, l, w - 2, tamano, 3.6);
      const ancho = this.negrita.widthOfTextAtSize(a.texto, a.tamano);
      this.page.drawText(a.texto, {
        x: x + (w - ancho) / 2,
        y: this.y(yArriba + (h - alto) / 2 + (i + 1) * (tamano + 0.8) - 0.8),
        size: a.tamano,
        font: this.negrita,
        color: NEGRO,
      });
    });
  }

  /** Un rótulo vertical, como "FINALIDAD DEL VUELO" en la hoja oficial. */
  rotuloVertical(t: string, x: number, yArriba: number, w: number, h: number, tamano = 5.2) {
    this.caja(x, yArriba, w, h, 0.5, NEGRO);
    const lineas = renglonesDe(this.negrita, t, h - 4, tamano);
    const bloque = lineas.length * (tamano + 0.8);
    lineas.forEach((l, i) => {
      const ancho = this.negrita.widthOfTextAtSize(l, tamano);
      this.page.drawText(l, {
        x: x + (w - bloque) / 2 + (i + 1) * (tamano + 0.8) - 1,
        y: this.y(yArriba + h - (h - ancho) / 2),
        size: tamano,
        font: this.negrita,
        color: NEGRO,
        rotate: degrees(90),
      });
    });
  }
}

export interface DatosTitular {
  apellidoYNombre: string;
  licencia: string;
  licenciaNumero: string;
  legajo: string;
  /** Si el piloto lleva más de un libro en Vector, cuál es éste. */
  libro?: string;
}

function encabezado(d: Dibujo, cols: Record<Clave, Columna>, anio: number, top: number) {
  const b = BANDAS.map((v) => top + v);
  const tramo = (desde: Clave, hasta: Clave) => ({ x: cols[desde].x, w: cols[hasta].x + cols[hasta].w - cols[desde].x });
  const alto = (desde: number, hasta: number) => b[hasta] - b[desde];

  // Año, con día y mes abajo.
  const anioT = tramo("dia", "mes");
  d.rotulo(`AÑO ${anio || ""}`, anioT.x, b[0], anioT.w, alto(0, 3), 6);
  d.rotulo("DÍA", cols.dia.x, b[3], cols.dia.w, alto(3, 4));
  d.rotulo("MES", cols.mes.x, b[3], cols.mes.w, alto(3, 4));

  const it = tramo("horaSalida", "horaLlegada");
  d.rotulo("ITINERARIO", it.x, b[0], it.w, alto(0, 1), 6);
  d.rotulo("HORA DE SALIDA", cols.horaSalida.x, b[1], cols.horaSalida.w, alto(1, 4));
  d.rotulo("DESDE", cols.desde.x, b[1], cols.desde.w, alto(1, 4));
  d.rotulo("HASTA", cols.hasta.x, b[1], cols.hasta.w, alto(1, 4));
  d.rotulo("HORA DE LLEGADA", cols.horaLlegada.x, b[1], cols.horaLlegada.w, alto(1, 4));

  d.rotuloVertical("FINALIDAD DEL VUELO", cols.finalidad.x, b[0], cols.finalidad.w, alto(0, 4));

  const av = tramo("marcaModelo", "clase");
  d.rotulo("AERONAVES UTILIZADAS", av.x, b[0], av.w, alto(0, 1), 6);
  d.rotulo("MARCA / MODELO", cols.marcaModelo.x, b[1], cols.marcaModelo.w, alto(1, 4));
  d.rotulo("MATRÍCULA", cols.matricula.x, b[1], cols.matricula.w, alto(1, 4));
  d.rotulo("POTENCIA", cols.potencia.x, b[1], cols.potencia.w, alto(1, 4));
  d.rotulo("CLASE", cols.clase.x, b[1], cols.clase.w, alto(1, 4));

  const tv = tramo("aeroDiaPiloto", "travNocheCopiloto");
  d.rotulo("TIEMPOS DE VUELO", tv.x, b[0], tv.w, alto(0, 1), 6);
  const aero = tramo("aeroDiaPiloto", "aeroNocheCopiloto");
  const trav = tramo("travDiaPiloto", "travNocheCopiloto");
  d.rotulo("SOBRE AERÓDROMO", aero.x, b[1], aero.w, alto(1, 2));
  d.rotulo("TRAVESÍA", trav.x, b[1], trav.w, alto(1, 2));
  const pares: [Clave, Clave, string][] = [
    ["aeroDiaPiloto", "aeroDiaCopiloto", "DE DÍA"],
    ["aeroNochePiloto", "aeroNocheCopiloto", "DE NOCHE"],
    ["travDiaPiloto", "travDiaCopiloto", "DE DÍA"],
    ["travNochePiloto", "travNocheCopiloto", "DE NOCHE"],
  ];
  for (const [p, c, t] of pares) {
    const tr = tramo(p, c);
    d.rotulo(t, tr.x, b[2], tr.w, alto(2, 3));
    d.rotulo("PILOTO", cols[p].x, b[3], cols[p].w, alto(3, 4), 4.6);
    d.rotulo("COPILOTO", cols[c].x, b[3], cols[c].w, alto(3, 4), 4.6);
  }

  d.rotulo("ATERRI- ZAJES", cols.aterrizajes.x, b[0], cols.aterrizajes.w, alto(0, 4));

  const disc = tramo("instructor", "capota");
  d.rotulo("DISCRIMINACIÓN DE TIEMPOS DE VUELO", disc.x, b[0], disc.w, alto(0, 1), 6);
  d.rotulo("INSTRUCTOR DE VUELO", cols.instructor.x, b[1], cols.instructor.w, alto(1, 4));
  d.rotulo("MULTI- MOTOR", cols.multimotor.x, b[1], cols.multimotor.w, alto(1, 4));
  d.rotulo("REACTOR", cols.reactor.x, b[1], cols.reactor.w, alto(1, 4));
  d.rotulo("TURBO- HÉLICE", cols.turbohelice.x, b[1], cols.turbohelice.w, alto(1, 4));
  d.rotulo("AERO- APLICADOR", cols.aeroaplicador.x, b[1], cols.aeroaplicador.w, alto(1, 4));
  const inst = tramo("imcPiloto", "capota");
  d.rotulo("VUELO POR INSTRUMENTOS", inst.x, b[1], inst.w, alto(1, 2));
  const real = tramo("imcPiloto", "imcCopiloto");
  d.rotulo("REAL", real.x, b[2], real.w, alto(2, 3));
  d.rotulo("PILOTO", cols.imcPiloto.x, b[3], cols.imcPiloto.w, alto(3, 4), 4.6);
  d.rotulo("COPILOTO", cols.imcCopiloto.x, b[3], cols.imcCopiloto.w, alto(3, 4), 4.6);
  d.rotulo("CAPOTA", cols.capota.x, b[2], cols.capota.w, alto(2, 4));

  const sim = tramo("simInstructor", "simPilotoEnInstruccion");
  d.rotulo("ADIESTRADOR TERRESTRE / SIMULADOR", sim.x, b[0], sim.w, alto(0, 1), 4.4);
  d.rotulo("INSTRUC- TOR", cols.simInstructor.x, b[1], cols.simInstructor.w, alto(1, 4));
  d.rotulo("PILOTO EN INSTRUCCIÓN", cols.simPilotoEnInstruccion.x, b[1], cols.simPilotoEnInstruccion.w, alto(1, 4));

  d.rotulo("CERTIFICACIONES", cols.certificaciones.x, b[0], cols.certificaciones.w, alto(0, 4), 6.5);
}

function filaDeTotales(
  d: Dibujo,
  cols: Record<Clave, Columna>,
  y: number,
  alto: number,
  rotulo: string,
  valores: ValoresLibro,
  leyenda: string
) {
  const ancho = cols.clase.x + cols.clase.w - cols.dia.x;
  d.caja(cols.dia.x, y, ancho, alto, 0.5, NEGRO);
  d.texto(rotulo, cols.dia.x + 4, y + alto / 2 + 2.2, { tamano: 6.5, negrita: true });
  for (const c of COLUMNAS_LIBRO) {
    d.caja(cols[c].x, y, cols[c].w, alto);
    d.centrado(formatoLibro(valores[c], c, false), cols[c].x, y, cols[c].w, alto, { negrita: true });
  }
  const cert = cols.certificaciones;
  d.caja(cert.x, y, cert.w, alto);
  const total = formatoLibro(totalHorasDeVuelo(valores), "travDiaPiloto", false);
  d.texto(total, cert.x + 4, y + alto / 2 + 2.4, { tamano: 7, negrita: true });
  d.texto("Total horas de vuelo", cert.x + 32, y + alto / 2 - 1.2, { tamano: 4.4, color: GRIS });
  d.texto(leyenda, cert.x + 32, y + alto / 2 + 4.2, { tamano: 4.4, color: GRIS });
}

function renglon(d: Dibujo, cols: Record<Clave, Columna>, y: number, alto: number, r: RenglonLibro | null) {
  const textos: ClaveTexto[] = [
    "dia",
    "mes",
    "horaSalida",
    "desde",
    "hasta",
    "horaLlegada",
    "finalidad",
    "marcaModelo",
    "matricula",
    "potencia",
    "clase",
  ];
  for (const c of textos) {
    d.caja(cols[c].x, y, cols[c].w, alto);
    if (r) d.centrado(r[c], cols[c].x, y, cols[c].w, alto);
  }
  for (const c of COLUMNAS_LIBRO) {
    d.caja(cols[c].x, y, cols[c].w, alto);
    if (r) d.centrado(formatoLibro(r.valores[c], c, true), cols[c].x, y, cols[c].w, alto);
  }
  d.caja(cols.certificaciones.x, y, cols.certificaciones.w, alto);
}

/**
 * El PDF, una página por hoja. Sin hojas —ningún vuelo todavía— sale una hoja en blanco
 * con los totales de apertura, que también es lo que el piloto tendría en papel.
 */
export async function pdfDelLibro(
  hojas: HojaLibro[],
  titular: DatosTitular,
  {
    generado,
    apertura,
    renglonesPorHoja = RENGLONES_POR_HOJA,
    firmaPng,
  }: {
    generado: string;
    apertura: ValoresLibro;
    renglonesPorHoja?: number;
    /**
     * La firma que el piloto guardó (la del plan de vuelo), como PNG: va en cada hoja, sobre
     * la línea de la firma del titular. Sólo si la pidió ("PDF firmado"): firmar es suyo.
     */
    firmaPng?: Uint8Array;
  }
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(seguro(`Libro de vuelo — ${titular.apellidoYNombre}`));
  doc.setAuthor(seguro(titular.apellidoYNombre));
  doc.setCreator("Vector");
  doc.setProducer("Vector");
  doc.setSubject("Libro de vuelo en formato digital impreso (Res. ANAC 470/2025, Anexo I, 9(b))");

  const firma = firmaPng ? await doc.embedPng(firmaPng) : null;
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const cols = columnas();
  const paginas: HojaLibro[] = hojas.length
    ? hojas
    : [
        {
          anio: new Date().getUTCFullYear(),
          capacidad: renglonesPorHoja,
          cerrada: false,
          renglones: [],
          anterior: apertura,
          siguiente: apertura,
        },
      ];

  paginas.forEach((hoja, i) => {
    const page = doc.addPage([ANCHO_HOJA, ALTO_HOJA]);
    const d = new Dibujo(page, normal, negrita);

    // Titular.
    const yTitulo = MARGEN + 10;
    const dato = (rotulo: string, valor: string, x: number, anchoValor: number) => {
      d.texto(rotulo, x, yTitulo, { tamano: 7, negrita: true });
      const xv = x + negrita.widthOfTextAtSize(seguro(rotulo), 7) + 4;
      if (valor) d.texto(valor, xv, yTitulo, { tamano: 8 });
      d.linea(xv, yTitulo + 2, xv + anchoValor, yTitulo + 2, 0.4, GRIS);
    };
    dato("APELLIDO Y NOMBRE:", titular.apellidoYNombre, MARGEN, 250);
    dato("LICENCIA:", titular.licencia, MARGEN + 380, 70);
    dato("Nº", titular.licenciaNumero, MARGEN + 500, 80);
    dato("LEGAJO Nº", titular.legajo, MARGEN + 640, 80);
    if (titular.libro) d.texto(`Libro: ${titular.libro}`, ANCHO_HOJA - MARGEN - 140, yTitulo, { tamano: 6, color: GRIS });

    // La tabla.
    const top = MARGEN + ALTO_TITULO;
    encabezado(d, cols, hoja.anio, top);
    const altos = altosDeLaHoja(hoja.capacidad);
    let y = top + ALTO_ENCABEZADO;
    filaDeTotales(d, cols, y, altos.totales, "TOTALES PÁGINA ANTERIOR", hoja.anterior, "de la página anterior");
    y += altos.totales;
    let yPrimerVacio: number | null = null;
    for (let k = 0; k < hoja.capacidad; k++) {
      const r = hoja.renglones[k] ?? null;
      if (!r && yPrimerVacio === null) yPrimerVacio = y;
      renglon(d, cols, y, altos.renglon, r);
      y += altos.renglon;
    }
    /*
      Una hoja que se cerró sin llenarse: lo que quedó en blanco se tacha con una sola
      diagonal, de la esquina del primer renglón vacío a la del último, como en el papel.
    */
    if (hoja.cerrada && yPrimerVacio !== null) {
      d.linea(MARGEN, yPrimerVacio, ANCHO_HOJA - MARGEN, y, 1, NEGRO);
    }
    filaDeTotales(d, cols, y, altos.totales, "TOTALES A LA PÁGINA SIGUIENTE", hoja.siguiente, "a la página siguiente");
    const fondo = y + altos.totales;
    d.caja(MARGEN, top, ANCHO_HOJA - 2 * MARGEN, fondo - top, 1, NEGRO);

    // Pie: lo que aclara la hoja, y la firma del titular.
    const yPie = fondo + 9;
    d.texto(
      "Horas de salida y de llegada en UTC. Desde / Hasta: código OACI o sigla del lugar; en un vuelo local, el mismo lugar. Tiempos en horas y décimas.",
      MARGEN,
      yPie,
      { tamano: 5.4 }
    );
    d.texto(
      "Las columnas de discriminación no se suman a los totales generales: ya están comprendidas en TIEMPOS DE VUELO. El adiestrador terrestre / simulador se asienta por separado.",
      MARGEN,
      yPie + 7,
      { tamano: 5.4 }
    );
    // La línea de la firma va 22 pt debajo del pie (antes 12): deja lugar para firmar, a mano
    // o con la firma guardada, sin pisar la tabla.
    const xFirma = ANCHO_HOJA - MARGEN - 170;
    const yLineaFirma = yPie + 22;
    if (firma) {
      const caja = { w: 160, h: yLineaFirma - fondo - 4 };
      const escala = Math.min(caja.w / firma.width, caja.h / firma.height);
      const w = firma.width * escala;
      const h = firma.height * escala;
      page.drawImage(firma, { x: xFirma + (170 - w) / 2, y: ALTO_HOJA - yLineaFirma + 1, width: w, height: h });
    }
    d.linea(xFirma, yLineaFirma, ANCHO_HOJA - MARGEN, yLineaFirma, 0.6, NEGRO);
    d.texto("FIRMA DEL TITULAR", xFirma + 50, yLineaFirma + 7, { tamano: 6.5, negrita: true });
    d.texto(
      `Hoja ${i + 1} de ${paginas.length} · Libro de vuelo en formato digital impreso (Res. ANAC 470/2025, Anexo I, 9(b)): lo anotado tiene que coincidir con lo declarado en el CAD · Generado con Vector el ${generado}.`,
      MARGEN,
      yPie + 19,
      { tamano: 4.6, color: GRIS }
    );
  });

  return doc.save();
}
