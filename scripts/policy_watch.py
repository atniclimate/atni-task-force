"""Policy watch: preloaded Policy Sentinel searches and follow lists for the three Energy Task Forces.

site/data/policy-watch.json holds, for each task force, a list of searches and a follow list. The hand-written
fields are the search id, title, why, source, scope, query and filters, and the follow item kind, source, id or
value, title, reason and importable flag. This script derives the rest (official and Policy Sentinel links,
live-check results, follow details) from them and writes the importable follow files in
site/data/policy-sentinel/.

    python scripts/policy_watch.py refresh      live checks, then rewrite the JSON and the follow files
    python scripts/policy_watch.py check        offline: links and follow files match the hand-written fields
    python scripts/policy_watch.py --self-test

Keyless sources (Federal Register, Grants.gov, Washington Legislature, reginfo.gov) are queried the way Policy
Sentinel's demo service queries them. GovInfo and Congress.gov use Policy Sentinel's api.data.gov key, so those
searches stay "unchecked". Standard library only. See docs/POLICY-WATCH.md.
"""
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WATCH = ROOT / "site" / "data" / "policy-watch.json"
FOLLOW_DIR = ROOT / "site" / "data" / "policy-sentinel"
DEMO = "https://atniclimate.github.io/policy-sentinel/"
WORKER = "https://policy-sentinel-demo.atniclimate.workers.dev"
FR_API = "https://www.federalregister.gov/api/v1"
GRANTS_API = "https://api.grants.gov/v1/api/search2"
UA = "ATNI-task-force-policy-watch/1.0 (+https://atniclimate.github.io/atni-task-force/)"
PAGE_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 " + UA
BLOCKS_SCRIPTS = {"www.congress.gov", "www.ferc.gov"}  # bot checks: open these in a browser
KEYLESS = {"federal-register", "grants", "washington", "unified-agenda"}  # safe for a future run=1
FR_FIELDS = ["document_number", "title", "type", "agencies", "publication_date", "html_url", "abstract", "citation",
             "comments_close_on", "docket_ids", "regulation_id_numbers", "cfr_references", "topics"]
FR_COND = {"text": "term", "docket": "docket_id", "rin": "regulation_id_number"}
GRANTS_ELIGIBLE = "federally_recognized_native_american_tribal_governments,other_native_american_tribal_organizations"
CONGRESS_PAGES = {"hr": "house-bill", "s": "senate-bill", "hjres": "house-joint-resolution",
                  "sjres": "senate-joint-resolution", "hconres": "house-concurrent-resolution",
                  "sconres": "senate-concurrent-resolution", "hres": "house-resolution", "sres": "senate-resolution"}
FR_DOCUMENT_NUMBER = re.compile(r"(?:\d{2}|\d{4})-\d{4,6}")
RIN = re.compile(r"\d{4}-[A-Z0-9]{4}")
CFR_PART = re.compile(r"([1-9]\d{0,4})(?:-([1-9]\d{0,4}))?")


# ---- addresses -------------------------------------------------------------------------------------------------

def qs(pairs, safe=""):
    return "&".join(f"{urllib.parse.quote(k, safe='')}={urllib.parse.quote(v, safe=safe)}" for k, v in pairs)


def ordinal(n):
    return f"{n}" + ("th" if 11 <= n % 100 <= 13 or n % 10 > 3 else ("th", "st", "nd", "rd")[n % 10])


