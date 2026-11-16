#!/usr/bin/env python3
"""Fills site/briefing/index.html between its markers: the ready-made packets, the rail, and the packet as copies of the plates' built blocks, the question sets the
pages ask, a cover that says what the packet says, and one appendix of sources by document.

build_plates.py builds a plate into its one page; this copies the block out of that page, so nothing on the briefing is fetched or typed. The plates come from the
task force pages and Energy and Water Use (PAGES); the plates on Funding and What Tribal Plans Say are reference views of the same data. A link in a copy is
rewritten to reach what it named from here: an id on this page stays, with a way home for when its section is not chosen. Run after build_plates.py,
pour_claim_refs.py, and build_index.py:
   python scripts/build_briefing.py          # write
   python scripts/build_briefing.py --check  # write nothing; exit 1 if it is out of date
"""
from html import escape, unescape
import json
import math
from pathlib import Path
import posixpath
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import build_plates as bp  # noqa: E402
import pour_claim_refs as cr  # noqa: E402
import validate_public as vp  # noqa: E402

# The pages whose plates the Briefing offers, by their names in the nav and footer, in the rail's order.
PAGES = {"ai/index.html": "AI", "data-centers/index.html": "Data Centers", "data-centers/resource-use/index.html": "Energy and Water Use", "energy/index.html": "Tribal Energy"}
LABELS = {"energy-types-by-stage": "Energy types in Tribal plans", "energy-deadlines": "Funding deadlines"}  # these two plates have no eyebrow yet
MODELS = {"comparison-model": "the comparison model", "resource-model": "the open-book model"}  # the Explorer's model by its public name (owner ruling, 11/05/2026)
CHECKLISTS_PAGE = "data-centers/index.html"
FOOT = "This comparison does not decide a proposal."
GUARD = "Default settings, sources checked {checked}."  # briefing.js says "Settings chosen by the reader" once a setting moves
EMPTY = "Nothing is in the packet yet. Start from one of the packets above, or tick plates and checklists in the list."
MODELED = "Figures marked modeled are computed from the receipts and the reader's settings, not measured."
# What each plate answers, as the rail and the packet's headings ask it (briefing-plates-21). A plate not named here falls back to its eyebrow, with a warning.
ASKS = {
    "ai-hour": "Is everyday AI use the problem?",
    "ai-same-hour": "How much energy does an hour of chat or video use?",
    "ai-heavy-ai": "How does an agent session compare with a text prompt?",
    "ai-per-day": "What does one person's AI use come to in a day?",
    "ai-scale": "How large is AI's electricity use next to the buildout?",
    "ai-occupations": "Which jobs are projected to grow or shrink by 2035?",
    "ai-jobs-sector": "Which sectors are projected to gain or lose jobs by 2035?",
    "ai-displacement": "What do studies find about AI and job losses?",
    "ai-company-money": "Is the buildout outrunning the companies' cash flow?",
    "ai-capex-cash": "Can each company cover its spending from cash on hand?",
    "ai-company-footprint": "How fast is each company's electricity use growing?",
    "ai-guidance-2026": "What do the companies plan to spend in 2026?",
    "ai-holdings": "How large are the companies building AI?",
    "dc-pnw-load": "How much new load is planned for the Northwest?",
    "dc-eia-servers": "What does the federal outlook expect for data center servers?",
    "dc-lbnl-us": "How much electricity do US data centers use?",
    "dc-iea-world": "How much electricity do the world's data centers use?",
    "dc-forecast-check": "How have past electricity forecasts held up?",
    "dc-tradeoff-matrix": "What does a data center trade off, and how well is each known?",
    "dc-cooling": "How much water would cooling a site consume?",
    "dc-water-intensity": "How much water do operators report per kWh?",
    "dc-project-land": "How many named proposals sit on public land?",
    "dc-climate-counties": "How hot will summers get in counties with proposals?",
    "dc-jobs-per-mw": "How many jobs does a site bring, and for how long?",
    "dc-project": "What would one proposal draw?",
    "ru-hour": "How much energy does an hour of streaming use, end to end?",
    "ru-electricity": "How far apart are the estimates of world data center electricity?",
    "ru-boundary": "How much of an hour of video happens inside the data center?",
    "ru-forecasts": "Is AI why data centers are growing?",
    "ru-water": "How much water does a data center use, counting the power plant?",
    "energy-types-by-stage": "What energy types do Tribes' public plans name?",
    "energy-deadlines": "What funding deadlines are coming?",
}
# The ready-made packets at the top of the page, by purpose (briefing-plates-20). Each names plates and question sets the pages offer; a name that is gone stops
# the build here, so a packet never loses a plate without a word. The fourth packet is the PDF's: see ready_ids().
PACKETS = [
    ("proposal", "A data center proposal is on the agenda",
     ["dc-project", "dc-pnw-load", "dc-cooling", "dc-water-intensity", "dc-jobs-per-mw", "dc-tradeoff-matrix"],
     ["q-consent", "q-land", "q-water", "q-power", "q-rates", "q-jobs", "q-data", "q-exit"]),
    ("ai-policy", "Setting an AI use policy", ["ai-hour", "ai-per-day", "ai-scale", "ai-occupations", "ai-displacement"], ["q-adopt", "q-data"]),
    ("energy", "Energy planning and funding", ["energy-types-by-stage", "energy-deadlines", "dc-pnw-load"], []),
]
READY_NAME = "One plate from each page, and every checklist"
# Printed sheets, for the page estimate: a plate's title, plot, and Reading fill one sheet with its first rows (DIRECTION-R2 3.7, item 10); more rows run on.
ROWS_ON_FIRST, ROWS_A_SHEET, DOCS_A_SHEET = 15, 40, 20
NOTE = re.compile(r'<p class="dc-wide-note">((?:(?!</p>).)*)</p>\s*<div class="disclosure-grid[^"]*" id="checklists">', re.S)  # the page has other notes, so this one may not run past its own paragraph
LIST = re.compile(r'<details class="disclosure" id="(q-[a-z-]+)">\s*<summary><h3>(.*?)</h3></summary>\s*<ul>(.*?)</ul>\s*</details>', re.S)
# The meeting sheet's form (DIRECTION-R2 3.12): a set is a fieldset with its name as the legend and one span.ask-q a question. Where a set comes from is the
# paragraph that opens its fieldset, or else the one just before the form.
FORM = re.compile(r'(?:<p class="[^"]*">((?:(?!</p>).)*)</p>\s*)?<form class="asks\b[^"]*"[^>]*>(.*?)</form>', re.S)
ASK_SET = re.compile(r'<fieldset class="ask-set"[^>]*?\sid="(q-[a-z0-9-]+)"[^>]*>\s*<legend[^>]*>(.*?)</legend>(.*?)</fieldset>', re.S)
ASK_Q = re.compile(r'<span class="ask-q">(.*?)</span>\s*</label>', re.S)
OPENING = re.compile(r'\s*<p class="[^"]*">((?:(?!</p>).)*)</p>', re.S)
HREF = re.compile(r'\shref="([^"]*)"')
ID = re.compile(r'\sid="([^"]+)"')
ROW = re.compile(r"<tr\b[^>]*\bdata-key=")
TITLE = re.compile(r'<h3 class="plate-title"[^>]*>(.*?)</h3>', re.S)


