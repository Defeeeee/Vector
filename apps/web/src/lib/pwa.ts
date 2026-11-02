/**
 * Lo que la PWA decide, separado de dónde lo ejecuta.
 *
 * El service worker no se puede testear en este repo —`vitest` corre en
 * `environment: "node"` y no hay ni jsdom—, así que **todo lo que sea criterio vive
 * acá y lo que queda del otro lado es plomería**. Es la misma jugada que parió
 * `briefing.ts`: la lógica con consecuencia salió del `.tsx` donde no se podía
 * testear, y por eso se pudo arreglar.
 */

/**
 * La versión construida, que es la que versiona el cache.
 *
 * Sale de `package.json` vía `next.config.js`, así que no hay un número escrito a
 * mano que pueda quedar viejo. En el service worker esta constante queda **horneada
 * en el bundle** por esbuild: cada build produce un `sw.js` distinto, que es
 * justamente lo que hace que el navegador note que hay versión nueva.
 */
export const VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";

/**
 * El cache del shell: assets con hash en la URL, íconos, la página de respaldo.
 *
 * **Lleva la versión en el nombre y se tira entero en cada deploy.** Puede: es todo
 * contenido inmutable que se vuelve a bajar solo, y dejarlo acumular significaría
 * guardar los chunks de todas las versiones que pasaron por el teléfono.
 */
export const CACHE_SHELL = `vector-shell-${VERSION}`;

/**
 * Los caches que **no** llevan versión, y por qué eso no es un descuido.
 *
 * Si el nombre llevara la versión, cada deploy los renombraría — y renombrar es
 * tirar. O sea que **cada deploy le borraría al piloto la bitácora que tiene para
 * ver sin señal**, que es exactamente lo que este plan viene a darle. Un deploy no
 * puede tener ese efecto.
 *
 * ⚠️ **No hay todavía un mecanismo de migración si la forma de lo guardado
 * cambia** —por ejemplo si cambiara el header con el que se estampa la fecha de
 * captura. Diseñarlo ahora sería diseñar contra un requisito que no existe; el día
 * que haga falta, un número de esquema en el nombre del cache es la forma obvia de
 * resolverlo.
 */
export const CACHE_PAGINAS = "vector-paginas";
export const CACHE_DATOS = "vector-datos";
export const CACHE_METEO = "vector-meteo";

/** Los caches con datos del piloto. Se borran al cerrar sesión; los otros no. */
export const CACHES_PERSONALES = [CACHE_PAGINAS, CACHE_METEO];

/** Todo lo que este service worker puede llegar a crear. */
export const CACHES_SIN_VERSION = [CACHE_PAGINAS, CACHE_DATOS, CACHE_METEO];

/** Prefijo de los caches versionados, para reconocer los viejos. */
export const PREFIJO_SHELL = "vector-shell-";

/** Los mensajes que la página le manda al service worker. */
export const MENSAJES = {
  /** Desregistrarse y borrar todo. La vía de escape de `?sw=reset`. */
  autodestruir: "vector:autodestruir",
  /** Activar la versión que está esperando, porque el piloto aceptó. */
  activarAhora: "vector:activar-ahora",
  /** Borrar los caches con datos personales. Ver el borrado al cerrar sesión. */
  olvidarDatosPersonales: "vector:olvidar-datos-personales",
} as const;

/**
 * Cuáles de los caches que existen hay que borrar al activar una versión nueva.
 *
 * ## La regla, y el error que evita
 *
 * Se borra **sólo** el shell de otras versiones. Nada más.
 *
 * La tentación al escribir un `activate` es la de siempre —"borrá todo lo que no sea
 * el cache actual"—, y acá esa línea sería destructiva: se llevaría puestos
 * `vector-paginas`, `vector-datos` y `vector-meteo` en **cada deploy**. El piloto
 * que despliega un martes y vuela el sábado se encontraría sin nada guardado, sin
 * ninguna señal de por qué. Un deploy tiene que ser invisible para lo que ya está
 * en el teléfono.
 *
 * Tampoco se toca lo que no lleve nuestro prefijo: el origen es nuestro hoy, pero
 * borrar caches ajenos por las dudas es la clase de barrido que después nadie
 * entiende.
 */
