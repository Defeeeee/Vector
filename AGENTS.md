# AGENTS.md — Vector

Lo que un agente necesita saber **antes** de tocar este repo, en una lectura. La historia
de cada decisión está en la bitácora (`docs/bitacora/`); acá queda lo vigente.

> Hasta el 2026-09-22 este archivo era la bitácora completa: 6.178 líneas, 343 KB, y su
> propio proceso obligaba a leerlo entero. Se partió por mes en `docs/bitacora/`, sin
> editar una sola entrada. Si un comentario del código dice "ver la entrada X en
> AGENTS.md", la entrada está ahí: `grep -n "^##" docs/bitacora/*.md`.
>
> Hasta el 2026-11-02 la web y la API eran dos repos, `Vector-FrontEnd` y
> `FlightLog-BackEnd`. Se unieron en éste con la historia de los dos: los hashes viejos
> siguen valiendo (`git show 1f6a318`). La bitácora del backend está en
> `docs/bitacora/api/`.

## Qué es Vector

Bitácora digital para pilotos argentinos: formato ANAC, desglose de horas, vencimientos
y "¿puedo volar hoy?" según la RAAC 61. Desde la 2.19.0, además, una red de pilotos: @ y
perfil público, y desde la 2.20.0 publicaciones con fotos, aplausos y comentarios. Desde
la 2.21.0, el libro de vuelo en PDF con la hoja de siempre, y la red con bloqueos,
reportes, invitaciones y avisos push.
**El público es el alumno de escuela que va de
PPA a PCA**: no es dueño del avión, paga por hora o por pack, y abre la app para saber
si puede volar, cuánto le falta y cuánto le queda.

El repo es un monorepo:

| Carpeta | Qué |
|---|---|
| `apps/web/` | La web: Next.js 16 (App Router), React 19, Tailwind v4 (sin `tailwind.config.js`: el tema vive en `@theme` dentro de `src/app/globals.css`), Framer Motion, next-themes. |
| `apps/api/` | **El backend**: Python + Litestar + Supabase, con su `AGENTS.md` para lo propio. Todo cambio de modelo de datos se hace ahí, con su migración en `apps/api/migrations/`. La autenticación también sale de ahí (`NEXT_PUBLIC_AUTH_URL`). |
| `apps/extension/` | La extensión "Vector → CAD". La empaqueta el build de la web (`scripts/build-extension.mjs`). |
| `docs/` | La bitácora, la normativa citada en el código y los planes. Es de todo el repo. |
| `infra/` | Lo que corre fuera de las apps: el proxy a ANAC (`infra/proxy-anac/`). |

- Cada app tiene sus dependencias, su CI y su deploy (ver Deploy). No hay workspace de
  npm en la raíz: la web y la API no comparten código, se hablan por HTTP.
- **Uso real al 2026-09-22**, medido en la base: 6 cuentas y **una sola con vuelos** (la de
  Federico, el dueño). Ninguna alta desde el 2026-08-10. Antes de proponer algo "por
  escala", volvé a medir.

## Mapa del código

Las rutas son relativas a `apps/web/`; las de `docs/` y `apps/extension/`, a la raíz.

