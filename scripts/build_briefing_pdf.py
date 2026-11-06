#!/usr/bin/env python3
"""Builds site/briefing/atni-energy-briefing.pdf, the Council Briefing's default packet, and writes its link on the Briefing page between <!-- briefing:pdf --> markers, with the pages and
size read from the file.

The page itself starts with nothing chosen, and every plate and checklist at its defaults ran to 153 pages and 3.1 MB on 11/05/2026, so the default packet is the first plate each page
lists and every checklist, each at its defaults (30 pages and 0.7 MB that day). scripts/briefing_pdf_print.js prints it with headless Chrome from the Briefing's own scripts, as Print
packet does. This script then stamps the PDF with a hash (Keywords, packet-sha256=) of the packet's HTML, the cover's note, the renderer, and the stylesheets, scripts, fonts, and marks the
page draws with, and reads the file back: every sheet says "Default settings" and the day it was built, every link leaves for an https address, every font is in the file, the file is
tagged with a language, and every outline title reads as its heading does. Run after scripts/build_briefing.py:
   python scripts/build_briefing_pdf.py           # needs Chrome and Playwright, as scripts/capture.js does; leaves the PDF alone when nothing it was built from has changed (--force prints it again)
   python scripts/build_briefing_pdf.py --check   # needs no browser; exit 1 and name the fix if any of those, or the link on the page, has moved since the PDF was built
Add --site DIR to either to work on a copy of site/.
"""
import datetime
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import build_briefing as bb  # noqa: E402
import build_plates as bp  # noqa: E402
import validate_public as vp  # noqa: E402

SITE = ROOT / "site"
NAME = "atni-energy-briefing.pdf"
RENDERER = ROOT / "scripts" / "briefing_pdf_print.js"
BASE = f"{vp.OWN_ORIGIN}briefing/"
FIX = "python scripts/build_briefing_pdf.py"
AUTHOR = "ATNI Energy Task Forces"
CREATOR = "scripts/build_briefing_pdf.py, with headless Chrome"
FAMILIES = ("NotoSans", "LeagueSpartan")  # the design system's body and display faces
HASH = re.compile(r"packet-sha256=([0-9a-f]{64})")
PACKET = re.compile(r"<!-- briefing:packet -->(.*?)<!-- /briefing:packet -->", re.S)
DATA_PACKET = re.compile(r'<section class="packet-page[^>]*?\sdata-packet="([^"]+)"')
SHEETS = re.compile(r'<link\b(?=[^>]*\brel="stylesheet")[^>]*\bhref="([^"?#]+)"')
SCRIPTS = re.compile(r'<script\b[^>]*\bsrc="([^"?#]+)"')
IMAGES = re.compile(r'<img\b[^>]*\bsrc="(?![a-z]+:)([^"?#]+)"')  # the header lockups
MARKS = re.compile(r'url\(\s*["\']?([^"\')?#]+\.(?:woff2|svg))')  # photographs behind a header are not printed


def pdf_path(site=SITE):
    return Path(site) / "briefing" / NAME


def note():
    """What the cover says of the packet, which the Briefing's own cover cannot, since on the page nothing is chosen until the reader ticks it; and where the claim ids are."""
    pages = list(bb.PAGES.values())
    return (f"This is the default packet: the lead plate from each of the {', '.join(pages[:-1])}, and {pages[-1]} pages, and every checklist, all at their default settings. "
            "Each plate is followed by its Sources pages, which list each claim id with its source, status, and limit.")


def sections(site=SITE):
    """Each section of the packet as the build makes it, with its data-packet id (the cover has none), in order."""
    packet = PACKET.search(bb.built(site)[1])[1]
    chunks = [chunk for chunk in re.split(r'(?=<section class="packet-page )', packet) if chunk.strip()]
    return [(found[1] if (found := DATA_PACKET.match(chunk)) else None, chunk) for chunk in chunks]


def default_ids(site=SITE):
    """The first plate each page lists, in the rail's order, and then every checklist."""
    index = json.loads((Path(site) / "data" / "index.json").read_text(encoding="utf-8"))
    first = {}
    for plate in index["plates"]:
        if plate["page"] in bb.PAGES:
            first.setdefault(plate["page"], plate["id"])
    return [*first.values(), *(i for i, chunk in sections(site) if i and 'class="packet-page packet-checklist"' in chunk)]