def official_url(s):
    """The official site's own results page for the same query."""
    f, q = s.get("filters", {}), s["query"]
    src = s["source"]
    if src == "federal-register":
        match = f.get("match", "text")
        pairs = [(f"conditions[{FR_COND[match]}]", q)]
        if f.get("document_type"):
            pairs.append(("conditions[type][]", f["document_type"]))
        pairs.append(("order", "relevance" if match == "text" else "newest"))
        return "https://www.federalregister.gov/documents/search?" + qs(pairs)
    if src == "grants":
        return "https://simpler.grants.gov/search?" + qs(
            [("query", q), ("status", "forecasted,posted"), ("eligibility", GRANTS_ELIGIBLE)], safe=",")
    if src == "govinfo":
        return "https://www.govinfo.gov/app/search/" + urllib.parse.quote(
            json.dumps({"query": q, "offset": 0}, separators=(",", ":")), safe="()")
    if src == "congress":
        kind, number, congress = q.split()
        return f"https://www.congress.gov/bill/{ordinal(int(congress))}-congress/{CONGRESS_PAGES[kind]}/{int(number)}"
    if src == "washington":
        _, number, biennium = q.split()
        return f"https://app.leg.wa.gov/billsummary?BillNumber={int(number)}&Year={biennium[:4]}&Initiative=false"
    if src == "unified-agenda":
        return f"https://www.reginfo.gov/public/do/eAgendaViewRule?RIN={q}"
    raise ValueError(f"unknown source {src}")


def policy_sentinel_url(s):
    """Demo address plus the parameters proposed in planning-T1/integration/policy-sentinel-prefill-proposal.md."""
    f = s.get("filters", {})
    if s["source"] == "unified-agenda":  # no search of its own: a Federal Register RIN lookup shows the agenda link
        pairs = [("scope", "federal"), ("source", "federal-register"), ("q", s["query"]), ("match", "rin")]
    else:
        pairs = [("scope", s["scope"]), ("source", s["source"]), ("q", s["query"])]
        if f.get("match") in ("docket", "rin"):
            pairs.append(("match", f["match"]))
        if f.get("document_type"):
            pairs.append(("type", f["document_type"]))
        if f.get("tribal_eligibility"):
            pairs.append(("tribal", "1"))
    if s["source"] in KEYLESS:
        pairs.append(("run", "1"))
    return DEMO + "?" + qs(pairs)


# ---- network ---------------------------------------------------------------------------------------------------

def fetch(url, data=None, headers=None):
    """(status, bytes); status is None when the host cannot be reached."""
    time.sleep(0.3)
    req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except (urllib.error.URLError, TimeoutError):
        return None, b""


def plain(body):
    text = re.sub(r"(?s)<(script|style).*?</\1>|<[^>]+>", " ", body.decode("utf-8", "replace"))
    return re.sub(r"\s+", " ", text.replace("&nbsp;", " "))


def fr_params(s):
    """The request Policy Sentinel's service sends for a Federal Register search (first page)."""
    f = s.get("filters", {})
    match = f.get("match", "text")
    pairs = [(f"conditions[{FR_COND[match]}]", s["query"]), ("per_page", "10"), ("page", "1"),
             ("order", "relevance" if match == "text" else "newest")]
    if f.get("document_type"):
        pairs.append(("conditions[type][]", f["document_type"]))
    return pairs + [("fields[]", x) for x in FR_FIELDS]


def check_fr(s):
    status, body = fetch(f"{FR_API}/documents.json?" + qs(fr_params(s)))
    if status != 200:
        raise RuntimeError(f"Federal Register API answered {status}")
    count = json.loads(body).get("count", 0)
    return (count, "Federal Register API, the request Policy Sentinel sends (first page)",
            "The Federal Register stops counting at 10000." if count >= 10000 else None)


def check_grants(s):
    body = {"rows": 10, "keyword": s["query"], "oppStatuses": "forecasted|posted", "startRecordNum": 0}
    if s.get("filters", {}).get("tribal_eligibility"):
        body["eligibilities"] = "07|11"
    status, raw = fetch(GRANTS_API, json.dumps(body).encode(), {"Content-Type": "application/json"})
    data = json.loads(raw) if status == 200 else {}
    if data.get("errorcode") != 0:
        raise RuntimeError(f"Grants.gov search2 answered {status}")
    return data["data"]["hitCount"], "Grants.gov search2 API, the request Policy Sentinel sends (eligibilities 07|11)", None


