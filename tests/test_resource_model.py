"""Tests for scripts/resource_model.py. The pure equations always run; everything that needs the evidence files
skips when they are absent, so CI stays green before the pour (work/ is gitignored)."""
import glob
import importlib.util
import json
import math
import os
from pathlib import Path
import re

import pytest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("resource_model", ROOT / "scripts" / "resource_model.py")
rm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rm)

need_files = pytest.mark.skipif(not (rm.OUT.exists() and rm.PARAMS.exists() and rm.COMPARISON.exists()), reason="evidence files absent")


@pytest.fixture(scope="module")
def world():
    doc, cm = rm.load()
    inputs, selectors, base = rm.resolve(doc, cm)
    return {"doc": doc, "cm": cm, "inputs": inputs, "selectors": selectors, "base": base, "tree": rm.compute(base),
            "out": json.loads(rm.OUT.read_text(encoding="utf-8"))}


def walk(node, path=""):
    if isinstance(node, dict):
        yield path, node
        for k, v in node.items():
            yield from walk(v, path + "." + k)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from walk(v, "%s[%d]" % (path, i))


def strings(node):
    if isinstance(node, str):
        yield node
    elif isinstance(node, dict):
        for k, v in node.items():
            yield from strings(k)
            yield from strings(v)
    elif isinstance(node, list):
        for v in node:
            yield from strings(v)


def close(x, y, tol=1e-6):
    return abs(x - y) <= tol * max(abs(y), 1e-12)


def test_self_test():
    rm.self_test()


def test_idle_mult_is_one_at_the_reference_and_falls_with_u():  # (2)
    for a in (0.11, 0.30, 0.50):
        assert rm.idle_mult(0.5, a) == pytest.approx(1.0)
        assert rm.idle_mult(0.05, a) > rm.idle_mult(0.10, a) > rm.idle_mult(0.30, a) > rm.idle_mult(0.5, a)


def test_idle_fraction_solves_the_power_ratio():
    a = rm.solve_idle_fraction(1.7, 0.10, 0.40)
    assert a == pytest.approx(0.2473, abs=1e-3)
    assert (a + (1 - a) * 0.4) / (a + (1 - a) * 0.1) == pytest.approx(1.7)


def test_within_estimator_matches_a_hand_computation():
    rows = [("x", 0.0, 0.0), ("x", 1.0, 2.0), ("x", 2.0, 4.0), ("y", 0.0, 10.0), ("y", 1.0, 12.5), ("y", 2.0, 13.5)]
    f = rm.within_fe(rows)
    assert f["b"] == pytest.approx(1.875)  # within sums: Sxy 7.5 over Sxx 4
    assert f["n"] == 6 and f["groups"] == 2 and f["df"] == 3
    assert f["se"] == pytest.approx(math.sqrt(0.4375 / 3 / 4))  # RSS 0.4375 by hand
    assert f["r2_within"] == pytest.approx(1 - 0.4375 / 14.5)


def test_extremes_take_an_inverse_input_at_the_right_end(monkeypatch):
    def fake(p):
        return {"r": p["a"] / p["u"]}
    monkeypatch.setattr(rm, "compute", fake)
    inputs = {"a": {"low": 1.0, "central": 2.0, "high": 4.0}, "u": {"low": 0.5, "central": 1.0, "high": 2.0}}
    base = {"a": 2.0, "u": 1.0}
    central = rm.flatten(fake(base))
    oat = rm.one_at_a_time(inputs, base)
    assert rm.input_extremes(inputs, base, central, oat)["r"] == (0.5, 8.0)


@need_files
def test_same_hour_rows_equal_the_comparison_model(world):  # (1)
    target = world["cm"]["computed_defaults"]["same_hour"]
    got = world["out"]["computed_defaults"]["same_hour"]
    assert set(target) <= set(got)
    for name in target:
        for row in ("chat", "video", "short"):
            for field, value in target[name][row].items():
                assert got[name][row][field] == pytest.approx(value, abs=1e-9), (name, row, field)
    cat = {r["key"]: r for r in world["out"]["catalog"]}
    for row, key in (("chat", "catalog.chat_hour"), ("video", "catalog.video_hour"), ("short", "catalog.short_hour")):
        assert cat[key]["energy_wh"]["value"] == pytest.approx(target["default"][row]["total"], rel=1e-4)
        assert cat[key]["energy_wh"]["low"] == pytest.approx(target["low"][row]["total"], rel=1e-4)
        assert cat[key]["energy_wh"]["high"] == pytest.approx(target["high"][row]["total"], rel=1e-4)


