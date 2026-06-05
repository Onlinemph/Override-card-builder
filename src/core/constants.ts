/**
 * Constants for mtf2override — every magic number lives here, each annotated
 * with the rule it implements. PURE module: no Node/browser/filesystem imports.
 *
 * Two kinds of data live here:
 *   1. Conversion parameters (divisors, rounding directions, lookup tables) used
 *      by src/core/convert.ts.
 *   2. Reference game data (internal-structure-by-tonnage) used by the parser to
 *      derive values that MTF files do not contain.
 *
 * VALIDATION: the DFA Override Card Generator is the ground-truth oracle. When a
 * number here is uncertain it is flagged CONFIRM — diff our output against a
 * DFA-generated card for the same unit to verify.
 */

import type { StructureLocation, TechBase, WeaponRange } from "./types.js";

// ---------------------------------------------------------------------------
// Rounding directions, declared per field so convert.ts can pick the right one.
// Damage rounds UP; armor/structure/heat round to NEAREST. Do NOT use a single
// rounding mode everywhere.
// ---------------------------------------------------------------------------

export type RoundMode = "up" | "nearest";

/** Which rounding helper each converted field uses. */
export const ROUNDING: Record<string, RoundMode> = {
  weaponDamage: "up", // Override: weapon damage in a group, sum TW, /3, round UP
  torsoArmor: "nearest", // (CT+LT+RT)/6, round nearest
  rearArmor: "nearest", // (CTr+LTr+RTr)/6, round nearest
  armLegArmor: "nearest", // TW/3, round nearest, min 1
  nonMechArmor: "nearest", // location/4, round nearest (stub layer)
  structure: "nearest", // TW/3, round nearest, min 1
  heatDissipation: "nearest", // total dissipated / 5, round nearest
} as const;

// ---------------------------------------------------------------------------
// Divisors. One named constant per conversion rule.
// ---------------------------------------------------------------------------

/** Weapon group damage (the printed MAX): sum of TW damage / 3, round UP. */
export const WEAPON_DAMAGE_DIVISOR = 3;

/**
 * Missile-cluster M (missile) dice. For a missile rack the Override card prints
 * `base+M{mDice} (max)`, where both base and mDice derive from the rack's TW
 * damage over this divisor:
 *   - mDice = ceil(rackTW / 10)   (round UP)
 *   - base  = max(1, floor(rackTW / 10))  (round DOWN, min 1)
 *   - max   = ceil(rackTW / 3)    (WEAPON_DAMAGE_DIVISOR)
 *
 * So for a rackTW that is a multiple of 10, base === mDice (MRM-30 -> 3+M3);
 * otherwise mDice is one higher than base (SRM-6, TW 12 -> 1+M2).
 *
 * VERIFIED vs DFA cards across rackTW 4..40: LRM 5/10/15/20, SRM 2/4/6,
 * Streak SRM 2/4/6, MRM 10/20/30/40. Direct-fire weapons roll no M dice
 * (base === max, mDice 0) — see MISSILE_WEAPON_FAMILIES.
 */
export const M_DICE_DIVISOR = 10;

/**
 * Weapon families that fire a missile cluster and therefore roll M dice on the
 * Override card. Matched against the LEADING token(s) of the normalized weapon
 * name (see normalizeWeaponName). Everything not listed here is direct-fire and
 * prints flat damage.
 *
 * Confirmed by DFA cards: LRM, SRM, Streak SRM, MRM. Rocket Launchers fire the
 * same one-shot missile cluster and follow the identical rule.
 *
 * NOT YET HERE: ATM / MML are missile racks but do variable damage by
 * range/mode (left as TODO in WEAPON_DAMAGE); add them once their per-bracket
 * TW values are wired in.
 */
export const MISSILE_WEAPON_FAMILIES: ReadonlyArray<string> = [
  "lrm",
  "srm",
  "streak srm",
  "mrm",
  "rocket launcher",
] as const;

/**
 * Cluster weapon families that roll C dice on the Override card, printing
 * `base+C{cDice}` where base + cDice === max (= ceil(TW/3)). Matched on the
 * leading token of the normalized name.
 *
 * Confirmed vs DFA cards: LB-X ("lb 10-x ac" -> 1+C3), HAG ("hag/30" ->
 * 3+C7|6|5). Silver Bullet Gauss is also cluster-only (page 40) and is listed
 * here for when it is added to the damage table.
 */
