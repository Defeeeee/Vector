/**
 * Las imágenes de los mails: el logo y los íconos, en PNG.
 *
 * Los clientes de correo no muestran SVG (Gmail lo bloquea), así que el logo de la
 * landing —el cuadrado negro con la brújula de `NavPublica`— y los íconos de Lucide que
 * usa la app se dibujan acá como PNG en `public/hotlink-ok/correo/`, al doble del tamaño en que se
 * muestran, para que se vean nítidos en pantallas retina.
 *
 *   npm run build:correo
 *
 * Se commitean: el mail los pide por URL al dominio público, y el build no los regenera.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
/*
  Dos carpetas con lo mismo. La que usan los mails es `hotlink-ok/correo`: Cloudflare
  bloquea el hotlinking de imágenes y exceptúa esa carpeta (ver `CARPETA_IMAGENES` en
  `src/lib/mail-plantilla.ts`). `correo` se mantiene porque los mails ya enviados apuntan ahí.
*/
const SALIDAS = [join(RAIZ, "public", "hotlink-ok", "correo"), join(RAIZ, "public", "correo")];
const NEGRO = "#18181b";

/** Los nodos de un ícono de Lucide, sacados del paquete que ya usa la app. */
async function nodos(nombre) {
  const m = await import(join(RAIZ, "node_modules/lucide-react/dist/esm/icons", `${nombre}.js`));
  return m.__iconNode;
}

function svgDeNodos(iconNode) {
  return iconNode
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        .filter(([k]) => k !== "key")
        .map(([k, v]) => `${k}="${v}"`)
        .join(" ");
      return `<${tag} ${a}/>`;
    })
    .join("");
}

/** Un cuadrado negro redondeado con el ícono en blanco, como en la landing. */
async function cuadrado(nombre, { lado, radio, icono }) {
  const escala = icono / 24;
  const margen = (lado - icono) / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 ${lado} ${lado}">
  <rect width="${lado}" height="${lado}" rx="${radio}" fill="${NEGRO}"/>
  <g transform="translate(${margen} ${margen}) scale(${escala})" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    ${svgDeNodos(await nodos(nombre))}
  </g>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

for (const dir of SALIDAS) mkdirSync(dir, { recursive: true });

const archivos = {
  // El logo: 36 px en el mail, dibujado a 72.
  "logo.png": await cuadrado("compass", { lado: 72, radio: 18, icono: 40 }),
  // Los íconos de cada bloque: 40 px en el mail, dibujados a 80.
  ...Object.fromEntries(
    await Promise.all(
      ["mic", "file-text", "pencil-line", "plane", "target", "wallet", "triangle-alert", "zap", "smartphone", "mail"].map(async (n) => [
        `${n}.png`,
        await cuadrado(n, { lado: 80, radio: 20, icono: 40 }),
      ])
    )
  ),
};

for (const [nombre, png] of Object.entries(archivos)) {
  for (const dir of SALIDAS) writeFileSync(join(dir, nombre), png);
  console.log(`${nombre}  ${png.length} bytes`);
}
