import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { convertAny, convertDropship, parseBlkDropship, ParseError } from "../src/core/index.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const load = (name: string) => readFileSync(join(FIXTURES, name), "utf8");

describe("parseBlkDropship", () => {
  const u = parseBlkDropship(load("Test Dropship DS-1.blk"), "Test Dropship DS-1.blk");

  it("parses identity, thrust, sinks, SI, and arc armor", () => {
    expect(u.kind).toBe("dropship");
    expect(u.chassis).toBe("Test Dropship");
    expect(u.tonnage).toBe(3000);
    expect(u.safeThrust).toBe(4);
    expect(u.maxThrust).toBe(6); // ceil(4 * 1.5)
    expect(u.heatSinkCount).toBe(40);
    expect(u.heatSinkType).toBe("double");
    expect(u.structuralIntegrity).toBe(12);
    // <armor> order: nose, left side, right side, aft.
    expect(u.armor).toEqual({ nose: 300, leftSide: 250, rightSide: 250, aft: 200 });
  });

  it("collects mounts per arc, stripping the '(B)' bay marker", () => {
    expect(u.mounts.filter((m) => m.facing === "nose").map((m) => m.name)).toEqual(["LRM 20", "LRM 20"]);
    expect(u.mounts.filter((m) => m.facing === "hull")).toHaveLength(2); // ammo
  });

  it("parses transport bays, skipping crew quarters", () => {
    expect(u.bays).toEqual([
      { label: "'Mech", size: 4 },
      { label: "Fighter", size: 2 },
      { label: "Cargo", size: 1800, tons: true },
    ]);
  });

  it("rejects a non-Dropship BLK", () => {
    expect(() => parseBlkDropship("<UnitType>\nTank\n</UnitType>\n<Name>\nX\n</Name>\n", "x.blk")).toThrowError(
      ParseError,
    );
  });
});

describe("convertDropship (aerospace rules)", () => {
  const c = convertDropship(parseBlkDropship(load("Test Dropship DS-1.blk"), "DS-1.blk"));

  it("converts armor at TW/4, SI at TW/3, sinks at dissipation/5", () => {
    expect(c.armor).toEqual({ nose: 75, leftSide: 63, rightSide: 63, aft: 50 }); // /4 round nearest
    expect(c.structure).toBe(4); // SI 12 / 3
    expect(c.sinks).toBe(16); // 40 doubles -> 80 -> /5
  });

  it("computes DThr = (nose + aft + one side)/30 and single TMM", () => {
    expect(c.dthr).toBe(25); // (300 + 200 + 250) / 30 = 25
    expect(c.tmm).toBe(2); // max 6 -> base 1 -> higher value 2
    expect(c.move).toBe("4 / 6");
  });

  it("groups nose LRM-20s into one TIC and routes hull ammo to equipment", () => {
    const nose = c.weapons.filter((w) => w.facing === "NO");
    expect(nose).toHaveLength(1);
    expect(nose[0]!.label).toMatch(/x2.*LRM/i);
    const ammo = c.equipment.find((e) => e.category === "ammo");
    expect(ammo?.facing).toBe("HL");
    expect(ammo?.count).toBe(2);
  });
});

describe("convertAny dispatch (dropship)", () => {
  it("routes a BLK Dropship to the dropship path", () => {
    const r = convertAny(load("Test Dropship DS-1.blk"), "DS-1.blk");
    expect(r.kind).toBe("dropship");
    if (r.kind === "dropship") expect(r.card.name).toBe("Test Dropship DS-1");
  });
});
