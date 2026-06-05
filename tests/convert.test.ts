import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  classifyDamage,
  computeDamageProfile,
  computeRangeBrackets,
  computeVariableProfile,
  convertUnit,
  formatDamage,
  formatRangeBrackets,
  isMissileWeapon,
  isRangeVaryingCluster,
  isRocketLauncher,
  lookupHeadArmor,
  lookupTmm,
  lookupWeaponDamage,
  normalizeWeaponName,
  parseMtf,
  roundNearest,
  roundUp,
  WEAPON_DAMAGE_BY_RANGE,
  WEAPON_RANGES,
  WEAPON_RANGES_CLAN,
} from "../src/core/index.js";
import type { TechBase } from "../src/core/index.js";
import type { OverrideCard } from "../src/core/index.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const card = (name: string): OverrideCard =>
  convertUnit(parseMtf(readFileSync(join(FIXTURES, name), "utf8"), name));

/** Run a single weapon name through the full damage path, mirroring convertWeapon. */
const damageTextFor = (name: string, tech: TechBase = "IS"): string => {
  const key = normalizeWeaponName(name);
  const { twDamage, unknown } = lookupWeaponDamage(name, tech);
  const byRange = WEAPON_DAMAGE_BY_RANGE[key];
  const profile =
    !unknown && byRange
      ? computeVariableProfile(byRange)
      : computeDamageProfile(
          twDamage,
          unknown ? "direct" : classifyDamage(key),
          isRangeVaryingCluster(key),
          isRocketLauncher(key),
        );
  return formatDamage(profile);
};

// NOTE: expected values below are hand-computed from the formulas in
// convert.ts against the embedded fixtures. They are the FIRST-PASS values to
// be cross-checked against DFA-generated cards (see README). Replace with the
// corrected expected values once supplied.

describe("rounding helpers", () => {
  it("roundUp rounds toward +Infinity", () => {
    expect(roundUp(1.01)).toBe(2);
    expect(roundUp(1.667)).toBe(2);
    expect(roundUp(2)).toBe(2);
  });
  it("roundNearest rounds .5 up", () => {
    expect(roundNearest(4.333)).toBe(4);
    expect(roundNearest(8.667)).toBe(9);
    expect(roundNearest(2.5)).toBe(3);
  });
});

describe("lookupTmm (keyed on RUN MP, verified vs DFA)", () => {
  it("matches the verified data points", () => {
    expect(lookupTmm(3)).toBe(0);
    expect(lookupTmm(5)).toBe(1); // Atlas anchor
    expect(lookupTmm(6)).toBe(1);
    expect(lookupTmm(8)).toBe(2);
    expect(lookupTmm(9)).toBe(2);
    expect(lookupTmm(11)).toBe(3);
    expect(lookupTmm(12)).toBe(3);
  });
  it("applies the inferred upper bands", () => {
    expect(lookupTmm(17)).toBe(4);
    expect(lookupTmm(18)).toBe(5);
  });
});

describe("lookupHeadArmor (bracketed on head TW, cap 5)", () => {
  it("matches the bracket table", () => {
    expect(lookupHeadArmor(0)).toBe(1);
    expect(lookupHeadArmor(2)).toBe(1);
    expect(lookupHeadArmor(5)).toBe(2);
    expect(lookupHeadArmor(7)).toBe(3);
    expect(lookupHeadArmor(9)).toBe(4);
    expect(lookupHeadArmor(12)).toBe(5);
  });
});

describe("normalizeWeaponName", () => {
  it("normalizes spelling variants to TW table keys", () => {
    expect(normalizeWeaponName("Autocannon/20")).toBe("ac/20");
    expect(normalizeWeaponName("AC/20")).toBe("ac/20");
    expect(normalizeWeaponName("ISAC20")).toBe("ac/20");
    expect(normalizeWeaponName("ISMediumLaser")).toBe("medium laser");
    expect(normalizeWeaponName("Medium Laser")).toBe("medium laser");
    expect(normalizeWeaponName("LRM 20")).toBe("lrm 20");
    expect(normalizeWeaponName("SRM-6")).toBe("srm 6");
    expect(normalizeWeaponName("1 Small Laser")).toBe("small laser");
  });
});

