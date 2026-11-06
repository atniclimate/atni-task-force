"""Pull the Intake sheet into local T1 candidates and screen every row. Nothing here is a release: the owner reads REPORT.md and marks rows on the sheet.

The sheet is ATNI's T1 working space and the public site never reads it. This script takes a download of it, snapshots the rows under
planning-T1/research/intake/<date>/, screens them, and writes candidates per tab and REPORT.md there. It sends nothing to an outside service; the only
requests it makes are fetches of the public URLs the rows list. Run from the repository root:

    python scripts/intake_pull.py --csv library.csv --csv news.csv --csv claims.csv
    python scripts/intake_pull.py --csv intake.xlsx
    python scripts/intake_pull.py --self-test

--csv takes each tab's CSV export, or one .xlsx download holding all three; a file's header row says which tab it is. A script cannot use the Drive
connector, so --sheet <id> says how to fetch the download at the owner's direction, and the id is never written anywhere.

The screens can flag and cannot clear. A quote found on its source page stays unverified, and the name screen is a floor. A mark on the sheet counts only
if the last report showed the row's exact text, so a row edited after clearing must be cleared again. See docs/LIBRARY.md.
"""
import argparse
import csv
from datetime import date
import hashlib
from html import unescape
import ipaddress
import json
from pathlib import Path
import re
import socket
import sys
import unicodedata
import urllib.request
from urllib.parse import urlsplit

import merge_library
from jev_release_screen import hold_reason
from validate_public import FORBIDDEN

ROOT = Path(__file__).resolve().parents[1]
INTAKE = ROOT / "planning-T1" / "research" / "intake"
HOLD_TERMS = ROOT / "planning-T1" / "ai-notes" / "hold-terms.txt"
OWNER = ["cleared", "landed"]
COLUMNS = {
    "library": ["title", "url", "publisher", "date", "type", "area", "more_areas", "tribal_specific", "summary", "submitted_by", "public_source", *OWNER],
    "news": ["date", "headline", "url", "one_line", "area", "submitted_by", "public_source", *OWNER],
    "claims": ["entity", "metric", "value", "low", "high", "unit", "year", "boundary", "source_title", "publisher", "url", "published", "kind", "quote",
               "cluster", "submitted_by", "public_source", *OWNER],
}
MARKS = {"summary": "library", "headline": "news", "metric": "claims"}  # a column only that tab has
KINDS = ["agency", "filing", "company-report", "peer-reviewed", "preprint", "press", "model", "blog"]
MAX_BYTES = 40_000_000


def read_table(rows):
    """(tab, [{column: value, "row": n}]) from one table's raw rows, whose banner rows sit above the header. An EXAMPLE row is the template's own."""
    rows = [[str(cell if cell is not None else "").strip() for cell in row] for row in rows]
    at = next((i for i, row in enumerate(rows) if "public_source" in row and "url" in row), None)
    tab = next((name for mark, name in MARKS.items() if at is not None and mark in rows[at]), None)
    if tab is None:
        return None, []
    header = rows[at]
    missing = sorted(set(COLUMNS[tab]) - set(header))
    if missing:
        sys.exit(f"The {tab} table is missing columns {missing}: export the Intake sheet whole, with its header row")
    found = []
    for n, row in enumerate(rows[at + 1:], at + 2):
        record = dict(zip(header, row))
        if any(record.values()) and not any(cell.startswith("EXAMPLE:") for cell in row):
            found.append({**{c: record.get(c, "") for c in COLUMNS[tab]}, "row": n})
    return tab, found


def read_file(path):
    """A CSV export of one tab, or an .xlsx of all three."""
    if path.suffix.lower() == ".xlsx":
        try:
            from openpyxl import load_workbook
        except ImportError:
            sys.exit("Reading an .xlsx needs a working openpyxl. Repair it, or download each tab as CSV and pass --csv three times")
        book = load_workbook(path, read_only=True, data_only=True)
        return [read_table(sheet.iter_rows(values_only=True)) for sheet in book.worksheets]
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return [read_table(csv.reader(handle))]


def row_hash(row):
    """Every column but the owner's: a change here means the owner has not read this text."""
    return hashlib.sha256(json.dumps({k: v for k, v in row.items() if k not in (*OWNER, "row")}, sort_keys=True).encode()).hexdigest()[:16]


def row_key(tab, row):
    """What keeps a row the same row across pulls."""
    return merge_library.norm(row["url"]) if tab == "library" else f'{merge_library.norm(row["url"])} {row.get("headline", "")}{row.get("entity", "")}{row.get("metric", "")}'


def iso_date(text):
    """YYYY or YYYY-MM-DD as typed, M/D/YYYY as a sheet may export it; anything else stays as typed so clean() and the report catch it."""
    text = text.strip()
    match = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", text)
    return f"{match[3]}-{int(match[1]):02d}-{int(match[2]):02d}" if match else text


