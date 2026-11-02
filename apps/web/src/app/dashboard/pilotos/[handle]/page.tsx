import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Eye, PenLine, Pencil } from "lucide-react";
import AvisoNoSePudo from "@/components/social/AvisoNoSePudo";
import BotonSeguir from "@/components/social/BotonSeguir";
import CabeceraPiloto from "@/components/social/CabeceraPiloto";
import CompartirPerfil from "@/components/social/CompartirPerfil";
import HorasPiloto, { PerfilPrivado } from "@/components/social/HorasPiloto";
import MenuPiloto from "@/components/social/MenuPiloto";
import ListaPublicaciones from "@/components/social/ListaPublicaciones";
import { apiFetch } from "@/lib/api";
import { conArroba, normalizarHandle, problemaDelHandle, rutaPerfil } from "@/lib/handle";
import { leerPublicaciones } from "@/lib/publicaciones-servidor";
import { leerResumenSocial } from "@/lib/resumen-social";
import type { PilotoPublico } from "@/types";

/**
 * El perfil de un piloto **adentro de la app**, con la barra y las pestañas de Pilotos.
 *
 * Es a donde lleva tocar un piloto desde cualquier pantalla del dashboard. Antes todo
 * abría `/u/<handle>`, que es la página para compartir: fuera de la app, sin la barra, y
 * volver era el botón atrás. `/u/...` sigue siendo el link que se manda por WhatsApp, y
 * quien lo abre con sesión termina acá.
 *
 * Lo que se ve lo decide el backend con la sesión de quien mira: horas (o `null` si no
 * puede verlas) y publicaciones, con la misma regla en el RLS.
 */

type Params = { params: Promise<{ handle: string }> };

function handleDe(crudo: string): string {
  try {
    return normalizarHandle(decodeURIComponent(crudo));
  } catch {
    return normalizarHandle(crudo);
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const handle = handleDe((await params).handle);
  return { title: `${conArroba(handle)} | Vector` };
}

export default async function PerfilEnLaApp({ params }: Params) {
  const handle = handleDe((await params).handle);
  if (problemaDelHandle(handle)) notFound();

  const [res, resumen] = await Promise.all([
    apiFetch(`/publico/pilotos/${encodeURIComponent(handle)}`, { cache: "no-store" }),
    leerResumenSocial(),
  ]);
  if (res.status === 404) notFound();
  const piloto = res.ok ? ((await res.json().catch(() => null)) as PilotoPublico | null) : null;
  if (!piloto) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <AvisoNoSePudo texto={`No pudimos cargar el perfil de ${conArroba(handle)}.`} />
      </div>
    );
  }

  const esPropio = piloto.relacion === "propio";
  // `horas` viene en `null` cuando quien mira no puede ver el perfil; las publicaciones
  // siguen la misma regla, así que no hace falta ni pedirlas.
  const puedeVer = piloto.horas != null;
  const lectura = puedeVer ? await leerPublicaciones({ tipo: "piloto", handle: piloto.handle }) : null;

  const boton = "inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition-colors";

  return (
    <div className="space-y-6 w-full max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
      <CabeceraPiloto
        piloto={piloto}
        acciones={
          esPropio ? (
            <>
              <Link
                href="/dashboard/pilotos/publicar"
                className={`${boton} bg-aviation-blue text-white hover:bg-aviation-blue-dark`}
              >
                <PenLine className="w-4 h-4" />
                Publicar
              </Link>
              <Link
                href="/dashboard/settings#perfil-publico"
                className={`${boton} border border-zinc-200 dark:border-white/10 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/5`}
              >
                <Pencil className="w-4 h-4" />
                Editar
              </Link>
              <CompartirPerfil handle={piloto.handle} compacto />
              <Link
                href={`${rutaPerfil(piloto.handle)}?vista=publica`}
                className={`${boton} text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5`}
              >
                <Eye className="w-4 h-4" />
                Cómo te ven
              </Link>
            </>
          ) : (
            <>
              {/* `key`: si bloquear desde el menú cambia la relación, el botón arranca de nuevo. */}
              <BotonSeguir
                key={piloto.relacion}
                handle={piloto.handle}
                relacion={piloto.relacion}
                visibilidad={piloto.visibilidad}
                tieneHandle={!!resumen.handle}
              />
              {/* Bloquear y reportar piden tu @, como seguir: el otro tiene que poder no verte. */}
              {resumen.handle && <MenuPiloto handle={piloto.handle} relacion={piloto.relacion} />}
            </>
          )
        }
      />

      {piloto.horas ? (
        <HorasPiloto horas={piloto.horas} />
      ) : (
        <PerfilPrivado
          titulo={piloto.relacion === "bloqueado" ? "Bloqueado" : undefined}
          mensaje={
            piloto.relacion === "bloqueado"
              ? `Bloqueaste a ${conArroba(piloto.handle)}: no ve tu perfil ni lo que publicás, y vos no ves lo suyo.`
              : piloto.relacion === "pendiente"
                ? "Tu solicitud está pendiente. Cuando la acepte, vas a ver sus horas y lo que publica."
                : `Seguí a ${conArroba(piloto.handle)} para ver sus horas y lo que publica.`
          }
        />
      )}

      {lectura && (
        <section className="space-y-4">
          <h2 className="text-xl font-display font-bold text-zinc-900 dark:text-white tracking-tight">Publicaciones</h2>
          {lectura.disponible ? (
            <ListaPublicaciones
              inicial={lectura.publicaciones}
              siguiente={lectura.siguiente}
              origen={{ tipo: "piloto", handle: piloto.handle }}
              contexto={{ modo: "app", interaccion: resumen.handle ? "completa" : "sin-handle", miHandle: resumen.handle }}
              vacio={
                <p className="rounded-[2rem] border border-dashed border-zinc-300 dark:border-white/15 p-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                  {esPropio ? (
                    <>
                      Todavía no publicaste nada.{" "}
                      <Link
                        href="/dashboard/pilotos/publicar"
                        className="font-semibold text-zinc-900 dark:text-white underline underline-offset-2"
                      >
                        Contá tu último vuelo
                      </Link>
                      .
                    </>
                  ) : (
                    "Todavía no publicó nada."
                  )}
                </p>
              }
            />
          ) : (
            <AvisoNoSePudo texto="No pudimos cargar sus publicaciones." />
          )}
        </section>
      )}
    </div>
  );
}