def check_washington(s):
    prefix, number, biennium = s["query"].split()
    chamber = "House Bills" if prefix == "HB" else "Senate Bills"
    url = f"https://lawfilesext.leg.wa.gov/biennium/{biennium}/Htm/Bills/{urllib.parse.quote(chamber)}/{int(number)}.htm"
    status, body = fetch(url)
    how = "Washington Legislature bill file, the address Policy Sentinel reads (bill as introduced)"
    if status == 404:
        return 0, how, None
    if status != 200:
        raise RuntimeError(f"Washington Legislature answered {status}")
    caption = re.search(r"AN ACT Relating to (.{1,200}?);", plain(body), re.I)
    return 1, how, f"Caption: {caption[1]}." if caption else None


def check_agenda(s):
    status, body = fetch(f"https://www.reginfo.gov/public/do/eAgendaViewRule?RIN={s['query']}", headers={"User-Agent": PAGE_UA})
    if status != 200:
        raise RuntimeError(f"reginfo.gov answered {status}")
    found = re.search(r"published in the following Unified Agenda\(s\):(.*?)Reginfo\.gov", plain(body))
    editions = re.findall(r"(?:Spring|Fall) \d{4}|\d{4}", found[1]) if found else []
    return len(editions), "reginfo.gov, the page Policy Sentinel links to from a result with a RIN", \
        ("Editions: " + ", ".join(editions) + ".") if editions else None


CHECKS = {"federal-register": check_fr, "grants": check_grants, "washington": check_washington,
          "unified-agenda": check_agenda}


def page_check(url, count_re=None):
    """HTTP status of an official page, and the count it shows when a pattern is given."""
    if urllib.parse.urlsplit(url).netloc in BLOCKS_SCRIPTS:
        return None, None
    status, body = fetch(url, headers={"User-Agent": PAGE_UA})
    shown = re.search(count_re, plain(body)) if count_re and status == 200 else None
    return status, int(shown[1].replace(",", "")) if shown else None


def live_check(s, today):
    out = {"date": today}
    if s["source"] not in CHECKS:
        out.update(status="unchecked", results=None,
                   how="Keyed source: Policy Sentinel holds the api.data.gov key, so this query was not run here.")
        return out
    try:
        results, how, note = CHECKS[s["source"]](s)
        out.update(status="ok" if results else "empty", results=results, how=how)
    except (RuntimeError, ValueError, KeyError) as error:
        out.update(status="error", results=None, how=str(error))
        note = None
    page, shown = page_check(s["official_url"], r"([\d,]+) Opportunit" if s["source"] == "grants" else None)
    out["official_page"] = page
    if shown is not None and out["results"] not in (None, shown):
        note = ((note + " ") if note else "") + (
            f"The official page lists {shown}; the interface Policy Sentinel calls returns {out['results']}, "
            "because the two match keywords differently.")
    if note:
        out["note"] = note
    return out


# ---- Policy Sentinel records ----------------------------------------------------------------------------------

def clean(value, limit=400):
    return re.sub(r"\s+", " ", value or "").strip()[:limit]


def plain_text_ok(value, limit):
    return (isinstance(value, str) and 0 < len(value) <= limit and value.strip() == value
            and not any(ord(c) < 32 or 127 <= ord(c) <= 159 for c in value))


def cfr_ok(ref):
    part = CFR_PART.fullmatch(ref.get("part") or "")
    return (isinstance(ref.get("title"), int) and 1 <= ref["title"] <= 50 and part is not None
            and (part[2] is None or int(part[1]) < int(part[2])))


