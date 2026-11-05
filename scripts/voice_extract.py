"""Usage: python scripts/voice_extract.py PAGE OUT.md   (PAGE like site/ai/index.html; run from the repo root)
Visible prose of a page plus the prose fields of its plates, as markdown for `jev.py voice`."""
import glob
import json
import re
import sys
from pathlib import Path
from bs4 import BeautifulSoup

SKIP = ["script", "style", "nav", "svg", "noscript", "table", "form", "button", "template"]
BLOCKS = ["h1", "h2", "h3", "h4", "p", "li", "summary", "figcaption", "dt", "dd"]
# plate prose keys; ids, claims, labels, units and formulas are data, not voice
PROSE = {"eyebrow", "title", "subtitle", "text", "boundary", "reading", "tail", "detail", "say", "note", "band_label"}


def clean(s):
    s = " ".join(s.split())
    return re.sub(r" ([.,;:!?)])", r"\1", s).replace("( ", "(")


def page_lines(html):
    soup = BeautifulSoup(html, "html.parser")
    for t in soup(SKIP):
        t.decompose()
    root = soup.find("main") or soup.body
    sel = lambda t: t.name in BLOCKS or any(c in ("lead", "note") for c in t.get("class", []))
    out = []
    for el in root.find_all(sel):
        if el.find_parent(sel):
            continue  # nested block: its text is captured by the outer one
        for h in el.find_all(["h1", "h2", "h3", "h4"]):  # card with headings: emit them, then the rest
            out.append("#" * int(h.name[1]) + " " + clean(h.get_text(" ")))
            h.decompose()
        txt = clean(el.get_text(" "))
        if not txt:
            continue
        out.append("#" * int(el.name[1]) + " " + txt if el.name[0] == "h" and len(el.name) == 2 else txt)
    return out


def prose_strings(o, key=""):
    if isinstance(o, dict):
        for k, v in o.items():
            yield from prose_strings(v, k)
    elif isinstance(o, list):
        for v in o:
            yield from prose_strings(v, key)
    elif isinstance(o, str) and key in PROSE:
        yield key, o


def plates_for(page, plate_dir="site/data/plates"):
    rel = page.replace("\\", "/")
    rel = rel[5:] if rel.startswith("site/") else rel
    for f in sorted(glob.glob(plate_dir + "/*.json")):
        d = json.loads(Path(f).read_text(encoding="utf-8"))
        if d.get("page") == rel:
            yield d


def plate_lines(d):
    out = ["### Plate: " + clean(d.get("title", d.get("id", "")))]
    for k, s in prose_strings({x: y for x, y in d.items() if x != "title"}):
        out.append(("Reading template: " if k == "reading" else "") + clean(s))
    return out


def main(page, out):
    lines = page_lines(Path(page).read_text(encoding="utf-8"))
    plates = list(plates_for(page))
    if plates:
        lines.append("## Plates")
        for d in plates:
            lines += plate_lines(d)
    Path(out).write_text("\n\n".join(lines) + "\n", encoding="utf-8")
    print(page, len(lines), "blocks,", len(plates), "plates")


def _selftest():
    h = "<main><h2>Head</h2><nav><p>no</p></nav><p>One <b>two</b>.</p><ul><li>Item</li></ul><details><summary>Sum</summary><p>In</p></details><table><tr><td>9</td></tr></table><script>x</script><!-- SLOT:a --></main>"
    assert page_lines(h) == ["## Head", "One two.", "Item", "Sum", "In"], page_lines(h)
    d = {"title": "T {x}", "reading": "R", "id": "i", "text": ["a", "b"], "rows": [{"label": "L", "detail": "D"}]}
    assert plate_lines(d) == ["### Plate: T {x}", "Reading template: R", "a", "b", "D"], plate_lines(d)


if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "--selftest":
        _selftest()
        print("ok")
    else:
        main(sys.argv[1], sys.argv[2])
