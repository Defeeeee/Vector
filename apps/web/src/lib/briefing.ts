import { windComponents } from "./aviation";
import { frescura, horaDeObservacion, sirveParaDecidir } from "./frescura";

/**
 * El veredicto meteorológico de una ruta: ¿se puede volar visual?
 *
 * ## Por qué esto salió de `RouteWeatherClient.tsx`
 *
 * Vivía adentro del componente como `getRouteAnalysis`, 57 líneas que deciden si el
 * piloto sale o no —"No se aconseja vuelo VFR", "Ruta 100% VFR habilitada"— con tres
 * umbrales sin nombre y **cero tests**, porque `vitest` corre con
 * `environment: "node"` e `include: ["src/**\/*.test.ts"]` y no puede montar componentes.
 *
 * Era la lógica de mayor consecuencia de la app en el único lugar donde no se podía
 * verificar.
 *
 * ## El bug que motivó todo el plan
 *
 * En la tabla vieja, **`UNK` tenía `severity: 0`, idéntico a `VFR`**. Y cuando una
 * estación no contestaba, el fetch la marcaba `UNK`. La consecuencia:
 *
 * > Si se caía el servicio de meteorología para toda la ruta, la pantalla anunciaba
 * > **"Ruta 100% VFR habilitada — condiciones meteorológicas excelentes"**.
 *
 * Afirmar cuando no se sabe, y encima afirmar lo tranquilizador. Es exactamente lo que
 * el resto de Vector aprendió a no hacer: el patrón `unavailable` del dashboard, el
 * `datos_no_disponibles` del semáforo, el `null` de los tramos que no se pueden volar.
 *
 * Acá se arregla contando las estaciones: **el veredicto sabe de cuántas habló**, y no
 * puede decir que la ruta está bien si no las escuchó a todas.
 */

/** Categoría de vuelo del METAR, tal como la publica el upstream. */
export type CategoriaVuelo = "VFR" | "MVFR" | "IFR" | "LIFR" | "UNK";

/**
 * Cuán mala es cada categoría. **`UNK` no está acá a propósito**: no es un grado de
 * severidad, es la ausencia del dato. Mezclarlo en esta escala fue el bug.
 */
const SEVERIDAD: Record<Exclude<CategoriaVuelo, "UNK">, number> = {
  VFR: 0,
  MVFR: 1,
  IFR: 2,
  LIFR: 3,
};

export function severidadDe(categoria: CategoriaVuelo): number | null {
  return categoria === "UNK" ? null : SEVERIDAD[categoria];
}

/**
 * A partir de acá el viento deja de ser un detalle.
 *
 * 15 kt es el umbral que ya usaba la pantalla vieja y se conserva: no es una regla
 * publicada, es el punto donde conviene mirar el cruzado antes de salir.
 */
export const VIENTO_ATENCION_KT = 15;

export interface EstacionRuta {
  icao: string;
  /** `"UNK"` cuando no se pudo obtener. */
  categoria: CategoriaVuelo;
  /** Nudos, o `null` si no vino. */
  vientoKt: number | null;
  /** Cuántos NOTAM activos. `null` si no se pudo preguntar. */
  notams: number | null;
  /**
   * `false` cuando la consulta a esa estación falló. **Distinto de `categoria: "UNK"`**:
   * una estación puede responder y no publicar categoría.
   */
  respondio: boolean;
  /** El METAR crudo, que trae adentro su propia hora de observación. */
  metar?: string | null;
  /** La hora de observación en ISO, si el proveedor la mandó. */
  observadoEn?: string | null;
}

export type TonoVeredicto = "bien" | "atencion" | "peligro" | "sinDatos";

export interface Veredicto {
  tono: TonoVeredicto;
  titulo: string;
  detalle: string;
  /** Cuántas estaciones contestaron, sobre cuántas se preguntó. Siempre se muestra. */
  consultadas: number;
  respondieron: number;
  /** La estación que motivó el veredicto, si hay una. */
  estacion?: string;
}

/**
 * Si lo que contestó la estación ya no describe el cielo de ahora.
 *
 * **Un METAR de cuatro horas respondió pero no informa.** Contarlo como estación que
 * contestó le permitiría a esta función producir un verde tranquilizador a partir de
 * datos viejos, que es exactamente el bug de 2026 por otra puerta — y con un service
 * worker guardando respuestas deja de ser hipotético.
 *
 * Cuando la estación **no dice** cuándo observó —ni METAR crudo ni campo del
 * proveedor— se la cuenta como antes. Ausencia del dato es "el llamador no nos lo
 * pasó", no "es viejo": inventar vencimientos donde no hay información sería el error
 * simétrico.
 */
