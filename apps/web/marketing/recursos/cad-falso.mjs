// Un CAD de ANAC falso, para probar el marcador "Vector → CAD" sin tocar el real.
// Imita la API de /foliadoweb/api/VueloTripulante/ que usa "Registro horas vuelo" (leída el
// 2026-10-20) y su validación de horas. Las listas son de mentira, con la misma forma.
import { createServer } from "node:http";

const PUERTO = Number(process.env.PUERTO || 7601);
const finalidades = [
  ["46", "ADAPTACIÓN"], ["63", "ENTRENAMIENTO"], ["64", "EXAMEN"], ["67", "INSTRUCTOR"], ["68", "INSTRUCCIÓN"], ["71", "VUELO PRIVADO"],
].map(([key, value]) => ({ key, value, valueSearch: null }));
const autoridades = [["1", "PILOTO AL MANDO (FALSO)"], ["2", "INSTRUCTOR DE VUELO (FALSO)"]].map(([key, value]) => ({ key, value, valueSearch: null }));
// Con el formato real (2026-10-21): "OACI -  IATA -  ANAC (NOMBRE)" con la clave ANAC, o " ANAC (NOMBRE)".
const lugares = [["101", "SADF -  FDO -  FDO", "SAN FERNANDO"], ["102", "SADM -  MOR", "MORON"], ["103", "SADL -  LPG -  PTA", "LA PLATA"], ["104", " MGI", "ISLA MARTIN GARCIA"], ["105", "SAZS -  BRC -  BAR", "SAN CARLOS DE BARILOCHE"], ["106", "SADP -  EPA -  PAL", "EL PALOMAR"], ["107", " LJN", "LUJAN"]]
  .map(([key, cod, nom]) => ({ key, value: `${cod} (${nom})`, valueSearch: `${cod} ${nom}` }));
const porKey = new Map(lugares.map((l) => [l.key, l.value.trim().split(" ")[0]]));
const vuelos = []; // los del CAD
let proximo = 900000;

function centesimal(a, b) {
  let diff = Date.parse(b) - Date.parse(a);
  const dias = Math.floor(diff / 864e5); diff -= dias * 864e5;
  let h = Math.floor(diff / 36e5); diff -= h * 36e5;
  const m = Math.floor(diff / 6e4);
  const t = [[3, 8, .1], [9, 14, .2], [15, 20, .3], [21, 26, .4], [27, 33, .5], [34, 39, .6], [40, 45, .7], [46, 51, .8], [52, 57, .9]];
  let d = 0; for (const [x, y, v] of t) if (m >= x && m <= y) d = v; if (m >= 58) h++;
  return Math.round((dias * 24 + h + d) * 10) / 10;
}

