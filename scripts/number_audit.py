"""Reports the numbers in site pages' prose that carry no claim id. It changes no page and always exits 0, so it can sit in the checks as a warning.

It walks each page's visible text outside plate and bench blocks and the claim list, skips what already carries a claim (a .cr mark, a poured
figure, a receipt), sets aside what needs none as far as code can tell, and lists the rest with each number's sentence:
  python scripts/number_audit.py
Writes work/site-refresh/review/NUMBER-AUDIT.json (every token, with the reason for any set aside) and NUMBER-AUDIT.md (the rest, by page).

A bare year in a sentence that also holds a marked figure counts as that figure's qualifier, so the open count can reach zero as marks go in. Numbers in the
Explorer's generated blocks are model output, set aside under their own reason and not traced here.

Reasons a number is set aside (the JSON names the reason on every row): ordinal, document_number, document_number_in_link (NIST AI 600-1), box_number (Box 2.1),
product_name (Veo 3), clock_time (1:28 PM), license_version (CC BY 4.0), year_in_title, year_in_label (a year in a table or figure row, column, or caption label),
citation_date, site_date, unit_definition, reader_set, axis_tick, qualifies_marked_figure, and spelled_count_in_marked_sentence.

A spelled count ("two million", "a thousand") is never marked. The rule (docs/PLATE-KIT.md): a claim marked or cited in the same sentence covers a spelled count in that
sentence, and the pour need not wrap words; a spelled count in a sentence with no claim of its own stays open.

shortcut: the exceptions read words near a number, so a quantity beside "Table" or "Section" passes and a year in a title that is not a link stays listed; the product
names and issuer letters are short lists to extend by hand. Read the list, and open the JSON's set-aside rows when a count looks wrong.
"""
from bisect import bisect_right
from html.parser import HTMLParser
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
OUT = ROOT / "work" / "site-refresh" / "review"

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
INVISIBLE = {"head", "script", "style", "template", "title", "desc"}
CONTROLS = {"fieldset", "label", "output", "select", "option", "textarea", "button"}
BLOCKS = {"address", "article", "aside", "blockquote", "button", "caption", "dd", "details", "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form",
          "h1", "h2", "h3", "h4", "h5", "h6", "header", "label", "li", "main", "nav", "ol", "option", "output", "p", "section", "select", "summary", "svg", "table", "td", "text", "th", "tr", "ul"}
MARKED_CLASSES = {"cr", "receipt", "x-c"}
TITLE_CLASSES = {"plate-source-title", "entry-title"}
LABELS = {"th", "caption", "figcaption", "legend"}  # a row, column, or figure label: a bare year here names a row, not a finding
SKIP_BLOCK = re.compile(r"\s*(/?)(?:plate|bench|claims-cited)(?::\S+)?\s*$")
MODEL_BLOCK = re.compile(r"\s*(/?)explorer:\S+\s*$")
AXIS_CLASS = re.compile(r"axis|tick")
CLAIM_ID = re.compile(r"\b[a-z]{2,3}-\d{3}\b")

