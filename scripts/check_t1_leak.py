"""Local pre-release check: does any verbatim T1 text appear in the public site?

Compares 10-word shingles of T1 working files with the text of site/: each page's visible words,
its script bodies, and its alt, title, aria-label, content, and placeholder attributes; every JSON
string; and the text of scripts, CSV and text files, SVGs, and PDFs. The T1 side reads Markdown,
text, every JSON string, Word documents, and PDFs in planning-T1/, and in files-unsorted/ when it
exists. A shingle that also occurs in a T0 source (public research compilations, extracted
resolutions, released drafts) is not counted, because public text may legitimately repeat it.
A research record under research/intake/ or research/candidates/ counts as released once its https
url and its summary are in site/data/library.json (owner ruling 33, 11/06/2026), so an overlap that
traces only to released records is not a review item; one that any other T1 text holds still is.
Run from the repository root before any push:

    python scripts/check_t1_leak.py

Exit 1 lists each overlap with the T1 file it came from. planning-T1/ exists only on the
owner's machine, so this check cannot run in CI.
"""
from html import unescape
import io
import json
import re
import sys
import zipfile
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
T1 = ROOT / "planning-T1"
UNSORTED = ROOT / "files-unsorted"  # raw downloads awaiting a home: T1 until sorted, and listed for review
SITE = ROOT / "site"
N = 10
# T0 material kept inside the T1 workspace: compilations of public sources and extracted ATNI
# resolutions. Public drafts live outside planning-T1 (work/public-drafts/), so any T1 sentence
# that reaches them, and then the site, is still caught here.
T0_INSIDE_T1 = ("research/", "sources/extracted/2024", "sources/extracted/2026", "sources/extracted/Res-")
# The Intake pulls and the library candidates sit under research/ but are T1 working files (CLAUDE.md).
T1_INSIDE_T0 = ("research/intake/", "research/candidates/")
# Original T1 material (verbatim exports and cleaned notes): any overlap blocks (exit 1). Derived
# planning documents routinely quote public text, so their overlaps are listed for review (exit 3).
PRIMARY_T1 = ("sources/", "ai-notes/cleaned/")
WORD_ATTRS = {"alt", "title", "aria-label", "content", "placeholder"}  # words a screen reader or a link preview shows


def words(text):
    # URLs are public addresses, not prose; their path segments would form false shingles.
    return re.findall(r"[a-z0-9]+", re.sub(r"https?://\S+|www\.\S+", " ", text.lower()))


def shingles(text):
    w = words(text)
    return {" ".join(w[i:i + N]) for i in range(len(w) - N + 1)}


class Text(HTMLParser):
    """A page's visible words in parts; each script body and each worded attribute is a text of its own in texts."""

    def __init__(self):
        super().__init__()
        self.parts, self.skip, self.texts, self.script = [], 0, [], None

    def handle_starttag(self, tag, attrs):
        self.skip += tag in ("script", "style")
        self.texts += [value for name, value in attrs if name in WORD_ATTRS and value]
        if tag == "script":
            self.script = []

    def handle_endtag(self, tag):
        self.skip -= tag in ("script", "style") and self.skip > 0
        if tag == "script" and self.script is not None:
            self.texts += script_texts("".join(self.script))
            self.script = None

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)
        elif self.script is not None:
            self.script.append(data)


def json_strings(node):
    if isinstance(node, str):
        yield node
    elif isinstance(node, dict):
        for v in node.values():
            yield from json_strings(v)
    elif isinstance(node, list):
        for v in node:
            yield from json_strings(v)


def script_texts(body):
    """A JSON data block gives its strings, each a text of its own; any other script is one text."""
    try:
        return list(json_strings(json.loads(body)))
    except ValueError:
        return [body]


def pdf_text(path):
    import fitz  # PyMuPDF, as scripts/validate_public.py reads PDFs

    with fitz.open(path) as pdf:
        return "\n".join(page.get_text() for page in pdf)


def docx_text(path):
    """A Word document's body: runs join within a paragraph, and paragraphs, tabs, and breaks part words."""
    with zipfile.ZipFile(path) as docx:
        xml = docx.read("word/document.xml").decode("utf-8")
    return unescape(re.sub(r"<[^>]+>", "", re.sub(r"</w:p>|<w:(?:tab|br|cr)\b[^>]*/>", " ", xml)))


def site_text(site=SITE):
    """Yield (path, texts); each JSON string, script body, and worded attribute is its own text so adjacent fields never join."""
    for p in sorted(site.rglob("*")):
        suffix = p.suffix.lower()
        if suffix == ".html":
            t = Text()
            t.feed(p.read_text(encoding="utf-8"))
            yield p, [" ".join(t.parts), *t.texts]
        elif suffix == ".json":
            yield p, list(json_strings(json.loads(p.read_text(encoding="utf-8"))))
        elif suffix in (".js", ".csv", ".txt", ".svg"):
            yield p, [p.read_text(encoding="utf-8", errors="replace")]
        elif suffix == ".pdf":
            yield p, [pdf_text(p)]