def public_host(url):
    """A row's address must be on the public internet. shortcut: a redirect is not rechecked; resolve each hop if rows ever come from outside named managers."""
    try:
        host = urlsplit(url).hostname
        return urlsplit(url).scheme == "https" and all(ipaddress.ip_address(info[4][0]).is_global for info in socket.getaddrinfo(host, 443))
    except (OSError, ValueError, TypeError):
        return False


def fetch_bytes(url):
    request = urllib.request.Request(url.replace(" ", "%20"), headers={"User-Agent": merge_library.UA})
    with urllib.request.urlopen(request, timeout=40) as response:
        return response.read(MAX_BYTES)


def folded(text):
    """Fold what a source and a typed quote may spell differently: unicode forms, curly quotes, case, and whitespace."""
    text = unicodedata.normalize("NFKC", text).translate({0x2018: "'", 0x2019: "'", 0x201C: '"', 0x201D: '"', 0x2013: "-", 0x2014: "-", 0xAD: None})
    return re.sub(r"\s+", " ", text).strip().casefold()


def page_text(body):
    if body.startswith(b"%PDF"):
        import fitz

        with fitz.open(stream=body, filetype="pdf") as pdf:
            return "\n".join(page.get_text() for page in pdf)
    text = body.decode("utf-8", "replace")
    text = re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", text)
    return unescape(re.sub(r"<[^>]+>", " ", text))


def quote_check(url, quote):
    """found, not found, or unreadable. It can flag a row and never clears one: a page rendered by script or a scanned PDF reads as not found."""
    if not quote.strip():
        return "no quote"
    try:
        return "found" if folded(quote) in folded(page_text(fetch_bytes(url))) else "not found"
    except Exception:  # a dead page, a bad PDF, or a timeout: each is one flag on one row, and the pull goes on
        return "unreadable"


def link_note(url):
    """The merge's own link check, in its own words: unverified is a bot block a person should open."""
    code = merge_library.check(url)
    if 200 <= code < 400:
        return None
    return f"link blocked an automated check ({code}): open it by hand" if code in (401, 403, 429) else f"dead link ({code}): the merge will drop it"


def screen(tab, row, library, terms):
    """Every flag on one row."""
    text = " ".join(str(v) for k, v in row.items() if k not in (*OWNER, "row"))
    flags = [f"forbidden: {m} (cannot land)" for m in sorted(set(FORBIDDEN.findall(text)))]
    flags += [f"name screen: {reason}" for reason in hold_reason(text, terms)]
    if row["public_source"].lower() != "yes":
        flags.append("public_source is not yes (cannot land)")
    if not row["submitted_by"]:
        flags.append("submitted_by is empty")
    if tab == "claims" and row["kind"] not in KINDS:
        flags.append(f"kind {row['kind']!r} is not one of {', '.join(KINDS)}")
    url = row["url"]
    if tab == "library" and merge_library.norm(url) in library:
        flags.append("already in the library: the merge will skip it")
    if not public_host(url):
        flags.append("address is not a public https page: not fetched")
        return flags
    note = link_note(url)
    if note:
        flags.append(note)
    return flags


def library_candidate(row):
    areas = [row["area"], *re.split(r"[;,\s]+", row["more_areas"])]
    body = merge_library.clean({**row, "date": iso_date(row["date"]), "areas": [a for a in areas if a], "tribal_specific": row["tribal_specific"].lower() == "yes"})
    return body or {"title": row["title"], "url": row["url"], "malformed": True}


def news_candidate(row):
    return {"date": iso_date(row["date"]), "title": row["headline"], "url": row["url"], "area": row["area"], "one_line": row["one_line"]}


def number(text):
    try:
        value = float(text) if text else None
        return int(value) if value is not None and value.is_integer() else value
    except ValueError:
        return text  # as typed: the report flags it


def claim_candidate(row):
    """The brief's evidence record. Always unverified here: only a person sets verified or partly, and the validator keeps anything else out of site/."""
    return {
        "cluster": row["cluster"], "entity": row["entity"], "metric": row["metric"], "value": number(row["value"]), "low": number(row["low"]), "high": number(row["high"]),
        "unit": row["unit"], "year": number(row["year"]), "boundary": row["boundary"],
        "source": {"title": row["source_title"], "publisher": row["publisher"], "url": row["url"], "published": iso_date(row["published"]), "kind": row["kind"]},
        "quote": row["quote"], "derived": None, "status": "unverified", "url": row["url"], "title": f'{row["entity"]}: {row["metric"]}',
    }


BUILD = {"library": library_candidate, "news": news_candidate, "claims": claim_candidate}


