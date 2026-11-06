"""Release-boundary checks for the public site/ folder (see DATA-TIERS.md).

GitHub Pages publishes site/ and nothing else, so everything in it must be T0.
This script checks, and exits non-zero on any problem:

- only allowed public file types (by suffix in any case), and no private working folders;
- no local file paths (drive letters, Git Bash, network shares, home and mount folders, %VARIABLE%),
  local server addresses, credential-like strings, T1 locations (planning-T1, files-unsorted),
  Google Docs or Drive links, @atnitribes.org addresses, or email links in any public file,
  including PDF text and metadata;
- every JSON file that names a top-level tier names T0;
- no em dashes in published prose (house style);
- no external scripts, stylesheets, fonts, or frames (no CDNs or trackers): src, srcset, poster,
  data, and form action on the tags that load, url() and @import in inline styles and SVGs, no
  javascript: link, and in scripts, inline or in a file, no address outside this site and no beacon,
  socket, event stream, or XMLHttpRequest;
- every local link and in-page anchor in the HTML resolves inside site/;
- data/library.json follows the documented schema (docs/LIBRARY.md): required
  fields and types, enums, real dates, every entry T0, unique ids, https or
  existing local urls (local PDFs under library/);
- PDFs open, have pages, and carry no local paths or addresses, in their text, metadata, or links;
- content slot markers are balanced, unique, and listed in docs/CONTENT-SLOTS.md;
- the data products are light-checked: data/energy-potential.json (T0, known types, stages and
  checks, cited https links that end in #page=N), data/energy-funding.json (T0, no key or string
  that names a heat screen and no heat section, program statuses and dated status checks, https
  links), data/policy-watch.json and the Policy Sentinel follow files (required fields, https links);
- shipped claims (data/claims/) each have a unique id, an https source, a quote, a status of verified
  or partly, and no email; every plate data block in a page names claims that ship, holds only their
  numbers (or a model's, or a formula's over those), and states the limit of a partly claim; every plate
  definition (data/plates/) is T0 and built; a figure poured into a page (data-pour) names a claim that ships;
  a claim reference in prose (.cr) passes scripts/pour_claim_refs.py, whose figure rule lists rather than fails while in report mode;
- a bound word in prose (floor, lower or upper bound, at least, at most) about a marked figure states a bound its claim's quote or
  derived text states the same way (see BOUND_WORDS; listed rather than failed while REFUSE_BOUND_WORDS is False);
- a claim whose source.published is a day (YYYY-MM-DD) carries source.date_words, the words the source prints for that day: without
  them a claim id that existed at N10 (DATE_WORDS_BASELINE) is a warning, and any later id fails.

Standard library plus PyMuPDF (imported as fitz, only when PDFs are read, so scripts/build_plates.py can
reuse these rules with the standard library alone). Run: python scripts/validate_public.py
"""
from bisect import bisect_right
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

LOCAL_PATH = re.compile(
    r"(?i)(?<![a-z0-9])[a-z]:[\\/]|file:/|[\\/]Users[\\/]|AppData[\\/]"
    r"|(?<![\w.:/~-])/[a-z]/(?:dev\b|users\b|[\w.-]+/)"  # Git Bash: /c/dev, /c/Users, /i/claude-temp/
    r"|(?<![\w\\])\\{2,}[\w.$-]{2,}\\+[\w.$-]{2,}"  # a network share, \\host\share
    r"|(?<![\w~])~[\\/]|(?<![\w.-])/home/|(?<![\w.-])/mnt/[a-z]/|%[a-z_]\w*%[\\/]"  # a home folder, a WSL mount, a Windows variable
)
HTTPS_URL = re.compile(r"https://[^\s\"'<>]+")  # a web address may hold /users/ in its own path
HTTPS_PATH = re.compile(r"(https://[^/\s\"'<>]*)[^\s\"'<>]*")  # a public page may name localhost in its own path, never in its host
LOCAL_HOST = re.compile(r"(?i)\b(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0)\b|\[::1\]")  # a link made while a page was served from this machine
EMAIL = re.compile(r"[\w.%+-]+@[\w-]+\.[A-Za-z]{2,}")
SECRET = re.compile(
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}"
    r"|(?<![\w-])sk-(?:ant-|proj-)?[A-Za-z0-9][A-Za-z0-9_-]{30,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|xox[abposr]-[A-Za-z0-9-]{10,}"
)
FORBIDDEN = re.compile(r"(?i)planning-T1|files-unsorted|docs\.google\.com|drive\.google\.com|[a-z0-9._%+-]+@atnitribes\.org|mailto:")
EM_DASH = re.compile("\u2014| -- ")
EXTERNAL_LOAD_TAGS = {"script", "link", "img", "iframe", "source", "audio", "video", "embed", "object", "track", "form", "image", "use", "feimage"}  # a form sends, the rest fetch
LOAD_ATTRS = ("href", "src", "xlink:href", "poster", "data", "action")  # srcset is read apart: it lists several addresses
SEND_ATTRS = ("formaction", "ping")  # a button's own submit address, and a link's list of addresses told when it is followed: both send, so an outside one is held to the form rule
SRCSET_URL = re.compile(r"(?:^|,)\s*([^\s,]\S*)")  # each candidate's address; an address may hold a comma, its descriptor may not
JSON_TYPES = {"application/json", "application/ld+json"}  # data blocks, which a page's scripts read and nothing runs
OWN_ORIGIN = "https://atniclimate.github.io/atni-task-force/"
CSS_EXTERNAL = re.compile(r"(?i)@import|url\(\s*['\"]?(?:https?:)?//")
JS_EXTERNAL = re.compile(r"(?i)(?:\bfrom\s*|\bimport\s*\(\s*|\bfetch\s*\(\s*)['\"`](?:https?:)?//")
JS_ADDRESS = re.compile(r"(?i)(?:https?|wss?)://|//[a-z0-9-]+\.[a-z0-9-]")  # the second form is protocol-relative: it takes the page's scheme, so a host with a dot (a bare "//" is a separator)
JS_NETWORK = re.compile(r"\b(?:sendBeacon|WebSocket|EventSource|XMLHttpRequest)\b")
# Names that createElementNS and the like read; nothing fetches them.
XML_NAMESPACES = {"http://www.w3.org/2000/svg", "http://www.w3.org/1999/xhtml", "http://www.w3.org/1999/xlink", "http://www.w3.org/XML/1998/namespace", "http://www.w3.org/2000/xmlns/"}
JS_QUOTED = re.compile(r"""(["'])((?:\\.|(?!\1)[^\\\n])*)\1""")
JS_TEMPLATE = re.compile(r"(?:\\.|[^`\\$]|\$(?!\{))*", re.S)
JS_REGEX = re.compile(r"/(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n\[])+/[a-z]*")
JS_WORD = re.compile(r"[\w$]+")
JS_REGEX_AFTER = set("(,=:[!&|?{};+-*%<>~^") | {"return", "typeof", "case", "do", "else", "in", "of", "new", "delete", "void", "throw", "yield", "await", "instanceof"}
SLOT = re.compile(r"<!--\s*(/?)SLOT(?::([a-z0-9-]+):([a-z0-9-]+))?\s*-->")
PLATE_BLOCK = re.compile(r'<script type="application/json" id="plate-data-([^"]+)">(.*?)</script>', re.S)
POURED = re.compile(r'<[a-z][^<>]*\sdata-pour="([^"]+)"[^<>]*>')
CLAIM_STATUS = {"verified", "partly"}
LOCAL_PATH_FIX = ": replace it with a path relative to the page, or delete it"
CLAIM_ID = re.compile(r"\b[a-z]{2,3}-\d{3}\b")  # every claim id's shape; the scripts that find ids in text import this one

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
# Bound words: prose may call a marked figure a floor or a bound, or say "at least" or "at most" of it, only when that claim's quote or derived text states a bound
# the same way. A phrase is about the nearest .cr mark in its sentence, when BOUND_WINDOW words or fewer lie between them (a tie checks every mark that near).
BOUND_WORDS = re.compile(r"(?i)\b(?:(?P<lower>floor(?![\s-](?:space|area|plan))|lower[\s-]bounds?|at least)|(?P<upper>upper[\s-]bounds?|at most))\b")
SAYS_BOUND = {  # each direction's plain equivalents, as a source may write them
    "lower": re.compile(r"(?i)\b(?:floors?|lower[\s-]bounds?|lower limit|at least|no less than|not less than|minimum|or more|more than|greater than|in excess of)\b"),
    "upper": re.compile(r"(?i)\b(?:ceilings?|upper[\s-]bounds?|upper limit|at most|no more than|not more than|maximum|up to|or less|or fewer|less than|fewer than)\b"),
}
BOUND_WINDOW = 6
REFUSE_BOUND_WORDS = False  # False (N10 step 2a): list each bound word its claim does not state, and leave the exit code alone; True: each one fails
# The claim ids in the evidence files when source.date_words came in (N10, 11/06/2026), as prefix:first-last runs. A day-level source.published
# with no date_words is a warning for these ids and fails for any other.
DATE_WORDS_BASELINE = ("at:1-2 au:1-62 cp:1-528 dem:1-145 ec:1-62 ef:1-14,21-28,41-43 ep:1-18,21-33,41-42 ex:1-19 fin:1-111 fp:1-107,120-162 gf:1-65 jb:1-117 "
                       "lc:1-6,11-15,21-30,41-45,51-52,61-62,71 ld:1-26 lf:1-78 mv:1-5 pa:1-39 pdc:1-27,30-64 pe:1-8 pj:1-68 px:1-70 rs:1-80 ru:1-128 sf:1-63 sv:1-66 tr:1-72")


