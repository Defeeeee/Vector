import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { enviarMail, mailConfigurado } from "@/lib/mailer";
import { enviarConSeguimiento } from "@/lib/mail-envio";
import { leerFormulario, localDesdeUtc } from "@/lib/formulario-plan";
import { horariosDelPlan, hrefRegistrarDesdePlan, recordarAhora, yaEstaEnLaBitacora } from "@/lib/plan-cierre";
import { armarMensajePlanPorRegistrar, type DatosPlanPorRegistrar } from "@/lib/plan-por-registrar-mail";
import type { Demora } from "@/lib/demora-plan";

// Local por defecto, con /api, como los otros barridos (ver `lib/api.ts`).
const API_URL = process.env.API_URL || "http://127.0.0.1:7477/api";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://vector.fdiaznem.com.ar";

/**
 * El mail "¿Cargamos tu vuelo?" de los planes de vuelo ya volados (Federico, 2026-10-20).
 *
 * Cada diez minutos, desde el crontab del server:
 *
 *   *\/10 * * * * ~/bin/vector-plan-por-registrar.sh
 *
 * El backend (`GET /planes-de-vuelo/recordatorios`) dice qué planes **pueden** necesitarlo:
 * presentados, sin cerrar, sin su mail y de los últimos días. Acá se decide con la hora
 * (la llegada estimada más una hora y media, `recordarAhora`), se saltea el vuelo que ya
 * está en la bitácora aunque no se haya cargado desde el plan, se manda y se avisa cuáles
 * salieron (`POST …/enviados`). Correrlo dos veces no manda dos mails.
 *
 * Sin proveedor de correo no falla: no hace nada y lo dice, y no marca nada.
 *
 * `?prueba=<mail>` manda una muestra a ese mail, con un plan inventado, y no toca nada.
 */
function secretosCoinciden(recibido: string, esperado: string): boolean {
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

interface Pendiente {
  id: string;
  user_id: string;
  email: string;
  first_name: string | null;
  formulario: unknown;
  demoras: Demora[];
  vuelos: { date: string | null; route: string | null }[];
}

/** Lo que dice el mail de un plan, o `null` si no tiene hora (no debería pasar: está completo). */
function datosDelPlan(id: string, nombre: string | null, formulario: unknown, demoras: Demora[]): DatosPlanPorRegistrar | null {
  const f = leerFormulario(formulario);
  const h = horariosDelPlan(f, demoras);
  if (!h) return null;
  const llegada = localDesdeUtc(new Date(h.llegadaMs).toISOString().slice(0, 10), h.llegada);
  const salida = f.salida?.codigo ?? "";
  const destino = f.destino?.codigo || salida;
  const local = destino === salida;
  return {
    nombre,
    ruta: local ? `${salida} (local)` : `${salida} → ${destino}`,
    rutaConNombres: !local && f.salida?.nombre && f.destino?.nombre ? `${f.salida.nombre} a ${f.destino.nombre}` : null,
    matricula: f.matricula || null,
    dia: llegada ? `${llegada.fecha.slice(8, 10)}/${llegada.fecha.slice(5, 7)}` : "",
    llegada: llegada?.hora ?? "",
    registrar: `${APP_URL}${hrefRegistrarDesdePlan(id, f, demoras)}`,
    appUrl: APP_URL,
  };
}

export async function POST(req: NextRequest) {
  const esperado = process.env.DOCUMENTS_ALERT_SECRET;
  if (!esperado) return NextResponse.json({ error: "Barrido no configurado" }, { status: 503 });
  if (!secretosCoinciden(req.headers.get("X-Cron-Secret") ?? "", esperado)) {
    return NextResponse.json({ error: "Secreto inválido" }, { status: 401 });
  }
  if (!mailConfigurado()) {
    const prueba = await enviarMail({ para: "x@x", asunto: "", texto: "", html: "" });
    return NextResponse.json({ enviados: 0, motivo: prueba.motivo });
  }

  const prueba = new URL(req.url).searchParams.get("prueba");
  if (prueba) {
    const datos = datosDelPlan(
      "00000000-0000-0000-0000-000000000000",
      null,
      {
        matricula: "LVABC",
        salida: { codigo: "SADF", nombre: "San Fernando" },
        destino: { codigo: "SADM", nombre: "Morón" },
        dofUtc: new Date().toISOString().slice(0, 10),
        eobtUtc: "1830",
        eet: "0045",
      },
      []
    );
    if (!datos) return NextResponse.json({ error: "No se pudo armar la muestra" }, { status: 500 });
    const r = await enviarConSeguimiento({ para: prueba, userId: null, tipo: "plan-por-registrar", mensaje: armarMensajePlanPorRegistrar(datos) });
    return NextResponse.json({ prueba: true, enviado: r.enviado, motivo: r.motivo ?? r.aviso ?? null });
  }

  let pendientes: Pendiente[];
  try {
    const res = await fetch(`${API_URL}/planes-de-vuelo/recordatorios`, { headers: { "X-Cron-Secret": esperado }, cache: "no-store" });
    if (!res.ok) return NextResponse.json({ error: `El backend contestó ${res.status}` }, { status: 502 });
    pendientes = await res.json();
  } catch (err) {
    return NextResponse.json({ error: `No se pudo consultar el backend: ${err}` }, { status: 502 });
  }

  const ahoraIso = new Date().toISOString();
  const exitosos: string[] = [];
  const problemas: string[] = [];
  let todaviaNo = 0;
  let yaCargados = 0;
  for (const p of pendientes) {
    const f = leerFormulario(p.formulario);
    const demoras = p.demoras ?? [];
    if (!recordarAhora(f, demoras, ahoraIso)) {
      todaviaNo++;
      continue;
    }
    if (yaEstaEnLaBitacora(f, demoras, p.vuelos ?? [])) {
      yaCargados++;
      continue;
    }
    const datos = datosDelPlan(p.id, p.first_name, p.formulario, demoras);
    if (!datos) continue;
    const r = await enviarConSeguimiento({ para: p.email, userId: p.user_id, tipo: "plan-por-registrar", clave: p.id, mensaje: armarMensajePlanPorRegistrar(datos) });
    if (r.aviso) problemas.push(`${p.id}: ${r.aviso}`);
    if (r.enviado) exitosos.push(p.id);
    // Sin el mail en el log: el id del plan alcanza para buscarlo.
    else problemas.push(`${p.id}: ${r.motivo ?? "no se pudo enviar"}`);
  }

  let marcados = 0;
  if (exitosos.length) {
    try {
      const res = await fetch(`${API_URL}/planes-de-vuelo/recordatorios/enviados`, {
        method: "POST",
        headers: { "X-Cron-Secret": esperado, "Content-Type": "application/json" },
        body: JSON.stringify({ ids: exitosos }),
      });
      if (res.ok) marcados = (await res.json()).marcados ?? 0;
      else problemas.push(`marcar enviados: el backend contestó ${res.status}`);
    } catch (err) {
      problemas.push(`marcar enviados: ${err}`);
    }
  }

  return NextResponse.json({ candidatos: pendientes.length, todaviaNo, yaCargados, enviados: exitosos.length, marcados, problemas });
}
