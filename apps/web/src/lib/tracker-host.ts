/**
 * Vector Tracker (tracker.vectoraero.ar): la misma app Next atiende los dos hosts, y `src/proxy.ts`
 * reescribe lo del tracker a su propio árbol (`src/app/tracker/…`) **por dentro**: la URL pública
 * queda `/`, `/vuelo/<token>`, `/ingresar`, `/invitacion/<token>`. Esto es la decisión pura, para
 * probarla sin montar un proxy de Next (vitest no puede).
 *
 * - Un host es del tracker si su primera etiqueta es `tracker` (`tracker.vectoraero.ar`, o
 *   `tracker.localhost` para probar).
 * - La sesión es una sola entre los dos hosts (la cookie es de `.vectoraero.ar`), pero una cuenta
 *   que entra al tracker **nunca va a `/dashboard`**: ahí `/dashboard` redirige a la web principal.
 * - Del host principal, `/tracker/…` directo es un 404: no se entra por ahí.
 * - **`/seguir/<token>`** (el link que se manda por WhatsApp) también se sirve en el host del tracker, **pública,
 *   sin sesión y sin la pantalla de instalar** (`decidirEnTracker` la deja pasar a `src/app/seguir/`, no la
 *   reescribe a `src/app/tracker/`): la abre la familia desde el chat. Los links viejos de la web principal
 *   (`vectoraero.ar/seguir/<token>`) redirigen con 308 al del tracker (`urlDeSeguirEnElTracker`).
 */

/** ¿Es el host del tracker? Sin puerto, y con la lista de hosts que el proxy reenvía (`a, b`). */
export function esHostTracker(host: string | null | undefined): boolean {
  const h = (host ?? "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
  return h.startsWith("tracker.") && h.length > "tracker.".length;
}

export type DecisionTracker =
  /** Que siga tal cual (archivos, `/api`, el service worker). */
  | { tipo: "pasa" }
  /** Servir otra ruta interna, sin cambiar la URL del navegador. */
  | { tipo: "reescribe"; destino: string }
  /** Mandar a otra pantalla del mismo host. */
  | { tipo: "redirige"; destino: string }
  /** Mandar a la web principal (siempre con la ruta de ahí). */
  | { tipo: "a-la-web"; destino: string }
  | { tipo: "no-existe" };

/** Lo que el tracker pide a la sesión: el resto (`/ingresar`, `/invitacion/…`, el callback) se abre sin cuenta. */
export function requiereSesionTracker(pathname: string): boolean {
  return pathname === "/" || pathname === "/vuelo" || pathname.startsWith("/vuelo/");
}

const PASAN = [/^\/_next\//, /^\/api\//, /^\/sw\.js$/, /^\/icono-/, /^\/apple-touch-icon/, /^\/marca\//, /^\/arranque\//, /^\/favicon/, /^\/icon\.svg$/, /^\/sin-conexion/];

/**
 * Qué hacer con un pedido al host del tracker.
 * - `/dashboard…` → a la web principal.
 * - Sin sesión en una pantalla que la pide → `/ingresar`; con sesión en `/ingresar` → `/`.
 * - Lo demás se reescribe a `/tracker/…`; los archivos y la API pasan.
 */
export function decidirEnTracker(pathname: string, hayToken: boolean): DecisionTracker {
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) return { tipo: "a-la-web", destino: pathname };
  if (PASAN.some((r) => r.test(pathname))) return { tipo: "pasa" };
  // El link de un vuelo compartido: público, sin sesión y fuera del árbol del tracker (no se instala nada).
  if (esRutaDeSeguir(pathname)) return { tipo: "pasa" };
  // Un archivo con extensión que no es de la app (robots.txt, etc.): que Next decida.
  if (/\.[a-z0-9]{2,5}$/i.test(pathname) && pathname !== "/manifest.webmanifest") return { tipo: "pasa" };
  // Entrar por `/tracker/…` directo en este host no es una ruta pública.
  if (pathname === "/tracker" || pathname.startsWith("/tracker/")) return { tipo: "no-existe" };
  if (requiereSesionTracker(pathname) && !hayToken) return { tipo: "redirige", destino: "/ingresar" };
  if (pathname === "/ingresar" && hayToken) return { tipo: "redirige", destino: "/" };
  return { tipo: "reescribe", destino: pathname === "/" ? "/tracker" : `/tracker${pathname}` };
}

/** Del host principal: `/tracker/…` no se abre directo. */
export function esRutaDelTrackerEnLaWeb(pathname: string): boolean {
  return pathname === "/tracker" || pathname.startsWith("/tracker/");
}

/** El host de la web principal, a partir del del tracker (`tracker.vectoraero.ar` → `vectoraero.ar`). */
export function hostDeLaWeb(host: string | null | undefined): string {
  const h = (host ?? "").split(",")[0].trim().toLowerCase();
  return h.replace(/^tracker\./, "") || "vectoraero.ar";
}

/** Lo que el tracker deja pasar sin tocar ni renovar sesión: archivos y lo estático (la API sí renueva). */
export function esEstaticoDelTracker(pathname: string): boolean {
  return !pathname.startsWith("/api/") && decidirEnTracker(pathname, true).tipo === "pasa";
}

/** `/seguir/<algo>`: el link público de un vuelo compartido. */
export function esRutaDeSeguir(pathname: string): boolean {
  return /^\/seguir\/[^/]+\/?$/.test(pathname);
}

/** ¿Es un host de desarrollo (`localhost`, `127.0.0.1`, `[::1]`, `*.localhost` o una IP de la red local)? */
export function esHostLocal(host: string | null | undefined): boolean {
  const h = (host ?? "").split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
  return h === "localhost" || h.endsWith(".localhost") || h === "[::1]" || h === "::1" || /^\d{1,3}(\.\d{1,3}){3}$/.test(h);
}

/**
 * El origen del tracker a partir del de la web (`https://vectoraero.ar` → `https://tracker.vectoraero.ar`).
 * En desarrollo (`localhost`, una IP) y en el propio tracker queda igual: ahí no hay otro host. Un origen
 * vacío (el server, sin ventana) o raro también queda como vino. Es lo que usan los links que arma el
 * navegador, que no puede leer `TRACKER_URL` (sólo del server, `lib/sitio.ts`).
 */
export function origenDelTracker(origen: string): string {
  let u: URL;
  try {
    u = new URL(origen);
  } catch {
    return origen;
  }
  if (esHostLocal(u.host) || esHostTracker(u.host)) return u.origin;
  return `${u.protocol}//tracker.${u.hostname.replace(/^www\./, "")}${u.port ? `:${u.port}` : ""}`;
}

/**
 * A dónde manda la web principal un `/seguir/<token>` que le llega: al mismo link del tracker, con la
 * ruta y la búsqueda tal cual (un 308). `null` si no hay que redirigir: ya es el host del tracker o
 * es desarrollo. `trackerUrl` es `TRACKER_URL` si está; si no, se arma con el host del pedido.
 */
export function urlDeSeguirEnElTracker(host: string | null | undefined, pathname: string, search: string, trackerUrl?: string | null): string | null {
  if (!esRutaDeSeguir(pathname) || esHostTracker(host) || esHostLocal(host)) return null;
  const h = (host ?? "").split(",")[0].trim().toLowerCase();
  if (!h && !trackerUrl) return null;
  const base = (trackerUrl || "").trim().replace(/\/+$/, "") || `https://tracker.${h.replace(/^www\./, "")}`;
  return `${base}${pathname}${search}`;
}
