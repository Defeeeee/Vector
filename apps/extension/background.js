/**
 * Vector → CAD: el service worker de la extensión. Sólo pasa mensajes entre la pestaña de
 * Vector (`vector.js`) y la del CAD (`cad.js`): no hace pedidos propios ni guarda nada.
 *
 * Cada pestaña del CAD con la extensión se conecta acá (`chrome.runtime.connect`, "cad"). Un
 * pedido de Vector va a la última que se conectó; si no hay ninguna, vuelve `sin_cad` para que
 * Vector diga "abrí el CAD".
 */
const VECTOR = "https://vector.fdiaznem.com.ar/";
const puertos = [];
const esperando = new Map();

chrome.runtime.onConnect.addListener((puerto) => {
  if (puerto.name !== "cad") return;
  puertos.push(puerto);
  puerto.onDisconnect.addListener(() => {
    const k = puertos.indexOf(puerto);
    if (k >= 0) puertos.splice(k, 1);
  });
  puerto.onMessage.addListener((m) => {
    const responder = m && esperando.get(m.id);
    if (responder) {
      esperando.delete(m.id);
      responder(m);
    }
  });
});

chrome.runtime.onMessage.addListener((m, remitente, responder) => {
  if (!remitente.url || !remitente.url.startsWith(VECTOR) || !m || m.tipo !== "vector-cad:pedido") return;
  const puerto = puertos[puertos.length - 1];
  if (!puerto) {
    responder({ tipo: "vector-cad:respuesta", id: m.id, ok: false, error: "sin_cad" });
    return;
  }
  const t = setTimeout(() => {
    esperando.delete(m.id);
    responder({ tipo: "vector-cad:respuesta", id: m.id, ok: false, error: "El CAD no contestó." });
  }, 60000);
  esperando.set(m.id, (r) => {
    clearTimeout(t);
    responder(r);
  });
  puerto.postMessage(m);
  return true;
});
