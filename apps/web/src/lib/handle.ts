/**
 * El @ de un piloto: cómo se escribe y cómo se muestra.
 *
 * **El que decide es el backend** (`src/services/social.py` de FlightLog-BackEnd, y el
 * CHECK de la migración 018). Esto es la misma regla del lado del formulario, para
 * avisar mientras se tipea en vez de después de mandar. Si cambian allá, cambian acá:
 * un @ que el formulario acepta y el backend rechaza es un error que el piloto ve
 * recién al guardar.
 *
 * En la interfaz el @ se muestra con arroba (`@fede.dn`); en la URL va sin ella
 * (`/u/fede.dn`), por decisión de Federico.
 */

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;

/** Los mismos que `RESERVADOS` del backend. */
export const RESERVADOS = new Set([
  "vector", "vectorapp", "admin", "administrador", "root", "soporte", "ayuda",
  "help", "staff", "equipo", "oficial", "anac", "api", "app", "u", "dashboard",
  "login", "register", "registro", "pilotos", "piloto", "perfil", "settings",
  "hangar", "null", "undefined", "www", "mail", "legal",
  // Las pantallas que cuelgan de `/dashboard/pilotos/`: un @ con ese nombre quedaría
  // tapado por la ruta fija, y su perfil adentro de la app no se podría abrir.
  "buscar", "actividad", "publicar", "red", "solicitudes",
]);

const FORMATO = /^[a-z0-9][a-z0-9._]{1,18}[a-z0-9]$/;

/** Sin espacios alrededor, sin la arroba de adelante y en minúsculas. */
export function normalizarHandle(crudo: string | null | undefined): string {
  return (crudo ?? "").trim().replace(/^@+/, "").toLowerCase();
}

/**
 * `null` si el @ es válido, o el motivo para mostrar al lado del campo. Los mensajes
 * son los mismos que devuelve el backend.
 */
export function problemaDelHandle(crudo: string | null | undefined): string | null {
  const h = normalizarHandle(crudo);
  if (h.length < HANDLE_MIN) return "El @ tiene que tener al menos 3 caracteres.";
  if (h.length > HANDLE_MAX) return "El @ puede tener como mucho 20 caracteres.";
  if (!/^[a-z0-9._]+$/.test(h)) return "Usá sólo letras sin acento, números, punto o guion bajo.";
  if (!FORMATO.test(h)) return "Tiene que empezar y terminar con una letra o un número.";
  if (h.includes("..")) return "No puede tener dos puntos seguidos.";
  if (RESERVADOS.has(h)) return "Ese @ está reservado.";
  return null;
}

/** `fede.dn` → `@fede.dn`. Para la interfaz; la URL va sin arroba. */
export function conArroba(handle: string): string {
  return `@${normalizarHandle(handle)}`;
}

/**
 * La ruta del perfil público, la que se comparte. Sin arroba en la URL, por decisión
 * de Federico. Quien la abre con sesión va a parar a `rutaPerfilApp`.
 */
export function rutaPerfil(handle: string): string {
  return `/u/${encodeURIComponent(normalizarHandle(handle))}`;
}

/**
 * El perfil adentro de la app, con la barra. Es a donde lleva tocar un piloto desde
 * cualquier pantalla del dashboard: abrir `/u/...` ahí era salirse de Vector.
 */
export function rutaPerfilApp(handle: string): string {
  return `/dashboard/pilotos/${encodeURIComponent(normalizarHandle(handle))}`;
}

/**
 * Un @ para proponer a partir del nombre: "Lucía Prueba" → `lucia.prueba`. Sin tildes
 * ni eñes, con punto donde había espacios, y cortado a 20. Si lo que queda no es un @
 * válido —muy corto, reservado—, devuelve `""` y el piloto escribe el suyo.
 */
export function sugerirHandle(nombre: string | null | undefined): string {
  const base = (nombre ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  const cortado = base.slice(0, HANDLE_MAX).replace(/[._]+$/, "");
  return problemaDelHandle(cortado) ? "" : cortado;
}

/** La URL completa, para copiar o compartir. */
export function urlPerfil(handle: string, origen: string): string {
  return `${origen.replace(/\/+$/, "")}${rutaPerfil(handle)}`;
}
