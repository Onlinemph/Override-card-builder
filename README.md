# mtf2override

Convert MegaMek `.mtf` BattleMech files into **BattleTech: Override** record-card
stats. TypeScript, ESM, Node runtime (`tsx` for dev, `vitest` for tests).

## Architecture

Three cleanly separated layers — the separation is the point:

```
src/core/      Pure functions. ZERO Node/browser/filesystem dependencies.
  types.ts       The Unit + OverrideCard domain types (the layer contract).
  parser.ts      mtf text -> typed Unit.
  convert.ts     Unit -> OverrideCard (the conversion math).
  constants.ts   Every magic number, each citing the rule it implements.
  index.ts       Barrel export (safe to import in Node OR a browser bundle).

src/cli/       Node CLI wrapper. The ONLY layer that touches the filesystem.
tests/         Vitest unit tests + .mtf fixtures.
```

`core` must run unchanged in both Node and a browser (a web UI is a likely
phase two). The **parser is fully decoupled from the conversion math**: the
parser knows nothing about Override scoring, and the converter knows nothing
about MTF text. Either can be swapped or extended independently.

## Install & build

```bash
npm install
npm run build       # tsc -> dist/
npm test            # vitest
npm run typecheck   # tsc --noEmit
```

## CLI usage

```bash
# Dev (no build step):
npx tsx src/cli/index.ts <file-or-dir> [more ...] [options]

# After build:
node dist/cli/index.js <file-or-dir> [more ...] [options]
```

Accepts one or more `.mtf` files **or** directories (scanned for `*.mtf`).

| Option | Effect |
|---|---|
| `--out <dir>` | Output directory for per-unit JSON (default: current dir) |
| `--csv` | Also write a flat CSV of all units (`override-cards.csv`) |
| `--no-json` | Skip per-unit JSON output (summary/CSV only) |
| `-h`, `--help` | Show help |

For each unit the CLI writes one `<Chassis>_<Model>.override.json` and prints a
readable summary to stdout. `--csv` adds one flat CSV row per unit.

## Web UI (GitHub Pages)

A browser UI lives in `src/web/` (plus `index.html`). It imports the **same pure
core** as the CLI — paste or upload a `.mtf` and it renders the Override card
entirely client-side. No server, no Node.

```bash
npm run dev:web       # Vite dev server with live reload
npm run build:web     # static build -> dist-web/
npm run preview:web   # serve the production build locally
```

### Deploying to GitHub Pages

`.github/workflows/deploy-pages.yml` builds `dist-web/` and publishes it on every
push to `main` (and `claude/**` branches, for previewing). **One-time setup you
must do in the repo:** Settings → Pages → *Build and deployment* → **Source:
GitHub Actions**. After that, the site publishes automatically; the deploy job
prints the URL (typically `https://<user>.github.io/<repo>/`). The Vite `base`
is `"./"`, so the build works under the Pages project subpath without
hard-coding the repo name.

## Conversion rules (implemented in `convert.ts` / `constants.ts`)

| Field | Formula | Rounding |
|---|---|---|
| Weapon damage | sum of TW damage in a group ÷ 3 | **up** |
| 'Mech torso armor | (CT + LT + RT) ÷ 6 | nearest |
| 'Mech rear armor | (CTr + LTr + RTr) ÷ 6 | nearest |
| Head armor | bracket on head TW: 0–2→1, 3–5→2, 6–7→3, 8–9→4, cap 5 | lookup |
| Arms/legs armor | TW ÷ 3, min 1 | nearest |
| Non-'Mech armor (stub) | location ÷ 4 | nearest |
| Structure / section | IS ÷ 3, min 1 — per section (torso from CT, head, arms, legs) | nearest |
| Heat dissipation | total dissipated/round ÷ 5 (doubles dissipate 2 each) | nearest |

Rounding is **per field** — `roundUp()` for damage, `roundNearest()` for
armor/structure/heat. Do not assume a single rounding mode.

### Movement & TMM

Override uses Classic movement directly at 1:1 board scale (1 hex = 1 inch), so a
5/8 'Mech has walk move 5, run move 8 — carried straight over, no inch
recalculation. `(J)` is appended to the move when jump MP > 0.

**TMM is a bracket lookup keyed on RUN MP** (the second movement number — not
walk, not a derived inch band). Sprint and jump each add +1 to base TMM; these
are exposed on the card (`tmmSprint`, `tmmJump`) but the card prints **base TMM**.

### Internal structure note

MTF files do **not** contain internal-structure values. The parser derives them
from the standard TechManual internal-structure-by-tonnage table
(`INTERNAL_STRUCTURE_BY_TONNAGE` in `constants.ts`), keyed on mass. A
non-standard tonnage fails loudly. The card then reports structure **per
section** (torso from CT, head, each arm, each leg), each = roundNearest(IS ÷ 3)
with a minimum of 1.

The official builder's **torso** structure does not track `CT_internal ÷ 3`
exactly at every weight, so `TORSO_STRUCTURE_BY_TONNAGE` in `constants.ts` holds
per-tonnage corrections that take precedence over the formula (verified so far:
50t → 6). Add a row there whenever a verified builder value differs.

## Validation method — the DFA oracle

**The DFA Override Card Generator is the ground-truth oracle.** To validate
this tool, convert a unit there and **diff its card against this tool's output**.
Mismatches almost always point to one of two things:

1. a **weapon-table** gap or wrong TW value (`WEAPON_DAMAGE` in `constants.ts`), or
2. a **rounding** error (wrong `roundUp` vs `roundNearest` for that field).

`WEAPON_DAMAGE` is a separate, easily-extended export — add a row (with a rule
citation) when you hit an unknown weapon. Unknown weapons do not crash; they
convert to damage 0 and produce a warning on the card. Weapons whose TW damage
differs by tech base (ER lasers, pulse lasers, ER PPC) keep the Inner Sphere /
shared value in `WEAPON_DAMAGE` and Clan overrides in `WEAPON_DAMAGE_CLAN`;
`lookupWeaponDamage(name, techBase)` picks the right one. Variable-damage weapons
(ATM, MML, HAG, Rotary/Ultra bursts) are intentionally left out pending the
range-bracket work, so they surface as warnings rather than wrong numbers.

> ⚠️ **TMM bands for run ≥ 13 are INFERRED** (from Alpha Strike CE) and
> UNVERIFIED. Confirm them against a fast light 'Mech (e.g. a 8/12+ scout) on a
> DFA card before relying on them. Verified bands: run 3→0, 6→1, 8→2, 9→2, 11→3.

## v1 scope

One weapon per TIC. The following are left as clearly-marked `TODO` hooks in
`convert.ts` and are **not** implemented yet:

- TIC grouping (summing multiple weapons into one TIC before ÷3)
- page-43 range-bracket modifiers
- M/C dice

## Tests

Seeded with **Locust LCT-1V**, **Hunchback HBK-4G**, and **Atlas AS7-D**
(fixtures in `tests/fixtures/`), asserting converted values including TMM
(Atlas 3/5 → run 5 → TMM 1). Expected values are first-pass hand-computations
to be cross-checked against DFA cards.
