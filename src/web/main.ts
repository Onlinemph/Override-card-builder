/**
 * Browser entry point. The UI layer — the ONLY place that touches the DOM. It
 * imports the pure core (parser + converter) exactly as the CLI does, proving
 * the core runs unchanged in a browser. No Node/filesystem APIs here.
 */

import "./style.css";

import {
  convertAny,
  dropshipWeaponRows,
  fighterWeaponRows,
  groupingLocation,
  ParseError,
  protoWeaponRows,
  vehicleWeaponRows,
} from "../core/index.js";
import { renderBACard } from "./ba-card.js";
import { renderDropshipCard } from "./dropship-card.js";
import { renderFighterCard } from "./fighter-card.js";
import { renderInfantryCard } from "./infantry-card.js";
import { renderMechCard } from "./mech-card.js";
import { renderProtoCard } from "./proto-card.js";
import { renderVehicleCard } from "./vehicle-card.js";
import { applyMove, groupingFromTics, renderTicEditorHtml, ticsFromGrouping } from "./tic-editor.js";
import type { EditorFacets, Grouping } from "./tic-editor.js";

// ---------------------------------------------------------------------------
// Unit browser — powered by the pre-built index served as a STATIC asset at
// ./units-index.json (public/units-index.json, written by extract-units.mjs).
// The unit files themselves are served from ./units/<path>. The index is
// fetched (not bundled/imported) so it keeps a stable URL and survives the
// single-file inlining step, which deletes the hashed assets/ directory.
// ---------------------------------------------------------------------------
interface UnitEntry { name: string; path: string; category: string; era: string; }

// Fetch the static index; returns null (browser stays hidden) if not generated.
async function loadUnitsIndex(): Promise<UnitEntry[] | null> {
  try {
    const resp = await fetch("./units-index.json");
    if (!resp.ok) return null;
    return (await resp.json()) as UnitEntry[];
  } catch {
    return null;
  }
}

