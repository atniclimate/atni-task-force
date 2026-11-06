"""Claim references in prose: a number links to its receipt, with no JS, and the page foot lists every claim it cites.

An author writes <a class="cr" data-claim="fp-141" href="#src-fp-141">3.1 Wh</a> (in either quote mark), and this script adds the status and the
accessible name to each mark, keeping any other attribute, and writes "Claims Cited on This Page" before </main>, between the claims-cited markers. An id that
already has a receipt on the page (a src- anchor outside the block) keeps it as its one anchor, and its row here carries no id.

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


def row(claim_id, claim, anchored):
    source = claim["source"]
    limit = str(claim.get("limit") or "").strip()
    status = "Partly verified." if claim["status"] == "partly" else "Verified against the source."
    title, publisher = verbatim(source.get("title") or source.get("publisher") or claim_id), verbatim(source.get("publisher") or "")
    anchor = "" if anchored else f' id="src-{escape(claim_id)}"'
    limit_text = f' Limit: {escape(limit)}' if limit else ""
    return (f'          <li{anchor}><a class="plate-source-title" href="{escape(source["url"])}">{title}</a>'
            f'<span class="caption">{escape(claim_id)}. {publisher}. {status}{limit_text}</span></li>\n')


def block(ids, claims, anchored):
    rows = "".join(row(claim_id, claims[claim_id], claim_id in anchored) for claim_id in ids)
    return ('    <!-- claims-cited -->\n'
            '    <section class="wrap section claims-cited" aria-labelledby="claims-cited-title">\n'
            '      <h2 id="claims-cited-title">Claims Cited on This Page</h2>\n'
            '      <p class="caption">Each dotted underline links to its claim here.</p>\n'
            f'      <ul class="plate-sources">\n{rows}      </ul>\n'
            '    </section>\n'
            '    <!-- /claims-cited -->\n')


def pour(body, claims):
    """Returns (the page as it should stand, problems). The same page in gives the same page out."""
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
        return (f'<a class="{match["cls"]}" data-claim="{claim_id}" data-status="{status}" href="#src-{claim_id}" '
                f'aria-label="{escape(text)}, claim {claim_id}, {status}"{kept}>{match["inner"]}</a>')

    poured = BLOCK.sub("", MARK.sub(mark, body))
    if problems or not ids:
        return (body if problems else poured), problems
    foot = poured.rfind("</main>")
    if foot < 0:
        return body, ["the page has marks but no </main>, so the block has no place: add the element"]
    foot = poured.rfind("\n", 0, foot) + 1
    anchored = set(SRC_ANCHOR.findall(poured))
    return poured[:foot] + block(ids, claims, anchored) + poured[foot:], []


def check_page(rel, body, claims):
    """The problems on one page, for scripts/validate_public.py and --check."""
    poured, problems = pour(body, claims)
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
            problems += check_page(rel, body, claims)
            continue
        poured, found = pour(body, claims)
        problems += [f"{rel}: {problem}" for problem in found]
        if poured != body:
            changed[path] = poured
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
