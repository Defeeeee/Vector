import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { nombreDelPeriodo, type CeldasDeTiempo, type ResumenDeHoras } from "@/lib/resumen-horas";

/**
 * El resumen de horas en PDF, una hoja A4 (`resumen-horas.ts`). Lo manda el copiloto de
 * WhatsApp. No es el libro de vuelo ni lo reemplaza, y el pie lo dice: el libro es
 * `libro-anac-pdf.ts`, y lo que vale ante ANAC es el CAD.
 */
const A4: [number, number] = [595.28, 841.89];
const M = 48;
const TINTA = rgb(0.094, 0.094, 0.106);
const GRIS = rgb(0.443, 0.443, 0.478);
const LINEA = rgb(0.894, 0.894, 0.906);
const AZUL = rgb(0.145, 0.388, 0.922);

const h = (v: number) => v.toFixed(1).replace(".", ",");

export async function pdfDelResumen(
  r: ResumenDeHoras,
  datos: { piloto: string; licencia: string; generado: string }
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Resumen de horas — ${nombreDelPeriodo(r.desde, r.hasta)}`);
  doc.setCreator("Vector");
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage(A4);
  let y = A4[1] - M;

  const texto = (p: PDFPage, s: string, x: number, yy: number, size: number, font: PDFFont = normal, color = TINTA) =>
    p.drawText(s, { x, y: yy, size, font, color });
  const derecha = (p: PDFPage, s: string, x: number, yy: number, size: number, font: PDFFont = normal, color = TINTA) =>
    p.drawText(s, { x: x - font.widthOfTextAtSize(s, size), y: yy, size, font, color });
  const raya = (yy: number) => page.drawLine({ start: { x: M, y: yy }, end: { x: A4[0] - M, y: yy }, thickness: 0.8, color: LINEA });
  const nuevaHojaSiHaceFalta = (alto: number) => {
    if (y - alto > M + 40) return;
    page = doc.addPage(A4);
    y = A4[1] - M;
  };

  // Encabezado
  texto(page, "VECTOR", M, y, 9, negrita, GRIS);
  derecha(page, `Generado el ${datos.generado}`, A4[0] - M, y, 9, normal, GRIS);
  y -= 30;
  texto(page, "Resumen de horas", M, y, 24, negrita);
  y -= 20;
  texto(page, [datos.piloto, datos.licencia].filter(Boolean).join(" · "), M, y, 11, normal, GRIS);
  y -= 16;
  texto(page, nombreDelPeriodo(r.desde, r.hasta), M, y, 11, negrita, AZUL);
  y -= 34;

  // Los números grandes
  const grandes: [string, string][] = [
    [h(r.horas + (r.apertura ?? 0)), r.apertura ? "horas, con las de antes" : "horas de vuelo"],
    [String(r.vuelos), r.vuelos === 1 ? "vuelo" : "vuelos"],
    [String(r.aterrizajes), "aterrizajes"],
  ];
  grandes.forEach(([num, et], i) => {
    const x = M + i * 170;
    texto(page, num, x, y, 28, negrita);
    texto(page, et, x, y - 16, 10, normal, GRIS);
  });
  y -= 44;
  if (r.apertura) {
    texto(page, `${h(r.horas)} h de vuelos cargados en Vector y ${h(r.apertura)} h de antes (los totales de tu libro).`, M, y, 9.5, normal, GRIS);
    y -= 16;
  }
  y -= 14;

  // Tiempos de vuelo, como en el libro
  texto(page, "Tiempos de vuelo", M, y, 12, negrita);
  y -= 20;
  const cols = ["Aeródromo día", "Aeródromo noche", "Travesía día", "Travesía noche", "Total"];
  const xCol = (i: number) => M + 120 + i * 78 + 70;
  cols.forEach((c, i) => derecha(page, c, xCol(i), y, 8.5, negrita, GRIS));
  y -= 8;
  raya(y);
  const fila = (nombre: string, c: CeldasDeTiempo) => {
    y -= 16;
    texto(page, nombre, M, y, 10.5, negrita);
    const vals = [c.aerodromoDia, c.aerodromoNoche, c.travesiaDia, c.travesiaNoche];
    vals.forEach((v, i) => derecha(page, h(v), xCol(i), y, 10.5));
    derecha(page, h(vals.reduce((t, v) => t + v, 0)), xCol(4), y, 10.5, negrita);
    y -= 6;
    raya(y);
  };
  fila("Piloto", r.piloto);
  fila("Copiloto", r.copiloto);
  y -= 22;

  // Lo que va aparte
  const aparte: [string, string][] = [
    ["Instrumentos (real)", `${h(r.instrumentos)} h`],
    ["Capota", `${h(r.capota)} h`],
    ["Aterrizajes nocturnos al mando", String(r.aterrizajesNoche)],
    ["Simulador", r.simulador.sesiones ? `${h(r.simulador.horas)} h en ${r.simulador.sesiones} ${r.simulador.sesiones === 1 ? "sesión" : "sesiones"}` : "—"],
  ];
  for (const [et, v] of aparte) {
    texto(page, et, M, y, 10.5, normal, GRIS);
    derecha(page, v, M + 300, y, 10.5, negrita);
    y -= 16;
  }
  texto(page, "Instrumentos y capota ya están dentro de los tiempos de vuelo; el simulador no es hora de vuelo.", M, y - 2, 8.5, normal, GRIS);
  y -= 34;

  // Por avión y por finalidad
  const tabla = (titulo: string, encabezado: string[], filas: string[][]) => {
    nuevaHojaSiHaceFalta(60);
    texto(page, titulo, M, y, 12, negrita);
    y -= 20;
    const xs = [M, M + 200, M + 340, A4[0] - M];
    encabezado.forEach((e, i) => (i === 0 ? texto(page, e, xs[0], y, 8.5, negrita, GRIS) : derecha(page, e, xs[i + 1] ?? xs[3], y, 8.5, negrita, GRIS)));
    y -= 8;
    raya(y);
    for (const f of filas) {
      nuevaHojaSiHaceFalta(20);
      y -= 15;
      f.forEach((c, i) => (i === 0 ? texto(page, c, xs[0], y, 10) : derecha(page, c, xs[i + 1] ?? xs[3], y, 10, i === f.length - 1 ? negrita : normal)));
      y -= 5;
      raya(y);
    }
    y -= 26;
  };
  if (r.porAvion.length)
    tabla(
      "Por avión",
      ["Avión", "Vuelos", "Horas"],
      r.porAvion.map((a) => [`${a.matricula}${a.tipo ? `  ${a.tipo}` : ""}`, String(a.vuelos), h(a.horas)])
    );
  if (r.porFinalidad.length) tabla("Por finalidad", ["Finalidad", "Vuelos", "Horas"], r.porFinalidad.map((f) => [f.finalidad, String(f.vuelos), h(f.horas)]));

  // Pie, en todas las hojas
  for (const p of doc.getPages()) {
    p.drawText("Hecho con Vector a partir de tu bitácora. No reemplaza al libro de vuelo ni a lo declarado en el CAD de ANAC.", {
      x: M,
      y: M - 12,
      size: 8,
      font: normal,
      color: GRIS,
    });
  }
  return doc.save();
}
