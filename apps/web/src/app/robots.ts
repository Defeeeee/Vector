import type { MetadataRoute } from "next";
import { SITIO_URL } from "@/lib/sitio";

/**
 * Qué recorren los buscadores. Lo privado (el dashboard, la API, el login con OAuth) no
 * tiene nada que indexar. **`/u/` no se bloquea acá a propósito:** los perfiles llevan
 * `noindex` en la página, y un buscador tiene que poder entrar para leerlo; además,
 * bloquearlo cortaría la vista previa de WhatsApp de los links que comparten los pilotos.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/dashboard", "/api/", "/auth/"] }],
    sitemap: `${SITIO_URL}/sitemap.xml`,
    host: SITIO_URL,
  };
}
