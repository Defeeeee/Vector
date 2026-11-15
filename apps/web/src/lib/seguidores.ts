/**
 * Los seguidores del piloto (`/seguidores` del backend, migración 056): quién puede ver sus vuelos en
 * Vector Tracker. Lo puro.
 *
 * - El piloto genera un **link de invitación** (`<tracker>/invitacion/<token>`, de un solo uso, vence a
 *   los 7 días) y lo manda él por WhatsApp o lo que quiera. Quien lo abre entra con Google y queda como
 *   seguidor. El piloto ve "pendiente" o "<nombre> entró" y lo anula o lo quita cuando quiera.
 * - **Qué vuelo ve cada uno se asigna a mano** (por defecto ninguno). El link público `/seguir/<token>`
 *   no cambia ni depende de esto.
 */

export interface Seguidor {
  id: string;
  /** El apodo que le puso el piloto ("Mamá"); sólo lo ve él. */
  apodo: string | null;
  vinculado: boolean;
  /** Nombre de pila de quien entró (sólo si ya aceptó). */
  nombre: string | null;
  /** El link de invitación, mientras está pendiente. */
  link: string | null;
  vencida: boolean;
  /** AAAA-MM-DD argentino en que vence el link, escrito en el server (invariante 1). */
  venceTexto: string | null;
}

/** El link de invitación del tracker. */
export function urlDeInvitacion(trackerUrl: string, token: string): string {
  return `${trackerUrl.replace(/\/+$/, "")}/invitacion/${encodeURIComponent(token)}`;
}

const texto = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** "Mamá" o, sin apodo, el nombre de quien entró, o "Invitación sin nombre". */
export function rotuloDeSeguidor(s: Pick<Seguidor, "apodo" | "nombre" | "vinculado">): string {
  if (s.apodo) return s.apodo;
  if (s.vinculado && s.nombre) return s.nombre;
  return s.vinculado ? "Alguien que entró" : "Invitación sin nombre";
}

/** "pendiente", "vencida" o "Ana entró" (con el nombre de pila si lo hay). */
export function estadoDeSeguidor(s: Pick<Seguidor, "vinculado" | "nombre" | "vencida">): string {
  if (s.vinculado) return s.nombre ? `${s.nombre} entró` : "Ya entró";
  return s.vencida ? "El link venció" : "Todavía no entró";
}

/** Día argentino de un instante ISO (para "vence el 22/11"), escrito sin `toLocaleString`. */
export function diaYMesArgentino(iso: string): string | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t - 3 * 3600_000);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** De la respuesta del backend. `trackerUrl` arma el link; lo que no tiene la forma se descarta. */
export function seguidoresDeRespuesta(json: unknown, trackerUrl: string): Seguidor[] {
  if (!Array.isArray(json)) return [];
  const salida: Seguidor[] = [];
  for (const f of json as Record<string, unknown>[]) {
    if (!f || typeof f.id !== "string") continue;
    const vinculado = f.vinculado === true;
    const token = texto(f.invitacion_token);
    const vence = texto(f.invitacion_vence_at);
    salida.push({
      id: f.id,
      apodo: texto(f.apodo),
      vinculado,
      nombre: texto(f.nombre),
      link: !vinculado && token ? urlDeInvitacion(trackerUrl, token) : null,
      vencida: !vinculado && f.vencida === true,
      venceTexto: !vinculado && vence ? diaYMesArgentino(vence) : null,
    });
  }
  return salida;
}

/** Los que ya entraron: los únicos a quienes se les puede asignar un vuelo. */
export function vinculados(lista: Seguidor[]): Seguidor[] {
  return lista.filter((s) => s.vinculado);
}

/** Prende o apaga a uno en la lista de asignados, sin repetir y en orden estable. */
export function alternarAsignado(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id].sort();
}

/** El texto que acompaña al link al mandarlo. Habla el piloto, así que no hace falta su nombre (ni el apodo, que es sólo suyo). */
export const TEXTO_DE_INVITACION = "Te invito a seguir mis vuelos en Vector Tracker. Entrá con Google desde este link:";
