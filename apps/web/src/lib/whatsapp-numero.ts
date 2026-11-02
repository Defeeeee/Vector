/**
 * El número de WhatsApp del piloto, en la única forma en que el copiloto lo encuentra.
 *
 * El copiloto busca el perfil por el número que manda WhatsApp, que en Argentina es
 * `549` + código de área + número, sin el 0 ni el 15: `5491123456789`. El backend tolera
 * también `54…` sin el 9 (`controllers/whatsapp.py`), pero nada más. El 2026-09-24 un
 * piloto había guardado `11XXXXXXXX` y el copiloto no lo reconocía: cualquier forma en
 * que un argentino escribe su celular tiene que terminar en la canónica.
 *
 * Se aceptan: `11 2345-6789`, `011 15 2345-6789`, `+54 9 11 2345 6789`,
 * `54 11 2345 6789`, `0351 15 123-4567`. Un número extranjero se acepta si viene con
 * `+` o `00` y otro código de país, y se guarda tal cual (sólo dígitos).
 */

export type ResultadoNumero = { ok: true; numero: string } | { ok: false; error: string };

export const AYUDA_NUMERO = "Escribilo con el código de área, por ejemplo 11 2345 6789.";

export function normalizarWhatsapp(entrada: string | null | undefined): ResultadoNumero {
  const texto = (entrada ?? "").trim();
  if (!texto) return { ok: true, numero: "" };

  const internacional = texto.startsWith("+") || texto.startsWith("00");
  let digitos = texto.replace(/\D/g, "");
  if (digitos.startsWith("00")) digitos = digitos.slice(2);

  let nacional: string;
  if (digitos.startsWith("54") && (internacional || digitos.length >= 12)) {
    nacional = digitos.slice(2);
    if (nacional.startsWith("9")) nacional = nacional.slice(1);
  } else if (internacional) {
    // Otro país: no hay forma de validarlo desde acá. Sólo el largo de E.164.
    return digitos.length >= 8 && digitos.length <= 15
      ? { ok: true, numero: digitos }
      : { ok: false, error: "Ese número no parece completo. Revisá el código de país." };
  } else {
    nacional = digitos;
  }

  if (nacional.startsWith("0")) nacional = nacional.slice(1);

  // El 15 del celular va después del código de área, que tiene 2, 3 o 4 dígitos. Con el
  // 15 el número tiene 12 dígitos; sin él, 10.
  if (nacional.length === 12) {
    for (const k of [2, 3, 4]) {
      if (nacional.slice(k, k + 2) === "15") {
        nacional = nacional.slice(0, k) + nacional.slice(k + 2);
        break;
      }
    }
  }

  // Los códigos de área argentinos empiezan con 2 o 3, salvo el 11.
  const areaValida = /^(11|[23])/.test(nacional);
  if (nacional.length !== 10 || !areaValida) {
    return { ok: false, error: `Ese número no parece un celular argentino. ${AYUDA_NUMERO}` };
  }
  return { ok: true, numero: `549${nacional}` };
}

/** `5491123456789` → `+54 9 11 2345-6789`, para mostrarlo. Otro formato, tal cual. */
export function mostrarWhatsapp(numero: string | null | undefined): string {
  const n = (numero ?? "").replace(/\D/g, "");
  if (/^54911\d{8}$/.test(n)) return `+54 9 11 ${n.slice(5, 9)}-${n.slice(9)}`;
  if (/^549\d{10}$/.test(n)) return `+54 9 ${n.slice(3, 6)} ${n.slice(6, 9)}-${n.slice(9)}`;
  return n ? `+${n}` : "";
}
