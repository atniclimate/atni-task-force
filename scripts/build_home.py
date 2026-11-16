#!/usr/bin/env python3
"""Fills the home page's generated blocks, so it loads no model and no data file: the first screen's ladder and its receipts, the Explorer's model at its
default settings (the page's own code, through scripts/explorer_static.js), the figure limits, and the figures its own words name in <span data-m> and
data-figure. Moved here from scripts/build_explorer.py (DIRECTION-R2 section 5); the home lane's faces, build-time copies of the task force pages' plates
marked data-copy-of, join it. Re-running changes nothing. Run after build_plates.py and build_explorer.py, and before build_index.py and pour_claim_refs.py:
   python scripts/build_home.py          # write
   python scripts/build_home.py --check  # write nothing; exit 1 if site/index.html is out of date
"""
from html import escape
import json
from math import ceil, floor, log10
from pathlib import Path
import re
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_explorer as be  # noqa: E402
from build_explorer import MARKER, POUR, BuildError, bp, claim_words, vp  # noqa: E402

HOME = vp.SITE / "index.html"

# The home page: the first screen's ladder and its receipts, the Explorer's model at its default settings, poured so the home page loads none of it. --------
HOME_ROWS = (("chat_hour", "Chat, {prompts} prompts", "An hour of chat"), ("video_hour", "Streaming video", "An hour of streaming video"), ("short_hour", "Short video", "An hour of short video"), ("coding_hour", "Agentic coding", "An hour of agentic coding"))
HOME_STOPS = {"dc": ("Data center only", "inside the data center alone"), "adds": ("Plus network", "the data center plus the network"), "whole": ("Whole hour", "the whole chain from the data center to your screen")}
HOME_DEFAULT = "whole"


def home_label(data, label):
    return label.format(prompts=data["sel"]["prompts_per_hour"]["def"])


def home_stop(stop, st, data):
    """One boundary of the ladder: a ruler in whole decades around what it counts, each row's place and words, and the ground a selected row shares, by the kit's rules (fitRuler and sharedOf in plate.js)."""
    band = st["band"]
    keys = [key for key, _, _ in HOME_ROWS]
    cells = {key: band[key]["stops"][stop] for key in keys}
    ends = [v for f in cells.values() for v in (f["value"], f["lo"], f["hi"])]
    low = floor(log10(min(ends)))
    high = max(low + 1, ceil(log10(max(ends))))
    at = lambda v: round((log10(v) - low) / (high - low), 4)
    say = lambda name: data["sel"][name]["say"][data["sel"][name]["def"]]
    rows = {}
    for i, (key, _, lead) in enumerate(HOME_ROWS):
        f = cells[key]
        if f["unit"] != "Wh":
            raise BuildError(f"the home ladder says watt-hours, and {key} at {stop} now reads {f['unit']}: rewrite its sentence")
        tail = f', and {band[key]["screen"]} of them go to your own screen and router.' if stop == "whole" else "; your own screen and router are not counted here."
        ground, words, hits = [f["lo"], f["hi"]], [f["lo_text"], f["hi_text"]], [i]
        for j, other in enumerate(keys):  # in row order, a row that would empty the ground is left out of it
            g = cells[other]
            if other != key and max(ground[0], g["lo"]) <= min(ground[1], g["hi"]):
                if g["lo"] > ground[0]:
                    ground[0], words[0] = g["lo"], g["lo_text"]
                if g["hi"] < ground[1]:
                    ground[1], words[1] = g["hi"], g["hi_text"]
                hits.append(j)
        shared = {"lo": at(ground[0]), "hi": at(ground[1]), "from": min(hits), "to": max(hits), "say": f"Shared ground, {words[0]} to {words[1]} Wh", "flip": at(f["value"]) >= at(ground[1]) or at(ground[0]) > 0.6} if len(hits) > 1 else None
        rows[key] = {"x": at(f["value"]), "lo": at(f["lo"]), "hi": at(f["hi"]), "num": f["num"], "tag": f["tag"], "shared": shared,
                     "reading": f'{lead} on a {say("device").lower()} over {say("connection")}, {HOME_STOPS[stop][1]}: about {f["num"]} watt-hours {f["tag"]}{tail}'}
    return {"ticks": [[at(10.0 ** k), f"{10.0 ** k:,g}"] for k in range(low, high + 1)], "fixed": at(band[keys[0]]["fixed"]) if stop == "whole" else None, "rows": rows}


