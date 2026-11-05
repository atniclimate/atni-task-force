# Resource Use Explorer: the one model (11/04/2026, revised after review; second version 11/05/2026)

Local working file. Decision document for the Resource Use Explorer (BRIEF.md, "New owner goal"). It picks one model from the four school proposals (`design/school-*.md`,
Jev scores in `school-rubric.md`), extends the same-hour comparison in `design/COMPARISON-METHOD.md` and `evidence/comparison-model.json` without changing a number in it,
and tells the next agent what to build. Every figure below is the output of `scripts/resource_model.py` on `evidence/resource-model-params.json` (177 inputs, 20 of them read
from the same-hour model), which reads the same-hour inputs by key and asserts that the chat, video, and short-video hours reproduce `computed_defaults`. Results in full:
`RESOURCE-MODEL-RESULTS.md`. Section 15 records the four independent attacks, the Jev fairness check, and the second version of 11/05/2026, and what each changed. T0 only.

## 1. The Decision

**Engine: the systems school's unit law**, `e = e_m + P_idle x T_on / n`, on the same-hour layers (data center or node, network, home router, device). It is chosen, not
averaged in. Jev's top three scores tie (0.245, 0.231, 0.230; the `data_supported` and `misleading_risk` columns do not discriminate), so the tie is broken on the two
columns that matter to a Tribal decision-maker, field measurability (0.53, the highest) and decision usefulness (0.89), and on one structural fact: the idle term `a/U` is
the only piece of arithmetic that answers "where should it run", and it turns the owner's levers (local, federated, cached, routed) into terms of one equation instead of
four separate stories.

**What it is, said plainly: a bottom-up process model checked against published figures.** It is an engineering accounting identity with 177 read, chosen, or assumed
inputs. It estimates no coefficient and its ranges are spreads, not distributions. It is not the "generalizable econometric model" the brief asked for, and the owner should
be told so: the identity generalizes, the coefficients do not, and the only statistical content is a descriptive company ratio plus diagnostics (section 5). The idle
term itself is untested: no back-test row touches it (section 15).

Taken from the other schools as labeled parts of the same model: the engineering school's explicit storage, replication, and self-run price lines (the same arithmetic,
written out); the hybrid school's floor-and-ceiling discipline, printed as checks beside a row and never as the row; the econometric school's revenue stand-in for
ad-funded services and its company ratio (0.112 kWh per revenue dollar) as a second reading on token-priced rows only.

