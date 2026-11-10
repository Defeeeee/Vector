# Reel "De la carta al CAD." — storyboard

1440×2560 (9:16) · 30 fps · 30 s · con música propia (`musica.mjs`), 120 BPM: cada corte cae en un pulso.
Plus Jakarta Sans ExtraBold (títulos) e IBM Plex Mono (datos y rótulos), las de la app.
Negro `#111111` con resplandor celeste, blanco, cian `#38bdf8` de acento y azul `#2563eb`.
Una línea cian fina arriba avanza durante todo el reel.

La idea: no una lista de novedades, sino **todo el vuelo** —antes, durante y después— en una app
hecha para volar en Argentina. Después, en un montaje, por qué Vector.

**Versión 2:** más lenta para que se lea. Cada texto queda al menos 1,2–1,5 s en pantalla; el mapa
lleva dos titulares en vez de tres, el copiloto una sola frase, y el montaje tres golpes de 1,5 s
(sale "Sin señal").

| Tiempo | Plano | Texto en pantalla | Salida |
|---|---|---|---|
| 0,0–1,0 | El compás entra girando con estela y se clava; un anillo cian se expande. `VECTOR` se tipea abajo. | `VECTOR` | Zoom de golpe al centro del compás |
| 1,0–3,5 | Título cinético, cada palabra cae con un golpe de cámara. La carta se mueve de fondo. | **De la** / **carta** / **al CAD.** (cian) · `HECHO PARA VOLAR EN ARGENTINA` | Barrido a la derecha |
| 3,5–7,5 | **ANTES.** Cruza la palabra gigante. Sobre la carta se dibujan, con la geometría real del Mapa (`carta.js`, de `/api/mapa`), la TMA Baires, las CTR de Aeroparque y Ezeiza, las ATZ (San Fernando, El Palomar, Morón, Mariano Moreno), los corredores VFR y la ruta SADF → SADM. | `01 · ANTES` / **Espacios aéreos del AIP y corredores VFR.** → **Tu ruta, sobre la carta.** | Barrido hacia arriba |
| 7,5–9,5 | Las casillas del plan de vuelo vuelan a su lugar; cae el sello. | **Plan de vuelo,** / **listo para EANA.** · sello `ENVIADO ✓` · *A la oficina ARO, desde Vector.* | Barrido a la derecha |
| 9,5–14,5 | **DURANTE.** El avión avanza sobre la ruta y sube la hoja: próximo SADM, la distancia baja, rumbo 201°M. "Hablás con" gira como un tablero al entrar en cada ATZ, como lo calcula el Mapa: Fernando Torre 119.00 → El Palomar Torre 120.30 (5,1 NM) → Morón Torre 118.50 (11,0 NM). | `02 · DURANTE` / **Próximo punto.** → **Y con quién hablás.** | Barrido a la derecha |
| 14,5–16,5 | **DESPUÉS.** Tocás "Ahora" y la hora se llena; el tiempo de vuelo sube a 1,2 h; Guardar late. | `03 · DESPUÉS` / **Registrá** / **en segundos.** | Corte |
| 16,5–19,0 | Los vuelos se deslizan a la caja del CAD; el contador ámbar baja de 59 a 0 y se pone verde. | **Al CAD de ANAC.** / *Vector nunca ve tu contraseña.* | Zoom de golpe |
| 19,0–21,5 | La barra del copiloto: se tipea la pregunta, "Leyendo tu bitácora…" y la respuesta sale de a pedazos. | **Preguntale.** / **Al instante.** · *Te quedan 6,5 h de tu pack de 10 h.* | Destello |
| 21,5–26,0 | Montaje, 1,5 s cada uno, a fondo lleno, con `POR QUÉ VECTOR`: | **AIP OFICIAL** *Espacios aéreos validados contra el PDF.* · **RAAC 61** *¿Puedo volar hoy? Según la norma.* · **FORMATO ANAC** *Tu libro en PDF, listo para firmar.* | Barrido a la derecha |
| 26,0–28,0 | Cae un teléfono con la app instalada ("Hola, Lucía", la tarjeta verde). | **Instalala.** / *Pantalla completa, como una app.* | Zoom de golpe |
| 28,0–30,0 | El logo y "Vector" se arman. | **De la carta al CAD.** · `vector.fdiaznem.com.ar` | Fundido a negro |

Datos de ejemplo: los del backend de prueba (Lucía, el pack de 10 h, los 59 vuelos sin pasar al
CAD) y las frecuencias de la AD 2.18 del AIP que muestra el Mapa (Fernando Torre 119.00, El
Palomar Torre 120.30, Morón Torre 118.50). Nada sale de cuentas reales.

## Cómo se arma

- `reel.html`: Canvas 2D, `dibujar(t)` determinística. `carta.js`: la geometría real del Mapa.
- `render.mjs`: Chromium headless por CDP → PNG por pipe → ffmpeg (H.264, CRF 27, `-preset slow`,
  `yuv420p`, `+faststart`). `node render.mjs video video.mp4`.
- `musica.mjs`: la música, sintetizada (bombo, palmas, hats, bajo, pads Am–F–C–G, arpegios, golpes y
  barridos en cada corte). `node musica.mjs musica.wav`.
- El final: `ffmpeg -i video.mp4 -i musica.wav -c:v copy -c:a aac -b:a 128k -movflags +faststart vector-reel.mp4`.
