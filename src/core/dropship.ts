/**
 * DropShip conversion: `DropshipUnit` -> `DropshipCard`.
 *
 * PURE module. Built on the aerospace-fighter rules (per the user's direction —
 * "same rules as before"): armor = TW/4 (round nearest, min 1), Sinks =
 * dissipation/5, DThr = (nose + aft + one side) OVERRIDE armor / 30, TMM = the single
 * higher (sprint) value on max thrust. Weapons reuse the shared engine, grouped
 * into TICs PER ARC (Nose / Left Side / Right Side / Aft; Hull mounts are
 * equipment). SI comes from the BLK <structural_integrity> at TW/3 (round
 * nearest, min 1) — best-effort, no DFA dropship oracle yet.
 *
 * Capital / sub-capital weapons have no Override stats yet; they list as
 * unknown (0 damage) with a warning until rules are supplied.
 */

import { IMPORTANT_EQUIPMENT, WEAPON_HINTS, VEHICLE_ARMOR_DIVISOR, STRUCTURE_DIVISOR } from "./constants.js";
import {
  abbreviatedTicLabel,
  ammoLabel,
  convertWeapon,
  groupIntoTics,
  isWarshipWeapon,
  isNonWeaponMount,
  isWeaponBlockEquipment,
  lookupTmm,
  lookupWeaponDamage,
  normalizeWeaponName,
  roundNearest,
  ticHeat,
} from "./convert.js";
import type {
  CardWeapon,
  DropshipCard,
  DropshipFacing,
  DropshipMount,
  DropshipUnit,
  VehicleEquipment,
  VehicleWeaponRow,
  Weapon,
} from "./types.js";

/** All dropship weapons share a synthetic 'Mech location; grouping is per arc. */
const SYNTH_LOCATION = "CT" as const;

/** Arc -> short code shown on the card (Loc column / equipment). */
const ARC_CODE: Readonly<Record<DropshipFacing, string>> = {
  nose: "NO",
  leftSide: "LS",
  rightSide: "RS",
  aft: "AF",
  hull: "HL",
};
const ARC_ORDER: ReadonlyArray<DropshipFacing> = ["nose", "leftSide", "rightSide", "aft", "hull"];

function looksLikeWeapon(name: string): boolean {
  const lower = name.toLowerCase();
  return WEAPON_HINTS.some((hint) => lower.includes(hint));
}

/** Armor: TW / 4, round nearest, min 1 (0 if the arc is absent). */
function convertArmor(tw: number): number {
  return tw > 0 ? Math.max(1, roundNearest(tw / VEHICLE_ARMOR_DIVISOR)) : 0;
}

/** Notable equipment (ammo / gear) grouped by arc + label, with bin counts. */
function buildDropshipEquipment(mounts: ReadonlyArray<DropshipMount>): VehicleEquipment[] {
  const byKey = new Map<string, VehicleEquipment>();
  for (const m of mounts) {
    const lower = m.name.toLowerCase();
    const facing = ARC_CODE[m.facing];
    let label: string;
    let category: "ammo" | "equipment";
    let countable: boolean;
    if (lower.includes("ammo")) {
      label = ammoLabel(m.name);
      category = "ammo";
      countable = true;
    } else {
      const norm = normalizeWeaponName(m.name);
      const match = IMPORTANT_EQUIPMENT.find((e) => e.match.some((s) => lower.includes(s) || norm.includes(s)));
      if (!match) continue;
      label = match.label;
      category = "equipment";
      countable = match.countable ?? false;
    }
    const key = `${facing}|${category}|${label}`;
    const existing = byKey.get(key);
    if (existing) {
      if (countable) existing.count += 1;
    } else {
      byKey.set(key, { label, facing, category, count: 1 });
    }
  }
  return [...byKey.values()].sort(
    (a, b) =>
      Number(a.category === "ammo") - Number(b.category === "ammo") || a.label.localeCompare(b.label),
  );
}