| Dónde | Qué |
|---|---|
| `src/app/dashboard/` | Las pantallas logueadas. El layout trae la barra, las pestañas de sección y los carteles de red. |
| `src/lib/secciones.ts` | Las **cinco secciones** de la barra y sus pestañas (ver abajo). |
| `src/app/u/[handle]/` | El perfil público, el link que se comparte: fuera del dashboard, se abre sin cuenta. Quien lo abre con sesión va a `/dashboard/pilotos/[handle]`, el mismo perfil adentro de la app. |
| `src/app/dashboard/admin/`, `src/lib/admin.ts` | El panel de administración: sólo para los ids de `ADMINS_RED` del backend y 404 para el resto. **Sin link ni novedad a propósito:** se llega por URL. |
| `src/lib/resumen-social.ts`, `src/lib/publicaciones-servidor.ts` | Lo que la red lee del backend, con lo que le agrega el server: las fechas ya escritas y el mapa del vuelo. |
| `src/app/page.tsx`, `src/app/guias/`, `src/components/publico/`, `src/lib/sitio.ts` | Lo público: la landing (Server Component, estática), las guías con sus fuentes, `robots.ts`, `sitemap.ts` y las imágenes para compartir. Una guía nueva se agrega en `GUIAS` y aparece en el sitemap, el índice y el pie. **Todo lo que promete la landing se verifica contra el código**; lo regulatorio de las guías, contra la norma (invariante 6). |
| `src/app/guias/examen-ppa/`, `src/lib/examen-ppa.ts`, `src/data/examen-ppa.json` | La práctica del examen teórico de PPA, pública: las 379 preguntas del banco de ANAC con respuesta (Res. 306/2014), 63 con su figura (`public/examen-ppa/`), por materia, con lo fallado guardado en el navegador. Cómo se armó y qué quedó afuera, en `docs/normativa/examen-ppa-anac.md` (scripts en `scripts/examen-ppa/`). **El banco es de 2014**: la reglamentación lleva un aviso de que manda la RAAC vigente. |
| `src/app/dashboard/mapa/`, `src/components/dashboard/mapa/`, `src/lib/mapa-ruta.ts`, `src/lib/espacios-aereos.ts`, `src/app/api/mapa/` | **El Mapa** (3.0.0): todo es mapa, con la tarjeta de la ruta flotando arriba a la izquierda (un portal sobre `body`, al lado de la barra). Se escribe la ruta (con aerovías, contra `/api/puntos`) o se tocan aeródromos, y se ven los tramos, los espacios aéreos que cruza y, a pedido, `BriefingRuta`. Con **Volar** (rehecho en la 3.16.0, `PantallaDeVuelo`), el mapa queda entre dos bandas de borde a borde —arriba el próximo punto y los instrumentos, abajo con quién hablás (la frecuencia entera, primero), "más" y Terminar— con botones al costado: **norte o nariz arriba** (`leaflet-rotate`, fijado en 0.2.8; el avión se centra en lo visible entre las bandas y, con la nariz arriba, más abajo), seguir, zoom y capas. Pide Wake Lock y **graba el track** en el teléfono (`lib/track-vuelo.ts`, `localStorage`, una estela violeta), que al terminar se baja en GPX o va a Registrar vuelo con ruta, fecha y avión (sin horarios). Es ayuda VFR y lo dice. **Sin señal** (3.15.0): el service worker guarda las teselas (`teselas` en `estrategiaPara`, `CACHE_TESELAS`, tope `MAX_TESELAS`): las de las cartas del AIP —"Guardar las cartas para volar sin señal" baja las de la ruta, `teselasDeRuta`— y las del mapa base de OSM **sólo las que ya se miraron** (su política no deja bajar en masa; van con `crossOrigin` para no guardar respuestas opacas). **La piernera en PDF** (3.15.0, `lib/piernera.ts`, `piernera-pdf.ts`): A5 en blanco y negro, en el navegador. **Los espacios aéreos salen del texto del AIP commiteado**: las CTR y ATZ de AD 2.17 (`build:aip`) y las TMA de ENR 2.1 (`build:espacios`, `src/data/aip/ENR-2.1.txt`); `espacios-aereos.ts` arma los polígonos y descarta lo que no valida (no cierra, arco fuera de radio, se cruza, no contiene su aeródromo). **Los divididos por nivel van por sector**: la ATZ San Fernando (techo 2500 y 1500 ft, cada sector con su texto) y la TMA Baires (piso 2500 FT cerca de Buenos Aires, FL 45 en el resto: el sector (I) se camina por los arcos de 25 NM de EZE, FDO y PTA de las observaciones de ENR 2.1, y el (II) es la TMA con el (I) como hueco, `huecos`). Al 2026-11-03: 63 dibujados y 16 descartados (radiales o límites de FIR sin coordenadas). **Con quién hablás** (3.1.0, `lib/firs.ts`): las cinco FIR de ENR 2.1, con su centro, sectores y frecuencias; los tramos "por el límite internacional" van por un rodeo afuera del país (no se dibujan) y los puntos "paralelo X y límite internacional" toman la longitud de la frontera de Natural Earth (`frontera-chile.tsv`, `build:frontera`). Cada aeródromo argentino cae en una sola FIR (test). La dependencia en un punto, de la más chica a la más grande según la altitud: torre de la CTR o ATZ (AD 2.18), control de la TMA (su fila de ENR 2.1) y, fuera de eso y debajo de FL 245, **clase G** (sin control; el centro y su sector, sólo como información de vuelo). En la salida y la llegada, la torre del aeródromo o, si es no controlado, su **canal de llamada**: el de MADHEL (normas particulares, `madhel-fichas.tsv`) o, si no publica, el de la lista de la zona que pasó Federico (`docs/fuentes/frecuencias-zona.pdf` → `frecuencias-zona.tsv`; no es del AIP y la pantalla lo dice; `frecuencias-zona.test.ts` fija que coincidan, salvo IRA). "Siguiendo el límite del TMA X" sigue el borde del vecino: ningún espacio pisa a otro del mismo tipo (test). El mapa no muestra helipuertos. **Corredores y sectores VFR de Baires** (3.2.0, `lib/corredores-vfr.ts`, `src/data/aip/ENR-3.3-BAIRES.txt` que guarda `build-espacios.mjs`): clase G dentro y fuera de la CTR (ENR 3.3, carta ENR 6.10); un corredor tiene 2500 m y 1.000 ft dentro de la CTR, 5000 m y 2.000 ft fuera (el Nº 2, 300 m al sur entre Benavídez y la CTR Aeroparque); en un corredor o sector sólo una ATZ controlada le gana. Sus puntos se escriben en la ruta (`BENAVIDEZ`, `DIQUELUJAN`), y si la ruta cruza una CTR con un corredor cerca, el Mapa lo sugiere. **Los de Córdoba** (3.15.0, `corredoresVfrCordoba`, `src/data/aip/ENR-3.3-CORDOBA.txt`, que también guarda `build-espacios.mjs`): los 11 de la TABLA-2, 2.000 m de ancho en la CTR y 2.500 m fuera, GND a 1.500 ft **AGL** (con la altura del GPS no se sabe si se está arriba: se miran de costado), información de APP/TWR Córdoba salvo el 9 y el 10 (TWR ESC, clase D con sus zonas restringidas activas). Los números se repiten con Baires: `zona` y `etiquetaCorredor`. Reemplazó a la sesión en vivo, que se sacó entera (web, WhatsApp y `/flight-helper` del backend); la tabla `flight_sessions` quedó sin uso. |
| `public/marca/`, `src/components/Marca.tsx`, `marketing/marca/` | **La marca** (3.10.0): la flecha de rumbo plegada en blanco y cian a 045° y "vector" en Plus Jakarta Sans ExtraBold, en curvas. Las piezas son SVG generados (`marketing/marca/generar.mjs`, con opentype.js) y el manual de marca está publicado como artifact; `Marca.tsx` se genera de los SVG y no se edita a mano. Los íconos de la app salen de ahí (`npm run build:iconos`). La landing va **de noche siempre** (un `dark` que envuelve la página). |
| `src/lib/cartas-aip.ts`, `src/lib/capas-mapa.ts`, `scripts/build-cartas.mjs`, `scripts/cartas/`, `src/data/cartas-aip.json`, `src/app/api/cartas/` | **Las cartas del AIP en el Mapa** (3.9.0): ENR 6 INF y SUP 1–3 y las VFR por debajo de las TMA Baires y Córdoba, la carta tal cual. Se georreferencian con su propia grilla (cada cruce de meridiano y paralelo rotulado es un punto de control) contra la Lambert que declaran; el ajuste va a `cartas-aip.json` y un test lo revisa. Las teselas (WebP, 50 MB) **no van al repo**: viven en el VPS, en `~/Vector/datos/cartas`. Para un ciclo AIRAC nuevo: bajar los PDF **desde un navegador**, `npm run build:cartas -- <PDFs> <salida>`, `rsync -a --delete <salida>/ ubuntu@oraclearm:Vector/datos/cartas/` y cambiar `AIRAC_CARTAS`. El menú de capas (`MenuCapas`) agrupa cartas, espacios aéreos, VFR y puntos; una capa nueva se agrega en `GRUPOS_CAPAS` y en `ORDEN_CAPAS` de `MapaLeaflet`. |
| `src/lib/libro-anac.ts`, `src/lib/libro-anac-pdf.ts`, `src/app/api/bitacora/libro-anac/` | El libro de vuelo en PDF: qué va en cada casillero y las hojas (puro, testeado), el dibujo con pdf-lib y la ruta. Fuentes en `docs/normativa/libro-de-vuelo-anac.md`. |
| `src/app/dashboard/plan-de-vuelo/`, `src/components/dashboard/plan-de-vuelo/`, `src/lib/formulario-plan.ts`, `src/lib/plan-de-vuelo.ts`, `src/lib/demora-plan.ts`, `src/lib/plan-de-vuelo-pdf.ts`, `src/lib/oficinas-aro.ts`, `src/actions/plan-de-vuelo.ts` | El plan de vuelo para EANA: los planes guardados (`/planes-de-vuelo` del backend, migración 024) y su editor. El formulario se revisa casilla por casilla (puro, testeado). El PDF es el **formulario de EANA** (`plan-de-vuelo-eana.jpg`, de un plan que EANA aceptó) y la demora el del Apéndice 4 de la ENR 1.10, armados con pdf-lib **en el navegador**. También están las 49 oficinas ARO/AIS de la AIC A 19/2026 y su horario de la AIP AD 2.3 (`npm run build:horarios-aro`), testeados contra su fuente. Fuentes en `docs/normativa/plan-de-vuelo-eana.md`. |
| `src/lib/cad.ts`, `src/lib/cad-servidor.ts`, `src/lib/enlace-cad.ts`, `src/cad/`, `src/app/dashboard/history/cad/`, `apps/extension/` | Pasar los vuelos al **CAD de ANAC** desde el navegador del piloto. El panel vive en Vector ("Pasar al CAD") y la pestaña del CAD sólo hace de puente: la extensión "Vector → CAD" (`apps/extension/`, empaquetada por `scripts/build-extension.mjs` en `public/cad/vector-cad.zip`; sin permisos) o el marcador (`src/cad/enlace.ts`, compilado por `scripts/build-puente.mjs` a `public/cad/puente.js`) hacen, con la sesión del piloto, las lecturas de una lista blanca y "Crear" (`src/cad/enlace-comun.ts`). **Vector nunca ve la contraseña de ANAC.** La traducción (horas, finalidad, aeródromos, discriminación) es pura y testeada. `flights.cad_vuelo_id` (migración 029) marca los pasados. Para probar: `marketing/recursos/cad-falso.mjs`. |
| `src/lib/mail-plantilla.ts`, `src/lib/mail-envio.ts`, `src/lib/mail-seguimiento.ts`, `src/app/api/mail/`, `src/app/api/cron/` | Los mails: la plantilla con la estética de la landing, el envío **con seguimiento propio** (aperturas y clics, firmados) y los barridos que los mandan. Las imágenes viven en `public/hotlink-ok/correo/` (Cloudflare bloquea el hotlinking fuera de esa carpeta). Todo mail sale por `enviarConSeguimiento`; las métricas se ven en el panel de administración. **La excepción es el plan de vuelo** (`lib/plan-de-vuelo-mail.ts`): va a una oficina del Estado, sin imagen de apertura ni links medidos. |
| `src/app/q/[codigo]/`, `src/lib/pegatinas.ts`, `src/lib/pegatinas-hoja.ts`, `src/app/dashboard/admin/pegatinas/` | Las pegatinas con QR (migración 033 del backend): todas iguales, cada una con su código. **El admin las asigna escaneándolas** en el lugar, y sus escaneos no cuentan. Un visitante se lleva la cookie `vector_qr`, y si se registra dentro de los 30 días la cuenta queda con `origen_qr` (`AnotarOrigenQr`, desde el navegador). Para mandar a hacer, el panel baja un PNG por código en un ZIP (`lib/pegatina-png.tsx`, satori, 600 dpi, fondo transparente; `lib/zip.ts`): en la imprenta, sticker de 8 cm "sin fondo". También hay una hoja A4 para imprimir en casa. La del avión (`/avion/<matrícula>`) está diseñada en `marketing/pegatinas.html` y todavía no existe. |
| `src/data/raac/`, `scripts/build-raac.mjs`, `src/lib/raac.ts`, `src/lib/raac-copiloto.ts` | "Preguntale a la RAAC" (2.31.0; la 91 desde la 3.8.0): el texto de la RAAC 61 (VI edición con la Enmienda I, Res. ANAC 292/2026) y la RAAC 91 (IV edición, Res. ANAC 311/2026), las dos de mayo de 2026, partido por sección, capítulo o subparte y apéndice, buscado con BM25 y sinónimos de piloto. Los dos copilotos (web y WhatsApp) tienen la herramienta `consultar_raac` y contestan **sólo** con ese texto, citando la sección; si no está, lo dicen. Los PDF salen de la planilla "RAAC Vigentes" de argentina.gob.ar (links a `docs.anac.gob.ar`): **se bajan desde un navegador** y se pasan con `npm run build:raac -- 91 <pdf>`. Al rearmar, compará sección por sección contra la versión anterior y revisá lo que cita el código (`docs/normativa/raac-61-secciones-citadas.md`). |
| `src/lib/` | Lógica pura, **con sus tests al lado** (`*.test.ts`). Es lo único testeable: vitest corre en `environment: "node"`, sin DOM. |
| `src/actions/` | Server actions. Escriben contra el backend y revalidan las pantallas afectadas. |
| `src/lib/api.ts` | `apiFetch`: único camino al backend, con el token de la cookie. Cachea los GET 20 s. |
| `src/proxy.ts` | Protege `/dashboard` y renueva la sesión (el JWT de Supabase dura una hora). La sesión vence a los **2 días sin uso** (`DURACION_SESION_S`, `lib/sesion.ts`); sin sesión se va a `/login`, y con `?expirada=1` si en ese navegador hubo una (`vector_hubo_sesion`, que sólo borra "Cerrar sesión"). |
| `src/data/` | Aeródromos, pistas, AIP, aerovías, fixes y radioayudas en TSV **commiteados**: la app no depende de red en build ni en runtime. Se regeneran con `npm run build:*`. **Lo del AIP se actualiza solo** (`.github/workflows/aip.yml`, los martes): commitea en `main` si los tests pasan, abre un PR si no, y avisa por ntfy. |
| `src/sw/sw.ts` | El service worker (PWA). Lo compila `scripts/build-sw.mjs` después de `next build`. |
| `docs/normativa/` | Las secciones de la RAAC 61 que cita el código, las fuentes del libro de vuelo (RAAC 61.120 y Res. ANAC 470/2025) y las del plan de vuelo (AIP ENR 1.10 y AIC A 19/2026). **La VI edición de la RAAC 61 (enero 2026) renumeró**: el libro de vuelo ya no es la 61.51. |
| `docs/brief/` | Los planes 01–11, tal como se escribieron. Son historia, no backlog: verificá contra el código antes de dar algo de ahí por pendiente. |

