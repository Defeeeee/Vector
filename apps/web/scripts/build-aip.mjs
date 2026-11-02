#!/usr/bin/env node
/**
 * Baja del AIP de ANAC los datos operativos de los aeródromos **controlados** y guarda
 * el texto tal como lo publica el documento oficial.
 *
 *   npm run build:aip
 *   npm run build:aip -- /ruta/a/pdfs   (usa PDF ya bajados: <ICAO>.pdf)
 *
 * ## Por qué existe, que es una historia fea
 *
 * Vector mostraba las frecuencias de estos aeródromos desde una tabla **escrita a mano**
 * en `lib/madhel-reference.ts`, rotulada en pantalla como "Ficha Operativa Oficial ANAC
 * MADHEL". No eran de MADHEL y no eran correctas: San Fernando figuraba con TWR en
 * 118.45 cuando el AIP dice 119.00 y 120.05, y de las veintiséis frecuencias de la tabla
 * **sólo tres coincidían con el AIP**. Las pistas estaban igual de mal — Aeroparque con
 * 2700 m cuando mide 2350, y El Palomar con la 16/34 cuando es la 17/35.
 *
 * El hueco que esa tabla tapaba es real: para un aeródromo **controlado**, la API de
 * MADHEL devuelve `radio: []`, `rwy: []`, `fuel: ""` y `telephone: []`. ANAC no lo
 * publica ahí; lo publica en el AIP, en la sección AD 2 de cada aeródromo. Lo que estaba
 * mal no era tapar el hueco: era taparlo con datos inventados y presentarlos como
 * oficiales.
 *
 * ## Qué guarda, y por qué guarda texto y no campos
 *
 * Escribe `src/data/aip/<ICAO>.txt` con los bloques **AD 2.2** (datos geográficos y
 * administrativos), **AD 2.4** (combustible), **AD 2.12** (pistas) y **AD 2.18**
 * (comunicaciones) extraídos del PDF, *verbatim*, y `src/data/aip-fuentes.tsv` con el
 * documento, la edición y la fecha de vigencia de cada uno.
 *
 * El texto crudo es la red de seguridad. Los valores que la app muestra viven en
 * `src/data/aip-ad.tsv`, curados a mano —las tablas del AIP tienen ocho maquetaciones
 * distintas y un parser que las adivine todas es más frágil que un par de ojos—, y
 * `aip.test.ts` **verifica que cada frecuencia y cada medida aparezca literalmente en el
 * texto extraído del PDF**. Con esa prueba, ninguno de los errores de arriba habría
 * llegado a producción: no se puede escribir un número que el AIP no diga.
 *
 * ## El ciclo AIRAC
 *
 * El AIP se enmienda cada 28 días. Este script es idempotente: se vuelve a correr, se
 * mira el diff del `.txt`, y si cambió algo se actualiza el TSV. La fecha de vigencia va
 * a `aip-fuentes.tsv` y **se muestra en pantalla**, para que el piloto sepa de cuándo es
 * lo que está leyendo.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractText, getDocumentProxy } from "unpdf";

const BASE = "https://ais.anac.gob.ar";
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = path.join(RAIZ, "src", "data", "aip");
const FUENTES = path.join(RAIZ, "src", "data", "aip-fuentes.tsv");

/**
 * Los aeródromos salen **del propio listado del AIP**: todos los que tienen ficha AD 2.0.
 *
 * Son 51 y cubren la red controlada del país, Morón incluido. Antes esto era una lista de
 * ocho escrita a mano —los que tenían entrada en la tabla vieja de frecuencias— y esa
 * lista tenía el mismo problema que los datos que reemplazó: envejecía sola. Si ANAC
 * publica la ficha de un aeródromo nuevo, entra en la próxima corrida sin que nadie toque
 * el código.
 *
 * **La Plata sigue afuera y no por omisión**: no es controlado, así que no tiene AD 2 en el
 * AIP, y MADHEL sí publica todos sus datos. Es el aeródromo que la tabla vieja pisaba con
 * una pista de tierra de 1435 m que en realidad es asfalto de 1427.
 */
