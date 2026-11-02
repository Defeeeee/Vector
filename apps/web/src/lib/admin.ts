/**
 * El panel de administración (`/dashboard/admin`): los tipos de lo que manda
 * `GET /admin/estadisticas` y todo lo que se escribe con fechas.
 *
 * Las fechas se escriben acá, en el server, y a mano: `toLocaleString` difiere entre
 * Node y Chrome (invariante 1), y el panel es para Argentina, así que la cuenta es
 * UTC−3 fija, igual que en el backend (`services/estadisticas.py`).
 */

export interface EstadisticasAdmin {
  generado: string;
  hoy: string;
  admins_excluidos: number;
  no_disponible: string[];
  totales: {
    cuentas: number;
    altas_hoy: number;
    altas_7d: number;
    altas_30d: number;
    activos_7d: number;
    activos_30d: number;
    con_vuelos: number;
    vuelos: number;
    vuelos_30d: number;
    horas: number;
    con_arroba: number;
    con_whatsapp: number;
    con_push: number;
    publicaciones: number;
    seguimientos: number;
    aplausos: number;
    comentarios: number;
    reportes: number;
    chats_whatsapp: number;
  };
  altas_por_dia: { fecha: string; altas: number; acumulado: number }[];
  ultimo_ingreso: { tramo: string; cuentas: number }[];
  activacion: { paso: string; cuentas: number; pct: number }[];
  uso_funciones: { funcion: string; cuentas: number; pct: number }[];
  licencias: { licencia: string; cuentas: number }[];
  vuelos_por_mes: { mes: string; vuelos: number; horas: number; pilotos: number }[];
  top_aerodromos: { codigo: string; vuelos: number }[];
  top_aeronaves: { tipo: string; vuelos: number }[];
  cohortes: { semana: string; altas: number; con_avion: number; con_vuelo: number }[];
  ultimas_altas: {
    alta: string | null;
    ultimo_ingreso: string | null;
    arroba: string | null;
    licencia: string | null;
    avion: boolean;
    cma: boolean;
    whatsapp: boolean;
    vuelos: number;
  }[];
  /** El seguimiento de los mails (migración 023 del backend). Ver `MailsAdmin`. */
  mails?: MailsAdmin;
}

/** Lo que se mide de un grupo de mails. Todo se cuenta por mail enviado, no por evento. */
export interface MedidasMail {
  enviados: number;
  abiertos: number;
  con_clic: number;
  tasa_apertura: number;
  tasa_clic: number;
  clic_sobre_abiertos: number;
  /** La mediana de minutos entre el envío y la primera apertura. `null` si nadie abrió. */
  minutos_hasta_abrir: number | null;
  /**
   * Mails cuya única señal fue en el primer minuto después del envío. Es dudoso: puede
   * ser el correo bajando las imágenes al recibirlo, o alguien que lo abrió al toque (y
   * en Gmail, la apertura de más tarde ya no se ve). Ver `services/mails.py` del backend.
   */
  al_instante?: number;
  /** Mails sin ninguna señal: ni abiertos, ni al instante. */
  sin_senales?: number;
}

