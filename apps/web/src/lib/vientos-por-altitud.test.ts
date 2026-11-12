import { describe, expect, it } from "vitest";
import {
  altitudesPorDefecto,
  eetDeMinutos,
  tasDeAscenso,
  textoDuracion,
  vientosPorAltitud,
  type TramoRuta,
} from "./vientos-por-altitud";

// Una ruta recta hacia el este: 100 NM, curso 090.
const este: TramoRuta[] = [{ distanciaNm: 100, cursoT: 90 }];
const sinViento = { direccion: 0, velocidad: 0 };
const calma = (n: number) => Array.from({ length: n }, () => sinViento);

describe("altitudesPorDefecto", () => {
  it("1.500 a 9.500 cada 1.000", () => {
    const a = altitudesPorDefecto();
    expect(a[0]).toBe(1500);
    expect(a.at(-1)).toBe(9500);
    expect(a).toHaveLength(9);
  });
  it("suma 500 ft sobre un aeródromo muy bajo, no sobre uno alto", () => {
    expect(altitudesPorDefecto(200)[0]).toBe(700);
    expect(altitudesPorDefecto(1600)[0]).toBe(1500);
  });
});

describe("signo y componentes", () => {
  it("viento del este contra un vuelo al este es de frente (negativo)", () => {
    const [f] = vientosPorAltitud({ tramos: este, tasKt: 100, altitudesFt: [3500], vientos: [[{ direccion: 90, velocidad: 20 }]] });
    expect(f.datos!.colaKt).toBeCloseTo(-20, 5);
    expect(f.datos!.gsKt).toBeCloseTo(80, 3);
    expect(f.datos!.minutos).toBeCloseTo(75, 3);
  });
  it("del oeste es de cola (positivo)", () => {
    const [f] = vientosPorAltitud({ tramos: este, tasKt: 100, altitudesFt: [3500], vientos: [[{ direccion: 270, velocidad: 20 }]] });
    expect(f.datos!.colaKt).toBeCloseTo(20, 5);
    expect(f.datos!.minutos).toBeCloseTo(50, 3);
  });
  it("cruzada: del sur al ir al este viene por la derecha", () => {
    const [f] = vientosPorAltitud({ tramos: este, tasKt: 100, altitudesFt: [3500], vientos: [[{ direccion: 180, velocidad: 15 }]] });
    expect(f.datos!.cruzadaKt).toBeCloseTo(15, 5);
    expect(f.datos!.ladoCruzada).toBe("derecha");
    expect(Math.abs(f.datos!.colaKt)).toBeLessThan(1e-6);
  });
  it("el tiempo es la suma por tramo, no distancia sobre GS promedio", () => {
    const tramos: TramoRuta[] = [{ distanciaNm: 50, cursoT: 90 }, { distanciaNm: 50, cursoT: 270 }];
    const v = [{ direccion: 270, velocidad: 20 }, { direccion: 270, velocidad: 20 }];
    const [f] = vientosPorAltitud({ tramos, tasKt: 100, altitudesFt: [3500], vientos: [v] });
    // 50/120 + 50/80 h = 62,5 min (el promedio ingenuo daría 60).
    expect(f.datos!.minutos).toBeCloseTo(62.5, 3);
  });
  it("combustible con consumo; sin consumo, null", () => {
    const base = { tramos: este, tasKt: 100, altitudesFt: [3500], vientos: [calma(1)] };
    expect(vientosPorAltitud({ ...base, consumoLh: 30 })[0].datos!.litros).toBeCloseTo(30, 5);
    expect(vientosPorAltitud(base)[0].datos!.litros).toBeNull();
  });
});

describe("sin dato", () => {
  it("falta el viento de un tramo: sin dato, no se completa con el otro", () => {
    const tramos: TramoRuta[] = [{ distanciaNm: 50, cursoT: 90 }, { distanciaNm: 50, cursoT: 90 }];
    const [f] = vientosPorAltitud({ tramos, tasKt: 100, altitudesFt: [3500], vientos: [[sinViento, null]] });
    expect(f.datos).toBeNull();
    expect(f.motivo).toBe("viento");
    expect(f.esMejor).toBe(false);
  });
  it("viento que anula el avance", () => {
    const [f] = vientosPorAltitud({ tramos: este, tasKt: 60, altitudesFt: [3500], vientos: [[{ direccion: 90, velocidad: 70 }]] });
    expect(f.motivo).toBe("imposible");
  });
});

