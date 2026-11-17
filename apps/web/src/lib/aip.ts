import fs from "node:fs";
import path from "node:path";

/**
 * Los datos operativos que ANAC publica en el AIP y **no** en MADHEL.
 *
 * Sólo servidor: lee del disco, igual que `airports.ts`.
 *
 * ## Por qué existe
 *
 * Para un aeródromo **controlado**, la API de MADHEL devuelve `radio: []`, `rwy: []`,
 * `fuel: ""` y `telephone: []`. No es un error de la API: ANAC publica eso en el AIP, en
 * la sección AD 2 de cada aeródromo, y MADHEL cubre el resto del país.
 *
 * Ese hueco se tapaba con una tabla escrita a mano —`CONTROLLED_FALLBACKS`— que la
 * pantalla rotulaba **"Ficha Operativa Oficial ANAC MADHEL"**. No era de MADHEL y no era
 * correcta: de sus veintiséis frecuencias **sólo tres coincidían con el AIP**. San
 * Fernando figuraba con la torre en 118.45 cuando son 119.00 y 120.05; Rosario tenía las
 * tres mal; El Palomar tenía la pista **17/35 anotada como 16/34**, que es el número
 * pintado en el umbral. Lo reportó un piloto que cruzó la pantalla con la carta.
 *
 * ## La regla que lo hace no repetible
 *
 * Los valores de acá salen de `aip-frecuencias.tsv` y `aip-pistas.tsv`, transcritos a
 * mano —las tablas del AIP tienen ocho maquetaciones distintas y un parser que las
 * adivine todas es más frágil que un par de ojos—, **y `aip.test.ts` verifica que cada
 * frecuencia y cada medida aparezca literalmente en el texto extraído del PDF oficial**,
 * que vive en `src/data/aip/<ICAO>.txt`.
 *
 * O sea: **no se puede escribir acá un número que el AIP no diga.** Con esa prueba,
 * ninguno de los errores de arriba habría llegado a producción.
 *
 * ## Y la fecha se muestra
 *
 * El AIP se enmienda cada 28 días. `aip-fuentes.tsv` guarda la edición y desde cuándo
 * rige cada documento, y la pantalla lo muestra: un dato de navegación sin fecha obliga
 * al piloto a suponer, y lo que suponga va a ser optimista.
 */

import {
  componerFicha,
  textoFrecuencia,
  textoPista,
  type CamposMadhel,
  type CartaAip,
  type DatosAip,
  type FichaCompuesta,
  type FrecuenciaAip,
  type FuenteAip,
  type PistaAip,
} from "./aip-compuesta";

// La parte pura vive en `aip-compuesta.ts` (corre también en el navegador); se reexporta acá.
export { componerFicha, textoFrecuencia, textoPista };
export type { CamposMadhel, CartaAip, DatosAip, FichaCompuesta, FrecuenciaAip, FuenteAip, PistaAip };

/**
 * **Los teléfonos no están, y es una decisión.**
 *
 * La tabla vieja traía uno o dos por aeródromo, escritos a mano y sin fuente. El AIP no
 * los publica en un campo propio —aparecen sueltos adentro de observaciones de AD 2.3— y
 * MADHEL no devuelve ninguno para los controlados. Como no hay de dónde sacarlos con
 * respaldo, no se muestran: es la misma regla que el resto del proyecto. Un teléfono
 * equivocado abajo de un rótulo que dice "oficial" es peor que ningún teléfono.
 */

interface Indice {
  frecuencias: Map<string, FrecuenciaAip[]>;
  pistas: Map<string, PistaAip[]>;
  cartas: Map<string, CartaAip[]>;
  servicios: Map<string, { ubicacion: string; combustible: string }>;
  fuentes: Map<string, FuenteAip>;
}

let indice: Indice | null = null;

function leer(nombre: string): string[][] {
  const archivo = path.join(process.cwd(), "src", "data", nombre);
  if (!fs.existsSync(archivo)) return [];
  return fs
    .readFileSync(archivo, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => l.split("\t"));
}

