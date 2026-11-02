import { describe, expect, it } from "vitest";
import type { Aircraft, Flight, Logbook } from "@/types";
import type { Requisito } from "./pca-progress";
import {
  costoPorHora,
  horasQueFaltan,
  loQueFrena,
  mesesRestantes,
  requisitosLicencia,
  ritmoMensual,
} from "./pca-progress";

/**
 * Los seis números de 61.620 no tenían un solo test: vivían adentro del `.tsx` y el
 * proyecto no puede testear componentes (`environment: "node"`). Esto los cubre por
 * primera vez, además de lo nuevo.
 */

const HOY = "2026-08-14";

const vuelo = (over: Partial<Flight> = {}): Flight =>
  ({
    id: Math.random().toString(36).slice(2),
    user_id: "u",
    date: "2026-08-01",
    route: "SADM SADM",
    landings: 1,
    duration: 1,
    takeoff: "",
    landing: "",
    purpose: "VP",
    ...over,
  }) as Flight;

const libro = (over: Partial<Logbook> = {}): Logbook =>
  ({
    id: "l1", user_id: "u", name: "Mi libro", is_default: true, created_at: "",
    opening_landings: 0,
    opening_pic_day_loc: 0, opening_pic_day_tra: 0,
    opening_pic_night_loc: 0, opening_pic_night_tra: 0,
    opening_sic_day_loc: 0, opening_sic_day_tra: 0,
    opening_sic_night_loc: 0, opening_sic_night_tra: 0,
    opening_imc_pil: 0, opening_imc_cop: 0, opening_capota: 0,
    ...over,
  }) as Logbook;

const buscar = (flights: Flight[], clave: string, logbooks: Logbook[] = []) =>
  requisitosLicencia(flights, logbooks).find((r) => r.clave === clave)!;

describe("requisitosLicencia", () => {
  it("suma las horas de vuelo al total", () => {
    expect(buscar([vuelo({ duration: 2 }), vuelo({ duration: 1.5 })], "total").actual).toBe(3.5);
  });

  it("PIC suma las cuatro columnas de PIC", () => {
    const f = vuelo({ pic_day_loc: 1, pic_day_tra: 2, pic_night_loc: 0.5, pic_night_tra: 0.5 });
    expect(buscar([f], "pic").actual).toBe(4);
  });

  it("travesía sólo cuenta las columnas de travesía", () => {
    const f = vuelo({ pic_day_loc: 5, pic_day_tra: 2, pic_night_tra: 1 });
    expect(buscar([f], "picTravesia").actual).toBe(3);
  });

  /**
   * El simulado cuenta hasta 5 h y el tope va sobre el acumulado, no vuelo por
   * vuelo. Aplicándolo por vuelo, diez sesiones de 1 h darían 10 en vez de 5.
   */
  it("el instrumento simulado tope a 5 sobre el acumulado", () => {
    const diez = Array.from({ length: 10 }, () => vuelo({ sim_pil_en_inst: 1 }));
    expect(buscar(diez, "instrumentos").actual).toBe(5);
  });

  it("el instrumento real no tiene tope y se suma al simulado", () => {
    const f = [vuelo({ imc_pil: 3, capota: 2 }), ...Array.from({ length: 8 }, () => vuelo({ sim_pil_en_inst: 1 }))];
    expect(buscar(f, "instrumentos").actual).toBe(10);
  });

  it("las horas de apertura entran en el total y en PIC", () => {
    const libros = [libro({ opening_pic_day_loc: 500 })];
    expect(buscar([], "total", libros).actual).toBe(500);
    expect(buscar([], "pic", libros).actual).toBe(500);
  });

  /**
   * Los aterrizajes de apertura vienen sin desglose día/noche. Suponerlos nocturnos
   * infla un requisito, que es el error que manda a alguien al examen corto.
   */
  it("los aterrizajes de apertura NO cuentan como nocturnos", () => {
    expect(buscar([], "aterrizajesNocturnos", [libro({ opening_landings: 300 })]).actual).toBe(0);
  });
});

