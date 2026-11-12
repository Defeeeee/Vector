# Novedades de Vector

Generado por `npm run build:changelog` desde `src/lib/changelog.ts`. **No editar a mano:**
lo que se escriba acá se pierde en la próxima corrida.

Sólo va lo que el piloto ve. Lo de adentro —tests, refactors, migraciones— está en
la bitácora de `docs/bitacora/`.

## v3.29.0 — Niveles VFR según tu derrota

_12 de noviembre de 2026_

- **¿Esa altitud te corresponde?** — En "Vientos en altura", cada altitud dice si es nivel de crucero VFR para tu derrota magnética (RAAC 91.159 y AIP ENR 1.7) y, desde 3.000 ft sobre el terreno, el nivel de vuelo. Si la ruta cambia de semicírculo, te dice en cuántos tramos corresponde.

## v3.28.0 — Vientos en altura para tu plan

_12 de noviembre de 2026_

- **¿A qué altitud conviene volar?** — En el plan de vuelo, "Vientos en altura" te muestra para cada altitud de 1.500 a 9.500 ft el viento pronosticado en tu ruta a la hora de salida, cuánto es de frente o de cola, la cruzada, la GS, el tiempo con el ascenso incluido y el combustible. Marca la que tarda menos, y con un toque usás ese tiempo como EET.

## v3.27.0 — Las llegadas y salidas de Morón, en el Mapa

_12 de noviembre de 2026_

- **Procedimientos visuales de Morón** — Las llegadas y salidas visuales de las pistas 02 y 20 de Morón, como flechas en el Mapa, con el texto del AIP al tocarlas. Filtralas por llegada o salida y por pista desde las capas. También están GIVA, Libertad, Puente de Hierro y las vías del Sarmiento y el Belgrano resaltadas.

## v3.26.0 — Tu plan de vuelo, en el Mapa

_12 de noviembre de 2026_

- **Del plan al Mapa, y al revés** — Desde un plan de vuelo, "Abrir en el Mapa" carga la ruta y el avión. En el Mapa, "Tus planes" muestra los de los próximos días para cargarlos con un toque. Lo que el Mapa no puede ubicar, te lo avisa.
- **Un solo link para tu familia** — Si compartiste el vuelo desde el plan y después volás con el Mapa, el teléfono le suma su GPS a ese mismo link: tu familia sigue uno solo, desde "Sale a las…" hasta "Aterrizó".

## v3.25.0 — Activá los avisos desde el plan

_12 de noviembre de 2026_

- **Avisos de la oficina, al lado del envío** — En el plan de vuelo, junto a "Mandarlo por mail desde Vector", podés activar los avisos de este dispositivo para que te llegue un push cuando la oficina conteste: recibido, aceptado, rechazado o que corrijas algo.

## v3.24.0 — Tu vuelo compartido, aunque el teléfono duerma

_12 de noviembre de 2026_

- **ADS-B cuando el teléfono no manda** — Si compartís tu vuelo y el teléfono deja de mandar la posición (pantalla apagada, sin batería, sin señal), el link sigue mostrando el avión con las posiciones ADS-B públicas, y dice de dónde sale cada una.
- **Compartí un vuelo desde el plan** — En el plan de vuelo, "Compartir este vuelo" arma el link sin usar el teléfono: dice a qué hora salís, muestra el vuelo cuando el avión despega y "Aterrizó" cuando toca tierra. Necesita que el avión transmita ADS-B.

## v3.23.0 — Cambiá la ruta sin aterrizar

_11 de noviembre de 2026_

- **Directo a, en vuelo** — En vuelo, "Directo a" te muestra lo que queda de la ruta y los aeródromos más cercanos con distancia y rumbo. Tocá un aeródromo del mapa para ir directo o sumarlo, o editá la ruta entera, con deshacer. El track sigue y tu familia ve la ruta nueva.

## v3.22.0 — Te avisamos cuando contesta la oficina

_11 de noviembre de 2026_

- **La respuesta de la oficina a tu plan, en un push** — Cuando la oficina ARO/AIS contesta tu plan de vuelo, te llega una notificación: recibido, aceptado, rechazado o que corrijas algo. La respuesta queda en el plan y te sigue llegando a tu mail.
- **Sabé si te están mirando** — Con tu vuelo compartido, la pantalla de vuelo te dice si alguien lo está mirando ahora o cuándo lo vieron por última vez.

## v3.21.0 — Tu vuelo, en detalle para quien te sigue

_11 de noviembre de 2026_

- **El link de tu vuelo muestra mucho más** — Quien te sigue ve el avión, la ruta con sus nombres, cuánto falta y a qué hora llegás, si subís o bajás, el perfil de altura y el clima en tu destino explicado fácil. Se ve bien en el teléfono y en la compu. La matrícula sólo aparece si la prendés.

## v3.20.0 — Para volar acompañado

_11 de noviembre de 2026_

- **Que tu familia siga el vuelo** — En vuelo, en el Mapa, "Compartir mi vuelo" manda un link: quien lo abre ve dónde vas y por dónde pasaste, sin cuenta. Se apaga al terminar o a las 12 horas.
- **Aviso antes de entrar a un espacio aéreo** — En vuelo, el Mapa te avisa antes de entrar a una CTR, ATZ o TMA, con la distancia, el tiempo y a quién llamar. Con vibración y, si lo prendés, un pitido.
- **El briefing de la ruta en PDF** — Desde la ruta del Mapa: si podés volar hoy, METAR, TAF y NOTAM de cada aeródromo, los tramos, las frecuencias y los espacios aéreos, en una hoja para llevar.
- **El viento pronosticado en la planilla** — La planilla de navegación trae el viento del pronóstico para tu ruta, tu hora de salida y tu altitud, y te lo sugiere para usar con un toque.

