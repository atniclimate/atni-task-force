"""Usage: python scripts/voice_numbers.py PAGE [BASELINE]   (PAGE like site/ai/index.html; run from the repo root)
Compares numbers, dates, percentages and href targets (visible text, plate JSON prose and hrefs)
against the BASELINE folder, by default work/site-refresh/copy/pre-voice. Prints what appeared or disappeared; exit 1 on any difference."""
import json
import re
import sys
from collections import Counter
from pathlib import Path
from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).parent))
from voice_extract import SKIP, plates_for, prose_strings  # noqa: E402

BASE = Path(__file__).resolve().parents[1] / "work" / "site-refresh" / "copy" / "pre-voice"
TOKEN = re.compile(r"\d{1,2}/\d{1,2}/\d{4}|\d[\d,]*(?:\.\d+)?%?")


def tokens(text):
    text = re.sub(r"\{[^}]*\}", " ", text)  # plate format fields are not figures
    return Counter(t.replace(",", "").rstrip(".") for t in TOKEN.findall(text))


def hrefs_of(o):
    if isinstance(o, dict):
        for k, v in o.items():
            if k in ("href", "link") and isinstance(v, str):
                yield v
            else:
                yield from hrefs_of(v)
    elif isinstance(o, list):
        for v in o:
            yield from hrefs_of(v)


def facts(html, plates):
    soup = BeautifulSoup(html, "html.parser")
    hrefs = Counter(a["href"] for a in soup.find_all("a", href=True))
    for t in soup(SKIP[:2] + ["svg", "noscript", "template"]):  # script, style, svg: not visible
        t.decompose()
    text = soup.get_text(" ")
    for d in plates:
        text += " " + " ".join(s for _, s in prose_strings(d))
        hrefs.update(hrefs_of(d))
    return tokens(text), hrefs


def compare(old, new):
    out = []
    for name, a, b in (("number", old[0], new[0]), ("href", old[1], new[1])):
        for k in sorted((b - a).keys()):
            out.append(f"APPEARED {name}: {k} (x{(b - a)[k]})")
        for k in sorted((a - b).keys()):
            out.append(f"DISAPPEARED {name}: {k} (x{(a - b)[k]})")
    return out


def main(page, base=BASE):
    rel = page.replace("\\", "/")
    base = Path(base)
    old_html = (base / rel).read_text(encoding="utf-8")
    old_plates = list(plates_for(rel, str(base / "site/data/plates")))
    new_plates = list(plates_for(rel))
    diff = compare(facts(old_html, old_plates), facts(Path(rel).read_text(encoding="utf-8"), new_plates))
    print("\n".join(diff) if diff else f"{rel}: numbers, dates, percentages and hrefs unchanged")
    return 1 if diff else 0


def _selftest():
    a = facts('<main><p>Up 12.5% by 03/2025, 1,200 MW on 11/04/2026.</p><a href="/x">k</a><script>9</script></main>', [])
    same = facts('<main><p>Rose 12.5% by 03/2025; 1200 MW on 11/04/2026.</p><a href="/x">k</a></main>', [])
    assert compare(a, same) == [], compare(a, same)
    chg = facts('<main><p>Up 12.6% by 03/2025, 1,200 MW on 11/04/2026.</p><a href="/y">k</a></main>', [])
    assert len(compare(a, chg)) == 4, compare(a, chg)
    p = [{"title": "T {c[a-1][value]:,.0f} 5", "href": "/z"}]
    assert facts("<main></main>", p)[0] == Counter({"5": 1}) and facts("<main></main>", p)[1] == Counter({"/z": 1})


if __name__ == "__main__":
    if sys.argv[1:] == ["--selftest"]:
        _selftest()
        print("ok")
    else:
        sys.exit(main(*sys.argv[1:3]))