function aerodromosDelListado(html) {
  const vistos = new Map();
  for (const fila of html.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
    const texto = fila.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
    const m = /^([A-Z]{4})-AD-2\.0\s/.exec(texto);
    if (!m) continue;
    const href = /href="([^"]+)"/.exec(fila);
    const sello = /(\d{2}\/\d{2})\s+(\d{2}-[A-Za-z]{3}-\d{2})/.exec(texto);
    if (href && sello) {
      vistos.set(m[1], { url: BASE + href[1], edicion: sello[1], vigenteDesde: sello[2] });
    }
  }
  return vistos;
}

/**
 * Las cartas de cada aeródromo, con su edición.
 *
 * `AD 2.A` es el plano de aeródromo y `AD 2.M` la carta de aproximación por instrumentos:
 * son las dos hojas que el piloto abre en otra pestaña del sitio de ANAC cada vez. Se
 * guarda el enlace y la fecha, no el PDF: son megabytes por hoja y cambian cada ciclo.
 */
const CARTAS = {
  A: "Plano de aeródromo",
  B: "Estacionamiento y atraque",
  C: "Movimientos en tierra",
  D: "Obstáculos tipo A",
  E: "Obstáculos tipo B",
  G: "Topográfica de precisión",
  I: "Salida normalizada (SID)",
  K: "Llegada normalizada (STAR)",
  M: "Aproximación por instrumentos",
};

function cartasDelListado(html) {
  const filas = [];
  for (const fila of html.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
    const texto = fila.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
    const m = /^([A-Z]{4})-AD-2\.([A-Z])\s/.exec(texto);
    if (!m || !CARTAS[m[2]]) continue;
    const href = /href="([^"]+)"/.exec(fila);
    const sello = /(\d{2}\/\d{2})\s+(\d{2}-[A-Za-z]{3}-\d{2})/.exec(texto);
    if (href && sello) {
      filas.push([m[1], m[2], CARTAS[m[2]], sello[1], sello[2], BASE + href[1]].join("\t"));
    }
  }
  return filas.sort();
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * El listado de documentos AD del AIP.
 *
 * Se pide con `X-Requested-With`, y no es superstición: sin esa cabecera el servidor
 * contesta su página de error 404. La página real lo manda porque el listado se carga
 * por AJAX.
 */
async function listadoAd() {
  const res = await fetch(`${BASE}/aip/ad`, {
    headers: { "User-Agent": UA, Referer: `${BASE}/aip`, "X-Requested-With": "XMLHttpRequest" },
  });
  if (!res.ok) throw new Error(`El listado AD contestó ${res.status}`);
  return res.text();
}

/** La fila `<ICAO>-AD-2.0` del listado: su enlace, su edición y su fecha. */
function documentoDe(html, icao) {
  for (const fila of html.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
    const texto = fila
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z]+;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!texto.includes(`${icao}-AD-2.0`)) continue;
    const href = /href="([^"]+)"/.exec(fila);
    // "… | 01/26 11-Jun-26" — la edición y desde cuándo rige.
    const sello = /(\d{2}\/\d{2})\s+(\d{2}-[A-Za-z]{3}-\d{2})/.exec(texto);
    if (!href || !sello) continue;
    return { url: BASE + href[1], edicion: sello[1], vigenteDesde: sello[2], titulo: texto };
  }
  return null;
}

/**
 * Un bloque del documento, de un encabezado al siguiente.
 *
 * Se corta por el encabezado siguiente y no por una cantidad de caracteres porque las
 * tablas del AIP no miden lo mismo en dos aeródromos: la de Ezeiza sigue en una segunda
 * página con un `(cont.)` y la de Mar del Plata entra en cinco renglones.
 */
