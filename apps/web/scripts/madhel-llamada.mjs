/**
 * El canal de llamada que un aeródromo no controlado publica en las normas particulares de su
 * ficha de MADHEL: "Canal de llamada general de uso local: 118,40 MHz", "Canales de llamada
 * general de uso local: 122,30 MHz (CPPL) - 122,80 MHz (CAUX)", "Canal de llamada general de
 * uso particular Frecuencia 123,200 MHz", "La frecuencia 123,650 MHz será utilizada …".
 *
 * Devuelve las frecuencias en MHz como se cantan ("118.40", "123.200"), o [] si la ficha no
 * publica ninguna. Lo usa el Mapa (3.1.2) para la llegada y la salida de un aeródromo no
 * controlado. La comparten `build-madhel-fichas.mjs` y la regeneración desde la copia del VPS.
 */
export function canalDeLlamada(ficha) {
  const texto = String(ficha?.data?.norms?.particular?.content ?? "").replace(/\s+/g, " ");
  const m = /canal(?:es)? de llamadas?|la frecuencia\s+(?=1\d{2}[.,]\d{1,3}\s*MHz\s+ser[áa] utiliz)/i.exec(texto);
  if (!m) return [];
  // Hasta el final de la oración: "… 122,25 MHz (CAUX). TWR 118,45 MHz" no se lleva la torre.
  const resto = texto.slice(m.index, m.index + 220);
  const fin = resto.search(/\.\s+(?=[A-ZÁÉÍÓÚ])/);
  const oracion = fin > 0 ? resto.slice(0, fin + 1) : resto;
  const out = [];
  for (const f of oracion.matchAll(/(1\d{2})[.,](\d{1,3})\s*MHz/gi)) {
    const mhz = `${f[1]}.${f[2].padEnd(2, "0")}`;
    if (!out.includes(mhz)) out.push(mhz);
  }
  return out;
}
