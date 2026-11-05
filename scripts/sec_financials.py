#!/usr/bin/env python3
"""Pull annual (FY2018+) and recent-quarter XBRL facts for seven companies from data.sec.gov.

Writes work/site-refresh/evidence/raw/sec-financials.json. Stdlib only. T0 (public filings).
Run `python scripts/sec_financials.py --self-test` to check the filter, then run with no args.
"""
import json, sys, time, urllib.request, urllib.error
from datetime import date
from pathlib import Path

UA = "ATNI-Energy-Task-Forces research script"
OUT = Path(__file__).resolve().parent.parent / "work/site-refresh/evidence/raw/sec-financials.json"
CIKS = {"Microsoft": 789019, "Alphabet": 1652044, "Amazon": 1018724, "Meta": 1326801,
        "Apple": 320193, "NVIDIA": 1045810, "Tesla": 1318605}
# metric -> candidate us-gaap tags; every tag that returns data is kept so the tag choice stays visible
METRICS = {
    "capex": ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"],
    "operating_cash_flow": ["NetCashProvidedByUsedInOperatingActivities"],
    "cash": ["CashAndCashEquivalentsAtCarryingValue"],
    "marketable_securities_current": ["MarketableSecuritiesCurrent", "AvailableForSaleSecuritiesDebtSecuritiesCurrent", "DebtSecuritiesCurrent", "ShortTermInvestments"],
    "marketable_securities_noncurrent": ["MarketableSecuritiesNoncurrent", "AvailableForSaleSecuritiesDebtSecuritiesNoncurrent", "LongTermInvestments"],
    "equity_holdings": ["EquitySecuritiesFvNi", "EquitySecuritiesWithoutReadilyDeterminableFairValueAmount"],
    "long_term_debt": ["LongTermDebt", "LongTermDebtNoncurrent", "LongTermDebtAndCapitalLeaseObligations"],
    "share_repurchases": ["PaymentsForRepurchaseOfCommonStock"],
    "revenue": ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet"],
}
FIRST_YEAR = 2018


def days(start, end):
    return (date.fromisoformat(end) - date.fromisoformat(start)).days if start else None


def keep(facts):
    """Filter USD facts from 10-K/10-Q ending 2018+; dedupe on (start,end) keeping the latest filing."""
    best = {}
    for f in facts:
        if f.get("form") not in ("10-K", "10-Q") or f["end"] < f"{FIRST_YEAR}-01-01":
            continue
        k = (f.get("start"), f["end"])
        if k not in best or f["filed"] > best[k]["filed"]:
            best[k] = f
    rows = []
    for (s, e), f in sorted(best.items(), key=lambda kv: (kv[0][1], kv[0][0] or "")):
        d = days(s, e)
        kind = "instant" if d is None else "annual" if 350 <= d <= 380 else "quarter" if 80 <= d <= 100 else "ytd" if d > 100 else "other"
        rows.append({"start": s, "end": e, "val": f["val"], "fy": f.get("fy"), "fp": f.get("fp"), "form": f["form"],
                     "filed": f["filed"], "period": kind})
    return rows


def fetch(cik, tag):
    url = f"https://data.sec.gov/api/xbrl/companyconcept/CIK{cik:010d}/us-gaap/{tag}.json"
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.load(r)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return url, None
        raise
    finally:
        time.sleep(0.4)  # about 2 requests per second
    return url, keep(data.get("units", {}).get("USD", []))


def main():
    out = {"retrieved": date.today().isoformat(), "user_agent": UA, "companies": {}}
    for name, cik in CIKS.items():
        co = out["companies"][name] = {"cik": cik, "series": {}, "gaps": []}
        for metric, tags in METRICS.items():
            found = False
            for tag in tags:
                url, rows = fetch(cik, tag)
                if rows:
                    found = True
                    co["series"].setdefault(metric, {})[tag] = {"url": url, "rows": rows}
            if not found:
                co["gaps"].append(metric)
        print(name, {m: list(t) for m, t in co["series"].items()}, "gaps:", co["gaps"], flush=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=1), encoding="utf-8")
    print("wrote", OUT)


def self_test():
    mk = lambda s, e, v, filed, form="10-K": {"start": s, "end": e, "val": v, "filed": filed, "form": form, "fy": 2020, "fp": "FY"}
    rows = keep([mk("2019-07-01", "2020-06-30", 1, "2020-07-30"), mk("2019-07-01", "2020-06-30", 2, "2021-07-30"),
                 mk("2017-01-01", "2017-12-31", 9, "2018-02-01"), mk("2020-07-01", "2020-09-30", 3, "2020-10-30", "10-Q"),
                 mk(None, "2020-06-30", 4, "2020-07-30"), mk("2020-01-01", "2020-12-31", 5, "2021-02-01", "8-K")])
    assert [(r["val"], r["period"]) for r in rows] == [(2, "annual"), (4, "instant"), (3, "quarter")] or \
           [(r["val"], r["period"]) for r in rows] == [(4, "instant"), (2, "annual"), (3, "quarter")], rows
    assert days("2020-01-01", "2020-12-31") == 365
    print("self-test ok")


if __name__ == "__main__":
    self_test() if "--self-test" in sys.argv else main()
