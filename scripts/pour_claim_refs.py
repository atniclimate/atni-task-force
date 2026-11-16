"""Claim references in prose: a number links to its receipt, with no JS, and a list holds every claim a page cites.

An author writes <a class="cr" data-claim="fp-141" href="#src-fp-141">3.1 Wh</a> (in either quote mark), and this script adds the status and the
accessible name to each mark, keeping any other attribute, and writes the list between the claims-cited markers, grouped by source document. A page
with a Sources page beside it (sources/index.html, owner ruling 39) keeps no list: its marks link to sources/#src-ID, and the list goes before that
page's </main>, under "Claims Cited in the Page's Text". Any other page lists them before its own </main>, unless every mark already lands on a receipt
on the page. An id that already has a receipt where the list goes (a src- anchor outside the block) keeps it as its one anchor, and its row carries no id.
A copy of another page's block (an element with data-copy-of, as scripts/build_home.py writes them) keeps its marks and terms as its own page poured
them, and is never listed or counted here; the prose tip carries its claims too.

It refuses, and writes nothing, if a mark names a claim that does not ship, is unverified, or is partly verified with no limit, or if
a mark holds no digits while its claim holds a number. A word mark stands only on a claim whose value, low, and high hold no number
(owner ruling 28, 11/06/2026); a claim with a figure is marked with its figure.

The figure rule: every figure in a mark is its claim's value, low, or high at the page's rounding, or is written in its quote, its derived
text, or its date (a date claim's value). Never its limit or boundary, which may name other figures. At the page's rounding means that
rounding the value to the figure's decimal places, half up as plate.js prints a tie, gives the figure, after dividing by the thousand,
million, billion, or trillion the mark prints: 0.6 may print as 1 and 1,456,000,000 as 1.5 billion, but 3.16 never prints as 3.1. A figure
in the quote or derived text counts only as written. While REFUSE_FIGURES is False the rule only reports: --check and
scripts/validate_public.py list each mark it fails and their exit codes ignore it. scripts/validate_public.py runs the same check through check_page.

Run after scripts/build_plates.py and scripts/build_explorer.py, since a mark inside a generated block is only as lasting as its generator:
  python scripts/pour_claim_refs.py                          every page
  python scripts/pour_claim_refs.py --page site/ai/index.html  one page, repeatable
  python scripts/pour_claim_refs.py --check                  report only; exit 1 on any problem or stale block
"""
import argparse
from decimal import ROUND_HALF_UP, Context, Decimal
from html import escape, unescape
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
STATUS = {"verified": "verified", "partly": "partly verified"}
# Scripts, styles, and comments are matched first so a mark quoted inside one is left alone.
MARK = re.compile(r"""<script\b.*?</script>|<style\b.*?</style>|<!--.*?-->|<a\b(?P<attrs>[^<>]*\sclass=(?P<q>["'])(?P<cls>(?:[^"'<>]*\s)?cr(?:\s[^"'<>]*)?)(?P=q)[^<>]*)>(?P<inner>.*?)</a>""", re.S)
ATTR = re.compile(r"""\s+([^\s"'<>/=]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?""")
POURED_ATTRS = {"class", "data-claim", "data-status", "href", "aria-label"}  # the pour writes these; any other attribute stays as the author wrote it
BLOCK = re.compile(r"[ \t]*<!-- claims-cited -->.*?<!-- /claims-cited -->\n?", re.S)
SRC_ANCHOR = re.compile(r'\sid="src-([^"]+)"')
NUMBER = re.compile(r"(?<![\w.,])(\d+(?:,\d{3})*(?:\.\d+)?)(?:\s*(thousand|million|billion|trillion)\b)?")  # a figure; a digit inside a name (CO2, H100) is not one
SCALE = {"thousand": 10**3, "million": 10**6, "billion": 10**9, "trillion": 10**12}
WIDE = Context(prec=60, rounding=ROUND_HALF_UP)  # room for any claim's digits at any printed precision
# The figure rule's mode. True since N10 step 4 (0 hits in 432 marks): refuse such a mark like any other problem. False reports only.
REFUSE_FIGURES = True
# A copy of another page's block: an element carrying data-copy-of (scripts/build_home.py marks the plates it copies). Its marks and terms were poured on the
# page it comes from, and its links already reach that page's Sources page, so this page leaves it as it is and never lists or counts it as its own.
COPY_OPEN = re.compile(r"<([a-z][a-z0-9-]*)\b[^<>]*\sdata-copy-of=[\"'][^<>]*>", re.I)


