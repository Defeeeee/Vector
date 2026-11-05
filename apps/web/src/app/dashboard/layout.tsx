import { Plus } from "lucide-react";
import Link from "next/link";
import DashboardNav, { type AlertasDeSeccion } from "@/components/dashboard/DashboardNav";
import SeccionTabs from "@/components/dashboard/SeccionTabs";
import OnboardingOverlay from "@/components/dashboard/OnboardingOverlay";
import BuscadorGlobal from "@/components/dashboard/BuscadorGlobal";
import { LogoutButton } from "@/components/dashboard/LogoutButton";
import ActualizarDatos from "@/components/dashboard/ActualizarDatos";
import TituloTelefono from "@/components/dashboard/TituloTelefono";
import { apiFetch } from "@/lib/api";
import { leerResumenSocial } from "@/lib/resumen-social";
import { AuditSummary, Profile } from "@/types";
import { AUDITORIA_HREF, ACTIVIDAD_HREF } from "@/lib/secciones";
import SinConexionBanner from "@/components/dashboard/SinConexionBanner";
import VistoPorUltimaVez from "@/components/dashboard/VistoPorUltimaVez";
import { AvisosProvider } from "@/components/dashboard/Avisos";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { COOKIE_ALTA, type EstadoAlta } from "@/lib/onboarding";
import { COOKIE_QR } from "@/lib/pegatinas";
import AnotarOrigenQr from "@/components/dashboard/AnotarOrigenQr";
import SincronizarCad from "@/components/dashboard/cad/SincronizarCad";
import { Isotipo, LogoVector, Logotipo } from "@/components/Marca";

/**
 * El perfil, y si se pudo preguntar por él.
 *
 * Devuelve las dos cosas y no sólo el perfil porque **`null` es ambiguo**: puede ser
 * un piloto sin perfil o un servidor que no contestó. Es la misma distinción que
 * `unavailable` hace en `dashboard/page.tsx`, y acá importa igual: sin ella el
 * dashboard se dibuja en cero y el piloto no tiene forma de saber si perdió sus
 * datos o si perdió la señal.
 *
 * Ya no puede tirar: `apiFetch` devuelve un 503 sintético ante fallo de red en vez
 * de propagar la excepción. Antes, un corte de red acá reventaba el layout y con él
 * **las trece páginas del dashboard**.
 */
async function getProfile(): Promise<{ profile: Profile | null; disponible: boolean }> {
  const res = await apiFetch("/profiles");
  if (res.status === 401) {
    console.log("DashboardLayout: 401 Unauthorized. Logging out...");
    redirect("/api/auth/logout?redirect=/?expired=true");
  }
  if (!res.ok) return { profile: null, disponible: false };
  try {
    const profiles: Profile[] = await res.json();
    return { profile: profiles[0] || null, disponible: true };
  } catch {
    // 200 con cuerpo ilegible: se pudo llegar, no se pudo entender. Cuenta como
    // no disponible, que es lo único honesto.
    return { profile: null, disponible: false };
  }
}

/**
 * Open-findings count for the nav badge.
 *
 * Lives in the layout so the badge is present on every dashboard page, not just
 * the audit one. Failures are swallowed to zero on purpose: a badge is not
 * worth taking the whole dashboard shell down for.
 */
