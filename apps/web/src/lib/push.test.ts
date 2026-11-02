import { describe, expect, it } from "vitest";
import { claveDeAplicacion, destinoDelAviso, esDispositivoIOS, estadoDeAvisos, leerAviso } from "./push";

const base = { soportaPush: true, esIOS: false, instalada: false, permiso: "default" as const, suscripto: false };

describe("estadoDeAvisos", () => {
  it("en un iPhone sin instalar la app explica cómo, aunque Safari no tenga push", () => {
    expect(estadoDeAvisos({ ...base, esIOS: true, soportaPush: false })).toBe("instalar-app");
  });

  it("con la app instalada en el iPhone, se ofrece como en cualquier lado", () => {
    expect(estadoDeAvisos({ ...base, esIOS: true, instalada: true })).toBe("apagados");
  });

  it("sin push en el navegador no se ofrece nada", () => {
    expect(estadoDeAvisos({ ...base, soportaPush: false })).toBe("sin-soporte");
  });

  it("rechazados en el navegador, sólo se pueden destrabar desde ahí", () => {
    expect(estadoDeAvisos({ ...base, permiso: "denied" })).toBe("bloqueados");
  });

  it("prendidos sólo con permiso y suscripción: una sola no alcanza", () => {
    expect(estadoDeAvisos({ ...base, permiso: "granted", suscripto: true })).toBe("prendidos");
    expect(estadoDeAvisos({ ...base, permiso: "granted", suscripto: false })).toBe("apagados");
    expect(estadoDeAvisos({ ...base, permiso: "default", suscripto: true })).toBe("apagados");
  });
});

describe("esDispositivoIOS", () => {
  it("reconoce el iPhone y el iPad que se presenta como Mac", () => {
    expect(esDispositivoIOS("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)", "iPhone", 5)).toBe(true);
    expect(esDispositivoIOS("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 5)).toBe(true);
  });

  it("una Mac de verdad o un Android no son iOS", () => {
    expect(esDispositivoIOS("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 0)).toBe(false);
    expect(esDispositivoIOS("Mozilla/5.0 (Linux; Android 14)", "Linux armv8l", 5)).toBe(false);
  });
});

describe("claveDeAplicacion", () => {
  it("decodifica base64url, con o sin relleno", () => {
    expect(Array.from(claveDeAplicacion("AQID"))).toEqual([1, 2, 3]);
    expect(Array.from(claveDeAplicacion("-_8"))).toEqual([251, 255]);
  });

  it("una clave VAPID pública tiene 65 bytes", () => {
    const clave = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
    expect(claveDeAplicacion(clave)).toHaveLength(65);
  });
});

describe("destinoDelAviso", () => {
  it("lleva a una ruta de Vector", () => {
    expect(destinoDelAviso("/dashboard/pilotos/fede.dn")).toBe("/dashboard/pilotos/fede.dn");
  });

  it("nunca afuera de Vector", () => {
    for (const url of ["https://otro.sitio", "//otro.sitio/x", "/\\otro.sitio", "javascript:alert(1)", null, 3]) {
      expect(destinoDelAviso(url)).toBe("/dashboard/pilotos/actividad");
    }
  });
});

describe("leerAviso", () => {
  it("lee el aviso del backend", () => {
    const aviso = leerAviso(
      JSON.stringify({ titulo: "Ana aplaudió tu publicación", cuerpo: "Primer solo", url: "/dashboard/pilotos/actividad", etiqueta: "vector-aplauso" })
    );
    expect(aviso).toEqual({
      titulo: "Ana aplaudió tu publicación",
      cuerpo: "Primer solo",
      url: "/dashboard/pilotos/actividad",
      etiqueta: "vector-aplauso",
    });
  });

  it("si llega algo raro, avisa igual con un texto genérico", () => {
    expect(leerAviso("no es json").titulo).toBe("Vector");
    expect(leerAviso(JSON.stringify({ titulo: "" })).titulo).toBe("Vector");
    expect(leerAviso(null).url).toBe("/dashboard/pilotos/actividad");
  });

  it("no deja que el aviso lleve afuera", () => {
    expect(leerAviso(JSON.stringify({ titulo: "x", url: "https://otro.sitio" })).url).toBe("/dashboard/pilotos/actividad");
  });
});