def block_of(page, plate_id):
    start, end = f"<!-- plate:{plate_id} -->", f"<!-- /plate:{plate_id} -->"
    if page.count(start) != 1 or page.count(end) != 1:
        raise bp.BuildError(f"{plate_id}: its page must hold one {start} and one {end}")
    return page[page.index(start) + len(start):page.index(end)].strip()


def question_sets(page):
    """The question sets a page's meeting-sheet forms hold, each as (id, name, its questions as <li>s, the line that says where it comes from, or '')."""
    out = []
    for before, form in FORM.findall(page):
        for set_id, name, body in ASK_SET.findall(form):
            opening = OPENING.match(body)
            out.append((set_id, name.strip(), "".join(f"\n<li>{q.strip()}</li>" for q in ASK_Q.findall(body)) + "\n", opening[1] if opening else before))
    return out


def checklists_of(page):
    """The Data Center page's sets before its meeting-sheet form: the provenance sentence and each list, from its disclosures. A change of shape there stops the
    build here, not the packet."""
    note = NOTE.search(page)
    lists = LIST.findall(page[note.end():]) if note else []
    if not lists:
        raise bp.BuildError(f"{CHECKLISTS_PAGE}: expected form.asks fieldsets, or a dc-wide-note paragraph then #checklists holding details with a summary h3 and one ul: update ASK_SET or LIST and NOTE here")
    return note[1], lists


