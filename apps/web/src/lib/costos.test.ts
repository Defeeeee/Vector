import { describe, expect, it } from "vitest";
import type { Flight, Transaction } from "@/types";
import { costoDeVuelo, costosPorVuelo, gastoDelMes, pesos, precioPorHoraDe, precioPorMes } from "./costos";

const vuelo = (id: string, date = "2026-08-01", duration = 1): Flight =>
  ({ id, user_id: "u", date, route: "SADM SADM", landings: 1, duration,
     takeoff: "", landing: "", purpose: "VP" }) as Flight;

/** Los cobros se guardan en negativo: el saldo es la suma de las transacciones. */
const cobro = (flight_id: string, neto: number): Transaction =>
  ({ id: `t-${flight_id}`, user_id: "u", flight_id, amount: -neto,
     type: "charge", created_at: "2026-08-01T00:00:00Z" }) as Transaction;

const deposito = (monto: number): Transaction =>
  ({ id: "dep", user_id: "u", amount: monto, type: "deposit",
     created_at: "2026-08-01T00:00:00Z" }) as Transaction;

describe("costosPorVuelo", () => {
  it("toma la magnitud del cobro, que se guarda en negativo", () => {
    expect(costosPorVuelo([cobro("f1", 185000)]).get("f1")).toBe(185000);
  });

  /** Un depósito suma saldo pero no es el costo de ningún vuelo. */
  it("ignora los depósitos", () => {
    const m = costosPorVuelo([deposito(500000), cobro("f1", 185000)]);
    expect(m.size).toBe(1);
    expect(m.get("f1")).toBe(185000);
  });

  it("ignora los cobros sin vuelo asociado", () => {
    const suelto = { ...cobro("x", 1000), flight_id: undefined } as Transaction;
    expect(costosPorVuelo([suelto]).size).toBe(0);
  });
});

describe("costoDeVuelo", () => {
  it("devuelve lo cobrado", () => {
    const costos = costosPorVuelo([cobro("f1", 277500)]);
    expect(costoDeVuelo(vuelo("f1"), costos)).toBe(277500);
  });

  /**
   * En modo `packs` el backend borra la transacción a propósito: el vuelo consume
   * horas, no pesos. Sin transacción no hay costo que mostrar.
   */
  it("sin transacción devuelve null", () => {
    expect(costoDeVuelo(vuelo("f1"), new Map())).toBe(null);
  });

  /**
   * El caso que importa y que se decidió a conciencia: un cobro en cero puede ser
   * una aeronave sin precio cargado —cuatro de las seis de Federico— o un descuento
   * del 100%. Desde acá son indistinguibles, y escribir "$ 0" sobre un vuelo que el
   * piloto pagó es peor que no escribir nada.
   */
  it("un cobro en cero se trata como 'no sé', no como 'gratis'", () => {
    const costos = costosPorVuelo([cobro("f1", 0)]);
    expect(costoDeVuelo(vuelo("f1"), costos)).toBe(null);
  });
});

describe("gastoDelMes", () => {
  const flights = [
    vuelo("f1", "2026-08-03", 1.5),
    vuelo("f2", "2026-08-20", 2),
    vuelo("f3", "2026-07-28", 1),
  ];
  const costos = costosPorVuelo([cobro("f1", 100), cobro("f2", 200), cobro("f3", 999)]);

  it("suma sólo los vuelos del mes", () => {
    expect(gastoDelMes(flights, costos, "2026-08")).toEqual({ pesos: 300, vuelos: 2, horas: 3.5 });
  });

  /**
   * Se agrupa por la fecha del **vuelo**, no por `created_at` de la transacción.
   * Un vuelo de julio anotado en agosto —lo que pasa cuando alguien se pone al día
   * con la bitácora— caería en el mes equivocado y haría mentir a los dos meses.
   */
  it("usa la fecha del vuelo y no la de la transacción", () => {
    // `cobro` fecha todas las transacciones en agosto; f3 se voló en julio.
    expect(gastoDelMes(flights, costos, "2026-07").pesos).toBe(999);
  });

  it("no cuenta los vuelos sin costo", () => {
    const parcial = costosPorVuelo([cobro("f1", 100)]);
    expect(gastoDelMes(flights, parcial, "2026-08")).toEqual({ pesos: 100, vuelos: 1, horas: 1.5 });
  });

  it("un mes sin vuelos da cero", () => {
    expect(gastoDelMes(flights, costos, "2026-01")).toEqual({ pesos: 0, vuelos: 0, horas: 0 });
  });
});

describe("precioPorHoraDe", () => {
  /** Del cobro y la duración: es el precio que se pagó, no el que rige hoy. */
  it("deriva el precio histórico del cobro", () => {
    const costos = costosPorVuelo([cobro("f1", 277500)]);
    expect(precioPorHoraDe(vuelo("f1", "2026-08-01", 1.5), costos)).toBe(185000);
  });

  it("sin costo o sin duración devuelve null", () => {
    expect(precioPorHoraDe(vuelo("f1"), new Map())).toBe(null);
    const costos = costosPorVuelo([cobro("f1", 100)]);
    expect(precioPorHoraDe(vuelo("f1", "2026-08-01", 0), costos)).toBe(null);
  });
});

describe("pesos", () => {
  it("separa los miles y no muestra centavos", () => {
    expect(pesos(185000)).toBe("$ 185.000");
    expect(pesos(277499.6)).toBe("$ 277.500");
  });
});

describe("precioPorMes", () => {
  const flights = [
    vuelo("f1", "2026-07-10", 1),
    vuelo("f2", "2026-08-05", 2),
    vuelo("f3", "2026-08-20", 1),
  ];

  it("devuelve la serie ordenada por mes", () => {
    const costos = costosPorVuelo([cobro("f1", 150000), cobro("f2", 370000), cobro("f3", 185000)]);
    const serie = precioPorMes(flights, costos);
    expect(serie.map((s) => s.mes)).toEqual(["2026-07", "2026-08"]);
    expect(serie[0].porHora).toBe(150000);
    // (370000 + 185000) / 3 h = 185000: el aumento de la escuela, visible.
    expect(serie[1].porHora).toBe(185000);
  });

  /**
   * Ponderado por horas, no promedio de vuelos. Un vuelo corto en el avión caro no
   * puede mover el mes tanto como uno largo en el barato.
   */
  it("pondera por horas y no por cantidad de vuelos", () => {
    const f = [vuelo("a", "2026-08-01", 0.3), vuelo("b", "2026-08-02", 3)];
    // 0,3 h a 1.000.000/h y 3 h a 100.000/h
    const costos = costosPorVuelo([cobro("a", 300000), cobro("b", 300000)]);
    // Ponderado: 600000 / 3,3 = 181.818. Un promedio simple habría dado 550.000.
    expect(precioPorMes(f, costos)[0].porHora).toBeCloseTo(181818, 0);
  });

  /** Un mes sin cobros no es un mes a $0: metido como cero hundiría el gráfico. */
  it("omite los meses sin cobros en vez de ponerlos en cero", () => {
    const costos = costosPorVuelo([cobro("f2", 370000)]);
    expect(precioPorMes(flights, costos).map((s) => s.mes)).toEqual(["2026-08"]);
  });

  it("ignora los vuelos de duración cero", () => {
    const f = [vuelo("z", "2026-08-01", 0)];
    expect(precioPorMes(f, costosPorVuelo([cobro("z", 1000)]))).toEqual([]);
  });
});
