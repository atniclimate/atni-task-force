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
| 4 | Architectures `#architectures` | options of one comparison as Wall rows (A, B, D), terabyte-year bars (C, no hour axis), or one-time rows and year rows under their own heads (E, no hour axis), one measure at a time; the custody setting stands over the plot | comparison A to E; measure; wage; node already on; E's typed size, hours, and other bill | wins, loses, note, `readings`, E's paybacks, stability ("reverses on"), Named alternatives (section 6); what the custody rule leaves out stands under the plate |
| 5 | Levers `#levers` | ten rows, before and after as two squares on one linear ruler per row with `after_over_before` printed | measure | term moved, size in record, note; reasoning off tagged "upper bound" |
| 6 | Crossovers `#crossovers` | log ruler of annual count: central square, low to high range line, "or never" as words at the row end; hydro lines in a separate "Scenario" group; one grid first | comparison (views, prompts) | the one input or setting at each end |
| 7 | Catalog `#catalog` | two rulers in one plate: By the hour (the Wall, linear) and By the unit (log, squares); the price basis as a tag on every row | sort (value, tag) within a ruler; measure | the table view (Row, Wh, $ with basis, g, mL by basin, claims); price column not sortable |
| 8 | Project Scale `#project-scale` | instrument rows, blank by default; one button fills the Data Centers plate's example and picks no feed; Reset clears it | MW, load factor, site water (three presets named), grid factor, load to compare with | "hosting and serving are separate decisions" |
| 9 | Method `#method` | the back-test as a table, held-out rows first, not-held-out rows marked, no line | none | disclaimer, method text, calibration, regression (no t, interval, R2, "elasticity"), sensitivity, field protocol, downloads, version, cite |

The 21 global selectors live in a **Settings drawer**: a 22rem `<aside>` on `#1E242C` (light `#EEF1F6`) that opens from the right under the disclaimer band, so the
reader sees the Wall move. From 1600px the plate compresses beside it; below 1600px (W9 critique, 11/05/2026: compressed, the label column fell to about 110px) it is
`min(22rem, 26vw)` and covers the detail column only, so the claim and plot keep their width and each field prints the model figure it stands in for. 1px `--rule` at its left, opened by the "Change" link in every plate's setting line ("Phone, Wi-Fi,
router by time, US grid for the data center, NWPP at home, Columbia convention, $60 an hour, node not on. Change") and by a "Settings" button at the right end of
the tab strip. Groups, in order: the scenario file (section 8); Your side (device, connection, network accounting, router rule); Rates (prompts, kind of chat, turns, images, clips, searches,
streaming intensity); Grids (data center, colocation, node, home, generation water, hydro convention, hydro share); Money (wage, tariff); Node already on; Your Own Readings (section 8); Illustrative
Carbon Damage (section 8). Segmented radios, 44px, the `why` under each on focus. Escape closes; focus returns to the link. Print: the drawer prints as a list of the current settings under the first plate.