### La navegación

Cuatro secciones desde la 3.12.0: **Inicio, Bitácora, Preparar vuelo, Pilotos**. Las
pantallas que no son sección son pestañas:

- Bitácora = Vuelos · Resumen · Gastos (`/dashboard/balance`). La Auditoría
  (`/dashboard/history/auditoria`) cuelga de Vuelos y avisa arriba de la lista (`AvisoAuditoria`).
- Preparar vuelo = Mapa · Plan de vuelo · Aeródromos · Herramientas. La planilla de navegación
  (el viejo Planificador, `/dashboard/mapa/planilla`, con viento y para imprimir) cuelga del Mapa.
  Desde la 3.13.0 la tarjeta de la ruta del Mapa tiene el avión (TAS y consumo), el tiempo por tramo,
  el combustible, "Armar el plan de vuelo" y las rutas guardadas (`RutaAcciones`, `/rutas` del
  backend, migración 039). En la compu las pestañas de Preparar flotan sobre el mapa. El editor de un plan (`/dashboard/plan-de-vuelo/[id]`) cuelga de
  Plan de vuelo. El METAR y el TAF están en la ficha de Aeródromos.
- Pilotos = Red · Actividad. Buscar, Publicar y el perfil de un piloto
  (`/dashboard/pilotos/[handle]`) cuelgan de la Red.

**Se sacaron en la 3.12.0**, medido en la base (0 uso): el Calendario y los vuelos programados
y las métricas propias (tablas, API y barrido borrados en la 3.15.0, migración 040) y la pestaña
Clima. Las URLs viejas redirigen (`next.config.js`).

**Cinco es el techo**, porque es lo que entra en la píldora
del teléfono sin la hoja "Más", y un test lo fija. La pestaña activa es la de `href` más
específico (`pestanaActiva`): por prefijo, la Red se prendería junto con Buscar o
Actividad.

- Una pantalla nueva **se agrega en `SECCIONES`** y aparece sola en la barra y en las
  pestañas (`SeccionTabs`, en el layout). Si no es pestaña, va en `secciones.test.ts` con
  el motivo: en `CUELGAN_DE_UNA_PESTANA` si vive adentro de una sección, o en
  `FUERA_DE_LA_BARRA` si no. El test recorre `src/app/dashboard` y falla si una pantalla
  queda sin forma de llegar.
- El inicio contesta tres preguntas —¿puedo volar hoy?, ¿cuánto me falta?, ¿cuánto me
  queda?— y cierra con los últimos vuelos. **Lo que no conteste una de las tres va al
  Resumen**, no al inicio. Las excepciones las decidió Federico:
  - **arriba de todo, las horas totales con seis cifras** (`HorasDeCarrera`, con las
    piezas del Resumen en `Cifras.tsx`; 2026-10-10). El tracker de la PPA o la PCA
    baja, después del saldo;
  - la tarjeta chica "Tu red", al final y por `Suspense`, para que la red nunca demore
    lo de arriba;
  - "¿Ya volaste?" (`PlanesParaRegistrar`, 2026-10-20), también por `Suspense`: un plan
    de vuelo presentado cuya llegada estimada ya pasó, con "Registrar el vuelo" y "No lo
    volé".
- **El buscador** (⌘K, `BuscadorGlobal` en los dos encabezados, 2.29.0): pantallas y guías
  en el cliente (`lib/buscador.ts`; una pantalla nueva que no sea pestaña se agrega en
  `OTRAS`), vuelos y aeródromos en el server (`actions/buscador.ts`). Abre un vuelo con
  `/dashboard/history?ver=<id>` y un aeródromo con `/dashboard/airports?icao=`.
- **El copiloto de la web vive adentro del buscador** (2.38.0, Federico): no hay panel ni
  botón flotante. ⌘K ofrece siempre "Preguntale al copiloto", primero cuando no encuentra
  nada o lo escrito es una pregunta (`copilotoPrimero`), y el diálogo pasa a modo
  conversación (`ConversacionCopiloto`, contra `/api/chat`): la barra baja y el chat aparece
  arriba, con el mismo ancho y el borde de arriba fijo. La conversación dura lo que la pestaña.
  En el teléfono, el pie es la píldora de secciones más el + de Nuevo vuelo, en una fila.
- **`/api/chat` contesta de a pedazos** (2.39.0, NDJSON, `lib/copiloto-stream.ts`): estados
  ("Leyendo tu bitácora…", el de cada herramienta) y el texto mientras Gemini lo escribe
  (`sendMessageStream` de `chatConRespaldo`, que cambia de modelo sólo antes del primer
  pedazo). Lo que se muestra pasa por `parteSegura`: nunca medio ID. El "sí" a un vuelo
  propuesto se resuelve **antes** del modelo y escribe la propuesta tal cual, como en WhatsApp
  (`propuestaVigente`: sólo la del último mensaje); hasta la 2.39.0 la web no lo escribía.
- **Los filtros de Aeropuertos** (2.38.0, `lib/filtro-aerodromos.ts`, `/api/airports/filtrar`):
  distancia, pista, superficie, combustible, control, uso y provincia, en la URL. Una frase
  ("con 100LL a menos de 100 NM de San Fernando") la pasa Gemini a esos filtros
  (`/api/airports/frase`); **el aeródromo, las unidades y la búsqueda los resuelve el código**.
  El combustible sólo está para los 51 aeródromos del AIP y las pistas para 117: lo que no se
  sabe se cuenta como "sin dato" (invariante 2), nunca se descarta en silencio. Las pistas y el
  combustible del resto salen de `madhel-fichas.tsv`, que baja una vez por mes
  `.github/workflows/madhel.yml` (de a uno, cada 2 s, presentándose como Vector, y se corta
  solo si ANAC no contesta). **El AIP gana** sobre MADHEL donde están los dos.
