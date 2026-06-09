/**
 * ProtoMech conversion: `ProtoMechUnit` -> `ProtoMechCard`.
 *
 * PURE module. ProtoMechs convert with the SAME rules as 'Mechs (Override
 * damage = ceil(TW / 3); armor & internal structure = round(TW / 3), min 1).
 * They differ from 'Mechs in three ways the card reflects:
 *   - a single Legs location (no separate left/right);
 *   - an optional torso-mounted Main Gun location;
 *   - a Frenzy melee attack (by tonnage) in place of Punch/Kick.
 * Hit locations mirror the 'Mech table except a roll of 3 or 11 is a MISS
 * (handled by the card renderer).
 *
 * Internal structure: the BLK omits it, so it is derived from tonnage. Torso =
 * tonnage and Legs = floor(t/2)+1 are well-anchored (matched vs the DFA mockup
 * and the armor:structure ratio); Head/Arm/Main-Gun = 1 (washes out under ÷3).
 */

import { IMPORTANT_EQUIPMENT, WEAPON_DAMAGE_DIVISOR, WEAPON_HINTS } from "./constants.js";
import {
  abbreviatedTicLabel,
  ammoLabel,
  convertWeapon,
  groupIntoTics,
  isWeaponBlockEquipment,
  lookupTmm,
  lookupWeaponDamage,
  roundNearest,
} from "./convert.js";
import { ticHeat } from "./convert.js";
import type {
  CardWeapon,
  ProtoCardArmor,
  ProtoLoc,
  ProtoMechCard,
  ProtoMechUnit,
  ProtoMount,
  VehicleEquipment,
  VehicleWeaponRow,
  Weapon,
} from "./types.js";

/** All ProtoMech weapons share a synthetic 'Mech location; grouping is per proto loc. */
const SYNTH_LOCATION = "CT" as const;

const PROTO_ORDER: ReadonlyArray<ProtoLoc> = ["head", "torso", "rightArm", "leftArm", "legs", "mainGun"];

/** Proto location -> short Loc code shown on the card. */
const PROTO_CODE: Readonly<Record<ProtoLoc, string>> = {
  head: "H",
  torso: "T",
  rightArm: "RA",
  leftArm: "LA",
  legs: "L",
  mainGun: "MG",
};

function looksLikeWeapon(name: string): boolean {
  const lower = name.toLowerCase();
  return WEAPON_HINTS.some((hint) => lower.includes(hint));
}

/** Armor / structure: TW / 3, round nearest, min 1 (0 if the location is absent). */
function convertProtoPip(tw: number): number {
  return tw > 0 ? Math.max(1, roundNearest(tw / WEAPON_DAMAGE_DIVISOR)) : 0;
}

/**
 * ProtoMech internal structure by tonnage (BLK omits it). Torso = tonnage, Legs
 * = floor(t/2)+1; Head/Arm/Main-Gun = 1. Best-effort but anchored to the mockup.
 */
export function protoInternalStructure(tonnage: number): ProtoCardArmor {
  const t = Math.max(1, Math.round(tonnage));
  return { head: 1, torso: t, rightArm: 1, leftArm: 1, legs: Math.floor(t / 2) + 1, mainGun: 1 };
}

/** Frenzy melee damage by tonnage: 2-5t -> 1, 6-9t -> 2, 10-15t -> 3. */
export function protoFrenzyDamage(tonnage: number): number {
  if (tonnage <= 5) return 1;
  if (tonnage <= 9) return 2;
  return 3;
}

/** Display motion label from the raw `motion_type`. */
function motionLabel(raw: string): string {
  const l = raw.toLowerCase();
  if (l.includes("quad")) return "Quad";
  if (l.includes("wige") || l.includes("glider")) return "Glider";
  return "Biped";
}

