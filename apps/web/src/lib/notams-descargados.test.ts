import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchAnac } = vi.hoisted(() => ({ fetchAnac: vi.fn() }));
vi.mock("./anac", () => ({ fetchAnac }));

import { VIGENCIA_MIN, alDia, deIndicador, notamsCrudos, notamsDelPais } from "./notams-descargados";

const ahora = new Date("2026-11-03T02:00:00Z");
const hace = (min: number) => new Date(ahora.getTime() - min * 60000).toISOString();

const PAIS = [
  { ad: "SAN FERNANDO", indicador: "FDO", notam: "A1/26", desde: "", hasta: "", novedad: "RWY 05 CLSD" },
  { ad: "SAN FERNANDO", indicador: "FDO", notam: "A2/26", desde: "", hasta: "", novedad: "TWY B CLSD" },
  { ad: "AEROCLUB ALTO PARANA ELDORADO", indicador: "ELD", notam: "C1621/2026", desde: "", hasta: "", novedad: "LDG AREA LGT FAC U/S" },
];

let dir: string;
function escribir(verificado: string, notams: unknown = PAIS) {
  fs.writeFileSync(path.join(dir, "notams-anac.json"), JSON.stringify({ actualizacion: "02 Nov 2026 21:33", descargado: verificado, notams }));
  fs.writeFileSync(path.join(dir, "notams-anac.verificado"), `${verificado}\n`);
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "notams-"));
  vi.stubEnv("VECTOR_DATOS_DIR", dir);
  fetchAnac.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("alDia", () => {
  it(`vale ${VIGENCIA_MIN} minutos desde la última verificación`, () => {
    expect(alDia(hace(10), ahora)).toBe(true);
    expect(alDia(hace(VIGENCIA_MIN + 1), ahora)).toBe(false);
    expect(alDia(null, ahora)).toBe(false);
    expect(alDia("cualquier cosa", ahora)).toBe(false);
  });
});

describe("deIndicador", () => {
  it("los de un aeródromo, aeroclubes incluidos", () => {
    expect(deIndicador(PAIS, "FDO").map((n) => n.notam)).toEqual(["A1/26", "A2/26"]);
    expect(deIndicador(PAIS, "eld")).toHaveLength(1);
    expect(deIndicador(PAIS, "GEZ")).toEqual([]);
  });
});

describe("notamsDelPais", () => {
  it("al día, devuelve la lista con la actualización de ANAC", () => {
    escribir(hace(5));
    const pais = notamsDelPais(ahora);
    expect(pais?.items).toHaveLength(3);
    expect(pais?.actualizacion).toBe("02 Nov 2026 21:33");
  });

  it("atrasada o sin archivo, null: no se usa una lista vieja", () => {
    escribir(hace(VIGENCIA_MIN + 5));
    expect(notamsDelPais(ahora)).toBeNull();
    fs.rmSync(path.join(dir, "notams-anac.verificado"));
    expect(notamsDelPais(ahora)).toBeNull();
  });

  it("un archivo roto no tira", () => {
    escribir(hace(5));
    fs.writeFileSync(path.join(dir, "notams-anac.json"), "{roto");
    expect(() => notamsDelPais(ahora)).not.toThrow();
  });
});

describe("notamsCrudos", () => {
  it("con la descarga al día no le pregunta a ANAC, y [] es \"no hay\"", async () => {
    vi.useFakeTimers({ now: ahora, toFake: ["Date"] });
    escribir(hace(5));
    const r = await notamsCrudos("GEZ");
    expect(r).toMatchObject({ items: [], fuente: "descarga", actualizacion: "02 Nov 2026 21:33" });
    expect(fetchAnac).not.toHaveBeenCalled();
  });

  it("sin descarga al día, le pregunta a ANAC; si no contesta, null (\"no se pudo\")", async () => {
    fetchAnac.mockRejectedValueOnce(new Error("timeout"));
    const r = await notamsCrudos("FDO");
    expect(fetchAnac).toHaveBeenCalledOnce();
    expect(r).toMatchObject({ items: null, fuente: null });
  });
});