/** Convert a parsed DropShip into a DropShip Override card. */
export function convertDropship(unit: DropshipUnit): DropshipCard {
  const warnings: string[] = [];
  const otherMounts: DropshipMount[] = [];
  const weapons: VehicleWeaponRow[] = [];
  const unknownWeapons = new Set<string>();

  for (const arc of ARC_ORDER) {
    const cardWeapons: CardWeapon[] = [];
    for (const mount of unit.mounts.filter((m) => m.facing === arc)) {
      // Capital-scale guns have no 'Mech-scale stats — drop them (no row, no warning).
      if (isWarshipWeapon(mount.name)) continue;
      const isAmmo = isNonWeaponMount(mount.name); // glued ammo + cargo + Narc pods
      const { unknown } = lookupWeaponDamage(mount.name, unit.techBase);
      const isEquipment = isWeaponBlockEquipment(mount.name);
      // Hull mounts never fire; treat them all as equipment/ammo.
      if (arc !== "hull" && !isAmmo && !isEquipment && (!unknown || looksLikeWeapon(mount.name))) {
        const w: Weapon = { name: mount.name, location: SYNTH_LOCATION, rawLocation: arc, rearMounted: false };
        cardWeapons.push(convertWeapon(w, unit.techBase, 0));
        if (unknown) unknownWeapons.add(mount.name);
      } else {
        otherMounts.push(mount);
      }
    }
    for (const tic of groupIntoTics(cardWeapons)) {
      weapons.push({
        label: abbreviatedTicLabel(tic, unit.techBase),
        facing: ARC_CODE[arc],
        damageText: tic.damageText,
        heat: ticHeat(tic),
        range: tic.range,
        rangeText: tic.rangeText,
        unknown: tic.weapons.some((w) => w.unknown),
      });
    }
  }

  for (const name of unknownWeapons) {
    warnings.push(`weapon not in TW damage table: "${name}" (damage set to 0)`);
  }

  // Capital batteries repeat the same unknown gun many times per arc; collapse
  // identical unknown rows into one "xN" line so the card stays readable.
  const collapsed: VehicleWeaponRow[] = [];
  for (const row of weapons) {
    const prev = collapsed.find((r) => r.unknown && row.unknown && r.label.replace(/^x\d+ /, "") === row.label && r.facing === row.facing);
    if (prev) {
      const n = Number.parseInt(prev.label.match(/^x(\d+) /)?.[1] ?? "1", 10) + 1;
      prev.label = `x${n} ${prev.label.replace(/^x\d+ /, "")}`;
    } else {
      collapsed.push({ ...row });
    }
  }

  const a = unit.armor;
  const armor = {
    nose: convertArmor(a.nose),
    leftSide: convertArmor(a.leftSide),
    rightSide: convertArmor(a.rightSide),
    aft: convertArmor(a.aft),
  };

  // SI: the BLK carries the TW value; card scale = /3 round nearest, min 1.
  const structure = Math.max(1, roundNearest(unit.structuralIntegrity / STRUCTURE_DIVISOR));

  // TMM: single higher (sprint) value on max thrust, as on the fighter card.
  const tmm = lookupTmm(unit.maxThrust) + 1;

  // Sinks: dissipation / 5 round nearest (doubles sink 2 each).
  const dissipation = unit.heatSinkCount * (unit.heatSinkType === "double" ? 2 : 1);
  const sinks = roundNearest(dissipation / 5);

  // DThr: (nose + aft + one side) of the OVERRIDE armor / 30, round nearest —
  // the already-reduced card armor (TW/4), NOT raw TW armor (~10% of a side on
  // the Override scale); floored at 1.
  const dthr = Math.max(1, roundNearest((armor.nose + armor.aft + Math.max(armor.leftSide, armor.rightSide)) / 30));

  return {
    kind: "dropship",
    name: `${unit.chassis} ${unit.model}`.trim(),
    chassis: unit.chassis,
    model: unit.model,
    techBase: unit.techBase,
    tonnage: unit.tonnage,
    motionLabel: /aerodyne/i.test(unit.motionType) ? "Aerodyne" : "Spheroid",
    move: `${unit.safeThrust} / ${unit.maxThrust}`,
    safeThrust: unit.safeThrust,
    maxThrust: unit.maxThrust,
    tmm,
    sinks,
    dthr,
    armor,
    structure,
    weapons: collapsed,
    equipment: buildDropshipEquipment(otherMounts),
    bays: unit.bays,
    warnings,
    sourceFile: unit.sourceFile,
  };
}