describe("lookupWeaponDamage (TW values, tech-base aware)", () => {
  it("returns shared/IS values by default", () => {
    expect(lookupWeaponDamage("Medium Laser")).toEqual({ twDamage: 5, unknown: false });
    expect(lookupWeaponDamage("Gauss Rifle")).toEqual({ twDamage: 15, unknown: false });
    expect(lookupWeaponDamage("Streak SRM 6")).toEqual({ twDamage: 12, unknown: false });
    expect(lookupWeaponDamage("MRM 40")).toEqual({ twDamage: 40, unknown: false });
  });
  it("disambiguates ER weapons by tech base", () => {
    expect(lookupWeaponDamage("ER PPC", "IS").twDamage).toBe(10);
    expect(lookupWeaponDamage("ER PPC", "Clan").twDamage).toBe(15);
    expect(lookupWeaponDamage("ER Large Laser", "IS").twDamage).toBe(8);
    expect(lookupWeaponDamage("ER Large Laser", "Clan").twDamage).toBe(10);
    expect(lookupWeaponDamage("ER Medium Laser", "Clan").twDamage).toBe(7);
  });
  it("falls back to the shared table for Clan units when no override exists", () => {
    expect(lookupWeaponDamage("AC/20", "Clan").twDamage).toBe(20);
  });
  it("flags unknown weapons", () => {
    expect(lookupWeaponDamage("Death Ray")).toEqual({ twDamage: 0, unknown: true });
  });
});

describe("missile damage profile (M dice, VERIFIED vs DFA cards)", () => {
  it("classifies missile families, excluding direct-fire weapons", () => {
    expect(isMissileWeapon("lrm 15")).toBe(true);
    expect(isMissileWeapon("srm 6")).toBe(true);
    expect(isMissileWeapon("streak srm 6")).toBe(true); // leading "streak srm", not "srm"
    expect(isMissileWeapon("mrm 40")).toBe(true);
    expect(isMissileWeapon("rocket launcher 10")).toBe(true);
    expect(isMissileWeapon("medium laser")).toBe(false);
    expect(isMissileWeapon("ac/20")).toBe(false);
    expect(isMissileWeapon("gauss rifle")).toBe(false);
  });

  it("derives base/mDice/max for every confirmed card line", () => {
    // [rackTW, expected "base+M{mDice} (max)"] — exactly the DFA card screenshots.
    const cases: Array<[number, string]> = [
      [5, "1+M1 (2)"], // LRM-5
      [10, "1+M1 (4)"], // LRM-10 / MRM-10
      [15, "1+M2 (5)"], // LRM-15 / RL15
      [20, "2+M2 (7)"], // LRM-20 / MRM-20
      [4, "1+M1 (2)"], // SRM-2 / Streak SRM-2
      [8, "1+M1 (3)"], // SRM-4 / Streak SRM-4
      [12, "1+M2 (4)"], // SRM-6 / Streak SRM-6
      [30, "3+M3 (10)"], // MRM-30
      [40, "4+M4 (14)"], // MRM-40
    ];
    for (const [tw, expected] of cases) {
      expect(formatDamage(computeDamageProfile(tw, "missile"))).toBe(expected);
    }
  });

  it("leaves direct-fire weapons flat (base === max, no dice)", () => {
    expect(computeDamageProfile(5, "direct")).toEqual({
      kind: "direct",
      base: 2,
      mDice: 0,
      cDice: [],
      byRange: [],
      max: 2,
    }); // Medium Laser
    expect(formatDamage(computeDamageProfile(20, "direct"))).toBe("7"); // AC/20
  });

  it("rounds Rocket Launcher max to nearest (RL10 -> 3, not 4)", () => {
    // All three RLs VERIFIED vs DFA card; RL10 would be 4 under ceil.
    expect(damageTextFor("Rocket Launcher 10")).toBe("1+M1 (3)");
    expect(damageTextFor("Rocket Launcher 15")).toBe("1+M2 (5)");
    expect(damageTextFor("Rocket Launcher 20")).toBe("2+M2 (7)");
  });

  it("renders missile damageText through full conversion (Atlas LRM-20 + SRM-6)", () => {
    const c = card("Atlas AS7-D.mtf");
    const text = c.weapons.map((w) => w.damageText);
    // AC/20 flat 7, LRM-20 -> 2+M2 (7), SRM-6 -> 1+M2 (4), 4x ML flat 2.
    expect(text).toEqual(["7", "2+M2 (7)", "1+M2 (4)", "2", "2", "2", "2"]);
  });
});