MONTH = "January|February|March|April|May|June|July|August|September|October|November|December"
TOKEN = re.compile(
    rf"(?P<date>\b(?:{MONTH}) \d{{1,2}}, \d{{4}}\b|\b(?:{MONTH}) \d{{4}}\b|(?<![\w/])\d{{1,2}}/\d{{1,2}}/\d{{4}}\b|(?<![\w/])\d{{1,2}}/\d{{4}}\b|(?<![\w-])\d{{4}}-\d{{2}}-\d{{2}}\b)"
    r"|(?P<words>(?i:\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|several|a) (?:hundred|thousand|million|billion|trillion)\b))"
    r"|(?P<number>(?<![\w.,/#-])\$?\d+(?:,\d{3})*(?:\.\d+)?(?P<pct>\s?(?:%|percent\b))?(?P<ord>(?:st|nd|rd|th)\b)?)"
)
SENTENCE_END = re.compile(r'(?<=[.!?])\s+(?=[A-Z"\u201c(])')
YEAR = re.compile(r"(?:19|20)\d{2}$")
# Each reads the text just before the number, or just after it.
DOCUMENT_BEFORE = re.compile(r"\b(?:Resolutions?|Res\.|Nos?\.|Orders?|Docket|Public Law|Pub\. L\.|P\.L\.|H\.R\.|H\.B\.|S\.B\.|SB|HB|E\.O\.|EO|FR|Executive Order|Form|Bill|Rule|Notice)\s*#?\s*$|(?<![.\w])S\.\s*$")
DOCUMENT_AFTER = re.compile(r"-[A-Z]\b|\s+(?:CFR|C\.F\.R\.|U\.S\.C\.|USC|FR|Fed\. Reg\.)\b")
ORDINAL_BEFORE = re.compile(r"(?i)(?:\bpages?|\bpp?\.|\bsections?|\bsec\.|§+|\bchapters?|\btables?|\bfigures?|\bfig\.|\bparts?|\bappendix|\bsteps?|\bdays?|\bphases?|\bstages?|\btiers?|\bscopes?|\blevels?|\bversions?|\bv\.|\bquestions?|\bitems?|\bcategor(?:y|ies))\s+(?:\d+ to )?$|§\s*$")
VERSION_BEFORE = re.compile(r"(?i:licen[sc]e|polyform|apache|creative commons)(?:,?\s+(?:[A-Z][\w-]*|v|version))*\s*$|\bBY(?:-[A-Z]+)*\s*$|(?:ShareAlike|NonCommercial|CC0)\s*$")
BOX_BEFORE = re.compile(r"\bBox(?:es)?\s+$")
PRODUCT_BEFORE = re.compile(r"\b(?:Veo|Sora|Llama|Gemini|Gemma|Claude|Mistral|Mixtral|Qwen|DeepSeek|Grok|Kling|Phi|Pixel|Galaxy|iPhone|iPad|Windows|Ubuntu|macOS|Android|iOS|DGX|Blackwell|Stable Diffusion)\s+$")
CLOCK_BEFORE = re.compile(r"\d{1,2}:$")
CLOCK_AFTER = re.compile(r":\d{2}(?!\d)")
# A standards-style number: an issuer's letters before it, and a part, edition, or revision after it (NIST AI 600-1, ISO/IEC 30134-2:2026).
CODE_BEFORE = re.compile(r"\b(?:ISO|IEC|NIST|IEEE|ITU|ANSI|ASHRAE|RFC|FIPS|SP|AI|TR|EN|BS|DIN)(?:/[A-Z]+)?(?:-[A-Z])?\s+(?:[A-Z]\.?)?$")
CODE_AFTER = re.compile(r"-\d|:\d{4}\b")
ACRONYM_BEFORE = re.compile(r"\b[A-Z]{2,}[A-Za-z]*\s+$")
TITLE_YEAR_BEFORE = re.compile(r"(?:Act of|Outlook|AEO|STEO|Report|Review|Plan|Strategy|Assessment|Budget|Forecast)\s*$")
TITLE_YEAR_AFTER = re.compile(r"\s+(?:[A-Z][\w-]*\s+)*(?:Report|Outlook|Plan|Assessment|Review|Strategy|Convention|Act)\b")
CITATION_BEFORE = re.compile(r"\([^()]*,\s*$")
CITATION_AFTER = re.compile(r"\s*[;)]")
SITE_DATE_BEFORE = re.compile(r"(?i)\b(?:checked|built|retrieved|accessed|updated|reviewed|generated|modeled)(?:\s+on)?[\s,:]*$")
SITE_DATE_AFTER = re.compile(r"(?i)\s*(?:sources? checked|checked\b|build\b|days? ago\b)")
READER_SET = re.compile(r"(?i)\breader-set\b|\byour (?:own )?setting\b|\bworked example\b|\billustrative example\b|\bexample:|\bdefaults?:")
UNIT_DEFINITION = re.compile(r"^(?:An?|One) (?:watt-hour|kilowatt|kilowatt-hour|megawatt-hour|terawatt-hour|TWh|gigawatt|average megawatt|megaliter)\b")


