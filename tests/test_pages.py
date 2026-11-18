"""Summit, Library, and About: the figures each page states and the structure a reader relies on (no network, no browser).

Copy may change. A library count that differs from its file, a first view that needs scripts, a date on the Summit, a lost slot, or a figure without its
claim must fail.
"""
import json
from pathlib import Path
import re
import sys

import pytest

from dom import numbers, parse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_library_strip as strip  # noqa: E402

SITE = ROOT / "site"
DATA = json.loads(strip.DATA.read_text(encoding="utf-8"))
ENTRIES = DATA["entries"]
SCRIPT = strip.SCRIPT.read_text(encoding="utf-8")


def source(rel):
    return (SITE / rel / "index.html").read_text(encoding="utf-8")


def claims():
    out = {}
    for path in (SITE / "data" / "claims").glob("*.json"):
        out.update({c["id"]: c for c in json.loads(path.read_text(encoding="utf-8")).get("claims") or []})
    return out


def selected_by(name, value):
    """What a bar's filter returns, worked out apart from the script that wrote the bar."""
    if name == "area":
        return [e for e in ENTRIES if value in e["areas"]]
    if name == "type":
        return [e for e in ENTRIES if e["type"] == value]
    if name == "tribal":
        return [e for e in ENTRIES if e["tribal_specific"] == (value == "yes")]
    if value.startswith("before-"):
        return [e for e in ENTRIES if int(e["date"][:4]) < int(value[7:])]
    return [e for e in ENTRIES if e["date"][:4] == value]


# Library ----------------------------------------------------------------------------------------------------------------------------------------------

def test_the_library_and_summit_pages_match_their_data():
    assert not strip.run(check=True), "site/library/index.html or site/summit/index.html is out of date: run python scripts/build_library_strip.py"


def test_a_square_for_every_entry_in_its_first_area_ink():
    field = parse(source("library")).one("div", "comp-field")
    assert field.attrs["aria-hidden"] == "true", "the rows carry the counts"
    squares = [node.attrs["class"] for node in field.all("i")]
    assert len(squares) == len(ENTRIES)
    for slot, area in enumerate(strip.words("AREAS", SCRIPT), 1):
        assert squares.count(f"a{slot}") == sum(e["areas"][0] == area for e in ENTRIES), area


def test_every_bar_states_what_its_filter_returns_and_its_share():
    doc = parse(source("library"))
    bars, printed = doc.all("a", "comp-row"), doc.all("a", "comp-n")  # the count is its own link, beside the filter's, to its claim
    assert len(bars) == len(printed)
    assert {bar.attrs["data-filter"] for bar in bars} == {"area", "type", "year", "tribal"}
    assert sum(bar.attrs["data-filter"] == "tribal" for bar in bars) == 2 and sum(bar.attrs["data-filter"] == "area" for bar in bars) == 5
    assert "start-here" not in {bar.attrs["data-value"] for bar in bars}, "Start here is a shelf, not an area (-13)"
    for bar, shown in zip(bars, printed):
        name, value = bar.attrs["data-filter"], bar.attrs["data-value"]
        count = len(selected_by(name, value))
        assert shown.text().split()[0] == f"{count:,}", (name, value)
        assert bar.attrs["href"] == f"#{name}={value}", "a filter rides in the fragment, never a query"
        assert float(bar.style()["--w"]) == pytest.approx(count / len(ENTRIES), abs=0.0001), (name, value)


def test_each_select_offers_the_bars_choices_without_counts():
    doc = parse(source("library"))
    for name in ("area", "type", "year"):
        values = [o.attrs.get("value", "") for o in doc.one("select", id=f"filter-{name}").all("option")]
        bars = [b.attrs["data-value"] for b in doc.all("a", "comp-row") if b.attrs["data-filter"] == name]
        assert values[0] == "" and sorted(values[1:]) == sorted(bars), name
    years = [o.text() for o in doc.one("select", id="filter-year").all("option")]
    assert len(years) == strip.YEARS_ALONE + 2 and years[-1].startswith("Before "), "five year choices that never overlap (-05)"
    assert not any(re.search(r"\(\d", o.text()) for o in doc.all("option")), "a count in a choice would go stale under a filter (-03)"