- **El teléfono tiene su propio diseño** (3.4.0, Federico): distinto en el navegador y en la app
  instalada. La variante `app:` de Tailwind (`globals.css`) es `display-mode: standalone` **y menos
  de `lg`**: CSS puro, nunca JavaScript (invariante 1), y una PWA instalada en la compu sigue con el
  escritorio. **Desde la 3.14.0 el teléfono tiene la misma estética que la compu**: el inicio es
  `InicioEscritorio` en una columna, las pestañas son subrayadas en mono (también en la app), y abajo
  hay una barra de borde a borde con los nombres en mono y la sección activa en cian (en el navegador
  lleva el + cian al final). En el navegador: encabezado de 56 px (logo, buscador, cuenta). En la
  app: sin logo, título ("Hola, …" con la fecha en mono en el inicio, el nombre de la sección en el
  resto, `TituloTelefono`) y el + arriba. Escala del teléfono: títulos en Bold (no ExtraBold:
  "muy grande y gordo"), 34 px el del inicio, 26 px el de una página. Las medidas de la app son
  las del diseño (58 px arriba o la muesca, 8 px al contenido, 12 entre tarjetas): no a ojo. El
  "Cerrar sesión" del teléfono está en el Hangar. **Desde la 3.11.0 Vector es sólo oscuro**
  (`forcedTheme`): la escala `zinc` de Tailwind está redefinida en `.dark` con la paleta de la marca
  (`globals.css`), así que una pantalla nueva escribe sus `dark:` como siempre y toma el gris azulado
  sola; las superficies van en `bg-carbon` y el fondo en `bg-noche`. En el escritorio la barra
  lateral es azul noche (`cabina`) y se abre con los nombres al pasar el mouse o con
  `:focus-visible`, y el inicio es `InicioEscritorio` (sin bento). **Desde la 3.13.0 ninguna pantalla
  de la compu usa cajas** (Federico: sin bento): en `globals.css`, a partir de `lg` y adentro de
  `main`, las tarjetas grandes (`rounded-[2rem]`, `rounded-3xl`…) pierden fondo, borde y relleno, y
  los bloques se separan con la línea fina de arriba (`lg:border-t lg:border-white/10 lg:pt-9`);
  las cajas chicas (filas) quedan. `PageHeader` y `SeccionTabs` llevan el rótulo en mono con el
  punto cian, el título grande de la landing y las pestañas subrayadas; el botón principal es la
  píldora cian (`bg-aviation-cyan text-noche`). El ingreso, el alta y la contraseña usan
  `components/acceso/AuthShell` (el video del hero a la derecha). Una pantalla puede esconder la barra de
  abajo (`data-sin-barra-movil`) o el encabezado (`data-sin-encabezado-movil`): Registrar vuelo y
  el Mapa en vuelo. Lo que tenga que quedar `fixed` dentro de una página va en un portal sobre
  `body`: la página entra con `animate-in`, un `transform`. **La app instalada arranca con la marca**
  (3.16.0, `lib/arranque.ts`): el service worker contesta un arranque en frío con la marca sobre la
  noche y vuelve a pedir la página, y iOS tiene sus imágenes de arranque (`public/arranque/`, `npm run
  build:iconos`). No hay `loading.tsx` arriba del dashboard a propósito: volvería 200 los 404 que el
  smoke exige.
  **Los datos se actualizan solos** (3.7.0, `ActualizarDatos` en el layout): `router.refresh()` al
  volver a la app tras un minuto o más (`VOLVER_TRAS_MS`), cada 5 minutos a la vista y al volver la
  red; y en la app instalada, **tirar hacia abajo para actualizar** (no sobre el mapa ni en un
  campo; `data-sin-tirar` para excluir otra cosa). El círculo se va cuando cambia `servido`, la hora
  en que el server dibujó el layout. **Una versión nueva de la app se aplica sola, sin cartel**
  (3.13.0, `comoActualizar` en `lib/pwa.ts`, `ServiceWorkerVector`): al abrir o al volver a la app,
  ya; usándola, en el próximo cambio de pantalla (un link pasa a ser una navegación entera); en las
  pantallas donde se escribe (`actualizarSinPreguntar`), al salir, con una franja de borde a borde
  que lo avisa. Si un cambio rompe a las pestañas viejas, se sube `VERSION_MINIMA` (`lib/pwa.ts`):
  la app más vieja lo lee de `/api/version` y se actualiza sin opción.
  **Las demás pantallas** no tienen diseño propio en el teléfono: las alcanzan reglas de
  `globals.css` que sólo valen debajo de `lg` y adentro de `main` (3.14.0: las tarjetas grandes sin
  caja, separadas por una línea fina arriba, los títulos en Bold) y `PageHeader` (26 px, sin el
  rótulo de arriba; `esLaSeccion` lo esconde en la app cuando repite el encabezado). En oscuro, el
  azul viejo (`aviation-blue`) es el cian de la marca y lo activo que era una píldora blanca
  (`dark:bg-white dark:text-zinc-900`) también pasa a cian, todo desde `globals.css`. Una pantalla nueva las
  toma sola; si algo se rompe en 390 px (una tabla, una grilla), se arregla en esa pantalla.
- **Registrar vuelo es una sola página** (`/dashboard/log-flight`). Hubo un modal
  interceptado (`@modal/(.)log-flight`) que se llevó cinco commits de arreglos en un
  mes; se sacó en la 2.18.0. No volver a interceptar esa ruta.

## Invariantes — lo que no se rompe

1. **Fechas y horas localizadas se formatean en el server, o no se formatean.** "Hoy"
   baja resuelto desde el server como `todayIso`. `toLocaleString` difiere entre Node y
   Chrome, y `new Date()` en un componente cliente hace que server y navegador discrepen
   de día: costó dos bugs de hidratación.
2. **"No sé" no es "no hay".** `/dashboard` nombra en `unavailable` las secciones que no
   pudo leer. Nunca se le dice "podés volar" o "no tenés CMA" a alguien cuyo dato no se
   pudo leer (`pilotStatus`, `documentosDisponibles`, `PrimerosPasos`).
3. **Un vuelo programado no es un vuelo.** `planned_flights` es una tabla aparte y
   **ninguna función de agregación la lee**: inflaría horas en un papel que se presenta
   ante ANAC, y `POST /flights` cobra el saldo.
4. **Un simulador es un renglón del libro, no un vuelo.** `soloVolados` lo saca de todo lo
   que mide vuelo. La excepción es el tracker de la PCA, que usa sus horas de
   instrumentos y hace su propio corte.
5. **Las horas de apertura** (`logbooks.opening_*`) suman a los totales pero no a
   promedios ni a la recencia: no tienen fecha.
6. **Lo regulatorio se escribe contra la RAAC, no de memoria**, citando la sección en el
   código (`docs/normativa/`). El plan 08 se escribió de memoria y tenía seis errores.
7. **La versión vive en `package.json`** y un test obliga a que `CHANGELOG[0]` de
   `src/lib/changelog.ts` sea la misma. Novedades = sólo lo que el piloto ve.
   `CHANGELOG.md` se genera con `npm run build:changelog`. La excepción: un parche que no
   se anuncia (Federico decide) va en `VERSIONES_SIN_NOVEDADES`, con su motivo. Sube sólo
   el último dígito y la tarjeta sigue mostrando `CHANGELOG[0]`.
8. **Después de escribir, revalidar cada pantalla que muestra ese dato** (`revalidatePath`).
   `apiFetch` cachea los GET 20 s: una pantalla que falte en la lista muestra el dato
   viejo. Y los `catch` de las acciones dejan pasar el `redirect` de Next con
   `esErrorDeRedirect`. La excepción son las publicaciones, los aplausos y los
   comentarios: esas pantallas se piden sin cache y la tarjeta es dueña de su estado, así
   que revalidar sólo volvería a dibujar el feed entero en cada aplauso (ver
   `actions/social.ts`).
9. **`API_URL` por defecto es `http://127.0.0.1:7477/api`, con `/api`**: el backend vive
   en el mismo VPS. Por el dominio público va **sin** `/api`, porque lo agrega el proxy
   (Traefik, `addPrefix` en `flightlog.fdiaznem.com.ar.yml`; ver Deploy). Esa asimetría
   cortó producción el 2026-08-27. En CI el smoke usa el dominio público.
10. **La tarjeta compartible saca los números de la sesión**, nunca del query string, y no
    acepta `user_id`: una tarjeta pública necesita un token firmado y su propio modelo
    de amenaza.
11. **Las cartas Jeppesen son contenido pago**: las sirve el backend sólo a perfiles con
    `jeppesen_access`. No se exponen a nadie más.
12. **Los datos del AIP se validan contra el PDF oficial** en los tests, en las dos
    direcciones. Un número que no aparece en la fuente no entra.
13. **Los números de un plan salen de la base, no de la bitácora.** Una entrada dijo "2000
    vuelos" cuando había 45, y casi se diseñó paginación de servidor sobre eso.
