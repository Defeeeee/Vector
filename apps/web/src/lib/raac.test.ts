import { describe, expect, it } from "vitest";
import raac61 from "../data/raac/raac-61.json";
import raac91 from "../data/raac/raac-91.json";
import { buscarEnRaac, type ParteRaac } from "./raac";

const partes = [raac61 as ParteRaac, raac91 as ParteRaac];
const primeras = (q: string, n = 2) => buscarEnRaac(q, partes).slice(0, n).map((r) => r.seccion);

describe("el texto de la RAAC 61", () => {
  it("es la VI edición con la Enmienda I, partida por sección, con su capítulo", () => {
    expect(raac61.edicion).toContain("VI Edición, Enmienda I");
    expect(raac61.secciones.length).toBeGreaterThan(130);
    const s = raac61.secciones.find((x) => x.seccion === "61.140")!;
    expect(s.titulo).toBe("Experiencia reciente");
    expect(s.capitulo).toBe("Capítulo A: Generalidades");
    // El texto es el del PDF, sin resumir: los 90 y los 180 días de la experiencia reciente.
    expect(s.texto).toContain("dentro de los 90 días precedentes");
    expect(s.texto).toContain("se extiende hasta 180 días");
  });

  it("cada sección del índice que no es 'Reservado' tiene su texto (también las de cuatro cifras)", () => {
    const numeros = raac61.secciones.map((x) => x.seccion);
    for (const n of ["61.001", "61.060", "61.065", "61.500", "61.505", "61.620", "61.1105", "61.1700"]) expect(numeros).toContain(n);
  });
});

describe("el texto de la RAAC 91", () => {
  it("es la IV edición, partida por sección, con su subparte", () => {
    expect(raac91.edicion).toContain("IV Edición");
    const s = raac91.secciones.find((x) => x.seccion === "91.151")!;
    expect(s.titulo).toBe("Requisitos de combustible y lubricante para vuelos VFR.");
    expect(s.capitulo).toBe("Subparte B: Reglas generales de vuelo");
    expect(s.texto).toContain("por lo menos 30 minutos a altitud normal de crucero");
  });

  it("tiene las secciones de una cifra, las de la subparte B y los apéndices, sin los encabezados de página", () => {
    const numeros = raac91.secciones.map((x) => x.seccion);
    for (const n of ["91.1", "91.3", "91.103", "91.153", "91.155", "91.510", "91.1721", "91 Apéndice D", "91 Apéndice M"]) expect(numeros).toContain(n);
    // "91.153 (d) (3) de esta Parte)" en el principio de un renglón es una cita, no una sección.
    expect(raac91.secciones.find((x) => x.seccion === "91.153")!.titulo).toBe("Plan de Vuelo.");
    for (const x of raac91.secciones) expect(x.texto).not.toMatch(/\d+º Edición|REGULACIONES ARGENTINAS DE AVIACIÓN CIVIL \(RAAC\)/);
  });
});

describe("Preguntale a la RAAC: la búsqueda", () => {
  it("contesta como pregunta un piloto", () => {
    // Con la 91, la experiencia reciente del MU-2B (91.1715, su subparte lo dice) compite: la
    // general está igual entre las cuatro que recibe el copiloto.
    expect(primeras("¿Cuántos aterrizajes necesito para llevar pasajeros?", 4)).toContain("61.140");
    expect(primeras("experiencia reciente de noche", 1)).toEqual(["61.140"]);
    expect(buscarEnRaac("¿cuánto dura el CMA?", partes).map((r) => r.seccion)).toContain("61.065");
    expect(primeras("¿a qué edad puedo sacar la licencia de piloto privado?", 1)).toEqual(["61.505"]);
    expect(primeras("horas de vuelo para la PCA", 1)).toEqual(["61.620"]);
    expect(primeras("vuelo solo del alumno", 1)).toEqual(["61.410"]);
    expect(primeras("requisitos para la habilitación de instructor de vuelo", 1)).toEqual(["61.1105"]);
  });

  it("y de reglas de vuelo, con la RAAC 91", () => {
    expect(primeras("combustible de reserva para un vuelo VFR", 1)).toEqual(["91.151"]);
    expect(primeras("mínimos de visibilidad y distancia de las nubes VFR", 2)).toContain("91.155");
    expect(primeras("¿qué dice la 91.3?", 1)).toEqual(["91.3"]);
  });

  it("un número de sección va directo, y '¿qué es…?' a las definiciones", () => {
    expect(primeras("¿qué dice la 61.060?", 1)).toEqual(["61.060"]);
    const def = buscarEnRaac("¿qué es una aeronave?", partes)[0];
    expect(def.seccion).toBe("61.001");
    // Las definiciones son larguísimas: va sólo lo que se pregunta.
    expect(def.texto.length).toBeLessThan(3600);
    expect(def.texto).toContain("Aeronave.");
  });

  it("sin palabras que buscar, no inventa resultados", () => {
    expect(buscarEnRaac("¿y?", partes)).toEqual([]);
  });
});

describe("la herramienta del copiloto", () => {
  it("devuelve el texto con la sección citada, o que no hay nada", async () => {
    const { respuestaRaac } = await import("./raac-copiloto");
    const r = respuestaRaac("experiencia reciente") as { secciones: { seccion: string; texto: string }[]; fuente?: string };
    // Hay más de una "experiencia reciente" (la general y la de cada habilitación): la general está.
    expect(r.secciones.map((x) => x.seccion)).toContain("RAAC 61.140");
    expect(r.fuente).toContain("VI Edición");
    expect(r.fuente).toContain("RAAC 91 (IV Edición");
    expect(respuestaRaac("¿y?")).toEqual({ secciones: [], nota: "No se encontró nada sobre eso en la RAAC 61 ni en la RAAC 91 que tiene Vector." });
  });
});
