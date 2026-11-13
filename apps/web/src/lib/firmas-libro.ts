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
  /** Si su firma se pone sola en la celda del PDF. Sin el dato (backend viejo), sí. */
  automatica?: boolean;
  /** Sus firmas con sello (migración 049), una por cargo, con la imagen. */
  sellos?: SelloCertificante[];
}

/** Un sello sin su imagen: para elegir con qué cargo certificó un vuelo. */
export interface SelloBreve {
  id: string;
  /** "Jefe de instructores", "Instructor de vuelo"… */
  etiqueta: string;
  /** El cargo del CAD de este sello (`AUTORIDADES_CAD`). */
  autoridad_id?: number | null;
  /** Cómo va el nombre al CAD con este cargo; sin él, el de la persona. */
  nombre_cad?: string | null;
  orden?: number;
}

export interface SelloCertificante extends SelloBreve {
  png: string;
}

/** Una persona sin sus imágenes (`GET /firmas/certificantes/nombres`): para elegirla en un vuelo. */
export interface CertificanteBreve {
  id: string;
  nombre: string;
  licencia?: string | null;
  autoridad_id?: number | null;
  automatica?: boolean;
  sellos?: SelloBreve[];
}

export interface SugerenciaCertificante {
  certificante_id: string;
  nombre_en_vuelos: string;
  vuelo_ids: string[];
  /** El nombre no es el de la persona ni un alias: al asociar se suma como alias. */
  sumar_alias: boolean;
  /** El sello de la persona con el mismo cargo que esos vuelos, si lo hay (migración 049). */
  sello_id?: string | null;
}

/** Una foto del dorso (migración 049): un dorso puede tener varias. */
export interface DorsoFoto {
  id: string;
  png: string;
  orden?: number;
}

export interface DorsoHoja {
  id: string;
  logbook_id: string;
  hoja: number;
  aclaracion?: string | null;
  fecha?: string | null;
  /** Los sellos (de cualquier persona) que van en este dorso, junto a sus fotos. */
  sello_ids?: string[];
  fotos?: DorsoFoto[];
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

/**
 * El sello que le toca a un vuelo con ese cargo del CAD: el de **el mismo `autoridad_id`**; si
 * ninguno lo tiene, el que no declara cargo; si tampoco, ninguno (no se elige uno "parecido").
 * Es lo mismo que sugiere el backend (`sello_para_cargo`); sirve para preseleccionar en el vuelo.
 */
export function selloParaCargo<T extends { autoridad_id?: number | null; orden?: number }>(sellos: T[] | undefined, autoridadId: number | null | undefined): T | null {
  const ordenados = [...(sellos ?? [])].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  if (autoridadId) {
    const igual = ordenados.find((x) => x.autoridad_id === autoridadId);
    if (igual) return igual;
  }
  return ordenados.find((x) => x.autoridad_id == null) ?? null;
}

/** "Gustavo Emilio Macedo · Jefe de instructores": cómo se nombra un sello en los selectores. */
export function nombreDeSello(persona: { nombre: string; sellos?: SelloBreve[] }, sello: SelloBreve | null | undefined): string {
  return sello && (persona.sellos?.length ?? 0) > 0 ? `${persona.nombre} · ${sello.etiqueta}` : persona.nombre;
}

/**
 * Las opciones de un selector de "Certificó": una por persona sin sellos y **una por sello** si
 * tiene (con el cargo en el nombre). `valor` es `personaId` o `personaId|selloId`.
 */
export const SEGUN_CARGO = "auto";

export function opcionesDeCertificante(
  personas: { id: string; nombre: string; sellos?: SelloBreve[] }[],
  { segunCargo = false }: { segunCargo?: boolean } = {}
): { valor: string; texto: string; personaId: string; selloId: string | null }[] {
  return personas.flatMap((p) => {
    if (!p.sellos?.length) return [{ valor: p.id, texto: p.nombre, personaId: p.id, selloId: null }];
    const porSello = [...p.sellos].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)).map((s) => ({ valor: `${p.id}|${s.id}`, texto: nombreDeSello(p, s), personaId: p.id, selloId: s.id as string | null }));
    // Para varios vuelos a la vez: "según el cargo de cada vuelo" reparte cada uno con su sello.
    return segunCargo && p.sellos.length > 1 ? [{ valor: `${p.id}|${SEGUN_CARGO}`, texto: `${p.nombre} · según el cargo de cada vuelo`, personaId: p.id, selloId: SEGUN_CARGO }, ...porSello] : porSello;
  });
}

/**
 * Reparte los vuelos entre los sellos de una persona para asignarlos de a un pedido por sello:
 * con un sello elegido, todos con ése; con `SEGUN_CARGO`, cada vuelo con el sello de su cargo del
 * CAD (`selloParaCargo`; sin uno que sirva, sin sello). Los grupos salen en el orden en que aparecen.
 */
export function repartirPorSello(
  vuelos: { id: string; cad_autoridad_id?: number | null }[],
  sellos: SelloBreve[] | undefined,
  elegido: string | null | undefined
): { selloId: string | null; ids: string[] }[] {
  if (elegido !== SEGUN_CARGO) return [{ selloId: elegido || null, ids: vuelos.map((v) => v.id) }];
  const grupos = new Map<string | null, string[]>();
  for (const v of vuelos) {
    const id = selloParaCargo(sellos, v.cad_autoridad_id)?.id ?? null;
    grupos.set(id, [...(grupos.get(id) ?? []), v.id]);
  }
  return [...grupos].map(([selloId, ids]) => ({ selloId, ids }));
}

