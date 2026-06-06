/**
 * Browser entry point. The UI layer — the ONLY place that touches the DOM. It
 * imports the pure core (parser + converter) exactly as the CLI does, proving
 * the core runs unchanged in a browser. No Node/filesystem APIs here.
 */

import "./style.css";

import { buildTic, convertAny, isLegalTic, ParseError } from "../core/index.js";
import type {
  AnyCard,
  BattleArmorCard,
  CardWeapon,
  MeleeProfile,
  OverrideCard,
  Tic,
} from "../core/index.js";

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

function bracketCells(range: CardWeapon["range"]): string {
  if (!range) return `<td class="num muted" colspan="5">–</td>`;
  return [range.pb, range.s, range.m, range.l, range.x]
    .map((v) => `<td class="num">${esc(v === null ? "–" : v >= 0 ? `+${v}` : `${v}`)}</td>`)
    .join("");
}

/**
 * The slice of a card the TIC editor needs: the converted weapons, their
 * initial TIC grouping, and (for 'Mechs) the auto melee row. Both `OverrideCard`
 * and `BattleArmorCard` satisfy this, so the editor is shared by both.
 */
interface TicSource {
  weapons: CardWeapon[];
  tics: Tic[];
  melee?: MeleeProfile;
}

/**
 * Interactive TIC grouping editor. Holds editable groups of weapon indices and
 * lets the user move a weapon to another TIC in the same location, or split it
 * into its own. Illegal moves (over the page-41 caps) are rejected.
 */
class TicEditor {
  private groups: number[][];
  constructor(
    private readonly host: HTMLElement,
    private readonly card: TicSource,
  ) {
    // Seed editable state from the auto-grouped TICs, as indices into card.weapons.
    const indexOf = new Map(card.weapons.map((w, i) => [w, i] as const));
    this.groups = card.tics.map((t) => t.weapons.map((w) => indexOf.get(w)!));
    this.host.addEventListener("change", (e) => this.onChange(e));
    this.render();
  }

  private weaponsOf(group: number[]): CardWeapon[] {
    return group.map((i) => this.card.weapons[i]!);
  }

  private onChange(e: Event): void {
    const sel = e.target as HTMLSelectElement;
    if (!sel.matches("select.move")) return;
    const weaponIdx = Number(sel.dataset.weapon);
    const target = sel.value; // group index, or "new"
    const fromGi = this.groups.findIndex((g) => g.includes(weaponIdx));
    if (fromGi < 0) return;

    if (target === "new") {
      this.groups[fromGi] = this.groups[fromGi]!.filter((i) => i !== weaponIdx);
      this.groups.push([weaponIdx]);
    } else {
      const toGi = Number(target);
      if (toGi === fromGi) return;
      const proposed = [...this.groups[toGi]!, weaponIdx];
      if (!isLegalTic(this.weaponsOf(proposed))) {
        const dmg = buildTic(this.weaponsOf(proposed)).damageText;
        this.flash(`Can't group: ${dmg} exceeds the TIC cap (base ≤ 5, max ≤ 14).`);
        this.render(); // revert the select
        return;
      }
      this.groups[fromGi] = this.groups[fromGi]!.filter((i) => i !== weaponIdx);
      this.groups[toGi] = proposed;
    }
    this.groups = this.groups.filter((g) => g.length > 0);
    this.render();
  }

  private flash(message: string): void {
    const note = this.host.querySelector(".tic-note");
    if (note) note.textContent = message;
  }

