/**
 * MTF parser: MegaMek .mtf text -> typed `Unit`.
 *
 * PURE module: no Node/browser/filesystem imports. The caller (CLI) reads the
 * file and passes the text plus an optional filename used only for error
 * messages. The parser is deliberately decoupled from the conversion math
 * (convert.ts) — it produces physical facts only.
 *
 * Failure policy: fail loudly. Every error names the source file and the
 * missing/malformed field via `ParseError`.
 */

import {
  ARMOR_KEY_MAP,
  INTERNAL_STRUCTURE_BY_TONNAGE,
  RUN_MP_MULTIPLIER,
  TECH_BASE_MAP,
  WEAPON_LOCATION_MAP,
  structureRowToLocations,
} from "./constants.js";
import type {
  Engine,
  HeatSinkType,
  MechLocation,
  Movement,
  TechBase,
  Unit,
  Weapon,
} from "./types.js";

/** Error thrown for any malformed/missing MTF field. Always names the file. */
export class ParseError extends Error {
  constructor(
    message: string,
    public readonly file: string,
    public readonly field?: string,
  ) {
    const where = field ? ` [field: ${field}]` : "";
    super(`${file}: ${message}${where}`);
    this.name = "ParseError";
  }
}

interface RawLine {
  /** Raw text, trimmed of surrounding whitespace and trailing CR. */
  text: string;
  /** 1-based line number for diagnostics. */
  lineNo: number;
}

/**
 * Parse MTF text into a `Unit`.
 *
 * @param text  Full contents of the .mtf file.
 * @param file  Filename for error messages (defaults to "<unknown>").
 */
export function parseMtf(text: string, file = "<unknown>"): Unit {
  const lines = splitLines(text);

  const { chassis, model } = parseNames(lines, file);
  const mass = parseMass(lines, file);
  const techBase = parseTechBase(lines, file);
  const config = getValue(lines, "config") ?? "Biped";
  const engine = parseEngine(lines, file);
  const movement = parseMovement(lines, file);
  const heatSinks = parseHeatSinks(lines, file);
  const armor = parseArmor(lines, file);
  const structure = deriveStructure(mass, file);
  const weapons = parseWeapons(lines, file);

  return {
    chassis,
    model,
    mass,
    techBase,
    config,
    engine,
    movement,
    heatSinks,
    armor,
    structure,
    weapons,
  };
}

// ---------------------------------------------------------------------------
// Line helpers
// ---------------------------------------------------------------------------

function splitLines(text: string): RawLine[] {
  return text.split("\n").map((raw, i) => ({
    text: raw.replace(/\r$/, "").trim(),
    lineNo: i + 1,
  }));
}

/**
 * Return the value of the first `key:value` line (case-insensitive key match),
 * or undefined. Splits on the FIRST colon so values may contain colons.
 */
function getValue(lines: RawLine[], key: string): string | undefined {
  const want = key.toLowerCase();
  for (const { text } of lines) {
    const idx = text.indexOf(":");
    if (idx < 0) continue;
    if (text.slice(0, idx).trim().toLowerCase() === want) {
      return text.slice(idx + 1).trim();
    }
  }
  return undefined;
}

function requireValue(lines: RawLine[], key: string, file: string): string {
  const v = getValue(lines, key);
  if (v === undefined || v === "") {
    throw new ParseError(`missing required field "${key}"`, file, key);
  }
  return v;
}

/** Parse an integer, throwing a ParseError naming the field on failure. */
function parseIntStrict(value: string, field: string, file: string): number {
  const m = value.match(/-?\d+/);
  if (!m) {
    throw new ParseError(`expected a number but got "${value}"`, file, field);
  }
  return Number.parseInt(m[0], 10);
}

// ---------------------------------------------------------------------------
// Field parsers
// ---------------------------------------------------------------------------

/**
 * Chassis/model. Supports two MTF conventions:
 *   - keyed:   `chassis:Locust` / `model:LCT-1V`
 *   - legacy:  a leading `Version:x.y` line, then chassis and model each on
 *              their own keyless line.
 */
function parseNames(lines: RawLine[], file: string): { chassis: string; model: string } {
  const chassis = getValue(lines, "chassis");
  const model = getValue(lines, "model");
  if (chassis && model) {
    return { chassis, model };
  }

  // Legacy format: Version: line followed by two keyless lines.
  const nonEmpty = lines.filter((l) => l.text !== "");
  if (nonEmpty[0] && /^version:/i.test(nonEmpty[0].text)) {
    const c = nonEmpty[1]?.text;
    const m = nonEmpty[2]?.text;
    if (c && m && !c.includes(":") && !m.includes(":")) {
      return { chassis: c, model: m };
    }
  }

  if (!chassis) throw new ParseError(`missing chassis name`, file, "chassis");
  throw new ParseError(`missing model name`, file, "model");
}

function parseMass(lines: RawLine[], file: string): number {
  const mass = parseIntStrict(requireValue(lines, "mass", file), "mass", file);
  if (mass <= 0) throw new ParseError(`invalid mass ${mass}`, file, "mass");
  return mass;
}

function parseTechBase(lines: RawLine[], file: string): TechBase {
  // Common key is "TechBase"; some files use "Tech Base".
  const raw = getValue(lines, "techbase") ?? getValue(lines, "tech base");
  if (raw === undefined) {
    throw new ParseError(`missing tech base`, file, "TechBase");
  }
  // Match on a known prefix (handles "Mixed (IS Chassis)" etc. loosely).
  const lower = raw.toLowerCase();
  for (const [needle, value] of Object.entries(TECH_BASE_MAP)) {
    if (lower.startsWith(needle)) return value;
  }
  throw new ParseError(`unrecognized tech base "${raw}"`, file, "TechBase");
}

