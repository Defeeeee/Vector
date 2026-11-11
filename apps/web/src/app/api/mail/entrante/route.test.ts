import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { firmarSvix } from "@/lib/svix";
import { direccionDeRespuesta } from "@/lib/direccion-respuesta";

vi.mock("@/lib/mailer", () => ({ enviarMail: vi.fn(async () => ({ enviado: true })) }));
import { enviarMail } from "@/lib/mailer";
import { POST } from "./route";

const SVIX = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
const SECRETO = "secreto-barridos";
const PLAN = "0b8f2c1e-5a4d-4c3b-9e7f-123456789abc";
const DIR = direccionDeRespuesta(PLAN, SECRETO)!;

function pedido(evento: unknown, opciones: { firmar?: boolean; ts?: number } = {}) {
  const cuerpo = JSON.stringify(evento);
  const ts = opciones.ts ?? Math.floor(Date.now() / 1000);
  const headers: Record<string, string> = { "svix-id": "msg_1", "svix-timestamp": String(ts) };
  headers["svix-signature"] = opciones.firmar === false ? "v1,AAAA" : firmarSvix("msg_1", ts, cuerpo, SVIX);
  return new NextRequest("http://localhost/api/mail/entrante", { method: "POST", body: cuerpo, headers });
}

const evento = (data: Record<string, unknown> = {}) => ({
  type: "email.received",
  data: { email_id: "re_1", from: "acmor@eana.com.ar", to: [DIR], cc: ["lucia@example.com"], subject: "Re: LVS100", ...data },
});

let registrado: Record<string, unknown> | null;
let duplicada: boolean;

beforeEach(() => {
  process.env.RESEND_WEBHOOK_SECRET = SVIX;
  process.env.DOCUMENTS_ALERT_SECRET = SECRETO;
  process.env.RESEND_API_KEY = "re_test";
  registrado = null;
  duplicada = false;
  vi.mocked(enviarMail).mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/planes-de-vuelo/interno/") && url.endsWith("/respuestas")) {
        registrado = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ duplicada }), { status: 200 });
      }
      if (url.includes("/planes-de-vuelo/interno/")) {
        return new Response(JSON.stringify({ email: "lucia@example.com", envios_a_oficina: ["acmor@eana.com.ar"] }), { status: 200 });
      }
      if (url.includes("/emails/receiving/")) {
        return new Response(JSON.stringify({ text: "Plan ACEPTADO. Buen vuelo.\n\nEl mar, 17 nov 2026, Lucía <lucia@example.com> escribió:\n> hola", html: null }), { status: 200 });
      }
      throw new Error(`fetch inesperado: ${url}`);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("POST /api/mail/entrante", () => {
  it("401 con la firma de Svix mala o un timestamp viejo", async () => {
    expect((await POST(pedido(evento(), { firmar: false }))).status).toBe(401);
    expect((await POST(pedido(evento(), { ts: Math.floor(Date.now() / 1000) - 3600 }))).status).toBe(401);
    expect(registrado).toBeNull();
  });
  it("guarda la respuesta de la oficina, limpia y clasificada, con aviso", async () => {
    const r = await POST(pedido(evento()));
    expect(r.status).toBe(200);
    expect(registrado).toMatchObject({ email_id: "re_1", de: "acmor@eana.com.ar", clasificacion: "aceptado", avisar: true, texto: "Plan ACEPTADO. Buen vuelo." });
    expect(enviarMail).not.toHaveBeenCalled(); // el piloto estaba en cc
  });
  it("si el piloto no estaba en to ni cc, le reenvía el texto entero", async () => {
    await POST(pedido(evento({ cc: [] })));
    expect(enviarMail).toHaveBeenCalledOnce();
    const mail = vi.mocked(enviarMail).mock.calls[0][0];
    expect(mail.para).toBe("lucia@example.com");
    expect(mail.texto).toContain("Plan ACEPTADO");
  });
  it("una repetición (duplicada) no reenvía nada", async () => {
    duplicada = true;
    await POST(pedido(evento({ cc: [] })));
    expect(enviarMail).not.toHaveBeenCalled();
  });
  it("200 sin hacer nada si la firma del plan es inválida, el evento es otro o escribió el piloto", async () => {
    expect((await POST(pedido(evento({ to: [DIR.replace(/-[0-9a-f]{10}@/, "-0000000000@")] })))).status).toBe(200);
    expect((await POST(pedido({ type: "email.sent", data: { email_id: "x" } }))).status).toBe(200);
    expect((await POST(pedido(evento({ from: "Lucía <lucia@example.com>" })))).status).toBe(200);
    expect(registrado).toBeNull();
  });
  it("un tercero se guarda como 'otra' sin aviso", async () => {
    await POST(pedido(evento({ from: "spam@mal.com" })));
    expect(registrado).toMatchObject({ clasificacion: "otra", avisar: false });
    expect(enviarMail).not.toHaveBeenCalled();
  });
  it("si falla el cuerpo de Resend igual guarda la respuesta, sin texto", async () => {
    const f = vi.mocked(fetch);
    const base = f.getMockImplementation()!;
    f.mockImplementation(async (url: string | URL | Request, init?: RequestInit) =>
      String(url).includes("/emails/receiving/") ? new Response("no", { status: 403 }) : base(url, init));
    const r = await POST(pedido(evento()));
    expect(r.status).toBe(200);
    expect(registrado).toMatchObject({ clasificacion: "otra", texto: "", avisar: true });
  });
  it("200 aunque el backend falle (no se reintenta)", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("caído"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(pedido(evento()))).status).toBe(200);
    spy.mockRestore();
  });
});
