# El plan de vuelo: formulario OACI y presentación ante EANA

Las fuentes de `src/lib/plan-de-vuelo.ts`, `plan-de-vuelo-pdf.ts` y `oficinas-aro.ts`.
Leídas el 2026-10-10. Lo regulatorio se escribe contra esto, no de memoria
(invariante 6 de `AGENTS.md`).

## Las fuentes

| Documento | Qué tomamos | Dónde |
|---|---|---|
| **AIP Argentina, ENR 1.10** (AIRAC AMDT 2/2025, 27-Nov-25; el Apéndice 1 es de la AMDT 2/2024) | Las formas de presentación (punto 3), los cambios y las demoras (6 y 7), el **formulario modelo OACI** (Apéndice 1, pág. ENR 1.10-9) y las **instrucciones casilla por casilla** (Apéndice 1, punto 2) | https://ais.anac.gob.ar/descarga/aip-68de68fddd504 |
| **AIC A 19/2026** (17-Jun-26, GO-EANA; cancela la A 08/2025) | Presentación por mail: firmado, digitalizado, **en PDF**, a la ARO/AIS del aeródromo de salida "o a la más cercana que se encuentre brindando servicio", con la matrícula en el asunto; confirmar **por teléfono**; **guardar el formulario un año**. El Anexo ALFA: 49 oficinas con correo y teléfonos | https://ais.anac.gob.ar/descarga/aic-6a32db490b7b8 — el texto del anexo está en `src/data/aic-oficinas-aro.txt` |
| **PROGEN-ARO** (Res. ANAC 35/2025, Anexo I) | La ARO "comprobará que han sido completadas con exactitud, todas las casillas (de la 7 hasta la 19 inclusive)" (4.1.9). El modelo de formulario es el del PROGEN-ATM, Apéndice 2, que es el que reproduce la AIP | https://argentina.gob.ar/sites/default/files/anexo_i_-_progen_-_aro_-_resolucion_35-2025.pdf |
| **EANA, "Plan de vuelo — Datos para llenar casillas 10 y 18"** (oct. 2024) | Las mismas letras de la casilla 10 y los indicadores de la 18, en una hoja | https://eana.com.ar/sites/default/files/2024-11/Plan%20de%20Vuelo%20-%20casilla%2010%20y%2018%20-%20OCT_2024.pdf |

## Casilla por casilla (ENR 1.10, Apéndice 1, punto 2.2)

- **Generalidades (2.1):** "Insértense siempre las horas con 4 cifras UTC. Insértense las
  duraciones previstas con 4 cifras (horas y minutos)." Lo sombreado antes de la casilla
  3 (prioridad, destinatarios, hora de depósito, remitente) es para los servicios ATS y
  COM: queda en blanco.
- **7:** la matrícula "sin exceder de 7 caracteres alfanuméricos y sin guiones o
  símbolos" (p. ej., LVGVE).
- **8:** reglas V, I, Y o Z; tipo G para aviación general.
- **9:** el número, "si se trata de más de una" (si es una, en blanco); el designador del
  Doc 8643, o ZZZZ y `TYP/` en la 18; estela L si la masa máxima de despegue es de 7.000
  kg o menos.
- **10 a):** N si no se lleva equipo; S si se lleva el normalizado —"los equipos VHF RTF,
  VOR e ILS se consideran normalizados" (Nota 1)— y/o las letras de lo demás (D DME, F
  ADF, G GNSS, L ILS, O VOR, V VHF, Y 8,33 kHz…). **10 b):** N, o el transponder (A, C,
  E, S…) y ADS-B (B1, B2…).
- **13:** el indicador OACI de cuatro letras, o ZZZZ y `DEP/` con "el nombre y lugar del
  aeródromo"; para los que no están en la AIP, el lugar en coordenadas (`4620N07805W`).
  Luego, sin espacio, la EOBT.
- **15 a) y b):** la velocidad verdadera como N y 4 cifras (`N0485`); el nivel como A y 3
  cifras en centenares de pies (`A045`), o "respecto a los vuelos VFR no controlados, las
  letras VFR".