/** Engine line, e.g. "160 Fusion Engine", "300 XL Engine(Clan)". */
function parseEngine(lines: RawLine[], file: string): Engine {
  const raw = requireValue(lines, "engine", file);
  const rating = parseIntStrict(raw, "engine", file);
  // Type = words after the rating, with "Engine" and any parenthetical removed.
  const type = raw
    .replace(/^\s*\d+\s*/, "")
    .replace(/\bengine\b/i, "")
    .replace(/\(.*?\)/g, "")
    .trim();
  return { rating, type: type || "Fusion" };
}

/**
 * Movement: Walk MP (required), Jump MP (optional, default 0), and Run MP
 * (explicit if present, else ceil(walk * 1.5)).
 */
function parseMovement(lines: RawLine[], file: string): Movement {
  const walkMP = parseIntStrict(requireValue(lines, "walk mp", file), "Walk MP", file);

  const jumpRaw = getValue(lines, "jump mp");
  const jumpMP = jumpRaw === undefined ? 0 : parseIntStrict(jumpRaw, "Jump MP", file);

  const runRaw = getValue(lines, "run mp");
  let runMP: number;
  let runDerived: boolean;
  if (runRaw === undefined || runRaw === "") {
    runMP = Math.ceil(walkMP * RUN_MP_MULTIPLIER);
    runDerived = true;
  } else {
    runMP = parseIntStrict(runRaw, "Run MP", file);
    runDerived = false;
  }

  return { walkMP, runMP, jumpMP, runDerived };
}

/** Heat sinks line, e.g. "10 Single", "20 Double (Clan)". */
function parseHeatSinks(lines: RawLine[], file: string): { count: number; type: HeatSinkType } {
  const raw = requireValue(lines, "heat sinks", file);
  const count = parseIntStrict(raw, "Heat Sinks", file);
  const type: HeatSinkType = /double/i.test(raw) ? "double" : "single";
  return { count, type };
}

/**
 * Per-location armor. Armor lines look like `LT Armor:8` or `RTC armor:3`. The
 * key before "armor"/"armour" is normalized via ARMOR_KEY_MAP, covering the
 * rear-line spelling variants across MTF versions.
 */
function parseArmor(lines: RawLine[], file: string): Partial<Record<MechLocation, number>> {
  const armor: Partial<Record<MechLocation, number>> = {};

  for (const { text } of lines) {
    const m = text.match(/^([A-Za-z]{2,3})\s+armou?r\s*:\s*(-?\d+)/i);
    if (!m) continue;
    const key = m[1]!.toUpperCase();
    const loc = ARMOR_KEY_MAP[key];
    if (!loc) continue; // skip unknown armor keys rather than guessing
    armor[loc] = Number.parseInt(m[2]!, 10);
  }

  if (Object.keys(armor).length === 0) {
    throw new ParseError(`no armor lines found`, file, "Armor");
  }
  return armor;
}

/**
 * Internal structure is NOT in MTF text — derive it from tonnage via the
 * standard table. Throws if the tonnage is not a standard 'Mech weight.
 */
function deriveStructure(mass: number, file: string) {
  const row = INTERNAL_STRUCTURE_BY_TONNAGE[mass];
  if (!row) {
    throw new ParseError(
      `no internal-structure table entry for ${mass} tons`,
      file,
      "mass/structure",
    );
  }
  return structureRowToLocations(row);
}

/**
 * Weapons block: a `Weapons:N` line followed by N entries "Name, Location".
 * A trailing "(R)" on the name marks a rear-mounted weapon.
 */
function parseWeapons(lines: RawLine[], file: string): Weapon[] {
  const idx = lines.findIndex((l) => /^weapons\s*:/i.test(l.text));
  if (idx < 0) {
    throw new ParseError(`missing weapons block`, file, "Weapons");
  }

  const count = parseIntStrict(lines[idx]!.text.split(":")[1] ?? "", "Weapons", file);
  const weapons: Weapon[] = [];

  let cursor = idx + 1;
  while (weapons.length < count && cursor < lines.length) {
    const line = lines[cursor]!;
    cursor++;
    if (line.text === "") continue;

    const comma = line.text.lastIndexOf(",");
    if (comma < 0) {
      throw new ParseError(
        `malformed weapon line "${line.text}" (expected "Name, Location")`,
        file,
        "Weapons",
      );
    }

    let name = line.text.slice(0, comma).trim();
    let rawLocation = line.text.slice(comma + 1).trim();

    // Rear-mounted flag. MTF variants put the "(R)" marker on either side:
    // "Medium Laser (R), Center Torso" or "Medium Laser, Center Torso (R)".
    const rearRe = /\(\s*r\s*\)$/i;
    const rearMounted = rearRe.test(name) || rearRe.test(rawLocation);
    name = name.replace(rearRe, "").trim();
    rawLocation = rawLocation.replace(rearRe, "").trim();

    const loc = WEAPON_LOCATION_MAP[rawLocation.toLowerCase()];
    if (!loc) {
      throw new ParseError(
        `unknown weapon location "${rawLocation}" for "${name}"`,
        file,
        "Weapons",
      );
    }

    weapons.push({ name, location: loc, rawLocation, rearMounted });
  }

  if (weapons.length < count) {
    throw new ParseError(
      `weapons block claims ${count} entries but only ${weapons.length} found`,
      file,
      "Weapons",
    );
  }
  return weapons;
}