function cargar(): Indice {
  if (indice) return indice;

  const frecuencias = new Map<string, FrecuenciaAip[]>();
  for (const [icao, servicio, distintivo, canal, mhz, horario, nota] of leer("aip-frecuencias.tsv")) {
    if (!icao || !mhz) continue;
    const lista = frecuencias.get(icao) ?? [];
    lista.push({
      servicio: servicio ?? "",
      distintivo: distintivo ?? "",
      canal: canal ?? "",
      mhz,
      horario: horario ?? "",
      nota: nota ?? "",
    });
    frecuencias.set(icao, lista);
  }

  const pistas = new Map<string, PistaAip[]>();
  for (const [icao, designador, dimensiones, superficie, resistencia] of leer("aip-pistas.tsv")) {
    if (!icao || !designador) continue;
    const lista = pistas.get(icao) ?? [];
    lista.push({ designador, dimensiones: dimensiones ?? "", superficie: superficie ?? "", resistencia: resistencia ?? "" });
    pistas.set(icao, lista);
  }

  const cartas = new Map<string, CartaAip[]>();
  for (const [icao, letra, titulo, edicion, vigenteDesde, url] of leer("aip-cartas.tsv")) {
    if (!icao || !url) continue;
    const lista = cartas.get(icao) ?? [];
    lista.push({ letra: letra ?? "", titulo: titulo ?? "", edicion: edicion ?? "", vigenteDesde: vigenteDesde ?? "", url });
    cartas.set(icao, lista);
  }

  const servicios = new Map<string, { ubicacion: string; combustible: string }>();
  for (const [icao, ubicacion, combustible] of leer("aip-servicios.tsv")) {
    if (!icao) continue;
    servicios.set(icao, { ubicacion: ubicacion ?? "", combustible: combustible ?? "" });
  }

  const fuentes = new Map<string, FuenteAip>();
  for (const [icao, documento, edicion, vigenteDesde, url] of leer("aip-fuentes.tsv")) {
    if (!icao) continue;
    fuentes.set(icao, { documento: documento ?? "", edicion: edicion ?? "", vigenteDesde: vigenteDesde ?? "", url: url ?? "" });
  }

  indice = { frecuencias, pistas, cartas, servicios, fuentes };
  return indice;
}

/**
 * Lo que el AIP publica de ese aeródromo, o `null` si no hay nada.
 *
 * `null` y no un objeto vacío: la diferencia le importa a quien llama, porque decide
 * entre "el AIP no dice nada de acá" y "el AIP dice que no hay". Sólo están los ocho
 * controlados que MADHEL deja vacíos; para el resto del país MADHEL alcanza y sobra.
 */
export function datosAip(icao: string): DatosAip | null {
  const clave = (icao ?? "").trim().toUpperCase();
  const { frecuencias, pistas, cartas, servicios, fuentes } = cargar();
  const f = frecuencias.get(clave);
  const p = pistas.get(clave);
  const c = cartas.get(clave);
  /*
    Alcanza con **cualquiera** de los tres para que el aeródromo tenga datos del AIP. Hay
    fichas con carta y sin AD 2.18 legible, y devolver `null` ahí escondería la carta por
    un motivo que no tiene nada que ver con ella.
  */
  if (!f && !p && !c) return null;
  const s = servicios.get(clave);
  return {
    frecuencias: f ?? [],
    pistas: p ?? [],
    cartas: c ?? [],
    ubicacion: s?.ubicacion ?? "",
    combustible: s?.combustible ?? "",
    fuente: fuentes.get(clave) ?? null,
  };
}

/**
 * La procedencia de un documento del AIP, por su clave.
 *
 * La clave es el ICAO para los AD 2 y `ENR4.4` para los puntos significativos:
 * `aip-fuentes.tsv` es **la tabla única de procedencia de todo lo que sale del AIP**, y la
 * escriben dos generadores que se fusionan en vez de pisarse. Existe aparte de `datosAip`
 * porque ENR 4.4 no tiene ni frecuencias ni pistas: tiene mil puntos y una fecha.
 */
export function fuenteAip(clave: string): FuenteAip | null {
  return cargar().fuentes.get((clave ?? "").trim().toUpperCase()) ?? null;
}

/** Los ICAO que tienen datos del AIP. Lo usa el test para recorrerlos todos. */
export function icaosConAip(): string[] {
  return [...cargar().frecuencias.keys()].sort();
}

