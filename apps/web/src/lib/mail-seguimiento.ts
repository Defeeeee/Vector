/**
 * El seguimiento propio de los mails: aperturas y clics, medidos por Vector.
 *
 * **Cómo funciona:**
 * - *Apertura*: el mail lleva una imagen de 1×1 (`/api/mail/a`). Cuando el cliente de
 *   correo la pide, se anota. La URL no termina en `.png` a propósito: Cloudflare bloquea
 *   el hotlinking de imágenes por extensión (ver `CARPETA_IMAGENES` en `mail-plantilla.ts`).
 * - *Clic*: cada link pasa por `/api/mail/c`, que anota a dónde iba y redirige.
 *
 * **Todo va firmado** con un HMAC del secreto de los barridos, por dos razones:
 * 1. Sin firma, `/api/mail/c?u=…` sería una redirección abierta: cualquiera podría armar
 *    un link de vector.fdiaznem.com.ar que mande a un sitio de phishing.
 * 2. Nadie puede inventar aperturas o clics de un envío ajeno.
 *
 * **Qué no mide, y el panel lo dice:** una apertura no prueba lectura (Apple Mail baja las
 * imágenes solo; Gmail las pide al abrir) y un clic puede ser el filtro de un correo
 * corporativo. Son indicios para comparar un mail con otro.
 * En la primera tanda de novedades, 6 de 15 mails pidieron la imagen en el primer minuto y
 * nunca más, incluido el de Federico, que sí lo abrió: en Gmail, si la imagen ya se bajó,
 * la apertura de más tarde no se ve. Por eso el backend cuenta eso como un tercer estado,
 * "al instante" (`services/mails.py`). Acá se anota todo; el corte es al contar.
 *
 * **Lo que se guarda de un clic es a dónde iba, sin query string:** la ruta de Vector o
 * el dominio de afuera (`destinoDe`). El link de la baja no se mide.
 *
 * Puro: recibe el secreto y devuelve texto. Las rutas y el envío están en `api/mail/` y
 * `lib/mail-envio.ts`.
 */
import { createHmac, timingSafeEqual } from "crypto";

const ETIQUETA = "vector:mail:seguimiento:";

function firmar(secreto: string, ...partes: string[]): string {
  return createHmac("sha256", secreto).update(ETIQUETA + partes.join("\n")).digest("base64url");
}

function coincide(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** La imagen de 1×1 que anota la apertura. */
export function urlPixel(appUrl: string, envioId: string, secreto: string): string {
  return `${appUrl}/api/mail/a?${new URLSearchParams({ e: envioId, f: firmar(secreto, "a", envioId) })}`;
}

/** El link que anota el clic y redirige a `destino`. */
export function urlClic(appUrl: string, envioId: string, destino: string, secreto: string): string {
  return `${appUrl}/api/mail/c?${new URLSearchParams({ e: envioId, u: destino, f: firmar(secreto, "c", envioId, destino) })}`;
}

export function pixelValido(envioId: string, firma: string, secreto: string): boolean {
  return !!secreto && UUID.test(envioId) && !!firma && coincide(firmar(secreto, "a", envioId), firma);
}

export function clicValido(envioId: string, destino: string, firma: string, secreto: string): boolean {
  return (
    !!secreto && UUID.test(envioId) && /^https?:\/\//i.test(destino) && !!firma && coincide(firmar(secreto, "c", envioId, destino), firma)
  );
}

/**
 * Lo que se guarda de un clic: la ruta si el link es de Vector, el dominio si es de
 * afuera. Sin query string: ahí puede ir la ruta de un vuelo o un token.
 */
export function destinoDe(url: string, appUrl: string): string {
  try {
    const u = new URL(url);
    if (u.origin === new URL(appUrl).origin) return u.pathname || "/";
    return u.hostname;
  } catch {
    return "(link inválido)";
  }
}

const desescapar = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const escapar = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface Seguimiento {
  appUrl: string;
  envioId: string;
  secreto: string;
  /** Links que no se miden: la baja, que tiene que andar aunque el seguimiento falle. */
  sinSeguir?: string[];
}

/**
 * El HTML de un mail, con los links pasados por la redirección y la imagen de apertura
 * al final. Sólo toca los `<a href="http…">`: ni el `<link>` de las fuentes, ni los
 * `mailto:`, ni lo que esté en `sinSeguir`.
 */
export function conSeguimiento(html: string, s: Seguimiento): string {
  const fuera = new Set(s.sinSeguir ?? []);
  const conLinks = html.replace(/(<a\b[^>]*?\bhref=")([^"]+)(")/gi, (todo, antes: string, valor: string, despues: string) => {
    const url = desescapar(valor);
    if (!/^https?:\/\//i.test(url) || fuera.has(url)) return todo;
    return `${antes}${escapar(urlClic(s.appUrl, s.envioId, url, s.secreto))}${despues}`;
  });
  const pixel = `<img src="${escapar(urlPixel(s.appUrl, s.envioId, s.secreto))}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px">`;
  return conLinks.includes("</body>") ? conLinks.replace("</body>", `${pixel}\n</body>`) : conLinks + pixel;
}