export const CLUSTER_WEAPON_FAMILIES: ReadonlyArray<string> = [
  "lb",
  "hag",
  "silver bullet gauss",
] as const;

/**
 * Cluster families whose C dice fall off with range (short/med/long), printed
 * `base+C{short}|{med}|{long}` with each value one lower than the last.
 * Confirmed vs DFA card: HAG/30 -> 3+C7|6|5.
 */
export const RANGE_VARYING_CLUSTER_FAMILIES: ReadonlyArray<string> = ["hag"] as const;

/** 'Mech torso armor: (CT + LT + RT) / 6, round nearest. */
export const TORSO_ARMOR_DIVISOR = 6;

/** 'Mech rear armor: (CTr + LTr + RTr) / 6, round nearest. */
export const REAR_ARMOR_DIVISOR = 6;

/** Arms/legs armor: TW / 3, round nearest, min 1. */
export const ARM_LEG_ARMOR_DIVISOR = 3;

/** Non-'Mech armor (stub): per-location / 4. 'Mechs are the priority. */
export const NONMECH_ARMOR_DIVISOR = 4;

/** Structure per section: TW / 3, round nearest, min 1. */
export const STRUCTURE_DIVISOR = 3;

/** Heat dissipation: total dissipated per round / 5, round nearest. */
export const HEAT_DISSIPATION_DIVISOR = 5;

/** Minimum value for arm/leg armor and per-section structure. */
export const MIN_ARM_LEG_ARMOR = 1;
export const MIN_STRUCTURE = 1;

// ---------------------------------------------------------------------------
// Heat sinks. Singles dissipate 1 heat/round, doubles 2.
// ---------------------------------------------------------------------------

export const HEAT_PER_SINGLE_SINK = 1;
export const HEAT_PER_DOUBLE_SINK = 2;

// ---------------------------------------------------------------------------
// Head armor lookup. Bracketed on the head's TW armor value. Cap 5 total.
//   TW 0-2 -> 1, 3-5 -> 2, 6-7 -> 3, 8-9 -> 4, 10+ -> 5 (cap).
// Look up the first row where tw <= maxTw.
// ---------------------------------------------------------------------------

export interface HeadArmorBracket {
  maxTw: number;
  armor: number;
}

export const HEAD_ARMOR_LOOKUP: ReadonlyArray<HeadArmorBracket> = [
  { maxTw: 2, armor: 1 },
  { maxTw: 5, armor: 2 },
  { maxTw: 7, armor: 3 },
  { maxTw: 9, armor: 4 },
  { maxTw: Infinity, armor: 5 }, // cap 5 total
];

// ---------------------------------------------------------------------------
// TMM (Target Movement Modifier) by RUN MP — the SECOND movement number, not
// walk and not a derived inch band. Look up the tmm of the first row where
// runMP <= maxRun. Sprint and jump add +1 to base TMM (exposed separately by
// convert.ts); the card prints base TMM.
//
// Verified vs DFA cards: run 3 -> 0, 6 -> 1, 8 -> 2, 9 -> 2, 11 -> 3.
// (Atlas 3/5 -> runMP 5 -> TMM 1 also confirmed.)
//
// !!! INFERRED, UNVERIFIED: bands 4-5 (run 13-17 -> 4, run 18+ -> 5) are taken
// from Alpha Strike CE and must be confirmed against a fast light 'Mech (see
// the README validation note).
// ---------------------------------------------------------------------------

export interface TmmBracket {
  maxRun: number;
  tmm: number;
}

export const TMM_BY_RUN: ReadonlyArray<TmmBracket> = [
  { maxRun: 3, tmm: 0 },
  { maxRun: 6, tmm: 1 },
  { maxRun: 9, tmm: 2 },
  { maxRun: 12, tmm: 3 },
  { maxRun: 17, tmm: 4 }, // INFERRED (Alpha Strike CE), UNVERIFIED
  { maxRun: Infinity, tmm: 5 }, // INFERRED (Alpha Strike CE), UNVERIFIED
];

/** Sprint and jump each add +1 to base TMM (rules). Card prints base TMM. */
export const TMM_SPRINT_BONUS = 1;
export const TMM_JUMP_BONUS = 1;

