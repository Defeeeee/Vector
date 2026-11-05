import { describe, expect, it } from "vitest";
import { alcanceDelPack, horasQueAlcanzaElSaldo } from "./pack-adelante";

describe("hasta cuándo alcanza el pack", () => {
  it("al ritmo de los últimos 30 días", () => {
    // 6,5 h a 3,9 h por mes son 50 días.
    expect(alcanceDelPack(6.5, 3.9, "2026-11-05")).toEqual({ fecha: "2026-12-25", ritmoMensual: 3.9, poco: false });
  });

  it("sin vuelos en 30 días no estima: no saber no es 'nunca se acaba'", () => {
    expect(alcanceDelPack(6.5, 0, "2026-11-05").fecha).toBeNull();
  });

  it("avisa cuando queda menos de una hora, y uno vacío no tiene fecha", () => {
    expect(alcanceDelPack(0.8, 4, "2026-11-05").poco).toBe(true);
    expect(alcanceDelPack(0, 4, "2026-11-05")).toMatchObject({ fecha: null, poco: true });
  });
});

describe("para cuántas horas alcanza el saldo", () => {
  it("al precio por hora del mes", () => {
    expect(horasQueAlcanzaElSaldo(184_500, 30_000)).toBeCloseTo(6.15, 2);
  });
  it("sin precio, o con saldo en contra, no se sabe", () => {
    expect(horasQueAlcanzaElSaldo(184_500, null)).toBeNull();
    expect(horasQueAlcanzaElSaldo(-5000, 30_000)).toBeNull();
  });
});
