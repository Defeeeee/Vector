import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { armarPdfDelLibro } from "./libro-anac-armar";
import { RENGLONES_POR_HOJA } from "./libro-anac";
import type { Aircraft, Flight } from "@/types";

/**
 * El armado contra un backend de mentira: la hoja sola de la vista previa de «Firmas del libro»
 * (3.38.0) y que la vista previa no corte por lo que falta.
 */
const avion: Aircraft = { id: "a1", user_id: "u", registration: "LV-ABC", model: "C152", engine_type: "single", is_simulator: false } as unknown as Aircraft;
const vuelos: Flight[] = Array.from({ length: RENGLONES_POR_HOJA + 3 }, (_, i) => {
  const dia = String(i + 1).padStart(2, "0");
  return {
    id: `f${i}`, user_id: "u", aircraft_id: "a1", date: `2026-03-${dia}`, route: "SADF SAAR", landings: 1, duration: 1.2,
    takeoff: `2026-03-${dia}T13:00:00Z`, landing: `2026-03-${dia}T14:12:00Z`, purpose: "INST", pic_day_tra: 1.2,
  } as unknown as Flight;
});

const leerCon = (rutas: Record<string, unknown>) => async (ruta: string) => {
  const clave = Object.keys(rutas).find((r) => ruta === r || ruta.startsWith(`${r}?`));
  if (!clave) return new Response("{}", { status: 404 });
  return new Response(JSON.stringify(rutas[clave]), { status: 200, headers: { "content-type": "application/json" } });
};
const base = {
  "/profiles": [{ id: "u", first_name: "Ana", last_name: "Diaz", license_type: "PPA" }],
  "/flights": vuelos,
  "/aircraft": [avion],
  "/logbooks": [{ id: "l1", name: "Mi libro", is_default: true }],
  "/firmas/certificantes": [],
  "/firmas/constancias": [],
  "/firmas/dorsos": [],
};
const paginas = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPageCount();

describe("armarPdfDelLibro: una sola hoja (vista previa)", () => {
  it("la hoja pedida con su dorso: dos páginas, y dice cuántas hojas tiene el libro", async () => {
    const r = await armarPdfDelLibro(leerCon(base), { hoja: 2, conDorsos: true, vistaPrevia: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await paginas(r.bytes)).toBe(2);
    expect(r.hojas).toBe(2);
    expect(r.vuelos).toBe(3);
  });

  it("sin dorsos, sólo el frente", async () => {
    const r = await armarPdfDelLibro(leerCon(base), { hoja: 1 });
    expect(r.ok && (await paginas(r.bytes))).toBe(1);
  });

  it("una hoja que no existe es un 404 que dice cuántas hay", async () => {
    const r = await armarPdfDelLibro(leerCon(base), { hoja: 3 });
    expect(r).toMatchObject({ ok: false, status: 404, error: "Ese libro tiene 2 hojas." });
  });

  it("la vista previa no corta por lo que falta (tu firma, ninguna firma de certificante); la descarga sí", async () => {
    const sinFirma = { ...base, "/planes-de-vuelo/firma": null };
    const vista = await armarPdfDelLibro(leerCon(sinFirma), { hoja: 1, conFirma: true, conCertificaciones: true, conDorsos: true, vistaPrevia: true });
    expect(vista.ok).toBe(true);
    const descarga = await armarPdfDelLibro(leerCon(sinFirma), { conFirma: true });
    expect(descarga).toMatchObject({ ok: false, status: 404 });
    const certificaciones = await armarPdfDelLibro(leerCon(sinFirma), { conCertificaciones: true });
    expect(certificaciones).toMatchObject({ ok: false, status: 404 });
  });
});
