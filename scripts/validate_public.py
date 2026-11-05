"""Release-boundary checks for the public site/ folder (see DATA-TIERS.md).

GitHub Pages publishes site/ and nothing else, so everything in it must be T0.
This script checks, and exits non-zero on any problem:

- only allowed public file types, and no private working folders;
- no local file paths, credential-like strings, T1 locations (planning-T1,
  files-unsorted), Google Docs or Drive links, @atnitribes.org addresses, or
  email links in any public file, including PDF text and metadata;
- no em dashes in published prose (house style);
- no external scripts, stylesheets, fonts, or frames (no CDNs or trackers);
- every local link and in-page anchor in the HTML resolves inside site/;
- data/library.json follows the documented schema (docs/LIBRARY.md): required
  fields and types, enums, real dates, every entry T0, unique ids, https or
  existing local urls (local PDFs under library/);
- PDFs open, have pages, and carry no local paths;
- content slot markers are balanced, unique, and listed in docs/CONTENT-SLOTS.md;
- the data products are light-checked: data/energy-potential.json (T0, known types, stages and
  checks, cited https links that end in #page=N), data/energy-funding.json (T0, no key or string
  that names a heat screen and no heat section, program statuses and dated status checks, https
  links), data/policy-watch.json and the Policy Sentinel follow files (required fields, https links);
- shipped claims (data/claims/) each have a unique id, an https source, a quote, a status of verified
  or partly, and no email; every plate data block in a page names claims that ship, holds only their
  numbers (or a model's, or a formula's over those), and states the limit of a partly claim; every plate
  definition (data/plates/) is T0 and built; a figure poured into a page (data-pour) names a claim that ships.

Standard library plus PyMuPDF (imported as fitz, only when PDFs are read, so scripts/build_plates.py can
reuse these rules with the standard library alone). Run: python scripts/validate_public.py
"""
from datetime import date
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
SLOTS_DOC = ROOT / "docs" / "CONTENT-SLOTS.md"

ALLOWED = {".html", ".css", ".js", ".json", ".csv", ".txt", ".pdf", ".woff2", ".svg", ".png", ".jpg", ".jpeg", ".webp"}
TEXT = {".html", ".css", ".js", ".json", ".csv", ".txt", ".svg"}
PRIVATE_DIRS = {".git", "planning-T1", "files-unsorted", "work", "node_modules", "__pycache__"}

LOCAL_PATH = re.compile(r"(?i)(?<![a-z0-9])[a-z]:[\\/]|file:/|[\\/]Users[\\/]|AppData[\\/]")
HTTPS_URL = re.compile(r"https://[^\s\"'<>]+")  # a web address may hold /users/ in its own path
EMAIL = re.compile(r"[\w.%+-]+@[\w-]+\.[A-Za-z]{2,}")
SECRET = re.compile(
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}"
    r"|(?<![\w-])sk-(?:ant-|proj-)?[A-Za-z0-9][A-Za-z0-9_-]{30,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|xox[abposr]-[A-Za-z0-9-]{10,}"
)
FORBIDDEN = re.compile(r"(?i)planning-T1|files-unsorted|docs\.google\.com|drive\.google\.com|[a-z0-9._%+-]+@atnitribes\.org|mailto:")
EM_DASH = re.compile("\u2014| -- ")
EXTERNAL_LOAD_TAGS = {"script", "link", "img", "iframe", "source", "audio", "video", "embed", "object", "track"}
CSS_EXTERNAL = re.compile(r"(?i)@import|url\(\s*['\"]?(?:https?:)?//")
JS_EXTERNAL = re.compile(r"(?i)(?:\bfrom\s*|\bimport\s*\(\s*|\bfetch\s*\(\s*)['\"`](?:https?:)?//")
SLOT = re.compile(r"<!--\s*(/?)SLOT(?::([a-z0-9-]+):([a-z0-9-]+))?\s*-->")
PLATE_BLOCK = re.compile(r'<script type="application/json" id="plate-data-([^"]+)">(.*?)</script>', re.S)
POURED = re.compile(r'<[a-z][^<>]*\sdata-pour="([^"]+)"[^<>]*>')
CLAIM_STATUS = {"verified", "partly"}
CLAIM_ID = re.compile(r"\b(?:au|ec|fp|fin|gf|lf|px|rs|sf|sv|tr)-\d{3}\b")

