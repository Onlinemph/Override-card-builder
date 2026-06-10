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

import type { MechLocation, StructureLocation, TechBase, WeaponRange } from "./types.js";

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
  "advanced srm", // BA-specific SRM variant; same M-dice mechanic, shorter range
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

/**
 * Combat-vehicle armor per facing: TW / 4, round nearest, min 1. VERIFIED vs DFA
 * Manticore: front 42 -> 11 (42/4 = 10.5 -> 11), turret 42 -> 11.
 */
export const VEHICLE_ARMOR_DIVISOR = 4;

/**
 * Combat-vehicle internal structure per facing, by tonnage bracket (uniform
 * across facings). VERIFIED vs DFA: 60t -> 2.
 *   5–40t  -> 1
 *   45–70t -> 2
 *   75t+   -> 3
 */
export function vehicleStructure(tonnage: number): number {
  if (tonnage <= 40) return 1;
  if (tonnage <= 70) return 2;
  return 3;
}

/**
 * BLK `motion_type` -> the single-letter suffix the Override card appends to the
 * flank move (e.g. "4 / 6t" for a tracked vehicle). Lower-cased keys.
 */
export const MOTION_TYPE_LETTER: Readonly<Record<string, string>> = {
  tracked: "t",
  wheeled: "w",
  hover: "h",
  vtol: "v",
  wige: "g",
  naval: "n",
  submarine: "s",
  hydrofoil: "f",
};


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

/**
 * Equipment that generates continuous heat each round (stealth/signature
 * systems). The Override card "pre-pays" this out of dissipation: the printed
 * Sinks value is (sink dissipation − this load) / 5. Detected from the armor
 * type (Stealth Armor) or crit-slot names. Keyed by a detection token -> heat.
 * Each system counts once even if it occupies several crit slots.
 */
export const HEAT_GENERATING_EQUIPMENT: ReadonlyArray<{ match: string; heat: number }> = [
  { match: "stealth", heat: 10 }, // Stealth Armor (needs ECM)
  { match: "null signature", heat: 10 }, // Null Signature System
  { match: "void signature", heat: 10 }, // Void Signature System
  { match: "chameleon", heat: 6 }, // Chameleon Light Polarization Shield
];

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
  "er medium pulse laser": 7, // VERIFIED vs DFA card (cerMPLas -> 3)

  // --- Energy: X-Pulse lasers (IS; same damage as the base laser, -2 to-hit) ---
  "small xpulse laser": 3, // VERIFIED vs DFA card (SXPLas -> 1)
  "medium xpulse laser": 5, // VERIFIED vs DFA card (MXPLas -> 2)

  // --- Energy: Heavy lasers (Clan; +1 to-hit, removed on the Improved variants) ---
  "heavy large laser": 18, // VERIFIED vs DFA card (cHLLas -> 6)
  "improved heavy medium laser": 10, // VERIFIED vs DFA card (ciHMLas -> 4)
  "improved heavy large laser": 18, // VERIFIED vs DFA card (ciHLLas -> 6)

  // --- Energy: Variable Speed Pulse + Re-engineered lasers ---
  "medium vsp laser": 9, // range-varying; see WEAPON_DAMAGE_BY_RANGE (nominal short value)
  "large vsp laser": 11, // range-varying; see WEAPON_DAMAGE_BY_RANGE (nominal short value)
  "medium reengineered laser": 6, // VERIFIED vs DFA card (reMLas -> 2)

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

  // --- Ballistic: Plasma (IS Plasma Rifle deals damage; Clan Plasma Cannon is
  // heat-only — 0 damage + 2 heat dice, see WEAPON_HEAT_DAMAGE). ---
  "plasma rifle": 10,
  "plasma cannon": 0, // VERIFIED vs DFA card (cPlasCannon -> 0+H2)

  // --- Missiles: SRM (2 damage per missile, full rack) ---
  // Full 'Mech racks; BA also fields smaller racks (1/3/5 missiles).
  "srm 1": 2,
  "srm 2": 4,
  "srm 3": 6,
  "srm 4": 8,
  "srm 5": 10,
  "srm 6": 12,

  // --- Missiles: Streak SRM (2 per missile, all hit) ---
  "streak srm 2": 4,
  "streak srm 4": 8,
  "streak srm 6": 12,

  // --- Missiles: Advanced SRM (BA-specific; 2 per missile, same as SRM but shorter max range) ---
  // Ranges differ from standard SRM; see WEAPON_RANGES.
  "advanced srm 1": 2,
  "advanced srm 2": 4,
  "advanced srm 3": 6,
  "advanced srm 4": 8,
  "advanced srm 5": 10,
  "advanced srm 6": 12,

  // --- Missiles: LRM (1 damage per missile, full rack) ---
  // BA fields racks as small as 1 missile; IS BA LRM has min range 6 like standard LRM.
  "lrm 1": 1,
  "lrm 2": 2,
  "lrm 3": 3,
  "lrm 4": 4,
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

  // --- Energy: BA-specific / support-scale weapons ---
  // Heavy lasers exist in-game as 'Mech tech but are most common in BA. Values
  // are the IS TW damage; Clan variants differ (see WEAPON_DAMAGE_CLAN).
  "heavy small laser": 6, // TW 6; sh 1 / med 2 / lg 3
  "heavy medium laser": 10, // TW 10; sh 3 / med 6 / lg 9
  "er micro laser": 2, // IS TW 2 (Clan override in WEAPON_DAMAGE_CLAN)
  "micro pulse laser": 3, // IS TW 3 (Clan override in WEAPON_DAMAGE_CLAN)
  "support ppc": 2, // BA/support scale PPC

  // MML and ATM/iATM are range-varying MISSILE racks: their printed damage is a
  // per-bracket base PLUS M dice, so they live in WEAPON_RV_MISSILE (below)
  // rather than as a single TW number here.
  //
  // TODO(variable damage): ATM 12, HAG bursts, Rotary AC bursts. Still unset so
  // they surface as warnings rather than wrong numbers.
} as const;

// ---------------------------------------------------------------------------
// RANGE-VARYING MISSILE racks (MML, ATM/iATM). Their Override damage is printed
// `short|med|long+M{mDice} (max)` — a per-bracket guaranteed base, plus M dice,
// up to a max — which the single-TW formula in WEAPON_DAMAGE cannot express.
// Values taken straight from the DFA Override card (the oracle). Keyed on the
// normalized name; convert.ts prefers this table and treats these as KNOWN.
//
// iATM (improved ATM) shares the ATM stat block — it is just streak — so the
// name normalizer folds "iATM N" onto "atm N".
// ---------------------------------------------------------------------------