## v3.19.0 — Corregí el CAD desde Vector

_11 de noviembre de 2026_

- **Actualizar en el CAD, ahora todo lo que no coincide** — Si un vuelo pendiente de DDJJ tiene en el CAD otros horarios, tiempos, avión, lugares, aterrizajes, finalidad, cargo o autoridad que en Vector, "Pasar al CAD" lo deja como en Vector con un toque. Antes te muestra cada cambio. Con la extensión, bajá la versión nueva.

## v3.18.0 — La autoridad, también en el CAD

_11 de noviembre de 2026_

- **Actualizá la autoridad en el CAD desde Vector** — Si un vuelo pendiente de DDJJ tiene en el CAD otra autoridad certificante que en Vector, "Pasar al CAD" te deja cambiarla allá con un toque, de a uno o todos juntos. Sólo se cambia la autoridad y su nombre. Con la extensión, bajá la versión nueva.

## v3.17.1 — Todos los que cambiaste

_11 de noviembre de 2026_

- **Pasar al CAD revisa todos los vuelos que cambiaste** — Si cambiaste la autoridad de muchos vuelos, ahora se revisan todos en la misma conexión, no de a doce.

## v3.17.0 — Quién certifica, de una vez

_10 de noviembre de 2026_

- **La autoridad certificante para varios vuelos** — En la Bitácora, tocá "Elegir", marcá los vuelos (los filtros ayudan) y poneles la autoridad y su nombre de una vez, estén o no en el CAD.
- **Si cambiaste quién certifica, te avisa** — Los vuelos que ya están en el CAD con otra autoridad aparecen en "Pasar al CAD" como que no coinciden, para que la actualices allá.

## v3.16.1 — Arreglos después de volar

_10 de noviembre de 2026_

- **El Mapa en vuelo, con el mapa** — Al empezar a volar se dejaban de ver el mapa de fondo y las cartas, y quedaban sólo los espacios aéreos. Ya está arreglado.
- **La misma autoridad para varios vuelos** — En "Pasar al CAD", con varios vuelos elegidos, ponés la autoridad certificante y su nombre una vez y se aplica a todos. Queda guardada en cada vuelo.
- **El copiloto carga el desglose** — Los vuelos que cargás por WhatsApp o con el copiloto ahora llevan el desglose del libro, como en el formulario: PIC diurno, local o travesía, salvo que le digas otra cosa.

## v3.16.0 — Volando con el Mapa

_10 de noviembre de 2026_

- **Nariz arriba y tu track** — En vuelo, el mapa puede girar con tu rumbo, con el próximo punto y los instrumentos arriba y la frecuencia abajo. Mientras volás graba tu track: al terminar lo bajás en GPX o vas directo a registrar el vuelo.
- **La modificación del plan de vuelo (CHG)** — Si cambia la autonomía, las personas a bordo u otro dato, mandá la modificación a la oficina ARO/AIS desde tu plan, con el formulario de la AIP.
- **Sin pantalla negra al abrir** — La app instalada ahora arranca con la marca de Vector mientras carga, en vez de quedarse en negro.

## v3.15.0 — El Mapa, para volar

_10 de noviembre de 2026_

- **La piernera en PDF** — Desde la ruta del Mapa, una hoja A5 para imprimir: cada tramo con rumbo, distancia y tiempo, lugar para la hora estimada y la real, las frecuencias y renglones para anotar.
- **El Mapa sin señal y los corredores de Córdoba** — Guardá las cartas del AIP de tu ruta antes de salir, y el mapa de fondo que ya miraste queda guardado. Además, los once corredores VFR de Córdoba, con su ancho y quién da información.
- **Del CAD, también tus simuladores** — "Traer a Vector" ahora trae las sesiones de simulador del CAD a tu equipo del Hangar. Y si se te cierra la sesión, al volver a entrar seguís en la pantalla donde estabas.

## v3.14.0 — Vector nuevo, también en el teléfono

_10 de noviembre de 2026_

- **El inicio de la compu, en el teléfono** — Si podés volar hoy, tus horas, el camino a tu licencia, tu pack o tu saldo, los últimos vuelos y lo que vence, en una columna y sin tarjetas.
- **Todo con el mismo estilo** — Una barra de secciones de borde a borde abajo, pestañas más claras, los botones y lo elegido en cian, y letras más livianas en la pantalla chica.

## v3.13.0 — Del Mapa al plan de vuelo

_10 de noviembre de 2026_

- **El plan de vuelo, directo desde el Mapa** — Elegí el avión, mirá el tiempo de cada tramo y el combustible, y tocá "Armar el plan de vuelo": se abre el plan con la ruta, el avión y la duración sugerida.
- **Tus rutas guardadas** — Guardá una ruta del Mapa con un nombre y abrila cuando quieras, en la compu o en el teléfono.
- **Siempre en la última versión** — Vector se actualiza solo al abrirlo o al pasar de una pantalla a otra. Si estás cargando algo, te avisa y se aplica cuando guardes.
- **Todo Vector, de noche** — Las pantallas de la compu y el ingreso tienen el estilo del inicio: sin cajas, títulos grandes y los botones en cian.

