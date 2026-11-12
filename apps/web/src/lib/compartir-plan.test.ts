import { describe, expect, it } from "vitest";
import { motivoParaNoCompartir, puntosParaCompartir, rutaParaCompartir, salidaIso, TOPE_PUNTOS, type NodoParaCompartir } from "./compartir-plan";

const sadf = { codigo: "SADF", nombre: "San Fernando", lat: -34.4532, lon: -58.5897 };
const sadm = { codigo: "SADM", nombre: "Morón", lat: -34.6763, lon: -58.6428 };
const nodo = (p: Partial<NodoParaCompartir>): NodoParaCompartir => ({ tipo: "punto", texto: "X", estado: "ubicado", ...p });

describe("los puntos que se comparten", () => {
  it("salida, lo ubicado y destino, en orden", () => {
    const p = puntosParaCompartir({ salida: sadf, destino: sadm }, [nodo({ texto: "VM", lat: -34.55, lon: -58.6, etiqueta: "VOR Morón" })]);
    expect(p.map((x) => x.codigo)).toEqual(["SADF", "VM", "SADM"]);
    expect(p[1].nombre).toBe("VOR Morón");
    expect(p[0].nombre).toBe("San Fernando");
  });
  it("lo sin ubicar o buscando no entra, y la ruta escrita lo conserva", () => {
    const nodos = [nodo({ texto: "ZZZ", estado: "sin-ubicar" }), nodo({ texto: "QQQ", estado: "buscando" })];
    expect(puntosParaCompartir({ salida: sadf, destino: sadm }, nodos)).toHaveLength(2);
    expect(rutaParaCompartir({ salida: sadf, destino: sadm }, nodos)).toBe("SADF ZZZ QQQ SADM");
  });
  it("una aerovía aporta sus puntos, sin nombre", () => {
    const p = puntosParaCompartir({ salida: sadf, destino: sadm }, [nodo({ tipo: "aerovia", texto: "UW4", tramo: [{ lat: -34.5, lon: -58.6 }, { lat: -34.6, lon: -58.62 }] })]);
    expect(p).toHaveLength(4);
    expect(p[1]).toMatchObject({ codigo: "", nombre: "" });
  });
  it("sin coordenadas en la salida no inventa una", () => {
    expect(puntosParaCompartir({ salida: { codigo: "LAD2013", nombre: "X" }, destino: sadm }, [])).toHaveLength(1);
    expect(puntosParaCompartir({ salida: null, destino: null }, [])).toEqual([]);
  });
  it("redondea a ~1 m", () => {
    expect(puntosParaCompartir({ salida: { ...sadf, lat: -34.4532199 }, destino: null }, [])[0].lat).toBe(-34.45322);
  });
  it(`no pasa de ${TOPE_PUNTOS} y conserva la salida y el destino`, () => {
    const muchos = Array.from({ length: 200 }, (_, i) => nodo({ texto: `P${i}`, lat: -34 - i * 0.01, lon: -58 }));
    const p = puntosParaCompartir({ salida: sadf, destino: sadm }, muchos);
    expect(p).toHaveLength(TOPE_PUNTOS);
    expect(p[0].codigo).toBe("SADF");
    expect(p[p.length - 1].codigo).toBe("SADM");
  });
  it("la ruta escrita no pasa de 600", () => {
    expect(rutaParaCompartir({ salida: sadf, destino: sadm }, [nodo({ texto: "A".repeat(700) })])).toHaveLength(600);
  });
});

describe("la salida del plan", () => {
  it("es la EOBT en UTC", () => {
    expect(salidaIso({ dofUtc: "2026-11-11", eobtUtc: "1530" }, [])).toBe("2026-11-11T15:30:00.000Z");
  });
  it("la última demora manda", () => {
    expect(salidaIso({ dofUtc: "2026-11-11", eobtUtc: "1530" }, [{ dof: "2026-11-11", eobt: "1700" }])).toBe("2026-11-11T17:00:00.000Z");
  });
  it("sin fecha, con hora imposible o con fecha que no existe: null", () => {
    expect(salidaIso({ dofUtc: "", eobtUtc: "1530" }, [])).toBeNull();
    expect(salidaIso({ dofUtc: "2026-11-11", eobtUtc: "2560" }, [])).toBeNull();
    expect(salidaIso({ dofUtc: "2026-02-30", eobtUtc: "1000" }, [])).toBeNull();
  });
});

describe("cuándo todavía no se puede compartir", () => {
  const ahora = "2026-11-11T12:00:00.000Z";
  const plan = { matricula: "LV-ABC", dofUtc: "2026-11-11", eobtUtc: "1530" };
  it("con matrícula y salida cercana, se puede", () => {
    expect(motivoParaNoCompartir(plan, [], ahora, false)).toBeNull();
  });
  it("sin matrícula", () => {
    expect(motivoParaNoCompartir({ ...plan, matricula: "" }, [], ahora, false)).toMatch(/matrícula/);
    expect(motivoParaNoCompartir({ ...plan, matricula: "-" }, [], ahora, false)).toMatch(/matrícula/);
  });
  it("sin salida", () => {
    expect(motivoParaNoCompartir({ ...plan, eobtUtc: "" }, [], ahora, false)).toMatch(/salida/);
  });
  it("cancelado", () => {
    expect(motivoParaNoCompartir(plan, [], ahora, true)).toMatch(/cancelado/);
  });
  it("más de 24 horas antes o 12 horas después", () => {
    expect(motivoParaNoCompartir({ ...plan, dofUtc: "2026-11-13" }, [], ahora, false)).toMatch(/24 horas/);
    expect(motivoParaNoCompartir({ ...plan, dofUtc: "2026-11-10" }, [], ahora, false)).toMatch(/12 horas/);
  });
});
