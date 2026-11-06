"""Named proposals and where they sit: the shipped records pass the validator, the counts add up, the claims match the records, and the map
puts each square inside its county (and, with the Census file at hand, Walla Walla inside Washington)."""
import json
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_project_map as bpm  # noqa: E402
import project_claims as pc  # noqa: E402
import validate_public as vp  # noqa: E402

DATA = json.loads(pc.PROJECTS.read_text(encoding="utf-8"))
SHIPPED = {c["id"]: c for c in json.loads((ROOT / "site" / "data" / "claims" / "projects.json").read_text(encoding="utf-8"))["claims"]}
SVG = bpm.SVG_OUT.read_text(encoding="utf-8")


def test_records_pass_the_validator():
    errors = []
    vp.check_projects(errors)
    assert errors == []


def test_counts_add_up():
    members = pc.counts(DATA["projects"])
    assert sum(len(members[(r[0], "all")]) for r in pc.ROWS) == len(DATA["projects"]) == len(members[("total", "all")])
    for rid in [r[0] for r in pc.ROWS] + ["total"]:
        assert sum(len(members[(rid, s)]) for s in ("dc", "gs", "tx")) == len(members[(rid, "all")]), rid


def test_claims_match_the_records():
    minted, _ld, _m = pc.mint(DATA)
    assert [c["id"] for c in minted] == list(SHIPPED), "rerun scripts/project_claims.py, then export the projects cluster"
    for c in minted:
        assert (SHIPPED[c["id"]]["value"], SHIPPED[c["id"]]["status"]) == (c["value"], c["status"]), c["id"]
    assert sum(cid.startswith("pj-") for cid in SHIPPED) == sum(p["mw"] is not None for p in DATA["projects"])
    assert all(SHIPPED[c].get("limit") for c in SHIPPED if SHIPPED[c]["status"] == "partly")


def test_map_is_small_self_contained_and_marks_every_county_record():
    assert len(SVG.encode("utf-8")) <= 40 * 1024
    assert not re.search(r"https?://|<script|<image|xlink:href|@import|font-family", SVG.replace('xmlns="http://www.w3.org/2000/svg"', ""))
    assert set(re.findall(r'data-id="([A-Z]{2}-[A-Z]+-\d+)"', SVG)) == {p["id"] for p in DATA["projects"] if p["counties"]}
    page = bpm.PAGE.read_text(encoding="utf-8")
    assert SVG.strip() in page, "rerun scripts/build_project_map.py"


def rings_of(d):
    """The absolute rings of a path written as M x,y then relative l dx,dy steps, closed by z."""
    out = []
    for part in re.findall(r"M[^Mz]+z", d):
        nums = [float(n) for n in re.findall(r"-?\d+(?:\.\d+)?", part)]
        x, y, ring = nums[0], nums[1], [(nums[0], nums[1])]
        for dx, dy in zip(nums[2::2], nums[3::2]):
            x, y = x + dx, y + dy
            ring.append((x, y))
        out.append(ring + ring[:1])
    return out


def test_every_square_sits_in_its_county():
    counties = {f: rings_of(d) for f, d in re.findall(r'<path class="c\d" data-fips="(\d{5})"[^>]* d="([^"]+)"', SVG)}
    marks = re.findall(r'data-id="([A-Z]{2}-[A-Z]+-\d+)" data-fips="(\d{5})"[^>]* x="([\d.]+)" y="([\d.]+)"', SVG)
    assert ("WA-DC-01", "53071") in {(i, f) for i, f, _x, _y in marks}  # Walla Walla's own square
    out = [(i, f) for i, f, x, y in marks if not any(bpm.inside((float(x) + bpm.MARK / 2, float(y) + bpm.MARK / 2), ring) for ring in counties[f])]
    assert not out, f"squares outside their county: {out}"


def test_projection_puts_walla_walla_inside_washington():
    if not bpm.COUNTIES_ZIP.is_file():
        pytest.skip("the Census county file is local (work/site-refresh/n6/); the shipped-map test above still runs")
    counties = bpm.read_counties(bpm.COUNTIES_ZIP)
    wa = [c for c in counties if c["statefp"] == "53"]
    outline = bpm.dissolve([c["rings"] for c in wa])
    ww = next(c for c in wa if c["fips"] == "53071")
    point = bpm.interior_point([[bpm.ALBERS(lon, lat) for lon, lat in r] for r in ww["rings"]])
    assert any(bpm.inside(point, [bpm.ALBERS(lon, lat) for lon, lat in ring]) for ring in outline)
    assert {c["fips"] for p in DATA["projects"] for c in p["counties"]} <= {c["fips"] for c in counties}
