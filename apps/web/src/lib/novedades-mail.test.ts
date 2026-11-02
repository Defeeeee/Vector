import { describe, expect, it } from "vitest";
import { armarMensajeNovedades, novedades, type DatosNovedades } from "./novedades-mail";

const base: DatosNovedades = {
  nombre: "Lucía",
  tieneVuelos: false,
  appUrl: "https://vector.fdiaznem.com.ar",
  linkCopiloto: "https://wa.me/12015867983?text=Hola",
  linkBaja: "https://vector.fdiaznem.com.ar/mail/baja?u=u&t=t&m=novedades",
};

describe("el mail de novedades", () => {
  it("saluda por el nombre, y sin nombre no deja un hueco", () => {
    expect(armarMensajeNovedades(base).asunto).toBe("Lucía, tus vuelos al CAD desde Vector");
    const sin = armarMensajeNovedades({ ...base, nombre: " " });
    expect(sin.asunto).toBe("Tus vuelos al CAD desde Vector");
    expect(sin.texto.startsWith("Sumamos cosas")).toBe(true);
  });

  it("el botón del final depende de si ya cargó vuelos", () => {
    expect(armarMensajeNovedades(base).html).toContain("Cargar mi primer vuelo");
    const conVuelos = armarMensajeNovedades({ ...base, tieneVuelos: true });
    expect(conVuelos.html).toContain("Abrir mi bitácora");
    expect(conVuelos.html).not.toContain("Cargar mi primer vuelo");
  });

  it("al alumno no le cuenta el CAD, que es para pilotos con licencia", () => {
    const m = armarMensajeNovedades({ ...base, alumno: true });
    expect(m.html).not.toContain("/dashboard/history/cad");
    expect(m.texto).not.toContain("CAD");
    expect(m.asunto).toBe("Lucía, el plan de vuelo ahora sale desde Vector");
    expect(m.html).toContain("/dashboard/plan-de-vuelo");
    expect(armarMensajeNovedades(base).html).toContain("/dashboard/history/cad");
  });

  it("cada link lleva a una pantalla que existe", async () => {
    const { existsSync } = await import("node:fs");
    for (const n of [...novedades(base), ...novedades({ ...base, alumno: true })]) {
      if (!n.link) continue;
      const ruta = new URL(n.link.url).pathname;
      expect(existsSync(`src/app${ruta}/page.tsx`), ruta).toBe(true);
    }
  });

  it("lleva la baja en el texto y en el HTML", () => {
    const m = armarMensajeNovedades(base);
    expect(m.texto).toContain(base.linkBaja);
    expect(m.html).toContain("No recibirlas más");
    expect(m.html).toContain("m=novedades");
  });

  it("el texto plano cuenta lo mismo que el HTML", () => {
    const m = armarMensajeNovedades(base);
    for (const n of novedades(base)) {
      expect(m.texto).toContain(n.titulo);
      expect(m.html).toContain(n.titulo);
    }
  });

  it("no promete lo que no está decidido", () => {
    const m = armarMensajeNovedades(base);
    for (const palabra of ["gratis", "oficial"]) {
      expect(m.texto.toLowerCase()).not.toContain(palabra);
      expect(m.html.toLowerCase()).not.toContain(palabra);
    }
  });

  it("escapa el nombre", () => {
    expect(armarMensajeNovedades({ ...base, nombre: "<b>x</b>" }).html).not.toContain("<b>x</b>");
  });
});