function bloque(texto, desde, hasta) {
  const i = texto.indexOf(desde);
  if (i < 0) return null;
  const j = texto.indexOf(hasta, i + desde.length);
  return (j > i ? texto.slice(i, j) : texto.slice(i)).replace(/\n{3,}/g, "\n\n").trimEnd();
}

/* ------------------------------------------------------------------ parser --- */

/**
 * Las designaciones de servicio ATS, como **lista cerrada**.
 *
 * Cerrada y no un `[A-Z]{3,4}` genérico, porque con el genérico `CPPL` pasaba por
 * servicio: es el nombre del canal principal, aparece al principio del renglón de la
 * frecuencia, y el parser lo tomaba como si fuera la torre. Una etiqueta equivocada acá es
 * tan mala como un número equivocado — el piloto necesita saber cuál es la torre.
 */
const SERVICIOS = ["TWR", "SMC", "APP", "ATIS", "CLRD", "TMA", "AFIS", "ACC", "FIS", "GND", "DIF", "RDO", "D-ATIS"];
const RE_SERVICIO = new RegExp(`^((?:${SERVICIOS.join("|")})(?:\\s*/\\s*(?:${SERVICIOS.join("|")}))*)(?=\\s|$)`);
const RE_CANAL = /^(CPPL|CAUX(?:\s+(?:I{1,3}|IV))?|EMERG|DCL)\b/i;
const RE_ENCABEZADO =
  /^(AIP ARGENTINA|DEPARTAMENTO|Designaci|del Servicio|Service|Distintivo|Call sign|Canales|Channels|Frecuencia|Frequency|Horas|Hours|Observaciones|Remarks|designation|operation|AD 2\.18)/i;

/**
 * Las frecuencias de AD 2.18.
 *
 * **Se validó reproduciendo las 46 que ya estaban transcritas a mano** para los ocho
 * aeródromos originales, y las da todas idénticas, con su servicio y su canal. Recién
 * después se aplicó a los 51: un parser de PDF que nadie contrastó contra verdad conocida
 * es exactamente lo que este archivo vino a reemplazar.
 */
function frecuenciasDe(blk) {
  if (!blk) return [];
  const filas = [];
  let servicio = "";
  let distintivo = "";

  for (const cruda of blk.split("\n")) {
    const l = cruda.trim();
    if (!l || RE_ENCABEZADO.test(l) || /^\d( \d)+$/.test(l)) continue;

    const s = RE_SERVICIO.exec(l);
    if (s) {
      servicio = s[1].replace(/\s*\/\s*/g, "/");
      distintivo = l
        .slice(s[0].length)
        .replace(/(CPPL|CAUX.*|EMERG.*|DCL.*)/i, "")
        .replace(/\d{3}\.\d{1,3}\s*MHZ.*/i, "")
        .replace(/\s*\/\s*$/, "")
        .trim();
    } else if (!RE_CANAL.test(l) && !/^\d/.test(l) && servicio && !distintivo) {
      distintivo = l.replace(/\s*\/\s*$/, "").trim();
    }

    /*
      El canal se busca **sin exigir espacio delante**: la extracción pega las celdas y en
      Aeroparque y El Palomar sale `H24CAUX I 118.25 MHz`. Con el ancla de espacio la
      frecuencia salía bien pero el canal quedaba vacío, y ahí la etiqueta importa: CPPL es
      la principal y CAUX la auxiliar.

      **EMERG se descarta a propósito.** 121.500 es la frecuencia internacional de
      emergencia, la misma en todo el mundo, y listarla por aeródromo es ruido. Antes se
      caía sola porque el patrón pedía dos decimales y San Fernando la escribe `121.5` — o
      sea que cualquier frecuencia de un decimal se perdía en silencio.
    */
    const f = /(CPPL|CAUX(?:\s+(?:I{1,3}|IV))?|EMERG|DCL)?\s*(\d{3}\.\d{1,3})\s*MHZ/i.exec(l.toUpperCase());
    if (f && servicio && !/^EMERG$/i.test(f[1] ?? "")) {
      filas.push({ servicio, distintivo, canal: (f[1] ?? "").trim().replace(/\s+/g, " "), mhz: f[2] });
    }
  }
  return filas;
}

