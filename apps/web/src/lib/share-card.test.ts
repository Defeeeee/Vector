/**
 * El número que sale de acá se comparte por WhatsApp, y es el único número de
 * Vector que el piloto **no puede corregir después de mandarlo**.
 *
 * El error más fácil de cometer, y el que este archivo existe para atrapar, son los
 * saldos de apertura: no tienen fecha, así que una tarjeta que los ignore le dice
 * "1.0 hs" a un piloto que migró quinientas horas de papel, y una que los sume en
 * una ventana temporal inventa vuelos que nunca ocurrieron.
 */

import { describe, expect, it } from "vitest";
import type { Flight, Logbook } from "@/types";
import {
  MAX_TILES,
  TILES_POR_DEFECTO,
  datosTarjeta,
  heroHoras,
  parseTiles,
  serializeTiles,
} from "./share-card";

const vuelo = (over: Partial<Flight>): Flight =>
  ({
    id: "f1",
    user_id: "u",
    date: "2026-08-01",
    route: "SADF SADR",
    landings: 1,
    duration: 1,
    takeoff: "2026-08-01T13:00:00Z",
    landing: "2026-08-01T14:00:00Z",
    purpose: "VP",
    ...over,
  }) as Flight;

/** Un libro con 500 h de apertura, que es el caso que importa. */
const libroConApertura = (over: Partial<Logbook> = {}): Logbook =>
  ({
    id: "l1",
    name: "Papel",
    opening_pic_day_loc: 500,
    opening_landings: 300,
    ...over,
  }) as Logbook;

describe("parseTiles", () => {
  it("sin parámetro cae en la selección por defecto", () => {
    expect(parseTiles(null)).toEqual(TILES_POR_DEFECTO);
    expect(parseTiles(undefined)).toEqual(TILES_POR_DEFECTO);
    expect(parseTiles("")).toEqual(TILES_POR_DEFECTO);
  });

  /**
   * El query string lo puede editar cualquiera desde la barra de direcciones. Un
   * id inventado no puede terminar en una pantalla de error: los números salen de
   * la sesión en el servidor, así que esto es sólo presentación.
   */
  it("descarta ids desconocidos sin romperse", () => {
    expect(parseTiles("pic,no_existe,vuelos")).toEqual(["pic", "vuelos"]);
    expect(parseTiles("basura,masbasura")).toEqual(TILES_POR_DEFECTO);
  });

  it("colapsa duplicados", () => {
    expect(parseTiles("pic,pic,pic")).toEqual(["pic"]);
  });

  it("corta en el máximo que entra en la fila", () => {
    const seis = "pic,vuelos,aterrizajes,aerodromos,noche,imc";
    expect(parseTiles(seis)).toHaveLength(MAX_TILES);
  });

  it("sobrevive la ida y la vuelta", () => {
    const sel = ["vuelos", "pic"] as const;
    expect(parseTiles(serializeTiles([...sel]))).toEqual([...sel]);
  });
});

describe("heroHoras", () => {
  /**
   * La tarjeta es la carrera entera, nunca un período, así que los saldos de
   * apertura van siempre. Este es el test que protege el número grande.
   */
  it("incluye los saldos de apertura", () => {
    expect(heroHoras([vuelo({ duration: 1 })], [libroConApertura()])).toBe(501);
  });

  it("sin libros es sólo lo volado", () => {
    expect(heroHoras([vuelo({ duration: 1.5 })], [])).toBe(1.5);
  });

  /**
   * IMC y capota se **superponen** con el tiempo de vuelo en vez de particionarlo.
   * Sumarlas al total duplicaría horas — es la misma regla que aplica el formulario
   * de carga.
   */
  it("no suma IMC ni capota al total, que se superponen con el tiempo de vuelo", () => {
    const libro = libroConApertura({ opening_imc_pil: 50, opening_capota: 20 } as Partial<Logbook>);
    expect(heroHoras([], [libro])).toBe(500);
  });
});

describe("datosTarjeta", () => {
  it("respeta el orden en que el piloto eligió las fichas", () => {
    const d = datosTarjeta({
      ids: ["vuelos", "pic"],
      flights: [vuelo({})],
      logbooks: [],
      aircraft: [],
    });
    expect(d.tiles.map((t) => t.id)).toEqual(["vuelos", "pic"]);
  });

  it("las fichas de horas también suman la apertura", () => {
    const d = datosTarjeta({
      ids: ["pic", "aterrizajes"],
      flights: [vuelo({ pic_day_loc: 1, landings: 2 })],
      logbooks: [libroConApertura()],
      aircraft: [],
    });
    expect(d.tiles.find((t) => t.id === "pic")?.value).toBe("501.0");
    expect(d.tiles.find((t) => t.id === "aterrizajes")?.value).toBe("302");
  });

  it("cuenta aeródromos distintos de los dos extremos de la ruta", () => {
    const d = datosTarjeta({
      ids: ["aerodromos"],
      flights: [vuelo({ route: "SADF SADR" }), vuelo({ id: "f2", route: "SADR SAEZ" })],
      logbooks: [],
      aircraft: [],
    });
    expect(d.tiles[0].value).toBe("3");
  });

  it("sin vuelos no rompe y devuelve ceros", () => {
    const d = datosTarjeta({ ids: TILES_POR_DEFECTO, flights: [], logbooks: [], aircraft: [] });
    expect(d.horas).toBe("0.0");
    expect(d.tiles).toHaveLength(4);
    expect(d.tiles.every((t) => typeof t.value === "string")).toBe(true);
  });

  it("la aeronave más volada cae en un guión si no hay ninguna", () => {
    const d = datosTarjeta({ ids: ["aeronave_top"], flights: [], logbooks: [], aircraft: [] });
    expect(d.tiles[0].value).toBe("—");
  });
});