**The address.** Settings reach every tab. They ride in the fragment, after the tab's anchor (`#your-use&device=laptop&grid_dc=nwpp`), since a browser never sends a
fragment to the server (owner ruling 29, 11/06/2026); an old `?device=laptop#your-use` link is read once and moved into the fragment, and nothing in the request line carries a setting. The address carries the global selectors only, and never wage, tariff, office
size, a project's load, the custody setting, a reader's readings, the damage family, or any typed number, so a shared link cannot carry a Nation's figures. Measures, comparisons, views, and the selected row stay off it too. A link
is untrusted input: an unknown name or an option a selector does not hold is ignored and dropped from the address on load. Changes replace the current history entry, so
Back leaves the page rather than walking back through radio clicks; a Back step inside the page re-reads the address, and with no anchor the first tab shows. A link within the page takes the
whole fragment, and the settings come back after its anchor. Tabs stay deep-linkable by anchor; since no element has the whole fragment as its id, the kit lands on the anchor itself, its tab open, in view and with focus, as the browser does on a plain `#id`.

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
basin and convention under each). Then the Reading sentence (plain text; the kit's hidden polite output speaks it half a second after a selection or a setting, never on a hover), What
moves it most, the layer list (four lines, square keyed, counted or not counted), the spread line, the claim receipts, "Copy Reading", "Reset". **What moves it most** (owner ruling 31) is a table under the
Reading, folded to one line with scripts: up to five inputs with a stated range, each set to its low end and to its high end with the others where the reader has them (the model's `drivers`), largest swing
first, in the measure shown, water basin by basin and never summed. A row is the input (its row header), the figure at its two ends with a bar under it, and the range's claims in a Sources column of their
own; the bar is aria-hidden, its part below the reader's figure darker and the part above lighter, and the caption says so. Settings (grid, router rule, place) are not ranked, and the caption says that too.
`scripts/explorer_static.js` prints the same rows at the defaults. Per-million-tokens reading, AI rows only, as a
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

**Comparison E, leaving a cloud** (second version, 11/05/2026). A comparison, not a tab: it asks the same question as C and D, on the same plate. A move row is one time and a year row is one year, so `boards["arch.E"].groups` stands each under its own head and nothing adds them. On energy, carbon, and water the store changes nothing, so S3 stands for all three and the head says so; price lists every store. Carbon draws the year rows against `year_cloud_same_grid`, and a move, on the network's grid, prints in words. The size (`exit_tb`), the hours (`exit_admin_h`), and any other bill (`exit_other_usd`) are typed fields in the claim zone, off the address; the hours and the bill have no source and say so. The size runs to `exitTbLimit`, 80 TB at the defaults (Python's `exit_tb_limit`), and its caption says the model counts one four-bay box per copy at any size; the size where that box meets the cloud's drives-only figure prints beside the rows (`tb_at_energy_tie`), and every figure beside the rows carries the claims and assumptions the model's trace finds it reads. Paybacks print as a crossover does: central, the range from one change, "or never". Under the Reading, one 0.9375rem sentence gives the selected row's holder its three (one copy on the node, or three copies across Nations' nodes, against S3, R2, and B2); all six stand in the Table view. A move row's paid hours stand as a fourth figure beside its price, carbon, and water, labeled "assumed, no source", since the comparison's title is about them. In the price view the move head names the basis once ("list egress plus the assumed hours"), so each move prints its price and spread on one line; year rows keep their basis line. In carbon and water, a group whose rows carry no bar says so once in its head, never on each row.

**The custody setting** (second version, 11/05/2026). "Where this data may be held" stands over the plot in the kit's switch, because it filters that plot, with the fixed line under it word for word: each Nation decides for itself. It is not a global selector. A row whose holder the rule does not allow leaves the comparison whole, with no figure changed, and `V.keeps` is the one test. It keeps its place on the plot as the kit's ghost row (label at 40 percent, no mark, "leaves at this rule:" and the first clause of its reason in secondary ink), so the plot keeps its shape and says where the row went; the arrows and clicks step past it, and its table row keeps the words and no figure (W9 critique, 11/05/2026: hidden rows left a void). The live count leads the switch in heading ink, and the fixed line follows at 0.9375rem in secondary ink. Directly under the plate a block lists each row that left, under the label "Rows that leave, each with why it does not meet the rule", with its figures and its reason, and a table of what the rule costs on four lines (idle watts, paid hours, price with its basis, energy), stays against leaves, and says where the rows that stay run higher and lower. Rows that stay with a note print it. The words come from `V.custody`, so the page without scripts prints the same block for each rule at the defaults. The model never converts consent or custody to a number, and the page never ranks the three options.

