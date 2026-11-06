#!/usr/bin/env python3
"""Fills site/briefing/index.html between its markers: the rail, and the packet as copies of the plates' built blocks and the Data Center page's checklists.

build_plates.py builds a plate into its one page; this copies the block out of that page, so nothing on the briefing is fetched or typed. Only plates on the one-level pages come
here: their ../ paths resolve unchanged, and the plates on Funding and What Tribal Plans Say are reference views of the same data. A link that points at the source page's own
ids or its subpages is rewritten to reach them from here. Run after build_plates.py, pour_claim_refs.py, and build_index.py:
   python scripts/build_briefing.py          # write
   python scripts/build_briefing.py --check  # write nothing; exit 1 if it is out of date
"""
from html import escape, unescape
import json
from pathlib import Path
import posixpath
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import build_plates as bp  # noqa: E402
import pour_claim_refs as cr  # noqa: E402
import validate_public as vp  # noqa: E402

PAGES = {"ai/index.html": "AI", "data-centers/index.html": "Data Centers", "energy/index.html": "Energy"}
LABELS = {"energy-types-by-stage": "Energy types in Tribal plans", "energy-deadlines": "Funding deadlines"}  # these two plates have no eyebrow yet
MODELS = {"comparison-model": "the comparison model", "resource-model": "the open-book model"}  # the Explorer's model by its public name (owner ruling, 11/05/2026)
CHECKLISTS_PAGE = "data-centers/index.html"
FOOT = "This comparison does not decide a proposal."
EMPTY = "Nothing chosen yet. Tick plates and checklists at left; the packet builds here."
MODELED = "Figures marked modeled are computed from the receipts and the reader's settings, not measured."
NOTE = re.compile(r'<p class="dc-wide-note">((?:(?!</p>).)*)</p>\s*<div class="disclosure-grid[^"]*" id="checklists">', re.S)  # the page has other notes, so this one may not run past its own paragraph
LIST = re.compile(r'<details class="disclosure" id="(q-[a-z-]+)">\s*<summary><h3>(.*?)</h3></summary>\s*<ul>(.*?)</ul>\s*</details>', re.S)
HREF = re.compile(r'\shref="([^"]*)"')
ID = re.compile(r'\sid="([^"]+)"')


def block_of(page, plate_id):
    start, end = f"<!-- plate:{plate_id} -->", f"<!-- /plate:{plate_id} -->"
    if page.count(start) != 1 or page.count(end) != 1:
        raise bp.BuildError(f"{plate_id}: its page must hold one {start} and one {end}")
    return page[page.index(start) + len(start):page.index(end)].strip()


def checklists_of(page):
    """The provenance sentence and each list, as the Data Center page holds them. A change of shape there stops the build here, not the packet."""
    note = NOTE.search(page)
    lists = LIST.findall(page[note.end():]) if note else []
    if not lists:
        raise bp.BuildError(f"{CHECKLISTS_PAGE}: expected a dc-wide-note paragraph, then #checklists holding details with a summary h3 and one ul: update LIST and NOTE here")
    return note[1], lists


def rehome(html, source_dir, here, sections):
    """A link keeps working from here: an id on this page stays, with a way home for when its section is not chosen; anything else reaches back to the source page."""
    def one(match):
        url = match[1]
        if url.startswith(("http:", "https:", "../", "//")):
            return match[0]
        if url.startswith("#") and url[1:] in here:
            home = f' data-home="../{sections[url[1:]]}/{url}"' if url[1:] in sections else ""
            return f'{match[0]}{home}'
        return f' href="../{source_dir}/{url}"'
    return HREF.sub(one, html)


def page_section(kind, attrs, body, checked):
    """One section of the packet: its guard line, what it holds, and its foot line, real text at both ends. A real table, because Chrome repeats a thead and a tfoot on every printed page
    and does not repeat a CSS table's or an @page margin box's text in every browser; on screen it is display: block, and role="presentation" keeps it out of the table reading."""
    guard = f'<p class="packet-guard">Settings chosen by the reader, sources checked {escape(checked)}.</p>'
    return (f'<section class="packet-page {kind}" {attrs} data-checked="{escape(checked)}">\n<table class="packet-sheet" role="presentation">\n<thead><tr><td>{guard}</td></tr></thead>\n'
            f'<tbody><tr><td class="packet-body">\n{body}\n</td></tr></tbody>\n<tfoot><tr><td><p class="packet-foot">{FOOT}</p></td></tr></tfoot>\n</table>\n</section>')


