import { describe, expect, it } from "vitest";
import { activosDeRespuesta, candidatoParaAdoptar, rotuloDeSalida, trayectoDeActivo } from "./seguimientos-activos";

const AHORA = "2026-11-15T15:00:00.000Z";
const T = (min: number) => new Date(Date.parse(AHORA) + min * 60_000).toISOString();

const fila = (extra: Record<string, unknown> = {}) => ({
  id: "i1",
  token: "t".repeat(32),
  ruta: "SADM SAZS",
  puntos: [
    [-34.67, -58.64, "SADM", "Morón"],
    [-36.9, -60.3, "SAZS", "Tandil"],
  ],
  salida_prevista: T(30),
  duracion_prevista_min: 90,
  vence_at: T(300),
  plan_id: null,
  ruta_orientativa: true,
  mostrar_matricula: false,
  avion_tipo: "Tecnam",
  mirando_ahora: 2,
  vistos_total: 5,
  ...extra,
});

describe("activosDeRespuesta", () => {
  it("distingue de dónde viene cada link", () => {
    const l = activosDeRespuesta([fila(), fila({ id: "i2", plan_id: "p1", ruta_orientativa: false }), fila({ id: "i3", ruta_orientativa: false, salida_prevista: null })]);
    expect(l.map((x) => x.origen)).toEqual(["sin-plan", "plan", "mapa"]);
  });
  it("descarta lo que no tiene la forma y no se rompe con basura", () => {
    expect(activosDeRespuesta(null)).toEqual([]);
    expect(activosDeRespuesta([{ id: 1 }, null, fila()])).toHaveLength(1);
  });
  it("lee los puntos y quién mira", () => {
    const [a] = activosDeRespuesta([fila()]);
    expect(a.puntos[1]).toEqual({ lat: -36.9, lon: -60.3, codigo: "SAZS", nombre: "Tandil" });
    expect([a.mirandoAhora, a.vistosTotal]).toEqual([2, 5]);
  });
});

describe("trayectoDeActivo", () => {
  it("usa los extremos de la ruta", () => {
    expect(trayectoDeActivo(activosDeRespuesta([fila()])[0])).toBe("SADM → SAZS");
  });
  it("sin puntos, cae en el texto de la ruta", () => {
    expect(trayectoDeActivo({ puntos: [], ruta: "SADF SADM SAZS" })).toBe("SADF → SAZS");
    expect(trayectoDeActivo({ puntos: [], ruta: "" })).toBe("Vuelo");
  });
});

describe("rotuloDeSalida", () => {
  it("escribe la hora argentina con la hora del servidor", () => {
    expect(rotuloDeSalida({ salidaPrevista: T(30) }, AHORA)).toBe("Sale a las 12:30 (15:30Z)");
    expect(rotuloDeSalida({ salidaPrevista: null }, AHORA)).toBeNull();
  });
});

describe("candidatoParaAdoptar", () => {
  const ahoraMs = Date.parse(AHORA);
  const lista = (...mins: number[]) => activosDeRespuesta(mins.map((m, i) => fila({ id: `i${i}`, salida_prevista: T(m) })));
  it("ofrece el que sale dentro de la ventana", () => {
    expect(candidatoParaAdoptar(lista(30), ahoraMs)?.id).toBe("i0");
    expect(candidatoParaAdoptar(lista(-59), ahoraMs)?.id).toBe("i0");
    expect(candidatoParaAdoptar(lista(179), ahoraMs)?.id).toBe("i0");
  });
  it("no ofrece uno de otra salida", () => {
    expect(candidatoParaAdoptar(lista(-61), ahoraMs)).toBeNull();
    expect(candidatoParaAdoptar(lista(181), ahoraMs)).toBeNull();
    expect(candidatoParaAdoptar([], ahoraMs)).toBeNull();
  });
  it("con varios, el de salida más cercana", () => {
    expect(candidatoParaAdoptar(lista(150, 20, -40), ahoraMs)?.id).toBe("i1");
  });
  it("no ofrece los de un plan ni los del Mapa", () => {
    const l = activosDeRespuesta([fila({ plan_id: "p1", ruta_orientativa: false }), fila({ id: "i9", ruta_orientativa: false })]);
    expect(candidatoParaAdoptar(l, ahoraMs)).toBeNull();
  });
});
