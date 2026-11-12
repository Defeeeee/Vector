import { describe, expect, it } from "vitest";
import {
  CADA_MS,
  conMiles,
  detalleDeVistas,
  idDeVisitanteValido,
  idDesdeBytes,
  textoDeVistas,
  vistasDeRespuesta,
  haceCuanto,
  leerSeguimientoGuardado,
  posicionDeLectura,
  rotuloDeAltura,
  textoDeFuente,
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
    expect(urlDeSeguimiento("https://vectoraero.ar/", "a".repeat(32))).toBe(`https://vectoraero.ar/seguir/${"a".repeat(32)}`);
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
    expect(leerSeguimientoGuardado(t, ahora)).toEqual({ id, token, venceAt: "2026-11-12T00:00:00Z", mostrarMatricula: false });
  });
  it("recuerda si la matrícula estaba prendida", () => {
    const t = JSON.stringify({ id, token, venceAt: "2026-11-12T00:00:00Z", mostrarMatricula: true });
    expect(leerSeguimientoGuardado(t, ahora)?.mostrarMatricula).toBe(true);
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

describe("quién mira el link", () => {
  const base = { mirandoAhora: 0, vistosTotal: 0, ultimaVistaAt: null, ahora: "2026-11-11T15:00:00Z" };
  it("el id generado tiene la forma que acepta el backend", () => {
    const id = idDesdeBytes(Array.from({ length: 16 }, (_, i) => i * 17));
    expect(id).toHaveLength(16);
    expect(idDeVisitanteValido(id)).toBe(true);
    expect(idDeVisitanteValido("corto")).toBe(false);
    expect(idDeVisitanteValido(null)).toBe(false);
    expect(idDeVisitanteValido("con espacio 1234567")).toBe(false);
  });
  it("lee la respuesta del backend, y null si no trae los campos", () => {
    expect(vistasDeRespuesta({ aceptada: true, mirando_ahora: 2, vistos_total: 4, ultima_vista_at: "2026-11-11T14:59:00Z", ahora: "2026-11-11T15:00:00Z" })).toEqual({
      mirandoAhora: 2,
      vistosTotal: 4,
      ultimaVistaAt: "2026-11-11T14:59:00Z",
      ahora: "2026-11-11T15:00:00Z",
    });
    expect(vistasDeRespuesta({ aceptada: true })).toBeNull();
    expect(vistasDeRespuesta(null)).toBeNull();
  });
  it("el chip: mirando, visto hace un rato, o nadie", () => {
    expect(textoDeVistas({ ...base, mirandoAhora: 2, vistosTotal: 2 })).toBe("2 te están mirando");
    expect(textoDeVistas({ ...base, mirandoAhora: 1, vistosTotal: 1 })).toBe("1 te está mirando");
    expect(textoDeVistas({ ...base, vistosTotal: 1, ultimaVistaAt: "2026-11-11T14:57:00Z" })).toBe("te vieron hace 3 min");
    expect(textoDeVistas(base)).toBe("nadie abrió el link todavía");
    expect(textoDeVistas(null)).toBeNull();
  });
  it("el detalle cuenta personas", () => {
    expect(detalleDeVistas({ ...base, mirandoAhora: 1, vistosTotal: 4 })).toBe("1 te está mirando ahora · 4 personas abrieron el link.");
    expect(detalleDeVistas({ ...base, vistosTotal: 1, ultimaVistaAt: "2026-11-11T14:57:00Z" })).toBe("1 persona abrió el link; la última vez, hace 3 min.");
    expect(detalleDeVistas(base)).toBe("Nadie abrió el link todavía.");
  });
});

describe("de dónde salió la posición", () => {
  it("lo dice en palabras", () => {
    expect(textoDeFuente("gps")).toBe("GPS del teléfono");
    expect(textoDeFuente("adsb")).toBe("ADS-B");
    expect(textoDeFuente(undefined)).toBeNull();
  });
  it("la altura de ADS-B no se llama GPS", () => {
    expect(rotuloDeAltura("adsb")).toBe("Altitud ADS-B");
    expect(rotuloDeAltura("gps")).toBe("Altura GPS");
    expect(rotuloDeAltura(undefined)).toBe("Altura GPS");
  });
});
