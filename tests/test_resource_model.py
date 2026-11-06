"""Tests for scripts/resource_model.py. The pure equations always run; everything that needs the evidence files
skips when they are absent, so CI stays green before the pour (work/ is gitignored), and fails instead on the owner's machine, where planning-T1/ is."""
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
fit_spec = importlib.util.spec_from_file_location("fit_idle", ROOT / "scripts" / "fit_idle.py")
fit = importlib.util.module_from_spec(fit_spec)
fit_spec.loader.exec_module(fit)

def need_files(test):
    """Tests that read the evidence files skip where they and planning-T1/ are both absent (CI, a fresh clone). On the owner's machine, where planning-T1/ is,
    a missing evidence file fails them: a skip there would hide a pour that never ran."""
    missing = [p.name for p in (rm.OUT, rm.PARAMS, rm.COMPARISON) if not p.exists()]
    if not missing or not (ROOT / "planning-T1").is_dir():
        return pytest.mark.skipif(bool(missing), reason="evidence files absent")(test)

    def fails():
        pytest.fail(f"planning-T1/ is here, but work/site-refresh/evidence lacks {', '.join(missing)}: restore the evidence folder (work/ is local only), then rerun")
    fails.__name__ = test.__name__
    return fails


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
    text = json.dumps({k: world["out"][k] for k in ("catalog", "architectures", "levers", "qualitative", "places", "custody", "carbon_damage")}, ensure_ascii=False)
    cited.update(re.findall(rm.CLAIM_ID, text))
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
def test_the_model_goes_by_its_public_name(world):
    """Owner ruling of 11/05/2026: the Open-book model, with one technical line, and the old name nowhere a reader sees it."""
    words = world["out"]["disclaimer"]
    assert "from an open-book model checked against published figures: every input is a published figure or a labeled assumption, shown with its receipt" in words and "nothing is fitted" in words
    assert words.count("a bottom-up engineering model; it estimates no coefficient from data, so it is not econometric.") == 1 and words.count("econometric") == 1
    assert not [s for s in strings(world["out"]) if "process model" in s.lower()]


@need_files
def test_worked_example_stays_off_the_site_file(world):
    text = json.dumps(world["out"]).lower()
    assert "worked example" not in text and "30 million" not in text and "30m token" not in text


def test_public_code_has_no_local_paths_or_keys():
    text = (ROOT / "scripts" / "resource_model.py").read_text(encoding="utf-8")
    assert not re.search(r"[A-Za-z]:[/\\]", text)
    assert "API_KEY" not in text and "environ" not in text
    assert not set(re.findall(r"^(?:import|from) (\w+)", text, re.M)) - {"argparse", "json", "math", "statistics", "sys", "pathlib"}
    text = (ROOT / "scripts" / "fit_idle.py").read_text(encoding="utf-8")
    assert not re.search(r"[A-Za-z]:[/\\]", text)
    assert "API_KEY" not in text and "environ" not in text and "urllib" not in text and "socket" not in text, "the fit sends nothing anywhere"
    assert not set(re.findall(r"^(?:import|from) (\w+)", text, re.M)) - {"argparse", "csv", "io", "json", "math", "pathlib", "sys", "resource_model"}


# ---------------------------------------------------------------- comparison E, leaving a cloud

def row_of(world, path):
    node = world["tree"]
    for part in path.split("."):
        node = node[part]
    return node


@need_files
def test_a_year_in_a_store_is_comparison_c_at_the_same_size(world):
    c, e = world["tree"]["arch"]["C"], world["tree"]["arch"]["E"]
    assert world["base"]["exit_tb"] == world["base"]["shared_tb"]
    for s in ("s3", "r2", "b2"):
        assert e["year_" + s]["wh"] == pytest.approx(c["central_" + s]["wh"]) and e["year_" + s]["usd"] == pytest.approx(c["central_" + s]["usd"]), s
    assert e["readings"]["egress_per_pull_usd"]["s3"] * world["base"]["nations"] == pytest.approx(c["readings"]["egress_one_pull_each_usd"])


@need_files
def test_a_move_counts_what_it_says_and_nothing_more(world):
    p, e = world["base"], world["tree"]["arch"]["E"]
    gb = p["exit_tb"] * 1000
    move = e["move_s3_node"]
    assert move["wh"] == pytest.approx(gb * p["net_fixed_avg"]) and move["g"] == pytest.approx(move["wh"] * p["grid_dc"] / 1000)
    assert move["usd"] == pytest.approx(gb * p["p_egress"] + p["exit_admin_h"] * p["wage"] + p["exit_other_usd"])
    assert move["egress_usd"] + move["labor_usd"] + move["other_bill_usd"] == pytest.approx(move["usd"])
    assert e["move_r2_node"]["wh"] == move["wh"] and e["move_r2_node"]["egress_usd"] == 0, "free egress is a price, not zero energy"
    fed = e["move_s3_federated"]
    assert fed["wh"] == pytest.approx(p["replicas"] * move["wh"]) and fed["egress_usd"] == pytest.approx(move["egress_usd"]) and fed["labor_usd"] == pytest.approx(p["replicas"] * move["labor_usd"]), "a peer copy pays no egress and still takes hours and network"
    other = rm.compute({**p, "nas_w": 15, "connection": "cellular"})["arch"]["E"]["move_s3_node"]
    assert other["wh"] == move["wh"], "no box watts in a move, and a Nation's fixed link is not the reader's phone"
    for r in world["out"]["architectures"]["E"]["options"]:
        if r["key"].split(".")[-1].startswith("move_"):
            assert all(word in r["counted"] for word in ("energy:", "CO2e:", "price:")), r["key"]
            assert r["unit"] == "one time" and {x["basis"] for x in r["price_readings"]} == {"api_list", "self_run"}, r["key"]
        else:
            assert r["unit"] == "one year", r["key"]


