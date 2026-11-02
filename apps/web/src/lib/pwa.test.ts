import { describe, expect, it } from "vitest";
import {
  PRECACHE,
  capturaVigente,
  claveDeLoServido,
  estrategiaPara,
  topeMeteo,
  type Pedido,
  CACHES_PERSONALES,
  CACHES_SIN_VERSION,
  CACHE_DATOS,
  CACHE_METEO,
  CACHE_PAGINAS,
  PREFIJO_SHELL,
  cachesABorrar,
  paginaCacheable,
} from "./pwa";

/**
 * Las dos decisiones de la PWA que se pueden testear sin navegador.
 *
 * El service worker no se puede montar acá, así que estas dos funciones son la
 * frontera: **lo que decide se testea, lo que ejecuta no**. Si alguna vez hay que
 * mover una regla adentro del `sw.ts`, es señal de que la regla está mal ubicada.
 */

describe("cachesABorrar", () => {
  it("se lleva el shell de las versiones viejas", () => {
    const borrar = cachesABorrar(
      [`${PREFIJO_SHELL}2.13.0`, `${PREFIJO_SHELL}2.14.0`],
      `${PREFIJO_SHELL}2.14.0`
    );
    expect(borrar).toEqual([`${PREFIJO_SHELL}2.13.0`]);
  });

  it("**no toca los caches sin versión: un deploy no puede borrar la bitácora offline**", () => {
    /*
      Es el test que justifica que esta función exista en vez de un filtro en línea
      adentro del `activate`. La línea que uno escribe sin pensar —"borrá todo lo que
      no sea el cache actual"— pasaría los otros dos tests de este archivo y se
      llevaría puesto, en cada deploy, todo lo que el piloto tiene guardado para ver
      sin señal.
    */
    const borrar = cachesABorrar(
      [`${PREFIJO_SHELL}2.13.0`, CACHE_PAGINAS, CACHE_DATOS, CACHE_METEO],
      `${PREFIJO_SHELL}2.14.0`
    );
    expect(borrar).toEqual([`${PREFIJO_SHELL}2.13.0`]);
    for (const cache of CACHES_SIN_VERSION) expect(borrar).not.toContain(cache);
  });

  it("no borra caches ajenos", () => {
    // El origen es nuestro, pero barrer lo que no reconocemos es la clase de
    // limpieza que después nadie sabe explicar.
    expect(cachesABorrar(["algo-de-otra-app", "workbox-precache"], `${PREFIJO_SHELL}1.0.0`)).toEqual([]);
  });

  it("sin nada que borrar devuelve una lista vacía, no null", () => {
    expect(cachesABorrar([], `${PREFIJO_SHELL}1.0.0`)).toEqual([]);
    expect(cachesABorrar([`${PREFIJO_SHELL}1.0.0`], `${PREFIJO_SHELL}1.0.0`)).toEqual([]);
  });

  it("los caches personales son un subconjunto de los que existen sin versión", () => {
    // Si alguien agrega un cache personal y se olvida de declararlo, el borrado al
    // cerrar sesión lo dejaría vivo con datos del piloto adentro.
    for (const cache of CACHES_PERSONALES) expect(CACHES_SIN_VERSION).toContain(cache);
  });

  it("el cache de datos aeronáuticos **no** es personal", () => {
    // Borrarlo al cerrar sesión sólo empeoraría el próximo vuelo: son datos
    // públicos del AIP, iguales para cualquiera.
    expect(CACHES_PERSONALES).not.toContain(CACHE_DATOS);
  });
});

describe("paginaCacheable", () => {
  it("las pantallas de lectura sí", () => {
    for (const p of [
      "/dashboard",
      "/dashboard/history",
      "/dashboard/planificador",
      "/dashboard/tools",
      "/dashboard/plan-de-vuelo",
      "/dashboard/plan-de-vuelo/3f2c1a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c",
    ]) {
      expect(paginaCacheable(p)).toBe(true);
    }
  });

  it("del plan de vuelo, sólo la lista y el editor de un plan con id", () => {
    expect(paginaCacheable("/dashboard/plan-de-vuelo/nuevo")).toBe(false);
    expect(paginaCacheable("/dashboard/plan-de-vuelo/3f2c1a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c/otra")).toBe(false);
  });

  it("**las de escritura y las de sesión no**", () => {
    /*
      Una foto vieja de un formulario de alta no sirve para nada, y una del login
      confunde. `audit` queda afuera por algo más fuerte: su resultado es un
      veredicto sobre la libreta, y un veredicto guardado puede haber dejado de ser
      cierto.
    */
    for (const p of [
      "/dashboard/log-flight",
      "/dashboard/log-flight/import",
      "/dashboard/settings",
      "/dashboard/audit",
      "/login",
      "/",
    ]) {
      expect(paginaCacheable(p)).toBe(false);
    }
  });

  it("la barra final no cambia la respuesta", () => {
    expect(paginaCacheable("/dashboard/history/")).toBe(true);
    expect(paginaCacheable("/")).toBe(false);
  });

  it("una ruta desconocida no se cachea", () => {
    // Lista blanca y no lista negra: una pantalla nueva no entra sola al cache sin
    // que alguien haya decidido que puede.
    expect(paginaCacheable("/dashboard/pantalla-que-no-existe-todavia")).toBe(false);
  });
});

