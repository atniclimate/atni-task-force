"""The Intake route and What's New, on a scratch copy of the site's data and two pages (no network, no sheet, no browser).

A row with no owner's mark must stop the batch, a forbidden string must be flagged and refused, and a mark must not survive an edit. The feed must not fill with one burst.
"""
import csv
import json
from pathlib import Path
import shutil
import sys

import pytest

from dom import parse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import build_library_strip as strip  # noqa: E402
import build_whats_new as feed  # noqa: E402
import intake_pull as intake  # noqa: E402
import merge_library  # noqa: E402

BANNER = ["Public sources only. No fact about a specific Nation, project, place, or negotiation."]
MARK = "PF 11/05/2026"
PAGE = b"<html><body><p>The study found that  a median prompt used \xe2\x80\x9c0.24 watt-hours\xe2\x80\x9d of energy.</p></body></html>"


def library_row(**values):
    return {"title": "A Public Report on Load Growth", "url": "https://example.org/load-growth", "publisher": "Example Agency", "date": "2026-10-01", "type": "report", "area": "data-centers",
            "more_areas": "ai", "tribal_specific": "no", "summary": "Describes forecast load growth in general terms.", "submitted_by": "A Manager", "public_source": "yes", "cleared": "", "landed": "", **values}


def news_row(**values):
    return {"date": "2026-11-05", "headline": "An Agency Posts a Public Notice", "url": "https://example.org/notice", "one_line": "A notice is out.", "area": "ai",
            "submitted_by": "A Manager", "public_source": "yes", "cleared": "", "landed": "", **values}


def claim_row(**values):
    return {"entity": "A model", "metric": "energy per prompt", "value": "0.24", "low": "", "high": "", "unit": "Wh", "year": "2026", "boundary": "the data center", "source_title": "A study",
            "publisher": "Example Lab", "url": "https://example.org/study", "published": "2026-01-02", "kind": "preprint", "quote": "a median prompt used \"0.24 watt-hours\" of energy", "cluster": "footprint",
            "submitted_by": "A Manager", "public_source": "yes", "cleared": "", "landed": "", **values}


def write_csv(folder, tab, rows):
    path = folder / f"{tab}.csv"
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(BANNER)
        writer.writerow(intake.COLUMNS[tab])
        writer.writerow(["EXAMPLE: " + intake.COLUMNS[tab][0]] + [""] * (len(intake.COLUMNS[tab]) - 1))
        writer.writerows([row[column] for column in intake.COLUMNS[tab]] for row in rows)
    return path


