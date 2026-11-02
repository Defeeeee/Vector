import { describe, expect, it } from "vitest";
import { Aircraft, Flight } from "@/types";
import { MAX_PATTERN_LENGTH, CustomStat, evaluateStat, presets } from "./custom-stats";

const HOY = new Date("2026-08-06T12:00:00Z");

const flota: Aircraft[] = [
  { id: "mono", user_id: "u", registration: "LV-S153", icao: "", type: "", type_acft: "MONT-T" },
  { id: "multi", user_id: "u", registration: "LV-XXX", icao: "", type: "", type_acft: "MULT-T" },
];

const vuelo = (over: Partial<Flight>): Flight =>
  ({
    id: Math.random().toString(), user_id: "u", date: "2026-08-01", route: "SADF SADM",
    landings: 1, duration: 1, takeoff: "", landing: "", purpose: "VP", aircraft_id: "mono", ...over,
  }) as Flight;

const stat = (over: Partial<CustomStat>): CustomStat =>
  ({ id: "s", name: "m", metric: "vuelos", ...over }) as CustomStat;

describe("evaluateStat — métricas", () => {
  const vuelos = [
    vuelo({ duration: 1.5, landings: 3 }),
    vuelo({ duration: 0.8, landings: 2 }),
  ];

  it("suma horas", () => {
    expect(evaluateStat(stat({ metric: "horas" }), vuelos, flota, HOY).value).toBe(2.3);
  });

  it("suma aterrizajes", () => {
    expect(evaluateStat(stat({ metric: "aterrizajes" }), vuelos, flota, HOY).value).toBe(5);
  });

  it("cuenta vuelos", () => {
    expect(evaluateStat(stat({ metric: "vuelos" }), vuelos, flota, HOY).value).toBe(2);
  });
});

describe("evaluateStat — filtros", () => {
  const vuelos = [
    vuelo({ aircraft_id: "mono", purpose: "VP", route: "SADF SADM", date: "2026-08-01" }),
    vuelo({ aircraft_id: "multi", purpose: "INST", route: "SAEZ SABE", date: "2026-01-01" }),
  ];

  it("filtra por aeronave", () => {
    expect(evaluateStat(stat({ aircraftId: "mono" }), vuelos, flota, HOY).value).toBe(1);
  });

  it("filtra por clase", () => {
    expect(evaluateStat(stat({ clase: "MULT-T" }), vuelos, flota, HOY).value).toBe(1);
  });

  it("filtra por finalidad", () => {
    expect(evaluateStat(stat({ purpose: "INST" }), vuelos, flota, HOY).value).toBe(1);
  });

  it("filtra por ventana de días", () => {
    expect(evaluateStat(stat({ windowDays: 30 }), vuelos, flota, HOY).value).toBe(1);
  });

  /** El aeródromo matchea en cualquiera de los dos extremos. */
  it("filtra por aeródromo en origen o destino", () => {
    expect(evaluateStat(stat({ airport: "SADM" }), vuelos, flota, HOY).value).toBe(1);
    expect(evaluateStat(stat({ airport: "SADF" }), vuelos, flota, HOY).value).toBe(1);
    expect(evaluateStat(stat({ airport: "SAZS" }), vuelos, flota, HOY).value).toBe(0);
  });

  /** Dos casillas marcadas son un AND, que es lo que espera quien las marca. */
  it("combina filtros con AND", () => {
    expect(evaluateStat(stat({ clase: "MONT-T", purpose: "INST" }), vuelos, flota, HOY).value).toBe(0);
  });

  it("un filtro vacío no filtra", () => {
    expect(evaluateStat(stat({}), vuelos, flota, HOY).value).toBe(2);
  });
});

describe("evaluateStat — objetivo", () => {
  const vuelos = [vuelo({ landings: 3 })];

  it("marca cumplido al llegar al objetivo", () => {
    const r = evaluateStat(stat({ metric: "aterrizajes", target: 3 }), vuelos, flota, HOY);
    expect(r.met).toBe(true);
  });

  it("marca incumplido por debajo", () => {
    expect(evaluateStat(stat({ metric: "aterrizajes", target: 5 }), vuelos, flota, HOY).met).toBe(false);
  });

  /** Sin objetivo no es ni cumplida ni incumplida: es un contador. */
  it("sin objetivo devuelve null, no false", () => {
    expect(evaluateStat(stat({ metric: "aterrizajes" }), vuelos, flota, HOY).met).toBeNull();
  });
});

describe("evaluateStat — regex", () => {
  const vuelos = [
    vuelo({ remarks: "Vuelo con instructor Pérez" }),
    vuelo({ remarks: "Solo, circuitos" }),
    vuelo({ remarks: undefined }),
  ];

  it("filtra por el campo de texto elegido", () => {
    const r = evaluateStat(stat({ regexField: "remarks", regexPattern: "instructor" }), vuelos, flota, HOY);
    expect(r.value).toBe(1);
  });

  it("no distingue mayúsculas", () => {
    expect(evaluateStat(stat({ regexField: "remarks", regexPattern: "PÉREZ" }), vuelos, flota, HOY).value).toBe(1);
  });

  it("tolera un campo vacío sin romperse", () => {
    expect(evaluateStat(stat({ regexField: "remarks", regexPattern: "^$" }), vuelos, flota, HOY).value).toBe(1);
  });

  /**
   * Un patrón inválido no puede vaciar la métrica en silencio: se descarta el
   * filtro y se avisa, porque un cero sin explicación se lee como "no volaste".
   */
  it("avisa cuando el patrón es inválido en vez de devolver cero mudo", () => {
    const r = evaluateStat(stat({ regexField: "remarks", regexPattern: "[sin-cerrar" }), vuelos, flota, HOY);
    expect(r.regexError).toContain("no es una expresión regular válida");
    expect(r.value).toBe(3);
  });

  it("rechaza un patrón más largo que el tope", () => {
    const largo = "a".repeat(MAX_PATTERN_LENGTH + 1);
    const r = evaluateStat(stat({ regexField: "remarks", regexPattern: largo }), vuelos, flota, HOY);
    expect(r.regexError).toContain("supera los");
  });

  /** El caso clásico de regex catastrófico: un cuantificador dentro de otro. */
  it("rechaza cuantificadores anidados", () => {
    const r = evaluateStat(stat({ regexField: "remarks", regexPattern: "(a+)+$" }), vuelos, flota, HOY);
    expect(r.regexError).toContain("cuantificadores anidados");
  });
});

describe("presets", () => {
  /**
   * La recencia es un preset del mismo motor, no una feature aparte. Y la ventana
   * se recibe porque depende de la licencia: 61.140(a)(2) la extiende a 180 días
   * para piloto privado.
   */
  it("arma la experiencia reciente con la ventana que se le pase", () => {
    const recencia = presets(180).find((p) => p.name === "Experiencia reciente")!;
    expect(recencia.windowDays).toBe(180);
    expect(recencia.target).toBe(3);
    expect(recencia.metric).toBe("aterrizajes");
    expect(presets(90).find((p) => p.name === "Experiencia reciente")!.windowDays).toBe(90);
  });

  it("todos los presets son evaluables", () => {
    for (const p of presets(90)) {
      const r = evaluateStat({ id: "x", ...p }, [vuelo({ landings: 2 })], flota, HOY);
      expect(typeof r.value).toBe("number");
    }
  });
});
