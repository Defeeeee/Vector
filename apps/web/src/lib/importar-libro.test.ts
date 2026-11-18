import { describe, expect, it } from "vitest";
import {
  avionesNuevos, claveDeSimulador, comoSesionDeSimulador, problemaDeFila, simuladorDelHangar, simuladoresNuevos, deduplicar, icaoDeModelo, lotesPendientes, normalizarMatricula, parsearVuelos, partirEnLotes,
  textoDeFallidos, textoDeProgreso, unirLotes, unirRangos, vueloSinAvion, avisoDeFallidos, esSimuladorLeido, type VueloLeido,
} from "./importar-libro";

const v = (o: Record<string, unknown> = {}) => ({ date: "2026-05-01", aircraft_registration: "LV-ABC", aircraft_model: "Cessna 152", route: "SADF SADF", takeoff: "14:00", landing: "15:00", duration: 1, ...o });

describe("lotes", () => {
  it("parte en lotes de a 4 y de a 3, con el último más chico", () => {
    expect(partirEnLotes(10, 4)).toEqual([{ desde: 1, hasta: 4 }, { desde: 5, hasta: 8 }, { desde: 9, hasta: 10 }]);
    expect(partirEnLotes(7, 3).map((r) => r.hasta)).toEqual([3, 6, 7]);
    expect(partirEnLotes(0, 3)).toEqual([]);
  });
  it("reanuda desde el lote donde quedó", () => {
    const l = partirEnLotes(12, 3);
    expect(lotesPendientes(l, new Set([0, 1]))).toEqual([2, 3]);
    expect(lotesPendientes(l, new Set([0, 1, 2, 3]))).toEqual([]);
  });
  it("escribe los rangos de hojas", () => {
    expect(textoDeProgreso({ desde: 5, hasta: 8 }, 40)).toBe("Leyendo las hojas 5 a 8 de 40…");
    expect(textoDeProgreso({ desde: 9, hasta: 9 }, 40)).toBe("Leyendo la hoja 9 de 40…");
    expect(unirRangos([{ desde: 9, hasta: 12 }, { desde: 5, hasta: 8 }])).toEqual([{ desde: 5, hasta: 12 }]);
    expect(avisoDeFallidos([{ desde: 9, hasta: 12 }])).toBe("No pudimos leer las hojas 9 a 12: volvé a probar con esas o subilas en fotos.");
    expect(textoDeFallidos([{ desde: 3, hasta: 3 }, { desde: 9, hasta: 12 }])).toBe("las hojas 3 y 9 a 12");
    expect(textoDeFallidos([{ desde: 3, hasta: 3 }])).toBe("la hoja 3");
    expect(avisoDeFallidos([])).toBeNull();
  });
});

describe("unir y deduplicar", () => {
  it("saca el vuelo de una hoja que cayó en dos lotes, aunque cambie la forma de escribir", () => {
    const a = v();
    const b = v({ aircraft_registration: "lvabc", route: "SADF - SADF", takeoff: "14:00" });
    expect(deduplicar([a, b, v({ takeoff: "16:00" })])).toHaveLength(2);
    expect(unirLotes([[a], [b], [v({ date: "2026-05-02" })]])).toHaveLength(2);
  });
  it("un mismo día con otra salida es otro vuelo", () => {
    expect(deduplicar([v(), v({ takeoff: "9:00" })])).toHaveLength(2);
  });
});

describe("la respuesta de Gemini", () => {
  it("lee un arreglo, con o sin cerco de código", () => {
    expect(parsearVuelos(JSON.stringify([v()]))).toHaveLength(1);
    expect(parsearVuelos("```json\n" + JSON.stringify([v()]) + "\n```")).toHaveLength(1);
  });
  it("recupera hasta el último vuelo completo de una respuesta cortada", () => {
    const cortada = JSON.stringify([v(), v({ date: "2026-05-02" })]).slice(0, -25);
    expect(parsearVuelos(cortada)).toHaveLength(1);
  });
  it("devuelve null si no hay nada que rescatar", () => {
    expect(parsearVuelos("Lo siento, no puedo")).toBeNull();
    expect(parsearVuelos("")).toBeNull();
  });
});

describe("aviones nuevos", () => {
  const vuelos = [
    v(), v(), v({ aircraft_model: "Cessna 172" }),
    v({ aircraft_registration: "LV-XYZ", aircraft_model: "Tecnam P2008" }),
    v({ aircraft_registration: "LV-HAN", aircraft_model: "" }),
    v({ aircraft_registration: "", aircraft_model: "Simulador" }),
    v({ aircraft_registration: "SIM", aircraft_model: "" }),
  ];
  it("agrupa por matrícula normalizada con el modelo más frecuente y los vuelos", () => {
    const r = avionesNuevos(vuelos, ["LV-HAN"]);
    expect(r.map((a) => a.clave)).toEqual(["LVABC", "LVXYZ"]);
    expect(r[0]).toMatchObject({ registration: "LV-ABC", type: "Cessna 152", icao: "C152", type_acft: "MONT-T", vuelos: 3, crear: true });
    expect(r[1]).toMatchObject({ type: "Tecnam P2008", icao: "P208", vuelos: 1 });
  });
  it("no crea los que ya están (aunque se escriban distinto) ni los simuladores", () => {
    expect(avionesNuevos(vuelos, ["lv abc", "LVXYZ", "LV-HAN"])).toEqual([]);
    expect(esSimuladorLeido("")).toBe(true);
    expect(esSimuladorLeido("SIM")).toBe(true);
    expect(esSimuladorLeido("LV-ABC")).toBe(false);
  });
  it("sin modelo reconocible el ICAO queda vacío", () => {
    expect(icaoDeModelo("Piper")).toBeNull();
    expect(icaoDeModelo("Piper PA-11")).toEqual({ icao: "PA11", type_acft: "MONT-T" });
    expect(icaoDeModelo("")).toBeNull();
    expect(normalizarMatricula(" lv-abc ")).toBe("LVABC");
  });
});

