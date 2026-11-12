import { describe, it, expect } from "vitest";
import { vidaRestante, necesitaRenovar, MARGEN_MS, destinoSinSesion, DURACION_SESION_S, volverSeguro, loginCon, dominioDeCookie, hostDelPedido } from "./sesion";

const AHORA = new Date("2026-08-18T12:00:00Z").getTime();

/** Un JWT con la forma correcta y el payload que le pidamos. Sin firma real: no hace falta. */
function jwt(payload: Record<string, unknown>): string {
  const b64 = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.firmafalsa`;
}

describe("vidaRestante", () => {
  it("devuelve los milisegundos que faltan para el exp", () => {
    const token = jwt({ exp: AHORA / 1000 + 3600 });
    expect(vidaRestante(token, AHORA)).toBe(3600 * 1000);
  });

  it("es negativa si el token ya venció", () => {
    const token = jwt({ exp: AHORA / 1000 - 120 });
    expect(vidaRestante(token, AHORA)).toBe(-120 * 1000);
  });

  it("aguanta acentos en el payload", () => {
    // El JWT de Supabase trae nombre y apellido. `atob` devuelve bytes crudos, así que
    // sin decodificar UTF-8 esto rompía sólo para algunas cuentas.
    const token = jwt({ exp: AHORA / 1000 + 60, user_metadata: { last_name: "Díaz Nemeth" } });
    expect(vidaRestante(token, AHORA)).toBe(60 * 1000);
  });

  it("devuelve null y no cero cuando no hay token", () => {
    // La diferencia importa: null es 'no sé', cero sería 'vencido justo ahora'.
    expect(vidaRestante(undefined, AHORA)).toBeNull();
    expect(vidaRestante("", AHORA)).toBeNull();
  });

  it("devuelve null si no tiene las tres partes de un JWT", () => {
    expect(vidaRestante("no-es-un-jwt", AHORA)).toBeNull();
    expect(vidaRestante("dos.partes", AHORA)).toBeNull();
  });

  it("devuelve null si el payload no es JSON", () => {
    expect(vidaRestante("aaa.$$$$.bbb", AHORA)).toBeNull();
  });

  it("devuelve null si no hay exp, o si exp no es un número", () => {
    expect(vidaRestante(jwt({ sub: "alguien" }), AHORA)).toBeNull();
    expect(vidaRestante(jwt({ exp: "3600" }), AHORA)).toBeNull();
  });
});

describe("necesitaRenovar", () => {
  const vivo = jwt({ exp: AHORA / 1000 + 3600 });
  const vencido = jwt({ exp: AHORA / 1000 - 60 });
  const porVencer = jwt({ exp: AHORA / 1000 + 60 });

  it("no renueva un token que está lejos de vencer", () => {
    expect(necesitaRenovar(vivo, "refresh", AHORA)).toBe(false);
  });

  it("renueva un token vencido", () => {
    expect(necesitaRenovar(vencido, "refresh", AHORA)).toBe(true);
  });

  it("renueva antes de que venza, no cuando ya venció", () => {
    // Éste es el punto del margen: un render que arranca con un minuto de token por
    // delante hace sus llamadas a la API con el token ya muerto.
    expect(necesitaRenovar(porVencer, "refresh", AHORA)).toBe(true);
  });

  it("el margen es el límite exacto", () => {
    const justo = jwt({ exp: (AHORA + MARGEN_MS) / 1000 });
    expect(necesitaRenovar(justo, "refresh", AHORA)).toBe(false);
    const unSegundoMenos = jwt({ exp: (AHORA + MARGEN_MS - 1000) / 1000 });
    expect(necesitaRenovar(unSegundoMenos, "refresh", AHORA)).toBe(true);
  });

  it("renueva si no hay session_token pero sí refresh_token", () => {
    // Volver al día siguiente: la cookie de sesión caducó sola, la de refresh dura 30 días.
    expect(necesitaRenovar(undefined, "refresh", AHORA)).toBe(true);
  });

  it("no renueva nada sin refresh_token", () => {
    expect(necesitaRenovar(vencido, undefined, AHORA)).toBe(false);
    expect(necesitaRenovar(undefined, undefined, AHORA)).toBe(false);
    expect(necesitaRenovar(undefined, "", AHORA)).toBe(false);
  });

  it("no renueva un token ilegible", () => {
    // No se toca lo que no se entiende: que decida la API, como antes de todo esto.
    expect(necesitaRenovar("cualquier-cosa", "refresh", AHORA)).toBe(false);
    expect(necesitaRenovar(jwt({ sub: "sin-exp" }), "refresh", AHORA)).toBe(false);
  });
});

describe("sin sesión", () => {
  it("si hubo una, el login avisa que expiró", () => {
    expect(destinoSinSesion(true)).toBe("/login?expirada=1");
  });
  it("si nunca entró, el login a secas", () => {
    expect(destinoSinSesion(false)).toBe("/login");
  });
  it("la sesión dura dos días sin uso", () => {
    expect(DURACION_SESION_S).toBe(2 * 24 * 3600);
  });
});

describe("volver a donde estabas", () => {
  it("acepta una pantalla del dashboard, con su búsqueda", () => {
    expect(volverSeguro("/dashboard/mapa?ruta=SADF-SADM")).toBe("/dashboard/mapa?ruta=SADF-SADM");
    expect(volverSeguro(encodeURIComponent("/dashboard/history?ver=v1"))).toBe("/dashboard/history?ver=v1");
  });
  it("no lleva a otro sitio ni a la API", () => {
    for (const malo of ["https://malo.example", "//malo.example", "/dashboardx", "/api/export", "/dashboard//malo.example", "/dashboard\\malo", "javascript:alert(1)", "", null, "%E0%A4%A"])
      expect(volverSeguro(malo as string | null)).toBeNull();
  });
  it("arma el link del login", () => {
    expect(loginCon("/login?expirada=1", "/dashboard/mapa")).toBe("/login?expirada=1&volver=%2Fdashboard%2Fmapa");
    expect(loginCon("/login", "/dashboard")).toBe("/login");
    expect(loginCon("/login", "https://malo.example")).toBe("/login");
  });
});

describe("dominioDeCookie", () => {
  it("el dominio nuevo y sus subdominios comparten la cookie", () => {
    expect(dominioDeCookie("vectoraero.ar")).toBe(".vectoraero.ar");
    expect(dominioDeCookie("www.vectoraero.ar")).toBe(".vectoraero.ar");
    expect(dominioDeCookie("api.vectoraero.ar")).toBe(".vectoraero.ar");
  });
  it("el dominio viejo sigue con el suyo", () => {
    expect(dominioDeCookie("vector.fdiaznem.com.ar")).toBe(".fdiaznem.com.ar");
    expect(dominioDeCookie("Vector.FDiazNem.com.ar:443")).toBe(".fdiaznem.com.ar");
  });
  it("cualquier otro host va sin domain", () => {
    expect(dominioDeCookie("localhost:3000")).toBeUndefined();
    expect(dominioDeCookie("vector-git-x.vercel.app")).toBeUndefined();
    expect(dominioDeCookie(null)).toBeUndefined();
    expect(dominioDeCookie("")).toBeUndefined();
  });
  it("no se deja engañar por dominios parecidos", () => {
    expect(dominioDeCookie("evilvectoraero.ar")).toBeUndefined();
    expect(dominioDeCookie("vectoraero.ar.evil.com")).toBeUndefined();
    expect(dominioDeCookie("xfdiaznem.com.ar")).toBeUndefined();
  });
  it("con varios hosts reenviados toma el primero", () => {
    expect(dominioDeCookie("vectoraero.ar, proxy.interno")).toBe(".vectoraero.ar");
  });
});

describe("hostDelPedido", () => {
  it("prefiere x-forwarded-host", () => {
    const h = new Headers({ host: "127.0.0.1:3010", "x-forwarded-host": "vectoraero.ar" });
    expect(hostDelPedido(h)).toBe("vectoraero.ar");
    expect(hostDelPedido(new Headers({ host: "localhost:3000" }))).toBe("localhost:3000");
  });
});