def rehome(html, source_dir, here, sections):
    """A link keeps working from here: an id on this page stays, with a way home for when its section is not chosen; anything else reaches back to where it
    pointed from the source page, at whatever depth that page sits."""
    def one(match):
        url = match[1]
        if url.startswith(("http:", "https:", "//", "mailto:")):
            return match[0]
        if url.startswith("#"):
            if url[1:] in here:
                home = f' data-home="../{sections[url[1:]]}/{url}"' if url[1:] in sections else ""
                return f'{match[0]}{home}'
            return f' href="../{source_dir}/{url}"'
        path, tail = re.match(r"([^?#]*)(.*)", url, re.S).groups()
        target = posixpath.normpath(posixpath.join(source_dir, path))
        return f' href="{posixpath.relpath(target, "briefing")}{"/" if path.endswith("/") or not path else ""}{tail}"'
    return HREF.sub(one, html)


def page_section(kind, attrs, body, checked):
    """One section of the packet: its guard line, what it holds, and its foot line, real text at both ends. A real table, because Chrome repeats a thead and a tfoot on every printed page
    and does not repeat a CSS table's or an @page margin box's text in every browser; on screen it is display: block, and role="presentation" keeps it out of the table reading."""
    guard = f'<p class="packet-guard">{escape(GUARD.format(checked=checked))}</p>'
    return (f'<section class="packet-page {kind}" {attrs} data-checked="{escape(checked)}">\n<table class="packet-sheet" role="presentation">\n<thead><tr><td>{guard}</td></tr></thead>\n'
            f'<tbody><tr><td class="packet-body">\n{body}\n</td></tr></tbody>\n<tfoot><tr><td><p class="packet-foot">{FOOT}</p></td></tr></tfoot>\n</table>\n</section>')


def ask_of(plate_id, label):
    if plate_id not in ASKS:
        print(f"build_briefing: name what {plate_id} answers in ASKS; the rail shows its eyebrow until then", file=sys.stderr)
    return ASKS.get(plate_id, label)


def sheets(block):
    """Printed sheets a plate takes, about: one for its title, plot, Reading, and first rows, then one for each further run of rows."""
    return 1 + math.ceil(max(0, len(ROW.findall(block)) - ROWS_ON_FIRST) / ROWS_A_SHEET)


def plate_section(entry, block, data, from_name, label, ask):
    plate_id, checked = entry["id"], entry["checked"] or ""
    model = MODELS.get(entry.get("model"), entry.get("model") or "")
    attrs = (f'id="packet-{plate_id}" data-packet="{plate_id}" data-from="{escape(from_name)}" data-label="{escape(label)}" data-model="{escape(model)}"'
             f'{" data-formula" if any(r.get("f") for r in data["rows"]) else ""} data-sheets="{sheets(block)}"')
    return page_section("packet-plate", attrs, (
        f'<p class="packet-from">From the {escape(from_name)} page</p>\n<h2 class="packet-ask">{escape(ask)}</h2>\n<p class="caption packet-settings">Settings: defaults</p>\n'
        f'<!-- plate:{plate_id} -->\n{block}\n<!-- /plate:{plate_id} -->'), checked)


