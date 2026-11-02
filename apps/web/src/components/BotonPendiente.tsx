"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

/**
 * Un botón de submit que se apaga y avisa mientras la acción está corriendo.
 *
 * **Por qué existe.** Una server action es un viaje al backend y vuelta. Sin
 * feedback, el botón se ve exactamente igual antes y durante, así que el piloto
 * asume que no pasó nada y vuelve a tocar — y en el otro extremo eso son dos
 * escrituras. El `disabled` no es cosmético: es lo que hace imposible el doble
 * click, y por eso va junto con el spinner y no como una opción aparte.
 *
 * **Tiene que ser hijo del `<form>`, no el form mismo.** `useFormStatus` lee el
 * estado del formulario padre más cercano; un componente que renderiza su propio
 * `<form>` y se pregunta por el estado adentro siempre lee `pending: false`. Es el
 * error clásico con este hook y no da ningún síntoma: simplemente nunca se prende.
 *
 * Es el primer uso de `useFormStatus` en el repo. Los otros 22 componentes con
 * estado de pendiente lo hacen a mano con `useState`, que está bien donde ya
 * manejan el submit ellos; esto es para los `<form action={...}>` que no tienen
 * ningún cliente alrededor.
 */

interface Props {
  children: React.ReactNode;
  /** Qué decir mientras corre. Si no viene, se queda con el texto de siempre. */
  pendiente?: string;
  className?: string;
  /** Para deshabilitarlo por una razón ajena al submit. */
  disabled?: boolean;
  title?: string;
}

export default function BotonPendiente({
  children,
  pendiente,
  className = "",
  disabled = false,
  title,
}: Props) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      title={title}
      // `aria-busy` para que un lector de pantalla también se entere: el spinner
      // es información, no decoración.
      aria-busy={pending}
      className={`inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed transition-opacity ${className}`}
    >
      {pending && <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />}
      {pending && pendiente ? pendiente : children}
    </button>
  );
}