describe("loQueFrena", () => {
  /**
   * El caso que motiva todo esto: casi todas las horas hechas y trabado por un
   * requisito chico. El medidor grande dice 97% y lo que decide qué volar es otro.
   */
  it("elige el que está más lejos en fracción, no en valor absoluto", () => {
    const reqs = [
      { grupo: "pca" as const, clave: "total", label: "Total", actual: 195, objetivo: 200, unidad: "hs", esHoras: true },
      { grupo: "pca" as const, clave: "tra", label: "Travesía", actual: 2, objetivo: 20, unidad: "hs", esHoras: true },
    ];
    const freno = loQueFrena(reqs)!;
    // A "total" le faltan 5 h y a travesía 18: en absoluto travesía pide más, pero
    // lo que importa es que está al 10% contra el 97,5%.
    expect(freno.clave).toBe("tra");
    expect(freno.faltan).toBe(18);
  });

  it("compara unidades distintas sin mezclarlas", () => {
    const reqs = [
      { grupo: "pca" as const, clave: "noct", label: "Nocturno", actual: 4, objetivo: 5, unidad: "hs", esHoras: true },
      { grupo: "pca" as const, clave: "atrr", label: "Aterrizajes", actual: 1, objetivo: 5, unidad: "atrr", esHoras: false },
    ];
    expect(loQueFrena(reqs)!.clave).toBe("atrr");
  });

  it("con todo cumplido no hay freno", () => {
    const reqs = [{ grupo: "pca" as const, clave: "a", label: "A", actual: 10, objetivo: 10, unidad: "hs", esHoras: true }];
    expect(loQueFrena(reqs)).toBe(null);
  });

  /** `subObjetivo` es informativo: usarlo diría que alguien terminó cuando le falta. */
  it("el subobjetivo no cuenta como cumplido", () => {
    const reqs = [
      { grupo: "pca" as const, clave: "pic", label: "PIC", actual: 75, objetivo: 100, subObjetivo: 70, unidad: "hs", esHoras: true },
    ];
    expect(loQueFrena(reqs)!.clave).toBe("pic");
  });

  it("empatados en cero, gana el que pide más", () => {
    const reqs = [
      { grupo: "pca" as const, clave: "chico", label: "Chico", actual: 0, objetivo: 5, unidad: "hs", esHoras: true },
      { grupo: "pca" as const, clave: "grande", label: "Grande", actual: 0, objetivo: 20, unidad: "hs", esHoras: true },
    ];
    expect(loQueFrena(reqs)!.clave).toBe("grande");
  });
});

describe("ritmoMensual", () => {
  it("promedia sobre la ventana, no sobre los vuelos", () => {
    // 6 h de travesía en la ventana de 3 meses → 2 h por mes.
    const flights = [
      vuelo({ date: "2026-07-01", pic_day_tra: 3 }),
      vuelo({ date: "2026-08-01", pic_day_tra: 3 }),
    ];
    expect(ritmoMensual(flights, "picTravesia", HOY)).toBe(2);
  });

  it("ignora lo que quedó fuera de la ventana", () => {
    const flights = [vuelo({ date: "2020-01-01", pic_day_tra: 90 })];
    expect(ritmoMensual(flights, "picTravesia", HOY)).toBe(0);
  });

  /**
   * El ritmo se mide sobre el requisito, no sobre las horas totales: alguien que
   * vuela mucho dando vueltas al aeródromo avanza cero en travesía, y proyectar con
   * el ritmo general daría una fecha optimista sobre justo lo que lo tiene trabado.
   */
  it("volar sin travesía deja el ritmo de travesía en cero", () => {
    const flights = [vuelo({ date: "2026-08-01", duration: 20, pic_day_loc: 20 })];
    expect(ritmoMensual(flights, "total", HOY)).toBeCloseTo(6.67, 1);
    expect(ritmoMensual(flights, "picTravesia", HOY)).toBe(0);
  });
});

describe("mesesRestantes", () => {
  it("divide lo que falta por el ritmo", () => {
    expect(mesesRestantes(6, 2)).toBe(3);
  });

  /**
   * `null` y no infinito: sin ritmo no hay nada de dónde proyectar, y contestar
   * "nunca" sería afirmar algo que no sabemos. El piloto puede tener una travesía
   * reservada para el sábado.
   */
  it("sin ritmo no proyecta", () => {
    expect(mesesRestantes(6, 0)).toBe(null);
  });
});