def rail_item(name, value, label, extra="", note=""):
    return f'<li class="rail-item"><input type="checkbox" id="pick-{value}" name="{name}" value="{value}"{extra} data-js><a href="#{value}">{escape(label)}</a>{note}</li>'


def rail_group(name, kind, runs):
    """A group of the rail, folded to its name and count; runs are (subheading or '', items), so the question sets say which page asks them."""
    total = sum(len(items) for _, items in runs)
    body = "".join((f'<p class="rail-sub">{escape(sub)}</p>' if sub else "") + '<ul class="rail-items">\n' + "\n".join(items) + "\n</ul>" for sub, items in runs)
    return (f'<details class="rail-group" data-group="{kind}"><summary><span class="rail-name">{escape(name)}</span> <span class="rail-count" data-count>'
            f'{total} {"plates" if kind == "plate" else "checklists"}</span></summary>{body}</details>')


def receipt_rows(cites, claims):
    """The appendix (briefing-plates-07, -11): one entry a document, A to Z, and under it its claims, grouped where they share a status, a limit, and the sections
    that cite them. data-for names those sections, so the script shows only what the packet holds; without scripts every entry shows. A claim a checklist's mark
    cites keeps its src- anchor, which the mark links."""
    docs = {}
    for claim_id, (receipt, sections, anchored) in cites.items():
        source = claims[claim_id]["source"]
        doc = docs.setdefault(source["url"], {"title": receipt["title"], "source": source, "groups": {}})
        limit = receipt.get("limit") or claims[claim_id].get("limit") or ""
        doc["groups"].setdefault((receipt["status"], limit, " ".join(sections)), []).append((claim_id, anchored))
    out = []
    for url, doc in sorted(docs.items(), key=lambda d: (unescape(d[1]["title"]).casefold(), d[0])):
        source, rows, used = doc["source"], [], set()
        for (status, limit, sections), ids in doc["groups"].items():
            used.update(sections.split())
            names = ", ".join(f'<span id="src-{escape(c)}">{escape(c)}</span>' if anchored else escape(c) for c, anchored in ids)
            word = "partly verified" if status == "partly" else "verified"
            rows.append(f'<li data-for="{sections}"><span class="packet-ids">{names}</span> <span class="packet-status"><span class="st st-{"p" if status == "partly" else "v"}" aria-hidden="true"></span> {word}'
                        f'{": " + escape(limit) if status == "partly" and limit else ""}</span></li>')
        published = f', published {escape(bp.us_date(source.get("published")))}' if source.get("published") else ""
        out.append(f'<li class="packet-doc" data-for="{" ".join(sorted(used))}"><p class="packet-doc-name"><a href="{escape(url)}">{bp.verbatim(doc["title"])}</a>, {bp.verbatim(source["publisher"])}{published}.</p>'
                   f'<ul class="packet-doc-claims">{"".join(rows)}</ul></li>')
    return out


def said(entry, receipts):
    """A plate's line on the cover (briefing-plates-24): its finding, which the script keeps to the plate's current title, its page, and its figures' standing."""
    partly = sum(r["status"] == "partly" for r in receipts.values())
    standing = f"{len(receipts):,} sourced figures" + (f", {partly:,} partly verified" if partly else "")
    return (f'<li data-for="{entry["id"]}"><a href="#{entry["id"]}"><span data-title="{entry["id"]}">{escape(entry["title"])}</span></a>'
            f'<span class="packet-says-from"> {escape(PAGES[entry["page"]])} page; {standing}.</span></li>')


def ready_ids(entries, list_ids):
    """The PDF's packet: the first plate each page lists, in the manifest's order, and then every question set."""
    first = {}
    for entry in entries:
        first.setdefault(entry["page"], entry["id"])
    return [*first.values(), *list_ids]


