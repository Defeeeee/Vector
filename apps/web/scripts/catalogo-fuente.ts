import { allAirports } from "../src/lib/airports";
import { allRadioayudas } from "../src/lib/radioayudas";
import { allFixes } from "../src/lib/fixes";
import { allAerovias } from "../src/lib/aerovias";
import { fuenteAip } from "../src/lib/aip";
import type { CatalogoSerializado } from "../src/lib/catalogo-json";

/**
 * De dónde sale el catálogo de a bordo. **De los mismos módulos que usa el servidor.**
 *
 * Es la decisión central de todo esto y merece el párrafo: el generador **no vuelve a
 * parsear los TSV**. Llama a `allAirports()`, `allRadioayudas()`, `allFixes()` y
 * `allAerovias()`, que son exactamente las funciones detrás de `catalogoServidor`.
 *
 * Así, todo lo que esos parsers hacen y que nadie recordaría replicar —la mezcla del
 * directorio mundial con MADHEL, la corrección de los largos de pista contra el AIP,
 * la variación magnética precalculada, el recorte de las rutas a 60 caracteres— llega
 * al JSON **por construcción**, no por disciplina.
 *
 * Un generador que re-parseara los TSV sería una tercera implementación de la lectura
 * de datos, y se separaría de las otras dos la primera vez que alguien tocara un
 * parser sin acordarse de este archivo.
 *
 * Es TypeScript y no `.mjs` justamente para poder importar esos módulos.
 * `scripts/build-catalogo.mjs` lo empaqueta con esbuild y lo corre.
 */

/** Sólo Argentina: ver el encabezado de `build-catalogo.mjs` para la cuenta. */
const ES_ARGENTINO = (pais: string) => pais === "AR";

export function armarCatalogo(): CatalogoSerializado {
  const aerodromos = allAirports()
    .filter((a) => ES_ARGENTINO(a.country) && a.lat !== undefined && a.lon !== undefined)
    .sort((a, b) => a.icao.localeCompare(b.icao))
    .map((a) => [
      a.icao,
      a.name,
      a.city,
      a.country,
      a.size,
      a.iata,
      a.label,
      a.lat as number,
      a.lon as number,
      a.elevation ?? null,
      /*
        `null` y no `0`: **cero es una variación válida en Argentina** — la línea
        agónica cruza la Patagonia. Confundir "no la sabemos" con "es cero" daría
        rumbos corridos hasta 17,8° en Misiones, en silencio.
      */
      a.variacionW ?? null,
      a.pistas ?? null,
      a.local ?? null,
    ]);

  const radioayudas = allRadioayudas()
    .sort((a, b) => a.ident.localeCompare(b.ident))
    .map((r) => [r.ident, r.tipo, r.nombre, r.lat, r.lon, r.khz ?? null, r.variacionW ?? null]);

  const fixes = allFixes()
    .sort((a, b) => a.designador.localeCompare(b.designador))
    .map((f) => [f.designador, f.lat, f.lon, f.rutas]);

  const aerovias = allAerovias()
    .sort((a, b) => a.designador.localeCompare(b.designador))
    .map((v) => [v.designador, v.puntos.join(" ")]);

  /*
    Sólo los documentos que la resolución de puntos consulta. El AIP tiene una fuente
    por aeródromo además de éstas, y ninguna hace falta acá: la ficha de aeródromo no
    se resuelve sin señal.
  */
  const fuentes = ["ENR3.1", "ENR4.4"]
    .map((clave) => {
      const f = fuenteAip(clave);
      return f ? [clave, f.documento, f.edicion, f.vigenteDesde, f.url] : null;
    })
    .filter((f): f is (string)[] => f !== null);

  return { esquema: 1, aerodromos, radioayudas, fixes, aerovias, fuentes } as CatalogoSerializado;
}
