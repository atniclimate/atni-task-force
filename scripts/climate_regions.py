"""County climate summaries from the NASA NEX-GDDP-CMIP6 v2.0 county pull. numpy is its one non-stdlib import.

Reads   the pull: <pool>/<model>/<scenario>/<variable>/<variable>_<year>.npy, a float32 (days, cells) block in the cell order of
        region_cells.json, and its .json marker (calendar, dates, source and natural units, cmip6_license, cell table sha256).
        The TCR extractor (I:/tcr-policy-scanner/tools/extract_nex_v2.py via tcr_downstream.cpre.ingest.nex_v2.gather_cells)
        stores values in natural units: tasmax in degC (source K), pr in mm/day (source kg m-2 s-1). The marker says which; this
        script converts from whatever the marker's natural_units names, and refuses any other unit.
        work/site-refresh/n5/region_cells.json (71 counties, 805 cells; cell coordinates are read for nothing but the count and never written out)
        site/data/projects.json (which counties hold a named record, and which a named data center of 50 MW or more)
Writes  site/data/climate-regions.json (T0; no cell coordinates, no Nation ids)

Method, per model and per year of the model's own calendar, at each cell: mean daily high over the year; mean daily high over the
days dated May to September; the count of days at or above 95 F (35 degC); the precipitation total (the sum of the daily totals).
Each metric is then averaged over the period's 20 years, then over the county's cells with equal weight per cell (a county spans at
most about 2 degrees of latitude here, so cos-latitude weights would differ from equal weights by under 2 percent of a cell's
weight). Across the seven models: the median, and the low and high as the minimum and maximum. Change is taken per model
(2040 to 2059 minus that model's 1995 to 2014), then summarized the same way.

    python -B scripts/climate_regions.py              (the pull lives at H:/raw-data/nex-gddp-cmip6-counties; --pool to point elsewhere)
    python -B scripts/climate_regions.py --self-test
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import sys
from datetime import date
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
POOL = Path("H:/raw-data/nex-gddp-cmip6-counties")
CELLS = ROOT / "work" / "site-refresh" / "n5" / "region_cells.json"
PROJECTS = ROOT / "site" / "data" / "projects.json"
OUT = ROOT / "site" / "data" / "climate-regions.json"

MODELS = ["ACCESS-ESM1-5", "CNRM-ESM2-1", "EC-Earth3", "GFDL-ESM4", "GISS-E2-1-G", "MIROC6", "MRI-ESM2-0"]
LEFT_OUT = "MPI-ESM1-2-HR"
PERIODS = {"baseline": ("historical", 1995, 2014), "future": (None, 2040, 2059)}
SCENARIOS = {"ssp245": "SSP2-4.5", "ssp370": "SSP3-7.0"}
METRICS = {
    "tmax_annual": {"label": "Daytime high, annual mean", "unit": "degF"},
    "tmax_summer": {"label": "Daytime high, May to September mean", "unit": "degF"},
    "days_95": {"label": "Days at or above 95 F", "unit": "days a year", "threshold": "tasmax >= 35 degC (95 F)"},
    "pr_annual": {"label": "Precipitation, annual total", "unit": "inches"},
}
SUMMER = range(5, 10)
HOT_C = 35.0  # 95 F exactly: (95 - 32) * 5 / 9
FIXED_DAYS = {"noleap": 365, "365_day": 365, "all_leap": 366, "366_day": 366, "360_day": 360}
GREGORIAN = {"standard", "gregorian", "proleptic_gregorian"}

SOURCE = {
    "title": "NASA Global Daily Downscaled Projections, CMIP6 (NEX-GDDP-CMIP6 v2.0)",
    "publisher": "NASA Center for Climate Simulation",
    "url": "https://doi.org/10.7917/OFSG3345",
    "published": "2025-05-31",
    "kind": "dataset",
}
TECH_NOTE = {"title": "NASA Earth eXchange Global Daily Downscaled Projections version 2 (NEX-GDDP-CMIP6 v2.0), Tech Note, latest update May 31, 2025",
             "url": "https://www.nccs.nasa.gov/wp-content/uploads/2025/06/NEX-GDDP-CMIP6-v2-Tech_Note.pdf", "read": "2026-11-05"}
CITATIONS = [
    "Thrasher, B., Wang, W., Michaelis, A. et al. (2022). NASA Global Daily Downscaled Projections, CMIP6. Sci Data 9, 262. https://doi.org/10.1038/s41597-022-01393-4",
    "Thrasher, B., Wang, W., Michaelis, A. Nemani, R. (2021). NEX-GDDP-CMIP6. NASA Center for Climate Simulation. https://doi.org/10.7917/OFSG3345",
]
METHOD_CITATION = ("Thrasher, B., Maurer, E. P., McKellar, C., & Duffy, P. B. (2012). Technical Note: Bias correcting climate model simulated daily temperature "
                   "extremes with quantile mapping. Hydrology and Earth System Sciences, 16(9), 3309-3314. doi:10.5194/hess-16-3309-2012")
ACKNOWLEDGEMENT = ("Climate scenarios used were from the NEX-GDDP-CMIP6 dataset, prepared by the Climate Analytics Group and NASA Ames Research Center using the "
                   "NASA Earth eXchange (NEX) and distributed by the NASA Center for Climate Simulation (NCCS).")
WCRP = ("We acknowledge the World Climate Research Programme, which, through its Working Group on Coupled Modeling, coordinated and promoted CMIP6. We thank the "
        "climate modeling groups for producing and making available their model output, the Earth System Grid Federation (ESGF) for archiving the data and providing "
        "access, and the multiple funding agencies who support CMIP6 and ESGF.")
RECOMMENDED_USE = ("This dataset is intended for use in scientific research only, and use of this dataset for other purposes, such as commercial applications, and "
                   "engineering or design studies is not recommended without consultation with a qualified expert.")
TERMS = ("All CMIP6 GCM model inputs, as noted in Table 1, and any derivatives work, such as this dataset, are governed by the original Terms of use "
         "(https://pcmdi.llnl.gov/CMIP6/TermsOfUse/TermsOfUse6-1.html) and may have some restrictions on usage. See the individual netcdf files for the data "
         "licensing, the global attribute \"cmip6_license\" notes the specific license the data may fall under.")
DESCRIPTION = ("The NEX-GDDP-CMIP6 dataset is comprised of global downscaled climate scenarios derived from the General Circulation Model (GCM) runs conducted under "
               "the Coupled Model Intercomparison Project Phase 6 (CMIP6)")
RESOLUTION = "Spatial resolution: 0.25 degrees x 0.25 degrees"
NATION_ID = re.compile(r"epa_1000\d{5}|tribe", re.I)


# Units and counts -----------------------------------------------------------------------------------

def to_degf(values, unit):
    """Temperature in K or degC to F."""
    if unit == "K":
        values = np.asarray(values, dtype=np.float64) - 273.15
    elif unit != "degC":
        raise SystemExit(f"temperature unit {unit!r} is neither K nor degC")
    return np.asarray(values, dtype=np.float64) * 9.0 / 5.0 + 32.0


def hot_threshold(unit):
    """95 F in the block's own unit, so the comparison never rounds a converted value."""
    return {"degC": HOT_C, "K": HOT_C + 273.15}[unit]