export interface MailsAdmin {
  totales: MedidasMail;
  pilotos: { con_mails: number; abrieron_alguno: number; hicieron_clic: number; solo_al_instante?: number; nunca_abrieron: number };
  campanas: (MedidasMail & { tipo: string; clave: string | null; ultimo_envio: string | null; destinos: { destino: string; clics: number }[] })[];
  destinos: { destino: string; clics: number }[];
  por_dia: { dia: string; enviados: number; abiertos: number; clics: number }[];
  por_hora: { hora: number; aperturas: number }[];
  hasta_abrir: { tramo: string; mails: number }[];
  ultimos: {
    enviado: string | null;
    tipo: string;
    clave: string | null;
    arroba: string | null;
    abierto: string | null;
    /** Sólo tuvo una señal en el primer minuto: dudoso. */
    al_instante?: boolean;
    aperturas: number;
    clics: number;
    destinos: string[];
  }[];
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const HORA_ARGENTINA_MS = -3 * 60 * 60 * 1000;
const dos = (n: number) => String(n).padStart(2, "0");

/** "2026-09-23" → "23/09". */
export function diaCorto(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/** "2026-09" → "sep 26". */
export function mesCorto(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]} ${String(y).slice(2)}`;
}

/** Un instante en UTC como "23/09 21:05", en hora argentina. `null` si no hay. */
export function momento(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t + HORA_ARGENTINA_MS);
  return `${dos(d.getUTCDate())}/${dos(d.getUTCMonth() + 1)} ${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}`;
}

/** Cuánto hace, respecto de `ahora`: "recién", "hace 25 min", "hace 3 h", "hace 2 días". */
export function haceCuanto(iso: string | null, ahora: string): string {
  if (!iso) return "nunca";
  const min = Math.floor((Date.parse(ahora) - Date.parse(iso)) / 60000);
  if (Number.isNaN(min)) return "—";
  if (min < 2) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const dias = Math.floor(h / 24);
  return dias === 1 ? "hace 1 día" : `hace ${dias} días`;
}

/** Un porcentaje con coma y sin decimales de más: 66,7 %, 50 %. */
export function porcentaje(parte: number, total: number): string {
  if (!total) return "—";
  const p = Math.round((1000 * parte) / total) / 10;
  return `${String(p).replace(".", ",")} %`;
}

/** Un número con punto de miles y coma decimal, como en el libro: 1.252 · 150,1. */
export function numero(n: number, decimales = 0): string {
  const [ent, dec] = n.toFixed(decimales).split(".");
  const conMiles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return dec ? `${conMiles},${dec}` : conMiles;
}

const NOMBRES_MAIL: Record<string, string> = {
  "primer-vuelo": "Recordatorio del alta",
  "resumen-mensual": "Resumen del mes",
  briefing: "Briefing del vuelo",
  novedades: "Novedades",
  "plan-por-registrar": "Cargá tu vuelo (plan)",
};

/** "novedades" + "2026-10" → "Novedades · 2026-10". */
export function nombreDeMail(tipo: string, clave?: string | null): string {
  const nombre = NOMBRES_MAIL[tipo] ?? tipo;
  return clave ? `${nombre} · ${clave}` : nombre;
}

/** Minutos como se dicen: "25 min", "3 h", "2 días". `null` → "—". */
export function duracion(minutos: number | null | undefined): string {
  if (minutos === null || minutos === undefined) return "—";
  if (minutos < 60) return `${Math.round(minutos)} min`;
  const h = minutos / 60;
  if (h < 24) return `${Math.round(h)} h`;
  const dias = Math.round(h / 24);
  return dias === 1 ? "1 día" : `${dias} días`;
}

/** Un porcentaje que ya viene calculado del backend: 66.7 → "66,7 %". */
export function pct(valor: number): string {
  return `${String(valor).replace(".", ",")} %`;
}

/** Las series de mails con la etiqueta escrita: el día "02/10" y la hora "09 h". */
export function seriesDeMails(m: MailsAdmin) {
  return {
    porDia: m.por_dia.map((d) => ({ ...d, etiqueta: diaCorto(d.dia) })),
    porHora: m.por_hora.map((h) => ({ ...h, etiqueta: `${dos(h.hora)} h` })),
  };
}

/** Las series con su etiqueta ya escrita, para que el gráfico no haga cuentas con fechas. */
export function seriesDelPanel(e: EstadisticasAdmin) {
  return {
    altas: e.altas_por_dia.map((p) => ({ ...p, etiqueta: diaCorto(p.fecha) })),
    vuelosPorMes: e.vuelos_por_mes.map((p) => ({ ...p, etiqueta: mesCorto(p.mes) })),
    cohortes: e.cohortes.map((c) => ({ ...c, etiqueta: `semana del ${diaCorto(c.semana)}` })),
  };
}

/** Una pegatina con QR en el panel (`GET /admin/qr`, migración 033 del backend). */
export interface PegatinaAdmin {
  codigo: string;
  /** Dónde se pegó; `null` hasta que se asigna. */
  etiqueta: string | null;
  lote: string | null;
  creado_at: string | null;
  asignado_at: string | null;
  escaneos: number;
  escaneos_sin_sesion: number;
  ultimo_escaneo: string | null;
  /** Cuentas nuevas que salieron de esta pegatina (dentro de los 30 días del escaneo). */
  cuentas: number;
}
