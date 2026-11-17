import { aerodromosParaFiltrar, allAirports, allLads } from "@/lib/airports";
import { allAerovias } from "@/lib/aerovias";
import { fuenteAip } from "@/lib/aip";
import { armarMapa } from "@/lib/mapa-datos";
import { VERSION } from "@/lib/pwa";
import { ESQUEMA_PAQUETE, type PaqueteSinSenal } from "@/lib/sin-senal";

/**
 * El paquete de datos para volar sin señal, armado **con las mismas funciones que usa el servidor**
 * para contestar con señal (`allAirports`, `allAerovias`, `armarMapa`): nada se vuelve a parsear
 * acá, así que lo que llega al teléfono es lo que el servidor habría contestado. Sólo servidor.
 *
 * Sólo Argentina, con sus helipuertos (la ficha los muestra) y sin los que no tienen coordenadas.
 * Los 17.129 del directorio mundial son ~469 KB comprimidos y no sirven en un vuelo local: ver
 * `scripts/build-catalogo.mjs` para la cuenta.
 */
export function armarPaquete(): PaqueteSinSenal {
  const fuente = fuenteAip("ENR3.1");
  return {
    esquema: ESQUEMA_PAQUETE,
    version: VERSION,
    aerodromos: allAirports()
      .filter((a) => a.country === "AR" && a.lat !== undefined && a.lon !== undefined)
      .sort((a, b) => a.icao.localeCompare(b.icao)),
    aerovias: allAerovias().map((a) => ({ designador: a.designador, puntos: a.puntos })),
    vigenciaAerovias: fuente
      ? { documento: "ENR 3", edicion: fuente.edicion, vigenteDesde: fuente.vigenteDesde, url: fuente.url }
      : null,
    mapa: armarMapa(),
    lads: allLads().map((l): [string, string] => [l.numero, l.nombre]),
    filtrables: aerodromosParaFiltrar(),
  };
}
