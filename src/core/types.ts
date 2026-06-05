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

// ---------------------------------------------------------------------------
// Conversion output — the Override record-card stats produced by convert.ts.
// ---------------------------------------------------------------------------

/**
 * How a weapon's damage is rolled on the Override card.
 *   - direct:   flat damage (base === max, no dice). Lasers, ACs, Gauss, etc.
 *   - variable: flat but range-dependent, printed `short|med|long`. SNPPC, Heavy Gauss.
 *   - missile:  rolls M dice; prints `base+M{mDice} (max)`. LRM/SRM/MRM/RL.
 *   - cluster:  rolls C dice; prints `base+C{cDice}`. LB-X, HAG, Silver Bullet.
 */
export type DamageKind = "direct" | "variable" | "missile" | "cluster";

/**
 * Override damage profile. Direct-fire weapons deal flat damage (base === max,
 * mDice 0, cDice []). Missile racks roll M dice (`base+M{mDice} (max)`). Cluster
 * weapons roll C dice (`base+C{cDice}`), where base + cDice === max. Variable
 * weapons print per-range damage (`byRange` = [short, med, long]).
 */
export interface DamageProfile {
  /** Which dice mechanic this weapon uses. */
  kind: DamageKind;
  /** Guaranteed minimum damage. floor(rackTW/10), min 1 for missile/cluster; === max for direct. */
  base: number;
  /** Number of M (missile) dice = ceil(rackTW / 10). 0 unless kind === "missile". */
  mDice: number;
  /**
   * C (cluster) dice = max − base. Empty unless kind === "cluster". One entry
   * for a range-independent cluster (LB-X); three entries [short, med, long]
   * for a range-varying cluster (HAG), each one lower than the last.
   */
  cDice: number[];
  /** Per-range damage [short, med, long], each ceil(TW/3). Empty unless kind === "variable". */
  byRange: number[];
  /** Maximum damage. For variable weapons this is the short-range value. */
  max: number;
}

/**
 * Total Warfare range profile (in hexes) used to derive Override range
 * brackets. Per page 43, the bracket math only ever reads min, medium, and
 * long range — the short-range value is not used — so only those are stored.
 */
export interface WeaponRange {
  /** Minimum range (TW). 0 if the weapon has none. Drives PB and S. */
  min: number;
  /** Medium-bracket range value (TW). Drives M. */
  medium: number;
  /** Long-bracket range value (TW). Drives L and X. */
  long: number;
  /** Inherent flat to-hit modifier added to every applicable bracket (e.g. MRM +1). Default 0. */
  toHitMod?: number;
}

/**
 * Override range-bracket to-hit modifiers (page 43). `null` means the bracket
 * does not apply to this weapon and prints as "–".
 */
export interface RangeBrackets {
  /** Point Blank. */
  pb: number | null;
  /** Short. */
  s: number | null;
  /** Medium. */
  m: number | null;
  /** Long. */
  l: number | null;
  /** Extreme. */
  x: number | null;
}

/** A weapon as it appears on the Override card. */
export interface CardWeapon {
  /** Weapon name from the MTF. */
  name: string;
  /** Normalized location code. */
  location: MechLocation;
  /** Rear-mounted flag carried from parsing. */
  rearMounted: boolean;
  /** Total Warfare damage looked up for this weapon (0 if unknown). */
  twDamage: number;
  /** Converted Override damage (the MAX): roundUp(twDamage / 3). v1 = one weapon per TIC. */
  damage: number;
  /** Full damage profile (base / mDice / max). */
  profile: DamageProfile;
  /** Printed damage string: `base+M{mDice} (max)` for missiles, else flat `max`. */
  damageText: string;
  /** Range-bracket modifiers (page 43), or null when the weapon has no range data yet. */
  range: RangeBrackets | null;
  /** Printed range row "PB S M L X" (e.g. "+4 +2 +0 +2 +4"), or null when range data is missing. */
  rangeText: string | null;
  /** True when the weapon name was not found in the TW damage table. */
  unknown: boolean;
}

/** Per-section armor on the Override card. */
export interface CardArmor {
  /** (CT + LT + RT) / 6, round nearest. */
  torso: number;
  /** (CTr + LTr + RTr) / 6, round nearest. */
  rear: number;
  /** Head-armor bracket lookup on head TW. */
  head: number;
  /** TW / 3, round nearest, min 1 (0 if location absent). */
  leftArm: number;
  rightArm: number;
  leftLeg: number;
  rightLeg: number;
}

/** Per-section internal structure on the Override card. Each = IS / 3, round nearest, min 1. */
export interface CardStructure {
  /** Torso structure, from center-torso internal structure. */
  torso: number;
  head: number;
  leftArm: number;
  rightArm: number;
  leftLeg: number;
  rightLeg: number;
}

/** Converted Override record-card statistics for one unit. */
export interface OverrideCard {
  /** "Chassis Model". */
  name: string;
  chassis: string;
  model: string;
  mass: number;
  techBase: TechBase;
  /** Printed move string, e.g. "8/12" or "5/8 (J)". */
  move: string;
  walkMove: number;
  runMove: number;
  jump: number;
  /** Base TMM (what the card prints). */
  tmm: number;
  /** Base TMM + sprint bonus (exposed, not printed). */
  tmmSprint: number;
  /** Base TMM + jump bonus (exposed; meaningful only when jump > 0). */
  tmmJump: number;
  armor: CardArmor;
  /** Per-section structure: IS / 3, round nearest, min 1 (torso from CT). */
  structure: CardStructure;
  /** Total dissipated per round / 5, round nearest. */
  heatDissipation: number;
  weapons: CardWeapon[];
  /** Non-fatal notes (e.g. weapons missing from the TW damage table). */
  warnings: string[];
  sourceFile?: string;
}
