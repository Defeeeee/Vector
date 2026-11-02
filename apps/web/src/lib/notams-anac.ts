import { anacIndicator } from "./madhel-reference";
import type { NotamAnac } from "./meteo-plan";

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
    const res = await fetch("https://ais.anac.gob.ar/notam/json", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
        Referer: "https://ais.anac.gob.ar/notam",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      body: `indicador=${encodeURIComponent(anacIndicator(codigo))}`,
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!Array.isArray(json)) return null;
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