describe("horasQueFaltan", () => {
  /**
   * Es un piso, no una suma. Un mismo vuelo avanza varios requisitos —una travesía
   * nocturna como PIC suma a total, PIC, travesía y nocturno—, así que sumar las
   * brechas asustaría con un número que nadie va a pagar.
   */
  it("es la brecha más grande, no la suma de las brechas", () => {
    const reqs = [
      { grupo: "pca" as const, clave: "total", label: "Total", actual: 150, objetivo: 200, unidad: "hs", esHoras: true },
      { grupo: "pca" as const, clave: "tra", label: "Travesía", actual: 10, objetivo: 20, unidad: "hs", esHoras: true },
      { grupo: "pca" as const, clave: "noct", label: "Nocturno", actual: 0, objetivo: 5, unidad: "hs", esHoras: true },
    ];
    expect(horasQueFaltan(reqs)).toBe(50);
  });

  it("los aterrizajes no entran: no se miden en horas", () => {
    const reqs = [
      { grupo: "pca" as const, clave: "total", label: "Total", actual: 199, objetivo: 200, unidad: "hs", esHoras: true },
      { grupo: "pca" as const, clave: "atrr", label: "Aterrizajes", actual: 0, objetivo: 5, unidad: "atrr", esHoras: false },
    ];
    expect(horasQueFaltan(reqs)).toBe(1);
  });

  it("con todo cumplido no falta nada", () => {
    const reqs = [{ grupo: "pca" as const, clave: "a", label: "A", actual: 210, objetivo: 200, unidad: "hs", esHoras: true }];
    expect(horasQueFaltan(reqs)).toBe(0);
  });
});

describe("costoPorHora", () => {
  const avion = (id: string, cost?: number): Aircraft =>
    ({ id, user_id: "u", registration: id, icao: "C172", type: "Cessna", cost_per_hour: cost }) as Aircraft;

  /** Ponderado por horas: un bimotor caro volado una vez no es lo que se paga. */
  it("pondera por horas voladas, no por cantidad de aeronaves", () => {
    const flota = [avion("barato", 100), avion("caro", 1000)];
    const flights = [
      vuelo({ date: "2026-08-01", aircraft_id: "barato", duration: 9 }),
      vuelo({ date: "2026-08-01", aircraft_id: "caro", duration: 1 }),
    ];
    // (9×100 + 1×1000) / 10 = 190. Un promedio simple habría dado 550.
    expect(costoPorHora(flights, flota, HOY)).toBe(190);
  });

  /** Sin precio cargado no hay estimación: un cero se leería como "gratis". */
  it("sin precios devuelve null", () => {
    const flights = [vuelo({ aircraft_id: "a", duration: 5 })];
    expect(costoPorHora(flights, [avion("a")], HOY)).toBe(null);
  });

  it("un trimestre sin volar cae a toda la bitácora en vez de callarse", () => {
    const flights = [vuelo({ date: "2023-01-01", aircraft_id: "a", duration: 10 })];
    expect(costoPorHora(flights, [avion("a", 500)], HOY)).toBe(500);
  });

  it("ignora las aeronaves sin precio al ponderar", () => {
    const flota = [avion("con", 200), avion("sin")];
    const flights = [
      vuelo({ date: "2026-08-01", aircraft_id: "con", duration: 2 }),
      vuelo({ date: "2026-08-01", aircraft_id: "sin", duration: 50 }),
    ];
    expect(costoPorHora(flights, flota, HOY)).toBe(200);
  });
});

