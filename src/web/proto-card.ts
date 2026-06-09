/**
 * ProtoMech card renderer — PURE string builder (no DOM, no CSS import), in the
 * Override record-card style shared with the 'Mech card. Styled by `.mech-sheet`
 * / `.pdoll` in style.css.
 *
 * ProtoMechs have a SINGLE Legs location (no separate L/R) and an optional
 * torso-mounted Main Gun. Hit locations mirror the 'Mech table EXCEPT a roll of
 * 3 or 11 is a MISS (shown struck-through on the arm boxes). A Frenzy melee row
 * (damage by tonnage) replaces Punch/Kick.
 */

import type { ProtoMechCard, RangeBrackets } from "../core/index.js";

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

/** One paper-doll location box. `hits` is pre-escaped HTML (may contain a struck miss). */
function dollLoc(area: string, label: string, hitsHtml: string, armor: number, structure: number): string {
  const hitTxt = hitsHtml ? ` <span class="loc-hits">(${hitsHtml})</span>` : "";
  return `<div class="mloc ${area}">
    <div class="mloc-name">${esc(label)}${hitTxt}</div>
    <div class="mloc-pips">${hexPips(armor, "armor")}${hexPips(structure, "struct")}</div>
  </div>`;
}

/** Mark a 2d6 result as a miss (struck-through). */
const miss = (n: number) => `<s class="loc-miss">${n}</s>`;

/**
 * ProtoMech paper doll: Head on top (with an optional Main Gun beside it), arms
 * flanking the torso, and a SINGLE Legs block. A roll of 3 / 11 is a miss.
 */
function paperDoll(card: ProtoMechCard): string {
  const a = card.armor;
  const s = card.structure;
  const mainGun =
    card.hasMainGun
      ? dollLoc("mg", "Main Gun", "2", a.mainGun ?? 0, s.mainGun ?? 0)
      : "";
  return `<div class="pdoll${card.hasMainGun ? " has-mg" : ""}">
    ${dollLoc("hd", "Head", "12", a.head, s.head)}
    ${mainGun}
    ${dollLoc("la", "Left Arm", `10,${miss(11)}`, a.leftArm, s.leftArm)}
    ${dollLoc("ct", "Torso", "6,7,8", a.torso, s.torso)}
    ${dollLoc("ra", "Right Arm", `${miss(3)},4`, a.rightArm, s.rightArm)}
    ${dollLoc("lg", "Legs", "5,9", a.legs, s.legs)}
  </div>
  <p class="mdoll-legend"><i class="hex armor"></i> armor &nbsp; <i class="hex struct"></i> structure &nbsp; · &nbsp; <s class="loc-miss">3</s>/<s class="loc-miss">11</s> = miss</p>`;
}

/** Weapons table: one row per location TIC, plus the Frenzy melee row. */
function weaponsTable(card: ProtoMechCard): string {
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
  // Frenzy melee: point-blank only, by tonnage.
  const frenzy = `<tr class="melee">
    <td class="wname">Frenzy</td>
    <td class="num wdmg">${esc(card.frenzy)}</td>
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
    <tbody>${rows}${frenzy}</tbody>
  </table>`;
}

function equipmentLine(card: ProtoMechCard): string {
  if (card.equipment.length === 0) return "—";
  return card.equipment
    .map((e) => {
      const qty = e.count > 1 ? ` ×${e.count}` : "";
      const loc = e.facing ? ` <span class="eq-loc">(${esc(e.facing)})</span>` : "";
      return `${esc(e.label)}${qty}${loc}`;
    })
    .join(", ");
}

/**
 * Render a ProtoMech as an HTML string in the Override record-card layout: title
 * banner, UNIT DATA (type / mass / move / TMM), the weapons table (with the
 * Frenzy row), equipment, the OVERRIDE wordmark + Gunnery box, and the paper
 * doll (armor over structure hexes, single legs, optional main gun).
 */
export function renderProtoCard(card: ProtoMechCard): string {
  const warnings = card.warnings.length
    ? `<ul class="warnings">${card.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`
    : "";
  return `<article class="card mech-sheet">
    <div class="ms-grid">
      <div class="ms-left">
        <div class="ms-title">${esc(card.name)}</div>
        <div class="ms-unitdata">
          <div class="ms-ud-h">UNIT DATA</div>
          <div class="ms-ud-stats">
            <div><b>Type:</b> ProtoMech${card.motionLabel !== "Biped" ? ` (${esc(card.motionLabel)})` : ""}</div>
            <div><b>Mass:</b> ${esc(card.tonnage)} Tons</div>
            <div class="ms-ud-move"><b>Move:</b> ${esc(card.move)}</div>
            <div><b>TMM:</b> ${esc(card.tmmText)}</div>
          </div>
        </div>
        ${weaponsTable(card)}
        <p class="ms-equip"><b>Equipment:</b> ${equipmentLine(card)}</p>
        ${warnings}
      </div>
      <div class="ms-right">
        <div class="ms-brand">
          <div class="ms-skills">
            <div class="ms-skill"><span>Gunnery</span><div class="ms-skill-box"></div></div>
          </div>
          <div class="ms-wordmark">B<span class="ms-wm-a">▲</span>TTLETECH<br><b>OVERRIDE</b></div>
        </div>
        ${paperDoll(card)}
      </div>
    </div>
  </article>`;
}
