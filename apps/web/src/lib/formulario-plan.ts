import {
  casilla18,
  coordenadaOaci,
  duracionHhmm,
  identificacionAeronave,
  indicadorDeLugar,
  salidaUtc,
  textoAts,
  textoFormulario,
  velocidadCrucero,
  DESFASE_ARGENTINA_HORAS,
  type Indicador18,
  type PlanOaci,
} from "./plan-de-vuelo";

/**
 * El formulario del plan de vuelo como lo edita el piloto, casilla por casilla.
 *
 * `plan-de-vuelo.ts` sabe escribir cada casilla en formato OACI; esto es lo que se guarda
 * (`planes_de_vuelo.formulario`, migración 024 del backend) y lo que la pantalla edita.
 * Se parece a lo que hace FPL.AR —el piloto escribe la casilla, la app avisa— y no a un
 * asistente que decide por él:
 *
 * - **La ruta es texto libre** (`DCT SECTOR ESCUELA DCT`): un vuelo local "al sector" no
 *   tiene puntos en ninguna base, y es el vuelo más común de un alumno.
 * - **La duración y la autonomía no se llenan solas**: Vector las sugiere arriba del
 *   campo (Federico, 2026-10-19), con de dónde salen, y el piloto las aplica con un toque.
 * - **Los avisos no frenan** salvo lo que la oficina rechazaría: lo obligatorio vacío o con
 *   el formato roto. "La ARO comprobará que han sido completadas con exactitud, todas las
 *   casillas (de la 7 hasta la 19 inclusive)" (PROGEN-ARO, 4.1.9).
 *
 * Puro: recibe la hora actual cuando la necesita.
 */

export const VERSION_FORMULARIO = 1;

export interface AerodromoForm {
  /** ICAO (`SADF`) o designador ANAC (`CNL`). */
  codigo: string;
  nombre: string;
  lat?: number;
  lon?: number;
}

/** De dónde salió un valor, para pintarlo distinto: lo cargó el perfil del avión o el planificador. */
export type Origen = "avion" | "planificador";

export interface Sugerencia {
  valor: string;
  /** Por qué ese valor: "52 NM a 90 kt, con el viento del planificador". */
  motivo: string;
}

export interface FormularioPlan {
  version: number;
  aircraftId: string | null;
  matricula: string;
  reglas: string;
  tipoVuelo: string;
  numero: string;
  tipoAeronave: string;
  estela: string;
  equipo: string;
  vigilancia: string;
  salida: AerodromoForm | null;
  velocidad: string;
  nivel: string;
  ruta: string;
  destino: AerodromoForm | null;
  eet: string;
  altn1: AerodromoForm | null;
  altn2: AerodromoForm | null;
  /** Lo que el piloto escribe en la 18. DEP/, DEST/, ALTN/ y DOF/ los arma Vector. */
  otros: Partial<Record<Indicador18, string>>;
  autonomia: string;
  personas: string;
  radio: { u: boolean; v: boolean; e: boolean };
  supervivencia: { s: boolean; p: boolean; d: boolean; m: boolean; j: boolean };
  chalecos: { j: boolean; l: boolean; f: boolean; u: boolean; v: boolean };
  botes: { d: boolean; numero: string; capacidad: string; c: boolean; color: string };
  colorMarcas: string;
  /** N/: las observaciones de la casilla 19 (el teléfono, el equipo extra). */
  observaciones: string;
  piloto: string;
  presentadoPor: string;
  /** La oficina ARO/AIS elegida (OACI de su aeródromo). */
  oficina: string;
  origen: Partial<Record<string, Origen>>;
  /** Las sugerencias que dejó el planificador al crear el plan (con el viento). */
  sugerencias: { eet?: Sugerencia & { ruta: string }; autonomia?: Sugerencia };
  /**
   * La salida, **en UTC**, como va en el plan: la fecha (`2026-10-20`, la de DOF/) y la
   * EOBT con cuatro cifras (`1830`). El piloto la carga así —"la hora en el FPL se pone en
   * hora ZULU/UTC, no argentina" (Federico, 2026-10-19)— y la hora argentina sólo se
   * muestra de ayuda.
   */
  dofUtc: string;
  eobtUtc: string;
}