@need_files
def test_same_hour_inputs_are_read_not_copied(world):
    assert not set(world["doc"]["same_hour_refs"]) & set(world["doc"]["params"])
    inputs, cm = world["inputs"], world["cm"]["inputs"]
    assert inputs["e_prompt"]["central"] == cm["chat_wh_per_prompt"]["value"]
    assert inputs["dev_laptop"]["high"] == cm["device_wh_per_hour"]["laptop"]["high"]


@need_files
def test_coding_session_reproduces_au_045(world):  # (3)
    base = world["base"]
    at = lambda c: rm.compute({**base, "cache_share": c})["catalog"]["coding_session"]["wh"]
    assert abs(at(0.10) - 36.2) / 36.2 < 0.03
    assert abs(at(0.01) - 17.5) / 17.5 < 0.03
    assert abs(at(0.25) - 67.4) / 67.4 < 0.03


def _claim_index():
    index = {}
    for f in glob.glob(str(rm.EVIDENCE / "*.json")):
        b = os.path.basename(f)
        if b.startswith("tmp-") or b.endswith("-jev.json") or b.startswith("resource-model") or b == "comparison-model.json":
            continue
        d = json.loads(Path(f).read_text(encoding="utf-8"))
        if isinstance(d, dict) and "claims" in d:
            index.update({c["id"]: c for c in d["claims"] if "id" in c})
    return index


@need_files
def test_every_cited_claim_exists_and_is_usable(world):  # (4)
    index = _claim_index()
    cited = set()
    for spec_ in world["out"]["inputs"].values():
        cited.update(spec_["claims"])
    for _, node in walk(world["out"]):
        if isinstance(node.get("claims"), list):
            cited.update(node["claims"])
    text = json.dumps({k: world["out"][k] for k in ("catalog", "architectures", "levers", "qualitative", "places")}, ensure_ascii=False)
    cited.update(re.findall(r"\b(?:fp|ec|sf|gf|au|px|sv|lf|tr|rs|fin|dem)-\d{3}\b", text))
    assert len(cited) > 100
    for c in sorted(cited):
        assert c in index, c
        assert index[c]["status"] in ("verified", "partly"), (c, index[c]["status"])


@need_files
def test_low_central_high_are_ordered(world):  # (5)
    for key, v in world["out"]["inputs"].items():
        assert v["low"] <= v["value"] <= v["high"], key
    count = 0
    for path, node in walk(world["out"]):
        if {"value", "low", "high"} <= set(node) and all(isinstance(node[k], (int, float)) for k in ("value", "low", "high")):
            assert node["low"] <= node["value"] * (1 + 1e-5) and node["value"] <= node["high"] * (1 + 1e-5), path
            count += 1
    assert count > 300


@need_files
def test_every_input_has_evidence_or_says_it_is_assumed(world):
    for key, v in world["doc"]["params"].items():
        assert v["kind"] in ("measured", "modeled", "assumed"), key
        assert v["claims"] or v["kind"] == "assumed", key
        assert v["unit"], key


@need_files
def test_water_and_carbon_carry_their_labels(world):  # (6)
    co2, water = 0, 0
    for path, node in walk(world["out"]):
        if "co2e_g" in node:
            grid = node["co2e_g"]["grid"]
            assert grid and "market" not in grid.lower(), path
            co2 += 1
        if "water_ml" in node:
            assert node["water_ml"]["convention"], path
            water += 1
    assert co2 > 50 and water > 50
    for letter in world["out"]["architectures"].values():
        for k, r in letter["readings"].items():
            if k.endswith("_g") or "_g_" in k:
                assert r.get("grid"), k
            if k.endswith("_ml"):
                assert r.get("convention"), k


@need_files
def test_no_water_figure_crosses_a_basin_unsplit(world):
    labels = world["doc"]["labels"]
    split = {k for k, v in labels.items() if "ml_by_place" in v["water"]}
    assert split
    tree = world["tree"]
    assert set(tree["catalog"]["chat_hour"]["ml_by_place"]) == {"cloud", "home"}
    assert sum(tree["catalog"]["chat_hour"]["ml_by_place"].values()) == pytest.approx(tree["catalog"]["chat_hour"]["ml"])


@need_files
def test_every_row_says_how_it_was_made(world):
    rows = [node for _, node in walk(world["out"]) if "energy_wh" in node]
    assert len(rows) > 50
    for row in rows:
        assert re.search(r"[Mm]odeled|[Mm]easured", row["basis"]), row["key"]


