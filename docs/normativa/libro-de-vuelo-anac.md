# El libro de vuelo — fuentes del PDF de la Bitácora

> Lo que implementan `src/lib/libro-anac.ts` (qué va en cada renglón, testeado) y
> `src/lib/libro-anac-pdf.ts` (el dibujo). Verificado contra las fuentes el 2026-09-23.
> Si una de estas normas cambia, se cambia este archivo y después el código.

## Qué rige hoy

| Fuente | Qué toma Vector |
|---|---|
| **RAAC Parte 61, Edición VI (enero 2026), sección 61.120** "Libro de vuelo personal del piloto" | Qué anota el piloto de cada vuelo: fecha, tiempo total, lugar de salida y de llegada, tipo e identificación de la aeronave, en qué función voló y en qué condiciones (día o noche, instrumentos real o simulado). En la 4ª edición (2021) esto era la 61.51(d), y la certificación la 61.52: **esa numeración ya no existe**. |
| **Resolución ANAC 470/2025** (B.O. 15/07/2025) | Deroga la Res. 147/2013, salvo su Anexo II, y el anotado, la certificación y el foliado del libro en papel hasta el 1/1/2026. Aprueba el registro electrónico en el **Casillero Aeronáutico Digital (CAD)**, obligatorio para la RAAC 91 —escuelas incluidas— desde el 1/11/2025. |
| **Anexo I de la 470/2025**: "Procedimiento para el registro de actividad de vuelo electrónico", Rev. 0 (lo publica ANAC en la página del CAD, no el Boletín) | **Punto 5**: los datos del libro, los mismos de siempre (ver abajo). **Punto 8**: cada vuelo lleva el nombre de quien lo certifica. **Punto 9(b)**: el libro en papel convive con el electrónico; se puede usar "el libro de vuelo en formato digital impreso" para anotar y certificar; y lo anotado tiene que coincidir con lo declarado en el CAD. |
| **La hoja**: el Adjunto A de la Res. 147/2013 ("Hoja libro de vuelo pilotos") | El dibujo: 35,5 × 16,5 cm, el encabezado de cuatro niveles, 15 renglones, "Totales página anterior" arriba y "a la página siguiente" abajo, la firma del titular. La resolución está derogada, pero la hoja es la de los libros en papel, y **el Libro de Vuelo Electrónico que emite el CAD usa la misma** (guía "paso a paso" de ANAC para pilotos, paso 3, punto 8). |

## Casillero por casillero

- **Encabezado:** apellido y nombre, licencia, número y legajo (punto 5). Los dos últimos
  se cargan en el Hangar (`profiles.licencia_numero`, `profiles.legajo`); sin ellos, el
  casillero queda en blanco para completarlo a mano.
- **Año, día y mes.** El año va en el encabezado de la hoja, así que un cambio de año
  empieza hoja nueva.
- **Horas de salida y de llegada:** en UTC, como lo aclara la nota impresa en la hoja.
  El procedimiento vigente no lo repite, y Vector guarda todo en UTC.
- **Desde / hasta:** el primero y el último punto de la ruta. **Un vuelo local lleva el
  mismo aeródromo en los dos** (SADF SADF), como lo escribe el libro electrónico del CAD
  y como lo anotan los pilotos. El tiempo va en las columnas "sobre aeródromo". El "lugar
  y LOCAL" era del punto 7.4 de la 147/2013, que está derogada.
- **Finalidad:** con las siglas del punto 5 (INST, I, ADAP, EXA, VP…).
- **Aeronave:** marca y modelo, matrícula, potencia y clase.
  - En **marca y modelo** va el tipo, como se anota en el libro (C152, C172, ECHO,
    ASTO): el "Tipo OACI" de la aeronave en el Hangar, y si falta, el nombre completo.
    El punto 5 dice "en texto claro"; se sigue la costumbre de los libros, por pedido
    de Federico (2026-09-23).
  - La **potencia** es la total en un multimotor. Se carga en el Hangar
    (`aircraft.potencia_hp`); si falta, queda en blanco.
  - La **clase** va como **MONT-T, MULT-T, MONT-A o MULT-A** (punto 5). Vector guarda los
    acuáticos como MONT-H y MULT-H y los traduce al escribir el libro. La 147/2013
    decía "MON-A".
- **Tiempos de vuelo:** sobre aeródromo o travesía, de día o de noche, como piloto o
  copiloto. Van en horas y décimas, que es como se guardan en Vector (con el cuadro de
  horas centesimales, `calculateFlightDuration`) y como los escribe el libro electrónico
  del CAD (1.2, 2.7).
  - **Discrepancia a vigilar:** el texto del punto 5 dice "En horas sexagesimal", pero el
    ejemplo oficial del CAD muestra decimales. Si ANAC aclara que son horas y minutos,
    cambia `formatoLibro`.
- **Aterrizajes:** en números.
- **Discriminación** (instructor, multimotor, reactor, turbohélice, aeroaplicador,
  instrumentos real piloto/copiloto, capota): **no se suma a los totales**, porque ya
  está dentro de "Tiempos de vuelo" (nota del punto 5).
  - Vector llena multimotor (por la clase), instructor (finalidad I), aeroaplicador
    (finalidad AER) y las de instrumentos.
  - Reactor y turbohélice quedan en blanco porque Vector no lo sabe, y no se inventa.
- **Adiestrador terrestre / simulador:** se asienta por separado. Una sesión de
  simulador sólo llena esa columna: no es hora de vuelo (invariante 4).
- **Totales:** la suma de las columnas "Tiempos de vuelo". La primera hoja arrastra las
  horas del libro de papel (`logbooks.opening_*`).
- **Certificaciones:** quedan en blanco. Las firma el instructor o la autoridad, sobre la
  hoja impresa. Sólo si el piloto lo pide ("Con las firmas de los certificantes") se estampa la
  firma que guardó de quien certificó cada vuelo, con su aclaración; sin firma guardada, en blanco.
- **El dorso de cada hoja** (firma con sello o aclaración, opción "Con el dorso de cada hoja"):
  **no lo define el Adjunto A que tenemos documentado**; es la práctica que pidió Federico
  (2026-11-13), no algo de la norma. Una hoja sin dorso cargado va con su dorso en blanco.

## Lo que el PDF no es

- **No reemplaza al CAD.** Desde el 1/11/2025, cada vuelo se declara en el Casillero
  Aeronáutico Digital, que emite el Libro de Vuelo Electrónico y el Resumen de Actividad
  de Vuelo con código QR. El PDF de Vector es el libro en papel que convive con eso, y lo
  anotado tiene que coincidir con lo declarado.
- **No es un documento emitido por ANAC**, y por eso la app no lo llama "oficial".

## Fuentes

- RAAC Parte 61, Edición VI (enero 2026), en InfoLEG:
  <https://servicios.infoleg.gob.ar/infolegInternet/anexos/420000-424999/422623/res65.pdf>
- Resolución ANAC 470/2025, Boletín Oficial:
  <https://www.boletinoficial.gob.ar/detalleAviso/primera/328340/20250715>
- Registro electrónico de horas de vuelo (CAD), con el procedimiento y la guía para
  pilotos: <https://www.argentina.gob.ar/anac/personal-aeronautico/foliado-de-libro-de-vuelo>
- Resolución ANAC 147/2013, texto original (derogada); la hoja del Adjunto A es la imagen
  `210610_res147-4_JPG`: <https://www.argentina.gob.ar/normativa/nacional/norma-210610/texto>
