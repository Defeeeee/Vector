/**
 * Vector → CAD, en Vector: le avisa a la página que la extensión está instalada, y le pasa al
 * service worker (`background.js`) los pedidos para el CAD que "Pasar al CAD" deja con
 * `window.postMessage` (`lib/enlace-cad.ts`), y a la página las respuestas. No lee nada más.
 */
document.documentElement.dataset.vectorCadExtension = chrome.runtime.getManifest().version;

window.addEventListener("message", (e) => {
  const m = e.data;
  if (e.source !== window || e.origin !== location.origin || !m || m.tipo !== "vector-cad:pedido") return;
  chrome.runtime.sendMessage(m, (r) => {
    const respuesta = chrome.runtime.lastError ? { tipo: "vector-cad:respuesta", id: m.id, ok: false, error: "sin_cad" } : r;
    window.postMessage({ ...respuesta, desde: "extension" }, location.origin);
  });
});
