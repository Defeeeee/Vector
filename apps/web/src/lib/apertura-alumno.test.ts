import { describe, expect, it } from "vitest";
import type { AperturaPPA, Flight, Logbook } from "@/types";
import { aperturaDelAlumno, celdasDeAperturaPPA, horasDeAperturaPPA, revisarAperturaPPA, APERTURA_PPA_VACIA } from "./apertura-alumno";
import { requisitosPPA } from "./ppa-progress";
import { cifrasDeCarrera } from "./horas-carrera";
import { openingTotals } from "./summary";

const antes: AperturaPPA = { doble_mando: 18.5, solo: 4, solo_travesia: 1, instruccion_nocturna: 2, aterrizajes_nocturnos: 6, travesia_larga: false };
const libro = { id: "l", user_id: "u", name: "Mi libro", is_default: true, created_at: "", apertura_ppa: antes } as unknown as Logbook;
const vuelo = { id: "f", date: "2026-10-05", duration: 1.2, landings: 2, purpose: "INST", aircraft_id: "c152", pic_day_loc: 1.2 } as Flight;

describe("las horas de antes del alumno", () => {
  it("el total es doble mando más vuelo solo", () => {
    expect(horasDeAperturaPPA(antes)).toBe(22.5);
  });

  it("van en las columnas de piloto, como sus vuelos; lo que no se sabe, a sobre aeródromo", () => {
    expect(celdasDeAperturaPPA(antes)).toEqual({ pic_day_loc: 19.5, pic_day_tra: 1, pic_night_loc: 2 });
  });

  it("se suman entre libros, y la travesía larga con que esté en uno", () => {
    const otro = { ...libro, apertura_ppa: { ...APERTURA_PPA_VACIA, solo: 1, travesia_larga: true } } as Logbook;
    expect(aperturaDelAlumno([libro, otro])).toMatchObject({ solo: 5, travesia_larga: true, doble_mando: 18.5 });
    expect(aperturaDelAlumno([{ apertura_ppa: null }])).toEqual(APERTURA_PPA_VACIA);
  });

  it("las partes no pueden superar al todo", () => {
    expect(revisarAperturaPPA(antes)).toBeNull();
    expect(revisarAperturaPPA({ ...antes, solo_travesia: 5 })).toMatch(/solo de travesía/);
    expect(revisarAperturaPPA({ ...antes, instruccion_nocturna: 20 })).toMatch(/instrucción nocturna/);
    expect(revisarAperturaPPA({ ...antes, doble_mando: -1 })).toMatch(/positivo/);
  });
});

describe("el tracker de la PPA con las horas de antes", () => {
  const r = Object.fromEntries(requisitosPPA([vuelo], { logbooks: [libro] }).map((x) => [x.clave, x]));

  it("cada parte va a su requisito, sumada a los vuelos", () => {
    expect(r.total.actual).toBe(23.7);
    expect(r.dobleMando.actual).toBe(19.7);
    expect(r.soloDiurno.actual).toBe(4);
    expect(r.soloTravesia.actual).toBe(1);
    expect(r.nocturnoInstruccion.actual).toBe(2);
    expect(r.aterrizajesNocturnos.actual).toBe(6);
    expect(r.travesiaLarga.actual).toBe(0);
  });

  it("la travesía de 150 NM, si dijo que ya la hizo", () => {
    const hecha = { ...libro, apertura_ppa: { ...antes, travesia_larga: true } } as Logbook;
    const t = requisitosPPA([], { logbooks: [hecha] }).find((x) => x.clave === "travesiaLarga")!;
    expect(t.actual).toBe(1);
  });
});

describe("los totales con las horas de antes del alumno", () => {
  it("el alumno las ve en el inicio y en el Resumen", () => {
    expect(cifrasDeCarrera([vuelo], [libro], "2026-10-10", { alumno: true }).total).toBeCloseTo(23.7);
    expect(openingTotals([libro]).totalHours).toBeCloseTo(22.5);
    expect(openingTotals([libro]).night).toBeCloseTo(2);
  });

  it("quien ya rindió la PPA las deja afuera, como sus vuelos de alumno", () => {
    expect(cifrasDeCarrera([vuelo], [libro], "2026-10-10", { alumno: false }).total).toBeCloseTo(1.2);
    expect(openingTotals([libro], { alumno: false }).totalHours).toBe(0);
  });
});