class Walker(HTMLParser):
    """Collects each block of visible text as pieces, with the reason (if any) its numbers are already accounted for."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.pieces, self.blocks, self.skipping, self.modeled = [], [], [], False, False

    def flush(self):
        if any(piece[0].strip() for piece in self.pieces):
            self.blocks.append(self.pieces)
        self.pieces = []

    def handle_comment(self, data):
        skip, model = SKIP_BLOCK.match(data), MODEL_BLOCK.match(data)
        if skip or model:
            self.flush()
        if skip:
            self.skipping = not skip[1]
        if model:
            self.modeled = not model[1]

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        classes = set((attrs.get("class") or "").split())
        parent = self.stack[-1] if self.stack else {"reason": None, "title": False, "gone": False, "label": False}
        reason = parent["reason"]
        if "data-pour" in attrs or "data-claim" in attrs or classes & MARKED_CLASSES or (attrs.get("id") or "").startswith("src-"):
            reason = "marked"
        elif reason is None and tag in CONTROLS:
            reason = "reader_set"
        elif reason is None and AXIS_CLASS.search(attrs.get("class") or ""):
            reason = "axis_tick"
        title = parent["title"] or tag == "cite" or bool(classes & TITLE_CLASSES) or (tag == "a" and (attrs.get("href") or "").startswith("https://"))
        gone = parent["gone"] or tag in INVISIBLE or "hidden" in attrs
        label = parent["label"] or tag in LABELS
        if tag in BLOCKS:
            self.flush()
        if tag not in VOID:
            self.stack.append({"tag": tag, "reason": reason, "title": title, "gone": gone, "label": label})

    def handle_endtag(self, tag):
        if tag in BLOCKS:
            self.flush()
        for depth in range(len(self.stack) - 1, -1, -1):
            if self.stack[depth]["tag"] == tag:
                del self.stack[depth:]
                return

    def handle_data(self, data):
        top = self.stack[-1] if self.stack else {"reason": None, "title": False, "gone": False, "label": False}
        if not self.skipping and not top["gone"]:
            self.pieces.append((data, top["reason"] or ("explorer_model" if self.modeled else None), top["title"], top["label"]))


def sentence_of(text, start):
    begin = 0
    for end in SENTENCE_END.finditer(text):
        if end.end() > start:
            return " ".join(text[begin:end.start()].split())
        begin = end.end()
    return " ".join(text[begin:].split())


def kind_of(found):
    if found["date"]:
        return "date"
    if found["words"]:
        return "spelled"
    token = found[0]
    if YEAR.match(token):
        return "year"
    return "percent" if found["pct"] else "money" if token.startswith("$") else "number"


def exception(found, text, in_title, sentence, kind, in_label=False):
    """Why this number needs no claim id, as far as code can tell, or None."""
    before, after = text[max(0, found.start() - 80):found.start()], text[found.end():found.end() + 60]
    if found["ord"]:
        return "ordinal"
    if DOCUMENT_BEFORE.search(before) or DOCUMENT_AFTER.match(after):
        return "document_number"
    if CODE_AFTER.match(after) and (CODE_BEFORE.search(before) or (in_title and ACRONYM_BEFORE.search(before))):
        return "document_number_in_link" if in_title else "document_number"
    if BOX_BEFORE.search(before):
        return "box_number"
    if PRODUCT_BEFORE.search(before):
        return "product_name"
    if (CLOCK_AFTER.match(after) and kind == "number") or (CLOCK_BEFORE.search(before) and len(found[0]) == 2):
        return "clock_time"
    if ORDINAL_BEFORE.search(before):
        return "ordinal"
    if VERSION_BEFORE.search(before):
        return "license_version"
    if kind == "year" and in_label:
        return "year_in_label"
    if UNIT_DEFINITION.match(sentence):
        return "unit_definition"
    if kind == "year" and (in_title or TITLE_YEAR_BEFORE.search(before) or TITLE_YEAR_AFTER.match(after)):
        return "year_in_title"
    if kind in ("year", "date") and CITATION_BEFORE.search(before) and CITATION_AFTER.match(after):
        return "citation_date"
    if (kind in ("year", "date") and SITE_DATE_BEFORE.search(before)) or SITE_DATE_AFTER.match(after):
        return "site_date"
    if READER_SET.search(sentence):
        return "reader_set"
    return None


def joined(pieces):
    """A block's text, and where each piece starts. Two inline elements that touch (a value and its label) read as separate words."""
    text, starts = "", []
    for piece, *_ in pieces:
        if text and piece and text[-1].isalnum() and piece[0].isalnum():
            text += " "
        starts.append(len(text))
        text += piece
    return text, starts


