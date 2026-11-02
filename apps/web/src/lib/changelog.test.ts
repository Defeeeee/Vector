import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHANGELOG, NOVEDADES_EN_TARJETA, VERSIONES_SIN_NOVEDADES, VERSION_ACTUAL, claveDescarte, esParcheDe } from "./changelog";

/**
 * Estos tests existen por un motivo concreto: **la tarjeta de novedades ya mintió una
 * vez.** Vivía como JSX con la versión escrita a mano, y anunció durante tres semanas
 * las features de la 2.7.0 mientras se publicaban diez más.
 *
 * No alcanza con mover el contenido a datos: hay que atar los datos a la realidad. Eso
 * es lo que hacen los dos tests importantes de acá — el que compara contra
 * `package.json` y el que abre `src/app/` para verificar que cada link exista.
 */

const RAIZ = process.cwd();
const paquete = JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8"));

describe("la versión", () => {
  it("es la misma que la de package.json", () => {
    /*
      **El test que impide que la app mienta.** Si alguien sube la versión en
      `package.json` y no escribe las novedades, esto lo frena en CI — en vez de
      publicar una versión nueva anunciando lo viejo, que es exactamente lo que pasó
      antes.
    */
    expect(VERSION_ACTUAL).toBe(paquete.version);
  });

  it("una versión sin novedades es un parche de la última publicada, y no se repite", () => {
    /*
      La salida para no anunciar un cambio (Federico, 2026-10-20) sin abrir la puerta a
      subir la versión y olvidarse las novedades: sólo vale el último dígito, sobre la
      última versión publicada, y con el motivo escrito.
    */
    const publicadas = new Set(CHANGELOG.map((v) => v.version));
    for (const v of VERSIONES_SIN_NOVEDADES) {
      expect(v.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(publicadas.has(v.version)).toBe(false);
      expect(v.motivo.length).toBeGreaterThan(10);
    }
    if (VERSION_ACTUAL !== CHANGELOG[0].version) expect(esParcheDe(VERSION_ACTUAL, CHANGELOG[0].version)).toBe(true);
    expect(esParcheDe("2.26.1", "2.26.0")).toBe(true);
    expect(esParcheDe("2.27.0", "2.26.0")).toBe(false);
    expect(esParcheDe("2.26.0", "2.26.0")).toBe(false);
  });

  it("va de la más nueva a la más vieja", () => {
    // La tarjeta muestra `CHANGELOG[0]` y nada más: una entrada fuera de orden
    // anunciaría lo viejo como si fuera lo último.
    const aNumeros = (v: string) => v.split(".").map(Number);
    for (let i = 0; i + 1 < CHANGELOG.length; i++) {
      const [aM, aMi, aP] = aNumeros(CHANGELOG[i].version);
      const [bM, bMi, bP] = aNumeros(CHANGELOG[i + 1].version);
      expect(aM * 1e6 + aMi * 1e3 + aP).toBeGreaterThan(bM * 1e6 + bMi * 1e3 + bP);
    }
  });

  it("las fechas también van para atrás", () => {
    for (let i = 0; i + 1 < CHANGELOG.length; i++) {
      expect(CHANGELOG[i].fecha >= CHANGELOG[i + 1].fecha).toBe(true);
    }
  });

  it("no hay versiones repetidas", () => {
    const vistas = CHANGELOG.map((v) => v.version);
    expect(new Set(vistas).size).toBe(vistas.length);
  });

  it("todas tienen formato semver y fecha ISO", () => {
    for (const v of CHANGELOG) {
      expect(v.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(v.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Fecha real, no un 2026-13-45 que pasaría el regex.
      expect(Number.isNaN(Date.parse(v.fecha))).toBe(false);
    }
  });
});

describe("las novedades", () => {
  const todas = CHANGELOG.flatMap((v) => v.novedades);

  it("cada versión tiene al menos una", () => {
    for (const v of CHANGELOG) {
      expect(v.novedades.length).toBeGreaterThan(0);
      expect(v.titulo.trim()).not.toBe("");
    }
  });

  it("ninguna está vacía", () => {
    for (const n of todas) {
      expect(n.titulo.trim()).not.toBe("");
      expect(n.texto.trim()).not.toBe("");
    }
  });

  it("los links apuntan a pantallas que existen de verdad", () => {
    /*
      **El segundo test que importa.** Lee `src/app/` y comprueba que la ruta tenga su
      `page.tsx`. Sin esto, una novedad puede anunciar con entusiasmo una pantalla que
      se renombró o que nunca se publicó, y el piloto se come un 404 desde la tarjeta
      que le dice "esto es lo nuevo".
    */
    for (const n of todas) {
      if (!n.href) continue;
      const segmentos = n.href.replace(/^\//, "").split("/").filter(Boolean);
      const pagina = path.join(RAIZ, "src", "app", ...segmentos, "page.tsx");
      expect(fs.existsSync(pagina), `${n.href} no tiene page.tsx (${n.titulo})`).toBe(true);
    }
  });

  it("un link sin texto de botón no sirve, y al revés tampoco", () => {
    for (const n of todas) {
      expect(!!n.href).toBe(!!n.cta);
    }
  });

  it("la versión actual entra en la tarjeta sin desbordar", () => {
    // No es un límite duro —la pantalla de novedades las muestra todas— pero si la
    // entrada nueva tiene ocho items, la tarjeta del dashboard va a tapar todo lo demás.
    expect(CHANGELOG[0].novedades.length).toBeLessThanOrEqual(NOVEDADES_EN_TARJETA);
  });
});

describe("claveDescarte", () => {
  it("es distinta por versión, así la tarjeta vuelve al publicar", () => {
    // Si la clave no llevara la versión, quien descartó una vez no vería nunca más una
    // novedad. Es el comportamiento que ya tenía el componente y que hay que conservar.
    expect(claveDescarte("2.8.0")).not.toBe(claveDescarte("2.7.0"));
  });

  it("es estable para la misma versión", () => {
    expect(claveDescarte("2.8.0")).toBe(claveDescarte("2.8.0"));
  });
});
