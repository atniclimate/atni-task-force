"""Summit, Library, and About: the figures each page states and the structure a reader relies on (no network, no browser).

Copy may change. A library count that differs from its file, a date without "Proposed", a lost slot, or a figure without its claim must fail.
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


def source(rel):
    return (SITE / rel / "index.html").read_text(encoding="utf-8")


def claim(claim_id):
    claims = json.loads((SITE / "data" / "claims" / "atni.json").read_text(encoding="utf-8"))["claims"]
    return next(item for item in claims if item["id"] == claim_id)


def selected_by(name, value):
    """What a bar's filter returns, worked out apart from the script that wrote the bar."""
    if value == "start-here":
        return [e for e in ENTRIES if e["featured"]]
    if name == "area":
        return [e for e in ENTRIES if value in e["areas"]]
    if name == "type":
        return [e for e in ENTRIES if e["type"] == value]
    if name == "tribal":
        return [e for e in ENTRIES if e["tribal_specific"] == (value == "yes")]
    if value.startswith("before-"):
        return [e for e in ENTRIES if int(e["date"][:4]) < int(value[7:])]
    return [e for e in ENTRIES if e["date"][:4] == value]


def test_the_library_page_matches_its_data():
    assert not strip.run(check=True), "site/library/index.html is out of date: run python scripts/build_library_strip.py"


def test_a_square_for_every_entry_in_its_first_area_ink():
    field = parse(source("library")).one("div", "comp-field")
    assert field.attrs["aria-hidden"] == "true", "the rows carry the counts"
    squares = [node.attrs["class"] for node in field.all("i")]
    assert len(squares) == len(ENTRIES)
    for slot, area in enumerate(strip.words("AREAS", strip.SCRIPT.read_text(encoding="utf-8")), 1):
        assert squares.count(f"a{slot}") == sum(e["areas"][0] == area for e in ENTRIES), area


def test_every_bar_states_what_its_filter_returns_and_its_share():
    doc = parse(source("library"))
    bars, printed = doc.all("a", "comp-row"), doc.all("a", "comp-n")  # the count is its own link, beside the filter's, to its claim
    assert len(bars) == len(printed)
    assert {bar.attrs["data-filter"] for bar in bars} == {"area", "type", "year", "tribal"}
    assert sum(bar.attrs["data-filter"] == "tribal" for bar in bars) == 2 and sum(bar.attrs["data-filter"] == "area" for bar in bars) == 6
    for bar, shown in zip(bars, printed):
        name, value = bar.attrs["data-filter"], bar.attrs["data-value"]
        count = len(selected_by(name, value))
        assert shown.text().split()[0] == f"{count:,}", (name, value)
        assert bar.attrs["href"] == f"?{name}={value}"
        assert float(bar.style()["--w"]) == pytest.approx(count / len(ENTRIES), abs=0.0001), (name, value)


def test_start_here_is_the_first_row_under_area_and_the_lead_says_what_it_holds():
    doc = parse(source("library"))
    first = doc.one("div", "comp-group").all("a", "comp-row")[0]
    assert (first.attrs["data-filter"], first.attrs["data-value"]) == ("area", "start-here") and first.one("span", "comp-name").text() == "Start here"
    assert "comp-key" in first.one("i").attrs["class"] and not {"a1", "a2", "a3", "a4", "a5"} & set(first.attrs["class"].split()), "no ink: the field has no square for it"
    spelled = {5: "five"}[sum(e["featured"] and e["type"] == "resolution" for e in ENTRIES)]  # another grounding resolution changes the lead's word too
    assert f"{spelled} resolutions that ground the task forces" in doc.one("p", "lead").text()
    assert doc.one("p", "lead").one("a", data_filter="area").attrs["data-value"] == "start-here"
    assert not doc.one("section", "start-here").all("details"), "its list prints, and on screen the row opens it"


def test_the_band_and_the_note_state_the_file_not_a_typed_number():
    doc = parse(source("library"))
    tribal = sum(e["tribal_specific"] for e in ENTRIES)
    grounding = sum(e["featured"] and e["type"] == "resolution" for e in ENTRIES)
    assert doc.one("span", "figure-num", data_figure="library").text() == f"{len(ENTRIES):,}"
    assert doc.one("span", "figure-num", data_figure="library-tribal").text() == str(tribal)
    assert doc.one("span", "figure-num", data_figure="library-grounding").text() == str(grounding)
    note = doc.one("p", "comp-note")
    several = sum(len(e["areas"]) > 1 for e in ENTRIES)
    updated = f"{DATA['updated'][5:7]}/{DATA['updated'][8:10]}/{DATA['updated'][:4]}"
    assert numbers(note.text())[:2] == [f"{several:,}", f"{len(ENTRIES):,}"] and updated in note.text()
    assert note.all("a")[-1].attrs["href"] == "../data/library.json"


