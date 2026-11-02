"use client";

import { useState, useEffect } from "react";
import { frescura, horaDeObservacion } from "@/lib/frescura";
import { CloudRain, Wind, Thermometer, Search, RefreshCw, ShieldAlert, BookOpen, Copy, Check, Sun, CloudSun, Cloud, CloudLightning } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface WeatherWidgetProps {
  defaultAirport: string;
}

/**
 * "Observado hace 12 min."
 *
 * El METAR trae su propia hora adentro —el grupo `DDHHMMZ`— así que esto funciona
 * igual con un dato traído de la red que con uno guardado en el teléfono, sin que
 * nadie tenga que anotar cuándo se trajo.
 *
 * Los tres niveles tienen color distinto y el texto cambia con ellos: por encima de dos
 * horas ya no se presenta como meteorología sino como lo que es, un texto viejo.
 */
function EdadDelMetar({ metar, observadoEn }: { metar: string; observadoEn?: string | null }) {
  const [ahora, setAhora] = useState<Date | null>(null);

  /*
    El reloj arranca **después de montar** y se refresca cada minuto. En el render del
    servidor no hay "ahora" que valga —el HTML se cachea— y una edad calculada allá
    quedaría congelada en la hora del build.
  */
  useEffect(() => {
    setAhora(new Date());
    const t = setInterval(() => setAhora(new Date()), 60000);
    return () => clearInterval(t);
  }, [metar, observadoEn]);

  if (!ahora) return null;
  const f = frescura(horaDeObservacion(observadoEn, metar, ahora), ahora);
  if (!f) return null;

  const color =
    f.nivel === "inservible"
      ? "text-red-400"
      : f.nivel === "viejo"
        ? "text-amber-400"
        : "text-zinc-500";

  return (
    <p className={`font-mono text-[10px] mt-2 ${color}`}>
      {f.nivel === "inservible"
        ? `Observado ${f.texto}. Ya no describe las condiciones actuales.`
        : `Observado ${f.texto}.`}
    </p>
  );
}

interface WeatherData {
  icao: string;
  metar: string;
  taf: string;
  category: string;
  temp: number | null;
  windSpeed: number | null;
  windDir: string | number | null;
  /** Cuándo se observó, en ISO. `null` si el proveedor no lo mandó. */
  observadoEn?: string | null;
}

/**
 * Si el navegador cree que no hay red.
 *
 * Arranca en `false` —o sea "hay señal"— porque en el servidor no existe
 * `navigator.onLine` y arrancar en "sin señal" pintaría el botón deshabilitado por un
 * instante en cada carga. El evento corrige el estado apenas monta.
 */
function useSinSenal(): boolean {
  const [sinSenal, setSinSenal] = useState(false);
  useEffect(() => {
    const mirar = () => setSinSenal(typeof navigator !== "undefined" && navigator.onLine === false);
    mirar();
    window.addEventListener("online", mirar);
    window.addEventListener("offline", mirar);
    return () => {
      window.removeEventListener("online", mirar);
      window.removeEventListener("offline", mirar);
    };
  }, []);
  return sinSenal;
}

