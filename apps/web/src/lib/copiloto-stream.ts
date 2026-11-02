/**
 * El copiloto de la web, de a pedazos (`/api/chat` → `ConversacionCopiloto`). La parte
 * pura, que usan el servidor y el navegador.
 *
 * La ruta contesta con NDJSON: un evento JSON por renglón, a medida que pasan las cosas.
 * Así el piloto ve al instante que el copiloto está trabajando ("Leyendo tu bitácora…"),
 * qué herramienta usa ("Buscando en la RAAC…") y la respuesta mientras Gemini la escribe,
 * en vez de mirar un indicador hasta que llega todo junto.
 */
export type EventoCopiloto =
  /** Qué está haciendo ahora. Lo reemplaza el siguiente. */
  | { tipo: "estado"; texto: string }
  /** La respuesta hasta acá, **entera** (no un pedazo suelto): el cliente la reemplaza. */
  | { tipo: "texto"; texto: string }
  /** La respuesta final, y el vuelo propuesto que espera el "sí" del piloto. */
  | { tipo: "fin"; texto: string; pendingFlight?: Record<string, unknown> }
  | { tipo: "error"; error: string };

export const TIPO_NDJSON = "application/x-ndjson; charset=utf-8";

export const lineaDeEvento = (e: EventoCopiloto): string => `${JSON.stringify(e)}\n`;

/** Los eventos completos de lo que llegó, y lo que quedó a medias para la próxima lectura. */
export function leerEventos(buffer: string): { eventos: EventoCopiloto[]; resto: string } {
  const renglones = buffer.split("\n");
  const resto = renglones.pop() ?? "";
  const eventos: EventoCopiloto[] = [];
  for (const r of renglones) {
    if (!r.trim()) continue;
    try {
      eventos.push(JSON.parse(r));
    } catch {
      // Un renglón roto no corta la conversación: se saltea.
    }
  }
  return { eventos, resto };
}

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

/**
 * Scrubs internal database IDs out of anything the pilot will read. The model
 * needs the UUIDs in its context to call update_flight/delete_flight, and it
 * used to echo them back ("... [ID: d8342011-...]"), which is an implementation
 * detail leaking into the product.
 */
export function stripInternalIds(text: string): string {
  return text
    // "[ID: uuid]", "(ID: uuid)" and bare "ID: uuid" — with any surrounding space.
    .replace(new RegExp(`\\s*[\\[(]\\s*ID:\\s*${UUID}\\s*[\\])]`, "gi"), "")
    .replace(new RegExp(`\\s*\\bID:\\s*${UUID}\\b`, "gi"), "")
    // Anything that still slipped through as a naked UUID.
    .replace(new RegExp(UUID, "gi"), "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Lo que ya se puede mostrar de una respuesta que todavía se está escribiendo.
 *
 * `stripInternalIds` sólo reconoce un UUID entero, y mientras llega puede estar por la
 * mitad ("[ID: d8342011-…"). Se retiene lo que puede ser el principio de uno —un corchete
 * o un paréntesis sin cerrar cerca del final, "ID:", o una tira de hexadecimales— hasta
 * que llegue el resto. Al terminar se muestra todo, ya limpio.
 */
export function parteSegura(texto: string): string {
  const m = texto.match(/([[(][^\])]{0,60}|\bID:\s*[0-9a-fA-F-]*|[0-9a-fA-F-]{6,})$/);
  return stripInternalIds(m ? texto.slice(0, m.index) : texto);
}

/** Qué decir mientras corre cada herramienta. */
export function estadoDeHerramienta(nombre: string, args: Record<string, unknown> = {}): string {
  switch (nombre) {
    case "log_flight":
      return "Armando el vuelo…";
    case "update_flight":
      return "Corrigiendo el vuelo…";
    case "delete_flight":
      return "Borrando el vuelo…";
    case "consultar_raac":
      return "Buscando en la RAAC…";
    case "get_airport_info": {
      const icao = String(args.icao_code ?? "").trim().toUpperCase();
      return icao ? `Consultando ${icao} en ANAC…` : "Consultando ANAC…";
    }
    default:
      return "Pensando…";
  }
}

/**
 * El vuelo propuesto que espera confirmación: **sólo si es lo último que dijo el
 * copiloto**. Si el piloto contestó otra cosa en el medio, la propuesta quedó cancelada,
 * como en WhatsApp: un "sí" más tarde no puede escribir un vuelo viejo.
 */
export function propuestaVigente(
  historial: { role?: string; pendingFlight?: Record<string, unknown> }[] | undefined,
): Record<string, unknown> | null {
  const ultimo = historial?.[historial.length - 1];
  return ultimo?.role === "assistant" && ultimo.pendingFlight ? ultimo.pendingFlight : null;
}
