import { describe, expect, it } from "vitest";
import { armarMensajePrimerVuelo, cuandoFueElAlta, type DatosPrimerVuelo } from "./primer-vuelo-mail";

const base: DatosPrimerVuelo = {
  nombre: "Lucía",
  tieneAvion: false,
  tieneWhatsapp: false,
  appUrl: "https://vector.fdiaznem.com.ar",
  linkCopiloto: null,
};

describe("el mail del día siguiente al alta", () => {
  it("saluda por el nombre, y sin nombre no queda un hueco", () => {
    expect(armarMensajePrimerVuelo(base).asunto).toBe("Lucía, ¿cargamos tu primer vuelo?");
    expect(armarMensajePrimerVuelo({ ...base, nombre: "  " }).asunto).toBe("¿Cargamos tu primer vuelo?");
  });

  it("no le dice 'ayer' a quien se registró hace más días", () => {
    expect(cuandoFueElAlta(undefined)).toBe("Ayer");
    expect(cuandoFueElAlta(1)).toBe("Ayer");
    expect(cuandoFueElAlta(2)).toBe("Anteayer");
    expect(cuandoFueElAlta(3)).toBe("Hace 3 días");
    expect(armarMensajePrimerVuelo({ ...base, diasDesdeElAlta: 3 }).texto).toContain("Hace 3 días te hiciste la cuenta");
    expect(armarMensajePrimerVuelo(base).texto).toContain("Ayer te hiciste la cuenta");
  });

  it("ofrece las tres formas, con sus links", () => {
    const { texto } = armarMensajePrimerVuelo(base);
    expect(texto).toContain("1. Con un audio");
    expect(texto).toContain("2. Con tu libro de papel");
    expect(texto).toContain("https://vector.fdiaznem.com.ar/dashboard/log-flight/import");
    expect(texto).toContain("3. A mano");
  });

  it("sin avión, manda primero al Hangar; con avión, directo a registrar", () => {
    expect(armarMensajePrimerVuelo(base).texto).toContain("primero cargá el avión");
    const conAvion = armarMensajePrimerVuelo({ ...base, tieneAvion: true });
    expect(conAvion.texto).not.toContain("primero cargá el avión");
    expect(conAvion.html).toContain('href="https://vector.fdiaznem.com.ar/dashboard/log-flight"');
  });

  it("sin número, pide dejarlo; con número y link del copiloto, abre WhatsApp", () => {
    expect(armarMensajePrimerVuelo(base).texto).toContain("Dejá tu celular en el Hangar");
    const conWhatsapp = armarMensajePrimerVuelo({ ...base, tieneWhatsapp: true, linkCopiloto: "https://wa.me/5491100000000?text=Hola" });
    expect(conWhatsapp.html).toContain("https://wa.me/5491100000000");
    expect(conWhatsapp.html).toContain("Abrir WhatsApp");
  });

  it("dice que es uno solo", () => {
    expect(armarMensajePrimerVuelo(base).texto).toContain("una sola vez");
  });

  it("escapa el nombre en el HTML", () => {
    const { html } = armarMensajePrimerVuelo({ ...base, nombre: "<b>Lu</b>" });
    expect(html).toContain("&lt;b&gt;Lu&lt;/b&gt;");
    expect(html).not.toContain("<b>Lu</b>");
  });
});
