# Energy Funding Data

The funding layer pairs the energy types that each ATNI-listed Tribe's own public planning documents show (`site/data/energy-potential.json`) with federal programs and live Grants.gov opportunities. It also lists where cooling, heat pump and microgrid funding could apply for Tribes with higher heat exposure.

These are program facts and screening flags, not eligibility determinations or recommendations. The Tribe decides whether and how to apply. Statuses change quickly, so confirm with the agency before relying on one.

## Files

| Path | Tier | What it is |
|---|---|---|
| `work/energy-funding/program-catalog.json` | T0 content, kept local until joined | Verified program records (22 at the 2026-10-29 build). Written by hand from the sources below. |
| `work/energy-funding/grants-gov-live.json` | T0 content, kept local until joined | Posted and forecasted Grants.gov opportunities open to Tribal governments, with the queries used and the time of retrieval. |
| `work/energy-funding/tcr-programs.json` | T1 | The TCR Policy Scanner registry (18 programs, last tracked February 2026). Input to the catalog; its scanner statuses are not carried over. |
| `work/energy-funding/atni-heat-screen.json` | T1 | Heat screen for the 55 ATNI-listed Tribes. Stays T1 until the owner releases it. |
| `scripts/grants_gov_live.py` | | Builds `grants-gov-live.json`. Standard library only. |
| `scripts/energy_funding.py` | | Joins the catalog, the live layer, the heat screen and the energy potential file. Standard library only. |
| `site/data/energy-funding.json` | T0 | The public output. |
| `planning-T1/energy-funding/heat-cooling-funding.json` and `HEAT-COOLING-FUNDING.md` | T1 | The heat section, written here unless `--include-heat` is used. |
| `planning-T1/research/energy-funding-catalog.md` | T0 content kept in the T1 workspace | The catalog as a readable note, written by the join. It sits under `research/`, which `scripts/check_t1_leak.py` treats as public text, so the heat note can repeat program sentences without being reported. |

## The Public File

`site/data/energy-funding.json` holds these keys.

| Key | Contents |
|---|---|
| `schema`, `generated`, `tier` | `1`, the build date, and `T0`. |
| `source` | The energy potential file's `generated` date and SHA-256 that the join read, the date programs were checked, and the live retrieval time. |
| `caveats` | The limits that travel with the data. Show them with any display of it. |
| `vocabulary` | The 13 energy types, the 8 cooling uses, the status words, and the two applicability phrases. |
| `programs` | The catalog records. Fields: `id`, `short_name`, `name`, `agency`, `assistance_listing`, `kind`, `funds` (close to source wording), `tribal_eligibility`, `status`, `status_label` (the status with its main condition), `status_note`, `status_checked` (date and page), `deadline` (when one exists), `funding_level`, `url`, `sources`, `geography`, `energy_types`, `energy_types_possible`, `cooling_uses`. |
| `live` | `retrieved`, `source` (endpoint, request body, eligibility filter and the required Grants.gov attribution), `queries`, and `opportunities`. |
| `tribes` | One entry per Tribe in the energy potential file: `slug`, `name`, and `matches`. |
| `heat` | Present only when the file is built with `--include-heat`. |

A program's `status` is one of `open`, `closed`, `forecasted`, `terminated`, `rescinded`, `enjoined` or `unknown`; the definitions are in `vocabulary.statuses`. A program lists an energy type in `energy_types` only when a program document names it. A type that is plausible from a broader category goes in `energy_types_possible`. Each cooling use carries `applicability` (`applicable`, or `possible, confirm with agency`), a sentence naming what the program pays for, and the page that supports it.

A `matches` entry is `{energy_type, rank, stage_label, potential_status, programs, programs_possible, live}`. `programs` and `programs_possible` are program ids, open programs first. `live` is a list of opportunity numbers. Each opportunity also carries `energy_types`, `cooling_uses` and `basis`, which says whether the link is a `keyword` match in the notice or the `program` the notice belongs to.

## Method

### Program Catalog

