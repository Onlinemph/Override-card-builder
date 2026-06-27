/**
 * BattleMech card renderer — PURE string builder (no DOM, no CSS import),
 * mirroring the printed BattleTech: Override 'Mech record card. Styled by the
 * `.mech-sheet` rules in style.css. Reused by the browser UI (main.ts) and the
 * offline preview script.
 *
 * The card DISPLAYS the auto-grouped TICs as a flat weapons table (label / Dmg
 * / Ht / Loc / PB S M L X) — there is no interactive TIC editing on the card.
 */

import { abbreviatedTicLabel, ticHeat } from "../core/index.js";
import type { OverrideCard, RangeBrackets, Tic } from "../core/index.js";
import { armorShape, armorTypeLabel, bipedDoll, isBipedDoll, isQuadDoll, quadDoll } from "./biped-doll.js";
import type { ArmorShape } from "./biped-doll.js";

/** Escape text for safe insertion into HTML. */
function esc(s: string | number): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** Format one Override range bracket: null -> "–", else a signed integer. */
function bracket(v: number | null | undefined): string {
  if (v === null || v === undefined) return "–";
  return v >= 0 ? `+${v}` : `${v}`;
}

/** The five range cells PB/S/M/L/X for a weapon row. */
function rangeCells(r: RangeBrackets | null): string {
  const vals = r ? [r.pb, r.s, r.m, r.l, r.x] : [null, null, null, null, null];
  return vals.map((v) => `<td class="num rng">${esc(bracket(v))}</td>`).join("");
}

/** Short location code for the weapons table (torsos collapse to "T"). */
const LOC_CODES: Record<string, string> = {
  CT: "T", LT: "T", RT: "T", LA: "LA", RA: "RA", LL: "LL", RL: "RL", HD: "H",
  CTR: "T", LTR: "T", RTR: "T",
};
function locCode(loc: Tic["location"], rear: boolean): string {
  const base = LOC_CODES[loc] ?? loc;
  return rear ? `${base}(R)` : base;
}

/** A row of hex pips of a given class. Armor pips take the armor-type shape. */
function hexPips(n: number, cls: string, shape: ArmorShape = "default"): string {
  if (n <= 0) return "";
  const c = cls === "armor" && shape !== "default" ? `${cls} as-${shape}` : cls;
  return `<span class="hexrow">${`<i class="hex ${c}"></i>`.repeat(n)}</span>`;
}

/** One paper-doll location box: label + hit numbers, armor hexes over structure hexes. */
function dollLoc(
  area: string,
  label: string,
  hits: string,
  armor: number,
  structure: number,
  shape: ArmorShape = "default",
): string {
  const hitTxt = hits ? ` <span class="loc-hits">(${esc(hits)})</span>` : "";
  return `<div class="mloc ${area}">
    <div class="mloc-name">${esc(label)}${hitTxt}</div>
    <div class="mloc-pips">${hexPips(armor, "armor", shape)}${hexPips(structure, "struct")}</div>
  </div>`;
}