// ---------------------------------------------------------------------------
// TW weapon-damage tables. Separate, easily-extended exports keyed on a
// NORMALIZED weapon name (see normalizeWeaponName in convert.ts). Values are
// Total Warfare damage; missiles are enumerated by rack size.
//
// IS vs Clan: many weapons do different damage by tech base, but the normalizer
// strips the IS/CL prefix. So WEAPON_DAMAGE holds the Inner Sphere / tech-shared
// value, and WEAPON_DAMAGE_CLAN holds Clan OVERRIDES for the weapons that
// differ. lookupWeaponDamage() consults the Clan table first for Clan units,
// then falls back to WEAPON_DAMAGE. Add a Clan row only where it diverges.
//
// VARIABLE-DAMAGE weapons (ATM, MML, HAG, Rotary AC bursts, Ultra double-tap)
// depend on range/mode/ammo and are left as TODO hooks below — better a known
// gap (damage 0 + warning) than a silently wrong number. Resolve them with the
// range-bracket work in Track A.
//
// To extend: add a row, each citing the weapon it implements.
// ---------------------------------------------------------------------------

export const WEAPON_DAMAGE: Readonly<Record<string, number>> = {
  // --- Energy: standard lasers ---
  "small laser": 3,
  "medium laser": 5,
  "large laser": 8,

  // --- Energy: IS ER lasers (Clan values differ; see WEAPON_DAMAGE_CLAN) ---
  "er small laser": 3,
  "er medium laser": 5,
  "er large laser": 8,

  // --- Energy: IS pulse lasers (Clan values differ) ---
  "small pulse laser": 3,
  "medium pulse laser": 6,
  "large pulse laser": 9,

  // --- Energy: PPCs ---
  ppc: 10,
  "er ppc": 10, // IS ER PPC; Clan ER PPC is 15 (see WEAPON_DAMAGE_CLAN)
  "light ppc": 5,
  "heavy ppc": 15,
  "snub-nose ppc": 10, // range-varying damage; see WEAPON_DAMAGE_BY_RANGE (nominal short value here)

  // --- Energy: flamers (heat weapons; 2 damage in damage mode) ---
  flamer: 2,
  "er flamer": 2,
  "vehicle flamer": 2,

  // --- Ballistic: standard autocannon (class = damage) ---
  "ac/2": 2,
  "ac/5": 5,
  "ac/10": 10,
  "ac/20": 20,

  // --- Ballistic: LB-X (slug/cluster share the class damage) ---
  "lb 2-x ac": 2,
  "lb 5-x ac": 5,
  "lb 10-x ac": 10,
  "lb 20-x ac": 20,

  // --- Ballistic: Ultra AC (single-shot class damage; double-tap is the (RF) rule, not damage) ---
  "ultra ac/2": 2,
  "ultra ac/5": 5,
  "ultra ac/10": 10,
  "ultra ac/20": 20,

  // --- Ballistic: Rotary AC. Per page 40, RAC TW is rebalanced (cluster-hit
  // average): RAC/2 base TW = 3, RAC/5 base TW = 8. Single-shot value; the
  // (RF) double-fire is a TIC rule, not a damage change. ceil/3 -> 1 and 3. ---
  "rotary ac/2": 3,
  "rotary ac/5": 8,

  // --- Ballistic: HAG (Clan-only; cluster C-dice, range-varying). Nominal rack
  // TW by class drives base (floor/10) and C dice (max − base). VERIFIED vs DFA
  // card: HAG/30 -> 3+C7|6|5. ---
  "hag/20": 20,
  "hag/30": 30,
  "hag/40": 40,

  // --- Ballistic: Light AC ---
  "light ac/2": 2,
  "light ac/5": 5,

  // --- Ballistic: Protomech / light autocannon family ---
  "ap gauss rifle": 3,

  // --- Ballistic: machine guns ---
  "machine gun": 2,
  "light machine gun": 1,
  "heavy machine gun": 3,

  // --- Ballistic: Gauss family ---
  "gauss rifle": 15,
  "light gauss rifle": 8,
  "heavy gauss rifle": 25, // range-varying damage; see WEAPON_DAMAGE_BY_RANGE (nominal short value here)
  "magshot gauss rifle": 2,
  magshot: 2,

  // --- Ballistic: Plasma (IS Plasma Rifle deals damage; Clan cannon is heat-only) ---
  "plasma rifle": 10,

  // --- Missiles: SRM (2 damage per missile, full rack) ---
  "srm 2": 4,
  "srm 4": 8,
  "srm 6": 12,

  // --- Missiles: Streak SRM (2 per missile, all hit) ---
  "streak srm 2": 4,
  "streak srm 4": 8,
  "streak srm 6": 12,

  // --- Missiles: LRM (1 damage per missile, full rack) ---
  "lrm 5": 5,
  "lrm 10": 10,
  "lrm 15": 15,
  "lrm 20": 20,

  // --- Missiles: MRM (1 damage per missile) ---
  "mrm 10": 10,
  "mrm 20": 20,
  "mrm 30": 30,
  "mrm 40": 40,

  // --- Missiles: Rocket Launcher (1 damage per tube, one-shot) ---
  "rocket launcher 10": 10,
  "rocket launcher 15": 15,
  "rocket launcher 20": 20,

  // --- Missiles: utility (no direct damage) ---
  narc: 0,
  "improved narc": 0,
  "inarc": 0,

  // TODO(variable damage / Track A range brackets): ATM 3/6/9/12, MML 3/5/7/9,
  // HAG 20/30/40, Rotary AC bursts. These vary by range/mode/ammo; left unset
  // so they surface as warnings rather than wrong numbers.
} as const;

