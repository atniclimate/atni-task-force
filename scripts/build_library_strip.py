#!/usr/bin/env python3
"""Pours the Library's reading room and its Explore the collection figure into site/library/index.html, and the Summit's reading list into
site/summit/index.html, from site/data/library.json.

Built here, not in the browser, so the first view reads without scripts, in print, and before library.json arrives (library-summit-about-01, -11, -12):
the Start here shelf and its preview, 25 Tribal-specific entries for a reader without scripts (40 in all), each select's choices, the field and its bars,
and where on the site each entry is cited. Idempotent: every block sits between two markers. Run it after any change to library.json or to the
figures a page cites; tests/test_pages.py fails until the pages match.
   python scripts/build_library_strip.py          # write
   python scripts/build_library_strip.py --check  # write nothing; exit 1 if a page is out of date

The words for areas and types are read from site/assets/js/library.js, so the bars, the selects and the list say the same thing. library.js paints the
squares by position, so it and this script list the field the same way: area by area in AREAS order, then in the file's own order. The rows and the
preview are drawn by library.js for every other shelf with the same markup.
"""
from html import escape
import json
from pathlib import Path
import re
import sys

import validate_public as vp

ROOT = Path(__file__).resolve().parent.parent
PAGE = ROOT / "site" / "library" / "index.html"
DATA = ROOT / "site" / "data" / "library.json"
SCRIPT = ROOT / "site" / "assets" / "js" / "library.js"
FIGURE = re.compile(r'(data-figure="(library|library-tribal|library-grounding|library-date)">)[^<]*')
YEARS_ALONE = 4  # the newest years get a bar each and the rest share "Before YYYY"; the Year select offers the same five choices
STATIC_TRIBAL = 25  # with the 15 to start with, the 40 entries a reader without scripts sees
FILINGS = re.compile(r"\bSEC\b")  # a company filing: its publisher is the SEC's EDGAR system (library.js FILINGS)
GROUPS = {"grounding": "Grounding resolutions", "energy-feasibility": "Tribal Energy", "data-centers": "Data Centers", "ai": "AI", "cross-cutting": "Across the task forces"}
PAGE_NAMES = {"energy/": "Tribal Energy", "energy/potential/": "What Tribal Plans Say", "energy/funding/": "Funding", "data-centers/": "Data Centers",
              "data-centers/resource-use/": "Energy and Water Use", "data-centers/primer/": "Kinds of Data Centers", "ai/": "AI",
              "ai/markets/": "AI and the Markets", "explorer/": "Explorer"}  # the footer's names, in its order
ISO_DAY = re.compile(r"(?<![\w/.-])(\d{4})-(\d{2})-(\d{2})(?![\w/-])")  # util.js usDates


def words(name, script):
    """One label map from library.js."""
    body = re.search(rf"const {name} = \{{(.*?)\n\}};", script, re.S).group(1)
    return dict(re.findall(r"^\s*'?([\w-]+)'?: '([^']+)',$", body, re.M))


def mark(claim_id, inner, cls="cr"):
    """A claim reference as scripts/pour_claim_refs.py leaves it, so a rebuild here and a pour there agree: linking the Library's Sources page, which holds its list.
    Every count here has a limit, so each is partly verified."""
    words = " ".join(re.sub(r"<[^>]*>", "", inner).split())
    away = "sources/" if (ROOT / "site" / "library" / "sources" / "index.html").is_file() else ""
    return f'<a class="{cls}" data-claim="{claim_id}" data-status="partly verified" href="{away}#src-{claim_id}" aria-label="{escape(words)}, claim {claim_id}, partly verified">{inner}</a>'