def self_test():
    """Guard the patterns against silent regressions."""
    assert LOCAL_PATH.search(r"C:\Users\someone\file.txt") and LOCAL_PATH.search("I:/climate/x") and LOCAL_PATH.search("file:///x")
    assert not LOCAL_PATH.search("https://atnitribes.org/contact-us/ T1: network")
    assert not LOCAL_PATH.search(HTTPS_URL.sub(" ", "https://agc.org/files/users/u1/a%20(4).pdf")) and LOCAL_PATH.search(HTTPS_URL.sub(" ", "https://x.org C:/Users/me"))
    assert all(LOCAL_PATH.search(p) for p in ("/c/dev/x", "/c/Users/me", "/i/claude-temp/x/", r"\\host\share", "~/x", "/home/me", "/mnt/c/x", r"%USERPROFILE%\x"))
    assert not any(LOCAL_PATH.search(p) for p in ("and/or", "Scope 1/2/3", "x.replace(/a/g, '')", "50%/50%", r'"\\d\\s"'))
    assert LOCAL_HOST.search("http://127.0.0.1:52127/data/x.json") and LOCAL_HOST.search("http://localhost/") and not LOCAL_HOST.search("https://atniclimate.github.io/atni-task-force/")
    assert HTTPS_PATH.sub(r"\1", "see https://localhost:8443/a and https://x.org/docs/localhost") == "see https://localhost:8443 and https://x.org"
    assert SRCSET_URL.findall("a.png 1x, data:image/png;base64,AA 2x,b.png") == ["a.png", "data:image/png;base64,AA", "b.png"]
    literals, code = js_scan("// see 'https://a.org'\nx = /[\"']/g.test(s) / 2 + 'b' + `c${ {d: `e`}.d }f`; /* g */ h")
    assert literals == ["b", "c", "e", "f"] and "https" not in code and " h" in code, (literals, code)
    assert CLAIM_ID.findall("dem-001 pdc-059 a-1 abcd-001 fp-1411") == ["dem-001", "pdc-059"]
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
    assert [m.lastgroup for m in BOUND_WORDS.finditer("a floor, at least, an upper bound, the floor space, floors")] == ["lower", "lower", "upper"]
    assert baseline_ids("fp:1-2,5") == {"fp-001", "fp-002", "fp-005"}