  private render(): void {
    const ticHtml = this.groups
      .map((group, gi) => {
        const tic = buildTic(this.weaponsOf(group));
        const rear = tic.rearMounted ? ' <span class="rear">(R)</span>' : "";
        const members = group
          .map((wi) => {
            const w = this.card.weapons[wi]!;
            // Valid move targets: other groups in the SAME location/facing, plus "new".
            const opts = this.groups
              .map((g, ti) => ({ g, ti }))
              .filter(({ g }) => {
                const f = this.card.weapons[g[0]!]!;
                return f.location === w.location && f.rearMounted === w.rearMounted;
              })
              .map(({ ti }) => `<option value="${ti}"${ti === gi ? " selected" : ""}>TIC ${ti + 1}</option>`)
              .join("");
            return `<li>${esc(w.name)}
              <select class="move" data-weapon="${wi}">${opts}<option value="new">＋ new TIC</option></select>
            </li>`;
          })
          .join("");
        return `<div class="tic">
          <div class="tic-head"><strong>TIC ${gi + 1}</strong> <span class="muted">${esc(tic.location)}${rear}</span>
            <span class="tic-dmg">${esc(tic.damageText)}</span></div>
          <table class="tic-range"><tr><th>PB</th><th>S</th><th>M</th><th>L</th><th>X</th></tr><tr>${bracketCells(tic.range)}</tr></table>
          <ul class="tic-weapons">${members}</ul>
        </div>`;
      })
      .join("");
    const melee = this.card.melee;
    const meleeRow = melee
      ? `<div class="melee-row"><strong>Punch / Kick</strong> <span class="tic-dmg">${esc(melee.punch)} / ${esc(melee.kick)}</span></div>`
      : "";
    this.host.innerHTML = `
      <div class="tics">${ticHtml}</div>
      ${meleeRow}
      <p class="tic-note muted">Move a weapon to another TIC in the same location, or split it into its own. Illegal groups are rejected.</p>`;
  }
}

function stat(label: string, value: string | number): string {
  return `<div class="stat"><span class="label">${esc(label)}</span><span class="value">${esc(value)}</span></div>`;
}

/** A row of damage pips (one per armor/structure point). */
function pips(n: number, cls: string): string {
  return `<div class="pips">${`<i class="pip ${cls}"></i>`.repeat(Math.max(0, n))}</div>`;
}

/** One location box in the paper doll: armor (+rear) pips over structure pips. */
function dollLoc(cls: string, label: string, armor: number, structure: number, rear?: number): string {
  const rearTxt = rear !== undefined ? ` <span class="muted">/ ${esc(rear)}r</span>` : "";
  const rearPips = rear !== undefined ? pips(rear, "rear") : "";
  return `<div class="loc ${cls}">
    <div class="loc-name">${esc(label)}</div>
    <div class="loc-val">${esc(armor)}${rearTxt}</div>
    ${pips(armor, "armor")}${rearPips}
    <div class="loc-struct">IS ${esc(structure)}</div>${pips(structure, "struct")}
  </div>`;
}

/**
 * Paper-doll armor/structure diagram — a schematic humanoid laid out with CSS
 * grid (mech's right on the viewer's left, as on a record sheet). Armor pips
 * are filled, rear pips tinted, structure pips outlined.
 */
function paperDoll(card: OverrideCard): string {
  const a = card.armor;
  const s = card.structure;
  return `<div class="doll">
    ${dollLoc("hd", "HD", a.head, s.head)}
    ${dollLoc("ct", "Torso", a.torso, s.torso, a.rear)}
    ${dollLoc("ra", "RA", a.rightArm, s.rightArm)}
    ${dollLoc("la", "LA", a.leftArm, s.leftArm)}
    ${dollLoc("rl", "RL", a.rightLeg, s.rightLeg)}
    ${dollLoc("ll", "LL", a.leftLeg, s.leftLeg)}
  </div>
  <p class="doll-legend muted"><i class="pip armor"></i> armor &nbsp; <i class="pip rear"></i> rear &nbsp; <i class="pip struct"></i> structure</p>`;
}

/** Static (non-TIC) card HTML, with a placeholder div the TIC editor mounts into. */
function cardShell(card: OverrideCard, idx: number): string {
  const warnings = card.warnings.length
    ? `<ul class="warnings">${card.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`
    : "";
  return `<article class="card">
    <h2>${esc(card.name)} <small>${esc(card.mass)}t ${esc(card.techBase)}</small></h2>
    <div class="stats">
      ${stat("Move", card.move)}
      ${stat("TMM", card.tmm)}
      ${stat("TMM (sprint)", card.tmmSprint)}
      ${stat("TMM (jump)", card.tmmJump)}
    </div>
    <h3>Armor &amp; Structure</h3>
    ${paperDoll(card)}
    <h3>Heat &amp; TICs</h3>
    <div class="stats">${stat("Heat dissipation", card.heatDissipation)}</div>
    <div class="tic-editor" data-card="${idx}"></div>
    ${equipmentSection(card)}
    ${warnings}
  </article>`;
}

/**
 * Equipment list. `showLoc` prints each item's location (meaningful for 'Mechs;
 * suppressed for Battle Armor, whose gear is squad-wide and uses a synthetic
 * location internally).
 */
