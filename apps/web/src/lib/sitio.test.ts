import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GUIAS, SITIO_URL, fechaLarga, urlAbsoluta } from "./sitio";

describe("sitio público", () => {
  it("cada guía tiene su página, y ninguna se repite", () => {
    for (const g of GUIAS) {
      expect(existsSync(path.join(process.cwd(), "src/app/guias", g.slug, "page.tsx")), g.slug).toBe(true);
    }
    expect(new Set(GUIAS.map((g) => g.slug)).size).toBe(GUIAS.length);
  });

  it("las descripciones entran en el resultado de un buscador", () => {
    for (const g of GUIAS) expect(g.descripcion.length, g.slug).toBeLessThanOrEqual(200);
  });

  it("arma URLs absolutas sin barras dobles", () => {
    expect(SITIO_URL.endsWith("/")).toBe(false);
    expect(urlAbsoluta("/guias")).toBe(`${SITIO_URL}/guias`);
    expect(urlAbsoluta("guias")).toBe(`${SITIO_URL}/guias`);
  });
});

describe("fechaLarga", () => {
  it("escribe la fecha como se lee, sin depender del idioma del server", () => {
    expect(fechaLarga("2026-09-23")).toBe("23 de septiembre de 2026");
    expect(fechaLarga("2026-01-05T10:00:00Z")).toBe("5 de enero de 2026");
  });
});