@need_files
def test_migration_labor_and_other_bills_are_labeled_assumptions_with_a_range(world):
    for key in ("exit_admin_h", "exit_other_usd"):
        v = world["inputs"][key]
        assert v["kind"] == "assumed" and v["status"] == "assumption" and not v["claims"] and v["low"] < v["high"] and v["note"].startswith("No source"), key
    assert world["base"]["cache_share_top"] == world["inputs"]["cache_share"]["high"]
    words = world["out"]["architectures"]["E"]["note"]
    assert "labeled assumptions" in words


@need_files
def test_the_year_after_uses_the_box_or_the_drives(world):
    p, e = world["base"], world["tree"]["arch"]["E"]
    assert e["year_node"]["wh"] == pytest.approx(p["nas_w"] * rm.HOURS * p["pue_room"]) and e["year_federated"]["wh"] == pytest.approx(p["replicas"] * e["year_node"]["wh"])
    assert e["year_cloud_same_grid"]["wh"] == e["year_s3"]["wh"] and e["year_cloud_same_grid"]["g"] < e["year_s3"]["g"]
    raw = p["exit_tb"] * p["nas_raw_tb"] / p["shared_tb"]
    on = rm.compute({**p, "already_on": 1})["arch"]["E"]
    assert on["year_node"]["wh"] == pytest.approx(raw * p["stor_wh_tb_h"] * rm.HOURS * p["pue_room"]), "the already-on setting reaches the new rows"
    embodied = world["out"]["architectures"]["E"]["readings"]
    assert embodied["embodied_cloud_replicas_g"]["grid"] and embodied["embodied_own_node_g"]["grid"], "embodied carbon prints on both sides, on one boundary"
    assert e["readings"]["transfer_days_one_copy"] == pytest.approx(p["exit_tb"] * 8e6 / p["exit_link_mbps"] / 86400)
    other = embodied["cloud_service_boundary_g"]
    assert other["low"] == pytest.approx(p["exit_tb"] * 166e3) and other["high"] == pytest.approx(p["exit_tb"] * 280e3) and "another boundary" in other["grid"], "a reading on another boundary beside the floor"
    assert "not a bound" in other["label"] and "ceiling" not in other["label"] + world["out"]["architectures"]["E"]["note"], "four data centers bound no one service, so nothing calls them a ceiling"
    assert "never subtracted" in world["out"]["architectures"]["E"]["note"]


@need_files
def test_local_wins_on_custody_not_watt_hours_and_the_words_say_where_it_wins_on_price(world):
    e, reversals = world["tree"]["arch"]["E"], {s["id"]: s for s in world["out"]["stability"]["comparisons"]}
    # watt-hours at the default size: the local rows use more, and three copies, the count the cloud row assumes, use more on every single change to the inputs
    assert e["year_node"]["wh"] > e["year_s3"]["wh"] and e["year_federated"]["wh"] > e["year_s3"]["wh"] and e["year_node"]["g"] > e["year_cloud_same_grid"]["g"]
    assert reversals["e_federated_energy"]["stable"] and reversals["e_federated_carbon"]["stable"]
    assert set(reversals["e_node_energy"]["flips_on_one_input"] + reversals["e_node_energy"]["flips_on_one_setting"]) == {"nas_w at 15", "node_already_on = yes"}
    # price, as the row's words state it
    assert all(e["year_node"]["usd"] < e["year_" + s]["usd"] for s in ("s3", "r2", "b2"))
    assert e["year_federated"]["usd"] < e["year_s3"]["usd"] and e["year_federated"]["usd"] > e["year_r2"]["usd"] and e["year_federated"]["usd"] > e["year_b2"]["usd"]
    assert not reversals["e_node_price_r2"]["stable"] and not reversals["e_node_price_b2"]["stable"]
    assert e["move_s3_node"]["labor_usd"] > e["move_s3_node"]["egress_usd"], "at the assumed hours, the bill is mostly hours"
    pay, wins, g = world["out"]["architectures"]["E"]["payback"], world["out"]["architectures"]["E"]["wins"], lambda x: "%.2g" % x
    for s, years in (("s3", " years"), ("r2", ""), ("b2", "")):  # the words print each payback and its range as the page does
        c = pay["node_vs_" + s]
        said = f'{s.upper()} in {g(c["value"])}{years} ({g(c["low_one_input_or_setting"])} to {g(c["high_one_input_or_setting"])}{", or never" if c["never_under"] else ""})'
        assert said in wins, said
    assert pay["federated_vs_s3"]["value"] > 5 and pay["federated_vs_r2"]["value"] is None and pay["federated_vs_b2"]["value"] is None
    assert pay["federated_vs_s3"]["never_under"], "a payback prints its or-never"