async function initBrowser(): Promise<void> {
  const statusEl = document.getElementById("browse-status");
  const listEl = document.getElementById("browse-list");
  const countEl = document.getElementById("browse-count");
  const catSel = document.getElementById("browse-cat") as HTMLSelectElement;
  const searchInput = document.getElementById("browse-q") as HTMLInputElement;
  const toggleBtn = document.getElementById("browse-toggle") as HTMLButtonElement;
  const browseBody = document.getElementById("browse-body") as HTMLElement;
  if (!statusEl || !listEl || !catSel || !searchInput || !toggleBtn || !browseBody) return;

  const MAX_RESULTS = 80;

  const unitsOrNull = await loadUnitsIndex();
  if (!unitsOrNull) {
    statusEl.textContent = "Unit index not found — run 'npm run extract-units' then restart the dev server.";
    return;
  }
  const units: UnitEntry[] = unitsOrNull;

  // Populate category filter.
  const cats = [...new Set(units.map((u) => u.category))].sort();
  for (const cat of cats) {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    catSel.appendChild(opt);
  }

  function render(): void {
    const q = searchInput.value.trim().toLowerCase();
    const cat = catSel.value;
    const filtered = units.filter(
      (u) =>
        (!cat || u.category === cat) &&
        (!q || u.name.toLowerCase().includes(q) || u.era.toLowerCase().includes(q)),
    );
    if (countEl) countEl.textContent = `(${filtered.length.toLocaleString()} units)`;
    statusEl!.textContent = "";

    const shown = filtered.slice(0, MAX_RESULTS);
    if (filtered.length === 0) {
      listEl!.innerHTML = "";
      statusEl!.textContent = "No units match.";
      return;
    }

    listEl!.innerHTML = shown
      .map(
        (u, i) =>
          `<div class="browse-item" role="option" tabindex="0" data-idx="${i}" data-path="${esc(u.path)}" data-name="${esc(u.name)}">
            <span class="browse-item-name">${esc(u.name)}</span>
            <span class="browse-item-meta muted">${esc(u.category)}${u.era ? ` · ${esc(u.era)}` : ""}</span>
            <button class="browse-add" type="button" data-path="${esc(u.path)}" data-name="${esc(u.name)}" title="Add to force" aria-label="Add ${esc(u.name)} to force">＋</button>
          </div>`,
      )
      .join("");
    if (filtered.length > MAX_RESULTS) {
      statusEl!.textContent = `Showing ${MAX_RESULTS} of ${filtered.length.toLocaleString()} — refine your search.`;
    }
  }

  async function loadUnit(path: string, name: string): Promise<void> {
    statusEl!.textContent = `Loading ${name}…`;
    try {
      // Unit files are served as static assets from units/ (extracted from units.zip at build time).
      const url = `./units/${path}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${url}`);
      const text = await resp.text();
      textarea.value = text;
      // Pass the path (not the display name) so the BV lookup matches by filename.
      showResults([convertOne(text, path)]);
      textarea.scrollIntoView({ behavior: "smooth", block: "start" });
      statusEl!.textContent = "";
    } catch (err) {
      statusEl!.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // Add a browsed unit to the force without disturbing the preview.
  async function addBrowsedUnit(path: string, name: string): Promise<void> {
    try {
      const resp = await fetch(`./units/${path}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      addToForce(name, await resp.text(), path); // path enables filename-based BV match
      statusEl!.textContent = `Added ${name} to force.`;
    } catch (err) {
      statusEl!.textContent = `Error adding ${name}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  listEl.addEventListener("click", (e) => {
    const add = (e.target as Element).closest<HTMLElement>(".browse-add");
    if (add) {
      void addBrowsedUnit(add.dataset.path!, add.dataset.name!);
      return;
    }
    const item = (e.target as Element).closest<HTMLElement>(".browse-item");
    if (!item) return;
    loadUnit(item.dataset.path!, item.dataset.name!);
  });
  listEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const item = e.target as HTMLElement;
    if (!item.matches(".browse-item")) return;
    e.preventDefault();
    loadUnit(item.dataset.path!, item.dataset.name!);
  });

  catSel.addEventListener("change", render);
  searchInput.addEventListener("input", render);

  // Collapse toggle.
  toggleBtn.addEventListener("click", () => {
    const expanded = toggleBtn.getAttribute("aria-expanded") === "true";
    toggleBtn.setAttribute("aria-expanded", String(!expanded));
    browseBody.style.display = expanded ? "none" : "";
    toggleBtn.textContent = expanded ? "▼ Show" : "▲ Hide";
  });

  render();
}
import type { AnyCard, CardWeapon, Tic } from "../core/index.js";

// Injected by Vite (see vite.config.ts).
declare const __BUILD_TIME__: string;

const EXAMPLE_LOCUST = `chassis:Locust
model:LCT-1V

Config:Biped
TechBase:Inner Sphere
Mass:20
Engine:160 Fusion Engine

Heat Sinks:10 Single
Walk MP:8
Jump MP:0

Armor:Standard(Inner Sphere)
LA Armor:4
RA Armor:4
LT Armor:8
RT Armor:8
CT Armor:10
HD Armor:8
LL Armor:8
RL Armor:8
RTL Armor:2
RTR Armor:2
RTC Armor:2

Weapons:3
Medium Laser, Center Torso
Machine Gun, Left Arm
Machine Gun, Right Arm
`;

// A BLK Battle Armor squad, to demo the .blk path in the browser.
const EXAMPLE_ELEMENTAL = `<UnitType>
BattleArmor
</UnitType>

<Name>
Elemental
</Name>

<Model>
[Laser]
</Model>

<type>
Clan Level 2
</type>

<motion_type>
Jump
</motion_type>

<cruiseMP>
1
</cruiseMP>

<jumpingMP>
3
</jumpingMP>

<Trooper Count>
5
</Trooper Count>

<weightclass>
3
</weightclass>

<chassis>
biped
</chassis>

<armor>
10
</armor>

<Squad Equipment>
CLERSmallLaser:RA
CLSRM2 (OS):LA
CLSRM2 (OS) Ammo:Body
Battle Claw:LA
</Squad Equipment>
`;

// A BLK combat vehicle (Tank), to demo the vehicle path in the browser.
const EXAMPLE_TANK = `<UnitType>
Tank
</UnitType>

<Name>
Manticore Heavy Tank
</Name>

<Model>

</Model>

<type>
IS Level 1
</type>

<motion_type>
Tracked
</motion_type>

<cruiseMP>
4
</cruiseMP>

<armor>
42
33
33
26
42
</armor>

<Body Equipment>
IS Ammo LRM-10
IS Ammo SRM-6
</Body Equipment>

<Front Equipment>
Medium Laser
</Front Equipment>

<Turret Equipment>
LRM 10
SRM 6
PPC
</Turret Equipment>

<tonnage>
60.0
</tonnage>
`;

// A BLK VTOL, to demo the rotor location + flying move on the vehicle card.
const EXAMPLE_VTOL = `<UnitType>
VTOL
</UnitType>

<Name>
Cyrano Gunship
</Name>

<Model>

</Model>

<type>
IS Level 2
</type>

<motion_type>
VTOL
</motion_type>

<cruiseMP>
12
</cruiseMP>

<armor>
5
4
4
2
2
</armor>

<Front Equipment>
Large Laser
BeagleActiveProbe
</Front Equipment>

<Rotor Equipment>
</Rotor Equipment>

<tonnage>
30.0
</tonnage>
`;

// A BLK aerospace fighter, to demo the fighter card (nose/wings/aft + thrust).
const EXAMPLE_FIGHTER = `<UnitType>
Aero
</UnitType>

<Name>
Shikra
</Name>

<Model>
SKR-4N
</Model>

<type>
IS Level 3
</type>

<motion_type>
Aerodyne
</motion_type>

<SafeThrust>
6
</SafeThrust>

<heatsinks>
16
</heatsinks>

<sink_type>
1
</sink_type>

<armor>
111
83
83
70
</armor>

<Nose Equipment>
ISGaussRifle
</Nose Equipment>

<Left Wing Equipment>
Heavy PPC
</Left Wing Equipment>

<Right Wing Equipment>
Heavy PPC
</Right Wing Equipment>

<Aft Equipment>
ISMediumPulseLaser
</Aft Equipment>

<Fuselage Equipment>
IS Gauss Ammo
IS Gauss Ammo
IS Gauss Ammo
</Fuselage Equipment>

<tonnage>
90.0
</tonnage>
`;

// A BLK conventional infantry platoon, to demo the infantry path in the browser.
const EXAMPLE_INFANTRY = `<UnitType>
Infantry
</UnitType>

<Name>
Field Gun Infantry
</Name>

<Model>
Motorized Batteries
</Model>

<squad_size>
5
</squad_size>

<squadn>
6
</squadn>

<Primary>
Auto Rifle
</Primary>

<Secondary>
Heavy PPC
</Secondary>

<secondn>
1
</secondn>

<type>
IS Level 2
</type>

<motion_type>
Motorized
</motion_type>

<antimek>
8
</antimek>

<Field Guns Equipment>
ISLAC5
ISLAC5
ISLAC5
</Field Guns Equipment>
`;

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing element #${id}`);
  return el as T;
};

const textarea = $<HTMLTextAreaElement>("mtf");
const output = $<HTMLElement>("output");
const fileInput = $<HTMLInputElement>("file");

/** Escape text for safe insertion into HTML. */
function esc(s: string | number): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

function errorCard(file: string, message: string): string {
  return `<article class="card error">
    <h2>Could not convert ${esc(file)}</h2>
    <p>${esc(message)}</p>
  </article>`;
}

type ConvertResult = { ok: true; result: AnyCard } | { ok: false; html: string };

// ---- Battle Value (official MUL BV2) --------------------------------------
// A static { key -> BV } lookup (public/bv-index.json, built by
// scripts/build-bv-index.mjs from a Master Unit List export). Keyed by both the
// normalized source FILENAME (matches ~98% of the bundled MegaMek files) and the
// normalized "Chassis Model" name (fallback for pasted text). BV is a web-only
// concern sourced from this file, so it never touches the pure core/converter.
let bvIndex: Record<string, number> = {};
const bvKey = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim();
const fileStem = (p: string): string =>
  (p.replace(/\\/g, "/").split("/").pop() ?? "").replace(/\.(mtf|blk)$/i, "");

async function loadBvIndex(): Promise<void> {
  try {
    const resp = await fetch("./bv-index.json");
    if (resp.ok) bvIndex = (await resp.json()) as Record<string, number>;
  } catch {
    /* no BV index — cards/force just omit BV */
  }
}

/** Official BV for a unit: try the source filename first (best match), then the
 * display name. Returns undefined when the unit isn't in the MUL dataset. */
function lookupBv(name: string, file?: string): number | undefined {
  if (file) {
    const byFile = bvIndex[bvKey(fileStem(file))];
    if (byFile) return byFile;
  }
  return bvIndex[bvKey(name)];
}

// BV2 pilot-skill multiplier (TechManual p.315 / MegaMek): [gunnery][piloting],
// 0–8 each. Regular 4/5 = 1.00; better skills cost more BV, worse less.
const BV_SKILL_MULT: ReadonlyArray<ReadonlyArray<number>> = [
  [2.42, 2.31, 2.21, 2.1, 1.93, 1.75, 1.68, 1.59, 1.5],
  [2.21, 2.11, 2.02, 1.92, 1.76, 1.6, 1.54, 1.46, 1.38],
  [1.93, 1.85, 1.76, 1.68, 1.54, 1.4, 1.35, 1.28, 1.21],
  [1.66, 1.58, 1.51, 1.44, 1.32, 1.2, 1.16, 1.1, 1.04],
  [1.38, 1.32, 1.26, 1.2, 1.1, 1.0, 0.95, 0.9, 0.85],
  [1.31, 1.19, 1.13, 1.08, 0.99, 0.9, 0.85, 0.81, 0.77],
  [1.24, 1.12, 1.07, 1.02, 0.94, 0.85, 0.81, 0.77, 0.72],
  [1.17, 1.06, 1.01, 0.96, 0.88, 0.8, 0.76, 0.72, 0.68],
  [1.1, 1.0, 0.95, 0.9, 0.83, 0.75, 0.71, 0.68, 0.64],
];
const clampIdx = (n: number): number => Math.max(0, Math.min(8, Math.round(n)));

/** Skill-adjusted BV: base × the BV2 gunnery/piloting multiplier, rounded. */
function adjustedBv(base: number | undefined, gunnery = 4, piloting = 5): number | undefined {
  if (base === undefined) return undefined;
  return Math.round(base * BV_SKILL_MULT[clampIdx(gunnery)]![clampIdx(piloting)]!);
}

/** A force unit's printed BV: official BV adjusted for its pilot skills. */
function unitBv(u: ForceUnit): number | undefined {
  return adjustedBv(lookupBv(u.name, u.file), u.gunnery ?? 4, u.piloting ?? 5);
}

/** Inject a BV badge just after the card's title (works for every card kind:
 * .ms-title for most, .ba-title for Battle Armor). */
function withBv(html: string, bv: number | undefined): string {
  if (!bv) return html;
  const badge = `<div class="card-bv">BV <b>${bv.toLocaleString()}</b></div>`;
  return html.replace(/(<div class="(?:ms-title|ba-title)\b[^>]*>[\s\S]*?<\/div>)/, `$1${badge}`);
}

/** Fill the card's (blank) skill boxes — first = Gunnery, second = Piloting (or
 * the unit's second skill, e.g. Anti-'Mech). Pass undefined to leave a box blank. */
function withSkills(html: string, gunnery?: number, piloting?: number): string {
  const vals = [gunnery, piloting];
  let i = 0;
  return html.replace(/<div class="(ms-skill-box|ba-skill-box)">\s*<\/div>/g, (m, cls: string) => {
    const v = vals[i++];
    return v === undefined || v === null ? m : `<div class="${cls}">${v}</div>`;
  });
}

/** Parse + convert one source, auto-detecting MTF ('Mech) vs BLK (Battle Armor).
 * `file` is the source filename/path when known — used for the BV lookup. */
function convertOne(text: string, file: string): ConvertResult {
  try {
    const result = convertAny(text, file);
    (result.card as { bv?: number }).bv = lookupBv(result.card.name, file);
    return { ok: true, result };
  } catch (err) {
    const message =
      err instanceof ParseError ? err.message : err instanceof Error ? err.message : String(err);
    return { ok: false, html: errorCard(file, message) };
  }
}

/** Raw card HTML, dispatched on unit kind (no BV/skills injected). */
function rawCardHtml(result: AnyCard): string {
  return result.kind === "battlearmor"
    ? renderBACard(result.card)
    : result.kind === "vehicle"
      ? renderVehicleCard(result.card)
      : result.kind === "fighter"
        ? renderFighterCard(result.card)
        : result.kind === "infantry"
          ? renderInfantryCard(result.card)
          : result.kind === "protomech"
            ? renderProtoCard(result.card)
            : result.kind === "dropship"
              ? renderDropshipCard(result.card)
              : renderMechCard(result.card);
}

/** Card HTML with the BV badge (used for the single preview). */
function cardHtml(result: AnyCard): string {
  return withBv(rawCardHtml(result), (result.card as { bv?: number }).bv);
}

// ---- Manual TIC editor wiring ---------------------------------------------

/** An active edit session: the grouping is the source of truth and rebuilds the
 * card's weapon display on every change (card.tics for mechs, weapon rows else). */
interface EditSession {
  weapons: CardWeapon[];
  facets: EditorFacets;
  grouping: Grouping;
  autoGrouping: Grouping; // the original auto-grouping, for "Reset to auto"
  apply: (tics: Tic[]) => void; // write the regrouped result onto the card
  renderCard: () => string;
}
let edit: EditSession | null = null;
// When set, the active edit session belongs to force[editingForceIdx]; TIC moves
// and skills are persisted back onto that force unit (not just the transient card).
let editingForceIdx: number | null = null;

// 'Mech locations collapse the torso; the facet key matches isLegalTic's rule.
const mechFacets: EditorFacets = {
  keyOf: (w) => groupingLocation(w.location) + (w.rearMounted ? "|R" : ""),
  facetLabel: (w) => {
    const g = groupingLocation(w.location);
    const base = g === "T" || g === "Tr" ? "Torso" : w.location;
    return w.rearMounted ? `${base} (R)` : base;
  },
  enforceCaps: true,
};
// Vehicles / aero / proto / dropship group per arc (the weapon's rawLocation).
const titleCase = (s: string) =>
  s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
const facingBase = {
  keyOf: (w: CardWeapon) => w.rawLocation ?? "",
  facetLabel: (w: CardWeapon) => titleCase(w.rawLocation ?? "—"),
};
// Vehicles / aero / proto fire 'Mech-scale TICs (capped); DropShip bays do not.
const facingFacets: EditorFacets = { ...facingBase, enforceCaps: true };
const bayFacets: EditorFacets = { ...facingBase, enforceCaps: false };

/** Build an edit session for an editable card kind, or null when not editable. */
function makeSession(r: AnyCard): EditSession | null {
  const start = (weapons: CardWeapon[], tics: Tic[], facets: EditorFacets, apply: EditSession["apply"], renderCard: () => string): EditSession => {
    const grouping = groupingFromTics(tics, weapons);
    return { weapons, facets, grouping, autoGrouping: grouping, apply, renderCard };
  };
  switch (r.kind) {
    case "mech":
      return start(r.card.weapons, r.card.tics, mechFacets, (t) => (r.card.tics = t), () => renderMechCard(r.card));
    case "vehicle":
      return start(r.card.weaponMounts, r.card.tics, facingFacets, (t) => (r.card.weapons = vehicleWeaponRows(t, r.card.techBase)), () => renderVehicleCard(r.card));
    case "fighter":
      return start(r.card.weaponMounts, r.card.tics, facingFacets, (t) => (r.card.weapons = fighterWeaponRows(t, r.card.techBase)), () => renderFighterCard(r.card));
    case "protomech":
      return start(r.card.weaponMounts, r.card.tics, facingFacets, (t) => (r.card.weapons = protoWeaponRows(t, r.card.techBase)), () => renderProtoCard(r.card));
    case "dropship":
      return start(r.card.weaponMounts, r.card.tics, bayFacets, (t) => (r.card.weapons = dropshipWeaponRows(t, r.card.techBase)), () => renderDropshipCard(r.card));
    default:
      return null; // BA / infantry: no TICs
  }
}

/** Render the converted cards, attaching the TIC editor for a single editable unit. */
function showResults(results: ConvertResult[]): void {
  edit = null;
  editingForceIdx = null; // a normal preview exits force-edit mode
  output.classList.remove("force-play");
  if (results.length === 0) {
    output.innerHTML = `<p class="muted">Nothing to convert.</p>`;
    return;
  }
  if (results.length === 1 && results[0]!.ok) {
    const session = makeSession(results[0]!.result);
    if (session && session.weapons.length > 0) {
      edit = session;
      renderEdit();
      return;
    }
  }
  output.innerHTML = results.map((r) => (r.ok ? cardHtml(r.result) : r.html)).join("");
}

/** Re-render the editable card + its TIC editor from the current grouping. */
function renderEdit(): void {
  if (!edit) return;
  edit.apply(ticsFromGrouping(edit.weapons, edit.grouping));
  output.innerHTML = edit.renderCard() + renderTicEditorHtml(edit.weapons, edit.grouping, edit.facets);
}

// ---- Editing a unit that's in the force (TICs + skills, persisted) --------

/** Apply a force unit's saved TIC grouping onto a freshly converted card. */
function applySavedGrouping(result: AnyCard, grouping?: number[][]): void {
  if (!grouping) return;
  const session = makeSession(result);
  if (!session || session.weapons.length === 0) return;
  if (grouping.flat().length !== session.weapons.length) return; // stale grouping — ignore
  session.apply(ticsFromGrouping(session.weapons, grouping as Grouping));
}

const clampSkill = (v: string): number | undefined => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(8, Math.round(n))) : undefined;
};

function forceEditBar(u: ForceUnit): string {
  return `<div class="force-edit-bar"><span><b>${esc(u.name)}</b> — click armor/structure pips to track damage</span>
    <span class="force-edit-btns">
      <button id="force-reset-dmg" type="button">Reset damage</button>
      <button id="force-edit-done" type="button">Done</button>
    </span></div>`;
}

function skillsEditorHtml(u: ForceUnit): string {
  return `<div class="skills-editor">
    <label>Gunnery <input type="number" id="sk-gun" min="0" max="8" step="1" value="${u.gunnery ?? 4}"></label>
    <label>Piloting <input type="number" id="sk-pil" min="0" max="8" step="1" value="${u.piloting ?? 5}"></label>
  </div>`;
}

/** Open the TIC + skills editor for a force unit. */
function openForceEditor(i: number): void {
  if (i < 0 || i >= force.length) return;
  editingForceIdx = i;
  renderForceEdit();
  output.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Render the force unit's card (with its saved TICs + skills) plus the editors. */
function renderForceEdit(): void {
  const fi = editingForceIdx;
  if (fi == null) return;
  const u = force[fi];
  const r = convertOne(u.text, u.file ?? u.name);
  if (!r.ok) {
    edit = null;
    output.innerHTML = forceEditBar(u) + r.html;
    return;
  }
  let raw: string;
  let ticEditorHtml = "";
  const session = makeSession(r.result);
  if (session && session.weapons.length > 0) {
    if (u.grouping && u.grouping.flat().length === session.weapons.length) {
      session.grouping = u.grouping.map((g) => [...g]) as Grouping;
    }
    session.apply(ticsFromGrouping(session.weapons, session.grouping));
    edit = session; // the shared TIC-move/reset listeners act on this
    raw = session.renderCard();
    ticEditorHtml = renderTicEditorHtml(session.weapons, session.grouping, session.facets);
  } else {
    edit = null; // BA / infantry: skills only, no TICs
    raw = rawCardHtml(r.result);
  }
  const card = withSkills(withBv(raw, unitBv(u)), u.gunnery ?? 4, u.piloting ?? 5);
  output.classList.add("force-play"); // enables pip cursors / damage tracking
  output.innerHTML = forceEditBar(u) + skillsEditorHtml(u) + card + ticEditorHtml;
  applyDamageMarks();
}

// ---- Damage tracking (Tier 1): clickable armor/structure/condition pips -----
// Renderers stay pure; we tag each pip GROUP (.hexrow / BA .pips) by its ordinal
// position on the card (stable across re-renders) and mark the first N pips as
// hit from the unit's saved state. Crew condition is a single track.

/** (Re)apply the active force unit's damage marks to the rendered card. */
function applyDamageMarks(): void {
  if (editingForceIdx == null) return;
  const dmg = force[editingForceIdx]!.damage ?? {};
  Array.from(output.querySelectorAll<HTMLElement>(".hexrow, .ba-armor-pips .pips")).forEach((g, gi) => {
    g.dataset.dg = String(gi);
    const hit = dmg.groups?.[`g${gi}`] ?? 0;
    Array.from(g.children).forEach((p, i) => {
      const el = p as HTMLElement;
      el.dataset.di = String(i);
      el.classList.toggle("pip-hit", i < hit);
    });
  });
  const cond = dmg.condition ?? 0;
  Array.from(output.querySelectorAll<HTMLElement>(".condmon .cm-pip")).forEach((p, i) => {
    p.dataset.dc = String(i);
    p.classList.toggle("pip-hit", i < cond);
  });
}

/** A click toggles a pip "level": clicking the last-hit pip un-marks it. */
const nextLevel = (cur: number, clicked: number): number => (cur === clicked + 1 ? clicked : clicked + 1);

output.addEventListener("click", (e) => {
  if (editingForceIdx == null) return;
  const t = e.target as HTMLElement;
  const u = force[editingForceIdx]!;
  if (t.closest("#force-reset-dmg")) {
    delete u.damage;
    saveForce();
    applyDamageMarks();
    return;
  }
  const cm = t.closest<HTMLElement>(".cm-pip");
  if (cm?.dataset.dc != null) {
    u.damage ??= {};
    u.damage.condition = nextLevel(u.damage.condition ?? 0, Number(cm.dataset.dc));
    saveForce();
    applyDamageMarks();
    return;
  }
  const pip = t.closest<HTMLElement>(".hex, .pip");
  const grp = pip?.closest<HTMLElement>(".hexrow, .pips");
  if (pip?.dataset.di != null && grp?.dataset.dg != null) {
    u.damage ??= {};
    u.damage.groups ??= {};
    const key = `g${grp.dataset.dg}`;
    u.damage.groups[key] = nextLevel(u.damage.groups[key] ?? 0, Number(pip.dataset.di));
    saveForce();
    applyDamageMarks();
  }
});

/** Persist + re-render after a TIC move/reset, in force-edit mode or the plain preview. */
function afterTicChange(): void {
  if (editingForceIdx != null && edit) {
    force[editingForceIdx]!.grouping = edit.grouping.map((g) => [...g]);
    saveForce();
    renderForceEdit();
  } else {
    renderEdit();
  }
}

// Delegated editor controls (the panel is re-rendered on each change, so listen
// on the stable `output` container rather than the transient selects/buttons).
output.addEventListener("change", (e) => {
  const target = e.target as HTMLElement;
  // Skill inputs (force editor): persist onto the force unit.
  if (editingForceIdx != null && (target.id === "sk-gun" || target.id === "sk-pil")) {
    const val = clampSkill((target as HTMLInputElement).value);
    if (target.id === "sk-gun") force[editingForceIdx]!.gunnery = val;
    else force[editingForceIdx]!.piloting = val;
    saveForce();
    renderForceEdit();
    renderForce();
    return;
  }
  const sel = target.closest<HTMLSelectElement>("select.tic-move");
  if (!sel || !edit || !sel.value) return;
  const wi = Number(sel.dataset.wi);
  const tgt = sel.value === "new" ? "new" : Number(sel.value.replace(/^g:/, ""));
  edit.grouping = applyMove(edit.grouping, wi, tgt);
  afterTicChange();
});
output.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (target.closest("#force-edit-done")) {
    editingForceIdx = null;
    edit = null;
    output.innerHTML = "";
    return;
  }
  if (!target.closest("#tic-reset") || !edit) return;
  edit.grouping = edit.autoGrouping.map((g) => [...g]);
  if (editingForceIdx != null) delete force[editingForceIdx]!.grouping;
  afterTicChange();
});

