/**
 * Las novedades de Vector, como datos.
 *
 * ## Por qué esto existe
 *
 * Antes vivían adentro de `ChangelogNotice.tsx`: el número de versión escrito a mano en
 * una constante, y el contenido en JSX. Dos consecuencias, las dos malas.
 *
 * La primera es que había **dos fuentes de verdad** para la versión —`package.json` y el
 * componente— y sólo coincidían por disciplina.
 *
 * La segunda es peor y ya había pasado: **la tarjeta quedó diez features atrasada.**
 * Anunciaba "¿Podés volar hoy?" y "Tus propias métricas" mientras se habían publicado
 * los costos por vuelo, el calendario, la tarjeta compartible, los vencimientos
 * variables, el planificador de navegación y el arreglo de la sesión. Un piloto que
 * entraba veía las novedades de tres semanas antes. Agregar una feature no puede
 * significar acordarse de editar un componente.
 *
 * Como esto es un `.ts` puro, **se testea** — que es la única forma de que no vuelva a
 * mentir. Ver `changelog.test.ts`: la versión más nueva de acá tiene que ser la de
 * `package.json`, y cada `href` tiene que apuntar a una pantalla que exista de verdad.
 *
 * ## Qué va acá y qué no
 *
 * Sólo lo que el piloto **ve**. La higiene interna —tests, refactors, timeouts, la
 * columna de variación magnética— importa muchísimo y no es una novedad que alguien
 * quiera leer en su dashboard. Eso vive en la bitácora, `docs/bitacora/`.
 */

/**
 * Los íconos se nombran, no se importan.
 *
 * Este archivo corre en los tests con `environment: "node"`, así que no puede traer
 * componentes de React. El componente mapea el nombre a un ícono de lucide con un
 * `Record<NombreIcono, …>`, y **TypeScript obliga a que estén todos**: si alguien
 * agrega un nombre acá y se olvida del ícono, no compila.
 */
export type NombreIcono =
  | "brujula"
  | "avion"
  | "nube"
  | "llave"
  | "billetera"
  | "calendario"
  | "compartir"
  | "reloj"
  | "lupa"
  | "grafico"
  | "camara"
  | "conversacion"
  | "libro"
  | "campana"
  | "festejo";

export interface Novedad {
  icono: NombreIcono;
  titulo: string;
  /** Una o dos frases. Qué cambió para el piloto, no cómo se implementó. */
  texto: string;
  /** Ruta interna. El test comprueba que la pantalla exista. */
  href?: string;
  /** Texto del link. Sin `href` no se usa. */
  cta?: string;
}

export interface VersionPublicada {
  /** Sin la "v": "2.8.0". */
  version: string;
  /** ISO, `YYYY-MM-DD`. */
  fecha: string;
  titulo: string;
  novedades: Novedad[];
}

/**
 * De la más nueva a la más vieja. El orden lo verifica un test — la tarjeta muestra
 * `CHANGELOG[0]` y nada más, así que una entrada fuera de orden anunciaría lo viejo.
 */
