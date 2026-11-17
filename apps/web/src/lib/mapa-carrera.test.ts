import { describe, expect, it } from "vitest";
import type { Aircraft, Flight } from "@/types";
import {
  aerodromosDeRuta,
  calcularMapaCarrera,
  crearProyeccion,
  fechaLarga,
  filtrosDeLaUrl,
  grosorDePierna,
  opcionesDelMapa,
  provinciaLegible,
  radioDeAerodromo,
  type UbicarParaMapa,
} from "./mapa-carrera";
import { CONTORNO_ARGENTINA } from "./contorno-argentina";
import { distanciaNmPrecisa } from "./distance";

const C172 = { id: "a1", registration: "LV-ABC", icao: "C172", type: "Cessna 172" } as Aircraft;
const PA28 = { id: "a2", registration: "LV-XYZ", icao: "PA28", type: "Piper Cherokee" } as Aircraft;
const SIM = { id: "s1", registration: "SIM-1", icao: "C172", type: "Simulador", is_simulator: true } as Aircraft;
const AVIONES = [C172, PA28, SIM];

const lugares: Record<string, { lat: number; lon: number; nombre: string; provincia?: string }> = {
  SADF: { lat: -34.45, lon: -58.59, nombre: "San Fernando", provincia: "BUENOS AIRES" },
  SADM: { lat: -34.68, lon: -58.64, nombre: "Morón", provincia: "BUENOS AIRES" },
  SAZS: { lat: -41.15, lon: -71.16, nombre: "Bariloche", provincia: "RÍO NEGRO" },
};
const ubicar: UbicarParaMapa = (c) => lugares[c] ?? null;

let seq = 0;
function vuelo(parcial: Partial<Flight>): Flight {
  seq += 1;
  return {
    id: `f${seq}`, user_id: "u", date: "2026-03-12", route: "SADF SADM", landings: 1, duration: 1,
    takeoff: "2026-03-12T15:00:00Z", landing: "2026-03-12T16:00:00Z", purpose: "", aircraft_id: "a1",
    ...parcial,
  } as Flight;
}
const sinFiltros = { anio: null, avionId: null };

describe("aerodromosDeRuta", () => {
  it("un vuelo local es un solo punto", () => {
    expect(aerodromosDeRuta("SADF SADF")).toEqual(["SADF"]);
    expect(aerodromosDeRuta("LOCAL")).toEqual([]);
    expect(aerodromosDeRuta("SADF ??? SADM")).toEqual(["SADF", "SADM"]);
    expect(aerodromosDeRuta("sadf-sadm-sadf")).toEqual(["SADF", "SADM", "SADF"]);
  });
});

