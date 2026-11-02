import { describe, expect, it } from "vitest";
import {
  MAX_ALTERNATIVAS,
  RADIO_POR_DEFECTO_NM,
  alcanceNm,
  alternativasCerca,
  type CandidatoAlternativa,
} from "./alternativas";

/** Coordenadas reales de `madhel.tsv`. */
const SADM = { lat: -34.6792, lon: -58.6436 };
const cand = (over: Partial<CandidatoAlternativa> = {}): CandidatoAlternativa => ({
  icao: "SADF", label: "San Fernando", lat: -34.4545, lon: -58.5909, ...over,
});

describe("alternativasCerca", () => {
  it("ordena del más cercano al más lejano", () => {
    const r = alternativasCerca(SADM, [
      cand({ icao: "SAAJ", lat: -34.5459, lon: -60.9305 }), // 113 NM
      cand({ icao: "SADF" }),                                // 13,7 NM
      cand({ icao: "SADP", lat: -34.6099, lon: -58.6126 }),  // ~4,6 NM
    ], { radioNm: 200 });
    expect(r.map((a) => a.icao)).toEqual(["SADP", "SADF", "SAAJ"]);
  });

  it("respeta el radio", () => {
    const r = alternativasCerca(SADM, [
      cand({ icao: "SADF" }),
      cand({ icao: "SAAJ", lat: -34.5459, lon: -60.9305 }),
    ], { radioNm: 40 });
    expect(r.map((a) => a.icao)).toEqual(["SADF"]);
  });

  it("excluye el punto mismo", () => {
    // Un aeródromo a menos de 1 NM del punto ES el punto. Ofrecerlo como alternativa de
    // sí mismo es ruido.
    const r = alternativasCerca(SADM, [cand({ icao: "SADM", ...SADM })]);
    expect(r).toEqual([]);
  });

  it("corta en el límite", () => {
    const muchos = Array.from({ length: 20 }, (_, i) =>
      cand({ icao: `X${i}`, lat: -34.6 - i * 0.01, lon: -58.6 })
    );
    expect(alternativasCerca(SADM, muchos)).toHaveLength(MAX_ALTERNATIVAS);
  });

  it("calcula los minutos con la ground speed dada", () => {
    const r = alternativasCerca(SADM, [cand()], { groundSpeedKt: 110 });
    expect(r[0].minutos).toBeCloseTo((13.7404 / 110) * 60, 1);
  });

  it("sin ground speed los minutos son null, no cero", () => {
    expect(alternativasCerca(SADM, [cand()])[0].minutos).toBeNull();
    expect(alternativasCerca(SADM, [cand()], { groundSpeedKt: 0 })[0].minutos).toBeNull();
  });

  it("informa la pista más larga conocida, o null", () => {
    const conPistas = alternativasCerca(SADM, [
      cand({ pistas: [
        { le: "05", he: "23", rumboT: 44, largoFt: 3000 },
        { le: "11", he: "29", rumboT: 102, largoFt: 5000 },
      ] }),
    ]);
    expect(conPistas[0].pistaMasLargaFt).toBe(5000);

    // 618 de 711 aeródromos no tienen pistas publicadas.
    expect(alternativasCerca(SADM, [cand()])[0].pistaMasLargaFt).toBeNull();
    expect(alternativasCerca(SADM, [cand({ pistas: [] })])[0].pistaMasLargaFt).toBeNull();
  });

  it("el radio por defecto es razonable para un monomotor", () => {
    expect(RADIO_POR_DEFECTO_NM).toBeGreaterThan(20);
    expect(RADIO_POR_DEFECTO_NM).toBeLessThan(80);
  });
});

describe("alcanceNm", () => {
  it("es horas útiles por ground speed", () => {
    // Las horas útiles vienen de `computeFuel`, o sea con la reserva ya descontada: la
    // política de reservas vive en un solo lugar.
    expect(alcanceNm(3.25, 110)).toBeCloseTo(357.5, 6);
  });

  it("null si falta cualquiera de los dos", () => {
    expect(alcanceNm(null, 110)).toBeNull();
    expect(alcanceNm(3, null)).toBeNull();
    expect(alcanceNm(0, 110)).toBeNull();
    expect(alcanceNm(3, 0)).toBeNull();
  });
});
