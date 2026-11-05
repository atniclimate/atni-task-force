"""Builds site/data/whats-new.json and pours it into the home page's slot and the Library page, so the rows read without scripts and in print.

One derived file, one writer. Its items come from library.json added dates, policy-watch.json, News rows the owner cleared, and the days a plate or claims file
changed. Run it after a merge, a Policy Watch refresh, or a plate build:

    python scripts/build_whats_new.py
    python scripts/build_whats_new.py --news planning-T1/research/intake/2026-11-05/candidates-news.json
    python scripts/build_whats_new.py --check      # write nothing; exit 1 if a page does not match the file

The file keeps what cannot be rebuilt: News rows and the data rows (no plate or claims file holds a build date, so the ledger keeps a hash of each and a change
dates a new row on the day it is seen). Library and policy rows are worked out again each run. A burst stays one row: see library_items and home_rows.
"""
import argparse
from collections import Counter
from datetime import date, timedelta
import hashlib
from html import escape
import json
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import quote

import build_library_strip
import merge_library
from jev_release_screen import hold_reason

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
WINDOW = 90
HOME_ROWS = 6
BURST = 5  # this many records from one publisher in one day read as one row
DAY_TOP = 3  # the single sources a day may show; the rest of the day is one row
KIND_WORDS = {"news": "News", "policy": "Policy", "library": "Library", "data": "Data"}  # also the order within a day
TYPE_ORDER = ["resolution", "legislation", "policy", "report", "dataset", "academic", "tool", "news", "article", "website"]
PAGES = {"ai/": ("AI", "ai"), "data-centers/": ("Data Centers", "data-centers"), "data-centers/resource-use/": ("Resource Use", "data-centers"), "energy/": ("Energy", "energy-feasibility"),
         "energy/funding/": ("Energy Funding", "energy-feasibility"), "energy/potential/": ("What Tribal Plans Say", "energy-feasibility"), "explorer/": ("Explorer", "cross-cutting"), "summit/": ("Summit", "summit")}


def item(day, kind, title, url, area):
    return {"date": day, "kind": kind, "title": title, "url": url, "area": area}


def names_a_nation(text):
    """A row in this feed never singles out a Nation, whatever the source itself is about: its entry stays in the library, counted in the day's row."""
    return bool(hold_reason(text, []))


def library_items(entries):
    """One row per day per bursting publisher, the day's top few sources, and one row for the rest of the day."""
    rows = []
    for day in sorted({e["added"] for e in entries}, reverse=True):
        batch = [e for e in entries if e["added"] == day]
        count = Counter(e["publisher"] for e in batch)
        singles = sorted((e for e in batch if count[e["publisher"]] < BURST), key=lambda e: (not e["featured"], TYPE_ORDER.index(e["type"]), e["title"]))
        readable = {e["title"]: e for e in reversed(singles) if not names_a_nation(f'{e["title"]} {e["publisher"]} {e["summary"]}')}  # one row per title: a report and its landing page
        shown = sorted(readable.values(), key=singles.index)[:DAY_TOP]
        rows += [item(day, "library", e["title"], e["url"], e["areas"][0]) for e in shown]
        for publisher, n in count.most_common():
            if n >= BURST:
                area = Counter(e["areas"][0] for e in batch if e["publisher"] == publisher).most_common(1)[0][0]
                rows.append(item(day, "library", f"{n} records from {publisher} added to the library", f"library/?q={quote(publisher)}", area))
        rest = len(singles) - len(shown)
        if rest:
            rows.append(item(day, "library", f"{rest} more {'source' if rest == 1 else 'sources'} added to the library", "library/", "cross-cutting"))
    return rows


def policy_items(watch, today):
    """The day the searches were rechecked, and each followed item whose newest document falls in the window. An item's own title is the source's words."""
    rows = [item(watch["generated"], "policy", "Policy Watch searches rechecked", "energy/#policy-watch", "cross-cutting")]
    since = (date.fromisoformat(today) - timedelta(days=WINDOW)).isoformat()
    for area, force in watch["task_forces"].items():
        for follow in force.get("follow") or []:
            latest = follow.get("latest") or {}
            if str(latest.get("date") or "") >= since and latest.get("title"):
                title = f'New document on {follow.get("identifier")}' if names_a_nation(latest["title"]) else latest["title"]
                rows.append(item(latest["date"], "policy", title, follow["url"], area))
    return rows


def digest(path):
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()[:12]


def last_commit_day(path, today):
    """Only for the first build, before the ledger holds anything."""
    done = subprocess.run(["git", "-C", str(ROOT), "log", "-1", "--format=%cs", "--", path.relative_to(ROOT).as_posix()], capture_output=True, text=True)
    return done.stdout.strip() or today


