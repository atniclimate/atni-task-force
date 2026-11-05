# ATNI Energy site refresh: design spec (11/04/2026)

The single spec builders follow. Base: **Decision Instruments**. Grafts: the Ledger's receipt chip, ledger row, and
claim-sentence title; the River's prompt-unit count view. Nothing here specifies a figure; numbers come from
`evidence/` claims with status `verified`, or `partly` with the limit printed. Contrast figures are WCAG 2.x ratios
recomputed when the spec was written.

## A. Owner layout ruling: this section overrides anything below it

The owner ruled on 11/04/2026: desktop first, the full screen used, tight left and right margins, less scrolling, and
more interactive elements for detail views. Phone support only if it is not more trouble than it is worth. Where
sections 0 to 6 say otherwise (one column, the 1080px track, 96px section gaps, "tabs: none", the 844px phone target,
the in-flow receipt under the foot, ruled rows in a single stack), this section wins. The visual language stays:
Decision Instruments, luminance surfaces, radius 0, the orange needle, the receipt, the Reading.

**A1. Width.** `--page: 100%`; `.wrap` has no max-width up to 2560px (centered beyond that). `--gutter: clamp(16px,
1.6vw, 28px)`. The token page max of 1080px does not set any page width on this site. `--measure` and `--measure-wide`
still limit lines of running text inside a column, never the page.

**A2. First screen.** At 1440x900 and 1920x1080 the first plate's readout and plot are visible without scrolling.
The header is 56px. The hero is a compact band, not a section: h1 at 2.25rem, one-line lead beside or under it, and
Key Facts as an inline row of three or four figures at the right end, in one band of about 160px on desktop. Section
padding is 24 to 32px, not 48 to 96px.

**A3. Workbench tabs (replaces "Tabs: none").** A page with more than two major sections is a workbench: the section
strip is a real tab list (`role="tablist"`, arrow keys, Home, End), one panel visible at a time, deep-linkable by hash
(`#jobs`), with the reader moving between sections by tab rather than by scrolling. It does not stick unless the panel
exceeds the window. Without JS every panel renders in order and the strip is a jump list; print shows every panel.
Segmented radio groups remain the control for settings inside a plate.

**A4. The plate is three zones.** At 1100px and up a plate fills the window width as a grid: **claim and controls** at
left (about 22%, minmax 18rem), **plot** in the center (flexible, the largest thing), and a **detail panel** at right
(about 28%, minmax 22rem). The readout and the Reading sit at the top of the detail panel. Selecting a row, bar, year,
or company (click, tap, Enter, or arrows) shows its detail there: value, boundary, assumptions, and the receipt with
source and quote. This is the master and detail view, and it replaces the in-flow receipt panel and the "Table"
disclosure that pushed the page down: the panel has a small view switch (Reading, Sources, Table). Plates aim to fit
the viewport (`min-height: calc(100vh - 120px)` where the content warrants it) and the plot scales to fill its zone,
so SVGs must be drawn from measured size, or by a viewBox that fills it, not fixed at a narrow width. Under 1100px the
zones stack and the detail panel follows the plot. No extra phone work.

**A5. Prose.** Running text never sets the page shape. Each panel opens with two or three sentences beside its plate
(in the claim zone) and moves the rest into a grid of `<details>` blocks below it, two or three across at wide widths,
each summary a full plain sentence a reader can skim. Exclusive `name` groups only where one-at-a-time helps. Nothing is
removed from the page, and print and no-JS show it all. Long reference pages keep a 14rem section rail at left and use
the remaining width in columns.

**A6. Lists use the width.** Ruled rows flow into `grid-template-columns: repeat(auto-fill, minmax(26rem, 1fr))` with
a 24px gap, so a home or energy page shows many rows at once. Key figures sit in a single row across the page. Home's four
workstreams sit in four columns at 1400px and up. Pages that get only shared CSS still lose their narrow column.

**A7. Visual richness.** The brief asks for a highly creative, visual build. Each workbench panel carries at
least one signature graphic that is more than a bar list (for example the prompt-square Count view, small multiples
over time, a tradeoff matrix, a scenario band with past forecast misses). Tab change counts as a touch, so a 160 to 240ms plot
transition is allowed there; reduced motion stays 0ms. On-page video stayed out of the first build (section B governs now).

