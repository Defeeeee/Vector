import { describe, expect, it } from "vitest";
import { decodificarMetar, explicarCategoria, puntoCardinal } from "./metar-simple";

const texto = (crudo: string) => Object.fromEntries(decodificarMetar(crudo).lineas.map((l) => [l.rotulo, l.texto]));

describe("el METAR en palabras simples", () => {
  it("un METAR común", () => {
    const t = texto("SAAV 111500Z 25012G22KT 9999 FEW030 SCT100 20/12 Q1015");
    expect(t.Viento).toBe("Viento del oeste (250°), a 12 nudos (22 km/h), con ráfagas de hasta 22 nudos (41 km/h).");
    expect(t.Visibilidad).toBe("Se ve a más de 10 km.");
    expect(t.Nubes).toBe("Pocas nubes a 3.000 ft (914 m); Nubes dispersas a 10.000 ft (3.048 m).");
    expect(t.Temperatura).toBe("20 °C, con punto de rocío de 12 °C.");
    expect(t.Presión).toBe("1015 hPa (al nivel del mar).");
  });
  it("calmo, viento variable y temperatura bajo cero", () => {
    expect(texto("SADF 000000KT CAVOK M02/M04 Q1020").Viento).toBe("Calmo, sin viento.");
    expect(texto("SADF 00000KT CAVOK 10/05 Q1020").Viento).toBe("Calmo, sin viento.");
    expect(texto("SADF VRB03KT 9999 NSC 10/05 Q1020").Viento).toBe("Viento de dirección variable, a 3 nudos (6 km/h).");
    expect(texto("SADF 18005KT CAVOK M02/M04 Q1020").Temperatura).toBe("-2 °C, con punto de rocío de -4 °C.");
  });
  it("CAVOK y sin nubes", () => {
    const t = texto("SADF 18005KT CAVOK 10/05 Q1020");
    expect(t.Visibilidad).toContain("CAVOK");
    expect(t.Nubes).toBe("Cielo despejado, sin nubes.");
    expect(texto("SADF 18005KT 9999 NSC 10/05 Q1020").Nubes).toBe("Cielo despejado, sin nubes.");
  });
  it("visibilidad reducida y fenómenos", () => {
    const t = texto("SAAV 111500Z 18010KT 3000 -RA BR OVC008 15/14 Q1008");
    expect(t.Visibilidad).toBe("Se ve hasta unos 3 km.");
    expect(t.Tiempo).toBe("Lluvia leve; Neblina.");
    expect(t.Nubes).toBe("Cielo cubierto a 800 ft (244 m).");
    expect(texto("SAAV 18010KT 0800 FG VV002 15/15 Q1008").Visibilidad).toBe("Se ve sólo hasta unos 800 m.");
    expect(texto("SAAV 18010KT 0800 FG VV002 15/15 Q1008").Nubes).toContain("200 ft");
  });
  it("tormenta con nubes de tormenta", () => {
    const t = texto("SACO 22015G30KT 6000 +TSRA BKN030CB 25/22 Q1005");
    expect(t.Tiempo).toBe("Tormenta con lluvia fuerte.");
    expect(t.Nubes).toContain("nubes de tormenta");
  });
  it("presión en pulgadas", () => {
    expect(texto("KJFK 18010KT 10SM A2992 15/10").Presión).toBe("1013 hPa (al nivel del mar).");
  });
  it("no decodifica lo que viene después de RMK ni lo que no entiende", () => {
    const t = texto("SADF 18005KT 9999 NSC 10/05 Q1020 RMK 25010KT");
    expect(t.Viento).toContain("sur");
    expect(texto("XXXX AUTO ZZZ").Viento).toBeUndefined();
    expect(decodificarMetar("").lineas).toEqual([]);
  });
  it("los puntos cardinales", () => {
    expect(puntoCardinal(0)).toBe("norte");
    expect(puntoCardinal(350)).toBe("norte");
    expect(puntoCardinal(135)).toBe("sudeste");
    expect(puntoCardinal(270)).toBe("oeste");
  });
  it("la categoría de vuelo", () => {
    expect(explicarCategoria("VFR")?.titulo).toBe("Buen tiempo para volar");
    expect(explicarCategoria("ifr")?.titulo).toBe("Mal tiempo");
    expect(explicarCategoria("UNK")).toBeNull();
    expect(explicarCategoria(null)).toBeNull();
  });
});
