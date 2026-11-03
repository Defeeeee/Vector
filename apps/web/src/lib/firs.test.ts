import { describe, expect, it } from "vitest";
import { allAirports } from "./airports";
import { contiene } from "./espacios-aereos";
import { espaciosAereos } from "./espacios-aereos-servidor";
import { alNorteDe, dependenciasDeRuta, dependenciasEn, firDe, frecuenciasDeFila, rangoEnPies } from "./firs";

const { espacios, firs, firsDescartadas } = espaciosAereos();
const SAZM = { lat: -37.934, lon: -57.573 };
const SADF = { lat: -34.453, lon: -58.59 };

describe("las FIR de ENR 2.1", () => {
  it("son las cinco, con su centro", () => {
    expect(firsDescartadas).toEqual([]);
    expect(firs.map((f) => f.nombre).sort()).toEqual(["FIR COMODORO RIVADAVIA", "FIR CÓRDOBA", "FIR EZEIZA", "FIR MENDOZA", "FIR RESISTENCIA"]);
    expect(firs.map((f) => f.centro?.distintivo).sort()).toEqual(["COMODORO CENTRO", "CÓRDOBA CENTRO", "EZEIZA CENTRO", "MENDOZA CENTRO", "RESISTENCIA CENTRO"]);
    const eze = firs.find((f) => f.nombre === "FIR EZEIZA")!;
    expect(eze.centro!.sectores).toEqual([
      { nombre: "NORTE", mhz: ["135.50", "134.50"] },
      { nombre: "SUR", mhz: ["125.20", "124.10"] },
    ]);
  });

  /*
    La prueba de que los límites están bien, rodeos por la frontera incluidos: cada aeródromo
    argentino cae en una sola FIR (o, en la costa del río Uruguay, a menos de 10 NM de una).
  */
  it("cada aeródromo argentino cae en una sola FIR", () => {
    const ar = allAirports().filter((a) => a.country === "AR" && a.lat !== undefined && a.lat > -56);
    expect(ar.length).toBeGreaterThan(500);
    const mal = ar.filter((a) => {
      const p = { lat: a.lat!, lon: a.lon! };
      return firs.filter((f) => contiene(f.poligono, p)).length > 1 || !firDe(p, firs);
    });
    expect(mal.map((a) => a.icao)).toEqual([]);
  });

  it("Mar del Plata es Ezeiza Sur; San Fernando, Ezeiza Norte; Chos Malal, Mendoza", () => {
    expect(firDe(SAZM, firs)?.nombre).toBe("FIR EZEIZA");
    expect(dependenciasEn(SAZM, 6000, [], firs)[0]).toMatchObject({ distintivo: "EZEIZA CENTRO", mhz: ["125.20", "124.10"] });
    expect(dependenciasEn(SADF, 6000, [], firs)[0]).toMatchObject({ donde: "FIR EZEIZA · Sector norte" });
    expect(firDe({ lat: -37.38, lon: -70.27 }, firs)?.nombre).toBe("FIR MENDOZA");
    expect(firDe({ lat: -31.32, lon: -64.21 }, firs)?.nombre).toBe("FIR CÓRDOBA");
  });
});

describe("con quién se habla", () => {
  it("adentro de la TMA Baires, a FL 060, Baires Control; a 2000 ft en San Fernando, la torre", () => {
    expect(dependenciasEn(SADF, 6000, espacios, firs)[0]).toMatchObject({ distintivo: "BAIRES CONTROL" });
    expect(dependenciasEn(SADF, 0, espacios, firs)[0].distintivo).toMatch(/Fernando Torre/i);
  });

  it("San Fernando → Mar del Plata a FL 060: torre, Baires Control, Ezeiza Centro Sur, Mar del Plata", () => {
    const cambios = dependenciasDeRuta([SADF, SAZM], 6000, espacios, firs).map((c) => c.dependencia.distintivo);
    expect(cambios[0]).toMatch(/Fernando Torre/i);
    expect(cambios).toContain("BAIRES CONTROL");
    expect(cambios).toContain("EZEIZA CENTRO");
    expect(cambios[cambios.length - 1]).toMatch(/MAR DEL PLATA|Mar del Plata/i);
  });

  it("rangoEnPies", () => {
    expect(rangoEnPies("FL 55 / GND")).toEqual({ techo: 5500, piso: 0 });
    expect(rangoEnPies("2.500 ft / GND")).toEqual({ techo: 2500, piso: 0 });
    expect(rangoEnPies("FL 245 / 2500 FT AGL/ AMSL")).toEqual({ techo: 24500, piso: 2500 });
    expect(rangoEnPies("(I) GND / 2500 ft · (II) GND / 1500 ft")).toBeNull();
  });

  it("alNorteDe sigue la línea y la extiende horizontal", () => {
    const linea = [{ lat: -34, lon: -64 }, { lat: -35, lon: -60 }];
    expect(alNorteDe(linea, { lat: -34.2, lon: -63 })).toBe(true);
    expect(alNorteDe(linea, { lat: -34.9, lon: -61 })).toBe(false);
    expect(alNorteDe(linea, { lat: -34.9, lon: -58 })).toBe(true);
  });

  it("frecuenciasDeFila: el distintivo en castellano y los sectores", () => {
    const fila = "TMA X\nDesde …\nTWR SANTA ROSA DE\nCONLARA\nCONLARA TORRE\nCONLARA TOWER\nESPAÑOL/ SPANISH\n119.95 MHz\n121.50 MHz\nEMERG";
    expect(frecuenciasDeFila(fila)).toEqual({ distintivo: "CONLARA TORRE", sectores: [{ nombre: null, mhz: ["119.95"] }] });
  });
});
