"""Pour the Resource Use Explorer page, and its band on the home page, from site/data/resource-model.json. Run scripts/resource_model.py --export first.

The prose in site/explorer/index.html is written by hand, with every figure in a <span data-m="..."> this script fills. It writes
only between <!-- explorer:NAME --> markers and into those spans, so re-running changes nothing. A digit typed into the prose fails
the build, as does a claim that does not ship or a partly verified claim with no public limit. The rows, their geometry, and their words
come from the page's own model (site/assets/js/resource-model.js, through scripts/explorer_static.js), so the page without scripts and in print
says what the page with scripts computes at the default settings. Needs node; no packages. Page and script budgets live in tests/budgets.json.

    python scripts/build_explorer.py
"""
from decimal import Decimal
import hashlib
from html import escape
import json
from pathlib import Path
import re
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_plates as bp  # noqa: E402
import validate_public as vp  # noqa: E402

PAGE = vp.SITE / "explorer" / "index.html"
HOME = vp.SITE / "index.html"
MODEL = vp.SITE / "data" / "resource-model.json"
LIMITS = bp.EVIDENCE / "claim-limits.json"
MARKER = re.compile(r"(<!-- explorer:(?P<name>[\w:.-]+) -->)(.*?)(<!-- /explorer:(?P=name) -->)", re.S)
POUR = re.compile(r'<span data-m="(?P<spec>[^"]+)">[^<]*</span>')
CLAIM = re.compile(r"\b(?:au|ec|fp|fin|gf|lf|px|rs|sf|sv|tr)-\d{3}\b")
MS = ("wh", "usd", "g", "ml")

SAY = {
    "device": {"phone": "Phone", "laptop": "Laptop", "tv": "Television"},
    "connection": {"wifi": "Wi-Fi", "cellular": "cellular"},
    "network_mode": {"average": "average network accounting", "marginal": "marginal network accounting"},
    "router_allocation": {"by_time": "router by time", "by_data": "router by data", "excluded": "router excluded"},
    "chat_kind": {"short_text": "median text prompt", "medium_prompt": "medium prompt", "reasoning": "long reasoning query", "high_reasoning": "high reasoning query"},
    "video_dc_intensity": {"measured_delivery": "measured delivery intensity", "desnz_followup": "DESNZ follow-up intensity", "top_down": "top-down average intensity, an upper bound"},
    "dc_generation_water": {"us": "US generation average", "ercot": "ERCOT generation average"},
    "hydro_convention": {"columbia": "Columbia convention", "excluded": "reservoir evaporation excluded", "primary_purpose": "primary-purpose convention"},
    "hydro_share": {"nwpp": "NWPP hydro share", "bpa": "BPA hydro share"},
    "tariff": {"wa_commercial": "Washington commercial tariff", "or_commercial": "Oregon commercial tariff", "wa_residential": "Washington residential tariff",
               "us_residential": "US residential tariff", "us_industrial": "US industrial tariff", "bpa_wholesale": "BPA wholesale tariff"},
    "node_already_on": {"no": "node not on", "yes": "node already on"},
}
GRID_NAMES = {"us": "US grid", "us_nonbaseload": "US non-baseload", "nwpp": "NWPP", "bpa": "bought from BPA, regulator-assigned factor", "wa": "Washington in-state", "nw_short_run_margin": "Northwest short-run margin",
              "nw_long_run_margin": "Northwest long-run margin", "hydro": "hydro, declared", "wind": "wind, declared", "solar": "solar, declared", "diesel": "diesel"}
GRID_WHERE = {"grid_dc": "for the data center", "grid_home": "at home", "grid_local": "for a local node", "grid_colo": "for colocation"}
RATES = {"prompts_per_hour": "prompts an hour", "turns_per_hour": "agent turns an hour", "images_per_hour": "images an hour", "clips_per_hour": "clips an hour", "searches_per_hour": "searches an hour"}
SETTING_NAMES = {
    "device": "Device", "connection": "Connection", "network_mode": "Network accounting", "router_allocation": "Home router", "prompts_per_hour": "Prompts an hour",
    "chat_kind": "Kind of chat", "turns_per_hour": "Agent turns an hour", "images_per_hour": "Images an hour", "clips_per_hour": "Clips an hour", "searches_per_hour": "Searches an hour",
    "video_dc_intensity": "Streaming intensity", "grid_dc": "Data center grid", "grid_colo": "Colocation grid", "grid_local": "Node grid", "grid_home": "Home grid",
    "dc_generation_water": "Generation water", "hydro_convention": "Hydro water convention", "hydro_share": "Hydro share", "wage": "Wage for paid hours", "tariff": "Tariff", "node_already_on": "Node already on",
}
DRAWER = (("Your Side", ("device", "connection", "network_mode", "router_allocation")),
          ("Rates", ("prompts_per_hour", "chat_kind", "turns_per_hour", "images_per_hour", "clips_per_hour", "searches_per_hour", "video_dc_intensity")),
          ("Grids", ("grid_dc", "grid_colo", "grid_local", "grid_home", "dc_generation_water", "hydro_convention", "hydro_share")),
          ("Money", ("wage", "tariff")), ("Node Already On", ("node_already_on",)))