export function cachesABorrar(existentes: string[], shellActual = CACHE_SHELL): string[] {
  return existentes.filter((n) => n.startsWith(PREFIJO_SHELL) && n !== shellActual);
}

/**
 * Si una URL puede guardarse en el cache de páginas.
 *
 * Deja afuera lo que es de escritura o de sesión: el alta y la importación de
 * vuelos, los ajustes, la auditoría, y las pantallas de sesión. Una foto vieja de un
 * formulario de alta no sirve para nada y una del login confunde.
 *
 * `/dashboard/audit` queda afuera por un motivo más fuerte que "no sirve": el
 * resultado de la auditoría es un veredicto sobre la libreta del piloto, y un
 * veredicto guardado es un veredicto que puede haber dejado de ser cierto.
 */
const PAGINAS_CACHEABLES = [
  "/dashboard",
  "/dashboard/history",
  "/dashboard/summary",
  "/dashboard/balance",
  "/dashboard/calendario",
  "/dashboard/planificador",
  "/dashboard/airports",
  "/dashboard/tools",
  "/dashboard/novedades",
  // El plan de vuelo, para armarlo en la plataforma sin señal (2026-10-23). El editor
  // guarda lo escrito en el teléfono y lo sube al volver la señal (`borrador-plan.ts`).
  "/dashboard/plan-de-vuelo",
];

/** El editor de un plan guardado: `/dashboard/plan-de-vuelo/<uuid>`. */
const EDITOR_DE_PLAN = /^\/dashboard\/plan-de-vuelo\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function paginaCacheable(pathname: string): boolean {
  // La raíz se normaliza a cadena vacía, que tampoco está en la lista: no hace falta
  // tratarla aparte, y una condición de más sin test es una condición que miente.
  const p = pathname.replace(/\/+$/, "");
  return PAGINAS_CACHEABLES.includes(p) || EDITOR_DE_PLAN.test(p);
}

/**
 * Lo que se guarda en `install`, aunque el piloto no lo haya visitado nunca.
 *
 * Es corto a propósito. **Los assets de la app no están acá**: llevan el hash en la
 * URL, así que se cachean solos la primera vez que se piden (ver `estrategiaPara`).
 * Lo que sí hay que traer por adelantado es lo que sólo se necesita cuando ya no hay
 * red — la pantalla de respaldo — y lo que el sistema operativo puede pedir en
 * cualquier momento, como los íconos.
 */
export const PRECACHE = [
  "/sin-conexion",
  "/manifest.webmanifest",
  "/icono-192.png",
  "/icono-512.png",
  "/icono-512-maskable.png",
  "/apple-touch-icon.png",
  /*
    El favicon. Next lo sirve con un hash en la **query** (`/icon.svg?icon.0649…`),
    no en la ruta, así que el precache de `/icon.svg` pelado y el pedido real son
    entradas distintas del cache. Está igual en la lista porque lo que decide
    `estrategiaPara` es el `pathname`: con esto el pedido con query se guarda solo la
    primera vez que pasa, y el precache cubre el caso de que alguien lo pida limpio.
  */
  "/icon.svg",
  /*
    El catálogo de a bordo: 153 KB con los aeródromos, radioayudas, puntos
    significativos y aerovías de Argentina. Es lo que le permite al planificador
    resolver una ruta sin señal, y por eso se trae por adelantado en vez de esperar a
    que el piloto lo necesite — cuando lo necesita, por definición no hay red.
  */
  "/catalogo-aeronautico.json",
];

/**
 * Las rutas de API que son **datos aeronáuticos**: no cambian entre enmiendas del AIP.
 *
 * Van con revalidación en segundo plano: se contesta al instante con lo guardado y se
 * refresca atrás. El ciclo AIRAC es de 28 días, así que servir una respuesta de ayer
 * mientras llega la de hoy no tiene ningún costo — y sí lo tiene esperar la red en
 * cada tecla del autocompletado.
 */
