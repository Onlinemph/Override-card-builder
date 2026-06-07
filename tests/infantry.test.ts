import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { convertAny, convertInfantry, parseBlkInfantry, ParseError } from "../src/core/index.js";

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