// ---- Force builder + print sheet ------------------------------------------
// A persistent collection of units (source text + name) the user assembles from
// the browser / input area, rendered all at once onto a print-optimized sheet.
// Stored as SOURCE text (not converted cards) so it survives reloads and stays
// independent of any in-progress TIC edits.

interface ForceUnit {
  name: string;
  text: string;
  file?: string;
  /** Pilot skills (default 4 / 5 when unset). */
  gunnery?: number;
  piloting?: number;
  /** Saved TIC grouping override (weapon-index groups) from the editor. */
  grouping?: number[][];
  /** Live damage state (Tier-1 tracking): hit-pip counts per pip group + the
   * crew condition level. Groups are keyed by ordinal position on the card. */
  damage?: { groups?: Record<string, number>; condition?: number };
}
/** A named force: a roster of units the user can save, switch, export, share. */
interface SavedForce { name: string; units: ForceUnit[]; }
const FORCE_KEY = "mtf2override.force"; // legacy single-force key (migrated once)
const FORCES_KEY = "mtf2override.forces"; // { active, forces: SavedForce[] }

function loadForces(): { active: number; forces: SavedForce[] } {
  try {
    const raw = localStorage.getItem(FORCES_KEY);
    if (raw) {
      const p = JSON.parse(raw) as { active?: number; forces?: SavedForce[] };
      if (Array.isArray(p.forces) && p.forces.length) {
        const fs = p.forces.map((f) => ({ name: f.name || "Force", units: Array.isArray(f.units) ? f.units : [] }));
        return { active: Math.max(0, Math.min(fs.length - 1, p.active ?? 0)), forces: fs };
      }
    }
    // Migrate a legacy single force (old key), if present.
    const old = localStorage.getItem(FORCE_KEY);
    const units = old ? (JSON.parse(old) as ForceUnit[]) : [];
    return { active: 0, forces: [{ name: "My Force", units: Array.isArray(units) ? units : [] }] };
  } catch {
    return { active: 0, forces: [{ name: "My Force", units: [] }] };
  }
}