def test_the_strip_builder_is_idempotent_and_needs_its_markers():
    script = strip.SCRIPT.read_text(encoding="utf-8")
    data = {"updated": "2026-01-02", "entries": [
        {"areas": ["ai"], "type": "report", "date": "2026-01-02", "tribal_specific": True, "featured": True},
        {"areas": ["summit", "ai"], "type": "resolution", "date": "2020", "tribal_specific": False, "featured": True},
    ]}
    page = '<span data-figure="library">9</span><!-- library-composition --><!-- /library-composition --><!-- library-legend --><!-- /library-legend -->'
    once = strip.apply(page, data, script)
    assert strip.apply(once, data, script) == once
    assert '<span data-figure="library">2</span>' in once and "before-" not in once, "with four years or fewer, no year shares a bar"
    with pytest.raises(ValueError, match="library-composition"):
        strip.apply("<p>no markers</p>", data, script)
    with pytest.raises(ValueError, match="library-legend"):
        strip.apply("<!-- library-composition --><!-- /library-composition -->", data, script)


def test_the_filter_row_sits_between_the_field_and_the_bars():
    page = source("library")
    marks = ["comp-field", 'class="filters"', 'id="library-status"', "comp-groups", 'id="library-results"']
    places = [page.index(mark) for mark in marks]
    assert places == sorted(places), "source order is reading order and Tab order, so no CSS may reorder these"
    skip = parse(page).one("section", "comp").one("a", "skip-link")
    assert skip.attrs["href"] == "#entries-title" and page.index('id="entries-title"') > page.index("comp-groups"), "the skip link passes the bars"
    css = (SITE / "assets" / "css" / "pages.css").read_text(encoding="utf-8")
    assert "@media (scripting: none) { .library-controls { display: none; } }" in css, "no dead filters without scripts"


def test_the_summit_stays_proposed_and_names_no_date():
    doc = parse(source("summit"))
    main = doc.one("main")
    figures = {li.one("span", "figure-num").text(): li.one("span", "figure-label").text() for li in main.one("ul", "page-band-figures").all("li")}
    assert figures["March 2027"].startswith("Proposed") and "to be confirmed" in figures["March 2027"]
    assert figures["Venue"] == "To be confirmed"
    assert not re.search(r"\b\d{1,2}/\d{1,2}/\d{4}\b|\bMarch \d{1,2}\b", main.text()), "no day may be stated until ATNI confirms one"


def test_the_summit_rail_has_six_stops_in_two_days_and_no_old_furniture():
    doc = parse(source("summit"))
    days = doc.all("section", "flow-day")
    assert [day.one("h3").text().split(":")[0] for day in days] == ["Day 1", "Day 2"]
    assert [[li.one("strong").text() for li in day.all("li")] for day in days] == [
        ["Plenary", "World café tables", "Close and homework"], ["Synthesis", "Morning drafting", "Afternoon presentations"],
    ]
    for gone in ("key-facts", "toc", "agenda", "page-hero"):
        assert not doc.all(cls=gone), gone


@pytest.mark.parametrize("page,slots", [
    ("summit", ["summit:photograph", "summit:hosts", "summit:task-force-inputs", "summit:logistics"]),
    ("about", ["about:people", "about:photograph", "about:license"]),
])
def test_slots_stay_in_their_markers(page, slots):
    assert re.findall(r"<!-- SLOT:([a-z-]+:[a-z-]+) -->", source(page)) == slots


@pytest.mark.parametrize("page", ["summit", "about"])
def test_a_photograph_slot_holds_no_image_and_says_consent(page):
    slot = parse(source(page)).one("div", "photo-slot")
    assert not slot.all("img") and "consent" in slot.text() and "In development" in slot.text()


def test_about_says_in_development_once_for_both_slots():
    doc = parse(source("about"))
    slot = doc.one("div", "photo-slot")
    assert len(doc.all("div", "slot")) == 1 and "agreement" in slot.text() and "consent" in slot.text()
    assert doc.one("main").text().count("In development") == 1


def test_about_years_are_poured_from_verified_claims_and_say_so():
    doc = parse(source("about"))
    for claim_id, year in (("at-001", "1953"), ("at-002", "1995")):
        record = claim(claim_id)
        assert record["status"] == "verified" and record["year"] == int(year) and year in record["quote"]
        poured = doc.all(data_pour=claim_id)
        assert len(poured) == 2 and {node.text() for node in poured} == {year}, "the figure and the sentence"
        figure = next(li for li in doc.one("ul", "about-figures").all("li") if li.one("span", "figure-num").text() == year)
        assert claim_id in figure.text() and "Verified" in figure.text() and figure.one("a").attrs["href"] == record["source"]["url"]


def test_about_keeps_the_license_terms_the_climate_voice_and_the_columns():
    doc = parse(source("about"))
    license_text = doc.one("section", "about-license").text()
    for words in ("CC BY-NC-SA 4.0", "ATNI resolutions", "Upstream sources and quoted text", "Site code"):
        assert words in license_text, words
    voices = doc.all(cls="climate-voice")
    assert len(voices) == 2 and all(len(node.all("img", "climate-lockup")) == 2 for node in voices), "the Climate sentence and the Credits row, a lockup per theme"
    assert "Climate program" in voices[0].text() and "Design System" in voices[1].text()
    assert not doc.all(cls="toc") and not doc.all(cls="key-facts")
    assert [img.attrs["alt"] for img in doc.all("img", "band-lockup")] == ["ATNI Energy", "ATNI Energy"]
    assert [fig.text() for fig in doc.one("ul", "about-figures").all("span", "figure-num")] == ["1953", "1995", "T0 and T1", "None"]
