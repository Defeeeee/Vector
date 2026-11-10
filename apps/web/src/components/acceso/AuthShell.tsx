import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import { LogoVector } from "@/components/Marca";
import VideoHero from "@/components/publico/VideoHero";

/**
 * Las pantallas de acceso (3.13.0): ingresar, crear cuenta, recuperar y cambiar la contraseña,
 * con la estética de la landing. A la izquierda el formulario sobre la noche; a la derecha, en la
 * compu, el video del hero con la frase de la landing. En el teléfono, sólo el formulario.
 *
 * El panel del video no lleva ningún dato del piloto: se dibuja antes de que haya sesión.
 */
export default function AuthShell({
  rotulo,
  titulo,
  bajada,
  children,
  pie,
  volverA = "/",
}: {
  rotulo: string;
  titulo: ReactNode;
  bajada?: ReactNode;
  children: ReactNode;
  pie?: ReactNode;
  volverA?: string;
}) {
  return (
    <div className="dark min-h-dvh w-full bg-noche text-white flex items-start">
      <div className="relative flex flex-col min-h-dvh w-full lg:w-[min(560px,46%)] shrink-0 px-6 sm:px-10 lg:px-14 xl:px-16 py-8">
        <Link href={volverA} aria-label="Volver" className="self-start">
          <LogoVector sobreOscuro className="h-7 w-auto" />
        </Link>

        <div className="flex-1 flex flex-col justify-center py-12 w-full max-w-[420px] mx-auto lg:mx-0">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-aviation-cyan mb-5">{rotulo}</p>
          <h1 className="font-display font-extrabold tracking-[-0.045em] leading-[0.95] text-[clamp(40px,5vw,56px)] text-balance">{titulo}</h1>
          {bajada && <p className="mt-4 text-[15px] leading-relaxed text-niebla">{bajada}</p>}
          <div className="mt-10">{children}</div>
          {pie && <div className="mt-10 pt-6 border-t border-white/10 text-sm text-niebla space-y-3">{pie}</div>}
        </div>

        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-600">Bitácora de vuelo · Argentina</p>
      </div>

      <div className="hidden lg:flex sticky top-0 h-dvh flex-1 isolate overflow-hidden border-l border-white/10">
        <VideoHero className="absolute inset-0 -z-10 h-full w-full object-cover opacity-70" />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-noche via-noche/40 to-noche/10" />
        <div aria-hidden="true" className="absolute inset-y-0 left-0 w-40 -z-10 bg-gradient-to-r from-noche to-transparent" />
        <div className="mt-auto p-14 xl:p-16 max-w-2xl">
          <p className="font-display font-extrabold tracking-[-0.04em] leading-[0.95] text-[clamp(40px,4.4vw,68px)] text-balance">
            Tu bitácora de vuelo, <span className="text-aviation-cyan">siempre al día.</span>
          </p>
          <div className="mt-8 flex items-center gap-4 font-mono text-sm text-zinc-300">
            <span>SADF</span>
            <span className="flex-1 max-w-48 border-t border-dashed border-white/30" />
            <span className="text-aviation-cyan">045°</span>
            <span className="flex-1 max-w-48 border-t border-dashed border-white/30" />
            <span>SADM</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Un campo de las pantallas de acceso: rótulo en mono, ícono, y el borde cian al enfocarlo. */
export function CampoAuth({
  rotulo,
  icono: Icono,
  ...input
}: { rotulo: string; icono: LucideIcon } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block group">
      <span className="block font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-500 group-focus-within:text-white transition-colors mb-2">{rotulo}</span>
      <span className="relative block">
        <Icono className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-aviation-cyan transition-colors" />
        <input
          {...input}
          className="w-full rounded-xl bg-carbon border border-white/10 py-4 pl-11 pr-4 text-[15px] text-white placeholder:text-zinc-600 outline-none focus:border-aviation-cyan focus:ring-2 focus:ring-aviation-cyan/20 transition-colors"
        />
      </span>
    </label>
  );
}

/** El botón principal: la píldora cian de la landing. */
export function BotonAuth({ children, pendiente, disabled }: { children: ReactNode; pendiente?: boolean; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled || pendiente}
      className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-aviation-cyan text-noche font-bold text-[15px] py-4 hover:bg-sky-300 transition-colors disabled:opacity-50"
    >
      {pendiente ? <Loader2 className="w-5 h-5 animate-spin" /> : children}
    </button>
  );
}

export function ErrorAuth({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-300">
      {children}
    </p>
  );
}
