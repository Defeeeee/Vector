import { describe, expect, it } from "vitest";
import type { Aircraft, Flight } from "@/types";
import {
  aniosConVuelos,
  anioActualArgentina,
  calcularTuAno,
  fechaCorta,
  formatearNumero,
  proyectarPuntos,
  type UbicarAerodromo,
} from "./tu-ano";

const C172 = { id: "a1", registration: "LV-ABC", icao: "C172", type: "Cessna 172" } as Aircraft;
const SIM = { id: "s1", registration: "SIM-1", icao: "C172", type: "Simulador C172", is_simulator: true } as Aircraft;
const PA28 = { id: "a2", registration: "LV-XYZ", icao: "PA28", type: "Piper Cherokee" } as Aircraft;

const lugares: Record<string, { lat: number; lon: number; nombre: string }> = {
  SADF: { lat: -34.45, lon: -58.59, nombre: "San Fernando" },
  SADM: { lat: -34.68, lon: -58.64, nombre: "Morón" },
  SAZS: { lat: -41.15, lon: -71.16, nombre: "Bariloche" },
};
const ubicar: UbicarAerodromo = (c) => lugares[c] ?? null;

let seq = 0;
function vuelo(parcial: Partial<Flight>): Flight {
  seq += 1;
  return {
    id: `f${seq}`, user_id: "u", date: "2026-03-12", route: "SADF", landings: 1, duration: 1,
    takeoff: "2026-03-12T15:00:00Z", landing: "2026-03-12T16:00:00Z", purpose: "", aircraft_id: "a1",
    ...parcial,
  } as Flight;
}

