# Resource Use Explorer: build spec (11/04/2026)

One direction; the builder follows it without asking. Page `site/explorer/`, title "Resource Use Explorer". Inherits DESIGN-SPEC.md section A, the Plate kit
(PLATE-KIT.md), `tokens.css` and the `--energy-*` variables in `site.css` unchanged. Numbers come from the model's export, `site/data/resource-model.json`; no digit
is typed into the page. T0 only. The home page carries one band from the same model (section 8).

## 1. The decision

**Signature: the Wall.** Every activity is drawn as one horizontal bar split at a vertical 2px rule, the wall of the reader's own building. Left of the wall is
the reader's side (device, home router), charged by time and identical on every hour row; right of it is beyond the wall (network, then data center or node),
charged by count. The reader sees in one look that the left side is the same whatever they do, that chat and video add a sliver to the right, and that the
coding hour and a local node are the rows where the right side grows. It is the model's own sentence (RESOURCE-MODEL.md section 3) drawn once, and it is the
owner's point (AI is a kind of work, not the building) made visible before any word is read. Nothing else on the page competes with it: one hue family to the
right of the wall, greys to the left, orange only for the selected row.

**Your Use leads** (tab 1) and carries the Wall. It is what visitors touch first, and at its defaults (one hour of each activity in a week) its rows equal the
model's hour rows exactly, so the first screen is the catalog of hours with every count editable. "AI Is Not the Building" is tab 2. The disclaimer is a
permanent one-line band under the tab strip, on every tab, never dismissed.

**Refused** (from the model): a ratio between hour rows; a bar across price bases; a carbon bar between rows on different grids; water summed across basins;
confidence bands; a line through the back-test; a total water figure anywhere; any number that reads as a measurement without its basis.

## 2. Page structure (all tabs are `role="tablist"` panels per DESIGN-SPEC A3; print and no-JS render every panel in order)

Header 64 | hero band (h1 2.25rem, one-line lead beside it, Key Facts aside) 120 at 1920, 96 at 1440 | tab strip 44 | disclaimer band 36 | one plate per
tab with `"fit": true`, so the plate reaches the window foot at 1920x1080 (plate 816 tall) and 1440x900 (660). Below each plate, a `disclosure-grid` of
`<details>` holds the panel's longer text (A5). Tab order and labels:

| # | Tab, hash | Plot (center zone) | Claim zone controls | Detail zone |
|---|---|---|---|---|
| 1 | Your Use `#your-use` | the Wall, linear Wh, rows: "Your screen and router, N hours" then one row per activity | Person or Office (seats), the eight count fields plus screen hours, all 44px tall, each with the model's default shown and a "why" on focus | readout, four measures (section 4), price by basis, water by basin, layer list, "matches the model" check |
| 2 | AI Is Not the Building `#not-the-building` | two pictures side by side: Who uses the building (waffles), Where AI runs (place strip) | year (2025, 2030 added) and source (IEA world, LBNL US) as segmented controls, never mixed on one waffle | the figure, its definition line (facility class or workload class), receipt |
| 3 | Where It Runs `#where-it-runs` | four places as Wall rows for one workload, same model | workload (prompt, coding session, image, clip); measure | the place profile (PUE, U, site water, grid), "node unpriced: needs a yearly count, see Architectures", banner "same model; the multipliers are untested" |
| 4 | Architectures `#architectures` | options of one comparison as Wall rows (A, B, D) or terabyte-year bars (C, no hour axis), one measure at a time | comparison A to D; measure; wage; node already on | wins, loses, note, `readings`, stability ("reverses on"), Named alternatives (section 6) |
| 5 | Levers `#levers` | ten rows, before and after as two squares on one linear ruler per row with `after_over_before` printed | measure | term moved, size in record, note; reasoning off tagged "upper bound" |
| 6 | Crossovers `#crossovers` | log ruler of annual count: central square, low to high range line, "or never" as words at the row end; hydro lines in a separate "Scenario" group; one grid first | comparison (views, prompts) | the one input or setting at each end |
| 7 | Catalog `#catalog` | two rulers in one plate: By the hour (the Wall, linear) and By the unit (log, squares); the price basis as a tag on every row | sort (value, tag) within a ruler; measure | the table view (Row, Wh, $ with basis, g, mL by basin, claims); price column not sortable |
| 8 | Project Scale `#project-scale` | instrument rows, blank by default; one button fills the Data Centers plate's example and picks no feed; Reset clears it | MW, load factor, site water (three presets named), grid factor, load to compare with | "hosting and serving are separate decisions" |
| 9 | Method `#method` | the back-test as a table, held-out rows first, not-held-out rows marked, no line | none | disclaimer, method text, calibration, regression (no t, interval, R2, "elasticity"), sensitivity, field protocol, downloads, version, cite |

