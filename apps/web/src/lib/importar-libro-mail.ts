/**
 * El mail "Tu libro está listo para revisar" (Federico, 2026-11-17): el piloto sube el libro,
 * se va, y le avisamos cuando se terminó de leer. Uno por importación (`aviso_enviado_at`).
 * **Sólo conteos**: nada de datos de vuelos ni matrículas en el mail.
 */
import { bloque, boton, parrafo, plantillaMail } from "@/lib/mail-plantilla";
import { textoDeFallidos, type Rango } from "@/lib/importar-libro";

export interface DatosMailImportacion {
  nombre: string | null;
  /** `listo` o `error`. */
  estado: "listo" | "error";
  vuelos: number;
  avionesNuevos: number;
  paginasTotal: number;
  fallidos: Rango[];
  appUrl: string;
  /** Absoluto: `/dashboard/log-flight/import?importacion=<id>`. */
  revisar: string;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** La frase de lo leído, con lo que faltó si faltó algo. */
export function resumenDeLectura(d: Pick<DatosMailImportacion, "vuelos" | "avionesNuevos" | "fallidos" | "paginasTotal">): string {
  const partes = [`leímos ${plural(d.vuelos, "vuelo", "vuelos")}`];
  if (d.avionesNuevos > 0) {
    partes.push(`encontramos ${plural(d.avionesNuevos, "avión que no está", "aviones que no están")} en tu Hangar`);
  }
  let frase = partes.join(" y ");
  if (d.fallidos.length > 0) frase += `. No pudimos leer ${textoDeFallidos(d.fallidos)}`;
  return frase;
}

export function armarMensajeImportacion(d: DatosMailImportacion): { asunto: string; texto: string; html: string } {
  const nombre = d.nombre?.trim() || null;
  const saludo = nombre ? `Hola ${nombre}:` : "Hola:";
  const fallo = d.estado === "error";

  const asunto = fallo ? "No pudimos leer tu libro" : d.fallidos.length ? "Tu libro está casi listo para revisar" : "Tu libro está listo para revisar";
  const intro = fallo
    ? "No pudimos leer ninguna hoja de tu libro. Puede ser que el PDF esté borroso o que no sea el libro de vuelo."
    : `Tu libro está listo para revisar: ${resumenDeLectura(d)}.`;
  const siguiente = fallo
    ? "Probá de nuevo con otro PDF o con fotos de las hojas, de frente y con buena luz."
    : "Revisá los datos y confirmá: no se importa nada hasta que lo hagas. Si faltó alguna hoja, la podés subir de nuevo aparte.";
  const textoBoton = fallo ? "Volver a intentar" : "Revisar mi libro";
  const pie = "Te escribimos una sola vez por cada libro que subís. El archivo se borra de nuestro servidor cuando lo importás o lo descartás, y a los 7 días.";

  const texto = [saludo, "", intro, siguiente, "", `${textoBoton}: ${d.revisar}`, "", pie, "", "Vector · Tu bitácora de vuelo, siempre al día."].join("\n");

  const html = plantillaMail({
    appUrl: d.appUrl,
    preencabezado: fallo ? "No pudimos leer tu libro. Probá de nuevo." : intro,
    pildora: "Tu libro de vuelo",
    titulo: fallo ? ["No pudimos leer tu libro.", "Probá de nuevo."] : [nombre ? `${nombre}, tu libro está listo` : "Tu libro está listo", "Revisalo antes de importar."],
    cuerpo: [
      parrafo(intro),
      bloque(d.appUrl, {
        icono: fallo ? "triangle-alert" : "file-text",
        titulo: fallo ? "Sin hojas leídas" : `${plural(d.vuelos, "vuelo leído", "vuelos leídos")}`,
        filas: fallo ? [siguiente] : [d.avionesNuevos > 0 ? `${plural(d.avionesNuevos, "avión nuevo", "aviones nuevos")} para agregar al Hangar` : "Todos los aviones ya están en tu Hangar", siguiente],
        alerta: fallo || d.fallidos.length > 0,
      }),
      boton(textoBoton, d.revisar),
    ].join("\n"),
    pie,
  });
  return { asunto, texto, html };
}
