"""Rebuilds every generated file in site/ in the one order that works, or checks that none is stale. CLAUDE.md names the order; this file runs it.

  python scripts/rebuild_all.py           run each step in order; stop at the first that fails, with its exit code
  python scripts/rebuild_all.py --check   write nothing: run every builder's own check, then exit 1 naming each stale output

The claim generators come first, where the data products table in CLAUDE.md places them. site_count_claims.py runs twice: before the plates and
the Explorer read its library and policy counts (build_explorer.py stops if those differ from the data files), and after build_whats_new.py,
whose rows it counts and whose page mark pour_claim_refs.py checks. The project map, the share cards (they need VectorCraft), and the Briefing
PDF (it needs Chrome) are rebuilt only when their own --check says stale. In --check mode the freshness tests stand in for the claims export,
the plate build, and the model export, which have no check flag; a builder with no check at all is named, never counted as passed.
"""
import argparse
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def fresh(test):
    """A freshness test, which builds into a temporary folder and compares (tests/test_freshness.py); no pytest cache is written."""
    return ["-m", "pytest", "-q", "-p", "no:cacheprovider", f"tests/test_freshness.py::{test}"]


# (the output, the command that builds it, the command that checks it or None, rebuilt only when that check fails)
STEPS = [
    ("Energy claims and plates", ["scripts/energy_claims.py"], None, False),
    ("climate claims and plate", ["scripts/climate_claims.py"], None, False),
    ("project claims and plate", ["scripts/project_claims.py"], None, False),
    ("site/data/claims", ["scripts/build_plates.py", "--export-claims"], fresh("test_claims_match_evidence"), False),
    ("site counts, before the pages read them", ["scripts/site_count_claims.py"], None, False),
    ("project map", ["scripts/build_project_map.py"], ["scripts/build_project_map.py", "--check"], True),
    ("plate blocks in the pages", ["scripts/build_plates.py"], fresh("test_plate_build_changes_nothing"), False),
    ("resource model self-test", ["scripts/resource_model.py", "--self-test"], ["scripts/resource_model.py", "--self-test"], False),
    ("site/data/resource-model.json and resource-model-inputs.csv", ["scripts/resource_model.py", "--export"], fresh("test_resource_model_matches_export"), False),
    ("Explorer oracle", ["scripts/resource_model.py", "--oracle"], None, False),
    ("resource model run", ["scripts/resource_model.py"], None, False),
    ("Explorer page and home band", ["scripts/build_explorer.py"], None, False),
    ("data/index.json", ["scripts/build_index.py"], ["scripts/build_index.py", "--check"], False),
    ("What's New", ["scripts/build_whats_new.py"], ["scripts/build_whats_new.py", "--check"], False),
    ("site counts, after What's New", ["scripts/site_count_claims.py"], None, False),
    ("Library strip", ["scripts/build_library_strip.py"], ["scripts/build_library_strip.py", "--check"], False),
    ("claim marks and Claims Cited", ["scripts/pour_claim_refs.py"], ["scripts/pour_claim_refs.py", "--check"], False),
    ("share cards", ["scripts/build_share_cards.py"], ["scripts/build_share_cards.py", "--check"], True),
    ("Briefing", ["scripts/build_briefing.py"], ["scripts/build_briefing.py", "--check"], False),
    ("Briefing PDF", ["scripts/build_briefing_pdf.py"], ["scripts/build_briefing_pdf.py", "--check"], True),
    ("page meta, robots.txt, sitemap.txt", ["scripts/add_page_meta.py"], ["scripts/add_page_meta.py", "--check"], False),
]


def run(args):
    """One command from the repository root, with this Python; its exit code."""
    print(f"rebuild_all: python {' '.join(args)}", flush=True)
    return subprocess.run([sys.executable, *args], cwd=ROOT).returncode


def build():
    for name, make, check, stale_only in STEPS:
        if stale_only and run(check) == 0:
            continue
        code = run(make)
        if code:
            print(f"rebuild_all: stopped at {name}: python {' '.join(make)} exited {code}", file=sys.stderr)
            sys.exit(code)
    print("rebuild_all: every step ran")


def check():
    stale = [f"{name} (python {' '.join(command)})" for name, _, command, _ in STEPS if command and run(command)]
    print(f"rebuild_all --check: no check of their own: {', '.join(name for name, _, command, _ in STEPS if not command)}")
    if stale:
        sys.exit(f"rebuild_all --check: stale or failing: {'; '.join(stale)}")
    print("rebuild_all --check: every checked output is current")


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--check", action="store_true", help="write nothing; exit 1 naming each stale output")
    (check if parser.parse_args().check else build)()


if __name__ == "__main__":
    main()