def copies(body):
    """Where each data-copy-of element runs, from its tag to its own closing tag; raises ValueError for one that never closes."""
    spans = []
    for match in COPY_OPEN.finditer(body):
        if spans and match.start() < spans[-1][1]:
            continue  # inside a copy already found
        depth = 0
        for tag in re.finditer(rf"<(/?){match[1]}\b[^<>]*>", body[match.start():], re.I):
            depth += -1 if tag[1] else 1
            if not depth:
                spans.append((match.start(), match.start() + tag.end()))
                break
        else:
            raise ValueError(f"a <{match[1]} data-copy-of> element never closes: close it, or rebuild the page that copies it")
    return spans


def without_copies(body):
    """The page's own part: its text with every copy cut out, for the checks that belong to the page a copy comes from."""
    cut = copies(body)
    return "".join(body[a:b] for a, b in zip([0, *(end for _, end in cut)], [*(start for start, _ in cut), len(body)]))


def load_claims(site=SITE):
    """Every shipped claim by id. A model file in the folder has no claim rows."""
    claims = {}
    for path in sorted((Path(site) / "data" / "claims").glob("*.json")):
        claims.update((c["id"], c) for c in json.loads(path.read_text(encoding="utf-8")).get("claims") or [])
    return claims


def decimal(text):
    return Decimal(text.replace(",", ""))


def is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def figures_in(text):
    """The figures written in a string, exactly as printed."""
    return {decimal(n) for n, _ in NUMBER.findall(text)} if isinstance(text, str) else set()


def holds_number(claim):
    """A claim holds a number when its value, low, or high is one, or is words with a figure in them."""
    return any(is_number(claim.get(key)) or figures_in(claim.get(key)) for key in ("value", "low", "high"))


def held(figure, scale, claim):
    """True when the claim holds this printed figure (scale: the thousand, million, billion, or trillion printed after it, else 1). See the module's figure rule."""
    places = Decimal(1).scaleb(min(figure.as_tuple().exponent, 0))
    for key in ("value", "low", "high"):
        if is_number(claim.get(key)):
            number = abs(Decimal(str(claim[key])))
            if any(WIDE.quantize(number / s, places) == figure for s in {1, scale}):
                return True
    written = set().union(*(figures_in(claim.get(key)) for key in ("value", "low", "high", "quote", "derived", "date", "date_us")))
    return figure in written or figure * scale in written


def figure_problem(claim_id, text, claim):
    """The figure rule alone: why a figure in this mark is not its claim's, or None."""
    missing = [n for n, scale in NUMBER.findall(text) if not held(decimal(n), SCALE.get(scale, 1), claim)]
    if missing:
        return (f"mark {text!r} prints {', '.join(missing)}, which is not the value, low, or high of claim {claim_id} at the page's rounding, nor written in its quote, "
                f"derived text, or date: print the claim's figure, show the arithmetic in its derived text, or name the claim that holds it")
    return None


def gate_problem(claim_id, text, claim):
    """What refuses a mark whatever the figure rule's mode, or None."""
    if claim is None:
        return f"claim {claim_id!r} does not ship: name a claim in site/data/claims/, or export this one with scripts/build_plates.py --export-claims"
    if claim.get("status") not in STATUS:
        return f"claim {claim_id} is {claim.get('status') or 'without a status'}: verify it in its evidence file and export it, or reword the sentence so it does not assert the figure"
    if claim["status"] == "partly" and not str(claim.get("limit") or "").strip():
        return f"claim {claim_id} is partly verified with no limit: add one public sentence for it to the evidence folder's claim-limits.json and export it"
    if not NUMBER.search(text) and holds_number(claim):
        return f"mark {text!r} holds no digits, and claim {claim_id} holds a number: write its figure in digits; a word mark stands only on a claim with no number"
    return None


def mark_problem(claim_id, text, claim):
    """Why this mark may not stand, or None."""
    return gate_problem(claim_id, text, claim) or (figure_problem(claim_id, text, claim) if REFUSE_FIGURES else None)


