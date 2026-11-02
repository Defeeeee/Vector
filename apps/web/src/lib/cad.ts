/**
 * Los vuelos de Vector, en el formato del CAD de ANAC (Casillero Aeronáutico Digital,
 * "Registro horas vuelo", Res. ANAC 470/2025).
 *
 * ## Cómo llegan al CAD
 *
 * No hay API pública: el CAD sólo acepta vuelos dentro de la sesión del piloto en su
 * navegador. Desde la 2.36.0, la extensión "Vector → CAD" o el marcador
 * hacen de puente: "Pasar al CAD" les pide lecturas y "Crear" (`lib/enlace-cad.ts`), y ellos
 * los hacen en la pestaña del CAD con la misma API que usa la página (`src/cad/enlace-comun.ts`).
 * La contraseña de ANAC nunca pasa por Vector. Ver la bitácora del 2026-10-21 y del 2026-10-29.
 *
 * ## Qué hay acá
 *
 * Todo lo que no depende de las listas del CAD se arma en el server de Vector
 * (`borradorCad`); lo que sí depende (los IDs de finalidad, aeródromo y autoridad) se
 * resuelve en el CAD (`resolverFinalidad`, `resolverLugar`, `payloadCad`). Lo que se manda
 * es el mismo objeto que arma el formulario "Registrar vuelo" del CAD
 * (`vuelotripulante.create.component.js`, `crear()`), leído el 2026-10-20.
 *
 * **La regla que el CAD valida:** horas de día más horas de noche tiene que ser igual a la
 * diferencia entre la salida y la llegada, con la tabla centesimal de ANAC
 * (`createDecimalFromTime`). Un vuelo que no cumple no se manda: se marca para revisar.
 *
 * Puro.
 */

/* -------------------------------------------------------------------------- */
/* Los IDs del CAD (fijos en su código)                                        */
/* -------------------------------------------------------------------------- */

export const TIPO_VUELO_CAD = { local: 1, travesia: 2, simulador: 3 } as const;
/** En un simulador el CAD sólo ofrece INSTRUCTOR y PILOTO EN INSTRUCCION (`filerCargosSimu`). */
export const CARGO_CAD = { piloto: 1, copiloto: 2, instructor: 3, enInstruccion: 6 } as const;
export const DISCRIMINACION_CAD = {
  instructor: 1,
  multimotor: 2,
  instrumentoReal: 6,
  capota: 7,
  simInstructor: 8,
  simEnInstruccion: 9,
} as const;

/**
 * Las clases que el CAD ofrece para un simulador (`filerClasesSimu`, leído el 2026-10-28):
 * los niveles de dispositivo, no las de avión. Primero las de los simuladores de escuela.
 */
export const CLASES_SIMULADOR = ["ATD", "BATD", "PCATD", "A", "B", "C", "D", "1", "2", "3", "4", "5", "6", "7"] as const;

/**
 * El simulador del CAD que corresponde a un "avión" simulador del Hangar
 * (`aircraft.cad_simulador`, migración 036 del backend): de `GetSimuladoresListItem`, con la
 * clase del dispositivo y el modelo que el CAD le asocia (`GetModelosPorSimuladorListItem`).
 * Se pide una vez por equipo y se recuerda.
 */
export interface SimuladorCad {
  id: number;
  nombre: string;
  clase: string;
  modeloId: number | null;
  modelo: string | null;
}

/** Un ítem de las listas del CAD (`Get…ListItem`). */
export interface ItemCad {
  key: string;
  value: string;
  valueSearch?: string | null;
}

/** Un vuelo ya cargado en el CAD, como lo devuelve `GetPagedList`. */
export interface VueloEnElCad {
  vueloTripulanteID: number;
  /** "2026-10-17T18:00:00": la salida en UTC, sin zona. */
  fechaSalida: string;
  matricula: string | null;
  origenDesc?: string | null;
  destinoDesc?: string | null;
  estadoDesc?: string | null;
}

/* -------------------------------------------------------------------------- */
/* Lo que arma Vector                                                          */
/* -------------------------------------------------------------------------- */

/** Un aeródromo, con los códigos con que lo puede tener el CAD (OACI o designador ANAC). */
export interface LugarParaCad {
  codigo: string;
  candidatos: string[];
  nombre: string | null;
}

export interface BorradorCad {
  vectorId: string;
  /** Para mostrar en el panel: "17/10/2026", "SADF → SADM", "LV-S114", "1.0 h". */
  fecha: string;
  ruta: string;
  matricula: string;
  horas: number;
  tipoVueloID: number;
  cargoID: number;
  /** ISO en UTC, como lo arma el CAD: `fecha + 'T' + hora + ':00Z'`. */
  fechaHoraSalida: string;
  fechaHoraLlegada: string;
  aterrizajes: number;
  clase: string;
  potencia: number | null;
  horasDia: number;
  horasNoche: number;
  origen: LugarParaCad;
  destino: LugarParaCad;
  /** La finalidad como la nombra el CAD ("ENTRENAMIENTO"); el ID se busca allá. */
  finalidad: string;
  discriminaciones: { tipoDiscriminacionID: number; horas: string }[];
  /** Por qué no se puede mandar, o `null`. */
  problema: string | null;
  /** La autoridad que el piloto cargó en el vuelo, si la cargó: el panel la usa en vez de la memoria. */
  autoridad?: { id: string; nombre: string } | null;
  /**
   * Si es una sesión de simulador: el equipo del Hangar y su simulador del CAD, si ya se
   * eligió. Sin elegir, el panel lo pide antes de cargar.
   */
  simulador?: { avionId: string; equipo: string; cad: SimuladorCad | null } | null;
}

/** Lo que Vector sabe del vuelo (`Flight`) que hace falta acá. */
export interface VueloVector {
  id: string;
  date: string;
  route: string;
  landings: number;
  duration: number;
  takeoff?: string | null;
  landing?: string | null;
  purpose?: string | null;
  pic_day_loc?: number | null;
  pic_day_tra?: number | null;
  pic_night_loc?: number | null;
  pic_night_tra?: number | null;
  sic_day_loc?: number | null;
  sic_day_tra?: number | null;
  sic_night_loc?: number | null;
  sic_night_tra?: number | null;
  imc_pil?: number | null;
  imc_cop?: number | null;
  capota?: number | null;
  /** Las dos columnas de una sesión de simulador. */
  sim_instructor?: number | null;
  sim_pil_en_inst?: number | null;
  /** La autoridad certificante, si el piloto la cargó en el vuelo (migración 032). */
  cad_autoridad_id?: number | null;
  cad_autoridad_nombre?: string | null;
}

export interface AvionVector {
  id?: string;
  registration: string;
  type_acft?: string | null;
  potencia_hp?: number | null;
  is_simulator?: boolean | null;
  cad_simulador?: SimuladorCad | null;
}

/**
 * La finalidad de Vector (las siglas del libro, `FlightLogForm`) con el nombre que le da
 * el CAD en `GetFinalidadListItem`. El ID se busca por nombre en cada carga: así, si ANAC
 * renumera la lista, no se manda una finalidad equivocada.
 */
