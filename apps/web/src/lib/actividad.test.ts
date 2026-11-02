import { describe, expect, it } from "vitest";
import type { Flight } from "@/types";
import { compararConElPromedio, lunesDe, racha } from "./actividad";

const vuelo = (date: string, duration = 1): Flight =>
  ({ id: date + Math.random(), user_id: "u", date, route: "SADM SADM", landings: 1,
     duration, takeoff: "", landing: "", purpose: "VP" }) as Flight;

describe("lunesDe", () => {
  // 2026-08-17 es lunes.
  it("un lunes se devuelve a sí mismo", () => {
    expect(lunesDe("2026-08-17")).toBe("2026-08-17");
  });

  it("el resto de la semana cae en su lunes", () => {
    expect(lunesDe("2026-08-19")).toBe("2026-08-17");
    expect(lunesDe("2026-08-22")).toBe("2026-08-17");
  });

  /** `getUTCDay` da 0 para domingo: sin la corrección, el domingo saltaría una semana. */
  it("el domingo pertenece a la semana que termina, no a la que empieza", () => {
    expect(lunesDe("2026-08-23")).toBe("2026-08-17");
  });

  it("cruza el fin de mes y el fin de año", () => {
    expect(lunesDe("2026-09-01")).toBe("2026-08-31");
    expect(lunesDe("2027-01-01")).toBe("2026-12-28");
  });
});

describe("racha", () => {
  const HOY = "2026-08-19"; // miércoles

  it("cuenta semanas consecutivas hacia atrás", () => {
    const f = [vuelo("2026-08-18"), vuelo("2026-08-11"), vuelo("2026-08-04")];
    expect(racha(f, HOY)).toEqual({ semanas: 3, incluyeEstaSemana: true });
  });

  /**
   * El caso que decide si el número sirve o es un reproche: es miércoles y todavía
   * no volaste. La racha viene de la semana pasada y sigue viva — quedan días.
   */
  it("no se corta si esta semana todavía no volaste", () => {
    const f = [vuelo("2026-08-11"), vuelo("2026-08-04")];
    expect(racha(f, HOY)).toEqual({ semanas: 2, incluyeEstaSemana: false });
  });

  it("un hueco corta la racha", () => {
    const f = [vuelo("2026-08-18"), vuelo("2026-08-04")];
    expect(racha(f, HOY).semanas).toBe(1);
  });

  it("varios vuelos en la misma semana cuentan una vez", () => {
    const f = [vuelo("2026-08-17"), vuelo("2026-08-18"), vuelo("2026-08-19")];
    expect(racha(f, HOY).semanas).toBe(1);
  });

  it("sin vuelos no hay racha", () => {
    expect(racha([], HOY)).toEqual({ semanas: 0, incluyeEstaSemana: false });
  });

  /** Una racha vieja que ya se cortó no se cuenta como viva. */
  it("vuelos de hace meses no arman racha", () => {
    expect(racha([vuelo("2026-03-04")], HOY).semanas).toBe(0);
  });
});

describe("compararConElPromedio", () => {
  const HOY = "2026-08-19";

  it("compara este mes contra el promedio de los seis anteriores", () => {
    const f = [
      vuelo("2026-08-05", 8),
      vuelo("2026-07-10", 6), vuelo("2026-06-10", 6),
      vuelo("2026-05-10", 6), vuelo("2026-04-10", 6),
      vuelo("2026-03-10", 6), vuelo("2026-02-10", 6),
    ];
    const r = compararConElPromedio(f, HOY);
    expect(r.horas).toBe(8);
    expect(r.promedio).toBe(6);
    expect(r.diferencia).toBe(2);
    expect(r.meses).toBe(6);
  });

  /**
   * Los meses sin volar cuentan como cero. Promediar sólo los meses con actividad
   * daría una vara artificialmente alta: quien voló en marzo y en julio no tiene un
   * promedio de sus dos mejores meses.
   */
  it("los meses sin volar cuentan como cero", () => {
    const f = [vuelo("2026-08-05", 6), vuelo("2026-07-10", 6)];
    // 6 horas repartidas en seis meses = 1 de promedio.
    expect(compararConElPromedio(f, HOY).promedio).toBe(1);
  });

  /** El mes en curso no puede entrar en su propio promedio. */
  it("no se compara consigo mismo", () => {
    const f = [vuelo("2026-08-05", 10), vuelo("2026-07-10", 2)];
    const r = compararConElPromedio(f, HOY);
    expect(r.promedio).toBeCloseTo(2 / 6, 5);
  });

  /**
   * Sin historia no hay comparación: un promedio de ceros diría "vas 8 horas mejor
   * que siempre" en el primer mes de uso de la app.
   */
  it("sin meses anteriores no compara", () => {
    const r = compararConElPromedio([vuelo("2026-08-05", 8)], HOY);
    expect(r).toEqual({ horas: 8, promedio: 0, meses: 0, diferencia: 0 });
  });

  it("cruza el fin de año hacia atrás", () => {
    const f = [vuelo("2026-01-10", 4), vuelo("2025-12-10", 6)];
    const r = compararConElPromedio(f, "2026-01-15");
    expect(r.horas).toBe(4);
    expect(r.promedio).toBe(1); // 6 horas / 6 meses
  });
});
