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
python scripts\validate_public.py      # public boundary, schemas, links, house style
python scripts\check_t1_leak.py        # verbatim T1 text in site/ (local only); exit 1 blocks, 3 = review
                                        # derived-doc overlaps (--all lists them; record reviews in planning-T1\leak-allowlist.txt)
python -m pytest -q tests              # energy-potential and helper tests
```

Never push or enable Pages without an explicit owner command in the session.

## Data products

| Output | Built by | Tier |
|---|---|---|
| `site/data/library.json` | `scripts/merge_library.py` (dedupe + link check) | T0 |
| `site/data/energy-potential.json` | `scripts/energy_potential.py` (plan-assessor public plans, Jev judgments, code ranking) | T0 (owner declared) |
| `site/data/energy-funding.json` | `scripts/energy_funding.py` (program catalog, Grants.gov live layer) | T0; heat section T1 until released |
| `site/data/policy-watch.json` | policy searches aligned to Policy Sentinel sources | T0 |

Upstream repositories (plan-assessor, TCR Policy Scanner, Policy Sentinel) are read-only from here;
each has its own owner and active writer.

## Writing

Capitalize Tribe, Tribal, Indigenous, InterTribal. No em dashes in our prose. Do not credit AI tools
as authors or contributors. Legal points are questions for counsel. Use the pf-voice skill for public copy.