// ---------------------------------------------------------------------------
// TW weapon RANGES -> Override range brackets (page 43, "Converting Weapon
// Ranges"). Keyed on the same NORMALIZED weapon name as WEAPON_DAMAGE. Stores
// only the values the bracket math reads: min, medium, long (the short-range
// value is never used). `toHitMod` is the weapon's inherent flat to-hit
// modifier, added to every applicable bracket (e.g. MRM +1).
//
// SCOPE (verified + safe canonical): the missile families below are VERIFIED
// against DFA card screenshots; the direct-fire rows are canonical TW ranges
// that are tech-base independent (same for IS and Clan), so a single shared
// table is correct for them. Each non-missile row is still worth a CONFIRM
// diff against a DFA card.
//
// DELIBERATELY OMITTED until card-verified (their ranges are tech-divergent,
// mode-dependent, or carry extra modifiers): pulse lasers (-2 pulse quality),
// ER lasers / ER PPC (IS vs Clan ranges differ), LB-X, Ultra/Rotary AC,
// snub-nose PPC, Light/Heavy Gauss, and Rocket Launchers (ranges vary per
// rack size). Weapons absent here simply render no range row.
//
// To extend: add a row citing the weapon, and confirm vs a DFA card.
// ---------------------------------------------------------------------------

