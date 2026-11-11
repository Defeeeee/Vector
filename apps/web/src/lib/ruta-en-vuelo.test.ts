import { describe, expect, it } from "vitest";
import {
  aerodromosMasCercanos,
  deshacerCambio,
  esTokenDeCoordenada,
  historiaCon,
  proximoTrasCambio,
  rutaConAlFinal,
  rutaDelTrack,
  rutaDirectoA,
  TOPE_HISTORIA,
  tokenDePosicion,
  tokenDelProximo,
} from "./ruta-en-vuelo";
import { MAX_TOKENS, tokensDeRuta } from "./mapa-ruta";

const POS = { lat: -34.4091, lon: -58.6847 };
const AQUI = "S34.4091/W58.6847";

describe("tokenDePosicion", () => {
  it("usa el formato de 'Agregar puntos' del Mapa", () => {
    expect(tokenDePosicion(-34.40912, -58.68468)).toBe(AQUI);
    expect(tokenDePosicion(10.5, 20.25)).toBe("N10.5000/E20.2500");
  });
  it("sobrevive a tokensDeRuta y se reconoce como coordenada", () => {
    expect(tokensDeRuta(`${AQUI} SADM`)).toEqual([AQUI, "SADM"]);
    expect(esTokenDeCoordenada(AQUI)).toBe(true);
    expect(esTokenDeCoordenada("SADM")).toBe(false);
  });
});

describe("rutaDirectoA", () => {
  const ruta = ["SADF", "BENAVIDEZ", "SADM", "SAAJ"];
  it("a un punto intermedio: saltea los de en medio y conserva los que siguen", () => {
    expect(rutaDirectoA(ruta, POS, "SADM", 1)).toEqual([AQUI, "SADM", "SAAJ"]);
  });
  it("al último", () => {
    expect(rutaDirectoA(ruta, POS, "SAAJ", 1)).toEqual([AQUI, "SAAJ"]);
  });
  it("al primero que falta: conserva todo desde ahí", () => {
    expect(rutaDirectoA(ruta, POS, "BENAVIDEZ", 1)).toEqual([AQUI, "BENAVIDEZ", "SADM", "SAAJ"]);
  });
  it("a uno fuera de la ruta: acá y el punto, nada más", () => {
    expect(rutaDirectoA(ruta, POS, "sadl", 1)).toEqual([AQUI, "SADL"]);
  });
  it("a uno que sólo está atrás (ya pasado): acá y el punto", () => {
    expect(rutaDirectoA(ruta, POS, "SADF", 1)).toEqual([AQUI, "SADF"]);
  });
  it("con repetidos (ida y vuelta) busca de lo que falta en adelante", () => {
    const ida = ["SADF", "SADM", "SADF"];
    expect(rutaDirectoA(ida, POS, "SADF", 1)).toEqual([AQUI, "SADF"]);
    expect(rutaDirectoA(ida, POS, "SADM", 1)).toEqual([AQUI, "SADM", "SADF"]);
    expect(rutaDirectoA(ida, POS, "SADF", 0)).toEqual([AQUI, "SADF", "SADM", "SADF"]);
  });
  it("sin ruta", () => {
    expect(rutaDirectoA([], POS, "SADM")).toEqual([AQUI, "SADM"]);
  });
  it("un segundo directo no arrastra la posición vieja", () => {
    const vieja = ["S34.5000/W58.7000", "SADM", "SAAJ"];
    expect(rutaDirectoA(vieja, POS, "SAAJ", 1)).toEqual([AQUI, "SAAJ"]);
    expect(rutaDirectoA(vieja, POS, "SADM", 1)).toEqual([AQUI, "SADM", "SAAJ"]);
  });
  it("no pasa del tope de tokens", () => {
    const larga = Array.from({ length: MAX_TOKENS }, (_, i) => `P${i}`);
    expect(rutaDirectoA(larga, POS, "P0", 0)).toHaveLength(MAX_TOKENS);
  });
});

describe("tokenDelProximo", () => {
  it("sigue a los puntos por los tokens, saltando los de una aerovía", () => {
    const tokens = ["SADF", "UGIMI", "W18", "BCA", "SAZS"];
    const puntos = ["SADF", "UGIMI", "X1", "X2", "BCA", "SAZS"];
    expect(tokenDelProximo(tokens, puntos, 0)).toBe(0);
    expect(tokenDelProximo(tokens, puntos, 3)).toBe(1);
    expect(tokenDelProximo(tokens, puntos, 4)).toBe(3);
    expect(tokenDelProximo(tokens, puntos, 5)).toBe(4);
  });
  it("con repetidos avanza en orden", () => {
    expect(tokenDelProximo(["SADF", "SADM", "SADF"], ["SADF", "SADM", "SADF"], 2)).toBe(2);
  });
  it("sin coincidencias, -1", () => {
    expect(tokenDelProximo([AQUI], [], 0)).toBe(-1);
  });
});

describe("rutaConAlFinal", () => {
  it("suma al final y no repite el último", () => {
    expect(rutaConAlFinal(["SADF", "SADM"], "saaj")).toEqual(["SADF", "SADM", "SAAJ"]);
    expect(rutaConAlFinal(["SADF", "SADM"], "SADM")).toEqual(["SADF", "SADM"]);
  });
});

