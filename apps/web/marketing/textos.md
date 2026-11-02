# Textos para Meta (2026-10)

## 0. La publicación de una foto (2026-10-06) — "¿Seguís llenando el libro a mano?"

Es la que se sube. Reemplaza a "Volá más. Anotá menos.", que a Federico no le convenció, y a
las piezas de más abajo (el anuncio y el carrusel), que descartó.

**Imagen:** `marketing/salida/publicacion.png` (1080×1350, 4:5).
- La hoja es la que genera Vector de verdad (`lib/libro-anac-pdf.ts`), con vuelos inventados (`marketing/recursos/`).
- El vuelo que confirma el copiloto en el teléfono (25/09, SADF → SAZS, 2,3 h) es el último renglón de la hoja, resaltado.

### Pie de foto
> ¿Seguís llenando el libro a mano? ✍️
>
> Con Vector, al bajar del avión le mandás un audio al copiloto por WhatsApp contando el
> vuelo. Te muestra el resumen, confirmás, y queda cargado. El libro sale en PDF con la
> hoja de siempre y los totales hechos, listo para que te lo firmen.
>
> Y además te dice si podés volar hoy, cuánto te falta para la PCA y cuánto te queda del
> pack.
>
> Para alumnos y pilotos en Argentina. Probala desde el link de la bio.
>
> #piloto #pilotoprivado #alumnopiloto #aviacion #aviacionargentina #aeroclub #librodevuelo

### Texto alternativo
"Una hoja del libro de vuelo llena de vuelos, con el último renglón resaltado, y adelante un
teléfono con un chat de WhatsApp: un audio, el copiloto de Vector que resume el vuelo
SADF a SAZS de 2,3 horas, y 'Listo, quedó en tu bitácora'. Título: ¿Seguís llenando el libro
a mano?"

---


Las imágenes están en `marketing/salida/` y se regeneran con `node marketing/render.mjs`
desde `marketing/piezas.html`. Todo lo que dicen las piezas y estos textos se verificó
contra el código, como la landing. No dicen "gratis" ni "oficial".

---

## 1. El anuncio — "¿Cuánto te falta para la PPA?"

**A quién:** el alumno que está haciendo el curso de piloto privado. Es el público de
Vector (ver `AGENTS.md`), y el tracker de la PPA es lo que ninguna planilla le da.

**Imágenes:**
- `anuncio-4x5.png`: feed de Instagram y Facebook (la que más pantalla ocupa).
- `anuncio-1x1.png`: feed, para las ubicaciones que recortan a cuadrado.
- `anuncio-9x16.png`: historias y reels. Sin botón propio: abajo va el de Meta.

### Texto principal (probar las dos versiones)

**A — el requisito:**
> ¿Cuánto te falta para la PPA? Vector te lo dice requisito por requisito, con la RAAC 61
> en la mano: doble mando, vuelo solo, travesía y nocturno. Cargás cada vuelo en segundos,
> o mandándole un audio al copiloto por WhatsApp.

**B — las tres preguntas:**
> Tu bitácora de vuelo en el teléfono: si podés volar hoy, cuánto te falta para la próxima
> licencia y cuánto te queda del pack. Y cuando lo necesitás, el libro en PDF con la hoja de
> siempre, listo para que te lo firmen.

### Título
`Sabé cuánto te falta para la PPA` (32 caracteres)

### Descripción
`Tu bitácora de vuelo, siempre al día`

### Botón
**Registrarte**

### URL de destino
```
https://vector.fdiaznem.com.ar/?utm_source=meta&utm_medium=paid&utm_campaign=ppa-2026-10
```

### Público sugerido
- **Ubicación:** Argentina.
- **Edad:** 17 a 35.
- **Intereses:** aviación, piloto, escuela de aviación, aviación general, simulador de vuelo.
  Si Meta lo ofrece, sumá aeroclubes y escuelas de vuelo de la zona.
- **Ubicaciones:** dejá las automáticas (Advantage+). Las tres imágenes cubren feed,
  historias y reels.

### Presupuesto para probar
Poco y corto: un presupuesto diario chico durante 7 días, con las dos versiones del texto
(A y B) compitiendo. Al cerrar la semana, mirá cuál trajo más altas y apagá la otra.

### Cómo medirlo
- **Las altas:** el panel de administración (`/dashboard/admin`) tiene "Altas por día".
  Compará la semana del anuncio con las anteriores.
- **Lo que no mide hoy:** Meta no sabe quién se registró, porque el sitio no tiene el
  píxel de Meta. Agregarlo se puede, pero va en la política de privacidad (manda datos de
  la visita a Meta). Mientras tanto, Meta te da clics al link y costo por clic.

---

## 2. La publicación — carrusel "Cargá un vuelo con un audio"

**Imágenes, en este orden:** `carrusel-1.png` a `carrusel-4.png` (4:5, sirven para
Instagram y Facebook).

