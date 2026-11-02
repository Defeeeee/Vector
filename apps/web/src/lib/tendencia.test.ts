import { describe, expect, it } from "vitest";
import type { Flight } from "@/types";
import { horasAcumuladas, horasPorMes, sumarMeses } from "./tendencia";

function vuelo(date: string, duration: number): Flight {
  return {
    id: `${date}-${duration}`,
    user_id: "u",
    date,
    route: "SADF-SADF",
    landings: 1,
    duration,
    takeoff: `${date}T12:00:00Z`,
    landing: `${date}T13:00:00Z`,
    purpose: "Local",
  };
}

describe("sumarMeses", () => {
  it("cruza el año para los dos lados", () => {
    expect(sumarMeses("2026-01", -1)).toBe("2025-12");
    expect(sumarMeses("2025-12", 1)).toBe("2026-01");
    expect(sumarMeses("2026-09", -5)).toBe("2026-04");
    expect(sumarMeses("2026-02", -14)).toBe("2024-12");
  });
});

describe("horasPorMes", () => {
  it("no pierde meses un 31", () => {
    // El caso que rompía el cálculo viejo: con `setMonth` sobre el 31 de octubre,
    // junio y septiembre se corrían al mes siguiente y desaparecían del gráfico.
    expect(horasPorMes([], "2026-10-31").map((m) => m.name)).toEqual([
      "May", "Jun", "Jul", "Ago", "Sep", "Oct",
    ]);
  });

  it("cruza el año sin repetir ni saltear", () => {
    expect(horasPorMes([], "2026-02-15").map((m) => m.name)).toEqual([
      "Sep", "Oct", "Nov", "Dic", "Ene", "Feb",
    ]);
  });

  it("suma por mes e ignora lo que queda fuera de la ventana", () => {
    const serie = horasPorMes(
      [vuelo("2026-09-01", 1.2), vuelo("2026-09-20", 0.8), vuelo("2026-07-10", 1.5), vuelo("2025-09-10", 9)],
      "2026-09-22"
    );
    expect(serie).toEqual([
      { name: "Abr", hours: 0 },
      { name: "May", hours: 0 },
      { name: "Jun", hours: 0 },
      { name: "Jul", hours: 1.5 },
      { name: "Ago", hours: 0 },
      { name: "Sep", hours: 2 },
    ]);
  });
});

describe("horasAcumuladas", () => {
  it("sin vuelos no hay curva", () => {
    expect(horasAcumuladas([], "2026-09-22", 500)).toEqual([]);
  });

  it("arranca desde las horas de apertura y no deja huecos", () => {
    const puntos = horasAcumuladas([vuelo("2026-06-05", 1), vuelo("2026-08-10", 2)], "2026-09-22", 100);
    expect(puntos).toEqual([
      { date: "Jun 26", total: 101, monthHours: 1 },
      { date: "Jul 26", total: 101, monthHours: 0 },
      { date: "Ago 26", total: 103, monthHours: 2 },
      { date: "Sep 26", total: 103, monthHours: 0 },
    ]);
  });

  it("termina con el total de la carrera", () => {
    const vuelos = [vuelo("2025-11-03", 1.3), vuelo("2026-01-20", 2.1), vuelo("2026-09-02", 0.6)];
    const puntos = horasAcumuladas(vuelos, "2026-09-22", 10);
    expect(puntos[puntos.length - 1].total).toBe(14);
    expect(puntos[0].date).toBe("Nov 25");
  });
});
