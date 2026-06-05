import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  computeDamageProfile,
  computeRangeBrackets,
  convertUnit,
  formatDamage,
  formatRangeBrackets,
  isMissileWeapon,
  lookupHeadArmor,
  lookupTmm,
  lookupWeaponDamage,
  normalizeWeaponName,
  parseMtf,
  roundNearest,
  roundUp,
  WEAPON_RANGES,
} from "../src/core/index.js";
import type { OverrideCard } from "../src/core/index.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const card = (name: string): OverrideCard =>
  convertUnit(parseMtf(readFileSync(join(FIXTURES, name), "utf8"), name));

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
      [15, "1+M2 (5)"], // LRM-15
      [20, "2+M2 (7)"], // LRM-20 / MRM-20
      [4, "1+M1 (2)"], // SRM-2 / Streak SRM-2
      [8, "1+M1 (3)"], // SRM-4 / Streak SRM-4
      [12, "1+M2 (4)"], // SRM-6 / Streak SRM-6
      [30, "3+M3 (10)"], // MRM-30
      [40, "4+M4 (14)"], // MRM-40
    ];
    for (const [tw, expected] of cases) {
      expect(formatDamage(computeDamageProfile(tw, true))).toBe(expected);
    }
  });

  it("leaves direct-fire weapons flat (base === max, no M dice)", () => {
    expect(computeDamageProfile(5, false)).toEqual({ base: 2, mDice: 0, max: 2 }); // Medium Laser
    expect(computeDamageProfile(20, false)).toEqual({ base: 7, mDice: 0, max: 7 }); // AC/20
    expect(formatDamage(computeDamageProfile(20, false))).toBe("7");
  });

  it("renders missile damageText through full conversion (Atlas LRM-20 + SRM-6)", () => {
    const c = card("Atlas AS7-D.mtf");
    const text = c.weapons.map((w) => w.damageText);
    // AC/20 flat 7, LRM-20 -> 2+M2 (7), SRM-6 -> 1+M2 (4), 4x ML flat 2.
    expect(text).toEqual(["7", "2+M2 (7)", "1+M2 (4)", "2", "2", "2", "2"]);
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
