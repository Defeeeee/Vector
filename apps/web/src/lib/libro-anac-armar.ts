import { esAlumno, vuelosDesdeLaPpa } from "@/lib/licencias";
import { apellidoYNombre, armarLibro, fechaDeGeneracion, renglonesDeLaHoja, valoresDeApertura, vuelosDeUnLibro, type RenglonLibro } from "@/lib/libro-anac";
import { pdfDelLibro, type CertificacionParaPdf, type DorsoParaPdf } from "@/lib/libro-anac-pdf";
import { bloquesDelDorso, dorsosPorHoja, firmaDelRenglon, type DorsoHoja, type FirmaCertificante } from "@/lib/firmas-libro";
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
  opciones: { libroId?: string | null; libroNombre?: string | null;
    ahora?: Date;
    conFirma?: boolean;
    /** Las firmas de los certificantes en la celda de cada vuelo (`?certificaciones=1`). */
    conCertificaciones?: boolean;
    /** El dorso de cada hoja, página por página (`?dorsos=1`). */
    conDorsos?: boolean;
  } = {}
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
  const delLibro = vuelosDeUnLibro(vuelos, libros, libro);

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

  // Las firmas de los certificantes: sólo si el piloto las pidió. Si las pidió y no hay
  // ninguna guardada, se le dice (un PDF "con firmas" sin firmas sería un engaño).
  let certificaciones: ((r: RenglonLibro) => CertificacionParaPdf | null) | undefined;
  if (opciones.conCertificaciones) {
    const r = await leer("/firmas/certificantes");
    if (!r.ok) {
      return { ok: false, status: 502, error: "No se pudieron leer las firmas de los certificantes. Probá de nuevo en un momento." };
    }
    const firmas = ((await r.json().catch(() => [])) as FirmaCertificante[]).filter((f) => pngDeDataUrl(f.png));
    if (!firmas.length) {
      return { ok: false, status: 404, error: "Todavía no guardaste ninguna firma de certificante. Se cargan en el Hangar, en «Firmas del libro»." };
    }
    certificaciones = (renglon) => {
      const f = firmaDelRenglon(renglon.certificante, firmas);
      const png = f ? pngDeDataUrl(f.png) : undefined;
      return f && png ? { id: f.id, png, nombre: f.nombre, licencia: f.licencia } : null;
    };
  }

  // El dorso de cada hoja de este libro: todas sus fotos más los sellos elegidos (migración 049).
  let dorsos: Map<number, DorsoParaPdf> | undefined;
  if (opciones.conDorsos) {
    // Las imágenes de cada sello, por id: las personas traen sus sellos con la imagen.
    const sellos = new Map<string, Uint8Array>();
    const rf = await leer("/firmas/certificantes");
    if (!rf.ok) {
      return { ok: false, status: 502, error: "No se pudieron leer las firmas con sello para los dorsos. Probá de nuevo en un momento." };
    }
    for (const f of (await rf.json().catch(() => [])) as FirmaCertificante[]) {
      for (const sello of f.sellos ?? []) {
        const png = pngDeDataUrl(sello.png);
        if (png) sellos.set(sello.id, png);
      }
    }
    const r = await leer(`/firmas/dorsos${libro ? `?logbook_id=${encodeURIComponent(libro.id)}` : ""}`);
    if (!r.ok) {
      return { ok: false, status: 502, error: "No se pudieron leer los dorsos de las hojas. Probá de nuevo en un momento." };
    }
    const filas = (await r.json().catch(() => [])) as DorsoHoja[];
    dorsos = new Map();
    for (const [hoja, d] of dorsosPorHoja(filas, libro?.id)) {
      // Cada firma (foto o sello) con el texto que avala arriba, y los textos sueltos al final (migración 050).
      const fotos = new Map((d.fotos ?? []).map((f) => [`foto:${f.id}`, pngDeDataUrl(f.png)]));
      const bloques = bloquesDelDorso(d, new Set(sellos.keys())).map((b) => ({
        png: b.firma ? (b.firma.startsWith("foto:") ? fotos.get(b.firma) : sellos.get(b.firma.slice(6))) ?? null : null,
        texto: b.texto,
      }));
      dorsos.set(hoja, { bloques, aclaracion: d.aclaracion, fecha: d.fecha });
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
    { generado: fechaDeGeneracion(ahora), apertura, renglonesPorHoja, firmaPng, certificaciones, dorsos }
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
    archivo: `libro-de-vuelo-${apellido || "piloto"}-${ahora.toISOString().slice(0, 10)}${firmaPng ? "-firmado" : ""}${certificaciones ? "-certificado" : ""}${dorsos ? "-con-dorsos" : ""}.pdf`,
    libro: libros.length > 1 ? (libro?.name ?? null) : null,
    vuelos: delLibro.length,
  };
}