14. **De la red social sale sólo lo que el piloto eligió.** Del perfil, cinco números de
    horas agregadas; de la bitácora, **nada solo**: una publicación lleva un vuelo sólo si
    el piloto lo adjunta, y de ese vuelo sólo los datos que prendió (ruta como origen y
    destino, duración, tipo de avión, fecha y, desde la 2.37.0, la forma del recorrido ADS-B,
    **sin horas**: `recorrido_publicable` del backend). Es una copia (`resumen_de_vuelo` del
    backend) y **nunca lleva la matrícula**. Ninguna fila de `flights` ni ningún
    `user_id` cruza la API.
    - Una publicación la ve quien puede ver el perfil de su autor, y lo impone el RLS
      (migraciones 018 y 019 del backend), no esta app.
    - Las fotos se re-codifican en el backend sin EXIF (sin la ubicación GPS) y las de
      publicaciones se sirven con URLs firmadas. La foto de perfil es pública, como el @.
    - Si agregás un dato a lo que se publica, va en la política de privacidad y en el
      texto del Hangar y de `CrearHandleRapido`. Desde el 2026-09-24 **el @ es un paso
      obligatorio del alta** (Federico) y ahí arranca en **Privado**: el @, el nombre
      elegido y la licencia se ven siempre; las horas y lo publicado, según la visibilidad.
    - La vista previa (`opengraph-image`) pide **siempre como anónimo**: el link lo recibe
      cualquiera.
    - Los avisos push dicen quién y qué (te siguió, aplaudió, comentó), **nunca datos de
      la bitácora** (`services/avisos.py` del backend). Un bloqueo también lo impone el
      RLS (migración 021), y quien fue bloqueado ve un 404, como si el @ no existiera.
15. **Ninguna pantalla escribe al dibujarse.** El smoke recorre las pantallas contra la
    base de producción dando por hecho que mirar no cambia nada. Por eso la Actividad
    marca lo visto desde el navegador (`marcarActividadVista`), no en el render.

## Comandos

La web, desde `apps/web/` (los de la API están en `apps/api/AGENTS.md`):

```bash
npm run dev                # http://localhost:3000 (ojo: ver abajo contra qué base escribe)
npx tsc --noEmit           # mirá el código de salida: `| head && echo ok` miente
npm test                   # vitest, lógica pura
npm run build              # next build + service worker
npm run smoke              # después del build: levanta `next start` y recorre rutas
npm run build:changelog    # regenera CHANGELOG.md
```

- **En desarrollo, el server le pega a `API_URL`** (por defecto el backend local en
  `127.0.0.1:7477/api`), y ese backend usa **la base de producción**: lo que se cree
  desde `npm run dev` se escribe en los datos reales. Para probar pantallas sin riesgo,
  usá el backend falso de la sección siguiente.
- Si `tsc` se queja de un módulo en `.next/types` que ya no existe (una ruta borrada),
  es cache de build: `rm -rf .next`.
- El smoke entra al dashboard sólo con `SMOKE_EMAIL`/`SMOKE_PASSWORD`, **contra
  producción** y en modo lectura. En CI los tiene; sin ellos saltea esa tanda y pasa
  igual, así que un verde no prueba que haya entrado: buscá `--- con sesión ---` en la
  salida.

## Cómo verificar lo que está detrás de login

Sin credenciales, y sin tocar producción: un backend falso local y una cookie cualquiera.

- `src/proxy.ts` sólo exige que exista la cookie `session_token`; **no verifica la
  firma** (eso lo hace el backend). Un JWT con `exp` en el futuro y sin
  `refresh_token` alcanza para que el proxy deje pasar y no intente renovar.
- Levantá un servidor que conteste JSON bajo `/api/*` —`/profiles`, `/dashboard`,
  `/logbooks`, `/audit/summary`, `/planned-flights`, `/custom-stats`, `/aircraft`,
  `/flight-helper/session`… (la lista sale de `grep -rho 'apiFetch("[^"]*' src`)— y
  corré `API_URL=… NEXT_PUBLIC_API_URL=… NEXT_PUBLIC_AUTH_URL=… npx next dev` apuntando
  ahí. Las variables del entorno le ganan a `.env.local`.
- Así se verificaron la 2.18.0 y el recorrido "Completar → Registrar → guardar". Lo que
  esto **no** prueba es el backend real: los writes contra producción siguen siendo
  verificación a mano.
- Mirá siempre claro **y** oscuro, escritorio **y** teléfono. Con el panel del navegador
  oculto las transiciones CSS no avanzan: desactivalas antes de medir colores.

## Deploy

**Se despliega pusheando a `main`, y sólo si el CI pasa.** Cada app tiene su par de
workflows y sólo corren si el push toca su carpeta:

- **La web:** `web-ci.yml` corre `tsc`, tests, build y smoke con sesión; cuando termina
  en verde, `web-deploy.yml` (`workflow_run`) entra por SSH al VPS y, si hay al menos 2 GB
  libres, hace `git reset --hard` **al commit que aprobó el CI**, `npm ci`, aparta el build
  anterior a `.next-anterior`, construye desde cero y reinicia con
  `pm2 restart vector-frontend --update-env`. **Si falla el build o el health check, vuelve
  al commit anterior con su build guardado**, sin reconstruir: un corte de red al bajar las
  fuentes de Google rompió un build el 2026-11-03. Desde la 3.3.1 las tipografías están en el
  repo (`src/app/fonts/`, `next/font/local`): **no volver a `next/font/google`**, que las baja en
  cada build y ese mismo día cortó tres.
- **La API:** `api-ci.yml` (los `test_*.py`, el import y ruff) y `api-deploy.yml`, que
  reinicia `flightlog-7477` y `grabador-adsb`, con el mismo rollback.
- `secretos.yml` (gitleaks) corre sobre todo el repo, `aip.yml` los martes, `madhel.yml` el
  día 3 de cada mes y `notam.yml` cada 15 minutos, disparado por el crontab del VPS
  (`infra/cron/vector-notam.sh`): el `schedule:` de GitHub no la sostenía.

**En el VPS cada app tiene su propio clon** del monorepo, con sparse-checkout:
`~/Vector/web` (PM2 corre en `~/Vector/web/apps/web`) y `~/Vector/api` (en
`~/Vector/api/apps/api`, con su `venv`). Con un clon compartido, el `reset --hard` de un
deploy le cambiaría el código a la otra app corriendo. Los `.env` están en cada carpeta
de app, y las cartas Jeppesen en `~/Vector/charts-jeppesen` (`JEPPESEN_CHARTS_DIR`).
Los barridos del crontab (`~/bin/vector-*.sh`) leen el secreto de
`~/Vector/web/apps/web/.env`.

**ANAC bloquea las IPs de nuestros servidores**, por comportamiento y no por tipo de IP: el
VPS y DefeServer desde el 2026-10-28 (el CAD, con 1 login alcanzó), oraclex64 a los 45 min de
usarla como proxy (2026-11-02). Cambiar de IP no sirve y esquivar su protección se descartó.
Por eso **a ANAC le pregunta el navegador del piloto**, con su IP:
- la ficha de Aeropuertos y el briefing de la ruta usan `fichaDesdeElNavegador`
  (`lib/anac-navegador.ts`), que le pide MADHEL y los NOTAM a ANAC (CORS abierto, sin
  extensión) y los compone con `POST /api/notams` (`lib/ficha-anac.ts`);
- **se le pregunta lo menos posible** (`lib/anac-vigencia.ts`): MADHEL se reusa 24 h y los
  NOTAM 15 min, y la pantalla dice de cuándo son. ANAC también bloqueó la IP de la Mac de
  Federico después de un día de pruebas (en su mayoría con `curl`): **no probar contra ANAC
  con `curl` ni scripts**; que lo haga el navegador, o simularlo en la pestaña;
- **una pantalla nueva que necesite ANAC va por ahí**;
- **los NOTAM salen de la descarga del país** (2.40.0): `.github/workflows/notam.yml`, que el
  crontab del VPS dispara cada 15 min (`infra/cron/vector-notam.sh`; el VPS no le pide nada a ANAC), mira la "Última actualización" de ANAC y, si cambió, trae los NOTAM vigentes de todo
  el país en un pedido (`POST /notam/json` con el indicador vacío) al VPS
  (`~/Vector/datos/notams-anac.json`). `lib/notams-descargados.ts` los usa **mientras se hayan
  verificado hace menos de 45 min**; ahí un aeródromo sin NOTAM es "no hay" de verdad. Atrasada,
  se vuelve a preguntarle a ANAC (`fetchAnac` desde el servidor, el navegador en las
  pantallas). Si ANAC falla 4 veces seguidas, el workflow se apaga solo y avisa;