describe("cluster damage profile (C dice, VERIFIED vs DFA card)", () => {
  it("classifies cluster families (LB-X, HAG), not missiles or direct-fire", () => {
    expect(classifyDamage("lb 10-x ac")).toBe("cluster");
    expect(classifyDamage("hag/30")).toBe("cluster"); // slash-delimited family token
    expect(classifyDamage("lrm 15")).toBe("missile");
    expect(classifyDamage("medium laser")).toBe("direct");
    expect(isRangeVaryingCluster("hag/30")).toBe(true);
    expect(isRangeVaryingCluster("lb 10-x ac")).toBe(false);
  });

  it("derives base+C{cDice} where base + cDice === max", () => {
    expect(formatDamage(computeDamageProfile(10, "cluster"))).toBe("1+C3"); // LB 10-X, VERIFIED
    expect(formatDamage(computeDamageProfile(20, "cluster"))).toBe("2+C5"); // LB 20-X
  });

  it("sheds one C die per bracket for range-varying clusters (HAG)", () => {
    expect(formatDamage(computeDamageProfile(30, "cluster", true))).toBe("3+C7|6|5"); // HAG/30, VERIFIED
    expect(computeDamageProfile(30, "cluster", true)).toEqual({
      kind: "cluster",
      base: 3,
      mDice: 0,
      cDice: [7, 6, 5],
      byRange: [],
      max: 10,
    });
  });

  it("renders verified damage lines through full conversion", () => {
    // LB 10-X cluster, RL15 missile (+M2), RAC/5 and UAC/10 flat, all from the card.
    expect(damageTextFor("LB 10-X AC")).toBe("1+C3");
    expect(damageTextFor("LB 10-X AC", "Clan")).toBe("1+C3"); // cLB 10-X same
    expect(damageTextFor("Rotary AC/5")).toBe("3"); // TW 8 -> ceil/3
    expect(damageTextFor("Ultra AC/10")).toBe("4"); // TW 10 -> ceil/3
    expect(damageTextFor("Ultra AC/20", "Clan")).toBe("7"); // cUAC/20 TW 20 -> ceil/3
    expect(damageTextFor("HAG/30", "Clan")).toBe("3+C7|6|5");
  });
});

describe("TIC grouping (page 41 caps: base <= 5, max <= 14)", () => {
  const W = (name: string, location: string, rearMounted = false) => ({
    name,
    location: location as never,
    rawLocation: location,
    rearMounted,
  });
  const ticsFor = (weapons: ReturnType<typeof W>[], mass = 55) =>
    convertUnit({
      chassis: "T",
      model: "1",
      mass,
      techBase: "IS",
      config: "Biped",
      engine: { rating: 275, type: "Fusion" },
      movement: { walkMP: 5, runMP: 8, jumpMP: 0, runDerived: true },
      heatSinks: { count: 10, type: "single" },
      armor: { CT: 10 },
      structure: {},
      weapons,
    }).tics;

  it("groups identical weapons in the same location, summing TW", () => {
    const tics = ticsFor([W("Medium Laser", "LA"), W("Medium Laser", "LA")]);
    expect(tics).toHaveLength(1);
    expect(tics[0]!.label).toBe("2x Medium Laser"); // TW 10 -> ceil/3 = 4
    expect(tics[0]!.damageText).toBe("4");
  });

  it("does not group across different locations", () => {
    const tics = ticsFor([W("Medium Laser", "LA"), W("Medium Laser", "RA")]);
    expect(tics).toHaveLength(2);
    expect(tics.every((t) => t.count === 1)).toBe(true);
  });

  it("splits a group when the base cap (5) would be exceeded", () => {
    // 4 Medium Lasers: TW 20 -> max 7, base 7 > 5. Largest legal group is 3 (TW 15 -> 5).
    const tics = ticsFor([0, 1, 2, 3].map(() => W("Medium Laser", "RA")));
    expect(tics.map((t) => t.count)).toEqual([3, 1]);
    expect(tics[0]!.damageText).toBe("5");
    expect(tics[1]!.damageText).toBe("2");
  });

  it("splits missiles when the max cap (14) would be exceeded", () => {
    // 3 LRM-15: TW 45 -> max 15 > 14. Legal pair (TW 30 -> 3+M3 (10)) + single.
    const tics = ticsFor([0, 1, 2].map(() => W("LRM 15", "LT")));
    expect(tics.map((t) => t.count)).toEqual([2, 1]);
    expect(tics[0]!.damageText).toBe("3+M3 (10)");
    expect(tics[1]!.damageText).toBe("1+M2 (5)");
  });

  it("keeps an over-cap single weapon as its own legal TIC (Heavy Gauss)", () => {
    const tics = ticsFor([W("Heavy Gauss Rifle", "RT")]);
    expect(tics).toHaveLength(1);
    expect(tics[0]!.count).toBe(1);
    expect(tics[0]!.damageText).toBe("9|7|4"); // variable, never grouped
  });

  it("converts the Atlas into per-location TICs", () => {
    const c = card("Atlas AS7-D.mtf");
    // 4 Medium Lasers: 2 in arms (LA, RA -> separate), 2 rear in CT -> grouped.
    const ml = c.tics.filter((t) => t.label.includes("Medium Laser"));
    const grouped = ml.find((t) => t.count === 2);
    expect(grouped?.location).toBe("CT");
    expect(grouped?.rearMounted).toBe(true);
    expect(grouped?.damageText).toBe("4"); // 2x ML: TW 10 -> ceil(10/3) = 4
  });
});