## v3.12.0 — Menos pantallas, todo a mano

_10 de noviembre de 2026_

- **Cuatro secciones en vez de cinco** — Inicio, Bitácora, Preparar vuelo y Pilotos. Tus gastos están ahora en la Bitácora, al lado de tus vuelos y el resumen, y la auditoría del libro te avisa arriba de la lista de vuelos.
- **Preparar vuelo arranca en el Mapa** — La planilla de navegación sale de la ruta del Mapa, y de ahí armás el plan de vuelo. El METAR y el TAF de cada aeródromo están en su ficha, en Aeródromos.

## v3.11.0 — Vector, de noche

_5 de noviembre de 2026_

- **Un inicio nuevo en la compu** — Arriba, si podés volar hoy y tus horas totales, sobre la carta de Baires. Debajo, el camino a tu licencia, lo que te queda de pack o de saldo (y hasta cuándo te alcanza al ritmo de este mes), tus últimos vuelos y una lista de chequeo con lo que vence.
- **Sólo oscuro, y más descansado a la vista** — Vector pasa a ser oscuro siempre, con más contraste entre el fondo, las tarjetas y el texto. La barra de la izquierda, en azul noche, se abre con los nombres al pasar el mouse.

## v3.10.0 — Vector, con marca nueva

_5 de noviembre de 2026_

- **Una marca nueva** — La flecha de rumbo, la misma que te muestra en el Mapa, plegada en blanco y cian. Cambia el ícono de la app y el logo: si la tenés instalada, el ícono nuevo aparece cuando el teléfono lo actualiza.

## v3.9.0 — Las cartas del AIP, en el Mapa

_5 de noviembre de 2026_

- **Las cartas de navegación, encima del mapa** — Prendé la carta en ruta inferior o superior (ENR 6) o las VFR por debajo de las TMA Baires y Córdoba: es la carta del AIP tal cual, ubicada en su lugar, con tu ruta y tu posición encima. Podés bajarle la opacidad para ver el mapa de abajo.
- **Elegí qué ver** — El menú de capas del Mapa ordena todo por grupo: cartas, espacios aéreos (TMA, CTR, ATZ, FIR), VFR (corredores y sectores) y puntos. Lo que elegís se recuerda.

## v3.8.0 — La RAAC 91 en el copiloto

_5 de noviembre de 2026_

- **Preguntale también por las reglas de vuelo** — El copiloto ahora tiene la RAAC 91 (IV edición, mayo 2026): mínimos VFR, combustible de reserva, alturas mínimas, documentos a bordo, plan de vuelo, luces y equipamiento. Y la RAAC 61 con su Enmienda I de mayo. Contesta sólo con el texto de la norma y te cita la sección; si no está, te lo dice.

## v3.7.0 — Siempre al día, sin tocar nada

_5 de noviembre de 2026_

- **La app se actualiza sola** — Al volver a abrir Vector, y cada cinco minutos mientras la usás, se traen tus datos de nuevo. Si hay una versión nueva, se toma sola al reabrir (en Registrar vuelo y otras pantallas donde escribís, te sigue preguntando). Y en la app instalada podés tirar hacia abajo para actualizar.

## v3.6.0 — Tu libro y tu CAD, siempre iguales

_4 de noviembre de 2026_

- **Vector revisa tu CAD cada vez que se conecta** — Cuando abrís "Pasar al CAD", Vector compara cada vuelo que está en los dos lados: horarios, avión, aeródromos, tiempo, aterrizajes, día y noche, finalidad y cargo. Si algo no coincide, te muestra qué dice cada uno para que corrijas el que esté mal.

## v3.5.0 — Todo Vector, a medida del teléfono

_4 de noviembre de 2026_

- **El resto de las pantallas, también** — Resumen, Auditoría, Balance, Preparar vuelo, Pilotos y el Hangar con el diseño nuevo del teléfono: títulos más chicos, tarjetas más livianas y menos scroll. El desglose ANAC del Resumen ahora entra entero, y la Auditoría muestra sus tres contadores en una fila.

## v3.4.0 — Vector, cómodo en el teléfono

_3 de noviembre de 2026_

- **Un inicio para el teléfono** — Primero, si podés volar hoy; después cuánto te queda del pack y cuánto te falta para la licencia, en una fila. Abajo, cada sección con su nombre, y en la app instalada, una barra de pestañas de borde a borde. El tema y "Cerrar sesión" están en tu Hangar.
- **Registrar con una mano** — "Ahora" en cada hora, y Guardar siempre abajo con el tiempo de vuelo. En la Bitácora, deslizá un vuelo a la izquierda para editarlo o pasarlo al CAD. Y en el Mapa, volando, la tarjeta baja con el próximo punto y con quién hablás.
- **Letra nueva** — Plus Jakarta Sans en vez de Nunito: los títulos y las negritas, más firmes.

## v3.3.0 — Tus propios puntos, desde el mapa

_3 de noviembre de 2026_

- **Tocá el mapa y sumá un punto** — Prendé "Agregar puntos en el mapa" y cada toque suma esa coordenada a la ruta, para armarla por donde vas a volar de verdad. Con "Deshacer" sacás el último.

## v3.2.0 — Los corredores VFR de Baires

_3 de noviembre de 2026_

