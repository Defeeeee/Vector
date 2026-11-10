import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ARRANQUE_MIN_ENTRE_MS, ISOTIPO_POLIGONOS, PANTALLAS_IPHONE, archivoDeArranque, esArranque, paginaDeArranque } from "./arranque";

const base = { metodo: "GET", modo: "navigate", pathname: "/dashboard", ventanasAbiertas: 0, ultimoArranqueMs: null, ahoraMs: 1_000_000 };

describe("la pantalla de arranque", () => {
  it("sólo en un arranque en frío del dashboard", () => {
    expect(esArranque(base)).toBe(true);
    expect(esArranque({ ...base, pathname: "/dashboard/history" })).toBe(true);
    expect(esArranque({ ...base, ventanasAbiertas: 1 })).toBe(false);
    expect(esArranque({ ...base, pathname: "/" })).toBe(false);
    expect(esArranque({ ...base, pathname: "/dashboardx" })).toBe(false);
    expect(esArranque({ ...base, pathname: "/login" })).toBe(false);
    expect(esArranque({ ...base, metodo: "POST" })).toBe(false);
    expect(esArranque({ ...base, modo: "cors" })).toBe(false);
  });

  it("no se repite enseguida: corta un bucle", () => {
    expect(esArranque({ ...base, ultimoArranqueMs: base.ahoraMs - 1000 })).toBe(false);
    expect(esArranque({ ...base, ultimoArranqueMs: base.ahoraMs - ARRANQUE_MIN_ENTRE_MS - 1 })).toBe(true);
  });

  it("vuelve a pedir la misma URL, sin dejarse en el historial", () => {
    expect(paginaDeArranque()).toContain("location.replace(location.href)");
  });

  it("la marca es la de public/marca", () => {
    const svg = fs.readFileSync(path.join(process.cwd(), "public/marca/isotipo-color.svg"), "utf8");
    for (const p of ISOTIPO_POLIGONOS) expect(svg).toContain(`points="${p.points}" fill="${p.fill}"`);
  });

  it("hay una imagen de arranque por pantalla, sin repetir", () => {
    const archivos = PANTALLAS_IPHONE.map(archivoDeArranque);
    expect(new Set(archivos).size).toBe(archivos.length);
    for (const a of archivos) expect(fs.existsSync(path.join(process.cwd(), "public", a))).toBe(true);
  });
});
