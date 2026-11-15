import { desdeValido } from "@/lib/tracker-instalar";

/**
 * El manifest de Vector Tracker: para ponerlo en el inicio del teléfono. En el host del tracker
 * `/manifest.webmanifest` se reescribe acá (`src/proxy.ts`); en la web sigue siendo el de Vector.
 * `start_url` es `/` del tracker (o la invitación desde la que se instaló, `?desde=`): con sesión, la lista de vuelos; sin ella, la pantalla de ingreso.
 */
export function GET(request: Request) {
  // Al instalar desde una invitación, la app abre en ella (`?desde=`): sólo con la forma de una invitación.
  const desde = desdeValido(new URL(request.url).searchParams.get("desde"));
  return Response.json(
    {
      name: "Vector Tracker",
      short_name: "Tracker",
      description: "Seguí los vuelos de tu piloto en vivo, con aviso cuando despega y cuando aterriza.",
      id: "/",
      start_url: desde ?? "/",
      scope: "/",
      display: "standalone",
      background_color: "#0b0d10",
      theme_color: "#0b0d10",
      lang: "es-AR",
      icons: [
        { src: "/tracker/icono-192.png", sizes: "192x192", type: "image/png" },
        { src: "/tracker/icono-512.png", sizes: "512x512", type: "image/png" },
        { src: "/tracker/icono-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": desde ? "private, no-store" : "public, max-age=3600" } }
  );
}