TYPES = {"resolution", "report", "policy", "legislation", "article", "academic", "dataset", "tool", "website", "news"}
AREAS = {"energy-feasibility", "data-centers", "ai", "summit", "cross-cutting"}
FIELDS = {
    "id": str, "title": str, "url": str, "publisher": str, "date": str, "type": str, "areas": list,
    "tribal_specific": bool, "summary": str, "tier": str, "added": str, "featured": bool,
}
OPTIONAL = {"link_status": {"ok", "unverified"}}  # written by scripts/merge_library.py
SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
DAY = re.compile(r"\d{4}-\d{2}-\d{2}")
YEAR_OR_DAY = re.compile(r"\d{4}(?:-\d{2}-\d{2})?")
# The heat screen is T1 until the owner releases it (docs/ENERGY-FUNDING.md); nothing public may name it.
HEAT_SCREEN = re.compile(r"(?i)heat[\s_-]*screen")
CHECKS = {"verified", "needs_review"}


def self_test():
    """Guard the patterns against silent regressions."""
    assert LOCAL_PATH.search(r"C:\Users\someone\file.txt") and LOCAL_PATH.search("I:/climate/x") and LOCAL_PATH.search("file:///x")
    assert not LOCAL_PATH.search("https://atnitribes.org/contact-us/ T1: network")
    assert not LOCAL_PATH.search(HTTPS_URL.sub(" ", "https://agc.org/files/users/u1/a%20(4).pdf")) and LOCAL_PATH.search(HTTPS_URL.sub(" ", "https://x.org C:/Users/me"))
    assert EMAIL.search("write to someone@example.org") and not EMAIL.search("@handle and 3 @ 4.5")
    assert PLATE_BLOCK.findall('<script type="application/json" id="plate-data-a">{"rows":[]}</script>') == [("a", '{"rows":[]}')]
    assert POURED.findall('<span class="x" data-pour="a-1">1</span>') == ["a-1"]
    assert numeric_tree({"a": {"b": 1, "c": "words"}, "d": "words", "e": [1, 2], "f": ["x"]}) == {"a": {"b": 1}, "e": [1, 2]}
    assert lookup({"a": {"b": 1}}, "a.b") == 1
    assert SECRET.search("ghp_" + "a" * 36) and not SECRET.search("data-center-task-force-questions-for-tribal-leaders")
    assert FORBIDDEN.search("someone@ATNITRIBES.org") and FORBIDDEN.search("see planning-T1/notes") and not FORBIDDEN.search("atnitribes.org/contact-us/")
    assert EM_DASH.search("a \u2014 b") and not EM_DASH.search("<!-- SLOT:a:b --> --atni-color")
    assert SLOT.findall("<!-- SLOT:ai:x --> <!-- /SLOT -->") == [("", "ai", "x"), ("/", "", "")]
    assert HEAT_SCREEN.search("atni-heat-screen.json") and HEAT_SCREEN.search("Heat Screen") and HEAT_SCREEN.search("heat_screen")
    assert not HEAT_SCREEN.search("heat-pumps") and not HEAT_SCREEN.search("extreme heat")
    assert https("https://x.org/a") and not https("http://x.org") and not https("https://") and not https(None)
    assert list(strings_and_keys({"a": [{"heat_screen": 1}], "b": "x"})) == [("a", "a"), ("a[0].heat_screen", "heat_screen"), ("b", "b"), ("b", "x")]
    errors = []
    check_funding_heat({"tier": "T0", "programs": [{"note": "see the heat screen"}]}, "f", errors)
    assert len(errors) == 1, errors


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids, self.refs = set(), []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get("id"):
            self.ids.add(attrs["id"])
        for key in ("href", "src"):
            if attrs.get(key):
                self.refs.append((tag, attrs[key]))


def parse(path, cache={}):
    if path not in cache:
        page = Page()
        page.feed(path.read_text(encoding="utf-8"))
        cache[path] = page
    return cache[path]


VERBATIM_KEYS = {"excerpt", "title", "quote"}  # quoted source text and titles of external works keep their own dashes


def our_prose(node, key=None):
    """Yield the JSON strings that are this project's own writing (house style applies)."""
    if isinstance(node, str):
        if key not in VERBATIM_KEYS:
            yield node
    elif isinstance(node, dict):
        for k, v in node.items():
            yield from our_prose(v, k)
    elif isinstance(node, list):
        for v in node:
            yield from our_prose(v, key)


