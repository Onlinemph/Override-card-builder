/**
 * BLK parser: MegaMek .blk "building block" text -> typed unit.
 *
 * PURE module: no Node/browser/filesystem imports. Mirrors the contract of
 * parser.ts (text + optional filename -> physical facts), reusing the same
 * loud-failure policy via `ParseError`.
 *
 * BLK is a tag-delimited format:
 *
 *   <UnitType>
 *   BattleArmor
 *   </UnitType>
 *
 *   <Squad Equipment>
 *   CLERSmallLaser:LA
 *   </Squad Equipment>
 *
 * Scope: BattleArmor and Tank (combat vehicles). Other unit types (Aero,
 * Infantry, …) parse far enough to identify the type, then the dispatcher
 * throws a clear "unsupported" error. The block reader is generic, so extending
 * to further types is additive.
 */

import { BA_WEIGHT_CLASSES, RUN_MP_MULTIPLIER, TECH_BASE_MAP } from "./constants.js";
import { ParseError } from "./parser.js";
import type {
  BAWeightClass,
  BattleArmorUnit,
  BlkMount,
  TechBase,
  VehicleArmorRaw,
  VehicleFacing,
  VehicleMount,
  VehicleUnit,
} from "./types.js";

/** One `<Tag> … </Tag>` block: its tag and the content lines between the tags. */
interface Block {
  /** Tag text exactly as written (e.g. "Squad Equipment"). */
  tag: string;
  /** Lowercased tag, for lookups. */
  key: string;
  /** Non-empty content lines, trimmed. */
  lines: string[];
}

/** True if the text looks like a BLK file (has a `<UnitType>`/`<BlockVersion>` tag). */
export function isBlk(text: string): boolean {
  return /<\s*(unittype|blockversion)\s*>/i.test(text);
}

/** The raw `<UnitType>` value (e.g. "BattleArmor", "Tank"), or undefined. */
export function blkUnitType(text: string): string | undefined {
  const m = text.match(/<\s*unittype\s*>\s*\n\s*([^\n<]+)/i);
  return m ? m[1]!.trim() : undefined;
}

/**
 * Parse the flat list of `<Tag>…</Tag>` blocks. Comment lines (`#…`) and blank
 * lines outside blocks are ignored; blank lines inside a block are dropped.
 * Repeated tags are preserved in order (equipment blocks rely on this).
 */
function readBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));
  let current: Block | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    const open = line.match(/^<\s*([^/<>][^<>]*?)\s*>$/);
    const close = line.match(/^<\s*\/\s*([^<>]*?)\s*>$/);

    if (close && current) {
      blocks.push(current);
      current = null;
      continue;
    }
    if (open) {
      // A new opening tag implicitly closes a malformed/unterminated block.
      if (current) blocks.push(current);
      current = { tag: open[1]!, key: open[1]!.toLowerCase(), lines: [] };
      continue;
    }
    if (!current) continue; // text outside any block (comments/banners)
    if (line === "" || line.startsWith("#")) continue;
    current.lines.push(line);
  }
  if (current) blocks.push(current);
  return blocks;
}

/** First content line of the first block with this (lowercased) tag, or undefined. */
function scalar(blocks: Block[], key: string): string | undefined {
  const b = blocks.find((x) => x.key === key);
  return b?.lines[0];
}

/** First scalar found among several candidate tags. */
function scalarAny(blocks: Block[], keys: string[]): string | undefined {
  for (const k of keys) {
    const v = scalar(blocks, k);
    if (v !== undefined) return v;
  }
  return undefined;
}

function intOr(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const m = value.match(/-?\d+/);
  return m ? Number.parseInt(m[0], 10) : fallback;
}

/** Resolve tech base from `<TechBase>` or the rules-level `<type>` line. */
function resolveTechBase(blocks: Block[]): TechBase {
  const raw = scalarAny(blocks, ["techbase", "type"]);
  if (raw) {
    const lower = raw.toLowerCase();
    for (const [needle, value] of Object.entries(TECH_BASE_MAP)) {
      if (lower.startsWith(needle) || lower.includes(`(${needle}`)) return value;
    }
    if (lower.includes("clan")) return "Clan";
    if (lower.includes("inner sphere") || lower.includes("mixed")) return "IS";
  }
  return "IS"; // default; BA tech base rarely affects the reused weapon tables
}

