/**
 * Conventional Infantry card renderer — PURE string builder (no DOM, no CSS
 * import), in the Override record-card style shared with the 'Mech card.
 *
 * Shows the platoon's facts (troopers, movement, anti-'Mech, primary/secondary
 * armament) and a FIELD GUNS table (towed standard weapons, real stats). The
 * small-arms platoon damage is not yet computed — it needs the TW infantry
 * weapon table / a DFA infantry card — so a note flags that.
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
            ${card.damage.length ? `<div><b>Damage:</b> ${card.damage.join(" · ")}</div>` : ""}
          </div>
        </div>
        <div class="ms-armament">
          <div><b>Primary:</b> ${esc(card.primaryWeapon || "—")}</div>
          ${secondary}
        </div>
        ${fieldGunsTable(card)}
        ${
          card.damage.length
            ? ""
            : `<p class="ba-note">Small-arms platoon damage pending per-trooper values for this weapon.
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
