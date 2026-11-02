import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Compass, Eye } from "lucide-react";
import { getSessionToken } from "@/actions/auth";
import { AvisosProvider } from "@/components/dashboard/Avisos";
import BotonSeguir from "@/components/social/BotonSeguir";
import RecordarInvitacion from "@/components/social/RecordarInvitacion";
import CabeceraPiloto from "@/components/social/CabeceraPiloto";
import HorasPiloto, { PerfilPrivado } from "@/components/social/HorasPiloto";
import ListaPublicaciones from "@/components/social/ListaPublicaciones";
import AvisoNoSePudo from "@/components/social/AvisoNoSePudo";
import { apiFetch } from "@/lib/api";
import { conArroba, normalizarHandle, problemaDelHandle, rutaPerfilApp } from "@/lib/handle";
import { leerPublicaciones } from "@/lib/publicaciones-servidor";
import type { PilotoPublico } from "@/types";

/**
 * El perfil público de un piloto: `/u/<handle>`, el link que se comparte.
 *
 * **Se abre sin cuenta**, por decisión de Federico: es el link que un piloto manda por
 * WhatsApp, y el que lo recibe puede no usar Vector. Por eso vive fuera de
 * `/dashboard` —el proxy no lo protege, sólo le renueva la sesión a quien la tenga— y
 * no lleva la barra de la app.
 *
 * - **Quien lo abre con sesión va al perfil adentro de la app**
 *   (`/dashboard/pilotos/<handle>`), con la barra: desde la app no se sale de la app.
 *   Lo decide la `relacion` que devuelve el backend, que es quien valida la sesión: una
 *   cookie vencida no manda a nadie a un dashboard que lo rebotaría al login.
 * - **`?vista=publica`** es "así te ven": se pide como anónimo aunque haya sesión, y no
 *   redirige.
 * - **Lo que se ve lo decide el backend**: horas agregadas (o `null`) y publicaciones,
 *   con la misma regla en el RLS. Esta página no tiene cómo mostrar un vuelo que el
 *   piloto no haya elegido publicar.
 * - **Un backend caído no es un piloto que no existe.** Sólo un 404 es "no existe"; lo
 *   demás tira y lo agarra `src/app/error.tsx`, con código 500: un link compartido no
 *   puede quedar diciendo "no existe" durante un corte.
 */

type Params = { params: Promise<{ handle: string }>; searchParams: Promise<{ vista?: string }> };

function handleDe(crudo: string): string {
  try {
    return normalizarHandle(decodeURIComponent(crudo));
  } catch {
    return normalizarHandle(crudo);
  }
}

