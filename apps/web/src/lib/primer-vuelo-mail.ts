/**
 * El mail del día siguiente al alta, para quien todavía no cargó vuelos.
 *
 * Es **uno solo** (el backend marca a quién se le mandó: `services/recordatorios.py`) y
 * dice cómo empezar, en el orden de lo que menos cuesta: un audio al copiloto, el libro
 * en PDF, y a mano. Nombra lo que le falta a esa persona —el número de WhatsApp, un
 * avión— en vez de un texto igual para todos.
 *
 * El HTML usa la plantilla de todos los mails (`lib/mail-plantilla.ts`), con la estética
 * de la landing. El texto plano es el mismo mensaje, para los clientes que no muestran
 * HTML.
 */
import { bloque, boton, ejemploDelInicio, etiqueta, parrafo, plantillaMail, type Icono } from "@/lib/mail-plantilla";

export interface DatosPrimerVuelo {
  nombre: string | null;
  tieneAvion: boolean;
  tieneWhatsapp: boolean;
  /** `https://vector.fdiaznem.com.ar`, sin barra final. */
  appUrl: string;
  /** El link al chat con el copiloto, si está configurado (`lib/copiloto.ts`). */
  linkCopiloto: string | null;
  /**
   * Hace cuántos días fue el alta (1 = ayer). El barrido mira una ventana de tres días
   * para alcanzar a quien una corrida fallida dejó afuera, y a ese no se le dice "ayer".
   */
  diasDesdeElAlta?: number;
}

/** "Ayer", "Anteayer" o "Hace N días", para abrir la frase del alta. */
export function cuandoFueElAlta(dias: number | undefined): string {
  if (!dias || dias <= 1) return "Ayer";
  if (dias === 2) return "Anteayer";
  return `Hace ${dias} días`;
}

export interface MensajePrimerVuelo {
  asunto: string;
  texto: string;
  html: string;
}

export function armarMensajePrimerVuelo(d: DatosPrimerVuelo): MensajePrimerVuelo {
  const nombre = d.nombre?.trim() || null;
  const asunto = nombre ? `${nombre}, ¿cargamos tu primer vuelo?` : "¿Cargamos tu primer vuelo?";
  const registrar = `${d.appUrl}/dashboard/log-flight`;
  const importar = `${d.appUrl}/dashboard/log-flight/import`;
  const hangar = `${d.appUrl}/dashboard/settings`;

  const whatsapp = d.tieneWhatsapp
    ? "Mandale un audio al copiloto por WhatsApp contando el vuelo, y lo carga cuando confirmás."
    : "Dejá tu celular en el Hangar y mandale un audio al copiloto por WhatsApp contando el vuelo: lo carga cuando confirmás.";
  const aMano = d.tieneAvion
    ? "Registralo a mano: salida, llegada y horarios. Vector calcula el tiempo y el desglose."
    : "Registralo a mano: primero cargá el avión en el Hangar, y después salida, llegada y horarios.";

  const opciones: { titulo: string; texto: string; link: string; boton: string; icono: Icono }[] = [
    { icono: "mic", titulo: "Con un audio", texto: whatsapp, link: d.tieneWhatsapp && d.linkCopiloto ? d.linkCopiloto : hangar, boton: d.tieneWhatsapp && d.linkCopiloto ? "Abrir WhatsApp" : "Ir al Hangar" },
    { icono: "file-text", titulo: "Con tu libro de papel", texto: "Sacale una foto a cada hoja, o subí el PDF escaneado, y Vector carga los vuelos.", link: importar, boton: "Importar mi libro" },
    { icono: "pencil-line", titulo: "A mano", texto: aMano, link: d.tieneAvion ? registrar : hangar, boton: d.tieneAvion ? "Registrar un vuelo" : "Cargar el avión" },
  ];

  const saludo = nombre ? `Hola ${nombre}:` : "Hola:";
  const intro =
    `${cuandoFueElAlta(d.diasDesdeElAlta)} te hiciste la cuenta en Vector. Para decirte si podés volar hoy, cuánto te falta ` +
    "para la PCA y cuánto te queda del pack, le falta lo principal: tus vuelos.";
  const pie =
    "Te escribimos una sola vez, después del alta. Si no te interesa, no hace falta que hagas nada.";

  const texto = [
    saludo,
    "",
    intro,
    "",
    "Tres formas de empezar:",
    ...opciones.flatMap((o, i) => [`${i + 1}. ${o.titulo}: ${o.texto}`, `   ${o.link}`]),
    "",
    pie,
    "",
    "Vector · Tu bitácora de vuelo, siempre al día.",
  ].join("\n");

  const html = plantillaMail({
    appUrl: d.appUrl,
    preencabezado: "Tres formas de cargar tu primer vuelo: un audio, fotos de tu libro o a mano.",
    pildora: "Tu cuenta en Vector",
    titulo: [nombre ? `${nombre}, tu bitácora está lista.` : "Tu bitácora está lista.", "Le falta tu primer vuelo."],
    cuerpo: [
      parrafo(intro),
      ejemploDelInicio(),
      `<div style="height:14px;line-height:14px">&nbsp;</div>`,
      etiqueta("Tres formas de empezar"),
      ...opciones.map((o) => bloque(d.appUrl, { icono: o.icono, titulo: o.titulo, filas: [o.texto], link: { texto: o.boton, url: o.link } })),
      `<div style="height:8px;line-height:8px">&nbsp;</div>`,
      boton("Abrir mi bitácora", `${d.appUrl}/dashboard`),
    ].join("\n"),
    pie,
  });

  return { asunto, texto, html };
}