def source_row(claim_id, receipt, claim, anchor=""):
    source, limit = claim["source"], receipt.get("limit") or claim.get("limit")
    status = ("partly verified" if receipt["status"] == "partly" else "verified") + (f": {escape(limit)}" if limit else "")
    published = f', published {escape(bp.us_date(source.get("published")))}' if source.get("published") else ""
    return (f'<li class="packet-source"{anchor} data-claim="{escape(claim_id)}" data-status="{escape(receipt["status"])}"><span class="packet-claim">{escape(claim_id)}</span>'
            f'<span class="packet-work"><a href="{escape(source["url"])}">{bp.verbatim(receipt["title"])}</a>, {bp.verbatim(source["publisher"])}{published}.'
            f' <span class="packet-status">{status}</span><span class="packet-also"></span></span></li>')


def list_sources(items, claims, anchored):
    """A figure in a checklist is marked with its claim (scripts/pour_claim_refs.py), so the list's section carries the receipt, and the mark's link lands on it."""
    rows = []
    for claim_id in dict.fromkeys(re.findall(r'data-claim="([^"]+)"', items)):
        anchor = "" if claim_id in anchored else f' id="src-{escape(claim_id)}"'
        anchored.add(claim_id)
        rows.append(source_row(claim_id, {"status": claims[claim_id]["status"], "title": claims[claim_id]["source"]["title"]}, claims[claim_id], anchor))
    return f'\n<!-- claims-cited:list -->\n<ol class="packet-source-list">{"".join(rows)}</ol>\n<!-- /claims-cited:list -->' if rows else ""


def plate_sections(entry, block, data, claims, from_name):
    plate_id, checked = entry["id"], entry["checked"] or ""
    label = entry["eyebrow"] or LABELS.get(plate_id)
    if not label:
        raise bp.BuildError(f"{plate_id}: give it an eyebrow, or name it in LABELS here, so the rail can say what it is")
    verified = sum(r["status"] == "verified" for r in data["receipts"].values())
    partly = len(data["receipts"]) - verified
    tally = ", ".join(filter(None, [f"{verified} verified" if verified else "", f"{partly} partly verified" if partly else ""]))
    model = MODELS.get(entry.get("model"), entry.get("model") or "")
    attrs = f'id="packet-{plate_id}" data-packet="{plate_id}" data-from="{escape(from_name)}" data-label="{escape(label)}" data-model="{escape(model)}"{" data-formula" if any(r.get("f") for r in data["rows"]) else ""}'
    plate = page_section("packet-plate", attrs, (
        f'<h2 class="packet-eyebrow">{escape(from_name)}: {escape(label)}</h2>\n<p class="caption packet-settings">Settings: defaults</p>\n'
        f'<!-- plate:{plate_id} -->\n{block}\n<!-- /plate:{plate_id} -->\n'
        f'<p class="caption packet-receipts"><a href="#sources-{plate_id}">Receipts: {tally}</a></p>'), checked)
    rows = "\n".join(source_row(claim_id, receipt, claims[claim_id]) for claim_id, receipt in data["receipts"].items())
    # The claims-cited marker keeps these rows out of scripts/number_audit.py, as a page's own claim list is.
    sources = page_section("packet-sources", f'id="sources-{plate_id}" data-packet="{plate_id}"', (
        f'<h2 class="packet-h">Sources for: <span data-title="{plate_id}">{escape(entry["title"])}</span></h2>\n<!-- claims-cited:{plate_id} -->\n<ol class="packet-source-list">\n{rows}\n</ol>\n<!-- /claims-cited:{plate_id} -->\n'
        '<p class="caption packet-none" hidden>Every source for this plate is listed with an earlier plate.</p>'), checked)
    return plate, sources, label


def rail_item(name, value, label, extra="", note=""):
    return (f'<li class="rail-item"><input type="checkbox" id="pick-{value}" name="{name}" value="{value}"{extra} data-js hidden><a href="#{value}">{escape(label)}</a>{note}</li>')


