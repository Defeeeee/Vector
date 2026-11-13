export interface Flight {
  id: string;
  user_id: string;
  logbook_id?: string;
  aircraft_id?: string;
  date: string;
  route: string;
  landings: number;
  duration: number;
  takeoff: string;
  landing: string;
  
  // New logging columns
  pic_day_loc?: number;
  pic_day_tra?: number;
  pic_night_loc?: number;
  pic_night_tra?: number;
  sic_day_loc?: number;
  sic_day_tra?: number;
  sic_night_loc?: number;
  sic_night_tra?: number;
  
  imc_pil?: number;
  imc_cop?: number;
  capota?: number;
  sim_instructor?: number;
  sim_pil_en_inst?: number;
  
  /**
   * Este vuelo es el último renglón de su hoja en el libro de papel: la hoja se cerró
   * antes de llenarse y lo que quedó en blanco se tacha. Lo usa el PDF del libro.
   */
  cierra_hoja?: boolean;
  /** El id del vuelo en el CAD de ANAC, si ya se pasó, y cuándo (migración 029). */
  cad_vuelo_id?: number | null;
  /** Por qué no se pasa al CAD (migración 031): "foliado" o "ignorado". */
  cad_omitido?: "foliado" | "ignorado" | null;
  /** Quién certifica el vuelo en el CAD (migración 032): id de la lista del CAD y nombre. */
  cad_autoridad_id?: number | null;
  cad_autoridad_nombre?: string | null;
  /** El estado en el CAD ("PENDIENTE DE DDJJ", …), de la última sincronización (migración 037). */
  cad_estado?: string | null;
  cad_cargado_at?: string | null;
  /** Quién lo certificó (migración 048, `firmas_certificantes`): sólo sirve para el PDF del libro. */
  certificante_id?: string | null;
  /** La anulación de su firma en este vuelo: null = lo que diga la persona; "si" o "no". */
  certificante_firma?: "si" | "no" | null;

  discount_type?: 'value' | 'percent';
  discount_amount?: number;
  purpose: string;
  /** Free-text note, as the paper ANAC logbook's observations column. */
  remarks?: string;
}

export interface Aircraft {
  id: string;
  user_id: string;
  registration: string;
  icao: string;
  type: string; // Marca y Modelo
  type_acft?: string; // MONT-T, MULT-T, etc.
  cost_per_hour?: number;
  /**
   * Performance de crucero, para el planificador. Los tres opcionales y **sin
   * default**: `undefined` es "no lo sé" y la pantalla lo dice, en vez de mostrar un
   * 110 inventado que se vería igual que uno cargado por el piloto.
   */
  cruise_tas_kt?: number;
  fuel_burn_lph?: number;
  /** Utilizable, no total: el no utilizable no vuela. */
  fuel_capacity_l?: number;
  /**
   * Caballos de fuerza; la total si es multimotor. Una columna del libro de vuelo (Res.
   * ANAC 470/2025, Anexo I, punto 5). Sin cargar, queda en blanco en el PDF.
   */
  potencia_hp?: number | null;
  /** Lo fijo del avión para el plan de vuelo (migración 024). Ver `lib/formulario-plan.ts`. */
  plan_vuelo?: import("@/lib/formulario-plan").PerfilAvionPlan | null;
  /**
   * `true` = dispositivo de entrenamiento, no aeronave.
   *
   * El simulador se anota en el libro como cualquier vuelo —fecha, horarios, el
   * equipo— y las horas van a la columna de instrucción terrestre. Esta marca es lo
   * que hace que **no** sumen a la experiencia total: las 200 h de 61.620 son horas de
   * vuelo, y una sesión de simulador no lo es.
   */
  is_simulator?: boolean;
  /** Si es un simulador: cuál es en el CAD de ANAC, su clase y su modelo (migración 036). */
  cad_simulador?: import("@/lib/cad").SimuladorCad | null;
}

export interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  license_type?: string;
  tracking_mode?: 'packs' | 'balance';
  api_key?: string;
  whatsapp_phone?: string;
  /** Para el encabezado de la hoja del libro de vuelo en PDF. */
  licencia_numero?: string | null;
  /** El legajo que asigna Licencias al Personal de ANAC. Mismo uso. */
  legajo?: string | null;
  /** Cuándo rindió la PPA (migración 022). Antes, sus vuelos son de alumno y no cuentan para la PCA ni el libro. */
  fecha_ppa?: string | null;
  /**
   * Si puede ver las cartas Jeppesen del servidor. Se pone a mano por SQL —no
   * hay todavía flujo de pago— y a propósito no se puede tocar desde el propio
   * formulario de perfil: el PATCH del piloto no declara este campo.
   */
  jeppesen_access?: boolean;
  /** La última vez que Vector leyó el CAD de ANAC (migración 038 del backend). */
  cad_leido_at?: string | null;
}

