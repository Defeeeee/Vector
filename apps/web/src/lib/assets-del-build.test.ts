import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// Es un .mjs de `scripts/` (lo usa `build-sw.mjs` en el build).
import { listarAssets } from "../../scripts/assets-del-build.mjs";
import { estrategiaPara } from "./pwa";

/** La lista de archivos que el service worker guarda al instalarse: sale de `.next/static`. */
describe("listarAssets", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

  function armar(archivos: string[]): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vector-static-"));
    dirs.push(dir);
    for (const a of archivos) {
      fs.mkdirSync(path.dirname(path.join(dir, a)), { recursive: true });
      fs.writeFileSync(path.join(dir, a), "x");
    }
    return dir;
  }

  it("lista todo, con la URL que el navegador pide, primero el CSS y las tipografías", () => {
    const dir = armar(["chunks/b.js", "chunks/a.css", "media/f.woff2", "media/pdf.worker.min.x.mjs", "chunks/a.js"]);
    expect(listarAssets(dir)).toEqual([
      "/_next/static/chunks/a.css",
      "/_next/static/media/f.woff2",
      "/_next/static/chunks/a.js",
      "/_next/static/chunks/b.js",
      "/_next/static/media/pdf.worker.min.x.mjs",
    ]);
  });

  it("deja afuera los mapas de fuentes y la basura, y escapa lo que hay que escapar", () => {
    const dir = armar(["chunks/a.js.map", ".DS_Store", "chunks/con espacio.js", "chunks/0.ubyz~k6m-.js"]);
    expect(listarAssets(dir)).toEqual(["/_next/static/chunks/0.ubyz~k6m-.js", "/_next/static/chunks/con%20espacio.js"]);
  });

  it("sin la carpeta (un `build:sw` suelto) no tira: la lista queda vacía", () => {
    expect(listarAssets(path.join(os.tmpdir(), "no-existe-vector-static"))).toEqual([]);
  });

  it("todo lo que se lista lo sirve el service worker con cache primero", () => {
    for (const url of listarAssets(armar(["chunks/a.js", "media/f.woff2"]))) {
      expect(estrategiaPara({ metodo: "GET", url: `https://vectoraero.ar${url}`, modo: "no-cors", esRSC: false }, "https://vectoraero.ar")).toBe("assets");
    }
  });
});
