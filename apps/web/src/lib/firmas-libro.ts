/**
 * Las firmas de quienes certifican los vuelos (migración 047) y el dorso de cada hoja:
 * a quién le corresponde cada vuelo y cómo entra la imagen en su lugar. Puro y testeado.
 *
 * **Certificar es del certificante.** Vector guarda la imagen de su firma sólo si el piloto
 * dice que tiene su autorización, la usa **únicamente** en el PDF de ese piloto y **sólo
 * si él pide "Con las firmas de los certificantes"** (apagado por defecto). Un vuelo sin
 * certificante, o cuyo certificante no tiene firma guardada, queda en blanco en la columna:
 * no se inventa ni se reparte una firma "parecida".
 */

export interface FirmaCertificante {
  id: string;
  nombre: string;
  licencia?: string | null;
  /** El id de `AUTORIDADES_CAD`, si la firma corresponde a un cargo de la lista del CAD. */
  autoridad_id?: number | null;
  png: string;
  /** Otros nombres con los que aparece en los vuelos (normalizados). */
  alias?: string[];
  /** Su firma con sello o aclaración, para el dorso de las hojas. */
  png_sello?: string | null;
  /** Si su firma se pone sola en la celda del PDF. Sin el dato (backend viejo), sí. */
  automatica?: boolean;
}

/** Una persona sin sus imágenes (`GET /firmas/certificantes/nombres`): para elegirla en un vuelo. */
export interface CertificanteBreve {
  id: string;
  nombre: string;
  licencia?: string | null;
  automatica?: boolean;
}

export interface SugerenciaCertificante {
  certificante_id: string;
  nombre_en_vuelos: string;
  vuelo_ids: string[];
  /** El nombre no es el de la persona ni un alias: al asociar se suma como alias. */
  sumar_alias: boolean;
}

export interface DorsoHoja {
  id: string;
  logbook_id: string;
  hoja: number;
  png?: string | null;
  aclaracion?: string | null;
  fecha?: string | null;
  /** Las personas cuyas firmas con sello van en este dorso si no tiene foto propia. */
  certificante_ids?: string[];
}

