"""Claim references in prose: a number links to its receipt, with no JS, and the page foot lists every claim it cites.

An author writes <a class="cr" data-claim="fp-141" href="#src-fp-141">3.1 Wh</a>, and this script adds the status and the
accessible name to each mark and writes "Claims Cited on This Page" before </main>, between the claims-cited markers. An id that
already has a receipt on the page (a src- anchor outside the block) keeps it as its one anchor, and its row here carries no id.

It refuses, and writes nothing, if a mark names a claim that does not ship, is unverified, or is partly verified with no limit, or if
a figure in the mark is not in that claim's value, low, high, date, or derived text. A rounded figure fails: print the claim's digits,
or show the rounding in its derived text. scripts/validate_public.py runs the same check through check_page.

Run after scripts/build_plates.py and scripts/build_explorer.py, since a mark inside a generated block is only as lasting as its generator:
  python scripts/pour_claim_refs.py                          every page
  python scripts/pour_claim_refs.py --page site/ai/index.html  one page, repeatable
  python scripts/pour_claim_refs.py --check                  report only; exit 1 on any problem or stale block
"""
import argparse
from decimal import Decimal
from html import escape, unescape
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
STATUS = {"verified": "verified", "partly": "partly verified"}
# Scripts, styles, and comments are matched first so a mark quoted inside one is left alone.
MARK = re.compile(r'<script\b.*?</script>|<style\b.*?</style>|<!--.*?-->|<a\b(?P<attrs>[^<>]*\sclass="(?P<cls>cr|cr\s[^"]*|[^"]*\scr|[^"]*\scr\s[^"]*)"[^<>]*)>(?P<inner>.*?)</a>', re.S)
BLOCK = re.compile(r"[ \t]*<!-- claims-cited -->.*?<!-- /claims-cited -->\n?", re.S)
SRC_ANCHOR = re.compile(r'\sid="src-([^"]+)"')
NUMBER = re.compile(r"(?<![\w.,])(\d+(?:,\d{3})*(?:\.\d+)?)(?:\s*(thousand|million|billion|trillion)\b)?")
SCALE = {"thousand": 10**3, "million": 10**6, "billion": 10**9, "trillion": 10**12}


def load_claims(site=SITE):
    """Every shipped claim by id. A model file in the folder has no claim rows."""
    claims = {}
    for path in sorted((Path(site) / "data" / "claims").glob("*.json")):
        claims.update((c["id"], c) for c in json.loads(path.read_text(encoding="utf-8")).get("claims") or [])
    return claims


def decimal(text):
    return Decimal(text.replace(",", ""))


def claim_numbers(claim):
    """The figures a mark may print from this claim. A date claim's value is its date, so date and date_us count too."""
    found = set()
    for key in ("value", "low", "high"):
        if isinstance(claim.get(key), (int, float)) and not isinstance(claim[key], bool):
            found.add(abs(Decimal(str(claim[key]))))
    for key in ("value", "low", "high", "derived", "date", "date_us"):
        if isinstance(claim.get(key), str):
            found.update(decimal(n) for n, _ in NUMBER.findall(claim[key]))
    return found


def mark_problem(claim_id, text, claim):
    """Why this mark may not stand, or None."""
    if claim is None:
        return f"claim {claim_id!r} does not ship: name a claim in site/data/claims/, or export this one with scripts/build_plates.py --export-claims"
    if claim.get("status") not in STATUS:
        return f"claim {claim_id} is {claim.get('status') or 'without a status'}: verify it in its evidence file and export it, or reword the sentence so it does not assert the figure"
    if claim["status"] == "partly" and not str(claim.get("limit") or "").strip():
        return f"claim {claim_id} is partly verified with no limit: add one public sentence for it to the evidence folder's claim-limits.json and export it"
    tokens = NUMBER.findall(text)
    if not tokens:
        return f"mark {text!r} holds no digits: write the figure in digits so it can be checked against claim {claim_id}"
    held = claim_numbers(claim)
    missing = [n for n, scale in tokens if decimal(n) not in held and decimal(n) * SCALE.get(scale, 1) not in held]
    if missing:
        return f"mark {text!r} prints {', '.join(missing)}, which is not in the value, low, high, date, or derived text of claim {claim_id}: print the claim's digits, or name the claim that holds them"
    return None


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
            '      <p class="caption">Each figure with a dotted underline links to its claim here.</p>\n'
            f'      <ul class="plate-sources">\n{rows}      </ul>\n'
            '    </section>\n'
            '    <!-- /claims-cited -->\n')


def pour(body, claims):
    """Returns (the page as it should stand, problems). The same page in gives the same page out."""
    problems, ids = [], []

    def mark(match):
        if not match["attrs"]:
            return match[0]
        claim_id = (re.search(r'\sdata-claim="([^"]*)"', match["attrs"]) or [None, ""])[1]
        text = " ".join(unescape(re.sub(r"<[^>]*>", "", match["inner"])).split())
        problem = mark_problem(claim_id, text, claims.get(claim_id))
        if problem:
            problems.append(problem)
            return match[0]
        if claim_id not in ids:
            ids.append(claim_id)
        status = STATUS[claims[claim_id]["status"]]
        return (f'<a class="{match["cls"]}" data-claim="{claim_id}" data-status="{status}" href="#src-{claim_id}" '
                f'aria-label="{escape(text)}, claim {claim_id}, {status}">{match["inner"]}</a>')

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
    claims = load_claims()
    problems, changed, marks = [], {}, 0
    for path in args.page or sorted(SITE.rglob("*.html")):
        path = path.resolve()
        rel = path.relative_to(SITE).as_posix()
        body = path.read_bytes().decode("utf-8")
        marks += sum(1 for m in MARK.finditer(body) if m["attrs"])
        if args.check:
            problems += check_page(rel, body, claims)
            continue
        poured, found = pour(body, claims)
        problems += [f"{rel}: {problem}" for problem in found]
        if poured != body:
            changed[path] = poured
    for problem in problems:
        print(problem, file=sys.stderr)
    if problems:
        sys.exit(1)
    for path, poured in changed.items():
        path.write_bytes(poured.encode("utf-8"))
    print(json.dumps({"marks": marks, "pages_written": len(changed), "checked_only": args.check}))


if __name__ == "__main__":
    main()
