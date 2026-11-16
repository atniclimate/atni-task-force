"""Claim references in prose: a number links to its receipt, with no JS, and a list holds every claim a page cites.

An author writes <a class="cr" data-claim="fp-141" href="#src-fp-141">3.1 Wh</a> (in either quote mark), and this script adds the status and the
accessible name to each mark, keeping any other attribute, and writes the list between the claims-cited markers, grouped by source document. A page
with a Sources page beside it (sources/index.html, owner ruling 39) keeps no list: its marks link to sources/#src-ID, and the list goes before that
page's </main>, under "Claims Cited in the Page's Text". Any other page lists them before its own </main>, unless every mark already lands on a receipt
on the page. An id that already has a receipt where the list goes (a src- anchor outside the block) keeps it as its one anchor, and its row carries no id.

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
FROM_PAGE = "Claims Cited in the Text"


def status_words(claim):
    limit = str(claim.get("limit") or "").strip()
    return f'{"Partly verified." if claim["status"] == "partly" else "Verified against the source."}{f" Limit: {escape(limit)}" if limit else ""}'


def row(claim_id, claim, anchored):
    source = claim["source"]
    title, publisher = verbatim(source.get("title") or source.get("publisher") or claim_id), verbatim(source.get("publisher") or "")
    anchor = "" if anchored else f' id="src-{escape(claim_id)}"'
    return (f'          <li{anchor}><a class="plate-source-title" href="{escape(source["url"])}">{title}</a>'
            f'<span class="caption">{escape(claim_id)}. {publisher}. {status_words(claim)}</span></li>\n')


def document_row(ids, claims, anchored):
    """Several claims from one source: its title and publisher once, then a line per claim."""
    source = claims[ids[0]]["source"]
    anchor = lambda claim_id: "" if claim_id in anchored else f' id="src-{escape(claim_id)}"'  # noqa: E731
    lines = "".join(f'<li{anchor(claim_id)}><span class="caption">{escape(claim_id)}. {status_words(claims[claim_id])}</span></li>' for claim_id in ids)
    return (f'          <li><a class="plate-source-title" href="{escape(source["url"])}">{verbatim(source.get("title") or source.get("publisher") or ids[0])}</a>'
            f'<span class="caption">{verbatim(source.get("publisher") or "")}.</span><ul class="cited-claims">{lines}</ul></li>\n')


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


def marks_in(body, claims, away=""):
    """The page with each good mark poured, linking to {away}#src-ID; the problems; and the ids its marks cite, in order."""
    problems, ids = [], []

    def mark(match):
        if not match["attrs"]:
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
    """The page with the list of these ids before its </main>, in place of any old one, and the problems."""
    bare = BLOCK.sub("", body)
    if not ids:
        return bare, []
    foot = bare.rfind("</main>")
    if foot < 0:
        return body, ["the page has marks but no </main>, so the block has no place: add the element"]
    foot = bare.rfind("\n", 0, foot) + 1
    return bare[:foot] + block(ids, claims, set(SRC_ANCHOR.findall(bare)), words) + bare[foot:], []


def pour(body, claims, away=""):
    """Returns (the page as it should stand, problems). The same page in gives the same page out. With away (its Sources page, "sources/"), the marks
    link there and the page keeps no list; without it, the list stays off a page whose every mark already lands on a receipt there."""
    poured, problems, ids = marks_in(body, claims, away)
    if problems:
        return body, problems
    poured = BLOCK.sub("", poured)
    if away or set(ids) <= set(SRC_ANCHOR.findall(poured)):
        return poured, []
    return listed(poured, ids, claims, (escape(ON_PAGE[0]), escape(ON_PAGE[1])))


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