def mark_parts(match):
    """A mark's claim id and its text as a reader sees it."""
    claim_id = (re.search(r"""\sdata-claim=(["'])(.*?)\1""", match["attrs"]) or [None, None, ""])[2]
    return claim_id, " ".join(unescape(re.sub(r"<[^>]*>", "", match["inner"])).split())


def figure_report(body, claims):
    """In report mode, the problem the figure rule finds in each mark that passes every other check; empty once REFUSE_FIGURES is True, when pour refuses them."""
    if REFUSE_FIGURES:
        return []
    found = []
    for match in MARK.finditer(body):
        if match["attrs"]:
            claim_id, text = mark_parts(match)
            if not gate_problem(claim_id, text, claims.get(claim_id)) and (problem := figure_problem(claim_id, text, claims[claim_id])):
                found.append(problem)
    return found


def verbatim(text):
    """Source words keep their own dashes, as character references, as in scripts/build_plates.py."""
    return escape(str(text)).replace("—", "&#8212;").replace(" -- ", " &#45;- ")


ON_PAGE = ("Claims Cited on This Page", "Each dotted underline links to its claim here.")
FROM_PAGE = "Figures in the Text"  # the Sources page's name for it, as its rail says (briefing-plates-23: one word for one thing)


def status_words(claim):
    limit = str(claim.get("limit") or "").strip()
    return f'{"Partly verified." if claim["status"] == "partly" else "Verified against the source."}{f" Limit: {escape(limit)}" if limit else ""}'


def row(claim_id, claim, anchored):
    source = claim["source"]
    title, publisher = verbatim(source.get("title") or source.get("publisher") or claim_id), verbatim(source.get("publisher") or "")
    anchor = "" if anchored else f' id="src-{escape(claim_id)}"'
    return (f'          <li{anchor} data-status="{claim["status"]}"><a class="plate-source-title" href="{escape(source["url"])}">{title}</a>'
            f'<span class="caption">{escape(claim_id)}. {publisher}. {status_words(claim)}</span></li>\n')


def shared_limit(ids, claims):
    """The sentences every claim's limit from one source opens and closes with, and each claim's own sentences between them: wording they share is said
    once (library-summit-about-22). Returns (shared, {id: own}), shared empty when they share nothing or a claim has no limit."""
    parts = {c: re.split(r"(?<=\.)\s+", str(claims[c].get("limit") or "").strip()) for c in ids}
    if len(ids) < 2 or not all(p != [""] for p in parts.values()):
        return "", {}
    lists = list(parts.values())
    head = 0
    while all(len(p) > head for p in lists) and len({p[head] for p in lists}) == 1:
        head += 1
    tail = 0
    while all(len(p) > head + tail for p in lists) and len({p[-1 - tail] for p in lists}) == 1:
        tail += 1
    if not head + tail:
        return "", {}
    shared = " ".join(lists[0][:head] + lists[0][len(lists[0]) - tail:])
    return shared, {c: " ".join(p[head:len(p) - tail]) for c, p in parts.items()}


def document_row(ids, claims, anchored):
    """Several claims from one source: its title and publisher once, and the limit wording they share once, then a line per claim with its own."""
    source = claims[ids[0]]["source"]
    anchor = lambda claim_id: "" if claim_id in anchored else f' id="src-{escape(claim_id)}"'  # noqa: E731
    shared, own = shared_limit(ids, claims)

    def words(claim_id):
        claim = claims[claim_id]
        if not shared:
            return status_words(claim)
        rest = own[claim_id]
        return f'{"Partly verified." if claim["status"] == "partly" else "Verified against the source."}{f" Its own limit: {escape(rest)}" if rest else ""}'
    lines = "".join(f'<li{anchor(claim_id)} data-status="{claims[claim_id]["status"]}"><span class="caption">{escape(claim_id)}. {words(claim_id)}</span></li>' for claim_id in ids)
    note = f' Limit of each claim below: {escape(shared)}' if shared else ""
    return (f'          <li><a class="plate-source-title" href="{escape(source["url"])}">{verbatim(source.get("title") or source.get("publisher") or ids[0])}</a>'
            f'<span class="caption">{verbatim(source.get("publisher") or "")}.{note}</span><ul class="cited-claims">{lines}</ul></li>\n')


