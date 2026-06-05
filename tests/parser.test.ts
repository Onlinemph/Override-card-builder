import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseMtf, ParseError } from "../src/core/index.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const load = (name: string) => readFileSync(join(FIXTURES, name), "utf8");

describe("parseMtf", () => {
  it("parses the Locust LCT-1V, normalizing rear-armor variants and deriving run MP + structure", () => {
    const u = parseMtf(load("Locust LCT-1V.mtf"), "Locust LCT-1V.mtf");

    expect(u.chassis).toBe("Locust");
    expect(u.model).toBe("LCT-1V");
    expect(u.mass).toBe(20);
    expect(u.techBase).toBe("IS");
    expect(u.engine).toEqual({ rating: 160, type: "Fusion" });
    expect(u.heatSinks).toEqual({ count: 10, type: "single" });

    // Run MP not in file -> ceil(8 * 1.5) = 12, flagged derived.
    expect(u.movement).toEqual({ walkMP: 8, runMP: 12, jumpMP: 0, runDerived: true });

    // RTL/RTR/RTC rear variants normalize to LTR/RTR/CTR.
    expect(u.armor.LTR).toBe(2);
    expect(u.armor.RTR).toBe(2);
    expect(u.armor.CTR).toBe(2);
    expect(u.armor.CT).toBe(10);

    // Internal structure is derived from the 20-ton table, not the file.
    expect(u.structure.CT).toBe(6);

    expect(u.weapons).toHaveLength(3);
    expect(u.weapons[0]).toMatchObject({ name: "Medium Laser", location: "CT" });
  });

  it("parses the Hunchback HBK-4G with LTR/RTR/CTR rear lines", () => {
    const u = parseMtf(load("Hunchback HBK-4G.mtf"), "Hunchback HBK-4G.mtf");
    expect(u.mass).toBe(50);
    expect(u.movement.runMP).toBe(6);
    expect(u.structure.CT).toBe(16);
    expect(u.armor.CTR).toBe(6);
    expect(u.weapons.map((w) => w.name)).toEqual([
      "AC/20",
      "Medium Laser",
      "Medium Laser",
      "Small Laser",
    ]);
  });

  it("parses the Atlas AS7-D and flags rear-mounted weapons", () => {
    const u = parseMtf(load("Atlas AS7-D.mtf"), "Atlas AS7-D.mtf");
    expect(u.mass).toBe(100);
    expect(u.movement.runMP).toBe(5); // ceil(3 * 1.5) = 5
    expect(u.structure.CT).toBe(31);
    expect(u.weapons).toHaveLength(7);
    const rear = u.weapons.filter((w) => w.rearMounted);
    expect(rear).toHaveLength(2);
    expect(rear.every((w) => w.name === "Medium Laser" && w.location === "CT")).toBe(true);
  });

  it("parses weapon lines with extra fields (ammo/facing/trailing commas) from real exports", () => {
    const mtf = `chassis:Test
model:TST-1
Config:Biped
techbase:Inner Sphere
mass:55
engine:275 Fusion Engine
heat sinks:10 Single
walk mp:5
armor:Standard
CT armor:10
LT armor:8
RT armor:8
LA armor:6
RA armor:6
LL armor:8
RL armor:8
HD armor:9
Weapons:3
Medium Laser, Left Arm, ,
SRM 6, Left Torso, 2
Medium Laser, Center Torso (R)
`;
    const u = parseMtf(mtf, "real.mtf");
    // Location is the SECOND field; trailing fields ignored; rear flag honored.
    expect(u.weapons.map((w) => [w.name, w.location, w.rearMounted])).toEqual([
      ["Medium Laser", "LA", false],
      ["SRM 6", "LT", false],
      ["Medium Laser", "CT", true],
    ]);
  });

  it("parses per-location crit-slot blocks (ammo, CASE, electronics), skipping -Empty-", () => {
    const u = parseMtf(load("Atlas AS7-D (crits).mtf"), "Atlas AS7-D (crits).mtf");
    const slots = u.critSlots ?? [];
    // Ammo bins land in the right locations.
    expect(slots.filter((s) => s.name === "IS Ammo AC/20" && s.location === "RT")).toHaveLength(2);
    expect(slots.filter((s) => s.name === "IS Ammo LRM-20" && s.location === "LT")).toHaveLength(2);
    expect(slots.some((s) => s.name === "ISCASE" && s.location === "LT")).toBe(true);
    expect(slots.some((s) => s.name === "ISGuardianECM" && s.location === "LT")).toBe(true);
    // -Empty- and headers are not slots.
    expect(slots.some((s) => /empty/i.test(s.name))).toBe(false);
  });

  it("fails loudly, naming the file and field, on a missing required field", () => {
    const bad = "chassis:Foo\nmodel:Bar\nTechBase:Inner Sphere\nWalk MP:4\n";
    expect(() => parseMtf(bad, "broken.mtf")).toThrowError(ParseError);
    try {
      parseMtf(bad, "broken.mtf");
    } catch (e) {
      const err = e as ParseError;
      expect(err.file).toBe("broken.mtf");
      expect(err.field).toBe("mass");
      expect(err.message).toContain("broken.mtf");
    }
  });
});