const _forceState = loadForces();
let forces: SavedForce[] = _forceState.forces;
let activeForce = _forceState.active;
let force: ForceUnit[] = forces[activeForce]!.units; // the active roster (mutated in place)

function saveForce(): void {
  try {
    localStorage.setItem(FORCES_KEY, JSON.stringify({ active: activeForce, forces }));
  } catch {
    /* storage may be unavailable (private mode / quota) — the in-memory forces still work */
  }
}

/** Switch the active force (rebinding `force` to its roster, in place). */
function setActiveForce(i: number): void {
  if (i < 0 || i >= forces.length) return;
  exitForceEditor();
  activeForce = i;
  force = forces[activeForce]!.units;
  saveForce();
  renderForce();
}
function newForce(): void {
  const name = (prompt("Name for the new force:", `Force ${forces.length + 1}`) ?? "").trim();
  if (!name) return;
  forces.push({ name, units: [] });
  setActiveForce(forces.length - 1);
}
function renameForce(): void {
  const cur = forces[activeForce]!;
  const name = (prompt("Rename force:", cur.name) ?? "").trim();
  if (!name) return;
  cur.name = name;
  saveForce();
  renderForce();
}
function deleteForce(): void {
  if (!confirm(`Delete force "${forces[activeForce]!.name}"? This can't be undone.`)) return;
  exitForceEditor();
  forces.splice(activeForce, 1);
  if (forces.length === 0) forces.push({ name: "My Force", units: [] });
  activeForce = Math.max(0, Math.min(forces.length - 1, activeForce));
  force = forces[activeForce]!.units;
  saveForce();
  renderForce();
}

