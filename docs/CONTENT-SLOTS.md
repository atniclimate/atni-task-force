# Content Slots

The first build of the site roughed out every page and left a visible "In development" block wherever researched content would go. Each slot sits between two HTML comment markers, so a later pass can find it and fill it:

```html
<!-- SLOT:page:slot-id -->
<div class="slot" role="note">
  <p class="slot-label">In development</p>
  <p>What will go here.</p>
</div>
<!-- /SLOT -->
```

`page` is the site folder the page lives in (`home` for `site/index.html`; a subpage such as `site/ai/economics/` uses its top folder, `ai`). `scripts/validate_public.py` fails if a marker is unbalanced, nested, duplicated, filed under the wrong page, or missing from the table below.

## Filling a Slot

1. Find the slot: search `site/` for `SLOT:page:slot-id`.
2. Replace the "In development" block between the two markers with finished content. Use only T0 material (see `DATA-TIERS.md`); a source that is not public stays out.
3. Keep both markers around the filled content, so the slot can be found and revised later, and set its status in the table below.
4. Add each new public source to `site/data/library.json` (see `docs/LIBRARY.md`) with the area that matches the page.
5. Run `python scripts/validate_public.py`.

Write in the house style (`content/house-style.md` in the ATNI Climate Design System) and the `pf-voice` skill: institutional third person, no em dashes, Oxford comma, Title Case headings, dates as MM/DD/YYYY, and Tribe, Tribal, Indigenous, and InterTribal capitalized.

## Status

- **filled:** the slot holds the content it was made for. Later changes are ordinary updates.
- **partial:** public copy is in place, and part of what the slot describes waits on a confirmation or a release, named in the notes.
- **open:** the slot still shows its "In development" block.

Filled and partial slots were poured on 10/29/2026 from the public drafts in `work/public-drafts/` (T0).

## Slots

| Slot | Page | Section | What goes here | Status | Notes |
|---|---|---|---|---|---|
| `energy:charter` | `site/energy/index.html` | Purpose | The task force's formal charge, its relationship to the ATNI Energy Committee, and its membership, once confirmed. | partial | Published as what the task force proposes. Charge, membership, and reporting line await the Energy Committee. |
| `energy:focus-areas` | `site/energy/index.html` | Focus Areas | Focus areas as Tribal leaders set them. | partial | Four focus areas published as proposed; Tribal leaders set them. |
| `energy:programs-tools` | `site/energy/index.html` | Programs and Tools | Public programs, funding sources, and planning tools for Tribal energy feasibility work, each linked to its source. | filled | The full program list lives on `site/energy/funding/` (read from `energy-funding.json`); this slot keeps the summary and the upcoming deadlines. The RSTEP description is held: it rests on internal ATNI materials with no public source, and its relationship to DOE's R-STEP is unconfirmed. |
| `data-centers:charge` | `site/data-centers/index.html` | Purpose | A summary of Resolution #25-41 (cited in Resolution #2026-034 as from the 2025 Annual Convention) and its adopted text, added to the library as a PDF. | partial | Describes the charge only as Resolution #2026-034 cites it. Add the summary and the PDF when ATNI publishes the adopted text. |
| `data-centers:why-now` | `site/data-centers/index.html` | Why Now | Electricity load growth, water demand, and data center development in the Columbia Basin and across the ATNI region. | filled | |
| `data-centers:environmental-impacts` | `site/data-centers/index.html` | Environmental Impacts | Power, water use and discharge, land, air, and the relatives these sustain. | filled | |
| `data-centers:policy-tribal` | `site/data-centers/index.html` | Policy Landscape: Tribal | Tribal laws, codes, and positions on data center siting and data governance, only where a Tribe has made them public. | filled | Seminole Nation of Oklahoma's moratorium is described as reported (news only). |
| `data-centers:policy-state` | `site/data-centers/index.html` | Policy Landscape: State | State legislation, tax incentives, and utility regulation across the ATNI region. | filled | |
| `data-centers:policy-federal` | `site/data-centers/index.html` | Policy Landscape: Federal | Federal energy, permitting, and data policy that affects Tribal homelands and consultation. | filled | |
| `data-centers:sovereign-alternatives` | `site/data-centers/index.html` | Sovereign and Federated Alternatives | Localized and federated computing that keeps Tribal data under Tribal governance, and how the TSDF applies. | filled | The RSTEP sentences in the draft are held, as for `energy:programs-tools`. |
| `data-centers:questions` | `site/data-centers/index.html` | Questions for Tribal Leaders | A fuller question set drawn from the task force's research. Three anchor questions are already written above the slot. | filled | |
| `ai:working-with-ai` | `site/ai/index.html` | Working with AI: Building Tools versus Offloading Thinking | Guidance on building tools a Tribe governs and understands, as against handing judgment to systems it does not control. | filled | The page's hero lead was replaced from the same draft. |
| `ai:youth-resources` | `site/ai/index.html` | Youth and Education | The ATNI Youth Committee's resource packet (Resolution #2026-051) and related guidance for schools, when available. | partial | Evidence, steps for schools, colleges, and families, and questions are published. The K-12 packet is being prepared with the Youth Committee; its draft outline and Tribal-confirmation placeholders stay unpublished until the Committee agrees. |
| `ai:economics-frontier` | `site/ai/index.html` | Economics and the Global Frontier | How AI is changing work, markets, and energy demand, and what the global race to build more capable systems means for Tribal Nations. | open | Held 2026-10-29 after adversarial review; revised draft `work/public-drafts/ai-economics-v2.md` awaits a named human editor's verification before publication. |
| `summit:hosts` | `site/summit/index.html` | Agenda | World café hosts (ATNI partners and projects), as confirmed. | partial | How tables are hosted is published; no host is confirmed. List hosts by organization or program name only, with each host's agreement. |
| `summit:task-force-inputs` | `site/summit/index.html` | How Task Force Work Feeds the Summit | Briefings from each task force, as prepared. | partial | What each task force brings is published; briefings are not yet prepared. |
| `summit:logistics` | `site/summit/index.html` | Registration | Confirmed dates, venue, travel information, and registration details. Also update the hero notice and Key Facts on the same page, the Summit card on the home page, and the session-times note. | partial | The plan for the two days and for registration is published; dates and venue are to be confirmed. Keep "Proposed for March 2027" until ATNI confirms. |
| `about:people` | `site/about/index.html` | ATNI and the Task Forces | Energy Committee leadership and task force members, with each person's agreement. No personal email addresses. | open | |
| `about:license` | `site/about/index.html` | License | The content license for the site, once ATNI decides it. | open | |
