/**
 * Las secciones de la barra y qué pantallas entran en cada una.
 *
 * La barra llegó a tener **nueve destinos**, porque cada pantalla nueva se agregaba al
 * final para no mover las de adelante. En el teléfono cinco entraban y cuatro quedaban
 * en la hoja "Más", y un alumno nuevo tenía que aprenderse nueve íconos para cargar un
 * vuelo. En la 2.18.0 pasaron a cuatro secciones, y las pantallas que antes eran
 * destinos sueltos, a pestañas de la sección a la que pertenecen. La 2.19.0 sumó la
 * quinta, Pilotos, con la red social. Cinco es el techo: es lo que entra en la píldora
 * del teléfono sin volver a la hoja "Más".
 *
 * **Las URLs no cambian.** Hay links a estas pantallas en los mails del briefing, en las
 * novedades, en el cache del service worker y en el smoke. Agrupar es una decisión de
 * navegación, no de rutas: sólo cambia qué ícono se ilumina y qué pestañas se ven.
 *
 * **El orden de los primeros íconos se respeta.** Inicio, Bitácora, Balance y
 * Planificador ya ocupaban los cuatro primeros lugares; "Preparar vuelo" hereda el
 * ícono y el lugar del Planificador. La memoria muscular de quien ya usaba la app sigue
 * apuntando a lo mismo, y sólo desaparecen los cinco íconos que sobraban.
 *
 * Es un `.ts` puro y sin íconos —el componente los asigna por clave— para poder
 * testearlo en `environment: "node"`, igual que `changelog.ts`.
 */

export type ClaveSeccion = "inicio" | "bitacora" | "preparar" | "pilotos";

export interface Pestana {
  href: string;
  label: string;
}

export interface Seccion {
  clave: ClaveSeccion;
  label: string;
  /**
   * Las pantallas de la sección, en el orden en que se muestran. La primera es
   * adonde lleva el ícono de la barra. Con una sola, la sección no tiene pestañas.
   */
  pestanas: Pestana[];
}

/** Lleva el contador de hallazgos abiertos, en la barra y en su pestaña. */
/** La auditoría ya no es pestaña (3.12.0): cuelga de Vuelos y se abre desde su aviso. */
export const AUDITORIA_HREF = "/dashboard/history/auditoria";

export const ACTIVIDAD_HREF = "/dashboard/pilotos/actividad";

/*
  La simplificación de la 3.12.0 (Federico, 2026-11-05), con el uso medido en la base: de 5
  secciones y 15 pestañas a 4 y 9. Calendario se fue con los vuelos programados (nadie los usó);
  Auditoría cuelga de Vuelos; Balance pasó a la Bitácora como Gastos (el "¿cuánto me queda?" ya
  está en el inicio); el Planificador se abre desde el Mapa; Clima vive en la ficha de cada
  aeródromo; y Buscar pilotos, arriba de la Red. Las URLs viejas redirigen (`next.config.js`).
*/
export const SECCIONES: Seccion[] = [
  {
    clave: "inicio",
    label: "Inicio",
    pestanas: [{ href: "/dashboard", label: "Inicio" }],
  },
  {
    clave: "bitacora",
    label: "Bitácora",
    pestanas: [
      { href: "/dashboard/history", label: "Vuelos" },
      { href: "/dashboard/summary", label: "Resumen" },
      { href: "/dashboard/balance", label: "Gastos" },
    ],
  },
  {
    clave: "preparar",
    label: "Preparar vuelo",
    pestanas: [
      // El Mapa es la pantalla de planificar: la ruta, los espacios aéreos, con quién se habla,
      // y desde ahí la planilla del Planificador y el plan de vuelo.
      { href: "/dashboard/mapa", label: "Mapa" },
      { href: "/dashboard/plan-de-vuelo", label: "Plan de vuelo" },
      { href: "/dashboard/airports", label: "Aeródromos" },
      { href: "/dashboard/tools", label: "Herramientas" },
    ],
  },
  // La red social. El perfil de cada uno vive fuera del dashboard, en `/u/[handle]`, porque se
  // abre sin cuenta.
  {
    clave: "pilotos",
    label: "Pilotos",
    pestanas: [
      { href: "/dashboard/pilotos", label: "Red" },
      { href: ACTIVIDAD_HREF, label: "Actividad" },
    ],
  },
];

export function hrefDeSeccion(seccion: Seccion): string {
  return seccion.pestanas[0].href;
}

/**
 * Si `pathname` es esa pestaña o una pantalla que cuelga de ella.
 *
 * `/dashboard` es la excepción: es el prefijo de todas las pantallas de la app, así
 * que con prefijo cualquier ruta sería "Inicio". Ésa sólo cuenta exacta.
 */
export function esPestanaActiva(pestana: Pestana, pathname: string): boolean {
  if (pathname === pestana.href) return true;
  return pestana.href !== "/dashboard" && pathname.startsWith(`${pestana.href}/`);
}

/**
 * La pestaña que se ilumina: de las que coinciden, la más específica.
 *
 * Con sólo `esPestanaActiva`, en `/dashboard/pilotos/actividad` se prendían dos
 * pestañas de Pilotos, porque esa ruta también cuelga de `/dashboard/pilotos` (la Red).
 * Gana la de `href` más largo, que es la que describe la pantalla de verdad. Lo que no
 * es pestaña —un perfil, Publicar— queda bajo la Red.
 */
export function pestanaActiva(seccion: Seccion, pathname: string): Pestana | null {
  return (
    seccion.pestanas
      .filter((p) => esPestanaActiva(p, pathname))
      .sort((a, b) => b.href.length - a.href.length)[0] ?? null
  );
}

/**
 * La sección a la que pertenece una pantalla, o `null` si no pertenece a ninguna.
 *
 * `null` es un caso normal y no un error: el Hangar vive en el avatar, Novedades se
 * abre desde su tarjeta, y "Registrar vuelo" es una acción, no un lugar. En esas
 * pantallas no se ilumina ningún ícono y no hay pestañas.
 */
export function seccionDe(pathname: string): Seccion | null {
  return SECCIONES.find((s) => s.pestanas.some((p) => esPestanaActiva(p, pathname))) ?? null;
}
