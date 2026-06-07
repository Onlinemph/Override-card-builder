/**
 * Conventional Infantry conversion: `InfantryUnit` -> `InfantryCard`.
 *
 * PURE module. A platoon's facts (troopers, movement, anti-'Mech, armament) map
 * straight across; towed FIELD GUNS are standard 'Mech-scale weapons and are
 * converted by the shared weapon engine (real damage/range/heat).
 *
 * Small-arms PLATOON damage = (sum of each carrier's per-trooper TW damage) / 3,
 * round up, then split into 2-point clusters (4 -> 2,2; 7 -> 2,2,2,1). The
 * per-trooper values (and the weapon's max range in hexes) live in
 * INFANTRY_WEAPON_DAMAGE; weapons not yet in that table leave the damage and
 * range unscored (empty).
 *
 * Damage DEGRADES as troopers die: `damageByTroopers` recomputes the clusters at
 * every surviving-trooper count (the card's "bodies remaining" marker), and
 * `damageBreaks` compresses that into bands. RANGE is the primary weapon's TW
 * hex range mapped to Override PB/S/M/L/X brackets (thirds model — best-effort,
 * no DFA infantry oracle exists for the bracket boundaries).
 *
 * Movement/TMM mirror the 'Mech rules as a best-effort starting point.
 */

import { INFANTRY_WEAPON_DAMAGE, WEAPON_DAMAGE_DIVISOR } from "./constants.js";
import {
  abbreviatedTicLabel,
  computeRangeBrackets,
  convertWeapon,
  formatRangeBrackets,
  groupIntoTics,
  lookupTmm,
  roundUp,
  ticHeat,
} from "./convert.js";
import type {
  CardWeapon,
  InfantryCard,
  InfantryDamageBreak,
  InfantryUnit,
  RangeBrackets,
  VehicleWeaponRow,
  Weapon,
} from "./types.js";

/** Motion type -> display label + best-effort ground move + jump flag. */
interface MotionSpec {
  label: string;
  move: number;
  jump?: boolean;
}
const MOTION: Readonly<Record<string, MotionSpec>> = {
  leg: { label: "Foot", move: 1 },
  foot: { label: "Foot", move: 1 },
  jump: { label: "Jump", move: 1, jump: true },
  motorized: { label: "Motorized", move: 2 },
  mechanized: { label: "Mechanized", move: 2 },
  wheeled: { label: "Wheeled", move: 3 },
  tracked: { label: "Tracked", move: 3 },
  hover: { label: "Hover", move: 4 },
  vtol: { label: "VTOL", move: 6, jump: true },
  submarine: { label: "Submarine", move: 2 },
  "motorized scuba": { label: "SCUBA", move: 2 },
};

/** Resolve a (possibly "Beast:Horse" / "Leg") motion type to a display + move. */
function motionSpec(raw: string): MotionSpec {
  const lower = raw.toLowerCase();
  if (lower.startsWith("beast")) return { label: "Beast", move: 2 };
  return MOTION[lower] ?? { label: raw, move: 1 };
}

/**
 * Clean an infantry weapon name for display: drop a leading "Infantry" maker
 * prefix and split runtogether camelCase ("InfantrySunbeamStarfire" -> "Sunbeam
 * Starfire"); pass through hyphenated names ("Auto-Rifle") unchanged.
 */
export function cleanInfantryWeapon(raw: string): string {
  let s = raw.trim().replace(/^infantry/i, "");
  s = s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Za-z])(\d)/g, "$1 $2");
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Canonical key for an infantry small arm, for the per-trooper damage table:
 * drop a leading "Infantry" maker prefix, split camelCase, and reduce every
 * non-alphanumeric run (hyphens, parens, commas) to a single space. Parenthetical
 * qualifiers are KEPT as words so variants stay distinct (Portable vs Support).
 *   "Auto-Rifle" / "Auto Rifle"     -> "auto rifle"
 *   "InfantryAssaultRifle"          -> "assault rifle"
 *   "Machine Gun (Portable)"        -> "machine gun portable"
 *   "SRM Launcher (Hvy, One-Shot)"  -> "srm launcher hvy one shot"
 */