/** "  Pérez,  JUAN " y "juan perez" son la misma persona: sin acentos, en mayúsculas, sin puntuación. */
export function normalizarNombre(nombre: string | null | undefined): string {
  return (nombre ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9Ñ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Las mismas palabras en cualquier orden: "PÉREZ JUAN" y "JUAN PÉREZ". */
function clavePalabras(nombre: string): string {
  return normalizarNombre(nombre).split(" ").filter(Boolean).sort().join(" ");
}

/**
 * La firma que le toca a un vuelo, por nombre: la de la persona que lo dice (o uno de sus alias).
 *
 * 1. **Por nombre**, que es lo que identifica a una persona (`cad_autoridad_nombre`): igual
 *    una vez normalizado, o con las mismas palabras en otro orden ("PÉREZ, JUAN"). Cuenta el
 *    nombre guardado y sus alias.
 * 2. **Por cargo (`cad_autoridad_id`), sólo si el vuelo no trae nombre** y una única firma
 *    guardada corresponde a ese cargo: el id es "instructor de vuelo", no una persona, así
 *    que con dos instructores guardados no se elige a ninguno.
 * 3. Si no, `null`: la celda queda en blanco.
 *
 * Esto es sólo el respaldo de un vuelo sin persona asignada: `firmaDelRenglon` decide el orden.
 */
export function firmaParaVuelo(
  certificante: { autoridadId: number | null; nombre: string } | null | undefined,
  firmas: FirmaCertificante[]
): FirmaCertificante | null {
  if (!certificante || !firmas.length) return null;
  const nombre = normalizarNombre(certificante.nombre);
  if (nombre) {
    const clave = clavePalabras(certificante.nombre);
    const nombres = (f: FirmaCertificante) => [f.nombre, ...(f.alias ?? [])];
    return (
      firmas.find((f) => nombres(f).some((n) => normalizarNombre(n) === nombre)) ??
      firmas.find((f) => nombres(f).some((n) => clavePalabras(n) === clave)) ??
      null
    );
  }
  if (certificante.autoridadId) {
    const delCargo = firmas.filter((f) => f.autoridad_id === certificante.autoridadId);
    return delCargo.length === 1 ? delCargo[0] : null;
  }
  return null;
}

/**
 * La firma de la celda de un vuelo (migración 048), en este orden:
 *
 * 1. `firma = "no"` en el vuelo: nada.
 * 2. Con persona asignada: esa persona, si el vuelo dice `"si"` o la persona es automática.
 * 3. Sin persona: la búsqueda por nombre o alias de `firmaParaVuelo`, **sólo** con personas
 *    automáticas (una persona apagada no se pone sola ni por el nombre).
 *
 * Una persona asignada que ya no existe (se borró) cae en el paso 3: el vuelo quedó sin persona.
 */
export function firmaDelRenglon(
  certificante: { autoridadId: number | null; nombre: string; certificanteId?: string | null; firma?: "si" | "no" | null } | null | undefined,
  firmas: FirmaCertificante[]
): FirmaCertificante | null {
  if (!certificante) return null;
  if (certificante.firma === "no") return null;
  const asignada = certificante.certificanteId ? firmas.find((f) => f.id === certificante.certificanteId) : undefined;
  if (asignada) return certificante.firma === "si" || asignada.automatica !== false ? asignada : null;
  return firmaParaVuelo(certificante, firmas.filter((f) => f.automatica !== false));
}

/** Cuántos vuelos tiene asignada cada persona. */
export function vuelosPorCertificante(vuelos: { certificante_id?: string | null }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const v of vuelos) if (v.certificante_id) m.set(v.certificante_id, (m.get(v.certificante_id) ?? 0) + 1);
  return m;
}

/**
 * Los vuelos que no tienen persona asignada, para "Vuelos sin certificante": los más nuevos
 * primero. Un simulador no se firma en la celda como los demás, pero igual es un renglón.
 */
export function vuelosSinCertificante<T extends { certificante_id?: string | null; date: string }>(vuelos: T[]): T[] {
  return vuelos.filter((v) => !v.certificante_id).sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Las firmas con sello de un dorso, acomodadas en grilla de abajo a la derecha hacia arriba y
 * hacia la izquierda, sin superponerse. Las coordenadas son las de pdf-lib (origen abajo a la
 * izquierda): cada caja es `{ x, y, w, h }` de una imagen ya ajustada, en el orden recibido
 * (la primera, abajo a la derecha).
 */
export function acomodarSellos(
  imagenes: { ancho: number; alto: number }[],
  pagina: { ancho: number; alto: number; margen: number },
  opciones: { celdaW?: number; celdaH?: number; hueco?: number; columnas?: number } = {}
): { x: number; y: number; w: number; h: number }[] {
  const n = imagenes.length;
  if (!n) return [];
  const hueco = opciones.hueco ?? 14;
  const utilW = pagina.ancho - 2 * pagina.margen;
  const base = pagina.margen + 10; // el rótulo de la hoja va abajo a la izquierda
  const utilH = pagina.alto - base - pagina.margen - 14; // y la fecha arriba
  const columnas = Math.max(1, Math.min(opciones.columnas ?? (n === 1 ? 1 : n <= 4 ? 2 : 3), n));
  const filas = Math.ceil(n / columnas);
  // Cada celda cabe en el espacio útil: nunca se superponen, aunque sean 12.
  const celdaW = Math.min(opciones.celdaW ?? 220, (utilW - hueco * (columnas - 1)) / columnas);
  const celdaH = Math.min(opciones.celdaH ?? 150, (utilH - hueco * (filas - 1)) / filas);
  return imagenes.map((img, i) => {
    const fila = Math.floor(i / columnas);
    const col = i % columnas;
    const caja = ajustarEnCaja(img.ancho, img.alto, celdaW, celdaH, true);
    const xCelda = pagina.ancho - pagina.margen - (col + 1) * celdaW - col * hueco;
    const yCelda = base + fila * (celdaH + hueco);
    // Pegada a la derecha de su celda y apoyada abajo: el borde común queda alineado.
    return { x: xCelda + (celdaW - caja.w), y: yCelda, w: caja.w, h: caja.h };
  });
}

/** El tamaño de una imagen ajustada a una caja, sin deformarla ni agrandarla de más. */
export function ajustarEnCaja(
  ancho: number,
  alto: number,
  cajaW: number,
  cajaH: number,
  agrandar = false
): { w: number; h: number } {
  if (ancho <= 0 || alto <= 0 || cajaW <= 0 || cajaH <= 0) return { w: 0, h: 0 };
  let escala = Math.min(cajaW / ancho, cajaH / alto);
  if (!agrandar) escala = Math.min(1, escala);
  return { w: ancho * escala, h: alto * escala };
}

/** Los dorsos de un libro por número de hoja, sólo los que tienen algo cargado. */
export function dorsosPorHoja(dorsos: DorsoHoja[], libroId: string | null | undefined): Map<number, DorsoHoja> {
  const m = new Map<number, DorsoHoja>();
  for (const d of dorsos) {
    if (libroId && d.logbook_id !== libroId) continue;
    if (!d.png && !d.aclaracion?.trim() && !d.fecha && !d.certificante_ids?.length) continue;
    m.set(d.hoja, d);
  }
  return m;
}

/** "2026-11-02" → "02/11/2026", sin pasar por `Date` (invariante 1). */
export function fechaDelDorso(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/**
 * Lo que el formulario de un vuelo manda de su certificante (migración 048). Sin el campo en el
 * formulario no se manda nada (un PATCH no lo toca); con el campo vacío se desasocia. La
 * anulación sólo vale con persona. Un id que no tiene forma de uuid no se manda.
 */
export function certificanteDelFormulario(
  id: FormDataEntryValue | null,
  firma: FormDataEntryValue | null
): { certificante_id?: string | null; certificante_firma?: "si" | "no" | null } {
  if (id === null) return {};
  const limpio = String(id).trim();
  if (!limpio) return { certificante_id: null, certificante_firma: null };
  if (!/^[0-9a-f-]{36}$/i.test(limpio)) return {};
  const f = String(firma ?? "");
  return { certificante_id: limpio, certificante_firma: f === "si" || f === "no" ? f : null };
}

/** "automática" (lo que diga la persona), "sí" o "no": cómo se lee la anulación de un vuelo. */
export function etiquetaFirma(firma: "si" | "no" | null | undefined): string {
  return firma === "si" ? "sí" : firma === "no" ? "no" : "automática";
}