export interface FlightPack {
  id: string;
  user_id: string;
  name: string;
  total_hours: number;
  remaining_hours: number;
  created_at: string;
  start_date: string;
  is_active: boolean;
  aircraft_ids: string[];
}

export interface Transaction {
  id: string;
  user_id: string;
  flight_id?: string;
  amount: number;
  type: 'deposit' | 'charge';
  description?: string;
  created_at: string;
}



export type AuditRuleType = "overlap" | "unregistered_aircraft" | "duplicate" | "inconsistent_total";
export type AuditSeverity = "critical" | "warning";

export interface AuditFinding {
  id: string;
  user_id: string;
  flight_id?: string | null;
  rule_type: AuditRuleType;
  severity: AuditSeverity;
  message: string;
  suppressed: boolean;
  suppressed_reason?: string | null;
  created_at: string;
  recalculated_at: string;
}

export interface AuditSummary {
  critical: number;
  warning: number;
  suppressed: number;
  /** Unsuppressed findings — what the nav badge counts. */
  open_total: number;
  by_rule: Partial<Record<AuditRuleType, number>>;
  last_recalculated_at?: string | null;
}

/**
 * `repaso_vuelo` es el de RAAC 61.135: 24 meses, con instructor, firmado en el
 * libro. Es una de las cuatro condiciones de 61.060(a)(1) y la única que no se
 * puede derivar de los vuelos, porque la norma pide una firma.
 */
export type DocumentKind =
  | "cma" | "licencia" | "habilitacion" | "seguro" | "aeronavegabilidad"
  | "repaso_vuelo"
  | "otro";

/**
 * Qué pasa cuando un documento vence.
 *
 * El semáforo de RAAC 61.060(a)(1) tiene cuatro condiciones fijas, pero un piloto
 * de escuela vive con exigencias que la norma no enumera —cuota del aeroclub,
 * autorización del instructor, un curso interno—. Esto deja que cualquier
 * documento diga si condiciona el vuelo, sin que Vector conozca cada caso.
 *
 * De menos a más restrictivo: `pasajeros` deja volar solo; `solo` obliga a volar
 * con instructor —la misma semántica que el repaso de 61.135, y ese vuelo es el
 * que lo renueva—; `vuelo` no deja volar.
 */
export type DocumentBlocking = "nada" | "pasajeros" | "solo" | "vuelo";

/**
 * Quién decide la fecha de vencimiento de un documento.
 *
 * Vive acá y no en `src/lib/expiry-rules.ts` para que ese módulo pueda importar
 * `PilotDocument` sin que los dos se importen entre sí.
 */
export type ExpiryRule = "fijo" | "ultimo_vuelo" | "vuelo_ancla";

/** En qué unidad se cuenta `expiry_offset_days`. Los meses son meses calendario. */
export type OffsetUnit = "dias" | "meses";

export interface PilotDocument {
  id: string;
  user_id: string;
  kind: DocumentKind;
  /** Default "nada": un documento no bloquea salvo que el piloto lo pida. */
  blocking: DocumentBlocking;
  name: string;
  /** "YYYY-MM-DD", o `null` si el documento no vence (una licencia de por vida). */
  expiry_date: string | null;
  /**
   * Quién escribe `expiry_date`.
   *
   * `"fijo"` (el default, y lo que son casi todas las filas): el piloto, a mano.
   * `"ultimo_vuelo"`: el backend, sumándole `expiry_offset_days` a la fecha del
   * vuelo más reciente y recalculándola cada vez que los vuelos cambian. Ver
   * `src/lib/expiry-rules.ts` y `migrations/011_documents_expiry_rule.sql`.
   *
   * Opcional porque un backend sin la migración 011 no la manda; ausente se lee
   * como `"fijo"`.
   */
  expiry_rule?: ExpiryRule;
  /** Cuánto después del ancla. La unidad la dice `expiry_offset_unit`. */
  expiry_offset_days?: number | null;
  /** Ausente se lee como `"dias"`, que es el default de la columna. */
  expiry_offset_unit?: OffsetUnit;
  /**
   * Vuelo desde el que se cuenta, con `expiry_rule: "vuelo_ancla"`.
   *
   * Referencia blanda a propósito: no hay foreign key, para que borrar un vuelo
   * nunca falle. Si el vuelo desaparece, el backend **congela** el documento en
   * `"fijo"` con la última fecha calculada. Ver `migrations/013`.
   */
  expiry_anchor_flight_id?: string | null;
  issued_date?: string | null;
  notes?: string | null;
  alert_days: number[];
  last_alert_threshold?: number | null;
  last_alert_at?: string | null;
  created_at: string;
  updated_at: string;
}