describe("la mejor", () => {
  it("menos tiempo; en empate, la más baja", () => {
    const filas = vientosPorAltitud({
      tramos: este,
      tasKt: 100,
      altitudesFt: [2500, 4500, 6500],
      vientos: [[{ direccion: 270, velocidad: 10 }], [{ direccion: 270, velocidad: 25 }], [{ direccion: 270, velocidad: 25 }]],
    });
    expect(filas.map((f) => f.esMejor)).toEqual([false, true, false]);
  });
});

describe("el ascenso", () => {
  const asc = { iasKt: 70, regimenFpm: 500, elevacionFt: 0 };
  it("la TAS de ascenso crece 2 % cada 1.000 ft", () => {
    expect(tasDeAscenso(70, 5000)).toBeCloseTo(77, 5);
  });
  it("subir más alto cuesta tiempo", () => {
    const filas = vientosPorAltitud({ tramos: este, tasKt: 100, altitudesFt: [2500, 8500], vientos: [calma(1), calma(1)], ascenso: asc });
    expect(filas[1].datos!.minutos).toBeGreaterThan(filas[0].datos!.minutos);
    expect(filas[1].datos!.minutosAscenso).toBeCloseTo(17, 5);
    expect(filas[0].datos!.minutosAscenso).toBeCloseTo(5, 5);
  });
  it("sin viento: 5 min a 70*1,025=71,75 kt y el resto a 100", () => {
    const [f] = vientosPorAltitud({ tramos: este, tasKt: 100, altitudesFt: [2500], vientos: [calma(1)], ascenso: asc });
    const dAsc = (71.75 * 5) / 60;
    expect(f.datos!.minutos).toBeCloseTo(5 + ((100 - dAsc) / 100) * 60, 2);
  });
  it("sin ascenso (parámetro ausente) no lo suma", () => {
    const [f] = vientosPorAltitud({ tramos: este, tasKt: 100, altitudesFt: [8500], vientos: [calma(1)] });
    expect(f.datos!.minutos).toBeCloseTo(60, 5);
    expect(f.datos!.minutosAscenso).toBe(0);
  });
  it("la cola arriba puede compensar el ascenso", () => {
    const filas = vientosPorAltitud({
      tramos: este,
      tasKt: 100,
      altitudesFt: [2500, 8500],
      vientos: [[sinViento], [{ direccion: 270, velocidad: 40 }]],
      ascenso: asc,
    });
    expect(filas[1].datos!.minutos).toBeLessThan(filas[0].datos!.minutos);
    expect(filas[1].esMejor).toBe(true);
  });
  it("el ascenso sigue en el tramo siguiente", () => {
    const tramos: TramoRuta[] = [{ distanciaNm: 3, cursoT: 90 }, { distanciaNm: 60, cursoT: 90 }];
    const [f] = vientosPorAltitud({ tramos, tasKt: 100, altitudesFt: [4500], vientos: [calma(2)], ascenso: asc });
    // 9 min a 70*1,045 = 73,15 kt = 10,97 NM recorridas; faltan 52,03 NM a 100 kt.
    expect(f.datos!.minutos).toBeCloseTo(9 + ((63 - 10.9724) / 100) * 60, 1);
  });
  it("ruta corta que no nivela: lo dice y no inventa", () => {
    const corta: TramoRuta[] = [{ distanciaNm: 5, cursoT: 90 }];
    const filas = vientosPorAltitud({ tramos: corta, tasKt: 100, altitudesFt: [1500, 9500], vientos: [calma(1), calma(1)], ascenso: asc });
    expect(filas[0].datos).not.toBeNull();
    expect(filas[1].datos).toBeNull();
    expect(filas[1].motivo).toBe("no-nivela");
  });
  it("parte desde la elevación de la salida", () => {
    const [f] = vientosPorAltitud({ tramos: este, tasKt: 100, altitudesFt: [2500], vientos: [calma(1)], ascenso: { ...asc, elevacionFt: 1000 } });
    expect(f.datos!.minutosAscenso).toBeCloseTo(3, 5);
  });
});

describe("textos", () => {
  it("duración", () => {
    expect(textoDuracion(72)).toBe("1:12");
    expect(eetDeMinutos(72)).toBe("0112");
    expect(eetDeMinutos(5)).toBe("0005");
  });
});
