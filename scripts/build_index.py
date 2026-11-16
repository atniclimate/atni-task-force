#!/usr/bin/env python3
"""Writes site/data/index.json, one short list of what the site publishes: each plate, each claims cluster, and each data file, with its schema, tier, and path,
and from it the site's Sources hub, site/sources/index.html, between its sources:hub markers: each page's Sources page with its plates, then every claims
file and data file. The hub is also the home page's Sources page, whose Claims Cited list scripts/pour_claim_refs.py writes.

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

PAGE_ORDER = ["ai/index.html", "data-centers/index.html", "energy/index.html"]  # the order a council reads them; other pages follow by name
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


def hub_html(site, data):
    """Each page's Sources page, in the order a council reads them, with its plates and counts; then every claims file and data file. No build date, so a
    rebuild with nothing new leaves it alone."""
    claims = bp.load_claims(site)
    receipt = lambda c: {"status": claims[c]["status"], "url": claims[c]["source"]["url"], "title": claims[c]["source"]["title"], "publisher": claims[c]["source"]["publisher"],  # noqa: E731
                         "published": bp.us_date(claims[c]["source"].get("published"))}
    shells = [p for p in sorted(site.glob("**/sources/index.html")) if p.relative_to(site).as_posix() != HUB]
    mains = sorted(((p.parent.parent / "index.html").relative_to(site).as_posix() for p in shells), key=lambda rel: (PAGE_ORDER.index(rel) if rel in PAGE_ORDER else len(PAGE_ORDER), rel))
    pages = []
    for rel in mains:
        body = (site / rel).read_text(encoding="utf-8")
        here = f"../{posixpath.dirname(rel)}/sources/"
        plates = [p for p in data["plates"] if p["page"] == rel]
        words = [f"{bp.plural(len(plates), 'plate')}; {bp.tally_words({c: receipt(c) for p in plates for c in p['claim_ids']})}"] if plates else []
        own = re.search(r"<!-- explorer:sources -->(.*?)<!-- /explorer:sources -->", (site / posixpath.dirname(rel) / "sources" / "index.html").read_text(encoding="utf-8"), re.S)
        listed = sorted(set(re.findall(r'id="src-([a-z]{2,3}-\d{3})"', own[1]))) if own else []  # the Explorer's receipts, which build_explorer.py writes before this runs
        if listed and not plates:
            words.append(bp.tally_words({c: receipt(c) for c in listed}))
        cites = len(cr.cited(body, claims))
        if cites:
            words.append(f"{bp.plural(cites, 'claim')} cited in the text.")
        if plates and plates[0]["checked"]:
            words.append(f"Sources checked {plates[0]['checked']}.")
        items = "".join(f'<li><a href="{here}#{p["id"]}">{escape(p["eyebrow"] or p["title"])}</a>, {bp.plural(len(p["claim_ids"]), "source")}</li>' for p in plates)
        name = unescape(TITLE.search(body)[1]) if TITLE.search(body) else rel
        pages.append(f'<li><p class="plate-source-title"><a href="{here}">{escape(name)}</a></p><p class="caption">{escape(" ".join(words))}</p>'
                     f'{f"<ul>{items}</ul>" if items else ""}</li>')
    clusters = data["claims"]
    total = {k: sum(c[k] for c in clusters) for k in ("count", "verified", "partly")}
    cluster_rows = "".join(f'<tr><th scope="row"><a href="../{c["path"]}">{escape(posixpath.basename(c["path"]))}</a></th><td>{c["count"]:,}</td><td>{c["verified"]:,}</td><td>{c["partly"]:,}</td></tr>' for c in clusters)
    data_rows = "".join(f'<tr><th scope="row"><a href="../{d["path"]}">{escape(d["path"].removeprefix("data/"))}</a></th><td>{escape(d["built_by"] or "by hand")}</td></tr>' for d in data["data"])
    return (f'<section id="pages" aria-labelledby="pages-title"><h2 id="pages-title">Sources by Page</h2><ul class="plate-sources">{"".join(pages)}</ul></section>\n'
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