def block(ids, claims, anchored, words=(escape(ON_PAGE[0]), escape(ON_PAGE[1]))):
    """The list, one entry per source document. words: the heading and the caption, as HTML."""
    docs = {}
    for claim_id in ids:
        source = claims[claim_id]["source"]
        docs.setdefault((source["url"], source.get("title"), source.get("publisher")), []).append(claim_id)
    rows = "".join(row(group[0], claims[group[0]], group[0] in anchored) if len(group) == 1 else document_row(group, claims, anchored) for group in docs.values())
    return ('    <!-- claims-cited -->\n'
            '    <section class="wrap section claims-cited" id="claims-cited" aria-labelledby="claims-cited-title">\n'
            f'      <h2 id="claims-cited-title">{words[0]}</h2>\n'
            f'      <p class="caption">{words[1]}</p>\n'
            f'      <ul class="plate-sources">\n{rows}      </ul>\n'
            '    </section>\n'
            '    <!-- /claims-cited -->\n')


def is_sources(path):
    """A Sources page: sources/index.html in a page's folder (the site's own, site/sources/, is the hub and the home page's)."""
    return Path(path).name == "index.html" and Path(path).parent.name == "sources"


def sources_page(path):
    """The Sources page beside a page, if it has one."""
    shell = Path(path).parent / "sources" / "index.html"
    return shell if Path(path).name == "index.html" and not is_sources(path) and shell.is_file() else None


def main_of(path):
    """The page a Sources page serves."""
    return Path(path).parent.parent / "index.html"


def in_copy(body):
    """Whether a place in the page falls inside a copy (a page whose copies never close gets every place, and its problem from copies() elsewhere)."""
    try:
        spans = copies(body)
    except ValueError:
        return lambda at: True
    return lambda at: any(a <= at < b for a, b in spans)


def marks_in(body, claims, away=""):
    """The page with each good mark poured, linking to {away}#src-ID; the problems; and the ids its marks cite, in order. A copy's marks stay as they are."""
    problems, ids = [], []
    try:
        copies(body)
    except ValueError as error:
        problems.append(str(error))
    copied = in_copy(body)

    def mark(match):
        if not match["attrs"] or copied(match.start()):
            return match[0]
        claim_id, text = mark_parts(match)
        problem = mark_problem(claim_id, text, claims.get(claim_id))
        if problem:
            problems.append(problem)
            return match[0]
        if claim_id not in ids:
            ids.append(claim_id)
        status = STATUS[claims[claim_id]["status"]]
        kept = "".join(f" {a[0].strip()}" for a in ATTR.finditer(match["attrs"]) if a[1].lower() not in POURED_ATTRS)
        return (f'<a class="{match["cls"]}" data-claim="{claim_id}" data-status="{status}" href="{away}#src-{claim_id}" '
                f'aria-label="{escape(text)}, claim {claim_id}, {status}"{kept}>{match["inner"]}</a>')

    return MARK.sub(mark, body), problems, ids


def cited(body, claims):
    """The ids a page's good marks cite, in order."""
    return marks_in(body, claims)[2]


def listed(body, ids, claims, words):
    """The page with the list of these ids where its old one stood (a Sources page keeps it in its content column, beside the rail), or else before its
    </main>, and the problems."""
    old = BLOCK.search(body)
    bare = BLOCK.sub("", body)
    if not ids:
        return bare, []
    foot = old.start() if old else bare.rfind("</main>")
    if foot < 0:
        return body, ["the page has marks but no </main>, so the block has no place: add the element"]
    foot = foot if old else bare.rfind("\n", 0, foot) + 1
    return bare[:foot] + block(ids, claims, set(SRC_ANCHOR.findall(bare)), words) + bare[foot:], []


def pour(body, claims, away=""):
    """Returns (the page as it should stand, problems). The same page in gives the same page out. With away (its Sources page, "sources/"), the marks
    link there and the page keeps no list; without it, the list stays off a page whose every mark already lands on a receipt there. A site page (one that
    links site.css, which says how far it sits from the site's root) also links its terms to the hub's glossary and carries the prose tip's data and cite.js."""
    poured, problems, ids = marks_in(body, claims, away)
    root = SITE_CSS.search(body)
    if root and not problems:
        poured, problems, terms = terms_in(poured, root[1])
        if not problems:  # the tip serves every mark on the page, a copy's too, though only the page's own are listed
            copied = in_copy(poured)
            theirs = [mark_parts(m) for m in MARK.finditer(poured) if m["attrs"] and copied(m.start())]
            tip_ids = list(dict.fromkeys(ids + [c for c, text in theirs if not gate_problem(c, text, claims.get(c))]))
            tip_terms = list(dict.fromkeys(terms + [t["term"] for t in TERM.finditer(poured) if copied(t.start()) and t["term"] in GLOSSARY]))
            poured = tip_data(poured, tip_ids, tip_terms, claims, root[1])
    if problems:
        return body, problems
    poured = BLOCK.sub("", poured)
    if away or set(ids) <= set(SRC_ANCHOR.findall(poured)):
        return poured, []
    return listed(poured, ids, claims, (escape(ON_PAGE[0]), escape(ON_PAGE[1])))