def ledger_items(ledger, watch, today):
    """Rows for each plate and claims file that changed, grouped into one row per page per day, and for each newly followed item."""
    first = not ledger
    days_pages, days_evidence, rows = set(), set(), []
    for folder in ("claims", "plates"):
        for path in sorted((SITE / "data" / folder).glob("*.json")):
            key, now = f"{folder}/{path.name}", digest(path)
            if ledger.get(key) == now:
                continue
            ledger[key] = now
            day = last_commit_day(path, today) if first else today
            if folder == "claims":
                days_evidence.add(day)
            else:
                page = json.loads(path.read_text(encoding="utf-8")).get("page") or "index.html"
                days_pages.add((day, page.removesuffix("index.html") or "./"))
    for day in sorted(days_evidence):
        rows.append(item(day, "data", "Source evidence behind the charts updated", "explorer/#all-sources", "cross-cutting"))
    for day, page in sorted(days_pages):
        label, area = PAGES.get(page, ("Home", "cross-cutting"))
        rows.append(item(day, "data", f"Charts updated on the {label} page", page, area))
    for area, force in watch["task_forces"].items():
        for follow in force.get("follow") or []:
            key = f'follow/{follow.get("identifier") or follow["title"]}'
            if key not in ledger:
                ledger[key] = today
                if not first:  # the first build's list is where the feed starts, not news
                    title = "Now following a new item" if names_a_nation(follow["title"]) else f'Now following: {follow["title"]}'
                    rows.append(item(today, "policy", title, follow["url"], area))
    return rows


def news_items(paths, today):
    """Cleared News rows from a pull's candidates. Their one line stays in the T1 record: an item is its headline and its link."""
    rows = []
    for path in paths:
        batch = merge_library.gate(json.loads(path.read_text(encoding="utf-8")))
        for row in batch:
            if not (re.fullmatch(r"\d{4}-\d{2}-\d{2}", row["date"]) and row["url"].startswith("https://") and row["area"] in merge_library.AREAS and row["title"].strip()):
                sys.exit(f"News row {row.get('row')}: needs a YYYY-MM-DD date, an https url, an area, and a headline. Nothing was written")
            rows.append(item(row["date"], "news", row["title"].strip(), row["url"], row["area"]))
        merge_library.record_landed(path, batch, today, "landed-news.csv")
    return rows


def order(rows):
    """Newest day first, then news, policy, library, data; within those the builders' own ranking stands. Repeats collapse."""
    unique = list({(r["date"], r["kind"], r["title"], r["url"]): r for r in rows}.values())
    return sorted(unique, key=lambda r: (-date.fromisoformat(r["date"]).toordinal(), list(KIND_WORDS).index(r["kind"])))


def home_rows(items, count=HOME_ROWS):
    """At most two rows of a kind from one day and three of a kind in all, then whatever is newest if that leaves room."""
    day, kind, picked = Counter(), Counter(), []
    for row in items:
        if len(picked) < count and day[row["date"], row["kind"]] < 2 and kind[row["kind"]] < 3:
            picked.append(row)
            day[row["date"], row["kind"]] += 1
            kind[row["kind"]] += 1
    picked += [row for row in items if row not in picked][: count - len(picked)]
    return sorted(picked, key=items.index)


def recent(items, today):
    since = (date.fromisoformat(today) - timedelta(days=WINDOW)).isoformat()
    return [row for row in items if row["date"] >= since]


def link(url, root):
    """A row's address from a page: a local one is relative to site/, as library.json's are."""
    return escape(url if url.startswith("https://") else root + url, quote=True)


def rows_html(items, root, areas):
    rows = []
    for row in items:
        day = f'{row["date"][5:7]}/{row["date"][8:10]}/{row["date"][:4]}'
        rows.append(f'<li><time datetime="{row["date"]}">{day}</time><span class="whats-new-kind">{KIND_WORDS[row["kind"]]}</span>'
                    f'<a href="{link(row["url"], root)}">{escape(row["title"])}</a><span class="whats-new-area">{escape(areas[row["area"]])}</span></li>')
    return f'<ol class="whats-new-rows" role="list">{"".join(rows)}</ol>'


def home_block(feed, areas):
    return f"""<!-- SLOT:home:whats-new -->
    <section class="section whats-new" aria-labelledby="whats-new-title">
      <div class="wrap whats-new-grid">
        <div class="whats-new-head">
          <h2 id="whats-new-title">What’s New</h2>
          <p class="whats-new-since" data-whats-new-since hidden></p>
          <p>The latest public sources, policy changes, and chart updates. <a href="library/#whats-new">See the last ninety days</a> or the <a href="data/whats-new.json">feed’s data</a>.</p>
        </div>
        {rows_html(home_rows(feed["items"]), "", areas)}
      </div>
    </section>
    <!-- /SLOT -->"""