def test_start_here_is_the_first_view_and_reads_without_scripts():
    doc = parse(source("library"))
    shelves = doc.one("nav", "shelves").all("a")
    assert shelves[0].attrs["data-shelf"] == "start" and shelves[0].attrs.get("aria-current") == "true"
    assert [a.attrs["data-shelf"] for a in shelves] == ["start", "tribal", "new", "filings", "all"], "every shelf is a list, What changed included (critic 5)"
    first = doc.one("div", id="library-results")
    rows = first.all("li", "entry")
    featured = [e for e in ENTRIES if e["featured"]]
    assert [r.attrs["data-entry"] for r in rows] == [e["id"] for g in strip.start_shelf(ENTRIES) for e in g[2]] and len(rows) == len(featured)
    resolutions = sum(e["type"] == "resolution" for e in featured)
    assert [r.one("span", "entry-type").text() for r in rows[:resolutions]] == ["Resolution"] * resolutions, "the grounding resolutions lead (-25)"
    spelled = {5: "five"}[resolutions]  # another grounding resolution changes the status's word too
    assert f"{spelled} resolutions that ground the task forces" in doc.one("p", id="library-status").text()
    static = doc.one("section", "shelf-static").all("li", "entry")
    assert len(rows) + len(static) == 40, "40 entries without scripts (acceptance, -11)"
    assert all(r.one("h3", "entry-title").one("a").attrs["href"] for r in rows + static)
    assert not re.search(r"\d{4}-\d\d-\d\d", " ".join(r.one("p", "entry-summary").text() for r in rows)), "summaries in house dates (home-shell-11d)"
    assert not any(re.search(r"\bSEC\b", r.text()) for r in rows + static), "company filings have their own shelf (-25)"


def test_a_featured_summit_entry_has_a_shelf_group():
    """Summit has no group of its own: a featured entry of Summit alone goes across the task forces, one that lists another area goes there (r2-scripts-3).
    library.js groupsHTML is the twin, and reads the same rule."""
    summit = next(e for e in ENTRIES if e["areas"][0] == "summit" and e["type"] != "resolution")
    alone, also = {**summit, "featured": True, "areas": ["summit"]}, {**summit, "id": f"{summit['id']}-x", "featured": True, "areas": ["summit", "ai"]}
    placed = {e["id"]: key for key, _label, items in strip.start_shelf([alone, also]) for e in items}
    assert placed == {alone["id"]: "cross-cutting", also["id"]: "ai"}
    assert "e.areas.find((a) => Object.hasOwn(by, a)) || 'cross-cutting'" in SCRIPT


def test_the_preview_shows_the_first_entry_and_where_the_site_cites_it():
    doc = parse(source("library"))
    first = doc.one("div", id="library-results").one("li", "entry")
    preview = doc.one("div", id="entry-preview-body").one("div", data_preview=True)
    assert preview.attrs["data-preview"] == first.attrs["data-entry"] and first.attrs.get("aria-current") == "true"
    held = json.loads(doc.one("script", id="library-cites").text())
    known = claims()
    norm = lambda url: strip.norm(url)
    for at, used in held["cites"].items():
        entry = ENTRIES[int(at)]
        for page, *ids in used:
            path = held["pages"][page][0]
            assert (SITE / path / "sources" / "index.html").is_file(), path
            assert all(norm(known[c]["source"]["url"]) == norm(entry["url"]) for c in ids), (entry["id"], ids)
    for link in preview.one("ul", "preview-cites").all("a"):
        target = (SITE / "library" / link.attrs["href"].split("#")[0]).resolve()
        assert target.is_dir() or target.is_file(), link.attrs["href"]
    assert preview.one("a", "paper").text().startswith("Open the document")


