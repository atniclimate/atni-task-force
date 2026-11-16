"""The Energy pages' claims and plates (scripts/energy_claims.py): counts against an independent recount, provenance of each date, and what the plates may not say."""
import copy
import importlib.util
import json
from pathlib import Path
import re

import pytest

from dom import parse

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
_spec = importlib.util.spec_from_file_location("energy_claims", ROOT / "scripts" / "energy_claims.py")
ec = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ec)
_pages_spec = importlib.util.spec_from_file_location("build_energy_pages", ROOT / "scripts" / "build_energy_pages.py")
bep = importlib.util.module_from_spec(_pages_spec)
_pages_spec.loader.exec_module(bep)

POTENTIAL = json.loads((SITE / "data" / "energy-potential.json").read_text(encoding="utf-8"))
FUNDING = json.loads((SITE / "data" / "energy-funding.json").read_text(encoding="utf-8"))
SHIPPED = {name: json.loads((SITE / "data" / "claims" / f"{name}.json").read_text(encoding="utf-8"))["claims"] for name in ("potential", "funding")}
CLAIMS = {c["id"]: c for claims in SHIPPED.values() for c in claims}


def plate(name):
    return json.loads((SITE / "data" / "plates" / f"{name}.json").read_text(encoding="utf-8"))


def test_shipped_claims_and_plates_are_what_the_generator_makes():
    made = {"potential": ec.potential_claims(POTENTIAL), "funding": ec.funding_claims(FUNDING)}
    for name, claims in made.items():
        assert [{k: v for k, v in c.items() if k != "note"} for c in claims] == SHIPPED[name], f"rerun energy_claims.py and export {name}"
    for plate_id, built in ec.plates_for(POTENTIAL, FUNDING, made["potential"], made["funding"]).items():
        assert plate(plate_id) == built, f"rerun energy_claims.py: {plate_id} is stale"


def test_counts_match_a_recount_of_the_data_file():
    tribes = POTENTIAL["tribes"]
    none = [t for t in tribes if not t["top"]]
    assert CLAIMS["ep-001"]["value"] == sum(1 for t in tribes if t["top"]) == 44
    assert CLAIMS["ep-002"]["value"] == len(tribes) == 56
    assert CLAIMS["ep-003"]["value"] == sum(t["documents_pending_extraction"] for t in tribes) == 22
    assert CLAIMS["ep-005"]["value"] == sum(len(t["top"]) for t in tribes) == 139
    assert CLAIMS["ep-006"]["value"] == len(none) == CLAIMS["ep-007"]["value"] + CLAIMS["ep-008"]["value"] + CLAIMS["ep-009"]["value"]
    assert (CLAIMS["ep-007"]["value"], CLAIMS["ep-008"]["value"], CLAIMS["ep-009"]["value"]) == (9, 2, 1)
    assert sum(CLAIMS[f"ep-{n:03d}"]["value"] for n in range(11, 15)) == CLAIMS["ep-005"]["value"]
    for c in SHIPPED["potential"]:
        if c.get("type_id"):
            by = {key: sum(1 for t in tribes for f in t["top"] if f["type"] == c["type_id"] and f["stage_label"] == label) for label, key in ec.STAGES.items()}
            assert c["stages"] == by and c["value"] == sum(by.values())
    programs = FUNDING["programs"]
    assert CLAIMS["ef-001"]["value"] == len(programs) == CLAIMS["ef-002"]["value"] + CLAIMS["ef-003"]["value"] + CLAIMS["ef-004"]["value"]
    assert CLAIMS["ef-005"]["value"] + CLAIMS["ef-006"]["value"] + CLAIMS["ef-003"]["value"] == len(programs)


@pytest.mark.parametrize("plate_id", ["energy-types-by-stage", "energy-types-by-stage-plans"])
def test_a_types_plate_holds_its_claims_and_names_no_tribe(plate_id):
    defn = plate(plate_id)
    rows = defn["rows"]
    assert len(rows) == len(POTENTIAL["method"]["energy_types"]) == 13
    values = [CLAIMS[r["claim"]]["value"] for r in rows]
    assert values == sorted(values, reverse=True), "most named first"
    for r in rows:
        assert {k: int(v) for k, v in r["cols"].items()} == CLAIMS[r["claim"]]["stages"], "the bars and the Table read these"
    text = json.dumps(defn, ensure_ascii=False)
    names = [t["name"] for t in POTENTIAL["tribes"]]
    assert not [name for name in names if name in text], "the plate is an aggregate; a Tribe's name comes only when a reader opens the alphabetical list"
    page = (SITE / defn["page"]).read_text(encoding="utf-8")
    figure = parse(page).one("figure", id=plate_id)
    assert not [name for name in names if name in figure.text()]
    assert "machine-assisted reading of public plans" in figure.text() and "absence is not evidence" in figure.text(), "the caveats stay on the plate without scripts"
    assert "awaiting text extraction" in figure.text(), "pending documents keep their own state"
    assert defn["plot"]["domain"][1] <= 1.25 * max(values), "the axis ends near the longest bar (energy-06)"