LINE = ["device", "connection", "router_allocation", "grid_dc", "grid_home", "hydro_convention", "wage", "node_already_on"]
INPUT_NAMES = {
    "e_prompt": "energy per median text prompt", "kb_prompt": "data per prompt", "i_dc": "data center energy per GB of video", "short_gb": "data per short-video hour", "short_ceiling": "the short-video data center ceiling",
    "net_fixed_avg": "fixed network energy per GB", "net_mobile_avg": "mobile network energy per GB", "router_w": "router watts", "dev_phone": "phone energy per hour", "dev_laptop": "laptop watts", "dev_tv": "television watts",
    "gb_phone": "video data per hour on a phone", "gb_laptop": "video data per hour on a laptop", "gb_tv": "video data per hour on a television", "short_minutes_day": "minutes of short video a day",
    "ei_in": "energy per 1,000 input tokens", "ei_out": "energy per 1,000 output tokens", "decode_ratio": "the decode-to-prefill ratio", "cache_share": "the energy share of a cache read", "tok_in_short": "input tokens per prompt",
    "tok_out_short": "output tokens per prompt", "tok_out_median": "output tokens per prompt", "coding_turns": "turns per coding session", "coding_fresh": "fresh input tokens per turn", "coding_cached": "cached input tokens per turn",
    "coding_out": "output tokens per turn", "coding_gb_per_hour": "data per coding hour", "coding_usd_per_active_day": "dollars per active day", "coding_hours_per_active_day": "coding hours per active day", "image_wh": "energy per image",
    "clip_wh": "energy per clip", "pue_hyper": "hyperscale PUE", "pue_colo": "colocation PUE", "pue_room": "room PUE", "u_hyper": "hyperscale utilization", "u_colo": "colocation utilization", "u_room": "room utilization",
    "a_idle": "an accelerator's idle fraction", "local_penalty": "the local hardware penalty", "wue_site": "site water per kWh", "gas_water": "water per kWh from gas", "pue_tower": "cooling tower PUE", "wue_tower": "cooling tower water",
    "pue_dry": "dry cooling PUE", "stor_wh_tb_h": "storage energy per TB-hour", "replicas": "copies kept", "seat_gb": "gigabytes per seat", "seat_kwh_yr": "energy per seat-year", "seat_hours_month": "active hours a month",
    "sync_w": "laptop watts added by cloud editing", "active_hours": "active hours per user-year", "nas_w": "NAS idle watts", "mini_w": "mini PC idle watts", "stream_w": "watts per stream", "node_w": "desk node idle watts",
    "office_w": "office server watts", "j_node": "node joules per token", "j_laptop": "laptop joules per token", "j_phone_query": "phone joules per query", "prefill_share": "input token energy share", "local_coverage": "share of queries a local model answers",
    "charger_overhead": "phone charger overhead", "oca_load": "cache load", "p_in": "list price per million input tokens", "p_out": "list price per million output tokens", "p_cache": "list price per million cache reads",
    "seat_usd": "seat list price", "p_egress": "egress list price", "node_usd": "desk node price", "hdd_usd_tb": "drive price per TB", "office_box_usd": "office server price", "office_tb": "terabytes on the office server",
    "mini_box_usd": "mini PC price", "nas_chassis_usd": "NAS chassis price", "nas_raw_tb": "raw terabytes per Nation", "life": "years of hardware life", "tariff_home": "home tariff", "office_admin_h_month": "paid hours a month, local suite",
    "mini_admin_h_month": "paid hours a month, media box", "nas_admin_h_month": "paid hours a month per NAS", "fed_admin_h_month": "paid hours a month per federated node", "node_admin_h_year": "paid hours a year, AI node",
    "support_usd_user_yr": "support subscription per user-year", "emb_desktop_kg": "embodied carbon of a small machine", "emb_mini_kg": "embodied carbon of a mini PC", "emb_hdd_kg_tb": "embodied carbon per TB of disk",
    "emb_tokens_kg_m": "embodied carbon per million tokens", "rev_meta": "Meta revenue per hour", "paid_video_month": "video plan price", "video_hours_month": "viewing hours a month", "chat_hours_month": "chat hours a month", "eps": "kWh per revenue dollar",
    "small_model_factor": "small-model energy factor", "reasoning_energy_mult": "reasoning energy multiple", "agent_token_mult": "agent token multiple", "cache_hit": "cache hit share", "fed_copies": "copies per Nation",
    "fed_moved_share": "share of data moving each month", "cloud_admin_h_month": "cloud paid hours a month", "central_admin_h_month": "central copy paid hours a month",
}
WORDS = {
    "price": {"api_list": "API list", "seat_list": "seat list", "self_run": "self-run, at cost", "revenue_standin": "platform revenue; revenue, not a cost", "paid_subscription": "paid plan", "none": "no price here"},
    "priceLong": {"api_list": "at API list", "seat_list": "at seat list", "self_run": "self-run, at cost with no margin", "revenue_standin": "what the platform earns; revenue, not a cost", "paid_subscription": "paid plan; falls with use", "none": "no price in this view"},
    "heads": {"api_list": "API list", "seat_list": "Seat list", "self_run": "Self-run, at cost", "revenue_standin": "Platform revenue: revenue, not a cost", "paid_subscription": "Paid plan", "none": "No price here"},
    "basin": {"dc": "data center basin, not stated", "cloud": "data center basin, not stated", "fixed": "data center basin, not stated", "home": "home basin", "local": "the node's basin", "colo": "the colocation's basin", "hydro": "the node's declared hydro feed"},
    "layer": {"dev": "Your device", "rou": "Home router", "net": "Network", "dc": "Data center or node"},
    "measure": {"wh": "energy", "usd": "price", "g": "CO2e", "ml": "water"},
    "order": ["api_list", "seat_list", "self_run", "revenue_standin", "paid_subscription", "none"],
    "off": "runs off this ruler",
    "orNever": "or never",
}
USE_ROWS = {
    "screen": ("Your screen and router, {screen} hours", "in the week", "none", False, "your screen and router"),
    "chat": ("Chat, {chat} prompts", "in the week", "api_list", True, "the chat prompts"),
    "coding": ("Agentic coding, {coding} hours", "in the week", "api_list", True, "the coding hour"),
    "images": ("Generated images, {images}", "in the week", "api_list", False, "the images"),
    "clips": ("Generated clips, {clips}", "in the week", "api_list", False, "the clips"),
    "searches": ("Searches with AI answers, {searches}", "in the week", "api_list", True, "the searches"),
    "social": ("Social video, {social} hours ({device})", "in the week", "revenue_standin", False, "social video"),
    "streaming": ("Streaming, {streaming} hours ({device})", "in the week", "revenue_standin", False, "streaming video"),
    "gb": ("Stored data, {gb} GB", "in the week", "seat_list", False, "stored data"),
    "seat": ("Cloud office seats, illustrative, {seats}", "in the week", "seat_list", False, "the seats"),
}
USE_NOTES = {
    "screen": ("The device and the home router, charged by time, once. With the router charged by data its share moves to the activity rows; with it excluded, or on cellular, it draws none.", ["fp-049", "fp-126", "fp-132"], "The phone's line is battery energy; the wall figure prints in the detail (lf-022). A television alone is many times the phone's line."),
    "chat": ("The data center and network terms of each prompt. No device or router term, so time is counted once.", ["fp-001", "fp-017", "fp-134", "fp-127", "px-003", "px-004"], "A median prompt: any count times it is a floor, and the mean-class prompt prints in the catalog. The kind of chat moves this row most."),
    "coding": ("The data center and network terms of an hour of agentic coding at the setting's mean turns.", ["au-043", "au-038", "au-008", "au-009", "px-003", "px-004"], "Modeled from token counts and one framework's defaults; the cache-read energy is an assumption with no measurement. Treat it as low-side for long, agentic work."),
    "images": ("The data center term of each image. Image traffic is not in the record.", ["fp-138", "fp-066", "fp-065", "px-027"], "The energy is an open model's and the price another vendor's list, so the two describe different models and are not one product's cost."),
    "clips": ("The data center term of each clip. Clip traffic is not in the record.", ["fp-070", "px-028"], "The energy is a Veo 3 estimate from scaling laws and the price another model's list, so the two are never paired."),
    "searches": ("A 2009 search plus one median prompt standing in for the AI answer, with the same data per query as chat.", ["fp-071", "sv-056", "fp-001", "px-029"], "AI answer energy is unpublished. The search half is a 2009 figure that likely overestimates today. It reads plus a stand-in, never a multiple of a search."),
    "social": ("The data center and network terms of an hour of short video. Ranking compute is unmeasured.", ["fp-053", "fp-055", "fp-059", "fp-127", "px-035"], "No API exists. The price is what Meta earns in that hour of single-app time: revenue, not a cost. TikTok has no figure of its own."),
    "streaming": ("The data center and network terms of an hour of video at the device's data rate.", ["fp-122", "fp-130", "fp-127", "px-042", "px-043", "px-044"], "No API exists. The price is what Netflix earns per hour viewed: revenue, not a cost, paid whether or not anyone watches. The person pays a flat plan that falls with use."),
    "gb": ("Drives only, in three copies, at the one storage coefficient, for one week.", ["ec-021", "ec-030", "px-048"], "A device-level figure, far below whole-service storage footprints on other boundaries. In Office mode it prints beside the seats and is not added, because the seat's 2011 figure already holds storage."),
    "seat": ("A 2011 vendor whole-service figure for email, one week of each seat. No laptop, no network.", ["sf-016", "px-045", "px-046"], "Illustrative, never ranked against another row. Email is not an office suite. It is the first row to replace with a field measurement."),
}
CROSS = {
    "prompts_energy_vs_hyper": ("Node catches the hyperscaler on energy", ["au-027", "gf-054", "fp-001", "fp-017", "sf-036"], "Idle watts all year over what each prompt saves. Above this count the node uses less energy per answer on one grid."),
    "prompts_carbon_same_grid": ("Node catches the hyperscaler on carbon, one grid", ["au-027", "gf-054", "gf-001"], "On one feed the carbon crossover is the energy crossover, because both sides share one grid factor."),
    "prompts_price_vs_hyper_list": ("Node beats the frontier list price", ["px-059", "sv-042", "px-003", "px-004"], "Hardware over life and paid hours over what each prompt saves at list. A frontier list is not a like-class price for a small model."),
    "prompts_price_vs_open_weight_host": ("Node beats an open-weight host's list", ["px-059", "sv-042", "px-014", "px-015"], "The same, against a host's list for a different model and business."),
    "prompts_carbon_on_hydro_vs_hyper_us": ("Scenario: node on a declared hydro feed, hyperscaler on the US grid", ["gf-035", "gf-007", "au-027"], "A scenario: the node must be physically behind that meter and the other side must not be. Hydro already committed elsewhere is not clean new supply."),
    "prompts_carbon_on_hydro_with_embodied": ("Scenario: the same, embodied carbon on both sides", ["gf-035", "gf-007", "sf-023", "au-011"], "A scenario, with the machine's embodied carbon spread over the count and the accelerator's lower-bound share on the other side."),
    "views_measured_same_network": ("Local box beats the platform's serving energy, measured intensity, same network", ["sf-042", "lf-033", "fp-122", "fp-130"], "The stream's own watts sit above the measured serving intensity, so at the default it never crosses; one change can make it cross."),
    "views_desnz_same_network": ("Local box beats the platform's serving energy, DESNZ follow-up intensity, same network", ["sf-042", "lf-033", "fp-141", "fp-142"], "The DESNZ follow-up's serving intensity sits below the measured one, so the stream's own watts stay above it. Only the top-down average, an upper bound, would reach them."),
    "views_measured_network_credit": ("Local box with a network credit, measured intensity", ["sf-042", "fp-127", "fp-129"], "A convention: it charges the Nation's own network at marginal cost against the platform's average."),
    "views_desnz_network_credit": ("Local box with a network credit, DESNZ follow-up intensity", ["sf-042", "fp-141", "fp-142", "fp-127", "fp-129"], "The same convention at the follow-up's intensity."),
}
ARCH = {
    "A": dict(energy=["cloud", "cloud_with_sync", "local", "local_two_boxes"], price=["cloud", "local", "local_two_boxes"], grid=["cloud_same_grid", "local", "local_two_boxes"], scenario=["cloud", "local_hydro"]),
    "B": dict(energy=["platform", "local_1000", "local_10000", "local_100000", "cache"]),
    "C": dict(energy=["ten_copies", "central_s3", "central_s3_with_pulls", "federated", "federated_replicas"],
              price=["ten_copies", "central_s3", "central_s3_with_pulls", "central_r2", "central_b2", "federated", "federated_replicas"]),
    "D": dict(energy=["hyper", "colo", "node_100k", "node_100k_fallback", "node_1m", "node_1m_fallback", "laptop", "laptop_with_fallback", "phone", "phone_wall", "phone_wall_fallback"],
              price=["hyper", "colo", "node_100k", "node_100k_fallback", "node_1m", "node_1m_fallback", "laptop", "laptop_with_fallback", "phone_wall", "phone_wall_fallback"],
              grid=["hyper_same_grid", "colo", "node_100k", "node_100k_fallback", "node_1m", "node_1m_fallback", "laptop", "laptop_with_fallback", "phone_wall", "phone_wall_fallback"],
              scenario=["hyper", "node_100k_hydro", "node_1m_hydro"]),
}
# The waffles: each number is checked against the claim's own quote or value below.
WAFFLES = {
    "iea_2025": {"claim": "lf-001", "ai": 155, "of": 485, "label": "IEA world, 2025", "def": "Facility class: AI-focused data centers, by share of all data center electricity. An AI-focused site also runs non-AI work.", "unit": "TWh"},
    "iea_2030": {"claim": "lf-001", "ai": 465 - 155, "of": 945 - 485, "label": "IEA world, added by 2030", "def": "Facility class: the share of the electricity added from 2025 to 2030 that goes to AI-focused data centers.", "unit": "TWh", "quote": ("155", "465", "485", "945")},
    "lbnl_2030": {"claim": "lf-003", "ai": 55, "of": 100, "label": "LBNL US, 2030", "def": "Server class: AI servers as a share of data center energy in a US reference case. A scenario, not a measurement.", "unit": "percent"},
    "epri_today": {"claim": "lf-002", "low": 15, "high": 25, "of": 100, "label": "EPRI, today", "def": "Workload class: AI workloads as a share of data center electricity, second-hand from IEA and JLL.", "unit": "percent"},
}


class BuildError(Exception):
    pass


def num(v, d=None):
    """As the page's num: two significant figures, three at 100 and above, and no trailing zero below 1."""
    if not v:
        return "0"
    if abs(v) >= 99.5:
        return f"{float(f'{v:.{(d or 3) - 1}e}'):,.12g}"
    text = format(Decimal(f"{v:.{(d or 2) - 1}e}"), "f")
    return text.rstrip("0") if abs(float(text)) < 1 else text


def usd(v):
    """As the page's usd: money keeps its cents below a dollar, $0.20, $0.04, $0.004."""
    if abs(v) >= 100:
        return f"${num(v)}"
    if abs(v) >= 1:
        return f"${v:.2f}"
    text = num(v)
    return f"${float(text):.2f}" if float(text) and len(text) < 4 else f"${text}"


def attr(text):
    return escape(str(text), quote=True)


def say_of(name, option, values):
    if name in SAY:
        return SAY[name][option]
    if name in GRID_WHERE:
        return f"{GRID_NAMES[option]} {GRID_WHERE[name]}"
    if name in RATES:
        return f"{option} {RATES[name]}"
    if name == "wage":
        return "staff time already paid" if values["wage"] == 0 else f"${values['wage']} an hour"
    raise BuildError(f"no words for setting {name}")


def short_labels(pub):
    """Architecture rows in few words, so the Wall's labels stay on two lines; the note under each row keeps the full label."""
    views = pub["scenario"]["views"]
    node = (pub["scenario"]["node_prompts_100k"], pub["scenario"]["node_prompts_1m"])
    out = {
        "arch.A.cloud": "Cloud seats", "arch.A.cloud_with_sync": "Cloud seats plus laptop sync draw", "arch.A.cloud_same_grid": "Cloud seats, on the local grid", "arch.A.local": "Local-first suite, one server",
        "arch.A.local_hydro": "Scenario: local-first suite, declared hydro feed", "arch.A.local_two_boxes": "Local-first suite, two servers", "arch.B.platform": "Platform", "arch.B.cache": "Embedded cache at an ISP",
        "arch.C.ten_copies": "Ten full copies, ten NAS boxes", "arch.C.central_s3": "One central copy, S3", "arch.C.central_s3_with_pulls": "Central copy, each Nation pulls once", "arch.C.central_r2": "One central copy, R2",
        "arch.C.central_b2": "One central copy, B2", "arch.C.federated": "Federated, one copy per Nation", "arch.C.federated_replicas": "Federated, three copies per Nation",
        "arch.D.hyper": "Hyperscaler, median prompt", "arch.D.hyper_same_grid": "Hyperscaler, on the node's grid", "arch.D.colo": "Regional colocation, energy only", "arch.D.laptop": "Laptops, small model",
        "arch.D.laptop_with_fallback": "Laptops, with cloud fallback", "arch.D.phone": "Phones, battery energy", "arch.D.phone_wall": "Phones, at the wall", "arch.D.phone_wall_fallback": "Phones at the wall, with cloud fallback",
    }
    for v in views:
        out[f"arch.B.local_{v}"] = f"Local box, {v:,} views a year"
    for name, n in zip(("node_100k", "node_1m"), node):
        out[f"arch.D.{name}"] = f"Node, {n:,} prompts a year"
        out[f"arch.D.{name}_hydro"] = f"Scenario: node, {n:,}, declared hydro feed"
        out[f"arch.D.{name}_fallback"] = f"Node, {n:,}, with cloud fallback"
    return out


