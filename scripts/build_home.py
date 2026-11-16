#!/usr/bin/env python3
"""Fills the home page's agenda faces (DIRECTION-R2 section 4, P-home): build-time copies of the plates that answer its questions, each from the task force
page that builds it, and the Data Center page's question sets with their first questions, so home and those pages never disagree and home loads no data.

A face is the plate's block as build_plates.py wrote it into its own page, between <!-- home:face:ID --> and <!-- /home:face:ID --> here, in an element
marked data-copy-of="DIR/#ID": pour_claim_refs.py, validate_public.py, and build_index.py leave a copy to the page it comes from. A link in a copy is
rewritten to reach from the site root what it reached from that page (the collar's Sources link lands on that page's Sources page); an id the copy holds
stays. Every id on the page and every address name (a plate, its view, its settings) must be unique, or the build stops. The figures home's own words name
sit in <span data-m="..."> and are poured from what the copies hold. The agenda's answers (data-answer) are build_plates.py's.

Re-running changes nothing. Run after build_plates.py, and before build_index.py and pour_claim_refs.py:
   python scripts/build_home.py          # write
   python scripts/build_home.py --check  # write nothing; exit 1 if site/index.html is out of date
"""
from collections import Counter
from html import escape
import json
from pathlib import Path
import posixpath
import re
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_plates as bp  # noqa: E402
from build_plates import BuildError  # noqa: E402
import validate_public as vp  # noqa: E402

HOME = vp.SITE / "index.html"
FACES = ("ai-hour", "dc-project", "energy-deadlines")  # the plates home's agenda copies, in its order; each names its own page in its definition
ASKS_PAGE = "data-centers/index.html"  # the question sets, as that page's agenda face lists them with their first questions
ASKS_TARGET = "checklists"  # where "Open the questions" lands on that page: the form holding every set
FACE = re.compile(r"(<!-- home:face:(?P<name>[\w-]+) -->)(.*?)(<!-- /home:face:(?P=name) -->)", re.S)
POUR = re.compile(r'<span data-m="(?P<spec>[^"]+)">[^<]*</span>')
LINK = re.compile(r'(\s(?:href|src))="([^"]*)"')
ID = re.compile(r'\sid="([^"]+)"')
ASK_FIRSTS = re.compile(r'<ul class="ask-firsts"[^>]*>(.*?)</ul>', re.S)
ADD_BUTTON = re.compile(r'\s*<button\b[^>]*\sdata-sheet-add="(q-[a-z0-9-]+)"[^>]*>.*?</button>', re.S)
ASK_SET = re.compile(r'<fieldset class="ask-set"[^>]*\sid="(q-[a-z0-9-]+)"[^>]*>\s*<legend[^>]*>(.*?)</legend>', re.S)
WORDS = ("no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve")


def number_words(n):
    return WORDS[n] if n < len(WORDS) else f"{n:,}"


def block_of(page, plate_id, rel):
    """A plate's block as its page holds it, without its markers: the figure and its data block."""
    start, end = f"<!-- plate:{plate_id} -->", f"<!-- /plate:{plate_id} -->"
    if page.count(start) != 1 or page.count(end) != 1:
        raise BuildError(f"site/{rel} must hold one {start} and one {end}: build it with python scripts/build_plates.py --page {rel}")
    block = page[page.index(start) + len(start):page.index(end)].strip()
    if f'id="plate-data-{plate_id}"' not in block:
        raise BuildError(f"site/{rel}: plate {plate_id} is not built: run python scripts/build_plates.py --page {rel}")
    return block


def rehome(html, source_dir):
    """Each link in a copy reaches from the site root what it reached from its page: an id the copy holds stays, any other anchor goes to that page, and a
    relative path is resolved from that page's folder. A path that would leave the site stops the build."""
    held = set(ID.findall(html))

    def one(match):
        attr, url = match[1], match[2]
        if url.startswith(("http:", "https:", "//", "mailto:", "data:")):
            return match[0]
        if url.startswith("#"):
            return match[0] if url[1:].split("&")[0] in held else f'{attr}="{source_dir}/{url}"'
        path, tail = re.match(r"([^?#]*)(.*)", url, re.S).groups()
        target = posixpath.normpath(posixpath.join(source_dir, path)) if path else source_dir
        if target == ".." or target.startswith("../"):
            raise BuildError(f"a link in the copy from {source_dir}/ leaves the site: {url}")
        if target == ".":
            return f'{attr}="./{tail}"'
        return f'{attr}="{target}{"/" if path.endswith("/") or not path else ""}{tail}"'
    return LINK.sub(one, html)


