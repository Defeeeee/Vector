import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  Download,
  ScanSearch,
  Share2,
  ShieldCheck,
  Target,
  Wallet,
  WifiOff,
} from "lucide-react";
import OlvidarAlSalir from "@/components/OlvidarAlSalir";
import {
  CopilotMock,
  HoyMock,
  LibroMock,
  LogFlightMock,
  PcaMock,
  RedMock,
  WeatherMock,
} from "@/components/landing/FeatureMock";
import Aparecer from "@/components/publico/Aparecer";
import JsonLd from "@/components/publico/JsonLd";
import NavPublica from "@/components/publico/NavPublica";
import PiePublico from "@/components/publico/PiePublico";
import RedirigirAuth from "@/components/publico/RedirigirAuth";
import { GUIAS, OG_BASE, SITIO_URL, urlAbsoluta } from "@/lib/sitio";

/**
 * La landing. **Server Component**, a propósito: el contenido llega en el HTML —que es lo
 * que leen los buscadores y lo que se ve primero en un teléfono con poca señal— y el
 * JavaScript queda para lo que lo necesita: el menú, las animaciones y la redirección
 * de un login que cae acá (`RedirigirAuth`).
 *
 * **Todo lo que promete existe** y está verificado contra el código (entrada del
 * 2026-09-23 en la bitácora). Los mockups son ilustrativos y no leen la API; los
 * mínimos de la PCA sí son los de la norma. Nada dice "oficial": el libro en PDF es
 * el "formato digital impreso" que admite la Res. ANAC 470/2025, no un documento de
 * ANAC.
 */

const DESCRIPCION =
  "La bitácora de vuelo digital para pilotos argentinos: cargá tus vuelos en segundos, sabé si podés volar hoy, cuánto te falta para la PCA y cuántas horas te quedan, e imprimí tu libro en PDF para que te lo firmen.";

export const metadata: Metadata = {
  title: "Vector — Bitácora de vuelo digital para pilotos en Argentina",
  description: DESCRIPCION,
  alternates: { canonical: "/" },
  openGraph: {
    ...OG_BASE,
    title: "Vector — Tu bitácora de vuelo, siempre al día",
    description: DESCRIPCION,
    url: "/",
    type: "website",
  },
};

const PREGUNTAS_HOY = [
  {
    icono: ShieldCheck,
    titulo: "¿Puedo volar hoy?",
    texto:
      "Vector cruza tus aterrizajes, tu CMA, el repaso de vuelo y tus vencimientos con la RAAC 61. Si le falta un dato, te lo dice: nunca te da por habilitado a ciegas.",
    href: "/guias/experiencia-reciente",
    cta: "Qué pide la norma",
  },
  {
    icono: Target,
    titulo: "¿Cuánto me falta?",
    texto:
      "Tu avance hacia la PCA casillero por casillero, con los mínimos de la RAAC 61.620: horas totales, al mando, de travesía, de instrumentos y nocturnas.",
    href: "/guias/requisitos-pca",
    cta: "Los requisitos de la PCA",
  },
  {
    icono: Wallet,
    titulo: "¿Cuánto me queda?",
    texto:
      "Las horas que te quedan en el pack o tu saldo en la escuela, y cuánto te costó cada vuelo, al precio de ese día.",
    href: "/register",
    cta: "Empezar a llevarlo",
  },
];

