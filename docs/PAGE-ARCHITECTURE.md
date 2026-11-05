# Page Architecture: Data Centers and AI (11/04/2026)

Binding inputs: DESIGN-SPEC.md section A (overrides the rest), COMPARISON-METHOD.md (the signature family), CRITIC.md (pairs that never share an axis; superseded ids), content-inventory.md, and the six claim
files. PLATE-KIT.md did not exist when this was written; section 3.0 states what the kit must provide, not how. Every number on a plate carries a claim id with status `verified`, or `partly` with its limit
printed. Dashed means projection and nothing else. Hollow means modeled or estimated; filled means measured, agency, or company-reported. Orange is the needle and the selection only. Chart form choices follow
the dataviz skill's form table (one axis; emphasis over categorical; diverging for polarity; dumbbell for before and after; small multiples instead of dual axes).

## 1. Site Map, Titles, and Tabs

No new subpage. The pages keep their paths and titles: `site/data-centers/` "Data Center Task Force" (DC), `site/data-centers/resource-use/` "What Uses Data Center Energy and Water" (RU), `site/ai/` "Artificial
Intelligence Task Force" (AI). Changes: DC gets the `.subnav` RU already has (Overview | Energy and Water Use), so RU is reachable from DC's chrome and not only from one notice; RU's main nav loses the stray
`aria-current="true"` on Energy; AI's footer and Energy tab link to RU. DC and AI become workbenches (spec A3): the old `.toc` is the tab strip, one panel visible at a time, hash deep links. RU is the long
reference page (spec A5): no tabs, the 14rem rail at left, prose at 44rem, each section's table or bench row in the right column. Every existing h2 id survives inside its panel (the kit opens the panel
containing a hash target), so old links land: DC `#purpose` and `#why-now` open Overview, `#environmental-impacts` opens Tradeoffs, `#alternatives` opens Policy; AI `#purpose` opens Overview. RU's duplicate
`id="water"`: the h3 becomes `water-use`, the h2 keeps `water`.

| Page | Tab (label, panel id) | Holds | Signature plate |
|---|---|---|---|
| DC | Overview `#overview` | Purpose (slot `charge`), Why Now (slot `why-now`), pull figure (PGE rate change), Library feed (`#library`) | `dc-pnw-load` |
| DC | Growth `#growth` | new prose; EIA, LBNL, IEA, forecast misses | `dc-eia-servers` |
| DC | Tradeoffs `#tradeoffs` | Environmental Impacts (slot, as details); matrix, cooling instrument, water intensity | `dc-tradeoff-matrix` |
| DC | Jobs `#jobs` | per-MW instrument with the state audits; bench rows to the AI Work plates | `dc-jobs-per-mw` |
| DC | Policy `#policy-landscape` | Tribal, State, Federal (3 slots), Sovereign and Federated Alternatives (slot), Policy Watch (`#policy-watch`) | instrument grid (static figure, no numbers) |
| DC | Questions `#questions` | the eight checklists (slot `questions`) as a details grid; project view | `dc-project` |
| AI | Overview `#overview` | Purpose (compact), the hour comparison, Library feed (`#library`) | `ai-same-hour` |
| AI | Energy `#energy` | per person per day, heavy AI, scale; water and carbon disclosures; what would change the answer | `ai-heavy-ai` |
| AI | Work `#economics` | h2 "Economics and the Global Frontier"; the held slot block untouched; occupations, displacement evidence | `ai-occupations` |
| AI | Companies `#companies` | money multiples, capex against cash, footprint multiples, 2026 guidance, holdings | `ai-company-money` |
| AI | Working with AI `#working-with-ai` | slot `working-with-ai` as a details grid; TSDF tier-by-use grid as the figure | tier grid (static) |
| AI | Youth and Education `#youth-education` | slot `youth-resources` as a details grid; the evidence-label key as the figure (no Bastani claim row exists, so no plate) | label key (static) |
| AI | Data Sovereignty `#data-sovereignty` | existing section and two buttons; link to the tier grid | shared tier grid |
| AI | Policy Watch `#policy-watch` | existing `data-policy-watch="ai"` block | the follow list (a tool, exempt) |

## 2. First Screens and Opening Sentences

Every panel starts with its h2 (compact), then its signature plate; the opening sentences sit in that plate's claim zone (spec A5); the rest of the panel's prose is a `<details>` grid under the plate, two or
three across. Draft wording; the voice editor polishes.

**DC Overview.** `dc-pnw-load` fills the first screen; Purpose and Why Now follow as details; Library feed last. "The Data Center Task Force exists because the largest new electricity load in a generation is
arriving in the Council's four-state region, and member Tribes are being asked to host it, supply it, or live beside it. The Council's own workbook puts data center and chip fab load at about 2,500 average
megawatts in 2030, with its low and high inputs far apart. ATNI takes no position for or against; this page gathers what is measured, what is modeled, and the questions a Tribal government can put to a
developer."

**DC Growth.** `dc-eia-servers` first; LBNL, IEA, misses below in that order. "Three public forecasts count different things: EIA counts servers only, LBNL counts the whole building, and the IEA counts the
world. They sit on separate plates because their boundaries differ, and the last plate shows how far earlier editions landed from later ones."

**DC Tradeoffs.** `dc-tradeoff-matrix`, then `dc-cooling`, then `dc-water-intensity`; Environmental Impacts as details. "A data center's tradeoffs are a set, not a list: cooling that saves water uses more
power, and more power means more water and carbon at the plant. The matrix shows what is measured for each of seven tradeoffs and what is still unknown; the instrument below it lets a reader set a project's
size, cooling, and grid and read the water and power that follow."

**DC Jobs.** `dc-jobs-per-mw` first; bench rows link to `ai-occupations` and `ai-displacement`. "A data center brings many jobs while it is built and few once it runs. The ratios here are modeled and labeled;
the state audits show what tax preferences bought in Washington and Georgia. What AI itself does to occupations is on the AI page's Work tab."

**DC Policy.** The instrument grid first (columns Tribal, State, Federal; rows siting, water, rates, data, consultation; cell text from the existing prose), then Tribal, State, Federal, Alternatives as details,
then Policy Watch. "Tribal governments have restricted and hosted data centers under their own law; states have mostly written rate design, not consultation; federal policy favors speed. The grid shows who
decides what today, and the saved searches below follow the dockets that move it."

**DC Questions.** `dc-project` first; the eight checklists as a details grid, each summary the group name. "Before the checklists, a reader can enter a proposal's megawatts and load factor and read its annual
energy, its share of the region's 22,000 average megawatts, and its site water at the applicant's own figure. The checklists then ask what the numbers cannot answer: consent, land, water, power, rates, jobs,
data, and exit terms."