def counts(data, script):
    """Every count on the strip with its claim id. scripts/site_count_claims.py mints the claims from this list, so a bar and its claim cannot differ."""
    entries = data["entries"]
    total = len(entries)
    areas, types = words("AREAS", script), words("TYPES", script)
    years = sorted({entry["date"][:4] for entry in entries}, reverse=True)
    tribal = sum(entry["tribal_specific"] for entry in entries)

    def row(claim_id, name, value, label, n, counted):
        return {"id": claim_id, "name": name, "value": value, "label": label, "n": n, "counted": counted}

    rows = [
        row("lc-001", "total", None, "public entries", total, "every entry in the file"),
        row("lc-002", "tribal", "yes", "Tribal-specific", tribal, "entries marked Tribal-specific: by, for, or specifically about Tribal Nations or Indigenous Peoples"),
        row("lc-003", "tribal", "no", "General", total - tribal, "entries not marked Tribal-specific"),
        row("lc-004", "grounding", None, "grounding resolutions", sum(entry["featured"] and entry["type"] == "resolution" for entry in entries), "entries of type resolution marked as core sources"),
        row("lc-005", "area", "start-here", "Start here", sum(entry["featured"] for entry in entries), "entries marked as core sources"),
        row("lc-006", "several", None, "entries listing more than one area", sum(len(entry["areas"]) > 1 for entry in entries), "entries with two or more areas"),
    ]
    rows += [row(f"lc-{11 + i:03d}", "area", area, label, sum(area in entry["areas"] for entry in entries), f"entries that list {label[0].lower() + label[1:]} among their areas") for i, (area, label) in enumerate(areas.items())]
    rows += [row(f"lc-{21 + i:03d}", "type", kind, label, sum(entry["type"] == kind for entry in entries), f"entries of type {label.lower()}") for i, (kind, label) in enumerate(types.items())]
    rows += [row(f"lc-{41 + i:03d}", "year", year, year, sum(entry["date"].startswith(year) for entry in entries), f"entries dated {year}") for i, year in enumerate(years[:YEARS_ALONE])]
    if len(years) > YEARS_ALONE:
        cut = years[YEARS_ALONE - 1]
        rows.append(row(f"lc-{41 + YEARS_ALONE:03d}", "year", f"before-{cut}", f"Before {cut}", sum(entry["date"] < cut for entry in entries), f"entries dated before {cut}"))
    return rows


# The rows and the preview, as library.js draws them -------------------------------------------------------------------------------------------------

def day(iso):
    """util.js day(): MM/DD/YYYY for a whole date, the text as it is for a year."""
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", iso)
    return f"{m[2]}/{m[3]}/{m[1]}" if m else iso


def summary(entry):
    """The summary in house style, as util.js usDates writes it: an ISO date in a summary reads MM/DD/YYYY (home-shell-11d)."""
    return escape(ISO_DAY.sub(r"\2/\3/\1", entry["summary"]))


def newest(entries):
    """library.js newestFirst: by date, a year alone counting as its first day, then by title in code-point order."""
    return sorted(sorted(entries, key=lambda e: e["title"]), key=lambda e: e["date"] if len(e["date"]) > 4 else f"{e['date']}-00-00", reverse=True)


def link(url, up):
    return url if url.startswith("https://") else up + url


def row(entry, types, up="../", with_summary=True, picked=False, year_only=False, at=None):
    """at: the entry's place in library.json, which keys its citations (library.js reads it from the row)."""
    pdf = '<span class="entry-format"> (PDF)</span>' if entry["url"].lower().endswith(".pdf") else ""
    tribal = '<span class="entry-tribal">Tribal-specific</span>' if entry["tribal_specific"] else ""
    when = entry["date"][:4] if year_only else day(entry["date"])
    text = f'<p class="entry-summary">{summary(entry)}</p>' if with_summary else ""
    current = ' aria-current="true"' if picked else ""
    place = f' data-i="{at}"' if at is not None else ""
    return (f'<li class="entry" data-entry="{escape(entry["id"])}"{place} data-areas="{escape(" ".join(entry["areas"]))}"{current}>'
            f'<h3 class="entry-title"><a href="{escape(link(entry["url"], up))}">{escape(entry["title"])}{pdf}</a></h3>'
            f'<p class="entry-meta"><span class="entry-type">{escape(types.get(entry["type"], entry["type"]))}</span>, {escape(entry["publisher"])}, '
            f'<time datetime="{escape(entry["date"])}">{when}</time>{tribal}</p>{text}</li>')


def start_shelf(entries):
    """The featured entries: the grounding resolutions, then the rest by the first area each lists that has a group, newest first in each group. Summit has
    no group, so an entry of Summit alone goes across the task forces (library.js groupsHTML is the twin)."""
    featured = [e for e in entries if e["featured"]]
    by = {key: [] for key in GROUPS}
    for entry in newest(featured):
        by["grounding" if entry["type"] == "resolution" else next((a for a in entry["areas"] if a in by), "cross-cutting")].append(entry)
    return [(key, GROUPS[key], items) for key, items in by.items() if items]


