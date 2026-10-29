#!/usr/bin/env python3
"""Top energy types that ATNI-listed Tribes' own public planning documents show potential for.

Steps (each reads the files the previous step wrote under work/energy-potential/):
  build   read the plan-assessor library (read-only), screen documents, retrieve passages
  probe   send chosen passages to Jev and print every answer (wording check before the run)
  run     send every passage to Jev (cached by payload hash), then rank the types in code
  verify  second Jev pass per ranked claim, then write site/data/energy-potential.{json,csv}
  check   validate the public files against the work files

Jev judges each passage; the truth table in decide() makes the decisions. The library root comes from
--plan-assessor or PLAN_ASSESSOR_ROOT. Only T0 passages from public documents are ever sent to the API.
"""
from __future__ import annotations

import argparse
import bisect
import concurrent.futures
import csv
import datetime as dt
import hashlib
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
WORK = REPO / "work" / "energy-potential"
SITE_JSON = REPO / "site" / "data" / "energy-potential.json"
SITE_CSV = REPO / "site" / "data" / "energy-potential.csv"
SOURCES = {  # relative to the plan-assessor root; read, never written
    "registry": "src/plan_assessor/resources/registry/tribes-v1.json",
    "crosswalk": "src/plan_assessor/resources/registry/library-tribe-crosswalk-v1.json",
    "ledger": "data/library/discovery-20261022T120753Z-national/corpus-ledger-001/corpus-ledger-007.json",
    "inventory": "research/library-campaign-20261024/codex-lane/w4-inventory-jev-001/inventory.json",
}
RUN_DIR = "runs/library-campaign-20261025-001"
# Owner-excluded Gila River Indian Community Hazard Mitigation Plan (FOUO marking): never sent to an external API.
GILA_SHA = "9bdb01e475cd3f28db9f4ae1697c846715dd97668fc91ffa63c8517b949491d7"
ENDPOINT = "https://api.typesafe.ai/v1/systemone"
MODEL = "jev-1.14.0"  # pinned: the inventory's document screens came from this version

# ---- Every number the decisions read ----
YES, NO = 0.7, 0.3                  # Noul thresholds (TypeSafe starting values; not fitted to cases)
PREPARED_MIN, PLAN_MIN = 0.7, 0.5   # document screens from the inventory's Jev answers
STAGE_MIN, REJECT_OVERRIDE = 0.5, 3  # drop below "Goal or interest"; a rejection stands unless planned or built
DOC_BONUS, DOC_BONUS_CAP = 0.25, 3  # score = best_stage + 0.25 * min(n_docs - 1, 3)
TOP_N, VERIFY_DEPTH = 5, 7          # publish 5; verify 2 more so a dropped claim can be replaced
PER_TYPE, PER_DOC_TYPE, PER_TRIBE = 6, 3, 45
PASSAGE_MIN, PASSAGE_MAX, MERGED_MAX = 600, 1500, 1800
EXCERPT_MAX, CITATIONS_MAX = 280, 3
USABLE_PAGE_CHARS, USABLE_SHARE = 100, 0.5  # a document is readable when half its pages hold 100+ characters
MAX_REQUESTS, WORKERS = 4000, 4
STAGE_READING = "mode"  # stage per passage = most probable level (see docs/ENERGY-POTENTIAL.md)
STAGE_LABELS = ((3.5, "Installed or operating"), (2.5, "Planned or funded"), (1.5, "Assessed or sited"),
                (0.5, "Goal or interest"))
THIS_YEAR = dt.date.today().year
# Claims a person checked against the source pages and found wrong. They are withheld from the public files and
# logged in verify.json; delete an entry to publish the claim again.
WITHHELD = {
    ("shoshone-paiute-tribes-of-the-duck-valley-reservation-nv", "electrification"):
        "Spot-check 2026-10-29: the cited EV charging measure belongs to the Shoshone-Bannock Tribes in a plan shared "
        "by four Tribes (Upper Snake River Tribes PCAP, pages 96-97).",
}

# ---- Taxonomy: (id, label, category, wording used in questions, case-insensitive patterns) ----
TAXONOMY = [
    ("solar", "Solar energy", "generation", "solar energy", [
        r"\bsolar[\s-]+(?:energy|power(?:ed)?|panels?|arrays?|pv|photovoltaics?|farms?|projects?|installations?|"
        r"systems?|generation|electric(?:ity)?|thermal|hot[\s-]+water|modules?|facilit(?:y|ies)|carports?|"
        r"canop(?:y|ies)|resources?|potential|capacity|gardens?|developments?|programs?)\b",
        r"\b(?:community|rooftop|roof[\s-]+mounted|ground[\s-]+mounted|floating|residential)[\s-]+solar\b",
        r"\bphotovoltaics?\b", r"\bagrivoltaics?\b",
        r"\b(?:wind|hydro(?:power)?)\s*(?:and|or|/|&|,)\s*solar\b"]),
    ("wind", "Wind energy", "generation", "wind energy", [
        r"(?<!offshore\s)(?<!floating\s)\bwind[\s-]+(?:energy|power(?:ed)?|turbines?|farms?|resources?|generation|"
        r"projects?|developments?|facilit(?:y|ies)|generators?|installations?|electricity)\b",
        r"\bsmall[\s-]+wind\b",
        r"(?<!offshore\s)\bwind\s*(?:and|or|/|&)\s*solar\b",
        r"\bsolar\s*(?:and|or|/|&|,)\s*wind\b"]),
    ("offshore-wind", "Offshore wind energy", "generation", "offshore wind energy", [
        r"\boffshore[\s-]+wind\b", r"\bfloating[\s-]+(?:offshore[\s-]+)?wind\b"]),
    ("hydropower", "Hydropower", "generation", "hydropower", [
        r"\bhydro[\s-]?power\b", r"\bhydro[\s-]?electric(?:ity|al)?\b", r"\bmicro[\s-]?hydro\b",
        r"\bsmall[\s-]+hydro\b", r"\brun[\s-]+of[\s-]+(?:the[\s-]+)?river\b", r"\bin[\s-]+conduit[\s-]+hydro"]),
    ("marine", "Marine energy (tidal or wave)", "generation", "marine energy (tidal or wave)", [
        r"\btidal[\s-]+(?:energy|power|turbines?|generation|current[\s-]+energy|stream[\s-]+energy)\b",
        r"\b(?:tidal|wave)\s+(?:and|or|/|&)\s+(?:tidal|wave)\s+(?:energy|power)\b",
        r"(?<!heat\s)\bwave[\s-]+power\b",
        r"(?<!heat\s)\bwave[\s-]+energy[\s-]+(?:converters?|devices?|projects?|generation|technolog(?:y|ies)|"
        r"developers?|developments?|test(?:ing)?|sites?|facilit(?:y|ies)|resources?)\b",
        r"\bmarine[\s-]+(?:energy|renewable(?:s|[\s-]+energy)?|hydrokinetics?)\b", r"\bhydrokinetics?\b",
        r"\bocean[\s-]+energy\b"]),
    ("geothermal", "Geothermal energy", "generation", "geothermal energy (including ground-source heat pumps)", [
        r"\bgeothermal\b", r"\bground[\s-]+source[\s-]+heat[\s-]+pumps?\b", r"\bgeo[\s-]?exchange\b"]),
    ("biomass", "Biomass energy", "generation", "biomass energy (including wood energy and combined heat and power)", [
        r"\b(?:woody|forest|wood|agricultural|timber)[\s-]+biomass\b",
        r"\bbiomass[\s-]+(?:energy|power|heat(?:ing)?|fuels?|boilers?|facilit(?:y|ies)|plants?|generation|"
        r"electricity|thermal|utilization|projects?|cogeneration|feedstocks?|supply|district|fired|fueled|markets?)\b",
        r"\bwood[\s-]+(?:energy|pellets?)\b", r"\bbiochar\b", r"\bcombined[\s-]+heat[\s-]+(?:and|&)[\s-]+power\b",
        r"\bco[\s-]?generation\b"]),
    ("bioenergy-fuels", "Biogas and biofuels", "generation", "biogas or biofuels", [
        r"\bbiogas\b", r"\banaerobic[\s-]+diges(?:tion|ters?)\b", r"\blandfill[\s-]+gas\b",
        r"\brenewable[\s-]+natural[\s-]+gas\b", r"\bbio[\s-]?diesel\b", r"\bbio[\s-]?fuels?\b"]),
    ("hydrogen", "Hydrogen and fuel cells", "generation", "hydrogen or fuel cell energy", [
        r"\bhydrogen\b(?![\s-]+(?:sulfide|sulphide|peroxide|ions?|cyanide|chloride|fluoride|bonds?|atoms?))",
        r"\bfuel[\s-]+cells?\b"]),
    ("storage", "Battery and energy storage", "enabling", "battery or energy storage", [
        r"\bbattery[\s-]+(?:energy[\s-]+)?storage\b", r"\benergy[\s-]+storage\b", r"(?-i:\bBESS\b)",
        r"\bpumped[\s-]+(?:hydro(?:power)?[\s-]+)?storage\b"]),
    ("microgrid", "Microgrids", "enabling", "microgrid power", [r"\bmicro[\s-]?grids?\b"]),
    ("efficiency", "Energy efficiency and weatherization", "enabling", "energy efficiency or weatherization", [
        r"\benergy[\s-]+efficien(?:cy|cies|t)\b", r"\bweatheri[sz](?:ation|ed|ing|e)\b", r"\benergy[\s-]+audits?\b",
        r"\benergy[\s-]+conservation\b"]),
    ("electrification", "Electrification (heat pumps and electric vehicles)", "enabling",
     "electrification (air-source heat pumps, electric vehicles or vehicle charging)", [
        r"(?<!ground[\s-]source\s)(?<!water[\s-]source\s)\bheat[\s-]+pumps?\b", r"\bbuilding[\s-]+electrification\b",
        r"\b(?:transportation|vehicle|fleet)[\s-]+electrification\b", r"\belectric[\s-]+vehicles?\b",
        r"(?-i:\bEVs?)[\s-]+charg", r"\bcharging[\s-]+stations?\b", r"\belectric[\s-]+(?:bus|buses|busses)\b"]),
]
TYPES = {t[0]: {"id": t[0], "label": t[1], "category": t[2], "q": t[3]} for t in TAXONOMY}
ORDER = [t[0] for t in TAXONOMY]
REGEX = {t[0]: re.compile("|".join(f"(?:{p})" for p in t[4]), re.I) for t in TAXONOMY}