UNIT_WORDS = {"hour": "per hour", "prompt": "per prompt", "session": "per session", "image": "per image", "clip": "per clip", "query": "per query", "seat-month": "per seat-month", "hour-view": "per hour-view", "one unit of the work": "per unit of this work"}


def row_meta(pub):
    """Labels and price bases, keyed by each row's path in the model's tree."""
    rows = {}
    short = short_labels(pub)

    def label_of(r):
        text = r["label"].replace(", NWPP grid", ", the local grid")
        text = text.replace(", phone, Wi-Fi", ", {device}, {link}").replace(" hour, phone", " hour, {device}")
        return text.replace("median text prompt", "{kind}", 1) if r["key"].startswith("catalog.chat") else text

    def add(r, **extra):
        unit = UNIT_WORDS.get(r["unit"]) or "for " + r["unit"]
        rows[r["key"]] = {"label": short.get(r["key"]) or label_of(r), "unit": unit, "pb": r["price_usd"]["basis"], **extra}

    for r in pub["catalog"]:
        add(r, note="note-" + r["key"].replace(".", "-"), **({"ai": True} if r["key"].split(".")[1] in ("chat_prompt", "chat_hour", "coding_session", "coding_hour") else {}))
    for r in pub["hour_baseline"]:
        add(r, note="note-" + r["key"].replace(".", "-"))
    for w, spec in pub["where_it_runs"].items():
        for place, r in spec["places"].items():
            add(r, note=f"note-where-{place}", **({"ai": True} if w in ("prompt", "coding_session") else {}))
    for letter, spec in pub["architectures"].items():
        for r in spec["options"]:
            add(r, note="note-" + r["key"].replace(".", "-"), **({"ai": True} if letter == "D" else {}))
    for lever in pub["levers"]:
        upper = " (an upper bound)" if lever["key"] in ("reasoning_off", "cache_title") else " (a scenario, a declared feed)" if lever["key"] == "local_clean_power" else ""
        rows["lever." + lever["key"]] = {"label": lever["label"] + upper, "unit": lever.get("reference", ""), "pb": lever["before"]["price_usd"]["basis"], "note": "note-lever-" + lever["key"]}
    for key, (label, _, _) in CROSS.items():
        rows["cross." + key] = {"label": label, "unit": "", "pb": "none", "note": "note-cross-" + key}
    for key, (label, unit, basis, ai, lower) in USE_ROWS.items():
        rows["use." + key] = {"label": label, "unit": unit, "pb": basis, "lower": lower, "note": "note-use-" + key, **({"ai": True} if ai else {})}
    # Words for a row with no price at all, in place of a figure.
    for w in pub["where_it_runs"]:
        rows[f"where.{w}.node"]["pn"] = "a self-run price needs a yearly count; see Architectures"
    rows["where.image.colo"]["pn"] = rows["where.clip.colo"]["pn"] = "no host list in the record"
    rows["arch.B.cache"]["pn"] = "placed by the platform, not sold"
    rows["use.screen"]["pn"] = "your own device and router"
    for key, r in rows.items():  # a self-run figure with a list price inside it says so, since bases are never summed elsewhere
        if key.endswith("_fallback") or key.endswith("_with_fallback"):
            r["pt"] = "self-run plus API list on the cloud share"
    return rows


def boards(pub):
    out = {"use": {"kind": "wall", "rows": ["use." + k for k in USE_ROWS]}}
    for w, spec in pub["where_it_runs"].items():
        out["where." + w] = {"kind": "wall", "rows": [r["key"] for r in spec["places"].values()]}
    for letter, spec in pub["architectures"].items():
        prefix = f"arch.{letter}."
        lists = ARCH[letter]
        board = {"kind": "wall", "rows": [r["key"] for r in spec["options"]]}
        for name, keys in lists.items():
            board[name] = [prefix + k for k in keys]
        board.setdefault("price", board["energy"])
        board.setdefault("grid", board["energy"])
        if letter == "C":
            board["plain"] = True
        out["arch." + letter] = board
    hour_rows = ["catalog.chat_hour", "catalog.coding_hour", "catalog.short_hour", "catalog.video_hour"] + [r["key"] for r in pub["hour_baseline"]]
    unit_rows = [r["key"] for r in pub["catalog"] if r["key"] not in hour_rows]
    out["catalog.hour"] = {"kind": "wall", "rows": hour_rows}
    out["catalog.unit"] = {"kind": "ruler", "rows": unit_rows}
    out["lever"] = {"kind": "lever", "rows": ["lever." + lever["key"] for lever in pub["levers"]]}
    prompts = [k for k in CROSS if k.startswith("prompts_")]
    out["cross.prompts"] = {"kind": "cross", "rows": ["cross." + k for k in prompts], "noun": "prompts a year"}
    out["cross.views"] = {"kind": "cross", "rows": ["cross." + k for k in CROSS if k.startswith("views_")], "noun": "views a year"}
    return out


def inline_data(pub):
    sel = {}
    for name, spec in pub["assumptions"].items():
        sel[name] = {"def": spec["default"], "opts": spec["options"], "say": {o: say_of(name, o, setting) for o, setting in spec["options"].items()}}
    swept = [k for k, v in pub["inputs"].items() if v["low"] != v["value"] or v["high"] != v["value"]]
    names = {k: INPUT_NAMES.get(k) or pub["inputs"][k]["unit"] for k in swept}
    names.update(SETTING_NAMES)
    check = {}

    def add_check(r):
        check[r["key"]] = [r["energy_wh"]["value"], r["price_usd"]["value"], r["co2e_g"]["value"], r["water_ml"]["value"]]

    for r in pub["catalog"] + pub["hour_baseline"]:
        add_check(r)
    for spec in pub["where_it_runs"].values():
        for r in spec["places"].values():
            add_check(r)
    for spec in pub["architectures"].values():
        for r in spec["options"]:
            add_check(r)
    for lever in pub["levers"]:
        for side in ("before", "after"):
            check[f"lever.{lever['key']}.{side}"] = [lever[side]["energy_wh"]["value"], lever[side]["price_usd"]["value"], lever[side]["co2e_g"]["value"], lever[side]["water_ml"]["value"]]
    inputs = {k: [v["value"], v["low"], v["high"]] for k, v in pub["inputs"].items()}
    a = pub["assumptions"]
    fields = {"screen": 7, "chat": a["prompts_per_hour"]["options"][a["prompts_per_hour"]["default"]]["prompts_per_hour"], "coding": 1,
              "images": a["images_per_hour"]["options"][a["images_per_hour"]["default"]]["images_per_hour"], "clips": a["clips_per_hour"]["options"][a["clips_per_hour"]["default"]]["clips_per_hour"],
              "searches": a["searches_per_hour"]["options"][a["searches_per_hour"]["default"]]["searches_per_hour"], "social": 1, "streaming": 1, "gb": 0}
    return {
        "schema": 1, "tier": "T0", "built": pub["built"], "price_date": pub["price_date"],
        "hash": hashlib.sha256(json.dumps(inputs, sort_keys=True).encode()).hexdigest()[:8],
        "inputs": inputs, "sel": sel, "scenario": pub["scenario"], "from_sel": pub["scenario_from_selectors"], "names": names, "words": WORDS, "line": LINE, "fields": fields,
        "rows": row_meta(pub), "boards": boards(pub), "check": check,
        "first": {"use": "use.screen", "where": "where.prompt.hyper", "arch": "arch.A.cloud", "lever": "lever.route_small", "cross": "cross.prompts_energy_vs_hyper", "catalog": "catalog.chat_hour"},
    }


def run_static(data, pours):
    """What the page's own code says at the defaults."""
    done = subprocess.run(["node", str(vp.ROOT / "scripts" / "explorer_static.js")], input=json.dumps({"data": data, "pours": sorted(pours)}), capture_output=True, text=True, encoding="utf-8")
    if done.returncode:
        raise BuildError(f"explorer_static.js failed: {done.stderr[:1500]}")
    return json.loads(done.stdout)


# Pieces of HTML ------------------------------------------------------------------------------------------

def pct(x):
    return f"{x * 100:.2f}%"


def value_html(f):
    parts = [f'<span class="ladder-num">{escape(f["num"])}</span>']
    if f["unit"]:
        parts.append(f' <span class="ladder-unit">{escape(f["unit"])}</span>')
    if f["tag"]:
        parts.append(f' <span class="ladder-tag">{escape(f["tag"])}</span>')
    return "".join(parts)


def label_text(data, key, st):
    """The label at the default settings, in the words the page's code would use."""
    text = data["rows"][key]["label"]
    text = re.sub(r"\{(\w+)\}", lambda m: {"kind": data["sel"]["chat_kind"]["say"]["short_text"], "device": "phone", "link": "Wi-Fi"}.get(m[1]) or f"{data['fields'].get(m[1], data['scenario']['office_users']):,}", text)
    return re.sub(r", 1 (hour|prompt)s\b", r", 1 \1", text)


def row_id(key):
    return "row-" + key.replace(".", "-")


def segment(tag, item):
    span = item.get(tag) if item else None
    if not span or span[1] <= 0:
        return ""
    return f'<i class="w w-{tag}" style="left:{pct(span[0])};width:{pct(span[1])}"></i>'


def wall_row(data, key, st, layout, shown):
    item = layout["items"].get(key)
    range_html = ""
    cell = st["cells"][key]
    if item and item.get("range"):
        a, w, off = item["range"]
        range_html = f'<i class="wall-range{" " + off if off else ""}" style="left:{pct(a)};width:{pct(w)}"></i>'
        if off:
            cell = {**cell, "tag": " ".join(x for x in (cell["tag"], WORDS["off"]) if x)}
    needle = f'<i class="wall-needle" style="left:{pct(item["end"])}"></i>' if item else ""
    hidden = "" if shown else " hidden"
    return (f'<li class="wall-row" id="{row_id(key)}" data-row="{attr(key)}"{hidden}><span class="ladder-label">{escape(label_text(data, key, st))}</span>'
            f'<span class="wall-track">{"".join(segment(t, item) for t in ("dev", "rou", "net", "dc"))}{range_html}{needle}</span>'
            f'<span class="ladder-value">{value_html(cell)}</span></li>')


def wall_html(data, board, st):
    spec = data["boards"][board]
    layout = st["walls"][board]
    visible = set(spec.get("energy", spec["rows"])) - ({"use.seat"} if board == "use" else set())
    rows = "".join(wall_row(data, key, st, layout, key in visible) for key in spec["rows"])
    plain = " is-plain" if spec.get("plain") else ""
    side = ('<p class="wall-head" aria-hidden="true"><span></span><span class="wall-sides"><span>Your side, by time</span><span>Beyond the wall, by count</span></span><span></span></p>'
            if not spec.get("plain") else '<p class="wall-head" aria-hidden="true"><span></span><span class="wall-sides"><span></span><span>One year of holding the data; stored data has no hour</span></span><span></span></p>')
    ticks = "".join(f'<span style="--x:{t["x"]:.4f}">{escape(t["t"])}</span>' for t in layout["ticks"])
    note = '<p class="caption wall-gridnote" hidden></p>' if board.startswith("arch.") else ""
    return (f'<div class="wall{plain}" data-board="{attr(board)}" data-measure="wh" style="--wall:{layout["wall"]:.4f}">{side}<ol class="wall-rows">{rows}</ol>'
            f'<div class="wall-axis" aria-hidden="true">{ticks}</div>{note}{key_html()}</div>')


def key_html():
    return ('<ul class="wall-key" aria-label="Key">' + "".join(f'<li><span class="plate-square w-key-{t}"></span>{escape(WORDS["layer"][t])}</li>' for t in ("dev", "rou", "net", "dc")) +
            '<li><span class="wall-key-range"></span>Spread, not a confidence interval</li></ul>')


