/**
 * Pasa el marco de una carta (PDF vectorial) a una imagen RGB grande: pdf.js en un Chromium sin
 * ventana, por pedazos de 4096 px, unidos con sharp.
 *
 * El navegador lo pone `CHROME` o, si no está, el Chromium de Playwright o el Google Chrome de la
 * Mac. Una página propia, servida por un servidor local efímero, carga el pdf.js de `unpdf` y la
 * carta; ningún pedido sale de la compu.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const sharp = require("sharp");

const PDFJS = path.join(path.dirname(require.resolve("unpdf")), "pdfjs.mjs");

const PAGINA = `<!doctype html><meta charset="utf-8"><body style="margin:0"><canvas id="c"></canvas>
<script type="module">
import * as pdfjs from "./pdfjs.mjs";
let doc;
window.region = async (escala, x0, y0, x1, y1) => {
  doc ??= await pdfjs.getDocument({ url: "./carta.pdf" }).promise;
  const p = await doc.getPage(1);
  const [vx0, , , vy1] = p.view;
  const vp = p.getViewport({ scale: escala, offsetX: -(x0 - vx0) * escala, offsetY: -(vy1 - y1) * escala });
  const c = document.getElementById("c");
  c.width = Math.round((x1 - x0) * escala);
  c.height = Math.round((y1 - y0) * escala);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  await p.render({ canvasContext: ctx, viewport: vp }).promise;
  window.png = c.toDataURL("image/png");
  return window.png.length;
};
window.listo = true;
</script>`;

function navegador() {
  const candidatos = [
    process.env.CHROME,
    ...(() => {
      const base = path.join(os.homedir(), "Library/Caches/ms-playwright");
      try {
        return fs
          .readdirSync(base)
          .filter((d) => d.startsWith("chromium_headless_shell"))
          .map((d) => path.join(base, d, "chrome-headless-shell-mac-arm64/chrome-headless-shell"));
      } catch {
        return [];
      }
    })(),
    path.join(os.homedir(), ".cache/ms-playwright/chromium_headless_shell-1243/chrome-linux/headless_shell"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  const c = candidatos.find((x) => fs.existsSync(x));
  if (!c) throw new Error("No encontré un Chromium: poné su ruta en CHROME.");
  return c;
}

export async function dibujar(archivoPdf, marco, escala) {
  const servidor = http.createServer((req, res) => {
    const archivos = { "/": ["text/html", Buffer.from(PAGINA)], "/pdfjs.mjs": ["text/javascript", fs.readFileSync(PDFJS)], "/carta.pdf": ["application/pdf", fs.readFileSync(archivoPdf)] };
    const a = archivos[req.url];
    if (!a) return res.writeHead(404).end();
    res.writeHead(200, { "Content-Type": a[0] }).end(a[1]);
  });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  const puertoWeb = servidor.address().port;
  const puertoCdp = 9400 + Math.floor(Math.random() * 500);
  const chrome = spawn(navegador(), ["--headless", `--remote-debugging-port=${puertoCdp}`, "--no-first-run", `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), "cartas-"))}`, "about:blank"], { stdio: "ignore" });
  try {
    let ws;
    for (let i = 0; i < 150 && !ws; i++) {
      try {
        const u = (await (await fetch(`http://127.0.0.1:${puertoCdp}/json/list`)).json()).find((x) => x.type === "page")?.webSocketDebuggerUrl;
        if (u) ws = new WebSocket(u);
      } catch {}
      if (!ws) await new Promise((r) => setTimeout(r, 100));
    }
    if (!ws) throw new Error("El Chromium no arrancó.");
    await new Promise((r) => ws.addEventListener("open", r, { once: true }));
    let id = 0;
    const pend = new Map();
    let alCargar;
    const cargada = new Promise((r) => (alCargar = r));
    ws.addEventListener("message", (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pend.has(m.id)) {
        pend.get(m.id)(m);
        pend.delete(m.id);
      } else if (m.method === "Page.loadEventFired") alCargar();
    });
    const cdp = (method, params = {}) => new Promise((res) => { const k = ++id; pend.set(k, res); ws.send(JSON.stringify({ id: k, method, params })); });
    const ev = async (expression) => {
      const r = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.error || r.result?.exceptionDetails) throw new Error(JSON.stringify(r.error ?? r.result.exceptionDetails).slice(0, 500));
      return r.result?.result?.value;
    };
    // Evaluar mientras la página navega pierde la respuesta: se espera el load.
    await cdp("Page.enable");
    await cdp("Page.navigate", { url: `http://127.0.0.1:${puertoWeb}/` });
    await cargada;
    for (let i = 0; i < 100 && !(await ev("!!window.listo")); i++) await new Promise((r) => setTimeout(r, 100));

    const [mx0, my0, mx1, my1] = marco;
    const ancho = Math.round((mx1 - mx0) * escala), alto = Math.round((my1 - my0) * escala);
    const PASO = 4096 / escala;
    const piezas = [];
    for (let y1 = my1; y1 > my0 + 1e-6; y1 -= PASO)
      for (let x0 = mx0; x0 < mx1 - 1e-6; x0 += PASO) {
        const x1 = Math.min(mx1, x0 + PASO), y0 = Math.max(my0, y1 - PASO);
        // Una respuesta de varios MB por CDP no llega: el PNG queda en la página y se trae de a 512 KB.
        const largo = await ev(`region(${escala}, ${x0}, ${y0}, ${x1}, ${y1})`);
        let url = "";
        for (let k = 0; k < largo; k += 512 * 1024) url += await ev(`window.png.slice(${k}, ${k + 512 * 1024})`);
        piezas.push({ input: Buffer.from(url.slice(url.indexOf(",") + 1), "base64"), left: Math.round((x0 - mx0) * escala), top: Math.round((my1 - y1) * escala) });
      }
    ws.close();
    const px = await sharp({ create: { width: ancho, height: alto, channels: 3, background: "#ffffff" }, limitInputPixels: false })
      .composite(piezas)
      .removeAlpha()
      .raw()
      .toBuffer();
    return { px, ancho, alto, escala, marco };
  } finally {
    chrome.kill();
    servidor.close();
  }
}