@need_files
def test_every_price_carries_a_basis_and_a_date(world):  # (7)
    count = 0
    for path, node in walk(world["out"]):
        if "price_usd" in node:
            assert node["price_usd"]["basis"] in rm.PRICE_BASES, path
            assert re.fullmatch(r"\d\d/\d\d/\d{4}", node["price_usd"]["date"]), path
            if node["price_usd"]["basis"] == "none":
                assert node["price_usd"]["value"] is None, path
            count += 1
        for reading in node.get("price_readings", []):
            assert reading["basis"] in rm.PRICE_BASES and reading["date"], path
    assert count > 50
    for letter in world["out"]["architectures"].values():
        for k, r in letter["readings"].items():
            if "usd" in k:
                assert r["basis"] in rm.PRICE_BASES and r["date"], k


@need_files
def test_no_list_price_where_no_api_exists(world):
    cat = {r["key"]: r for r in world["out"]["catalog"]}
    assert cat["catalog.video_hour"]["price_usd"]["basis"] == "revenue_standin"
    assert cat["catalog.short_hour"]["price_usd"]["basis"] == "revenue_standin"
    assert cat["catalog.seat_month"]["price_usd"]["basis"] == "seat_list"


@need_files
def test_qualitative_fields_are_words(world):  # (8)
    q = world["out"]["qualitative"]
    assert q
    for key, value in q.items():
        for item in value if isinstance(value, list) else [value]:
            assert isinstance(item, str), key


@need_files
def test_crossovers_and_the_order_of_places(world):  # (9)
    printed = world["out"]["computed_defaults"]["crossovers"]
    again = world["tree"]["cross"]
    assert set(printed) == set(again)
    for k, v in again.items():
        assert (printed[k] is None and v is None) or printed[k] == pytest.approx(v, rel=1e-5), k
    assert again["views_measured_same_network"] is None
    d = world["tree"]["arch"]["D"]
    assert d["node_100k"]["wh"] > d["hyper"]["wh"] > d["laptop"]["wh"]
    assert d["node_100k"]["wh"] > d["colo"]["wh"] > d["hyper"]["wh"]
    b = world["tree"]["arch"]["B"]
    assert b["local_1000"]["wh"] > b["local_10000"]["wh"] > b["local_100000"]["wh"]


@need_files
def test_design_document_numbers_hold(world):
    t = world["tree"]
    c, a, b, x, d = t["catalog"], t["arch"]["A"], t["arch"]["B"], t["arch"]["C"], t["arch"]["D"]
    for row, wh, usd, g, ml in (("chat_prompt", 0.30, 0.0040, 0.105, 1.46), ("chat_hour", 15.0, 0.040, 4.51, 51.9), ("coding_session", 36.2, 0.185, 12.7, 177),
                                ("coding_hour", 211, 1.01, 73, 1010), ("image", 0.63, 0.0336, 0.22, 3.07), ("clip", 30.8, 0.80, 10.8, 150), ("search_ai", 0.60, 0.018, 0.21, 2.93),
                                ("short_hour", 12.8, 0.155, 3.74, 41.0), ("video_hour", 14.05, 0.256, 4.17, 46.7), ("seat_month", 183, 14, 64.2, 895), ("video_delivery", 2.05, 0.06, 0.718, 9.43)):
        assert c[row]["wh"] == pytest.approx(wh, rel=0.01), row
        assert c[row]["usd"] == pytest.approx(usd, rel=0.01), row
        assert c[row]["g"] == pytest.approx(g, rel=0.01), row
        assert c[row]["ml"] == pytest.approx(ml, rel=0.01), row
    assert c["seat_month"]["storage_beside_wh"] == pytest.approx(156.6, rel=0.01) and c["coding_session"]["mean_session_wh"] == pytest.approx(202, rel=0.01)
    assert c["coding_hour"]["layers"]["device"] == world["base"]["dev_phone"], "one device on every hour row"
    assert a["cloud"]["wh"] == pytest.approx(110e3, rel=0.01) and a["local"]["wh"] == pytest.approx(434e3, rel=0.01)
    assert a["cloud_same_grid"]["wh"] == a["cloud"]["wh"] and a["cloud_same_grid"]["g"] < a["cloud"]["g"], "the cloud on the local grid"
    assert a["readings"]["usd_at_wage"]["60"] == pytest.approx(10616, rel=0.001) and a["readings"]["usd_at_wage"]["0"] == pytest.approx(536, rel=0.001)
    assert a["cloud"]["usd"] == pytest.approx(8400 + 1440, rel=0.001), "cloud admin hours on the cloud side"
    assert b["readings"]["local_wh_per_view"]["1000"] == pytest.approx(78.2, rel=0.01) and b["readings"]["local_wh_per_view"]["100000"] == pytest.approx(1.9, rel=0.02)
    assert b["local_1000"]["wh"] == pytest.approx(b["local_1000"]["node_only_wh"] + 1000 * world["base"]["gb_phone"] * world["base"]["net_fixed_avg"]), "same network on both sides"
    assert x["ten_copies"]["wh"] == pytest.approx(4433e3 + 160e3, rel=0.001) and x["central_s3"]["wh"] == pytest.approx(188e3, rel=0.01)
    assert x["federated"]["wh"] == pytest.approx(x["readings"]["federated_wh_nodes_not_on"]) and x["readings"]["federated_wh_nodes_on"] == pytest.approx(64.6e3, rel=0.01)
    assert d["colo"]["wh"] == pytest.approx(448, rel=0.01) and d["node_100k"]["usd"] == pytest.approx(28.74, rel=0.001) and d["node_1m_hydro"]["g"] == pytest.approx(11.5, rel=0.01)
    assert d["hyper_same_grid"]["wh"] == d["hyper"]["wh"] and d["node_1m"]["g"] > d["hyper_same_grid"]["g"], "on one grid the node still loses at a million"
    assert d["readings"]["hyper_small_model_usd"] == pytest.approx(0.20, rel=0.01)
    assert t["cross"]["views_desnz_same_network"] is None and t["cross"]["views_measured_network_credit"] == pytest.approx(94010, rel=0.001)
    assert t["cross"]["prompts_energy_vs_hyper"] == pytest.approx(2.76e6, rel=0.01) and t["cross"]["prompts_carbon_on_hydro_vs_hyper_us"] == pytest.approx(79.6e3, rel=0.01)
    assert t["cross"]["prompts_carbon_same_grid"] == pytest.approx(t["cross"]["prompts_energy_vs_hyper"]), "on one feed the carbon crossover is the energy crossover"
    assert rm.project_scale(100, 1.0, 0.36, 350)["site_water_l_per_year"] == pytest.approx(315.36e6)


