"""The manifest and the Council Briefing: scripts/build_index.py and scripts/build_briefing.py on small trees, and the real site up to date against them. No browser."""
import json
from pathlib import Path
import sys

import pytest

from dom import parse

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import build_briefing as bb  # noqa: E402
import build_index as bi  # noqa: E402
import build_plates as bp  # noqa: E402
import build_share_cards as cards  # noqa: E402
import validate_public as vp  # noqa: E402

SITE = ROOT / "site"
PAGE = '<!doctype html><main><header><ul><li><span class="figure-num">{band}</span><span class="figure-label">Sources checked</span></li></ul></header><!-- plate:sample -->\nold\n<!-- /plate:sample --></main>'


def small_site(tmp_path, band="11/04/2026"):
    """One claims file, one built plate on its page, and one data file."""
    site = bp.sample_site(tmp_path / "site")
    defn = {**bp.sample_plate(), "page": "ai/index.html", "controls": [{"type": "range", "name": "mw", "label": "MW", "min": 1, "max": 9, "default": 5}]}
    (site / "data" / "plates" / "sample.json").write_text(json.dumps(defn), encoding="utf-8")
    (site / "ai").mkdir()
    (site / "ai" / "index.html").write_text(PAGE.format(band=band) if band else PAGE.split("<header>")[0] + "<!-- plate:sample -->\nold\n<!-- /plate:sample --></main>", encoding="utf-8")
    bp.sources_shell(site / "ai" / "sources" / "index.html")
    (site / "sources" / "index.html").write_text("<main>\n<!-- sources:hub -->\n<!-- /sources:hub -->\n</main>\n", encoding="utf-8")  # the site's own Sources page is the hub
    bp.build(site)
    (site / "data" / "library.json").write_text('{"schema": 1, "updated": "2026-01-01", "entries": []}', encoding="utf-8")
    (site / "data" / "new.json").write_text('{"schema": 1, "tier": "T0"}', encoding="utf-8")
    return site


def test_the_manifest_lists_each_plate_cluster_and_file(tmp_path):
    site = small_site(tmp_path)
    data = bi.manifest(site)
    assert data["schema"] == 1 and data["tier"] == "T0"
    [plate] = data["plates"]
    assert plate["id"] == "sample" and plate["page"] == "ai/index.html" and plate["kind"] == "ladder" and plate["path"] == "data/plates/sample.json"
    assert plate["title"] == "Row A used 0.24 Wh in 2025" and plate["controls"] == [{"name": "mw", "type": "range", "default": 5}]
    assert set(plate["claim_ids"]) == {"s-1", "s-2", "s-3"} and plate["checked"] == "11/04/2026"
    assert data["claims"] == [{"cluster": "sample", "path": "data/claims/sample.json", "count": 3, "verified": 2, "partly": 1}]
    assert {item["path"] for item in data["data"]} == {"data/library.json", "data/new.json"}
    assert next(i for i in data["data"] if i["path"] == "data/library.json")["built_by"] == "scripts/merge_library.py"


def test_a_page_with_no_band_date_takes_the_latest_published_of_its_claims(tmp_path):
    [plate] = bi.manifest(small_site(tmp_path, band=None))["plates"]
    assert plate["checked"] == "08/21/2025"


def test_a_plate_not_built_fails_by_name(tmp_path):
    site = small_site(tmp_path)
    (site / "ai" / "index.html").write_text("<main></main>", encoding="utf-8")
    with pytest.raises(ValueError, match="sample"):
        bi.manifest(site)


def test_a_rebuild_with_nothing_new_leaves_the_file_and_its_date_alone(tmp_path):
    site = small_site(tmp_path)
    path = site / "data" / "index.json"
    assert bi.run(site, check=True) is True and not path.exists()
    assert bi.run(site) is True
    old = json.loads(path.read_text(encoding="utf-8"))
    path.write_text(json.dumps({**old, "built": "01/01/2020"}), encoding="utf-8")
    assert bi.run(site) is False and json.loads(path.read_text(encoding="utf-8"))["built"] == "01/01/2020"
    (site / "data" / "another.json").write_text('{"schema": 1, "tier": "T0"}', encoding="utf-8")
    assert bi.run(site, check=True) is True and bi.run(site) is True
    assert json.loads(path.read_text(encoding="utf-8"))["built"] != "01/01/2020"


def test_the_real_manifest_is_up_to_date_and_passes_the_validator():
    assert bi.run(check=True) is False, "run python scripts/build_index.py"
    errors = []
    assert vp.check_manifest(errors) > 0 and not errors, errors