def test_no_finding_states_add_up_and_carry_a_limit_of_their_own():
    limits = [CLAIMS[f"ep-{n:03d}"]["limit"] for n in (7, 8, 9)]
    assert len(set(limits)) == 3 and all(limits)


@pytest.mark.parametrize("plate_id", ["energy-deadlines", "energy-deadlines-catalog"])
def test_a_deadlines_plate_keeps_each_date_with_its_receipt(plate_id):
    """A countdown (scripts/plate_countdown.py): a row's date is its claim's, counted from the day the dated programs were rechecked, and the title says
    nothing the clock can change, so the built page and the live one agree (energy-14)."""
    defn = plate(plate_id)
    programs = {p["id"]: p for p in FUNDING["programs"]}
    assert defn["plot"] == {"type": "countdown", "from": max(p["status_checked"]["date"] for p in FUNDING["programs"])}
    assert not any(r.get("group") for r in defn["rows"]), "a countdown has no summary rows; their claims are in the title"
    assert "{c[ef-005][text]}" in defn["title"] and "{c[ef-006][text]}" in defn["title"] and "first" not in defn["title"] and "next" not in defn["title"]
    dated = [r for r in defn["rows"] if CLAIMS[r["claim"]].get("date")]
    lane = [r for r in defn["rows"] if not CLAIMS[r["claim"]].get("date")]
    assert [CLAIMS[r["claim"]]["date"] for r in dated] == sorted(CLAIMS[r["claim"]]["date"] for r in dated)
    for r in dated:
        p, c = programs[r["cols"]["program"]], CLAIMS[r["claim"]]
        assert c["date"] == p["deadline"]["date"] and c["date_us"] == ec.us(c["date"])
        assert r["cols"]["checked"] == ec.us(p["deadline"].get("checked", p["status_checked"])["date"])
        assert (c["status"] == "verified") == bool(p["deadline"].get("checked")), "a date is verified only with the sentence read on the agency's page"
    assert {r["cols"]["program"] for r in lane} == {p["id"] for p in FUNDING["programs"] if not p.get("deadline") and p["status"] != "closed"}
    assert any(r["cols"]["status"] == "forecasted" for r in lane) and not any(programs[r["cols"]["program"]]["status"] == "closed" for r in lane)
    for r in lane:
        assert CLAIMS[r["claim"]]["status"] == "partly" and CLAIMS[r["claim"]]["limit"]
    upcoming = [r for r in dated if CLAIMS[r["claim"]]["date"] > defn["plot"]["from"]]
    assert defn["default"] == (upcoming or dated)[0]["id"], "it starts on the next deadline after the check"


def test_a_checked_date_moves_only_with_a_receipt():
    """Statuses were read on the catalog's date. A program may carry a later one only with the sentence that was read, and only as its own record."""
    as_of = FUNDING["source"]["programs_status_as_of"]
    for p in FUNDING["programs"]:
        checked = (p.get("deadline") or {}).get("checked")
        if p["status_checked"]["date"] != as_of:
            assert checked and checked["date"] == p["status_checked"]["date"] and checked["quote"], p["id"]
        if checked:
            year = checked["date"][:4]
            assert p["deadline"]["date"][:4] in checked["quote"] and year == "2026" and checked["url"].startswith("https://"), p["id"]


def test_the_heat_section_stays_out():
    assert "heat" not in FUNDING
    with pytest.raises(SystemExit, match="stays T1"):
        ec.funding_claims({**FUNDING, "heat": {}})


def test_a_live_notice_with_a_close_date_joins_the_strip():
    data = copy.deepcopy(FUNDING)
    data["live"]["opportunities"][0]["close_date"] = "2027-01-15"
    rows = ec.dated_rows(data)
    notice = next(r for r in rows if r["key"].startswith("notice-"))
    assert notice["link"].startswith("https://") and [r["iso"] for r in rows] == sorted(r["iso"] for r in rows)
    made = next(c for c in ec.funding_claims(data) if c.get("date") == "2027-01-15")
    assert made["status"] == "partly" and made["limit"], "a retrieval is not a recheck"


def test_a_type_read_twice_is_refused():
    data = copy.deepcopy(POTENTIAL)
    tribe = next(t for t in data["tribes"] if t["top"])
    tribe["top"].append(tribe["top"][0])
    with pytest.raises(SystemExit, match="twice"):
        ec.potential_claims(data)


# Names a page may type with digits: dates, years, resolution and report numbers, a bill, a public law, a form, a license, a time of day, a program notice.
ALLOWED = re.compile(r"\d{2}/\d{2}/\d{4}|\b(?:19|20)\d{2}\b|#\d{4}-\d+|\b[A-Za-z][A-Za-z-]*\d[\w.()-]*|H\.R\. ?\d+|H\. Con\. Res\. \d+|\d+th Congress|Public Law \d+-\d+|Publication \d+-[A-Z]|Noncommercial \d\.\d\.\d|\b\d{1,2}:\d{2}\b|Notice \d+-\d+")


