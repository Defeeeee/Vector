import { describe, expect, it } from "vitest";
import {
  clasificarSuperficie,
  filtrarAerodromos,
  pistaDeMadhel,
  filtrosDeModelo,
  filtrosDeParams,
  hayFiltros,
  paramsDeFiltros,
  tieneCombustible,
  type AerodromoFiltrable,
} from "./filtro-aerodromos";

const base = (a: Partial<AerodromoFiltrable> & { icao: string }): AerodromoFiltrable => ({
  label: a.icao,
  provincia: "BUENOS AIRES",
  helipuerto: false,
  controlado: null,
  uso: "",
  estado: "OK",
  pistas: [],
  combustible: "",
  ...a,
});

// San Fernando y tres alrededor, con datos reales a grandes rasgos.
const SADF = { lat: -34.453, lon: -58.59 };
const DIRECTORIO: AerodromoFiltrable[] = [
  base({ icao: "SADF", ...SADF, controlado: true, uso: "PUBLICO", pistas: [{ largoFt: 5545, superficie: "ASP" }], combustible: "AVGAS 100LL, JET A-1" }),
  base({ icao: "SAAR", lat: -32.904, lon: -60.785, controlado: true, uso: "PUBLICO", provincia: "SANTA FE", pistas: [{ largoFt: 9842, superficie: "ASP" }], combustible: "AVGAS 100LL, JET A-1" }),
  base({ icao: "SADZ", lat: -34.73, lon: -58.6, controlado: false, uso: "PUBLICO", pistas: [{ largoFt: 2600, superficie: "GRE" }] }),
  // Un aeródromo de MADHEL sin pistas ni combustible en el repo.
  base({ icao: "GEZ", lat: -34.67, lon: -58.95, controlado: false, uso: "PRIVADO" }),
  base({ icao: "HEL1", lat: -34.5, lon: -58.6, helipuerto: true }),
  base({ icao: "CERR", lat: -34.5, lon: -58.7, estado: "CERRADO" }),
];

describe("clasificarSuperficie y tieneCombustible", () => {
  it("reconoce los códigos de OurAirports", () => {
    expect(clasificarSuperficie("ASP")).toBe("dura");
    expect(clasificarSuperficie("Concrete")).toBe("dura");
    expect(clasificarSuperficie("GRE")).toBe("blanda");
    expect(clasificarSuperficie("")).toBeNull();
    expect(clasificarSuperficie("XYZ")).toBeNull();
  });

  it("encuentra el combustible como lo escribe el AIP", () => {
    expect(tieneCombustible("AVGAS 100LL, JET A-1", "100LL")).toBe(true);
    expect(tieneCombustible("AVGAS 100LL, JET A1", "JETA1")).toBe(true);
    expect(tieneCombustible("JET A-1", "100LL")).toBe(false);
  });
});

describe("filtrarAerodromos", () => {
  it("nunca devuelve helipuertos, cerrados ni el aeródromo de partida", () => {
    const r = filtrarAerodromos(DIRECTORIO, { desde: "SADF", radioNm: 500 }, SADF);
    const codigos = r.resultados.map((a) => a.icao);
    expect(codigos).not.toContain("HEL1");
    expect(codigos).not.toContain("CERR");
    expect(codigos).not.toContain("SADF");
  });

  it("ordena por distancia y corta por el radio", () => {
    const r = filtrarAerodromos(DIRECTORIO, { desde: "SADF", radioNm: 50 }, SADF);
    expect(r.resultados.map((a) => a.icao)).toEqual(["SADZ", "GEZ"]);
    expect(r.resultados[0].distanciaNm).toBe(17);
  });

  it("un aeródromo sin el dato pedido no se descarta en silencio: se cuenta aparte", () => {
    const r = filtrarAerodromos(DIRECTORIO, { combustible: "100LL" });
    expect(r.resultados.map((a) => a.icao)).toEqual(["SAAR", "SADF"]);
    // SADZ y GEZ no tienen el combustible en el repo: no sabemos, no "no hay".
    expect(r.conDatoFaltante).toBe(2);

    const conSinDato = filtrarAerodromos(DIRECTORIO, { combustible: "100LL", conSinDato: true });
    const gez = conSinDato.resultados.find((a) => a.icao === "GEZ");
    expect(gez?.sinDato).toEqual(["combustible"]);
  });

  it("largo y superficie se piden de la misma pista", () => {
    const r = filtrarAerodromos(DIRECTORIO, { largoMinM: 700, superficie: "dura" });
    // SADZ tiene 792 m, pero de pasto: no cumple, y se sabe.
    expect(r.resultados.map((a) => a.icao)).toEqual(["SAAR", "SADF"]);
    // GEZ no tiene pistas en el repo.
    expect(r.conDatoFaltante).toBe(1);
  });

  it("una pista con largo pero sin superficie es dudosa, no descartada", () => {
    const dir = [base({ icao: "X1", pistas: [{ largoFt: 3000 }] })];
    expect(filtrarAerodromos(dir, { largoMinM: 800, superficie: "dura" }).conDatoFaltante).toBe(1);
    expect(filtrarAerodromos(dir, { largoMinM: 1000, superficie: "dura" }).conDatoFaltante).toBe(0);
  });

  it("controlado, uso y provincia", () => {
    expect(filtrarAerodromos(DIRECTORIO, { controlado: false }).resultados.map((a) => a.icao)).toEqual(["GEZ", "SADZ"]);
    expect(filtrarAerodromos(DIRECTORIO, { uso: "privado" }).resultados.map((a) => a.icao)).toEqual(["GEZ"]);
    expect(filtrarAerodromos(DIRECTORIO, { provincia: "Santa Fe" }).resultados.map((a) => a.icao)).toEqual(["SAAR"]);
  });

  it("muestra la pista más larga en metros", () => {
    const [saar] = filtrarAerodromos(DIRECTORIO, { provincia: "SANTA FE" }).resultados;
    expect(saar.largoM).toBe(3000);
    expect(saar.superficie).toBe("dura");
  });
});