export const FINALIDAD_CAD: Record<string, string> = {
  ACR: "ACROBACIA",
  ADAP: "ADAPTACIÓN",
  AER: "AEROPLICADOR",
  CI: "COMBATE CONTRA INCENDIOS DE BOSQUES Y CAMPOS",
  ENT: "ENTRENAMIENTO",
  EXA: "EXAMEN",
  FOR: "VUELO EN FORMACIÓN",
  FOT: "FOTOGRAFÍA",
  I: "INSTRUCTOR",
  INST: "INSTRUCCIÓN",
  IP: "INSPECTOR",
  LP: "LANZAMIENTO DE PARACAIDISTAS",
  VP: "VUELO PRIVADO",
  READ: "READAPTACIÓN",
  RP: "REMOLQUE DE PLANEADOR",
  SAN: "SANITARIO",
  TA: "TRABAJO AÉREO",
  N: "VUELO NO REGULAR",
  LA: "LINEA AEREA",
  VO: "VUELO OFICIAL",
  PA: "PRUEBA DE AERONAVES",
};

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const unDecimal = (v: number) => Math.round(v * 10) / 10;

/**
 * Las horas entre la salida y la llegada, con la tabla de ANAC, igual que el CAD
 * (`createDecimalFromTime`): días y horas enteros, y los minutos sueltos en décimas.
 */
export function horasCentesimalesCad(salidaIso: string, llegadaIso: string): number | null {
  const a = Date.parse(salidaIso);
  const b = Date.parse(llegadaIso);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  let diff = b - a;
  const dias = Math.floor(diff / 86_400_000);
  diff -= dias * 86_400_000;
  let horas = Math.floor(diff / 3_600_000);
  diff -= horas * 3_600_000;
  const minutos = Math.floor(diff / 60_000);
  let decimal = 0;
  if (minutos >= 3 && minutos <= 8) decimal = 0.1;
  if (minutos >= 9 && minutos <= 14) decimal = 0.2;
  if (minutos >= 15 && minutos <= 20) decimal = 0.3;
  if (minutos >= 21 && minutos <= 26) decimal = 0.4;
  if (minutos >= 27 && minutos <= 33) decimal = 0.5;
  if (minutos >= 34 && minutos <= 39) decimal = 0.6;
  if (minutos >= 40 && minutos <= 45) decimal = 0.7;
  if (minutos >= 46 && minutos <= 51) decimal = 0.8;
  if (minutos >= 52 && minutos <= 57) decimal = 0.9;
  if (minutos >= 58) horas++;
  return unDecimal(dias * 24 + horas + decimal);
}

/** "LVS114" → "LV-S114", como la escribe el registro de ANAC. */
export function matriculaCad(matricula: string): string {
  const m = matricula.trim().toUpperCase().replace(/\s+/g, "");
  if (/^LV-/.test(m) || !/^LV[A-Z0-9]/.test(m)) return m;
  return `LV-${m.slice(2)}`;
}

/** La clase del avión como la pide el CAD: los acuáticos de Vector (MONT-H) son MON-A. */
export function claseCad(tipo: string | null | undefined): string | null {
  const t = (tipo ?? "").trim().toUpperCase();
  if (t === "MONT-T" || t === "MULT-T") return t;
  if (t === "MONT-H" || t === "MON-A") return "MON-A";
  if (t === "MULT-H" || t === "MULT-A") return "MULT-A";
  return null;
}

/** "2026-10-17T18:00:00.000Z": el ISO al minuto, como `new Date(fecha+'T'+hora+':00Z')`. */
function isoAlMinuto(v: string | null | undefined): string | null {
  const ms = Date.parse(v ?? "");
  if (!Number.isFinite(ms)) return null;
  return new Date(Math.floor(ms / 60_000) * 60_000).toISOString();
}

/**
 * El vuelo de Vector armado para el CAD, con todo lo que no depende de sus listas. Si algo
 * impide mandarlo, va en `problema` y el panel lo muestra para cargarlo a mano.
 *
 * `lugar` traduce un código de la ruta a sus candidatos (OACI y designador ANAC), con el
 * directorio de aeródromos del server.
 */
export function borradorCad(
  f: VueloVector,
  avion: AvionVector | null,
  lugar: (codigo: string) => LugarParaCad
): BorradorCad {
  const partes = (f.route ?? "").trim().toUpperCase().split(/\s+/).filter(Boolean);
  const origen = lugar(partes[0] ?? "");
  const destino = lugar(partes[partes.length - 1] ?? partes[0] ?? "");

  const pic = n(f.pic_day_loc) + n(f.pic_day_tra) + n(f.pic_night_loc) + n(f.pic_night_tra);
  const sic = n(f.sic_day_loc) + n(f.sic_day_tra) + n(f.sic_night_loc) + n(f.sic_night_tra);
  const copiloto = sic > 0 && pic === 0;
  const horasDia = unDecimal(copiloto ? n(f.sic_day_loc) + n(f.sic_day_tra) : n(f.pic_day_loc) + n(f.pic_day_tra));
  const horasNoche = unDecimal(copiloto ? n(f.sic_night_loc) + n(f.sic_night_tra) : n(f.pic_night_loc) + n(f.pic_night_tra));
  const travesia =
    n(f.pic_day_tra) + n(f.pic_night_tra) + n(f.sic_day_tra) + n(f.sic_night_tra) > 0 || origen.codigo !== destino.codigo;

  const salida = isoAlMinuto(f.takeoff);
  const llegada = isoAlMinuto(f.landing);
  const horas = salida && llegada ? horasCentesimalesCad(salida, llegada) : null;
  const clase = claseCad(avion?.type_acft);
  const proposito = (f.purpose ?? "").trim().toUpperCase();
  const finalidad = FINALIDAD_CAD[proposito] ?? "";

  const discriminaciones: BorradorCad["discriminaciones"] = [];
  const total = (horas ?? 0).toFixed(1);
  if (proposito === "I") discriminaciones.push({ tipoDiscriminacionID: DISCRIMINACION_CAD.instructor, horas: total });
  if (clase?.startsWith("MULT")) discriminaciones.push({ tipoDiscriminacionID: DISCRIMINACION_CAD.multimotor, horas: total });
  const imc = copiloto ? n(f.imc_cop) : n(f.imc_pil);
  if (imc > 0) discriminaciones.push({ tipoDiscriminacionID: DISCRIMINACION_CAD.instrumentoReal, horas: unDecimal(imc).toFixed(1) });
  if (n(f.capota) > 0) discriminaciones.push({ tipoDiscriminacionID: DISCRIMINACION_CAD.capota, horas: unDecimal(n(f.capota)).toFixed(1) });

  let problema: string | null = null;
  if (pic > 0 && sic > 0) problema = "Tiene horas de piloto y de copiloto: el CAD las pide por separado.";
  else if (!salida || !llegada) problema = "Le falta la hora de salida o de llegada.";
  else if (horas === null) problema = "La llegada no es posterior a la salida.";
  else if (unDecimal(horasDia + horasNoche) !== horas)
    problema = `Las horas de día y de noche (${unDecimal(horasDia + horasNoche).toFixed(1)}) no dan lo que va de la salida a la llegada (${horas.toFixed(1)}).`;
  else if (!avion?.registration) problema = "No tiene avión.";
  else if (!clase) problema = "Al avión le falta la clase (MONT-T, MULT-T…) en el Hangar.";
  else if (!finalidad) problema = `La finalidad "${f.purpose ?? ""}" no tiene par en el CAD.`;
  else if (!origen.codigo) problema = "No tiene ruta.";

  const [y, m, d] = (f.date ?? "").slice(0, 10).split("-");
  const fecha = d && m && y ? `${d}/${m}/${y}` : f.date;
  if (avion?.is_simulator) return borradorSimulador(f, avion, { fecha, salida, llegada, horas, proposito });
  return {
    vectorId: f.id,
    fecha,
    ruta: origen.codigo === destino.codigo ? `${origen.codigo} (local)` : `${origen.codigo} → ${destino.codigo}`,
    matricula: avion?.registration ? matriculaCad(avion.registration) : "",
    horas: horas ?? n(f.duration),
    tipoVueloID: travesia ? TIPO_VUELO_CAD.travesia : TIPO_VUELO_CAD.local,
    cargoID: copiloto ? CARGO_CAD.copiloto : CARGO_CAD.piloto,
    fechaHoraSalida: salida ?? "",
    fechaHoraLlegada: llegada ?? "",
    aterrizajes: Math.max(0, Math.round(n(f.landings))),
    clase: clase ?? "",
    potencia: avion?.potencia_hp ? Number(avion.potencia_hp) : null,
    horasDia,
    horasNoche,
    origen,
    destino,
    finalidad,
    discriminaciones,
    problema,
    autoridad:
      f.cad_autoridad_id && f.cad_autoridad_nombre?.trim() ? { id: String(f.cad_autoridad_id), nombre: f.cad_autoridad_nombre.trim().toUpperCase() } : null,
  };
}

