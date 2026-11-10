// Renderiza reel.html cuadro por cuadro con Chromium headless (por CDP, sin paquetes) y le pasa
// los PNG a ffmpeg por un pipe.
//
//   node render.mjs muestras 0.5 2.2 4.8      → muestras/t-0.50.png …, para revisar cuadros
//   node render.mjs video video.mp4           → el video sin audio (H.264, CRF 27, preset slow)
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { homedir } from "node:os";

const AQUI = dirname(fileURLToPath(import.meta.url));
const CHROME = join(homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell");
const PUERTO = 9333;
const FPS = 30;
const [modo, ...args] = process.argv.slice(2);

const chrome = spawn(CHROME, [
  `--remote-debugging-port=${PUERTO}`, "--allow-file-access-from-files", "--disable-gpu-vsync",
  "--force-device-scale-factor=1", "--hide-scrollbars", "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });

async function esperarPagina() {
  for (let i = 0; i < 100; i++) {
    try {
      const lista = await (await fetch(`http://127.0.0.1:${PUERTO}/json/list`)).json();
      const p = lista.find((x) => x.type === "page");
      if (p) return p.webSocketDebuggerUrl;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Chromium no levantó");
}

const ws = new WebSocket(await esperarPagina());
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pendientes = new Map();
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pendientes.has(m.id)) { pendientes.get(m.id)(m); pendientes.delete(m.id); }
});
const cdp = (method, params = {}) => new Promise((res, rej) => {
  const n = ++id;
  pendientes.set(n, (m) => (m.error ? rej(new Error(m.error.message)) : res(m.result)));
  ws.send(JSON.stringify({ id: n, method, params }));
});
const evaluar = async (expression) => {
  const r = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};

await cdp("Page.enable");
await cdp("Page.navigate", { url: pathToFileURL(join(AQUI, "reel.html")).href + "#render" });
for (let i = 0; i < 100; i++) {
  if (await evaluate_ok()) break;
  await new Promise((r) => setTimeout(r, 100));
}
async function evaluate_ok() { try { return await evaluar("!!window.REEL"); } catch { return false; } }
await evaluar("REEL.listo()");
const DUR = await evaluar("REEL.DUR");

const cuadro = async (t) => {
  const url = await evaluar(`(REEL.dibujar(${t}), document.getElementById('c').toDataURL('image/png'))`);
  return Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
};

if (modo === "muestras") {
  mkdirSync(join(AQUI, "muestras"), { recursive: true });
  for (const s of args) {
    const t = Number(s);
    writeFileSync(join(AQUI, "muestras", `t-${t.toFixed(2)}.png`), await cuadro(t));
    console.log("muestra", t);
  }
} else if (modo === "video") {
  const salida = join(AQUI, args[0] ?? "video.mp4");
  const ff = spawn("ffmpeg", [
    "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-pix_fmt", "yuv420p", "-movflags", "+faststart", salida,
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const total = Math.round(DUR * FPS);
  const t0 = Date.now();
  for (let f = 0; f < total; f++) {
    const png = await cuadro(f / FPS);
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
    if (f % 60 === 0) console.log(`cuadro ${f}/${total} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  console.log("listo:", salida);
}
ws.close();
chrome.kill();
