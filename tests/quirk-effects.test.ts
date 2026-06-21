import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { quirkEffect, WEAPON_QUIRK_LABEL } from "../src/web/quirk-effects.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("quirk effects", () => {
  it("maps every weaponquirk code to a canonical name with a defined effect", () => {
    for (const [code, label] of Object.entries(WEAPON_QUIRK_LABEL)) {
      expect(quirkEffect(label), `${code} -> "${label}" has no effect`).toBeDefined();
    }
  });

  it("distinguishes the weapon 'Stabilized Weapon' from the unit 'Stable' (the Solitaire bug)", () => {
    const stabilized = quirkEffect(WEAPON_QUIRK_LABEL.stable_weapon);
    expect(WEAPON_QUIRK_LABEL.stable_weapon).toBe("Stabilized Weapon");
    expect(stabilized?.effect).toMatch(/movement/i);
    expect(stabilized?.effect).not.toEqual(quirkEffect("Stable")?.effect);
    expect(quirkEffect("Stable")?.effect).toMatch(/PSR/i);
  });

  it("resolves location/tech/level variants via suffix stripping", () => {
    expect(quirkEffect("Battle Fists (LA)")?.sign).toBe("pos");
    expect(quirkEffect("Bad Reputation (Clan)")?.sign).toBe("none");
    expect(quirkEffect("Weak Head Armor (2)")?.sign).toBe("neg");
    // Band / variant suffixes are significant and kept distinct.
    expect(quirkEffect("Improved Targeting (Long)")?.effect).toMatch(/long/i);
    expect(quirkEffect("Improved Targeting (Short)")?.effect).toMatch(/short/i);
  });

  it("covers every quirk name that actually appears in the MUL quirk index", () => {
    const idx = JSON.parse(readFileSync(join(ROOT, "public", "quirk-index.json"), "utf8")) as Record<
      string,
      { u: string[]; w: string[] }
    >;
    const names = new Set<string>();
    for (const v of Object.values(idx)) {
      for (const n of v.u ?? []) names.add(n);
      for (const n of v.w ?? []) names.add(n);
    }
    const missing = [...names].filter((n) => !quirkEffect(n));
    expect(missing, `unmapped quirks: ${missing.join(", ")}`).toEqual([]);
  });
});
