/**
 * La piernera de la ruta (3.15.0): lo que se lleva en la pierna, armado desde el Mapa. Una hoja
 * A5 con cada tramo (rumbo magnético, distancia, tiempo sin viento y lugar para la hora estimada
 * y la real), los totales, con quién hablás en cada parte y lo de cada aeródromo de la ruta.
 *
 * Puro y testeado: el dibujo está en `piernera-pdf.ts`. Es ayuda VFR y lo dice: el tiempo es sin
 * viento, con la TAS que se puso en el Mapa; el viento y el combustible de verdad están en la
 * planilla de navegación.
 */

export interface TramoParaPiernera {
  desde: string;
  hasta: string;
  distanciaNm: number;
  /** Rumbo magnético, o `null` si no hay variación conocida (va el verdadero, marcado). */
  rumboM: number | null;
  rumboT: number;
}

export interface CambioParaPiernera {
  desdeNm: number;
  donde: string;
  distintivo: string;
  mhz: string[];
}

export interface DatosPiernera {
  ruta: string;
  avion: string | null;
  tasKt: number | null;
  altitudFt: number | null;
  consumoLh: number | null;
  tramos: TramoParaPiernera[];
  cambios: CambioParaPiernera[];
}

export interface RenglonPiernera {
  n: string;
  tramo: string;
  rumbo: string;
  distancia: string;
  tiempo: string;
  acumulado: string;
}

export interface Piernera {
  titulo: string;
  subtitulo: string;
  renglones: RenglonPiernera[];
  totales: { distancia: string; tiempo: string; combustible: string | null };
  comunicaciones: { donde: string; quien: string; frecuencias: string }[];
  advertencia: string;
}

const grados = (n: number) => String(Math.round(((n % 360) + 360) % 360) || 360).padStart(3, "0");
const coma = (n: number, d = 1) => n.toFixed(d).replace(".", ",");
/** "1:05" (horas y minutos), como se anota en la pierna. */
export function horasMinutos(minutos: number): string {
  const m = Math.max(0, Math.round(minutos));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * El texto en lo que entiende una fuente estándar del PDF (WinAnsi): las flechas y los puntos
 * medios pasan a lo que se puede escribir. Las letras con tilde y la ñ, sí entran.
 */
export function paraPdf(texto: string): string {
  return texto
    .replace(/[→⟶➜]/g, "-")
    .replace(/[·•]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^ -~ -ÿ]/g, "");
}

export function armarPiernera(d: DatosPiernera): Piernera {
  let acumuladoMin = 0;
  const renglones = d.tramos.map((t, i) => {
    const min = d.tasKt ? (t.distanciaNm / d.tasKt) * 60 : null;
    if (min !== null) acumuladoMin += min;
    return {
      n: String(i + 1),
      tramo: paraPdf(`${t.desde} - ${t.hasta}`),
      rumbo: t.rumboM !== null ? `${grados(t.rumboM)}°M` : `${grados(t.rumboT)}°V`,
      distancia: coma(t.distanciaNm),
      tiempo: min !== null ? horasMinutos(min) : "—",
      acumulado: min !== null ? horasMinutos(acumuladoMin) : "—",
    };
  });
  const totalNm = d.tramos.reduce((s, t) => s + t.distanciaNm, 0);
  const totalMin = d.tasKt ? (totalNm / d.tasKt) * 60 : null;
  const partes = [d.avion, d.tasKt ? `TAS ${d.tasKt} kt` : null, d.altitudFt ? `${String(Math.round(d.altitudFt)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} ft` : null].filter(Boolean);
  return {
    titulo: paraPdf(d.ruta),
    subtitulo: paraPdf(partes.join(" - ")),
    renglones,
    totales: {
      distancia: `${coma(totalNm)} NM`,
      tiempo: totalMin !== null ? horasMinutos(totalMin) : "—",
      combustible: totalMin !== null && d.consumoLh ? `${Math.ceil((totalMin / 60) * d.consumoLh)} L sin reserva` : null,
    },
    comunicaciones: d.cambios.map((c) => ({
      donde: paraPdf(c.desdeNm === 0 ? `Salida - ${c.donde}` : `${Math.round(c.desdeNm)} NM - ${c.donde}`),
      quien: paraPdf(c.distintivo),
      frecuencias: paraPdf(c.mhz.join("  ")),
    })),
    advertencia:
      "Ayuda VFR de Vector: tiempos sin viento, con la TAS cargada. No reemplaza la carta ni el briefing.",
  };
}

/** "SADF-SADM.pdf" → el nombre del archivo, con la ruta. */
export function nombrePiernera(tokens: string[]): string {
  const t = tokens.filter((x) => x && x !== "DCT");
  return `Piernera-${(t.length ? [t[0], t[t.length - 1]] : ["ruta"]).join("-").replace(/[^A-Z0-9-]/gi, "")}.pdf`;
}
