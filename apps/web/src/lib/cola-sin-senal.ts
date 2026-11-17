/**
 * La cola de vuelos guardados en el teléfono, para registrar sin señal (2026-11-17).
 *
 * Registrar un vuelo es una server action (un POST): sin red, falla. En vez de perder lo
 * escrito, el formulario deja el pedido entero acá y se manda solo cuando vuelve la señal.
 *
 * **Idempotencia:** cada pedido lleva su `clave_cliente` (un uuid que genera el formulario) y
 * el backend (migración 058) devuelve el mismo vuelo si ya lo tiene: un reintento nunca crea
 * dos vuelos ni cobra el saldo dos veces (invariante 3). Por eso mandar dos veces es seguro,
 * aunque haya dos pestañas abiertas o la respuesta se haya perdido.
 *
 * **Sólo vuelos.** Un plan de vuelo mandado tarde puede ser peor que no mandarlo, así que no se
 * encola nunca (ver `EditorPlanDeVuelo`).
 *
 * Puro: la forma de la cola y el procesamiento. Leer y escribir `localStorage` es de
 * `cola-sin-senal-cliente.ts`; se inyecta acá para poder testearlo sin DOM.
 */

export const CLAVE_COLA = "vector-cola-sin-senal";

/** Cuántas veces el servidor puede contestar 5xx antes de dar el pedido por rechazado. */
export const MAX_FALLAS_DEL_SERVIDOR = 6;

export interface EntradaCola {
  /** La `clave_cliente` del vuelo: también es el id de la entrada. */
  id: string;
  tipo: "vuelo";
  /** ISO, cuándo se guardó en el teléfono. */
  creado: string;
  /** Los campos del formulario, como pares (un `FormData` puede repetir nombres). */
  campos: [string, string][];
  /** "SADF → SADM · 1.2 h · LV-ABC", para mostrarlo. */
  resumen: string;
  /** Por qué el backend lo rechazó, si lo hizo. Con error no se reintenta solo. */
  error?: string;
  /** Veces que el servidor contestó con una falla suya (5xx). */
  fallas: number;
}

export type Cola = EntradaCola[];

export type Resultado = { ok: true } | { ok: false; error: string; estado?: number };

export type Veredicto = "ok" | "red" | "servidor" | "rechazado";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const esClaveValida = (c: unknown): c is string => typeof c === "string" && UUID.test(c);