def shelf_html(groups, types, place):
    first = groups[0][2][0]
    return "".join(f'<p class="entry-group" id="group-{key}">{label}</p><ol class="entries" role="list" aria-labelledby="group-{key}">'
                   + "".join(row(e, types, picked=e is first, at=place[e["id"]]) for e in items) + "</ol>" for key, label, items in groups)


def static_html(entries, types):
    """For a reader without scripts: the newest Tribal-specific entries the Start here shelf does not already hold, by title and source (each summary is a
    press away, at the source), so the page stays light. library.js hides the block."""
    shown = [e for e in newest(entries) if e["tribal_specific"] and not e["featured"]][:STATIC_TRIBAL]
    return (f'<section class="shelf-static" aria-labelledby="static-tribal-title"><h2 id="static-tribal-title">Tribal-Specific, Newest First</h2>'
            f'<ol class="entries" role="list">{"".join(row(e, types, with_summary=False) for e in shown)}</ol>'
            '<p class="caption">The rest of the library is in its data file, <a href="../data/library.json">library.json</a>, and, with scripts on, under Browse all.</p></section>')


def preview_html(entry, types, areas, pages, cites, at, up="../"):
    """The selected entry beside the list: the way to the document first, so it sits in the first screen, then its whole summary, its areas, and where the site cites it."""
    pdf = " (PDF)" if entry["url"].lower().endswith(".pdf") else ""
    chips = "".join(f'<li><a href="#area={a}" data-filter="area" data-value="{a}">{escape(areas.get(a, a))}</a></li>' for a in entry["areas"])
    if entry["tribal_specific"]:
        chips += '<li class="tag-tribal"><a href="#tribal=yes" data-filter="tribal" data-value="yes">Tribal-specific</a></li>'
    used = cites.get(str(at)) or []
    where = ("".join(f'<li><a href="{up}{pages[i][0]}">{escape(pages[i][1])}</a>: '
                     + ", ".join(f'<a href="{up}{pages[i][0]}sources/#src-{c}">{c}</a>' for c in ids) + "</li>" for i, *ids in used)
             if used else "<li>No figure on this site cites it.</li>")
    return (f'<div data-preview="{escape(entry["id"])}"><h3 class="preview-title">{escape(entry["title"])}</h3>'
            f'<p class="entry-meta"><span class="entry-type">{escape(types.get(entry["type"], entry["type"]))}</span>, {escape(entry["publisher"])}, <time datetime="{escape(entry["date"])}">{day(entry["date"])}</time></p>'
            f'<p class="preview-go"><a class="paper" href="{escape(link(entry["url"], up))}">Open the document{pdf}</a></p>'
            f'<p class="preview-summary">{summary(entry)}</p>'
            f'<dl class="preview-facts"><div><dt>Areas</dt><dd><ul class="tags" role="list">{chips}</ul></dd></div>'
            f'<div><dt>Cited on this site</dt><dd><ul class="preview-cites" role="list">{where}</ul></dd></div></dl></div>')


def norm(url):
    return re.sub(r"^https?://(www\.)?", "", (url if url.startswith("http") else vp.OWN_ORIGIN + url).strip()).rstrip("/").lower()


def citations(entries, site):
    """Where each entry is cited: the claims whose source is the entry, on each page whose plates or text carry them. Read from the main pages as
    build_plates.py and the page builders leave them, not from the Sources pages, which scripts/pour_claim_refs.py finishes after this runs.
    Pages without a Sources page (home, the Briefing) hold copies of these figures, so they are not listed."""
    by_url = {}
    for path in sorted((site / "data" / "claims").glob("*.json")):
        for claim in json.loads(path.read_text(encoding="utf-8")).get("claims") or []:
            if (claim.get("source") or {}).get("url"):
                by_url.setdefault(norm(claim["source"]["url"]), []).append(claim["id"])
    order = list(PAGE_NAMES)
    found = []
    for shell in site.glob("*/**/sources/index.html"):
        rel = shell.parent.parent.relative_to(site).as_posix() + "/"
        page = shell.parent.parent / "index.html"
        if rel == "library/" or not page.is_file():
            continue
        text = page.read_text(encoding="utf-8")
        ids = set(re.findall(r'\sdata-claim="([^"]+)"', text))
        for _, block in vp.PLATE_BLOCK.findall(text):
            ids |= set(json.loads(block).get("receipts") or {})
        found.append((order.index(rel) if rel in order else len(order), rel, PAGE_NAMES.get(rel, rel), ids))
    found.sort()
    pages = [[rel, name] for _, rel, name, _ in found]
    cites = {}
    for at, entry in enumerate(entries):  # keyed by place in the file: an id would triple the block
        claims = sorted(set(by_url.get(norm(entry["url"]), [])))
        used = [[i, *[c for c in claims if c in ids]] for i, (_, _, _, ids) in enumerate(found)]
        used = [u for u in used if len(u) > 1]
        if used:
            cites[str(at)] = used
    return pages, cites


