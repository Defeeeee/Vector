import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, degrees, rgb } from "pdf-lib";
import { acomodarConstancias, acomodarDorso, ajustarEnCaja, fechaDelDorso } from "./firmas-libro";
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
 *   ponen el instructor o la autoridad, no Vector. **Sólo si el piloto lo pide** ("Con las
 *   firmas de los certificantes", `certificaciones`) se estampa en cada vuelo la firma
 *   que guardó de quien lo certificó, con su aclaración; el vuelo sin certificante o sin
 *   firma guardada sigue en blanco.
 * - **El dorso de cada hoja** (`dorsos`, "Con el dorso de cada hoja"): después de cada hoja,
 *   una página del mismo tamaño para imprimir doble faz, con las imágenes de las firmas y los
 *   sellos que el piloto cargó para esa hoja (varias, a tamaño real: 7 × 3,5 cm cada una). **El dorso no lo define el Adjunto A de la
 *   Res. 147/2013 que tenemos documentado: es la práctica que pidió Federico (firma con
 *   sello o aclaración atrás de cada hoja), no algo de la norma** (invariante 6). Una
 *   hoja sin dorso cargado va con su dorso en blanco, para que la doble faz no se corra.
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

type ClaveTexto = Exclude<keyof RenglonLibro, "valores" | "certificante" | "vueloId">;
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

  /**
   * La firma de quien certificó el vuelo, ajustada a la celda, y su aclaración en letra chica
   * abajo (con la licencia, si la hay). Arriba la firma, abajo el texto: ninguna de las dos
   * toca el borde. Si el renglón es muy bajo y el texto no entra, va sólo la firma.
   */
  firmaEnCelda(c: CertificacionLista, x: number, yArriba: number, w: number, h: number) {
    const texto = seguro([c.nombre, c.licencia].filter(Boolean).join(" · "));
    const tamano = Math.min(4.6, h * 0.22);
    const conTexto = !!texto && tamano >= 3.2;
    const altoTexto = conTexto ? tamano + 1.4 : 0;
    const caja = ajustarEnCaja(c.imagen.width, c.imagen.height, w - 8, h - 3 - altoTexto);
    if (caja.w <= 0) return;
    const yImg = yArriba + 1.5 + (h - 3 - altoTexto - caja.h) / 2;
    this.page.drawImage(c.imagen, { x: x + (w - caja.w) / 2, y: this.y(yImg + caja.h), width: caja.w, height: caja.h });
    if (conTexto) {
      const a = ajustar(this.normal, texto, w - 4, tamano, 3);
      const ancho = this.normal.widthOfTextAtSize(a.texto, a.tamano);
      this.page.drawText(a.texto, {
        x: x + (w - ancho) / 2,
        y: this.y(yArriba + h - 2),
        size: a.tamano,
        font: this.normal,
        color: NEGRO,
      });
    }
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

/** Cuántas imágenes entran en un dorso (fotos más sellos). */
export const MAX_IMAGENES_DORSO = 12;

export interface DorsoParaPdf {
  /**
   * Las fotos del dorso (varias, migración 049) y, después, los sellos elegidos: todos van
   * juntos en la misma grilla, hasta `MAX_IMAGENES_DORSO`, **a tamaño real** (cada bloque en
   * una caja de 70 × 35 mm, `acomodarDorso`).
   */
  fotos?: Uint8Array[];
  aclaracion?: string | null;
  /** "AAAA-MM-DD". */
  fecha?: string | null;
  /** Las firmas con sello elegidas (de cualquier persona), después de las fotos. */
  sellos?: Uint8Array[];
  /**
   * Los bloques en orden (migración 050): cada firma con el texto que avala arriba, o un texto
   * solo. Si viene, manda sobre `fotos` y `sellos` (`bloquesDelDorso` arma la lista).
   */
  bloques?: { png?: Uint8Array | null; texto?: string | null; pie?: string | null }[];
}

/** Un bloque del dorso ya embebido: la imagen (si la hay y se pudo leer) y su texto. */
type BloqueEmbebido = { imagen: PDFImage | null; texto: string | null; pie?: string | null };

export interface CertificacionParaPdf {
  /** Para no embeber dos veces la misma imagen. */
  id: string;
  png: Uint8Array;
  nombre: string;
  licencia?: string | null;
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

/** Una firma de certificante ya embebida en el PDF, con lo que va debajo. */
interface CertificacionLista {
  imagen: PDFImage;
  nombre: string;
  licencia: string;
}

function renglon(
  d: Dibujo,
  cols: Record<Clave, Columna>,
  y: number,
  alto: number,
  r: RenglonLibro | null,
  cert: CertificacionLista | null = null
) {
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
  if (cert) d.firmaEnCelda(cert, cols.certificaciones.x, y, cols.certificaciones.w, alto);
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
    certificaciones,
    dorsos,
    constancias,
  }: {
    generado: string;
    apertura: ValoresLibro;
    renglonesPorHoja?: number;
    /**
     * La firma que el piloto guardó (la del plan de vuelo), como PNG: va en cada hoja, sobre
     * la línea de la firma del titular. Sólo si la pidió ("PDF firmado"): firmar es suyo.
     */
    firmaPng?: Uint8Array;
    /**
     * "Con las firmas de los certificantes": de un renglón, la firma guardada de quien lo
     * certificó, o `null` (la celda queda en blanco). Sin esta función no se estampa nada.
     */
    certificaciones?: (r: RenglonLibro) => CertificacionParaPdf | null;
    /**
     * "Con el dorso de cada hoja": lo cargado por número de hoja (desde 1). Si viene (aunque
     * sea vacío), cada hoja va seguida de su dorso; la que no tiene nada, en blanco.
     */
    dorsos?: Map<number, DorsoParaPdf>;
    /**
     * Constancias del frente (migración 051), por id de vuelo: la foto del sello real de una
     * autoridad (el de ANAC en un examen), que se estampa sobre las columnas de la
     * discriminación desde el renglón de ese vuelo (`acomodarConstancias`). Vector no dibuja
     * sellos: sólo estampa la foto que cargó el piloto.
     */
    constancias?: Map<string, Uint8Array[]>;
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

  // Las firmas de los certificantes se embeben una vez cada una, antes de dibujar.
  const imagenes = new Map<string, CertificacionLista>();
  const certDe = new Map<RenglonLibro, CertificacionLista | null>();
  if (certificaciones) {
    for (const hoja of paginas) {
      for (const r of hoja.renglones) {
        const c = certificaciones(r);
        if (!c) {
          certDe.set(r, null);
          continue;
        }
        let lista = imagenes.get(c.id);
        if (!lista) {
          try {
            lista = { imagen: await doc.embedPng(c.png), nombre: c.nombre, licencia: c.licencia ?? "" };
          } catch {
            // Un PNG que pdf-lib no entiende deja la celda en blanco, no tira abajo el libro.
            certDe.set(r, null);
            continue;
          }
          imagenes.set(c.id, lista);
        }
        certDe.set(r, lista);
      }
    }
  }
  // Las constancias del frente, embebidas una vez cada una.
  const constanciasDe = new Map<string, PDFImage[]>();
  for (const [vueloId, pngs] of constancias ?? []) {
    const listas: PDFImage[] = [];
    for (const png of pngs.slice(0, 2)) {
      try {
        listas.push(await doc.embedPng(png));
      } catch {
        /* una imagen ilegible se saltea */
      }
    }
    if (listas.length) constanciasDe.set(vueloId, listas);
  }

  const dorsoBloques = new Map<number, BloqueEmbebido[]>();
  // La misma imagen (la firma de una persona en muchas hojas) se embebe una vez.
  const yaEmbebidas = new Map<Uint8Array, PDFImage>();
  if (dorsos) {
    for (const [hoja, dorso] of dorsos) {
      const crudos = dorso.bloques ?? [...(dorso.fotos ?? []), ...(dorso.sellos ?? [])].map((png) => ({ png, texto: null }));
      const listos: BloqueEmbebido[] = [];
      let imagenes = 0;
      for (const b of crudos) {
        let imagen: PDFImage | null = null;
        if (b.png && imagenes < MAX_IMAGENES_DORSO) {
          try {
            imagen = yaEmbebidas.get(b.png) ?? (await doc.embedPng(b.png));
            yaEmbebidas.set(b.png, imagen);
            imagenes++;
          } catch {
            /* una imagen ilegible se saltea; su texto queda */
          }
        }
        const texto = b.texto?.trim() || null;
        // La aclaración de abajo sólo tiene sentido con su firma.
        const pie = (imagen && "pie" in b && b.pie?.trim()) || null;
        if (imagen || texto) listos.push({ imagen, texto, pie });
      }
      if (listos.length) dorsoBloques.set(hoja, listos);
    }
  }

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
    const yPrimerRenglon = y;
    let yPrimerVacio: number | null = null;
    for (let k = 0; k < hoja.capacidad; k++) {
      const r = hoja.renglones[k] ?? null;
      if (!r && yPrimerVacio === null) yPrimerVacio = y;
      renglon(d, cols, y, altos.renglon, r, r ? (certDe.get(r) ?? null) : null);
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

    // Las constancias (la foto del sello real), encima de la tabla, sobre la discriminación.
    const sellos: { img: PDFImage; renglon: number }[] = [];
    hoja.renglones.forEach((r, k) => {
      for (const img of (r.vueloId && constanciasDe.get(r.vueloId)) || []) sellos.push({ img, renglon: k });
    });
    if (sellos.length) {
      const xZona = cols.instructor.x;
      const cajas = acomodarConstancias(
        sellos.map((c) => ({ renglon: c.renglon, ancho: c.img.width, alto: c.img.height })),
        { x: xZona, w: cols.simPilotoEnInstruccion.x + cols.simPilotoEnInstruccion.w - xZona, yPrimerRenglon, altoRenglon: altos.renglon, renglones: hoja.capacidad }
      );
      sellos.forEach((c, k) => page.drawImage(c.img, { x: cajas[k].x, y: ALTO_HOJA - (cajas[k].y + cajas[k].h), width: cajas[k].w, height: cajas[k].h }));
    }

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

    if (dorsos) dorsoDeLaHoja(doc, normal, negrita, i + 1, paginas.length, dorsos.get(i + 1) ?? null, dorsoBloques.get(i + 1) ?? []);
  });

  return doc.save();
}

/**
 * El dorso de una hoja: una página del mismo tamaño, para imprimir doble faz.
 *
 * - **Sin nada cargado, en blanco**: así la hoja siguiente no cae en el dorso de otra.
 * - **Las imágenes son las firmas con el sello o la aclaración** tal como quedan en el papel
 *   (no son la de la celda de certificaciones), **a tamaño real** (7 × 3,5 cm como mucho), en
 *   grilla **desde arriba a la izquierda** (`acomodarDorso`). El texto que avala cada firma (una
 *   habilitación, una constancia; migración 050) va arriba de ella.
 * - **La línea "FIRMA Y ACLARACIÓN" sólo va si el piloto cargó una aclaración en texto**: va abajo
 *   a la derecha y la grilla queda arriba de ella, sin taparla. La fecha va debajo de la línea o,
 *   sin aclaración, arriba a la derecha.
 */
function dorsoDeLaHoja(
  doc: PDFDocument,
  normal: PDFFont,
  negrita: PDFFont,
  numero: number,
  total: number,
  dorso: DorsoParaPdf | null,
  bloques: BloqueEmbebido[] = []
) {
  const page = doc.addPage([ANCHO_HOJA, ALTO_HOJA]);
  const aclaracion = seguro(dorso?.aclaracion?.trim());
  const fecha = fechaDelDorso(dorso?.fecha);
  if (!bloques.length && !aclaracion && !fecha) return;
  const d = new Dibujo(page, normal, negrita);

  const ancho = 440;
  const xBloque = ANCHO_HOJA - MARGEN - ancho;
  // Con aclaración: la línea a 62 pt del borde de abajo, el texto, el rótulo y la fecha debajo.
  const reservaAbajo = aclaracion ? 68 : 10;
  if (bloques.length) {
    // Un texto puede traer varios párrafos (varios textos para la misma firma): cada uno en su renglón.
    const medir = (texto: string, w: number, tamano: number) =>
      texto.split("\n").flatMap((p) => {
        const limpio = seguro(p);
        return limpio ? renglonesDe(normal, limpio, w, tamano) : [];
      });
    const ubicados = acomodarDorso(
      bloques.map((b) => ({ imagen: b.imagen ? { ancho: b.imagen.width, alto: b.imagen.height } : null, texto: b.texto, pie: b.pie })),
      { ancho: ANCHO_HOJA, alto: ALTO_HOJA, margen: MARGEN, reservaAbajo },
      medir
    );
    bloques.forEach((b, i) => {
      const u = ubicados[i];
      for (const r of u.renglones) page.drawText(r.texto, { x: r.x, y: r.y, size: u.tamano, font: normal, color: NEGRO });
      if (b.imagen && u.imagen) page.drawImage(b.imagen, { x: u.imagen.x, y: u.imagen.y, width: u.imagen.w, height: u.imagen.h });
    });
  }

  if (aclaracion) {
    const yLinea = ALTO_HOJA - 62; // desde arriba
    d.linea(xBloque, yLinea, ANCHO_HOJA - MARGEN, yLinea, 0.6, NEGRO);
    const a = ajustar(negrita, aclaracion, ancho, 9, 5);
    const aw = negrita.widthOfTextAtSize(a.texto, a.tamano);
    page.drawText(a.texto, { x: xBloque + (ancho - aw) / 2, y: ALTO_HOJA - (yLinea + 11), size: a.tamano, font: negrita, color: NEGRO });
    d.texto("FIRMA Y ACLARACIÓN", xBloque + ancho / 2 - 38, yLinea + 20, { tamano: 5.6, color: GRIS });
  }
  if (fecha) {
    // Con aclaración, debajo de la línea; si no, arriba a la derecha (en la franja que la grilla deja libre).
    if (aclaracion) d.texto(fecha, xBloque, ALTO_HOJA - 22, { tamano: 7 });
    else d.texto(fecha, ANCHO_HOJA - MARGEN - 48, MARGEN + 8, { tamano: 7 });
  }
  d.texto(`Dorso de la hoja ${numero} de ${total}`, MARGEN, ALTO_HOJA - MARGEN, { tamano: 5, color: GRIS });
}