def daily_mm(values, unit):
    """A daily precipitation rate in kg m-2 s-1 or mm/day to millimeters for that day (1 kg m-2 of water is 1 mm)."""
    if unit == "kg m-2 s-1":
        return np.asarray(values, dtype=np.float64) * 86400.0
    if unit == "mm/day":
        return np.asarray(values, dtype=np.float64)
    raise SystemExit(f"precipitation unit {unit!r} is neither kg m-2 s-1 nor mm/day")


def inches(mm):
    return np.asarray(mm, dtype=np.float64) / 25.4


def calendar_days(calendar, year):
    if calendar in FIXED_DAYS:
        return FIXED_DAYS[calendar]
    if calendar in GREGORIAN:
        return 366 if (year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)) else 365
    raise SystemExit(f"unsupported calendar {calendar!r}")


def months_of(dates):
    """Month numbers from 'YYYY-MM-DD' strings, read as text: a 360-day calendar has 02-30, which a date parser refuses."""
    return np.array([int(d[5:7]) for d in dates])


def year_metrics_tmax(block, unit, dates):
    """Per cell, one model year: annual mean high (F), May to September mean high (F), days at or above 95 F (count in this year)."""
    summer = np.isin(months_of(dates), list(SUMMER))
    return {"tmax_annual": to_degf(block.mean(axis=0, dtype=np.float64), unit),
            "tmax_summer": to_degf(block[summer].mean(axis=0, dtype=np.float64), unit),
            "days_95": (block >= hot_threshold(unit)).sum(axis=0).astype(np.float64)}


def year_metrics_pr(block, unit):
    """Per cell, one model year: the total in inches, the sum of that year's daily totals."""
    return {"pr_annual": inches(daily_mm(block, unit).sum(axis=0))}


