// Captura de la app en tamaño teléfono, por CDP, con una cookie de sesión de prueba.
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
const [url, salida, ancho = "390", alto = "844", oscuro = "0"] = process.argv.slice(2);
const DIR = new URL(".", import.meta.url).pathname;
mkdirSync(DIR + "chrome-prof", { recursive: true });
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new", "--remote-debugging-port=9333", `--user-data-dir=${DIR}chrome-prof`, "--hide-scrollbars", "about:blank",
], { stdio: "ignore" });
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
let info;
for (let i = 0; i < 40 && !info; i++) { await esperar(250); info = await fetch("http://127.0.0.1:9333/json/list").then((r) => r.json()).catch(() => null); }
const pagina = info.find((t) => t.type === "page");
const ws = new WebSocket(pagina.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0; const pend = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "u1", exp: Math.floor(Date.now() / 1000) + 86400 })}.firma-falsa`;
await cdp("Network.enable");
await cdp("Network.setCookie", { name: "session_token", value: jwt, url: "http://localhost:3001" });
await cdp("Network.setCookie", { name: "vector_alta2", value: "u1", url: "http://localhost:3001" });
await cdp("Emulation.setDeviceMetricsOverride", { width: +ancho, height: +alto, deviceScaleFactor: 3, mobile: true });
await cdp("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });
if (oscuro === "1") await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
await cdp("Page.enable");
await cdp("Page.navigate", { url });
await esperar(3000);
// Las novedades ya vistas: si no, la tarjeta tapa el inicio.
await cdp("Runtime.evaluate", { expression: "localStorage.setItem('vector_dismissed_changelog_v2.22.0','true'); true" });
await cdp("Page.navigate", { url });
await esperar(7000);
// Sin animaciones a medio camino.
await cdp("Runtime.evaluate", { expression: "document.querySelectorAll('*').forEach(e=>{e.style.animation='none';e.style.transition='none'}); window.scrollTo(0,0); true" });
await esperar(800);
const shot = await cdp("Page.captureScreenshot", { format: "png" });
writeFileSync(salida, Buffer.from(shot.result.data, "base64"));
console.log("captura:", salida);
ws.close(); chrome.kill();
