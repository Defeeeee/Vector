/**
 * Lee la tabla de niveles de crucero de la AIP ENR 1.7 (`src/data/aip/ENR-1.7.txt`, páginas
 * ENR 1.7-6 y 1.7-7) y devuelve las columnas de los vuelos VFR:
 *
 * - columna 2: VFR con derrota de 000º a 179º;
 * - columna 4: VFR con derrota de 180º a 359º.
 *
 * Cada fila del texto trae cuatro columnas de tres números (FL, pies, metros). Las filas de
 * las columnas 1 a 4 son las de 12 números; la de FL 190-200 sólo trae tres columnas (no hay
 * VFR por encima: ahí no se lee la 4). Donde el FL es "-" (debajo de la altitud de
 * transición) la referencia son los pies; donde hay FL, **la referencia es el FL** (×100):
 * el original dice 20500 pies para FL 105, una errata del AIP.
 *
 * Es .mjs plano para que lo usen el script que genera `src/data/niveles-vfr.json` y los tests.
 */
export function parsearNivelesVfr(texto) {
  const col2 = [];
  const col4 = [];
  for (const linea of texto.split("\n")) {
    if (linea.startsWith("#")) continue;
    const t = linea.trim().split(/\s+/);
    if (t.length < 9 || !t.every((x) => /^(-|\d+)$/.test(x))) continue;
    if (t.length !== 9 && t.length !== 12) continue;
    // Las primeras filas (500, 1000-2500 ft) llevan "-" como FL y los pies como referencia.
    const alt = (i) => {
      const [fl, ft] = [t[i], t[i + 1]];
      if (fl !== "-") return Number(fl) * 100;
      return ft === "-" ? null : Number(ft);
    };
    const a2 = alt(3);
    const a4 = t.length === 12 ? alt(9) : null;
    if (a2 !== null) col2.push(a2);
    if (a4 !== null) col4.push(a4);
  }
  return { col2, col4 };
}
