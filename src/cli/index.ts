#!/usr/bin/env node
/**
 * mtf2override CLI — the Node I/O wrapper around the pure core.
 *
 * This is the ONLY layer allowed to touch the filesystem. It reads .mtf files,
 * calls core (parse -> convert), and writes JSON / CSV / a stdout summary.
 *
 * Usage:
 *   mtf2override <file-or-dir> [<file-or-dir> ...] [options]
 *
 * Options:
 *   --out <dir>   Output directory for per-unit JSON (default: current dir).
 *   --csv         Also write a flat CSV of all units (override-cards.csv).
 *   --no-json     Skip per-unit JSON output (summary/CSV only).
 *   -h, --help    Show this help.
 *
 * Inputs may be individual .mtf files or directories (scanned non-recursively
 * for *.mtf). Exits non-zero if any file fails to parse/convert.
 */

import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";

import { convertUnit, parseMtf, ParseError } from "../core/index.js";
import type { OverrideCard } from "../core/index.js";

interface CliOptions {
  inputs: string[];
  outDir: string;
  csv: boolean;
  json: boolean;
}

function printHelp(): void {
  process.stdout.write(
    [
      "mtf2override — convert MegaMek .mtf files to BattleTech: Override stats",
      "",
      "Usage:",
      "  mtf2override <file-or-dir> [more ...] [options]",
      "",
      "Options:",
      "  --out <dir>   Output directory for per-unit JSON (default: current dir)",
      "  --csv         Also write a flat CSV of all units (override-cards.csv)",
      "  --no-json     Skip per-unit JSON output",
      "  -h, --help    Show this help",
      "",
    ].join("\n"),
  );
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { inputs: [], outDir: process.cwd(), csv: false, json: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    switch (arg) {
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
        break;
      case "--csv":
        opts.csv = true;
        break;
      case "--no-json":
        opts.json = false;
        break;
      case "--out": {
        const dir = argv[++i];
        if (!dir) {
          process.stderr.write("error: --out requires a directory argument\n");
          process.exit(2);
        }
        opts.outDir = resolve(dir);
        break;
      }
      default:
        if (arg.startsWith("-")) {
          process.stderr.write(`error: unknown option "${arg}"\n`);
          process.exit(2);
        }
        opts.inputs.push(arg);
    }
  }
  return opts;
}

/** Expand inputs (files or directories) into a flat list of .mtf file paths. */
function collectMtfFiles(inputs: string[]): string[] {
  const files: string[] = [];
  for (const input of inputs) {
    const path = resolve(input);
    let st;
    try {
      st = statSync(path);
    } catch {
      process.stderr.write(`error: no such file or directory: ${input}\n`);
      process.exit(2);
    }
    if (st.isDirectory()) {
      for (const entry of readdirSync(path)) {
        if (extname(entry).toLowerCase() === ".mtf") files.push(join(path, entry));
      }
    } else if (extname(path).toLowerCase() === ".mtf") {
      files.push(path);
    } else {
      process.stderr.write(`warning: skipping non-.mtf file: ${input}\n`);
    }
  }
  return files;
}

/** Filesystem-safe output name for a card's JSON file. */
function jsonFileName(card: OverrideCard): string {
  const base = `${card.chassis}_${card.model}`.replace(/[^A-Za-z0-9._-]+/g, "_");
  return `${base}.override.json`;
}

