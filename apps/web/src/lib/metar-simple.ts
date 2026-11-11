/**
 * Un METAR explicado en palabras simples, para alguien que no es piloto (la familia que mira
 * `/seguir/[token]`). Puro y testeado.
 *
 * Lee el texto crudo del METAR argentino/OACI (`SADF 111500Z 25012G22KT 9999 FEW030 20/12 Q1015`) y
 * devuelve frases. **Lo que no entiende no lo inventa**: un grupo desconocido se ignora y, si falta
 * un dato, no aparece esa línea (invariante 2). El texto crudo se muestra aparte, siempre.
 * Los METAR llevan el cuerpo antes de `RMK` o `TEMPO`/`BECMG`: lo de después no se decodifica.
 */

export interface MetarDecodificado {
  /** Frases en orden: viento, visibilidad, nubes, fenómenos, temperatura, presión. */
  lineas: { rotulo: string; texto: string }[];
}

const PUNTOS = ["norte", "noreste", "este", "sudeste", "sur", "sudoeste", "oeste", "noroeste"];

/** 250° -> "sudoeste". */
export function puntoCardinal(grados: number): string {
  return PUNTOS[Math.round((((grados % 360) + 360) % 360) / 45) % 8];
}

const miles = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const ktAKmh = (kt: number) => Math.round(kt * 1.852);

const FENOMENOS: Record<string, string> = {
  RA: "lluvia",
  DZ: "llovizna",
  SN: "nieve",
  SG: "nieve en granos",
  GR: "granizo",
  GS: "granizo chico",
  PL: "gránulos de hielo",
  FG: "niebla",
  BR: "neblina",
  HZ: "bruma",
  FU: "humo",
  DU: "polvo",
  SA: "arena",
  VA: "ceniza volcánica",
  TS: "tormenta",
  SH: "chaparrones",
  SQ: "turbonada",
  FC: "tromba",
  UP: "precipitación",
};

const COBERTURA: Record<string, string> = {
  FEW: "pocas nubes",
  SCT: "nubes dispersas",
  BKN: "cielo mayormente nublado",
  OVC: "cielo cubierto",
};

function viento(t: string): string | null {
  const m = /^(VRB|\d{3})(\d{2,3})(?:G(\d{2,3}))?(KT|MPS)$/.exec(t);
  if (!m) return null;
  const f = m[4] === "MPS" ? 1.94384 : 1;
  const kt = Math.round(Number(m[2]) * f);
  const raf = m[3] ? Math.round(Number(m[3]) * f) : null;
  if (kt === 0) return "Calmo, sin viento.";
  const de = m[1] === "VRB" ? "de dirección variable" : `del ${puntoCardinal(Number(m[1]))} (${m[1]}°)`;
  const base = `Viento ${de}, a ${kt} nudos (${ktAKmh(kt)} km/h)`;
  return raf && raf > kt ? `${base}, con ráfagas de hasta ${raf} nudos (${ktAKmh(raf)} km/h).` : `${base}.`;
}

function visibilidad(t: string): string | null {
  if (t === "CAVOK") return null;
  const m = /^(\d{4})$/.exec(t);
  if (!m) return null;
  const metros = Number(m[1]);
  if (metros >= 9999) return "Se ve a más de 10 km.";
  return metros >= 1000 ? `Se ve hasta unos ${String(metros / 1000).replace(".", ",")} km.` : `Se ve sólo hasta unos ${metros} m.`;
}

function nube(t: string): string | null {
  const m = /^(FEW|SCT|BKN|OVC)(\d{3})(CB|TCU)?$/.exec(t);
  if (!m) return null;
  const ft = Number(m[2]) * 100;
  const extra = m[3] === "CB" ? " (nubes de tormenta)" : m[3] === "TCU" ? " (nubes de desarrollo vertical)" : "";
  return `${COBERTURA[m[1]]}${extra} a ${miles(ft)} ft (${miles(ft * 0.3048)} m)`;
}