/**
 * Las pistas de AD 2.12: designador y dimensiones.
 *
 * **Sólo la primera tabla.** La continuación —`(cont.)`, columnas 8 a 14— trae las
 * dimensiones de la franja y de la SWY, y un `1.810x280` ahí adentro se parece muchísimo a
 * una pista de 1810 metros. En San Fernando ése es justamente el número que la tabla vieja
 * tenía mal.
 */
function pistasDe(blk) {
  if (!blk) return [];
  const lineas = blk.split("\n").map((l) => l.trim());
  const desde = lineas.findIndex((l) => /^1( \d)+$/.test(l));
  if (desde < 0) return [];
  /*
    La continuación de la tabla trae las dimensiones de la **franja** y de la SWY, y un
    `2.470x260` de ahí se parece muchísimo a una pista.

    El corte se hace por **lo primero que aparezca** de tres cosas, porque los 51
    documentos no son iguales y cada variante la marcó en rojo un aeródromo concreto:

    - el encabezado numérico de la continuación (`8 9 10 …`), que es lo habitual;
    - el rótulo `SWY (m)` o un `(cont.)`, porque **Mendoza no trae el encabezado numérico**
      y sin esto sus dimensiones de franja entraban como pistas de 300x150;
    - otra sección `AD 2.x`, porque en **Reconquista** el bloque se pasa de largo y
      arrastraba números de tablas que no tienen nada que ver.
  */
  const corta = (l) =>
    /^8( \d{1,2})+$/.test(l) || /\(cont\.\)/.test(l) || /SWY \(m\)/.test(l) || /^AD 2\.(?!12)\d/.test(l);
  const hasta = lineas.findIndex((l, i) => i > desde && corta(l));
  const fin = hasta > desde ? hasta : lineas.length;

  /*
    **Las cabeceras van de a pares y la dimensión se publica una sola vez por pista.**
    El AIP escribe `05 / 044.19° / 1.690x30 / …` y después `23 / 224.18° / …` sin repetir
    la medida. Buscar la dimensión hacia adelante desde cada cabecera le daba a la 23 la
    medida de la pista siguiente: Córdoba salía con la 23 de 3.200 m cuando mide 2.200.

    Así que se recogen las dos listas por separado —cabeceras en orden y dimensiones en
    orden— y se aparean: la enésima dimensión es la de la enésima pista.
  */
  const cabeceras = [];
  const dimensiones = [];
  for (let i = desde + 1; i < fin; i++) {
    const l = lineas[i];

    const d = /(\d\.\d{3}|\d{3,4})\s*x\s*(\d{2,3})(?!\d)/i.exec(l);
    if (d) dimensiones.push(`${d[1]}x${d[2]}`);

    const cab = /^(\d{1,2}[LRC]?)(?:\s|$)/.exec(l);
    if (!cab) continue;
    const n = Number(cab[1].replace(/\D/g, ""));
    if (!(n >= 1 && n <= 36)) continue;
    // `20 m`, `16 ft`, `12.75 m`: elevaciones y pendientes, no cabeceras.
    if (/^\d{1,2}[LRC]?\s+(m|ft|NM|%)/i.test(l)) continue;

    /*
      **El discriminador es la demora**, en el mismo renglón o en el siguiente. La columna
      2 de una fila de pista es el rumbo —`044.19°`, `051`— y ninguna otra fila lo tiene.
      Sin esto entraba como pista hasta un `20 ft` de elevación: Ezeiza aparecía con una
      pista 20 que no existe.
    */
    /*
      **No se exige demora.** Era el discriminador original —la columna 2 de una pista es
      su rumbo— y funcionaba en los ocho primeros, pero al pasar a 51 apareció que el AIP a
      veces la publica como `NIL`: Base Belgrano II y Tartagal no tienen ninguna, y
      pidiéndola se perdía la pista entera. Lo que separa una cabecera de una elevación es
      la estructura —número de una o dos cifras al principio del renglón, sin unidad
      detrás— más el corte de la tabla de arriba.
    */

    cabeceras.push(cab[1].padStart(2, "0"));
  }

  const pistas = [];
  for (let k = 0; k * 2 + 1 < cabeceras.length; k++) {
    const dim = dimensiones[k];
    if (!dim) break;
    pistas.push({ designador: `${cabeceras[k * 2]}/${cabeceras[k * 2 + 1]}`, dimensiones: dim });
  }
  return pistas;
}