def ruler_html(data, board, st):
    spec = data["boards"][board]
    lay = st["rulers"][board]
    rows = []
    for key in spec["rows"]:
        item = lay["items"].get(key, {})
        style = f'--x:{item["x"]:.4f}' + (f';--lo:{item["lo"]:.4f};--hi:{item["hi"]:.4f}' if item.get("lo") is not None and item.get("hi") is not None else "") if item else ""
        has_range = item.get("lo") is not None and item.get("hi") is not None and item["hi"] > item["lo"]
        rows.append(f'<li class="ladder-row" id="{row_id(key)}" data-row="{attr(key)}" style="{style}"><span class="ladder-label">{escape(label_text(data, key, st))}</span>'
                    f'<span class="ladder-track"><span class="ladder-range"{"" if has_range else " hidden"}></span><span class="ladder-mark"></span></span><span class="ladder-value">{value_html(st["cells"][key])}</span></li>')
    grid = "".join(f'<i style="--x:{t["x"]:.4f}"></i>' for t in lay["ticks"])
    axis = "".join(f'<span style="--x:{t["x"]:.4f}">{escape(t["t"])}</span>' for t in lay["ticks"])
    return f'<div class="ladder x-ruler" data-board="{attr(board)}" data-measure="wh"><div class="ladder-grid">{grid}</div><ol class="ladder-rows">{"".join(rows)}</ol><div class="ladder-axis" aria-hidden="true">{axis}</div></div>'


def lever_html(data, st):
    rows = []
    for key in data["boards"]["lever"]["rows"]:
        r = st["levers"][key]["wh"]
        style = f'--x:{r["xAfter"]:.4f};--x2:{r["xBefore"]:.4f}'
        value = {"num": r["ratio_text"] or "no figure", "unit": "after over before", "tag": f'({r["before_text"]} then {r["after_text"]})'}
        rows.append(f'<li class="ladder-row x-lever" id="{row_id(key)}" data-row="{attr(key)}" style="{style}"><span class="ladder-label">{escape(data["rows"][key]["label"])}</span>'
                    f'<span class="ladder-track"><span class="ladder-mark is-b"></span><span class="ladder-mark"></span></span><span class="ladder-value">{value_html(value)}</span></li>')
    return (f'<div class="ladder x-ruler" data-board="lever" data-measure="wh"><ol class="ladder-rows">{"".join(rows)}</ol></div>'
            '<ul class="wall-key" aria-label="Key"><li><span class="plate-square is-hollow"></span>Before</li><li><span class="plate-square"></span>After, at the same setting; the line runs left for a saving and right for a cost; each row has its own ruler from zero</li></ul>')


def cross_html(data, board, st):
    spec = data["boards"][board]
    lay = st["cross"][board]
    rows = []
    for key in spec["rows"]:
        c = lay["items"][key]
        parts = []
        if c.get("x") is not None:
            parts.append(f'--x:{c["x"]:.4f}')
        has_range = c.get("xlo") is not None and c.get("xhi") is not None and c["xhi"] > c["xlo"]
        if has_range:
            parts.append(f'--lo:{c["xlo"]:.4f};--hi:{c["xhi"]:.4f}')
        if "hydro" in key:
            parts.append("order:9")
        or_never = c.get("value") is not None and len(c["never"]) > 0  # the same test as the value column's words
        word = f'<i class="x-or-never" aria-hidden="true">{escape(WORDS["orNever"])}</i>' if or_never else ""
        rows.append(f'<li class="ladder-row{" is-or-never" if or_never else ""}" id="{row_id(key)}" data-row="{attr(key)}" style="{";".join(parts)}"><span class="ladder-label">{escape(data["rows"][key]["label"])}</span>'
                    f'<span class="ladder-track"><span class="ladder-range"{"" if has_range else " hidden"}></span><span class="ladder-mark"{"" if c.get("x") is not None else " hidden"}></span>{word}</span><span class="ladder-value">{value_html(c["words"])}</span></li>')
    head = '<li class="wall-group" data-scenario style="order:8">Scenario: a declared feed, not the default</li>' if any("hydro" in k for k in spec["rows"]) else ""
    grid = "".join(f'<i style="--x:{t["x"]:.4f}"></i>' for t in lay["ticks"])
    axis = "".join(f'<span style="--x:{t["x"]:.4f}">{escape(t["t"])}</span>' for t in lay["ticks"])
    return f'<div class="ladder x-ruler" data-board="{attr(board)}" data-group="crossover:{board.split(".")[1]}"><div class="ladder-grid">{grid}</div><ol class="ladder-rows">{head}{"".join(rows)}</ol><div class="ladder-axis" aria-hidden="true">{axis}</div></div>'


def segmented(name, legend, stops, checked, data_attr, extra=""):
    labels = "".join(f'<label><input type="radio" name="{attr(name)}" value="{attr(v)}" {data_attr}{" checked" if v == checked else ""}><span>{escape(t)}</span></label>' for v, t in stops)
    return f'<fieldset class="segmented"{extra}><legend>{escape(legend)}</legend>{labels}</fieldset>'


def measure_html(tab):
    return segmented(f"m-{tab}", "Measure", [("wh", "Energy"), ("g", "CO2e"), ("ml", "Water"), ("usd", "Price")], "wh", 'data-opt="m"')


def setting_html(pub, data, name, prefix="", why=True):
    spec = pub["assumptions"][name]
    if name in ("grid_local", "grid_home", "grid_colo"):  # one explanation, on the first grid, keeps the three others short
        spec = {**spec, "why": "The same feeds as the data center grid, so neither side of a comparison can take a feed the other cannot."}
    def stop(option):
        text = data["sel"][name]["say"][option]
        if name in GRID_WHERE:
            return GRID_NAMES[option]
        if name in RATES:
            return option
        return text[0].upper() + text[1:]
    why_id = f"why-{prefix}{name}"  # the line shows only while its group has focus, so the group names it for a screen reader too
    field = segmented(prefix + name, SETTING_NAMES[name], [(o, stop(o)) for o in spec["options"]], spec["default"], f'data-setting="{name}"', f' aria-describedby="{why_id}"' if why else "")
    return field.replace("</fieldset>", f'<p class="caption x-why-line" id="{why_id}">{escape(spec["why"])}</p></fieldset>') if why else field


def drawer_html(pub, data):
    groups = "".join(f'<h3>{escape(title)}</h3>{"".join(setting_html(pub, data, n) for n in names)}' for title, names in DRAWER)
    return f'<div class="x-drawer-head"><h2 class="label">Settings</h2><button type="button" class="button x-close" data-close-settings data-js hidden>Close</button></div><p class="caption">Each setting reaches every tab, and all but wage and tariff reach the address bar, so a shared link cannot carry a Nation\'s figures. Press Escape to close.</p>{groups}'


FIELD_WORDS = {
    "screen": ("Screen hours", "All your activities share these hours. The device and router are charged here, once, by time."),
    "chat": ("Chat prompts", "No source measures a chat hour. The model's starting rate is one prompt every six minutes; count your own."),
    "coding": ("Agentic coding hours", "Hours with an agent working at the setting's mean turns an hour. A session can be anywhere from a few minutes to hours."),
    "images": ("Generated images", "The reader's own count; no source measures it."),
    "clips": ("Generated clips", "Eight-second clips. The reader's own count; no source measures it."),
    "searches": ("Searches with AI answers", "The reader's own count. A 2009 search plus one median prompt standing in for the AI answer."),
    "social": ("Social video hours", "Instagram or TikTok on the record's data rate."),
    "streaming": ("Streaming hours", "Netflix or YouTube at the device's data rate."),
    "gb": ("Gigabytes stored", "Cloud drives only, in three copies, for one week. In Office mode each seat holds this many, and the row prints beside the seats, not added."),
}
FIELD_NAMES = {"social": "Instagram or TikTok. ", "streaming": "Netflix or YouTube. "}  # the rows name the unit; the fields name the platforms


def fields_html(data):
    cells = []
    for key, (label, why) in FIELD_WORDS.items():
        default = data["fields"][key]
        cells.append(f'<div class="x-field"><label for="f-{key}">{escape(label)}</label><input id="f-{key}" type="number" min="0" step="any" inputmode="decimal" value="{default}" data-field="{key}" data-why-text="{attr(why)}"><span class="caption">{FIELD_NAMES.get(key, "")}Model default {default:,}</span></div>')
    seats = data["scenario"]["office_users"]
    cells.insert(0, f'<div class="x-field" data-office hidden><label for="f-seats">Staff seats</label><input id="f-seats" type="number" min="1" step="1" inputmode="numeric" value="{seats}" data-field="seats" data-why-text="Office mode multiplies every field by the seats, then adds the seat row at seat list."><span class="caption">Model default {seats:,}</span></div>')
    mode = segmented("mode", "Who is counted", [("person", "One person"), ("office", "An office")], "person", 'data-opt="mode"')
    return f'{mode}<p class="caption x-start">A starting point: one hour of each activity in a week at the model\'s rates. Change any field.</p><div class="x-fields">{"".join(cells)}</div><p class="caption x-why" data-why role="status">Focus a field to see why it starts where it does.</p>'


def big_html(f):
    return f'<span>{escape(f["num"])}</span> <span class="x-big-unit">{escape(f["unit"])}</span>'


def readout_html(value, unit, qual, marks=True):
    """The figure and its unit on one line, what it counts under them; the same on every tab. The waffle's readouts are not live, so they carry no data-d."""
    mark = (lambda name: f' data-d="{name}"') if marks else (lambda name: "")
    long_value = " is-long" if len(value) >= 8 else ""
    return (f'<p class="readout{long_value}"><span class="readout-value"{mark("value")}>{escape(value)}</span> <span class="x-unit"{mark("unit")}>{escape(unit)}</span>'
            f'<span class="readout-unit"{mark("qual")}>{escape(qual)}</span></p>')


def detail_html(name, st, data, extra="", kind="row", table="", under_reading=""):
    views = ('<fieldset class="segmented plate-views" data-js hidden><legend class="sr-only">Detail view</legend>' +
             "".join(f'<label><input type="radio" name="view-{name}" value="{v}"{" checked" if v == "reading" else ""}><span>{t}</span></label>' for v, t in (("reading", "Reading"), ("sources", "Sources"), ("table", "Table"))) + "</fieldset>")
    d = st["details"].get(name) if kind == "row" else None
    if kind == "row":
        water = "".join(f'<span class="x-figure"><strong class="x-big">{big_html(w)}</strong><span class="caption">{escape(w["tag"])}</span></span>' for w in d["water"])
        layers = "".join(f'<li><span class="plate-square w-key-{x["tag"]}{"" if x["on"] else " is-hollow"}"></span><strong>{escape(x["text"])}</strong><span>{escape(x["label"])}</span></li>' for x in d["layers"])
        body = (readout_html(d["value"], d["unit"], d["qual"]) +
                f'<div class="x-measures"><div class="x-figure"><strong class="x-big" data-d="price">{escape(d["price"])}</strong><span class="caption" data-d="price-tag">{escape(d["priceTag"])}</span></div>'
                f'<div class="x-figure"><strong class="x-big" data-d="co2">{big_html(d["co2"])}</strong><span class="caption" data-d="co2-tag">{escape(d["co2Tag"])}</span></div>'
                f'<div class="x-water" data-d="water">{water}</div></div>'
                f'<output class="reading" data-d="reading" aria-live="polite">{escape(d["reading"])}</output>{under_reading}'
                f'<ul class="plate-values x-layers" data-d="layers">{layers}</ul><p class="caption" data-d="spread">{escape(d["spread"])}</p><p class="caption" data-d="moves">{escape(d["moves"])}</p><div class="x-tokens" data-d="tokens" hidden></div>')
    else:
        body = extra
    actions = ('<div class="plate-actions" data-js hidden><button type="button" class="button" data-copy>Copy Reading</button><button type="button" class="button" data-reset>Reset</button><span class="caption plate-status" role="status"></span></div>')
    after = extra if kind == "row" else ""
    return (f'{views}<div class="plate-view" data-view="reading">{body}{actions}{after}<div data-d="note" class="x-note-slot" data-js hidden></div><div class="plate-receipt" data-d="receipt" role="group" aria-label="Source" tabindex="-1" hidden></div></div>'
            f'<div class="plate-view" data-view="sources"><p class="label">Sources</p><ol class="plate-sources" data-d="sources"></ol><p class="caption">Every source on this page is listed under <a href="#all-sources">All Sources</a>.</p></div>'
            f'<div class="plate-view" data-view="table"><p class="label">Table</p><div class="table-scroll" tabindex="0" role="group" aria-label="Table, scrolls sideways">{table}</div></div>')