describe("los filtros en la URL", () => {
  it("van y vuelven iguales", () => {
    const f = { desde: "SADF", radioNm: 100, largoMinM: 800, superficie: "dura" as const, combustible: "100LL" as const, controlado: false, uso: "publico" as const, provincia: "BUENOS AIRES", conSinDato: true };
    expect(filtrosDeParams(paramsDeFiltros(f))).toEqual(f);
  });

  it("ignoran lo inválido en vez de romper", () => {
    expect(filtrosDeParams(new URLSearchParams("desde=<script>&nm=-3&largo=abc&sup=lava&comb=diesel"))).toEqual({});
    // Un radio sin "desde" no significa nada.
    expect(filtrosDeParams(new URLSearchParams("nm=50"))).toEqual({});
  });

  it("sin filtros no hay lista", () => {
    expect(hayFiltros({})).toBe(false);
    expect(hayFiltros({ conSinDato: true })).toBe(false);
    expect(hayFiltros({ combustible: "100LL" })).toBe(true);
  });
});

describe("filtrosDeModelo", () => {
  const resolver = (t: string) => (/san fernando|sadf/i.test(t) ? "SADF" : null);
  const PROVINCIAS = ["BUENOS AIRES", "CORDOBA", "SANTA FE"];

  it("las cuentas las hace el código: km a millas, pies a metros", () => {
    const { filtros, noEntendido } = filtrosDeModelo(
      { lugar: "San Fernando", radio: { valor: 185.2, unidad: "km" }, largoMinimo: { valor: 3000, unidad: "ft" }, combustible: "avgas 100LL", superficie: "dura" },
      resolver,
      PROVINCIAS,
    );
    expect(filtros).toEqual({ desde: "SADF", radioNm: 100, largoMinM: 914, combustible: "100LL", superficie: "dura" });
    expect(noEntendido).toEqual([]);
  });

  it("un lugar que el directorio no conoce no se inventa", () => {
    const { filtros, noEntendido } = filtrosDeModelo({ lugar: "Narnia", radio: { valor: 50, unidad: "nm" } }, resolver, PROVINCIAS);
    expect(filtros.desde).toBeUndefined();
    expect(filtros.radioNm).toBeUndefined();
    expect(noEntendido).toHaveLength(2);
  });

  it("la provincia se busca sin tildes, y una desconocida se avisa", () => {
    expect(filtrosDeModelo({ provincia: "Córdoba" }, resolver, PROVINCIAS).filtros.provincia).toBe("CORDOBA");
    expect(filtrosDeModelo({ provincia: "Atlántida" }, resolver, PROVINCIAS).noEntendido).toHaveLength(1);
  });
});

describe("las pistas como las escribe MADHEL", () => {
  it("largo en metros, pasado a pies, y la superficie", () => {
    expect(pistaDeMadhel("17/35 1400x21 M – Tierra.")).toEqual({ largoFt: 4593, superficie: "Tierra" });
    expect(pistaDeMadhel("01/19 1200x40 M - Asfalto")).toEqual({ largoFt: 3937, superficie: "Asfalto" });
  });

  it("lo que no entiende queda sin dato, nunca inventado", () => {
    expect(pistaDeMadhel("Pista en mal estado")).toEqual({ largoFt: undefined, superficie: undefined });
  });

  it("las superficies en castellano, con y sin tilde", () => {
    expect(clasificarSuperficie("Hormigón")).toBe("dura");
    expect(clasificarSuperficie("Carpeta asfáltica")).toBe("dura");
    expect(clasificarSuperficie("Césped")).toBe("blanda");
    expect(clasificarSuperficie("Tierra/Pasto")).toBe("blanda");
    expect(clasificarSuperficie("Ripio")).toBe("blanda");
  });

  it("una pista de MADHEL entra en los filtros como cualquier otra", () => {
    const dir = [base({ icao: "GEZ", pistas: [pistaDeMadhel("17/35 1400x21 M – Tierra.")] })];
    expect(filtrarAerodromos(dir, { largoMinM: 1200, superficie: "blanda" }).resultados.map((a) => a.icao)).toEqual(["GEZ"]);
    expect(filtrarAerodromos(dir, { largoMinM: 1200, superficie: "dura" }).resultados).toEqual([]);
  });
});