def summary(values):
    values = np.asarray(values, dtype=np.float64)
    return {"median": round(float(np.median(values)), 3), "low": round(float(values.min()), 3), "high": round(float(values.max()), 3)}


# Reading the pull ------------------------------------------------------------------------------------

class Pool:
    def __init__(self, root, table_sha):
        self.root, self.table_sha = Path(root), table_sha
        self.markers, self.npy = hashlib.sha256(), hashlib.sha256()
        self.files, self.bytes_streamed, self.licenses, self.calendars, self.finite = 0, 0, {}, {}, None

    def load(self, model, scenario, variable, year, n_cells):
        stem = self.root / model / scenario / variable / f"{variable}_{year}"
        raw_marker = stem.with_suffix(".json").read_bytes()
        marker = json.loads(raw_marker)
        raw = stem.with_suffix(".npy").read_bytes()
        block = np.load(io.BytesIO(raw))
        where = f"{model}/{scenario}/{variable}/{year}"
        if marker["cell_table_sha256"] != self.table_sha:
            raise SystemExit(f"{where}: pulled for another cell table")
        if (marker["model"], marker["scenario"], marker["variable"], marker["year"]) != (model, scenario, variable, year):
            raise SystemExit(f"{where}: the marker names another file")
        days = calendar_days(marker["calendar"], year)
        if block.shape != (days, n_cells) or list(block.shape) != marker["shape"] or len(marker["dates"]) != days:
            raise SystemExit(f"{where}: shape {block.shape} is not one {marker['calendar']} year of {n_cells} cells")
        if not all(d.startswith(f"{year:04d}-") for d in marker["dates"]):
            raise SystemExit(f"{where}: dates outside {year}")
        finite = np.isfinite(block).all(axis=0)
        self.finite = finite if self.finite is None else self.finite & finite
        self.markers.update(raw_marker)
        self.npy.update(raw)
        self.files += 1
        self.bytes_streamed += int(marker["bytes"])
        self.licenses.setdefault(variable, {}).setdefault(marker["cmip6_license"], set()).add(model)
        self.calendars.setdefault(model, set()).add(marker["calendar"])
        return block, marker["natural_units"], marker["dates"]


def model_period(pool, model, scenario, first, last, n_cells):
    """Per cell, the period mean of each metric for one model and scenario."""
    sums = {m: np.zeros(n_cells) for m in METRICS}
    for year in range(first, last + 1):
        block, unit, dates = pool.load(model, scenario, "tasmax", year, n_cells)
        parts = year_metrics_tmax(block, unit, dates)
        block, unit, _ = pool.load(model, scenario, "pr", year, n_cells)
        parts.update(year_metrics_pr(block, unit))
        for m in METRICS:
            sums[m] += parts[m]
    return {m: sums[m] / (last - first + 1) for m in METRICS}


def county_means(per_cell, regions):
    return {r["fips"]: {m: float(per_cell[m][r["cells"]].mean()) for m in METRICS} for r in regions}


def project_counties(projects):
    """FIPS of the counties the public list names: (any record, a named data center of 50 MW or more)."""
    named, dc = set(), set()
    for p in projects["projects"]:
        for c in p["counties"]:
            named.add(c["fips"])
            if p["kind"] == "data center" and isinstance(p["mw"], (int, float)) and p["mw"] >= 50:
                dc.add(c["fips"])
    return named, dc


