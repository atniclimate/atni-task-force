"""Merge library candidate files into site/data/library.json, link-checking every new URL.

Candidates are JSON arrays of {title, url, publisher, date, type, areas, tribal_specific, summary}
from public (T0) sources. New entries are deduplicated by normalized URL against the library and
each other, then checked over HTTP: 2xx/3xx pass; 401/403/429 (common bot blocks) are kept as
unverified; anything else is dropped and reported. Run from the repository root:

    python scripts/merge_library.py planning-T1/research/candidates/*.json --added 2026-10-29
    python scripts/merge_library.py planning-T1/research/intake/2026-11-05/candidates-library.json --added 2026-11-05 --require-cleared
    python scripts/merge_library.py --self-test

--require-cleared is the Intake route (scripts/intake_pull.py): every row in the snapshot needs the owner's mark, or nothing is written. The merge stamps
tier T0, so that mark is the human check behind the stamp. The composition strip on the library page is rebuilt from the file after every merge.
"""
import argparse
import csv
import json
import re
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import build_library_strip
from validate_public import FORBIDDEN

LIBRARY = Path(__file__).resolve().parents[1] / "site" / "data" / "library.json"
CLEARED = re.compile(r"(no )?[A-Za-z]{2,5} \d{2}/\d{2}/\d{4}( \S+)?")  # "PF 11/05/2026" lands the row; "no PF 11/05/2026" declines it
TYPES = {"resolution", "report", "policy", "legislation", "article", "academic", "dataset", "tool", "website", "news"}
AREAS = {"energy-feasibility", "data-centers", "ai", "summit", "cross-cutting"}
UA = "ATNI-task-force-library-check (+https://github.com/atniclimate/atni-task-force)"


def norm(url):
    s = urlsplit(url.strip())
    return urlunsplit((s.scheme.lower(), s.netloc.lower().removeprefix("www."), s.path.rstrip("/"), s.query, ""))


def slug(text, taken):
    base = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60].strip("-") or "entry"
    s, i = base, 2
    while s in taken:
        s, i = f"{base}-{i}", i + 1
    taken.add(s)
    return s


def check(url):
    """HTTP status for url; HEAD first, GET whenever HEAD fails (many servers mishandle HEAD)."""
    url = url.replace(" ", "%20")
    code = 0
    for method in ("HEAD", "GET"):
        req = urllib.request.Request(url, method=method, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=25) as r:
                return r.status
        except urllib.error.HTTPError as e:
            code = e.code
        except Exception:
            code = 0
    return code


def clean(c):
    """Return an entry body that meets validate_public.py's library contract, or None.

    Every field must be non-empty, dates are YYYY or YYYY-MM-DD (YYYY-MM keeps its year),
    links are https (http is upgraded and must then pass the link check).
    """
    url = str(c.get("url", "")).strip()
    if url.startswith("http://"):
        url = "https://" + url[len("http://"):]
    date = str(c.get("date") or "").strip()
    if re.fullmatch(r"\d{4}-\d{2}", date):
        date = date[:4]
    title, summary = (c.get("title") or "").strip(), (c.get("summary") or "").strip()
    if not (title and summary and url.startswith("https://") and re.fullmatch(r"\d{4}(-\d{2}-\d{2})?", date)):
        return None
    return {
        "title": title, "url": url,
        "publisher": (c.get("publisher") or "").strip() or urlsplit(url).netloc.removeprefix("www."),
        "date": date, "type": c.get("type") if c.get("type") in TYPES else "article",
        "areas": [a for a in c.get("areas", []) if a in AREAS] or ["cross-cutting"],
        "tribal_specific": bool(c.get("tribal_specific")), "summary": summary,
    }


def gate(rows):
    """The rows a person has cleared to land. Any row left undecided, or not public, or holding a forbidden string stops the whole batch: nothing is written."""
    kept, problems = [], []
    for row in rows:
        where = f"row {row.get('row', '?')} ({row.get('title') or row.get('url') or 'no title'})"
        mark = str(row.get("cleared") or "").strip()
        text = json.dumps({k: v for k, v in row.items() if k not in ("flags", "submitted_by")}, ensure_ascii=False)
        if not CLEARED.fullmatch(mark):
            problems.append(f"{where}: not cleared. Read REPORT.md, mark the row on the sheet as PF MM/DD/YYYY or no PF MM/DD/YYYY, and pull again")
        elif mark.startswith("no "):
            continue
        elif str(row.get("public_source") or "").strip().lower() != "yes":
            problems.append(f"{where}: public_source is not yes, so it cannot be T0. Decline the row, or correct the column and clear it again")
        elif FORBIDDEN.search(text):
            problems.append(f"{where}: holds a T1 location, private link, or private address. Decline the row, or correct it and clear it again")
        else:
            kept.append(row)
    if problems:
        sys.exit("Nothing was merged:\n  " + "\n  ".join(problems))
    return kept


