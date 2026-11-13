import { writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { PDFArray, PDFDocument, type PDFRawStream } from "pdf-lib";
import QRCode from "qrcode";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { pngDeDataUrl } from "./libro-anac-armar";
import { valoresDeApertura } from "./libro-anac";
import { ALTO_HOJA, ANCHO_HOJA, MAX_IMAGENES_DORSO, pdfDelLibro } from "./libro-anac-pdf";
import { CAJA_SELLO } from "./firmas-libro";

const titular = { apellidoYNombre: "Ferrari, Lucía", licencia: "PPA", licenciaNumero: "12345678", legajo: "" };
const apertura = valoresDeApertura(null);
const tieneImagen = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1").includes("/Subtype /Image");

describe("el libro en PDF, firmado", () => {
  it("la firma guardada sólo se acepta si es un PNG de verdad", async () => {
    const png = await QRCode.toBuffer("firma", { type: "png" });
    expect(pngDeDataUrl(`data:image/png;base64,${png.toString("base64")}`)?.length).toBe(png.length);
    expect(pngDeDataUrl("data:image/png;base64,aG9sYQ==")).toBeUndefined();
    expect(pngDeDataUrl("data:image/jpeg;base64,/9j/4AAQ")).toBeUndefined();
    expect(pngDeDataUrl(null)).toBeUndefined();
  });

  it("con la firma, cada hoja la lleva; sin la firma, no hay imagen", async () => {
    const png = new Uint8Array(await QRCode.toBuffer("firma", { type: "png" }));
    const firmado = await pdfDelLibro([], titular, { generado: "26/10/2026", apertura, firmaPng: png });
    const sinFirma = await pdfDelLibro([], titular, { generado: "26/10/2026", apertura });
    expect(tieneImagen(firmado)).toBe(true);
    expect(tieneImagen(sinFirma)).toBe(false);
    // Para mirarlo: LIBRO_PDF_DEMO=/ruta/libro.pdf npx vitest run src/lib/libro-anac-pdf.test.ts
    if (process.env.LIBRO_PDF_DEMO) writeFileSync(process.env.LIBRO_PDF_DEMO, firmado);
  });
});

describe("el dorso con varias fotos y sellos, a tamaño real", () => {
  const cuenta = (bytes: Uint8Array) => (Buffer.from(bytes).toString("latin1").match(/\/Subtype \/Image/g) ?? []).length;
  const png = async (texto: string) => new Uint8Array(await QRCode.toBuffer(texto, { type: "png" }));

  /** Los rectángulos `w h x y` de las imágenes dibujadas en una página (operador `cm` de cada `Do`). */
  async function imagenesDeLaPagina(bytes: Uint8Array, pagina: number) {
    const doc = await PDFDocument.load(bytes);
    const contenido = doc.getPage(pagina).node.Contents();
    const streams = contenido instanceof PDFArray ? contenido.asArray().map((r) => doc.context.lookup(r)) : [contenido];
    const texto = streams
      .map((st) => {
        const crudo = (st as PDFRawStream).getContents();
        try {
          return inflateSync(crudo).toString("latin1");
        } catch {
          return Buffer.from(crudo).toString("latin1");
        }
      })
      .join("\n");
    // pdf-lib dibuja cada imagen como `q`, una traslación (x y), la escala (w h) y `/Imagen Do`.
    return [...texto.matchAll(/q\n((?:[-\d. ]+ cm\n)+)\/Image\S* Do/g)].map((m) => {
      const cms = [...m[1].matchAll(/([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) cm/g)].map((c) => c.slice(1).map(Number));
      const escala = cms.find((c) => c[0] !== 1 || c[3] !== 1) ?? [1, 0, 0, 1, 0, 0];
      return { w: escala[0], h: escala[3], x: cms[0][4], y: cms[0][5] };
    });
  }

  it("las fotos de la hoja y los sellos elegidos van juntos en el mismo dorso", async () => {
    const dorsos = new Map([[1, { fotos: [await png("foto 1"), await png("foto 2"), await png("foto 3")], sellos: [await png("sello A")] }]]);
    const bytes = await pdfDelLibro([], titular, { generado: "26/10/2026", apertura, dorsos });
    expect(cuenta(bytes)).toBe(4);
    if (process.env.LIBRO_PDF_DEMO) writeFileSync(process.env.LIBRO_PDF_DEMO.replace(/\.pdf$/, "-sellos.pdf"), bytes);
  });

  it("sólo sellos, o sólo fotos, también", async () => {
    const solo = async (d: object) => cuenta(await pdfDelLibro([], titular, { generado: "26/10/2026", apertura, dorsos: new Map([[1, d]]) }));
    expect(await solo({ sellos: [await png("a"), await png("b")] })).toBe(2);
    expect(await solo({ fotos: [await png("c")] })).toBe(1);
  });

  it("no pasan de 12 imágenes por dorso", async () => {
    const quince = await Promise.all(Array.from({ length: 15 }, (_, i) => png(`imagen ${i}`)));
    const bytes = await pdfDelLibro([], titular, { generado: "26/10/2026", apertura, dorsos: new Map([[1, { fotos: quince.slice(0, 9), sellos: quince.slice(9) }]]) });
    expect(cuenta(bytes)).toBe(MAX_IMAGENES_DORSO);
  });

  it("un dorso de una hoja no se vuelca en otra: 1 hoja, 2 páginas", async () => {
    const bytes = await pdfDelLibro([], titular, { generado: "26/10/2026", apertura, dorsos: new Map([[1, { fotos: [await png("x")] }]]) });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
  });

  it("cada imagen sale de 7 × 3,5 cm como mucho (no se estira al espacio libre)", async () => {
    // QR cuadrado de 29 × 29 px: entra por el alto (3,5 cm), pero con 1 pt por píxel máximo es de 29 pt.
    const cuadrada = await png("cuadrada");
    const dorsos = new Map([[1, { fotos: [cuadrada, cuadrada], sellos: [cuadrada, cuadrada, cuadrada, cuadrada] }]]);
    const bytes = await pdfDelLibro([], titular, { generado: "26/10/2026", apertura, dorsos });
    const cajas = await imagenesDeLaPagina(bytes, 1);
    expect(cajas).toHaveLength(6);
    for (const c of cajas) {
      expect(c.w).toBeLessThanOrEqual(CAJA_SELLO.ancho + 0.01);
      expect(c.h).toBeLessThanOrEqual(CAJA_SELLO.alto + 0.01);
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x + c.w).toBeLessThanOrEqual(ANCHO_HOJA);
      expect(c.y + c.h).toBeLessThanOrEqual(ALTO_HOJA);
    }
  });

  it("una foto ancha llena 7 cm de ancho, no la hoja entera", async () => {
    const ancha = await sharp({ create: { width: 1200, height: 300, channels: 4, background: { r: 0, g: 0, b: 80, alpha: 1 } } }).png().toBuffer();
    const bytes = await pdfDelLibro([], titular, { generado: "26/10/2026", apertura, dorsos: new Map([[1, { fotos: [new Uint8Array(ancha)] }]]) });
    const [c] = await imagenesDeLaPagina(bytes, 1);
    expect(c.w).toBeCloseTo(CAJA_SELLO.ancho, 0);
    expect(c.w).toBeLessThan(ANCHO_HOJA / 4);
  });
});