export const WEAPON_RANGES: Readonly<Record<string, WeaponRange>> = {
  // --- Energy: standard lasers (tech-independent) ---
  "small laser": { min: 0, medium: 2, long: 3 },
  "medium laser": { min: 0, medium: 6, long: 9 },
  "large laser": { min: 0, medium: 10, long: 15 },

  // --- Energy: PPCs (min range 3; Light/Heavy share the standard brackets) ---
  ppc: { min: 3, medium: 12, long: 18 },
  "light ppc": { min: 3, medium: 12, long: 18 },
  "heavy ppc": { min: 3, medium: 12, long: 18 },

  // --- Energy: flamer (damage mode) ---
  flamer: { min: 0, medium: 2, long: 3 },

  // --- Ballistic: standard autocannon ---
  "ac/2": { min: 4, medium: 16, long: 24 },
  "ac/5": { min: 3, medium: 12, long: 18 },
  "ac/10": { min: 0, medium: 10, long: 15 },
  "ac/20": { min: 0, medium: 6, long: 9 },

  // --- Ballistic: Gauss rifle (standard; Light/Heavy omitted, see header) ---
  "gauss rifle": { min: 2, medium: 15, long: 22 },

  // --- Ballistic: machine gun ---
  "machine gun": { min: 0, medium: 2, long: 3 },

  // --- Missiles: SRM (VERIFIED vs DFA card: +0/+0/+2/–/–) ---
  "srm 2": { min: 0, medium: 6, long: 9 },
  "srm 4": { min: 0, medium: 6, long: 9 },
  "srm 6": { min: 0, medium: 6, long: 9 },

  // --- Missiles: Streak SRM (same ranges as SRM; VERIFIED vs DFA card) ---
  "streak srm 2": { min: 0, medium: 6, long: 9 },
  "streak srm 4": { min: 0, medium: 6, long: 9 },
  "streak srm 6": { min: 0, medium: 6, long: 9 },

  // --- Missiles: LRM (min range 6; VERIFIED vs DFA card: +4/+2/+0/+2/+4) ---
  "lrm 5": { min: 6, medium: 14, long: 21 },
  "lrm 10": { min: 6, medium: 14, long: 21 },
  "lrm 15": { min: 6, medium: 14, long: 21 },
  "lrm 20": { min: 6, medium: 14, long: 21 },

  // --- Missiles: MRM (inherent +1 to-hit; VERIFIED vs DFA card: +1/+1/+3/+5/–) ---
  "mrm 10": { min: 0, medium: 8, long: 15, toHitMod: 1 },
  "mrm 20": { min: 0, medium: 8, long: 15, toHitMod: 1 },
  "mrm 30": { min: 0, medium: 8, long: 15, toHitMod: 1 },
  "mrm 40": { min: 0, medium: 8, long: 15, toHitMod: 1 },

  // --- Missiles: Rocket Launcher (inherent +1; VERIFIED vs DFA card RL10/15/20) ---
  "rocket launcher 10": { min: 0, medium: 11, long: 18, toHitMod: 1 }, // VERIFIED: +1/+1/+3/+5/–
  "rocket launcher 15": { min: 0, medium: 9, long: 15, toHitMod: 1 }, // VERIFIED: +1/+1/+3/+5/–
  "rocket launcher 20": { min: 0, medium: 7, long: 12, toHitMod: 1 }, // VERIFIED: +1/+1/+3/–/–

  // --- Energy: pulse lasers (IS; inherent -2 "pulse quality"; VERIFIED vs DFA card) ---
  "small pulse laser": { min: 0, medium: 2, long: 3, toHitMod: -2 }, // VERIFIED (IS SPLas): -2/-2/–/–/–
  "medium pulse laser": { min: 0, medium: 4, long: 6, toHitMod: -2 }, // VERIFIED (IS MPLas): -2/-2/+2/–/–
  "large pulse laser": { min: 0, medium: 7, long: 10, toHitMod: -2 }, // VERIFIED (IS LPLas): -2/-2/+0/–/–

  // --- Energy: IS ER lasers (Clan ranges differ; see WEAPON_RANGES_CLAN) ---
  "er small laser": { min: 0, medium: 4, long: 5 }, // VERIFIED (IS erSLas): +0/+0/+4/–/–
  "er medium laser": { min: 0, medium: 8, long: 13 }, // VERIFIED (IS); long raised to 13 per page 42
  "er large laser": { min: 0, medium: 14, long: 19 }, // VERIFIED (IS erLLas): +0/+0/+0/+2/+4

  // --- Energy: ER PPC (range tech-independent; VERIFIED both IS and Clan: +0/+0/+0/+2/+4) ---
  "er ppc": { min: 0, medium: 14, long: 23 },

  // --- Energy: Snub-Nose PPC (range-varying damage; VERIFIED vs DFA card: +0/+0/+0/+4/–) ---
  "snub-nose ppc": { min: 0, medium: 13, long: 15 },

  // --- Ballistic: Light AC ---
  "light ac/2": { min: 0, medium: 12, long: 18 }, // CONFIRM
  "light ac/5": { min: 0, medium: 10, long: 15 }, // CONFIRM

  // --- Ballistic: Ultra AC (VERIFIED: UAC/10 IS, UAC/20; /2 and /5 extrapolated from the pattern) ---
  "ultra ac/2": { min: 0, medium: 18, long: 27 }, // CONFIRM (extrapolated)
  "ultra ac/5": { min: 0, medium: 14, long: 21 }, // CONFIRM (extrapolated)
  "ultra ac/10": { min: 0, medium: 12, long: 18 }, // VERIFIED (IS)
  "ultra ac/20": { min: 0, medium: 8, long: 12 }, // VERIFIED (cUAC/20)

  // --- Ballistic: Rotary AC (VERIFIED: RAC/2 +0/+0/+2/+4/–, RAC/5 IS +0/+0/+2/+4/–) ---
  "rotary ac/2": { min: 0, medium: 12, long: 18 }, // VERIFIED (IS RAC/2)
  "rotary ac/5": { min: 0, medium: 12, long: 18 }, // VERIFIED (IS); Clan in WEAPON_RANGES_CLAN

  // --- Ballistic: LB-X cluster (LB 10-X range tech-independent, VERIFIED; others extrapolated) ---
  "lb 2-x ac": { min: 0, medium: 18, long: 27 }, // CONFIRM
  "lb 5-x ac": { min: 0, medium: 14, long: 21 }, // CONFIRM
  "lb 10-x ac": { min: 0, medium: 12, long: 18 }, // VERIFIED (IS and Clan)
  "lb 20-x ac": { min: 0, medium: 8, long: 12 }, // CONFIRM

  // --- Ballistic: HAG (Clan-only; all classes share range 2/16/24; VERIFIED vs DFA card HAG/30: +2/+0/+0/+2/+4) ---
  "hag/20": { min: 2, medium: 16, long: 24 },
  "hag/30": { min: 2, medium: 16, long: 24 }, // VERIFIED
  "hag/40": { min: 2, medium: 16, long: 24 },

  // --- Ballistic: Heavy Gauss (range-varying damage; VERIFIED vs DFA card: +4/+2/+0/+2/+4) ---
  "heavy gauss rifle": { min: 4, medium: 13, long: 20 },

  // --- Ballistic: misc Gauss / supporting (canonical, tech-independent) ---
  "ap gauss rifle": { min: 0, medium: 6, long: 9 }, // CONFIRM
  "light gauss rifle": { min: 3, medium: 17, long: 25 }, // CONFIRM
  magshot: { min: 0, medium: 6, long: 9 }, // CONFIRM
  "magshot gauss rifle": { min: 0, medium: 6, long: 9 }, // CONFIRM

  // --- Energy/ballistic: plasma + flamers (canonical) ---
  "plasma rifle": { min: 0, medium: 10, long: 15 }, // CONFIRM
  "vehicle flamer": { min: 0, medium: 2, long: 3 }, // CONFIRM
  "er flamer": { min: 0, medium: 4, long: 5 }, // CONFIRM

  // --- Ballistic: light/heavy machine guns (canonical, short range) ---
  "light machine gun": { min: 0, medium: 4, long: 6 }, // CONFIRM
  "heavy machine gun": { min: 0, medium: 1, long: 2 }, // CONFIRM
} as const;