def plate_face(plate_id, site):
    """One face: the plate's built block from its page, its links rewritten for the root, marked as that page's."""
    definition = json.loads((site / "data" / "plates" / f"{plate_id}.json").read_text(encoding="utf-8"))
    rel = definition["page"]
    source_dir = posixpath.dirname(rel)
    block = rehome(block_of((site / rel).read_text(encoding="utf-8"), plate_id, rel), source_dir)
    names = [plate_id, f"{plate_id}-view", *(c["name"] for c in definition.get("controls") or [])]
    return f'<div class="home-copy" data-copy-of="{source_dir}/#{plate_id}">\n{block}\n</div>', names


def asks_face(site):
    """The question sets as the Data Center page's agenda lists them, each with its first question, without the meeting sheet's Add buttons (home has no
    sheet), then the way to every question and one link that adds every set to a council briefing. Returns the face and its words."""
    page = (site / ASKS_PAGE).read_text(encoding="utf-8")
    listed = ASK_FIRSTS.search(page)
    if not listed:
        raise BuildError(f'site/{ASKS_PAGE}: expected a <ul class="ask-firsts"> of question sets in its agenda face: update ASK_FIRSTS here')
    sets = ADD_BUTTON.findall(listed[1])
    held = dict(ASK_SET.findall(page))
    if not sets or [s for s in sets if s not in held]:
        raise BuildError(f"site/{ASKS_PAGE}: each set its agenda face lists needs its fieldset.ask-set in the page's form.asks; missing {[s for s in sets if s not in held] or 'every set'}")
    if f'id="{ASKS_TARGET}"' not in page:
        raise BuildError(f'site/{ASKS_PAGE} has no id="{ASKS_TARGET}" for "Open the questions" to land on')
    first, last = (re.sub(r"<[^>]+>", "", held[s]).strip() for s in (sets[0], sets[-1]))
    source_dir = posixpath.dirname(ASKS_PAGE)
    items = rehome(ADD_BUTTON.sub("", listed[1]), source_dir)
    face =(f'<div class="home-copy" data-copy-of="{source_dir}/#face-asks">\n<ul class="ask-firsts" role="list">{items}</ul>\n</div>\n'
            f'<p class="home-asks-go"><a class="button button-secondary" href="{source_dir}/#{ASKS_TARGET}">Open the questions</a> '
            f'<a class="button button-secondary" href="briefing/#add={".".join(sets)}">Add all {number_words(len(sets))} to a briefing</a></p>')
    n = number_words(len(sets))
    return face, {"asks:sets": n[:1].upper() + n[1:], "asks:first": first.lower(), "asks:last": last.lower()}


def pour_home(home, site=vp.SITE):
    """The home page with its faces copied and its words poured, and each face's size in bytes."""
    faces, names, words = {}, {}, {}
    for plate_id in FACES:
        faces[plate_id], names[plate_id] = plate_face(plate_id, site)
    faces["asks"], words = asks_face(site)
    found = [m["name"] for m in FACE.finditer(home)]
    if sorted(found) != sorted(faces):
        raise BuildError(f"site/index.html must hold one <!-- home:face:NAME --> marker pair for each of {sorted(faces)}; it holds {found}")
    # One address bar: a plate, its view, and its settings each need a name no other face uses (docs/PLATE-KIT.md, the address).
    taken = Counter(name for plate_names in names.values() for name in plate_names)
    clash = sorted(name for name, n in taken.items() if n > 1 or name in bp.RESERVED_NAMES)
    if clash:
        raise BuildError(f"two faces, or a face and the address, share the names {clash}: rename one plate's control")
    filled = FACE.sub(lambda m: f"{m[1]}\n{faces[m['name']]}\n{m[4]}", home)
    unknown = sorted({m["spec"] for m in POUR.finditer(filled)} - set(words))
    if unknown:
        raise BuildError(f"site/index.html pours words the build does not know: {unknown}")
    filled = POUR.sub(lambda m: f'<span data-m="{m["spec"]}">{escape(words[m["spec"]])}</span>', filled)
    twice = sorted(i for i, n in Counter(ID.findall(filled)).items() if n > 1)
    if twice:
        raise BuildError(f"site/index.html would hold these ids twice: {twice[:8]}: a face's id clashes with the page's own or another face's")
    return filled, {name: len(face.encode("utf-8")) for name, face in faces.items()}


def run(check=False, site=vp.SITE):
    """Writes site/index.html when it is out of date, and returns whether it was, with each face's size."""
    page = Path(site) / "index.html"
    old = page.read_bytes().decode("utf-8")
    new, sizes = pour_home(old, Path(site))
    if new != old and not check:
        page.write_bytes(new.encode("utf-8"))
    return {"out_of_date" if check else "written": new != old, "face_bytes": sizes}


def main():
    checking = "--check" in sys.argv
    try:
        result = run(check=checking)
    except BuildError as error:
        sys.exit(f"build_home: {error}")
    print(json.dumps(result))
    if checking and result["out_of_date"]:
        sys.exit("build_home: run python scripts/build_home.py")


if __name__ == "__main__":
    main()
