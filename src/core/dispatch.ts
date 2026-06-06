/**
 * Format dispatch: text -> the right parser + converter, returning a tagged
 * card. Keeps the 'Mech (`OverrideCard`) and Battle Armor (`BattleArmorCard`)
 * paths separate while giving callers (CLI, web) a single entry point.
 *
 * PURE module: no Node/browser/filesystem imports.
 */

import { convertBattleArmor } from "./battlearmor.js";
import { isBlk, parseBlkBattleArmor } from "./blk.js";
import { convertUnit } from "./convert.js";
import { parseMtf } from "./parser.js";
import type { BattleArmorCard, OverrideCard } from "./types.js";

/** A converted card, tagged by which unit family produced it. */
export type AnyCard =
  | { kind: "mech"; card: OverrideCard }
  | { kind: "battlearmor"; card: BattleArmorCard };

/** "blk" for MegaMek building-block files, otherwise "mtf". */
export function detectFormat(text: string): "mtf" | "blk" {
  return isBlk(text) ? "blk" : "mtf";
}

/**
 * Parse + convert any supported source (MTF 'Mech or BLK Battle Armor),
 * dispatching on the file content. Throws `ParseError` on malformed or
 * unsupported input, exactly like the underlying parsers.
 */
export function convertAny(text: string, file = "<unknown>"): AnyCard {
  if (detectFormat(text) === "blk") {
    return { kind: "battlearmor", card: convertBattleArmor(parseBlkBattleArmor(text, file)) };
  }
  return { kind: "mech", card: convertUnit(parseMtf(text, file)) };
}
