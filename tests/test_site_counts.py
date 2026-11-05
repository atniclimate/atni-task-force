"""The counts the site states about its own files (scripts/site_count_claims.py): a recount, each mark against its claim, and what a limit must say."""
import json
from pathlib import Path
import re
import sys

from dom import parse

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
sys.path.insert(0, str(ROOT / "scripts"))
import site_count_claims as scc  # noqa: E402

SHIPPED = json.loads((SITE / "data" / "claims" / "site-counts.json").read_text(encoding="utf-8"))["claims"]
CLAIMS = {c["id"]: c for c in SHIPPED}
LIBRARY = json.loads((SITE / "data" / "library.json").read_text(encoding="utf-8"))
POLICY = json.loads((SITE / "data" / "policy-watch.json").read_text(encoding="utf-8"))


def page(rel):
    return parse((SITE / rel).read_text(encoding="utf-8"))


def digits(node):
    return re.sub(r"\D", "", node.text().split()[0])


def test_shipped_claims_are_what_the_generator_makes():
    assert [{k: v for k, v in c.items() if k != "note"} for c in scc.all_claims()] == SHIPPED, "rerun python scripts/site_count_claims.py"


def test_counts_match_a_recount_of_the_files():
    entries = LIBRARY["entries"]
    forces = POLICY["task_forces"].values()
    assert CLAIMS["lc-001"]["value"] == len(entries)
    assert CLAIMS["lc-002"]["value"] == sum(1 for e in entries if e["tribal_specific"])
    assert CLAIMS["lc-002"]["value"] + CLAIMS["lc-003"]["value"] == len(entries)
    assert CLAIMS["lc-004"]["value"] == sum(1 for e in entries if e["featured"] and e["type"] == "resolution")
    assert CLAIMS["lc-022"]["value"] == sum(1 for e in entries if e["type"] == "report")
    assert CLAIMS["lc-051"]["value"] == sum(len(t["follow"]) for t in forces)
    assert CLAIMS["lc-052"]["value"] == sum(len(t["searches"]) for t in forces)
    held = (SITE / "data-centers" / "index.html").read_text(encoding="utf-8").split('id="checklists"')[1]
    assert CLAIMS["lc-061"]["value"] == len(re.findall(r'id="q-[a-z]+"', held)) == 8


def test_a_count_says_its_file_and_date_and_a_curated_one_has_a_limit():
    for c in SHIPPED:
        if c["id"] == "lc-071":
            assert c["status"] == "verified" and "Resolution #25-41" in c["quote"] and str(c["value"]) in c["quote"]
            continue
        assert c["status"] == "partly" and c["limit"].strip(), c["id"]
        assert re.search(r"\d\d/\d\d/\d{4}", c["boundary"]), f"{c['id']}: its boundary states its date"
        assert c["source"]["url"].startswith("https://") and c["quote"], c["id"]


def test_each_library_bar_links_its_count_to_the_claim_that_holds_it():
    doc = page("library/index.html")
    marks = doc.all("a", "comp-n")
    assert marks and len(marks) == len(doc.all("a", "comp-row"))
    for mark in marks:
        assert digits(mark) == str(CLAIMS[mark.attrs["data-claim"]]["value"]), mark.attrs["data-claim"]
        assert mark.attrs["href"] == f'#src-{mark.attrs["data-claim"]}' and not mark.attrs.get("data-filter")
    cited = {node.attrs["id"][4:] for node in doc.one("section", "claims-cited").all("li", id=True)}
    assert {mark.attrs["data-claim"] for mark in marks} <= cited, "each mark's row is in the page's foot"


def test_each_home_figure_holds_its_claims_value():
    doc = page("index.html")
    spans = doc.one("ul", "home-figures").all(data_claim=True)
    others = {c["id"]: c for path in (SITE / "data" / "claims").glob("*.json") for c in json.loads(path.read_text(encoding="utf-8")).get("claims") or []}
    assert len(spans) >= 8
    for span in spans:
        claim = others[span.attrs["data-claim"]]
        assert span.text().split()[0].replace(",", "") in {f'{claim[key]:g}' for key in ("value", "low", "high") if claim.get(key) is not None}, span.attrs["data-claim"]
    assert not [f for f in doc.one("ul", "home-figures").all("li", "figure") if not f.all("p", "figure-claims")], "every figure carries its chips"


def test_home_reads_the_project_settings_as_an_example():
    second = page("index.html").one("ul", "home-questions").all("li")[1].one("p").text()
    assert second.startswith("Example, at settings you can change: a 125 MW project at a 0.8 load factor")
    assert "8 checklists:" in page("index.html").one("ul", "home-questions").all("li")[2].text()
