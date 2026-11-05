#!/usr/bin/env python3
"""Pours the library's composition strip and its page-band figures into site/library/index.html from site/data/library.json.

Built here, not in the browser, so the picture and its counts read without scripts and in print. Idempotent: the field and the bars each sit between
two markers, and the page keeps its own filter row between them. Run it after any change to library.json; tests/test_pages.py fails until the page matches the file.
   python scripts/build_library_strip.py          # write
   python scripts/build_library_strip.py --check  # write nothing; exit 1 if the page is out of date

The words for areas and types are read from site/assets/js/library.js, so the strip and the filters say the same thing. library.js paints the
squares by position, so it and this script list the field the same way: area by area in AREAS order, then in the file's own order.
"""
from html import escape
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
PAGE = ROOT / "site" / "library" / "index.html"
DATA = ROOT / "site" / "data" / "library.json"
SCRIPT = ROOT / "site" / "assets" / "js" / "library.js"
FIGURE = re.compile(r'(data-figure="(library|library-tribal|library-grounding)">)[^<]*')
YEARS_ALONE = 4  # the newest years get a bar each and the rest share "Before YYYY"; library.js adds the same choice to the Year filter


def words(name, script):
    """One label map from library.js."""
    body = re.search(rf"const {name} = \{{(.*?)\n\}};", script, re.S).group(1)
    return dict(re.findall(r"^\s*'?([\w-]+)'?: '([^']+)',$", body, re.M))


def bar(name, value, label, count, total, ink=None):
    """A legend row with a key takes an ink; an empty one keeps the key's place in the column and draws no square."""
    key = '<i class="comp-key"></i>' if ink is not None else ""
    kind = f"comp-row {ink}" if ink else "comp-row"
    noun = "entry" if count == 1 else "entries"
    return (f'<li><a class="{kind}" href="?{name}={value}" data-filter="{name}" data-value="{value}" style="--w:{count / total:.4f}">'
            f'<span class="comp-name">{key}{escape(label)}</span> <span class="comp-n">{count:,}<span class="sr-only"> {noun}</span></span> '
            f'<span class="comp-track"><i></i></span></a></li>')


def group(title, rows, wide=False, note=""):
    kind = "comp-group comp-group-wide" if wide else "comp-group"
    return f'<div class="{kind}"><h3 class="eyebrow">{title}</h3><ul class="comp-bars" role="list">{"".join(rows)}</ul>{note}</div>'


def composition(data, script):
    """The strip's two generated parts by marker: the field, and the bars with what their counts leave out."""
    entries = data["entries"]
    total = len(entries)
    areas, types = words("AREAS", script), words("TYPES", script)
    inks = {area: f"a{slot}" for slot, area in enumerate(areas, 1)}  # chart order, fixed: an area keeps its ink however the list is filtered
    field = "".join(f'<i class="{inks[area]}"></i>' for area in areas for entry in entries if entry["areas"][0] == area)
    several = sum(len(entry["areas"]) > 1 for entry in entries)
    updated = data["updated"]

    # Start here is an Area filter choice in library.js and no area of its own, so it has no ink in the field.
    area_rows = [bar("area", "start-here", "Start here", sum(entry["featured"] for entry in entries), total, "")]
    area_rows += [bar("area", area, label, sum(area in entry["areas"] for entry in entries), total, inks[area]) for area, label in areas.items()]
    counted = {kind: sum(entry["type"] == kind for entry in entries) for kind in types}
    type_rows = [bar("type", kind, types[kind], n, total) for kind, n in sorted(counted.items(), key=lambda item: (-item[1], item[0])) if n]
    years = sorted({entry["date"][:4] for entry in entries}, reverse=True)
    year_rows = [bar("year", year, year, sum(entry["date"].startswith(year) for entry in entries), total) for year in years[:YEARS_ALONE]]
    if len(years) > YEARS_ALONE:
        cut = years[YEARS_ALONE - 1]
        year_rows.append(bar("year", f"before-{cut}", f"Before {cut}", sum(entry["date"] < cut for entry in entries), total))
    tribal = sum(entry["tribal_specific"] for entry in entries)
    tribal_rows = [bar("tribal", "yes", "Tribal-specific", tribal, total), bar("tribal", "no", "General", total - tribal, total)]

    note = (f'<p class="caption comp-note">{several:,} entries list more than one area, so area counts add to more than {total:,}. '
            f'Counted from <a href="../data/library.json">library.json</a>, updated {updated[5:7]}/{updated[8:10]}/{updated[:4]}: what this library holds, not all that is published.</p>')
    field_block = f"""<!-- library-composition -->
        <div class="comp-head">
          <div class="unit-field comp-field" aria-hidden="true">{field}</div>
          <p class="caption">One square per entry, inked by the first area it lists.</p>
        </div>
        <!-- /library-composition -->"""
    bars_block = f"""<!-- library-legend -->
        <a class="skip-link" href="#entries-title">Skip the bars, to the entries</a>
        <div class="comp-groups">
          {group("Area", area_rows)}
          {group("Type", type_rows, wide=True)}
          {group("Year", year_rows)}
          {group("Tribal focus", tribal_rows, note=note)}
        </div>
        <!-- /library-legend -->"""
    return {"library-composition": field_block, "library-legend": bars_block}


def apply(page, data, script):
    """The page with its strip and band figures from the data. Raises if the page has lost a marker."""
    for name, block in composition(data, script).items():
        page, found = re.subn(rf"<!-- {name} -->.*?<!-- /{name} -->", lambda _: block, page, flags=re.S)
        if found != 1:
            raise ValueError(f"site/library/index.html needs one <!-- {name} --> block")
    entries = data["entries"]
    figures = {
        "library": f"{len(entries):,}",
        "library-tribal": f"{sum(entry['tribal_specific'] for entry in entries):,}",
        "library-grounding": f"{sum(entry['featured'] and entry['type'] == 'resolution' for entry in entries):,}",
    }
    return FIGURE.sub(lambda match: match[1] + figures[match[2]], page)


def run(check=False):
    """Writes the page if it is out of date, and returns whether it was; with check, writes nothing."""
    before = PAGE.read_bytes().decode("utf-8")
    after = apply(before, json.loads(DATA.read_text(encoding="utf-8")), SCRIPT.read_text(encoding="utf-8"))
    if after != before and not check:
        PAGE.write_bytes(after.encode("utf-8"))
    return after != before


if __name__ == "__main__":
    checking = "--check" in sys.argv
    stale = run(check=checking)
    print(f"{'out of date' if checking and stale else 'wrote' if stale else 'nothing to do'}: site/library/index.html")
    if checking and stale:
        sys.exit("build_library_strip: run python scripts/build_library_strip.py")
