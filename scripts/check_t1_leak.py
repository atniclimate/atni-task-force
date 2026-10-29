"""Local pre-release check: does any verbatim T1 text appear in the public site?

Compares 10-word shingles of T1 working files with the visible text of site/. A shingle that
also occurs in a T0 source (public research compilations, extracted resolutions, released
drafts) is not counted, because public text may legitimately repeat it. Run from the
repository root before any push:

    python scripts/check_t1_leak.py

Exit 1 lists each overlap with the T1 file it came from. planning-T1/ exists only on the
owner's machine, so this check cannot run in CI.
"""
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
T1 = ROOT / "planning-T1"
SITE = ROOT / "site"
N = 10
# T0 material kept inside the T1 workspace: compilations of public sources and extracted ATNI
# resolutions. Public drafts live outside planning-T1 (work/public-drafts/), so any T1 sentence
# that reaches them, and then the site, is still caught here.
T0_INSIDE_T1 = ("research/", "sources/extracted/2024", "sources/extracted/2026", "sources/extracted/Res-")
# Original T1 material (verbatim exports and cleaned notes): any overlap blocks (exit 1). Derived
# planning documents routinely quote public text, so their overlaps are listed for review (exit 3).
PRIMARY_T1 = ("sources/", "ai-notes/cleaned/")


def words(text):
    # URLs are public addresses, not prose; their path segments would form false shingles.
    return re.findall(r"[a-z0-9]+", re.sub(r"https?://\S+|www\.\S+", " ", text.lower()))


def shingles(text):
    w = words(text)
    return {" ".join(w[i:i + N]) for i in range(len(w) - N + 1)}


class Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts, self.skip = [], 0

    def handle_starttag(self, tag, attrs):
        self.skip += tag in ("script", "style")

    def handle_endtag(self, tag):
        self.skip -= tag in ("script", "style") and self.skip > 0

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def json_strings(node):
    if isinstance(node, str):
        yield node
    elif isinstance(node, dict):
        for v in node.values():
            yield from json_strings(v)
    elif isinstance(node, list):
        for v in node:
            yield from json_strings(v)


def site_text():
    """Yield (path, texts); each JSON string is its own text so adjacent fields never join."""
    for p in SITE.rglob("*"):
        if p.suffix == ".html":
            t = Text()
            t.feed(p.read_text(encoding="utf-8"))
            yield p, [" ".join(t.parts)]
        elif p.suffix == ".json":
            yield p, list(json_strings(json.loads(p.read_text(encoding="utf-8"))))


def main():
    if not T1.is_dir():
        sys.exit("planning-T1/ not found: run this on the owner's machine")
    t1, t0 = {}, set()
    allow = T1 / "leak-allowlist.txt"  # overlaps a person reviewed as public facts; one shingle per line
    if allow.is_file():
        t0 |= {ln.strip() for ln in allow.read_text(encoding="utf-8").splitlines() if ln.strip() and ln[0] != "#"}
    for p in T1.rglob("*"):
        rel = p.relative_to(T1).as_posix()
        if not p.is_file() or rel == "leak-allowlist.txt":
            continue
        if p.suffix == ".json" and rel.startswith(T0_INSIDE_T1):
            t0 |= set().union(set(), *map(shingles, json_strings(json.loads(p.read_text(encoding="utf-8")))))
            continue
        if p.suffix not in (".md", ".txt"):
            continue
        s = shingles(p.read_text(encoding="utf-8", errors="replace"))
        if rel.startswith(T0_INSIDE_T1):
            t0 |= s
        else:
            for sh in s:
                t1.setdefault(sh, rel)
    hits = {}
    for page, texts in site_text():
        for sh in set().union(*map(shingles, texts)):
            if sh in t1 and sh not in t0:
                hits.setdefault(page.relative_to(ROOT).as_posix(), set()).add((t1[sh], sh))
    shown = None if "--all" in sys.argv else 5  # --all lists every overlap for review
    primary = 0
    for page, found in sorted(hits.items()):
        print(f"{page}: {len(found)} T1 shingles")
        for src, sh in sorted(found)[:shown]:
            kind = "BLOCK" if src.startswith(PRIMARY_T1) else "review"
            print(f"    [{kind}] from planning-T1/{src}: \"{sh}\"")
        primary += sum(src.startswith(PRIMARY_T1) for src, _ in found)
    total = sum(len(v) for v in hits.values())
    print(f"{len(t1):,} T1 shingles checked against site/; {total} overlaps ({primary} with original T1 material)")
    return 1 if primary else (3 if total else 0)


def self_test():
    a = "one two three four five six seven eight nine ten eleven"
    assert len(shingles(a)) == 2 and "one two three four five six seven eight nine ten" in shingles(a)
    assert shingles("see https://cig.uw.edu/wp-content/uploads/a/b/c/d/e/f/g/h/i/j.pdf now") == set()
    t = Text()
    t.feed("<p>Visible</p><script>hidden()</script><style>.x{}</style><p>also</p>")
    assert " ".join(t.parts).split() == ["Visible", "also"]
    assert list(json_strings({"a": ["x", {"b": "y"}], "c": 3})) == ["x", "y"]
    print("self-test passed")


if __name__ == "__main__":
    sys.exit(self_test() if "--self-test" in sys.argv else main())
