/**
 * Build public/quirk-index.json — a { key -> [quirk, …] } lookup so the web app
 * can optionally show each unit's design quirks on the card.
 *
 * Source: the MUL export (data/mul-units.txt). "Unit Quirks" is column 28
 * (0-indexed 27), before any fluff fields, so it's safe to read by split("|").
 * Keyed by normalized filename base (matches the bundled units) AND by
 * "Chassis Model" name (fallback for pasted text) — same scheme as the BV index.
 *
 * Usage: node scripts/build-quirk-index.mjs [path-to-mul-export.txt]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = process.argv[2] ?? join(root, "data", "mul-units.txt");
const out = join(root, "public", "quirk-index.json");

const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
const base = (p) => (p.replace(/\\/g, "/").split("/").pop() ?? "").replace(/\.(mtf|blk)$/i, "");

const lines = readFileSync(src, "utf8").split("\n");
/** @type {Record<string, string[]>} */
const map = {};
let rows = 0;
for (let i = 1; i < lines.length; i++) {
  const f = lines[i].split("|");
  if (f.length < 28) continue;
  const quirks = (f[27] ?? "").split(";").map((s) => s.trim()).filter(Boolean);
  if (quirks.length === 0) continue;
  rows++;
  const nameKey = norm(`${f[1]} ${f[2]}`);
  if (nameKey) map[nameKey] = quirks;
  const fileLoc = f[f.length - 2];
  if (fileLoc && /\.(mtf|blk)$/i.test(fileLoc)) map[norm(base(fileLoc))] = quirks;
}
writeFileSync(out, JSON.stringify(map));
console.log(`build-quirk-index: ${rows} units with quirks -> ${Object.keys(map).length} keys -> ${out}`);