/** An aerodrome resolved by /api/airports/search. Mirrors `Airport` in
 *  src/lib/airports.ts, declared here so client components can type the
 *  response without importing the server-only (fs-backed) module. */
export interface AirportRef {
  icao: string;
  name: string;
  city: string;
  country: string;
  size: "L" | "M" | "S" | "H";
  iata: string;
  elevation?: number;
  lat?: number;
  lon?: number;
  /** Short display label, e.g. SADM -> "Morón". */
  label: string;
  /** ANAC's three-letter designator (GEZ, MOR). Argentine aerodromes only. */
  local?: string;
  /**
   * Variación magnética en **grados oeste positivos**, precalculada con WMM.
   *
   * Oeste positivo y no declinación este porque es la que se **suma** al rumbo
   * verdadero para obtener el magnético, que es lo único que el piloto hace con ella.
   * Ver `aMagnetico` en `lib/navegacion.ts`.
   *
   * Sólo la tienen los aeródromos de MADHEL. `undefined` es "no la sabemos": el
   * planificador lo dice en pantalla en vez de asumir cero, que en Argentina es un
   * valor perfectamente válido —la línea agónica cruza la Patagonia— y por lo tanto
   * indistinguible de un dato faltante.
   */
  variacionW?: number;
  /** Pistas con rumbo verdadero. Vacío si el aeródromo no tiene ninguna publicada. */
  pistas?: { le: string; he: string; rumboT: number; largoFt?: number; superficie?: string; fuente?: "medida" | "estimada" }[];
  /** What MADHEL publishes about it. Absent for non-Argentine aerodromes. */
  madhel?: {
    province: string;
    kind: "AD" | "HEL";
    condition: string;
    controlled: boolean | null;
    status: string;
    elevationM?: number;
  };
}

/**
 * A logbook. A pilot can keep more than one — e.g. one per employer, or one for
 * the paper book they migrated from.
 *
 * The `opening_*` columns are hours carried in without entering the flights one
 * by one. They are NOT a single total on purpose: a lone number would leave the
 * ANAC matrix showing the hours with 0 as PIC and the PCA tracker reporting that
 * no requirement is met. Every aggregation has to add these in.
 */
export interface Logbook {
  id: string;
  user_id: string;
  name: string;
  description?: string | null;
  is_default: boolean;
  created_at: string;
  flight_count?: number;

  opening_landings: number;
  opening_pic_day_loc: number;
  opening_pic_day_tra: number;
  opening_pic_night_loc: number;
  opening_pic_night_tra: number;
  opening_sic_day_loc: number;
  opening_sic_day_tra: number;
  opening_sic_night_loc: number;
  opening_sic_night_tra: number;
  opening_imc_pil: number;
  opening_imc_cop: number;
  opening_capota: number;
  /** Renglones por hoja del libro de papel (15 en la hoja del Adjunto A). */
  renglones_por_hoja?: number;
  /** Las horas de antes de un alumno, con el desglose de la PPA (migración 028). */
  apertura_ppa?: AperturaPPA | null;
}

/**
 * Las horas de antes de un alumno piloto, contra RAAC 61.520(a). Espejo de `AperturaPPA`
 * de `src/models/logbook.py`. Ver `lib/apertura-alumno.ts`.
 */
export interface AperturaPPA {
  doble_mando: number;
  /** Vuelo solo, de día. */
  solo: number;
  /** De las de vuelo solo, las de travesía. */
  solo_travesia: number;
  /** De las de doble mando, las de noche. */
  instruccion_nocturna: number;
  aterrizajes_nocturnos: number;
  /** Ya hizo la travesía de 150 NM con dos aterrizajes. */
  travesia_larga: boolean;
}

/**
 * La red social. Espejo de `src/models/social.py` del backend.
 *
 * Ningún tipo de acá lleva `user_id`: hacia afuera un piloto se identifica por su @.
 */
export type Visibilidad = "publico" | "privado";

/**
 * Qué es el que mira respecto de un perfil. `anonimo` = sin sesión (el link de WhatsApp).
 * `bloqueado` = lo bloqueaste vos; el bloqueado nunca lo ve (para él, el perfil no existe).
 */
export type RelacionSocial = "anonimo" | "propio" | "siguiendo" | "pendiente" | "ninguna" | "bloqueado";

export interface PerfilPublico {
  handle: string;
  nombre_visible: string;
  licencia?: string | null;
  bio?: string | null;
  visibilidad: Visibilidad;
  /** La foto de perfil, en el bucket público `avatares`. */
  avatar_url?: string | null;
  created_at?: string | null;
}

/** Las únicas horas que salen de la cuenta de un piloto hacia otros. */
export interface HorasPublicas {
  total: number;
  pic: number;
  travesia: number;
  noche: number;
  instrumentos: number;
}

