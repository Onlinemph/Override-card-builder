/**
 * Combat Vehicle conversion: `VehicleUnit` -> `VehicleCard`.
 *
 * PURE module. Reuses the 'Mech weapon engine: weapons are grouped into TICs
 * PER FACING (front/turret/sides/rear stay separate), then abbreviated and
 * heat-rated exactly like the 'Mech card. Armor/TMM mirror the 'Mech rules as a
 * best-effort starting point (TODO(vehicle-rules) — validate vs the DFA gen).
 */

import { ARM_LEG_ARMOR_DIVISOR, MIN_ARM_LEG_ARMOR, WEAPON_HINTS } from "./constants.js";
import {
  abbreviatedTicLabel,
  buildEquipment,
  convertWeapon,
  groupIntoTics,
  lookupTmm,
  lookupWeaponDamage,
  roundNearest,
  ticHeat,
} from "./convert.js";
import type {
  CardWeapon,
  CritSlot,
  VehicleCard,
  VehicleCardArmor,
  VehicleFacing,
  VehicleUnit,
  VehicleWeaponRow,
  Weapon,
} from "./types.js";

/** All vehicle weapons share one synthetic location; grouping is scoped per facing. */
const VEHICLE_LOCATION = "CT" as const;

/** Display label + card order for the weapon facings. */
const FACING_LABEL: Readonly<Record<VehicleFacing, string>> = {
  front: "Front",
  turret: "Turret",
  right: "Right",
  left: "Left",
  rear: "Rear",
  body: "Body",
};
const FACING_ORDER: ReadonlyArray<VehicleFacing> = [
  "front",
  "turret",
  "right",
  "left",
  "rear",
  "body",
];

/** True if an item name looks like a weapon (so unknowns surface rather than drop). */
function looksLikeWeapon(name: string): boolean {
  const lower = name.toLowerCase();
  return WEAPON_HINTS.some((hint) => lower.includes(hint));
}

/** Armor: mirror the 'Mech arm/leg rule (TW / 3, round nearest, min 1; 0 if absent). */
function convertArmor(tw: number): number {
  return tw > 0 ? Math.max(MIN_ARM_LEG_ARMOR, roundNearest(tw / ARM_LEG_ARMOR_DIVISOR)) : 0;
}

/**
 * Convert a parsed combat vehicle into a Vehicle Override card.
 *
 * Each facing's weapons are converted and grouped into TICs independently, so
 * (for example) two identical autocannon in the turret group while a third in
 * the front stays separate. Ammo/gear route through the shared equipment
 * surfacing (shown without a location for now).
 */
export function convertVehicle(unit: VehicleUnit): VehicleCard {
  const warnings: string[] = [];
  const otherSlots: CritSlot[] = [];
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
          location: VEHICLE_LOCATION,
          rawLocation: facing,
          rearMounted: false,
        };
        cardWeapons.push(convertWeapon(w, unit.techBase, 0));
        if (unknown) unknownWeapons.add(mount.name);
      } else {
        otherSlots.push({ name: mount.name, location: VEHICLE_LOCATION, rawLocation: facing });
      }
    }
    // Group identical weapons WITHIN this facing only.
    for (const tic of groupIntoTics(cardWeapons)) {
      weapons.push({
        label: abbreviatedTicLabel(tic, unit.techBase),
        facing: FACING_LABEL[facing],
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

  const a = unit.armor;
  const armor: VehicleCardArmor = {
    front: convertArmor(a.front),
    right: convertArmor(a.right),
    left: convertArmor(a.left),
    rear: convertArmor(a.rear),
    ...(unit.hasTurret ? { turret: convertArmor(a.turret ?? 0) } : {}),
  };

  // Best-effort internal structure (single value) from tonnage.
  // TODO(vehicle-rules): use the real combat-vehicle IS table once verified.
  const structure = Math.max(1, roundNearest(unit.tonnage / 10));

  // TMM: mirror the 'Mech run table on flank MP. TODO(vehicle-rules): validate.
  const tmm = lookupTmm(unit.flankMP);

  return {
    kind: "vehicle",
    name: `${unit.chassis} ${unit.model}`.trim(),
    chassis: unit.chassis,
    model: unit.model,
    techBase: unit.techBase,
    tonnage: unit.tonnage,
    motionType: unit.motionType,
    move: `${unit.cruiseMP}/${unit.flankMP}`,
    cruiseMP: unit.cruiseMP,
    flankMP: unit.flankMP,
    tmm,
    armor,
    structure,
    hasTurret: unit.hasTurret,
    weapons,
    equipment: buildEquipment(otherSlots),
    warnings,
    sourceFile: unit.sourceFile,
  };
}