function printSummary(card: OverrideCard): void {
  const lines: string[] = [];
  lines.push(`${card.name}  (${card.mass}t ${card.techBase})`);
  lines.push(`  Move ${card.move}   TMM ${card.tmm} (sprint ${card.tmmSprint}, jump ${card.tmmJump})`);
  lines.push(
    `  Armor  torso ${card.armor.torso}  rear ${card.armor.rear}  head ${card.armor.head}` +
      `  arms ${card.armor.leftArm}/${card.armor.rightArm}  legs ${card.armor.leftLeg}/${card.armor.rightLeg}`,
  );
  lines.push(
    `  Structure  torso ${card.structure.torso}  head ${card.structure.head}` +
      `  arms ${card.structure.leftArm}/${card.structure.rightArm}` +
      `  legs ${card.structure.leftLeg}/${card.structure.rightLeg}`,
  );
  lines.push(`  Heat dissipation ${card.heatDissipation}`);
  if (card.weapons.length > 0) {
    lines.push("  Weapons:");
    for (const w of card.weapons) {
      const rear = w.rearMounted ? " (R)" : "";
      const flag = w.unknown ? "  [!] unknown weapon" : "";
      const rng = w.rangeText ? ` [${w.rangeText}]` : "";
      lines.push(`    - ${w.name}${rear} @ ${w.location}: dmg ${w.damageText} (TW ${w.twDamage})${rng}${flag}`);
    }
  }
  lines.push(`  Melee: Punch / Kick ${card.melee.punch} / ${card.melee.kick}`);
  for (const warn of card.warnings) lines.push(`  ! ${warn}`);
  process.stdout.write(lines.join("\n") + "\n\n");
}

/** Build a flat CSV (one row per unit) covering the scalar card fields. */
function toCsv(cards: OverrideCard[]): string {
  const header = [
    "chassis",
    "model",
    "mass",
    "techBase",
    "move",
    "walk",
    "run",
    "jump",
    "tmm",
    "tmmSprint",
    "tmmJump",
    "armorTorso",
    "armorRear",
    "armorHead",
    "armorLeftArm",
    "armorRightArm",
    "armorLeftLeg",
    "armorRightLeg",
    "structureTorso",
    "structureHead",
    "structureLeftArm",
    "structureRightArm",
    "structureLeftLeg",
    "structureRightLeg",
    "heatDissipation",
    "weaponCount",
  ];
  const esc = (v: string | number): string => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = cards.map((c) =>
    [
      c.chassis,
      c.model,
      c.mass,
      c.techBase,
      c.move,
      c.walkMove,
      c.runMove,
      c.jump,
      c.tmm,
      c.tmmSprint,
      c.tmmJump,
      c.armor.torso,
      c.armor.rear,
      c.armor.head,
      c.armor.leftArm,
      c.armor.rightArm,
      c.armor.leftLeg,
      c.armor.rightLeg,
      c.structure.torso,
      c.structure.head,
      c.structure.leftArm,
      c.structure.rightArm,
      c.structure.leftLeg,
      c.structure.rightLeg,
      c.heatDissipation,
      c.weapons.length,
    ]
      .map(esc)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n") + "\n";
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.inputs.length === 0) {
    printHelp();
    process.exit(opts.inputs.length === 0 ? 2 : 0);
  }

  const files = collectMtfFiles(opts.inputs);
  if (files.length === 0) {
    process.stderr.write("error: no .mtf files found in the given inputs\n");
    process.exit(2);
  }

  if (opts.json || opts.csv) mkdirSync(opts.outDir, { recursive: true });

  const cards: OverrideCard[] = [];
  let failures = 0;

  for (const file of files) {
    try {
      const text = readFileSync(file, "utf8");
      const unit = parseMtf(text, basename(file));
      unit.sourceFile = file;
      const card = convertUnit(unit);
      cards.push(card);

      if (opts.json) {
        const outPath = join(opts.outDir, jsonFileName(card));
        writeFileSync(outPath, JSON.stringify(card, null, 2) + "\n", "utf8");
      }
      printSummary(card);
    } catch (err) {
      failures++;
      if (err instanceof ParseError) {
        process.stderr.write(`PARSE ERROR ${err.message}\n`);
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`ERROR ${basename(file)}: ${msg}\n`);
      }
    }
  }

  if (opts.csv && cards.length > 0) {
    const csvPath = join(opts.outDir, "override-cards.csv");
    writeFileSync(csvPath, toCsv(cards), "utf8");
    process.stdout.write(`Wrote CSV: ${csvPath}\n`);
  }

  process.stdout.write(
    `Done: ${cards.length} converted, ${failures} failed${opts.json ? `, JSON in ${opts.outDir}` : ""}.\n`,
  );
  if (failures > 0) process.exit(1);
}

main();