@pytest.fixture
def site(tmp_path, monkeypatch):
    """A scratch site/data and the two poured pages, with every module pointed at them and no network."""
    scratch = tmp_path / "site"
    shutil.copytree(ROOT / "site" / "data", scratch / "data")
    for rel in ("index.html", "library/index.html", "assets/js/library.js"):
        (scratch / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(ROOT / "site" / rel, scratch / rel)
    monkeypatch.setattr(merge_library, "LIBRARY", scratch / "data" / "library.json")
    monkeypatch.setattr(strip, "DATA", scratch / "data" / "library.json")
    monkeypatch.setattr(strip, "PAGE", scratch / "library" / "index.html")
    monkeypatch.setattr(strip, "SCRIPT", scratch / "assets" / "js" / "library.js")
    monkeypatch.setattr(feed, "SITE", scratch)
    monkeypatch.setattr(merge_library, "check", lambda url: 200)
    monkeypatch.setattr(intake, "public_host", lambda url: True)
    monkeypatch.setattr(intake, "fetch_bytes", lambda url: PAGE)
    return scratch


def pull(folder, *files, terms=None):
    return intake.pull(list(files), folder / "intake", "2026-11-05", terms or folder / "no-terms.txt", "a test")


def candidates(out, tab):
    return json.loads((out / f"candidates-{tab}.json").read_text(encoding="utf-8"))


def merge(monkeypatch, path, *flags):
    monkeypatch.setattr(sys, "argv", ["merge_library.py", str(path), "--added", "2026-11-05", *flags])
    return merge_library.main()


def library_of(site):
    return json.loads((site / "data" / "library.json").read_text(encoding="utf-8"))


def test_a_dry_run_lands_rows_end_to_end_on_a_scratch_copy(site, tmp_path, monkeypatch):
    before = len(library_of(site)["entries"])
    tabs = lambda mark: [write_csv(tmp_path, "library", [library_row(cleared=mark)]), write_csv(tmp_path, "news", [news_row(cleared=mark)]), write_csv(tmp_path, "claims", [claim_row(cleared=mark)])]
    first = pull(tmp_path, *tabs(""))
    assert (first / "REPORT.md").is_file() and (first / "snapshot-library.csv").is_file() and (first / "manifest.json").is_file()
    second = pull(tmp_path, *tabs(MARK))
    assert second != first, "a second pull in a day keeps the first snapshot"

    merge(monkeypatch, second / "candidates-library.json", "--require-cleared")
    entries = library_of(site)["entries"]
    landed = entries[-1]
    assert len(entries) == before + 1
    assert (landed["url"], landed["tier"], landed["added"], landed["areas"]) == ("https://example.org/load-growth", "T0", "2026-11-05", ["data-centers", "ai"])
    assert not set(landed) & {"cleared", "submitted_by", "flags", "key", "row_hash", "public_source"}, "T1 bookkeeping stays out of the public file"
    assert not strip.run(check=True), "the merge rebuilt the strip, so tests/test_pages.py stays true"
    assert list(csv.reader((second / "landed-library.csv").open(encoding="utf-8")))[1][1:] == ["https://example.org/load-growth", "2026-11-05"]

    built = feed.build("2026-11-05", [second / "candidates-news.json"])
    news = [row for row in built["items"] if row["kind"] == "news"]
    assert news == [feed.item("2026-11-05", "news", "An Agency Posts a Public Notice", "https://example.org/notice", "ai")]
    home = parse((site / "index.html").read_text(encoding="utf-8"))
    assert "An Agency Posts a Public Notice" in home.one("ol", "whats-new-rows").text()
    assert "A notice is out" not in json.dumps(built), "the one line stays in the T1 record"
    assert any(row["kind"] == "news" for row in feed.build("2026-11-05")["items"]), "a rebuild carries landed News forward"

    assert [claim["status"] for claim in candidates(second, "claims")] == ["unverified"], "a quote that matches clears nothing"
    assert candidates(second, "claims")[0]["quote_check"] == "found"
    assert not (site / "data" / "claims" / "candidates-claims.json").exists()


def test_a_row_without_cleared_fails_and_writes_nothing(site, tmp_path, monkeypatch):
    out = pull(tmp_path, write_csv(tmp_path, "library", [library_row()]))
    before = (site / "data" / "library.json").read_bytes()
    with pytest.raises(SystemExit, match="not cleared"):
        merge(monkeypatch, out / "candidates-library.json", "--require-cleared")
    assert (site / "data" / "library.json").read_bytes() == before


def test_intake_rows_cannot_skip_the_gate(site, tmp_path, monkeypatch):
    out = pull(tmp_path, write_csv(tmp_path, "library", [library_row()]))
    with pytest.raises(SystemExit, match="require-cleared"):
        merge(monkeypatch, out / "candidates-library.json")


def test_a_declined_row_does_not_land_and_does_not_stop_the_batch(site, tmp_path, monkeypatch):
    before = len(library_of(site)["entries"])
    pull(tmp_path, write_csv(tmp_path, "library", [library_row()]))
    out = pull(tmp_path, write_csv(tmp_path, "library", [library_row(cleared="no " + MARK)]))
    merge(monkeypatch, out / "candidates-library.json", "--require-cleared")
    assert len(library_of(site)["entries"]) == before


def test_a_row_with_a_forbidden_pattern_is_flagged_and_refused(site, tmp_path, monkeypatch):
    bad = {"summary": "Notes from planning-T1 and a link to docs.google.com in the row."}
    pull(tmp_path, write_csv(tmp_path, "library", [library_row(**bad)]))
    out = pull(tmp_path, write_csv(tmp_path, "library", [library_row(**bad, cleared=MARK)]))
    flags = candidates(out, "library")[0]["flags"]
    assert any("planning-T1" in flag for flag in flags) and any("docs.google.com" in flag for flag in flags)
    assert "planning-T1" in (out / "REPORT.md").read_text(encoding="utf-8")
    before = (site / "data" / "library.json").read_bytes()
    with pytest.raises(SystemExit, match="private"):
        merge(monkeypatch, out / "candidates-library.json", "--require-cleared")
    assert (site / "data" / "library.json").read_bytes() == before


def test_the_name_screen_flags_a_nation_and_a_hold_term_and_stays_local(tmp_path, site):
    terms = tmp_path / "terms.txt"
    terms.write_text("a flagged word\n", encoding="utf-8")
    out = pull(tmp_path, write_csv(tmp_path, "library", [library_row(summary="The Examplename Nation and a flagged word.")]), terms=terms)
    assert sorted(flag for flag in candidates(out, "library")[0]["flags"] if flag.startswith("name screen")) == ["name screen: Examplename ...", "name screen: a flagged word"]


def test_a_mark_does_not_survive_an_edit(site, tmp_path, monkeypatch):
    pull(tmp_path, write_csv(tmp_path, "library", [library_row()]))
    assert candidates(pull(tmp_path, write_csv(tmp_path, "library", [library_row(cleared=MARK)])), "library")[0]["cleared"] == MARK
    edited = {"summary": "Rewritten after the owner read it."}
    out = pull(tmp_path, write_csv(tmp_path, "library", [library_row(**edited, cleared=MARK)]))
    assert candidates(out, "library")[0]["cleared"] == "" and any("cleared mark dropped" in flag for flag in candidates(out, "library")[0]["flags"])
    still = pull(tmp_path, write_csv(tmp_path, "library", [library_row(**edited, cleared=MARK)]))
    assert candidates(still, "library")[0]["cleared"] == "", "the old mark stays dead on later pulls"
    fresh = pull(tmp_path, write_csv(tmp_path, "library", [library_row(**edited, cleared="PF 11/06/2026")]))
    assert candidates(fresh, "library")[0]["cleared"] == "PF 11/06/2026"


def test_a_mark_before_any_report_does_not_count(site, tmp_path):
    out = pull(tmp_path, write_csv(tmp_path, "library", [library_row(cleared=MARK)]))
    assert candidates(out, "library")[0]["cleared"] == ""


def test_a_quote_not_on_its_page_is_flagged(site, tmp_path):
    out = pull(tmp_path, write_csv(tmp_path, "claims", [claim_row(quote="a sentence the page does not hold")]))
    record = candidates(out, "claims")[0]
    assert record["quote_check"] == "not found" and "quote not found on the source page" in record["flags"] and record["status"] == "unverified"


def test_a_private_address_is_not_fetched(site, tmp_path, monkeypatch):
    monkeypatch.setattr(intake, "public_host", lambda url: False)
    monkeypatch.setattr(intake, "fetch_bytes", lambda url: pytest.fail("fetched a private address"))
    monkeypatch.setattr(merge_library, "check", lambda url: pytest.fail("checked a private address"))
    out = pull(tmp_path, write_csv(tmp_path, "claims", [claim_row(url="https://intranet.example/x")]))
    assert candidates(out, "claims")[0]["quote_check"] == "not fetched"


def test_landed_rows_are_not_pulled_again_and_the_example_row_never_is(site, tmp_path):
    out = pull(tmp_path, write_csv(tmp_path, "library", [library_row(landed="2026-11-01"), library_row(url="https://example.org/other")]))
    assert [record["url"] for record in candidates(out, "library")] == ["https://example.org/other"]


def test_a_sheet_id_is_never_written(site, tmp_path, capsys):
    secret = "sheet-id-that-must-not-persist"
    with pytest.raises(SystemExit) as stopped:
        intake.main(["--sheet", secret, "--out", str(tmp_path / "intake")])
    assert secret not in str(stopped.value)
    intake.main(["--sheet", secret, "--csv", str(write_csv(tmp_path, "news", [news_row()])), "--out", str(tmp_path / "intake"), "--date", "2026-11-05", "--hold-terms", str(tmp_path / "none")])
    written = [path for path in (tmp_path / "intake").rglob("*") if path.is_file()]
    assert written and not any(secret in path.read_text(encoding="utf-8") for path in written)


TEMPLATE = ROOT / "planning-T1" / "research" / "intake" / "INTAKE-TEMPLATE.xlsx"


@pytest.mark.skipif(not TEMPLATE.is_file(), reason="the template is local T1")
def test_the_template_matches_the_pull_and_its_example_rows_never_land(site, tmp_path):
    book = pytest.importorskip("openpyxl.reader.excel").load_workbook(TEMPLATE)
    assert [sheet.title.lower() for sheet in book.worksheets] == list(intake.COLUMNS)
    for sheet in book.worksheets:
        assert [cell.value for cell in sheet[2]] == intake.COLUMNS[sheet.title.lower()] and sheet.freeze_panes == "A3"
        assert "no fact about a specific Nation" in sheet["A1"].value.replace("No fact", "no fact")
        assert sheet.data_validations.dataValidation, sheet.title
    assert all(not rows for tab, rows in intake.read_file(TEMPLATE) if tab) and {tab for tab, _ in intake.read_file(TEMPLATE)} == set(intake.COLUMNS)


def burst(n):
    return [{"added": "2026-11-05", "publisher": "SEC EDGAR (data.sec.gov)", "title": f"Apple XBRL record {i}", "url": f"https://data.sec.gov/{i}", "areas": ["ai"], "type": "report", "featured": False, "summary": "s", "date": "2026-11-03"} for i in range(n)]


def test_a_burst_of_records_is_one_row_and_cannot_fill_the_home_feed():
    rows = feed.library_items(burst(48))
    assert [row["title"] for row in rows] == ["48 records from SEC EDGAR (data.sec.gov) added to the library"]
    assert rows[0]["url"] == "library/?q=SEC%20EDGAR%20%28data.sec.gov%29"
    others = [feed.item("2026-11-04", kind, f"{kind} {n}", "library/", "ai") for kind in ("policy", "data", "library") for n in range(3)]
    picked = feed.home_rows(feed.order([*rows, *others]))
    assert len(picked) == 6 and sum("SEC EDGAR" in row["title"] for row in picked) == 1
    assert {row["kind"] for row in picked} == {"policy", "library", "data"}


def test_an_entry_that_names_a_nation_gets_no_row_of_its_own():
    entry = {**burst(1)[0], "publisher": "Other", "title": "A plan of the Examplename Nation"}
    assert [row["title"] for row in feed.library_items([entry])] == ["1 more source added to the library"]


def test_the_shipped_feed_is_the_documented_shape():
    data = json.loads((ROOT / "site" / "data" / "whats-new.json").read_text(encoding="utf-8"))
    assert (data["tier"], data["schema"], data["window_days"]) == ("T0", 1, 90)
    assert [row["date"] for row in data["items"]] == sorted((row["date"] for row in data["items"]), reverse=True)
    for row in data["items"]:
        assert set(row) == {"date", "kind", "title", "url", "area"}
        assert row["kind"] in feed.KIND_WORDS and row["area"] in merge_library.AREAS and row["date"] <= data["generated"]
        assert row["url"].startswith("https://") or (ROOT / "site" / row["url"].split("?")[0].split("#")[0]).exists(), row["url"]


def test_the_pages_match_the_feed_and_the_feed_matches_the_library():
    data = json.loads((ROOT / "site" / "data" / "whats-new.json").read_text(encoding="utf-8"))
    assert not feed.pour_pages(data, check=True), "a page is out of date: run python scripts/build_whats_new.py"
    entries = json.loads((ROOT / "site" / "data" / "library.json").read_text(encoding="utf-8"))["entries"]
    assert all(row in data["items"] for row in feed.library_items(entries)), "the feed is out of date: run python scripts/build_whats_new.py"
    home = parse((ROOT / "site" / "index.html").read_text(encoding="utf-8")).one("ol", "whats-new-rows").all("li")
    library = parse((ROOT / "site" / "library" / "index.html").read_text(encoding="utf-8")).one("details", "whats-new-all").one("ol").all("li")
    assert len(home) == 6 and len(library) == len(feed.recent(data["items"], data["generated"]))


def test_the_last_seen_date_stays_in_the_browser():
    script = (ROOT / "site" / "assets" / "js" / "library.js").read_text(encoding="utf-8")
    start = script.index("const sinceLine")
    block = script[start:script.index("const newest", start)]
    assert "atni-last-seen" in block and ".catch(() => {})" in block, "storage can throw, and the line stays silent then"
    assert block.count("fetch(") == 1 and "method" not in block and "body" not in block, "only the feed is read, and nothing is sent"
