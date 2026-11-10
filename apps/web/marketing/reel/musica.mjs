// La música del reel, sintetizada acá mismo: 120 BPM (un pulso cada 0,5 s, la grilla de los
// cortes de reel.html), 30 s, La menor, Am–F–C–G. Sin muestras ni loops ajenos: todo sale de osciladores
// y ruido, así que es original.
//
//   node musica.mjs musica.wav
import { writeFileSync } from "node:fs";

const SR = 44100, DUR = 30, N = SR * DUR;
const L = new Float32Array(N), R = new Float32Array(N);
const envL = new Float32Array(N), envR = new Float32Array(N); // envío a la reverb
const BEAT = 0.5;

// Ruido determinístico (mismo audio en cada corrida).
let semilla = 7;
const ruido = () => { semilla = (semilla * 1664525 + 1013904223) >>> 0; return semilla / 2147483648 - 1; };
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

function poner(i, v, pan = 0, rev = 0) {
  if (i < 0 || i >= N) return;
  const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
  L[i] += v * gl; R[i] += v * gr;
  if (rev) { envL[i] += v * gl * rev; envR[i] += v * gr * rev; }
}

// Biquad RBJ, con coeficientes que se pueden mover muestra a muestra.
class Biquad {
  constructor() { this.x1 = this.x2 = this.y1 = this.y2 = 0; }
  set(tipo, f, q) {
    const w = 2 * Math.PI * Math.min(f, SR * 0.45) / SR, a = Math.sin(w) / (2 * q), c = Math.cos(w);
    let b0, b1, b2;
    if (tipo === "lp") { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; }
    else if (tipo === "hp") { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; }
    else { b0 = a; b1 = 0; b2 = -a; }
    const a0 = 1 + a;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = -2 * c / a0; this.a2 = (1 - a) / a0;
    return this;
  }
  p(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y;
  }
}