The 21 global selectors live in a **Settings drawer**: a 22rem `<aside>` on `#1E242C` (light `#EEF1F6`) that opens from the right under the disclaimer band, the
plate compressing beside it so the reader sees the Wall move, 1px `--rule` at its left, opened by the "Change" link in every plate's setting line ("Phone, Wi-Fi,
router by time, US grid for the data center, NWPP at home, Columbia convention, $60 an hour, node not on. Change") and by a "Settings" button at the right end of
the tab strip. Groups, in order: Your side (device, connection, network accounting, router rule); Rates (prompts, kind of chat, turns, images, clips, searches,
streaming intensity); Grids (data center, colocation, node, home, generation water, hydro convention, hydro share); Money (wage, tariff); Node already on. Segmented
radios, 44px, the `why` under each on focus. Escape closes; focus returns to the link. Print: the drawer prints as a list of the current settings under the first plate.

**The address.** Settings reach every tab. The query string carries the global selectors only (`?device=laptop&grid_dc=nwpp#your-use`), and never wage, tariff, office
size, a project's load, or any typed number, so a shared link cannot carry a Nation's figures. Measures, comparisons, views, and the selected row stay off it too. A link
is untrusted input: an unknown name or an option a selector does not hold is ignored and dropped from the address on load. Changes replace the current history entry, so
Back leaves the page rather than walking back through radio clicks; a Back step inside the page re-reads the address, and with no hash the first tab shows. Tabs stay
deep-linkable by hash.

## 3. The Wall (the one new plot kind; `plate.register` with a custom draw, `plate.draw` primitives)

- Row: 56px (44 minimum under 1440 tall), label column 14rem LS 500 0.875rem heading ink, bar track to the right, value column 7rem right-aligned NS tabular
  0.8125rem with `.ladder-num .ladder-unit .ladder-tag`. The wall is a 2px `--baseline` rule at a fixed x (36 percent of the track at the defaults; recomputed
  so the largest left side fills its side, never past 45 percent). Left segments grow leftward from the wall, right segments rightward. Linear scale, one
  domain per measure, set so the longest row fills 92 percent of its side; a row past the domain prints "off this ruler" with no bar.
- Segment order is fixed: device | router | wall | network | data center or node. Bars at most 24px tall, square ends, 2px surface gap between segments. The
  total's spread is a 1.5px `--series-context` range line below the bar with 6px end ticks, labeled on the selected row only ("spread, not a confidence interval").
- Ink: data center or node `--atni-color-chart-1` `#2F7FC1`; network `#2F7FC1` at 40 percent over the plate (`#1F3F59` dark, `#ACCCE6` light); router
  `--series-context`; device `--series-context` at 50 percent (`#4F545D` dark, `#B3B8C2` light). Run `validate_palette.js` for both surfaces on these four
  before build and record the output in `evidence/`; if a tint fails, take the nearest `--stage-*` blue step instead. Legend row under the plot, four squares
  with words; no text wears a series color. Selected row: orange 2px needle through the row height at the bar end, `--energy-wash` behind the range span only.