def preset(key, name, plate_ids, list_ids, asks, list_names, pages, actions):
    plural = lambda n, one, many: f"{n} {one if n == 1 else many}"  # noqa: E731
    count = " and ".join(filter(None, [plural(len(plate_ids), "plate", "plates") if plate_ids else "", plural(len(list_ids), "checklist", "checklists") if list_ids else ""]))
    holds = "".join(f"<li>{escape(asks[i])}</li>" for i in plate_ids)
    if 0 < len(list_ids) <= 8:
        holds += f'<li>{"Checklists" if len(list_ids) > 1 else "Checklist"}: {escape(", ".join(list_names[i] for i in list_ids))}</li>'
    elif list_ids:
        holds += f"<li>Every checklist, {len(list_ids)} in all</li>"
    estimate = f", about {pages} pages" if pages else ""
    return (f'<li class="preset" id="preset-{key}"><h3 class="preset-name">{escape(name)}</h3><p class="preset-count">{count}{estimate}</p>'
            f'<ul class="preset-holds">{holds}</ul><div class="preset-acts" data-ids="{" ".join([*plate_ids, *list_ids])}">{actions}</div></li>')


def compose(site, pdf_slot="<!-- briefing:pdf -->\n<!-- /briefing:pdf -->"):
    site = Path(site)
    index = json.loads((site / "data" / "index.json").read_text(encoding="utf-8"))
    claims = bp.load_claims(site)
    sources = {rel: (site / rel).read_text(encoding="utf-8") for rel in PAGES}
    entries = [dict(p) for p in index["plates"] if p["page"] in PAGES]
    entries.sort(key=lambda e: list(PAGES).index(e["page"]))  # the rail's order; within a page, the manifest's
    dated = [e["checked"] for e in entries if e["checked"]]
    if not dated:
        raise bp.BuildError(f"no plate on {', '.join(PAGES)} has a checked date in data/index.json, so the packet cannot say when its sources were checked: run build_plates.py, then build_index.py")
    latest = max(dated, key=lambda d: (d[6:], d[:5]))
    for entry in entries:
        entry["model"] = json.loads((site / entry["path"]).read_text(encoding="utf-8")).get("model")
    blocks = {e["id"]: block_of(sources[e["page"]], e["id"]) for e in entries}
    data = {plate_id: json.loads(dict(vp.PLATE_BLOCK.findall(block))[plate_id]) for plate_id, block in blocks.items()}
    for entry in entries:  # the title the block carries, which its page may have rebuilt since the manifest was written
        found = TITLE.search(blocks[entry["id"]])
        entry["title"] = unescape(found[1]) if found else entry["title"]
    lists, notes = [], {}  # (id, name, items, page), the question sets of every page, the Data Center page's first
    for rel in sorted(PAGES, key=lambda r: r != CHECKLISTS_PAGE):
        found = question_sets(sources[rel])
        if not found and rel == CHECKLISTS_PAGE:
            note, old = checklists_of(sources[rel])
            found = [(*item, note) for item in old]
        lists += [(list_id, name, items, rel) for list_id, name, items, _ in found]
        notes.update({list_id: note for list_id, _, _, note in found})
    sections = {e["id"]: posixpath.dirname(e["page"]) for e in entries} | {list_id: posixpath.dirname(rel) for list_id, _, _, rel in lists}
    here = set(sections) | {i for block in blocks.values() for i in ID.findall(block)}

    labels, asks, packet, rail = {}, {}, [], {}
    for entry in entries:
        label = entry["eyebrow"] or LABELS.get(entry["id"])
        if not label:
            raise bp.BuildError(f"{entry['id']}: give it an eyebrow, or name it in LABELS here, so the packet can name it")
        labels[entry["id"]], asks[entry["id"]] = label, ask_of(entry["id"], label)
        from_name = PAGES[entry["page"]]
        block = rehome(blocks[entry["id"]], posixpath.dirname(entry["page"]), here, sections)
        packet.append(plate_section(entry, block, data[entry["id"]], from_name, label, asks[entry["id"]]))
        rail.setdefault(from_name, []).append(rail_item("plate", entry["id"], asks[entry["id"]]))
    rail_html = [rail_group(name, "plate", [("", items)]) for name, items in rail.items()]
    list_names, list_items = {}, {}
    cites = {}  # claim id: (its receipt, the sections that cite it, whether a mark links its src- anchor)
    for entry in entries:
        for claim_id, receipt in data[entry["id"]]["receipts"].items():
            cites.setdefault(claim_id, [receipt, [], False])[1].append(entry["id"])
    for list_id, name, items, rel in lists:
        list_names[list_id] = unescape(re.sub(r"<[^>]+>", "", name))
        asked = " ".join(dict.fromkeys(h[1:] for h in HREF.findall(items) if h[1:] in labels))
        list_items.setdefault(f"From the {PAGES[rel]} page", []).append(rail_item("list", list_id, list_names[list_id], f' data-asks="{asked}"' if asked else "", '<span class="rail-asks" hidden></span>' if asked else ""))
        for claim_id in dict.fromkeys(re.findall(r'data-claim="([^"]+)"', items)):
            cite = cites.setdefault(claim_id, [{"status": claims[claim_id]["status"], "title": claims[claim_id]["source"]["title"]}, [], False])
            cite[1].append(list_id)
            cite[2] = True
        source_dir = posixpath.dirname(rel)
        provenance = f'<p class="caption packet-provenance">{notes[list_id]}</p>\n' if notes[list_id] else ""
        body = rehome(f'{provenance}<ol class="packet-list">{items}</ol>', source_dir, here, sections)
        count = len(re.findall(r"<li>", items))
        packet.append(page_section("packet-checklist", f'id="{list_id}" data-packet="{list_id}" data-from="{escape(PAGES[rel])}" data-label="{escape(list_names[list_id])}" data-questions="{count}" data-sheets="1"',
                                   f'<p class="packet-from">From the {escape(PAGES[rel])} page</p>\n<h2 class="packet-h">{name}</h2>\n{body}', latest))
    rail_html.append(rail_group("Checklists", "list", list(list_items.items())))

    receipts = {claim_id: r for d in data.values() for claim_id, r in d["receipts"].items()}
    partly = sum(r["status"] == "partly" for r in receipts.values())
    models = sorted({MODELS.get(e["model"], e["model"]) for e in entries if e["model"]})
    says = [said(e, data[e["id"]]["receipts"]) for e in entries]
    says +=[f'<li data-for="{list_id}"><a href="#{list_id}">Checklist: {escape(list_names[list_id])}</a><span class="packet-says-from"> {len(re.findall(r"<li>", items))} questions to ask.</span></li>' for list_id, _, items, _ in lists]
    cover = page_section("packet-cover", 'id="packet-cover"', (
        '<h2 class="packet-title">Council Briefing</h2>\n<p class="packet-assembled">Assembled<span data-assembled></span> from the ATNI Energy Task Forces site.</p>\n'
        f'<p class="packet-empty" data-empty>{escape(EMPTY)}</p>\n<div data-filled>\n<h2 class="packet-says-h">What this packet says</h2>\n<ol class="packet-says" data-contents>\n' + "\n".join(says) + '\n</ol>\n'
        '<dl class="packet-rows">\n'
        f'<div class="packet-row" data-plates-only><dt>Measured</dt><dd data-measured>{len(receipts):,} figures read from a source and cited by claim id; {partly:,} of them partly verified, each with its limit printed.</dd></div>\n'
        f'<div class="packet-row" data-plates-only><dt>Modeled</dt><dd><span data-modeled>{escape(", ".join(models + ["formula rows"]).capitalize())}.</span> {MODELED}</dd></div>\n'
        '<div class="packet-row"><dt>Settings</dt><dd data-chosen>Every plate at its default settings.</dd></div>\n</dl>\n</div>'), latest)
    appendix = page_section("packet-appendix", 'id="packet-sources"', (
        '<h2 class="packet-h">Sources, by document</h2>\n<p class="caption packet-appendix-note">Every figure in this packet, under the document it comes from, with its claim id and status. '
        "Each plate's Sources page holds the quote and boundary behind each id.</p>\n<!-- claims-cited:appendix -->\n<ol class=\"packet-docs\">\n"
        + "\n".join(receipt_rows(cites, claims)) + "\n</ol>\n<!-- /claims-cited:appendix -->"), latest)

    in_packet = {e["id"] for e in entries} | set(list_names)
    gone = [i for _, _, plates, ids in PACKETS for i in [*plates, *ids] if i not in in_packet]
    if gone:
        raise bp.BuildError(f"PACKETS names {', '.join(dict.fromkeys(gone))}, which no page offers now: update PACKETS here")
    sheet_of = {e["id"]: sheets(blocks[e["id"]]) for e in entries} | {i: 1 for i in list_names}
    docs_of = lambda ids: len({claims[c]["source"]["url"] for c, (_, by, _) in cites.items() if set(by) & set(ids)})  # noqa: E731
    estimate = lambda ids: 1 + sum(sheet_of[i] for i in ids) + math.ceil(docs_of(ids) / DOCS_A_SHEET)  # noqa: E731
    act = '<button type="button" class="button button-secondary" data-print-preset data-js>Print this packet</button><a class="button button-secondary" href="#customize" data-customize>Customize</a>'
    presets = [preset(key, name, plates, ids, asks, list_names, estimate([*plates, *ids]), act) for key, name, plates, ids in PACKETS]
    ready = ready_ids(entries, [i for i, _, _, _ in lists])
    presets.append(preset("ready", READY_NAME, [i for i in ready if i in labels], [i for i in ready if i in list_names], asks, list_names, 0,
                          f'{pdf_slot}<a class="button button-secondary" href="#customize" data-customize>Customize</a>'))
    meta = f'<span class="figure-num">{escape(latest)}</span> <span class="figure-label">Sources checked</span>'
    return {"meta": meta, "presets": "\n".join(presets), "rail": "\n".join(rail_html), "packet": "\n".join([cover, *packet, appendix])}, claims


