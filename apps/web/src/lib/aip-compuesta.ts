/**
 * La parte de la ficha del aeródromo que **no lee el disco**: los tipos de lo que publica el AIP y
 * la composición con lo de MADHEL (`componerFicha`), el AIP primero.
 *
 * Está aparte de `aip.ts` (que abre archivos con `fs`) para que el navegador y el service worker
 * armen la misma ficha sin señal, con el paquete de datos (`lib/ficha-paquete.ts`). `aip.ts` lo
 * reexporta, así que ningún llamador del servidor cambió. La explicación de cada regla está en
 * `aip.ts`.
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
 * **La regla es una sola: el AIP manda donde publica; MADHEL llena lo que el AIP no tiene.**
 * Y se decide **campo por campo**, no aeródromo por aeródromo.
 *
 * Hasta el 2026-11-03 era al revés (MADHEL mandaba). Se dio vuelta por pedido de Federico,
 * que quiere el AIP descargado como fuente principal, y porque es lo correcto:
 * - el propio MADHEL dice que, si difiere del AIP, vale el AIP;
 * - nuestro AIP está validado contra el PDF oficial, número por número (invariante 12), y
 *   se actualiza solo cada semana (`aip.yml`);
 * - lo que originó la regla de antes (abajo) era un dato **escrito a mano**, no el AIP.
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
  const delAip = {
    runways: (aip?.pistas ?? []).map(textoPista),
    radio: (aip?.frecuencias ?? []).map(textoFrecuencia),
    localization: aip?.ubicacion?.trim() ?? "",
    fuel: aip?.combustible?.trim() ?? "",
  };
  const runways = delAip.runways.length ? delAip.runways : (madhel.runways ?? []);
  const radio = delAip.radio.length ? delAip.radio : (madhel.radio ?? []);
  const localization = delAip.localization || madhel.localization?.trim() || "";
  const fuel = delAip.fuel || madhel.fuel?.trim() || "";

  /*
    Se declara el AIP como fuente sólo si **realmente aportó algo**. Un aeródromo que no
    está en el AIP no tiene por qué mostrar una fecha de vigencia del AIP: sería
    atribuirle a un documento un dato que no salió de ahí.
  */
  const aporto =
    delAip.runways.length > 0 || delAip.radio.length > 0 || delAip.localization !== "" || delAip.fuel !== "";

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