/**
 * Una sesión de simulador, como la carga el CAD (leído de una sesión real de Federico, el
 * 2026-10-28): tipo 3, sin matrícula, lugares ni aterrizajes, día y noche en cero, y el
 * tiempo sólo en la discriminación: "SIM - PILOTO EN INSTRUCCION" (cargo 6) o "SIM - PILOTO
 * INSTRUCTOR" (cargo 3), según la columna del libro que tenga horas.
 */
function borradorSimulador(
  f: VueloVector,
  avion: AvionVector,
  { fecha, salida, llegada, horas, proposito }: { fecha: string; salida: string | null; llegada: string | null; horas: number | null; proposito: string }
): BorradorCad {
  const instructor = n(f.sim_instructor);
  const enInstruccion = n(f.sim_pil_en_inst);
  const esInstructor = instructor > 0 && enInstruccion === 0;
  const columna = unDecimal(esInstructor ? instructor : enInstruccion);
  const finalidad = FINALIDAD_CAD[proposito] ?? (esInstructor ? FINALIDAD_CAD.I : FINALIDAD_CAD.INST);
  const total = (horas ?? 0).toFixed(1);

  let problema: string | null = null;
  if (instructor > 0 && enInstruccion > 0) problema = "Tiene horas de instructor y de piloto en instrucción: el CAD pide una sola.";
  else if (!salida || !llegada) problema = "Le falta la hora de salida o de llegada.";
  else if (horas === null) problema = "La llegada no es posterior a la salida.";
  else if (columna > 0 && columna !== horas)
    problema = `Las horas de simulador (${columna.toFixed(1)}) no dan lo que va de la salida a la llegada (${horas.toFixed(1)}).`;

  return {
    vectorId: f.id,
    fecha,
    ruta: `Simulador ${avion.registration}`.trim(),
    // En el CAD un simulador no lleva matrícula: así también se lo encuentra si ya está.
    matricula: "",
    horas: horas ?? n(f.duration),
    tipoVueloID: TIPO_VUELO_CAD.simulador,
    cargoID: esInstructor ? CARGO_CAD.instructor : CARGO_CAD.enInstruccion,
    fechaHoraSalida: salida ?? "",
    fechaHoraLlegada: llegada ?? "",
    aterrizajes: 0,
    clase: avion.cad_simulador?.clase ?? "",
    potencia: null,
    horasDia: 0,
    horasNoche: 0,
    origen: { codigo: "", candidatos: [], nombre: null },
    destino: { codigo: "", candidatos: [], nombre: null },
    finalidad,
    discriminaciones: [{ tipoDiscriminacionID: esInstructor ? DISCRIMINACION_CAD.simInstructor : DISCRIMINACION_CAD.simEnInstruccion, horas: total }],
    problema,
    autoridad:
      f.cad_autoridad_id && f.cad_autoridad_nombre?.trim() ? { id: String(f.cad_autoridad_id), nombre: f.cad_autoridad_nombre.trim().toUpperCase() } : null,
    simulador: { avionId: avion.id ?? "", equipo: [avion.registration, avion.type_acft].filter(Boolean).join(" "), cad: avion.cad_simulador ?? null },
  };
}

/**
 * El simulador del CAD que más se parece al equipo del Hangar, para proponerlo: cuenta qué
 * palabras de la matrícula y del tipo ("LV-ASG", "C172" → ASG, 172) aparecen en el nombre del
 * CAD ("SANTIAGO I C-172 -- ASG TRAINING CENTER"). Sólo se propone si gana uno solo: elegir
 * mal sería declarar otro simulador.
 */
export function simuladorSugerido(equipo: string, lista: ItemCad[]): ItemCad | null {
  // Cada palabra con sus formas: "C172" también es "172" (el CAD escribe "C-172").
  const formas = (p: string) => {
    const numero = /^[A-Z]{1,3}(\d{3,4})[A-Z]?$/.exec(p)?.[1];
    return numero ? [p, numero] : [p];
  };
  const palabras = (texto: string) => normalizarCad(texto).split(/[^A-Z0-9]+/).filter((p) => p.length >= 3 && p !== "LV");
  const grupos = palabras(equipo).map(formas);
  if (!grupos.length) return null;
  const puntos = lista.map((item) => {
    const tiene = new Set(palabras(item.value).flatMap(formas));
    return { item, p: grupos.filter((g) => g.some((w) => tiene.has(w))).length };
  });
  const max = Math.max(0, ...puntos.map((x) => x.p));
  const ganadores = puntos.filter((x) => x.p === max);
  return max > 0 && ganadores.length === 1 ? ganadores[0].item : null;
}

/** Lo que el piloto eligió para un simulador, revisado: un id de la lista, su nombre y una clase válida. */
export function simuladorValido(x: unknown): SimuladorCad | null {
  if (!x || typeof x !== "object") return null;
  const v = x as Record<string, unknown>;
  const id = Number(v.id);
  const nombre = typeof v.nombre === "string" ? v.nombre.trim().slice(0, 200) : "";
  const clase = typeof v.clase === "string" ? v.clase.trim().toUpperCase() : "";
  if (!Number.isInteger(id) || id <= 0 || !nombre || !(CLASES_SIMULADOR as readonly string[]).includes(clase)) return null;
  const modeloId = Number(v.modeloId);
  const modelo = typeof v.modelo === "string" && v.modelo.trim() ? v.modelo.trim().slice(0, 80) : null;
  return { id, nombre, clase, modeloId: Number.isInteger(modeloId) && modeloId > 0 && modelo ? modeloId : null, modelo: Number.isInteger(modeloId) && modeloId > 0 ? modelo : null };
}

/* -------------------------------------------------------------------------- */
/* Lo que se resuelve en el CAD                                                */
/* -------------------------------------------------------------------------- */

