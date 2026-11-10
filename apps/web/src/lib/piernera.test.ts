import { describe, expect, it } from "vitest";
import { armarPiernera, horasMinutos, nombrePiernera, paraPdf } from "./piernera";

const base = {
  ruta: "SADF DCT SADM",
  avion: "LV-ABC C152",
  tasKt: 90,
  altitudFt: 1500,
  consumoLh: 24,
  tramos: [
    { desde: "SADF", hasta: "BENAVIDEZ", distanciaNm: 9, rumboM: 312.4, rumboT: 304 },
    { desde: "BENAVIDEZ", hasta: "SADM", distanciaNm: 18, rumboM: 205.6, rumboT: 197 },
  ],
  cambios: [{ desdeNm: 0, donde: "ATZ SAN FERNANDO (I)", distintivo: "San Fernando Torre", mhz: ["119.000", "120.050"] }],
};

describe("la piernera", () => {
  it("cada tramo con rumbo magnético, distancia, tiempo y acumulado", () => {
    const p = armarPiernera(base);
    expect(p.renglones).toEqual([
      { n: "1", tramo: "SADF - BENAVIDEZ", rumbo: "312°M", distancia: "9,0", tiempo: "0:06", acumulado: "0:06" },
      { n: "2", tramo: "BENAVIDEZ - SADM", rumbo: "206°M", distancia: "18,0", tiempo: "0:12", acumulado: "0:18" },
    ]);
    expect(p.totales).toEqual({ distancia: "27,0 NM", tiempo: "0:18", combustible: "8 L sin reserva" });
    expect(p.comunicaciones[0]).toEqual({ donde: "Salida - ATZ SAN FERNANDO (I)", quien: "San Fernando Torre", frecuencias: "119.000  120.050" });
  });

  it("sin variación conocida va el rumbo verdadero, marcado; sin TAS, sin tiempos", () => {
    const p = armarPiernera({ ...base, tasKt: null, tramos: [{ ...base.tramos[0], rumboM: null }] });
    expect(p.renglones[0]).toMatchObject({ rumbo: "304°V", tiempo: "—", acumulado: "—" });
    expect(p.totales.combustible).toBeNull();
  });

  it("escribe lo que entra en una fuente estándar del PDF", () => {
    expect(paraPdf("SADF → SADM · “ok”")).toBe('SADF - SADM - "ok"');
    expect(paraPdf("Morón Ñandú")).toBe("Morón Ñandú");
  });

  it("horas y minutos, y el nombre del archivo", () => {
    expect(horasMinutos(65)).toBe("1:05");
    expect(nombrePiernera(["SADF", "DCT", "SADM"])).toBe("Piernera-SADF-SADM.pdf");
  });
});
