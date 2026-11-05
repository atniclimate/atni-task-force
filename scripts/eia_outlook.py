#!/usr/bin/env python3
"""Pull EIA v2 AEO 2026 and STEO electricity series into work/site-refresh/evidence/raw/eia-outlook.json.

Needs env EIA_API_KEY (never written to disk). Stdlib only. `--self-test` runs offline checks.
"""
import json, os, sys, time, urllib.parse, urllib.request
from datetime import date

BASE = "https://api.eia.gov/v2"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "work", "site-refresh", "evidence", "raw", "eia-outlook.json")
QUAD_TO_BKWH = 1e15 / 3412.14 / 1e9  # 1 quad = 293.07 billion kWh (site energy, 3,412.14 Btu per kWh)
AEO_SCEN = {"cb2026": "Counterfactual Baseline case", "higheldmd": "High Electricity Demand",
            "lm2026": "Low Economic Growth", "hm2026": "High Economic Growth"}
AEO_T8 = ["cnsm_NA_comm_NA_els_NA_usa_blnkwh", "cnsm_NA_resd_NA_els_NA_usa_blnkwh", "cnsm_NA_idal_NA_els_NA_usa_blnkwh",
          "cnsm_NA_trn_NA_els_NA_usa_blnkwh", "cnsm_NA_elep_NA_els_NA_usa_blnkwh", "cnsm_NA_elep_NA_tel_NA_usa_blnkwh"]
AEO_T5 = ["cnsm_NA_comm_NA_prc_datactrserv_usa_qbtu", "cnsm_NA_comm_NA_prc_otheqp_usa_qbtu", "cnsm_NA_comm_NA_prc_dele_usa_qbtu"]
STEO = ["ELTCTWH", "ELCCTWH", "ELRCTWH", "ELICTWH"]


def get(path, params):
    key = os.environ.get("EIA_API_KEY")
    if not key:
        sys.exit("EIA_API_KEY is not set")
    url = BASE + path + "?" + urllib.parse.urlencode(params + [("api_key", key)])
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "ATNI-Energy-Task-Forces research script"}), timeout=60) as r:
                return json.load(r)["response"]["data"]
        except Exception as e:  # shortcut: broad retry, EIA returns sporadic 5xx and empty bodies
            err = str(e).replace(key, "***")
            time.sleep(2 * (attempt + 1))
    sys.exit("request failed for %s: %s" % (path, err))


def route(path, params):
    """Public route string without the key, used as each series' source url."""
    return BASE + path + "?" + urllib.parse.unquote(urllib.parse.urlencode(params + [("frequency", "annual"), ("data[0]", "value")]))


def fetch(path, params, id_field="seriesId"):
    rows = get(path, params + [("frequency", "annual"), ("data[0]", "value"), ("length", "5000")])
    out = {}
    for r in rows:
        s = out.setdefault((r.get(id_field), r.get("scenario"), r.get("seriesName") or r.get("seriesDescription")),
                           {"unit": r["unit"], "points": {}, "history": {}})
        s["points"][r["period"]] = float(r["value"])
        if "history" in r:
            s["history"][r["period"]] = r["history"]
    return out


def build(aeo_pairs, steo_rows):
    series = []
    for (path, params, unit_factor), rows in aeo_pairs:
        for (sid, scen, name), s in sorted(rows.items(), key=lambda kv: kv[0][0]):
            if scen not in AEO_SCEN:
                continue
            entry = {"source": "AEO2026", "route": route(path, params + [("facets[seriesId][]", sid), ("facets[scenario][]", scen)]),
                     "series_id": sid, "name": name, "scenario": scen, "scenario_name": AEO_SCEN[scen],
                     "unit": s["unit"], "points": s["points"], "history_flag": s["history"]}
            if unit_factor:  # quads converted to billion kWh, original kept
                entry["converted"] = {"unit": "BkWh", "factor": unit_factor,
                                      "points": {y: round(v * unit_factor, 3) for y, v in s["points"].items()}}
            series.append(entry)
    for (path, params), rows in steo_rows:
        for (sid, _, name), s in sorted(rows.items()):
            series.append({"source": "STEO", "route": route(path, params + [("facets[seriesId][]", sid)]), "series_id": sid,
                           "name": name, "unit": s["unit"], "points": s["points"],
                           "note": "Annual values; STEO does not flag actual versus forecast months in this route."})
    return series


def main():
    aeo = []
    for tid, ids, factor in (("8", AEO_T8, None), ("5", AEO_T5, QUAD_TO_BKWH)):
        params = [("facets[tableId][]", tid)]
        rows = fetch("/aeo/2026/data/", params + [("facets[seriesId][]", i) for i in ids])
        aeo.append((("/aeo/2026/data/", params, factor), rows))
    steo = []
    sp = [("facets[seriesId][]", i) for i in STEO]
    steo.append((("/steo/data/", []), fetch("/steo/data/", sp + [("start", "2015")])))
    doc = {"tier": "T0", "schema": 1, "retrieved": date.today().isoformat(),
           "note": "Series come from the EIA v2 API. cb2026 is the AEO2026 Counterfactual Baseline case (EIA's reference-type case). "
                   "Quads converted to BkWh at 293.07 BkWh per quad (3,412.14 Btu per kWh). The API key is never stored.",
           "series": build(aeo, steo)}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, indent=1)
    print("wrote", len(doc["series"]), "series to", os.path.normpath(OUT))


def self_test():
    assert abs(QUAD_TO_BKWH - 293.071) < 0.01
    assert abs(1.52 * QUAD_TO_BKWH - 445.5) < 0.2  # AEO2026 narrative: 446 BkWh in 2050
    rows = {("cnsm_NA_comm_NA_prc_datactrserv_usa_qbtu", "cb2026", "x"): {"unit": "quads", "points": {"2050": 1.0}, "history": {}},
            ("a", "other", "y"): {"unit": "quads", "points": {}, "history": {}}}
    out = build([(("/aeo/2026/data/", [("facets[tableId][]", "5")], QUAD_TO_BKWH), rows)], [])
    assert len(out) == 1 and "api_key" not in out[0]["route"] and out[0]["converted"]["points"]["2050"] == round(QUAD_TO_BKWH, 3)
    print("self-test ok")


if __name__ == "__main__":
    self_test() if "--self-test" in sys.argv else main()
