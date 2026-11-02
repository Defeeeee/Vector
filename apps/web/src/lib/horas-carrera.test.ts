import { describe, expect, it } from "vitest";
import type { Flight, Logbook } from "@/types";
import { cifrasDeCarrera } from "./horas-carrera";
import { headlineStats, openingTotals } from "./summary";

const vuelo = (date: string, duration: number, extra: Partial<Flight> = {}) =>
  ({ id: date + duration, user_id: "u", date, route: "SADF SADF", landings: 2, duration, takeoff: "", landing: "", purpose: "VP", pic_day_loc: duration, ...extra }) as Flight;

const vuelos = [
  vuelo("2026-06-01", 1.5),
  vuelo("2026-09-20", 1.2, { pic_day_loc: 0, pic_night_loc: 1.2, imc_pil: 0.3 }),
  vuelo("2026-10-05", 2.0),
];
const libro = { id: "l", user_id: "u", name: "Papel", is_default: true, created_at: "", opening_pic_day_loc: 100, opening_landings: 150, opening_pic_night_loc: 5 } as unknown as Logbook;

describe("las cifras de la carrera del inicio", () => {
  it("suman la apertura, igual que el Resumen en 'todo'", () => {
    const c = cifrasDeCarrera(vuelos, [libro], "2026-10-10");
    const base = headlineStats(vuelos);
    const ap = openingTotals([libro]);
    expect(c.total).toBeCloseTo(base.totalHours + ap.totalHours);
    expect(c.total).toBeCloseTo(4.7 + 105);
    expect(c.aterrizajes).toBe(6 + 150);
    expect(c.noche).toBeCloseTo(1.2 + 5);
    expect(c.pic).toBeCloseTo(base.pic + ap.pic);
    expect(c.imc).toBeCloseTo(0.3);
  });

  it("los últimos 30 días cuentan sólo vuelos con fecha, sin la apertura", () => {
    expect(cifrasDeCarrera(vuelos, [libro], "2026-10-10").ultimos30).toBeCloseTo(1.2 + 2.0);
  });

  it("los vuelos son los cargados, no las horas de apertura", () => {
    expect(cifrasDeCarrera(vuelos, [libro], "2026-10-10").vuelos).toBe(3);
  });

  it("sin nada, todo en cero", () => {
    expect(cifrasDeCarrera([], [], "2026-10-10")).toEqual({ total: 0, ultimos30: 0, pic: 0, noche: 0, imc: 0, aterrizajes: 0, vuelos: 0 });
  });
});
