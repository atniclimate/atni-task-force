"""Writes a plate skeleton that points at real claims. It fails first on an unknown claim or one that may not ship.

  python scripts/new_plate.py ID --page ai/index.html --cluster footprint --plot ladder [--claims fp-001,fp-002] [--dry-run]
  python scripts/new_plate.py --self-test

--cluster names a file in site/data/claims/. Without --claims the first three claims in it with a number and one unit become rows.
A partly claim with no limit gets none here: a limit is a public sentence, and build_plates.py refuses the plate until one is written.
"""
import argparse
import json
from pathlib import Path
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).parent))
import build_plates as bp  # noqa: E402
import validate_public as vp  # noqa: E402

PLOTS = {"ladder", "bars", "lines", "multiples", "matrix", "instrument"}


class Refused(Exception):
    pass


def rows_for(plot, claims):
    labels = [f"{c.get('entity') or c['id']}, {c.get('metric') or 'figure'}" for c in claims]
    if plot in {"lines", "multiples"}:
        return [{"series": label, "claim": c["id"]} for c, label in zip(claims, labels)]
    if plot == "matrix":
        return [{"id": c["id"], "label": label, "cells": {"figure": [{"claim": c["id"]}]}} for c, label in zip(claims, labels)]
    return [{"id": c["id"], "label": label, "claim": c["id"]} for c, label in zip(claims, labels)]


def skeleton(plate_id, page, cluster, plot, claim_ids=None, site=vp.SITE):
    """The plate as a dict. Refused names the claim and what to do."""
    site = Path(site)
    if not vp.SLUG.fullmatch(plate_id):
        raise Refused(f"Plate id {plate_id!r} must be kebab case: lowercase words and digits joined by hyphens.")
    if plot not in PLOTS:
        raise Refused(f"Plot type {plot!r} is not in the kit. Use one of {sorted(PLOTS)}.")
    if not (site / page).is_file():
        raise Refused(f"No page at site/{page}. Name a page path under site/, such as ai/index.html.")
    file = site / "data" / "claims" / f"{cluster}.json"
    if not file.is_file():
        raise Refused(f"No claim cluster {cluster!r}. Use a file name from site/data/claims/, or export it with build_plates.py --export-claims {cluster}.")
    claims = {c["id"]: c for c in json.loads(file.read_text(encoding="utf-8")).get("claims") or []}
    numbered = [c for c in claims.values() if c.get("value") is not None]
    # one axis, one unit: the builder refuses mixed units, so the default rows share the first claim's
    ids = claim_ids or [c["id"] for c in numbered if c.get("unit") == numbered[0].get("unit")][:3]
    if not ids:
        raise Refused(f"Cluster {cluster} has no claim with a number. Name claims with --claims.")
    for claim_id in ids:
        if claim_id not in claims:
            raise Refused(f"Claim {claim_id} is not in cluster {cluster}. Add it to the evidence file and export it, or name a claim that ships.")
        if claims[claim_id].get("status") not in vp.CLAIM_STATUS:
            raise Refused(f"Claim {claim_id} has status {claims[claim_id].get('status')!r}, which may not ship. Verify it against its source first, or choose another.")
    picked = [claims[c] for c in ids]
    plate = {"schema": 1, "tier": "T0", "id": plate_id, "page": page, "title": "{label}: {display}, {year}", "plot": {"type": plot}, "reading": "{label}: {display}, {year}. {evidence}", "rows": rows_for(plot, picked)}
    if plot == "matrix":
        plate["plot"]["columns"] = [{"id": "figure", "label": "Figure"}]
    if plot == "instrument":
        plate["plot"]["groups"] = [{"id": "ctx", "label": "Context, fixed"}]
        for row in plate["rows"]:
            row["group"] = "ctx"
    return plate


def unlimited(plate, site=vp.SITE):
    """Partly claims that still need a public limit sentence before the plate builds."""
    claims = bp.load_claims(site)
    used = {r["claim"] for r in plate["rows"] if r.get("claim")} | {c["claim"] for r in plate["rows"] for cell in (r.get("cells") or {}).values() for c in cell}
    return sorted(c for c in used if claims[c].get("status") == "partly" and not claims[c].get("limit"))


def write(plate, site=vp.SITE):
    path = Path(site) / "data" / "plates" / f"{plate['id']}.json"
    if path.exists():
        raise Refused(f"{path.name} already exists. Choose another id, or edit that file.")
    path.write_text(json.dumps(plate, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    return path


def self_test():
    with tempfile.TemporaryDirectory() as tmp:
        for plot in sorted(PLOTS):
            site = bp.sample_site(Path(tmp) / plot)
            # the sample site's plate is replaced by each skeleton, which must build and pass the validator's plate rules
            (site / "data" / "plates" / "sample.json").unlink()
            (site / "page.html").write_text("<main><!-- plate:new-one --><!-- /plate:new-one --></main>", encoding="utf-8")
            plate = skeleton("new-one", "page.html", "sample", plot, ["s-1"], site)
            assert unlimited(plate, site) == [], plate
            write(plate, site)
            assert bp.build(site)["plates"] == 1, plot
            errors = []
            page = (site / "page.html").read_text(encoding="utf-8")
            assert vp.check_plate_blocks("page", page, bp.load_claims(site), errors) == 1 and not errors, (plot, errors)
        site = bp.sample_site(Path(tmp) / "refusals", claims=[bp.sample_claim("s-1"), bp.sample_claim("s-2", 12, "partly"), bp.sample_claim("s-3", 1, "unverified")])
        for args, words in [(("Bad Id", "page.html", "sample", "ladder"), "kebab"), (("a", "page.html", "sample", "pie"), "Plot type"), (("a", "no.html", "sample", "ladder"), "No page"),
                            (("a", "page.html", "nope", "ladder"), "No claim cluster"), (("a", "page.html", "sample", "ladder", ["nope"]), "not in cluster"), (("a", "page.html", "sample", "ladder", ["s-3"]), "may not ship")]:
            try:
                skeleton(*args, site=site)
            except Refused as refused:
                assert words in str(refused), refused
            else:
                raise AssertionError(f"{args} was not refused")
        assert unlimited(skeleton("a", "page.html", "sample", "ladder", ["s-2"], site), site) == ["s-2"]
        try:
            write(skeleton("sample", "page.html", "sample", "ladder", ["s-1"], site), site)
        except Refused as refused:
            assert "already exists" in str(refused)
        else:
            raise AssertionError("an existing plate was overwritten")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("id", nargs="?")
    parser.add_argument("--page")
    parser.add_argument("--cluster")
    parser.add_argument("--plot")
    parser.add_argument("--claims", help="comma-separated claim ids")
    parser.add_argument("--dry-run", action="store_true", help="print the plate and write nothing")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        print(json.dumps({"self_test": "passed"}))
        return
    if not (args.id and args.page and args.cluster and args.plot):
        parser.error("give ID, --page, --cluster, and --plot")
    try:
        plate = skeleton(args.id, args.page, args.cluster, args.plot, args.claims.split(",") if args.claims else None)
        if args.dry_run:
            print(json.dumps(plate, indent=1, ensure_ascii=False))
        else:
            print(f"Wrote {write(plate)}")
            print(f"Next: add <!-- plate:{plate['id']} --><!-- /plate:{plate['id']} --> to site/{plate['page']}, write the title as the finding, then run python scripts/build_plates.py --page {plate['page']}")
        for claim_id in unlimited(plate):
            print(f"Claim {claim_id} is partly verified and has no limit. Add \"limit\": one public sentence, on its row, or the build refuses the plate.")
    except Refused as refused:
        print(f"FAILED: {refused}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
