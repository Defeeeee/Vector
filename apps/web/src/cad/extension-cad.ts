/**
 * La extensión "Vector → CAD" en la pestaña del CAD (2.36.0): un puente, como el marcador
 * (`enlace.ts`), pero sin abrir ventanas. Se conecta con el service worker de la extensión
 * (`extension/background.js`), que le pasa los pedidos de la pestaña de Vector; los contesta
 * `atender`, con la sesión del CAD de esta pestaña. En el CAD sólo queda un aviso.
 *
 * Corre en el mundo aislado de la extensión (necesita `chrome.runtime`); sus `fetch` salen con
 * el origen y las cookies del CAD, como los de la página. Lo compila
 * `scripts/build-extension.mjs` a `cad.js`.
 */
import { atender, esPedido, mostrarAviso } from "./enlace-comun";

declare const chrome: {
  runtime: {
    connect(info: { name: string }): {
      onMessage: { addListener(f: (m: unknown) => void): void };
      onDisconnect: { addListener(f: () => void): void };
      postMessage(m: unknown): void;
    };
  };
};

const VECTOR = "https://vector.fdiaznem.com.ar";

(function () {
  if (document.getElementById("vector-cad-aviso")) return;
  mostrarAviso("<b>Conectado con Vector</b>Volvé a Vector para ver el estado de tu CAD y pasar tus vuelos.", VECTOR);

  // El service worker de la extensión se duerme a los segundos sin uso y corta la conexión:
  // se vuelve a conectar sola, para que Vector siempre encuentre esta pestaña.
  function conectar() {
    const puerto = chrome.runtime.connect({ name: "cad" });
    puerto.onMessage.addListener((m) => {
      if (esPedido(m)) void atender(m).then((r) => puerto.postMessage(r));
    });
    puerto.onDisconnect.addListener(() => setTimeout(conectar, 500));
  }
  conectar();
})();