Rejected, with the reason: the econometric engine (misses content by 14 to 22 times, has no price for anything self-run, and a list price is policy: Gemini's doubles on
12/01/2026 with no change in energy, px-007, sv-015); the hybrid Monte Carlo (the record's ranges are input extremes and conventions, not distributions, so a p10 to p90
band would print as the confidence interval COMPARISON-METHOD section 2 says these ranges are not); the engineering token chain for the short chat prompt (it predicts
0.45 Wh against measured medians of 0.24 to 0.31, fp-001, fp-017, and would contradict the same-hour comparison's 0.30 default). Tokens are used only where no measured
median exists.

## 2. The Baseline and Why

There is no vetted unit of work. SCI and ITU-T L.1801 leave the functional unit to the reporter (ec-002, ec-007, sf-059), tokens are not portable across vendors or
languages (au-005, au-026), and a million tokens does not exist for video, storage, or a seat-month (sv-008). So the model fixes the **measure** and names the unit per
row:

- **Comparison level, the single baseline: one person-hour of use on the whole chain** (data center or node, network, home router, device) in watt-hours, with price,
  CO2e, and water printed for the same hour. This is the hour the same-hour comparison already uses (view 1); the Explorer extends it to coding, search, office, and local
  systems. The device is the same on every hour row (the device setting), so the router and screen are an identical band and the activity is the difference.
- **Coefficient level:** each row's natural unit (prompt, token, image, clip, GB, hour-view, seat-month, TB-year, query), reaching the hour through a stated rate the
  reader can change (prompts per hour, turns per hour, GB per hour). Anything scaled by a count uses a mean where the record has one; a median row is labeled "typical, a
  floor for totals" (the chat prompt, the coding session).
- **Stored data has no hour:** a shared dataset is a holding, so comparison C reports terabyte-years with the replication factor stated (ec-030) and never sits on the
  hour axis. Architecture comparisons use one organization-year.
- **A million tokens is kept beneath the hour** as the AI-only cross-vendor unit (AI rows also print "per million output tokens", because people ask), with the warning
  that per-token coefficients are one vendor framework's defaults (au-008, au-009, partly) and that a Tribal-language prompt can cost up to 179 times English (au-026).

Rules carried over unchanged: provisioned hardware counts whether used or not (ec-004, lf-045); carbon is location-based only (ec-003, ec-014); the screen and router are
a fixed band identical on every row; no cross-boundary ratio prints as a fact (COMPARISON-METHOD section 1, CRITIC section 4). Two rules added under review: **both sides
of any comparison sit on one grid** (a clean feed is a declared arrangement, printed as a scenario, never the default of one side), and **prices are listed by basis and
never ranked across bases** (a list price, a seat price, a self-run cost, and a platform's revenue are four different things).

## 3. The Formula

Said aloud: **"Every unit of work pays its own energy plus its share of the hardware that sits idle waiting for it; where it runs sets the carbon and the water, judged
on one grid for both sides of any comparison; and who bills it sets the price, named by its basis and never ranked across bases."**

Full equations, per layer L in {data center or node, network, router, device} and per functional unit:

- `E_L = n x e_m,L + P_idle,L x T_on,L`, so per unit `e_L = e_m,L + P_idle,L x T_on,L / n`. For a shared fleet at utilization U with idle fraction a = P_idle / P_max:
  `e(U) = e_ref x (a/U + 1 - a) / (1 + a)`, normalized to the hyperscale reference U = 0.5 (sf-020). Hyperscale, colocation, and a server room differ by U and PUE,
  nothing else. U is defined once: the share of the fleet's peak capacity in use, averaged over the year; sf-020 gives a modeled operating time and lf-024 a load, and the
  model treats both as this one U. a is the accelerator's idle fraction, 0.11 (ec-020, A100 46 of 407 W), because every row the multiplier touches is accelerator work; the
  conventional-server anchors (sf-008 solves to 0.25, sv-039 states 0.36) print in the calibration block and set no row. The linear curve is a simplification, and the
  term is untested against any metered curve.
- Chat prompt: `e_dc = e_prompt` (measured median 0.30 Wh, the same-hour input; the mean-class 0.34 prints beside count-scaled rows). Tokens, where no median exists:
  `e_dc = (t_in x EI_in + t_cache x EI_in x c + t_out x EI_out) / 1000 x PUE`.
- Bytes: `e_dc = GB x i_dc`; `e_net = GB x i_net` (fixed or mobile; average or marginal); router by time, by data, or 0; device by the hour, the same whichever app is
  open (all four exactly as comparison-model.json).
- Storage: `E = TB x k_store x copies x PUE x hours`, one coefficient (ec-021, 0.65 Wh per TB-hour, drives only) on every row, cloud or local; a local node:
  `E = P_idle x 8760 / n + units x e_m`, with zero idle when the machine is already on for other work (sf-044), a declared setting that reaches every local row of a
  comparison alike, never a finding.
- `E = sum_L E_L`. **CO2e** `= sum_L E_L x I_L + M`, I the grid factor of the layer's place, M embodied carbon as a separate labeled line (kg / life / units), never mixed
  into operations (ec-008). **Water (mL)** `= sum_L E_L x (WUE_site,L + w_gen,L)`, the hydro convention named on the figure. Northwest generation water is built from the
  mix, not borrowed: `w_gen_nw = hydro share x convention + (1 - share) x 0.776` (gf-008 38.7 percent; gf-037 gas 205 gal/MWh): 3.11 L per kWh on the Columbia convention
  (gf-040), 0.48 with reservoir evaporation excluded (gf-046), 15.2 on the 38 L primary-purpose convention (gf-039), 5.45 on BPA power at 77.5 percent hydro (gf-018).
- **Price** `= units x list price` (API, dated) or `seat price` plus any assumed administration hours; self-run `= hardware / life + kWh x tariff + hours x wage + support`;
  ad-funded services carry a labeled revenue reading, which is revenue, not a cost (section 5).
- **Project scale**, no defaults: `MWh = MW x load factor x 8,760`; site liters `= MWh x 1,000 x L per kWh`; tonnes CO2e `= MWh x g per kWh / 1,000`; share `= MWh over a
  load the reader enters` (`project_scale()` in the script). Hosting a building and serving a Nation's own computing are separate decisions.
- **Leaving a cloud, one time** (comparison E): `E_move = copies x GB x i_net`, on a fixed link whatever the reader's own connection is; `CO2e = E_move x I_network`;
  `$_move = pulls x GB x egress + copies x hours x wage + other bill`. The year before and the year after are comparison C's storage arithmetic at the Nation's size. Payback
  `= $_move / ($_stay - $_after)`, or never when the year after costs more. Nothing adds a one-time row to a year row.
- **What a reader's rule keeps** (section 10): `kept = rows whose holder the rule allows`. A filter, not a term: no equation reads it, and no row's figures change.
- **A reader's own reading** (section 10): `p[input] = typed value`, for one run, with no spread and no claim.
- **Illustrative carbon damage**, off by default (section 5): `tonnes x family's low, central, and high`, a column of its own that no other equation reads.

## 4. The Catalog (central values; DC and network at US grid 350 g, 0.36 + 4.52 L/kWh; router and device at NWPP 288 g, 3.11 L/kWh)

| Row | Unit of work, rate to the hour | Wh | $ | gCO2e | mL | Counted; price basis |
|---|---|---|---|---|---|---|
| Chat, one median text prompt | prompt; 10 per hour (reader) | 0.30 (0.24 to 0.60) | 0.0040 | 0.11 | 1.5 | DC only; API list, 500 in 300 out, the energy median's own shape (au-015, px-003, px-004) |
| Chat hour, median text prompt, phone, Wi-Fi | 10 prompts | 15.0 (15.4 at the mean prompt; 15 to 172 by kind of chat) | 0.040 | 4.5 | 52 | whole chain; same-hour view 1; phone line is battery energy, 6.2 Wh at the wall |
| Coding session, median (typical; a floor for totals) | 3 turns x 227.6k prompt (95 percent cached), 1.9k out (au-043) | 36.2 (9.0 to 871; mean session 202) | 0.18 (mean 1.03) | 13 | 177 | DC only; API list, cache reads at $0.10 per M |
| Coding hour, mean turn | 6 mean turns per hour (5.85 from au-043's mean session) | 211 (54 to 878) | 1.01 | 73 | 1,010 | whole chain, same device as every hour row; top-down $3.25 (px-016) in the back-test |
| One 1K image | image; images per hour (reader) | 0.63 | 0.034 | 0.22 | 3.1 | DC only; API list (px-027); energy and price are different models, never paired |
| 8-second generated clip | clip; Veo 3 estimate (fp-070) | 30.8 | 0.80 | 11 | 150 | DC only; API list (px-028); same caveat |
| Search with an AI answer | 2009 search (fp-071) plus 0.30 Wh stand-in | 0.60 | 0.018 | 0.21 | 2.9 | DC only; grounding call (px-029) plus prompt; never "doubles" |
| Instagram or TikTok hour, phone | 0.39 GB (fp-053 to fp-055) | 12.8 | 0.155 | 3.7 | 41 | whole chain; Meta revenue, not a cost (px-035) |
| Netflix or YouTube hour, phone | 1 GB (fp-130) | 14.1 | 0.256 | 4.2 | 47 | whole chain; Netflix revenue, not a cost (px-042, px-043; YouTube 0.122 px-039); paid $8.99 per month (px-044) |
| Cloud office seat-month, illustrative | 2.2 kWh per user-year, a 2011 whole-service email figure (sf-016); storage 157 Wh printed beside, not added | 183 (183 to 550) | 14 | 64 | 895 | DC only; seat list (px-045, px-046); never ranked against another row |
| Video delivery, one hour-view | 1 GB served | 2.05 | 0.060 | 0.72 | 9.4 | DC + network; retail delivery list (px-053) |

Read: the router and screen are 12 Wh of every phone hour (the phone's 2 Wh is battery energy; 6.2 at the wall, lf-022) and the activity adds 0.8 to 3 Wh; a coding
session is anywhere from 30 to 2,900 median prompts (9 to 871 Wh, mv-004), and the coding hour (54 to 878 Wh) is the one row where the server passes the device. The chat and
video hours reorder with the router rule and the kind of chat, so no ratio between hours prints. The seat-month is illustrative and is the first row to replace with a
field measurement.

## 5. The Four Measures

- **Energy:** Wh at the wall of every machine the unit touches, printed by layer, idle counted under the provisioned rule. One exception, stated on the row: the phone's
  device line is battery energy (the comparison model's convention), and the wall figure, 1 + 2.1 times it (lf-022; 2.4 to 4.6), prints beside it on every phone row.
- **CO2e:** location-based, average by default (US 350 g, gf-007; NWPP 288 g, gf-001), with a selector named on the figure: Washington in-state 113 g CO2 (gf-009, CO2 not
  CO2e), AVERT Northwest short-run marginal 728 g (gf-019), Cambium long-run marginal 79 g (gf-023), life-cycle hydro 21, wind 13, solar 43 (gf-035, gf-034, gf-033),
  village diesel about 730 g (gf-047 over gf-049). Every place (data center, colocation, node, home) offers the same feeds, so neither side of a comparison can take a feed
  the other cannot. Hydro, wind, and solar are life-cycle factors and eGRID rates count combustion only; a feed is a declared supply arrangement unless the machine is
  physically behind that meter, and hydro already committed elsewhere is not clean new supply. Never market-based (fp-005 and rs-006 style figures stay off every axis).
  Embodied carbon is its own line: H100 board 1,312 kg (gf-050), Mac mini 30 kg (sv-036), desktop 250 kg (sf-023), hard drive 20 kg per TB (sf-024) against under 1
  (sf-025, unresolved; print the spread).
- **Water:** site WUE on data center energy (0.36 L per kWh, tr-009; 0.27 to 1.15, tr-028, fp-006; 0 for an air-cooled room, gf-044) plus generation water on every layer
  (4.52 US, tr-005; the Northwest mix formula in section 3). Printed in liters with the basin and the convention named, never summed across basins, or not printed at all.
- **Price, by basis, always labeled and dated, never ranked across bases:** (1) API list on the day (tokens, images, clip seconds, search calls, delivery minutes; the
  delivery list is retail, with margin, player, and encoding inside); (2) seat list for subscriptions, plus assumed administration hours where the other side carries
  them; (3) self-run: hardware over life, kWh at the Nation's tariff (sv-023 10.97 cents commercial Washington; px-058 BPA $40.16 per MWh for a utility), paid hours at
  a stated wage (sf-051 $60 vendor model; $25 and $0 as sliders), support (sf-049 71 to 205 EUR per user-year, sf-055), at cost with no margin; (4) **no API:** two
  readings, both printed, neither called a list price or a cost: what the person pays per hour of their own use (Netflix $8.99 per member-month, px-044; ChatGPT Plus $20,
  px-047; falls with use) and **what the platform earns in that hour** (Netflix $0.256, px-042, px-043; YouTube ads $0.122, px-039; Meta $0.115 to $0.195, px-035; Google
  Search $0.05 per query, px-040), which is revenue, not a cost, and does not bound what serving costs; (5) none: an embedded cache is placed, not sold. A second energy
  reading for token-priced rows only: 0.112 kWh per revenue dollar (0.075 to 0.29; the three-company median, rs-001, rs-020, rs-033 over fin-029, fin-028, fin-031) lands
  within 1.5 times on the chat prompt, 1.75 under on the coding session, and 8.6 times over on the seat row, so it prints only on tokens. Its panel slope (1.71) is a
  common growth trend, not an elasticity: with a common time trend it is 0.49 (se 0.20), with firm trends 0.41 (0.24), with year effects 0.37 (0.45), and in first
  differences 0.30 (0.19) with an intercept of 0.20 log points a year, so electricity grew about 22 percent a year whatever revenue did; three firms allow no
  significance test and revenue is nominal.
- **Illustrative carbon damage, one reader-set control, off by default** (`carbon_damage` in the parameters; `carbon_damage()` and `damage_column()` in the script; ECONOMETRIC-NOTE.md
  section 5). The reader picks a published family and sees its low, central, and high, never one number, in each source's own currency and year: EPA 2023 for CO2 emitted in 2020 ($120,
  $190, $340) or 2030 ($140, $230, $380), ex-001 to ex-006; Umweltbundesamt (195 and 680 euro), ex-010, ex-011; the European Commission Handbook's avoidance cost (60, 100, 189 euro up to
  2030; 156, 269, 498 from 2040 to 2060), ex-012, ex-013, which is not a damage estimate and says so; and EPA's 2017 domestic values ($1 and $7, no central), ex-008, ex-009, the low end.
  Its own column reads "illustrative damage, not a price, not federal policy", dated; OMB M-25-27 is its receipt for that last word (mv-005). It is never added to the price column or
  ranked against a price basis, and `compute()` never reads it. The EPA families are per tonne of CO2 and the rows are CO2e, an unresolved gap the family states. Project scale shows
  tonnes first. No dollar on water, health, fish, places, or culture. At $190 a 73 g coding hour is 1.4 cents ($0.0088 to $0.025) and a 100 MW year at 350 g is $58 million ($37 million to
  $104 million): trivial per hour, large at project scale, and 2.8 times apart on a discount rate. The block lifts out with one deletion, and a test proves it: the owner may yet rule it out.

## 6. Where It Runs

A place profile sets PUE, U, site water, and the grid; everything else in the row stays fixed, so the reader sees what moving a workload changes and nothing else. The
multipliers are untested (no back-test row touches them) and the node carries no price in this view, because a self-run price needs a yearly count, which comparison D
sets.

| Place | PUE | U | Site water | Grid default (all offer the same feeds) | Idle floor | Evidence |
|---|---|---|---|---|---|---|
| Hyperscale cloud | 1.10 (1.09 to 1.10) | 0.50 | 0.36 L/kWh | US 350 g, or the operator's | inside U, a = 0.11 | gf-053 au-011 sf-020 tr-009 ec-020 |
| Regional colocation | 1.45 (1.36 to 1.58) | 0.30 (0.21 to 0.35) | 0.36 | NWPP 288 g | inside U | tr-065 sf-022 sf-020 |
| Community node, local cloud | 1.10 (1.0 to 1.5, assumption) | 0.10 (0.05 to 0.15) | 0 | NWPP by default; WA, US, hydro, wind, solar, diesel as declared feeds | P_idle x 8760 / n, or 0 if already on | lf-024 gf-044 sf-044 |
| Personal device, added energy only, already on | 1.0 | n/a | 0 | reader's grid | none; charger x2.4 to 4.6 at the wall on phones | lf-022 sf-037 lf-018 |

One short prompt, same model, place only: hyperscale 0.30 Wh; colocation 0.45; node at U 0.10 0.54; device 0.32 (the device loses at the accelerator's a = 0.11 and wins
only at a conventional server's 0.36). Comparison D changes the model; this view does not.

## 7. The Architecture Comparisons (one year unless stated; both sides on one grid unless marked "scenario"; the viewer's side is identical across options and shown once)

**A. Cloud against local-first, office suite for 50 people.** Cloud seats: 110 kWh in the data center on the 2011 whole-service figure (260 kWh with the laptop draw of
cloud editing, sf-014, sf-015), $9,840 (seats $8,400 plus 2 assumed administration hours a month, $1,440; the local row carries 14), 38.5 kg on the US grid and 31.7 kg on
the server's own grid, 537 L (381 L on the Northwest mix); the vendor's own 210 g per user-month, 126 kg, is 96 percent Scope 3 on another boundary (sf-017, sf-018).
Local-first, an open-source suite on one 45 W server (gf-054 high) with the work done on the devices: 434 kWh (263 to 788); $10,616 at 14 paid hours a month and $60,
$4,736 at $25, $536 if staff time is already paid, a tie at $55 an hour; 125 kg at NWPP, 9.1 kg as a declared hydro feed, plus 130 kg a year embodied (54 on sf-025);
1,347 L on the Columbia convention, 206 L without reservoir evaporation, 0 on site. Local over cloud energy prints as a spread, never a ratio: 0.8 to 7.2 times on the data
center alone and 0.2 to 4.9 with sync watts; the two tie at 4.3 W of sync draw, a 30 W server, or 6.6 kWh a seat-year. Local loses on energy (idle hardware), on carbon on
one grid (125 against 32 kg), on price whenever hours are paid (labor was the largest line in Schleswig-Holstein, sf-003, sf-004, lf-057), on compatibility (about 20
percent of desks still needed Microsoft, lf-056; the ArtCraft apps are labeled in development, px-060, sf-057, lf-054; Munich reversed, sf-006), and on redundancy (867
kWh with a second box). It wins on license price (0), on working without broadband (24 percent on Tribal lands lack it, sf-056), on custody, and on carbon only as a
declared clean feed the cloud is not on. LibreOffice, Nextcloud, and ArtCraft are named as what the projects say they are (sv-044, sv-045, sv-043); no vendor is endorsed.

**B. Local cloud and embedded cache against a platform, 1,000 views of a one-hour 1 GB video, the same network on both sides.** Platform: 0.45 Wh data center plus 1.6
Wh network per view, 2,050 Wh, $60 at a retail delivery list (px-053; margin, player, and encoding inside), $122 of revenue, not a cost. Local cloud on an 8 W mini PC
(sf-042, lf-033), priced at cost plus labor: 79,800 Wh per 1,000 views at 1,000 views a year (78.2 Wh per view node only, 77.1 of it idle floor), 10,400 at 10,000, 3,470
at 100,000 (1.87 node only); $789 a year with one paid hour a month, $69 without; one box on one link against a global network with redundancy. On the same network the
local box never beats the platform's serving energy at the measured intensity (1.1 W per stream is above 0.45 Wh per GB-hour) and beats it above about 4,200 views a year
at the DESNZ first report's intensity, which its authors retired on 07/28/2026; at the follow-up's lower intensity it never does (about 450,000 on one change); if the Nation's own network is credited at marginal cost (0.13 Wh per GB) against the platform's average (1.6),
the crossover is about 94,000 views a year (13,500 to 250,000, or never). That credit is a convention and prints as one. The embedded cache (Netflix Open Connect class,
360 W at 180 Gbps, sf-028): 0.018 Wh per GB at 25 percent load plus one upstream fill per title, 19 Wh in all, an upper bound; it wins on energy and loses on control,
because the platform places it and decides what it holds (sf-029, lf-034). Local wins when the link out is slow, metered, or down, and when many people watch the same
thing (sf-030, sf-031).

**C. Interfederated data, 10 TB shared by ten Nations (the service: every Nation can read all 10 TB); one storage coefficient and one boundary on every row; the
"already on" setting reaches every local row.** Ten full copies on ten 46 W NAS boxes with one network fill each (lf-032): 4,593 kWh, $9,037 (labor $7,200), 480 kg a
year embodied at 20 kg per TB or 24 at sf-025. One central cloud copy, three replicas, drives only: 188 kWh, $3,480 on S3 plus $9,000 of egress for one pull each (px-048,
px-049), $2,520 on R2 (px-050, px-051), $1,554 on B2 (px-052), each with one assumed administration hour a month ($720). Federated query in place, one copy per Nation, 1
percent of the data moving a month, ten operators at one hour a month: 4,434 kWh with ten whole boxes (the default) and 64.6 kWh drives only when the nodes are already on,
a declared setting; $8,531; three copies per Nation, drives only, 190 kWh, the cloud's own figure. Central R2 and B2 are 3.4 and 5.5 times cheaper than federated. Ten full
pulls cost 160 kWh of network against 1.9 kWh a year of queries, and the only measured interfederation saving is bytes (90 percent duplicate removal with content-defined
chunking, sf-032; PeerTube 3 to 4 times less server bandwidth, sf-031), not kilowatt-hours; every federated kWh in the literature is simulated (sf-034), federated learning
can emit up to 100 times centralized (sf-033, lf-052), and federated social software copies content to every member server (lf-029, sv-060). Interfederation loses on
energy unless the nodes are already on, on availability (ten nodes must be up), on labor (ten operators against one), and on simplicity; it wins on bytes, on one external
dependency fewer, and on consent, which no row prices. The cloud's drive-level figure sits far below whole-service storage footprints on other boundaries (ec-026).

**D. Federated compute, 1,000 prompts of 500 in and 300 out (au-015), four places, answer quality not equal, no ranking across model classes.** Hyperscaler, measured
median prompt: 300 Wh (340 at the mean-class prompt), $4.00 at Sonnet list ($0.20 at a like-class small model's list, Haiku, au-051), 105 g on the US grid and 86 g on the
node's grid, 1.5 L (the token chain would say 447 Wh). Regional colocation, energy only: 448 Wh, 129 g at NWPP, 1.6 L; its $0.255 is an open-weight host's list for a
different model and a different business (px-014, px-015), with no rack fee, hardware, or paid hours, so it is not the cost of regional computing, which the record cannot
price. Community node, a 7B model on a 40 W desk node pooling the Nation's demand, GPU-only joules per token (au-027) against a full-stack median: 4,015 Wh at 100,000
prompts a year (3,854 of it idle), $28.74, 1,156 g on the local grid (84 g as a declared hydro feed), 12.5 L (27 L on the Columbia convention of that feed); at 1,000,000
prompts, 546 Wh, $2.89, 157 g (11.5 g hydro), 1.7 L; with the 29 percent of queries a 7B model cannot answer sent to the cloud (sf-035), 4,101 and 632 Wh. Embodied carbon
beside, never mixed in: 500 g per 1,000 prompts for the box at 100,000 a year (50 at 1,000,000) against 13.6 g for the accelerator share. On one grid the node catches the
hyperscaler on energy and carbon at the same count, about 2.8 million prompts a year (0.88 to 17 million, or never); the 80,000-prompt carbon crossover exists only as a
scenario in which the node is physically behind a hydro meter and the hyperscaler is on the US grid (38,000 to 15 million), and is about 500,000 with embodied carbon on
both sides. Laptops with a 3 to 9B model, idle sunk: 24 Wh, $0, 7 g, and 110 Wh (32 to 357) once the queries the local model cannot answer go to the cloud. Phones on
the NPU: 73 Wh (lf-018), 181 at the wall (lf-022), 266 with the cloud share; the order against the hyperscaler reverses at 3,590 J per query or 49.6 percent coverage.
Local hardware is 1.4 to 1.5 times less efficient per watt for the same model (sf-036, lf-012), the cost per million tokens swings 73 times with how busy one GPU is
(sf-041), and a 7B model is a different product from a frontier one (sf-037, lf-013).

**E. Leaving a cloud, a one-time move of one Nation's data, 10 TB as an illustration, the size of comparison C; one storage coefficient and one boundary on every year row.** A move row is
one time and a year row is one year; nothing adds them. The move, to the Nation's own node: 16 kWh of network for the one copy, 5.6 kg on the network's grid, 72 L; $3,300 from S3 ($900 of
list egress, $2,400 for 40 assumed hours at $60, $0 of any other bill) and $2,400 from R2 or B2, whose egress is free (px-051; B2 to three times stored data, px-052), a price and not zero
energy. To a federated set, three copies: 48 kWh, $8,100 from S3 and $7,200 from R2 or B2, because a peer copy pays no egress but takes the same network and its own hours. Nine days on the
wire at 100 Mbps, a lower bound (0.93 at 1,000; 37 at 25; sf-056). AWS, Google, and Microsoft each run a free exit program on request, with conditions the vendor sets (mv-001, mv-002, mv-003), so
the S3 row keeps list as its central figure and its spread runs to zero. The hours (40; 8 to 160) and any other bill ($0; $0 to $1,000) have no source and print as labeled assumptions, and at
the assumed hours the bill for leaving is mostly hours, not egress. The year: S3 $3,480, R2 $2,520, B2 $1,554, each 188 kWh, drives only, three replicas, one assumed paid hour a month. One copy
on the Nation's own NAS box: 443 kWh (131 to 1,209), $902, 128 kg against the cloud's 54 kg on one grid; embodied 48 kg a year against 120 kg for the cloud's replicas at the same coefficient and
life (spread to under 1 kg per TB, sf-025). Three copies across three Nations' nodes, the cloud's durability: 1,330 kWh, $2,706, 383 kg, and 225 kWh when the nodes are already on, the setting.
The move pays back against S3 in 1.3 years (0.35 to 4.2), R2 in 1.5 (0 to 5.9, or never at 3.5 paid hours a month), and B2 in 3.7 (0 to 15, or never); three copies pay back against S3 in 10
years (0.41 to 38, or never) and never against R2 or B2 at these settings. **What this changes, said plainly.** Local still loses on watt-hours: 2.4 times the cloud's figure at one copy, 7.1
times at three, and no single change reverses the three-copy row; a 15 W two-bay box (sf-043) or a node already on reverses the one-copy row, where one box is held against three replicas (the tie
is 19.5 W). It wins on price against list storage at one copy, even with hours paid at $60, and that sharpens section 9: the paid hours that sink comparisons A and C come from 14 hours a month and
from ten operators, not from one Nation's one box with one hour a month on each side. At 3.5 paid hours a month, the top of a seller's figure, the order reverses against R2 and B2, and at equal
durability it holds against S3 only. The boundary leans toward the cloud: its figure is drives only and the box is whole. The one whole-service figure in the record, 166 to 280 kg per TB-year
(ec-026), makes this data 1,660 to 2,800 kg a year on another boundary, a ceiling beside the 66 kg floor, and the record holds no whole-service figure for a local box, so the two are never
subtracted and the watt-hour order is a finding on the record's one shared boundary, not on every boundary.

**Project scale, no defaults (added under review).** The reader enters site megawatts, a load factor, cooling (0 dry, 0.36 operator average, 1.74 to 2.5 tower), and a
grid factor, and a load to compare with; the panel returns MWh a year, site liters, tonnes CO2e, and the share. For scale, 100 MW for a year is 876 GWh, 315 million
liters at 0.36 L per kWh and 1.86 billion at the tower midpoint. Hosting a building does not supply a Nation's own computing.

## 8. Abatement Levers (the term each one moves; before and after at the same setting)

| Lever | Term | Size in the record | After over before (Wh; $) | Evidence |
|---|---|---|---|---|
| Route simple tasks to a small model | e_m per token | 5 to 7 times; Mixtral class a fifth | 0.17; 0.05 | au-040 au-016 au-019 |
| Reasoning or agent mode off, an upper bound | t_out, calls per task | 25 times per response; 1,200 to 3,500 times tokens | 0.04; 0.13 | ec-017 au-042 |
| Cache a prefix or a title | t_cache at share c; one fill per title | c unmeasured (0.01 to 0.25); caches serve 70 to 90 percent | 0.16; 0.13 and 0.21; 1.00 | au-038 sf-029 sv-059 |
| Pool demand (batching, federation of users) | U up, a/U down | 3 to 5 times per token | 0.14; 0.10 | au-021 sf-008 sf-041 |
| Carbon-aware time or place | I_L | 16 percent temporal, 38 percent spatial, simulated | carbon 0.84 and 0.62 | lf-053 |
| Cooling type | PUE, WUE_site | dry: 0 L and 1.2 to 1.45 PUE; tower: 1.7 to 2.5 L | 1.06; water 0.72 | gf-043 gf-044 |
| Local clean power, a declared feed | I_L, w_gen | hydro 21, solar 43 g; water 0 to 38 L by convention | carbon 0.07; water 2.19 | gf-035 gf-033 gf-039 |
| Query in place instead of copying | copies, bytes moved | 90 percent duplicates removed; bytes not kWh | 0.97; 0.94 (0.07 with drives only on both) | sf-032 sf-027 |

The open suite on a local server is comparison A, not a lever: it raises energy and price. Rebound is outside the unit: per-task energy falls 10 times a year (ec-057;
Google 33 times, fp-009) while totals rise (Google plus 37 percent, rs-003), price elasticity sits near one (ec-044), and the IEA says so (ec-058). The page prints the
per-unit number and the count beside it, and this pair as the reason a per-unit saving is not a total one.

## 9. Where Local or Federated Systems Lose (plain list, printed on the page)

Idle hardware at low use: the a/U term, and 77 of 78 Wh per local video view at 1,000 views a year. Paid hours, the largest line in every self-hosted price (sf-051,
sf-004). Energy per answer at equal model size (sf-036). Answer quality and agentic work (sf-035, lf-013). Carbon on one grid, at every count the record supports. Water
under the reservoir convention on hydro power (gf-039, gf-040). Availability and redundancy: one box, one link, ten operators. Replication in federated software (lf-029).
Federated training (sf-033). Consolidation saved electricity from 2010 to 2018 (sf-019, sv-037). The phone side can draw 138 percent of the cloud-offload case (lf-011).
Maturity and support of the named open-source apps (sf-057, lf-055, sf-055).

## 10. What No Resource Number Captures (a separate column, text only, never converted)

Custody and jurisdiction over the data; consent (no Nation's data leaves its node); working when the link is down (sf-056); who can change the price and when (px-007 on
12/01/2026; px-045 on 07/01/2026); a model for a language the cloud does not serve (Te Hiku Media, 92 percent for te reo Maori, lf-058); local skills and ownership (a
Tribally owned colocation facility exists, lf-059, sf-053, with a self-reported PUE of 1.28 and no published electricity or total water, sf-054); a clean feed is a supply
arrangement before it is a number. On the other side, also text only: vendor support, maturity, format fidelity, and a second site for free. The page shows these beside
the four measures as words and lets the reader weigh them; the model never turns them into watt-hours or dollars.

**A rule a reader can set, and what it costs (`custody` in the parameters; `custody_view()` in the script).** One setting, "Where this data may be held", with three options: any place; a node a
Nation controls; a federated set of Nations' nodes. Each row names who holds the data (a vendor, a platform, a host, a federated set, a node, a device). A row that breaches the rule is not scored
lower: it leaves the comparison whole, its figures unchanged, and is listed with its reason. The cloud fallback rows leave too, because they send what a local model cannot answer to a hyperscaler;
a local row that stays says those queries go unanswered under the rule (sf-035). Beside what stays, the view prints what the rule costs on four lines, the span of the rows that stay against the
span of the rows that leave: idle watts the Nation carries, paid hours a year, price with its basis, and energy, and it names where the rows that stay run higher and where they run lower. Under a node
a Nation controls: office suite, 45 to 90 W, 168 hours, $10,616 to $11,153, and 434 to 867 kWh against 0 W, 24 hours, $9,840, and 110 to 260 kWh; shared data, only query in place stands, 460 W, 120
hours, $8,531, and 4,434 kWh against as little as 0 W, 12 hours, $1,554, and 188 kWh; leaving a cloud, 46 W, 12 hours, $902, and 443 kWh against 0 W, 12 hours, $1,554 to $3,480, and 188 kWh, where
price runs lower and energy higher. The fixed line stays with the setting: "Each Nation decides for itself. This setting shows what a rule would cost in idle watts, paid hours, and price; it does
not say which rule is right, and no number here stands for consent or custody." The model never converts consent or custody to a number, and a filter is not a recommendation.

**A reader's own reading (`measured` in the parameters; `apply_measured()` in the script; `FIELD-PROTOCOL.md`).** Device watts, router watts, the office, media, NAS, and AI node watts, the idle fraction,
room utilization, room PUE, joules per token, data per prompt and per coding hour, and the cache share can each take a typed value. It recomputes every row it touches for that run, takes no spread,
drops the input's claims for that run (named as replaced), and carries the label "your measurement, not verified by ATNI". The label comes from the model, never from what a reader or a file supplies.
How it travels: `moved_rows()` finds the rows it changed, each of which prints the label; `measured_line()` is the one sentence that goes with it, added to a moved row's Copy Reading
(`copied_reading()`), printed at the foot of every plate, and written first in the CSV, whose `measured` column holds the label on every moved row (`outputs_csv()`). It stays out of the address, as
every typed number does. Nothing in the model or on the page writes it to the claims record. A scenario file, when one is built (idea E5), carries typed values under their input names and re-stamps
them on import; no label is ever read from a file. A Nation's release of a reading is that Nation's decision.

## 11. AI Is Not Data Centers

Five separations the page makes explicit. (1) In the same hour the screen and router are about 12 Wh on every phone row with the router charged by time (a television
alone is 100 Wh or more), and the activity adds 0.8 to 3 Wh, chat or video (view 1). (2) Most data center electricity is not AI today, on two definitions that must not be
mixed: AI-focused facilities were 155 of 485 TWh worldwide in 2025 (32 percent, lf-001, IEA) and AI workloads 15 to 25 percent (lf-002, second-hand); the growth is AI,
310 of the 460 TWh the IEA adds by 2030 (67 percent), and in LBNL's US reference case AI servers reach 55 percent in 2030 (lf-003), training 20 to 35 percent of AI server
draw (lf-004). (3) AI can run outside a data center: the place profile moves 1,000 prompts from 300 Wh in a hyperscaler to 24 Wh on laptops that are on anyway, at a cost
in quality, and 11 to 29 percent of queries go to the cloud regardless (sf-035, whose derived line shows the rounding and the 50 percent of a 4B model, the top of this row's spread); a busy data center has the lowest energy per answer at equal model size because its
hardware sits idle least, which is arithmetic about utilization and not a reason to site one, and a dedicated local node catches up only above about 2.8 million prompts a
year on one grid. (4) Data centers run things that are not AI: the video, storage, office, and search rows. (5) One person's chat is not the buildout: all of ChatGPT's text
chat is about 0.27 TWh a year on Google's median prompt (0.22 to 0.55 across the median figures), text only, a floor for one product against the IEA's 485 TWh global
total; a proposed building is a question for the project scale panel and the Questions for Tribal Leaders, and hosting a building does not supply a Nation's own
computing.

## 12. Uncertainty and How Ranges Print

Three kinds of spread, never mixed on one figure: (a) **input extremes**, every low and high run through the same equations with the settings fixed, printed "x to y" and
labeled "spread, not a confidence interval"; (b) **conventions** (hydro water 0, 6.8, or 38; network average or marginal, a 10 to 50 times gap; router by time, by data,
or excluded; grid average or marginal, nine times; the node already on or not), printed as a named selector on the figure, never as a range; (c) **bounds**, a bottom-up
floor beside a top-down ceiling on another boundary (Google's 3.6 Wh per 1,000 tokens is 9.6 times the chat prompt at its 800-token shape, au-048; Meta's 15.1 Wh per
person-day is 52 times the short row's data center segment, fp-059), printed as "floor; ceiling (different boundary)". Crossovers print as ranges (central, and the low
and high from one change, "or never"), never as one count. The central value is one defensible setting, not a mean. Two significant figures. Every segment carries the
same-hour basis label (measured, reported, modeled) and its claim ids; a number enters only with status verified, or partly with the limit printed. Each row names the one
input that moves it most: chat, kind of chat and prompts per hour; coding, turns per hour and the cache-read share c; video, the 45 times intensity dispute; local rows,
idle watts, U, and the wage; water, the hydro convention; carbon, the grid. Of 52 printed comparisons, 33 reverse on one input end or one setting (26 of the 42 from before comparison E, and 7 of its
10); the back-test table (section 13) prints beside the tool. Three things print apart from these spreads. A payback can be never, so it prints as a crossover does: central, the low and high from
one change, "or never". A typed value has no spread of its own and carries its label (section 10). The illustrative carbon damage is a published family's low, central, and high, which are the
source's own discount choices, not a spread of this model (section 5).

**What a field reading would change, worked from the defaults (`field_lines()`; the page and `FIELD-PROTOCOL.md` read these).** Each local row moves with its own box's watts: office server 45 W, media
box 8 W, NAS 46 W, AI node 40 W. The rows that are nearly all idle move about one for one, so half a default about halves the row and twice about doubles it: the office server halves at 22.5 W and
doubles at 90 W; the NAS at 23 and 92; the node at 100,000 prompts a year (96 percent idle) at 19 and 82; the node at 1,000,000 prompts (71 percent idle) at 12 and 97; the media box at 1,000 views a year
at 3.9 and 16, and at 100,000 views (22 percent idle) it cannot halve on idle alone and doubles at 44. The earlier sentence, "under twenty watts halves every local energy row; over a hundred doubles
them", did not follow from the defaults and is gone: at 1,000 views a year twenty watts more than doubles the 8 W box's row. A logged cache share at the top of its spread, 0.25, raises the coding session 1.86 times and
the coding hour 1.74 times; it does not double them. The dollars per hour of agent time miss by 3.2 times (px-016).

## 13. Implementation Instructions for the Next Agent

**Files.** `scripts/resource_model.py` (standard library only; `--self-test`) writes `work/site-refresh/evidence/resource-model.json` with `"schema": 1`, `"tier": "T0"`,
in the shape of `comparison-model.json`: `inputs`, `assumptions` (the selectors), `places`, `catalog`, `hour_baseline`, `where_it_runs`, `architectures`, `levers`,
`crossovers`, `top_down`, `qualitative`, `disclaimer`, `project_scale`, `calibration`, `regression`, `backtest`, `sensitivity`, `stability`, and `computed_defaults`
(every selector at every option, the crossovers, and the same-hour rows at default, low, and high). Same-hour inputs are read by key from `comparison-model.json`
(including the mean prompt), never copied. Do not touch `site/`; page builders pour the JSON into `site/data/`. `tmp/rm/rm_results.py` regenerates the results document;
`tmp/rm/rm_jev.py` the row-level Jev pass; `tmp/rm/fc_rerun9.py` the fairness rerun on the changed cases.

**Added inputs (central; low to high; unit; evidence; status).**

| Input | Central; low to high | Unit | Evidence | Status |
|---|---|---|---|---|
| EI_in; EI_out | 0.29; 0.87; highs 0.70; 2.1 (unknown provider) | Wh per 1k tokens, IT | au-008 au-009 au-011 | partly |
| decode-to-prefill ratio | 3 (alternative 10) | ratio | au-010; ec-018 | partly; a choice, not an estimate |
| cache-read share c | 0.10; 0.01 to 0.25 | share of fresh input | assumption (no measurement; au-038 for the 96 percent) | assumption |
| coding turn shape, median | 3 turns; 227.6k prompt; 217.2k cached; 1.9k out; fresh 10.4k derived (quantiles do not subtract) | tokens | au-043 au-038 au-045 | verified; fresh modeled |
| coding turn shape, mean | 6.1 turns; 582.5k prompt; 545.3k cached; 4.0k out; fresh 37.2k | tokens | au-043 | verified; used for anything scaled by a count |
| tokens per prompt | 500 in, 300 out (au-015, the energy median's shape; 100 in is the price example) | tokens | au-015 px-024 | verified |
| image; clip; search | 0.63 (0.32 to 1.35); 30.8 (19.8 to 43.4); 0.3 + e_prompt | Wh | fp-138 fp-066 fp-065; fp-070; fp-071 sv-056 | verified; partly; stale |
| PUE hyper; colo; room | 1.10 (1.09 to 1.10); 1.45 (1.36 to 1.58); 1.10 (1.0 to 1.5) | ratio | gf-053 au-011; tr-065 sf-022; assumption | verified; verified; assumption |
| U hyper; colo; room | 0.50; 0.30 (0.21 to 0.35); 0.10 (0.05 to 0.15), one definition | share | sf-020; lf-024 sv-038 ec-028 | verified; untested |
| idle fraction a | 0.11; 0.11 to 0.36 (accelerator; server anchors 0.25 and 0.36 set no row) | share of P_max | ec-020; sf-008 sv-039 lf-024 | partly; untested |
| grid factors | US 350; NWPP 288; BPA-assigned 49.3 (gf-062, a different accounting method); WA 113 (CO2); NW short-run 728; long-run 79; hydro 21; wind 13; solar 43; diesel 730; the same feeds on every place | g per kWh | gf-007 gf-001 gf-009 gf-019 gf-023 gf-035 gf-034 gf-033 gf-047 gf-049 | verified; life-cycle partly |
| site WUE | 0.36; 0.27 to 1.15; local 0 | L per kWh | tr-009 tr-028 fp-006; gf-044 | verified |
| generation water | US 4.52 (1.40 ERCOT); hydro convention 6.8 (0; 38); gas 0.776; hydro share NWPP 0.387, BPA 0.775 | L per kWh; share | tr-005 gf-041; gf-040 gf-046 gf-039; gf-037; gf-008 gf-018 | verified |
| storage; replicas | 0.65 (0.57 to 1.2), one coefficient on every row; 3 (2 to 3) | Wh per TB-hour; copies | ec-021 lf-027 gf-052; ec-030 | verified; assumption |
| NAS; mini PC; stream; desk node idle | 46 (15 to 46); 8 (7 to 9); 1 (0 to 2); 40 (30 to 250) | W | lf-032 sf-043; sf-042 lf-033; lf-033; gf-054 sv-039 | partly |
| local J per token: node (GPU only); laptop; phone per query | 1.5 (1.11 to 4.0); 0.25 (0.09 to 0.25); 262 (122 to 3,590) | J | au-027 au-028 sf-038; sf-037 lf-009; lf-018 sf-039 lf-008 | partly |
| local quality; efficiency penalty; charger | 0.496 to 0.887 coverage, central 0.714, applied to node, laptop, and phone rows; 1.4 to 1.5; overhead 2.1 (1.4 to 3.6) | share; ratio; ratio | sf-035; sf-036 lf-012; lf-022 | partly |
| token prices | in 2 (0.15 to 10); out 10 (0.6 to 50); cache 0.10 (0.01 to 1); open-weight 0.15 and 0.60; small 0.10 and 0.50 | $ per M | px-003 px-004 px-012 px-013 au-051 au-053 au-055; px-014 px-015 | verified, dated 11/04/2026 |
| other list prices | image 0.0336; clip 0.10 per s; search 0.014; seat 14 (7 to 23.5); S3 0.023; R2 0.015; B2 6.95 per TB; egress 0.09 (0 to 0.11); delivery 0.060 retail | $ | px-027 px-028 px-029 px-045 px-046 lf-043 sv-018 px-048 px-050 px-052 px-049 px-051 px-053 | verified |
| hardware prices; life | DGX Spark 6,950; Mac mini 899; HDD 22.22 per TB; NAS chassis 400; life 5 (3 to 7) | $; years | px-059; lf-044; sf-052; assumption; assumption (gf-051 uses 4) | verified; assumptions |
| tariffs | WA commercial 0.1097; OR 0.098; WA residential 0.1317; US residential 0.1723; industrial 0.0851; BPA 40.16 per MWh | $ per kWh | sv-023 sv-024 lf-041 sv-022 ec-050 px-058 | verified |
| labor; support | 3.5 h per month per server; 14 (8 to 20) for 50 users local; 2 (0 to 14) cloud seats; 1 (0.5 to 3.5) per NAS, federated node, or central copy; wage 60 (0, 25, 60); support 71 to 205 EUR per user-year | h; $ | sv-042; assumption; sf-051; sf-049 sf-055 | partly; assumption |
| embodied | H100 board 1,312; server see gf-051; mini 30; desktop 250; HDD 20 (under 1) per TB | kg CO2e | gf-050; gf-051; sv-036; sf-023; sf-024 sf-025 | partly, unresolved |
| revenue readings; paid | Netflix 0.256; YouTube 0.122; Meta 0.115 to 0.195; Search 0.05 per query (revenue, not a cost); Netflix 8.99 and ChatGPT Plus 20 per month | $ per hour; $ per month | px-042 px-043 px-039 px-035 px-040; px-044 px-047 | partly; verified |
| top-down checks | 3.6 Wh per 1k tokens; 15.1 Wh per person-day; 2.2 kWh per user-year (the seat row itself); 210 g per user-month; 0.112 kWh per $ (0.075 to 0.29); 0.089 kg per $; $13 per active day | mixed | au-048; fp-059; sf-016; sf-017 sv-052 sv-053; rs-001 rs-020 rs-033 fin-028 fin-029 fin-031; ec-053 ec-054; px-016 | partly; checks only |
| leaving a cloud | hours to run the move 40 (8 to 160) per copy; any other one-time bill 0 (0 to 1,000); copies on the Nation's node 1 (1 to 2); pulls billed, federated set 1 (1 to 3); link 100 Mbps (25 to 1,000); R2 egress 0; B2 egress 0 (to 0.01); whole-service storage 223 (166 to 280) kg per TB-year, a check only | h; $; copies; pulls; Mbps; $ per GB; kg | assumption; assumption; ec-030; assumption; sf-056; px-051; px-052; ec-026 | assumptions; verified; partly |
| egress programs | free on request, with conditions, at AWS, Google, and Microsoft; never the row's central figure | $ per GB | mv-001 mv-002 mv-003 | verified; partly |

Read the quote before using sf-016 (the 2.2 kWh is in its note and is the whole service), gf-051 (3,424 kg is a four-year product footprint; split it), and au-017 (the
measured DeepSeek value sits in the quote). Solar prints no generation water until a PV claim is added.

**Computations.** `idle_mult(U, a)`, `tokens_wh`, `tokens_usd`, `layer`, `four(layers, price)` with carbon and water by each layer's place, `w_gen_nw(share, convention)`,
`self_run_price`, `project_scale`, the catalog (mean turn on the hour row; readings beside: mean session, storage, mean prompt, wall figure), the four place profiles
(node unpriced), the four comparisons with their crossovers (views per year against the platform at both intensities and both network conventions; prompts per year
against the hyperscaler on energy, on carbon on one grid, under the hydro scenario with and without embodied carbon, and on price against frontier and open-weight lists),
the levers, the top-down checks, the trend-controlled panel (`ols`, `trend_controlled`), and `computed_defaults` for every selector at every option. Print the one input
that moves each row. Second version: `exit_comparison` (comparison E), `upkeep` (idle watts and paid hours per row), `field_lines`, `custody_view`, `apply_measured`, `moved_rows`, `measured_line`,
`copied_reading`, `outputs_csv`, `carbon_damage`, `damage_column`; `scripts/fit_idle.py` reads plug-meter readings and imports `idle_mult`, so the fit and the model hold one formula.

**Porting the second version to the page.** `--export --out-dir FOLDER` and `--oracle --oracle-file FILE` write the public files and the oracle elsewhere, so a port can read them before they land on the
site. The tree gains `arch.E.*`, `upkeep.*`, and `field.*`; each oracle case gains `custody_rule`, `custody`, and `payback`, and the oracle gains `measured_cases`, `measured_refused`, and `damage_cases`.
Older cases keep their settings and fields, because the custody rule draws from its own random stream. Custody and the typed values stay off the address, and the custody setting is not one of the
global settings. `scripts/build_explorer.py` needs comparison E in `ARCH` and its row words, with its one-time rows apart from its year rows, and its `CLAIM` pattern and `scripts/validate_public.py`'s
`CLAIM_ID` pattern need `ex` and `mv`; `scripts/build_plates.py --export-claims econ sovereign model-v2` ships the claims the second version names.

**Calibration (only these, only on these figures).** `a` is the accelerator's idle fraction (ec-020); the server anchors sf-008 and sv-039 print and set no row; the
decode-to-prefill ratio from au-030 and au-031 (ratio 3 lands at 1.00 and 0.51, ratio 10 at 0.49 and 0.50) and sv-028 (5.3 against 2.2), keeping 3 because 10 breaks
au-032 (0.25), a choice stated as one; c stays 0.10 with its band because nothing measures it. Nothing else is tuned, and the held-out rows below are never used to set a
coefficient.

**Back-test (model over published; held out means the figure set no coefficient, chose no setting, shares no input, and tests the unit law).** Held out, 8 (fp-141 DESNZ follow-up data center hour added 11/04/2026, 2.6): fp-017 Joule
median 0.31 Wh (1.44); sv-048 UBA HD stream 2.3 Wh (0.39); fp-041 BBC hour 65.7 Wh (1.77); gf-052 Seagate 5.09 kWh per TB-year (1.12); lf-025 Google 2011 email server
70 kWh per user-year (0.12); au-017 DeepSeek-R1 20.9 Wh (0.52); px-016 $3.25 per coding hour (0.31). Printed, not held out, 6: au-032 (0.80, chose the ratio); fp-035
(0.62, shares inputs); sf-017 (0.31, another boundary); au-036 (1.48, tests the revenue constant, not the model); fp-031 (0.86, shares the cache assumption); sv-028 (5.28,
chose the ratio). Held out: median factor 1.9, 4 of 7 within two times, worst 8.1. All 13: median 1.77, 8 within two times. The chain undercharges long output about two
times on a large reasoning model (au-017), and the coding hour at 6 mean turns sits 3.2 times under the published $3.25 (43 mean turns give $7.26). Then run Jev on the
derived rows (`rm_jev.py`) and the fairness cases (`fc_rerun9.py`), and record the output before the pour.

**Tests (`tests/test_resource_model.py`, 65, skipping when the JSON is absent so CI stays green before the pour; those added for the second version cover comparison E, the custody view, the typed value and its label, the damage layer and its removal, the field lines, the derived lines, the trace, and the idle fit):** (1) the chat, video, and short hours equal
`comparison-model.json` `computed_defaults.same_hour` at default, low, and high; (2) `idle_mult(0.5) == 1` and it decreases with U; (3) the coding session reproduces
au-045 within 3 percent; (4) every claim id cited exists in an evidence file with status verified or partly; (5) low <= central <= high for every input and every printed
range; (6) every water figure carries a convention label and every carbon figure a grid label that is not market-based; (7) every price carries a `basis` and a date;
(8) the `qualitative` fields are strings; (9) the crossovers printed equal the recomputed ones, the node at 100,000 prompts uses more energy than the hyperscaler while the
laptop row uses less, and on one feed the carbon crossover equals the energy crossover; (10) the back-test table equals the recomputed table; (11) `tier` T0, `schema` 1,
no em dash or spaced double hyphen; (12) the trend-controlled panel equals the econometrician's independent recomputation and no t, interval, R2, or "elasticity" prints;
(13) the already-on setting reaches every local row of comparison C and three federated copies, drives only, equal the cloud's figure; (14) every place can pick the same
feed; (15) one device on every hour row; (16) the cloud's assumed administration hours sit on the cloud side.

## 14. Disclaimer for the Page

"These are modeled estimates, not measurements: a bottom-up process model, units of work times published coefficients, checked against published figures. It is not an
econometric model; it estimates no coefficient, and its ranges are spreads, not distributions. Each row is units of work times published coefficients, plus the share of
hardware that sits idle to serve it, scaled by the building and the grid where it runs. No vendor has published a measured production figure for most rows, no Tribally
owned facility in the record has published its electricity use or total water, and the back-test printed here shows where the model lands within a factor of two and
where it misses by five to eight. Change a setting and the answer changes; that is the point of the tool. It says nothing about any site, stream, rate class, or
Treaty-reserved right, and it never turns sovereignty, consent, or resilience into a number."

## 15. Attacks and How They Were Resolved

Four independent reviewers (an econometrician, an LCA analyst, a Tribal energy director, and a public-facing checker) and the Jev fairness check (`FAIRNESS-CHECK.md`)
attacked the first version. Every item below names its fix: A changed an assumption, R widened or replaced a figure with its range, C added a caveat, X removed a claim,
S changed the script. Rerun: `python scripts\resource_model.py`, 28 tests pass, `fc_rerun9.py` on the changed cases.

**Econometrician.**
- "Econometric" is not an honest label (S, C): the model is now named a bottom-up process model checked against published figures, in section 1, the JSON purpose, and
  the disclaimer. The owner is told plainly that it is not the generalizable econometric model the brief asked for.
- The 1.71 is a common trend, not an elasticity (S, X): t, confidence interval, R2, and the word "elasticity" are gone from the JSON and prose; `trend_controlled()` prints
  the four specifications the reviewer ran (common trend 0.49, se 0.20; firm trends 0.41, 0.24; year effects 0.37, 0.45, df 7; first differences 0.30, 0.19, intercept
  0.20 log points a year), matching the reviewer's numpy recomputation exactly, with the sentence "electricity grew about 22 percent a year whatever revenue did"; the
  panel note says year effects now run and three clusters give no test; revenue is marked nominal.
- The a/U term is untested and misspecified (A, C): `a` is the accelerator's 0.11 (ec-020) on every row the multiplier touches, the server anchors print and set no row,
  U is defined once, the places and inputs carry "untested", and the input note records that lf-024's own numbers are not linear. The node in the where-it-runs view no
  longer carries a price whose load did not match its energy. A back-test against SPECpower curves and a plug-meter protocol is in `EXPLORER-COPY-INPUTS.md` as field
  work; the record holds no such claim yet.
- Medians multiplied by rates (A, R): `coding_fresh` is relabeled derived; the coding hour multiplies the mean turn (au-043) at 6 turns an hour, 211 Wh and $1.01, with 43
  as the other option; the mean session (202 Wh, $1.03) prints beside the median session, which is labeled "typical, a floor for totals"; the chat hour at the mean prompt
  (15.4 Wh) prints beside the median hour; px-016's $3.25 per hour is in the back-test (0.31).

**LCA.**
- Comparison C had no common boundary or function (A, S): the service is stated (every Nation reads all 10 TB); one storage coefficient (ec-021) and one boundary on every
  row; ten copies now pay their own network fill; `already_on` reaches ten copies and both federated rows; a three-copy federated row equals the cloud's figure, drives
  only; the lever ratio is a same-setting ratio (0.97 with ten boxes on each side, 0.07 drives only on both).
- The node's hydro default broke the location rule (A, X): the node rows default to the local grid; the hyperscaler has a same-grid row; carbon comparisons pair the two;
  hydro rows are labeled a declared arrangement and printed as a scenario; every place offers the same feeds; the factor-type mismatch (life-cycle 21 g against
  combustion-only grids) is stated on the selector.
- Medians times counts (A): as above; comparison D also prints the block at the mean prompt.
- Seat-month double counts storage (A): the 2011 figure is read as whole-service energy (183 Wh); storage (157 Wh) prints beside and is not added; the row is labeled
  illustrative and never ranked.
- Phone device layer is battery energy (C): section 5 says so; every phone hour row prints the wall figure (6.2 Wh) beside its 2 Wh.

**Tribal energy director.**
- No row for a proposed data center (S): `project_scale()` with no defaults (MW, load factor, cooling, grid, the Nation's load) in the script, the JSON, and the UI
  inputs; "hosting a building does not supply a Nation's own computing" in the talking points; "cheapest per answer because it is the busiest" replaced with "lowest energy
  per answer at equal model size, arithmetic about utilization, not a reason to site one"; the 0.056 percent is labeled text only, 0.22 to 0.55 TWh, a floor for one product.
- The carbon win came from unequal grid options (A): as above; 2.76 million prints as the one-grid carbon crossover, 80,000 only as the labeled scenario, with the line
  that hydro already committed elsewhere is not clean new supply.
- Regional computing is not costed (C): the colocation row says its price is an open-weight host's list for a different model and business, with no rack fee, hardware,
  or paid hours, and that regional self-run cannot be priced from the record; the node's price now sits beside a like-class small model's list ($0.20), not only the
  frontier list ($4.00).

**Public checker.**
- The $ column mixes four unlike things (C): every revenue figure is labeled revenue, not a cost ("ceiling on serving cost" removed everywhere); the delivery list is
  labeled retail against a self-run row at cost plus labor; the UI inputs require a basis column and forbid sorting across bases; px-042 is added to the Netflix row.
- The seat-month row (A, C): as above.
- One chat prompt priced two ways (A): the catalog prompt is priced at the energy median's own 500-in, 300-out shape ($0.0040), the same as comparison D.
- The back-test is flattered (X, R): au-036 is marked not held out (it tests the revenue constant); the headline quotes the held-out set only (8 figures since 11/04/2026, median 2.2, 4
  within two times, worst 8.1; before fp-141 was added, 7 figures, median 1.9), and the results document names every figure that is not held out.

**Jev fairness check (every flagged family).** A1 to A4: one grid on both sides (`cloud_same_grid`), a cloud admin-hours line (2 a month, 0 to 14), the energy ratio
replaced by its spread. B: same network as the default pair, the 12 Wh viewer side once, the one-box-one-link and cache-upper-bound caveats. C: the already-on setting on
both rows with both readings printed, the central side's operator hour, the R2 and B2 price statement, the three-copy row. D: one grid on both sides, the embodied line
beside, the cloud fallback on node and phone rows, the GPU-only caveat on j_node, the quality banner, crossovers as ranges. S1 to S3: no ratio, "median text prompt" with
the 15 to 172 Wh spread, prices by basis. S4, S5, S9: one device on every hour row (the device setting), the coding spread (30 to 2,900 prompts) instead of "a hundred".
S6, S14: "doubles" removed. S7, S8, S10, S11, S13: the different-models caveat on image and clip rows, the rate beside, the seat row illustrative. Levers: reasoning off is
an upper bound, open suite removed from the table, query in place at the same setting. Talking points: the growth split (R1), the revenue wording (R3), the "12 Wh" bound
and the 0.056 percent qualifiers, wins and loses with figures and claim ids, crossovers as ranges. Rerun (`fc_rerun9.py`, 38 cases): the strict rule still passes nothing,
as it passed no fair control; on the structural fixes the boundary and misleads scores moved the right way (B boundary 0.05 to 0.21, misleads 0.58 to 0.48; D node follows
0.45 to 0.69 and misleads 0.75 to 0.56; A3 misleads 0.65 to 0.49; S1 boundary 0.33 to 0.50), while the C family and the numeric wins-and-loses bullets did not move, so
those remain the voice editor's to-do: Jev reads a dense comparison of unlike services as misleading however it is framed, and the page should let the reader pick one
setting at a time rather than print the pair.

**The second version (11/05/2026).** Added, in Python first, with no change to any figure above: comparison E (section 7), the custody setting and the typed value (section 10), the carbon damage layer
(section 5), the plug-meter fit (`scripts/fit_idle.py`, `FIELD-PROTOCOL.md`), and the field lines (section 12). Each item names its fix as above.
- "Under twenty watts halves, over a hundred doubles" did not follow from the default (X, S): removed; `field_lines()` prints each row's own halving and doubling watts.
- "A cache share near 0.25 doubles the coding rows" was high (R): rerun at 1.86 times on the session and 1.74 on the hour.
- "The one back-test the model misses by about three times" (R): px-016 misses by 3.2, and sf-017, which is not held out, by 3.3, so it is not the one; the page names the row.
- "11 to 29 percent" rested on a rounding no claim showed (C): sf-035 now carries the derived line, and it shows 50 percent for a 4B model. The model's own spread runs there, so the sentence on laptops understates; the wording is the page's next call.
- "30 to 2,900 prompts" had no claim (C): mv-004 holds it as a modeled spread, with its arithmetic.
- The trace: every input resolves to a claim or to an assumption labeled by kind and in words; the numbers typed into the scenario now carry labels (`scenario_labels`); the wage and turn settings name their claims. A chart scale on the page, 0.05 Wh per square, is a design choice with no claim.
- Fairness, on one run each, read as the ranked list section 15 says it is: the new two-sided rows score as every two-sided row does (boundary 0.05 to 0.15, misleads 0.55 to 0.70), and the boundary score is earned, since the cloud is drives only and the box whole; that gap now prints as a floor and a ceiling. The custody sentence passed the rule (follows 0.67, misleads 0.36). The idle sentence moved the right way (misleads 0.84 to 0.74); the cache sentence did not improve (misleads 0.58 to 0.66), though the old one was wrong and the new one is the rerun's arithmetic.

**Decisions left to the owner.** (1) Whether the page may call this a model at all in the brief's sense: it is a process model, not an econometric one. (2) Whether 2
assumed cloud administration hours a month (0 to 14) is the right default; at 14 the office price comparison reverses. (3) Whether the hydro scenario rows belong on the
page at all, or only the one-grid rows with clean power as a lever. (4) The wording about the Tribally owned facility's self-reported PUE. (5) Whether the carbon damage layer ships at all; it is off by default and lifts out clean. (6) Whether 40 hours is a fair central figure for running a move, a number with no source.