@need_files
def test_the_size_reverses_the_three_copy_row_and_the_page_takes_no_size_one_box_cannot_hold(world):
    """Review of 11/05/2026, finding 2: one four-bay box per copy at any size, so the cloud's drives-only figure passes the boxes as the data grows."""
    p, e = world["base"], world["tree"]["arch"]["E"]
    tie = e["readings"]["tb_at_energy_tie"]
    at = lambda tb: rm.compute({**p, "exit_tb": tb})["arch"]["E"]
    assert at(tie["federated"])["year_federated"]["wh"] == pytest.approx(at(tie["federated"])["year_s3"]["wh"]), "at the printed size the three-copy row ties"
    assert at(tie["federated"] * 1.01)["year_federated"]["wh"] < at(tie["federated"] * 1.01)["year_s3"]["wh"] and 70 < tie["federated"] < 72, "and above it the order reverses, near 71 TB"
    assert at(tie["node"] * 1.01)["year_node"]["wh"] < at(tie["node"] * 1.01)["year_s3"]["wh"] and 23 < tie["node"] < 25, "the one-copy row reverses near 24 TB"
    assert rm.compute({**p, "already_on": 1})["arch"]["E"]["readings"]["tb_at_energy_tie"] == {"node": None, "federated": None}, "drives only, both sides grow with the data"
    limit = world["out"]["typed_limits"]["exit_tb"]
    assert limit == pytest.approx(p["nas_box_max_raw_tb"] * p["shared_tb"] / p["nas_raw_tb"]) == 80 and world["out"]["typed_limits"]["most"] == rm.TYPED_MOST
    assert "no source" in world["doc"]["scenario_labels"]["nas_box_max_raw_tb"] and "one four-bay box per copy" in world["out"]["architectures"]["E"]["loses"]


@need_files
def test_copies_are_counted_as_copies_and_never_as_durability(world):
    """Review of 11/05/2026, finding 5: the record holds no failure, repair, or integrity model, so an equal copy count is not equal durability."""
    words = json.dumps({k: world["out"]["architectures"][k] for k in ("C", "E")}, ensure_ascii=False)
    assert "durability three" not in words and "cloud row's durability" not in words and "the cloud's durability" not in words
    rows = {r["key"]: r for r in world["out"]["architectures"]["E"]["options"]}
    assert "copy count is not durability, and no failure, repair, or integrity model is in this record" in rows["arch.E.year_federated"]["counted"]
    assert "copy count is not durability" in world["out"]["architectures"]["E"]["loses"]


@need_files
def test_a_verdict_word_holds_at_the_settings_it_names(world):
    """Fairness pass of 11/05/2026: each verdict is scoped to what the model shows, and its figures are the model's."""
    arch, p = world["out"]["architectures"], world["base"]
    cross = world["out"]["crossovers"]["views_measured_same_network"]
    ends = "%s to %s views a year" % tuple(f'{round(x, -4):,.0f}' for x in (cross["low_one_input_or_setting"], cross["high_one_input_or_setting"]))
    assert cross["value"] is None and "no audience size closes the gap" in arch["B"]["loses"] and ends in arch["B"]["loses"], "never at these settings, a range on one change"
    assert "never pays back" not in arch["E"]["loses"] and "at these settings that move does not pay back" in arch["E"]["loses"] and "ends a vendor" not in arch["E"]["wins"]
    assert "Two other kinds of federation are not this one" in arch["C"]["loses"]
    # paid hours lead every self-hosted price at the default wage; comparison D's node is the closest call
    assert p["node_admin_h_year"] * p["wage"] > p["node_usd"] / p["life"] and any("at the default wage" in x for x in world["out"]["qualitative"]["where_local_or_federated_systems_lose"])


@need_files
def test_b2_is_priced_by_its_30_day_period_over_a_365_day_year(world):
    """Review of 11/05/2026, finding 7: twelve 30-day periods are 360 days, and the model's year is 8,760 hours."""
    p, t = world["base"], world["tree"]["arch"]
    want = p["exit_tb"] * p["p_b2_tb"] * 365 / 30 + p["central_admin_h_month"] * 12 * p["wage"]
    assert t["E"]["year_b2"]["usd"] == pytest.approx(want) == pytest.approx(1565.58, abs=0.01) and t["C"]["central_b2"]["usd"] == pytest.approx(want)
    assert world["inputs"]["p_b2_tb"]["unit"] == "USD per TB per 30 days"


