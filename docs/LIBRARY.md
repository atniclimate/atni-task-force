# Library Data

The library at `site/library/` and the short lists on the home and task force pages are rendered in the browser from one file, `site/data/library.json`. This document is its schema. `scripts/validate_public.py` enforces it before every release.

Every entry is public (T0) material. A source that is not public, or whose tier is uncertain, does not go in the file (see `DATA-TIERS.md`).

## File

```json
{
  "schema": 1,
  "updated": "2026-10-29",
  "entries": [ ... ]
}
```

| Key | Type | Rule |
|---|---|---|
| `schema` | number | `1`. Change it only with a matching change to the validator and `site/assets/js/library.js`. |
| `updated` | string | The date of the latest change to the file, `YYYY-MM-DD`. No entry's `added` may be later. |
| `entries` | array | One object per resource, in any order. The site sorts them. |

## Entry

All twelve fields below are required. The only other field allowed is the optional `link_status` (`ok` or `unverified`), which `scripts/merge_library.py` writes after checking a link; `unverified` means the publisher's server blocked the automated check, so a person should open the link before the entry is relied on.

| Field | Type | Rule |
|---|---|---|
| `id` | string | Unique kebab-case slug, for example `atni-res-2024-23-offshore-wind-task-force`. Never reuse or change a published id. |
| `title` | string | The source's own title. For ATNI resolutions: `Resolution #YYYY-NN: Title in Title Case`. |
| `url` | string | An `https://` address, or a path relative to `site/` for a file the site hosts (for example `library/resolutions/atni-res-2026-039-ai-task-force.pdf`). Local PDFs live under `site/library/`. Plain `http://`, email links, Google Docs or Drive links, and anything in `planning-T1/` are rejected. |
| `publisher` | string | The organization that issued the source. |
| `date` | string | `YYYY` or `YYYY-MM-DD`. ATNI resolutions use the closing day of the convention that adopted them. Websites and repositories use the latest update observed when the entry was added, or the year when no update date is shown. The site displays dates as MM/DD/YYYY. |
| `type` | string | One of `resolution`, `report`, `policy` (policies, standards, and governance frameworks), `legislation`, `article`, `academic`, `dataset`, `tool`, `website`, `news`. |
| `areas` | array of strings | One or more of `energy-feasibility`, `data-centers`, `ai`, `summit`, `cross-cutting`, without repeats. Each task force page lists the entries tagged with its area. |
| `tribal_specific` | boolean | `true` when the source is by, for, or specifically about Tribal Nations or Indigenous Peoples. Drives the "Tribal focus" filter. |
| `summary` | string | One to three sentences on what the source says or does, in the house style. Describe; do not argue. A summary is not an ATNI position unless the source is an ATNI resolution. |
| `tier` | string | Always `T0`. |
| `added` | string | The date the entry joined the library, `YYYY-MM-DD`. The home page shows the most recently added entries. |
| `featured` | boolean | Marks a core source. Among entries added on the same day, featured entries are listed first on the home page. |

## How the Site Uses the File

- **Library page:** newest first by `date`; search covers title, publisher, summary, type, and areas; filters for area, type, Tribal focus, and year; 40 entries at a time with a "Show more" button. Filter choices are written to the address bar (for example `library/?area=ai`), so a filtered view can be linked.
- **Task force pages:** up to six entries for the page's area, newest first.
- **Home page:** up to four of the most recently added entries that the page does not already link to.
- **Without JavaScript:** each page keeps a plain link to the library, and the library page links to the raw `data/library.json`.

## Adding an Entry

1. Confirm the source is public (T0) and that a stable public address exists. Host a file in `site/library/` only when ATNI holds it and may publish it, such as an adopted resolution.
2. Give PDFs a clean kebab-case name, for example `atni-res-2026-051-youth-ai-chatbots-in-schools.pdf`. Check that the PDF holds no private file paths or personal contact details.
3. Add the entry, set `added` to today, and set `updated` to today.
4. Run `python scripts/validate_public.py`.