**AI Overview.** `ai-same-hour` fills the first screen; Purpose (charge, pull quote) as details; Library feed last. "Resolution #2026-039 charged this task force with how AI changes what can be taken from a
Tribe and who controls the tools. The first question most readers bring is whether their own chat use is the problem, so the page starts there: one hour of chat, video, and a short-video feed on the same phone,
each segment labeled measured or modeled."

**AI Energy.** `ai-heavy-ai`, then `ai-per-day`, then `ai-scale`; disclosures (water per prompt, carbon, known weaknesses, what would change the answer) as details; the fixed panel sentence with links to DC
`#questions` and `dc-project`. "The same model, three more ways: inside the data center per person per day, heavy AI work against a video yardstick, and all of ChatGPT's text messages against the buildout. This
comparison does not decide a proposal. It says nothing about a site, a stream, a rate class, or Treaty-reserved rights; those questions are on the data centers page."

**AI Work.** h2 "Economics and the Global Frontier"; the held slot block stays exactly as it is, first; then `ai-occupations`, `ai-jobs-sector` (BLS 2025 to 2035 by sector, jb-097 to jb-102; percent on the axis, job counts in each row's detail), and `ai-displacement`. Opening, outside the slot markers: "The written brief for
this section is in development. The measured record is here now: the Bureau of Labor Statistics' ten-year projection by occupation, including the trades that build data centers, and the studies that have looked
for AI's effect on employment so far, which disagree and are shown together."

**AI Companies.** `ai-company-money` first; the other four below. "Seven companies are financing most of the buildout. Their filings show capital spending passing operating cash flow at some of them, cash and
securities falling, and debt rising; their own reports show electricity, water, and location-based emissions over the same years. Fiscal years differ (Microsoft June, Apple September, NVIDIA January), and every
axis says so."

**AI Working with AI, Youth and Education, Data Sovereignty, Policy Watch.** No plate. Each opens with its existing first paragraph cut to two sentences (the inventory's filler lines removed), then the existing
content as a details grid.

## 3. Plate List

### 3.0 What every plate needs from the kit

Three zones (spec A4); detail panel with Reading, Sources, Table; selection by click, Enter, arrows; receipts per row; query state; print shows the table. Beyond `ladder`, `bars`, `lines`, `multiples`, the
plates below need: (a) **instrument**: number and range input pairs whose output rows the page module computes from values poured from claims, with the default setting built statically so no-JS and print show
the illustration and a line naming it; (b) **matrix**: rows by columns of cells, each cell a figure plus an evidence square, one cell selectable; (c) **count** as a second view of a ladder: one 8px square per
unit up to 200, remainder printed; (d) **band**: a 10 percent wash between a low and a high series on `lines` and `multiples`, dashed past the last historical year; (e) **two rulers in one plate** with separate
axes and group labels, for bases that must not share an axis; (f) series read from a claim's `series` object (resources) and from the finance `series_fiscal_year_ends` list; (g) a row that cites two or more
claim ids and shows every receipt.

Fields per plate: question; title at defaults; data (claim ids); form and why; controls and defaults; detail on selection; Reading template; table columns; excluded, and why; projection marking.

### 3.1 The comparison family (owner's top priority)

**`ai-same-hour`** (AI Overview). Question: does my chat hour use more than my video hour? Title: "On the same phone, ten text prompts add about 3 Wh in the data center and an hour of video about 2 Wh in the
data center and network; the screen and router add 12 Wh to either hour (modeled, 11/2026)". Data: comparison-model.json view `same_hour`, every id in its `inputs[].claims` (fp-001 to fp-135 as listed there);
rows Chat (N prompts), Streamed video hour, Short-video feed hour (modeled from Meta-commissioned ENGIE figures fp-053 to fp-055, capped by Meta's fleet average fp-059), then everyday rows: LED bulb hour 5.9 to
10.5 Wh (fp-135), phone charge 19 Wh (fp-073), television hour 100 Wh, 40 to 120 (model input `tv`), household day 28,740 Wh (fp-075, derived). Form: log ladder, Wh per hour, 0.1 to 100,000 ("each mark is ten
times the last"); one square per row with its low-to-high context line; no stacked segments on the log ruler; the selected row's four segments (data center, network, router, device) appear in the detail panel
as a thin segmented bar on a linear scale, each segment marked measured or modeled. Second view, Count: one square per 0.30 Wh text prompt. Controls, mapped to `assumptions` keys: boundary {data center only |
adds (data center plus network) | whole hour}, default whole hour; `prompts_per_hour` slider 1 to 60 with a number field, presets 2.52, 10, 30, 60, default 10, labeled the reader's assumption; `chat_kind`
{short text 0.30 | medium 1.215 | reasoning 3.91 | high reasoning 17.15}; `device` {phone | laptop | TV}; in a details "More assumptions": `connection`, `network_mode`, `router_allocation`,
`video_dc_intensity`, `chat_wh_per_prompt` 0.24 to 0.60. Everyday rows print "Not counted at this boundary" except at whole hour. Detail: value, range, segments, the setting line, receipts. Reading: "At
{boundary}, {row} uses about {value} Wh for the hour ({low} to {high}); {segments}. Modeled from {sources}, {date}." Table: row, boundary, four segments, total, low, high, measured segments, claims. Excluded:
every stored cross-boundary ratio (fp-077 to fp-082, fp-084, fp-085); the Greenspector chat device uplift (fp-086, fp-087, set aside by the method); any "chat is X times video" sentence; a carbon view (no
Pacific Northwest grid factor in the record). Projection: none. Fixed foot line: "This comparison does not decide a proposal", linking to DC `#questions`.

**`ai-per-day`** (AI Energy). Question: inside the data center, what does one person's day cost? Title: "An average weekly ChatGPT user's text prompts cost about 1 Wh a day in the data center, a floor; Meta
reports 15 Wh per daily person for all its products, on another boundary (2024 to 2025)". Data: view `per_person_day`: chat day 3.67 x 0.30 = 1.10 (fp-034, fp-001; low 0.86, high 4.80 with the count of 8 marked
unsourced, fp-094); at the 0.34 average 1.25 (fp-012); YouTube 88 minutes on a phone 0.66, 0.25 at the DESNZ follow-up, 80.7 at the top-down upper bound (fp-098); Instagram 100 minutes 0.29, 0.11 at the DESNZ follow-up, capped at 15.1 (fp-097); Meta per daily active
person 15.1 (fp-059, fp-060) in its own group "another boundary: all products, training, offices". Form: horizontal bars, linear Wh, two groups with a rule between (a bar chart because the values span 0.3 to 15
on one basis per group); hollow where modeled. Controls: `chat_messages_per_day` {3.67 | 8, unsourced}, `video_dc_intensity`, `chat_wh_per_prompt`. Detail: the arithmetic (median times mean, labeled a floor),
the household share (fp-075: 0.0038 percent), receipts. Reading: "{row}: about {value} Wh a day inside the data center ({basis}); {share} percent of a household's 28,740 Wh. {evidence}, {year}." Table: row, Wh
per day, low, high, basis, boundary, claims. Excluded: fp-058 (wrong at source), the withdrawn 53 percent rise, fp-084 as a ratio, fp-026 as a mean. Projection: none.

**`ai-heavy-ai`** (AI Energy, signature). Question: how heavy is heavy AI? Title: "A text prompt is seconds to minutes of streaming; an AI video clip is minutes to hours; an agent session is hours on every
yardstick (modeled, 2025 to 2026)". Data rows: one text prompt 0.30 (fp-001, fp-017); reasoning query 3.91 (fp-019); GPT-5 high reasoning, long query 33.8 (new claim from fp-025's note, section 4); image 0.63
(new derived claim, fp-066 x 2); Veo 3 clip 30.8 (fp-070); Sora 2 Pro clip 315 to 534 (new claim from fp-070's note); Wan2.1 1.3B 90.5 (fp-068); Wan2.1 14B 415.1 (fp-069); CogVideoX 944 (fp-067); Claude Code
prompt 150 (fp-031), median session 600 (fp-032), average day 3,000 (new claim from fp-032's note). Yardstick ticks on the ruler in context ink, labeled: the phone video hour 14.1 (model view 1), the published
European hour 188 with 53.7 to 263.1 (fp-035, fp-120, fp-143), the data center segment alone 0.45, 0.171 at the DESNZ follow-up (fp-122, fp-130, fp-141, fp-142). Form: log ladder, Wh, 0.1 to 10,000; squares, hollow for modeled rows;
each row's overhead in its label suffix (GPU only; no PUE; one user's logs). Controls: yardstick {phone hour | published hour | data center only}, default phone hour; `device`; `video_dc_intensity`. Detail: Wh,
prompt equivalents, hours of the chosen yardstick, the overhead sentence, receipts. Reading: "{row}: about {value} Wh, or {prompts} text prompts and {hours} of {yardstick}. {evidence}, {year}." Table: row, Wh,
low, high, prompts, hours by each yardstick, overhead, claims. Excluded: fp-071, fp-072 (2009 search); fp-030 (test conditions); fp-065 (2023 image, older method); any Anthropic chat figure (fp-033 records
none). Projection: none.

**`ai-scale`** (AI Energy). Question: is chat the growth? Title: "All of ChatGPT's text messages are a few tenths of a terawatt-hour a year on a median-prompt floor; the buildout adds hundreds (2025 to 2030)".
Data: ChatGPT 2.5 billion messages a day x 0.30 Wh = 0.27 TWh, 0.22 to 0.55 (fp-092, fp-001); YouTube 1 billion hours a day, a 2016 floor (fp-050): 0.47 on measured delivery, 0.18 at the DESNZ follow-up, 57.8 at the top-down upper bound, whole chain 68.6
with 19.6 to 96 (fp-035, fp-120, fp-143); IEA bound for all searches as AI queries, under 4 TWh (dem-045); IEA 2025 485 (dem-040); LBNL US 2024 192 (dem-028); Council data centers 2030 17.7 TWh, 11.4 to 38.8
(new derived claim from dem-075); IEA 2030 945 (dem-048) and LBNL 2030 649, 521 to 843 (dem-029, dem-030) as projections. Form: log ladder, TWh a year, 0.1 to 1,000; squares with range lines; projection rows
hollow with a dashed range line and "2030, projected" in the label. Controls: `chat_wh_per_prompt` {0.24 | 0.30 | 0.34 | 0.60}; `video_dc_intensity`. Detail: the arithmetic, the exclusions (reasoning, images,
video, agents, API, training), the Jevons pair fp-009 against rs-003, receipts. Reading: "{row}: about {value} TWh a year ({low} to {high}); {basis}. {evidence}, {year}." Table: row, TWh, low, high, year,
basis, boundary, claims. Excluded: Gartner 980 (no claim); any share of the 2030 Pacific Northwest load made of chat; the OpenAI compute lead (method section 13, no claim). Projection: the two 2030 rows,
dashed.

**`dc-project`** (DC Questions, signature). Question: what would this proposal run? Title: "A 100 average-megawatt project uses about 0.9 TWh a year, 0.45 percent of the region's 22,000 aMW, and 240 to 1,000
million liters of site water a year at the operators' own water figures (illustration)". Data: region 22,000 aMW (dem-058); consumption-basis water per kWh Microsoft 0.27 (tr-028), LBNL 0.36 rising to 0.45 to
0.48 (tr-009), Google 1.15 (fp-006); generation water 4.52 L per kWh, 2023 national grid (tr-005); Council 2030 data center input 2,020 aMW (dem-075) as a context row. Form: instrument; outputs as ruled rows
with a thin ruler each (aMW, TWh a year, share of region, site water low to high, generation water). Controls: MW (number and range, 10 to 2,000, default 125), load factor (0.5 to 1.0, default 0.8), applicant's
L per kWh (number, blank by default, then the spread shows), "count water at the power plant" (off by default: the reservoir evaporation convention is unstated). Detail: the equations printed (aMW = MW x LF;
TWh = aMW x 8.76 / 1000), each factor's receipt. Reading: "{MW} MW at {LF} load factor is {aMW} aMW, about {TWh} TWh a year and {share} percent of the region's 22,000 aMW; site water {low} to {high} million
liters a year at 0.27 to 1.15 L per kWh. Modeled from the reader's inputs, {date}." Table: output, value, low, high, factor, claims. Excluded: Meta 0.19 and Amazon 0.12 (withdrawal basis); any per-facility
figure. Projection: none. Foot links to the Water and Power checklists on the same tab.

### 3.2 Growth

**`dc-eia-servers`** (DC Growth, signature). Question: how fast does the federal outlook see data center electricity growing? Title: "EIA's baseline puts data center servers at 105 billion kWh in 2025 and 178
by 2030; its high case reaches 819 by 2050, servers only (AEO2026)". Data: annual 2025 to 2050 server series for four cases from the demand reader's raw pull (`series` on dem-001 for cb2026 and dem-004 for
higheldmd, plus two new claims for hm2026 and lm2026; quads x 293.07); anchors dem-001 to dem-005, dem-013 to dem-018, dem-021; commercial sales dem-006 to dem-008 for the share. Form: lines, BkWh; the
Counterfactual Baseline as the selected line, a band from the lowest to the highest case, the other cases in context ink; dashed after 2025, the only historical point. Controls: case {Counterfactual Baseline |
High Electricity Demand | High macro | Low macro}; the needle snaps to the nearest year. Detail: the year's value for every case, the server share of commercial sales (dem-016, dem-017), the "servers only"
boundary sentence, receipts. Reading: "{case}: {value} billion kWh for data center servers in {year}; the four cases span {low} to {high}. EIA AEO2026, servers only, 04/2026." Table: year, four cases, share of
commercial. Excluded: STEO series (different horizon); LBNL (whole facility: never on this axis). Projection: 2026 on, dashed.

**`dc-lbnl-us`** (DC Growth). Question: how much do US data centers use, whole building? Title: "LBNL counts 192 TWh for US data centers in 2024 and 649 by 2030 in its reference case, within 521 to 843 (2025
Update)". Data: 2024 192 (dem-028), 2028 464 (dem-033), 2030 649 (dem-029), band 521 to 843 (dem-030), sensitivities 578 and 782 as hollow squares (dem-031, dem-032), EPRI 2030 380 to 790 as a labeled range
mark (dem-051), 2023 to 2024 growth 14 percent (tr-064); 148 GW (dem-034) and 33 percent of load growth (dem-035) in detail. Form: lines, one series, the 2030 range as a context line with the square; dashed
from 2024. Controls: year needle only. Detail: value, boundary (servers, storage, network, cooling, power), receipts. Reading: "{year}: {value} TWh for all US data centers ({low} to {high} where a range
exists). LBNL 2025 Update, whole facility, 06/2026." Table: year, TWh, low, high, case, claims. Excluded: dem-036, dem-037 (superseded edition, used only in the misses plate); EIA servers; BNEF and Grid
Strategies GW (capacity, not energy: detail text only). Projection: 2025 on, dashed.

**`dc-iea-world`** (DC Growth). Question: and the world? Title: "The IEA counts 485 TWh for the world's data centers in 2025, up 17 percent, and about 945 by 2030 in its base case". Data: 2024 415 (dem-046, the
one id for the three records), 2025 485 (dem-040), 2030 945 (dem-048; dem-041's 950 printed as "about 945 to 950"), growth 17 percent (dem-042), AI-focused 50 percent (dem-043), US share 45 percent (dem-047);
CO2 150 Mt now to 350 Mt by 2035 (tr-035) in detail. Form: lines, one series, dashed from 2025. Controls: year needle. Detail and Reading as `dc-lbnl-us`, source "IEA, global, 04/2026". Excluded: dem-049 (state
share, partly); tr-033, tr-034 duplicates. Projection: 2026 on, dashed.

**`dc-forecast-misses`** (DC Growth). Question: how far off were earlier forecasts? Title: "Earlier forecasts missed in both directions: LBNL's 2016 outlook saw 73 billion kWh for 2020 and the 2024 report found
176 TWh by 2023; EIA's May outlook for 2027 commercial growth was 5.3 percent and October's is 2.8". Data: panel LBNL, US TWh: 2016 vintage 2014 70 (dem-038) to 2020 73 forecast (dem-039); 2024 vintage 2023 176
(dem-036) with 2028 range 325 to 580 (dem-037); 2025 vintage 2024 192 (dem-028), 2028 464 (dem-033). Panel EIA STEO, 2027 commercial growth: 05/2026 5.3 (dem-023), 10/2026 2.8 (dem-022). Panel BNEF, installed
GW: 12/2025 106 for 2035 (dem-055), 07/2026 118 for 2030 and 194 for 2035 (dem-053, dem-054). Form: multiples, one panel per source with its own axis (units differ, so no ratio axis); earlier vintages hollow
and labeled "superseded by ...", the current one filled; forecast segments dashed. Controls: none. Detail: both figures, their dates, the boundary, receipts. Reading: "{source}, {vintage}: {value} {unit} for
{target year}; the {later} edition gives {value2}. Each edition on its own axis." Table: source, vintage date, target year, value, unit, superseded by. Excluded: fp-047 (streaming, not demand); ratios between
vintages (no derived claim). Projection: the forecast segments, dashed. This is the one plate that charts ids the critic lists as superseded (dem-023, dem-037, dem-055, dem-036, dem-038, dem-039), always as
earlier vintages; the owner should confirm.

**`dc-pnw-load`** (DC Overview, signature). Question: what is coming to the Council region? Title: "The Council's workbook puts data center and chip fab load at 2,475 average megawatts in 2030 (1,513 low, 4,989
high) in a region that uses 22,000 today". Data: panel Tech load input: 2029 mid 2,198 (dem-076), 2030 2,475 with low and high (dem-073), 2046 2,958 with low and high (dem-074), data centers only 2030 2,020
(dem-075). Panel Region: 2025 22,000 (dem-058), 2046 growth 7,645 to 17,820 printed as 29,600 to 39,800 with its caveat (dem-071, derived), Mixed Bag growth 11,937 with data centers 20 percent (dem-062,
dem-063). Detail rows: PNUCC ten-year growth 7,900 (dem-068), BPA 2036 deficit 3,514 (dem-069), E3 9 GW gap with "without any new resource additions" (dem-070), dem-059 as the spring 2025 initial forecast only,
the dem-061 caveat. Form: multiples, two panels, aMW; the tech load mid as a dashed line with a band low to high; the region panel's 2046 as a range mark; squares hollow (workbook inputs). Controls: year
needle. Detail: the level-or-increment caveat (dem-073), the region definition (a power region, not a watershed), receipts. Reading: "{year}: the Council's {series} input is {value} aMW ({low} to {high}), about
{share} percent of today's 22,000 aMW. Northwest Power and Conservation Council draft Ninth Plan workbook, 08/2026." Table: year, low, mid, high, series, claims. Excluded: dem-064 (second-hand 2,200); GW
figures on the aMW axis; any named facility. Projection: after 2025, dashed. Pull figure beside it in the Overview prose: "+29 percent, average rate change for data centers in PGE's territory, Oregon PUC, 2026"
(dem-067), captioned with the residential 1.3 percent decrease (new claim, section 4); dem-065 and dem-066 in the text.

### 3.3 Tradeoffs

**`dc-tradeoff-matrix`** (DC Tradeoffs, signature). Question: what is known about each tradeoff? Title: "Of seven tradeoffs, power, water, and carbon are measured at national scale; land, heat, and materials
rest on one or two modeled figures". Data, rows by columns "National scale" | "Per unit" | "Open question": Water: 66 billion L on site 2023 (tr-001), about 800 billion L at power plants (tr-004) | 0.36 L per
kWh site (tr-009), 4.52 at the plant (tr-005) | watershed and season. Power: 192 TWh 2024 (dem-028) | PUE 1.45 (tr-065) | workload split (no disclosure). Emissions: 61 Mt 2023 (tr-006), IEA 150 Mt now (tr-035)
| 545 g per kWh at hyperscale sites, preprint, against 370 national (tr-038, plus a new derived claim for 370) | embodied carbon per rack. Air: Memphis permit 87.14 t NOx a year (tr-047), Virginia backup
generators under 4 percent of regional NOx (tr-051) | health burden over 20 billion dollars a year, modeled (tr-044) | regional monitoring. Land: new builds average 200,000 sq ft of floor (tr-054) | one campus
400 acres (tr-055) | land per MW. Heat: +2 C land surface around AI sites, preprint (tr-053) | reuse 0.69 to 0.86 MWh heat per MWh, vendor (tr-061) | air temperature. Materials: copper 0.6 to 1.1 Mt by 2028
(tr-056) | TSMC 153.3 L per wafer layer (tr-032), e-waste 8.6 to 13.1 Mt a year by 2030 (tr-057) | embodied impacts upstream. Form: matrix; each cell a figure in tabular numerals and a 6px square, filled for
agency or measured, hollow for modeled, preprint, or vendor; the third column is words. Why: coverage and gaps read at once, which no bar list shows. Controls: none. Detail: the cell's value, boundary, evidence
label, receipt. Reading: "{row}, {column}: {value}. {evidence}, {year}. {boundary}" Table: the matrix as rows. Excluded: tr-045 (superseded), tr-048 (allegation), tr-003 and tr-050 (superseded LBNL basis),
give-backs tr-023, tr-027, tr-030, tr-043 (never netted). Projection: none.

**`dc-cooling`** (DC Tradeoffs). Question: what do size, cooling, and grid turn into? Title: "A 100 MW site at the 2024 national PUE uses about 1.0 TWh a year; evaporative cooling at the operators' figures
consumes 280 to 1,200 million liters on site, and the power plants about 4,600 million more". Data: PUE 1.45 all facilities, 1.145 AI-serving (tr-065); site water per kWh by cooling choice: evaporative at
Microsoft 0.27 (tr-028), LBNL 0.36 to 0.48 (tr-009), Google 1.15 (fp-006); closed loop or dry: 0 on site, the energy penalty printed as "not in the public record" (tr-010, tr-019); generation water 4.52 L per
kWh (tr-005); carbon per kWh by grid {national 370 (new derived claim from tr-038) | hyperscale-weighted 545 (tr-038) | LBNL 0.34 kg (derived, tr-006 over tr-007) | reader's own}. Form: instrument; outputs as
ruled rows with thin rulers: electricity (TWh a year), site water (million L), generation water, CO2 (Mt); in the detail, a two-segment bar "water here, water at the plant". Controls: MW (10 to 2,000, default
100), load factor (default 0.8), PUE {1.45 | 1.145 | typed}, cooling {evaporative at Microsoft | at LBNL | at Google | closed loop or dry}, grid carbon {four stops}. Detail: equations, each factor's receipt,
the tr-010 sentence ("air-cooled chillers use no water; they use more energy"). Reading: "{MW} MW at PUE {PUE} and {LF} load factor: about {TWh} TWh a year; on-site water {site} million liters ({cooling});
water at the power plants about {gen} million liters (2023 national grid); CO2 about {Mt} Mt at {grid}. Modeled from the reader's inputs." Table: output, value, factor, basis, claims. Excluded: Meta 0.19 and
Amazon 0.12 (withdrawal per IT kWh); tr-029 (an expectation); any PNW grid factor (none in the record). Projection: none.

**`dc-water-intensity`** (DC Tradeoffs). Question: how much water per kWh, and on what basis? Title: "On a consumption basis, operators report 0.27 to 1.15 liters per kWh; withdrawal figures sit on their own
ruler because they count different water". Data: ruler A, consumption: Microsoft 0.27 (tr-028), LBNL 0.36 with 0.45 to 0.48 after 2023 (tr-009), Google 1.15 (fp-006); ruler B, withdrawal per IT kWh: Meta 0.19
(tr-025), Amazon 0.12 (rs-052). Context rows in detail: facility range 270 to 3.9 million gallons a day (tr-011), median large facility 121,000 (tr-014), consumed share 74 percent (tr-012), potable 76 percent
(tr-015), indirect 2.4 to 12 times direct (tr-013), IEA two thirds from electricity supply (tr-020), 34 percent of AI capacity in high water stress (tr-021). Form: two linear rulers (0 to 1.5 L per kWh) in one
plate, group labels stating the basis; filled squares (company-reported) with each row's definition in its label. Controls: none. Detail: definition, year, the sentence "A fleet average cannot describe a stream
in a low-flow August", receipts. Reading: "{row}: {value} L per kWh, {basis}. {evidence}, {year}." Table: row, L per kWh, basis, definition, year, claims. Excluded: tr-022's derived 0.94 (a different
definition, not a decline); per-prompt water (the AI Energy disclosure); give-backs. Projection: none.

### 3.4 Jobs

**`ai-occupations`** (AI Work, signature). Question: which occupations grow and which shrink? Title: "BLS projects data scientists up 34.6 percent and data entry keyers down 25.5 by 2035, with electricians and
line workers up 9 and 10; all occupations grow 3.5". Data: jb-002 34.6, jb-013 10, jb-001 10.2, jb-011 9, jb-014 5, jb-010 3.5 (baseline), jb-008 -0.3, jb-009 -4.4, jb-003 -5.3, jb-006 -5.5, jb-005 -5.6, jb-004
-6.0, jb-015 -7, jb-007 -25.5; electricians' 72,700 openings a year (jb-012) in detail; the BLS method sentence (jb-016) in the subtitle. Form: diverging horizontal bars, percent change 2025 to 2035, sorted,
zero in the middle, positive slot 1 and negative slot 2 with a printed sign, the all-occupations figure as a labeled baseline rule; buildout trades rows carry a tag. Why: polarity is the job. Controls: sort {by
change | by group}. Detail: 2025 and 2035 employment where the claim's derived text gives them, the BLS reasoning sentence, receipts. Reading: "{occupation}: {value} percent projected change, 2025 to 2035. BLS
Employment Projections, 09/2026." Table: occupation, code, change, 2025 employment, group, claims. Excluded: jb-018 to jb-021 (superseded edition); exposure categories (the BLS file was not obtained, jb-017);
NAICS 518210 (industry, not occupation: it goes to `dc-jobs-per-mw`). Projection: every bar is a projection; the axis label says "projected" and bar ends get a dashed cap; nothing else dashed.

**`ai-displacement`** (AI Work). Question: has AI measurably moved employment yet? Title: "Studies disagree: a payroll study finds workers 22 to 25 in the most exposed jobs 19 percent below trend, a
survey-based tracker finds no connection, and a job-ad study finds entry-level openings up 35 percent". Data, each row its own measure: Stanford 22 to 25 most exposed -19 (jb-046); Stanford two quintiles -11
(jb-048); ADP high exposure, all ages, -0.5 (jb-072); Goldman -0.1 point a year per 10 percent exposure (jb-053); Danish earnings and hours effect at most 2 (jb-052); IMF postings -10 (jb-061); PwC entry-level
openings +35 (jb-070); PwC most exposed firms +52 headcount since 2018 (jb-068); New York Fed firms laying off 4 and hiring fewer 15 (jb-059, jb-060); Yale "no connection" (jb-050) and Anthropic "no systematic
increase" (jb-051) as rows with no mark and their words; Challenger 120,136 cuts citing AI in 2026 and 54,836 in 2025 (jb-056, jb-057) in detail, a count, not a rate. Form: diverging ladder of signed
percentages with a neutral zero; each label names what the percent is of, and the subtitle says the rows measure different things; measured rows filled, survey or modeled rows hollow. Why: sign and disagreement
without pooling. Controls: none. Detail: measure, population, period, method, publisher (an AI developer for jb-051), receipts. Reading: "{row}: {value} percent {measure}, {period}. {evidence}, {year}." Table:
row, percent, measure, population, period, source kind, claims. Excluded: jb-047, jb-049 (earlier vintages); jb-054, jb-055 (scenario, press paraphrase); jb-062 to jb-067 (exposure counts, never drawn as loss:
a prose details block "exposure is not displacement" lists them). Projection: none.

**`dc-jobs-per-mw`** (DC Jobs, signature). Question: what jobs does a data center bring? Title: "A 100 MW data center implies about 70 to 200 construction workers at peak and 15 to 35 permanent operating staff
on the published ratios; a county study finds about 270 other local jobs per 100 MW over time". Data, ratio rows: construction 0.7 to 2.0 per MW (jb-023), operations 0.15 to 0.35 FTE per MW (jb-024), Montana
direct 168 at 500 MW and 250 at 1,000 (jb-028, jb-029), county nonconstruction 2.7 per MW (jb-035). Context rows: Oregon direct operations 2,630 statewide and 2,205 in Eastern Oregon (jb-081, jb-082), Oregon
construction 3,492 a year (jb-085), total supported 10,409 (jb-084); Washington urban exemption 53 permanent jobs, 296 temporary, 42.4 million dollars of savings, 0.8 million per job, zero new urban data
centers (jb-073 to jb-076, jb-080); Georgia 30 percent but-for and -780 million net fiscal in 2030 (jb-036, jb-037); NAICS 518210 employment 419.4 to 491.6 thousand, 2021 to 2025 (jb-041 to jb-045) as a
sparkline row; Census construction spending 96.5 billion annual rate 09/2026 (jb-071); Brookings county effect 56 percent and 100 to 200 jobs (jb-031, jb-032); contractors reporting competition for skilled
workers 58 percent (jb-040). Form: instrument; the ratio rows scale with the MW input (range lines, hollow squares); the context rows are fixed ruled rows below a rule. Controls: MW (10 to 2,000, default 100).
Detail: each ratio's boundary (direct only; county; modeled), receipts. Reading: "At {MW} MW: {c_low} to {c_high} construction workers at peak, {o_low} to {o_high} operating staff, and about {county} other
local jobs eventually, on three modeled ratios with different boundaries. {date}." Table: row, per MW, at the setting, low, high, boundary, claims. Excluded: jb-026 and jb-027 against jb-045 as a trend pair;
jb-039 (superseded). Projection: none.

### 3.5 Companies

**`ai-company-money`** (AI Companies, signature). Question: how are the seven paying for the buildout? Title: "Capital spending has passed operating cash flow at Amazon and is close at Meta and Alphabet; cash
and securities fall while debt rises (fiscal years to 2025 and 2026)". Data: six panels, seven companies, FY2018 to the latest fiscal year from `series_fiscal_year_ends`: capex fin-001 to fin-007, operating
cash flow fin-008 to fin-014, cash and marketable securities fin-035 to fin-041, long-term debt fin-015 to fin-021, buybacks fin-022 to fin-027 (Tesla: "not reported", no mark), revenue fin-028 to fin-034.
Form: small multiples, six panels, one USD billion axis each, shared x in fiscal years; emphasis: the selected company orange with a direct label, the other six in context ink. Controls: company {Microsoft |
Alphabet | Amazon | Meta | Apple | NVIDIA | Tesla}, default Amazon; year needle. Detail: the year's six values, the fiscal year end date, the debt basis sentence (LongTermDebt includes the current portion at
Microsoft and Amazon, noncurrent at Alphabet and Meta; Amazon like-for-like 173.1), receipts. Reading: "{company}, fiscal {year} (ends {date}): capex {capex}, operating cash flow {ocf}, cash and securities
{cash}, debt {debt}, buybacks {buy}, revenue {rev}, USD billion. SEC filings, cash basis." Table: company, fiscal year, end date, six values, claims. Excluded: company-defined capex with finance leases
(fin-042, fin-050, fin-053, fin-055: a different basis, shown in `ai-guidance-2026`); the post-fiscal-year quarters (`series_after_last_fiscal_year`, detail only). Projection: none.