- **Corredores y sectores VFR, clase G** — Los once corredores VFR debajo de la TMA Baires y los sectores Escuela de San Fernando y de Morón, del AIP. Volando por ellos no hablás con Aeroparque ni con Baires: el Mapa lo sabe, con sus alturas máximas (1.000 ft dentro de la CTR, 2.000 ft fuera).
- **Clase G y aeródromos no controlados** — Fuera de la TMA y las CTR estás en clase G, y el centro es sólo información de vuelo. Al llegar a un aeródromo no controlado, su canal de llamada. Escribí puntos VFR en la ruta (BENAVIDEZ, DIQUELUJAN, CANUELAS) y, si cruzás una CTR con un corredor cerca, el Mapa te lo sugiere.

## v3.1.0 — Con quién hablás, de punta a punta

_3 de noviembre de 2026_

- **Las frecuencias de toda la ruta** — Poné la altitud de crucero y el Mapa te dice con quién hablás en cada tramo: la torre, el control de la TMA y el centro de la FIR con su sector, con las frecuencias del AIP. En vuelo, con quién hablás ahora y cuál es el próximo cambio.
- **Las FIR y sus sectores, en el mapa** — Los límites de las cinco FIR y la línea entre los sectores de cada centro. Las TMA vecinas comparten el borde, y el mapa ya no muestra los helipuertos.

## v3.0.0 — El Mapa: planificá y volá sobre la carta

_3 de noviembre de 2026_

- **Planificá sobre el mapa** — Una pantalla que es todo mapa. Escribí la ruta, con aerovías si querés, o tocá los aeródromos, y se dibuja al instante con la distancia y el rumbo de cada tramo, los espacios aéreos que cruza y, si lo pedís, la meteo y los NOTAM.
- **Volá con el GPS del teléfono** — Tocá Volar y la misma pantalla te muestra dónde estás, tu velocidad, el próximo punto con su distancia, rumbo y tiempo, y en qué espacio aéreo estás. La pantalla queda prendida. Es una ayuda VFR: no reemplaza la carta.
- **Las CTR, ATZ y TMA del AIP** — 61 espacios aéreos dibujados desde el texto del AIP de ANAC, con sus límites y su clase. Los que el AIP define con radiales o sin coordenadas no se dibujan, y el mapa lo dice.

## v2.40.0 — Los NOTAM de todo el país

_3 de noviembre de 2026_

- **NOTAM de ANAC, cada 15 minutos** — Vector trae los NOTAM vigentes de todo el país, aeroclubes incluidos, cada 15 minutos. Los ves en la ficha de cada aeródromo con la hora de la última actualización de ANAC, y el copiloto los usa para contestarte.

## v2.39.0 — El copiloto, al instante

_2 de noviembre de 2026_

- **Te contesta mientras escribe** — El copiloto te dice qué está haciendo (leyendo tu bitácora, buscando en la RAAC, consultando un aeródromo) y la respuesta aparece a medida que la escribe. La barra para preguntar queda abajo, como en cualquier chat.
- **Cargá un vuelo charlando** — Contale al copiloto el vuelo: te muestra el resumen y, cuando le decís que sí, queda en tu bitácora. Antes, en la web, la confirmación no lo guardaba.

## v2.38.0 — Buscá como lo dirías

_2 de noviembre de 2026_

- **Aeródromos con filtros, o con una frase** — En Aeropuertos escribí "con 100LL y pista de asfalto, a menos de 100 NM de San Fernando", o usá los filtros: distancia, pista, combustible, control, uso y provincia. Si de un aeródromo no tenemos el dato, lo marcamos "sin dato" en vez de darlo por hecho.
- **El copiloto, adentro del buscador** — Apretá ⌘K (Ctrl K) o la lupa y escribí tu pregunta: si ninguna pantalla, vuelo o aeródromo la contesta, el copiloto te responde ahí mismo y podés seguir la conversación. Ya no hay botón flotante, y en el teléfono la barra de abajo tiene más lugar.

## v2.37.0 — Mostrá por dónde volaste

_1 de noviembre de 2026_

- **La imagen de tu recorrido** — Abrí un vuelo con recorrido real y tocá "Compartir la imagen": el mapa con tu recorrido coloreado por altura, el tiempo en el aire, las millas, la altura y la velocidad máximas, listo para mandar. Nunca lleva la matrícula.
- **El recorrido en tus publicaciones** — Al compartir un vuelo en la red, prendé "Recorrido" y la publicación muestra por dónde volaste, en lugar de una línea recta. Sale sólo la forma, sin horarios.

## v2.36.0 — Tu CAD, desde Vector

_29 de octubre de 2026_

- **Pasá tus vuelos desde Vector** — Con la extensión de Vector, abrí el CAD en otra pestaña y volvé a Vector: "Pasar al CAD" se conecta solo y ahí ves qué falta, qué está y qué hay que corregir. Con el marcador, tocalo en el CAD y se abre Vector. Los pedidos salen de tu navegador, con tu sesión del CAD.
- **De cuándo es lo que ves de tu CAD** — La Bitácora y el inicio dicen cuándo se leyó tu CAD por última vez, y te avisan si pasaron más de tres días para que lo actualices.

## v2.35.0 — Pasar al CAD con la extensión de Vector

_29 de octubre de 2026_

- **Un botón de Vector adentro del CAD** — Instalá la extensión de Vector en Chrome y vas a tener un botón "Pasar con Vector" en el CAD: cargás tus vuelos desde tu propia sesión, sin marcador y sin que Vector vea tu contraseña. Conectar tu cuenta de ANAC queda en pausa por ahora.

## v2.34.0 — Tu CAD, al día solo

_28 de octubre de 2026_

