import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { canalesDeLlamada, getAirport } from "./airports";
import { bandaDeCorredor, codigoVfr, corredoresVfr, largoNm, puntosVfr, sectoresVfr } from "./corredores-vfr";
import { distanciaAlBorde } from "./espacios-aereos";
import { espaciosAereos, torreDe } from "./espacios-aereos-servidor";
import { dependenciasDeRuta, type RadioDeAerodromo } from "./firs";

const texto = fs.readFileSync(path.join(process.cwd(), "src", "data", "aip", "ENR-3.3-BAIRES.txt"), "utf8");
const corredores = corredoresVfr(texto);
const sectores = sectoresVfr(texto);

describe("los corredores VFR de ENR 3.3 (TMA Baires)", () => {
  it("son los once de la lista, con sus nombres", () => {
    expect(corredores.map((c) => c.numero)).toEqual(["1", "2", "3", "6", "9", "10", "11", "13", "15", "16", "17"]);
    expect(corredores.find((c) => c.numero === "2")?.nombre).toBe("AERÓDROMO ISLA MARTÍN GARCÍA - ESTACIÓN BENAVIDEZ");
  });

  /* Contra la columna de distancias de la misma tabla: un punto mal leído cambia el largo. */
  it("los largos coinciden con la tabla del AIP", () => {
    const tabla: Record<string, number> = { "2": 25.97, "9": 8.1, "10": 10.65, "11": 6.15, "13": 20.87, "16": 33.7 };
    for (const [n, nm] of Object.entries(tabla)) expect(largoNm(corredores.find((c) => c.numero === n)!), `Nº ${n}`).toBeCloseTo(nm, 0);
  });

  it("los puntos se escriben en la ruta por su nombre", () => {
    expect(codigoVfr("ESTACIÓN BENAVIDEZ")).toBe("BENAVIDEZ");
    expect(codigoVfr("DIQUE LUJÁN")).toBe("DIQUELUJAN");
    const p = puntosVfr(corredores);
    expect(p.get("BENAVIDEZ")).toMatchObject({ lat: expect.closeTo(-34.409, 2) });
    expect(p.has("MAT")).toBe(false); // "ATZ MAT" es un aeródromo
    expect([...p.keys()].some((k) => k.startsWith("DEPARTAMENTO"))).toBe(false);
  });

  it("los sectores Escuela de Morón y de San Fernando", () => {
    expect(sectores.map((s) => [s.nombre, s.techoFt, s.informacion])).toEqual([
      ["Sector VFR Escuela de Morón", 2000, "ACC EZE"],
      ["Sector VFR Escuela de San Fernando", 1000, "TWR AER"],
    ]);
  });
});

describe("la franja de cada corredor", () => {
  const { espacios } = espaciosAereos();
  const ctrs = espacios.filter((e) => e.tipo === "CTR").map((e) => e.poligono);
  const borde = (c: (typeof corredores)[number], p: { lat: number; lon: number }) =>
    distanciaAlBorde(bandaDeCorredor(c, ctrs).map(([lat, lon]) => ({ lat, lon })), p);

  it("fuera de una CTR, 2500 m a cada lado del eje", () => {
    const n13 = corredores.find((c) => c.numero === "13")!; // Capilla del Señor – Dique Luján, fuera de la CTR al oeste
    const medio = { lat: (n13.eje[0].lat + n13.eje[1].lat) / 2, lon: (n13.eje[0].lon + n13.eje[1].lon) / 2 };
    expect(borde(n13, medio)).toBeCloseTo(2500 / 1852, 1);
  });

  it("el Nº 2 dentro de la CTR Aeroparque: 300 m del lado sur", () => {
    const n2 = corredores.find((c) => c.numero === "2")!;
    // Cerca de Benavídez, adentro de la CTR.
    const p = { lat: n2.eje[1].lat + (n2.eje[0].lat - n2.eje[1].lat) * 0.15, lon: n2.eje[1].lon + (n2.eje[0].lon - n2.eje[1].lon) * 0.15 };
    expect(borde(n2, p)).toBeCloseTo(300 / 1852, 1);
  });
});

describe("con quién hablás por un corredor", () => {
  /*
    Federico, 2026-11-03: "en el vuelo SADF MGI no hablo con aeroparque". Por el Corredor VFR
    Nº 2 (SADF AD 2.22, ENR 3.3) es clase G aunque cruce la CTR Aeroparque, hasta 1.000 ft.
  */
  const { espacios, firs, vfr } = espaciosAereos();
  const canales = canalesDeLlamada();
  const radio = (c: string): RadioDeAerodromo => {
    const ad = getAirport(c)!;
    const x = canales.get(ad.local ?? "");
    return { controlado: ad.madhel?.controlled ?? null, llamada: x?.mhz ?? [], fuenteLlamada: x?.fuente, torre: torreDe(ad.icao, "ATZ") };
  };
  const radios = new Map([["SADF", radio("SADF")], ["SAAK", radio("SAAK")]]);
  const sadf = getAirport("SADF")!;
  const saak = getAirport("SAAK")!;
  const ben = puntosVfr(vfr.corredores).get("BENAVIDEZ")!;
  const ruta = [
    { lat: sadf.lat!, lon: sadf.lon!, codigo: "SADF" },
    { lat: ben.lat, lon: ben.lon, codigo: "BENAVIDEZ" },
    { lat: saak.lat!, lon: saak.lon!, codigo: "SAAK" },
  ];

  it("a 1.000 ft: torre de San Fernando, corredor (clase G) y el canal de Martín García, sin Aeroparque", () => {
    const cambios = dependenciasDeRuta(ruta, 1000, espacios, firs, radios, false, vfr);
    expect(cambios.some((c) => c.dependencia.donde === "Corredor VFR Nº 2")).toBe(true);
    expect(cambios.some((c) => /Aeroparque/i.test(c.dependencia.distintivo))).toBe(false);
    expect(cambios[cambios.length - 1].dependencia.mhz).toEqual(["122.50"]);
  });

  it("a 1.500 ft, dentro de la CTR el corredor ya no alcanza: Aeroparque", () => {
    const cambios = dependenciasDeRuta(ruta, 1500, espacios, firs, radios, false, vfr);
    expect(cambios.some((c) => /Aeroparque/i.test(c.dependencia.distintivo))).toBe(true);
  });
});
