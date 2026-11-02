/**
 * Sube los mails de Supabase Auth (asunto y cuerpo) al proyecto, por la API de gestión.
 * Es lo mismo que pegarlos en el panel (Authentication → Emails), sin copiar y pegar.
 *
 *   SUPABASE_ACCESS_TOKEN=... npm run subir:mails-auth
 *
 * El token es uno personal de la cuenta de Supabase (dashboard → Account → Access
 * Tokens). No se guarda en el repo ni en el VPS: se crea para esto y se borra después.
 *
 * **Por qué existe:** el 2026-09-30 las plantillas estaban bien guardadas en el panel y
 * Supabase igual mandaba las de fábrica. Se habían guardado antes de activar el SMTP
 * propio, y el servidor de auth nunca las recibió. Volver a guardarlas por esta API
 * obligó a recargarlo (ver la bitácora de ese día).
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const PROYECTO = process.env.SUPABASE_PROJECT_REF || "jkmcdbihjqkgizekzlun";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://vector.fdiaznem.com.ar";
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
if (!token) {
  console.error("Falta SUPABASE_ACCESS_TOKEN (un token personal de la cuenta de Supabase).");
  process.exit(1);
}

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url, { alias: { "@": join(RAIZ, "src") } });
const { mailConfirmarCuenta, mailRecuperarContrasena } = await jiti.import(join(RAIZ, "src/lib/mails-auth.ts"));

const confirmar = mailConfirmarCuenta(APP_URL);
const recuperar = mailRecuperarContrasena(APP_URL);

const res = await fetch(`https://api.supabase.com/v1/projects/${PROYECTO}/config/auth`, {
  method: "PATCH",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    mailer_subjects_confirmation: confirmar.asunto,
    mailer_templates_confirmation_content: confirmar.html,
    mailer_subjects_recovery: recuperar.asunto,
    mailer_templates_recovery_content: recuperar.html,
  }),
});
if (!res.ok) {
  console.error(`Supabase contestó ${res.status}: ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}
const d = await res.json();
console.log(`confirmar: "${d.mailer_subjects_confirmation}" (${d.mailer_templates_confirmation_content.length} caracteres)`);
console.log(`recuperar: "${d.mailer_subjects_recovery}" (${d.mailer_templates_recovery_content.length} caracteres)`);
console.log("Supabase recarga el servidor de auth en unos segundos. Probá con \"olvidé mi contraseña\".");