/**
 * Clan range OVERRIDES — weapons whose TW ranges differ from the IS / shared
 * value in WEAPON_RANGES. Consulted first for Clan units (convert.ts), then
 * falls back to WEAPON_RANGES. Mirrors the WEAPON_DAMAGE_CLAN pattern.
 *
 * Cards confirmed LB-X and ER PPC ranges are tech-INDEPENDENT (cLB 10-X and
 * cerPPC matched IS exactly), so those need no Clan row. Pulse lasers and ER
 * small/medium/large DO diverge and are overridden below. Clan Ultra AC ranges
 * may still differ from IS (UAC/10 verified IS, UAC/20 verified Clan); add a
 * row if a contradicting card appears.
 */
export const WEAPON_RANGES_CLAN: Readonly<Record<string, WeaponRange>> = {
  // Clan ER lasers reach further than IS. VERIFIED vs DFA card (cerSLas/cerMLas/cerLLas).
  "er small laser": { min: 0, medium: 4, long: 6 }, // +0/+0/+4/–/–
  "er medium laser": { min: 0, medium: 10, long: 15 }, // +0/+0/+2/+4/–
  "er large laser": { min: 0, medium: 15, long: 25 }, // +0/+0/+0/+2/+2
  // Clan pulse lasers reach further than IS; -2 pulse quality still applies.
  // VERIFIED vs DFA card cMPLas: -2/-2/+0/–/–.
  "medium pulse laser": { min: 0, medium: 8, long: 12, toHitMod: -2 },
  // Clan Rotary AC/5 reaches further than IS. VERIFIED vs DFA card cRAC/5: +0/+0/+0/+2/+4.
  "rotary ac/5": { min: 0, medium: 16, long: 24 },
} as const;

/**
 * Clan OVERRIDES — only weapons whose Clan TW damage differs from the IS /
 * shared value in WEAPON_DAMAGE. Consulted first for Clan units.
 */