@need_files
def test_derived_figures_name_the_claims_and_assumptions_they_read(world):
    """Review of 11/05/2026, finding 6: every figure beside the rows carries its inputs' claims and the assumptions it rests on, traced from the model, at the default settings."""
    index, arch = _claim_index(), world["out"]["architectures"]
    for letter, a in arch.items():
        for k, r in a["readings"].items():
            reads = r["reads"]
            assert reads["claims"] == sorted(reads["claims"]) and all(index[c]["status"] in ("verified", "partly") for c in reads["claims"]), (letter, k)
            assert reads["claims"] or reads["no_source"] or reads["assumed"] or k.startswith("copies"), (letter, k)
    e = arch["E"]["readings"]
    assert {"ec-021", "lf-027"} <= set(e["node_w_at_energy_tie"]["reads"]["claims"]) and "pue_room" in e["node_w_at_energy_tie"]["reads"]["assumed"]
    assert e["transfer_days_one_copy"]["reads"] == {"claims": ["sf-056"], "assumed": ["exit_link_mbps"], "no_source": []}
    pay = arch["E"]["payback_reads"]
    assert {"px-048", "px-049", "sv-042"} <= set(pay["claims"]) and {"exit_admin_h", "exit_other_usd"} <= set(pay["no_source"]), "the paybacks rest on hours and a bill with no source, and say so"
    before = json.loads(json.dumps(rm.flatten(world["tree"])))
    rm.trace(world["inputs"], world["selectors"], world["base"], rm.flatten(world["tree"]), rm.selector_runs(world["selectors"], world["base"]), ["arch.E.readings.node_w_at_energy_tie"])
    assert rm.flatten(rm.compute(world["base"])) == before, "the trace moves no figure"


@need_files
def test_the_ranking_across_rows_is_unmoved_by_a_comparison_of_unlike_periods(world):
    names = {e["name"] for rows in world["out"]["sensitivity"]["global_architectures"].values() for e in rows}
    assert not {n for n in names if n.startswith("exit_")}


# ---------------------------------------------------------------- the custody setting

@need_files
def test_every_row_has_a_holder_and_every_rule_partitions_the_rows(world):
    doc, spec = world["doc"], world["doc"]["custody"]
    assert spec["default"] == "any" and set(spec["options"]) == {"any", "node", "federated"}
    every = {"arch.%s.%s" % (l, n) for l, a in doc["architectures"].items() for n in a["options"]}
    assert set(spec["rows"]) == every
    assert {r["holder"] for r in spec["rows"].values()} <= set(spec["options"]["any"]["allows"])
    for rule in spec["options"]:
        view = rm.custody_view(doc, world["tree"], rule)["comparisons"]
        for letter, v in view.items():
            kept, left = [r["key"] for r in v["kept"]], [r["key"] for r in v["left"]]
            assert sorted(kept + left) == sorted("arch.%s.%s" % (letter, n) for n in doc["architectures"][letter]["options"]), (rule, letter)
            assert kept, "a rule always leaves something standing"
            assert all(r["reason"] for r in v["left"]), "a row that leaves says why"
    assert all(not v["left"] and v["cost"] is None for v in rm.custody_view(doc, world["tree"], "any")["comparisons"].values())


@need_files
def test_a_row_that_breaches_leaves_whole_and_is_not_scored(world):
    doc, tree = world["doc"], world["tree"]
    before = json.dumps(tree["arch"], sort_keys=True)
    view = rm.custody_view(doc, tree, "node")
    assert json.dumps(tree["arch"], sort_keys=True) == before, "no row's figures change"
    for v in view["comparisons"].values():
        assert all(set(r) == {"key", "reason"} for r in v["left"]), "a left row carries words, never a number"
    words = json.dumps(doc["custody"]).lower()
    assert not re.search(r"\b(score|weight|penalty|points|rating)\b", words)
    assert "Each Nation decides for itself" in view["fixed_line"] and "no number here stands for consent or custody" in view["fixed_line"]
    assert "custody" not in world["selectors"] and "custody" not in world["out"]["assumptions"], "not a setting of the model's numbers"
    assert all("custody" not in k for k in rm.flatten(tree)), "the tree holds no custody figure"


@need_files
def test_what_each_rule_keeps_and_lets_go(world):
    doc, tree = world["doc"], world["tree"]
    node = rm.custody_view(doc, tree, "node")["comparisons"]
    fed = rm.custody_view(doc, tree, "federated")["comparisons"]
    names = lambda v, side: {r["key"].split(".")[-1] for r in v[side]}
    assert names(node["A"], "left") == {"cloud", "cloud_with_sync", "cloud_same_grid"} and "local" in names(node["A"], "kept")
    assert names(node["C"], "kept") == {"federated"}, "only query in place keeps each Nation's data on its own node"
    assert names(fed["C"], "kept") == {"ten_copies", "federated", "federated_replicas"}
    assert names(node["B"], "left") == {"platform", "cache"}
    for rule in (node, fed):
        for row in ("node_100k_fallback", "node_1m_fallback", "laptop_with_fallback", "phone_wall_fallback"):
            assert row in names(rule["D"], "left"), row
        assert "colo" in names(rule["D"], "left") and "node_1m" in names(rule["D"], "kept")
    reason = {r["key"]: r["reason"] for r in node["D"]["left"]}
    assert "hyperscaler" in reason["arch.D.node_1m_fallback"]
    assert names(node["E"], "kept") == {"move_s3_node", "move_r2_node", "move_b2_node", "year_node"}
    assert {"year_federated", "move_s3_federated"} <= names(fed["E"], "kept") and "year_s3" in names(fed["E"], "left")