# Explore the collection: the field and its bars -----------------------------------------------------------------------------------------------------

def bar(row, total, ink=None):
    """A row is a filter: its name and its bar are one link. Its count is its own link, to its claim (the prose tip, or the Sources page), since a mark may
    not sit inside the filter's link. With filters on, library.js fills the hit and the darker bar: the share of this row the filters keep."""
    name, value, label, count = row["name"], row["value"], row["label"], row["n"]
    key = '<i class="comp-key"></i>' if ink else ""
    kind = f"comp-row {ink}" if ink else "comp-row"
    noun = "entry" if count == 1 else "entries"
    return (f'<li><a class="{kind}" href="#{name}={value}" data-filter="{name}" data-value="{value}" style="--w:{count / total:.4f}">'
            f'<span class="comp-name">{key}{escape(label)}</span><span class="comp-hit" data-js></span><span class="comp-track"><i></i><b></b></span></a> '
            f'{mark(row["id"], f"""{count:,}<span class="sr-only"> {noun}</span>""", "cr comp-n")}</li>')


def group(title, rows, cls="", note=""):
    return f'<div class="comp-group{cls}"><h3>{title}</h3><ul class="comp-bars" role="list">{"".join(rows)}</ul>{note}</div>'


def composition(data, script):
    """The field with its key, the Area rows, and the Type, Year and Tribal-specific rows with what their counts leave out. One label, the form's, for the Tribal rows (critic 14)."""
    entries = data["entries"]
    total = len(entries)
    areas = words("AREAS", script)
    inks = {area: f"a{slot}" for slot, area in enumerate(areas, 1)}  # chart order, fixed: an area keeps its ink however the list is filtered
    field = "".join(f'<i class="{inks[area]}"></i>' for area in areas for entry in entries if entry["areas"][0] == area)
    updated = data["updated"]
    rows = counts(data, script)
    of = lambda name: [r for r in rows if r["name"] == name and r["value"] != "start-here"]  # Start here is a shelf, not an area (-13)
    one = lambda claim_id: next(r for r in rows if r["id"] == claim_id)
    note = (f'<p class="caption comp-note">{mark("lc-006", f"""{one("lc-006")["n"]:,}""")} entries list more than one area, so area counts add to more than {mark("lc-001", f"{total:,}")}. '
            f'Counted from <a href="../data/library.json">library.json</a>, updated {day(updated)}: what this library holds, not all that is published.</p>')
    field_block = f"""<!-- library-composition -->
          <div class="comp-field-wrap">
            <div class="unit-field comp-field" aria-hidden="true">{field}</div>
            <p class="caption">One square per entry, inked by the first area it lists. A filter dims the squares it leaves out.</p>
          </div>
          {group("Area, the key to the squares", [bar(r, total, inks[r["value"]]) for r in of("area")], " comp-key-group")}
          <!-- /library-composition -->"""
    bars_block = f"""<!-- library-legend -->
          <div class="comp-groups">
            {group("Type", [bar(r, total) for r in sorted(of("type"), key=lambda r: (-r["n"], r["value"])) if r["n"]], " comp-group-wide")}
            {group("Year", [bar(r, total) for r in of("year")])}
            {group("Tribal-specific", [bar(r, total) for r in of("tribal")], note=note)}
          </div>
          <!-- /library-legend -->"""
    return {"library-composition": field_block, "library-legend": bars_block}