describe("calcularTuAno", () => {
  it("cuenta sólo vuelos del año y deja los simuladores aparte", () => {
    const flights = [
      vuelo({ duration: 1.5, landings: 3 }),
      vuelo({ duration: 2, date: "2026-03-12", landings: 1 }),
      vuelo({ duration: 0, aircraft_id: "s1", sim_pil_en_inst: 1.2, route: "LOCAL" }),
      vuelo({ duration: 9, date: "2025-06-01" }),
    ];
    const t = calcularTuAno({ flights, aircraft: [C172, SIM], anio: 2026, ubicar });
    expect(t.horas).toBe(3.5);
    expect(t.vuelos).toBe(2);
    expect(t.aterrizajes).toBe(4);
    expect(t.dias).toBe(1);
    expect(t.simulador).toEqual({ sesiones: 1, horas: 1.2 });
    expect(t.aerodromos).toBe(1);
  });

  it("los aviones más volados van por matrícula, de más horas a menos, sin simuladores ni otros años", () => {
    const LV3 = { id: "a3", registration: "lv-s048", icao: "P92", type: "Tecnam Astore" } as Aircraft;
    const flights = [
      vuelo({ duration: 1, aircraft_id: "a1" }),
      vuelo({ duration: 2.5, aircraft_id: "a3" }),
      vuelo({ duration: 1.2, aircraft_id: "a2" }),
      vuelo({ duration: 0.6, aircraft_id: "a2" }),
      vuelo({ duration: 5, aircraft_id: "s1" }),
      vuelo({ duration: 9, aircraft_id: "a1", date: "2025-06-01" }),
    ];
    const t = calcularTuAno({ flights, aircraft: [C172, SIM, PA28, LV3], anio: 2026, ubicar });
    expect(t.aviones).toEqual([
      { matricula: "LV-S048", tipo: "Tecnam Astore", horas: 2.5, vuelos: 1 },
      { matricula: "LV-XYZ", tipo: "Piper Cherokee", horas: 1.8, vuelos: 2 },
      { matricula: "LV-ABC", tipo: "Cessna 172", horas: 1, vuelos: 1 },
    ]);
  });

  it("la apertura no es del año: sólo mueve los hitos", () => {
    const flights = [vuelo({ duration: 2 })];
    const t = calcularTuAno({ flights, aircraft: [C172], anio: 2026, ubicar, aperturaHoras: 49 });
    expect(t.horas).toBe(2);
    expect(t.hitos.horas).toBe(50);
    const sin = calcularTuAno({ flights, aircraft: [C172], anio: 2026, ubicar, aperturaHoras: 0 });
    expect(sin.hitos.horas).toBeNull();
  });

  it("no cuenta como cruzado un hito que ya estaba antes del año", () => {
    const flights = [vuelo({ duration: 2 }), vuelo({ duration: 60, date: "2025-05-05" })];
    const t = calcularTuAno({ flights, aircraft: [C172], anio: 2026, ubicar, aperturaHoras: 0 });
    expect(t.hitos.horas).toBeNull();
  });

  it("la distancia suma los tramos entre puntos conocidos y salta el desconocido", () => {
    const flights = [vuelo({ route: "SADF SADM SAZS" }), vuelo({ route: "SADF ZZZZ SADM", date: "2026-04-01" })];
    const t = calcularTuAno({ flights, aircraft: [C172], anio: 2026, ubicar });
    // SADF-SADM ≈ 14 NM, SADM-SAZS ≈ 708 NM; los tramos del segundo vuelo tocan ZZZZ y no suman.
    expect(t.distanciaNm).toBeGreaterThan(700);
    expect(t.distanciaNm).toBeLessThan(750);
    const sinDesconocido = calcularTuAno({ flights: [flights[0]], aircraft: [C172], anio: 2026, ubicar });
    expect(sinDesconocido.distanciaNm).toBe(t.distanciaNm);
    expect(t.mapa.tramos).toHaveLength(2);
  });

  it("un vuelo local no suma distancia y sale como local", () => {
    const t = calcularTuAno({ flights: [vuelo({ route: "SADF", duration: 1.1 })], aircraft: [C172], anio: 2026, ubicar });
    expect(t.distanciaNm).toBe(0);
    expect(t.masLargo?.local).toBe(true);
  });

  it("el vuelo más largo trae la fecha ya escrita", () => {
    const flights = [vuelo({ duration: 1 }), vuelo({ duration: 2.3, route: "SADF SAZS", date: "2026-07-04" })];
    const t = calcularTuAno({ flights, aircraft: [C172], anio: 2026, ubicar });
    expect(t.masLargo).toEqual({ fecha: "4 de julio", ruta: "SADF → SAZS", local: false, horas: 2.3 });
  });

  it("el mes con más horas y las horas por mes", () => {
    const flights = [
      vuelo({ date: "2026-01-10", duration: 1 }),
      vuelo({ date: "2026-05-02", duration: 2 }),
      vuelo({ date: "2026-05-20", duration: 1.5 }),
    ];
    const t = calcularTuAno({ flights, aircraft: [C172], anio: 2026, ubicar });
    expect(t.mesTop).toEqual({ nombre: "mayo", horas: 3.5 });
    expect(t.horasPorMes[0]).toBe(1);
    expect(t.horasPorMes).toHaveLength(12);
  });

  it("el momento del día se lee en hora argentina", () => {
    // 15:00 UTC = 12:00 en Argentina: la franja es la de la tarde.
    const t = calcularTuAno({ flights: [vuelo({ takeoff: "2026-03-12T15:00:00Z", duration: 2 })], aircraft: [C172], anio: 2026, ubicar });
    expect(t.momento?.nombre).toBe("de tarde");
  });

  it("el tipo de avión más volado, con su matrícula sólo en un campo aparte", () => {
    const flights = [vuelo({ duration: 1 }), vuelo({ duration: 3, aircraft_id: "a2" })];
    const t = calcularTuAno({ flights, aircraft: [C172, PA28], anio: 2026, ubicar });
    expect(t.avion?.tipo).toBe("Piper Cherokee");
    expect(t.avion?.vuelos).toBe(1);
    expect(t.avion?.matricula).toBe("LV-XYZ");
  });

  it("compara con el año anterior sólo si tuvo vuelos", () => {
    const flights = [vuelo({ duration: 6 }), vuelo({ duration: 4, date: "2025-02-02" })];
    const t = calcularTuAno({ flights, aircraft: [C172], anio: 2026, ubicar });
    expect(t.comparacion).toEqual({ anioAnterior: 2025, horasAnterior: 4, porcentaje: 50 });
    const vacio = calcularTuAno({ flights: [vuelo({ duration: 6 })], aircraft: [C172], anio: 2026, ubicar });
    expect(vacio.comparacion).toBeNull();
  });

  it("la PPA rendida en el año", () => {
    const t = calcularTuAno({ flights: [vuelo({})], aircraft: [C172], anio: 2026, ubicar, fechaPpa: "2026-08-09" });
    expect(t.hitos.ppa).toEqual({ fecha: "9 de agosto" });
    const otra = calcularTuAno({ flights: [vuelo({})], aircraft: [C172], anio: 2026, ubicar, fechaPpa: "2025-08-09" });
    expect(otra.hitos.ppa).toBeNull();
  });

  it("noche e instrumentos del año", () => {
    const t = calcularTuAno({ flights: [vuelo({ pic_night_loc: 0.8, imc_pil: 0.5 })], aircraft: [C172], anio: 2026, ubicar });
    expect(t.nocheHoras).toBe(0.8);
    expect(t.ifrHoras).toBe(0.5);
  });

  it("un año sin vuelos queda en cero y sin nada inventado", () => {
    const t = calcularTuAno({ flights: [vuelo({ date: "2025-01-01" })], aircraft: [C172], anio: 2026, ubicar });
    expect(t.vuelos).toBe(0);
    expect(t.horas).toBe(0);
    expect(t.base).toBeNull();
    expect(t.masLargo).toBeNull();
    expect(t.mesTop).toBeNull();
    expect(t.momento).toBeNull();
    expect(t.avion).toBeNull();
    expect(t.comparacion).toBeNull();
  });
});

