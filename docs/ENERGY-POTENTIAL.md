# Energy potential in Tribal planning documents: method

This note explains how `site/data/energy-potential.json` and `site/data/energy-potential.csv` are made. For each
Tribe listed by ATNI, they name up to five energy types that the Tribe's own public planning documents show real
potential for: something built, planned or funded, assessed, or stated as a goal. Every claim cites the document,
year, page, public link and a short verbatim excerpt.

The result is a machine-assisted reading of public plans. It is not the Tribe's own assessment and it endorses no
project. Each Tribe is the authority on its plans, and a Tribe can ask ATNI to correct or remove its entry.

The pipeline is `scripts/energy_potential.py`. Tests are in `tests/test_energy_potential.py`. Working files are in
`work/energy-potential/` (local only, ignored by Git). The run described here is dated 2026-10-29.

## Inputs (read, never changed)

All inputs come from the plan-assessor document library. Its root is given with `--plan-assessor` or the
`PLAN_ASSESSOR_ROOT` environment variable.

| Input | Used for |
|---|---|
| Nation registry `tribes-v1.json` | The 55 ATNI-listed Tribes (`atni_member`), their legal names, slugs, states and library ids. A listing means the Tribe appears on a captured ATNI directory page; it is not a membership certification. |
| Library crosswalk `library-tribe-crosswalk-v1.json` | Four listed Tribes outside the federal register list. They are included only when they hold documents: the Duwamish Tribe holds one. The Chinook, Snohomish and Steilacoom Tribes hold none. The ATNI directory name is also used as an "also known as" name. |
| Corpus ledger 007 | Documents the national discovery attributes to each Tribe. These are attributions ("lead government; placement pending"), not verdicts. |
| Library campaign inventory | Per document: the `local_only` mark, eligibility, public links, and three Jev answers about the document's first pages. |
| Extraction run `library-campaign-20261025-001` | Page text where the latest extraction attempt ended "extracted". Its record `state.json` also carries `local_only` marks added during extraction. |

A Tribe's documents are the ledger documents for its slug united with the inventory rows in its library partitions,
deduplicated by SHA-256.

## Which documents are read

These rules are enforced in code. Assertions run before any request, and a send guard re-checks every passage's
document just before it is sent.

| Rule | Documents |
|---|---|
| Attributed to the 56 Tribes (unique documents) | 382 |
| Excluded: marked `local_only` in the inventory | 46 |
| Excluded: marked `local_only` by the extraction campaign (not marked in the inventory) | 2 |
| Excluded: not eligible (not a PDF) | 5 |
| Excluded: inventory Jev says not prepared by or for the attributed government (below 0.7) | 10 |
| Excluded: inventory Jev says not a plan or planning assessment (below 0.5) | 7 |
| Excluded: text available but no inventory Jev screen yet | 11 |
| Pending extraction: passed every screen that can run now but has no readable text yet (21 also lack Jev screens) | 22 |
| Examined | 279 |

Some rules excluded nothing here but are still enforced:
- The Gila River Indian Community Hazard Mitigation Plan (SHA-256 `9bdb01e4…91d7`, owner-excluded for an FOUO marking) can never be read or sent. The code also refuses any document tied to an Arizona Tribe.
- A document with no public link is excluded. Links come from the acquisition's final or source URL, a candidate URL, or a Wayback copy. The publisher's own address is preferred.

Text comes from the campaign's extraction when the latest attempt ended "extracted". Otherwise it comes from the
PDF's own text layer (PyMuPDF). No OCR was run. A document counts as readable when at least half its pages hold 100
or more characters. A document that is not readable is counted as pending and is not analyzed. When this was
built, the campaign had extracted 1,099 of 1,676 library records.

The inventory's Jev answers were made as triage tags. The owner directed that they be used here as exclusions, so
a few documents may be wrongly kept or left out.

## Energy types

The search uses case-insensitive, whole-word patterns, refined against real text. A unit test pins the true and
false positives.

