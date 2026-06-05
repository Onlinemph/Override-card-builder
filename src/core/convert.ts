/**
 * Conversion math: typed `Unit` -> `OverrideCard`.
 *
 * PURE module: no Node/browser/filesystem imports. Fully decoupled from the
 * parser — it consumes a `Unit` and knows nothing about MTF text. Every formula
 * is sourced from constants.ts; the only literals here are structural (0, the
 * mins already named in constants).
 *
 * v1 SCOPE: one weapon per TIC. The following are intentionally left as clearly
 * marked TODO hooks and are NOT implemented:
 *   - TIC grouping (summing several weapons into one TIC before dividing by 3)
 *   - page-43 range-bracket modifiers
 *   - M/C dice
 */

import {
  ARM_LEG_ARMOR_DIVISOR,
  HEAD_ARMOR_LOOKUP,
  HEAT_DISSIPATION_DIVISOR,
  HEAT_PER_DOUBLE_SINK,
  HEAT_PER_SINGLE_SINK,
  M_DICE_DIVISOR,
  MIN_ARM_LEG_ARMOR,
  MIN_STRUCTURE,
  MISSILE_WEAPON_FAMILIES,
  REAR_ARMOR_DIVISOR,
  STRUCTURE_DIVISOR,
  WEAPON_RANGES,
  TMM_BY_RUN,
  TMM_JUMP_BONUS,
  TMM_SPRINT_BONUS,
  TORSO_ARMOR_DIVISOR,
  TORSO_STRUCTURE_BY_TONNAGE,
  WEAPON_DAMAGE,
  WEAPON_DAMAGE_CLAN,
  WEAPON_DAMAGE_DIVISOR,
} from "./constants.js";
import type {
  CardWeapon,
  DamageProfile,
  OverrideCard,
  RangeBrackets,
  TechBase,
  Unit,
  Weapon,
  WeaponRange,
} from "./types.js";

// ---------------------------------------------------------------------------
// Rounding helpers — explicit and used per field. Damage rounds UP;
// armor/structure/heat round to NEAREST. Never use one mode everywhere.
// ---------------------------------------------------------------------------

/** Round toward +Infinity. Used for weapon damage. */
export function roundUp(n: number): number {
  return Math.ceil(n);
}