class Page(HTMLParser):
    """A page's ids, every address it links or loads, and the bodies of its inline styles and scripts (not its JSON data blocks)."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids, self.refs, self.styles, self.scripts, self.inline = set(), [], [], [], None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get("id"):
            self.ids.add(attrs["id"])
        if attrs.get("style"):
            self.styles.append(attrs["style"])
        if tag in ("script", "style") and (attrs.get("type") or "").lower() not in JSON_TYPES:
            self.inline = (tag, [])
        if tag == "link" and attrs.get("rel") == "canonical" and (attrs.get("href") or "").startswith(OWN_ORIGIN):
            return  # it names this page's public address and loads nothing; scripts/add_page_meta.py writes it
        for key in LOAD_ATTRS:
            if attrs.get(key):
                self.refs.append((tag, attrs[key]))
        self.refs += [(tag, url.rstrip(",")) for url in SRCSET_URL.findall(attrs.get("srcset") or "")]
        self.refs += [(f"{tag} {key}", url) for key in SEND_ATTRS for url in (attrs.get(key) or "").split()]

    def handle_data(self, data):
        if self.inline:
            self.inline[1].append(data)

    def handle_endtag(self, tag):
        if self.inline and tag == self.inline[0]:
            (self.styles if tag == "style" else self.scripts).append("".join(self.inline[1]))
            self.inline = None


def parse(path, cache={}):
    if path not in cache:
        page = Page()
        page.feed(path.read_text(encoding="utf-8"))
        cache[path] = page
    return cache[path]


VERBATIM_KEYS = {"excerpt", "title", "quote", "date_words"}  # quoted source text and titles of external works keep their own dashes


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
    host = LOCAL_HOST.search(HTTPS_PATH.sub(r"\1", body))
    if host:
        errors.append(f"Local address in {rel}: {host[0]}: link the public site or a path relative to the page; a page or PDF saved from a local server is saved again from the public site")
    if SECRET.search(body):
        errors.append(f"Credential-like content in {rel}: delete it from the file, then rotate that credential")
    for match in sorted(set(m.group(0) for m in FORBIDDEN.finditer(body))):
        errors.append(f"Forbidden string in {rel}: {match}: delete it; T1 locations, Google Docs or Drive links, private addresses and email links never go in site/")


def js_scan(src):
    """(the text of every string and template literal in a script, the script with its comments blanked). A slash after an operator or a keyword
    opens a regular expression and after a value divides, as most tools read it. shortcut: no full parser, so an odd line can misread; replace
    this with one if a flag ever proves false."""
    literals, kept, i, last, opened, depth = [], [], 0, "(", [], 0  # opened: the brace depth at each template's ${, so its } resumes the template
    while i < len(src):
        c, start = src[i], i
        if src.startswith(("//", "/*"), i):
            end = src.find("\n" if src[i + 1] == "/" else "*/", i + 2)
            i = len(src) if end < 0 else end + (1 if src[i + 1] == "/" else 2)
            kept.append(" ")
            continue
        if c in "'\"":
            match = JS_QUOTED.match(src, i)
            if match:
                literals.append(match[2])
            i, last = (match.end() if match else i + 1), "0"
        elif c == "`" or (c == "}" and opened and opened[-1] == depth):
            if c == "}":
                opened.pop()
            match = JS_TEMPLATE.match(src, i + 1)
            literals.append(match[0])
            i, last = match.end(), "0"
            if src.startswith("${", i):
                opened.append(depth)
                i, last = i + 2, "("
            else:
                i += 1
        elif c == "/" and last in JS_REGEX_AFTER and (match := JS_REGEX.match(src, i)):
            i, last = match.end(), "0"
        elif match := JS_WORD.match(src, i):
            i, last = match.end(), match[0]
        else:
            depth += (c == "{") - (c == "}")
            i, last = i + 1, (last if c.isspace() else c)
        kept.append(src[start:i])
    return literals, "".join(kept)


def check_js(rel, body, errors):
    """A script loads and sends nothing outside the site: no import or fetch from elsewhere, no address but the site's own, no beacon or socket."""
    if JS_EXTERNAL.search(body):
        errors.append(f"External script or fetch in {rel}: copy the code or data into site/ and load it from there; the site fetches nothing outside itself")
    literals, code = js_scan(body)
    for text in sorted({t.strip() for t in literals}):
        if JS_ADDRESS.match(text) and not text.startswith(OWN_ORIGIN) and text not in XML_NAMESPACES:
            errors.append(f"External address in {rel}: {text[:80]}: copy what it names into site/ and use a relative path; a link a reader follows belongs in the page's HTML or a data file")
    for name in sorted(set(JS_NETWORK.findall(code))):
        errors.append(f"Network call in {rel}: {name}: the site sends nothing and keeps no connection; read its own files with fetch and a relative path")


def check_html(path, rel, errors):
    """Links and loads of an HTML page, or of an SVG, which can load and run as a page does."""
    page = parse(path)
    for tag, url in page.refs:
        parts = urlsplit(url)
        if parts.scheme in {"http", "https"} or url.startswith("//"):
            if tag in EXTERNAL_LOAD_TAGS or tag.endswith(tuple(f" {a}" for a in SEND_ATTRS)):
                errors.append(f"External resource load in {rel}: <{tag}> {url}: copy the file into site/assets/ and load it from there, or delete the tag")
            elif parts.scheme == "http":
                errors.append(f"Insecure http link in {rel}: {url}: change it to https, or delete the link if the source has no https page")
            continue
        if parts.scheme == "javascript":
            errors.append(f"Script address in {rel}: <{tag}> {url[:60]}: give the element a handler in site/assets/js/; a javascript: address runs code from the markup")
            continue
        if parts.scheme:  # data: and similar inline values load nothing
            continue
        target = path if not parts.path else (path.parent / unquote(parts.path)).resolve()
        if target.is_dir():
            target = target / "index.html"
        if not target.is_relative_to(SITE.resolve()) or not target.is_file():
            errors.append(f"Broken or escaping local link in {rel}: {url}: point it at a file inside site/, relative to this page")
            continue
        if parts.fragment and target.suffix.lower() == ".html" and parts.fragment not in parse(target).ids:
            errors.append(f"Missing anchor in {rel}: {url}: add id=\"{parts.fragment}\" to the target, or correct the link")
    for style in page.styles:
        if CSS_EXTERNAL.search(style):
            errors.append(f"External stylesheet or font in an inline style in {rel}: copy the file into site/assets/ and load it from there")
    for script in page.scripts:
        check_js(f"an inline script in {rel}", script, errors)