describe("aerodromosMasCercanos", () => {
  const filas = [
    ["SADM", "MOR", "Morón", -34.6764, -58.6428, "M"],
    ["SADF", "FDO", "San Fernando", -34.4532, -58.5896, "M"],
    ["", "ZZZ", "Sólo local", -34.41, -58.7, "S"],
    ["SAAJ", "", "Junín", -34.5459, -60.9306, "M"],
    ["SAZS", "BRC", "Bariloche", -41.1512, -71.1575, "M"],
  ] as const;
  it("ordena por distancia y calcula rumbo verdadero", () => {
    const r = aerodromosMasCercanos(POS, filas, 3);
    expect(r.map((x) => x.codigo)).toEqual(["ZZZ", "SADF", "SADM"]);
    expect(r[0].distanciaNm).toBeLessThan(1.5);
    // San Fernando está al sureste de la posición.
    const fdo = r[1];
    expect(fdo.distanciaNm).toBeGreaterThan(3);
    expect(fdo.distanciaNm).toBeLessThan(6);
    expect(fdo.rumboT).toBeGreaterThan(90);
    expect(fdo.rumboT).toBeLessThan(180);
    expect(fdo.magnetico).toBe(false);
    expect(fdo.rumbo).toBe(fdo.rumboT);
  });
  it("con la variación W el rumbo es magnético (le suma)", () => {
    const [a] = aerodromosMasCercanos(POS, filas, 1, 8);
    expect(a.magnetico).toBe(true);
    expect(a.rumbo).toBeCloseTo((a.rumboT + 8) % 360, 5);
  });
  it("devuelve a lo sumo n y saltea lo que no tiene código ni coordenadas", () => {
    expect(aerodromosMasCercanos(POS, filas, 6)).toHaveLength(5);
    expect(aerodromosMasCercanos(POS, [["", "", "x", 0, 0], ["A", "", "y", NaN, 0]] as const, 6)).toEqual([]);
    expect(aerodromosMasCercanos(POS, filas, 0)).toEqual([]);
  });
});

describe("la historia para deshacer", () => {
  it("guarda la ruta de antes y la devuelve de a una", () => {
    let h: string[] = [];
    h = historiaCon(h, "SADF SADM", `${AQUI} SADM`);
    h = historiaCon(h, `${AQUI} SADM`, "S34.0000/W58.0000 SAAJ");
    expect(h).toEqual(["SADF SADM", `${AQUI} SADM`]);
    const a = deshacerCambio(h)!;
    expect(a.ruta).toBe(`${AQUI} SADM`);
    const b = deshacerCambio(a.historia)!;
    expect(b.ruta).toBe("SADF SADM");
    expect(deshacerCambio(b.historia)).toBeNull();
  });
  it("un cambio que no cambia nada no suma", () => {
    expect(historiaCon([], "SADF SADM", " SADF SADM ")).toEqual([]);
    expect(historiaCon(["SADF"], "SADF", "SADM")).toEqual(["SADF"]);
  });
  it("recuerda los últimos cambios nada más", () => {
    let h: string[] = [];
    for (let i = 0; i < TOPE_HISTORIA + 5; i++) h = historiaCon(h, `R${i}`, `R${i + 1}`);
    expect(h).toHaveLength(TOPE_HISTORIA);
    expect(h[h.length - 1]).toBe(`R${TOPE_HISTORIA + 4}`);
  });
});

describe("rutaDelTrack", () => {
  it("la salida original y el destino de ahora, sin la posición del directo", () => {
    expect(rutaDelTrack("SADF SADM", [AQUI, "SAAJ"])).toBe("SADF SAAJ");
    expect(rutaDelTrack("SADF SADM", [AQUI, "SADM"])).toBe("SADF SADM");
  });
  it("no repite la salida si la ruta nueva vuelve a ella", () => {
    expect(rutaDelTrack("SADF SADM", [AQUI, "SADF"])).toBe("SADF");
  });
  it("sin ruta anterior, la nueva (sin la posición)", () => {
    expect(rutaDelTrack("", [AQUI, "SADM"])).toBe("SADM");
    expect(rutaDelTrack("", ["SADF", "SADM"])).toBe("SADF SADM");
  });
  it("una ruta escrita a mano sin posición se respeta", () => {
    expect(rutaDelTrack("SADF SADM", ["SADF", "BENAVIDEZ", "SAAJ"])).toBe("SADF BENAVIDEZ SAAJ");
  });
});

describe("proximoTrasCambio", () => {
  const p = (lat: number, lon: number) => ({ lat, lon });
  it("en un directo (la ruta empieza en la posición) va al segundo punto", () => {
    expect(proximoTrasCambio([POS, p(-34.67, -58.64), p(-34.54, -60.93)], POS)).toBe(1);
  });
  it("elige el tramo más cercano aunque la ruta tenga un quiebre ya pasado", () => {
    // Sale al norte, gira al este y baja: estando en el último tramo, el próximo es el último.
    const ruta = [p(-34.0, -58.0), p(-33.0, -58.0), p(-33.0, -57.0), p(-34.0, -57.0)];
    expect(proximoTrasCambio(ruta, p(-33.5, -57.0))).toBe(3);
    expect(proximoTrasCambio(ruta, p(-33.4, -58.0))).toBe(1);
    expect(proximoTrasCambio(ruta, p(-33.0, -57.5))).toBe(2);
  });
  it("con un punto o ninguno, 0", () => {
    expect(proximoTrasCambio([], POS)).toBe(0);
    expect(proximoTrasCambio([p(-34, -58)], POS)).toBe(0);
  });
});
