"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";
import { esErrorDeRedirect } from "@/lib/redirect-error";
import { duplicar, leerFormulario, normalizar, revisar, type FormularioPlan, type PerfilAvionPlan } from "@/lib/formulario-plan";
import { emailDeLaSesion, firmaGuardada, leerPlan, pilotoParaPlan } from "@/lib/plan-de-vuelo-servidor";
import { armarMailPlan, type ModoEnvio } from "@/lib/plan-de-vuelo-mail";
import { nombreDelArchivo } from "@/lib/plan-de-vuelo";
import { oficinasAro } from "@/lib/oficinas-aro-disco";
import { oficinaParaSalida } from "@/lib/oficinas-aro";
import { enviarMail } from "@/lib/mailer";
import fs from "node:fs";
import path from "node:path";
import { demoraDesdeHoraUtc, eobtVigente, nombreDeCancelacion, nombreDeDemora, planConDemora, planVigente, revisarDemora, type Demora } from "@/lib/demora-plan";

/**
 * Los planes de vuelo guardados (`/planes-de-vuelo` del backend, migración 024).
 *
 * **Qué se revalida:** la lista (`/dashboard/plan-de-vuelo`). El editor es dueño de su
 * estado y guarda solo mientras el piloto escribe; revalidarlo en cada guardado volvería
 * a dibujar el formulario debajo de los dedos. Misma excepción que las publicaciones
 * (invariante 8, `actions/social.ts`).
 *
 * Todo devuelve `{ error }` en vez de tirar, salvo lo que termina en un `redirect`.
 */

const LISTA = "/dashboard/plan-de-vuelo";

async function detalle(res: Response, porDefecto: string): Promise<string> {
  const err = await res.json().catch(() => ({}));
  return typeof err?.detail === "string" ? err.detail : porDefecto;
}

/** Crea un plan y abre el editor. */
export async function crearPlan(formulario: FormularioPlan): Promise<{ error: string } | never> {
  let id: string | null = null;
  try {
    // Sin fecha, la de hoy en UTC (la DOF/ va en UTC), como FPL.AR. Se resuelve acá, en el server.
    const hoy = new Date().toISOString().slice(0, 10);
    const f = normalizar(formulario.dofUtc ? formulario : { ...formulario, dofUtc: hoy });
    const res = await apiFetch("/planes-de-vuelo", {
      method: "POST",
      body: JSON.stringify({ formulario: f, aircraft_id: f.aircraftId, completo: revisar(f).completo }),
    });
    if (!res.ok) return { error: await detalle(res, "No se pudo crear el plan de vuelo.") };
    id = ((await res.json()) as { id: string }).id;
    revalidatePath(LISTA);
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "Error de conexión con el servidor." };
  }
  redirect(`${LISTA}/${id}`);
}

/**
 * El mismo vuelo otro día: copia el plan sin fecha, hora ni demoras, y abre el editor.
 * Es lo que más usa Federico en FPL.AR: casi todos sus planes son repetidos.
 */
export async function duplicarPlan(id: string): Promise<{ error: string } | never> {
  const plan = await leerPlan(id);
  if (!plan) return { error: "No se encontró el plan para duplicar." };
  return crearPlan(duplicar(leerFormulario(plan.formulario)));
}

