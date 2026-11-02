/**
 * Un vuelo programado no es una entrada de bitácora: nada lo suma, nada lo exporta,
 * ningún organismo lo lee. Por eso lo único que puede salir mal acá es *cuándo se
 * pregunta*, y son dos errores con signos opuestos:
 *
 * - preguntar por un vuelo que el piloto ya cargó, que termina en un duplicado
 *   dentro de un documento legal;
 * - no preguntar por uno que falta, que deja un agujero en el libro.
 *
 * El resto de los casos son de fechas. Este repo ya pagó dos bugs de hidratación
 * por construir un `Date` a partir de un "YYYY-MM-DD" —medianoche UTC leída en
 * UTC-3 cae el día anterior—, así que acá se compara texto contra texto y `todayIso`
 * entra siempre por parámetro.
 */

import { describe, expect, it } from "vitest";
import type { Flight, PlannedFlight } from "@/types";
import {
  correrMes,
  esMesIso,
  estadoProgramado,
  horasDelMes,
  mesDe,
  pendientesDeConfirmar,
  prefillQuery,
  resumenPendientes,
  sumarDias,
} from "./planned-flights";

const HOY = "2026-08-14";

const plan = (over: Partial<PlannedFlight>): PlannedFlight =>
  ({ id: "p1", user_id: "u", date: HOY, status: "programado", ...over }) as PlannedFlight;

const vuelo = (over: Partial<Flight>): Flight =>
  ({ id: "f1", user_id: "u", date: HOY, route: "SADF SADR", ...over }) as Flight;

describe("estadoProgramado", () => {
  it("un vuelo de mañana es futuro", () => {
    expect(estadoProgramado(plan({ date: "2026-08-15" }), HOY)).toBe("futuro");
  });

  /**
   * El caso que evita que la tarjeta se vuelva ruido. Un vuelo programado para hoy
   * todavía no ocurrió: preguntarle a las 9 de la mañana si ya voló enseña a
   * descartar la tarjeta sin leerla, y a partir de ahí no sirve para nada.
   */
  it("un vuelo de hoy NO es pendiente: el día no terminó", () => {
    expect(estadoProgramado(plan({ date: HOY }), HOY)).toBe("hoy");
  });

  it("un vuelo de ayer sí es pendiente", () => {
    expect(estadoProgramado(plan({ date: "2026-08-13" }), HOY)).toBe("pendiente");
  });

  it("el estado guardado gana sobre la fecha", () => {
    expect(estadoProgramado(plan({ date: "2026-08-01", status: "completado" }), HOY)).toBe("completado");
    expect(estadoProgramado(plan({ date: "2026-08-01", status: "descartado" }), HOY)).toBe("descartado");
  });

  it("postergado hacia adelante no pregunta; vencido el mismo día sí", () => {
    const base = { date: "2026-08-10" };
    expect(estadoProgramado(plan({ ...base, postponed_until: "2026-08-20" }), HOY)).toBe("pospuesto");
    // El postergado vence *el* día, no *después*: si pidió "hasta el 14", el 14 se
    // vuelve a preguntar.
    expect(estadoProgramado(plan({ ...base, postponed_until: HOY }), HOY)).toBe("pendiente");
  });

  it("a los 30 días sigue preguntando y a los 31 se da por vencido", () => {
    expect(estadoProgramado(plan({ date: "2026-07-15" }), HOY)).toBe("pendiente");
    expect(estadoProgramado(plan({ date: "2026-07-14" }), HOY)).toBe("vencido");
  });

  /**
   * Cruzar un fin de mes es donde una resta de fechas mal hecha se rompe, y además
   * es el caso real: se vuela un fin de semana y se entra a la app el lunes.
   */
  it("cruza el fin de mes sin perderse", () => {
    expect(estadoProgramado(plan({ date: "2026-07-31" }), "2026-08-01")).toBe("pendiente");
  });
});

describe("pendientesDeConfirmar", () => {
  it("deja sólo los pendientes, del más viejo al más nuevo", () => {
    const lista = [
      plan({ id: "nuevo", date: "2026-08-13" }),
      plan({ id: "futuro", date: "2026-08-20" }),
      plan({ id: "viejo", date: "2026-08-05" }),
      plan({ id: "hoy", date: HOY }),
      plan({ id: "cerrado", date: "2026-08-06", status: "completado" }),
      plan({ id: "descartado", date: "2026-08-07", status: "descartado" }),
      plan({ id: "pospuesto", date: "2026-08-08", postponed_until: "2026-09-01" }),
    ];
    expect(pendientesDeConfirmar(lista, HOY).map((p) => p.id)).toEqual(["viejo", "nuevo"]);
  });

  it("sin nada que preguntar devuelve vacío", () => {
    expect(pendientesDeConfirmar([], HOY)).toEqual([]);
  });
});

