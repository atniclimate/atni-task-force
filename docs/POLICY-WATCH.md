# Policy watch

The three Energy Task Forces of the Affiliated Tribes of Northwest Indians (ATNI), Tribal Energy Feasibility, Data Centers and Artificial Intelligence, each follow federal and state policy that bears on Tribal self-determination. This page documents the policy watch behind the site: 39 searches, 13 for each Task Force, written for [Policy Sentinel](https://atniclimate.github.io/policy-sentinel/), the policy search tool that ATNI Climate builds for Tribal governments. A visitor opens a search with a real query already in it, checked against the official source, instead of facing an empty box.

Everything in the watch is T0 under [DATA-TIERS.md](../DATA-TIERS.md): public search terms, public identifiers, and links to official sites. A visitor's own followed list stays in that visitor's browser.

## What is in it

| File | Holds |
|---|---|
| `site/data/policy-watch.json` | Per Task Force, a `searches` list and a `follow` list. The Policy Sentinel source list and its status sit under `policy_sentinel`. |
| `site/data/policy-sentinel/follow-energy-feasibility.json`, `follow-data-centers.json`, `follow-ai.json` | A followed list a visitor can download and import into Policy Sentinel (7, 5 and 3 items). |
| `scripts/policy_watch.py` | Builds the links, runs the live checks, writes the follow files. Standard library only. |

Each search is written by hand with an `id`, `title`, `why` (one plain sentence), `source`, `scope` (`federal` or `state`), `query` and optional `filters` (`match`, `document_type`, `tribal_eligibility`). The script adds `official_url` (the official site's own results page for the same query), `policy_sentinel_url` (the demo address plus the proposed prefill parameters) and `checked`.

`checked.status` is `ok` (results found), `empty` (the source answered with none), `unchecked` (see below) or `error`. `checked.results` is the source's own count: the Federal Register total, the Grants.gov hit count, 1 for a Washington bill found, or the number of Unified Agenda editions that carry a Regulation Identifier Number (RIN). `checked.official_page` is the HTTP status of the official link.

Each `follow` item names a docket, RIN, document or bill with its identifier, title, link and a reason to watch it. Items marked `importable` are the Federal Register dockets and RINs that Policy Sentinel can follow; the rest are documents and bills to read.

## How the searches were chosen

The starting points were the public research compilations for each Task Force (federal and state data center policy, grid governance, offshore wind, Tribal energy programs, and artificial intelligence policy). From those, a search made the list when it passes four tests.

1. A person can run it the same way next month and see what changed.
2. It tracks an action that bears on a Task Force's resolution: Resolution 2024-23 (offshore wind), 2024-35 (grid governance), 25-41 (data centers), and 2026-039, 2026-051 and 2026-034 (artificial intelligence, youth and artificial intelligence in schools, and the Tiered Sovereign Data Framework).
3. It prefers an exact identifier (a docket, a RIN, a bill number) to a broad phrase, because an exact identifier returns a short, relevant list.
4. Each date, number, title and statement about what a text says in a `why` was read at the official source on 2026-10-29 (a Federal Register abstract, a bill's text, a Legislature file), not copied from the compilations. Where a text does not mention Tribes, the `why` says so.

What Policy Sentinel can send limits the list. It has no agency filter, so agency names appear only as words in a query. Congress.gov looks up one bill at a time. Washington is the only state it can search. ATNI and National Congress of American Indians (NCAI) resolutions are in its source catalog for discovery only and are not searchable. The draft-resolution menu in the demo needs a shared password and cannot sit behind a public link.

What the lists leave out, and why:

- The Advisory Council on Historic Preservation's Section 106 rewrite has no Federal Register document or RIN yet.
- The Federal Energy Regulatory Commission's large-load docket (RM26-4-000) is not in the Federal Register index, so it appears only in the follow list, with a link to the Commission's site.
- Oregon, Idaho, Montana and Alaska cannot be searched in Policy Sentinel. Oregon's HB 3546 appears in the follow list as a plain link.
- Grants.gov matches words loosely. A search with the Tribal eligibility filter can return National Institutes of Health programs for an energy word, so each `why` tells the reader to read the eligibility section.

## How they were checked

Run on 2026-10-29.

- **Counts.** Each keyless search was sent to the source the way Policy Sentinel's own service sends it: the Federal Register API (first page, same fields), the Grants.gov search API (`forecasted|posted`, eligibility codes 07 and 11), the Washington Legislature bill file, and the reginfo.gov Unified Agenda page. 30 of the 39 searches have a result count: 29 found results and 1 found none (Tribal-eligible solar funding, kept as a tripwire).
- **Parity.** For 12 searches, Policy Sentinel's live service returned the same total as the recorded count (12 of 12).
- **Unchecked on purpose.** GovInfo and Congress.gov searches (9 of 39) use Policy Sentinel's api.data.gov key, which is a service secret, so they carry `status: unchecked`. Their identifiers were confirmed without that key: each bill's title against its text on GovInfo, and the bill numbers were found with api.data.gov's public `DEMO_KEY`. The same text check showed which bills name Tribes.
- **Links.** All 73 distinct links in the file loaded in headless Chromium with HTTP 200: the 39 official results pages, 22 follow links, 4 Unified Agenda pages, and 8 Policy Sentinel links that cover every source and filter shape. Each Federal Register results page shows the same count as the API. Congress.gov and the Federal Energy Regulatory Commission's site open in a browser but block plain scripts, so `refresh` does not test them.
- **Import.** Each follow file was imported into the live page (release 0.10.1) and "Check for new" was pressed: 15 lookups, none unavailable, none new since the file date.
- **Release checks.** `python scripts/validate_public.py` passes, and `python scripts/check_t1_leak.py` reports no overlap from these files.

Known differences: Grants.gov's new search page (the official link) matches words more strictly than the interface Policy Sentinel calls, so it can list fewer results. The `checked.note` says so for each search where the two differ. The Federal Register stops counting at 10,000.

## How to refresh

```powershell
python scripts\policy_watch.py refresh      # live checks; rewrites the JSON and the three follow files
python scripts\policy_watch.py check        # offline: links and follow files still match the hand-written fields
python scripts\policy_watch.py --self-test
python scripts\validate_public.py
```

Refresh before each page update, monthly, and after each Policy Sentinel release. It rewrites `generated`, every `checked` block, each follow item's details and the follow files. Each follow file's `followedAt` resets to the refresh day, so a visitor who imports the file sees what is new since that day. Read the diff: a count that jumps, a status of `error`, or a follow item whose `latest` changed is the signal.

To add a search, add its hand-written fields to the JSON and run refresh; the check keeps each Task Force between 8 and 15. To follow a new docket or RIN, add a `follow` item with `kind` (`docket` or `rin`), `source` (`federal-register`), `value`, `title`, `agency`, `reason` and `importable: true`. For a document add its Federal Register number as `id`; for a bill add `id` as `s 5645 119` and its short `title`.

Congress.gov and the Federal Energy Regulatory Commission's site block scripts, so refresh does not test those links; open them in a browser. GovInfo's search page loads only in a browser.

## Integration status

- **Policy Sentinel prefill: not built.** Release 0.10.1 reads only `embed`, `theme` and a localhost `api` address, so every `policy_sentinel_url` opens the tool with an empty search. `policy_sentinel.prefill_supported` is `false`. A feature proposal for the Policy Sentinel maintainers (parameters, code points, validation, tests) is held in the T1 workspace at `planning-T1/integration/` until the owner releases it. When the feature ships, set `prefill_supported` to `true` and the same links start prefilling; only the keyless sources ask to run on load.
- **Site panels: not built.** A Task Force page reads `task_forces.<id>.searches` and shows `title`, `why`, the two links and the `checked` result and date. `follow_file` names the importable list for that Task Force.
- **Importing a list.** A visitor downloads the file, opens Policy Sentinel, and uses "Import followed list" in the Following section. Policy Sentinel keeps the list in that browser, sends nothing until the visitor presses "Check for new", and then sends one lookup per item. The file uses Policy Sentinel's own export format (version 1) and is read whole or not at all, so test it again after each Policy Sentinel release.
- **Privacy.** The site sends nothing to Policy Sentinel. A search term travels only when a visitor opens a link. Policy Sentinel's service states in its code that it keeps no search text.
- **Open items.** The prefill feature; searchable ATNI and NCAI resolutions; Oregon and Idaho in Policy Sentinel; a keyed check of GovInfo and Congress.gov; and the owner's decision whether to log this T0 release in the T1 release log.
