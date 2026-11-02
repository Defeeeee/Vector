/**
 * La ruta del planificador: una lista de puntos, no un par origen-destino.
 *
 * ## Por qué un tipo propio y no `splitRoute`
 *
 * `src/lib/route.ts:splitRoute` devuelve **exactamente dos elementos**, tiene doce
 * archivos que la consumen y un test que fija ese comportamiento. No se toca. Ese
 * contrato es correcto para lo que hace: el campo `route` de un vuelo ya cargado
 * describe de dónde salió y dónde terminó, y todas las agregaciones de la app —el
 * mapa, el resumen, las estadísticas— cuentan sobre esa base.
 *
 * Un plan de navegación es otra cosa: SADM → Chivilcoy → Junín es **un** vuelo con
 * **tres** puntos, y el del medio no es ni origen ni destino. Meterlo a la fuerza en un
 * par obligaría a cambiar `splitRoute` y con ella los doce consumidores, para modelar
 * algo que sólo existe en una pantalla.
 *
 * Así que este tipo vive acá, y en el borde —cuando el plan se convierte en un vuelo
 * cargado— `aCampoRoute` lo traduce al formato de siempre.
 */

/**
 * Tope de puntos. No es una limitación técnica: es que una planilla de más de doce
 * tramos no se lee en pantalla ni entra en una hoja, y la URL —donde vive el estado—
 * se vuelve impracticable de compartir.
 */
export const MAX_PUNTOS = 12;

/**
 * Los puntos de una ruta a partir de texto libre.
 *
 * Acepta los mismos separadores que `splitRoute` —espacios y guiones— más la coma,
 * porque quien tipea una ruta larga la separa con comas. **No deduplica**: SADM SAAJ
 * SADM es una ida y vuelta perfectamente normal, y colapsarla borraría el tramo de
 * regreso.
 *
 * No valida nada. De la forma de cada token se ocupa `clasificarToken` en `lib/puntos.ts`
 * y de si existe, el directorio; acá sólo se parte texto.
 *
 * ## Por qué la barra no es separador, y por qué eso decide la sintaxis
 *
 * Un punto de ruta ya no es sólo un aeródromo: puede ser `BAR/045/25` —25 NM en el
 * radial 045 de Bariloche— o una coordenada propia. **La barra separa adentro de un
 * punto; el espacio, la coma y el guión separan entre puntos.** De ahí sale que las
 * coordenadas se escriban `S34.68/W58.64` y no `-34.68,-58.64`: con esta gramática, la
 * coma partiría el punto en dos y el menos también.
 */
export function parsearRuta(texto: string): string[] {
  return (texto ?? "")
    .split(/[\s,\-]+/)
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, MAX_PUNTOS);
}

/**
 * La ruta como cabe en una URL: `SADM-SAAJ-SAZN`.
 *
 * El estado del planificador vive en la URL y no en la base, así que un plan se
 * comparte mandando el link y se imprime desde el navegador. El guión es el separador
 * porque no necesita escaparse.
 */
export function rutaAUrl(codigos: string[]): string {
  return codigos.filter(Boolean).slice(0, MAX_PUNTOS).join("-");
}

/**
 * El campo `route` de un vuelo, a partir de un plan.
 *
 * **Primero y último, con el formato de siempre.** Lo que se pierde son los puntos
 * intermedios, y conviene decirlo en vez de disimularlo: un SADM → Chivilcoy → Junín
 * queda guardado como `"SADM SAAJ"`, igual que si hubiera ido derecho. Es el precio de
 * no tocar `splitRoute`, y es el correcto: la bitácora responde "de dónde a dónde
 * volaste", que sigue siendo cierto.
 *
 * Cuando el primero y el último coinciden —una ida y vuelta— devuelve **un solo
 * código**, que es como `route.ts` representa un vuelo que sale y vuelve al mismo
 * campo. Repetirlo haría que las agregaciones contaran ese aeródromo dos veces.
 */
export function aCampoRoute(codigos: string[]): string {
  const limpios = codigos.filter(Boolean).map((c) => c.trim().toUpperCase()).filter(Boolean);
  if (limpios.length === 0) return "";

  const primero = limpios[0];
  const ultimo = limpios[limpios.length - 1];
  return primero === ultimo ? primero : `${primero} ${ultimo}`;
}

/**
 * De qué clase es un punto del plan.
 *
 * No es decoración: **decide qué se le puede pedir.** A un aeródromo se le pide METAR,
 * NOTAM y pista en uso; a una coordenada en el medio del campo, nada de eso. Ver
 * `puntosConBriefing`.
 */
