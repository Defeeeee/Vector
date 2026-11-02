import { describe, expect, it } from "vitest";
import type { Aircraft, Flight, Logbook } from "@/types";
import { nombreDelPeriodo, resumenDeHoras } from "./resumen-horas";

const avion = { id: "a1", registration: "LV-ABC", icao: "C152", type: "Cessna 152", is_simulator: false } as Aircraft;
const otro = { id: "a2", registration: "LV-XYZ", icao: "PA11", type: "Piper", is_simulator: false } as Aircraft;
const sim = { id: "s1", registration: "SIM", icao: "SIM", type: "Simulador", is_simulator: true } as Aircraft;
const aviones = [avion, otro, sim];

let k = 0;
const vuelo = (date: string, extra: Partial<Flight>): Flight =>
  ({ id: `f${++k}`, user_id: "u", aircraft_id: "a1", date, route: "SADF SADF", landings: 1, duration: 0, takeoff: `${date}T12:00:00Z`, landing: `${date}T13:00:00Z`, purpose: "VP", ...extra }) as Flight;

const vuelos = [
  vuelo("2026-09-03", { duration: 1.2, pic_day_loc: 1.2, landings: 3, capota: 0.5 }),
  vuelo("2026-09-10", { duration: 2.0, pic_day_tra: 1.4, pic_night_tra: 0.6, landings: 2, purpose: "INST", aircraft_id: "a2" }),
  vuelo("2026-08-20", { duration: 1.0, sic_night_loc: 1.0, landings: 4, imc_cop: 0.3 }),
  vuelo("2026-09-12", { duration: 0, aircraft_id: "s1", sim_pil_en_inst: 1.5, landings: 0 }),
];
const libros = [{ id: "l1", opening_pic_day_loc: 40, opening_sic_day_loc: 2 } as Logbook];

describe("el resumen de horas", () => {
  it("un mes: sin simuladores en las horas, y sin apertura", () => {
    const r = resumenDeHoras(vuelos, aviones, libros, { desde: "2026-09-01", hasta: "2026-09-30" });
    expect(r.vuelos).toBe(2);
    expect(r.horas).toBe(3.2);
    expect(r.aterrizajes).toBe(5);
    expect(r.piloto).toEqual({ aerodromoDia: 1.2, aerodromoNoche: 0, travesiaDia: 1.4, travesiaNoche: 0.6 });
    expect(r.capota).toBe(0.5);
    expect(r.simulador).toEqual({ sesiones: 1, horas: 1.5 });
    expect(r.apertura).toBeNull();
    expect(r.porAvion.map((a) => a.matricula)).toEqual(["LV-XYZ", "LV-ABC"]);
    expect(r.porFinalidad).toEqual([
      { finalidad: "INST", vuelos: 1, horas: 2 },
      { finalidad: "VP", vuelos: 1, horas: 1.2 },
    ]);
  });

  it("toda la bitácora: con la apertura aparte", () => {
    const r = resumenDeHoras(vuelos, aviones, libros);
    expect(r.vuelos).toBe(3);
    expect(r.horas).toBe(4.2);
    expect(r.copiloto.aerodromoNoche).toBe(1);
    expect(r.instrumentos).toBe(0.3);
    // Como en el resto de Vector (`nightLandingsOf`): al mando, y un vuelo mixto cuenta uno.
    expect(r.aterrizajesNoche).toBe(1);
    expect(r.apertura).toBe(42);
  });

  it("nombra el período", () => {
    expect(nombreDelPeriodo(null, null)).toBe("Toda la bitácora");
    expect(nombreDelPeriodo("2026-01-01", "2026-10-21")).toBe("Del 01/01/2026 al 21/10/2026");
    expect(nombreDelPeriodo("2026-01-01", null)).toBe("Desde el 01/01/2026");
  });
});