@need_files
def test_the_cost_of_a_rule_is_the_rows_own_figures_and_shows_where_local_loses(world):
    doc, tree = world["doc"], world["tree"]
    a = rm.custody_view(doc, tree, "node")["comparisons"]["A"]["cost"]
    t, up = tree["arch"]["A"], tree["upkeep"]["A"]
    assert a["lines"]["wh"]["kept"] == [t["local"]["wh"], t["local_two_boxes"]["wh"]] and a["lines"]["wh"]["left"] == [t["cloud"]["wh"], t["cloud_with_sync"]["wh"]]
    assert a["lines"]["usd"]["left"] == [t["cloud"]["usd"], t["cloud"]["usd"]] and a["lines"]["usd"]["bases"] == {"kept": ["self_run"], "left": ["seat_list"]}
    assert a["lines"]["idle_w"]["kept"] == [up["local"]["idle_w"], up["local_two_boxes"]["idle_w"]] and a["lines"]["idle_w"]["left"] == [0.0, 0.0]
    assert a["lines"]["admin_h"]["kept"][0] == world["base"]["office_admin_h_month"] * 12
    assert set(a["kept_higher_on"]) == {"idle_w", "admin_h", "usd", "wh"}, "local loses here, and the view says so"
    views = rm.custody_view(doc, tree, "node")["comparisons"]
    assert "wh" in views["E"]["cost"]["kept_higher_on"] and "usd" in views["E"]["cost"]["kept_lower_on"], "and it says where local wins"
    assert views["E"]["one_time"]["usd"] == [tree["arch"]["E"]["move_r2_node"]["usd"], tree["arch"]["E"]["move_s3_node"]["usd"]], "a one-time bill sits apart from the yearly lines"
    assert "one_time" not in views["A"]
    for letter in tree["arch"]:
        assert set(tree["upkeep"][letter]) == set(doc["architectures"][letter]["options"]), letter
    on = rm.compute({**world["base"], "already_on": 1})
    assert on["upkeep"]["D"]["node_1m"]["idle_w"] == 0 and on["upkeep"]["C"]["federated"]["idle_w"] < tree["upkeep"]["C"]["federated"]["idle_w"], "the already-on setting reaches the idle line"


# ---------------------------------------------------------------- the measured-by-us value

@need_files
def test_a_typed_value_recomputes_and_carries_the_label(world):
    doc, inputs, base = world["doc"], world["inputs"], world["base"]
    saved = json.dumps([inputs, base], sort_keys=True, default=str)
    ins, q, records = rm.apply_measured(doc, inputs, base, {"node_w": "62"})
    assert json.dumps([inputs, base], sort_keys=True, default=str) == saved, "a typed value changes nothing outside this run"
    assert q["node_w"] == 62 and ins["node_w"]["low"] == ins["node_w"]["high"] == 62 and ins["node_w"]["claims"] == [] and ins["node_w"]["status"] == rm.MEASURED_LABEL
    assert "node_w" not in rm.swept(ins), "it takes no spread from the record"
    assert records == [{"input": "node_w", "label": "AI node idle", "value": 62.0, "unit": "W", "model_value": 40, "replaces_claims": inputs["node_w"]["claims"], "note": rm.MEASURED_LABEL}]
    before, after = rm.flatten(world["tree"]), rm.flatten(rm.compute(q))
    moved = rm.moved_rows(before, after)
    assert "arch.D.node_100k" in moved and "arch.D.node_1m_fallback" in moved and "catalog.chat_prompt" not in moved and "arch.C.federated" not in moved
    assert after["arch.D.node_100k.wh"] == pytest.approx(before["arch.D.node_100k.wh"] + 22 * rm.HOURS * base["pue_room"] * base["prompts_block"] / base["node_prompts_100k"])
    line = rm.measured_line(records)
    assert line == "Includes your measurement, not verified by ATNI: AI node idle 62 W (model 40)."
    assert rm.measured_line([]) == ""


@need_files
def test_the_label_survives_copy_and_csv(world):
    doc, inputs, base = world["doc"], world["inputs"], world["base"]
    _, q, records = rm.apply_measured(doc, inputs, base, {"nas_w": 15})
    after = rm.flatten(rm.compute(q))
    moved = rm.moved_rows(rm.flatten(world["tree"]), after)
    line = rm.measured_line(records)
    assert rm.copied_reading("A Reading.", "arch.C.federated", records, moved) == "A Reading. " + line
    assert rm.copied_reading("A Reading.", "catalog.chat_prompt", records, moved) == "A Reading."
    import csv
    import io
    rows = list(csv.reader(io.StringIO(rm.outputs_csv(after, records, moved))))
    assert rows[0] == ["# " + line] and rows[1] == ["row", "measure", "value", "measured"]
    labels = {r[0]: r[3] for r in rows[2:]}
    assert labels["arch.C.federated"] == rm.MEASURED_LABEL and labels["catalog.chat_prompt"] == "" and all(v == rm.MEASURED_LABEL for k, v in labels.items() if k in moved)
    assert rm.outputs_csv(after, [], []).startswith("row,measure,value,measured"), "no line when nothing was typed"
    assert rm.MEASURED_LABEL == doc["measured"]["label"]
    assert {"row", "copy", "print", "csv", "address", "claims"} == set(doc["measured"]["travels"])