def check_slots(path, rel, body, seen, errors):
    page_key = "home" if path.parent == SITE else path.parent.relative_to(SITE).parts[0]
    open_slot = None
    for closing, key, slot_id in SLOT.findall(body):
        if closing:
            if not open_slot:
                errors.append(f"Unmatched <!-- /SLOT --> in {rel}: add its <!-- SLOT:page:id --> before it, or delete it")
            open_slot = None
            continue
        if not key:
            errors.append(f"Slot marker without page and id in {rel}: write it as <!-- SLOT:page:id -->")
            continue
        if open_slot:
            errors.append(f"Nested slot {key}:{slot_id} inside {open_slot} in {rel}: close {open_slot} with <!-- /SLOT --> first")
        open_slot = f"{key}:{slot_id}"
        if key != page_key:
            errors.append(f"Slot {open_slot} in {rel} should start with '{page_key}:': rename it {page_key}:{slot_id} here and in docs/CONTENT-SLOTS.md")
        if open_slot in seen:
            errors.append(f"Duplicate slot id {open_slot} ({rel} and {seen[open_slot]}): give one a new id and list it in docs/CONTENT-SLOTS.md")
        seen[open_slot] = rel
    if open_slot:
        errors.append(f"Slot {open_slot} in {rel} is never closed: add <!-- /SLOT --> after its content")


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
        errors.append(f"{rel} is missing or not valid JSON: {error}: repair the file, or regenerate it with its script (see the data products table in CLAUDE.md)")
        return 0
    if not isinstance(data, dict) or set(data) != {"schema", "updated", "entries"}:
        errors.append(f"{rel} must hold exactly schema, updated, and entries: remove other keys and add any missing, or rerun scripts/merge_library.py")
        return 0
    if data["schema"] != 1:
        errors.append(f"{rel}: schema must be 1: set \"schema\": 1, or rerun scripts/merge_library.py")
    updated = data["updated"]
    if not (isinstance(updated, str) and DAY.fullmatch(updated) and real_date(updated)):
        errors.append(f"{rel}: updated must be a real YYYY-MM-DD date: correct the updated field")
        updated = None
    entries = data["entries"]
    if not isinstance(entries, list) or not entries:
        errors.append(f"{rel}: entries must be a non-empty list: restore the entries from git, or rerun scripts/merge_library.py")
        return 0
    ids = set()
    for n, entry in enumerate(entries):
        where = f"{rel} entry {n}"
        if not isinstance(entry, dict):
            errors.append(f"{where}: not an object: replace it with an entry that has the fields in docs/LIBRARY.md")
            continue
        where = f"{rel} entry '{entry.get('id', n)}'"
        missing, extra = set(FIELDS) - set(entry), set(entry) - set(FIELDS) - set(OPTIONAL)
        if missing or extra:
            errors.append(f"{where}: missing {sorted(missing)} unknown {sorted(extra)}: add the missing fields and delete the unknown ones (docs/LIBRARY.md)")
            continue
        for key, allowed in OPTIONAL.items():
            if key in entry and entry[key] not in allowed:
                errors.append(f"{where}: {key} must be one of {sorted(allowed)}: set one of those, or delete the field")
        bad = [k for k, kind in FIELDS.items() if not isinstance(entry[k], kind) or (kind is str and not entry[k].strip())]
        if bad:
            errors.append(f"{where}: wrong type or empty value for {bad}: fill in those fields with the types in docs/LIBRARY.md")
            continue
        if not SLUG.fullmatch(entry["id"]):
            errors.append(f"{where}: id must be a kebab-case slug: rename it with lowercase words joined by hyphens")
        if entry["id"] in ids:
            errors.append(f"{where}: duplicate id: give this entry a new id, or merge it with the other")
        ids.add(entry["id"])
        if entry["tier"] != "T0":
            errors.append(f"{where}: tier must be T0; only T0 material is published: remove this entry from the public file")
        if entry["type"] not in TYPES:
            errors.append(f"{where}: unknown type {entry['type']!r}: use one of {sorted(TYPES)}")
        areas = entry["areas"]
        if not areas or len(set(areas)) != len(areas) or not set(areas) <= AREAS:
            errors.append(f"{where}: areas must be a non-empty list of distinct values from {sorted(AREAS)}: correct the areas field")
        if not (YEAR_OR_DAY.fullmatch(entry["date"]) and real_date(entry["date"])):
            errors.append(f"{where}: date must be YYYY or a real YYYY-MM-DD: correct the date field")
        if not (DAY.fullmatch(entry["added"]) and real_date(entry["added"])):
            errors.append(f"{where}: added must be a real YYYY-MM-DD date: correct the added field")
        elif updated and entry["added"] > updated:
            errors.append(f"{where}: added is later than the file's updated date: correct added, or move updated forward")
        url = entry["url"]
        parts = urlsplit(url)
        if parts.scheme == "https":
            if not parts.netloc:
                errors.append(f"{where}: url has no host: write a whole https address")
        elif parts.scheme or url.startswith(("/", "//")) or "\\" in url or ".." in url.split("/"):
            errors.append(f"{where}: url must be https:// or a relative path inside site/: rewrite the url")
        elif not (SITE / unquote(parts.path)).is_file():
            errors.append(f"{where}: local file not found: {url}: add the file under site/, or correct the url")
        elif url.lower().endswith(".pdf") and not url.startswith("library/"):
            errors.append(f"{where}: local PDFs belong under library/: move the file to site/library/ and update the url")
    return len(entries)


def check_pdf(path, rel, errors):
    import fitz

    try:
        with fitz.open(path) as pdf:
            if pdf.page_count == 0 or path.stat().st_size == 0:
                errors.append(f"Empty PDF: {rel}: replace it with the real file, or delete it")
                return
            text = "\n".join(page.get_text() for page in pdf)
            meta = " ".join(str(v) for v in (pdf.metadata or {}).values() if v) + " " + (pdf.get_xml_metadata() or "")
            links = {str(link.get("uri") or link.get("file") or "") for page in pdf for link in page.get_links()}
    except Exception as error:  # a PDF that will not open must not ship
        errors.append(f"Unreadable PDF {rel}: {error}: replace it with a copy that opens, or delete it")
        return
    check_text(f"PDF text of {rel}", text, errors)  # its local-address rule covers the text; the links are read below
    if LOCAL_PATH.search(meta):
        errors.append(f"Local path in PDF metadata: {rel}: strip the metadata and save the PDF again")
    for link in sorted(links):  # a PDF printed from a page served on this machine links back to this machine
        if LOCAL_HOST.search(link) or LOCAL_PATH.search(HTTPS_URL.sub(" ", link)):
            errors.append(f"Local address in a PDF link: {rel}: {link}: print the PDF again with its links resolved against the public site")


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
        errors.append(f"{rel} is missing or not valid JSON: {error}: repair the file, or regenerate it with its script (see the data products table in CLAUDE.md)")
        return None


def need(record, keys, where, errors):
    """Each key holds a non-empty string."""
    bad = [k for k in keys if not isinstance(record.get(k), str) or not record[k].strip()]
    if bad:
        errors.append(f"{where}: missing or empty {bad}: fill in those fields")


def check_header(data, rel, errors):
    if data.get("tier") != "T0" or data.get("schema") != 1:
        errors.append(f"{rel}: tier must be T0 and schema 1: set both at the top of the file, and move anything that is not T0 out of site/")


def keys_named(data, pattern):
    """Every key anywhere in the data that matches the pattern (strings_and_keys yields a key as its own path's last part)."""
    return sorted({text for path, text in strings_and_keys(data) if re.split(r"[.\[]", path)[-1] == text and pattern.search(text)})