function addToForce(name: string, text: string, file?: string): void {
  force.push({ name: name || "Unit", text, file });
  saveForce();
  renderForce();
}

/** Add whatever is currently in the textarea, naming it from the converted card. */
function addCurrentToForce(): void {
  const text = textarea.value.trim();
  if (!text) {
    output.innerHTML = `<p class="muted">Paste or upload an .mtf or .blk first, then add it.</p>`;
    return;
  }
  const r = convertOne(text, "pasted");
  addToForce(r.ok ? r.result.card.name : "Pasted unit", text); // pasted: no filename, BV matches by name
}

/** Render the force list panel (with per-unit BV + total) and toggle Print. */
/** Rebuild the force-picker dropdown (names + unit counts). */
function renderForcePicker(): void {
  const pick = document.getElementById("force-pick") as HTMLSelectElement | null;
  if (!pick) return;
  pick.innerHTML = forces
    .map((f, i) => `<option value="${i}"${i === activeForce ? " selected" : ""}>${esc(f.name)} (${f.units.length})</option>`)
    .join("");
}

function renderForce(): void {
  renderForcePicker();
  const listEl = document.getElementById("force-list");
  const countEl = document.getElementById("force-count");
  const printBtn = document.getElementById("force-print") as HTMLButtonElement | null;
  if (!listEl) return;
  if (printBtn) printBtn.disabled = force.length === 0;
  let total = 0;
  let withBvCount = 0;
  if (countEl) countEl.textContent = force.length ? `(${force.length})` : "";
  listEl.innerHTML = force.length
    ? force
        .map((u, i) => {
          const bv = unitBv(u); // skill-adjusted
          if (bv) {
            total += bv;
            withBvCount += 1;
          }
          const bvTag = bv ? `<span class="force-item-bv">${bv.toLocaleString()}</span>` : "";
          return (
            `<div class="force-item"><button class="force-item-name" type="button" data-i="${i}" title="Edit TICs / skills for ${esc(u.name)}">${esc(u.name)}</button>${bvTag}` +
            `<button class="force-remove" type="button" data-i="${i}" title="Remove" aria-label="Remove ${esc(u.name)}">✕</button></div>`
          );
        })
        .join("")
    : `<p class="muted force-empty">No units yet. Add units from the browser (＋) or the input area below.</p>`;
  // Total BV line (notes if some units had no BV match).
  const totalEl = document.getElementById("force-total");
  if (totalEl) {
    totalEl.innerHTML =
      force.length && total
        ? `Total BV <b>${total.toLocaleString()}</b>` +
          (withBvCount < force.length ? ` <span class="muted">(${force.length - withBvCount} without BV)</span>` : "")
        : "";
  }
}

