#!/usr/bin/env python3
"""Live layer: posted and forecasted Grants.gov opportunities open to Tribal governments, tagged by energy type and cooling use.

Writes work/energy-funding/grants-gov-live.json (local; scripts/energy_funding.py joins it into the public file).
Uses the request shape of the policy-sentinel Grants.gov search (POST search2 with rows, keyword, oppStatuses
"forecasted|posted", startRecordNum and an eligibilities code), narrowed to code 07, Tribal governments. Standard library only.

    python scripts/grants_gov_live.py              # query Grants.gov (about 70 search calls, then one detail call per candidate; a few minutes)
    python scripts/grants_gov_live.py --self-test  # offline checks

How a hit is kept: search2 matches loosely, so each hit's title and description (fetchOpportunity) are re-read for the
keyword set. A hit is kept when a keyword is in the title, or in the description of an opportunity whose funding category
is energy, environment, housing, community development, disaster prevention, regional development or natural
resources, or when it is a notice of a catalog program (same assistance listing and title pattern).
Agency contacts (names, phones, emails) are never read into the output. This product uses the Grants.gov API but is not
endorsed or certified by the U.S. Department of Health and Human Services.
"""
from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "work" / "energy-funding" / "grants-gov-live.json"
SEARCH = "https://api.grants.gov/v1/api/search2"
DETAIL = "https://api.grants.gov/v1/api/fetchOpportunity"
SIMPLER = "https://simpler.grants.gov/opportunity/"
CLASSIC = "https://www.grants.gov/search-results-detail/"
ATTRIBUTION = ("This product uses the Grants.gov API but is not endorsed or certified by the U.S. Department of Health "
               "and Human Services.")
STATUSES = "forecasted|posted"
ELIGIBILITY = {"code": "07", "label": "Native American tribal governments (Federally recognized)"}
ROWS, MAX_PAGES, PAUSE = 100, 5, 0.3
GATE = {"EN", "ENV", "HO", "CD", "DPR", "RD", "NR"}  # funding categories that let a description-only match count

ENERGY_TERMS = {
    "solar": ["solar", "photovoltaic"],
    "wind": ["wind energy", "wind power", "wind turbine"],
    "offshore-wind": ["offshore wind"],
    "hydropower": ["hydropower", "hydroelectric", "hydrokinetic"],
    "marine": ["marine energy", "tidal energy", "wave energy", "marine and hydrokinetic"],
    "geothermal": ["geothermal"],
    "biomass": ["biomass", "woody biomass", "wood energy"],
    "bioenergy-fuels": ["biofuel", "biogas", "renewable natural gas", "anaerobic digestion"],
    "hydrogen": ["hydrogen", "fuel cell"],
    "storage": ["energy storage", "battery storage", "battery"],
    "microgrid": ["microgrid"],
    "efficiency": ["energy efficiency", "weatherization", "energy audit", "energy conservation"],
    "electrification": ["heat pump", "electrification", "electric vehicle", "EV charging"],
}
COOLING_TERMS = {
    "air-conditioning": ["air conditioning", "air conditioner", "HVAC", "cooling equipment"],
    "heat-pumps": ["heat pump"],
    "evaporative-cooling": ["evaporative cooling", "evaporative cooler", "swamp cooler"],
    "cool-roofs": ["cool roof", "reflective roof", "heat island"],
    "cooling-centers": ["cooling center", "extreme heat", "heat wave", "heat resilience"],
    "backup-power": ["backup power", "back-up power", "emergency power", "resilience hub", "standby generator"],
    "microgrids": ["microgrid"],
    "weatherization": ["weatherization", "weatherize"],
}
# Catalog programs whose notices are found by assistance listing and a title pattern, not by keyword.
PROGRAM_LINKS = {
    "doe_indian_energy": ("81.087", r"Tribal Energy|Indian Energy"),
    "doe_era": ("81.255", r"Rural or Remote"),
    "hud_icdbg": ("14.862", r"Indian Tribes and Alaska Native Villages|ICDBG"),
    "hud_ihbg": ("14.867", r"Indian Housing Block Grant"),
    "bia_emdp": ("15.038", r"Energy and Mineral Development"),
    "fema_bric": ("97.047", r"Building Resilient Infrastructure"),
    "epa_cprg_tribal": ("66.046", r"Climate Pollution Reduction"),
    "usda_hecg": ("10.859", r"High Energy Cost"),
    "usda_reap": ("10.868", r"Rural Energy for America"),
    "usda_cf": ("10.766", r"Community Facilities"),
    "usbr_watersmart": ("15.507", r"Water and Energy Efficiency"),
}
ALLOWED = {"number", "id", "title", "agency", "agency_code", "status", "doc_type", "posted_date", "close_date", "close_note",
           "assistance_listings", "funding", "funding_categories", "matches", "program_ids", "url", "url_verified"}


