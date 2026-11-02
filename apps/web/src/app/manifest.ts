import type { MetadataRoute } from "next";

/**
 * El manifest de la PWA: lo que convierte a Vector en algo instalable.
 *
 * Va como `.ts` y no como un `public/manifest.json` suelto por la misma razón que
 * `next.config.js` lee la versión de `package.json`: **una sola fuente de verdad**.
 * Acá eso significa el tipo `MetadataRoute.Manifest`, que hace que un campo mal
 * escrito no compile en vez de descubrirse cuando el teléfono se niega a instalar.
 *
 * ## `start_url` va a `/dashboard`, y no a `/`
 *
 * Es la decisión menos obvia del archivo y la que más rompe si se equivoca.
 *
 * `/` está en el matcher de `src/proxy.ts` y **es un redirect condicional**: con
 * sesión manda a `/dashboard`, sin sesión muestra el landing. Sin red ese redirect
 * no ocurre —el proxy corre en el servidor— así que una PWA que arranque en `/`
 * abriría en una página que nunca se cacheó y que además no es la que el piloto
 * quiere ver.
 *
 * Apuntando directo al dashboard, el arranque sin señal cae en una pantalla que sí
 * está en el cache.
 *
 * ## Por qué no hay `theme_color` acá
 *
 * Porque el manifest sólo admite **uno**, y esta app tiene dos: fondo blanco en
 * claro y negro en oscuro. Un color fijo pinta la barra de estado del color
 * equivocado la mitad del tiempo. El `viewport` de `layout.tsx` sí puede declarar
 * los dos con `prefers-color-scheme`, así que el color vive allá.
 *
 * `background_color` sí queda: es el color de la pantalla de arranque, se ve por
 * un instante antes del primer render, y ahí el blanco es el menos malo de los dos
 * —un flash blanco es más tolerable que uno negro si después viene el modo claro,
 * que es el que arranca por defecto.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vector — Libro de vuelo",
    short_name: "Vector",
    description:
      "El libro de vuelo y el planificador de navegación, con lo esencial disponible sin señal.",
    lang: "es-AR",
    dir: "ltr",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#ffffff",
    categories: ["productivity", "travel", "utilities"],
    icons: [
      { src: "/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      /*
        El `maskable` es un archivo aparte y no el mismo con otro `purpose`: Android
        recorta con la forma del launcher y puede comerse hasta el 20% de cada borde.
        Ver `scripts/build-iconos.mjs`, que lo genera con la marca al 60% del lienzo.
      */
      { src: "/icono-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
