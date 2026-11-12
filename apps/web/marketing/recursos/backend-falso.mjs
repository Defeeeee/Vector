// Backend falso para sacar capturas de la app sin tocar producción.
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
const DIR = new URL(".", import.meta.url).pathname;
const hoy = new Date("2026-10-06T12:00:00Z");
const dia = (n) => new Date(hoy.getTime() - n * 86400000).toISOString().slice(0, 10);
// `ALTA=4` arranca con el alta en el paso de las horas, sin vuelos ni libro; `LICENCIA` cambia
// la licencia (por ejemplo, "ALUMNO" para el alumno piloto).
const SIN_VUELOS = process.env.ALTA === "4";
// La cuenta de prueba para entrar por /login (sólo existe acá; el backend real no la conoce).
export const CUENTA_DE_PRUEBA = { email: "lucia@vector.test", clave: "piloto-de-prueba" };
const perfil = { id: "u1", first_name: "Lucía", last_name: "Ferrari", license_type: process.env.LICENCIA || "PPA", tracking_mode: "packs", whatsapp_phone: "5491100000000", licencia_numero: "12345678", fecha_ppa: null };
const aviones = [
  { id: "a1", user_id: "u1", registration: "LV-ABC", icao: "C152", type: "Cessna 152", type_acft: "MONT-T", is_simulator: false,
    cruise_tas_kt: 95, fuel_burn_lph: 24, fuel_capacity_l: 92,
    plan_vuelo: { estela: "L", equipo: "SDGZ", vigilancia: "C", nav: "ABAS", opr: "AEROCLUB ARGENTINO", per: "A", colorMarcas: "BLANCO Y ROJO", elt: true } },
  { id: "a2", user_id: "u1", registration: "LV-XYZ", icao: "PA11", type: "Piper PA-11", type_acft: "MONT-T", is_simulator: false },
  { id: "a3", user_id: "u1", registration: "LV-ASG", icao: "C172", type: "Simulador C172", type_acft: "C172", is_simulator: true, cad_simulador: null },
];
const rutas = ["SADF SADF", "SADF SADM", "SADF SADL", "SADF SAAK", "SADF SAZS", "SADF SADP", "SADF SADF"];
let n = 0;
const vuelos = [];
// Salidas variadas entre las 11:00 y las 19:45 UTC, de a cuartos de hora.
const salida = (d) => 11 * 60 + ((d * 37) % 36) * 15;
const hhmm = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(Math.round(min % 60)).padStart(2, "0")}`;
for (let d = 420; d >= 2; d -= 5 + (n % 3)) {
  const ruta = rutas[d % rutas.length];
  const travesia = !ruta.startsWith("SADF SADF");
  const noche = d % 23 === 0;
  const dur = Math.round((1.0 + (d % 7) * 0.15 + (travesia ? 0.7 : 0)) * 10) / 10;
  const f = { id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, user_id: "u1", aircraft_id: d % 4 === 0 ? "a2" : "a1", date: dia(d), route: ruta, landings: travesia ? 2 : 3, duration: dur,
    takeoff: `${dia(d)}T${hhmm(salida(d))}:00Z`, landing: `${dia(d)}T${hhmm(salida(d) + dur * 60)}:00Z`, purpose: "VP" };
  f[noche ? (travesia ? "pic_night_tra" : "pic_night_loc") : (travesia ? "pic_day_tra" : "pic_day_loc")] = dur;
  if (d % 9 === 0) f.capota = 0.5;
  vuelos.push(f);
}
const dashboard = {
  profile: perfil, aircraft: aviones, flights: SIN_VUELOS ? [] : vuelos, session: { active: false },
  packs: [{ id: "p1", user_id: "u1", name: "Pack 10 h · Aeroclub", total_hours: 10, remaining_hours: 6.5, created_at: dia(30), start_date: dia(30), is_active: true, aircraft_ids: ["a1"] }],
  documents: [
    { id: "d1", user_id: "u1", kind: "cma", blocking: "bloquea", name: "CMA Clase 2", expiry_date: "2027-05-10" },
    { id: "d2", user_id: "u1", kind: "licencia", blocking: "nada", name: "Licencia PPA", expiry_date: null },
    { id: "d3", user_id: "u1", kind: "repaso_vuelo", blocking: "bloquea", name: "Repaso de vuelo", expiry_date: "2027-08-20" },
  ],
  transactions: [], balance: 0, unavailable: [],
  audit_summary: { critical: 0, warning: 0, suppressed: 0, open_total: 0 },
};
// Los libros, en memoria: el alta crea "Mi libro" con las horas de antes.
const libros = [];
const rutasFijas = {
  "/api/profiles": [perfil],
  "/api/dashboard": dashboard,
  "/api/logbooks": libros,
  "/api/planned-flights": [],
  "/api/aircraft": aviones,
  "/api/onboarding/estado": () => ({ licencia: true, cma: true, aeronave: true, libro: libros.length > 0, vuelos: !SIN_VUELOS, whatsapp: true, arroba: true }),
  "/api/audit/summary": { critical: 0, warning: 0, suppressed: 0, open_total: 0 },
  "/api/social/resumen": { handle: "lucia.vuela", solicitudes: 0, actividad_nueva: 0, avatar_url: null },
  // Buscar pilotos espera listas (sin esto la pantalla rompía contra el falso, no contra el real).
  "/api/social/siguiendo": [],
  "/api/social/seguidores": [],
};
// Una sesión de simulador y un vuelo desde un LAD, para "Pasar al CAD" (2.33.0).
vuelos.push(
  { id: "00000000-0000-4000-8000-0000000005a1", user_id: "u1", aircraft_id: "a3", date: dia(3), route: "LOCAL", landings: 0, duration: 0,
    takeoff: `${dia(3)}T14:00:00Z`, landing: `${dia(3)}T15:00:00Z`, purpose: "INST", sim_pil_en_inst: 1.0 },
  { id: "00000000-0000-4000-8000-0000000005a2", user_id: "u1", aircraft_id: "a1", date: dia(4), route: "LAD2013 SADF", landings: 1, duration: 1.4,
    takeoff: `${dia(4)}T13:00:00Z`, landing: `${dia(4)}T14:24:00Z`, purpose: "VP", pic_day_tra: 1.4 },
);
// El CAD falso (`/api/cad/*`): la cuenta, las listas y los vuelos que ya tiene.
const cad = { usuario: process.env.CAD_CONECTADO ? "lferrari" : null, estado: "ok", vuelos: [] };
const matriculaDe = (id) => aviones.find((a) => a.id === id)?.registration ?? null;
for (const f of vuelos) if (f.date < dia(60)) cad.vuelos.push({ vueloTripulanteID: 900000 + cad.vuelos.length, fechaSalida: f.takeoff.slice(0, 19), matricula: matriculaDe(f.aircraft_id), origenDesc: f.route.split(" ")[0], estadoDesc: "PENDIENTE DE DDJJ" });
cad.vuelos.push(
  { vueloTripulanteID: 990001, fechaSalida: `${dia(20)}T15:00:00`, matricula: "LV-ABC", tipoVueloID: 2, cargoID: 1, horasDia: 1.2, horasNoche: 0, fechaHoraSalida: `${dia(20)}T15:00:00`, fechaHoraLlegada: `${dia(20)}T16:12:00`, finalidadID: 63, origenID: "FDO", destinoID: "MOR", aterrizajes: 2 },
  { vueloTripulanteID: 990002, fechaSalida: `${dia(21)}T12:00:00`, matricula: "LV-QQQ", tipoVueloID: 1, cargoID: 1, horasDia: 0.8, horasNoche: 0, fechaHoraSalida: `${dia(21)}T12:00:00`, fechaHoraLlegada: `${dia(21)}T12:48:00`, finalidadID: 63, origenID: "FDO", destinoID: "FDO", aterrizajes: 4 },
);
const listasCad = {
  finalidades: [["63", "ENTRENAMIENTO"], ["67", "INSTRUCTOR"], ["68", "INSTRUCCIÓN"], ["70", "VUELO PRIVADO"]].map(([key, value]) => ({ key, value })),
  autoridades: [["5", "INSTRUCTOR DE VUELO"], ["6", "JEFE DE INSTRUCTORES"], ["2", "JEFE DE AERODROMO"], ["19", "INSTRUCTOR DE SIMULADOR"], ["1", "OTROS"]].map(([key, value]) => ({ key, value })),
  lugares: [["FDO", "SADF -  FDO -  FDO (SAN FERNANDO)"], ["MOR", "SADM -  MOR -  MOR (MORON)"], ["LPG", "SADL -  LPG -  LPG (LA PLATA)"], ["PAL", "SADP -  PAL -  PAL (EL PALOMAR)"], ["SAAK", " SAAK (MARTIN GARCIA)"], ["SAZS", " SAZS (BARILOCHE)"], ["2013", " 2013 (VILLA JOSEFINA)"]].map(([key, value]) => ({ key, value })),
  simuladores: [["34", "SANTIAGO I C-172 -- ASG TRAINING CENTER"], ["39", "C172  -- CIAC CICA"], ["53", "SIMAR II -- CIAC FLIGHT CENTER"], ["217", "FRASCA -- FLIGHT CENTER"]].map(([key, value]) => ({ key, value })),
};
function rutaCad(req, res, ruta, json) {
  const responder = (codigo, cuerpo) => {
    res.writeHead(codigo, { "Content-Type": "application/json" });
    res.end(JSON.stringify(cuerpo));
  };
  if (ruta === "/api/cad/conexion" && req.method === "GET")
    // Como en producción: "desde Vector" apagado salvo CAD_DESDE_VECTOR=1 (2026-10-29).
    return responder(200, { disponible: process.env.CAD_DESDE_VECTOR === "1", conectado: !!cad.usuario, usuario: cad.usuario, estado: cad.usuario ? cad.estado : null, error: null });
  if (ruta === "/api/cad/conexion" && req.method === "POST") {
    if (json.clave !== "buena") return responder(400, { detail: "Usuario o contraseña inválidos." });
    cad.usuario = json.usuario;
    cad.estado = "ok";
    return responder(200, { conectado: true, usuario: json.usuario, estado: "ok" });
  }
  if (ruta === "/api/cad/conexion" && req.method === "DELETE") {
    cad.usuario = null;
    return responder(200, { conectado: false });
  }
  // La lista que leyó la extensión o el marcador (2.36.0): acá sólo se cuenta. No pide la cuenta conectada, como el backend.
  if (ruta === "/api/cad/conciliar" && req.method === "POST") {
    console.log("CAD falso · conciliar:", (json.vuelos ?? []).length, "vuelos");
    perfil.cad_leido_at = process.env.CAD_LEIDO_AT || new Date().toISOString();
    return responder(200, { sincronizado: true, desmarcados: 0, marcados: 0, estados: 0, pendientes_ddjj: (json.vuelos ?? []).filter((v) => /PENDIENTE/i.test(v.estadoDesc ?? "")).length });
  }
  if (!cad.usuario) return responder(409, { detail: "No conectaste tu cuenta de ANAC." });
  if (ruta === "/api/cad/listas") return responder(200, listasCad);
  if (ruta === "/api/cad/vuelos" && req.method === "GET") return responder(200, { datos: cad.vuelos });
  if (ruta === "/api/cad/modelos") return responder(200, { datos: [{ key: "40", value: "A320" }] });
  if (/^\/api\/cad\/vuelos\/\d+$/.test(ruta)) return responder(200, cad.vuelos.find((v) => String(v.vueloTripulanteID) === ruta.split("/").pop()) ?? {});
  if (ruta === "/api/cad/vuelos" && req.method === "POST") {
    console.log("CAD falso · Crear:", JSON.stringify(json));
    cad.vuelos.push({ vueloTripulanteID: 995000 + cad.vuelos.length, fechaSalida: String(json.fechaHoraSalida).slice(0, 19), matricula: json.matriculaAvion || null, estadoDesc: "PENDIENTE DE DDJJ" });
    return responder(200, { ok: true, mensaje: "Cargado en el CAD" });
  }
  return responder(404, { detail: "no" });
}
export const DATOS = { perfil, aviones, vuelos };
// Planes de vuelo (migración 024), en memoria: se pierden al reiniciar.
const planes = new Map();
// El seguimiento en vivo (migraciones 041 y 042), en memoria: un avión que sale de San Fernando hacia Sauce Viejo.
// `token` fijo para abrir /seguir/<token> a mano; con el token de prueba y sin vuelo creado desde el Mapa, el avión
// ya trae unos minutos de recorrido (sube a 2.400 ft y cruza) y cada GET avanza un punto sobre la ruta.
// El avión es un Cessna 152 y la matrícula está apagada, como en el real (se prende con POST .../matricula).
// El clima del destino NO sale de acá: la ruta pública de la web le pide el METAR a aviationweather.gov.
const TOKEN_SEGUIMIENTO = "tokenDePruebaDeSeguimiento000001";
const SADF = [-34.4532, -58.5896];
const SAAV = [-31.7117, -60.8117];
const enLinea = (f) => [SADF[0] + (SAAV[0] - SADF[0]) * f, SADF[1] + (SAAV[1] - SADF[1]) * f];
const PASOS_DEMO = 30;
const puntosDemo = [[SADF[0], SADF[1], "SADF", "San Fernando"], [...enLinea(0.5), "VM", "Punto medio"], [SAAV[0], SAAV[1], "SAAV", "Sauce Viejo"]];
let seguimiento = null;
function nuevoSeguimiento(json) {
  const ahora = new Date();
  seguimiento = {
    id: crypto.randomUUID(), token: TOKEN_SEGUIMIENTO, nombre: "Lucía", ruta: json.ruta ?? "SADF SAAV",
    puntos: (json.puntos ?? []).map((p) => [p.lat, p.lon, p.codigo ?? "", p.nombre ?? ""]),
    avion: { tipo: json.avion?.tipo || "Cessna 152", icao: json.avion?.icao || "C152", matricula: json.mostrar_matricula ? json.avion?.matricula || null : null },
    mostrarMatricula: Boolean(json.mostrar_matricula && json.avion?.matricula),
    creado: ahora, vence: new Date(+ahora + 12 * 3600e3), terminado: null, recorrido: [], ultima: null, paso: 0,
    vistas: new Map(), vistosTotal: 0, ultimaVista: null, // quién mira (migración 044): { id -> ms }, sin IP
  };
  return seguimiento;
}
function vistaSeguimiento(sg) {
  const ahora = new Date();
  const estado = sg.terminado ? "terminado" : ahora >= sg.vence ? "vencido" : "en_vuelo";
  const puntos = sg.puntos.length ? sg.puntos : puntosDemo;
  const avion = { tipo: sg.avion.tipo, icao: sg.avion.icao, ...(sg.mostrarMatricula && sg.avion.matricula ? { matricula: sg.avion.matricula } : {}) };
  // Migración 045: el demo de siempre mezcla GPS del teléfono y un tramo de ADS-B (cuando el teléfono "calla").
  const recorrido = sg.recorrido.map((p, i) => [p[0], p[1], p[2], p[3], p[4] ?? (i >= 8 && i < 12 ? "adsb" : "gps")]);
  const ultima = sg.ultima ? { ...sg.ultima, fuente: sg.ultima.fuente ?? (sg.recorrido.length > 8 && sg.recorrido.length <= 12 ? "adsb" : "gps") } : null;
  return { nombre: sg.nombre, ruta: sg.ruta, puntos, avion, inicio: sg.creado.toISOString(), estado, fase: estado === "en_vuelo" ? (ultima ? "volando" : "esperando") : "terminado", salida_prevista: null, con_adsb: true, ultima, recorrido, ahora: ahora.toISOString() };
}
// Seguimientos desde un plan de vuelo (migración 045), con ADS-B simulado. Tokens fijos para abrir /seguir/<token>:
//   antes de salir, volando (avanza solo con cada GET) y aterrizado.
const TOKENS_PLAN = { antes: "tokenPlanAntesDeSalir00000000001", volando: "tokenPlanVolando00000000000000002", aterrizo: "tokenPlanAterrizo0000000000000003" };
const iso = (ms) => new Date(ms).toISOString();
function vistaPlan(tipo) {
  const ahora = Date.now();
  const base = { nombre: "Federico", ruta: "SADF VM SAAV", puntos: puntosDemo, avion: { tipo: "Cessna 152", icao: "C152" }, con_adsb: true, ahora: iso(ahora) };
  if (tipo === "antes") return { ...base, inicio: iso(ahora - 3600e3), estado: "en_vuelo", fase: "antes_de_salir", salida_prevista: iso(ahora + 40 * 60e3), ultima: null, recorrido: [] };
  const n = tipo === "aterrizo" ? PASOS_DEMO + 1 : Math.min(PASOS_DEMO, 4 + Math.floor((ahora - arranquePlan) / 15000));
  const t0 = ahora - n * 60e3;
  const recorrido = [];
  for (let i = 0; i <= n; i++) { const p = puntoDemo(Math.min(i, PASOS_DEMO), new Date(t0 + i * 60e3)); recorrido.push([p.la, p.lo, p.alt, p.epoch, "adsb"]); }
  const u = recorrido[recorrido.length - 1];
  const aterrizo = tipo === "aterrizo";
  const ultima = { lat: u[0], lon: u[1], alt_ft: aterrizo ? null : u[2], gs_kt: aterrizo ? 4 : 96, track: 330, hora: iso(u[3] * 1000), fuente: "adsb" };
  return { ...base, inicio: iso(ahora - 3 * 3600e3), estado: aterrizo ? "terminado" : "en_vuelo", fase: aterrizo ? "aterrizo" : "volando", salida_prevista: iso(t0 - 5 * 60e3), ultima, recorrido };
}
const arranquePlan = Date.now();
// El seguimiento que se crea desde el editor de un plan (POST /seguimientos/desde-plan), en memoria.
let seguimientoPlan = null;
// Un punto del demo: avanza por la línea, sube hasta 2.400 ft en los primeros pasos y cruza.
function puntoDemo(i, cuando) {
  const [la, lo] = enLinea(Math.min(i, PASOS_DEMO) / PASOS_DEMO);
  const [pla, plo] = enLinea(Math.max(0, i - 1) / PASOS_DEMO);
  const alt = Math.min(2400, 700 + i * 350) + (i % 2) * 20;
  const track = Math.round((Math.atan2((lo - plo) * Math.cos((la * Math.PI) / 180), la - pla) * 180) / Math.PI + 360) % 360 || 330;
  return { la: Math.round(la * 1e5) / 1e5, lo: Math.round(lo * 1e5) / 1e5, alt, track, epoch: Math.floor(+cuando / 1000), hora: cuando.toISOString() };
}
const rutasGuardadas = [{ id: "r1", nombre: "SADF → SAAK por BENAVIDEZ", ruta: "SADF BENAVIDEZ SAAK", aircraft_id: null, created_at: "2026-11-09T12:00:00Z", updated_at: "2026-11-09T12:00:00Z" }];
let firma = null;
const resumenPlan = (p) => {
  const f = p.formulario ?? {};
  return { ...p, salida: f.salida?.codigo ?? null, destino: f.destino?.codigo ?? null, matricula: f.matricula ?? null, dof: f.dofUtc || null, eobt: f.eobtUtc || null };
};
function planesDeVuelo(req, ruta, json) {
  const ahora = new Date().toISOString();
  if (ruta === "/api/planes-de-vuelo/firma") {
    if (req.method === "PUT") firma = json.png;
    if (req.method === "DELETE") firma = null;
    return firma ? { png: firma } : null;
  }
  if (ruta === "/api/planes-de-vuelo/recordatorios") {
    return [...planes.values()]
      .filter((p) => p.completo && (p.enviado_at || p.descargado_at) && !p.vuelo_id && !p.cancelado_at && !p.descartado_at && !p.recordatorio_at)
      .map((p) => ({ id: p.id, user_id: "u1", email: "lucia@example.com", first_name: perfil.first_name, formulario: p.formulario, demoras: p.demoras ?? [], vuelos: vuelos.slice(-5).map((v) => ({ date: v.date, route: v.route })) }));
  }
  if (ruta === "/api/planes-de-vuelo/recordatorios/enviados") {
    for (const id of json.ids ?? []) if (planes.has(id)) planes.get(id).recordatorio_at = ahora;
    return { marcados: (json.ids ?? []).length };
  }
  if (ruta === "/api/planes-de-vuelo") {
    if (req.method === "POST") {
      const p = resumenPlan({ id: crypto.randomUUID(), aircraft_id: json.aircraft_id ?? null, completo: !!json.completo, formulario: json.formulario, demoras: [], envios: [], enviado_at: null, descargado_at: null, created_at: ahora, updated_at: ahora });
      planes.set(p.id, p);
      return p;
    }
    return [...planes.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map(({ formulario, demoras, ...r }) => r);
  }
  const id = ruta.split("/").pop();
  const p = planes.get(id);
  if (!p) return undefined;
  if (req.method === "DELETE") { planes.delete(id); return {}; }
  if (req.method === "PATCH") {
    const n = resumenPlan({ ...p, ...("formulario" in json ? { formulario: json.formulario } : {}), ...("completo" in json ? { completo: json.completo } : {}), ...("demoras" in json ? { demoras: json.demoras } : {}), ...(json.descargado ? { descargado_at: ahora } : {}), ...(json.vuelo_id ? { vuelo_id: json.vuelo_id } : {}), ...(json.cancelado ? { cancelado_at: ahora } : {}), ...(json.descartado ? { descartado_at: ahora } : {}), ...(json.envio ? { envios: [...(p.envios ?? []), { ...json.envio, at: ahora }], ...(json.envio.modo === "aro" ? { enviado_at: ahora } : {}) } : {}), updated_at: ahora });
    planes.set(id, n);
    return n;
  }
  return p;
}
// Los recorridos ADS-B (2.30.0): con `ADSB_DEMO=<puntos.json>` (fuera del repo: es un vuelo
// real), un vuelo del 24/10 con ese recorrido y los vuelos detectados de ese día.
const ADSB_DEMO = process.env.ADSB_DEMO && existsSync(process.env.ADSB_DEMO) ? JSON.parse(readFileSync(process.env.ADSB_DEMO, "utf8")) : null;
const VUELO_ADSB = "00000000-0000-4000-8000-0000000a0b50";
if (ADSB_DEMO) {
  const [t0] = ADSB_DEMO[0], [t1] = ADSB_DEMO.at(-1);
  vuelos.push({ id: VUELO_ADSB, user_id: "u1", aircraft_id: "a1", date: "2026-10-24", route: "SADF SADF", landings: 1, duration: 0.8,
    takeoff: new Date(t0 * 1000).toISOString(), landing: new Date(t1 * 1000).toISOString(), purpose: "VP", pic_day_loc: 0.8 });
}
const resumenAdsb = () => {
  const P = ADSB_DEMO, iso = (t) => new Date(t * 1000).toISOString().replace(".000Z", "+00:00");
  return { despegue: iso(P[0][0]), aterrizaje: iso(P.at(-1)[0]), minutos: Math.round((P.at(-1)[0] - P[0][0]) / 60), aterrizajes: 1,
    altitud_max: Math.max(...P.map((p) => p[3])), velocidad_max: Math.max(...P.map((p) => p[4])), millas: 64.8, posiciones: P.length,
    inicio: [P[0][1], P[0][2]], fin: [P.at(-1)[1], P.at(-1)[2]] };
};
function adsb(ruta, url) {
  if (!ADSB_DEMO) return ruta.startsWith("/api/adsb/vuelos/") ? { recorrido: null } : { vuelos: [] };
  if (ruta.startsWith("/api/adsb/vuelos/")) {
    if (!ruta.endsWith(VUELO_ADSB)) return { recorrido: null };
    const t0 = ADSB_DEMO[0][0];
    return { recorrido: { t0, fuente: "adsb.fi", p: ADSB_DEMO.map(([t, la, lo, a, v]) => [t - t0, la, lo, a, v]) }, resumen: resumenAdsb() };
  }
  return { vuelos: new URL(url, "http://x").searchParams.get("fecha") === "2026-10-24" ? [resumenAdsb()] : [] };
}

// Las pegatinas con QR (migración 033), en memoria. `ADMIN=0` hace que el falso no sea admin.
const pegatinas = new Map([["K7P2", { codigo: "K7P2", etiqueta: null, lote: "Prueba", creado_at: new Date().toISOString(), asignado_at: null }]]);
const escaneosQr = [];
let origenQr = null;
const filaPegatina = (p) => {
  const es = escaneosQr.filter((e) => e.codigo === p.codigo);
  return { ...p, escaneos: es.length, escaneos_sin_sesion: es.filter((e) => !e.con_sesion).length, ultimo_escaneo: es.at(-1)?.creado_at ?? null, cuentas: origenQr === p.codigo ? 1 : 0 };
};
function pegatinasQr(req, ruta, json) {
  if (ruta === "/api/qr/escaneos") {
    const p = pegatinas.get(json.codigo);
    if (p) escaneosQr.push({ codigo: json.codigo, con_sesion: json.con_sesion, creado_at: new Date().toISOString() });
    return { existe: !!p, etiqueta: p?.etiqueta ?? null };
  }
  if (ruta === "/api/qr/origen") {
    const ok = !origenQr && pegatinas.has(json.codigo);
    if (ok) origenQr = json.codigo;
    return { anotado: ok };
  }
  if (process.env.ADMIN === "0") return undefined;
  if (ruta === "/api/admin/qr" && req.method === "POST") {
    const codigos = Array.from({ length: json.cantidad }, () => Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[^A-Z0-9]/g, "X"));
    for (const c of codigos) pegatinas.set(c, { codigo: c, etiqueta: null, lote: json.lote, creado_at: new Date().toISOString(), asignado_at: null });
    return { codigos };
  }
  if (ruta === "/api/admin/qr") return { pegatinas: [...pegatinas.values()].map(filaPegatina) };
  const p = pegatinas.get(ruta.split("/").pop());
  if (!p) return undefined;
  if (req.method === "PATCH") Object.assign(p, { etiqueta: json.etiqueta, asignado_at: json.etiqueta ? new Date().toISOString() : null });
  return filaPegatina(p);
}
if (process.argv[1]?.endsWith("backend-falso.mjs")) createServer(async (req, res) => {
  const ruta = new URL(req.url, "http://x").pathname;
  let crudo = "";
  for await (const parte of req) crudo += parte;
  const json = crudo ? JSON.parse(crudo) : {};
  // El login de la pantalla de ingreso: con la cuenta de prueba devuelve un JWT sin firmar que
  // vence en un día (el proxy de Next no verifica la firma) y sin refresh_token.
  if (ruta === "/api/login" && req.method === "POST") {
    const ok = json.email?.trim().toLowerCase() === CUENTA_DE_PRUEBA.email && json.password === CUENTA_DE_PRUEBA.clave;
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    res.writeHead(ok ? 200 : 401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(ok
      ? { access_token: `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "u1", email: CUENTA_DE_PRUEBA.email, exp: Math.floor(Date.now() / 1000) + 86400 })}.prueba` }
      : { detail: "Usuario o contraseña inválidos." }));
  }
  if (ruta.startsWith("/api/adsb/")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(adsb(ruta, req.url)));
  }
  if (ruta.startsWith("/api/qr/") || ruta.startsWith("/api/admin/qr")) {
    const r = pegatinasQr(req, ruta, json);
    res.writeHead(r === undefined ? 404 : 200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(r ?? { detail: "No existe" }));
  }
  // Seguir el vuelo en vivo (migración 041): crear, posición (rate de 10 s como el real), terminar y el link público.
  if (ruta === "/api/seguimientos/desde-plan" && req.method === "POST") {
    const plan = planes.get(json.plan_id);
    const f = plan?.formulario ?? {};
    const estado = !plan ? 404 : !f.matricula ? 400 : !f.dofUtc || !f.eobtUtc ? 400 : 200;
    if (estado !== 200) { res.writeHead(estado, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ detail: estado === 404 ? "Ese plan de vuelo no existe." : "El plan no tiene matrícula o salida." })); }
    const salida = new Date(`${f.dofUtc}T${f.eobtUtc.slice(0, 2)}:${f.eobtUtc.slice(2)}:00Z`);
    seguimientoPlan = { id: seguimientoPlan?.id ?? crypto.randomUUID(), token: TOKENS_PLAN.antes, plan_id: json.plan_id, vence: new Date(+salida + 4 * 3600e3), terminado: false, mostrar: Boolean(json.mostrar_matricula), salida };
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ id: seguimientoPlan.id, token: seguimientoPlan.token, vence_at: seguimientoPlan.vence.toISOString(), ya_existia: false, mostrar_matricula: seguimientoPlan.mostrar, salida_prevista: salida.toISOString() }));
  }
  if (ruta.startsWith("/api/seguimientos/de-plan/") && req.method === "GET") {
    const sp = seguimientoPlan;
    const ok = sp && ruta.endsWith(sp.plan_id);
    res.writeHead(ok ? 200 : 404, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(ok ? { id: sp.id, token: sp.token, vence_at: sp.vence.toISOString(), activo: !sp.terminado, aterrizo_at: null, terminado_at: null, mostrar_matricula: sp.mostrar, salida_prevista: sp.salida.toISOString(), mirando_ahora: 1, vistos_total: 2, ultima_vista_at: new Date().toISOString(), ahora: new Date().toISOString() } : { detail: "Ese seguimiento no existe." }));
  }
  if (ruta === "/api/seguimientos" && req.method === "POST") {
    const sg = seguimiento && !seguimiento.terminado && new Date() < seguimiento.vence ? seguimiento : nuevoSeguimiento(json);
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ id: sg.id, token: sg.token, vence_at: sg.vence.toISOString(), ya_existia: sg === seguimiento && sg.recorrido.length > 0, mostrar_matricula: sg.mostrarMatricula }));
  }
  if (ruta.startsWith("/api/seguimientos/") && req.method === "POST") {
    const [, , , id, accion] = ruta.split("/");
    let r = { detail: "Ese seguimiento no existe." }, estado = 404;
    if (seguimientoPlan && seguimientoPlan.id === id && accion === "terminar") { seguimientoPlan.terminado = true; r = { terminado: true }; estado = 200; }
    else if (seguimientoPlan && seguimientoPlan.id === id && accion === "matricula") { seguimientoPlan.mostrar = Boolean(json.mostrar); r = { mostrar_matricula: seguimientoPlan.mostrar }; estado = 200; }
    if (seguimiento && seguimiento.id === id) {
      if (accion === "terminar") { seguimiento.terminado ??= new Date(); r = { terminado: true }; estado = 200; }
      else if (accion === "ruta") {
        // Como el real: sólo en vuelo (410 si terminó) y mismos topes que al crear.
        if (seguimiento.terminado || new Date() >= seguimiento.vence) { r = { detail: "Este seguimiento ya terminó." }; estado = 410; }
        else if ((json.puntos ?? []).length > 60 || String(json.ruta ?? "").length > 600) { r = { detail: "La ruta es demasiado larga." }; estado = 422; }
        else {
          seguimiento.ruta = String(json.ruta ?? "").split(/\s+/).filter(Boolean).join(" ");
          seguimiento.puntos = (json.puntos ?? []).map((p) => [p.lat, p.lon, p.codigo ?? "", p.nombre ?? ""]);
          seguimiento.demo = false;
          r = { ok: true }; estado = 200;
        }
      }
      else if (accion === "matricula") {
        // Apagada, la matrícula se borra; prenderla pide mandarla (como el real).
        if (json.mostrar && !json.matricula) { r = { detail: "Falta la matrícula para mostrarla." }; estado = 400; }
        else { seguimiento.mostrarMatricula = Boolean(json.mostrar); seguimiento.avion.matricula = json.mostrar ? json.matricula : null; r = { mostrar_matricula: seguimiento.mostrarMatricula }; estado = 200; }
      }
      else if (accion === "posicion") {
        if (seguimiento.terminado) { r = { detail: "Este seguimiento ya terminó." }; estado = 410; }
        else {
          const ahora = new Date();
          const aceptada = !seguimiento.ultima || ahora - new Date(seguimiento.ultima.hora) >= 10000;
          if (aceptada) {
            seguimiento.ultima = { lat: json.lat, lon: json.lon, alt_ft: json.alt_ft ?? null, gs_kt: json.gs_kt ?? null, track: json.track ?? null, hora: ahora.toISOString() };
            seguimiento.recorrido.push([Math.round(json.lat * 1e5) / 1e5, Math.round(json.lon * 1e5) / 1e5, json.alt_ft ?? null, Math.floor(+ahora / 1000)]);
          }
          const mirando = [...seguimiento.vistas.values()].filter((t) => ahora - t <= 45000).length;
          r = { aceptada, vence_at: seguimiento.vence.toISOString(), mirando_ahora: mirando, vistos_total: seguimiento.vistosTotal, ultima_vista_at: seguimiento.ultimaVista?.toISOString() ?? null, ahora: ahora.toISOString() }; estado = 200;
        }
      }
    }
    res.writeHead(estado, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(r));
  }
  if (ruta.startsWith("/api/publico/seguimientos/") && req.method === "GET") {
    const token = ruta.split("/").pop();
    const tipoPlan = Object.entries(TOKENS_PLAN).find(([, t]) => t === token)?.[0];
    if (tipoPlan) {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      return res.end(JSON.stringify(vistaPlan(tipoPlan)));
    }
    // Sin ningún vuelo creado, el token de prueba muestra uno que avanza solo (para ver la página sin el Mapa).
    if (token === TOKEN_SEGUIMIENTO && !seguimiento) {
      const sg = nuevoSeguimiento({ ruta: "SADF VM SAAV", avion: { tipo: "Cessna 152", icao: "C152", matricula: "LV-ABC" } });
      sg.demo = true;
      sg.puntos = puntosDemo;
      // Unos minutos de recorrido ya hechos: un punto por minuto hacia atrás.
      const ahoraDemo = Date.now();
      for (let i = 0; i < 6; i++) {
        const p = puntoDemo(i, new Date(ahoraDemo - (5 - i) * 60_000));
        sg.recorrido.push([p.la, p.lo, p.alt, p.epoch]);
        sg.ultima = { lat: p.la, lon: p.lo, alt_ft: p.alt, gs_kt: 96, track: p.track, hora: p.hora };
      }
      sg.paso = 6;
      sg.creado = new Date(ahoraDemo - 6 * 60_000);
    }
    if (token === TOKEN_SEGUIMIENTO && seguimiento?.demo && !seguimiento.terminado) {
      const p = puntoDemo(seguimiento.paso++, new Date());
      seguimiento.recorrido.push([p.la, p.lo, p.alt, p.epoch]);
      seguimiento.ultima = { lat: p.la, lon: p.lo, alt_ft: p.alt, gs_kt: 96, track: p.track, hora: p.hora };
    }
    const ok = token === TOKEN_SEGUIMIENTO && seguimiento;
    // Como el real: anota el id de quien mira (X-Visitante, 16 a 32 url-safe) sólo si el vuelo sigue en curso.
    const visitante = req.headers["x-visitante"];
    if (ok && !seguimiento.terminado && new Date() < seguimiento.vence && /^[A-Za-z0-9_-]{16,32}$/.test(visitante ?? "")) {
      const ahoraMs = Date.now();
      const previa = seguimiento.vistas.get(visitante);
      if (previa === undefined || ahoraMs - previa >= 30000) {
        if (previa === undefined) seguimiento.vistosTotal++;
        seguimiento.vistas.set(visitante, ahoraMs);
        seguimiento.ultimaVista = new Date(ahoraMs);
      }
    }
    res.writeHead(ok ? 200 : 404, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    return res.end(JSON.stringify(ok ? vistaSeguimiento(seguimiento) : { detail: "Ese seguimiento no existe." }));
  }
  // Las rutas guardadas del Mapa (migración 039), en memoria.
  if (ruta.startsWith("/api/rutas")) {
    const id = ruta.split("/")[3];
    let r;
    if (!id && req.method === "POST") {
      const ahora = new Date().toISOString();
      r = { id: crypto.randomUUID(), nombre: json.nombre, ruta: json.ruta, aircraft_id: json.aircraft_id ?? null, created_at: ahora, updated_at: ahora };
      rutasGuardadas.unshift(r);
    } else if (!id) r = rutasGuardadas;
    else if (req.method === "DELETE") {
      const i = rutasGuardadas.findIndex((x) => x.id === id);
      r = i >= 0 ? rutasGuardadas.splice(i, 1) && {} : undefined;
    }
    res.writeHead(r === undefined ? 404 : 200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(r ?? { detail: "No existe" }));
  }
  if (ruta.startsWith("/api/planes-de-vuelo")) {
    const r = planesDeVuelo(req, ruta, json);
    res.writeHead(r === undefined ? 404 : 200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(r ?? { detail: "No existe" }));
  }
  if (ruta.startsWith("/api/logbooks") && (req.method === "POST" || req.method === "PATCH")) {
    const vacio = { opening_landings: 0, opening_pic_day_loc: 0, opening_pic_day_tra: 0, opening_pic_night_loc: 0, opening_pic_night_tra: 0, opening_sic_day_loc: 0, opening_sic_day_tra: 0, opening_sic_night_loc: 0, opening_sic_night_tra: 0, opening_imc_pil: 0, opening_imc_cop: 0, opening_capota: 0 };
    const deApertura = Object.fromEntries(Object.entries(json.opening ?? {}).map(([k, v]) => [`opening_${k}`, v ?? 0]));
    let l;
    if (req.method === "POST") {
      l = { id: `l${libros.length + 1}`, user_id: "u1", name: json.name, is_default: libros.length === 0, created_at: new Date().toISOString(), ...vacio, ...deApertura, apertura_ppa: json.apertura_ppa ?? null, renglones_por_hoja: 15 };
      libros.push(l);
    } else {
      l = libros.find((x) => x.id === ruta.split("/").pop());
      if (l) Object.assign(l, deApertura, "apertura_ppa" in json ? { apertura_ppa: json.apertura_ppa } : {}, json.name ? { name: json.name } : {});
    }
    res.writeHead(l ? 200 : 404, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(l ?? {}));
  }
  if (req.method === "GET" && /^\/api\/flights\/[\w-]{20,}$/.test(ruta)) {
    const f = vuelos.find((x) => x.id === ruta.split("/").pop());
    res.writeHead(f ? 200 : 404, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(f ?? {}));
  }
  if (req.method === "PATCH" && /^\/api\/flights\/[^/]+$/.test(ruta)) {
    const f = vuelos.find((x) => x.id === ruta.split("/").pop());
    if (f) Object.assign(f, json, json.cad_vuelo_id ? { cad_cargado_at: new Date().toISOString() } : {});
    res.writeHead(f ? 200 : 404, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(f ?? {}));
  }
  if (req.method === "GET" && ruta === "/api/flights/history") {
    // Como el backend: `q` busca en la ruta y las observaciones, `aeronaveId` filtra por avión.
    const p = new URL(req.url, "http://x").searchParams;
    const q = (p.get("q") || "").toLowerCase();
    const items = [...(SIN_VUELOS ? [] : vuelos)]
      .filter((f) => !q || `${f.route} ${f.remarks ?? ""}`.toLowerCase().includes(q))
      .filter((f) => !p.get("aeronaveId") || f.aircraft_id === p.get("aeronaveId"))
      .sort((x, y) => String(y.takeoff).localeCompare(String(x.takeoff)));
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ items: items.slice(0, Number(p.get("limit")) || 100), total: items.length }));
  }
  if (req.method === "GET" && ruta === "/api/flights") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(SIN_VUELOS ? [] : vuelos));
  }
  if (req.method === "POST" && ruta === "/api/flights") {
    const { "IMC Pil": imc_pil, "IMC Cop": imc_cop, Capota: capota, ...resto } = json;
    const f = { id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, user_id: "u1", ...resto, imc_pil, imc_cop, capota };
    vuelos.push(f);
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(f));
  }
  if (req.method === "PATCH" && ruta.startsWith("/api/aircraft/")) {
    const a = aviones.find((x) => x.id === ruta.split("/").pop());
    if (a) Object.assign(a, json);
    res.writeHead(a ? 200 : 404, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(a ?? {}));
  }
  if (ruta.startsWith("/api/cad/")) return rutaCad(req, res, ruta, json);
  let cuerpo = typeof rutasFijas[ruta] === "function" ? rutasFijas[ruta]() : rutasFijas[ruta];
  if (ruta === "/api/admin/estadisticas" && existsSync(DIR + "admin-estadisticas.json")) cuerpo = JSON.parse(readFileSync(DIR + "admin-estadisticas.json", "utf8"));
  if (cuerpo === undefined) cuerpo = ruta.endsWith("s") ? [] : {};
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(cuerpo));
}).listen(7599, "127.0.0.1", () => console.log(`backend falso en 7599 · ${vuelos.length} vuelos, ${vuelos.reduce((t, f) => t + f.duration, 0).toFixed(1)} h`));