/** Un uuid v4. `crypto.randomUUID` sólo existe en contextos seguros; sin él, `getRandomValues`. */
export function nuevaClave(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Qué hacer con lo que contestó el backend: "ok", "red" (sin señal o sesión vencida: se queda y
 * se reintenta sin contar), "servidor" (5xx: se reintenta, con tope) o "rechazado" (validación:
 * queda marcado con su error). Un error sin `estado` es de validación local.
 */
export function veredicto(r: Resultado): Veredicto {
  if (r.ok) return "ok";
  const e = r.estado;
  if (e === undefined) return "rechazado";
  if (e === 0 || e === 401 || e === 408 || e === 429 || e === 502 || e === 503 || e === 504) return "red";
  if (e >= 500) return "servidor";
  return "rechazado";
}

/** ¿Conviene guardar este fallo en la cola en vez de mostrarlo como error? */
export const sePuedeEncolar = (r: Resultado): boolean => {
  const v = veredicto(r);
  return v === "red";
};

export function camposDeFormData(fd: FormData): [string, string][] {
  const campos: [string, string][] = [];
  fd.forEach((valor, nombre) => {
    if (typeof valor === "string") campos.push([nombre, valor]);
  });
  return campos;
}

export function formDataDeCampos(campos: [string, string][]): FormData {
  const fd = new FormData();
  for (const [n, v] of campos) fd.append(n, v);
  return fd;
}

export function leerCola(texto: string | null | undefined): Cola {
  if (!texto) return [];
  try {
    const bruto = JSON.parse(texto);
    if (!Array.isArray(bruto)) return [];
    const cola: Cola = [];
    for (const e of bruto) {
      if (!e || typeof e !== "object" || !esClaveValida(e.id) || e.tipo !== "vuelo" || !Array.isArray(e.campos)) continue;
      const campos = e.campos.filter((p: unknown) => Array.isArray(p) && typeof p[0] === "string" && typeof p[1] === "string") as [string, string][];
      cola.push({
        id: e.id,
        tipo: "vuelo",
        creado: typeof e.creado === "string" ? e.creado : "",
        campos,
        resumen: typeof e.resumen === "string" ? e.resumen : "",
        error: typeof e.error === "string" && e.error ? e.error : undefined,
        fallas: Number.isFinite(e.fallas) ? Number(e.fallas) : 0,
      });
    }
    return cola;
  } catch {
    return [];
  }
}

export const escribirCola = (cola: Cola): string => JSON.stringify(cola);

/** Suma una entrada. Con el mismo id **reemplaza** (guardar dos veces el mismo vuelo es uno solo). */
export function agregar(cola: Cola, entrada: EntradaCola): Cola {
  return [...cola.filter((e) => e.id !== entrada.id), entrada];
}

export const quitar = (cola: Cola, id: string): Cola => cola.filter((e) => e.id !== id);

export const conError = (cola: Cola, id: string, error: string): Cola => cola.map((e) => (e.id === id ? { ...e, error } : e));

/** "Cargar ahora" sobre uno rechazado: vuelve a intentarse. */
export const reintentable = (cola: Cola, id: string): Cola => cola.map((e) => (e.id === id ? { ...e, error: undefined, fallas: 0 } : e));

/** El que sigue: el más viejo que no esté rechazado. */
export const siguiente = (cola: Cola): EntradaCola | null => cola.find((e) => !e.error) ?? null;

export const pendientes = (cola: Cola): number => cola.filter((e) => !e.error).length;
export const rechazados = (cola: Cola): number => cola.filter((e) => !!e.error).length;

export interface Adaptador {
  leer: () => Cola;
  escribir: (cola: Cola) => void;
  /** Manda un vuelo. Puede tirar (red): se toma como "sin señal". */
  enviar: (campos: [string, string][]) => Promise<Resultado>;
}

export interface ResumenDeEnvio {
  enviados: string[];
  /** Entradas que el backend rechazó en esta pasada. */
  rechazados: string[];
  /** Se cortó por falta de señal o falla del servidor: lo que sigue espera. */
  cortado: boolean;
}

/**
 * Manda la cola **de a uno y en orden**. Sin señal o con una falla del servidor se corta (lo que
 * sigue espera y el orden se mantiene); un rechazo por validación se marca y se sigue con el
 * resto. Lee la cola de nuevo en cada vuelta: otra pestaña pudo haber mandado el mismo vuelo
 * (da igual, la clave lo hace idempotente) o haber descartado uno.
 */
export async function procesarCola(a: Adaptador): Promise<ResumenDeEnvio> {
  const resumen: ResumenDeEnvio = { enviados: [], rechazados: [], cortado: false };
  const intentados = new Set<string>();
  for (;;) {
    const cola = a.leer();
    const e = cola.find((x) => !x.error && !intentados.has(x.id));
    if (!e) return resumen;
    intentados.add(e.id);

    let r: Resultado;
    try {
      r = await a.enviar(e.campos);
    } catch {
      resumen.cortado = true;
      return resumen;
    }
    const v = veredicto(r);
    if (v === "ok") {
      a.escribir(quitar(a.leer(), e.id));
      resumen.enviados.push(e.id);
    } else if (v === "rechazado") {
      a.escribir(conError(a.leer(), e.id, r.ok ? "" : r.error || "El servidor no aceptó el vuelo."));
      resumen.rechazados.push(e.id);
    } else if (v === "servidor") {
      const fallas = e.fallas + 1;
      const actual = a.leer();
      if (fallas >= MAX_FALLAS_DEL_SERVIDOR) {
        a.escribir(conError(actual, e.id, `El servidor no pudo guardarlo (${r.ok ? "" : r.error}). Probá cargarlo a mano.`));
        resumen.rechazados.push(e.id);
      } else {
        a.escribir(actual.map((x) => (x.id === e.id ? { ...x, fallas } : x)));
        resumen.cortado = true;
        return resumen;
      }
    } else {
      resumen.cortado = true;
      return resumen;
    }
  }
}
