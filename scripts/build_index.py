#!/usr/bin/env python3
"""Writes site/data/index.json, one short list of what the site publishes: each plate, each claims cluster, and each data file, with its schema, tier, and path,
and from it the site's Sources hub, site/sources/index.html, between its sources:hub markers (DIRECTION-R2 3.15): the site's census of distinct claims, a row
for each page with a Sources page (and home) with its plates, figures, distinct claims, documents, and statuses; what the marks mean; the terms the pages
link to (#term-KEY, from GLOSSARY in scripts/pour_claim_refs.py); then every claims file and data file. The hub is also the home page's Sources page, whose
Figures in the Text list scripts/pour_claim_refs.py writes.

The briefing, the share cards, the offline recipes, and scripts/validate_public.py read it. It reads the built pages, so run it after scripts/build_plates.py
and scripts/build_explorer.py:
   python scripts/build_index.py          # write
   python scripts/build_index.py --check  # write nothing; exit 1 if either is out of date

A plate's "checked" is the date its page's band gives as "Sources checked". A page with no such figure gets the latest published date among the plate's claims, its dataset's own date.
"built" moves only when something else in the file changed, so a rebuild on a later day with nothing new leaves the file alone.
"""
from datetime import date
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

HUB = "sources/index.html"
TITLE = re.compile(r"<title>(.*?)(?: \| [^<]*)?</title>", re.S)

# Each page by the name the nav and its own brief give it, so the hub, the nav and home's list agree (home critic 15, system 18); a page not named here keeps its title.
NAMES = {"index.html": "Home", "ai/index.html": "AI", "data-centers/index.html": "Data Centers", "data-centers/resource-use/index.html": "Energy and Water Use",
         "energy/index.html": "Tribal Energy", "energy/funding/index.html": "Tribal Energy: Funding", "energy/potential/index.html": "Tribal Energy: What Tribal plans say",
         "explorer/index.html": "Explorer", "library/index.html": "Library", "ai/markets/index.html": "AI and the Markets"}
EXPLORER_PLATE = re.compile(r'<section class="sources-plate" id="(?P<id>[\w-]+)"[^>]*>(?:<p class="eyebrow">[^<]*</p>)?<h3[^>]*>(?P<title>.*?)</h3>', re.S)
PAGE_ORDER = ["ai/index.html", "ai/markets/index.html", "data-centers/index.html", "energy/index.html"]  # the order a council reads them; other pages follow by name
BAND_CHECKED = re.compile(r'<span class="figure-num">([^<]*)</span>\s*<span class="figure-label">Sources checked</span>')
BUILT_BY = {
    "library.json": "scripts/merge_library.py", "energy-potential.json": "scripts/energy_potential.py", "energy-potential.csv": "scripts/energy_potential.py",
    "energy-funding.json": "scripts/energy_funding.py", "policy-watch.json": "scripts/policy_watch.py", "comparison-model.json": "a local evidence file, copied here by hand",
    "resource-model.json": "scripts/resource_model.py", "resource-model-inputs.csv": "scripts/resource_model.py", "whats-new.json": "scripts/build_whats_new.py",
    "climate-regions.json": "scripts/climate_regions.py", "projects.json": "a local recheck of every source page, copied here",
}


def us_day(iso=None):
    day = iso or date.today().isoformat()
    return f"{day[5:7]}/{day[8:10]}/{day[:4]}"


def plate_block(page, plate_id):
    """The data block and the title a plate's page holds, as the build wrote them."""
    match = dict(vp.PLATE_BLOCK.findall(page)).get(plate_id)
    title = re.search(rf'<h3 class="plate-title" id="{re.escape(plate_id)}-title">(.*?)</h3>', page, re.S)
    if match is None or title is None:
        raise ValueError(f"{plate_id} is not built into its page: run python scripts/build_plates.py")
    return json.loads(match), unescape(title[1])


def checked_of(page, claim_ids, claims):
    band = BAND_CHECKED.search(page)
    if band:
        return band[1].strip()
    days = [claims[c]["source"].get("published") or "" for c in claim_ids if c in claims]
    days = [d for d in days if len(d) == 10]
    return us_day(max(days)) if days else None


