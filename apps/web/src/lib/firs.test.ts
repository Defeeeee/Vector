import { describe, expect, it } from "vitest";
import { allAirports, canalesDeLlamada, getAirport } from "./airports";
import { contiene } from "./espacios-aereos";
import { espaciosAereos, torreDe } from "./espacios-aereos-servidor";
import { alNorteDe, dependenciasDeRuta, dependenciasEn, firDe, frecuenciasDeFila, rangoEnPies, type RadioDeAerodromo } from "./firs";

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
    expect(dependenciasEn(SAZM, 6000, [], firs)[0]).toMatchObject({ tipo: "claseG", nota: "Información de vuelo: EZEIZA CENTRO 125.20 · 124.10" });
    expect(dependenciasEn(SADF, 6000, [], firs)[0]).toMatchObject({ donde: "Clase G · FIR EZEIZA · Sector norte" });
    expect(firDe({ lat: -37.38, lon: -70.27 }, firs)?.nombre).toBe("FIR MENDOZA");
    expect(firDe({ lat: -31.32, lon: -64.21 }, firs)?.nombre).toBe("FIR CÓRDOBA");
  });
});

describe("con quién se habla", () => {
  it("adentro de la TMA Baires, a FL 060, Baires Control; a 2000 ft en San Fernando, la torre", () => {
    expect(dependenciasEn(SADF, 6000, espacios, firs)[0]).toMatchObject({ distintivo: "BAIRES CONTROL" });
    expect(dependenciasEn(SADF, 0, espacios, firs)[0].distintivo).toMatch(/Fernando Torre/i);
  });

  it("San Fernando → Mar del Plata a FL 060: torre, Baires Control, clase G, Mar del Plata", () => {
    const cambios = dependenciasDeRuta([SADF, SAZM], 6000, espacios, firs).map((c) => c.dependencia.distintivo);
    expect(cambios[0]).toMatch(/Fernando Torre/i);
    expect(cambios).toContain("BAIRES CONTROL");
    expect(cambios).toContain("Sin control (clase G)");
    expect(cambios[cambios.length - 1]).toMatch(/MAR DEL PLATA|Mar del Plata/i);
  });

  /*
    Federico, 2026-11-03: "en un vuelo a MGI … yo salgo con FDO TWR y después paso a espacio
    clase G y MGI es no controlado con CTAF" (Isla Martín García, 122.50, de la lista de la zona).
  */
  it("San Fernando → Martín García bajo la TMA: torre, clase G y el canal de MGI", () => {
    const canales = canalesDeLlamada();
    const radio = (codigo: string): RadioDeAerodromo => {
      const ad = getAirport(codigo)!;
      const c = canales.get(ad.local ?? "");
      return { controlado: ad.madhel?.controlled ?? null, llamada: c?.mhz ?? [], fuenteLlamada: c?.fuente, torre: torreDe(ad.icao, "ATZ") };
    };
    const radios = new Map([["SADF", radio("SADF")], ["SAAK", radio("SAAK")]]);
    const saak = getAirport("SAAK")!;
    const cambios = dependenciasDeRuta([{ ...SADF, codigo: "SADF" }, { lat: saak.lat!, lon: saak.lon!, codigo: "SAAK" }], 1500, espacios, firs, radios);
    expect(cambios[0].dependencia).toMatchObject({ tipo: "torre" });
    expect(cambios.some((c) => c.dependencia.tipo === "claseG")).toBe(true);
    expect(cambios.some((c) => c.dependencia.tipo === "tma")).toBe(false);
    expect(cambios[cambios.length - 1].dependencia).toMatchObject({ tipo: "aerodromo", mhz: ["122.50"] });
  });

  it("en clase G no se habla con el centro: es información de vuelo", () => {
    const g = dependenciasEn(SAZM, 3000, [], firs)[0];
    expect(g).toMatchObject({ tipo: "claseG", mhz: [] });
    expect(g.nota).toContain("EZEIZA CENTRO");
    expect(dependenciasEn(SAZM, 30000, [], firs)[0]).toMatchObject({ tipo: "centro", distintivo: "EZEIZA CENTRO" });
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
