/**
 * Aerospace / Conventional Fighter conversion: `FighterUnit` -> `FighterCard`.
 *
 * PURE module. Reuses the 'Mech weapon engine: weapons are grouped into TICs
 * PER FACING (nose / wings / aft stay separate), then abbreviated and heat-rated
 * exactly like the 'Mech and vehicle cards.
 *
 * Numbers mirror the combat-vehicle rules as a best-effort starting point: armor
 * = TW/4, Structural Integrity by tonnage bracket, TMM = base/+1 on max thrust,
 * move shows "safe / max" thrust. Hit locations use the Override fighter table
 * (Nose 6-8, R-Wing 3-5, L-Wing 9-11, Aft 2 & 12). Still best-effort — keep
 * validating against the DFA generator's aerospace output.
 */

import { IMPORTANT_EQUIPMENT, VEHICLE_ARMOR_DIVISOR, WEAPON_HINTS, vehicleStructure } from "./constants.js";
import {
  abbreviatedTicLabel,
  ammoLabel,
  convertWeapon,
  groupIntoTics,
  lookupTmm,
  lookupWeaponDamage,
  roundNearest,
  ticHeat,
} from "./convert.js";
import type {
  CardWeapon,
  FighterArmorRaw,
  FighterCard,
  FighterCardArmor,
  FighterFacing,
  FighterMount,
  FighterUnit,
  VehicleEquipment,
  VehicleWeaponRow,
  Weapon,
} from "./types.js";

/** All fighter weapons share one synthetic location; grouping is scoped per facing. */
const FIGHTER_LOCATION = "CT" as const;

/** Facing -> short code shown on the card (Loc column / equipment). */
const FACING_CODE: Readonly<Record<FighterFacing, string>> = {
  nose: "NO",
  leftWing: "LW",
  rightWing: "RW",
  aft: "AF",
  wings: "WG",
  fuselage: "FS",
};
const FACING_ORDER: ReadonlyArray<FighterFacing> = [
  "nose",
  "leftWing",
  "rightWing",
  "aft",
  "wings",
  "fuselage",
];

function looksLikeWeapon(name: string): boolean {
  const lower = name.toLowerCase();
  return WEAPON_HINTS.some((hint) => lower.includes(hint));
}

/** Armor: TW / 4, round nearest, min 1 (0 if the facing is absent). */
function convertArmor(tw: number): number {
  return tw > 0 ? Math.max(1, roundNearest(tw / VEHICLE_ARMOR_DIVISOR)) : 0;
}

/** Notable equipment (ammo/gear) grouped by facing + label, with bin counts. */
function buildFighterEquipment(mounts: ReadonlyArray<FighterMount>): VehicleEquipment[] {
  const byKey = new Map<string, VehicleEquipment>();
  for (const m of mounts) {
    const lower = m.name.toLowerCase();
    const facing = FACING_CODE[m.facing];
    let label: string;
    let category: "ammo" | "equipment";
    let countable: boolean;
    if (lower.includes("ammo")) {
      label = ammoLabel(m.name);
      category = "ammo";
      countable = true;
    } else {
      const match = IMPORTANT_EQUIPMENT.find((e) => e.match.some((s) => lower.includes(s)));
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

/**
 * Convert a parsed fighter into a Fighter Override card. Each facing's weapons
 * are grouped into TICs independently; ammo/gear keep their facing.
 */
export function convertFighter(unit: FighterUnit): FighterCard {
  const warnings: string[] = [];
  const otherMounts: FighterMount[] = [];
  const weapons: VehicleWeaponRow[] = [];
  const unknownWeapons = new Set<string>();

  for (const facing of FACING_ORDER) {
    const cardWeapons: CardWeapon[] = [];
    for (const mount of unit.mounts.filter((m) => m.facing === facing)) {
      const isAmmo = /\bammo\b/i.test(mount.name);
      const { unknown } = lookupWeaponDamage(mount.name, unit.techBase);
      if (!isAmmo && (!unknown || looksLikeWeapon(mount.name))) {
        const w: Weapon = {
          name: mount.name,
          location: FIGHTER_LOCATION,
          rawLocation: facing,
          rearMounted: false,
        };
        cardWeapons.push(convertWeapon(w, unit.techBase, 0));
        if (unknown) unknownWeapons.add(mount.name);
      } else {
        otherMounts.push(mount);
      }
    }
    for (const tic of groupIntoTics(cardWeapons)) {
      weapons.push({
        label: abbreviatedTicLabel(tic, unit.techBase),
        facing: FACING_CODE[facing],
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

  const a: FighterArmorRaw = unit.armor;
  const armor: FighterCardArmor = {
    nose: convertArmor(a.nose),
    rightWing: convertArmor(a.rightWing),
    leftWing: convertArmor(a.leftWing),
    aft: convertArmor(a.aft),
  };

  // Structural Integrity per facing (uniform), by tonnage bracket (best-effort).
  const structure = vehicleStructure(unit.tonnage);

  // TMM mirrors the 'Mech run table on max thrust; card prints `tmm / tmm+1`.
  const tmm = lookupTmm(unit.maxThrust);

  return {
    kind: "fighter",
    name: `${unit.chassis} ${unit.model}`.trim(),
    chassis: unit.chassis,
    model: unit.model,
    techBase: unit.techBase,
    tonnage: unit.tonnage,
    conventional: unit.conventional,
    motionType: unit.motionType,
    move: `${unit.safeThrust} / ${unit.maxThrust}`,
    safeThrust: unit.safeThrust,
    maxThrust: unit.maxThrust,
    tmm,
    armor,
    structure,
    weapons,
    equipment: buildFighterEquipment(otherMounts),
    warnings,
    sourceFile: unit.sourceFile,
  };
}
