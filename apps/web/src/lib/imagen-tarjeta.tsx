import { MARCA_FLECHA, MARCA_PROPORCION, MARCA_TEXTO, MARCA_VIEWBOX } from "./marca-svg";
/**
 * Lo que comparten las imágenes que genera Vector con satori: la tarjeta de horas
 * (`/api/share-card`) y la vista previa del perfil público (`/u/[handle]`).
 *
 * Sólo del server: lee las fuentes del disco. Y sólo satori: estilos en línea y hex
 * literales, porque satori no entiende variables CSS ni clases. Ver el comentario de
 * `src/app/api/share-card/route.tsx`.
 */

/** Los tokens de `globals.css`, a mano. Si allá cambian, acá no se enteran. */
export const COLOR = {
  /** La noche de la marca (3.15.0; era #111111). */
  fondo: "#0b0d10",
  texto: "#ffffff",
  tenue: "rgba(255,255,255,0.55)",
  masTenue: "rgba(255,255,255,0.35)",
  borde: "rgba(255,255,255,0.08)",
  /** `--color-aviation-cyan`. El único acento de la imagen. */
  acento: "#38bdf8",
};

/** El resplandor de la esquina. `filter: blur()` no existe en satori; esto sí. */
export const RESPLANDOR = "radial-gradient(circle at 85% 10%, rgba(56,189,248,0.20), transparent 55%)";

export type FuenteTarjeta = { name: string; data: ArrayBuffer; weight: 800 | 600; style: "normal" };

/**
 * Las fuentes, leídas del disco una sola vez por proceso.
 *
 * **Dos cosas que ya fallaron y por eso están así.**
 *
 * 1. `fetch(new URL("./fonts/x.ttf", import.meta.url))` —el patrón que documenta
 *    `@vercel/og`— sólo sirve en el runtime edge. Acá corremos en Node, donde
 *    `import.meta.url` resuelve a un `file://` y **el `fetch` de Node no soporta
 *    `file://`**: tira "not implemented... yet...".
 * 2. Leerlas a nivel de módulo hacía que el intento corriera **durante
 *    `next build`**, al recolectar los datos de la ruta. Perezoso y memoizado, se
 *    tocan recién en el primer pedido real.
 *
 * `process.cwd()` es confiable acá porque el deploy compila y arranca desde la raíz
 * del repo, con el árbol de fuentes presente (no hay `output: "standalone"`).
 */
let fuentesCache: Promise<FuenteTarjeta[]> | null = null;

export function cargarFuentes(): Promise<FuenteTarjeta[]> {
  if (!fuentesCache) {
    fuentesCache = (async () => {
      const { readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const dir = join(process.cwd(), "src", "app", "api", "share-card", "fonts");
      const [display, nunito, mono] = await Promise.all([
        readFile(join(dir, "PlusJakartaSans-ExtraBold.woff")),
        readFile(join(dir, "Nunito-ExtraBold.ttf")),
        readFile(join(dir, "IBMPlexMono-SemiBold.ttf")),
      ]);
      const buf = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
      return [
        // "Display" es la tipografía de los títulos de la app (Plus Jakarta Sans desde la 3.4.0);
        // "Nunito" queda para la pegatina, que ya está impresa con ésa.
        { name: "Display", data: buf(display), weight: 800 as const, style: "normal" as const },
        { name: "Nunito", data: buf(nunito), weight: 800 as const, style: "normal" as const },
        { name: "PlexMono", data: buf(mono), weight: 600 as const, style: "normal" as const },
      ];
    })().catch((err) => {
      // Que se reintente en el pedido siguiente en vez de quedar envenenado.
      fuentesCache = null;
      throw err;
    });
  }
  return fuentesCache;
}

/**
 * La marca (3.10.0): la flecha de rumbo en blanco y cian y "vector", en curvas (`lib/marca-svg.ts`).
 * Polígonos y un path: lo que satori dibuja bien. `tamano` es el alto, como el viejo compás.
 */
export function MarcaVector({ tamano = 64 }: { tamano?: number }) {
  const alto = Math.round(tamano * 0.8);
  return (
    <svg width={Math.round(alto * MARCA_PROPORCION)} height={alto} viewBox={MARCA_VIEWBOX}>
      <polygon points={MARCA_FLECHA[0]} fill={COLOR.texto} />
      <polygon points={MARCA_FLECHA[1]} fill={COLOR.acento} />
      <path transform={MARCA_TEXTO.transform} d={MARCA_TEXTO.d} fill={COLOR.texto} />
    </svg>
  );
}
