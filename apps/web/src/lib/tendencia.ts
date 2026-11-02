import type { Flight } from "@/types";

/**
 * Las series mensuales de horas: las barras de "Horas por mes" y la curva de "Horas
 * acumuladas" del Resumen, y la línea chica de la tarjeta de horas del inicio.
 *
 * Vivían escritas adentro de `dashboard/page.tsx` y tenían un bug que sólo aparecía
 * a fin de mes. Los meses se generaban con `d.setMonth(d.getMonth() - i)` sobre la
 * fecha de hoy: un 31 de octubre, "un mes atrás" es el 31 de septiembre, que no
 * existe, y JavaScript lo corre al 1 de octubre. El gráfico repetía octubre y se
 * salteaba septiembre — y junio, por lo mismo —, sin error y sólo esos días.
 *
 * Acá los meses son claves `YYYY-MM` y se cuentan con aritmética entera. No hay días
 * que desborden ni husos horarios que muevan un vuelo de mes.
 */

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/** `"2026-09"` de cualquier ISO que empiece con la fecha. */
function mesDe(iso: string): string {
  return iso.slice(0, 7);
}

function nombreDe(clave: string): string {
  return MESES[Number(clave.slice(5, 7)) - 1];
}

/** Corre una clave `YYYY-MM` `n` meses (negativo para atrás), cruzando años. */
export function sumarMeses(clave: string, n: number): string {
  const [anio, mes] = clave.split("-").map(Number);
  const total = anio * 12 + (mes - 1) + n;
  const nuevoAnio = Math.floor(total / 12);
  const nuevoMes = total - nuevoAnio * 12 + 1;
  return `${nuevoAnio}-${String(nuevoMes).padStart(2, "0")}`;
}

export interface HorasDelMes {
  /** "Sep". Sin año: la ventana es corta y no cruza dos veces el mismo mes. */
  name: string;
  hours: number;
}

/** Las horas de cada uno de los últimos `meses` meses, el actual incluido. */
export function horasPorMes(flights: Flight[], hoyIso: string, meses = 6): HorasDelMes[] {
  const actual = mesDe(hoyIso);
  const claves = Array.from({ length: meses }, (_, i) => sumarMeses(actual, i - (meses - 1)));
  const totales = new Map(claves.map((k) => [k, 0]));

  for (const f of flights) {
    const k = mesDe(f.date);
    const previo = totales.get(k);
    if (previo !== undefined) totales.set(k, previo + f.duration);
  }

  return claves.map((k) => ({ name: nombreDe(k), hours: Number((totales.get(k) ?? 0).toFixed(1)) }));
}

export interface PuntoAcumulado {
  /** "Sep 26". */
  date: string;
  total: number;
  monthHours: number;
}

/**
 * Horas acumuladas mes a mes, desde el mes del primer vuelo hasta el actual, sin
 * huecos: un mes sin vuelos es un escalón plano, no un mes que desaparece.
 *
 * `base` son las horas de apertura de los libros —lo que el piloto traía del libro de
 * papel—. La curva arranca desde ahí y no desde cero: si no, el total de la punta
 * sería distinto del que muestra el Resumen arriba en la misma pantalla, y las líneas
 * de 100 o 200 horas marcarían hitos que el piloto ya pasó hace rato.
 */
export function horasAcumuladas(flights: Flight[], hoyIso: string, base = 0): PuntoAcumulado[] {
  if (flights.length === 0) return [];

  const porMes = new Map<string, number>();
  for (const f of flights) {
    const k = mesDe(f.date);
    porMes.set(k, (porMes.get(k) ?? 0) + f.duration);
  }

  const primero = [...porMes.keys()].sort()[0];
  const actual = mesDe(hoyIso);
  const puntos: PuntoAcumulado[] = [];
  let acumulado = base;

  // Las claves `YYYY-MM` se ordenan igual como texto que como fecha.
  for (let k = primero; k <= actual; k = sumarMeses(k, 1)) {
    const horas = porMes.get(k) ?? 0;
    acumulado += horas;
    puntos.push({
      date: `${nombreDe(k)} ${k.slice(2, 4)}`,
      total: Number(acumulado.toFixed(1)),
      monthHours: Number(horas.toFixed(1)),
    });
  }

  return puntos;
}
