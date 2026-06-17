/**
 * Record-sheet style paper doll for BIPED and TRIPOD 'Mechs: a blocky mech
 * silhouette with armor as open circles in the UPPER segment of each location
 * and structure as squares in the LOWER segment. Pure string builder (SVG).
 *
 * The pips reuse the damage-tracker's grouping contract: each location is a
 * `<g class="mloc {area}">` holding two `<g class="hexrow">` groups (armor then
 * structure), whose children carry `bpip armor` / `bpip struct` classes. So the
 * existing applyDamageMarks (group ordinals, struct-destruction, .pip-hit) works
 * with only the click selector extended to `.bpip`.
 *
 * Tripods add a third (center) leg in the gap between the legs; the area code
 * "cl" flows through the dropdown + applyDamageMarks generically. Quads keep the
 * grid doll (mech-card's paperDoll).
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

/** A per-location damage dropdown overlaid on the doll (0..armor+structure). */
function ctl(area: string, name: string, hits: string, max: number, left: number, top: number): string {
  const opts = Array.from({ length: max + 1 }, (_, i) => `<option value="${i}">${i}</option>`).join("");
  return (
    `<label class="dmg-ctl" data-area="${area}" style="left:${left}%;top:${top}%">` +
    `<span class="dmg-name">${name}</span><span class="dmg-hits">${hits}</span>` +
    `<select aria-label="${name} damage">${opts}</select></label>`
  );
}

/** True when this card should use the silhouette doll (bipeds + tripods; quads use the grid). */
export function isBipedDoll(card: OverrideCard): boolean {
  if (/quad/i.test(card.config)) return false;
  return /biped|tripod/i.test(card.config) || card.armor.centerLeg !== undefined;
}

/** Render the biped/tripod record-sheet paper doll as an SVG string. */
export function bipedDoll(card: OverrideCard): string {
  const a = card.armor;
  const s = card.structure;
  const tripod = a.centerLeg !== undefined || s.centerLeg !== undefined;
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
    // Tripod center leg (behind, in the gap): thigh (armor) + shin (structure) + foot.
    (tripod ? rr(153, 200, 34, 64, 9, DARK) + rr(156, 266, 28, 86, 9, DARK) + rr(154, 350, 32, 18, 5, DARK) : "") +
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
    (tripod ? loc("cl", [155, 202, 30, 60], [158, 268, 24, 82], a.centerLeg ?? 0, s.centerLeg ?? 0) : "") +
    loc("tr", [144, 384, 52, 20], [0, 0, 0, 0], a.rear, 0);

  const legend =
    `<circle class="bpip armor" cx="6" cy="456" r="4.5"/><text class="bdoll-lbl" x="15" y="459" text-anchor="start">armor</text>` +
    `<rect class="bpip struct" x="62" y="451" width="9" height="9"/><text class="bdoll-lbl" x="76" y="459" text-anchor="start">structure</text>`;

  // Per-location damage dropdowns positioned over the doll (fill armor then structure).
  // Tripods: a leg hit (2d6 = 5 or 9) is followed by a d6 to pick the leg.
  const controls =
    ctl("hd", "HEAD", "12", a.head + s.head, 50, 4) +
    ctl("la", "L ARM", "10,11", a.leftArm + s.leftArm, 8, 30) +
    ctl("ra", "R ARM", "3,4", a.rightArm + s.rightArm, 92, 30) +
    ctl("ct", "TORSO", "6,7,8", a.torso + s.torso, 50, 43) +
    ctl("ll", "L LEG", tripod ? "d6 1-2" : "9", a.leftLeg + s.leftLeg, 16, 71) +
    ctl("rl", "R LEG", tripod ? "d6 5-6" : "5", a.rightLeg + s.rightLeg, 84, 71) +
    (tripod ? ctl("cl", "C LEG", "d6 3-4", (a.centerLeg ?? 0) + (s.centerLeg ?? 0), 50, 73) : "") +
    ctl("tr", "REAR", "2,12", a.rear + s.torso, 50, 91); // rear armor bleeds into torso structure

  const tripodNote = tripod
    ? `<p class="mdoll-legend">Legs: on a leg hit (2d6 = 5 or 9), roll 1d6 — 1-2 left, 3-4 center, 5-6 right.</p>`
    : "";
  return `<div class="bdoll-wrap"><svg class="bdoll" viewBox="-18 0 376 470" xmlns="http://www.w3.org/2000/svg">${seg}${dolls}${legend}</svg>${controls}</div>
  <p class="mdoll-legend">Armor (circles) over Structure (squares) · set damage per part — lower the number to heal</p>${tripodNote}`;
}