/**
 * Una demora de pista: `044.19°`, `224.2°,`, `359.2,`.
 *
 * **El símbolo de grado no se puede exigir.** Córdoba lo pone en la 05/23 y lo omite en la
 * 01/19 —`359.2,`— así que pidiéndolo se perdía media Córdoba. Lo que sí es constante es
 * que la demora viene seguida de un separador, grado o coma, porque en la celda van las
 * dos: la geográfica y la magnética.
 *
 * Ese separador es lo que la distingue de una elevación (`465.5 m`) o de una pendiente
 * (`0.2%`), que es de lo que hay que distinguirla.
 *
 * Y el grado se acepta con **uno** a tres dígitos delante, no dos: Paraná publica la demora
 * en grados y minutos —`8° 27'`— y pidiendo dos dígitos se perdía la pista entera. Es el
 * tipo de variación que aparece recién al pasar de ocho aeródromos a cincuenta y uno.
 */
const RE_DEMORA = /\d{2,3}[.,]\d+\s*[°,]|\d{1,3}\s*°/;

/**
 * Los combustibles de aviación de la celda de AD 2.4.
 *
 * **Se extraen los tipos, no se copia la celda.** El AIP mezcla ahí los lubricantes y los
 * aditivos: San Fernando dice `AVGAS 100LL, JET A-1, JET OIL 2, PRIST (Anti-icing Aviation
 * Fuel Additive), W100 Aeroshell, W100 PLUS Aeroshell, W15W-50 Aeroshell`. Lo que el
 * piloto pregunta es si hay nafta o jet, y todo lo demás empuja esa respuesta fuera de
 * pantalla.
 *
 * Sigue siendo verificable: `aip.test.ts` comprueba que cada tipo que se muestra aparezca
 * en el documento, y la comparación ignora espacios — que hace falta, porque la extracción
 * del PDF parte `JET A-1` en `JET A -1`.
 */
function combustiblesDe(celda) {
  const plano = (celda ?? "").toUpperCase().replace(/\s+/g, "");
  const tipos = [];
  /*
    **Se emite la forma que el documento usa, no una canónica.** El AIP escribe `JET A-1` en
    casi todos lados y `JET A1` en Santa Rosa y Villa Reynolds; emitir siempre la primera
    ponía en pantalla una cadena que ese documento no contiene, y el test que verifica que
    todo lo mostrado esté en el PDF la rechazaba — con razón.
  */
  if (/AVGAS100LL/.test(plano)) tipos.push("AVGAS 100LL");
  else if (/AVGAS100/.test(plano)) tipos.push("AVGAS 100");
  else if (/AVGAS/.test(plano)) tipos.push("AVGAS");
  if (/JETA-1/.test(plano)) tipos.push("JET A-1");
  else if (/JETA1/.test(plano)) tipos.push("JET A1");
  else if (/JETA/.test(plano)) tipos.push("JET A");
  return tipos.join(", ");
}

/** Una línea con etiqueta y valor de AD 2.2 o AD 2.4, aplanada. */
function campoDe(blk, etiqueta) {
  if (!blk) return "";
  const plano = blk.replace(/\s+/g, " ");
  const i = plano.indexOf(etiqueta);
  if (i < 0) return "";
  return plano.slice(i + etiqueta.length);
}