def test_the_hub_lists_each_sources_page_with_its_plates_and_every_file(tmp_path):
    site = small_site(tmp_path)
    assert bi.run(site) is True and bi.run(site, check=True) is False, "written once, then current: the hub prints no build date"
    hub = parse((site / "sources" / "index.html").read_text(encoding="utf-8"))
    pages = hub.one("section", id="pages")
    assert pages.one("a", href="../ai/sources/") and pages.one("a", href="../ai/sources/#sample"), "the page's Sources page, and its plate there"
    [row] = [tr for tr in pages.all("tr") if tr.all("a", href="../ai/sources/")]
    assert [td.text() for td in row.all("td")] == ["1", "3", "3", "1", "2", "1"], "plates, figures, distinct claims, documents, verified, partly verified"
    assert "Sources checked 11/04/2026." in pages.text() and "3 distinct claims behind the figures on these pages, from 1 document and 1 publisher." in pages.text()
    assert {dt.attrs["id"] for dt in hub.one("section", id="terms").all("dt")} == {f"term-{key}" for key in bi.cr.GLOSSARY}, "an anchor for every term a page can mark"
    files = hub.one("section", id="claim-files")
    assert files.one("a", href="../data/claims/sample.json") and "3 claims in 1 file: 2 verified and 1 partly verified." in files.text()
    assert hub.one("section", id="data-files").one("a", href="../data/new.json")
    (site / "sources" / "index.html").write_text("<main></main>", encoding="utf-8")
    with pytest.raises(bp.BuildError, match="sources:hub"):
        bi.run(site)


def test_the_real_hub_reaches_every_plate_claims_file_and_data_file():
    index = json.loads((SITE / "data" / "index.json").read_text(encoding="utf-8"))
    hub = (SITE / "sources" / "index.html").read_text(encoding="utf-8")
    missing = [p["id"] for p in index["plates"] if f'href="../{p["page"].removesuffix("index.html")}sources/#{p["id"]}"' not in hub]
    missing += [item["path"] for item in index["claims"] + index["data"] if f'href="../{item["path"]}"' not in hub]
    assert not missing, missing
    assert all(f'href="../{rel}"' in hub for rel in ("explorer/sources/", "library/sources/")), "the pages with receipts and no plates"


def test_the_validator_catches_a_missing_or_untiered_file(tmp_path, monkeypatch):
    site = small_site(tmp_path)
    bi.run(site)
    monkeypatch.setattr(vp, "SITE", site)
    errors = []
    vp.check_manifest(errors)
    assert not errors, errors
    (site / "data" / "new.json").write_text('{"schema": 1}', encoding="utf-8")
    vp.check_manifest(errors)
    assert any("does not say tier T0" in e for e in errors)
    errors.clear()
    (site / "data" / "new.json").unlink()
    vp.check_manifest(errors)
    assert any("which is not in site/" in e for e in errors)
    errors.clear()
    (site / "data" / "plates" / "extra.json").write_text("{}", encoding="utf-8")
    vp.check_manifest(errors)
    assert any("does not list extra.json" in e for e in errors)


HERE, SECTIONS = {"sample", "q-water", "sample-source-s-1"}, {"sample": "ai", "q-water": "data-centers"}


@pytest.mark.parametrize("given,want", [
    ('<a href="#sample">x</a>', '<a href="#sample" data-home="../ai/#sample">x</a>'),  # a section on this page, with a way home for when it is not chosen
    ('<a href="#sample-source-s-1">x</a>', '<a href="#sample-source-s-1">x</a>'),  # inside a plate: it travels with the plate
    ('<a href="#rate-change">x</a>', '<a href="../energy/#rate-change">x</a>'),  # an id only the source page has
    ('<a href="potential/?type=solar#tribes">x</a>', '<a href="../energy/potential/?type=solar#tribes">x</a>'),  # a subpage of the source page
    ('<a href="../data/x.json">x</a>', '<a href="../data/x.json">x</a>'),  # a sibling folder resolves unchanged
    ('<a href="https://example.org/a">x</a>', '<a href="https://example.org/a">x</a>'),
])
def test_a_copied_link_still_reaches_what_it_named(given, want):
    assert bb.rehome(given, "energy", HERE, SECTIONS) == want


@pytest.mark.parametrize("given,want", [
    ('<a href="../../assets/x.css">x</a>', '<a href="../assets/x.css">x</a>'),  # two levels down, the site's root is one level up from here
    ('<a href="../">x</a>', '<a href="../data-centers/">x</a>'),  # its parent page
    ('<a href="sources/#ru-hour">x</a>', '<a href="../data-centers/resource-use/sources/#ru-hour">x</a>'),  # its own Sources page
    ('<a href="#water">x</a>', '<a href="../data-centers/resource-use/#water">x</a>'),
])
def test_a_link_copied_from_a_subpage_still_reaches_what_it_named(given, want):
    assert bb.rehome(given, "data-centers/resource-use", HERE, SECTIONS) == want