- Which layers move with which setting: router by time and device sit in the one screen-hours row (Your Use) or on every hour row (Catalog, Where It Runs);
  router by data moves the router segment onto the activity rows' left side by their gigabytes; router excluded draws none. The phone's device segment is
  battery energy, and its wall figure prints in the detail ("6.2 Wh at the wall"). Per-unit rows (one prompt, one image, one clip, a search, a seat-month, an
  hour-view) have no left side; they sit under a 1px rule in a group headed "By the unit, data center only" on the log ruler, as squares.
- Measures on the Wall: Energy, CO2e and Water are drawn; Price is never drawn as a bar. In the Price measure the track empties and each row prints its figure
  with its basis tag (API list, seat list, self-run, platform revenue, paid plan, none), rows grouped by basis with a rule between groups, revenue rows
  carrying "revenue, not a cost". Water segments keep the 2px gap and the detail prints `ml_by_place` by basin ("data center basin, not stated: 47 mL; home
  basin, Columbia convention: 5 mL"); no water total prints anywhere. CO2e segments print their grid on hover and in the detail.
- Hover, focus, tap, arrow on a row updates the detail; no floating tooltip. Bars change length 160ms ease-out on a field or setting change; reduced motion 0.

## 4. How the four measures read at a glance (detail zone, top, identical on every tab)

Readout: the selected row's energy, 4.5rem LS 600 with the unit beside it. Under it, one row of three figures at 1.75rem LS 600 each with a 0.8125rem tag
below in secondary ink: price "at API list, 11/04/2026" (or its basis), CO2e "US grid, 350 g per kWh, location-based", water "by basin" (two figures, the
basin and convention under each). Then the Reading sentence (`output aria-live`), the layer list (four lines, square keyed, counted or not counted), the
spread line, the one input that moves it most (from `drivers`), the claim receipts, "Copy Reading", "Reset". Per-million-tokens reading, AI rows only, as a
fifth line in the detail: energy per million output tokens by model class with its range (frontier from `ei_out` x 1,000 x PUE; small model via the
route_small factor; node from `j_node`, GPU only, plus the idle share at the chosen count; laptop from `j_laptop`), and the list price per million output
tokens (`p_out` with its range), then the sentence "No vetted standard exists for a million tokens: these are one vendor framework's defaults (au-008,
au-009), tokens are not portable across vendors or languages (au-005, au-026), and a Tribal-language prompt can cost up to 179 times English."

## 5. Your Use (tab 1), the arithmetic and the honesty rules