describe("estrategiaPara", () => {
  const ORIGEN = "https://vector.fdiaznem.com.ar";
  const pedir = (url: string, extra: Partial<Pedido> = {}): Pedido => ({
    metodo: "GET",
    url: url.startsWith("http") ? url : ORIGEN + url,
    modo: "no-cors",
    esRSC: false,
    ...extra,
  });

  it("los assets con hash en la URL van al cache", () => {
    expect(estrategiaPara(pedir("/_next/static/chunks/006v7wp3sr4so.js"), ORIGEN)).toBe("assets");
    // Las tipografías salen por la misma puerta. `next/font` las auto-hospeda acá, y
    // olvidarlas es el error clásico: la app abre sin señal pero con la letra del
    // sistema.
    expect(estrategiaPara(pedir("/_next/static/media/02263eba-s.woff2"), ORIGEN)).toBe("assets");
  });

  it("lo del precache también, para que se renueve con la versión", () => {
    for (const recurso of PRECACHE) {
      expect(estrategiaPara(pedir(recurso), ORIGEN)).toBe("assets");
    }
  });

  it("una navegación es una navegación", () => {
    expect(estrategiaPara(pedir("/dashboard/history", { modo: "navigate" }), ORIGEN)).toBe("navegacion");
  });

  it("**nada que no sea GET**: las server actions son POST y romperlas rompe todo", () => {
    /*
      Cerrar sesión, programar un vuelo y cargar uno son server actions: POST a la
      URL de la página con un header `Next-Action`. Si el service worker se mete ahí,
      rompe mutaciones — y como no hay cola de escritura, no tiene nada que aportar.
    */
    for (const metodo of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(estrategiaPara(pedir("/dashboard", { metodo, modo: "navigate" }), ORIGEN)).toBe("ignorar");
    }
  });

  it("**los pedidos RSC se dejan fallar**, aunque sean navegaciones blandas", () => {
    /*
      Devuelven un payload de Flight con `Vary: RSC, Next-Router-State-Tree, …`: la
      misma URL da respuestas distintas según de dónde venías. Cachearlos es inútil y
      servirlos ignorando el `Vary` pinta un árbol que no corresponde. Al fallar, el
      router cae a navegación dura, y ahí sí se puede hacer algo útil.
    */
    expect(estrategiaPara(pedir("/dashboard/history", { esRSC: true }), ORIGEN)).toBe("ignorar");
    expect(estrategiaPara(pedir("/dashboard/history", { esRSC: true, modo: "navigate" }), ORIGEN)).toBe(
      "ignorar"
    );
  });

  it("nada de otro origen", () => {
    // Los tiles del mapa son de un tercero y son muchos MB; el backend vive en otro
    // dominio y ni siquiera pasa por el navegador.
    expect(estrategiaPara(pedir("https://tile.openstreetmap.org/8/1/2.png"), ORIGEN)).toBe("ignorar");
    expect(estrategiaPara(pedir("https://api.flightlog.fdiaznem.com.ar/dashboard"), ORIGEN)).toBe("ignorar");

    /*
      El caso que de verdad prueba la comprobación de origen: **otro dominio con
      nuestra misma forma de ruta**. Sin la comprobación, los dos de arriba caerían
      igual en "ignorar" por no coincidir con ningún patrón, y la línea que separa
      orígenes podría borrarse sin que ningún test se entere.
    */
    expect(estrategiaPara(pedir("https://cualquier-cdn.com/_next/static/chunks/x.js"), ORIGEN)).toBe(
      "ignorar"
    );
    expect(estrategiaPara(pedir("https://cualquier-cdn.com/icono-192.png"), ORIGEN)).toBe("ignorar");
  });

  it("los datos aeronáuticos se guardan y se refrescan atrás", () => {
    // Son las cuatro rutas que leen los TSV del disco: no salen a internet y no
    // cambian entre enmiendas del AIP, que son cada 28 días.
    for (const ruta of [
      "/api/puntos?q=SADM",
      "/api/airports/search?q=SAD",
      "/api/airports/near?lat=-34&lon=-58",
      "/api/aerovias?punto=BCA",
    ]) {
      expect(estrategiaPara(pedir(ruta), ORIGEN)).toBe("datos");
    }
  });

  it("**la meteorología va por su propia puerta**, con corte duro", () => {
    /*
      Entró recién cuando la pantalla supo decir de cuándo es el dato (`frescura.ts`).
      Antes de eso, guardar un METAR era guardar algo que se renderizaba idéntico
      tuviera cinco minutos o cinco horas — el peor bug de esta app con otro disfraz.
    */
    for (const ruta of ["/api/weather?icao=SADM", "/api/notams?icao=SADM", "/api/winds-aloft?lat=-34&lon=-58"]) {
      expect(estrategiaPara(pedir(ruta), ORIGEN)).toBe("meteo");
    }
  });

  it("los topes de meteo, y el que no está no se guarda", () => {
    // Dos horas para el METAR: un ciclo entero. Doce para NOTAM y viento en altura,
    // que se mueven mucho más lento.
    expect(topeMeteo("/api/weather")).toBe(120);
    expect(topeMeteo("/api/notams")).toBe(720);
    expect(topeMeteo("/api/winds-aloft")).toBe(720);
    expect(topeMeteo("/api/puntos")).toBeNull();
  });

  it("**una respuesta sin fecha de captura no se sirve**", () => {
    /*
      No saber cuándo se trajo es no poder decir si sirve. La tentación es tratarla como
      buena "porque está ahí"; la regla de este proyecto es la contraria.
    */
    const ahora = new Date("2026-08-21T14:00:00Z");
    expect(capturaVigente(null, 120, ahora)).toBe(false);
    expect(capturaVigente("cualquier cosa", 120, ahora)).toBe(false);
  });

  it("el tope de captura mide desde que se trajo, no desde que se observó", () => {
    /*
      Son dos preguntas distintas y las dos importan: `frescura.ts` mide cuándo se
      **observó** —y decide si el dato puede opinar—; esto mide cuánto hace que lo
      **trajimos**. Un METAR de las 14:00Z traído a las 14:05 y el mismo traído a las
      19:00 no dicen lo mismo sobre el cielo de ahora.
    */
    const ahora = new Date("2026-08-21T14:00:00Z");
    expect(capturaVigente("2026-08-21T13:00:00Z", 120, ahora)).toBe(true);
    expect(capturaVigente("2026-08-21T12:00:00Z", 120, ahora)).toBe(true);
    expect(capturaVigente("2026-08-21T11:59:00Z", 120, ahora)).toBe(false);
  });

  it("lo que muta o es de sesión, nunca", () => {
    for (const ruta of ["/api/auth/logout", "/api/chat", "/api/export", "/api/share-card"]) {
      expect(estrategiaPara(pedir(ruta), ORIGEN)).toBe("ignorar");
    }
  });

  it("una URL que no se puede parsear no rompe nada", () => {
    /*
      El service worker ve **todo** lo que pide la pestaña, incluidos esquemas de
      extensiones del navegador y cosas que ni son URL. Tirar acá dejaría la app sin
      cargar, y por una excepción en un pedido que ni siquiera era nuestro.

      Se arma el pedido a mano y no con `pedir`, que antepone el origen: con el
      prefijo puesto, `new URL` no llega nunca a fallar y este test no probaba nada.
    */
    const crudo = (url: string): Pedido => ({ metodo: "GET", url, modo: "no-cors", esRSC: false });
    expect(estrategiaPara(crudo("no-es-una-url"), ORIGEN)).toBe("ignorar");
    expect(estrategiaPara(crudo(""), ORIGEN)).toBe("ignorar");
    expect(estrategiaPara(crudo("chrome-extension://abc/x.js"), ORIGEN)).toBe("ignorar");
  });
});

describe("claveDeLoServido", () => {
  /*
    Existe para separar "qué le serví a esta navegación" de la entrada general de la
    página, que un pedido de fondo puede reescribir después de haber respondido. El
    único contrato real es que **no coincida jamás** con la clave de la página que
    describe, para que un `cache.match` no confunda una cosa con la otra.
  */
  it("no es la misma clave que la página que describe", () => {
    expect(claveDeLoServido("/dashboard")).not.toBe("/dashboard");
  });

  it("dos rutas distintas no comparten clave", () => {
    expect(claveDeLoServido("/dashboard")).not.toBe(claveDeLoServido("/dashboard/history"));
  });

  it("es estable: la misma ruta siempre da la misma clave", () => {
    expect(claveDeLoServido("/dashboard/history")).toBe(claveDeLoServido("/dashboard/history"));
  });

  it("la raíz también tiene una clave propia, no una cadena vacía", () => {
    // Una clave vacía se confundiría con "no hay marca" en el lado que lee.
    expect(claveDeLoServido("/")).toBeTruthy();
    expect(claveDeLoServido("/")).not.toBe("/");
  });
});
