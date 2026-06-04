import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  convertUnit,
  lookupHeadArmor,
  lookupTmm,
  normalizeWeaponName,
  parseMtf,
  roundNearest,
  roundUp,
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
    expect(c.structure.torso).toBe(5); // CT IS 16 /3 -> 5.33
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
