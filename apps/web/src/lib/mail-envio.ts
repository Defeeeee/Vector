/**
 * Mandar un mail **con seguimiento**: el HTML sale con los links y la imagen de apertura
 * de `lib/mail-seguimiento.ts`, y si el envío anduvo se anota en el backend
 * (`POST /mails/envios`, migración 023).
 *
 * Es el único camino por el que salen los mails de los barridos, para que el panel de
 * administración los vea a todos. El texto plano no se toca: ahí van los links directos.
 *
 * **Si no se puede anotar el envío, el mail igual salió**, y se dice en `aviso`: sin el
 * renglón del envío, sus aperturas y clics se descartan (el backend no los acepta sin
 * envío), pero el piloto recibe su mail y sus links andan.
 */
import { randomUUID } from "crypto";
import { enviarMail, type ResultadoEnvio } from "@/lib/mailer";
import { conSeguimiento } from "@/lib/mail-seguimiento";

const API_URL = process.env.API_URL || "http://127.0.0.1:7477/api";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://vector.fdiaznem.com.ar";

export type TipoMail = "primer-vuelo" | "resumen-mensual" | "briefing" | "novedades" | "plan-por-registrar";

export interface MailConSeguimiento {
  para: string;
  /** La cuenta. `null` en las copias de prueba: se miden, pero no entran en el panel. */
  userId: string | null;
  tipo: TipoMail;
  /** Qué edición: el mes del resumen, la tanda de novedades, la fecha del vuelo. */
  clave?: string | null;
  mensaje: { asunto: string; texto: string; html: string };
  cabeceras?: Record<string, string>;
  /** Links que no se miden, como la baja. */
  sinSeguir?: string[];
}

export async function enviarConSeguimiento(m: MailConSeguimiento): Promise<ResultadoEnvio & { aviso?: string }> {
  const secreto = process.env.DOCUMENTS_ALERT_SECRET ?? "";
  // Sin secreto no hay firma, y sin firma no hay seguimiento: sale el mail tal cual.
  if (!secreto) return enviarMail({ para: m.para, ...m.mensaje, cabeceras: m.cabeceras });

  const envioId = randomUUID();
  const html = conSeguimiento(m.mensaje.html, { appUrl: APP_URL, envioId, secreto, sinSeguir: m.sinSeguir });
  const r = await enviarMail({ para: m.para, asunto: m.mensaje.asunto, texto: m.mensaje.texto, html, cabeceras: m.cabeceras });
  if (!r.enviado) return r;

  try {
    const res = await fetch(`${API_URL}/mails/envios`, {
      method: "POST",
      headers: { "X-Cron-Secret": secreto, "Content-Type": "application/json" },
      body: JSON.stringify({ envios: [{ id: envioId, user_id: m.userId, tipo: m.tipo, clave: m.clave ?? null }] }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ...r, aviso: `el envío no se anotó: el backend contestó ${res.status}` };
  } catch (err) {
    return { ...r, aviso: `el envío no se anotó: ${err instanceof Error ? err.message : String(err)}` };
  }
  return r;
}

/** Anota una apertura o un clic. Nunca tira: del otro lado hay alguien esperando. */
export async function anotarEvento(envioId: string, tipo: "apertura" | "clic", destino?: string): Promise<void> {
  const secreto = process.env.DOCUMENTS_ALERT_SECRET ?? "";
  if (!secreto) return;
  try {
    await fetch(`${API_URL}/mails/eventos`, {
      method: "POST",
      headers: { "X-Cron-Secret": secreto, "Content-Type": "application/json" },
      body: JSON.stringify({ envio_id: envioId, tipo, destino: destino ?? null }),
      // Corto: una imagen o una redirección no pueden esperar a la base.
      signal: AbortSignal.timeout(2500),
    });
  } catch {
    // Se pierde un evento, no un mail.
  }
}