// ── Instrumentos ──────────────────────────────────────────────────────────
function bombo(t0, g = 1) {
  let fase = 0;
  for (let k = 0; k < SR * 0.45; k++) {
    const t = k / SR, f = 46 + 120 * Math.exp(-t * 32);
    fase += 2 * Math.PI * f / SR;
    const v = Math.sin(fase) * Math.exp(-t * 6.5) + (k < 120 ? ruido() * 0.5 * (1 - k / 120) : 0);
    poner(Math.round(t0 * SR) + k, v * 0.95 * g);
  }
}
function palma(t0, g = 1) {
  const bp = new Biquad().set("bp", 1400, 0.9);
  for (let k = 0; k < SR * 0.25; k++) {
    const t = k / SR;
    const e = (t < 0.03 ? [0, 0.011, 0.022].reduce((a, s) => a + (t >= s ? Math.exp(-(t - s) * 180) : 0), 0) : Math.exp(-(t - 0.022) * 18));
    poner(Math.round(t0 * SR) + k, bp.p(ruido()) * e * 1.6 * g, 0.08, 0.35);
  }
}
function hat(t0, g = 1, largo = false, pan = 0.25) {
  const hp = new Biquad().set("hp", 7500, 0.7);
  const dec = largo ? 14 : 55;
  for (let k = 0; k < SR * (largo ? 0.3 : 0.08); k++) {
    poner(Math.round(t0 * SR) + k, hp.p(ruido()) * Math.exp(-(k / SR) * dec) * 0.32 * g, pan, 0.1);
  }
}
function bajo(t0, midi, dur, g = 1) {
  const lp = new Biquad();
  let fase = 0;
  const f = hz(midi);
  for (let k = 0; k < SR * dur; k++) {
    const t = k / SR;
    fase = (fase + f / SR) % 1;
    const saw = 2 * fase - 1, sub = Math.sin(2 * Math.PI * fase);
    lp.set("lp", 180 + 1400 * Math.exp(-t * 14), 1.1);
    const e = Math.min(1, t * 300) * Math.exp(-t * 3.2) * (t > dur - 0.02 ? (dur - t) / 0.02 : 1);
    poner(Math.round(t0 * SR) + k, (lp.p(saw) * 0.5 + sub * 0.55) * e * 0.55 * g);
  }
}
function pad(t0, notas, dur, g = 1) {
  const lps = [new Biquad().set("lp", 1300, 0.6), new Biquad().set("lp", 1300, 0.6)];
  const voces = notas.flatMap((m) => [-7, 0, 7].map((c) => ({ f: hz(m) * Math.pow(2, c / 1200), fase: (ruido() + 1) / 2 })));
  for (let k = 0; k < SR * dur; k++) {
    const t = k / SR;
    let a = 0, b = 0;
    voces.forEach((v, j) => { v.fase = (v.fase + v.f / SR) % 1; const s = 2 * v.fase - 1; if (j % 2) a += s; else b += s; });
    const e = Math.min(1, t / 0.25) * Math.min(1, (dur - t) / 0.3);
    const vl = lps[0].p(a) * e * 0.06 * g, vr = lps[1].p(b) * e * 0.06 * g;
    const i = Math.round(t0 * SR) + k;
    if (i >= 0 && i < N) { L[i] += vl; R[i] += vr; envL[i] += vl * 0.5; envR[i] += vr * 0.5; }
  }
}
function pulso(t0, midi, g = 1, pan = 0) {
  const lp = new Biquad();
  let fase = 0;
  const f = hz(midi);
  for (let k = 0; k < SR * 0.2; k++) {
    const t = k / SR;
    fase = (fase + f / SR) % 1;
    lp.set("lp", 600 + 4200 * Math.exp(-t * 30), 1.4);
    poner(Math.round(t0 * SR) + k, lp.p(fase < 0.5 ? 1 : -1) * Math.exp(-t * 18) * 0.13 * g, pan, 0.4);
  }
}
function golpeAcorde(t0, notas, g = 1, largo = 0.35) {
  notas.forEach((m, j) => {
    const lp = new Biquad();
    let fase = 0; const f = hz(m);
    for (let k = 0; k < SR * largo * 2; k++) {
      const t = k / SR; fase = (fase + f / SR) % 1;
      lp.set("lp", 900 + 5000 * Math.exp(-t * 9), 0.9);
      poner(Math.round(t0 * SR) + k, lp.p(2 * fase - 1) * Math.exp(-t / largo * 2.2) * 0.12 * g, (j - 1.5) * 0.3, 0.6);
    }
  });
}
function barrido(tPico, largo = 0.45, g = 1, sube = true) {
  const bp = new Biquad();
  const t0 = tPico - largo * 0.8;
  for (let k = 0; k < SR * largo; k++) {
    const t = k / SR, x = t / largo;
    bp.set("bp", sube ? 300 + 6000 * x * x : 6000 - 5500 * x, 1.6);
    const e = x < 0.8 ? Math.pow(x / 0.8, 2) : (1 - x) / 0.2;
    poner(Math.round(t0 * SR) + k, bp.p(ruido()) * e * 0.9 * g, Math.sin(x * 3) * 0.6, 0.3);
  }
}
function impacto(t0, g = 1) {
  bombo(t0, 1.1 * g);
  let fase = 0;
  for (let k = 0; k < SR * 1.6; k++) {
    const t = k / SR; fase += 2 * Math.PI * 38 / SR;
    poner(Math.round(t0 * SR) + k, Math.sin(fase) * Math.exp(-t * 2.2) * 0.45 * g);
  }
  const lp = new Biquad().set("lp", 3000, 0.7);
  for (let k = 0; k < SR * 0.9; k++) poner(Math.round(t0 * SR) + k, lp.p(ruido()) * Math.exp(-(k / SR) * 5) * 0.35 * g, 0, 0.8);
}
function bip(t0, f, g = 1, dur = 0.07, pan = 0) {
  for (let k = 0; k < SR * dur; k++) {
    const t = k / SR;
    poner(Math.round(t0 * SR) + k, Math.sin(2 * Math.PI * f * t) * Math.min(1, t * 2000) * Math.exp(-t * 40) * 0.22 * g, pan, 0.3);
  }
}
function click(t0, g = 1) {
  const hp = new Biquad().set("hp", 3000, 0.7);
  for (let k = 0; k < SR * 0.02; k++) poner(Math.round(t0 * SR) + k, hp.p(ruido()) * Math.exp(-(k / SR) * 300) * 0.35 * g, 0.2);
}
function subida(t0, t1, g = 1) {
  const bp = new Biquad();
  let fase = 0;
  for (let k = 0; k < SR * (t1 - t0); k++) {
    const x = k / (SR * (t1 - t0));
    bp.set("bp", 400 + 7000 * x * x, 2);
    fase += 2 * Math.PI * (180 + 700 * x * x) / SR;
    poner(Math.round(t0 * SR) + k, (bp.p(ruido()) * 0.7 + Math.sin(fase) * 0.12) * x * x * g, 0, 0.3);
  }
}