def iso_date(value) -> str | None:
    """Grants.gov writes MM/DD/YYYY; an empty value states no date."""
    if not value:
        return None
    m = re.fullmatch(r"(\d{2})/(\d{2})/(\d{4})", str(value))
    if not m:
        raise ValueError(f"unexpected date {value!r}")
    return dt.date(int(m[3]), int(m[1]), int(m[2])).isoformat()


def clean(text) -> str:
    """Decode the HTML entities Grants.gov leaves in titles and collapse whitespace."""
    return re.sub(r"\s+", " ", html.unescape(str(text or ""))).strip()


def number(value):
    """Grants.gov sends amounts as strings; empty or non-numeric means the agency stated none."""
    try:
        return int(value) if str(value).strip().lstrip("-").isdigit() else float(value)
    except (TypeError, ValueError):
        return None


def strip_tags(text) -> str:
    return clean(re.sub(r"<[^>]+>", " ", str(text or "")))


def term_regex(term: str) -> re.Pattern:
    """Whole-word, case-insensitive; spaces and hyphens in a term match each other; a plural 's' is allowed."""
    body = r"[\s-]+".join(re.escape(w) for w in re.split(r"[\s-]+", term.strip()))
    return re.compile(rf"(?<![A-Za-z]){body}s?(?![A-Za-z])", re.I)


def keyword_query(term: str) -> str:
    return f'"{term}"' if " " in term.strip() else term.strip()


def post(url: str, body: dict, tries: int = 4) -> dict:
    data = json.dumps(body).encode()
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(req, timeout=60) as r:
                out = json.load(r)
            if out.get("errorcode") != 0:
                raise RuntimeError(f"Grants.gov error {out.get('errorcode')}: {out.get('msg')}")
            return out
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503, 504) or attempt == tries - 1:
                raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == tries - 1:
                raise
        time.sleep(2 ** attempt)
    raise RuntimeError("unreachable")


def search_all(keyword: str = "", cfda: str = "") -> tuple[int, list[dict]]:
    hits, total = [], 0
    for page in range(MAX_PAGES):
        body = {"rows": ROWS, "keyword": keyword, "oppStatuses": STATUSES, "startRecordNum": page * ROWS,
                "eligibilities": ELIGIBILITY["code"]}
        if cfda:
            body["cfda"] = cfda
        data = post(SEARCH, body)["data"]
        total = int(data.get("hitCount") or 0)
        hits += data.get("oppHits") or []
        time.sleep(PAUSE)
        if len(hits) >= total or not data.get("oppHits"):
            break
    return total, hits


def detail(opp_id: str) -> dict:
    """Whitelisted fields of fetchOpportunity. Agency contacts are never read."""
    d = post(DETAIL, {"opportunityId": int(opp_id)})["data"]
    block = d.get("synopsis") or d.get("forecast") or {}
    desc = block.get("synopsisDesc") or block.get("forecastDesc") or ""
    return {
        "description": strip_tags(desc),
        "funding": {
            "estimated_total": number(block.get("estimatedFunding")), "award_ceiling": number(block.get("awardCeiling")),
            "award_floor": number(block.get("awardFloor")), "expected_awards": number(block.get("numberOfAwards")),
            "cost_sharing": block.get("costSharing"),
        },
        "categories": [c.get("id") for c in block.get("fundingActivityCategories") or [] if c.get("id")],
    }


def tag(title: str, description: str, categories: list[str]) -> list[dict]:
    """Keyword matches of one opportunity, after the relevance gate."""
    gated = bool(GATE & set(categories))
    found = []
    for kind, terms in (("energy_type", ENERGY_TERMS), ("cooling_use", COOLING_TERMS)):
        for ident, words in terms.items():
            for word in words:
                rx = term_regex(word)
                where = [w for w, text in (("title", title), ("description", description)) if rx.search(text)]
                if "title" in where or ("description" in where and gated):
                    found.append({"kind": kind, "id": ident, "term": word, "in": where})
    return found