**A8. Budget.** Script and page budgets live in one place, `tests/budgets.json`: bytes per script, and one page weight
measured gzipped with larger numbers named for the heaviest pages. Budgets warn near and over the number; they never fail a
test or a push. Checks and screenshots target 1280, 1440, and 1920 wide; 390 gets a sanity look only.

## B. Imagery and Motion, Revised 11/04/2026 (overrides sections below)

The review's limits on imagery and motion are defaults here, not hard lines. A builder may depart from a default in the
page or plate with a one-line reason in the commit. The owner chooses among treatments; a builder does not decide alone.

**B1. Hard lines.** These do not bend.
- No Indigenous people, lands, or motifs from stock. The seal stays the only such mark.
- No image that implies a named site, operator, or proposal.
- No image as the only carrier of a number. Every figure keeps its claim id, text, and table.
- The license terms in the shared asset library's README govern every photograph, including that no full-size originals
  enter the public repository. Only exported, resized files go in `site/`.

**B2. Imagery defaults (may be departed from).**
- Photographs are captioned evidence: from the licensed library or a Nation's consented photo, webp or jpg, in the claim
  zone beside the plate it illustrates, or as a band. About 120 KB each, with alt text and a license line always, EXIF and
  GPS stripped, and one provenance row per image kept outside `site/`.
- The caption says what is shown, what is not shown, and that it is not any facility in any proposal.
- Placement waits on counsel's answer about the license for a public Pages site.
- Other defaults: no text on a photo, no scrim, no people as stand-ins for Tribal workers, no nuclear plant as a
  clean-energy hero, and no crypto rack on the AI page without its caption.
- Try a bolder photographic treatment as well, such as a full-width duotone band at low luminance behind no text, and let
  the owner choose between it and the quiet captioned photograph. Keep the contrast and caption rules either way.
- Leave a visible, honestly empty slot for photographs from member Tribes' own energy projects, with the sentence that
  they will appear with each Nation's consent.

**B3. Motion defaults (may be departed from).**
- Allowed: 120 to 240ms transitions on touch and tab change, 0ms under reduced motion.
- Default refusals: load sequences, count-ups, parallax, scroll-driven state, and autoplay or looping video.
- A click-to-play explainer clip may be trialed: a transcript beside it, a poster, no autoplay, `muted`, `playsinline`,
  `preload="none"`. A trial needs video types added to `validate_public.py` with a size cap (2 MB is the starting point
  in section 5) and the owner's approval before anything is published. Until then, clips stay off the site.

## 0. The decision