- **15 c), fuera de rutas ATS:** "INSÉRTESE DCT entre puntos sucesivos, a no ser que
  ambos puntos estén definidos por coordenadas geográficas o por marcación y distancia."
  Los puntos van "normalmente separados por no más de 30 minutos de tiempo de vuelo o
  por 370 km (200 NM)". Formatos: designador (2 a 5 caracteres), grados y minutos (11
  caracteres, `4620N07805W`), o marcación magnética y distancia desde un punto con 3 y 3
  cifras (`DUB180040`).
- **16:** destino como en la 13 (`DEST/`), "DESPUÉS, SIN DEJAR UN ESPACIO" la duración
  total prevista; hasta dos alternativas (`ALTN/` si van con ZZZZ).
- **18:** "INSÉRTESE 0 (cero) si no hay otros datos", o los indicadores **en el orden de
  la AIP**: STS, PBN, NAV, COM, DAT, SUR, DEP, DEST, DOF, REG, EET, SEL, TYP, CODE, DLE,
  OPR, ORGN, PER, ALTN, RALT, TALT, RIF, RMK. "Los guiones o barras oblicuas sólo deben
  usarse como se estipula." `DOF/` es la fecha de salida en seis cifras, AAMMDD.
- **19:** E/ la autonomía en 4 cifras; P/ las personas a bordo, o TBN; R/, S/, J/ y D/:
  **se tacha** lo que no se lleva ("TÁCHESE U si no está disponible la frecuencia UHF de
  243,0 MHz"…); A/ el color y las marcas; N/ se tacha si no hay observaciones; C/ el
  piloto al mando; y quién lo presenta.

## Decisiones de Vector sobre lo que la norma deja abierto

- **DOF/ va siempre**, con la fecha **UTC** de la salida: una salida a las 22:00 en
  Argentina es otro día en UTC. La AIP no obliga a ponerlo en un vuelo del día, pero
  tampoco lo prohíbe, y saca la duda de qué día es.
- **El formulario es el de EANA**, no el dibujo de la AIP: el que se imprime en las
  oficinas ARO/AIS. El fondo sale del plan que Federico presentó el 10/10/2026 y le
  aceptaron (`LVS114-SADF1530SADF_101026.pdf`), y de ese plan salen también las
  convenciones de abajo.
- **Un aeródromo intermedio va con su código** (`ATE`), como en ese plan. La AIP reconoce
  los indicadores nacionales de tres letras.
- **La ruta empieza y termina con DCT** (`DCT ATE DCT`), como en ese plan.
- **NAV/ABAS** cuando el GPS tiene aumentación ABAS (con Z en la casilla 10), y **PER/**
  con la categoría de performance, si el piloto la marca.
- **Casilla 19:** el teléfono va en las observaciones (`N/ T.E. +54…`); "Comandante de la
  aeronave" lleva nombre, licencia y número; las radios de emergencia son las de
  supervivencia, no la VHF del avión; "Presentado por" queda vacío si no lo presenta otro.
- **La salida se carga en UTC**, como la pide la casilla 13 ("Insértense siempre las horas
  con 4 cifras UTC", 2.1). La hora argentina se muestra de ayuda, con UTC−3 sin horario de
  verano (`DESFASE_ARGENTINA_HORAS`). Hasta el 2026-10-19 se cargaba en hora argentina y
  se convertía; los planes de entonces se pasan a UTC al leerlos.
- **No se completa nada con valores estimados**: si el planificador usa la TAS o el
  consumo por defecto, el PDF no se baja hasta cargarlos.
- **Se manda desde el mail del piloto**, no desde Vector: la respuesta de la oficina le
  llega a él, y su carpeta de enviados es la copia que la AIC pide guardar un año.

## Lo que no sabemos

- **El horario de cada oficina ARO/AIS.** La AIC dice "la más cercana que se encuentre
  brindando servicio"; Vector propone la más cercana por distancia y deja elegir otra.
- **La AIC trae el mismo teléfono para Córdoba (SACO) y Bahía Blanca (SAZB)**,
  `(+54 351) 4756428`: con la característica de Córdoba, parece un error de la AIC. Se
  copió tal cual, y la pantalla muestra la lista entera de teléfonos de cada oficina.
- Los plazos de anticipación para presentar un plan VFR no están en la ENR 1.10; sí los
  de cambios (CHG, hasta 15 minutos antes de la EOBT) y demoras (DLA, avisar con 30
  minutos; más de 1 hora de demora en un vuelo no controlado obliga a enmendar o
  presentar uno nuevo).

## La demora (DLA) — AIP ENR 1.10, punto 7 y Apéndice 4

- **7.1:** si la demora supera **una hora** respecto de la hora prevista de inicio de
  rodaje en un vuelo no controlado (30 minutos si es controlado o IFR), "el plan de vuelo
  deberá enmendarse o presentarse un nuevo plan de vuelo cancelando el antiguo".
- **7.2:** "Las demoras deberán ser notificadas a la oficina ARO/AIS con no menos de 30
  minutos antes de la EOBT, pasado ese tiempo deberá presentar un nuevo plan de vuelo."
  Vector avisa, no frena.
- **7.3:** "La cantidad máxima de presentaciones de DLA en la Oficina ARO/AIS es de tres
  (3) formularios por vuelo." Vector no deja armar la cuarta, y el backend tampoco la guarda.
- **El formulario es el del Apéndice 4** (ENR 1.10-40, AIRAC AMDT 2/2025): casillas 7, 13
  con la nueva EOBT, 16 con duración y alternativa, 18, y nombre, licencia y firma. Es la
  imagen de la AIP (`src/lib/plan-de-vuelo-dla.png`). La casilla 18 va con la DOF/ de la
  nueva fecha, como lo hace FPL.AR.

## La modificación (CHG) — AIP ENR 1.10, punto 6 y Apéndice 3

Leído del PDF de la AIP (ENR 1.10, AIRAC AMDT 2/2025) el 2026-11-10, bajado desde un
navegador.

- **6.1:** los cambios "con respecto a la autonomía de vuelo o el número total de personas
  transportadas a bordo, u otras modificaciones de importancias" se rectifican o se avisan
  con un CHG a la oficina ARO/AIS "como mínimo hasta 15 minutos antes de la Hora de Fuera
  de Calzos". Vector avisa, no frena (como en la demora).
- **6.2:** "La cantidad máxima de presentaciones de CHG en la Oficina ARO/AIS es de tres (3)
  formularios por vuelo." Vector cuenta las mandadas desde Vector a la oficina
  (`envios` con `tipo: "chg"`) y no deja mandar la cuarta. Las que se bajan para presentar
  a mano **no se cuentan**: Vector no sabe si se presentaron.
- **6.4:** los CHG "solo son aplicables a cambios en planes de vuelo que aún no hayan
  recibido autorización ATC"; con la autorización dada, el cambio va "por radiotelefonía
  directamente a la dependencia ATC". La pantalla lo dice.
- **El formulario es el del Apéndice 3** (ENR 1.10-39): la misma planilla que la demora,
  con "MODIFICACIÓN" y "CHG", la casilla 18 de tres renglones y la **22, ENMIENDA**, de
  cuatro. La imagen es la de la AIP (`src/lib/plan-de-vuelo-chg.png`, 872×852 px, a
  140,93 pt del borde de arriba, pasada a grises como las otras dos).
- **Va con el plan vigente** (con la última demora, si hubo), y **no cambia el plan
  guardado**: es un mensaje sobre el plan presentado.
- **Cómo se escribe la casilla 22 no lo dice la AIP.** Vector sigue el campo 22 del Doc
  4444 de OACI (Apéndice 3): el número de la casilla, una barra y la casilla entera con el
  dato nuevo (`19/E/0430 P/3`), y cada una más separada por un guion
  (`19/E/0430 P/3 -15/N0100VFR DCT`). **El Doc 4444 no está en el repo**: esto se escribió
  sin tenerlo delante (invariante 6), y por eso la pantalla muestra la línea armada y cada
  casilla se puede corregir antes de mandarla. Las casillas que se ofrecen son las 8, 9,
  10, 15, 16, 18 y 19; la 7, la 13 y la DOF identifican el plan y no se cambian con un CHG
  (un cambio de hora es una demora).

## La cancelación (CNL) — AIP ENR 1.10, Apéndice 5

- **El formulario es el del Apéndice 5** (ENR 1.10-41, AIRAC AMDT 2/2025), la misma planilla
  que la demora con "CANCELACIÓN" y "CNL": casillas 7, 13 con la EOBT, 16 con duración y
  alternativa, 18, y nombre, licencia y firma. La imagen es la de la AIP
  (`src/lib/plan-de-vuelo-cnl.png`, 876×847 px, a 148,22 pt del borde de arriba). Se le
  borró el recuadro verde de selección que quedó en la casilla 18 cuando la exportaron de
  una planilla.
- **Va con la salida vigente**: la del plan, o la de la última demora (`planVigente`). La
  DOF/ de la casilla 18 es la de esa salida, como en la demora.
- El texto de la ENR 1.10 sobre la CNL (punto 4.4 del acuerdo de RPL) es para planes
  repetitivos: "se trasmitirán cuando se anule un vuelo un día determinado". Para un plan
  común, la AIP sólo trae el formulario; Vector no le pone plazo.
- **La licencia tiene 6 celdas** en los tres formularios. Una licencia más larga (8 cifras)
  va entera y centrada, tapando las divisiones, en vez de cortada.

## El horario de las oficinas — AIP AD 2.3

- Cada ficha de aeródromo publica en AD 2.3, renglón 5, el horario de la "Oficina de
  notificación ATS (ARO)". `scripts/build-horarios-aro.mjs` lo copia para las oficinas de
  la AIC (48 de 49: Goya, SATG, no tiene ficha en la AIP) a `src/data/aip-horarios-aro.tsv`,
  con el renglón verbatim.
- **Vector sólo dice "abierta" o "cerrada" con H24 o con un único rango UTC.** Con días de
  la semana, "O/R" (a pedido), "SS" (puesta del sol) o feriados, muestra el texto y pide
  revisarlo: decidir mal que una oficina atiende es peor que no decirlo.

## La meteorología y los NOTAM a la hora del vuelo

No es norma, es ayuda: el briefing sigue siendo del piloto, y la pantalla lo dice.

- **La ventana del vuelo** va de una hora antes de la EOBT vigente a una hora después de la
  llegada estimada (EOBT más la casilla 16). Todo en UTC, como los NOTAM (casillas B y C)
  y el TAF.
- **El TAF** se recorta a la hora: a la salida para el aeródromo de salida, a la llegada
  para el destino y las alternativas. Se muestran los grupos que valen a esa hora, tal cual:
  - la base o el último `FM`;
  - los `BECMG` que ya empezaron;
  - los `TEMPO` y `PROB` que la cubren.

  Fuera de la validez del TAF se dice hasta cuándo llega. Un aeródromo sin TAF o sin METAR
  toma el de la estación más cercana a menos de 60 NM, y lo nombra.
- **Los NOTAM** salen del servicio de ANAC (`ais.anac.gob.ar/notam`). ANAC escribe el
  horario al final del texto: días del mes con su rango (`07 0530-0830 09, 14 AND 30
  0430-0830`), o un rango solo, que es todos los días (`CLSD 1000-2200`). Vector lo lee
  (`lib/meteo-plan.ts`, testeado con NOTAM reales del 20/10/2026) y separa:
  - **en tu horario**: rige en algún momento de la ventana;
  - **revisá el horario**: con días de la semana, salida y puesta del sol, "EXC", o algo
    que no se entiende sin dudas;
  - **vigentes, pero no en tu horario**, y **permanentes** (obstáculos, enmiendas al AIP):
    plegados, nunca escondidos.

  FPL.AR avisa con sólo mirar la vigencia, y así le marcó a Federico un NOTAM que no
  aplicaba a su vuelo (2026-10-19).

