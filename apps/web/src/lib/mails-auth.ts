/**
 * Los mails que manda Supabase Auth —confirmar el mail y recuperar la contraseña— con
 * la misma plantilla que los de Vector (`lib/mail-plantilla.ts`).
 *
 * **No los manda esta app:** los manda Supabase, con la plantilla que tenga cargada en
 * el panel (*Authentication → Emails*). Esto arma ese HTML para pegarlo ahí;
 * `npm run build:mails-auth` lo escribe en `docs/mails-supabase/`. La API de
 * configuración de Supabase pide un token de administrador de la cuenta, que esta app
 * no tiene ni debe tener, así que el último paso es a mano.
 *
 * **El link es `{{ .ConfirmationURL }}`, tal cual lo usan las plantillas de Supabase.**
 * Supabase lo reemplaza por un link que ya trae el `redirect_to` que pidió el backend
 * (`/update-password` en el reset). Armar el link a mano con `{{ .TokenHash }}` exigiría
 * otra ruta de verificación en esta app: no se toca lo que funciona.
 *
 * Sólo estos dos: el backend no usa el cambio de mail, el magic link ni las invitaciones
 * (`controllers/auth.py`).
 */
import { FUENTE, GRIS, GRIS_CLARO, boton, ejemploDelInicio, parrafo, plantillaMail } from "./mail-plantilla";

/** La variable de Supabase (Go templates). No se escapa ni se toca. */
export const LINK_SUPABASE = "{{ .ConfirmationURL }}";

export interface MailAuth {
  /** Para el campo "Subject" del panel. */
  asunto: string;
  /** Para el campo "Message body" del panel. */
  html: string;
}

/** "Si el botón no anda": el link a la vista, para copiarlo. */
function linkDeRespaldo(): string {
  return `<p style="margin:16px 0 0;font-family:${FUENTE};font-size:12px;line-height:1.6;color:${GRIS}">Si el botón no funciona, copiá este link en el navegador:</p>
<p style="margin:4px 0 0;font-family:${FUENTE};font-size:12px;line-height:1.5;word-break:break-all"><a href="${LINK_SUPABASE}" style="color:${GRIS_CLARO}">${LINK_SUPABASE}</a></p>`;
}

export function mailConfirmarCuenta(appUrl: string): MailAuth {
  return {
    asunto: "Confirmá tu mail para Vector",
    html: plantillaMail({
      appUrl,
      preencabezado: "Un toque y armás tu bitácora: licencia, CMA, avión y tu @.",
      pildora: "Confirmá tu mail",
      titulo: ["Ya casi estás en Vector.", "Confirmá tu mail."],
      cuerpo: [
        parrafo(
          "Tocá el botón para confirmar que este mail es tuyo. Después armás tu bitácora en un par de minutos: tu licencia, tu CMA, tu avión y tu @."
        ),
        boton("Confirmar mi mail", LINK_SUPABASE),
        `<div style="height:18px;line-height:18px">&nbsp;</div>`,
        ejemploDelInicio(),
        linkDeRespaldo(),
      ].join("\n"),
      pie: "Si no te registraste en Vector, ignorá este mail: sin confirmar, la cuenta no se activa.",
    }),
  };
}

export function mailRecuperarContrasena(appUrl: string): MailAuth {
  return {
    asunto: "Cambiá tu contraseña",
    html: plantillaMail({
      appUrl,
      preencabezado: "Tocá el botón y elegí una contraseña nueva. Si no lo pediste, ignorá este mail.",
      pildora: "Tu contraseña",
      titulo: ["¿Olvidaste tu contraseña?", "Elegí una nueva."],
      cuerpo: [
        parrafo(
          "Pediste cambiar la contraseña de tu cuenta en Vector. Tocá el botón y elegí una nueva. El link sirve una sola vez y vence al rato: si venció, pedí otro desde la pantalla de ingreso."
        ),
        boton("Elegir una contraseña nueva", LINK_SUPABASE),
        linkDeRespaldo(),
      ].join("\n"),
      pie: "Si no lo pediste vos, ignorá este mail: tu contraseña no cambia.",
    }),
  };
}
