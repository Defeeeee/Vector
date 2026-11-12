// Arma manual/manual.html con los SVG de salida/ adentro.
import fs from "node:fs";
const D = new URL(".", import.meta.url).pathname;
const S = (n) => fs.readFileSync(D + "salida/" + n + ".svg", "utf8").trim().replace(/ width="\d+" height="\d+"/, "");
const M = JSON.parse(fs.readFileSync(D + "salida/medidas.json", "utf8"));
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const SITIO = "https://vectoraero.ar/marca/";

// La construcción: la flecha sin girar en la grilla de 100, y girada.
const G = M.G;
const flechaRecta = (c1, c2) => `<polygon points="${50 - G},6 ${50 - G},64 17,92" fill="${c1}"/><polygon points="${50 + G},6 83,92 ${50 + G},64" fill="${c2}"/>`;
let grilla = "";
for (let i = 0; i <= 100; i += 10) grilla += `<line x1="${i}" y1="0" x2="${i}" y2="100" class="g"/><line x1="0" y1="${i}" x2="100" y2="${i}" class="g"/>`;
const punto = (x, y, t, ax = 4, ay = -3) => `<circle cx="${x}" cy="${y}" r="1.4" class="pt"/><text x="${x + ax}" y="${y + ay}" class="cota">${t}</text>`;
const construccion = `<svg viewBox="-12 -8 124 116" class="constr" role="img" aria-label="Construcción del isotipo en una grilla de 100">
  ${grilla}${flechaRecta("var(--iso1)", "var(--iso2)")}
  ${punto(50, 6, "punta 50,6")}${punto(17, 92, "ala 17,92", -10, 8)}${punto(83, 92, "ala 83,92", -12, 8)}${punto(50, 64, "muesca 50,64", -30, 1.5)}
  <line x1="${50 - G}" y1="22" x2="${50 + G}" y2="22" class="cotal"/><line x1="${50 - G - 0.1}" y1="22" x2="30" y2="22" class="cotal"/><text x="14" y="23.4" class="cota">luz 3</text>
</svg>`;
const girada = `<svg viewBox="-12 -8 124 116" class="constr" role="img" aria-label="El isotipo girado a 045°">
  ${grilla}<line x1="50" y1="50" x2="50" y2="-4" class="eje"/><line x1="50" y1="50" x2="88" y2="12" class="eje"/>
  <path d="M50 30 A20 20 0 0 1 64.1 35.9" class="arco"/><text x="58" y="27" class="cota">45°</text>
  <g transform="rotate(45 50 50)">${flechaRecta("var(--iso1)", "var(--iso2)")}</g>
  <text x="2" y="104" class="cota">rumbo 045: hacia adelante y hacia arriba</text>
</svg>`;

const versiones = [
  ["Horizontal", "logo-horizontal", "La principal. Encabezados, documentos, la web."],
  ["Vertical", "logo-vertical", "Espacios cuadrados: pegatinas, portadas, el cierre de un video."],
  ["Isotipo", "isotipo", "Cuando la marca ya está presente o no hay lugar: íconos, avatares, sellos."],
  ["Logotipo", "logotipo", "Sólo la palabra, para textos corridos y créditos."],
];
const fondos = [
  ["color", "Color · sobre oscuro", "f-noche"],
  ["color-claro", "Color · sobre claro", "f-blanco"],
  ["blanco", "Blanco · sobre color o foto", "f-azul"],
  ["negro", "Negro · una tinta", "f-papel"],
];

const piezasDescarga = [
  ...versiones.flatMap(([, base]) => fondos.map(([v]) => `${base}-${v}`)),
  "icono-app", "icono-app-maskable", "icono-app-cuadrado", "icono-app-azul", "avatar-redes", "favicon",
];
const svgsJson = JSON.stringify(Object.fromEntries(piezasDescarga.map((n) => [n, S(n)])));