1. The six programs in the TCR registry that name an energy or heat use were kept. The other twelve have none (see `not_in_catalog` in the catalog).
2. The research compilation (`planning-T1/research/tribal-energy-programs.md`) and the known gaps were added: the Office of Indian Energy technical assistance, the Tribal Energy Financing Program (formerly the Tribal Energy Loan Guarantee Program), Tribal HEEHR under Inflation Reduction Act section 50122, the Weatherization Assistance Program, LIHEAP, the 40101(d) Tribal grid resilience formula grants, Energy Improvements in Rural or Remote Areas, the Community Microgrid Assistance Partnership, USDA High Energy Cost Grants, USDA REAP and Community Facilities, the BIA Energy and Mineral Development Program and Tribal Electrification Program, HUD ICDBG, EPA CPRG for Tribes and Territories, and the Bonneville Power Administration Tribal grants.
3. Each program's status was read on 2026-10-29 from the agency page, the Grants.gov record or the statute, and the page and date are in `status_checked`. Sites that refuse scripted requests (USDA Rural Development, HUD, FEMA) were read in a browser. Wording in `funds` is quoted or closely paraphrased from the pages in `sources`; capitalization of Tribe, Tribal and Indigenous is normalized.
4. A cooling use or energy type is `applicable` only when a program document names it. Otherwise it is `possible, confirm with agency`.
5. Elective pay (Public Law 119-21) is described from IRS pages: Tribal governments remain eligible, and the wind and solar credits end for projects not under construction by 2026-07-04 and placed in service after 2027-12-31.

Items the research compilation marked unverified were resolved from public pages: the December 11, 2026 Tribal HEEHR deadline is in DOE Program Notice 26-3, and the Unleashing Tribal Energy Development notice (DE-FOA-0003548) is on Grants.gov, closed 2026-07-24, with selections announced 2026-10-22.

### Live Layer

`scripts/grants_gov_live.py` posts to `https://api.grants.gov/v1/api/search2` with the body policy-sentinel uses (`rows`, `keyword`, `oppStatuses` of `forecasted|posted`, `startRecordNum`, `eligibilities`). It sends `07`, Grants.gov's code for Native American Tribal governments (Federally recognized); policy-sentinel's wider Tribal filter sends `07|11`.

- Each energy type and cooling use has a keyword set (in the script). Multiword terms are sent as exact phrases.
- search2 matches loosely, often on attachments, so each hit's title and synopsis (`fetchOpportunity`) are re-read. A hit is kept when a keyword is in its title, or in its synopsis for a notice in an energy, environment, housing, community development, disaster prevention, regional development or natural resources category. Notices of catalog programs are found by assistance listing and title pattern.
- Contact names, phone numbers and email addresses are never read into the output.
- A forecast has no close date. Estimated dates are not deadlines and are not recorded as close dates.
- Each kept opportunity's address is its `simpler.grants.gov` page, fetched and checked against the title (`url_verified`).
- `considered_not_kept` (in the local file only) lists every hit that was pulled and not kept, with the reason.
- The required attribution is in `live.source.attribution`: "This product uses the Grants.gov API but is not endorsed or certified by the U.S. Department of Health and Human Services."

At the 2026-10-29 build, no posted opportunity open to Tribal governments matched an energy or cooling keyword in its title or synopsis. Three forecasted HUD notices (two ICDBG, one IHBG competitive) belong to catalog programs. Most Tribal energy money in the catalog moves by formula, rebate, loan or tax credit, which Grants.gov does not list.

### Join

`scripts/energy_funding.py` matches by energy type. For each Tribe's ranked type (in rank order) it lists the programs that name the type (`programs`), those that may fit it (`programs_possible`), and the live opportunities tagged with that type. Programs are ordered open, forecasted, closed, then by id. A type the catalog does not know stops the run. The script checks its own output against the same patterns as `scripts/validate_public.py` (local paths, credentials, private links, em dashes) and refuses to write a public file that would fail.

### Heat Section