def band_html(pub, data, st):
    """The instrument: the poster at the first row, the Reading, and the ladder at the whole hour, with every boundary in one small block for explorer-band.js. The figure is energy."""
    band = st["band"]
    stops = {stop: home_stop(stop, st, data) for stop in HOME_STOPS}
    whole = stops[HOME_DEFAULT]
    first_key, first_label, _ = HOME_ROWS[0]
    first = whole["rows"][first_key]
    fixed = {band[key]["fixed"] for key, _, _ in HOME_ROWS}
    if len(fixed) != 1:
        raise BuildError(f"the home ladder draws one line for the screen and router, and the rows now differ: {sorted(fixed)}")
    built = pub["built"]
    rows = "".join(
        f'<label class="ladder-row{" is-on" if key == first_key else ""}" data-row="{key}" style="--x:{whole["rows"][key]["x"]};--lo:{whole["rows"][key]["lo"]};--hi:{whole["rows"][key]["hi"]}">'
        f'<input type="radio" name="home-row" value="{key}"{" checked" if key == first_key else ""} hidden><span class="ladder-label">{escape(home_label(data, label))}</span>'
        f'<span class="ladder-track"><span class="ladder-range"></span><span class="ladder-mark is-hollow"></span></span>'
        f'<span class="ladder-value"><span class="ladder-num">{escape(whole["rows"][key]["num"])}</span> <span class="ladder-tag">{escape(whole["rows"][key]["tag"])}</span> <span class="ladder-unit">Wh</span></span></label>'
        for key, label, _ in HOME_ROWS)
    ticks = "".join(f'<i style="--x:{x}"></i>' for x, _ in whole["ticks"])
    axis = "".join(f'<span style="--x:{x}">{escape(words)}</span>' for x, words in whole["ticks"])
    return (f'<div class="home-read"><h2 id="instrument-title">The same hour on the same phone</h2>'
            f'<div class="home-figure"><p class="readout"><span class="readout-value">{escape(first["num"])}</span> <span class="readout-unit">Wh</span></p>'
            f'<p class="reading">{escape(first["reading"])}</p><p class="home-modeled">Modeled, {built[5:7]}/{built[:4]}</p></div><p class="sr-only" role="status" data-band-status></p></div>'
            f'<div class="home-plot"><fieldset class="ladder" data-form="square" style="--at:{first["x"]}"><legend class="sr-only">One hour of</legend>'
            f'<div class="ladder-grid" aria-hidden="true">{ticks}<span class="ladder-shared" hidden><span class="ladder-shared-label"></span></span>'
            f'<i class="ladder-tick is-right" style="--x:{whole["fixed"]}"><span>Screen and router, {escape(band[first_key]["screen"])} Wh</span></i>'
            f'<i class="ladder-needle"><span class="needle-label">{escape(home_label(data, first_label))}</span></i></div>'
            f'<div class="ladder-rows">{rows}</div><div class="ladder-axis" aria-hidden="true">{axis}</div></fieldset>'
            f'<p class="caption home-ruler">Watt-hours for one hour. Each mark is ten times the last. A band is a spread, not a confidence interval.</p></div>'
            f'<script type="application/json" id="home-ladder">{bp.inline_json({"schema": 1, "tier": "T0", "stops": stops})}</script>')


def plate_rows(rel, plate):
    """A plate's rows as its built page carries them, so a figure poured here is the figure the plate prints at its defaults."""
    found = re.search(rf'<script type="application/json" id="plate-data-{plate}">(.*?)</script>', (vp.SITE / rel).read_text(encoding="utf-8"), re.S)
    if not found:
        raise BuildError(f"site/{rel} has no plate {plate}: build it first with scripts/build_plates.py")
    return {r["key"]: r for r in json.loads(found[1])["rows"]}


