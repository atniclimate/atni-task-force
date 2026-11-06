# ATNI Energy Task Forces: working rules

The public repository serves `site/` only. Read `DATA-TIERS.md` before touching content.

## Tier boundary (non-negotiable)

- This project holds T0 (Open/Public) and T1 (Community Network) only; no T2 or T3.
- `planning-T1/`, `files-unsorted/` and `work/` stay local and gitignored. Nothing from them enters
  `site/` without an owner release decision recorded in `planning-T1/RELEASE-LOG.md`.
- Public drafts are written from T0 inputs only and kept in `work/public-drafts/` until poured into `site/`.
- Sending T1 to any external service (Jev, Codex) needs owner direction, a human eligibility check
  of the actual payload (semantic review: a distinctive project, place, role or negotiation fact can
  identify a Nation without naming it), and a row in `planning-T1/AI-PROCESSING-LOG.md`. The local
  name screen (`scripts/jev_release_screen.py --hold-terms`) is a floor, not clearance. Passing any
  screen is never a T0 release; releases are separate owner decisions.
- Uncertain tier: keep it T1 and ask.

## Checks before any push

```powershell
python scripts\validate_public.py      # public boundary, schemas, links, house style, claim marks, data/index.json
python scripts\check_t1_leak.py        # verbatim T1 text in site/ (local only); exit 1 blocks, 3 = review
                                        # derived-doc overlaps (--all lists them; record reviews in planning-T1\leak-allowlist.txt)
python -m pytest -q -rs tests          # energy-potential, plates, resource model, claim marks, site counts, index and briefing, intake, freshness, and helper tests
                                        # -rs names every skip: a skip here means a local file is missing, not a pass
node scripts\page_check.js --all       # jsdom checks of every plate page and the briefing (npm ci once; about 4 minutes); --page NAME for one; budgets print warnings, never fail
```

At an integration checkpoint, in a browser: `node scripts\a11y_check.js --out DIR --pages ...` and `node scripts\capture.js --out DIR --pages all`.
`python scripts\number_audit.py` lists prose numbers with no claim id and always exits 0.

After changing plates, claims, the model, or a data file they read, run `python scripts\rebuild_all.py`: it stops at the first step that fails, with that
step's exit code, and `--check` writes nothing and exits 1 naming each stale output. Its order, since later steps copy or count earlier ones:
`energy_claims.py`, `climate_claims.py`, `project_claims.py`, `build_plates.py --export-claims`, `site_count_claims.py` (the library and policy counts the
pages read), `build_project_map.py` (when its `--check` says stale), `build_plates.py` (`--page PATH` by hand for one page), `resource_model.py --self-test`,
`--export`, `--oracle`, and a plain run, `build_explorer.py`, `build_index.py`, `build_whats_new.py`, `site_count_claims.py` again (it counts What's New's
rows), `build_library_strip.py`, `pour_claim_refs.py`, `build_share_cards.py` (when its `--check` names a stale card; needs VectorCraft), `build_briefing.py`,
`build_briefing_pdf.py` (when its `--check` names a stale PDF; needs Chrome), `add_page_meta.py`.
`tests\test_index_briefing.py` fails with the fix if the briefing or the manifest has fallen behind, and `tests\test_briefing_pdf.py` if the PDF has. Pushing
to `main` publishes the site through `pages.yml`, so work on a branch. Never push to `main` or enable Pages without an
explicit owner command in the session.

A day-level `source.published` (YYYY-MM-DD) carries `source.date_words`, the words the source prints for that day; without them `validate_public.py` warns for claims from before N10 and fails newer ones.

## Data products