**`ai-capex-cash`** (AI Companies). Question: can they pay for it from cash? Title: "In the latest fiscal year, Amazon spent 132 billion on property and equipment against 114 billion of cash and securities;
Apple spent 9 against 137". Data: per company, cash purchases of PP&E (fin-001 to fin-007) and cash plus marketable securities at the same fiscal year end (fin-035 to fin-041 series), one basis, labeled by
fiscal year and end date. Form: dumbbell (before and after per item is the dataviz form for two values per row), one row per company, capex a filled square, cash a filled square with a 2px plate ring, a context
line between; the selected row labeled at both ends; a legend row names the two marks. Controls: fiscal year {FY2021 to latest}, default latest. Detail: both values, their dates, the ratio printed as
arithmetic, receipts. Reading: "{company}, fiscal {year}: capital spending {capex} billion against {cash} billion of cash and marketable securities. SEC filings, cash basis." Table: company, fiscal year, end
date, capex, cash, claims. Excluded: market value (another basis); guidance. Projection: none.

**`ai-company-footprint`** (AI Companies). Question: what do their operations draw? Title: "Google's electricity rose 37 percent in 2025 to 43.6 TWh and Microsoft's to 37.0; location-based Scope 2 rose at every
company that reports it". Data, four panels: electricity (MWh): Google rs-001, Microsoft rs-020, Meta rs-033, Apple rs-054 (corporate only), NVIDIA rs-066 (energy, own operations, labeled), Tesla rs-072, Amazon
"No public measurement" (rs-076). Water consumption (ML, conversions shown as derived): Google rs-014, Microsoft rs-030, Meta rs-045. Water withdrawal: Google rs-013, Microsoft rs-029, Meta rs-043, Amazon
rs-051 (data centers, 2025 only), Apple rs-060 (corporate), NVIDIA rs-067 (series break), Tesla rs-073 (manufacturing). Scope 2 location-based (tCO2e): Google rs-007, Microsoft rs-023, Meta rs-039, Apple
rs-057, NVIDIA rs-064, Tesla rs-069, Amazon rs-075 (company-wide). Form: small multiples with emphasis by the same company control as `ai-company-money`; each row's boundary in its label; a company absent from
a panel keeps its row with the gap words. Controls: company; year needle. Detail: value, boundary and fiscal year (Microsoft July to June, Apple to September, NVIDIA to January), the market-based figure beside
it, marked "never on the chart" (rs-006, rs-022, rs-038, rs-056, rs-063, rs-070, rs-049), receipts. Reading: "{company}, {year}: {value} {unit}, {boundary}. Company report, location-based." Table: company,
year, four measures, boundary, claims. Excluded: all market-based Scope 2 from the plot; Scope 3 (rs-009 to rs-012, rs-024 to rs-026, rs-040, rs-050, rs-059, rs-065: a details block "embodied and supply
chain"); rs-062, rs-074 (superseded); rs-071 (one factory, 2023). Projection: none.

**`ai-guidance-2026`** (AI Companies). Question: what do they say they will spend next? Title: "For 2026 the companies guide to 195 to 205 billion (Alphabet), 135 to 145 (Meta), about 170 (Microsoft, calendar
year), about 220 (Amazon), and over 20 (Tesla); Apple and NVIDIA give none". Data: fin-044, fin-051, fin-054 (limit printed), fin-056, fin-065; Apple fin-081 and NVIDIA fin-082 as "No public guidance"; the
latest quarter on the company basis in detail (fin-042, fin-050, fin-053, fin-055); context in detail: five-hyperscaler 800 billion 2026 and 1.3 trillion 2027 (fin-083, fin-084), BIS bonds 222 billion
(fin-066), leases 1.2 trillion (fin-067), Alphabet's 80.8 billion of notes and 49.6 billion stock sale (fin-048, fin-049), Meta's 24.9 billion of debt (fin-052), Hyperion bonds 27.3 (fin-068). Form: linear
ladder, USD billion, 0 to 250; hollow squares with dashed range lines (projections), one row per company; group label "company- defined capital spending, including finance leases where the company counts them;
not the SEC cash basis of the plates above". Controls: none. Detail: the quote, the basis, the latest quarter, receipts. Reading: "{company}, 2026 guidance: {value} billion ({basis}). Company statement,
{date}." Table: company, guidance low, high, basis, latest quarter, claims. Excluded: fin-045 (qualitative), fin-046 (unverified press), tr-042 against fin-083 as "doubled" (side by side in detail only).
Projection: every mark, dashed and hollow.