def test_a_section_is_framed_by_real_head_and_foot_rows():
    doc = parse(bb.page_section("packet-plate", 'id="x"', "<p>Body</p>", "11/04/2026"))
    section = doc.one("section", id="x")
    assert section.attrs["data-checked"] == "11/04/2026" and section.one("table").attrs["role"] == "presentation"
    assert section.one("thead").text() == "Default settings, sources checked 11/04/2026." and section.one("tfoot").text() == bb.FOOT


def test_question_sets_come_from_the_meeting_sheet_form_with_where_they_come_from():
    page = ('<p class="note">Before the form.</p>\n<form class="asks" data-sheet>'
            '<fieldset class="ask-set" id="q-one"><legend>One</legend><ol><li><label><input type="checkbox" name="ask" value="q-one-1"> <span class="ask-q">First? <a class="cr" data-claim="x-1">3</a></span></label></li></ol></fieldset>'
            '<fieldset class="ask-set" id="q-two"><legend>Two</legend><p class="sub">Its own note.</p><ol><li><label><input type="checkbox" name="ask" value="q-two-1"> <span class="ask-q">Second?</span></label></li></ol></fieldset></form>')
    assert bb.question_sets(page) == [("q-one", "One", '\n<li>First? <a class="cr" data-claim="x-1">3</a></li>\n', "Before the form."), ("q-two", "Two", "\n<li>Second?</li>\n", "Its own note.")]
    assert bb.question_sets("<main>no form</main>") == []


def test_the_appendix_lists_each_document_once_with_its_claims_by_status_and_limit():
    claims = {c: {"status": s, "limit": "A limit long enough to say something.", "source": {"url": u, "title": t, "publisher": "P", "published": "2025-05-02"}}
              for c, s, u, t in [("a-1", "verified", "https://b.org", "Beta"), ("a-2", "partly", "https://b.org", "Beta"), ("a-3", "verified", "https://a.org", "Alpha")]}
    cites = {"a-1": [{"status": "verified", "title": "Beta"}, ["p1"], False], "a-2": [{"status": "partly", "title": "Beta"}, ["p1", "q-x"], True], "a-3": [{"status": "verified", "title": "Alpha"}, ["p2"], False]}
    docs = [parse(row) for row in bb.receipt_rows(cites, claims)]
    assert [d.one("a").text() for d in docs] == ["Alpha", "Beta"], "A to Z by title"
    beta = docs[1].one("li", "packet-doc")
    assert beta.attrs["data-for"] == "p1 q-x" and "published 05/02/2025" in beta.text()
    rows = beta.all("li")
    assert [r.attrs["data-for"] for r in rows] == ["p1", "p1 q-x"]
    assert rows[1].one("span", id="src-a-2") and rows[1].text().endswith("partly verified: A limit long enough to say something."), "a mark's claim keeps its anchor; partly verified states its limit"
    assert rows[0].text().endswith("verified") and "limit" not in rows[0].text()


def test_a_packet_estimate_counts_the_cover_each_plate_the_checklists_run_on_and_the_appendix(monkeypatch, tmp_path):
    paper = {"sheets": {"p1": 2, "p2": 3}, "share": {"q1": 0.4, "q2": 0.5, "q3": 0.3}, "cover": {"base": 0.25, "item": 0.06}, "docs_a_sheet": 10}
    assert bb.estimate(paper, ["p1", "p2"], ["q1", "q2", "q3"], 12) == 1 + 5 + 2 + 2, "the cover, two plates, three checklists on two sheets, 12 documents"
    assert bb.estimate(paper, [], ["q1"], 0) == 1 + 1, "a checklist alone takes a sheet, and no appendix without documents"
    monkeypatch.setattr(bb, "SHEETS_FILE", tmp_path / "none.json")
    guessed = bb.measured({"p9": '<tr data-key="a">' * 20}, ["q9"])
    assert guessed["sheets"] == {"p9": 2} and guessed["share"] == {"q9": bb.GUESS_SHARE}, "unmeasured: a guess from the rows, and a share a checklist"


def test_the_real_page_estimates_come_from_the_measure_and_name_every_section():
    paper = json.loads(bb.SHEETS_FILE.read_text(encoding="utf-8"))
    page = (SITE / "briefing" / "index.html").read_text(encoding="utf-8")
    for plate_id, n in paper["sheets"].items():
        assert f'data-packet="{plate_id}"' in page and f'data-sheets="{n}"' in page, plate_id
    assert all(f'id="{list_id}" data-packet="{list_id}"' in page for list_id in paper["share"]), "a share for each checklist on the page"