@pytest.mark.parametrize("page", ["energy/index.html", "energy/potential/index.html", "energy/funding/index.html"])
def test_every_figure_in_a_pages_own_words_is_poured(page):
    doc = parse((SITE / page).read_text(encoding="utf-8"))
    main = doc.one("main")

    def words(node):
        for child in node.children:
            if isinstance(child, str):
                yield child
            elif child.tag in ("script", "style", "figure") or {"data-pour", "data-answer", "data-from"} & set(child.attrs) or {"cr", "bench-row"} & set((child.attrs.get("class") or "").split()):
                # A plate holds its own checks, and a bench row or an agenda answer is a plate's Reading built from its claims (the figure rule in build_plates.py);
                # a poured figure is held to its claim by test_plates, a claim mark by pour_claim_refs.check_page; a data-from region is a data file's records,
                # quoted with their sources by build_energy_pages.py (its tests below).
                continue
            else:
                yield from words(child)

    text = " ".join(" ".join(words(main)).split())
    typed = re.findall(r"\d[\d,.]*", ALLOWED.sub(" ", text))
    assert not typed, f"{page}: pour these from a claim: {typed}"
    limits = {n.attrs["data-pour"] for n in main.all(data_pour=True) if n.attrs.get("data-field") == "limit"}
    for node in main.all(data_pour=True):
        claim_id = node.attrs["data-pour"]
        if CLAIMS.get(claim_id, {}).get("status") == "partly":
            assert claim_id in limits, f"{page}: {claim_id} is partly verified, so its limit is on the page"


# scripts/build_energy_pages.py: the regions a page script only filters and selects.

ENERGY_PAGES = ["energy/index.html", "energy/sources/index.html", "energy/funding/index.html", "energy/potential/index.html", "energy/funding/sources/index.html",
                "energy/potential/sources/index.html"]


def test_the_energy_pages_regions_are_current():
    assert bep.main(["--check", *(arg for page in ENERGY_PAGES for arg in ("--page", page))]) == 0, "run python scripts/build_energy_pages.py"
    assert set(bep.WATCH) <= set(bep.regions(FUNDING, POTENTIAL, json.loads((SITE / "data" / "policy-watch.json").read_text(encoding="utf-8")))), "every Policy Watch page has its region"


def test_the_catalog_lists_every_program_once_open_first():
    html = bep.catalog(FUNDING)
    ids = re.findall(r'data-program="([^"]+)"', html)
    assert sorted(ids) == sorted(p["id"] for p in FUNDING["programs"]) and len(set(ids)) == len(ids)
    statuses = [next(p["status"] for p in FUNDING["programs"] if p["id"] == i) for i in ids]
    assert statuses == sorted(statuses, key=lambda s: bep.ORDER.index(s)), "open, then forecasted, then closed"
    assert all(f'id="prog-{i}"' in html for i in ids), "each row's link has its detail"


def test_a_program_reads_one_status():
    """BPA's date is the date to apply by for funding; later applications are still taken, so every place says open while funds last (energy-14)."""
    rows = {r["key"]: r for r in ec.dated_rows(FUNDING)}
    assert ec.due_words(rows["bpa-tribal-iq"]) == "open while funds last; 11/05/2026 is the date to ensure funding"
    assert ec.due_words(rows["doe-heehr-tribal"]) == "applications are due 12/11/2026"
    assert all(bep.rolling(p) == ec.rolling(p.get("deadline") or {}) for p in FUNDING["programs"]), "the builder and the plates read a rolling date the same way"
    assert 'data-date="2026-11-05" data-rolling' in bep.open_face(FUNDING)


def test_how_a_program_pays():
    kinds = {p["id"]: bep.pays(p) for p in FUNDING["programs"]}
    assert kinds["irs_elective_pay"] == "tax" and kinds["doe_tefp"] == "loan" and kinds["fema_hmgp"] == "disaster" and kinds["doe_wap"] == "formula"
    assert all(kinds[p["id"]] == "competitive" for p in FUNDING["programs"] if p["kind"].startswith("competitive grant") and "formula" not in p["kind"])
    assert not [p for p in FUNDING["programs"] if p["status"] == "open" and kinds[p["id"]] == "competitive"], "the first face's answer: no competitive grant was open at the check"


def test_an_excerpt_reads_as_cut_and_drops_stray_marks():
    assert bep.quote("the array\nwas built") == "…the array was built…"
    assert bep.quote("Solar was installed.") == "Solar was installed."
    assert bep.quote("\uf0b7 Heat pumps \ufffdinstalled.") == "Heat pumps installed."


def test_the_grid_is_every_tribe_a_to_z_with_a_cell_per_type():
    html = bep.grid(POTENTIAL)
    rows = re.findall(r'<tr data-tribe="([^"]+)"', html)
    names = {t["slug"]: t["name"] for t in POTENTIAL["tribes"]}
    assert [names[r] for r in rows] == sorted(names.values(), key=str.lower)
    assert html.count("<td data-tt=") == len(rows) * len(POTENTIAL["method"]["energy_types"])
    assert html.count("data-stage=") == sum(len(t["top"]) for t in POTENTIAL["tribes"])