describe("ayudas", () => {
  it("los años con vuelos reales, del más nuevo al más viejo", () => {
    const flights = [vuelo({ date: "2024-01-01" }), vuelo({ date: "2026-01-01" }), vuelo({ date: "2027-01-01", aircraft_id: "s1" })];
    expect(aniosConVuelos(flights, [C172, SIM])).toEqual([2026, 2024]);
  });
  it("fechaCorta y el año argentino", () => {
    expect(fechaCorta("2026-03-12")).toBe("12 de marzo");
    expect(fechaCorta("basura")).toBe("");
    // 1 de enero 01:00 UTC todavía es 31 de diciembre en Argentina.
    expect(anioActualArgentina(new Date("2027-01-01T01:00:00Z"))).toBe(2026);
    expect(anioActualArgentina(new Date("2027-01-01T04:00:00Z"))).toBe(2027);
  });
  it("formatearNumero", () => {
    expect(formatearNumero(87.4, 1)).toBe("87,4");
    expect(formatearNumero(1234.5, 1)).toBe("1.234,5");
    expect(formatearNumero(1234567)).toBe("1.234.567");
    expect(formatearNumero(0, 1)).toBe("0,0");
  });
  it("proyectarPuntos deja todo adentro del rectángulo", () => {
    const ps = proyectarPuntos(Object.values(lugares), 400, 300, 20);
    for (const p of ps) {
      expect(p.x).toBeGreaterThanOrEqual(20 - 1e-6);
      expect(p.x).toBeLessThanOrEqual(380 + 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(20 - 1e-6);
      expect(p.y).toBeLessThanOrEqual(280 + 1e-6);
    }
    // El más al sur (Bariloche) queda más abajo que San Fernando.
    expect(ps[2].y).toBeGreaterThan(ps[0].y);
    expect(proyectarPuntos([{ lat: -34, lon: -58 }], 400, 300, 20)).toEqual([{ x: 200, y: 150 }]);
    expect(proyectarPuntos([], 400, 300, 20)).toEqual([]);
  });
});
