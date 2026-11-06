"""The release gates, each held to a case it once let through: suffix case, the owner's mark, the T1 leak check's reach, receipt dates, external loads,
local paths, one claim-id pattern, tiers, snapshot order, and three small guards. Scratch folders only; no network, no browser."""
import json
import os
from pathlib import Path
import sys
import zipfile

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import add_page_meta as meta  # noqa: E402
import build_briefing as bb  # noqa: E402
import build_explorer as be  # noqa: E402
import build_index as bi  # noqa: E402
import build_plates as bp  # noqa: E402
import check_t1_leak as leak  # noqa: E402
import intake_pull as intake  # noqa: E402
import merge_library  # noqa: E402
import number_audit  # noqa: E402
import pour_claim_refs as cr  # noqa: E402
import resource_model as rm  # noqa: E402
import validate_public as vp  # noqa: E402


def validator_output(site, monkeypatch, capsys):
    """What the validator prints for a scratch site/ (it always fails one: no library, no data files)."""
    monkeypatch.setattr(vp, "SITE", site)
    with pytest.raises(SystemExit):
        vp.main()
    return capsys.readouterr().out


def test_a_page_with_an_uppercase_suffix_is_read_like_any_page(tmp_path, monkeypatch, capsys):  # 1
    (tmp_path / "index.HTML").write_text("<p>Saved from C:/dev/atni-task-force/site.</p>", encoding="utf-8")
    assert "Local path in index.HTML" in validator_output(tmp_path, monkeypatch, capsys)


@pytest.mark.parametrize("mark,kind", [
    ("PF 11/05/2026", "cleared"), ("PF 11/05/2026 again", "cleared"),
    ("no PF 11/05/2026", "declined"), ("No PF 11/05/2026", "declined"), ("NO PF 11/05/2026", "declined"),
    ("Nope 11/05/2026", None), ("yes 99/99/9999", None), ("TBD 00/00/0000", None), ("NO 11/05/2026", None), ("no thanks", None),
])
def test_the_pull_and_the_merge_read_an_owner_mark_one_way(mark, kind):  # 2
    row = {"title": "T", "url": "https://x.org", "public_source": "yes", "cleared": mark}
    if kind is None:
        with pytest.raises(SystemExit, match="not cleared"):
            merge_library.gate([row])
    else:
        assert merge_library.gate([row]) == ([row] if kind == "cleared" else [])
    flags = []
    judged = intake.judged_mark({"cleared": mark, "url": "u"}, None, flags)  # no earlier report, so a clearing mark cannot count yet
    assert (judged, bool(flags)) == ((mark, False) if kind == "declined" else ("", True)), flags


SENTENCE = "The council will weigh the siting choice at the spring meeting before any vote is taken"
OTHER = "A candidate summary written for the library stays a working note until the owner lands it"


def test_a_t1_sentence_in_a_script_string_blocks_and_a_candidate_in_an_alt_text_is_listed(tmp_path, capsys):  # 3
    t1, site, unsorted = tmp_path / "planning-T1", tmp_path / "site", tmp_path / "files-unsorted"
    (t1 / "sources" / "gdocs").mkdir(parents=True)
    (t1 / "sources" / "gdocs" / "notes.md").write_text(f"{SENTENCE}.\n", encoding="utf-8")
    (site / "assets" / "js").mkdir(parents=True)
    (site / "assets" / "js" / "x.js").write_text(f'const note = "{SENTENCE}.";\n', encoding="utf-8")
    assert leak.main(t1, site, unsorted) == 1
    assert "[BLOCK] from planning-T1/sources/gdocs/notes.md" in capsys.readouterr().out
    (site / "assets" / "js" / "x.js").unlink()
    (t1 / "research" / "candidates").mkdir(parents=True)
    (t1 / "research" / "candidates" / "a.json").write_text(json.dumps([{"summary": OTHER}]), encoding="utf-8")
    (site / "index.html").write_text(f'<img src="a.png" alt="{OTHER}.">', encoding="utf-8")
    assert leak.main(t1, site, unsorted) == 3, "a library candidate is T1 until it lands, and an alt text is public"
    assert "[review] from planning-T1/research/candidates/a.json" in capsys.readouterr().out


def test_a_receipt_prints_a_partial_date_as_written():  # 4
    source = {"url": "https://x.org", "title": "T", "publisher": "P", "kind": "agency", "published": "2026-10 (update to the 07/22/2026 paper; day not stated)"}
    claim = {"status": "verified", "quote": "q", "boundary": "b", "source": source}
    html = be.sources_html({"xx-001"}, {"xx-001": claim}, {})
    assert "(u/" not in html and "2026-10 (update to the 07/22/2026 paper; day not stated)" in html
    assert ", 10/05/2026." in be.sources_html({"xx-001"}, {"xx-001": {**claim, "source": {**source, "published": "2026-10-05"}}}, {})