export type ClasePunto = "aerodromo" | "radioayuda" | "fix" | "coordenada" | "radial" | "aerovia";

/** Un punto del plan, ya resuelto contra el directorio. */
export interface PuntoRuta {
  /** El token tal como se tipeó: ICAO, designador ANAC, ident, coordenada o radial. */
  codigo: string;
  /** Nombre corto para mostrar. Vacío si el código no resolvió. */
  label: string;
  lat?: number;
  lon?: number;
  /**
   * Variación magnética del aeródromo, oeste positiva. Ver `navegacion.ts`.
   *
   * **Sólo los aeródromos la tienen.** Un punto por coordenada o por radial no la trae:
   * sale del WMM, que acá corre en el build y no en producción, y usar la de la estación
   * en su lugar sería peor que nada —es de 2007 y es la de alineación, no la del
   * terreno—. El plan usa una sola variación, la de salida, así que no falta.
   */
  variacionW?: number;
  /** `false` cuando el código no existe en el directorio. */
  resuelto: boolean;
  /** Qué clase de punto es. `undefined` mientras no resolvió. */
  clase?: ClasePunto;
  /** Elevación en pies. Alimenta la densidad de altitud del briefing. */
  elevacionFt?: number;
  /** Pistas con rumbo verdadero, para el viento cruzado. Vacío en la mayoría. */
  pistas?: { le: string; he: string; rumboT: number; largoFt?: number; superficie?: string; fuente?: "medida" | "estimada" }[];
  /** Qué sintonizar, en los puntos que nacen de una radioayuda. */
  estacion?: { ident: string; tipo: string; nombre: string; frecuencia: string | null };
  /** Las aerovías del punto significativo: `W67-SID BCA`. Sólo en los `fix`. */
  rutas?: string;
  /** De cuándo es el dato del AIP. Se muestra: el AIP se enmienda cada 28 días. */
  vigencia?: { documento: string; edicion: string; vigenteDesde: string; url: string };
}

/**
 * Los puntos a los que tiene sentido pedirles briefing.
 *
 * **Sólo los aeródromos**, y esto no es cosmético: `veredictoDeRuta` cuenta cuántas
 * estaciones contestaron para decidir si puede opinar. Un punto por coordenada nunca va
 * a tener METAR, así que mandarlo al briefing lo contaría como una estación caída y
 * degradaría el veredicto de una ruta que está perfecta. Cuando no se sabe hay que
 * decirlo; inventar un "no sabemos" tampoco vale.
 *
 * Una radioayuda tampoco: `SDE` la estación no emite METAR, lo emite `SDE` el
 * aeródromo — y son objetos distintos aunque compartan las letras.
 */
export function puntosConBriefing(puntos: PuntoRuta[]): PuntoRuta[] {
  return puntos.filter((p) => p.clase === "aerodromo" && p.codigo.trim());
}

/**
 * Los puntos que sirven para calcular: los que tienen posición.
 *
 * Un plan con un código mal tipeado en el medio **no se calcula salteándolo**. Saltear
 * uniría los dos vecinos con una recta que el piloto no va a volar, y el total saldría
 * más corto que la realidad con pinta de válido. Devuelve `null` y la pantalla señala
 * cuál falta.
 */
export function puntosCalculables(puntos: PuntoRuta[]): { lat: number; lon: number }[] | null {
  const conPosicion = puntos.filter((p) => p.lat !== undefined && p.lon !== undefined);
  if (conPosicion.length !== puntos.length) return null;
  if (conPosicion.length < 2) return null;
  return conPosicion.map((p) => ({ lat: p.lat!, lon: p.lon! }));
}

/**
 * La variación magnética que se usa para todo el plan.
 *
 * **Una sola para todos los tramos, y es la de salida.** Es lo que hace una planilla en
 * papel, y es defendible mientras los tramos no crucen medio país: la variación cambia
 * despacio con la posición. Lo que **no** es defendible es usarla en una travesía larga
 * sin decirlo — de SADM a Bariloche hay quince grados de diferencia entre las puntas—,
 * así que la pantalla ofrece editarla y avisa cuando los extremos difieren mucho.
 *
 * `null` cuando el aeródromo de salida no la tiene. **No cero**: cero es un valor
 * perfectamente válido en Argentina —la línea agónica cruza la Patagonia— y
 * confundirlos haría que un dato faltante se viera como un aeródromo sobre la agónica.
 */
export function variacionDelPlan(puntos: PuntoRuta[]): number | null {
  return puntos[0]?.variacionW ?? null;
}