// Tres vuelos que ya están en el CAD y no en Vector, para "Traer a Vector". El último va en
// un avión que el backend falso no tiene en el Hangar.
function sembrar(recibido) {
  const horas = centesimal(recibido.fechaHoraSalida, recibido.fechaHoraLlegada);
  vuelos.push({
    vueloTripulanteID: ++proximo, fechaSalida: recibido.fechaHoraSalida.slice(0, 19), fechaLlegada: recibido.fechaHoraLlegada.slice(0, 19),
    matricula: recibido.matriculaAvion, origenDesc: porKey.get(recibido.origenID), destinoDesc: porKey.get(recibido.destinoID), tiempoTotal: `${horas.toFixed(1)} hs`,
    estadoDesc: "DECLARADO", recibido,
  });
}
if (!process.env.SIN_SEMILLA) {
  const base = { autoridadCertificanteID: "2", observaciones: "JUAN PEREZ", potencia: 110, clase: "MONT-T", origenPersonalizado: "", destinoPersonalizado: "" };
  sembrar({ ...base, tipoVueloID: "2", cargoID: "1", fechaHoraSalida: "2025-12-10T14:00:00Z", fechaHoraLlegada: "2025-12-10T15:30:00Z", horasDia: 1.5, horasNoche: 0, aterrizajes: 2, finalidadID: "63", origenID: "101", destinoID: "102", matriculaAvion: "LV-ABC", Discriminaciones: [{ tipoDiscriminacionID: 7, horas: "0.3" }] });
  sembrar({ ...base, tipoVueloID: "1", cargoID: "1", fechaHoraSalida: "2025-11-20T22:10:00Z", fechaHoraLlegada: "2025-11-20T23:10:00Z", horasDia: 0, horasNoche: 1, aterrizajes: 5, finalidadID: "68", origenID: "107", destinoID: "107", matriculaAvion: "LV-XYZ", Discriminaciones: [] });
  // El mismo vuelo que Vector tiene el 30/09 a las 12:30, con la fecha un día antes (pasó de verdad).
  sembrar({ ...base, tipoVueloID: "1", cargoID: "1", fechaHoraSalida: "2026-09-29T12:30:00Z", fechaHoraLlegada: "2026-09-29T14:24:00Z", horasDia: 1.9, horasNoche: 0, aterrizajes: 3, finalidadID: "71", origenID: "101", destinoID: "101", matriculaAvion: "LV-ABC", Discriminaciones: [] });
  sembrar({ ...base, tipoVueloID: "2", cargoID: "1", fechaHoraSalida: "2025-11-05T13:00:00Z", fechaHoraLlegada: "2025-11-05T14:12:00Z", horasDia: 1.2, horasNoche: 0, aterrizajes: 2, finalidadID: "71", origenID: "101", destinoID: "104", matriculaAvion: "LV-QQQ", Discriminaciones: [] });
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  let crudo = ""; for await (const p of req) crudo += p;
  // CORS abierto sólo para simular la extensión desde la pestaña de Vector (2.36.0): el CAD real no lo tiene.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  const json = (code, body) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
  const api = url.pathname.replace("/foliadoweb/api/VueloTripulante/", "");
  if (url.pathname === "/" || url.pathname === "/vuelotripulante") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(`<!doctype html><title>CAD falso</title><body style="font-family:sans-serif;padding:24px"><h1>REGISTRO HS DE VUELO (falso)</h1><p>${vuelos.length} vuelos cargados</p><ul>${vuelos.map((v) => `<li>${v.fechaSalida} ${v.origenDesc}→${v.destinoDesc} ${v.matricula} ${v.tiempoTotal}</li>`).join("")}</ul></body>`);
  }
  if (api === "GetFinalidadListItem") return json(200, finalidades);
  if (api === "GetAutoridadesListItem") return json(200, autoridades);
  if (api === "GetLugarAterrizajeListItem") return json(200, url.searchParams.get("tipoLugar") === "AER" ? lugares : []);
  if (api === "GetSimuladoresListItem") return json(200, [{ key: "34", value: "SANTIAGO I C-172 -- ASG TRAINING CENTER" }, { key: "39", value: "C172  -- CIAC CICA" }]);
  if (api === "GetModelosPorSimuladorListItem") return json(200, [{ key: "40", value: "A320" }]);
  if (api === "GetPagedList") return json(200, { totalRows: vuelos.length, dataSource: [...vuelos].sort((a, b) => b.fechaSalida.localeCompare(a.fechaSalida)) });
  // El detalle: se supone con los campos de "Crear" (la forma real no se pudo leer todavía).
  if (api === "Get") {
    const v = vuelos.find((x) => String(x.vueloTripulanteID) === url.searchParams.get("id"));
    return v ? json(200, { vueloTripulanteID: v.vueloTripulanteID, ...v.recibido }) : json(404, { message: "No existe" });
  }
  if (api === "Create" && req.method === "POST") {
    const v = JSON.parse(crudo || "{}");
    const horas = centesimal(v.fechaHoraSalida, v.fechaHoraLlegada);
    const suma = Math.round((Number(v.horasDia) + Number(v.horasNoche)) * 10) / 10;
    if (suma !== horas) return json(400, { message: `Las horas de día y noche (${suma}) no coinciden con la duración total (${horas}).` });
    for (const k of ["tipoVueloID", "cargoID", "finalidadID", "clase", "autoridadCertificanteID", "observaciones", "origenID", "destinoID", "matriculaAvion"])
      if (!v[k]) return json(400, { message: `Falta ${k}` });
    vuelos.push({
      vueloTripulanteID: ++proximo, fechaSalida: v.fechaHoraSalida.slice(0, 19), fechaLlegada: v.fechaHoraLlegada.slice(0, 19),
      matricula: v.matriculaAvion, origenDesc: porKey.get(v.origenID), destinoDesc: porKey.get(v.destinoID), tiempoTotal: `${horas.toFixed(1)} hs`,
      estadoDesc: "PENDIENTE DE DDJJ", recibido: v,
    });
    return json(200, { ok: true });
  }
  json(404, { message: "No existe" });
}).listen(PUERTO, "127.0.0.1", () => console.log(`CAD falso en ${PUERTO}`));
