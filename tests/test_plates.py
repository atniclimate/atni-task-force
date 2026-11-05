"""Tests for scripts/build_plates.py and the plate checks in scripts/validate_public.py (no network, no browser).

Exact matching is for figures, units, claim ids, receipts, source URLs, and the provenance rules. Page copy and markup are
read through dom.parse: polish must not fail a test, and a changed number, a lost claim id, or a broken structure must.
Sentences a fixture writes itself are compared exactly, because there the words are the input and only the pour is under test.
"""
import gzip
import importlib.util
import json
from pathlib import Path
import re
import sys
import warnings

import pytest

from dom import numbers, parse

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))


def _load(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


bp = _load("build_plates")
vp = _load("validate_public")
SITE = SCRIPTS.parent / "site"


def built(tmp_path, plate=None, claims=None):
    """Builds a small site and returns (page text, its inline data, its claims)."""
    site = bp.sample_site(tmp_path / "site", plate, claims)
    bp.build(site)
    page = (site / "page.html").read_text(encoding="utf-8")
    data = json.loads(vp.PLATE_BLOCK.findall(page)[0][1])
    return page, data, bp.load_claims(site)


def title(doc):
    return doc.one(id=doc.one("figure").attrs["aria-labelledby"]).text()


def reading(doc):
    return doc.one(cls="reading").text()


def receipt(doc, claim_id):
    return doc.one("li", id=f"sample-source-{claim_id}").text()


def rejected(tmp_path, match, plate=None, claims=None):
    with pytest.raises(bp.BuildError, match=match):
        built(tmp_path, plate, claims)
    assert "old" in (tmp_path / "site" / "page.html").read_text(encoding="utf-8"), "a failed build writes nothing"


def lines_plate(**extra):
    return bp.sample_plate(plot={"type": "lines", "highlight": "A"}, default=None, title="{series} used {display} in {year}",
                           rows=[{"series": "A", "claim": "s-1", "points": "series"}, {"series": "B", "claim": "s-2", "points": "series"}], **extra)


LINE_CLAIMS = [bp.sample_claim("s-1", 3, series={"2020": 1, "2021": 2, "2022": 3}),
               bp.sample_claim("s-2", 5, series={"2021": 4, "2022": 5})]


def test_self_test():
    assert bp.self_test() is True


# Build ----------------------------------------------------------------------------------------------

def test_build_writes_between_the_markers_and_is_idempotent(tmp_path):
    site = bp.sample_site(tmp_path / "site")
    assert bp.build(site)["pages_written"] == ["page.html"]
    page = (site / "page.html").read_text(encoding="utf-8")
    assert page.startswith("<main>before\n<!-- plate:sample -->") and page.endswith("<!-- /plate:sample -->\nafter</main>") and parse(page).one("figure")
    assert "\nold\n" not in page
    assert bp.build(site)["pages_written"] == []
    assert (site / "page.html").read_text(encoding="utf-8") == page


def test_output_holds_table_plot_reading_and_exactly_the_receipts_used(tmp_path):
    claims = [bp.sample_claim("s-1"), bp.sample_claim("s-2", 12, "partly"), bp.sample_claim("s-3", None), bp.sample_claim("s-unused", 99)]
    page, data, _ = built(tmp_path, claims=claims)
    doc = parse(page)
    assert "0.24 Wh" in doc.one(cls="plate-table").texts("td")
    assert doc.one(cls="ladder-row", data_row="a").one(cls="ladder-value").text() == "0.24 Wh"
    assert all(part in reading(doc) for part in ("Row A", "0.24 Wh", "2025"))
    assert sorted(data["receipts"]) == ["s-1", "s-2", "s-3"]
    assert [row["claim"] for row in data["rows"]] == ["s-1", "s-2", "s-3"]
    assert "s-unused" not in page


def test_numbers_come_only_from_claims(tmp_path):
    rejected(tmp_path, "states a number", bp.sample_plate(rows=[{"id": "a", "label": "A", "claim": "s-1", "value": 7}]))


@pytest.mark.parametrize("field", ["title", "subtitle", "reading"])
def test_our_sentences_take_numbers_through_placeholders(tmp_path, field):
    rejected(tmp_path, "number in its own words", bp.sample_plate(**{field: "It used 42 Wh"}))


def test_placeholders_reach_any_row(tmp_path):
    page, _, _ = built(tmp_path, bp.sample_plate(title="{a[display]} against {b[display]}"))
    assert title(parse(page)) == "0.24 Wh against 12 Wh"


def test_a_row_with_no_claim_id_fails(tmp_path):
    rejected(tmp_path, "has no claim id", bp.sample_plate(rows=[{"id": "a", "label": "A"}]))


def test_a_row_naming_an_unknown_claim_fails(tmp_path):
    rejected(tmp_path, "unknown claim", bp.sample_plate(rows=[{"id": "a", "label": "A", "claim": "nope"}]))


def test_an_unverified_claim_fails(tmp_path):
    rejected(tmp_path, "only verified or partly", bp.sample_plate(rows=[{"id": "a", "label": "A", "claim": "s-1"}]), [bp.sample_claim("s-1", status="unverified")])


def test_a_partly_claim_without_a_limit_fails(tmp_path):
    plate = bp.sample_plate(rows=[{"id": "a", "label": "A", "claim": "s-1"}])
    rejected(tmp_path, "its limit must reach the page", plate, [bp.sample_claim("s-1", status="partly")])


def test_a_partly_limit_reaches_reading_sources_receipt_and_data(tmp_path):
    limit = "The B figure is an old estimate."
    page, data, _ = built(tmp_path, bp.sample_plate(default="b"))
    doc = parse(page)
    assert all(part in reading(doc) for part in ("Row B", "12 Wh", "2025", limit))
    assert limit in receipt(doc, "s-2") and "s-2" in receipt(doc, "s-2") and "partly" in receipt(doc, "s-2").lower() and "partly" not in receipt(doc, "s-1").lower()
    row = next(r for r in data["rows"] if r["key"] == "b")
    assert row["limit"] == limit and limit in row["reading"] and data["receipts"]["s-2"]["limit"] == limit
    assert any("partly" in cell.lower() for cell in doc.one(cls="plate-table").texts("td"))


def test_a_limit_on_the_claim_itself_is_used(tmp_path):
    claims = [bp.sample_claim("s-1", status="partly", limit="Stated on the claim.")]
    page, _, _ = built(tmp_path, bp.sample_plate(rows=[{"id": "a", "label": "A", "claim": "s-1"}]), claims)
    assert "Stated on the claim." in receipt(parse(page), "s-1")


def test_a_custom_reading_cannot_drop_the_limit(tmp_path):
    _, data, _ = built(tmp_path, bp.sample_plate(reading="{label} used {display}."))
    assert next(r for r in data["rows"] if r["key"] == "b")["reading"].endswith("The B figure is an old estimate.")


def test_a_claim_with_no_value_keeps_its_place_with_words(tmp_path):
    page, data, _ = built(tmp_path)
    row = next(r for r in data["rows"] if r["key"] == "c")
    assert "value" not in row and row["display"] == bp.NO_MEASUREMENT and "frac" not in row
    assert bp.NO_MEASUREMENT in parse(page).texts(cls="ladder-value")
    assert "s-3" in data["receipts"]


def test_ranges(tmp_path):
    claims = [bp.sample_claim("s-1", None, low=2, high=9), bp.sample_claim("s-2", 5, low=2, high=9), bp.sample_claim("s-3", None, low=20)]
    plate = bp.sample_plate(plot={"type": "ladder"}, rows=[{"id": "a", "label": "A", "claim": "s-1"}, {"id": "b", "label": "B", "claim": "s-2"}, {"id": "c", "label": "C", "claim": "s-3"}])
    page, data, _ = built(tmp_path, plate, claims)
    assert [r["display"] for r in data["rows"]] == ["2 to 9 Wh", "5 (2 to 9) Wh", "at least 20 Wh"]
    assert "frac" not in data["rows"][0] and data["rows"][1]["frac"] == 0.25 and data["rows"][1]["lo"] == 0.1
    assert any(node.style().get("--lo") == "0.1" and node.style().get("--hi") == "0.45" for node in parse(page).all(style=True))


def test_one_axis_one_unit(tmp_path):
    claims = [bp.sample_claim("s-1"), bp.sample_claim("s-2", 12, "verified", unit="kWh"), bp.sample_claim("s-3", None)]
    rejected(tmp_path, "one axis, one unit", claims=claims)


def test_a_row_can_convert_a_unit_with_its_arithmetic_on_the_receipt(tmp_path):
    claims = [bp.sample_claim("s-1", 14689, unit="million gallons", derived="14,689 million gallons x 3.78541 = 55,603 megaliters", series={"2024": 100, "2025": 200}), bp.sample_claim("s-2", 8170, unit="megaliters", series={"2025": 8170})]
    plate = bp.sample_plate(plot={"type": "lines"}, default=None, title="{series}", rows=[{"series": "A", "claim": "s-1", "points": "series", "convert": {"times": 3.78541, "to": "megaliters"}}, {"series": "B", "claim": "s-2", "points": "series"}])
    page, data, _ = built(tmp_path, plate, claims)
    assert [(r["value"], r["display"]) for r in data["rows"] if r["series"] == "A"] == [(378.541, "378.5 megaliters"), (757.082, "757.1 megaliters")]
    assert data["plot"]["unit"] == "megaliters" and "14,689 million gallons x 3.78541 = 55,603 megaliters" in receipt(parse(page), "s-1")
    errors = []
    assert vp.check_plate_blocks("page", page, bp.load_claims(tmp_path / "site"), errors) == 1 and not errors, errors
    rejected(tmp_path / "x", "needs its arithmetic", plate, [bp.sample_claim("s-1", 1, unit="million gallons", series={"2024": 1}), claims[1]])


def test_units_can_be_renamed_not_converted(tmp_path):
    claims = [bp.sample_claim("s-1"), bp.sample_claim("s-2", 12, "partly", unit="Wh (nearly)"), bp.sample_claim("s-3", None)]
    plate = bp.sample_plate(plot={"type": "ladder", "scale": "log", "units": {"Wh (nearly)": "Wh"}})
    _, data, _ = built(tmp_path, plate, claims)
    assert data["rows"][1]["display"] == "12 Wh" and data["rows"][1]["value"] == 12


@pytest.mark.parametrize("plot, match", [
    ({"type": "bars", "scale": "log"}, "never bars"),
    ({"type": "pie"}, "plot.type"),
    ({"type": "ladder", "domain": [0, 1]}, "would clip"),
    ({"type": "ladder", "scale": "log", "domain": [0, 100]}, "positive domain"),
])
def test_plot_rules(tmp_path, plot, match):
    rejected(tmp_path, match, bp.sample_plate(plot=plot))


def test_our_prose_keeps_the_house_style_and_source_words_stay_verbatim(tmp_path):
    rejected(tmp_path, "em dash", bp.sample_plate(title="A \u2014 B"))
    page, data, claims = built(tmp_path)
    assert "\u2014" not in page and " -- " not in page and "\u2014" in claims["s-1"]["quote"]
    assert "The figure &#8212; as stated &#45;- is &lt;b&gt;0.24&lt;/b&gt; Wh" in page
    assert "quote" not in data["receipts"]["s-1"] and data["receipts"]["s-1"]["title"] == claims["s-1"]["source"]["title"], "the Sources list holds the words once"


def test_source_words_cannot_break_out_of_the_data_block(tmp_path):
    claims = [bp.sample_claim("s-1", quote="</script><script>alert(1)</script> <!-- x")]
    page, data, _ = built(tmp_path, bp.sample_plate(rows=[{"id": "a", "label": "A <b>", "claim": "s-1"}]), claims)
    assert page.count("<script") == 1 and "alert(1)</script>" not in page and "<b>" not in page
    assert "&lt;/script&gt;&lt;script&gt;alert(1)" in page


def test_lines_read_a_claims_series_and_every_point_keeps_its_claim(tmp_path):
    page, data, _ = built(tmp_path, lines_plate(), LINE_CLAIMS)
    assert [(r["key"], r["series"], r["value"], r["claim"]) for r in data["rows"]] == [
        ("2020", "A", 1, "s-1"), ("2021", "A", 2, "s-1"), ("2022", "A", 3, "s-1"), ("2021", "B", 4, "s-2"), ("2022", "B", 5, "s-2")]
    assert data["default"] == "2022" and data["plot"]["xdomain"] == [2020, 2022] and data["plot"]["domain"] == [0, 5]
    doc = parse(page)
    assert len(doc.all(cls="m-line")) == 2 and len(doc.all(cls="m-line is-on")) == 1
    assert numbers(reading(doc))[:4] == ["3", "2022", "5", "2022"] and "verified" in data["tail"]
    assert doc.one(cls="plate-legend") and doc.one(role="img")


def test_series_keep_the_plates_order_when_a_later_one_starts_first(tmp_path):
    claims = [bp.sample_claim("s-1", 3, series={"2021": 2, "2022": 3}), bp.sample_claim("s-2", 5, series={"2020": 4, "2022": 5})]
    page, data, _ = built(tmp_path, lines_plate(), claims)
    assert list(dict.fromkeys(r["series"] for r in data["rows"])) == ["A", "B"] and data["default"] == "2022"
    legend = parse(page).one(cls="plate-legend").texts("li")
    assert legend.index("A") < legend.index("B")


def test_lines_read_periods_with_an_end_date(tmp_path):
    claims = [bp.sample_claim("s-1", 3, periods=[{"start": "2020-07-01", "end": "2021-06-30", "usd_billion": 1.5, "tag": "x"}, {"end": "2022-06-30", "usd_billion": 2}])]
    plate = bp.sample_plate(plot={"type": "lines"}, default=None, title="{series}", rows=[{"series": "A", "claim": "s-1", "points": "periods"}])
    _, data, _ = built(tmp_path, plate, claims)
    assert [(r["x"], r["value"]) for r in data["rows"]] == [(2021, 1.5), (2022, 2)]


def test_a_series_of_categories_cannot_be_a_line(tmp_path):
    claims = [bp.sample_claim("s-1", 3, series={"Oregon": 1})]
    rejected(tmp_path, "series of years", bp.sample_plate(plot={"type": "lines"}, title="{series}", rows=[{"series": "A", "claim": "s-1", "points": "series"}]), claims)


def test_projection_is_dashed_and_hollow(tmp_path):
    plate = lines_plate()
    plate["plot"]["projected_from"] = 2022
    page, data, _ = built(tmp_path, plate, LINE_CLAIMS)
    doc = parse(page)
    assert len(doc.all(cls="m-line is-proj")) == 2 and all(r.get("hollow") for r in data["rows"] if r["x"] == 2022) and not any(r.get("projected") for r in data["rows"] if r["x"] < 2022)
    assert doc.one(cls="plate-key is-proj")


def test_bars_and_multiples_write_static_marks(tmp_path):
    bars = bp.sample_plate(plot={"type": "bars"}, title="{label}", rows=[{"id": "a", "label": "A", "claim": "s-1"}, {"id": "b", "label": "B", "claim": "s-2"}])
    page, _, _ = built(tmp_path, bars, [bp.sample_claim("s-1", 3), bp.sample_claim("s-2", -2)])
    doc = parse(page)
    assert len(doc.all(cls="ladder-bar")) == 2 and doc.one(cls="ladder-row is-neg") and doc.one(cls="no-needle") and doc.one(data_form="bar")
    many = lines_plate()
    many["plot"] = {"type": "multiples"}
    page, _, _ = built(tmp_path / "x", many, LINE_CLAIMS)
    doc = parse(page)
    assert len(doc.all(cls="m-title")) == 2 and len(doc.all(cls="m-line")) == 2


def by_plate(**row):
    controls = [{"type": "segmented", "name": "boundary", "label": "Boundary", "default": "dc", "options": [{"value": "dc", "label": "Inside"}, {"value": "full", "label": "Whole chain"}]}]
    return bp.sample_plate(by="boundary", controls=controls, default="a", rows=[{"id": "a", "label": "A", "claims": {"dc": "s-1", "full": "s-2"}, "limit": "An old estimate."}, {"id": "b", "label": "B", **row}])


def test_a_row_can_change_claim_with_a_setting(tmp_path):
    page, data, _ = built(tmp_path, by_plate(claims={"dc": None, "full": "s-3"}), [bp.sample_claim("s-1"), bp.sample_claim("s-2", 12, "partly"), bp.sample_claim("s-3", 30)])
    assert data["by"] == "boundary" and [(r["key"], r["when"]) for r in data["rows"]] == [("a", "dc"), ("a", "full"), ("b", "full")]
    doc = parse(page)
    assert bp.NOT_COUNTED in doc.texts(cls="ladder-value") and all(part in doc.one(cls="plate-setting").text() for part in ("Boundary", "Inside"))
    assert all(th.attrs["scope"] == "col" for th in doc.one("thead").all("th")) and "Whole chain" in doc.texts("td")
    assert doc.one("input", value="dc", checked=True) and doc.one(data_param="boundary") and doc.one(cls="plate-controls", data_js=True, hidden=True)


def test_a_setting_outranks_a_built_in_sentence_field(tmp_path):
    page, data, _ = built(tmp_path, by_plate(claim="s-1") | {"reading": "At {boundary}, {label}: {display}."}, [bp.sample_claim("s-1"), bp.sample_claim("s-2", 12, "partly")])
    assert reading(parse(page)).startswith("At Inside, A: 0.24 Wh.") and data["rows"][0]["t"].startswith("At {boundary}, A")


def test_a_row_must_name_every_stop(tmp_path):
    rejected(tmp_path, "must name every stop", by_plate(claims={"dc": "s-1"}))


def test_bars_do_not_take_a_by_control(tmp_path):
    plate = by_plate(claim="s-1")
    plate["plot"] = {"type": "bars"}
    rejected(tmp_path, "keeps a missing row's place", plate)


def test_a_control_default_must_be_on_a_stop(tmp_path):
    rejected(tmp_path, "off its stops", bp.sample_plate(controls=[{"type": "range", "name": "use", "label": "Use", "min": 1, "max": 9, "step": 2, "default": 2}]))


def test_controls_write_native_inputs(tmp_path):
    page, _, _ = built(tmp_path, bp.sample_plate(controls=[{"type": "range", "name": "use", "label": "Use", "min": 1, "max": 9, "step": 2, "default": 3}]))
    doc = parse(page)
    assert doc.one("input", type="range", id="sample-use", min="1", max="9", step="2", value="3")
    assert doc.one("input", type="number", min="1", max="9", step="2", value="3", aria_label=True)
    assert doc.one(cls="slider-stops").texts("span") == ["1", "9"]


def test_markers_must_be_there_once(tmp_path):
    site = bp.sample_site(tmp_path / "site")
    (site / "page.html").write_text("<main>no markers</main>", encoding="utf-8")
    with pytest.raises(bp.BuildError, match="must hold one"):
        bp.build(site)


def test_plates_on_one_page_share_an_address_bar(tmp_path):
    control = [{"type": "range", "name": "use", "label": "Use", "min": 1, "max": 9, "default": 3}]
    site = bp.sample_site(tmp_path / "site", bp.sample_plate(controls=control))
    other = bp.sample_plate(id="other", controls=control)
    (site / "data" / "plates" / "other.json").write_text(json.dumps(other), encoding="utf-8")
    (site / "page.html").write_text("<!-- plate:other --><!-- /plate:other --><!-- plate:sample --><!-- /plate:sample -->", encoding="utf-8")
    with pytest.raises(bp.BuildError, match="already used"):
        bp.build(site)


def test_a_definition_must_be_t0_and_named_for_its_file(tmp_path):
    rejected(tmp_path, "tier must be T0", bp.sample_plate(tier="T1"))
    site = bp.sample_site(tmp_path / "other")
    (site / "data" / "plates" / "renamed.json").write_text((site / "data" / "plates" / "sample.json").read_text(encoding="utf-8"), encoding="utf-8")
    (site / "data" / "plates" / "sample.json").unlink()
    with pytest.raises(bp.BuildError, match="must match the file name"):
        bp.build(site)


def test_every_class_the_kit_writes_has_a_rule():
    css = re.sub(r"/\*.*?\*/", " ", (SITE / "assets" / "css" / "site.css").read_text(encoding="utf-8"), flags=re.S)
    defined = set(re.findall(r"\.([a-zA-Z][\w-]*)", css))
    source = (SCRIPTS / "build_plates.py").read_text(encoding="utf-8") + (SITE / "assets" / "js" / "plate.js").read_text(encoding="utf-8") + (SITE / "assets" / "js" / "plate-svg.js").read_text(encoding="utf-8")
    used = set()
    for match in re.finditer(r"""class(?:=\\?"|: ['`"])([^"'`]+)""", source):
        used.update(name for name in re.split(r"\$?\{", match.group(1))[0].split() if re.fullmatch(r"[a-z][\w-]*", name))
    used |= {"is-on", "is-lead", "is-hollow", "is-neg", "is-pos", "is-proj", "is-solo", "is-b", "is-long", "is-live", "is-entering", "is-zero", "is-right", "is-typed", "is-fixed", "is-band", "has-ticks", "no-needle", "is-sticky"}
    assert len(used) > 30 and not used - defined, sorted(used - defined)


@pytest.mark.parametrize("name", ["plate.js", "plate-svg.js"])
def test_plate_scripts_write_no_markup(name):
    text = (SITE / "assets" / "js" / name).read_text(encoding="utf-8")
    assert not re.search(r"innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function|\bfetch\(", text)
    assert not re.search(r"^\s*(import|export)\s", text, flags=re.M), "a classic deferred script, so page scripts can follow it"


# Formulas -------------------------------------------------------------------------------------------

@pytest.mark.parametrize("expr, result", [
    ("2 + 3 * 4", 14), ("(2 + 3) * 4", 20), ("-a + 3", 2), ("a / b", 1 / 3), ("1e3 * a", 1000), ("min(a, b, 9)", 1), ("max(a, b)", 3),
    ("ifblank(gone, b)", 3), ("ifblank(a, b)", 1), ("gone + 1", None), ("min(gone, 1)", None), ("-gone", None), ("a / 0", None), ("deep.x.y * 2", 8),
])
def test_formula_grammar(expr, result):
    value = bp.evaluate(expr, {"a": 1, "b": 3, "gone": None, "deep": {"x": {"y": 4}}})
    assert value is None if result is None else value == pytest.approx(result)


@pytest.mark.parametrize("expr", ["__import__('os')", "a ** 2", "a.__class__", "open('x')", "[1]", "a if b else c", "deep", "word"])
def test_formula_grammar_stays_small(expr):
    with pytest.raises((ValueError, KeyError, TypeError)):
        bp.evaluate(expr, {"a": 1, "b": 3, "c": 2, "deep": {"x": 1}, "word": "stop"})


def test_a_computed_figure_rounds_to_significant_digits():
    assert bp.rounded(15.0008) == 15 and bp.rounded(14.05) == 14.1 and bp.rounded(1007.4, 2) == 1000 and bp.rounded(0.00008) == 0.00008 and bp.rounded(None) is None
    assert bp.number(bp.rounded(1007.4)) == "1,010" and bp.number(bp.rounded(236.52, 2)) == "240"


# Instrument -----------------------------------------------------------------------------------------

def instrument_plate(**extra):
    return bp.sample_plate(
        title="{mw} MW is {twh[text]} TWh, {share[text]} percent of {region}", default="amw", plot={"type": "instrument"},
        inputs={"region": {"claim": "s-1"}, "factor": {"claim": "s-2"}},
        controls=[{"type": "range", "name": "mw", "label": "MW", "min": 10, "max": 200, "step": 5, "default": 100},
                  {"type": "range", "name": "lf", "label": "Load factor", "min": 0.5, "max": 1, "step": 0.05, "default": 0.8},
                  {"type": "number", "name": "own", "label": "Your figure", "min": 0, "max": 9, "step": 0.1},
                  {"type": "segmented", "name": "extra", "label": "Extra", "default": "off", "options": [{"value": "off", "label": "No"}, {"value": "on", "label": "Yes"}]}],
        reading="{mw} MW at {lf} is {amw[text]} aMW and {twh[text]} TWh. Modeled.",
        rows=[{"id": "amw", "label": "Average MW", "unit": "aMW", "formula": {"value": "mw * lf"}, "equation": "aMW = MW x load factor"},
              {"id": "twh", "label": "Energy", "unit": "TWh", "digits": 2, "formula": {"value": "amw * 8.76 / 1000"}},
              {"id": "share", "label": "Share", "unit": "percent", "formula": {"value": "amw / region * 100"}},
              {"id": "spread", "label": "Spread", "unit": "L", "formula": {"low": "twh * ifblank(own, factor)", "high": "twh * ifblank(own, region)"}},
              {"id": "off", "label": "Off row", "unit": "L", "formula": {"value": "twh * factor"}, "show": {"extra": "on"}, "gap": "Off for now"},
              {"id": "fixed", "label": "Context", "claim": "s-1"}], **extra)


INSTRUMENT_CLAIMS = [bp.sample_claim("s-1", 200, unit="aMW"), bp.sample_claim("s-2", 2.5, unit="L/kWh")]


def test_an_instrument_builds_its_default_setting_statically(tmp_path):
    page, data, _ = built(tmp_path, instrument_plate(), INSTRUMENT_CLAIMS)
    rows = {r["key"]: r for r in data["rows"]}
    assert rows["amw"]["value"] == 80 and rows["amw"]["display"] == "80 aMW" and rows["amw"]["f"] == {"value": "mw * lf"} and "claim" not in rows["amw"]
    assert rows["twh"]["display"] == "0.7 TWh" and rows["share"]["display"] == "40 percent"
    doc = parse(page)
    assert title(doc) == "100 MW is 0.7 TWh, 40 percent of 200", "the title is the finding at the default setting"
    assert rows["spread"]["display"] == "1.75 to 140 L" and rows["off"]["display"] == "Off for now" and "value" not in rows["off"]
    assert all(part in doc.one(cls="plate-setting").text() for part in ("MW: 100", "Load factor: 0.8", "Your figure", "Extra: No"))
    assert "aMW = MW x load factor" in doc.one(cls="plate-facts").text(), "the default row's equation prints without scripts"


def test_a_ruler_runs_to_what_the_settings_can_reach(tmp_path):
    _, data, _ = built(tmp_path, instrument_plate(), INSTRUMENT_CLAIMS)
    rows = {r["key"]: r for r in data["rows"]}
    assert rows["amw"]["axis"]["domain"] == [0, 200] and rows["amw"]["frac"] == 0.4
    assert rows["twh"]["axis"]["domain"] == [0, 2], "200 MW at load factor 1 is 1.752 TWh"


def test_an_instrument_reading_keeps_live_names(tmp_path):
    _, data, _ = built(tmp_path, instrument_plate(), INSTRUMENT_CLAIMS)
    row = next(r for r in data["rows"] if r["key"] == "amw")
    assert row["t"] == "{mw} MW at {lf} is {amw[text]} aMW and {twh[text]} TWh. Modeled."
    assert row["reading"] == "100 MW at 0.8 is 80 aMW and 0.7 TWh. Modeled."
    fixed = next(r for r in data["rows"] if r["key"] == "fixed")
    assert all(part in fixed["reading"] for part in ("Context", "200 aMW", "2025")), "a fixed row keeps a row's own sentence"


def test_a_formula_row_cites_the_claims_it_reads(tmp_path):
    _, data, _ = built(tmp_path, instrument_plate(), INSTRUMENT_CLAIMS)
    rows = {r["key"]: r for r in data["rows"]}
    assert rows["share"]["cites"] == ["s-1"] and sorted(rows["spread"]["cites"]) == ["s-1", "s-2"]
    assert "cites" not in rows["amw"], "the reader's own inputs cite nothing"
    assert data["sources"]["region"] == {"claim": "s-1"} and data["env"]["factor"] == 2.5
    assert sorted(data["receipts"]) == ["s-1", "s-2"]


def test_a_model_number_needs_its_claims_listed(tmp_path):
    site = bp.sample_site(tmp_path / "site", bp.sample_plate(
        model="m", inputs={"x": {"model": "computed_defaults.a"}}, plot={"type": "instrument"}, rows=[{"id": "a", "label": "A", "unit": "Wh", "formula": {"value": "x"}}]), [bp.sample_claim("s-1")])
    (site / "data" / "m.json").write_text(json.dumps({"schema": 1, "tier": "T0", "computed_defaults": {"a": 2.5, "words": "dropped"}}), encoding="utf-8")
    with pytest.raises(bp.BuildError, match="has no claim id"):
        bp.build(site)


@pytest.mark.parametrize("change, match", [
    ({"formula": {"value": "gone + 1"}}, "bad formula"),
    ({"formula": {"value": "2 ** 3"}}, "bad formula"),
    ({"cites": ["nope"]}, "unknown claim"),
])
def test_a_formula_row_can_fail(tmp_path, change, match):
    plate = instrument_plate()
    plate["rows"] = [{"id": "amw", "label": "A", "unit": "aMW", "formula": {"value": "mw"}, **change}]
    rejected(tmp_path, match, plate, INSTRUMENT_CLAIMS)


def test_a_stop_can_stand_for_a_claim_or_another_control(tmp_path):
    controls = [{"type": "number", "name": "typed", "label": "Typed", "min": 1, "max": 3, "step": 0.01, "default": 1.5},
                {"type": "segmented", "name": "pue", "label": "PUE", "default": "a", "options": [{"value": "a", "label": "All", "is": "pue_a"}, {"value": "b", "label": "Yours", "is": "typed"}]}]
    plate = bp.sample_plate(plot={"type": "instrument"}, default="x", inputs={"pue_a": {"claim": "s-1"}}, controls=controls, reading="{pue}: {x[text]}.", title="{x[display]}",
                            rows=[{"id": "x", "label": "X", "unit": "kW", "formula": {"value": "pue * 2"}}])
    page, data, _ = built(tmp_path, plate, [bp.sample_claim("s-1", 1.45)])
    assert data["stands"] == {"pue": {"a": "pue_a", "b": "typed"}} and data["rows"][0]["display"] == "2.9 kW" and data["rows"][0]["cites"] == ["s-1"]
    doc = parse(page)
    assert doc.one("input", type="number", id="sample-typed", min="1", max="3", step="0.01", value="1.5") and "All: 2.9." in reading(doc)
    bad = bp.sample_plate(plot={"type": "instrument"}, default="x", controls=[{**controls[1], "options": [{"value": "a", "label": "A", "is": "gone"}]}], rows=[{"id": "x", "label": "X", "claim": "s-1"}])
    rejected(tmp_path / "x", "stands for gone", bad, INSTRUMENT_CLAIMS)


def test_a_stop_with_nothing_to_stand_for_is_blank(tmp_path):
    controls = [{"type": "segmented", "name": "cool", "label": "Cooling", "default": "dry", "options": [{"value": "wet", "label": "Wet", "is": "w"}, {"value": "dry", "label": "Dry"}]}]
    plate = bp.sample_plate(plot={"type": "instrument"}, default="x", title="{x[display]}", inputs={"w": {"claim": "s-1"}}, controls=controls,
                            rows=[{"id": "x", "label": "X", "unit": "L", "gap": "None on site", "formula": {"value": "cool * 2"}}])
    _, data, _ = built(tmp_path, plate, [bp.sample_claim("s-1", 3)])
    assert data["rows"][0]["display"] == "None on site" and data["rows"][0]["axis"]["domain"] == [0, 6], "the ruler still reaches the wet stop"


def test_a_decimal_stop_is_on_its_step(tmp_path):
    built(tmp_path, bp.sample_plate(controls=[{"type": "range", "name": "lf", "label": "LF", "min": 0.5, "max": 1, "step": 0.05, "default": 0.8}]))


def test_a_preset_may_sit_off_the_slider_step(tmp_path):
    page, _, _ = built(tmp_path, bp.sample_plate(controls=[{"type": "range", "name": "use", "label": "Use", "min": 1, "max": 60, "default": 10, "presets": [2.52, 10]}]))
    doc = parse(page)
    assert doc.one(data_presets="2.52,10") and doc.one("button", data_preset="2.52").text() == "2.52"
    built(tmp_path / "x", bp.sample_plate(controls=[{"type": "range", "name": "use", "label": "Use", "min": 1, "max": 60, "default": 2.52, "presets": [2.52]}]))


def test_a_control_can_wait_in_more_assumptions(tmp_path):
    page, _, _ = built(tmp_path, bp.sample_plate(more="More settings", controls=[{"type": "segmented", "name": "d", "label": "D", "more": True, "options": [{"value": "a", "label": "A"}]}]))
    more = parse(page).one("details", "plate-more")
    assert more.one("summary").text() == "More settings" and more.one(data_param="d")


def test_a_model_reaches_a_plate_as_named_numbers(tmp_path):
    plate = bp.sample_plate(model="m", inputs={"x": {"model": "computed_defaults.a"}, "tree": {"model": "inputs.chat"}}, title="{x:.1f}, {tree[value]}", plot={"type": "ladder"}, default="a",
                            rows=[{"id": "a", "label": "A", "unit": "Wh", "formula": {"value": "x * tree.value"}, "cites": ["s-1"]}])
    site = bp.sample_site(tmp_path / "site", plate, [bp.sample_claim("s-1")])
    (site / "data" / "m.json").write_text(json.dumps({"schema": 1, "tier": "T0", "computed_defaults": {"a": 2.54}, "inputs": {"chat": {"value": 2, "basis": "words", "claims": ["s-1"]}}}), encoding="utf-8")
    bp.build(site)
    page = (site / "page.html").read_text(encoding="utf-8")
    data = json.loads(vp.PLATE_BLOCK.findall(page)[0][1])
    assert data["env"]["tree"] == {"value": 2}, "prose stays in the file"
    assert data["rows"][0]["value"] == 5.08 and title(parse(page)) == "2.5, 2"
    assert data["sources"]["x"] == {"file": "m", "model": "computed_defaults.a"}
    vp.SITE, keep = site, vp.SITE
    try:
        errors = []
        assert vp.check_plate_blocks("page", page, bp.load_claims(site), errors) == 1 and not errors, errors
        (site / "data" / "m.json").write_text(json.dumps({"schema": 1, "tier": "T0", "computed_defaults": {"a": 9}, "inputs": {"chat": {"value": 2}}}), encoding="utf-8")
        vp.check_plate_blocks("page", page, bp.load_claims(site), errors)
        assert any("does not match model m" in e for e in errors), errors
    finally:
        vp.SITE = keep


def test_a_model_path_must_exist(tmp_path):
    plate = bp.sample_plate(model="m", inputs={"x": {"model": "nope"}}, rows=[{"id": "a", "label": "A", "claim": "s-1"}])
    site = bp.sample_site(tmp_path / "site", plate, [bp.sample_claim("s-1")])
    (site / "data" / "m.json").write_text('{"computed_defaults": {}}', encoding="utf-8")
    with pytest.raises(bp.BuildError, match="has nothing at nope"):
        bp.build(site)
    missing = bp.sample_plate(inputs={"x": {"model": "a"}}, rows=[{"id": "a", "label": "A", "claim": "s-1"}])
    rejected(tmp_path / "y", 'needs "model"', missing, [bp.sample_claim("s-1")])


def test_a_model_beside_the_claims_is_not_a_claims_file(tmp_path):
    site = bp.sample_site(tmp_path / "site")
    (site / "data" / "claims" / "m.json").write_text('{"schema": 1, "tier": "T0", "computed_defaults": {"a": 1}}', encoding="utf-8")
    assert "s-1" in bp.load_claims(site) and vp.load_model("m", site)["computed_defaults"] == {"a": 1}


# Matrix ---------------------------------------------------------------------------------------------

def matrix_plate(**extra):
    return bp.sample_plate(title="A matrix", default="water--a", plot={"type": "matrix", "columns": [{"id": "a", "label": "National"}, {"id": "b", "label": "Open"}], "units": {"Wh": "watt-hours"}},
                           rows=[{"id": "water", "label": "Water", "cells": {"a": [{"claim": "s-1", "say": "about {display} on site"}, {"claim": "s-2", "modeled": True}], "b": "Season and stream"}}], **extra)


def test_a_matrix_writes_cells_with_figures_and_words(tmp_path):
    page, data, _ = built(tmp_path, matrix_plate(), [bp.sample_claim("s-1"), bp.sample_claim("s-2", 5)])
    assert [(r["key"], r.get("claim"), r.get("words")) for r in data["rows"]] == [("water--a", "s-1", None), ("water--a", "s-2", None), ("water--b", None, True)]
    assert data["rows"][0]["display"] == "about 0.24 watt-hours on site" and data["rows"][0]["column"] == "National"
    doc = parse(page)
    assert doc.one(data_row="water--a") and "0.24 watt-hours" in doc.texts("strong") and any("0.24 watt-hours on site" in text for text in doc.texts(cls="matrix-figure"))
    assert doc.one(cls="matrix-figure is-hollow") and "Season and stream" in doc.texts(cls="matrix-words")
    assert all(part in data["rows"][2]["reading"] for part in ("Water", "Open", "Season and stream"))
    errors = []
    assert vp.check_plate_blocks("page", page, bp.load_claims(tmp_path / "site"), errors) == 1 and not errors, errors


def test_a_matrix_needs_columns_and_says_a_number_only_through_claims(tmp_path):
    rejected(tmp_path, "plot.columns", bp.sample_plate(plot={"type": "matrix"}, title="M", rows=[{"id": "a", "label": "A", "cells": {}}]))
    bad = matrix_plate()
    bad["rows"][0]["cells"]["a"][0]["say"] = "{display} and 42 more"
    rejected(tmp_path / "x", "number in its own words", bad, [bp.sample_claim("s-1"), bp.sample_claim("s-2", 5)])


# Band, panels, highlight ------------------------------------------------------------------------------

BAND_CLAIMS = [bp.sample_claim("s-1", 3, series={"2024": 10, "2025": 20, "2026": 30}), bp.sample_claim("s-2", 5, series={"2024": 12, "2025": 40, "2026": 60}), bp.sample_claim("s-3", 5, series={"2024": 5, "2025": 6, "2026": 7})]


def band_plate(band, **extra):
    return bp.sample_plate(plot={"type": "lines", "highlight": "A", "projected_from": 2025, "band": band}, default=None, title="{series}", reading="{series}: {display}; {band_low} to {band_high}.",
                           rows=[{"series": "A", "claim": "s-1", "points": "series"}, {"series": "B", "claim": "s-2", "points": "series"}, {"series": "C", "claim": "s-3", "points": "series"}], **extra)


def test_a_band_runs_between_two_series_or_across_all(tmp_path):
    page, data, _ = built(tmp_path, band_plate({"low": "C", "high": "B"}), BAND_CLAIMS)
    assert data["plot"]["band"] == [[2024, 5, 12, 0], [2025, 6, 40, 1], [2026, 7, 60, 1]]
    doc = parse(page)
    assert doc.one(cls="m-band") and doc.one(cls="m-band-edge is-proj") and doc.one(cls="plate-key is-band")
    assert next(r for r in data["rows"] if r["series"] == "A" and r["x"] == 2026)["reading"] == "A: 30 Wh; 7 to 60."
    _, across, _ = built(tmp_path / "x", band_plate({"across": "series"}), BAND_CLAIMS)
    assert across["plot"]["band"] == data["plot"]["band"]


def test_a_band_can_follow_each_points_own_range(tmp_path):
    claims = [bp.sample_claim("s-1", 10, low=5, high=20, year=2030), bp.sample_claim("s-2", 12, low=6, high=30, year=2046), bp.sample_claim("s-3", 9, year=2029)]
    plate = bp.sample_plate(plot={"type": "lines", "band": {"across": "range"}}, default=None, title="{series}", rows=[{"series": "Mid", "claim": c} for c in ("s-3", "s-1", "s-2")])
    _, data, _ = built(tmp_path, plate, claims)
    assert data["plot"]["band"] == [[2030, 5, 20, 0], [2046, 6, 30, 0]]


def money_plate(**extra):
    plate = bp.sample_plate(
        default=None, title="{series} in {year}", reading_group="{series}, {year} (ends {end}): spend {spend}, cash {cash}, buybacks {buy}.", gap="not reported",
        controls=[{"type": "segmented", "name": "co", "label": "Company", "default": "B", "options": [{"value": "A", "label": "A"}, {"value": "B", "label": "B"}]}],
        plot={"type": "multiples", "highlight_by": "co", "panels": [{"id": "spend", "label": "Spending"}, {"id": "cash", "label": "Cash"}, {"id": "buy", "label": "Buybacks"}]},
        rows=[{"panel": "spend", "series": "A", "claim": "s-1", "points": "ends"}, {"panel": "spend", "series": "B", "claim": "s-2", "points": "ends"}, {"panel": "cash", "series": "A", "claim": "s-3", "points": "ends"}, {"panel": "cash", "series": "B", "claim": "s-4", "points": "ends"}],
        table={"by": ["series", "year", "end"], "across": "panel", "labels": {"series": "Company"}}, **extra)
    return plate


def money_claims():
    ends = lambda *values: [{"start": f"{2023 + i}-01-01", "end": f"{2024 + i}-06-30", "usd_billion": v} for i, v in enumerate(values)]
    return [bp.sample_claim("s-1", 1, unit="USD billion", ends=ends(1, 2)), bp.sample_claim("s-2", 2, unit="USD billion", ends=ends(3, 400)),
            bp.sample_claim("s-3", 1, unit="USD billion", ends=ends(50, 60)), bp.sample_claim("s-4", 2, unit="USD billion", ends=ends(70))]


def test_panels_have_their_own_axes_and_one_sentence_per_company_year(tmp_path):
    page, data, _ = built(tmp_path, money_plate(), money_claims())
    panels = {p["id"]: p for p in data["plot"]["panels"]}
    assert panels["spend"]["domain"] == [0, 400] and panels["cash"]["domain"] == [0, 80] and panels["cash"]["title"] == "Cash (USD billion)"
    assert data["default"] == "2025" and data["plot"]["highlight"] == "B"
    assert data["readings"]["2025|B|"] == "B, 2025 (ends 06/30/2025): spend 400, cash not reported, buybacks not reported."
    doc = parse(page)
    assert "B, 2025 (ends 06/30/2025): spend 400" in reading(doc), "the default sentence is on the page"
    assert not any("reading" in r for r in data["rows"]), "the sentence lives once per company and year"
    assert {"Company", "Spending"} <= set(doc.texts("th", scope="col")) and "06/30/2025" in doc.texts("td")
    assert len(doc.all(cls="m-title")) == 3 and doc.one(cls="plate-key is-on")


def test_each_panel_keeps_one_unit(tmp_path):
    claims = money_claims()
    claims[2]["unit"] = "percent"
    rejected(tmp_path, "panel cash, one unit", money_plate(), claims)


def test_a_row_needs_a_panel_the_plot_names(tmp_path):
    plate = money_plate()
    plate["rows"][0]["panel"] = "other"
    rejected(tmp_path, "every row needs a panel", plate, money_claims())


def test_a_point_can_be_its_own_selection(tmp_path):
    claims = [bp.sample_claim("s-1", 10, year=2024), bp.sample_claim("s-2", None, low=300, high=500, year=2028)]
    plate = bp.sample_plate(plot={"type": "multiples", "select": "point", "panels": [{"id": "p", "label": "P"}]}, default="a", title="{series}: {display}",
                            rows=[{"id": "a", "panel": "p", "series": "New", "claim": "s-1"}, {"id": "b", "panel": "p", "series": "Old", "claim": "s-2", "modeled": True, "dx": 8}])
    page, data, _ = built(tmp_path, plate, claims)
    assert [r["key"] for r in data["rows"]] == ["a", "b"] and data["plot"]["dots"] is True
    doc = parse(page)
    assert not doc.all(cls="m-needle") and doc.one(cls="m-range") and doc.one(cls="m-dot is-solo")


def test_a_row_can_set_its_own_x(tmp_path):
    plate = bp.sample_plate(plot={"type": "lines"}, default=None, title="{series}", rows=[{"series": "A", "claim": "s-1", "x": 2027}])
    _, data, _ = built(tmp_path, plate, [bp.sample_claim("s-1")])
    assert data["rows"][0]["x"] == 2027 and data["rows"][0]["key"] == "2027"


# Rulers and rows --------------------------------------------------------------------------------------

def test_two_rulers_hold_separate_axes_and_labels(tmp_path):
    claims = [bp.sample_claim("s-1", 1, unit="L/kWh"), bp.sample_claim("s-2", 100, unit="GW")]
    plate = bp.sample_plate(title="{label}", default="x", plot={"type": "ladder", "groups": [{"id": "a", "label": "Basis A", "domain": [0, 2], "mark": "bar"}, {"id": "b", "label": "Basis B"}]},
                            rows=[{"id": "x", "group": "a", "label": "X", "claim": "s-1"}, {"id": "y", "group": "b", "label": "Y", "claim": "s-2"}])
    page, data, _ = built(tmp_path, plate, claims)
    doc = parse(page)
    assert len(doc.all(cls="ladder-group-label")) == 2 and len(doc.all(cls="ladder-axis")) == 2 and doc.one(data_form="bar") and doc.one(data_form="square")
    assert data["rows"][0]["frac"] == 0.5 and data["rows"][1]["frac"] == 1, "each row sits on its own ruler"
    assert [g["unit"] for g in data["plot"]["groups"]] == ["L/kWh", "GW"]
    assert len(doc.all(cls="ladder-bar")) == 1


def test_a_group_of_bars_cannot_be_log(tmp_path):
    plate = bp.sample_plate(default="x", plot={"type": "ladder", "groups": [{"id": "a", "scale": "log", "mark": "bar"}]}, rows=[{"id": "x", "group": "a", "label": "X", "claim": "s-1"}])
    rejected(tmp_path, "never bars", plate, [bp.sample_claim("s-1")])


def test_a_row_can_cite_more_claims_and_every_receipt_ships(tmp_path):
    claims = [bp.sample_claim("s-1"), bp.sample_claim("s-2", 12), bp.sample_claim("s-3", status="partly", limit="Only one quarter."), bp.sample_claim("s-4", 9)]
    plate = bp.sample_plate(title="{label}", rows=[{"id": "a", "label": "A", "claim": "s-1", "cites": ["s-2", "s-3"]}, {"id": "b", "label": "B", "claim": "s-4"}])
    page, data, _ = built(tmp_path, plate, claims)
    assert data["rows"][0]["cites"] == ["s-2", "s-3"] and sorted(data["receipts"]) == ["s-1", "s-2", "s-3", "s-4"]
    doc = parse(page)
    assert data["receipts"]["s-3"]["limit"] == "Only one quarter." and "Only one quarter." in receipt(doc, "s-3")
    assert sorted(node.attrs["data-claim"] for node in doc.all(data_claim=True)) == ["s-1", "s-2", "s-3", "s-4"]
    errors = []
    assert vp.check_plate_blocks("page", page, bp.load_claims(tmp_path / "site"), errors) == 1 and not errors, errors


def test_a_cited_partly_claim_needs_a_limit(tmp_path):
    plate = bp.sample_plate(rows=[{"id": "a", "label": "A", "claim": "s-1", "cites": ["s-2"]}])
    rejected(tmp_path, "its limit must reach the page", plate, [bp.sample_claim("s-1"), bp.sample_claim("s-2", status="partly")])
    allowed = bp.sample_plate(limits={"s-2": "Written on the plate."}, rows=[{"id": "a", "label": "A", "claim": "s-1", "cites": ["s-2"]}])
    _, data, _ = built(tmp_path / "x", allowed, [bp.sample_claim("s-1"), bp.sample_claim("s-2", status="partly")])
    assert data["receipts"]["s-2"]["limit"] == "Written on the plate."


def test_a_range_can_come_from_another_claim_or_be_left_out(tmp_path):
    claims = [bp.sample_claim("s-1", 649), bp.sample_claim("s-2", None, low=521, high=843), bp.sample_claim("s-3", 0.36, low=0.45, high=0.48)]
    plate = bp.sample_plate(title="{label}", plot={"type": "ladder"}, rows=[{"id": "a", "label": "A", "claim": "s-1", "range_from": "s-2"}, {"id": "b", "label": "B", "claim": "s-3", "range": False}])
    page, data, _ = built(tmp_path, plate, claims)
    assert data["rows"][0]["display"] == "649 (521 to 843) Wh" and data["rows"][0]["cites"] == ["s-2"]
    assert data["rows"][1]["display"] == "0.36 Wh" and "low" not in data["rows"][1]
    errors = []
    assert vp.check_plate_blocks("page", page, bp.load_claims(tmp_path / "site"), errors) == 1 and not errors, errors


def test_a_shortfall_can_read_as_a_minus(tmp_path):
    plate = bp.sample_plate(title="{label}", plot={"type": "ladder", "signed": True}, rows=[{"id": "a", "label": "A", "claim": "s-1", "negate": True}, {"id": "b", "label": "B", "claim": "s-2"}])
    page, data, _ = built(tmp_path, plate, [bp.sample_claim("s-1", 19, unit="percent"), bp.sample_claim("s-2", 35, unit="percent")])
    assert data["rows"][0]["display"] == "-19 percent" and data["rows"][1]["display"] == "+35 percent" and data["rows"][0]["negated"] is True
    doc = parse(page)
    assert doc.one(cls="ladder-row is-neg") and doc.one(cls="ladder-row is-pos") and doc.one(cls="is-zero")
    errors = []
    assert vp.check_plate_blocks("page", page, bp.load_claims(tmp_path / "site"), errors) == 1 and not errors, errors


def bars_plate(**extra):
    return bp.sample_plate(title="{label}", default="big", plot={"type": "bars", "sort": "order", "signed": True, "projected": True, "axis_label": "Projected percent", "marks": [{"id": "all", "label": "All", "claim": "s-3"}]},
                           controls=[{"type": "segmented", "name": "order", "label": "Sort", "default": "value", "options": [{"value": "value", "label": "By change"}, {"value": "tag", "label": "By group"}]}],
                           rows=[{"id": "small", "label": "Small", "claim": "s-2"}, {"id": "big", "label": "Big", "claim": "s-1", "tag": "Trade"}], **extra)


def test_bars_sort_mark_a_baseline_and_cap_a_projection(tmp_path):
    claims = [bp.sample_claim("s-1", 34.6, unit="percent"), bp.sample_claim("s-2", -25.5, unit="percent"), bp.sample_claim("s-3", 3.5, unit="percent")]
    page, data, _ = built(tmp_path, bars_plate(), claims)
    assert [r["key"] for r in data["rows"]] == ["big", "small"], "biggest first"
    doc = parse(page)
    assert [node.attrs["data-row"] for node in doc.all(cls="ladder-row")] == ["big", "small"] and doc.one(cls="ladder-bar is-hollow is-proj")
    assert "+3.5 percent" in doc.one(cls="ladder-tick", data_mark="all").text() and "Projected percent" in doc.texts(cls="ladder-group-label")
    assert "Trade" in doc.texts(cls="ladder-tag") and data["rows"][0]["display"] == "+34.6 percent"
    assert "s-3" in data["receipts"] and data["cites"] == ["s-3"], "a mark's claim ships a receipt"


def test_a_pair_of_marks_by_fiscal_year(tmp_path):
    plate = bp.sample_plate(title="{label}, {year}", by="fy", default="a", plot={"type": "ladder"}, reading_group="{label}, {year}: spend {spend} against {cash}.",
                            controls=[{"type": "segmented", "name": "fy", "label": "Year", "default": "latest", "options": [{"value": "2024", "label": "2024"}, {"value": "latest", "label": "Latest"}]}],
                            rows=[{"id": "a", "label": "A", "pair": [{"id": "spend", "name": "Spending", "claim": "s-1", "points": "ends"}, {"id": "cash", "name": "Cash", "claim": "s-3", "points": "ends"}]}])
    page, data, _ = built(tmp_path, plate, money_claims())
    assert [(r["when"], r["series"], r["value"]) for r in data["rows"]] == [("2024", "Spending", 1), ("2024", "Cash", 50), ("latest", "Spending", 2), ("latest", "Cash", 60)]
    assert data["readings"]["a||latest"] == "A, 2025: spend 2 against 60." and data["plot"]["pair_names"] == ["Spending", "Cash"]
    doc = parse(page)
    value = doc.one(cls="ladder-value").text()
    assert numbers(value) == ["2", "60"] and value.endswith("USD billion") and doc.one(cls="ladder-mark is-b")
    assert any("--x2" in node.style() for node in doc.all(style=True))


def test_ticks_can_wait_for_a_setting(tmp_path):
    plate = bp.sample_plate(title="{label}", inputs={"yard": {"claim": "s-2"}}, default="a",
                            controls=[{"type": "segmented", "name": "y", "label": "Y", "default": "a", "options": [{"value": "a", "label": "A"}, {"value": "b", "label": "B"}]}],
                            plot={"type": "ladder", "scale": "log", "marks": [{"id": "m1", "label": "One", "value": "yard", "unit": "Wh", "when": {"y": "a"}}, {"id": "m2", "label": "Two", "claim": "s-2", "when": {"y": "b"}}]},
                            rows=[{"id": "a", "label": "A", "claim": "s-1"}])
    page, data, _ = built(tmp_path, plate, [bp.sample_claim("s-1"), bp.sample_claim("s-2", 12)])
    doc = parse(page)
    assert "--x" in doc.one(data_mark="m1").style() and doc.one(data_mark="m2", hidden=True) and "12 Wh" in doc.one(data_mark="m1").text()
    assert data["plot"]["marks"][0]["f"] == {"value": "yard"} and doc.one(cls="has-ticks")


def test_a_count_view_adds_its_own_control(tmp_path):
    plate = bp.sample_plate(title="{label}", inputs={"prompt": {"claim": "s-1"}}, default="a", plot={"type": "ladder", "scale": "log", "count": {"unit": "prompt", "noun": "text prompt"}},
                            rows=[{"id": "a", "label": "A", "claim": "s-2"}])
    page, data, _ = built(tmp_path, plate, [bp.sample_claim("s-1"), bp.sample_claim("s-2", 12)])
    assert data["plot"]["count"] == {"unit": "prompt", "noun": "text prompt", "nouns": "text prompts", "cap": 200, "control": "sample-plot"}
    doc = parse(page)
    assert doc.one(data_param="sample-plot") and doc.one("input", value="ruler", checked=True) and "s-1" in data["receipts"]
    assert not any("View" in text for text in doc.texts(cls="plate-setting")), "the view is not a setting of the figure"


def test_the_static_detail_shows_only_the_segments_its_stop_counts(tmp_path):
    claims = [bp.sample_claim("s-1"), bp.sample_claim("s-2", 12)]
    parts = [{"label": "Here", "value": "a"}, {"label": "Later", "value": "b", "at": ["whole"]}]
    plate = bp.sample_plate(title="{label}", by="edge", default="x", inputs={"a": {"claim": "s-1"}, "b": {"claim": "s-2"}}, plot={"type": "ladder"},
                            controls=[{"type": "segmented", "name": "edge", "label": "Edge", "default": "dc", "options": [{"value": "dc", "label": "Inside"}, {"value": "whole", "label": "Whole"}]}],
                            rows=[{"id": "x", "label": "X", "unit": "Wh", "cites": ["s-1", "s-2"], "segments": parts, "formula": {"dc": {"value": "a"}, "whole": {"value": "a + b"}}}])
    page, data, _ = built(tmp_path, plate, claims)
    facts = parse(page).one(cls="plate-facts")
    assert len(facts.all(cls="plate-seg")) == 1 and "Here" in facts.text() and "Later" not in facts.text()
    assert data["rows"][0]["segments"][1]["at"] == ["whole"], "plate.js filters the same way when the stop changes"


def test_one_series_can_carry_its_own_group_reading(tmp_path):
    plate = money_plate(reading_for={"B": "{series} alone, {year}: spend {spend}."})
    _, data, _ = built(tmp_path, plate, money_claims())
    assert any(text.startswith("B alone, ") for text in data["readings"].values())
    assert all(not text.startswith("A alone, ") for text in data["readings"].values())


def test_a_figure_beside_the_plot_ships_its_receipt(tmp_path):
    claims = [bp.sample_claim("s-1"), bp.sample_claim("s-2", 12), bp.sample_claim("s-3", 5, status="partly", limit="One year only.")]
    plate = bp.sample_plate(title="{label}", also=[{"claim": "s-2", "label": "Beside it", "say": "about {display} a year"}],
                            rows=[{"id": "a", "label": "A", "claim": "s-1", "also": [{"claim": "s-3", "label": "Row note"}]}])
    page, data, _ = built(tmp_path, plate, claims)
    assert data["also"][0] == {"label": "Beside it", "display": "about 12 Wh a year", "claim": "s-2"}
    note = data["also"][1]
    assert (note["at"], note["label"], note["claim"]) == ("a", "Row note", "s-3") and note["display"].startswith("5 Wh") and note["display"].endswith("One year only.")
    assert sorted(data["receipts"]) == ["s-1", "s-2", "s-3"] and any("about 12 Wh a year" in text for text in parse(page).one(cls="plate-also").texts("li"))


def test_plain_detail_sentences_print_in_the_detail(tmp_path):
    plate = bp.sample_plate(title="{label}", details=["A fleet average cannot describe a stream."], rows=[{"id": "a", "label": "A", "claim": "s-1", "detail": "Region here means a power region, 2 of them.", "note": "Assumed."}],
                            table={"columns": [{"label": "Row", "field": "label"}, {"label": "Boundary", "field": "boundary"}]})
    page, data, _ = built(tmp_path, plate, [bp.sample_claim("s-1")])
    doc = parse(page)
    facts = doc.one(cls="plate-facts").text()
    assert "A fleet average cannot describe a stream." in facts and "Region here means a power region" in facts and "Assumed." in facts
    assert data["details"] == ["A fleet average cannot describe a stream."] and "Counted: the data center. Not counted: the network." in doc.texts("td")


def test_a_foot_links_out(tmp_path):
    page, _, _ = built(tmp_path, bp.sample_plate(foot=[{"text": "This does not decide a proposal.", "href": "../x/#y", "link": "Read the questions"}]))
    foot = parse(page).one(cls="plate-foot")
    assert "This does not decide a proposal." in foot.text() and foot.one("a", href="../x/#y").text() == "Read the questions"


@pytest.mark.parametrize("text", ["Resolution #2026-039 charged it", "by 2030, as of 11/2026 or 11/04/2026", "location-based Scope 2 and CO2", "GPT-5 and FY2026"])
def test_our_sentences_may_name_dates_and_names_with_digits(tmp_path, text):
    built(tmp_path, bp.sample_plate(text=[text]))


@pytest.mark.parametrize("text", ["It used 42 Wh", "about 2,500 average megawatts", "the 3 companies", "17 percent"])
def test_our_sentences_may_not_type_a_quantity(tmp_path, text):
    rejected(tmp_path, "number in its own words", bp.sample_plate(text=[text]))


def test_a_sentence_can_read_any_claim_and_ships_its_receipt(tmp_path):
    claims = [bp.sample_claim("s-1"), bp.sample_claim("s-2", 2500.4, series={"2030": 178.26}), bp.sample_claim("s-3", 7)]
    plate = bp.sample_plate(title="About {c[s-2][value]:,.0f}, and {c[s-2][series][2030]:.0f}, of {c[s-3][display]}", rows=[{"id": "a", "label": "A", "claim": "s-1"}])
    page, data, _ = built(tmp_path, plate, claims)
    assert title(parse(page)) == "About 2,500, and 178, of 7 Wh" and sorted(data["receipts"]) == ["s-1", "s-2", "s-3"] and data["cites"] == ["s-2", "s-3"]
    rejected(tmp_path / "x", "bad placeholder", bp.sample_plate(title="{c[nope][value]}", rows=[{"id": "a", "label": "A", "claim": "s-1"}]), claims)


def test_custom_table_columns(tmp_path):
    plate = bp.sample_plate(title="{label}", default="a", inputs={"unit_wh": {"claim": "s-2"}}, fields={"times": {"formula": "value / unit_wh", "digits": 2}}, reading="{label}: {display}, or {times} times.",
                            rows=[{"id": "a", "label": "A", "claim": "s-1", "cols": {"overhead": "GPU only"}}],
                            table={"columns": [{"label": "Row", "field": "label"}, {"label": "Wh", "field": "value"}, {"label": "Times", "field": "times"}, {"label": "Overhead", "field": "overhead"}, {"label": "Claims", "field": "claims"}]})
    page, data, _ = built(tmp_path, plate, [bp.sample_claim("s-1", 12), bp.sample_claim("s-2", 3)])
    assert data["fields"] == {"times": ["value / unit_wh", 2]} and data["rows"][0]["fields"] == {"times": "4"}
    assert data["rows"][0]["reading"] == "A: 12 Wh, or 4 times." and data["rows"][0]["t"] == "A: 12 Wh, or {times} times."
    doc = parse(page)
    assert doc.one(cls="plate-table").texts("td") == ["12", "4", "GPU only", "s-1"] and doc.one("td", data_cell="a||times").text() == "4"


# Page build, bench rows, poured figures --------------------------------------------------------------

def two_pages(tmp_path):
    site = bp.sample_site(tmp_path / "site")
    (site / "other").mkdir()
    (site / "other" / "index.html").write_text("<!-- plate:second --><!-- /plate:second -->", encoding="utf-8")
    second = bp.sample_plate(id="second", page="other/index.html")
    (site / "data" / "plates" / "second.json").write_text(json.dumps(second), encoding="utf-8")
    return site


@pytest.mark.parametrize("name", ["other/index.html", "site/other/index.html", "./other/index.html", "other\\index.html"])
def test_page_builds_one_page(tmp_path, name):
    site = two_pages(tmp_path)
    assert bp.build(site, name) == {"plates": 1, "pages_written": ["other/index.html"]}
    assert "old" in (site / "page.html").read_text(encoding="utf-8"), "the other page is left alone"


def test_page_build_ignores_another_builders_broken_plate(tmp_path):
    site = two_pages(tmp_path)
    (site / "data" / "plates" / "sample.json").write_text("{mid-edit", encoding="utf-8")
    assert bp.build(site, "other/index.html")["plates"] == 1
    with pytest.raises(bp.BuildError, match="not valid JSON"):
        bp.build(site)


def test_page_build_needs_a_page(tmp_path):
    with pytest.raises(bp.BuildError, match="no page at"):
        bp.build(two_pages(tmp_path), "nope.html")


def test_a_bench_row_carries_a_plates_reading_to_another_page(tmp_path):
    site = two_pages(tmp_path)
    (site / "other" / "deep").mkdir()
    (site / "other" / "deep" / "index.html").write_text("<!-- bench:sample -->\nold\n<!-- /bench:sample -->", encoding="utf-8")
    assert bp.build(site, "other/deep/index.html") == {"plates": 0, "pages_written": ["other/deep/index.html"]}
    text = (site / "other" / "deep" / "index.html").read_text(encoding="utf-8")
    doc = parse(text)
    assert doc.one("a", href="../../page.html#sample") and doc.one(cls="bench-ruler") and all(part in doc.text() for part in ("Row A", "0.24 Wh", "2025"))
    assert bp.build(site, "other/deep/index.html")["pages_written"] == [], "a second run changes nothing"
    (site / "other" / "deep" / "index.html").write_text("<!-- bench:gone --><!-- /bench:gone -->", encoding="utf-8")
    with pytest.raises(bp.BuildError, match="no definition"):
        bp.build(site, "other/deep/index.html")


def test_a_figure_pours_from_its_claim(tmp_path):
    site = bp.sample_site(tmp_path / "site")
    (site / "about.html").write_text('<p><span data-pour="s-1">x</span> <b data-field="unit" data-pour="s-1">x</b> <a class="receipt" data-pour="s-1" data-field="source" href="#">x</a></p>'
                                     '<p><span data-pour="s-2" data-field="text">x</span> <span data-pour="s-2" data-field="limit">x</span></p>', encoding="utf-8")
    claims = [bp.sample_claim("s-1"), bp.sample_claim("s-2", 12, "partly", limit="An old estimate."), bp.sample_claim("s-3", None)]
    (site / "data" / "claims" / "sample.json").write_text(json.dumps({"schema": 1, "tier": "T0", "cluster": "sample", "claims": claims}), encoding="utf-8")
    bp.build(site)
    text = (site / "about.html").read_text(encoding="utf-8")
    doc = parse(text)
    assert doc.one("span", data_pour="s-1").text() == "0.24 Wh" and doc.one("b", data_pour="s-1", data_field="unit").text() == "Wh"
    assert doc.one(data_pour="s-2", data_field="limit").text() == "An old estimate." and doc.one(data_pour="s-2", data_field="text").text() == "12"
    assert doc.one("a", data_pour="s-1", data_field="source", href="https://example.org/files/users/report.pdf").text() == "Example Agency"
    assert bp.build(site)["pages_written"] == []
    errors = []
    vp.check_poured("about", text, bp.load_claims(site), errors)
    assert not errors, errors


@pytest.mark.parametrize("body, match", [
    ('<span data-pour="gone">x</span>', "unknown claim"),
    ('<span data-pour="s-2">x</span>', "its limit must be on the page"),
    ('<span data-pour="s-1" data-field="nope">x</span>', "unknown data-field"),
])
def test_a_figure_can_fail(tmp_path, body, match):
    site = bp.sample_site(tmp_path / "site", None, [bp.sample_claim("s-1"), bp.sample_claim("s-2", 12, "partly", limit="Old."), bp.sample_claim("s-3", None)])
    (site / "about.html").write_text(body, encoding="utf-8")
    with pytest.raises(bp.BuildError, match=match):
        bp.build(site, "about.html")


# Export ---------------------------------------------------------------------------------------------

def evidence_dir(tmp_path, claims, name="x"):
    folder = tmp_path / "evidence"
    folder.mkdir(exist_ok=True)
    (folder / f"{name}.json").write_text(json.dumps({"cluster": name, "generated": "today", "claims": claims}), encoding="utf-8")
    return folder


def test_export_ships_only_checked_claims_with_tier_and_schema(tmp_path):
    claims = [bp.sample_claim("x-1"), bp.sample_claim("x-2", status="partly", limit="A limit."), bp.sample_claim("x-3", status="unverified")]
    claims[0]["recheck"] = {"jev": "PARTIAL"}
    claims[0]["series"] = {"2021": 1}
    assert bp.export_claims(evidence_dir(tmp_path, claims), tmp_path / "out") == {"x": 2}
    shipped = json.loads((tmp_path / "out" / "x.json").read_text(encoding="utf-8"))
    assert shipped["tier"] == "T0" and shipped["schema"] == 1 and shipped["cluster"] == "x" and set(shipped) == {"tier", "schema", "cluster", "claims"}
    assert [c["id"] for c in shipped["claims"]] == ["x-1", "x-2"]
    first = shipped["claims"][0]
    assert "note" not in first and "recheck" not in first, "working notes stay local"
    assert first["series"] == {"2021": 1} and shipped["claims"][1]["limit"] == "A limit."
    assert "\u2014" in first["quote"] and "\u2014" in first["source"]["title"], "source words stay verbatim"
    errors = []
    vp.check_claim_file(shipped, "x", {}, errors)
    assert not errors


@pytest.mark.parametrize("change, match", [
    ({"boundary": "From C:\\work\\notes.txt"}, "Local path"),
    ({"boundary": "From /Users/someone/file"}, "Local path"),
    ({"derived": "ask someone@example.org"}, "email"),
    ({"quote": "write to a.person@atnitribes.org"}, "email"),
    ({"boundary": "A \u2014 B"}, "em dash"),
    ({"metric": "energy -- per use"}, "em dash"),
    ({"entity": "the tribal utility"}, "lowercase house-style"),
    ({"quote": ""}, "quote"),
    ({"source": {"title": "t", "publisher": "p", "url": "http://x.org/a", "published": "2025-01-01", "kind": "press"}}, "https"),
])
def test_export_fails_and_writes_nothing(tmp_path, change, match):
    folder = evidence_dir(tmp_path, [bp.sample_claim("x-1", **change)])
    with pytest.raises(bp.BuildError, match=match):
        bp.export_claims(folder, tmp_path / "out")
    assert not (tmp_path / "out").exists()


def test_export_allows_a_web_address_with_users_in_its_path(tmp_path):
    claim = bp.sample_claim("x-1")
    claim["source"]["url"] = "https://www.agc.org/sites/default/files/users/user21902/report%20(4).pdf"
    assert bp.export_claims(evidence_dir(tmp_path, [claim]), tmp_path / "out") == {"x": 1}


def test_export_allows_an_unchecked_bad_claim_to_stay_behind(tmp_path):
    bad = bp.sample_claim("x-2", status="unverified", boundary="From C:\\work\\notes.txt")
    assert bp.export_claims(evidence_dir(tmp_path, [bp.sample_claim("x-1"), bad]), tmp_path / "out") == {"x": 1}


def test_export_finds_clusters_and_skips_other_files(tmp_path):
    folder = evidence_dir(tmp_path, [bp.sample_claim("x-1")])
    (folder / "x-jev.json").write_text("[]", encoding="utf-8")
    (folder / "tmp-check.json").write_text('{"claims": []}', encoding="utf-8")
    assert bp.export_claims(folder, tmp_path / "out") == {"x": 1}
    assert [p.name for p in (tmp_path / "out").iterdir()] == ["x.json"]


def test_export_rejects_an_id_used_twice_across_clusters(tmp_path):
    folder = evidence_dir(tmp_path, [bp.sample_claim("x-1")], "x")
    evidence_dir(tmp_path, [bp.sample_claim("x-1")], "y")
    with pytest.raises(bp.BuildError, match="duplicate id"):
        bp.export_claims(folder, tmp_path / "out")


def test_a_shipped_file_passes_the_page_rules(tmp_path):
    bp.export_claims(evidence_dir(tmp_path, [bp.sample_claim("x-1")]), tmp_path / "out")
    text = (tmp_path / "out" / "x.json").read_text(encoding="utf-8")
    errors = []
    vp.check_text("x", text, errors)
    assert not errors and not any(vp.EM_DASH.search(s) for s in vp.our_prose(json.loads(text)))


# Validator ------------------------------------------------------------------------------------------

def claim_errors(**change):
    data = {"schema": 1, "tier": "T0", "claims": [{**bp.sample_claim("x-1"), **change}]}
    errors = []
    vp.check_claim_file(data, "c", {}, errors)
    return errors


def test_claim_check_passes_a_good_claim():
    assert claim_errors() == []


@pytest.mark.parametrize("change, match", [
    ({"id": ""}, "needs an id"),
    ({"id": None}, "needs an id"),
    ({"quote": "  "}, "quote"),
    ({"quote": None}, "quote"),
    ({"status": "unverified"}, "status"),
    ({"status": None}, "status"),
    ({"source": {"url": "http://x.org/a"}}, "https"),
    ({"source": {"url": "/local"}}, "https"),
    ({"source": None}, "https"),
    ({"note": "write to someone@example.org"}, "email"),
])
def test_claim_check_rejects(change, match):
    assert any(match in error for error in claim_errors(**change))


def test_claim_check_needs_the_header_and_unique_ids():
    errors, seen = [], {}
    vp.check_claim_file({"claims": [bp.sample_claim("x-1"), bp.sample_claim("x-1")]}, "c", seen, errors)
    assert any("tier must be T0" in e for e in errors) and any("duplicate id" in e for e in errors) and list(seen) == ["x-1"]
    errors = []
    vp.check_claim_file({"schema": 1, "tier": "T0", "claims": []}, "c", {}, errors)
    assert any("non-empty" in e for e in errors)


def block_errors(data):
    errors = []
    body = f'<p>x</p><script type="application/json" id="plate-data-a">{data if isinstance(data, str) else json.dumps(data)}</script>'
    claims = {"x-1": bp.sample_claim("x-1", 3, series={"2021": 7}, low=1), "x-2": bp.sample_claim("x-2", 3, "partly")}
    count = vp.check_plate_blocks("page", body, claims, errors)
    assert count == 1
    return errors


def test_plate_block_check_passes_numbers_the_claim_holds():
    rows = [{"key": "a", "claim": "x-1", "value": 3, "low": 1}, {"key": "b", "claim": "x-1", "value": 7}, {"key": "c", "claim": "x-2", "value": 3, "limit": "A limit."}]
    assert block_errors({"rows": rows, "receipts": {"x-1": {}}}) == []


@pytest.mark.parametrize("data, match", [
    ({"rows": [{"key": "a", "claim": "nope"}]}, "unknown claim"),
    ({"rows": [{"key": "a"}]}, "unknown claim"),
    ({"rows": [], "receipts": {"nope": {}}}, "receipt names unknown"),
    ({"rows": [{"key": "a", "claim": "x-1", "value": 4}]}, "rebuild the page"),
    ({"rows": [{"key": "a", "claim": "x-1", "high": 4}]}, "rebuild the page"),
    ({"rows": [{"key": "a", "claim": "x-2", "value": 3}]}, "without its limit"),
    ("{not json", "not valid JSON"),
])
def test_plate_block_check_rejects(data, match):
    assert any(match in error for error in block_errors(data))


def test_a_computed_row_may_hold_a_number_of_its_own_but_its_inputs_may_not():
    computed = {"rows": [{"key": "a", "f": {"value": "x * 2"}, "value": 6}], "env": {"x": 3}, "sources": {"x": {"claim": "x-1"}}, "receipts": {}}
    assert block_errors(computed) == []
    assert any("input x holds a number" in e for e in block_errors({**computed, "env": {"x": 99}}))
    assert any("input x names unknown claim" in e for e in block_errors({**computed, "sources": {"x": {"claim": "nope"}}}))


def test_a_word_cell_holds_words_only():
    assert block_errors({"rows": [{"key": "a", "words": True, "display": "Open"}]}) == []
    assert any("is words but holds a number" in e for e in block_errors({"rows": [{"key": "a", "words": True, "value": 4}]}))


def test_a_cited_claim_must_ship_and_a_partly_one_carry_its_limit():
    assert any("unknown claim 'nope'" in e for e in block_errors({"rows": [{"key": "a", "claim": "x-1", "value": 3, "cites": ["nope"]}]}))
    bad = {"rows": [{"key": "a", "claim": "x-1", "value": 3, "cites": ["x-2"]}], "receipts": {"x-1": {}, "x-2": {}}}
    assert any("cites partly verified claim x-2" in e for e in block_errors(bad))
    good = {"rows": [{"key": "a", "claim": "x-1", "value": 3, "cites": ["x-2"]}], "receipts": {"x-1": {}, "x-2": {"limit": "A limit."}}}
    assert block_errors(good) == []


def test_a_negated_row_and_a_trend_trace_back_to_their_claims():
    assert block_errors({"rows": [{"key": "a", "claim": "x-1", "value": -3, "negated": True}]}) == []
    assert any("rebuild the page" in e for e in block_errors({"rows": [{"key": "a", "claim": "x-1", "value": -3}]}))
    assert block_errors({"rows": [{"key": "a", "claim": "x-1", "value": 3, "spark": [[2021, 7]]}]}) == []
    assert any("rebuild the page" in e for e in block_errors({"rows": [{"key": "a", "claim": "x-1", "value": 3, "spark": [[2021, 8]]}]}))


def test_a_page_with_plates_loads_both_kit_scripts_in_order():
    block = '<script type="application/json" id="plate-data-a">{}</script>'
    good = f'<script defer src="assets/js/plate-svg.js"></script><script defer src="assets/js/plate.js"></script>{block}'
    errors = []
    vp.check_plate_scripts("page", good, errors)
    vp.check_plate_scripts("plain", "<p>no plates</p>", errors)
    assert not errors
    for body in (block, f'<script defer src="assets/js/plate.js"></script>{block}', f'<script defer src="assets/js/plate.js"></script><script defer src="assets/js/plate-svg.js"></script>{block}'):
        errors = []
        vp.check_plate_scripts("page", body, errors)
        assert errors and "plate-svg.js" in errors[0]


def test_a_poured_figure_must_name_a_claim_that_ships():
    claims = {"x-1": bp.sample_claim("x-1", 3), "x-2": bp.sample_claim("x-2", 3, "partly")}
    errors = []
    vp.check_poured("page", '<span data-pour="x-1">3 Wh</span>', claims, errors)
    assert not errors
    vp.check_poured("page", '<span data-pour="nope">3</span>', claims, errors)
    assert any("unknown claim" in e for e in errors)
    errors = []
    vp.check_poured("page", '<span data-pour="x-2">3</span>', claims, errors)
    assert any("its limit must be on the page" in e for e in errors)
    errors = []
    vp.check_poured("page", '<span data-pour="x-2">3</span><span data-pour="x-2" data-field="limit">Old.</span>', claims, errors)
    assert not errors


def test_a_built_page_passes_every_page_check(tmp_path):
    page, _, claims = built(tmp_path)
    errors = []
    assert vp.check_plate_blocks("page", page, claims, errors) == 1
    vp.check_text("page", page, errors)
    assert not errors and not vp.EM_DASH.search(page)


def test_a_page_with_no_plate_has_no_blocks():
    errors = []
    assert vp.check_plate_blocks("page", "<p>plain</p>", {}, errors) == 0 and not errors


def test_local_path_rule_reads_past_web_addresses_only():
    errors = []
    vp.check_text("a", "https://agc.org/files/users/u1/a.pdf", errors)
    assert not errors
    vp.check_text("b", "/Users/me/a.pdf", errors)
    assert errors == ["Local path in b"]


def test_the_explorer_page_prints_no_undefined():
    page = (SITE / "explorer" / "index.html").read_text(encoding="utf-8")
    ours = re.sub(r"<!-- explorer:sources -->.*?<!-- /explorer:sources -->", "", page, flags=re.S)  # a source's own quote may use the word
    assert not re.search(r"\bundefined\b", ours)


# Shipped pages: what a reader sees traces to its claims -------------------------------------------------

@pytest.fixture(scope="module")
def shipped():
    """Every public page as (name, text, parsed), with the claims that ship."""
    pages = []
    for path in sorted(SITE.rglob("*.html")):
        text = path.read_text(encoding="utf-8")
        pages.append((path.relative_to(SITE).as_posix(), text, parse(text)))
    return pages, bp.load_claims(SITE)


def plates(doc, text):
    """Each plate on a page: its figure, and the data block written beside it."""
    return [(doc.one("figure", id=plate_id), json.loads(block)) for plate_id, block in vp.PLATE_BLOCK.findall(text)]


def plate_structure_problems(figure, data):
    """The views, labels, and table a plate needs to work by keyboard and screen reader, and without scripts."""
    plate_id, problems = figure.attrs["id"], []
    views = {node.attrs["value"] for node in figure.all("input", type="radio", name=f"{plate_id}-view")}
    panels = {node.attrs["data-view"] for node in figure.all(cls="plate-view", data_view=True)}
    if views != panels or not {"reading", "sources", "table"} <= panels:
        problems.append(f"{plate_id}: view switch {sorted(views)} does not match its panels {sorted(panels)}")
    if not figure.all(id=figure.attrs.get("aria-labelledby", "none")):
        problems.append(f"{plate_id}: the figure is not labelled by its title")
    for node in figure.all(aria_controls=True):
        if not figure.all(id=node.attrs["aria-controls"]):
            problems.append(f"{plate_id}: aria-controls names no element: {node.attrs['aria-controls']}")
    table = figure.all(cls="plate-table")
    if not table or not table[0].all("thead") or any(th.attrs.get("scope") != "col" for th in table[0].one("thead").all("th")):
        problems.append(f"{plate_id}: the table needs a head of column headers")
    elif not (region := [n for n in figure.all(cls="table-scroll", role="region") if "tabindex" in n.attrs and ("aria-label" in n.attrs or "aria-labelledby" in n.attrs)]) or not region[0].all(cls="plate-table"):
        problems.append(f"{plate_id}: the table scroller needs a role, a name, and keyboard focus")
    if not figure.all(role="status") or not figure.all("output", aria_live="polite"):
        problems.append(f"{plate_id}: changes need a status and a live output")
    return problems


def test_a_built_plate_has_its_views_labels_and_table(tmp_path):
    page, data, _ = built(tmp_path)
    assert plate_structure_problems(parse(page).one("figure"), data) == []


def test_a_broken_plate_structure_is_seen(tmp_path):
    page, data, _ = built(tmp_path)
    for broken in (page.replace('data-view="table"', 'data-view="grid"'), page.replace('aria-labelledby="sample-title"', 'aria-labelledby="gone"'),
                   page.replace('aria-controls="sample-receipt"', 'aria-controls="gone"'), page.replace('role="status"', ""), page.replace('scope="col"', "")):
        assert broken != page and plate_structure_problems(parse(broken).one("figure"), data)


def test_shipped_claims_plates_and_model_pass_the_validator():
    errors = []
    claims = vp.check_claims(errors)
    assert claims and vp.check_plate_files(errors) > 0
    vp.check_resource_model(claims, errors)
    assert not errors, errors


def test_shipped_pages_hold_only_their_claims_numbers(shipped):
    pages, claims = shipped
    errors, blocks = [], 0
    for name, text, _ in pages:
        blocks += vp.check_plate_blocks(name, text, claims, errors)
        vp.check_plate_scripts(name, text, errors)
        vp.check_poured(name, text, claims, errors)
    assert blocks > 0 and not errors, errors


def test_every_poured_figure_on_a_shipped_page_matches_its_claim(shipped):
    pages, claims = shipped
    wrong, seen = [], 0
    for name, _, doc in pages:
        for node in doc.all(data_pour=True):
            seen += 1
            claim = claims[node.attrs["data-pour"]]
            field = node.attrs.get("data-field", "display")
            if node.text() != " ".join(bp.poured_text(claim, field).split()):
                wrong.append(f"{name}: {node.attrs['data-pour']} {field} prints {node.text()!r}; rebuild the page")
            if node.tag == "a" and field == "source" and node.attrs.get("href") != claim["source"]["url"]:
                wrong.append(f"{name}: {node.attrs['data-pour']} links away from its source")
    assert seen and not wrong, wrong


def test_every_claim_a_shipped_plate_uses_keeps_its_receipt(shipped):
    pages, claims = shipped
    wrong, seen = [], 0
    for name, text, doc in pages:
        for figure, data in plates(doc, text):
            plate_id = figure.attrs["id"]
            used = {claim_id for row in data["rows"] for claim_id in [row.get("claim"), *(row.get("cites") or [])] if claim_id}
            wrong += [f"{name} {plate_id}: {claim_id} has no receipt" for claim_id in used - set(data.get("receipts") or {})]
            for claim_id in data.get("receipts") or {}:
                seen += 1
                claim, found = claims[claim_id], figure.all("li", id=f"{plate_id}-source-{claim_id}")
                if not found:
                    wrong.append(f"{name} {plate_id}: no Sources entry for {claim_id}")
                    continue
                words = found[0].text()
                if claim_id not in words or not found[0].all("a", href=claim["source"]["url"]) or " ".join(claim["quote"].split()) not in words:
                    wrong.append(f"{name} {plate_id}: the Sources entry for {claim_id} lost its id, its link, or its quote")
                if claim["status"] == "partly" and not ("partly" in words.lower() and (data["receipts"][claim_id].get("limit") or "?") in words):
                    wrong.append(f"{name} {plate_id}: the Sources entry for {claim_id} lost its limit")
            for node in figure.all(data_claim=True):
                if node.attrs["data-claim"] not in claims:
                    wrong.append(f"{name} {plate_id}: data-claim names unknown claim {node.attrs['data-claim']}")
    assert seen and not wrong, wrong


def test_figures_printed_in_a_shipped_plate_match_a_fresh_build(shipped):
    """Every figure a plate prints, in order, is what its claims build to now; the words around them are free. Nothing is written."""
    pages, claims = shipped
    docs = {name: doc for name, _, doc in pages}
    definitions = [json.loads(path.read_text(encoding="utf-8")) for path in sorted((SITE / "data" / "plates").glob("*.json"))]
    models = {defn["model"]: vp.load_model(defn["model"], SITE) for defn in definitions if defn.get("model")}
    wrong = []
    for defn in definitions:
        fresh = numbers(parse(bp.plate_block(defn, claims, models)[0]).one("figure").text())
        printed = numbers(docs[bp.page_name(defn["page"])].one("figure", id=defn["id"]).text())
        if printed != fresh:
            first = next((i for i, pair in enumerate(zip(printed, fresh)) if pair[0] != pair[1]), min(len(printed), len(fresh)))
            wrong.append(f"{defn['page']} {defn['id']}: figure {first} prints {printed[first:first + 1]}, its claims build {fresh[first:first + 1]}; rebuild the page")
    assert definitions and not wrong, wrong


def test_shipped_workbench_tabs_point_at_their_panels_in_order(shipped):
    pages, _ = shipped
    strips = 0
    for name, _, doc in pages:
        for strip in doc.all("nav", cls="section-strip", data_workbench=True):
            strips += 1
            targets = [a.attrs["href"].removeprefix("#") for a in strip.all("a") if a.attrs.get("href", "").startswith("#")]
            panels = [node.attrs["id"] for node in doc.all(cls="panel", id=True)]
            assert strip.all("ul") and strip.attrs.get("aria-label") and targets and [t for t in targets if t in panels] == targets, f"{name}: {targets} against {panels}"
    script = (SITE / "assets" / "js" / "plate.js").read_text(encoding="utf-8")
    assert strips > 0 and all(f"role: '{role}'" in script for role in ("tablist", "tab", "tabpanel")) and "'aria-selected'" in script


def test_every_shipped_plate_has_its_views_labels_and_table(shipped):
    pages, _ = shipped
    problems = [problem for _, text, doc in pages for figure, data in plates(doc, text) for problem in plate_structure_problems(figure, data)]
    assert not problems, problems


# Budgets: tests/budgets.json is the one place the numbers live ---------------------------------------------

ROOT = SCRIPTS.parent
BUDGETS = json.loads((Path(__file__).parent / "budgets.json").read_text(encoding="utf-8"))


def budget_warning(name, size, budget, warn_at, unit="bytes"):
    """Budgets warn and never fail, so a one-line fix cannot fail a test."""
    if budget is None:
        warnings.warn(f"no budget for {name} ({size} {unit}); add one to tests/budgets.json", UserWarning)
    elif size > budget:
        warnings.warn(f"OVER BUDGET: {name} is {size:g} {unit}, over its {budget:g} in tests/budgets.json", UserWarning)
    elif size >= warn_at * budget:
        warnings.warn(f"near budget: {name} is {size:g} {unit} of its {budget:g} in tests/budgets.json", UserWarning)


def check_budgets(budgets, root=ROOT):
    """Warns on every script and page near or over its number. Pages weigh their HTML gzipped."""
    warn_at, pages = budgets["warn_at"], budgets["pages_gzip_kb"]
    for path in sorted((root / "site" / "assets" / "js").glob("*.js")):
        name = path.relative_to(root).as_posix()
        budget_warning(name, path.stat().st_size, budgets["scripts"].get(name), warn_at)
    for path in sorted((root / "site").rglob("index.html")):
        name = path.relative_to(root).as_posix()
        size = round(len(gzip.compress(path.read_bytes(), 9)) / 1024, 1)
        budget_warning(name, size, pages.get(name, pages["default"]), warn_at, "KB gzipped")


def test_budgets_file_has_its_shape():
    assert BUDGETS["tier"] == "T0" and BUDGETS["schema"] == 1 and 0 < BUDGETS["warn_at"] < 1 and BUDGETS["note"]
    assert BUDGETS["scripts"] and all(name.startswith("site/assets/js/") and size > 0 for name, size in BUDGETS["scripts"].items())
    assert BUDGETS["pages_gzip_kb"]["default"] > 0 and all(name == "default" or name.endswith("index.html") for name in BUDGETS["pages_gzip_kb"])


def test_scripts_and_pages_against_their_budgets():
    check_budgets(BUDGETS)


def test_an_over_budget_file_only_warns(tmp_path):
    with pytest.warns(UserWarning, match="OVER BUDGET"):
        budget_warning("x.js", 11, 10, 0.9)
    with pytest.warns(UserWarning, match="near budget"):
        budget_warning("x.js", 9, 10, 0.9)
    with warnings.catch_warnings():
        warnings.simplefilter("error")
        budget_warning("x.js", 8, 10, 0.9)
    (tmp_path / "site" / "assets" / "js").mkdir(parents=True)
    (tmp_path / "site" / "assets" / "js" / "big.js").write_text("x" * 100, encoding="utf-8")
    (tmp_path / "site" / "index.html").write_text("<p>" * 9000, encoding="utf-8")
    tiny = {"warn_at": 0.9, "scripts": {"site/assets/js/big.js": 10}, "pages_gzip_kb": {"default": 0.01}}
    with pytest.warns(UserWarning) as caught:
        check_budgets(tiny, tmp_path)
    assert [str(w.message).split(":")[0] for w in caught] == ["OVER BUDGET", "OVER BUDGET"], "over budget warns, and the test goes on"