describe("un vuelo con avión a crear no bloquea", () => {
  const a = avionesNuevos([v()], [])[0];
  it("con el avión tildado", () => {
    expect(vueloSinAvion({ aircraft_id: "", nuevo_clave: a.clave }, [a])).toBe(false);
  });
  it("con el tilde apagado vuelve a pedir avión a mano", () => {
    expect(vueloSinAvion({ aircraft_id: "", nuevo_clave: a.clave }, [{ ...a, crear: false }])).toBe(true);
  });
  it("uno ya asignado a un avión del Hangar no bloquea; uno sin nada sí", () => {
    expect(vueloSinAvion({ aircraft_id: "x" }, [])).toBe(false);
    expect(vueloSinAvion({ aircraft_id: "" }, [a])).toBe(true);
  });
});

describe("simuladores del libro (filas sin matrícula)", () => {
  const v = (o: Partial<VueloLeido>): VueloLeido => ({ date: "2025-03-11", aircraft_registration: "", route: "ASG ASG", takeoff: "13:05", landing: "14:55", duration: 1.8, ...o });
  const libro = [v({ aircraft_model: "B350" }), v({ aircraft_model: "B350" }), v({ aircraft_model: "C172", route: "GEO SIMULADORES" }), v({ aircraft_registration: "LV-S024", aircraft_model: "ASTO" })];
  it("propone un simulador por modelo, con una matrícula a corregir", () => {
    const r = simuladoresNuevos(libro, []);
    expect(r.map((a) => [a.clave, a.registration, a.vuelos, a.simulador])).toEqual([["SIM-B350", "SIM B350", 2, true], ["SIM-C172", "SIM C172", 1, true]]);
  });
  it("usa el simulador del Hangar si hay uno de ese modelo", () => {
    const hangar = [{ id: "s1", registration: "LV-ASG", type: "Simulador B350", is_simulator: true }, { id: "a1", registration: "LV-S024", type: "ASTO" }];
    expect(simuladorDelHangar("B350", hangar)).toBe("s1");
    expect(simuladorDelHangar("C172", hangar)).toBeUndefined();
    expect(simuladoresNuevos(libro, hangar).map((a) => a.clave)).toEqual(["SIM-C172"]);
    expect(claveDeSimulador("")).toBe("SIM-X");
  });
  it("la sesión se guarda como el formulario: duración 0 y las horas en instrucción", () => {
    const f = comoSesionDeSimulador({ duration: 1.8, pic_day_loc: 1.8, imc_pil: 1.8 });
    expect(f).toMatchObject({ duration: 0, sim_pil_en_inst: 1.8, pic_day_loc: undefined, imc_pil: undefined });
    expect(comoSesionDeSimulador({ duration: 1.5, sim_instructor: 1.5 })).toMatchObject({ duration: 0, sim_instructor: 1.5, sim_pil_en_inst: undefined });
  });
});

describe("lo que cortaba la importación de Berni", () => {
  it("una hora de un dígito ya no rompe el armado del vuelo", async () => {
    const { horariosDelVuelo } = await import("./horarios");
    expect(horariosDelVuelo("2025-03-11", "9:05", "10:40")).toEqual({ takeoff_dt: "2025-03-11T09:05:00Z", landing_dt: "2025-03-11T10:40:00Z" });
    expect(() => horariosDelVuelo("2025-03-11", "25:00", "10:40")).toThrow(/horario inválido/);
  });
  it("la fila con fecha u horario imposible se marca antes de guardar", () => {
    expect(problemaDeFila({ date: "2025-03-11", takeoff: "9:05", landing: "10:40" })).toBeNull();
    expect(problemaDeFila({ date: "2025-02-30", takeoff: "09:05", landing: "10:40" })).toBe("la fecha");
    expect(problemaDeFila({ date: "2025-03-11", takeoff: "9", landing: "10:40" })).toBe("el horario");
  });
  it("lee el modelo escrito como designador OACI", () => {
    expect(icaoDeModelo("C150")).toEqual({ icao: "C150", type_acft: "MONT-T" });
    expect(icaoDeModelo("PA30")).toEqual({ icao: "PA30", type_acft: "MULT-T" });
    expect(icaoDeModelo("Cessna 150")).toEqual({ icao: "C150", type_acft: "MONT-T" });
    expect(icaoDeModelo("ECHO")).toEqual({ icao: "ECHO", type_acft: "MONT-T" });
    expect(icaoDeModelo("SIRA")?.icao).toBe("SIRA");
    expect(icaoDeModelo("ASTO")?.icao).toBe("ASTO");
    expect(icaoDeModelo("TWEN")?.icao).toBe("TWEN");
    expect(icaoDeModelo("Tecnam P2008")?.icao).toBe("P208");
    expect(icaoDeModelo("Tecnam P2002 Sierra")?.icao).toBe("SIRA");
  });
});
