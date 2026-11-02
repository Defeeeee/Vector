import { describe, expect, it } from "vitest";
import { firmaBaja, firmaValida, linksDeBaja, tipoDeBaja } from "./baja-mail";

describe("baja del resumen mensual", () => {
  const secreto = "s3cr3to";

  it("la firma de una cuenta vale para esa cuenta y no para otra", () => {
    const t = firmaBaja("u1", secreto);
    expect(firmaValida("u1", t, secreto)).toBe(true);
    expect(firmaValida("u2", t, secreto)).toBe(false);
  });

  it("no vale con otro secreto, vacía o recortada", () => {
    const t = firmaBaja("u1", secreto);
    expect(firmaValida("u1", t, "otro")).toBe(false);
    expect(firmaValida("u1", "", secreto)).toBe(false);
    expect(firmaValida("u1", t.slice(1), secreto)).toBe(false);
    expect(firmaValida("u1", t, "")).toBe(false);
  });

  it("los links llevan la cuenta y la firma, listos para una URL", () => {
    const { pagina, unClick } = linksDeBaja("https://v.ar", "u1", secreto);
    const u = new URL(pagina);
    expect(u.pathname).toBe("/mail/baja");
    expect(firmaValida(u.searchParams.get("u")!, u.searchParams.get("t")!, secreto)).toBe(true);
    expect(new URL(unClick).pathname).toBe("/api/mail/baja");
  });

  it("la baja de novedades es otra: su firma no sirve para el resumen, ni al revés", () => {
    const t = firmaBaja("u1", secreto, "novedades");
    expect(firmaValida("u1", t, secreto, "novedades")).toBe(true);
    expect(firmaValida("u1", t, secreto, "resumen")).toBe(false);
    expect(firmaValida("u1", firmaBaja("u1", secreto), secreto, "novedades")).toBe(false);
  });

  it("el link de novedades dice de qué mail es; el del resumen queda como siempre", () => {
    expect(new URL(linksDeBaja("https://v.ar", "u1", secreto, "novedades").pagina).searchParams.get("m")).toBe("novedades");
    expect(new URL(linksDeBaja("https://v.ar", "u1", secreto).pagina).searchParams.has("m")).toBe(false);
    expect(tipoDeBaja("novedades")).toBe("novedades");
    expect(tipoDeBaja(null)).toBe("resumen");
    expect(tipoDeBaja("cualquiera")).toBe("resumen");
  });
});