- **Vector y tu CAD dicen lo mismo** — Con tu cuenta de ANAC conectada, Vector revisa tu CAD solo una vez por día: anota lo que cargaste a mano, devuelve a la lista lo que borraste y te avisa qué vuelos esperan tu declaración jurada.

## v2.33.0 — Tu CAD desde Vector

_28 de octubre de 2026_

- **Pasá tus vuelos al CAD desde Vector** — Conectá tu cuenta de ANAC una vez y cargá tus vuelos en el CAD desde acá, también desde el teléfono. Si preferís que tu contraseña no pase por Vector, sigue estando el marcador.
- **Cargalo y ya queda en el CAD** — Con tu cuenta conectada, al registrar un vuelo tildás "Cargarlo también en tu CAD" y queda Pendiente de DDJJ. La declaración la seguís haciendo vos.
- **Simuladores y LAD, también al CAD** — Las sesiones de simulador pasan al CAD: elegís una vez cuál es tu simulador y su clase. Y los vuelos desde un LAD se registran buscándolo por número o nombre, y pasan con su número.

## v2.32.0 — Los LAD en el plan de vuelo

_28 de octubre de 2026_

- **Salí o llegá a un LAD** — En el plan de vuelo, buscá un LAD por su número o por su nombre y aparece como LAD2013. Cargás sus coordenadas y Vector arma la casilla 18 como pide EANA.

## v2.31.0 — Tu firma en el libro y la RAAC en el copiloto

_26 de octubre de 2026_

- **El libro en PDF, firmado** — Exportá el libro con la firma que guardaste en el plan de vuelo, ya puesta en cada hoja. También sigue estando sin firma, para firmarlo a mano.
- **Preguntale a la RAAC** — Preguntale al copiloto por licencias, CMA, experiencia reciente o requisitos de horas: contesta con el texto de la RAAC 61 vigente y te cita la sección. Si no está ahí, te lo dice.

## v2.30.0 — El recorrido real de tu vuelo

_24 de octubre de 2026_

- **El mapa de lo que volaste** — Si tu avión transmite ADS-B, abrí el vuelo en la bitácora y vas a ver el recorrido real sobre el mapa, con la altura, la velocidad y las millas. Por ahora, en la zona de Buenos Aires.
- **Tu vuelo, reconocido al cargarlo** — Al registrar un vuelo, Vector te muestra lo que voló ese avión ese día, con sus horas en el aire. Elegís el tuyo y se cargan los aterrizajes.

## v2.29.0 — Buscar, practicar y planear sin señal

_23 de octubre de 2026_

- **Buscá en toda la app** — Con la lupa de arriba (o ⌘K en la compu) encontrás un vuelo por ruta o matrícula, un aeródromo o una pantalla, sin saber en qué sección está.
- **El plan de vuelo, sin señal** — Si en el aeródromo no hay señal, seguí armando el plan y bajá el PDF: lo que escribas queda en el teléfono y se sube solo cuando vuelve la red.
- **Practicá el examen de PPA** — Las 379 preguntas del banco de ANAC con su respuesta y sus figuras, por materia, con las que fallaste guardadas para repasar.

## v2.28.0 — Tu libro, más fácil de cargar y de pedir

_21 de octubre de 2026_

- **Tu libro de papel, con fotos** — Sacale una foto a cada hoja con el teléfono y Vector carga los vuelos. Los revisás antes de guardarlos.
- **Tu libro y tus horas, por WhatsApp** — Pedile al copiloto tu libro de vuelo en PDF, o el resumen de tus horas de un mes o del año, y te lo manda por el chat.
- **La autoridad, al registrar el vuelo** — El CAD pide quién certifica cada vuelo. Cargalo al registrarlo, con la última que usaste para esa finalidad ya propuesta, y al pasarlo al CAD ya está.

## v2.27.0 — Tus vuelos y el CAD de ANAC

_21 de octubre de 2026_

- **Pasá tus vuelos al CAD** — Con un marcador en tu navegador, Vector carga en el CAD los vuelos que te faltan, cada uno con su autoridad certificante, sin repetir los que ya están. Vector no ve tu contraseña de ANAC, y la declaración jurada la seguís haciendo vos.
- **Traé lo que ya declaraste** — Si tenés vuelos en el CAD que no están en Vector, desde el mismo marcador los pasás a tu bitácora con el desglose del libro. No se descuentan de tu saldo.

## v2.26.0 — Del plan de vuelo a la bitácora

_20 de octubre de 2026_

- **¿Ya volaste? Cargalo desde el plan** — Cuando pasa la llegada estimada de un plan que presentaste, el inicio te pregunta si volaste y te deja el formulario con el avión, la ruta y la fecha. Los horarios los ponés vos. Si todavía no lo cargaste, una hora y media después te llega un mail.
- **Meteo y NOTAM a la hora de tu vuelo** — En el plan ves el METAR, el TAF recortado a tu hora de salida y de llegada, y los NOTAM de cada aeródromo que caen en tu horario. Los que están vigentes pero en otro horario quedan aparte.
- **Cancelar el plan (CNL)** — Si no volás, la cancelación sale firmada a la misma oficina, con el formulario del Apéndice 5 de la AIP.

## v2.25.0 — El plan de vuelo, por mail desde Vector

_20 de octubre de 2026_