export function formularioVacio(): FormularioPlan {
  return {
    version: VERSION_FORMULARIO,
    aircraftId: null,
    matricula: "",
    reglas: "V",
    tipoVuelo: "G",
    numero: "",
    tipoAeronave: "",
    estela: "L",
    equipo: "",
    vigilancia: "",
    salida: null,
    velocidad: "",
    nivel: "",
    ruta: "DCT",
    destino: null,
    eet: "",
    altn1: null,
    altn2: null,
    otros: {},
    autonomia: "",
    personas: "",
    // Como en el plan que Federico presentó y le aceptaron: ELT sí, radios de supervivencia no.
    radio: { u: false, v: false, e: true },
    supervivencia: { s: false, p: false, d: false, m: false, j: false },
    chalecos: { j: false, l: false, f: false, u: false, v: false },
    botes: { d: false, numero: "", capacidad: "", c: false, color: "" },
    colorMarcas: "",
    observaciones: "",
    piloto: "",
    presentadoPor: "",
    oficina: "",
    origen: {},
    sugerencias: {},
    dofUtc: "",
    eobtUtc: "",
  };
}

/**
 * Lo que vuelve de la base, completado con los valores por defecto: si un día se suma un
 * campo, un plan viejo no rompe la pantalla.
 *
 * **Los planes de antes del 2026-10-19 guardaban la salida en hora argentina**
 * (`fechaLocal`, `horaLocal`): se pasan a UTC al leerlos.
 */
export function leerFormulario(crudo: unknown): FormularioPlan {
  const base = formularioVacio();
  if (!crudo || typeof crudo !== "object") return base;
  const f = crudo as Partial<FormularioPlan> & { fechaLocal?: string; horaLocal?: string };
  const { fechaLocal, horaLocal, ...resto } = f;
  let { dofUtc = "", eobtUtc = "" } = f;
  if (!eobtUtc && fechaLocal && horaLocal) {
    const utc = salidaUtc(fechaLocal, horaLocal);
    if (utc) {
      dofUtc = `20${utc.dof.slice(0, 2)}-${utc.dof.slice(2, 4)}-${utc.dof.slice(4, 6)}`;
      eobtUtc = utc.hora;
    }
  } else if (!dofUtc && fechaLocal) {
    dofUtc = fechaLocal;
  }
  return normalizar({
    ...base,
    ...resto,
    dofUtc,
    eobtUtc,
    radio: { ...base.radio, ...(f.radio ?? {}) },
    supervivencia: { ...base.supervivencia, ...(f.supervivencia ?? {}) },
    chalecos: { ...base.chalecos, ...(f.chalecos ?? {}) },
    botes: { ...base.botes, ...(f.botes ?? {}) },
    otros: { ...(f.otros ?? {}) },
    origen: { ...(f.origen ?? {}) },
    sugerencias: { ...(f.sugerencias ?? {}) },
  });
}

/** Deja la EOBT con cuatro cifras si se escribió `18:30` o `1830`. Se llama antes de guardar. */
export function normalizar(f: FormularioPlan): FormularioPlan {
  const hora = horaDeTexto(f.eobtUtc);
  return hora ? { ...f, eobtUtc: hora.replace(":", "") } : f;
}

