import { redirect } from "next/navigation";
import AvisosTracker from "@/components/tracker/AvisosTracker";
import PegarInvitacion from "@/components/tracker/PegarInvitacion";
import ListaDeVuelos from "@/components/tracker/ListaDeVuelos";
import { nombreConHandle, resumenDeLista } from "@/lib/tracker";
import { leerTracker } from "@/lib/tracker-servidor";

/**
 * El inicio del tracker (`/` en tracker.vectoraero.ar): los vuelos que los pilotos te asignaron, con lo
 * que está en el aire primero, y abajo a quiénes seguís. Se lee sin cache y se actualiza solo (`ListaDeVuelos`).
 *
 * - Una lectura que falla no es "no seguís a nadie" (invariante 2): se dice que no se pudo leer.
 * - Sin pilotos, se explica cómo se hace: el piloto manda un link de invitación.
 * - Lo escribe el server (las horas, invariante 1); la pantalla no escribe nada al dibujarse (invariante 15).
 */
export const dynamic = "force-dynamic";

export default async function InicioTracker() {
  const l = await leerTracker();
  if (l.estado === "sin-sesion") redirect("/api/auth/logout?redirect=/ingresar");

  return (
    <div className="mx-auto w-full max-w-2xl space-y-10 px-5 pb-16 pt-8">
      {l.estado === "no-disponible" ? (
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight">No pudimos leer tus vuelos</h1>
          <p className="text-lg text-white/75">Puede ser un corte de conexión. Probá de nuevo en un rato; no es que no tengas vuelos.</p>
        </div>
      ) : l.pilotos.length === 0 ? (
        <div className="space-y-4">
          <h1 className="text-4xl font-bold leading-tight tracking-tight">Todavía no seguís a nadie</h1>
          <p className="text-lg leading-snug text-white/80">
            Pedile al piloto que te mande el link de invitación. Lo genera desde Vector, en &ldquo;Compartir tu vuelo&rdquo;, y te lo manda por WhatsApp. Lo abrís, entrás con Google y listo.
          </p>
          <p className="text-base leading-snug text-white/60">Después, el piloto elige qué vuelos ves. Cuando te asigne uno, aparece acá y te avisamos.</p>
          <PegarInvitacion />
        </div>
      ) : (
        <>
          <ListaDeVuelos inicial={l.tarjetas} resumenInicial={resumenDeLista(l.tarjetas)} />
          <AvisosTracker />
          <section aria-label="A quiénes seguís" className="space-y-3 border-t border-white/10 pt-5">
            <h2 className="font-mono text-xs font-bold uppercase tracking-[0.14em] text-white/60">A quiénes seguís</h2>
            <ul className="space-y-2">
              {l.pilotos.map((p, i) => (
                <li key={`${p.nombre}-${i}`} className="flex items-center justify-between gap-3 text-lg">
                  <span className="font-semibold text-white">{nombreConHandle(p)}</span>
                  <span className={`shrink-0 text-base ${p.activo ? "font-bold text-aviation-cyan" : "text-white/50"}`}>{p.activo ? "Tiene un vuelo" : "Sin vuelos ahora"}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