describe("melee (Punch/Kick auto-generated + physical weapons)", () => {
  it("derives Punch/Kick from tonnage (VERIFIED 100t -> 4/7)", () => {
    expect(card("Atlas AS7-D.mtf").melee).toEqual({ punch: 4, kick: 7 }); // 100t
    expect(card("Hunchback HBK-4G.mtf").melee).toEqual({ punch: 2, kick: 4 }); // 50t
    expect(card("Locust LCT-1V.mtf").melee).toEqual({ punch: 1, kick: 2 }); // 20t
  });

  it("converts physical melee weapons from tonnage with a PB-only to-hit mod", () => {
    // Hatchet on a 100t 'Mech: ceil(100/15)=7, PB +0 only.
    const u = parseMtf(
      readFileSync(join(FIXTURES, "Atlas AS7-D.mtf"), "utf8"),
      "Atlas AS7-D.mtf",
    );
    const withHatchet = convertUnit({
      ...u,
      weapons: [{ name: "Hatchet", location: "RA", rawLocation: "Right Arm", rearMounted: false }],
    });
    const hatchet = withHatchet.weapons[0]!;
    expect(hatchet.damageText).toBe("7");
    expect(hatchet.rangeText).toBe("+0 – – – –");
  });
});

describe("variable (range-dependent) damage (VERIFIED vs DFA card)", () => {
  it("classifies and formats short|med|long damage", () => {
    expect(classifyDamage("snub-nose ppc")).toBe("variable");
    expect(classifyDamage("heavy gauss rifle")).toBe("variable");
    expect(formatDamage(computeVariableProfile([10, 8, 5]))).toBe("4|3|2"); // SNPPC
    expect(formatDamage(computeVariableProfile([25, 20, 10]))).toBe("9|7|4"); // Heavy Gauss
  });

  it("renders through the full conversion path", () => {
    expect(damageTextFor("Snub-Nose PPC")).toBe("4|3|2");
    expect(damageTextFor("Heavy Gauss Rifle")).toBe("9|7|4");
  });

  it("exposes per-range values with min as base and short as max", () => {
    expect(computeVariableProfile([25, 20, 10])).toEqual({
      kind: "variable",
      base: 4,
      mDice: 0,
      cDice: [],
      byRange: [9, 7, 4],
      max: 9,
    });
  });
});