def audit_html(html):
    """Every numeric token on a page: {token, kind, sentence, reason}; reason None means it still needs a claim id or a reword."""
    walker = Walker()
    walker.feed(html)
    walker.close()
    walker.flush()
    rows = []
    for pieces in walker.blocks:
        text, starts = joined(pieces)
        block_rows = []
        for found in TOKEN.finditer(text):
            _, reason, in_title, in_label = pieces[bisect_right(starts, found.start()) - 1]
            sentence = sentence_of(text, found.start())
            kind = kind_of(found)
            if reason is None and CLAIM_ID.search(sentence):
                reason = "claim_id_in_sentence"
            block_rows.append({"token": " ".join(found[0].split()), "kind": kind, "sentence": sentence, "reason": reason or exception(found, text, in_title, sentence, kind, in_label)})
        marked = {r["sentence"] for r in block_rows if r["reason"] in ("marked", "claim_id_in_sentence")}
        for r in block_rows:
            if r["reason"] is None and r["kind"] == "year" and r["sentence"] in marked:
                r["reason"] = "qualifies_marked_figure"
            elif r["reason"] is None and r["kind"] == "spelled" and r["sentence"] in marked:
                r["reason"] = "spelled_count_in_marked_sentence"
        rows += block_rows
    return rows


def report(pages):
    """The JSON and Markdown forms of {page: rows}."""
    summary, body = {}, []
    lines = ["# Number audit", "", "Numbers in visible prose with no claim id, by page: scripts/number_audit.py. A report, not a gate. Each line is a sentence, with its open numbers first.", "",
             "| Page | Open | Of those, bare years and dates | Marked | Set aside, by reason |", "|---|---|---|---|---|"]
    for page, rows in pages.items():
        open_rows = [r for r in rows if r["reason"] is None]
        reasons = {}
        for r in rows:
            if r["reason"]:
                reasons[r["reason"]] = reasons.get(r["reason"], 0) + 1
        marked = reasons.pop("marked", 0) + reasons.pop("claim_id_in_sentence", 0)
        summary[page] = {"open": len(open_rows), "open_years_and_dates": sum(r["kind"] in ("year", "date") for r in open_rows), "marked": marked, "set_aside": sum(reasons.values()), "reasons": reasons}
        words = ", ".join(f"{key} {count}" for key, count in sorted(reasons.items())) or "none"
        lines.append(f"| {page} | {len(open_rows)} | {summary[page]['open_years_and_dates']} | {marked} | {words} |")
        by_sentence = {}
        for r in open_rows:
            by_sentence.setdefault(r["sentence"], []).append(r["token"])
        body += [f"## {page}", ""] + [f"- **{', '.join(tokens)}**: {sentence}" for sentence, tokens in by_sentence.items()] + [""]
    totals = {key: sum(s[key] for s in summary.values()) for key in ("open", "open_years_and_dates", "marked", "set_aside")}
    lines.append(f"| Total | {totals['open']} | {totals['open_years_and_dates']} | {totals['marked']} | {totals['set_aside']} |")
    return {"schema": 1, "totals": totals, "summary": summary, "pages": pages}, "\n".join(lines + [""] + body), summary


def main():
    pages = {path.relative_to(SITE).as_posix(): audit_html(path.read_text(encoding="utf-8")) for path in sorted(SITE.rglob("*.html"))}
    data, markdown, summary = report(pages)
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "NUMBER-AUDIT.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    (OUT / "NUMBER-AUDIT.md").write_text(markdown, encoding="utf-8")
    for page, counts in summary.items():
        print(f"{counts['open']:5} open ({counts['open_years_and_dates']} years and dates)  {counts['marked']:5} marked  {counts['set_aside']:5} set aside  {page}")
    print(f"warning only: {data['totals']['open']} numbers with no claim id; see work/site-refresh/review/NUMBER-AUDIT.md")


if __name__ == "__main__":
    main()