/** Map the `<weightclass>` index (0..4) to a label; fall back to "Medium". */
function resolveWeightClass(blocks: Block[]): BAWeightClass {
  const idx = intOr(scalarAny(blocks, ["weightclass", "weight_class"]), -1);
  return BA_WEIGHT_CLASSES[idx] ?? "Medium";
}

/**
 * Collect weapon/equipment mounts. Each line is `Name` or `Name:LOC`. If the
 * file lists per-trooper blocks ("Trooper N Equipment"), each line is one mount
 * (copies = 1). Otherwise squad-wide blocks ("Squad Equipment", "Body", any
 * "* Equipment") are carried by every trooper (copies = troopers).
 */
function parseMounts(blocks: Block[], troopers: number): BlkMount[] {
  const trooperBlocks = blocks.filter((b) => /trooper\s*\d+\s*equipment/i.test(b.tag));
  const useTrooper = trooperBlocks.length > 0;
  const source = useTrooper
    ? trooperBlocks
    : blocks.filter((b) => b.key.includes("equipment"));
  const copies = useTrooper ? 1 : troopers;

  const mounts: BlkMount[] = [];
  for (const block of source) {
    for (const line of block.lines) {
      const colon = line.lastIndexOf(":");
      const name = (colon >= 0 ? line.slice(0, colon) : line).trim();
      const mount = colon >= 0 ? line.slice(colon + 1).trim() : "";
      if (name === "") continue;
      mounts.push({ name, mount, copies });
    }
  }
  return mounts;
}

/**
 * Parse BLK text into a `BattleArmorUnit`.
 *
 * @param text  Full contents of the .blk file.
 * @param file  Filename for error messages (defaults to "<unknown>").
 */
export function parseBlkBattleArmor(text: string, file = "<unknown>"): BattleArmorUnit {
  const blocks = readBlocks(text);

  const unitType = scalar(blocks, "unittype");
  if (unitType && unitType.toLowerCase().replace(/\s+/g, "") !== "battlearmor") {
    throw new ParseError(
      `unsupported BLK unit type "${unitType}" (only BattleArmor is supported so far)`,
      file,
      "UnitType",
    );
  }

  const chassis = scalarAny(blocks, ["name", "chassis_name"]);
  if (!chassis) throw new ParseError("missing unit name", file, "Name");
  const model = scalarAny(blocks, ["model"]) ?? "";

  const troopers = intOr(scalarAny(blocks, ["trooper count", "troopers", "squad_size"]), 0);
  if (troopers <= 0) {
    throw new ParseError("missing or invalid trooper count", file, "Trooper Count");
  }

  const walkMP = intOr(scalarAny(blocks, ["cruisemp", "walkmp"]), 1);
  const jumpMP = intOr(scalarAny(blocks, ["jumpingmp", "jumpmp", "vtolmp", "umump"]), 0);
  const motionType = scalarAny(blocks, ["motion_type"]) ?? "Leg";
  const armorPerTrooper = intOr(scalarAny(blocks, ["armor"]), 0);
  const chassisType = (scalarAny(blocks, ["chassis"]) ?? "biped").toLowerCase();

  return {
    kind: "battlearmor",
    chassis,
    model,
    techBase: resolveTechBase(blocks),
    troopers,
    weightClass: resolveWeightClass(blocks),
    walkMP,
    jumpMP,
    motionType,
    armorPerTrooper,
    chassisType,
    mounts: parseMounts(blocks, troopers),
  };
}

// ---------------------------------------------------------------------------
// Combat Vehicles (BLK Tank).
// ---------------------------------------------------------------------------

