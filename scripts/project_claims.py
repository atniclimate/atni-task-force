"""Claims (pj-, ld-, pc-) and the plates for where named proposals sit (Data Centers, Land tab), from site/data/projects.json. Standard library only.

    python -B scripts/project_claims.py
    then python scripts/build_plates.py --export-claims projects

Reads   site/data/projects.json (rebuilt by the N6 recheck under work/site-refresh/n6/build/, which reads the cached source pages)
Writes  work/site-refresh/evidence/projects.json   the evidence file, cluster "projects"
        site/data/plates/dc-project-land.json          the land-class plate
        site/data/plates/dc-project-map.json           the county map plate (its drawing comes from scripts/build_project_map.py)
pj-NNN  one claim per record that states a MW figure: the figure as the named source prints it. A record with no MW gets no claim.
ld-NNN  the counts per land row and kind the plate shows, computed from projects.json with the arithmetic in `derived`. No MW sums: a sum
        of load requests and nameplate across bases would read as one quantity, and each record's own MW is in the record list with its claim.
pc-NNN  one count per county the records name, numbered in FIPS order (a claim id is three digits, so a FIPS code cannot be the id).
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROJECTS = ROOT / "site" / "data" / "projects.json"
PLATE_OUT = ROOT / "site" / "data" / "plates" / "dc-project-land.json"
MAP_OUT = ROOT / "site" / "data" / "plates" / "dc-project-map.json"
EVIDENCE_OUT = ROOT / "work" / "site-refresh" / "evidence" / "projects.json"
STATE_NAMES = {"WA": "Washington", "OR": "Oregon", "ID": "Idaho", "MT": "Montana", "NV": "Nevada", "CA": "California"}  # the record list's order, north and west first
KIND_SAY = {"data center": "a data center", "generation": "generation", "storage": "storage", "transmission": "a transmission line", "substation": "a substation"}
MAP_DEFAULT = "morrow-or"  # the map plate's title names this county as holding the most records; mint() fails if that stops being true
OWN = "https://atniclimate.github.io/atni-task-force/"
ROWS = [  # (row id, label, class, extent)
    ("federal-blm", "BLM public land, the site itself", "federal-blm", "whole"),
    ("federal-blm-route", "BLM-managed land along a line's route", "federal-blm", "route"),
    ("federal-doe", "A U.S. Department of Energy site", "federal-doe", None),
    ("federal-offshore", "A federal offshore lease", "federal-offshore", None),
    ("state-permitted", "A state siting docket", "state-permitted", None),
    ("county-permitted", "A county or city land-use action", "county-permitted", None),
    ("tribal-as-stated", "Land the source calls Tribal or Trust land", "tribal-as-stated", None),
    ("not-stated", "Not stated by the sources read", "not-stated", None),
]
STOPS = [("all", "All kinds", None), ("dc", "Data centers", {"data center"}), ("gs", "Generation and storage", {"generation", "storage"}),
         ("tx", "Transmission and substations", {"transmission", "substation"})]
KIND_WORDS = {"all": "all kinds", "dc": "data centers", "gs": "generation and storage", "tx": "transmission and substations"}
PJ_LIMIT = "MW as that source states it; bases differ (nameplate, load request, press report) and a request or an application is not an approval."
LD_LIMIT = "A count of a curated public list on its date: what the filings read say, not every proposal in the region."
PJ_BOUNDARY = ("Counted: the figure the named source prints for this project on its date. Not counted: any other source's figure, or a battery that a source lists beside generation. "
               "A request or an application is not an approval.")
PC_BOUNDARY = "Counted: named records in projects.json whose sources name this county on 11/05/2026; a county the filing names, not the site."


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def named_counties(projects):
    """The counties the records name, in the record list's order (by state, then as projects.json first names them), each keyed as
    dc-climate-counties keys its rows ("morrow-or"), with the ids of the records that name it."""
    named = {}
    for p in projects:
        for c in p["counties"]:
            n = named.setdefault(c["fips"], {"fips": c["fips"], "key": f"{slug(c['name'])}-{c['state'].lower()}", "name": c["name"], "state": c["state"], "ids": []})
            if p["id"] not in n["ids"]:
                n["ids"].append(p["id"])
    return sorted(named.values(), key=lambda n: list(STATE_NAMES).index(n["state"]))  # a stable sort keeps the file's order within a state


def pc_ids(counties):
    """County FIPS -> pc claim id, numbered in FIPS order."""
    return {n["fips"]: f"pc-{i:03d}" for i, n in enumerate(sorted(counties, key=lambda n: n["fips"]), 1)}


def row_of(p):
    cls, ext = p["land"]["class"], p["land"]["extent"]
    for rid, _label, c, e in ROWS:
        if c == cls and (e is None or e == ext or (cls == "federal-blm" and e == "route" and ext != "whole")):
            return rid
    raise SystemExit(f"{p['id']}: no row for {cls}/{ext}")


def pj_ids(projects):
    """Record id -> pj claim id, numbered in file order over the records that state a MW figure."""
    return {p["id"]: f"pj-{n:03d}" for n, p in enumerate((p for p in projects if p["mw_claim"]), 1)}


def counts(projects):
    """(row, stop) -> the records in it; row "total" is every record."""
    out = {}
    for rid in [r[0] for r in ROWS] + ["total"]:
        for stop, _label, kinds in STOPS:
            out[(rid, stop)] = [p for p in projects if (rid == "total" or row_of(p) == rid) and (kinds is None or p["kind"] in kinds)]
    return out


def mint(d):
    projects = d["projects"]
    claims, pj = [], pj_ids(projects)
    for p in projects:
        mc = p["mw_claim"]
        if not mc:
            continue
        s = p["sources"][mc["source"]]
        c = {"id": pj[p["id"]], "entity": p["name"], "metric": "MW as filed", "value": p["mw"], "low": None, "high": None, "unit": "MW", "year": int(p["status_date"][:4]),
             "boundary": PJ_BOUNDARY, "source": {"title": s["title"], "publisher": s["publisher"], "url": s["url"], "published": s["date"], "kind": s["kind"]},
             "quote": mc["quote"], "derived": mc["derived"] or f"Figure as printed. Basis: {p['mw_basis']}.", "status": mc["status"], "record": p["id"]}
        if mc["status"] == "partly":
            c["limit"] = PJ_LIMIT + f" Basis here: {p['mw_basis']}." + (f" {p['limit']}" if p["limit"] else "")
        elif p["limit"]:
            c["limit"] = p["limit"]  # a verified figure's caveat, from the same public pages, travels with its receipt
        claims.append(c)
    src = {"title": "ATNI Energy Task Forces named proposals: public dataset (projects.json)", "publisher": "ATNI Energy Task Forces", "url": f"{OWN}data/projects.json",
           "published": "2026-11-05", "kind": "dataset"}
    boundary = ("Counted: named records in projects.json whose filing states this land row and kind on 11/05/2026. Not counted: BPA queue rows without a project name, items below the "
                "thresholds, withdrawn items, and anything the filings read do not name.")
    labels = {**{r[0]: r[1] for r in ROWS}, "total": "All named proposals"}
    members, ld, k = counts(projects), {}, 0
    for rid, stop in [("total", s[0]) for s in STOPS] + [(r[0], s[0]) for r in ROWS for s in STOPS]:
        ms = members[(rid, stop)]
        if not ms:
            continue
        k += 1
        ld[(rid, stop)] = cid = f"ld-{k:03d}"
        claims.append({"id": cid, "entity": f"Named proposals: {labels[rid] if rid != 'total' else 'all land rows'}", "metric": f"named projects ({KIND_WORDS[stop]})",
                       "value": len(ms), "low": None, "high": None, "unit": "projects", "year": 2026, "boundary": boundary, "source": src, "quote": '"built": "11/05/2026"',
                       "derived": f"Count of records in projects.json (built 11/05/2026) on the land row “{labels[rid]}”, {KIND_WORDS[stop]}: {len(ms)} ({', '.join(p['id'] for p in ms)}).",
                       "status": "partly", "limit": LD_LIMIT})
    counties = named_counties(projects)
    most = max(len(n["ids"]) for n in counties)
    if [n["key"] for n in counties if len(n["ids"]) == most] != [MAP_DEFAULT]:
        raise SystemExit(f"the map plate's title says {MAP_DEFAULT} holds the most named proposals, and the records no longer say so: reword its title")
    pc = pc_ids(counties)
    for n in sorted(counties, key=lambda n: n["fips"]):
        where = f"{n['name']} County, {n['state']}"
        claims.append({"id": pc[n["fips"]], "entity": f"Named proposals: {where}", "metric": "named projects whose sources name this county", "value": len(n["ids"]),
                       "low": None, "high": None, "unit": "projects", "year": 2026, "boundary": PC_BOUNDARY, "source": src, "quote": '"built": "11/05/2026"',
                       "derived": f"Count of records in projects.json (built 11/05/2026) whose counties include {where} (FIPS {n['fips']}): {len(n['ids'])} ({', '.join(n['ids'])}).",
                       "status": "partly", "limit": LD_LIMIT})
    return claims, ld, members


def plate(ld, members):
    top = max(len(members[(r[0], "all")]) for r in ROWS)
    return {
        "schema": 1, "tier": "T0", "id": "dc-project-land", "page": "data-centers/index.html", "fit": True,
        "eyebrow": "Named proposals in public filings, read 11/05/2026",
        "title": f"The filings read put {{c[{ld[('federal-blm', 'all')]}][value]:.0f}} of {{c[{ld[('total', 'all')]}][value]:.0f}} named proposals on BLM public land",
        "subtitle": "Land as each filing states it. No parcel outline yet, and no owner of record.",
        "text": ["A request or an application is not an approval. Each bar counts proposals whose public filing states that kind of land; a filing that says nothing is counted as not stated."],
        "controls": [{"type": "segmented", "name": "kind", "label": "Kind", "default": "all", "options": [{"value": s[0], "label": s[1]} for s in STOPS]}],
        "by": "kind",
        "plot": {"type": "ladder", "units": {"projects": ""}, "groups": [{"id": "land", "label": "Named proposals", "mark": "bar", "domain": [0, -(-(top + 1) // 10) * 10]}]},
        "default": "federal-blm",
        "boundary": "What public filings say about where a proposal sits. Not a title record and not an ownership finding; on Tribal or Trust land, only the source's own words.",
        "reading": ("{label}: {display} of the named proposals read ({kind}), by the public documents read on 11/05/2026. The class is the filing's own wording, "
                    "not a title search; a request or an application is not an approval."),
        "not_counted": "None of the named proposals read sits here",
        "details": ["The one parcel number a public notice prints is in the record list; no outline is drawn until a county's parcel file is captured and its terms allow it.",
                    "Developers are named as the filing names them, never from an assessor's owner field.",
                    "BLM public land, the site itself: the filing says the facility is on BLM land. BLM-managed land along a line's route: a record or decision of the Bureau of "
                    "Land Management covers a right-of-way for a line, without saying how much of the route.",
                    "The one record on land a source calls Tribal or Trust land is worded as that source words it."],
        "foot": [{"text": "Every record, its sources, and the quotes they rest on:", "href": "../data/projects.json", "link": "projects.json"},
                 {"href": "#dc-project-map", "link": "The county map"}],
        "rows": [{"id": rid, "label": label, "group": "land", "claims": {stop: ld.get((rid, stop)) for stop, _l, _k in STOPS}} for rid, label, _c, _e in ROWS],
    }


def map_plate(d, ld):
    """The county map: one tile a county, its count inside. Rows run in the record list's order, which is the order the arrow keys walk.
    The drawing is scripts/build_project_map.py's sprite in the page; build_plates.py draws the plot from it. measures.records names each county's
    records for the facts beside the plot, every MW figure as its pj- claim, which the row cites."""
    projects = d["projects"]
    counties, pj, by_id = named_counties(projects), pj_ids(projects), {p["id"]: p for p in projects}
    pc = pc_ids(counties)
    lead = next(n for n in counties if n["key"] == MAP_DEFAULT)
    rows = []
    for n in counties:
        row = {"id": n["key"], "label": f"{n['name']} County, {n['state']}", "claim": pc[n["fips"]]}
        if any(i in pj for i in n["ids"]):
            row["cites"] = [pj[i] for i in n["ids"] if i in pj]
        rows.append({**row, "cols": {"county": f"{n['name']} County", "state": STATE_NAMES[n["state"]]}})
    return {
        "schema": 1, "tier": "T0", "id": "dc-project-map", "page": "data-centers/index.html", "fit": True,
        "eyebrow": "Named proposals in public filings, read 11/05/2026",
        "title": f"{lead['name']} County, {lead['state']} holds {{c[{pc[lead['fips']]}][value]:.0f}} of {{c[{ld[('total', 'all')]}][value]:.0f}} named proposals, the most of any county",
        "subtitle": "The county a filing names, never the site. One square a county, its count inside.",
        "text": ["A request or an application is not an approval. A square sits inside the county it counts; a square that moved to clear a neighbour keeps a line back to its county."],
        "plot": {"type": "map", "units": {"projects": ""}},
        "default": MAP_DEFAULT,
        "reading": ("{label}: {display} of the named proposals read sit in filings that name this county, by the public documents read on 11/05/2026. "
                    "The county a filing names, not the site; a request or an application is not an approval."),
        "foot": [{"href": "#land-records", "link": "Every record, by state"}, {"href": "../data/projects.json", "link": "projects.json"}],
        "table": {"columns": [{"label": "County", "field": "county"}, {"label": "State", "field": "state"}, {"label": "Records", "field": "display"}, {"label": "Claims", "field": "claims"}]},
        "rows": rows,
        "measures": {"records": {n["key"]: [[by_id[i]["name"], KIND_SAY[by_id[i]["kind"]], pj.get(i)] for i in n["ids"]] for n in counties}},
    }


def main():
    d = json.loads(PROJECTS.read_text(encoding="utf-8"))
    claims, ld, members = mint(d)
    assert sum(len(members[(r[0], "all")]) for r in ROWS) == len(d["projects"]) == len(members[("total", "all")]), "land rows must add to the record count"
    for rid in [r[0] for r in ROWS] + ["total"]:
        assert sum(len(members[(rid, s)]) for s in ("dc", "gs", "tx")) == len(members[(rid, "all")]), f"{rid}: kinds must add to all"
    EVIDENCE_OUT.parent.mkdir(parents=True, exist_ok=True)
    EVIDENCE_OUT.write_text(json.dumps({"cluster": "projects", "tier": "T0", "schema": 1, "claims": claims}, indent=1, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    PLATE_OUT.write_text(json.dumps(plate(ld, members), indent=1, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    MAP_OUT.write_text(json.dumps(map_plate(d, ld), indent=1, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"claims": len(claims), "pj": sum(c["id"].startswith("pj-") for c in claims), "ld": sum(c["id"].startswith("ld-") for c in claims),
                      "pc": sum(c["id"].startswith("pc-") for c in claims), "rows": {r[0]: len(members[(r[0], "all")]) for r in ROWS}, "records": len(d["projects"])}))


if __name__ == "__main__":
    main()