def check_text(rel, body, errors):
    if LOCAL_PATH.search(HTTPS_URL.sub(" ", body)):
        errors.append(f"Local path in {rel}")
    if SECRET.search(body):
        errors.append(f"Credential-like content in {rel}")
    for match in sorted(set(m.group(0) for m in FORBIDDEN.finditer(body))):
        errors.append(f"Forbidden string in {rel}: {match}")


def check_html(path, rel, errors):
    page = parse(path)
    for tag, url in page.refs:
        parts = urlsplit(url)
        if parts.scheme in {"http", "https"} or url.startswith("//"):
            if tag in EXTERNAL_LOAD_TAGS:
                errors.append(f"External resource load in {rel}: <{tag}> {url}")
            elif parts.scheme == "http":
                errors.append(f"Insecure http link in {rel}: {url}")
            continue
        if parts.scheme:  # data: and similar inline values load nothing
            continue
        target = path if not parts.path else (path.parent / unquote(parts.path)).resolve()
        if target.is_dir():
            target = target / "index.html"
        if not target.is_relative_to(SITE.resolve()) or not target.is_file():
            errors.append(f"Broken or escaping local link in {rel}: {url}")
            continue
        if parts.fragment and target.suffix == ".html" and parts.fragment not in parse(target).ids:
            errors.append(f"Missing anchor in {rel}: {url}")


def check_slots(path, rel, body, seen, errors):
    page_key = "home" if path.parent == SITE else path.parent.relative_to(SITE).parts[0]
    open_slot = None
    for closing, key, slot_id in SLOT.findall(body):
        if closing:
            if not open_slot:
                errors.append(f"Unmatched <!-- /SLOT --> in {rel}")
            open_slot = None
            continue
        if not key:
            errors.append(f"Slot marker without page and id in {rel}")
            continue
        if open_slot:
            errors.append(f"Nested slot {key}:{slot_id} inside {open_slot} in {rel}")
        open_slot = f"{key}:{slot_id}"
        if key != page_key:
            errors.append(f"Slot {open_slot} in {rel} should start with '{page_key}:'")
        if open_slot in seen:
            errors.append(f"Duplicate slot id {open_slot} ({rel} and {seen[open_slot]})")
        seen[open_slot] = rel
    if open_slot:
        errors.append(f"Slot {open_slot} in {rel} is never closed")


def real_date(text):
    try:
        date.fromisoformat(text if len(text) == 10 else f"{text}-01-01")
        return True
    except ValueError:
        return False


