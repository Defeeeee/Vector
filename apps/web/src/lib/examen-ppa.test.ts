import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MATERIAS, PREGUNTAS, armarTanda, avance, falladas, registrar, resultado, type Historial } from "./examen-ppa";

describe("el banco de preguntas del PPA", () => {
  it("son las 379 del banco de ANAC que tienen una respuesta legible", () => {
    // Ver docs/normativa/examen-ppa-anac.md: 385 en el banco, 6 sin una correcta legible.
    expect(PREGUNTAS).toHaveLength(379);
    expect(new Set(PREGUNTAS.map((p) => p.id)).size).toBe(379);
  });

  it("las que nombran una figura la traen, y el archivo existe", () => {
    const conFigura = PREGUNTAS.filter((p) => p.figura);
    expect(conFigura).toHaveLength(63);
    for (const p of conFigura) {
      expect(existsSync(`public${p.figura!.src}`), `figura de ${p.id}`).toBe(true);
      expect(p.figura!.ancho).toBeGreaterThan(100);
    }
    // Palabra entera: "configuración" no es una figura (la 167).
    for (const p of PREGUNTAS.filter((x) => /\bfigura\b|ilustraci|siguiente (imagen|gr[aá]fico)/i.test(x.pregunta)))
      expect(p.figura, `la ${p.id} nombra una figura`).toBeDefined();
  });

  it("cada una con 2 o 3 opciones, una correcta y una materia de las 8", () => {
    for (const p of PREGUNTAS) {
      expect(p.pregunta.length, `pregunta ${p.id}`).toBeGreaterThan(5);
      expect([2, 3], `opciones de ${p.id}`).toContain(p.opciones.length);
      expect(p.opciones.every((o) => o.trim().length > 0), `opción vacía en ${p.id}`).toBe(true);
      expect(p.correcta).toBeGreaterThanOrEqual(0);
      expect(p.correcta).toBeLessThan(p.opciones.length);
      expect(MATERIAS).toContain(p.materia);
      // Sin los prefijos internos del banco ni el pie del PDF.
      expect(p.pregunta, `prefijo en ${p.id}`).not.toMatch(/^(\d|24-10-13|PPA|CRM|NAV)/);
      expect(p.opciones.join(" "), `pie del PDF en ${p.id}`).not.toMatch(/Powered by/);
    }
  });

  it("todas las materias tienen preguntas", () => {
    for (const m of avance({})) expect(m.total, m.materia).toBeGreaterThan(10);
  });

  it("una pregunta conocida, con la respuesta del banco", () => {
    const p = PREGUNTAS.find((x) => x.id === 5)!;
    expect(p.pregunta).toBe("En el Ciclo OTTO la combustion se realiza a:");
    expect(p.opciones[p.correcta]).toBe("volumen constante.");
    expect(p.materia).toBe("Grupo motopropulsor");
  });
});

describe("la práctica", () => {
  const azar = () => 0.42;

  it("arma una tanda sin repetir, de una materia o de todas", () => {
    const t = armarTanda({ cantidad: 20 }, azar);
    expect(t).toHaveLength(20);
    expect(new Set(t.map((p) => p.id)).size).toBe(20);
    const met = armarTanda({ materia: "Meteorología", cantidad: 500 }, azar);
    expect(met.every((p) => p.materia === "Meteorología")).toBe(true);
    expect(met.length).toBe(PREGUNTAS.filter((p) => p.materia === "Meteorología").length);
  });

  it("lleva la cuenta y repasa lo que salió mal la última vez", () => {
    let h: Historial = {};
    h = registrar(h, 5, false);
    h = registrar(h, 1, true);
    h = registrar(h, 2, false);
    h = registrar(h, 2, true);
    expect(h[2]).toEqual({ bien: 1, mal: 1, ultima: true });
    expect(falladas(h).map((p) => p.id)).toEqual([5]);
    expect(armarTanda({ cantidad: 10, soloFalladas: true, historial: h }, azar).map((p) => p.id)).toEqual([5]);
    expect(avance(h).find((m) => m.materia === "Grupo motopropulsor")).toMatchObject({ vistas: 1, bien: 0 });
  });

  it("corrige la tanda, en total y por materia", () => {
    const [a, b] = PREGUNTAS.filter((p) => p.materia === "Aerodinámica");
    const r = resultado([
      { pregunta: a, elegida: a.correcta },
      { pregunta: b, elegida: (b.correcta + 1) % b.opciones.length },
    ]);
    expect(r).toMatchObject({ total: 2, bien: 1, porcentaje: 50 });
    expect(r.porMateria).toEqual([{ materia: "Aerodinámica", total: 2, bien: 1 }]);
  });
});
