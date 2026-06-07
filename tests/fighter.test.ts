import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { convertAny, convertFighter, parseBlkFighter, ParseError } from "../src/core/index.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const load = (name: string) => readFileSync(join(FIXTURES, name), "utf8");

describe("parseBlkFighter", () => {
  const u = parseBlkFighter(load("Test Fighter TF-1.blk"), "Test Fighter TF-1.blk");

  it("parses the fighter's identity, thrust, and facing armor", () => {
    expect(u.kind).toBe("fighter");
    expect(u.chassis).toBe("Test Fighter");
    expect(u.model).toBe("TF-1");
    expect(u.techBase).toBe("IS");
    expect(u.conventional).toBe(false);
    expect(u.motionType).toBe("Aerodyne");
    expect(u.tonnage).toBe(50);
    expect(u.safeThrust).toBe(5);
    expect(u.maxThrust).toBe(8); // ceil(5 * 1.5)
    // <armor> order: nose, right wing, left wing, aft.
    expect(u.armor).toEqual({ nose: 40, rightWing: 24, leftWing: 24, aft: 16 });
  });

  it("collects mounts tagged by facing block", () => {
    expect(u.mounts).toEqual([
      { name: "Large Laser", facing: "nose" },
      { name: "Medium Laser", facing: "leftWing" },
      { name: "Medium Laser", facing: "rightWing" },
      { name: "SRM 6", facing: "aft" },
      { name: "IS Ammo SRM-6", facing: "fuselage" },
    ]);
  });

  it("flags conventional fighters from the unit type", () => {
    const conv = parseBlkFighter(
      "<UnitType>\nConvFighter\n</UnitType>\n<Name>\nX\n</Name>\n<SafeThrust>\n4\n</SafeThrust>\n",
      "x.blk",
    );
    expect(conv.conventional).toBe(true);
  });

  it("rejects a non-fighter BLK file", () => {
    expect(() =>
      parseBlkFighter("<UnitType>\nTank\n</UnitType>\n<Name>\nX\n</Name>\n", "x.blk"),
    ).toThrowError(ParseError);
  });
});

describe("convertFighter", () => {
  const c = convertFighter(parseBlkFighter(load("Test Fighter TF-1.blk"), "TF-1.blk"));

  it("mirrors thrust, TMM, and per-facing armor (TW / 4)", () => {
    expect(c.move).toBe("5 / 8"); // safe / max
    // armor = TW / 4, round nearest (nose 40 -> 10, wings 24 -> 6, aft 16 -> 4).
    expect(c.armor).toEqual({ nose: 10, rightWing: 6, leftWing: 6, aft: 4 });
    expect(c.structure).toBe(2); // 50t -> 2 (45–70t bracket)
  });

  it("groups identical weapons WITHIN a facing only, tagged by facing code", () => {
    const labels = c.weapons.map((w) => `${w.facing}:${w.label}`);
    expect(labels).toContain("NO:LLas"); // Large Laser, nose
    expect(labels).toContain("AF:SRM-6");
    // The two wing medium lasers are in different facings, so they never group.
    expect(c.weapons.filter((w) => /MLas/i.test(w.label))).toHaveLength(2);
  });

  it("surfaces fuselage ammo as equipment with its facing", () => {
    const ammo = c.equipment.find((e) => /SRM/.test(e.label) && e.category === "ammo");
    expect(ammo?.facing).toBe("FS");
  });
});

describe("convertAny dispatch (fighter)", () => {
  it("routes a BLK Aero to the fighter path", () => {
    const r = convertAny(load("Test Fighter TF-1.blk"), "TF-1.blk");
    expect(r.kind).toBe("fighter");
    if (r.kind === "fighter") expect(r.card.name).toBe("Test Fighter TF-1");
  });
});