def check_climate_regions(errors):
    """County projections: whole counties by FIPS, no cell coordinates or Nation ids, no heat screen, and NASA's terms carried with the file."""
    rel = "data/climate-regions.json"
    data = load_data(rel, errors)
    if data is None:
        return
    check_header(data, rel, errors)
    for r in data.get("regions") or []:
        if r.get("coverage") != 1.0 or not re.fullmatch(r"\d{5}", str(r.get("fips"))):
            errors.append(f"{rel}: region {r.get('fips')} needs a five-digit FIPS and coverage 1.0: a partly covered county goes to not_assessed; rerun scripts/climate_regions.py")
    for key in keys_named(data, re.compile(r"(?i)^(?:lat|lon|latitude|longitude|cells|nations|tribe\w*|epa_\w+)$")):
        errors.append(f"{rel}: holds the key {key}: no cell coordinates and no Nation id leave the pull; remove it in scripts/climate_regions.py and rerun")
    for path, text in strings_and_keys(data):
        if HEAT_SCREEN.search(text) or re.search(r"epa_1000\d{5}", text):
            errors.append(f"{rel}: {path} names a heat screen or a Nation id: remove it; both stay T1")
    if "CC BY-SA 4.0" not in str(data.get("license")):
        errors.append(f"{rel}: the license line must carry NASA's CC BY-SA 4.0 terms for the temperature figures (ruling 25): rerun scripts/climate_regions.py")


def check_projects(errors):
    """Named proposals: land as each filing states it, no owner-of-record or private-party field, https sources, and no parcel geometry yet."""
    rel = "data/projects.json"
    data = load_data(rel, errors)
    if data is None:
        return
    check_header(data, rel, errors)
    for key in keys_named(data, re.compile(r"(?i)owner_name|owner$|mailing|situs|assessed|sale_price|legal_desc|normalized_owner|owner_cluster|private_party|^owner_review$")):
        errors.append(f"{rel}: holds the key {key}: no owner-of-record, assessor, or private-party field is published; drop it in the N6 recheck and copy the file again")
    ids = [p.get("id") for p in data.get("projects") or []]
    if len(ids) != len(set(ids)):
        errors.append(f"{rel}: record ids repeat: each record needs its own id")
    for p in data.get("projects") or []:
        where = f"{rel} record {p.get('id')}"
        if (p.get("land") or {}).get("class") not in (data.get("land_classes") or {}):
            errors.append(f"{where}: land class must be one of land_classes: use the filing's own class")
        if (p.get("land") or {}).get("geometry") is not None:
            errors.append(f"{where}: geometry must stay null until a parcel file and the owner's decision exist")
        if any(not re.fullmatch(r"\d{5}", str(c.get("fips"))) for c in p.get("counties") or []):
            errors.append(f"{where}: county FIPS must be five digits")
        for s in p.get("sources") or []:
            if not https(s.get("url")) or not s.get("quote"):
                errors.append(f"{where}: every source needs an https url and the quote it rests on")


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
        errors.append(f"{rel}: method.energy_types, method.stages, and tribes are required: rerun scripts/energy_potential.py")
        return 0
    for tribe in tribes:
        where = f"{rel} tribe '{tribe.get('slug', '?')}'"
        need(tribe, ("name", "slug"), where, errors)
        findings = tribe.get("top")
        if not isinstance(findings, list):
            errors.append(f"{where}: top must be a list: rerun scripts/energy_potential.py")
            continue
        if not findings and not str(tribe.get("note") or "").strip():
            errors.append(f"{where}: a Tribe with no finding must say why in note: write the reason in that Tribe's note field")
        for f in findings:
            fw = f"{where} {f.get('type', '?')}"
            if f.get("type") not in types or f.get("stage_label") not in stages or f.get("status") not in CHECKS:
                errors.append(f"{fw}: unknown type, stage_label, or status: use the values listed in method, and a status from {sorted(CHECKS)}")
            cites = f.get("citations")
            if not isinstance(cites, list) or not cites:
                errors.append(f"{fw}: needs at least one citation: add one with title, excerpt, url, and page, or drop the finding")
                continue
            for c in cites:
                if not (https(c.get("url")) and c["url"].endswith(f"#page={c.get('page')}")):
                    errors.append(f"{fw}: citation link must be https and end in #page=<page>: correct the citation url to match its page")
                need(c, ("title", "excerpt"), fw, errors)
    return len(tribes)


def check_funding_heat(data, rel, errors):
    """The heat screen is T1 until the owner releases it: no heat section, and no key or string naming one."""
    if isinstance(data, dict) and "heat" in data:
        errors.append(f"{rel}: holds a heat section; the heat screen stays T1 until the owner releases it: remove the section and rerun scripts/energy_funding.py")
    for path, text in strings_and_keys(data):
        if HEAT_SCREEN.search(text):
            errors.append(f"{rel}: {path} names a heat screen: remove that name; the heat screen stays T1 until the owner releases it")


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
        errors.append(f"{rel}: vocabulary.statuses and a non-empty programs list are required: rerun scripts/energy_funding.py")
        return 0
    for p in programs:
        where = f"{rel} program '{p.get('id', '?')}'"
        need(p, ("id", "short_name", "name", "agency", "status_label"), where, errors)
        if p.get("status") not in statuses:
            errors.append(f"{where}: status must be one of {sorted(statuses)}: set one of those on this program")
        checked = p.get("status_checked") or {}
        if not (iso_day(checked.get("date")) and https(checked.get("url"))):
            errors.append(f"{where}: status_checked needs a real date and an https page: recheck the status and record both")
        if p.get("deadline") is not None and not iso_day((p["deadline"] or {}).get("date")):
            errors.append(f"{where}: deadline.date must be a real YYYY-MM-DD date: correct it, or set deadline to null")
        if not https(p.get("url")) or not all(https(u) for u in p.get("sources") or []):
            errors.append(f"{where}: url and sources must be https: replace each with an https address")
    live = data.get("live") or {}
    if not isinstance(live.get("retrieved"), str) or not all(https(o.get("url")) for o in live.get("opportunities") or []):
        errors.append(f"{rel}: live needs a retrieval time and https opportunity links: rerun scripts/energy_funding.py")
    if not isinstance(data.get("tribes"), list):
        errors.append(f"{rel}: tribes must be a list: rerun scripts/energy_funding.py")
    return len(programs)


def check_follow_file(rel, errors):
    data = load_data(rel, errors)
    if not (isinstance(data, dict) and data.get("version") == 1 and isinstance(data.get("followed"), list) and data["followed"]):
        errors.append(f"{rel}: must be Policy Sentinel's export format (version 1) with a non-empty followed list: rerun scripts/policy_watch.py")
        return
    for item in data["followed"]:
        where = f"{rel} '{item.get('id', '?')}'"
        need(item, ("id", "sourceId", "kind", "value"), where, errors)
        if not https((item.get("record") or {}).get("officialUrl")):
            errors.append(f"{where}: record.officialUrl must be https: replace it with the official https page")