# Terms and the prose tip (DIRECTION-R2 3.9). A lane marks a term's first use in the brief and in each tab panel as <span class="term" data-term="amw">aMW</span>;
# this links it to the hub's glossary (site/sources/#term-amw) and gives its definition to the same tip as a claim mark. The definitions are ours, in house style.
GLOSSARY = {
    "amw": ("aMW", "Average megawatts: a year's electricity use stated as the steady power that would use it evenly, hour by hour. It is less than a load's peak MW whenever the load factor is below one."),
    "mw": ("MW", "Megawatts: a rate of electric power, the size of a load or a power plant at full draw. A thousand kilowatts."),
    "twh": ("TWh", "Terawatt-hours: an amount of electric energy, a billion kilowatt-hours, the scale of a region's or a country's use in a year."),
    "wh": ("Wh", "Watt-hours: an amount of energy at the scale of one device, such as a phone charge or an hour of streaming on a screen."),
    "load-factor": ("load factor", "A load's average draw as a share of its peak. A data center that runs near full power all year has a high one."),
    "pue": ("PUE", "Power usage effectiveness: a data center's total energy divided by what its computers use. The rest goes to cooling, power conversion, and lighting; closer to one is leaner."),
    "co2e": ("CO2e", "Carbon dioxide equivalent: greenhouse gases stated as the amount of carbon dioxide that would warm the climate as much."),
    "partly-verified": ("partly verified", "The source supports the figure with a stated limit, and the limit travels with the figure wherever it appears."),
    "modeled": ("modeled", "Worked out from published inputs and stated assumptions rather than measured; a hollow mark on a plate."),
    "council": ("the Council", "The Northwest Power and Conservation Council, which plans the region's electric power under the Northwest Power Act."),
}
TERM = re.compile(r'<(?P<tag>span|a) class="term" data-term="(?P<term>[a-z0-9-]+)"(?: href="[^"]*")?>(?P<inner>[^<]*)</(?P=tag)>')
TIP_BLOCK = re.compile(r"[ \t]*<!-- cr-data -->.*?<!-- /cr-data -->\n?", re.S)
SITE_CSS = re.compile(r'href="((?:\.\./)*)assets/css/site\.css"')


def terms_in(body, root):
    """The page with each term linked to the hub's glossary, the problems, and the terms in order. A copy's terms stay as they are."""
    problems, terms = [], []
    copied = in_copy(body)

    def term(match):
        if copied(match.start()):
            return match[0]
        if match["term"] not in GLOSSARY:
            problems.append(f'term {match["term"]!r} has no definition: add it to GLOSSARY in scripts/pour_claim_refs.py, or mark a term it holds')
            return match[0]
        if match["term"] not in terms:
            terms.append(match["term"])
        return f'<a class="term" data-term="{match["term"]}" href="{root}sources/#term-{match["term"]}">{match["inner"]}</a>'
    return TERM.sub(term, body), problems, terms


def tip_data(body, ids, terms, claims, root):
    """The prose tip's data, before </body>: each marked claim's source, publisher, date, status, and limit, and each term's definition, with cite.js to
    read them. A page with neither keeps no block."""
    bare = TIP_BLOCK.sub("", body)
    if not ids and not terms:
        return bare
    def record(claim):
        source = claim["source"]
        return {k: v for k, v in {"title": source.get("title") or source.get("publisher"), "url": source.get("url"), "publisher": source.get("publisher"),
                                  "date": us_day(source.get("published")), "status": STATUS[claim["status"]], "limit": str(claim.get("limit") or "").strip() or None}.items() if v}
    data = {"claims": {c: record(claims[c]) for c in ids}, "terms": {t: {"name": GLOSSARY[t][0], "words": GLOSSARY[t][1]} for t in terms}}
    text = json.dumps(data, ensure_ascii=True, separators=(",", ":")).replace("<", "\\u003c").replace("--", "-\\u002d")
    foot = bare.rfind("</body>")
    if foot < 0:
        return bare
    foot = bare.rfind("\n", 0, foot) + 1
    block = (f'  <!-- cr-data -->\n  <script type="application/json" id="cr-data">{text}</script>\n'
             f'  <script defer src="{root}assets/js/cite.js"></script>\n  <!-- /cr-data -->\n')
    return bare[:foot] + block + bare[foot:]


