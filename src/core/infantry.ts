/**
 * Conventional Infantry conversion: `InfantryUnit` -> `InfantryCard`.
 *
 * PURE module. A platoon's facts (troopers, movement, anti-'Mech, armament) map
 * straight across; towed FIELD GUNS are standard 'Mech-scale weapons and are
 * converted by the shared weapon engine (real damage/range/heat).
 *
 * Small-arms PLATOON damage is intentionally NOT fabricated here — it depends on
 * the Total Warfare infantry-weapon (damage-per-trooper) table and a target's
 * armor divisor, neither of which is wired in yet. The card surfaces the weapon
 * names and a note; calibrate against a DFA infantry card before adding numbers.
 *
 * Movement/TMM mirror the 'Mech rules as a best-effort starting point.
 */

import { lookupTmm } from "./convert.js";
import { convertWeapon, abbreviatedTicLabel, groupIntoTics, ticHeat } from "./convert.js";
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
    primaryWeapon: cleanInfantryWeapon(unit.primaryWeapon),
    ...(unit.secondaryWeapon ? { secondaryWeapon: cleanInfantryWeapon(unit.secondaryWeapon) } : {}),
    secondaryCount: unit.secondaryPerSquad * unit.squadCount,
    fieldGuns,
    warnings,
    sourceFile: unit.sourceFile,
  };
}