### Pie de foto
> ¿Volaste hoy? Cargalo con un audio 🎙️
>
> Al bajar del avión, le mandás un audio al copiloto de Vector por WhatsApp contando el
> vuelo. Te muestra el resumen —fecha, avión, ruta, tiempo, aterrizajes— y lo carga en tu
> bitácora cuando confirmás.
>
> Después abrís Vector y sabés si podés volar hoy, cuánto te falta para la próxima licencia
> y cuánto te queda del pack.
>
> Para alumnos y pilotos en Argentina. Se instala en el teléfono como una app.
> 👉 vector.fdiaznem.com.ar (link en la bio)
>
> #piloto #pilotoprivado #aviacion #aviacionargentina #alumnopiloto #bitacora #aeroclub

### Texto alternativo (para accesibilidad, campo "Texto alternativo" de Instagram)
1. "Placa: ¿Volaste hoy? Cargalo con un audio. Abajo, un audio de WhatsApp de 14 segundos."
2. "Un chat de WhatsApp con el copiloto de Vector: un audio, el resumen del vuelo y la confirmación."
3. "La pantalla de inicio de Vector: Podés volar hoy, 51.8 horas para la PCA y 6.5 en el pack."
4. "Placa final: Tu bitácora de vuelo, siempre al día. vector.fdiaznem.com.ar."

---

## 3. El carrusel del plan de vuelo (2026-10-20) — "Tu plan de vuelo, de Vector a la oficina ARO"

**Imágenes:** `marketing/salida/plan-1.png` a `plan-7.png` (1080×1440, 3:4), de
`marketing/plan-de-vuelo.html`. Se exportan con `node marketing/render.mjs plan-1 … plan-7`.
- Los formularios (plan, demora y cancelación) los arma el código de Vector con una piloto
  inventada, Lucía Ferrari (`marketing/recursos/plan-ejemplo.mjs`).
- El de EANA va recortado desde la casilla 7, **sin el logo de EANA**: Vector no es un
  servicio de EANA y la pieza no tiene que sugerirlo.
- La meteo y los NOTAM de la placa 2 son los de San Fernando del 20/10/2026, tal cual los
  mostró el editor.

### Pie de foto
> Tu plan de vuelo, de Vector a la oficina ARO ✈️
>
> Lo armás con tu avión guardado (equipo, transponder y colores) y la ruta, y Vector te
> sugiere la duración y la autonomía. Antes de salir ves el TAF a tu hora y los NOTAM que
> caen en tu horario, no todos los vigentes.
>
> Lo mandás firmado, en PDF, a la oficina ARO/AIS, con copia a vos. Si te demorás o no salís,
> la demora y la cancelación salen igual. Y cuando aterrizás, queda en tu bitácora.
>
> Después de mandarlo, llamás a la oficina para confirmar, como siempre.
>
> Para alumnos y pilotos en Argentina. Link en la bio.
>
> #planDeVuelo #piloto #pilotoprivado #alumnopiloto #aviacion #aviacionargentina #aeroclub #NOTAM

### Texto alternativo
"Siete placas. 1: un plan de vuelo lleno de SADF a SADM con el cartel 'Mandado firmado, en
PDF'. 2: la ruta como nodos y la duración y la autonomía sugeridas. 3: el TAF a las 1830Z y
dos NOTAM de San Fernando 'en tu horario'. 4: las tres oficinas más cercanas y el mail a la
oficina con el PDF adjunto. 5: los formularios de demora y de cancelación. 6: la tarjeta
'¿Ya volaste?' del inicio. 7: 'Del plan de vuelo a la bitácora' y el link."

### Lo que dice, contra el código
- **El avión completa equipo, transponder y colores:** el perfil del avión
  (`aircraft.plan_vuelo`, `aplicarAvion`).
- **Sugiere duración y autonomía:** `sugerirEetConocidos` y `sugerirAutonomia`. Los textos
  de la placa 2 son los del editor.
- **NOTAM en tu horario:** `lib/meteo-plan.ts`.
- **Firmado, en PDF, a la oficina, con copia:** `enviarPlan` y `armarMailPlan`. Asunto y
  archivo con el formato de `asuntoDelMail` y `nombreDelArchivo`.
- **Las tres oficinas más cercanas a SADF y sus millas:** `oficinasCercanas`, las mismas que
  muestra el editor.
- **La demora "hasta tres por vuelo":** `MAXIMO_DEMORAS`, AIP ENR 1.10, 7.3.
- **"¿Ya volaste?", sin horarios, y el mail:** `lib/plan-cierre.ts` y
  `/api/cron/plan-por-registrar`.
- **"Llamás para confirmar":** lo pide la AIC A 19/2026; Vector no lo reemplaza.
- No dice "gratis" ni "oficial".

## Lo que se verificó contra el código

| Lo que dice | Dónde está |
|---|---|
| Requisitos de la PPA y la RAAC 61.520(a) | `lib/ppa-progress.ts`, `components/dashboard/PPATracker.tsx` (mismas etiquetas) |
| Audio por WhatsApp, resumen y confirmación | `app/api/webhooks/whatsapp/route.ts` (presenta el resumen antes de cargar) |
| Si podés volar, cuánto te falta, cuánto te queda | el inicio (`app/dashboard/page.tsx`) |
| El libro en PDF con la hoja de siempre | `lib/libro-anac-pdf.ts` y la landing |
| Se instala como una app | `app/manifest.ts`, `sw/sw.ts` |

Los números de las imágenes son de ejemplo: los del tracker los armé para la pieza, y los
de la tarjeta "Hoy" son los mismos de la landing.
