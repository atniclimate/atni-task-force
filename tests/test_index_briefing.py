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


def test_a_section_is_framed_by_real_head_and_foot_rows():
    doc = parse(bb.page_section("packet-plate", 'id="x"', "<p>Body</p>", "11/04/2026"))
    section = doc.one("section", id="x")
    assert section.attrs["data-checked"] == "11/04/2026" and section.one("table").attrs["role"] == "presentation"
    assert section.one("thead").text() == "Settings chosen by the reader, sources checked 11/04/2026." and section.one("tfoot").text() == bb.FOOT


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
    offered = [p for p in index["plates"] if p["page"] in bb.PAGES]
    assert list(held) == [p["id"] for p in offered], "the page holds the plates on offer, and not the two reference copies"
    for plate in offered:
        assert held[plate["id"]] == dict(vp.PLATE_BLOCK.findall((SITE / plate["page"]).read_text(encoding="utf-8")))[plate["id"]], plate["id"]
    assert '<html lang="en" data-address="none">' in page, "the page writes nothing to the address"
    assert page.index("plate-svg.js") < page.index("/plate.js") < page.index("/ai.js")