export interface PilotoResumen {
  handle: string;
  nombre_visible: string;
  licencia?: string | null;
  visibilidad: Visibilidad;
  relacion: RelacionSocial;
  avatar_url?: string | null;
}

export interface PilotoPublico extends PilotoResumen {
  bio?: string | null;
  seguidores: number;
  siguiendo: number;
  /** `null` si el que mira no puede verlas, que no es lo mismo que cero horas. */
  horas: HorasPublicas | null;
}

export interface ResumenSocial {
  handle: string | null;
  avatar_url?: string | null;
  solicitudes_pendientes: number;
  actividad_nueva: number;
}

export interface AutorPublicacion {
  handle: string;
  nombre_visible: string;
  licencia?: string | null;
  avatar_url?: string | null;
}

export interface FotoPublicacion {
  /** Firmada y con vencimiento: no se guarda, se pide de nuevo. */
  url: string;
  ancho: number;
  alto: number;
}

/**
 * El chip del vuelo de una publicación: **una copia** de los campos que el autor prendió
 * al publicar. Nunca trae la matrícula.
 */
/**
 * La forma del recorrido ADS-B de un vuelo, como la publica el backend (`recorrido_publicable`,
 * 2.37.0): lat, lon y altura de cada punto, **sin horas ni velocidad**. `cortes` son los
 * índices a los que se llega después de más de un minuto sin señal.
 */
export interface RecorridoPublicado {
  p: [number, number, number][];
  cortes?: number[];
  fuente?: string;
}

export interface VueloChip {
  ruta?: string | null;
  duracion?: number | null;
  /** El tipo ("Cessna 152"), nunca la matrícula. */
  aeronave?: string | null;
  /** `YYYY-MM-DD`, como lo manda el backend. */
  fecha?: string | null;
  /** Lo arma el server de Vector: la fecha para leer ("12 sep 2026"). */
  fecha_texto?: string | null;
  /** Lo arma el server de Vector con el catálogo de aeródromos, para el mapa. */
  puntos_mapa?: { codigo: string; label: string; lat: number; lon: number }[];
  /** Si el piloto lo prendió: por dónde voló, de ADS-B. */
  recorrido?: RecorridoPublicado | null;
}

export interface Publicacion {
  id: string;
  autor: AutorPublicacion;
  texto?: string | null;
  vuelo?: VueloChip | null;
  fotos: FotoPublicacion[];
  aplausos: number;
  aplaudida: boolean;
  comentarios: number;
  es_mia: boolean;
  /** Sólo para el autor. */
  vuelo_id?: string | null;
  created_at: string;
  /** Lo arma el server de Vector ("hace 5 min"): ver `fechaRelativa`. */
  fecha_texto?: string;
  /** "22 sep 2026, 14:05", para el `title`. */
  fecha_titulo?: string;
}

export interface PaginaPublicaciones {
  publicaciones: Publicacion[];
  /** El cursor de la página siguiente, o `null` si no hay más. */
  siguiente?: string | null;
}

export interface Comentario {
  id: string;
  autor: AutorPublicacion;
  texto: string;
  created_at: string;
  /** Su autor, o el de la publicación. */
  puede_borrar: boolean;
  fecha_texto?: string;
  fecha_titulo?: string;
}

export interface EstadoAplauso {
  aplausos: number;
  aplaudida: boolean;
}

export type TipoEventoActividad = "seguidor" | "solicitud" | "aplauso" | "comentario";

export interface EventoActividad {
  tipo: TipoEventoActividad;
  piloto: AutorPublicacion;
  created_at: string;
  /** Posterior a la última vez que el piloto abrió la Actividad. */
  nuevo: boolean;
  /** Para un comentario, su texto; para un aplauso, el comienzo de la publicación. */
  texto?: string | null;
  fecha_texto?: string;
  fecha_titulo?: string;
}

export interface Actividad {
  eventos: EventoActividad[];
}

/**
 * Un vuelo propio que se puede adjuntar a una publicación, con cada dato ya armado
 * como se publicaría. El composer sólo elige cuáles mostrar.
 */
export interface VueloParaCompartir {
  id: string;
  /** Para el selector: "12 sep · SADF → SAAR · 1.2 h". */
  etiqueta: string;
  ruta: string | null;
  duracion: number | null;
  aeronave: string | null;
  /** Ya escrita: "12 sep 2026". */
  fecha: string | null;
  /** Para que la vista previa muestre el mismo mapa que va a salir. */
  puntos_mapa?: VueloChip["puntos_mapa"];
  /** Desde el 23/10 y en avión: puede tener recorrido ADS-B, y el composer lo pregunta. */
  puede_tener_recorrido?: boolean;
}