The heat screen (measure A, the share of May to September days above each model's own 1995-2014 95th percentile; NASA NEX-GDDP-CMIP6 v2.0, 8 models; 2040-2059, SSP2-4.5) gives two groups, each labeled with its rule:

- **National screen, `high_heat` true.** Measure A is at or above the 75th percentile across the 575 Nations the scanner covers.
- **Higher heat within ATNI.** Measure A is at or above the 75th percentile of the ATNI-listed Tribes (linear interpolation, the screen's own method). It includes the national group.

The per-Tribe heat results are T1 (the TCR Policy Scanner labels per-Nation results T1). The section is written to the T1 workspace and enters `site/` only with `--include-heat`, after an owner release decision recorded in the T1 release log.

The section states the options for each of the eight cooling uses once (`funding_options`): the programs that could pay for the use, applicable first, then possible, with what each pays for, its status, and its page. Each Tribe in either group then carries a `funding` list naming, per use, the program ids that apply to it and those that only may, plus its own ranked microgrid, storage, efficiency, electrification and solar types when the energy potential file is available. `live_opportunities` lists the Grants.gov notices that serve a cooling use; a use that a notice's program only may cover is marked possible. Measure A is relative: local extremes becoming more frequent. It is not a danger index. The scanner's numbers are not yet scientifically validated.

## Rerun

From the repository root in PowerShell 7:

```powershell
python scripts\grants_gov_live.py          # about 4 minutes; rewrites work\energy-funding\grants-gov-live.json
python scripts\energy_funding.py           # joins; writes site\data\energy-funding.json and the T1 heat files
python scripts\energy_funding.py --heat-only   # T1 heat files only; needs no energy potential file
python scripts\energy_funding.py --self-test   # offline checks
python scripts\validate_public.py
```

The catalog is edited by hand. To refresh it, reread each program's page, update `status`, `status_note`, `status_checked`, `deadline` and `funding_level`, and keep `cooling_uses` tied to the page that supports each use. Rerun the live layer first when statuses move, because the join reads both.

## Releasing the Heat Section

The heat screen is T1 until the owner releases it. After a release decision is recorded in `planning-T1/RELEASE-LOG.md`:

```powershell
python scripts\energy_funding.py --include-heat
python scripts\validate_public.py
python scripts\check_t1_leak.py
```

With `--include-heat` the heat section goes into `site/data/energy-funding.json` and the T1 heat files are not written. Without it, `check_t1_leak.py` reported 0 overlaps on 2026-10-29 and `validate_public.py` passed with the new file in `site/data/`.

## Limits

- The catalog covers 22 federal programs plus the Bonneville Power Administration grant. It omits the Energy Efficiency and Conservation Block Grant (no current official page was located), BIA Tribal Energy Development Capacity grants (capacity, not technology), and state, utility and philanthropic programs. Check the Tribe's state energy office and electric utility.
- Statuses are as of 2026-10-29 and age quickly. Several programs are formula, rebate, loan or tax mechanisms with no open window; `open` there means the program is operating, not that money is waiting.
- A program's presence for an energy type is a program fact. It does not mean the Tribe is eligible, would be competitive, or should apply. Funding levels and deadlines are the agency's statements, not awards.
- FEMA's Hazard Mitigation Assistance Guide could not be downloaded by script. Its wording on microgrids and secondary power is carried from the TCR registry and marked in `sources_note`.
- Some assistance listing numbers are not shown on the pages checked (marked in `assistance_listing_note`). LIHEAP's 93.568 and Community Facilities' 10.766 should be confirmed on SAM.gov.
- The ranked energy types are a machine-assisted reading of public planning documents and may be incomplete or out of date. Each Tribe is the authority on its own plans.
- Heat measure A does not account for housing, air conditioning access, health or other local conditions. Being below the group threshold does not mean heat is not rising for a Tribe.
- The live layer is thin. Grants.gov lists few Tribal energy notices, and search2 only finds terms it has indexed. The absence of a notice is not evidence that funding does not exist; it may sit in a formula, a state program or a notice not yet posted.
