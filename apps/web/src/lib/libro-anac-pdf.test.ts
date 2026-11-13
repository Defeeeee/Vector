import { writeFileSync } from "node:fs";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { pngDeDataUrl } from "./libro-anac-armar";
import { valoresDeApertura } from "./libro-anac";
import { pdfDelLibro } from "./libro-anac-pdf";

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

describe("el dorso con las firmas con sello", () => {
  const cuenta = (bytes: Uint8Array) => (Buffer.from(bytes).toString("latin1").match(/\/Subtype \/Image/g) ?? []).length;

  it("sin foto propia, cada sello elegido va en el dorso de la hoja", async () => {
    const a = new Uint8Array(await QRCode.toBuffer("sello A", { type: "png" }));
    const b = new Uint8Array(await QRCode.toBuffer("sello B", { type: "png" }));
    const dorsos = new Map([[1, { sellos: [a, b] }]]);
    const bytes = await pdfDelLibro([], titular, { generado: "26/10/2026", apertura, dorsos });
    expect(cuenta(bytes)).toBe(2);
    if (process.env.LIBRO_PDF_DEMO) writeFileSync(process.env.LIBRO_PDF_DEMO.replace(/\.pdf$/, "-sellos.pdf"), bytes);
  });

  it("con foto propia, los sellos no se usan", async () => {
    const foto = new Uint8Array(await QRCode.toBuffer("foto", { type: "png" }));
    const a = new Uint8Array(await QRCode.toBuffer("sello A", { type: "png" }));
    const bytes = await pdfDelLibro([], titular, { generado: "26/10/2026", apertura, dorsos: new Map([[1, { png: foto, sellos: [a] }]]) });
    expect(cuenta(bytes)).toBe(1);
  });
});