/**
 * Cuánto difiere la variación entre las puntas del plan, o `null` si no se puede saber.
 *
 * Sirve para una sola cosa: decidir si hay que avisarle al piloto que una variación
 * única no alcanza para esta ruta.
 */
export function dispersionDeVariacion(puntos: PuntoRuta[]): number | null {
  const valores = puntos.map((p) => p.variacionW).filter((v): v is number => v !== undefined);
  if (valores.length < 2) return null;
  return Math.max(...valores) - Math.min(...valores);
}

/** A partir de acá una variación única deja de ser inocente. Tres grados de rumbo. */
export const DISPERSION_TOLERABLE = 3;

/* -------------------------------------------------------------------------- */

/**
 * Tope de puntos **después** de expandir aerovías.
 *
 * `MAX_PUNTOS` sigue siendo doce para lo que se tipea, y ese número no cambió de sentido:
 * doce tokens es lo que se escribe cómodo y lo que entra en un link. Pero `ALBAL UM424
 * EZE` son tres tokens que valen catorce puntos, y esa planilla es legítima — es
 * exactamente la travesía larga que la aerovía viene a hacer fácil de escribir.
 *
 * Treinta es donde una planilla deja de servir para lo que sirve: leerla de reojo en
 * vuelo. Más que eso no es una ruta, es un listado.
 */
export const MAX_PUNTOS_EXPANDIDOS = 30;

/** Un token de aerovía: `A305`, `W67`, `UM424`. */
export function esAerovia(token: string): boolean {
  return /^U?[A-Z]\d{1,3}[A-Z]?$/.test((token ?? "").trim().toUpperCase());
}

export interface TramoAerovia {
  /** Los puntos que la aerovía aporta: **los del medio, sin la entrada ni la salida**. */
  puntos: string[];
  /** Por qué no se pudo, si no se pudo. Va tal cual a la pantalla. */
  error: string | null;
}

/**
 * El pedazo de una aerovía entre dos de sus puntos.
 *
 * Es el corazón de la feature y lo único que hace falta saber de una aerovía para armar
 * una planilla: por dónde pasa entre donde entrás y donde salís.
 *
 * ## Devuelve sólo los del medio
 *
 * Ni el de entrada ni el de salida: **los dos ya están en la ruta**, uno de cada lado de
 * la aerovía. Incluir cualquiera de los dos daría un tramo de cero millas —distancia 0,
 * rumbo indefinido, tiempo cero— justo en el medio de la planilla. Se vio manejando la
 * pantalla con un navegador: la última fila decía `OSA → OSA`.
 *
 * ## Se puede recorrer al revés
 *
 * El AIP lista los puntos en un sentido, pero una aerovía se vuela en los dos: la
 * dirección sólo decide los niveles de crucero pares o impares, que es asunto de un plan
 * IFR y no de esta planilla. Si el punto de salida aparece antes que el de entrada, la
 * secuencia se da vuelta.
 *
 * ## Cuando no se puede, no se adivina
 *
 * Si alguno de los dos puntos no está en la aerovía, devuelve el error con la lista de los
 * que sí. La alternativa sería tomar la aerovía entera o el pedazo más parecido, y las dos
 * versiones meten en la planilla un tramo que el piloto no eligió.
 *
 * Es pura y recibe la secuencia: se testea con tres puntos inventados en vez de con las
 * 220 aerovías reales, y puede correr en el cliente.
 */
export function tramoDeAerovia(
  secuencia: string[],
  desde: string,
  hasta: string,
  designador = "la aerovía"
): TramoAerovia {
  const d = (desde ?? "").trim().toUpperCase();
  const h = (hasta ?? "").trim().toUpperCase();

  const a = secuencia.indexOf(d);
  const b = secuencia.indexOf(h);
  if (a < 0 || b < 0) {
    const cual = a < 0 ? d || "(sin punto de entrada)" : h || "(sin punto de salida)";
    return { puntos: [], error: `${cual} no está en ${designador}. Pasa por ${secuencia.join(", ")}.` };
  }
  if (a === b) {
    return { puntos: [], error: `${designador} tiene que ir de un punto a otro distinto.` };
  }

  const puntos = a < b ? secuencia.slice(a + 1, b) : secuencia.slice(b + 1, a).reverse();
  if (puntos.length > MAX_PUNTOS_EXPANDIDOS) {
    return {
      puntos: [],
      error: `Ese tramo de ${designador} son ${puntos.length} puntos y el tope es ${MAX_PUNTOS_EXPANDIDOS}.`,
    };
  }
  return { puntos, error: null };
}