function vencida(e: EstacionRuta, ahora: Date): boolean {
  if (!e.metar && !e.observadoEn) return false;
  return !sirveParaDecidir(frescura(horaDeObservacion(e.observadoEn, e.metar, ahora), ahora));
}

/**
 * El veredicto de la ruta.
 *
 * ## Las reglas, en orden de precedencia
 *
 * 1. **Nadie contestó** → `sinDatos`. No se opina.
 * 2. IFR o LIFR en alguna estación → `peligro`.
 * 3. MVFR → `atencion`.
 * 4. Viento ≥ 15 kt → `atencion`.
 * 5. NOTAMs activos → `atencion`.
 * 6. Todo VFR **y todas contestaron** → `bien`.
 * 7. Todo VFR pero **falta alguna** → `atencion`, diciendo cuál falta.
 *
 * El punto 7 es el arreglo. Antes caía en el 6 y anunciaba que estaba todo bien.
 *
 * Un detalle de orden que importa: **el peligro se evalúa antes que la falta de datos
 * parcial**. Si una estación reporta IFR y otra no contestó, lo que hay que decir es
 * que hay IFR — el dato que falta no atenúa el que sí está.
 */
export function veredictoDeRuta(estaciones: EstacionRuta[], ahora = new Date()): Veredicto {
  const consultadas = estaciones.length;
  const informa = (e: EstacionRuta) => e.respondio && e.categoria !== "UNK" && !vencida(e, ahora);
  const conDato = estaciones.filter(informa);
  const respondieron = conDato.length;
  const faltantes = estaciones.filter((e) => !informa(e));

  const base = { consultadas, respondieron };

  if (consultadas === 0) {
    return {
      ...base,
      tono: "sinDatos",
      titulo: "Todavía no hay ruta",
      detalle: "Cargá al menos un aeródromo para consultar el estado meteorológico.",
    };
  }

  if (respondieron === 0) {
    /*
      **El caso que rompía.** Antes esto decía "Ruta 100% VFR habilitada". Ahora dice lo
      único cierto: que no sabemos.
    */
    return {
      ...base,
      tono: "sinDatos",
      titulo: "No pudimos consultar el estado meteorológico",
      detalle:
        consultadas === 1
          ? "La estación no respondió. Esto no significa que las condiciones sean buenas: significa que no las conocemos. Consultá el METAR por otra vía antes de salir."
          : `Ninguna de las ${consultadas} estaciones respondió. Esto no significa que las condiciones sean buenas: significa que no las conocemos. Consultá los METAR por otra vía antes de salir.`,
    };
  }

  // `conDato` ya excluyó los `UNK`, así que `severidadDe` nunca devuelve null acá — pero
  // se usa igual, en vez de castear la tabla, para que el día que cambie la escala no
  // haya un `as` escondido mintiéndole al compilador.
  const peor = conDato.reduce((a, b) => ((severidadDe(b.categoria) ?? 0) > (severidadDe(a.categoria) ?? 0) ? b : a));
  const severidadPeor = severidadDe(peor.categoria) ?? 0;

  const nota = faltantes.length
    ? ` No pudimos consultar ${faltantes.map((e) => e.icao).join(", ")}.`
    : "";

  if (severidadPeor >= 2) {
    return {
      ...base,
      tono: "peligro",
      estacion: peor.icao,
      titulo: "Condiciones instrumentales en la ruta",
      detalle: `${peor.icao} reporta ${peor.categoria}. No se aconseja vuelo VFR: requiere habilitación de instrumentos y revisar los mínimos del aeródromo.${nota}`,
    };
  }

  if (severidadPeor === 1) {
    return {
      ...base,
      tono: "atencion",
      estacion: peor.icao,
      titulo: "Condiciones marginales (MVFR)",
      detalle: `${peor.icao} reporta techo bajo o visibilidad reducida. Se puede volar visual, pero revisá techos en ruta y cartas de aproximación.${nota}`,
    };
  }

  const ventoso = conDato
    .filter((e) => e.vientoKt !== null && e.vientoKt >= VIENTO_ATENCION_KT)
    .sort((a, b) => (b.vientoKt as number) - (a.vientoKt as number))[0];

  if (ventoso) {
    return {
      ...base,
      tono: "atencion",
      estacion: ventoso.icao,
      titulo: "Viento fuerte en la ruta",
      detalle: `${ventoso.icao} reporta ${ventoso.vientoKt} kt. Mirá la componente cruzada sobre la pista en uso y comparala con el máximo demostrado de tu aeronave.${nota}`,
    };
  }

  const conNotams = conDato.find((e) => (e.notams ?? 0) > 0);
  if (conNotams) {
    return {
      ...base,
      tono: "atencion",
      estacion: conNotams.icao,
      titulo: "NOTAMs activos en la ruta",
      detalle: `Hay avisos publicados en ${conNotams.icao}. Revisalos: pueden ser clausuras de pista o servicios fuera de servicio.${nota}`,
    };
  }

  if (faltantes.length) {
    /*
      **El otro arreglo.** Todo lo que contestó está en VFR, pero falta alguien. No se
      puede decir "ruta habilitada" sobre una estación que no habló.
    */
    return {
      ...base,
      tono: "atencion",
      titulo: "Faltan datos de parte de la ruta",
      detalle: `Las ${respondieron} estaciones que respondieron reportan VFR, pero no pudimos consultar ${faltantes
        .map((e) => e.icao)
        .join(", ")}. Verificá esos aeródromos antes de salir.`,
    };
  }

  return {
    ...base,
    tono: "bien",
    titulo: "Toda la ruta en VFR",
    detalle:
      respondieron === 1
        ? "La estación reporta condiciones visuales, sin viento fuerte ni NOTAMs activos."
        : `Las ${respondieron} estaciones reportan condiciones visuales, sin viento fuerte ni NOTAMs activos.`,
  };
}

