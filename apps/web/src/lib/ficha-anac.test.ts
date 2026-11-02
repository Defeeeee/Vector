import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { datosAip } from "./aip";
import { leerMadhel, leerNotams } from "./ficha-anac";

// Respuestas reales de ANAC (2026-11-02), tal cual llegan al navegador del piloto.
const fixture = (nombre: string) =>
  JSON.parse(readFileSync(path.join(process.cwd(), "src/lib/__fixtures__/anac", nombre), "utf8"));

describe("leerNotams", () => {
  it("lee la respuesta real de ANAC", () => {
    const notams = leerNotams(fixture("notam-FDO.json"));
    expect(notams).toHaveLength(8);
    for (const n of notams ?? []) {
      expect(n.code).toMatch(/\S/);
      expect(n.textEsp).not.toMatch(/<[a-z]/i);
    }
  });

  it("separa el inglés del castellano y marca los permanentes", () => {
    const [n] = leerNotams([
      { notam: "A1234/26", desde: "2026-11-01 10:00:00", hasta: "0000-00-00 00:00:00", novedad: "<p>RWY 05 CLSD</p>Versión en Español: PISTA 05 CERRADA" },
    ])!;
    expect(n).toEqual({ code: "A1234/26", from: "2026-11-01 10:00:00", to: "PERMANENTE", textRaw: "RWY 05 CLSD", textEsp: "PISTA 05 CERRADA" });
  });

  it("lo que no es una lista es \"no se pudo consultar\", nunca \"no hay\"", () => {
    expect(leerNotams(null)).toBeNull();
    expect(leerNotams({ error: "x" })).toBeNull();
    expect(leerNotams([])).toEqual([]);
  });
});

describe("leerMadhel", () => {
  it("un no controlado trae sus pistas de MADHEL", () => {
    const ficha = leerMadhel(fixture("madhel-GEZ.json"), "GEZ", datosAip("GEZ"));
    expect(ficha?.runways).toContain("17/35 1400x21 M – Tierra.");
    expect(ficha?.aip).toBeNull();
  });

  it("un controlado completa con el AIP lo que MADHEL deja vacío", () => {
    const ficha = leerMadhel(fixture("madhel-FDO.json"), "SADF", datosAip("SADF"));
    expect(ficha?.runways.length).toBeGreaterThan(0);
    expect(ficha?.fuel).toMatch(/100LL/);
    expect(ficha?.aip).not.toBeNull();
  });

  it("sin ficha de MADHEL, null", () => {
    expect(leerMadhel(null, "SADF", null)).toBeNull();
    expect(leerMadhel({ detail: "Not found." }, "XXXX", null)).toBeNull();
  });
});