def check_library(errors):
    rel = "data/library.json"
    try:
        data = json.loads((SITE / rel).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        errors.append(f"{rel} is missing or not valid JSON: {error}")
        return 0
    if not isinstance(data, dict) or set(data) != {"schema", "updated", "entries"}:
        errors.append(f"{rel} must hold exactly schema, updated, and entries")
        return 0
    if data["schema"] != 1:
        errors.append(f"{rel}: schema must be 1")
    updated = data["updated"]
    if not (isinstance(updated, str) and DAY.fullmatch(updated) and real_date(updated)):
        errors.append(f"{rel}: updated must be a real YYYY-MM-DD date")
        updated = None
    entries = data["entries"]
    if not isinstance(entries, list) or not entries:
        errors.append(f"{rel}: entries must be a non-empty list")
        return 0
    ids = set()
    for n, entry in enumerate(entries):
        where = f"{rel} entry {n}"
        if not isinstance(entry, dict):
            errors.append(f"{where}: not an object")
            continue
        where = f"{rel} entry '{entry.get('id', n)}'"
        missing, extra = set(FIELDS) - set(entry), set(entry) - set(FIELDS) - set(OPTIONAL)
        if missing or extra:
            errors.append(f"{where}: missing {sorted(missing)} unknown {sorted(extra)}")
            continue
        for key, allowed in OPTIONAL.items():
            if key in entry and entry[key] not in allowed:
                errors.append(f"{where}: {key} must be one of {sorted(allowed)}")
        bad = [k for k, kind in FIELDS.items() if not isinstance(entry[k], kind) or (kind is str and not entry[k].strip())]
        if bad:
            errors.append(f"{where}: wrong type or empty value for {bad}")
            continue
        if not SLUG.fullmatch(entry["id"]):
            errors.append(f"{where}: id must be a kebab-case slug")
        if entry["id"] in ids:
            errors.append(f"{where}: duplicate id")
        ids.add(entry["id"])
        if entry["tier"] != "T0":
            errors.append(f"{where}: tier must be T0; only T0 material is published")
        if entry["type"] not in TYPES:
            errors.append(f"{where}: unknown type {entry['type']!r}")
        areas = entry["areas"]
        if not areas or len(set(areas)) != len(areas) or not set(areas) <= AREAS:
            errors.append(f"{where}: areas must be a non-empty list of distinct values from {sorted(AREAS)}")
        if not (YEAR_OR_DAY.fullmatch(entry["date"]) and real_date(entry["date"])):
            errors.append(f"{where}: date must be YYYY or a real YYYY-MM-DD")
        if not (DAY.fullmatch(entry["added"]) and real_date(entry["added"])):
            errors.append(f"{where}: added must be a real YYYY-MM-DD date")
        elif updated and entry["added"] > updated:
            errors.append(f"{where}: added is later than the file's updated date")
        url = entry["url"]
        parts = urlsplit(url)
        if parts.scheme == "https":
            if not parts.netloc:
                errors.append(f"{where}: url has no host")
        elif parts.scheme or url.startswith(("/", "//")) or "\\" in url or ".." in url.split("/"):
            errors.append(f"{where}: url must be https:// or a relative path inside site/")
        elif not (SITE / unquote(parts.path)).is_file():
            errors.append(f"{where}: local file not found: {url}")
        elif url.lower().endswith(".pdf") and not url.startswith("library/"):
            errors.append(f"{where}: local PDFs belong under library/")
    return len(entries)


def check_pdf(path, rel, errors):
    import fitz

    try:
        with fitz.open(path) as pdf:
            if pdf.page_count == 0 or path.stat().st_size == 0:
                errors.append(f"Empty PDF: {rel}")
                return
            text = "\n".join(page.get_text() for page in pdf)
            meta = " ".join(str(v) for v in (pdf.metadata or {}).values() if v) + " " + (pdf.get_xml_metadata() or "")
    except Exception as error:  # a PDF that will not open must not ship
        errors.append(f"Unreadable PDF {rel}: {error}")
        return
    check_text(f"PDF text of {rel}", text, errors)
    if LOCAL_PATH.search(meta):
        errors.append(f"Local path in PDF metadata: {rel}")


def https(url):
    """True for an absolute https address with a host."""
    if not isinstance(url, str):
        return False
    parts = urlsplit(url)
    return parts.scheme == "https" and bool(parts.netloc)


def iso_day(text):
    return isinstance(text, str) and bool(DAY.fullmatch(text)) and real_date(text)


def strings_and_keys(node, path=""):
    """Yield (path, text) for every dict key and every string value, so one rule can read both."""
    if isinstance(node, dict):
        for key, value in node.items():
            here = f"{path}.{key}" if path else str(key)
            yield here, str(key)
            yield from strings_and_keys(value, here)
    elif isinstance(node, list):
        for i, value in enumerate(node):
            yield from strings_and_keys(value, f"{path}[{i}]")
    elif isinstance(node, str):
        yield path, node


def load_data(rel, errors):
    try:
        return json.loads((SITE / rel).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        errors.append(f"{rel} is missing or not valid JSON: {error}")
        return None


def need(record, keys, where, errors):
    """Each key holds a non-empty string."""
    bad = [k for k in keys if not isinstance(record.get(k), str) or not record[k].strip()]
    if bad:
        errors.append(f"{where}: missing or empty {bad}")


def check_header(data, rel, errors):
    if data.get("tier") != "T0" or data.get("schema") != 1:
        errors.append(f"{rel}: tier must be T0 and schema 1")


def check_energy_potential(errors):
    rel = "data/energy-potential.json"
    data = load_data(rel, errors)
    if not isinstance(data, dict):
        return 0
    check_header(data, rel, errors)
    try:
        types = {t["id"] for t in data["method"]["energy_types"]}
        stages = {s["label"] for s in data["method"]["stages"]}
        tribes = list(data["tribes"])
    except (KeyError, TypeError):
        errors.append(f"{rel}: method.energy_types, method.stages, and tribes are required")
        return 0
    for tribe in tribes:
        where = f"{rel} tribe '{tribe.get('slug', '?')}'"
        need(tribe, ("name", "slug"), where, errors)
        findings = tribe.get("top")
        if not isinstance(findings, list):
            errors.append(f"{where}: top must be a list")
            continue
        if not findings and not str(tribe.get("note") or "").strip():
            errors.append(f"{where}: a Tribe with no finding must say why in note")
        for f in findings:
            fw = f"{where} {f.get('type', '?')}"
            if f.get("type") not in types or f.get("stage_label") not in stages or f.get("status") not in CHECKS:
                errors.append(f"{fw}: unknown type, stage_label, or status")
            cites = f.get("citations")
            if not isinstance(cites, list) or not cites:
                errors.append(f"{fw}: needs at least one citation")
                continue
            for c in cites:
                if not (https(c.get("url")) and c["url"].endswith(f"#page={c.get('page')}")):
                    errors.append(f"{fw}: citation link must be https and end in #page=<page>")
                need(c, ("title", "excerpt"), fw, errors)
    return len(tribes)


def check_funding_heat(data, rel, errors):
    """The heat screen is T1 until the owner releases it: no heat section, and no key or string naming one."""
    if isinstance(data, dict) and "heat" in data:
        errors.append(f"{rel}: holds a heat section; the heat screen stays T1 until the owner releases it")
    for path, text in strings_and_keys(data):
        if HEAT_SCREEN.search(text):
            errors.append(f"{rel}: {path} names a heat screen")


def check_energy_funding(errors):
    rel = "data/energy-funding.json"
    data = load_data(rel, errors)
    if not isinstance(data, dict):
        return 0
    check_header(data, rel, errors)
    check_funding_heat(data, rel, errors)
    statuses = set((data.get("vocabulary") or {}).get("statuses") or {})
    programs = data.get("programs")
    if not statuses or not isinstance(programs, list) or not programs:
        errors.append(f"{rel}: vocabulary.statuses and a non-empty programs list are required")
        return 0
    for p in programs:
        where = f"{rel} program '{p.get('id', '?')}'"
        need(p, ("id", "short_name", "name", "agency", "status_label"), where, errors)
        if p.get("status") not in statuses:
            errors.append(f"{where}: status must be one of {sorted(statuses)}")
        checked = p.get("status_checked") or {}
        if not (iso_day(checked.get("date")) and https(checked.get("url"))):
            errors.append(f"{where}: status_checked needs a real date and an https page")
        if p.get("deadline") is not None and not iso_day((p["deadline"] or {}).get("date")):
            errors.append(f"{where}: deadline.date must be a real YYYY-MM-DD date")
        if not https(p.get("url")) or not all(https(u) for u in p.get("sources") or []):
            errors.append(f"{where}: url and sources must be https")
    live = data.get("live") or {}
    if not isinstance(live.get("retrieved"), str) or not all(https(o.get("url")) for o in live.get("opportunities") or []):
        errors.append(f"{rel}: live needs a retrieval time and https opportunity links")
    if not isinstance(data.get("tribes"), list):
        errors.append(f"{rel}: tribes must be a list")
    return len(programs)


def check_follow_file(rel, errors):
    data = load_data(rel, errors)
    if not (isinstance(data, dict) and data.get("version") == 1 and isinstance(data.get("followed"), list) and data["followed"]):
        errors.append(f"{rel}: must be Policy Sentinel's export format (version 1) with a non-empty followed list")
        return
    for item in data["followed"]:
        where = f"{rel} '{item.get('id', '?')}'"
        need(item, ("id", "sourceId", "kind", "value"), where, errors)
        if not https((item.get("record") or {}).get("officialUrl")):
            errors.append(f"{where}: record.officialUrl must be https")


def check_policy_watch(errors):
    rel = "data/policy-watch.json"
    data = load_data(rel, errors)
    if not isinstance(data, dict):
        return 0, 0
    check_header(data, rel, errors)
    if not https((data.get("policy_sentinel") or {}).get("url")):
        errors.append(f"{rel}: policy_sentinel.url must be https")
    forces = data.get("task_forces")
    if not isinstance(forces, dict) or not forces:
        errors.append(f"{rel}: task_forces is required")
        return 0, 0
    searches = follows = 0
    for force_id, force in forces.items():
        where = f"{rel} {force_id}"
        if not force.get("searches"):
            errors.append(f"{where}: needs searches")
        for s in force.get("searches") or []:
            sw = f"{where} search '{s.get('id', '?')}'"
            need(s, ("id", "title", "why", "source", "query"), sw, errors)
            if not (https(s.get("official_url")) and https(s.get("policy_sentinel_url"))):
                errors.append(f"{sw}: official_url and policy_sentinel_url must be https")
            if not iso_day((s.get("checked") or {}).get("date")):
                errors.append(f"{sw}: checked.date must be a real YYYY-MM-DD date")
            searches += 1
        for f in force.get("follow") or []:
            fw = f"{where} follow '{f.get('identifier') or f.get('title', '?')}'"
            need(f, ("kind", "title", "reason"), fw, errors)
            if not https(f.get("url")):
                errors.append(f"{fw}: url must be https")
            follows += 1
        file = force.get("follow_file")
        if not (isinstance(file, str) and file.startswith("data/policy-sentinel/") and (SITE / file).is_file()):
            errors.append(f"{where}: follow_file must name a file in data/policy-sentinel/")
    for path in sorted((SITE / "data" / "policy-sentinel").glob("*.json")):
        check_follow_file(path.relative_to(SITE).as_posix(), errors)
    return searches, follows


def check_claim_file(data, rel, claims, errors):
    """One shipped claims file. Adds each claim to the claims dict by id, so ids stay unique across files."""
    check_header(data, rel, errors)
    if not isinstance(data.get("claims"), list) or not data["claims"]:
        errors.append(f"{rel}: claims must be a non-empty list")
        return
    for claim in data["claims"]:
        claim_id = claim.get("id")
        where = f"{rel} claim '{claim_id or '?'}'"
        if not isinstance(claim_id, str) or not claim_id.strip():
            errors.append(f"{where}: needs an id")
            continue
        if claim_id in claims:
            errors.append(f"{where}: duplicate id")
        claims[claim_id] = claim
        if not https((claim.get("source") or {}).get("url")):
            errors.append(f"{where}: source.url must be https")
        need(claim, ("quote",), where, errors)
        if claim.get("status") not in CLAIM_STATUS:
            errors.append(f"{where}: status must be one of {sorted(CLAIM_STATUS)}")
        if EMAIL.search(json.dumps(claim, ensure_ascii=False)):
            errors.append(f"{where}: holds an email address")


def is_model(data):
    """A comparison model ships as data: numbers and equations with their claim ids, no claim rows of its own."""
    return isinstance(data, dict) and "computed_defaults" in data


def load_model(name, site=None):
    """A model file by name, from data/ or data/claims/, or None."""
    for folder in ("data", "data/claims"):
        path = Path(site or SITE) / folder / f"{name}.json"
        if path.is_file():
            return json.loads(path.read_text(encoding="utf-8"))
    return None


def lookup(tree, path):
    node = tree
    for part in path.split("."):
        node = node[part]
    return node


def numeric_tree(node):
    """The numbers in a branch of a model, under their names. Its prose stays in the file."""
    if isinstance(node, dict):
        kept = {key: numeric_tree(value) for key, value in node.items()}
        return {key: value for key, value in kept.items() if value is not None} or None
    if isinstance(node, list):
        return node if node and all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in node) else None
    return node if isinstance(node, (int, float)) and not isinstance(node, bool) else None


def check_claims(errors):
    claims = {}
    for path in sorted((SITE / "data" / "claims").glob("*.json")):
        rel = path.relative_to(SITE).as_posix()
        data = load_data(rel, errors)
        if is_model(data):
            check_header(data, rel, errors)
        elif isinstance(data, dict):
            check_claim_file(data, rel, claims, errors)
    return claims


def numbers_in(node):
    """Every number a claim holds, so a plate row can be traced back to it."""
    if isinstance(node, dict):
        return {n for key, value in node.items() if key != "source" for n in numbers_in(value)}
    if isinstance(node, list):
        return {n for value in node for n in numbers_in(value)}
    return {node} if isinstance(node, (int, float)) and not isinstance(node, bool) else set()


def check_plate_inputs(where, data, claims, errors):
    """Every named number a block's formulas read comes from a claim or a model, unchanged."""
    env = data.get("env") or {}
    for name, source in (data.get("sources") or {}).items():
        if "claim" in source:
            claim = claims.get(source["claim"])
            if claim is None:
                errors.append(f"{where}: input {name} names unknown claim {source['claim']!r}")
            elif env.get(name) not in numbers_in(claim):
                errors.append(f"{where}: input {name} holds a number claim {source['claim']} does not; rebuild the page")
        else:
            try:
                expected = numeric_tree(lookup(load_model(source["file"]) or {}, source["model"]))
            except (KeyError, TypeError):
                expected = None
            if expected is None or expected != env.get(name):
                errors.append(f"{where}: input {name} does not match model {source.get('file')}; rebuild the page")


def check_plate_row(where, row, data, claims, errors):
    name = f"{where}: row '{row.get('key', '?')}'"
    cited = [c for c in [row.get("claim"), *(row.get("cites") or [])] if c]
    unknown = [c for c in cited if c not in claims]
    computed, words = row.get("f") is not None, row.get("words") is True
    if unknown or not (cited or computed or words):
        errors.append(f"{name} names unknown claim {(unknown or [row.get('claim')])[0]!r}")
        return
    if computed or words:
        if words and any(row.get(k) is not None for k in ("value", "low", "high")):
            errors.append(f"{name} is words but holds a number; rebuild the page")
    else:
        numbers = {n for c in cited for n in numbers_in(claims[c])}
        numbers |= {-n for n in numbers} if row.get("negated") else set()
        if row.get("converted"):  # the arithmetic is the claim's derived text; the row states its factor
            numbers = {round(n * row["converted"], 6) for n in numbers}
            holds = lambda v: round(v, 6) in numbers
        else:
            holds = lambda v: v in numbers
        if any(row.get(k) is not None and not holds(row[k]) for k in ("value", "low", "high")) or any(not holds(v) for _, v in row.get("spark") or []):
            errors.append(f"{name} holds a number claim {cited[0]} does not; rebuild the page")
    if row.get("claim") and claims[row["claim"]].get("status") == "partly" and not str(row.get("limit") or "").strip():
        errors.append(f"{name} uses a partly verified claim without its limit")
    for claim_id in row.get("cites") or []:
        if claims[claim_id].get("status") == "partly" and not str(((data.get("receipts") or {}).get(claim_id) or {}).get("limit") or "").strip():
            errors.append(f"{name} cites partly verified claim {claim_id} without its limit")


def check_plate_blocks(rel, body, claims, errors):
    """A page's plate data names claims that ship, and holds only their numbers. Returns the block count."""
    blocks = PLATE_BLOCK.findall(body)
    for plate_id, text in blocks:
        where = f"{rel} plate '{plate_id}'"
        try:
            data = json.loads(text)
        except json.JSONDecodeError as error:
            errors.append(f"{where}: data block is not valid JSON: {error}")
            continue
        check_plate_inputs(where, data, claims, errors)
        for row in data.get("rows") or []:
            check_plate_row(where, row, data, claims, errors)
        for claim_id in data.get("receipts") or {}:
            if claim_id not in claims:
                errors.append(f"{where}: receipt names unknown claim {claim_id!r}")
    return len(blocks)


def check_plate_scripts(rel, body, errors):
    """The SVG marks load before the kit that uses them."""
    if PLATE_BLOCK.search(body) and not -1 < body.find("/plate-svg.js") < body.find("/plate.js"):
        errors.append(f"{rel}: a page with plates loads assets/js/plate-svg.js and then assets/js/plate.js")


def check_poured(rel, body, claims, errors):
    """A figure poured into a page's own text names a claim that ships, and a partly claim's limit is on the page."""
    for claim_id in sorted(set(POURED.findall(body))):
        claim = claims.get(claim_id)
        if claim is None:
            errors.append(f"{rel}: data-pour names unknown claim {claim_id!r}")
        elif claim.get("status") == "partly" and f'data-pour="{claim_id}" data-field="limit"' not in body:
            errors.append(f"{rel}: data-pour {claim_id} is partly verified; its limit must be on the page (data-field=\"limit\")")


def check_resource_model(claims, errors):
    """The Explorer's public model and page: the header, every claim id they name ships, and a partly verified one has its public limit."""
    rel = "data/resource-model.json"
    if not (SITE / rel).is_file():
        return
    data = load_data(rel, errors)
    if not isinstance(data, dict):
        return
    check_header(data, rel, errors)
    errors.extend(f"{rel}: missing {key}" for key in ("inputs", "assumptions", "catalog", "architectures", "disclaimer", "limits") if not data.get(key))
    page = SITE / "explorer" / "index.html"
    body = page.read_text(encoding="utf-8") if page.is_file() else ""
    receipts = {m[1]: m[0] for m in re.finditer(r'<li id="src-([^"]+)".*?</li>', body, re.S)}
    named = set(CLAIM_ID.findall(json.dumps(data)))
    for claim_id in sorted(named | set(re.findall(r'href="#src-([a-z]+-\d{3})"', body))):
        claim = claims.get(claim_id)
        if claim is None:
            errors.append(f"{rel}: names claim {claim_id}, which does not ship")
        elif claim_id not in named and claim_id not in receipts:
            errors.append(f"explorer/index.html: no receipt for {claim_id}")
        elif claim.get("status") == "partly" and not (claim.get("limit") or (data.get("limits") or {}).get(claim_id) or "Limit: " in receipts.get(claim_id, "")):
            errors.append(f"{rel}: partly verified claim {claim_id} has no public limit")


def check_plate_files(errors):
    paths = sorted((SITE / "data" / "plates").glob("*.json"))
    for path in paths:
        rel = path.relative_to(SITE).as_posix()
        data = load_data(rel, errors)
        if not isinstance(data, dict):
            continue
        check_header(data, rel, errors)
        page = SITE / str(data.get("page"))
        if not page.is_file() or f'id="plate-data-{data.get("id")}"' not in page.read_text(encoding="utf-8"):
            errors.append(f"{rel}: not built into {data.get('page')}; run scripts/build_plates.py")
    return len(paths)


def main():
    import fitz

    self_test()
    fitz.TOOLS.mupdf_display_errors(False)
    errors, slots = [], {}
    claims = check_claims(errors)
    plate_blocks = 0
    files = sorted(p for p in SITE.rglob("*") if p.is_file())
    for path in files:
        rel = path.relative_to(SITE).as_posix()
        if path.name != ".nojekyll" and path.suffix.lower() not in ALLOWED:
            errors.append(f"Unexpected public file type: {rel}")
        if PRIVATE_DIRS & set(path.relative_to(SITE).parts):
            errors.append(f"Private folder inside site/: {rel}")
        if path.suffix in TEXT:
            body = path.read_text(encoding="utf-8")
            check_text(rel, body, errors)
            if path.suffix in {".html", ".js"} and EM_DASH.search(body):
                errors.append(f"Em dash or spaced double hyphen in {rel} (house style)")
            if path.suffix == ".json" and any(EM_DASH.search(s) for s in our_prose(json.loads(body))):
                errors.append(f"Em dash or spaced double hyphen in {rel} (house style)")
            if path.suffix == ".css" and CSS_EXTERNAL.search(body):
                errors.append(f"External stylesheet or font in {rel}")
            if path.suffix == ".js" and JS_EXTERNAL.search(body):
                errors.append(f"External script or fetch in {rel}")
            if path.suffix == ".html":
                check_html(path, rel, errors)
                check_slots(path, rel, body, slots, errors)
                plate_blocks += check_plate_blocks(rel, body, claims, errors)
                check_plate_scripts(rel, body, errors)
                check_poured(rel, body, claims, errors)
        elif path.suffix == ".pdf":
            check_pdf(path, rel, errors)
    if not (SITE / ".nojekyll").is_file():
        errors.append("site/.nojekyll is missing")
    if not (SITE / "index.html").is_file():
        errors.append("site/index.html is missing")
    entries = check_library(errors)
    tribes = check_energy_potential(errors)
    programs = check_energy_funding(errors)
    searches, follows = check_policy_watch(errors)
    plates = check_plate_files(errors)
    check_resource_model(claims, errors)
    documented =SLOTS_DOC.read_text(encoding="utf-8") if SLOTS_DOC.is_file() else ""
    for slot, rel in slots.items():
        if f"`{slot}`" not in documented:
            errors.append(f"Slot {slot} ({rel}) is not listed in docs/CONTENT-SLOTS.md")

    if errors:
        print(f"FAILED: {len(errors)} problem(s) in site/")
        for error in errors:
            print(f"  - {error}")
        sys.exit(1)
    print(json.dumps({
        "passed": True,
        "public_files": len(files),
        "public_bytes": sum(p.stat().st_size for p in files),
        "html_pages": sum(p.suffix == ".html" for p in files),
        "pdfs": sum(p.suffix == ".pdf" for p in files),
        "library_entries": entries,
        "content_slots": len(slots),
        "energy_potential_tribes": tribes,
        "funding_programs": programs,
        "policy_searches": searches,
        "policy_follow_items": follows,
        "claims": len(claims),
        "plates": plates,
        "plate_blocks": plate_blocks,
    }))


if __name__ == "__main__":
    main()
