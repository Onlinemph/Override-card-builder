/**
 * Combat Vehicle conversion: `VehicleUnit` -> `VehicleCard`.
 *
 * PURE module. Reuses the 'Mech weapon engine: weapons are grouped into TICs
 * PER FACING (front/turret/sides/rear stay separate), then abbreviated and
 * heat-rated exactly like the 'Mech card.
 *
 * Numbers are tuned against the DFA Manticore Heavy Tank card (60t, armor
 * 42/33/33/26/42): armor = TW/4 (verified), structure by tonnage bracket
 * (verified), TMM = base/+1 on flank MP, move shows the motion letter ("4 / 6t").
 * TMM is still best-effort - keep validating new vehicles against DFA.
 *
 * VTOLs share this card. They add a rotor location (the 5th armor value) and a
 * flying move (motion letter "v"); a turret, if present, is the 6th armor value.
 */

import {
  IMPORTANT_EQUIPMENT,
  MOTION_TYPE_LETTER,
  VEHICLE_ARMOR_DIVISOR,
  vehicleStructure,
  WEAPON_HINTS,
} from "./constants.js";
import {
  abbreviatedTicLabel,
  ammoLabel,
  convertWeapon,
  groupIntoTics,
  isWeaponBlockEquipment,
  lookupTmm,
  lookupWeaponDamage,
  roundNearest,
  ticHeat,
} from "./convert.js";
import type {
  CardWeapon,
  VehicleCard,
  VehicleCardArmor,
  VehicleEquipment,
  VehicleFacing,
  VehicleMount,
  VehicleUnit,
  VehicleWeaponRow,
  Weapon,
} from "./types.js";

/** All vehicle weapons share one synthetic location; grouping is scoped per facing. */
const VEHICLE_LOCATION = "CT" as const;

/** Facing -> short code shown on the card (Loc column / equipment). */
const FACING_CODE: Readonly<Record<VehicleFacing, string>> = {
  front: "FR",
  turret: "TU",
  right: "RS",
  left: "LS",
  rear: "RR",
  rotor: "RO",
  body: "BD",
};
const FACING_ORDER: ReadonlyArray<VehicleFacing> = [
  "front",
  "turret",
  "right",
  "left",
  "rear",
  "rotor",
  "body",
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
function buildVehicleEquipment(mounts: ReadonlyArray<VehicleMount>): VehicleEquipment[] {
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
 * Convert a parsed combat vehicle into a Vehicle Override card. Each facing's
 * weapons are grouped into TICs independently; ammo/gear keep their facing.
 */
export function convertVehicle(unit: VehicleUnit): VehicleCard {
  const warnings: string[] = [];
  const otherMounts: VehicleMount[] = [];
  const weapons: VehicleWeaponRow[] = [];
  const unknownWeapons = new Set<string>();

  for (const facing of FACING_ORDER) {
    const cardWeapons: CardWeapon[] = [];
    for (const mount of unit.mounts.filter((m) => m.facing === facing)) {
      const isAmmo = /\bammo\b/i.test(mount.name);
      const { unknown } = lookupWeaponDamage(mount.name, unit.techBase);
      // AMS / Laser AMS / TAG are equipment in Override, never weapons.
      const isEquipment = isWeaponBlockEquipment(mount.name);
      if (!isAmmo && !isEquipment && (!unknown || looksLikeWeapon(mount.name))) {
        const w: Weapon = {
          name: mount.name,
          location: VEHICLE_LOCATION,
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

  const a = unit.armor;
  const armor: VehicleCardArmor = {
    front: convertArmor(a.front),
    right: convertArmor(a.right),
    left: convertArmor(a.left),
    rear: convertArmor(a.rear),
    ...(unit.hasTurret ? { turret: convertArmor(a.turret ?? 0) } : {}),
    ...(unit.hasRotor ? { rotor: convertArmor(a.rotor ?? 0) } : {}),
  };

  // Internal structure per facing (uniform), by tonnage bracket (verified vs DFA).
  const structure = vehicleStructure(unit.tonnage);

  // TMM mirrors the 'Mech run table on flank MP; card prints `tmm / tmm+1`.
  const tmm = lookupTmm(unit.flankMP);
  const letter = MOTION_TYPE_LETTER[unit.motionType.toLowerCase()] ?? "";

  return {
    kind: "vehicle",
    name: `${unit.chassis} ${unit.model}`.trim(),
    chassis: unit.chassis,
    model: unit.model,
    techBase: unit.techBase,
    tonnage: unit.tonnage,
    motionType: unit.motionType,
    move: `${unit.cruiseMP} / ${unit.flankMP}${letter}`,
    cruiseMP: unit.cruiseMP,
    flankMP: unit.flankMP,
    tmm,
    armor,
    structure,
    hasTurret: unit.hasTurret,
    hasRotor: unit.hasRotor,
    weapons,
    equipment: buildVehicleEquipment(otherMounts),
    warnings,
    sourceFile: unit.sourceFile,
  };
}
