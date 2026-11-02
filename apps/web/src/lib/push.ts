/**
 * Los avisos push de la red, en lo que se puede decidir sin navegador: qué le mostramos
 * al piloto según lo que su teléfono permite, cómo se lee el aviso que manda el backend
 * (`services/avisos.py`) y a dónde lleva tocarlo.
 *
 * El componente (`AvisosPush`) y el service worker (`sw/sw.ts`) son plomería que no se
 * puede testear —vitest corre sin DOM—; el criterio vive acá, con sus tests.
 */

/**
 * Qué se le ofrece al piloto:
 *
 * - `instalar-app`: iPhone o iPad con Vector abierto en Safari. Ahí los avisos existen
 *   sólo con la app instalada en la pantalla de inicio (iOS 16.4 en adelante), así que
 *   se le explica cómo, en vez de esconder la opción.
 * - `sin-soporte`: el navegador no tiene push. No se muestra nada.
 * - `bloqueados`: el piloto los rechazó; sólo se destraban desde la configuración del
 *   sitio, y la app no puede volver a preguntar.
 * - `apagados` y `prendidos`: lo que se puede tocar.
 */
export type EstadoAvisos = "instalar-app" | "sin-soporte" | "bloqueados" | "apagados" | "prendidos";

export function estadoDeAvisos(e: {
  soportaPush: boolean;
  esIOS: boolean;
  instalada: boolean;
  permiso: "default" | "granted" | "denied";
  suscripto: boolean;
}): EstadoAvisos {
  if (e.esIOS && !e.instalada) return "instalar-app";
  if (!e.soportaPush) return "sin-soporte";
  if (e.permiso === "denied") return "bloqueados";
  return e.suscripto && e.permiso === "granted" ? "prendidos" : "apagados";
}

/**
 * Si es un iPhone o un iPad. El iPad con iPadOS se presenta como una Mac: lo delata que
 * tenga pantalla táctil.
 */
export function esDispositivoIOS(userAgent: string, plataforma: string, puntosDeToque: number): boolean {
  return /iPad|iPhone|iPod/.test(userAgent) || (plataforma === "MacIntel" && puntosDeToque > 1);
}

/** La clave pública VAPID (base64url) como la pide `pushManager.subscribe`. */
export function claveDeAplicacion(base64url: string): Uint8Array {
  const relleno = "=".repeat((4 - (base64url.length % 4)) % 4);
  const binario = atob((base64url + relleno).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binario, (c) => c.charCodeAt(0));
}

const DESTINO_POR_DEFECTO = "/dashboard/pilotos/actividad";

/**
 * A dónde lleva tocar un aviso. **Sólo rutas de Vector**: aunque el backend es nuestro,
 * el service worker no abre nada que no empiece con una sola barra.
 */
export function destinoDelAviso(url: unknown): string {
  if (typeof url !== "string" || !url.startsWith("/") || url.startsWith("//") || url.startsWith("/\\")) {
    return DESTINO_POR_DEFECTO;
  }
  return url;
}

export interface AvisoPush {
  titulo: string;
  cuerpo: string;
  url: string;
  /** Agrupa: un aviso nuevo con la misma etiqueta reemplaza al anterior. */
  etiqueta?: string;
}

/** El aviso que manda el backend, o uno genérico si llega algo que no se entiende. */
export function leerAviso(texto: string | null | undefined): AvisoPush {
  try {
    const d = JSON.parse(texto ?? "") as Record<string, unknown> | null;
    if (d && typeof d.titulo === "string" && d.titulo.trim()) {
      return {
        titulo: d.titulo,
        cuerpo: typeof d.cuerpo === "string" ? d.cuerpo : "",
        url: destinoDelAviso(d.url),
        etiqueta: typeof d.etiqueta === "string" && d.etiqueta ? d.etiqueta : undefined,
      };
    }
  } catch {
    // Un aviso que no se entiende igual avisa: mejor genérico que ninguno.
  }
  return { titulo: "Vector", cuerpo: "Tenés novedades en tu red.", url: DESTINO_POR_DEFECTO };
}
