import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { getSessionToken } from "@/actions/auth";
import { LogoTracker } from "@/components/MarcaTracker";
import InstalarTracker from "@/components/tracker/InstalarTracker";
import { apiFetch } from "@/lib/api";

/**
 * Vector Tracker (tracker.vectoraero.ar, migración 056 del backend): la interfaz de quien **sigue** los
 * vuelos de un piloto sin serlo. Es la misma app Next: `src/proxy.ts` reescribe a este árbol las rutas
 * del host `tracker.`, así que acá nada se llama `/tracker` para quien lo usa (`/`, `/vuelo/<token>`,
 * `/ingresar`, `/invitacion/<token>`). Del host principal, `/tracker/…` es un 404.
 *
 * - Sin la barra de Vector ni el dashboard: un encabezado mínimo con la marca y la cuenta. **Nunca
 *   manda a `/dashboard`** (el proxy lo redirige a la web); un familiar no pasa por el alta de piloto.
 * - Pensado primero para el teléfono de alguien que no es piloto: letra grande, lenguaje simple.
 * - `noindex`, y fuera de `robots` y del `sitemap`.
 * - Sólo oscuro, como todo Vector (`forcedTheme` en el layout raíz).
 */

export const metadata: Metadata = {
  title: { default: "Vector Tracker", template: "%s | Vector Tracker" },
  description: "Seguí los vuelos de tu piloto en vivo, con aviso cuando despega y cuando aterriza.",
  applicationName: "Vector Tracker",
  // Explícito: las páginas que no lo cambian (todas menos la invitación) usan el manifest de siempre.
  manifest: "/manifest.webmanifest",
  // La flecha con la estela (`generar-tracker.mjs`), no la de Vector: es otra app en el inicio del teléfono.
  icons: { icon: [{ url: "/marca/tracker-icono-app.svg", type: "image/svg+xml" }], apple: "/tracker/apple-touch-icon.png" },
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Vector Tracker", statusBarStyle: "black-translucent" },
  openGraph: { title: "Vector Tracker", description: "Seguí los vuelos de tu piloto en vivo.", siteName: "Vector Tracker", locale: "es_AR", type: "website" },
};

export const viewport: Viewport = { themeColor: "#0b0d10", viewportFit: "cover" };

async function nombreDeLaCuenta(): Promise<string | null> {
  try {
    const res = await apiFetch("/profiles", { cache: "no-store" });
    if (!res.ok) return null;
    const perfiles = (await res.json()) as { first_name?: string }[];
    return perfiles[0]?.first_name?.trim() || null;
  } catch {
    return null;
  }
}

export default async function TrackerLayout({ children }: { children: React.ReactNode }) {
  const hayCuenta = Boolean(await getSessionToken());
  const nombre = hayCuenta ? await nombreDeLaCuenta() : null;

  return (
    <div className="dark min-h-dvh w-full bg-noche text-white">
      {/* En el teléfono fuera de la app instalada se ve InstalarTracker en vez de esto (globals.css). */}
      <div className="tracker-app flex min-h-dvh w-full flex-col">
      <header className="sticky top-0 z-[600] flex h-14 shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-noche/95 px-5 pt-[env(safe-area-inset-top)] backdrop-blur" style={{ height: "calc(3.5rem + env(safe-area-inset-top))" }}>
        <Link href="/" className="flex items-center" aria-label="Vector Tracker, inicio">
          <LogoTracker className="h-6 w-auto" />
        </Link>
        {hayCuenta && (
          <div className="flex items-center gap-4 text-sm">
            {nombre && <span className="max-w-[9rem] truncate font-semibold text-white/80">{nombre}</span>}
            <a href="/api/auth/logout?redirect=/ingresar" className="inline-flex min-h-11 items-center font-mono text-[11px] font-bold uppercase tracking-wider text-white/60 underline underline-offset-4 hover:text-white">
              Salir
            </a>
          </div>
        )}
      </header>
      <div className="flex w-full flex-1 flex-col">{children}</div>
      </div>
      <InstalarTracker />
    </div>
  );
}