def sha256_file(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def us_date(d):
    return d.strftime("%m/%d/%Y")


def build(pool_root=POOL, cells_path=CELLS, projects_path=PROJECTS, out=OUT):
    table = json.loads(Path(cells_path).read_bytes())
    table_sha = sha256_file(cells_path)
    regions, n_cells = table["regions"], len(table["cells"])
    if len(regions) != table["n_regions"] or n_cells != table["n_cells"]:
        raise SystemExit("region_cells.json counts disagree with its lists")
    named, dc = project_counties(json.loads(Path(projects_path).read_text(encoding="utf-8")))
    pool = Pool(pool_root, table_sha)

    # per model: {"baseline": {fips: {metric: v}}, "ssp245": {...}, "ssp370": {...}}
    runs = {}
    for model in MODELS:
        runs[model] = {"baseline": county_means(model_period(pool, model, "historical", 1995, 2014, n_cells), regions)}
        for s in SCENARIOS:
            runs[model][s] = county_means(model_period(pool, model, s, 2040, 2059, n_cells), regions)
        print(f"{model}: done", file=sys.stderr)

    out_regions, not_assessed = [], []
    for r in regions:
        fips = r["fips"]
        coverage = float(pool.finite[r["cells"]].mean())
        if coverage < 1.0:
            not_assessed.append({"fips": fips, "county": r["name"], "state": r["state"], "reason": f"{coverage:.0%} of its cells hold data in every file; a gap is never filled"})
            continue
        rec = {"fips": fips, "county": r["name"], "state": r["state"], "n_cells": r["n_cells"], "coverage": coverage,
               "named_in_projects": fips in named, "data_center_50mw": fips in dc, "baseline": {}, "future": {s: {} for s in SCENARIOS}, "change": {s: {} for s in SCENARIOS},
               "by_model": {"baseline": {}, **{s: {} for s in SCENARIOS}}}
        for m in METRICS:
            base = [runs[mo]["baseline"][fips][m] for mo in MODELS]
            rec["baseline"][m] = summary(base)
            rec["by_model"]["baseline"][m] = [round(v, 3) for v in base]
            for s in SCENARIOS:
                fut = [runs[mo][s][fips][m] for mo in MODELS]
                rec["future"][s][m] = summary(fut)
                rec["change"][s][m] = summary(np.array(fut) - np.array(base))
                rec["by_model"][s][m] = [round(v, 3) for v in fut]
        out_regions.append(rec)

    expected = len(MODELS) * 2 * 20 * (1 + len(SCENARIOS))
    if pool.files != expected:
        raise SystemExit(f"read {pool.files} files, expected {expected}")
    licenses = {v: {lic: sorted(models) for lic, models in by.items()} for v, by in pool.licenses.items()}
    data = {
        "schema": 1, "tier": "T0", "built": us_date(date.today()),
        "license": ("NASA's terms govern this file in place of the site's CC BY-NC-SA 4.0: the temperature figures (tmax_annual, tmax_summer, days_95) are CC BY-SA 4.0; "
                    "the precipitation figures (pr_annual) are CC BY 4.0, or CC0 1.0 for GISS-E2-1-G. Credit NASA with the acknowledgement under source."),
        "source": {**SOURCE, "citations": CITATIONS, "method_citation": METHOD_CITATION, "tech_note": TECH_NOTE,
                   "acknowledgement": ACKNOWLEDGEMENT, "acknowledgement_wcrp": WCRP, "recommended_use": RECOMMENDED_USE, "recommended_use_where": "Tech Note section 5.1",
                   "terms_of_use": TERMS, "description": DESCRIPTION, "resolution": RESOLUTION,
                   "license_by_variable": licenses,
                   "license_note": "Read from each file's cmip6_license attribute, as Tech Note section 7 directs. tasmax: CC BY-SA 4.0 for every file; pr: CC BY 4.0, except GISS-E2-1-G, CC0 1.0."},
        "boundaries": {"title": "Cartographic Boundary Files, counties, 1:500,000", "publisher": "U.S. Census Bureau", "url": table["boundaries"]["url"], "vintage": 2024,
                       "sha256": table["boundaries"]["sha256"]},
        "method": {
            "grid": "0.25 degree, about 25 km; a cell counts toward a county when its centre is inside the county (Census 2024 cartographic boundary)",
            "weighting": "equal weight per cell; cos-latitude weights would differ by under 2 percent of a cell's weight across any of these counties",
            "per_year": "each metric is computed per cell for each year of the model's own calendar, averaged over the 20 years, then over the county's cells",
            "metrics_detail": {"tmax_annual": "mean of the daily maximum over the year", "tmax_summer": "mean of the daily maximum over days dated May to September",
                               "days_95": "count of days with daily maximum at or above 35 degC (95 F) in each model year, averaged over years; a 365-day model year counts no 29 February",
                               "pr_annual": "sum of the daily precipitation totals over each model year, in inches"},
            "units": "the pull stores tasmax in degC (NASA files: K) and pr in mm/day (NASA files: kg m-2 s-1); F = degC x 9/5 + 32; inches = mm / 25.4",
            "models": len(MODELS), "model_list": MODELS,
            "model_left_out": {"model": LEFT_OUT, "reason": "left out of the planned eight to fit a 200 GB download cap"},
            "variants": "one realization per model: r1i1p1f1, or r1i1p1f2 for CNRM-ESM2-1 and GISS-E2-1-G",
            "calendars": {m: sorted(c) for m, c in sorted(pool.calendars.items())},
            "scenarios": SCENARIOS, "baseline": "1995-2014 (NASA's historical run; not a scenario)", "windows": {"2050": "2040-2059"},
            "spread": "median of seven models, with the lowest and highest model as the range; equal model weight; descriptive spread under one scenario, not a probability",
            "change": "per model, 2040-2059 minus that model's 1995-2014, then the median, lowest, and highest of the seven",
            "counties_note": "the 71 counties of the pull, drawn from a working list of proposals and utility requests; named_in_projects marks the counties a record in projects.json names, and data_center_50mw those where one is a data center of 50 MW or more",
            "inputs_sha256": {"region_cells": table_sha, "projects": sha256_file(projects_path), "script": sha256_file(__file__),
                              "markers_concatenated": pool.markers.hexdigest(), "npy_concatenated": pool.npy.hexdigest()},
            "inputs_note": f"{pool.files} files read; NASA source files streamed for them: {pool.bytes_streamed / 1e9:.1f} GB, each md5-checked against NASA's index by the TCR extractor",
        },
        "metrics": METRICS,
        "counties": [{"fips": r["fips"], "name": r["name"], "state": r["state"], "n_cells": r["n_cells"]} for r in regions],
        "regions": out_regions,
        "not_assessed": not_assessed,
    }
    text = json.dumps(data, indent=1, ensure_ascii=False)
    if "\"lat\"" in text or "\"lon\"" in text or NATION_ID.search(text):
        raise SystemExit("output holds a coordinate or a Nation id; refused")
    Path(out).write_text(text + "\n", encoding="utf-8", newline="\n")
    return {"regions": len(out_regions), "not_assessed": len(not_assessed), "files": pool.files, "named": sum(r["named_in_projects"] for r in out_regions),
            "dc_counties": sum(r["data_center_50mw"] for r in out_regions)}


# Self-test -------------------------------------------------------------------------------------------

def self_test():
    assert np.allclose(to_degf([273.15, 308.15], "K"), [32.0, 95.0])
    assert np.allclose(to_degf([0.0, 35.0, -40.0], "degC"), [32.0, 95.0, -40.0])
    rate = 25.4 / (86400 * 365)  # kg m-2 s-1 that gives one inch over a 365-day year
    assert np.isclose(inches(daily_mm(np.full(365, rate), "kg m-2 s-1").sum()), 1.0)
    assert np.isclose(inches(daily_mm(np.full(365, 25.4 / 365), "mm/day").sum()), 1.0)
    assert hot_threshold("K") == 308.15 and hot_threshold("degC") == 35.0
    # 365-day calendar, two cells: cell 0 has 10 days at exactly 95 F and one just under; cell 1 none
    d365 = [f"2041-{m:02d}-{d:02d}" for m in range(1, 13) for d in range(1, [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] + 1)]
    assert len(d365) == calendar_days("365_day", 2040) == 365
    b = np.full((365, 2), 20.0, dtype=np.float32)
    b[180:190, 0] = 35.0
    b[190, 0] = 34.99
    got = year_metrics_tmax(b, "degC", d365)
    assert got["days_95"].tolist() == [10.0, 0.0]
    assert np.isclose(got["tmax_summer"][1], 68.0) and np.isclose(got["tmax_annual"][1], 68.0)
    # 360-day calendar (30-day months, 02-30 exists): May to September is 150 days; the same count works in kelvin
    d360 = [f"2041-{m:02d}-{d:02d}" for m in range(1, 13) for d in range(1, 31)]
    assert len(d360) == calendar_days("360_day", 2041) == 360 and "2041-02-30" in d360
    k = np.full((360, 1), 293.15, dtype=np.float32)
    k[120:270, 0] = 303.15  # May 1 to September 30 at 30 C
    k[200:209, 0] = 308.15  # nine of them at 95 F
    got = year_metrics_tmax(k, "K", d360)
    assert got["days_95"].tolist() == [9.0]
    assert np.isclose(got["tmax_summer"][0], (141 * 86.0 + 9 * 95.0) / 150, atol=1e-3)
    assert np.isin(months_of(d360), list(SUMMER)).sum() == 150
    s = summary([3, 1, 2, 7, 5, 4, 6])
    assert s == {"median": 4.0, "low": 1.0, "high": 7.0}
    assert calendar_days("proleptic_gregorian", 2000) == 366 and calendar_days("standard", 1900) == 365 and calendar_days("noleap", 2040) == 365
    assert NATION_ID.search("epa_100000171") and NATION_ID.search("tribe_id")
    return True


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--pool", default=POOL)
    ap.add_argument("--cells", default=CELLS)
    ap.add_argument("--projects", default=PROJECTS)
    ap.add_argument("--out", default=OUT)
    a = ap.parse_args()
    if a.self_test:
        self_test()
        print(json.dumps({"self_test": "passed"}))
        return
    self_test()
    print(json.dumps(build(a.pool, a.cells, a.projects, a.out)))


if __name__ == "__main__":
    main()
