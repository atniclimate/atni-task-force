"""Lexicon, passage and decision-table tests for scripts/energy_potential.py (no network, no library needed)."""
import importlib.util
from pathlib import Path

import pytest

_spec = importlib.util.spec_from_file_location(
    "energy_potential", Path(__file__).resolve().parents[1] / "scripts" / "energy_potential.py")
ep = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ep)


def types_in(text):
    return {t for t, _, _ in ep.find_matches(text)}


@pytest.mark.parametrize("text, expected", [
    ("The Tribe installed a 100 kW solar array on the administration building.", "solar"),
    ("Rooftop solar on Tribal housing would lower utility bills.", "solar"),
    ("A photovoltaic system powers the fish hatchery.", "solar"),
    ("Agrivoltaics pair grazing with generation.", "solar"),
    ("The wind resource assessment used a 60-meter met tower.", "wind"),
    ("Explore wind and solar development on Tribal land.", "wind"),
    ("A small wind turbine serves the ranger station.", "wind"),
    ("Offshore wind lease areas lie off the coast.", "offshore-wind"),
    ("A micro-hydro unit on the creek would power the camp.", "hydropower"),
    ("The Tribe co-owns a hydroelectric dam.", "hydropower"),
    ("Run-of-river turbines need no reservoir.", "hydropower"),
    ("Tidal energy turbines were tested in the strait.", "marine"),
    ("A wave energy converter test site is planned.", "marine"),
    ("Ground-source heat pumps heat the community center.", "geothermal"),
    ("A woody biomass boiler heats the school.", "biomass"),
    ("Combined heat and power at the sawmill.", "biomass"),
    ("An anaerobic digester turns dairy waste into biogas.", "bioenergy-fuels"),
    ("Hydrogen fuel cell buses are under study.", "hydrogen"),
    ("A battery energy storage system pairs with the array.", "storage"),
    ("The BESS provides backup power.", "storage"),
    ("A microgrid keeps the clinic powered during outages.", "microgrid"),
    ("Weatherization of 40 homes reduced heating costs.", "efficiency"),
    ("An energy audit of all Tribal buildings.", "efficiency"),
    ("Air-source heat pumps replaced oil furnaces.", "electrification"),
    ("Install EV charging at the casino.", "electrification"),
    ("Electric vehicle charging stations at the government center.", "electrification"),
])
def test_lexicon_finds_each_type(text, expected):
    assert expected in types_in(text)


@pytest.mark.parametrize("text, absent", [
    ("High winds and windstorms knocked out power for three days.", "wind"),
    ("Wind speeds reached 70 mph during the storm.", "wind"),
    ("Strong wind and heavy rain closed the road.", "wind"),
    ("Offshore wind lease areas lie off the coast.", "wind"),
    ("Increased solar radiation warms the river.", "solar"),
    ("Hydrogen sulfide odors near the lagoon.", "hydrogen"),
    ("Hydrogen ion concentration (pH) was measured.", "hydrogen"),
    ("The CHP was updated last year.", "biomass"),
    ("Fish biomass declined in the estuary.", "biomass"),
    ("Eelgrass beds reduce wave energy reaching the shore.", "marine"),
    ("During a heat wave energy demand peaks.", "marine"),
    ("Ground-source heat pumps heat the community center.", "electrification"),
    ("Bess Smith chaired the meeting.", "storage"),
    ("Solar Energy .................... 45", "solar"),
])
def test_lexicon_ignores_false_positives(text, absent):
    assert absent not in types_in(text)


def test_contents_pages_are_skipped():
    toc = ("8.9 Solar Electricity eee cecesceseeseeesecsecesecesecsee 129\n8.10 Solar Water Heating ........ 135\n"
           "9.1 Solar Power ........ 145\n9.2 Wind Energy ......... 150\n")
    assert ep.find_matches(toc) == []
    assert types_in("The Tribe installed a solar array in 2019. See page 4.") == {"solar"}


def test_passages_are_page_substrings_with_bounded_length():
    para = "Background paragraph about the reservation and its people. " * 6
    text = f"{para}\n\nThe Tribe plans a solar array at the clinic.\n\n{para}\n\n" + "Other text. " * 300
    spans = ep.page_spans(text, ep.find_matches(text))
    assert spans
    for s, e in spans:
        assert ep.PASSAGE_MIN <= e - s <= ep.MERGED_MAX
        assert "solar array" in text[s:e]


def test_excerpts_are_verbatim_short_and_free_of_contact_data():
    text = ("Contact energy@tribe.org or 360-555-0100 about the solar program. "
            "In 2021 the Tribe installed a 50 kW solar array on the gym roof. " * 3)
    found = ep.excerpts(text, 0, len(text), "solar")
    assert found and all(x in text and len(x) <= ep.EXCERPT_MAX for x in found)
    assert not any(ep.EMAIL.search(x) or ep.PHONE.search(x) for x in found)