**`ai-holdings`** (AI Companies). Question: how big are they, and what do they hold in AI developers? Title: "Public float ran from about 0.9 trillion (Tesla) to 4.0 trillion (NVIDIA) at the latest 10-K dates;
stakes in AI developers are carried at cost or mixed bases and sit on their own ruler". Data: ruler A, public float (dei:EntityPublicFloat, each company's as-of date in its label): fin-072 to fin-078. Ruler B,
stakes and commitments (carrying values, not comparable): Alphabet marketable equity securities 90.4 (fin-047), Amazon Anthropic 238.7 (fin-059, mixed basis, limit printed), Amazon OpenAI 50.0 (fin-060), NVIDIA
equity investments 99 (fin-062), NVIDIA guarantees cap 105 (fin-063), NVIDIA supply commitments 279 (fin-061), Microsoft OpenAI funded 12.0 (fin-080), Amazon leases not commenced 164.9 (fin-058). Form: two
linear rulers (USD billion) in one plate: bars on ruler A, squares on ruler B, group labels stating the basis. Controls: none. Detail: definition, date, receipts. Reading: "{row}: {value} billion, {basis}, as
of {date}. SEC filing." Table: row, value, basis, date, claims. Excluded: fin-071 (ETF proxy); fin-079 as a stake (all equity-method investees); fin-070 (Oracle). Projection: none.

