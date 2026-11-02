import { NextRequest, NextResponse } from "next/server";
import { getAirport } from "@/lib/airports";
import { distanciaNmPrecisa } from "@/lib/distance";
import { METAR_STATIONS } from "@/lib/estaciones-meteo";
import { frescura, horaDeObservacion } from "@/lib/frescura";
import { clasificarNotam, horaZ, parsearTaf, tafALaHora, ventanaDelVuelo, vigenciaNotam, type ClaseNotam } from "@/lib/meteo-plan";
import { notamsDeAnac } from "@/lib/notams-anac";

/**
 * METAR, TAF y NOTAM de los aeródromos de un plan de vuelo, **a la hora del vuelo**
 * (`lib/meteo-plan.ts`): el TAF recortado a la salida (para el aeródromo de salida) o a la
 * llegada (destino y alternativas), y los NOTAM cruzados con la ventana del vuelo.
 *
 * `?ad=salida:SADF&ad=destino:SADM&ad=alternativa:SADP&salida=<ISO>&llegada=<ISO>`.
 *
 * Un aeródromo sin METAR o sin TAF toma el de la estación más cercana a menos de 60 NM, y
 * lo dice. Todo lo que se muestra va escrito desde acá (invariante 1).
 *
 * Pide sesión: son hasta seis consultas a servicios de afuera por pedido.
 */

const ROLES = { salida: "Salida", destino: "Destino", alternativa: "Alternativa" } as const;
type Rol = keyof typeof ROLES;
const RADIO_NM = 60;

interface Estacion {
  icao: string;
  distanciaNm: number;
}

function cercanas(codigo: string): Estacion[] {
  const a = getAirport(codigo);
  if (!a || typeof a.lat !== "number" || typeof a.lon !== "number") return [];
  return METAR_STATIONS.map((e) => ({ icao: e.icao, distanciaNm: distanciaNmPrecisa(a.lat!, a.lon!, e.lat, e.lon) }))
    .filter((e) => e.icao !== codigo && e.distanciaNm <= RADIO_NM)
    .sort((x, y) => x.distanciaNm - y.distanciaNm)
    .slice(0, 2);
}

export async function GET(req: NextRequest) {
  if (!req.cookies.get("session_token")) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  const q = req.nextUrl.searchParams;
  const salida = Date.parse(q.get("salida") ?? "");
  const llegada = Date.parse(q.get("llegada") ?? "");
  if (!Number.isFinite(salida) || !Number.isFinite(llegada) || llegada < salida) {
    return NextResponse.json({ error: "Faltan la salida y la llegada" }, { status: 400 });
  }
  const aeros = q
    .getAll("ad")
    .map((x) => x.split(":"))
    .filter((p): p is [Rol, string] => p.length === 2 && p[0] in ROLES && /^[A-Z0-9]{3,4}$/.test(p[1]))
    .slice(0, 4);
  if (aeros.length === 0) return NextResponse.json({ error: "Sin aeródromos" }, { status: 400 });

  const ahora = new Date();
  const vecinas = new Map(aeros.map(([, c]) => [c, cercanas(c)]));
  const ids = [...new Set(aeros.flatMap(([, c]) => [c, ...(vecinas.get(c) ?? []).map((e) => e.icao)]))];
  const ventana = ventanaDelVuelo(salida, llegada);

  const [metares, tafs, notams] = await Promise.all([
    fetch(`https://aviationweather.gov/api/data/metar?ids=${ids.join(",")}&format=json`, {
      headers: { "User-Agent": "Vector-Flight-Log-App" },
      next: { revalidate: 300 },
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null) as Promise<{ icaoId?: string; rawOb?: string; obsTime?: number; reportTime?: string }[] | null>,
    fetch(`https://aviationweather.gov/api/data/taf?ids=${ids.join(",")}&format=raw`, {
      headers: { "User-Agent": "Vector-Flight-Log-App" },
      next: { revalidate: 300 },
    })
      .then((r) => (r.ok ? r.text() : null))
      .catch(() => null),
    Promise.all([...new Set(aeros.map(([, c]) => c))].map(async (c) => [c, await notamsDeAnac(c)] as const)),
  ]);

  const metarDe = new Map((Array.isArray(metares) ? metares : []).filter((m) => m.icaoId && m.rawOb).map((m) => [m.icaoId!, m]));
  const tafDe = new Map(
    (tafs ?? "")
      .split(/\n(?=TAF\s)/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => [/^TAF\s+(?:(?:AMD|COR)\s+)*([A-Z]{4})/.exec(t)?.[1] ?? "", t] as const)
  );
  const notamsDe = new Map(notams);

  const aerodromos = aeros.map(([rol, codigo]) => {
    const hora = rol === "salida" ? salida : llegada;
    const opciones: Estacion[] = [{ icao: codigo, distanciaNm: 0 }, ...(vecinas.get(codigo) ?? [])];

    const m = opciones.find((e) => metarDe.has(e.icao));
    const crudo = m ? metarDe.get(m.icao)! : null;
    const f = crudo ? frescura(horaDeObservacion(crudo.reportTime ?? crudo.obsTime, crudo.rawOb, ahora), ahora) : null;
    const metar = m && crudo ? { estacion: m.icao, distanciaNm: m.distanciaNm ? Math.round(m.distanciaNm) : null, texto: crudo.rawOb!, hace: f?.texto ?? null, viejo: f ? f.nivel !== "fresco" : true } : null;

    const t = opciones.find((e) => tafDe.has(e.icao));
    const parseado = t ? parsearTaf(tafDe.get(t.icao)!, ahora.toISOString()) : null;
    const lineas = parseado ? tafALaHora(parseado, hora) : null;
    const taf = t && parseado
      ? {
          estacion: t.icao,
          distanciaNm: t.distanciaNm ? Math.round(t.distanciaNm) : null,
          lineas,
          // Fuera de la validez: se dice hasta cuándo llega, no se inventa.
          aviso: lineas ? null : hora >= parseado.hasta ? `El TAF llega hasta las ${horaZ(parseado.hasta)}: todavía no cubre tu hora.` : `El TAF empieza a las ${horaZ(parseado.desde)}.`,
        }
      : null;

    const lista = notamsDe.get(codigo);
    const porClase = (clase: ClaseNotam) =>
      (lista ?? [])
        .filter((n) => clasificarNotam(n, ventana) === clase)
        .map((n) => ({ codigo: n.codigo, texto: n.textoEsp, vigencia: vigenciaNotam(n) }));

    return {
      rol: ROLES[rol],
      codigo,
      hora: horaZ(hora),
      metar,
      taf,
      notams: lista === null || lista === undefined
        ? null
        : { afectan: porClase("afecta"), revisar: porClase("revisar"), noEnTuHorario: porClase("noEnTuHorario"), permanentes: porClase("permanente") },
    };
  });

  return NextResponse.json({ ventana: `${horaZ(ventana.desde)} – ${horaZ(ventana.hasta)}`, aerodromos });
}
