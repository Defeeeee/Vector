import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/ThemeProvider";
import NextTopLoader from "nextjs-toploader";
import ServiceWorkerVector from "@/components/ServiceWorkerVector";
import PixelMeta from "@/components/PixelMeta";
import { SITIO_URL } from "@/lib/sitio";

// Single unified typeface across the app for both body text and display/headline roles:
// **Plus Jakarta Sans** desde la 3.4.0 (Federico, 2026-11-03). Hasta ahí fue Nunito, cuyos remates
// redondeados se notaban en los títulos y las negritas; Plus Jakarta se eligió entre seis
// (Figtree, Manrope, Onest, Inter Tight) mirando el inicio del teléfono. Pesa 200–800: un
// `font-black` (900) cae en 800.
//
// **Las fuentes están en el repo** (`src/app/fonts/`, de Fontsource, OFL), desde la 3.3.1. Antes
// salían de `next/font/google`, que las baja de Google en cada build: el 2026-11-03 ese pedido
// cortó tres builds (uno en el CI y dos en el VPS, que volvieron solos al anterior). Son los
// mismos archivos que daba Google (la sans variable, IBM Plex Mono 400–700), sólo el subconjunto latino, que
// trae las tildes, la ñ y los signos de apertura.
//
// The variables are named after the *role*, not the typeface: they used to be
// called --font-inter and --font-space-grotesk while actually carrying Nunito,
// which meant `font-display` in the markup applied something that was not
// Space Grotesk. Role names survive a change of face (see T3.2 in
// docs/brief/06-plan-post-flightdeck.md).
const bodyFace = localFont({
  src: "./fonts/plus-jakarta-sans-latin-wght-normal.woff2",
  weight: "200 800",
  variable: "--font-body-face",
});

const displayFace = localFont({
  src: "./fonts/plus-jakarta-sans-latin-wght-normal.woff2",
  weight: "200 800",
  variable: "--font-display-face",
});

// Instrument face for anything that reads as an *instrument reading* rather than
// prose: hours, ICAO codes, registrations, UTC times, METAR, eyebrow labels.
// IBM Plex Mono is picked for its slashed zero — in a logbook the difference
// between 0 and O is not a stylistic detail.
const monoFace = localFont({
  src: [
    { path: "./fonts/ibm-plex-mono-latin-400-normal.woff2", weight: "400" },
    { path: "./fonts/ibm-plex-mono-latin-500-normal.woff2", weight: "500" },
    { path: "./fonts/ibm-plex-mono-latin-600-normal.woff2", weight: "600" },
    { path: "./fonts/ibm-plex-mono-latin-700-normal.woff2", weight: "700" },
  ],
  variable: "--font-mono-face",
});

/**
 * Lo de todas las páginas. `metadataBase` hace absolutas las URLs de las vistas previas
 * y de lo canónico; sin él, WhatsApp y los buscadores reciben rutas sueltas. Las
 * páginas públicas ponen su título y su descripción; las del dashboard, el suyo.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITIO_URL),
  title: "Vector — Bitácora de vuelo digital para pilotos",
  description:
    "La bitácora de vuelo digital para pilotos argentinos: el desglose de la hoja, tus vencimientos, tu camino a la PCA y el libro en PDF para firmar.",
  applicationName: "Vector",
  // Los dos los toma iOS, que no lee el manifest para esto.
  appleWebApp: { capable: true, title: "Vector", statusBarStyle: "default" },
  openGraph: { siteName: "Vector", locale: "es_AR", type: "website" },
  twitter: { card: "summary_large_image" },
};

/**
 * El color de la barra del navegador, declarado **dos veces a propósito**.
 *
 * El manifest sólo admite un `theme_color` y esta app tiene dos fondos —blanco en
 * claro, negro en oscuro—, así que un color fijo pinta mal la mitad del tiempo. Acá
 * sí se puede condicionar por `prefers-color-scheme`, y por eso el color vive de
 * este lado y no en `manifest.ts`.
 *
 * `viewportFit: "cover"` es lo que hace que en `standalone` la app llegue hasta el
 * borde en los teléfonos con muesca, en vez de dejar dos franjas.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    /* The font variables have to live on <html>, not <body>: `@theme` emits its
       tokens on :root, so a `--font-sans: var(--font-body-face)` there resolves
       against :root — and with the variable declared on <body> it resolved
       against nothing and came out invalid. That silently broke the `font-sans`
       and `font-mono` utilities app-wide (only the custom `font-display`
       worked, because it reads the variable at the element that uses it). */
    <html
      lang="es-AR"
      suppressHydrationWarning
      className={cn(bodyFace.variable, displayFace.variable, monoFace.variable)}
    >
      <body className="min-h-screen bg-white dark:bg-black text-charcoal dark:text-white antialiased overflow-x-hidden font-sans">
        <NextTopLoader
          color="#18181b"
          initialPosition={0.08}
          crawlSpeed={200}
          height={3}
          crawl={true}
          showSpinner={false}
          easing="ease"
          speed={200}
          shadow="0 0 10px #18181b,0 0 5px #18181b"
        />
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <main className="relative flex min-h-screen flex-col items-center overflow-x-hidden">
            {children}
          </main>
          {/*
            Va en el layout raíz y no en el del dashboard: el service worker tiene
            alcance de origen entero, y sobre todo `?sw=reset` tiene que andar desde
            una pantalla que no sea el dashboard — si el dashboard es lo que quedó
            roto, el remedio no puede vivir adentro.
          */}
          <ServiceWorkerVector />
          {/* Sólo en la portada y las guías, y con consentimiento: ver `lib/pixel-meta.ts`. */}
          <PixelMeta />
        </ThemeProvider>
      </body>
    </html>
  );
}