- **Mandá el plan a la oficina ARO/AIS** — Con el plan completo y firmado, Vector lo manda en PDF a la oficina, con la matrícula en el asunto y copia a vos; las respuestas te llegan a tu mail. Después, igual llamá para confirmar.
- **La demora, también por mail** — Escribí la nueva hora en UTC y la demora (DLA) sale firmada a la misma oficina. Para elegir la oficina te sugerimos las tres más cercanas a tu salida, con la distancia y si atienden a esa hora.

## v2.24.2 — La hora del plan, en UTC

_19 de octubre de 2026_

- **La EOBT se carga en UTC** — La fecha y la hora de salida del plan van en UTC, como en el formulario, con cuatro cifras (1830). Debajo te mostramos la hora argentina. La demora también va en UTC.

## v2.24.1 — La ruta, punto por punto

_19 de octubre de 2026_

- **La ruta del plan, en nodos** — La casilla 15 se ve como salida, puntos y destino, con las millas de cada tramo. Lo que Vector no conoce, como el sector escuela, queda marcado y va igual en el plan; la duración sugerida se calcula con el resto.

## v2.24.0 — Tus planes de vuelo, guardados

_19 de octubre de 2026_

- **Plan de vuelo, en su propia pestaña** — Tus planes quedan guardados y se duplican con un toque para el mismo vuelo otro día. La ruta se escribe libre (DCT SECTOR ESCUELA DCT), y Vector te sugiere la duración y la autonomía arriba de cada campo.
- **Cada avión, listo para el plan** — Cargá en el Hangar el equipo, el color y el operador de cada avión, y el formulario sale casi entero. Tu firma se guarda una vez para todos los planes.
- **Demoras y horario de la oficina** — Si salís más tarde, el formulario de demora sale del mismo plan. Y te decimos si la oficina ARO atiende a la hora de tu salida, según la AIP.

## v2.23.0 — El plan de vuelo, listo para mandar

_10 de octubre de 2026_

- **Tu plan de vuelo para EANA, desde el planificador** — Armá la ruta y Vector completa el formulario de EANA: ruta, velocidad, nivel, tiempo y autonomía. Marcá el equipo del avión, firmá con el dedo y mandá el PDF a la oficina ARO/AIS, con el mail y el teléfono a mano.
- **Tus horas, arriba de todo** — El inicio arranca por tus horas totales, con los últimos 30 días, PIC, noche, instrumentos, aterrizajes y vuelos. El camino a la próxima licencia sigue más abajo.

## v2.22.0 — Vector, también para quien recién empieza

_24 de septiembre de 2026_

- **Si sos alumno piloto, Vector también es para vos** — Elegí Alumno piloto como licencia en el Hangar: vas a ver tu camino a la PPA, un "¿Puedo volar hoy?" pensado para alumnos y una carga de vuelos más simple. Cuando rindas la PPA, cambiá la licencia y poné la fecha.
- **Tu WhatsApp, bien cargado** — Escribí tu celular como quieras —con 0, con 15 o con +54— y Vector lo guarda en la forma que reconoce el copiloto. Para cargarle vuelos con un audio, escribile al +1 (201) 586-7983.
- **Tu @ en la red, desde el primer día** — Elegir tu @ ahora es parte del alta, y arranca privado: tus horas sólo las ven los pilotos que aceptes, hasta que decidas otra cosa.

## v2.21.0 — Tu libro de vuelo, en PDF

_23 de septiembre de 2026_

- **Tu libro de vuelo en PDF, con la hoja de siempre** — En la Bitácora, Exportar arma tu libro para imprimir y que te lo firmen, con los totales de hoja en hoja. En el Hangar cargá tu Nº de licencia, tu legajo, la potencia de cada avión y cuántos renglones tiene tu libro. Si cerrás una hoja antes de tiempo, marcalo en el vuelo y sale tachada.
- **Festejá tus horas** — Cuando un vuelo te hace pasar las 50, 100 o 150 horas, la Bitácora te lo avisa, y contarlo en la Red es un toque: el texto ya viene escrito.
- **Avisos en tu teléfono** — Activalos en Actividad y enterate cuando te siguen, te aplauden o te comentan. En el iPhone llegan con Vector instalado en la pantalla de inicio.
- **Invitá a tus compañeros, y cuidá tu red** — Desde la Red mandales tu perfil: cuando se hacen la cuenta, Vector les ofrece seguirte. Y con el ··· de un perfil, una publicación o un comentario podés bloquear o reportar.

## v2.20.0 — La red, con fotos y tus vuelos

_22 de septiembre de 2026_

- **Publicá fotos y contá tus vuelos** — En Pilotos, la Red muestra lo que publican los pilotos que seguís. Escribí, subí hasta cuatro fotos y, si querés, sumá un vuelo de tu bitácora. Las fotos se guardan sin la ubicación del teléfono.
- **Compartí un vuelo en dos toques** — Cada vuelo de la Bitácora tiene Compartir, y al registrar uno te preguntamos si lo querés mostrar. Vos elegís si se ve la ruta, la duración, el avión o la fecha; la matrícula, nunca.
- **Aplausos, comentarios y tu Actividad** — Aplaudí y comentá lo que publican otros pilotos. En Actividad ves quién te sigue, te aplaude o te comenta, y aceptás las solicitudes si tu perfil es privado.
- **Los perfiles se abren adentro de Vector** — Tocando un piloto ves su perfil sin salir de la app, con sus horas y lo que publicó. Sumá tu foto en el Hangar: se ve en tu perfil, en tus publicaciones y en la vista previa de WhatsApp.

## v2.19.0 — Tu @, y la red de pilotos

_22 de septiembre de 2026_

