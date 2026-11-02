import { describe, expect, it } from "vitest";
import { aerodromoCercano, colorPorAltura, formaDelRecorrido, hhmmArgentina, hhmmUtc, puedeHaberDetectados, RECORRIDO_PUNTOS_MAX } from "./recorrido";

describe("el recorrido ADS-B", () => {
  it("el despegue se redondea para abajo y el aterrizaje para arriba", () => {
    expect(hhmmUtc("2026-10-24T19:27:01+00:00", "abajo")).toBe("19:27");
    expect(hhmmUtc("2026-10-24T20:16:24+00:00", "arriba")).toBe("20:17");
    expect(hhmmUtc("2026-10-24T20:16:00+00:00", "arriba")).toBe("20:16");
    expect(hhmmUtc("basura")).toBe("");
  });

  it("la hora argentina es UTC−3", () => {
    expect(hhmmArgentina("2026-10-24T19:27:01+00:00")).toBe("16:27");
    expect(hhmmArgentina("2026-10-24T01:10:00+00:00")).toBe("22:10");
  });

  it("el aeródromo de una punta: el más cercano a menos de 4 km", () => {
    const lista = [
      { icao: "SADF", lat: -34.4532, lon: -58.5896 },
      { icao: "SADM", lat: -34.6763, lon: -58.6428 },
      { icao: "SIN", lat: null, lon: null },
    ];
    expect(aerodromoCercano([-34.45418, -58.59048], lista)).toBe("SADF");
    expect(aerodromoCercano([-34.5, -58.96], lista)).toBeNull();
  });

  it("el color va de ámbar abajo a casi blanco arriba", () => {
    expect(colorPorAltura(0, 1100)).toBe("rgb(245,158,11)");
    expect(colorPorAltura(1100, 1100)).toBe("rgb(224,242,254)");
    expect(colorPorAltura(null, 1100)).toBe("rgb(245,158,11)");
    expect(colorPorAltura(1100, 1100, "claro")).toBe("rgb(67,56,202)");
  });

  it("sólo se pregunta por fechas desde que graba y de los últimos 30 días", () => {
    expect(puedeHaberDetectados("2026-10-24", "2026-10-24")).toBe(true);
    expect(puedeHaberDetectados("2026-10-20", "2026-10-24")).toBe(false);
    expect(puedeHaberDetectados("2026-10-25", "2026-10-24")).toBe(false);
    expect(puedeHaberDetectados("2026-12-01", "2027-01-15")).toBe(false);
    expect(puedeHaberDetectados("24/10", "2026-10-24")).toBe(false);
  });
});

describe("formaDelRecorrido (lo que se publica)", () => {
  const p: [number, number, number, number | null, number | null][] = Array.from({ length: 1000 }, (_, i) => [i * 10, -34.45123 + i * 0.001, -58.58987, 300 + i * 13, 95]);
  p[600] = [p[600][0] + 200, p[600][1], p[600][2], p[600][3], p[600][4]];
  for (let i = 601; i < p.length; i++) p[i] = [p[i][0] + 200, p[i][1], p[i][2], p[i][3], p[i][4]];
  const forma = formaDelRecorrido({ t0: 1793906820, fuente: "adsb.fi", p })!;

  it("sin horas ni velocidad: lat, lon y altura", () => {
    expect(forma.p.every((x) => x.length === 3)).toBe(true);
    expect(JSON.stringify(forma)).not.toContain("1793906820");
  });
  it("como el backend: hasta 400 puntos, el primero y el último, 4 decimales, de a 100 ft", () => {
    expect(forma.p.length).toBeLessThanOrEqual(RECORRIDO_PUNTOS_MAX + 1);
    expect(forma.p[0].slice(0, 2)).toEqual([-34.4512, -58.5899]);
    expect(forma.p.at(-1)![0]).toBe(Math.round((-34.45123 + 0.999) * 1e4) / 1e4);
    expect(forma.p.every((x) => x[2] % 100 === 0)).toBe(true);
  });
  it("el corte de señal sigue marcado, una vez", () => {
    expect(forma.cortes).toHaveLength(1);
  });
  it("sin posiciones, nada", () => {
    expect(formaDelRecorrido(null)).toBeNull();
    expect(formaDelRecorrido({ t0: 0, fuente: "adsb.fi", p: [[0, 1, 2, 3, 4]] })).toBeNull();
  });
});
