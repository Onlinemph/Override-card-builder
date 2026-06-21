import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { convertUnit, parseMtf } from "../src/core/index.js";
import { bipedDoll, isBipedDoll, isQuadDoll, quadDoll } from "../src/web/biped-doll.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const load = (f: string) => parseMtf(readFileSync(join(FIXTURES, f), "utf8"), f);

describe("biped/tripod silhouette doll", () => {
  const biped = convertUnit(load("Locust LCT-1V.mtf"));
  const tripod = convertUnit(load("Test Tripod TR-1.mtf"));
  const quad = convertUnit(load("Test Quad QD-1.mtf"));

  it("uses the silhouette for bipeds and tripods, the grid for quads", () => {
    expect(isBipedDoll(biped)).toBe(true);
    expect(isBipedDoll(tripod)).toBe(true);
    expect(isBipedDoll(quad)).toBe(false);
  });

  it("omits the center leg for bipeds", () => {
    const svg = bipedDoll(biped);
    expect(svg).not.toContain('class="mloc cl"');
    expect(svg).not.toContain('data-area="cl"');
    expect(svg).not.toContain("roll 1d6");
  });

  it("adds a center-leg location, dropdown, and tripod note for tripods", () => {
    const svg = bipedDoll(tripod);
    expect(svg).toContain('class="mloc cl"');
    expect(svg).toContain('data-area="cl"');
    expect(svg).toContain("C LEG");
    expect(svg).toContain("d6 3-4"); // center-leg hit sub-roll
    expect(svg).toContain("d6 1-2"); // left leg relabeled
    expect(svg).toContain("d6 5-6"); // right leg relabeled
    expect(svg).toContain("roll 1d6"); // tripod leg-location note
  });

  it("detects quads/quadvees for the four-leg doll", () => {
    expect(isQuadDoll(quad)).toBe(true);
    expect(isQuadDoll(biped)).toBe(false);
    expect(isBipedDoll(quad)).toBe(false);
  });

  it("renders four legs with front/rear labels and all area codes", () => {
    const svg = quadDoll(quad);
    for (const area of ["hd", "la", "ra", "ct", "ll", "rl", "tr"]) {
      expect(svg).toContain(`class="mloc ${area}"`);
      expect(svg).toContain(`data-area="${area}"`);
    }
    expect(svg).toContain("L FRONT");
    expect(svg).toContain("R FRONT");
    expect(svg).toContain("L REAR");
    expect(svg).toContain("R REAR");
    expect(svg).not.toContain("ARM"); // quads have no arms
    expect(svg).toContain("front legs take arm hits");
  });
});