| Direction | DS truth | Clarity for non-experts | Memorable | Vanilla JS | Bad connections | Chat vs YouTube/Instagram | Total |
|---|---|---|---|---|---|---|---|
| Ledger | 4 (light surfaces inverted; scroll stories are newsroom, not system) | 4 (number, comparison, receipt) | 4 (the receipt) | 3 (sticky two-column plus scroll steps) | 4 | 4 (ladder and slider; boundary tabs) | 23 |
| Instrument | 5 (correct surfaces, steps, radius 0, eyebrow rule) | 5 (the reader's own number; a sentence to copy; unknown stays visible) | 3 | 5 (native radios, range, table as chart) | 5 | 5 (refuses cross-boundary comparison; Instagram shows as "No public measurement") | 28 |
| River | 3 (4px radius kept; load animation; map as ornament) | 2 (a Sankey is the hardest chart for a council reader) | 5 (map, Sankey) | 2 (Sankey layout, map pipeline, one JS file per chart type) | 3 | 3 (unit squares are vivid, but the whole-chain toggle invites the comparison the page cannot support) | 18 |

Instrument wins five of six. It loses memorability to the River, so the River's countable prompt squares come in as
a second view of the comparison plate. It loses provenance to the Ledger, so the Ledger's receipt chip replaces the
Instrument's looser "evidence chip; sources" foot, and the Ledger's ruled row becomes the one list grammar for the
whole site. Not averaged: no scroll stories, sticky figures, map, Sankey, load animations, or tabs.

## 1. The direction

Every major figure is a plate the reader operates: one orange needle marks what the reader set or selected, the plot
answers in neutral marks, and the plate ends in a Reading, a plain sentence with the value, boundary, evidence label,
and date that a staff member can copy into a council memo. Every number on the site carries a receipt the reader can
open. Type and rules do the work; luminance says what is raised; nothing moves until the reader touches it. The site
is quiet so the reader's own number is the loudest thing on the page.

It refuses: dual axes, bars on a log scale, pies, donuts, gauges, orange as a series color, a number without a claim
id, comparisons across boundaries, floating tooltips, scroll-driven state, sticky plots, load sequences, counters,
parallax, autoplay, video on the page, cards, stripes, shadows, gradients, radius, hover lifts, tracked caps outside
the system eyebrow, 01/02 markers, hamburger menus, maps with any jurisdictional line, stock imagery, canvas, chart
libraries, CDNs, fetches for first paint, verdict headlines ("AI is fine"), speaking for any Nation, and any
invented or borrowed Indigenous motif. The seal is the only such mark.

Where this refuse list and section B conflict (stock imagery, video on the page, gradients, autoplay), section B governs.

## 2. CSS foundation (`site/assets/css/site.css`; `tokens.css` stays unchanged)

**Variables to add.** Four cascade blocks mirror `tokens.css`: `:root, [data-theme="dark"]`, then
`[data-theme="light"]`, then `@media (prefers-color-scheme: light) { [data-theme="auto"] {} }`, then
`@media print { :root, [data-theme] {} }` (print takes the light set). Ratios: base / raised / overlay.

| Variable | Dark | Light | Job |
|---|---|---|---|
| `--energy-text` | `#FF914C` (8.89 / 8.25 / 7.00) | `#C34B00` (4.52 / 4.85; 4.29 on `#EEF1F6`, so never text on the well) | text, links, ENERGY in the lockup |
| `--energy-mark` | `#FF914C` | `#F25C00` (3.10 / 3.33; 2.94 on `#EEF1F6`, so never a thin mark on the well) | needle, 2px lines, squares, selected underline |
| `--energy-fill` | `#FF914C` | `#C34B00` | button and open-chip fill |
| `--energy-on-fill` | `#010B13` (8.89) | `#FFFFFF` (4.85) | label on the fill |
| `--energy-hover` | `#FFAB73` (10.70; on-fill label 10.70) | `#A33F00` (6.43; white label 6.43) | hover fill and hover text |
| `--energy-wash` | `#2C201A` (10% orange over `#141414`) | `#FEEFE6` (10% over white) | selected-row ground; never under text smaller than body |
| `--lead-ink` | `var(--atni-text-body)` | `var(--atni-text-secondary)` | audit 2.1 lead fix |
| `--series-context` | `#8A94A6` (6.02 on raised) | `#667085` (4.97 on white) | unselected series, ruler ticks |
| `--grid` | `#2B323C` (1.42 on raised) | `#E7ECF3` (1.19 on white) | decorative hairlines only |
| `--baseline` | `var(--atni-text-secondary)` | `var(--atni-text-secondary)` | axis baseline, 1px |
| `--measure-wide` | `44rem` | same | the only measure besides `--measure` 32rem |

Role remaps in the same four blocks: `--accent: var(--energy-mark)`; `--atni-text-red` and `--atni-text-link:
var(--energy-text)`; `--atni-text-link-hover`: white on dark, `var(--energy-hover)` on light;
`--atni-non-text-button-fill` and `-border: var(--energy-fill)`; `--atni-non-text-button-text: var(--energy-on-fill)`.
ATNI Red stays in the seal and chart slot 2; `--control`, `--rule`, `--tag-bg`, `--stage-*`, and `theme-color` are unchanged.

**Existing rules that change** (line numbers from the current file):
- `h2` (69): size `var(--atni-type-heading-1-size)` 2.25rem, line 1.1. `h3` (70) stays. `h4` (71) stays for legacy
  markup; no new h4. `p` (72): margin-bottom 0.75rem. `.lead` (95): 1.25rem, line 1.3, `color: var(--lead-ink)`,
  `max-width: var(--measure-wide)`. `.hero h1` (232): delete the override; every h1 is the token title 2.55rem.
- Measures (227, 263, 318, 347, 407, 515, 582, 606, 691): `var(--measure)` for prose, `var(--measure-wide)` for
  `.section-head`, `.section-note`, `.lead`; nothing else.
- Buttons (203): font-size 0.875rem; `.button:hover` (221) uses `--energy-hover` with `--energy-on-fill`.
  Numerals on fills (258, 470): `color: var(--energy-on-fill); background: var(--energy-fill)`.
- Stripes go: `.notice` (351), `.key-facts` (353), `.quote` (386, also `padding-left: 0`), `.slot` (392, border 0,
  padding 0), `.filters` (420), `.day` (453), `.record-deadline` (524), `.chart` (609). `.citation blockquote` (564)
  keeps a 1px `--rule` left. `.findings li.is-match` (558): `background: var(--energy-wash)`, no inset shadow.
- Radius and shadow: `.swatch` (614) radius 0; `.bar-seg.is-end` (637) radius 0; `.bar-tip` (652) no shadow.
- Spacing: `.section` (226) `padding-block: clamp(48px, 6vw, 64px); border-top: 0`; `main > .section:nth-of-type(even)
  { background: var(--atni-ground-raised) }`. `.hero` (231) `padding-block: clamp(48px, 8vw, 96px) clamp(48px, 6vw,
  64px)`. `.content > section + section` (378) `margin-top: 96px; padding-top: 0; border-top: 0`. `.page-body` (360)
  one column; the TOC becomes the section strip (section 3). Steps only: 4, 8, 12, 16, 24, 32, 48, 64, 96.
- Header (123 to 199) and wordmark (131 to 157): replaced by the lockup rules in section 3.

**Type scale** (rem; desktop / phone; League Spartan = LS, Noto Sans = NS):
Readout 4.5 / 3.25 LS 600, line 1, tracking -0.025em, proportional figures, one per plate (new role; report to the
DS owner) | h1 2.55 / 2.125 | h2 2.25 / 1.875 | h3 1.17 | plate title 1.25 LS 600 | lead and Reading 1.25 LS 500 |
body 1 NS, 500 dark, 400 light, line 1.6 | controls, row labels, nav, buttons 0.875 LS 500 | caption, source line
0.8125 NS secondary | axis ticks and table figures 0.8125 NS `tabular-nums` (League Spartan's `tnum` is unverified,
so figures that align use Noto Sans) | eyebrow 0.8125 LS 500 uppercase +0.08em, orange, above section headings.
No mono this run: Noto Sans Mono is not vendored and fontTools is not installed to subset it.

**Surfaces.** Dark: page `#010B13`, plate and bands `#141414`, well, chips, controls, table header `#1E242C`. Light:
page `#F4F7FB`, plate and bands `#FFFFFF`, well and chips `#EEF1F6` (`--tag-bg`). Hierarchy by luminance only.
Rules 1px `--rule` separate data; nothing else gets a rule. Radius 0 everywhere, chart marks included.

**Focus.** Keep the one rule at line 80 (`3px solid var(--atni-text-link)`, offset 3px); it becomes orange by
inheritance and passes 3:1 on every surface in both themes. The plot's single focus stop is an HTML wrapper
(`tabindex="0"` on `.plate-plot`), never an SVG element, so the ring is native everywhere.

**Print.** Light set; plates `break-inside: avoid`; controls, chips, strip, toggle, and nav hidden; the plate table
prints open (`.plate-table[hidden] { display: block !important }` under print outranks `[hidden]`); the source line
prints its URLs through the existing `a[href^="http"]::after` rule; the needle prints in `#C34B00`.

## 3. Components

**Header.** 64px bar (56 on a phone), base ground, 1px `--rule` below, does not stick. Left: the header lockup from
`work/site-refresh/logo/` (`atni-energy-header.svg`) at 40px tall (36 phone), linked home with `aria-label="ATNI
Energy Task Forces, home"`. Inline the SVG when it is under 6 KB after `--outline-text --decimals 1`; ATNI letters
take `currentColor` (heading ink), ENERGY takes `var(--energy-text)` (`#C34B00` on light, since the word is small
text), the seal keeps its own colors in both themes. Over 6 KB: two `<img>` in `site/assets/img/`, the
`-on-dark` file and the light file, one shown per theme by CSS. Clear space equals the seal's radius; never below
32px tall; never recolored beyond those two words. Right: nav links LS 500 0.875rem, secondary ink, 44px tall,
active = heading ink plus a 2px `--energy-mark` underline; then the theme toggle as now with a `--control` border.
Phone: lockup on line one, nav as a wrapping flex row on line two (no tiles, hairlines, hamburger, or JS). The seal
alone is the favicon (`assets/img/seal.svg`, under 4 KB) and the dark full lockup a 1200x630 PNG for link previews.

**Footer.** As now on raised ground, measure 32rem, orange links; when touched, the 48px full lockup replaces `.footer-title`.

**Hero.** Base ground. Interior: eyebrow (orange), h1 at title size (`max-width: 20ch`), one-line lead in
`--lead-ink`, Key Facts aside at 21rem on raised ground without its stripe. No image, no gradient, no KPI row. When
a page has a plate, the first plate starts inside the first screen at both widths; its readout, not the h1, is the
largest thing on the page. Home: eyebrow, h1, one line, two buttons; the lockup in the header carries the name.

**The ruled row (graft from the Ledger).** One list grammar replaces every box: `grid-template-columns: 10rem
minmax(0, 1fr)` at 720px and up, 24px padding above and below, 1px `--rule` below, base ground, no background.
Left cell: the figure, date, number, or status in LS 600 (1.75rem for numbers, 1.375rem for dates, 0.875rem LS 500
for a status); right cell: title in heading ink, text at 32rem, meta in muted. Applies to `.resolution` (already
close), `.card` (grid areas: status and grounds left, title and text right), `.deadline`, `.figure`, `.entry`,
`.record`. Hover changes nothing but the link underline. There are no cards; `.cards` is this list.

**Table.** `.data-table` as now: header LS 500 secondary with a `--control` rule, row headers in heading ink, figures
right-aligned tabular, 1px `--rule` between rows, `.table-scroll` wrapper on phones. Unit symbols in Noto Sans.

**Callout.** `.notice`: raised ground, 16px 20px padding, heading ink, measure 32rem, no stripe. The held slot
(`.slot`): no border, the hollow orange square label, secondary ink, no plot inside it, ever.

**Subnav and section strip.** `.subnav` (page family) stays above the hero: 44px links, active 2px orange underline.
`.toc` becomes the section strip under the hero: one row of LS 500 0.875rem links, 44px tall, `overflow-x: auto`
with `scroll-snap-type: x proximity` on a phone, no fade mask; at 960px and up it is `position: sticky; top: 0` on
the base ground with a 1px rule below, and headings get `scroll-margin-top: 56px`. JS may set `aria-current="true"`
on the section in view; without JS it is a jump list. Removing the 13rem rail returns the page track to the content.

**Pull figure.** `.pull`: value LS 600 2.25rem proportional, unit NS 500 0.875rem beside it in body ink, label LS 500
0.875rem, one receipt chip; one per section at most; built from the claims file (`data-claim`), so none exists
without a claim id. It floats right in `.margin` (`width: min(31.5rem, 100%)`, 4rem gap; phone: in flow after its paragraph).

## 4. Chart system

**Frame.** `<figure class="plate">` on raised ground, 1080px track inside `.content` (never viewport bleed, so no
horizontal scroll), padding 48px (24 phone), 24px between parts, 12px inside a group, rows 44px:
1. `head`: eyebrow naming the measure; **title as a claim** (the finding at the default setting, with year and
   boundary, 1.25rem LS 600); subtitle with unit and boundary (0.8125rem secondary); the control row (one row,
   left-aligned, above the plot on desktop; below the plot on a phone, clear of the thumb).
2. `readout`: the big number (4.5rem) and the Reading sentence in a `<output aria-live="polite">`, debounced 500ms.
3. `plot`: ruler rows or inline SVG with a `viewBox`; the needle; a legend row for two or more series (rect for
   fills, stroke for lines; none for one).
4. `foot`: a 1px rule, then the source line as a sentence (source titles, year, as-of date), then **receipt chips**,
   then "Copy Reading", "Reset", "Table" at the right end, then the question link the plate answers.
5. `table`: a real `<table class="plate-table">`, visible without JS, hidden by JS behind the Table button.
The table is the chart wherever possible (graft kept from the Instrument): ladder plates are tables whose mark is
placed by CSS (`left: calc(var(--x) * 100%)`); JS only updates `--x` and text. Line and bar plates are SVG written
at build time. A build script, `scripts/build_plates.py`, pours numbers from the shipped claims files
(`site/data/claims/<cluster>.json`, tier T0, schema 1) into table, SVG default state, and an inline
`<script type="application/json">` per plate, so chart, table, and receipt cannot disagree and nothing is fetched.

**Receipt chip (graft from the Ledger).** A `<button class="receipt" aria-expanded>` with a 6px square (filled =
measured or company-reported; hollow = modeled or estimate) and the short source name in 0.75rem LS 500 on the well.
Open: inverts to `--energy-fill` with `--energy-on-fill` ink and reveals an in-flow panel under the foot (never a
popover): source title as a link, publisher, published date, year of the value, boundary sentence, the one-sentence
quote, status (verified, or partly with the limit), and `derived` arithmetic when present. Escape or a second press
closes; one open per plate. A row with no claim id does not render.

**Palette.** Orange is the needle and the selection, nothing else inside a plate; inside `.plate`, links wear heading
ink with a `--control` underline so orange keeps one meaning. Emphasis is the default form: selected series
`--energy-mark` 2px with a direct label, others `--series-context` 1.5px. Orange against context is only 1.37 (dark)
and 1.49 (light), so selection also changes weight and gets the label; print and grayscale still read. Categorical
hues appear only when parts are the subject, in system order from slot 1 (`#2F7FC1`, `#E13D33`, `#1E9A6E`,
`#B8800E`, `#6E6FD0`, `#A8673A`), never recolored by a filter, never on a plate with a needle (orange sits 1.53 from
ochre and 2.02 from umber). Same hex in both themes: on raised surfaces the lowest slot contrast is 4.09 dark and
3.42 light (ochre); plots on light live on the white plate, not the tint. A single series wears slot 1. Diverging
(jobs): slot 1 and slot 2 with a neutral zero and a printed sign; exposure is its own view, never drawn as loss.
Sequential: one blue ramp (the existing `--stage-*` steps). Run `validate_palette.js` for `#141414` and `#FFFFFF`
before any palette ships and record the output in `evidence/`.

**Marks.** 8px squares with a 2px plate ring; 2px lines, square joins; bars at most 24px, square ends, 2px surface gap;
area wash 10%; ranges as a 1.5px context line between low and high with the point estimate as the square; hollow =
modeled or estimated, filled = measured or company-reported; dashed = projection and nothing else; gridlines solid
hairline `--grid`; baseline 1px `--baseline`; the needle 2px `--energy-mark` through the whole row stack. Text never
wears a series color; labels inside an orange fill use `--energy-on-fill`.

**Axes and labels.** Log rulers print "each mark is ten times the last" and carry squares, never bars. Ticks 0.8125rem
tabular; clean numbers, one style per axis. In a ladder table the value column carries every number (the table is
the chart); in SVG plates only the endpoint, extreme, or selected mark is labeled. A row with no public measurement
keeps its place with no mark and the words "No public measurement". A setting that cannot move a measure says so.

**Tooltip.** None floating (a deliberate departure from the dataviz default, for touch and for the copy-a-sentence
job). Hover, focus, tap, or arrow on a row, bar, or year updates the fixed Reading: values lead, names follow, every
series listed, each keyed by a short stroke. Bars and ladder rows are their own hit target (44px row), lifting one
luminance step. Line plates snap the needle to the nearest year; `touch-action: pan-y` so a sideways drag moves the
needle and a vertical drag scrolls; updates once per animation frame. Text enters the DOM by `textContent` only.

**Keyboard and reduced motion.** Tab reaches the controls, then the plot as one stop. Arrows move the row or year,
Home and End jump, Escape restores the default. No single-key shortcuts. Native controls only.
`prefers-reduced-motion: reduce` sets every plate transition to 0ms.

**Phone (390px).** One column, 16px gutter, no horizontal scroll. Head, readout, plot, controls, foot; each plate fits
about one screen (844px target). Ladder rows stack the label above the ruler. Controls 44px tall; chips 32px with
8px between; segmented controls wrap. The Reading sits directly under the plot, so no value needs a gesture.

**The comparison plate (owner's top priority).** Form only, no figures: a log ruler in energy per session with fixed
rows for the chat session, a streamed video hour, a short-video session, and everyday activities from the claims
file; a segmented boundary control (inside the data center, or data center plus network and device); a prompts-per
hour slider paired with a number field, labeled as the reader's assumption; the Reading names the boundary every
time. A second view, "Count" (graft from the River), draws one square per median text prompt up to 200 and prints the
remainder as a count. Both views hold one boundary at a time; a row with no verified value at the chosen boundary
prints "Not counted at this boundary". Instagram ships as "No public measurement" until a claim clears.

## 5. Interaction grammar, motion, and clips

Note: section B governs where it conflicts with this section (imagery, the image budget line, motion, and clips).

| Element | Rule |
|---|---|
| Tabs | None. Settings are segmented radio groups in a `<fieldset>`; long question lists use exclusive `<details name>`. |
| Segmented, toggle | Native radios, text labels, 44px, 2px orange underline on the selected item, one row (wraps on a phone). A toggle is a two-option segmented control, never a switch. |
| Slider | Native `<input type="range">`; the thumb is the needle (2px line in a 44px hit area), track in context ink, stops printed; always paired with a typed number field. |
| State | Settings live in the query (`?mw=100&use=80#plate-id`) via `replaceState`, validated against allowed stops, default on anything else; nothing stored. Copy Reading puts the sentence, URL, and source titles on the clipboard; on failure it selects the sentence and says so. |
| Scroll | Never changes a reading. No pinning, no scroll stories, no smooth-scroll override. |
| No JS | Default reading, full table, and static plot render; controls stay `hidden`; a line names the setting shown. |
| Budget | HTML and one CSS file paint first; `plate.js`, `defer`, plus at most one per-page module; data inline; fonts the six vendored woff2 with `font-display: swap`; sizes in `tests/budgets.json` (they warn, see A8); no images beyond the lockup. |

**Motion.** Nothing moves until the reader touches something. Needle 120ms linear; marks 160ms ease-out; text
changes instantly; the section strip's current marker swaps without transition. No load sequence (the Ledger's rule
draw and the River's map draw are refused), no reveal, count-up, parallax, pulse, or loop. Reduced motion: 0ms.

**Where a HyperFrames clip is worth its weight.** Off the site, only: a 1080x1920 vertical clip and a 1920x1080
still sequence of the comparison plate, built from the same claims JSON, for the owner's slides and the owner's own
channels on the platforms the chart is about. They land in `work/site-refresh/assets/`. On the page, every motion
need is answered by a CSS transition or a build-time SVG at zero bytes; a clip cannot be copied, read by a screen
reader, or rebuilt when a claim changes, breaks "nothing moves until touched", and one clip outweighs the whole page
budget on a slow connection. **Recommendation: do not add `.mp4` or `.webm` to `validate_public.py` in this run.** If
the owner later wants a clip on a page, add both (Safari needs H.264 `.mp4`, the rest VP9 `.webm`) as binary types
with a 2 MB cap, and have the validator require `preload="none"`, `muted`, `playsinline`, a `poster`, no `autoplay`,
and a text alternative beside the element.

## 6. Home and Energy with the shared CSS alone

**Home (`site/index.html`).** With no markup change: eyebrow turns orange; the h1 drops from 84px to the title size;
the lead sits at 44rem in body ink; buttons fill orange with dark ink (light: `#C34B00` with white); the loop's
numerals and lines turn orange with on-fill ink; the four workstream boxes become four ruled rows; "The Work in
Numbers" becomes four ruled rows with the value in the left cell; the resolution rows already fit; even-numbered
sections sit on raised ground, so the page alternates base, raised, base without a single decorative rule. Page
work later, when evidence lands: the header lockup (one edit per page), a one-line lead, and the Bench (five ruled
rows, each with a plate's default Reading and a needle on a thin ruler, linking to its plate).

**Energy (`site/energy/index.html`).** With no markup change: the subnav keeps its row with an orange active
underline; the hero shows the title-size h1, the wide lead, and Key Facts without a stripe; the TOC becomes the
sticky section strip and the text column takes the full track at 32rem, left aligned; sections sit 96px apart with
no rules; the resolution quote loses its bar; the deadlines grid becomes ruled rows; the funding and plans tools
inherit orange controls. The existing stacked-bar chart (`.chart`, `.bar`) rises to the plate surface, square ends,
square swatches, and a shadow-free tip; its floating tip becomes the fixed Reading when `energy-potential.js` is
rewritten to `plate.js`, a later task. Nothing on this page needs a plate in this run.

**For the design system's owner:** a `program.energy` group (`#FF914C`, `#C34B00`, `#F25C00`, `#A33F00`) with pair
entries for the contrast test, the Readout role, the lead color mismatch, and the `--measure-wide` step.
**Unverified until build:** League Spartan `tnum`; the lockup's size and weight (the logo is still being drawn).
