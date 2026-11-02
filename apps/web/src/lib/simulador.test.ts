import { describe, expect, it } from "vitest";
import {
  RUTA_SIMULADOR,
  duracionQueSeGuarda,
  esAeronaveSimulador,
  esVueloDeSimulador,
  horasDeLaFila,
  idsDeSimuladores,
  normalizarRutaSimulador,
  separarSimuladores,
  soloVolados,
} from "./simulador";
import type { Aircraft, Flight } from "@/types";

const avion = (id: string, extra: Partial<Aircraft> = {}): Aircraft =>
  ({
    id,
    registration: `LV-${id}`,
    icao: "C172",
    type: "Cessna 172",
    ...extra,
  }) as Aircraft;

const simu = (id: string) => avion(id, { is_simulator: true });

const vuelo = (aircraft_id: string | undefined, extra: Partial<Flight> = {}): Flight =>
  ({
    id: `f-${aircraft_id ?? "sin"}-${Math.random()}`,
    date: "2026-07-21",
    route: "SADM SADM",
    duration: 1,
    landings: 1,
    aircraft_id,
    ...extra,
  }) as Flight;

describe("idsDeSimuladores", () => {
  it("junta sólo los que están marcados", () => {
    const ids = idsDeSimuladores([avion("a"), simu("b"), avion("c"), simu("d")]);
    expect([...ids].sort()).toEqual(["b", "d"]);
  });

  it("una flota sin simuladores da un conjunto vacío", () => {
    expect(idsDeSimuladores([avion("a"), avion("b")]).size).toBe(0);
  });

  it("`is_simulator` ausente no es simulador", () => {
    // El campo es opcional en el tipo: una aeronave cargada antes de la migración
    // llega sin él, y leerla como simulador le borraría las horas al piloto.
    expect(idsDeSimuladores([{ id: "a" } as Aircraft]).size).toBe(0);
  });
});

describe("esVueloDeSimulador", () => {
  const simuladores = new Set(["sim"]);

  it("reconoce la fila por la aeronave", () => {
    expect(esVueloDeSimulador(vuelo("sim"), simuladores)).toBe(true);
    expect(esVueloDeSimulador(vuelo("avion"), simuladores)).toBe(false);
  });

  it("un vuelo sin aeronave no es de simulador", () => {
    // `aircraft_id` es opcional en el backend. Sin esta guarda, un `undefined` que
    // por lo que sea entrara al conjunto marcaría de simulador a todos los huérfanos.
    expect(esVueloDeSimulador(vuelo(undefined), simuladores)).toBe(false);
    expect(esVueloDeSimulador(vuelo(undefined), new Set([undefined as never]))).toBe(false);
  });
});

describe("separarSimuladores", () => {
  it("parte en dos sin perder ni duplicar filas", () => {
    const flota = [avion("a"), simu("s")];
    const filas = [vuelo("a"), vuelo("s"), vuelo("a"), vuelo(undefined)];
    const { volados, simulados } = separarSimuladores(filas, idsDeSimuladores(flota));

    expect(volados).toHaveLength(3);
    expect(simulados).toHaveLength(1);
    expect(simulados[0].aircraft_id).toBe("s");
    const porId = (a: Flight, b: Flight) => a.id.localeCompare(b.id);
    expect([...volados, ...simulados].sort(porId)).toEqual([...filas].sort(porId));
  });

  it("conserva el orden dentro de cada lado", () => {
    const filas = [
      vuelo("a", { date: "2026-01-01" }),
      vuelo("s", { date: "2026-01-02" }),
      vuelo("a", { date: "2026-01-03" }),
      vuelo("s", { date: "2026-01-04" }),
    ];
    const { volados, simulados } = separarSimuladores(filas, new Set(["s"]));
    expect(volados.map((f) => f.date)).toEqual(["2026-01-01", "2026-01-03"]);
    expect(simulados.map((f) => f.date)).toEqual(["2026-01-02", "2026-01-04"]);
  });
});