/* -------------------------------------------------------------------------- */
/* Viento cruzado sobre la pista                                              */
/* -------------------------------------------------------------------------- */

export interface Pista {
  /** Designador de una cabecera, "02". Magnético y posiblemente viejo. */
  le: string;
  /** El designador opuesto, "20". */
  he: string;
  /** Rumbo **verdadero** de la cabecera `le`. Es lo que se usa para calcular. */
  rumboT: number;
  largoFt?: number;
  superficie?: string;
  /**
   * De dónde salió `rumboT`, porque las dos fuentes no valen lo mismo:
   *
   * - `"medida"` — de OurAirports, que publica el rumbo verdadero real. Exacta.
   * - `"estimada"` — derivada del designador de MADHEL más la variación magnética. El
   *   designador viene redondeado a la decena y pintado hace años, así que arrastra
   *   ±5° de redondeo más la deriva de la variación desde que se pintó. Sirve —con
   *   15 kt de viento son un par de nudos de error en el cruzado— pero no es lo mismo,
   *   y la pantalla lo dice.
   */
  fuente?: "medida" | "estimada";
}

/**
 * Pistas a partir de lo que publica MADHEL, que es **texto libre**.
 *
 * Existe porque `runways.tsv` sólo cubre 93 aeródromos: OurAirports conoce únicamente
 * los que tienen indicador ICAO, y **558 de los 711 de MADHEL no tienen**. San Nicolás
 * de los Arroyos (SNY) es uno: la ficha de ANAC publica sus dos pistas y el planificador
 * decía que no tenía ninguna.
 *
 * MADHEL las manda así:
 *
 *     "18/36 1080x30 M - ASPH – AUW 23t/1 30t/2 - Limitada a aeronaves…"
 *     "09/27 809x23 M - Tierra."
 *
 * El designador es **magnético**, así que para llevarlo al marco verdadero —el único
 * que usa el resto del código— hay que **restarle** la variación oeste. Es la operación
 * inversa de `aMagnetico`.
 */
