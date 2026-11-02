/**
 * Las pegatinas con QR (migración 033 del backend), la parte pura: el código, la cookie del
 * escaneo y a dónde lleva cada escaneo.
 *
 * Se imprimen muchas iguales, cada una con su código (`/q/K7P2`), y se asignan después a un
 * lugar escaneándolas: quien escanea es admin, así que la ruta lo lleva a asignarla. A un
 * visitante lo lleva a la portada y le deja una cookie con el código y la hora, para anotar
 * de qué pegatina vino la cuenta si se registra dentro de los 30 días (`AnotarOrigenQr`).
 */

export const COOKIE_QR = "vector_qr";
export const DIAS_DE_LA_COOKIE = 30;

/** El código en mayúsculas, o `null` si no tiene forma de código (igual que el backend). */
export function normalizarCodigo(crudo: string | null | undefined): string | null {
  const c = String(crudo ?? "").trim().toUpperCase();
  return /^[A-Z0-9]{4,8}$/.test(c) ? c : null;
}

/** "K7P2.1761230000000": el código y cuándo se escaneó. */
export const valorCookieQr = (codigo: string, escaneado: Date) => `${codigo}.${escaneado.getTime()}`;

export function leerCookieQr(valor: string | null | undefined): { codigo: string; escaneadoAt: string } | null {
  const [crudo, ms] = String(valor ?? "").split(".");
  const codigo = normalizarCodigo(crudo);
  const t = Number(ms);
  if (!codigo || !Number.isFinite(t) || t <= 0) return null;
  return { codigo, escaneadoAt: new Date(t).toISOString() };
}

/**
 * A dónde lleva un escaneo, y si deja la cookie.
 *
 * - El admin va a la pegatina, para asignarla o ver cómo le va.
 * - Un piloto con sesión, a su inicio: ya es de Vector, no hay nada que atribuir.
 * - Un visitante, a la portada con los `utm_` (los lee el píxel, si lo aceptó) y la cookie.
 * - Un código que no existe, a la portada a secas.
 */
export function destinoDelEscaneo({
  codigo,
  existe,
  conSesion,
  esAdmin,
}: {
  codigo: string | null;
  existe: boolean;
  conSesion: boolean;
  esAdmin: boolean;
}): { destino: string; cookie: boolean } {
  if (!codigo || !existe) return { destino: conSesion ? "/dashboard" : "/", cookie: false };
  if (esAdmin) return { destino: `/dashboard/admin/pegatinas/${codigo}`, cookie: false };
  if (conSesion) return { destino: "/dashboard", cookie: false };
  return { destino: `/?utm_source=qr&utm_medium=pegatina&utm_content=${codigo}`, cookie: true };
}

/** Los códigos de `?codigos=A,B,C` que tienen forma de código, sin repetir y con tope. */
export function codigosDeLaHoja(param: string | null | undefined, tope = 200): string[] {
  const vistos = new Set<string>();
  for (const c of String(param ?? "").split(",")) {
    const n = normalizarCodigo(c);
    if (n) vistos.add(n);
  }
  return [...vistos].slice(0, tope);
}