// A dedicated <style> whose @page rule sets the print orientation (CSS @page
// can't be toggled by a class, so we rewrite this rule per print).
const pageStyle = document.createElement("style");
document.head.appendChild(pageStyle);

/** The selected print layout: "fit" = 2×2 portrait, "fitL" = 2×2 landscape,
 * "p2" = 2 per row (portrait), "p1" = 1 per row (portrait). */
function forceMode(): "fit" | "fitL" | "p2" | "p1" {
  const v = (document.getElementById("force-cols") as HTMLSelectElement | null)?.value;
  return v === "fitL" || v === "p2" || v === "p1" ? v : "fit";
}

/** Convert one force unit to card HTML (or its error card), applying its saved
 * TIC grouping + pilot skills + BV. Uses the stored filename for the BV match. */
function forceCardHtml(u: ForceUnit): string {
  const r = convertOne(u.text, u.file ?? u.name);
  if (!r.ok) return r.html;
  applySavedGrouping(r.result, u.grouping);
  (r.result.card as { bv?: number }).bv = unitBv(u); // skill-adjusted BV on the badge
  return withSkills(cardHtml(r.result), u.gunnery ?? 4, u.piloting ?? 5);
}

/** Fit every card into its fixed quarter-page cell, measured off-screen.
 *
 * Cards are tall, so the cell aspect rarely matches the card's natural aspect.
 * But a card rendered WIDER wraps less and gets shorter — so for each card we
 * try a range of render widths and keep the one whose scaled result fills the
 * most cell area. That both avoids the 2-column collision (the narrow widths
 * lose) and uses nearly the whole cell. The winner is centered and uniformly
 * scaled (with a little headroom so print metric drift never clips). */