def home_words(claims, limits, st):
    """The figures the home page's own words name, each poured into a <span data-m>. A sentence that stops being true stops the build."""
    chat, video = st["band"]["chat_hour"]["stops"]["whole"], st["band"]["video_hour"]["stops"]["whole"]
    if max(chat["lo"], video["lo"]) > min(chat["hi"], video["hi"]):
        raise BuildError("the home question says an hour of chat and an hour of video overlap, and they no longer do: rewrite its answer")
    project = plate_rows("data-centers/index.html", "dc-project")
    controls = {c["name"]: c for c in json.loads((vp.SITE / "data" / "plates" / "dc-project.json").read_text(encoding="utf-8"))["controls"]}
    load = claims["dem-073"]
    if load["year"] != 2030:
        raise BuildError(f"the home figure says 2030 and dem-073 now reads {load['year']}: rewrite it")
    return {"q:chat": chat["num"], "q:video": video["num"], "q:mw": f'{controls["p_mw"]["default"]:g}', "q:lf": f'{controls["p_lf"]["default"]:g}', "q:twh": project["twh"]["text"], "q:share": project["share"]["text"],
            "fig:value": f'{load["value"]:,g}', "fig:low": f'{load["low"]:,g}', "fig:high": f'{load["high"]:,g}'}


HOME_FIGURE_CLAIMS = {"ep-002": "data/energy-potential.json", "ep-001": "data/energy-potential.json", "ef-001": "data/energy-funding.json", "ef-002": "data/energy-funding.json", "lc-051": "data/policy-watch.json", "lc-052": "data/policy-watch.json", "lc-001": "data/library.json", "lc-002": "data/library.json", "dem-073": "data-centers/sources/#dc-pnw-load-source-dem-073"}


def figure_limits_html(claims, limits):
    """Each figure's claim, what it counts, its status, and its limit. The counts a script writes must be the claims' or the build stops."""
    figures = home_figures()
    for claim_id, name in (("ep-002", "fund-tribes"), ("ep-001", "fund-tribes-with"), ("ef-001", "fund-programs"), ("ef-002", "fund-open"), ("lc-051", "policy-follow"), ("lc-052", "policy-searches"), ("lc-001", "library"), ("lc-002", "library-tribal")):
        if f'{claims[claim_id]["value"]:,g}' != figures[name]:
            raise BuildError(f"the home figure {name} reads {figures[name]} and {claim_id} reads {claims[claim_id]['value']}: rebuild the claims, or rewrite the figure")
    return "".join(f'<p class="caption">{claim_words([claim_id], claims, limits, lambda i: f"""<a href="{HOME_FIGURE_CLAIMS[i]}">{i}</a>""")} Published by {escape(claims[claim_id]["source"]["publisher"])}.</p>' for claim_id in HOME_FIGURE_CLAIMS)


def home_figures():
    """What the data files say, so the page without scripts says it too. library.js, energy-funding.js, and policy-watch.js write the same figures when they run."""
    read = lambda name: json.loads((vp.SITE / "data" / name).read_text(encoding="utf-8"))
    library, funding, policy = read("library.json"), read("energy-funding.json"), read("policy-watch.json")
    day = lambda iso: f"{iso[5:7]}/{iso[8:10]}/{iso[:4]}"
    forces = policy["task_forces"].values()
    return {"library": f'{len(library["entries"]):,}', "library-tribal": str(sum(1 for e in library["entries"] if e.get("tribal_specific"))), "library-date": day(library["updated"]),
            "fund-programs": str(len(funding["programs"])), "fund-open": str(sum(1 for p in funding["programs"] if p["status"] == "open")), "fund-date": day(funding["source"]["programs_status_as_of"]),
            "fund-tribes": str(len(funding["tribes"])), "fund-tribes-with": str(sum(1 for t in funding["tribes"] if t["matches"])),
            "policy-follow": str(sum(len(t["follow"]) for t in forces)), "policy-searches": str(sum(len(t["searches"]) for t in forces)), "policy-date": day(policy["generated"])}