describe("range brackets (page 43, VERIFIED vs DFA cards)", () => {
  const brackets = (key: string) => formatRangeBrackets(computeRangeBrackets(WEAPON_RANGES[key]!));

  it("reproduces the missile card rows exactly", () => {
    expect(brackets("lrm 15")).toBe("+4 +2 +0 +2 +4"); // min 6 -> Short +2 (>=4)
    expect(brackets("srm 6")).toBe("+0 +0 +2 – –");
    expect(brackets("streak srm 6")).toBe("+0 +0 +2 – –");
    expect(brackets("mrm 10")).toBe("+1 +1 +3 +5 –"); // inherent +1 layered on
  });

  it("layers the MRM inherent +1 only on applicable brackets (X stays –)", () => {
    expect(computeRangeBrackets(WEAPON_RANGES["mrm 40"]!)).toEqual({
      pb: 1,
      s: 1,
      m: 3,
      l: 5,
      x: null,
    });
  });

  it("derives sensible brackets for canonical direct-fire weapons", () => {
    expect(brackets("medium laser")).toBe("+0 +0 +2 – –"); // 0/6/9
    expect(brackets("large laser")).toBe("+0 +0 +2 +4 –"); // 0/10/15
    expect(brackets("ppc")).toBe("+2 +0 +2 +4 –"); // min 3 -> PB +2, S +0
    expect(brackets("ac/2")).toBe("+4 +2 +0 +2 +4"); // min 4, long 24
    expect(brackets("ac/20")).toBe("+0 +0 +2 – –"); // 0/6/9
    expect(brackets("gauss rifle")).toBe("+2 +0 +0 +2 +4"); // min 2, med 15, long 22
  });

  it("the Short bracket follows min>=4, not literal ==4", () => {
    expect(computeRangeBrackets({ min: 6, medium: 14, long: 21 }).s).toBe(2); // LRM
    expect(computeRangeBrackets({ min: 3, medium: 12, long: 18 }).s).toBe(0); // PPC
    expect(computeRangeBrackets({ min: 4, medium: 16, long: 24 }).s).toBe(2); // AC/2
  });

  it("reproduces every verified row from the mixed-weapons DFA card", () => {
    expect(brackets("medium pulse laser")).toBe("-2 -2 +2 – –"); // pulse -2
    expect(brackets("er medium laser")).toBe("+0 +0 +2 +4 –"); // IS, long 13
    expect(brackets("lb 10-x ac")).toBe("+0 +0 +2 +4 –");
    expect(brackets("hag/30")).toBe("+2 +0 +0 +2 +4");
    expect(brackets("rotary ac/5")).toBe("+0 +0 +2 +4 –"); // IS
    expect(brackets("ultra ac/10")).toBe("+0 +0 +2 +4 –"); // IS
    expect(brackets("rocket launcher 15")).toBe("+1 +1 +3 +5 –"); // inherent +1
  });

  it("reproduces the IS rows from the mixed 100-ton DFA card", () => {
    expect(brackets("small pulse laser")).toBe("-2 -2 – – –"); // SPLas
    expect(brackets("large pulse laser")).toBe("-2 -2 +0 – –"); // LPLas
    expect(brackets("er small laser")).toBe("+0 +0 +4 – –"); // erSLas
    expect(brackets("er large laser")).toBe("+0 +0 +0 +2 +4"); // erLLas IS
    expect(brackets("snub-nose ppc")).toBe("+0 +0 +0 +4 –"); // SNPPC
    expect(brackets("heavy gauss rifle")).toBe("+4 +2 +0 +2 +4"); // HGauss
    expect(brackets("rotary ac/2")).toBe("+0 +0 +2 +4 –"); // RAC/2
    expect(brackets("ultra ac/20")).toBe("+0 +0 +2 – –"); // cUAC/20
  });

  it("applies Clan range overrides where TW ranges diverge", () => {
    const clan = (key: string) =>
      formatRangeBrackets(computeRangeBrackets(WEAPON_RANGES_CLAN[key]!));
    expect(clan("er small laser")).toBe("+0 +0 +4 – –"); // cerSLas 0/4/6
    expect(clan("er medium laser")).toBe("+0 +0 +2 +4 –"); // cerMLas 0/10/15
    expect(clan("er large laser")).toBe("+0 +0 +0 +2 +2"); // cerLLas 0/15/25 (X +2, not +4)
    expect(clan("medium pulse laser")).toBe("-2 -2 +0 – –"); // cMPLas 0/8/12
    expect(clan("rotary ac/5")).toBe("+0 +0 +0 +2 +4"); // cRAC/5 0/16/24
  });

  it("confirms tech-independent ranges resolve identically for IS and Clan units", () => {
    // cLB 10-X and cerPPC matched IS on the card -> no Clan override needed.
    expect(WEAPON_RANGES_CLAN["lb 10-x ac"]).toBeUndefined();
    expect(WEAPON_RANGES_CLAN["er ppc"]).toBeUndefined();
    expect(brackets("lb 10-x ac")).toBe("+0 +0 +2 +4 –");
    expect(brackets("er ppc")).toBe("+0 +0 +0 +2 +4");
  });

  it("attaches range rows through full conversion and leaves unlisted weapons null", () => {
    const c = card("Atlas AS7-D.mtf");
    const lrm = c.weapons.find((w) => w.name === "LRM 20")!;
    expect(lrm.rangeText).toBe("+4 +2 +0 +2 +4");
    const ml = c.weapons.find((w) => w.name === "Medium Laser")!;
    expect(ml.rangeText).toBe("+0 +0 +2 – –");
  });
});

