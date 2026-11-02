/**
 * El marcador "Vector → CAD" desde la 2.36.0: un puente, no un panel. Tocado en la pestaña del
 * CAD, abre "Pasar al CAD" de Vector en otra pestaña y le contesta los pedidos que le haga
 * (`enlace-comun.ts`), con la sesión del CAD de esta pestaña. El panel, con los vuelos y lo que
 * falta, está en Vector (Federico, 2026-10-29: "volvé a Vector para ver el estado de tu CAD").
 *
 * Los mensajes se aceptan sólo de la pestaña de Vector que abrió este script, desde el origen de
 * Vector, y sólo con la lista blanca de `atender`. Vector nunca ve la contraseña de ANAC.
 *
 * Lo compila `scripts/build-puente.mjs` a `public/cad/puente.js`: el mismo archivo que cargan los
 * marcadores que ya están guardados, que así pasan solos a funcionar de esta manera. El panel
 * viejo adentro del CAD (`puente.ts`) se borró en la 2.36.2.
 */
import { atender, esPedido, mostrarAviso } from "./enlace-comun";

declare const __CAD_ORIGEN__: string;

(function () {
  const script = document.currentScript as HTMLScriptElement | null;
  const VECTOR = script?.src ? new URL(script.src).origin : "https://vector.fdiaznem.com.ar";
  const w = window as unknown as { __vectorCadEnlace?: { abrir: () => void } };

  if (location.origin !== __CAD_ORIGEN__) {
    alert(`Tocá el marcador de Vector en la pestaña del CAD (${__CAD_ORIGEN__.replace(/^https?:\/\//, "")}), adentro de "Registro horas vuelo".`);
    return;
  }
  // Tocado de nuevo: vuelve a abrir (o a traer al frente) la pestaña de Vector.
  if (w.__vectorCadEnlace) {
    w.__vectorCadEnlace.abrir();
    return;
  }

  let vector: Window | null = null;
  let poner: (texto: string) => void = () => {};

  function abrir() {
    vector = window.open(`${VECTOR}/dashboard/history/cad?enlace=1`, "vector-cad");
    if (vector) {
      vector.focus();
      poner("<b>Conectado con Vector</b>Volvé a Vector para ver el estado de tu CAD y pasar tus vuelos. Dejá esta pestaña abierta.");
    }
  }
  w.__vectorCadEnlace = { abrir };

  window.addEventListener("message", (e) => {
    if (e.origin !== VECTOR || !vector || e.source !== vector || !esPedido(e.data)) return;
    void atender(e.data).then((res) => vector?.postMessage(res, VECTOR));
  });

  // El navegador deja abrir otra pestaña sólo como respuesta a un toque, y este script carga un
  // momento después del toque en el marcador: si la bloquea, el aviso trae el botón.
  poner = mostrarAviso("<b>Vector → CAD</b>Tocá para abrir Vector y pasar tus vuelos desde ahí.", VECTOR, abrir);
  abrir();
})();
