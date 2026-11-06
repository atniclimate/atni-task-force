"""The shipped files match what their builders make today. Each builder runs into tmp_path; site/ is never written.

The claims and model comparisons need the local evidence files (work/ is gitignored). They fail when this checkout has
planning-T1/ (a T1 machine, where the evidence should be present) but the evidence is missing, and skip only on a
machine with no planning-T1/ at all, such as CI. The plate build needs no evidence and always runs.
"""
import importlib.util
import json
from pathlib import Path
import shutil
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


bp = load("build_plates")
rm = load("resource_model")
SITE = ROOT / "site"
HAND_MADE = {"anonymized.json"}  # written by hand under the owner ruling of 11/04/2026 (CLAUDE.md data products)


def need(*paths):
    missing = [p.relative_to(ROOT).as_posix() for p in paths if not p.exists()]
    if not missing:
        return
    if (ROOT / "planning-T1").is_dir():
        pytest.fail(f"planning-T1/ is here but the local evidence is missing: {missing}")
    pytest.skip("no planning-T1/ on this machine, so no local evidence to rebuild from")


def test_claims_match_evidence(tmp_path):
    need(bp.EVIDENCE)
    exported = bp.export_claims(bp.EVIDENCE, tmp_path)
    assert exported, "no evidence clusters found"
    stale = [n for n in sorted(exported) if (tmp_path / f"{n}.json").read_bytes() != (SITE / "data" / "claims" / f"{n}.json").read_bytes()]
    assert not stale, f"site/data/claims/ is behind the evidence for {stale}: rerun python scripts/build_plates.py --export-claims"
    orphans = sorted(p.name for p in (SITE / "data" / "claims").glob("*.json") if p.stem not in exported and p.name not in HAND_MADE)
    assert not orphans, f"claims files with no evidence cluster and not named as hand-made: {orphans}"


def test_resource_model_matches_export(tmp_path):
    need(rm.PARAMS, rm.COMPARISON, rm.EVIDENCE / "claim-limits.json")
    rm.export_public(*rm.load(), tmp_path)
    for name in ("resource-model.json", "resource-model-inputs.csv"):
        # text compare: export_public's write_text emits CRLF on Windows, while git checks the file out with LF
        made, shipped = (tmp_path / name).read_text(encoding="utf-8"), (SITE / "data" / name).read_text(encoding="utf-8")
        assert made == shipped, f"site/data/{name} is behind the model: rerun python scripts/resource_model.py --export"


def test_plate_build_changes_nothing(tmp_path):
    site = tmp_path / "site"
    shutil.copytree(SITE, site)
    result = bp.build(site)
    assert result["pages_written"] == [], f"pages behind their plates: {result['pages_written']}: rerun python scripts/build_plates.py"