describe("resumenPendientes", () => {
  it("hasta dos se listan; con tres se colapsa a un link", () => {
    const dos = [plan({ id: "a" }), plan({ id: "b" })];
    expect(resumenPendientes(dos)).toMatchObject({ modo: "lista", total: 2 });

    const tres = [...dos, plan({ id: "c" })];
    const r = resumenPendientes(tres);
    expect(r.modo).toBe("resumen");
    expect(r.total).toBe(3);
    expect(r.visibles).toEqual([]);
  });
});

describe("prefillQuery", () => {
  /**
   * Una clave ausente que se emite igual llega al formulario como la cadena
   * literal "undefined", y para el que la lee es indistinguible de un valor real:
   * queda seleccionada una aeronave que no existe.
   */
  it("no emite claves para lo que el plan no tiene", () => {
    const q = prefillQuery(plan({ id: "p9", date: "2026-08-13" }));
    expect(q).not.toContain("undefined");
    expect(q).not.toContain("aircraft_id");
    expect(q).not.toContain("route");
  });

  it("lleva siempre el id del plan, que es lo que después lo cierra", () => {
    const params = new URLSearchParams(prefillQuery(plan({ id: "p9" })));
    expect(params.get("prefill")).toBe("true");
    expect(params.get("planned_id")).toBe("p9");
  });

  it("una ruta con espacio sobrevive la ida y la vuelta", () => {
    const params = new URLSearchParams(prefillQuery(plan({ route: "SADF SADR" })));
    expect(params.get("route")).toBe("SADF SADR");
  });

  /**
   * Postgres devuelve "12:00:00" para una columna `time`, y un `<input type="time">`
   * con segundos se queda vacío **sin decir nada** — el piloto ve el campo en blanco
   * y cree que la hora nunca se guardó.
   */
  it("recorta los segundos de las horas antes de mandarlas al formulario", () => {
    const params = new URLSearchParams(
      prefillQuery(plan({ takeoff_time: "12:00:00", landing_time: "13:30:00" }))
    );
    expect(params.get("takeoff")).toBe("12:00");
    expect(params.get("landing")).toBe("13:30");
  });

  /**
   * Las horas viajan **en UTC**, sin convertir: el formulario de vuelo guarda UTC y
   * su interruptor local/UTC decide sólo cómo mostrarlas. Convertir acá las movería
   * tres horas y rompería la detección de superposiciones de la auditoría.
   */
  it("no convierte la hora: lo que se guardó en UTC llega en UTC", () => {
    const params = new URLSearchParams(prefillQuery(plan({ takeoff_time: "12:00:00" })));
    expect(params.get("takeoff")).toBe("12:00");
    expect(params.get("takeoff")).not.toBe("09:00");
  });

  it("un plan sin horas no emite las claves", () => {
    const q = prefillQuery(plan({ takeoff_time: null, landing_time: null }));
    expect(q).not.toContain("takeoff");
    expect(q).not.toContain("landing");
  });
});

