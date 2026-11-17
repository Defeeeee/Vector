import { buscarEnIndice, construirIndice, normalize, type Airport, type IndiceAerodromos } from "./busqueda-aerodromos";
import { alternativasDesdeDirectorio } from "./alternativas";
import { aeroviasConSalidas } from "./ruta-planificada";
import type { armarMapa } from "./mapa-datos";

/**
 * Vector sin señal (3.44.0, Federico: «cuando en el aire no tenía señal era como que no podía usar
 * la app casi en absoluto»).
 *
 * Todo lo que se **decide** acá es puro y tiene sus tests; el service worker (`src/sw/sw.ts`) y los
 * dos componentes (`SinSenal`, `GuardadoParaVolar`) sólo ejecutan. Es la misma partición de
 * `pwa.ts`, y por la misma razón: `vitest` corre en `environment: "node"`.
 *
 * ## Qué hay guardado en el teléfono, y de dónde sale
 *
 * 1. **La app**: todo `/_next/static/**` del build (la lista la hornea `scripts/build-sw.mjs`),
 *    guardado al instalarse cada versión del service worker.
 * 2. **El paquete de datos** (`/api/sin-senal/datos`): los aeródromos argentinos con su ficha, las
 *    aerovías y las capas del Mapa. Con él el service worker contesta, sin red, lo que el Mapa, el
 *    plan de vuelo y Aeropuertos le piden a `/api/mapa`, `/api/airports/*` y `/api/aerovias`
 *    (`contestarSinSenal`, **el mismo algoritmo que el servidor**: las funciones puras son las
 *    mismas, ver `alternativasDesdeDirectorio` y `aeroviasConSalidas`). Los puntos de la ruta
 *    siguen resolviéndose con el catálogo de a bordo (`/api/puntos`).
 * 3. **Las pantallas**: la última copia de cada una que se abrió, y las principales precalentadas
 *    al abrir la app con buena señal (`debePrecalentar`). Son datos del piloto: se borran al cerrar
 *    sesión y si entra otra cuenta (`EstadoPantallas.usuario`).
 */

/* ------------------------------------------------------------ el paquete de datos --- */

export const RUTA_PAQUETE = "/api/sin-senal/datos";

/** Sube sólo si cambia la forma del paquete: un paquete de otro esquema no se usa. */
export const ESQUEMA_PAQUETE = 1;

export type MapaDatos = ReturnType<typeof armarMapa>;

export interface PaqueteSinSenal {
  esquema: number;
  /** La versión de la app que lo armó: sólo para mostrarla ("versión 3.44.0"). */
  version: string;
  /** Sólo Argentina: un código extranjero resuelve con señal y no sin ella (y la pantalla lo dice). */
  aerodromos: Airport[];
  aerovias: { designador: string; puntos: string[] }[];
  vigenciaAerovias: { documento: string; edicion: string; vigenteDesde: string; url: string } | null;
  mapa: MapaDatos;
}

export interface IndiceSinSenal {
  aerodromos: IndiceAerodromos;
  aerovias: PaqueteSinSenal["aerovias"];
  paquete: PaqueteSinSenal;
}

/** Arma los índices una vez (el service worker lo guarda en memoria mientras vive). */
export function indiceDelPaquete(paquete: PaqueteSinSenal): IndiceSinSenal {
  if (paquete.esquema !== ESQUEMA_PAQUETE) {
    throw new Error(`El paquete sin señal es de esquema ${paquete.esquema} y este código lee ${ESQUEMA_PAQUETE}.`);
  }
  return { aerodromos: construirIndice(paquete.aerodromos), aerovias: paquete.aerovias, paquete };
}

export interface RespuestaLocal {
  status: number;
  cuerpo: unknown;
}

/** Las rutas que el paquete sabe contestar. */
export const RUTAS_CON_PAQUETE = ["/api/mapa", "/api/airports/search", "/api/airports/near", "/api/aerovias"];

/**
 * Lo que el servidor habría contestado, contestado con el paquete. `null` si no es una ruta que el
 * paquete sepa contestar.
 *
 * **Misma respuesta que el servidor, más `offline: true`** (la convención de `/api/puntos`): para que
 * la pantalla pueda decir con qué contestó. Dos diferencias, las dos de alcance y no de algoritmo:
 * el directorio es sólo Argentina, y `lad=1` no trae los LAD (no van en el paquete: sin coordenadas,
 * no sirven para el Mapa; en el plan de vuelo se los escribe a mano).
 */