def plates(site, claims):
    out = []
    for path in (site / "data" / "plates").glob("*.json"):
        defn = json.loads(path.read_text(encoding="utf-8"))
        page = (site / defn["page"]).read_text(encoding="utf-8")
        data, title = plate_block(page, defn["id"])
        out.append((page.find(f"<!-- plate:{defn['id']} -->"), {
            "id": defn["id"], "page": defn["page"], "eyebrow": defn.get("eyebrow"), "title": title, "kind": defn["plot"]["type"],
            "controls": [{"name": c["name"], "type": c["type"], "default": bp.control_default(c)} for c in defn.get("controls") or []],
            "claim_ids": list(data.get("receipts") or {}), "checked": checked_of(page, data.get("receipts") or {}, claims), "path": f"data/plates/{path.name}",
        }))
    rank = lambda item: (PAGE_ORDER.index(item[1]["page"]) if item[1]["page"] in PAGE_ORDER else len(PAGE_ORDER), item[1]["page"], item[0])
    return [entry for _, entry in sorted(out, key=rank)]


def clusters(site):
    out = []
    for path in sorted((site / "data" / "claims").glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        if vp.is_model(data):
            continue
        statuses = [c.get("status") for c in data.get("claims") or []]
        out.append({"cluster": data.get("cluster") or path.stem, "path": f"data/claims/{path.name}", "count": len(statuses), "verified": statuses.count("verified"), "partly": statuses.count("partly")})
    return out


def data_files(site):
    """The files directly in data/ and any model filed with the claims. Plates and claims have their own lists; data/policy-sentinel/ holds that tool's own export format."""
    out = []
    paths = [*sorted((site / "data").glob("*.json")), *sorted((site / "data").glob("*.csv")), *[p for p in sorted((site / "data" / "claims").glob("*.json")) if vp.is_model(json.loads(p.read_text(encoding="utf-8")))]]
    for path in paths:
        if path.name == "index.json":
            continue
        head = json.loads(path.read_text(encoding="utf-8")) if path.suffix == ".json" else {}
        out.append({"path": path.relative_to(site).as_posix(), "schema": head.get("schema"), "tier": head.get("tier"), "built_by": BUILT_BY.get(path.name)})  # the file's own word or none: library.json states its tier per entry, which the validator checks one by one, and a CSV states none
    return out


def manifest(site):
    claims = bp.load_claims(site)
    return {"schema": 1, "tier": "T0", "built": us_day(), "plates": plates(site, claims), "claims": clusters(site), "data": data_files(site)}


def text_of(data):
    """One entry to a line, so a change reads as one line in a diff."""
    head = ", ".join(f"{json.dumps(k)}: {json.dumps(data[k])}" for k in ("schema", "tier", "built"))
    lists = ",\n".join(f'{json.dumps(k)}: [\n' + ",\n".join(json.dumps(item, ensure_ascii=False) for item in data[k]) + "\n]" for k in ("plates", "claims", "data"))
    return "{" + head + ",\n" + lists + "\n}\n"


MARKS = ("Every figure on this site carries a claim id and one of two statuses.",
         (("v", "Verified, a full square: the figure was checked against its source."),
          ("p", "Partly verified, a half-filled square: the source supports the figure with a limit, and the limit goes with the figure, in the plate's Reading, "
                "its card, and its Sources page.")),
         "On a plate, a filled mark is measured or reported and a hollow one is modeled; a hatched bar runs past the plate's scale, with its figure printed.")


def status_bar(verified, partly, cls="census-bar"):
    """The verified and partly verified split as one bar for the eye; the words or the table beside it hold the numbers."""
    parts = "".join(f'<span class="census-{k}" style="flex-grow:{n}"></span>' for k, n in (("v", verified), ("p", partly)) if n)
    return f'<span class="{cls}" aria-hidden="true">{parts}</span>'


def hub_html(site, data):
    """The site's census (DIRECTION-R2 3.15); a row for each page with a Sources page, and home, whose figures in the text this page lists, in the order a
    council reads them: its plates, its figures (each plate's and each mark in the text), its distinct claims and documents, and how they were checked;
    what the marks mean; every claims file and data file; and the terms the pages link to. It counts documents and distinct claims, never copies: the
    Briefing's copies of plates have no row, and a copy on a page (data-copy-of, as home's faces) counts on the page it comes from. No build date, so a
    rebuild with nothing new leaves it alone."""
    claims = bp.load_claims(site)
    receipt = lambda c: {"status": claims[c]["status"], "url": claims[c]["source"]["url"], "title": claims[c]["source"]["title"], "publisher": claims[c]["source"]["publisher"],  # noqa: E731
                         "published": bp.us_date(claims[c]["source"].get("published"))}
    shells = [p for p in sorted(site.glob("**/sources/index.html")) if p.relative_to(site).as_posix() != HUB]
    mains = sorted(((p.parent.parent / "index.html").relative_to(site).as_posix() for p in shells), key=lambda rel: (PAGE_ORDER.index(rel) if rel in PAGE_ORDER else len(PAGE_ORDER), rel))
    rows, every = [], set()
    for rel in ["index.html", *mains]:
        if not (site / rel).is_file():
            continue
        body = cr.without_copies((site / rel).read_text(encoding="utf-8"))
        here = "#claims-cited" if rel == "index.html" else f"../{posixpath.dirname(rel)}/sources/"
        plates = [p for p in data["plates"] if p["page"] == rel]
        own = re.search(r"<!-- explorer:sources -->(.*?)<!-- /explorer:sources -->", (site / posixpath.dirname(rel) / "sources" / "index.html").read_text(encoding="utf-8"), re.S) if rel != "index.html" else None
        listed = sorted(set(re.findall(r'id="src-([a-z]{2,3}-\d{3})"', own[1]))) if own else []  # the Explorer's receipts, which build_explorer.py writes before this runs
        cites = [c for c in cr.cited(body, claims) if c in claims]
        figures = sum(len(p["claim_ids"]) for p in plates) + len(cites) + (len(listed) if not plates else 0)
        distinct = {c for p in plates for c in p["claim_ids"]} | set(cites) | set(listed)
        if not distinct:
            continue
        every |= distinct
        verified = sum(claims[c]["status"] == "verified" for c in distinct)
        docs = len({bp.doc_key(receipt(c)) for c in distinct})
        name = NAMES.get(rel) or (unescape(TITLE.search(body)[1]) if TITLE.search(body) else rel)
        # A plate is named by its title to the first comma or semicolon, not by an eyebrow such as "Jobs" (system critic 10); the Explorer's plates are its own
        # Sources page's sections, which build_explorer.py writes (system critic 15).
        named = [(p["id"], p["title"]) for p in plates] or ([(m["id"], unescape(re.sub(r"<[^>]+>", "", m["title"]))) for m in EXPLORER_PLATE.finditer(own.string)] if own else [])
        asked = {m["plate"]: " ".join(unescape(re.sub(r"<[^>]+>", "", m["q"])).split()) for m in bp.QUESTION.finditer(body)}  # a face's agenda question, as its Sources rail says it
        items = "".join(f'<li><a href="{here}#{plate}">{escape(asked.get(plate) or re.split(r"[,;:] ", title, maxsplit=1)[0])}</a></li>' for plate, title in named)
        items = f'<ul class="hub-plates">{items}</ul>' if items else ""
        copies = len({c for c in re.findall(r'data-copy-of="[^"#]*#([\w-]+)"', (site / rel).read_text(encoding="utf-8")) if any(p["id"] == c for p in data["plates"])}) if rel == "index.html" else 0
        if copies:  # home shows copies of other pages' plates, which count there
            items += f'<p class="caption">{bp.plural(copies, "plate")} shown as copies, counted on their own pages.</p>'
        stamp = re.search(r"<!-- explorer:checked -->.*?(\d{2}/\d{2}/\d{4})", own.string, re.S) if own else None  # the Explorer's own Sources page says when
        when = plates[0]["checked"] if plates and plates[0]["checked"] else stamp[1] if stamp else None
        checked = f'<p class="caption">Sources checked {escape(when)}.</p>' if when else ""
        rows.append(f'<tr><th scope="row"><a class="hub-page" href="{here}">{escape(name)}</a>{status_bar(verified, len(distinct) - verified, "census-bar is-row")}{checked}{items}</th>'
                    f'<td>{len(plates) or len(named):,}</td><td>{figures:,}</td><td>{len(distinct):,}</td><td>{docs:,}</td><td>{verified:,}</td><td>{len(distinct) - verified:,}</td></tr>')
    verified = sum(claims[c]["status"] == "verified" for c in every)
    docs = {bp.doc_key(receipt(c)) for c in every}
    publishers = {claims[c]["source"]["publisher"] for c in every}
    census = (f'<div class="census" id="census"><p class="census-line">{bp.plural(len(every), "distinct claim")} behind the figures on these pages, from '
              f'{bp.plural(len(docs), "document")} and {bp.plural(len(publishers), "publisher")}.</p>{status_bar(verified, len(every) - verified)}'
              f'<p class="census-key"><span><span class="st st-v"></span> <b>{verified:,}</b> verified</span><span><span class="st st-p"></span> <b>{len(every) - verified:,}</b> partly verified</span></p></div>')
    head = "".join(f'<th scope="col">{label}</th>' for label in ("Page", "Plates", "Figures", "Distinct claims", "Documents", "Verified", "Partly verified"))
    pages = (f'<section id="pages" aria-labelledby="pages-title"><h2 id="pages-title">Sources by Page</h2>{census}'
             '<p class="caption">A figure is counted once on each plate and once in the text that prints it; distinct claims and documents are counted once a page.</p>'
             f'<div class="table-scroll" tabindex="0" role="group" aria-label="Sources by page"><table class="data-table hub-pages"><thead><tr>{head}</tr></thead>'
             f'<tbody>{"".join(rows)}</tbody></table></div></section>\n')
    marks = (f'<section id="marks" aria-labelledby="marks-title"><h2 id="marks-title">What the Marks Mean</h2><p>{escape(MARKS[0])}</p><ul class="hub-marks">'
             + "".join(f'<li><span class="st st-{k}"></span> {escape(words)}</li>' for k, words in MARKS[1]) + f'</ul><p>{escape(MARKS[2])}</p></section>\n')
    terms = "".join(f'<dt id="term-{key}">{escape(name)}</dt><dd>{escape(words)}</dd>' for key, (name, words) in sorted(cr.GLOSSARY.items(), key=lambda kv: kv[1][0].casefold()))
    glossary = (f'<section id="terms" aria-labelledby="terms-title"><h2 id="terms-title">Terms</h2>'
                f'<p class="caption">The words the pages link here, as this site uses them.</p><dl class="glossary">{terms}</dl></section>\n')
    clusters = data["claims"]
    total = {k: sum(c[k] for c in clusters) for k in ("count", "verified", "partly")}
    cluster_rows = "".join(f'<tr><th scope="row"><a href="../{c["path"]}">{escape(posixpath.basename(c["path"]))}</a></th><td>{c["count"]:,}</td><td>{c["verified"]:,}</td><td>{c["partly"]:,}</td></tr>' for c in clusters)
    data_rows = "".join(f'<tr><th scope="row"><a href="../{d["path"]}">{escape(d["path"].removeprefix("data/"))}</a></th><td>{escape(d["built_by"] or "by hand")}</td></tr>' for d in data["data"])
    return (pages + marks + glossary +
            f'<section id="claim-files" aria-labelledby="claim-files-title"><h2 id="claim-files-title">Claims Files</h2>'
            f'<p class="caption">{bp.plural(total["count"], "claim")} in {bp.plural(len(clusters), "file")}: {total["verified"]:,} verified and {total["partly"]:,} partly verified.</p>'
            '<div class="table-scroll" tabindex="0" role="group" aria-label="Claims files"><table class="data-table source-claims"><thead><tr><th scope="col">File</th><th scope="col">Claims</th>'
            f'<th scope="col">Verified</th><th scope="col">Partly verified</th></tr></thead><tbody>{cluster_rows}</tbody></table></div></section>\n'
            '<section id="data-files" aria-labelledby="data-files-title"><h2 id="data-files-title">Data Files</h2>'
            '<div class="table-scroll" tabindex="0" role="group" aria-label="Data files"><table class="data-table source-claims"><thead><tr><th scope="col">File</th><th scope="col">Built by</th></tr></thead>'
            f'<tbody>{data_rows}</tbody></table></div></section>')


def run(site=vp.SITE, check=False):
    """Writes the manifest and the hub where either is out of date, and returns True if one was."""
    site = Path(site)
    path = site / "data" / "index.json"
    fresh = manifest(site)
    stale = True
    if path.is_file():
        stale = {**json.loads(path.read_text(encoding="utf-8")), "built": fresh["built"]} != fresh
    if stale and not check:
        path.write_text(text_of(fresh), encoding="utf-8", newline="\n")
    hub = site / HUB
    if hub.is_file():
        old = hub.read_bytes().decode("utf-8")
        new = bp.region(old, "sources:hub", hub_html(site, fresh), HUB)
        if new != old:
            stale = True
            if not check:
                hub.write_bytes(new.encode("utf-8"))
    return stale


if __name__ == "__main__":
    checking = "--check" in sys.argv
    try:
        stale = run(check=checking)
    except (ValueError, bp.BuildError) as error:
        sys.exit(f"build_index: {error}")
    print(json.dumps({"out_of_date" if checking else "written": stale}))
    if checking and stale:
        sys.exit("build_index: run python scripts/build_index.py")