export const CHANGELOG: VersionPublicada[] = [
  {
    version: "2.37.0",
    fecha: "2026-11-01",
    titulo: "Mostrá por dónde volaste",
    novedades: [
      {
        icono: "compartir",
        titulo: "La imagen de tu recorrido",
        texto: "Abrí un vuelo con recorrido real y tocá \"Compartir la imagen\": el mapa con tu recorrido coloreado por altura, el tiempo en el aire, las millas, la altura y la velocidad máximas, listo para mandar. Nunca lleva la matrícula.",
        href: "/dashboard/history",
        cta: "Ver mis vuelos",
      },
      {
        icono: "avion",
        titulo: "El recorrido en tus publicaciones",
        texto: "Al compartir un vuelo en la red, prendé \"Recorrido\" y la publicación muestra por dónde volaste, en lugar de una línea recta. Sale sólo la forma, sin horarios.",
        href: "/dashboard/pilotos/publicar",
        cta: "Publicar",
      },
    ],
  },
  {
    version: "2.36.0",
    fecha: "2026-10-29",
    titulo: "Tu CAD, desde Vector",
    novedades: [
      {
        icono: "llave",
        titulo: "Pasá tus vuelos desde Vector",
        texto: "Con la extensión de Vector, abrí el CAD en otra pestaña y volvé a Vector: \"Pasar al CAD\" se conecta solo y ahí ves qué falta, qué está y qué hay que corregir. Con el marcador, tocalo en el CAD y se abre Vector. Los pedidos salen de tu navegador, con tu sesión del CAD.",
        href: "/dashboard/history/cad",
        cta: "Ver Pasar al CAD",
      },
      {
        icono: "reloj",
        titulo: "De cuándo es lo que ves de tu CAD",
        texto: "La Bitácora y el inicio dicen cuándo se leyó tu CAD por última vez, y te avisan si pasaron más de tres días para que lo actualices.",
        href: "/dashboard/history",
        cta: "Ver la Bitácora",
      },
    ],
  },
  {
    version: "2.35.0",
    fecha: "2026-10-29",
    titulo: "Pasar al CAD con la extensión de Vector",
    novedades: [
      {
        icono: "llave",
        titulo: "Un botón de Vector adentro del CAD",
        texto: "Instalá la extensión de Vector en Chrome y vas a tener un botón \"Pasar con Vector\" en el CAD: cargás tus vuelos desde tu propia sesión, sin marcador y sin que Vector vea tu contraseña. Conectar tu cuenta de ANAC queda en pausa por ahora.",
        href: "/dashboard/history/cad",
        cta: "Ver Pasar al CAD",
      },
    ],
  },
  {
    version: "2.34.0",
    fecha: "2026-10-28",
    titulo: "Tu CAD, al día solo",
    novedades: [
      {
        icono: "reloj",
        titulo: "Vector y tu CAD dicen lo mismo",
        texto: "Con tu cuenta de ANAC conectada, Vector revisa tu CAD solo una vez por día: anota lo que cargaste a mano, devuelve a la lista lo que borraste y te avisa qué vuelos esperan tu declaración jurada.",
        href: "/dashboard/history/cad",
        cta: "Ver Pasar al CAD",
      },
    ],
  },
  {
    version: "2.33.0",
    fecha: "2026-10-28",
    titulo: "Tu CAD desde Vector",
    novedades: [
      {
        icono: "llave",
        titulo: "Pasá tus vuelos al CAD desde Vector",
        texto: "Conectá tu cuenta de ANAC una vez y cargá tus vuelos en el CAD desde acá, también desde el teléfono. Si preferís que tu contraseña no pase por Vector, sigue estando el marcador.",
        href: "/dashboard/history/cad",
        cta: "Conectar mi CAD",
      },
      {
        icono: "avion",
        titulo: "Cargalo y ya queda en el CAD",
        texto: "Con tu cuenta conectada, al registrar un vuelo tildás \"Cargarlo también en tu CAD\" y queda Pendiente de DDJJ. La declaración la seguís haciendo vos.",
        href: "/dashboard/log-flight",
        cta: "Registrar un vuelo",
      },
      {
        icono: "brujula",
        titulo: "Simuladores y LAD, también al CAD",
        texto: "Las sesiones de simulador pasan al CAD: elegís una vez cuál es tu simulador y su clase. Y los vuelos desde un LAD se registran buscándolo por número o nombre, y pasan con su número.",
        href: "/dashboard/history/cad",
        cta: "Ver Pasar al CAD",
      },
    ],
  },
  {
    version: "2.32.0",
    fecha: "2026-10-28",
    titulo: "Los LAD en el plan de vuelo",
    novedades: [
      {
        icono: "brujula",
        titulo: "Salí o llegá a un LAD",
        texto: "En el plan de vuelo, buscá un LAD por su número o por su nombre y aparece como LAD2013. Cargás sus coordenadas y Vector arma la casilla 18 como pide EANA.",
        href: "/dashboard/plan-de-vuelo",
        cta: "Armar un plan",
      },
    ],
  },
  {
    version: "2.31.0",
    fecha: "2026-10-26",
    titulo: "Tu firma en el libro y la RAAC en el copiloto",
    novedades: [
      {
        icono: "libro",
        titulo: "El libro en PDF, firmado",
        texto: "Exportá el libro con la firma que guardaste en el plan de vuelo, ya puesta en cada hoja. También sigue estando sin firma, para firmarlo a mano.",
        href: "/dashboard/history",
        cta: "Exportar mi libro",
      },
      {
        icono: "conversacion",
        titulo: "Preguntale a la RAAC",
        texto: "Preguntale al copiloto por licencias, CMA, experiencia reciente o requisitos de horas: contesta con el texto de la RAAC 61 vigente y te cita la sección. Si no está ahí, te lo dice.",
      },
    ],
  },
  {
    version: "2.30.0",
    fecha: "2026-10-24",
    titulo: "El recorrido real de tu vuelo",
    novedades: [
      {
        icono: "brujula",
        titulo: "El mapa de lo que volaste",
        texto: "Si tu avión transmite ADS-B, abrí el vuelo en la bitácora y vas a ver el recorrido real sobre el mapa, con la altura, la velocidad y las millas. Por ahora, en la zona de Buenos Aires.",
        href: "/dashboard/history",
        cta: "Ver mis vuelos",
      },
      {
        icono: "reloj",
        titulo: "Tu vuelo, reconocido al cargarlo",
        texto: "Al registrar un vuelo, Vector te muestra lo que voló ese avión ese día, con sus horas en el aire. Elegís el tuyo y se cargan los aterrizajes.",
        href: "/dashboard/log-flight",
        cta: "Registrar un vuelo",
      },
    ],
  },
  {
    version: "2.29.0",
    fecha: "2026-10-23",
    titulo: "Buscar, practicar y planear sin señal",
    novedades: [
      {
        icono: "lupa",
        titulo: "Buscá en toda la app",
        texto: "Con la lupa de arriba (o ⌘K en la compu) encontrás un vuelo por ruta o matrícula, un aeródromo o una pantalla, sin saber en qué sección está.",
      },
      {
        icono: "nube",
        titulo: "El plan de vuelo, sin señal",
        texto: "Si en el aeródromo no hay señal, seguí armando el plan y bajá el PDF: lo que escribas queda en el teléfono y se sube solo cuando vuelve la red.",
        href: "/dashboard/plan-de-vuelo",
        cta: "Ver mis planes",
      },
      {
        icono: "libro",
        titulo: "Practicá el examen de PPA",
        texto: "Las 379 preguntas del banco de ANAC con su respuesta y sus figuras, por materia, con las que fallaste guardadas para repasar.",
        href: "/guias/examen-ppa",
        cta: "Practicar",
      },
    ],
  },
  {
    version: "2.28.0",
    fecha: "2026-10-21",
    titulo: "Tu libro, más fácil de cargar y de pedir",
    novedades: [
      {
        icono: "camara",
        titulo: "Tu libro de papel, con fotos",
        texto: "Sacale una foto a cada hoja con el teléfono y Vector carga los vuelos. Los revisás antes de guardarlos.",
        href: "/dashboard/log-flight/import",
        cta: "Importar mi libro",
      },
      {
        icono: "conversacion",
        titulo: "Tu libro y tus horas, por WhatsApp",
        texto: "Pedile al copiloto tu libro de vuelo en PDF, o el resumen de tus horas de un mes o del año, y te lo manda por el chat.",
      },
      {
        icono: "libro",
        titulo: "La autoridad, al registrar el vuelo",
        texto: "El CAD pide quién certifica cada vuelo. Cargalo al registrarlo, con la última que usaste para esa finalidad ya propuesta, y al pasarlo al CAD ya está.",
        href: "/dashboard/log-flight",
        cta: "Registrar un vuelo",
      },
    ],
  },
  {
    version: "2.27.0",
    fecha: "2026-10-21",
    titulo: "Tus vuelos y el CAD de ANAC",
    novedades: [
      {
        icono: "compartir",
        titulo: "Pasá tus vuelos al CAD",
        texto:
          "Con un marcador en tu navegador, Vector carga en el CAD los vuelos que te faltan, cada uno con su autoridad certificante, sin repetir los que ya están. Vector no ve tu contraseña de ANAC, y la declaración jurada la seguís haciendo vos.",
        href: "/dashboard/history/cad",
        cta: "Ver cómo se hace",
      },
      {
        icono: "libro",
        titulo: "Traé lo que ya declaraste",
        texto:
          "Si tenés vuelos en el CAD que no están en Vector, desde el mismo marcador los pasás a tu bitácora con el desglose del libro. No se descuentan de tu saldo.",
        href: "/dashboard/history/cad",
        cta: "Ver cómo se hace",
      },
    ],
  },
  {
    version: "2.26.0",
    fecha: "2026-10-20",
    titulo: "Del plan de vuelo a la bitácora",
    novedades: [
      {
        icono: "avion",
        titulo: "¿Ya volaste? Cargalo desde el plan",
        texto:
          "Cuando pasa la llegada estimada de un plan que presentaste, el inicio te pregunta si volaste y te deja el formulario con el avión, la ruta y la fecha. Los horarios los ponés vos. Si todavía no lo cargaste, una hora y media después te llega un mail.",
        href: "/dashboard/plan-de-vuelo",
        cta: "Ver Plan de vuelo",
      },
      {
        icono: "nube",
        titulo: "Meteo y NOTAM a la hora de tu vuelo",
        texto:
          "En el plan ves el METAR, el TAF recortado a tu hora de salida y de llegada, y los NOTAM de cada aeródromo que caen en tu horario. Los que están vigentes pero en otro horario quedan aparte.",
        href: "/dashboard/plan-de-vuelo",
        cta: "Ver Plan de vuelo",
      },
      {
        icono: "reloj",
        titulo: "Cancelar el plan (CNL)",
        texto: "Si no volás, la cancelación sale firmada a la misma oficina, con el formulario del Apéndice 5 de la AIP.",
        href: "/dashboard/plan-de-vuelo",
        cta: "Ver Plan de vuelo",
      },
    ],
  },
  {
    version: "2.25.0",
    fecha: "2026-10-20",
    titulo: "El plan de vuelo, por mail desde Vector",
    novedades: [
      {
        icono: "brujula",
        titulo: "Mandá el plan a la oficina ARO/AIS",
        texto:
          "Con el plan completo y firmado, Vector lo manda en PDF a la oficina, con la matrícula en el asunto y copia a vos; las respuestas te llegan a tu mail. Después, igual llamá para confirmar.",
        href: "/dashboard/plan-de-vuelo",
        cta: "Ver Plan de vuelo",
      },
      {
        icono: "reloj",
        titulo: "La demora, también por mail",
        texto:
          "Escribí la nueva hora en UTC y la demora (DLA) sale firmada a la misma oficina. Para elegir la oficina te sugerimos las tres más cercanas a tu salida, con la distancia y si atienden a esa hora.",
        href: "/dashboard/plan-de-vuelo",
        cta: "Ver Plan de vuelo",
      },
    ],
  },
  {
    version: "2.24.2",
    fecha: "2026-10-19",
    titulo: "La hora del plan, en UTC",
    novedades: [
      {
        icono: "reloj",
        titulo: "La EOBT se carga en UTC",
        texto:
          "La fecha y la hora de salida del plan van en UTC, como en el formulario, con cuatro cifras (1830). Debajo te mostramos la hora argentina. La demora también va en UTC.",
        href: "/dashboard/plan-de-vuelo",
        cta: "Ver Plan de vuelo",
      },
    ],
  },
  {
    version: "2.24.1",
    fecha: "2026-10-19",
    titulo: "La ruta, punto por punto",
    novedades: [
      {
        icono: "brujula",
        titulo: "La ruta del plan, en nodos",
        texto:
          "La casilla 15 se ve como salida, puntos y destino, con las millas de cada tramo. Lo que Vector no conoce, como el sector escuela, queda marcado y va igual en el plan; la duración sugerida se calcula con el resto.",
        href: "/dashboard/plan-de-vuelo",
        cta: "Ver Plan de vuelo",
      },
    ],
  },
  {
    version: "2.24.0",
    fecha: "2026-10-19",
    titulo: "Tus planes de vuelo, guardados",
    novedades: [
      {
        icono: "brujula",
        titulo: "Plan de vuelo, en su propia pestaña",
        texto:
          "Tus planes quedan guardados y se duplican con un toque para el mismo vuelo otro día. La ruta se escribe libre (DCT SECTOR ESCUELA DCT), y Vector te sugiere la duración y la autonomía arriba de cada campo.",
        href: "/dashboard/plan-de-vuelo",
        cta: "Ver Plan de vuelo",
      },
      {
        icono: "avion",
        titulo: "Cada avión, listo para el plan",
        texto:
          "Cargá en el Hangar el equipo, el color y el operador de cada avión, y el formulario sale casi entero. Tu firma se guarda una vez para todos los planes.",
        href: "/dashboard/settings",
        cta: "Ir al Hangar",
      },
      {
        icono: "reloj",
        titulo: "Demoras y horario de la oficina",
        texto:
          "Si salís más tarde, el formulario de demora sale del mismo plan. Y te decimos si la oficina ARO atiende a la hora de tu salida, según la AIP.",
        href: "/dashboard/plan-de-vuelo",
        cta: "Ver Plan de vuelo",
      },
    ],
  },
  {
    version: "2.23.0",
    fecha: "2026-10-10",
    titulo: "El plan de vuelo, listo para mandar",
    novedades: [
      {
        icono: "brujula",
        titulo: "Tu plan de vuelo para EANA, desde el planificador",
        texto:
          "Armá la ruta y Vector completa el formulario de EANA: ruta, velocidad, nivel, tiempo y autonomía. Marcá el equipo del avión, firmá con el dedo y mandá el PDF a la oficina ARO/AIS, con el mail y el teléfono a mano.",
        href: "/dashboard/planificador",
        cta: "Ir al planificador",
      },
      {
        icono: "reloj",
        titulo: "Tus horas, arriba de todo",
        texto:
          "El inicio arranca por tus horas totales, con los últimos 30 días, PIC, noche, instrumentos, aterrizajes y vuelos. El camino a la próxima licencia sigue más abajo.",
        href: "/dashboard",
        cta: "Ver el inicio",
      },
    ],
  },
  {
    version: "2.22.0",
    fecha: "2026-09-24",
    titulo: "Vector, también para quien recién empieza",
    novedades: [
      {
        icono: "avion",
        titulo: "Si sos alumno piloto, Vector también es para vos",
        texto:
          "Elegí Alumno piloto como licencia en el Hangar: vas a ver tu camino a la PPA, un \"¿Puedo volar hoy?\" pensado para alumnos y una carga de vuelos más simple. Cuando rindas la PPA, cambiá la licencia y poné la fecha.",
        href: "/dashboard/settings",
        cta: "Ir al Hangar",
      },
      {
        icono: "conversacion",
        titulo: "Tu WhatsApp, bien cargado",
        texto:
          "Escribí tu celular como quieras —con 0, con 15 o con +54— y Vector lo guarda en la forma que reconoce el copiloto. Para cargarle vuelos con un audio, escribile al +1 (201) 586-7983.",
        href: "/dashboard/settings",
        cta: "Ir al Hangar",
      },
      {
        icono: "brujula",
        titulo: "Tu @ en la red, desde el primer día",
        texto:
          "Elegir tu @ ahora es parte del alta, y arranca privado: tus horas sólo las ven los pilotos que aceptes, hasta que decidas otra cosa.",
        href: "/dashboard/pilotos",
        cta: "Ir a la Red",
      },
    ],
  },
  {
    version: "2.21.0",
    fecha: "2026-09-23",
    titulo: "Tu libro de vuelo, en PDF",
    novedades: [
      {
        icono: "libro",
        titulo: "Tu libro de vuelo en PDF, con la hoja de siempre",
        texto:
          "En la Bitácora, Exportar arma tu libro para imprimir y que te lo firmen, con los totales de hoja en hoja. En el Hangar cargá tu Nº de licencia, tu legajo, la potencia de cada avión y cuántos renglones tiene tu libro. Si cerrás una hoja antes de tiempo, marcalo en el vuelo y sale tachada.",
        href: "/dashboard/history",
        cta: "Ver la Bitácora",
      },
      {
        icono: "festejo",
        titulo: "Festejá tus horas",
        texto:
          "Cuando un vuelo te hace pasar las 50, 100 o 150 horas, la Bitácora te lo avisa, y contarlo en la Red es un toque: el texto ya viene escrito.",
        href: "/dashboard/history",
        cta: "Ver la Bitácora",
      },
      {
        icono: "campana",
        titulo: "Avisos en tu teléfono",
        texto:
          "Activalos en Actividad y enterate cuando te siguen, te aplauden o te comentan. En el iPhone llegan con Vector instalado en la pantalla de inicio.",
        href: "/dashboard/pilotos/actividad",
        cta: "Ir a Actividad",
      },
      {
        icono: "compartir",
        titulo: "Invitá a tus compañeros, y cuidá tu red",
        texto:
          "Desde la Red mandales tu perfil: cuando se hacen la cuenta, Vector les ofrece seguirte. Y con el ··· de un perfil, una publicación o un comentario podés bloquear o reportar.",
        href: "/dashboard/pilotos",
        cta: "Ir a la Red",
      },
    ],
  },
  {
    version: "2.20.0",
    fecha: "2026-09-22",
    titulo: "La red, con fotos y tus vuelos",
    novedades: [
      {
        icono: "camara",
        titulo: "Publicá fotos y contá tus vuelos",
        texto:
          "En Pilotos, la Red muestra lo que publican los pilotos que seguís. Escribí, subí hasta cuatro fotos y, si querés, sumá un vuelo de tu bitácora. Las fotos se guardan sin la ubicación del teléfono.",
        href: "/dashboard/pilotos",
        cta: "Ir a la Red",
      },
      {
        icono: "compartir",
        titulo: "Compartí un vuelo en dos toques",
        texto:
          "Cada vuelo de la Bitácora tiene Compartir, y al registrar uno te preguntamos si lo querés mostrar. Vos elegís si se ve la ruta, la duración, el avión o la fecha; la matrícula, nunca.",
        href: "/dashboard/history",
        cta: "Ver la Bitácora",
      },
      {
        icono: "conversacion",
        titulo: "Aplausos, comentarios y tu Actividad",
        texto:
          "Aplaudí y comentá lo que publican otros pilotos. En Actividad ves quién te sigue, te aplaude o te comenta, y aceptás las solicitudes si tu perfil es privado.",
        href: "/dashboard/pilotos/actividad",
        cta: "Ver mi actividad",
      },
      {
        icono: "brujula",
        titulo: "Los perfiles se abren adentro de Vector",
        texto:
          "Tocando un piloto ves su perfil sin salir de la app, con sus horas y lo que publicó. Sumá tu foto en el Hangar: se ve en tu perfil, en tus publicaciones y en la vista previa de WhatsApp.",
        href: "/dashboard/settings",
        cta: "Subir mi foto",
      },
    ],
  },
  {
    version: "2.19.0",
    fecha: "2026-09-22",
    titulo: "Tu @, y la red de pilotos",
    novedades: [
      {
        icono: "compartir",
        titulo: "Un perfil con tus horas, para mandar por WhatsApp",
        texto:
          "Elegí tu @ en el Hangar y tenés un perfil en /u/tu.nombre con tus horas totales, PIC, de travesía, de noche y de instrumentos. Se abre sin tener cuenta, y la vista previa del link ya muestra tus horas. Nunca se publican vuelos, rutas, fechas ni aeronaves.",
        href: "/dashboard/settings",
        cta: "Elegir mi @",
      },
      {
        icono: "lupa",
        titulo: "Buscá y seguí a otros pilotos",
        texto:
          "La barra suma Pilotos: buscás por @ o por nombre y seguís. A un perfil público lo seguís directo; a uno privado le pedís permiso, y si el tuyo es privado, vos decidís a quién aceptar.",
        href: "/dashboard/pilotos",
        cta: "Ir a Pilotos",
      },
    ],
  },
  {
    version: "2.18.0",
    fecha: "2026-09-22",
    titulo: "Menos íconos, y un inicio que va al grano",
    novedades: [
      {
        icono: "brujula",
        titulo: "La barra pasó de nueve íconos a cuatro",
        texto:
          "Inicio, Bitácora, Balance y Preparar vuelo. Resumen, Calendario y Auditoría ahora son pestañas de la Bitácora; Aeropuertos, Clima y Herramientas, de Preparar vuelo. No se fue nada: todo sigue a un toque, agrupado donde se usa, y en el teléfono ya no hace falta abrir \"Más\".",
        href: "/dashboard/history",
        cta: "Ver la Bitácora",
      },
      {
        icono: "avion",
        titulo: "El inicio contesta tres preguntas",
        texto:
          "¿Podés volar hoy?, ¿cuánto te falta para la comercial? y ¿cuánto te queda? Debajo del semáforo aparece el próximo vencimiento, y si llevás saldo con la escuela lo ves sin entrar a Balance. Los gráficos, el heatmap y tus métricas se mudaron al Resumen, y el clima a Preparar vuelo.",
        href: "/dashboard/summary",
        cta: "Ir al Resumen",
      },
      {
        icono: "llave",
        titulo: "Registrar un vuelo es siempre la misma pantalla",
        texto:
          "Antes a veces se abría como una ventana encima de lo que estabas mirando y a veces como página, y cerrarla fallaba de maneras distintas. Ahora es una sola página, con el formulario a lo ancho.",
      },
      {
        icono: "reloj",
        titulo: "Y el gráfico de horas por mes dejó de perder meses",
        texto:
          "Los días 29, 30 y 31 el gráfico podía repetir un mes y saltearse otro, según cuántos días tuviera cada uno. Ahora cuenta los meses sin mirar el día.",
      },
    ],
  },
  {
    version: "2.17.0",
    fecha: "2026-08-26",
    titulo: "Cargar un vuelo ya no dice que hubo un error cuando no lo hubo",
    novedades: [
      {
        icono: "avion",
        titulo: "El formulario confirma que el vuelo se guardó, en vez de tirar un error",
        texto:
          "Desde la PWA, guardar un vuelo pintaba un cartel rojo aunque el vuelo se hubiera cargado bien —vos lo veías en la bitácora, pero el formulario decía que había fallado—. Ahora se cierra solo y aparece un aviso con la ruta, las horas y la aeronave.",
      },
      {
        icono: "reloj",
        titulo: "Y la app dejó de sentirse lenta al navegar",
        texto:
          "El service worker esperaba a terminar de guardar la página entera en el teléfono antes de mostrártela, en cada navegación. Ahora te la muestra apenas llega y guarda la copia después, en segundo plano.",
      },
    ],
  },
  {
    version: "2.16.0",
    fecha: "2026-08-22",
    titulo: "El tracker ahora mide la PCA y la HVI juntas",
    novedades: [
      {
        icono: "grafico",
        titulo: "Las dos licencias en la misma card, porque casi nadie hace la PCA sola",
        texto:
          "El camino normal acá es sacar la comercial y la habilitación por instrumentos como un solo tramo. El tracker mostraba sólo 61.620, y con los seis diales en verde podías estar a treinta horas de instrumentos del examen que en realidad vas a rendir. Ahora suma el requisito de la HVI: 40 horas de instrumentos, de las cuales hasta 20 pueden ser en simulador.",
        href: "/dashboard",
        cta: "Ver el tracker",
      },
      {
        icono: "reloj",
        titulo: "Y el dial de instrumentos dejó de decir que no volaste nada",
        texto:
          "Cuando lo que te frenaba eran las horas de instrumentos, la proyección contestaba siempre \"no volaste nada de eso en los últimos 3 meses\" aunque las tuvieras cargadas. Ya proyecta con tu ritmo real.",
      },
    ],
  },
  {
    version: "2.15.0",
    fecha: "2026-08-22",
    titulo: "Vector sin señal, y los simuladores en el libro",
    novedades: [
      {
        icono: "nube",
        titulo: "La app abre en la plataforma aunque no haya señal",
        texto:
          "Instalala desde el navegador del celular y las pantallas que ya visitaste con conexión siguen abriendo sin ella, con un cartel que dice de cuándo es la foto que estás viendo. El planificador resuelve aeródromos, radioayudas y fixes con un catálogo que viaja adentro de la app: la ruta que armás sin señal da los mismos números que con señal.",
        href: "/dashboard/planificador",
        cta: "Abrir el planificador",
      },
      {
        icono: "reloj",
        titulo: "Ahora todo dato meteorológico dice de cuándo es",
        texto:
          "Debajo de cada METAR está la hora en que se observó, sacada del propio texto del reporte. Y pasadas las dos horas deja de mostrarse: un METAR viejo no es meteorología, es un texto viejo, y no alimenta ningún veredicto de ruta.",
      },
      {
        icono: "avion",
        titulo: "Los simuladores se cargan como en el libro de papel",
        texto:
          "Marcá el equipo como simulador en el hangar y la sesión se anota igual que un vuelo —fecha, horarios, ruta— pero las horas van enteras a la columna de instrucción terrestre y no suman tiempo total. La ruta acepta escribir LOCAL, que no es un aeródromo, y no se cuenta ni como aterrizaje ni como destino visitado.",
        href: "/dashboard/settings",
        cta: "Marcar un simulador",
      },
    ],
  },
  {
    version: "2.14.0",
    fecha: "2026-08-19",
    titulo: "Los 51 aeródromos controlados, con sus cartas",
    novedades: [
      {
        icono: "nube",
        titulo: "Frecuencias, pistas y combustible de toda la red controlada",
        texto:
          "Antes teníamos datos del AIP de ocho aeródromos; ahora de los 51 que ANAC publica con ficha, Morón incluido. Salen del documento oficial y cada número está verificado contra el PDF en las dos direcciones: nada que no esté publicado, y nada publicado que falte.",
        href: "/dashboard/airports",
        cta: "Buscar un aeródromo",
      },
      {
        icono: "compartir",
        titulo: "Las cartas oficiales, en la ficha",
        texto:
          "El plano de aeródromo y la carta de aproximación de cada uno, con su edición y desde cuándo rige, sin salir a buscarlas al sitio de ANAC. Son 246 documentos.",
        href: "/dashboard/airports",
        cta: "Ver las cartas",
      },
      {
        icono: "reloj",
        titulo: "Y corregimos el largo de nueve pistas",
        texto:
          "Cruzando el AIP con la base que usábamos aparecieron nueve pistas mal medidas. Morón figuraba con 2850 m y mide 2303; San Fernando con 1801 y mide 1690. Donde ANAC publica la medida, ahora manda ANAC.",
      },
    ],
  },
  {
    version: "2.13.0",
    fecha: "2026-08-19",
    titulo: "La ruta se reordena, y los puntos entran donde quieras",
    novedades: [
      {
        icono: "brujula",
        titulo: "Meté un punto en el medio sin borrar nada",
        texto:
          "Entre cada par de puntos ahora hay un \"Punto acá\": el punto nuevo entra ahí y no al final. Antes, para agregar una escala en el medio había que borrar todo lo que venía después y volver a escribirlo.",
        href: "/dashboard/planificador",
        cta: "Armar una ruta",
      },
      {
        icono: "reloj",
        titulo: "Y se puede subir y bajar",
        texto:
          "Cada punto tiene flechas para moverlo de lugar. Si la ruta tiene una aerovía, se mueve entera con su punto de salida — no se puede partir al medio ni dejarla sin el punto por donde entrás.",
      },
    ],
  },
  {
    version: "2.12.1",
    fecha: "2026-08-19",
    titulo: "Rutas por aerovía, eligiendo en vez de escribiendo",
    novedades: [
      {
        icono: "brujula",
        titulo: "\"Ir por aerovía\", abajo de cada punto",
        texto:
          "Debajo de cada punto de la ruta aparece un botón que te ofrece las aerovías que pasan por ahí y hasta dónde llega cada una. Elegís las dos cosas de una lista: no hay que saberse ninguna de memoria ni tener la carta al lado. La aerovía queda como una franja entre los dos puntos, y si cambiás el destino se recalcula sola en vez de dejarte once campos sueltos para borrar a mano.",
        href: "/dashboard/planificador",
        cta: "Probar una aerovía",
      },
      {
        icono: "lupa",
        titulo: "220 aerovías, y las que no verificamos no aparecen",
        texto:
          "Salen del ENR 3 del AIP y cada secuencia se contrasta contra el ENR 4.4: si a una le falta un punto, no la publicamos. Una aerovía incompleta daría una travesía más corta que la real y con pinta de válida. De la aerovía se usa sólo por dónde pasa: los niveles y la clase de espacio aéreo hay que consultarlos aparte.",
      },
    ],
  },
  {
    version: "2.11.0",
    fecha: "2026-08-19",
    titulo: "Los puntos de aerovía, en el planificador",
    novedades: [
      {
        icono: "brujula",
        titulo: "Los 1018 puntos significativos del AIP",
        texto:
          "Escribí DORVO, AKNOS o cualquiera de los cinco letras que canta el control y entra en la ruta como un punto más, con su tramo, su rumbo y su tiempo. Te muestra a qué aerovías pertenece y de qué edición del AIP salió — se enmienda cada 28 días.",
        href: "/dashboard/planificador",
        cta: "Planificar con un fix",
      },
    ],
  },
  {
    version: "2.10.1",
    fecha: "2026-08-19",
    titulo: "Las frecuencias de los aeródromos controlados estaban mal",
    novedades: [
      {
        icono: "nube",
        titulo: "Corregimos las frecuencias, las pistas y el combustible",
        texto:
          "De los ocho aeródromos controlados que mostrábamos —Aeroparque, Ezeiza, San Fernando, El Palomar, Córdoba, Rosario, Mar del Plata y Bariloche— casi todos los datos estaban equivocados: la torre de San Fernando figuraba en 118.45 y son 119.00 y 120.05, El Palomar tenía la pista 17/35 anotada como 16/34, y Ezeiza aparecía con AVGAS cuando sólo hay JET A-1. Ahora salen del AIP de ANAC, con la fecha de vigencia a la vista. Si planificaste con esos números, revisalos.",
        href: "/dashboard/airports",
        cta: "Ver un aeródromo",
      },
      {
        icono: "lupa",
        titulo: "Y ahora se puede verificar",
        texto:
          "Cada frecuencia y cada medida que ves de esos aeródromos tiene que aparecer en el PDF oficial de ANAC, y hay una prueba automática que lo comprueba en cada cambio. Los teléfonos de esos ocho se sacaron: no teníamos de dónde confirmarlos.",
      },
    ],
  },
  {
    version: "2.10.0",
    fecha: "2026-08-19",
    titulo: "Un punto de la ruta ya no tiene que ser un aeródromo",
    novedades: [
      {
        icono: "brujula",
        titulo: "Puntos por radial y distancia",
        texto:
          "Escribí BAR/045/25 y el planificador lo toma como punto: 25 NM en el radial 045 del VOR de Bariloche. Usa la variación con la que está alineada la estación, que no es la de hoy ni la del aeródromo, y te dice qué frecuencia sintonizar.",
        href: "/dashboard/planificador",
        cta: "Probar un radial",
      },
      {
        icono: "lupa",
        titulo: "Tus propios puntos visuales",
        texto:
          "El pueblo, el cruce de rutas, la laguna: si tenés la coordenada, escribila como S34.68/W58.64 y entra en la ruta como un punto más, con su tramo, su rumbo y su tiempo.",
        href: "/dashboard/planificador",
        cta: "Planificar un vuelo",
      },
      {
        icono: "avion",
        titulo: "Las radioayudas del país",
        texto:
          "96 estaciones —VOR, VOR-DME y los NDB que no se confunden con otro— con su frecuencia y su posición, para poder apoyar la ruta en ellas.",
      },
    ],
  },
  {
    version: "2.9.0",
    fecha: "2026-08-19",
    titulo: "Todo el preflight en una sola pantalla",
    novedades: [
      {
        icono: "brujula",
        titulo: "Planificador de vuelo",
        texto:
          "Cargá la ruta y te arma la planilla de navegación mientras escribís: rumbos, tiempos y combustible por tramo, con el viento del METAR de salida y la variación magnética de tu aeródromo. Se imprime y se comparte con el link.",
        href: "/dashboard/planificador",
        cta: "Planificar un vuelo",
      },
      {
        icono: "avion",
        titulo: "Performance de tus aeronaves",
        texto:
          "Cargá una vez la velocidad de crucero, el consumo y el tanque de cada avión, y el planificador deja de estimar para calcular con tus números.",
        href: "/dashboard/settings",
        cta: "Completar el Hangar",
      },
      {
        icono: "nube",
        titulo: "Briefing y planificación en la misma pantalla",
        texto:
          "El planificador ahora trae también el METAR, el TAF y los NOTAM de cada punto, el viento cruzado sobre la pista y la densidad de altitud. Y podés tomar el viento del modelo en altura en vez del de superficie, que a 10.000 ft puede cambiar el tiempo de un tramo diez minutos.",
        href: "/dashboard/planificador",
        cta: "Ver el briefing",
      },
      {
        icono: "llave",
        titulo: "La sesión dejó de caerse",
        texto:
          "Vector te echaba más o menos cada hora, sin aviso y sin motivo aparente. Ahora se renueva sola y aguanta treinta días.",
      },
    ],
  },
  {
    version: "2.7.0",
    fecha: "2026-08-10",
    titulo: "¡Tu bitácora Vector sigue sumando herramientas!",
    novedades: [
      {
        icono: "brujula",
        titulo: "¿Podés volar hoy?",
        texto:
          "Vector junta tu certificado médico, tu repaso de vuelo y tu experiencia reciente, y te dice qué podés hacer — citando la sección de la RAAC 61.",
        href: "/dashboard",
        cta: "Ver mi estado",
      },
      {
        icono: "grafico",
        titulo: "Tus propias métricas",
        texto:
          "Armá los números que querés seguir —horas en una aeronave, aterrizajes en un aeródromo, lo que sea— y aparecen en tu dashboard.",
        href: "/dashboard/settings",
        cta: "Crear una métrica",
      },
    ],
  },
];

