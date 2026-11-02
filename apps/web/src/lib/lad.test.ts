import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buscarLads, codigoLad, leerCoordenadas, leerLadsTsv, numeroDeCodigoLad } from "./lad";
import { indicadorDeLugar } from "./plan-de-vuelo";

const lads = leerLadsTsv(readFileSync("src/data/lad.tsv", "utf8"));

describe("la lista de LAD", () => {
  it("es la del CAD de ANAC: miles, con número único y nombre", () => {
    expect(lads.length).toBeGreaterThan(3000);
    expect(new Set(lads.map((l) => l.numero)).size).toBe(lads.length);
    expect(lads.find((l) => l.numero === "2013")?.nombre).toBe("VILLA JOSEFINA");
    // Los nombres con paréntesis adentro quedan enteros.
    expect(lads.find((l) => l.numero === "51")?.nombre).toBe("AZOPARDO (NAVAL)");
  });

  it("el código es LAD y el número, y se lee de vuelta", () => {
    expect(codigoLad("2013")).toBe("LAD2013");
    expect(numeroDeCodigoLad("LAD2013")).toBe("2013");
    expect(numeroDeCodigoLad("lad 0051")).toBe("51");
    expect(numeroDeCodigoLad("SADF")).toBeNull();
  });
});

describe("buscar un LAD", () => {
  it("por número, con o sin LAD adelante: primero el exacto", () => {
    for (const q of ["2013", "LAD2013", "lad 2013", "LAD 02013"]) expect(buscarLads(q, lads)[0]?.numero).toBe("2013");
    expect(buscarLads("201", lads).every((l) => l.numero.startsWith("201"))).toBe(true);
  });

  it("por nombre, sin tildes y con todas las palabras", () => {
    expect(buscarLads("villa josefina", lads)[0]?.numero).toBe("2013");
    expect(buscarLads("lad villa josefina", lads)[0]?.numero).toBe("2013");
    expect(buscarLads("noetinger", lads).map((l) => l.numero)).toContain("2014");
  });

  it("con menos de dos letras, o sólo 'LAD', no busca", () => {
    expect(buscarLads("v", lads)).toEqual([]);
    expect(buscarLads("LAD", lads)).toEqual([]);
  });
});

describe("las coordenadas que escribe el piloto", () => {
  const cerca = (r: { lat: number; lon: number } | null, lat: number, lon: number) =>
    expect(r && Math.abs(r.lat - lat) < 0.001 && Math.abs(r.lon - lon) < 0.001).toBe(true);

  it("en el formato del plan, con o sin segundos", () => {
    cerca(leerCoordenadas("3427S05835W"), -34.45, -58.5833);
    cerca(leerCoordenadas("3427S 05835W"), -34.45, -58.5833);
    cerca(leerCoordenadas("342730S0583530W"), -34.4583, -58.5917);
  });

  it("en grados, minutos y segundos", () => {
    cerca(leerCoordenadas(`34°27'30"S 58°35'30"W`), -34.4583, -58.5917);
    cerca(leerCoordenadas("34 27 S 58 35 W"), -34.45, -58.5833);
  });

  it("en decimales, como se copian de un mapa", () => {
    cerca(leerCoordenadas("-34.4542, -58.5913"), -34.4542, -58.5913);
    cerca(leerCoordenadas("-34.4542 -58.5913"), -34.4542, -58.5913);
  });

  it("lo que no se entiende o no puede existir, no", () => {
    expect(leerCoordenadas("")).toBeNull();
    expect(leerCoordenadas("cerca de la ruta 9")).toBeNull();
    expect(leerCoordenadas("3475S05835W")).toBeNull(); // 75 minutos
    expect(leerCoordenadas("-95, -58")).toBeNull();
  });
});

describe("un LAD en el plan de vuelo", () => {
  it("va con ZZZZ y, en la 18, el número, el nombre y las coordenadas", () => {
    expect(indicadorDeLugar({ codigo: "LAD2013", nombre: "VILLA JOSEFINA", lat: -34.45, lon: -58.5833 })).toEqual({
      casilla: "ZZZZ",
      otrosDatos: "LAD2013 VILLA JOSEFINA 3427S05835W",
    });
  });

  it("sin coordenadas, el número y el nombre (la revisión avisa que faltan)", () => {
    expect(indicadorDeLugar({ codigo: "LAD2013", nombre: "VILLA JOSEFINA" })).toEqual({ casilla: "ZZZZ", otrosDatos: "LAD2013 VILLA JOSEFINA" });
  });
});