function fitCardsToCells(area: HTMLElement): void {
  const SAFETY = 0.96; // headroom against print font-metric drift
  const WIDTHS_MM = [130, 145, 160, 175, 190, 205]; // render widths to try
  // Lay the sheet out off-screen so offset/scroll sizes are real (it is
  // display:none in normal flow); mm → px is the 96dpi CSS constant either way.
  area.style.cssText = "display:block;position:fixed;left:-10000px;top:0;";
  for (const cell of Array.from(area.querySelectorAll<HTMLElement>(".fit-cell"))) {
    const el = cell.querySelector<HTMLElement>(".fit-scale");
    if (!el) continue;
    const cw = cell.clientWidth;
    const ch = cell.clientHeight;
    let best: { wmm: number; w: number; h: number; s: number; area: number } | null = null;
    for (const wmm of WIDTHS_MM) {
      el.style.width = `${wmm}mm`;
      const w = el.scrollWidth || 1;
      const h = el.scrollHeight || 1;
      const s = Math.min(cw / w, ch / h);
      const filled = w * h * s * s; // printed area in the cell
      if (!best || filled > best.area) best = { wmm, w, h, s, area: filled };
    }
    el.style.width = `${best!.wmm}mm`;
    const s = best!.s * SAFETY;
    const tx = Math.max(0, (cw - best!.w * s) / 2);
    const ty = Math.max(0, (ch - best!.h * s) / 2);
    el.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
  }
  area.style.cssText = ""; // hand display back to the stylesheet (#print-area)
}

/** The active force's total (skill-adjusted) BV. */
function forceTotalBv(): number {
  let total = 0;
  for (const u of force) {
    const bv = unitBv(u);
    if (bv) total += bv;
  }
  return total;
}

/** A print-sheet header row: force name, total BV, and (fit modes) page x of y. */
function sheetHeader(pageNum?: number, pageCount?: number): string {
  const total = forceTotalBv();
  const bvTag = total ? `<span class="sheet-head-bv">Total BV ${total.toLocaleString()}</span>` : "";
  const pageTag =
    pageNum && pageCount ? `<span class="sheet-head-page">Page ${pageNum} of ${pageCount}</span>` : "";
  return `<div class="sheet-head"><span class="sheet-head-name">${esc(forces[activeForce]!.name)}</span>${bvTag}${pageTag}</div>`;
}

/** Build all force cards, swap the page to the print container, and print. */
function printForceSheet(): void {
  if (force.length === 0) return;
  const area = document.getElementById("print-area");
  if (!area) return;
  const mode = forceMode();
  const isFit = mode === "fit" || mode === "fitL";
  const orientation = mode === "fitL" ? "landscape" : "portrait";
  pageStyle.textContent = `@page { size: ${orientation}; margin: 10mm; }`;
  if (isFit) {
    // 2×2 per page: chunk into fours, each its own page (with a header), each card fit to a cell.
    const sheetClass = mode === "fitL" ? "sheet fit-landscape" : "sheet fit-portrait";
    const pageCount = Math.ceil(force.length / 4);
    const pages: string[] = [];
    for (let i = 0; i < force.length; i += 4) {
      const cells = force
        .slice(i, i + 4)
        .map((u) => `<div class="fit-cell"><div class="fit-scale">${forceCardHtml(u)}</div></div>`)
        .join("");
      pages.push(
        `<div class="print-page">${sheetHeader(i / 4 + 1, pageCount)}<div class="${sheetClass}">${cells}</div></div>`,
      );
    }
    area.innerHTML = pages.join("");
    fitCardsToCells(area);
  } else {
    // Flowing layout: one header at the top (page numbers need explicit pages).
    area.innerHTML = `${sheetHeader()}<div class="sheet cols-${mode === "p1" ? "1" : "2"}">${force.map(forceCardHtml).join("")}</div>`;
  }
  document.body.classList.add("print-mode");
  const cleanup = (): void => {
    document.body.classList.remove("print-mode");
    pageStyle.textContent = "";
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
}

// Force-panel controls.
$("add-force").addEventListener("click", addCurrentToForce);
$("force-print").addEventListener("click", printForceSheet);
function exitForceEditor(): void {
  if (editingForceIdx == null) return;
  editingForceIdx = null;
  edit = null;
  output.classList.remove("force-play");
  output.innerHTML = "";
}
$("force-clear").addEventListener("click", () => {
  if (force.length === 0) return;
  if (!confirm(`Remove all units from "${forces[activeForce]!.name}"?`)) return;
  force.length = 0; // clear in place — keep the reference into forces[activeForce]
  exitForceEditor();
  saveForce();
  renderForce();
});
$("force-list").addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const nameBtn = target.closest<HTMLElement>(".force-item-name");
  if (nameBtn) {
    openForceEditor(Number(nameBtn.dataset.i));
    return;
  }
  const btn = target.closest<HTMLElement>(".force-remove");
  if (!btn) return;
  force.splice(Number(btn.dataset.i), 1);
  exitForceEditor(); // indices shifted — close the editor to avoid a stale target
  saveForce();
  renderForce();
});
// ---- Force management: switch / new / rename / delete / export / import / share

