"""County climate projections: unit conversions and calendars (numpy), one half-up rounding from by_model, the claims in step with the data file,
and the plate's first view drawn from the public list of proposals."""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import climate_claims as cc  # noqa: E402
import validate_public as vp  # noqa: E402

DATA = json.loads((ROOT / "site" / "data" / "climate-regions.json").read_text(encoding="utf-8"))
SHIPPED = {c["id"]: c for c in json.loads((ROOT / "site" / "data" / "claims" / "climate.json").read_text(encoding="utf-8"))["claims"]}
PLATE = json.loads((ROOT / "site" / "data" / "plates" / "dc-climate-counties.json").read_text(encoding="utf-8"))


def test_conversions_calendars_and_spread():
    pytest.importorskip("numpy")
    import climate_regions
    assert climate_regions.self_test()


def test_rounding_is_once_and_half_up():
    assert cc.self_test()
    assert cc.sig(86.45) == 86 and cc.sig(86.5) == 87 and cc.sig(0.455) == 0.46  # the verifier's case: rounding to two decimals first turned 86.45 into 86.5


def test_claims_match_the_data_file():
    regions = [r for r in DATA["regions"] if r["named_in_projects"]]
    minted, _ = cc.mint(DATA, regions)
    assert [c["id"] for c in minted] == sorted(SHIPPED), "rerun scripts/climate_claims.py, then export the climate cluster"
    for c in minted:
        s = SHIPPED[c["id"]]
        assert (s["value"], s["low"], s["high"], s["unit"], s["year"]) == (c["value"], c["low"], c["high"], c["unit"], c["year"]), c["id"]
        assert s["status"] == "partly" and "seven of eight" in s["limit"] and "not siting guidance" in s["limit"]
        assert "near" not in s["limit"] and "median of the eight" not in s["limit"]


def test_shipped_file_passes_the_validator():
    errors = []
    vp.check_climate_regions(errors)
    assert errors == []
    assert len(DATA["regions"]) == 71 and all(r["coverage"] == 1.0 for r in DATA["regions"])


def test_first_view_is_the_data_center_counties():
    projects = json.loads((ROOT / "site" / "data" / "projects.json").read_text(encoding="utf-8"))["projects"]
    dc = {c["fips"] for p in projects if p["kind"] == "data center" and (p["mw"] or 0) >= 50 for c in p["counties"]}
    by_fips = {r["fips"]: cc.key_of(r) for r in DATA["regions"]}
    assert set(PLATE["measures"]["dc"]) == {by_fips[f] for f in dc}
    assert {row["id"] for row in PLATE["rows"]} == {by_fips[f] for p in projects for c in p["counties"] for f in [c["fips"]]}
    assert PLATE["controls"][0]["options"][0]["value"] == "ssp245" and {o["value"] for o in PLATE["controls"][0]["options"]} == {"ssp245", "ssp370"}
