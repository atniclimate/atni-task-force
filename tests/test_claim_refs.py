"""Tests for scripts/pour_claim_refs.py, its call in scripts/validate_public.py, and scripts/number_audit.py (no network, no browser)."""
import importlib.util
import json
from pathlib import Path
import re
import sys

import pytest

from dom import parse

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS))

import number_audit as audit  # noqa: E402
import pour_claim_refs as cr  # noqa: E402


def claim(claim_id, status="verified", **fields):
    source = {"title": f"Title of {claim_id}", "publisher": "A Publisher", "url": f"https://example.org/{claim_id}", "published": "2026-01-01", "kind": "agency"}
    return {"id": claim_id, "value": None, "low": None, "high": None, "derived": None, "status": status, "quote": "A quote.", "source": source, **fields}


CLAIMS = {
    "fp-141": claim("fp-141", value=0.6, low=0.3, high=3.1),
    "fp-200": claim("fp-200", "partly", value=45, limit="One survey, not a census."),
    "fp-201": claim("fp-201", "partly", value=45),
    "fp-202": claim("fp-202", "unverified", value=45),
    "fp-203": claim("fp-203", value=None, derived="0.0006 kWh = 0.6 Wh, across 1,458 homes"),
    "fp-204": claim("fp-204", value=8000000000),
    "fp-205": claim("fp-205", value=-1.3),
}


def page(*marks):
    return "<html><body><main id=\"main\">\n<p>" + " ".join(marks) + "</p>\n  </main>\n<footer>f</footer></body></html>\n"


def mark(claim_id, text):
    return f'<a class="cr" data-claim="{claim_id}" href="#src-{claim_id}">{text}</a>'


def test_good_marks_get_a_name_and_a_block_with_one_anchor_per_id():
    out, problems = cr.pour(page(mark("fp-141", "3.1 Wh"), mark("fp-141", "0.3 to 3.1 Wh"), mark("fp-200", "45%")), CLAIMS)
    assert problems == []
    dom = parse(out)
    first, second, third = dom.all("a", "cr")
    assert first.attrs["aria-label"] == "3.1 Wh, claim fp-141, verified" and first.attrs["data-status"] == "verified" and first.text() == "3.1 Wh"
    assert third.attrs["aria-label"] == "45%, claim fp-200, partly verified" and third.attrs["href"] == "#src-fp-200"
    section = dom.one("section", "claims-cited")
    assert section.one("h2").text() == "Claims Cited on This Page"
    assert [li.attrs.get("id") for li in section.all("li")] == ["src-fp-141", "src-fp-200"]
    assert out.index("<!-- /claims-cited -->") < out.index("</main>")
    row = section.all("li")[1]
    assert row.one("a").attrs["href"] == "https://example.org/fp-200" and row.one("a").text() == "Title of fp-200"
    for words in ("fp-200", "A Publisher", "Partly verified", "Limit: One survey, not a census."):
        assert words in row.text()


def test_pour_is_idempotent_and_the_check_accepts_its_own_output():
    once, _ = cr.pour(page(mark("fp-141", "3.1 Wh")), CLAIMS)
    assert cr.pour(once, CLAIMS) == (once, [])
    assert cr.check_page("p.html", once, CLAIMS) == []
    assert once.count("<!-- claims-cited -->") == 1


def test_an_existing_receipt_stays_the_only_anchor():
    body = page(mark("fp-141", "3.1 Wh")).replace("</p>", '</p><ul><li id="src-fp-141">receipt</li></ul>')
    out, problems = cr.pour(body, CLAIMS)
    assert problems == [] and out.count('id="src-fp-141"') == 1
    assert [li.attrs.get("id") for li in parse(out).one("section", "claims-cited").all("li")] == [None]


