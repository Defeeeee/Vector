#!/usr/bin/env node
/**
 * Regenerates src/data/airports.tsv from the OurAirports public-domain dataset.
 *
 *   node scripts/build-airports.mjs
 *
 * Run it every few months — the upstream file changes slowly. The output is
 * committed so the app never depends on network access at build or request time.
 *
 * Columns: ICAO \t name \t municipality \t country \t size(L|M|S|H) \t IATA
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = "https://davidmegginson.github.io/ourairports-data/airports.csv";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src", "data", "airports.tsv");
const OVERLAY = path.join(ROOT, "src", "data", "airports-overlay.tsv");

const SIZE = {
  large_airport: "L",
  medium_airport: "M",
  small_airport: "S",
  heliport: "H",
  seaplane_base: "H",
};

/** Minimal RFC4180 parser — the upstream CSV has quoted commas and escaped quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); field = ""; rows.push(row); row = []; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`Failed to download ${SOURCE}: ${res.status}`);
const rows = parseCsv(await res.text());
const head = rows[0];
const col = Object.fromEntries(head.map((h, i) => [h, i]));

/** ICAO -> tuple. Later writes win, so recovery and overlay override the base pass. */
const airports = new Map();

/**
 * Elevation and coordinates are carried through even though the ICAO resolver
 * does not need them: they are what an aerodrome page can actually show a pilot
 * (field elevation feeds density-altitude thinking) and what a map would plot.
 * Rounding the degrees to 4 decimals is ~11 m of precision — far more than
 * enough to place a marker, and it keeps the file from growing on noise.
 */
const num = (v, dp) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? String(dp === 0 ? Math.round(n) : Number(n.toFixed(dp))) : "";
};

const put = (icao, name, muni, country, type, iata, elev, lat, lon) =>
  airports.set(icao, [
    icao, name, muni || "", country, SIZE[type] || "S", iata || "",
    num(elev, 0), num(lat, 4), num(lon, 4),
  ]);

// Pass 1 — rows whose ident already is an ICAO code.
for (const r of rows.slice(1)) {
  if (r.length < head.length) continue;
  const icao = (r[col.ident] || "").toUpperCase();
  const type = r[col.type];
  if (!/^[A-Z]{4}$/.test(icao) || type === "closed") continue;
  // Worldwide we only carry real airports; for Argentina (SA*) we keep everything,
  // since small aeroclub strips are exactly what a local logbook references.
  const isAr = icao.startsWith("SA");
  if (!isAr && !(type in SIZE && SIZE[type] !== "H")) continue;
  put(icao, r[col.name], r[col.municipality], r[col.iso_country], type, r[col.iata_code],
      r[col.elevation_ft], r[col.latitude_deg], r[col.longitude_deg]);
}

// Pass 2 — OurAirports files many Argentine aerodromes under a placeholder ident
// (AR-0332, SA04, ...) and hides the real ICAO in gps_code/local_code/keywords.
// Without this, common codes like SAAK (Isla Martín García) are simply missing.
let recovered = 0;
for (const r of rows.slice(1)) {
  if (r.length < head.length) continue;
  if (r[col.iso_country] !== "AR" || r[col.type] === "closed") continue;
  const ident = (r[col.ident] || "").toUpperCase();
  if (/^[A-Z]{4}$/.test(ident)) continue;
  const blob = [r[col.gps_code], r[col.local_code], r[col.keywords]].join(" ").toUpperCase();
  for (const icao of new Set(blob.match(/\bSA[A-Z]{2}\b/g) || [])) {
    if (airports.has(icao)) continue;
    put(icao, r[col.name], r[col.municipality], "AR", r[col.type], "",
        r[col.elevation_ft], r[col.latitude_deg], r[col.longitude_deg]);
    recovered++;
  }
}

// Pass 3 — hand-maintained corrections (MADHEL names, aerodromes upstream lacks).
let overlaid = 0;
if (fs.existsSync(OVERLAY)) {
  for (const line of fs.readFileSync(OVERLAY, "utf8").split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    const [icao, name, muni, country, size, iata, elev, lat, lon] = line.split("\t");
    if (!/^[A-Z]{4}$/.test(icao || "")) continue;
    // The overlay keeps its original 6-column shape: the extra three are
    // optional, so existing hand-written rows stay valid and simply carry no
    // elevation or coordinates rather than breaking the parse.
    const prev = airports.get(icao);
    airports.set(icao, [
      icao, name, muni || "", country || "AR", size || "S", iata || "",
      elev ?? prev?.[6] ?? "", lat ?? prev?.[7] ?? "", lon ?? prev?.[8] ?? "",
    ]);
    overlaid++;
  }
}

const out = [...airports.values()].sort((a, b) => a[0].localeCompare(b[0])).map((a) => a.join("\t"));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out.join("\n") + "\n");

console.log(
  `${OUT}: ${out.length} aerodromes ` +
  `(${recovered} recovered from AR placeholders, ${overlaid} from overlay), ` +
  `${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`
);
