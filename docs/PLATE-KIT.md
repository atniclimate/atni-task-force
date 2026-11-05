# Plate kit: how to use it (11/04/2026)

Parts: `site/assets/js/plate-svg.js` (SVG marks) then `plate.js` (everything else), the Plate kit block in `site.css`, `scripts/build_plates.py`. Builders do not edit these.
Working examples: `work/site-refresh/tmp/plate-demo/` (14 plates, one page script). Rough definitions of 20 of the 21 planned plates (all but `dc-iea-world`, the same form as `dc-lbnl-us`), which already build on the real claims: `work/site-refresh/tmp/kit-proof/*.json` (placeholder wording and some claim choices; copy and correct against the architecture).

## A page
```html
<link rel="stylesheet" href="../assets/css/site.css"> <link rel="stylesheet" href="../assets/css/dc.css">  <!-- page CSS (dc.css, ai.css, ru.css) is the builder's, after site.css -->
<script defer src="../assets/js/plate-svg.js"></script><script defer src="../assets/js/plate.js"></script><script defer src="../assets/js/data-centers.js"></script>
<nav class="section-strip" data-workbench aria-label="Sections"><div class="wrap"><ul><li><a href="#jobs">Jobs</a></li></ul></div></nav>
<section id="jobs" class="section panel"><div class="wrap"><h2 class="panel-title">Jobs</h2> <!-- plate:dc-jobs-per-mw --><!-- /plate:dc-jobs-per-mw --> <div class="disclosure-grid"><details class="disclosure">...</details></div></div></section>
```
Links become tabs: arrows, Home, End, hash deep links (a hash inside a panel opens it). `.panel` keeps the base ground and tight padding, so the plate rises. The first plate on the screen runs to the window's foot by itself; others take 72vh, or fill the window with `"fit": true`. Below 1100px the zones stack.
Build: `python scripts/build_plates.py --page data-centers/index.html` writes only that page and ignores other builders' plates mid-edit. Never edit between markers. Check: `python scripts/validate_public.py`.
Zones, built for you: `.plate-claim` (eyebrow, title, subtitle, text, controls, legend, foot), `.plate-plot` (one focus stop), `.plate-detail` (Reading, Sources, Table; readout, Reading, setting line, facts, receipts, Copy, Reset). A wide Table view widens its zone. No scripts: all views show, the plate has no fixed height, the setting line names the default.