@pytest.mark.parametrize("title, year", [
    ("Lummi Nation Strategic Energy Plan: 2016-2026", 2016),
    ("All Hazards Mitigation Plan 2017–2022, Section 1", 2017),
    ("Wetland Program Plan 2016-2021, 2018 update", 2018),
    ("Chippewa Cree Tribe Wetland Program Plan FY2022-2024", 2022),
    ("Burns Paiute Tribe 2025-27 STIF Plan", 2025),
    ("2026 Comprehensive Economic Development Strategy, 2021-2026", 2026),
    ("Climate Adaptation Plan 2016", 2016),
])
def test_document_year_from_title(title, year):
    assert max(ep.text_years(title)) == year


def row(doc="d1", own=0.9, stage=3.0, rejected=0.1, year=2020):
    return {"doc": doc, "own": own, "stage": stage, "rejected": rejected, "year": year}


def test_truth_table_admissibility_and_drops():
    assert ep.decide([row(own=0.69)]) == (None, "no admissible passage (own < 0.7)")
    assert ep.decide([row(own=0.5, stage=4.0), row(own=0.2, stage=4.0)])[0] is None  # uncertain own never counts
    assert ep.decide([row(stage=0.0)])[1].startswith("background only")
    assert ep.decide([row(stage=2.0, rejected=0.8)])[1].startswith("found unsuitable")
    kept, _ = ep.decide([row(stage=3.0, rejected=0.8)])  # a rejection does not erase a planned project
    assert kept and kept["rejected"] and kept["best_stage"] == 3.0
    kept, _ = ep.decide([row(stage=2.0, rejected=0.5)])  # an unsettled rejection is not a rejection
    assert kept and not kept["rejected"]


def test_truth_table_score_and_ranking():
    one, _ = ep.decide([row(stage=2.0), row(stage=1.0, own=0.6, doc="d9")])
    assert one["n_docs"] == 1 and one["score"] == 2.0
    many, _ = ep.decide([row(doc=f"d{i}", stage=1.0, year=2010 + i) for i in range(6)])
    assert many["n_docs"] == 6 and many["score"] == 1.75 and many["newest"] == 2015  # bonus capped at 3 documents
    kept = {"solar": {"score": 2.0, "n_docs": 1, "newest": 2018},
            "wind": {"score": 2.0, "n_docs": 2, "newest": 2010},
            "hydropower": {"score": 2.0, "n_docs": 2, "newest": 2019},
            "storage": {"score": 3.0, "n_docs": 1, "newest": None}}
    assert ep.rank(kept) == ["storage", "hydropower", "wind", "solar"]


@pytest.mark.parametrize("stage, label", [
    (4.0, "Installed or operating"), (3.5, "Installed or operating"), (3.0, "Planned or funded"),
    (2.5, "Planned or funded"), (2.0, "Assessed or sited"), (1.5, "Assessed or sited"), (1.0, "Goal or interest"),
    (0.5, "Goal or interest"), (0.4, None)])
def test_stage_labels(stage, label):
    assert ep.stage_label(stage) == label


def test_failed_claim_steps_down_one_stage_until_goal():
    claim = {"stage_label": "Installed or operating", "best_stage": 4.0, "n_docs": 3, "score": 4.5}
    lower = ep.step_down(claim)
    assert lower["stage_label"] == "Planned or funded" and lower["best_stage"] == 3.0 and lower["score"] == 3.5
    assert ep.stage_label(lower["best_stage"]) == lower["stage_label"]
    assert ep.step_down(ep.step_down(lower))["stage_label"] == "Goal or interest"
    assert ep.step_down({"stage_label": "Goal or interest", "n_docs": 1}) is None


def test_citations_are_ordered_by_support_and_unsupported_ones_dropped():
    cites = [{"doc": "a"}, {"doc": "b"}, {"doc": "c"}]
    assert [c["doc"] for c in ep.supported_citations(cites, [0.2, 0.9, 0.5])] == ["b", "c"]
    assert [c["doc"] for c in ep.supported_citations(cites, [0.1, 0.25, 0.05])] == ["b"]  # the best always stays


def test_stage_reading_mode_breaks_ties_low():
    answer = {"score": 2.0, "probabilities": {"0": 0.1, "1": 0.4, "2": 0.0, "3": 0.4, "4": 0.1}}
    assert ep.stage_value(answer) == (1.0 if ep.STAGE_READING == "mode" else 2.0)


def test_send_guard_refuses_marked_or_unscreened_documents():
    good = {"sha256": "a" * 64, "local_only": False, "eligible": True, "url": "https://example.org/plan.pdf",
            "prepared": 0.9, "plan": 0.9, "tribe_states": ["WA"]}
    assert ep.may_send(good)
    for change in ({"local_only": True}, {"eligible": False}, {"url": None}, {"prepared": 0.6}, {"plan": 0.4},
                   {"sha256": ep.GILA_SHA}, {"tribe_states": ["AZ"]}, {"prepared": None}):
        assert not ep.may_send(dict(good, **change))
