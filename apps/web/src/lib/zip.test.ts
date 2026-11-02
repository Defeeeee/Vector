import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { armarZip, crc32 } from "./zip";

describe("el ZIP de las pegatinas", () => {
  it("el CRC-32 es el del estándar", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("lo abre `unzip` con cada archivo intacto", () => {
    const a = new TextEncoder().encode("hola");
    const b = Uint8Array.from({ length: 5000 }, (_, i) => i % 251);
    const dir = mkdtempSync(join(tmpdir(), "zip-"));
    writeFileSync(join(dir, "x.zip"), armarZip([{ nombre: "Vector-K7P2.png", datos: a }, { nombre: "Vector-M3XA.png", datos: b }]));
    let lista: string;
    try {
      lista = execFileSync("unzip", ["-t", join(dir, "x.zip")], { encoding: "utf8" });
    } catch (e) {
      // Sin `unzip` en la máquina no hay contra qué probar; el resto del test sí corre.
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
      throw e;
    }
    expect(lista).toContain("No errors detected");
    execFileSync("unzip", ["-q", join(dir, "x.zip"), "-d", join(dir, "fuera")]);
    expect(readFileSync(join(dir, "fuera", "Vector-K7P2.png"), "utf8")).toBe("hola");
    expect(new Uint8Array(readFileSync(join(dir, "fuera", "Vector-M3XA.png")))).toEqual(b);
  });
});