describe("soloVolados", () => {
  it("saca las sesiones de simulador de la bitácora", () => {
    const filas = [vuelo("a"), vuelo("s")];
    expect(soloVolados(filas, [avion("a"), simu("s")])).toEqual([filas[0]]);
  });

  it("sin flota conocida no se descarta nada", () => {
    // Si el payload no trajo aeronaves, borrar filas sería inventar una conclusión.
    const filas = [vuelo("a"), vuelo("s")];
    expect(soloVolados(filas, [])).toEqual(filas);
  });
});

describe("esAeronaveSimulador", () => {
  const flota = [avion("a"), simu("s")];

  it("responde por el id elegido en el formulario", () => {
    expect(esAeronaveSimulador("s", flota)).toBe(true);
    expect(esAeronaveSimulador("a", flota)).toBe(false);
  });

  it("sin aeronave elegida el formulario es de vuelo", () => {
    expect(esAeronaveSimulador("", flota)).toBe(false);
  });

  it("un id que no está en la flota no es simulador", () => {
    expect(esAeronaveSimulador("fantasma", flota)).toBe(false);
  });
});

describe("normalizarRutaSimulador", () => {
  it("deja pasar lo que dice el libro", () => {
    expect(normalizarRutaSimulador("LOCAL")).toBe("LOCAL");
  });

  it("pone en mayúsculas", () => {
    // No se prueba con "local": el filtro de caracteres borra las minúsculas y el
    // respaldo devolvería "LOCAL" igual, con lo que la prueba pasaría sin que
    // `toUpperCase` existiera.
    expect(normalizarRutaSimulador("sim ifr")).toBe("SIM IFR");
  });

  it("vacío cae en LOCAL", () => {
    expect(normalizarRutaSimulador("")).toBe(RUTA_SIMULADOR);
    expect(normalizarRutaSimulador("   ")).toBe(RUTA_SIMULADOR);
  });

  it("saca el guión, que `logFlight` interpretaría como ruta multipunto", () => {
    // Sin esto, `logFlight` ve el guión, borra los espacios y guarda "INSTIFR".
    expect(normalizarRutaSimulador("INST - IFR")).toBe("INST IFR");
  });

  it("colapsa espacios de más", () => {
    expect(normalizarRutaSimulador("  SIM   IFR  ")).toBe("SIM IFR");
  });

  it("deja la barra, que separa ejercicios", () => {
    expect(normalizarRutaSimulador("ILS/VOR")).toBe("ILS/VOR");
  });

  it("corta a 20 caracteres", () => {
    expect(normalizarRutaSimulador("A".repeat(30))).toHaveLength(20);
  });

  it("un texto que queda vacío después de limpiar también cae en LOCAL", () => {
    expect(normalizarRutaSimulador("---")).toBe(RUTA_SIMULADOR);
  });
});

describe("duracionQueSeGuarda", () => {
  it("un simulador no aporta tiempo total, aunque la sesión haya durado una hora", () => {
    expect(duracionQueSeGuarda(true, 1)).toBe(0);
  });

  it("un vuelo guarda lo que duró", () => {
    expect(duracionQueSeGuarda(false, 1.4)).toBe(1.4);
  });
});

describe("horasDeLaFila", () => {
  const fila = (extra: Partial<Flight>) => vuelo("s", extra);

  it("un vuelo muestra su duración", () => {
    expect(horasDeLaFila(fila({ duration: 1.4 }), false)).toBe(1.4);
  });

  it("un simulador muestra las horas de instrucción, no el cero del total", () => {
    expect(horasDeLaFila(fila({ duration: 0, sim_pil_en_inst: 1 }), true)).toBe(1);
  });

  it("cae en la columna de instructor cuando es la única cargada", () => {
    expect(horasDeLaFila(fila({ duration: 0, sim_instructor: 1.5 }), true)).toBe(1.5);
  });

  it("no suma las dos columnas: en el libro una sesión llena una sola", () => {
    // Sumarlas daría 2.5 sobre una sesión que duró 1.0.
    expect(horasDeLaFila(fila({ duration: 0, sim_pil_en_inst: 1, sim_instructor: 1.5 }), true)).toBe(1);
  });

  it("un simulador sin horas cargadas muestra cero, no undefined", () => {
    expect(horasDeLaFila(fila({ duration: 0 }), true)).toBe(0);
  });
});