def test_a_page_with_no_marks_has_no_block():
    plain = page("no marks")
    assert cr.pour(plain, CLAIMS) == (plain, [])
    stale, _ = cr.pour(page(mark("fp-141", "3.1 Wh")), CLAIMS)
    emptied = re.sub(r'<a class="cr".*?</a>', "x", stale)
    assert "claims-cited" not in cr.pour(emptied, CLAIMS)[0]
    assert "stale" in cr.check_page("p.html", emptied, CLAIMS)[0]


@pytest.mark.parametrize("claim_id, text, words", [
    ("no-999", "3 Wh", "does not ship"),
    ("fp-202", "45%", "unverified"),
    ("fp-201", "45%", "no limit"),
    ("fp-141", "3.2 Wh", "3.2"),
    ("fp-141", "0.3 to 3.2 Wh", "3.2"),
    ("fp-141", "13.1 Wh", "13.1"),  # the digits of 3.1 inside a larger number are not 3.1
    ("fp-141", "1 Wh", "1"),  # rounding is not the claim's figure
    ("fp-141", "about three", "no digits"),
    ("fp-204", "8 million", "8"),
])
def test_bad_marks_fail_and_leave_the_page_alone(claim_id, text, words):
    body = page(mark(claim_id, text))
    out, problems = cr.pour(body, CLAIMS)
    assert out == body and len(problems) == 1 and words in problems[0]
    assert cr.check_page("p.html", body, CLAIMS)[0].startswith("p.html: ")


@pytest.mark.parametrize("claim_id, text", [
    ("fp-141", "<span data-pour=\"fp-141\">0.6</span> Wh"),
    ("fp-203", "0.6 Wh"),  # in the derived text
    ("fp-203", "1,458 homes"),
    ("fp-204", "8 billion"),
    ("fp-204", "8,000,000,000"),
    ("fp-205", "1.3 percent decrease"),
    ("fp-200", "45 gCO2e"),  # a digit inside a unit is not a figure
])
def test_marks_that_hold_the_claims_figures_pass(claim_id, text):
    assert cr.pour(page(mark(claim_id, text)), CLAIMS)[1] == []


def test_a_changed_status_or_limit_makes_the_block_stale():
    once, _ = cr.pour(page(mark("fp-200", "45%")), CLAIMS)
    changed = {**CLAIMS, "fp-200": {**CLAIMS["fp-200"], "limit": "A new limit."}}
    assert "stale" in cr.check_page("p.html", once, changed)[0]


def test_a_mark_quoted_in_a_script_is_not_a_mark():
    body = page('<script>var x = \'<a class="cr" data-claim="no-999" href="#">9</a>\';</script>')
    assert cr.pour(body, CLAIMS) == (body, [])


def test_validate_public_runs_the_check(tmp_path, monkeypatch, capsys):
    spec = importlib.util.spec_from_file_location("validate_public", SCRIPTS / "validate_public.py")
    vp = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(vp)
    (tmp_path / "data" / "claims").mkdir(parents=True)
    (tmp_path / "data" / "claims" / "a.json").write_text(json.dumps({"schema": 1, "tier": "T0", "claims": [CLAIMS["fp-141"]]}), encoding="utf-8")
    (tmp_path / "index.html").write_text(page(mark("fp-141", "9.9 Wh")), encoding="utf-8")
    monkeypatch.setattr(vp, "SITE", tmp_path)
    with pytest.raises(SystemExit):
        vp.main()
    assert "index.html: mark '9.9 Wh' prints 9.9" in capsys.readouterr().out


def open_tokens(html):
    return [r["token"] for r in audit.audit_html(html) if r["reason"] is None]


def reason_of(html, token):
    return next(r["reason"] for r in audit.audit_html(html) if r["token"] == token)


def test_audit_lists_prose_numbers_with_their_sentence():
    rows = audit.audit_html("<main><p>First sentence here. Scores rose 48% with <b>1,600</b> MW. Last one.</p></main>")
    assert [(r["token"], r["sentence"]) for r in rows] == [("48%", "Scores rose 48% with 1,600 MW."), ("1,600", "Scores rose 48% with 1,600 MW.")]
    assert open_tokens("<p>nearly a thousand students, and one or two more</p>") == ["a thousand"]


