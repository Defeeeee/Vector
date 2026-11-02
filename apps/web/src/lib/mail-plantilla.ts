/**
 * La plantilla de los mails de Vector: la misma estética de la landing.
 *
 * El logo de la barra (el cuadrado negro con la brújula), la etiqueta en mayúsculas
 * monoespaciada, el título grande con la segunda línea en azul aviación, las tarjetas
 * blancas de borde suave y el botón negro redondeado.
 *
 * **Cómo está hecha, y por qué así:**
 * - Con tablas y estilos en línea. Gmail borra el `<style>` en varios de sus clientes,
 *   y Outlook dibuja con el motor de Word, que no entiende flex ni grid.
 * - Las imágenes son PNG en el dominio público (`public/hotlink-ok/correo/`, las arma
 *   `npm run build:correo`): ningún cliente de correo muestra SVG.
 * - La tipografía es Nunito donde el cliente carga fuentes web (Apple Mail, iOS) y la
 *   del sistema donde no (Gmail).
 * - Sólo modo claro, declarado: los clientes que invierten colores solos arruinan el
 *   contraste del título azul sobre blanco.
 *
 * Todo el texto que entra acá ya viene escapado: las funciones de abajo escapan lo suyo
 * y reciben HTML armado sólo de `bloque`, `boton` y compañía.
 */

export const escapar = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const FUENTE = "'Nunito',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
export const MONO = "'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,monospace";
export const AZUL = "#2563eb";
export const NEGRO = "#18181b";
export const GRIS = "#52525b";
export const GRIS_CLARO = "#a1a1aa";
export const BORDE = "#e4e4e7";

/**
 * La carpeta de las imágenes en el dominio público. **Se llama `hotlink-ok` a propósito:**
 * el dominio está detrás de Cloudflare con la protección contra hotlinking prendida, que
 * contesta 403 a toda imagen pedida con el `Referer` de otro sitio. Gmail no la sufre
 * (baja las imágenes con su servidor, sin `Referer`), pero un correo web que las pide
 * desde el navegador recibía el mail sin logo ni íconos, y mail-tester lo contaba como
 * cuatro links rotos (2026-10-02). Cloudflare exceptúa lo que está bajo una carpeta con
 * ese nombre, así que no hace falta tocar la configuración de la cuenta.
 *
 * `public/correo/` se queda: los mails ya enviados apuntan ahí.
 */
export const CARPETA_IMAGENES = "/hotlink-ok/correo";

/** La imagen por URL absoluta. */
const imagen = (appUrl: string, nombre: string) => `${appUrl}${CARPETA_IMAGENES}/${nombre}.png`;

export type Icono =
  | "mic" | "file-text" | "pencil-line" | "plane" | "target" | "wallet" | "triangle-alert"
  | "zap" | "smartphone" | "mail";

/** La etiqueta en mayúsculas espaciadas, como "LO QUE ABRÍS ANTES DE VOLAR". */
export function etiqueta(texto: string, color = "#71717a"): string {
  return `<p style="margin:0 0 12px;font-family:${MONO};font-size:11px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:${color}">${escapar(texto)}</p>`;
}

/** Un párrafo del cuerpo. */
export function parrafo(texto: string): string {
  return `<p style="margin:0 0 14px;font-family:${FUENTE};font-size:15px;line-height:1.6;color:${GRIS}">${escapar(texto)}</p>`;
}