export const RUTAS_DE_DATOS = [
  "/api/puntos",
  "/api/airports/search",
  "/api/airports/near",
  "/api/aerovias",
];

/** La única de las cuatro que el service worker puede contestar por su cuenta. */
export const RUTA_PUNTOS = "/api/puntos";

/**
 * Meteorología: se guarda, pero con **corte duro** y con la fecha a la vista.
 *
 * No entró hasta que la pantalla supo decir la antigüedad del dato (ver
 * `lib/frescura.ts`). Antes de eso, guardar un METAR era guardar algo que se
 * renderizaba idéntico tuviera cinco minutos o cinco horas — el peor bug de la
 * historia de esta app con otro disfraz.
 *
 * Los topes de acá no reemplazan a los de `frescura.ts`: **son otra cosa.** Aquéllos
 * miden cuándo se *observó* y deciden si el dato puede opinar; éstos miden cuánto hace
 * que lo *trajimos* y deciden si vale la pena servirlo. Un METAR de las 14:00Z traído a
 * las 14:05 y el mismo traído a las 19:00 no dicen lo mismo sobre el cielo de ahora.
 */
export const RUTAS_METEO: { ruta: string; maximoMin: number }[] = [
  /*
    Dos horas: un ciclo entero de METAR. Pasado eso la entrada se borra en vez de
    servirse — el mismo umbral que `INSERVIBLE_MIN`, porque es el mismo razonamiento.
  */
  { ruta: "/api/weather", maximoMin: 120 },
  /*
    Doce horas para NOTAM y viento en altura, que se mueven mucho más lento: un NOTAM
    tiene vigencia propia —viaja en el dato— y el GFS se corre cada seis.
  */
  { ruta: "/api/notams", maximoMin: 720 },
  { ruta: "/api/winds-aloft", maximoMin: 720 },
];

/** Cuándo se guardó una respuesta. Lo estampa el service worker. */
export const HEADER_CAPTURA = "X-Vector-Capturado-En";

/**
 * La clave de "qué le serví de verdad a esta navegación", separada de la entrada
 * general de la página.
 *
 * ## El problema que resuelve
 *
 * La entrada de `vector-paginas` para una URL puede reescribirse **después** de
 * haber contestado: cuando la copia guardada gana la carrera de 3 s, el pedido de
 * red que perdió sigue vivo en `waitUntil` y termina escribiendo una fecha de
 * captura nueva sobre esa misma entrada — encima, esto pasa segundos después de
 * responder, justo cuando `VistoPorUltimaVez` recién está montando y por primera
 * vez pregunta "¿de cuándo es esto?".
 *
 * Sin esta separación, esa pregunta se contesta leyendo un dato que ya cambió: el
 * componente ve el sello fresco que dejó el perdedor y calla, aunque lo que el
 * piloto tiene en pantalla sea la copia vieja que sí se sirvió. Es el modo de falla
 * exacto que el propio componente dice que no puede pasar.
 *
 * ## Por qué una clave sintética y no otra cosa
 *
 * El service worker escribe acá, **antes de responder**, el sello de lo que
 * efectivamente decidió servir — la fecha de la copia si sirvió la copia, o "ahora"
 * si sirvió la red — y esa escritura no vuelve a tocarse por ningún pedido
 * posterior a esta misma navegación. Es una entrada de una sola escritura por
 * respuesta, en vez de una que compite con el resto del tráfico de fondo.
 */
export function claveDeLoServido(pathname: string): string {
  return `/__vector__/servido${pathname}`;
}

/** El tope de esa ruta, o `null` si no es de las que se guardan. */
export function topeMeteo(pathname: string): number | null {
  return RUTAS_METEO.find((r) => r.ruta === pathname)?.maximoMin ?? null;
}

/**
 * Si una respuesta guardada todavía se puede servir.
 *
 * Sin fecha de captura **no se sirve**: no saber cuándo se trajo es no poder decir si
 * sirve, y este proyecto no afirma lo que no sabe.
 */
