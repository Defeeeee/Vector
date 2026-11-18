/**
 * El libro de vuelo **digital**: el PDF que sale de una planilla con la hoja de ANAC (encabezado con
 * AÑO, ITINERARIO, TIEMPOS DE VUELO, SOBRE AERÓDROMO / TRAVESÍA, DE DÍA / DE NOCHE, PILOTO /
 * COPILOTO, la discriminación y los totales). Tiene el texto adentro, así que se lee **exacto**, sin
 * mirar la imagen.
 *
 * Por qué existe: el libro de Berni (2026-11-18) venía con la tabla dibujada diminuta en una esquina
 * de la hoja. El lector de imágenes veía un recuadro de pocos píxeles y confundía columnas: noche por
 * día, capota por simulador. El texto, en cambio, dice en qué columna está cada número.
 *
 * Todo sale de la posición de cada texto en la hoja (x, y en puntos de PDF, y crece hacia arriba):
 * las columnas se ubican por sus rótulos —cada hoja puede tener otra escala— y cada renglón por el
 * número del día. Cada hoja se coteja con sus "TOTALES A LA PAGINA SIGUIENTE" menos los de la página
 * anterior: si no da, se dice (invariante 2).
 */
import type { VueloLeido } from "./importar-libro";

export interface ItemTexto {
  s: string;
  x: number;
  y: number;
}

export interface HojaDigital {
  vuelos: VueloLeido[];
  /** Lo que no coincide con los totales de la hoja, en palabras. */
  diferencias: string[];
  anio: number | null;
}

type Clave =
  | "pic_day_loc" | "sic_day_loc" | "pic_night_loc" | "sic_night_loc"
  | "pic_day_tra" | "sic_day_tra" | "pic_night_tra" | "sic_night_tra"
  | "imc_pil" | "imc_cop" | "capota" | "adiestrador" | "landings" | "otra";

const TIEMPOS: Clave[] = ["pic_day_loc", "sic_day_loc", "pic_night_loc", "sic_night_loc", "pic_day_tra", "sic_day_tra", "pic_night_tra", "sic_night_tra"];
const NOMBRES: Partial<Record<Clave, string>> = {
  pic_day_loc: "aeródromo de día (piloto)", sic_day_loc: "aeródromo de día (copiloto)", pic_night_loc: "aeródromo de noche (piloto)", sic_night_loc: "aeródromo de noche (copiloto)",
  pic_day_tra: "travesía de día (piloto)", sic_day_tra: "travesía de día (copiloto)", pic_night_tra: "travesía de noche (piloto)", sic_night_tra: "travesía de noche (copiloto)",
  imc_pil: "instrumentos real (piloto)", imc_cop: "instrumentos real (copiloto)", capota: "capota", adiestrador: "adiestramiento terrestre", landings: "aterrizajes",
};

const limpio = (s: string) => s.trim().toUpperCase().replace(/\s+/g, " ");
const esHoraTxt = (s: string) => /^\d{1,2}:\d{2}$/.test(s.trim());
const esNumero = (s: string) => /^\d+([.,]\d+)?$/.test(s.trim());
const numero = (s: string) => Number(s.trim().replace(",", "."));
/** Un día o un mes: uno o dos dígitos, tolerando una marca pegada ("`7" en el libro de Berni). */
const diaOMes = (s: string): number | null => { const t = s.trim(); const d = t.replace(/\D/g, ""); return t.length <= 3 && /^\d{1,2}$/.test(d) ? Number(d) : null; };
/** Una matrícula de verdad (LV-S114, N12345, CX-ABC); lo demás (C172, GEOSIM) es un simulador. */
const esMatricula = (s: string) => /^[A-Z]{1,2}-[A-Z0-9]{2,5}$/.test(limpio(s)) || /^N\d{1,5}[A-Z]{0,2}$/.test(limpio(s));

function buscar(items: ItemTexto[], ...textos: string[]): ItemTexto[] {
  const set = new Set(textos.map(limpio));
  return items.filter((it) => set.has(limpio(it.s)));
}
const cercano = <T extends { x: number }>(x: number, anclas: T[]): T | undefined =>
  anclas.reduce<T | undefined>((m, a) => (!m || Math.abs(a.x - x) < Math.abs(m.x - x) ? a : m), undefined);