/** El botón negro redondeado ("Crear mi bitácora →"). */
export function boton(texto: string, link: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px"><tr>
  <td style="background:${NEGRO};border-radius:14px">
    <a href="${escapar(link)}" style="display:inline-block;padding:15px 26px;font-family:${FUENTE};font-size:15px;font-weight:700;color:#ffffff;text-decoration:none">${escapar(texto)}&nbsp;&nbsp;→</a>
  </td>
</tr></table>`;
}

/**
 * Un bloque con ícono, como las tarjetas de "Tres preguntas" de la landing: el cuadrado
 * negro, el título, el texto y, si hay, el link azul con flecha.
 */
export function bloque(
  appUrl: string,
  d: { icono: Icono; titulo: string; filas: string[]; link?: { texto: string; url: string }; alerta?: boolean }
): string {
  const filas = d.filas
    .map((f) => `<p style="margin:0 0 4px;font-family:${FUENTE};font-size:14px;line-height:1.55;color:${GRIS}">${escapar(f)}</p>`)
    .join("");
  const link = d.link
    ? `<p style="margin:10px 0 0;font-family:${FUENTE};font-size:14px;font-weight:700"><a href="${escapar(d.link.url)}" style="color:${AZUL};text-decoration:none">${escapar(d.link.texto)}&nbsp;→</a></p>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;border:1px solid ${d.alerta ? "#fecaca" : BORDE};border-radius:20px;background:${d.alerta ? "#fef2f2" : "#ffffff"}"><tr>
  <td width="40" valign="top" style="padding:20px 0 20px 20px">
    <img src="${imagen(appUrl, d.icono)}" width="40" height="40" alt="" style="display:block;border:0;border-radius:10px">
  </td>
  <td valign="top" style="padding:20px 20px 20px 16px">
    <p style="margin:0 0 6px;font-family:${FUENTE};font-size:17px;font-weight:800;letter-spacing:-.01em;color:${d.alerta ? "#b91c1c" : NEGRO}">${escapar(d.titulo)}</p>
    ${filas}${link}
  </td>
</tr></table>`;
}

export type Tono = "bien" | "atencion" | "peligro" | "sinDatos";

const TONOS: Record<Tono, { fondo: string; borde: string; marca: string; simbolo: string }> = {
  bien: { fondo: "#ecfdf5", borde: "#a7f3d0", marca: "#10b981", simbolo: "✓" },
  atencion: { fondo: "#fffbeb", borde: "#fde68a", marca: "#d97706", simbolo: "!" },
  peligro: { fondo: "#fef2f2", borde: "#fecaca", marca: "#dc2626", simbolo: "✕" },
  sinDatos: { fondo: "#fafafa", borde: BORDE, marca: "#71717a", simbolo: "?" },
};

/**
 * La tarjeta de estado, como la verde "Podés volar hoy" de la landing, con el color del
 * tono: verde, ámbar, rojo o gris cuando no hay datos. El símbolo acompaña al color para
 * quien no distingue verdes de rojos.
 */
export function estado(d: { tono: Tono; titulo: string; detalle: string }): string {
  const t = TONOS[d.tono];
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;background:${t.fondo};border:1px solid ${t.borde};border-radius:18px"><tr>
  <td width="34" valign="top" style="padding:16px 0 16px 16px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="32" height="32" align="center" valign="middle" style="background:${t.marca};border-radius:9px;font-family:${FUENTE};font-size:17px;font-weight:800;color:#ffffff">${t.simbolo}</td></tr></table>
  </td>
  <td valign="top" style="padding:16px 18px 16px 14px">
    <p style="margin:0 0 4px;font-family:${FUENTE};font-size:16px;font-weight:800;color:${NEGRO}">${escapar(d.titulo)}</p>
    <p style="margin:0;font-family:${FUENTE};font-size:13px;line-height:1.55;color:${GRIS}">${escapar(d.detalle)}</p>
  </td>
</tr></table>`;
}

/** La tarjeta negra con un número grande, como "PARA LA PCA · 51.8 h" del hero. */
export function numeroGrande(d: { etiqueta: string; numero: string; unidad: string; detalle: string }): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;background:${NEGRO};border-radius:20px"><tr>
  <td style="padding:22px 24px">
    <p style="margin:0 0 8px;font-family:${MONO};font-size:10px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:${GRIS_CLARO}">${escapar(d.etiqueta)}</p>
    <p style="margin:0;font-family:${MONO};font-size:40px;font-weight:700;line-height:1;color:#ffffff">${escapar(d.numero)}<span style="font-size:18px;color:${GRIS_CLARO}">&nbsp;${escapar(d.unidad)}</span></p>
    <p style="margin:10px 0 0;font-family:${FUENTE};font-size:13px;color:#d4d4d8">${escapar(d.detalle)}</p>
  </td>
</tr></table>`;
}

/**
 * La tarjeta "Hoy" del hero de la landing, con **los mismos números de ejemplo**: lo que
 * ve un piloto al abrir Vector con sus vuelos cargados. Va rotulada como ejemplo, y los
 * números no son de quien recibe el mail.
 */
export function ejemploDelInicio(): string {
  const miniEtiqueta = (t: string, color: string) =>
    `<p style="margin:0 0 6px;font-family:${MONO};font-size:9px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:${color}">${escapar(t)}</p>`;
  const barra = (pct: number, color: string, fondo: string) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px"><tr>
      <td width="${pct}%" style="height:4px;line-height:4px;font-size:0;background:${color};border-radius:4px">&nbsp;</td>
      <td style="height:4px;line-height:4px;font-size:0;background:${fondo};border-radius:4px">&nbsp;</td>
    </tr></table>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 8px;border:1px solid ${BORDE};border-radius:22px;background:#ffffff"><tr><td style="padding:18px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td>${miniEtiqueta("Hoy", "#71717a")}</td>
    <td align="right"><p style="margin:0 0 6px;font-family:${MONO};font-size:10px;color:${GRIS_CLARO}">Así se ve el inicio</p></td>
  </tr></table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 10px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:14px"><tr>
    <td width="30" valign="middle" style="padding:12px 0 12px 14px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="28" height="28" align="center" valign="middle" style="background:#10b981;border-radius:8px;font-family:${FUENTE};font-size:16px;font-weight:800;color:#ffffff">✓</td></tr></table>
    </td>
    <td valign="middle" style="padding:12px 14px 12px 12px">
      <p style="margin:0;font-family:${FUENTE};font-size:14px;font-weight:800;color:${NEGRO}">Podés volar hoy</p>
      <p style="margin:2px 0 0;font-family:${FUENTE};font-size:12px;color:${GRIS}">CMA vigente · 4 aterrizajes en los últimos 180 días</p>
    </td>
  </tr></table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td width="50%" valign="top" style="padding-right:5px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${NEGRO};border-radius:14px"><tr><td style="padding:14px">
        ${miniEtiqueta("Para la PCA", GRIS_CLARO)}
        <p style="margin:0;font-family:${MONO};font-size:22px;font-weight:700;color:#ffffff">51.8 h</p>
        <p style="margin:4px 0 0;font-family:${FUENTE};font-size:11px;color:${GRIS_CLARO}">te faltan de 200</p>
        ${barra(74, "#38bdf8", "#3f3f46")}
      </td></tr></table>
    </td>
    <td width="50%" valign="top" style="padding-left:5px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fafafa;border:1px solid ${BORDE};border-radius:14px"><tr><td style="padding:14px">
        ${miniEtiqueta("En el pack", "#71717a")}
        <p style="margin:0;font-family:${MONO};font-size:22px;font-weight:700;color:${NEGRO}">6.5 h</p>
        <p style="margin:4px 0 0;font-family:${FUENTE};font-size:11px;color:#71717a">te quedan de 10</p>
        ${barra(65, NEGRO, BORDE)}
      </td></tr></table>
    </td>
  </tr></table>
  <p style="margin:12px 0 0;font-family:${FUENTE};font-size:11px;color:${GRIS_CLARO}">Un ejemplo: con tus vuelos, son tus números.</p>
</td></tr></table>`;
}

