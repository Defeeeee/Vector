import PageHeader from "@/components/dashboard/PageHeader";
import AccionSocial from "@/components/social/AccionSocial";
import AvisosPush from "@/components/social/AvisosPush";
import AvisoNoSePudo from "@/components/social/AvisoNoSePudo";
import CrearHandleRapido from "@/components/social/CrearHandleRapido";
import FilaPiloto from "@/components/social/FilaPiloto";
import ListaActividad from "@/components/social/ListaActividad";
import { apiFetch } from "@/lib/api";
import { prepararEventos } from "@/lib/publicaciones-servidor";
import { leerDatosParaElHandle, leerResumenSocial } from "@/lib/resumen-social";
import type { Actividad, EventoActividad, PilotoResumen } from "@/types";

export const metadata = { title: "Actividad | Vector" };

/**
 * La Actividad: las solicitudes para seguirte, con sus botones, y lo que pasó con lo
 * tuyo (`GET /red/actividad`: seguidores, solicitudes, aplausos y comentarios de los
 * últimos 60 días).
 *
 * Las solicitudes viven acá desde que Pilotos pasó a Red · Buscar · Actividad: la
 * pestaña Solicitudes de la 2.19.0 se sumó a esta. **Sin esta lista un perfil privado no
 * tiene dónde aceptar a nadie.**
 *
 * La pantalla no escribe nada al dibujarse: marcar la actividad como vista lo hace
 * `ListaActividad` desde el navegador (ver `marcarActividadVista`).
 */
export default async function ActividadPage() {
  const resumen = await leerResumenSocial();

  if (!resumen.disponible) {
    return (
      <div className="space-y-8 w-full max-w-2xl animate-in fade-in duration-700">
        <PageHeader eyebrow="Lo que pasa con lo tuyo" title="Actividad" />
        <AvisoNoSePudo texto="No pudimos cargar tu actividad." />
      </div>
    );
  }

  if (!resumen.handle) {
    const datos = await leerDatosParaElHandle();
    return (
      <div className="space-y-8 w-full max-w-2xl animate-in fade-in duration-700">
        <PageHeader eyebrow="Lo que pasa con lo tuyo" title="Actividad" />
        <CrearHandleRapido
          nombreSugerido={datos.nombre}
          licenciaSugerida={datos.licencia}
          titulo="Para tener actividad, elegí tu @"
        />
      </div>
    );
  }

  const [actividadRes, solicitudesRes, clavePushRes] = await Promise.all([
    apiFetch("/red/actividad", { cache: "no-store" }),
    apiFetch("/social/solicitudes", { cache: "no-store" }),
    apiFetch("/push/clave"),
  ]);
  const clavePush = clavePushRes.ok
    ? ((await clavePushRes.json().catch(() => null)) as { clave?: string | null } | null)?.clave ?? null
    : null;
  const eventos: EventoActividad[] | null = actividadRes.ok
    ? prepararEventos(((await actividadRes.json().catch(() => null)) as Actividad | null)?.eventos ?? [])
    : null;
  const solicitudes: PilotoResumen[] | null = solicitudesRes.ok
    ? ((await solicitudesRes.json().catch(() => null)) as PilotoResumen[] | null)
    : null;

  return (
    <div className="space-y-6 md:space-y-8 w-full max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-700">
      <PageHeader eyebrow="Lo que pasa con lo tuyo" title="Actividad" />

      {/* Sólo aparece si hay algo para hacer: activarlos, o instalar la app en el iPhone. */}
      <AvisosPush clave={clavePush} compacto />

      {solicitudes === null ? (
        <AvisoNoSePudo texto="No pudimos cargar tus solicitudes." />
      ) : (
        solicitudes.length > 0 && (
          <section className="rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none p-5 md:p-6">
            <div className="flex items-baseline justify-between mb-1">
              <h3 className="text-lg font-display font-bold text-zinc-900 dark:text-white tracking-tight">
                Quieren seguirte
              </h3>
              <span className="data text-sm font-bold text-red-500">{solicitudes.length}</span>
            </div>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mb-2">
              Tu perfil es privado: hasta que los aceptes no ven tus horas ni lo que publicás.
            </p>
            <div className="divide-y divide-zinc-100 dark:divide-white/10">
              {solicitudes.map((p) => (
                <FilaPiloto
                  key={p.handle}
                  piloto={p}
                  accion={<AccionSocial tipo="solicitud" handle={p.handle} miHandle={resumen.handle} />}
                />
              ))}
            </div>
          </section>
        )
      )}

      {eventos === null ? (
        <AvisoNoSePudo texto="No pudimos cargar tu actividad." />
      ) : (
        <section className="rounded-[2rem] border border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.02] shadow-cal dark:shadow-none p-5 md:p-6">
          <h3 className="text-lg font-display font-bold text-zinc-900 dark:text-white tracking-tight mb-1">
            Lo último
          </h3>
          <ListaActividad
            eventos={eventos}
            marcarVista={resumen.actividad_nueva > 0 || eventos.some((e) => e.nuevo)}
            miHandle={resumen.handle}
          />
        </section>
      )}
    </div>
  );
}
