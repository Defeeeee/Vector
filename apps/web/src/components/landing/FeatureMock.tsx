import { ArrowRight, Check, MessageCircle, Mic, PartyPopper, Plane } from "lucide-react";

/**
 * Product mocks for the landing feature sections.
 *
 * These are rebuilt in markup rather than being screenshots, for three reasons:
 * they follow the light/dark theme without shipping two image sets, they stay
 * sharp at any density, and they cannot go stale the way a PNG of the UI does
 * the moment the UI changes.
 *
 * Every number here is illustrative. Nothing reads from the API — this renders
 * for logged-out visitors, so there is no account to read from.
 */

function BrowserFrame({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#111111]">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-200 dark:border-white/10 shrink-0">
        <span className="w-2.5 h-2.5 rounded-full bg-zinc-200 dark:bg-white/15" />
        <span className="w-2.5 h-2.5 rounded-full bg-zinc-200 dark:bg-white/15" />
        <span className="w-2.5 h-2.5 rounded-full bg-zinc-200 dark:bg-white/15" />
        <span className="ml-2 data text-[10px] text-zinc-400 dark:text-zinc-600 truncate">{url}</span>
      </div>
      <div className="flex-1 min-h-0 p-5 md:p-6 flex flex-col justify-center overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
      {children}
    </span>
  );
}

/** Registro — the Nuevo Vuelo form, down to the block/ANAC split. */
function LogFlightMock() {
  return (
    <BrowserFrame url="vector.fdiaznem.com.ar/dashboard/log-flight">
      <div className="space-y-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <div className="space-y-1">
            <FieldLabel>Salida</FieldLabel>
            <div className="data text-lg md:text-xl font-bold text-zinc-900 dark:text-white border-b border-zinc-200 dark:border-white/10 pb-1">
              SADM
            </div>
          </div>
          <ArrowRight className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-600 mb-2" />
          <div className="space-y-1">
            <FieldLabel>Llegada</FieldLabel>
            <div className="data text-lg md:text-xl font-bold text-zinc-900 dark:text-white border-b border-zinc-200 dark:border-white/10 pb-1">
              SAEZ
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full text-zinc-400 dark:text-zinc-500">
            Local
          </span>
          <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900">
            Travesía
          </span>
        </div>

        <div className="rounded-xl bg-zinc-900 dark:bg-black px-4 py-3 flex items-center gap-6">
          <div>
            <p className="font-mono text-[8px] font-bold uppercase tracking-wider text-white/40">Block time</p>
            <p className="data text-base font-bold text-white leading-tight">1:22</p>
          </div>
          <div className="w-px h-7 bg-white/10" />
          <div>
            <p className="font-mono text-[8px] font-bold uppercase tracking-wider text-white/40">En el libro</p>
            <p className="data text-base font-bold text-aviation-cyan leading-tight">1.4</p>
          </div>
        </div>
      </div>
    </BrowserFrame>
  );
}

/**
 * PCA — progreso contra los mínimos de la RAAC 61.620 (VI edición). Los números de
 * avance son de ejemplo; **los objetivos no**: son los de la norma, porque una landing
 * que muestra 50 h de travesía enseña mal lo que pide la licencia.
 */