describe("las sesiones de simulador no son experiencia de vuelo", () => {
  /*
    El caso real del piloto: anota el simulador en el libro como cualquier vuelo
    —fecha, horarios, LV-ASG tipo C172— y la hora va a la columna de instrucción
    terrestre. Lo que no puede pasar es que esa hora cuente para las 200 h de 61.620.
  */
  const SIMU: Aircraft = {
    id: "sim-1", user_id: "u", registration: "LV-ASG", icao: "C172", type: "C172",
    is_simulator: true,
  };
  const AVION: Aircraft = {
    id: "av-1", user_id: "u", registration: "LV-XYZ", icao: "C152", type: "C152",
  };
  const de = (r: Requisito[], clave: string) => r.find((x) => x.clave === clave)!.actual;

  it("**una hora de simulador no suma a la experiencia total**", () => {
    const sesion = vuelo({ aircraft_id: SIMU.id, duration: 1, sim_pil_en_inst: 1 });
    const r = requisitosLicencia([sesion], [], [SIMU, AVION]);
    expect(de(r, "total")).toBe(0);
    // Pero sí cuenta donde corresponde.
    expect(de(r, "instrumentos")).toBe(1);
  });

  it("la misma fila en un avión de verdad sí suma", () => {
    const v = vuelo({ aircraft_id: AVION.id, duration: 1, sim_pil_en_inst: 1 });
    const r = requisitosLicencia([v], [], [SIMU, AVION]);
    expect(de(r, "total")).toBe(1);
    expect(de(r, "instrumentos")).toBe(1);
  });

  it("**se excluye todo, no sólo la duración**", () => {
    /*
      Una fila de simulador con PIC cargado —por un dedo, o importada de una planilla
      vieja— sumaría horas de PIC que nadie voló, y PIC es el segundo requisito más
      grande. En una sesión de simulador lo único que existe es la columna de
      instrucción terrestre; el resto es un error de carga, no un dato.
    */
    const sucia = vuelo({
      aircraft_id: SIMU.id, duration: 2, pic_day_loc: 2, pic_night_tra: 1,
      sim_pil_en_inst: 1, landings: 3,
    });
    const r = requisitosLicencia([sucia], [], [SIMU]);
    expect(de(r, "total")).toBe(0);
    expect(de(r, "pic")).toBe(0);
    expect(de(r, "picTravesia")).toBe(0);
    expect(de(r, "nocturno")).toBe(0);
    expect(de(r, "aterrizajesNocturnos")).toBe(0);
  });

  it("sin la lista de aeronaves nada se marca, y el resultado es el de siempre", () => {
    // La ausencia del dato no se interpreta: es la misma disciplina que `unavailable`.
    const sesion = vuelo({ aircraft_id: SIMU.id, duration: 1, sim_pil_en_inst: 1 });
    expect(de(requisitosLicencia([sesion]), "total")).toBe(1);
  });

  it("el tope de 5 h sigue valiendo, y suma las dos procedencias", () => {
    /*
      La columna de instrucción terrestre se puede llenar en una sesión de simulador
      —el caso normal— y también en un vuelo real con tiempo de instrumentos en tierra.
      Las dos cuentan, contra el mismo tope acumulado.
    */
    const sesiones = Array.from({ length: 4 }, () =>
      vuelo({ aircraft_id: SIMU.id, duration: 1, sim_pil_en_inst: 1 })
    );
    const enVuelo = vuelo({ aircraft_id: AVION.id, duration: 1, sim_pil_en_inst: 3 });
    const r = requisitosLicencia([...sesiones, enVuelo], [], [SIMU, AVION]);
    expect(de(r, "instrumentos")).toBe(5);
    expect(de(r, "total")).toBe(1);
  });
});

/**
 * La HVI, que es la mitad que faltaba.
 *
 * Casi nadie hace la PCA sola: el camino normal en Argentina es sacar la comercial y la
 * habilitación por instrumentos como un solo tramo. Un tracker que muestra sólo 61.620
 * puede tener sus seis diales en verde con el piloto a treinta horas del examen que en
 * realidad va a rendir.
 */
