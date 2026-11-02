import { SECCIONES } from "@/lib/secciones";
import { GUIAS } from "@/lib/sitio";

/**
 * El buscador de toda la app (⌘K, `BuscadorGlobal`), la parte pura: qué pantallas y qué
 * guías coinciden con lo que se escribe. Los vuelos y los aeródromos los busca el backend y
 * `/api/airports/search`; acá queda lo que no necesita red.
 *
 * Se compara sin tildes ni mayúsculas, y cada pantalla tiene palabras que la gente usa y que
 * no están en su nombre ("cad", "ddjj", "pdf", "examen"…).
 */
export interface Resultado {
  tipo: "pantalla" | "guia";
  titulo: string;
  detalle: string;
  href: string;
}

export const sinTildes = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Pantallas que no son pestañas pero se buscan, con las palabras que las encuentran. */
const OTRAS: { titulo: string; detalle: string; href: string; palabras: string }[] = [
  { titulo: "Registrar vuelo", detalle: "Cargar un vuelo nuevo", href: "/dashboard/log-flight", palabras: "nuevo vuelo cargar agregar anotar" },
  { titulo: "Importar tu libro", detalle: "PDF o fotos de las hojas", href: "/dashboard/log-flight/import", palabras: "importar pdf fotos hojas papel escaneado" },
  { titulo: "Pasar al CAD", detalle: "Tus vuelos al CAD de ANAC, y traerlos", href: "/dashboard/history/cad", palabras: "cad anac ddjj declaracion jurada traer marcador" },
  { titulo: "Hangar", detalle: "Tu perfil, licencia, CMA, aviones y libros", href: "/dashboard/settings", palabras: "perfil ajustes configuracion licencia cma avion aviones libros whatsapp firma cuenta" },
  { titulo: "Novedades", detalle: "Lo nuevo en Vector", href: "/dashboard/novedades", palabras: "cambios version changelog" },
  { titulo: "Publicar en la red", detalle: "Una foto o un vuelo para tu red", href: "/dashboard/pilotos/publicar", palabras: "publicacion foto compartir" },
];

/** Palabras extra de las pestañas, para lo que no dice su nombre. */
const PALABRAS_PESTANA: Record<string, string> = {
  "/dashboard": "inicio puedo volar hoy estado",
  "/dashboard/history": "bitacora vuelos libro historial",
  "/dashboard/summary": "resumen horas estadisticas totales desglose",
  "/dashboard/calendario": "calendario programados agenda",
  "/dashboard/audit": "auditoria errores revisar",
  "/dashboard/balance": "saldo pack paquete horas pagos plata",
  "/dashboard/planificador": "planificador ruta navegacion combustible viento",
  "/dashboard/plan-de-vuelo": "plan de vuelo eana aro fpl demora cancelacion",
  "/dashboard/airports": "aeropuertos aerodromos pistas frecuencias notam aip",
  "/dashboard/clima": "clima meteo metar taf tiempo",
  "/dashboard/tools": "herramientas calculadoras conversor piernera examen",
  "/dashboard/pilotos": "red pilotos amigos feed",
  "/dashboard/pilotos/buscar": "buscar pilotos seguir",
  "/dashboard/pilotos/actividad": "actividad avisos notificaciones",
};

function coincide(q: string, ...textos: string[]): boolean {
  const t = sinTildes(textos.join(" "));
  return sinTildes(q)
    .split(/\s+/)
    .filter(Boolean)
    .every((palabra) => t.includes(palabra));
}

/** Las pantallas que coinciden: las pestañas de la barra y las que se buscan aparte. */
export function buscarPantallas(q: string, max = 6): Resultado[] {
  if (sinTildes(q).length < 2) return [];
  const pestanas = SECCIONES.flatMap((s) =>
    s.pestanas.map((p) => ({
      titulo: p.label,
      detalle: p.label === s.label ? "Sección" : s.label,
      href: p.href,
      palabras: `${s.label} ${PALABRAS_PESTANA[p.href] ?? ""}`,
    }))
  );
  return [...pestanas, ...OTRAS]
    .filter((x) => coincide(q, x.titulo, x.detalle, x.palabras))
    .slice(0, max)
    .map(({ titulo, detalle, href }) => ({ tipo: "pantalla" as const, titulo, detalle, href }));
}

/** Cómo empieza una pregunta de verdad: "¿cuántas horas tengo?", "puedo volar con…". */
const INTERROGATIVAS = /^(¿|que |qué |cual|cuál|cuant|cuánt|cuando|cuándo|como |cómo |donde|dónde|por ?que|por ?qué|puedo|tengo|necesito|me falta|hay )/i;

/**
 * ¿Lo escrito es algo para preguntarle al copiloto antes que una búsqueda? El copiloto
 * vive adentro de ⌘K (`BuscadorGlobal`, `ConversacionCopiloto`), así que la opción está
 * siempre; esto decide si va **primera**: cuando no se encontró nada, o cuando se escribió
 * una pregunta, aunque alguna pantalla coincida de casualidad con una palabra.
 */
export function copilotoPrimero(q: string, resultados: number): boolean {
  const t = q.trim();
  if (t.length < 2) return false;
  if (resultados === 0) return true;
  return t.endsWith("?") || INTERROGATIVAS.test(t) || t.split(/\s+/).length >= 5;
}

/** Las guías públicas que coinciden, con el examen de PPA incluido. */
export function buscarGuias(q: string, max = 4): Resultado[] {
  if (sinTildes(q).length < 2) return [];
  return GUIAS.filter((g) => coincide(q, g.corto, g.titulo, g.descripcion))
    .slice(0, max)
    .map((g) => ({ tipo: "guia" as const, titulo: g.corto, detalle: "Guía", href: `/guias/${g.slug}` }));
}
