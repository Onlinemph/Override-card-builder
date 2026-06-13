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
      showResults([convertOne(text, name)]);
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
      addToForce(name, await resp.text());
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

/** Parse + convert one source, auto-detecting MTF ('Mech) vs BLK (Battle Armor). */
function convertOne(text: string, file: string): ConvertResult {
  try {
    return { ok: true, result: convertAny(text, file) };
  } catch (err) {
    const message =
      err instanceof ParseError ? err.message : err instanceof Error ? err.message : String(err);
    return { ok: false, html: errorCard(file, message) };
  }
}

/** HTML for a successfully converted card, dispatched on unit kind. */
function cardHtml(result: AnyCard): string {
  if (result.kind === "battlearmor") return renderBACard(result.card);
  if (result.kind === "vehicle") return renderVehicleCard(result.card);
  if (result.kind === "fighter") return renderFighterCard(result.card);
  if (result.kind === "infantry") return renderInfantryCard(result.card);
  if (result.kind === "protomech") return renderProtoCard(result.card);
  if (result.kind === "dropship") return renderDropshipCard(result.card);
  return renderMechCard(result.card);
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

// Delegated editor controls (the panel is re-rendered on each change, so listen
// on the stable `output` container rather than the transient selects/buttons).
output.addEventListener("change", (e) => {
  const sel = (e.target as HTMLElement).closest<HTMLSelectElement>("select.tic-move");
  if (!sel || !edit || !sel.value) return;
  const wi = Number(sel.dataset.wi);
  const target = sel.value === "new" ? "new" : Number(sel.value.replace(/^g:/, ""));
  edit.grouping = applyMove(edit.grouping, wi, target);
  renderEdit();
});
output.addEventListener("click", (e) => {
  if (!(e.target as HTMLElement).closest("#tic-reset") || !edit) return;
  edit.grouping = edit.autoGrouping.map((g) => [...g]);
  renderEdit();
});

// ---- Force builder + print sheet ------------------------------------------
// A persistent collection of units (source text + name) the user assembles from
// the browser / input area, rendered all at once onto a print-optimized sheet.
// Stored as SOURCE text (not converted cards) so it survives reloads and stays
// independent of any in-progress TIC edits.

interface ForceUnit { name: string; text: string; }
const FORCE_KEY = "mtf2override.force";

function loadForce(): ForceUnit[] {
  try {
    const raw = localStorage.getItem(FORCE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as ForceUnit[]) : [];
  } catch {
    return [];
  }
}
let force: ForceUnit[] = loadForce();

function saveForce(): void {
  try {
    localStorage.setItem(FORCE_KEY, JSON.stringify(force));
  } catch {
    /* storage may be unavailable (private mode / quota) — the in-memory force still works */
  }
}

function addToForce(name: string, text: string): void {
  force.push({ name: name || "Unit", text });
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
  addToForce(r.ok ? r.result.card.name : "Pasted unit", text);
}

/** Render the force list panel and toggle the Print button. */
function renderForce(): void {
  const listEl = document.getElementById("force-list");
  const countEl = document.getElementById("force-count");
  const printBtn = document.getElementById("force-print") as HTMLButtonElement | null;
  if (!listEl) return;
  if (countEl) countEl.textContent = force.length ? `(${force.length})` : "";
  if (printBtn) printBtn.disabled = force.length === 0;
  listEl.innerHTML = force.length
    ? force
        .map(
          (u, i) =>
            `<div class="force-item"><span class="force-item-name">${esc(u.name)}</span>` +
            `<button class="force-remove" type="button" data-i="${i}" title="Remove" aria-label="Remove ${esc(u.name)}">✕</button></div>`,
        )
        .join("")
    : `<p class="muted force-empty">No units yet. Add units from the browser (＋) or the input area below.</p>`;
}

// A dedicated <style> whose @page rule sets the print orientation (CSS @page
// can't be toggled by a class, so we rewrite this rule per print).
const pageStyle = document.createElement("style");
document.head.appendChild(pageStyle);

/** The selected print layout. All are PORTRAIT (the cards are taller than wide):
 * "fit" = 2×2 scaled per page, "p2" = 2 per row, "p1" = 1 per row. */
function forceMode(): "fit" | "p2" | "p1" {
  const v = (document.getElementById("force-cols") as HTMLSelectElement | null)?.value;
  return v === "p2" || v === "p1" ? v : "fit";
}

/** Convert one force unit to card HTML (or its error card). */
function forceCardHtml(u: ForceUnit): string {
  const r = convertOne(u.text, u.name);
  return r.ok ? cardHtml(r.result) : r.html;
}

/** Scale each card down to fit its fixed quarter-page cell, measured off-screen.
 * Cards are uniformly scaled (aspect preserved) so a tall card shrinks to fit
 * the cell height; cards that already fit are left at full size. */
function fitCardsToCells(area: HTMLElement): void {
  // Lay the sheet out off-screen so offset/scroll sizes are real (it is
  // display:none in normal flow); mm → px is the 96dpi CSS constant either way.
  area.style.cssText = "display:block;position:fixed;left:-10000px;top:0;";
  for (const cell of Array.from(area.querySelectorAll<HTMLElement>(".fit-cell"))) {
    const scale = cell.querySelector<HTMLElement>(".fit-scale");
    if (!scale) continue;
    const fit = Math.min(
      cell.clientWidth / (scale.scrollWidth || 1),
      cell.clientHeight / (scale.scrollHeight || 1),
    );
    if (fit < 1) scale.style.transform = `scale(${fit})`;
  }
  area.style.cssText = ""; // hand display back to the stylesheet (#print-area)
}

/** Build all force cards, swap the page to the print container, and print. */
function printForceSheet(): void {
  if (force.length === 0) return;
  const area = document.getElementById("print-area");
  if (!area) return;
  const mode = forceMode();
  pageStyle.textContent = `@page { size: portrait; margin: 10mm; }`;
  if (mode === "fit") {
    // 2×2 per page: chunk into fours, each its own page, each card fit to a cell.
    const pages: string[] = [];
    for (let i = 0; i < force.length; i += 4) {
      const cells = force
        .slice(i, i + 4)
        .map((u) => `<div class="fit-cell"><div class="fit-scale">${forceCardHtml(u)}</div></div>`)
        .join("");
      pages.push(`<div class="print-page"><div class="sheet fit2x2">${cells}</div></div>`);
    }
    area.innerHTML = pages.join("");
    fitCardsToCells(area);
  } else {
    area.innerHTML = `<div class="sheet cols-${mode === "p1" ? "1" : "2"}">${force.map(forceCardHtml).join("")}</div>`;
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
$("force-clear").addEventListener("click", () => {
  if (force.length === 0) return;
  force = [];
  saveForce();
  renderForce();
});
$("force-list").addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>(".force-remove");
  if (!btn) return;
  force.splice(Number(btn.dataset.i), 1);
  saveForce();
  renderForce();
});
renderForce();

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