/** Equipment-block tag (lowercased) -> armor/equipment facing. */
const FACING_BLOCKS: Readonly<Record<string, VehicleFacing>> = {
  "body equipment": "body",
  "front equipment": "front",
  "right equipment": "right",
  "left equipment": "left",
  "rear equipment": "rear",
  "rotor equipment": "rotor",
  "turret equipment": "turret",
  "turret 2 equipment": "turret",
};

/**
 * Parse the `<armor>` block into facings.
 *
 * Ground vehicles list `front, right, left, rear, [turret]`. VTOLs always carry
 * a rotor, so their order is `front, right, left, rear, rotor, [turret]` — the
 * 5th value is the rotor, and a 6th value (if present) is the turret.
 */
function parseVehicleArmor(
  blocks: Block[],
  isVtol: boolean,
): { armor: VehicleArmorRaw; hasTurret: boolean } {
  const block = blocks.find((b) => b.key === "armor");
  const values = (block?.lines ?? [])
    .map((l) => Number.parseInt(l, 10))
    .filter((n) => Number.isFinite(n));
  const at = (i: number) => values[i] ?? 0;
  const base = { front: at(0), right: at(1), left: at(2), rear: at(3) };

  if (isVtol) {
    const hasTurret = values.length >= 6;
    return {
      armor: { ...base, rotor: at(4), ...(hasTurret ? { turret: at(5) } : {}) },
      hasTurret,
    };
  }
  const hasTurret = values.length >= 5;
  return {
    armor: { ...base, ...(hasTurret ? { turret: at(4) } : {}) },
    hasTurret,
  };
}

/** Collect weapon/equipment mounts from the per-facing equipment blocks. */
function parseVehicleMounts(blocks: Block[]): VehicleMount[] {
  const mounts: VehicleMount[] = [];
  for (const block of blocks) {
    const facing = FACING_BLOCKS[block.key];
    if (!facing) continue;
    for (const line of block.lines) {
      const name = line.trim();
      if (name) mounts.push({ name, facing });
    }
  }
  return mounts;
}

/**
 * Parse BLK Tank/VTOL text into a `VehicleUnit`. Throws if the file is neither a
 * Tank nor a VTOL (both share the combat-vehicle card; VTOLs add a rotor).
 *
 * @param text  Full contents of the .blk file.
 * @param file  Filename for error messages (defaults to "<unknown>").
 */
export function parseBlkVehicle(text: string, file = "<unknown>"): VehicleUnit {
  const blocks = readBlocks(text);

  const unitType = scalar(blocks, "unittype");
  const normalizedType = unitType?.toLowerCase();
  if (unitType && normalizedType !== "tank" && normalizedType !== "vtol") {
    throw new ParseError(
      `expected a Tank or VTOL BLK but got unit type "${unitType}"`,
      file,
      "UnitType",
    );
  }

  const chassis = scalarAny(blocks, ["name", "chassis_name"]);
  if (!chassis) throw new ParseError("missing unit name", file, "Name");
  const model = scalarAny(blocks, ["model"]) ?? "";

  const tonnage = Number.parseFloat(scalarAny(blocks, ["tonnage", "weight"]) ?? "0") || 0;
  const motionType = scalarAny(blocks, ["motion_type"]) ?? "Tracked";
  const isVtol = normalizedType === "vtol" || motionType.toLowerCase() === "vtol";
  const cruiseMP = intOr(scalarAny(blocks, ["cruisemp", "walkmp"]), 0);
  const flankRaw = scalarAny(blocks, ["flankmp", "runmp"]);
  const flankMP = flankRaw !== undefined ? intOr(flankRaw, 0) : Math.ceil(cruiseMP * RUN_MP_MULTIPLIER);

  const { armor, hasTurret } = parseVehicleArmor(blocks, isVtol);

  return {
    kind: "vehicle",
    chassis,
    model,
    techBase: resolveTechBase(blocks),
    tonnage,
    motionType,
    cruiseMP,
    flankMP,
    armor,
    hasTurret,
    hasRotor: isVtol,
    mounts: parseVehicleMounts(blocks),
  };
}