describe("sumarDias", () => {
  it("cruza fin de mes, fin de año y años bisiestos", () => {
    expect(sumarDias("2026-08-14", 1)).toBe("2026-08-15");
    expect(sumarDias("2026-08-31", 1)).toBe("2026-09-01");
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(sumarDias("2024-02-28", 1)).toBe("2024-02-29");
    expect(sumarDias("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("esMesIso y correrMes", () => {
  it("acepta un mes válido y rechaza el resto", () => {
    expect(esMesIso("2026-08")).toBe(true);
    expect(esMesIso("2026-13")).toBe(false);
    expect(esMesIso("2026-00")).toBe(false);
    expect(esMesIso("2026-8")).toBe(false);
    expect(esMesIso("")).toBe(false);
    expect(esMesIso(undefined)).toBe(false);
  });

  it("cruza el año en las dos direcciones", () => {
    expect(correrMes("2026-01", -1)).toBe("2025-12");
    expect(correrMes("2026-12", 1)).toBe("2027-01");
    expect(correrMes("2026-03", -13)).toBe("2025-02");
  });
});

describe("mesDe", () => {
  const base = { mesIso: "2026-08", todayIso: HOY, planned: [], flights: [] };

  it("siempre son seis semanas de siete días", () => {
    for (const mesIso of ["2026-01", "2026-02", "2024-02", "2026-08", "2026-11"]) {
      const mes = mesDe({ ...base, mesIso });
      expect(mes.semanas).toHaveLength(6);
      expect(mes.semanas.every((s) => s.length === 7)).toBe(true);
    }
  });

  /**
   * La semana arranca el lunes, así que un mes que empieza domingo tiene que poner
   * el día 1 en la **última** columna. Es la trampa clásica de una grilla que
   * asume domingo primero.
   */
  it("un mes que empieza domingo pone el 1 en la última columna", () => {
    // El 1 de noviembre de 2026 cae domingo.
    const mes = mesDe({ ...base, mesIso: "2026-11" });
    const primero = mes.semanas[0][6];
    expect(primero.dia).toBe(1);
    expect(primero.delMes).toBe(true);
  });

  it("marca hoy una sola vez, y ninguna si el mes es otro", () => {
    const esteMes = mesDe(base).semanas.flat().filter((d) => d.esHoy);
    expect(esteMes).toHaveLength(1);
    expect(esteMes[0].iso).toBe(HOY);

    const otroMes = mesDe({ ...base, mesIso: "2026-03" }).semanas.flat().filter((d) => d.esHoy);
    expect(otroMes).toHaveLength(0);
  });

  /**
   * Si los días de relleno se vaciaran, un vuelo del 31 de agosto desaparecería al
   * mirar septiembre y el piloto vería un agujero donde hay un vuelo.
   */
  it("los días de relleno igual llevan sus vuelos", () => {
    const mes = mesDe({
      ...base,
      mesIso: "2026-09",
      flights: [vuelo({ id: "f31", date: "2026-08-31" })],
    });
    const relleno = mes.semanas.flat().find((d) => d.iso === "2026-08-31");
    expect(relleno?.delMes).toBe(false);
    expect(relleno?.flights.map((f) => f.id)).toEqual(["f31"]);
  });

  /**
   * La invariante que sostiene el plan entero: un vuelo real y un plan son cosas
   * distintas, y la grilla no puede confundirlos ni siquiera cuando caen el mismo
   * día.
   */
  it("un vuelo volado nunca se cuenta como programado", () => {
    const mes = mesDe({
      ...base,
      planned: [plan({ id: "p", date: "2026-08-10" })],
      flights: [vuelo({ id: "f", date: "2026-08-10" })],
    });
    const dia = mes.semanas.flat().find((d) => d.iso === "2026-08-10")!;
    expect(dia.planned.map((p) => p.id)).toEqual(["p"]);
    expect(dia.flights.map((f) => f.id)).toEqual(["f"]);
  });

  /**
   * Un plan sin hora es "en algún momento del sábado". Ponerlo primero afirmaría
   * que sale antes que uno de las 07:00, que es información que nadie cargó.
   */
  it("ordena los programados del día por hora, y los sin hora al final", () => {
    const mes = mesDe({
      ...base,
      planned: [
        plan({ id: "sinHora", date: "2026-08-10" }),
        plan({ id: "tarde", date: "2026-08-10", takeoff_time: "18:00:00" }),
        plan({ id: "temprano", date: "2026-08-10", takeoff_time: "07:00:00" }),
      ],
    });
    const dia = mes.semanas.flat().find((d) => d.iso === "2026-08-10")!;
    expect(dia.planned.map((p) => p.id)).toEqual(["temprano", "tarde", "sinHora"]);
  });

  it("no pierde ningún elemento del mes", () => {
    const mes = mesDe({
      ...base,
      planned: [plan({ id: "a", date: "2026-08-03" }), plan({ id: "b", date: "2026-08-28" })],
      flights: [vuelo({ id: "x", date: "2026-08-03" })],
    });
    const dias = mes.semanas.flat();
    expect(dias.flatMap((d) => d.planned).map((p) => p.id).sort()).toEqual(["a", "b"]);
    expect(dias.flatMap((d) => d.flights)).toHaveLength(1);
  });

  /**
   * El total del mes no puede incluir los días de relleno: la grilla arrastra el
   * 31 de julio para que no aparezca un agujero al mirar agosto, pero esas horas
   * son de julio.
   */
  it("las horas del mes ignoran los días de relleno y los programados", () => {
    const mes = mesDe({
      ...base,
      mesIso: "2026-09",
      planned: [plan({ id: "p", date: "2026-09-02" })],
      flights: [
        vuelo({ id: "agosto", date: "2026-08-31", duration: 5 }),
        vuelo({ id: "septiembre", date: "2026-09-02", duration: 1.5 }),
        vuelo({ id: "tambien", date: "2026-09-20", duration: 2 }),
      ],
    });
    expect(horasDelMes(mes.semanas)).toBe(3.5);
  });

  it("un mes sin vuelos da cero", () => {
    expect(horasDelMes(mesDe(base).semanas)).toBe(0);
  });

  it("expone el mes anterior y el siguiente para navegar", () => {
    const mes = mesDe(base);
    expect(mes.anterior).toBe("2026-07");
    expect(mes.siguiente).toBe("2026-09");
    expect(mes.etiqueta).toBe("Agosto 2026");
  });
});
