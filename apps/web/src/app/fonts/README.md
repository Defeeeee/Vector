# Las tipografías de la app

Vendorizadas desde la 3.3.1 (2026-11-03), para que el build no dependa de bajarlas de Google:
`next/font/google` lo hace en cada build y ese pedido cortó tres builds en un día.

| Archivo | Qué | De dónde |
|---|---|---|
| `nunito-latin-wght-normal.woff2` | Nunito variable (200–1000): el texto y los títulos | `@fontsource-variable/nunito` 5.3.0 |
| `ibm-plex-mono-latin-{400,500,600,700}-normal.woff2` | IBM Plex Mono: horas, códigos, matrículas | `@fontsource/ibm-plex-mono` 5.3.0 |

Las dos son SIL Open Font License 1.1 (`OFL-*.txt`). Sólo el subconjunto latino, que trae las
tildes, la ñ y los signos de apertura. Las de la tarjeta compartible (`.ttf`, para satori) están
aparte, en `src/app/api/share-card/fonts/`.