$("force-pick").addEventListener("change", (e) =>
  setActiveForce(Number((e.target as HTMLSelectElement).value)),
);
$("force-new").addEventListener("click", newForce);
$("force-rename").addEventListener("click", renameForce);
$("force-delete").addEventListener("click", deleteForce);

/** Trigger a browser download of an object as pretty JSON. */
function downloadJson(filename: string, obj: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("force-export").addEventListener("click", () => {
  const f = forces[activeForce]!;
  downloadJson(`${(f.name.replace(/[^\w.-]+/g, "_") || "force")}.json`, { name: f.name, units: f.units });
});

/** Add a parsed force object (or bare units array) as a new active force. */
function importForceObj(obj: unknown): void {
  const o = obj as { name?: unknown; units?: unknown };
  const units = (Array.isArray(o?.units) ? o.units : Array.isArray(obj) ? obj : null) as ForceUnit[] | null;
  if (!units || !units.every((u) => u && typeof u.text === "string")) {
    alert("That doesn't look like a valid force file.");
    return;
  }
  forces.push({ name: String(o?.name ?? "Imported Force"), units });
  setActiveForce(forces.length - 1);
}
$("force-import").addEventListener("click", () => $("force-import-file").click());
$("force-import-file").addEventListener("change", async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    try {
      importForceObj(JSON.parse(await file.text()));
    } catch {
      alert("Could not read that force file.");
    }
  }
  input.value = "";
});

// Share link: the active force, gzip-compressed (raw fallback) into the URL hash.
const toB64url = (b: Uint8Array): string =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string): Uint8Array => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
async function gzip(str: string): Promise<Uint8Array> {
  const stream = new Blob([str]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function gunzip(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}
$("force-share").addEventListener("click", () => {
  void (async () => {
    const f = forces[activeForce]!;
    const json = JSON.stringify({ name: f.name, units: f.units });
    let payload: string;
    try {
      payload = "g" + toB64url(await gzip(json)); // 'g' = gzip
    } catch {
      payload = "r" + toB64url(new TextEncoder().encode(json)); // 'r' = raw (no CompressionStream)
    }
    const url = `${location.origin}${location.pathname}#f=${payload}`;
    try {
      await navigator.clipboard.writeText(url);
      alert("Share link copied to clipboard.");
    } catch {
      prompt("Copy this share link:", url);
    }
  })();
});

/** Import a force from a #f=… share link, then strip it from the URL. */
async function importFromHash(): Promise<void> {
  const m = location.hash.match(/[#&]f=([^&]+)/);
  if (!m) return;
  try {
    const payload = m[1]!;
    const bytes = fromB64url(payload.slice(1));
    const json = payload[0] === "g" ? await gunzip(bytes) : new TextDecoder().decode(bytes);
    importForceObj(JSON.parse(json));
  } catch {
    /* ignore a malformed share link */
  }
  history.replaceState(null, "", location.pathname + location.search);
}

renderForce();
// Load the BV index, then refresh the force panel so totals appear once it's in.
void loadBvIndex().then(renderForce);
// Import a shared force from the URL hash, if present.
void importFromHash();

$("convert").addEventListener("click", () => {
  const text = textarea.value.trim();
  if (!text) {
    output.innerHTML = `<p class="muted">Paste or upload an .mtf or .blk first.</p>`;
    return;
  }
  showResults([convertOne(text, "pasted")]);
});

$("example").addEventListener("click", () => {
  textarea.value = EXAMPLE_LOCUST;
  showResults([convertOne(EXAMPLE_LOCUST, "Locust LCT-1V.mtf")]);
});

$("example-ba").addEventListener("click", () => {
  textarea.value = EXAMPLE_ELEMENTAL;
  showResults([convertOne(EXAMPLE_ELEMENTAL, "Elemental [Laser].blk")]);
});

$("example-veh").addEventListener("click", () => {
  textarea.value = EXAMPLE_TANK;
  showResults([convertOne(EXAMPLE_TANK, "Manticore Heavy Tank.blk")]);
});

$("example-vtol").addEventListener("click", () => {
  textarea.value = EXAMPLE_VTOL;
  showResults([convertOne(EXAMPLE_VTOL, "Cyrano Gunship.blk")]);
});

$("example-fighter").addEventListener("click", () => {
  textarea.value = EXAMPLE_FIGHTER;
  showResults([convertOne(EXAMPLE_FIGHTER, "Shikra SKR-4N.blk")]);
});

$("example-inf").addEventListener("click", () => {
  textarea.value = EXAMPLE_INFANTRY;
  showResults([convertOne(EXAMPLE_INFANTRY, "Field Gun Infantry.blk")]);
});

$("clear").addEventListener("click", () => {
  textarea.value = "";
  fileInput.value = "";
  output.innerHTML = "";
});

// Open the native file picker from a real button. Clicking a <label> that wraps
// a display:none input fails to open the dialog in several browsers (Safari /
// some mobile), so trigger it explicitly instead.
$("upload").addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
  try {
    const files = Array.from(fileInput.files ?? []);
    if (files.length === 0) return;
    const texts = await Promise.all(files.map((f) => f.text()));
    const results = texts.map((text, i) => convertOne(text.trim(), files[i]!.name));
    textarea.value = texts[0]!; // show the first file for reference
    showResults(results);
  } catch (err) {
    // Never fail silently — surface read/parse problems to the user.
    output.innerHTML = errorCard("upload", err instanceof Error ? err.message : String(err));
  } finally {
    fileInput.value = ""; // reset so re-selecting the same file fires "change"
  }
});

// Kick off the unit browser (non-blocking; silently no-ops if index is absent).
initBrowser().catch(() => { /* already handled inside */ });

// Build stamp — lets you confirm at a glance whether you're on the latest deploy.
const buildEl = document.getElementById("build");
if (buildEl) buildEl.textContent = `build ${__BUILD_TIME__}`;
