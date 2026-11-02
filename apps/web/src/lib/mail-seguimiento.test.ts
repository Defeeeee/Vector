import { describe, expect, it } from "vitest";
import { clicValido, conSeguimiento, destinoDe, pixelValido, urlClic, urlPixel } from "./mail-seguimiento";
import { armarMensajePrimerVuelo } from "./primer-vuelo-mail";

const APP = "https://vector.fdiaznem.com.ar";
const ID = "0b7f6a3e-2c1d-4e5f-8a9b-1c2d3e4f5a6b";
const OTRO = "11111111-2222-4333-8444-555555555555";
const S = "s3cr3to";

const partes = (url: string) => Object.fromEntries(new URL(url).searchParams);

describe("las firmas del seguimiento", () => {
  it("la imagen de apertura vale para su envío y no para otro", () => {
    const { e, f } = partes(urlPixel(APP, ID, S));
    expect(pixelValido(e, f, S)).toBe(true);
    expect(pixelValido(OTRO, f, S)).toBe(false);
    expect(pixelValido(e, f, "otro")).toBe(false);
    expect(pixelValido(e, "", S)).toBe(false);
    expect(pixelValido("no-es-un-uuid", f, S)).toBe(false);
  });

  it("la URL de la imagen no termina en una extensión de imagen (Cloudflare la bloquearía)", () => {
    expect(new URL(urlPixel(APP, ID, S)).pathname).toBe("/api/mail/a");
  });

  it("un clic vale para ese envío y ese destino: no es una redirección abierta", () => {
    const destino = `${APP}/dashboard/log-flight`;
    const { e, u, f } = partes(urlClic(APP, ID, destino, S));
    expect(u).toBe(destino);
    expect(clicValido(e, u, f, S)).toBe(true);
    // Cambiarle el destino al link firmado no sirve.
    expect(clicValido(e, "https://malo.example/phishing", f, S)).toBe(false);
    expect(clicValido(OTRO, u, f, S)).toBe(false);
    expect(clicValido(e, u, f, "")).toBe(false);
  });

  it("no firma destinos que no sean http(s)", () => {
    const { e, f } = partes(urlClic(APP, ID, "javascript:alert(1)", S));
    expect(clicValido(e, "javascript:alert(1)", f, S)).toBe(false);
  });

  it("la firma de la imagen no sirve como firma de un clic", () => {
    const { f } = partes(urlPixel(APP, ID, S));
    expect(clicValido(ID, APP, f, S)).toBe(false);
  });
});

describe("destinoDe", () => {
  it("de Vector guarda la ruta, sin query string", () => {
    expect(destinoDe(`${APP}/dashboard/planificador?ruta=SADF-SAZS`, APP)).toBe("/dashboard/planificador");
    expect(destinoDe(APP, APP)).toBe("/");
  });
  it("de afuera guarda sólo el dominio", () => {
    expect(destinoDe("https://wa.me/12015867983?text=Hola", APP)).toBe("wa.me");
  });
  it("un link roto no rompe el registro", () => {
    expect(destinoDe("nada", APP)).toBe("(link inválido)");
  });
});

describe("conSeguimiento", () => {
  const baja = `${APP}/mail/baja?u=x&t=y`;
  const html = `<!doctype html><html><head><link href="https://fonts.googleapis.com/css2?family=Nunito&display=swap" rel="stylesheet"></head><body>
<a href="${APP}/dashboard/planificador?ruta=SADF-SAZS&amp;x=1" style="color:red">Planificador</a>
<a href="mailto:hola@x.com">Escribinos</a>
<a href="${APP}/mail/baja?u=x&amp;t=y">No recibirlo más</a>
<img src="${APP}/hotlink-ok/correo/logo.png">
</body></html>`;
  const salida = conSeguimiento(html, { appUrl: APP, envioId: ID, secreto: S, sinSeguir: [baja] });

  it("pasa los links por la redirección, con el destino original intacto y firmado", () => {
    const m = salida.match(/<a href="([^"]+)" style="color:red">/)!;
    const link = m[1].replace(/&amp;/g, "&");
    expect(new URL(link).pathname).toBe("/api/mail/c");
    const { e, u, f } = partes(link);
    expect(u).toBe(`${APP}/dashboard/planificador?ruta=SADF-SAZS&x=1`);
    expect(clicValido(e, u, f, S)).toBe(true);
  });

  it("no toca la baja, los mailto, las fuentes ni las imágenes", () => {
    expect(salida).toContain(`href="${APP}/mail/baja?u=x&amp;t=y"`);
    expect(salida).toContain('href="mailto:hola@x.com"');
    expect(salida).toContain('<link href="https://fonts.googleapis.com/css2?family=Nunito&display=swap"');
    expect(salida).toContain(`<img src="${APP}/hotlink-ok/correo/logo.png">`);
  });

  it("agrega la imagen de apertura antes de cerrar el body, una sola vez", () => {
    expect(salida.split("/api/mail/a?").length - 1).toBe(1);
    expect(salida.indexOf("/api/mail/a?")).toBeLessThan(salida.indexOf("</body>"));
  });

  it("deja el HTML escapado: ningún & suelto en los atributos que escribe", () => {
    for (const m of salida.matchAll(/(?:href|src)="([^"]*\/api\/mail\/[^"]*)"/g)) {
      expect(m[1].replace(/&amp;/g, "")).not.toContain("&");
    }
  });

  it("con un mail de verdad: todos los links de la plantilla quedan medidos", () => {
    const mail = armarMensajePrimerVuelo({ nombre: "Lu", tieneAvion: true, tieneWhatsapp: true, appUrl: APP, linkCopiloto: "https://wa.me/12015867983?text=Hola" });
    const medido = conSeguimiento(mail.html, { appUrl: APP, envioId: ID, secreto: S });
    const links = [...medido.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
    expect(links.length).toBeGreaterThanOrEqual(5);
    for (const l of links) {
      const { e, u, f } = partes(l);
      expect(clicValido(e, u, f, S)).toBe(true);
    }
  });
});