def citation(d, retrieved):
    """A Federal Register document as Policy Sentinel's service reports it (search contract 2), summary left out."""
    number, cite = d["document_number"], clean(d.get("citation"), 60)
    names = [clean(a.get("name") or a.get("raw_name"), 120) for a in d.get("agencies") or []]
    rec = {
        "sourceId": "federal-register",
        "identifier": f"{cite} (FR Doc. {number})" if cite else f"FR Doc. {number}",
        "title": clean(d["title"]),
        "issuingBody": "; ".join(n for n in names if n) or "Not stated",
        "kind": clean(d.get("type"), 60) or "Document",
        "date": d["publication_date"][:10],
        "officialUrl": f"https://www.federalregister.gov/d/{number}",
        "textUrl": None,
        "retrievedAt": retrieved,
        "summary": None,
        "textAvailable": FR_DOCUMENT_NUMBER.fullmatch(number) is not None,
        "matchKey": f"fr:{number}" if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]{0,39}", number) else None,
    }
    if "comments_close_on" in d:
        rec["commentsCloseOn"] = d["comments_close_on"]
    if isinstance(d.get("docket_ids"), list):
        rec["docketIds"] = [x for x in d["docket_ids"][:20] if plain_text_ok(x, 120)]
    if isinstance(d.get("regulation_id_numbers"), list):
        rec["rins"] = [x for x in d["regulation_id_numbers"][:20] if RIN.fullmatch(x)]
    if isinstance(d.get("cfr_references"), list):
        rec["cfrRefs"] = [{"title": c["title"], "part": c["part"]} for c in d["cfr_references"][:50] if cfr_ok(c)]
    if isinstance(d.get("topics"), list):
        rec["topics"] = [x for x in d["topics"][:50] if plain_text_ok(x, 200)]
    return rec


def fr_json(path, pairs):
    status, body = fetch(f"{FR_API}/{path}?" + qs(pairs))
    if status != 200:
        raise RuntimeError(f"Federal Register API answered {status} for {path}")
    return json.loads(body)


def newest_record(kind, value):
    """The newest Federal Register document that states this docket or RIN, with a plain document number."""
    pairs = [(f"conditions[{FR_COND[kind]}]", value), ("per_page", "10"), ("page", "1"), ("order", "newest")]
    for d in fr_json("documents.json", pairs + [("fields[]", x) for x in FR_FIELDS])["results"]:
        stated = d.get("docket_ids") if kind == "docket" else d.get("regulation_id_numbers")
        if FR_DOCUMENT_NUMBER.fullmatch(d["document_number"]) and value in (stated or []):
            return d
    raise RuntimeError(f"No Federal Register document states {value}")


def stamp(moment):
    return moment.strftime("%Y-%m-%dT%H:%M:%S.") + f"{moment.microsecond // 1000:03d}Z"


def build_follow(f, today, moment):
    """(follow item, entry for the importable file or None)."""
    out = {k: f[k] for k in ("kind", "source") if k in f}
    entry = None
    if f["source"] == "federal-register" and f["kind"] == "document":
        d = fr_json(f"documents/{f['id']}.json", [("fields[]", x) for x in FR_FIELDS])
        rec = citation(d, stamp(moment))
        out.update(id=f["id"], identifier=rec["identifier"], title=rec["title"], agency=rec["issuingBody"],
                   date=rec["date"], url=rec["officialUrl"])
    elif f["source"] == "federal-register":
        kind, value = f["kind"], f["value"]
        d = newest_record(kind, value)
        rec = citation(d, stamp(moment))
        probe = {"source": "federal-register", "scope": "federal", "query": value, "filters": {"match": kind}}
        out.update(identifier=value, title=f["title"], agency=f["agency"], url=official_url(probe),
                   policy_sentinel_url=policy_sentinel_url(probe))
        if kind == "rin":
            out["unified_agenda_url"] = official_url({"source": "unified-agenda", "query": value})
        out["latest"] = {"document_number": d["document_number"], "date": rec["date"], "title": rec["title"]}
        entry = {"id": f"federal-register#{kind}:{value}", "sourceId": "federal-register", "kind": kind, "value": value,
                 "record": rec, "followedAt": stamp(moment), "lastChecked": None}
    elif f["source"] == "congress":
        kind, number, congress = f["id"].split()
        package = f.get("package") or f"BILLS-{congress}{kind}{number}{'is' if kind[0] == 's' else 'ih'}"
        status, body = fetch(f"https://www.govinfo.gov/content/pkg/{package}/html/{package}.htm")
        if status != 200 or f["title"].lower() not in plain(body).lower():
            raise RuntimeError(f"GovInfo text {package} does not show the title {f['title']!r}")
        label = {"hr": "H.R.", "s": "S."}.get(kind, kind.upper())
        out.update(identifier=f"{label} {int(number)} ({ordinal(int(congress))} Congress)", title=f["title"],
                   url=official_url({"source": "congress", "query": f["id"]}),
                   verified_how=f"GovInfo text of {package}")
    elif f["source"] == "washington":
        probe = {"source": "washington", "query": f["id"]}
        results, how, note = check_washington(probe)
        if not results:
            raise RuntimeError(f"No Washington bill file for {f['id']}")
        prefix, number, biennium = f["id"].split()
        out.update(identifier=f"{prefix} {number} ({biennium})", title=f["title"], url=official_url(probe),
                   verified_how=how + (". " + note if note else ""))
    else:  # confirmed by hand in a browser; the host blocks scripts
        return dict(f), None
    out.update(reason=f["reason"], importable=f["importable"], verified=today)
    return out, entry


