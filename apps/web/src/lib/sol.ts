/**
 * La altura del sol sobre el horizonte, en grados, para un instante (UTC) y un lugar.
 *
 * Fórmulas de baja precisión del Almanaque Náutico (las de la NOAA simplificadas): el error es de
 * unas centésimas de grado, minutos en la hora de la puesta. Alcanza para lo que se usa: saber si
 * un vuelo leído como nocturno tenía el sol arriba (`importar-libro.ts`, `corregirLectura`).
 */
const rad = (g: number) => (g * Math.PI) / 180;
const grados = (r: number) => (r * 180) / Math.PI;

export function alturaDelSol(instante: Date, lat: number, lon: number): number {
  const n = instante.getTime() / 86_400_000 + 2440587.5 - 2451545.0; // días desde J2000
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = rad((357.528 + 0.9856003 * n) % 360);
  const lambda = rad(L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g));
  const eps = rad(23.439 - 0.0000004 * n);
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ar = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const tsl = rad((280.46061837 + 360.98564736629 * n + lon) % 360); // tiempo sidéreo local
  const h = tsl - ar;
  return grados(Math.asin(Math.sin(rad(lat)) * Math.sin(dec) + Math.cos(rad(lat)) * Math.cos(dec) * Math.cos(h)));
}
