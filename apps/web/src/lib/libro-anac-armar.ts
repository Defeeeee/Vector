import { esAlumno, vuelosDesdeLaPpa } from "@/lib/licencias";
import { apellidoYNombre, armarLibro, fechaDeGeneracion, renglonesDeLaHoja, valoresDeApertura } from "@/lib/libro-anac";
import { pdfDelLibro } from "@/lib/libro-anac-pdf";
import type { Aircraft, Flight, Logbook, Profile } from "@/types";

/**
 * El libro de vuelo en PDF, armado con los datos del backend. Lo usan la descarga de la web
 * (`/api/bitacora/libro-anac`, con la sesión) y el copiloto de WhatsApp (con la clave del
 * piloto): el mismo libro, de las mismas fuentes, por los dos caminos.
 *
 * `leer` pide una ruta del backend ya autenticada. Ver la ruta de la web para las reglas:
 * un libro por PDF, el principal si no se elige, y nada inventado.
 */
/** Los bytes de un `data:image/png;base64,…`, o `undefined` si no es un PNG. */
export function pngDeDataUrl(dataUrl: string | null | undefined): Uint8Array | undefined {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl ?? "");
  if (!m) return undefined;
  const bytes = Uint8Array.from(Buffer.from(m[1], "base64"));
  // La firma PNG empieza con su firma de archivo: 89 50 4E 47.
  return bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 ? bytes : undefined;
}

export type ResultadoLibro =
  | { ok: true; bytes: Uint8Array; archivo: string; libro: string | null; vuelos: number }
  | { ok: false; status: 401 | 404 | 502; error: string };

export async function armarPdfDelLibro(
  leer: (ruta: string) => Promise<Response>,
  opciones: { libroId?: string | null; libroNombre?: string | null; ahora?: Date; conFirma?: boolean } = {}
): Promise<ResultadoLibro> {
  const [perfilesRes, vuelosRes, avionesRes, librosRes] = await Promise.all([leer("/profiles"), leer("/flights"), leer("/aircraft"), leer("/logbooks")]);
  if ([perfilesRes, vuelosRes, avionesRes, librosRes].some((r) => r.status === 401)) {
    return { ok: false, status: 401, error: "Tu sesión venció. Volvé a entrar." };
  }
  if (![perfilesRes, vuelosRes, avionesRes, librosRes].every((r) => r.ok)) {
    // Un libro al que le falta una parte no se entrega: sería un documento que se
    // presenta ante ANAC con horas de menos.
    return { ok: false, status: 502, error: "No se pudo armar el libro: faltó una parte de tus datos. Probá de nuevo en un momento." };
  }

  const perfil = ((await perfilesRes.json()) as Profile[])[0] ?? null;
  // El alumno piloto no tiene libro de vuelo (Federico, 2026-09-24): ver `lib/licencias.ts`.
  if (esAlumno(perfil?.license_type)) return { ok: false, status: 404, error: "Como alumno piloto no llevás libro de vuelo." };
  // Las horas de alumno no van al libro: arranca el día que rindió la PPA. Sin fecha
  // —quien nunca fue alumno en Vector—, van todos los vuelos, como siempre.
  const vuelos = vuelosDesdeLaPpa((await vuelosRes.json()) as Flight[], perfil?.fecha_ppa);
  const aeronaves = (await avionesRes.json()) as Aircraft[];
  const libros = (await librosRes.json()) as Logbook[];

  const principal = libros.find((l) => l.is_default) ?? libros[0] ?? null;
  const porNombre = opciones.libroNombre?.trim().toLowerCase();
  const libro =
    libros.find((l) => l.id === opciones.libroId) ??
    (porNombre ? libros.find((l) => l.name?.trim().toLowerCase() === porNombre) : undefined) ??
    principal;
  const delLibro = libros.length <= 1 || !libro ? vuelos : vuelos.filter((f) => (f.logbook_id ?? principal?.id) === libro.id);

  const apertura = valoresDeApertura(libro);
  // Cada libro corta la hoja donde la corta el de papel (Hangar → Libros de vuelo).
  const renglonesPorHoja = renglonesDeLaHoja(libro);
  const hojas = armarLibro({ vuelos: delLibro, aeronaves, apertura, renglonesPorHoja });
  const ahora = opciones.ahora ?? new Date();

  // "PDF firmado": la firma que el piloto guardó al firmar un plan de vuelo.
  let firmaPng: Uint8Array | undefined;
  if (opciones.conFirma) {
    const r = await leer("/planes-de-vuelo/firma");
    const png = r.ok ? ((await r.json().catch(() => null)) as { png?: string } | null)?.png : undefined;
    firmaPng = pngDeDataUrl(png);
    if (!firmaPng) {
      return { ok: false, status: 404, error: "Todavía no guardaste tu firma. Se guarda la primera vez que firmás un plan de vuelo." };
    }
  }

  const bytes = await pdfDelLibro(
    hojas,
    {
      apellidoYNombre: apellidoYNombre(perfil?.first_name, perfil?.last_name),
      licencia: perfil?.license_type && perfil.license_type !== "-" ? perfil.license_type : "",
      licenciaNumero: perfil?.licencia_numero ?? "",
      legajo: perfil?.legajo ?? "",
      libro: libros.length > 1 ? libro?.name : undefined,
    },
    { generado: fechaDeGeneracion(ahora), apertura, renglonesPorHoja, firmaPng }
  );

  const apellido = (perfil?.last_name ?? "piloto")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return {
    ok: true,
    bytes,
    archivo: `libro-de-vuelo-${apellido || "piloto"}-${ahora.toISOString().slice(0, 10)}${firmaPng ? "-firmado" : ""}.pdf`,
    libro: libros.length > 1 ? (libro?.name ?? null) : null,
    vuelos: delLibro.length,
  };
}
