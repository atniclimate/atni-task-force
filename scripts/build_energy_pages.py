"""Writes the Energy pages' generated regions from their data files, so the page scripts only filter and select and nothing is fetched (DIRECTION-R2 section 4).

Reads   site/data/energy-funding.json, energy-potential.json, policy-watch.json
Writes  between its markers, each region whole:
        energy/funding/index.html            <!-- energy:open -->       open and forecasted programs by how they pay (the agenda's first face)
                                             <!-- energy:tribes -->     the Tribe picker's options and each Tribe's matched programs, as inline JSON
                                             <!-- energy:catalog -->    the catalog: one list, open first and closed last, then each program's detail
                                             <!-- energy:notices -->    the Grants.gov notices kept at the last retrieval
        energy/funding/sources/index.html    <!-- energy:program-sources -->  each program's source pages, under #prog-{id}
        energy/potential/index.html          <!-- energy:grid -->       the Tribe-by-type grid, A to Z
                                             <!-- energy:excerpts -->   each Tribe's findings and the passages behind them
        energy/potential/sources/index.html  <!-- energy:documents -->  the documents read, by Tribe, under #docs-{slug}
        energy/index.html, ai/index.html, data-centers/index.html  <!-- policy:watch -->  that task force's saved searches and follow list

    python scripts/build_energy_pages.py                             # every page
    python scripts/build_energy_pages.py --page energy/index.html    # only these pages (repeatable): a page lane writes its own pages only
    python scripts/build_energy_pages.py --check                     # writes nothing; exit 1 names each stale page

Run it after energy_claims.py and build_plates.py. Every region is data-file content, quoted with its source, so it carries data-from: the page-words test
(tests/test_energy_claims.py) reads a page's own sentences, not these records. Standard library only.
"""
import argparse
from html import escape
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
STATES = {"AK": "Alaska", "CA": "California", "ID": "Idaho", "MT": "Montana", "NV": "Nevada", "OR": "Oregon", "UT": "Utah", "WA": "Washington"}
STAGES = ["Installed or operating", "Planned or funded", "Assessed or sited", "Goal or interest"]  # most advanced first, as the data lists them
SHORT = {"efficiency": "Efficiency", "solar": "Solar", "electrification": "Electrification", "wind": "Wind", "storage": "Battery storage", "microgrid": "Microgrids", "hydropower": "Hydropower",
         "biomass": "Biomass", "geothermal": "Geothermal", "bioenergy-fuels": "Biogas and biofuels", "hydrogen": "Hydrogen", "offshore-wind": "Offshore wind", "marine": "Marine"}
CHECKS = {"verified": "Verified", "needs_review": "Needs review"}
ORDER = ["open", "forecasted", "closed", "terminated", "rescinded", "enjoined", "unknown"]
# How a program pays, from its catalog kind: the agenda's first face groups open programs by these, so the page shows how little is a competitive grant.
PAYS = [("formula", "Formula and non-competitive grants"), ("loan", "Loans"), ("tax", "A tax credit"), ("help", "Technical help at no cost"), ("disaster", "After a declared disaster"),
        ("competitive", "Competitive grants")]
WATCH = {"energy/index.html": "energy-feasibility", "ai/index.html": "ai", "data-centers/index.html": "data-centers"}
KINDS = {"docket": "Docket", "rin": "Regulation Identifier Number", "document": "Federal Register document", "bill": "Bill"}
# Word's Symbol-font bullets and decoding's replacement character are list marks and damage, not words; energy_potential.py drops them where it cuts an excerpt.
STRAY = dict.fromkeys(map(ord, "�"))


def us(iso):
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", str(iso or ""))
    return f"{m[2]}/{m[3]}/{m[1]}" if m else str(iso or "")


def us_dates(text):
    return re.sub(r"(?<![\w/.-])(\d{4})-(\d{2})-(\d{2})(?![\w/-])", r"\2/\3/\1", str(text or ""))


def e(text):
    return verbatim(escape(us_dates(text), quote=True))


def verbatim(html):
    """A dash inside a document's own title or words is the document's: it is written as a character reference, as validate_public.py exempts these
    fields in a data file (VERBATIM_KEYS). Our own sentences never hold one."""
    return html.replace("\u2014", "&#8212;")