/** La opción de un selector que le toca a un vuelo: la de su sello, o la de su persona. */
export function valorDeOpcion(personas: { id: string; sellos?: SelloBreve[] }[], personaId: string | null | undefined, selloId: string | null | undefined, autoridadId?: number | null): string {
  if (!personaId) return "";
  const p = personas.find((x) => x.id === personaId);
  if (!p?.sellos?.length) return personaId;
  const sello = p.sellos.find((x) => x.id === selloId) ?? selloParaCargo(p.sellos, autoridadId) ?? [...p.sellos].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))[0];
  return `${p.id}|${sello.id}`;
}

/** Los sellos distintos de los vuelos de cada hoja, sin repetir y en orden de aparición (`/dashboard/settings`). */
export function sellosDeLosVuelos(vuelosDeLaHoja: { certificante_sello_id?: string | null }[]): string[] {
  const vistos: string[] = [];
  for (const v of vuelosDeLaHoja) if (v.certificante_sello_id && !vistos.includes(v.certificante_sello_id)) vistos.push(v.certificante_sello_id);
  return vistos;
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
 * **El tamaño real de un bloque de firma con sello en el dorso** (Federico, 2026-11-13: "aparece
 * ENORME"): en el papel mide del orden de 7 × 3,5 cm, así que cada imagen entra en una caja de
 * 70 × 35 mm, nunca más grande. Las fotos son de cualquier resolución, así que el tamaño no sale
 * de sus píxeles sino de esta caja; una imagen chica no se agranda más que 1 pt por píxel
 * (`ajustarEnCaja` sin `agrandar`).
 */
export const MM = 72 / 25.4;
export const CAJA_SELLO = { ancho: 70 * MM, alto: 35 * MM };

/**
 * Las imágenes de un dorso (fotos y sellos), acomodadas **a tamaño real** en grilla desde abajo a
 * la derecha hacia la izquierda y hacia arriba, sin superponerse. Las coordenadas son las de
 * pdf-lib (origen abajo a la izquierda): cada caja es `{ x, y, w, h }` de la imagen ya ajustada,
 * en el orden recibido (la primera, abajo a la derecha).
 *
 * Cada celda mide `CAJA_SELLO` (70 × 35 mm). Se elige la cantidad de columnas que deja las
 * celdas más grandes (a igualdad, más columnas: la grilla queda más baja); si ni así entran
 * todas en el espacio útil, las celdas se achican **lo mínimo** (nunca se agrandan). Con
 * `reservaAbajo` se deja libre una franja abajo (para la línea de aclaración).
 */
export function acomodarSellos(
  imagenes: { ancho: number; alto: number }[],
  pagina: { ancho: number; alto: number; margen: number; reservaAbajo?: number; reservaArriba?: number },
  opciones: { celdaW?: number; celdaH?: number; hueco?: number } = {}
): { x: number; y: number; w: number; h: number }[] {
  const n = imagenes.length;
  if (!n) return [];
  const hueco = opciones.hueco ?? 10;
  const baseW = opciones.celdaW ?? CAJA_SELLO.ancho;
  const baseH = opciones.celdaH ?? CAJA_SELLO.alto;
  const utilW = pagina.ancho - 2 * pagina.margen;
  const base = pagina.margen + (pagina.reservaAbajo ?? 10); // el rótulo de la hoja va abajo a la izquierda
  const utilH = pagina.alto - base - pagina.margen - (pagina.reservaArriba ?? 14); // y la fecha arriba
  let mejor = { columnas: 1, escala: 0 };
  for (let c = 1; c <= n; c++) {
    const f = Math.ceil(n / c);
    const escala = Math.min(1, (utilW - hueco * (c - 1)) / c / baseW, (utilH - hueco * (f - 1)) / f / baseH);
    if (escala >= mejor.escala - 1e-9) mejor = { columnas: c, escala };
  }
  const celdaW = baseW * mejor.escala;
  const celdaH = baseH * mejor.escala;
  return imagenes.map((img, i) => {
    const fila = Math.floor(i / mejor.columnas);
    const col = i % mejor.columnas;
    const caja = ajustarEnCaja(img.ancho, img.alto, celdaW, celdaH);
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
    if (!d.fotos?.length && !d.aclaracion?.trim() && !d.fecha && !d.sello_ids?.length) continue;
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
  firma: FormDataEntryValue | null,
  sello?: FormDataEntryValue | null
): { certificante_id?: string | null; certificante_firma?: "si" | "no" | null; certificante_sello_id?: string | null } {
  if (id === null) return {};
  const limpio = String(id).trim();
  if (!limpio) return { certificante_id: null, certificante_firma: null, certificante_sello_id: null };
  if (!/^[0-9a-f-]{36}$/i.test(limpio)) return {};
  const f = String(firma ?? "");
  const s = String(sello ?? "").trim();
  return { certificante_id: limpio, certificante_firma: f === "si" || f === "no" ? f : null, certificante_sello_id: /^[0-9a-f-]{36}$/i.test(s) ? s : null };
}

/** "automática" (lo que diga la persona), "sí" o "no": cómo se lee la anulación de un vuelo. */
export function etiquetaFirma(firma: "si" | "no" | null | undefined): string {
  return firma === "si" ? "sí" : firma === "no" ? "no" : "automática";
}