/** The full paper doll: humanoid silhouette with per-location armor/structure hexes. */
function paperDoll(card: OverrideCard): string {
  const a = card.armor;
  const s = card.structure;
  const sh = armorShape(card.armorType);
  const hasCenterLeg = a.centerLeg !== undefined || s.centerLeg !== undefined;
  // Tripods keep the standard 2d6 hit table; a leg result (5 or 9) is followed
  // by a d6 to pick the leg: 1-2 left, 3-4 center, 5-6 right. So the three leg
  // boxes show that d6 sub-roll instead of the plain biped 5 / 9.
  const llHits = hasCenterLeg ? "d6 1-2" : "9";
  const rlHits = hasCenterLeg ? "d6 5-6" : "5";
  const centerLeg = hasCenterLeg
    ? dollLoc("cl", "Center Leg", "d6 3-4", a.centerLeg ?? 0, s.centerLeg ?? 0, sh)
    : "";
  const tripodNote = hasCenterLeg
    ? `<p class="mdoll-legend">Legs: on a leg hit (2d6 = 5 or 9), roll 1d6 — 1-2 left, 3-4 center, 5-6 right.</p>`
    : "";
  return `<div class="mdoll${hasCenterLeg ? " has-cl" : ""}">
    ${dollLoc("hd", "Head", "12", a.head, s.head, sh)}
    ${dollLoc("la", "Left Arm", "10,11", a.leftArm, s.leftArm, sh)}
    ${dollLoc("ct", "Torso", "6,7,8", a.torso, s.torso, sh)}
    ${dollLoc("ra", "Right Arm", "3,4", a.rightArm, s.rightArm, sh)}
    ${dollLoc("ll", "Left Leg", llHits, a.leftLeg, s.leftLeg, sh)}
    ${dollLoc("rl", "Right Leg", rlHits, a.rightLeg, s.rightLeg, sh)}
    ${centerLeg}
    ${dollLoc("tr", "Torso Rear", "", a.rear, 0, sh)}
  </div>
  <p class="mdoll-legend"><i class="hex armor${sh !== "default" ? ` as-${sh}` : ""}"></i> ${esc(armorTypeLabel(card.armorType))} armor &nbsp; <i class="hex struct"></i> structure</p>
  ${tripodNote}`;
}

/** Static heat-scale strip (fixed thresholds/effects, same on every card). */
const HEAT_SCALE = [
  { n: 5, cls: "h5", txt: "Automatic Shutdown" },
  { n: 4, cls: "h4", txt: "Ammo Explosion (avoid 8+)" },
  { n: 3, cls: "h3", txt: "Shutdown (avoid 8+)" },
  { n: 2, cls: "h2", txt: "+1 Ranged Attack Mod" },
  { n: 1, cls: "h1", txt: "-2 Ground Move / -1 TMM" },
  { n: 0, cls: "h0", txt: "No Effects" },
];

function heatScale(): string {
  const rows = HEAT_SCALE.map(
    (r) => `<div class="hs-row"><span class="hs-n ${r.cls}">${r.n}</span><span class="hs-t">${esc(r.txt)}</span></div>`,
  ).join("");
  return `<div class="heatscale"><div class="hs-label">Heat Scale</div><div class="hs-rows">${rows}</div></div>`;
}

/** The weapons table: one row per TIC, plus the auto Punch/Kick row. */
function weaponsTable(card: OverrideCard): string {
  const rows = card.tics
    .map((t) => {
      const flag = t.weapons.some((w) => w.unknown) ? ' <span class="warn-flag">[?]</span>' : "";
      const heat = t.heatOverride ?? ticHeat(t); // quirk-adjusted heat (e.g. cooling jackets) when set
      const heatCls = t.heatOverride != null ? "num q-mod" : "num";
      return `<tr>
        <td class="wname">${esc(abbreviatedTicLabel(t, card.techBase))}${t.tc ? ' <span class="tc-flag">(TC)</span>' : ""}${flag}</td>
        <td class="num wdmg">${esc(t.damageText)}</td>
        <td class="${heatCls}">${esc(heat)}</td>
        <td class="loc">${esc(locCode(t.location, t.rearMounted))}</td>
        ${rangeCells(t.range)}
      </tr>`;
    })
    .join("");
  // Punch / Kick: point-blank only (PB shows the melee mod, here +0).
  const melee = `<tr class="melee">
    <td class="wname">Punch / Kick</td>
    <td class="num wdmg">${esc(card.melee.punch)} / ${esc(card.melee.kick)}</td>
    <td class="num">–</td><td class="loc">–</td>
    <td class="num rng">+0</td><td class="num rng">–</td><td class="num rng">–</td>
    <td class="num rng">–</td><td class="num rng">–</td>
  </tr>`;
  return `<table class="mweapons">
    <thead><tr>
      <th class="wname">Weapons</th><th class="num">Dmg</th><th class="num">Ht</th>
      <th class="loc">Loc</th><th class="num">PB</th><th class="num">S</th>
      <th class="num">M</th><th class="num">L</th><th class="num">X</th>
    </tr></thead>
    <tbody>${rows}${melee}</tbody>
  </table>`;
}