def link(url):
    url = str(url or "").strip()
    if not url.startswith("https://"):
        raise SystemExit(f"not an https link: {url!r}")
    return escape(url, quote=True)


def host(url):
    return re.sub(r"^www\.", "", re.sub(r"^https://([^/]+).*$", r"\1", url))


def capital(text):
    return text[:1].upper() + text[1:]


def sentence(text):
    text = us_dates(text).strip()
    return text if re.search(r"[.!?)'\"]$", text) else f"{text}."


def pays(program):
    kind = program["kind"].lower()
    if "tax credit" in kind:
        return "tax"
    if kind.startswith("competitive"):  # its own first word wins: "competitive grant (guaranteed loans also offered)" is a competition
        return "competitive"
    if "technical assistance" in kind:
        return "help"
    if "post-disaster" in kind:
        return "disaster"
    if "loan" in kind:
        return "loan"
    if "formula" in kind or "block grant" in kind or kind.startswith("non-competitive"):
        return "formula"
    return "competitive"


def ordered(programs):
    return sorted(programs, key=lambda p: (ORDER.index(p["status"]) if p["status"] in ORDER else len(ORDER), p["short_name"].lower()))


def status_tag(p):
    hollow = {"open": "", "forecasted": " is-hollow"}.get(p["status"], " is-plain")
    return f'<span class="tag status-{e(p["status"])}{hollow}">{e(capital(p.get("status_label") or p["status"]))}</span>'


def date_html(p):
    iso = (p.get("deadline") or {}).get("date")
    return f'<span class="catalog-date" data-date="{iso}">{us(iso)}</span>' if iso else '<span class="catalog-date">No date</span>'


# Funding

def open_face(data):
    """Open and forecasted programs by how they pay; each name goes to its detail in the catalog."""
    live = [p for p in ordered(data["programs"]) if p["status"] in ("open", "forecasted")]
    groups = []
    for key, words in PAYS:
        members = [p for p in live if pays(p) == key]
        if not members:
            continue
        items = "".join(f'<li><a href="#prog-{e(p["id"])}">{e(p["short_name"])}</a>{" " + status_tag(p) if p["status"] != "open" else ""}{" " + date_html(p) if (p.get("deadline") or {}).get("date") else ""}</li>'
                        for p in members)
        groups.append(f'<li class="pays" data-pays="{key}"><h3 class="pays-name">{escape(words)}</h3><ul class="pays-list">{items}</ul></li>')
    return f'<ul class="pays-groups" data-from="energy-funding.json">{"".join(groups)}</ul>'


def program_html(p, types, cooling):
    named = ", ".join(types.get(t, t) for t in p["energy_types"])
    possible = ", ".join(types.get(t, t) for t in p["energy_types_possible"])
    facts = [("How it pays", p["kind"]), ("Tribal eligibility", p.get("tribal_eligibility")), ("Funding level", p.get("funding_level")), ("Where it applies", p.get("geography")),
             ("Assistance listing", p.get("assistance_listing")), ("Energy types named", named), ("May fit; confirm with the agency", possible)]
    dl = "".join(f"<div><dt>{escape(k)}</dt><dd>{e(v)}</dd></div>" for k, v in facts if v)
    heat = "".join(f'<li><strong>{e(cooling.get(c["use"], c["use"]))}:</strong> {"named by a program document" if c["applicability"] == "applicable" else "may fit; confirm with the agency"}. {e(sentence(c["sentence"]))}</li>'
                   for c in p.get("cooling_uses") or [])
    notes = "".join(f'<p class="record-note">{e(sentence(n))}</p>' for n in (p.get("energy_type_note"), p.get("assistance_listing_note") and f"Assistance listing: {p['assistance_listing_note']}") if n)
    deadline = p.get("deadline") or {}
    due = (f'<p class="program-due" data-date="{deadline["date"]}"><strong>Deadline {us(deadline["date"])}:</strong> {e(sentence(deadline["what"]))}</p>' if deadline.get("date") else "")
    checked = p["status_checked"]
    return (f'<article class="program" id="prog-{e(p["id"])}" data-status="{e(p["status"])}" aria-labelledby="prog-{e(p["id"])}-name">'
            f'<p class="record-kicker">{e(p["agency"])}</p><h3 id="prog-{e(p["id"])}-name"><a href="{link(p["url"])}">{e(p["short_name"])}</a></h3>'
            + (f'<p class="record-meta">{e(p["name"])}</p>' if p["name"] != p["short_name"] else "")
            + f'<p class="status-line">{status_tag(p)} <span>Status checked {us(checked["date"])} on <a href="{link(checked["url"])}">{e(host(checked["url"]))}</a></span></p>{due}'
            f'<p>{e(sentence(p["status_note"]))}</p><dl class="facts">{dl}</dl>'
            f'<h4>What the program pays for</h4><ul>{"".join(f"<li>{e(f)}</li>" for f in p["funds"])}</ul>'
            + (f"<h4>Cooling in extreme heat</h4><ul>{heat}</ul>" if heat else "") + notes
            + f'<p class="record-links"><a href="sources/#prog-{e(p["id"])}">This program&#x27;s sources</a></p></article>')