def drawn_with(site=SITE):
    """The files the PDF is drawn with, as the Briefing's own page names them: its stylesheets, scripts, and images, and the fonts and marks the stylesheets name."""
    base = Path(site) / "briefing"
    page = (base / "index.html").read_text(encoding="utf-8")
    found = set()
    for ref in [*SHEETS.findall(page), *SCRIPTS.findall(page), *IMAGES.findall(page)]:
        path = (base / ref).resolve()
        found.add(path)
        if path.suffix == ".css" and path.is_file():
            found.update((path.parent / mark).resolve() for mark in MARKS.findall(path.read_text(encoding="utf-8")))
    return sorted(path for path in found if path.is_file())


def drawn_with_digest(site=SITE):
    """One line a file: its place in site/ and the hash of its bytes, with line ends made alike so a checkout's own do not matter (fonts are binary)."""
    root = Path(site).resolve()
    lines = []
    for path in drawn_with(site):
        data = path.read_bytes()
        if path.suffix != ".woff2":
            data = data.replace(b"\r\n", b"\n")
        lines.append(f"{path.relative_to(root).as_posix()} {hashlib.sha256(data).hexdigest()}")
    return "\n".join(lines)


def content_hash(site=SITE, ids=None):
    """The packet's HTML for the default sections, the plates it names, the cover's note, the renderer's text, and what the page is drawn with, so a change to any of them leaves the PDF
    behind. The build day is not in it."""
    ids = ids or default_ids(site)
    html = "\n".join(chunk for i, chunk in sections(site) if i is None or i in ids)
    return hashlib.sha256("\n".join([RENDERER.read_text(encoding="utf-8"), note(), drawn_with_digest(site), ",".join(ids), html]).encode("utf-8")).hexdigest()


def facts(path):
    """What the PDF says of itself: its pages, its bytes, and the hash it was built from ('' for a file that has none)."""
    import fitz

    with fitz.open(path) as doc:
        found = HASH.search(doc.metadata.get("keywords") or "")
        return {"pages": doc.page_count, "bytes": Path(path).stat().st_size, "hash": found[1] if found else ""}


def link_html(have):
    size = f"{have['bytes'] / 1e6:.1f} MB"  # decimal megabytes, as the word is read; the budget line is in KB of 1024
    return (f'<p class="caption packet-pdf"><a href="{NAME}">Download the default packet (PDF, {have["pages"]} pages, {size})</a>. '
            "It holds the first plate each page lists and every checklist, all at their default settings.</p>")


def link_is_current(site, have):
    page = (Path(site) / "briefing" / "index.html").read_bytes().decode("utf-8")
    return bb.fill(page, {"pdf": link_html(have)}) == page


def stale(site=SITE, pdf=None):
    """What has left the PDF behind: nothing, or sentences that say what."""
    path = Path(pdf) if pdf else pdf_path(site)
    if not path.is_file():
        return [f"{path.name} is not in {path.parent}"]
    try:
        have = facts(path)
    except (RuntimeError, ValueError) as error:  # PyMuPDF raises these for a file that will not open
        return [f"{path.name} will not open: {error}"]
    out = []
    if not have["hash"]:
        out.append(f"{path.name} carries no packet hash")
    elif have["hash"] != content_hash(site):
        out.append(f"the packet, the renderer, or the stylesheets, scripts, and fonts it is drawn with have changed since {path.name} was built")
    if not link_is_current(site, have):
        out.append(f"the link on briefing/index.html does not match {path.name}: {have['pages']} pages, {have['bytes']:,} bytes")
    return out


def render(site, ids, date, out):
    node = shutil.which("node")
    if not node:
        raise bp.BuildError("node is not on PATH; it drives Chrome through Playwright")
    done = subprocess.run([node, str(RENDERER), "--out", str(out), "--ids", ",".join(ids), "--date", date, "--base", BASE, "--note", note(), "--site", str(site)], capture_output=True, text=True, encoding="utf-8", check=False)
    if done.returncode:
        raise bp.BuildError(f"Chrome could not print the packet: {(done.stderr or done.stdout).strip()}")


def stamp(path, digest, date):
    """Chrome sets the Title from the page; the rest of the file's own account of itself is set here, with the hash in Keywords."""
    import fitz

    with fitz.open(path) as doc:
        doc.set_metadata({**doc.metadata, "author": AUTHOR, "creator": CREATOR,
                          "subject": f"The Council Briefing's default packet: the first plate each page lists and every checklist, at default settings. Built {date}.",
                          "keywords": f"ATNI Energy Task Forces, Council Briefing, default packet, packet-sha256={digest}"})
        doc.saveIncr()