Fields, in a week: screen hours (all activities), prompts, coding hours, images, clips, searches, social hours, streaming hours, gigabytes stored. Defaults: 7
screen hours, and one hour of each activity at the model's rates (10 prompts, 1 coding hour at 6 turns, 10 images, 2 clips, 10 searches, 1 social hour, 1
streaming hour, 0 GB), labeled "a starting point; change any field". Office mode multiplies by seats and adds the seat row (seat list) and storage. Rows: the
screen-and-router row = screen hours x (device Wh per hour + router Wh per hour at the router rule), drawn once; each activity = count x its per-unit data
center and network terms from the catalog formulas, never a device or router term, so time is counted once. Price: three lines, never one sum: "at API list"
(prompts, coding, images, clips, searches), "what platforms earn in those hours, revenue, not a cost" (social, streaming), "seat and storage list" (office).
CO2e: the sum across layers at the chosen grids, grids named. Water: by basin. The claim-sentence title refills live ("In a week with N screen hours: screen
and router X Wh, activities Y Wh, most of it the coding hour"), under the eyebrow "Your week, modeled 11/2026". On load the page recomputes the model's hour rows from the
inline inputs and compares them with the inline oracle; the detail prints "Matches the model: N rows within 0.5 percent" or a visible warning naming the row.

## 6. AI Is Not the Building (tab 2) and the named alternatives (tab 4)

Left picture, "Who uses the building": one 10 x 10 waffle per selection, 12px squares, 2px gap; AI-focused facilities in `#2F7FC1`, the rest in
`--series-context`, with the caption carrying the year, the source, and the definition (IEA world 2025: facility class, lf-001; IEA 2030 added, lf-001; LBNL
US 2030: AI servers, lf-003; EPRI today: workload class, lf-002, partly, limit printed). The non-AI block is one block captioned "search, video, storage,
email, business software: not split in the record" until a claim with that split exists; no invented segments. The two definitions never share a waffle or
a bar. Right picture, "Where AI runs": five columns (hyperscale, regional colocation, community node, laptop, phone), the same short prompt's energy as a
square count (one square per 0.05 Wh), with the place's grid, site water, and idle floor as words beneath, the device columns captioned "added energy only,
already on; quality not equal; 11 to 29 percent of queries go to the cloud anyway". Claim-sentence title: "A data center is a building; AI is a kind of work."
Longer text (COPY-INPUTS section 4) goes in the disclosures below.

Architectures A to D name alternatives in a `<details>` "Named alternatives" in the claim zone, as a ruled list: name as a link to the project, one line of
what the project says it is, maturity from a claim only (ArtCraft apps: "labeled by the vendor as in development, sf-057"; ONLYOFFICE and Collabora: name
and link only until a claim row exists, no maturity word), tradeoffs in words from `qualitative` (administration hours, format fidelity, support, one box
one link, idle hardware), wins in words. A: LibreOffice, ONLYOFFICE, Collabora, Nextcloud, the ArtCraft apps. B: Jellyfin, PeerTube, embedded caches (placed
by the platform). C: content-addressed storage, federated query, federated social software. D: small open-weight models; Te Hiku Media named with credit
only. No endorsement, no ranking, no vendor logo. Carbon rows draw only against `cloud_same_grid` or `hyper_same_grid`; rows whose label says "declared hydro
feed" sit under a rule in a group headed "Scenario: a declared feed, not the default", and their labels open with "Scenario:", because the Table view lists them among
the others. They are never the main comparison (owner ruling, 11/04/2026). Each pair prints its `stability` entry as a chip ("reverses on: wage 25"), visible beside the
Reading, one measure's pairs at a time; the figures stay in the rows (the fairness check's reading, one setting at a time with its reversal inputs).