def record(hit: dict, extra: dict, matches: list[dict], program_ids: list[str]) -> dict:
    forecast = hit.get("docType") == "forecast"
    return {
        "number": hit["number"], "id": hit["id"], "title": clean(hit["title"]),
        "agency": clean(hit.get("agency") or hit.get("agencyCode") or ""), "agency_code": hit.get("agencyCode") or None,
        "status": hit["oppStatus"], "doc_type": hit.get("docType"),
        "posted_date": iso_date(hit.get("openDate")),
        # A forecast's date is the agency's estimate, so it is never reported as the date applications close.
        "close_date": None if forecast else iso_date(hit.get("closeDate")),
        "close_note": ("Forecast: no close date; estimated dates are not deadlines" if forecast
                       else None if hit.get("closeDate") else "No close date listed"),
        "assistance_listings": hit.get("cfdaList") or [], "funding": extra["funding"], "funding_categories": extra["categories"],
        "matches": matches, "program_ids": program_ids,
    }


def verify_url(rec: dict) -> None:
    """Fetch the opportunity's simpler.grants.gov page; keep its final address only if the page names the opportunity."""
    try:
        req = urllib.request.Request(SIMPLER + rec["id"], headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as r:
            page = r.read(200_000).decode("utf-8", "replace")
            final = r.geturl()
        title = re.search(r"<title>(.*?)</title>", page, re.S)
        ok = bool(title) and clean(rec["title"])[:30].lower() in clean(title.group(1)).lower()
    except (urllib.error.URLError, TimeoutError):
        ok, final = False, ""
    rec["url"], rec["url_verified"] = (final, True) if ok else (CLASSIC + rec["id"], False)
    time.sleep(PAUSE)


def run(out: Path) -> dict:
    started = dt.datetime.now(dt.timezone.utc)
    queries, pool = [], {}  # pool: number -> {hit, queries: [(kind, id, term)], program_ids}

    def note(kind, ident, term, keyword, cfda, total, hits):
        queries.append({"kind": kind, "id": ident, "term": term, "keyword": keyword, "assistance_listing": cfda or None,
                        "request": {"rows": ROWS, "oppStatuses": STATUSES, "eligibilities": ELIGIBILITY["code"]},
                        "hit_count": total, "returned": len(hits),
                        "retrieved": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")})

    for kind, terms in (("energy_type", ENERGY_TERMS), ("cooling_use", COOLING_TERMS)):
        for ident, words in terms.items():
            for word in words:
                total, hits = search_all(keyword_query(word))
                note(kind, ident, word, keyword_query(word), "", total, hits)
                for h in hits:
                    pool.setdefault(h["number"], {"hit": h, "program_ids": []})
    for program_id, (aln, pattern) in PROGRAM_LINKS.items():
        total, hits = search_all("", aln)
        note("program_link", program_id, pattern, "", aln, total, hits)
        for h in hits:
            if re.search(pattern, clean(h["title"]), re.I):
                entry = pool.setdefault(h["number"], {"hit": h, "program_ids": []})
                entry["program_ids"].append(program_id)
    kept, skipped = [], []
    for number, entry in sorted(pool.items()):
        h = entry["hit"]
        extra = detail(h["id"])
        time.sleep(PAUSE)
        matches = tag(clean(h["title"]), extra["description"], extra["categories"])
        if not matches and not entry["program_ids"]:
            loose = tag(clean(h["title"]), extra["description"], sorted(GATE))
            skipped.append({"number": number, "title": clean(h["title"]), "agency": clean(h.get("agency") or ""), "status": h["oppStatus"],
                            "funding_categories": extra["categories"],
                            "reason": ("keyword only in the description of a notice outside the energy, environment, housing and related categories"
                                       if loose else "search2 matched elsewhere (likely the notice's attachments); no keyword in the title or synopsis"),
                            "terms": sorted({m["term"] for m in loose})})
            continue
        rec = record(h, extra, matches, sorted(set(entry["program_ids"])))
        verify_url(rec)
        kept.append(rec)
    kept.sort(key=lambda r: (r["status"] != "posted", r["close_date"] or "9999", r["number"]))
    data = {
        "schema": 1, "tier": "T0",
        "retrieved": started.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "retrieved_local": started.astimezone().strftime("%Y-%m-%d %H:%M %Z"),
        "source": {
            "service": "Grants.gov API (search2 and fetchOpportunity)", "endpoint": SEARCH,
            "request_shape": {"rows": ROWS, "keyword": "<term>", "oppStatuses": STATUSES, "startRecordNum": "<offset>",
                              "eligibilities": ELIGIBILITY["code"]},
            "request_shape_note": "Same body as the policy-sentinel Grants.gov search, with the Tribal government code only (policy-sentinel sends 07|11 for its Tribal filter).",
            "eligibility_filter": ELIGIBILITY, "attribution": ATTRIBUTION,
            "relevance_rule": "A hit is kept when a keyword is in its title, or in its description with an energy, environment, housing, community development, disaster prevention, regional development or natural resources funding category, or when it is a notice of a catalog program (same assistance listing and title pattern).",
            "contacts": "Agency contact names, phone numbers and email addresses are not read or kept.",
        },
        "caveats": [
            "Opportunities list who the agency says may apply; that is not a determination for any Tribe.",
            "A forecast has no close date; estimated dates are not deadlines.",
            "Funding amounts are the agency's estimates for the notice, not awards.",
        ],
        "counts": {"queries": len(queries), "candidates": len(pool), "kept": len(kept), "not_kept": len(skipped),
                   "posted": sum(r["status"] == "posted" for r in kept), "forecasted": sum(r["status"] == "forecasted" for r in kept)},
        "queries": queries, "opportunities": kept, "considered_not_kept": skipped,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    return data


def self_test() -> None:
    assert iso_date("03/25/2026") == "2026-03-25" and iso_date("") is None and iso_date(None) is None
    try:
        iso_date("2026-03-25")
        raise AssertionError("bad date accepted")
    except ValueError:
        pass
    assert clean("Tribal &ndash; Energy &amp; Power&rsquo;s  Grant") == "Tribal – Energy & Power’s Grant"
    assert strip_tags("<p>Heat&nbsp;pump <b>rebates</b></p>") == "Heat pump rebates"
    assert number("90000000") == 90000000 and number(2.5) == 2.5 and number("") is None and number(None) is None and number("n/a") is None
    assert keyword_query("heat pump") == '"heat pump"' and keyword_query("solar") == "solar"
    rx = term_regex("heat pump")
    assert rx.search("Air-source Heat-Pumps for homes") and not rx.search("overheat pumps") and not rx.search("heat pumpkin")
    assert term_regex("HVAC").search("new hvac systems") and not term_regex("solar").search("Solaris")
    # the relevance gate: title always counts; description counts only with a gated funding category
    assert tag("Tribal Microgrid Program", "", ["HL"]) == [
        {"kind": "energy_type", "id": "microgrid", "term": "microgrid", "in": ["title"]},
        {"kind": "cooling_use", "id": "microgrids", "term": "microgrid", "in": ["title"]}]
    assert any(m["id"] == "solar" for m in tag("Grant", "rooftop solar panels", ["EN"]))
    assert tag("Grant", "rooftop solar panels", ["HL"]) == []
    # a forecast never reports an estimated date as a close date
    hit = {"number": "X-1", "id": "1", "title": "A &ndash; B", "agency": "HUD", "agencyCode": "HUD", "oppStatus": "forecasted",
           "docType": "forecast", "openDate": "10/06/2026", "closeDate": "03/31/2027", "cfdaList": ["14.862"]}
    extra = {"funding": {}, "categories": ["HO"]}
    r = record(hit, extra, [], ["hud_icdbg"])
    assert r["close_date"] is None and "not deadlines" in r["close_note"] and r["posted_date"] == "2026-10-06"
    r2 = record(dict(hit, oppStatus="posted", docType="synopsis", closeDate="12/01/2026"), extra, [], [])
    assert r2["close_date"] == "2026-12-01" and r2["close_note"] is None
    r3 = record(dict(hit, oppStatus="posted", docType="synopsis", closeDate=""), extra, [], [])
    assert r3["close_date"] is None and r3["close_note"] == "No close date listed"
    assert set(r) | {"url", "url_verified"} <= ALLOWED and not any(re.search(r"(?i)email|phone|contact", k) for k in r)
    print("grants_gov_live self-test passed")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args()
    if args.self_test:
        self_test()
        return 0
    self_test()
    data = run(args.out)
    print(json.dumps(data["counts"]))
    print("wrote", args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