const FUNCIONES = [
  {
    id: "registro",
    eyebrow: "Registro",
    titulo: "Cargá un vuelo antes de que se enfríe el motor.",
    texto:
      "Salida, llegada y horarios. Vector calcula el tiempo con el cuadro centesimal de la hoja, separa local de travesía y día de noche, y te deja el desglose listo. ¿Venís de un libro de papel? Cargá tus horas de arrastre o importá las hojas en PDF.",
    link: { href: "/guias/horas-centesimales", texto: "El cuadro de horas centesimales" },
    Mock: LogFlightMock,
  },
  {
    id: "libro",
    eyebrow: "Libro de vuelo en PDF",
    titulo: "La hoja de siempre, lista para que te la firmen.",
    texto:
      "Exportás tu libro con el formato de los libros en papel: los totales que pasan de hoja en hoja, los renglones de tu libro, y las hojas que cerrás antes de tiempo, tachadas con la diagonal. Es el libro de vuelo “en formato digital impreso” que admite la Res. ANAC 470/2025, con los mismos datos que declarás en el CAD.",
    link: { href: "/guias/libro-de-vuelo", texto: "Cómo se completa el libro" },
    Mock: LibroMock,
  },
  {
    id: "pca",
    eyebrow: "PCA · RAAC 61.620",
    titulo: "Tu camino a la comercial, sin sacar cuentas.",
    texto:
      "Cada vuelo suma en su casillero: total, al mando, travesía, instrumentos y nocturno. Y cuando pasás las 50, 100 o 150 horas, la Bitácora te lo festeja y te deja contarlo en la red con un toque.",
    link: { href: "/guias/requisitos-pca", texto: "Qué horas pide la PCA" },
    Mock: PcaMock,
  },
  {
    id: "preparar",
    eyebrow: "Preparar vuelo",
    titulo: "Del METAR a la navegación, en castellano.",
    texto:
      "METAR y TAF decodificados, datos de aeródromos validados contra el AIP, y un planificador con aerovías, fixes y radioayudas que calcula el combustible con la performance de tu avión.",
    link: null,
    Mock: WeatherMock,
  },
  {
    id: "whatsapp",
    eyebrow: "Copiloto por WhatsApp",
    titulo: "Mandá un audio al bajar del avión.",
    texto:
      "El copiloto entiende cómo hablamos los pilotos: te propone el vuelo con matrícula, ruta y tiempos, y lo carga cuando confirmás. También te avisa por WhatsApp antes de que venza tu CMA.",
    link: null,
    Mock: CopilotMock,
  },
  {
    id: "red",
    eyebrow: "Red de pilotos",
    titulo: "Tu @, tus horas y tus vuelos, para compartir.",
    texto:
      "Un perfil con tus horas para mandar por WhatsApp, y una red para contar tus vuelos con fotos: vos elegís qué datos se ven, y la matrícula nunca. Aplausos, comentarios, avisos en el teléfono, e invitar a tus compañeros de la escuela.",
    link: null,
    Mock: RedMock,
  },
];

const ADEMAS = [
  { icono: CalendarClock, titulo: "Vencimientos con aviso", texto: "CMA, licencia, habilitaciones y seguro, con aviso por WhatsApp antes de que venzan." },
  { icono: CalendarDays, titulo: "Vuelos programados", texto: "Anotá los turnos de la escuela y completalos con un toque cuando aterrizás." },
  { icono: WifiOff, titulo: "Funciona sin señal", texto: "Se instala en el teléfono como una app, y lo esencial abre en el hangar aunque no haya señal." },
  { icono: ScanSearch, titulo: "Auditoría del libro", texto: "Te avisa de vuelos superpuestos o duplicados antes de que lleguen al papel." },
  { icono: Share2, titulo: "Tarjeta para compartir", texto: "Tus horas en una imagen lista para mandar por WhatsApp o subir a una historia." },
  { icono: Download, titulo: "Tus datos son tuyos", texto: "Exportá todo en CSV o JSON cuando quieras, y borrá tu cuenta sin pedirle permiso a nadie." },
];

const PREGUNTAS_FRECUENTES = [
  {
    p: "¿Vector reemplaza al CAD de ANAC?",
    r: "No. Desde el 1 de noviembre de 2025, los pilotos que vuelan bajo la RAAC 91 —escuelas incluidas— declaran su actividad en el Casillero Aeronáutico Digital de ANAC (Res. 470/2025). Vector no carga nada ahí por vos: es tu bitácora de todos los días, con los mismos datos, para llevar el libro al día y tener todo listo cuando declarás.",
  },
  {
    p: "¿El PDF sirve para que me firmen los vuelos?",
    r: "El procedimiento vigente (Res. ANAC 470/2025, Anexo I, punto 9.b) permite usar el libro de vuelo en formato digital impreso para las anotaciones y las certificaciones, siempre que coincida con lo que declarás en el CAD. El PDF de Vector usa la hoja de siempre y deja la columna de certificaciones libre para la firma.",
  },
  {
    p: "¿Tengo que cargar todo mi libro de papel?",
    r: "No. Podés cargar tus horas de arrastre por categoría como saldo inicial del libro, o importar las hojas en PDF y revisarlas antes de guardarlas.",
  },
  {
    p: "¿Mis vuelos son públicos?",
    r: "No. Tu bitácora es privada. Sólo si creás tu @ se publican tus horas totales, y de tus vuelos sale únicamente lo que vos compartís en una publicación: la matrícula, nunca.",
  },
  {
    p: "¿Funciona en el teléfono y sin señal?",
    r: "Sí. Se instala desde el navegador como una app (en el iPhone, con Compartir → “Agregar a inicio”), y lo esencial abre aunque no haya señal.",
  },
];