## 4. Claims to Add or Fix Before Build (claims readers, one pass, so builders decide nothing)

- resources.json already carries `cluster: resources` and `rs-` ids (the critic's fix is done); dem-046 is the one id for IEA 2024.
- demand: attach `series` (2025 to 2050, BkWh = quads x 293.07) to dem-001 (cb2026) and dem-004 (higheldmd) from raw/eia-outlook.json;
  add two claims for the hm2026 and lm2026 server series; add a claim for the residential 1.3 percent decrease from dem-067's source;
  add derived claims for Council 2030 data centers in TWh (dem-075 x 8.76 / 1000 = 17.7, 11.4 to 38.8) and for the 2046 regional totals
  from dem-071 on the 22,000 base (its `derived` text already holds them).
- footprint: add claims for GPT-5 long high-reasoning 33.8 Wh (fp-025's confirmed note), Sora 2 Pro 315.1 to 534.4 Wh (fp-070's note),
  the image row 0.63 Wh (fp-066 x 2, derived), Claude Code average day 3,000 Wh (fp-032's note); ship comparison-model.json to
  `site/data/claims/` with `tier` and `schema`; `ai.js` reproduces `computed_defaults` in a self-check (compare_model.py is the oracle).
- tradeoffs: add a derived claim for the US national 370 g per kWh (tr-038's quote) and one for LBNL 0.34 kg per kWh (tr-006 over tr-007).
- finance: nothing to add; `ai-company-footprint` unit conversions (million gallons x 3.785 = ML; cubic meters / 1,000 = ML) go in `derived`.
- Give every `partly` claim used above a public `limit` sentence (fin-054, fin-059, fin-062, fin-067, fin-083, fin-084, jb-023, jb-024,
  jb-035, jb-061, jb-068, jb-070, tr-053, tr-054, tr-055, tr-057, tr-061, rs-052, rs-067, dem-071, dem-067, fp-070, fp-031, fp-032).

## 5. Prose Plan

| Section (inventory line) | Decision | Target tab | Notes for the voice editor |
|---|---|---|---|
| DC Hero, Key Facts (0) | rewrite to the compact band | DC header | h1, one-line lead, four facts inline: 22,000 aMW today; 2,475 aMW tech load input for 2030; Res. #2026-034; sources checked date |
| DC Purpose (1, slot `charge`) | keep, details | Overview | opening sentence moves into the plate's claim zone; the slot keeps its partial status |
| DC Why Now (2, slot `why-now`) | details, trim | Overview | cut "Each of these is a window" (88); the load numbers now live in `dc-pnw-load`; Oregon, Grant PUD, The Dalles as a three-item details row |
| DC Environmental Impacts (3) | details, trim | Tradeoffs | keep the CRITFC and Yakama salmon-power paragraph (97) whole; cut 96 and 102 filler; link each paragraph to its matrix row |
| DC Policy Tribal, State, Federal (4) | details; the grid is new | Policy | cut 111 and 121 filler; split the Federal run of EO numbers (135 to 138) into a list |
| DC Alternatives (5) | details | Policy | cut 157 filler; one link to AI Data Sovereignty |
| DC Questions (6) | details grid, text kept | Questions | eight summaries are the group names; Jobs links to `dc-jobs-per-mw`, Water to `dc-cooling` |
| DC Policy Watch, Library (7, 8) | keep as is | Policy; Overview | hooks and ids unchanged |
| RU, every section | keep; reference layout | RU | fix nine `<p>---</p>`, the duplicate `water` id, the nav; bench rows under "Streaming and AI Compared Carefully" (to `ai-same-hour`), "Growth Trajectories" (to `dc-eia-servers`), "Water" (to `dc-water-intensity`), "What Companies Report" (to `ai-company-footprint`); cut 114, 142, 185 filler; the boundary table (131) and disclosure table (177) move to the right column as `.data-table` figures |
| AI Hero, Key Facts (0) | rewrite to the compact band | AI header | facts: 0.30 Wh per text prompt (model default, range printed); Res. #2026-039; sources checked date |
| AI Purpose (1) | details | Overview | the pull quote stays as `.quote` without its bar |
| AI Working with AI (2, slot) | details grid; the eight principles become eight summaries | Working with AI | cut 84, 85, the second sentence of 91, and 99; Bastani, EBU, Pew, Montana told once here and referenced from Youth |
| AI Youth and Education (3, slot) | details grid | Youth and Education | replace the duplicated tellings (136 to 145) with one-line references; keep "Native education is missing from this evidence" (142) |
| AI Data Sovereignty (4) | keep | Data Sovereignty | the TSDF tier table becomes the static tier-by-use grid shared with Working with AI |
| AI Economics (5, slot, held) | the slot block untouched; new prose outside the markers | Work | one paragraph pointing to the two plates; nothing from ai-economics-v2.md |
| AI Policy Watch, Library (6) | keep as is | Policy Watch; Overview | hooks unchanged |

New prose and its job: the thirteen openings above; the Growth tab's three-boundary paragraph; the Tradeoffs tab's "set, not a list" paragraph and the low-flow August sentence; the Jobs tab's phase contrast;
the Companies tab's fiscal-year note; the Energy tab's four disclosures (water per prompt on three boundaries: fp-006, tr-017, fp-027; carbon as a reader input; known weaknesses from the method's section 14,
shortened; what would change the answer from section 13); DC's subnav label "Energy and Water Use"; RU's bench rows (one sentence each: the plate's default Reading plus "Open the plate").

## 6. Build Partition and Order

| Owner | Files (sole writer) | Notes |
|---|---|---|
| Kit builder (running now) | `site/assets/js/plate.js`, `scripts/build_plates.py`, `site/assets/css/site.css`, `scripts/validate_public.py`, kit tests under `tests/` | adds the needs in 3.0 and a `--page PATH` build option so page builders rebuild only their own page |
| Claims readers | `work/site-refresh/evidence/*.json`, `comparison-model.json`; then `python scripts/build_plates.py --export-claims` into `site/data/claims/` | section 4 first; export once, re-export on change |
| Builder A: DC | `site/data-centers/index.html`, `site/assets/js/data-centers.js`, `site/data/plates/dc-*.json` (10 plates) | the three instruments compute in the module; the policy grid is static HTML |
| Builder B: AI | `site/ai/index.html`, `site/assets/js/ai.js`, `site/data/plates/ai-*.json` (11 plates) | the comparison model equations and the Count view render live in `ai.js` (12 KB budget, no library) |
| Builder C: RU and library | `site/data-centers/resource-use/index.html`, `site/data/library.json` | markup fixes, reference layout, bench rows; then every new plate source into the library from the shipped claims files, last |
| Integrator (one person) | runs `build_plates.py` for all pages, `validate_public.py`, `check_t1_leak.py`, `pytest -q tests`; then the owner's reserved Playwright phase | nobody else runs the full-site build while pages are mid-edit |

Order: (0) kit and claims export land with the kit's self-test green; (1) A, B, C in parallel, each building only its page (`--page`, or a `--site` copy) and checking it with `validate_public.py`; (2) C's
library pass after A and B list their sources; (3) the integration run; (4) the voice editor on openings and details summaries (text only, no markup); (5) assets (section 7) from the built pages' inline JSON.

## 7. Local Assets for the Owner's Slides (`work/site-refresh/assets/`)

| Asset | From | Form |
|---|---|---|
| `same-hour-ruler-1920.png`, `same-hour-count-1920.png` | `ai-same-hour` at defaults, both views, dark and light | stills, 1920x1080 |
| `same-hour-sequence/` | `ai-same-hour`: prompts 2.52, 10, 30, 60; boundary data center, adds, whole hour | still sequence (spec section 5) |
| `same-hour-vertical.mp4` | `ai-same-hour`, built from comparison-model.json: the prompts sweep, then the boundary switch, captions in the Reading's words | HyperFrames clip 1080x1920, off the site |
| `heavy-ai-1920.png`, `scale-1920.png` | `ai-heavy-ai` at the phone yardstick; `ai-scale` | stills |
| `pnw-load-1920.png`, `eia-band-1920.png`, `forecast-misses-1920.png` | `dc-pnw-load`, `dc-eia-servers`, `dc-forecast-misses` | stills |
| `tradeoff-matrix-1920.png`, `occupations-1920.png` | `dc-tradeoff-matrix`, `ai-occupations` | stills |
| `company-money-1920.png`, `capex-cash-1920.png` | `ai-company-money` (Amazon selected), `ai-capex-cash` (latest fiscal year) | stills |

Every still carries the plate's source line and the receipts' short names in its foot, so a slide traces back to a claim id.
