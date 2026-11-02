"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Copy,
  HelpCircle,
  RefreshCw,
  Wind,
} from "lucide-react";
import {
  mejorPista,
  pistasDesdeMadhel,
  veredictoDeRuta,
  type CategoriaVuelo,
  type EstacionRuta,
  type Pista,
} from "@/lib/briefing";
import { computeAltitude } from "@/lib/aviation";
import { fmt } from "./tools/ToolPrimitives";

/**
 * El briefing meteorológico de la ruta, adentro del planificador.
 *
 * ## Qué reemplaza
 *
 * A `RouteWeatherClient`, 846 líneas y el archivo más viejo del área. Hacía que el
 * piloto tipeara la misma ruta en dos pantallas, y arrastraba cuatro bugs que acá **no
 * se reprodujeron a propósito** — están listados abajo para que no vuelvan.
 *
 * ## Los cuatro bugs de la pantalla vieja
 *
 * 1. **El veredicto mentía cuando no sabía.** `UNK` puntuaba igual que `VFR`, así que
 *    con el servicio caído anunciaba "Ruta 100% VFR habilitada". Ahora la decisión vive
 *    en `lib/briefing.ts`, con tests, y cuenta cuántas estaciones respondieron.
 * 2. **Las normas ANAC nunca se mostraban**: el render pedía `madhel.norms` y la API
 *    devuelve `particularNorms` y `generalNorms`. Bloque muerto durante meses.
 * 3. **Se ignoraba `nearestStation`**: cuando un aeródromo no tiene METAR propio, la API
 *    devuelve el de la estación más cercana, y la pantalla lo pintaba como si fuera del
 *    aeródromo pedido. Acá se dice de dónde salió.
 * 4. **Los fetches no tenían timeout ni cancelación**, así que al cambiar de ruta las
 *    respuestas viejas pisaban el estado nuevo.
 */

interface Punto {
  codigo: string;
  label: string;
  lat?: number;
  lon?: number;
  elevacionFt?: number;
  pistas?: Pista[];
  /** Variación magnética, para poder derivar rumbos de los designadores de MADHEL. */
  variacionW?: number;
}

interface Notam {
  code: string;
  from: string;
  to: string;
  textRaw?: string;
  textEsp?: string;
}

interface DatosEstacion {
  metar?: string;
  taf?: string;
  categoria: CategoriaVuelo;
  tempC: number | null;
  vientoDir: number | null;
  vientoKt: number | null;
  qnhHpa: number | null;
  /** De qué estación salió el METAR, si no es del aeródromo pedido. */
  estacionCercana: { icao: string; name: string; distanceNm: number } | null;
  notams: Notam[] | null;
  madhel: {
    particularNorms?: string;
    generalNorms?: string;
    radio?: string[];
    fuel?: string;
    /** Texto libre: "18/36 1080x30 M - ASPH…". Se parsea si no hay pistas medidas. */
    runways?: string[];
  } | null;
  respondio: boolean;
}

const VACIA: DatosEstacion = {
  categoria: "UNK",
  tempC: null,
  vientoDir: null,
  vientoKt: null,
  qnhHpa: null,
  estacionCercana: null,
  notams: null,
  madhel: null,
  respondio: false,
};

/** Presupuesto por estación. Sin esto, `ais.anac.gob.ar` cuelga la pantalla entera. */
const TIMEOUT_MS = 10000;

/**
 * `/api/weather` devuelve el literal `"No disponible"` en `metar` y `taf` cuando no hay
 * nada, en vez de `null`. Es un string y por lo tanto **truthy**: renderizado tal cual,
 * aparece en la caja monoespaciada del METAR con la misma pinta que un reporte de
 * verdad. Se normaliza en el borde para que el resto del componente no tenga que
 * acordarse.
 */
const texto = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() && v.trim() !== "No disponible" ? v.trim() : undefined;