def catalog(data):
    types = {t["id"]: t["label"] for t in data["vocabulary"]["energy_types"]}
    cooling = {c["id"]: c["label"] for c in data["vocabulary"]["cooling_uses"]}
    programs = ordered(data["programs"])
    items = []
    for p in programs:
        attrs = {"program": p["id"], "status": p["status"], "types": " ".join(p["energy_types"]), "possible": " ".join(p["energy_types_possible"]),
                 "cooling": " ".join(c["use"] for c in p.get("cooling_uses") or [])}
        data_attrs = "".join(f' data-{k}="{e(v)}"' for k, v in attrs.items())
        items.append(f'<li class="catalog-item{" is-closed" if p["status"] not in ("open", "forecasted") else ""}"{data_attrs}><a class="catalog-pick" href="#prog-{e(p["id"])}">'
                     f'<span class="catalog-name">{e(p["short_name"])}</span> <span class="catalog-pays">{escape(dict(PAYS)[pays(p)])}</span> {date_html(p)} {status_tag(p)}</a></li>')
    details = "".join(program_html(p, types, cooling) for p in programs)
    return (f'<div class="catalog" data-from="energy-funding.json"><ol class="catalog-list" id="catalog-list" aria-label="Programs, open first and closed last">{"".join(items)}</ol>'
            f'<div class="catalog-details">{details}</div></div>')


def filter_options(data):
    """The catalog's filter choices with their counts, so the selects are whole before any script runs."""
    programs = data["programs"]
    fits = lambda p, t: t in p["energy_types"] or t in p["energy_types_possible"]  # noqa: E731
    type_opts = [(t["id"], t["label"], sum(1 for p in programs if fits(p, t["id"]))) for t in data["vocabulary"]["energy_types"]]
    cool_opts = [(c["id"], c["label"], sum(1 for p in programs if any(u["use"] == c["id"] for u in p.get("cooling_uses") or []))) for c in data["vocabulary"]["cooling_uses"]]
    status_opts = [(s, capital(s), sum(1 for p in programs if p["status"] == s)) for s in data["vocabulary"]["statuses"]]
    option = lambda rows: "".join(f'<option value="{e(v)}">{e(label)} ({n})</option>' for v, label, n in rows if n)  # noqa: E731
    return option(type_opts), option(cool_opts), option(status_opts)