const html = `<meta charset="utf-8">
<title>Marca Vector</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Manual oscuro primero, como la marca: la noche es el fondo natural de la flecha en dos tonos. */
:root {
  --noche: #0B0D10; --carbon: #16191E; --linea: #262B33; --blanco: #FFFFFF; --niebla: #9AA7B4;
  --cian: #38BDF8; --azul: #2563EB; --papel: #F3F5F7;
  --bg: var(--noche); --sup: var(--carbon); --fg: #F1F4F7; --sec: var(--niebla); --borde: var(--linea);
  --acento: var(--cian); --iso1: var(--blanco); --iso2: var(--cian);
  --display: "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace;
  color-scheme: dark;
}
@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) {
  --bg: #FFFFFF; --sup: var(--papel); --fg: #0B0D10; --sec: #5B6774; --borde: #E2E6EB; --acento: var(--azul); --iso1: var(--noche); --iso2: var(--azul); color-scheme: light } }
:root[data-theme="light"] { --bg: #FFFFFF; --sup: var(--papel); --fg: #0B0D10; --sec: #5B6774; --borde: #E2E6EB; --acento: var(--azul); --iso1: var(--noche); --iso2: var(--azul); color-scheme: light }
* { box-sizing: border-box }
body { background: var(--bg); color: var(--fg); font: 400 16px/1.6 var(--display); padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
.envoltura { max-width: 1120px; margin: 0 auto; }
h1, h2, h3 { font-weight: 800; letter-spacing: -0.03em; text-wrap: balance; margin: 0 }
h2 { font-size: clamp(32px, 5vw, 56px); line-height: 1.02 }
h2 .b { color: var(--acento) }
h3 { font-size: 18px; letter-spacing: -0.01em }
p { margin: 0; max-width: 62ch; color: var(--sec) }
.eti { font: 500 12px/1 var(--mono); letter-spacing: 0.12em; text-transform: uppercase; color: var(--acento) }
section { padding-block: clamp(56px, 9vw, 120px); border-top: 1px solid var(--borde); display: grid; gap: 28px }
.cab { display: grid; gap: 14px }
/* Portada */
.portada { border-top: 0; padding-block: clamp(48px, 10vw, 140px) clamp(40px, 7vw, 96px); gap: clamp(36px, 6vw, 72px) }
.portada .logo { width: min(640px, 100%) }
.portada .logo svg { width: 100%; height: auto; display: block }
.portada h1 { font-size: clamp(40px, 7vw, 88px); line-height: 0.98 }
.portada h1 .b { color: var(--acento) }
.portada .meta { display: flex; flex-wrap: wrap; gap: 10px 28px; font: 400 13px var(--mono); color: var(--sec) }
/* Grillas */
.dos { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px }
.tarjeta { background: var(--sup); border: 1px solid var(--borde); border-radius: 24px; padding: 24px; display: grid; gap: 12px; min-width: 0 }
.constr { width: 100%; height: auto; display: block }
.constr .g { stroke: var(--borde); stroke-width: 0.25 }
.constr .pt { fill: var(--acento) }
.constr .cota { font: 500 4px var(--mono); fill: var(--sec) }
.constr .cotal, .constr .eje, .constr .arco { stroke: var(--acento); stroke-width: 0.5; fill: none }
.constr .eje { stroke-dasharray: 2 1.5 }
/* Versiones */
.versiones { display: grid; gap: 36px }
.version { display: grid; gap: 14px }
.version .fila { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px }
@media (max-width: 760px) { .version .fila { grid-template-columns: repeat(2, minmax(0, 1fr)) } }
.lienzo { border-radius: 18px; aspect-ratio: 4 / 3; display: grid; place-items: center; padding: 18%; position: relative; border: 1px solid var(--borde) }
.lienzo svg { width: 100%; height: 100%; display: block }
.lienzo .nota { position: absolute; left: 12px; bottom: 10px; font: 500 10.5px var(--mono); letter-spacing: 0.02em }
.f-noche { background: #0B0D10 } .f-noche .nota { color: #9AA7B4 }
.f-blanco { background: #FFFFFF } .f-blanco .nota { color: #5B6774 }
.f-azul { background: #2563EB } .f-azul .nota { color: #DBEAFE }
.f-papel { background: #F3F5F7 } .f-papel .nota { color: #5B6774 }
.copiar { justify-self: start; font: 500 12px var(--mono); color: var(--fg); background: transparent; border: 1px solid var(--borde); border-radius: 999px; padding: 7px 12px; cursor: pointer }
.copiar:hover { border-color: var(--acento) }
.copiar:focus-visible, a:focus-visible { outline: 2px solid var(--acento); outline-offset: 2px }
.botones { display: flex; flex-wrap: wrap; gap: 8px }
/* Resguardo */
.resguardo { background: #0B0D10; border-radius: 24px; padding: clamp(20px, 5vw, 48px); display: grid; place-items: center }
.resguardo svg { width: 100%; max-width: 720px; height: auto }
/* Color */
.colores { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 14px }
.color { border-radius: 20px; overflow: hidden; border: 1px solid var(--borde); background: var(--sup) }
.color .m { height: 120px }
.color .d { padding: 14px 16px; display: grid; gap: 4px }
.color .d b { font-weight: 700 }
.color .d code { font: 400 12px/1.5 var(--mono); color: var(--sec) }
/* Tipografía */
.tipo { display: grid; gap: 18px }
.muestra-display { font: 800 clamp(44px, 8vw, 96px)/0.95 var(--display); letter-spacing: -0.04em }
.muestra-mono { font: 400 15px/1.6 var(--mono); color: var(--sec) }
.escala { display: grid; gap: 10px }
.escala div { display: flex; align-items: baseline; gap: 16px; border-bottom: 1px solid var(--borde); padding-bottom: 10px; min-width: 0 }
.escala span:first-child { font: 500 11px var(--mono); color: var(--sec); width: 92px; flex: none }
.escala span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
/* Íconos */
.iconos { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 22px; align-items: end; background: #E9EDF1; border-radius: 24px; padding: clamp(20px, 4vw, 36px) }
.iconos small, .claro small { color: #4B5563 } .iconos .copiar, .claro .copiar { color: #0B0D10; border-color: #C9D0D8 }
.claro { background: #E9EDF1 !important; border-color: #D5DBE2 !important } .claro h3 { color: #0B0D10 }
.icono { display: grid; gap: 10px; justify-items: start }
.icono svg { width: 100%; max-width: 150px; height: auto; display: block }
.icono small { font: 400 12px var(--mono); color: var(--sec) }
.tamanos { display: flex; align-items: end; gap: 18px; flex-wrap: wrap }
/* No */
.nos { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px }
@media (max-width: 760px) { .nos { grid-template-columns: repeat(2, minmax(0, 1fr)) } }
.no { background: var(--sup); border: 1px solid var(--borde); border-radius: 20px; padding: 16px; display: grid; gap: 10px }
.no .l { background: #0B0D10; border-radius: 12px; height: 110px; display: grid; place-items: center; padding: 18px; overflow: hidden; position: relative }
.no .l svg { width: 100%; height: 100%; display: block }
.no .l::after { content: ""; position: absolute; inset: 0; background: linear-gradient(to top right, transparent calc(50% - 1px), #F43F5E 50%, transparent calc(50% + 1px)) }
.no p { font-size: 13.5px }
/* Aplicaciones */
.apl { display: grid; grid-template-columns: 1.4fr 1fr; gap: 20px }
@media (max-width: 860px) { .apl { grid-template-columns: 1fr } }
.hero { border-radius: 24px; overflow: hidden; background: radial-gradient(120% 90% at 85% 15%, #13314a 0%, #0B0D10 60%); min-height: 360px; padding: 28px; display: grid; align-content: space-between; gap: 40px; border: 1px solid var(--linea) }
.hero .nav { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: #9AA7B4; font-size: 12.5px }
.hero .nav svg { height: 22px; width: auto }
.hero .nav .links { display: flex; gap: 16px; flex-wrap: wrap }
.hero h4 { margin: 0; font: 800 clamp(30px, 4.6vw, 52px)/1 var(--display); letter-spacing: -0.035em; color: #fff; text-wrap: balance }
.hero h4 span { color: #38BDF8 }
.hero .acc { display: flex; gap: 10px; flex-wrap: wrap }
.hero .acc span { font-size: 13px; font-weight: 600; border-radius: 999px; padding: 10px 16px }
.hero .acc .p1 { background: #38BDF8; color: #0B0D10 } .hero .acc .p2 { border: 1px solid #3a4250; color: #fff }
.columna { display: grid; gap: 20px }
.pegatina { background: #F3F5F7; border-radius: 24px; display: grid; place-items: center; padding: 28px; border: 1px solid var(--borde) }
.pegatina .disco { width: 180px; aspect-ratio: 1; border-radius: 50%; background: #0B0D10; display: grid; place-items: center; padding: 34px; box-shadow: 0 10px 30px rgba(11,13,16,.25) }
.pegatina .disco svg { width: 100%; height: auto }
.barra { background: #FFFFFF; border-radius: 24px; padding: 14px 18px; display: flex; align-items: center; gap: 12px; border: 1px solid #E2E6EB }
.barra svg { height: 24px; width: auto } .barra span { margin-left: auto; font-size: 12px; color: #5B6774 }
footer { border-top: 1px solid var(--borde); padding-block: 32px 48px; display: flex; flex-wrap: wrap; gap: 10px 24px; justify-content: space-between; font: 400 12.5px var(--mono); color: var(--sec) }
a { color: var(--acento) }
@media (prefers-reduced-motion: no-preference) { .copiar { transition: border-color .15s } }
</style>

<div class="envoltura">
  <header class="portada" aria-label="Portada">
    <div class="logo" id="logo-portada"></div>
    <h1>Manual de marca.<br><span class="b">La flecha de rumbo, en dos tonos.</span></h1>
    <p>Cómo se dibuja, se usa y se cuida la marca de Vector: la bitácora y el copiloto de los pilotos argentinos, de la carta al CAD.</p>
    <div class="meta"><span>Versión 1.0</span><span>Noviembre de 2026</span><span>vectoraero.ar</span></div>
  </header>

  <section aria-labelledby="t-idea">
    <div class="cab"><span class="eti">La idea</span>
      <h2 id="t-idea">El símbolo con el que <span class="b">un avión se dibuja a sí mismo.</span></h2></div>
    <div class="dos">
      <p>En cualquier carta móvil, el avión propio es una flecha con una muesca atrás. Es lo primero que mira un piloto: dónde estoy y hacia dónde voy. Vector la usa en el Mapa, en vuelo, y por eso es su marca.</p>
      <p>Plegada por el eje, la flecha tiene un lado al sol y otro a la sombra: blanco y cian sobre la noche, negro y azul sobre el papel. Apunta a 045, hacia adelante y hacia arriba, como un ascenso después del despegue. Y un vector es eso: un rumbo y una magnitud.</p>
    </div>
  </section>

  <section aria-labelledby="t-iso">
    <div class="cab"><span class="eti">Isotipo</span>
      <h2 id="t-iso">Cuatro puntos y <span class="b">una luz de tres.</span></h2>
      <p>Se construye en una grilla de 100: la punta, dos alas y la muesca, partido por un eje de 3 unidades. Después se gira 45° alrededor del centro. No se redibuja a mano: los SVG de este manual son la referencia.</p></div>
    <div class="dos">
      <div class="tarjeta">${construccion}<h3>La flecha en la grilla</h3><p>La muesca a 64 deja la flecha esbelta: a 16 px sigue siendo una flecha y no un triángulo.</p></div>
      <div class="tarjeta">${girada}<h3>Girada a 045°</h3><p>El giro es parte del isotipo. Nunca se usa derecha ni con otro ángulo.</p></div>
    </div>
  </section>

  <section aria-labelledby="t-logo">
    <div class="cab"><span class="eti">Logotipo</span>
      <h2 id="t-logo">vector, en minúscula y <span class="b">en curvas.</span></h2>
      <p>Plus Jakarta Sans ExtraBold, con el espaciado a −40. Es la misma familia de la app, así que la marca y el producto hablan igual. La "t" corta en diagonal y repite el ángulo de la flecha. Va siempre en curvas: nunca se escribe con la fuente.</p></div>
    <div class="tarjeta" style="padding:clamp(20px,5vw,48px)"><div id="logo-logotipo" style="max-width:520px"></div></div>
  </section>

  <section aria-labelledby="t-versiones">
    <div class="cab"><span class="eti">Versiones</span>
      <h2 id="t-versiones">Cuatro formas, <span class="b">cuatro fondos.</span></h2>
      <p>Color sobre oscuro es la versión principal. Sobre claro, el cian pasa a azul, porque el cian sobre blanco no se lee. Sobre una foto o un color, va en blanco. A una tinta, en negro.</p></div>
    <div class="versiones" id="versiones"></div>
  </section>

  <section aria-labelledby="t-resguardo">
    <div class="cab"><span class="eti">Área de resguardo y tamaños mínimos</span>
      <h2 id="t-resguardo">Una x de aire <span class="b">alrededor.</span></h2>
      <p>La unidad es la altura de la x del logotipo. Ningún texto, borde o imagen entra a menos de 1 x de la marca. En pantalla, el horizontal no baja de 96 px de ancho y el isotipo, de 16 px. En papel, 24 mm y 5 mm.</p></div>
    <div class="resguardo" id="resguardo"></div>
  </section>

  <section aria-labelledby="t-color">
    <div class="cab"><span class="eti">Color</span>
      <h2 id="t-color">La noche y el cielo, <span class="b">sin degradados.</span></h2>
      <p>Seis colores. El cian y el azul son los acentos: uno por pantalla, para lo que importa. La marca nunca lleva degradados ni sombras: a 32 px se vuelven barro.</p></div>
    <div class="colores">
      ${[
        ["Noche", "#0B0D10", "11 13 16", "Fondo principal, la marca en oscuro."],
        ["Carbón", "#16191E", "22 25 30", "Superficies sobre la noche."],
        ["Blanco", "#FFFFFF", "255 255 255", "Texto sobre oscuro, el lado al sol."],
        ["Cian", "#38BDF8", "56 189 248", "Acento sobre oscuro, el lado a la sombra."],
        ["Azul", "#2563EB", "37 99 235", "Acento sobre claro y botones."],
        ["Niebla", "#9AA7B4", "154 167 180", "Texto secundario sobre oscuro."],
      ].map(([n, h, rgb, u]) => `<div class="color"><div class="m" style="background:${h}"></div><div class="d"><b>${n}</b><code>${h} · RGB ${rgb}</code><p style="font-size:13px">${u}</p></div></div>`).join("")}
    </div>
  </section>

  <section aria-labelledby="t-tipo">
    <div class="cab"><span class="eti">Tipografía</span>
      <h2 id="t-tipo">Una para hablar, <span class="b">otra para los datos.</span></h2></div>
    <div class="dos">
      <div class="tarjeta tipo"><span class="eti">Plus Jakarta Sans · títulos y texto</span><div class="muestra-display">¿Puedo volar hoy?</div>
        <div class="escala"><div><span>Título 1 · 800</span><span style="font:800 32px/1 var(--display);letter-spacing:-.035em">De la carta al CAD.</span></div><div><span>Título 2 · 700</span><span style="font:700 22px/1.2 var(--display)">Te quedan 6,5 h de tu pack</span></div><div><span>Texto · 400</span><span>Cargá un vuelo antes de que se enfríe el motor.</span></div></div></div>
      <div class="tarjeta tipo"><span class="eti">IBM Plex Mono · datos y rótulos</span><div class="muestra-display" style="font-family:var(--mono);font-weight:500;letter-spacing:-.02em">1.2 h</div>
        <p class="muestra-mono">SADF DCT SADM · 201°M · 11,0 NM<br>FERNANDO TORRE 119.00<br>EOBT 1815 · DOF 171026</p><p>Horas, frecuencias, rumbos y códigos. Los rótulos chicos van en mayúscula con aire entre letras.</p></div>
    </div>
  </section>

  <section aria-labelledby="t-iconos">
    <div class="cab"><span class="eti">Ícono de la app y perfiles</span>
      <h2 id="t-iconos">En la pantalla de inicio, <span class="b">de noche.</span></h2>
      <p>El ícono es el isotipo sobre la noche, centrado a ojo (la masa de la flecha está abajo a la izquierda). La versión maskable deja la flecha dentro del círculo seguro de Android. El favicon la agranda: a 16 px el aire alrededor se come la forma.</p></div>
    <div class="iconos" id="iconos"></div>
    <div class="tarjeta claro"><h3>A tamaño real</h3><div class="tamanos" id="tamanos"></div></div>
  </section>

  <section aria-labelledby="t-no">
    <div class="cab"><span class="eti">Usos incorrectos</span>
      <h2 id="t-no">Lo que <span class="b">no se hace.</span></h2></div>
    <div class="nos" id="nos"></div>
  </section>

  <section aria-labelledby="t-apl">
    <div class="cab"><span class="eti">Aplicaciones</span>
      <h2 id="t-apl">La marca <span class="b">trabajando.</span></h2></div>
    <div class="apl">
      <div class="hero" aria-label="Ejemplo de encabezado de la landing">
        <div class="nav"><span id="hero-logo"></span><span class="links"><span>Funciones</span><span>Mapa</span><span>Guías</span><span>Ingresar</span></span></div>
        <h4>Tu bitácora de vuelo,<br><span>siempre al día.</span></h4>
        <div class="acc"><span class="p1">Crear mi bitácora</span><span class="p2">Ver cómo funciona</span></div>
      </div>
      <div class="columna">
        <div class="pegatina" aria-label="Ejemplo de pegatina"><div class="disco" id="pegatina"></div></div>
        <div class="barra" aria-label="Ejemplo de encabezado de la app en claro"><span id="barra-logo"></span><span>Hola, Lucía</span></div>
      </div>
    </div>
  </section>

  <footer><span>Vector · Manual de marca 1.0</span><span>Archivos: copiá el SVG de cada pieza, o en el sitio, ${esc(SITIO)}</span></footer>
</div>

<script>
const SVG = ${svgsJson};
const SITIO = ${JSON.stringify(SITIO)};
const $ = (id) => document.getElementById(id);
$("logo-portada").innerHTML = SVG["logo-horizontal-color"];
// La portada sigue el tema: en claro, la versión para claro.
const enClaro = () => getComputedStyle(document.documentElement).getPropertyValue("color-scheme").trim() === "light";
function tematizar() {
  $("logo-portada").innerHTML = SVG[enClaro() ? "logo-horizontal-color-claro" : "logo-horizontal-color"];
  $("logo-logotipo").innerHTML = SVG[enClaro() ? "logotipo-color-claro" : "logotipo-color"];
}
tematizar();
matchMedia("(prefers-color-scheme: light)").addEventListener("change", tematizar);
new MutationObserver(tematizar).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

async function copiar(nombre, boton) {
  const original = boton.textContent;
  try { await navigator.clipboard.writeText(SVG[nombre]); boton.textContent = "SVG copiado"; }
  catch { boton.textContent = "No se pudo copiar"; }
  setTimeout(() => (boton.textContent = original), 1600);
}
const boton = (nombre, texto = "Copiar SVG") => '<button type="button" class="copiar" data-svg="' + nombre + '">' + texto + "</button>";
document.addEventListener("click", (e) => { const b = e.target.closest("[data-svg]"); if (b) copiar(b.dataset.svg, b); });

const versiones = ${JSON.stringify(versiones)};
const fondos = ${JSON.stringify(fondos)};
$("versiones").innerHTML = versiones.map(([titulo, base, uso]) =>
  '<div class="version"><div class="cab" style="gap:6px"><h3>' + titulo + '</h3><p>' + uso + '</p></div><div class="fila">' +
  fondos.map(([v, nota, f]) => '<div style="display:grid;gap:8px"><div class="lienzo ' + f + '">' + SVG[base + "-" + v] + '<span class="nota">' + nota + "</span></div>" + boton(base + "-" + v) + "</div>").join("") +
  "</div></div>").join("");

// Resguardo: el horizontal con su caja de 1 x alrededor, dibujado a escala.
(() => {
  const X = ${M.X}, W = ${M.ISO_W * ((M.PH * 1.25) / M.ISO_H) + M.X * 0.5 + M.PW}, H = ${M.PH * 1.25};
  const logo = SVG["logo-horizontal-color"].replace(/^<svg[^>]*>|<\\/svg>$/g, "");
  $("resguardo").innerHTML = '<svg viewBox="' + (-X * 1.6) + ' ' + (-X * 1.6) + ' ' + (W + X * 3.2) + ' ' + (H + X * 3.2) + '" role="img" aria-label="Área de resguardo de 1 x alrededor del logo horizontal">' +
    '<rect x="' + (-X) + '" y="' + (-X) + '" width="' + (W + 2 * X) + '" height="' + (H + 2 * X) + '" fill="none" stroke="#38BDF8" stroke-width="1.2" stroke-dasharray="6 5"/>' +
    '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="none" stroke="#262B33" stroke-width="1"/>' + logo +
    '<text x="' + (-X / 2) + '" y="' + (H / 2) + '" fill="#9AA7B4" font-family="IBM Plex Mono, monospace" font-size="14" text-anchor="middle">x</text>' +
    '<text x="' + (W / 2) + '" y="' + (-X / 2 + 5) + '" fill="#9AA7B4" font-family="IBM Plex Mono, monospace" font-size="14" text-anchor="middle">x</text></svg>';
})();

const iconos = [["icono-app", "App · iOS y escritorio"], ["icono-app-maskable", "Android · maskable"], ["avatar-redes", "Perfil en redes"], ["icono-app-azul", "Alternativo · azul"], ["favicon", "Favicon"]];
$("iconos").innerHTML = iconos.map(([n, t]) => '<div class="icono">' + SVG[n] + "<small>" + t + "</small>" + boton(n) + "</div>").join("");
$("tamanos").innerHTML = [16, 32, 48, 64, 120].map((s) => '<div class="icono" style="justify-items:center"><div style="width:' + s + 'px">' + SVG[s <= 32 ? "favicon" : "icono-app"] + "</div><small>" + s + " px</small></div>").join("");

const iso = SVG["isotipo-color"];
const logo = SVG["logo-horizontal-color"];
const nos = [
  [logo.replace("<svg", '<svg style="transform:scaleX(1.35)"'), "No se estira ni se aplasta."],
  [iso.replace("<svg", '<svg style="transform:rotate(-45deg)"'), "No se gira: el ángulo de 045 es parte de la marca."],
  [iso.replace(/#FFFFFF/g, "TMP").replace(/#38BDF8/g, "#FFFFFF").replace(/TMP/g, "#38BDF8"), "No se invierten los dos tonos."],
  [logo.replace("<svg", '<svg style="filter:drop-shadow(0 6px 6px rgba(56,189,248,.9))"'), "Sin sombras, brillos ni degradados."],
  [logo.replace(/fill="#FFFFFF"/g, 'fill="none" stroke="#FFFFFF" stroke-width="2"'), "No se usa en contorno."],
  [logo.replace(/#38BDF8/g, "#F59E0B"), "No se cambian los colores."],
];
$("nos").innerHTML = nos.map(([s, t]) => '<div class="no"><div class="l">' + s + "</div><p>" + t + "</p></div>").join("");

$("hero-logo").innerHTML = SVG["logo-horizontal-color"].replace("<svg", '<svg style="height:22px;width:auto"');
$("pegatina").innerHTML = SVG["logo-vertical-color"];
$("barra-logo").innerHTML = SVG["logo-horizontal-color-claro"].replace("<svg", '<svg style="height:24px;width:auto"');
</script>
`;
fs.mkdirSync(D + "manual", { recursive: true });
fs.writeFileSync(D + "manual/manual.html", html);
console.log("manual.html", (html.length / 1024).toFixed(0), "KB");
