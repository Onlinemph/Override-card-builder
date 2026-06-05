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
  CLUSTER_WEAPON_FAMILIES,
  HEAT_PER_SINGLE_SINK,
  M_DICE_DIVISOR,
  MIN_ARM_LEG_ARMOR,
  MIN_STRUCTURE,
  MISSILE_WEAPON_FAMILIES,
  RANGE_VARYING_CLUSTER_FAMILIES,
  REAR_ARMOR_DIVISOR,
  STRUCTURE_DIVISOR,
  WEAPON_DAMAGE_BY_RANGE,
  WEAPON_RANGES,
  WEAPON_RANGES_CLAN,
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
  DamageKind,
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
  s = s.replace(/\bhyper assault gauss\b/g, "hag"); // Hyper Assault Gauss/30 -> hag/30
  s = s.replace(/\b(ac|hag)\s+(\d+)/g, "$1/$2"); // "ac 20"/"hag 30" -> "ac/20"/"hag/30" (also Rotary/Ultra/Light AC)
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
 * True if a normalized name starts with any family token in the list. A token
 * matches the whole name, a space-delimited prefix ("srm 6", "lb 10-x ac"), or
 * a slash-delimited prefix ("hag/30").
 */
function inFamily(normalizedName: string, families: ReadonlyArray<string>): boolean {
  return families.some(
    (family) =>
      normalizedName === family ||
      normalizedName.startsWith(`${family} `) ||
      normalizedName.startsWith(`${family}/`),
  );
}

/**
 * True if a normalized weapon name belongs to a missile family (rolls M dice).
 * Matches on the leading family token so "streak srm 6" hits "streak srm" (not
 * "srm"), and "rocket launcher 10" hits "rocket launcher".
 */
export function isMissileWeapon(normalizedName: string): boolean {
  return inFamily(normalizedName, MISSILE_WEAPON_FAMILIES);
}

/** True if a normalized weapon name is a cluster weapon (rolls C dice): LB-X, HAG, Silver Bullet Gauss. */
export function isClusterWeapon(normalizedName: string): boolean {
  return inFamily(normalizedName, CLUSTER_WEAPON_FAMILIES);
}

/** True if a cluster weapon's C dice fall off by range (HAG: short/med/long). */
export function isRangeVaryingCluster(normalizedName: string): boolean {
  return inFamily(normalizedName, RANGE_VARYING_CLUSTER_FAMILIES);
}

/** True if a weapon's max rounds to nearest rather than up. Rocket Launchers only (RL10 -> max 3, not 4). */
export function isRocketLauncher(normalizedName: string): boolean {
  return inFamily(normalizedName, ["rocket launcher"]);
}

/** Damage mechanic for a normalized weapon name (zero-damage entries stay direct). */
export function classifyDamage(normalizedName: string): DamageKind {
  if (normalizedName in WEAPON_DAMAGE_BY_RANGE) return "variable";
  if (isMissileWeapon(normalizedName)) return "missile";
  if (isClusterWeapon(normalizedName)) return "cluster";
  return "direct";
}

/**
 * Variable (range-dependent) flat damage from a TW [short, med, long] triple:
 * each bracket is ceil(TW/3). Printed `short|med|long` (SNPPC 4|3|2, HGauss 9|7|4).
 */
export function computeVariableProfile(twByRange: readonly [number, number, number]): DamageProfile {
  const byRange = twByRange.map(roundUp1Third);
  return { kind: "variable", base: byRange[byRange.length - 1]!, mDice: 0, cDice: [], byRange, max: byRange[0]! };
}

/** ceil(tw / 3) — the per-bracket Override damage value. */
function roundUp1Third(tw: number): number {
  return roundUp(tw / WEAPON_DAMAGE_DIVISOR);
}

/**
 * Derive the Override damage profile from a weapon's TW damage.
 *
 *   max   = ceil(rackTW / 3)
 *   base  = max(1, floor(rackTW / 10))   (missile/cluster; === max for direct)
 *   mDice = ceil(rackTW / 10)            (missile only)
 *   cDice = max − base                   (cluster only; HAG falls off −1 per bracket)
 *
 * Direct-fire and zero-damage entries collapse to a flat profile (base === max).
 */
export function computeDamageProfile(
  twDamage: number,
  kind: DamageKind,
  rangeVarying = false,
  maxRoundNearest = false,
): DamageProfile {
  // Rocket Launchers round their max to nearest (RL10 -> 3); everything else
  // rounds up. base/mDice are unaffected.
  const max = maxRoundNearest
    ? Math.round(twDamage / WEAPON_DAMAGE_DIVISOR)
    : convertWeaponDamage(twDamage);
  if (kind === "direct" || kind === "variable" || twDamage <= 0) {
    return { kind: "direct", base: max, mDice: 0, cDice: [], byRange: [], max };
  }
  const base = Math.max(1, Math.floor(twDamage / M_DICE_DIVISOR));
  if (kind === "missile") {
    return { kind, base, mDice: roundUp(twDamage / M_DICE_DIVISOR), cDice: [], byRange: [], max };
  }
  // cluster: base + cDice === max. Range-varying clusters (HAG) shed one C die
  // per bracket: [short, med, long].
  const top = max - base;
  const cDice = rangeVarying ? [top, top - 1, top - 2] : [top];
  return { kind, base, mDice: 0, cDice, byRange: [], max };
}

/**
 * Format a profile for the card:
 *   - missile:  `base+M{mDice} (max)`
 *   - cluster:  `base+C{cDice}` (HAG: `base+C{short}|{med}|{long}`)
 *   - variable: `short|med|long`
 *   - direct:   flat `max`
 */
export function formatDamage(p: DamageProfile): string {
  if (p.kind === "missile") return `${p.base}+M${p.mDice} (${p.max})`;
  if (p.kind === "cluster" && p.cDice[0]! > 0) return `${p.base}+C${p.cDice.join("|")}`;
  if (p.kind === "variable") return p.byRange.join("|");
  return `${p.max}`;
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
  const byRange = WEAPON_DAMAGE_BY_RANGE[key];
  const profile =
    !unknown && byRange
      ? computeVariableProfile(byRange)
      : computeDamageProfile(
          twDamage,
          unknown ? "direct" : classifyDamage(key),
          isRangeVaryingCluster(key),
          isRocketLauncher(key),
        );
  // Range data is a separate, growing table; weapons absent from it have no row.
  // Clan ranges diverge for some weapons (ER lasers, RACs) — consult the Clan
  // override table first for Clan units, then fall back to the shared table.
  const rangeData =
    (techBase === "Clan" ? WEAPON_RANGES_CLAN[key] : undefined) ?? WEAPON_RANGES[key];
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
