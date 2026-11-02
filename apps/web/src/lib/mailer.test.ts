import { afterEach, describe, expect, it } from "vitest";
import { direccionDeEnvio, remitente } from "./mailer";

/**
 * El remitente del briefing.
 *
 * `enviarMail` no se testea acá —pega contra Resend—, pero **de qué dirección sale el mail
 * sí es una decisión propia**, y es la que un dominio nuevo hace equivocar: se configura una
 * variable, no se ve nada hasta el día siguiente a las seis de la tarde, y si estaba mal el
 * mail salió del remitente de prueba sin que nadie se entere.
 */

const original = process.env.RESEND_FROM;
afterEach(() => {
  if (original === undefined) delete process.env.RESEND_FROM;
  else process.env.RESEND_FROM = original;
});

describe("remitente", () => {
  it("sin configurar usa el de prueba y no se queja", () => {
    delete process.env.RESEND_FROM;
    expect(remitente()).toEqual({ from: "Vector <onboarding@resend.dev>" });
  });

  it("una dirección configurada se usa tal cual", () => {
    process.env.RESEND_FROM = "Vector <briefing@vector.fdiaznem.com.ar>";
    expect(remitente()).toEqual({ from: "Vector <briefing@vector.fdiaznem.com.ar>" });
  });

  it("una casilla pelada también sirve: Resend acepta las dos formas", () => {
    process.env.RESEND_FROM = "briefing@vector.fdiaznem.com.ar";
    expect(remitente().from).toBe("briefing@vector.fdiaznem.com.ar");
    expect(remitente().aviso).toBeUndefined();
  });

  it("**el dominio pelado avisa, que es el error fácil de cometer**", () => {
    /*
      Verificar `vector.fdiaznem.com.ar` en Resend y después poner eso mismo como remitente
      es el paso en falso natural. Sin arroba no es una dirección: Resend contestaría 422 y
      el motivo quedaría enterrado en el log del barrido del día siguiente.
    */
    process.env.RESEND_FROM = "vector.fdiaznem.com.ar";
    const r = remitente();
    expect(r.from).toBe("Vector <onboarding@resend.dev>");
    expect(r.aviso).toContain("vector.fdiaznem.com.ar");
    expect(r.aviso).toContain("casilla");
  });

  it("vacío o en blanco es lo mismo que no configurado", () => {
    process.env.RESEND_FROM = "   ";
    expect(remitente()).toEqual({ from: "Vector <onboarding@resend.dev>" });
  });
});

describe("direccionDeEnvio", () => {
  const VECTOR = "Vector <briefing@vector.fdiaznem.com.ar>";

  it("sin cambios, el remitente configurado tal cual", () => {
    expect(direccionDeEnvio(VECTOR, {})).toBe(VECTOR);
  });

  it("el plan de vuelo: otra casilla del dominio verificado, con el nombre del piloto", () => {
    expect(direccionDeEnvio(VECTOR, { casilla: "plandevuelo", nombreRemitente: "Lucía Ferrari vía Vector" })).toBe(
      "Lucía Ferrari vía Vector <plandevuelo@vector.fdiaznem.com.ar>"
    );
    expect(direccionDeEnvio(VECTOR, { casilla: "plandevuelo" })).toBe("Vector <plandevuelo@vector.fdiaznem.com.ar>");
    expect(direccionDeEnvio("briefing@vector.fdiaznem.com.ar", { casilla: "plandevuelo" })).toBe("plandevuelo@vector.fdiaznem.com.ar");
  });

  it("con el remitente de prueba de Resend no inventa una casilla", () => {
    expect(direccionDeEnvio("Vector <onboarding@resend.dev>", { casilla: "plandevuelo" })).toBe("Vector <onboarding@resend.dev>");
  });

  it("el nombre no puede romper la dirección", () => {
    expect(direccionDeEnvio(VECTOR, { nombreRemitente: 'X <a@b.c> "y"' })).toBe("X a@b.c y <briefing@vector.fdiaznem.com.ar>");
  });
});