## Plate file: `site/data/plates/ID.json`
| Key | Means |
|---|---|
| `schema`, `tier`, `id`, `page` | `1`, `"T0"`, the file name (not a tab panel's id), the page path under `site/` |
| `title` (required), `subtitle`, `text` (list), `eyebrow` | Title is the finding at the default setting. Digits only through placeholders (below) |
| `plot.type` | `ladder`, `bars`, `lines`, `multiples`, `instrument`, `matrix` |
| `plot.scale`, `plot.domain`, `plot.units` | `log` (rulers with squares only) or `linear`; a domain that would clip fails; `units` renames, `{"Wh/hour": "Wh"}`, never converts |
| `plot.highlight`, `plot.highlight_by` | The lead series, or a segmented control whose stop values are series names |
| `plot.projected_from`, `plot.projected` | Year the dashes start (lines); every mark a projection (rulers: hollow, dashed range, a dashed cap on bars) |
| `plot.signed`, `plot.axis_label` | Print + on positives; a caption over a ruler with no group label |
| `rows`, `controls`, `by` | Below. `by` names a segmented control whose stops switch a row's numbers (not for bars, instrument, matrix) |
| `default`, `fit` | Selected key (default: first row, or the lead series' latest year); `true` makes a plate further down fill the window |
| `boundary`, `reading`, `reading_group`, `tail` | Short boundary sentence; template per row; one template per key (below); a sentence after them |
| `inputs`, `model`, `fields` | Named numbers and per-row formulas (below). `model` names a file in `site/data/`, here `comparison-model` |
| `also`, `details`, `cites`, `limits`, `foot`, `more`, `not_counted`, `gap` | Figures beside the plot; plain sentences in the detail, always; extra receipts; `{"fp-022": "public sentence"}` for a cited partly claim; `[{"text", "href", "link"}]`; More-assumptions summary; words for a row off at a stop; words for a missing group value |
| `table` | Below. Default columns are Row, Setting, Value, Year, Source |

**Controls.** Names are unique on a page and appear in the address. `{"type": "segmented", "name", "label", "default", "options": [{"value", "label", "is": "input-or-control-name"}]}` (a toggle is two stops; `is` makes a stop stand for that number in formulas, and a stop with none is then blank, so a row prints its `gap`). `{"type": "range", "name", "label", "min", "max", "step", "default", "presets": [2.52, 10]}` (range and typed twin; presets may sit off the step). `{"type": "number", "name", "label", "min", "max", "step"}` (typed alone; no default means blank). `"more": true` puts a control in the More assumptions disclosure.

**Rows, any kind.** Every number comes from a claim, a model, or a formula; a row with no claim fails. Optional: `cites` (more claim ids, all receipts show), `note` ("Assumption: ..."), `equation` ("Equation: ..."), `detail` (a plain sentence when selected), `boundary`, `modeled` (hollow; default: source kind `model`, and every formula row), `gap` (words for a claim with no number; default "No public measurement"), `range: false` (drop a claim's low and high when they are not its range), `range_from: "id"` (take them from another claim, cited), `negate: true` (a shortfall of 19 reads -19), `convert: {"times": 3.78541, "to": "megaliters"}` plus optional `digits` (fails unless the claim's `derived` holds the arithmetic), `also: [...]` (shown when this row is selected), `tag`, `cols: {"overhead": "GPU only"}` (words for a table column). **A partly claim needs `limit`** (on the row, on the claim, or in the plate's `limits`), one public sentence, or the build fails. It reaches the receipt and Sources, and the Reading for a row's main claim.

## The kinds
**`ladder`**: rows with one mark on a shared ruler, as an HTML list; CSS places the marks, so it needs no redraw and prints as is. `{"id": "kebab", "label": "...", "claim": "fp-001"}`, or `"claims": {"stop": "id" or null}` with `by` (null prints `not_counted`). Options on `plot`:
- `groups: [{"id": "use", "label": "Basis stated here", "domain": [0, 1.5], "mark": "bar"}, {"id": "draw", "label": "..."}]` plus `"group": "use"` on rows: **two rulers in one plate**, own axis and unit each; `mark` is `square` or `bar`; keys cross them.
- `count: {"unit": "input-name", "noun": "text prompt", "nouns": "text prompts", "cap": 200}`: **Count view**, adds its own Ruler | Count control; one square per unit up to the cap, remainder printed. Scripts only; the table holds the numbers.
- `marks: [{"id", "label", "claim": "id"} or {"id", "label", "value": "formula", "unit": "Wh", "low", "high", "when": {"control": "stop"}, "group": "id"}]`: labeled ticks (yardstick, baseline); `when` shows one per stop.
- `sort: "control"`: a segmented control with stops `value` (biggest first) and `tag` (tagged rows together) reorders rows and keys.
- **Dumbbell**: `{"id", "label", "pair": [{"id": "capex", "name": "Capital spending", "claim": "fin-003", "points": "series_fiscal_year_ends"}, {"id": "cash", "name": "...", ...}]}` with `by` on a control whose stop values are years or `latest`. Legend and both values are automatic.

**`bars`**: a ladder whose marks are bars from zero: same rows, `groups`, `marks`, `sort`. Negatives make it diverging (slot 1 and 2, neutral zero); add `signed`. No `by`, no needle, no log. A `group` on a ladder may also be `"mark": "bar"`.

**`lines`**: `{"series": "Google", "claim": "rs-001", "points": "series"}`; `points` names a claim field holding `{year: value}` (resources) or a list of periods with `end` and one number (`series_fiscal_year_ends`, which also gives `{end}`). No `points`: one point at the claim's `year`, or `"x": 2027`. A range-only claim draws a range line; `"dx": 10` shifts it aside. Selection is the year; the needle snaps; facts list every series. A one-point series always shows its square.
- `band`: `{"low": "series", "high": "series"}`, `{"across": "series"}` (lowest to highest at each year), or `{"across": "range"}` (each point's own low and high), plus `"band_label"`. A 10 percent wash, dashed edges past `projected_from`. Templates get `{band_low}`, `{band_high}`.

**`multiples`**: as lines, one cell per series on one axis. With `panels: [{"id": "capex", "label": "Capital spending"}]` and `"panel": "capex"` on rows: one cell per panel, each with **its own axis and unit**; `axis: "shared"` to share. With `highlight_by` the facts, receipts, and label follow the picked company. `select: "point"` (rows then need `id`) makes every point its own selection, for forecast vintages: no needle, squares always on.

**`instrument`**: `plot: {"type": "instrument", "groups": [{"id": "ctx", "label": "Context, fixed"}]}`. Output rows are ruled rows, a large figure on a thin ruler running to what the formula reaches at the settings' maximum (or `"domain": [0, 40]`):
```json
{"id": "twh", "label": "Energy a year", "unit": "TWh", "digits": 2, "formula": {"value": "amw * 8.76 / 1000"}, "equation": "TWh = aMW x 8.76 / 1000"}
{"id": "site", "label": "Site water", "unit": "million liters", "formula": {"low": "twh * ifblank(own, ms) * 1000", "high": "twh * ifblank(own, lbnl) * 1000"}}
{"id": "plant", "label": "Water at the plant", "unit": "million liters", "formula": {"value": "twh * gen * 1000"}, "show": {"count_plant": "on"}, "gap": "Off: the convention is unstated"}
```
Fixed rows below a `"group": "ctx"`: `{"id", "label", "claim"}`, `{"id", "label", "figures": [{"claim": "jb-073", "name": "permanent jobs"}]}`, or a sparkline `{"id", "label", "spark": ["jb-041", "jb-042"]}` (claim ids, or `"claim"` with a series field name). The plate's `reading` serves formula rows; fixed rows keep a row's own sentence.

**`matrix`**: `plot: {"type": "matrix", "columns": [{"id": "national", "label": "National scale"}, {"id": "open", "label": "Open question"}]}`, `default: "water--national"`. `{"id": "water", "label": "Water", "cells": {"national": [{"claim": "tr-001", "say": "about {display} on site", "modeled": true}], "open": "Watershed and season"}}`. A list holds figures with evidence squares; a string is words. Keys are `row--column`. Arrows move in two dimensions. Sentences get `{column}`; `reading_words` is the word-cell template.

## Numbers in sentences and formulas
**Templates** (`title`, `subtitle`, `text`, `tail`, `reading`, `foot`, `say`): `{label} {series} {panel} {column} {display} {text} {unit} {value} {low} {high} {year} {end} {boundary} {evidence} {source} {published} {limit}`, from the default row outside `reading`. Any row by id `{amw[text]}`; any claim `{c[dem-058][display]}`, `{c[dem-001][series][2030]:.0f}`, `{c[dem-073][value]:,.0f}` (joins the receipts); an input `{region}` or model branch `{now[chat][total]:.1f}`; a setting `{mw}` (a segmented stop prints its label); a field `{share}`. Python format specs work. In `reading`, these stay live and refill when a setting moves.
A typed digit fails the build, so a number on the page always comes from a claim. Allowed: years, MM/YYYY and MM/DD/YYYY dates, `#2026-039`, `Scope 2`, names glued to digits (`CO2`, `GPT-5`, `FY2026`, `AEO2026`). Spell small words ("ten text prompts"). Row labels, notes, equations, marks, and limits are exempt.
**`reading_group`**: one sentence per key instead of one per row, with `{capex}` for each panel id or pair member id (its `text`, or the plate's `gap`), plus the first row's fields: `"{series}, fiscal {year} (ends {end}): capex {capex}, cash {cash}, USD billion."`
**`inputs`**: `{"region": {"claim": "dem-058"}, "lo": {"claim": "jb-023", "field": "low"}, "now": {"model": "computed_defaults.same_hour.default"}}`. A model branch arrives as numbers only, prose dropped. Claim inputs cite themselves on any row that reads them; model branches do not, so list the claims in `cites`.
**`formula`**: numbers, names (dots reach into a branch), `+ - * / ( )`, `min`, `max`, `ifblank(a, b)`. A blank gives a blank. Names: inputs, controls, earlier rows by id (`amw`, `site_low`, `site_high`; such ids need no dash). `digits` is significant figures, default 3. Build and browser run the same grammar, so the default is static and every setting is live, including live table cells. With `by`: `"formula": {"dc": {"value": "..."}, "whole": {...}, "adds": null}`. `"show": {"control": "stop"}` turns a row off at other stops. `"segments": [{"label": "Network", "value": "now.chat.network", "modeled": true, "word": "modeled"}]` draws the thin segmented bar in the detail, each part marked measured or modeled, or by its `word`.
**`fields`**: `{"share": {"formula": "value / region * 100", "digits": 2}}`, per row, also over `value`, `low`, `high`, for sentences and table columns; they make the Reading live.
**`also`**: `[{"claim": "dem-016", "label": "Server share of commercial sales", "say": "about {display}"}]`, printed in the detail with its receipt and in the Table view.
**`table`**: `{"columns": [{"label": "Wh", "field": "display"}]}`; fields: `label series panel column setting value low high text display unit year end source boundary claims`, a `fields` name, or a `cols` name. Or a pivot: `{"by": ["series", "year", "end"], "across": "panel", "labels": {"series": "Company"}}` (one row per group, one column per panel or series, claims last).

## On a page, outside a plate
Bench row: `<!-- bench:ai-same-hour --><!-- /bench:ai-same-hour -->` fills with that plate's default Reading, its figure on a thin ruler, and a link, from any page. Its plate must have a definition; it needs no `--page` of its own.
Claim figure in prose, hero, or Key Facts: `<span data-pour="dem-058">x</span>` fills with the claim's display at build. `data-field`: `display`, `text`, `unit`, `year`, `limit`, `source` (on an `<a>` also sets the href). A partly claim also needs `<span data-pour="dem-067" data-field="limit">x</span>` on the page, or the build fails. Pull figure: `<aside class="pull"><span class="pull-value" data-pour="dem-067" data-field="text">x</span> <span class="pull-unit" data-pour="dem-067" data-field="unit">x</span><span class="pull-label">Average rate change, PGE's territory</span><a class="receipt" data-pour="dem-067" data-field="source" href="#">x</a></aside>`.

## Page script
`plate.register(id, {render, defaults})`. `defaults` overrides a control's default (bad values throw). `render(ctx)` runs on load, setting, resize, and selection, instead of the kit's drawing. Most plates need none.
`ctx.inputs` (write model results here, then call `ctx.auto()`: formula rows, marks, fields, and the Reading follow), `ctx.auto()`, `ctx.reason` (`init`, `state`, `size`, `select`), `ctx.state`, `ctx.data`, `ctx.plot`, `ctx.key`, `ctx.rows`, `ctx.reading(text)`, `ctx.readout(value, unit)`, `ctx.fact(text)`, `ctx.segments([{label, value, hollow}])`, `ctx.setRow(key, {frac, lo, hi, text})` (places a row by hand; `ctx.frac(value, group)`). The model's own shape stays intact:
```js
plate.register('ai-same-hour', { render(ctx) { ctx.inputs.now = compute(ctx.state, ctx.inputs.m, ctx.inputs.a); ctx.auto(); } }); // "now" is an input; rows read now.chat.total
```
`plate.draw` for a custom plot: `frame(plot, minHeight)` gives `{g, W, H}`; `inner(g, W, H, {top, right, bottom, left})`; `scale('linear'|'log', domain, range)`; `axes`, `chart`, `lines`, `multiples`, `add(parent, tag, attrs)` (`text` sets textContent), `fmt(n)`. Draw only when `ctx.reason !== 'select'` and `ctx.plot.clientWidth` is not 0. Selectable marks carry `data-row="key"`.

## Added after the first visual critique (11/04/2026)
- Value cells: `15 (9.28 to 24) Wh` prints as `.ladder-num`, `.ladder-unit`, and `.ladder-tag`, same words. A row with no mark gets `.is-gap`.
- Detail: notes go in `details.plate-more` ("How this is modeled", or "About this figure" for a reported row); chips show the selected row's and its `also` receipts, the first six, then a button to Sources. A page script can still set `ctx.data.cites`.
- `.plate.is-short`: set when the detail still fits at the narrow width; a Table view keeps its own columns.
- Instrument rows take `"scale": "log"` with a `"domain"`; say so in the subtitle. A row hidden by a page script is skipped by the arrow keys.
- A page script may move rows out of the plot (`moveRecord` in `data-centers.js`): they keep selection; give the plot `aria-owns`.
- Multiples name every line at its end when a company is picked and a cell is over 240px wide; `spread` keeps names apart.
- Matrix bars draw only where a cell's figures share a unit.
- Rail pages: `.disclosure-grid.rail-details` holds `<details class="disclosure"><summary><h3>Title</h3><span>A full sentence.</span></summary><div class="rail-body">...</div></details>`. `theme.js` opens a closed disclosure for a deep link on every page.

## Added after the second visual critique (11/04/2026)
- `plot.fold: true`: rows with nothing at the current stop of `by` hide in both views and fold into one line (`.plate-fold`); a selected row that folds gives the selection back to the default row. No-JS keeps the rows.
- Count: the kit sizes the squares (largest at which every row fits, rows of 25). A row past `cap` draws none and prints "Too large to draw: N fields of cap squares." `plate.register(id, {countParts(r, unit, inputs, state)})` may split a row's squares: return `[{cls, hollow, n}, {gap: true}, ...]`, or null for the plain row.
- Segments: `"at": ["stop", ...]` on a segment limits it to those stops of `by`, so the bar and list add up to the readout. Build and browser filter the same way. `ctx.segments` is gone.
- Receipts: a row's first claim opens in the detail on load, on selection, and on a setting change; Escape or the chip closes it. `.is-short` is measured without the receipt.
- Chips: one per `short` publisher with a count; a chip for several claims opens Sources. Followers stay unhidden with `.is-extra`, so `.receipt:not([hidden])` still lists the selection's claims.
- `reading_for: {"Series": "template"}` gives one series its own `reading_group` sentence; a row's `cites` then gives its receipt.
- `ctx.setRow(key, {off: true, text})`: a figure the ruler cannot hold, in words, with no mark and no `.is-gap`.
- A page script may change a one-ruler plate's axis: assign `scale` and `domain` on `ctx.data.plot`, call `ctx.auto()` again, place non-formula rows with `ctx.setRow`, and rebuild `.ladder-grid` and `.ladder-axis` (`setRuler` in `ai.js`).
- Script and page budgets live in one place, `tests/budgets.json`. They warn near and over the number and never fail a test.

## Keyboard, screen readers, print, and the clipped zones (11/04/2026)
**The plot is a list box, or a grid when it is a matrix.** A plot is one Tab stop holding a set of choices of which exactly one is selected, and picking one changes the detail beside it. That is a single-select list box with selection following focus, and a two-axis matrix is the same thing as a grid. The alternative, a row of buttons, was rejected: it would put 12 to 25 Tab stops inside each plate on a page with up to 11 plates, and a button does not say which one is selected.
- Roles: `listbox` with `option`, or `grid` with `row`, `rowheader`, `columnheader`, and `gridcell`. Focus stays on the plot and `aria-activedescendant` names the selected row or cell, because a row of a drawn plot is an SVG group that cannot hold focus well, and the ladder and the drawn plots should behave alike. Ruler captions become `group` labels, so with two rulers the ruler's name is said on the way into its rows.
- Keys on a list box: Right or Down is next, Left or Up is previous, Home and End are the ends, and it stops at both ends. Both axes work so a reader never has to know which way a plot runs; `aria-orientation` is `horizontal` on `lines` and `multiples`, where years run across. Keys on a grid: arrows move one cell and stop at the edges without wrapping, Home and End go to the ends of the row, Ctrl+Home and Ctrl+End to the corners. On both: Enter or Space brings the Reading view forward; Escape closes the receipt, then restores the default; Alt, Ctrl, and Meta combinations stay the browser's. The selected row scrolls into view, since focus does not move.
- What is said: an HTML row's name is its own text. A drawn band has no words, so `plate.js` names it with the Reading for that key; other cells of small multiples drawing the same key are `aria-hidden`, so one option stands for all of them. `plate.js` also sets `role="none"` on every SVG group between the `svg` and a band, a page script's drawing included: Chrome exposes an option under a plain `g` as a `group`, which keeps its name and loses its selection. `scripts/a11y_check.js` reads the browser's accessibility tree to hold this. After a pause the `output` region speaks the Reading, except when focus is on a drawn plot, whose band has just said it.
- Tabs: `tablist`, `tab`, `tabpanel`, with roving `tabindex`. The anchors stay anchors, so with no script the strip is a jump list. A hidden panel is `display: none`, so nothing in it takes focus. Enter arrives as the link's own click and Space is handled once, on keydown.

**Why text meets the bottom of a zone.** `.plate.is-live` has a fixed height (`--plate-h` runs the first plate to the window's foot) on one `minmax(0, 1fr)` row, so a claim or detail longer than the plate scrolls inside it. That bargain keeps the plot on one screen and stays. The fault was that the cut showed nothing and the claim could not be reached: its text sat past its controls, and Tab through controls cannot scroll to text. Now a zone with more below carries `.has-more` and fades at its foot, the scrollbar is a thin visible one, a claim that overflows becomes a named keyboard stop (the detail always is one), and a new selection returns the detail to its top, where the changed Reading is. A plate that must show everything uses `height: auto; min-height: var(--plate-h)` on its own id, as `#dc-tradeoff-matrix` does.

**Print and motion.** The plate grid sits under `@media screen`, so print always stacks and no fixed height or scroller can clip it. Print shows every panel, every view, every table, and every disclosure's body, and `.plate-fold` prints; controls, chips, and the More assumptions settings stay off the paper on purpose, since the setting line states what is shown. Under reduced motion every transition and animation goes to 0ms, including the `is-entering` fade.

**Checks.** `node scripts/a11y_check.js --out FOLDER` runs axe-core on each tab panel in both themes with disclosures open and each plate's Sources and Table views shown, and exits 1 on a serious or critical issue. `node scripts/page_check.js --page plate` holds the keys, the names, and every Energy orange pairing's contrast without a browser.

## What the real data needs (found building the proof set)
- `ai-same-hour`: the plan's 0.1 floor clips video's low at the data center (0.0595); use `"domain": [0.01, 100000]`. fp-135 is in W: `"units": {"Wh/hour": "Wh", "W": "Wh"}` on a one-hour row. fp-094 is unverified, so it cannot be cited; print "unsourced" in the label.
- `ai-company-footprint`: `convert` the odd units (`rs-072` kWh, `rs-013` and `rs-060` million gallons, `rs-067` and `rs-073` cubic meters, `rs-051` billion liters). A claim with no `series` takes no `points`. `rs-076` (Amazon electricity) does not ship: use `gap` words in the facts, not a row. Series names must match across panels and the control.
- `tr-009`, `tr-038`, `tr-054`, `tr-055`, `tr-035`: their low and high are not ranges of the value, so `"range": false`. `jb-046` is stored positive as a shortfall: `"negate": true`. `dc-forecast-misses`: `"units": {"billion kWh": "TWh"}`.
