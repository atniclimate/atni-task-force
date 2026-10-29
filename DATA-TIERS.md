# Data Tiers for the ATNI Energy Task Forces

This project classifies its material with the
[Tiered Sovereign Data Framework (TSDF)](https://github.com/atniclimate/TieredSovereignDataFramework),
which ATNI endorsed as a recognized standard for Indigenous Data Sovereignty in
Resolution #2026-034.

## Tier declaration (logged 10/29/2026)

This project holds **T0 (Open/Public)** and **T1 (Community Network)** material only, using
the tier names in Resolution #2026-034.

It holds no **T2 (Negotiated Partner)** or **T3 (Sovereign Restricted)** data and plans none.
If material that might be T2 or T3 reaches the project, it is not added. The owner is
consulted and the material is handled outside this project.

| Tier | What it covers here | Where it lives |
|---|---|---|
| T0 Open/Public | ATNI resolutions, links to public websites, published reports and datasets, and syntheses the owner has released | `site/` in this public repository |
| T1 Community Network | Planning documents, Google Docs exports, meeting planning, working drafts, and notes awaiting release decisions | `planning-T1/`, local only and excluded by `.gitignore` |

## Rules

1. Only `site/` is published. GitHub Pages uploads that folder and nothing else.
2. T1 material moves to T0 only by an explicit release decision from the owner.
   Release decisions are recorded in the T1 workspace.
3. When a tier is uncertain, the material stays T1 until the owner decides. T1 is
   the most restrictive tier this project holds.
4. Writing derived from T1 material is T1 until it is released.
5. T1 material is not used to train AI models. AI tools process T1 material only at
   the owner's direction for network work.
6. `scripts/validate_public.py` checks the public folder before release for local
   paths, credentials, links to private documents, and library entries that are not T0.