def receipts_html(pub, data, st, claims, limits, words):
    """Every figure on the instrument at every boundary, with its claims, their status, and their limits; then the project question's. It opens on interaction, and shows without scripts and in print."""
    catalog = {r["key"]: r for r in pub["catalog"]}
    link = lambda claim_id: f'<a href="explorer/sources/#src-{claim_id}">{claim_id}</a>'
    head = "".join(f'<th scope="col">{escape(words_)}</th>' for words_ in ("One hour of", *(f"{HOME_STOPS[stop][0]}, Wh" for stop in HOME_STOPS), "Claims, status, and limits"))
    body = []
    for key, label, _ in HOME_ROWS:
        ids = [claim_id for claim_id in catalog[f"catalog.{key}"]["claims"] if not claim_id.startswith("px-")]  # the figure is energy, so it carries the energy claims
        cells = "".join(f'<td>{escape(st["band"][key]["stops"][stop]["num"])} <span class="nowrap">{escape(st["band"][key]["stops"][stop]["tag"])}</span></td>' for stop in HOME_STOPS)
        body.append(f'<tr data-stop="{key}"><th scope="row">{escape(home_label(data, label))}</th>{cells}<td class="home-claims">{claim_words(ids, claims, limits, link)}</td></tr>')
    built = pub["built"]
    project = plate_rows("data-centers/index.html", "dc-project")
    region = claims["dem-058"]
    project_claim = claim_words(["dem-058"], claims, limits, lambda claim_id: f'<a href="data-centers/sources/#dc-project-source-{claim_id}">{claim_id}</a>')
    return (f'<div class="table-scroll" tabindex="0" role="region" aria-label="Table of values and receipts"><table class="data-table"><caption>Every figure on this ladder, at each boundary. Modeled, {built[5:7]}/{built[:4]}.</caption>'
            f'<thead><tr>{head}</tr></thead><tbody>{"".join(body)}</tbody></table></div>'
            f'<p class="caption">Modeled estimates, not measurements, at the Explorer\'s default settings: an open-book model, checked against published figures. A range is a spread, not a confidence interval.</p>'
            f'<p class="caption">The project question, at example settings a reader can change: {escape(words["q:mw"])} MW at a load factor of {escape(words["q:lf"])} is {escape(project["amw"]["text"])} average megawatts, about {escape(words["q:twh"])} TWh a year, {escape(words["q:share"])} percent of the region\'s {region["value"]:,g} aMW. {project_claim} Published by {escape(region["source"]["publisher"])}.</p>'
            f'<p class="caption">Sources with their quotes: <a href="ai/sources/#ai-same-hour">chat and video on the AI page</a>, and <a href="explorer/sources/">every row in the Explorer</a>. The Resource Use Explorer runs the energy, carbon, water, and price of AI, video, search, and cloud software at settings you choose. Nothing you enter leaves your browser.</p>')


def pour_home(pub, data, st, claims, limits, home=None):
    """The home page with its three blocks and the figures in its own words filled, and the band's size."""
    home = HOME.read_text(encoding="utf-8") if home is None else home
    words = home_words(claims, limits, st)
    poured = {"home:band": band_html(pub, data, st), "home:receipts": receipts_html(pub, data, st, claims, limits, words), "home:figure-limits": figure_limits_html(claims, limits)}
    missing = [name for name in poured if f"<!-- explorer:{name} -->" not in home]
    if missing:
        raise BuildError(f"site/index.html lacks the markers {missing}")
    filled = MARKER.sub(lambda m: f"{m[1]}{poured[m['name']]}{m[4]}" if m["name"] in poured else m[0], home)
    unknown = sorted(m["spec"] for m in POUR.finditer(filled) if m["spec"] not in words)
    if unknown:
        raise BuildError(f"site/index.html pours figures the build does not know: {unknown}")
    filled = POUR.sub(lambda m: f'<span data-m="{m["spec"]}">{escape(words[m["spec"]])}</span>', filled)
    figures = home_figures()
    named = set(re.findall(r'data-figure="([^"]+)"', filled))
    if named - set(figures):
        raise BuildError(f"site/index.html names figures the build does not know: {sorted(named - set(figures))}")
    filled = re.sub(r'(data-figure="([^"]+)">)[^<]*<', lambda m: f"{m[1]}{figures[m[2]]}<", filled)
    return filled, len(poured["home:band"].encode("utf-8"))


def run(check=False):
    """Writes site/index.html when it is out of date, and returns whether it was. The model's words come from the Explorer's own code at its defaults."""
    pub = json.loads(be.MODEL.read_text(encoding="utf-8"))
    claims = bp.load_claims(vp.SITE)
    limits = {**json.loads(be.LIMITS.read_text(encoding="utf-8"))["limits"], **pub["limits"]}
    data = be.inline_data(pub)
    old = HOME.read_text(encoding="utf-8")
    new, band_bytes = pour_home(pub, data, be.run_static(data, set()), claims, limits, old)
    if new != old and not check:
        HOME.write_bytes(new.encode("utf-8"))
    return {"out_of_date" if check else "written": new != old, "home_band_bytes": band_bytes}


def main():
    checking = "--check" in sys.argv
    try:
        result = run(check=checking)
    except BuildError as error:
        sys.exit(f"build_home: {error}")
    print(json.dumps(result))
    if checking and result["out_of_date"]:
        sys.exit("build_home: run python scripts/build_home.py")


if __name__ == "__main__":
    main()
