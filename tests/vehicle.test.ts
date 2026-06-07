import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { convertAny, convertVehicle, parseBlkVehicle, ParseError } from "../src/core/index.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const load = (name: string) => readFileSync(join(FIXTURES, name), "utf8");

describe("parseBlkVehicle", () => {
  const u = parseBlkVehicle(load("Test Tank TT-1.blk"), "Test Tank TT-1.blk");

  it("parses the tank's identity, movement, and facing armor", () => {
    expect(u.kind).toBe("vehicle");
    expect(u.chassis).toBe("Test Tank");
    expect(u.model).toBe("TT-1");
    expect(u.techBase).toBe("IS");
    expect(u.motionType).toBe("Tracked");
    expect(u.tonnage).toBe(60);
    expect(u.cruiseMP).toBe(4);
    expect(u.flankMP).toBe(6); // ceil(4 * 1.5)
    expect(u.hasTurret).toBe(true);
    // <armor> order: front, right, left, rear, turret.
    expect(u.armor).toEqual({ front: 40, right: 30, left: 30, rear: 20, turret: 35 });
  });

  it("collects mounts tagged by facing block", () => {
    expect(u.mounts).toEqual([
      { name: "LRM 10", facing: "front" },
      { name: "Machine Gun", facing: "right" },
      { name: "Machine Gun", facing: "left" },
      { name: "PPC", facing: "turret" },
      { name: "SRM 6", facing: "turret" },
      { name: "SRM 6", facing: "turret" },
      { name: "IS Ammo SRM 6", facing: "turret" },
    ]);
  });

  it("rejects a non-Tank BLK file", () => {
    expect(() => parseBlkVehicle("<UnitType>\nVTOL\n</UnitType>\n<Name>\nX\n</Name>\n", "x.blk")).toThrowError(
      ParseError,
    );
  });
});

describe("convertVehicle", () => {
  const c = convertVehicle(parseBlkVehicle(load("Test Tank TT-1.blk"), "TT-1.blk"));

  it("mirrors movement, TMM, and per-facing armor", () => {
    expect(c.move).toBe("4/6");
    expect(c.tmm).toBe(1); // flank 6 -> TMM 1
    // armor mirrors arm/leg: TW / 3, round nearest.
    expect(c.armor).toEqual({ front: 13, right: 10, left: 10, rear: 7, turret: 12 });
    expect(c.structure).toBe(6); // round(60 / 10), best-effort
  });

  it("groups identical weapons WITHIN a facing only", () => {
    const labels = c.weapons.map((w) => `${w.facing}:${w.label}`);
    // Front LRM, two side MGs (separate facings), turret PPC + grouped 2x SRM-6.
    expect(labels).toContain("Front:LRM-10");
    expect(labels).toContain("Turret:PPC");
    expect(labels).toContain("Turret:x2 SRM-6");
    // The two side machine guns are in different facings, so they never group.
    expect(c.weapons.filter((w) => /Machine Gun|MG/i.test(w.label))).toHaveLength(2);

    const srm = c.weapons.find((w) => /SRM/.test(w.label))!;
    expect(srm.damageText).toBe("2+M4 (8)"); // 2x SRM-6 scaled
    expect(srm.heat).toBe(2); // ceil(8 / 5)
  });

  it("surfaces turret ammo as equipment", () => {
    expect(c.equipment.some((e) => /SRM/.test(e.label) && e.category === "ammo")).toBe(true);
  });
});

describe("convertAny dispatch", () => {
  it("routes a BLK Tank to the vehicle path", () => {
    const r = convertAny(load("Test Tank TT-1.blk"), "TT-1.blk");
    expect(r.kind).toBe("vehicle");
    expect(r.card.name).toBe("Test Tank TT-1");
  });
});
