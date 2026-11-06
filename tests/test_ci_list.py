"""Every tests/test_*.py is either named in .github/workflows/check.yml or excluded here with a reason, so a new test file cannot be left out of CI silently."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = (ROOT / ".github" / "workflows" / "check.yml").read_text(encoding="utf-8")

# file name -> why it does not run in CI (a clone has no work/ or planning-T1/)
EXCLUDED = {}


def test_every_test_file_is_in_ci_or_excluded():
    files = {p.name for p in (ROOT / "tests").glob("test_*.py")}
    missing = sorted(f for f in files if f"tests/{f}" not in WORKFLOW and f not in EXCLUDED)
    assert not missing, f"add to check.yml, or to EXCLUDED with a reason: {missing}"


def test_excluded_files_exist_and_are_not_in_ci():
    files = {p.name for p in (ROOT / "tests").glob("test_*.py")}
    assert not sorted(set(EXCLUDED) - files), "EXCLUDED names a file that is gone"
    assert not sorted(f for f in EXCLUDED if f"tests/{f}" in WORKFLOW), "EXCLUDED names a file check.yml runs"
    assert all(EXCLUDED.values()), "every exclusion needs a reason"
