import { describe, expect, it } from "vitest";
import {
  CADA_MS,
  conMiles,
  haceCuanto,
  leerSeguimientoGuardado,
  posicionDeLectura,
  tituloDelEstado,
  tocaMandar,
  tokenValido,
  urlDeSeguimiento,
} from "./seguimiento";

const lectura = { lat: -34.453219, lon: -58.589731, altitudFt: 1523.4, gsKt: 91.6, trackT: 271.2, precisionM: 12 };

describe("la posición que se manda", () => {
  it("redondea a ~1 m y a enteros", () => {
    expect(posicionDeLectura(lectura)).toEqual({ lat: -34.45322, lon: -58.58973, alt_ft: 1523, gs_kt: 92, track: 271 });
  });
  it("sin altura, velocidad ni rumbo manda lo que hay", () => {
    expect(posicionDeLectura({ ...lectura, altitudFt: null, gsKt: null, trackT: null })).toEqual({
      lat: -34.45322,
      lon: -58.58973,
      alt_ft: null,
      gs_kt: null,
      track: null,
    });
  });
  it("sin lectura o con mucho error no manda nada", () => {
    expect(posicionDeLectura(null)).toBeNull();
    expect(posicionDeLectura({ ...lectura, precisionM: 400 })).toBeNull();
    expect(posicionDeLectura({ ...lectura, precisionM: Number.NaN })).toBeNull();
  });
  it("coordenadas imposibles no salen", () => {
    expect(posicionDeLectura({ ...lectura, lat: 95 })).toBeNull();
    expect(posicionDeLectura({ ...lectura, lon: Number.NaN })).toBeNull();
  });
  it("acota lo que el backend rechazaría", () => {
    const p = posicionDeLectura({ ...lectura, altitudFt: 99999, gsKt: -3, trackT: 360 });
    expect(p).toMatchObject({ alt_ft: 60000, gs_kt: 0, track: 360 });
  });
});

describe("el link", () => {
  it("se arma sobre el origen, sin barras de más", () => {
    expect(urlDeSeguimiento("https://vector.fdiaznem.com.ar/", "a".repeat(32))).toBe(`https://vector.fdiaznem.com.ar/seguir/${"a".repeat(32)}`);
  });
  it("reconoce la forma de un token", () => {
    expect(tokenValido("a".repeat(32))).toBe(true);
    expect(tokenValido("Ab-_" + "x".repeat(28))).toBe(true);
    expect(tokenValido("corto")).toBe(false);
    expect(tokenValido("../" + "x".repeat(40))).toBe(false);
  });
});

describe("hace cuánto", () => {
  const ahora = "2026-11-11T15:00:00Z";
  it("segundos, minutos y horas, con diferencias", () => {
    expect(haceCuanto("2026-11-11T14:59:20Z", ahora)).toBe("hace 40 s");
    expect(haceCuanto("2026-11-11T14:56:50Z", ahora)).toBe("hace 3 min");
    expect(haceCuanto("2026-11-11T13:55:00Z", ahora)).toBe("hace 1 h 05 min");
  });
  it("recién", () => {
    expect(haceCuanto("2026-11-11T14:59:58Z", ahora)).toBe("recién");
  });
  it("una hora en el futuro (reloj corrido) no da negativo", () => {
    expect(haceCuanto("2026-11-11T15:00:30Z", ahora)).toBe("recién");
  });
  it("sin hora o ilegible, nada", () => {
    expect(haceCuanto(null, ahora)).toBeNull();
    expect(haceCuanto("ayer", ahora)).toBeNull();
  });
  it("con la hora como la devuelve Supabase (microsegundos y +00:00)", () => {
    expect(haceCuanto("2026-11-11T14:59:20.123456+00:00", ahora)).toBe("hace 40 s");
  });
});

describe("lo que el teléfono recuerda", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const token = "T".repeat(32);
  const ahora = Date.parse("2026-11-11T15:00:00Z");
  it("un seguimiento vigente se retoma", () => {
    const t = JSON.stringify({ id, token, venceAt: "2026-11-12T00:00:00Z" });
    expect(leerSeguimientoGuardado(t, ahora)).toEqual({ id, token, venceAt: "2026-11-12T00:00:00Z" });
  });
  it("uno vencido, roto o ajeno es 'no hay'", () => {
    expect(leerSeguimientoGuardado(JSON.stringify({ id, token, venceAt: "2026-11-11T14:00:00Z" }), ahora)).toBeNull();
    expect(leerSeguimientoGuardado("{", ahora)).toBeNull();
    expect(leerSeguimientoGuardado(null, ahora)).toBeNull();
    expect(leerSeguimientoGuardado(JSON.stringify({ id: "x", token, venceAt: "2026-11-12T00:00:00Z" }), ahora)).toBeNull();
    expect(leerSeguimientoGuardado(JSON.stringify({ id, token: "corto", venceAt: "2026-11-12T00:00:00Z" }), ahora)).toBeNull();
  });
});

describe("cuándo se manda", () => {
  it("la primera vez, enseguida; después, cada 15 s", () => {
    expect(tocaMandar(null, 1000)).toBe(true);
    expect(tocaMandar(1000, 1000 + 5000)).toBe(false);
    expect(tocaMandar(1000, 1000 + CADA_MS)).toBe(true);
  });
});

describe("los estados", () => {
  it("en vuelo o terminó", () => {
    expect(tituloDelEstado("en_vuelo")).toBe("En vuelo");
    expect(tituloDelEstado("terminado")).toBe("El vuelo terminó");
    expect(tituloDelEstado("vencido")).toBe("El vuelo terminó");
  });
});

describe("los miles", () => {
  it("con punto, a mano", () => {
    expect(conMiles(1523.4)).toBe("1.523");
    expect(conMiles(950)).toBe("950");
    expect(conMiles(12000)).toBe("12.000");
    expect(conMiles(-120)).toBe("-120");
  });
});
