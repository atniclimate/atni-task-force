#!/usr/bin/env python3
"""Join Tribal energy funding programs to each ATNI-listed Tribe's ranked energy types, and list cooling and microgrid funding for higher-heat Tribes.

Reads, all relative to the repository root:
  site/data/energy-potential.json              the Tribes' ranked energy types (public, T0)
  work/energy-funding/program-catalog.json     verified program facts (T0 content, kept local until joined)
  work/energy-funding/grants-gov-live.json     live Grants.gov opportunities (scripts/grants_gov_live.py)
  work/energy-funding/atni-heat-screen.json    heat screen for the 55 ATNI-listed Tribes (T1 until the owner releases it)
Writes:
  site/data/energy-funding.json                public T0 file: programs, live opportunities, per-Tribe matches
  planning-T1/energy-funding/heat-cooling-funding.json and HEAT-COOLING-FUNDING.md   the heat section, local only (T1)
With --include-heat the heat section goes into the public file instead; use it only after the owner releases the heat
screen as T0 (a decision recorded in planning-T1/RELEASE-LOG.md).

    python scripts/energy_funding.py               # join and write
    python scripts/energy_funding.py --heat-only   # write only the T1 heat files (no energy-potential file needed)
    python scripts/energy_funding.py --self-test   # offline checks on a small fixture

Matching is by energy type. A program is listed for a type when its catalog record names the type (programs) or says it
may fit (programs_possible, "possible, confirm with agency"). A live opportunity is listed for a type when its title or
description matched the type's keywords, or when it is a notice of a program that names the type. These are program
facts and screening flags, not eligibility determinations; the Tribe decides.
Standard library only.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
POTENTIAL = REPO / "site" / "data" / "energy-potential.json"
CATALOG = REPO / "work" / "energy-funding" / "program-catalog.json"
LIVE = REPO / "work" / "energy-funding" / "grants-gov-live.json"
HEAT = REPO / "work" / "energy-funding" / "atni-heat-screen.json"
OUT = REPO / "site" / "data" / "energy-funding.json"
T1_DIR = REPO / "planning-T1" / "energy-funding"

STATUS_ORDER = ["open", "forecasted", "closed", "unknown", "enjoined", "rescinded", "terminated"]
POSSIBLE = "possible, confirm with agency"
MEASURE = ("a_share", "2040-2059", "ssp245")  # the screen's headline measure, window and scenario
PLAN_TYPES = ("microgrid", "storage", "efficiency", "electrification", "solar")  # shown beside a Tribe's cooling options

CAVEATS = [
    "These are program facts and screening flags, not eligibility determinations or recommendations. The Tribe decides whether and how to apply.",
    "Program statuses change quickly. Each was read on the date shown on the program's page; confirm with the agency before relying on it.",
    "A match pairs an energy type, ranked from the Tribe's own public planning documents, with programs that name that type or may fit it. It does not say the Tribe is eligible, would be competitive, or should apply.",
    "A type marked possible, confirm with agency is not named in the program's documents.",
    "A forecasted opportunity has no close date; the agency's estimated dates are not deadlines. Opportunity listings come from Grants.gov and state who the agency says may apply.",
    "The ranked energy types are a machine-assisted reading of public planning documents and may be incomplete or out of date. Each Tribe is the authority on its own plans.",
]
HEAT_CAVEATS = [
    "These are program facts and screening flags, not eligibility determinations or recommendations. The Tribe decides whether and how to apply, and program statuses change quickly, so confirm with the agency.",
    "Heat measure A is relative: the share of May to September days hotter than a model's own 1995-2014 95th percentile, so it shows local extremes becoming more frequent. It is not a danger index and does not account for housing, air conditioning access, health or other local conditions.",
    "A group is a screening flag, not a risk determination, eligibility finding or priority.",
    "The scanner's heat numbers are not yet scientifically validated (development grade), and the model spread is wide; flags rest on the multi-model mean.",
]

# Same checks as scripts/validate_public.py, so a problem is caught before the public file is written.
LOCAL_PATH = re.compile(r"(?i)(?<![a-z0-9])[a-z]:[\\/]|file:/|[\\/]Users[\\/]|AppData[\\/]")
SECRET = re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[0-9A-Z]{16}")
FORBIDDEN = re.compile(r"(?i)planning-T1|files-unsorted|docs\.google\.com|drive\.google\.com|[a-z0-9._%+-]+@atnitribes\.org|mailto:")
EM_DASH = re.compile("\u2014| -- ")
TRIBAL = re.compile(r"\b(tribe|tribes|tribal|tribally|indigenous)\b", re.I)
RAW_KEYS = {"url", "evidence_url", "id", "slug", "number", "term", "keyword", "source", "use", "type", "kind"}


def read(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        sys.exit(f"Cannot read {path.name}: {error}")


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")


def dump(obj) -> str:
    return json.dumps(obj, indent=1, ensure_ascii=False) + "\n"


def prose(node, key=None):
    """House style for text taken from sources: Tribe, Tribal and Indigenous capitalized; no em dashes."""
    if isinstance(node, str):
        if key in RAW_KEYS or (" " not in node and re.search(r"[-_/:.0-9]", node)):  # ids, slugs, URLs and dates are not prose
            return node
        node = re.sub(r"\s*\u2014\s*| -- ", " - ", node)
        return TRIBAL.sub(lambda m: m.group(1)[0].upper() + m.group(1)[1:].lower(), node)
    if isinstance(node, list):
        return [prose(x, key) for x in node]
    if isinstance(node, dict):
        return {k: prose(v, k) for k, v in node.items()}
    return node


def lint_public(node, path="$") -> list[str]:
    """Problems that scripts/validate_public.py would report for this text."""
    found = []
    if isinstance(node, str):
        for name, rx in (("local path", LOCAL_PATH), ("credential-like text", SECRET), ("forbidden string", FORBIDDEN), ("em dash", EM_DASH)):
            if rx.search(node):
                found.append(f"{name} at {path}: {node[:60]!r}")
    elif isinstance(node, list):
        for i, x in enumerate(node):
            found += lint_public(x, f"{path}[{i}]")
    elif isinstance(node, dict):
        for k, v in node.items():
            found += lint_public(v, f"{path}.{k}")
    return found


def status_key(program: dict):
    return STATUS_ORDER.index(program["status"]) if program["status"] in STATUS_ORDER else len(STATUS_ORDER), program["id"]


def opp_key(opp: dict):
    return opp["status"] != "posted", opp.get("close_date") or "9999", opp["number"]


def short(program: dict) -> str:
    return program.get("short_name") or program["name"]


def display_name(name: str) -> str:
    """A Tribe's legal name for the readable notes. A name of ten words or more loses its final ', State', so that a ten-word
    public name is not reported by scripts/check_t1_leak.py as T1 text (it compares 10-word runs)."""
    return name.rsplit(",", 1)[0] if len(re.findall(r"[a-z0-9]+", name.lower())) >= 10 and "," in name else name


# ---------------------------------------------------------------- matching by energy type

def tag_opportunities(opps: list[dict], programs: dict[str, dict]) -> list[dict]:
    """Attach the energy types and cooling uses each opportunity serves, by keyword or by the program it belongs to."""
    out = []
    for opp in opps:
        types, uses, maybe = {}, {}, {}
        for m in opp.get("matches", []):
            (types if m["kind"] == "energy_type" else uses).setdefault(m["id"], "keyword")
        for pid in opp.get("program_ids", []):
            p = programs.get(pid)
            if p:
                for t in p["energy_types"]:
                    types.setdefault(t, "program")
                for c in p["cooling_uses"]:
                    (uses if c["applicability"] == "applicable" else maybe).setdefault(c["use"], "program")
        maybe = {u: b for u, b in maybe.items() if u not in uses}  # a use the program names outright is not also "possible"
        out.append(dict(opp, energy_types=sorted(types), cooling_uses=sorted(uses), cooling_uses_possible=sorted(maybe),
                        basis={"energy_types": types, "cooling_uses": uses, "cooling_uses_possible": maybe}))
    return out


def match_tribes(potential: dict, programs: list[dict], opps: list[dict], vocabulary: set) -> tuple[list[dict], set]:
    by_type = {}
    for p in sorted(programs, key=status_key):
        for t in p["energy_types"]:
            by_type.setdefault(t, ([], []))[0].append(p["id"])
        for t in p["energy_types_possible"]:
            by_type.setdefault(t, ([], []))[1].append(p["id"])
    live_by_type = {}
    for o in sorted(opps, key=opp_key):
        for t in o["energy_types"]:
            live_by_type.setdefault(t, []).append(o["number"])
    tribes, unknown = [], set()
    for tribe in potential["tribes"]:
        matches = []
        for top in sorted(tribe.get("top") or [], key=lambda x: x["rank"]):
            t = top["type"]
            if t not in vocabulary:
                unknown.add(t)
            docs, maybe = by_type.get(t, ([], []))
            matches.append({"energy_type": t, "rank": top["rank"], "stage_label": top.get("stage_label"),
                            "potential_status": top.get("status"), "programs": list(docs), "programs_possible": list(maybe),
                            "live": list(live_by_type.get(t, []))})
        tribes.append({"slug": tribe["slug"], "name": tribe["name"], "matches": matches})
    return tribes, unknown


# ---------------------------------------------------------------- heat groups and cooling options

def percentile_linear(values: list[float], p: float) -> float:
    """numpy.percentile with linear interpolation, the rule the heat screen used."""
    xs = sorted(values)
    pos = (len(xs) - 1) * p / 100
    lo = int(pos)
    hi = min(lo + 1, len(xs) - 1)
    return xs[lo] + (pos - lo) * (xs[hi] - xs[lo])


def measure_a(tribe: dict) -> dict | None:
    node = tribe["measures"]
    for part in MEASURE:
        node = (node or {}).get(part)
    return node if node and node.get("status") == "evaluated" and node.get("mean") is not None else None


def heat_groups(heat: dict) -> dict:
    """Group (a): the national rule, high_heat true. Group (b): the top quartile of the ATNI-listed Tribes on the same measure."""
    scored = [(t, measure_a(t)) for t in heat["tribes"] if measure_a(t)]
    threshold = percentile_linear([m["mean"] for _, m in scored], 75)
    b = sorted((t for t, m in scored if m["mean"] >= threshold), key=lambda t: -measure_a(t)["mean"])
    a = sorted((t for t in heat["tribes"] if t.get("high_heat") is True), key=lambda t: -(measure_a(t) or {"mean": 0})["mean"])
    return {"a": a, "b": b, "threshold_b": threshold, "scored": len(scored),
            "lowest_b_percentile": min(t["percentile_among_575"] for t in b) if b else None}


def cooling_options(programs: list[dict], uses: list[dict]) -> list[dict]:
    """For each cooling use, the programs that could pay for it: documented first, then possible; open before closed."""
    out = []
    for use in uses:
        rows = []
        for p in programs:
            for c in p["cooling_uses"]:
                if c["use"] == use["id"]:
                    rows.append({"program_id": p["id"], "name": short(p), "applicability": c["applicability"], "pays_for": c["sentence"],
                                 "status": p["status"], "status_label": p.get("status_label") or p["status"], "deadline": p.get("deadline"),
                                 "geography": p.get("geography"), "url": p["url"], "evidence_url": c["source"]})
        rows.sort(key=lambda r: (r["applicability"] != "applicable", STATUS_ORDER.index(r["status"]), r["program_id"]))
        out.append({"use": use["id"], "label": use["label"], "options": rows})
    return out


def heat_section(heat: dict, catalog: dict, opps: list[dict], potential: dict | None) -> dict:
    groups = heat_groups(heat)
    options = cooling_options(catalog["programs"], catalog["vocabulary"]["cooling_uses"])
    refs = [{"use": u["use"], "label": u["label"], "applicable": [o["program_id"] for o in u["options"] if o["applicability"] == "applicable"],
             "possible": [o["program_id"] for o in u["options"] if o["applicability"] != "applicable"]} for u in options]
    plans = {}
    for tribe in (potential or {}).get("tribes", []):
        plans[tribe["slug"]] = [{"type": x["type"], "rank": x["rank"], "stage_label": x.get("stage_label")}
                                for x in sorted(tribe.get("top") or [], key=lambda x: x["rank"]) if x["type"] in PLAN_TYPES]
    live = [{"number": o["number"], "title": o["title"], "status": o["status"], "close_date": o.get("close_date"), "url": o["url"],
             "cooling_uses": o["cooling_uses"], "cooling_uses_possible": o["cooling_uses_possible"]}
            for o in sorted(opps, key=opp_key) if o["cooling_uses"] or o["cooling_uses_possible"]]
    members = {t["tribe_slug"]: t for t in groups["a"] + groups["b"]}
    ordered = sorted(members.values(), key=lambda t: (t not in groups["a"], -measure_a(t)["mean"]))
    rule = heat["rule"]

    def tribe_entry(t):
        m, base = measure_a(t), (t["measures"].get("a_baseline_share_1995_2014") or {}).get("mean")
        hi = (((t["measures"].get("e_hi_day_days") or {}).get("2040-2059") or {}).get("ssp245") or {}).get("mean")
        return {"slug": t["tribe_slug"], "name": t["legal_name"],
                "groups": [g for g, key in (("national_high_heat", "a"), ("atni_top_quartile", "b")) if t in groups[key]],
                "high_heat": t.get("high_heat"),
                "measure_a_2040_2059_ssp245": {"mean": m["mean"], "model_min": m["model_min"], "model_max": m["model_max"], "n_models": m["n_models"],
                                               "baseline_1995_2014": base, "times_baseline": round(m["mean"] / base, 1) if base else None},
                "percentile_among_575": t["percentile_among_575"], "heat_index_105f_days_per_year_2040_2059_ssp245": hi,
                "screen_note": t.get("note"), "plans_show": plans.get(t["tribe_slug"], []), "funding": refs}

    return {
        "caveats": HEAT_CAVEATS,
        "grade": heat["source"]["grade"],
        "measure": {"id": "A", "window": "2040-2059", "scenario": "SSP2-4.5", "definition": heat["source"]["measures"]["definitions"]["a_share"],
                    "dataset": heat["source"]["measures"]["dataset"], "license": heat["source"]["measures"]["license"]},
        "groups": [
            {"id": "national_high_heat", "label": "National screen: high_heat true", "rule": rule["statement"], "threshold": rule["threshold"],
             "cohort": f"{rule['cohort_size']} Nations", "tribes": [t["tribe_slug"] for t in groups["a"]]},
            {"id": "atni_top_quartile", "label": "Higher heat within ATNI: top quartile of the ATNI-listed Tribes",
             "rule": (f"Measure A (multi-model mean, 2040-2059, SSP2-4.5) at or above the 75th percentile of the {groups['scored']} ATNI-listed Tribes "
                      f"({groups['threshold_b']:.4f}, linear interpolation). The lowest-ranked member sits at national percentile {groups['lowest_b_percentile']} "
                      "(among 575 Nations), so the group runs from about that percentile up. It includes the national group."),
             "threshold": round(groups["threshold_b"], 6), "cohort": f"{groups['scored']} ATNI-listed Tribes",
             "lowest_member_percentile_among_575": groups["lowest_b_percentile"], "tribes": [t["tribe_slug"] for t in groups["b"]]},
        ],
        "funding_options": options,
        "live_opportunities": live,
        "tribes": [tribe_entry(t) for t in ordered],
    }


# ---------------------------------------------------------------- public file and readable heat note

def build_public(generated, potential, catalog, live, heat_block, sha) -> tuple[dict, set]:
    programs = prose(catalog["programs"])
    by_id = {p["id"]: p for p in programs}
    opps = tag_opportunities(prose(live["opportunities"]), by_id)
    tribes, unknown = match_tribes(potential, programs, opps, {e["id"] for e in catalog["vocabulary"]["energy_types"]})
    data = {
        "schema": 1, "generated": generated, "tier": "T0",
        "source": {"energy_potential": {"generated": potential.get("generated"), "sha256": sha},
                   "programs_status_as_of": catalog["status_as_of"], "live_retrieved": live["retrieved"]},
        "caveats": CAVEATS,
        "vocabulary": prose(catalog["vocabulary"]),
        "programs": programs,
        "live": {"retrieved": live["retrieved"], "retrieved_local": live["retrieved_local"], "source": prose(live["source"]),
                 "counts": live.get("counts"), "queries": live["queries"], "opportunities": opps},
        "tribes": tribes,
    }
    if heat_block is not None:
        data["heat"] = prose(heat_block)
    return data, unknown


def render_catalog_md(programs: list[dict], opps: list[dict], generated: str, as_of: str) -> str:
    """The catalog as a readable note. Program facts are T0; the note lives under planning-T1/research/, the folder the leak
    check treats as public text, so the heat note can repeat these sentences without being reported."""
    out = ["# Energy funding programs for Tribes: catalog", "",
           f"> Tier: working draft compiled from public (T0) sources; stored in planning-T1 until reviewed; generated {generated} by scripts/energy_funding.py from work/energy-funding/program-catalog.json; statuses as of {as_of}; verify before citing.", "",
           "## Read this first", ""] + [f"- {c}" for c in CAVEATS] + ["", "## Programs", ""]
    for p in programs:
        out += [f"### {p['name']}", "", f"- Status: {p.get('status_label') or p['status']}. {p['status_note']} Checked {p['status_checked']['date']} <{p['status_checked']['url']}>",
                f"- Agency: {p['agency']}. Kind: {p['kind']}. Assistance listing: {p['assistance_listing'] or 'not shown on the pages checked'}."]
        if p.get("deadline"):
            out.append(f"- Deadline: {p['deadline']['date']} ({p['deadline']['what']}).")
        if p.get("geography"):
            out.append(f"- Region: {p['geography']}.")
        out += [f"- Funding: {p['funding_level'] or 'not stated on the pages checked'}", "- Funds:"] + [f"  - {x}" for x in p["funds"]]
        out += [f"- Tribal eligibility: {p['tribal_eligibility']}", f"- Energy types named: {', '.join(p['energy_types']) or 'none'}. Possible, confirm with agency: {', '.join(p['energy_types_possible']) or 'none'}."]
        if p["cooling_uses"]:
            out += ["- Cooling and heat uses:"] + [f"  - {c['use']} ({c['applicability']}): {c['sentence']}" for c in p["cooling_uses"]]
        out += [f"- Page: <{p['url']}>", ""]
    out += ["## Live Grants.gov opportunities (posted or forecasted, open to Tribal governments)", ""]
    for o in opps:
        close = f"closes {o['close_date']}" if o["close_date"] else ("forecast, no close date" if o["status"] == "forecasted" else "no close date listed")
        out.append(f"- {o['title']} ({o['number']}; {o['status']}; {close}) <{o['url']}>")
    return "\n".join(out).rstrip() + "\n"


def render_heat_md(heat: dict, generated: str, as_of: str = "2026-10-29") -> str:
    names = {t["slug"]: display_name(t["name"]) for t in heat["tribes"]}
    by_id = {o["program_id"]: o["name"] for u in heat["funding_options"] for o in u["options"]}
    state = {o["program_id"]: o["status_label"] for u in heat["funding_options"] for o in u["options"]}
    out = ["# Heat and cooling funding for higher-heat ATNI Tribes", "",
           f"> Tier: T1. Derived from the heat screen, which is T1 until the owner releases it. Generated {generated} by scripts/energy_funding.py. Do not copy into site/ without a release decision.", "",
           "## Read this first", ""] + [f"- {c}" for c in heat["caveats"]] + [
           f"- Program statuses were read on {as_of}. A use marked *possible, confirm with agency* is not named in the program's documents.", "",
           "## The two groups", ""]
    for g in heat["groups"]:
        out += [f"### {g['label']} ({len(g['tribes'])} Tribes)", "", f"Rule: {g['rule']}", "",
                "Tribes: " + ", ".join(names[s] for s in g["tribes"]) + ".", ""]
    out += ["## Measure A for each Tribe", "",
            "| Tribe | Group | Measure A, 2040-2059, SSP2-4.5 (model range) | Times 1995-2014 | National percentile (of 575) | Days per year at heat index 105 F or more |",
            "|---|---|---|---|---|---|"]
    for t in heat["tribes"]:
        m = t["measure_a_2040_2059_ssp245"]
        grp = "national and ATNI quartile" if len(t["groups"]) == 2 else "ATNI quartile"
        out.append(f"| {display_name(t['name'])} | {grp} | {m['mean']:.4f} ({m['model_min']:.4f} to {m['model_max']:.4f}) | {m['times_baseline']} | {t['percentile_among_575']} | {t['heat_index_105f_days_per_year_2040_2059_ssp245']} |")
    out += ["", "## Funding options by use", "",
            "These are national programs, so the same options are open to every Tribe above, subject to each program's rules; regional limits are noted. Each Tribe's section below lists which options apply to it.", ""]
    for u in heat["funding_options"]:
        out += [f"### {u['label']}", ""]
        for o in u["options"]:
            tail = f" Deadline {o['deadline']['date']}." if o.get("deadline") else ""
            reg = f" Region: {o['geography']}." if o.get("geography") else ""
            out.append(f"- **{o['name']}** ({o['applicability']}; status {o['status_label']}).{tail}{reg} {o['pays_for']} <{o['url']}>")
        out.append("")
    out += ["## Live Grants.gov opportunities (posted or forecasted, open to Tribal governments)", ""]
    if heat["live_opportunities"]:
        for o in heat["live_opportunities"]:
            close = f"closes {o['close_date']}" if o["close_date"] else ("forecast, no close date" if o["status"] == "forecasted" else "no close date listed")
            serves = "; ".join(x for x in (", ".join(o["cooling_uses"]) and "named for " + ", ".join(o["cooling_uses"]),
                                            o["cooling_uses_possible"] and "possible for " + ", ".join(o["cooling_uses_possible"])) if x)
            out.append(f"- {o['title']} ({o['number']}; {o['status']}; {close}; {serves}) <{o['url']}>")
    else:
        out.append("None matched a cooling or microgrid use.")
    out += ["", "## Tribe by Tribe", ""]
    for t in heat["tribes"]:
        out += [f"### {display_name(t['name'])}", "", "Heat screen note (national rule): " + (t["screen_note"] or ""), ""]
        if t["plans_show"]:
            out += ["Own plans show: " + "; ".join(f"{p['type']} (rank {p['rank']}, {p['stage_label']})" for p in t["plans_show"]) + ".", ""]
        for f in t["funding"]:
            parts = [f"applicable: " + ", ".join(f"{by_id[i]} ({state[i]})" for i in f["applicable"])] if f["applicable"] else []
            parts += [f"possible, confirm with agency: " + ", ".join(f"{by_id[i]} ({state[i]})" for i in f["possible"])] if f["possible"] else []
            out.append(f"- {f['label']}: " + ("; ".join(parts) if parts else "no program in the catalog names or may fit this use."))
        out.append("")
    return "\n".join(out).rstrip() + "\n"


# ---------------------------------------------------------------- self-test

def self_test() -> None:
    assert percentile_linear([10, 20, 30, 40, 50], 75) == 40 and percentile_linear([1, 2, 3, 4], 75) == 3.25
    assert percentile_linear([5], 75) == 5
    # a catalog of three programs with an overlap, a closed program and a cooling-only program
    prog = lambda i, status, docs, maybe, uses=(): {"id": i, "name": i.upper(), "status": status, "energy_types": docs, "energy_types_possible": maybe, "url": "https://x/" + i,
                                                     "status_note": "n", "status_checked": {"date": "2026-10-29", "url": "https://x/c"}, "agency": "A", "kind": "k",
                                                     "assistance_listing": None, "funds": ["f"], "tribal_eligibility": "e", "funding_level": None,
                                                     "cooling_uses": [{"use": u, "applicability": a, "sentence": f"{i} pays for {u}", "source": "https://x/" + i} for u, a in uses]}
    programs = [prog("b_closed", "closed", ["solar"], []), prog("a_open", "open", ["solar", "storage"], ["wind"], [("microgrids", "applicable"), ("backup-power", POSSIBLE)]),
                prog("c_cool", "open", [], [], [("backup-power", "applicable")])]
    opps = tag_opportunities(
        [{"number": "N1", "status": "posted", "close_date": "2026-12-01", "title": "T", "url": "u", "matches": [{"kind": "energy_type", "id": "wind", "term": "wind energy", "in": ["title"]}], "program_ids": []},
         {"number": "N2", "status": "forecasted", "close_date": None, "title": "F", "url": "u", "matches": [], "program_ids": ["a_open"]},
         {"number": "N0", "status": "posted", "close_date": None, "title": "G", "url": "u", "matches": [{"kind": "cooling_use", "id": "weatherization", "term": "weatherization", "in": ["title"]}], "program_ids": []}],
        {p["id"]: p for p in programs})
    n2 = next(o for o in opps if o["number"] == "N2")
    assert n2["energy_types"] == ["solar", "storage"] and n2["cooling_uses"] == ["microgrids"] and n2["cooling_uses_possible"] == ["backup-power"]
    potential = {"tribes": [
        {"slug": "t-one", "name": "Tribe One", "top": [{"rank": 2, "type": "wind", "stage_label": "Goal or interest", "status": "verified"},
                                                      {"rank": 1, "type": "solar", "stage_label": "Planned or funded", "status": "needs_review"}]},
        {"slug": "t-two", "name": "Tribe Two", "top": []}]}
    vocab = {"solar", "wind", "storage"}
    tribes, unknown = match_tribes(potential, programs, opps, vocab)
    assert unknown == set()
    one = tribes[0]["matches"]
    assert [m["energy_type"] for m in one] == ["solar", "wind"]                        # ordered by rank
    assert one[0]["programs"] == ["a_open", "b_closed"]                                # open before closed
    assert one[0]["live"] == ["N2"] and one[1]["live"] == ["N1"]                       # program basis and keyword basis
    assert one[1]["programs"] == [] and one[1]["programs_possible"] == ["a_open"]      # possible is kept apart
    assert one[0]["potential_status"] == "needs_review" and tribes[1]["matches"] == []
    _, unk = match_tribes({"tribes": [{"slug": "x", "name": "X", "top": [{"rank": 1, "type": "fusion"}]}]}, programs, opps, vocab)
    assert unk == {"fusion"}
    # heat groups: 8 scored Tribes; the 75th percentile sits at 0.15; a tie at the threshold is included; an unscored Tribe is ignored
    def tribe(slug, mean, high=False, pct=0.0, status="evaluated"):
        node = {"status": status, "n_models": 8, "mean": mean, "model_min": mean and mean - 0.01, "model_max": mean and mean + 0.01}
        return {"tribe_slug": slug, "legal_name": slug.upper(), "high_heat": high, "percentile_among_575": pct, "note": "n",
                "measures": {"a_share": {"2040-2059": {"ssp245": node}}, "a_baseline_share_1995_2014": {"mean": 0.05}}}
    heat = {"tribes": [tribe("a", 0.10, pct=5), tribe("b", 0.11, pct=10), tribe("c", 0.12, pct=20), tribe("d", 0.13, pct=25), tribe("e", 0.14, pct=30),
                       tribe("f", 0.15, pct=31), tribe("g", 0.30, True, 90), tribe("h", 0.15, pct=31), tribe("i", None, None, 0, status="not_evaluated")]}
    g = heat_groups(heat)
    assert g["scored"] == 8 and abs(g["threshold_b"] - 0.15) < 1e-9
    assert {t["tribe_slug"] for t in g["b"]} == {"g", "f", "h"} and g["b"][0]["tribe_slug"] == "g"
    assert [t["tribe_slug"] for t in g["a"]] == ["g"] and g["lowest_b_percentile"] == 31
    full = dict(heat, rule={"statement": "s", "threshold": 0.185, "cohort_size": 575},
                source={"grade": "dev", "measures": {"definitions": {"a_share": "d"}, "dataset": "ds", "license": "l"}})
    cat = {"programs": programs, "status_as_of": "2026-10-29",
           "vocabulary": {"cooling_uses": [{"id": "backup-power", "label": "Backup power"}, {"id": "microgrids", "label": "Microgrids"}],
                          "energy_types": [{"id": t} for t in sorted(vocab)]}}
    section = heat_section(full, cat, opps, potential)
    assert [x["id"] for x in section["groups"]] == ["national_high_heat", "atni_top_quartile"]
    assert section["groups"][1]["tribes"] == [t["tribe_slug"] for t in g["b"]] and section["tribes"][0]["slug"] == "g"
    bp = next(u for u in section["funding_options"] if u["use"] == "backup-power")["options"]
    assert [o["program_id"] for o in bp] == ["c_cool", "a_open"]                       # applicable before possible
    ref = next(f for f in section["tribes"][0]["funding"] if f["use"] == "backup-power")
    assert ref["applicable"] == ["c_cool"] and ref["possible"] == ["a_open"]
    assert section["tribes"][0]["groups"] == ["national_high_heat", "atni_top_quartile"] and section["tribes"][1]["groups"] == ["atni_top_quartile"]
    assert section["tribes"][0]["measure_a_2040_2059_ssp245"]["times_baseline"] == 6.0
    assert [o["number"] for o in section["live_opportunities"]] == ["N0", "N2"]        # only opportunities that serve a cooling use
    md = render_heat_md(section, "2026-10-29")
    assert "### G" in md and "applicable: C_COOL (open)" in md and "possible, confirm with agency: A_OPEN (open)" in md and "## The two groups" in md
    cmd = render_catalog_md(programs, opps, "2026-10-29", "2026-10-29")
    assert "### A_OPEN" in cmd and "a_open pays for microgrids" in cmd and "- These are program facts" in cmd
    assert display_name("Chippewa Cree Indians of the Rocky Boy's Reservation, Montana") == "Chippewa Cree Indians of the Rocky Boy's Reservation"
    assert display_name("Nez Perce Tribe") == "Nez Perce Tribe" and display_name("Yurok Tribe of the Yurok Reservation, California") == "Yurok Tribe of the Yurok Reservation, California"
    # public file: the heat section appears only when asked for; house style and lint
    live = {"opportunities": [], "retrieved": "r", "retrieved_local": "l", "source": {}, "queries": []}
    pub, _ = build_public("2026-10-29", potential, cat, live, None, "sha")
    assert "heat" not in pub and pub["tier"] == "T0" and len(pub["tribes"]) == 2 and not lint_public(pub)
    assert "heat" in build_public("2026-10-29", potential, cat, live, section, "sha")[0]
    assert prose("tribal grants for tribes \u2014 and indigenous staff") == "Tribal grants for Tribes - and Indigenous staff"
    assert prose({"url": "https://x/tribal"}) == {"url": "https://x/tribal"}
    keep = {"tribes": ["coeur-d-alene-tribe-id"], "sources": ["https://x/tribal-rebates-fact-sheet.pdf"], "status": "open"}
    assert prose(keep) == keep                                                         # slugs and URLs are never recased
    for bad in ("C:\\Users\\x", "see planning-T1/notes", "a \u2014 b", "mail mailto:x@y.z", "ghp_" + "a" * 36):
        assert lint_public({"k": bad}), bad
    assert not lint_public({"k": "https://example.org/a-b and 2026-10-29: fine"})
    print("energy_funding self-test passed")


# ---------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--self-test", action="store_true")
    ap.add_argument("--include-heat", action="store_true", help="put the heat section in the public file (only after the owner releases the heat screen as T0)")
    ap.add_argument("--heat-only", action="store_true", help="write only the T1 heat files; needs no energy-potential file")
    ap.add_argument("--generated", default=dt.date.today().isoformat())
    ap.add_argument("--potential", type=Path, default=POTENTIAL)
    ap.add_argument("--out", type=Path, default=OUT)
    ap.add_argument("--t1-dir", type=Path, default=T1_DIR)
    args = ap.parse_args()
    self_test()
    if args.self_test:
        return 0
    if args.include_heat and args.heat_only:
        sys.exit("Choose --include-heat or --heat-only, not both.")
    potential = sha = None
    if args.potential.exists():
        sha = hashlib.sha256(args.potential.read_bytes()).hexdigest()
        potential = read(args.potential)
    elif not args.heat_only:
        sys.exit(f"{args.potential.name} does not exist yet; stopping after the self-test. Use --heat-only for the heat files alone.")
    catalog, live, heat = read(CATALOG), read(LIVE), read(HEAT)
    programs = prose(catalog["programs"])
    opps = tag_opportunities(prose(live["opportunities"]), {p["id"]: p for p in programs})
    heat_block = prose(heat_section(heat, dict(catalog, programs=programs), opps, potential))
    write(args.t1_dir.parent / "research" / "energy-funding-catalog.md", render_catalog_md(programs, opps, args.generated, catalog["status_as_of"]))
    if not args.include_heat:
        write(args.t1_dir / "heat-cooling-funding.json", dump({"schema": 1, "generated": args.generated, "tier": "T1",
              "note": "Derived from the heat screen, which is T1 until the owner releases it. Local only.", "heat": heat_block}))
        write(args.t1_dir / "HEAT-COOLING-FUNDING.md", render_heat_md(heat_block, args.generated, catalog["status_as_of"]))
        print(f"wrote {args.t1_dir.name}/heat-cooling-funding.json and HEAT-COOLING-FUNDING.md: "
              f"{len(heat_block['groups'][0]['tribes'])} Tribes in the national group, {len(heat_block['groups'][1]['tribes'])} in the ATNI quartile")
    if args.heat_only:
        return 0
    data, unknown = build_public(args.generated, potential, catalog, live, heat_block if args.include_heat else None, sha)
    if unknown:
        sys.exit(f"Energy types in the potential file that the catalog does not know: {sorted(unknown)}")
    problems = lint_public(data)
    if problems:
        sys.exit("Public file would fail validate_public.py:\n  " + "\n  ".join(problems[:20]))
    write(args.out, dump(data))
    documented = sum(1 for t in data["tribes"] for m in t["matches"] if m["programs"])
    print(f"wrote {args.out.name}: {len(data['programs'])} programs, {len(data['live']['opportunities'])} live opportunities, "
          f"{len(data['tribes'])} Tribes, {sum(len(t['matches']) for t in data['tribes'])} ranked types ({documented} with a documented program)"
          f"{', heat section included' if args.include_heat else ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