function fenomeno(t: string): string | null {
  const m = /^([-+]|VC)?((?:MI|BC|PR|DR|BL|SH|TS|FZ)?(?:[A-Z]{2})+)$/.exec(t);
  if (!m || /^(FEW|SCT|BKN|OVC|NSC|SKC|CLR|NOSIG|AUTO|COR|CAVOK|VRB|RMK|TEMPO|BECMG)/.test(t)) return null;
  const codigos: string[] = m[2].match(/.{2}/g) ?? [];
  if (!codigos.every((c) => c in FENOMENOS || ["MI", "BC", "PR", "DR", "BL", "FZ"].includes(c))) return null;
  const palabras = codigos.filter((c) => c in FENOMENOS).map((c) => FENOMENOS[c]);
  if (palabras.length === 0) return null;
  const helada = codigos.includes("FZ") ? " congelante" : "";
  const intensidad = m[1] === "-" ? " leve" : m[1] === "+" ? " fuerte" : m[1] === "VC" ? " cerca del aeródromo" : "";
  return `${palabras.join(" con ")}${helada}${intensidad}`;
}

function grados(t: string): number | null {
  return t.startsWith("M") ? -Number(t.slice(1)) : Number(t);
}

export function decodificarMetar(crudo: string): MetarDecodificado {
  const cuerpo = crudo.split(/\b(?:RMK|TEMPO|BECMG)\b/)[0].trim().replace(/=$/, "");
  const grupos = cuerpo.split(/\s+/).filter(Boolean);
  const lineas: MetarDecodificado["lineas"] = [];

  const v = grupos.map(viento).find((x) => x !== null);
  if (v) lineas.push({ rotulo: "Viento", texto: v });

  const cavok = grupos.includes("CAVOK");
  const vis = cavok ? "Se ve a más de 10 km, sin nubes bajas ni mal tiempo (CAVOK)." : grupos.map(visibilidad).find((x) => x !== null);
  if (vis) lineas.push({ rotulo: "Visibilidad", texto: vis });

  const fen = grupos.map(fenomeno).filter((x): x is string => x !== null);
  if (fen.length) lineas.push({ rotulo: "Tiempo", texto: fen.map((f) => f.charAt(0).toUpperCase() + f.slice(1)).join("; ") + "." });

  const nubes = grupos.map(nube).filter((x): x is string => x !== null);
  if (nubes.length) {
    lineas.push({ rotulo: "Nubes", texto: nubes.map((n) => n.charAt(0).toUpperCase() + n.slice(1)).join("; ") + "." });
  } else if (cavok || grupos.some((g) => ["NSC", "SKC", "CLR", "NCD"].includes(g))) {
    lineas.push({ rotulo: "Nubes", texto: "Cielo despejado, sin nubes." });
  } else {
    const vv = grupos.find((g) => /^VV\d{3}$/.test(g));
    if (vv) lineas.push({ rotulo: "Nubes", texto: `Cielo tapado por niebla o precipitación; se ve hasta ${miles(Number(vv.slice(2)) * 100)} ft.` });
  }

  const tr = grupos.map((g) => /^(M?\d{2})\/(M?\d{2})?$/.exec(g)).find((x) => x !== null);
  if (tr) {
    const t = grados(tr[1]);
    const d = tr[2] ? grados(tr[2]) : null;
    if (t !== null) lineas.push({ rotulo: "Temperatura", texto: d !== null ? `${t} °C, con punto de rocío de ${d} °C.` : `${t} °C.` });
  }

  const q = grupos.map((g) => /^Q(\d{4})$/.exec(g)).find((x) => x !== null);
  const a = grupos.map((g) => /^A(\d{4})$/.exec(g)).find((x) => x !== null);
  if (q) lineas.push({ rotulo: "Presión", texto: `${Number(q[1])} hPa (al nivel del mar).` });
  else if (a) lineas.push({ rotulo: "Presión", texto: `${Math.round((Number(a[1]) / 100) * 33.8639)} hPa (al nivel del mar).` });

  return { lineas };
}

/** Qué quiere decir la categoría de vuelo que informa el servicio meteorológico, en palabras de todos los días. */
export function explicarCategoria(c: string | null | undefined): { titulo: string; detalle: string } | null {
  switch ((c ?? "").toUpperCase()) {
    case "VFR":
      return { titulo: "Buen tiempo para volar", detalle: "Buena visibilidad y nubes altas: se puede volar mirando afuera." };
    case "MVFR":
      return { titulo: "Tiempo justo", detalle: "Visibilidad o nubes algo reducidas: se puede volar con más cuidado." };
    case "IFR":
      return { titulo: "Mal tiempo", detalle: "Poca visibilidad o nubes bajas: no se puede volar mirando afuera." };
    case "LIFR":
      return { titulo: "Muy mal tiempo", detalle: "Visibilidad muy baja o nubes muy bajas." };
    default:
      return null;
  }
}