// ── Arreglo ───────────────────────────────────────────────────────────────
// Las escenas de reel.html (inicio de cada una) y los momentos que llevan un golpe.
const E = { titulo: 1.0, antes: 3.5, plan: 7.5, durante: 9.5, registro: 14.5, cad: 16.5, copiloto: 19.0, difs: 21.5, app: 26.0, cierre: 28.0 };
const DIFS_D = 1.5;
// La misma curva de millas de la escena DURANTE: el tablero gira al entrar a cada ATZ.
const MILLAS = [[0, 4.0], [2.4, 5.3], [4.25, 11.15], [5.0, 12.2]];
const eInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const millas = (u) => { for (let i = 1; i < MILLAS.length; i++) if (u <= MILLAS[i][0]) { const [a, b] = [MILLAS[i - 1], MILLAS[i]]; return a[1] + (b[1] - a[1]) * eInOut((u - a[0]) / (b[0] - a[0])); } return 12.2; };
const CAMBIOS = [5.13, 11.0].map((nm) => { let u = 0; while (millas(u) < nm && u < 5) u += 0.005; return E.durante + u; });

const ACORDES = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // Am F C G
const RAICES = [45, 41, 36, 43];
const acordeEn = (t) => Math.floor(Math.max(0, t - 1) / 2) % 4;

// Intro: subida hasta el logo y golpe cuando se clava
subida(0, 0.48, 0.9);
impacto(0.47, 0.7);
bip(0.6, 1760, 0.5); bip(0.7, 1760, 0.4); bip(0.8, 2093, 0.4);
subida(0.55, 1.0, 0.6);

// Groove, del título al cierre
for (let t = E.titulo; t < E.cierre - 1e-6; t += BEAT) {
  const seccion = t < E.antes ? "titulo" : t < E.copiloto ? "cuerpo" : t < E.difs ? "copiloto" : t < E.app ? "drop" : "app";
  const enBarra = Math.round((t - 1) / BEAT) % 4;
  if (seccion === "copiloto") { if (t < E.difs - 1.0) bombo(t, 0.6); }
  else bombo(t, seccion === "drop" ? 1.1 : seccion === "app" ? 0.8 : 1);
  if ((seccion === "cuerpo" || seccion === "drop") && (enBarra === 1 || enBarra === 3)) palma(t, seccion === "drop" ? 1.1 : 0.9);
  if (seccion !== "titulo" && seccion !== "copiloto") {
    hat(t + BEAT / 2, 1, false, 0.3);
    if (seccion === "drop") { hat(t + BEAT / 4, 0.5, false, -0.3); hat(t + 3 * BEAT / 4, 0.5, false, -0.3); }
  }
  if (seccion !== "copiloto" || t < E.difs - 1.0) {
    const raiz = RAICES[acordeEn(t)];
    bajo(t, raiz, 0.22, seccion === "app" ? 0.7 : 1);
    bajo(t + BEAT / 2, raiz + (enBarra === 3 ? 12 : 0), 0.22, seccion === "app" ? 0.6 : 0.85);
  }
}
for (let b = E.titulo; b < E.cierre; b += 2) {
  const n = ACORDES[acordeEn(b)];
  pad(b, n.map((m) => m + 12), 2.05, b < E.antes ? 0.6 : b >= E.copiloto && b < E.difs ? 1.3 : 1);
}
const arpegio = (t0, t1, g) => {
  for (let t = t0; t < t1 - 1e-6; t += BEAT / 4) {
    const n = ACORDES[acordeEn(t)];
    const paso = Math.round((t - t0) / (BEAT / 4));
    const nota = [n[0], n[1], n[2], n[1] + 12, n[2], n[0] + 12, n[1], n[2] + 12][paso % 8] + 12;
    pulso(t, nota, g, paso % 2 ? 0.35 : -0.35);
  }
};
arpegio(E.durante, E.registro, 1);
arpegio(E.difs, E.app, 1.15);
arpegio(E.app, E.cierre, 0.7);

