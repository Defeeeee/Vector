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

export interface FrecuenciaAip {
  /** TWR, SMC, APP, ATIS, CLRD, TMA… tal como lo designa el AIP. */
  servicio: string;
  /** "Fernando Torre". Vacío cuando el AIP no lo da. */
  distintivo: string;
  /** CPPL (principal), CAUX (auxiliar). Vacío cuando la fila no distingue canales. */
  canal: string;
  /** En MHz, como se canta: "119.00". Texto y no número para no perder el segundo decimal. */
  mhz: string;
  /** "H24", "09:00-03:30 UTC". Vacío = el AIP no lo aclara para esa frecuencia. */
  horario: string;
  nota: string;
}

export interface PistaAip {
  /** "05/23". El número pintado en el umbral. */
  designador: string;
  /** "1.690x30", en metros y con el punto de millar del AIP. */
  dimensiones: string;
  /** ASPH, CONC, o la combinación que publique el AIP. */
  superficie: string;
  /** PCN/PCR y observaciones de umbral desplazado. */
  resistencia: string;
}

export interface FuenteAip {
  documento: string;
  /** "01/26". */
  edicion: string;
  /** "11-Jun-26", como lo sella el listado del AIP. */
  vigenteDesde: string;
  url: string;
}

export interface CartaAip {
  /** La letra del documento: `A` plano de aeródromo, `M` aproximación. */
  letra: string;
  titulo: string;
  edicion: string;
  vigenteDesde: string;
  url: string;
}

export interface DatosAip {
  frecuencias: FrecuenciaAip[];
  pistas: PistaAip[];
  /**
   * Las cartas oficiales del aeródromo.
   *
   * **Se guarda el enlace y la fecha, no el PDF.** Son megabytes por hoja y cambian cada
   * ciclo AIRAC: una copia nuestra envejecería sin avisar, que es exactamente el problema
   * del que viene todo este módulo. Lo que sí aporta Vector es no tener que buscarlas —
   * están en la ficha, con su edición, en vez de en otra pestaña del sitio de ANAC.
   */
  cartas: CartaAip[];
  /** "2 km al SW de la ciudad de San Fernando", de AD 2.2. Vacío si el AIP no lo da. */
  ubicacion: string;
  /** Los tipos que publica AD 2.4, separados por coma. Vacío = el AIP no lista ninguno. */
  combustible: string;
  fuente: FuenteAip | null;
}

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

/**
 * Una frecuencia como se lee: `TWR 119.00 · Fernando Torre`.
 *
 * El formato de la tabla vieja era `"TWR (Torre San Fernando): 118.45 MHz"` — una sola
 * cadena con todo adentro, que no se podía ni ordenar ni contrastar contra nada. Acá el
 * texto se arma al mostrar y los campos quedan separados, que es lo que permite el test.
 */
export function textoFrecuencia(f: FrecuenciaAip): string {
  const partes = [f.servicio, `${f.mhz} MHz`];
  if (f.canal) partes.splice(1, 0, f.canal);
  const cabeza = partes.join(" ");
  const cola = [f.distintivo, f.horario].filter(Boolean).join(" · ");
  return cola ? `${cabeza} — ${cola}` : cabeza;
}

/**
 * Una pista como se lee: `05/23 1690x30 M - ASPH - PCN 18 F/C/X/U`.
 *
 * **El punto de millar se saca acá, y no es cosmética.** El AIP escribe `1.690x30`, y el
 * TSV lo guarda así porque el test lo contrasta carácter por carácter contra el PDF. Pero
 * esta cadena la vuelve a leer `pistasDesdeMadhel` para estimar el rumbo y el largo de la
 * pista cuando no hay medición, y su expresión regular busca de tres a cinco dígitos
 * seguidos: contra `1.690x30` engancha `690x30` y da **una pista de 690 metros donde hay
 * 1690**. Un tercio del largo real, en el número que decide si el avión entra.
 *
 * Se descubrió antes de publicarlo, cruzando el formato nuevo con el parser que ya
 * existía; el test de abajo lo fija.
 */
export function textoPista(p: PistaAip): string {
  const dimensiones = p.dimensiones.replace(/(\d)\.(\d{3})/g, "$1$2");
  return [`${p.designador} ${dimensiones} M`, p.superficie, p.resistencia].filter(Boolean).join(" - ");
}

/* -------------------------------------------------------------------------- */

/** Lo que MADHEL contestó de un aeródromo, en los campos que el AIP puede completar. */
export interface CamposMadhel {
  runways: string[];
  radio: string[];
  localization: string;
  fuel: string;
  telephone: string[];
}

export interface FichaCompuesta extends CamposMadhel {
  /** De dónde salió lo que MADHEL no publica. `null` si no hizo falta el AIP. */
  aip: { edicion: string; vigenteDesde: string; url: string } | null;
}

/**
 * Junta lo que contestó MADHEL con lo que publica el AIP.
 *
 * **La regla es una sola: MADHEL manda donde publica; el AIP llena lo que quedó vacío.**
 * Y se decide **campo por campo**, no aeródromo por aeródromo — así la regla se sostiene
 * sola el día que ANAC empiece a publicar alguno de estos datos en MADHEL.
 *
 * ## Por qué esta función existe en vez de cinco líneas en cada ruta
 *
 * Porque eran cinco líneas en cada ruta, copiadas en `/api/notams`, `/api/chat` y el
 * webhook de WhatsApp — y estaban al revés en las tres: `fallback ? fallback.rwy : ...`,
 * o sea que el dato escrito a mano **pisaba** el de ANAC. La Plata mostraba una pista de
 * tierra de 1435 m donde MADHEL publica asfalto de 1427, y uno de sus siete teléfonos.
 *
 * Una regla que vive en tres lugares se corrige en dos y se olvida en uno. Acá vive una
 * vez y tiene tests.
 *
 * ## Los teléfonos no se completan
 *
 * El AIP no los publica en un campo propio y MADHEL no devuelve ninguno para los
 * controlados, así que ese renglón queda vacío y se ve vacío. Ver la nota en `DatosAip`.
 */
export function componerFicha(madhel: Partial<CamposMadhel>, aip: DatosAip | null): FichaCompuesta {
  const runways = madhel.runways?.length ? madhel.runways : (aip?.pistas ?? []).map(textoPista);
  const radio = madhel.radio?.length ? madhel.radio : (aip?.frecuencias ?? []).map(textoFrecuencia);
  const localization = madhel.localization?.trim() || aip?.ubicacion || "";
  const fuel = madhel.fuel?.trim() || aip?.combustible || "";

  /*
    Se declara el AIP como fuente sólo si **realmente aportó algo**. Un aeródromo del que
    MADHEL contesta todo no tiene por qué mostrar una fecha de vigencia del AIP: sería
    atribuirle a un documento un dato que no salió de ahí, que es la versión educada del
    error que originó todo esto.
  */
  const aporto =
    (!madhel.runways?.length && runways.length > 0) ||
    (!madhel.radio?.length && radio.length > 0) ||
    (!madhel.localization?.trim() && localization !== "") ||
    (!madhel.fuel?.trim() && fuel !== "");

  return {
    runways,
    radio,
    localization,
    fuel,
    telephone: madhel.telephone ?? [],
    aip:
      aporto && aip?.fuente
        ? { edicion: aip.fuente.edicion, vigenteDesde: aip.fuente.vigenteDesde, url: aip.fuente.url }
        : null,
  };
}
