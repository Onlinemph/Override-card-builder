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
  IMPORTANT_EQUIPMENT,
  KICK_TW_DIVISOR,
  LOCATION_ORDER,
  M_DICE_DIVISOR,
  MELEE_WEAPONS,
  MIN_ARM_LEG_ARMOR,
  MIN_STRUCTURE,
  MISSILE_WEAPON_FAMILIES,
  PUNCH_TW_DIVISOR,
  RANGE_VARYING_CLUSTER_FAMILIES,
  REAR_ARMOR_DIVISOR,
  STRUCTURE_DIVISOR,
  TIC_MAX_BASE,
  TIC_MAX_DAMAGE,
  WEAPON_DAMAGE_BY_RANGE,
  WEAPON_RANGES,
  WEAPON_RANGES_CLAN,
  TMM_BY_RUN,
  TMM_JUMP_BONUS,
  TMM_SPRINT_BONUS,
  TORSO_ARMOR_DIVISOR,
  TORSO_STRUCTURE_BY_TONNAGE,
  WEAPON_ABBREV,
  WEAPON_DAMAGE,
  WEAPON_DAMAGE_CLAN,
  WEAPON_DAMAGE_DIVISOR,
} from "./constants.js";
import type {
  CardEquipment,
  CardWeapon,
  CritSlot,
  DamageKind,
  DamageProfile,
  OverrideCard,
  RangeBrackets,
  TechBase,
  Tic,
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
 * Normalize an MTF/BLK weapon name to a WEAPON_DAMAGE key.
 *
 * Handles the common spelling variants:
 *   - leading ammo/count prefix ("1 Medium Laser")
 *   - attached tech prefix ("ISMediumLaser", "CLERLargeLaser")
 *   - attached BA prefix ("CLBAERSmallLaser" -> "er small laser")
 *   - spaced tech/BA prefix ("IS Medium Laser", "Clan ER PPC", "BA ER Small Laser")
 *   - "[BA]" suffix ("Flamer [BA]" -> "flamer")
 *   - camelCase / letter-digit run-together ("ISAC20" -> "ac/20")
 *   - "Autocannon/N" -> "ac/N", "AC N" -> "ac/N"
 *   - "LRM-15"/"SRM-6" -> "lrm 15"/"srm 6"
 *   - MG abbreviation ("heavy mg" -> "heavy machine gun")
 *   - trailing OS suffix ("advanced srm 2 os" -> "advanced srm 2")
 */
export function normalizeWeaponName(raw: string): string {
  let s = raw.trim();
  s = s.replace(/\s*\([^)]*\)/g, ""); // drop qualifiers like "(OS)", "(I-OS)", "(Clan)"
  s = s.replace(/\s*\[ba\]/gi, ""); // drop "[BA]" suffix ("Flamer [BA]" -> "Flamer")
  s = s.replace(/^\d+\s+/, ""); // drop leading count
  s = s.replace(/^(IS|CL)(?=[A-Z])/, ""); // drop attached tech prefix ("ISMediumLaser" -> "MediumLaser")
  s = s.replace(/^BA(?=[A-Z])/, ""); // drop attached BA prefix ("BAERSmallLaser" -> "ERSmallLaser")
  // Split an acronym run from a following Capitalized word ("ERSmall" -> "ER
  // Small"), then camelCase and letter/digit boundaries ("MediumLaser" ->
  // "Medium Laser"). The first handles BLK's glued names (e.g. "CLERSmallLaser").
  s = s.replace(/([A-Z])([A-Z][a-z])/g, "$1 $2");
  s = s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Za-z])(\d)/g, "$1 $2").replace(/(\d)([A-Za-z])/g, "$1 $2");
  s = s.toLowerCase().replace(/\s+/g, " ").trim();
  s = s.replace(/^(is|cl|clan)\s+/, ""); // drop spaced tech prefix
  s = s.replace(/^ba\s+/, ""); // drop spaced BA prefix ("ba er small laser" -> "er small laser")
  s = s.replace(/\bautocannon\//g, "ac/"); // Autocannon/20 -> ac/20
  s = s.replace(/\bhyper assault gauss\b/g, "hag"); // Hyper Assault Gauss/30 -> hag/30
  s = s.replace(/\b(ac|hag)\s+(\d+)/g, "$1/$2"); // "ac 20"/"hag 30" -> "ac/20"/"hag/30" (also Rotary/Ultra/Light AC)
  s = s.replace(/\b(srm|lrm)\s*-\s*(\d+)/g, "$1 $2"); // srm-6 -> srm 6
  s = s.replace(/\bmg\b/g, "machine gun"); // MG abbreviation -> full name
  s = s.replace(/\bos\s*$/, "").trimEnd(); // trailing "os" (one-shot variant without parens)
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Compact display label for a weapon, for the Battle Armor firepower table.
 * Uses the curated WEAPON_ABBREV map (e.g. "SLas", "SRM-2") when known, else a
 * cleaned, spaced version of the original name. For Clan units, a lowercase "c"
 * prefix is added to ballistic/missile abbreviations (matching the printed
 * card's "cSRM-2"); energy abbreviations are left unprefixed.
 */
export function abbreviateWeapon(raw: string, techBase: TechBase = "IS"): string {
  const key = normalizeWeaponName(raw);
  const mapped = WEAPON_ABBREV[key];
  if (mapped) {
    const clanPrefixable = /^(srm|lrm|ssrm|ac\/|hag|gauss)/i.test(mapped);
    return techBase === "Clan" && clanPrefixable ? `c${mapped}` : mapped;
  }
  // Fallback: strip qualifiers/tech prefixes and split glued names, keep caps.
  let s = raw.replace(/\([^)]*\)/g, "").replace(/\s*\[ba\]/gi, "").trim();
  s = s.replace(/^(IS|CL|Clan|BA)\s+/i, "").replace(/^(IS|CL|BA)(?=[A-Z])/, "");
  s = s
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2");
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

/**
 * Squad damage for `copies` identical weapons fired together, Battle-Armor style.
 *
 * Unlike a 'Mech TIC (which sums TW and divides once, capped per page 41), each
 * BA trooper fires its own copy independently. So the guaranteed base and any
 * M/C dice scale linearly with the copy count, while the printed max stays
 * ceil(totalTW / 3). Direct-fire and variable weapons collapse to a flat squad
 * value (base === max). Returns a flat zero profile for copies <= 0.
 *
 * Worked example (SRM 2, TW 4 each — single profile 1+M1 (2)):
 *   1 copy → 1+M1 (2)   2 → 2+M2 (3)   4 → 4+M4 (6)   5 → 5+M5 (7)
 */
export function scaleSquadDamage(weapon: CardWeapon, copies: number): DamageProfile {
  const m = Math.max(0, copies);
  const totalTw = weapon.twDamage * m;
  const max = convertWeaponDamage(totalTw);
  const p = weapon.profile;
  if (p.kind === "missile") {
    return { kind: "missile", base: p.base * m, mDice: p.mDice * m, cDice: [], byRange: [], max };
  }
  if (p.kind === "cluster") {
    return { kind: "cluster", base: p.base * m, mDice: 0, cDice: p.cDice.map((c) => c * m), byRange: [], max };
  }
  // direct, variable, or unknown -> flat squad damage.
  return { kind: "direct", base: max, mDice: 0, cDice: [], byRange: [], max };
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

/** Build the point-blank-only range row for a melee weapon (its to-hit mod in PB, rest "–"). */
function meleeRange(tnMod: number): RangeBrackets {
  return { pb: tnMod, s: null, m: null, l: null, x: null };
}

/**
 * Convert one parsed `Weapon` into a `CardWeapon` (damage profile + range
 * brackets). Exported so non-'Mech converters (e.g. Battle Armor) can reuse the
 * identical weapon engine. `mass` is only consulted for tonnage-scaled physical
 * melee weapons; pass 0 when it does not apply.
 */
export function convertWeapon(w: Weapon, techBase: TechBase, mass: number): CardWeapon {
  const key = normalizeWeaponName(w.name);

  // Physical melee weapons (Hatchet/Sword/Mace/Claws): damage from tonnage, not
  // a TW table; point-blank only, with a flat to-hit modifier (page 40).
  const meleeSpec = MELEE_WEAPONS[key];
  if (meleeSpec) {
    const dmg = roundUp(mass / meleeSpec.divisor);
    const profile: DamageProfile = { kind: "direct", base: dmg, mDice: 0, cDice: [], byRange: [], max: dmg };
    const range = meleeRange(meleeSpec.tnMod);
    return {
      name: w.name,
      location: w.location,
      rearMounted: w.rearMounted,
      twDamage: dmg,
      damage: dmg,
      profile,
      damageText: formatDamage(profile),
      range,
      rangeText: formatRangeBrackets(range),
      unknown: false,
    };
  }

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
// TIC grouping (page 41). Auto-group identical weapons in the same location and
// facing, summing their TW before the ÷3, subject to the base/max caps. A
// single weapon is always its own legal TIC even if it exceeds the caps.
// ---------------------------------------------------------------------------

/**
 * Damage used for the ≤ TIC_MAX_BASE cap. Missiles count only their guaranteed
 * base (M dice are not guaranteed); cluster and direct count the full value
 * (clusters can be slug-fired), which equals max.
 */
export function ticCapBase(p: DamageProfile): number {
  return p.kind === "missile" ? p.base : p.max;
}

/** True if a combined profile is within both TIC caps (page 41). */
export function isLegalTicProfile(p: DamageProfile): boolean {
  return ticCapBase(p) <= TIC_MAX_BASE && p.max <= TIC_MAX_DAMAGE;
}

/**
 * True if a proposed set of weapons forms a legal TIC: a single weapon is
 * always legal (even over-cap, e.g. Heavy Gauss); a group must be within the
 * caps and share one location/facing. Used by the editable-grouping UI.
 */
export function isLegalTic(members: CardWeapon[]): boolean {
  if (members.length === 0) return false;
  if (members.length === 1) return true;
  const first = members[0]!;
  const sameLocation = members.every(
    (m) => m.location === first.location && m.rearMounted === first.rearMounted,
  );
  return sameLocation && isLegalTicProfile(buildTic(members).profile);
}

/** Only flat/missile/cluster weapons auto-group; variable, melee, and unknown stand alone. */
function isGroupable(w: CardWeapon): boolean {
  return !w.unknown && (w.profile.kind === "direct" || w.profile.kind === "missile" || w.profile.kind === "cluster");
}

/**
 * Build a TIC from a set of weapons (the unit of manual editing). A single
 * weapon keeps its own profile. For a group, TW is summed and a combined
 * profile derived: missile if any member rolls M dice, else cluster if any
 * rolls C dice, else direct. Range brackets show only when every member shares
 * the same range (mixed-range groups print no bracket row).
 *
 * Callers are responsible for legality (isLegalTicProfile) and for keeping a
 * group within one location/facing — buildTic does not enforce either.
 */
export function buildTic(members: CardWeapon[]): Tic {
  const first = members[0]!;
  if (members.length === 1) {
    return {
      weapons: members,
      label: first.name,
      location: first.location,
      rearMounted: first.rearMounted,
      count: 1,
      profile: first.profile,
      damageText: first.damageText,
      range: first.range,
      rangeText: first.rangeText,
    };
  }

  const keys = members.map((m) => normalizeWeaponName(m.name));
  const summedTw = members.reduce((sum, m) => sum + m.twDamage, 0);
  const kinds = new Set(members.map((m) => m.profile.kind));
  const kind: DamageKind = kinds.has("missile") ? "missile" : kinds.has("cluster") ? "cluster" : "direct";
  const rangeVarying = keys.some(isRangeVaryingCluster);
  const allRocket = keys.every(isRocketLauncher);
  const profile = computeDamageProfile(summedTw, kind, rangeVarying, allRocket);

  const allSameName = keys.every((k) => k === keys[0]);
  const sameRange = members.every((m) => m.rangeText === first.rangeText);
  return {
    weapons: members,
    label: allSameName ? `${members.length}x ${first.name}` : members.map((m) => m.name).join(" + "),
    location: first.location,
    rearMounted: first.rearMounted,
    count: members.length,
    profile,
    damageText: formatDamage(profile),
    range: sameRange ? first.range : null,
    rangeText: sameRange ? first.rangeText : null,
  };
}

/**
 * Auto-group converted weapons into TICs. Identical weapons (same normalized
 * name, location, and facing) are greedily packed into the largest legal TIC,
 * remainder spilling into further TICs. Order follows first appearance.
 */
export function groupIntoTics(weapons: CardWeapon[]): Tic[] {
  const tics: Tic[] = [];
  const used = new Array(weapons.length).fill(false);

  for (let i = 0; i < weapons.length; i++) {
    if (used[i]) continue;
    const w = weapons[i]!;
    used[i] = true;
    const key = normalizeWeaponName(w.name);

    if (!isGroupable(w)) {
      tics.push(buildTic([w])); // variable/melee/unknown: never grouped
      continue;
    }

    // Gather all identical, groupable weapons (same type, location, facing).
    const members = [w];
    for (let j = i + 1; j < weapons.length; j++) {
      const x = weapons[j]!;
      if (
        !used[j] &&
        isGroupable(x) &&
        x.location === w.location &&
        x.rearMounted === w.rearMounted &&
        normalizeWeaponName(x.name) === key
      ) {
        members.push(x);
        used[j] = true;
      }
    }

    // Greedily pack: largest leading subset that stays within the caps (k ≥ 1).
    let remaining = members;
    while (remaining.length > 0) {
      let k = remaining.length;
      while (k > 1) {
        if (isLegalTicProfile(buildTic(remaining.slice(0, k)).profile)) break;
        k--;
      }
      tics.push(buildTic(remaining.slice(0, k)));
      remaining = remaining.slice(k);
    }
  }

  return tics;
}

// ---------------------------------------------------------------------------
// Equipment surfacing: ammo (with bin count) and important gear, from crit slots.
// ---------------------------------------------------------------------------

/** Clean an ammo crit name into a label like "AC/20 Ammo". */
export function ammoLabel(raw: string): string {
  let s = raw
    .replace(/\((?:[^)]*)\)/g, " ") // drop "(Half)", "(Clan)" etc.
    .replace(/\bammo\b/gi, " ")
    .replace(/^\s*(is|cl|clan)\b/i, " ") // leading spaced tech prefix
    .replace(/^\s*(is|cl)(?=[a-z])/i, " ") // leading attached tech prefix (ISAC20)
    .replace(/\b(half|full)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s ? `${s} Ammo` : "Ammo";
}

/**
 * Derive notable equipment from crit slots: ammo (counted by bin) and the
 * curated important-gear list. Grouped by location + label; ammo and jump jets
 * are tallied, other gear shown once. Ordered by location, ammo last.
 */
export function buildEquipment(critSlots: ReadonlyArray<CritSlot>): CardEquipment[] {
  const byKey = new Map<string, CardEquipment>();
  const bump = (label: string, location: CritSlot["location"], category: "ammo" | "equipment", countable: boolean) => {
    const key = `${location}|${category}|${label}`;
    const existing = byKey.get(key);
    if (existing) {
      if (countable) existing.count += 1;
    } else {
      byKey.set(key, { label, location, category, count: 1 });
    }
  };

  for (const slot of critSlots) {
    const lower = slot.name.toLowerCase();
    if (lower.includes("ammo")) {
      bump(ammoLabel(slot.name), slot.location, "ammo", true); // each bin counts
      continue;
    }
    const match = IMPORTANT_EQUIPMENT.find((e) => e.match.some((m) => lower.includes(m)));
    if (match) bump(match.label, slot.location, "equipment", match.countable ?? false);
  }

  const locRank = (loc: CardEquipment["location"]) => {
    const i = LOCATION_ORDER.indexOf(loc);
    return i < 0 ? LOCATION_ORDER.length : i;
  };
  return [...byKey.values()].sort(
    (a, b) =>
      Number(a.category === "ammo") - Number(b.category === "ammo") || // equipment first
      locRank(a.location) - locRank(b.location) ||
      a.label.localeCompare(b.label),
  );
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

  const weapons = unit.weapons.map((w) => convertWeapon(w, unit.techBase, unit.mass));
  for (const w of weapons) {
    if (w.unknown) {
      warnings.push(`weapon not in TW damage table: "${w.name}" (damage set to 0)`);
    }
  }

  // Universal Punch/Kick: Override damage = ceil(classic TW / 3), classic TW =
  // ceil(mass/10) punch, ceil(mass/5) kick. VERIFIED 100t -> 4 / 7.
  // TODO(quads): quad 'Mechs cannot punch — suppress punch when config is Quad.
  const melee = {
    punch: roundUp(roundUp(unit.mass / PUNCH_TW_DIVISOR) / WEAPON_DAMAGE_DIVISOR),
    kick: roundUp(roundUp(unit.mass / KICK_TW_DIVISOR) / WEAPON_DAMAGE_DIVISOR),
  };

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
    tics: groupIntoTics(weapons),
    equipment: buildEquipment(unit.critSlots ?? []),
    melee,
    warnings,
    sourceFile: unit.sourceFile,
  };
}
