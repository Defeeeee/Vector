import QRCode from "qrcode";

/**
 * La hoja para imprimir las pegatinas con QR (migración 033 del backend): A4, diez por hoja,
 * cada una con su código. La sirve `/api/admin/pegatinas/hoja` y la usa
 * `marketing/pegatinas.mjs` para la demo, así que **no importa nada con `@/`**: la corre
 * Node directo.
 *
 * El diseño es el de la pegatina del avión, una placa de cabina de 80 × 50 mm: negra para
 * que no refleje, con un indicador de rumbo apenas marcado de fondo. Las del avión todavía
 * no se imprimen (Federico, 2026-10-23); ésta es la de un lugar, con el gancho del inicio.
 */

const escapar = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Los rumbos del indicador, cada 30°, como en el instrumento. */
export const NUMEROS_DE_LA_ROSA = ["N", "3", "6", "E", "12", "15", "S", "21", "24", "W", "30", "33"];

/** El indicador de rumbo del fondo: el anillo con sus marcas cada 10° y los números cada 30°. */
export function rosa({ numeros: conNumeros = true } = {}): string {
  const marcas: string[] = [];
  for (let g = 0; g < 360; g += 5) {
    const largo = g % 30 === 0 ? 9 : g % 10 === 0 ? 6 : 3;
    const r = (g * Math.PI) / 180;
    const [x1, y1] = [100 + 92 * Math.sin(r), 100 - 92 * Math.cos(r)];
    const [x2, y2] = [100 + (92 - largo) * Math.sin(r), 100 - (92 - largo) * Math.cos(r)];
    marcas.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`);
  }
  const numeros = NUMEROS_DE_LA_ROSA
    .map((t, i) => {
      const r = (i * 30 * Math.PI) / 180;
      const [x, y] = [100 + 72 * Math.sin(r), 100 - 72 * Math.cos(r)];
      return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" transform="rotate(${i * 30} ${x.toFixed(1)} ${y.toFixed(1)})">${t}</text>`;
    })
    .join("");
  // Sin números para el PNG: ahí el SVG va como imagen y no ve las fuentes; los pone el PNG.
  const textos = conNumeros
    ? `<g fill="#fff" font-family="IBM Plex Mono, monospace" font-weight="700" font-size="13" text-anchor="middle" dominant-baseline="central">${numeros}</g>`
    : "";
  return `<svg class="rosa" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" aria-hidden="true"><g stroke="#fff" stroke-width="1.6" stroke-linecap="round">${marcas.join("")}</g>${textos}</svg>`;
}

const LOGO = `<svg viewBox="0 0 24 24" fill="none" stroke="#18181b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"/></svg>`;

const ESTILO = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Nunito', -apple-system, 'Segoe UI', Roboto, sans-serif; -webkit-font-smoothing: antialiased; background: #fff; color: #18181b; }
  @page { size: A4; margin: 0; }
  .hoja { width: 210mm; height: 297mm; padding: 14mm 17mm; display: grid; grid-template-columns: 80mm 80mm; grid-auto-rows: 50mm; justify-content: space-between; align-content: start; row-gap: 6mm; page-break-after: always; }
  .hoja:last-child { page-break-after: auto; }
  .hoja .pegatina { outline: .25mm dashed #a1a1aa; outline-offset: 1.2mm; }
  .pegatina { position: relative; overflow: hidden; width: 80mm; height: 50mm; border-radius: 3.5mm; background: #18181b; color: #fff; padding: 4.2mm; display: flex; gap: 3.6mm; }
  .rosa { position: absolute; width: 62mm; height: 62mm; left: -17mm; bottom: -24mm; opacity: .07; }
  .izq { position: relative; flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .marca { display: flex; align-items: center; gap: 1.6mm; font-size: 3.4mm; font-weight: 800; letter-spacing: -.01em; }
  .logo { width: 5mm; height: 5mm; border-radius: 1.4mm; background: #fff; display: grid; place-items: center; }
  .logo svg { width: 3.2mm; height: 3.2mm; }
  .gancho { font-size: 6.4mm; line-height: .98; font-weight: 900; letter-spacing: -.035em; margin-top: auto; }
  .bajada { font-size: 3.2mm; font-weight: 800; line-height: 1.2; margin-top: 2mm; }
  .ayuda { font-size: 2.4mm; font-weight: 700; color: #a1a1aa; line-height: 1.3; margin-top: 1.3mm; }
  .der { position: relative; width: 32mm; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1.3mm; }
  .baldosa { width: 32mm; height: 32mm; background: #fff; border-radius: 2.4mm; padding: 3mm; }
  .baldosa svg { display: block; width: 100%; height: 100%; }
  .codigo { font-family: 'IBM Plex Mono', ui-monospace, Menlo, monospace; font-size: 2.3mm; font-weight: 600; color: #a1a1aa; letter-spacing: .08em; }
`;

/** El QR de una pegatina, en SVG: lleva a `<base>/q/<código>`. */
export function qrSvg(codigo: string, base: string): Promise<string> {
  return QRCode.toString(`${base}/q/${codigo}`, { type: "svg", errorCorrectionLevel: "Q", margin: 0, color: { dark: "#18181b", light: "#0000" } });
}

async function pegatina(codigo: string, base: string): Promise<string> {
  const qr = await qrSvg(codigo, base);
  return `<section class="pegatina">
  ${rosa()}
  <div class="izq">
    <div class="marca"><span class="logo">${LOGO}</span>Vector</div>
    <div class="gancho">¿Puedo<br>volar hoy?</div>
    <div class="bajada">Tu bitácora de vuelo,<br>en el teléfono.</div>
    <div class="ayuda">Escaneá con la cámara o entrá a vector.fdiaznem.com.ar</div>
  </div>
  <div class="der">
    <div class="baldosa">${qr}</div>
    <div class="codigo">${escapar(codigo)}</div>
  </div>
</section>`;
}

/**
 * El documento entero. Con `sola`, una pegatina sin hoja (para exportarla a PNG); si no, de
 * a diez por A4, con la línea de corte. `base` es el dominio que va en el QR.
 */
export async function hojaDePegatinas(codigos: string[], base: string, { sola = false } = {}): Promise<string> {
  const piezas = await Promise.all(codigos.map((c) => pegatina(c, base)));
  const cuerpo = sola
    ? piezas.join("")
    : Array.from({ length: Math.ceil(piezas.length / 10) }, (_, i) => `<div class="hoja">${piezas.slice(i * 10, i * 10 + 10).join("")}</div>`).join("");
  return `<!doctype html>
<html lang="es-AR"><head><meta charset="utf-8"><title>Pegatinas de Vector</title>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=IBM+Plex+Mono:wght@600;700&display=swap" rel="stylesheet">
<style>${ESTILO}</style></head>
<body>${cuerpo}</body></html>`;
}