export interface RangeVaryingMissileProfile {
  /** Per-bracket guaranteed base damage [short, med, long]. */
  byRange: readonly [number, number, number];
  /** M (missile) dice rolled on top of the base. */
  mDice: number;
  /** Printed maximum damage. */
  max: number;
}

export const WEAPON_RV_MISSILE: Readonly<Record<string, RangeVaryingMissileProfile>> = {
  // MML (Multi-Missile Launcher). VERIFIED vs DFA card.
  "mml 3": { byRange: [1, 1, 0], mDice: 1, max: 2 },
  "mml 5": { byRange: [1, 1, 0], mDice: 1, max: 3 },
  "mml 7": { byRange: [2, 1, 1], mDice: 1, max: 4 },
  "mml 9": { byRange: [2, 2, 1], mDice: 1, max: 5 },

  // ATM / iATM (Clan). VERIFIED vs DFA card (cATM (AIV)).
  "atm 3": { byRange: [1, 1, 0], mDice: 1, max: 3 },
  "atm 6": { byRange: [2, 1, 0], mDice: 1, max: 5 },
  "atm 9": { byRange: [3, 1, 0], mDice: 2, max: 8 },
  "atm 12": { byRange: [5, 3, 1], mDice: 2, max: 11 }, // VERIFIED vs DFA card (cATM-12 -> 5|3|1+M2 (11))

  // Arrow IV artillery: flat base across ranges, so byRange is uniform and the
  // formatter collapses it to "4+M1 (7)". VERIFIED vs DFA card.
  "arrow iv": { byRange: [4, 4, 4], mDice: 1, max: 7 },
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
  // All SRM rack sizes share the same range profile; BA fields 1/3/5-missile racks too.
  "srm 1": { min: 0, medium: 6, long: 9 },
  "srm 2": { min: 0, medium: 6, long: 9 },
  "srm 3": { min: 0, medium: 6, long: 9 },
  "srm 4": { min: 0, medium: 6, long: 9 },
  "srm 5": { min: 0, medium: 6, long: 9 },
  "srm 6": { min: 0, medium: 6, long: 9 },

  // --- Missiles: Advanced SRM (BA-specific; shorter max range: sh 4 / med 8 / lg 12) ---
  // Same M-dice mechanic as SRM; brackets +0/+0/+2/–/–. Data from MegaMek CSV.
  "advanced srm 1": { min: 0, medium: 8, long: 12 },
  "advanced srm 2": { min: 0, medium: 8, long: 12 },
  "advanced srm 3": { min: 0, medium: 8, long: 12 },
  "advanced srm 4": { min: 0, medium: 8, long: 12 },
  "advanced srm 5": { min: 0, medium: 8, long: 12 },
  "advanced srm 6": { min: 0, medium: 8, long: 12 },

  // --- Missiles: Streak SRM (same ranges as SRM; VERIFIED vs DFA card) ---
  "streak srm 2": { min: 0, medium: 6, long: 9 },
  "streak srm 4": { min: 0, medium: 6, long: 9 },
  "streak srm 6": { min: 0, medium: 6, long: 9 },

  // --- Missiles: LRM (min range 6; VERIFIED vs DFA card: +4/+2/+0/+2/+4) ---
  // BA fields racks as small as 1; all share the standard IS LRM range profile.
  "lrm 1": { min: 6, medium: 14, long: 21 },
  "lrm 2": { min: 6, medium: 14, long: 21 },
  "lrm 3": { min: 6, medium: 14, long: 21 },
  "lrm 4": { min: 6, medium: 14, long: 21 },
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

  // --- Energy: X-Pulse lasers (IS; -2 pulse quality; VERIFIED vs DFA card) ---
  "small xpulse laser": { min: 0, medium: 4, long: 5, toHitMod: -2 }, // SXPLas: -2/-2/+2/–/–
  "medium xpulse laser": { min: 0, medium: 6, long: 9, toHitMod: -2 }, // MXPLas: -2/-2/+0/–/–

  // --- Energy: Heavy lasers (Clan; Heavy variants carry +1, Improved variants none; VERIFIED vs DFA card) ---
  "heavy large laser": { min: 0, medium: 10, long: 15, toHitMod: 1 }, // cHLLas: +1/+1/+3/+5/–
  "improved heavy medium laser": { min: 0, medium: 6, long: 9 }, // ciHMLas: +0/+0/+2/–/–
  "improved heavy large laser": { min: 0, medium: 10, long: 15 }, // ciHLLas: +0/+0/+2/+4/–

  // --- Energy: Re-engineered laser (-1 to-hit; VERIFIED vs DFA card reMLas: -1/-1/+1/–/–) ---
  "medium reengineered laser": { min: 0, medium: 6, long: 9, toHitMod: -1 },

  // --- Energy: ER Medium Pulse Laser (Clan; -1 to-hit; VERIFIED vs DFA card cerMPLas: -1/-1/+1/+3/–) ---
  "er medium pulse laser": { min: 0, medium: 9, long: 14, toHitMod: -1 },

  // --- Missiles: MML (range-varying; VERIFIED vs DFA card: +0/+0/+2/+2/+4) ---
  "mml 3": { min: 0, medium: 6, long: 21 },
  "mml 5": { min: 0, medium: 6, long: 21 },
  "mml 7": { min: 0, medium: 6, long: 21 },
  "mml 9": { min: 0, medium: 6, long: 21 },

  // --- Missiles: ATM / iATM (Clan, range-varying; VERIFIED vs DFA card: +0/+0/+2/+2/+2) ---
  "atm 3": { min: 0, medium: 12, long: 27 },
  "atm 6": { min: 0, medium: 12, long: 27 },
  "atm 9": { min: 0, medium: 12, long: 27 },
  "atm 12": { min: 0, medium: 12, long: 27 },

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
  "plasma cannon": { min: 0, medium: 10, long: 15 }, // VERIFIED vs DFA card cPlasCannon: +0/+0/+2/+4/–
  "tsemp cannon": { min: 0, medium: 10, long: 15 }, // forged: ranges like an AC/10
  "vehicle flamer": { min: 0, medium: 2, long: 3 }, // CONFIRM
  "er flamer": { min: 0, medium: 4, long: 5 }, // CONFIRM

  // --- Ballistic: light/heavy machine guns (canonical, short range) ---
  "light machine gun": { min: 0, medium: 4, long: 6 }, // CONFIRM
  "heavy machine gun": { min: 0, medium: 1, long: 2 }, // CONFIRM

  // --- Energy: BA/support-scale weapons (data from MegaMek CSV) ---
  // Heavy lasers (also Clan-only in-universe; IS entry here for flexibility).
  "heavy small laser": { min: 0, medium: 2, long: 3 }, // sh 1 / med 2 / lg 3
  "heavy medium laser": { min: 0, medium: 6, long: 9 }, // sh 3 / med 6 / lg 9

  // ER Micro Laser (Clan dmg=2, IS dmg=2; brackets +0/+0/–/–/–).
  "er micro laser": { min: 0, medium: 2, long: 4 }, // sh 1 / med 2 / lg 4

  // Micro Pulse Laser (−2 pulse quality; brackets −2/−2/–/–/–).
  "micro pulse laser": { min: 0, medium: 2, long: 3, toHitMod: -2 }, // sh 1 / med 2 / lg 3

  // Support PPC (BA/support scale; sh 2 / med 5 / lg 7).
  "support ppc": { min: 0, medium: 5, long: 7 },
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
  // Clan LRMs have NO minimum range (IS LRMs have min 6). med/long match IS.
  // Clan LRM-15 -> +0/+0/+0/+2/+4 (vs IS +4/+2/+0/+2/+4). VERIFIED vs DFA card.
  "lrm 5": { min: 0, medium: 14, long: 21 },
  "lrm 10": { min: 0, medium: 14, long: 21 },
  "lrm 15": { min: 0, medium: 14, long: 21 },
  "lrm 20": { min: 0, medium: 14, long: 21 },
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
// WEAPON HEAT — Total Warfare heat per weapon (single shot), keyed on the same
// NORMALIZED name as WEAPON_DAMAGE. The Override card's `Ht` column is
// round(sum of member heat / HEAT_DISSIPATION_DIVISOR) — round-nearest on the
// /5 scale (VERIFIED vs DFA card: SRM-2 heat 2 -> 0, ER Med Pulse 6 -> 1,
// cATM-12 heat 8 -> 2). Weapons absent here contribute 0 heat. Extend as needed.
// ---------------------------------------------------------------------------

export const WEAPON_HEAT: Readonly<Record<string, number>> = {
  // Energy
  "small laser": 1,
  "medium laser": 3,
  "large laser": 8,
  "er small laser": 2,
  "er medium laser": 5,
  "er large laser": 12,
  "small pulse laser": 2,
  "medium pulse laser": 4,
  "large pulse laser": 10,
  "small xpulse laser": 3,
  "medium xpulse laser": 6,
  "er medium pulse laser": 6, // round(6/5) -> 1 (cerMPLas)
  "heavy large laser": 18, // round(18/5) -> 4
  "improved heavy medium laser": 7,
  "improved heavy large laser": 18,
  "medium vsp laser": 7, // round(7/5) -> 1
  "large vsp laser": 10, // 10/5 -> 2 (VERIFIED vs DFA Aeshna mockup: Ht 2)
  "medium reengineered laser": 7, // round(7/5) -> 1
  "plasma cannon": 7, // round(7/5) -> 1 (cPlasCannon)
  "micro pulse laser": 1,
  "er micro laser": 1,
  ppc: 10,
  "er ppc": 15,
  "light ppc": 5,
  "heavy ppc": 15,
  "snub-nose ppc": 10,
  flamer: 3,
  "er flamer": 4,
  "vehicle flamer": 3,
  "plasma rifle": 10,
  // Ballistic
  "ac/2": 1,
  "ac/5": 1,
  "ac/10": 3,
  "ac/20": 7,
  "lb 2-x ac": 1,
  "lb 5-x ac": 1,
  "lb 10-x ac": 2,
  "lb 20-x ac": 6,
  "ultra ac/2": 1,
  "ultra ac/5": 1,
  "ultra ac/10": 3,
  "ultra ac/20": 7,
  "rotary ac/2": 1,
  "rotary ac/5": 1,
  "light ac/2": 1,
  "light ac/5": 1,
  "machine gun": 0,
  "light machine gun": 0,
  "heavy machine gun": 0,
  "gauss rifle": 1,
  "light gauss rifle": 1,
  "heavy gauss rifle": 2,
  "ap gauss rifle": 1,
  magshot: 1,
  "hag/20": 4,
  "hag/30": 6,
  "hag/40": 8,
  // Missiles
  "srm 2": 2,
  "srm 4": 3,
  "srm 6": 4,
  "streak srm 2": 2,
  "streak srm 4": 3,
  "streak srm 6": 4,
  "lrm 5": 2,
  "lrm 10": 4,
  "lrm 15": 5,
  "lrm 20": 6,
  "mrm 10": 3,
  "mrm 20": 6,
  "mrm 30": 10,
  "mrm 40": 12,
  "rocket launcher 10": 3,
  "rocket launcher 15": 4,
  "rocket launcher 20": 5,
  // MML (LRM-mode heat) and ATM/iATM.
  "mml 3": 2,
  "mml 5": 3,
  "mml 7": 4,
  "mml 9": 5,
  "atm 3": 2,
  "atm 6": 4,
  "atm 9": 6,
  "atm 12": 8,
  "arrow iv": 10, // round(10/5) -> 2
  "tsemp cannon": 10, // round(10/5) -> 2 (forged: 2 heat to fire)
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
  "medium vsp laser": [9, 7, 5], // VERIFIED vs DFA card vsMPLas -> 3|3|2
  "large vsp laser": [11, 9, 7], // VERIFIED vs DFA Aeshna mockup vsLPLas -> 4|3|3
} as const;

// ---------------------------------------------------------------------------
// LITERAL RANGE-BRACKET OVERRIDES. A few weapons have a range-VARYING to-hit
// modifier (the pulse bonus shrinks with range) that the single (min, medium,
// long, toHitMod) model in WEAPON_RANGES cannot express. For those, the printed
// PB/S/M/L/X row is stored verbatim here (null = "–") and used as-is. Keyed on
// the normalized name; convert.ts prefers this over the computed brackets.
// ---------------------------------------------------------------------------

export const WEAPON_BRACKET_OVERRIDE: Readonly<Record<string, import("./types.js").RangeBrackets>> = {
  // Variable-Speed Pulse Laser: -3 at PB/S, fading to +0 by medium. VERIFIED vs
  // DFA card vsMPLas: -3/-3/+0/–/–.
  "medium vsp laser": { pb: -3, s: -3, m: 0, l: null, x: null },
  // VERIFIED vs DFA Aeshna mockup vsLPLas: -3/-3/+0/+3/–.
  "large vsp laser": { pb: -3, s: -3, m: 0, l: 3, x: null },
  // Arrow IV artillery: no point-blank fire; flat +4 from short out. VERIFIED vs
  // DFA card: –/+4/+4/+4/+4.
  "arrow iv": { pb: null, s: 4, m: 4, l: 4, x: 4 },
} as const;

// ---------------------------------------------------------------------------
// SPECIAL (non-numeric) damage. A few weapons have effects Override prints as a
// literal label rather than a damage number — e.g. the TSEMP Cannon, which
// disrupts systems instead of dealing damage. The damage cell shows this string
// verbatim; range and heat still come from the normal tables. Keyed on the
// normalized name. (TSEMP: forged fresh — not on an official Override card —
// SPECIAL damage, AC/10 range, 2 heat to fire.)
// ---------------------------------------------------------------------------

export const WEAPON_SPECIAL_DAMAGE: Readonly<Record<string, string>> = {
  "tsemp cannon": "SPECIAL",
} as const;

// ---------------------------------------------------------------------------
// HEAT-CAUSING DAMAGE. Plasma weapons apply heat dice to the target on top of
// (or instead of) their damage; the card prints it as "+H{n}" after the damage
// (Plasma Rifle 4+H1, Clan Plasma Cannon 0+H2). Keyed on the normalized name.
// ---------------------------------------------------------------------------

export const WEAPON_HEAT_DAMAGE: Readonly<Record<string, number>> = {
  "plasma rifle": 1, // VERIFIED vs DFA card (PlasRifle -> 4+H1)
  "plasma cannon": 2, // VERIFIED vs DFA card (cPlasCannon -> 0+H2)
} as const;

// ---------------------------------------------------------------------------
// CONVENTIONAL INFANTRY — per-trooper Total Warfare damage for small arms,
// keyed on the canonical infantry-weapon name (see infantryWeaponKey). Platoon
// TW damage = troopers x primary + secondaryCarriers x secondary; the card
// prints that / 3 (round up), split into 2-point clusters (4 -> 2,2; 7 ->
// 2,2,2,1). Add a row per weapon as real per-trooper values are supplied. The
// most common primaries (by unit count) are listed as TODO placeholders.
// ---------------------------------------------------------------------------

export const INFANTRY_WEAPON_DAMAGE: Readonly<Record<string, { damage: number; range: number }>> = {
  "auto rifle": { damage: 0.52, range: 1 },                      // 193x  Auto-Rifle
  "laser rifle": { damage: 0.28, range: 2 },                     // 46x  Laser Rifle
  "assault rifle": { damage: 0.52, range: 1 },                   // 39x  InfantryAssaultRifle
  "machine gun portable": { damage: 0.65, range: 1 },            // 31x  Machine Gun (Portable)
  "lrm launcher far shot": { damage: 0.48, range: 3 },           // 28x  LRM Launcher (FarShot)
  "srm launcher hvy one shot": { damage: 0.57, range: 2 },       // 28x  SRM Launcher (Hvy, One-Shot)
  "flamer man pack": { damage: 0.55, range: 0 },                 // 27x  Flamer (Man-Pack)
  "pulse laser rifle inner sphere": { damage: 0.25, range: 1 },  // 11x  Pulse Laser Rifle (Inner Sphere)
  "gyrojet rifle": { damage: 0.35, range: 1 },                   // 10x  Gyrojet Rifle
  "needler rifle": { damage: 0.23, range: 0 },                   // 9x  Needler Rifle
  "submachine gun": { damage: 0.25, range: 0 },                  // 9x  Submachine Gun
  "mk 2 portable aa": { damage: 0.81, range: 2 },                // 8x  InfantryMk2PortableAA
  "auto shotgun": { damage: 0.23, range: 0 },                    // 8x  Auto-Shotgun
  "sniper rifle bolt action": { damage: 0.18, range: 2 },        // 8x  Sniper Rifle (Bolt Action)
  "clan mauser iicias": { damage: 1.37, range: 3 },              // 6x  InfantryClanMauserIICIAS
  "lrm": { damage: 0.48, range: 3 },                             // 5x  InfantryLRM
  "auto gl": { damage: 1.49, range: 1 },                         // 4x  InfantryAutoGL
  "plasma rifle man portable": { damage: 1.58, range: 2 },       // 4x  Plasma Rifle (Man-Portable)
  "machine gun support": { damage: 0.94, range: 2 },             // 4x  Machine Gun (Support)
  "flamer man portable": { damage: 0.55, range: 0 },             // 4x  Flamer (Man-Portable)
  "federated barrett m 42 b": { damage: 1.02, range: 1 },        // 4x  InfantryFederatedBarrettM42B
  "blazer rifle": { damage: 0.35, range: 2 },                    // 3x  InfantryBlazerRifle
  "srm launcher std two shot": { damage: 1.14, range: 2 },       // 3x  SRM Launcher (Std, Two-Shot)
  "laser rifle marx xx": { damage: 0.26, range: 3 },             // 3x  Laser Rifle (Marx XX)
  "zeus heavy rifle": { damage: 0.22, range: 1 },                // 3x  InfantryZeusHeavyRifle
  "support laser heavy": { damage: 1.47, range: 5 },             // 3x  Support Laser (Heavy)
  "thunderstroke": { damage: 0.26, range: 1 },                   // 3x  InfantryThunderstroke
  "grand mauler": { damage: 0.63, range: 2 },                    // 3x  InfantryGrandMauler
  "heavy srm": { damage: 0.57, range: 2 },                       // 3x  InfantryHeavySRM
  "gyroslug rifle": { damage: 0.35, range: 1 },                  // 3x  Gyroslug Rifle
  "auto pistol": { damage: 0.21, range: 0 },                     // 3x  Auto-Pistol
  "standard srm": { damage: 1.14, range: 2 },                    // 2x  InfantryStandardSRM
  "sonic stunner": { damage: 0.07, range: 0 },                   // 2x  Sonic Stunner
  "clan gauss smg": { damage: 0.14, range: 0 },                  // 2x  InfantryClanGaussSMG
  "support machine gun": { damage: 0.94, range: 2 },             // 2x  InfantrySupportMachineGun
  "rifle federated long": { damage: 0.35, range: 1 },            // 2x  Rifle (Federated Long)
  "needler rifle m g flechette": { damage: 0.11, range: 0 },     // 2x  Needler Rifle (M&G Flechette)
  "needler support firedrake": { damage: 1.2, range: 1 },        // 2x  Needler, Support (Firedrake)
  "rifle m g g 150": { damage: 0.32, range: 2 },                 // 2x  Rifle (M&G G-150)
  "mppr": { damage: 1.58, range: 2 },                            // 2x  InfantryMPPR
  "tranq gun": { damage: 0.14, range: 0 },                       // 2x  Tranq Gun
  "stunstick": { damage: 0.07, range: 0 },                       // 2x  Stunstick
  "laser rifle mauser 1200 lss": { damage: 1.04, range: 2 },     // 2x  Laser Rifle (Mauser 1200 LSS)
  "particle cannon semi portable": { damage: 0.72, range: 2 },   // 2x  Particle Cannon (Semi-Portable)
  "support needler": { damage: 1.2, range: 1 },                  // 2x  InfantrySupportNeedler
  "laser rifle blazer": { damage: 0.35, range: 2 },              // 2x  Laser Rifle (Blazer)
  "rifle imperator ax 22 assault": { damage: 0.52, range: 1 },   // 2x  Rifle (Imperator AX-22 Assault)
  "support laser": { damage: 0.84, range: 3 },                   // 2x  Infantry Support Laser
  "support pulse laser": { damage: 0.81, range: 3 },             // 2x  InfantrySupportPulseLaser
  "avenger ccw": { damage: 0.33, range: 0 },                     // 1x  InfantryAvengerCCW
  "bolt action rifle": { damage: 0.14, range: 1 },               // 1x  InfantryBoltActionRifle
  "is pulse laser rifle": { damage: 0.25, range: 0 },            // 1x  IS Pulse Laser Rifle
  "mauser 960": { damage: 0.93, range: 2 },                      // 1x  InfantryMauser960
  "imperator ax 22": { damage: 0.52, range: 1 },                 // 1x  InfantryImperatorAX22
  "david light gauss rifle": { damage: 0.56, range: 3 },         // 1x  Infantry David Light Gauss Rifle
  "heavy grenade launcher inferno": { damage: 0.69, range: 1 },  // 1x  InfantryHeavyGrenadeLauncherInferno
  "thunderstroke ii": { damage: 0.53, range: 2 },                // 1x  Thunderstroke II
  "federated barrett m 61 a": { damage: 0.75, range: 2 },        // 1x  Federated Barrett M61A
  "srmlight": { damage: 0.57, range: 2 },                        // 1x  InfantrySRMLight
  "heavy laser": { damage: 1.47, range: 5 },                     // 1x  InfantryHeavyLaser
  "vibro katana": { damage: 0.32, range: 0 },                    // 1x  InfantryVibroKatana
  "semi portable ppc": { damage: 0.77, range: 1 },               // 1x  Infantry Semi-Portable PPC
  "tkassault rifle": { damage: 0.44, range: 1 },                 // 1x  InfantryTKAssaultRifle
  "portable autocannon": { damage: 0.77, range: 1 },             // 1x  InfantryPortableAutocannon
  "shredder heavy needler": { damage: 0.34, range: 0 },          // 1x  Shredder Heavy Needler
  "elephant gun": { damage: 0.11, range: 1 },                    // 1x  Elephant Gun
  "sunbeam starfire": { damage: 0.28, range: 3 },                // 1x  InfantrySunbeamStarfire
  "erlaser": { damage: 0.84, range: 4 },                         // 1x  InfantryERLaser
  "laser rifle ebony assault": { damage: 0.21, range: 2 },       // 1x  Laser Rifle (Ebony Assault)
  "imperator ax 22 assault rifle": { damage: 0.52, range: 1 },   // 1x  Imperator AX-22 Assault Rifle
  "heavy mortar": { damage: 0.57, range: 3 },                    // 1x  Infantry Heavy Mortar
  "bolt action sniper rifle": { damage: 0.18, range: 2 },        // 1x  InfantryBoltActionSniperRifle
  "claymore pistol": { damage: 0.09, range: 0 },                 // 1x  InfantryClaymorePistol
  "heavy flamer": { damage: 0.79, range: 0 },                    // 1x  InfantryHeavyFlamer
  "clan erheavy laser": { damage: 1.26, range: 7 },              // 1x  InfantryClanERHeavyLaser
  "gunther mp 20": { damage: 0.33, range: 0 },                   // 1x  Gunther MP-20
  "hrr": { damage: 0.57, range: 2 },                             // 1x  InfantryHRR
  "marx xxlaser": { damage: 0.26, range: 3 },                    // 1x  InfantryMarxXXLaser
  "vibro blade": { damage: 0.21, range: 0 },                     // 1x  InfantryVibroBlade
  "mrr": { damage: 0.53, range: 2 },                             // 1x  InfantryMRR
  "standard srminferno": { damage: 0.68, range: 2 },             // 1x  InfantryStandardSRMInferno
  "light mortar": { damage: 0.53, range: 1 },                    // 1x  InfantryLightMortar
  "autocannon semi portable": { damage: 0.77, range: 1 },        // 1x  Autocannon (Semi-Portable)
  "lrr": { damage: 0.48, range: 2 },                             // 1x  InfantryLRR
  "auto rifle modern generic": { damage: 0.52, range: 1 },       // 1x  Auto-Rifle (Modern, Generic)
  "blade vibro katana": { damage: 0.32, range: 0 },              // 1x  Blade (Vibro-katana)
  "lrm launcher corean farshot": { damage: 0.48, range: 3 },     // 1x  LRM Launcher (Corean Farshot)
  "support laser er is": { damage: 0.84, range: 4 },             // 1x  Support Laser (ER, IS)
  "laser pistol sunbeam": { damage: 0.28, range: 1 },            // 1x  Laser Pistol (Sunbeam)
  "blade vibro blade": { damage: 0.21, range: 0 },               // 1x  Blade (Vibro-blade)
  "rifle zeus heavy": { damage: 0.22, range: 1 },                // 1x  Rifle (Zeus Heavy)
  "srm launcher light": { damage: 0.57, range: 2 },              // 1x  SRM Launcher (Light)
  "mortar heavy": { damage: 0.57, range: 3 },                    // 1x  Mortar (Heavy)
  "recoilless rifle heavy": { damage: 0.57, range: 2 },          // 1x  Recoilless Rifle (Heavy)
  "rifle federated barrett m 42 b": { damage: 1.02, range: 1 },  // 1x  Rifle (Federated-Barrett M42B)
  "rifle sniper": { damage: 0.18, range: 2 },                    // 1x  Rifle (Sniper)
  "auto pistol magnum": { damage: 0.21, range: 0 },              // 1x  Auto-Pistol (Magnum)
  "grenade launcher auto inferno": { damage: 0.41, range: 1 },   // 1x  Grenade Launcher (Auto) - Inferno
  "laser rifle er sunbeam starfire": { damage: 0.28, range: 3 }, // 1x  Laser Rifle (ER [Sunbeam Starfire])
  "gauss rifle light king david": { damage: 0.68, range: 3 },    // 1x  Gauss Rifle, Light (King David)
  "laser pistol blazer": { damage: 0.26, range: 1 },             // 1x  Laser Pistol (Blazer)
  "needler rifle shredder heavy": { damage: 0.34, range: 0 },    // 1x  Needler Rifle (Shredder Heavy)
  "smg gunther mp 20": { damage: 0.33, range: 0 },               // 1x  SMG (Gunther MP-20)
  "gauss rifle thunderstroke ii": { damage: 0.53, range: 2 },    // 1x  Gauss Rifle (Thunderstroke II)
  "gauss rifle light david": { damage: 0.56, range: 3 },         // 1x  Gauss Rifle, Light (David)
  "laser rifle mauser 960": { damage: 0.93, range: 2 },          // 1x  Laser Rifle (Mauser 960)
  "laser hellbore assault": { damage: 0.63, range: 2 },          // 1x  Laser (Hellbore Assault)
  "laser rifle federated barrett m 61 a": { damage: 0.75, range: 2 }, // 1x  Laser Rifle (Federated-Barrett M61A)
} as const;

// ---------------------------------------------------------------------------
// MELEE. Punch/Kick are auto-generated for every BattleMech from tonnage;
// Override damage = ceil(classic TW / 3). Classic punch TW = ceil(mass/10),
// kick TW = ceil(mass/5). VERIFIED vs DFA card: 100t -> Punch 4 / Kick 7.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// TIC (Targeting & Interface Circuit) grouping caps (page 41). A single TIC's
// "base" damage may not exceed TIC_MAX_BASE and its max may not exceed
// TIC_MAX_DAMAGE. Base damage = the first number printed plus any C dice (since
// clusters can be slug-fired); missiles count only their guaranteed base, not
// the M dice. A SINGLE weapon is always its own legal TIC even if it exceeds
// these (e.g. Heavy Gauss) — the caps only constrain grouping.
// ---------------------------------------------------------------------------

export const TIC_MAX_BASE = 5;
export const TIC_MAX_DAMAGE = 14;

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
// Equipment surfacing. From the crit-slot blocks we show ammo (always) and a
// curated set of "important" gear; everything else (actuators, structure, heat
// sinks, engine, the weapons themselves) is ignored. This inclusion list is
// matched as a lowercase substring against the crit name (with IS/CL prefixes
// still present), first match wins — so order specific entries before general
// ones ("angel ecm" before "ecm"). `countable` items are 1-slot-each and are
// tallied (jump jets); others are shown once per location.
// ---------------------------------------------------------------------------

export interface ImportantEquipment {
  /** Lowercase substrings to look for in the crit name. */
  match: ReadonlyArray<string>;
  /** Clean label shown on the card. */
  label: string;
  /** True for 1-slot-each items that should be counted (jump jets). */
  countable?: boolean;
  /** True for body-wide systems shown once with no location (Stealth Armor, sig gear). */
  unique?: boolean;
}

export const IMPORTANT_EQUIPMENT: ReadonlyArray<ImportantEquipment> = [
  { match: ["case ii", "caseii"], label: "CASE II" },
  { match: ["case"], label: "CASE" },
  { match: ["nova cews", "novacews"], label: "Nova CEWS" },
  { match: ["angel ecm"], label: "Angel ECM" },
  { match: ["guardian ecm", "ecm suite", "ecm"], label: "ECM" },
  { match: ["bloodhound", "beagle", "active probe", "light active probe"], label: "Active Probe" },
  { match: ["targeting computer"], label: "Targeting Computer" },
  { match: ["artemis"], label: "Artemis FCS" },
  { match: ["laser ams", "laseram", "laser anti-missile", "laseranti"], label: "LAMS" },
  { match: ["antimissile", "anti-missile", "anti missile", "ams"], label: "AMS" },
  // C3 family — keep specific variants distinct (order: most specific first).
  { match: ["improved c3", "improvedc3", "c3i"], label: "C3i" },
  { match: ["c3 master boosted", "c3masterboosted", "masterboostedsystem"], label: "C3 Boosted (Master)" },
  { match: ["c3 boosted", "boostedsystemslave", "c3boostedsystem", "c3boosted"], label: "C3 Boosted (Slave)" },
  { match: ["c3 emergency master", "emergencymaster", "c3em"], label: "C3 Emergency Master" },
  { match: ["c3 master", "c3master"], label: "C3 Master" },
  { match: ["c3 slave", "c3slave"], label: "C3 Slave" },
  { match: ["c3"], label: "C3" },
  { match: ["supercharger"], label: "Supercharger" },
  { match: ["masc"], label: "MASC" },
  { match: ["triple strength myomer", "triple-strength myomer", "tsm"], label: "TSM" },
  { match: ["coolant pod"], label: "Coolant Pod" },
  { match: ["stealth"], label: "Stealth Armor", unique: true },
  { match: ["null signature"], label: "Null Sig System", unique: true },
  { match: ["void signature"], label: "Void Sig System", unique: true },
  { match: ["tag"], label: "TAG" },
  { match: ["improved jump jet", "jump jet"], label: "Jump Jet", countable: true },
];

/**
 * Construction options carried on the header lines (Armor: / Structure: /
 * Cockpit:) rather than as crit slots. Only the game-affecting / notable types
 * are surfaced on the card; "efficiency" choices (Endo Steel, Ferro-Fibrous,
 * Standard) and Stealth (already surfaced from its crit slots) are skipped.
 * Matched as a lowercase substring of the header value; first match wins.
 */
export const SPECIAL_ARMOR: ReadonlyArray<{ match: ReadonlyArray<string>; label: string }> = [
  { match: ["hardened"], label: "Hardened Armor" },
  { match: ["ferro-lamellor", "ferro-lamellar"], label: "Ferro-Lamellor Armor" },
  { match: ["ballistic-reinforced"], label: "Ballistic-Reinforced Armor" },
  { match: ["reflective"], label: "Reflective Armor" },
  { match: ["reactive"], label: "Reactive Armor" },
  { match: ["impact-resistant"], label: "Impact-Resistant Armor" },
  { match: ["anti-penetrative"], label: "Anti-Penetrative Ablation" },
  { match: ["heat-dissipating"], label: "Heat-Dissipating Armor" },
];

// Cockpits with gameplay rules; cosmetic / inherent ones (Standard, Industrial,
// Primitive, Superheavy, QuadVee) are intentionally skipped.
export const SPECIAL_COCKPIT: ReadonlyArray<{ match: ReadonlyArray<string>; label: string }> = [
  { match: ["torso-mounted", "torso mounted"], label: "Torso-Mounted Cockpit" },
  { match: ["command console"], label: "Command Console" },
  { match: ["interface"], label: "Interface Cockpit" },
  { match: ["small"], label: "Small Cockpit" },
];

// Non-standard GYROS (from the `Gyro:` line). Standard / Superheavy are skipped.
export const SPECIAL_GYRO: ReadonlyArray<{ match: ReadonlyArray<string>; label: string }> = [
  { match: ["heavy duty", "heavy-duty"], label: "Heavy-Duty Gyro" },
  { match: ["compact"], label: "Compact Gyro" },
  { match: ["xl"], label: "XL Gyro" },
];

/** Notable ENGINE types (from the `Engine:` line). Standard fusion is skipped. */
export const SPECIAL_ENGINE: ReadonlyArray<{ match: ReadonlyArray<string>; label: string; tech?: boolean }> = [
  { match: ["xxl"], label: "XXL Engine", tech: true },
  { match: ["xl"], label: "XL Engine", tech: true },
  { match: ["light fusion", "light"], label: "Light Engine" },
  { match: ["compact"], label: "Compact Engine" },
  { match: ["i.c.e.", "ice"], label: "I.C.E." },
  { match: ["fuel cell", "fuel-cell"], label: "Fuel Cell" },
];

/** 'Mech location print order for grouping equipment and similar lists. */
export const LOCATION_ORDER: ReadonlyArray<MechLocation> = [
  "HD", "CT", "RT", "LT", "RA", "LA", "RL", "LL", "CTR", "RTR", "LTR",
];

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
  // Ultralight (TacOps). Head stays 3.
  10: { HD: 3, CT: 4, sideTorso: 3, arm: 1, leg: 2 },
  15: { HD: 3, CT: 5, sideTorso: 4, arm: 2, leg: 3 },
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
  // Superheavy 'Mechs (TacOps, over 100t). Head structure is 4. BEST-EFFORT —
  // VERIFY these against the DFA builder; the card prints structure/3 (round
  // nearest), so a ±1 error shifts at most one pip.
  105: { HD: 4, CT: 33, sideTorso: 22, arm: 18, leg: 22 },
  110: { HD: 4, CT: 35, sideTorso: 23, arm: 18, leg: 23 },
  115: { HD: 4, CT: 36, sideTorso: 24, arm: 19, leg: 24 },
  120: { HD: 4, CT: 38, sideTorso: 25, arm: 20, leg: 25 },
  125: { HD: 4, CT: 39, sideTorso: 26, arm: 21, leg: 26 },
  130: { HD: 4, CT: 41, sideTorso: 27, arm: 21, leg: 27 },
  135: { HD: 4, CT: 42, sideTorso: 28, arm: 22, leg: 28 },
  140: { HD: 4, CT: 44, sideTorso: 29, arm: 23, leg: 29 },
  145: { HD: 4, CT: 45, sideTorso: 30, arm: 24, leg: 30 },
  150: { HD: 4, CT: 47, sideTorso: 31, arm: 24, leg: 31 },
  155: { HD: 4, CT: 48, sideTorso: 32, arm: 25, leg: 32 },
  160: { HD: 4, CT: 50, sideTorso: 33, arm: 26, leg: 33 },
  165: { HD: 4, CT: 51, sideTorso: 34, arm: 27, leg: 34 },
  170: { HD: 4, CT: 53, sideTorso: 35, arm: 27, leg: 35 },
  175: { HD: 4, CT: 54, sideTorso: 36, arm: 28, leg: 36 },
  180: { HD: 4, CT: 56, sideTorso: 37, arm: 29, leg: 37 },
  185: { HD: 4, CT: 57, sideTorso: 38, arm: 30, leg: 38 },
  190: { HD: 4, CT: 59, sideTorso: 39, arm: 30, leg: 39 },
  195: { HD: 4, CT: 60, sideTorso: 40, arm: 31, leg: 40 },
  200: { HD: 4, CT: 62, sideTorso: 41, arm: 32, leg: 41 },
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
// Battle Armor (BLK). Reference data for the BA parser/converter. BA armor and
// movement currently MIRROR the 'Mech rules (ARM_LEG_ARMOR_DIVISOR, TMM_BY_RUN)
// as a best-effort starting point — see battlearmor.ts for the TODO markers.
// ---------------------------------------------------------------------------

/** BLK `<weightclass>` index (0..4) -> Battle Armor weight class label. */
export const BA_WEIGHT_CLASSES: ReadonlyArray<import("./types.js").BAWeightClass> = [
  "PA(L)",
  "Light",
  "Medium",
  "Heavy",
  "Assault",
] as const;

/**
 * Substrings that mark a BLK equipment line as a WEAPON (so it is surfaced on
 * the card even when it is not yet in the TW damage table — it then shows as an
 * unknown weapon with a warning rather than being silently dropped as gear).
 * Matched case-insensitively against the normalized item name. Lines that match
 * none of these (manipulators, jump boosters, searchlights, myomer, etc.) are
 * treated as equipment/ammo or ignored.
 */
export const WEAPON_HINTS: ReadonlyArray<string> = [
  "laser",
  "ppc",
  "srm",
  "lrm",
  "mrm",
  "gauss",
  "flamer",
  "mortar",
  "cannon",
  "rifle",
  "machine gun",
  "mg",
  "launcher",
  "mml",
  "atm",
  "plasma",
  "hag",
  "ac/",
  "autocannon",
  "narc",
  "grenade",
  "bolt",
  "blazer",
  "needler",
  "magshot",
] as const;

/**
 * Compact display abbreviations for the Battle Armor firepower table, keyed on
 * the NORMALIZED weapon name (see normalizeWeaponName). These mirror the short
 * labels printed on the official Override BA card (e.g. "SLas", "SRM-2"). Names
 * not listed fall back to a cleaned, spaced version of the original. A Clan
 * prefix ("c") is added by abbreviateWeapon when appropriate.
 */
export const WEAPON_ABBREV: Readonly<Record<string, string>> = {
  "small laser": "SLas",
  "medium laser": "MLas",
  "large laser": "LLas",
  "er small laser": "ER SLas",
  "er medium laser": "ER MLas",
  "er large laser": "ER LLas",
  "small pulse laser": "SPLas",
  "medium pulse laser": "MPLas",
  "large pulse laser": "LPLas",
  "micro pulse laser": "μPLas",
  "er micro laser": "ER μLas",
  ppc: "PPC",
  "er ppc": "ER PPC",
  "light ppc": "LPPC",
  "heavy ppc": "HPPC",
  "snub-nose ppc": "SNPPC",
  flamer: "Flmr",
  "vehicle flamer": "vFlmr",
  "machine gun": "MG",
  "light machine gun": "LMG",
  "heavy machine gun": "HMG",
  "gauss rifle": "Gauss",
  "light gauss rifle": "LGauss",
  "heavy gauss rifle": "HGauss",
  "ap gauss rifle": "APGauss",
  magshot: "Magshot",
  "srm 2": "SRM-2",
  "srm 4": "SRM-4",
  "srm 6": "SRM-6",
  "streak srm 2": "SSRM-2",
  "streak srm 4": "SSRM-4",
  "streak srm 6": "SSRM-6",
  "lrm 5": "LRM-5",
  "lrm 10": "LRM-10",
  "lrm 15": "LRM-15",
  "lrm 20": "LRM-20",
  "ac/2": "AC/2",
  "ac/5": "AC/5",
  "ac/10": "AC/10",
  "ac/20": "AC/20",
  "ultra ac/2": "UAC/2",
  "ultra ac/5": "UAC/5",
  "ultra ac/10": "UAC/10",
  "ultra ac/20": "UAC/20",
  "rotary ac/2": "RAC/2",
  "rotary ac/5": "RAC/5",
  "light ac/2": "LAC/2",
  "light ac/5": "LAC/5",
  "lb 2-x ac": "LB2-X",
  "lb 5-x ac": "LB5-X",
  "lb 10-x ac": "LB10-X",
  "lb 20-x ac": "LB20-X",
  "hag/20": "HAG/20",
  "hag/30": "HAG/30",
  "hag/40": "HAG/40",
  "mrm 10": "MRM-10",
  "mrm 20": "MRM-20",
  "mrm 30": "MRM-30",
  "mrm 40": "MRM-40",
} as const;

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
export const ARMOR_KEY_MAP: Readonly<Record<string, "HD" | "CT" | "LT" | "RT" | "LA" | "RA" | "LL" | "RL" | "CL" | "CTR" | "LTR" | "RTR">> = {
  HD: "HD",
  CT: "CT",
  LT: "LT",
  RT: "RT",
  LA: "LA",
  RA: "RA",
  LL: "LL",
  RL: "RL",
  // Quad legs: front legs read as arms on the biped paper-doll, rear legs as legs.
  FLL: "LA",
  FRL: "RA",
  RLL: "LL",
  RRL: "RL",
  // Tripod center leg gets its own location.
  CL: "CL",
  // rear torso, both naming conventions
  CTR: "CTR",
  RTC: "CTR", // "Rear Torso Center"
  LTR: "LTR",
  RTL: "LTR", // "Rear Torso Left"
  RTR: "RTR", // both "Right Torso Rear" and "Rear Torso Right" -> right torso rear
} as const;

/** Full weapon-location names (lower-cased) -> canonical location code. */
export const WEAPON_LOCATION_MAP: Readonly<Record<string, "HD" | "CT" | "LT" | "RT" | "LA" | "RA" | "LL" | "RL" | "CL">> = {
  head: "HD",
  "center torso": "CT",
  "left torso": "LT",
  "right torso": "RT",
  "left arm": "LA",
  "right arm": "RA",
  "left leg": "LL",
  "right leg": "RL",
  // Quad legs map onto the biped paper-doll (front legs -> arms, rear -> legs);
  // the tripod's center leg gets its own location.
  "front left leg": "LA",
  "front right leg": "RA",
  "rear left leg": "LL",
  "rear right leg": "RL",
  "center leg": "CL",
  // Body/turret-mounted with no specific location (e.g. some ArtilleryMechs) -> CT.
  none: "CT",
} as const;

/**
 * Maps an internal-structure row onto per-location structure entries. For QUADS
 * the LA/RA slots hold the FRONT legs, so they take leg structure (all four legs
 * are legs); bipeds/tripods use the arm value for their actual arms. TRIPODS add
 * a center leg (CL) carrying leg structure.
 */
export function structureRowToLocations(
  row: InternalStructureRow,
  isQuad = false,
  isTripod = false,
): Partial<Record<StructureLocation, number>> {
  return {
    HD: row.HD,
    CT: row.CT,
    LT: row.sideTorso,
    RT: row.sideTorso,
    LA: isQuad ? row.leg : row.arm,
    RA: isQuad ? row.leg : row.arm,
    LL: row.leg,
    RL: row.leg,
    ...(isTripod ? { CL: row.leg } : {}),
  };
}
