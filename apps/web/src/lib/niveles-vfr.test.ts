import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parsearNivelesVfr } from "../../scripts/niveles-vfr-parse.mjs";
import tabla from "@/data/niveles-vfr.json";
import { NIVELES_VFR, esNivelVfr, marcaVfr, nivelDeVuelo, semicirculo } from "./niveles-vfr";
import { altitudesPorDefecto, vientosPorAltitud } from "./vientos-por-altitud";

const texto = fs.readFileSync(path.join(process.cwd(), "src/data/aip/ENR-1.7.txt"), "utf8");
const leida = parsearNivelesVfr(texto);

describe("la tabla sale del texto de la AIP ENR 1.7 (invariante 12)", () => {
  it("columna 2: 15, 35, 55, 75, 95, 115… (FL ×100)", () => {
    expect(leida.col2.slice(0, 6)).toEqual([1500, 3500, 5500, 7500, 9500, 11500]);
  });
  it("columna 4: 5, 25, 45, 65, 85, 105…", () => {
    expect(leida.col4.slice(0, 6)).toEqual([500, 2500, 4500, 6500, 8500, 10500]);
  });
  it("FL 105 es 10.500 ft: la errata del original (20500) no entra", () => {
    expect(texto).toContain("105  20500");
    expect(leida.col4).toContain(10500);
    expect(leida.col4).not.toContain(20500);
  });
  it("lo que usa la app es exactamente lo que dice el texto, y al revés", () => {
    expect(tabla.col2).toEqual(leida.col2);
    expect(tabla.col4).toEqual(leida.col4);
    expect(NIVELES_VFR.de000a179).toEqual(leida.col2);
    expect(NIVELES_VFR.de180a359).toEqual(leida.col4);
  });
  it("cada nivel de la tabla está en el texto, en su columna (FL o pies)", () => {
    // Las filas del texto: 4 triples (FL, pies, metros); la columna 2 es el segundo triple.
    const filas = texto
      .split("\n")
      .map((l) => l.trim().split(/\s+/))
      .filter((t) => (t.length === 12 || t.length === 9) && t.every((x) => /^(-|\d+)$/.test(x)));
    for (const a of tabla.col2) expect(filas.some((t) => t[3] === String(a / 100) || (t[3] === "-" && t[4] === String(a)))).toBe(true);
    for (const a of tabla.col4.filter((x) => x !== 500)) expect(filas.some((t) => t.length === 12 && (t[9] === String(a / 100) || (t[9] === "-" && t[10] === String(a))))).toBe(true);
    expect(filas.some((t) => t[9] === "-" && t[10] === "500")).toBe(true);
  });
  it("ningún nivel de una columna está en la otra", () => {
    expect(tabla.col2.filter((a) => tabla.col4.includes(a))).toEqual([]);
  });
  it("si el texto cambia de forma, falla en vez de quedar vacío", () => {
    expect(parsearNivelesVfr("nada").col2).toEqual([]);
    expect(leida.col2.length).toBeGreaterThanOrEqual(10);
    expect(leida.col4.length).toBeGreaterThanOrEqual(10);
  });
});

describe("semicírculo y esNivelVfr", () => {
  it("bordes: 0, 179, 180, 359, 360", () => {
    expect(semicirculo(0)).toBe("000-179");
    expect(semicirculo(179)).toBe("000-179");
    expect(semicirculo(179.9)).toBe("000-179");
    expect(semicirculo(180)).toBe("180-359");
    expect(semicirculo(359)).toBe("180-359");
    expect(semicirculo(360)).toBe("000-179");
    expect(semicirculo(-1)).toBe("180-359");
  });
  it("al este (col. 2) valen 3.500 y 5.500, no 2.500 ni 4.500; al oeste al revés", () => {
    expect(esNivelVfr(3500, 90)).toBe(true);
    expect(esNivelVfr(4500, 90)).toBe(false);
    expect(esNivelVfr(4500, 270)).toBe(true);
    expect(esNivelVfr(3500, 270)).toBe(false);
  });
  it("en el borde 179/180 cambia de columna", () => {
    expect(esNivelVfr(5500, 179)).toBe(true);
    expect(esNivelVfr(5500, 180)).toBe(false);
    expect(esNivelVfr(4500, 359)).toBe(true);
    expect(esNivelVfr(4500, 360)).toBe(false);
  });
  it("una altitud que no es de ninguna columna no es nivel", () => {
    expect(esNivelVfr(4000, 90)).toBe(false);
    expect(esNivelVfr(4000, 270)).toBe(false);
  });
  it("FL", () => {
    expect(nivelDeVuelo(3500)).toBe("FL035");
    expect(nivelDeVuelo(9500)).toBe("FL095");
  });
});