# ---- commands --------------------------------------------------------------------------------------------------

def load():
    return json.loads(WATCH.read_text(encoding="utf-8"))


def dump(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")


def build_search(s, today):
    out = {k: s[k] for k in ("id", "title", "why", "source", "scope", "query")}
    if s.get("filters"):
        out["filters"] = s["filters"]
    out["official_url"], out["policy_sentinel_url"] = official_url(out), policy_sentinel_url(out)
    out["checked"] = live_check(out, today)
    return out


def refresh():
    data, moment = load(), datetime.now(timezone.utc)
    today = moment.astimezone().date().isoformat()
    data["generated"] = today
    status, body = fetch(f"{WORKER}/api/sources")
    live = {x["id"]: x["status"] for x in json.loads(body).get("sources", [])} if status == 200 else {}
    for source in data["policy_sentinel"]["sources"]:
        if source["id"] in live:
            source["status"] = live[source["id"]]
    for key, task in data["task_forces"].items():
        task["searches"] = [build_search(s, today) for s in task["searches"]]
        built = [build_follow(f, today, moment) for f in task["follow"]]
        task["follow"] = [item for item, _ in built]
        entries = [entry for _, entry in built if entry]
        task["follow_file"] = f"data/policy-sentinel/follow-{key}.json"
        dump(FOLLOW_DIR / f"follow-{key}.json", {"version": 1, "followed": entries})
        print(f"{key}: {len(task['searches'])} searches, {len(task['follow'])} follow items, {len(entries)} importable")
        for s in task["searches"]:
            c = s["checked"]
            print(f"  {s['id']:24} {c['status']:9} results={c['results']} page={c.get('official_page')}")
    dump(WATCH, data)


def check():
    data, problems = load(), []
    for key, task in data["task_forces"].items():
        if not 8 <= len(task["searches"]) <= 15:
            problems.append(f"{key}: {len(task['searches'])} searches, expected 8 to 15")
        for s in task["searches"]:
            if s["official_url"] != official_url(s) or s["policy_sentinel_url"] != policy_sentinel_url(s):
                problems.append(f"{s['id']}: a link no longer matches its query and filters; run refresh")
        path = ROOT / "site" / task["follow_file"]
        followed = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}
        wanted = [f"federal-register#{f['kind']}:{f['identifier']}" for f in task["follow"] if f.get("importable")]
        if followed.get("version") != 1 or [x["id"] for x in followed.get("followed", [])] != wanted:
            problems.append(f"{key}: {task['follow_file']} does not match the importable follow items; run refresh")
    ids = [s["id"] for t in data["task_forces"].values() for s in t["searches"]]
    problems += [f"duplicate search id {i}" for i in set(ids) if ids.count(i) > 1]
    print("\n".join(problems) or f"ok: {len(ids)} searches")
    sys.exit(1 if problems else 0)