def library_block(feed, areas):
    rows = recent(feed["items"], feed["generated"])
    return f"""<!-- whats-new:library -->
      <p class="whats-new-since" data-whats-new-since hidden></p>
      <details class="whats-new-all" id="whats-new">
        <summary>What’s New, the last ninety days</summary>
        {rows_html(rows, "../", areas)}
        <p class="caption">{build_library_strip.mark("lc-062", str(len(rows)))} rows, where a burst of records from one publisher is one row. Built from <a href="../data/whats-new.json">whats-new.json</a>, updated {feed["generated"][5:7]}/{feed["generated"][8:10]}/{feed["generated"][:4]}.</p>
      </details>
      <!-- /whats-new:library -->"""


def pour_pages(feed, check=False):
    """Writes both pages from the file, and returns the names of any that changed. With check, writes nothing."""
    areas = build_library_strip.words("AREAS", (SITE / "assets" / "js" / "library.js").read_text(encoding="utf-8"))
    changed = []
    for rel, pattern, block in (("index.html", r"<!-- SLOT:home:whats-new -->.*?<!-- /SLOT -->", home_block(feed, areas)),
                                ("library/index.html", r"<!-- whats-new:library -->.*?<!-- /whats-new:library -->", library_block(feed, areas))):
        path = SITE / rel
        before = path.read_bytes().decode("utf-8")
        after, found = re.subn(pattern, lambda _: block, before, count=1, flags=re.S)
        if not found:
            raise ValueError(f"site/{rel} needs its What's New markers")
        if after != before:
            changed.append(rel)
            if not check:
                path.write_bytes(after.encode("utf-8"))
    return changed


def build(today, news=()):
    """The feed: what the file already holds, what the data says now, and any newly landed News."""
    path = SITE / "data" / "whats-new.json"
    prior = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {"items": [], "ledger": {}}
    entries = json.loads((SITE / "data" / "library.json").read_text(encoding="utf-8"))["entries"]
    watch = json.loads((SITE / "data" / "policy-watch.json").read_text(encoding="utf-8"))
    ledger = dict(prior["ledger"])
    kept = [row for row in prior["items"] if row["kind"] in ("news", "data") or row["title"].startswith("Now following")]
    new = ledger_items(ledger, watch, today)
    items = order([*news_items(news, today), *kept, *new, *library_items(entries), *policy_items(watch, today)])
    feed = {"schema": 1, "tier": "T0", "generated": today, "window_days": WINDOW, "items": items, "ledger": dict(sorted(ledger.items()))}
    path.write_text(json.dumps(feed, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    pour_pages(feed)
    return feed


def self_test():
    a = lambda n: item("2026-11-05", "library", f"t{n}", "library/", "ai")
    picked = home_rows([a(0), a(1), a(2), a(3), item("2026-11-04", "policy", "p", "library/", "ai"), item("2026-11-04", "data", "d", "library/", "ai"), item("2026-11-03", "library", "o", "library/", "ai")])
    assert [r["title"] for r in picked] == ["t0", "t1", "t2", "p", "d", "o"], picked
    entries = [{"added": "2026-11-05", "publisher": "Filer", "title": f"r{n}", "url": f"https://x.org/{n}", "areas": ["ai"], "type": "report", "featured": False, "summary": "s"} for n in range(9)]
    entries.append({"added": "2026-11-05", "publisher": "Other", "title": "Examplename Nation plan", "url": "https://y.org/", "areas": ["ai"], "type": "report", "featured": True, "summary": "s"})
    rows = library_items(entries)
    assert [r["title"] for r in rows] == ["9 records from Filer added to the library", "1 more source added to the library"], rows
    print("self-test passed")


def main():
    p = argparse.ArgumentParser(description="Build the What's New feed and pour it into its pages.")
    p.add_argument("--news", action="append", type=Path, default=[], help="candidates-news.json from an Intake pull; every row needs the owner's mark")
    p.add_argument("--today", default=date.today().isoformat())
    p.add_argument("--check", action="store_true", help="write nothing; exit 1 if a page does not match the file")
    p.add_argument("--self-test", action="store_true")
    a = p.parse_args()
    if a.self_test:
        return self_test()
    if a.check:
        stale = pour_pages(json.loads((SITE / "data" / "whats-new.json").read_text(encoding="utf-8")), check=True)
        if stale:
            sys.exit(f"build_whats_new: out of date: {stale}. Run python scripts/build_whats_new.py")
        return print("nothing to do")
    feed = build(a.today, a.news)
    print(f"{len(feed['items'])} items, {len(recent(feed['items'], a.today))} in the last {WINDOW} days")


if __name__ == "__main__":
    sys.exit(main())
