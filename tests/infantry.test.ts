import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  clusterDamageInto2s,
  convertAny,
  convertInfantry,
  infantryWeaponKey,
  parseBlkInfantry,
  ParseError,
} from "../src/core/index.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const load = (name: string) => readFileSync(join(FIXTURES, name), "utf8");

describe("parseBlkInfantry", () => {
  const u = parseBlkInfantry(load("Test Infantry INF-1.blk"), "Test Infantry INF-1.blk");

  it("parses platoon size, movement, armament, and field guns", () => {
    expect(u.kind).toBe("infantry");
    expect(u.chassis).toBe("Test Infantry");
    expect(u.troopers).toBe(28); // 7 x 4
    expect(u.squadSize).toBe(7);
    expect(u.squadCount).toBe(4);
    expect(u.motionType).toBe("Jump");
    expect(u.primaryWeapon).toBe("InfantryAssaultRifle");
    expect(u.secondaryWeapon).toBe("SRM Launcher");
    expect(u.secondaryPerSquad).toBe(2);
    expect(u.antiMek).toBe(true);
    expect(u.fieldGuns).toEqual(["ISLAC5", "ISLAC5"]);
  });

  it("rejects a non-Infantry BLK file", () => {
    expect(() => parseBlkInfantry("<UnitType>\nTank\n</UnitType>\n<Name>\nX\n</Name>\n", "x.blk")).toThrowError(
      ParseError,
    );
  });
});

describe("convertInfantry", () => {
  const c = convertInfantry(parseBlkInfantry(load("Test Infantry INF-1.blk"), "INF-1.blk"));

  it("derives move/anti-mech and cleans weapon names", () => {
    expect(c.move).toBe("1 (J)"); // jump
    expect(c.antiMek).toBe(true);
    expect(c.primaryWeapon).toBe("Assault Rifle"); // "Infantry" prefix stripped, split
    expect(c.troopers).toBe(28);
    expect(c.secondaryCount).toBe(8); // 2 per squad x 4 squads
  });

  it("converts towed field guns as real weapon rows (grouped, with stats)", () => {
    expect(c.fieldGuns.length).toBeGreaterThan(0);
    const lac = c.fieldGuns[0]!;
    expect(/LAC\/5/.test(lac.label)).toBe(true);
    expect(lac.damageText).toBe("4"); // 2x LAC/5 -> ceil(sum 10 / 3) = 4
    expect(lac.unknown).toBe(false);
  });
});

describe("convertAny dispatch (infantry)", () => {
  it("routes a BLK Infantry to the infantry path", () => {
    const r = convertAny(load("Test Infantry INF-1.blk"), "INF-1.blk");
    expect(r.kind).toBe("infantry");
    if (r.kind === "infantry") expect(r.card.name).toBe("Test Infantry INF-1");
  });
});

describe("infantry platoon damage (clustering + per-trooper keys)", () => {
  it("splits a total into 2-point clusters (trailing 1 if odd)", () => {
    expect(clusterDamageInto2s(0)).toEqual([]);
    expect(clusterDamageInto2s(1)).toEqual([1]);
    expect(clusterDamageInto2s(4)).toEqual([2, 2]);
    expect(clusterDamageInto2s(5)).toEqual([2, 2, 1]);
    expect(clusterDamageInto2s(7)).toEqual([2, 2, 2, 1]);
  });

  it("canonicalizes infantry weapon names, keeping qualifiers distinct", () => {
    expect(infantryWeaponKey("Auto-Rifle")).toBe("auto rifle");
    expect(infantryWeaponKey("Auto Rifle")).toBe("auto rifle");
    expect(infantryWeaponKey("InfantryAssaultRifle")).toBe("assault rifle");
    expect(infantryWeaponKey("SRM Launcher (Hvy, One-Shot)")).toBe("srm launcher hvy one shot");
    // Portable vs Support stay distinct (different per-trooper damage).
    expect(infantryWeaponKey("Machine Gun (Portable)")).toBe("machine gun portable");
    expect(infantryWeaponKey("Machine Gun (Support)")).toBe("machine gun support");
  });

  it("scores platoon damage from the per-trooper table (primary x troopers / 3)", () => {
    // Fixture: 28 troopers, primary InfantryAssaultRifle (0.52/trooper); secondary
    // "SRM Launcher" has no per-trooper value, so only the primary counts.
    // 28 x 0.52 = 14.56 -> /3 = 4.85 -> round up 5 -> [2,2,1].
    const c = convertInfantry(parseBlkInfantry(load("Test Infantry INF-1.blk"), "INF-1.blk"));
    expect(c.damage).toEqual([2, 2, 1]);
  });

  it("derives small-arms range brackets from the primary weapon's hex range", () => {
    // Assault Rifle range = 1 hex -> {min:0, medium:1, long:1} -> PB +0, S +0 only.
    const c = convertInfantry(parseBlkInfantry(load("Test Infantry INF-1.blk"), "INF-1.blk"));
    expect(c.primaryRangeHexes).toBe(1);
    expect(c.range).toEqual({ pb: 0, s: 0, m: null, l: null, x: null });
  });

  it("builds a degradation track + breakpoints that fall as troopers die", () => {
    const c = convertInfantry(parseBlkInfantry(load("Test Infantry INF-1.blk"), "INF-1.blk"));
    // One entry per trooper; full strength is the last entry and equals .damage.
    expect(c.damageByTroopers).toHaveLength(28);
    expect(c.damageByTroopers[27]).toEqual([2, 2, 1]);
    // 1 survivor: floor(1 x 0.52) = 0 -> 0 damage -> no clusters.
    expect(c.damageByTroopers[0]).toEqual([]);
    // Breakpoints are full-strength-first and monotonically weaken.
    expect(c.damageBreaks[0]!.from).toBe(28);
    expect(c.damageBreaks[0]!.damage).toEqual([2, 2, 1]);
    expect(c.damageBreaks.at(-1)!.to).toBe(1);
    const totals = c.damageBreaks.map((b) => b.damage.reduce((a, v) => a + v, 0));
    expect([...totals]).toEqual([...totals].sort((a, b) => b - a)); // non-increasing
  });

  it("leaves damage and range unscored when the primary weapon is unknown", () => {
    const blk = load("Test Infantry INF-1.blk").replace("InfantryAssaultRifle", "Frobnicator 9000");
    const c = convertInfantry(parseBlkInfantry(blk, "INF-1.blk"));
    expect(c.damage).toEqual([]);
    expect(c.damageByTroopers).toEqual([]);
    expect(c.range).toBeNull();
    expect(c.primaryRangeHexes).toBeNull();
  });
});
