/**
 * Conventional Infantry card renderer — PURE string builder (no DOM, no CSS
 * import), in the Override record-card style shared with the 'Mech card.
 *
 * Shows the platoon's facts (troopers, movement, anti-'Mech, primary/secondary
 * armament), the small-arms range brackets, a "bodies remaining" damage track
 * (cross off a trooper as it dies, read the degraded cluster damage) and a
 * FIELD GUNS table (towed standard weapons, real stats).
 */

import type { InfantryCard, RangeBrackets } from "../core/index.js";

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

/** Format a cluster-damage array as "2 · 2 · 1" (or "—" when empty). */
function dmg(clusters: number[]): string {
  return clusters.length ? clusters.join(" · ") : "—";
}

/**
 * Small-arms range row, in the DFA infantry-card style: the weapon name over a
 * PB/S/M/L to-hit row (infantry have no Extreme bracket). Returns "" when the
 * primary weapon's range is unscored.
 */
function rangeTable(card: InfantryCard): string {
  if (!card.range) return "";
  const r = card.range;
  const cells = [r.pb, r.s, r.m, r.l].map((v) => `<td class="num rng">${esc(bracket(v))}</td>`).join("");
  return `<table class="mweapons">
    <thead><tr>
      <th class="wname">${esc(card.primaryWeapon || "Small Arms")}</th>
      <th class="num">PB</th><th class="num">S</th><th class="num">M</th><th class="num">L</th>
    </tr></thead>
    <tbody><tr><td class="wname">To-hit by range</td>${cells}</tr></tbody>
  </table>`;
}

/**
 * "Bodies remaining" damage track: one pip per trooper (full strength on the
 * left), with a degradation legend mapping surviving-trooper bands to cluster
 * damage. Cross off a pip as a trooper dies and read the new damage off the
 * legend. Returns "" when the platoon's small arms are unscored.
 */
function bodiesTrack(card: InfantryCard): string {
  if (!card.damageByTroopers.length) return "";
  const pips = card.damageByTroopers
    .map((_, i) => `<span class="ms-body" title="${esc(i + 1)} left: ${esc(dmg(card.damageByTroopers[i]!))}"></span>`)
    .join("");
  const legend = card.damageBreaks
    .map((b) => {
      const band = b.from === b.to ? `${b.from}` : `${b.from}–${b.to}`;
      return `<tr><td class="num">${esc(band)}</td><td class="wdmg">${esc(dmg(b.damage))}</td></tr>`;
    })
    .join("");
  return `<div class="ms-bodies">
    <div class="ms-bodies-h">BODIES REMAINING</div>
    <div class="ms-body-row">${pips}</div>
    <table class="ms-degrade">
      <thead><tr><th class="num">Troopers</th><th>Damage</th></tr></thead>
      <tbody>${legend}</tbody>
    </table>
  </div>`;
}

/** Field-gun weapons table (no Loc column — field guns aren't located). */
function fieldGunsTable(card: InfantryCard): string {
  if (card.fieldGuns.length === 0) return "";
  const rows = card.fieldGuns
    .map((w) => {
      const flag = w.unknown ? ' <span class="warn-flag">[?]</span>' : "";
      return `<tr>
        <td class="wname">${esc(w.label)}${flag}</td>
        <td class="num wdmg">${esc(w.damageText)}</td>
        <td class="num">${esc(w.heat)}</td>
        ${rangeCells(w.range)}
      </tr>`;
    })
    .join("");
  return `<table class="mweapons">
    <thead><tr>
      <th class="wname">Field Guns</th><th class="num">Dmg</th><th class="num">Ht</th>
      <th class="num">PB</th><th class="num">S</th><th class="num">M</th><th class="num">L</th><th class="num">X</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/**
 * Render a conventional infantry platoon as an HTML string in the Override
 * record-card layout: title, UNIT DATA (type / troopers / move / anti-'Mech),
 * armament, the field-guns table, the OVERRIDE wordmark + skill boxes.
 */
export function renderInfantryCard(card: InfantryCard): string {
  const warnings = card.warnings.length
    ? `<ul class="warnings">${card.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`
    : "";
  const secondary = card.secondaryWeapon
    ? `<div><b>Secondary:</b> ${esc(card.secondaryWeapon)}${card.secondaryCount ? ` ×${esc(card.secondaryCount)}` : ""}</div>`
    : "";
  return `<article class="card mech-sheet">
    <div class="ms-grid">
      <div class="ms-left">
        <div class="ms-title">${esc(card.name)}</div>
        <div class="ms-unitdata">
          <div class="ms-ud-h">UNIT DATA</div>
          <div class="ms-ud-stats">
            <div><b>Type:</b> Infantry (${esc(card.motionLabel)})</div>
            <div><b>Troopers:</b> ${esc(card.troopers)}</div>
            <div class="ms-ud-move"><b>Move:</b> ${esc(card.move)}</div>
            <div><b>TMM:</b> ${esc(card.tmm)}</div>
            <div><b>Anti-’Mech:</b> ${card.antiMek ? "Yes" : "No"}</div>
            ${card.damage.length ? `<div><b>Damage:</b> ${dmg(card.damage)}</div>` : ""}
          </div>
        </div>
        <div class="ms-armament">
          <div><b>Primary:</b> ${esc(card.primaryWeapon || "—")}</div>
          ${secondary}
        </div>
        ${rangeTable(card)}
        ${bodiesTrack(card)}
        ${fieldGunsTable(card)}
        ${
          card.damage.length
            ? ""
            : `<p class="ba-note">Small-arms damage/range pending per-trooper values for this weapon.
                Movement / TMM mirror the ’Mech rules (best-effort).</p>`
        }
        ${warnings}
      </div>
      <div class="ms-right">
        <div class="ms-brand">
          <div class="ms-skills">
            <div class="ms-skill"><span>Gunnery</span><div class="ms-skill-box"></div></div>
            <div class="ms-skill"><span>Anti-’Mech</span><div class="ms-skill-box"></div></div>
          </div>
          <div class="ms-wordmark">B<span class="ms-wm-a">▲</span>TTLETECH<br><b>OVERRIDE</b></div>
        </div>
      </div>
    </div>
  </article>`;
}
