import { describe, expect, it } from "vitest";
import { LINK_SUPABASE, mailConfirmarCuenta, mailRecuperarContrasena } from "./mails-auth";

const APP = "https://vector.fdiaznem.com.ar";

describe("los mails de Supabase Auth", () => {
  for (const [nombre, armar] of [["confirmar", mailConfirmarCuenta], ["recuperar", mailRecuperarContrasena]] as const) {
    it(`${nombre}: el link es la variable de Supabase, intacta, en el botón y en el respaldo`, () => {
      const { html } = armar(APP);
      expect(html.split(`href="${LINK_SUPABASE}"`).length - 1).toBeGreaterThanOrEqual(2);
    });

    it(`${nombre}: no hay otras llaves de Go template, que Supabase trataría de interpretar`, () => {
      const { html } = armar(APP);
      expect(html.replaceAll(LINK_SUPABASE, "").includes("{{")).toBe(false);
    });

    it(`${nombre}: el logo sale del dominio público y hay asunto`, () => {
      const m = armar(APP);
      expect(m.html).toContain(`${APP}/hotlink-ok/correo/logo.png`);
      expect(m.asunto.length).toBeGreaterThan(10);
      expect(m.html).not.toContain("undefined");
    });
  }
});