- **Un perfil con tus horas, para mandar por WhatsApp** — Elegí tu @ en el Hangar y tenés un perfil en /u/tu.nombre con tus horas totales, PIC, de travesía, de noche y de instrumentos. Se abre sin tener cuenta, y la vista previa del link ya muestra tus horas. Nunca se publican vuelos, rutas, fechas ni aeronaves.
- **Buscá y seguí a otros pilotos** — La barra suma Pilotos: buscás por @ o por nombre y seguís. A un perfil público lo seguís directo; a uno privado le pedís permiso, y si el tuyo es privado, vos decidís a quién aceptar.

## v2.18.0 — Menos íconos, y un inicio que va al grano

_22 de septiembre de 2026_

- **La barra pasó de nueve íconos a cuatro** — Inicio, Bitácora, Balance y Preparar vuelo. Resumen, Calendario y Auditoría ahora son pestañas de la Bitácora; Aeropuertos, Clima y Herramientas, de Preparar vuelo. No se fue nada: todo sigue a un toque, agrupado donde se usa, y en el teléfono ya no hace falta abrir "Más".
- **El inicio contesta tres preguntas** — ¿Podés volar hoy?, ¿cuánto te falta para la comercial? y ¿cuánto te queda? Debajo del semáforo aparece el próximo vencimiento, y si llevás saldo con la escuela lo ves sin entrar a Balance. Los gráficos, el heatmap y tus métricas se mudaron al Resumen, y el clima a Preparar vuelo.
- **Registrar un vuelo es siempre la misma pantalla** — Antes a veces se abría como una ventana encima de lo que estabas mirando y a veces como página, y cerrarla fallaba de maneras distintas. Ahora es una sola página, con el formulario a lo ancho.
- **Y el gráfico de horas por mes dejó de perder meses** — Los días 29, 30 y 31 el gráfico podía repetir un mes y saltearse otro, según cuántos días tuviera cada uno. Ahora cuenta los meses sin mirar el día.

## v2.17.0 — Cargar un vuelo ya no dice que hubo un error cuando no lo hubo

_26 de agosto de 2026_

- **El formulario confirma que el vuelo se guardó, en vez de tirar un error** — Desde la PWA, guardar un vuelo pintaba un cartel rojo aunque el vuelo se hubiera cargado bien —vos lo veías en la bitácora, pero el formulario decía que había fallado—. Ahora se cierra solo y aparece un aviso con la ruta, las horas y la aeronave.
- **Y la app dejó de sentirse lenta al navegar** — El service worker esperaba a terminar de guardar la página entera en el teléfono antes de mostrártela, en cada navegación. Ahora te la muestra apenas llega y guarda la copia después, en segundo plano.

## v2.16.0 — El tracker ahora mide la PCA y la HVI juntas

_22 de agosto de 2026_

- **Las dos licencias en la misma card, porque casi nadie hace la PCA sola** — El camino normal acá es sacar la comercial y la habilitación por instrumentos como un solo tramo. El tracker mostraba sólo 61.620, y con los seis diales en verde podías estar a treinta horas de instrumentos del examen que en realidad vas a rendir. Ahora suma el requisito de la HVI: 40 horas de instrumentos, de las cuales hasta 20 pueden ser en simulador.
- **Y el dial de instrumentos dejó de decir que no volaste nada** — Cuando lo que te frenaba eran las horas de instrumentos, la proyección contestaba siempre "no volaste nada de eso en los últimos 3 meses" aunque las tuvieras cargadas. Ya proyecta con tu ritmo real.

## v2.15.0 — Vector sin señal, y los simuladores en el libro

_22 de agosto de 2026_

- **La app abre en la plataforma aunque no haya señal** — Instalala desde el navegador del celular y las pantallas que ya visitaste con conexión siguen abriendo sin ella, con un cartel que dice de cuándo es la foto que estás viendo. El planificador resuelve aeródromos, radioayudas y fixes con un catálogo que viaja adentro de la app: la ruta que armás sin señal da los mismos números que con señal.
- **Ahora todo dato meteorológico dice de cuándo es** — Debajo de cada METAR está la hora en que se observó, sacada del propio texto del reporte. Y pasadas las dos horas deja de mostrarse: un METAR viejo no es meteorología, es un texto viejo, y no alimenta ningún veredicto de ruta.
- **Los simuladores se cargan como en el libro de papel** — Marcá el equipo como simulador en el hangar y la sesión se anota igual que un vuelo —fecha, horarios, ruta— pero las horas van enteras a la columna de instrucción terrestre y no suman tiempo total. La ruta acepta escribir LOCAL, que no es un aeródromo, y no se cuenta ni como aterrizaje ni como destino visitado.

## v2.14.0 — Los 51 aeródromos controlados, con sus cartas

_19 de agosto de 2026_

- **Frecuencias, pistas y combustible de toda la red controlada** — Antes teníamos datos del AIP de ocho aeródromos; ahora de los 51 que ANAC publica con ficha, Morón incluido. Salen del documento oficial y cada número está verificado contra el PDF en las dos direcciones: nada que no esté publicado, y nada publicado que falte.
- **Las cartas oficiales, en la ficha** — El plano de aeródromo y la carta de aproximación de cada uno, con su edición y desde cuándo rige, sin salir a buscarlas al sitio de ANAC. Son 246 documentos.
- **Y corregimos el largo de nueve pistas** — Cruzando el AIP con la base que usábamos aparecieron nueve pistas mal medidas. Morón figuraba con 2850 m y mide 2303; San Fernando con 1801 y mide 1690. Donde ANAC publica la medida, ahora manda ANAC.