def test_every_way_a_page_or_script_could_load_or_send_is_refused(tmp_path, monkeypatch, capsys):  # 5
    (tmp_path / "a.png").write_bytes(b"")
    (tmp_path / "index.html").write_text(
        '<img src="a.png" srcset="a.png 1x, https://cdn.example/b.png 2x" alt=""><video poster="https://cdn.example/p.jpg"></video>'
        '<object data="https://cdn.example/o.svg"></object><form action="https://collect.example/form"></form>'
        '<p style="background: url(//cdn.example/bg.png)">x</p><style>@import url("https://fonts.example/f.css");</style>'
        '<script>fetch("https://api.example/a");</script><a href="javascript:void(0)">x</a>'
        '<script type="application/json" id="d">{"source": "https://example.org/cited"}</script>', encoding="utf-8")
    (tmp_path / "x.js").write_text(
        "// a comment may cite https://developer.mozilla.org/ freely\n"
        "const ns = 'http://www.w3.org/2000/svg', home = 'https://atniclimate.github.io/atni-task-force/data/x.json';\n"
        "const strip = (t) => t.replace(/[&<>\"']/g, '') / 2;\n"
        "const feed = `wss://socket.example/${strip('x')}`;\n"
        "navigator.sendBeacon('/hit'); new EventSource('/e'); new WebSocket(feed); new XMLHttpRequest();\n", encoding="utf-8")
    (tmp_path / "logo.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(//fonts.example/f.css);</style>'
                                       '<image href="https://cdn.example/i.png"/></svg>', encoding="utf-8")
    out = validator_output(tmp_path, monkeypatch, capsys)
    for expected in ("<img> https://cdn.example/b.png", "<video> https://cdn.example/p.jpg", "<object> https://cdn.example/o.svg", "<form> https://collect.example/form",
                     "External stylesheet or font in an inline style in index.html", "External script or fetch in an inline script in index.html",
                     "javascript:void(0)", "External address in x.js: wss://socket.example/", "sendBeacon", "EventSource", "WebSocket", "XMLHttpRequest",
                     "External stylesheet or font in logo.svg", "<image> https://cdn.example/i.png"):
        assert expected in out, expected
    assert not any(quiet in out for quiet in ("developer.mozilla.org", "www.w3.org", "atni-task-force/data/x.json", "example.org/cited")), out


@pytest.mark.parametrize("text,local", [
    ("Saved in /c/dev/atni-task-force/site", True), ("from /i/claude-temp/notes/", True), (r"on \\atni-files\shared\plans", True), ("in ~/Desktop/plans", True),
    ("under /home/pf/plans", True), ("under /mnt/c/dev/plans", True), (r"%USERPROFILE%\Desktop", True), ("%APPDATA%/x", True),
    ("http://localhost:8000/ai/", True), ("served at 127.0.0.1:5173", True), ("https://localhost:8443/ai/", True),
    ("https://agc.org/files/users/u1/a.pdf", False), ("and/or", False), ("Scope 1/2/3", False), ("x.replace(/a/g, '')", False),
    ("https://developer.mozilla.org/en-US/docs/Web/localhost", False), ("https://www.dallasfed.org/~/media/x.pdf", False), ("50%/50%", False),
])
def test_a_local_path_or_address_in_any_public_text_is_refused(text, local):  # 6
    errors = []
    vp.check_text("page", text, errors)
    assert bool(errors) == local and all(e.startswith(("Local path in page", "Local address in page")) for e in errors), errors


def test_one_claim_id_pattern_serves_every_script():  # 7
    assert rm.CLAIM_ID == be.CLAIM.pattern == number_audit.CLAIM_ID.pattern == vp.CLAIM_ID.pattern  # the model file stays standard library only, so it holds the text
    assert vp.CLAIM_ID.findall("dem-001, pdc-059, ef-001, fp-141; not a-1, abcd-001, or fp-1411") == ["dem-001", "pdc-059", "ef-001", "fp-141"]


def test_a_public_json_of_another_tier_fails_and_the_manifest_records_each_files_own(tmp_path, monkeypatch, capsys):  # 8
    (tmp_path / "data").mkdir()
    (tmp_path / "data" / "notes.json").write_text('{"schema": 1, "tier": "T1"}', encoding="utf-8")
    assert "data/notes.json says tier T1" in validator_output(tmp_path, monkeypatch, capsys)
    site = tmp_path / "other"
    (site / "data" / "claims").mkdir(parents=True)
    (site / "data" / "library.json").write_text('{"schema": 1, "updated": "2026-01-01", "entries": []}', encoding="utf-8")
    (site / "data" / "x.csv").write_text("a\n1\n", encoding="utf-8")
    (site / "data" / "y.json").write_text('{"schema": 1, "tier": "T0"}', encoding="utf-8")
    assert {row["path"]: row["tier"] for row in bi.data_files(site)} == {"data/library.json": None, "data/x.csv": None, "data/y.json": "T0"}


def test_the_newest_earlier_pull_is_found_by_its_name_not_its_clock(tmp_path):  # 9
    for name, title in (("2026-11-05-10", "tenth pull"), ("2026-11-05-2", "second pull")):
        (tmp_path / name).mkdir()
        (tmp_path / name / "candidates-library.json").write_text(json.dumps([{"key": "k", "title": title}]), encoding="utf-8")
    os.utime(tmp_path / "2026-11-05-10", (1, 1))  # a copy or a restore can leave a folder's clock anywhere
    (tmp_path / "2026-11-06").mkdir()
    assert intake.earlier(tmp_path / "2026-11-06", "library")["k"]["title"] == "tenth pull"


