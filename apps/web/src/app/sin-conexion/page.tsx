import type { Metadata } from "next";
import Link from "next/link";
import { CloudOff, Compass, MapPin, Calculator } from "lucide-react";

export const metadata: Metadata = {
  title: "Sin conexión — Vector",
  description: "No hay red. Esto es lo que Vector puede hacer igual.",
};

/**
 * La pantalla que aparece cuando no hay red **y** no hay copia guardada.
 *
 * ## Por qué no es un cartel de error
 *
 * Porque el piloto que llega acá está parado en la plataforma con el avión afuera, y
 * un "no se pudo cargar la página" no le sirve de nada. Lo que necesita saber es
 * **qué sí puede hacer**, y ahí es donde esto tiene que llevarlo.
 *
 * Es la misma disciplina de `SinConexionBanner`: informar sin asustar, y sobre todo
 * no dejarlo adivinando si el problema es la red o su cuenta.
 *
 * ## Por qué vive fuera de `/dashboard`
 *
 * El matcher de `src/proxy.ts` es `["/", "/dashboard/:path*"]`. Adentro del
 * dashboard, esta ruta pasaría por la verificación de sesión — y una pantalla de "no
 * hay red" que exige sesión es un chiste: la sesión se verifica contra el servidor,
 * que es exactamente lo que no se alcanza.
 *
 * Acá afuera se renderiza para cualquiera, sin preguntar nada.
 *
 * ## Y por qué los links son honestos y no una lista de deseos
 *
 * **Sólo se nombra lo que de verdad anda sin señal**, y eso cambia con cada fase del
 * plan. Hoy —Fase 2— no anda ninguna: el service worker todavía no guarda páginas.
 * Por eso el texto dice "si las abriste con señal", que es cierto ahora y va a
 * seguir siendo cierto después. Prometer offline sin haberlo verificado es la
 * versión PWA de afirmar cuando no se sabe.
 */
export default function SinConexionPage() {
  return (
    <div className="w-full max-w-xl mx-auto px-6 py-16 md:py-24">
      <span className="inline-flex p-3 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-500 mb-6">
        <CloudOff className="w-6 h-6" />
      </span>

      <h1 className="font-display font-bold text-3xl md:text-4xl text-zinc-900 dark:text-white tracking-tight mb-3">
        No hay conexión
      </h1>

      <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed mb-2">
        No pudimos hablar con el servidor. Puede ser la señal del aeródromo, los datos
        del teléfono, o que Vector esté momentáneamente caído.
      </p>
      <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed mb-10">
        <strong className="font-semibold text-zinc-900 dark:text-white">
          Tus datos están a salvo.
        </strong>{" "}
        Esto es un problema de red, no de tu cuenta: no se perdió ningún vuelo.
      </p>

      <p className="eyebrow mb-4">Lo que podés intentar</p>
      <ul className="space-y-3 mb-10">
        {[
          { icono: Compass, texto: "Planificador de navegación", href: "/dashboard/planificador" },
          { icono: MapPin, texto: "Directorio de aeródromos", href: "/dashboard/airports" },
          { icono: Calculator, texto: "Calculadoras de cabina", href: "/dashboard/tools" },
        ].map(({ icono: Icono, texto, href }) => (
          <li key={href}>
            <Link
              href={href}
              /*
                Sin prefetch: estamos sin red por definición. `next/link` intentaría
                traer las tres rutas al montar, las tres fallarían, y lo único que
                lograría es ruido en la consola del piloto.
              */
              prefetch={false}
              className="flex items-center gap-3 rounded-2xl border border-zinc-200 dark:border-white/10 px-4 py-3 text-sm font-medium text-zinc-900 dark:text-white hover:border-aviation-blue/40 transition-colors"
            >
              <Icono className="w-4 h-4 text-zinc-400 shrink-0" />
              {texto}
            </Link>
          </li>
        ))}
      </ul>

      <p className="text-[13px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
        Estas pantallas abren sin señal <strong>si ya las visitaste con conexión</strong>.
        Si nunca las abriste, el teléfono no tiene de dónde sacarlas.
      </p>
    </div>
  );
}
