/*
  La versión de la app viene de `package.json` y de ningún otro lado.

  Antes estaba escrita a mano adentro de `ChangelogNotice.tsx`, o sea dos fuentes de
  verdad que sólo coincidían por disciplina — y no coincidían: el componente anunciaba
  las novedades de la 2.7.0 mientras se habían publicado diez features más.

  Esto expone la versión **realmente construida**. `src/lib/changelog.ts` tiene la suya,
  y un test obliga a que sean la misma: si alguien sube `package.json` sin escribir las
  novedades, CI lo frena en vez de dejar la app mintiendo en silencio.
*/
const path = require("node:path");
const { version } = require("./package.json");

/*
  La raíz del monorepo, dos carpetas arriba. Sin esto Turbopack toma `apps/web` como
  raíz y no resuelve nada de afuera: `lib/extension-cad.ts` lee la versión de
  `apps/extension/manifest.json`. El tracing usa la misma, como pide Next.
*/
const RAIZ_MONOREPO = path.join(__dirname, "..", "..");

module.exports = {
  turbopack: { root: RAIZ_MONOREPO },
  outputFileTracingRoot: RAIZ_MONOREPO,
  allowedDevOrigins: ["100.78.13.108"],
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },

  /*
    El service worker **no se cachea**, y esto no es una optimización al revés.

    El navegador puede servir un `sw.js` desde su propio cache HTTP hasta 24 h. Si eso
    pasa, un service worker roto se queda dando vueltas un día entero después de que
    el arreglo ya está desplegado — y como el que decide si se busca la versión nueva
    es el service worker viejo, un deploy no lo saca. Es el riesgo estructural de toda
    esta feature.

    La otra mitad de la mitigación es `updateViaCache: "none"` al registrarlo, en
    `ServiceWorkerVector.tsx`. Hacen falta las dos: ésta cubre el pedido del archivo,
    aquélla cubre los chequeos de actualización.

    `Service-Worker-Allowed` deja explícito el alcance de origen entero, para que el
    día que el archivo se sirva desde otra ruta el alcance no se achique en silencio.
  */
  /*
    Las pantallas que se fueron o se mudaron en la simplificación de la 3.12.0: los links
    viejos (marcadores, mails, novedades) siguen llegando. `permanent: false` por si alguna
    vuelve. La query se conserva sola (`?ruta=` del Planificador, `?q=` de Buscar).
  */
  async redirects() {
    return [
      { source: "/dashboard/calendario", destination: "/dashboard/history", permanent: false },
      { source: "/dashboard/audit", destination: "/dashboard/history/auditoria", permanent: false },
      { source: "/dashboard/clima", destination: "/dashboard/airports", permanent: false },
      { source: "/dashboard/planificador", destination: "/dashboard/mapa/planilla", permanent: false },
    ];
  },

  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};
