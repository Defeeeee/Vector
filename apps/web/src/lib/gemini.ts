/**
 * Qué modelos de Gemini usa Vector, y qué hace cuando Google está saturado.
 *
 * El copiloto (web y WhatsApp) y la importación del libro en PDF usan la misma cadena:
 * primero un Flash-Lite, rápido y barato, y si Google contesta que está saturado, el
 * siguiente de la lista, hasta el último.
 *
 * **Por qué una cadena y no un par.** El 2026-09-23 el copiloto contestó "503 ... high
 * demand" con `gemini-3.1-flash-lite` y se agregó un respaldo. El 2026-09-24 dieron 503
 * **los dos a la vez** (`3.5-flash-lite` y `3.8-flash`), y también `gemini-flash-latest`
 * y `3.1-flash-lite`, mientras `3.5-flash` y `2.5-flash` contestaban bien, medido
 * desde el VPS con dos pedidos por modelo. La saturación va por modelo y no por
 * generación, así que el respaldo se reparte entre generaciones distintas.
 *
 * Los nombres salen del listado del API (`GET /v1beta/models` con la clave de
 * producción, 2026-09-24). Todos soportan function calling, salida con JSON schema,
 * PDF y audio, que es lo que usan las tres rutas.
 */
import type {
  Content,
  ContentListUnion,
  GenerateContentConfig,
  GenerateContentResponse,
  GoogleGenAI,
  PartListUnion,
} from "@google/genai";

export const MODELOS_GEMINI = ["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-3.5-flash", "gemini-2.5-flash"] as const;
export const MODELO_GEMINI = MODELOS_GEMINI[0];

/**
 * Cuánto se espera a un modelo antes de pasar al siguiente. **Hace falta un tope**: el
 * 2026-09-24 un pedido a `gemini-3.5-flash` quedó colgado cinco minutos, sin 503 ni
 * respuesta, hasta que se cortó la conexión. Sin tope, un modelo que no contesta frena
 * la cadena entera. El copiloto contesta en segundos; leer un libro de muchas hojas en
 * PDF puede llevar bastante más, así que el importador pasa su propio tope.
 */
export const ESPERA_GEMINI_MS = 30_000;

/**
 * ¿El error es de capacidad de Google (vale probar con otro modelo) y no nuestro?
 *
 * 503 es "sobrecargado", 500 un error interno suyo, y 429 el límite de pedidos, que
 * Google cuenta por modelo: el de respaldo tiene su propio cupo. 504 es el tope de
 * espera vencido del lado de Google: el SDK le manda `ESPERA_GEMINI_MS` en la cabecera
 * `X-Server-Timeout`, y cuando vence contesta `DEADLINE_EXCEEDED` en vez de dejar que se
 * corte la conexión (visto el 2026-09-24). Un 400 (pedido mal armado) o un 403 (clave)
 * fallarían igual con cualquier modelo.
 */
export function esSaturacion(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === "number") return status === 429 || status === 500 || status === 503 || status === 504;
  const mensaje = err instanceof Error ? err.message : String(err ?? "");
  return /\[(429|500|503|504)\b|overloaded|high demand|UNAVAILABLE|RESOURCE_EXHAUSTED|DEADLINE_EXCEEDED/i.test(mensaje);
}

/**
 * Lo que las rutas le pasan al cliente: sólo `models` y `chats`, para que el test
 * pueda poner un Gemini de mentira sin red.
 */
type ClienteGemini = { models: Pick<GoogleGenAI["models"], "generateContent">; chats: Pick<GoogleGenAI["chats"], "create"> };

/**
 * ¿El modelo no contestó a tiempo? El SDK corta el intento con un `AbortController`
 * cuando vence `httpOptions.timeout`, y `fetch` lo rechaza como `AbortError`.
 *
 * Reintentar en otro modelo es seguro aunque Google haya llegado a procesar el pedido:
 * generar no tiene efectos. Las herramientas —registrar un vuelo— las ejecuta la ruta
 * después de leer la respuesta, y un pedido cortado no llega a ninguna.
 */
export function noContesto(err: unknown): boolean {
  const nombre = (err as { name?: unknown } | null)?.name;
  return nombre === "AbortError" || nombre === "TimeoutError";
}

const convieneOtroModelo = (err: unknown) => esSaturacion(err) || noContesto(err);

/** El config con el tope de espera por intento. */
const conEspera = (config: GenerateContentConfig, esperaMs: number): GenerateContentConfig => ({
  ...config,
  httpOptions: { ...config.httpOptions, timeout: esperaMs },
});

function avisarCambio(modelo: string, siguiente: string, err: unknown) {
  console.warn(`Gemini: ${modelo} no respondió (${(err as Error).message}); sigo con ${siguiente}.`);
}

/**
 * Un chat que, si un mensaje falla por saturación o no contesta a tiempo, lo reenvía al modelo siguiente de
 * la cadena con la misma historia.
 *
 * Se cambia **por mensaje** y no reintentando el turno entero: entre un mensaje y el
 * siguiente el copiloto puede haber ejecutado una herramienta —registrar un vuelo—, y
 * repetir el turno la repetiría. El SDK sólo agrega a la historia los mensajes que
 * salieron bien (`recordHistory` corre sólo si `generateContent` resolvió), así que la
 * historia que se copia es exactamente la de antes del fallo. Una vez en un modelo de
 * respaldo, el resto del turno sigue ahí: volver al saturado sería esperar otro 503.
 */
export function chatConRespaldo(
  ai: ClienteGemini,
  config: GenerateContentConfig,
  history: Content[] = [],
  esperaMs = ESPERA_GEMINI_MS,
) {
  config = conEspera(config, esperaMs);
  let i = 0;
  let chat = ai.chats.create({ model: MODELOS_GEMINI[i], config, history });
  return {
    get modelo() {
      return MODELOS_GEMINI[i];
    },
    async sendMessage(message: PartListUnion): Promise<GenerateContentResponse> {
      for (;;) {
        try {
          return await chat.sendMessage({ message });
        } catch (err) {
          if (i === MODELOS_GEMINI.length - 1 || !convieneOtroModelo(err)) throw err;
          avisarCambio(MODELOS_GEMINI[i], MODELOS_GEMINI[i + 1], err);
          const anterior = chat.getHistory();
          i++;
          chat = ai.chats.create({ model: MODELOS_GEMINI[i], config, history: anterior });
        }
      }
    },
  };
}

/** Un pedido suelto (sin chat), con la misma cadena. */
export async function generarConRespaldo(
  ai: ClienteGemini,
  config: GenerateContentConfig,
  contents: ContentListUnion,
  esperaMs = ESPERA_GEMINI_MS,
): Promise<GenerateContentResponse> {
  config = conEspera(config, esperaMs);
  for (let i = 0; ; i++) {
    try {
      return await ai.models.generateContent({ model: MODELOS_GEMINI[i], config, contents });
    } catch (err) {
      if (i === MODELOS_GEMINI.length - 1 || !convieneOtroModelo(err)) throw err;
      avisarCambio(MODELOS_GEMINI[i], MODELOS_GEMINI[i + 1], err);
    }
  }
}