@need_files
def test_a_reading_equal_to_the_model_still_labels_every_row_that_reads_it(world):
    """Review of 11/05/2026, finding 4: an equal value moves no figure, yet takes the input out of the spread, so provenance follows what reads the input, not what moved."""
    doc, inputs, base = world["doc"], world["inputs"], world["base"]
    ins, q, records = rm.apply_measured(doc, inputs, base, {"nas_w": 46})
    before, after = rm.flatten(world["tree"]), rm.flatten(rm.compute(q))
    assert before == after and rm.moved_rows(before, after) == [], "the figures are the model's"
    moved = rm.moved_rows(before, after, rm.reading_probes(inputs, base, {"nas_w": 46}))
    assert {"arch.E.year_node", "arch.E.year_federated", "arch.C.federated", "arch.C.ten_copies"} <= set(moved) and "arch.E.year_s3" not in moved
    narrowed = rm.input_extremes(ins, q, {"arch.E.year_node.wh": after["arch.E.year_node.wh"]}, rm.one_at_a_time(ins, q))["arch.E.year_node.wh"]
    default = {r["key"]: r for r in world["out"]["architectures"]["E"]["options"]}["arch.E.year_node"]["energy_wh"]
    assert narrowed[0] > default["low"], "its spread narrowed"
    assert rm.copied_reading("A Reading.", "arch.E.year_node", records, moved).endswith(rm.measured_line(records))
    assert '"%s"' % rm.MEASURED_LABEL in [l for l in rm.outputs_csv(after, records, moved).splitlines() if l.startswith("arch.E.year_node,wh,")][0]


@need_files
def test_a_zero_reading_computes_and_has_no_idle_share(world):
    """Review of 11/05/2026, finding 1: a typed zero is allowed, and a row at zero energy has no share of idle in it."""
    for key, line in (("office_w", "office_server"), ("nas_w", "nas_own_node")):
        _, q, _ = rm.apply_measured(world["doc"], world["inputs"], world["base"], {key: 0})
        field = rm.compute(q)["field"]["idle"][line]
        assert field["idle_share"] is None and field["halves_at_w"] is None and field["doubles_at_w"] is None, key


@pytest.mark.parametrize("text", ["1_0", chr(0xFF11) + chr(0xFF10), chr(0x661) + chr(0x660), "inf", "nan", "Infinity", "1,000", "", "0x10"])
@need_files
def test_typed_text_follows_the_pages_grammar(world, text):
    """Review of 11/05/2026, finding 13: Python reads typed text as strictly as resource-model.js, so no underscore, other script's digits, or spelled infinity passes."""
    with pytest.raises(ValueError):
        rm.apply_measured(world["doc"], world["inputs"], world["base"], {"node_w": text})


@need_files
def test_a_typed_half_prints_as_python_and_the_page_print_it(world):
    _, _, records = rm.apply_measured(world["doc"], world["inputs"], world["base"], {"node_w": 12345.25})
    assert rm.measured_line(records).endswith("AI node idle 12345.2 W (model 40).")


@pytest.mark.parametrize("typed", [{"node_w": -1}, {"node_w": "many"}, {"node_w": True}, {"node_w": None}, {"node_w": float("nan")}, {"node_w": float("inf")}, {"u_room": 0}, {"pue_room": 0.5}, {"a_idle": 1.5}, {"p_in": 3}])
@need_files
def test_a_bad_typed_value_is_refused_and_says_why(world, typed):
    with pytest.raises(ValueError) as e:
        rm.apply_measured(world["doc"], world["inputs"], world["base"], typed)
    assert list(typed)[0] in str(e.value) or world["doc"]["measured"]["inputs"][list(typed)[0]]["label"] in str(e.value)


@need_files
def test_a_measured_input_is_an_input_and_no_setting_can_overwrite_it(world):
    spec = world["doc"]["measured"]["inputs"]
    assert set(spec) <= set(world["inputs"])
    set_by_settings = {k for s in world["selectors"].values() for setting in s["options"].values() for k in setting}
    assert not set(spec) & set_by_settings
    for key, rule in spec.items():
        assert rule["min"] <= world["inputs"][key]["low"] and world["inputs"][key]["high"] <= rule["max"], "the record's own spread stays typeable: " + key
    for name in ("node_w", "nas_w", "dev_phone", "a_idle", "u_room"):
        assert name in spec, "device watts, NAS watts, node idle, and the idle term"


@need_files
def test_a_typed_value_never_reaches_a_file_the_model_writes(world):
    out = json.dumps(world["out"])
    assert "62" not in json.dumps(world["out"]["measured"]) and "typed" not in {k for k in world["out"]}
    assert "your measurement" in out and "measured_values" not in out
    index = _claim_index()
    assert not [c for c in index.values() if rm.MEASURED_LABEL in json.dumps(c)], "the record holds no measured-by-us row"


# ---------------------------------------------------------------- the carbon damage layer