export const WEAPON_DAMAGE_CLAN: Readonly<Record<string, number>> = {
  // Clan ER lasers hit harder than IS.
  "er small laser": 5,
  "er medium laser": 7,
  "er large laser": 10,
  "er micro laser": 2,

  // Clan pulse lasers.
  "micro pulse laser": 3,
  "small pulse laser": 3,
  "medium pulse laser": 7,
  "large pulse laser": 10,

  // Clan ER PPC.
  "er ppc": 15,
} as const;

// ---------------------------------------------------------------------------
// VARIABLE (range-dependent) damage. A few weapons deal different damage at
// short/medium/long range; the card prints `short|med|long` where each value
// is ceil(TW/3). Stored as the TW [short, med, long] triple. Keyed on the
// normalized name; convert.ts prefers this over the single WEAPON_DAMAGE value.
//
// VERIFIED vs DFA card: Snub-Nose PPC 10/8/5 -> 4|3|2, Heavy Gauss 25/20/10 ->
// 9|7|4. (These also appear in WEAPON_DAMAGE with their nominal short value so
// they register as "known".)
// ---------------------------------------------------------------------------

export const WEAPON_DAMAGE_BY_RANGE: Readonly<Record<string, readonly [number, number, number]>> = {
  "snub-nose ppc": [10, 8, 5], // VERIFIED -> 4|3|2
  "heavy gauss rifle": [25, 20, 10], // VERIFIED -> 9|7|4
} as const;

// ---------------------------------------------------------------------------
// MELEE. Punch/Kick are auto-generated for every BattleMech from tonnage;
// Override damage = ceil(classic TW / 3). Classic punch TW = ceil(mass/10),
// kick TW = ceil(mass/5). VERIFIED vs DFA card: 100t -> Punch 4 / Kick 7.
// ---------------------------------------------------------------------------

/** Classic-TW divisors for the universal physical attacks (then divided by WEAPON_DAMAGE_DIVISOR). */
export const PUNCH_TW_DIVISOR = 10;
export const KICK_TW_DIVISOR = 5;

/**
 * Physical melee weapons carried in the MTF. Override damage = ceil(tonnage /
 * divisor) (page 40), plus a flat to-hit modifier shown in the PB bracket
 * (melee is point-blank only). VERIFIED formulas pending a melee-weapon card.
 */
export interface MeleeWeaponSpec {
  /** Tonnage divisor for Override damage (page 40). */
  divisor: number;
  /** Flat to-hit modifier (page 40), shown in the PB bracket. */
  tnMod: number;
}

export const MELEE_WEAPONS: Readonly<Record<string, MeleeWeaponSpec>> = {
  hatchet: { divisor: 15, tnMod: 0 },
  sword: { divisor: 30, tnMod: -2 },
  mace: { divisor: 12, tnMod: 1 },
  claws: { divisor: 20, tnMod: 1 },
} as const;

// ---------------------------------------------------------------------------
// Standard internal-structure-by-tonnage table (TechManual). MTF files do NOT
// contain internal structure; the parser derives it from tonnage via this
// table. Order: HD, CT, side torsos (L/RT equal), arms (L/RA equal), legs
// (L/RL equal). Biped values.
//
// Conversion currently uses CT structure only, but the full table is kept so
// the Unit carries complete physical data.
// ---------------------------------------------------------------------------

export interface InternalStructureRow {
  HD: number;
  CT: number;
  /** Each side torso (LT and RT). */
  sideTorso: number;
  /** Each arm (LA and RA). */
  arm: number;
  /** Each leg (LL and RL). */
  leg: number;
}

