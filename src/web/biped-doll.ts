/**
 * Record-sheet style paper doll for BIPED 'Mechs: a blocky mech silhouette with
 * armor as open circles in the UPPER segment of each location and structure as
 * squares in the LOWER segment. Pure string builder (SVG).
 *
 * The pips reuse the damage-tracker's grouping contract: each location is a
 * `<g class="mloc {area}">` holding two `<g class="hexrow">` groups (armor then
 * structure), whose children carry `bpip armor` / `bpip struct` classes. So the
 * existing applyDamageMarks (group ordinals, struct-destruction, .pip-hit) works
 * with only the click selector extended to `.bpip`.
 *
 * Quads / tripods keep the grid doll (mech-card's paperDoll).
 */
import type { OverrideCard } from "../core/index.js";

const FILL = "#c7c7c0", STROKE = "#4c4c46", DARK = "#9a9a92";
const rr = (x: number, y: number, w: number, h: number, r = 5, fill = FILL): string =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${STROKE}" stroke-width="1.6"/>`;
const poly = (pts: number[][]): string =>
  `<polygon points="${pts.map((p) => p.join(",")).join(" ")}" fill="${FILL}" stroke="${STROKE}" stroke-width="1.6"/>`;

/** Lay `n` pips in a grid filling [x,y,w,h]; circles for armor, squares for structure. */
function pips(x: number, y: number, w: number, h: number, n: number, kind: "armor" | "struct"): string {
  if (n <= 0) return "";
  let r = 4, step = 0, cols = 1;
  for (let rad = 4; rad >= 1.3; rad -= 0.1) {
    const sp = rad * 2 + 1.6;
    const c = Math.max(1, Math.floor(w / sp));
    const ro = Math.max(1, Math.floor(h / sp));
    r = rad;
    step = sp;
    cols = c;
    if (c * ro >= n) break;
  }
  const usedRows = Math.ceil(n / cols);
  let out = "";
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const rowCount = Math.min(cols, n - row * cols);
    const cx = x + (w - rowCount * step) / 2 + step / 2 + col * step;
    const cy = y + step / 2 + row * step + Math.max(0, (h - usedRows * step) / 2);
    out +=
      kind === "armor"
        ? `<circle class="bpip armor" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}"/>`
        : `<rect class="bpip struct" x="${(cx - r * 0.85).toFixed(1)}" y="${(cy - r * 0.85).toFixed(1)}" width="${(r * 1.7).toFixed(1)}" height="${(r * 1.7).toFixed(1)}"/>`;
  }
  return out;
}

type Zone = [number, number, number, number];
/** One location: armor pips (upper zone) + structure pips (lower zone), grouped for the tracker. */
function loc(area: string, armorZone: Zone, structZone: Zone, armor: number, structure: number): string {
  return (
    `<g class="mloc ${area}">` +
    `<g class="hexrow">${pips(armorZone[0], armorZone[1], armorZone[2], armorZone[3], armor, "armor")}</g>` +
    `<g class="hexrow">${pips(structZone[0], structZone[1], structZone[2], structZone[3], structure, "struct")}</g>` +
    `</g>`
  );
}

const lbl = (x: number, y: number, t: string): string =>
  `<text class="bdoll-lbl" x="${x}" y="${y}">${t}</text>`;

/** True when this card should use the biped silhouette doll. */
export function isBipedDoll(card: OverrideCard): boolean {
  return /biped/i.test(card.config) && card.armor.centerLeg === undefined;
}

/** Render the biped record-sheet paper doll as an SVG string. */
export function bipedDoll(card: OverrideCard): string {
  const a = card.armor;
  const s = card.structure;
  const seg =
    // Head + visor + neck
    rr(144, 18, 52, 40, 7) +
    `<rect x="156" y="26" width="28" height="8" rx="2" fill="${DARK}"/>` +
    rr(160, 56, 20, 10, 3) +
    // Shoulders
    poly([[60, 74], [130, 60], [130, 100], [68, 110]]) +
    poly([[280, 74], [210, 60], [210, 100], [272, 110]]) +
    // Torso: chest (armor) + abdomen (structure)
    rr(130, 60, 80, 74, 8) +
    rr(140, 132, 60, 46, 7) +
    // Arms: upper (armor) + forearm (structure) + hand
    rr(62, 100, 34, 54, 8) + rr(60, 152, 34, 60, 8) + rr(60, 210, 32, 16, 4) +
    rr(244, 100, 34, 54, 8) + rr(246, 152, 34, 60, 8) + rr(248, 210, 32, 16, 4) +
    // Hips + legs: thigh (armor) + shin (structure) + foot
    rr(124, 176, 92, 22, 7) +
    rr(112, 196, 40, 70, 9) + rr(114, 264, 34, 90, 9) + rr(102, 352, 50, 20, 5) +
    rr(188, 196, 40, 70, 9) + rr(192, 264, 34, 90, 9) + rr(188, 352, 50, 20, 5) +
    // Torso-rear box
    rr(142, 382, 56, 24, 5, "#e7e7e1");

  const dolls =
    loc("hd", [148, 37, 44, 11], [148, 47, 44, 10], a.head, s.head) +
    loc("la", [63, 102, 32, 50], [61, 154, 32, 56], a.leftArm, s.leftArm) +
    loc("ra", [245, 102, 32, 50], [247, 154, 32, 56], a.rightArm, s.rightArm) +
    loc("ct", [133, 64, 74, 66], [142, 134, 56, 42], a.torso, s.torso) +
    loc("ll", [113, 198, 38, 66], [115, 266, 32, 86], a.leftLeg, s.leftLeg) +
    loc("rl", [189, 198, 38, 66], [193, 266, 32, 86], a.rightLeg, s.rightLeg) +
    loc("tr", [144, 384, 52, 20], [0, 0, 0, 0], a.rear, 0);

  const labels =
    lbl(170, 16, "HEAD (12)") +
    lbl(78, 96, "L ARM (10,11)") +
    lbl(262, 96, "R ARM (3,4)") +
    lbl(170, 198, "TORSO (6,7,8)") +
    lbl(80, 368, "L LEG (9)") +
    lbl(260, 368, "R LEG (5)") +
    lbl(170, 420, "TORSO REAR (2,12)");

  const legend =
    `<circle class="bpip armor" cx="22" cy="456" r="4"/><text class="bdoll-lbl" x="30" y="459" text-anchor="start">armor</text>` +
    `<rect class="bpip struct" x="78" y="452" width="8" height="8"/><text class="bdoll-lbl" x="90" y="459" text-anchor="start">structure</text>`;

  return `<svg class="bdoll" viewBox="0 0 340 470" xmlns="http://www.w3.org/2000/svg">${seg}${dolls}${labels}${legend}</svg>
  <p class="mdoll-legend">Armor (circles) over Structure (squares) · click pips to track damage</p>`;
}
