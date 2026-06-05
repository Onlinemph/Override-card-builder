/**
 * Browser entry point. The UI layer — the ONLY place that touches the DOM. It
 * imports the pure core (parser + converter) exactly as the CLI does, proving
 * the core runs unchanged in a browser. No Node/filesystem APIs here.
 */

import "./style.css";

import { convertUnit, parseMtf, ParseError } from "../core/index.js";
import type { CardWeapon, OverrideCard } from "../core/index.js";

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

function weaponRows(weapons: CardWeapon[]): string {
  if (weapons.length === 0) return `<p class="muted">No weapons.</p>`;
  const rows = weapons
    .map((w) => {
      const rear = w.rearMounted ? ' <span class="rear">(R)</span>' : "";
      const flag = w.unknown ? ' <span class="warn-flag">unknown</span>' : "";
      const r = w.range;
      const brackets = r
        ? [r.pb, r.s, r.m, r.l, r.x]
            .map((v) => `<td class="num">${esc(v === null ? "–" : v >= 0 ? `+${v}` : `${v}`)}</td>`)
            .join("")
        : `<td class="num muted" colspan="5">–</td>`;
      return `<tr>
        <td>${esc(w.name)}${rear}${flag}</td>
        <td>${esc(w.location)}</td>
        <td class="num">${esc(w.damageText)}</td>
        <td class="num muted">${esc(w.twDamage)}</td>
        ${brackets}
      </tr>`;
    })
    .join("");
  return `<table class="weapons">
    <thead><tr><th>Weapon</th><th>Loc</th><th>Dmg</th><th>TW</th><th>PB</th><th>S</th><th>M</th><th>L</th><th>X</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function stat(label: string, value: string | number): string {
  return `<div class="stat"><span class="label">${esc(label)}</span><span class="value">${esc(value)}</span></div>`;
}

function renderCard(card: OverrideCard): string {
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
    <h3>Armor</h3>
    <div class="stats">
      ${stat("Torso", card.armor.torso)}
      ${stat("Rear", card.armor.rear)}
      ${stat("Head", card.armor.head)}
      ${stat("Arms (L/R)", `${card.armor.leftArm}/${card.armor.rightArm}`)}
      ${stat("Legs (L/R)", `${card.armor.leftLeg}/${card.armor.rightLeg}`)}
    </div>
    <h3>Structure</h3>
    <div class="stats">
      ${stat("Torso", card.structure.torso)}
      ${stat("Head", card.structure.head)}
      ${stat("Arms (L/R)", `${card.structure.leftArm}/${card.structure.rightArm}`)}
      ${stat("Legs (L/R)", `${card.structure.leftLeg}/${card.structure.rightLeg}`)}
    </div>
    <h3>Heat &amp; Weapons</h3>
    <div class="stats">${stat("Heat dissipation", card.heatDissipation)}</div>
    ${weaponRows(card.weapons)}
    ${warnings}
  </article>`;
}

function renderError(file: string, message: string): string {
  return `<article class="card error">
    <h2>Could not convert ${esc(file)}</h2>
    <p>${esc(message)}</p>
  </article>`;
}

/** Convert one MTF source and return its rendered HTML (card or error). */
function convertOne(text: string, file: string): string {
  try {
    const unit = parseMtf(text, file);
    return renderCard(convertUnit(unit));
  } catch (err) {
    const message =
      err instanceof ParseError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    return renderError(file, message);
  }
}

function showResults(html: string): void {
  output.innerHTML = html || `<p class="muted">Nothing to convert.</p>`;
}

$("convert").addEventListener("click", () => {
  const text = textarea.value.trim();
  if (!text) {
    showResults(`<p class="muted">Paste or upload an .mtf first.</p>`);
    return;
  }
  showResults(convertOne(text, "pasted.mtf"));
});

$("example").addEventListener("click", () => {
  textarea.value = EXAMPLE_LOCUST;
  showResults(convertOne(EXAMPLE_LOCUST, "Locust LCT-1V.mtf"));
});

$("clear").addEventListener("click", () => {
  textarea.value = "";
  fileInput.value = "";
  output.innerHTML = "";
});

fileInput.addEventListener("change", async () => {
  const files = Array.from(fileInput.files ?? []);
  if (files.length === 0) return;
  const results = await Promise.all(
    files.map(async (f) => convertOne((await f.text()).trim(), f.name)),
  );
  // Show the first file's text in the editor for reference.
  textarea.value = await files[0]!.text();
  showResults(results.join(""));
});
