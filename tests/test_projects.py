"""Named proposals and where they sit: the shipped records pass the validator, the counts add up, the claims match the records, and the county
map keeps each tile inside its county or a line back to it (and, with the Census file at hand, Walla Walla inside Washington)."""
import gzip
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
PAGE = bpm.PAGE.read_text(encoding="utf-8")
SPRITE = re.search(r'<svg class="county-sprite".*?</svg>', PAGE, re.S)[0]
LAYOUT = json.loads(re.search(r'<script type="application/json" id="county-layout">(.*?)</script>', PAGE, re.S)[1])


def plot_of(plate_id):
    """The built plot of one plate on the Data Centers page."""
    return re.search(rf'id="{plate_id}".*?<div class="plate-plot[^"]*"[^>]*>(.*?)</div>\n<div class="plate-detail">', PAGE, re.S)[1]


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


def test_map_is_small_self_contained_and_tiles_every_named_county():
    assert len(gzip.compress(SPRITE.encode("utf-8"), 9)) <= bpm.SPRITE_GZ and len(gzip.compress(SVG.encode("utf-8"), 9)) <= bpm.FILE_GZ
    for text in (SPRITE, SVG):
        assert not re.search(r"https?://|<script|<image|xlink:href|@import|font-family", text.replace('xmlns="http://www.w3.org/2000/svg"', ""))
    named = {c["fips"] for p in DATA["projects"] for c in p["counties"]}
    for plate_id in ("dc-project-map", "dc-climate-counties"):
        assert {f for f in re.findall(r'<g class="tile[^"]*" id="[^"]+" data-row="[a-z-]+" data-fips="(\d{5})"', plot_of(plate_id))} == named, plate_id
    held = set(re.findall(r'<path id="((?:co|st)-[^"]+)"', SPRITE))
    used = set(re.findall(r'<use href="#([^"]+)"', PAGE))
    assert used and used <= held, f"a map draws an id the sprite does not hold: {sorted(used - held)[:5]}"
    assert PAGE.index('<main id="main">') < PAGE.index("<!-- map:sprite -->") < PAGE.index('<header class="wrap page-band'), "the sprite is the first thing in main"
    assert len(re.findall(r'<g class="tile[^"]*"[^>]*data-row="([a-z-]+)"', SVG)) == len(named), "rerun scripts/build_project_map.py"


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


def test_every_tile_sits_in_its_county_or_keeps_a_line_back():
    """As drawn: a tile with no leader has its centre inside its county; a leader starts inside its county and ends at its tile's centre; and no two
    tiles overlap on the footprint they were pushed apart on."""
    counties = {f: rings_of(d) for f, d in re.findall(r'<path id="co-(\d{5})" d="([^"]+)"', SPRITE)}
    plot = plot_of("dc-project-map")
    half = 10  # build_plates.MAP_TILE / 2
    tiles = {f: (float(x) + half, float(y) + half) for f, x, y in re.findall(r'data-fips="(\d{5})"><rect x="([\d.]+)" y="([\d.]+)"', plot)}
    leaders = {f: tuple(map(float, xy)) for *xy, f in re.findall(r'<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)" data-fips="(\d{5})"/>', plot)}
    assert "53071" in tiles and len(tiles) == len(LAYOUT["tiles"]) and leaders  # Walla Walla's own tile; some tiles moved
    within = lambda f, pt: any(bpm.inside(pt, ring) for ring in counties[f])  # noqa: E731
    for f, (x1, y1, x2, y2) in leaders.items():
        assert within(f, (x1, y1)), f"the leader for {f} does not start inside its county"
        assert abs(x2 - tiles[f][0]) < 0.06 and abs(y2 - tiles[f][1]) < 0.06, f"the leader for {f} does not reach its tile"
    out = [f for f, pt in tiles.items() if f not in leaders and not within(f, pt)]
    assert not out, f"tiles outside their county with no line back: {out}"
    spots = list(tiles.values())
    crowded = [(a, b) for i, a in enumerate(spots) for b in spots[i + 1:] if bpm.overlap(a, b, bpm.FOOT - 0.06)]
    assert not crowded, f"tiles overlap on the {bpm.FOOT}-unit footprint: {crowded}"


def test_one_drawing_serves_land_and_climate():
    """The Climate rows are keyed as the Land tiles are, and both maps put each tile in the same place."""
    climate = json.loads((ROOT / "site" / "data" / "plates" / "dc-climate-counties.json").read_text(encoding="utf-8"))
    land = json.loads((ROOT / "site" / "data" / "plates" / "dc-project-map.json").read_text(encoding="utf-8"))
    assert {r["id"] for r in climate["rows"]} == {t["key"] for t in LAYOUT["tiles"]} == {r["id"] for r in land["rows"]}
    assert [r["id"] for r in land["rows"]] == [t["key"] for t in LAYOUT["tiles"]], "the arrow keys walk the record list's order"
    where = lambda plot: re.findall(r'data-row="([a-z-]+)" data-fips="\d{5}"><rect x="([\d.]+)" y="([\d.]+)"', plot)  # noqa: E731
    assert sorted(where(plot_of("dc-project-map"))) == sorted(where(plot_of("dc-climate-counties")))
    assert all(r["claim"].startswith("pc-") for r in land["rows"]) and land["default"] == pc.MAP_DEFAULT


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