# ---- All Jev wording lives here ----
OWN_Q = "Does `passage` describe {q} that {tribe} owns, operates, studies, develops or proposes to develop?"
OWN_CRITERIA = {
    "true": "{tribe}, its utility, enterprises or departments own, operate, study or plan the {q}.",
    "false": "The {q} belongs to another utility, agency or company, or is discussed in general or as regional "
             "background (for example federal dams or BPA power supply).",
}
STAGE_Q = "What is the most advanced step for {q} by {tribe} that `passage` reports?"
STAGE_LEVELS = [  # probe-tested; see docs/ENERGY-POTENTIAL.md for the changes from the first draft
    "The passage mentions {q} only as background or in passing",
    "The passage states that {tribe} is interested in, has a goal for, or is advised to pursue {q}",
    "The passage reports a resource assessment or feasibility study of {q} for {tribe} that is under way or "
    "completed, or names a specific site identified for it",
    "The passage describes a planned, designed or funded {q} project of {tribe}",
    "The passage describes {q} that {tribe} has installed or operates",
]
REJECTED_Q = "Does `passage` say that {q} was found unsuitable, infeasible or rejected for {tribe}?"
REJECTED_CRITERIA = {
    "true": "The passage reports that {q} was ruled out for {tribe}, for example found not feasible, not "
            "cost-effective, or unsuitable for its lands or buildings.",
    "false": "The passage presents {q} as possible, planned or in use, or does not judge whether it suits {tribe}.",
}
VERIFY_Q = "Do `excerpts` show that {tribe} has reached the claimed stage for {q}?"
VERIFY_CRITERIA = {
    "true": "An excerpt shows {claim}.",
    "false": "The excerpts show only an earlier step than `claimed_stage`, a project of another utility, agency "
             "or company, or general background about {q}.",
}
EXCERPT_Q = "Does `excerpt` show {claim}?"  # one per citation, in the same request; orders and trims citations
EXCERPT_CRITERIA = {
    "true": "The excerpt shows {claim}.",
    "false": "The excerpt shows only an earlier step than `claimed_stage`, a project of another utility, agency or "
             "company, or general background about {q}.",
}
CLAIMS = {  # claimed stage -> the situation the verification criteria describe (later steps also count)
    "Installed or operating": "{q} that {tribe} or its utility, enterprises or departments have installed or operate",
    "Planned or funded": "a planned, designed, funded or completed {q} project of {tribe} or its utility, "
                         "enterprises or departments",
    "Assessed or sited": "a resource assessment or feasibility study of {q} for {tribe} that is under way or "
                         "completed, a specific site identified for it, or later project work",
    "Goal or interest": "that {tribe} is interested in, has a goal for, or is advised to pursue {q}, or later work "
                        "on it",
}

EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
PHONE = re.compile(r"(?:\(\d{3}\)\s*|\b\d{3}[-.\s])\d{3}[-.\s]\d{4}\b")
CUE = re.compile(r"\b(?:install|operat|construct|built|complet|commission|fund|grant|award|design|propos|feasib|"
                 r"assess|stud(?:y|ies)|site|goal|priorit|recommend|pursu|explor|interest|develop|plan)", re.I)
STAGE_CUES = {  # words that show each stage, so an excerpt shows the evidence for the stage its passage reached
    4: re.compile(r"\b(?:install|operat|built|construct|complet|commission|online|generat|purchas|retrofit|upgrad|"
                  r"replac|improvements?\b|conducted|occurred|offsets?\b|savings?\b|ha(?:s|ve) been|own(?:s|ed)?\b)",
                  re.I),
    3: re.compile(r"\b(?:plan(?:s|ned)?\b|fund|grant|award|design|propos|budget|schedul|implement|will\b)", re.I),
    2: re.compile(r"\b(?:assess|feasib|stud(?:y|ies|ied)|site|potential|resource|evaluat|analy|audit|identif)", re.I),
    1: re.compile(r"\b(?:goal|interest|explor|consider|pursu|recommend|priorit|objective|strateg|opportunit|seek)",
                  re.I),
}
TOC_LINE = re.compile(r"(?:\.\s*){4,}\d+\s*$|_{4,}\s*\d+\s*$")
# Contents pages: dot leaders before page numbers, or the letter runs OCR makes of dot leaders ("eeecceseces")
TOC_MARK = re.compile(r"(?:\.\s*){4,}\d{1,3}\b|_{4,}\s*\d{1,3}\b|\b[aceosnu]{10,}\b")
PARA = re.compile(r"\n[ \t]*\n")
SENT_START = re.compile(r"[.!?][\"')\]]?\s+|\n")
SENT_END = re.compile(r"[.!?](?=\s)|\n")
YEAR = re.compile(r"(?<!\d)(19[5-9]\d|20[0-4]\d)(?!\d)")
YEAR_RANGE = re.compile(r"(?<!\d)(19[5-9]\d|20[0-4]\d)\s*[-–—]\s*(?:FY\s*)?(?:19|20)?\d\d(?!\d)")
WAYBACK = re.compile(r"https?://web\.archive\.org/web/\d+[a-z_]*/", re.I)
LOCAL_PATH = re.compile(r"(?<![A-Za-z])[A-Za-z]:[\\/](?!/)|file:/|planning-T1|files-unsorted|\\Users\\|/Users/")
STATE_CODES = {"Alaska": "AK", "California": "CA", "Idaho": "ID", "Montana": "MT", "Nevada": "NV", "Oregon": "OR",
               "Utah": "UT", "Washington": "WA"}


class JevError(RuntimeError):
    """A failed Jev call; never read as a 'no'."""