def check_policy_watch(errors):
    rel = "data/policy-watch.json"
    data = load_data(rel, errors)
    if not isinstance(data, dict):
        return 0, 0
    check_header(data, rel, errors)
    if not https((data.get("policy_sentinel") or {}).get("url")):
        errors.append(f"{rel}: policy_sentinel.url must be https: correct that url")
    forces = data.get("task_forces")
    if not isinstance(forces, dict) or not forces:
        errors.append(f"{rel}: task_forces is required: rerun scripts/policy_watch.py")
        return 0, 0
    searches = follows = 0
    for force_id, force in forces.items():
        where = f"{rel} {force_id}"
        if not force.get("searches"):
            errors.append(f"{where}: needs searches: add at least one saved search, then rerun scripts/policy_watch.py")
        for s in force.get("searches") or []:
            sw = f"{where} search '{s.get('id', '?')}'"
            need(s, ("id", "title", "why", "source", "query"), sw, errors)
            if not (https(s.get("official_url")) and https(s.get("policy_sentinel_url"))):
                errors.append(f"{sw}: official_url and policy_sentinel_url must be https: rerun scripts/policy_watch.py")
            if not iso_day((s.get("checked") or {}).get("date")):
                errors.append(f"{sw}: checked.date must be a real YYYY-MM-DD date: rerun scripts/policy_watch.py")
            searches += 1
        for f in force.get("follow") or []:
            fw = f"{where} follow '{f.get('identifier') or f.get('title', '?')}'"
            need(f, ("kind", "title", "reason"), fw, errors)
            if not https(f.get("url")):
                errors.append(f"{fw}: url must be https: replace it with the official https page")
            follows += 1
        file = force.get("follow_file")
        if not (isinstance(file, str) and file.startswith("data/policy-sentinel/") and (SITE / file).is_file()):
            errors.append(f"{where}: follow_file must name a file in data/policy-sentinel/: rerun scripts/policy_watch.py, or correct the name")
    for path in sorted((SITE / "data" / "policy-sentinel").glob("*.json")):
        check_follow_file(path.relative_to(SITE).as_posix(), errors)
    return searches, follows


def check_claim_file(data, rel, claims, errors):
    """One shipped claims file. Adds each claim to the claims dict by id, so ids stay unique across files."""
    check_header(data, rel, errors)
    if not isinstance(data.get("claims"), list) or not data["claims"]:
        errors.append(f"{rel}: claims must be a non-empty list: rerun python scripts/build_plates.py --export-claims, or delete the file")
        return
    for claim in data["claims"]:
        claim_id = claim.get("id")
        where = f"{rel} claim '{claim_id or '?'}'"
        if not isinstance(claim_id, str) or not claim_id.strip():
            errors.append(f"{where}: needs an id: give the claim a unique id in its evidence file and export again")
            continue
        if claim_id in claims:
            errors.append(f"{where}: duplicate id: give this entry a new id, or merge it with the other")
        claims[claim_id] = claim
        if not https((claim.get("source") or {}).get("url")):
            errors.append(f"{where}: source.url must be https: replace it with the https page the quote came from, in the evidence file, and export again")
        need(claim, ("quote",), where, errors)
        if claim.get("status") not in CLAIM_STATUS:
            errors.append(f"{where}: status must be one of {sorted(CLAIM_STATUS)}: verify the claim against its source in the evidence file, or remove it from site/data/claims/ by exporting again")
        if EMAIL.search(json.dumps(claim, ensure_ascii=False)):
            errors.append(f"{where}: holds an email address: remove the address from the evidence file and export again")


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


def baseline_ids(runs=DATE_WORDS_BASELINE):
    """The claim ids a prefix:first-last list names ("fp:1-2,5" is fp-001, fp-002, fp-005)."""
    ids = set()
    for group in runs.split():
        prefix, spans = group.split(":")
        for span in spans.split(","):
            first, _, last = span.partition("-")
            ids.update(f"{prefix}-{n:03d}" for n in range(int(first), int(last or first) + 1))
    return ids


def check_date_words(claims, errors):
    """A source.published that names a day comes with source.date_words, the words the source prints for that day. Reads the shipped claims, which
    carry each evidence record's source whole, so a clean clone with no work/ runs it too. Returns the baseline ids that lack it (warnings)."""
    old, missing = baseline_ids(), []
    for claim_id, claim in sorted(claims.items()):
        source = claim.get("source") or {}
        if not iso_day(source.get("published")) or str(source.get("date_words") or "").strip():
            continue
        if claim_id in old:
            missing.append(claim_id)
        else:
            errors.append(f"claim {claim_id}: source.published {source['published']} names a day and source.date_words is missing: quote the words the source prints "
                          f"for that day as date_words in its evidence record and export again, or write only the month or year the source states")
    return missing


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
                errors.append(f"{where}: input {name} names unknown claim {source['claim']!r}: add that claim to the evidence file and export it, or name a claim that ships; then rebuild the page")
            elif env.get(name) not in numbers_in(claim):
                errors.append(f"{where}: input {name} holds a number claim {source['claim']} does not; rebuild the page with scripts/build_plates.py, since the block was edited or the claim changed")
        else:
            try:
                expected = numeric_tree(lookup(load_model(source["file"]) or {}, source["model"]))
            except (KeyError, TypeError):
                expected = None
            if expected is None or expected != env.get(name):
                errors.append(f"{where}: input {name} does not match model {source.get('file')}; rebuild the page with scripts/build_plates.py")


def check_plate_row(where, row, data, claims, errors):
    name = f"{where}: row '{row.get('key', '?')}'"
    cited = [c for c in [row.get("claim"), *(row.get("cites") or [])] if c]
    unknown = [c for c in cited if c not in claims]
    computed, words = row.get("f") is not None, row.get("words") is True
    if unknown or not (cited or computed or words):
        errors.append(f"{name} names unknown claim {(unknown or [row.get('claim')])[0]!r}: give the row a claim that ships in site/data/plates/, or add the claim to the evidence file and export it")
        return
    if computed or words:
        if words and any(row.get(k) is not None for k in ("value", "low", "high")):
            errors.append(f"{name} is words but holds a number; rebuild the page with scripts/build_plates.py, and give the row a claim if it should state a figure")
    else:
        numbers = {n for c in cited for n in numbers_in(claims[c])}
        numbers |= {-n for n in numbers} if row.get("negated") else set()
        if row.get("converted"):  # the arithmetic is the claim's derived text; the row states its factor
            numbers = {round(n * row["converted"], 6) for n in numbers}
            holds = lambda v: round(v, 6) in numbers
        else:
            holds = lambda v: v in numbers
        if any(row.get(k) is not None and not holds(row[k]) for k in ("value", "low", "high")) or any(not holds(v) for _, v in row.get("spark") or []):
            errors.append(f"{name} holds a number claim {cited[0]} does not; rebuild the page with scripts/build_plates.py and never type a number in a block")
    if row.get("claim") and claims[row["claim"]].get("status") == "partly" and not str(row.get("limit") or "").strip():
        errors.append(f"{name} uses a partly verified claim without its limit: add limit, one public sentence, to the row or to claim {row['claim']}, then rebuild the page")
    for claim_id in row.get("cites") or []:
        if claims[claim_id].get("status") == "partly" and not str(((data.get("receipts") or {}).get(claim_id) or {}).get("limit") or "").strip():
            errors.append(f"{name} cites partly verified claim {claim_id} without its limit: add {claim_id} to the plate's limits with one public sentence, then rebuild the page")


