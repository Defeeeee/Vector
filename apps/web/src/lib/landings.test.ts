import { describe, expect, it } from "vitest";
import { Flight } from "@/types";
import { nightLandingsOf, totalNightLandings } from "./landings";

/**
 * Este conteo alimenta una barra de progreso hacia una licencia. Un número
 * inflado manda a un piloto a un examen creyendo que ya cumple, así que los
 * tests fijan sobre todo que no se infle.
 */
const vuelo = (over: Partial<Flight>): Flight =>
  ({ id: "f", user_id: "u", date: "2026-08-01", route: "SADF SADF", landings: 1, duration: 1, takeoff: "", landing: "", purpose: "VP", ...over }) as Flight;

describe("nightLandingsOf", () => {
  it("no cuenta nada en un vuelo sin horas nocturnas", () => {
    expect(nightLandingsOf(vuelo({ pic_day_loc: 1.5, landings: 6 }))).toBe(0);
  });

  it("cuenta todos los aterrizajes de un vuelo enteramente nocturno", () => {
    expect(nightLandingsOf(vuelo({ pic_night_loc: 1.2, landings: 6 }))).toBe(6);
  });

  /**
   * El caso que motivó el arreglo: una sesión de circuitos que cruza el ocaso.
   * Seis aterrizajes, uno solo después de la puesta — antes sumaba seis.
   */
  it("cuenta uno solo en un vuelo mixto", () => {
    expect(nightLandingsOf(vuelo({ pic_day_loc: 0.8, pic_night_loc: 0.4, landings: 6 }))).toBe(1);
  });

  it("no inventa un aterrizaje donde no lo hubo", () => {
    expect(nightLandingsOf(vuelo({ pic_day_loc: 0.8, pic_night_loc: 0.4, landings: 0 }))).toBe(0);
  });

  it("mira también la travesía nocturna, no sólo el local", () => {
    expect(nightLandingsOf(vuelo({ pic_night_tra: 1.0, landings: 2 }))).toBe(2);
    expect(nightLandingsOf(vuelo({ pic_day_tra: 1.0, pic_night_tra: 0.5, landings: 4 }))).toBe(1);
  });
});

describe("totalNightLandings", () => {
  it("suma vuelo por vuelo con la misma regla", () => {
    const total = totalNightLandings([
      vuelo({ pic_night_loc: 1.0, landings: 3 }),                    // 3
      vuelo({ pic_day_loc: 1.0, pic_night_loc: 0.3, landings: 6 }),  // 1
      vuelo({ pic_day_loc: 1.0, landings: 5 }),                      // 0
    ]);
    expect(total).toBe(4);
  });

  it("devuelve cero sin vuelos", () => {
    expect(totalNightLandings([])).toBe(0);
  });
});