async function textoDelPdf(bytes) {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

async function main() {
  const local = process.argv[2];
  fs.mkdirSync(SALIDA, { recursive: true });

  let html = null;
  if (!local) {
    console.log("Pidiendo el listado AD del AIP…");
    html = await listadoAd();
  } else {
    console.log(`Leyendo PDF de ${local}`);
    const guardado = path.join(local, "ad.html");
    if (fs.existsSync(guardado)) html = fs.readFileSync(guardado, "utf8");
  }

  const fichas = html ? aerodromosDelListado(html) : new Map();
  if (local && fichas.size === 0) {
    // Sin el listado, se toman los PDF que haya en la carpeta.
    for (const f of fs.readdirSync(local).filter((f) => f.endsWith(".pdf"))) {
      fichas.set(path.basename(f, ".pdf"), { url: "", edicion: "", vigenteDesde: "" });
    }
  }

  const fuentes = [];
  const frecuencias = [];
  const pistas = [];
  const servicios = [];
  let sinFrecuencias = 0;

  for (const [icao, meta] of [...fichas].sort()) {
    let bytes;
    if (local) {
      const archivo = path.join(local, `${icao}.pdf`);
      if (!fs.existsSync(archivo)) continue;
      bytes = fs.readFileSync(archivo);
      const sidecar = path.join(local, `${icao}.meta`);
      if (fs.existsSync(sidecar)) {
        const [edicion, vigenteDesde, url] = fs.readFileSync(sidecar, "utf8").trim().split("\t");
        Object.assign(meta, { edicion, vigenteDesde, url });
      }
    } else {
      const res = await fetch(meta.url, { headers: { "User-Agent": UA, Referer: `${BASE}/aip` } });
      if (!res.ok) {
        console.error(`  ${icao}: la descarga contestó ${res.status}`);
        continue;
      }
      bytes = Buffer.from(await res.arrayBuffer());
    }

    const texto = await textoDelPdf(bytes);
    const secciones = [
      ["AD 2.2", "AD 2.3"],
      ["AD 2.4", "AD 2.5"],
      ["AD 2.12", "AD 2.13"],
      ["AD 2.18", "AD 2.19"],
    ].map(([desde, hasta]) => [desde, bloque(texto, desde, hasta)]);
    const seccion = (n) => secciones.find(([d]) => d === n)?.[1] ?? null;

    const cabecera = [
      `# ${icao} — extraído de ${meta.url || "(PDF local)"}`,
      `# AIP ARGENTINA, AD 2.0 · edición ${meta.edicion || "?"} · vigente desde ${meta.vigenteDesde || "?"}`,
      `# Generado por scripts/build-aip.mjs. NO EDITAR A MANO: es la copia verbatim contra`,
      `# la que aip.test.ts contrasta los TSV, en los dos sentidos.`,
      "",
    ].join("\n");
    const cuerpo = secciones.map(([d, t]) => t ?? `${d} (no aparece en el documento)`).join("\n\n");
    fs.writeFileSync(path.join(SALIDA, `${icao}.txt`), `${cabecera}${cuerpo}\n`);

    for (const f of frecuenciasDe(seccion("AD 2.18"))) {
      frecuencias.push([icao, f.servicio, f.distintivo, f.canal, f.mhz].join("\t"));
    }
    for (const p of pistasDe(seccion("AD 2.12"))) {
      pistas.push([icao, p.designador, p.dimensiones].join("\t"));
    }

    /*
      La ubicación y el combustible se guardan **como los escribe el AIP**, cortados en el
      próximo número de ítem. Son texto libre y no vale la pena adivinarles estructura: el
      test comprueba que lo que se muestra esté en el documento, que es lo que importa.
    */
    /*
      La ubicación viene en castellano y en inglés, y el separador no es siempre ` / `:
      Morón las pega con un punto —"3 km al SW de la ciudad de Morón. 3 km SW of the city of
      Morón."—. Se corta antes de la segunda distancia, que es lo único que las dos
      versiones tienen en común.
    */
    const crudo = campoDe(seccion("AD 2.2"), "Direction and distance from city")
      .split(/\s+\d\s+ELEV/)[0]
      .split(" / ")[0]
      .trim();
    const distancias = [...crudo.matchAll(/\d+(?:[.,]\d+)?\s*(?:km|KM|NM|m)\b/g)];
    const ubicacion = (distancias.length > 1 ? crudo.slice(0, distancias[1].index).trim() : crudo)
      .replace(/[.\s]+$/, "")
      .slice(0, 90);
    const combustible = combustiblesDe(campoDe(seccion("AD 2.4"), "Fuel and oil types").split(/\s+3\s+Instalaciones/)[0]);
    if (ubicacion || combustible) servicios.push([icao, ubicacion, combustible].join("\t"));

    fuentes.push([icao, "AD 2.0", meta.edicion, meta.vigenteDesde, meta.url].join("\t"));
    const n = frecuenciasDe(seccion("AD 2.18")).length;
    if (n === 0) sinFrecuencias++;
    console.log(`  ${icao}: ${n} frecuencias · ${pistasDe(seccion("AD 2.12")).length} pistas · ${meta.edicion || "?"}`);
  }

  /*
    **Se ordena por aeródromo pero se respeta el orden del AIP adentro de cada uno.**
    Ordenar la línea entera alfabéticamente ponía `CAUX 120.05` antes que `CPPL 119.00`: la
    frecuencia auxiliar arriba de la principal, que es exactamente al revés de como se
    sintoniza. El AIP ya las lista en orden operativo —torre, rodaje, autorizaciones,
    ATIS—; no hay mejor criterio que ése y no hace falta inventar uno.
  */
  const porAerodromo = (filas) => {
    const grupos = new Map();
    for (const f of filas) {
      const icao = f.split("\t")[0];
      if (!grupos.has(icao)) grupos.set(icao, []);
      grupos.get(icao).push(f);
    }
    return [...grupos.keys()].sort().flatMap((k) => grupos.get(k));
  };

  fs.writeFileSync(path.join(RAIZ, "src", "data", "aip-frecuencias.tsv"), porAerodromo(frecuencias).join("\n") + "\n");
  fs.writeFileSync(path.join(RAIZ, "src", "data", "aip-pistas.tsv"), porAerodromo(pistas).join("\n") + "\n");
  fs.writeFileSync(path.join(RAIZ, "src", "data", "aip-servicios.tsv"), porAerodromo(servicios).join("\n") + "\n");

  if (html) {
    const cartas = cartasDelListado(html);
    fs.writeFileSync(path.join(RAIZ, "src", "data", "aip-cartas.tsv"), cartas.join("\n") + "\n");
    console.log(`\naip-cartas.tsv: ${cartas.length} cartas.`);
  }

  /*
    Se **fusiona**, no se sobrescribe. `aip-fuentes.tsv` es la tabla única de procedencia de
    todo lo que sale del AIP y la escriben tres generadores: éste pone una fila por
    aeródromo, `build-fixes.mjs` la de ENR 4.4 y `build-aerovias.mjs` las de ENR 3. Si
    alguno pisara el archivo entero, los otros perderían su fecha de vigencia sin hacer
    ruido — y una fecha que desaparece en silencio es la clase de dato que nadie nota que
    falta.
  */
  const mias = new Set(fuentes.map((f) => f.split("\t")[0]));
  const previas = fs.existsSync(FUENTES)
    ? fs.readFileSync(FUENTES, "utf8").split("\n").filter((l) => l.trim() && !mias.has(l.split("\t")[0]))
    : [];
  fs.writeFileSync(FUENTES, [...previas, ...fuentes].sort().join("\n") + "\n");

  console.log(`\n${fuentes.length} aeródromos · ${frecuencias.length} frecuencias · ${pistas.length} pistas.`);
  if (sinFrecuencias) console.log(`  sin AD 2.18 legible: ${sinFrecuencias}`);
}

main();
