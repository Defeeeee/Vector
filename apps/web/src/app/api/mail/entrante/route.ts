import { NextRequest, NextResponse } from "next/server";
import { verificarSvix } from "@/lib/svix";
import { planDeLosDestinatarios } from "@/lib/direccion-respuesta";
import {
  MAX_TEXTO_RESPUESTA,
  direccionDe,
  reenviarAlPiloto,
  quienEscribe,
  resumir,
  sinLoCitado,
  textoDeHtml,
} from "@/lib/respuesta-plan";
import { clasificarRespuesta } from "@/lib/respuesta-plan-gemini";
import { enviarMail } from "@/lib/mailer";

// Local por defecto, con /api, como los barridos (ver `lib/api.ts`).
const API_URL = process.env.API_URL || "http://127.0.0.1:7477/api";
/** Sólo se cambia en las pruebas, para apuntar a un Resend falso. */
const RESEND_URL = (process.env.RESEND_API_URL || "https://api.resend.com").replace(/\/$/, "");

/**
 * El webhook `email.received` de Resend: la oficina contestó un plan de vuelo.
 *
 * Los planes salen con `reply_to` = `plan-<id>-<firma>@respuestas.vector.fdiaznem.com.ar`
 * (`lib/direccion-respuesta.ts`) y el piloto en copia. Resend recibe lo que llega a ese
 * subdominio y avisa acá, con **sólo los metadatos** (de, para, asunto): el cuerpo se pide
 * aparte (`GET /emails/receiving/{id}`). Acá se verifica, se clasifica y se le pasa al
 * backend, que lo guarda y manda el push al piloto.
 *
 * **Siempre 200 salvo la firma de Svix**: Resend reintenta ante cualquier otra cosa, y un
 * mail que no es nuestro (firma del plan inválida, remitente equivocado) no se arregla
 * reintentando. La idempotencia es del backend (`email_id` único).
 */

interface EventoRecibido {
  type?: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string[];
    cc?: string[];
    subject?: string;
  };
}

const ok = (motivo: string) => NextResponse.json({ ok: true, motivo });

function encabezados(secreto: string): HeadersInit {
  return { "X-Cron-Secret": secreto, "Content-Type": "application/json" };
}

export async function POST(req: NextRequest) {
  const secretoSvix = process.env.RESEND_WEBHOOK_SECRET;
  const secretoPlan = process.env.DOCUMENTS_ALERT_SECRET;
  if (!secretoSvix || !secretoPlan) return NextResponse.json({ error: "No configurado" }, { status: 503 });

  const cuerpo = await req.text();
  const valida = verificarSvix(
    {
      id: req.headers.get("svix-id"),
      timestamp: req.headers.get("svix-timestamp"),
      firma: req.headers.get("svix-signature"),
    },
    cuerpo,
    secretoSvix,
  );
  if (!valida) return NextResponse.json({ error: "Firma inválida" }, { status: 401 });

  try {
    return await procesar(cuerpo, secretoPlan);
  } catch (err) {
    console.error("[mail entrante] falló:", err instanceof Error ? err.message : err);
    return ok("error registrado");
  }
}

async function procesar(cuerpo: string, secretoPlan: string): Promise<NextResponse> {
  let evento: EventoRecibido;
  try {
    evento = JSON.parse(cuerpo);
  } catch {
    return ok("no es JSON");
  }
  if (evento.type !== "email.received" || !evento.data?.email_id) return ok("otro evento");
  const { email_id: emailId, from = "", to = [], cc = [], subject = "" } = evento.data;

  const planId = planDeLosDestinatarios([...to, ...cc], secretoPlan);
  if (!planId) return ok("dirección sin plan");

  // El plan, con quién es el dueño y a qué oficinas se mandó.
  const planRes = await fetch(`${API_URL}/planes-de-vuelo/interno/${planId}`, { headers: encabezados(secretoPlan), cache: "no-store" });
  if (planRes.status === 404) return ok("plan inexistente");
  if (!planRes.ok) throw new Error(`el backend contestó ${planRes.status} al leer el plan`);
  const plan = (await planRes.json()) as { email: string | null; envios_a_oficina: string[] };
  const piloto = plan.email ?? "";

  const quien = quienEscribe(from, plan.envios_a_oficina ?? [], piloto);
  if (quien === "piloto") return ok("lo escribió el piloto");

  // El cuerpo no viene en el webhook. Si no se puede pedir, se guarda igual (sin texto).
  let crudo = "";
  let destinatarios: { to?: unknown; cc?: unknown } | null = null;
  try {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("falta RESEND_API_KEY");
    const r = await fetch(`${RESEND_URL}/emails/receiving/${encodeURIComponent(emailId)}`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`Resend contestó ${r.status}`);
    const mail = (await r.json()) as { text?: string | null; html?: string | null; headers?: Record<string, unknown> | null };
    crudo = mail.text?.trim() ? mail.text : mail.html ? textoDeHtml(mail.html) : "";
    // To y Cc de verdad, para saber si la oficina copió al piloto (el aviso del webhook no los trae).
    const h = Object.fromEntries(Object.entries(mail.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    destinatarios = { to: h.to, cc: h.cc };
  } catch (err) {
    console.warn("[mail entrante] no se pudo leer el cuerpo:", err instanceof Error ? err.message : err);
  }

  const escrito = sinLoCitado(crudo) || crudo.trim();
  const clasificacion = quien === "oficina" ? await clasificarRespuesta(escrito, subject) : "otra";

  const reg = await fetch(`${API_URL}/planes-de-vuelo/interno/${planId}/respuestas`, {
    method: "POST",
    headers: encabezados(secretoPlan),
    body: JSON.stringify({
      email_id: emailId,
      de: direccionDe(from),
      asunto: subject.slice(0, 300),
      texto: escrito.slice(0, MAX_TEXTO_RESPUESTA),
      resumen: resumir(escrito),
      clasificacion,
      avisar: quien === "oficina",
    }),
    cache: "no-store",
  });
  if (!reg.ok) throw new Error(`el backend contestó ${reg.status} al guardar la respuesta`);
  const { duplicada } = (await reg.json()) as { duplicada?: boolean };
  if (duplicada) return ok("ya registrada");

  // La oficina le contestó sólo a Vector: se la pasamos al piloto, con el texto entero.
  if (quien === "oficina" && piloto && reenviarAlPiloto(piloto, destinatarios)) {
    const texto = [
      `La oficina (${direccionDe(from)}) contestó tu plan de vuelo sólo a Vector. Te copiamos su respuesta:`,
      "",
      crudo.trim() || "(no pudimos leer el texto del mail)",
    ].join("\n");
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111"><p>${esc(texto.split("\n")[0])}</p><pre style="font-family:'Courier New',Courier,monospace;font-size:14px;white-space:pre-wrap">${esc(texto.split("\n").slice(2).join("\n"))}</pre></div>`;
    // Sin seguimiento de aperturas, como los otros mails del plan (`lib/plan-de-vuelo-mail.ts`).
    const r = await enviarMail({ para: piloto, asunto: `Respuesta de la oficina: ${subject.replace(/^(re|rv)\s*:\s*/i, "")}`.slice(0, 200), texto, html });
    if (!r.enviado) console.warn("[mail entrante] no se pudo reenviar al piloto:", r.motivo);
  }
  return ok(quien === "oficina" ? "registrada" : "registrada sin aviso");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