/** Lee una hoja. Null si no tiene la forma de la hoja de ANAC (entonces la lee el lector de imágenes). */
export function leerHojaDigital(items: ItemTexto[], anioAnterior: number | null = null): HojaDigital | null {
  const sig = buscar(items, "TOTALES A LA PAGINA SIGUIENTE", "TOTALES A LA PÁGINA SIGUIENTE")[0];
  const ant = buscar(items, "TOTALES PAGINA ANTERIOR", "TOTALES PÁGINA ANTERIOR")[0];
  const pil = buscar(items, "PILOTO").sort((a, b) => a.x - b.x);
  const cop = buscar(items, "COPILOTO").sort((a, b) => a.x - b.x);
  const dia = buscar(items, "DIA", "DÍA").sort((a, b) => a.x - b.x)[0];
  const mes = buscar(items, "MES")[0];
  if (!sig || !ant || pil.length < 4 || cop.length < 4 || !dia || !mes) return null;

  // Las columnas de números, por sus rótulos.
  const anclas: { x: number; clave: Clave }[] = [
    { x: pil[0].x, clave: "pic_day_loc" }, { x: cop[0].x, clave: "sic_day_loc" },
    { x: pil[1].x, clave: "pic_night_loc" }, { x: cop[1].x, clave: "sic_night_loc" },
    { x: pil[2].x, clave: "pic_day_tra" }, { x: cop[2].x, clave: "sic_day_tra" },
    { x: pil[3].x, clave: "pic_night_tra" }, { x: cop[3].x, clave: "sic_night_tra" },
  ];
  if (pil[4]) anclas.push({ x: pil[4].x, clave: "imc_pil" });
  if (cop[4]) anclas.push({ x: cop[4].x, clave: "imc_cop" });
  const rotulo = (clave: Clave, ...t: string[]) => { const r = buscar(items, ...t)[0]; if (r) anclas.push({ x: r.x, clave }); };
  rotulo("landings", "ATERRI-", "ATERRIZAJES");
  rotulo("capota", "CAPOTA");
  rotulo("adiestrador", "ADIEST.", "ADIESTRADOR");
  for (const t of ["INSTRUC", "MULTI-", "REACTOR", "AERO", "CERTIFICACIONES"]) rotulo("otra", t);
  const primerTiempo = Math.min(...anclas.filter((a) => TIEMPOS.includes(a.clave)).map((a) => a.x));

  // Las columnas de texto.
  const texto: { x: number; campo: "purpose" | "marca" | "matricula" | "otra" }[] = [];
  for (const [campo, t] of [["purpose", "FINALIDAD"], ["marca", "MARCA"], ["matricula", "MATRICULA"], ["matricula", "MATRÍCULA"], ["otra", "POTENCIA"], ["otra", "CLASE"]] as const) {
    const r = buscar(items, t)[0];
    if (r) texto.push({ x: r.x, campo });
  }

  // El año: el número de cuatro cifras debajo de "AÑO".
  const rotAnio = buscar(items, "AÑO")[0];
  const anioItem = rotAnio ? cercano(rotAnio.x, items.filter((it) => /^(19|20)\d{2}$/.test(it.s.trim()) && it.y <= rotAnio.y + 1 && it.y > dia.y)) : undefined;
  let anio = anioItem ? Number(anioItem.s.trim()) : anioAnterior;

  // Los renglones: cada número en la columna del día, entre los totales de arriba y los de abajo.
  const yArriba = ant.y, yAbajo = sig.y;
  const enCuerpo = items.filter((it) => it.y < yArriba && it.y > yAbajo);
  const anchoDia = Math.abs(mes.x - dia.x);
  const dias = enCuerpo.filter((it) => diaOMes(it.s) !== null && Math.abs(it.x - dia.x) < anchoDia * 0.6).sort((a, b) => b.y - a.y);
  const ys = dias.map((d) => d.y);
  const pasos = ys.slice(1).map((y, i) => ys[i] - y).filter((d) => d > 0).sort((a, b) => a - b);
  // Sin dos renglones para medir, el de una hoja de 15 renglones (más los totales).
  const paso = pasos.length ? pasos[Math.floor(pasos.length / 2)] : Math.abs(yArriba - yAbajo) / 17;
  const filas = ys.map((y) => ({ y, items: [] as ItemTexto[] }));
  for (const it of enCuerpo) {
    const f = filas.reduce<(typeof filas)[number] | undefined>((m, r) => (!m || Math.abs(r.y - it.y) < Math.abs(m.y - it.y) ? r : m), undefined);
    if (f && Math.abs(f.y - it.y) < paso * 0.45) f.items.push(it);
  }

  const vuelos: VueloLeido[] = [];
  const suma: Partial<Record<Clave, number>> = {};
  let mesAnterior = 0;
  for (const f of filas) {
    const its = f.items.sort((a, b) => a.x - b.x);
    const d = its.find((it) => diaOMes(it.s) !== null && Math.abs(it.x - dia.x) < anchoDia * 0.6);
    const m = its.find((it) => it !== d && diaOMes(it.s) !== null && Math.abs(it.x - mes.x) < anchoDia * 0.6);
    const horas = its.filter((it) => esHoraTxt(it.s));
    if (!d || !m || horas.length < 2) continue;
    const mesN = diaOMes(m.s)!;
    if (anio && mesAnterior && mesN < mesAnterior) anio += 1; // la hoja cruzó el año
    mesAnterior = mesN;
    const [salida, llegada] = [horas[0], horas[horas.length - 1]];
    const ruta = its.filter((it) => it.x > salida.x && it.x < llegada.x && !esHoraTxt(it.s)).map((it) => it.s.trim()).join(" ");
    const campos: Record<string, string> = {};
    for (const it of its.filter((it) => it.x > llegada.x && it.x < primerTiempo - 0.2 * anchoDia && !esHoraTxt(it.s))) {
      const c = cercano(it.x, texto);
      if (c && c.campo !== "otra" && !campos[c.campo]) campos[c.campo] = it.s.trim();
    }
    const valores: Partial<Record<Clave, number>> = {};
    for (const it of its.filter((it) => it.x >= primerTiempo - 0.5 * anchoDia && esNumero(it.s))) {
      const c = cercano(it.x, anclas);
      if (c && c.clave !== "otra") valores[c.clave] = (valores[c.clave] ?? 0) + numero(it.s);
    }
    for (const [k, v] of Object.entries(valores)) suma[k as Clave] = (suma[k as Clave] ?? 0) + (v ?? 0);

    const vuelo = TIEMPOS.reduce((s, k) => s + (valores[k] ?? 0), 0);
    const matricula = esMatricula(campos.matricula ?? "") ? limpio(campos.matricula!) : "";
    const v: VueloLeido = {
      date: anio ? `${anio}-${String(mesN).padStart(2, "0")}-${String(diaOMes(d.s)).padStart(2, "0")}` : "",
      takeoff: salida.s.trim(),
      landing: llegada.s.trim(),
      route: ruta,
      purpose: limpio(campos.purpose ?? "") || "VP",
      aircraft_registration: matricula,
      // Un simulador anota el equipo en "matrícula" (C172) y el lugar en "marca" (GEOSIM).
      aircraft_model: matricula ? (campos.marca ?? "") : (campos.matricula ?? campos.marca ?? ""),
      landings: valores.landings ?? 0,
      duration: Math.round((vuelo || (matricula ? 0 : valores.adiestrador ?? 0)) * 10) / 10,
      fuente: "texto",
    };
    for (const k of [...TIEMPOS, "imc_pil", "imc_cop", "capota"] as Clave[]) if (valores[k]) v[k] = valores[k];
    // El adiestrador: en un simulador son sus horas; en un avión, instrucción en tierra anotada en el renglón.
    if (valores.adiestrador) v.sim_pil_en_inst = valores.adiestrador;
    vuelos.push(v);
  }

  // El cotejo con los totales impresos de la hoja.
  const totalesDe = (y: number) => {
    const fila = items.filter((it) => Math.abs(it.y - y) < paso * 0.45 && esNumero(it.s) && it.x >= primerTiempo - 0.5 * anchoDia);
    const t: Partial<Record<Clave, number>> = {};
    for (const it of fila) { const c = cercano(it.x, anclas); if (c && c.clave !== "otra") t[c.clave] = numero(it.s); }
    return t;
  };
  const tAnt = totalesDe(ant.y), tSig = totalesDe(sig.y);
  const diferencias: string[] = [];
  for (const k of Object.keys(NOMBRES) as Clave[]) {
    if (tSig[k] === undefined || tAnt[k] === undefined && k !== "landings") continue;
    const esperado = (tSig[k] ?? 0) - (tAnt[k] ?? 0), leido = suma[k] ?? 0;
    if (Math.abs(esperado - leido) > 0.05) diferencias.push(`${NOMBRES[k]}: la hoja suma ${coma(leido)} y sus totales dicen ${coma(esperado)}`);
  }
  return { vuelos, diferencias, anio };
}

const coma = (n: number) => (Math.round(n * 10) / 10).toString().replace(".", ",");

/** Lee el libro entero, hoja por hoja. Null si alguna hoja con vuelos no tiene la forma de ANAC. */
export function leerLibroDigital(hojas: ItemTexto[][]): { vuelos: VueloLeido[]; diferencias: string[] } | null {
  const vuelos: VueloLeido[] = [];
  const diferencias: string[] = [];
  let anio: number | null = null;
  for (let i = 0; i < hojas.length; i++) {
    if (hojas[i].length === 0) continue;
    const h = leerHojaDigital(hojas[i], anio);
    if (!h) return null;
    anio = h.anio ?? anio;
    vuelos.push(...h.vuelos);
    diferencias.push(...h.diferencias.map((d) => `Hoja ${i + 1}: ${d}`));
  }
  return vuelos.length ? { vuelos, diferencias } : null;
}
