import { describe, expect, it } from "vitest";

import { convertUnit, isLegalTic, parseMtf } from "../src/core/index.js";
import {
  applyMove,
  groupingFromTics,
  renderTicEditorHtml,
  ticsFromGrouping,
} from "../src/web/tic-editor.js";

// Two Medium Lasers in the torso (auto-group into one TIC) + one in an arm.
const MTF = `chassis:Test
model:TIC-1
Config:Biped
techbase:Inner Sphere
mass:50
engine:200 Fusion Engine
heat sinks:10 Single
walk mp:4
armor:Standard
CT armor:10
HD armor:9
Weapons:3
Medium Laser, Center Torso
Medium Laser, Center Torso
Medium Laser, Left Arm
`;

const card = () => convertUnit(parseMtf(MTF, "TIC-1.mtf"));

describe("TIC editor (pure grouping logic)", () => {
  it("derives the grouping from the auto-grouped TICs", () => {
    const c = card();
    // Auto: [torso ML x2], [arm ML]. Weapons are indices 0,1 (torso) and 2 (arm).
    expect(groupingFromTics(c)).toEqual([[0, 1], [2]]);
    expect(c.tics.map((t) => t.damageText)).toEqual(["4", "2"]); // 2xML = ceil(10/3); 1xML = 2
  });

  it("splits a weapon out of its TIC, halving the combined damage", () => {
    const c = card();
    const g = applyMove(groupingFromTics(c), 1, "new"); // pull torso ML #1 into its own TIC
    expect(g).toEqual([[0], [2], [1]]);
    expect(ticsFromGrouping(c, g).map((t) => t.damageText)).toEqual(["2", "2", "2"]);
  });

  it("merges two solo TICs back into one (same location)", () => {
    const c = card();
    const split = applyMove(groupingFromTics(c), 1, "new"); // [[0],[2],[1]]
    const merged = applyMove(split, 1, 0); // move ML #1 back into group 0
    expect(merged).toEqual([[0, 1], [2]]);
    expect(ticsFromGrouping(c, merged)[0]!.damageText).toBe("4");
  });

  it("refuses to merge weapons from different locations (core legality)", () => {
    const c = card();
    expect(isLegalTic([c.weapons[0]!, c.weapons[1]!])).toBe(true); // both torso
    expect(isLegalTic([c.weapons[0]!, c.weapons[2]!])).toBe(false); // torso + arm
  });

  it("renders a panel listing each TIC with a stable reset control", () => {
    const c = card();
    const html = renderTicEditorHtml(c, groupingFromTics(c));
    expect(html).toContain('id="tic-editor"');
    expect(html).toContain('id="tic-reset"');
    expect(html).toContain("TIC 1");
    expect(html).toContain("TIC 2");
  });
});