describe("marcaVfr", () => {
  it("convierte a magnética con la variación: 175 verdadero con 10 W es 185 magnético", () => {
    // Verdadero 175 → col. 2; magnético 185 → col. 4.
    expect(marcaVfr(3500, [175], 0, 0).coinciden).toBe(1);
    expect(marcaVfr(3500, [175], 10, 0).coinciden).toBe(0);
    expect(marcaVfr(4500, [175], 10, 0).coinciden).toBe(1);
  });
  it("una ruta con tramos en los dos semicírculos: cuenta en cuántos coincide", () => {
    const cursos = [90, 100, 270]; // ida al este, y un tramo de vuelta
    expect(marcaVfr(3500, cursos, 0, 0)).toMatchObject({ tramos: 3, coinciden: 2 });
    expect(marcaVfr(4500, cursos, 0, 0)).toMatchObject({ tramos: 3, coinciden: 1 });
    expect(marcaVfr(4000, cursos, 0, 0).coinciden).toBe(0);
  });
  it("sin variación no se afirma nada (invariante 2)", () => {
    expect(marcaVfr(3500, [90], null, 0).coinciden).toBeNull();
    expect(marcaVfr(3500, [90], undefined, 0).coinciden).toBeNull();
  });
  it("3.000 ft sobre el terreno: desde 3.000 es obligatorio, debajo no", () => {
    expect(marcaVfr(2500, [90], 0, 0).obligatorio).toBe(false);
    expect(marcaVfr(3000, [90], 0, 0).obligatorio).toBe(true);
    expect(marcaVfr(3500, [90], 0, 0).obligatorio).toBe(true);
  });
  it("aeródromo elevado: 5.500 con 3.000 ft de elevación es 2.500 sobre el terreno", () => {
    expect(marcaVfr(5500, [90], 0, 3000).obligatorio).toBe(false);
    expect(marcaVfr(6500, [90], 0, 3000).obligatorio).toBe(true);
    expect(marcaVfr(5500, [90], 0, 0).obligatorio).toBe(true);
  });
  it("sin elevación no se sabe", () => {
    expect(marcaVfr(5500, [90], 0, null).obligatorio).toBeNull();
  });
});

describe("en vientosPorAltitud", () => {
  const altitudes = altitudesPorDefecto();
  const tramos = [{ distanciaNm: 100, cursoT: 90 }];
  const calma = altitudes.map(() => [{ direccion: 0, velocidad: 0 }]);
  const base = { tramos, tasKt: 100, altitudesFt: altitudes, vientos: calma };

  it("cada fila lleva su marca", () => {
    const f = vientosPorAltitud({ ...base, variacionW: 0, elevacionMaxFt: 100 });
    const en = (a: number) => f.find((x) => x.altitudFt === a)!.vfr!;
    expect(en(3500).coinciden).toBe(1); // al este, col. 2
    expect(en(4500).coinciden).toBe(0);
    expect(en(2500).obligatorio).toBe(false);
    expect(en(3500).obligatorio).toBe(true);
  });
  it("la marca no cambia cuál es la de menos tiempo", () => {
    const con = vientosPorAltitud({ ...base, variacionW: 0, elevacionMaxFt: 100 });
    const sin = vientosPorAltitud(base);
    expect(con.map((f) => f.esMejor)).toEqual(sin.map((f) => f.esMejor));
    expect(con.map((f) => f.datos?.minutos)).toEqual(sin.map((f) => f.datos?.minutos));
  });
});