def test_the_builder_is_idempotent_and_needs_its_markers(tmp_path):
    names = ["library-composition", "library-legend", "library-options:area", "library-options:type", "library-options:year",
             "library-shelf", "library-static", "library-preview", "library-cites"]
    page = '<span data-figure="library">9</span>' + "".join(f"<!-- {n} --><!-- /{n} -->" for n in names)
    data = {"updated": "2026-01-02", "entries": [
        {"id": "a", "title": "A", "url": "https://x.org/a", "publisher": "P", "summary": "On 2025-03-04.", "areas": ["ai"], "type": "report", "date": "2026-01-02", "tribal_specific": True, "featured": True},
        {"id": "b", "title": "B", "url": "library/b.pdf", "publisher": "P", "summary": "S", "areas": ["summit", "ai"], "type": "resolution", "date": "2020", "tribal_specific": False, "featured": True},
    ]}
    (tmp_path / "data" / "claims").mkdir(parents=True)
    once = strip.apply(page, data, SCRIPT, site=tmp_path)
    assert strip.apply(once, data, SCRIPT, site=tmp_path) == once
    assert '<span data-figure="library">2</span>' in once and "before-" not in once, "with four years or fewer, no year shares a bar"
    assert "03/04/2025" in once and "2025-03-04" not in once
    for name in names:
        with pytest.raises(ValueError, match=name):
            strip.apply(page.replace(f"<!-- {name} -->", ""), data, SCRIPT, site=tmp_path)


def test_reading_order_runs_shelves_list_then_the_collection():
    page = source("library")
    marks = ['class="shelves"', 'class="filters', 'id="library-status"', 'id="library-results"', 'id="entry-preview-body"', "comp-field", "comp-groups", 'id="whats-new"']
    places = [page.index(mark) for mark in marks]
    assert places == sorted(places), "source order is reading order and Tab order, so no CSS may reorder these"
    form = parse(page).one("form", "filters")
    assert "data-js" in form.attrs, "no dead filters without scripts"
    assert "beforeprint" not in SCRIPT and "usDates(e.summary)" in SCRIPT


# Summit -----------------------------------------------------------------------------------------------------------------------------------------------

def test_the_summit_stays_proposed_and_names_no_date():
    doc = parse(source("summit"))
    main = doc.one("main")
    facts = {div.one("dt").text(): div.one("dd").text() for div in main.one("dl", "status-row").all("div")}
    assert facts["Date"].startswith("To be confirmed") and "Proposed for March 2027" in facts["Date"]
    assert facts["Venue"].startswith("To be confirmed") and facts["Table hosts"].startswith("To be confirmed") and facts["Registration"].startswith("Not open")
    assert not re.search(r"\b\d{1,2}/\d{1,2}/\d{4}\b|\bMarch \d{1,2}\b", main.text()), "no day may be stated until ATNI confirms one"


def test_the_summit_track_has_six_stops_over_two_days_and_no_disclosures():
    doc = parse(source("summit"))
    track = doc.one("fieldset", "track")
    steps = track.all("label", "track-step")
    assert [s.one("span", "track-name").text() for s in steps] == ["Plenary", "World café tables", "Close and homework", "Synthesis", "Morning drafting", "Afternoon presentations"]
    assert [s.one("span", "track-when").text().split(",")[0] for s in steps] == ["Day 1"] * 3 + ["Day 2"] * 3
    assert [s.one("span", "track-n").text() for s in steps] == [str(n) for n in range(1, 7)], "numbered, since it is a sequence"
    assert sum("checked" in s.one("input").attrs for s in steps) == 1 and len(track.all("div", "track-detail")) == 6
    assert not doc.one("main").all("details"), "the answers are open, not behind disclosures (-15, -28)"
    assert not [box for box in doc.one("main").all("input") if box.attrs.get("type") == "checkbox"], "no box to tick that nothing reads (critic 7)"
    assert doc.one("dl", "status-row").all(id="registration"), "Dates and registration lands on the status row"


def test_the_summit_reading_list_is_the_librarys():
    doc = parse(source("summit"))
    rows = doc.one("div", "reading-list").all("li", "entry")
    resolutions = [e["id"] for e in ENTRIES if e["featured"] and e["type"] == "resolution"]
    summit = [e["id"] for e in ENTRIES if "summit" in e["areas"] and e["id"] not in resolutions]
    assert sorted(r.attrs["data-entry"] for r in rows) == sorted(resolutions + summit)
    assert all(re.fullmatch(r"\d{4}", r.one("time").text()) for r in rows), "years only on this page"


