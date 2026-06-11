/**
 * Manual TIC editor (web only, 'Mech cards).
 *
 * The card is driven by `card.tics`; this panel lets the user re-partition the
 * unit's flat `card.weapons` into custom TICs and rebuilds them with the SAME
 * pure core math (`buildTic`), so the card updates live. It never touches the
 * conversion pipeline — it only swaps which weapons share a TIC.
 *
 * Legality (same location/facing + within the page-41 caps) is delegated to the
 * core `isLegalTic`, so the editor can only offer moves the game rules allow.
 *
 * Battle Armor / infantry do not use TICs and are out of scope; ProtoMech cards
 * currently render ungrouped weapons, so they are excluded too.
 */

import { buildTic, isLegalTic } from "../core/index.js";
import type { CardWeapon, OverrideCard, Tic } from "../core/index.js";

/** A grouping: each entry is one TIC, listed as indices into `card.weapons`. */
export type Grouping = number[][];

const esc = (s: string | number): string =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Derive the editable grouping from the card's current (auto- or hand-) TICs. */
export function groupingFromTics(card: OverrideCard): Grouping {
  return card.tics.map((t) => t.weapons.map((w) => card.weapons.indexOf(w)).filter((i) => i >= 0));
}

/** Rebuild `Tic[]` from a grouping, dropping empty groups. */
export function ticsFromGrouping(card: OverrideCard, g: Grouping): Tic[] {
  return g
    .filter((grp) => grp.length > 0)
    .map((grp) => buildTic(grp.map((i) => card.weapons[i]!)));
}

/** Members of a group, as CardWeapons. */
const membersOf = (card: OverrideCard, grp: number[]): CardWeapon[] => grp.map((i) => card.weapons[i]!);

/**
 * Move weapon `wi` into target group `target` (an existing group index, or
 * "new" for a fresh solo TIC). Returns a fresh, compacted grouping. The caller
 * has already validated the move via {@link canMove}.
 */
export function applyMove(g: Grouping, wi: number, target: number | "new"): Grouping {
  const next = g.map((grp) => grp.filter((i) => i !== wi));
  if (target === "new") next.push([wi]);
  else next[target]!.push(wi);
  return next.filter((grp) => grp.length > 0);
}

/** True if weapon `wi` may join existing group `gi` (same location + legal caps). */
function canMove(card: OverrideCard, g: Grouping, wi: number, gi: number): boolean {
  if (g[gi]!.includes(wi)) return false; // already there
  return isLegalTic([...membersOf(card, g[gi]!), card.weapons[wi]!]);
}

/** Render the editor panel HTML for the card's current grouping. */
export function renderTicEditorHtml(card: OverrideCard, g: Grouping): string {
  const boxes = g
    .map((grp, gi) => {
      const tic = buildTic(membersOf(card, grp));
      const rows = grp
        .map((wi) => {
          const w = card.weapons[wi]!;
          // Offer every OTHER group this weapon could legally join, plus a solo split.
          const opts = g
            .map((_, ti) => ti)
            .filter((ti) => ti !== gi && canMove(card, g, wi, ti))
            .map((ti) => `<option value="g:${ti}">→ TIC ${ti + 1}</option>`)
            .join("");
          const split = grp.length > 1 ? `<option value="new">→ split off</option>` : "";
          const move =
            opts || split
              ? `<select class="tic-move" data-wi="${wi}" aria-label="Move ${esc(w.name)}">
                   <option value="" selected>move…</option>${opts}${split}
                 </select>`
              : "";
          return `<li><span class="tic-wname">${esc(w.name)}</span>${move}</li>`;
        })
        .join("");
      return `<div class="tic-box">
          <div class="tic-box-head">
            <span class="tic-tag">TIC ${gi + 1}</span>
            <span class="tic-meta">${esc(tic.damageText)} · ${esc(loc(tic))}</span>
          </div>
          <ul class="tic-members">${rows}</ul>
        </div>`;
    })
    .join("");

  return `<section class="tic-editor" id="tic-editor">
      <div class="tic-editor-head">
        <h3>Weapon Groups (TICs)</h3>
        <button type="button" id="tic-reset" class="tic-reset">Reset to auto</button>
      </div>
      <p class="muted tic-hint">Move a weapon to combine it into another TIC (same location only) or split it off. The card updates live.</p>
      <div class="tic-boxes">${boxes}</div>
    </section>`;
}

/** Short location label for a TIC (uses the first member's location). */
function loc(tic: Tic): string {
  const base = tic.location === "CT" || tic.location === "LT" || tic.location === "RT" ? "Torso" : tic.location;
  return tic.rearMounted ? `${base} (R)` : base;
}