- **la ficha de MADHEL sale de la copia mensual** (2.40.1): `madhel.yml` deja la respuesta
  entera de cada aeródromo en el VPS (`~/Vector/datos/madhel-fichas.json`, **no en el repo**,
  que es público: trae teléfonos de aeródromos privados) y `lib/madhel-descargado.ts` la usa
  mientras tenga menos de 40 días. La misma corrida pone al día, en `madhel.tsv`, si cada
  aeródromo es público o privado, si es controlado y su estado (venían del 2026-08-04);
- **el AIP manda sobre MADHEL** en la ficha (`componerFicha`), campo por campo: está validado
  contra el PDF (invariante 12) y MADHEL mismo dice que vale el AIP;
- desde el servidor y desde los scripts del AIP se presenta como `Vector` (`USER_AGENT_VECTOR`,
  y `scripts/ua-vector.mjs`), **nunca imitando un navegador**. El proxy de oraclex64 (`infra/proxy-anac/`, `ANAC_PROXY`) quedó, pero bloqueado.

No copiar archivos ni reiniciar PM2 a mano. Para desplegar sin esperar al CI está el
botón de `workflow_dispatch` de cada deploy.

Hasta el 2026-09-22 el deploy corría en cada push sin mirar el CI, y así llegaron once
commits en rojo a producción. El health check pega a `/api/airports/search`, que lee los
TSV del disco y **nunca toca el backend**: un deploy verde no prueba que el dashboard
ande; el smoke del CI, sí.

**El proxy es Traefik, no nginx.** El tráfico entra por Cloudflare y lo atiende el
contenedor `main-traefik` (red del host, puertos 80 y 443), con una ruta por dominio en
`/home/ubuntu/traefik/dynamic/` del VPS: `vector.fdiaznem.com.ar.yml` manda a
`127.0.0.1:3010`. **nginx está apagado**: lo que queda en `/etc/nginx/sites-*` es de
antes y no sirve nada, así que tocarlo no cambia nada. Traefik no limita el tamaño del
cuerpo: un POST de 13 MB llega entero a Next (medido el 2026-09-23). El tope que
importa es el del backend (`request_max_body_size`, 30 MB).

## Estado y pendientes (al 2026-10-23)

- **Alumno piloto** (Federico, 2026-09-24; `lib/licencias.ts`):
  - no lleva libro de vuelo, así que no ve el PDF, el importador, "cerrar hoja", los
    libros en el Hangar, el número de licencia ni el legajo;
  - registra vuelos con un formulario simple (`VueloAlumnoForm`);
  - "¿Puedo volar hoy?" sale de su capítulo de la RAAC (61.060(b), 61.405, 61.410,
    61.415) y el tracker es el camino a la PPA (61.520(a), `lib/ppa-progress.ts`);
  - sus horas no cuentan una vez rendida la PPA: `profiles.fecha_ppa` (migración 022)
    se pide al pasar de Alumno a PPA. Sin fecha, cuentan todos los vuelos. Es una
    decisión de Federico sobre la práctica; la RAAC no la dice así (ver `licencias.ts`).
- **El alta es obligatoria y retomable** (Federico, 2026-09-24): tapa el dashboard hasta
  terminarla y vuelve al primer paso sin hacer (`GET /onboarding/estado`, `pasoDelAlta`):
  licencia y CMA, avión, @, tus horas.
  - **El último paso arranca con los totales** (2026-10-20, 2.26.1 sin anuncio): de 16 cuentas
    una sola había cargado vuelos.
    - El piloto copia la fila de totales de su libro de papel (`OpeningBalanceFields`, con
      los casilleros del papel, en `opening_*`).
    - El alumno carga sus horas con el desglose de la PPA (`lib/apertura-alumno.ts`,
    `logbooks.apertura_ppa`, migración 028), que el tracker reparte requisito por requisito
    y que dejan de contar al rendir la PPA. Se corrigen en el Hangar ("Tus horas de antes").
  Sólo el importador del PDF queda sin tapar. La cookie `vector_alta` con el id de la cuenta
  evita preguntar en cada pantalla. El recordatorio del día siguiente
  (`/api/cron/primer-vuelo`) corre desde el crontab del VPS a las 10:00 ART. Mandar el PDF
  del libro por WhatsApp es una idea de Federico para después.
- **El resumen del mes por mail** (2026-09-24): sale el día 1 con el mes anterior, a
  quien tenga al menos un vuelo (`/api/cron/resumen-mensual`, `lib/resumen-mensual.ts`).
  Usa los mismos cálculos del inicio, y la baja se hace con el link firmado del mail
  (`lib/baja-mail.ts`), sólo por POST.
- **Los mails se miden** (2026-10-02, migración 023 del backend): aperturas con una
  imagen de 1×1 y clics con una redirección firmada, en `/api/mail/a` y `/api/mail/c`.
  Son indicios, no certezas, y el panel lo dice. Está en la política de privacidad, y la
  baja es por tipo de mail (resumen del mes, novedades). El mail de novedades
  (`/api/cron/novedades?clave=…`) se manda a mano, no está en el crontab.
- **El píxel de Meta** (2026-10-06, `lib/pixel-meta.ts`): sólo con consentimiento, sólo en
  la portada y las guías, y en el registro recién después de enviarlo. Sin configuración
  automática ni seguimiento de la navegación. Se prende con `NEXT_PUBLIC_META_PIXEL_ID` en
  el `.env` del VPS (lo mete el build). Está en la política de privacidad, sección `#meta`.
- **SEO:** hay guías, sitemap y datos estructurados, y el dominio está verificado en
  Google Search Console (Federico, 2026-09-24). El sitio vive en un subdominio
  personal (`vector.fdiaznem.com.ar`): un dominio propio ayudaría. La landing no dice
  "gratis": el precio es decisión de Federico.