export function capturaVigente(capturadoEn: string | null, maximoMin: number, ahora: Date): boolean {
  if (!capturadoEn) return false;
  const t = Date.parse(capturadoEn);
  if (Number.isNaN(t)) return false;
  return ahora.getTime() - t <= maximoMin * 60000;
}

/** Qué hace el service worker con un pedido. */
export type Estrategia =
  /** No se mete: el navegador resuelve como si el service worker no existiera. */
  | "ignorar"
  /** Cache primero. Sólo para contenido inmutable. */
  | "assets"
  /** A la red; si falla de verdad, la pantalla de sin conexión. */
  | "navegacion"
  /** Datos aeronáuticos: se contesta con lo guardado y se refresca atrás. */
  | "datos"
  /** Meteorología: red primero, y lo guardado sólo si no pasó su tope. */
  | "meteo";

export interface Pedido {
  metodo: string;
  /** Absoluta. */
  url: string;
  /** El `request.mode`: `"navigate"` cuando el navegador va a pintar una página. */
  modo: string;
  /** Si trae el header `RSC`, o sea si es una navegación blanda de `next/link`. */
  esRSC: boolean;
}

/**
 * Qué hacer con un pedido. **Es toda la política del service worker.**
 *
 * ## Lo que no se toca, y por qué cada exclusión
 *
 * **Nada que no sea `GET`.** Las server actions de Next —incluido cerrar sesión— son
 * `POST` a la URL de la página con un header `Next-Action`. Meterse ahí rompe
 * mutaciones, y como no hay cola de escritura el service worker no tiene nada que
 * aportar en ese camino. Una línea que elimina una familia entera de bugs.
 *
 * **Nada de otro origen.** Los tiles del mapa son de un tercero y son muchos MB; el
 * backend está en otro dominio y ni siquiera pasa por el navegador.
 *
 * **Los pedidos con header `RSC` se ignoran, no se cachean.** Son las navegaciones
 * blandas de `next/link`: devuelven un payload de Flight, no HTML, y vienen con
 * `Vary: RSC, Next-Router-State-Tree, …`, o sea que la misma URL produce respuestas
 * distintas según de dónde venías. Cachearlos es inútil —el `Vary` casi nunca vuelve
 * a coincidir— y servirlos ignorando el `Vary` es peor: se pinta un árbol que no
 * corresponde.
 *
 * "Ignorar" acá quiere decir lo mismo que en todos lados en este archivo: el service
 * worker no llama a `respondWith`, así que el navegador resuelve el pedido por su
 * cuenta. Con red, eso funciona normal — no es que el pedido se haga fallar a
 * propósito. Es **sin** red que la navegación blanda no tiene con qué contestarse, y
 * ahí el router de Next cae solo a una navegación dura — momento en el que **esta
 * misma función** vuelve a consultarse, ahora para un pedido con `modo: "navigate"`,
 * y `paginaConRespaldo` puede hacer algo útil.
 *
 * ## Lo que sí
 *
 * `assets` es sólo para lo que **no puede cambiar de contenido sin cambiar de URL**:
 * `/_next/static/**` lleva el hash adentro del nombre, y los del precache se
 * renuevan con la versión del cache. Eso es lo que hace innecesario un manifiesto de
 * precache: no hace falta saber la lista de antemano si la URL ya promete que el
 * contenido es único.
 */
export function estrategiaPara(pedido: Pedido, origen: string): Estrategia {
  if (pedido.metodo !== "GET") return "ignorar";

  let url: URL;
  try {
    url = new URL(pedido.url);
  } catch {
    return "ignorar";
  }
  if (url.origin !== origen) return "ignorar";

  if (pedido.esRSC) return "ignorar";
  if (pedido.modo === "navigate") return "navegacion";

  if (url.pathname.startsWith("/_next/static/")) return "assets";
  if (PRECACHE.includes(url.pathname)) return "assets";
  if (RUTAS_DE_DATOS.includes(url.pathname)) return "datos";
  if (topeMeteo(url.pathname) !== null) return "meteo";

  return "ignorar";
}
