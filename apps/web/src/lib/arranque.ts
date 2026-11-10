/**
 * La pantalla de carga de la app instalada (3.16.0).
 *
 * **El problema:** al abrir la PWA después de un rato (iOS ya la cerró), el teléfono quedaba en
 * negro varios segundos. Nada se dibuja hasta que llega el primer byte de la página, y antes de
 * ese byte están el proxy (que pasada la hora renueva el token contra el backend), las cuatro
 * lecturas del layout del dashboard y, con una copia guardada, la carrera de 3 s del service
 * worker (`ESPERA_MS` en `sw/sw.ts`).
 *
 * **Por qué no un `loading.tsx`:** para que se vea antes del layout del dashboard tendría que
 * estar en la raíz, y con un Suspense arriba la página empieza a streamear antes de saber si es
 * un 404: `/dashboard/admin` y un @ que no existe pasarían a dar 200 (el smoke los exige en 404,
 * "sobre todo, no 200").
 *
 * **Lo que se hace:** dos piezas con la misma composición (la marca sobre la noche, centrada):
 * - **El service worker**, en un arranque en frío (una navegación a la app sin ninguna ventana
 *   abierta), contesta al instante con `paginaDeArranque`, que vuelve a pedir la misma URL. El
 *   navegador deja a la vista la página de arranque hasta que la de verdad se dibuja (en Safari
 *   y en Chrome la página vieja se ve hasta que la nueva tiene algo que pintar).
 * - **Las imágenes de arranque de iOS** (`apple-touch-startup-image`, `PANTALLAS_IPHONE`), para
 *   el instante anterior, cuando ni siquiera arrancó la vista web. Android arma la suya con el
 *   ícono y el `background_color` del manifest.
 *
 * Sin imports: lo usan el service worker, el layout y `scripts/build-iconos.mjs` (que lo importa
 * con los tipos de Node).
 */

/** La noche de la marca. */
export const FONDO_ARRANQUE = "#0B0D10";
/** El lado de la marca en la pantalla de arranque, en px de CSS (y por la densidad en las imágenes). */
export const LADO_MARCA = 72;

/** La flecha de rumbo, igual que `public/marca/isotipo-color.svg` (un test lo fija). */
export const ISOTIPO_POLIGONOS = [
  { points: "83.13,0.00 42.09,41.03 0.00,38.56", fill: "#FFFFFF" },
  { points: "85.25,2.12 46.69,85.25 44.22,43.16", fill: "#38BDF8" },
] as const;

export function isotipoSvg(lado: number): string {
  const poligonos = ISOTIPO_POLIGONOS.map((p) => `<polygon points="${p.points}" fill="${p.fill}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 85.25 85.25" width="${lado}" height="${lado}" aria-hidden="true">${poligonos}</svg>`;
}

/**
 * Las pantallas de iPhone, en puntos y con su densidad (vertical). iOS elige la imagen de
 * arranque por `media` exacta: una pantalla que no está acá arranca sin imagen, como hasta ahora.
 */
export const PANTALLAS_IPHONE = [
  { ancho: 440, alto: 956, dpr: 3 }, // 16 y 17 Pro Max
  { ancho: 402, alto: 874, dpr: 3 }, // 16 y 17 Pro, 17
  { ancho: 420, alto: 912, dpr: 3 }, // Air
  { ancho: 430, alto: 932, dpr: 3 }, // 14 Pro Max, 15 Plus y Pro Max, 16 Plus
  { ancho: 393, alto: 852, dpr: 3 }, // 14 Pro, 15, 15 Pro, 16, 16e
  { ancho: 428, alto: 926, dpr: 3 }, // 12 y 13 Pro Max, 14 Plus
  { ancho: 390, alto: 844, dpr: 3 }, // 12, 13, 14 y sus Pro
  { ancho: 375, alto: 812, dpr: 3 }, // X, XS, 11 Pro, 12 y 13 mini
  { ancho: 414, alto: 896, dpr: 3 }, // XS Max, 11 Pro Max
  { ancho: 414, alto: 896, dpr: 2 }, // XR, 11
  { ancho: 375, alto: 667, dpr: 2 }, // SE 2 y 3, 8
] as const;

export function archivoDeArranque(p: { ancho: number; alto: number; dpr: number }): string {
  return `/arranque/iphone-${p.ancho * p.dpr}x${p.alto * p.dpr}.png`;
}

export function mediaDeArranque(p: { ancho: number; alto: number; dpr: number }): string {
  return `(device-width: ${p.ancho}px) and (device-height: ${p.alto}px) and (-webkit-device-pixel-ratio: ${p.dpr}) and (orientation: portrait)`;
}

/** Cuánto se espera antes de volver a mostrar la pantalla de arranque: corta un bucle. */
export const ARRANQUE_MIN_ENTRE_MS = 15_000;

/**
 * ¿Esta navegación es un arranque en frío de la app? Un GET de navegación a una pantalla del
 * dashboard, sin ninguna ventana de Vector abierta, y sin haber mostrado la pantalla de arranque
 * hace poco: la página de arranque vuelve a pedir la misma URL, y si por algo esa segunda
 * navegación no viera su ventana, el tiempo corta el bucle.
 */
export function esArranque(p: {
  metodo: string;
  modo: string;
  pathname: string;
  ventanasAbiertas: number;
  ultimoArranqueMs: number | null;
  ahoraMs: number;
}): boolean {
  if (p.metodo !== "GET" || p.modo !== "navigate") return false;
  if (!/^\/dashboard(\/|$)/.test(p.pathname)) return false;
  if (p.ventanasAbiertas > 0) return false;
  return p.ultimoArranqueMs === null || p.ahoraMs - p.ultimoArranqueMs > ARRANQUE_MIN_ENTRE_MS;
}

/**
 * La página de arranque: la marca centrada sobre la noche y, si tarda, una línea cian que corre
 * debajo. Vuelve a pedir su propia URL con `location.replace` (no queda en el historial).
 */
export function paginaDeArranque(): string {
  return `<!doctype html><html lang="es-AR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="${FONDO_ARRANQUE}"><meta name="robots" content="noindex"><title>Vector</title>
<style>
html,body{margin:0;height:100%;background:${FONDO_ARRANQUE};overflow:hidden}
body{display:flex;align-items:center;justify-content:center}
.m{position:relative;width:${LADO_MARCA}px;height:${LADO_MARCA}px}
.l{position:absolute;left:50%;top:calc(50% + ${LADO_MARCA / 2 + 28}px);width:96px;height:2px;margin-left:-48px;overflow:hidden;background:rgba(255,255,255,.08);border-radius:2px;opacity:0;animation:a .3s .6s forwards}
.l:after{content:"";position:absolute;inset:0;width:40%;background:#38BDF8;border-radius:2px;animation:c 1.1s ease-in-out infinite}
@keyframes a{to{opacity:1}}@keyframes c{from{transform:translateX(-100%)}to{transform:translateX(250%)}}
@media (prefers-reduced-motion:reduce){.l:after{animation:none;width:100%;opacity:.5}}
</style></head><body><div class="m">${isotipoSvg(LADO_MARCA)}</div><div class="l" role="status" aria-label="Cargando Vector"></div>
<script>location.replace(location.href)</script></body></html>`;
}