/** El guardado del editor, mientras se escribe. */
export async function guardarPlan(id: string, formulario: FormularioPlan) {
  try {
    const f = normalizar(formulario);
    const res = await apiFetch(`/planes-de-vuelo/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ formulario: f, aircraft_id: f.aircraftId, completo: revisar(f).completo }),
    });
    if (!res.ok) return { error: await detalle(res, "No se pudo guardar el plan.") };
    revalidatePath(LISTA);
    return { ok: true as const };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "Sin conexión: el plan no se guardó." };
  }
}

/** Anota que se bajó o compartió el PDF. */
export async function marcarDescargado(id: string) {
  try {
    const res = await apiFetch(`/planes-de-vuelo/${id}`, { method: "PATCH", body: JSON.stringify({ descargado: true }) });
    if (!res.ok) return { error: await detalle(res, "No se pudo anotar la descarga.") };
    revalidatePath(LISTA);
    return { ok: true as const };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "Error de conexión con el servidor." };
  }
}

/** Las demoras avisadas (DLA): hasta tres por vuelo (AIP ENR 1.10, 7.3). */
export async function guardarDemoras(id: string, demoras: Demora[]) {
  try {
    const res = await apiFetch(`/planes-de-vuelo/${id}`, { method: "PATCH", body: JSON.stringify({ demoras }) });
    if (!res.ok) return { error: await detalle(res, "No se pudo guardar la demora.") };
    revalidatePath(LISTA);
    return { ok: true as const };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "Error de conexión con el servidor." };
  }
}

export async function borrarPlan(id: string) {
  try {
    const res = await apiFetch(`/planes-de-vuelo/${id}`, { method: "DELETE" });
    if (!res.ok) return { error: await detalle(res, "No se pudo borrar el plan.") };
    revalidatePath(LISTA);
    return { ok: true as const };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "Error de conexión con el servidor." };
  }
}

/** La firma del piloto, para los PDF que vienen. */
export async function guardarFirma(png: string) {
  try {
    const res = await apiFetch("/planes-de-vuelo/firma", { method: "PUT", body: JSON.stringify({ png }) });
    if (!res.ok) return { error: await detalle(res, "No se pudo guardar la firma.") };
    return { ok: true as const };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "Error de conexión con el servidor." };
  }
}

export async function borrarFirma() {
  try {
    await apiFetch("/planes-de-vuelo/firma", { method: "DELETE" });
    return { ok: true as const };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "Error de conexión con el servidor." };
  }
}

/**
 * Lo fijo del avión para el plan (`aircraft.plan_vuelo`). Lo usan el Hangar y el botón
 * "Guardar en el avión" del editor. Revalida donde se lee la lista de aviones.
 */
export async function guardarPerfilAvion(aircraftId: string, perfil: PerfilAvionPlan) {
  try {
    const res = await apiFetch(`/aircraft/${aircraftId}`, { method: "PATCH", body: JSON.stringify({ plan_vuelo: perfil }) });
    if (!res.ok) return { error: await detalle(res, "No se pudo guardar el perfil del avión.") };
    revalidatePath("/dashboard/settings");
    revalidatePath(LISTA);
    revalidatePath("/dashboard/planificador");
    return { ok: true as const };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "Error de conexión con el servidor." };
  }
}

/** El plan queda cancelado sin mandar nada: el piloto bajó la cancelación para mandarla él. */
export async function marcarCancelado(id: string) {
  try {
    const res = await apiFetch(`/planes-de-vuelo/${id}`, { method: "PATCH", body: JSON.stringify({ cancelado: true }) });
    if (!res.ok) return { error: await detalle(res, "No se pudo anotar la cancelación.") };
    revalidatePath(LISTA);
    revalidatePath("/dashboard");
    return { ok: true as const };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "Error de conexión con el servidor." };
  }
}

/**
 * "No lo volé", desde el "¿Ya volaste?" del inicio: el plan queda descartado y el inicio
 * deja de preguntar. Es un `<form action>` sin cliente alrededor, como "No lo volé" de los
 * vuelos programados.
 */
export async function descartarPlanForm(id: string) {
  try {
    await apiFetch(`/planes-de-vuelo/${id}`, { method: "PATCH", body: JSON.stringify({ descartado: true }) });
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
  }
  revalidatePath("/dashboard");
  revalidatePath(LISTA);
}

/** Si el envío a la oficina ARO/AIS está prendido (`PLAN_DE_VUELO_ENVIO_ARO=1` en el `.env`). */
function envioAroActivo(): boolean {
  return process.env.PLAN_DE_VUELO_ENVIO_ARO === "1";
}

/**
 * Lo que comparten el plan y la demora antes de mandarse: el plan guardado, el mail del
 * piloto, la firma y la oficina. Todo se rearma en el server con lo guardado, no con lo que
 * mande el navegador: el mail sólo puede ir al piloto o a una oficina de la AIC.
 */
const fallo = (error: string) => ({ ok: false as const, error });

async function prepararEnvio(id: string, modo: ModoEnvio) {
  if (modo === "aro" && !envioAroActivo()) return fallo("El envío a la oficina todavía no está activado.");

  // Primero el backend: si lee el plan, el token es auténtico y su mail también.
  const guardado = await leerPlan(id);
  if (!guardado) return fallo("No se encontró el plan.");
  if ((guardado.envios?.length ?? 0) >= 20) return fallo("Este plan ya se mandó 20 veces.");
  if (guardado.cancelado_at) return fallo("Este plan está cancelado. Si vas a volar, duplicalo y presentá uno nuevo.");
  const email = await emailDeLaSesion();
  if (!email) return fallo("No pudimos leer el mail de tu cuenta. Volvé a entrar y probá de nuevo.");

  const f = leerFormulario(guardado.formulario);
  const r = revisar(f, new Date().toISOString());
  if (!r.completo) return fallo("Al plan le faltan casillas: completalo antes de mandarlo.");
  const [firma, piloto] = await Promise.all([firmaGuardada(), pilotoParaPlan()]);
  if (!firma) return fallo("Falta tu firma: la AIC pide el plan firmado.");

  const oficinas = oficinasAro();
  const oficina =
    oficinas.find((o) => o.oaci === f.oficina) ?? (f.salida ? oficinaParaSalida(f.salida, oficinas)?.oficina : null) ?? null;
  if (modo === "aro" && !oficina) return fallo("Elegí la oficina ARO/AIS.");

  return {
    ok: true as const,
    guardado,
    email,
    f,
    r,
    piloto,
    firmaPng: new Uint8Array(Buffer.from(firma.split(",")[1] ?? "", "base64")),
    oficina: oficina ? { correo: oficina.correo, nombre: oficina.nombre, oaci: oficina.oaci } : null,
    nombres: { salida: f.salida?.nombre ?? "", destino: f.destino?.nombre ?? "" },
  };
}

/** Un fondo de formulario, leído del disco del server (los mismos que usa el navegador). */
function fondo(archivo: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(process.cwd(), "src", "lib", archivo)));
}

/**
 * Manda el plan por mail con el PDF firmado: de prueba al piloto, o a la oficina ARO/AIS
 * con copia al piloto (`lib/plan-de-vuelo-mail.ts`).
 *
 * **El envío a la oficina se prende con `PLAN_DE_VUELO_ENVIO_ARO=1`**: Federico lo aprobó
 * el 2026-10-20, después de recibir la prueba. Sin la variable sólo sale la prueba.
 */
export async function enviarPlan(id: string, modo: ModoEnvio) {
  try {
    const p = await prepararEnvio(id, modo);
    if (!p.ok) return { error: p.error };
    if (modo === "aro" && p.r.avisos.some((a) => a.campo === "fechaHora")) {
      return { error: "La salida ya pasó: revisá la fecha y la hora antes de mandarlo a la oficina." };
    }

    const { pdfPlanDeVuelo } = await import("@/lib/plan-de-vuelo-pdf");
    const pdf = await pdfPlanDeVuelo(p.r.plan, { fondoJpg: fondo("plan-de-vuelo-eana.jpg"), firmaPng: p.firmaPng });
    const mail = armarMailPlan({ plan: p.r.plan, nombres: p.nombres, piloto: p.email, oficina: p.oficina, modo });
    const enviado = await enviarMail({
      para: mail.para,
      cc: mail.cc,
      responderA: mail.responderA,
      asunto: mail.asunto,
      texto: mail.texto,
      html: mail.html,
      adjuntos: [{ nombre: nombreDelArchivo(p.r.plan), base64: Buffer.from(pdf).toString("base64") }],
      nombreRemitente: p.piloto.nombre ? `${p.piloto.nombre} vía Vector` : undefined,
      casilla: "plandevuelo",
    });
    if (!enviado.enviado) return { error: `No se pudo mandar el mail: ${enviado.motivo ?? "error desconocido"}` };

    // Si no se puede anotar, el mail igual salió: se dice, pero no es un error.
    const anotado = await apiFetch(`/planes-de-vuelo/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ envio: { modo, tipo: "fpl", a: mail.para, resend_id: enviado.id ?? null } }),
    });
    revalidatePath(LISTA);
    return { ok: true as const, a: mail.para, cc: mail.cc, anotado: anotado.ok };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "Error de conexión con el servidor." };
  }
}