**Cloud admin hours** (owner rulings 5 and 23, 11/04/2026 and 11/05/2026; not settled): comparison A keeps the two assumed hours a month as a visible input, typed over the model and never in the
address, with the point where the price order flips printed beside it, read from `stability` (the top of the input's spread, 14), and the tie at the settings shown, which
is lower. The note beside it says what a seat includes, as an assumption with no source: a cloud seat's price includes sign-in, permissions, and access control, which a local
suite has to provide itself; the record does not say how much of the local suite's 14 hours that work takes, and the note points to the tie, not to 14 (fairness pass, 11/05/2026). **The Tribally owned facility's PUE** (lf-059, owner ruling, 11/04/2026) is anonymized and attributed to its public source: the page names neither the facility
nor the Nation, and the receipt links the operator's own report. `site/data/claims/anonymized.json` holds that public wording by hand, because the local evidence record
names both and `scripts/build_plates.py` holds it back.

## 7. Method (tab 9) and the disclaimer band

Disclaimer band (every tab, one line at 1440, 0.9375rem NS, body ink): "Modeled estimates, not measurements. Ranges are spreads, not confidence intervals. An
open-book model, checked against published figures. Method. Nothing you type or choose leaves this page. GitHub, which hosts the site, logs each visitor's IP address." with Method a link to `#method`
(5a, 11/06/2026: the site promises only what it can keep, so "The public site receives nothing" is gone). The owner named it the Open-book model (ruling 21,
11/05/2026). The Method panel says once, plainly, what the name means (every input is a published figure or a labeled assumption, shown with its receipt; every other number is
arithmetic on those inputs; nothing is fitted) and keeps exactly one technical line: "a bottom-up engineering model; it estimates no coefficient from data, so it is not
econometric." The Method panel, in two text columns at 44rem each beside the back-test plate: the full disclaimer (RESOURCE-MODEL.md section 14, verbatim, which carries both),
the method sidebar text (COPY-INPUTS section 2) with the plain sentence that the idle term is untested, calibration, the trend-controlled regression table (four specifications, se only), sensitivity rankings, what the illustrations stand for (`scenario_labels`), the families of the illustrative carbon damage, the field protocol "Measure it yourself"
(COPY-INPUTS section 3, five instruments, what each finding replaces, its figures poured from `field_lines()`, with links to `docs/FIELD-PROTOCOL.md` and `scripts/fit_idle.py` in the public repository, since `site/` alone is served, and the plain sentences that nothing you type or choose is sent anywhere, since the page does its arithmetic in your browser, and that GitHub, which hosts the site, logs each visitor's IP address), downloads (`resource-model.json`; `inputs.csv` from the inline inputs; `outputs.csv`
of every row at the current settings, generated in the browser as a Blob, no fetch), the model version line ("Model version: schema 1, built 11/04/2026,
prices as of 11/04/2026, inputs hash xxxx" from the build), and "How to cite" with the task force as author and the URL. Sovereignty, consent, resilience, and
custody stay in words in `qualitative` columns beside the numbers on tabs 3 and 4; the page never converts them.

## 8. Live computation and files

Script and page budgets live in one place, `tests/budgets.json`; `scripts/page_check.js` and `tests/test_plates.py` read them there, and they warn and never fail.

- `site/assets/js/resource-model.js` (pure, no DOM, a `module.exports` guard so node loads the same file the page loads; the page reads `window.resourceModel`): the equations
  (`idleMult`, `tokensWh`, `tokensUsd`, `layer`, `four`, `wGenNw`, `selfRun`, `projectScale`), `compute` (the catalog, hour baseline, places, the five comparisons with
  crossovers and paybacks, the levers, `upkeep`, `fieldLines`), `Run` (spreads and `drivers`: each input at its ends and each setting at its options, the same procedure as Python, so any combination of the 21
  settings, the Your Use counts, and a reader's readings computes live), `custodyView`, `applyMeasured`, `movedRows`, `measuredLine`, `carbonDamage`, `damageColumn`, `readScenario`, `Views` (what the page says at one state, so the build prints the words the page computes), and the number formats, which print no trailing zero, as the plates do.
  Python stays canonical; the JS never introduces a coefficient. `site/assets/js/explorer.js` holds the page around it: painting, selection, the drawer, the address.
- `scripts/resource_model.py --export` writes `site/data/resource-model.json` for download, and `--oracle` writes the oracle, `work/site-refresh/tmp/explorer-oracle.json`: 300 seeded settings and
  counts (seed 20261104; the first is the default), each with Python's tree, spreads, drivers, crossovers, and Your Use by layer.
- `scripts/build_explorer.py` slims that file for the inline block (inputs with low and high; assumptions; the boards, words, and default rows; no `selectors` branch), writes it
  as `<script type="application/json">` in `site/explorer/index.html`, and pours the page's words and geometry from `resource-model.js` through `scripts/explorer_static.js`.
- `scripts/page_checks/explorer.js` (`node scripts/page_check.js --page explorer`, jsdom): runs the page's real scripts against every oracle case; every value within 1e-9, far inside
  the 0.5 percent the page's own check prints, crossover and payback "never" states equal, the custody view word for word, then Python's typed values, refusals, and damage figures. It skips nothing: a missing oracle is a failure that names the fix.
- **A reader's own reading.** Settings, Your Own Readings: eighteen inputs (`measured` in the model), each with its field beside the model's figure, spread, claims, and input name. A typed value recomputes for this page's life, takes no spread, and never enters the address or the claims record. The label comes from `D.measured.label` and never from input: it stands on every row the value reaches (`readingReach`: every row it moved, and every row that reads the input, found with the input at its model low and high, so an equal value that only narrows a spread still labels its rows), in the plots and tables; the Reading of a moved row ends with `measuredLine`, so Copy Reading carries it; the line stands at the foot of every plate of rows, and on a plate with no moved row it names the reading without "Includes" and ends "No row on this plate uses it." (`measuredLine(D, records, false)`, Python's `measured_line(records, used=False)`); `outputs.csv` opens with it, quoted, and a `measured` column holds the label on every moved row. A bad value is refused with what is allowed, and the figures keep the last good one.
- **The carbon damage control.** Off by default, in Settings, and off the address. A family shows low, central, and high, never one number, in its own currency and year, in a line under the Reading that says whose estimate and of what ("EPA 2023 report, CO2 emitted in 2020, an estimate: $0.02 (0.013 to 0.036), 2020 USD, for this row's CO2e"), a column of its own in every table of rows (head "Damage" and the currency, or "Avoidance cost" for the two avoidance families, from the family's kind; the family named once in the caption), and beside a project's tonnes once they print. The two European Commission families are avoidance costs: their head is `column_avoidance` ("illustrative avoidance cost, not a damage estimate, not a price, not federal policy") and their note opens "Not a price." `compute` never reads it, and it never joins a price. Each family is one edition of its source, its price year and emission year moved together, and nothing is converted between currencies or price years. A family whose source recommends two cases side by side (two pure rates of time preference, or two discount rates) prints both and says "no central in the source"; it never calls one of them the central rate. Owner ruling of 11/05/2026: the control uses the newer editions (EPA's 06/2019 domestic table, Umweltbundesamt Methodenkonvention 4.0); the earlier ones (ex-008 to ex-011) stay in the record and in Sources as dated history. Without the model's `carbon_damage` block the build leaves out the control, the column, and the Method table; a check loads the page that way.
- **The scenario file (idea E5).** Settings holds Save and Load. Save warns first, in these words: "This file may hold your Nation's figures." The file holds the settings, wage and tariff among them, the Your Use counts, typed values, readings under their input names, the custody rule, and the damage family, and it goes to the reader's own machine as a Blob. Load reads a local file: `readScenario` treats it as untrusted, takes only known names and allowed values (a typed figure meets the same rule a live field does, `typedOk`: a finite number from its floor to 1,000,000,000, and the size to `exitTbLimit`), reads no label and no sentence from it, refuses the whole file on any problem, lists each problem, and changes nothing. A project's typed load stays out, as it stays out of the address. The address keeps the global selectors only, in its fragment.
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