def pull_order(folder):
    """A pull folder's place: its date, then its -N (a day's first pull has none). A folder's clock moves when a file lands in it, so it is not read."""
    match = re.fullmatch(r"(\d{4}-\d{2}-\d{2})(?:-(\d+))?", folder.name)
    return (match[1], int(match[2] or 1)) if match else (folder.name, 0)


def earlier(out, tab):
    """The newest earlier record of each row, from the candidates of every pull before this one."""
    seen = {}
    dirs = [d for d in out.parent.iterdir() if d.is_dir() and d != out and (d / f"candidates-{tab}.json").is_file()]
    for folder in sorted(dirs, key=pull_order):
        for record in json.loads((folder / f"candidates-{tab}.json").read_text(encoding="utf-8")):
            seen[record["key"]] = record
    return seen


def judged_mark(row, prior, flags):
    """The mark that counts. It needs a report that showed this exact text, so a mark and an edit in one pull land nothing, and the mark itself must then move."""
    mark = row["cleared"]
    kind = merge_library.mark_of(mark)  # the merge reads the mark the same way
    if not mark or kind == "declined":
        return mark
    if kind is None:
        flags.append(f"cleared mark not read: {mark!r} (write PF MM/DD/YYYY, or no PF MM/DD/YYYY to decline)")
    elif prior is None or prior["row_hash"] != row_hash(row):
        flags.append("cleared mark dropped: the last report did not show this exact text. Read this report, then write the mark again")
    elif prior.get("cleared") or prior.get("cleared_on_sheet") != mark:
        return mark
    else:
        flags.append("cleared mark dropped: this row was edited after clearing and the mark has not been rewritten. Write a new mark, a new date or a word after it")
    return ""


def write_report(out, tabs, pulled, terms_note, via):
    lines = [f"# Intake report, pulled {pulled}", "", "> Tier: T1. Local only. Screens flag; they do not clear, and passing one is not a T0 release. Each batch that lands needs a row in `planning-T1/RELEASE-LOG.md`.", "",
             f"Read from: {via}. {terms_note}", ""]
    for tab, rows in tabs.items():
        cleared = sum(merge_library.mark_of(r["cleared"]) == "cleared" for r in rows)
        declined = sum(merge_library.mark_of(r["cleared"]) == "declined" for r in rows)
        lines += [f"## {tab.capitalize()}: {len(rows)} rows, {cleared} cleared, {declined} declined, {len(rows) - cleared - declined} undecided, {sum(bool(r['flags']) for r in rows)} flagged", ""]
        if tab == "claims":
            lines += ["Claims stay here: `status` is `unverified`, and the validator keeps an unverified claim out of `site/`. A person moves a claim to the evidence record with `verified` or `partly` and its limit.", ""]
        if rows:
            lines += ["| Row | Item | Mark | Flags |", "|---|---|---|---|"]
            for r in rows:
                item = str(r.get("title") or "").replace("|", "/")
                lines.append(f"| {r['row']} | {item}<br>{r['url']} | {r['cleared'] or 'undecided'} | {'; '.join(r['flags']).replace('|', '/') or 'none'} |")
            lines.append("")
    (out / "REPORT.md").write_text("\n".join(lines), encoding="utf-8")