- **El plan de vuelo para EANA** (2026-10-10; guardado y editable desde el 2026-10-19):
  - **Qué es:** una pestaña de Preparar vuelo, con los planes guardados, duplicar, la ruta
    en texto libre, el perfil del avión en el Hangar (`aircraft.plan_vuelo`) y la firma
    guardada. La demora (DLA) se arma desde el mismo plan.
  - **La ruta es texto y se ve como nodos** (`EditorRuta`): los DCT son flechas con las
    millas del tramo; lo que el directorio no conoce queda "sin ubicar" y va igual en el
    plan. Palabras desconocidas seguidas son un lugar ("SECTOR ESCUELA").
  - **La salida se carga en UTC** (`dofUtc`, `eobtUtc`), como en el formulario; la hora
    argentina es sólo una ayuda. La hora es texto en 24 h, no `<input type="time">`.
  - **Sugerir, no llenar** (Federico, 2026-10-19): la duración y la autonomía se sugieren
    arriba del campo y se aplican con un toque. La duración sale de la ruta escrita y la
    TAS, o del planificador con el viento.
  - **Imitar lo aceptado:** las convenciones salen de planes que EANA le aceptó a Federico
    en FPL.AR. El mail que se abre usa su formato (`LVS100-SRDL(1815)SADM_171026`).
  - **El envío por mail desde Vector** (2026-10-20, `enviarPlan`): el PDF firmado va a la
    oficina con copia al piloto, y las respuestas van al piloto. Prendido con
    `PLAN_DE_VUELO_ENVIO_ARO=1` en el `.env` del VPS (Federico, después de recibir la prueba).
    Sale de `plandevuelo@vector.fdiaznem.com.ar` como "<nombre del piloto> vía Vector". El
    mail del piloto sale del token, después de que el backend lo aceptó. **La prueba al
    piloto** sigue en el server, pero la pantalla ya no la ofrece. Queda bajar el PDF y
    mandarlo a mano; "Compartir" se sacó (Federico, 2026-10-20).
  - **La demora (DLA) también sale por mail** (2.25.0, `enviarDemora`): el server recalcula
    la hora con las demoras guardadas y la anota recién después de que el mail salió. El
    selector de oficina sugiere las tres más cercanas a la salida (`oficinasCercanas`).
  - **La cancelación (CNL)** (2.26.0, `cancelarPlan`): formulario del Apéndice 5, con la
    salida vigente. Un plan cancelado no manda nada más.
  - **Del plan a la bitácora** (2.26.0, `lib/plan-cierre.ts`, migraciones 026 y 027):
    - el inicio pregunta "¿ya volaste?" después de la EOBT vigente más la casilla 16;
    - "Registrar el vuelo" precarga avión, ruta y fecha, **nunca horarios** (Federico: no
      coinciden con lo real), y al guardar une el plan al vuelo (`plan_vuelo_id`);
    - 90 minutos después de la llegada sale un mail, uno por plan
      (`/api/cron/plan-por-registrar`, cada 10 minutos desde el crontab del VPS);
    - no se pregunta si ese día ya hay un vuelo desde el mismo aeródromo.
  - **Meteo y NOTAM a la hora del vuelo** (2.26.0, `lib/meteo-plan.ts`): el TAF recortado a
    la salida y a la llegada, y los NOTAM de ANAC cruzados con su horario. Lo que no se
    entiende va como "revisá el horario"; los de otro horario, plegados, nunca escondidos.
  - **Las lecturas del plan van sin cache** (`plan-de-vuelo-servidor.ts`): con los 20 s de
    `apiFetch`, reabrir un plan traía una versión vieja y el guardado la escribía encima.
  - **Sin señal** (2.29.0, `lib/borrador-plan.ts`): el editor deja lo escrito en el teléfono y
    lo sube al volver la red; un borrador sólo le gana al servidor si es más nuevo. Se arma y se
    baja el PDF sin señal; mandarlo la necesita.
  - **LAD** (2.32.0, `lib/lad.ts`, `src/data/lad.tsv`): el selector busca los LAD de ANAC por
    número o nombre (`/api/airports/search?lad=1`; el resto de la app no los pide) y los muestra
    como `LAD2013`. Van con ZZZZ y `DEP/LAD2013 NOMBRE <coordenadas>`; la lista del CAD no trae
    coordenadas, así que se piden en el selector y la revisión avisa si faltan. **ZZZZ libre no se
    ofrece** (Federico, 2026-10-28: sólo AD y LAD). La lista se actualiza con el workflow del AIP.
  - Un vuelo desde un LAD se registra (Registrar vuelo busca LAD con `lad`) y pasa al CAD por su
    número: los LAD están en la lista AER del CAD con la misma clave (2.33.0).
  - **La modificación (CHG)** (3.16.0, `lib/cambio-plan.ts`, `enviarCambio`): formulario del
    Apéndice 3, el plan vigente arriba y en la casilla 22 "casilla/dato nuevo", que el piloto ve y
    corrige (el formato es del Doc 4444, que no está en el repo). Hasta 3 mandadas a la oficina
    (6.2); no cambia el plan guardado.