/**
 * Título y descripción de la vista previa. **Como anónimo**, igual que la imagen: es
 * lo que ve quien recibe el link, no quien lo abrió. Sin indexar: el perfil es para
 * compartir, no para aparecer en buscadores.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const handle = handleDe((await params).handle);
  const sinIndexar = { robots: { index: false, follow: false } };
  if (problemaDelHandle(handle)) return { title: "Piloto no encontrado | Vector", ...sinIndexar };

  const res = await apiFetch(
    `/publico/pilotos/${encodeURIComponent(handle)}`,
    { cache: "no-store" },
    { anonimo: true },
  );
  if (res.status === 404) return { title: "Piloto no encontrado | Vector", ...sinIndexar };
  const piloto = res.ok ? ((await res.json().catch(() => null)) as PilotoPublico | null) : null;
  if (!piloto) return { title: `${conArroba(handle)} | Vector`, ...sinIndexar };

  const titulo = `${piloto.nombre_visible} (${conArroba(piloto.handle)}) | Vector`;
  const descripcion = piloto.horas
    ? `${piloto.horas.total.toFixed(1)} horas de vuelo en su bitácora de Vector.`
    : "Perfil de piloto en Vector.";
  return {
    title: titulo,
    description: descripcion,
    ...sinIndexar,
    openGraph: { title: titulo, description: descripcion, type: "profile" },
  };
}

export default async function PerfilPublicoPagina({ params, searchParams }: Params) {
  const handle = handleDe((await params).handle);
  // Un @ con formato imposible no existe: no hace falta preguntarle al backend.
  if (problemaDelHandle(handle)) notFound();
  const comoAnonimo = (await searchParams).vista === "publica";

  const res = await apiFetch(
    `/publico/pilotos/${encodeURIComponent(handle)}`,
    { cache: "no-store" },
    { anonimo: comoAnonimo },
  );
  if (res.status === 404) notFound();
  if (!res.ok) throw new Error(`No se pudo cargar el perfil de ${conArroba(handle)} (HTTP ${res.status}).`);
  const piloto = (await res.json()) as PilotoPublico;

  if (!comoAnonimo && piloto.relacion !== "anonimo") redirect(rutaPerfilApp(piloto.handle));
  // Sin la vista pública, llegar hasta acá es no tener una sesión válida: con una, ya se
  // redirigió. En la vista pública la sesión no se le mostró al backend, así que vale la
  // cookie.
  const conSesion = comoAnonimo && !!(await getSessionToken());

  const lectura =
    piloto.horas != null ? await leerPublicaciones({ tipo: "piloto", handle: piloto.handle, comoAnonimo: true }) : null;

  return (
    <AvisosProvider>
      <div className="min-h-screen w-full bg-zinc-50 dark:bg-black text-zinc-900 dark:text-white">
        <header className="w-full border-b border-zinc-200 dark:border-white/10 bg-white/70 dark:bg-black/40 backdrop-blur-xl">
          <div className="max-w-2xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
            <Link href={conSesion ? "/dashboard" : "/"} className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 flex items-center justify-center">
                <Compass className="w-4 h-4" strokeWidth={2} />
              </span>
              <span className="text-lg font-bold font-display tracking-tight">Vector</span>
            </Link>
            <Link
              href={conSesion ? rutaPerfilApp(piloto.handle) : "/login"}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
            >
              {conSesion ? (
                <>
                  <ArrowLeft className="w-4 h-4" /> Volver a Vector
                </>
              ) : (
                "Ingresar"
              )}
            </Link>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 md:px-6 py-8 md:py-12 space-y-6">
          {comoAnonimo && conSesion && (
            <p className="flex items-start gap-2.5 rounded-2xl border border-aviation-blue/20 dark:border-aviation-cyan/20 bg-aviation-blue/[0.06] dark:bg-aviation-cyan/[0.06] px-4 py-3 text-[13px] text-zinc-600 dark:text-zinc-300">
              <Eye className="w-4 h-4 shrink-0 mt-0.5 text-aviation-blue dark:text-aviation-cyan" aria-hidden="true" />
              Así ve este perfil alguien sin cuenta o que no lo sigue: lo mismo que muestra el link que compartís.
            </p>
          )}

          <CabeceraPiloto
            piloto={piloto}
            acciones={
              comoAnonimo ? undefined : (
                <BotonSeguir
                  handle={piloto.handle}
                  relacion={piloto.relacion}
                  visibilidad={piloto.visibilidad}
                  tieneHandle={false}
                />
              )
            }
          />

          {piloto.horas ? (
            <HorasPiloto horas={piloto.horas} />
          ) : (
            <PerfilPrivado
              mensaje={`Con una cuenta en Vector le pedís a ${conArroba(piloto.handle)} que te acepte, y ves sus horas y lo que publica.`}
            />
          )}

          {lectura && (
            <section className="space-y-4">
              <h2 className="text-xl font-display font-bold tracking-tight">Publicaciones</h2>
              {lectura.disponible ? (
                <ListaPublicaciones
                  inicial={lectura.publicaciones}
                  siguiente={lectura.siguiente}
                  origen={{ tipo: "piloto", handle: piloto.handle, comoAnonimo: true }}
                  contexto={{
                    modo: "publico",
                    interaccion: conSesion ? "solo-lectura" : "sin-sesion",
                    comoAnonimo: true,
                  }}
                  vacio={
                    <p className="rounded-[2rem] border border-dashed border-zinc-300 dark:border-white/15 p-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                      Todavía no publicó nada.
                    </p>
                  }
                />
              ) : (
                <AvisoNoSePudo texto="No pudimos cargar sus publicaciones." />
              )}
            </section>
          )}

          {/* Para quien llegó por el link ------------------------------------------ */}
          {!conSesion && !comoAnonimo && <RecordarInvitacion handle={piloto.handle} />}
          {!conSesion && (
            <section className="rounded-[2rem] bg-zinc-900 dark:bg-[#111111] border border-zinc-900 dark:border-white/10 p-6 md:p-8 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex-1">
                <p className="font-display font-bold text-xl text-white">¿Sos piloto?</p>
                <p className="text-sm text-white/60 mt-1">
                  Llevá tu bitácora en Vector: horas en formato ANAC, vencimientos y si podés volar hoy.
                </p>
              </div>
              <Link
                href="/register"
                className="inline-flex items-center justify-center rounded-2xl bg-white text-zinc-900 px-5 py-3 text-sm font-semibold hover:bg-zinc-200 transition-colors"
              >
                Crear mi bitácora
              </Link>
            </section>
          )}
        </main>
      </div>
    </AvisosProvider>
  );
}