/** Inline equipment summary (or "—" when none). */
function equipmentLine(card: OverrideCard): string {
  if (card.equipment.length === 0) return "—";
  return card.equipment
    .map((e) => {
      const qty = e.count > 1 ? ` ×${e.count}` : "";
      const loc = e.global ? "" : ` <span class="eq-loc">(${esc(locCode(e.location, false))})</span>`;
      return `${esc(e.label)}${qty}${loc}`;
    })
    .join(", ");
}

/** Static pilot/condition monitor row (engine / gyro / consciousness track). */
function conditionMonitor(): string {
  const box = '<span class="cm-box"></span>';
  const track = ["3+", "5+", "7+", "9+", "11+"]
    .map((t) => `<span class="cm-pip">${t}</span>`)
    .join("");
  return `<div class="condmon">
    <span class="cm-grp">Engine ${box}${box}</span>
    <span class="cm-grp">Gyro ${box}${box}</span>
    <span class="cm-grp">Condition ${track}<span class="cm-pip kia">KIA</span></span>
  </div>`;
}

/**
 * Render a BattleMech as an HTML string in the Override record-card layout: a
 * title banner, a UNIT DATA panel with the heat scale, the weapons table (TICs
 * displayed as rows) + Punch/Kick, equipment, the OVERRIDE wordmark with skill
 * boxes, a condition monitor, and the paper-doll armor/structure diagram.
 */
export function renderMechCard(card: OverrideCard): string {
  const warnings = card.warnings.length
    ? `<ul class="warnings">${card.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`
    : "";
  const type = /omni/i.test(card.config) ? "OmniMech" : "BattleMech";
  return `<article class="card mech-sheet">
    <div class="ms-grid">
      <div class="ms-left">
        <div class="ms-title">${esc(card.name)}</div>
        <div class="ms-unitdata">
          <div class="ms-ud-h">UNIT DATA</div>
          <div class="ms-ud-cols">
            <div class="ms-ud-stats">
              <div><b>Type:</b> ${type}</div>
              <div><b>Mass:</b> ${esc(card.mass)} Tons</div>
              <div class="ms-ud-move"><b>Move:</b> ${esc(card.walkMove)} / ${esc(card.runMove)}${card.jump > 0 ? ` &nbsp;<b>Jump:</b> ${esc(card.jump)}` : ""} <b>Sinks:</b> ${esc(card.heatDissipation)}</div>
              <div><b>TMM:</b> ${esc(card.tmm)} / ${esc(card.tmmSprint)}${card.jump > 0 ? ` <span class="muted">(jump ${esc(card.tmmJump)})</span>` : ""}</div>
              <div><b>Armor:</b> ${esc(armorTypeLabel(card.armorType))}</div>
            </div>
            ${heatScale()}
          </div>
        </div>
        ${weaponsTable(card)}
        <p class="ms-equip"><b>Equipment:</b> ${equipmentLine(card)}</p>
        ${conditionMonitor()}
        ${warnings}
      </div>
      <div class="ms-right">
        <div class="ms-brand">
          <div class="ms-skills">
            <div class="ms-skill"><span>Gunnery</span><div class="ms-skill-box"></div></div>
            <div class="ms-skill"><span>Piloting</span><div class="ms-skill-box"></div></div>
          </div>
          <div class="ms-wordmark">B<span class="ms-wm-a">▲</span>TTLETECH<br><b>OVERRIDE</b></div>
        </div>
        ${isBipedDoll(card) ? bipedDoll(card) : isQuadDoll(card) ? quadDoll(card) : paperDoll(card)}
      </div>
    </div>
  </article>`;
}