def verify(path, date):
    """The promises made of the sheet, read back from the file. Returns what is wrong and, apart, what is only unlike the design system."""
    import fitz

    errors, notes = [], []
    with fitz.open(path) as doc:
        if not (doc.metadata.get("title") or "").strip():
            errors.append("the PDF has no title")
        catalog = doc.pdf_catalog()  # all that is claimed of its accessibility: tagged, with a title and a language
        if doc.xref_get_key(catalog, "Lang")[0] == "null":
            errors.append("the PDF names no language")
        if "true" not in doc.xref_get_key(catalog, "MarkInfo")[1] or doc.xref_get_key(catalog, "StructTreeRoot")[0] == "null":
            errors.append("the PDF is not tagged")
        said = [" ".join(page.get_text().split()) for page in doc]
        if " ".join(note().split()) not in said[0]:
            errors.append("the cover does not say what the packet holds and where the claim ids are")
        for _, title, number in doc.get_toc():  # an outline title reads as its heading does on the page (a heading may run on to the next one)
            if " ".join(title.split()) not in " ".join(said[number - 1:number + 1]):
                errors.append(f'outline title "{title[:60]}" does not read as page {number} does')
        for number, page in enumerate(doc, 1):
            text = said[number - 1]
            if "Default settings," not in text or f"Built {date}." not in text:
                errors.append(f"page {number} does not carry its guard line with the default settings and the build day")
            if f"Page {number} of {doc.page_count}" not in text:
                errors.append(f"page {number} does not carry its page number, which Chrome 131 and later sets in the page margin")
            errors.extend(f"page {number}: a link goes to {link['uri']}, which is not https" for link in page.get_links() if link.get("uri") and not link["uri"].startswith("https://"))
        fonts = {(font[3].split("+")[-1], font[1], font[2]) for page in doc for font in page.get_fonts()}
    errors.extend(f"{name} is not embedded in the PDF" for name, ext, kind in sorted(fonts) if ext == "n/a" and kind != "Type3")
    notes.extend(f"{name} is not one of the design system's faces" for name, _, _ in sorted(fonts) if name and not name.startswith(FAMILIES))
    check = []
    vp.check_pdf(path, f"briefing/{NAME}", check)
    return errors + check, notes


def warn_over_budget(size):
    caps = json.loads((ROOT / "tests" / "budgets.json").read_text(encoding="utf-8")).get("files_kb", {})
    cap = caps.get(f"site/briefing/{NAME}")
    if cap and size / 1024 > cap:
        print(f"WARNING OVER BUDGET: {NAME} is {size / 1024:,.0f} KB of its {cap:,} KB budget. Choose a smaller default packet, or raise its line in tests/budgets.json with a reason.", file=sys.stderr)


def build(site=SITE, force=False):
    """Prints the PDF if its packet has changed (or force), and keeps the link on the page true to the file. Returns what it did."""
    site = Path(site)
    if bb.run(site, check=True):
        raise bp.BuildError("the Briefing is behind its plates: run python scripts/build_briefing.py first")
    ids, path = default_ids(site), pdf_path(site)
    digest = content_hash(site, ids)
    printed = force or not path.is_file() or facts(path)["hash"] != digest
    if printed:
        date = datetime.date.today().strftime("%m/%d/%Y")
        with tempfile.TemporaryDirectory() as tmp:
            raw = Path(tmp) / NAME
            render(site, ids, date, raw)
            stamp(raw, digest, date)
            errors, notes = verify(raw, date)
            if errors:
                raise bp.BuildError("the PDF does not keep its promises:\n  " + "\n  ".join(errors[:12]))
            for note in notes:
                print(f"note: {note}", file=sys.stderr)
            shutil.copyfile(raw, path)
    have = facts(path)
    page = site / "briefing" / "index.html"
    old = page.read_bytes().decode("utf-8")
    new = bb.fill(old, {"pdf": link_html(have)})
    if new != old:
        page.write_bytes(new.encode("utf-8"))
    warn_over_budget(have["bytes"])
    return {"printed": printed, "link_written": new != old, "plates": ids, **have}


if __name__ == "__main__":
    args = sys.argv[1:]
    where = Path(args[args.index("--site") + 1]) if "--site" in args else SITE
    try:
        if "--check" in args:
            behind = stale(where)
            print(json.dumps({"stale": behind, "plates": default_ids(where)}))
            sys.exit(f"build_briefing_pdf: run {FIX}: {'; '.join(behind)}" if behind else 0)
        print(json.dumps(build(where, force="--force" in args)))
    except (bp.BuildError, OSError) as error:
        sys.exit(f"build_briefing_pdf: {error}")
