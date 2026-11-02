import { describe, expect, it } from "vitest";
import type { Aircraft, Flight } from "@/types";
import { filtrarVuelos, hayFiltros } from "./busqueda-vuelos";

const av = (id: string, registration: string, type = "Cessna 172"): Aircraft =>
  ({ id, user_id: "u", registration, icao: "C172", type }) as Aircraft;

const vuelo = (over: Partial<Flight>): Flight =>
  ({ id: String(Math.random()), user_id: "u", date: "2026-08-01", route: "SADM SAEZ",
     landings: 1, duration: 1, takeoff: "", landing: "", purpose: "VP", ...over }) as Flight;

const flota = [av("a1", "LV-S024"), av("a2", "LV-HQO", "Piper PA-28")];
const vuelos = [
  vuelo({ id: "v1", date: "2026-04-09", route: "SADM SAAJ", aircraft_id: "a1", purpose: "INST" }),
  vuelo({ id: "v2", date: "2026-08-01", route: "SADM SAEZ", aircraft_id: "a2", purpose: "VP",
          remarks: "primer solo" }),
  vuelo({ id: "v3", date: "2026-08-20", route: "SAEZ SADM", aircraft_id: "a1", purpose: "VP" }),
];
const ids = (fs: Flight[]) => fs.map((f) => f.id);

describe("filtrarVuelos", () => {
  it("sin filtros devuelve todo", () => {
    expect(filtrarVuelos(vuelos, flota, {})).toHaveLength(3);
  });

  it("filtra por ruta", () => {
    expect(ids(filtrarVuelos(vuelos, flota, { texto: "saaj" }))).toEqual(["v1"]);
  });

  it("filtra por matrícula y por modelo", () => {
    expect(ids(filtrarVuelos(vuelos, flota, { texto: "hqo" }))).toEqual(["v2"]);
    expect(ids(filtrarVuelos(vuelos, flota, { texto: "piper" }))).toEqual(["v2"]);
  });

  /**
   * Las observaciones son donde el piloto escribe "con Martín" o "primer solo", o
   * sea exactamente lo que después busca. La búsqueda vieja no las miraba.
   */
  it("busca en las observaciones", () => {
    expect(ids(filtrarVuelos(vuelos, flota, { texto: "primer solo" }))).toEqual(["v2"]);
  });

  it("el rango de fechas es inclusivo en los dos extremos", () => {
    expect(ids(filtrarVuelos(vuelos, flota, { desde: "2026-08-01", hasta: "2026-08-20" })))
      .toEqual(["v2", "v3"]);
    expect(ids(filtrarVuelos(vuelos, flota, { desde: "2026-08-02" }))).toEqual(["v3"]);
    expect(ids(filtrarVuelos(vuelos, flota, { hasta: "2026-04-09" }))).toEqual(["v1"]);
  });

  it("filtra por aeronave", () => {
    expect(ids(filtrarVuelos(vuelos, flota, { aeronaveId: "a1" }))).toEqual(["v1", "v3"]);
  });

  it("filtra por propósito", () => {
    expect(ids(filtrarVuelos(vuelos, flota, { proposito: "INST" }))).toEqual(["v1"]);
  });

  it("los filtros se combinan con Y, no con O", () => {
    expect(ids(filtrarVuelos(vuelos, flota, { aeronaveId: "a1", proposito: "VP" }))).toEqual(["v3"]);
    expect(filtrarVuelos(vuelos, flota, { aeronaveId: "a1", texto: "hqo" })).toEqual([]);
  });

  /** Espacios de más no deberían vaciar la lista. */
  it("ignora el texto en blanco", () => {
    expect(filtrarVuelos(vuelos, flota, { texto: "   " })).toHaveLength(3);
  });

  it("un vuelo sin aeronave no rompe la búsqueda por texto", () => {
    const suelto = [vuelo({ id: "x", route: "SADM SADM", aircraft_id: undefined })];
    expect(ids(filtrarVuelos(suelto, flota, { texto: "sadm" }))).toEqual(["x"]);
  });
});

describe("hayFiltros", () => {
  it("reconoce cada filtro por separado", () => {
    expect(hayFiltros({})).toBe(false);
    expect(hayFiltros({ texto: "  " })).toBe(false);
    expect(hayFiltros({ texto: "a" })).toBe(true);
    expect(hayFiltros({ desde: "2026-01-01" })).toBe(true);
    expect(hayFiltros({ aeronaveId: "a1" })).toBe(true);
    expect(hayFiltros({ proposito: "VP" })).toBe(true);
  });
});
