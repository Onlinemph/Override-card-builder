/**
 * Core domain types for mtf2override.
 *
 * This module is PURE: no Node, browser, or filesystem imports. It must compile
 * and run unchanged in both Node and a browser bundle.
 *
 * The `Unit` type is the contract between the parser (mtf text -> Unit) and the
 * conversion math (Unit -> OverrideCard). Keeping it free of conversion concerns
 * is what lets either layer be swapped or extended independently.
 */

/** Tech base, normalized from the many MTF spellings. */
export type TechBase = "IS" | "Clan";

/** Heat-sink technology. Doubles dissipate 2 heat each; singles 1. */
export type HeatSinkType = "single" | "double";

/**
 * Canonical 'Mech location codes used as keys for armor and structure.
 *
 * Front locations:
 *   HD head, CT/LT/RT torsos, LA/RA arms, LL/RL legs.
 * Rear torso locations (armor only — internal structure is shared with the
 * front torso, so there are no rear structure entries):
 *   CTR center-torso rear, LTR left-torso rear, RTR right-torso rear.
 *
 * NOTE on MTF variants: different MegaMek versions spell the rear lines
 * differently (e.g. `RTC`/`CTR`, `RTL`/`LTR`). The parser normalizes all of
 * them onto these three canonical rear keys.
 */
export type MechLocation =
  | "HD"
  | "CT"
  | "LT"
  | "RT"
  | "LA"
  | "RA"
  | "LL"
  | "RL"
  | "CTR"
  | "LTR"
  | "RTR";

/** Front locations that carry internal structure. */
export type StructureLocation = "HD" | "CT" | "LT" | "RT" | "LA" | "RA" | "LL" | "RL";

/** A single mounted weapon as listed in the MTF weapons block. */
export interface Weapon {
  /** Weapon name exactly as written in the MTF (e.g. "Medium Laser"). */
  name: string;
  /** Normalized location code the weapon is mounted in. */
  location: MechLocation;
  /** Original location text from the file (e.g. "Center Torso"), for diagnostics. */
  rawLocation: string;
  /** True if the weapon was flagged rear-mounted, e.g. "Medium Laser (R)". */
  rearMounted: boolean;
}

/** Movement profile. Override carries these straight to the card at 1:1. */
export interface Movement {
  /** Walk MP as listed in the MTF. */
  walkMP: number;
  /** Run MP. Explicit if present in the file, otherwise ceil(walk * 1.5). */
  runMP: number;
  /** Jump MP (0 if none). */
  jumpMP: number;
  /** True when runMP was derived rather than read from the file. */
  runDerived: boolean;
}

/** Heat-sink loadout. */
export interface HeatSinks {
  /** Number of heat sinks. */
  count: number;
  /** single | double. */
  type: HeatSinkType;
}

/** Engine description parsed from the MTF `Engine:` line. */
export interface Engine {
  /** Engine rating (the leading number, e.g. 160). */
  rating: number;
  /** Engine type label, e.g. "Fusion", "XL", "Light", "XXL". */
  type: string;
}

/**
 * A fully-parsed BattleMech. Physical facts only — no derived game stats.
 *
 * `armor` and `structure` are partial: a given chassis only populates the
 * locations it actually has. Internal structure is NOT present in MTF text; the
 * parser derives it from the standard internal-structure-by-tonnage table
 * (see constants.ts) keyed on `mass`.
 */
export interface Unit {
  chassis: string;
  model: string;
  /** Tonnage. */
  mass: number;
  techBase: TechBase;
  /** Config string from the MTF (e.g. "Biped", "Quad"). */
  config: string;
  engine: Engine;
  movement: Movement;
  heatSinks: HeatSinks;
  /** Armor points per location, including rear torso locations. */
  armor: Partial<Record<MechLocation, number>>;
  /** Internal structure points per front location, derived from tonnage. */
  structure: Partial<Record<StructureLocation, number>>;
  weapons: Weapon[];
  /** Source filename, populated by the CLI for error messages and output naming. */
  sourceFile?: string;
}