def rows_table(data, keys, st, caption, group=None, cites=None):
    cols = "".join(f"<th scope=\"col\">{c}</th>" for c in ("Row", "Energy", "Price, with its basis", "CO2e", "Water, by basin"))
    sources_col = '<th scope="col">Sources</th>' if cites else ""
    head = f"<thead><tr>{cols}{sources_col}</tr></thead>"
    body = []
    for key in keys:
        t = st["tables"][key]
        hidden = " hidden" if key == "use.seat" else ""
        cite = "<td>" + escape(cites.get(key, "")) + "</td>" if cites else ""
        body.append(f'<tr data-tr="{attr(key)}"{hidden}><th scope="row">{escape(label_text(data, key, st))}</th><td data-c="wh">{escape(t["wh"])}</td><td data-c="usd">{escape(t["usd"])}</td><td data-c="g">{escape(t["g"])}</td><td data-c="ml">{escape(t["ml"])}</td>{cite}</tr>')
    return f'<table class="data-table plate-table"><caption>{escape(caption)}</caption>{head}<tbody>{"".join(body)}</tbody></table>'


def chips(ids, claims):
    out = []
    for claim_id in dict.fromkeys(ids):
        c = claims[claim_id]
        hollow = " is-hollow" if c["status"] == "partly" else ""
        out.append(f'<a class="receipt{hollow}" href="#src-{claim_id}"><span class="receipt-mark"></span><span>{claim_id}</span></a>')
    return f'<p class="plate-chips">{"".join(out)}</p>' if out else ""


def note_html(note_id, label, lines, ids, claims, limits):
    body = "".join(f"<p>{escape(line)}</p>" for line in lines if line)
    return f'<div class="x-note" id="{note_id}"><p class="x-note-title">{escape(label)}</p>{body}{chips(list(dict.fromkeys(ids)), claims)}</div>'


def limit_of(claim_id, claims, limits):
    sentence = claims[claim_id].get("limit") or limits.get(claim_id)
    if not sentence:
        raise BuildError(f"partly verified claim {claim_id} has no public limit sentence; add it to {LIMITS.name}")
    return sentence


def row_lines(r):
    price = r["price_usd"].get("note")
    basis = "modeled estimate, not a measurement." if r["basis"].startswith("Modeled estimate, not a measurement: published") else r["basis"]
    beside = []
    for key, words_ in (("at_mean_prompt_wh", "at the mean-class prompt"), ("mean_session_wh", "the mean session"), ("storage_beside_wh", "storage, not added"), ("laptop_beside_wh", "the month's laptop draw, not added")):
        if r.get(key) is not None:
            beside.append(f"{words_} {num(r[key])} Wh")
    beside += [f'{x["label"]}: {usd(x["value"])}' for x in r.get("price_readings", [])]
    lines = [f'Counted: {r["counted"]}.' if r.get("counted") else "", f"Basis: {basis}", f"Price: {price}" if price else "", r.get("note"), r.get("quality")]
    return lines + ([f'Beside the row, at the defaults: {"; ".join(beside)}.'] if beside else [])


def notes_for(pub, tab, claims, limits):
    """Every row's boundary, basis, and sources in plain text; the detail zone clones the selected row's."""
    out = []
    if tab == "use":
        for key, (counted, ids, extra) in USE_NOTES.items():
            out.append(note_html("note-use-" + key, USE_ROWS[key][0].split(":")[0].split(",")[0], [f"Counted: {counted}", "Basis: modeled estimate, not a measurement.", extra], ids, claims, limits))
    elif tab == "catalog":
        top = pub["top_down"]["rows"]
        checks = {
            "catalog.chat_prompt": f'Second readings, another boundary: {num(top["chat_prompt.revenue_reading_wh"])} Wh at the revenue ratio, for token-priced rows only; a ceiling of {num(top["google_ceiling.wh"])} Wh from all of Google\'s electricity over its tokens (au-048). Floor; ceiling (different boundary).',
            "catalog.coding_session": f'A second reading, another boundary: {num(top["coding_session.revenue_reading_wh"])} Wh at the revenue ratio, for token-priced rows only.',
            "catalog.short_hour": f'A ceiling on another boundary: {num(top["meta_ceiling.wh_per_hour"])} Wh of Meta\'s electricity per hour (fp-059). Floor; ceiling (different boundary).',
        }
        for r in pub["catalog"] + pub["hour_baseline"]:
            lines = row_lines(r) + [checks.get(r["key"], "")]
            ids = r["claims"] + CLAIM.findall(" ".join(x or "" for x in lines))
            out.append(note_html("note-" + r["key"].replace(".", "-"), r["label"], lines, ids, claims, limits))
    elif tab == "where":
        places = {p["key"]: p for p in pub["places"]}
        for place, r in pub["where_it_runs"]["prompt"]["places"].items():
            lines = row_lines(r) + [place_line(places[place])]
            if place == "colo":
                lines.append("No open-weight host list price in the record for images and clips.")
            if place == "node":
                pue = places[place]["pue"]
                if not pue["low"] <= claims["lf-059"]["value"] <= pue["high"]:
                    raise BuildError("lf-059 no longer sits inside the node's PUE range: rewrite this sentence")
                lines.append(f'No general field figure for a local node; among Tribally owned facilities, {facility_words(claims)}, inside this range.')
            ids = r["claims"] + places[place]["evidence"] + CLAIM.findall(" ".join(x or "" for x in lines))
            out.append(note_html(f"note-where-{place}", r["label"], lines, ids, claims, limits))
    elif tab == "arch":
        for spec in pub["architectures"].values():
            for r in spec["options"]:
                ids = r["claims"] + CLAIM.findall(" ".join(x or "" for x in row_lines(r)))
                out.append(note_html("note-" + r["key"].replace(".", "-"), r["label"], row_lines(r), ids, claims, limits))
    elif tab == "lever":
        for lever in pub["levers"]:
            lines = [f'Term moved: {lever["term"]}. Size in the record: {lever["size_in_record"]}. Reference: {lever.get("reference", "")}.', lever.get("note"),
                     f'Before: {lever["before"]["label"]}; {lever["before"]["counted"]}.', f'After: {lever["after"]["label"]}; {lever["after"]["counted"]}.']
            ids = lever.get("evidence", []) + CLAIM.findall(" ".join(x or "" for x in lines))
            out.append(note_html("note-lever-" + lever["key"], lever["label"], lines, ids, claims, limits))
    elif tab == "cross":
        for key, (label, ids, note) in CROSS.items():
            out.append(note_html("note-cross-" + key, label, [note], ids, claims, limits))
    return "".join(out)


def place_line(p):
    def spread(field, label):
        f = p.get(field)
        if not f:
            return f'{label} {p.get(field + "_note", "")}'.strip()
        return f'{label} {f["value"]:g} ({f["low"]:g} to {f["high"]:g})' if f["low"] != f["high"] else f'{label} {f["value"]:g}'
    idle = p["idle_floor"].replace("inside U", "inside the utilization")
    return f'Place: {spread("pue", "PUE")}; {spread("u", "utilization")}; {spread("site_water", "site water, L per kWh")}; grid: {p["grid_default"]}; idle: {idle}. {p.get("note", "")}'.strip()


def waffle_svg(filled, hollow=0):
    """One hundred squares as dashed strokes, row by row: a dash is a square, and the pattern restarts with each run."""
    pitch, size = 14, 12

    def path(start, stop):
        out, i = [], start
        while i < stop:
            run = min(stop - i, 10 - i % 10)
            out.append(f"M{(i % 10) * pitch} {(i // 10) * pitch + size // 2}h{run * pitch - 2}")
            i += run
        return "".join(out)
    range_path = f'<path class="x-d-range" d="{path(filled, filled + hollow)}"/>' if hollow else ""
    return f'<svg viewBox="0 0 {10 * pitch - 2} {10 * pitch - 2}" aria-hidden="true"><path class="x-d-ai" d="{path(0, filled)}"/>{range_path}<path class="x-d-rest" d="{path(filled + hollow, 100)}"/></svg>'


def waffles_html(claims, limits):
    out = []
    for key, w in WAFFLES.items():
        claim = claims[w["claim"]]
        if "low" in w:
            if (claim.get("low"), claim.get("high")) != (w["low"], w["high"]):
                raise BuildError(f"waffle {key} does not match {w['claim']}")
            filled, hollow = w["low"], w["high"] - w["low"]
            figure = f'{w["low"]} to {w["high"]} percent'
            line = f'{w["low"]} to {w["high"]} percent of data center electricity'
        else:
            text = claim["quote"]
            if w["unit"] == "TWh":
                for number in w.get("quote", (str(w["ai"]), str(w["of"]))):
                    if number not in text:
                        raise BuildError(f"waffle {key}: {number} is not in the quote of {w['claim']}")
            elif claim.get("value") != w["ai"]:
                raise BuildError(f"waffle {key} does not match {w['claim']}")
            share = round(100 * w["ai"] / w["of"])
            filled, hollow = share, 0
            figure = f"{share} percent"
            line = f'{w["ai"]} of {w["of"]} {w["unit"]}' if w["unit"] == "TWh" else f'{w["ai"]} percent of data center energy'
        limit = limit_of(w["claim"], claims, limits) if claim["status"] == "partly" else ""
        limit_line = "<span>Limit: " + escape(limit) + "</span>" if limit else ""
        out.append(f'<div class="x-waffle" data-group="waffle:{key}"><figure><div class="x-waffle-art" role="img" aria-label="{attr(w["label"])}: {attr(figure)} AI of one hundred squares">{waffle_svg(filled, hollow)}</div>'
                   f'<figcaption><strong>{escape(w["label"])}: {escape(figure)}</strong><span>{escape(line)}. {escape(w["def"])}</span>'
                   f'<span class="x-waffle-rest">The rest: search, video, storage, email, business software: not split in the record.</span>'
                   f'{limit_line}{chips([w["claim"]], claims)}</figcaption></figure></div>')
    return "".join(out)


def waffle_detail(claims, limits):
    out = []
    for key, w in WAFFLES.items():
        claim = claims[w["claim"]]
        value = f'{w["low"]} to {w["high"]}' if "low" in w else str(round(100 * w["ai"] / w["of"]))
        limit = limit_of(w["claim"], claims, limits) if claim["status"] == "partly" else ""
        limit_line = '<p class="caption">Limit: ' + escape(limit) + "</p>" if limit else ""
        out.append(f'<div data-group="waffle:{key}">{readout_html(value, "percent", w["label"], marks=False)}<p class="reading">{escape(w["def"])}</p>'
                   f'{limit_line}<p class="caption">{escape(claim["source"]["publisher"])}. {escape(claim["boundary"] or "")}</p>{chips([w["claim"]], claims)}</div>')
    return "".join(out)