## v2.13.0 — La ruta se reordena, y los puntos entran donde quieras

_19 de agosto de 2026_

- **Meté un punto en el medio sin borrar nada** — Entre cada par de puntos ahora hay un "Punto acá": el punto nuevo entra ahí y no al final. Antes, para agregar una escala en el medio había que borrar todo lo que venía después y volver a escribirlo.
- **Y se puede subir y bajar** — Cada punto tiene flechas para moverlo de lugar. Si la ruta tiene una aerovía, se mueve entera con su punto de salida — no se puede partir al medio ni dejarla sin el punto por donde entrás.

## v2.12.1 — Rutas por aerovía, eligiendo en vez de escribiendo

_19 de agosto de 2026_

- **"Ir por aerovía", abajo de cada punto** — Debajo de cada punto de la ruta aparece un botón que te ofrece las aerovías que pasan por ahí y hasta dónde llega cada una. Elegís las dos cosas de una lista: no hay que saberse ninguna de memoria ni tener la carta al lado. La aerovía queda como una franja entre los dos puntos, y si cambiás el destino se recalcula sola en vez de dejarte once campos sueltos para borrar a mano.
- **220 aerovías, y las que no verificamos no aparecen** — Salen del ENR 3 del AIP y cada secuencia se contrasta contra el ENR 4.4: si a una le falta un punto, no la publicamos. Una aerovía incompleta daría una travesía más corta que la real y con pinta de válida. De la aerovía se usa sólo por dónde pasa: los niveles y la clase de espacio aéreo hay que consultarlos aparte.

## v2.11.0 — Los puntos de aerovía, en el planificador

_19 de agosto de 2026_

- **Los 1018 puntos significativos del AIP** — Escribí DORVO, AKNOS o cualquiera de los cinco letras que canta el control y entra en la ruta como un punto más, con su tramo, su rumbo y su tiempo. Te muestra a qué aerovías pertenece y de qué edición del AIP salió — se enmienda cada 28 días.

## v2.10.1 — Las frecuencias de los aeródromos controlados estaban mal

_19 de agosto de 2026_

- **Corregimos las frecuencias, las pistas y el combustible** — De los ocho aeródromos controlados que mostrábamos —Aeroparque, Ezeiza, San Fernando, El Palomar, Córdoba, Rosario, Mar del Plata y Bariloche— casi todos los datos estaban equivocados: la torre de San Fernando figuraba en 118.45 y son 119.00 y 120.05, El Palomar tenía la pista 17/35 anotada como 16/34, y Ezeiza aparecía con AVGAS cuando sólo hay JET A-1. Ahora salen del AIP de ANAC, con la fecha de vigencia a la vista. Si planificaste con esos números, revisalos.
- **Y ahora se puede verificar** — Cada frecuencia y cada medida que ves de esos aeródromos tiene que aparecer en el PDF oficial de ANAC, y hay una prueba automática que lo comprueba en cada cambio. Los teléfonos de esos ocho se sacaron: no teníamos de dónde confirmarlos.

## v2.10.0 — Un punto de la ruta ya no tiene que ser un aeródromo

_19 de agosto de 2026_

- **Puntos por radial y distancia** — Escribí BAR/045/25 y el planificador lo toma como punto: 25 NM en el radial 045 del VOR de Bariloche. Usa la variación con la que está alineada la estación, que no es la de hoy ni la del aeródromo, y te dice qué frecuencia sintonizar.
- **Tus propios puntos visuales** — El pueblo, el cruce de rutas, la laguna: si tenés la coordenada, escribila como S34.68/W58.64 y entra en la ruta como un punto más, con su tramo, su rumbo y su tiempo.
- **Las radioayudas del país** — 96 estaciones —VOR, VOR-DME y los NDB que no se confunden con otro— con su frecuencia y su posición, para poder apoyar la ruta en ellas.

## v2.9.0 — Todo el preflight en una sola pantalla

_19 de agosto de 2026_

- **Planificador de vuelo** — Cargá la ruta y te arma la planilla de navegación mientras escribís: rumbos, tiempos y combustible por tramo, con el viento del METAR de salida y la variación magnética de tu aeródromo. Se imprime y se comparte con el link.
- **Performance de tus aeronaves** — Cargá una vez la velocidad de crucero, el consumo y el tanque de cada avión, y el planificador deja de estimar para calcular con tus números.
- **Briefing y planificación en la misma pantalla** — El planificador ahora trae también el METAR, el TAF y los NOTAM de cada punto, el viento cruzado sobre la pista y la densidad de altitud. Y podés tomar el viento del modelo en altura en vez del de superficie, que a 10.000 ft puede cambiar el tiempo de un tramo diez minutos.
- **La sesión dejó de caerse** — Vector te echaba más o menos cada hora, sin aviso y sin motivo aparente. Ahora se renueva sola y aguanta treinta días.

## v2.7.0 — ¡Tu bitácora Vector sigue sumando herramientas!

_10 de agosto de 2026_

- **¿Podés volar hoy?** — Vector junta tu certificado médico, tu repaso de vuelo y tu experiencia reciente, y te dice qué podés hacer — citando la sección de la RAAC 61.
- **Tus propias métricas** — Armá los números que querés seguir —horas en una aeronave, aterrizajes en un aeródromo, lo que sea— y aparecen en tu dashboard.
