/**
 * Offline preview: render the Battle Armor card to a standalone HTML file using
 * the REAL renderer (src/web/ba-card.ts) and the REAL stylesheet
 * (src/web/style.css), so what you open matches what the web app shows.
 *
 * Usage: npx tsx scripts/ba-preview.ts [file.blk] [out.html]
 * Defaults to the Elemental [Laser] fixture -> ba-card-preview.html.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { convertAny } from "../src/core/index.js";
import { renderBACard } from "../src/web/ba-card.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const input = process.argv[2] ?? join(root, "tests/fixtures/Elemental Laser.blk");
const outPath = process.argv[3] ?? join(root, "ba-card-preview.html");

const text = readFileSync(input, "utf8");
const result = convertAny(text, input);
if (result.kind !== "battlearmor") {
  throw new Error(`${input} is not a Battle Armor (.blk) unit`);
}

const css = readFileSync(join(root, "src/web/style.css"), "utf8");
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>BA card preview — ${result.card.name}</title>
<style>${css}</style></head>
<body><main id="app"><section class="output">${renderBACard(result.card)}</section></main></body></html>`;

writeFileSync(outPath, html, "utf8");
process.stdout.write(`Wrote ${outPath}\n`);