/**
 * Las versiones que no se anuncian: suben sólo el último dígito y no tocan la tarjeta, que
 * sigue mostrando `CHANGELOG[0]` (y quien ya la cerró no la vuelve a ver). Son para un
 * cambio que Federico decide no anunciar o para un arreglo de adentro. Van de la más nueva
 * a la más vieja; sólo cuentan las que son parche de la última publicada.
 *
 * Datos puros, como `CHANGELOG`: los lee `scripts/build-changelog.mjs` sin compilar.
 */
export const VERSIONES_SIN_NOVEDADES: { version: string; fecha: string; motivo: string }[] = [
  {
    version: "2.36.3",
    fecha: "2026-10-30",
    motivo: "\"Pasar al CAD\" ofrece la extensión sólo en Chrome, Edge y Brave; en Safari y Firefox, el marcador; en el teléfono, hacerlo desde la compu. Ajuste de la 2.36.0, sin anuncio aparte.",
  },
  {
    version: "2.36.2",
    fecha: "2026-10-29",
    motivo: "Se borra el panel viejo adentro del CAD y su ventanita (`/cad/conector`): desde la 2.36.0 la extensión y el marcador son sólo un puente. El piloto no ve nada nuevo.",
  },
  {
    version: "2.36.1",
    fecha: "2026-10-29",
    motivo: "\"Pasar al CAD\" avisa cuando la extensión instalada es vieja y ofrece bajar la nueva. Completa la 2.36.0, sin anuncio aparte.",
  },
  {
    version: "2.34.1",
    fecha: "2026-10-28",
    motivo: "Vector entra menos a ANAC: la sincronización con el CAD pasa a una vez por día, y si ANAC no contesta se espera antes de volver a probar. Ajusta la 2.34.0, sin anuncio aparte.",
  },
  {
    version: "2.30.1",
    fecha: "2026-10-26",
    motivo: "El recorrido ADS-B de una navegación ya no se corta lejos de Buenos Aires, y dice cuántos minutos quedaron sin señal. Arregla la 2.30.0, sin anuncio aparte.",
  },
  {
    version: "2.29.2",
    fecha: "2026-10-23",
    motivo: "Las pegatinas con QR se bajan como un PNG por código (en ZIP) para mandarlas a hacer. Es del panel de administración.",
  },
  {
    version: "2.29.1",
    fecha: "2026-10-23",
    motivo: "Las pegatinas con QR: cada una con su código, asignadas escaneándolas, y su panel de administración. Es para el admin, así que no va en Novedades.",
  },
  {
    version: "2.28.2",
    fecha: "2026-10-21",
    motivo: "La práctica del examen de PPA suma las 65 preguntas con figura: 379 en total. Sin anuncio, como la 2.28.1.",
  },
  {
    version: "2.28.1",
    fecha: "2026-10-21",
    motivo: "La práctica del examen de PPA con el banco de ANAC (guía pública y tarjeta en Herramientas). Sin anuncio: la 2.28.0 salió el mismo día; va en la próxima con novedades.",
  },
  {
    version: "2.27.4",
    fecha: "2026-10-21",
    motivo: "El importador lee fotos de las hojas, y el copiloto manda el resumen de horas en PDF. Sin anuncio hasta que Federico pruebe las dos cosas en producción.",
  },
  {
    version: "2.27.3",
    fecha: "2026-10-21",
    motivo: "La autoridad certificante para el CAD, opcional al registrar y al editar un vuelo, y el panel la usa. Es parte de lo anunciado en la 2.27.0, que recién se está viendo.",
  },
  {
    version: "2.27.2",
    fecha: "2026-10-21",
    motivo: "El copiloto manda el libro en PDF por WhatsApp, y la Bitácora y el resumen del mes cuentan lo que falta pasar al CAD. Sin anuncio hasta que Federico pruebe el PDF por WhatsApp.",
  },
  {
    version: "2.27.1",
    fecha: "2026-10-21",
    motivo: "El alta ofrece traer los vuelos del CAD, y el aviso de no contar dos veces las horas si también se copian los totales. Es parte de lo anunciado en la 2.27.0.",
  },
  {
    version: "2.26.5",
    fecha: "2026-10-21",
    motivo: "Pasar al CAD: el mismo vuelo con un día de diferencia ya no se duplica; \"Ignorar\" y \"Ya foliado\" sacan vuelos de la lista. Sin anuncio.",
  },
  {
    version: "2.26.4",
    fecha: "2026-10-21",
    motivo: "Pasar al CAD: los aeródromos con OACI (SADF y otros) no se encontraban en la lista del CAD, que los escribe \"SADF -  FDO -  FDO (…)\". Arreglo, sin anuncio.",
  },
  {
    version: "2.26.3",
    fecha: "2026-10-21",
    motivo: "Pasar al CAD rediseñado: la autoridad certificante y su nombre por vuelo, el panel por secciones y \"Corregir\" que abre el vuelo. Sigue sin anuncio hasta probarlo contra el CAD real.",
  },
  {
    version: "2.26.2",
    fecha: "2026-10-21",
    motivo: "Pasar los vuelos al CAD de ANAC con un marcador. Sin anuncio hasta probarlo contra el CAD real, que hoy no responde.",
  },
  {
    version: "2.26.1",
    fecha: "2026-10-20",
    motivo: "El alta ofrece arrancar con los totales del libro, y el alumno con sus horas de antes. Sin anuncio (Federico).",
  },
];

/** Si `v` es un parche de `base`: misma versión mayor y menor, y un último dígito más alto. */
export function esParcheDe(v: string, base: string): boolean {
  const [a, b, c] = v.split(".").map(Number);
  const [x, y, z] = base.split(".").map(Number);
  return a === x && b === y && c > z;
}

/**
 * La versión de la app: el último parche sin novedades de la última publicada, o esa misma.
 * Tiene que coincidir con `package.json`.
 */
export const VERSION_ACTUAL =
  VERSIONES_SIN_NOVEDADES.find((v) => esParcheDe(v.version, CHANGELOG[0].version))?.version ?? CHANGELOG[0].version;

/**
 * Cuántas novedades entran en la tarjeta del dashboard.
 *
 * Cuatro es lo que se lee de un vistazo sin empujar el resto del dashboard fuera de
 * pantalla. El resto vive en `/dashboard/novedades`, que existe justamente para no
 * tener que elegir entre contar todo y no molestar.
 */
export const NOVEDADES_EN_TARJETA = 4;

/** La clave de descarte, por versión: al publicar una nueva, la tarjeta vuelve sola. */
export function claveDescarte(version: string): string {
  return `vector_dismissed_changelog_v${version}`;
}