export default function LandingPage() {
  const datos = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Vector",
      url: SITIO_URL,
      inLanguage: "es-AR",
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Vector",
      url: SITIO_URL,
      description: DESCRIPCION,
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Web, Android, iOS",
      inLanguage: "es-AR",
      image: urlAbsoluta("/opengraph-image"),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: PREGUNTAS_FRECUENTES.map((f) => ({
        "@type": "Question",
        name: f.p,
        acceptedAnswer: { "@type": "Answer", text: f.r },
      })),
    },
  ];

  return (
    <div className="w-full flex flex-col min-h-screen bg-zinc-50 dark:bg-black overflow-hidden transition-colors duration-300 relative">
      {/* Si estás acá, no hay sesión: se borra del teléfono lo que era del piloto.
          Red de seguridad del borrado — ver `olvidar-datos.ts`. */}
      <OlvidarAlSalir />
      <RedirigirAuth />
      <JsonLd datos={datos} />

      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-aviation-blue/5 dark:bg-aviation-blue/[0.06] rounded-full blur-[140px]" />
        <div
          className="absolute inset-0 opacity-[0.02] dark:opacity-[0.05]"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)", backgroundSize: "44px 44px" }}
        />
      </div>

      <NavPublica />

      {/* Hero ------------------------------------------------------------------- */}
      <section className="pt-36 md:pt-48 pb-16 md:pb-20 relative z-10 px-4 md:px-0">
        <div className="container-wide grid lg:grid-cols-2 gap-14 lg:gap-16 items-center">
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white dark:bg-white/[0.04] border border-zinc-200 dark:border-white/10 text-xs font-semibold text-zinc-500 dark:text-zinc-400 shadow-sm">
              <span className="relative flex w-2 h-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-aviation-blue animate-blip" />
              </span>
              Para alumnos y pilotos en Argentina
            </span>

            <h1 className="text-5xl md:text-6xl lg:text-7xl font-display font-bold text-zinc-900 dark:text-white leading-[1.05] tracking-tight">
              Tu bitácora de vuelo,
              <br />
              <span className="text-aviation-blue-dark dark:text-aviation-cyan">siempre al día.</span>
            </h1>

            <p className="text-lg md:text-xl text-zinc-500 dark:text-zinc-400 max-w-xl leading-relaxed">
              Cargá un vuelo en segundos y Vector hace el resto: el desglose de la hoja, si podés
              volar hoy, cuánto te falta para la PCA y cuántas horas te quedan en el pack. Y cuando
              lo necesitás, imprimís tu libro en PDF para que te lo firmen.
            </p>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pt-2">
              <Link
                href="/register"
                className="w-full sm:w-auto bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-8 py-4 rounded-2xl font-semibold text-sm hover:opacity-90 transition-opacity shadow-cal-highlight dark:shadow-none flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
              >
                Crear mi bitácora
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="#funciones"
                className="w-full sm:w-auto bg-white dark:bg-white/[0.03] border border-zinc-200 dark:border-white/10 px-8 py-4 rounded-2xl font-semibold text-sm hover:bg-zinc-50 dark:hover:bg-white/[0.06] transition-colors flex items-center justify-center text-zinc-900 dark:text-white"
              >
                Ver qué hace
              </Link>
            </div>

            <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-2 text-sm text-zinc-500 dark:text-zinc-400">
              <li>Libro en PDF para firmar</li>
              <li aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">·</li>
              <li>Funciona sin señal</li>
              <li aria-hidden="true" className="text-zinc-300 dark:text-zinc-700">·</li>
              <li>También por WhatsApp</li>
            </ul>
          </div>

          <div className="relative animate-in fade-in slide-in-from-bottom-8 duration-1000">
            <div className="rounded-[2rem] border border-zinc-200 dark:border-white/10 shadow-cal dark:shadow-none overflow-hidden max-w-md mx-auto lg:ml-auto">
              <HoyMock />
            </div>
          </div>
        </div>
      </section>

      {/* Las tres preguntas ------------------------------------------------------- */}
      <section id="funciones" className="section-padding relative z-10 scroll-mt-24">
        <div className="container-wide">
          <Aparecer className="max-w-2xl mb-12 md:mb-16">
            <span className="eyebrow">Lo que abrís antes de volar</span>
            <h2 className="text-4xl md:text-5xl font-display font-bold text-zinc-900 dark:text-white mt-3 tracking-tight leading-tight">
              Tres preguntas, contestadas antes de salir al hangar.
            </h2>
          </Aparecer>
          <div className="grid md:grid-cols-3 gap-5">
            {PREGUNTAS_HOY.map((q, i) => {
              const Icono = q.icono;
              return (
                <Aparecer key={q.titulo} demora={i * 0.08} className="h-full">
                  <div className="h-full rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none p-7 flex flex-col">
                    <div className="w-11 h-11 rounded-2xl bg-zinc-900 dark:bg-white/[0.06] flex items-center justify-center mb-5">
                      <Icono className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-xl font-display font-bold text-zinc-900 dark:text-white tracking-tight">{q.titulo}</h3>
                    <p className="mt-3 text-[15px] text-zinc-500 dark:text-zinc-400 leading-relaxed flex-1">{q.texto}</p>
                    <Link
                      href={q.href}
                      className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-aviation-blue dark:text-aviation-cyan hover:underline underline-offset-2"
                    >
                      {q.cta}
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </Aparecer>
              );
            })}
          </div>
        </div>
      </section>

      {/* Las funciones, una por una ----------------------------------------------- */}
      <section className="section-padding relative z-10 border-t border-zinc-200 dark:border-white/10">
        <div className="container-wide space-y-20 md:space-y-28">
          {FUNCIONES.map((f, i) => {
            const invertido = i % 2 === 1;
            const Mock = f.Mock;
            return (
              <Aparecer key={f.id}>
                <div id={f.id} className={`scroll-mt-28 grid md:grid-cols-2 gap-10 md:gap-16 items-center ${invertido ? "md:[direction:rtl]" : ""}`}>
                  <div className={invertido ? "md:[direction:ltr]" : ""}>
                    <span className="eyebrow">{f.eyebrow}</span>
                    <h2 className="text-2xl md:text-3xl font-display font-bold text-zinc-900 dark:text-white mt-3 mb-4 tracking-tight leading-snug">
                      {f.titulo}
                    </h2>
                    <p className="text-base md:text-lg text-zinc-500 dark:text-zinc-400 leading-relaxed">{f.texto}</p>
                    {f.link && (
                      <Link
                        href={f.link.href}
                        className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-aviation-blue dark:text-aviation-cyan hover:underline underline-offset-2"
                      >
                        {f.link.texto}
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    )}
                  </div>
                  <div className={invertido ? "md:[direction:ltr]" : ""}>
                    <div className="aspect-[4/3] rounded-[2rem] border border-zinc-200 dark:border-white/10 shadow-cal dark:shadow-none overflow-hidden">
                      <Mock />
                    </div>
                  </div>
                </div>
              </Aparecer>
            );
          })}
        </div>
      </section>

      {/* Y además --------------------------------------------------------------- */}
      <section className="relative z-10">
        <div className="container-wide">
          <div className="bg-zinc-900 dark:bg-white/[0.03] dark:border dark:border-white/10 rounded-[2.5rem] py-14 px-7 md:px-14 relative overflow-hidden">
            <div className="absolute -top-20 -right-20 w-72 h-72 bg-aviation-blue/10 rounded-full blur-[100px]" aria-hidden="true" />
            <h2 className="text-3xl md:text-4xl font-display font-bold text-white tracking-tight relative z-10">
              Y todo lo demás que hoy repartís entre planillas y notas.
            </h2>
            <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-8 relative z-10">
              {ADEMAS.map((a) => {
                const Icono = a.icono;
                return (
                  <div key={a.titulo} className="flex gap-4">
                    <Icono className="w-5 h-5 text-aviation-cyan shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-base font-display font-bold text-white">{a.titulo}</h3>
                      <p className="text-sm text-white/55 mt-1 leading-relaxed">{a.texto}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Guías ------------------------------------------------------------------ */}
      <section className="section-padding relative z-10">
        <div className="container-wide">
          <Aparecer className="max-w-2xl mb-10 md:mb-12">
            <span className="eyebrow">Guías</span>
            <h2 className="text-4xl md:text-5xl font-display font-bold text-zinc-900 dark:text-white mt-3 tracking-tight leading-tight">
              Lo que pide la norma, explicado con las fuentes.
            </h2>
            <p className="mt-4 text-lg text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Escritas contra la RAAC 61 vigente y las resoluciones de ANAC, con cada fuente citada.
            </p>
          </Aparecer>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {GUIAS.map((g) => (
              <Link
                key={g.slug}
                href={`/guias/${g.slug}`}
                className="group rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none p-6 hover:border-zinc-300 dark:hover:border-white/20 transition-colors"
              >
                <BookOpen className="w-5 h-5 text-aviation-blue dark:text-aviation-cyan" />
                <h3 className="mt-4 text-lg font-display font-bold text-zinc-900 dark:text-white tracking-tight group-hover:underline underline-offset-2">
                  {g.titulo}
                </h3>
                <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">{g.descripcion}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Preguntas frecuentes --------------------------------------------------- */}
      <section id="preguntas" className="section-padding relative z-10 border-t border-zinc-200 dark:border-white/10 scroll-mt-24">
        <div className="container-wide grid lg:grid-cols-[1fr_1.4fr] gap-10 lg:gap-16">
          <div>
            <span className="eyebrow">Preguntas frecuentes</span>
            <h2 className="text-4xl md:text-5xl font-display font-bold text-zinc-900 dark:text-white mt-3 tracking-tight leading-tight">
              Lo que nos preguntan los pilotos.
            </h2>
          </div>
          <div className="divide-y divide-zinc-200 dark:divide-white/10 border-y border-zinc-200 dark:border-white/10">
            {PREGUNTAS_FRECUENTES.map((f) => (
              <details key={f.p} className="group py-5">
                <summary className="flex items-center justify-between gap-4 cursor-pointer list-none text-base md:text-lg font-semibold text-zinc-900 dark:text-white [&::-webkit-details-marker]:hidden">
                  {f.p}
                  <ChevronDown className="w-5 h-5 shrink-0 text-zinc-400 transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-[15px] text-zinc-500 dark:text-zinc-400 leading-relaxed">{f.r}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA -------------------------------------------------------------------- */}
      <section className="section-padding relative z-10 pb-28 md:pb-36">
        <div className="container-wide">
          <div className="rounded-[2.5rem] p-8 md:p-24 text-center relative overflow-hidden border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#111111] shadow-cal dark:shadow-none">
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-aviation-blue/10 rounded-full blur-[100px] pointer-events-none" aria-hidden="true" />
            <h2 className="text-4xl md:text-6xl font-display font-bold text-zinc-900 dark:text-white tracking-tight relative z-10">
              ¿Listo para despegar?
            </h2>
            <p className="text-zinc-500 dark:text-zinc-400 text-base md:text-xl max-w-xl mx-auto mt-5 relative z-10">
              Creá tu cuenta y cargá tu primer vuelo hoy.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8 relative z-10">
              <Link
                href="/register"
                className="w-full sm:w-auto bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-10 py-4 rounded-2xl font-semibold text-sm shadow-cal-highlight dark:shadow-none hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                Crear mi bitácora
              </Link>
              <Link
                href="/login"
                className="w-full sm:w-auto text-zinc-900 dark:text-white px-10 py-4 rounded-2xl font-semibold text-sm hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors border border-zinc-200 dark:border-white/15"
              >
                Ingresar
              </Link>
            </div>
          </div>
        </div>
      </section>

      <PiePublico />
    </div>
  );
}