/**
 * Manda el aviso de demora (DLA, AIP ENR 1.10, punto 7) con su formulario firmado, a la
 * misma oficina que el plan. La nueva hora se recalcula acá con las demoras guardadas.
 *
 * **Sólo el envío a la oficina anota la demora** (una de las tres del 7.3): la prueba no
 * gasta ninguna. Y se anota después de que el mail salió, en el mismo PATCH que el envío.
 */
export async function enviarDemora(id: string, modo: ModoEnvio, hora: string) {
  try {
    const p = await prepararEnvio(id, modo);
    if (!p.ok) return { error: p.error };
    const demoras = p.guardado.demoras ?? [];
    const chequeo = revisarDemora(p.f, demoras, new Date().toISOString());
    if (chequeo.error) return { error: chequeo.error };
    const nueva = demoraDesdeHoraUtc(p.f, demoras, hora);
    const anterior = eobtVigente(p.f, demoras);
    if (!nueva || !anterior) return { error: "Escribí la nueva hora de salida en UTC, como 1930." };

    const plan = planConDemora(p.r.plan, nueva);
    const { pdfDemora } = await import("@/lib/plan-de-vuelo-pdf");
    const pdf = await pdfDemora(
      { plan, eobt: nueva.eobt, c18: plan.c18, nombre: (p.piloto.nombre || p.f.piloto).toUpperCase(), licencia: p.piloto.licencia ?? "" },
      { fondoPng: fondo("plan-de-vuelo-dla.png"), firmaPng: p.firmaPng }
    );
    const mail = armarMailPlan({
      plan,
      nombres: p.nombres,
      piloto: p.email,
      oficina: p.oficina,
      modo,
      aviso: { tipo: "dla", eobtAnterior: anterior.eobt },
    });
    const enviado = await enviarMail({
      para: mail.para,
      cc: mail.cc,
      responderA: mail.responderA,
      asunto: mail.asunto,
      texto: mail.texto,
      html: mail.html,
      adjuntos: [{ nombre: nombreDeDemora(p.r.plan, nueva), base64: Buffer.from(pdf).toString("base64") }],
      nombreRemitente: p.piloto.nombre ? `${p.piloto.nombre} vía Vector` : undefined,
      casilla: "plandevuelo",
    });
    if (!enviado.enviado) return { error: `No se pudo mandar el mail: ${enviado.motivo ?? "error desconocido"}` };

    const nuevas = modo === "aro" ? [...demoras, { ...nueva, creada: new Date().toISOString() }] : demoras;
    const anotado = await apiFetch(`/planes-de-vuelo/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        ...(modo === "aro" ? { demoras: nuevas } : {}),
        envio: { modo, tipo: "dla", a: mail.para, resend_id: enviado.id ?? null },
      }),
    });
    revalidatePath(LISTA);
    return { ok: true as const, a: mail.para, cc: mail.cc, eobt: nueva.eobt, demoras: nuevas, anotado: anotado.ok };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "Error de conexión con el servidor." };
  }
}

/**
 * Manda la cancelación (CNL, AIP ENR 1.10 Apéndice 5) con su formulario firmado, a la misma
 * oficina que el plan, con la salida vigente (la de la última demora, si hubo). Se anota
 * después de que el mail salió, y un plan cancelado no se vuelve a cancelar: si el vuelo se
 * hace igual, va un plan nuevo.
 */
export async function cancelarPlan(id: string, modo: ModoEnvio = "aro") {
  try {
    const p = await prepararEnvio(id, modo);
    if (!p.ok) return { error: p.error };
    const demoras = p.guardado.demoras ?? [];
    const plan = planVigente(p.r.plan, demoras);

    const { pdfCancelacion } = await import("@/lib/plan-de-vuelo-pdf");
    const pdf = await pdfCancelacion(
      { plan, eobt: plan.c13hora, c18: plan.c18, nombre: (p.piloto.nombre || p.f.piloto).toUpperCase(), licencia: p.piloto.licencia ?? "" },
      { fondoPng: fondo("plan-de-vuelo-cnl.png"), firmaPng: p.firmaPng }
    );
    const mail = armarMailPlan({ plan, nombres: p.nombres, piloto: p.email, oficina: p.oficina, modo, aviso: { tipo: "cnl" } });
    const enviado = await enviarMail({
      para: mail.para,
      cc: mail.cc,
      responderA: mail.responderA,
      asunto: mail.asunto,
      texto: mail.texto,
      html: mail.html,
      adjuntos: [{ nombre: nombreDeCancelacion(p.r.plan, demoras), base64: Buffer.from(pdf).toString("base64") }],
      nombreRemitente: p.piloto.nombre ? `${p.piloto.nombre} vía Vector` : undefined,
      casilla: "plandevuelo",
    });
    if (!enviado.enviado) return { error: `No se pudo mandar el mail: ${enviado.motivo ?? "error desconocido"}` };

    const anotado = await apiFetch(`/planes-de-vuelo/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        ...(modo === "aro" ? { cancelado: true } : {}),
        envio: { modo, tipo: "cnl", a: mail.para, resend_id: enviado.id ?? null },
      }),
    });
    revalidatePath(LISTA);
    revalidatePath("/dashboard");
    return { ok: true as const, a: mail.para, cc: mail.cc, anotado: anotado.ok };
  } catch (e) {
    if (esErrorDeRedirect(e)) throw e;
    return { error: "Error de conexión con el servidor." };
  }
}