def us_day(text):
    match = re.fullmatch(r"(\d{4})-(\d{2})(?:-(\d{2}))?", str(text or ""))
    return (f"{match[2]}/{match[3]}/{match[1]}" if match[3] else f"{match[2]}/{match[1]}") if match else (str(text) if text else None)


def pour_list(sources, main, claims):
    """A Sources page with its main page's list: every claim the main page's text cites, which its caption links, one folder up."""
    caption = 'Each dotted underline in <a href="../">the page’s text</a> links to its claim here, grouped by source.'
    return listed(sources, cited(main, claims), claims, (escape(FROM_PAGE), caption))


def check_page(rel, body, claims, site=None):
    """The problems on one page, for scripts/validate_public.py and --check. With site, a page with a Sources page must link its marks there and keep no
    list, and a Sources page must hold its main page's list and no mark of its own; without it, every page is checked as one that keeps its own list."""
    path = Path(site) / rel if site else None
    if path and is_sources(path):
        if any(m["attrs"] for m in MARK.finditer(body)):
            problems = [f"a Sources page holds a claim mark: the marks belong on {main_of(path).relative_to(site).as_posix()}, whose list this page holds"]
        else:
            poured, problems = pour_list(body, main_of(path).read_bytes().decode("utf-8") if main_of(path).is_file() else "", claims)
    else:
        poured, problems = pour(body, claims, "sources/" if path and sources_page(path) else "")
    if not problems and poured != body:
        problems = ["claim references are stale (a status, a limit, or the list of cited claims changed): run python scripts/pour_claim_refs.py"]
    return [f"{rel}: {problem}" for problem in problems]


def main():
    parser = argparse.ArgumentParser(description="Pour claim references and the page-foot claim list")
    parser.add_argument("--check", action="store_true", help="report only; exit 1 on any problem or stale block")
    parser.add_argument("--page", action="append", type=Path, help="one page; repeatable. Default: every page in site/")
    args = parser.parse_args()
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8", errors="replace")  # a mark or a sentence may hold a character the console's code page lacks
    claims = load_claims(SITE)
    problems, changed, marks, report = [], {}, 0, []
    for path in args.page or sorted(SITE.rglob("*.html")):
        path = path.resolve()
        rel = path.relative_to(SITE).as_posix()
        body = path.read_bytes().decode("utf-8")
        marks += sum(1 for m in MARK.finditer(body) if m["attrs"])
        report += [f"{rel}: {problem}" for problem in figure_report(body, claims)]
        if args.check:
            problems += check_page(rel, body, claims, SITE)
            continue
        if is_sources(path):
            continue  # its list comes from its main page, below
        shell = sources_page(path)
        poured, found = pour(body, claims, "sources/" if shell else "")
        problems += [f"{rel}: {problem}" for problem in found]
        if poured != body:
            changed[path] = poured
        if shell and not found:
            old = changed.get(shell) or shell.read_bytes().decode("utf-8")
            new, found = pour_list(old, body, claims)
            problems += [f"{shell.relative_to(SITE).as_posix()}: {problem}" for problem in found]
            if new != old:
                changed[shell] = new
    for line in report:
        print(f"figure rule: {line}")
    if not REFUSE_FIGURES:
        print(f"figure rule, report mode: {len(report)} of {marks} marks print a figure their claim does not hold; the exit code ignores them until REFUSE_FIGURES is True")
    for problem in problems:
        print(problem, file=sys.stderr)
    if problems:
        sys.exit(1)
    for path, poured in changed.items():
        path.write_bytes(poured.encode("utf-8"))
    print(json.dumps({"marks": marks, "pages_written": len(changed), "checked_only": args.check, "figure_report": len(report)}))


if __name__ == "__main__":
    main()
