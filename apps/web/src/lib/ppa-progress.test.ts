import { describe, expect, it } from "vitest";
import type { Aircraft, Flight } from "@/types";
import { cumpleTravesiaLarga, horasQueFaltanPPA, requisitosPPA } from "./ppa-progress";

let n = 0;
const vuelo = (p: Partial<Flight>): Flight =>
  ({ id: `f${++n}`, date: "2026-09-01", duration: 1, landings: 1, purpose: "INST", aircraft_id: "c152", ...p }) as Flight;
const aviones = [{ id: "c152", is_simulator: false }, { id: "sim", is_simulator: true }] as Aircraft[];
const req = (vuelos: Flight[], travesiaLarga?: (f: Flight) => boolean) =>
  Object.fromEntries(requisitosPPA(vuelos, { aircraft: aviones, travesiaLarga }).map((r) => [r.clave, r]));

describe("requisitosPPA (RAAC 61.520(a))", () => {
  it("los objetivos son los de la norma para avión", () => {
    const r = req([]);
    expect(r.total.objetivo).toBe(40);
    expect(r.dobleMando.objetivo).toBe(20);
    expect(r.soloDiurno.objetivo).toBe(10);
    expect(r.soloTravesia.objetivo).toBe(5);
    expect(r.travesiaLarga.objetivo).toBe(1);
    expect(r.nocturnoInstruccion.objetivo).toBe(3);
    expect(r.aterrizajesNocturnos.objetivo).toBe(10);
  });

  it("doble mando es INST; vuelo solo, cualquier otra finalidad", () => {
    const r = req([
      vuelo({ duration: 1.2, pic_day_loc: 1.2 }),
      vuelo({ duration: 0.8, purpose: "VP", pic_day_loc: 0.3, pic_day_tra: 0.5 }),
    ]);
    expect(r.dobleMando.actual).toBe(1.2);
    expect(r.soloDiurno.actual).toBe(0.8);
    expect(r.soloTravesia.actual).toBe(0.5);
    expect(r.total.actual).toBe(2);
  });

  it("el simulador suma al total con tope de 5 h, y no es doble mando ni vuelo solo", () => {
    const sims = Array.from({ length: 4 }, () => vuelo({ aircraft_id: "sim", duration: 2 }));
    const r = req([...sims, vuelo({ duration: 1, pic_day_loc: 1 })]);
    expect(r.total.actual).toBe(6);
    expect(r.dobleMando.actual).toBe(1);
  });

  it("la instrucción nocturna y sus aterrizajes salen de los vuelos INST de noche", () => {
    const r = req([
      vuelo({ duration: 1.5, pic_night_loc: 1.5, landings: 6 }),
      vuelo({ duration: 1, purpose: "VP", pic_night_loc: 1, landings: 3 }),
    ]);
    expect(r.nocturnoInstruccion.actual).toBe(1.5);
    expect(r.aterrizajesNocturnos.actual).toBe(6);
  });

  it("la travesía larga la decide quien mide las rutas", () => {
    const largo = vuelo({ route: "SADF SAAR SADF" });
    expect(req([largo], (f) => f === largo).travesiaLarga.actual).toBe(1);
    expect(req([largo]).travesiaLarga.actual).toBe(0);
  });

  it("lo que falta del total", () => {
    expect(horasQueFaltanPPA(requisitosPPA([vuelo({ duration: 12.5 })], { aircraft: aviones }))).toBe(27.5);
  });
});

describe("cumpleTravesiaLarga", () => {
  it("150 NM, dos aterrizajes, dos aeródromos distintos", () => {
    expect(cumpleTravesiaLarga(["SADF", "SAAR", "SADF"], [144, 144], 2)).toBe(true);
  });
  it("no alcanza la distancia, o un solo aeródromo de destino", () => {
    expect(cumpleTravesiaLarga(["SADF", "SAAK", "SADF"], [40, 40], 2)).toBe(false);
    expect(cumpleTravesiaLarga(["SADF", "SAAR"], [160], 1)).toBe(false);
  });
  it("un tramo que no se pudo medir no afirma nada", () => {
    expect(cumpleTravesiaLarga(["SADF", "XXXX", "SADF"], [null, 200], 2)).toBe(false);
  });
});