def test_audit_skips_what_is_marked_or_not_visible():
    assert open_tokens('<!-- plate:a --><p>9</p><!-- /plate:a --><!-- claims-cited --><p>8</p><!-- /claims-cited --><script>7</script><head><title>6</title></head><p hidden>5</p>') == []
    assert reason_of(mark("fp-141", "3.1 Wh"), "3.1") == "marked"
    assert reason_of('<span data-pour="fp-1">3.1</span>', "3.1") == "marked"
    assert reason_of('<!-- explorer:x --><p>4 Wh</p><!-- /explorer:x -->', "4") == "explorer_model"
    assert reason_of("<p>About 4 Wh, fp-141.</p>", "4") == "claim_id_in_sentence"


@pytest.mark.parametrize("html, token, reason", [
    ("<p>Resolution #2026-039 and Order No. 26-239 apply.</p>", "26", "document_number"),
    ("<p>See page 12 of it.</p>", "12", "ordinal"),
    ("<p>Scope 3 counts.</p>", "3", "ordinal"),
    ('<p><a href="https://x.org">The 2026 POWER Act Report</a></p>', "2026", "year_in_title"),
    ("<p>Checked 10/29/2026 by staff.</p>", "10/29/2026", "site_date"),
    ('<p><span>11/04/2026</span><span>Sources checked</span></p>', "11/04/2026", "site_date"),
    ("<p>It said so (Pew, 02/24/2026).</p>", "02/24/2026", "citation_date"),
    ("<label>Prompts 10</label>", "10", "reader_set"),
    ("<p>A kilowatt is 1,000 watts.</p>", "1,000", "unit_definition"),
    ('<div class="axis"><i>100</i></div>', "100", "axis_tick"),
    (f'<p>{mark("fp-141", "3.1 Wh")} in 2026.</p>', "2026", "qualifies_marked_figure"),
    ('<p>See <a href="https://doi.org/10.6028/NIST.AI.600-1">NIST AI 600-1, 07/26/2024</a>.</p>', "600", "document_number_in_link"),
    ("<p>The cost is set out in Box 2.1 of the report.</p>", "2.1", "box_number"),
    ("<p>One 8-second Veo 3 clip.</p>", "3", "product_name"),
    ("<p>Retrieved at 1:28 PM PDT.</p>", "1", "clock_time"),
    ("<p>Retrieved at 1:28 PM PDT.</p>", "28", "clock_time"),
    ("<p>Shared under CC BY 4.0 and the PolyForm Noncommercial 1.0.0 license.</p>", "4.0", "license_version"),
    ("<p>Shared under CC BY 4.0 and the PolyForm Noncommercial 1.0.0 license.</p>", "1.0", "license_version"),
    ('<table><tr><th scope="row">IEA, base case, 2030</th><td>modeled</td></tr></table>', "2030", "year_in_label"),
    (f'<p>About a thousand students, and {mark("fp-141", "3.1 Wh")}.</p>', "a thousand", "spelled_count_in_marked_sentence"),
])
def test_audit_exceptions(html, token, reason):
    assert reason_of(html, token) == reason


def test_audit_keeps_what_the_exceptions_do_not_excuse():
    for html, token in (("<p>In a survey of 1,458 teens.</p>", "1,458"), ("<p>Adopted on 08/21/2025.</p>", "08/21/2025"), ("<p>Load doubles by 2030.</p>", "2030"),
                       ("<table><tr><td>Load doubles by 2030</td></tr></table>", "2030"), ("<p>Nearly a thousand students.</p>", "a thousand")):
        assert open_tokens(html) == [token]


def test_shipped_pages_pass_the_claim_reference_check():
    claims = cr.load_claims()
    for path in cr.SITE.rglob("*.html"):
        assert cr.check_page(path.name, path.read_text(encoding="utf-8"), claims) == []