def test_a_title_with_quotes_stays_one_attribute():  # 10
    page = '<head>\n<title>Say "hi" &amp; go</title>\n<meta name="description" content="D.">\n</head>'
    tag = next(line for line in meta.apply_meta(page, "x/index.html").splitlines() if "og:title" in line)
    assert tag.strip() == '<meta property="og:title" content="Say &quot;hi&quot; &amp; go">'


def test_a_briefing_with_no_dated_plate_stops_with_a_reason(tmp_path):  # 10
    site = tmp_path / "site"
    (site / "data" / "claims").mkdir(parents=True)
    (site / "data" / "index.json").write_text('{"plates": []}', encoding="utf-8")
    for rel in bb.PAGES:
        (site / rel).parent.mkdir(parents=True, exist_ok=True)
        (site / rel).write_text("<main></main>", encoding="utf-8")
    (site / bb.CHECKLISTS_PAGE).write_text('<p class="dc-wide-note">Where these come from.</p>\n<div class="disclosure-grid" id="checklists">'
                                           '<details class="disclosure" id="q-one">\n<summary><h3>One</h3></summary>\n<ul>\n<li>First?</li>\n</ul>\n</details></div>', encoding="utf-8")
    with pytest.raises(bp.BuildError, match="checked"):
        bb.compose(site)


def test_a_mark_in_single_quotes_is_read_and_its_other_attributes_are_kept():  # 10
    claim = {"id": "fp-141", "status": "verified", "value": 3.1, "source": {"url": "https://x.org", "title": "T", "publisher": "P"}}
    body = ("<main><p><a class='cr' data-claim='fp-141' href='#src-fp-141'>3.1 Wh</a> and "
            '<a class="cr" data-claim="fp-141" href="#src-fp-141" title="Per prompt" data-note="n">3.1 Wh</a></p>\n</main>')
    once, problems = cr.pour(body, {"fp-141": claim})
    assert not problems and once.count('data-status="verified"') == 2
    assert ' title="Per prompt" data-note="n">' in once and cr.pour(once, {"fp-141": claim}) == (once, [])


def test_the_model_tests_fail_rather_than_skip_on_the_owners_machine(tmp_path, monkeypatch):  # 11
    import test_resource_model as trm

    def sample():  # a pytest mark will not decorate a lambda
        pass

    monkeypatch.setattr(trm.rm, "OUT", tmp_path / "work" / "site-refresh" / "evidence" / "resource-model.json")
    monkeypatch.setattr(trm, "ROOT", tmp_path)
    assert trm.need_files(sample).pytestmark[0].name == "skipif", "no planning-T1/ here: CI or a fresh clone skips"
    (tmp_path / "planning-T1").mkdir()
    with pytest.raises(pytest.fail.Exception, match="work/site-refresh/evidence"):
        trm.need_files(sample)()


@pytest.mark.parametrize("name,body,expected", [
    ("index.html", '<form><button formaction="https://collect.example/f">Go</button></form>', "<button formaction> https://collect.example/f"),
    ("index.html", '<a href="#" ping="https://track.example/p">x</a>', "<a ping> https://track.example/p"),
    ("x.js", "const lib = '//cdn.example/lib.js'; const rule = '//';\n", "External address in x.js: //cdn.example/lib.js"),
])
def test_a_button_address_a_ping_and_a_protocol_relative_string_are_refused(tmp_path, monkeypatch, capsys, name, body, expected):  # 12
    (tmp_path / name).write_text(body, encoding="utf-8")
    out = validator_output(tmp_path, monkeypatch, capsys)
    assert expected in out, out
    assert out.count("External address in x.js") <= 1, "a bare // string is a separator, not an address"


def test_a_t1_sentence_in_a_word_document_blocks(tmp_path, capsys):  # 13
    t1, site = tmp_path / "planning-T1", tmp_path / "site"
    (t1 / "sources").mkdir(parents=True)
    site.mkdir()
    with zipfile.ZipFile(t1 / "sources" / "notes.docx", "w") as docx:
        docx.writestr("word/document.xml", f"<w:p><w:r><w:t>{SENTENCE[:20]}</w:t></w:r><w:r><w:t>{SENTENCE[20:]}.</w:t></w:r></w:p>")
    (site / "index.html").write_text(f"<p>{SENTENCE}.</p>", encoding="utf-8")
    assert leak.main(t1, site, tmp_path / "files-unsorted") == 1
    assert "[BLOCK] from planning-T1/sources/notes.docx" in capsys.readouterr().out


def test_one_copy_of_each_shared_helper_and_list():  # 14
    assert bp.load_claims is cr.load_claims and bp.verbatim is cr.verbatim
    assert merge_library.TYPES is vp.TYPES and merge_library.AREAS is vp.AREAS
