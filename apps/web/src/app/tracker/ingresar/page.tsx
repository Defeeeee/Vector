import PegarInvitacion from "@/components/tracker/PegarInvitacion";
import BotonGoogleTracker from "@/components/tracker/BotonGoogleTracker";
import { SITIO_URL } from "@/lib/sitio";
import { LogoTrackerApilado } from "@/components/MarcaTracker";

export const metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

/**
 * Entrar al tracker: sólo con Google, y sin formulario. Quien entra no es piloto, así que no hay
 * contraseña, alta ni nada de la bitácora. El piloto tiene que haberle mandado un link de invitación.
 */
export default function IngresarTracker() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center space-y-8 px-5 py-12">
      <div className="space-y-4">
        <LogoTrackerApilado className="h-14 w-auto" />
        <h1 className="text-4xl font-bold leading-tight tracking-tight">Seguí el vuelo de tu piloto</h1>
        <p className="text-lg leading-snug text-white/80">Mirá en un mapa dónde está el avión y a qué hora llega, y recibí un aviso cuando despega y cuando aterriza.</p>
      </div>
      <BotonGoogleTracker />
      <p className="text-base leading-snug text-white/60">Para ver vuelos, el piloto tiene que haberte mandado un link de invitación. Abrilo y entrá con Google.</p>
      <PegarInvitacion />
      <p className="border-t border-white/10 pt-5 text-base text-white/60">
        ¿Sos piloto?{" "}
        <a href={`${SITIO_URL}/login`} className="font-semibold text-white underline underline-offset-4">
          Entrá a Vector
        </a>
      </p>
    </div>
  );
}
