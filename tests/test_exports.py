"""Tests for build_plates.export_claims: what a shipped claim carries, and how the file is written (no network, no browser)."""
import json
from pathlib import Path
import sys

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
import build_plates as bp  # noqa: E402

CLAIM = {
    "id": "xx-001", "entity": "Example Utility", "metric": "year formed", "value": None, "low": None, "high": None, "unit": None, "year": 1953,
    "boundary": "The year the utility's own history gives for its founding.",
    "source": {"title": "History", "publisher": "Example Utility", "url": "https://example.com/history", "published": None, "kind": "organization"},
    "quote": "The utility was founded in 1953.", "derived": None, "status": "verified",
    "note": "working note", "recheck": "read on 11/05/2026", "draft_note": "a new working field",
}


def _export(tmp_path):
    evidence, out = tmp_path / "evidence", tmp_path / "out"
    evidence.mkdir()
    (evidence / "xx.json").write_text(json.dumps({"cluster": "xx", "claims": [CLAIM]}), encoding="utf-8")
    return out, bp.export_claims(evidence=evidence, out=out, clusters=["xx"])


def test_allowlist_drops_unknown_keys(tmp_path):
    out, counts = _export(tmp_path)
    claim = json.loads((out / "xx.json").read_text(encoding="utf-8"))["claims"][0]
    assert counts == {"xx": 1}
    assert not {"note", "recheck", "draft_note"} & set(claim)
    assert claim["quote"] == CLAIM["quote"] and claim["source"] == CLAIM["source"]


def test_export_leaves_no_temp_file(tmp_path):
    out, _ = _export(tmp_path)
    assert [p.name for p in out.iterdir()] == ["xx.json"]