async function getAuditCount(): Promise<number> {
  try {
    const res = await apiFetch("/audit/summary");
    if (!res.ok) return 0;
    const summary: AuditSummary = await res.json();
    return summary.open_total ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Qué pasos del alta tiene hechos el piloto. **Sin cache**: el paso que se acaba de
 * completar tiene que dejar de pedirse en la pantalla siguiente, y los GET de `apiFetch`
 * se guardan 20 s. `null` si no se pudo leer: "no sé" no bloquea a nadie.
 */
async function leerEstadoAlta(): Promise<EstadoAlta | null> {
  const res = await apiFetch("/onboarding/estado", { next: { revalidate: 0 } });
  if (!res.ok) return null;
  try {
    return (await res.json()) as EstadoAlta;
  } catch {
    return null;
  }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Quien ya terminó el alta en este navegador tiene la cookie con su id: no se le
  // pregunta al backend en cada pantalla. El resto, sí (el alta es obligatoria).
  const almacen = await cookies();
  const altaHecha = almacen.get(COOKIE_ALTA)?.value ?? null;
  // Llegó por una pegatina con QR: se anota desde el navegador (`AnotarOrigenQr`).
  const vinoPorQr = Boolean(almacen.get(COOKIE_QR)?.value);
  const [{ profile, disponible }, auditCount, social, estadoPrevio] = await Promise.all([
    getProfile(),
    getAuditCount(),
    // Si tiene @, su foto y el punto rojo de Pilotos. Lo comparten las pantallas de la
    // red (`cache` de React): es un solo pedido por render. Nunca tira.
    leerResumenSocial(),
    altaHecha ? Promise.resolve(null) : leerEstadoAlta(),
  ]);
  // La cookie es de otra cuenta (entró otra persona en el mismo navegador): se pregunta.
  const estadoAlta =
    altaHecha && profile && altaHecha !== profile.id ? await leerEstadoAlta() : estadoPrevio;
  const saltearAlta = !!altaHecha && altaHecha === profile?.id;
  // Solicitudes sin responder más lo nuevo desde que abrió la Actividad. No se pisan:
  // `actividad_nueva` no cuenta las solicitudes pendientes.
  const totalPilotos = social.solicitudes_pendientes + social.actividad_nueva;
  const alertas: AlertasDeSeccion = {
    bitacora: { cantidad: auditCount, texto: `${auditCount} en auditoría` },
    pilotos: {
      cantidad: totalPilotos,
      texto: `${totalPilotos} ${totalPilotos === 1 ? "novedad" : "novedades"}`,
    },
  };
  const contadores = { [AUDITORIA_HREF]: auditCount, [ACTIVIDAD_HREF]: totalPilotos };
  const initials = `${profile?.first_name?.charAt(0) || ""}${profile?.last_name?.charAt(0) || ""}`;
  // La foto del @, si subió una; si no, las iniciales de siempre.
  const avatar = social.avatar_url ? (
    <img src={social.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
  ) : (
    initials
  );
  const today = new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  const todayCapitalized = today.charAt(0).toUpperCase() + today.slice(1);

  return (
    // Envuelve el layout entero y no sólo `{children}`: el aviso de "se guardó" se
    // dispara desde un formulario y tiene que seguir viéndose después de que ese
    // formulario navega a otra pantalla.
    <AvisosProvider>
    <div className="flex min-h-screen bg-zinc-50 max-lg:app:bg-zinc-100 dark:bg-black max-lg:app:dark:bg-black w-full relative text-zinc-900 dark:text-white antialiased transition-colors duration-300">
      {/* Subtle Background Pattern */}
      

      {/*
        La barra del escritorio (3.11.0): azul noche, para separarla del contenido. Ocupa 80 px y,
        al pasar el mouse o al llegar con el teclado (`:focus-visible`, no el foco que deja un click), se abre a 240 por encima del contenido (no lo
        empuja) y muestra los nombres, y al lado del isotipo la palabra "vector".
      */}
      <aside className="hidden lg:block w-20 h-screen sticky top-0 z-40 shrink-0">
        <div className="rail absolute inset-y-0 left-0 overflow-hidden bg-cabina border-r border-cabina-borde flex flex-col px-4 py-6">
          <Link href="/dashboard" aria-label="Vector, inicio" className="flex items-center gap-3 h-11 pl-[9px] mb-8 shrink-0 hover:opacity-80 transition-opacity">
            <Isotipo sobreOscuro className="w-[30px] h-[30px] shrink-0" />
            <Logotipo className="rail-rotulo h-[22px] w-auto shrink-0 text-white" />
          </Link>

          <div className="flex-1 flex flex-col justify-center">
            <DashboardNav variant="rail" alertas={alertas} />
          </div>

          <div className="flex flex-col gap-1 mt-auto">
            <Link
              href="/dashboard/log-flight"
              className="flex items-center gap-3 h-12 rounded-2xl px-3.5 mb-2 bg-aviation-cyan text-noche hover:bg-sky-300 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <Plus className="w-5 h-5 shrink-0" strokeWidth={2.5} />
              <span className="rail-rotulo text-sm font-bold">Registrar vuelo</span>
            </Link>
            <LogoutButton variant="rail" />
            {/* El avatar es la puerta al Hangar. */}
            <Link href="/dashboard/settings" className="group flex items-center gap-3 h-12 rounded-2xl px-2 hover:bg-white/5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-aviation-cyan">
              <span className="w-8 h-8 shrink-0 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-zinc-300">{avatar}</span>
              <span className="rail-rotulo text-sm font-semibold text-zinc-300 group-hover:text-white">Hangar</span>
            </Link>
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      {/*
        El encabezado del teléfono (3.4.0): el logo, el buscador y la cuenta; el tema y "Cerrar
        sesión" pasaron al Hangar. En el navegador, una barra blanca de 56 px. Instalada como app
        (`app:`), arranca debajo de la muesca, sin borde, suma el + de Nuevo vuelo (abajo hay una
        barra de pestañas y no la píldora) y en el inicio el logo deja lugar a "Hola" con la fecha
        (`TituloTelefono`). El contenido empieza donde dice el diseño (58 px, o la muesca, más 60:
        los 44 de los botones y 8 + 8 de aire), y el título va **centrado** entre el borde de arriba
        de la página (debajo de la barra de estado) y ese contenido (Federico, 3.4.1): con
        `statusBarStyle: "default"` iOS ya deja la barra de estado afuera, `safe-area-inset-top` vale
        0 y los 58 px del diseño, que la contaban, quedaban de más arriba. La cuenta, con S la muesca:
        el título arranca en (max(58, S + 12) + S + 16) / 2; con S = 0, 37 px arriba y 37 abajo. El
        encabezado sigue llegando hasta 8 px antes del contenido, que pasa por debajo al scrollear.
        En el inicio el saludo mide 57 y no 44: la página baja 13 px más y los botones también
        (`data-titulo-inicio`), así el saludo queda centrado igual y los botones al ras de "Hola".
      */}
      <header className="lg:hidden [body:has([data-sin-encabezado-movil])_&]:hidden fixed top-0 w-full z-40 bg-white dark:bg-black app:bg-zinc-100 app:dark:bg-black app:backdrop-blur-none backdrop-blur-xl border-b border-zinc-200 dark:border-white/10 app:border-b-0 h-14 app:h-[calc(max(58px,calc(env(safe-area-inset-top)_+_0.75rem))_+_3.25rem)] px-4 app:pt-[calc((max(58px,calc(env(safe-area-inset-top)_+_0.75rem))_+_env(safe-area-inset-top)_+_16px)_/_2)] app:pb-0 flex items-center app:items-start justify-between gap-2 transition-colors duration-300">
        <TituloTelefono fecha={todayCapitalized.replace(",", "")} nombre={profile?.first_name || "Comandante"}>
        <Link href="/dashboard" className="flex items-center space-x-3 group app:h-11">
          <LogoVector className="h-6 w-auto" />
        </Link>
        </TituloTelefono>
        <div className="flex items-center gap-2 shrink-0 app:[body:has([data-titulo-inicio])_&]:mt-[13px]">
            <BuscadorGlobal variante="icono" />
            <Link
              href="/dashboard/log-flight"
              aria-label="Nuevo vuelo"
              className="hidden app:flex w-11 h-11 rounded-full bg-aviation-blue text-white items-center justify-center shadow-md shadow-aviation-blue/30 active:scale-95 transition-transform"
            >
              <Plus className="w-5 h-5" strokeWidth={2.5} />
            </Link>
            {/* En el teléfono no hay rail, así que el avatar vive acá. Sin esto,
                sacar Hangar del nav lo dejaba sin ninguna entrada en móvil: caía
                en el sheet de "Más" y de ahí desaparecía. */}
            <Link
              href="/dashboard/settings"
              aria-label="Hangar"
              className="w-9 h-9 app:w-11 app:h-11 rounded-full bg-zinc-100 dark:bg-white/10 app:bg-white app:dark:bg-zinc-900 app:shadow-sm flex items-center justify-center text-[11px] font-bold text-zinc-600 dark:text-zinc-300 overflow-hidden"
            >
              {avatar}
            </Link>
        </div>
      </header>

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0 lg:h-screen">
        {/* Desktop Top Bar */}
        <header className="hidden lg:flex items-center justify-between h-16 px-8 border-b border-zinc-200 dark:border-white/10 bg-white/70 dark:bg-black/40 backdrop-blur-xl z-20 shrink-0">
          <p className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 tracking-wide">{todayCapitalized}</p>
          <BuscadorGlobal variante="barra" />
          <Link
            href="/dashboard/settings"
            title="Hangar"
            className="flex items-center gap-2.5 rounded-full pr-2 hover:bg-zinc-100 dark:hover:bg-white/5 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-white/10 flex items-center justify-center text-xs font-bold text-zinc-600 dark:text-zinc-300 overflow-hidden">
              {avatar}
            </div>
            <span className="text-sm font-semibold text-zinc-900 dark:text-white">{profile?.first_name}</span>
          </Link>
        </header>

        {/* Main Content Area */}
        <main className="relative z-10 flex-1 w-full p-4 md:p-8 lg:p-12 pt-[4.5rem] app:pt-[calc(max(58px,calc(env(safe-area-inset-top)+0.75rem))+3.75rem)] lg:pt-12 pb-[calc(7rem+env(safe-area-inset-bottom))] app:pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-12 overflow-y-auto custom-scrollbar transition-colors">
          <div className="w-full max-w-6xl mx-auto">
            {/* Las pestañas de la sección van antes que los carteles: son
                navegación y no datos, y así no cambian de lugar cuando aparece
                un cartel. */}
            <SeccionTabs contadores={contadores} />
            {/* Arriba de todo lo demás: si la consulta base falló, el piloto
                tiene que enterarse antes de leer un solo número de la pantalla. */}
            {!disponible && <SinConexionBanner />}
            {/*
              Los dos carteles contestan preguntas distintas y pueden aparecer juntos.
              `SinConexionBanner` dice **que no pudimos preguntar**; éste dice **de
              cuándo es lo que estás viendo**. El segundo sólo aparece cuando la página
              se sirvió desde el teléfono, y se calcula en el cliente leyendo el cache.
            */}
            <VistoPorUltimaVez />
            {children}
          </div>
        </main>
      </div>

      {/*
        El pie del teléfono: la píldora de las secciones y, al lado, "Nuevo vuelo". Una sola
        fila, a la misma altura. Hasta el 2026-11-02 el + compartía una píldora con el
        copiloto y la navegación le dejaba 9,5rem; el copiloto ahora vive en la lupa (⌘K).
      */}
      <div
        data-imprimir="no"
        className="lg:hidden [body:has([data-sin-barra-movil])_&]:hidden fixed inset-x-3 bottom-[calc(1rem+env(safe-area-inset-bottom))] app:inset-x-0 app:bottom-0 z-50 flex items-center gap-2.5 pointer-events-none"
      >
        <div className="flex-1 min-w-0 pointer-events-auto">
          <DashboardNav variant="mobile" alertas={alertas} />
        </div>
        <Link
          href="/dashboard/log-flight"
          aria-label="Nuevo vuelo"
          className="app:hidden pointer-events-auto shrink-0 w-[60px] h-[60px] rounded-full bg-aviation-blue text-white flex items-center justify-center shadow-lg shadow-aviation-blue/30 transition-transform active:scale-95"
        >
          <Plus className="w-6 h-6" strokeWidth={2.5} />
        </Link>
      </div>

      {/* Onboarding Logic */}
      {!saltearAlta && <OnboardingOverlay profile={profile} estado={estadoAlta} />}

      {vinoPorQr && <AnotarOrigenQr />}
      {/* El CAD al día, en segundo plano: sólo con la cuenta de ANAC conectada y cada 12 h. */}
      <SincronizarCad />
      {/* Los datos al día: al volver a la app, cada 5 minutos y tirando hacia abajo (3.7.0). */}
      <ActualizarDatos servido={Date.now()} />
    </div>
    </AvisosProvider>
  );
}
