# Fuentes de la tarjeta compartible

Dos archivos, vendorizados a propósito.

`next/font/google` descarga las tipografías en tiempo de build y **no deja nada en
disco que satori pueda leer**: `ImageResponse` necesita los bytes de la fuente como
`ArrayBuffer`, no una regla `@font-face`. Lo único que trae `@vercel/og` adentro de
Next es `Geist-Regular.ttf`, una tipografía que esta app no usa en ningún lado.

Sin esto la tarjeta se genera igual, pero en una tipografía ajena — o sea, deja de
parecerse a Vector, que es el punto de la tarjeta.

| Archivo | Para qué |
|---|---|
| `Nunito-ExtraBold.ttf` | El número grande y el logotipo. Es la `--font-display` de la app. |
| `IBMPlexMono-SemiBold.ttf` | Todo lo que se lee como **medición**, y las etiquetas. |

IBM Plex Mono no es decorativa: se eligió por el cero barrado, y `src/app/layout.tsx`
explica por qué — *"en un libro de vuelo la diferencia entre 0 y O no es un detalle
estilístico"*. Una tarjeta con las horas en la sans pierde la identidad del producto.

Bajadas de Google Fonts (`fonts.gstatic.com`), las dos bajo **SIL Open Font License
1.1** — ver `OFL.txt`. Vendorizarlas es lo mismo que ya hace el repo con
`src/data/airports.tsv`: no depender de la red ni en build ni en runtime.

Los bytes nunca llegan al navegador: son entrada del render en el servidor.

**Si falta un archivo de acá, `tsc` y `npm run build` pasan igual y la ruta tira 500
recién cuando alguien pide la imagen.** Por eso `/api/share-card` está en el smoke.