/** Sin tildes y en mayúsculas, para comparar nombres de las listas del CAD. */
export function normalizarCad(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

/** El ID de la finalidad, buscada por nombre. `null` si el CAD no la tiene. */
export function resolverFinalidad(nombre: string, lista: ItemCad[]): string | null {
  const buscado = normalizarCad(nombre);
  if (!buscado) return null;
  return lista.find((i) => normalizarCad(i.value) === buscado)?.key ?? null;
}

/**
 * Las partes del texto de un lugar del CAD (`GetLugarAterrizajeListItem`, leída el
 * 2026-10-21). Un aeródromo con OACI viene como "SADF -  FDO -  FDO (SAN FERNANDO)" (OACI,
 * IATA o designador, y el designador ANAC, que es la clave); uno sin OACI, como
 * " LJN (LUJAN)" o " 2013 (VILLA JOSEFINA)".
 */
function partesDeLugarCad(texto: unknown): string[] {
  return String(texto ?? "")
    .split(" (")[0]
    .split("-")
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
}

/**
 * El ID del aeródromo en la lista del CAD. Se prueba cada candidato (OACI, designador ANAC)
 * contra el OACI de cada entrada y contra su clave, y sólo se acepta una coincidencia exacta
 * de código: elegir otro aeródromo por el nombre sería declarar un vuelo que no se hizo. El
 * código del medio (IATA) no se usa: puede ser el designador de otro aeródromo.
 *
 * La lista repite algunos: Ezeiza está como "SAEZ -  EZE -  EZE (…)" (clave EZE) y como
 * " SAEZ (EZEIZA)" (clave SAEZ). Gana la entrada completa, la del designador ANAC.
 */
export function resolverLugar(lugar: LugarParaCad, lista: ItemCad[]): string | null {
  const codigos = new Set(lugar.candidatos.map((c) => c.trim().toUpperCase()).filter(Boolean));
  let mejor: { key: string; rango: number } | null = null;
  for (const item of lista) {
    const partes = partesDeLugarCad(item.value);
    const clave = String(item.key ?? "").trim().toUpperCase();
    const rango =
      partes.length > 1 && codigos.has(partes[0]) ? 3 : codigos.has(clave) ? 2 : partes.length === 1 && codigos.has(partes[0]) ? 1 : 0;
    if (rango > (mejor?.rango ?? 0)) mejor = { key: item.key, rango };
    if (rango === 3) break;
  }
  return mejor?.key ?? null;
}

/**
 * Si el vuelo ya está en el CAD: misma salida al minuto y misma matrícula. Devuelve su id.
 * El CAD guarda la salida en UTC sin zona ("2026-10-17T18:00:00").
 */
export function yaEstaEnElCad(b: Pick<BorradorCad, "fechaHoraSalida" | "matricula">, enElCad: VueloEnElCad[]): number | null {
  const salida = b.fechaHoraSalida.slice(0, 16);
  if (!salida) return null;
  const matricula = matriculaCad(b.matricula);
  const igual = enElCad.find((v) => (v.fechaSalida ?? "").slice(0, 16) === salida && matriculaCad(v.matricula ?? "") === matricula);
  return igual ? igual.vueloTripulanteID : null;
}

/** Lo que manda "Crear" del CAD, con los IDs ya resueltos. */
export function payloadCad(
  b: BorradorCad,
  ids: { finalidadID: string; origenID: string; destinoID: string; autoridadID: string; autoridadNombre: string },
  simulador?: SimuladorCad | null
) {
  if (b.tipoVueloID === TIPO_VUELO_CAD.simulador) {
    const s = simulador ?? b.simulador?.cad ?? null;
    return {
      Discriminaciones: b.discriminaciones,
      discriminaciones: [],
      tipoVueloID: String(b.tipoVueloID),
      fechaHoraSalida: b.fechaHoraSalida,
      fechaHoraLlegada: b.fechaHoraLlegada,
      aterrizajes: 0,
      autoridadCertificanteID: ids.autoridadID,
      observaciones: ids.autoridadNombre,
      finalidadID: ids.finalidadID,
      potencia: "",
      clase: s?.clase ?? b.clase,
      horasDia: 0,
      horasNoche: 0,
      cargoID: String(b.cargoID),
      simulador: {
        simuladorID: s ? String(s.id) : "",
        nombre: s?.nombre ?? "",
        modeloID: s?.modeloId ? String(s.modeloId) : "",
        modelo: s?.modelo ?? "",
      },
    };
  }
  return {
    Discriminaciones: b.discriminaciones,
    discriminaciones: [],
    tipoVueloID: String(b.tipoVueloID),
    fechaHoraSalida: b.fechaHoraSalida,
    fechaHoraLlegada: b.fechaHoraLlegada,
    aterrizajes: b.aterrizajes,
    autoridadCertificanteID: ids.autoridadID,
    observaciones: ids.autoridadNombre,
    finalidadID: ids.finalidadID,
    potencia: b.potencia ?? "",
    clase: b.clase,
    horasDia: b.horasDia,
    horasNoche: b.horasNoche,
    cargoID: String(b.cargoID),
    origenID: ids.origenID,
    destinoID: ids.destinoID,
    origenPersonalizado: "",
    destinoPersonalizado: "",
    matriculaAvion: b.matricula,
  };
}

/* -------------------------------------------------------------------------- */
/* Cada vuelo en el panel                                                      */
/* -------------------------------------------------------------------------- */

/** Un vuelo de Vector en el panel: si ya está, si se puede cargar o por qué no, y lo elegido. */
export interface FilaCad {
  b: BorradorCad;
  /** Sacado de la lista por el piloto: ya foliado antes del CAD, o ignorado (se guarda en Vector). */
  omitido: MotivoOmitido | null;
  enElCad: number | null;
  problema: string | null;
  ids: { finalidadID: string; origenID: string; destinoID: string } | null;
  elegido: boolean;
  /** Anterior al primer vuelo que ya está en el CAD: probablemente se folió en papel. */
  anterior: boolean;
  autoridad: AutoridadCad;
}

/** La salida más vieja de lo que ya está en el CAD: lo anterior probablemente se folió en papel. */
export function corteCad(enElCad: VueloEnElCad[]): string | null {
  return enElCad.reduce<string | null>((min, v) => (!min || v.fechaSalida < min ? v.fechaSalida : min), null);
}

/**
 * Un vuelo de Vector contra lo que tiene el CAD: ya está, el mismo con otra fecha, o qué IDs
 * lleva. La usa "Pasar al CAD" (`armarPanelCad`).
 */
export function filaCad(
  b: BorradorCad,
  ctx: {
    enElCad: VueloEnElCad[];
    finalidades: ItemCad[];
    lugares: ItemCad[];
    autoridades: ItemCad[];
    corte: string | null;
    memoria: MemoriaAutoridades | null;
  }
): FilaCad {
  const anterior = !!ctx.corte && b.fechaHoraSalida.slice(0, 19) < ctx.corte.slice(0, 19);
  // La que el piloto cargó en el vuelo (migración 032), si sigue en la lista del CAD; si no, la memoria.
  let autoridad =
    b.autoridad && ctx.autoridades.some((a) => String(a.key) === b.autoridad!.id) ? { ...b.autoridad } : autoridadSugerida(ctx.memoria, claveDeAutoridad(b));
  if (!autoridad.id && b.tipoVueloID === TIPO_VUELO_CAD.simulador && ctx.autoridades.some((a) => String(a.key) === AUTORIDAD_SIMULADOR))
    autoridad = { ...autoridad, id: AUTORIDAD_SIMULADOR };
  const base = { b, omitido: null, enElCad: null, ids: null, elegido: false, anterior, autoridad };
  if (b.problema) return { ...base, problema: b.problema };
  const id = yaEstaEnElCad(b, ctx.enElCad);
  if (id) return { ...base, enElCad: id, problema: null };
  // El mismo vuelo con un día de diferencia: mandarlo lo duplicaría en el CAD.
  const otro = mismoVueloOtroDia(b.fechaHoraSalida, b.matricula, ctx.enElCad.map((v) => ({ salida: v.fechaSalida, matricula: v.matricula ?? "" })));
  if (otro)
    return {
      ...base,
      problema: `En el CAD figura el ${fechaCortaCad(otro)}, a la misma hora y en el mismo avión: ¿cuál es la fecha correcta? Corregí la que esté mal para no duplicarlo.`,
    };
  const finalidadID = resolverFinalidad(b.finalidad, ctx.finalidades);
  const simulador = b.tipoVueloID === TIPO_VUELO_CAD.simulador;
  // Un simulador no tiene lugares. Un LAD está en la misma lista que los aeródromos, por su número.
  const origenID = simulador ? "" : resolverLugar(b.origen, ctx.lugares);
  const destinoID = simulador ? "" : b.tipoVueloID === TIPO_VUELO_CAD.local ? origenID : resolverLugar(b.destino, ctx.lugares);
  let problema: string | null = null;
  if (!finalidadID) problema = `El CAD no tiene la finalidad "${b.finalidad}".`;
  else if (origenID === null) problema = `${b.origen.codigo} no está en la lista de aeródromos del CAD. Cargalo a mano.`;
  else if (destinoID === null) problema = `${b.destino.codigo} no está en la lista de aeródromos del CAD. Cargalo a mano.`;
  return {
    ...base,
    problema,
    ids: problema ? null : { finalidadID: finalidadID!, origenID: origenID!, destinoID: destinoID! },
    elegido: !problema && !anterior,
  };
}

/** Lo que `GetPagedList` trae por pedido: con la lista llena, puede haber más. */
export const TOPE_LISTA_CAD = 1000;

/**
 * Los vuelos que Vector tiene marcados como pasados y que ya no están en el CAD: el piloto
 * los borró allá (Federico, 2026-10-28). Vuelven a "Pasar al CAD".
 *
 * Sólo con una lista que se pueda creer entera: vacía puede ser una lectura que falló, y llena
 * hasta el tope puede estar cortada. En esos casos no se desmarca nada.
 */
export function borradosDelCad<T extends { cadId: number }>(marcados: T[], enElCad: Pick<VueloEnElCad, "vueloTripulanteID">[]): T[] {
  if (enElCad.length === 0 || enElCad.length >= TOPE_LISTA_CAD) return [];
  const ids = new Set(enElCad.map((v) => Number(v.vueloTripulanteID)));
  return marcados.filter((m) => !ids.has(m.cadId));
}

/** A una sesión de simulador le falta elegir cuál es en el CAD (o su clase). */
export function faltaSimulador(b: BorradorCad, elegido?: SimuladorCad | null): boolean {
  if (b.tipoVueloID !== TIPO_VUELO_CAD.simulador) return false;
  const s = elegido ?? b.simulador?.cad ?? null;
  return !s || !s.id || !s.nombre || !(CLASES_SIMULADOR as readonly string[]).includes(s.clase);
}

/* -------------------------------------------------------------------------- */
/* La autoridad certificante, por vuelo                                        */
/* -------------------------------------------------------------------------- */

/** La autoridad certificante de un vuelo: el ID de la lista del CAD y el nombre y apellido. */
export interface AutoridadCad {
  id: string;
  nombre: string;
}

/**
 * Lo que el panel recuerda de cargas anteriores, en el navegador del piloto (en el CAD, no
 * en Vector): la última autoridad usada para cada finalidad. Va **por vuelo** (Federico,
 * 2026-10-21): un vuelo de instrucción la firma el instructor y uno privado, otra persona.
 */
export interface MemoriaAutoridades {
  porFinalidad: Record<string, AutoridadCad>;
}

/** La que se propone para un vuelo: la última de su finalidad, o vacía. Se puede cambiar. */
export function autoridadSugerida(memoria: MemoriaAutoridades | null | undefined, finalidad: string): AutoridadCad {
  const a = memoria?.porFinalidad?.[normalizarCad(finalidad)];
  return a && a.id && a.nombre ? { id: a.id, nombre: a.nombre } : { id: "", nombre: "" };
}

/** La memoria con lo que se acaba de cargar: cada finalidad, con la última autoridad usada. */
export function recordarAutoridades(memoria: MemoriaAutoridades | null | undefined, cargas: { finalidad: string; autoridad: AutoridadCad }[]): MemoriaAutoridades {
  const porFinalidad = { ...(memoria?.porFinalidad ?? {}) };
  for (const c of cargas) {
    if (c.autoridad.id && c.autoridad.nombre.trim()) porFinalidad[normalizarCad(c.finalidad)] = { id: c.autoridad.id, nombre: c.autoridad.nombre.trim().toUpperCase() };
  }
  return { porFinalidad };
}

/**
 * Con qué se recuerda la autoridad de un vuelo: su finalidad, y aparte la de los simuladores
 * (una sesión de instrucción la firma el instructor de simulador, no el de vuelo).
 */
export function claveDeAutoridad(b: Pick<BorradorCad, "finalidad" | "tipoVueloID">): string {
  return b.tipoVueloID === TIPO_VUELO_CAD.simulador ? `SIMULADOR ${b.finalidad}` : b.finalidad;
}

/** "INSTRUCTOR DE SIMULADOR" en la lista del CAD: lo que se propone en un simulador sin memoria. */
const AUTORIDAD_SIMULADOR = "19";

/** Si a un vuelo le falta la autoridad o el nombre: el CAD pide los dos en cada vuelo. */
export function faltaAutoridad(a: AutoridadCad | null | undefined): boolean {
  return !a?.id || !a.nombre.trim();
}

/* -------------------------------------------------------------------------- */
/* El camino inverso: del CAD a Vector                                         */
/* -------------------------------------------------------------------------- */

/**
 * "Traer a Vector" prendido (2.27.0). Necesita el backend con `traido_del_cad` (migración
 * 030): sin esa columna, un vuelo traído se crearía cobrando el saldo.
 */
export const TRAER_DEL_CAD = true;

/**
 * Un vuelo de Vector, reducido a lo que hace falta para saber si un vuelo del CAD ya está:
 * el id del CAD si se marcó, y si no, la salida al minuto (UTC) y la matrícula.
 */
export interface VueloConocido {
  cadId: number | null;
  /** "2026-10-17T18:00", UTC. */
  salida: string;
  matricula: string;
}

/** Si un vuelo del CAD ya está en Vector: por su id, o por la misma salida y matrícula. */
export function estaEnVector(v: Pick<VueloEnElCad, "vueloTripulanteID" | "fechaSalida" | "matricula">, conocidos: VueloConocido[]): boolean {
  const salida = (v.fechaSalida ?? "").slice(0, 16);
  const matricula = matriculaCad(v.matricula ?? "");
  return conocidos.some((c) => c.cadId === v.vueloTripulanteID || (!!salida && c.salida === salida && matriculaCad(c.matricula) === matricula));
}

/** Lo que se le pide a Vector que cree: un vuelo con el desglose del libro, ya resuelto. */
export interface VueloTraido {
  cadId: number;
  date: string;
  /** ISO UTC, "2026-09-30T12:30:00Z". */
  takeoff: string;
  landing: string;
  /** Los códigos del CAD; Vector los pasa a OACI si los conoce. */
  origen: string;
  destino: string;
  matricula: string;
  landings: number;
  duration: number;
  purpose: string;
  pic_day_loc: number;
  pic_day_tra: number;
  pic_night_loc: number;
  pic_night_tra: number;
  sic_day_loc: number;
  sic_day_tra: number;
  sic_night_loc: number;
  sic_night_tra: number;
  imc_pil: number;
  imc_cop: number;
  capota: number;
}

/** Un vuelo del CAD para el panel: cómo se ve, y el vuelo para Vector o por qué no. */
export interface FilaTraida {
  cadId: number;
  fecha: string;
  ruta: string;
  matricula: string;
  horas: number;
  finalidad: string;
  vuelo: VueloTraido | null;
  problema: string | null;
}

/** El primer campo que exista, de varios nombres posibles. */
function campo(d: Record<string, unknown>, ...nombres: string[]): unknown {
  for (const k of nombres) if (d[k] !== undefined && d[k] !== null && d[k] !== "") return d[k];
  return undefined;
}

/** "2026-09-30T12:30:00", "…Z" o "…+00:00" → ISO UTC al minuto. Sin zona, es UTC (así guarda el CAD). */
function salidaUtc(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return null;
  const conZona = /[zZ]|[+-]\d{2}:?\d{2}$/.test(v) ? v : `${v.slice(0, 19)}Z`;
  return isoAlMinuto(conZona);
}

/** El código de un lugar del CAD: el OACI si lo tiene ("SADF -  FDO -  FDO (SAN FERNANDO)" → "SADF"), o el que tenga (" LJN (LUJAN)" → "LJN"). */
export function codigoDeLugarCad(texto: unknown): string {
  const codigo = partesDeLugarCad(texto)[0] ?? "";
  // Un LAD viene por su número (" 2013 (VILLA JOSEFINA)"): en Vector es "LAD2013".
  return /^\d{1,6}$/.test(codigo) ? `LAD${Number(codigo)}` : codigo;
}

/** La sigla de Vector para una finalidad del CAD, por nombre. `null` si no tiene par. */
export function propositoDesdeCad(finalidad: string): string | null {
  const buscado = normalizarCad(finalidad);
  if (!buscado) return null;
  return Object.entries(FINALIDAD_CAD).find(([, nombre]) => normalizarCad(nombre) === buscado)?.[0] ?? null;
}

/**
 * Un vuelo del CAD, leído para traerlo a Vector.
 *
 * `d` es lo que devuelve el CAD (la fila de `GetPagedList` con el detalle de `Get` encima).
 * **Su forma no se pudo leer del CAD real** (el 2026-10-21 no respondía): se aceptan los
 * nombres del objeto de "Crear" y los de la lista, y lo que falte o no cierre no se
 * adivina: queda en `problema` y no se trae.
 *
 * El desglose es el del libro: piloto o copiloto (cargo), sobre aeródromo o travesía
 * (tipo de vuelo), de día o de noche; instrumentos real y capota salen de la
 * discriminación.
 */
export function vueloDesdeCad(
  d: Record<string, unknown>,
  listas: { finalidades: ItemCad[]; lugares: ItemCad[] },
  matriculasEnVector: string[]
): FilaTraida {
  const cadId = Number(campo(d, "vueloTripulanteID", "id")) || 0;
  // La lista trae `fechaHoraSalida` para mostrar ("17/10/2026 18:00") y `fechaSalida` en ISO;
  // el detalle trae `fechaHoraSalida` en ISO. Vale la primera que se entienda.
  const salida = salidaUtc(d.fechaHoraSalida) ?? salidaUtc(d.fechaSalida);
  const llegada = salidaUtc(d.fechaHoraLlegada) ?? salidaUtc(d.fechaLlegada);
  const tipo = Number(campo(d, "tipoVueloID", "tipoVueloId"));
  const cargo = Number(campo(d, "cargoID", "cargoId"));
  const horasDia = unDecimal(n(campo(d, "horasDia")));
  const horasNoche = unDecimal(n(campo(d, "horasNoche")));
  const matricula = matriculaCad(String(campo(d, "matriculaAvion", "matricula") ?? ""));

  const porKey = (lista: ItemCad[], id: unknown) => (id === undefined ? undefined : lista.find((i) => String(i.key) === String(id))?.value);
  const finalidad = String(
    porKey(listas.finalidades, campo(d, "finalidadID", "finalidadId")) ?? campo(d, "finalidadDesc", "finalidad") ?? ""
  ).trim();
  const lugar = (pre: "origen" | "destino") =>
    codigoDeLugarCad(porKey(listas.lugares, campo(d, `${pre}ID`, `${pre}Id`)) ?? campo(d, `${pre}Desc`, `${pre}Personalizado`));
  const origen = lugar("origen");
  const destino = lugar("destino") || origen;

  // El detalle: `discriminaciones: [{tipoDiscriminacionID: 7, nombre, horas: 0.7}]`. Si no
  // vino, la lista trae las mismas horas como texto ("0.7 hs").
  // "Crear" manda `Discriminaciones` con datos y `discriminaciones` vacía: vale la que tenga.
  const discs = ([d.discriminaciones, d.Discriminaciones].find((x) => Array.isArray(x) && x.length) ?? []) as { tipoDiscriminacionID?: unknown; horas?: unknown }[];
  const deLaLista: Record<number, unknown> = {
    [DISCRIMINACION_CAD.instrumentoReal]: d.tiempoVueloPorInstrumentoReal,
    [DISCRIMINACION_CAD.capota]: d.tiempoVueloPorInstrumentoCapota,
  };
  const aHoras = (v: unknown) => n(String(v ?? "").replace(",", ".").replace(/\s*hs?$/i, ""));
  const disc = (id: number) =>
    unDecimal(
      discs.length
        ? discs.filter((x) => Number(x?.tipoDiscriminacionID) === id).reduce((t, x) => t + aHoras(x?.horas), 0)
        : aHoras(deLaLista[id])
    );

  const horas = salida && llegada ? horasCentesimalesCad(salida, llegada) : null;
  const duration = unDecimal(horasDia + horasNoche);
  const [y, m, dd] = (salida ?? "").slice(0, 10).split("-");
  const base = {
    cadId,
    fecha: salida ? `${dd}/${m}/${y}` : "",
    ruta: !origen ? "" : origen === destino ? `${origen} (local)` : `${origen} → ${destino}`,
    matricula,
    horas: duration,
    finalidad,
  };

  const proposito = propositoDesdeCad(finalidad);
  const enVector = new Set(matriculasEnVector.map(matriculaCad));
  let problema: string | null = null;
  if (!cadId) problema = "El CAD no devolvió el número del vuelo.";
  else if (tipo === 3 || tipo === 4) problema = `Es un vuelo en ${tipo === 3 ? "simulador" : "planeador"}: cargalo a mano en Vector.`;
  else if (tipo !== 1 && tipo !== 2) problema = "No se pudo leer si es local o travesía.";
  else if (cargo !== 1 && cargo !== 2) problema = "No se pudo leer si fuiste piloto o copiloto.";
  else if (!salida || !llegada) problema = "No se pudo leer la salida o la llegada.";
  else if (horas === null || duration !== horas) problema = "Las horas de día y de noche no dan lo que va de la salida a la llegada.";
  else if (!matricula) problema = "No se pudo leer la matrícula.";
  else if (!enVector.has(matricula)) problema = `${matricula} no está en tu Hangar: agregalo en Vector y volvé a leer el CAD.`;
  else if (!proposito) problema = finalidad ? `La finalidad "${finalidad}" no tiene par en Vector.` : "No se pudo leer la finalidad.";
  else if (!origen) problema = "No se pudo leer el aeródromo de salida.";
  if (problema) return { ...base, vuelo: null, problema };

  const pre = cargo === 1 ? "pic" : "sic";
  const suf = tipo === 1 ? "loc" : "tra";
  const desglose = {
    pic_day_loc: 0, pic_day_tra: 0, pic_night_loc: 0, pic_night_tra: 0,
    sic_day_loc: 0, sic_day_tra: 0, sic_night_loc: 0, sic_night_tra: 0,
  };
  desglose[`${pre}_day_${suf}`] = horasDia;
  desglose[`${pre}_night_${suf}`] = horasNoche;
  const imc = disc(DISCRIMINACION_CAD.instrumentoReal);

  return {
    ...base,
    problema: null,
    vuelo: {
      cadId,
      date: salida!.slice(0, 10),
      takeoff: `${salida!.slice(0, 16)}:00Z`,
      landing: `${llegada!.slice(0, 16)}:00Z`,
      origen,
      destino,
      matricula,
      landings: Math.max(0, Math.round(n(campo(d, "aterrizajes")))),
      duration,
      purpose: proposito!,
      ...desglose,
      imc_pil: cargo === 1 ? imc : 0,
      imc_cop: cargo === 2 ? imc : 0,
      capota: disc(DISCRIMINACION_CAD.capota),
    },
  };
}

/**
 * Un vuelo traído, revisado de nuevo en el server antes de crearlo: llega de otra pestaña
 * (el CAD), así que se valida la forma entera y que las horas cierren. `null` si no sirve.
 */
export function validarTraido(x: unknown): VueloTraido | null {
  if (!x || typeof x !== "object") return null;
  const v = x as Record<string, unknown>;
  const num = (k: string) => (typeof v[k] === "number" && Number.isFinite(v[k]) && (v[k] as number) >= 0 && (v[k] as number) <= 48 ? (v[k] as number) : null);
  const horas = ["pic_day_loc", "pic_day_tra", "pic_night_loc", "pic_night_tra", "sic_day_loc", "sic_day_tra", "sic_night_loc", "sic_night_tra", "imc_pil", "imc_cop", "capota", "duration"] as const;
  if (horas.some((k) => num(k) === null)) return null;
  const cadId = v.cadId;
  if (!Number.isInteger(cadId) || (cadId as number) <= 0) return null;
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$/;
  if (typeof v.takeoff !== "string" || !iso.test(v.takeoff) || typeof v.landing !== "string" || !iso.test(v.landing)) return null;
  if (v.date !== v.takeoff.slice(0, 10)) return null;
  const lugar = /^[A-Z0-9]{2,5}$/;
  if (typeof v.origen !== "string" || !lugar.test(v.origen) || typeof v.destino !== "string" || !lugar.test(v.destino)) return null;
  if (typeof v.matricula !== "string" || !/^[A-Z0-9-]{3,10}$/.test(v.matricula)) return null;
  if (typeof v.purpose !== "string" || !(v.purpose in FINALIDAD_CAD)) return null;
  if (!Number.isInteger(v.landings) || (v.landings as number) < 0 || (v.landings as number) > 99) return null;
  const tiempos = unDecimal(horas.slice(0, 8).reduce((t, k) => t + (v[k] as number), 0));
  if (tiempos !== v.duration || horasCentesimalesCad(v.takeoff, v.landing) !== v.duration) return null;
  return Object.fromEntries(
    ["cadId", "date", "takeoff", "landing", "origen", "destino", "matricula", "landings", "purpose", ...horas].map((k) => [k, v[k]])
  ) as unknown as VueloTraido;
}

/* -------------------------------------------------------------------------- */
/* El mismo vuelo, con otra fecha                                             */
/* -------------------------------------------------------------------------- */

/**
 * Si en la otra punta hay un vuelo en el mismo avión, a la misma hora, un día antes o
 * después: casi seguro el mismo vuelo, con la fecha mal en uno de los dos lados. Pasó con
 * los vuelos de Federico (el CAD decía 05/09 18:20 y Vector 06/09 18:20). Mandarlo
 * duplicaría el vuelo; se marca para revisar y el piloto decide qué fecha es la correcta.
 *
 * `salida` es "AAAA-MM-DDTHH:MM" (UTC). Devuelve la salida del otro, o `null`.
 */
export function mismoVueloOtroDia(
  salida: string,
  matricula: string,
  otros: { salida: string; matricula: string }[]
): string | null {
  const t = Date.parse(`${salida.slice(0, 16)}:00Z`);
  if (!Number.isFinite(t)) return null;
  const m = matriculaCad(matricula);
  if (!m) return null;
  const otro = otros.find((o) => {
    const u = Date.parse(`${(o.salida ?? "").slice(0, 16)}:00Z`);
    return Number.isFinite(u) && Math.abs(u - t) === 86_400_000 && matriculaCad(o.matricula ?? "") === m;
  });
  return otro ? otro.salida.slice(0, 16) : null;
}

/** "2026-09-05T18:20" → "05/09 18:20", para el aviso. */
export function fechaCortaCad(salida: string): string {
  const [f, h] = salida.slice(0, 16).split("T");
  const [, m, d] = (f ?? "").split("-");
  return d && m && h ? `${d}/${m} ${h}` : salida;
}

/** Por qué un vuelo de Vector no se pasa al CAD (migración 031 del backend). */
export type MotivoOmitido = "foliado" | "ignorado";

/* -------------------------------------------------------------------------- */
/* Lo que falta pasar                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Desde cuándo cada vuelo se declara en el CAD: el 1/11/2025, obligatorio para la RAAC 91
 * (Res. ANAC 470/2025, `docs/normativa/libro-de-vuelo-anac.md`). Lo anterior va en el libro
 * de papel y no cuenta como pendiente.
 */
export const INICIO_CAD = "2025-11-01";

/**
 * Cuántos vuelos de Vector faltan pasar al CAD: desde `INICIO_CAD` (y hasta `hasta`, si se
 * da), sin el id del CAD y no omitidos ("ya foliado" o "ignorado"). Los simuladores cuentan
 * desde la 2.33.0, que los pasa. Es la cuenta de la Bitácora y del resumen del mes.
 */
export function pendientesDelCad(
  vuelos: { date?: string | null; aircraft_id?: string | null; cad_vuelo_id?: number | null; cad_omitido?: string | null }[],
  _aviones: { id: string; is_simulator?: boolean | null }[],
  hasta?: string
): number {
  return vuelos.filter((f) => {
    const fecha = (f.date ?? "").slice(0, 10);
    return fecha >= INICIO_CAD && (!hasta || fecha <= hasta) && !f.cad_vuelo_id && !f.cad_omitido;
  }).length;
}

/* -------------------------------------------------------------------------- */
/* La autoridad certificante, guardada en el vuelo                             */
/* -------------------------------------------------------------------------- */

/**
 * La lista de autoridades certificantes del CAD (`GetAutoridadesListItem`, pública, leída el
 * 2026-10-21), para cargarla al registrar el vuelo sin estar en el CAD. El panel igual la
 * compara con la lista viva: si ANAC cambia un id, ese vuelo pide elegirla de nuevo.
 */
export const AUTORIDADES_CAD: { id: number; nombre: string }[] = [
  { id: 5, nombre: "INSTRUCTOR DE VUELO" },
  { id: 6, nombre: "JEFE DE INSTRUCTORES" },
  { id: 7, nombre: "DIRECTOR ESCUELA" },
  { id: 2, nombre: "JEFE DE AERODROMO" },
  { id: 3, nombre: "OFICINA DE PLAN DE VUELO" },
  { id: 4, nombre: "OFICINA DE ARO/AIS" },
  { id: 8, nombre: "PRESIDENTE INST. AERODEPORTIVA" },
  { id: 9, nombre: "INSPECTORES DE VUELO" },
  { id: 10, nombre: "INSPECTORES DE LINEA AEREA" },
  { id: 11, nombre: "DIRECTOR DE AERONAUTICA PROVINCIAL" },
  { id: 12, nombre: "JEFE DE OPERACIONES" },
  { id: 13, nombre: "TITULAR EMPRESA" },
  { id: 14, nombre: "JEFE DE PILOTOS" },
  { id: 15, nombre: "GTE DE OPERACIONES" },
  { id: 16, nombre: "JEFE DE FLOTA" },
  { id: 17, nombre: "JEFE DE LINEA" },
  { id: 18, nombre: "INSPECTORES RECONOCIDOS" },
  { id: 19, nombre: "INSTRUCTOR DE SIMULADOR" },
  { id: 1, nombre: "OTROS" },
];

/** La autoridad de un formulario, revisada: un id de la lista y un nombre, o nada. */
export function autoridadDelFormulario(id: unknown, nombre: unknown): { cad_autoridad_id: number | null; cad_autoridad_nombre: string | null } {
  const n = Number(id);
  const valido = AUTORIDADES_CAD.some((a) => a.id === n);
  const texto = typeof nombre === "string" ? nombre.trim().replace(/\s+/g, " ").slice(0, 120) : "";
  return { cad_autoridad_id: valido ? n : null, cad_autoridad_nombre: texto || null };
}

/**
 * La última autoridad usada en cada finalidad, de los vuelos (del más nuevo al más viejo):
 * lo que el formulario propone. Un vuelo de instrucción lo certifica el instructor, y uno
 * privado, otra persona (Federico, 2026-10-21).
 */
export function autoridadesPorFinalidad(
  vuelos: { purpose?: string | null; cad_autoridad_id?: number | null; cad_autoridad_nombre?: string | null }[]
): Record<string, { id: number; nombre: string }> {
  const salida: Record<string, { id: number; nombre: string }> = {};
  for (const f of vuelos) {
    const p = (f.purpose ?? "").trim().toUpperCase();
    if (!p || salida[p] || !f.cad_autoridad_id || !f.cad_autoridad_nombre?.trim()) continue;
    salida[p] = { id: f.cad_autoridad_id, nombre: f.cad_autoridad_nombre.trim() };
  }
  return salida;
}

/* -------------------------------------------------------------------------- */
/* La sincronización con el CAD (migración 037)                                */
/* -------------------------------------------------------------------------- */

/** Si el CAD dice que al vuelo le falta la declaración jurada ("PENDIENTE DE DDJJ"). */
export function pendienteDeDdjj(estado: string | null | undefined): boolean {
  return /PENDIENTE/i.test(estado ?? "") && /DDJJ|DECLARA/i.test(estado ?? "");
}

/** Cuántos vuelos esperan la declaración jurada en el CAD, para el recordatorio del inicio. */
export function cuantosPendientesDeDdjj(vuelos: { cad_vuelo_id?: number | null; cad_estado?: string | null }[]): number {
  return vuelos.filter((f) => f.cad_vuelo_id && pendienteDeDdjj(f.cad_estado)).length;
}

/* ------------------------------------------ el panel, con el CAD de donde venga --- */

/** Las listas del CAD que usa el panel. */
export interface ListasCad {
  finalidades: ItemCad[];
  autoridades: ItemCad[];
  lugares: ItemCad[];
  simuladores: ItemCad[];
}

/** Lo que muestra el panel de "Pasar al CAD" en Vector (`PanelCad.tsx`). */
export interface DatosPanelCad {
  filas: FilaCad[];
  autoridades: ItemCad[];
  simuladores: ItemCad[];
  /** Cuántos vuelos del CAD no están en Vector (para la pestaña "Traer a Vector"). */
  sinTraer: number;
  /** Cuántos marcados como pasados ya no estaban en el CAD y volvieron a la lista. */
  devueltos: number;
}

/**
 * Cada vuelo de Vector contra lo que tiene el CAD, con las listas y los vuelos del CAD leídos
 * por el backend (modo "desde Vector", apagado) o por la extensión (2.36.0). `devueltos`: los
 * que se borraron del CAD y ya se desmarcaron en Vector (`borradosDelCad`).
 */
export function armarPanelCad(
  vector: { borradores: BorradorCad[]; omitidos: (BorradorCad & { motivo: MotivoOmitido })[]; conocidos: VueloConocido[] },
  devueltos: BorradorCad[],
  l: ListasCad,
  enElCad: VueloEnElCad[],
  memoria: MemoriaAutoridades | null
): DatosPanelCad {
  const ctx = { enElCad, finalidades: l.finalidades, lugares: l.lugares, autoridades: l.autoridades, corte: corteCad(enElCad), memoria };
  return {
    filas: [
      ...devueltos.map((b) => filaCad(b, ctx)),
      ...vector.borradores.map((b) => filaCad(b, ctx)),
      ...vector.omitidos.map(({ motivo, ...b }) => ({ ...filaCad(b, ctx), omitido: motivo, elegido: false })),
    ],
    autoridades: l.autoridades,
    simuladores: [...l.simuladores].sort((a, b) => a.value.localeCompare(b.value)),
    sinTraer: enElCad.filter((v) => !estaEnVector(v, vector.conocidos)).length,
    devueltos: devueltos.length,
  };
}

/**
 * Un vuelo del CAD para "Traer a Vector": la fila de la lista más su detalle (`Get?id=`),
 * traducidos al libro. El mismo vuelo con un día de diferencia queda para revisar.
 */
export function filaParaTraer(
  v: VueloEnElCad,
  detalle: Record<string, unknown> | null,
  listas: { finalidades: ItemCad[]; lugares: ItemCad[] },
  vector: { matriculas: string[]; conocidos: VueloConocido[] }
): FilaTraida {
  const t = vueloDesdeCad({ ...(v as unknown as Record<string, unknown>), ...(detalle ?? {}) }, listas, vector.matriculas);
  const otro = t.vuelo ? mismoVueloOtroDia(t.vuelo.takeoff, t.vuelo.matricula, vector.conocidos) : null;
  return otro
    ? {
        ...t,
        vuelo: null,
        problema: `En Vector figura el ${fechaCortaCad(otro)}, a la misma hora y en el mismo avión: ¿cuál es la fecha correcta? Corregí la que esté mal para no duplicarlo.`,
      }
    : t;
}

/* ------------------------------------------------ de cuándo es lo que sabemos --- */

/** Pasados estos días sin leer el CAD, Vector recomienda actualizarlo (Federico, 2026-10-29). */
export const DIAS_PARA_ACTUALIZAR_CAD = 3;

/**
 * De cuándo es el estado del CAD que muestra Vector (`profiles.cad_leido_at`, migración 038):
 * "hoy a las 15:30", "ayer a las 9:05" o "el 26/10 a las 18:00", en hora argentina, y si ya
 * conviene actualizarlo. `null` si nunca se leyó. Se llama en el server (invariante 1).
 */
export function leidoDelCad(leidoIso: string | null | undefined, ahora: Date): { cuando: string; viejo: boolean } | null {
  if (!leidoIso) return null;
  const leido = new Date(leidoIso);
  if (Number.isNaN(leido.getTime())) return null;
  const zona = "America/Argentina/Buenos_Aires";
  const dia = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const hora = new Intl.DateTimeFormat("es-AR", { timeZone: zona, hour: "numeric", minute: "2-digit", hour12: false }).format(leido);
  const ayer = new Date(ahora.getTime() - 864e5);
  const cuando =
    dia(leido) === dia(ahora)
      ? `hoy a las ${hora}`
      : dia(leido) === dia(ayer)
        ? `ayer a las ${hora}`
        : `el ${new Intl.DateTimeFormat("es-AR", { timeZone: zona, day: "2-digit", month: "2-digit" }).format(leido)} a las ${hora}`;
  return { cuando, viejo: ahora.getTime() - leido.getTime() > DIAS_PARA_ACTUALIZAR_CAD * 864e5 };
}
