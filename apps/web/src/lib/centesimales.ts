/**
 * El cuadro de horas centesimales: los minutos de un vuelo, en décimas de hora.
 *
 * Es el que viene impreso al pie de la hoja del libro de vuelo de pilotos (Adjunto A de
 * la Res. ANAC 147/2013, la hoja de los libros en papel), y el que usa Vector para
 * calcular cada vuelo (`calculateFlightDuration`, en `utils.ts`). Esto es la versión
 * para mostrar y para la calculadora pública; un test comprueba que las dos digan lo
 * mismo en cada minuto.
 */

export interface FilaCentesimal {
  desde: number;
  hasta: number;
  /** En décimas de hora: 3 es 0,3 h. 10 es "una hora". */
  decimas: number;
}

export const CUADRO_CENTESIMAL: FilaCentesimal[] = [
  { desde: 1, hasta: 2, decimas: 0 },
  { desde: 3, hasta: 8, decimas: 1 },
  { desde: 9, hasta: 14, decimas: 2 },
  { desde: 15, hasta: 20, decimas: 3 },
  { desde: 21, hasta: 26, decimas: 4 },
  { desde: 27, hasta: 33, decimas: 5 },
  { desde: 34, hasta: 39, decimas: 6 },
  { desde: 40, hasta: 45, decimas: 7 },
  { desde: 46, hasta: 51, decimas: 8 },
  { desde: 52, hasta: 57, decimas: 9 },
  { desde: 58, hasta: 60, decimas: 10 },
];

/** Las décimas que corresponden a unos minutos sueltos (0 a 60), según el cuadro. */
export function decimasDeMinutos(minutos: number): number {
  const m = Math.round(minutos);
  if (m <= 0) return 0;
  return CUADRO_CENTESIMAL.find((f) => m >= f.desde && m <= f.hasta)?.decimas ?? 10;
}

/** Un tiempo en minutos, como va en el libro: horas enteras más las décimas del resto. */
export function horasCentesimales(minutosTotales: number): number {
  if (!Number.isFinite(minutosTotales) || minutosTotales <= 0) return 0;
  const total = Math.round(minutosTotales);
  const horas = Math.floor(total / 60);
  return (horas * 10 + decimasDeMinutos(total % 60)) / 10;
}

/** Los minutos entre dos horas "HH:MM"; si la llegada es antes, cruzó la medianoche. */
export function minutosEntre(salida: string, llegada: string): number | null {
  const partes = (t: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    return h <= 23 && min <= 59 ? h * 60 + min : null;
  };
  const a = partes(salida);
  const b = partes(llegada);
  if (a === null || b === null) return null;
  const d = b - a;
  return d < 0 ? d + 24 * 60 : d;
}

/** "1,2" como se escribe en el libro. */
export function formatoCentesimal(horas: number): string {
  return horas.toFixed(1).replace(".", ",");
}
