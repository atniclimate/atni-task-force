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
| `areas` | array of strings | One or more of `energy-feasibility`, `data-centers`, `ai`, `summit`, `cross-cutting`, without repeats, main area first: the library page inks an entry's square by its first area. Each task force page lists the entries tagged with its area. |
| `tribal_specific` | boolean | `true` when the source is by, for, or specifically about Tribal Nations or Indigenous Peoples. Drives the "Tribal focus" filter. |
| `summary` | string | One to three sentences on what the source says or does, in the house style. Describe; do not argue. A summary is not an ATNI position unless the source is an ATNI resolution. |
| `tier` | string | Always `T0`. |
| `added` | string | The date the entry joined the library, `YYYY-MM-DD`. The home page shows the most recently added entries. |
| `featured` | boolean | Marks a core source. The library page's "Start here" row lists the featured entries, resolutions first. Among entries added on the same day, featured entries are listed first on the home page. |

## How the Site Uses the File

- **Library page:** newest first by `date`; search covers title, publisher, summary, type, and areas; filters for area, type, Tribal focus, and year; 40 entries at a time with a "Show more" button. Filter choices are written to the address bar (for example `library/?area=ai`), so a filtered view can be linked. Around the filters, `scripts/build_library_strip.py` writes the composition strip from this file: above them one square per entry, inked by its first area, and below them a bar for "Start here" and for each area, type, recent year, and Tribal focus. "Start here" is the Area filter's first choice (`library/?area=start-here`); its list prints on the unfiltered page. Each bar and each chip on an entry sets a filter.
- **Task force pages:** up to six entries for the page's area, newest first.
- **Home page:** up to four of the most recently added entries that the page does not already link to, and What's New (below).
- **Without JavaScript:** each page keeps a plain link to the library, and the library page keeps its counts and the composition strip and links to the raw `data/library.json`.

## Adding an Entry

1. Confirm the source is public (T0) and that a stable public address exists. Host a file in `site/library/` only when ATNI holds it and may publish it, such as an adopted resolution.
2. Give PDFs a clean kebab-case name, for example `atni-res-2026-051-youth-ai-chatbots-in-schools.pdf`. Check that the PDF holds no private file paths or personal contact details.
3. Add the entry, set `added` to today, and set `updated` to today.
4. Run `python scripts/build_library_strip.py`, `python scripts/build_whats_new.py`, `python scripts/site_count_claims.py`, `python scripts/build_explorer.py`, `python scripts/pour_claim_refs.py --page site/library/index.html --page site/index.html`, then `python scripts/validate_public.py`. Each count on the Library page and in home's figures carries a claim id (`lc-`), and validation fails a figure its claim does not hold.

`scripts/merge_library.py` does steps 3 and 4's strip for a candidate file and link-checks every new address. The other commands in step 4 still follow it.

## Adding Through the Intake Sheet

Named managers add rows to an Intake sheet, kept as T1 working space. The site never reads the sheet. Its tabs are Library, News, and Claims, with one rule over them: public sources only; no fact about a specific Nation, project, place, or negotiation; summaries in your own words.

1. `python scripts/intake_pull.py --csv FILE` snapshots the rows in the T1 workspace and screens each one: the validator's forbidden strings, a local name screen, dedupe against this file, the link check, and for Claims a fetch of the source to see whether the quote appears. It writes candidates and a report there. The screens can flag and cannot clear, and it sends nothing to an outside service except fetches of the addresses the rows list.
2. The owner reads the report and marks each row accepted or declined on the sheet, then pulls again. A mark counts only if the last report showed the row's exact text.
3. On a branch, `python scripts/merge_library.py FILE --added YYYY-MM-DD --require-cleared` lands the Library rows. A row with no decision stops the whole batch, because the merge stamps tier T0 and that mark is the human check behind the stamp. `python scripts/build_whats_new.py --news FILE` lands the News rows under the same rule.
4. Claims rows do not land. They stay unverified in the T1 workspace, since the validator refuses an unverified claim in `site/`; a person moves a claim to the evidence record.
5. The owner logs the batch in the release log and gives the push command.

## What's New

`site/data/whats-new.json` (`tier` T0, `schema` 1) has one writer, `scripts/build_whats_new.py`, which also pours the rows into `site/index.html` and `site/library/index.html`, so they read without scripts and in print. Run it after a merge, a Policy Watch refresh, or a plate build. `--check` writes nothing and exits 1 if a page does not match the file.

| Key | Holds |
|---|---|
| `generated`, `window_days` | The build date, and the 90 days the Library page shows. |
| `items` | Newest first. Each has `date`, `kind` (`news`, `policy`, `library`, `data`), `title`, `url` (https, or a path relative to `site/`), and `area`. |
| `ledger` | A hash per plate and claims file, and each followed policy item. No such file holds a build date, so a change dates a new row on the day the script sees it. |

**Sources.** Library `added` dates; `policy-watch.json`'s check date and any followed item's newest document in the window; News rows the owner cleared; and the ledger. News and data rows live only in this file, so a rebuild carries them forward. A News row's one line stays in the T1 record.

**Ranking.** Records from one publisher in one day become one row from five up, so a burst of SEC XBRL records reads as one line. A day shows its top three other sources, featured first and then by type, and one row for the rest. An entry that singles out a Nation gets no row of its own, and is counted in that last row. The home page shows six rows: at most two of a kind from one day and three of a kind in all, then the newest if that leaves room.

**Since your last visit.** The script in `site/assets/js/library.js` keeps a last-seen date in the reader's `localStorage` and prints "N new since your last visit". The date is never sent anywhere, and the line stays hidden without storage. It counts rows, not sources.
