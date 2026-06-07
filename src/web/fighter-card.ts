/**
 * Aerospace / Conventional Fighter card renderer — PURE string builder (no DOM,
 * no CSS import), in the Override record-card style shared with the 'Mech and
 * vehicle cards. Styled by the `.mech-sheet` / `.fdoll` rules in style.css.
 *
 * Armor is shown by FACING (nose / wings / aft) with armor (purple) over
 * structure (red) hexes; movement is thrust (safe / max); the weapons table's
 * Loc column holds the firing facing. Hit numbers use the Override fighter table
 * (Nose 6-8, R-Wing 3-5, L-Wing 9-11, Aft 2 & 12).
 */

import type { FighterCard, RangeBrackets } from "../core/index.js";

function esc(s: string | number): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

function bracket(v: number | null | undefined): string {
  if (v === null || v === undefined) return "–";
  return v >= 0 ? `+${v}` : `${v}`;
}

function rangeCells(r: RangeBrackets | null): string {
  const vals = r ? [r.pb, r.s, r.m, r.l, r.x] : [null, null, null, null, null];
  return vals.map((v) => `<td class="num rng">${esc(bracket(v))}</td>`).join("");
}

/** A row of hex pips of a given class (armor = purple, struct = red). */
function hexPips(n: number, cls: string): string {
  if (n <= 0) return "";
  return `<span class="hexrow">${`<i class="hex ${cls}"></i>`.repeat(n)}</span>`;
}

/** One facing box: label + hit numbers, armor hexes (fighters track SI globally). */
function facingBox(area: string, label: string, hits: string, armor: number): string {
  const hitTxt = hits ? ` <span class="loc-hits">(${esc(hits)})</span>` : "";
  return `<div class="vloc ${area}">
    <div class="vloc-name">${esc(label)}${hitTxt}</div>
    <div class="vloc-pips">${hexPips(armor, "armor")}</div>
  </div>`;
}

/**
 * Facing armor diagram: Nose on top, wings flanking the center, Aft at bottom.
 * Unlike 'Mechs/vehicles, a fighter has a SINGLE Structural Integrity track (not
 * per-location), shown once below the armor facings.
 */
function armorDiagram(card: FighterCard): string {
  const a = card.armor;
  return `<div class="fdoll">
    ${facingBox("fnose", "Nose", "6,7,8", a.nose)}
    ${facingBox("flwing", "Left Wing", "9,10,11", a.leftWing)}
    ${facingBox("frwing", "Right Wing", "3,4,5", a.rightWing)}
    ${facingBox("faft", "Aft", "2,12", a.aft)}
  </div>
  <div class="fsi">
    <span class="fsi-label">Structural Integrity</span>
    <span class="fsi-pips">${hexPips(card.structure, "struct")}</span>
    <span class="fsi-val">${esc(card.structure)}</span>
  </div>
  <p class="mdoll-legend"><i class="hex armor"></i> armor &nbsp; <i class="hex struct"></i> SI (airframe-wide)</p>`;
}

/** The weapons table: one row per facing TIC. */
function weaponsTable(card: FighterCard): string {
  if (card.weapons.length === 0) {
    return `<p class="muted">No weapons.</p>`;
  }
  const rows = card.weapons
    .map((w) => {
      const flag = w.unknown ? ' <span class="warn-flag">[?]</span>' : "";
      return `<tr>
        <td class="wname">${esc(w.label)}${flag}</td>
        <td class="num wdmg">${esc(w.damageText)}</td>
        <td class="num">${esc(w.heat)}</td>
        <td class="loc">${esc(w.facing)}</td>
        ${rangeCells(w.range)}
      </tr>`;
    })
    .join("");
  return `<table class="mweapons">
    <thead><tr>
      <th class="wname">Weapons</th><th class="num">Dmg</th><th class="num">Ht</th>
      <th class="loc">Loc</th><th class="num">PB</th><th class="num">S</th>
      <th class="num">M</th><th class="num">L</th><th class="num">X</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function equipmentLine(card: FighterCard): string {
  if (card.equipment.length === 0) return "—";
  return card.equipment
    .map((e) => `${esc(e.label)}${e.count > 1 ? ` ×${e.count}` : ""} <span class="eq-loc">(${esc(e.facing)})</span>`)
    .join(", ");
}

/**
 * Render an aerospace/conventional fighter as an HTML string in the Override
 * record-card layout: title banner, UNIT DATA (type / mass / thrust / TMM), the
 * per-facing weapons table, equipment, the OVERRIDE wordmark + skill boxes, and
 * the facing armor diagram (armor over structure hexes).
 */
export function renderFighterCard(card: FighterCard): string {
  const warnings = card.warnings.length
    ? `<ul class="warnings">${card.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`
    : "";
  const type = card.conventional ? "Conventional Fighter" : "Aerospace Fighter";
  return `<article class="card mech-sheet">
    <div class="ms-grid">
      <div class="ms-left">
        <div class="ms-title">${esc(card.name)}</div>
        <div class="ms-unitdata">
          <div class="ms-ud-h">UNIT DATA</div>
          <div class="ms-ud-stats">
            <div><b>Type:</b> ${type}</div>
            <div><b>Mass:</b> ${esc(card.tonnage)} Tons</div>
            <div class="ms-ud-move"><b>Thrust:</b> ${esc(card.move)}</div>
            <div><b>TMM:</b> ${esc(card.tmm)} / ${esc(card.tmm + 1)}</div>
          </div>
        </div>
        ${weaponsTable(card)}
        <p class="ms-equip"><b>Equipment:</b> ${equipmentLine(card)}</p>
        <p class="ba-note">Armor / TMM / SI mirror the ’Mech &amp; vehicle rules (best-effort) — validate against the DFA generator.</p>
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
        ${armorDiagram(card)}
      </div>
    </div>
  </article>`;
}