export default function WeatherWidget({ defaultAirport }: WeatherWidgetProps) {
  const sinSenal = useSinSenal();
  const [airport, setAirport] = useState(defaultAirport && defaultAirport !== "---" ? defaultAirport : "SADF");
  const [searchVal, setSearchVal] = useState("");
  const [data, setData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTaf, setShowTaf] = useState(false);
  const [copied, setCopied] = useState(false);

  async function fetchWeather(icaoCode: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/weather?icao=${icaoCode}`);
      if (!res.ok) {
        throw new Error("Aeropuerto no encontrado o reporte no disponible");
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || "Error al obtener reporte");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchWeather(airport);
  }, [airport]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searchVal.trim().length >= 3) {
      setAirport(searchVal.trim().toUpperCase());
      setSearchVal("");
    }
  }

  const copyToClipboard = () => {
    if (data?.metar) {
      navigator.clipboard.writeText(data.metar);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const categoryColors: Record<string, { bg: string; text: string; dot: string; label: string; desc: string; glow: string; sky: string; Icon: any }> = {
    VFR: {
      bg: "bg-emerald-500/10 border-emerald-500/20 dark:bg-emerald-500/5 dark:border-emerald-500/10",
      text: "text-emerald-600 dark:text-emerald-400",
      dot: "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]",
      label: "VFR",
      desc: "Reglas de Vuelo Visual (Cielo despejado)",
      glow: "from-emerald-500/15 via-emerald-500/5 to-transparent",
      sky: "from-sky-300 via-sky-400 to-sky-500",
      Icon: Sun,
    },
    MVFR: {
      bg: "bg-blue-500/10 border-blue-500/20 dark:bg-blue-500/5 dark:border-blue-500/10",
      text: "text-blue-600 dark:text-blue-400",
      dot: "bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]",
      label: "MVFR",
      desc: "VFR Marginal (Techo o visibilidad reducida)",
      glow: "from-blue-500/15 via-blue-500/5 to-transparent",
      sky: "from-slate-300 via-sky-400 to-slate-500",
      Icon: CloudSun,
    },
    IFR: {
      bg: "bg-red-500/10 border-red-500/20 dark:bg-red-500/5 dark:border-red-500/10",
      text: "text-red-600 dark:text-red-400",
      dot: "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]",
      label: "IFR",
      desc: "Reglas de Vuelo Instrumental (Obligatorio plan IFR)",
      glow: "from-red-500/15 via-red-500/5 to-transparent",
      sky: "from-slate-400 via-slate-500 to-slate-600",
      Icon: Cloud,
    },
    LIFR: {
      bg: "bg-fuchsia-500/10 border-fuchsia-500/20 dark:bg-fuchsia-500/5 dark:border-fuchsia-500/10",
      text: "text-fuchsia-600 dark:text-fuchsia-400",
      dot: "bg-fuchsia-500 shadow-[0_0_10px_rgba(217,70,239,0.5)]",
      label: "LIFR",
      desc: "Instrumental Bajo (Poca o nula visibilidad)",
      glow: "from-fuchsia-500/15 via-fuchsia-500/5 to-transparent",
      sky: "from-slate-700 via-slate-800 to-indigo-950",
      Icon: CloudLightning,
    },
    UNK: {
      bg: "bg-zinc-500/10 border-zinc-500/20 dark:bg-white/5 dark:border-white/5",
      text: "text-zinc-500 dark:text-zinc-400",
      dot: "bg-zinc-500",
      label: "Categoría Desconocida",
      desc: "Sin datos de reglas de vuelo",
      glow: "from-zinc-500/10 via-transparent to-transparent",
      sky: "from-zinc-300 via-zinc-400 to-zinc-500",
      Icon: Cloud,
    }
  };

  const currentCat = categoryColors[data?.category || "UNK"] || categoryColors.UNK;

  return (
    <div className="relative">
      <div className="bg-white dark:bg-[#111111] border border-zinc-200 dark:border-white/10 rounded-lg px-8 md:px-10 py-6 md:py-8 shadow-cal dark:shadow-none flex flex-col gap-6 w-full group transition-all duration-500 relative overflow-hidden">

        {/* Sprocket holes — continuous-feed teleprinter paper, punched into the card edge */}
        <SprocketRail side="left" />
        <SprocketRail side="right" />

        {/* Ambient background glow reflecting current category */}
        <div className={`absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl ${currentCat.glow} rounded-full blur-[60px] pointer-events-none transition-all duration-700 opacity-60 dark:opacity-40 -mr-20 -mt-20`} />

        {/* Letterhead — teleprinter transmission header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-dashed border-zinc-300 dark:border-white/15 relative z-10">
          <div className="flex items-center space-x-4">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-zinc-100 dark:bg-white/10 text-zinc-900 dark:text-white rounded-2xl flex items-center justify-center border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-none">
              <CloudRain className="w-5 h-5" />
            </div>
            <div className="space-y-0.5">
              <p className="eyebrow">AWOS/ATIS · Transmisión automática</p>
              <h3 className="font-bold font-display text-zinc-900 dark:text-white tracking-tight text-lg md:text-xl leading-none mt-1.5">Estación {data?.icao || airport}</h3>
            </div>
          </div>

          <form onSubmit={handleSearch} className="flex items-center bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-2xl px-3.5 py-2.5 focus-within:ring-1 focus-within:ring-zinc-400 dark:focus-within:ring-white/20 transition-all w-full sm:max-w-[130px] group/form">
            <input
              value={searchVal}
              onChange={(e) => setSearchVal(e.target.value)}
              placeholder="ICAO (Ej. SAEZ)..."
              className="bg-transparent text-xs font-bold uppercase w-full outline-none text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
            />
            <button type="submit" className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
              <Search className="w-4 h-4" />
            </button>
          </form>
        </div>

        <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-stretch justify-between relative z-10">

        {/* Left Column: Station, Category, Wind and Temp */}
        <div className="flex-1 flex flex-col justify-between space-y-6 relative z-10">

        {/* Loading and Data */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-zinc-400" />
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center">
            <div className="w-full bg-red-500/5 border border-red-500/10 rounded-2xl p-4 flex items-start space-x-3 text-red-500 text-xs">
              <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p className="font-bold leading-normal">{error}</p>
            </div>
          </div>
        ) : data ? (
          <div className="space-y-5 flex-1 flex flex-col justify-end pt-4">
            
            {/* Category Banner — sky mood swatch reflects real METAR category */}
            <div className={`border rounded-2xl p-4 md:p-5 flex items-center gap-4 ${currentCat.bg} transition-all duration-500`}>
              <div className={`relative w-14 h-14 md:w-16 md:h-16 rounded-xl overflow-hidden bg-gradient-to-b ${currentCat.sky} flex items-center justify-center flex-shrink-0 shadow-inner`}>
                <currentCat.Icon className="w-7 h-7 md:w-8 md:h-8 text-white drop-shadow" strokeWidth={1.75} />
                <span className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${currentCat.dot} animate-pulse`} />
              </div>
              <div className="space-y-1 flex-1 min-w-0">
                <p className={`text-sm font-bold leading-none ${currentCat.text}`}>
                  Condición {currentCat.label}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium leading-relaxed mt-1.5 max-w-[260px]">{currentCat.desc}</p>
              </div>
              <span className={`text-3xl font-black font-display tracking-tight flex-shrink-0 ${currentCat.text}`}>
                {data.category}
              </span>
            </div>

            {/* Weather values */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-zinc-50 dark:bg-white/5 border border-zinc-100 dark:border-white/5 rounded-2xl p-4 flex items-center space-x-4">
                <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-white/5 flex items-center justify-center text-zinc-500 dark:text-zinc-400">
                  <Wind className="w-4.5 h-4.5 animate-pulse" />
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 leading-none">Viento</p>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white mt-1.5 leading-none">
                    {data.windSpeed !== null && data.windSpeed > 0
                      ? `${data.windDir !== null ? `${data.windDir}°` : "VRB"} / ${data.windSpeed} KT`
                      : "Calma"}
                  </p>
                </div>
              </div>
              <div className="bg-zinc-50 dark:bg-white/5 border border-zinc-100 dark:border-white/5 rounded-2xl p-4 flex items-center space-x-4">
                <div className="w-9 h-9 rounded-xl bg-zinc-100 dark:bg-white/5 flex items-center justify-center text-zinc-500 dark:text-zinc-400">
                  <Thermometer className="w-4.5 h-4.5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 leading-none">Temperatura</p>
                  <p className="text-sm font-semibold text-zinc-950 dark:text-white mt-1.5 leading-none">
                    {data.temp !== null ? `${data.temp} °C` : "---"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center py-12 text-zinc-400 text-xs font-bold">No hay datos</div>
        )}
      </div>

      {/* Right Column: METAR, TAF and Actions */}
      <div className="flex-1 flex flex-col justify-between space-y-4 border-t md:border-t-0 md:border-l border-zinc-200 dark:border-white/10 pt-6 md:pt-0 md:pl-8 relative z-10">
        
        {data ? (
          <div className="space-y-4 flex-1 flex flex-col justify-between">
            {/* METAR Code Box */}
            <div className="bg-zinc-900 dark:bg-black/40 border border-zinc-800 dark:border-white/5 rounded-2xl p-4 md:p-5 font-mono text-[11px] font-bold leading-relaxed text-zinc-300 dark:text-zinc-200 break-words shadow-inner flex-1 flex flex-col justify-between relative overflow-hidden group/metar">
              
              {/* Box Header with Copy action */}
              <div className="flex items-center justify-between border-b border-zinc-800 dark:border-white/5 pb-2.5 mb-2.5">
                <p className="text-[8px] font-sans font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest leading-none">METAR CODE</p>
                
                <button 
                  onClick={copyToClipboard}
                  className="p-1.5 rounded-lg bg-zinc-800 dark:bg-white/5 text-zinc-400 hover:text-white transition-all active:scale-95 flex items-center space-x-1"
                  title="Copiar código METAR"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-[8px] font-sans text-emerald-400 font-bold px-0.5">Copiado!</span>
                    </>
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              <p className="break-words font-mono font-semibold tracking-normal text-zinc-200 dark:text-zinc-100 select-all leading-normal flex-1 flex items-center">
                {data.metar}
              </p>

              {/*
                **De cuándo es.** Va siempre, no sólo cuando está viejo — es la misma
                razón por la que el briefing muestra siempre "N de M estaciones
                respondieron": un dato sin fecha obliga a suponer que es de recién, y lo
                que se suponga va a ser optimista. Ver `lib/frescura.ts`.
              */}
              <EdadDelMetar metar={data.metar} observadoEn={data.observadoEn} />
            </div>

            {/* TAF Toggle & Box */}
            <div className="space-y-2">
              <button 
                type="button" 
                onClick={() => setShowTaf(!showTaf)}
                className="w-full flex items-center justify-between text-sm font-medium text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors py-2"
              >
                <span className="flex items-center space-x-2">
                  <BookOpen className="w-4 h-4" />
                  <span>Pronóstico TAF</span>
                </span>
                <span className="text-xs font-normal text-zinc-400">{showTaf ? "▲" : "▼"}</span>
              </button>
              
              <AnimatePresence>
                {showTaf && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 rounded-2xl p-4 font-mono text-[10px] font-medium leading-relaxed text-zinc-600 dark:text-zinc-300 break-words max-h-[140px] overflow-y-auto custom-scrollbar shadow-inner">
                      {data.taf}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-400 text-xs font-bold">Aún sin reportes cargados</div>
        )}

        {/*
          El botón deja de prometer lo que no puede cumplir.

          Sin señal giraba igual y no traía nada, con lo cual insinuaba que lo que
          quedaba en pantalla era de recién. Ahora se deshabilita y **lo dice**, que es
          la misma disciplina de `SinConexionBanner`: cuando no se puede, se avisa en
          vez de simular.
        */}
        {!loading && data && (
          <button
            type="button"
            onClick={() => fetchWeather(airport)}
            disabled={sinSenal}
            className="w-full flex items-center justify-center space-x-2 bg-zinc-50 dark:bg-white/5 hover:bg-zinc-100 dark:hover:bg-white/10 border border-zinc-200 dark:border-white/10 text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white font-semibold text-sm py-3.5 rounded-xl transition-all active:scale-[0.98] mt-2 shadow-sm dark:shadow-none disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-zinc-50 dark:disabled:hover:bg-white/5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{sinSenal ? "Sin señal para actualizar" : "Actualizar clima"}</span>
          </button>
        )}
        </div>

        </div>
      </div>
    </div>
  );
}

function SprocketRail({ side }: { side: "left" | "right" }) {
  const position = side === "left" ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2";
  return (
    <div
      aria-hidden
      className={`absolute top-0 bottom-0 w-4 z-20 pointer-events-none ${position}`}
      style={{
        backgroundImage:
          "radial-gradient(circle, rgba(0,0,0,0.15) 2.6px, transparent 3px)",
        backgroundSize: "100% 16px",
        backgroundRepeat: "repeat-y",
      }}
    >
      <div
        className="absolute inset-0 hidden dark:block"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.18) 2.6px, transparent 3px)",
          backgroundSize: "100% 16px",
          backgroundRepeat: "repeat-y",
        }}
      />
    </div>
  );
}