@need_files
def test_settings_reach_the_rows_they_move(world):
    selected = world["out"]["computed_defaults"]["selectors"]
    assert selected["wage"]["25"]["arch.A.local"]["usd"] == pytest.approx(4736, rel=0.001)
    assert selected["hydro_convention"]["excluded"]["arch.D.node_1m_hydro"]["ml"] == 0
    assert selected["grid_local"]["solar"]["arch.A.local"]["ml"] is None, "no generation water without a claim"
    assert selected["chat_kind"]["reasoning"]["catalog.chat_hour"]["wh"] == pytest.approx(51.1, rel=0.01)
    assert "arch.D.hyper" not in selected["chat_kind"]["reasoning"], "the kind of chat is a setting for chat rows"
    assert selected["node_already_on"]["yes"]["arch.D.node_100k"]["wh"] < world["tree"]["arch"]["D"]["hyper"]["wh"]
    on = selected["node_already_on"]["yes"]
    assert on["arch.C.federated_replicas"]["wh"] == pytest.approx(world["tree"]["arch"]["C"]["central_s3"]["wh"], rel=0.02), "three copies, drives only, equal the cloud"
    assert on["arch.C.ten_copies"]["wh"] < world["tree"]["arch"]["C"]["ten_copies"]["wh"], "the setting reaches ten copies too"
    assert selected["grid_dc"]["hydro"]["arch.D.hyper"]["g"] < world["tree"]["arch"]["D"]["node_1m_hydro"]["g"], "every place can pick the same feed"
    assert selected["device"]["laptop"]["catalog.coding_hour"]["wh"] > world["tree"]["catalog"]["coding_hour"]["wh"], "the device setting reaches the coding hour"


@need_files
def test_northwest_water_is_built_from_the_mix(world):
    p = world["base"]
    for share, conv, want in ((0.387, 6.8, 3.11), (0.387, 0.0, 0.48), (0.387, 38.0, 15.2), (0.775, 6.8, 5.45)):
        assert rm.w_gen_nw(share, conv, p["gas_water"]) == pytest.approx(want, abs=0.03)


@need_files
def test_backtest_table_is_a_regression_guard(world):  # (10)
    doc, base, tree = world["doc"], world["base"], world["tree"]
    again = rm.rounded(rm.backtest(doc["backtest_figures"], base, tree))
    assert again == world["out"]["backtest"]["rows"]
    assert rm.rounded(rm.backtest_summary(rm.backtest(doc["backtest_figures"], base, tree))) == world["out"]["backtest"]["summary"]
    rows = {r["id"]: r for r in again}
    assert rows["sv-028"]["ratio"] == pytest.approx(5.28, abs=0.01) and rows["sv-048"]["ratio"] == pytest.approx(0.39, abs=0.01)
    assert rows["sv-028"]["known_miss"] and rows["sv-048"]["known_miss"]
    assert not rows["au-032"]["independent"] and not rows["sv-028"]["independent"], "a figure that chose a setting is not held out"


