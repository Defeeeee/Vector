import type { MetadataRoute } from "next";
import { GUIAS, urlAbsoluta } from "@/lib/sitio";

/**
 * Lo que queremos que aparezca en los buscadores: la landing, las guías y lo legal. Los
 * perfiles de los pilotos no (llevan `noindex`: que alguien tenga un @ no es permiso
 * para que su nombre y sus horas salgan en Google), ni nada con sesión.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const ultimaGuia = GUIAS.map((g) => g.actualizada).sort().at(-1);
  return [
    { url: urlAbsoluta("/"), lastModified: "2026-09-23", changeFrequency: "weekly", priority: 1 },
    { url: urlAbsoluta("/guias"), lastModified: ultimaGuia, changeFrequency: "weekly", priority: 0.8 },
    ...GUIAS.map((g) => ({
      url: urlAbsoluta(`/guias/${g.slug}`),
      lastModified: g.actualizada,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    { url: urlAbsoluta("/legal/privacidad"), lastModified: "2026-09-23", changeFrequency: "yearly", priority: 0.2 },
    { url: urlAbsoluta("/legal/terminos"), lastModified: "2026-09-23", changeFrequency: "yearly", priority: 0.2 },
  ];
}
