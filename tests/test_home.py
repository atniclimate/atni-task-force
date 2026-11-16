"""The home page (scripts/build_home.py): its poured blocks are current, and each figure it states holds its claim's value. No browser and no network;
the page's behavior is scripts/page_checks/home.js."""
import json
from pathlib import Path
import shutil
import sys

import pytest

from dom import parse

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
sys.path.insert(0, str(ROOT / "scripts"))
import build_home as bh  # noqa: E402


def page(rel):
    return parse((SITE / rel).read_text(encoding="utf-8"))


def test_the_home_page_is_what_its_builder_makes():
    if not bh.be.LIMITS.is_file():  # the receipts print each partly verified claim's limit from the local evidence (work/ is gitignored)
        if (ROOT / "planning-T1").is_dir():
            pytest.fail(f"planning-T1/ is here but {bh.be.LIMITS.relative_to(ROOT).as_posix()} is missing: restore the evidence folder")
        pytest.skip("no local evidence on this machine, so no claim limits to pour from")
    if not shutil.which("node"):
        pytest.skip("node is not installed: the band's words come from the page's own model through scripts/explorer_static.js")
    assert not bh.run(check=True)["out_of_date"], "site/index.html is behind its blocks: run python scripts/build_home.py"


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