/** Round to the nearest integer (.5 rounds up). Used for armor/structure/heat. */
export function roundNearest(n: number): number {
  return Math.round(n);
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

/** Head armor: first bracket whose maxTw >= the head's TW armor. */
export function lookupHeadArmor(headTw: number): number {
  for (const bracket of HEAD_ARMOR_LOOKUP) {
    if (headTw <= bracket.maxTw) return bracket.armor;
  }
  // HEAD_ARMOR_LOOKUP ends at Infinity, so this is unreachable.
  return HEAD_ARMOR_LOOKUP[HEAD_ARMOR_LOOKUP.length - 1]!.armor;
}

/** Base TMM: first bracket whose maxRun >= runMP. Keyed on RUN MP. */
export function lookupTmm(runMP: number): number {
  for (const bracket of TMM_BY_RUN) {
    if (runMP <= bracket.maxRun) return bracket.tmm;
  }
  return TMM_BY_RUN[TMM_BY_RUN.length - 1]!.tmm;
}

/**
 * Normalize an MTF weapon name to a WEAPON_DAMAGE key.
 *
 * Handles the common spelling variants:
 *   - leading ammo/count prefix ("1 Medium Laser")
 *   - attached tech prefix ("ISMediumLaser", "CLERLargeLaser")
 *   - spaced tech prefix ("IS Medium Laser", "Clan ER PPC")
 *   - camelCase / letter-digit run-together ("ISAC20" -> "ac/20")
 *   - "Autocannon/N" -> "ac/N", "AC N" -> "ac/N"
 *   - "LRM-15"/"SRM-6" -> "lrm 15"/"srm 6"
 */
export function normalizeWeaponName(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^\d+\s+/, ""); // drop leading count
  s = s.replace(/^(IS|CL)(?=[A-Z])/, ""); // drop attached tech prefix
  // Split camelCase and letter/digit boundaries: "MediumLaser" -> "Medium Laser".
  s = s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Za-z])(\d)/g, "$1 $2");
  s = s.toLowerCase().replace(/\s+/g, " ").trim();
  s = s.replace(/^(is|cl|clan)\s+/, ""); // drop spaced tech prefix
  s = s.replace(/\bautocannon\//g, "ac/"); // Autocannon/20 -> ac/20
  s = s.replace(/^ac\s+(\d+)/, "ac/$1"); // "ac 20" -> "ac/20"
  s = s.replace(/\b(srm|lrm)\s*-\s*(\d+)/g, "$1 $2"); // srm-6 -> srm 6
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Look up TW damage for a weapon name; unknown=true when not in the table.
 * For Clan units, the Clan override table is consulted first (some weapons do
 * different damage by tech base, e.g. ER PPC: IS 10, Clan 15).
 */
export function lookupWeaponDamage(
  name: string,
  techBase: TechBase = "IS",
): { twDamage: number; unknown: boolean } {
  const key = normalizeWeaponName(name);
  const tw = techBase === "Clan" ? (WEAPON_DAMAGE_CLAN[key] ?? WEAPON_DAMAGE[key]) : WEAPON_DAMAGE[key];
  if (tw === undefined) return { twDamage: 0, unknown: true };
  return { twDamage: tw, unknown: false };
}

// ---------------------------------------------------------------------------
// Field conversions
// ---------------------------------------------------------------------------

/** Weapon group damage (the printed MAX): sum of TW damage / 3, round UP. v1: group of one. */
export function convertWeaponDamage(sumTw: number): number {
  return roundUp(sumTw / WEAPON_DAMAGE_DIVISOR);
}

/**
 * True if a normalized weapon name belongs to a missile family (rolls M dice).
 * Matches on the leading family token so "streak srm 6" hits "streak srm" (not
 * "srm"), and "rocket launcher 10" hits "rocket launcher".
 */
export function isMissileWeapon(normalizedName: string): boolean {
  return MISSILE_WEAPON_FAMILIES.some(
    (family) => normalizedName === family || normalizedName.startsWith(`${family} `),
  );
}

/**
 * Derive the Override damage profile from a rack's TW damage.
 *
 *   max   = ceil(rackTW / 3)
 *   mDice = ceil(rackTW / 10)          (missiles only; 0 for direct-fire)
 *   base  = max(1, floor(rackTW / 10)) (missiles only; === max for direct-fire)
 *
 * Direct-fire weapons (isMissile=false) and zero-damage entries collapse to a
 * flat profile: base === max, mDice 0.
 */
export function computeDamageProfile(twDamage: number, isMissile: boolean): DamageProfile {
  const max = convertWeaponDamage(twDamage);
  if (!isMissile || twDamage <= 0) return { base: max, mDice: 0, max };
  const mDice = roundUp(twDamage / M_DICE_DIVISOR);
  const base = Math.max(1, Math.floor(twDamage / M_DICE_DIVISOR));
  return { base, mDice, max };
}

/** Format a profile for the card: `base+M{mDice} (max)` for missiles, else flat `max`. */
export function formatDamage(p: DamageProfile): string {
  return p.mDice > 0 ? `${p.base}+M${p.mDice} (${p.max})` : `${p.max}`;
}

// ---------------------------------------------------------------------------
// Range brackets (page 43, "Converting Weapon Ranges"). Each bracket reads a
// TW range value and returns a base modifier, or null when the bracket does
// not apply to the weapon ("–" on the card). The weapon's inherent to-hit
// modifier (WeaponRange.toHitMod) is layered on afterward by
// computeRangeBrackets.
// ---------------------------------------------------------------------------

/** Point Blank, from min range: ≥4 → +4, 1–3 → +2, 0 → +0. */
export function bracketPB(min: number): number {
  if (min >= 4) return 4;
  if (min >= 1) return 2;
  return 0;
}

/**
 * Short, from min range: ≥4 → +2, else +0.
 *
 * NOTE: page 43 reads "+2 if the min range value is 4", but DFA cards show LRM
 * (min range 6) at Short +2, so the rule is "4 OR MORE". The oracle wins.
 */
export function bracketS(min: number): number {
  return min >= 4 ? 2 : 0;
}

/** Medium, from medium range: 4–5 → +4, 6–12 → +2, ≥13 → +0, <4 → none. */
export function bracketM(medium: number): number | null {
  if (medium < 4) return null;
  if (medium <= 5) return 4;
  if (medium <= 12) return 2;
  return 0;
}

/** Long, from long range: 13–18 → +4, 19–30 → +2, ≥31 → +0, <13 → none. */
export function bracketL(long: number): number | null {
  if (long < 13) return null;
  if (long <= 18) return 4;
  if (long <= 30) return 2;
  return 0;
}

/** Extreme, from long range: 19–24 → +4, ≥25 → +2, <19 → none. */
export function bracketX(long: number): number | null {
  if (long < 19) return null;
  if (long <= 24) return 4;
  return 2;
}

/** Derive the five Override range brackets from a TW range profile, applying the inherent to-hit modifier. */
export function computeRangeBrackets(r: WeaponRange): RangeBrackets {
  const mod = r.toHitMod ?? 0;
  const add = (v: number | null) => (v === null ? null : v + mod);
  return {
    pb: add(bracketPB(r.min)),
    s: add(bracketS(r.min)),
    m: add(bracketM(r.medium)),
    l: add(bracketL(r.long)),
    x: add(bracketX(r.long)),
  };
}

/** Format one bracket value: null → "–", else a signed integer ("+4", "+0", "-2"). */
export function formatBracket(v: number | null): string {
  if (v === null) return "–";
  return v >= 0 ? `+${v}` : `${v}`;
}

/** Format the full range row "PB S M L X", e.g. "+4 +2 +0 +2 +4". */
export function formatRangeBrackets(b: RangeBrackets): string {
  return [b.pb, b.s, b.m, b.l, b.x].map(formatBracket).join(" ");
}

/** Arm/leg armor: TW / 3, round nearest, min 1. Returns 0 if the location is absent. */
function convertArmLegArmor(tw: number | undefined): number {
  if (tw === undefined) return 0;
  return Math.max(MIN_ARM_LEG_ARMOR, roundNearest(tw / ARM_LEG_ARMOR_DIVISOR));
}

/** Per-section structure: IS / 3, round nearest, min 1. Returns 0 if the location is absent. */
function convertStructure(is: number | undefined): number {
  if (is === undefined) return 0;
  return Math.max(MIN_STRUCTURE, roundNearest(is / STRUCTURE_DIVISOR));
}

/** Heat dissipated per round: count x (2 doubles | 1 single). */
function heatDissipatedPerRound(unit: Unit): number {
  const perSink =
    unit.heatSinks.type === "double" ? HEAT_PER_DOUBLE_SINK : HEAT_PER_SINGLE_SINK;
  return unit.heatSinks.count * perSink;
}

/** Format the printed move string, appending " (J)" when jump MP > 0. */
export function formatMove(walk: number, run: number, jump: number): string {
  return `${walk}/${run}${jump > 0 ? " (J)" : ""}`;
}

function convertWeapon(w: Weapon, techBase: TechBase): CardWeapon {
  const key = normalizeWeaponName(w.name);
  const { twDamage, unknown } = lookupWeaponDamage(w.name, techBase);
  // v1: one weapon per TIC, so each weapon is its own group.
  // TODO(TIC grouping): replace per-weapon conversion with grouped sums.
  const isMissile = !unknown && isMissileWeapon(key);
  const profile = computeDamageProfile(twDamage, isMissile);
  // Range data is a separate, growing table; weapons absent from it have no row.
  const rangeData = WEAPON_RANGES[key];
  const range = rangeData ? computeRangeBrackets(rangeData) : null;
  return {
    name: w.name,
    location: w.location,
    rearMounted: w.rearMounted,
    twDamage,
    damage: profile.max,
    profile,
    damageText: formatDamage(profile),
    range,
    rangeText: range ? formatRangeBrackets(range) : null,
    unknown,
  };
}

// ---------------------------------------------------------------------------
// Top-level conversion
// ---------------------------------------------------------------------------

/**
 * Convert a parsed `Unit` into an `OverrideCard`.
 *
 * TODO(range brackets): apply page-43 range-bracket modifiers to weapon damage.
 * TODO(M/C dice): derive Movement/Combat dice.
 */
export function convertUnit(unit: Unit): OverrideCard {
  const a = unit.armor;
  const warnings: string[] = [];

  // Torso / rear armor (missing locations count as 0).
  const torso = roundNearest(
    ((a.CT ?? 0) + (a.LT ?? 0) + (a.RT ?? 0)) / TORSO_ARMOR_DIVISOR,
  );
  const rear = roundNearest(
    ((a.CTR ?? 0) + (a.LTR ?? 0) + (a.RTR ?? 0)) / REAR_ARMOR_DIVISOR,
  );
  const head = lookupHeadArmor(a.HD ?? 0);

  // Per-section structure: IS / 3, round nearest, min 1. Torso uses CT internal,
  // except where a tonnage correction matches the official builder more closely.
  const s = unit.structure;
  const structure = {
    torso: TORSO_STRUCTURE_BY_TONNAGE[unit.mass] ?? convertStructure(s.CT),
    head: convertStructure(s.HD),
    leftArm: convertStructure(s.LA),
    rightArm: convertStructure(s.RA),
    leftLeg: convertStructure(s.LL),
    rightLeg: convertStructure(s.RL),
  };

  const heatDissipation = roundNearest(
    heatDissipatedPerRound(unit) / HEAT_DISSIPATION_DIVISOR,
  );

  const tmm = lookupTmm(unit.movement.runMP);

  const weapons = unit.weapons.map((w) => convertWeapon(w, unit.techBase));
  for (const w of weapons) {
    if (w.unknown) {
      warnings.push(`weapon not in TW damage table: "${w.name}" (damage set to 0)`);
    }
  }

  return {
    name: `${unit.chassis} ${unit.model}`.trim(),
    chassis: unit.chassis,
    model: unit.model,
    mass: unit.mass,
    techBase: unit.techBase,
    move: formatMove(unit.movement.walkMP, unit.movement.runMP, unit.movement.jumpMP),
    walkMove: unit.movement.walkMP,
    runMove: unit.movement.runMP,
    jump: unit.movement.jumpMP,
    tmm,
    tmmSprint: tmm + TMM_SPRINT_BONUS,
    tmmJump: tmm + TMM_JUMP_BONUS,
    armor: {
      torso,
      rear,
      head,
      leftArm: convertArmLegArmor(a.LA),
      rightArm: convertArmLegArmor(a.RA),
      leftLeg: convertArmLegArmor(a.LL),
      rightLeg: convertArmLegArmor(a.RL),
    },
    structure,
    heatDissipation,
    weapons,
    warnings,
    sourceFile: unit.sourceFile,
  };
}