function equipmentSection(card: { equipment: OverrideCard["equipment"] }, showLoc = true): string {
  if (card.equipment.length === 0) return "";
  const items = card.equipment
    .map((e) => {
      const qty = e.count > 1 ? ` <span class="muted">×${e.count}</span>` : "";
      const cls = e.category === "ammo" ? "equip ammo" : "equip";
      const loc = showLoc ? `<span class="equip-loc">${esc(e.location)}</span>` : "";
      return `<li class="${cls}"><span class="equip-name">${esc(e.label)}</span>${loc}${qty}</li>`;
    })
    .join("");
  return `<h3>Equipment</h3><ul class="equipment">${items}</ul>`;
}

/**
 * Squad firepower table: weapons across the top, surviving troopers down the
 * side (full squad first), each cell the damage that many suits deal. This
 * mirrors the printed Override Battle Armor card — BA does not group into TICs,
 * it simply sums each trooper's contribution, so damage falls as suits die.
 */
function firepowerTable(card: BattleArmorCard): string {
  if (card.firepower.length === 0) {
    return `<p class="muted">No squad weapons.</p>`;
  }
  const heads = card.firepower
    .map((w) => {
      const flag = w.unknown ? ' <span class="warn-flag">[?]</span>' : "";
      const range = w.rangeText
        ? `<div class="ba-range muted">${esc(w.rangeText)}</div>`
        : "";
      return `<th>${esc(w.label)}${flag}${range}</th>`;
    })
    .join("");
  // Rows from full squad down to a lone survivor, like the printed card.
  const rows: string[] = [];
  for (let n = card.troopers; n >= 1; n--) {
    const cells = card.firepower
      .map((w) => `<td class="num">${esc(w.byTrooper[n - 1] ?? "–")}</td>`)
      .join("");
    rows.push(`<tr>
      <th class="ba-count"><span class="ba-n">${esc(n)}</span>${pips(card.armor, "armor")}</th>
      ${cells}
    </tr>`);
  }
  return `<table class="ba-firepower">
    <thead><tr><th class="ba-corner">Troopers</th>${heads}</tr></thead>
    <tbody>${rows.join("")}</tbody>
  </table>
  <p class="muted ba-legend"><i class="pip armor"></i> armor / trooper &nbsp; damage shown by surviving suits</p>`;
}

/** Static Battle Armor card HTML. BA prints a per-trooper firepower table, not TICs. */
function baCardShell(card: BattleArmorCard): string {
  const warnings = card.warnings.length
    ? `<ul class="warnings">${card.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>`
    : "";
  return `<article class="card">
    <h2>${esc(card.name)} <small>Battle Armor · ${esc(card.weightClass)} · ${esc(card.techBase)}</small></h2>
    <div class="stats">
      ${stat("Troopers", card.troopers)}
      ${stat("Move", card.move)}
      ${stat("TMM", card.tmm)}
      ${stat("TMM (jump)", card.tmmJump)}
    </div>
    <h3>Armor</h3>
    <div class="stats">
      ${stat("Armor / trooper", card.armor)}
      ${stat("Anti-’Mech", card.antiMech ? "Yes" : "No")}
    </div>
    <p class="muted">Armor &amp; TMM mirror the ’Mech rules (best-effort) — validate against the DFA generator.</p>
    <h3>Troopers &amp; Weapons <small class="muted">(squad firepower)</small></h3>
    ${firepowerTable(card)}
    ${equipmentSection(card, false)}
    ${warnings}
  </article>`;
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
function cardHtml(result: AnyCard, idx: number): string {
  return result.kind === "battlearmor"
    ? baCardShell(result.card)
    : cardShell(result.card, idx);
}

/** Render results and mount an interactive TIC editor into each successful card. */
function showResults(results: ConvertResult[]): void {
  if (results.length === 0) {
    output.innerHTML = `<p class="muted">Nothing to convert.</p>`;
    return;
  }
  output.innerHTML = results
    .map((r, i) => (r.ok ? cardHtml(r.result, i) : r.html))
    .join("");
  results.forEach((r, i) => {
    if (!r.ok) return;
    const host = output.querySelector<HTMLElement>(`.tic-editor[data-card="${i}"]`);
    if (host) new TicEditor(host, r.result.card);
  });
}

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

// Build stamp — lets you confirm at a glance whether you're on the latest deploy.
const buildEl = document.getElementById("build");
if (buildEl) buildEl.textContent = `build ${__BUILD_TIME__}`;