export default function BriefingRuta({ puntos }: { puntos: Punto[] }) {
  const [datos, setDatos] = useState<Record<string, DatosEstacion>>({});
  const [cargando, setCargando] = useState(false);
  const [recarga, setRecarga] = useState(0);

  const codigos = puntos.map((p) => p.codigo).filter(Boolean);
  const clave = codigos.join(",");

  useEffect(() => {
    if (codigos.length === 0) return;

    /*
      Cancelación de verdad: al cambiar de ruta se aborta lo anterior. La pantalla vieja
      no lo hacía y una respuesta lenta de la ruta previa pisaba la nueva.
    */
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS);
    let vivo = true;

    setCargando(true);

    (async () => {
      const entradas = await Promise.all(
        codigos.map(async (icao): Promise<[string, DatosEstacion]> => {
          // `encodeURIComponent` porque el código sale de un input libre.
          const q = encodeURIComponent(icao);
          const [clima, notams] = await Promise.allSettled([
            fetch(`/api/weather?icao=${q}`, { signal: controlador.signal }).then((r) =>
              r.ok ? r.json() : Promise.reject(new Error(String(r.status)))
            ),
            fetch(`/api/notams?icao=${q}`, { signal: controlador.signal }).then((r) =>
              r.ok ? r.json() : Promise.reject(new Error(String(r.status)))
            ),
          ]);

          if (clima.status !== "fulfilled") return [icao, { ...VACIA }];

          const c = clima.value;
          return [
            icao,
            {
              metar: texto(c.metar),
              taf: texto(c.taf),
              categoria: (c.category as CategoriaVuelo) ?? "UNK",
              tempC: typeof c.temp === "number" ? c.temp : null,
              vientoDir: typeof c.windDir === "number" ? c.windDir : null,
              vientoKt: typeof c.windSpeed === "number" ? c.windSpeed : null,
              qnhHpa: typeof c.altimHpa === "number" ? c.altimHpa : null,
              estacionCercana: c.nearestStation ?? null,
              // `null` y no `[]`: "no pudimos preguntar" no es "no hay NOTAMs".
              notams: notams.status === "fulfilled" ? notams.value.notams ?? [] : null,
              madhel: notams.status === "fulfilled" ? notams.value.madhel ?? null : null,
              respondio: true,
            },
          ];
        })
      );

      clearTimeout(temporizador);
      if (!vivo) return;
      setDatos(Object.fromEntries(entradas));
      setCargando(false);
    })();

    return () => {
      vivo = false;
      clearTimeout(temporizador);
      controlador.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, recarga]);

  if (codigos.length === 0) return null;

  const estaciones: EstacionRuta[] = codigos.map((icao) => {
    const d = datos[icao] ?? VACIA;
    return {
      icao,
      categoria: d.categoria,
      vientoKt: d.vientoKt,
      notams: d.notams === null ? null : d.notams.length,
      respondio: d.respondio,
      /*
        El METAR crudo viaja al veredicto porque **se autofecha**: el grupo `DDHHMMZ`
        está adentro del texto. Con eso, `veredictoDeRuta` descarta las estaciones cuyo
        dato ya no describe el cielo de ahora — un METAR de cuatro horas respondió pero
        no informa, y contarlo produciría un verde a partir de nada.
      */
      metar: d.metar,
    };
  });

  const veredicto = veredictoDeRuta(estaciones);

  const TONO = {
    bien: { Icono: CheckCircle2, clase: "border-emerald-500/25 bg-emerald-500/[0.07]", color: "text-emerald-600 dark:text-emerald-500" },
    atencion: { Icono: AlertTriangle, clase: "border-amber-500/25 bg-amber-500/[0.07]", color: "text-amber-600 dark:text-amber-500" },
    peligro: { Icono: CircleAlert, clase: "border-red-500/25 bg-red-500/[0.07]", color: "text-red-600 dark:text-red-500" },
    sinDatos: { Icono: HelpCircle, clase: "border-zinc-300/40 dark:border-white/10 bg-zinc-100/60 dark:bg-white/[0.03]", color: "text-zinc-500 dark:text-zinc-400" },
  }[veredicto.tono];

  return (
    <section className="space-y-4" data-imprimir="junto">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Briefing de la ruta</h3>
        <button
          type="button"
          onClick={() => setRecarga((n) => n + 1)}
          data-imprimir="no"
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${cargando ? "animate-spin" : ""}`} />
          {cargando ? "Consultando…" : "Actualizar"}
        </button>
      </div>

      <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 ${TONO.clase}`}>
        <TONO.Icono className={`w-5 h-5 shrink-0 mt-0.5 ${TONO.color}`} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white">{veredicto.titulo}</p>
          <p className="text-[13px] text-zinc-600 dark:text-zinc-300 leading-relaxed mt-0.5">
            {veredicto.detalle}
          </p>
          {/* Siempre se dice de cuántas estaciones se habló. Es lo que impide que un
              veredicto tranquilizador se apoye en silencio. */}
          <p className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500 mt-1.5">
            {veredicto.respondieron} de {veredicto.consultadas}{" "}
            {veredicto.consultadas === 1 ? "estación respondió" : "estaciones respondieron"}
          </p>
        </div>
      </div>

      <div className="grid gap-3">
        {puntos
          .filter((p) => p.codigo)
          .map((punto) => (
            <TarjetaEstacion key={punto.codigo} punto={punto} datos={datos[punto.codigo] ?? VACIA} />
          ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

const COLOR_CATEGORIA: Record<CategoriaVuelo, string> = {
  VFR: "text-emerald-600 dark:text-emerald-400",
  MVFR: "text-blue-600 dark:text-blue-400",
  IFR: "text-red-600 dark:text-red-400",
  LIFR: "text-fuchsia-600 dark:text-fuchsia-400",
  UNK: "text-zinc-400 dark:text-zinc-500",
};

function TarjetaEstacion({ punto, datos }: { punto: Punto; datos: DatosEstacion }) {
  const [abierto, setAbierto] = useState(false);
  const [copiado, setCopiado] = useState(false);

  // El timer se limpia al desmontar. En la pantalla vieja quedaba colgado.
  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 2000);
    return () => clearTimeout(t);
  }, [copiado]);

  const copiar = useCallback(() => {
    if (!datos.metar) return;
    navigator.clipboard.writeText(datos.metar).then(() => setCopiado(true)).catch(() => {});
  }, [datos.metar]);

  /*
    Dos fuentes de pista, en orden de calidad:

    1. `runways.tsv` (OurAirports) — rumbo verdadero publicado. Sólo 93 aeródromos,
       porque OurAirports únicamente conoce los que tienen indicador ICAO.
    2. El texto de MADHEL, derivando el rumbo del designador con la variación magnética.
       Cubre el resto — **558 de los 711 no tienen ICAO**, y San Nicolás (SNY) es uno:
       su ficha publica dos pistas y el planificador decía que no tenía ninguna.

    La segunda es menos precisa y la pantalla lo dice, pero un cruzado con ±5° de error
    es infinitamente más útil que ningún cruzado.
  */
  const pistas =
    punto.pistas && punto.pistas.length > 0
      ? punto.pistas
      : pistasDesdeMadhel(datos.madhel?.runways ?? [], punto.variacionW);

  const cruzado = mejorPista(pistas, datos.vientoDir, datos.vientoKt);
  const estimada = pistas.some((p) => p.fuente === "estimada");

  // Densidad de altitud: `computeAltitude` existía y nadie la usaba en el preflight.
  // Ahora el QNH viene del METAR en vez de tipearse a mano.
  const densidad =
    punto.elevacionFt !== undefined && datos.qnhHpa !== null && datos.tempC !== null
      ? computeAltitude({ elevationFt: punto.elevacionFt, qnhHpa: datos.qnhHpa, oatC: datos.tempC })
      : null;

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-bold text-zinc-900 dark:text-white">{punto.codigo}</span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate">{punto.label}</span>
        <span className={`font-mono text-[11px] font-bold ml-auto ${COLOR_CATEGORIA[datos.categoria]}`}>
          {datos.categoria === "UNK" ? "sin datos" : datos.categoria}
        </span>
      </div>

      {/* Bug 3 de la pantalla vieja: el METAR podía ser de otra estación y no se decía. */}
      {datos.estacionCercana && (
        <p className="text-[11px] text-amber-600 dark:text-amber-500 mt-1.5">
          Sin METAR propio. Se muestra el de {datos.estacionCercana.name} (
          {datos.estacionCercana.icao}), a {datos.estacionCercana.distanceNm} NM.
        </p>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 font-mono text-[11px] text-zinc-600 dark:text-zinc-300">
        {datos.vientoKt !== null && (
          <span className="inline-flex items-center gap-1">
            <Wind className="w-3 h-3 text-zinc-400" />
            {datos.vientoDir !== null ? String(datos.vientoDir).padStart(3, "0") : "VRB"}/{datos.vientoKt} kt
          </span>
        )}
        {datos.tempC !== null && <span>{datos.tempC} °C</span>}
        {datos.qnhHpa !== null && <span>Q{datos.qnhHpa}</span>}
        {densidad && <span>DA {fmt(densidad.densityAltitude, 0)} ft</span>}
      </div>

      {/* El viento cruzado de verdad, contra el rumbo verdadero de la pista. */}
      {cruzado ? (
        <p className="text-[12px] text-zinc-700 dark:text-zinc-200 mt-2">
          Pista <strong>{cruzado.cabecera}</strong>: {fmt(cruzado.cruzadoKt, 0)} kt cruzado por la{" "}
          {cruzado.desde}, {fmt(cruzado.frenteKt, 0)} kt de frente.
          {estimada && (
            <span className="text-zinc-400 dark:text-zinc-500">
              {" "}— rumbo estimado del designador, ±5°.
            </span>
          )}
        </p>
      ) : (
        pistas.length === 0 &&
        datos.vientoKt !== null &&
        datos.vientoKt > 0 && (
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-2">
            No tenemos el rumbo de la pista de este aeródromo, así que no podemos calcular el cruzado.
          </p>
        )
      )}

      {datos.metar && (
        <div className="flex items-start gap-2 mt-2.5">
          <p className="font-mono text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400 break-all flex-1 select-all">
            {datos.metar}
          </p>
          <button
            type="button"
            onClick={copiar}
            data-imprimir="no"
            title="Copiar METAR"
            className="shrink-0 p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors"
          >
            {copiado ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}

      {(datos.taf || datos.notams?.length || datos.madhel) && (
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          data-imprimir="no"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-aviation-blue mt-2"
        >
          <ChevronDown className={`w-3 h-3 transition-transform ${abierto ? "rotate-180" : ""}`} />
          {abierto ? "Menos" : "TAF, NOTAMs y datos del aeródromo"}
          {datos.notams?.length ? ` (${datos.notams.length} NOTAM)` : ""}
        </button>
      )}

      {abierto && (
        <div className="mt-3 space-y-3 border-t border-zinc-100 dark:border-white/5 pt-3">
          {datos.taf && (
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">TAF</p>
              <p className="font-mono text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400 break-all select-all">
                {datos.taf}
              </p>
            </div>
          )}

          {datos.notams === null ? (
            // Bug: la pantalla vieja mostraba "no hay NOTAMs" aunque el servicio hubiera
            // fallado. No es lo mismo.
            <p className="text-[11px] text-amber-600 dark:text-amber-500">
              No pudimos consultar los NOTAM de esta estación.
            </p>
          ) : datos.notams.length === 0 ? (
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500">Sin NOTAM activos.</p>
          ) : (
            <div className="space-y-2">
              {datos.notams.map((n, i) => (
                <div key={`${n.code}-${i}`} className="text-[11px]">
                  <p className="font-mono font-bold text-zinc-700 dark:text-zinc-200">
                    {n.code} <span className="font-normal text-zinc-400">· {n.from} → {n.to}</span>
                  </p>
                  <p className="text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    {n.textEsp || n.textRaw}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Bug 2: el render pedía `madhel.norms`, que la API nunca devolvió. Los
              nombres reales son `particularNorms` y `generalNorms`. */}
          {(datos.madhel?.particularNorms || datos.madhel?.generalNorms) && (
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                Normas ANAC
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed whitespace-pre-line">
                {datos.madhel.particularNorms || datos.madhel.generalNorms}
              </p>
            </div>
          )}

          {(datos.madhel?.radio?.length || datos.madhel?.fuel) && (
            <p className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
              {datos.madhel?.radio?.length ? `Radio: ${datos.madhel.radio.join(" · ")}` : ""}
              {datos.madhel?.radio?.length && datos.madhel?.fuel ? "  ·  " : ""}
              {datos.madhel?.fuel ? `Combustible: ${datos.madhel.fuel}` : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