@need_files
def test_damage_is_off_by_default_and_never_one_number(world):
    spec, index = world["doc"]["carbon_damage"], _claim_index()
    assert spec["default"] == "off" and spec["column"] == "illustrative damage, not a price, not federal policy"
    assert re.fullmatch(r"\d\d/\d\d/\d{4}", spec["as_of"])
    assert rm.damage_column(world["doc"], 73.0) is None
    for name, family in spec["families"].items():
        numbers = {family[k] for k in ("low", "central", "high") if family[k] is not None}
        assert len(numbers) >= 2, name
        assert family["low"] <= (family["central"] if family["central"] is not None else family["low"]) <= family["high"], name
        assert family["claims"] and all(c.startswith("ex-") and index[c]["status"] in ("verified", "partly") for c in family["claims"]), name
        assert all(str(family[k]) in json.dumps([index[c]["quote"] for c in family["claims"]]) for k in ("low", "high")), name
        # one edition per family: its claims share the family's currency and price year, and one emission year
        assert {index[c]["unit"] for c in family["claims"]} == {family["unit"]} and len({index[c]["year"] for c in family["claims"]}) == 1, name
    assert not {"ex-008", "ex-009", "ex-010", "ex-011"} & {c for f in spec["families"].values() for c in f["claims"]}, "owner ruling of 11/05/2026: the newer editions set the figures; the earlier ones are history"
    assert "mv-005" in spec["federal_status"]


@need_files
def test_damage_reproduces_the_note_and_stays_in_its_own_column(world):
    doc = world["doc"]
    epa = doc["carbon_damage"]["families"]["epa_2020"]
    coding = rm.damage_column(doc, 73.0, "epa_2020")
    assert (coding["low"], coding["central"], coding["high"]) == (pytest.approx(0.00876), pytest.approx(0.01387), pytest.approx(0.02482))
    assert coding["column"] == doc["carbon_damage"]["column"] and coding["unit"] == epa["unit"] and coding["claims"] == epa["claims"] and coding["as_of"]
    project = rm.carbon_damage(306600e6, epa)
    assert (project["low"], project["central"], project["high"]) == (pytest.approx(36.792e6), pytest.approx(58.254e6), pytest.approx(104.244e6))
    assert rm.carbon_damage(1e6, doc["carbon_damage"]["families"]["epa_2019_domestic"])["central"] is None, "no invented midpoint"
    assert "price_usd" not in coding and "usd" not in coding
    flat = rm.flatten(world["tree"])
    assert not [k for k in flat if "damage" in k], "compute never reads it, so no price or ranking can"


@need_files
def test_an_avoidance_cost_never_wears_the_damage_head(world):
    """Review of 11/05/2026, finding 12: the head comes from the family's own kind, in the line and in the table."""
    for name, family in world["doc"]["carbon_damage"]["families"].items():
        column = rm.damage_column(world["doc"], 1e6, name)
        assert column["head"] == ("Avoidance cost" if family["kind"].startswith("avoidance") else "Damage"), name
    assert rm.damage_column(world["doc"], 1e6, "ec_2019")["head"] == "Avoidance cost"


@need_files
def test_no_dollar_on_water_health_fish_places_or_culture(world):
    spec = world["doc"]["carbon_damage"]
    assert spec["never"] == "No dollar on water, health, fish, places, or culture."
    words = json.dumps({k: v for k, v in spec.items() if k != "never"}).lower()
    assert not re.search(r"\b(water|health|fish|salmon|sacred|culture|place)\b", words)


@need_files
def test_the_damage_layer_lifts_out_clean(world):
    doc, cm = world["doc"], world["cm"]
    without = {k: v for k, v in doc.items() if k != "carbon_damage"}
    a, b = rm.build(doc, cm), rm.build(without, cm)
    assert "carbon_damage" in a and "carbon_damage" not in b
    assert {k: v for k, v in a.items() if k != "carbon_damage"} == b
    assert "carbon_damage" in world["out"]


# ---------------------------------------------------------------- the lines the page and the protocol read

@need_files
def test_idle_thresholds_follow_from_the_defaults(world):
    base, field = world["base"], world["tree"]["field"]["idle"]
    for name, key, row in (("node_100k", "node_w", "arch.D.node_100k"), ("node_1m", "node_w", "arch.D.node_1m"), ("office_server", "office_w", "arch.A.local"), ("nas_ten_nations", "nas_w", "arch.C.federated"),
                           ("nas_own_node", "nas_w", "arch.E.year_node"), ("media_box_1000", "mini_w", "arch.B.local_1000")):
        wh = row_of(world, row)["wh"]
        at = lambda w: rm.flatten(rm.compute({**base, key: w}))[row + ".wh"]
        assert at(field[name]["halves_at_w"]) == pytest.approx(0.5 * wh, rel=1e-9), name
        assert at(field[name]["doubles_at_w"]) == pytest.approx(2 * wh, rel=1e-9), name
    assert field["media_box_100000"]["halves_at_w"] is None, "a row mostly network and stream does not halve on idle alone"
    # the sentence this replaces said 20 W halves and 100 W doubles every local row; it holds for no default as written
    rows = rm.flatten(rm.compute({**base, "mini_w": 20}))
    assert rows["arch.B.local_1000.wh"] > 2 * world["tree"]["arch"]["B"]["local_1000"]["wh"], "twenty watts raises an 8 W box's row"
    assert field["node_100k"]["doubles_at_w"] < 100 and field["node_1m"]["halves_at_w"] < 20