/** Notable equipment (ammo / gear) grouped by loc + label, with bin counts. */
function buildProtoEquipment(mounts: ReadonlyArray<ProtoMount>, jumpMP: number): VehicleEquipment[] {
  const byKey = new Map<string, VehicleEquipment>();
  for (const m of mounts) {
    const lower = m.name.toLowerCase();
    const facing = PROTO_CODE[m.loc];
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
  const out = [...byKey.values()].sort(
    (a, b) =>
      Number(a.category === "ammo") - Number(b.category === "ammo") || a.label.localeCompare(b.label),
  );
  // Jump MP implies jump jets, which ProtoMech BLKs don't list as equipment.
  if (jumpMP > 0) out.unshift({ label: "Jump Jets", facing: "", category: "equipment", count: 1 });
  return out;
}

/** Convert a parsed ProtoMech into a ProtoMech Override card. */
export function convertProto(unit: ProtoMechUnit): ProtoMechCard {
  const warnings: string[] = [];
  const otherMounts: ProtoMount[] = [];
  const weapons: VehicleWeaponRow[] = [];
  const unknownWeapons = new Set<string>();

  for (const loc of PROTO_ORDER) {
    const cardWeapons: CardWeapon[] = [];
    for (const mount of unit.mounts.filter((m) => m.loc === loc)) {
      const isAmmo = /\bammo\b/i.test(mount.name);
      const { unknown } = lookupWeaponDamage(mount.name, unit.techBase);
      const isEquipment = isWeaponBlockEquipment(mount.name);
      if (!isAmmo && !isEquipment && (!unknown || looksLikeWeapon(mount.name))) {
        const w: Weapon = { name: mount.name, location: SYNTH_LOCATION, rawLocation: loc, rearMounted: false };
        cardWeapons.push(convertWeapon(w, unit.techBase, 0));
        if (unknown) unknownWeapons.add(mount.name);
      } else {
        otherMounts.push(mount);
      }
    }
    for (const tic of groupIntoTics(cardWeapons)) {
      weapons.push({
        label: abbreviatedTicLabel(tic, unit.techBase),
        facing: PROTO_CODE[loc],
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

  const ar = unit.armor;
  const armor: ProtoCardArmor = {
    head: convertProtoPip(ar.head),
    torso: convertProtoPip(ar.torso),
    rightArm: convertProtoPip(ar.rightArm),
    leftArm: convertProtoPip(ar.leftArm),
    legs: convertProtoPip(ar.legs),
    ...(unit.hasMainGun ? { mainGun: convertProtoPip(ar.mainGun) } : {}),
  };

  const is = protoInternalStructure(unit.tonnage);
  const structure: ProtoCardArmor = {
    head: convertProtoPip(is.head),
    torso: convertProtoPip(is.torso),
    rightArm: convertProtoPip(is.rightArm),
    leftArm: convertProtoPip(is.leftArm),
    legs: convertProtoPip(is.legs),
    ...(unit.hasMainGun ? { mainGun: convertProtoPip(is.mainGun ?? 1) } : {}),
  };

  // Move: walk / run (ceil 1.5x) / jump; TMM run-based with a +1 sprint and +1 jump step.
  const walk = unit.walkMP;
  const run = Math.ceil(walk * 1.5);
  const jump = unit.jumpMP;
  const move = `${walk} / ${run}${jump > 0 ? ` / ${jump}j` : ""}`;
  const tmm = lookupTmm(run);
  const tmmText = `${tmm} / ${tmm + 1}${jump > 0 ? ` / ${tmm + 1}` : ""}`;

  return {
    kind: "protomech",
    name: `${unit.chassis} ${unit.model}`.trim(),
    chassis: unit.chassis,
    model: unit.model,
    techBase: unit.techBase,
    tonnage: unit.tonnage,
    motionLabel: motionLabel(unit.motionType),
    move,
    tmm,
    tmmText,
    hasArms: unit.hasArms,
    hasMainGun: unit.hasMainGun,
    armor,
    structure,
    weapons,
    frenzy: protoFrenzyDamage(unit.tonnage),
    equipment: buildProtoEquipment(otherMounts, unit.jumpMP),
    warnings,
    sourceFile: unit.sourceFile,
  };
}
