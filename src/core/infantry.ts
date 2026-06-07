/**
 * Conventional Infantry conversion: `InfantryUnit` -> `InfantryCard`.
 *
 * PURE module. A platoon's facts (troopers, movement, anti-'Mech, armament) map
 * straight across; towed FIELD GUNS are standard 'Mech-scale weapons and are
 * converted by the shared weapon engine (real damage/range/heat).
 *
 * Small-arms PLATOON damage = (sum of each carrier's per-trooper TW damage) / 3,
 * round up, then split into 2-point clusters (4 -> 2,2; 7 -> 2,2,2,1). The
 * per-trooper values live in INFANTRY_WEAPON_DAMAGE; weapons not yet in that
 * table leave the damage unscored (empty).
 *
 * Movement/TMM mirror the 'Mech rules as a best-effort starting point.
 */

import { INFANTRY_WEAPON_DAMAGE, WEAPON_DAMAGE_DIVISOR } from "./constants.js";
import { abbreviatedTicLabel, convertWeapon, groupIntoTics, lookupTmm, roundUp, ticHeat } from "./convert.js";
import type {
  CardWeapon,
  InfantryCard,
  InfantryUnit,
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
 * drop parenthetical qualifiers ("(Inner Sphere)", "(Hvy, One-Shot)") and a
 * leading "Infantry" maker prefix, split camelCase, and lowercase.
 *   "Auto-Rifle" / "Auto Rifle"     -> "auto rifle"
 *   "InfantryAssaultRifle"          -> "assault rifle"
 *   "SRM Launcher (Hvy, One-Shot)"  -> "srm launcher"
 */
export function infantryWeaponKey(raw: string): string {
  let s = raw.trim().replace(/\([^)]*\)/g, " ").replace(/^infantry/i, "");
  s = s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Za-z])(\d)/g, "$1 $2");
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
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

/**
 * Platoon small-arms damage as 2-point clusters. Sums each carrier's TW damage
 * (every trooper fires the primary; the secondary's carriers add theirs), then
 * divides by 3 (round up) before clustering. Returns [] when the primary weapon
 * is not in the per-trooper table (damage left unscored).
 */
function platoonDamage(unit: InfantryUnit): number[] {
  const primary = INFANTRY_WEAPON_DAMAGE[infantryWeaponKey(unit.primaryWeapon)];
  if (primary === undefined) return [];
  let totalTw = unit.troopers * primary;
  const secondary = unit.secondaryWeapon
    ? INFANTRY_WEAPON_DAMAGE[infantryWeaponKey(unit.secondaryWeapon)]
    : undefined;
  if (secondary !== undefined) totalTw += unit.secondaryPerSquad * unit.squadCount * secondary;
  return clusterDamageInto2s(roundUp(totalTw / WEAPON_DAMAGE_DIVISOR));
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
    damage: platoonDamage(unit),
    primaryWeapon: cleanInfantryWeapon(unit.primaryWeapon),
    ...(unit.secondaryWeapon ? { secondaryWeapon: cleanInfantryWeapon(unit.secondaryWeapon) } : {}),
    secondaryCount: unit.secondaryPerSquad * unit.squadCount,
    fieldGuns,
    warnings,
    sourceFile: unit.sourceFile,
  };
}