**Cloud admin hours** (owner ruling, 11/04/2026; not settled): comparison A keeps the two assumed hours a month as a visible input, typed over the model and never in the
address, with the point where the price order flips printed beside it, read from `stability` (the top of the input's spread, 14), and the tie at the settings shown, which
is lower. **The Tribally owned facility's PUE** (lf-059, owner ruling, 11/04/2026) is anonymized and attributed to its public source: the page names neither the facility
nor the Nation, and the receipt links the operator's own report. `site/data/claims/anonymized.json` holds that public wording by hand, because the local evidence record
names both and `scripts/build_plates.py` holds it back.

## 7. Method (tab 9) and the disclaimer band

Disclaimer band (every tab, 36px, raised ground, 0.875rem NS, body ink): "Modeled estimates, not measurements. Ranges are spreads, not confidence intervals. A
bottom-up process model, checked against published figures. Method." with Method a link to `#method`. That name stands until the owner has read the research on what an
econometric model is (owner ruling, 11/04/2026). The Method panel, in two text columns at 44rem each beside the back-test plate: the full disclaimer (RESOURCE-MODEL.md
section 14, verbatim), the method sidebar text (COPY-INPUTS section 2) with the plain sentences that it is a bottom-up process model, checked against published figures,
and that the idle term is untested, calibration, the trend-controlled regression table (four specifications, se only), sensitivity rankings, the field protocol "Measure it yourself"
(COPY-INPUTS section 3, five instruments, what each finding replaces), downloads (`resource-model.json`; `inputs.csv` from the inline inputs; `outputs.csv`
of every row at the current settings, generated in the browser as a Blob, no fetch), the model version line ("Model version: schema 1, built 11/04/2026,
prices as of 11/04/2026, inputs hash xxxx" from the build), and "How to cite" with the task force as author and the URL. Sovereignty, consent, resilience, and
custody stay in words in `qualitative` columns beside the numbers on tabs 3 and 4; the page never converts them.

## 8. Live computation and files

Script and page budgets live in one place, `tests/budgets.json`; `scripts/page_check.js` and `tests/test_plates.py` read them there, and they warn and never fail.

- `site/assets/js/resource-model.js` (pure, no DOM, a `module.exports` guard so node loads the same file the page loads; the page reads `window.resourceModel`): the equations
  (`idleMult`, `tokensWh`, `tokensUsd`, `layer`, `four`, `wGenNw`, `selfRun`, `projectScale`), `compute` (the catalog, hour baseline, places, the four comparisons with
  crossovers, the levers), `Run` (spreads and `drivers`: each input at its ends and each setting at its options, the same procedure as Python, so any combination of the 21
  settings and the Your Use counts computes live), `Views` (what the page says at one state, so the build prints the words the page computes), and the number formats.
  Python stays canonical; the JS never introduces a coefficient. `site/assets/js/explorer.js` holds the page around it: painting, selection, the drawer, the address.
- `scripts/resource_model.py --export` writes `site/data/resource-model.json` for download, and `--oracle` writes the oracle, `work/site-refresh/tmp/explorer-oracle.json`: 300 seeded settings and
  counts (seed 20261104; the first is the default), each with Python's tree, spreads, drivers, crossovers, and Your Use by layer.
- `scripts/build_explorer.py` slims that file for the inline block (inputs with low and high; assumptions; the boards, words, and default rows; no `selectors` branch), writes it
  as `<script type="application/json">` in `site/explorer/index.html`, and pours the page's words and geometry from `resource-model.js` through `scripts/explorer_static.js`.
- `scripts/page_checks/explorer.js` (`node scripts/page_check.js --page explorer`, jsdom): runs the page's real scripts against every oracle case; every value within 1e-9, far inside
  the 0.5 percent the page's own check prints, crossover "never" states equal. It skips nothing: a missing oracle is a failure that names the fix.
- `site/assets/css/explorer.css` after `site.css`: the Wall, the waffles, the place strip, the measures row, the drawer, the disclaimer band. Radius 0, no
  shadows, luminance only, focus ring inherited. Phone: zones stack, the Wall keeps its order with the label above the bar, no extra polish.
- **The home band** (`site/index.html` between `<!-- explorer:home:band -->` markers, `site/assets/css/home.css`, `site/assets/js/explorer-band.js`): one figure, the whole chain's energy
  for an hour of chat, streaming, short video, or agentic coding at the default settings, one control over those four stops, a sentence, the claims with status and limit, and a
  link in. The build pours it from `resource-model.js`, so the home page loads none of the model. Without scripts and in print every stop shows.

**A zone that scrolls is reachable.** The detail zone and every `.table-scroll` take a tab stop, a claim zone takes one when it overflows, and the arrows bring the selected row into view,
so nothing sits behind an overflow without a way to reach it by keyboard. `prefers-reduced-motion` takes the bars and the tab fade to zero, here and in `site.css`.

## 9. Checks before handoff

`python scripts/build_explorer.py`; `python scripts/validate_public.py`; `node scripts/page_check.js --page explorer`; `python -m pytest -q tests/test_plates.py tests/test_resource_model.py`;
`validate_palette.js` output in `work/site-refresh/evidence/`; `node scripts/capture.js --pages explorer --tabs` at 1920 and 1440 in both themes and 390 once, with its clipped-text metrics
read; keyboard pass (tabs by arrow, fields, the Wall as one stop with arrows, drawer by Escape); print preview showing all nine panels, the tables, and the settings list.