| Type | Category | The search looks for | It deliberately skips |
|---|---|---|---|
| Solar energy | generation | solar energy, power, panels, arrays, PV, photovoltaic, community or rooftop solar, agrivoltaics, floating solar | "solar radiation" and other climate wording |
| Wind energy | generation | wind energy, power, turbines, farms, resources, generation, projects; small wind; "wind and solar" | bare "wind" (storms, wind speeds); offshore wind |
| Offshore wind energy | generation | offshore wind, floating wind | |
| Hydropower | generation | hydropower, hydroelectric, micro-hydro, small hydro, run-of-river, in-conduit hydro | |
| Marine energy (tidal or wave) | generation | tidal or wave energy and power, wave energy devices, marine energy, hydrokinetic | "wave energy" reaching a shore; "heat wave" |
| Geothermal energy | generation | geothermal, ground-source heat pumps, geoexchange | |
| Biomass energy | generation | woody or forest biomass, biomass energy, boilers or plants, wood energy, wood pellets, biochar, combined heat and power, cogeneration | bare "CHP"; ecological biomass (fish biomass) |
| Biogas and biofuels | generation | biogas, anaerobic digestion, landfill gas, renewable natural gas, biodiesel, biofuel | |
| Hydrogen and fuel cells | generation | hydrogen, fuel cells | hydrogen sulfide, hydrogen ions and similar chemistry |
| Battery and energy storage | enabling | battery storage, energy storage, BESS (capitals only), pumped storage | the name "Bess" |
| Microgrids | enabling | microgrid, micro-grid | |
| Energy efficiency and weatherization | enabling | energy efficiency, weatherization, energy audits, energy conservation | |
| Electrification (heat pumps and electric vehicles) | enabling | air-source heat pumps, building or vehicle electrification, electric vehicles, EV charging, charging stations, electric buses | ground-source heat pumps (counted as geothermal) |

Fossil fuel backup (diesel generators, propane, natural gas) and transmission are not ranked.

## Passages

Contents pages are skipped, along with contents lines that end in dot leaders and a page number. On every other
page, each match grows to whole paragraphs, about 600 to 1,500 characters, cut at sentence or line edges.
Overlapping passages are merged (up to 1,800 characters). One passage can carry several types.

The caps are applied per Tribe:
- **Per type:** up to 6 passages. Energy plans come first, then denser matches, then newer documents. No more than 3 come from one document while others remain.
- **Per Tribe:** at most 45 passages, taken in rounds across the types.

The run read 927 passages. Four Tribes reached the 45-passage cap: Confederated Tribes of the Umatilla Indian
Reservation, Lummi, Makah and Quinault.

## Jev questions (verbatim)

The model is TypeSafe System One "Jev", pinned to `jev-1.14.0`; every response reported that version. Each
passage is one request. The state is:

```json
{"tribe": "<legal name>", "tribe_also_known_as": ["<ATNI directory name, when different>"],
 "document": {"title": "...", "year": 2021, "tribes_covered": ["<only for a plan shared by several Tribes>"]},
 "page": 12, "passage": "<verbatim page text>"}
```

For each energy type in the passage, three questions are asked. `{q}` is the type's wording, for example "solar
energy" or "geothermal energy (including ground-source heat pumps)". `{tribe}` is the legal name.

- **own (Noul):** "Does `passage` describe {q} that {tribe} owns, operates, studies, develops or proposes to develop?"
  - true: "{tribe}, its utility, enterprises or departments own, operate, study or plan the {q}."
  - false: "The {q} belongs to another utility, agency or company, or is discussed in general or as regional background (for example federal dams or BPA power supply)."
- **stage (Score):** "What is the most advanced step for {q} by {tribe} that `passage` reports?" It has five levels, numbered 0 to 4:
  0. "The passage mentions {q} only as background or in passing"
  1. "The passage states that {tribe} is interested in, has a goal for, or is advised to pursue {q}"
  2. "The passage reports a resource assessment or feasibility study of {q} for {tribe} that is under way or completed, or names a specific site identified for it"
  3. "The passage describes a planned, designed or funded {q} project of {tribe}"
  4. "The passage describes {q} that {tribe} has installed or operates"
- **rejected (Noul):** "Does `passage` say that {q} was found unsuitable, infeasible or rejected for {tribe}?"
  - true: "The passage reports that {q} was ruled out for {tribe}, for example found not feasible, not cost-effective, or unsuitable for its lands or buildings."
  - false: "The passage presents {q} as possible, planned or in use, or does not judge whether it suits {tribe}."

### What the probe changed

The probe used 32 passages and 6 verification claims, in 84 requests. They included dam-impact text, a windstorm
passage asked about wind, an operating solar array, rejected options, acronym lists, generic action lists and
multi-Tribe plans. Every answer was read individually. Variants were sent side by side over the same state, and
each change was checked on passages not used for tuning.