@need_files
def test_calibration_and_regression(world):
    cal, reg = world["out"]["calibration"], world["out"]["regression"]
    assert cal["idle_fraction"]["from_sf008"] == pytest.approx(0.247, abs=0.001)
    assert cal["idle_fraction"]["central_used"] == pytest.approx(cal["idle_fraction"]["gpu_floor_ec020"], abs=0.005), "accelerator idle on accelerator rows"
    rows = {f["id"]: f for f in cal["decode_to_prefill"]["figures"]}
    for fid, r3, r10 in (("au-030", 1.00, 0.49), ("au-031", 0.51, 0.50), ("sv-028", 5.28, 2.20), ("au-032", 0.80, 0.25)):
        assert rows[fid]["ratio_3"] == pytest.approx(r3, abs=0.01) and rows[fid]["ratio_10"] == pytest.approx(r10, abs=0.01), fid
    q = reg["cloud_ai_firms"]
    assert q["b"] == pytest.approx(1.71, abs=0.01) and q["se"] == pytest.approx(0.09, abs=0.01) and q["n"] == 17 and q["df"] == 13
    assert not {"t", "ci95", "r2_within"} & set(q), "no inference printed on a descriptive slope"
    q = reg["all_firms"]
    assert q["b"] == pytest.approx(0.74, abs=0.01) and q["se"] == pytest.approx(0.13, abs=0.01) and q["n"] == 31 and q["df"] == 24
    tr = reg["trend_controlled"]  # the econometrician's independent recomputation
    for name, b, se, df in (("common_trend", 0.49, 0.20, 12), ("firm_trends", 0.41, 0.24, 10), ("year_effects", 0.37, 0.45, 7), ("first_differences", 0.30, 0.19, 12)):
        assert tr[name]["b"] == pytest.approx(b, abs=0.01) and tr[name]["se"] == pytest.approx(se, abs=0.01) and tr[name]["df"] == df, name
    assert tr["first_differences"]["intercept_log_per_year"] == pytest.approx(0.20, abs=0.01)
    assert "elasticity" not in json.dumps(world["out"]["regression"]).lower().replace("not an elasticity", "").replace("or elasticity reading", "")
    assert reg["eps_median"] == pytest.approx(world["inputs"]["eps"]["central"], abs=0.001)


@need_files
def test_sensitivity_names_a_driver_for_every_row(world):
    out = world["out"]
    for key, measures in out["sensitivity"]["rows"].items():
        assert measures["wh"], key
    cat = {r["key"]: r for r in out["catalog"]}
    assert cat["catalog.chat_hour"]["moves_most"]["wh"] == "chat_kind"
    assert cat["catalog.video_delivery"]["moves_most"]["wh"] == "i_dc"
    assert cat["catalog.seat_month"]["moves_most"]["usd"] == "seat_usd"


@need_files
def test_every_comparison_and_row_resolves(world):
    flat = rm.flatten(world["tree"])
    for cmp in world["doc"]["comparisons"]:
        assert cmp["a"] in flat and cmp["b"] in flat, cmp["id"]
    reversed_ = [s["id"] for s in world["out"]["stability"]["comparisons"] if not s["stable"]]
    assert "d_node_1m_energy" in reversed_ and "a_price" in reversed_


@need_files
def test_tier_schema_and_prose(world):  # (11)
    for name in ("out", "doc"):
        obj = world[name]
        assert obj["tier"] == "T0" and obj["schema"] == 1
        for text in strings(obj):
            assert "\u2014" not in text and " -- " not in text, text[:80]


@need_files
def test_worked_example_stays_off_the_site_file(world):
    text = json.dumps(world["out"]).lower()
    assert "worked example" not in text and "30 million" not in text and "30m token" not in text


def test_public_code_has_no_local_paths_or_keys():
    text = (ROOT / "scripts" / "resource_model.py").read_text(encoding="utf-8")
    assert not re.search(r"[A-Za-z]:[/\\]", text)
    assert "API_KEY" not in text and "environ" not in text
    assert not set(re.findall(r"^(?:import|from) (\w+)", text, re.M)) - {"argparse", "json", "math", "statistics", "sys", "pathlib"}