def test_the_ready_made_packet_is_the_first_plate_of_each_page_then_every_set():
    entries = [{"id": "a1", "page": "ai/index.html"}, {"id": "a2", "page": "ai/index.html"}, {"id": "d1", "page": "data-centers/index.html"}]
    assert bb.ready_ids(entries, ["q-one", "q-two"]) == ["a1", "d1", "q-one", "q-two"]


def test_every_packet_names_what_the_real_page_offers_and_every_plate_says_what_it_answers():
    index = json.loads((SITE / "data" / "index.json").read_text(encoding="utf-8"))
    page = (SITE / "briefing" / "index.html").read_text(encoding="utf-8")
    offered = {p["id"] for p in index["plates"] if p["page"] in bb.PAGES}
    assert offered <= set(bb.ASKS), f"name what these answer in ASKS: {sorted(offered - set(bb.ASKS))}"
    assert all(ask.endswith("?") and "—" not in ask for ask in bb.ASKS.values()), "a question, in house style"
    for key, _, plates, lists in bb.PACKETS:
        assert all(f'id="pick-{i}"' in page for i in [*plates, *lists]), key


def test_a_note_stops_at_its_own_paragraph():
    other = '<p class="dc-wide-note">Another note on another tab.</p><section>much else</section>'
    page = (f'{other}<p class="dc-wide-note">Where these come from.</p>\n<div class="disclosure-grid dc-details" id="checklists">'
            '<details class="disclosure" id="q-one">\n<summary><h3>One</h3></summary>\n<ul>\n<li>First?</li>\n</ul>\n</details></div>')
    note, lists = bb.checklists_of(page)
    assert note == "Where these come from." and lists == [("q-one", "One", "\n<li>First?</li>\n")]
    with pytest.raises(bp.BuildError, match="checklists"):
        bb.checklists_of("<main>no lists</main>")


def test_fill_needs_its_markers_and_a_second_run_changes_nothing():
    page = "<main><!-- briefing:rail -->\nold\n<!-- /briefing:rail --></main>"
    once = bb.fill(page, {"rail": "new"})
    assert "old" not in once and "new" in once and bb.fill(once, {"rail": "new"}) == once
    with pytest.raises(bp.BuildError, match="briefing:packet"):
        bb.fill(page, {"packet": "new"})


def test_a_card_says_what_its_plate_says_and_keeps_to_four_lines():
    assert cards.stale() == [], "run python scripts/build_share_cards.py"
    lockup = cards.lockup_inner(SITE)
    for card in cards.cards_of():
        assert (SITE / "assets" / "img" / "cards" / f"{card['id']}.png").is_file(), card["id"]
        svg = cards.card_svg(card, lockup)
        assert svg.replace(lockup, "").count('fill="#FF914C"') == 1 and "<title>" not in svg, "one needle, beside the lockup's own ink"
        assert 2 <= svg.count("<text") - lockup.count("<text") <= 5, "at most four lines, and the foot"
    assert cards.card_svg({"id": "x", "title": "word " * 20, "foot": "Modeled, 11/2026", "claims": ["a-1"]}, "").count("<text") == 4, "a long sentence steps down a size rather than overrun"
    with pytest.raises(bp.BuildError, match="four lines"):
        cards.card_svg({"id": "x", "title": "word " * 60, "foot": "", "claims": []}, "")


def test_the_real_briefing_is_up_to_date_and_every_plate_it_holds_is_the_built_one():
    assert bb.run(check=True) is False, "run python scripts/build_briefing.py"
    page = (SITE / "briefing" / "index.html").read_text(encoding="utf-8")
    index = json.loads((SITE / "data" / "index.json").read_text(encoding="utf-8"))
    held = dict(vp.PLATE_BLOCK.findall(page))
    offered = sorted((p for p in index["plates"] if p["page"] in bb.PAGES), key=lambda p: list(bb.PAGES).index(p["page"]))
    assert list(held) == [p["id"] for p in offered], "the page holds the plates on offer, in the rail's order, and not the two reference copies"
    for plate in offered:
        assert held[plate["id"]] == dict(vp.PLATE_BLOCK.findall((SITE / plate["page"]).read_text(encoding="utf-8")))[plate["id"]], plate["id"]
    assert '<html lang="en" data-address="none">' in page, "the page writes nothing to the address"
    assert page.index("/briefing.js") < page.index("plate-svg.js") < page.index("/plate.js") < page.index("/ai.js"), "briefing.js hides what is not chosen before the kit starts plates"