| Output | Built by | Tier |
|---|---|---|
| `site/data/library.json` | `scripts/merge_library.py` (dedupe + link check; `--require-cleared` for intake rows) | T0 |
| `site/library/index.html` strip and band figures | `scripts/build_library_strip.py` (from `library.json`) | T0 |
| `site/data/whats-new.json`, its rows on home and Library | `scripts/build_whats_new.py` | T0 |
| `planning-T1/research/intake/<date>/` candidates | `scripts/intake_pull.py` (Intake sheet download, screened; never a release) | T1 |
| `site/data/energy-potential.json` | `scripts/energy_potential.py` (plan-assessor public plans, Jev judgments, code ranking) | T0 (owner declared) |
| `site/data/energy-funding.json` | `scripts/energy_funding.py` (program catalog, Grants.gov live layer) | T0; heat section T1 until released |
| `site/data/policy-watch.json` | policy searches aligned to Policy Sentinel sources | T0 |
| `site/data/claims/*.json` | `scripts/build_plates.py --export-claims` from local evidence files (verified or partly only, with public limits) | T0 |
| `site/data/claims/anonymized.json` | by hand, never exported: the public wording of `lf-059` under the owner ruling of 11/04/2026, because its local evidence record names the operator and the Nation and `build_plates.py` holds that record back | T0 |
| `site/data/claims/potential.json`, `funding.json`, `site/data/plates/energy-*.json` | `scripts/energy_claims.py` from the two Energy data files (run it after either changes), then `build_plates.py --export-claims potential funding` and `--page` for the three Energy pages | T0 |
| `site/data/claims/site-counts.json` | `scripts/site_count_claims.py` (the counts the site states about its own files) | T0 |
| `site/data/climate-regions.json` | `scripts/climate_regions.py` (numpy; reads the NASA NEX-GDDP-CMIP6 county pull at `H:\raw-data\nex-gddp-cmip6-counties` and `projects.json`) | T0 under NASA's CC BY-SA 4.0 and CC BY 4.0 terms, stated on About |
| `site/data/claims/climate.json`, `site/data/plates/dc-climate-counties.json` | `scripts/climate_claims.py`, then `build_plates.py --export-claims climate` | T0 |
| `site/data/projects.json` | the N6 recheck of every source page under `work/site-refresh/n6/build/`, copied here; rerun it before a push, since the agency pages are live | T0 |
| `site/data/claims/projects.json`, `site/data/plates/dc-project-land.json` | `scripts/project_claims.py`, then `build_plates.py --export-claims projects` (evidence as for climate) | T0 |
| Land tab map and record list on `site/data-centers/index.html`, `site/assets/img/maps/projects.svg` | `scripts/build_project_map.py` (Census county file in `work/site-refresh/n6/`; `--check` reports staleness), after `project_claims.py` and before `build_plates.py` and `pour_claim_refs.py` | T0 |
| `site/data/claims/prose-*.json` | `scripts/build_plates.py --export-claims` from local evidence files, for numbers in prose | T0 |
| `.cr` marks' status and names, "Claims Cited on This Page" | `scripts/pour_claim_refs.py` (refuses a mark its claim does not hold) | T0 |
| `site/data/plates/*.json`, plate blocks in pages | definitions by hand or generator; `scripts/build_plates.py` pours numbers from claims | T0 |
| `site/data/index.json` | `scripts/build_index.py` (manifest of plates, claims, and data files; `validate_public.py` reads it) | T0 |
| `site/briefing/index.html` rail and packet | `scripts/build_briefing.py` (copies of built plate blocks and the checklists) | T0 |
| `site/briefing/atni-energy-briefing.pdf`, and its link beside Print packet | `scripts/build_briefing_pdf.py` (headless Chrome prints the default packet: the first plate each page lists and every checklist; `--check` compares a hash of the packet's HTML and of the stylesheets, scripts, and fonts it is drawn with, and needs no browser; a style change leaves the PDF stale until it is built again) | T0 |
| `site/assets/img/cards/` | `scripts/build_share_cards.py` (needs VectorCraft; `--check` does not) | T0 |
| page-meta blocks, `robots.txt`, `sitemap.txt` | `scripts/add_page_meta.py` | T0 |
| `site/data/resource-model.json`, `resource-model-inputs.csv` | `scripts/resource_model.py --export` (process model; Python is the oracle for `site/assets/js/resource-model.js`, the page's pure model, which `explorer.js` draws) | T0 |
| `site/explorer/index.html` blocks, home band | `scripts/build_explorer.py` (words and geometry from `resource-model.js` through `scripts/explorer_static.js`) | T0 |
| `site/library/index.html` strip and band | `scripts/build_library_strip.py`, by name after any change to `library.json`; `merge_library.py` does not call it | T0 |

EIA and SEC pulls: `scripts/eia_outlook.py`, `scripts/sec_financials.py` (generic User-Agent, no email).

## Design authority

`docs/DESIGN-SPEC.md` (sections A and B override the rest), `docs/PLATE-KIT.md`, `docs/PAGE-ARCHITECTURE.md`,
`docs/EXPLORER-SPEC.md`, `docs/RESOURCE-MODEL.md`, `docs/COMPARISON-METHOD.md`. Owner rulings: desktop first and full
screen, tight margins, less scrolling, interactive detail views; Energy pages use Orange Element `#FF914C`, including ENERGY
in the logo on any ground; ATNI Red stays the organizational color.

## Creative work

Design and copy are free within the design system and the rules on this page. The hard lines are few: T0 only in `site/`;
every number on a plate or in the Explorer carries a claim id with its status and limit; no external fetches, scripts, or
styles; no tracking or data collection; no speaking for a Nation; no Indigenous imagery or motif from stock, ever, and the
seal is the only such mark; nothing ships without the owner's push. Everything else in the design documents is a default,
including their refusal lists, page and script budgets, layouts, and component rules. Depart from a default with a one-line
reason, and update the document when a departure proves out. Budgets should warn, not block. Photographs from the shared
asset library or a Nation's consented photo are welcome, under the library's license terms. Run the smallest check that
covers a change, and use a browser at each integration checkpoint rather than per edit. If a rule slows good work and
protects nothing above, say so and propose removing it.

Upstream repositories (plan-assessor, TCR Policy Scanner, Policy Sentinel) are read-only from here;
each has its own owner and active writer.

## Running workflows

- Ask the owner's questions once, before any builder starts, and write the answers to a file the builders read (`work/site-refresh/<session>/OWNER-ANSWERS.json`).
- Read-only agents (claim-verifier, fidelity-reader, visual-qa) and every workflow subagent return findings as text; the harness refuses report files from
  subagents, so the conductor writes them to disk.
- Every verifier returns one verdict per item, and the conductor checks the count against the list before accepting. Use `work/tools/workflows/verify-items.js`
  (local; it batches the list, keys verdicts by id, asks once more for missing ids, and returns `complete` only when every item has a verdict).
- New public sentences are drafted or passed by pf-voice-lead when they are written, not in a later pass.

## Writing

Capitalize Tribe, Tribal, Indigenous, InterTribal. No em dashes in our prose. Do not credit AI tools
as authors or contributors. Legal points are questions for counsel. Use the pf-voice skill for public copy.