describe("convertUnit: Locust LCT-1V", () => {
  const c = card("Locust LCT-1V.mtf");
  it("movement and TMM", () => {
    expect(c.move).toBe("8/12");
    expect(c.tmm).toBe(3); // run 12
  });
  it("armor", () => {
    expect(c.armor.torso).toBe(4); // (10+8+8)/6 = 4.33
    expect(c.armor.rear).toBe(1); // (2+2+2)/6 = 1
    expect(c.armor.head).toBe(4); // HD TW 8 -> bracket 8-9
    expect(c.armor.leftArm).toBe(1); // 4/3 -> 1
    expect(c.armor.leftLeg).toBe(3); // 8/3 -> 2.67 -> 3
  });
  it("structure (per-section, IS/3 min 1) and heat", () => {
    expect(c.structure.torso).toBe(2); // CT IS 6 /3
    expect(c.structure.head).toBe(1); // HD IS 3 /3
    expect(c.structure.leftArm).toBe(1); // arm IS 3 /3
    expect(c.structure.leftLeg).toBe(1); // leg IS 4 /3 -> 1.33
    expect(c.heatDissipation).toBe(2); // 10 single /5
  });
  it("weapon damage", () => {
    expect(c.weapons.map((w) => w.damage)).toEqual([2, 1, 1]); // ML, MG, MG
  });
});

describe("convertUnit: Hunchback HBK-4G", () => {
  const c = card("Hunchback HBK-4G.mtf");
  it("movement and TMM", () => {
    expect(c.move).toBe("4/6");
    expect(c.tmm).toBe(1); // run 6
  });
  it("armor / structure / heat", () => {
    expect(c.armor.torso).toBe(9); // (20+16+16)/6 = 8.67
    expect(c.armor.rear).toBe(3); // (6+6+6)/6
    expect(c.armor.head).toBe(4); // HD TW 9
    expect(c.armor.leftArm).toBe(5); // 16/3 -> 5.33
    expect(c.structure.torso).toBe(6); // 50t correction to match official builder
    expect(c.structure.leftArm).toBe(3); // arm IS 8 /3 -> 2.67
    expect(c.structure.leftLeg).toBe(4); // leg IS 12 /3
    expect(c.heatDissipation).toBe(3); // 13/5 -> 2.6
  });
  it("weapon damage (AC/20, ML, ML, Small Laser)", () => {
    expect(c.weapons.map((w) => w.damage)).toEqual([7, 2, 2, 1]);
  });
});

describe("convertUnit: Atlas AS7-D", () => {
  const c = card("Atlas AS7-D.mtf");
  it("movement and TMM (3/5 -> run 5 -> TMM 1)", () => {
    expect(c.move).toBe("3/5");
    expect(c.tmm).toBe(1);
    expect(c.tmmSprint).toBe(2);
    expect(c.tmmJump).toBe(2);
  });
  it("armor / structure / heat", () => {
    expect(c.armor.torso).toBe(18); // (48+30+30)/6
    expect(c.armor.rear).toBe(5); // (12+9+9)/6
    expect(c.armor.head).toBe(4);
    expect(c.armor.leftArm).toBe(11); // 34/3 -> 11.33
    expect(c.armor.leftLeg).toBe(14); // 41/3 -> 13.67
    expect(c.structure.torso).toBe(10); // CT IS 31 /3 -> 10.33
    expect(c.structure.head).toBe(1); // HD IS 3 /3
    expect(c.structure.leftArm).toBe(6); // arm IS 17 /3 -> 5.67
    expect(c.structure.leftLeg).toBe(7); // leg IS 21 /3
    expect(c.heatDissipation).toBe(4); // 20/5
  });
  it("weapon damage (AC/20, LRM 20, SRM 6, 4x ML)", () => {
    expect(c.weapons.map((w) => w.damage)).toEqual([7, 7, 4, 2, 2, 2, 2]);
    expect(c.weapons.filter((w) => w.rearMounted)).toHaveLength(2);
  });
  it("has no unknown-weapon warnings", () => {
    expect(c.warnings).toEqual([]);
  });
});
