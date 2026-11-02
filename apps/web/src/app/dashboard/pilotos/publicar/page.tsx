import PageHeader from "@/components/dashboard/PageHeader";
import AvisoNoSePudo from "@/components/social/AvisoNoSePudo";
import ComposerPublicacion from "@/components/social/ComposerPublicacion";
import CrearHandleRapido from "@/components/social/CrearHandleRapido";
import { leerMiPerfilPublico, leerVuelosParaCompartir } from "@/lib/publicaciones-servidor";
import { leerDatosParaElHandle, leerResumenSocial } from "@/lib/resumen-social";
import { HITOS_DE_HORAS } from "@/lib/hitos";

export const metadata = { title: "Publicar | Vector" };

/**
 * Publicar, con la pantalla entera. Se llega desde el botón **Compartir** de un vuelo
 * (`?vuelo=<id>`, que llega elegido), desde el aviso después de registrarlo, y desde el
 * perfil propio.
 *
 * Sin @, se crea acá mismo: al crearlo la pantalla se vuelve a dibujar con el composer,
 * y el vuelo que venía en la URL sigue elegido.
 *
 * `?hito=100` llega desde la Bitácora cuando el vuelo cruzó un hito de horas: el texto
 * arranca escrito. Sólo los hitos que existen (`HITOS_DE_HORAS`): la URL no escribe lo
 * que se le ocurra en una publicación.
 */
export default async function PublicarPage({
  searchParams,
}: {
  searchParams: Promise<{ vuelo?: string; hito?: string }>;
}) {
  const { vuelo, hito } = await searchParams;
  const hitoPedido = HITOS_DE_HORAS.find((h) => String(h) === hito) ?? null;
  const resumen = await leerResumenSocial();

  if (!resumen.disponible) {
    return (
      <div className="space-y-8 w-full max-w-2xl mx-auto animate-in fade-in duration-700">
        <PageHeader eyebrow="Compartí con tu red" title="Publicar" />
        <AvisoNoSePudo texto="No pudimos preparar la publicación." />
      </div>
    );
  }

  if (!resumen.handle) {
    const datos = await leerDatosParaElHandle();
    return (
      <div className="space-y-8 w-full max-w-2xl mx-auto animate-in fade-in duration-700">
        <PageHeader eyebrow="Compartí con tu red" title="Publicar" />
        <CrearHandleRapido
          nombreSugerido={datos.nombre}
          licenciaSugerida={datos.licencia}
          titulo="Para publicar, elegí tu @"
        />
      </div>
    );
  }

  const [vuelos, perfil] = await Promise.all([leerVuelosParaCompartir(vuelo), leerMiPerfilPublico()]);

  return (
    <div className="space-y-8 w-full max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
      <PageHeader eyebrow="Compartí con tu red" title="Publicar" />
      <ComposerPublicacion
        autor={{
          handle: resumen.handle,
          nombre: perfil?.nombre_visible ?? resumen.handle,
          avatarUrl: resumen.avatar_url,
        }}
        vuelos={vuelos}
        vueloInicialId={vuelo ?? null}
        textoInicial={hitoPedido ? `¡Llegué a las ${hitoPedido} horas de vuelo!` : ""}
      />
    </div>
  );
}
