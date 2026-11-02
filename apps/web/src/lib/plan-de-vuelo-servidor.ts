import { apiFetch } from "./api";
import { getSessionToken } from "@/actions/auth";
import { esAlumno } from "./licencias";
import type { Aircraft, Profile } from "@/types";
import type { PilotoParaPlan } from "./formulario-plan";

const FRESCO = { next: { revalidate: 0 } } as RequestInit;

/**
 * Lo que leen del backend las pantallas del plan de vuelo. Server-only (usa `apiFetch`).
 *
 * **Todo se lee sin cache** (`FRESCO`). `apiFetch` guarda los GET 20 segundos y después
 * sirve lo viejo mientras revalida; guardar el plan no invalida esa copia. Así, abrir de
 * nuevo un plan mostraba una versión anterior, y el guardado automático la volvía a escribir
 * encima de la nueva: se "borraba" lo que se había elegido (2026-10-19). Y al mandar el
 * plan por mail, el server leía un plan viejo y decía que le faltaban casillas.
 *
 * Todo es tolerante: si algo no se puede leer, la pantalla sigue con el campo vacío y el
 * piloto lo escribe. Ninguna de estas lecturas es el dato central de la pantalla.
 */

/**
 * Del perfil: "Comandante de la aeronave" con nombre, licencia y número —como lo presentó
 * Federico el 10/10/2026: `FEDERICO DIAZ NEMETH PPA 48225513`— y el celular para las
 * observaciones. Un alumno no tiene licencia: va sólo el nombre.
 */
export async function pilotoParaPlan(): Promise<PilotoParaPlan> {
  const vacio = { comandante: "", telefono: "", nombre: "", licencia: "" };
  const res = await apiFetch("/profiles");
  if (!res.ok) return vacio;
  try {
    const p = ((await res.json()) as Profile[])[0];
    if (!p) return vacio;
    const nombre = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
    const tipo = p.license_type && !esAlumno(p.license_type) ? p.license_type : "";
    const numero = tipo ? (p.licencia_numero ?? "").trim() : "";
    return {
      comandante: [nombre, tipo, numero].filter(Boolean).join(" "),
      telefono: p.whatsapp_phone ?? "",
      nombre,
      licencia: numero,
    };
  } catch {
    return vacio;
  }
}

/** Los aviones, sin los simuladores: un plan de vuelo es para algo que vuela. */
export async function avionesParaPlan(): Promise<Aircraft[]> {
  const res = await apiFetch("/aircraft", FRESCO);
  if (!res.ok) return [];
  try {
    return ((await res.json()) as Aircraft[]).filter((a) => !a.is_simulator);
  } catch {
    return [];
  }
}

/** La firma guardada (data URL de un PNG), o `null`. */
export async function firmaGuardada(): Promise<string | null> {
  const res = await apiFetch("/planes-de-vuelo/firma", FRESCO);
  if (!res.ok) return null;
  try {
    const f = (await res.json()) as { png?: string } | null;
    return f?.png ?? null;
  } catch {
    return null;
  }
}

export interface PlanResumen {
  id: string;
  aircraft_id: string | null;
  completo: boolean;
  salida: string | null;
  destino: string | null;
  matricula: string | null;
  dof: string | null;
  eobt: string | null;
  descargado_at: string | null;
  enviado_at?: string | null;
  /** Cómo terminó (migración 026): el vuelo registrado, la cancelación o "no lo volé". */
  vuelo_id?: string | null;
  cancelado_at?: string | null;
  descartado_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnvioPlan {
  modo: "prueba" | "aro";
  /** El plan o un aviso de demora. Los anotados antes de la demora por mail son del plan. */
  tipo?: "fpl" | "dla" | "cnl";
  a: string;
  resend_id?: string | null;
  at?: string | null;
}

export interface PlanGuardado extends PlanResumen {
  formulario: unknown;
  demoras: { eobt: string; dof: string; creada?: string }[];
  envios?: EnvioPlan[];
}

/** La lista de planes. `null` = no se pudo leer (no es lo mismo que "no hay": invariante 2). */
export async function listarPlanes(): Promise<PlanResumen[] | null> {
  const res = await apiFetch("/planes-de-vuelo", FRESCO);
  if (!res.ok) return null;
  try {
    return (await res.json()) as PlanResumen[];
  } catch {
    return null;
  }
}

export async function leerPlan(id: string): Promise<PlanGuardado | null> {
  const res = await apiFetch(`/planes-de-vuelo/${encodeURIComponent(id)}`, FRESCO);
  if (!res.ok) return null;
  try {
    return (await res.json()) as PlanGuardado;
  } catch {
    return null;
  }
}

/**
 * El mail de la cuenta, del token de la sesión (el claim `email` del JWT de Supabase).
 *
 * **Sólo se puede confiar en él después de que el backend aceptó el token**: este archivo
 * no verifica la firma (lo hace el backend). Quien lo usa —`enviarPlan`— primero lee el
 * plan con `apiFetch`, que pasa por el backend con el mismo token; si eso anduvo, el token
 * es auténtico y su `email` también.
 */
export async function emailDeLaSesion(): Promise<string | null> {
  const token = await getSessionToken();
  const payload = token?.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { email?: string };
    return typeof claims.email === "string" && claims.email.includes("@") ? claims.email : null;
  } catch {
    return null;
  }
}
