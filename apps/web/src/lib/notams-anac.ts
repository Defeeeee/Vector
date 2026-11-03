import { anacIndicator } from "./madhel-reference";
import type { NotamAnac } from "./meteo-plan";
import { notamsCrudos } from "./notams-descargados";

/**
 * Los NOTAM de un aeródromo, del servicio JSON de ANAC (el mismo que lee `/api/notams`).
 *
 * `null` si no se pudo preguntar, que no es lo mismo que `[]` (invariante 2): un aeródromo
 * sin NOTAM y un servicio caído no se muestran igual.
 *
 * ANAC manda el texto en inglés y, después de "Versión en Español:", en castellano. Se
 * guardan los dos: el horario se lee del inglés (es el que escribe la oficina NOTAM) y al
 * piloto se le muestra el castellano.
 */
export async function notamsDeAnac(codigo: string): Promise<(NotamAnac & { textoEsp: string })[] | null> {
  try {
    // De la descarga del país si está al día; si no, preguntándole a ANAC (`notamsCrudos`).
    const { items: json } = await notamsCrudos(anacIndicator(codigo), 300);
    if (!json) return null;
    return json.map((item: { notam?: string; desde?: string; hasta?: string; novedad?: string }) => {
      const cuerpo = (item.novedad ?? "").replace(/<\/?[^>]+(>|$)/g, "");
      const [ingles, castellano] = cuerpo.split("Versión en Español:");
      return {
        codigo: item.notam || "NOTAM",
        desde: item.desde ?? "",
        hasta: !item.hasta || item.hasta.startsWith("0000-00-00") ? null : item.hasta,
        texto: ingles.trim(),
        textoEsp: (castellano ?? ingles).trim(),
      };
    });
  } catch {
    return null;
  }
}
