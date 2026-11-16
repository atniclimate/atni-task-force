"""The home page (scripts/build_home.py): an agenda whose faces are build-time copies of the plates that answer its questions, from the pages that build
them; what it loads; and what it says below the agenda. No browser and no network; the page's behavior is scripts/page_checks/home.js."""
import json
from pathlib import Path
import re
import sys

import pytest

from dom import parse

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
sys.path.insert(0, str(ROOT / "scripts"))
import build_home as bh  # noqa: E402

QUESTIONS = ["Is everyday AI use the problem?", "What would one data center draw here?", "What can a Tribe apply for, and by when?", "What should leaders ask a developer?"]


def page(rel="index.html"):
    return parse((SITE / rel).read_text(encoding="utf-8"))


def test_the_home_page_is_what_its_builder_makes():
    assert not bh.run(check=True)["out_of_date"], "site/index.html is behind its faces: run python scripts/build_home.py"


def test_the_agenda_asks_four_questions_and_each_face_holds_its_answer():
    doc = page()
    agenda = doc.one("section", "agenda")
    assert [q.one("a").text() for q in agenda.all("div", "agenda-q")] == QUESTIONS
    faces = [q.one("a").attrs["href"][1:] for q in agenda.all("div", "agenda-q")]
    assert [f.attrs["id"] for f in agenda.one("div", "agenda-faces").children if not isinstance(f, str)] == faces, "a face for each question, in order"
    for plate_id, face in zip(bh.FACES, faces):
        copy = agenda.one(id=face).one("div", "home-copy")
        definition = json.loads((SITE / "data" / "plates" / f"{plate_id}.json").read_text(encoding="utf-8"))
        where = definition["page"].removesuffix("index.html")
        assert copy.attrs["data-copy-of"] == f"{where}#{plate_id}" and copy.one("figure", "plate").attrs["id"] == plate_id, f"{face} copies {plate_id} from {where}"
        assert copy.one("p", "plate-sources-link").one("a").attrs["href"] == f"{where}sources/#{plate_id}", f"{plate_id}: its collar reaches its own page's Sources page"
    answers = {a.attrs.get("data-answer"): a.text() for a in agenda.all("p", "agenda-a")}
    for plate_id in bh.FACES:
        assert answers.get(plate_id), f"{plate_id}: the answer is poured from the plate (build_plates.py --page index.html)"
    heading = agenda.one("h2")
    assert agenda.attrs.get("aria-labelledby") == heading.attrs["id"] and "sr-only" in heading.attrs["class"], "an h2 between the h1 and the faces' titles"


def test_a_copy_names_the_page_of_any_tab_it_sends_the_reader_to_and_marks_its_captions_term():
    agenda = page().one("section", "agenda")
    assert not re.search(r"\bon the [A-Z][\w-]* tab\b", agenda.text()), "home has no tabs: a copy names the tab's page"
    assert "Change the assumptions on the AI page's Energy tab" in agenda.text()
    tip = json.loads(page().one("script", id="cr-data").text())["terms"]
    for plate_id, (term, word) in bh.CAPTION_TERMS.items():
        caption = agenda.one("figure", id=plate_id).one("div", "plate-claim").one("p", "caption")
        if word in caption.text():
            link = caption.one("a", "term")
            assert (link.attrs["data-term"], link.attrs["href"], link.text()) == (term, f"sources/#term-{term}", word), f"{plate_id}: {word} opens its definition"
            assert term in tip, f"{plate_id}: the prose tip carries {term} (python scripts/pour_claim_refs.py --page site/index.html)"


def test_the_question_sets_face_is_the_data_center_pages_without_its_sheet():
    doc = page()
    face = doc.one(id="face-asks")
    dc = (SITE / bh.ASKS_PAGE).read_text(encoding="utf-8")
    sets = bh.ADD_BUTTON.findall(bh.ASK_FIRSTS.search(dc)[1])
    assert len(face.one("ul", "ask-firsts").all("li")) == len(sets) and not face.all("input") and not face.all("button"), "every set, led by its first question, and no checkbox or sheet button"
    links = {a.text(): a.attrs["href"] for a in face.one("p", "home-asks-go").all("a")}
    assert links["Open the questions"] == f"data-centers/#{bh.ASKS_TARGET}"
    assert links[f"Add all {bh.number_words(len(sets))} to a briefing"] == f"briefing/#add={'.'.join(sets)}"
    briefing = (SITE / "briefing" / "index.html").read_text(encoding="utf-8")
    assert all(f'id="pick-{s}"' in briefing for s in sets), "the Briefing offers every set the link adds"
    words = {span.attrs["data-m"]: span.text() for span in doc.all("span", data_m=True)}
    assert words["asks:sets"].lower() == bh.number_words(len(sets)), "the answer counts the sets the face holds"


def test_home_loads_the_kit_and_no_data():
    html = (SITE / "index.html").read_text(encoding="utf-8")
    scripts = re.findall(r'<script[^>]*\ssrc="([^"]+)"', html)
    assert scripts.index("assets/js/theme.js") < scripts.index("assets/js/plate.js"), "theme.js first, blocking"
    assert {"assets/js/plate.js", "assets/js/plate-svg.js", "assets/js/data-centers.js"} <= set(scripts)
    assert not [s for s in scripts if re.search(r"(library|energy-funding|policy-watch|explorer-band|resource-model|explorer)\.js$", s)], scripts
    assert not (SITE / "assets" / "js" / "explorer-band.js").exists(), "the old band's script is gone"
    assert "fetch(" not in html and 'type="module"' not in html