def t1_texts(path):
    """The texts of one T1 file; each JSON string is its own text."""
    suffix = path.suffix.lower()
    if suffix == ".json":
        return list(json_strings(json.loads(path.read_text(encoding="utf-8"))))
    if suffix in (".md", ".txt"):
        return [path.read_text(encoding="utf-8", errors="replace")]
    if suffix == ".docx":
        return [docx_text(path)]
    if suffix == ".pdf":
        return [pdf_text(path)]
    return []


def library_urls(site=SITE):
    """The https urls that site/data/library.json lists with a summary. N8 rewrote the 11/05 merge's summaries for the library, and ruling 33 covers those
    entries, so a record is matched by its url wherever the library gives that url a summary of its own."""
    path = site / "data" / "library.json"
    if not path.is_file():
        return set()
    entries = json.loads(path.read_text(encoding="utf-8")).get("entries") or []
    return {e["url"] for e in entries if str(e.get("url") or "").startswith("https://") and str(e.get("summary") or "").strip()}


def research_texts(path, released):
    """A research file's strings, less those of each record the library has released (ruling 33): a record with a summary whose https url it lists."""
    data = json.loads(path.read_text(encoding="utf-8"))
    records = data if isinstance(data, list) else [data]
    held = [r for r in records if not (isinstance(r, dict) and str(r.get("summary") or "").strip() and r.get("url") in released)]
    return [s for r in held for s in json_strings(r)]


def main(t1=T1, site=SITE, unsorted=UNSORTED):
    if not t1.is_dir():
        sys.exit("planning-T1/ not found: run this on the owner's machine")
    found_in, t0, released = {}, set(), library_urls(site)
    allow = t1 / "leak-allowlist.txt"  # overlaps a person reviewed as public facts; one shingle per line
    if allow.is_file():
        t0 |= {ln.strip() for ln in allow.read_text(encoding="utf-8").splitlines() if ln.strip() and ln[0] != "#"}
    primary = tuple(f"{t1.name}/{p}" for p in PRIMARY_T1)
    files = sorted((p.relative_to(root.parent).as_posix(), p, root) for root in (t1, unsorted) if root.is_dir() for p in root.rglob("*") if p.is_file())
    files.sort(key=lambda f: not f[0].startswith(primary))  # original T1 first: a shingle it shares with a derived file is labeled by it, and blocks
    for label, p, root in files:
        rel = p.relative_to(root).as_posix()
        if (root == t1 and rel == "leak-allowlist.txt") or p.name.startswith("~$"):  # ~$ is Word's lock file beside an open document
            continue
        research = root == t1 and rel.startswith(T1_INSIDE_T0) and p.suffix.lower() == ".json"
        texts = research_texts(p, released) if research else t1_texts(p)  # a released record's words are T0; only they leave the comparison
        if root == t1 and rel.startswith(T0_INSIDE_T1) and not rel.startswith(T1_INSIDE_T0):
            t0.update(*map(shingles, texts))
            continue
        for text in texts:
            for sh in shingles(text):
                found_in.setdefault(sh, label)
    hits = {}
    for page, texts in site_text(site):
        for sh in set().union(*map(shingles, texts)):
            if sh in found_in and sh not in t0:
                hits.setdefault(page.relative_to(site.parent).as_posix(), set()).add((found_in[sh], sh))
    shown = None if "--all" in sys.argv else 5  # --all lists every overlap for review
    blocking = 0
    for page, found in sorted(hits.items()):
        print(f"{page}: {len(found)} T1 shingles")
        for src, sh in sorted(found, key=lambda f: (not f[0].startswith(primary), f))[:shown]:
            kind = "BLOCK" if src.startswith(primary) else "review"
            print(f"    [{kind}] from {src}: \"{sh}\"")
        blocking += sum(src.startswith(primary) for src, _ in found)
    total = sum(len(v) for v in hits.values())
    print(f"{len(found_in):,} T1 shingles checked against site/; {total} overlaps ({blocking} with original T1 material)")
    return 1 if blocking else (3 if total else 0)


def self_test():
    a = "one two three four five six seven eight nine ten eleven"
    assert len(shingles(a)) == 2 and "one two three four five six seven eight nine ten" in shingles(a)
    assert shingles("see https://cig.uw.edu/wp-content/uploads/a/b/c/d/e/f/g/h/i/j.pdf now") == set()
    t = Text()
    t.feed('<p>Visible</p><script>hidden()</script><style>.x{}</style><p>also</p><img alt="Alt words"><script type="application/json">{"a": "data"}</script>')
    assert " ".join(t.parts).split() == ["Visible", "also"] and t.texts == ["hidden()", "Alt words", "data"], t.texts
    assert list(json_strings({"a": ["x", {"b": "y"}], "c": 3})) == ["x", "y"]
    doc = io.BytesIO()
    with zipfile.ZipFile(doc, "w") as z:
        z.writestr("word/document.xml", "<w:p><w:r><w:t>Tri</w:t></w:r><w:r><w:t>bal words</w:t></w:r></w:p><w:p><w:r><w:t>next&amp;</w:t></w:r></w:p>")
    assert docx_text(doc).split() == ["Tribal", "words", "next&"]
    print("self-test passed")


if __name__ == "__main__":
    sys.exit(self_test() if "--self-test" in sys.argv else main())
