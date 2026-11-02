import { apiFetch } from "@/lib/api";
import { catalogoServidor } from "@/lib/catalogo-servidor";
import { normalizarHandle } from "@/lib/handle";
import { aerodromosDelChip, fechaCompleta, fechaDeVuelo, fechaRelativa, rutaLegible } from "@/lib/social";
import { DESDE_RECORRIDOS } from "@/lib/recorrido";
import type {
  Aircraft,
  Comentario,
  EventoActividad,
  Flight,
  PaginaPublicaciones,
  PerfilPublico,
  Publicacion,
  VueloChip,
  VueloParaCompartir,
} from "@/types";

/**
 * Lo que el server de Vector le agrega a lo que manda el backend, antes de dibujarlo.
 *
 * - **Las fechas ya escritas** ("hace 5 min"), porque las tarjetas son componentes
 *   cliente y una fecha calculada en el navegador no coincide con la del server
 *   (invariante 1).
 * - **Los puntos del mapa** del vuelo, con el catálogo de aeródromos del disco.
 *
 * Sólo corre en el server: el catálogo lee archivos con `fs`. Lo usan las páginas y las
 * server actions que traen más publicaciones o comentarios.
 */

/** Los aeródromos de una ruta ya escrita ("SADF → SAAR"), ubicados con el catálogo. */
function puntosDeLaRuta(ruta: string | null | undefined): VueloChip["puntos_mapa"] {
  const puntos = aerodromosDelChip(ruta).flatMap((codigo) => {
    const a = catalogoServidor.aerodromo(codigo);
    return a && typeof a.lat === "number" && typeof a.lon === "number"
      ? [{ codigo, label: a.label || codigo, lat: a.lat, lon: a.lon }]
      : [];
  });
  return puntos.length > 0 ? puntos : undefined;
}

function prepararChip(vuelo: VueloChip): VueloChip {
  return { ...vuelo, fecha_texto: fechaDeVuelo(vuelo.fecha), puntos_mapa: puntosDeLaRuta(vuelo.ruta) };
}

export function prepararPublicaciones(publicaciones: Publicacion[], ahora = new Date()): Publicacion[] {
  return publicaciones.map((p) => ({
    ...p,
    fecha_texto: fechaRelativa(p.created_at, ahora),
    fecha_titulo: fechaCompleta(p.created_at),
    vuelo: p.vuelo ? prepararChip(p.vuelo) : null,
  }));
}

export function prepararComentarios(comentarios: Comentario[], ahora = new Date()): Comentario[] {
  return comentarios.map((c) => ({
    ...c,
    fecha_texto: fechaRelativa(c.created_at, ahora),
    fecha_titulo: fechaCompleta(c.created_at),
  }));
}

export function prepararEventos(eventos: EventoActividad[], ahora = new Date()): EventoActividad[] {
  return eventos.map((e) => ({
    ...e,
    fecha_texto: fechaRelativa(e.created_at, ahora),
    fecha_titulo: fechaCompleta(e.created_at),
  }));
}

/**
 * De dónde salen las publicaciones de una lista: la Red del piloto, o el perfil de uno.
 * `comoAnonimo` es la vista "así te ven": se pide sin sesión aunque la haya.
 */
export type OrigenPublicaciones = { tipo: "red" } | { tipo: "piloto"; handle: string; comoAnonimo?: boolean };

export interface LecturaPublicaciones {
  publicaciones: Publicacion[];
  siguiente: string | null;
  /** `false` si no se pudo preguntar: la lista vacía no significa "no publicó nada". */
  disponible: boolean;
}

