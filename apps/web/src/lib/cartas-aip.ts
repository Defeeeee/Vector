/**
 * Las cartas de navegación del AIP como capas del Mapa (3.9.0): las ENR 6 en ruta inferiores
 * (INF 1–3) y superiores (SUP 1–3) y las cartas VFR por debajo de las TMA Baires y Córdoba
 * (ENR 6.10 y 6.9), **la carta tal cual**, georreferenciada, para prender y apagar.
 *
 * ## Cómo se georreferencian
 *
 * `scripts/cartas/` (ver su README): las cartas son PDF vectoriales en Lambert cónica conforme
 * sobre WGS84 (lo dicen en el margen). Los meridianos y paralelos son trazos propios del PDF,
 * con su rótulo de grados en el borde: cada cruce es un punto de control exacto (12 a 77 por
 * carta). Con eso se ajusta la constante del cono y una semejanza (escala, giro, desplazamiento);
 * el error medio queda debajo de 0,13 pt de la carta (~100 m en las ENR a 1:2.300.000, ~20 m en
 * las VFR a 1:500.000). Las seis ENR dan la misma constante (−0,620): son una sola proyección.
 *
 * Las teselas (256 px, Web Mercator, WebP) se generan en la compu y viven en el VPS, en
 * `~/Vector/datos/cartas/<capa>/<z>/<x>/<y>.webp`: no van al repo (pesan) ni al build.
 */

export interface CapaCarta {
  id: "inf" | "sup" | "vfr";
  nombre: string;
  /** Hasta dónde hay teselas propias; más cerca, Leaflet agranda las del último nivel. */
  zoomNativo: number;
  zoomMinimo: number;
  /** [[sur, oeste], [norte, este]]: fuera de esto no se piden teselas. */
  limites: [[number, number], [number, number]];
}

/** El ciclo AIRAC de las cartas: va en la URL para que un ciclo nuevo no salga del cache. */
export const AIRAC_CARTAS = "2026-06-11";

export const CAPAS_CARTAS: CapaCarta[] = [
  { id: "inf", nombre: "Carta en ruta inferior (ENR 6)", zoomMinimo: 5, zoomNativo: 9, limites: [[-57, -76], [-20, -50]] },
  { id: "sup", nombre: "Carta en ruta superior (ENR 6)", zoomMinimo: 5, zoomNativo: 9, limites: [[-57, -76], [-20, -50]] },
  { id: "vfr", nombre: "Cartas VFR Baires y Córdoba", zoomMinimo: 8, zoomNativo: 12, limites: [[-36.5, -66], [-30, -56.5]] },
];

export const urlTeselaCarta = (id: CapaCarta["id"]) => `/api/cartas/${id}/{z}/{x}/{y}?airac=${AIRAC_CARTAS}`;

/** Lo que acepta la ruta: la capa, y z/x/y enteros dentro del rango de la capa. */
export function teselaValida(capa: string, z: string, x: string, y: string): { capa: CapaCarta; z: number; x: number; y: number } | null {
  const c = CAPAS_CARTAS.find((k) => k.id === capa);
  if (!c || ![z, x, y].every((v) => /^\d{1,7}$/.test(v))) return null;
  const [Z, X, Y] = [Number(z), Number(x), Number(y)];
  if (Z < c.zoomMinimo || Z > c.zoomNativo || X >= 2 ** Z || Y >= 2 ** Z) return null;
  return { capa: c, z: Z, x: X, y: Y };
}

/**
 * Las teselas de una carta que cubren una ruta (3.15.0, "el Mapa sin señal"): las de cada zoom de
 * la carta en una franja de `margenNm` alrededor de cada tramo, dentro de sus límites. Son nuestras
 * (las sirve el VPS), así que se pueden bajar antes de salir. Devuelve las URLs, sin repetir, y
 * corta en `maximo` para no llenar el teléfono.
 */
export function teselasDeRuta(
  capa: CapaCarta,
  puntos: { lat: number; lon: number }[],
  { margenNm = 5, maximo = 1500 }: { margenNm?: number; maximo?: number } = {}
): string[] {
  const [[latMin, lonMin], [latMax, lonMax]] = capa.limites;
  const aTesela = (lat: number, lon: number, z: number) => {
    const n = 2 ** z;
    const x = Math.floor(((lon + 180) / 360) * n);
    const r = (lat * Math.PI) / 180;
    const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
    return [Math.min(n - 1, Math.max(0, x)), Math.min(n - 1, Math.max(0, y))] as const;
  };
  const urls = new Set<string>();
  const plantilla = urlTeselaCarta(capa.id);
  for (let z = capa.zoomMinimo; z <= capa.zoomNativo; z++) {
    for (let i = 0; i < puntos.length; i++) {
      const a = puntos[i];
      const b = puntos[Math.min(i + 1, puntos.length - 1)];
      // Cada tramo en pasos de ~1 NM, con su margen alrededor.
      const pasos = Math.max(1, Math.ceil(Math.hypot(b.lat - a.lat, (b.lon - a.lon) * Math.cos((a.lat * Math.PI) / 180)) * 60));
      for (let k = 0; k <= pasos; k++) {
        const lat = a.lat + ((b.lat - a.lat) * k) / pasos;
        const lon = a.lon + ((b.lon - a.lon) * k) / pasos;
        const dLat = margenNm / 60;
        const dLon = margenNm / (60 * Math.cos((lat * Math.PI) / 180));
        const s = Math.max(latMin, lat - dLat), nn = Math.min(latMax, lat + dLat);
        const w = Math.max(lonMin, lon - dLon), e = Math.min(lonMax, lon + dLon);
        if (s > nn || w > e) continue;
        const [x0, y0] = aTesela(nn, w, z);
        const [x1, y1] = aTesela(s, e, z);
        for (let x = x0; x <= x1; x++)
          for (let y = y0; y <= y1; y++) {
            urls.add(plantilla.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y)));
            if (urls.size >= maximo) return [...urls];
          }
      }
    }
  }
  return [...urls];
}
