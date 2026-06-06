/**
 * Battle Armor conversion: `BattleArmorUnit` -> `BattleArmorCard`.
 *
 * PURE module. Reuses the 'Mech weapon engine wholesale (convertWeapon ->
 * groupIntoTics) and the equipment surfacing (buildEquipment); only the
 * armor/movement/TMM math is BA-specific.
 *
 * RULES STATUS: the armor and TMM conversions below MIRROR the 'Mech rules as a
 * best-effort starting point (chosen explicitly — see the project decision).
 * Each mirrored field is marked TODO(BA-rules) and should be validated against
 * the DFA generator's Battle Armor output before being trusted.
 */

import {
  ARM_LEG_ARMOR_DIVISOR,
  MIN_ARM_LEG_ARMOR,
  TMM_JUMP_BONUS,
  WEAPON_HINTS,
} from "./constants.js";
import {
  buildEquipment,
  convertWeapon,
  groupIntoTics,
  lookupTmm,
  lookupWeaponDamage,
  roundNearest,
} from "./convert.js";
import type {
  BattleArmorCard,
  BattleArmorUnit,
  CardWeapon,
  CritSlot,
  Weapon,
} from "./types.js";

/** All BA weapons share one synthetic location so identical types TIC together. */
const BA_LOCATION = "CT" as const;

/** True if an item name looks like a weapon (so unknowns surface rather than drop). */
function looksLikeWeapon(name: string): boolean {
  const lower = name.toLowerCase();
  return WEAPON_HINTS.some((hint) => lower.includes(hint));
}

/** Expand a mount into `copies` identical names (the squad's total of that item). */
function expand(name: string, copies: number): string[] {
  return Array.from({ length: Math.max(1, copies) }, () => name);
}

/**
 * Convert a parsed BA squad into a Battle Armor Override card.
 *
 * Squad firepower: each mount is replicated across the squad (per-trooper gear
 * times trooper count), then the shared weapon engine groups identical weapons
 * into TICs under the page-41 caps — the same behaviour as several 'Mechs
 * fielding the same weapon. TODO(BA-rules): confirm squad TIC handling.
 */
export function convertBattleArmor(unit: BattleArmorUnit): BattleArmorCard {
  const warnings: string[] = [];

  // Split mounts into weapons (known, or weapon-looking) and everything else.
  const weaponNames: string[] = [];
  const otherSlots: CritSlot[] = [];
  const unknownWeapons = new Set<string>();

  for (const mount of unit.mounts) {
    // Ammo and gear go through the equipment filter, never the weapon path —
    // even though an ammo line ("SRM 2 Ammo") contains a weapon-looking word.
    const isAmmo = /\bammo\b/i.test(mount.name);
    const { unknown } = lookupWeaponDamage(mount.name, unit.techBase);
    if (!isAmmo && (!unknown || looksLikeWeapon(mount.name))) {
      weaponNames.push(...expand(mount.name, mount.copies));
      if (unknown) unknownWeapons.add(mount.name);
    } else {
      // Non-weapon gear -> route through the same ammo/important-equipment filter
      // the 'Mech path uses; a synthetic crit slot per copy keeps bin counts right.
      for (const name of expand(mount.name, mount.copies)) {
        otherSlots.push({ name, location: BA_LOCATION, rawLocation: mount.mount || "Squad" });
      }
    }
  }

  const weapons: CardWeapon[] = weaponNames.map((name) => {
    const w: Weapon = {
      name,
      location: BA_LOCATION,
      rawLocation: "Squad",
      rearMounted: false,
    };
    return convertWeapon(w, unit.techBase, 0);
  });

  for (const name of unknownWeapons) {
    warnings.push(`weapon not in TW damage table: "${name}" (damage set to 0)`);
  }

  // Armor: mirror the 'Mech arm/leg rule (TW / 3, round nearest, min 1).
  // TODO(BA-rules): BA armor likely uses its own table — validate vs DFA.
  const armor = unit.armorPerTrooper
    ? Math.max(MIN_ARM_LEG_ARMOR, roundNearest(unit.armorPerTrooper / ARM_LEG_ARMOR_DIVISOR))
    : 0;

  // TMM: mirror the 'Mech run-MP table, keyed on the squad's fastest mode.
  // TODO(BA-rules): BA TMM is set by its own movement rules — validate vs DFA.
  const fastest = Math.max(unit.walkMP, unit.jumpMP);
  const tmm = lookupTmm(fastest);

  const move = `${unit.walkMP}${unit.jumpMP > 0 ? `/${unit.jumpMP} (J)` : ""}`;

  return {
    kind: "battlearmor",
    name: `${unit.chassis} ${unit.model}`.trim(),
    chassis: unit.chassis,
    model: unit.model,
    techBase: unit.techBase,
    troopers: unit.troopers,
    weightClass: unit.weightClass,
    move,
    walkMP: unit.walkMP,
    jumpMP: unit.jumpMP,
    motionType: unit.motionType,
    tmm,
    tmmJump: tmm + TMM_JUMP_BONUS,
    armorPerTrooper: unit.armorPerTrooper,
    armor,
    weapons,
    tics: groupIntoTics(weapons),
    equipment: buildEquipment(otherSlots),
    // PA(L) exoskeletons cannot make anti-'Mech attacks; everything else can.
    // TODO(BA-rules): refine (e.g. some configs/quads) once verified.
    antiMech: unit.weightClass !== "PA(L)",
    warnings,
    sourceFile: unit.sourceFile,
  };
}