describe("calcularMapaCarrera", () => {
  it("agrupa la ida y la vuelta en una sola pierna y cuenta las visitas", () => {
    const flights = [
      vuelo({ route: "SADF SADM" }),
      vuelo({ route: "SADM SADF", date: "2026-04-01" }),
      vuelo({ route: "SADF SAZS", date: "2025-01-10" }),
    ];
    const m = calcularMapaCarrera({ flights, aircraft: AVIONES, ubicar, filtros: sinFiltros });
    expect(m.cifras.vuelos).toBe(3);
    expect(m.aerodromos.map((a) => [a.codigo, a.visitas])).toEqual([["SADF", 3], ["SADM", 2], ["SAZS", 1]]);
    const sadf = m.aerodromos[0];
    expect(sadf.primera).toBe("2025-01-10");
    expect(sadf.ultima).toBe("2026-04-01");
    expect(sadf.primeraTexto).toBe("10 de enero de 2025");
    expect(sadf.provincia).toBe("Buenos Aires");
    const ida = m.piernas.find((p) => m.aerodromos[p.a].codigo === "SADF" && m.aerodromos[p.b].codigo === "SADM");
    expect(ida?.veces).toBe(2);
    expect(m.piernas).toHaveLength(2);
    expect(m.cifras.provincias).toEqual(["Buenos Aires", "Río Negro"]);
  });

  it("un vuelo local es un punto y no una línea", () => {
    const m = calcularMapaCarrera({ flights: [vuelo({ route: "SADF SADF" })], aircraft: AVIONES, ubicar, filtros: sinFiltros });
    expect(m.aerodromos).toHaveLength(1);
    expect(m.aerodromos[0].visitas).toBe(1);
    expect(m.piernas).toEqual([]);
    expect(m.cifras.distanciaNm).toBe(0);
  });

  it("deja los simuladores afuera", () => {
    const flights = [vuelo({ route: "SADF SAZS", aircraft_id: "s1" }), vuelo({ route: "SADF SADM" })];
    const m = calcularMapaCarrera({ flights, aircraft: AVIONES, ubicar, filtros: sinFiltros });
    expect(m.cifras.vuelos).toBe(1);
    expect(m.aerodromos.map((a) => a.codigo).sort()).toEqual(["SADF", "SADM"]);
  });

  it("cuenta lo que no se pudo ubicar en vez de esconderlo", () => {
    const flights = [
      vuelo({ route: "XXXX YYYY" }),
      vuelo({ route: "SADF QQQQ" }),
      vuelo({ route: "LOCAL" }),
      vuelo({ route: "SADF SADM" }),
    ];
    const m = calcularMapaCarrera({ flights, aircraft: AVIONES, ubicar, filtros: sinFiltros });
    expect(m.cifras.vuelos).toBe(4);
    expect(m.sinDibujar.vuelos).toBe(1);
    expect(m.sinDibujar.sinRuta).toBe(1);
    expect(m.sinDibujar.codigos).toEqual(["QQQQ", "XXXX", "YYYY"]);
    // "SADF QQQQ" se dibuja a medias: el punto sí, la pierna no.
    expect(m.aerodromos.find((a) => a.codigo === "SADF")?.visitas).toBe(2);
    expect(m.piernas).toHaveLength(1);
  });

  it("filtra por año y por avión", () => {
    const flights = [
      vuelo({ route: "SADF SADM", date: "2026-03-12", aircraft_id: "a1" }),
      vuelo({ route: "SADF SAZS", date: "2025-03-12", aircraft_id: "a2" }),
      vuelo({ route: "SADF SAZS", date: "2026-05-12", aircraft_id: "a2" }),
    ];
    const por = (anio: number | null, avionId: string | null) => calcularMapaCarrera({ flights, aircraft: AVIONES, ubicar, filtros: { anio, avionId } });
    expect(por(2026, null).cifras.vuelos).toBe(2);
    expect(por(2025, null).aerodromos.map((a) => a.codigo).sort()).toEqual(["SADF", "SAZS"]);
    expect(por(null, "a1").cifras.vuelos).toBe(1);
    expect(por(2026, "a2").cifras.vuelos).toBe(1);
    expect(por(2025, "a1").cifras.vuelos).toBe(0);
    expect(por(2025, "a1").aerodromos).toEqual([]);
  });

  it("suma las millas de las piernas con los dos extremos conocidos", () => {
    const m = calcularMapaCarrera({ flights: [vuelo({ route: "SADF SADM" }), vuelo({ route: "SADM SADF" })], aircraft: AVIONES, ubicar, filtros: sinFiltros });
    const una = distanciaNmPrecisa(-34.45, -58.59, -34.68, -58.64);
    expect(m.cifras.distanciaNm).toBe(Math.round(2 * una));
    expect(m.cifras.distanciaNm).toBeGreaterThan(20);
  });

  it("una ruta de varios tramos suma cada tramo y no puentea uno desconocido", () => {
    const m = calcularMapaCarrera({ flights: [vuelo({ route: "SADF QQQQ SAZS" })], aircraft: AVIONES, ubicar, filtros: sinFiltros });
    expect(m.cifras.distanciaNm).toBe(0);
    expect(m.piernas).toEqual([]);
  });

  it("los aviones más volados salen con su matrícula", () => {
    const flights = [vuelo({ duration: 1, aircraft_id: "a1" }), vuelo({ duration: 3, aircraft_id: "a2" })];
    const m = calcularMapaCarrera({ flights, aircraft: AVIONES, ubicar, filtros: sinFiltros });
    expect(m.aviones.map((a) => a.matricula)).toEqual(["LV-XYZ", "LV-ABC"]);
  });
});

