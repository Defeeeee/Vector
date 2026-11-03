import { describe, expect, it } from "vitest";
import type { EspacioAereo } from "./espacios-aereos";
import {
  consultasDeRuta,
  duracionCorta,
  espaciosEn,
  espaciosEnRuta,
  haciaPunto,
  lecturaGps,
  proximoPunto,
  puntosDeRuta,
  tokensDeRuta,
  tramosDeRuta,
} from "./mapa-ruta";
import type { PuntoResuelto } from "./resolucion-puntos";

const SADF: PuntoResuelto = { codigo: "SADF", clase: "aerodromo", label: "San Fernando", lat: -34.453, lon: -58.59, variacionW: 9 };
const SADM: PuntoResuelto = { codigo: "SADM", clase: "aerodromo", label: "Morón", lat: -34.676, lon: -58.643, variacionW: 9 };
const SAZB: PuntoResuelto = { codigo: "SAZB", clase: "aerodromo", label: "Bahía Blanca", lat: -38.725, lon: -62.169 };

describe("tokensDeRuta y consultasDeRuta", () => {
  it("DCT no es un punto, y una aerovía va con sus vecinos", () => {
    expect(tokensDeRuta("sadf dct ugimi w18 bca")).toEqual(["SADF", "UGIMI", "W18", "BCA"]);
    expect(consultasDeRuta(["UGIMI", "W18", "BCA"])[1]).toEqual({ q: "W18", desde: "UGIMI", hasta: "BCA" });
    expect(consultasDeRuta(["SADF"])[0]).toEqual({ q: "SADF", desde: "", hasta: "" });
  });
});

describe("puntosDeRuta", () => {
  it("abre la aerovía en sus puntos sin repetir la salida", () => {
    const aerovia: PuntoResuelto = {
      codigo: "W18",
      clase: "aerovia",
      label: "W18",
      lat: SAZB.lat,
      lon: SAZB.lon,
      tramo: [
        { codigo: "MEDIO", clase: "fix", label: "MEDIO", lat: -36, lon: -60 },
        { ...SAZB },
      ],
    };
    const r = puntosDeRuta(["SADF", "W18", "SAZB", "XXXX"], [SADF, aerovia, SAZB, null]);
    expect(r.puntos.map((p) => p.codigo)).toEqual(["SADF", "MEDIO", "SAZB"]);
    expect(r.puntos[1].aerovia).toBe("W18");
    expect(r.sinUbicar).toEqual(["XXXX"]);
    expect(r.buscando).toBe(false);
    expect(puntosDeRuta(["SADF", "SADM"], [SADF, undefined]).buscando).toBe(true);
  });
});

describe("tramosDeRuta", () => {
  it("distancia y rumbo, magnético con la variación del primer aeródromo", () => {
    const { puntos } = puntosDeRuta(["SADF", "SADM"], [SADF, SADM]);
    const { tramos, totalNm } = tramosDeRuta(puntos);
    expect(totalNm).toBeGreaterThan(13);
    expect(totalNm).toBeLessThan(14);
    expect(tramos[0].rumboT).toBeGreaterThan(185);
    expect(tramos[0].rumboM).toBeCloseTo((tramos[0].rumboT + 9) % 360, 5);
  });
});

const cuadrado = (nombre: string, lat: number, lon: number, lado: number): EspacioAereo => ({
  id: nombre,
  tipo: "CTR",
  nombre,
  limites: "FL 55 / GND",
  clase: "C",
  aproximado: false,
  fuente: "test",
  poligono: [
    [lat + lado, lon - lado],
    [lat + lado, lon + lado],
    [lat - lado, lon + lado],
    [lat - lado, lon - lado],
  ],
});

describe("espaciosEnRuta", () => {
  it("los que la ruta cruza, en orden, aunque ningún punto caiga adentro", () => {
    const enElMedio = cuadrado("CTR MEDIO", -34.56, -58.615, 0.02);
    const lejos = cuadrado("CTR LEJOS", -30, -60, 0.1);
    const { puntos } = puntosDeRuta(["SADF", "SADM"], [SADF, SADM]);
    expect(espaciosEnRuta(puntos, [lejos, enElMedio]).map((e) => e.nombre)).toEqual(["CTR MEDIO"]);
    expect(espaciosEn({ lat: -34.56, lon: -58.615 }, [lejos, enElMedio])).toEqual([enElMedio]);
  });
});

describe("proximoPunto", () => {
  const ruta = [
    { lat: -34.0, lon: -58.0 },
    { lat: -34.5, lon: -58.0 },
    { lat: -35.0, lon: -58.0 },
  ];
  it("en la salida, va al segundo", () => {
    expect(proximoPunto(ruta, { lat: -34.001, lon: -58.0 }, 0)).toBe(1);
  });
  it("a mitad del primer tramo, sigue yendo al segundo", () => {
    expect(proximoPunto(ruta, { lat: -34.25, lon: -58.0 }, 1)).toBe(1);
  });
  it("pasar al costado del punto también cuenta", () => {
    // 3 NM al este, ya más al sur que el punto 2.
    expect(proximoPunto(ruta, { lat: -34.55, lon: -57.94 }, 1)).toBe(2);
  });
  it("nunca vuelve para atrás ni pasa del último", () => {
    expect(proximoPunto(ruta, { lat: -34.0, lon: -58.0 }, 2)).toBe(2);
    expect(proximoPunto(ruta, { lat: -35.0, lon: -58.0 }, 2)).toBe(2);
  });
});

describe("en vuelo", () => {
  it("haciaPunto: distancia, rumbo y tiempo", () => {
    const h = haciaPunto({ lat: -34, lon: -58 }, { lat: -34.5, lon: -58 }, 100);
    expect(h.distanciaNm).toBeCloseTo(30, 0);
    expect(h.rumboT).toBeCloseTo(180, 0);
    expect(h.eteMin).toBeCloseTo(18, 0);
    expect(haciaPunto({ lat: -34, lon: -58 }, { lat: -34.5, lon: -58 }, 3).eteMin).toBeNull();
  });
  it("lecturaGps pasa a nudos y pies", () => {
    const l = lecturaGps({ latitude: -34, longitude: -58, altitude: 1000, speed: 50, heading: 90, accuracy: 5 });
    expect(l.gsKt).toBeCloseTo(97.2, 1);
    expect(l.altitudFt).toBe(3281);
    expect(lecturaGps({ latitude: 0, longitude: 0, altitude: null, speed: null, heading: NaN, accuracy: 5 }).trackT).toBeNull();
  });
  it("duracionCorta", () => {
    expect(duracionCorta(65)).toBe("1 h 05 min");
    expect(duracionCorta(12.4)).toBe("12 min");
  });
});
