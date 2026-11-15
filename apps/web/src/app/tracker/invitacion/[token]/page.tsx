import Link from "next/link";
import { getSessionToken } from "@/actions/auth";
import AceptarInvitacion from "@/components/tracker/AceptarInvitacion";
import BotonGoogleTracker from "@/components/tracker/BotonGoogleTracker";
import { apiFetch } from "@/lib/api";
import { tokenValido } from "@/lib/seguimiento";

export const metadata = { title: "Invitación" };
export const dynamic = "force-dynamic";

/**
 * El link de invitación (`/invitacion/<token>`, de un solo uso, vence a los 7 días): "Federico te invitó a
 * seguir sus vuelos". Se abre sin cuenta y sólo dice el nombre de pila del piloto (`GET
 * /publico/tracker/invitaciones/{token}`). Sin sesión: "Entrar con Google" y de vuelta acá; con sesión:
 * "Aceptar". Un link usado, vencido o inventado dice lo mismo, sin distinguir.
 */
export default async function InvitacionTracker({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let piloto: string | null = null;
  if (tokenValido(token)) {
    const res = await apiFetch(`/publico/tracker/invitaciones/${token}`, { cache: "no-store" }, { anonimo: true }).catch(() => null);
    if (res?.ok) {
      const d = (await res.json().catch(() => null)) as { vigente?: boolean; nombre?: string | null } | null;
      if (d?.vigente) piloto = d.nombre || "Un piloto";
    }
  }
  const hayCuenta = Boolean(await getSessionToken());

  if (!piloto) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center space-y-6 px-5 py-12">
        <h1 className="text-4xl font-bold leading-tight tracking-tight">Esta invitación ya no sirve</h1>
        <p className="text-lg leading-snug text-white/80">El link ya se usó o venció (duran 7 días y sirven una sola vez). Pedile al piloto que te mande uno nuevo.</p>
        {hayCuenta && (
          <Link href="/" className="inline-flex min-h-12 items-center font-semibold text-aviation-cyan underline underline-offset-4">
            Ir a mis vuelos
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center space-y-8 px-5 py-12">
      <div className="space-y-4">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.14em] text-aviation-cyan">Vector Tracker</p>
        <h1 className="text-4xl font-bold leading-tight tracking-tight">{piloto} te invitó a seguir sus vuelos</h1>
        <p className="text-lg leading-snug text-white/80">Vas a ver en un mapa dónde está el avión y a qué hora llega, y te avisamos cuando despega y cuando aterriza. {piloto} elige qué vuelos ves, y te puede quitar cuando quiera.</p>
      </div>
      {hayCuenta ? <AceptarInvitacion token={token} piloto={piloto} /> : <BotonGoogleTracker volver={`/invitacion/${token}`} texto="Entrar con Google para aceptar" />}
      <p className="text-sm leading-snug text-white/50">El piloto sólo ve tu nombre de pila. No se publica nada tuyo.</p>
    </div>
  );
}