def test_what_left_home_is_gone():
    doc = page()
    for gone in ("home-instrument", "home-receipts", "home-figures", "home-streams", "loop", "resolutions", "cards"):
        assert not doc.all(cls=gone), f".{gone} is gone (DIRECTION-R2 4, Home: Gone)"
    for gone in ("data-library-feed", "data-library-featured", "data-figure", "data-receipts"):
        assert gone not in (SITE / "index.html").read_text(encoding="utf-8"), gone


def test_the_task_forces_are_one_ruled_list_with_resolutions_numbered_one_way():
    doc = page()
    forces = doc.one("ul", "forces").all("li", "force")
    assert len(forces) == 4
    numbers = [m for force in forces for m in re.findall(r"#\d+-\d+", force.text())]
    assert numbers and all(re.fullmatch(r"#20\d\d-\d{2,3}", n) for n in numbers) and len(numbers) == len(set(numbers)) == 6, numbers
    for force in forces:
        for a in force.one("p", "force-go").all("a"):
            target = SITE / a.attrs["href"] / "index.html"
            assert target.is_file(), f"{a.attrs['href']} reaches a page"
        for a in force.all("a"):
            href = a.attrs["href"]
            if href.startswith("library/"):
                assert (SITE / href).is_file(), href
    assert [f.one("p", "force-status").text() for f in forces][0] == "Forming"


def test_the_track_is_four_numbered_steps_without_scripts():
    track = page().one(id="work").one("fieldset", "track")
    steps = track.all("label", "track-step")
    assert [s.one("span", "track-n").text() for s in steps] == ["1", "2", "3", "4"] and len(track.all("div", "track-detail")) == 4
    assert ["checked" in s.one("input").attrs for s in steps] == [True, False, False, False], "the first step is chosen"


def test_the_brief_holds_the_one_paper_button_and_no_figure():
    brief = page().one("header", "brief")
    assert [a.text() for a in brief.all("a", "paper")] == ["Build a council briefing"]
    assert brief.one("a", data_sources=True).attrs["href"] == "sources/"
    assert not re.search(r"\d", brief.one("p", "brief-lead").text()), "no figures in the brief"


# The builder's rules, on a scratch site ---------------------------------------------------------------------------------------------------------------

def scratch_site(tmp_path, controls=("a_size", "b_size")):
    site = tmp_path / "site"
    (site / "data" / "plates").mkdir(parents=True)
    for plate_id, folder, control in (("a", "one", controls[0]), ("b", "two", controls[1])):
        (site / folder).mkdir()
        (site / "data" / "plates" / f"{plate_id}.json").write_text(json.dumps({"id": plate_id, "page": f"{folder}/index.html", "controls": [{"name": control}]}), encoding="utf-8")
        block = (f'<figure class="plate" id="{plate_id}"><a href="sources/#{plate_id}">Sources</a><a href="#{plate_id}">here</a><a href="#elsewhere">there</a>'
                 f'<a href="../briefing/#add={plate_id}">Add</a></figure>\n<script type="application/json" id="plate-data-{plate_id}">{{}}</script>')
        (site / folder / "index.html").write_text(f"<main><!-- plate:{plate_id} -->\n{block}\n<!-- /plate:{plate_id} --></main>", encoding="utf-8")
    (site / "data-centers").mkdir()
    (site / "data-centers" / "index.html").write_text(
        '<ul class="ask-firsts"><li><p><b>Water.</b> Whose water?</p><button type="button" data-sheet-add="q-water" data-js>Add (2)</button></li></ul>'
        '<form class="asks" id="checklists"><fieldset class="ask-set" id="q-water"><legend>Water</legend></fieldset></form>', encoding="utf-8")
    home = ("<main><p><span data-m=\"asks:sets\">x</span></p>" + "".join(f"<div id=\"f-{n}\"><!-- home:face:{n} -->\n<!-- /home:face:{n} --></div>" for n in ("a", "b", "asks"))
            + "</main>")
    (site / "index.html").write_text(home, encoding="utf-8")
    return site


def test_a_copy_reaches_from_the_root_what_it_reached_from_its_page(tmp_path, monkeypatch):
    monkeypatch.setattr(bh, "FACES", ("a", "b"))
    site = scratch_site(tmp_path)
    assert bh.run(site=site)["written"]
    out = (site / "index.html").read_text(encoding="utf-8")
    assert 'data-copy-of="one/#a"' in out and 'href="one/sources/#a"' in out and 'href="#a"' in out, "its Sources link and its own id"
    assert 'href="one/#elsewhere"' in out and 'href="briefing/#add=a"' in out, "an anchor it does not hold goes to its page; a path resolves from there"
    assert "<!-- plate:a -->" not in out, "the copy carries no plate marker, so no builder takes home for its page"
    assert '<span data-m="asks:sets">One</span>' in out and 'href="briefing/#add=q-water"' in out and "data-sheet-add" not in out
    assert not bh.run(site=site)["written"], "and running it again changes nothing"


def test_the_build_stops_on_a_name_two_faces_share_or_a_link_that_leaves_the_site(tmp_path, monkeypatch):
    monkeypatch.setattr(bh, "FACES", ("a", "b"))
    site = scratch_site(tmp_path, controls=("size", "size"))
    with pytest.raises(bh.BuildError, match="share the names"):
        bh.run(site=site)
    with pytest.raises(bh.BuildError, match="leaves the site"):
        bh.rehome('<a href="../../x/">x</a>', "one")
    assert bh.rehome('<a href="https://example.org/">x</a><a href="../">up</a>', "one") == '<a href="https://example.org/">x</a><a href="./">up</a>'