# ---------------------------------------------------------------- small helpers
def read_json(path: Path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    tmp.replace(path)


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def file_sha(path: Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower().replace("\u2019", "'"))


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def lower_priority() -> str:
    """Run below normal priority beside the extraction campaign (psutil when it works, else the OS call)."""
    try:
        import psutil
        if hasattr(psutil, "Process"):
            psutil.Process().nice(getattr(psutil, "BELOW_NORMAL_PRIORITY_CLASS", 10))
            return "psutil below normal"
    except (ImportError, OSError):
        pass
    if os.name == "nt":
        import ctypes
        k32 = ctypes.windll.kernel32
        k32.GetCurrentProcess.restype = ctypes.c_void_p  # a pseudo-handle; untyped it is truncated on 64-bit
        k32.SetPriorityClass.argtypes = (ctypes.c_void_p, ctypes.c_uint32)
        ok = k32.SetPriorityClass(k32.GetCurrentProcess(), 0x4000)  # BELOW_NORMAL_PRIORITY_CLASS
        return "SetPriorityClass below normal" if ok else "SetPriorityClass FAILED (normal priority)"
    os.nice(10)
    return "nice 10"


def root_from(args) -> Path:
    value = args.plan_assessor or os.environ.get("PLAN_ASSESSOR_ROOT")
    if not value:
        raise SystemExit("Set --plan-assessor or PLAN_ASSESSOR_ROOT to the plan-assessor library root.")
    root = Path(value)
    if not (root / SOURCES["registry"]).is_file():
        raise SystemExit(f"Not a plan-assessor root (registry missing): {root}")
    return root


def stage_label(stage: float) -> str | None:
    return next((label for floor, label in STAGE_LABELS if stage >= floor), None)


# ---------------------------------------------------------------- lexicon and passages
def find_matches(text: str) -> list[tuple[str, int, int]]:
    """(type, start, end) for every lexicon hit, skipping contents pages and contents lines."""
    if len(TOC_MARK.findall(text)) >= 3:
        return []
    out = []
    for tid in ORDER:
        for m in REGEX[tid].finditer(text):
            line_start = text.rfind("\n", 0, m.start()) + 1
            line_end = text.find("\n", m.end())
            if TOC_LINE.search(text[line_start:line_end if line_end >= 0 else len(text)]):
                continue
            out.append((tid, m.start(), m.end()))
    return out


def clip(text: str, lo: int, hi: int, ms: int, me: int, limit: int) -> tuple[int, int]:
    """[lo, hi) cut to at most `limit` characters around the match [ms, me), snapped to sentence or line edges."""
    if hi - lo > limit:
        snap = limit // 4
        s = max(lo, min(ms - (limit - (me - ms)) // 2, hi - limit))
        e = min(hi, s + limit)
        m = SENT_START.search(text, s, min(ms, s + snap))
        if m:
            s = m.end()
        ends = [m.end() for m in SENT_END.finditer(text, max(me, e - snap), e)]
        if ends:
            e = ends[-1]
        lo, hi = s, e
    while lo < hi and text[lo].isspace():
        lo += 1
    while hi > lo and text[hi - 1].isspace():
        hi -= 1
    return lo, hi


def page_spans(text: str, matches: list[tuple[str, int, int]]) -> list[tuple[int, int]]:
    """Passages around the matches: whole paragraphs to about 600-1,500 characters, overlaps merged."""
    breaks = list(PARA.finditer(text))
    starts = [0] + [b.end() for b in breaks]
    ends = [b.start() for b in breaks] + [len(text)]
    spans = []
    for _, ms, me in matches:
        a = bisect.bisect_right(starts, ms) - 1
        b = max(a, bisect.bisect_right(starts, me - 1) - 1)
        while ends[b] - starts[a] < PASSAGE_MIN:
            grew = False
            if a > 0 and ends[b] - starts[a - 1] <= PASSAGE_MAX:
                a, grew = a - 1, True
            if ends[b] - starts[a] < PASSAGE_MIN and b + 1 < len(ends) and ends[b + 1] - starts[a] <= PASSAGE_MAX:
                b, grew = b + 1, True
            if not grew:
                break
        spans.append(clip(text, starts[a], ends[b], ms, me, PASSAGE_MAX))
    merged: list[tuple[int, int]] = []
    for s, e in sorted(set(spans)):
        if merged and s < merged[-1][1] and max(e, merged[-1][1]) - merged[-1][0] <= MERGED_MAX:
            merged[-1] = (merged[-1][0], max(e, merged[-1][1]))
        else:
            merged.append((s, e))
    return merged


def excerpts(text: str, s: int, e: int, tid: str, level: int | None = None) -> list[str]:
    """Verbatim excerpts (<= 280 characters, no email or phone) around the type's matches inside [s, e): a wide
    window and the match's own sentence. Ones carrying the most words of the given stage level come first, then
    the most project-stage words of any level, then more context."""
    stage_cue = STAGE_CUES.get(level)
    found = {}
    for m in REGEX[tid].finditer(text, s, e):
        ms, me = m.start(), m.end()
        starts = [x.end() for x in SENT_START.finditer(text, max(s, ms - EXCERPT_MAX), ms)]
        end = SENT_END.search(text, me, min(e, me + EXCERPT_MAX))
        for a, b in (clip(text, max(s, ms - EXCERPT_MAX), min(e, me + EXCERPT_MAX), ms, me, EXCERPT_MAX),
                     clip(text, starts[-1] if starts else max(s, ms - EXCERPT_MAX),
                          end.end() if end else min(e, me + EXCERPT_MAX), ms, me, EXCERPT_MAX)):
            piece = text[a:b]
            if len(piece) <= EXCERPT_MAX and not EMAIL.search(piece) and not PHONE.search(piece):
                found[piece] = (-len(stage_cue.findall(piece)) if stage_cue else 0, -len(CUE.findall(piece)),
                                -len(piece), a)
    return sorted(found, key=found.get)


# ---------------------------------------------------------------- library reading (read-only)
def jev_prob(row: dict, question: str) -> float | None:
    answer = (((row.get("jev") or {}).get("answers")) or {}).get(question) or {}
    value = answer.get("probability")
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def public_url(row: dict) -> str | None:
    """The publisher's address when the library recorded one, else a Wayback copy."""
    a = row.get("associations") or {}
    acq = a.get("acquisitions") or []
    done = [q for q in acq if q.get("status") == "acquired"]
    urls = [q.get("final_url") for q in done] + [q.get("source_url") for q in done]
    urls += [q.get("final_url") for q in acq] + [q.get("source_url") for q in acq]
    urls += [c.get("url") for c in a.get("candidates") or []]
    urls += [u for u in a.get("urls") or [] if isinstance(u, str) and WAYBACK.match(u)]
    urls = [u for u in urls if isinstance(u, str) and u.startswith(("https://", "http://"))]
    live = [u for u in urls if not WAYBACK.match(u)]
    return (live or urls or [None])[0]


def screen(sha: str, row: dict | None, record_state: dict | None) -> list[str]:
    """Every exclusion reason that applies to a document (empty list: it may be read)."""
    reasons = ["gila_river_object_owner_excluded"] if sha == GILA_SHA else []
    if row is None:
        return reasons + ["not_in_inventory"]
    if row.get("local_only"):
        reasons.append("local_only")
    if (record_state or {}).get("local_only"):
        reasons.append("local_only_campaign_record")
    if not row.get("eligible") or row.get("exclusion"):
        why = (row.get("exclusion") or {}).get("all_reasons") or ["not_eligible"]
        reasons.append("ineligible:" + ",".join(why))
    if not public_url(row):
        reasons.append("no_public_url")
    prepared = jev_prob(row, "prepared_by_or_for_attributed_government")
    plan = jev_prob(row, "is_plan_or_planning_assessment")
    if prepared is not None and prepared < PREPARED_MIN:
        reasons.append("jev_not_prepared_by_or_for_attributed_government")
    if plan is not None and plan < PLAN_MIN:
        reasons.append("jev_not_plan_or_planning_assessment")
    return reasons


def may_send(doc: dict) -> bool:
    """The send guard re-checked before any request: public, unmarked, screened, never the Gila River object."""
    return (doc["sha256"] != GILA_SHA and not doc["local_only"] and doc["eligible"] and bool(doc["url"])
            and doc["prepared"] is not None and doc["prepared"] >= PREPARED_MIN
            and doc["plan"] is not None and doc["plan"] >= PLAN_MIN and "AZ" not in doc["tribe_states"])


def load_pages(root: Path, row: dict) -> tuple[list[tuple[int, str]], str]:
    """Page texts: the campaign's extraction when its latest attempt ended 'extracted', else the PDF text layer.
    No OCR is run here."""
    folder = root / RUN_DIR / "records" / row["record_id"] / "attempts"
    attempts = sorted((p for p in folder.iterdir() if p.name.isdigit()), key=lambda p: int(p.name)) \
        if folder.is_dir() else []
    if attempts:
        try:
            outcome = (read_json(attempts[-1] / "attempt.json").get("outcome") or {}).get("class")
        except (OSError, ValueError):
            outcome = None  # an attempt still being written
        if outcome == "extracted":
            pages = read_json(attempts[-1] / "extraction" / "extraction.json")["pages"]
            return [(int(p["number"]), p.get("raw_text") or "") for p in pages], f"campaign extraction attempt {attempts[-1].name}"
    import fitz  # PyMuPDF
    with fitz.open(row["local_path"]) as pdf:
        pages = [(i + 1, "\n\n".join(b[4].strip() for b in page.get_text("blocks", sort=True)
                                     if b[6] == 0 and b[4].strip())) for i, page in enumerate(pdf)]
    return pages, "pdf text layer"


def readable(pages: list[tuple[int, str]]) -> tuple[bool, int]:
    good = sum(1 for _, text in pages if len(re.sub(r"\s", "", text)) >= USABLE_PAGE_CHARS)
    return bool(pages) and good / len(pages) >= USABLE_SHARE, good


def url_name(url: str | None) -> str:
    path = urllib.parse.urlparse(WAYBACK.sub("", url or "")).path
    return urllib.parse.unquote(path.rsplit("/", 1)[-1])


def text_years(text: str) -> list[int]:
    """Years named in a title or file name; a range such as 2016-2026 counts as its first year (when it was written)."""
    starts = [int(m.group(1)) for m in YEAR_RANGE.finditer(text)]
    return starts + [int(y) for y in YEAR.findall(YEAR_RANGE.sub(" ", text))]


def doc_year(title: str, url: str | None, pdf_path: str | None) -> tuple[int | None, str | None]:
    for text, where in ((title, "title"), (url_name(url), "url")):
        years = [y for y in text_years(text or "") if y <= THIS_YEAR]
        if years:
            return max(years), where
    try:
        import fitz
        with fitz.open(pdf_path) as pdf:
            m = re.match(r"D:(\d{4})", (pdf.metadata or {}).get("creationDate") or "")
        if m and 1950 <= int(m.group(1)) <= THIS_YEAR:
            return int(m.group(1)), "pdf metadata"
    except (RuntimeError, OSError, ValueError, TypeError):
        pass
    return None, None


def doc_title(ledger_doc: dict | None, row: dict) -> str:
    a = row.get("associations") or {}
    names = ([ledger_doc["title"]] if ledger_doc and ledger_doc.get("title") else []) + list(a.get("titles") or [])
    names += [t for c in a.get("candidates") or [] for t in c.get("titles") or []]
    names = [n.strip() for n in names if isinstance(n, str) and n.strip()]
    plain = [n for n in names if not n.lower().endswith(".pdf")]
    return (plain or names or [row["record_id"]])[0]


def campaign_progress(root: Path) -> dict:
    status = read_json(root / RUN_DIR / "status.json")
    return {"campaign_id": status.get("campaign_id"), "controller": status.get("controller"),
            "by_stage": (status.get("counts") or {}).get("by_stage"), "read_utc": dt.datetime.now(dt.UTC).isoformat()}


def tribes_from(registry: dict, crosswalk: dict, inventory_rows: list[dict]) -> tuple[list[dict], list[str]]:
    observed = {r["tribe_id"]: r for r in crosswalk["rows"]}
    tribes = []
    for r in registry["records"]:
        if not r.get("atni_member"):
            continue
        names = {observed[i]["canonical_name_observed"] for i in r["atni_library_tribe_ids"] if i in observed}
        tribes.append({"name": r["legal_name"], "slug": r["tribe_slug"], "states": r.get("states") or [],
                       "library_ids": list(r["atni_library_tribe_ids"]), "registry_match": "federal_register",
                       "other_names": sorted(n for n in names if norm(n) != norm(r["legal_name"]))})
    assert len(tribes) == registry["counts"]["atni_members"], "ATNI member count changed in the registry"
    by_partition: dict[str, list[dict]] = {}
    for row in inventory_rows:
        by_partition.setdefault(row["partition_key"], []).append(row)
    skipped = []
    for x in crosswalk["rows"]:
        if x.get("atni_membership") != "listed_on_captured_page" or x.get("match") != "unresolved":
            continue
        rows = by_partition.get(x["tribe_id"], [])
        if not rows:
            skipped.append(x["canonical_name_observed"])
            continue
        groups = {t.get("roster_group") for row in rows for t in (row["associations"].get("tribes") or [])
                  if t.get("id") == x["tribe_id"]}
        tribes.append({"name": x["canonical_name_observed"], "slug": slugify(x["canonical_name_observed"]),
                       "states": sorted(STATE_CODES[g] for g in groups if g in STATE_CODES),
                       "library_ids": [x["tribe_id"]], "registry_match": "unresolved", "other_names": []})
    return tribes, sorted(skipped)


# ---------------------------------------------------------------- build
def build(args) -> None:
    root = root_from(args)
    print("priority:", lower_priority())
    WORK.mkdir(parents=True, exist_ok=True)
    src = {k: read_json(root / v) for k, v in SOURCES.items()}
    inventory = {r["object_sha256"]: r for r in src["inventory"]["rows"]}
    ledger = {r["tribe_slug"]: r for r in src["ledger"]["rows"]}
    tribes, skipped = tribes_from(src["registry"], src["crosswalk"], src["inventory"]["rows"])
    progress = campaign_progress(root)

    # Per Tribe: ledger documents (by slug) united with inventory rows in the Tribe's library partitions.
    holdings: dict[str, dict[str, dict | None]] = {}
    for t in tribes:
        docs = {d["sha256"]: d for d in (ledger.get(t["slug"]) or {}).get("documents", [])}
        for row in src["inventory"]["rows"]:
            if row["partition_key"] in t["library_ids"]:
                docs.setdefault(row["object_sha256"], None)
        holdings[t["slug"]] = docs

    docs: dict[str, dict] = {}  # sha -> document record shared by every Tribe it is attributed to
    pages_by_doc: dict[str, dict[int, str]] = {}
    candidates: dict[str, list[dict]] = {}
    tribe_states = {}
    for t in tribes:
        for sha in holdings[t["slug"]]:
            tribe_states.setdefault(sha, set()).update(t["states"])
    for t in tribes:
        for sha, ledger_doc in sorted(holdings[t["slug"]].items()):
            if sha in docs:
                continue
            row = inventory.get(sha)
            state_path = root / RUN_DIR / "records" / (row or {}).get("record_id", "-") / "state.json"
            record_state = read_json(state_path) if row and state_path.is_file() else None
            reasons = screen(sha, row, record_state)
            url = public_url(row) if row else None
            title = doc_title(ledger_doc, row) if row else (ledger_doc or {}).get("title", sha[:12])
            year, year_source = doc_year(title, url, (row or {}).get("local_path"))
            answers = ((row or {}).get("jev") or {}).get("answers") or {}
            covered = [t.get("canonical_name") for t in ((row or {}).get("associations") or {}).get("tribes") or []]
            doc = {"sha256": sha, "id": sha[:12], "record_id": (row or {}).get("record_id"), "title": title,
                   "tribes_covered": covered if len(covered) > 1 else [],  # a plan shared by several Tribes
                   "year": year, "year_source": year_source, "url": url,
                   "family": (answers.get("document_family") or {}).get("choice"),
                   "prepared": jev_prob(row or {}, "prepared_by_or_for_attributed_government"),
                   "plan": jev_prob(row or {}, "is_plan_or_planning_assessment"),
                   "local_only": bool((row or {}).get("local_only") or (record_state or {}).get("local_only")),
                   "eligible": bool((row or {}).get("eligible")) and not (row or {}).get("exclusion"),
                   "tribe_states": sorted(tribe_states.get(sha, ())),
                   "ledger_source": (ledger_doc or {}).get("source"), "ledger_type": (ledger_doc or {}).get("type"),
                   "page_count": (row or {}).get("page_count"), "local_path": (row or {}).get("local_path"),
                   "exclusion_reasons": reasons, "status": "excluded" if reasons else None}
            docs[sha] = doc
            if reasons:
                continue
            pages, text_source = load_pages(root, row)
            ok, good_pages = readable(pages)
            doc.update(text_source=text_source, pages_read=len(pages), pages_with_text=good_pages)
            if not ok:
                doc["status"] = "pending_extraction"  # counted, never analyzed
                continue
            if not answers:
                doc.update(status="excluded", exclusion_reasons=["jev_screen_missing"])
                continue
            assert may_send(doc), f"screen and send guard disagree for {sha}"
            doc["status"] = "examined"
            found = []
            for number, text in pages:
                matches = find_matches(text)
                for s, e in page_spans(text, matches):
                    counts: dict[str, int] = {}
                    for tid, ms, me in matches:
                        if s <= ms and me <= e:
                            counts[tid] = counts.get(tid, 0) + 1
                    if counts:
                        found.append({"doc": sha, "page": number, "start": s, "end": e, "types": counts})
                        pages_by_doc.setdefault(sha, {})[number] = text
            candidates[sha] = found
            doc["candidate_passages"] = len(found)
        print(f"  {t['slug']}: {len(holdings[t['slug']])} documents")

    # Hard guarantees before anything can be sent.
    assert GILA_SHA not in candidates and all(docs[s]["status"] == "examined" for s in candidates)
    assert all(may_send(docs[s]) for s in candidates)
    assert not any("AZ" in docs[s]["tribe_states"] for s in candidates)

    passages, per_tribe = [], {}
    for t in tribes:
        pool = [dict(p, tribe=t["slug"]) for sha in sorted(holdings[t["slug"]]) for p in candidates.get(sha, [])]
        chosen = select(pool, docs)
        per_tribe[t["slug"]] = {"candidates": len(pool), "selected": len(chosen)}
        for p in chosen:
            d = docs[p["doc"]]
            text = pages_by_doc[p["doc"]][p["page"]]
            passages.append({"id": f"{t['slug']}:{d['id']}:p{p['page']}:{p['start']}", "tribe": t["slug"],
                             "doc": p["doc"], "doc_id": d["id"], "title": d["title"], "year": d["year"],
                             "tribes_covered": d["tribes_covered"],
                             "family": d["family"], "page": p["page"], "start": p["start"], "end": p["end"],
                             "types": p["types"], "text": text[p["start"]:p["end"]], "page_text": text})

    reasons_count: dict[str, int] = {}
    for d in docs.values():
        for r in d["exclusion_reasons"]:
            reasons_count[r] = reasons_count.get(r, 0) + 1
    status_count: dict[str, int] = {}
    for d in docs.values():
        status_count[d["status"]] = status_count.get(d["status"], 0) + 1
    corpus = {"built_utc": dt.datetime.now(dt.UTC).isoformat(), "campaign_progress": progress,
              "inputs": {k: {"path": v, "sha256": file_sha(root / v)} for k, v in SOURCES.items()},
              "counts": {"tribes": len(tribes), "documents": len(docs), "by_status": status_count,
                         "exclusion_reasons": reasons_count, "passages": len(passages)},
              "unresolved_listed_without_documents": skipped,
              "tribes": [dict(t, documents=[dict(docs[s], attributed_by="ledger" if holdings[t["slug"]][s] else
                                                 "inventory_partition") for s in sorted(holdings[t["slug"]])],
                              passages=per_tribe[t["slug"]]) for t in tribes]}
    write_json(WORK / "corpus.json", corpus)
    with open(WORK / "passages.jsonl", "w", encoding="utf-8", newline="\n") as f:
        for p in passages:
            f.write(json.dumps(p, ensure_ascii=False) + "\n")
    planned = len(passages) + VERIFY_DEPTH * len(tribes)
    print(json.dumps(corpus["counts"], indent=1))
    print(f"planned Jev volume: {len(passages)} passage requests + up to {VERIFY_DEPTH * len(tribes)} verification "
          f"requests = {planned} (hard cap {MAX_REQUESTS})")
    if planned > MAX_REQUESTS:
        raise SystemExit("Planned volume exceeds the hard cap; tighten PER_TYPE or PER_TRIBE.")


def select(pool: list[dict], docs: dict) -> list[dict]:
    """Caps: up to 6 passages per type (energy plans first, then denser matches, then newer documents; at most 3
    from one document while others remain), then at most 45 per Tribe taken in rounds across types."""
    ranked = {}
    for tid in ORDER:
        hits = [p for p in pool if tid in p["types"]]
        hits.sort(key=lambda p: (docs[p["doc"]]["family"] != "energy_plan", -p["types"][tid],
                                 -(docs[p["doc"]]["year"] or 0), p["doc"], p["page"], p["start"]))
        take, per_doc, spill = [], {}, []
        for p in hits:
            if per_doc.get(p["doc"], 0) < PER_DOC_TYPE:
                take.append(p)
                per_doc[p["doc"]] = per_doc.get(p["doc"], 0) + 1
            else:
                spill.append(p)
        ranked[tid] = (take + spill)[:PER_TYPE]
    chosen: dict[tuple, dict] = {}
    for rnd in range(PER_TYPE):
        for tid in ORDER:
            if rnd < len(ranked[tid]) and len(chosen) < PER_TRIBE:
                p = ranked[tid][rnd]
                chosen.setdefault((p["doc"], p["page"], p["start"]), p)
    return list(chosen.values())


# ---------------------------------------------------------------- Jev
def tribe_index() -> dict[str, dict]:
    return {t["slug"]: t for t in read_json(WORK / "corpus.json")["tribes"]}


def passage_payload(p: dict, tribe: dict) -> dict:
    name = tribe["name"]
    state = {"tribe": name}
    if tribe["other_names"]:
        state["tribe_also_known_as"] = tribe["other_names"]
    state["document"] = {"title": p["title"], **({"year": p["year"]} if p["year"] else {}),
                         **({"tribes_covered": p["tribes_covered"]} if p.get("tribes_covered") else {})}
    state.update(page=p["page"], passage=p["text"])
    questions = {}
    for tid in sorted(p["types"], key=ORDER.index):
        fill = {"q": TYPES[tid]["q"], "tribe": name}
        questions[f"{tid}_own"] = {"type": "noul", "instructions": OWN_Q.format(**fill),
                                   "criteria": {k: v.format(**fill) for k, v in OWN_CRITERIA.items()}}
        questions[f"{tid}_stage"] = {"type": "score", "instructions": STAGE_Q.format(**fill),
                                     "criteria": [lvl.format(**fill) for lvl in STAGE_LEVELS]}
        questions[f"{tid}_rejected"] = {"type": "noul", "instructions": REJECTED_Q.format(**fill),
                                        "criteria": {k: v.format(**fill) for k, v in REJECTED_CRITERIA.items()}}
    return {"model": MODEL, "state": state, "questions": questions}


def verify_payload(claim: dict, tribe: dict, docs: dict) -> dict:
    fill = {"q": TYPES[claim["type"]]["q"], "tribe": tribe["name"]}
    fill["claim"] = CLAIMS[claim["stage_label"]].format(**fill)
    excerpts_ = [{"document": docs[c["doc"]]["title"], **({"year": docs[c["doc"]]["year"]} if docs[c["doc"]]["year"]
                  else {}), "page": c["page"], "text": c["excerpt"]} for c in claim["citations"]]
    state = {"tribe": tribe["name"], "energy_type": TYPES[claim["type"]]["label"],
             "claimed_stage": claim["stage_label"], "excerpts": excerpts_}
    questions = {"supports": {"type": "noul", "instructions": VERIFY_Q.format(**fill),
                              "criteria": {k: v.format(**fill) for k, v in VERIFY_CRITERIA.items()}}}
    for i, x in enumerate(excerpts_):
        questions[f"excerpt_{i}"] = {"type": "noul",
                                     "instructions": {"question": EXCERPT_Q.format(**fill), "excerpt": x},
                                     "criteria": {k: v.format(**fill) for k, v in EXCERPT_CRITERIA.items()}}
    return {"model": MODEL, "state": state, "questions": questions}


def supported_citations(citations: list[dict], each: list[float]) -> list[dict]:
    """Citations ordered by how well each excerpt alone shows the claim; those below 0.3 are dropped,
    except that the best one always stays."""
    ranked = sorted((dict(c, supports=s) for c, s in zip(citations, each)), key=lambda c: -c["supports"])
    return [c for c in ranked if c["supports"] >= NO] or ranked[:1]


def canonical(body: dict) -> bytes:
    return json.dumps(body, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def payload_key(body: dict) -> str:
    return hashlib.sha256(canonical(body)).hexdigest()


class Client:
    """Cached Jev calls: one cache file per exact payload, one log line per request, a hard request cap."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.log = WORK / "jev-requests.log"
        (WORK / "jev-cache").mkdir(parents=True, exist_ok=True)
        self.sent = sum(json.loads(x).get("attempts", 1) for x in self.log.read_text(encoding="utf-8").splitlines()
                        if x.strip()) if self.log.exists() else 0

    def cached(self, body: dict) -> dict | None:
        path = WORK / "jev-cache" / f"{payload_key(body)}.json"
        return read_json(path) if path.exists() else None

    def _record(self, line: dict) -> None:
        with self.lock, open(self.log, "a", encoding="utf-8", newline="\n") as f:
            f.write(json.dumps(line, ensure_ascii=False) + "\n")

    def ask(self, body: dict, kind: str, ref: str) -> dict:
        hit = self.cached(body)
        if hit:
            return hit
        key, data = payload_key(body), canonical(body)
        key_env = os.environ.get("TYPESAFE_API_KEY")
        if not key_env:
            raise JevError("TYPESAFE_API_KEY is not set")
        attempts, status, response, error = 0, None, None, None
        for attempt in range(7):
            with self.lock:
                if self.sent >= MAX_REQUESTS:
                    raise JevError(f"hard cap of {MAX_REQUESTS} requests reached")
                self.sent += 1
            attempts += 1
            request = urllib.request.Request(ENDPOINT, data=data, method="POST", headers={
                "Content-Type": "application/json", "Authorization": f"Bearer {key_env}"})
            try:
                with urllib.request.urlopen(request, timeout=120) as r:
                    status, response = r.status, json.loads(r.read())
                break
            except urllib.error.HTTPError as exc:
                status, error = exc.code, exc.read().decode("utf-8", "replace")[:1000]
                if exc.code in (408, 409, 429, 500, 502, 503, 504, 529) and attempt < 6:
                    wait = exc.headers.get("retry-after")
                    time.sleep(float(wait) if wait and wait.replace(".", "", 1).isdigit() else 2 ** attempt)
                    continue
                break
            except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
                status, error = None, repr(exc)[:500]
                if attempt < 6:
                    time.sleep(2 ** attempt)
                    continue
                break
        problem = error if response is None else self.invalid(body, response)
        self._record({"utc": dt.datetime.now(dt.UTC).isoformat(), "key": key, "kind": kind, "ref": ref,
                      "attempts": attempts, "http_status": status, "model": (response or {}).get("model"),
                      "usage": (response or {}).get("usage"), "error": problem, "request": body})
        if problem:
            raise JevError(f"{kind} {ref}: HTTP {status}: {problem}")
        record = {"recorded_utc": dt.datetime.now(dt.UTC).isoformat(), "key": key, "kind": kind, "ref": ref,
                  "http_status": status, "model": response.get("model"), "usage": response.get("usage"),
                  "request": body, "response": response}
        write_json(WORK / "jev-cache" / f"{key}.json", record)
        return record

    @staticmethod
    def invalid(body: dict, response: dict) -> str | None:
        answers = response.get("answers") or {}
        for qid, question in body["questions"].items():
            answer = answers.get(qid)
            if not answer or answer.get("type") != question["type"]:
                return f"missing or mistyped answer for {qid}"
            if question["type"] == "noul" and not 0 <= float(answer.get("noul", -1)) <= 1:
                return f"noul out of range for {qid}"
            if question["type"] == "score" and len(answer.get("probabilities") or {}) != len(question["criteria"]):
                return f"score levels missing for {qid}"
        return None


def stage_value(answer: dict) -> float:
    """Stage read from a Score answer: the most probable level (ties go to the lower level), or the expected value."""
    if STAGE_READING == "expected":
        return float(answer["score"])
    probs = {int(k): float(v) for k, v in answer["probabilities"].items()}
    return float(max(probs, key=lambda k: (probs[k], -k)))


def readings(p: dict, answers: dict) -> list[dict]:
    out = []
    for tid in sorted(p["types"], key=ORDER.index):
        stage = answers[f"{tid}_stage"]
        out.append({"type": tid, "own": answers[f"{tid}_own"]["noul"], "stage": stage_value(stage),
                    "stage_expected": stage["score"], "stage_probabilities": stage["probabilities"],
                    "rejected": answers[f"{tid}_rejected"]["noul"]})
    return out


def probe(args) -> None:
    lower_priority()
    tribes, client = tribe_index(), Client()
    wanted = [x for x in args.ids.split(",") if x]
    chosen = [p for p in read_jsonl(WORK / "passages.jsonl") if p["id"] in wanted]
    print(f"planned Jev volume: {len(chosen)} probe requests (already sent {client.sent}, cap {MAX_REQUESTS})")
    results = []
    for p in chosen:
        record = client.ask(passage_payload(p, tribes[p["tribe"]]), "probe", p["id"])
        rows = readings(p, record["response"]["answers"])
        results.append({"id": p["id"], "text": p["text"], "readings": rows})
        print(f"\n== {p['id']}  {p['title'][:70]}  p.{p['page']}\n{p['text'][:500]}")
        for r in rows:
            print(f"  {r['type']:<16} own {r['own']:.2f}  stage {r['stage']:.0f} (E {r['stage_expected']:.2f}) "
                  f"{r['stage_probabilities']}  rejected {r['rejected']:.2f}")
    write_json(WORK / "probe.json", results)


# ---------------------------------------------------------------- run and decide
def decide(rows: list[dict]) -> tuple[dict | None, str | None]:
    """Truth table for one Tribe and type. rows: {'doc', 'year', 'own', 'stage', 'rejected'} per passage."""
    admissible = [r for r in rows if r["own"] >= YES]
    if not admissible:
        return None, "no admissible passage (own < 0.7)"
    best = max(r["stage"] for r in admissible)
    n_docs = len({r["doc"] for r in admissible})
    rejected = any(r["rejected"] >= YES for r in admissible)
    if best < STAGE_MIN:
        return None, "background only (best stage < 0.5)"
    if rejected and best < REJECT_OVERRIDE:
        return None, "found unsuitable and never planned or built"
    years = [r["year"] for r in admissible if r.get("year")]
    return {"best_stage": best, "n_docs": n_docs, "rejected": rejected,
            "score": round(best + DOC_BONUS * min(n_docs - 1, DOC_BONUS_CAP), 4),
            "newest": max(years) if years else None}, None


def step_down(claim: dict) -> dict | None:
    """The same claim (same excerpts) one stage lower, rescored; None below 'Goal or interest'."""
    labels = [label for _, label in STAGE_LABELS]  # most advanced first
    nxt = labels.index(claim["stage_label"]) + 1
    if nxt == len(labels):
        return None
    level = float(len(labels) - nxt)
    return dict(claim, stage_label=labels[nxt], best_stage=level,
                score=round(level + DOC_BONUS * min(claim["n_docs"] - 1, DOC_BONUS_CAP), 4))


def rank(kept: dict[str, dict]) -> list[str]:
    return sorted(kept, key=lambda t: (-kept[t]["score"], -kept[t]["n_docs"], -(kept[t]["newest"] or 0),
                                       ORDER.index(t)))


def run(args) -> None:
    progress = campaign_progress(root_from(args))
    print("priority:", lower_priority())
    tribes, client = tribe_index(), Client()
    passages = read_jsonl(WORK / "passages.jsonl")
    docs = {d["sha256"]: d for t in tribes.values() for d in t["documents"]}
    bodies = [(p, passage_payload(p, tribes[p["tribe"]])) for p in passages]
    todo = [(p, b) for p, b in bodies if not client.cached(b)]
    print(f"planned Jev volume: {len(bodies)} passages, {len(bodies) - len(todo)} cached, {len(todo)} to send "
          f"(already sent {client.sent}, cap {MAX_REQUESTS})")
    if client.sent + len(todo) > MAX_REQUESTS:
        raise SystemExit("This run would pass the hard request cap.")
    for p, _ in todo:
        assert may_send(docs[p["doc"]]), f"send guard refused {p['id']}"
    errors = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(client.ask, b, "passage", p["id"]): p for p, b in todo}
        for n, f in enumerate(concurrent.futures.as_completed(futures), 1):
            try:
                f.result()
            except JevError as exc:
                errors.append({"passage": futures[f]["id"], "error": str(exc)})
            if n % 100 == 0:
                print(f"  {n}/{len(todo)} sent, {len(errors)} errors")
    if errors:
        write_json(WORK / "run-errors.json", errors)
        raise SystemExit(f"{len(errors)} Jev calls failed (run-errors.json); rerun 'run' to retry only those.")
    aggregate(tribes, passages, bodies, client, progress)


def aggregate(tribes: dict, passages: list[dict], bodies: list, client: Client, progress: dict) -> None:
    by_id = {p["id"]: p for p in passages}
    evidence: dict[tuple[str, str], list[dict]] = {}
    # Score-reading diagnostics over admissible readings: is the distribution one peak or two?
    diag = {"readings": 0, "own_yes": 0, "own_uncertain": 0, "own_no": 0, "admissible_top_level_below_0_5": 0,
            "admissible_two_peaked": 0, "admissible_mode_and_expected_labels_differ": 0}
    models = set()
    for p, body in bodies:
        record = client.cached(body)
        if not record:
            raise SystemExit(f"missing answer for {p['id']}: rerun 'run'")
        models.add(record["model"])
        for r in readings(p, record["response"]["answers"]):
            diag["readings"] += 1
            diag["own_yes" if r["own"] >= YES else "own_no" if r["own"] < NO else "own_uncertain"] += 1
            if r["own"] >= YES:
                levels = sorted(((v, int(k)) for k, v in r["stage_probabilities"].items()), reverse=True)
                diag["admissible_top_level_below_0_5"] += levels[0][0] < 0.5
                diag["admissible_two_peaked"] += levels[1][0] >= 0.2 and abs(levels[0][1] - levels[1][1]) >= 2
                diag["admissible_mode_and_expected_labels_differ"] += (
                    stage_label(max(levels, key=lambda x: (x[0], -x[1]))[1]) != stage_label(r["stage_expected"]))
            evidence.setdefault((p["tribe"], r["type"]), []).append(
                dict(r, passage=p["id"], doc=p["doc"], year=p["year"], page=p["page"]))
    out = []
    for slug, t in tribes.items():
        kept, dropped = {}, {}
        for tid in ORDER:
            rows = evidence.get((slug, tid))
            if not rows:
                continue
            decision, why = decide(rows)
            if decision:
                kept[tid] = dict(decision, uncertain_passages=sum(NO <= r["own"] < YES for r in rows))
            else:
                dropped[tid] = why
        ranked = []
        for n, tid in enumerate(rank(kept)[:VERIFY_DEPTH], 1):
            d = kept[tid]
            ranked.append(dict(d, type=tid, rank=n, stage_label=stage_label(d["best_stage"]),
                               citations=citations(evidence[(slug, tid)], by_id, tid)))
        out.append({"slug": slug, "ranked": ranked, "dropped": dropped,
                    "evidence": {tid: rows for (s, tid), rows in evidence.items() if s == slug}})
    write_json(WORK / "aggregates.json", {"decided_utc": dt.datetime.now(dt.UTC).isoformat(), "models": sorted(models),
                                          "campaign_progress_at_run": progress, "stage_reading": STAGE_READING,
                                          "diagnostics": diag, "tribes": out})
    print(json.dumps(diag, indent=1))


def citations(rows: list[dict], by_id: dict, tid: str) -> list[dict]:
    """Best admissible passages from distinct documents, each with a verbatim excerpt from its page."""
    best = sorted((r for r in rows if r["own"] >= YES),
                  key=lambda r: (-r["stage"], -r["own"], -(r["year"] or 0), r["doc"], r["page"]))
    out, seen = [], set()
    for r in best:
        if r["doc"] in seen:
            continue
        p = by_id[r["passage"]]
        found = excerpts(p["page_text"], p["start"], p["end"], tid, int(round(r["stage"])))
        if not found:
            continue
        assert found[0] in p["page_text"] and len(found[0]) <= EXCERPT_MAX
        seen.add(r["doc"])
        out.append({"doc": p["doc"], "doc_id": p["doc_id"], "page": p["page"], "passage": p["id"],
                    "stage": r["stage"], "own": r["own"], "excerpt": found[0]})
        if len(out) == CITATIONS_MAX:
            break
    return out


# ---------------------------------------------------------------- verify and publish
def verify(args) -> None:
    """Second Jev pass per ranked claim. A claim below 0.3 is dropped and logged; the same excerpts are then
    re-checked one stage lower, so a type keeps the stage its excerpts do show. Survivors are re-ranked."""
    print("priority:", lower_priority())
    tribes, client = tribe_index(), Client()
    docs = {d["sha256"]: d for t in tribes.values() for d in t["documents"]}
    agg = read_json(WORK / "aggregates.json")
    pending =[(t["slug"], dict(c, first_stage_label=c["stage_label"])) for t in agg["tribes"]
               for c in t["ranked"] if c["citations"]]
    attempts, kept, models, finals = [], {}, set(), []
    while pending:
        bodies = [(slug, c, verify_payload(c, tribes[slug], docs)) for slug, c in pending]
        todo = [b for b in bodies if not client.cached(b[2])]
        print(f"planned Jev volume: {len(bodies)} claims at this step, {len(todo)} to send (already sent "
              f"{client.sent}, cap {MAX_REQUESTS})")
        if client.sent + len(todo) > MAX_REQUESTS:
            raise SystemExit("Verification would pass the hard request cap.")
        errors = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
            futures = {pool.submit(client.ask, b, "verify", f"{slug}:{c['type']}:{c['stage_label']}"): slug
                       for slug, c, b in todo}
            for f in concurrent.futures.as_completed(futures):
                try:
                    f.result()
                except JevError as exc:
                    errors.append(str(exc))
        if errors:
            raise SystemExit(f"{len(errors)} verification calls failed: {errors[:3]}")
        pending = []
        for slug, c, body in bodies:
            record = client.cached(body)
            models.add(record["model"])
            answers = record["response"]["answers"]
            p = answers["supports"]["noul"]
            each = [answers[f"excerpt_{i}"]["noul"] for i in range(len(c["citations"]))]
            status = "verified" if p >= YES else "needs_review" if p >= NO else "dropped"
            attempts.append({"tribe": slug, "type": c["type"], "stage_label": c["stage_label"], "supports": p,
                             "status": status, "excerpts": [{"text": x["excerpt"], "supports": s}
                                                            for x, s in zip(c["citations"], each)]})
            if status != "dropped":
                withheld = WITHHELD.get((slug, c["type"]))
                if not withheld:
                    kept.setdefault(slug, []).append(dict(c, status=status, supports=p,
                                                          citations=supported_citations(c["citations"], each)))
                finals.append({"tribe": slug, "type": c["type"], "status": "withheld" if withheld else status,
                               "stage_label": c["stage_label"], "first_stage_label": c["first_stage_label"],
                               "rank_before_verify": c["rank"], **({"reason": withheld} if withheld else {})})
                continue
            lower = step_down(c)
            if lower:
                pending.append((slug, lower))
            else:
                finals.append({"tribe": slug, "type": c["type"], "status": "dropped", "stage_label": None,
                               "first_stage_label": c["first_stage_label"], "rank_before_verify": c["rank"]})
    for t in agg["tribes"]:  # claims that never had a citable excerpt are logged as dropped
        for c in t["ranked"]:
            if not c["citations"]:
                finals.append({"tribe": t["slug"], "type": c["type"], "status": "dropped", "stage_label": None,
                               "first_stage_label": c["stage_label"], "rank_before_verify": c["rank"],
                               "reason": "no citable excerpt"})
    published = {}
    for slug, claims in kept.items():  # one surviving claim per type; re-ranked by the stage that was verified
        by_type = {c["type"]: c for c in claims}
        published[slug] = [by_type[t] for t in rank(by_type)[:TOP_N]]
    on_page = {(s, c["type"]) for s, v in published.items() for c in v}
    for f in finals:
        f["published"] = (f["tribe"], f["type"]) in on_page
    counts = {s: sum(f["status"] == s for f in finals) for s in ("verified", "needs_review", "dropped", "withheld")}
    counts.update(claims_checked=len(finals), verify_requests=len(attempts),
                  stepped_down=sum(f["status"] != "dropped" and f["stage_label"] != f["first_stage_label"]
                                   for f in finals),
                  checks_below_0_3=sum(a["status"] == "dropped" for a in attempts),
                  published=len(on_page),
                  published_verified=sum(f["published"] and f["status"] == "verified" for f in finals),
                  published_needs_review=sum(f["published"] and f["status"] == "needs_review" for f in finals))
    write_json(WORK / "verify.json", {"verified_utc": dt.datetime.now(dt.UTC).isoformat(), "models": sorted(models),
                                      "counts": counts, "claims": finals, "checks": attempts})
    print(json.dumps(counts))
    publish(args, agg, published, counts, client, sorted(models | set(agg["models"])))


def publish(args, agg: dict, published: dict, counts: dict, client: Client, models: list[str]) -> None:
    corpus = read_json(WORK / "corpus.json")
    spot = read_json(WORK / "spot-check.json") if (WORK / "spot-check.json").exists() else None
    out_tribes, rows = [], []
    for t in corpus["tribes"]:
        examined = [d for d in t["documents"] if d["status"] == "examined"]
        pending = [d for d in t["documents"] if d["status"] == "pending_extraction"]
        by_sha = {d["sha256"]: d for d in examined}
        top = []
        for rank_no, c in enumerate(published.get(t["slug"], []), 1):
            cites = [{"doc_id": x["doc_id"], "title": by_sha[x["doc"]]["title"], "year": by_sha[x["doc"]]["year"],
                      "page": x["page"], "url": f"{by_sha[x['doc']]['url'].split('#')[0]}#page={x['page']}",
                      "excerpt": x["excerpt"]} for x in c["citations"]]  # every library object is a PDF
            top.append({"rank": rank_no, "type": c["type"], "label": TYPES[c["type"]]["label"],
                        "category": TYPES[c["type"]]["category"], "stage": round(c["best_stage"], 2),
                        "stage_label": c["stage_label"], "score": round(c["score"], 2), "documents": c["n_docs"],
                        "status": c["status"], "citations": cites})
        entry = {"name": t["name"], "slug": t["slug"], "states": t["states"],
                 "atni_listing": "Listed on a captured ATNI directory page (a directory listing, not certification)"
                                 + ("; not matched to the federal register list used by the source library"
                                    if t["registry_match"] == "unresolved" else ""),
                 "documents_examined": len(examined), "documents_pending_extraction": len(pending),
                 "documents": [{"id": d["id"], "title": d["title"], "year": d["year"], "url": d["url"],
                                "family": d["family"]}
                               for d in sorted(examined, key=lambda d: (-(d["year"] or 0), d["title"]))],
                 "top": top, "note": note(t, examined, pending, top)}
        out_tribes.append(entry)
        for item in top or [None]:
            first = (item or {}).get("citations", [{}])[0] if item else {}
            rows.append({"tribe": t["name"], "slug": t["slug"], "states": " ".join(t["states"]),
                         "rank": (item or {}).get("rank", ""), "type": (item or {}).get("type", ""),
                         "label": (item or {}).get("label", ""), "category": (item or {}).get("category", ""),
                         "stage": (item or {}).get("stage", ""), "stage_label": (item or {}).get("stage_label", ""),
                         "score": (item or {}).get("score", ""), "documents": (item or {}).get("documents", ""),
                         "status": (item or {}).get("status", ""), "citation_title": first.get("title", ""),
                         "citation_year": first.get("year") or "", "citation_page": first.get("page", ""),
                         "citation_url": first.get("url", ""), "citation_excerpt": first.get("excerpt", ""),
                         "note": entry["note"]})
    progress = corpus["campaign_progress"]
    by_stage = progress.get("by_stage") or {}
    data = {
        "schema": 1, "generated": args.generated, "tier": "T0",
        "source": {
            "library": "ATNI plan-assessor public plan library: national discovery corpus ledger 007 and the "
                       "library campaign inventory (documents found on public websites or their Wayback copies)",
            "tribes": "ATNI-listed Tribes: the 55 federally recognized Tribes on a captured ATNI directory page, plus "
                      "listed Tribes outside the federal register list that hold documents in the library"
                      + (f"; listed Tribes outside that list that hold no documents in the library are not shown ("
                         f"{', '.join(corpus['unresolved_listed_without_documents'])})"
                         if corpus["unresolved_listed_without_documents"] else ""),
            "extraction": f"Text from the library campaign's extraction where finished ({by_stage.get('extracted')} "
                          f"of {sum(by_stage.values()) if by_stage else 'all'} library records extracted when this "
                          f"was built), else the PDF's own text layer; no OCR was run for this analysis",
            "documents_examined": len({d["sha256"] for t in corpus["tribes"] for d in t["documents"]
                                       if d["status"] == "examined"}),  # a multi-Tribe plan counts once
            "documents_pending_extraction": len({d["sha256"] for t in corpus["tribes"] for d in t["documents"]
                                                 if d["status"] == "pending_extraction"}),
        },
        "method": {
            "summary": "Each Tribe's public planning documents in the library were searched page by page for 13 "
                       "energy types. Passages around the matches were read by a calibrated judgment model (TypeSafe "
                       "Jev), which answered three questions per type: whether the passage describes the Tribe's own "
                       "energy work, how far that work has progressed, and whether it was found unsuitable. Code then "
                       "ranked the types by the most advanced stage found, with a small bonus for support in several "
                       "documents. A second model pass checked each ranked claim against its cited excerpts; a claim "
                       "the excerpts did not support was re-checked one stage lower, and dropped if no stage held. "
                       "Fossil fuel backup (diesel generators, propane, natural gas) and transmission are not ranked.",
            "energy_types": [{"id": tid, "label": TYPES[tid]["label"], "category": TYPES[tid]["category"]}
                             for tid in ORDER],
            "stages": [{"label": label, "minimum_stage": floor} for floor, label in STAGE_LABELS],
            "thresholds": {"own_admissible": YES, "own_uncertain_band": [NO, YES], "rejected": YES,
                           "drop_below_stage": STAGE_MIN, "rejection_stands_below_stage": REJECT_OVERRIDE,
                           "score": "best_stage + 0.25 * min(documents - 1, 3)",
                           "document_screens": {"prepared_by_or_for_tribe": PREPARED_MIN,
                                                "plan_or_planning_assessment": PLAN_MIN},
                           "passages": {"per_type": PER_TYPE, "per_tribe": PER_TRIBE}},
            "judgment_model": f"TypeSafe Jev ({', '.join(models)}); stage read as "
                              + ("the most probable level" if STAGE_READING == "mode" else "the expected level"),
            "verification": dict(counts, rule="second Jev pass per claim over its excerpts with their document, year "
                                              "and page: >= 0.7 verified, 0.3 to 0.7 needs review, below 0.3 dropped "
                                              "and re-checked one stage lower",
                                 spot_check=spot["summary"] if spot else None),
        },
        "caveats": [
            "This is a machine-assisted reading of public planning documents. It is not the Tribe's own assessment, "
            "and it is not an endorsement of any project.",
            "Each Tribe is the authority on its own plans and priorities.",
            "Plans may be outdated, and newer plans may exist that the library does not hold.",
            "The attribution of documents to Tribes comes from the library and may be imperfect.",
            "ATNI listing comes from a capture of ATNI's directory page and records a listing, not membership "
            "certification.",
            "Some documents still await text extraction, so a Tribe's entry may change when they are read.",
            "A Tribe can ask ATNI to correct or remove its entry.",
        ],
        "tribes": out_tribes,
    }
    write_json(SITE_JSON, data)
    with open(SITE_CSV, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    log = WORK / "jev-requests.log"
    lines = [json.loads(x) for x in log.read_text(encoding="utf-8").splitlines() if x.strip()] if log.exists() else []
    receipt = {"generated": args.generated, "recorded_utc": dt.datetime.now(dt.UTC).isoformat(),
               "inputs": corpus["inputs"], "campaign_progress_at_build": progress,
               "campaign_progress_at_run": agg.get("campaign_progress_at_run"),
               "counts": dict(corpus["counts"], verification=counts,
                              published_types=sum(len(t["top"]) for t in out_tribes)),
               "models_returned": models,
               "jev_requests": {"http_requests": client.sent, "payloads_logged": len(lines),
                                "by_kind": {k: sum(x["kind"] == k for x in lines) for k in ("probe", "passage", "verify")},
                                "failed_payloads": sum(bool(x.get("error")) for x in lines),
                                "input_tokens": sum((x.get("usage") or {}).get("input_tokens", 0) for x in lines)},
               "outputs": {p.relative_to(REPO).as_posix(): file_sha(p) for p in (SITE_JSON, SITE_CSV)}}
    write_json(WORK / "run-receipt.json", receipt)
    print(f"wrote {SITE_JSON.relative_to(REPO)} and {SITE_CSV.relative_to(REPO)}")


def note(t: dict, examined: list, pending: list, top: list) -> str:
    more = (f" {len(pending)} more document{'s' if len(pending) != 1 else ''} await"
            f"{'s' if len(pending) == 1 else ''} text extraction and may add evidence.") if pending else ""
    if not t["documents"]:
        return "The library holds no documents attributed to this Tribe yet."
    if not examined and pending:
        return f"{len(pending)} document{'s' if len(pending) != 1 else ''} await{'s' if len(pending) == 1 else ''} " \
               f"text extraction; none could be read yet."
    if not examined:
        return "None of the documents attributed to this Tribe passed the screens for public planning documents."
    if not top:
        return (f"Read {len(examined)} document{'s' if len(examined) != 1 else ''}; no passage showed energy work "
                f"that the Tribe owns, studies or plans.{more}")
    if len(top) < TOP_N:
        return f"Evidence supported {len(top)} energy type{'s' if len(top) != 1 else ''}, fewer than five.{more}"
    return more.strip()


# ---------------------------------------------------------------- check
def check(args) -> int:
    problems = []
    need = lambda ok, msg: ok or problems.append(msg)
    data = read_json(SITE_JSON)
    raw = SITE_JSON.read_text(encoding="utf-8") + SITE_CSV.read_text(encoding="utf-8")
    need(not LOCAL_PATH.search(raw), f"local path in public files: {LOCAL_PATH.search(raw)}")
    need("TYPESAFE" not in raw and "Bearer " not in raw, "credential text in public files")
    need(data.get("schema") == 1 and data.get("tier") == "T0", "schema/tier")
    for key in ("generated", "source", "method", "caveats", "tribes"):
        need(key in data, f"missing {key}")
    caveats = " ".join(data["caveats"]).lower()
    for phrase in ("not the tribe's own assessment", "authority", "outdated", "attribution", "directory",
                   "correct or remove"):
        need(phrase in caveats, f"caveat missing: {phrase}")
    corpus = read_json(WORK / "corpus.json")
    pages = {(p["doc_id"], p["page"]): p["page_text"] for p in read_jsonl(WORK / "passages.jsonl")}
    allowed = {(t["slug"], d["id"]) for t in corpus["tribes"] for d in t["documents"] if d["status"] == "examined"
               and may_send(d)}
    need({t["slug"] for t in data["tribes"]} == {t["slug"] for t in corpus["tribes"]}, "Tribe list differs")
    for t in data["tribes"]:
        ids = {d["id"] for d in t["documents"]}
        need(all((t["slug"], i) in allowed for i in ids), f"{t['slug']}: a listed document was not screened in")
        need(len(t["top"]) <= TOP_N and [x["rank"] for x in t["top"]] == list(range(1, len(t["top"]) + 1)),
             f"{t['slug']}: ranks")
        need(bool(t["note"]) or len(t["top"]) == TOP_N, f"{t['slug']}: an entry with fewer than five types needs a note")
        for x in t["top"]:
            need(x["type"] in TYPES and x["status"] in ("verified", "needs_review"), f"{t['slug']}: type/status")
            need((t["slug"], x["type"]) not in WITHHELD, f"{t['slug']} {x['type']}: a withheld claim was published")
            need(x["stage_label"] == stage_label(x["stage"]), f"{t['slug']} {x['type']}: stage label")
            need(1 <= len(x["citations"]) <= CITATIONS_MAX, f"{t['slug']} {x['type']}: citation count")
            need(len({c["doc_id"] for c in x["citations"]}) == len(x["citations"]), f"{t['slug']}: repeated document")
            for c in x["citations"]:
                text = pages.get((c["doc_id"], c["page"]))
                need(c["doc_id"] in ids, f"{t['slug']}: citation outside the document list")
                need(text is not None and c["excerpt"] in text, f"{t['slug']} {x['type']}: excerpt not on its page")
                need(len(c["excerpt"]) <= EXCERPT_MAX, f"{t['slug']}: excerpt too long")
                need(not EMAIL.search(c["excerpt"]) and not PHONE.search(c["excerpt"]), f"{t['slug']}: contact data")
                need(c["url"].startswith(("https://", "http://")) and c["url"].endswith(f"#page={c['page']}"),
                     f"{t['slug']}: citation url")
    with open(SITE_CSV, encoding="utf-8", newline="") as f:
        csv_rows = list(csv.DictReader(f))
    need(len(csv_rows) == sum(max(1, len(t["top"])) for t in data["tribes"]), "CSV rows do not match the JSON")
    need(not any(d["sha256"] == GILA_SHA for t in corpus["tribes"] for d in t["documents"]
                 if d["status"] == "examined"), "Gila River object examined")
    for p in problems:
        print("PROBLEM:", p)
    print(f"check: {len(problems)} problems; {len(data['tribes'])} Tribes, "
          f"{sum(len(t['top']) for t in data['tribes'])} ranked types")
    return 1 if problems else 0


# ---------------------------------------------------------------- spot-check sample
def sample(args) -> None:
    """Print a seeded sample of published claims with their page text, for a person to check by hand."""
    data = read_json(SITE_JSON)
    claims = [(t["name"], x) for t in data["tribes"] for x in t["top"]]
    # stable under reruns: a claim's place depends only on the seed, the Tribe and the type
    claims.sort(key=lambda c: hashlib.sha256(f"{args.seed}:{c[0]}:{c[1]['type']}".encode()).hexdigest())
    pages = {(p["doc_id"], p["page"]): p["page_text"] for p in read_jsonl(WORK / "passages.jsonl")}
    for name, x in claims[:args.n]:
        print(f"\n######## {name} | {x['label']} | {x['stage_label']} | {x['status']}")
        for c in x["citations"]:
            text = pages[(c["doc_id"], c["page"])]
            at = text.find(c["excerpt"])
            print(f"--- {c['title']} ({c['year']}) p.{c['page']}\n{text[max(0, at - 700):at + len(c['excerpt']) + 700]}")


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--plan-assessor", help="plan-assessor root (default: PLAN_ASSESSOR_ROOT)")
    sub = parser.add_subparsers(dest="step", required=True)
    sub.add_parser("build")
    p = sub.add_parser("probe")
    p.add_argument("--ids", required=True, help="comma-separated passage ids from passages.jsonl")
    sub.add_parser("run")
    v = sub.add_parser("verify")
    v.add_argument("--generated", default=dt.date.today().isoformat())
    sub.add_parser("check")
    s = sub.add_parser("sample")
    s.add_argument("--n", type=int, default=15)
    s.add_argument("--seed", type=int, default=20261029)
    args = parser.parse_args(argv)
    step = {"build": build, "probe": probe, "run": run, "verify": verify, "check": check, "sample": sample}[args.step]
    return step(args) or 0


if __name__ == "__main__":
    sys.exit(main())