1. **The stage question names the Tribe** (spec draft: no Tribe). A generic wording rated another Tribe's EV program "planned" at 0.98 inside a Burns Paiute plan, and rated Tacoma's dam "operating".
2. **Level 2 means a study that is under way or completed, or a named site.** The draft level ("reports a resource assessment, feasibility study or identified site") scored a merely recommended wind study as level 2 at 0.75. The final wording scores it level 1 at 0.86, while an ongoing geothermal study, an ongoing biomass study and a named McKay Reservoir site stay at level 2.
3. **Levels 1 to 4 name the Tribe.** This keeps the stage about the Tribe's own work. For example, a Coeur d'Alene passage reporting an efficiency study was rated "installed" (0.55) without the Tribe in the levels and "assessed" (0.60) with it.
4. **`tribes_covered` is added for documents the library ties to several Tribes** (3 documents). In one shared plan, Shoshone-Paiute's school solar-and-storage measure had been credited to the Burns Paiute Tribe at 0.97. With the field the score was 0.27, and every correct case was unchanged.
5. **Changes tried and dropped:**
   - removing the BPA example from the own criteria (no effect, within 0.07);
   - adding the document's attributed government for single-Tribe documents (no effect).

## Decision table (in code, `decide()`)

| Step | Rule |
|---|---|
| Admissible passage | own ≥ 0.7. Own between 0.3 and 0.7 is ignored for ranking and counted in diagnostics (311 of 1,510 readings). |
| best_stage | The highest stage among admissible passages. |
| n_docs | The number of distinct documents with an admissible passage. |
| rejected | An admissible passage has rejected ≥ 0.7. |
| Drop the type | best_stage < 0.5, or rejected and best_stage < 3. |
| score | best_stage + 0.25 × min(n_docs − 1, 3) |
| Rank | score, then n_docs, then the newest evidence year. Keep 5, or fewer when the evidence is thinner (the entry's note says so). |
| Stage label | ≥ 3.5 Installed or operating; ≥ 2.5 Planned or funded; ≥ 1.5 Assessed or sited; ≥ 0.5 Goal or interest |

**Score reading.** Each passage's stage is read as the most probable level, not the expected value. Two findings
settled this:
- Of 658 admissible readings, 141 (21%) were two-peaked: a second level at 0.2 or more, two or more levels away from the first.
- In 151 readings, the expected value gives a different stage label than the most probable level, often one that neither peak supports. For example, 0.64 on "assessed" and 0.32 on "installed" gives E = 2.63, which reads as "planned".

Reading the expected value instead would have changed the top-five list of 22 Tribes. Ties go to the lower level.

## Citations

For each ranked type, the best one to three admissible passages from distinct documents are cited. A passage ranks
higher with a higher stage, then a higher own value, then a newer document. Each excerpt is a verbatim cut of at
most 280 characters from that page's text, around a match of the type, preferring words that show the stage
reached. Excerpts containing an email address or phone number are skipped. Code asserts that each excerpt is a
substring of its page text, and `check` asserts it again.

Links point to the publisher's address where the library recorded one, otherwise a Wayback copy, and end in
`#page=N`. Years come from the title (a range such as 2016-2026 counts as its first year), then the file name, then
the PDF's creation date.

## Verification

A second Jev request is made per ranked claim, with this state:

```json
{"tribe": "...", "energy_type": "...", "claimed_stage": "...",
 "excerpts": [{"document": "...", "year": 2021, "page": 12, "text": "..."}]}
```

- **Question:** "Do `excerpts` show that {tribe} has reached the claimed stage for {q}?"
- **true:** "An excerpt shows {claim}."
- **false:** "The excerpts show only an earlier step than `claimed_stage`, a project of another utility, agency or company, or general background about {q}."

`{claim}` spells out the stage, and later steps also count. For "Installed or operating" it reads "{q} that
{tribe} or its utility, enterprises or departments have installed or operate".

The same request also asks "Does `excerpt` show {claim}?" once per excerpt. Those answers only order the citations
and drop excerpts below 0.3; the best excerpt always stays.

| Result | Rule | Count |
|---|---|---|
| verified | ≥ 0.7 | 134 |
| needs_review | 0.3 to 0.7 | 22 |
| dropped | below 0.3 at every stage | 2 |
| withheld by a person (spot-check) | listed in `WITHHELD` | 1 |

Two choices differ from the first draft, and both are recorded here:
1. **Document context.** Excerpts carry their document title, year and page. Without the source, "The Housing Authority installed 16 ground source heat pumps" scored 0.11 for CSKT. With it, the score was 0.98. Wrong claims did not rise.
2. **Step-down instead of a plain drop.** A claim scoring below 0.3 is dropped and logged, then re-checked one stage lower with the same excerpts. Most failures were stage inflation, for example an action list "Install solar panels..." read as installed, while the plan does show a planned project.

Results: 31 checks fell below 0.3, 20 claims survived at a lower stage, and 2 found no stage. The claims that
survived were re-ranked by their verified stage. In total, 159 claims were checked (ranks 1 to 7 per Tribe, so a
dropped claim can be replaced), and 139 types were published: 120 verified and 19 needing review.

**Spot-check.** 15 published claims were drawn by a stable seeded hash (`sample --n 15 --seed 20261029`) and read
by hand against their cited pages. Fourteen agreed with the claimed stage. One did not. The Shoshone-Paiute Tribes'
"electrification, planned" cited an EV charging measure whose implementing agency is the Shoshone-Bannock Tribes,
in a plan four Tribes share. That claim is withheld through the `WITHHELD` list in the script, with the reason
logged in `verify.json`. An earlier 15-claim sample, on a previous build, also agreed on 14. Its disagreement was
Snoqualmie solar "planned", where the plan says a program "may pay for" solar panels; that claim stays published
as needs review. That sample also found a contents-page citation, which led to the contents-page filter. The
judgments are in `work/energy-potential/spot-check.json`.

## Results of this run

- 56 Tribes. 44 have at least one type and 15 have five. 12 have none:
  - 11 had documents read, but no passage showed energy work the Tribe owns, studies or plans. Crow and Squaxin Island also have documents awaiting extraction.
  - Summit Lake Paiute has no documents in the library.
- Stages published: 29 installed or operating, 65 planned or funded, 19 assessed or sited, 26 goal or interest.
- Jev requests: 1,733 in total, with 0 failures and about 2.0 million input tokens.
  - 84 probe requests.
  - 1,100 passage requests: the 927 final passages, plus re-sends after the year and shared-plan fixes.
  - 549 verification requests, across four rounds while the verification design changed.
- The hard cap is 4,000 requests.

## Rerun after the extraction campaign finishes

Answers are cached by the SHA-256 of the exact request. A rerun sends only passages and claims whose request
changed. Requests and responses are logged in `jev-requests.log` and `jev-cache/`, and a failed call stops the
step with an error. It is never read as a "no".

```powershell
# PowerShell, from the repository root; TYPESAFE_API_KEY must be set
$env:PLAN_ASSESSOR_ROOT = "<plan-assessor root>"
python scripts\energy_potential.py build    # screens documents and writes corpus.json and passages.jsonl; prints the planned volume
python scripts\energy_potential.py run      # sends uncached passages, then writes aggregates.json
python scripts\energy_potential.py verify   # verifies claims, then writes the two site/data files and run-receipt.json
python scripts\energy_potential.py check    # validates the public files against the work files
python -m pytest tests\test_energy_potential.py -q
python scripts\energy_potential.py sample --n 15   # prints a stable sample for a person to check
```

Once the campaign has extracted the pending documents (22 here), `build` will read them, and their passages will be
new requests. If the library's inventory gains Jev screens for the 11 documents excluded for a missing screen, they
will be read too. After a rerun, repeat the spot-check, update `spot-check.json`, and review the `WITHHELD` list.

## Known limits

- **The library limits what can be found.** It holds what the national discovery found and could download. A Tribe's newest or most relevant plans may be missing, and 22 documents still await text extraction.
- **Attribution can be wrong.** It comes from the library. Plans shared by several Tribes can credit one Tribe with another's measure. `tribes_covered` reduces this, but a passage cut below the heading that names the implementing Tribe can still mislead, as the withheld claim shows.
- **Old documents are read as written.** A 2005 or 2008 energy plan is read for what it said then. The year is shown so readers can judge.
- **A rejected option counts only when Jev ties the passage to the Tribe.** Jev often rates the Tribe's own "considered but not recommended" assessments below 0.7 own, so another passage can still list that option as a goal. Verification is the backstop.
- **Stage can be inflated by text about others.** An agreement to buy federal power, for example, once lifted a hydropower stage to "installed". Verification with step-down corrected this case, and some claims marked needs review may still overstate.
- **Not every passage is read.** The lexicon finds only the listed wording, and the caps (6 per type, 45 per Tribe) leave some passages unread. Four Tribes reached the cap.
- **Years are inferred** from titles, file names or PDF metadata, and can be off.
- **ATNI listing comes from a directory capture.** It records a listing, not membership certification.
- **A T1 checker reports two false positives.** The pre-release T1 check (`scripts/check_t1_leak.py`) flags two 10-word overlaps with this file. Both are public text: a cig.uw.edu link prefix, and a Tribe's legal name followed by its slug. Neither is T1 content.
