import { describe, it, expect } from "vitest";
import { vidaRestante, necesitaRenovar, MARGEN_MS } from "./sesion";

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
