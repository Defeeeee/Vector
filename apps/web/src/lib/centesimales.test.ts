import { describe, expect, it } from "vitest";
import { CUADRO_CENTESIMAL, decimasDeMinutos, formatoCentesimal, horasCentesimales, minutosEntre } from "./centesimales";
import { calculateFlightDuration } from "./utils";

const dos = (n: number) => String(n).padStart(2, "0");

describe("cuadro de horas centesimales", () => {
  it("es el del pie de la hoja del libro, sin huecos entre 1 y 60", () => {
    expect(CUADRO_CENTESIMAL.map((f) => [f.desde, f.hasta, f.decimas])).toEqual([
      [1, 2, 0],
      [3, 8, 1],
      [9, 14, 2],
      [15, 20, 3],
      [21, 26, 4],
      [27, 33, 5],
      [34, 39, 6],
      [40, 45, 7],
      [46, 51, 8],
      [52, 57, 9],
      [58, 60, 10],
    ]);
    for (let i = 1; i < CUADRO_CENTESIMAL.length; i++) {
      expect(CUADRO_CENTESIMAL[i].desde).toBe(CUADRO_CENTESIMAL[i - 1].hasta + 1);
    }
  });

  it("dice lo mismo que el cálculo de cada vuelo de Vector, minuto a minuto", () => {
    for (let total = 0; total <= 5 * 60; total++) {
      const llegada = `${dos(Math.floor(total / 60))}:${dos(total % 60)}`;
      expect(horasCentesimales(total)).toBe(calculateFlightDuration("00:00", llegada));
    }
  });

  it("convierte los casos de todos los días", () => {
    expect(decimasDeMinutos(10)).toBe(2);
    expect(horasCentesimales(70)).toBe(1.2); // 1 h 10 min
    expect(horasCentesimales(45)).toBe(0.7);
    expect(horasCentesimales(58)).toBe(1);
    expect(horasCentesimales(2)).toBe(0);
  });

  it("cuenta el tiempo entre dos horas, aunque cruce la medianoche", () => {
    expect(minutosEntre("13:05", "14:17")).toBe(72);
    expect(minutosEntre("23:30", "00:20")).toBe(50);
    expect(minutosEntre("25:00", "10:00")).toBeNull();
    expect(minutosEntre("", "10:00")).toBeNull();
  });

  it("escribe con coma, como el libro", () => {
    expect(formatoCentesimal(1.2)).toBe("1,2");
    expect(formatoCentesimal(0)).toBe("0,0");
  });
});