def compose(site):
    site = Path(site)
    index = json.loads((site / "data" / "index.json").read_text(encoding="utf-8"))
    claims = bp.load_claims(site)
    sources = {rel: (site / rel).read_text(encoding="utf-8") for rel in PAGES}
    entries = [dict(p) for p in index["plates"] if p["page"] in PAGES]
    for entry in entries:
        entry["model"] = json.loads((site / entry["path"]).read_text(encoding="utf-8")).get("model")
    blocks = {e["id"]: block_of(sources[e["page"]], e["id"]) for e in entries}
    data = {plate_id: json.loads(dict(vp.PLATE_BLOCK.findall(block))[plate_id]) for plate_id, block in blocks.items()}
    note, lists = checklists_of(sources[CHECKLISTS_PAGE])
    sections = {e["id"]: posixpath.dirname(e["page"]) for e in entries} | {list_id: posixpath.dirname(CHECKLISTS_PAGE) for list_id, _, _ in lists}
    here = set(sections) | {i for block in blocks.values() for i in ID.findall(block)}
    dated = [e["checked"] for e in entries if e["checked"]]
    if not dated:
        raise bp.BuildError(f"no plate on {', '.join(PAGES)} has a checked date in data/index.json, so the packet cannot say when its sources were checked: run build_plates.py, then build_index.py")
    latest = max(dated, key=lambda d: (d[6:], d[:5]))

    packet, rail, seen = [], {}, {}
    labels = {}
    for entry in entries:
        from_name = PAGES[entry["page"]]
        block = rehome(blocks[entry["id"]], posixpath.dirname(entry["page"]), here, sections)
        plate, sources_part, label = plate_sections(entry, block, data[entry["id"]], claims, from_name)
        packet += [plate, sources_part]
        labels[entry["id"]] = label
        seen[label] = seen.get(label, 0) + 1
        rail.setdefault(from_name, []).append(entry["id"])
    rail_html = []
    for from_name, ids in rail.items():
        items = "\n".join(rail_item("plate", i, labels[i], note=f'<span class="rail-from">{escape(from_name)}</span>' if seen[labels[i]] > 1 else "") for i in ids)
        rail_html.append(f'<fieldset class="rail-group"><legend>Plates from the {escape(from_name)} page</legend><ul class="rail-items">\n{items}\n</ul></fieldset>')
    checklist_items, checklist_contents, anchored = [], [], set()
    for list_id, name, items in lists:
        asks = " ".join(dict.fromkeys(h[1:] for h in HREF.findall(items) if h[1:] in labels))
        checklist_items.append(rail_item("list", list_id, unescape(name), f' data-asks="{asks}"' if asks else "", '<span class="rail-asks" hidden></span>' if asks else ""))
        checklist_contents.append(f'<li data-for="{list_id}"><a href="#{list_id}">{name}</a></li>')
        body = rehome(f'<p class="caption packet-provenance">{note}</p>\n<ol class="packet-list">{items}</ol>', posixpath.dirname(CHECKLISTS_PAGE), here, sections)
        packet.append(page_section("packet-checklist", f'id="{list_id}" data-packet="{list_id}" data-label="{escape(unescape(name))}"', f'<h2 class="packet-h">{name}</h2>\n{body}{list_sources(items, claims, anchored)}', latest))
    rail_html.append(f'<fieldset class="rail-group"><legend>Checklists</legend><ul class="rail-items">\n' + "\n".join(checklist_items) + "\n</ul></fieldset>")

    receipts = {claim_id: r for d in data.values() for claim_id, r in d["receipts"].items()}
    partly = sum(r["status"] == "partly" for r in receipts.values())
    models = sorted({MODELS.get(e["model"], e["model"]) for e in entries if e["model"]})
    contents = "\n".join(f'<li data-for="{e["id"]}"><a href="#{e["id"]}"><span data-title="{e["id"]}">{escape(e["title"])}</span></a></li>' for e in entries) + "\n" + "\n".join(checklist_contents)
    cover = page_section("packet-cover is-chosen", 'id="packet-cover"', (
        '<h2 class="packet-title">Council Briefing</h2>\n<p class="packet-assembled">Assembled<span data-assembled></span> from the ATNI Energy Task Forces site.</p>\n'
        f'<p class="packet-empty" data-empty hidden>{EMPTY}</p>\n<div data-filled>\n<dl class="packet-rows">\n'
        f'<dt>Measured</dt><dd data-measured>{len(receipts):,} figures read from a source and cited by claim id; {partly:,} of them partly verified, each with its limit printed.</dd>\n'
        f'<dt>Modeled</dt><dd><span data-modeled>{escape(", ".join(models + ["formula rows"]).capitalize())}.</span> {MODELED}</dd>\n'
        '<dt>Chosen by the reader</dt><dd data-chosen>Every plate at its defaults.</dd>\n</dl>\n'
        f'<h2 class="packet-contents">Contents</h2>\n<ol class="packet-toc" data-contents>\n{contents}\n</ol>\n</div>'), latest)
    figures = (f'<li><span class="figure-num">{len(entries)}</span><span class="figure-label">plates to choose from</span></li>'
               f'<li><span class="figure-num">{len(lists)}</span><span class="figure-label">checklists</span></li>'
               f'<li><span class="figure-num">{escape(latest)}</span><span class="figure-label">sources checked</span></li>')
    return {"figures": figures, "rail": "\n".join(rail_html), "packet": "\n".join([cover, *packet])}, claims


def fill(page, parts):
    for name, html in parts.items():
        start, end = f"<!-- briefing:{name} -->", f"<!-- /briefing:{name} -->"
        if page.count(start) != 1 or page.count(end) != 1:
            raise bp.BuildError(f"briefing/index.html needs one {start} and one {end}")
        page = f"{page[:page.index(start) + len(start)]}\n{html}\n{page[page.index(end):]}"
    return page


def built(site=vp.SITE):
    """The page as it is, and as the build makes it, so scripts/build_briefing_pdf.py can read the packet without writing it."""
    old = (Path(site) / "briefing" / "index.html").read_bytes().decode("utf-8")
    parts, claims = compose(site)
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