def pull(files, parent, pulled, terms_path, via):
    """Snapshot, screen, and write. Returns the output folder."""
    parent.mkdir(parents=True, exist_ok=True)
    out, n = parent / pulled, 2
    while out.exists():  # a snapshot is the record behind a mark, so a second pull in a day never writes over the first
        out, n = parent / f"{pulled}-{n}", n + 1
    out.mkdir()
    tables = {}
    for path in files:
        for tab, rows in read_file(path):
            if tab:
                tables.setdefault(tab, []).extend(rows)
    if not tables:
        sys.exit("No Intake table found: each file needs a header row with url and public_source")
    terms = [t.strip() for t in terms_path.read_text(encoding="utf-8").splitlines() if t.strip() and not t.startswith("#")] if terms_path.is_file() else []
    terms_note = "Name screen: Nation pattern and the local hold-terms file." if terms else "Name screen: Nation pattern only, since no hold-terms file was found. Read the rows with more care."
    library = {merge_library.norm(e["url"]) for e in json.loads(merge_library.LIBRARY.read_text(encoding="utf-8"))["entries"]}
    done = {}
    for tab, rows in tables.items():
        with (out / f"snapshot-{tab}.csv").open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, ["row", *COLUMNS[tab]])
            writer.writeheader()
            writer.writerows(rows)
        before = earlier(out, tab)
        records = []
        for row in rows:
            if row["landed"]:
                continue  # rows are never deleted from the sheet; a landed row is the record of what was proposed
            flags = screen(tab, row, library, terms)
            record = BUILD[tab](row)
            if tab == "claims":
                check = quote_check(row["url"], row["quote"]) if public_host(row["url"]) else "not fetched"
                record["quote_check"] = check
                if check != "found":
                    flags.append(f"quote {check} on the source page")
                flags += [f"{name} is not a number" for name in ("value", "low", "high", "year") if isinstance(record.get(name), str)]
            if record.get("malformed"):
                flags.append("malformed: needs a title, a summary, an https url, and a date as YYYY or YYYY-MM-DD")
            key = row_key(tab, row)
            mark = judged_mark(row, before.get(key), flags)
            records.append({**record, "key": key, "row": row["row"], "row_hash": row_hash(row), "public_source": row["public_source"].lower(),
                            "submitted_by": row["submitted_by"], "cleared": mark, "cleared_on_sheet": row["cleared"], "flags": flags})
        (out / f"candidates-{tab}.json").write_text(json.dumps(records, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        done[tab] = records
    write_report(out, done, pulled, terms_note, via)
    (out / "manifest.json").write_text(json.dumps({"pulled": pulled, "via": via, "files": {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in files},
                                                   "rows": {tab: len(rows) for tab, rows in tables.items()}}, indent=1) + "\n", encoding="utf-8")
    return out


def self_test():
    tab, rows = read_table([["Public sources only."], ["headline", "url", "public_source", "date", "one_line", "area", "submitted_by", "cleared", "landed"],
                            ["EXAMPLE: a row", "https://x.org", "yes"], ["A", "https://x.org/a", "yes", "1/2/2026"], [""]])
    assert tab == "news" and [r["row"] for r in rows] == [4] and rows[0]["headline"] == "A", rows
    assert iso_date("1/2/2026") == "2026-01-02" and iso_date("2026") == "2026"
    assert read_table([["a", "b"]]) == (None, [])
    assert folded("A’s  \n“quote”") == "a's \"quote\""
    assert page_text(b"<p>a&amp;b</p><script>no</script>").split() == ["a&b"]
    assert not public_host("https://127.0.0.1/x") and not public_host("http://example.org/")
    row = {"cleared": "PF 11/05/2026", "url": "u"}
    flags = []
    assert judged_mark(row, None, flags) == "" and flags
    prior = {"row_hash": row_hash(row), "cleared": "", "cleared_on_sheet": ""}
    assert judged_mark(row, prior, []) == "PF 11/05/2026", "a new mark on text the report showed"
    assert judged_mark(row, {**prior, "cleared_on_sheet": "PF 11/05/2026"}, []) == "", "the old mark after an edit"
    assert judged_mark(row, {**prior, "cleared": "PF 11/05/2026", "cleared_on_sheet": "PF 11/05/2026"}, []) == "PF 11/05/2026"
    assert sorted(map(Path, ["2026-11-05-10", "2026-11-06", "2026-11-05", "2026-11-05-2"]), key=pull_order) == list(map(Path, ["2026-11-05", "2026-11-05-2", "2026-11-05-10", "2026-11-06"]))
    base = {"public_source": "yes", "submitted_by": "PF", "url": "http://x.org/a", "kind": "agency", "cleared": "", "landed": ""}  # http: screen stops before any network call
    assert not any("kind" in f for f in screen("claims", base, set(), []))
    assert any("kind 'rumor' is not one of" in f for f in screen("claims", {**base, "kind": "rumor"}, set(), [])), "an unknown kind"
    assert not any("kind" in f for f in screen("news", {**base, "kind": "rumor"}, set(), [])), "kind is a claims column only"
    print("self-test passed")


def main(argv=None):
    p = argparse.ArgumentParser(description="Pull the Intake sheet into local T1 candidates.")
    p.add_argument("--csv", action="append", type=Path, default=[], help="a tab's CSV export or an .xlsx download; repeat per file")
    p.add_argument("--sheet", help="the sheet's id, for a read through the Drive connector at the owner's direction; never written anywhere")
    p.add_argument("--out", type=Path, default=INTAKE, help="the folder that holds one folder per pull")
    p.add_argument("--date", default=date.today().isoformat())
    p.add_argument("--hold-terms", type=Path, default=HOLD_TERMS, help="local name screen file; stays local")
    p.add_argument("--self-test", action="store_true")
    a = p.parse_args(argv)
    if a.self_test:
        return self_test()
    if a.sheet and not a.csv:
        sys.exit("A script cannot use the Drive connector. At the owner's direction, in the session: download_file_content with this fileId and exportMimeType "
                 "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, decode it to a file under planning-T1/research/intake/, then run with --csv that file. "
                 "A plain export returns the first tab only.")
    if not a.csv:
        p.error("give --csv, once per file")
    out = pull(a.csv, a.out, a.date, a.hold_terms, "the Drive connector, id not recorded" if a.sheet else "a downloaded export")
    print(f"wrote {out.name}/REPORT.md, candidates, and snapshots. Read REPORT.md; nothing has landed.")


if __name__ == "__main__":
    sys.exit(main())