def self_test():
    fr = {"source": "federal-register", "scope": "federal", "query": '"Tribal Energy Resource Agreement"',
          "filters": {"document_type": "NOTICE"}}
    assert official_url(fr) == ("https://www.federalregister.gov/documents/search?conditions%5Bterm%5D="
                                "%22Tribal%20Energy%20Resource%20Agreement%22&conditions%5Btype%5D%5B%5D=NOTICE&order=relevance")
    assert policy_sentinel_url(fr).endswith("&q=%22Tribal%20Energy%20Resource%20Agreement%22&type=NOTICE&run=1")
    docket = {"source": "federal-register", "scope": "federal", "query": "Docket No. RM21-17-000", "filters": {"match": "docket"}}
    assert official_url(docket).endswith("conditions%5Bdocket_id%5D=Docket%20No.%20RM21-17-000&order=newest")
    assert "match=docket" in policy_sentinel_url(docket)
    grants = {"source": "grants", "scope": "federal", "query": "energy", "filters": {"tribal_eligibility": True}}
    assert official_url(grants) == ("https://simpler.grants.gov/search?query=energy&status=forecasted,posted&eligibility="
                                    + GRANTS_ELIGIBLE)
    assert policy_sentinel_url(grants).endswith("&q=energy&tribal=1&run=1")
    govinfo = {"source": "govinfo", "scope": "federal", "query": "collection:BILLS AND (Tribal energy)"}
    assert official_url(govinfo) == ("https://www.govinfo.gov/app/search/%7B%22query%22%3A%22collection%3ABILLS%20AND"
                                     "%20(Tribal%20energy)%22%2C%22offset%22%3A0%7D")
    assert "run=1" not in policy_sentinel_url(govinfo)
    congress = {"source": "congress", "scope": "federal", "query": "s 1181 119"}
    assert official_url(congress) == "https://www.congress.gov/bill/119th-congress/senate-bill/1181"
    assert [ordinal(n) for n in (1, 2, 3, 11, 12, 13, 21, 119)] == ["1st", "2nd", "3rd", "11th", "12th", "13th", "21st", "119th"]
    wa = {"source": "washington", "scope": "state", "query": "HB 2515 2025-26"}
    assert official_url(wa) == "https://app.leg.wa.gov/billsummary?BillNumber=2515&Year=2025&Initiative=false"
    assert "scope=state&source=washington" in policy_sentinel_url(wa)
    agenda = {"source": "unified-agenda", "scope": "federal", "query": "2060-AW84"}
    assert official_url(agenda).endswith("eAgendaViewRule?RIN=2060-AW84")
    assert "match=rin" in policy_sentinel_url(agenda) and "source=federal-register" in policy_sentinel_url(agenda)
    doc = {"document_number": "2026-09524", "title": "Begin  Actual\nConstruction", "type": "Proposed Rule",
           "agencies": [{"name": "Environmental Protection Agency"}], "publication_date": "2026-05-13",
           "citation": "91 FR 26958", "comments_close_on": "2026-06-29", "docket_ids": ["EPA-HQ-OAR-2025-0618"],
           "regulation_id_numbers": ["2060-AW84", "bad"], "cfr_references": [{"title": 40, "part": "49"}, {"title": 99, "part": "1"}],
           "topics": ["Air pollution control"]}
    rec = citation(doc, "2026-10-29T00:00:00.000Z")
    assert rec["identifier"] == "91 FR 26958 (FR Doc. 2026-09524)" and rec["title"] == "Begin Actual Construction"
    assert rec["rins"] == ["2060-AW84"] and rec["cfrRefs"] == [{"title": 40, "part": "49"}] and rec["textAvailable"]
    assert rec["matchKey"] == "fr:2026-09524" and rec["summary"] is None and rec["commentsCloseOn"] == "2026-06-29"
    assert stamp(datetime(2026, 10, 29, 20, 5, 6, 789000, tzinfo=timezone.utc)) == "2026-10-29T20:05:06.789Z"
    print("self-test ok")


if __name__ == "__main__":
    {"refresh": refresh, "check": check, "--self-test": self_test}.get(sys.argv[1] if len(sys.argv) > 1 else "", lambda: sys.exit(__doc__))()