/** La salida en UTC como la usa el plan, o `null` si la fecha o la hora no son válidas. */
export function salidaDelPlan(f: Pick<FormularioPlan, "dofUtc" | "eobtUtc">): { hora: string; dof: string } | null {
  const fecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f.dofUtc ?? "");
  const hora = /^([01]\d|2[0-3])([0-5]\d)$/.exec(f.eobtUtc ?? "");
  if (!fecha || !hora) return null;
  const d = new Date(`${f.dofUtc}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== f.dofUtc) return null;
  return { hora: f.eobtUtc, dof: `${fecha[1].slice(2)}${fecha[2]}${fecha[3]}` };
}

/* -------------------------------------------------------------------------- */
/* El perfil del avión para el plan (aircraft.plan_vuelo)                      */
/* -------------------------------------------------------------------------- */

/** Lo fijo de un avión para el plan de vuelo. Lo guarda el Hangar. */
export interface PerfilAvionPlan {
  estela?: string;
  equipo?: string;
  vigilancia?: string;
  nav?: string;
  pbn?: string;
  opr?: string;
  per?: string;
  colorMarcas?: string;
  elt?: boolean;
  radioUhf?: boolean;
  radioVhf?: boolean;
  /** Una línea que va en las observaciones (N/) de todos los planes con este avión. */
  observacionFija?: string;
}

export interface AvionParaPlan {
  id: string;
  registration: string;
  icao: string;
  /** La TAS de crucero del Hangar: llena la velocidad de la casilla 15 si está vacía. */
  cruise_tas_kt?: number | null;
  plan_vuelo?: PerfilAvionPlan | null;
}

export interface PilotoParaPlan {
  /** "FEDERICO DIAZ NEMETH PPA 48225513": nombre, licencia y número. */
  comandante: string;
  /** El celular, para las observaciones: `T.E. +54…`. */
  telefono: string;
  /** Para el formulario de demora, que pide nombre y número de licencia por separado. */
  nombre?: string;
  licencia?: string;
}

/**
 * El teléfono como va en las observaciones: con el +. El perfil guarda el celular como lo
 * reconoce el copiloto de WhatsApp (`5491168862612`).
 */
export function telefonoConMas(telefono: string): string {
  const t = (telefono ?? "").trim();
  return /^54\d{8,}$/.test(t) ? `+${t}` : t;
}

/**
 * Las observaciones de la casilla 19 como las escribió Federico en el plan que EANA le
 * aceptó: `T.E. +5491168862612`, y después la observación fija del avión.
 */
export function observacionesDe(piloto: PilotoParaPlan, perfil: PerfilAvionPlan | null | undefined): string {
  const tel = telefonoConMas(piloto.telefono);
  return [tel ? `T.E. ${tel}` : "", perfil?.observacionFija?.trim() ?? ""].filter(Boolean).join(" ");
}

/**
 * Elegir el avión llena lo que no cambia entre vuelos: matrícula, tipo, equipo, la 18
 * fija, color, ELT, y el comandante y las observaciones del piloto. Lo que llena queda
 * marcado con `origen: "avion"` para que la pantalla lo pinte.
 *
 * **No pisa lo que el piloto ya escribió** en la 18, salvo los indicadores que vienen del
 * avión: cambiar de avión cambia su equipo, no las observaciones del vuelo.
 */
export function aplicarAvion(f: FormularioPlan, avion: AvionParaPlan, piloto: PilotoParaPlan): FormularioPlan {
  const perfil = avion.plan_vuelo ?? {};
  const origen: FormularioPlan["origen"] = { ...f.origen, matricula: "avion", tipoAeronave: "avion" };
  const marcar = (campo: string, valor: string | undefined) => {
    if (valor) origen[campo] = "avion";
    return valor ?? "";
  };
  const otros = { ...f.otros };
  for (const [ind, valor] of [
    ["NAV", perfil.nav],
    ["PBN", perfil.pbn],
    ["OPR", perfil.opr],
    ["PER", perfil.per],
  ] as const) {
    if (valor) {
      otros[ind] = valor;
      origen[`otros.${ind}`] = "avion";
    } else {
      delete otros[ind];
    }
  }
  const observaciones = observacionesDe(piloto, perfil);
  if (observaciones) origen.observaciones = "avion";
  if (piloto.comandante) origen.piloto = "avion";
  const velocidad = !f.velocidad && avion.cruise_tas_kt ? velocidadCrucero(avion.cruise_tas_kt) : f.velocidad;
  if (velocidad !== f.velocidad) origen.velocidad = "avion";

  return {
    ...f,
    aircraftId: avion.id,
    matricula: avion.registration,
    tipoAeronave: (avion.icao ?? "").toUpperCase(),
    estela: perfil.estela || f.estela || "L",
    equipo: marcar("equipo", perfil.equipo) || f.equipo,
    vigilancia: marcar("vigilancia", perfil.vigilancia) || f.vigilancia,
    otros,
    velocidad,
    colorMarcas: marcar("colorMarcas", perfil.colorMarcas) || f.colorMarcas,
    radio: { u: !!perfil.radioUhf, v: !!perfil.radioVhf, e: perfil.elt ?? true },
    observaciones: observaciones || f.observaciones,
    piloto: piloto.comandante || f.piloto,
    origen,
  };
}

/* -------------------------------------------------------------------------- */
/* Validación                                                                  */
/* -------------------------------------------------------------------------- */

export type EstadoCampo = "ok" | "falta" | "error" | "opcional";

export interface Revision {
  plan: PlanOaci;
  estados: Record<string, EstadoCampo>;
  /** Lo que la oficina rechazaría. Con alguno, el PDF no se baja. */
  errores: { campo: string; mensaje: string }[];
  /** Lo que conviene mirar, pero no frena: "la salida ya pasó", "la ruta tiene puntos de más de 30 min". */
  avisos: { campo: string; mensaje: string }[];
  completo: boolean;
  /** De 0 a 100: las casillas obligatorias que están bien. */
  porcentaje: number;
}

const RE_VELOCIDAD = /^(N\d{4}|K\d{4}|M\d{3})$/;
const RE_NIVEL = /^(A\d{3}|F\d{3}|S\d{4}|M\d{4}|VFR)$/;
const RE_HHMM = /^([0-9]\d)([0-5]\d)$/;

function aerodromo(a: AerodromoForm | null) {
  return a && a.codigo.trim() ? indicadorDeLugar(a) : null;
}

/**
 * Revisa el formulario y arma el plan OACI. `ahoraIso` es la hora actual en UTC (ISO),
 * para avisar si la salida ya pasó; sin ella no se avisa.
 */
export function revisar(f: FormularioPlan, ahoraIso?: string): Revision {
  const estados: Record<string, EstadoCampo> = {};
  const errores: Revision["errores"] = [];
  const avisos: Revision["avisos"] = [];
  const obligatorio = (campo: string, valido: boolean, vacio: boolean, mensaje: string) => {
    estados[campo] = vacio ? "falta" : valido ? "ok" : "error";
    if (!valido) errores.push({ campo, mensaje });
  };
  const opcional = (campo: string, valido: boolean, vacio: boolean, mensaje: string) => {
    estados[campo] = vacio ? "opcional" : valido ? "ok" : "error";
    if (!vacio && !valido) errores.push({ campo, mensaje });
  };
  const may = (s: string) => (s ?? "").trim().toUpperCase();

  // 7
  const c7 = identificacionAeronave(f.matricula);
  obligatorio("matricula", c7.length >= 2, !c7, "Casilla 7: falta la matrícula.");

  // 8
  obligatorio("reglas", /^[VIYZ]$/.test(f.reglas), !f.reglas, "Casilla 8: elegí las reglas de vuelo.");
  obligatorio("tipoVuelo", /^[GNSMX]$/.test(f.tipoVuelo), !f.tipoVuelo, "Casilla 8: elegí el tipo de vuelo.");

  // 9
  const numero = may(f.numero);
  opcional("numero", /^\d{1,2}$/.test(numero) && Number(numero) > 1, !numero, "Casilla 9: el número va sólo si son dos o más aeronaves.");
  const tipo = may(f.tipoAeronave);
  obligatorio("tipoAeronave", /^[A-Z][A-Z0-9]{1,3}$/.test(tipo), !tipo, "Casilla 9: el tipo es el designador OACI de 2 a 4 caracteres (p. ej. C152), o ZZZZ.");
  obligatorio("estela", /^[LMHJ]$/.test(f.estela), !f.estela, "Casilla 9: elegí la categoría de estela.");
  if (tipo === "ZZZZ" && !may(f.otros.TYP ?? "")) {
    errores.push({ campo: "otros.TYP", mensaje: "Con ZZZZ en la casilla 9, el tipo va en la 18 después de TYP/." });
  }

  // 10
  const equipo = may(f.equipo);
  obligatorio("equipo", /^(N|[A-Z0-9]{1,40})$/.test(equipo), !equipo, "Casilla 10 a): las letras del equipo (p. ej. SDGZ), o N si no lleva.");
  const vigilancia = may(f.vigilancia);
  obligatorio("vigilancia", /^(N|[A-Z0-9]{1,20})$/.test(vigilancia), !vigilancia, "Casilla 10 b): el transponder (p. ej. C, EB2), o N si no tiene.");
  if (/Z/.test(equipo.replace(/^N$/, "")) && !(f.otros.NAV || f.otros.COM || f.otros.DAT)) {
    avisos.push({ campo: "equipo", mensaje: "Con Z en la casilla 10, el equipo va en la 18 después de NAV/, COM/ o DAT/." });
  }

  // 13
  const salida = aerodromo(f.salida);
  obligatorio("salida", !!salida, !salida, "Casilla 13: falta el aeródromo de salida.");
  const utc = salidaDelPlan(f);
  // La fecha y la hora por separado: con la fecha cargada y la hora todavía vacía, la fecha
  // no tiene nada mal (Federico, 2026-10-28: la marcaba como faltante o incorrecta).
  const fechaValida = !!salidaDelPlan({ dofUtc: f.dofUtc, eobtUtc: "0000" });
  obligatorio("fecha", fechaValida, !f.dofUtc, !f.dofUtc ? "Casilla 13: falta la fecha de salida (UTC)." : "Casilla 13: la fecha de salida no existe.");
  obligatorio(
    "hora",
    /^([01]\d|2[0-3])([0-5]\d)$/.test(f.eobtUtc ?? ""),
    !f.eobtUtc,
    !f.eobtUtc ? "Casilla 13: falta la hora de salida (EOBT, en UTC)." : "Casilla 13: la EOBT va en UTC con cuatro cifras, como 1830."
  );
  if (utc && ahoraIso) {
    const salidaMs = Date.parse(
      `20${utc.dof.slice(0, 2)}-${utc.dof.slice(2, 4)}-${utc.dof.slice(4, 6)}T${utc.hora.slice(0, 2)}:${utc.hora.slice(2)}:00Z`
    );
    if (salidaMs < Date.parse(ahoraIso)) avisos.push({ campo: "fechaHora", mensaje: "La salida ya pasó: revisá la fecha y la hora." });
  }

  // Un LAD sin coordenadas: la AIP pide "el lugar en coordenadas" para lo que no está publicado,
  // y la lista de LAD de ANAC no las trae (`lib/lad.ts`). Avisa, no frena: el piloto las sabe.
  for (const [campo, ad, casilla] of [["salida", f.salida, 13], ["destino", f.destino, 16]] as const) {
    if (ad && /^LAD\d+$/i.test(ad.codigo.trim()) && (ad.lat === undefined || ad.lon === undefined)) {
      avisos.push({ campo, mensaje: `Casilla ${casilla}: cargá las coordenadas del ${ad.codigo.trim().toUpperCase()}, que van en la 18 (la lista de ANAC no las trae).` });
    }
  }

  // 15
  const velocidad = may(f.velocidad);
  obligatorio("velocidad", RE_VELOCIDAD.test(velocidad), !velocidad, "Casilla 15: la velocidad va como N y 4 cifras en nudos (N0090).");
  const nivel = may(f.nivel);
  obligatorio("nivel", RE_NIVEL.test(nivel), !nivel, "Casilla 15: el nivel va como A y 3 cifras en cientos de pies (A015), o VFR.");
  const ruta = may(f.ruta).replace(/\s+/g, " ");
  obligatorio("ruta", /^[A-Z0-9/ ]+$/.test(ruta), !ruta, "Casilla 15: la ruta lleva letras, números, barras y espacios (DCT ATE DCT).");

  // 16
  const destino = aerodromo(f.destino);
  obligatorio("destino", !!destino, !destino, "Casilla 16: falta el aeródromo de destino.");
  const eet = may(f.eet);
  obligatorio("eet", RE_HHMM.test(eet) && eet !== "0000", !eet, "Casilla 16: la duración va en 4 cifras, horas y minutos (0035).");
  const altn1 = aerodromo(f.altn1);
  const altn2 = aerodromo(f.altn2);
  estados.altn1 = altn1 ? "ok" : "opcional";
  estados.altn2 = altn2 ? "ok" : "opcional";

  // 18: lo que arma Vector, más lo que escribió el piloto.
  const otros: Partial<Record<Indicador18, string>> = {};
  for (const [ind, valor] of Object.entries(f.otros)) {
    const v = textoAts(valor ?? "");
    if (v) otros[ind as Indicador18] = v;
  }
  if (salida?.otrosDatos) otros.DEP = salida.otrosDatos;
  if (destino?.otrosDatos) otros.DEST = destino.otrosDatos;
  const altnOtros = [altn1, altn2].flatMap((a) => (a?.otrosDatos ? [a.otrosDatos] : []));
  if (altnOtros.length) otros.ALTN = altnOtros.join(" ");
  if (utc) otros.DOF = utc.dof;
  estados.otros = "ok";

  // 19
  const autonomia = may(f.autonomia);
  obligatorio("autonomia", RE_HHMM.test(autonomia) && autonomia !== "0000", !autonomia, "Casilla 19: la autonomía va en 4 cifras, horas y minutos (0400).");
  if (RE_HHMM.test(autonomia) && RE_HHMM.test(eet)) {
    const min = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(2));
    if (min(autonomia) <= min(eet)) avisos.push({ campo: "autonomia", mensaje: "La autonomía no alcanza para la duración del vuelo." });
  }
  const personas = may(f.personas);
  obligatorio("personas", /^(TBN|[1-9]\d{0,2})$/.test(personas), !personas, "Casilla 19: personas a bordo, en número, o TBN si todavía no sabés.");
  const colorMarcas = textoFormulario(f.colorMarcas);
  obligatorio("colorMarcas", !!colorMarcas, !colorMarcas, "Casilla 19: falta el color y las marcas del avión (A/).");
  const piloto = textoFormulario(f.piloto);
  obligatorio("piloto", !!piloto, !piloto, "Casilla 19: falta el comandante de la aeronave (C/).");

  const s = f.supervivencia;
  const ch = f.chalecos;
  const b = f.botes;
  const plan: PlanOaci = {
    c7,
    c8reglas: f.reglas,
    c8tipo: f.tipoVuelo,
    c9numero: /^\d{1,2}$/.test(numero) ? numero : "",
    c9tipo: tipo,
    c9estela: f.estela,
    c10a: equipo,
    c10b: vigilancia,
    c13ad: salida?.casilla ?? "",
    c13hora: utc?.hora ?? "",
    c15velocidad: velocidad,
    c15nivel: nivel,
    c15ruta: ruta,
    c16ad: destino?.casilla ?? "",
    c16eet: eet,
    c16altn1: altn1?.casilla ?? "",
    c16altn2: altn2?.casilla ?? "",
    c18: casilla18(otros),
    dof: utc?.dof ?? "",
    c19: {
      autonomia,
      personas,
      radio: { ...f.radio },
      supervivencia: { s: s.s, p: s.s && s.p, d: s.s && s.d, m: s.s && s.m, j: s.s && s.j },
      chalecos: { j: ch.j, l: ch.j && ch.l, f: ch.j && ch.f, u: ch.j && ch.u, v: ch.j && ch.v },
      botes: {
        d: b.d,
        numero: b.d ? b.numero.replace(/\D/g, "").slice(0, 2) : "",
        capacidad: b.d ? b.capacidad.replace(/\D/g, "").slice(0, 3) : "",
        c: b.d && b.c,
        color: b.d ? textoFormulario(b.color) : "",
      },
      colorMarcas,
      observaciones: textoFormulario(f.observaciones) || null,
      piloto,
    },
    presentadoPor: textoFormulario(f.presentadoPor),
  };

  const obligatorios = Object.entries(estados).filter(([campo]) => !["numero", "altn1", "altn2", "otros"].includes(campo));
  const bien = obligatorios.filter(([, e]) => e === "ok").length;
  const completo = errores.length === 0;
  return {
    plan,
    estados,
    errores,
    avisos,
    completo,
    porcentaje: obligatorios.length ? Math.round((bien / obligatorios.length) * 100) : 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Duplicar                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Un plan nuevo a partir de otro: el mismo vuelo otro día. Se borra la fecha y la hora
 * (el plan viejo ya pasó) y las sugerencias del planificador, que eran de ese día.
 */
export function duplicar(f: FormularioPlan): FormularioPlan {
  return { ...f, dofUtc: "", eobtUtc: "", sugerencias: {} };
}

/* -------------------------------------------------------------------------- */
/* Sugerencias                                                                 */
/* -------------------------------------------------------------------------- */

/** La TAS en nudos que dice la casilla 15 (`N0090` → 90, `K0185` → 100). */
export function tasDeVelocidad(velocidad: string): number | null {
  const v = (velocidad ?? "").trim().toUpperCase();
  const n = /^N(\d{4})$/.exec(v);
  if (n) return Number(n[1]) || null;
  const k = /^K(\d{4})$/.exec(v);
  if (k) return Number(k[1]) ? Math.round(Number(k[1]) / 1.852) : null;
  return null;
}

/** La duración sugerida para una distancia y una TAS, sin viento. */
export function sugerirEet(distanciaNm: number, tasKt: number): Sugerencia | null {
  if (!(distanciaNm > 0) || !(tasKt > 0)) return null;
  const minutos = Math.round((distanciaNm / tasKt) * 60);
  return { valor: duracionHhmm(Math.max(1, minutos)), motivo: `${Math.round(distanciaNm)} NM a ${Math.round(tasKt)} kt, sin viento` };
}

/** La autonomía sugerida: el combustible sobre el consumo, redondeada para abajo. */
export function sugerirAutonomia(litros: number, consumoLh: number, deDonde: string): Sugerencia | null {
  if (!(litros > 0) || !(consumoLh > 0)) return null;
  return {
    valor: duracionHhmm(Math.floor((litros / consumoLh) * 60)),
    motivo: `${Math.round(litros)} L a ${Math.round(consumoLh)} L/h ${deDonde}`.trim(),
  };
}

/* -------------------------------------------------------------------------- */
/* La ruta escrita, de vuelta a puntos                                         */
/* -------------------------------------------------------------------------- */

export type TokenRutaPlan =
  | { tipo: "punto"; token: string; texto: string }
  | { tipo: "aerovia"; token: string; texto: string }
  | { tipo: "desconocido"; texto: string };

const RE_AEROVIA = /^(U?[A-Z]{1,2}\d{1,4}[A-Z]?)$/;

/**
 * La ruta de la casilla 15 como los tokens que entiende el planificador
 * (`lib/puntos.ts`), para calcular la distancia y sugerir la duración:
 * - `DCT` no es un punto;
 * - `3441S05838W` → `S34.6833/W58.6333`;
 * - `BAR045025` → `BAR/045/25`;
 * - `UM424`, `W67` → aerovía;
 * - un designador de 2 a 5 letras → punto a resolver;
 * - lo demás (`SECTOR`, `ESCUELA`) queda como desconocido, y la pantalla lo nombra.
 */
export function tokensDeRuta(ruta: string): TokenRutaPlan[] {
  const out: TokenRutaPlan[] = [];
  for (const texto of (ruta ?? "").toUpperCase().split(/\s+/).filter(Boolean)) {
    if (texto === "DCT") continue;
    const coord = /^(\d{2})(\d{2})([NS])(\d{3})(\d{2})([EW])$/.exec(texto);
    if (coord) {
      const lat = (Number(coord[1]) + Number(coord[2]) / 60).toFixed(4);
      const lon = (Number(coord[4]) + Number(coord[5]) / 60).toFixed(4);
      out.push({ tipo: "punto", token: `${coord[3]}${lat}/${coord[6]}${lon}`, texto });
      continue;
    }
    const radial = /^([A-Z]{2,4})(\d{3})(\d{3})$/.exec(texto);
    if (radial) {
      out.push({ tipo: "punto", token: `${radial[1]}/${radial[2]}/${Number(radial[3])}`, texto });
      continue;
    }
    if (RE_AEROVIA.test(texto) && /\d/.test(texto)) {
      out.push({ tipo: "aerovia", token: texto, texto });
      continue;
    }
    if (/^[A-Z]{2,5}$/.test(texto)) {
      out.push({ tipo: "punto", token: texto, texto });
      continue;
    }
    out.push({ tipo: "desconocido", texto });
  }
  return out;
}

/** La hora local argentina de una EOBT en UTC (para mostrar un plan viejo o una demora). */
export function localDesdeUtc(dofUtc: string, eobtUtc: string): { fecha: string; hora: string } | null {
  const f = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dofUtc ?? "");
  const h = /^(\d{2})(\d{2})$/.exec(eobtUtc ?? "");
  if (!f || !h) return null;
  const ms = Date.UTC(+f[1], +f[2] - 1, +f[3], +h[1], +h[2]) + DESFASE_ARGENTINA_HORAS * 3_600_000;
  const d = new Date(ms);
  const dos = (n: number) => String(n).padStart(2, "0");
  return { fecha: `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}`, hora: `${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}` };
}

/** La coordenada de un aeródromo para DEP/ o DEST/ cuando no tiene OACI (re-exportada para la UI). */
export { coordenadaOaci };

/* -------------------------------------------------------------------------- */
/* La ruta como nodos                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Un nodo de la ruta entre la salida y el destino, como lo muestra el editor: los DCT no
 * son nodos, son las flechas entre ellos.
 *
 * - `punto`: un designador, una coordenada o un radial; se busca en el directorio.
 * - `aerovia`: va sobre la flecha, entre su punto de entrada y el de salida.
 * - `desconocido`: lo que no tiene forma de punto ("SECTOR ESCUELA"). Va igual en el plan
 *   —la oficina lo lee—, pero no suma a la distancia.
 */
export interface NodoRuta {
  texto: string;
  tipo: "punto" | "aerovia" | "desconocido";
  /** Para buscarlo en `/api/puntos`, en la gramática del planificador. Sólo en `punto` y `aerovia`. */
  token?: string;
  /** Coordenada o radial: dos seguidos van sin DCT entre ellos (casilla 15 c). */
  geografico: boolean;
}

function nodoDeToken(t: TokenRutaPlan): NodoRuta {
  if (t.tipo === "desconocido") return { texto: t.texto, tipo: "desconocido", geografico: false };
  const geografico = t.tipo === "punto" && t.token.includes("/");
  return { texto: t.texto, tipo: t.tipo, token: t.token, geografico };
}

/**
 * La ruta escrita, como nodos. **Las palabras desconocidas seguidas, sin DCT en el medio,
 * son un solo nodo**: `DCT SECTOR ESCUELA DCT` es un lugar, el sector escuela, y no dos.
 * En cambio `DCT LAGUNA DCT ESCUELA DCT` son dos.
 */
export function nodosDeRuta(ruta: string): NodoRuta[] {
  const nodos: NodoRuta[] = [];
  let anteriorDesconocido = false;
  for (const palabra of (ruta ?? "").toUpperCase().split(/\s+/).filter(Boolean)) {
    if (palabra === "DCT") {
      anteriorDesconocido = false;
      continue;
    }
    const [t] = tokensDeRuta(palabra);
    if (!t) continue;
    if (t.tipo === "desconocido" && anteriorDesconocido) {
      nodos[nodos.length - 1].texto += ` ${palabra}`;
      continue;
    }
    nodos.push(nodoDeToken(t));
    anteriorDesconocido = t.tipo === "desconocido";
  }
  return nodos;
}

/**
 * Lo que el piloto escribe en el campo para sumar un nodo. Con un DCT adentro es una ruta
 * entera pegada (`DCT ATE DCT`). Con espacios y sin DCT hay dos lecturas —"ATE BAR" son
 * dos puntos, "PUNTA LARA" es un lugar— y **las decide el directorio**: quien llama busca
 * cada parte y dice si existen todas (`todasExisten`). Si no, es un solo nodo.
 */
export function nodosDeEntrada(entrada: string, todasExisten = false): NodoRuta[] {
  const t = (entrada ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!t) return [];
  if (/(^| )DCT( |$)/.test(t)) return nodosDeRuta(t);
  if (t.includes(" ")) {
    const partes = t.split(" ").flatMap((p) => tokensDeRuta(p));
    if (todasExisten && partes.every((p) => p.tipo !== "desconocido")) return partes.map(nodoDeToken);
    return [{ texto: t, tipo: "desconocido", geografico: false }];
  }
  return tokensDeRuta(t).map(nodoDeToken);
}

/**
 * Los nodos, de vuelta a la casilla 15, con los DCT donde van (ENR 1.10, casilla 15 c):
 * entre puntos sucesivos, salvo al lado de una aerovía y entre dos puntos geográficos; y
 * al principio y al final, desde la salida y hasta el destino. Sin nodos, `DCT`.
 */
export function rutaDesdeNodos(nodos: NodoRuta[]): string {
  if (nodos.length === 0) return "DCT";
  const partes: string[] = [];
  let anterior: NodoRuta | null = null;
  for (const n of nodos) {
    const sinDct = n.tipo === "aerovia" || anterior?.tipo === "aerovia" || (anterior?.geografico && n.geografico);
    if (!sinDct) partes.push("DCT");
    partes.push(n.texto);
    anterior = n;
  }
  if (anterior?.tipo !== "aerovia") partes.push("DCT");
  return partes.join(" ");
}

/**
 * La duración sugerida con lo que se pudo ubicar: los tramos entre puntos conocidos, y
 * **sin contar los que no se encontraron**, que se nombran en el motivo. `null` si no
 * queda distancia (un vuelo local sin puntos conocidos).
 */
export function sugerirEetConocidos(
  puntos: { lat: number; lon: number }[],
  sinUbicar: string[],
  tasKt: number,
  distancia: (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => number
): Sugerencia | null {
  let nm = 0;
  for (let i = 1; i < puntos.length; i++) nm += distancia(puntos[i - 1], puntos[i]);
  if (nm < 1) return null;
  const s = sugerirEet(nm, tasKt);
  if (!s) return null;
  return sinUbicar.length ? { ...s, motivo: `${s.motivo}, sin contar ${sinUbicar.join(" ni ")}` } : s;
}

/**
 * La hora como la escribe el piloto, en 24 h: `15:30`, `1530`, `15.30`, `9:05`, `905`.
 * `null` si no es una hora.
 *
 * Existe porque el `<input type="time">` del navegador, con el teléfono en formato de 12
 * horas, **no da ningún valor hasta que se elige AM o PM**: Federico la veía escrita y el
 * plan decía que faltaba (2026-10-19). Un piloto piensa la hora en 24 h.
 */
export function horaDeTexto(texto: string): string | null {
  const t = (texto ?? "").trim();
  const m = /^(\d{1,2})[:.hH ]?(\d{2})$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