describe("opciones y filtros de la URL", () => {
  const flights = [
    vuelo({ date: "2026-03-12", aircraft_id: "a1" }),
    vuelo({ date: "2025-03-12", aircraft_id: "a1" }),
    vuelo({ date: "2025-04-12", aircraft_id: "a2" }),
    vuelo({ date: "2020-01-01", aircraft_id: "s1" }),
  ];
  const op = opcionesDelMapa(flights, AVIONES);

  it("ofrece sólo años y aviones con vuelos, sin simuladores", () => {
    expect(op.anios).toEqual([2026, 2025]);
    expect(op.aviones.map((a) => [a.id, a.vuelos])).toEqual([["a1", 2], ["a2", 1]]);
  });

  it("acepta lo que el piloto tiene y rechaza el resto", () => {
    expect(filtrosDeLaUrl("2025", "a2", op)).toEqual({ filtros: { anio: 2025, avionId: "a2" }, invalido: false });
    expect(filtrosDeLaUrl(null, null, op).filtros).toEqual({ anio: null, avionId: null });
    expect(filtrosDeLaUrl("2020", null, op).invalido).toBe(true);
    expect(filtrosDeLaUrl("abc", null, op).invalido).toBe(true);
    expect(filtrosDeLaUrl(null, "s1", op).invalido).toBe(true);
    expect(filtrosDeLaUrl(null, "ajeno", op).filtros.avionId).toBeNull();
  });
});

describe("piezas de dibujo", () => {
  it("fechaLarga y provinciaLegible", () => {
    expect(fechaLarga("2026-03-02")).toBe("2 de marzo de 2026");
    expect(fechaLarga("")).toBe("");
    expect(provinciaLegible("TIERRA DEL FUEGO ANTÁRTIDA E ISLAS DEL ATLÁNTICO SUR")).toBe("Tierra del Fuego");
    expect(provinciaLegible("ENTRE RÍOS")).toBe("Entre Ríos");
    expect(provinciaLegible("SANTA FÉ")).toBe("Santa Fé");
  });

  it("las piernas y los aeródromos crecen con las veces, con tope", () => {
    expect(grosorDePierna(1)).toBeLessThan(grosorDePierna(8));
    expect(grosorDePierna(100000)).toBe(6);
    expect(radioDeAerodromo(1, 100)).toBeLessThan(radioDeAerodromo(100, 100));
    expect(radioDeAerodromo(100, 100)).toBe(16);
    expect(radioDeAerodromo(5, 0)).toBe(4);
  });

  it("la proyección deja los puntos adentro y el norte arriba", () => {
    const puntos = [{ lat: -34, lon: -58 }, { lat: -41, lon: -71 }];
    const p = crearProyeccion(puntos, 900, 600, 50);
    const a = p(-34, -58), b = p(-41, -71);
    for (const q of [a, b]) {
      expect(q.x).toBeGreaterThanOrEqual(49);
      expect(q.x).toBeLessThanOrEqual(851);
      expect(q.y).toBeGreaterThanOrEqual(49);
      expect(q.y).toBeLessThanOrEqual(551);
    }
    expect(a.y).toBeLessThan(b.y);
    expect(a.x).toBeGreaterThan(b.x);
    // Un solo punto va al centro.
    const solo = crearProyeccion([{ lat: -34, lon: -58 }], 900, 600, 50)(-34, -58);
    expect(solo).toEqual({ x: 450, y: 300 });
  });

  it("el contorno tiene polígonos cerrados con coordenadas de Argentina", () => {
    expect(CONTORNO_ARGENTINA.length).toBe(2);
    for (const poligono of CONTORNO_ARGENTINA) {
      expect(poligono.length).toBeGreaterThan(5);
      for (const [lat, lon] of poligono) {
        expect(lat).toBeLessThan(-21);
        expect(lat).toBeGreaterThan(-56);
        expect(lon).toBeGreaterThan(-74);
        expect(lon).toBeLessThan(-53);
      }
    }
  });
});
