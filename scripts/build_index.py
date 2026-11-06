#!/usr/bin/env python3
"""Writes site/data/index.json, one short list of what the site publishes: each plate, each claims cluster, and each data file, with its schema, tier, and path.

The briefing, the share cards, the offline recipes, and scripts/validate_public.py read it. It reads the built pages, so run it after scripts/build_plates.py:
   python scripts/build_index.py          # write
   python scripts/build_index.py --check  # write nothing; exit 1 if it is out of date

A plate's "checked" is the date its page's band gives as "Sources checked". A page with no such figure gets the latest published date among the plate's claims, its dataset's own date.
"built" moves only when something else in the file changed, so a rebuild on a later day with nothing new leaves the file alone.
"""
from datetime import date
from html import unescape
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import build_plates as bp  # noqa: E402
import validate_public as vp  # noqa: E402

PAGE_ORDER = ["ai/index.html", "data-centers/index.html", "energy/index.html"]  # the order a council reads them; other pages follow by name
BAND_CHECKED = re.compile(r'<span class="figure-num">([^<]*)</span>\s*<span class="figure-label">Sources checked</span>')
BUILT_BY = {
    "library.json": "scripts/merge_library.py", "energy-potential.json": "scripts/energy_potential.py", "energy-potential.csv": "scripts/energy_potential.py",
    "energy-funding.json": "scripts/energy_funding.py", "policy-watch.json": "scripts/policy_watch.py", "comparison-model.json": "a local evidence file, copied here by hand",
    "resource-model.json": "scripts/resource_model.py", "resource-model-inputs.csv": "scripts/resource_model.py", "whats-new.json": "scripts/build_whats_new.py",
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


def run(site=vp.SITE, check=False):
    """Writes the file if it is out of date and returns True if it was."""
    site = Path(site)
    path = site / "data" / "index.json"
    fresh = manifest(site)
    if path.is_file():
        old = json.loads(path.read_text(encoding="utf-8"))
        if {**old, "built": fresh["built"]} == fresh:
            return False
    if not check:
        path.write_text(text_of(fresh), encoding="utf-8", newline="\n")
    return True


if __name__ == "__main__":
    checking = "--check" in sys.argv
    try:
        stale = run(check=checking)
    except ValueError as error:
        sys.exit(f"build_index: {error}")
    print(json.dumps({"out_of_date" if checking else "written": stale}))
    if checking and stale:
        sys.exit("build_index: run python scripts/build_index.py")