def options(data, script):
    """Each select's choices, in the page from the start, so the row never resizes when library.json arrives. No counts: the bars carry them (-03)."""
    rows = counts(data, script)
    opt = lambda value, label: f'<option value="{escape(value)}">{escape(label)}</option>'
    of = lambda name: [r for r in rows if r["name"] == name and r["value"] != "start-here" and r["n"]]
    return {
        "library-options:area": opt("", "All areas") + "".join(opt(r["value"], r["label"]) for r in of("area")),
        "library-options:type": opt("", "All types") + "".join(opt(r["value"], r["label"]) for r in sorted(of("type"), key=lambda r: (-r["n"], r["value"]))),
        "library-options:year": opt("", "All years") + "".join(opt(r["value"], r["label"]) for r in of("year")),
    }


# The pages ------------------------------------------------------------------------------------------------------------------------------------------

def put(page, name, block, rel):
    """One marked block. Raises if the page has lost its markers."""
    start, end = f"<!-- {name} -->", f"<!-- /{name} -->"
    if page.count(start) != 1 or page.count(end) != 1:
        raise ValueError(f"{rel} needs one {start} block")
    head, rest = page.split(start)
    return head + (block if block.startswith(start) else start + block + end) + rest.split(end, 1)[1]


def apply(page, data, script, site=None):
    """The Library page with its room, its selects, its field and bars, and its band figures from the data."""
    site = site or PAGE.parent.parent
    entries = data["entries"]
    types, areas = words("TYPES", script), words("AREAS", script)
    groups = start_shelf(entries)
    pages, cites = citations(entries, site)
    place = {e["id"]: at for at, e in enumerate(entries)}
    held = json.dumps({"pages": pages, "cites": cites}, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    blocks = {
        **composition(data, script),
        **options(data, script),
        "library-shelf": shelf_html(groups, types, place),
        "library-static": static_html(entries, types),
        "library-preview": preview_html(groups[0][2][0], types, areas, pages, cites, place[groups[0][2][0]["id"]]),
        "library-cites": f'<script type="application/json" id="library-cites">{held}</script>',
    }
    for name, block in blocks.items():
        page = put(page, name, block, "site/library/index.html")
    figures = {
        "library": f"{len(entries):,}",
        "library-tribal": f"{sum(entry['tribal_specific'] for entry in entries):,}",
        "library-grounding": f"{sum(entry['featured'] and entry['type'] == 'resolution' for entry in entries):,}",
        "library-date": day(data["updated"]),
    }
    return FIGURE.sub(lambda match: match[1] + figures[match[2]], page)


def apply_summit(page, data, script):
    """The Summit's reading list: the grounding resolutions, then the library's Summit entries, newest first (-30). Years only: a day printed on this
    page would read as the Summit's own, which ATNI has not set."""
    types = words("TYPES", script)
    resolutions = [e for e in data["entries"] if e["featured"] and e["type"] == "resolution"]
    summit = [e for e in data["entries"] if "summit" in e["areas"] and e not in resolutions]
    block = "".join(f'<p class="entry-group" id="reading-{key}">{label}</p><ol class="entries" role="list" aria-labelledby="reading-{key}">'
                    + "".join(row(e, types, with_summary=False, year_only=True) for e in newest(items)) + "</ol>"
                    for key, label, items in (("resolutions", "The resolutions", resolutions), ("summit", "More from the library’s Summit area", summit)) if items)
    return put(page, "summit-reading", block, "site/summit/index.html")


def run(check=False):
    """Writes each page that is out of date, and returns whether any was; with check, writes nothing. A copy of the site without a Summit page skips it."""
    data = json.loads(DATA.read_text(encoding="utf-8"))
    script = SCRIPT.read_text(encoding="utf-8")
    stale = False
    for path, make in ((PAGE, lambda text: apply(text, data, script)), (PAGE.parent.parent / "summit" / "index.html", lambda text: apply_summit(text, data, script))):
        if not path.is_file() and path != PAGE:
            continue
        before = path.read_bytes().decode("utf-8")
        after = make(before)
        if after != before:
            stale = True
            if not check:
                path.write_bytes(after.encode("utf-8"))
    return stale


if __name__ == "__main__":
    checking = "--check" in sys.argv
    stale = run(check=checking)
    print(f"{'out of date' if checking and stale else 'wrote' if stale else 'nothing to do'}: site/library/index.html, site/summit/index.html")
    if checking and stale:
        sys.exit("build_library_strip: run python scripts/build_library_strip.py")