@need_files
def test_the_cache_and_cost_lines_equal_a_rerun(world):
    base, field, tree = world["base"], world["tree"]["field"], world["tree"]
    top = rm.compute({**base, "cache_share": world["inputs"]["cache_share"]["high"]})["catalog"]
    assert field["cache_share_top"]["session_times"] == pytest.approx(top["coding_session"]["wh"] / tree["catalog"]["coding_session"]["wh"])
    assert field["cache_share_top"]["hour_times"] == pytest.approx(top["coding_hour"]["wh"] / tree["catalog"]["coding_hour"]["wh"])
    assert 1.7 < field["cache_share_top"]["hour_times"] < field["cache_share_top"]["session_times"] < 1.9, "near 0.25 raises the coding rows 1.7 to 1.9 times; it does not double them"
    assert field["coding_usd_miss_times"] == pytest.approx(3.2, abs=0.05)
    rows = {r["id"]: r for r in world["out"]["backtest"]["rows"]}
    assert rows["px-016"]["factor"] == pytest.approx(field["coding_usd_miss_times"], rel=1e-3), "the back-test row the sentence names"


@need_files
def test_the_two_derived_lines_hold(world):
    index, cat = _claim_index(), {r["key"]: r for r in world["out"]["catalog"]}
    mv = index["mv-004"]
    session, prompt = cat["catalog.coding_session"]["energy_wh"], world["base"]["e_prompt"]
    assert float("%.2g" % (session["low"] / prompt)) == mv["low"] == 30 and float("%.2g" % (session["high"] / prompt)) == mv["high"] == 2900
    assert str(session["low"]) in mv["derived"] and str(session["high"]) in mv["derived"] and mv["limit"]
    sf = index["sf-035"]
    cover = world["inputs"]["local_coverage"]
    for share, shown in ((cover["high"], "11"), (cover["central"], "29"), (cover["low"], "50")):
        assert "%.1f" % (100 - 100 * share) in sf["derived"] and "printed as %s" % shown in sf["derived"], shown


@need_files
def test_every_figure_resolves_to_a_claim_or_a_labeled_assumption(world):
    index = _claim_index()
    for key, v in world["inputs"].items():
        assert v["claims"] or v["kind"] == "assumed", key
        for c in v["claims"]:
            assert index[c]["status"] in ("verified", "partly"), (key, c)
        if not v["claims"]:
            assert v["note"], "an input with no source says so in words: " + key
    labels = world["doc"]["scenario_labels"]
    assert set(labels) == set(world["doc"]["scenario"]), "every number typed into the scenario has its label"
    for name, sel in world["doc"]["selectors"].items():
        literal = [v for setting in sel.get("options", {}).values() for v in setting.values() if isinstance(v, (int, float)) and not isinstance(v, bool)]
        if literal and name != "node_already_on":
            assert sel.get("claims") or re.search(r"no source|reader's own", sel.get("why", ""), re.I), name


# ---------------------------------------------------------------- the idle fit and the field protocol

def test_fit_idle_self_test():
    fit.self_test()


def test_fit_idle_prints_its_limit_beside_every_result():
    lines = fit.report(fit.FIXTURE, fit.FAKE_MODEL)
    results = [x for x in lines if not x.startswith("Warning") and x not in fit.CLOSING]
    assert results and all(x.endswith("Limit: one device's readings do not generalize.") for x in results)
    assert fit.CLOSING[-1] == "These readings stay with you. The public site receives nothing, and any release is that Nation's decision."
    assert "your measurement, not verified by ATNI" in fit.CLOSING[0]


def test_fit_idle_matches_a_second_estimator():
    import statistics
    rows = fit.read_rows(fit.FIXTURE)
    points = [(r["u"], r["w"]) for r in rows if r["phase"] == "sweep"]
    line = fit.fit_line(points)
    other = statistics.linear_regression([u for u, _ in points], [w for _, w in points])
    assert line["slope"] == pytest.approx(other.slope) and line["intercept"] == pytest.approx(other.intercept)


def test_fit_idle_refuses_a_bad_file_without_a_traceback(tmp_path, capsys, monkeypatch):
    bad = tmp_path / "bad.csv"
    bad.write_text("utilization,watts\n50,10\n", encoding="utf-8")
    monkeypatch.setattr("sys.argv", ["fit_idle.py", str(bad)])
    assert fit.main() == 2
    assert "0 to 1" in capsys.readouterr().err


def test_field_protocol_says_what_it_must():
    text = (ROOT / "docs" / "FIELD-PROTOCOL.md").read_text(encoding="utf-8")
    assert "The public site receives nothing" in text and "that Nation's decision" in text and "fit_idle.py" in text
    assert "your measurement, not verified by ATNI" in text and "do not generalize" in text
    assert chr(0x2014) not in text and " -- " not in text
    assert not re.search(r"[A-Za-z]:[/\\][A-Za-z]", text)
    assert not re.search(r"\b(?:tribal|tribes?|indigenous|intertribal)\b", text), "capitalized"
