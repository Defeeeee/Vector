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
  fondo: "#111111",
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
      const [display, mono] = await Promise.all([
        readFile(join(dir, "Nunito-ExtraBold.ttf")),
        readFile(join(dir, "IBMPlexMono-SemiBold.ttf")),
      ]);
      const buf = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
      return [
        { name: "Nunito", data: buf(display), weight: 800 as const, style: "normal" as const },
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
 * El compás y "Vector". El compás va a mano: lucide dibuja SVG de verdad, pero el
 * soporte de SVG de satori es parcial y este es el único elemento sin plan B.
 */
export function MarcaVector({ tamano = 64 }: { tamano?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: Math.round(tamano * 0.31) }}>
      <svg width={tamano} height={tamano} viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="7" fill={COLOR.texto} />
        <circle cx="12" cy="12" r="7" stroke={COLOR.fondo} strokeWidth="1.6" />
        <polygon points="15.2,8.8 10.6,10.6 8.8,15.2 13.4,13.4" fill={COLOR.fondo} />
      </svg>
      <span style={{ fontSize: Math.round(tamano * 0.69), fontWeight: 800, color: COLOR.texto, letterSpacing: -1 }}>
        Vector
      </span>
    </div>
  );
}