export const INTERNAL_STRUCTURE_BY_TONNAGE: Readonly<Record<number, InternalStructureRow>> = {
  20: { HD: 3, CT: 6, sideTorso: 5, arm: 3, leg: 4 },
  25: { HD: 3, CT: 8, sideTorso: 6, arm: 4, leg: 6 },
  30: { HD: 3, CT: 10, sideTorso: 7, arm: 5, leg: 7 },
  35: { HD: 3, CT: 11, sideTorso: 8, arm: 6, leg: 8 },
  40: { HD: 3, CT: 12, sideTorso: 10, arm: 6, leg: 10 },
  45: { HD: 3, CT: 14, sideTorso: 11, arm: 7, leg: 11 },
  50: { HD: 3, CT: 16, sideTorso: 12, arm: 8, leg: 12 },
  55: { HD: 3, CT: 18, sideTorso: 13, arm: 9, leg: 13 },
  60: { HD: 3, CT: 20, sideTorso: 14, arm: 10, leg: 14 },
  65: { HD: 3, CT: 21, sideTorso: 15, arm: 10, leg: 15 },
  70: { HD: 3, CT: 22, sideTorso: 15, arm: 11, leg: 15 },
  75: { HD: 3, CT: 23, sideTorso: 16, arm: 12, leg: 16 },
  80: { HD: 3, CT: 25, sideTorso: 17, arm: 13, leg: 17 },
  85: { HD: 3, CT: 27, sideTorso: 18, arm: 14, leg: 18 },
  90: { HD: 3, CT: 29, sideTorso: 19, arm: 15, leg: 19 },
  95: { HD: 3, CT: 30, sideTorso: 20, arm: 16, leg: 20 },
  100: { HD: 3, CT: 31, sideTorso: 21, arm: 17, leg: 21 },
} as const;

/**
 * Torso-structure corrections keyed on tonnage, to match the official Override
 * card builder where it diverges from the base formula (CT internal / 3, round
 * nearest).
 *
 * The base formula matches the builder at most weights we've checked (e.g.
 * 20t -> 2, 100t -> 10), but the builder's torso value does not track
 * CT_internal / 3 exactly. When a verified builder value differs, add a row
 * here; convert.ts prefers this table over the formula. Easily extended.
 *
 * Verified data points:
 *   50t -> 6  (Hunchback HBK-4G; CT internal 16, base formula would give 5)
 */
export const TORSO_STRUCTURE_BY_TONNAGE: Readonly<Record<number, number>> = {
  50: 6,
};

/** Run MP multiplier when the MTF omits an explicit run value: ceil(walk * 1.5). */
export const RUN_MP_MULTIPLIER = 1.5;

// ---------------------------------------------------------------------------
// MTF parsing maps. Normalize the many spellings of locations and tech base.
// ---------------------------------------------------------------------------

/** Tech-base spellings -> normalized value. Lower-cased keys. */
export const TECH_BASE_MAP: Readonly<Record<string, TechBase>> = {
  "inner sphere": "IS",
  is: "IS",
  clan: "Clan",
} as const;

/**
 * Armor-line key (upper-cased, no "armor"/"armour" suffix) -> canonical
 * location code. Handles rear-line variants across MTF versions:
 *   front: LA RA LT RT CT HD LL RL
 *   rear:  RTL/LTR -> LTR, RTR -> RTR, RTC/CTR -> CTR
 */
export const ARMOR_KEY_MAP: Readonly<Record<string, "HD" | "CT" | "LT" | "RT" | "LA" | "RA" | "LL" | "RL" | "CTR" | "LTR" | "RTR">> = {
  HD: "HD",
  CT: "CT",
  LT: "LT",
  RT: "RT",
  LA: "LA",
  RA: "RA",
  LL: "LL",
  RL: "RL",
  // rear torso, both naming conventions
  CTR: "CTR",
  RTC: "CTR", // "Rear Torso Center"
  LTR: "LTR",
  RTL: "LTR", // "Rear Torso Left"
  RTR: "RTR", // both "Right Torso Rear" and "Rear Torso Right" -> right torso rear
} as const;

/** Full weapon-location names (lower-cased) -> canonical location code. */
export const WEAPON_LOCATION_MAP: Readonly<Record<string, "HD" | "CT" | "LT" | "RT" | "LA" | "RA" | "LL" | "RL">> = {
  head: "HD",
  "center torso": "CT",
  "left torso": "LT",
  "right torso": "RT",
  "left arm": "LA",
  "right arm": "RA",
  "left leg": "LL",
  "right leg": "RL",
} as const;

/** Maps an internal-structure row onto per-location structure entries. */
export function structureRowToLocations(
  row: InternalStructureRow,
): Record<StructureLocation, number> {
  return {
    HD: row.HD,
    CT: row.CT,
    LT: row.sideTorso,
    RT: row.sideTorso,
    LA: row.arm,
    RA: row.arm,
    LL: row.leg,
    RL: row.leg,
  };
}