export async function leerPublicaciones(
  origen: OrigenPublicaciones,
  antes?: string | null,
): Promise<LecturaPublicaciones> {
  const q = antes ? `?antes=${encodeURIComponent(antes)}` : "";
  // Sin cache: depende de quién mira, y un aplauso o una publicación nueva de hace
  // veinte segundos tiene que estar.
  const res =
    origen.tipo === "red"
      ? await apiFetch(`/red/feed${q}`, { cache: "no-store" })
      : await apiFetch(
          `/publico/pilotos/${encodeURIComponent(normalizarHandle(origen.handle))}/publicaciones${q}`,
          { cache: "no-store" },
          { anonimo: !!origen.comoAnonimo },
        );
  if (!res.ok) return { publicaciones: [], siguiente: null, disponible: false };
  const pagina = (await res.json().catch(() => null)) as PaginaPublicaciones | null;
  if (!pagina || !Array.isArray(pagina.publicaciones)) {
    return { publicaciones: [], siguiente: null, disponible: false };
  }
  return {
    publicaciones: prepararPublicaciones(pagina.publicaciones),
    siguiente: pagina.siguiente ?? null,
    disponible: true,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Los vuelos propios que se pueden adjuntar a una publicación: los últimos treinta, sin
 * los de simulador, con cada dato ya escrito **como lo publicaría el backend** (la ruta
 * con `rutaLegible`, el tipo de avión y nunca la matrícula). El composer sólo elige qué
 * mostrar.
 *
 * Si `incluir` es un vuelo más viejo —el botón Compartir de un vuelo de hace meses—, se
 * agrega igual, primero.
 */
export async function leerVuelosParaCompartir(incluir?: string | null): Promise<VueloParaCompartir[]> {
  const [historial, avionesRes] = await Promise.all([
    apiFetch("/flights/history?limit=30", { cache: "no-store" }),
    apiFetch("/aircraft"),
  ]);
  const vuelos: Flight[] = historial.ok ? ((await historial.json().catch(() => null))?.items ?? []) : [];
  const aviones: Aircraft[] = avionesRes.ok ? ((await avionesRes.json().catch(() => [])) as Aircraft[]) : [];

  if (incluir && UUID.test(incluir) && !vuelos.some((v) => v.id === incluir)) {
    const uno = await apiFetch(`/flights/${incluir}`, { cache: "no-store" });
    if (uno.ok) {
      const vuelo = (await uno.json().catch(() => null)) as Flight | null;
      if (vuelo?.id) vuelos.unshift(vuelo);
    }
  }

  const porId = new Map(aviones.map((a) => [a.id, a]));
  const avionDe = (v: Flight) => (v.aircraft_id ? porId.get(v.aircraft_id) : undefined);
  return (
    vuelos
      // Una sesión de simulador es un renglón del libro, no un vuelo (invariante 4).
      .filter((v) => !avionDe(v)?.is_simulator)
      .map((v) => {
        const ruta = rutaLegible(v.route);
        const duracion = Number(v.duration) > 0 ? Math.round(Number(v.duration) * 10) / 10 : null;
        const fecha = fechaDeVuelo(v.date);
        const tipo = avionDe(v)?.type?.trim() || null;
        return {
          id: v.id,
          etiqueta: [fecha, ruta ?? "Sin ruta", duracion != null ? `${duracion.toFixed(1)} h` : null]
            .filter(Boolean)
            .join(" · "),
          ruta,
          duracion,
          aeronave: tipo,
          fecha,
          puntos_mapa: puntosDeLaRuta(ruta),
          // Si de verdad lo tiene lo pregunta el composer al elegirlo: buscarlo es una
          // lectura que puede guardarlo, y esta lista se arma al dibujar (invariante 15).
          puede_tener_recorrido: String(v.date ?? "") >= DESDE_RECORRIDOS,
        };
      })
  );
}

/** El @ propio con su foto (`GET /perfil-publico`), o `null` si no tiene o no se pudo. */
export async function leerMiPerfilPublico(): Promise<PerfilPublico | null> {
  try {
    const res = await apiFetch("/perfil-publico", { cache: "no-store" });
    if (!res.ok) return null;
    return ((await res.json()) as { perfil: PerfilPublico | null }).perfil;
  } catch {
    return null;
  }
}