def fill(page, parts):
    for name, html in parts.items():
        start, end = f"<!-- briefing:{name} -->", f"<!-- /briefing:{name} -->"
        if page.count(start) != 1 or page.count(end) != 1:
            raise bp.BuildError(f"briefing/index.html needs one {start} and one {end}")
        page = f"{page[:page.index(start) + len(start)]}\n{html}\n{page[page.index(end):]}"
    return page


def built(site=vp.SITE):
    """The page as it is, and as the build makes it, so scripts/build_briefing_pdf.py can read the packet without writing it. The PDF's link, which that script
    writes from the file, keeps its words."""
    old = (Path(site) / "briefing" / "index.html").read_bytes().decode("utf-8")
    slot = re.search(r"<!-- briefing:pdf -->.*?<!-- /briefing:pdf -->", old, re.S)
    parts, claims = compose(site, *([slot[0]] if slot else []))
    text, problems = cr.pour(fill(old, parts), claims)
    if problems:
        raise bp.BuildError(f"briefing/index.html: {problems[0]}")
    return old, text


def run(site=vp.SITE, check=False):
    """Writes the page if it is out of date and returns True if it was."""
    old, text = built(site)
    if text == old:
        return False
    if not check:
        (Path(site) / "briefing" / "index.html").write_bytes(text.encode("utf-8"))
    return True


if __name__ == "__main__":
    checking = "--check" in sys.argv
    try:
        stale = run(check=checking)
    except bp.BuildError as error:
        sys.exit(f"build_briefing: {error}")
    print(json.dumps({"out_of_date" if checking else "written": stale}))
    if checking and stale:
        sys.exit("build_briefing: run python scripts/build_briefing.py")