def check_plate_blocks(rel, body, claims, errors):
    """A page's plate data names claims that ship, and holds only their numbers. Returns the block count."""
    blocks = PLATE_BLOCK.findall(body)
    for plate_id, text in blocks:
        where = f"{rel} plate '{plate_id}'"
        try:
            data = json.loads(text)
        except json.JSONDecodeError as error:
            errors.append(f"{where}: data block is not valid JSON: {error}: rebuild the page with scripts/build_plates.py; never edit between the plate markers")
            continue
        check_plate_inputs(where, data, claims, errors)
        for row in data.get("rows") or []:
            check_plate_row(where, row, data, claims, errors)
        for claim_id in data.get("receipts") or {}:
            if claim_id not in claims:
                errors.append(f"{where}: receipt names unknown claim {claim_id!r}: export that claim with scripts/build_plates.py --export-claims, or remove it from the plate, then rebuild the page")
    return len(blocks)


def check_plate_scripts(rel, body, errors):
    """The SVG marks load before the kit that uses them."""
    if PLATE_BLOCK.search(body) and not -1 < body.find("/plate-svg.js") < body.find("/plate.js"):
        errors.append(f"{rel}: a page with plates loads assets/js/plate-svg.js and then assets/js/plate.js: add both script tags, in that order")


def check_poured(rel, body, claims, errors):
    """A figure poured into a page's own text names a claim that ships, and a partly claim's limit is on the page."""
    for claim_id in sorted(set(POURED.findall(body))):
        claim = claims.get(claim_id)
        if claim is None:
            errors.append(f"{rel}: data-pour names unknown claim {claim_id!r}: name a claim that ships, or export this one with scripts/build_plates.py --export-claims")
        elif claim.get("status") == "partly" and f'data-pour="{claim_id}" data-field="limit"' not in body:
            errors.append(f"{rel}: data-pour {claim_id} is partly verified; its limit must be on the page: add <span data-pour=\"{claim_id}\" data-field=\"limit\"></span> near the figure, then rebuild the page")


def bound_words(body, claims):
    """Each bound word about a marked figure whose claim's quote and derived text state no bound that way. Reads the visible prose as scripts/number_audit.py
    does (plate, bench, and claim-list blocks are built from their own definitions and skipped)."""
    import number_audit as audit  # here, not at the top: it imports this module

    class Walker(audit.Walker):
        """The audit's walk, with each piece of text tagged with the .cr mark it sits in."""

        def handle_starttag(self, tag, attrs):
            super().handle_starttag(tag, attrs)
            if tag == "a" and "cr" in (dict(attrs).get("class") or "").split():
                self.stack[-1]["claim"] = dict(attrs).get("data-claim")

        def handle_data(self, data):
            count = len(self.pieces)
            super().handle_data(data)
            if len(self.pieces) > count:
                self.pieces[-1] += (next((entry for entry in reversed(self.stack) if "claim" in entry), None),)

    walker = Walker()
    walker.feed(body)
    walker.close()
    walker.flush()
    words = lambda text: len(re.findall(r"\w+", text))  # noqa: E731
    hits = []
    for pieces in walker.blocks:
        text, starts = audit.joined(pieces)
        marks = {}  # one mark: [start, end, claim id]
        for piece, start in zip(pieces, starts):
            if piece[-1]:
                span = marks.setdefault(id(piece[-1]), [start, start, piece[-1]["claim"]])
                span[1] = start + len(piece[0])
        if not marks:
            continue
        ends = [0, *(m.end() for m in audit.SENTENCE_END.finditer(text)), len(text)]
        for found in BOUND_WORDS.finditer(text):
            k = bisect_right(ends, found.start()) - 1
            gaps = {}
            for start, end, claim_id in marks.values():
                if ends[k] <= start < ends[k + 1]:
                    gap = words(text[found.end():start]) if start >= found.end() else words(text[end:found.start()])
                    gaps[claim_id] = min(gap, gaps.get(claim_id, gap))
            nearest = min(gaps.values(), default=BOUND_WINDOW + 1)
            direction = "lower" if found["lower"] else "upper"
            for claim_id in sorted(c for c, gap in gaps.items() if gap == nearest <= BOUND_WINDOW):
                claim = claims.get(claim_id)
                if claim is not None and not SAYS_BOUND[direction].search(f"{claim.get('quote') or ''} {claim.get('derived') or ''}"):
                    hits.append(f"{claim_id}: {found[0]!r} names a {direction} bound that the claim's quote and derived text do not state: drop the word, or cite a claim "
                                f"whose source states it: {' '.join(text[ends[k]:ends[k + 1]].split())}")
    return hits


def check_resource_model(claims, errors):
    """The Explorer's public model and page: the header, every claim id they name ships, and a partly verified one has its public limit."""
    rel = "data/resource-model.json"
    if not (SITE / rel).is_file():
        return
    data = load_data(rel, errors)
    if not isinstance(data, dict):
        return
    check_header(data, rel, errors)
    errors.extend(f"{rel}: missing {key}: rerun python scripts/resource_model.py --export" for key in ("inputs", "assumptions", "catalog", "architectures", "disclaimer", "limits") if not data.get(key))
    page = SITE / "explorer" / "index.html"
    body = page.read_text(encoding="utf-8") if page.is_file() else ""
    receipts = {m[1]: m[0] for m in re.finditer(r'<li id="src-([^"]+)".*?</li>', body, re.S)}
    named = set(CLAIM_ID.findall(json.dumps(data)))
    for claim_id in sorted(named | set(re.findall(r'href="#src-([a-z]+-\d{3})"', body))):
        claim = claims.get(claim_id)
        if claim is None:
            errors.append(f"{rel}: names claim {claim_id}, which does not ship: export it with scripts/build_plates.py --export-claims, or drop it from the model and rerun scripts/resource_model.py --export")
        elif claim_id not in named and claim_id not in receipts:
            errors.append(f"explorer/index.html: no receipt for {claim_id}: rerun python scripts/build_explorer.py")
        elif claim.get("status") == "partly" and not (claim.get("limit") or (data.get("limits") or {}).get(claim_id) or "Limit: " in receipts.get(claim_id, "")):
            errors.append(f"{rel}: partly verified claim {claim_id} has no public limit: add one public sentence for it in the model's limits, then rerun scripts/resource_model.py --export and scripts/build_explorer.py")


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
            errors.append(f"{rel}: not built into {data.get('page')}; add its plate markers to that page, then run scripts/build_plates.py")
    return len(paths)