/**
 * Hasta dónde se puede ir por una aerovía desde un punto suyo.
 *
 * Es lo que llena el segundo desplegable del selector: **todos los puntos de la aerovía
 * menos aquel del que salís**. Existe para que no haya que saberse la aerovía de memoria —
 * el modo anterior obligaba a tipear `BCA W67 OSA` sin ninguna forma de averiguar que
 * `OSA` estaba ahí.
 */
export function salidasDesde(secuencia: string[], desde: string): string[] {
  const d = (desde ?? "").trim().toUpperCase();
  if (!secuencia.includes(d)) return [];
  return secuencia.filter((p) => p !== d);
}

/* -------------------------------------------------------------------------- */

/**
 * Un elemento de la ruta tal como se manipula: **un punto, o una aerovía con su salida**.
 *
 * La ruta se guarda como una lista plana de tokens —`SADM · BCA · W67 · OSA · SAZS`— pero
 * no se puede reordenar así. `W67` y `OSA` no son dos cosas independientes: la aerovía
 * *lleva* a OSA, y meter un punto entre las dos, o mover una sin la otra, produce una ruta
 * que no quiere decir nada.
 *
 * Así que reordenar opera sobre elementos, no sobre tokens. Es además lo que la pantalla ya
 * muestra: la banda de aerovía se ve como **una** cosa.
 */
export interface ElementoRuta {
  tipo: "punto" | "aerovia";
  /** Los índices de `codigos` que ocupa: uno si es punto, dos si es aerovía. */
  indices: number[];
}

/**
 * La ruta agrupada en elementos.
 *
 * `huecosAerovia` son las posiciones que ya se marcaron como aerovía aunque todavía no
 * tengan designador — una banda recién insertada, antes de elegir cuál.
 */
export function elementosDeRuta(codigos: string[], huecosAerovia: Set<number> = new Set()): ElementoRuta[] {
  const elementos: ElementoRuta[] = [];
  for (let i = 0; i < codigos.length; i++) {
    if (esAerovia(codigos[i]) || huecosAerovia.has(i)) {
      // La aerovía se lleva su punto de salida. Si no hay —ruta a medio armar— va sola, y
      // la pantalla la muestra incompleta en vez de romperse.
      const indices = i + 1 < codigos.length ? [i, i + 1] : [i];
      elementos.push({ tipo: "aerovia", indices });
      i += indices.length - 1;
    } else {
      elementos.push({ tipo: "punto", indices: [i] });
    }
  }
  return elementos;
}

/**
 * El orden de índices que resulta de mover un elemento un lugar.
 *
 * Devuelve una **permutación de los índices originales**, no una ruta nueva: quien llama
 * la aplica igual a `codigos` y a `resueltos`, y así las dos listas no se pueden
 * desincronizar. Cuando se movían por separado, un punto quedaba con la resolución de otro
 * — que en esta pantalla significa mostrar el nombre de un aeródromo arriba del código de
 * otro.
 *
 * `null` cuando el movimiento no se puede hacer:
 *
 * - Contra el borde de la lista.
 * - Si dejaría una **aerovía primera**. Una aerovía necesita un punto de entrada antes; sin
 *   él no hay tramo posible y la banda quedaría pidiendo algo que no existe.
 */
export function moverElemento(
  codigos: string[],
  huecosAerovia: Set<number>,
  elemento: number,
  direccion: -1 | 1
): number[] | null {
  const elementos = elementosDeRuta(codigos, huecosAerovia);
  const destino = elemento + direccion;
  if (elemento < 0 || elemento >= elementos.length || destino < 0 || destino >= elementos.length) return null;

  const orden = [...elementos];
  [orden[elemento], orden[destino]] = [orden[destino], orden[elemento]];

  if (orden[0]?.tipo === "aerovia") return null;

  return orden.flatMap((e) => e.indices);
}

/**
 * Dónde cae un token nuevo si se inserta **después** del elemento `elemento`.
 *
 * Existe para que "agregar un punto acá" sea una posición y no un `push` al final. La
 * versión anterior de la pantalla sólo sabía agregar al final, así que para meter un punto
 * en el medio había que borrar todo lo que venía después y volver a escribirlo.
 */
export function posicionDespuesDe(
  codigos: string[],
  huecosAerovia: Set<number>,
  elemento: number
): number {
  const elementos = elementosDeRuta(codigos, huecosAerovia);
  if (elemento < 0) return 0;
  const e = elementos[Math.min(elemento, elementos.length - 1)];
  return e ? e.indices[e.indices.length - 1] + 1 : codigos.length;
}