def tribes_region(data):
    """The Tribe picker: its options, then each Tribe's ranked types and the programs that name or may fit each, as ids into the catalog."""
    tribes = sorted(data["tribes"], key=lambda t: t["name"].lower())
    options = "".join(f'<option value="{e(t["slug"])}">{e(t["name"])}</option>' for t in tribes)
    table = {t["slug"]: {"name": t["name"], "types": [[m["energy_type"], m["stage_label"], m["potential_status"], m["programs"], m["programs_possible"]] for m in t["matches"]]} for t in tribes}
    body = json.dumps(table, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    return (f'<select id="pick-tribe" name="tribe"><option value="">Choose a Tribe</option>{options}</select>\n'
            f'<script type="application/json" id="tribe-matches">{body}</script>')


def notices(data):
    live = data["live"]
    programs = {p["id"]: p for p in data["programs"]}
    money = lambda n: f"${n:,}" if isinstance(n, (int, float)) else None  # noqa: E731
    items = []
    for o in live["opportunities"]:
        f = o.get("funding") or {}
        facts = [("Status", f'{capital(o["status"])}. {f"Closes {us(o["close_date"])}." if o.get("close_date") else sentence(o.get("close_note") or "")}'), ("Posted", us(o.get("posted_date"))),
                 ("Estimated total", money(f.get("estimated_total"))), ("Award range", f"{money(f['award_floor'])} to {money(f['award_ceiling'])}" if f.get("award_floor") and f.get("award_ceiling") else None),
                 ("Expected awards", f.get("expected_awards"))]
        dl = "".join(f"<div><dt>{escape(k)}</dt><dd>{e(v)}</dd></div>" for k, v in facts if v or v == 0)
        linked = ", ".join(f'<a href="#prog-{e(i)}">{e(programs[i]["short_name"])}</a>' for i in o.get("program_ids") or [] if i in programs)
        items.append(f'<li class="record"><p class="record-kicker">{e(o["agency"])}, {e(o["number"])}</p><h3><a href="{link(o["url"])}">{e(o["title"])}</a></h3><dl class="facts">{dl}</dl>'
                     + (f"<p>In the catalog: {linked}.</p>" if linked else "") + "</li>")
    if not items:
        items.append('<li class="record"><p>No posted or forecasted notice matched at this retrieval.</p></li>')
    return f'<ul class="records notice-list" role="list" data-from="energy-funding.json">{"".join(items)}</ul>'


def program_sources(data):
    rows = []
    for p in ordered(data["programs"]):
        links = "".join(f'<li><a href="{link(s)}">{e(host(s))}</a></li>' for s in p["sources"])
        rows.append(f'<section class="program-sources" id="prog-{e(p["id"])}" aria-labelledby="prog-{e(p["id"])}-src"><h3 id="prog-{e(p["id"])}-src">{e(p["short_name"])}</h3>'
                    f'<p class="caption">{e(p["agency"])}. Status checked {us(p["status_checked"]["date"])}.</p><ul class="doc-list">{links}</ul></section>')
    return f'<div class="program-source-list" data-from="energy-funding.json">{"".join(rows)}</div>'


# Potential

def columns(potential):
    """The grid's columns in the stage bars' order, most named first, so each bar totals the column under its name."""
    count = {t["id"]: sum(1 for x in potential["tribes"] for f in x["top"] if f["type"] == t["id"]) for t in potential["method"]["energy_types"]}
    order = {t["id"]: i for i, t in enumerate(potential["method"]["energy_types"])}
    return sorted(potential["method"]["energy_types"], key=lambda t: (-count[t["id"]], order[t["id"]]))


def states_of(tribe):
    return ", ".join(STATES.get(s, s) for s in tribe["states"]) or "State not recorded"


def grid(potential):
    cols = columns(potential)
    head = "".join(f'<th scope="col" data-type="{e(t["id"])}"><span>{e(SHORT[t["id"]])}</span></th>' for t in cols)
    body = []
    for t in sorted(potential["tribes"], key=lambda x: x["name"].lower()):
        found = {f["type"]: f for f in t["top"]}
        cells = []
        for c in cols:
            f = found.get(c["id"])
            if f:
                level = len(STAGES) - STAGES.index(f["stage_label"])  # 4 installed or operating, down to 1 goal or interest
                cells.append(f'<td data-tt="{e(t["slug"])}--{e(c["id"])}" data-stage="{level}" data-check="{e(f["status"])}"><span class="tt-mark" aria-hidden="true"></span>'
                             f'<span class="sr-only">{e(f["stage_label"])}</span></td>')
            else:
                cells.append(f'<td data-tt="{e(t["slug"])}--{e(c["id"])}"><span class="sr-only">No finding</span></td>')
        body.append(f'<tr data-tribe="{e(t["slug"])}" data-states="{e(" ".join(t["states"]))}"><th scope="row"><a href="#{e(t["slug"])}">{e(t["name"])}</a> '
                    f'<span class="tt-state">{e(" ".join(t["states"]))}</span></th>{"".join(cells)}</tr>')
    return (f'<table class="tt-grid" id="tt-grid" data-from="energy-potential.json"><caption>Each Tribe&#x27;s energy types by the most advanced stage its public plans show, A to Z. '
            f'A taller mark is a later stage; an empty cell is no finding, which is not evidence of opposition or disinterest.</caption>'
            f'<thead><tr><td class="tt-corner"></td>{head}</tr></thead><tbody>{"".join(body)}</tbody></table>')


def quote(text):
    """An excerpt is a verbatim cut of page text: whitespace collapses for reading, and an ellipsis marks a cut inside a sentence (energy-potential.js did this before)."""
    t = " ".join(str(text).translate(STRAY).split())
    return f'{"" if re.match(r"[A-Z0-9\"(“•]", t) else "…"}{t}{"" if re.search(r"[.!?:;)\"”]$", t) else "…"}'


def excerpts(potential):
    cols = {t["id"]: t["label"] for t in potential["method"]["energy_types"]}
    parts = []
    for t in sorted(potential["tribes"], key=lambda x: x["name"].lower()):
        pending = f"; {t['documents_pending_extraction']} more {'awaits' if t['documents_pending_extraction'] == 1 else 'await'} text extraction" if t["documents_pending_extraction"] else ""
        meta = f'{states_of(t)}. {t["documents_examined"]} {"document" if t["documents_examined"] == 1 else "documents"} read{pending}.'
        findings = []
        for f in t["top"]:
            cites = "".join(f'<figure class="citation"><blockquote cite="{link(c["url"])}"><p>{verbatim(escape(quote(c["excerpt"])))}</p></blockquote>'
                            f'<figcaption><a href="{link(c["url"])}">{e(c["title"])}</a>{f", {c["year"]}" if c.get("year") else ""}, page {c["page"]}</figcaption></figure>' for c in f["citations"])
            findings.append(f'<div class="tt-finding" id="{e(t["slug"])}--{e(f["type"])}" data-type="{e(f["type"])}"><h4>{e(cols.get(f["type"], f["label"]))}: {e(f["stage_label"].lower())}'
                            f' <span class="tt-check">{CHECKS.get(f["status"], f["status"])}</span></h4>{cites}</div>')
        body = "".join(findings) if findings else f'<p class="record-note"><strong>No energy type found.</strong> {e(t.get("note") or "")}</p>'
        if findings and t.get("note"):
            body += f'<p class="record-note">{e(t["note"])}</p>'
        links = [f'<a href="sources/#docs-{e(t["slug"])}">Documents read</a>'] if t["documents"] else []
        if t["top"]:
            links.append(f'<a href="../funding/#face-fit&amp;tribe={e(t["slug"])}">Programs that name these types</a>')
        parts.append(f'<section class="tt-tribe" id="{e(t["slug"])}" aria-labelledby="{e(t["slug"])}-name"><h3 id="{e(t["slug"])}-name">{e(t["name"])}</h3><p class="record-meta">{e(meta)}</p>'
                     f'{body}<p class="record-links">{" ".join(links)}</p></section>')
    return f'<div class="tt-evidence" id="tt-evidence" data-from="energy-potential.json">{"".join(parts)}</div>'


def documents(potential):
    parts = []
    for t in sorted(potential["tribes"], key=lambda x: x["name"].lower()):
        if not t["documents"]:
            continue
        items = "".join(f'<li><a href="{link(d["url"])}">{e(d["title"])}</a>{f" ({d["year"]})" if d.get("year") else ""}</li>' for d in t["documents"])
        parts.append(f'<section class="docs-tribe" id="docs-{e(t["slug"])}" aria-labelledby="docs-{e(t["slug"])}-name"><h3 id="docs-{e(t["slug"])}-name">{e(t["name"])}</h3><ul class="doc-list">{items}</ul></section>')
    return f'<div class="docs-by-tribe" data-from="energy-potential.json">{"".join(parts)}</div>'


# Policy Watch, on the three task force pages

def checked(c, source):
    if not c:
        return ""
    note = f' {c["note"]}' if c.get("note") else ""
    results = c.get("results") or 0
    if c["status"] == "ok":
        return f'Checked {us(c["date"])}: {results:,} {"result" if results == 1 else "results"}.{note}'
    if c["status"] == "empty":
        return f'Checked {us(c["date"])}: no results yet.{note}'
    if c["status"] == "unchecked":
        return f"Not counted automatically, because {source} needs a key; open the search to see current results.{note}"
    return f'The check on {us(c["date"])} did not finish; open the search to see current results.{note}'


def watch(policy, force_id):
    force = policy["task_forces"][force_id]
    sources = {s["id"]: s["label"] for s in policy["policy_sentinel"]["sources"]}
    searches = []
    for s in force["searches"]:
        source = sources.get(s["source"], s["source"])
        searches.append(f'<li class="record watch-item"><h4>{e(s["title"])}</h4><p>{e(s["why"])}</p><p class="record-meta">{e(source)}. Search: <span class="query">{e(s["query"])}</span></p>'
                        f'<p class="record-note">{e(checked(s.get("checked"), source))}</p><p class="watch-links"><a href="{link(s["official_url"])}">Search {e(source)}</a> '
                        f'<a href="{link(s["policy_sentinel_url"])}">Open in Policy Sentinel</a></p></li>')
    follow = []
    for f in force["follow"]:
        latest = f'<p class="record-note">Latest: {e(f["latest"]["title"])}, {us(f["latest"]["date"])}.</p>' if f.get("latest") else ""
        agency = f', {f["agency"]}' if f.get("agency") else ""
        follow.append(f'<li class="record watch-item"><h4><a href="{link(f["url"])}">{e(f["title"])}</a></h4><p class="record-meta">{e(KINDS.get(f["kind"], f["kind"]))}: '
                      f'{e(f.get("identifier") or f.get("value") or f.get("id"))}{e(agency)}{". In the importable list" if f.get("importable") else ""}</p><p>{e(f["reason"])}</p>{latest}</li>')
    return (f'<h3>Saved Searches</h3>\n<div data-policy-searches data-from="policy-watch.json"><ul class="records watch-list" role="list">{"".join(searches)}</ul></div>\n'
            f'<h3>Follow List</h3>\n<div data-policy-follow data-from="policy-watch.json"><ul class="records watch-list" role="list">{"".join(follow)}</ul></div>')


# Pages

def regions(funding, potential, policy):
    o_type, o_cool, o_status = filter_options(funding)
    out = {
        "energy/funding/index.html": {"energy:open": open_face(funding), "energy:tribes": tribes_region(funding), "energy:catalog": catalog(funding), "energy:notices": notices(funding),
                                      "energy:filter-type": o_type, "energy:filter-cooling": o_cool, "energy:filter-status": o_status},
        "energy/funding/sources/index.html": {"energy:program-sources": program_sources(funding)},
        "energy/potential/index.html": {"energy:grid": grid(potential), "energy:excerpts": excerpts(potential)},
        "energy/potential/sources/index.html": {"energy:documents": documents(potential)},
    }
    for page, force in WATCH.items():
        out.setdefault(page, {})["policy:watch"] = watch(policy, force)
    return out


def pour(text, name, block, page):
    start, end = f"<!-- {name} -->", f"<!-- /{name} -->"
    if text.count(start) != 1 or text.count(end) != 1 or text.index(end) < text.index(start):
        raise SystemExit(f"{page} must hold one {start} and one {end}, in that order")
    return f"{text[:text.index(start) + len(start)]}\n{block}\n{text[text.index(end):]}"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--page", action="append", help="a page under site/ to write; repeatable (default: every page)")
    parser.add_argument("--check", action="store_true", help="write nothing; exit 1 naming each stale page")
    args = parser.parse_args(argv)
    read = lambda name: json.loads((SITE / "data" / name).read_text(encoding="utf-8"))  # noqa: E731
    funding, potential, policy = read("energy-funding.json"), read("energy-potential.json"), read("policy-watch.json")
    if "heat" in funding:
        raise SystemExit("energy-funding.json holds a heat section, which stays T1. Remove it; never run energy_funding.py with --include-heat.")
    built = regions(funding, potential, policy)
    pages = args.page or sorted(built)
    unknown = [p for p in pages if p not in built]
    if unknown:
        raise SystemExit(f"no regions for {unknown}; the pages are {sorted(built)}")
    stale = []
    for page in pages:
        path = SITE / page
        text = path.read_text(encoding="utf-8")
        new = text
        for name, block in built[page].items():
            new = pour(new, name, block, page)
        if new != text:
            stale.append(page)
            if not args.check:
                path.write_text(new, encoding="utf-8", newline="\n")
    print(json.dumps({"stale" if args.check else "written": stale}))
    return 1 if args.check and stale else 0


if __name__ == "__main__":
    sys.exit(main())