function PcaMock() {
  const rows = [
    { label: "Total de vuelo", done: 148.2, need: 200 },
    { label: "Al mando (PIC)", done: 92.5, need: 100 },
    { label: "Travesía al mando", done: 14.6, need: 20 },
    { label: "Instrucción por instrumentos", done: 6.5, need: 10 },
    { label: "Nocturno", done: 3.2, need: 5 },
  ];
  return (
    <BrowserFrame url="vector.fdiaznem.com.ar/dashboard/summary">
      <div className="space-y-3">
        {rows.map((r) => {
          const pct = Math.min(100, (r.done / r.need) * 100);
          return (
            <div key={r.label} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 truncate">
                  {r.label}
                </span>
                <span className="data text-[11px] font-bold text-zinc-900 dark:text-white shrink-0">
                  {r.done.toFixed(1)}
                  <span className="text-zinc-400 dark:text-zinc-600">/{r.need}</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-zinc-900 dark:bg-white"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </BrowserFrame>
  );
}

/** Copiloto por WhatsApp: el audio al bajar del avión, y la confirmación. */
function CopilotMock() {
  return (
    <BrowserFrame url="wa.me · Copiloto Vector">
      <div className="space-y-3">
        <div className="flex justify-end">
          <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-zinc-900 dark:bg-white px-3.5 py-2.5 flex items-center gap-2.5">
            <Mic className="w-3.5 h-3.5 text-white dark:text-zinc-900 shrink-0" />
            <span className="flex items-end gap-0.5 h-4">
              {[5, 9, 14, 7, 11, 6, 12, 8].map((h, i) => (
                <span
                  key={i}
                  className="w-0.5 rounded-full bg-white/60 dark:bg-zinc-900/60"
                  style={{ height: `${h}px` }}
                />
              ))}
            </span>
            <span className="data text-[10px] text-white/70 dark:text-zinc-900/70">0:12</span>
          </div>
        </div>

        <div className="flex justify-start">
          <div className="max-w-[88%] rounded-2xl rounded-bl-sm bg-zinc-100 dark:bg-white/[0.06] px-3.5 py-3 space-y-2">
            <p className="text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed">
              Cargué el vuelo. ¿Confirmás?
            </p>
            <div className="flex items-center gap-2 pt-0.5">
              <span className="data text-[11px] font-bold text-zinc-900 dark:text-white">SADM</span>
              <Plane className="w-3 h-3 text-zinc-400 dark:text-zinc-600" />
              <span className="data text-[11px] font-bold text-zinc-900 dark:text-white">SAEZ</span>
              <span className="ml-auto data text-[11px] font-bold text-zinc-900 dark:text-white">1.4 h</span>
            </div>
          </div>
        </div>
      </div>
    </BrowserFrame>
  );
}

/** Meteorología — raw METAR plus the decoded read-out. */
function WeatherMock() {
  const cells = [
    { k: "Viento", v: "180° 9kt" },
    { k: "Visib.", v: "6km" },
    { k: "Techo", v: "CAVOK" },
    { k: "QNH", v: "1012" },
  ];
  return (
    <BrowserFrame url="vector.fdiaznem.com.ar/dashboard/clima">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="eyebrow">Estación</p>
            <p className="data text-lg font-bold text-zinc-900 dark:text-white leading-tight mt-0.5">
              SADM
            </p>
          </div>
          <span className="font-mono text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-green-500/10 text-green-600 dark:text-green-500">
            VMC
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {cells.map((c) => (
            <div key={c.k}>
              <p className="font-mono text-[8px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                {c.k}
              </p>
              <p className="data text-[11px] font-bold text-zinc-900 dark:text-white mt-0.5">{c.v}</p>
            </div>
          ))}
        </div>

        <div className="rounded-lg bg-zinc-100 dark:bg-white/[0.06] px-3 py-2">
          <p className="data text-[9px] leading-relaxed text-zinc-500 dark:text-zinc-400 break-all">
            <span className="font-bold text-zinc-900 dark:text-white">METAR</span>{" "}
            SADM 011900Z 18009KT CAVOK 20/12 Q1012
          </p>
        </div>
      </div>
    </BrowserFrame>
  );
}

/**
 * El "Hoy" del alumno: las tres preguntas del Inicio, contestadas. Es lo primero que
 * ve quien abre Vector, así que es lo primero que muestra la landing.
 */
function HoyMock() {
  return (
    <div className="h-full flex flex-col gap-3 bg-white dark:bg-[#111111] p-5 md:p-6">
      <div className="flex items-center justify-between">
        <span className="eyebrow">Hoy</span>
        <span className="data text-[10px] text-zinc-400 dark:text-zinc-600">Inicio</span>
      </div>
      <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-4 flex items-start gap-3">
        <span className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0">
          <Check className="w-4 h-4" strokeWidth={3} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-zinc-900 dark:text-white">Podés volar hoy</p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">CMA vigente · 4 aterrizajes en los últimos 180 días</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-zinc-900 dark:bg-white/[0.04] p-4">
          <p className="font-mono text-[8px] font-bold uppercase tracking-wider text-white/40">Para la PCA</p>
          <p className="data text-2xl font-bold text-white leading-tight mt-1">51.8 h</p>
          <p className="text-[10px] text-white/50">te faltan de 200</p>
          <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full w-[74%] rounded-full bg-aviation-cyan" />
          </div>
        </div>
        <div className="rounded-2xl bg-zinc-50 dark:bg-white/[0.03] border border-zinc-100 dark:border-white/10 p-4">
          <p className="font-mono text-[8px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">En el pack</p>
          <p className="data text-2xl font-bold text-zinc-900 dark:text-white leading-tight mt-1">6.5 h</p>
          <p className="text-[10px] text-zinc-500 dark:text-zinc-400">te quedan de 10</p>
          <div className="mt-2 h-1 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden">
            <div className="h-full w-[65%] rounded-full bg-zinc-900 dark:bg-white" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * El libro en PDF: una hoja cerrada antes de tiempo, con los totales que se arrastran y
 * la diagonal sobre lo que quedó en blanco.
 */
function LibroMock() {
  const filas = [
    ["03", "02", "SADF", "SAAR", "C152", "LV-S114", "1,2", "2"],
    ["11", "02", "SADF", "SADF", "C152", "LV-S114", "1,2", "4"],
    ["05", "03", "SADF", "SADF", "C152", "LV-S114", "1,2", "4"],
  ];
  const columnas = "grid grid-cols-[1fr_1fr_1.6fr_1.6fr_1.4fr_2fr_1.4fr_1.2fr]";
  const celda = "border-r border-b border-zinc-300 dark:border-white/15 px-1 py-[3px] text-center truncate";
  const titulo = ["Día", "Mes", "Desde", "Hasta", "Marca", "Matrícula", "Tiempo", "Aterr."];
  return (
    <BrowserFrame url="libro-de-vuelo.pdf">
      <div className="data text-[8px] md:text-[9px] text-zinc-700 dark:text-zinc-300 border-l border-t border-zinc-300 dark:border-white/15">
        <div className={`${columnas} text-[7px] font-bold uppercase text-zinc-500 dark:text-zinc-400`}>
          {titulo.map((t) => (
            <div key={t} className={celda}>{t}</div>
          ))}
        </div>
        <div className={`${columnas} font-bold`}>
          <div className={`${celda} col-span-6 text-left`}>Totales página anterior</div>
          <div className={celda}>31,1</div>
          <div className={celda}>68</div>
        </div>
        {filas.map((f) => (
          <div key={f.join()} className={columnas}>
            {f.map((c, i) => (
              <div key={i} className={celda}>{c}</div>
            ))}
          </div>
        ))}
        {/* Lo que quedó en blanco al cerrar la hoja, tachado con una sola diagonal. */}
        <div className="relative">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={columnas}>
              {Array.from({ length: 8 }, (_, j) => (
                <div key={j} className={`${celda} h-[17px]`} />
              ))}
            </div>
          ))}
          <svg className="absolute inset-0 w-full h-full pointer-events-none text-zinc-900 dark:text-white" preserveAspectRatio="none" viewBox="0 0 100 100" aria-hidden="true">
            <line x1="0" y1="0" x2="100" y2="100" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
        <div className={`${columnas} font-bold`}>
          <div className={`${celda} col-span-6 text-left`}>Totales a la página siguiente</div>
          <div className={celda}>34,7</div>
          <div className={celda}>78</div>
        </div>
      </div>
      <p className="mt-3 text-[10px] text-zinc-400 dark:text-zinc-500">Hoja 2 de 3 · cerrada el 05/03 · lista para firmar</p>
    </BrowserFrame>
  );
}

/** La red: una publicación con su vuelo, sin matrícula, y los aplausos. */
function RedMock() {
  return (
    <BrowserFrame url="vector.fdiaznem.com.ar/dashboard/pilotos">
      <div className="space-y-3">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center text-[10px] font-bold">AG</span>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-zinc-900 dark:text-white leading-tight">Ana Gómez</p>
            <p className="data text-[10px] text-zinc-400 dark:text-zinc-500">@ana.vuela · PPA · hace 2 h</p>
          </div>
        </div>
        <p className="text-[12px] text-zinc-700 dark:text-zinc-300 leading-snug">
          ¡Primera travesía solo! Viento cruzado en la final, pero salió redondo.
        </p>
        <div className="rounded-xl border border-zinc-200 dark:border-white/10 px-3 py-2 flex items-center gap-2 data text-[10px]">
          <Plane className="w-3 h-3 text-aviation-blue dark:text-aviation-cyan" />
          <span className="font-bold text-zinc-900 dark:text-white">SADF → SAAR</span>
          <span className="text-zinc-400">· 1,4 h · C152</span>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-zinc-500 dark:text-zinc-400">
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
            <PartyPopper className="w-3.5 h-3.5" /> 12
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle className="w-3.5 h-3.5" /> 3
          </span>
        </div>
      </div>
    </BrowserFrame>
  );
}

export { CopilotMock, HoyMock, LibroMock, LogFlightMock, PcaMock, RedMock, WeatherMock };
