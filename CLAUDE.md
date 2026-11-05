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
python -m pytest -q tests              # energy-potential, plates, resource model, claim marks, site counts, index and briefing, intake, and helper tests
node scripts\page_check.js --all       # jsdom checks of every plate page and the briefing (npm ci once; about 4 minutes); --page NAME for one; budgets print warnings, never fail
```

At an integration checkpoint, in a browser: `node scripts\a11y_check.js --out DIR --pages ...` and `node scripts\capture.js --out DIR --pages all`.
`python scripts\number_audit.py` lists prose numbers with no claim id and always exits 0.

After changing plates or claims, rebuild in this order, since later steps copy or count earlier ones:
`build_plates.py --export-claims`, `build_plates.py` (`--page PATH` for one page), `build_explorer.py`, `build_index.py`, `build_whats_new.py`,
`build_library_strip.py`, `pour_claim_refs.py`, `build_share_cards.py --check` (without the flag if it names a stale card), `build_briefing.py`, `add_page_meta.py`.
`tests\test_index_briefing.py` fails with the fix if the briefing or the manifest has fallen behind. After changing
the model, run `python scripts\resource_model.py --self-test`, `--export`, `--oracle`, then `python scripts\build_explorer.py`. Pushing
to `main` publishes the site through `pages.yml`, so work on a branch. Never push to `main` or enable Pages without an
explicit owner command in the session.

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
| `site/data/claims/prose-*.json` | `scripts/build_plates.py --export-claims` from local evidence files, for numbers in prose | T0 |
| `.cr` marks' status and names, "Claims Cited on This Page" | `scripts/pour_claim_refs.py` (refuses a mark its claim does not hold) | T0 |
| `site/data/plates/*.json`, plate blocks in pages | definitions by hand or generator; `scripts/build_plates.py` pours numbers from claims | T0 |
| `site/data/index.json` | `scripts/build_index.py` (manifest of plates, claims, and data files; `validate_public.py` reads it) | T0 |
| `site/briefing/index.html` rail and packet | `scripts/build_briefing.py` (copies of built plate blocks and the checklists) | T0 |
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

## Writing

Capitalize Tribe, Tribal, Indigenous, InterTribal. No em dashes in our prose. Do not credit AI tools
as authors or contributors. Legal points are questions for counsel. Use the pf-voice skill for public copy.
