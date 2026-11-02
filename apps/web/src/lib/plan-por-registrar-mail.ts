/**
 * El mail "¿Cargamos tu vuelo?": sale una hora y media después de la llegada estimada de
 * un plan de vuelo presentado que todavía no está en la bitácora (Federico, 2026-10-20;
 * `lib/plan-cierre.ts`, `/api/cron/plan-por-registrar`).
 *
 * Uno por plan (el backend lo marca, migración 027). Lleva al formulario con el avión, la
 * ruta y la fecha del plan, **sin horarios**: los del plan son estimados, y se escriben los
 * reales. Si no voló, el inicio tiene "No lo volé".
 *
 * El HTML usa la plantilla de todos los mails (`lib/mail-plantilla.ts`).
 */
import { bloque, boton, parrafo, plantillaMail } from "@/lib/mail-plantilla";

export interface DatosPlanPorRegistrar {
  nombre: string | null;
  /** "SADF → SADM" o "SADF" en un local. */
  ruta: string;
  /** "San Fernando a Morón", si se conocen los nombres. */
  rutaConNombres: string | null;
  matricula: string | null;
  /** "20/10" y "16:15", en hora argentina, ya escritos en el server. */
  dia: string;
  llegada: string;
  /** El link al formulario, con lo del plan (`hrefRegistrarDesdePlan`), ya absoluto. */
  registrar: string;
  /** `https://vector.fdiaznem.com.ar`, sin barra final. */
  appUrl: string;
}

export function armarMensajePlanPorRegistrar(d: DatosPlanPorRegistrar): { asunto: string; texto: string; html: string } {
  const nombre = d.nombre?.trim() || null;
  const asunto = `¿Cargamos tu vuelo ${d.ruta}?`;
  const intro =
    `Según tu plan de vuelo del ${d.dia}${d.rutaConNombres ? `, de ${d.rutaConNombres}` : ""}, ya aterrizaste: la llegada ` +
    `estimada era a las ${d.llegada}. Cargalo ahora, que tenés los horarios frescos.`;
  const detalle = "Te dejamos el avión, la ruta y la fecha. Los horarios ponelos vos: los del plan son estimados.";
  const noVolo = "¿No volaste? Marcalo con \"No lo volé\" en el inicio y no te preguntamos más.";
  const pie = "Te escribimos una sola vez por cada plan de vuelo que presentás.";

  const texto = [
    nombre ? `Hola ${nombre}:` : "Hola:",
    "",
    intro,
    detalle,
    "",
    `Registrar el vuelo: ${d.registrar}`,
    "",
    noVolo,
    `${d.appUrl}/dashboard`,
    "",
    pie,
    "",
    "Vector · Tu bitácora de vuelo, siempre al día.",
  ].join("\n");

  const html = plantillaMail({
    appUrl: d.appUrl,
    preencabezado: `Tu plan de vuelo ${d.ruta} ya llegó. Cargalo con los horarios frescos.`,
    pildora: "Tu plan de vuelo",
    titulo: [nombre ? `${nombre}, ¿cómo estuvo el vuelo?` : "¿Cómo estuvo el vuelo?", "Cargalo en tu bitácora."],
    cuerpo: [
      parrafo(intro),
      bloque(d.appUrl, {
        icono: "plane",
        titulo: d.ruta,
        filas: [[d.matricula, `${d.dia}, llegada estimada ${d.llegada}`].filter(Boolean).join(" · "), detalle],
      }),
      boton("Registrar el vuelo", d.registrar),
      `<div style="height:8px;line-height:8px">&nbsp;</div>`,
      parrafo(noVolo),
    ].join("\n"),
    pie,
  });

  return { asunto, texto, html };
}