export interface Plantilla {
  appUrl: string;
  /** El texto que el buzón muestra al lado del asunto, antes de abrir. */
  preencabezado: string;
  /** La píldora de arriba del título ("● Tu cuenta está lista"). Opcional. */
  pildora?: string;
  /** El título: la primera línea en negro y la segunda, si hay, en azul. */
  titulo: [string, string?];
  /** El cuerpo, ya armado con las funciones de este archivo. */
  cuerpo: string;
  /** El pie: texto chico en gris. Puede traer un link (`link`). */
  pie: string;
  pieLink?: { texto: string; url: string };
}

export function plantillaMail(p: Plantilla): string {
  const dominio = p.appUrl.replace(/^https?:\/\//, "");
  const pildora = p.pildora
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px"><tr>
    <td style="border:1px solid ${BORDE};border-radius:999px;padding:6px 12px;font-family:${FUENTE};font-size:12px;color:${GRIS}">
      <span style="color:${AZUL};font-size:10px">●</span>&nbsp;&nbsp;${escapar(p.pildora)}
    </td>
  </tr></table>`
    : "";
  const [linea1, linea2] = p.titulo;
  const pieLink = p.pieLink
    ? ` <a href="${escapar(p.pieLink.url)}" style="color:${GRIS_CLARO};text-decoration:underline">${escapar(p.pieLink.texto)}</a>.`
    : "";

  return `<!doctype html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=IBM+Plex+Mono:wght@500;600;700&display=swap" rel="stylesheet">
<title>Vector</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapar(p.preencabezado)}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f5"><tr><td align="center" style="padding:28px 14px 36px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px">
    <tr><td style="padding:0 6px 20px">
      <a href="${escapar(p.appUrl)}" style="text-decoration:none">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td><img src="${imagen(p.appUrl, "logo")}" width="36" height="36" alt="Vector" style="display:block;border:0;border-radius:10px"></td>
          <td style="padding-left:10px;font-family:${FUENTE};font-size:19px;font-weight:800;letter-spacing:-.02em;color:${NEGRO}">Vector</td>
        </tr></table>
      </a>
    </td></tr>
    <tr><td style="background:#ffffff;border:1px solid ${BORDE};border-radius:28px;padding:34px 28px 28px">
      ${pildora}
      <h1 style="margin:0 0 18px;font-family:${FUENTE};font-size:30px;line-height:1.12;font-weight:800;letter-spacing:-.025em;color:${NEGRO}">${escapar(linea1)}${linea2 ? `<br><span style="color:${AZUL}">${escapar(linea2)}</span>` : ""}</h1>
      ${p.cuerpo}
    </td></tr>
    <tr><td style="padding:22px 12px 0">
      <p style="margin:0 0 8px;font-family:${FUENTE};font-size:12px;line-height:1.6;color:${GRIS_CLARO}">${escapar(p.pie)}${pieLink}</p>
      <p style="margin:0;font-family:${FUENTE};font-size:12px;color:${GRIS_CLARO}">Vector · Tu bitácora de vuelo, siempre al día · <a href="${escapar(p.appUrl)}" style="color:${GRIS_CLARO};text-decoration:underline">${escapar(dominio)}</a></p>
    </td></tr>
  </table>
</td></tr></table>
</body>
</html>`;
}