// Golpes del título (cada palabra que cae)
[0.08, 0.42, 0.8].forEach((u, i) => golpeAcorde(E.titulo + u, ACORDES[0].map((m) => m + 12 * (i === 2 ? 1 : 0)), 1.1, 0.25));
// Barridos de las transiciones
[E.antes, E.plan, E.durante, E.registro, E.app].forEach((t) => barrido(t, 0.4, 0.9));
barrido(E.titulo, 0.35, 0.7); barrido(E.cad, 0.35, 0.6); barrido(E.cierre, 0.5, 0.8);
// Las palabras gigantes ANTES / DURANTE / DESPUÉS
[E.antes, E.durante, E.registro].forEach((t) => { impacto(t, 0.6); golpeAcorde(t + 0.02, ACORDES[acordeEn(t)].map((m) => m + 12), 1, 0.4); });
// El segundo titular del mapa
golpeAcorde(E.antes + 2.45, ACORDES[acordeEn(E.antes + 2.45)].map((m) => m + 12), 0.7, 0.3);
// El sello del plan
impacto(E.plan + 0.92, 0.5); golpeAcorde(E.plan + 0.92, [69, 72, 76], 0.9, 0.3);
// El tablero de "con quién hablás"
CAMBIOS.forEach((t) => { for (let k = 0; k < 6; k++) click(t + k * 0.025, 0.9); bip(t + 0.05, 1318, 0.8); bip(t + 0.13, 1760, 0.8); });
// "Ahora"
click(E.registro + 0.98, 1.4); bip(E.registro + 1.0, 1568, 0.7); bip(E.registro + 1.3, 880, 0.3);
// El contador del CAD baja: ticks que suben, y el ✓
for (let k = 0; k < 18; k++) bip(E.cad + 0.5 + k * 0.06, 700 + k * 45, 0.35, 0.04, k % 2 ? 0.3 : -0.3);
golpeAcorde(E.cad + 1.6, [69, 73, 76, 81], 1.1, 0.5); bip(E.cad + 1.62, 1760, 0.6, 0.15);
// El copiloto tipea y la respuesta sale de a pedazos
for (let k = 0; k < 15; k++) click(E.copiloto + 0.3 + k * 0.033 + (k % 3) * 0.004, 0.55);
for (let k = 0; k < 8; k++) bip(E.copiloto + 1.1 + k * 0.05, 1200 + (k % 3) * 220, 0.25, 0.035);
subida(E.difs - 1.0, E.difs, 1.1);
// Drop: un impacto por cada diferencial
[0, 1, 2].forEach((i) => { const t = E.difs + i * DIFS_D; impacto(t, i === 0 ? 1 : 0.75); golpeAcorde(t, ACORDES[acordeEn(t)].map((m) => m + 12), 1, 0.3); });
// Cierre
impacto(E.cierre, 1);
pad(E.cierre, [57, 60, 64, 69], 2.0, 1.6);
golpeAcorde(E.cierre, [45, 57, 64, 72], 1.2, 1.2);
bip(E.cierre + 0.6, 1760, 0.4, 0.2); bip(E.cierre + 0.75, 2637, 0.3, 0.25);

// ── Reverb (Schroeder) sobre el envío ──────────────────────────────────────
function reverb(ent, retardos) {
  const sal = new Float32Array(N);
  const combs = retardos.map((d) => ({ buf: new Float32Array(d), i: 0, fb: 0.78, lp: 0 }));
  for (let n = 0; n < N; n++) {
    let s = 0;
    for (const c of combs) {
      const y = c.buf[c.i];
      c.lp = y * 0.6 + c.lp * 0.4;
      c.buf[c.i] = ent[n] + c.lp * c.fb;
      c.i = (c.i + 1) % c.buf.length;
      s += y;
    }
    sal[n] = s / combs.length;
  }
  for (const d of [556, 225]) {
    const buf = new Float32Array(d); let i = 0;
    for (let n = 0; n < N; n++) { const y = buf[i]; const x = sal[n]; buf[i] = x + y * 0.5; sal[n] = y - x * 0.5; i = (i + 1) % d; }
  }
  return sal;
}
const rL = reverb(envL, [1557, 1617, 1491, 1422]), rR = reverb(envR, [1580, 1640, 1514, 1445]);

// ── Mezcla final ──────────────────────────────────────────────────────────
let pico = 0;
for (let n = 0; n < N; n++) {
  const t = n / SR;
  const fin = t > DUR - 0.8 ? Math.max(0, (DUR - t) / 0.8) : 1;
  L[n] = Math.tanh((L[n] + rL[n] * 0.9) * 1.25) * fin;
  R[n] = Math.tanh((R[n] + rR[n] * 0.9) * 1.25) * fin;
  pico = Math.max(pico, Math.abs(L[n]), Math.abs(R[n]));
}
const ganancia = 0.89 / pico; // ≈ −1 dBFS
const datos = Buffer.alloc(44 + N * 4);
datos.write("RIFF", 0); datos.writeUInt32LE(36 + N * 4, 4); datos.write("WAVE", 8);
datos.write("fmt ", 12); datos.writeUInt32LE(16, 16); datos.writeUInt16LE(1, 20); datos.writeUInt16LE(2, 22);
datos.writeUInt32LE(SR, 24); datos.writeUInt32LE(SR * 4, 28); datos.writeUInt16LE(4, 32); datos.writeUInt16LE(16, 34);
datos.write("data", 36); datos.writeUInt32LE(N * 4, 40);
for (let n = 0; n < N; n++) {
  datos.writeInt16LE(Math.round(L[n] * ganancia * 32767), 44 + n * 4);
  datos.writeInt16LE(Math.round(R[n] * ganancia * 32767), 46 + n * 4);
}
writeFileSync(process.argv[2] ?? "musica.wav", datos);
console.log("listo, pico", pico.toFixed(2));
