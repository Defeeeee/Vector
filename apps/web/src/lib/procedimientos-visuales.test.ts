import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { alternarCapa, CAPAS_POR_DEFECTO, type IdCapa } from "./capas-mapa";
import {
  distanciaM,
  flechasDeLinea,
  procedimientosVisibles,
  puntaFinal,
  puntoAlLargo,
  rumboEntre,
  VISUALES,
  type Punto,
} from "./procedimientos-visuales";

/** Un umbral del AIP de SADM (AD 2.12), `344119.59S` + `0583847.12W` → [lat, lon]. */
function umbralDelAip(pista: string): Punto {
  const texto = fs.readFileSync(path.join(process.cwd(), "src/data/aip/SADM.txt"), "utf8");
  const m = new RegExp(`THR ${pista} (\\d{2})(\\d{2})(\\d{2}\\.\\d+)S\\s+(\\d{3})(\\d{2})(\\d{2}\\.\\d+)W`).exec(texto);
  if (!m) throw new Error(`no encuentro THR ${pista} en el AIP de SADM`);
  return [-(+m[1] + +m[2] / 60 + +m[3] / 3600), -(+m[4] + +m[5] / 60 + +m[6] / 3600)];
}

const ARP: Punto = [-(34 + 40 / 60 + 43 / 3600), -(58 + 38 / 60 + 37 / 3600)];

describe("los procedimientos visuales de Morón", () => {
  it("son cuatro: 02 y 20, llegada y salida", () => {
    expect(VISUALES.procedimientos.map((p) => `${p.pista}-${p.tipo}`).sort()).toEqual(["02-llegada", "02-salida", "20-llegada", "20-salida"]);
    for (const p of VISUALES.procedimientos) {
      expect(p.texto.length).toBeGreaterThan(20);
      expect(p.puntos.length).toBeGreaterThan(2);
    }
  });

  it("cada llegada termina en su umbral del AIP y cada salida empieza en el suyo", () => {
    for (const p of VISUALES.procedimientos) {
      const umbral = umbralDelAip(p.pista);
      const punta = p.tipo === "llegada" ? p.puntos[p.puntos.length - 1] : p.puntos[0];
      expect(distanciaM(punta, umbral), p.id).toBeLessThan(50);
    }
  });

  it("todo cae a menos de 17 km del ARP (el Puente de Hierro está a 16)", () => {
    const todos: Punto[] = [
      ...VISUALES.procedimientos.flatMap((p) => p.puntos),
      ...VISUALES.referencias.map((r) => [r.lat, r.lon] as Punto),
    ];
    for (const p of todos) expect(distanciaM(p, ARP)).toBeLessThan(17_000);
  });

  it("trae la fuente, el hash, la precisión y las referencias", () => {
    expect(VISUALES.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(VISUALES.precision).toMatch(/vale la carta/);
    expect(VISUALES.referencias.map((r) => r.nombre).sort()).toEqual(["GIVA", "LIBERTAD", "PUENTE DE HIERRO"]);
    expect(VISUALES.referencias.find((r) => r.nombre === "PUENTE DE HIERRO")?.tipo).toBe("notificacion");
  });

  it("las vías traen su atribución de OpenStreetMap", () => {
    expect(VISUALES.fuenteVias).toMatch(/OpenStreetMap/);
    expect(VISUALES.vias.map((v) => v.nombre)).toEqual(["FFCC Sarmiento", "FFCC Gral. Belgrano"]);
    for (const v of VISUALES.vias) expect(v.tramos.length).toBeGreaterThan(0);
  });
});

describe("qué procedimientos se ven", () => {
  it("de entrada, los cuatro y las referencias", () => {
    expect(procedimientosVisibles(CAPAS_POR_DEFECTO)).toHaveLength(4);
    expect(CAPAS_POR_DEFECTO).toContain("vis-referencias");
  });

  it("hace falta el tipo y la pista", () => {
    const sin = (...ids: IdCapa[]) => ids.reduce((v, id) => alternarCapa(v, id), CAPAS_POR_DEFECTO);
    expect(procedimientosVisibles(sin("vis-salidas")).map((p) => p.id).sort()).toEqual(["02-llegada", "20-llegada"]);
    expect(procedimientosVisibles(sin("vis-20")).map((p) => p.pista)).toEqual(["02", "02"]);
    expect(procedimientosVisibles(sin("vis-llegadas", "vis-02")).map((p) => p.id)).toEqual(["20-salida"]);
    expect(procedimientosVisibles(sin("vis-llegadas", "vis-salidas"))).toEqual([]);
  });
});

describe("la geometría de las flechas", () => {
  it("el rumbo entre dos puntos", () => {
    expect(rumboEntre([0, 0], [1, 0])).toBeCloseTo(0, 1);
    expect(rumboEntre([0, 0], [0, 1])).toBeCloseTo(90, 1);
    expect(rumboEntre([0, 0], [-1, 0])).toBeCloseTo(180, 1);
    expect(rumboEntre([0, 0], [0, -1])).toBeCloseTo(270, 1);
  });

  it("las flechitas van cada ~1 km, con el rumbo del tramo, y no pisan la punta", () => {
    const linea: Punto[] = [[-34.7, -58.6], [-34.66, -58.6]]; // ~4,4 km al norte
    const f = flechasDeLinea(linea, 1000, 400);
    expect(f).toHaveLength(4);
    for (const x of f) expect(x.rumbo).toBeCloseTo(0, 0);
    expect(distanciaM([f[1].lat, f[1].lon], [f[0].lat, f[0].lon])).toBeCloseTo(1000, -1);
    expect(puntaFinal(linea)).toMatchObject({ lat: -34.66, rumbo: expect.closeTo(0, 0) });
    expect(puntoAlLargo(linea, 99_999)).toBeNull();
  });

  it("los datos reales dan flechas con rumbo y punta", () => {
    for (const p of VISUALES.procedimientos) {
      expect(puntaFinal(p.puntos), p.id).not.toBeNull();
      expect(puntoAlLargo(p.puntos, 300), p.id).not.toBeNull();
    }
  });
});
