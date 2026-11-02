/**
 * El mail de novedades: lo que cambió en Vector, para todas las cuentas.
 *
 * Federico lo pidió el 2026-10-02 (14 cuentas y sólo la suya con vuelos). Cada tanda cuenta
 * lo nuevo en bloques cortos, cada uno con su link, y termina con un botón que depende de
 * la persona: cargar el primer vuelo, o abrir la bitácora si ya tiene. La tanda anterior
 * (2026-10, el audio al copiloto, el importador del PDF, la PPA) está en el historial de git.
 *
 * **Esta tanda (2026-10-21)**, verificada contra el código:
 * - pasar los vuelos al CAD de ANAC y traerlos (`lib/cad.ts`, `cad/puente.ts`, 2.27.0); el
 *   marcador anda en la computadora, y el CAD es para pilotos con licencia: al alumno no se
 *   le cuenta (`history/cad/page.tsx`);
 * - el plan de vuelo de EANA firmado y mandado a la oficina ARO/AIS
 *   (`enviarPlan`, prendido con `PLAN_DE_VUELO_ENVIO_ARO`), la demora y la cancelación;
 * - "¿Ya volaste?" después de la llegada estimada (`lib/plan-cierre.ts`).
 * No dice "gratis" ni "oficial": no son decisiones tomadas.
 *
 * Es un mail que no pidieron, así que lleva la baja propia (`lib/baja-mail.ts`, tipo
 * "novedades") en el pie y en la cabecera `List-Unsubscribe`. Cada tanda tiene una
 * `clave`; el backend no le manda dos veces la misma a nadie (`services/mails.py`).
 */
import { bloque, boton, etiqueta, parrafo, plantillaMail, type Icono } from "./mail-plantilla";

export interface DatosNovedades {
  nombre: string | null;
  /** Si ya cargó algún vuelo: cambia el botón del final. */
  tieneVuelos: boolean;
  /**
   * Alumno piloto (`esAlumno`): no lleva libro, así que el importador del PDF lo rebota
   * y no se le ofrece; y el camino a la PPA ya es el suyo.
   */
  alumno?: boolean;
  appUrl: string;
  /** El chat con el copiloto, si está configurado. */
  linkCopiloto: string | null;
  /** La página de la baja de novedades. */
  linkBaja: string;
}

export interface MensajeNovedades {
  asunto: string;
  texto: string;
  html: string;
}

interface Novedad {
  icono: Icono;
  titulo: string;
  texto: string;
  link?: { texto: string; url: string };
}

export function novedades(d: DatosNovedades): Novedad[] {
  const cad = `${d.appUrl}/dashboard/history/cad`;
  const plan = `${d.appUrl}/dashboard/plan-de-vuelo`;
  const lista: Novedad[] = [];
  if (!d.alumno) {
    lista.push(
      {
        icono: "pencil-line",
        titulo: "Pasá tus vuelos al CAD de ANAC",
        texto:
          "Con un marcador en el navegador de la computadora, Vector carga en el CAD los vuelos que te faltan, cada uno con su autoridad certificante y sin repetir los que ya están. La declaración jurada la seguís haciendo vos.",
        link: { texto: "Ver cómo se hace", url: cad },
      },
      {
        icono: "file-text",
        titulo: "Traé lo que ya declaraste",
        texto: "Si tus vuelos están en el CAD y no en Vector, desde el mismo marcador los pasás a tu bitácora con el desglose del libro.",
        link: { texto: "Traer mis vuelos", url: cad },
      }
    );
  }
  lista.push(
    {
      icono: "plane",
      titulo: "El plan de vuelo, armado y enviado",
      texto:
        "Completás el formulario de EANA, lo firmás y Vector lo manda en PDF a la oficina ARO/AIS, con copia a vos. Si te demorás o no volás, la demora y la cancelación salen igual.",
      link: { texto: "Armar un plan", url: plan },
    },
    {
      icono: "target",
      titulo: "Del plan a la bitácora",
      texto: "Pasada la llegada estimada, el inicio te pregunta si volaste y te deja el vuelo listo con el avión, la ruta y la fecha. Los horarios los ponés vos.",
    }
  );
  return lista;
}

export function armarMensajeNovedades(d: DatosNovedades): MensajeNovedades {
  const nombre = d.nombre?.trim() || null;
  const asunto = d.alumno
    ? nombre
      ? `${nombre}, el plan de vuelo ahora sale desde Vector`
      : "El plan de vuelo ahora sale desde Vector"
    : nombre
      ? `${nombre}, tus vuelos al CAD desde Vector`
      : "Tus vuelos al CAD desde Vector";
  const intro = `${nombre ? `Hola ${nombre}. ` : ""}Sumamos cosas para los trámites de antes y de después de volar. Te las contamos en un minuto.`;
  const lista = novedades(d);
  const final = d.tieneVuelos
    ? { texto: "Abrir mi bitácora", link: `${d.appUrl}/dashboard` }
    : { texto: "Cargar mi primer vuelo", link: `${d.appUrl}/dashboard/log-flight` };
  const pie = "Te mandamos las novedades de Vector de vez en cuando.";

  const texto = [
    intro,
    "",
    "LO NUEVO",
    ...lista.flatMap((n) => [`- ${n.titulo}: ${n.texto}`, ...(n.link ? [`  ${n.link.url}`] : [])]),
    "",
    `${final.texto}: ${final.link}`,
    "",
    `${pie} Para no recibirlas más: ${d.linkBaja}`,
    "",
    "Vector · Tu bitácora de vuelo, siempre al día.",
  ].join("\n");

  const html = plantillaMail({
    appUrl: d.appUrl,
    preencabezado: d.alumno
      ? "El plan de vuelo firmado y enviado a la oficina ARO, y el vuelo listo para cargar después."
      : "Pasá tus vuelos al CAD, traé los que ya declaraste y mandá el plan de vuelo desde Vector.",
    pildora: "Novedades de Vector",
    titulo: ["Menos trámites.", "Esto es lo nuevo."],
    cuerpo: [
      parrafo(intro),
      `<div style="height:6px;line-height:6px">&nbsp;</div>`,
      etiqueta("Lo nuevo"),
      ...lista.map((n) => bloque(d.appUrl, { icono: n.icono, titulo: n.titulo, filas: [n.texto], link: n.link })),
      `<div style="height:8px;line-height:8px">&nbsp;</div>`,
      boton(final.texto, final.link),
    ].join("\n"),
    pie,
    pieLink: { texto: "No recibirlas más", url: d.linkBaja },
  });

  return { asunto, texto, html };
}