export function infantryWeaponKey(raw: string): string {
  let s = raw.trim().replace(/^infantry/i, "");
  s = s
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2");
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Split a damage total into 2-point clusters, with a trailing 1 when odd:
 * 4 -> [2,2], 7 -> [2,2,2,1], 1 -> [1], 0 -> []. How the card prints platoon damage.
 */
export function clusterDamageInto2s(total: number): number[] {
  const clusters: number[] = [];
  let remaining = Math.max(0, total);
  while (remaining >= 2) {
    clusters.push(2);
    remaining -= 2;
  }
  if (remaining > 0) clusters.push(remaining);
  return clusters;
}

/** Per-trooper TW damage + max range (hexes) for a small arm, or undefined when unscored. */
function lookupSmallArm(name: string | undefined): { damage: number; range: number } | undefined {
  if (!name) return undefined;
  return INFANTRY_WEAPON_DAMAGE[infantryWeaponKey(name)];
}

/**
 * Platoon small-arms damage at a given surviving-trooper count `s`, as 2-point
 * clusters. Every survivor fires the primary; the secondary is carried by a
 * fraction of the platoon and thins out proportionally as troopers die
 * (expected secondary survivors = floor(secondaryCarriers x s / troopers)). The
 * summed TW damage is divided by 3 (round up) before clustering.
 */
function platoonDamageAt(unit: InfantryUnit, s: number, primaryDmg: number, secondaryDmg: number | undefined): number[] {
  let totalTw = Math.floor(s * primaryDmg);
  if (secondaryDmg !== undefined && unit.troopers > 0) {
    const secondaryCarriers = unit.secondaryPerSquad * unit.squadCount;
    const surviving = Math.floor((secondaryCarriers * s) / unit.troopers);
    totalTw += Math.floor(surviving * secondaryDmg);
  }
  return clusterDamageInto2s(roundUp(totalTw / WEAPON_DAMAGE_DIVISOR));
}

/**
 * Full damage-degradation track: index i = platoon damage with (i+1) survivors,
 * so the last entry is full strength. Empty when the primary weapon is unscored.
 */
function platoonDamageTrack(unit: InfantryUnit): number[][] {
  const primary = lookupSmallArm(unit.primaryWeapon);
  if (primary === undefined) return [];
  const secondary = lookupSmallArm(unit.secondaryWeapon)?.damage;
  const track: number[][] = [];
  for (let s = 1; s <= unit.troopers; s++) {
    track.push(platoonDamageAt(unit, s, primary.damage, secondary));
  }
  return track;
}

/**
 * Compress a degradation track into breakpoints (full strength first): runs of
 * equal damage collapse into a single {from, to, damage} band. So a 28-trooper
 * platoon that does 2·2·2 down to 20 survivors, then 2·2 down to 13, etc. prints
 * as a handful of rows instead of 28.
 */
export function damageBreakpoints(track: number[][]): InfantryDamageBreak[] {
  const breaks: InfantryDamageBreak[] = [];
  for (let i = track.length - 1; i >= 0; i--) {
    const survivors = i + 1;
    const dmg = track[i]!;
    const last = breaks[breaks.length - 1];
    if (last && arraysEqual(last.damage, dmg)) {
      last.to = survivors;
    } else {
      breaks.push({ from: survivors, to: survivors, damage: dmg });
    }
  }
  return breaks;
}

function arraysEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Override range brackets for an infantry small arm from its TW max range R
 * (hexes). R is treated as the long-range edge with even thirds (short = R/3,
 * medium = 2R/3) — the same shape a 'Mech energy weapon's S/M/L triple takes —
 * then run through the shared bracket conversion. R = 0 (adjacent-only weapons
 * like flamers/grenades) yields Point-Blank only. Returns null when unscored.
 *
 * NOTE: best-effort. There is no DFA infantry oracle for the bracket mapping;
 * the thirds model keeps it consistent with the calibrated weapon brackets.
 */
export function infantryRangeBrackets(rangeHexes: number): RangeBrackets {
  if (rangeHexes <= 0) return { pb: 0, s: null, m: null, l: null, x: null };
  return computeRangeBrackets({
    min: 0,
    medium: Math.round((2 * rangeHexes) / 3),
    long: rangeHexes,
  });
}

/** Convert towed field guns (standard weapons) into card weapon rows. */
function buildFieldGuns(names: ReadonlyArray<string>, techBase: InfantryUnit["techBase"]): VehicleWeaponRow[] {
  const cardWeapons: CardWeapon[] = names.map((name) => {
    const w: Weapon = { name, location: "CT", rawLocation: "Field Gun", rearMounted: false };
    return convertWeapon(w, techBase, 0);
  });
  return groupIntoTics(cardWeapons).map((tic) => ({
    label: abbreviatedTicLabel(tic, techBase),
    facing: "",
    damageText: tic.damageText,
    heat: ticHeat(tic),
    range: tic.range,
    rangeText: tic.rangeText,
    unknown: tic.weapons.some((w) => w.unknown),
  }));
}

/** Convert a parsed infantry platoon into an Infantry Override card. */
export function convertInfantry(unit: InfantryUnit): InfantryCard {
  const warnings: string[] = [];
  const motion = motionSpec(unit.motionType);
  const move = `${motion.move}${motion.jump ? " (J)" : ""}`;
  const tmm = lookupTmm(motion.move);

  const fieldGuns = buildFieldGuns(unit.fieldGuns, unit.techBase);
  for (const g of fieldGuns) {
    if (g.unknown) warnings.push(`field gun not in TW damage table: "${g.label}" (damage set to 0)`);
  }

  const primaryArm = lookupSmallArm(unit.primaryWeapon);
  const secondaryArm = lookupSmallArm(unit.secondaryWeapon);
  if (primaryArm === undefined) {
    warnings.push(`small-arms damage/range unscored: primary "${unit.primaryWeapon}" not in the infantry weapon table`);
  }
  const track = platoonDamageTrack(unit);
  const range = primaryArm ? infantryRangeBrackets(primaryArm.range) : null;

  return {
    kind: "infantry",
    name: `${unit.chassis} ${unit.model}`.trim(),
    chassis: unit.chassis,
    model: unit.model,
    techBase: unit.techBase,
    troopers: unit.troopers,
    motionLabel: motion.label,
    move,
    tmm,
    antiMek: unit.antiMek,
    damage: track.length ? track[track.length - 1]! : [],
    damageByTroopers: track,
    damageBreaks: damageBreakpoints(track),
    range,
    rangeText: range ? formatRangeBrackets(range) : null,
    primaryRangeHexes: primaryArm ? primaryArm.range : null,
    ...(secondaryArm ? { secondaryRangeHexes: secondaryArm.range } : {}),
    primaryWeapon: cleanInfantryWeapon(unit.primaryWeapon),
    ...(unit.secondaryWeapon ? { secondaryWeapon: cleanInfantryWeapon(unit.secondaryWeapon) } : {}),
    secondaryCount: unit.secondaryPerSquad * unit.squadCount,
    fieldGuns,
    warnings,
    sourceFile: unit.sourceFile,
  };
}
