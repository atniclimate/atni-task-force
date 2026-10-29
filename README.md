# ATNI Energy Task Forces

Public library and coordination site for the Energy Task Forces of the Affiliated Tribes of Northwest Indians (ATNI). It serves Tribal leaders, Tribal staff, and partners working on three task forces and one gathering:

- **Tribal Energy Feasibility:** builds on the ATNI Offshore Wind Task Force (Resolution #2024-23) and the call for Tribal leadership in grid governance and transmission planning (Resolution #2024-35).
- **Data Centers:** called for in Resolution #25-41, "For the Development of an ATNI Task Force on Data Centers," as cited in Resolution #2026-034. Its adopted text is not yet in hand.
- **Artificial Intelligence:** established by Resolution #2026-039 under the ATNI Energy Committee, with Resolutions #2026-051 (youth and AI in schools) and #2026-034 (the Tiered Sovereign Data Framework).
- **Tribal Energy Summit and Working Group:** a two-day working session proposed for March 2027; dates and venue to be confirmed.

The site is meant to be published at <https://atniclimate.github.io/atni-task-force/>. Every page is in place, most content slots are filled from public drafts, and "In development" blocks remain where content waits on a confirmation (see `docs/CONTENT-SLOTS.md`).

## Structure

| Path | Contents |
|---|---|
| `site/` | The published website: plain HTML, CSS, and JavaScript with no build step and no outside services. One folder per page, each with its own `index.html`. |
| `site/energy/potential/` | What Tribal plans say about energy: method and caveats, a chart across the Tribes, and a searchable list of each Tribe's ranked energy types with quoted source text. Reads `site/data/energy-potential.json`. |
| `site/energy/funding/` | Tribal energy funding: upcoming deadlines, the program catalog, the Grants.gov live layer, and programs matched to each Tribe. Reads `site/data/energy-funding.json`. |
| `site/ai/economics/` | The brief "AI as an Economic Force: Benefits and Risks for Tribal Nations." |
| `site/data/` | The open data files the pages read (table below). |
| `site/library/resolutions/` | Adopted ATNI resolutions hosted as PDFs. |
| `site/assets/` | Stylesheets, scripts, and self-hosted fonts with their licenses. `assets/css/tokens.css` is copied unchanged from the ATNI Climate Design System (`dist/css/tokens.css`). |
| `docs/` | Schemas and methods: `LIBRARY.md`, `CONTENT-SLOTS.md`, `ENERGY-POTENTIAL.md`, `ENERGY-FUNDING.md`, `POLICY-WATCH.md`. |
| `scripts/` | The build and check scripts (table below). |
| `tests/` | Tests for the energy potential pipeline and its helpers. |
| `.github/workflows/pages.yml` | The single publisher: checks `site/`, then deploys it to GitHub Pages. |
| `DATA-TIERS.md` | The project's data tiers under the Tiered Sovereign Data Framework. |

## Scripts and Data Products

Run every script from the repository root. Each one documents its own options at the top of the file.

| Script | What it does | Writes | Tier |
|---|---|---|---|
| `scripts/merge_library.py` | Merges public library candidates, deduplicates by link, and checks every new link. | `site/data/library.json` (schema in `docs/LIBRARY.md`) | T0 |
| `scripts/energy_potential.py` | Reads ATNI-listed Tribes' public planning documents from the plan-assessor library (read-only), asks Jev typed questions about each passage, ranks energy types in code, and verifies each claim. Steps: `build`, `probe`, `run`, `verify`, `check`, `sample`. | `site/data/energy-potential.json` and `.csv`; working files in `work/energy-potential/` | T0 (owner declared) |
| `scripts/grants_gov_live.py` | Searches Grants.gov for posted and forecasted notices open to Tribal governments, tagged by energy type and cooling use. | `work/energy-funding/grants-gov-live.json` (local) | T0 content |
| `scripts/energy_funding.py` | Joins the program catalog, the live layer, and the energy potential file. Method in `docs/ENERGY-FUNDING.md`. | `site/data/energy-funding.json`; a T1 section stays in `planning-T1/` until the owner releases it | T0 public file |
| `scripts/policy_watch.py` | Builds the official and Policy Sentinel links for the saved searches, runs the live checks, and writes the importable follow lists. Method in `docs/POLICY-WATCH.md`. | `site/data/policy-watch.json` and `site/data/policy-sentinel/follow-*.json` | T0 |
| `scripts/jev_release_screen.py` | Screens cleaned T1 notes section by section and queues a release recommendation; the owner makes every release decision. Needs owner direction and a logged entry before any T1 text is sent. | Files in `planning-T1/` only | T1 |
| `scripts/check_t1_leak.py` | Compares the visible text of `site/` with T1 working files and reports any verbatim overlap. Runs only on the owner's machine. | Nothing | Check |
| `scripts/validate_public.py` | The release-boundary check for `site/` (below). | Nothing | Check |

## Preview

From the repository root in PowerShell 7, serve only `site/` on the local machine:

```powershell
python -m http.server 8771 --bind 127.0.0.1 --directory site
```

Then open <http://127.0.0.1:8771/>. Opening `index.html` directly as a file will not load the data pages, because browsers block `fetch` from `file:` pages. Stop the server with Ctrl+C.

## Check Before Release

From the repository root, run the three checks:

```powershell
python scripts\validate_public.py      # public boundary, schemas, links, house style; must pass
python scripts\check_t1_leak.py        # verbatim T1 text in site/; exit 0 clean, 1 blocks, 3 lists overlaps to review
python -m pytest -q tests              # energy potential and helper tests
```

`validate_public.py` needs Python 3.9 or later and PyMuPDF (`python -m pip install pymupdf`). It exits non-zero and lists every problem when it finds: a file type that does not belong in `site/`; a local file path, credential-like string, link to `planning-T1`, Google Docs, or Google Drive, email link, or `@atnitribes.org` address anywhere in `site/` (PDFs included); an em dash in published prose; an external script, stylesheet, or font; a broken local link or anchor; a library entry that breaks the schema or is not T0; an empty or unreadable PDF; a content slot that is unbalanced or missing from `docs/CONTENT-SLOTS.md`; or a data file that fails its light checks: `energy-potential.json` (T0, known types and stages, https citation links that end in `#page=N`), `energy-funding.json` (T0, no heat screen named in any key or string, dated status checks, https links), and `policy-watch.json` with the Policy Sentinel follow files (required fields, https links).

`check_t1_leak.py` reads `planning-T1/`, which exists only on the owner's machine, so it cannot run in CI. Exit 1 means original T1 text reached the site: remove it. Exit 3 lists overlaps with derived T1 documents for a person to review.

## Publication Boundary

GitHub Pages serves **only `site/`**. The Pages workflow runs the check above and uploads `site/` and nothing else; it runs for changes to `site/`, the check, the slot list, or the workflow itself on `main`. Pages use relative links so they work under the `/atni-task-force/` project path.

`planning-T1/`, `files-unsorted/`, and `work/` hold T1 (Community Network) material and local working files. They are excluded by `.gitignore`, never copied into `site/`, and never linked from it. T1 material moves to T0 only by an explicit release decision. See [DATA-TIERS.md](DATA-TIERS.md).

The site loads no analytics, trackers, outside scripts, or outside fonts, and it sets no cookies. Its one use of browser storage is to remember a reader's light or dark theme on that device. Contact routes through <https://atnitribes.org>; the site lists no personal email addresses.

## License

The content license is to be decided by ATNI. The fonts in `site/assets/fonts/` are under the SIL Open Font License 1.1; their license texts travel with them.
