import { getAirport, searchAirports } from "./airports";
import { getRadioayuda } from "./radioayudas";
import { buscarFixes, getFix } from "./fixes";
import { puntosDeAerovia } from "./aerovias";
import { fuenteAip } from "./aip";
import type { Catalogo } from "./catalogo";

/**
 * El `Catalogo` del servidor: los TSV del disco, tal como estaban.
 *
 * **No se tocó una línea de los parsers.** Este archivo es sólo el enchufe entre los
 * cinco módulos que ya existían y el puerto que declara `catalogo.ts`. Los índices
 * memoizados, la corrección de largos de pista con el AIP, la mezcla con MADHEL:
 * todo sigue donde estaba y funcionando igual.
 *
 * Lo único que cambia es que ahora hay **otra** implementación posible del mismo
 * puerto —`catalogo-json.ts`, para el navegador sin señal— y un test que exige que
 * las dos den el mismo resultado.
 *
 * Sólo corre en el servidor: los módulos de abajo leen archivos con `fs`.
 */
export const catalogoServidor: Catalogo = {
  aerodromo: (codigo) => getAirport(codigo),
  buscarAerodromos: (consulta, limite) => searchAirports(consulta, limite),
  radioayuda: (ident) => getRadioayuda(ident),
  fix: (designador) => getFix(designador),
  buscarFixes: (prefijo, limite) => buscarFixes(prefijo, limite),
  aerovia: (designador) => puntosDeAerovia(designador),
  fuenteAip: (clave) => fuenteAip(clave),
};