def check_manifest(errors):
    """data/index.json, from scripts/build_index.py: every path it lists is there and T0, and it lists every plate. Returns the plates it lists."""
    rel = "data/index.json"
    data = load_data(rel, errors)
    if not isinstance(data, dict):
        return 0
    check_header(data, rel, errors)
    listed = {item.get("path") for part in ("plates", "claims", "data") for item in data.get(part) or []}
    for path in sorted(listed, key=str):
        if not (SITE / str(path)).is_file():
            errors.append(f"{rel} lists {path}, which is not in site/: rerun python scripts/build_index.py")
        elif str(path).endswith(".json") and path != "data/library.json":  # check_library holds that file's entries to T0 one by one
            body = load_data(path, errors)
            if not isinstance(body, dict) or body.get("tier") != "T0":
                errors.append(f"{rel} lists {path}, which does not say tier T0: set it there, or move the file out of site/")
    for path in sorted((SITE / "data" / "plates").glob("*.json")):
        if path.relative_to(SITE).as_posix() not in listed:
            errors.append(f"{rel} does not list {path.name}: rerun python scripts/build_index.py")
    return len(data.get("plates") or [])


def main():
    import fitz
    import pour_claim_refs

    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # a reported mark or sentence may hold a character the console's code page lacks
    self_test()
    fitz.TOOLS.mupdf_display_errors(False)
    errors, slots, figure_report, bound_report = [], {}, [], []
    claims = check_claims(errors)
    undated = check_date_words(claims, errors)
    plate_blocks = 0
    files = sorted(p for p in SITE.rglob("*") if p.is_file())
    for path in files:
        rel = path.relative_to(SITE).as_posix()
        suffix = path.suffix.lower()  # a server sends index.HTML as a page, so every rule reads it as one
        if path.name != ".nojekyll" and suffix not in ALLOWED:
            errors.append(f"Unexpected public file type: {rel}: convert it to an allowed type {sorted(ALLOWED)}, or move it out of site/")
        if PRIVATE_DIRS & set(path.relative_to(SITE).parts):
            errors.append(f"Private folder inside site/: {rel}: move it out of site/; nothing private is ever published")
        if suffix in TEXT:
            body = path.read_text(encoding="utf-8")
            check_text(rel, body, errors)
            if suffix in {".html", ".js"} and EM_DASH.search(body):
                errors.append(f"Em dash or spaced double hyphen in {rel} (house style): rewrite the sentence with a comma, colon, or period")
            if suffix == ".json":
                data = json.loads(body)
                if any(EM_DASH.search(s) for s in our_prose(data)):
                    errors.append(f"Em dash or spaced double hyphen in {rel} (house style): rewrite the sentence with a comma, colon, or period")
                if isinstance(data, dict) and "tier" in data and data["tier"] != "T0":
                    errors.append(f"{rel} says tier {data['tier']}: only T0 is published; move the file out of site/, or set T0 only if the owner released it")
            if suffix in {".css", ".svg"} and CSS_EXTERNAL.search(body):
                errors.append(f"External stylesheet or font in {rel}: copy the file into site/assets/ and load it from there")
            if suffix == ".js":
                check_js(rel, body, errors)
            if suffix == ".svg" and JS_EXTERNAL.search(body):
                errors.append(f"External script or fetch in {rel}: copy the code or data into site/ and load it from there; the site fetches nothing outside itself")
            if suffix in {".html", ".svg"}:
                check_html(path, rel, errors)
            if suffix == ".html":
                check_slots(path, rel, body, slots, errors)
                plate_blocks += check_plate_blocks(rel, body, claims, errors)
                check_plate_scripts(rel, body, errors)
                check_poured(rel, body, claims, errors)
                errors.extend(pour_claim_refs.check_page(rel, body, claims))
                figure_report += [f"{rel}: {problem}" for problem in pour_claim_refs.figure_report(body, claims)]
                (errors if REFUSE_BOUND_WORDS else bound_report).extend(f"{rel}: {hit}" for hit in bound_words(body, claims))
        elif suffix == ".pdf":
            check_pdf(path, rel, errors)
    if not (SITE / ".nojekyll").is_file():
        errors.append("site/.nojekyll is missing: create that empty file")
    if not (SITE / "index.html").is_file():
        errors.append("site/index.html is missing: restore it from git")
    entries = check_library(errors)
    tribes = check_energy_potential(errors)
    programs = check_energy_funding(errors)
    check_climate_regions(errors)
    check_projects(errors)
    searches, follows = check_policy_watch(errors)
    plates = check_plate_files(errors)
    check_manifest(errors)
    check_resource_model(claims, errors)
    documented =SLOTS_DOC.read_text(encoding="utf-8") if SLOTS_DOC.is_file() else ""
    for slot, rel in slots.items():
        if f"`{slot}`" not in documented:
            errors.append(f"Slot {slot} ({rel}) is not listed in docs/CONTENT-SLOTS.md: add a row for `{slot}` there")

    notes = [f"figure rule: {line}" for line in figure_report] + [f"bound word: {line}" for line in bound_report]
    if not pour_claim_refs.REFUSE_FIGURES:
        notes.append(f"figure rule, report mode: {len(figure_report)} marks print a figure their claim does not hold; they fail once pour_claim_refs.REFUSE_FIGURES is True")
    if not REFUSE_BOUND_WORDS:
        notes.append(f"bound words, report mode: {len(bound_report)} name a bound their claim does not state; they fail once REFUSE_BOUND_WORDS is True")
    if undated:
        notes.append(f"warning: {len(undated)} claims from before N10 have a day-level source.published and no source.date_words, the words the source prints for that day")
    for note in notes:
        print(note)
    if errors:
        print(f"FAILED: {len(errors)} problem(s) in site/")
        for error in errors:
            print(f"  - {error}{LOCAL_PATH_FIX if error.startswith('Local path in ') else ''}")
        sys.exit(1)
    print(json.dumps({
        "passed": True,
        "public_files": len(files),
        "public_bytes": sum(p.stat().st_size for p in files),
        "html_pages": sum(p.suffix.lower() == ".html" for p in files),
        "pdfs": sum(p.suffix.lower() == ".pdf" for p in files),
        "library_entries": entries,
        "content_slots": len(slots),
        "energy_potential_tribes": tribes,
        "funding_programs": programs,
        "policy_searches": searches,
        "policy_follow_items": follows,
        "claims": len(claims),
        "plates": plates,
        "plate_blocks": plate_blocks,
        "figure_report": len(figure_report),
        "bound_word_report": len(bound_report),
        "date_words_missing": len(undated),
    }))


if __name__ == "__main__":
    main()