export function contestarSinSenal(url: URL, indice: IndiceSinSenal): RespuestaLocal | null {
  const p = url.searchParams;

  if (url.pathname === "/api/mapa") return { status: 200, cuerpo: { ...indice.paquete.mapa, offline: true } };

  if (url.pathname === "/api/airports/search") {
    const icao = p.get("icao");
    if (icao) {
      const aeropuerto = indice.aerodromos.byIcao.get(normalize(icao));
      return aeropuerto
        ? { status: 200, cuerpo: aeropuerto }
        : { status: 404, cuerpo: { error: "Aeródromo no encontrado", offline: true } };
    }
    const q = p.get("q")?.trim() ?? "";
    if (q.length < 2) return { status: 200, cuerpo: { results: [], offline: true } };
    const limite = Math.min(Number(p.get("limit")) || 8, 25);
    return { status: 200, cuerpo: { results: buscarEnIndice(indice.aerodromos, q, limite), offline: true } };
  }

  if (url.pathname === "/api/airports/near") {
    const lat = Number(p.get("lat"));
    const lon = Number(p.get("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return { status: 400, cuerpo: { error: "lat y lon son obligatorios" } };
    }
    const resultados = alternativasDesdeDirectorio(
      indice.aerodromos.all,
      { lat, lon },
      { nm: Number(p.get("nm")), gs: Number(p.get("gs")) }
    );
    return { status: 200, cuerpo: { resultados, offline: true } };
  }

  if (url.pathname === "/api/aerovias") {
    const punto = (p.get("punto") ?? "").trim().toUpperCase();
    if (!punto) return { status: 200, cuerpo: { aerovias: [], vigencia: null, offline: true } };
    return {
      status: 200,
      cuerpo: {
        aerovias: aeroviasConSalidas(indice.aerovias, punto),
        vigencia: indice.paquete.vigenciaAerovias,
        offline: true,
      },
    };
  }

  return null;
}

/* ------------------------------------------------------------ lo que se precalienta --- */

/**
 * Las pantallas que se bajan en segundo plano al abrir la app con buena señal, para tenerlas en
 * vuelo. **Son todas GET de lectura** (invariante 15: ninguna escribe al dibujarse). El resto del
 * dashboard se guarda igual, pero recién cuando el piloto lo abre (`paginaCacheable`).
 */
export const PAGINAS_PARA_VOLAR = [
  "/dashboard",
  "/dashboard/mapa",
  "/dashboard/tools/checklists",
  "/dashboard/plan-de-vuelo",
  "/dashboard/airports",
  "/dashboard/history",
];

/** Cuántas checklists (una por avión, como mucho) se bajan de la lista. */
export const MAX_CHECKLISTS = 12;

/** Cada cuánto, como mucho, se vuelven a precalentar (sin que el piloto lo pida). */
export const PRECALENTAR_CADA_MS = 6 * 3600_000;

/**
 * Las checklists que lista la pantalla de checklists, sacadas de su HTML: así se bajan también las
 * de cada avión sin que el service worker tenga que conocer el backend.
 */
export function enlacesDeChecklists(html: string, maximo = MAX_CHECKLISTS): string[] {
  const vistos = new Set<string>();
  for (const m of html.matchAll(/\/dashboard\/tools\/checklists\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi)) {
    vistos.add(`/dashboard/tools/checklists/${m[1].toLowerCase()}`);
    if (vistos.size >= maximo) break;
  }
  return [...vistos];
}

export interface Conexion {
  online: boolean;
  saveData?: boolean;
  /** `navigator.connection.effectiveType`: "slow-2g" | "2g" | "3g" | "4g". Puede no existir. */
  effectiveType?: string;
}

/** Buena para bajar unos megas sin pedirlo: con red, sin "ahorro de datos" y, si se sabe, 4g o mejor. */
export function conexionBuena(c: Conexion): boolean {
  if (!c.online || c.saveData) return false;
  return c.effectiveType === undefined || c.effectiveType === "4g";
}

/** Lo que el service worker anota de las pantallas, en el cache personal (se borra al salir). */
export interface EstadoPantallas {
  /** El id de la cuenta de lo guardado. Otra cuenta en este navegador: se borra antes de guardar. */
  usuario: string | null;
  /** La última vez que se precalentó, ISO. */
  precalentadoEn: string | null;
  /** Los paths que se guardaron en esa pasada. */
  pantallas: string[];
}

export type MotivoPrecalentar = "sin-usuario" | "forzado" | "usuario-nuevo" | "vencido" | "reciente" | "sin-conexion";

export interface DecisionPrecalentar {
  hacer: boolean;
  /** Borrar antes lo personal guardado: era de otra cuenta. **Aunque no haya buena señal.** */
  limpiar: boolean;
  motivo: MotivoPrecalentar;
}

/**
 * Si hay que precalentar las pantallas ahora. Pedido por la app en cada arranque; **decide el
 * service worker**, que es quien sabe qué tiene guardado.
 *
 * - Sin cuenta (el perfil no se pudo leer): no se guarda nada. Lo de otra cuenta que hubiera, no se
 *   toca (no se sabe de quién es la que está).
 * - Otra cuenta que la de lo guardado: se borra lo guardado, siempre; y se precalienta si hay señal.
 * - "Actualizar ahora" (`forzar`): ya, salvo sin red.
 * - Si no: con buena señal y pasadas 6 h de la última vez.
 */
export function debePrecalentar(o: {
  estado: EstadoPantallas | null;
  usuario: string | null;
  ahoraMs: number;
  forzar: boolean;
  conexion: Conexion;
}): DecisionPrecalentar {
  if (!o.usuario) return { hacer: false, limpiar: false, motivo: "sin-usuario" };
  const otroUsuario = !!o.estado?.usuario && o.estado.usuario !== o.usuario;
  const limpiar = otroUsuario;
  if (!o.conexion.online) return { hacer: false, limpiar, motivo: "sin-conexion" };
  if (o.forzar) return { hacer: true, limpiar, motivo: "forzado" };
  if (otroUsuario) return { hacer: conexionBuena(o.conexion), limpiar, motivo: "usuario-nuevo" };
  if (!conexionBuena(o.conexion)) return { hacer: false, limpiar, motivo: "sin-conexion" };
  const ultima = o.estado?.precalentadoEn ? Date.parse(o.estado.precalentadoEn) : NaN;
  if (Number.isFinite(ultima) && o.ahoraMs - ultima < PRECALENTAR_CADA_MS) {
    return { hacer: false, limpiar, motivo: "reciente" };
  }
  return { hacer: true, limpiar, motivo: "vencido" };
}

/** Parte una lista en tandas (para bajar de a pocas a la vez). */
export function entandas<T>(lista: T[], tamano: number): T[][] {
  const tandas: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) tandas.push(lista.slice(i, i + tamano));
  return tandas;
}