def record_landed(path, rows, landed, name):
    """Beside the snapshot, the column the owner copies back to the sheet: this script writes nothing to any outside service."""
    with (path.parent / name).open("w", newline="", encoding="utf-8") as out:
        writer = csv.writer(out)
        writer.writerow(["row", "url", "landed"])
        writer.writerows([row.get("row"), row["url"], landed] for row in rows)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("files", nargs="*", type=Path)
    p.add_argument("--added", required="--self-test" not in sys.argv)
    p.add_argument("--require-cleared", action="store_true", help="the Intake route: every row needs the owner's mark in the snapshot")
    p.add_argument("--self-test", action="store_true")
    a = p.parse_args()
    if a.self_test:
        return self_test()
    lib = json.loads(LIBRARY.read_text(encoding="utf-8"))
    seen = {norm(e["url"]) for e in lib["entries"]}
    ids = {e["id"] for e in lib["entries"]}
    new, bad = [], 0
    batches = [(f, json.loads(f.read_text(encoding="utf-8"))) for f in a.files]
    if not a.require_cleared and any("cleared" in c for _, rows in batches for c in rows):
        sys.exit("These are Intake rows: run with --require-cleared")
    if a.require_cleared:
        batches = [(f, gate(rows)) for f, rows in batches]
    for f, rows in batches:
        for c in rows:
            e = clean(c)
            if not e:
                bad += 1
            elif norm(e["url"]) not in seen:
                seen.add(norm(e["url"]))
                new.append(e)
    with ThreadPoolExecutor(8) as pool:
        codes = list(pool.map(lambda e: check(e["url"]), new))
    kept, dropped = [], []
    for e, code in zip(new, codes):
        if 200 <= code < 400 or code in (401, 403, 429):
            kept.append({"id": slug(e["title"], ids), **e, "tier": "T0", "added": a.added, "featured": False,
                         "link_status": "ok" if code < 400 else "unverified"})
        else:
            dropped.append((code, e["url"]))
    lib["entries"] += kept
    lib["updated"] = a.added
    LIBRARY.write_text(json.dumps(lib, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    build_library_strip.run()
    if a.require_cleared:
        landed = {e["url"] for e in kept}
        for f, rows in batches:
            record_landed(f, [c for c in rows if (e := clean(c)) and e["url"] in landed], a.added, "landed-library.csv")
    print(f"added {len(kept)} ({sum(e['link_status'] == 'unverified' for e in kept)} unverified), "
          f"dropped {len(dropped)} dead links, skipped {bad} malformed; library now {len(lib['entries'])}")
    for code, url in dropped:
        print(f"  dropped {code}: {url}")


def self_test():
    assert norm("https://WWW.Example.org/a/?x=1#frag") == "https://example.org/a?x=1"
    taken = {"solar-report"}
    assert slug("Solar Report", taken) == "solar-report-2" and slug("!!!", taken) == "entry"
    assert clean({"title": "T", "url": "ftp://x", "summary": "s", "date": "2025"}) is None
    assert clean({"title": "T", "url": "https://x.org", "summary": "s", "date": "May 2025"}) is None
    assert clean({"title": "T", "url": "https://x.org", "summary": "", "date": "2025"}) is None
    e = clean({"title": "T", "url": "http://www.x.org/a", "summary": "s", "type": "blog",
               "areas": ["ai", "nope"], "date": "2025-05"})
    assert e and e["url"] == "https://www.x.org/a" and e["publisher"] == "x.org"
    assert e["type"] == "article" and e["areas"] == ["ai"] and e["date"] == "2025"
    ok = {"title": "T", "url": "https://x.org", "public_source": "yes", "cleared": "PF 11/05/2026"}
    assert gate([ok, {**ok, "cleared": "no PF 11/05/2026"}]) == [ok]
    for bad in ({**ok, "cleared": ""}, {**ok, "cleared": "yes"}, {**ok, "public_source": "no"}, {**ok, "url": "https://docs.google.com/x"}):
        try:
            gate([bad])
        except SystemExit:
            continue
        raise AssertionError(bad)
    print("self-test passed")


if __name__ == "__main__":
    sys.exit(main())