def strip_svg(values, per=0.05):
    """One 20px square per unit, five to a row, so the columns can be counted; the last square is cut to its fraction."""
    pitch, size, across = 22, 20, 5
    n = values / per
    whole = int(n)
    d = "".join(f"M{(i % across) * pitch} {(i // across) * pitch}h{size}v{size}h-{size}z" for i in range(whole))
    frac = n - whole
    if frac > 0.02:
        i = whole
        d += f"M{(i % across) * pitch} {(i // across) * pitch}h{max(2, round(size * frac))}v{size}h-{max(2, round(size * frac))}z"
    rows = max(1, (whole + (1 if frac > 0.02 else 0) + across - 1) // across)
    return f'<svg viewBox="0 0 {across * pitch - 2} {rows * pitch - 2}" width="{across * pitch - 2}" height="{rows * pitch - 2}" aria-hidden="true"><path class="x-w-ai" d="{d}"/></svg>'


def place_strip(pub):
    """The same short prompt, one square per 0.05 Wh. Three places run the same model; the devices run a small one, added energy only."""
    places = {p["key"]: p for p in pub["places"]}
    tree = {f"where.prompt.{place}.wh": r["energy_wh"]["value"] for place, r in pub["where_it_runs"]["prompt"]["places"].items()}
    tree.update({r["key"] + ".wh": r["energy_wh"]["value"] for r in pub["architectures"]["D"]["options"]})
    pues = lambda p: f'PUE {p["pue"]["value"]}' if p.get("pue") else "PUE not applicable"
    water = lambda p: f'site water {p["site_water"]["value"]} L per kWh'
    cols = [
        ("Hyperscale", tree["where.prompt.hyper.wh"], f'{pues(places["hyper"])}, utilization {places["hyper"]["u"]["value"]}, {water(places["hyper"])}; {places["hyper"]["grid_default"]}.', ""),
        ("Regional colocation", tree["where.prompt.colo.wh"], f'{pues(places["colo"])}, utilization {places["colo"]["u"]["value"]}, {water(places["colo"])}; {places["colo"]["grid_default"]}.', ""),
        ("Community node", tree["where.prompt.node.wh"], f'{pues(places["node"])}, utilization {places["node"]["u"]["value"]}, {water(places["node"])}; the local grid; a low utilization is its idle floor.', ""),
        ("Laptop", tree["arch.D.laptop.wh"] / 1000, "Small model; the reader's grid; no site water.", "device"),
        ("Phone", tree["arch.D.phone.wh"] / 1000, f'Small model; the reader\'s grid; no site water; {num(tree["arch.D.phone_wall.wh"] / 1000)} Wh at the wall.', "device"),
    ]
    html = []
    for label, wh, words_, kind in cols:
        html.append(f'<li class="x-place{" is-device" if kind else ""}"><strong>{escape(label)}</strong><span class="x-place-art">{strip_svg(wh)}</span><span class="x-place-wh">{num(wh)} Wh</span><span class="caption">{escape(words_)}</span></li>')
    return "".join(html)


def table_of(head, rows, caption="", first_is_header=True):
    th = "".join(f'<th scope="col">{escape(h)}</th>' for h in head)
    body = []
    for row in rows:
        cells = []
        for i, c in enumerate(row):
            cells.append(f'<th scope="row">{escape(str(c))}</th>' if i == 0 and first_is_header else f"<td>{escape(str(c))}</td>")
        body.append(f"<tr>{''.join(cells)}</tr>")
    cap = f"<caption>{escape(caption)}</caption>" if caption else ""
    return f'<div class="table-scroll" tabindex="0" role="group" aria-label="Table, scrolls sideways"><table class="data-table x-text-table">{cap}<thead><tr>{th}</tr></thead><tbody>{"".join(body)}</tbody></table></div>'


def backtest_html(pub):
    rows = pub["backtest"]["rows"]
    held = [r for r in rows if r["independent"]]
    other = [r for r in rows if not r["independent"]]
    def line(r, flag):
        unit = r["unit"]
        return [f'{r["id"]}: {r["label"]}', flag, f'{num(r["model"])} {unit}', f'{num(r["published"])} {unit}', num(r["ratio"]), r["known_miss"] or r["note"]]
    s = pub["backtest"]["summary"]
    table = table_of(("Figure", "Held out", "Model", "Published", "Model over published", "Note"), [line(r, "yes") for r in held] + [line(r, "not held out") for r in other], "Model over published. Held-out rows set no coefficient, chose no setting, and share no input.")
    return (f'{table}<p class="caption">Held out: {s["independent"]["n"]} figures, median factor {num(s["independent"]["median_factor"])}, {s["independent"]["within_2x"]} within two times, worst {num(s["independent"]["worst_factor"])}. '
            f'All {s["all"]["n"]}: median {num(s["all"]["median_factor"])}, {s["all"]["within_2x"]} within two times. {escape(pub["backtest"]["note"])}</p>')


def regression_html(pub):
    t = pub["regression"]["trend_controlled"]
    names = (("common_trend", "Common trend"), ("firm_trends", "Firm trends"), ("year_effects", "Year effects"), ("first_differences", "First differences"))
    rows = [(label, f'{t[k]["b"]:.2f}', f'{t[k]["se"]:.2f}', t[k]["n"], t[k]["df"]) for k, label in names]
    table = table_of(("Specification", "Slope on log revenue", "se", "n", "df"), rows, "Log electricity on log revenue, three cloud and AI firms, with a time control. A descriptive slope inside a common growth trend (rs-001, rs-020, rs-033, fin-028, fin-029, fin-031).")
    fd = t["first_differences"]
    r = pub["regression"]
    return (f'{table}<p class="caption">Without a time control the within-firm slope is {r["cloud_ai_firms"]["b"]:.2f} (se {r["cloud_ai_firms"]["se"]:.2f}), which is that common trend. In first differences the intercept is {fd["intercept_log_per_year"]:.2f} log points a year, '
            f'so electricity grew about {r["growth_per_year_whatever_revenue_did"] * 100:.0f} percent a year whatever revenue did. {escape(r["not_supported"].replace("any causal or elasticity reading", "any causal reading"))}</p>')


def calibration_html(pub):
    c = pub["calibration"]
    i = c["idle_fraction"]
    d = c["decode_to_prefill"]
    rows = [(f'{f["id"]}: {f["label"]}', num(f["ratio_3"]), num(f["ratio_10"]), num(f["ratio_10_anchored_to_google"])) for f in d["figures"]]
    return (f'<p>The idle fraction is an accelerator\'s {i["central_used"]} (ec-020), because every row the multiplier touches is accelerator work. The conventional-server anchors solve to {num(i["from_sf008"])} (sf-008) and state {i["from_sv039"]} (sv-039); they print here and set no row. '
            f'The idle term is untested: no back-test row touches it.</p>' +
            table_of(("Decode-to-prefill test, model over published", "Ratio 3", "Ratio 10", "Ratio 10, anchored"), rows) +
            f'<p>{escape(d["decision"])}</p><p>{escape(c["cache_share"]["note"])}</p>')


def sensitivity_html(pub):
    names = {**INPUT_NAMES, **SETTING_NAMES}
    labels = {"wh": "Energy", "usd": "Price", "g": "CO2e", "ml": "Water"}
    def rows(block):
        return [(labels[m], "; ".join(f'{names.get(e["name"], e["name"])} (first on {e["rows_first"]} {"row" if e["rows_first"] == 1 else "rows"})' for e in pub["sensitivity"][block][m][:4])) for m in MS]
    return (f'<p>{escape(pub["sensitivity"]["method"])}</p>' + table_of(("Catalog", "What moves the most rows"), rows("global_catalog")) + table_of(("Architectures", "What moves the most rows"), rows("global_architectures")))


def stability_words(flips, pub, data):
    out = []
    names = {**INPUT_NAMES, **SETTING_NAMES}
    for f in flips:
        if " = " in f:
            name, option = f.split(" = ", 1)
            out.append(f'{names.get(name, name)}: {data["sel"][name]["say"].get(option, option)}')
        else:
            name, value = f.split(" at ", 1)
            out.append(f"{names.get(name, name)} at {value}")
    return out


def arch_pairs(pub, data):
    """What reverses each pair, for the measure shown: one setting at a time, the reversal always visible, the figures in the rows. Words for the default settings."""
    out = []
    for letter in pub["architectures"]:
        pairs = []
        for s in pub["stability"]["comparisons"]:
            if not s["id"].startswith(letter.lower() + "_"):
                continue
            label = s["label"] + (" (a scenario)" if "hydro" in s["label"] and "scenario" not in s["label"] else "")
            measure = "usd" if "price" in label else "ml" if "water" in label else "g" if "carbon" in label else "wh"
            flips = stability_words(s["flips_on_one_input"] + s["flips_on_one_setting"], pub, data)
            chip = f'reverses on: {"; ".join(flips[:4])}' if flips else "holds on every single change"
            pairs.append(f'<li data-pair-m="{measure}"><span>{escape(label)}</span> <span class="x-chip">{escape(chip)}</span></li>')
        out.append(f'<div class="x-reversals" data-group="comparison:{letter}"><p class="label">What reverses each pair, at the default settings</p><ul class="x-pairs">{"".join(pairs)}</ul></div>')
    return "".join(out)


def admin_html(pub, st):
    """Owner ruling 11/04/2026: the cloud's assumed admin hours stay a visible input, with the point where the price order flips printed beside it."""
    name = "cloud_admin_h_month"
    hours = pub["inputs"][name]["value"]
    pair = next(s for s in pub["stability"]["comparisons"] if s["id"] == "a_price")
    flip = next((f.split(" at ")[1] for f in pair["flips_on_one_input"] if f.startswith(f"{name} at ")), None)
    if flip is None:
        raise BuildError(f"the office price order no longer flips on {name}: rewrite the admin hours note")
    local = pub["inputs"]["office_admin_h_month"]
    return (f'<div class="x-admin-row"><div class="x-field" data-js hidden><label for="a-admin">Cloud admin hours a month</label><input id="a-admin" type="number" min="0" step="any" inputmode="decimal" value="{hours:g}" data-input="{name}"></div>'
            f'<p class="caption"><strong>The price order flips by {flip} hours a month.</strong> <span data-admin-tie>{escape(st["adminWords"])}</span></p></div>'
            f'<p class="caption" role="status" data-input-why></p>'
            f'<p class="caption">Cloud seats need an administrator too. With no source for it, this page assumes {hours:g} paid hours a month, against {local["value"]:g} for the local suite ({", ".join(local["claims"])}). By {flip} the local suite is the cheaper.</p>')


def facility_words(claims):
    """Owner ruling 11/04/2026: the Tribally owned facility's PUE, anonymized and attributed to its public source. Every word but the figure is ours."""
    return f'one self-reports a power usage effectiveness (PUE) of {claims["lf-059"]["value"]:g} in its public sustainability report (lf-059)'


def no_number_words(pub, claims):
    """The model's sentence on Tribally owned facilities, with the one published figure the owner has now worded."""
    old = "Tribally owned facilities exist, and none"
    if not any(old in x for x in pub["qualitative"]["what_no_resource_number_captures"]):
        raise BuildError(f"the model no longer says {old!r}: rewrite the sentence on the Tribally owned facility")
    return [x.replace(old, f"Tribally owned facilities exist; {facility_words(claims)}, and none") for x in pub["qualitative"]["what_no_resource_number_captures"]]


def wins_words(letter, spec, pub):
    """The office row's clean feed is a scenario and says so; on one grid the local suite carries more carbon."""
    wins = spec["wins"]
    if letter != "A":
        return wins
    options = {r["key"].split(".")[-1]: r["co2e_g"]["value"] / 1000 for r in spec["options"]}
    hit = re.search(r"carbon only as a declared clean feed \([^()]*\)", wins)
    if not hit:
        raise BuildError("the office wins sentence changed: rewrite its hydro clause as a scenario")
    return wins.replace(hit[0], f'carbon only as a declared clean feed, a scenario ({num(options["local_hydro"])} kg a year on hydro; on one grid {num(options["local"])} kg against the cloud\'s {num(options["cloud_same_grid"])} kg, gf-035, gf-001)')


def arch_words(pub, data, st):
    """Wins, loses, and the readings, one comparison at a time. Words for the default settings."""
    out = []
    for letter, spec in pub["architectures"].items():
        def reading_label(k, r):
            if "." not in k:
                return r["label"]
            stop = k.split(".")[1]
            counts = {"node_100k": pub["scenario"]["node_prompts_100k"], "node_1m": pub["scenario"]["node_prompts_1m"]}
            return f'{r["label"]}: {counts[stop] if stop in counts else int(stop):,}'
        readings = "".join(f'<li>{escape(reading_label(k, r))}: <strong data-reading="arch.{letter}.readings.{k}">{escape(st["readings"][f"arch.{letter}.readings.{k}"])}</strong></li>' for k, r in spec["readings"].items())
        out.append(f'<div class="x-arch-words" data-group="comparison:{letter}"><p class="label">Wins, at the default settings</p><p class="caption">{escape(wins_words(letter, spec, pub))}</p><p class="label">Loses, at the default settings</p><p class="caption">{escape(spec["loses"])}</p>'
                   f'<p class="caption">{escape(spec["note"])}</p>'
                   f'<details class="plate-more"><summary>Figures beside the rows</summary><ul class="x-readings">{readings}</ul></details></div>')
    return "".join(out)


def sources_html(ids, claims, limits):
    out = []
    labels = bp.EVIDENCE_LABEL
    for claim_id in sorted(ids):
        c = claims[claim_id]
        s = c["source"]
        when = s.get("published")
        date = f"{when[5:7]}/{when[8:10]}/{when[:4]}" if when and len(when) >= 10 and when[4] == "-" else (when or "undated")
        status = f'Partly verified. Limit: {escape(limit_of(claim_id, claims, limits))}' if c["status"] == "partly" else "Verified against the source."
        short = re.split(r"[,(;]", s.get("publisher") or "source")[0].strip()[:26]
        out.append(f'<li id="src-{claim_id}" data-short="{attr(short)}"><a class="plate-source-title" href="{attr(s["url"])}">{bp.verbatim(s.get("title") or s.get("publisher") or claim_id)}</a>'
                   f'<span class="caption">{claim_id}. {escape(s.get("publisher") or "")}, {date}. {labels.get(s.get("kind"), "Source")}.</span>'
                   f'<q class="plate-quote">{bp.verbatim(c["quote"])}</q><span class="caption">{escape(c.get("boundary") or "")} {status}</span></li>')
    return "".join(out)


def linkify(html):
    """Claim ids in running text become links to their receipts. Idempotent: an id already inside a link or a tag is left alone."""
    parts = re.split(r"(<[^>]+>)", html)
    inside = 0
    for i, part in enumerate(parts):
        if part.startswith("<"):
            if re.match(r"<a\b", part):
                inside += 1
            elif re.match(r"</a\s*>", part):
                inside -= 1
        elif not inside and CLAIM.search(part):
            parts[i] = CLAIM.sub(lambda m: f'<a class="x-c" href="#src-{m[0]}">{m[0]}</a>', part)
    return "".join(parts)


TYPED_DIGIT = re.compile(r"\d")


def check_typed_digits(page):
    """Digits our prose may type: years, dates, names like CO2, and claim ids. Every quantity is poured."""
    body = page[page.index("<main"):page.index("</main>")]
    body = MARKER.sub(" ", body)
    body = re.sub(r"<script.*?</script>|<code>.*?</code>|<span data-setting-line>[^<]*</span>", " ", body, flags=re.S)
    body = POUR.sub(" ", body)
    body = re.sub(r"<[^>]+>", " ", body)
    body = bp.NAMED_DIGITS.sub(" ", body)
    body = CLAIM.sub(" ", body)
    found = re.findall(r".{0,30}\d.{0,12}", body)
    if found:
        raise BuildError(f"a digit typed into the page's prose: {found[:6]}")


def build():
    pub = json.loads(MODEL.read_text(encoding="utf-8"))
    claims = {}
    for path in sorted((vp.SITE / "data" / "claims").glob("*.json")):
        data_ = json.loads(path.read_text(encoding="utf-8"))
        if "claims" in data_:
            claims.update({c["id"]: c for c in data_["claims"]})
    limits = {**json.loads(LIMITS.read_text(encoding="utf-8"))["limits"], **pub["limits"]}
    page = PAGE.read_text(encoding="utf-8")
    data = inline_data(pub)
    pours = {m["spec"] for m in POUR.finditer(page)}
    here = {spec: local_pour(spec, claims, pub) for spec in pours if spec.split(":")[0] in ("cl", "pub")}
    st = run_static(data, pours - set(here))
    st["pours"].update(here)

    def table_for(tab):
        d = data["boards"]
        if tab == "use":
            return rows_table(data, d["use"]["rows"], st, "One week at the settings shown. Water is by basin, never summed.")
        if tab == "where":
            return "".join(f'<div data-group="workload:{w}">{rows_table(data, d["where." + w]["rows"], st, spec["label"])}</div>' for w, spec in pub["where_it_runs"].items())
        if tab == "arch":
            return "".join(f'<div data-group="comparison:{letter}">{rows_table(data, d["arch." + letter]["rows"], st, spec["title"])}</div>' for letter, spec in pub["architectures"].items())
        if tab == "catalog":
            cites = {r["key"]: " ".join(r["claims"]) for r in pub["catalog"] + pub["hour_baseline"]}
            return rows_table(data, d["catalog.hour"]["rows"] + d["catalog.unit"]["rows"], st, "Every row at the settings shown. The price column is not sortable: prices are not ranked across bases.", cites=cites)
        if tab == "lever":
            head = "".join(f'<th scope="col">{c}</th>' for c in ("Lever", "Energy", "Price", "CO2e", "Water"))
            body = []
            for key in d["lever"]["rows"]:
                cells = "".join(f'<td data-c="{m}">{escape(st["levers"][key][m]["before_text"])} then {escape(st["levers"][key][m]["after_text"])}{", " + st["levers"][key][m]["ratio_text"] if st["levers"][key][m]["ratio_text"] else ""}</td>' for m in MS)
                body.append(f'<tr data-tr="{attr(key)}"><th scope="row">{escape(data["rows"][key]["label"])}</th>{cells}</tr>')
            return f'<table class="data-table plate-table"><caption>Before, then after, and after over before, at the same setting.</caption><thead><tr>{head}</tr></thead><tbody>{"".join(body)}</tbody></table>'
        if tab == "cross":
            body = []
            for board in ("cross.prompts", "cross.views"):
                for key in d[board]["rows"]:
                    c = st["cross"][board]["items"][key]
                    body.append(f'<tr data-tr="{attr(key)}"><th scope="row">{escape(data["rows"][key]["label"])}</th><td data-c="count">{escape(c["text"])}</td><td data-c="ends">{escape(c["ends"])}</td></tr>')
            return f'<table class="data-table plate-table"><caption>Annual count at which the local option catches up, with the range from one change.</caption><thead><tr><th scope="col">Crossover</th><th scope="col">Count</th><th scope="col">What sets each end</th></tr></thead><tbody>{"".join(body)}</tbody></table>'
        return ""

    def lever_first():
        key = data["first"]["lever"]
        r = st["levers"][key]
        lines = "".join(f'<li>{WORDS["measure"][m]}: {escape(r[m]["before_text"])} then {escape(r[m]["after_text"])}{", " + r[m]["ratio_text"] if r[m]["ratio_text"] else ""}</li>' for m in MS)
        return (readout_html(r["wh"]["ratio_text"], "", "after over before, energy") +
                f'<output class="reading" data-d="reading" aria-live="polite">{escape(data["rows"][key]["label"])}: {escape(r["wh"]["before_text"])} before, {escape(r["wh"]["after_text"])} after, at the same setting. Modeled, not measured; a per-unit saving is not a total one.</output><ul class="x-lines" data-d="lines">{lines}</ul>')

    def cross_first():
        key = data["first"]["cross"]
        c = st["cross"]["cross.prompts"]["items"][key]
        return (readout_html(c["words"]["num"], c["words"]["unit"], c["words"]["tag"][1:-1]) +
                f'<output class="reading" data-d="reading" aria-live="polite">{escape(data["rows"][key]["label"])}: {escape(c["text"])}. A range from one change at a time, not a forecast.</output><p class="caption" data-d="ends">{escape(c["ends"])}</p>')

    def workload_controls():
        stops = [(w, s["label"]) for w, s in pub["where_it_runs"].items()]
        return segmented("workload", "Workload", stops, "prompt", 'data-opt="workload"') + measure_html("where")

    def arch_controls():
        stops = [(k, f"{k}. {t}") for k, t in (("A", "Office suite"), ("B", "Video"), ("C", "Shared data"), ("D", "AI compute"))]
        return segmented("comparison", "Comparison", stops, "A", 'data-opt="comparison"') + measure_html("arch")

    def place_strip_block():
        return place_strip(pub)

    blocks = {
        "title:use": lambda: escape(st["title"]),
        "settings:list": lambda: "".join(f'<li>{escape(SETTING_NAMES[n])}: {escape(data["sel"][n]["say"][data["sel"][n]["def"]])}</li>' for n in data["sel"]),
        "qual:ai": lambda: "".join(f"<li>{escape(x)}</li>" for x in pub["qualitative"]["ai_is_not_data_centers"]),
        "project:formula": lambda: f'<p class="x-formula">{escape(pub["project_scale"]["formula"])}</p>',
        "data": lambda: f'<script type="application/json" id="explorer-data">{bp.inline_json(data)}</script>',
        "drawer": lambda: drawer_html(pub, data),
        "controls:use": lambda: measure_html("use") + fields_html(data),
        "plot:use": lambda: wall_html(data, "use", st),
        "detail:use": lambda: detail_html("use", st, data, extra=week_html(st), table=table_for("use")),
        "notes:use": lambda: notes_for(pub, "use", claims, limits),
        "waffle:plot": lambda: waffles_html(claims, limits),
        "waffle:control": lambda: segmented("waffle", "Which figure", [(k, w["label"]) for k, w in WAFFLES.items()], "iea_2025", 'data-opt="waffle"') + '<p class="sr-only" role="status" data-waffle-status></p>',
        "waffle:detail": lambda: waffle_detail(claims, limits),
        "places": place_strip_block,
        "controls:where": workload_controls,
        "plot:where": lambda: "".join(f'<div data-group="workload:{w}">{wall_html(data, "where." + w, st)}</div>' for w in pub["where_it_runs"]),
        "detail:where": lambda: detail_html("where", st, data, table=table_for("where")),
        "notes:where": lambda: notes_for(pub, "where", claims, limits),
        "controls:arch": arch_controls,
        "controls:arch-money": lambda: setting_html(pub, data, "wage", "arch-", why=False) + setting_html(pub, data, "node_already_on", "arch-", why=False),
        "plot:arch": lambda: "".join(f'<div data-group="comparison:{letter}">{wall_html(data, "arch." + letter, st)}</div>' for letter in pub["architectures"]),
        "detail:arch": lambda: detail_html("arch", st, data, extra=arch_words(pub, data, st), table=table_for("arch"), under_reading=arch_pairs(pub, data)),
        "notes:arch": lambda: notes_for(pub, "arch", claims, limits),
        "controls:lever": lambda: measure_html("lever"),
        "plot:lever": lambda: lever_html(data, st),
        "detail:lever": lambda: detail_html("lever", st, data, extra=lever_first(), kind="custom", table=table_for("lever")),
        "notes:lever": lambda: notes_for(pub, "lever", claims, limits),
        "controls:cross": lambda: segmented("crossover", "Comparison", [("prompts", "Prompts"), ("views", "Views")], "prompts", 'data-opt="crossover"'),
        "plot:cross": lambda: cross_html(data, "cross.prompts", st) + cross_html(data, "cross.views", st),
        "detail:cross": lambda: detail_html("cross", st, data, extra=cross_first(), kind="custom", table=table_for("cross")),
        "notes:cross": lambda: notes_for(pub, "cross", claims, limits),
        "controls:catalog": lambda: segmented("scale", "View", [("hour", "By the hour"), ("unit", "By the unit")], "hour", 'data-opt="scale"') + segmented("sort", "Sort within a ruler", [("value", "By value"), ("tag", "By price basis")], "value", 'data-opt="sort"') + measure_html("catalog"),
        "plot:catalog": lambda: f'<div data-group="scale:hour"><p class="ladder-group-label">By the hour, the whole chain</p>{wall_html(data, "catalog.hour", st)}</div><div data-group="scale:unit"><p class="ladder-group-label">By the unit, data center only</p>{ruler_html(data, "catalog.unit", st)}</div>',
        "detail:catalog": lambda: detail_html("catalog", st, data, table=table_for("catalog")),
        "notes:catalog": lambda: notes_for(pub, "catalog", claims, limits),
        "project:cooling": lambda: "".join(f'<button type="button" class="slider-presets-button" data-preset="{v}" data-for="wue">{escape(t)}</button>' for v, t in (
            (pub["inputs"]["wue_local"]["value"], f'Dry, {pub["inputs"]["wue_local"]["value"]:g}'), (pub["inputs"]["wue_site"]["value"], f'Operator average, {pub["inputs"]["wue_site"]["value"]:g}'), (pub["inputs"]["wue_tower"]["value"], f'Cooling tower midpoint, {pub["inputs"]["wue_tower"]["value"]:g}'))),
        "project:grids": lambda: "".join(f'<option value="{v}">{escape(GRID_NAMES.get(o, o))}, {v:g} g per kWh</option>' for o, v in project_grids(pub)),
        "method:disclaimer": lambda: f'<p class="x-disclaimer">{escape(pub["disclaimer"])}</p>',
        "method:backtest": lambda: backtest_html(pub),
        "method:calibration": lambda: calibration_html(pub),
        "method:regression": lambda: regression_html(pub),
        "method:sensitivity": lambda: sensitivity_html(pub),
        "method:version": lambda: f'<p>Model version: schema {pub["schema"]}, built {pub["built"][5:7]}/{pub["built"][8:10]}/{pub["built"][:4]}, prices as of {pub["price_date"]}, inputs hash {data["hash"]}. {len(pub["inputs"])} inputs.</p>',
        "qual:no-number": lambda: "".join(f"<li>{escape(x)}</li>" for x in no_number_words(pub, claims)),
        "admin:note": lambda: admin_html(pub, st),
        "qual:other-side": lambda: "".join(f"<li>{escape(x)}</li>" for x in pub["qualitative"]["on_the_other_side"]),
        "qual:loses": lambda: "".join(f"<li>{escape(x)}</li>" for x in pub["qualitative"]["where_local_or_federated_systems_lose"]),
        "qual:rebound": lambda: f'<p>{escape(pub["qualitative"]["rebound"])}</p>',
    }

    def fill(match):
        name = match["name"]
        if name == "sources":
            return f"{match[1]}{match[4]}"
        if name not in blocks:
            raise BuildError(f"no content for marker {name}")
        return f"{match[1]}{blocks[name]()}{match[4]}"

    missing = sorted(set(blocks) - {m["name"] for m in MARKER.finditer(page)})
    if missing:
        raise BuildError(f"page lacks markers: {missing}")
    filled = MARKER.sub(fill, page)
    filled = POUR.sub(lambda m: f'<span data-m="{m["spec"]}">{st["pours"][m["spec"]]}</span>', filled)
    filled = re.sub(r"(<span data-setting-line>)[^<]*(</span>)", lambda m: m[1] + escape(st["line"]) + m[2], filled)
    check_typed_digits(filled)
    # Linkify the running text, never the data block or the receipts, then write the receipts of what the page names.
    head, sep, tail = filled.partition('<script type="application/json" id="explorer-data">')
    json_block, end, rest = tail.partition("</script>")
    body = linkify(re.sub(r"<a class=\"x-c\" href=\"#src-[^\"]+\">([^<]+)</a>", r"\1", head))
    rest = linkify(re.sub(r"<a class=\"x-c\" href=\"#src-[^\"]+\">([^<]+)</a>", r"\1", rest))
    ids = set(re.findall(r'href="#src-([a-z]+-\d{3})"', body + rest))
    # Row notes in the data block name their claims through the chips above; ids in the block's words must ship too.
    ids |= set(CLAIM.findall(json_block))
    unknown = sorted(i for i in ids if i not in claims)
    if unknown:
        raise BuildError(f"the page names claims that do not ship: {unknown}")
    final = body + sep + json_block + end + rest
    final = MARKER.sub(lambda m: f"{m[1]}{sources_html(ids, claims, limits)}{m[4]}" if m["name"] == "sources" else m[0], final)
    PAGE.write_bytes(final.encode("utf-8"))
    home = HOME.read_text(encoding="utf-8")
    band = band_html(pub, data, st, claims, limits)
    poured = MARKER.sub(lambda m: f"{m[1]}{band}{m[4]}" if m["name"] == "home:band" else m[0], home)
    if "<!-- explorer:home:band -->" not in home:
        raise BuildError("site/index.html lacks the marker explorer:home:band")
    if poured != home:
        HOME.write_bytes(poured.encode("utf-8"))
    return {"page_bytes": len(final.encode("utf-8")), "inline_data_bytes": len(json_block), "claims_on_page": len(ids), "partly": sum(claims[i]["status"] == "partly" for i in ids), "home_band_bytes": len(band.encode("utf-8"))}


def project_grids(pub):
    seen = {}
    for name in ("grid_dc", "grid_local"):
        for option, setting in pub["assumptions"][name]["options"].items():
            seen.setdefault(option, setting[name])
    return list(seen.items())


def week_html(st):
    w = st["weekWords"]
    line = lambda label, key, hidden="": f'<p class="caption x-week-line"{hidden}><span>{label}</span> <strong data-w="{key}">{escape(w[key])}</strong></p>'
    return ('<div class="x-week" data-d="week"><p class="label">This week, across the rows</p>' +
            line("At API list", "list") + line("What platforms earn in those hours; revenue, not a cost", "earned") + line("Seat and storage list", "seat", " hidden") +
            f'<p class="caption x-week-line"><span>CO2e across layers, <span data-w="grids">{escape(w["grids"])}</span></span> <strong data-w="g">{escape(w["g"])}</strong></p>'
            f'<p class="caption x-week-line"><span data-w="cloud-tag">{escape(w["cloud-tag"])}</span> <strong data-w="cloud">{escape(w["cloud"])}</strong></p>'
            f'<p class="caption x-week-line"><span data-w="home-tag">{escape(w["home-tag"])}</span> <strong data-w="home">{escape(w["home"])}</strong></p>'
            '<p class="caption x-check" data-check hidden></p></div>')


BAND_STOPS = (("chat_hour", "Chat", "An hour of chat"), ("video_hour", "Streaming video", "An hour of streaming video"), ("short_hour", "Short video", "An hour of short video"), ("coding_hour", "Agentic coding", "An hour of agentic coding"))


def band_html(pub, data, st, claims, limits):
    """The home page's Explorer band: the Explorer's model at its default settings, poured here, so the home page loads none of it. The figure is energy, so it carries the energy claims."""
    rows = {r["key"]: r for r in pub["catalog"]}
    say = lambda name: data["sel"][name]["say"][data["sel"][name]["def"]]
    radios = "".join(f'<label><input type="radio" name="explorer-band" value="{key}"{" checked" if i == 0 else ""}><span>{escape(stop)}</span></label>' for i, (key, stop, _) in enumerate(BAND_STOPS))
    link = lambda claim_id: f'<a href="explorer/#src-{claim_id}">{claim_id}</a>'
    stops = []
    for key, _, lead in BAND_STOPS:
        f = st["band"][key]
        ids = [claim_id for claim_id in rows[f"catalog.{key}"]["claims"] if not claim_id.startswith("px-")]
        verified = [claim_id for claim_id in ids if claims[claim_id]["status"] != "partly"]
        receipts = ([f'{", ".join(map(link, verified))}: verified against the source.'] if verified else []) + [f'{link(claim_id)}: partly verified. Limit: {escape(limit_of(claim_id, claims, limits))}' for claim_id in ids if claims[claim_id]["status"] == "partly"]
        if f["unit"] != "Wh":
            raise BuildError(f"the home band says watt-hours, and {key} now reads {f['unit']}: rewrite its sentence")
        reading = f'{lead} on a {say("device").lower()} over {say("connection")}, the whole chain from the data center to your screen: about {f["num"]} watt-hours {f["tag"]}, and {f["screen"]} of them go to your own screen and router.'
        stops.append(f'<li data-stop="{key}"><p class="readout"><span class="readout-value">{escape(f["num"])}</span> <span class="explorer-band-unit">{escape(f["unit"])}</span></p>'
                     f'<div class="explorer-band-words"><p class="explorer-band-reading">{escape(reading)}</p><p class="caption">{" ".join(receipts)}</p></div></li>')
    return (f'<div class="explorer-band-about"><h2 id="explorer-band-title">Resource Use Explorer</h2><p>The energy, carbon, water, and price of AI, video, search, and cloud software, at settings you choose. Nothing you enter leaves your browser.</p>'
            f'<p class="caption">Modeled estimates, not measurements, at the Explorer\'s default settings: a bottom-up process model, checked against published figures. A range is a spread, not a confidence interval.</p>'
            f'<p class="explorer-band-link"><a class="button" href="explorer/">Open the Resource Use Explorer</a></p></div>'
            f'<div class="explorer-band-figure"><fieldset class="segmented" hidden><legend>One hour of</legend>{radios}</fieldset><ul class="explorer-band-stops" role="list">{"".join(stops)}</ul><p class="sr-only" role="status" data-band-status></p></div>')


def local_pour(spec, claims, pub):
    """Pours the page's code cannot see: a claim's own field, or a figure from the published file."""
    body, _, fmt = spec.partition("|")
    head, _, rest = body.partition(":")
    if head == "cl":
        claim_id, field = rest.split(":")
        value = claims[claim_id][field]
    else:
        value = pub
        for part in rest.split("."):
            value = value[part]
    return num(value * 100) if fmt == "pct" else f"{value:,g}"


def main():
    try:
        print(json.dumps(build()))
    except BuildError as error:
        print(f"FAILED: {error}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