/* ------------------------------------------------------------ lo que se le dice al piloto --- */

/** Lo que el service worker anota de la app y los datos, junto a la versión (se tira con ella). */
export interface EstadoApp {
  version: string;
  /** Cuántos archivos tiene el build, y cuántos se pudieron guardar. */
  archivos: number;
  guardados: number;
  /** Si el paquete de datos está guardado, y cuántos aeródromos trae. */
  paquete: boolean;
  aerodromos: number;
  guardadoEn: string | null;
}

export const CLAVE_ESTADO_APP = "/__vector__/estado-app";
export const CLAVE_ESTADO_PANTALLAS = "/__vector__/estado-pantallas";

const DESFASE_ARGENTINA_MS = 3 * 3600_000;

const dos = (n: number) => String(n).padStart(2, "0");

/**
 * "14:32" (o "16/11 14:32" si es de otro día), **en hora argentina** y sin `toLocaleString`:
 * Argentina es UTC−3 todo el año, y la cuenta a mano da lo mismo en el servidor, en Chrome y en
 * Safari (invariante 1). `null` si la fecha no se entiende: no se inventa una hora.
 */
export function horaArgentina(iso: string | null | undefined, ahoraMs: number): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t - DESFASE_ARGENTINA_MS);
  const hoy = new Date(ahoraMs - DESFASE_ARGENTINA_MS);
  const hora = `${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}`;
  const mismoDia =
    d.getUTCFullYear() === hoy.getUTCFullYear() && d.getUTCMonth() === hoy.getUTCMonth() && d.getUTCDate() === hoy.getUTCDate();
  return mismoDia ? hora : `${dos(d.getUTCDate())}/${dos(d.getUTCMonth() + 1)} ${hora}`;
}

/**
 * La franja de arriba cuando no hay red. **Sin hora no inventa una**: dice que es lo guardado y
 * nada más (invariante 2).
 */
export function textoDeLaFranja(guardadoEn: string | null | undefined, ahoraMs: number): string {
  const hora = horaArgentina(guardadoEn, ahoraMs);
  if (!hora) return "Sin señal · mostrando lo guardado";
  return hora.includes("/") ? `Sin señal · mostrando lo guardado el ${hora.replace(" ", " a las ")}` : `Sin señal · mostrando lo guardado a las ${hora}`;
}

/** "Guardado para volar sin señal: la app, 6 pantallas y 875 aeródromos (versión 3.44.0)". */
export function resumenGuardado(app: EstadoApp | null, pantallas: number): string {
  if (!app) return "Todavía no hay nada guardado para volar sin señal: se guarda solo la próxima vez que abras Vector con buena conexión.";
  const partes: string[] = [];
  partes.push(app.guardados >= app.archivos && app.archivos > 0 ? "la app" : `la app (${app.guardados} de ${app.archivos} archivos)`);
  partes.push(`${pantallas} ${pantallas === 1 ? "pantalla" : "pantallas"}`);
  partes.push(app.paquete ? `${app.aerodromos} aeródromos` : "sin los datos de aeródromos");
  const lista = partes.length > 1 ? `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}` : partes[0];
  return `Guardado para volar sin señal: ${lista} (versión ${app.version}).`;
}
