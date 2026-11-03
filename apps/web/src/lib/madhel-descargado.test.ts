import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VIGENCIA_DIAS, copiaAlDia, fichaMadhel, madhelAlDia } from "./madhel-descargado";

const ahora = new Date("2026-11-03T02:00:00Z");
const haceDias = (d: number) => new Date(ahora.getTime() - d * 86400000).toISOString();
const PEH = { human_readable_identifier: "PEHUAJÓ - (PEH)", metadata: { condition: "PUBLICO" }, data: { rwy: ["18/36 1500x30 M - ASPH"] } };

let dir: string;
const escribir = (descargado: string) =>
  fs.writeFileSync(path.join(dir, "madhel-fichas.json"), JSON.stringify({ descargado, fichas: { PEH } }));

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "madhel-"));
  vi.stubEnv("VECTOR_DATOS_DIR", dir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("la copia mensual de MADHEL", () => {
  it(`vale ${VIGENCIA_DIAS} días`, () => {
    expect(copiaAlDia(haceDias(30), ahora)).toBe(true);
    expect(copiaAlDia(haceDias(VIGENCIA_DIAS + 1), ahora)).toBe(false);
    expect(copiaAlDia(null, ahora)).toBe(false);
  });

  it("da la ficha de un aeródromo, por designador", () => {
    escribir(haceDias(3));
    expect(fichaMadhel("peh", ahora)).toEqual(PEH);
    expect(fichaMadhel("XXX", ahora)).toBeNull();
    expect(madhelAlDia(ahora)).toEqual({ descargado: haceDias(3) });
  });

  it("vieja o sin archivo, null: la ficha se pide como antes", () => {
    escribir(haceDias(VIGENCIA_DIAS + 5));
    expect(fichaMadhel("PEH", ahora)).toBeNull();
    expect(madhelAlDia(ahora)).toBeNull();
    fs.rmSync(path.join(dir, "madhel-fichas.json"));
    expect(fichaMadhel("PEH", ahora)).toBeNull();
  });
});