describe("requisitosLicencia · HVI", () => {
  const SIMU: Aircraft = {
    id: "sim-1", user_id: "u", registration: "LV-ASG", icao: "C172", type: "C172",
    is_simulator: true,
  } as Aircraft;
  const de = (r: Requisito[], clave: string) => r.find((x) => x.clave === clave)!;

  it("existe el requisito de 40 h de instrumentos", () => {
    const r = de(requisitosLicencia([]), "instrumentosHvi");
    expect(r.objetivo).toBe(40);
    expect(r.grupo).toBe("hvi");
  });

  it("los mínimos de 61.620 siguen siendo los de siempre", () => {
    // El agregado de la HVI no reinterpreta la PCA: si alguno de estos se movió, se
    // movió por accidente.
    const r = requisitosLicencia([]);
    const objetivo = (c: string) => de(r, c).objetivo;
    expect(objetivo("total")).toBe(200);
    expect(objetivo("pic")).toBe(100);
    expect(objetivo("picTravesia")).toBe(20);
    expect(objetivo("instrumentos")).toBe(10);
    expect(objetivo("nocturno")).toBe(5);
    expect(objetivo("aterrizajesNocturnos")).toBe(5);
    expect(de(r, "pic").subObjetivo).toBe(70);
  });

  it("cada licencia tiene su tope de simulador, y por eso los números difieren", () => {
    /*
      El caso que obliga a dos diales y no a uno con dos metas: con 8 h reales y 12
      simuladas, la PCA cuenta 8 + 5 = 13 y la HVI cuenta 8 + 12 = 20. Un solo dial
      tendría que elegir un número y el otro quedaría mal.
    */
    const reales = vuelo({ imc_pil: 8 });
    const simu = vuelo({ aircraft_id: SIMU.id, duration: 0, sim_pil_en_inst: 12 });
    const r = requisitosLicencia([reales, simu], [], [SIMU]);
    expect(de(r, "instrumentos").actual).toBe(13);
    expect(de(r, "instrumentosHvi").actual).toBe(20);
  });

  it("el tope de la HVI es 20, no infinito", () => {
    const simu = vuelo({ aircraft_id: SIMU.id, duration: 0, sim_pil_en_inst: 35 });
    const r = requisitosLicencia([simu], [], [SIMU]);
    expect(de(r, "instrumentosHvi").actual).toBe(20);
  });

  it("por debajo del tope de la PCA los dos diales dicen lo mismo", () => {
    const r = requisitosLicencia([vuelo({ imc_pil: 3, capota: 1 })]);
    expect(de(r, "instrumentos").actual).toBe(4);
    expect(de(r, "instrumentosHvi").actual).toBe(4);
  });

  it("las horas de apertura de instrumentos entran en los dos", () => {
    const l = libro({ opening_imc_pil: 6, opening_capota: 2 });
    const r = requisitosLicencia([], [l]);
    expect(de(r, "instrumentos").actual).toBe(8);
    expect(de(r, "instrumentosHvi").actual).toBe(8);
  });

  it("cada dial dice su tope, porque si no son dos números sin explicación", () => {
    const r = requisitosLicencia([]);
    expect(de(r, "instrumentos").nota).toContain("5");
    expect(de(r, "instrumentosHvi").nota).toContain("20");
  });

  it("con la HVI en juego, lo que frena deja de ser un requisito de la PCA", () => {
    /*
      Un piloto con 61.620 entero cumplido y sin horas de instrumentos: antes la card
      decía "cumplís los requisitos" y era verdad a medias. Ahora el freno es la HVI.
    */
    const hecho = requisitosLicencia([
      vuelo({ duration: 195, pic_day_tra: 95, imc_pil: 10, landings: 1 }),
      // Entero nocturno y con cinco aterrizajes: `nightLandingsOf` sólo cuenta los
      // cinco cuando no hay ni una hora diurna en la fila. Con un vuelo mixto contaría
      // uno, y el freno pasaría a ser el de aterrizajes — que fue lo que pasó al
      // escribir esto de la forma obvia.
      vuelo({ duration: 5, pic_night_tra: 5, landings: 5 }),
    ]);
    const freno = loQueFrena(hecho);
    expect(freno?.clave).toBe("instrumentosHvi");
  });
});

describe("ritmoMensual · instrumentos", () => {
  /**
   * El bug que este agregado destapó: no había extractor llamado `instrumentos`, así
   * que `ritmoMensual` devolvía cero y la card contestaba *"no volaste nada de eso en
   * los últimos 3 meses"* con horas cargadas. Decir "no hay ritmo" teniendo ritmo es
   * exactamente lo que este módulo existe para no hacer.
   */
  it("tiene ritmo, y no cero", () => {
    const flights = [
      vuelo({ date: "2026-07-01", imc_pil: 3 }),
      vuelo({ date: "2026-06-15", capota: 3 }),
    ];
    expect(ritmoMensual(flights, "instrumentos", HOY)).toBe(2);
  });

  it("el simulado también cuenta para el ritmo", () => {
    expect(ritmoMensual([vuelo({ date: "2026-07-01", sim_pil_en_inst: 3 })], "instrumentos", HOY)).toBe(1);
  });

  it("el dial de la HVI proyecta con el mismo ritmo que el de la PCA", () => {
    // Son las mismas horas: lo que cambia entre los dos es el tope, y un tope no tiene
    // ritmo. Sin el alias, el dial de la HVI diría siempre que no hay de dónde proyectar.
    const flights = [vuelo({ date: "2026-07-01", imc_pil: 6 })];
    expect(ritmoMensual(flights, "instrumentosHvi", HOY)).toBe(
      ritmoMensual(flights, "instrumentos", HOY)
    );
    expect(ritmoMensual(flights, "instrumentosHvi", HOY)).toBe(2);
  });

  it("una clave que no existe sigue dando cero", () => {
    expect(ritmoMensual([vuelo({ duration: 9 })], "inventada", HOY)).toBe(0);
  });
});