- **Pasar al CAD de ANAC y Traer a Vector** (2026-10-21, anunciado en la 2.27.0; Bitácora → Vuelos → "Pasar al CAD"):
  - **La extensión y el marcador son un puente, desde la 2.36.0** (Federico, 2026-10-29: "que te diga
    volvé a Vector"). El panel está en Vector (`PanelCad` con `fuenteEnlace`, `ConElCad`); la pestaña
    del CAD sólo contesta pedidos de una lista blanca (lecturas y "Crear", nunca la DDJJ:
    `src/cad/enlace-comun.ts`) y muestra "Volvé a Vector". La extensión pasa los pedidos por su service
    worker (`apps/extension/background.js`, sin permisos); el marcador abre Vector con `?enlace=1` y habla
    por `window.opener` (`src/cad/enlace.ts`, compilado a `public/cad/puente.js`, el archivo de los
    marcadores ya guardados). Del lado de Vector, `lib/enlace-cad.ts`. Al leer, Vector concilia con el
    backend (`POST /cad/conciliar`, sin ANAC) y anota `profiles.cad_leido_at` (migración 038): la
    Bitácora y el inicio dicen "Estado del CAD leído …" y piden actualizar pasados 3 días
    (`leidoDelCad`). El panel viejo adentro del CAD y su ventanita `/cad/conector` se borraron en la
    2.36.2, después de probar el puente contra el CAD real (Federico, 2026-10-29). Vector avisa si la extensión instalada es
    más vieja que `apps/extension/manifest.json` (`lib/extension-cad.ts`; antes de la 1.1.0 no es puente y sólo
    se ofrece bajar la nueva): **al cambiar algo de `apps/extension/`, subir su versión.** "Pasar al CAD" ofrece la extensión sólo en Chrome, Edge y Brave; en Safari y Firefox, el marcador; en el
    teléfono, que se haga desde la compu (`navegadorParaCad`, `SegunNavegador`; Federico, 2026-10-30). Se instala
    descomprimida: **no se publica en la Chrome Web Store** (Federico, 2026-11-01). El marcador en Safari
    anda contra el CAD real (Federico, 2026-11-01).
  - **En cada conexión, Vector revisa los vuelos que están en los dos lados** (3.6.0, Federico,
    2026-11-04; `diferenciasConElCad`, `anomaliasConElCad`, `paraLeerEnDetalle` en `lib/cad.ts`, y
    `revisarContraElCad` en `fuente-cad.ts`): horarios, matrícula, lugares y tiempo contra la lista
    que ya se lee, sin pedir nada más; aterrizajes, día y noche, finalidad, cargo y tipo contra el
    detalle (`Get?id=`), que se pide **una vez por vuelo** (de a dos, como mucho 12 por conexión) y
    otra sólo si el vuelo cambió de algún lado o pasaron 30 días: lo revisado se recuerda en el
    `localStorage` (`vector-cad-revisiones`). Lo que el CAD no trae no es una diferencia
    (invariante 2). El panel muestra "N vuelos no coinciden con el CAD" con lo que dice cada lado y
    "Corregir en Vector"; lo del CAD se corrige allá (Vector no edita en el CAD).
  - **"Desde Vector" está apagado** (2026-10-29, `CAD_DESDE_VECTOR` del backend, apagado por defecto):
    ANAC bloqueó cada IP desde la que entró el backend, la última con un solo login. Lo que sigue
    describe cómo era.
  - **Dos modos, desde la 2.33.0** (Federico, 2026-10-28): el marcador (más privado) o **desde Vector**:
    el piloto conecta su cuenta de ANAC y el backend entra al CAD por él (`/cad/*`,
    `services/cad_anac.py`, migración 036; `actions/cad-vector.ts`, `components/dashboard/cad/`).
    La contraseña va cifrada con `CAD_CLAVE_CIFRADO` (sólo en el `.env` del backend), nunca vuelve
    al frontend y **una rechazada no se reintenta** (bloquearía la cuenta de ANAC). Nunca se toca
    la DDJJ: el backend tiene una lista blanca de lecturas más "Crear". Con la cuenta conectada,
    Registrar vuelo ofrece "Cargarlo también en tu CAD" (`pasarVueloAlCad`). Está en la política de
    privacidad (`#cad`). Probado con la cuenta real de Federico (2026-10-28). **ANAC no acepta
    conexiones del VPS**: el backend sale por un proxy en DefeServer (`CAD_PROXY`, ver la bitácora
    del backend en `docs/bitacora/api/`; hasta el 2026-10-28 22:50 UTC fue amenaba, que ANAC también bloqueó); si DefeServer se
    apaga, este modo no anda y queda el marcador. **ANAC bloquea por horas la IP que
    entra varias veces** (el 2026-10-28 cayeron el VPS y después la casa de Federico, con 3 logins en
    media hora): el backend pide como un Chrome en el CAD, reusa la sesión hasta 8 h (en disco, cifrada:
    sobrevive a los deploys), guarda las listas 7 días y los vuelos 30 min, no hace más de 4 logins
    por hora entre todos y, si ANAC no conecta, no le pide nada por 45 min. Rotar IPs
    para esquivar el bloqueo se descartó.
  - **Se sincroniza solo** (2.34.0, migración 037): con la cuenta conectada, al abrir el dashboard y
    como mucho una vez por día (`SincronizarCad`, `POST /cad/sincronizar`), Vector anota el estado de cada
    vuelo (`flights.cad_estado`), desmarca lo borrado del CAD y marca lo cargado a mano (misma salida
    y matrícula, coincidencia única). **Nunca crea vuelos.** El inicio recuerda los pendientes de
    DDJJ (`PendientesDdjj`, excepción a las tres preguntas: aprobada por Federico).
  - **Simuladores** (2.33.0): tipo 3, cargo 6 (en instrucción) o 3 (instructor), discriminación 9 u
    8, día y noche en 0, y `simulador` con el de `GetSimuladoresListItem`, que se elige una vez por
    equipo y queda en `aircraft.cad_simulador` (con su clase FSTD). Desde la 3.15.0 "Traer a Vector"
    también trae las sesiones de simulador (`sesionDeSimuladorDesdeCad`): al equipo del Hangar con ese
    simulador del CAD (o al único simulador del Hangar), en la columna de instructor o de piloto en
    instrucción; en Vector se las reconoce por la salida, porque en el CAD no tienen matrícula.
  - **Cómo:** un marcador en la pestaña del CAD, con la sesión del piloto. Los vuelos quedan
    "Pendiente de DDJJ" y la declaración jurada la hace el piloto. Se descartó guardar la
    contraseña de ANAC en Vector.
  - **Qué se valida:** lo que el CAD rechazaría (día más noche distinto de la duración
    centesimal, sin horas, sin clase, piloto y copiloto mezclados, simulador) se marca
    "revisar" y no se manda. Lo que ya está (misma salida y matrícula) se anota sin repetir.
  - **La autoridad certificante y su nombre son de cada vuelo** (Federico, 2026-10-21). El
    panel propone la última usada para esa finalidad (`autoridadSugerida`, memoria en el
    `localStorage` del CAD) y no carga un vuelo al que le falte alguna de las dos. Con varios
    elegidos, "La misma autoridad para los N elegidos" (3.16.1, `AutoridadEnLote`,
    `asignarAutoridad`) la pisa en todos y la guarda en cada vuelo de Vector.
  - "Corregir" lleva a `/dashboard/history?editar=<id>`, que abre ese vuelo en edición.
  - **Probado contra el CAD real** (Federico, 2026-10-21): borró un vuelo en el CAD y lo
    volvió a cargar desde el panel. Las listas del CAD son públicas (sin sesión). Los
    aeródromos vienen como `SADF -  FDO -  FDO (SAN FERNANDO)` (clave: el designador ANAC) o
    ` MGI (…)`. El CAD no manda CSP ni COOP.
  - **El mismo vuelo con un día de diferencia** (mismo avión y hora) no se manda ni se trae:
    queda para revisar (`mismoVueloOtroDia`). Pasó con 4 vuelos reales de Federico.
  - **"Ignorar" y "Ya foliado"** sacan un vuelo de la lista (`flights.cad_omitido`, migración
    031), con "Deshacer".
  - **"Traer a Vector"** (del CAD a la bitácora, `TRAER_DEL_CAD`): lee `Get?id=` de cada
    vuelo, exige el avión en el Hangar y crea con `traido_del_cad` (migración 030: no cobra).
  - **La autoridad certificante se puede cargar en el vuelo** (opcional, migración 032,
    `cad_autoridad_id` y `cad_autoridad_nombre`): el formulario propone la última de la
    finalidad (`autoridadesPorFinalidad`), el panel la usa, y al cargar guarda la que se usó.
    La lista es `AUTORIDADES_CAD` (la del CAD del 2026-10-21); el panel la compara con la viva.
  - **La ventanita la abre un toque:** Chrome bloquea la que abre el script del marcador, y
    entonces el panel arranca con "Conectar con Vector".
- **Los recorridos ADS-B** (2.30.0; migraciones 034 y 035 del backend):
  - el proceso `grabador-adsb` del VPS graba en vivo, de adsb.fi, las posiciones de los aviones
    que están en algún Hangar, y las borra a los 30 días;
  - al abrir un vuelo (`RecorridoDelVuelo`), el backend busca el tramo de su avión entre su
    despegue y su aterrizaje cargados, y lo copia a `vuelo_recorridos`;
  - en Registrar vuelo, `SugerenciaAdsb` muestra lo que voló ese avión ese día. **Carga sólo
    los aterrizajes**: en el libro se anotan horas de tacómetro y ADS-B sólo ve el avión en el
    aire (Federico);
  - **nunca se muestra un recorrido que no se superponga con un vuelo cargado** (aviones de
    escuela);
  - adsb.fi es "para uso no comercial" y pide cita: si Vector cobra, hay que escribirles o
    tener un receptor propio;
  - **la imagen para compartir** (2.37.0, `/api/recorrido/[id]`, `lib/recorrido-imagen.ts`): satori
    con los tiles de OSM armados a mano (al doble, cache de una semana, atribución en la imagen),
    sin la matrícula, desde "Compartir la imagen" en la tarjeta del vuelo;
  - **el recorrido en la publicación** (2.37.0): el interruptor "Recorrido" del composer, apagado por
    defecto, aparece si el vuelo tiene recorrido (se pregunta al elegirlo, invariante 15). El backend
    publica sólo la forma (lat, lon, altura; sin horas ni velocidad) y `MiniMapaRutaInner` la dibuja.
- **El libro en PDF no es "oficial" y no se lo llama así.** Desde el 1/11/2025 cada vuelo
  se declara en el CAD de ANAC (Res. 470/2025); el PDF es el libro en papel que convive
  con eso, y lo anotado tiene que coincidir. Si ANAC aclara que los tiempos van en horas
  y minutos (el punto 5 dice "sexagesimal", el CAD muestra decimales), cambia
  `formatoLibro`.
- **Supabase está en `sa-east-1` (São Paulo)** desde el 2026-09-24, en el mismo lugar que
  el VPS: proyecto `jkmcdbihjqkgizekzlun` ("Vector SA"). Hasta ese día era
  `ssvzjrafixbycydhigwv` en `us-east-1` y quedó **pausado como respaldo**. El plan gratis
  admite dos proyectos activos, así que para restaurarlo hay que pausar otro. El viaje de
  red bajó de ~150 ms a ~1 ms, y una consulta REST de ~160 ms a ~75 ms; lo que queda es
  el procesamiento de Supabase, no la distancia. Sólo el backend habla con Supabase (su
  `.env`).
- **La simplificación de la 3.12.0** (Federico, 2026-11-05) sacó el calendario y las métricas
  propias; la 3.13.0 sumó al Mapa el plan de vuelo y las rutas guardadas, y el Hangar con un solo
  libro no ofrece agregar ni borrar (quien tiene varios los sigue viendo). Sin decidir: poner detrás
  de un permiso por perfil lo que excede al alumno (aerovías, HVI, Jeppesen).
- **La red social deja afuera, a propósito,** editar una publicación, redirigir un @ viejo
  y páginas de escuela o aeródromo. Además:
  - los reportes no tienen pantalla: se leen en la tabla `reportes` y llegan como aviso
    push a los `ADMINS_RED` del backend;
  - los avisos push necesitan las claves VAPID en el `.env` del backend; sin ellas no se
    ofrecen;
  - el login vuelve a la pantalla de antes cuando el proxy lo mandó ahí (`?volver=`, `volverSeguro`, 3.15.0); tras un 401 de una página, al inicio;
  - la búsqueda no tiene límite de pedidos, más allá de exigir sesión y un tope de 20
    resultados;
  - la exportación no incluye un comentario propio en una publicación que ya no podés
    ver (el RLS de `comentarios` sigue al de la publicación).

## La bitácora

Cada tanda coherente de cambios deja una entrada **al final del archivo del mes** en
`docs/bitacora/AAAA-MM.md` (si no existe, se crea), toque la web, la API o las dos: un
cambio que cruza las dos apps va en una sola entrada. La historia del backend hasta el
2026-11-02 está aparte, en `docs/bitacora/api/`. Es obligatorio, como cargar un vuelo en
el libro:

1. Antes de empezar, leé las entradas del mes y buscá con `grep` lo que toque tu cambio.
2. Escribila mientras trabajás, no al final: una sesión cortada deja trabajo huérfano.
3. Timestamp en UTC de verdad (`date -u`). Nunca se reescribe una entrada: si algo se
   revirtió, va una entrada nueva que lo dice.
4. **La justificación no es opcional.** "Pedido del usuario" no alcanza: por qué esa
   solución y qué alternativa se descartó. El qué ya está en `git log`.
5. Si algo quedó a medias, roto o sin verificar, se dice.
6. Si la entrada cambia algo de lo de arriba —un invariante, la navegación, un
   pendiente—, **se actualiza también este archivo**. Éste tiene que seguir entrando en
   una lectura.

```markdown
### YYYY-MM-DD HH:MM UTC — <Agente / modelo> — <Título corto>

**Qué cambié:** archivo por archivo, una línea cada uno.
**Por qué:** el razonamiento y las alternativas descartadas.
**Estado:** terminado / parcial / bloqueado, y qué falta.
**Verificación:** cómo se comprobó; si no se verificó, decirlo.
```