@pytest.mark.parametrize("page,slots", [
    ("summit", ["summit:hosts", "summit:task-force-inputs", "summit:logistics", "summit:photograph"]),
    ("about", ["about:people", "about:photograph", "about:license"]),
])
def test_slots_stay_in_their_markers(page, slots):
    assert re.findall(r"<!-- SLOT:([a-z-]+:[a-z-]+) -->", source(page)) == slots


@pytest.mark.parametrize("page", ["summit", "about"])
def test_a_photograph_slot_holds_no_image_and_says_consent(page):
    slot = parse(source(page)).one("div", "photo-slot")
    assert not slot.all("img") and "consent" in slot.text() and "In development" in slot.text()


# About ------------------------------------------------------------------------------------------------------------------------------------------------

def test_about_says_in_development_once_for_both_slots():
    doc = parse(source("about"))
    slot = doc.one("div", "photo-slot")
    assert len(doc.all("div", "slot")) == 1 and "agreement" in slot.text() and "consent" in slot.text()
    assert doc.one("main").text().count("In development") == 1


def test_about_years_and_the_claim_track_are_poured_from_verified_claims_and_say_so():
    doc = parse(source("about"))
    known = claims()
    for claim_id, year in (("at-001", "1953"), ("at-002", "1995")):
        record = known[claim_id]
        assert record["status"] == "verified" and record["year"] == int(year) and year in record["quote"]
        assert {node.text() for node in doc.all(data_pour=claim_id)} == {year}
    years = doc.one("p", "about-years")
    assert "verified" in years.text() and "at-001" in years.text() and "at-002" in years.text()
    track = doc.one("fieldset", "about-track")
    record = known["dem-073"]
    poured = {node.attrs.get("data-field"): node.text() for node in track.all(data_pour="dem-073")}
    assert poured["status"] == "verified" == {"verified": "verified"}[record["status"]] and poured["year"] == str(record["year"]) and poured["unit"] == record["unit"]
    assert all(f"{record[k]:,}" in poured["text"] for k in ("value", "low", "high")), "the example keeps its range, as its plate prints it (critic 3)"
    assert "What it leaves out" in track.text()
    assert "dem-073" in track.text() and len(track.all("label", "track-step")) == 5


def test_about_tiers_are_a_stair_with_only_t0_lit():
    stair = parse(source("about")).one("fieldset", "stair")
    steps = stair.all("label", "stair-step")
    assert [s.one("span", "stair-code").text() for s in steps] == ["T0", "T1", "T2", "T3"]
    assert ["is-lit" in s.attrs["class"] for s in steps] == [True, False, False, False]
    assert [s.one("span", "stair-tag").text() for s in steps] == ["What you see here"] + ["Never on this site"] * 3


def test_about_keeps_the_license_terms_the_climate_voice_and_states_what_github_logs():
    doc = parse(source("about"))
    license_text = doc.one("div", "about-license").text()
    for words in ("CC BY-NC-SA 4.0", "ATNI resolutions", "Upstream sources and quoted text", "Site code", "NEX-GDDP-CMIP6"):
        assert words in license_text, words
    assert doc.one("details", "about-nasa").one("summary"), "NASA's long text folds (CD 35)"
    voices = doc.all(cls="climate-voice")
    assert len(voices) == 2 and all(len(node.all("img", "climate-lockup")) == 2 for node in voices), "the Climate sentence and the Credits row, a lockup per theme"
    assert "Climate program" in voices[0].text() and "Design System" in voices[1].text()
    rules = doc.one("dl", "rule-rows").text()
    assert "IP address" in rules and "no outside services" not in doc.one("main").text(), "GitHub's logs are stated, not denied (CD 34, 36)"
    for anchor in ("data-governance", "curation", "license", "credits", "atni"):
        assert doc.all(id=anchor), anchor