export function pistasDesdeMadhel(lineas: string[], variacionW: number | undefined): Pista[] {
  if (variacionW === undefined) return [];

  const pistas: Pista[] = [];

  for (const linea of lineas ?? []) {
    // "18/36", "09/27", "01L/19R". Al principio de la línea, que es donde MADHEL lo pone.
    const m = /^\s*(\d{1,2})([LRC]?)\s*\/\s*(\d{1,2})([LRC]?)/.exec(linea);
    if (!m) continue;

    const numero = Number(m[1]);
    if (!Number.isFinite(numero) || numero < 1 || numero > 36) continue;

    // Dimensiones: "1080x30 M" en metros. Sólo interesa el largo.
    const dim = /(\d{3,5})\s*[xX×]\s*\d{1,3}\s*M/.exec(linea);
    const largoM = dim ? Number(dim[1]) : NaN;

    pistas.push({
      le: `${m[1].padStart(2, "0")}${m[2]}`,
      he: `${m[3].padStart(2, "0")}${m[4]}`,
      // magnético → verdadero. La inversa exacta de `aMagnetico`.
      rumboT: ((numero * 10 - variacionW) % 360 + 360) % 360,
      largoFt: Number.isFinite(largoM) ? Math.round(largoM * 3.28084) : undefined,
      superficie: /ASPH|ASFAL/i.test(linea)
        ? "ASP"
        : /TIERRA|GRAVA|CESPED|CÉSPED|PASTO/i.test(linea)
          ? "TIERRA"
          : undefined,
      fuente: "estimada",
    });
  }

  return pistas;
}

export interface ComponentesPista {
  /** El designador de la cabecera que conviene usar con este viento. */
  cabecera: string;
  /** Rumbo verdadero de esa cabecera. */
  rumboT: number;
  /** Nudos de frente. Siempre ≥ 0: se elige la cabecera que da viento de frente. */
  frenteKt: number;
  /** Nudos de costado, en valor absoluto. */
  cruzadoKt: number;
  /** De qué lado entra el viento, para poder decirlo en castellano. */
  desde: "izquierda" | "derecha";
}

/**
 * Con qué cabecera conviene operar y cuánto cruzado hay.
 *
 * **Todo en verdadero, sin conversiones.** El rumbo de la pista viene de OurAirports en
 * grados verdaderos y el viento del METAR escrito también, así que `windComponents` los
 * come directamente. Meter la variación acá sería el error clásico: aplicarla dos veces
 * o ninguna, y en los dos casos el número sale mal en silencio.
 *
 * Se elige la cabecera con viento de frente, que es lo que hace cualquiera: de las dos
 * opciones, la que no te deja aterrizando de cola.
 *
 * Devuelve `null` si el viento es calmo o no se conoce — con viento cero no hay cabecera
 * preferida y afirmar una sería inventar.
 */
export function componentesDePista(
  pista: Pista,
  vientoDirT: number | null,
  vientoKt: number | null
): ComponentesPista | null {
  if (vientoDirT === null || vientoKt === null || !(vientoKt > 0)) return null;

  const opuesta = (pista.rumboT + 180) % 360;

  const candidatas = [
    { cabecera: pista.le, rumboT: pista.rumboT },
    { cabecera: pista.he, rumboT: opuesta },
  ].map((c) => {
    const { headwind, crosswind } = windComponents(c.rumboT, vientoDirT, vientoKt);
    return { ...c, headwind, crosswind };
  });

  // La que da más viento de frente. Con viento exactamente cruzado las dos empatan y
  // gana la primera, que es tan arbitrario como cualquier otra elección y no cambia el
  // cruzado, que es el número que importa.
  const elegida = candidatas[0].headwind >= candidatas[1].headwind ? candidatas[0] : candidatas[1];

  return {
    cabecera: elegida.cabecera,
    rumboT: elegida.rumboT,
    frenteKt: Math.max(0, elegida.headwind),
    cruzadoKt: Math.abs(elegida.crosswind),
    // `crosswind` positivo es viento desde la derecha — la convención de `aviation.ts`.
    desde: elegida.crosswind >= 0 ? "derecha" : "izquierda",
  };
}

/**
 * La pista con menos cruzado, de todas las del aeródromo.
 *
 * En un campo con dos pistas la pregunta útil no es "cuánto cruzado tiene la 11" sino
 * "cuál conviene". `null` cuando no hay pistas conocidas — que es el caso de 618 de los
 * 711 aeródromos de MADHEL, y por eso la pantalla tiene que saber decir que no sabe.
 */
export function mejorPista(
  pistas: Pista[],
  vientoDirT: number | null,
  vientoKt: number | null
): ComponentesPista | null {
  const opciones = pistas
    .map((p) => componentesDePista(p, vientoDirT, vientoKt))
    .filter((c): c is ComponentesPista => c !== null);

  if (opciones.length === 0) return null;
  return opciones.reduce((a, b) => (b.cruzadoKt < a.cruzadoKt ? b : a));
}
