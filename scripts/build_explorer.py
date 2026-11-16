"""Pour the Resource Use Explorer page from site/data/resource-model.json. Run scripts/resource_model.py --export first; scripts/build_home.py pours the home page.

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
SOURCES = vp.SITE / "explorer" / "sources" / "index.html"  # its receipts, by source document, between its explorer:sources markers; its method and each plate's notes
# Each plate's element id, which its collar, its Sources section, and the address use; data-plate-x keeps the short name the model's boards use.
PLATE_IDS = {"use": "your-use", "catalog": "catalog", "building": "not-the-building", "where": "where-it-runs", "arch": "architectures", "cross": "crossovers", "lever": "levers", "project": "project-scale"}
TABLED = ("use", "catalog", "where", "arch", "cross", "lever")  # the plates with a Table, so a CSV
MODEL = vp.SITE / "data" / "resource-model.json"
LIMITS = bp.EVIDENCE / "claim-limits.json"
MARKER = re.compile(r"(<!-- explorer:(?P<name>[\w:.-]+) -->)(.*?)(<!-- /explorer:(?P=name) -->)", re.S)
POUR = re.compile(r'<span data-m="(?P<spec>[^"]+)">[^<]*</span>')
CLAIM = vp.CLAIM_ID
MS = ("wh", "usd", "g", "ml")

SAY = {
    "device": {"phone": "Phone", "laptop": "Laptop", "tv": "Television"},
    "connection": {"wifi": "Wi-Fi", "cellular": "cellular"},
    "network_mode": {"average": "average network accounting", "marginal": "marginal network accounting"},
    "router_allocation": {"by_time": "router by time", "by_data": "router by data", "excluded": "router excluded"},
    "chat_kind": {"short_text": "median text prompt", "medium_prompt": "medium prompt", "reasoning": "long reasoning query", "high_reasoning": "high reasoning query"},
    "video_dc_intensity": {"measured_delivery": "measured delivery intensity", "desnz_followup": "DESNZ follow-up intensity", "top_down": "top-down average intensity, an illustrative scenario"},
    "dc_generation_water": {"us": "US generation average", "ercot": "ERCOT generation average"},
    "hydro_convention": {"columbia": "Columbia convention", "excluded": "reservoir evaporation excluded", "primary_purpose": "primary-purpose convention"},
    "hydro_share": {"nwpp": "NWPP hydro share", "bpa": "BPA hydro share"},
    "tariff": {"wa_commercial": "Washington commercial tariff", "or_commercial": "Oregon commercial tariff", "wa_residential": "Washington residential tariff",
               "us_residential": "US residential tariff", "us_industrial": "US industrial tariff", "bpa_wholesale": "BPA wholesale tariff"},
    "node_already_on": {"no": "node not on", "yes": "node already on"},
}
GRID_NAMES = {"us": "US grid", "us_nonbaseload": "US non-baseload", "nwpp": "Northwest grid (NWPP)", "bpa": "bought from BPA, regulator-assigned factor", "wa": "Washington in-state", "nw_short_run_margin": "Northwest short-run margin",
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
LINE = ["device", "connection", "router_allocation", "grid_dc", "grid_home", "hydro_convention", "wage", "node_already_on"]  # print, the CSV and Copy
BAR_LINE = ["device", "connection", "grid_dc", "grid_home"]  # the scenario bar names only these, and any setting a reader moved (explorer-35); Fine-tune holds the rest
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
    "exit_tb": "terabytes to move", "exit_admin_h": "paid hours to run the move, per copy", "exit_other_usd": "any other one-time bill", "exit_node_copies": "copies on the Nation's node", "exit_fed_pulls": "pulls the store bills, federated set",
    "exit_link_mbps": "the Nation's link speed", "p_b2_egress": "B2 egress list price", "whole_service_kg_tb": "whole-service storage footprint per TB-year",
}
WORDS = {
    "price": {"api_list": "API list", "seat_list": "seat list", "self_run": "self-run, at cost", "revenue_standin": "platform revenue, not a cost", "paid_subscription": "paid plan", "none": "no price here"},
    "priceLong": {"api_list": "at API list", "seat_list": "at seat list", "self_run": "self-run, at cost with no margin", "revenue_standin": "what the platform earns; revenue, not a cost", "paid_subscription": "paid plan; falls with use", "none": "no price in this view"},
    "heads": {"api_list": "API list", "seat_list": "Seat list", "self_run": "Self-run, at cost", "revenue_standin": "Platform revenue: revenue, not a cost", "paid_subscription": "Paid plan", "none": "No price here"},
    "basin": {"dc": "data center basin, not stated", "cloud": "data center basin, not stated", "fixed": "data center basin, not stated", "home": "home basin", "local": "the node's basin", "colo": "the colocation's basin", "hydro": "the node's declared hydro feed"},
    "layer": {"dev": "Your device", "rou": "Home router", "net": "Network", "dc": "Data center or node"},
    "measure": {"wh": "energy", "usd": "price", "g": "CO2e", "ml": "water"},
    "order": ["api_list", "seat_list", "self_run", "revenue_standin", "paid_subscription", "none"],
    "off": "runs off this ruler",
    "orNever": "or never",
    "leaves": "Rows that leave, each with why it does not meet the rule",  # over the list under the plate
    "ghost": "leaves at this rule",  # a row the custody rule removes keeps its place on the plot, with no mark
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
    "chat": ("The data center and network terms of each prompt. No device or router term, so time is counted once.", ["fp-001", "fp-017", "fp-134", "fp-127", "px-003", "px-004"], "A median prompt: any count times it is an illustration, not a bound, and the mean-class prompt prints in the catalog. The kind of chat moves this row most."),
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
    "views_desnz_same_network": ("Local box beats the platform's serving energy, DESNZ follow-up intensity, same network", ["sf-042", "lf-033", "fp-141", "fp-142"], "The DESNZ follow-up's serving intensity sits below the measured one, so the stream's own watts stay above it. Only the top-down average, an allocation scenario, would reach them."),
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
    # On energy, carbon, and water the store changes nothing, so S3 stands for all three and the head says so; only the price needs every store.
    "E": dict(energy=["move_s3_node", "move_s3_federated", "year_s3", "year_node", "year_federated"],
              price=["move_s3_node", "move_r2_node", "move_b2_node", "move_s3_federated", "move_r2_federated", "move_b2_federated", "year_s3", "year_r2", "year_b2", "year_node", "year_federated"],
              grid=["move_s3_node", "move_s3_federated", "year_cloud_same_grid", "year_node", "year_federated"]),
}
COMPARISONS = {"A": "Office suite", "B": "Video", "C": "Shared data", "D": "AI compute", "E": "Leaving a cloud"}
# A move row is one time and a year row is one year, so they never stand in one list.
EXIT_GROUPS = (
    {"id": "move", "stem": "move_", "heads": {"wh": "The move, one time. The energy is the same from R2 or B2: free egress is a price, not zero energy.", "usd": "The move, one time. Each price is list egress plus the assumed hours.",
                                              "g": "The move, one time, on the network's grid.", "ml": "The move, one time, on the network's grid.",
                                              "g_words": "The move, one time, on the network's grid: no bar, since the year rows sit on one grid.",
                                              "ml_words": "The move, one time, on the network's grid: no bar, since the year rows sit on one grid."}},
    {"id": "year", "stem": "year_", "heads": {"wh": "A year of holding the data. The cloud's figure is drives only, and the same on R2 and B2.", "usd": "A year of holding the data. Each row names its price basis.",
                                              "g": "A year of holding the data, on one grid.", "ml": "A year of holding the data, on one grid.",
                                              "g_words": "A year of holding the data: no bar, since fewer than two of these rows sit on one grid.",
                                              "ml_words": "A year of holding the data: no bar, since fewer than two of these rows sit on one grid."}},
)
AI_GROUPS = (("dc", "In a data center", ("hyper", "colo")), ("node", "On a community node", ("node_",)), ("device", "On your own devices", ("laptop", "phone")))
EXIT_MOVE_PRICE = "list egress plus assumed hours"  # the move group's price head says this once, so each move row prints its price on one line
PAYBACKS = {"node_vs_s3": "One copy on the Nation's node, against S3", "node_vs_r2": "Against R2", "node_vs_b2": "Against B2", "federated_vs_s3": "Three copies across Nations' nodes, against S3", "federated_vs_r2": "Against R2", "federated_vs_b2": "Against B2"}
REPO = "https://github.com/atniclimate/atni-task-force/blob/main/"  # docs/ and scripts/ are not served with site/, so the page links to them in the public repository
TYPED_INPUTS = ["cloud_admin_h_month", "exit_tb", "exit_admin_h", "exit_other_usd"]  # the model inputs a field on the page takes, and so a scenario file may carry
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
    """As the page's num: two significant figures, three at 100 and above, and no trailing zero."""
    if not v:
        return "0"
    if abs(v) >= 99.5:
        return f"{float(f'{v:.{(d or 3) - 1}e}'):,.12g}"
    text = format(Decimal(f"{v:.{(d or 2) - 1}e}"), "f")
    return text.rstrip("0").rstrip(".") if "." in text else text


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
        "arch.E.year_s3": "Stay a year in S3", "arch.E.year_r2": "Stay a year in R2", "arch.E.year_b2": "Stay a year in B2", "arch.E.year_cloud_same_grid": "Stay a year, on the node's grid",
        "arch.E.year_node": "A year, one copy on the Nation's node", "arch.E.year_federated": "A year, three copies across Nations' nodes",
    }
    for store, name in (("s3", "S3"), ("r2", "R2"), ("b2", "B2")):
        out[f"arch.E.move_{store}_node"] = f"Move, {name} to the Nation's node"
        out[f"arch.E.move_{store}_federated"] = f"Move, {name} to a federated set"
    for v in views:
        out[f"arch.B.local_{v}"] = f"Local box, {v:,} views a year"
    for name, n in zip(("node_100k", "node_1m"), node):
        out[f"arch.D.{name}"] = f"Node, {n:,} prompts a year"
        out[f"arch.D.{name}_hydro"] = f"Scenario: node, {n:,}, declared hydro feed"
        out[f"arch.D.{name}_fallback"] = f"Node, {n:,}, with cloud fallback"
    return out


UNIT_WORDS = {"hour": "per hour", "prompt": "per prompt", "session": "per session", "image": "per image", "clip": "per clip", "query": "per query", "seat-month": "per seat-month", "hour-view": "per hour-view", "one unit of the work": "per unit of this work", "one time": "one time"}


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
        rows["lever." + lever["key"]] = {"label": lever["label"] + upper, "unit": lever.get("reference", ""), "pb": lever["before"]["price_usd"]["basis"], "note": "note-lever-" + lever["key"],
                                         **({"bound": True} if upper else {})}  # an upper bound or a scenario never heads the Savings answer
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
        if key.startswith("arch.E.move_"):
            r["pt"] = EXIT_MOVE_PRICE
    return rows


def boards(pub):
    out = {"use": {"kind": "wall", "rows": ["use." + k for k in USE_ROWS]}}
    for w, spec in pub["where_it_runs"].items():
        out["where." + w] = {"kind": "wall", "rows": [r["key"] for r in spec["places"].values()], "label": spec["label"]}  # the Where answer names the workload
    for letter, spec in pub["architectures"].items():
        prefix = f"arch.{letter}."
        lists = ARCH[letter]
        board = {"kind": "wall", "rows": [r["key"] for r in spec["options"]]}
        for name, keys in lists.items():
            board[name] = [prefix + k for k in keys]
        board.setdefault("price", board["energy"])
        board.setdefault("grid", board["energy"])
        if letter in ("C", "E"):
            board["plain"] = True
        if letter == "E":
            board["head"] = "One time for a move, one year for a year row; stored data has no hour"
            board["groups"] = [{"id": g["id"], "heads": g["heads"], "rows": [k for k in board["rows"] if k.startswith(prefix + g["stem"])]} for g in EXIT_GROUPS]
        if letter == "D":  # thirteen rows read as three places (explorer-13)
            board["groups"] = [{"id": gid, "heads": {m: head for m in MS}, "rows": [k for k in board["rows"] if k.split(".")[-1].startswith(stems)]} for gid, head, stems in AI_GROUPS]
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


PARAMS = bp.EVIDENCE / "resource-model-params.json"  # the model's own parameters, where each setting's option names the input it reads
FACTOR_SELECTORS = ("grid_dc", "grid_home", "grid_local", "grid_colo", "dc_generation_water", "hydro_convention", "hydro_share")
FACTOR_INPUTS = ("grid_hydro", "wue_site", "wue_local", "gas_water")


def factor_claims(pub):
    """The claims behind each grid and water factor a CO2e or water figure is multiplied by, per setting option, so resource-model.js V.factorClaims can name them for
    any row at any setting (explorer-03 hard line). An option that reads no claimed input fails the build."""
    params = json.loads(PARAMS.read_text(encoding="utf-8"))["selectors"]
    sel = {}
    for name in FACTOR_SELECTORS:
        if set(params[name]["options"]) != set(pub["assumptions"][name]["options"]):
            raise BuildError(f"{name}: the parameters and the published model list different options")
        sel[name] = {}
        for option, setting in params[name]["options"].items():
            ids = [c for v in setting.values() if isinstance(v, str) and v.startswith("@") for c in pub["inputs"][v[1:]]["claims"]]
            if not ids:
                raise BuildError(f"{name}={option} reads no input with a claim")
            sel[name][option] = list(dict.fromkeys(ids))
    return {"sel": sel, "in": {k: pub["inputs"][k]["claims"] for k in FACTOR_INPUTS}}


def inline_data(pub):
    sel = {}
    for name, spec in pub["assumptions"].items():
        sel[name] = {"def": spec["default"], "opts": spec["options"], "say": {o: say_of(name, o, setting) for o, setting in spec["options"].items()}}
    swept = [k for k, v in pub["inputs"].items() if v["low"] != v["value"] or v["high"] != v["value"]]
    names = {k: INPUT_NAMES.get(k) or pub["inputs"][k]["unit"] for k in swept}
    names.update(SETTING_NAMES, exit_tb=INPUT_NAMES["exit_tb"])  # exit_tb is typed, though nothing sweeps it
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
    custody = pub["custody"]
    return {
        "schema": 1, "tier": "T0", "built": pub["built"], "price_date": pub["price_date"],
        "custody": {k: custody[k] for k in ("label", "default", "options", "fixed_line", "reasons", "cost_labels", "rows")}, "comparisons": COMPARISONS, "typed": TYPED_INPUTS,
        "measured": {"label": pub["measured"]["label"], "inputs": {k: {**rule, "claims": pub["inputs"][k]["claims"]} for k, rule in pub["measured"]["inputs"].items()}},
        **({"carbon_damage": pub["carbon_damage"]} if "carbon_damage" in pub else {}),  # the damage layer lifts out with the model's own block
        "hash": hashlib.sha256(json.dumps(inputs, sort_keys=True).encode()).hexdigest()[:8],
        "inputs": inputs, "sel": sel, "scenario": pub["scenario"], "from_sel": pub["scenario_from_selectors"], "names": names, "words": WORDS, "line": LINE, "bar": BAR_LINE, "fields": fields,
        "input_claims": {k: pub["inputs"][k]["claims"] for k in swept if pub["inputs"][k]["claims"]},  # what moves it most names each range's claims; the build ships their receipts
        "rows": row_meta(pub), "boards": boards(pub), "check": check, "factor_claims": factor_claims(pub),
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


def label_html(data, key, st):
    """A row's label, with its tag under it where it has one: a Catalog row's price basis."""
    tag = st["tags"].get(key)
    return f'<span class="ladder-label">{escape(label_text(data, key, st))}{f"""<span class="ladder-tag">{escape(tag)}</span>""" if tag else ""}</span>'


LEFT_TICK = re.compile(r" \S+, your side$")


def axis_html(ticks, plain, wall=0.0):
    """The wall is the zero, and one step runs out both ways (explorer-16): the zero is printed once at the wall, a left tick is the bare figure, and the far
    right tick carries the unit; the head's words and arrows say which way each side runs. Left ticks stand in a box as wide as the left side, and a container
    query drops them when it is narrow, with scripts or without; the box's words stand in for them. explorer.js axisInto writes the same."""
    span = lambda t: f'<span style="--x:{t["x"]:.4f}">{escape(LEFT_TICK.sub("", t["t"]) if t.get("left") else t["t"])}</span>'
    left = "".join(span(t) for t in ticks if t.get("left"))
    zero = "" if plain else f'<span class="wall-zero" style="--x:{wall:.4f}">0</span>'
    return ("" if plain else f'<div class="wall-axis-left">{left}<i>One scale, both ways</i></div>') + zero + "".join(span(t) for t in ticks if not t.get("left"))


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
    needle = f'<i class="wall-needle" style="left:{pct(item["end"])}"></i>' if item else ""
    hidden = "" if shown else " hidden"
    return (f'<li class="wall-row" id="{row_id(key)}" data-row="{attr(key)}"{hidden}>{label_html(data, key, st)}'
            f'<span class="wall-track">{"".join(segment(t, item) for t in ("dev", "rou", "net", "dc"))}{range_html}{needle}</span>'
            f'<span class="ladder-value">{value_html(cell)}</span></li>')


def wall_html(data, board, st):
    spec = data["boards"][board]
    layout = st["walls"][board]
    visible = set(spec.get("energy", spec["rows"])) - ({"use.seat"} if board == "use" else set())
    phases = {g["rows"][0]: f'<li class="wall-group" data-phase="{g["id"]}">{escape(g["heads"]["wh"])}</li>' for g in spec.get("groups", [])}
    rows = "".join(phases.get(key, "") + wall_row(data, key, st, layout, key in visible) for key in spec["rows"])
    plain = " is-plain" if spec.get("plain") else ""
    # The needle's name (explorer-17) stands over the plot at the selected row's end; explorer.js writes it, so the page without scripts selects nothing.
    needle = '<span class="wall-needle-label" data-js hidden></span>'
    side = (f'<p class="wall-head" aria-hidden="true"><span></span><span class="wall-sides">{needle}<span>Your side, by time</span><span>Beyond the wall, by count</span></span><span></span></p>'
            if not spec.get("plain") else f'<p class="wall-head" aria-hidden="true"><span></span><span class="wall-sides">{needle}<span></span><span>{escape(spec.get("head", "One year of holding the data; stored data has no hour"))}</span></span><span></span></p>')
    note = '<p class="caption wall-gridnote" hidden></p>' if board.startswith("arch.") else ""
    off = any((layout["items"].get(key) or {}).get("range", [0, 0, ""])[2] for key in visible)
    # The ruler says this once, under its own axis; the row prints the whole spread in words.
    caption = f'<p class="caption wall-off" aria-hidden="true"{"" if off else " hidden"}>An open end {escape(WORDS["off"])}; the row prints the whole spread.</p>'
    # How to read a two-sided Wall, once, under the head's two sides and above the first row (explorer-34).
    words = "" if spec.get("plain") else f'<p class="caption wall-words">{escape(WALL_WORDS)}</p>'
    return (f'<div class="wall{plain}" data-board="{attr(board)}" data-measure="wh" style="--wall:{layout["wall"]:.4f}">{side}{words}<ol class="wall-rows">{rows}</ol>'
            f'<div class="wall-axis" aria-hidden="true">{axis_html(layout["ticks"], spec.get("plain"), layout["wall"])}</div>{caption}{note}{key_html(spec.get("plain"))}</div>')


WALL_WORDS = "The wall is zero; one scale runs out both ways."
SPREAD_WORDS = "Spread, not a confidence interval. To test a limit, such as a budget or a line's capacity, read the high end."  # beside the key, so the bar is one line


def key_html(plain=False):
    """Each layer's swatch beside its own word (explorer-27), never repainted by the selection, by side on a two-sided Wall (explorer-26, -32); then the spread."""
    sq = lambda tag, word: f'<span class="plate-square w-key-{tag}"></span>{escape(word)}'  # noqa: E731
    if plain:
        sides = "".join(f'<li>{sq(t, WORDS["layer"][t])}</li>' for t in ("dev", "rou", "net", "dc"))
    else:
        sides = (f'<li class="wall-key-side">Your side: {sq("dev", "device")}, {sq("rou", "router")}</li>'
                 f'<li class="wall-key-side">Beyond the wall: {sq("net", "network")}, {sq("dc", "data center or node")}</li>')
    return f'<ul class="wall-key" aria-label="Key">{sides}<li class="wall-key-spread"><span class="wall-key-range"></span>{escape(SPREAD_WORDS)}</li></ul>'


def ruler_html(data, board, st):
    spec = data["boards"][board]
    lay = st["rulers"][board]
    rows = []
    for key in spec["rows"]:
        item = lay["items"].get(key, {})
        style = f'--x:{item["x"]:.4f}' + (f';--lo:{item["lo"]:.4f};--hi:{item["hi"]:.4f}' if item.get("lo") is not None and item.get("hi") is not None else "") if item else ""
        has_range = item.get("lo") is not None and item.get("hi") is not None and item["hi"] > item["lo"]
        rows.append(f'<li class="ladder-row" id="{row_id(key)}" data-row="{attr(key)}" style="{style}">{label_html(data, key, st)}'
                    f'<span class="ladder-track"><span class="ladder-range"{"" if has_range else " hidden"}></span><span class="ladder-mark"></span></span><span class="ladder-value">{value_html(st["cells"][key])}</span></li>')
    grid = "".join(f'<i style="--x:{t["x"]:.4f}"></i>' for t in lay["ticks"])
    axis = "".join(f'<span style="--x:{t["x"]:.4f}">{escape(t["t"])}</span>' for t in lay["ticks"])
    key = f'<ul class="wall-key" aria-label="Key"><li class="wall-key-spread"><span class="wall-key-range"></span>{escape(SPREAD_WORDS)}</li></ul>'
    return f'<div class="ladder x-ruler" data-board="{attr(board)}" data-measure="wh"><div class="ladder-grid">{grid}</div><ol class="ladder-rows">{"".join(rows)}</ol><div class="ladder-axis" aria-hidden="true">{axis}</div></div>{key}'


LEVER_TOP = 1.25  # the levers share one scale, 0 to 125 percent of before (explorer-18); explorer.js LEVER_TOP is the same


def lever_html(data, st):
    """Every lever on one scale, after as a share of before: each bar runs from the before line at 100 percent to after, a saving leftward, an outlined bar past
    the line where after is more, and one past the scale's end fades out and prints its figure. explorer.js paintLevers draws the same."""
    rows = []
    for key in data["boards"]["lever"]["rows"]:
        r = st["levers"][key]["wh"]
        ratio = r["ratio"]
        cls = (" is-up" if ratio is not None and ratio > 1 else "") + (" is-off" if ratio is not None and ratio > LEVER_TOP else "")
        style = f' style="--x:{min(ratio, LEVER_TOP) / LEVER_TOP:.4f};--z:{1 / LEVER_TOP:.4f}"' if ratio is not None else f' style="--z:{1 / LEVER_TOP:.4f}"'
        bar = f'<span class="ladder-bar{" is-hollow" if ratio is not None and ratio > 1 else ""}"{"" if ratio is not None else " hidden"}></span>'
        rows.append(f'<li class="ladder-row x-lever{cls}" id="{row_id(key)}" data-row="{attr(key)}"{style}><span class="ladder-label">{escape(data["rows"][key]["label"])}</span>'
                    f'<span class="ladder-track">{bar}</span><span class="ladder-value">{value_html(lever_value(r))}</span></li>')
    ticks = [(t / 100 / LEVER_TOP, str(t)) for t in (0, 25, 50, 75, 100, 125)]  # percent of before; the note and each row say so
    zero = ' class="is-zero"'  # the before line
    grid = "".join(f'<i{zero if label == "100" else ""} style="--x:{x:.4f}"></i>' for x, label in ticks)
    axis = "".join(f'<span style="--x:{x:.4f}">{label}</span>' for x, label in ticks)
    return (f'<div class="ladder x-ruler" data-board="lever" data-measure="wh"><div class="ladder-grid">{grid}</div><ol class="ladder-rows">{"".join(rows)}</ol><div class="ladder-axis" aria-hidden="true">{axis}</div></div>'
            '<p class="caption x-lever-note">One scale for every lever, in percent of before: each bar runs from before, the line at 100, to after. A bar left of the line is a saving; an outlined bar right of it is more than before.</p>'
            '<ul class="wall-key" aria-label="Key"><li><span class="x-key-line"></span>Before, 100 percent</li><li><span class="plate-square"></span>After, a saving</li><li><span class="plate-square is-hollow"></span>After, more than before</li></ul>')


def lever_value(r):
    """A lever's figure in words (explorer-18): after as a share of before, then the two figures. explorer.js leverCell writes the same."""
    if not r.get("pct_text"):
        return {"num": "no figure", "unit": "", "tag": f'({r["before_text"]} then {r["after_text"]})'}
    return {"num": r["pct_text"], "unit": "percent of before", "tag": f'({r["before_text"]} to {r["after_text"]})'}


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


def disclaimer_html(words_):
    """The first sentence in bold, the rest as body, every word verbatim."""
    first, _, rest = words_.partition(". ")
    return f'<p class="x-disclaimer"><strong>{escape(first)}.</strong> {escape(rest)}</p>'


def project_example(pub, claims, limits):
    """The one button on a blank panel, and its sentence: the Data Centers plate's defaults, the operator-average preset, and the region's load in the field's own unit. It picks no feed: that is the reader's. All poured."""
    controls = {c["name"]: c for c in json.loads((vp.SITE / "data" / "plates" / "dc-project.json").read_text(encoding="utf-8"))["controls"]}
    region = claims["dem-058"]
    if region["unit"] != "aMW":
        raise BuildError(f"the example's load is in aMW and dem-058 now reads {region['unit']}: rewrite it")
    mw, lf, wue, load = controls["p_mw"]["default"], controls["p_lf"]["default"], pub["inputs"]["wue_site"]["value"], region["value"] * 8760
    button = f'<button type="button" class="button" data-example data-mw="{mw:g}" data-lf="{lf:g}" data-wue="{wue:g}" data-load="{load:.0f}">Try the Data Centers example: {mw:g} MW at {lf:g}</button>'
    note = (f'<p class="caption x-start" data-js hidden>The example is the project plate on the Data Centers page at its defaults, an illustration and not a proposal: {mw:g} MW at a load factor of {lf:g}. Site water is the operator average (tr-009). '
            f'The load is the region\'s {region["value"]:,g} aMW, which is {load:,.0f} MWh a year at 8,760 hours. {claim_words(["dem-058"], claims, limits, str)} It picks no feed, so CO2e waits for you to choose one.</p>')
    return button, note


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
    """Fine-tune's body (DIRECTION-R2, the Explorer): headed groups, each setting with its reason, then the files, the reader's own readings, and the damage layer."""
    groups = "".join(f'<section class="x-fine-group" aria-labelledby="fine-{i}"><h3 id="fine-{i}">{escape(title)}</h3>{"".join(setting_html(pub, data, n) for n in names)}</section>' for i, (title, names) in enumerate(DRAWER))
    files = ('<section class="x-fine-group" aria-labelledby="fine-files"><h3 id="fine-files">Files</h3>'
             '<p data-js><button type="button" class="button button-secondary" data-outputs>Save outputs.csv at these settings</button></p>'
             f'{scenario_html()}</section>')
    return (f'<p class="caption">Each setting reaches every tab, and all but wage and tariff reach the address bar, so a shared link cannot carry a Nation\'s figures.</p>'
            f'{groups}{files}{readings_html(pub)}{damage_html(pub)}')


def scenario_html():
    """Save and load a scenario file on the reader's own machine. The warning's words live in resource-model.js, one place, and explorer.js fills them."""
    return ('<div class="x-scenario" data-js hidden><div class="x-scenario-actions"><button type="button" class="button button-secondary" data-scenario-save>Save a scenario file</button>'
            '<label class="button button-secondary x-file">Load a scenario file<input type="file" accept=".json,application/json" data-scenario-load></label></div>'
            '<div class="x-scenario-warn" id="scenario-warning" data-scenario-warn hidden><p><strong data-scenario-warning></strong> It saves to this machine and nowhere else: this page sends nothing anywhere. Keep it where you would keep those figures.</p>'
            '<div class="x-scenario-actions"><button type="button" class="button" data-scenario-confirm aria-describedby="scenario-warning">Save the file</button><button type="button" class="button button-secondary" data-scenario-cancel>Cancel</button></div></div>'
            '<div class="caption x-scenario-status" role="status" data-scenario-status></div></div>')


def readings_html(pub):
    """One line for each input a reader can measure: its name, the model's figure with its spread and claims, and the field beside it. The list prints without scripts; the field waits on one."""
    rows = []
    for key, rule in pub["measured"]["inputs"].items():
        spec = pub["inputs"][key]
        spread = f' ({spec["low"]:g} to {spec["high"]:g})' if spec["low"] != spec["high"] else ""
        claims = ", ".join(spec["claims"]) or "no source, an assumption"
        rows.append(f'<li class="x-reading"><label for="m-{key}">{escape(rule["label"])}, {escape(rule["unit"])}</label>'
                    f'<input id="m-{key}" type="number" min="{rule["min"]:g}" max="{rule["max"]:g}" step="any" inputmode="decimal" data-measured="{key}" data-js hidden>'
                    f'<span class="caption">Model {spec["value"]:g}{spread}; {claims}. <code>{key}</code></span></li>')
    return (f'<h3 id="readings" tabindex="-1">Your Own Readings</h3><p class="caption">A reading you took yourself stands in for the model\'s figure for as long as this page stays open. Every row it moves carries the label &ldquo;{escape(pub["measured"]["label"])}&rdquo;, '
            f'through Copy Reading, print, and CSV. It never enters the address or the claims record, and these readings never leave your machine through this site. <a href="{REPO}docs/FIELD-PROTOCOL.md">How to take a reading</a>; <a href="{REPO}scripts/fit_idle.py">the fit script</a>.</p>'
            f'<div class="caption x-reading-status" role="status" data-measured-why></div><button type="button" class="button button-secondary" data-clear-measured hidden>Clear my readings</button><ul class="x-readings-list">{"".join(rows)}</ul>')


def damage_html(pub):
    """The carbon damage control, default off. It lifts out with the model's own block."""
    spec = pub.get("carbon_damage")
    if not spec:
        return ""
    options = "".join(f'<option value="{attr(k)}">{escape(f["label"])}</option>' for k, f in spec["families"].items())
    return (f'<h3>Illustrative Carbon Damage</h3><p class="caption">{escape(spec["federal_status"])} {escape(spec["never"])} {escape(spec["tonnes_first"])}</p>'
            f'<div class="x-field" data-js hidden><label for="damage">{escape(spec["label"])}</label><select id="damage" data-damage><option value="off" selected>Off</option>{options}</select></div>')


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
FIELD_NAMES = {"social": "Instagram or TikTok.", "streaming": "Netflix or YouTube."}  # the rows name the unit; the fields name the platforms
FIRST_FIELDS = ("screen", "chat", "coding", "streaming")  # the four that move the number most; the others wait under More inputs


def count_words(n, one, many):
    return f"{n:,} {one if n == 1 else many}"


def fields_html(data):
    f = data["fields"]

    def cell(key):
        label, why = FIELD_WORDS[key]
        platform = f'<span class="caption">{escape(FIELD_NAMES[key])}</span>' if key in FIELD_NAMES else ""
        top = ' max="168"' if key == "screen" else ""  # a week has 168 hours (explorer-10); explorer.js FIELD_TOP holds the same
        return f'<div class="x-field"><label for="f-{key}">{escape(label)}</label><input id="f-{key}" type="number" min="0"{top} step="any" inputmode="decimal" value="{f[key]}" data-field="{key}" data-why-text="{attr(why)}">{platform}</div>'

    seats = data["scenario"]["office_users"]
    first = (f'<div class="x-field" data-office hidden><label for="f-seats">Staff seats</label><input id="f-seats" type="number" min="1" step="1" inputmode="numeric" value="{seats}" data-field="seats" data-why-text="Office mode multiplies every field by the seats, then adds the seat row at seat list."></div>' +
             "".join(cell(k) for k in FIRST_FIELDS))
    rest = "".join(cell(k) for k in FIELD_WORDS if k not in FIRST_FIELDS)
    say_first = ", ".join((count_words(f["screen"], "screen hour", "screen hours"), count_words(f["chat"], "prompt", "prompts"), count_words(f["coding"], "coding hour", "coding hours"), count_words(f["streaming"], "streaming hour", "streaming hours")))
    say_rest = ", ".join((count_words(f["images"], "image", "images"), count_words(f["clips"], "clip", "clips"), count_words(f["searches"], "search", "searches"), count_words(f["social"], "social video hour", "social video hours"), f'{f["gb"]:,} GB stored'))
    # A typed count out of bounds is set to its nearer end, and this line says so and describes the field until it is typed in again (explorer-10).
    return (f'<div class="x-fields">{first}</div><p class="caption x-defaults">Defaults: {escape(say_first)}</p><p class="caption x-why" data-why role="status"></p>'
            '<p class="caption x-clamp" id="clamp-use" aria-live="polite" hidden></p>'
            f'<details class="plate-more x-more-inputs" open><summary>More inputs</summary><div class="x-fields">{rest}</div><p class="caption x-defaults">Defaults: {escape(say_rest)}</p>'
            f'<p class="caption x-start">A starting point: one hour of each activity in a week at the model\'s rates. Change any field.</p></details>')


def big_html(f):
    return f'<span>{escape(f["num"])}</span> <span class="x-big-unit">{escape(f["unit"])}</span>'


def readout_html(value, unit, qual, marks=True):
    """The figure and its unit on one line, what it counts under them; the same on every tab. The waffle's readouts are not live, so they carry no data-d."""
    mark = (lambda name: f' data-d="{name}"') if marks else (lambda name: "")
    long_value = " is-long" if len(value) >= 9 else ""
    return (f'<p class="readout{long_value}" style="--chars:{max(1, len(value))}"><span class="readout-value"{mark("value")}>{escape(value)}</span> <span class="x-unit"{mark("unit")}>{escape(unit)}</span>'
            f'<span class="readout-unit"{mark("qual")}>{escape(qual)}</span></p>')


def price_word(data, key):
    """The price's basis in few words, beside its figure. The dated long form waits under How this is modeled."""
    row = data["rows"][key]
    return row.get("pt") or (WORDS["price"][row["pb"]] if row["pb"] != "none" else row.get("pn") or WORDS["price"]["none"])


def basin_word(tag):
    """A water figure's basin without its convention: the model writes them as "basin, convention", and the convention has no comma."""
    return tag.rsplit(",", 1)[0]


MEASURE_LINE = '<p class="caption x-measure-now" data-js>Measure: <b data-measure-word>Energy</b> <a href="#scenario" data-to-measure>Change the measure</a></p>'
BAR = ('<div class="plate-bar" data-js><div class="plate-views" role="group" aria-label="View">'
       '<button type="button" data-view="chart" aria-pressed="true">Chart</button><button type="button" data-view="table" aria-pressed="false">Table</button></div></div>')


def table_view_html(table, table_extra=""):
    """The Table: with scripts it takes the plot's and the window's place when pressed (the kit's Chart and Table); without, it stands under the window, whole."""
    return f'<p class="label">Table</p>{table_extra}<div class="table-scroll" tabindex="0" role="group" aria-label="Table, scrolls sideways">{table}</div>'


def detail_html(name, st, data, extra="", kind="row", modeled="", lead=""):
    """The window: the measure it shows, the readout and its companions, the Reading, the evidence for the selected row with its card, what moves it most and how it
    is modeled (folded), then Copy reading and Back to the starting point. extra is the custom kinds' readout and Reading; lead stands under the Reading, on the
    first screen; modeled joins How this is modeled. The Table and the collar are the plate's own zones, beside this one."""
    d = st["details"].get(name) if kind == "row" else None
    if kind == "row":
        key = data["first"][name]
        water = "".join(f'<span class="x-figure"><strong class="x-big">{big_html(w)}</strong><span class="caption">{escape(basin_word(w["tag"]))}</span></span>' for w in d["water"])
        layers = "".join(f'<li><span class="plate-square w-key-{x["tag"]}{"" if x["on"] else " is-hollow"}"></span><strong>{escape(x["text"])}</strong><span>{escape(x["label"])}</span></li>' for x in d["layers"])
        body = (readout_html(d["value"], d["unit"], d["qual"]) +
                # The other measures, small: the one the page-wide measure shows is the readout, so it steps aside here (explorer.js, data-fig).
                f'<div class="x-measures"><div class="x-figure" data-fig="wh" hidden><strong class="x-big" data-d="energy">{big_html(d["energy"])}</strong><span class="caption">energy</span></div>'
                f'<div class="x-figure" data-fig="usd"><strong class="x-big" data-d="price">{escape(d["price"])}</strong><span class="caption" data-d="price-word">{escape(price_word(data, key))}</span></div>'
                f'<div class="x-figure" data-fig="g"><strong class="x-big" data-d="co2">{big_html(d["co2"])}</strong><span class="caption">location-based</span></div>'
                f'<div class="x-water" data-d="water" data-fig="ml">{water}</div>'
                + ('<span class="x-figure" data-d="hours" hidden><strong class="x-big" data-d="hours-n"></strong><span class="caption">assumed, no source</span></span>' if name == "arch" else "")  # a move's paid hours, which its title is about
                + '</div>'
                f'<p class="reading" data-d="reading">{escape(d["reading"])}</p>'
                f'<div class="x-damage" data-d="damage" hidden></div>')
        modeled = (f'<ul class="plate-values x-layers" data-d="layers">{layers}</ul><p class="caption" data-d="spread">{escape(d["spread"])}</p>'
                   f'<p class="caption">Price: <span data-d="price-tag">{escape(d["priceTag"])}</span>. CO2e: <span data-d="co2-tag">{escape(d["co2Tag"])}</span>. Water: <span data-d="water-basis">{escape("; ".join(w["tag"] for w in d["water"]))}</span>.</p>'
                   f'<div class="x-tokens" data-d="tokens" hidden></div>')
    else:
        body = extra
    # Under the Reading, the selected row's claims by status and by publisher, each a chip that opens its card here (the kit's evidence); then the actions.
    evidence = f'<div class="plate-evidence" data-d="chips" data-js></div><div class="plate-receipt" id="{PLATE_IDS[name]}-receipt" data-d="receipt" role="group" aria-label="Source" tabindex="-1" hidden></div>'
    actions = ('<div class="plate-actions" data-js><button type="button" class="button button-secondary" data-copy>Copy reading</button>'
               '<button type="button" class="button button-secondary" data-reset hidden>Back to the starting point</button><p class="caption plate-status" role="status"></p></div>')
    more = f'<details class="plate-more x-modeled" open><summary>How this is modeled</summary>{modeled}<div data-d="note" class="x-note-slot" data-js hidden></div></details>'
    drivers = (f'<details class="plate-more x-drivers" open><summary>{MOVES["head"]}</summary><table class="data-table plate-drivers"><caption>{escape(MOVES["intro"])}</caption>'
               f'<thead><tr><th scope="col">Input</th><th scope="col">Low end to high end</th><th scope="col">Sources</th></tr></thead><tbody data-d="moves">{moves_html(st["moves"][name])}</tbody></table></details>') if kind == "row" else ""
    # The Reading is plain text; the kit's polite output, in the page from the start, speaks it after a pause (explorer.js), never on a hover.
    return f'{MEASURE_LINE}{body}{evidence}{lead}{actions}{drivers}{more}<output class="sr-only" aria-live="polite" aria-atomic="true"></output>'


MOVES = {"head": "What moves it most", "intro": "Each row shows how far this result moves when one input goes from its low end to its high end, with the others held where they are. "
                                                "Settings are not ranked here; the darker part of each bar lies below your figure, the lighter above it.",
         "none": "No input's stated range moves this figure at these settings."}  # the voice lead's words (E4, L3); explorer.js prints "none" live


def moves_html(rows):
    """What moves it most at the defaults, as explorer.js draws it live: the input, the figure at its low end to its high end with the bar under it, and the range's
    claims in a column of their own, so they are not read under the figures' head."""
    if not rows:
        return f'<tr><td colspan="3">{escape(MOVES["none"])}</td></tr>'
    out = []
    for r in rows:
        ids = ", ".join(f'<a class="x-c" href="sources/#src-{c}">{c}</a>' for c in r["claims"]) or "no source, an assumption"
        out.append(f'<tr style="--l:{r["l"]};--c:{r["c"]};--h:{r["h"]};--z:{r["z"]}"><th scope="row">{escape(r["name"])}</th>'
                   f'<td>{escape(r["ends"])}<span class="plate-driver-bar" aria-hidden="true"><i></i></span></td><td><span class="caption">{ids}</span></td></tr>')
    return "".join(out)


NOTE_BLOCK = re.compile(r'<div class="x-note" id="(?P<id>[^"]+)">(?P<body>.*?)</div>', re.S)
STATUS_WORDS = {"verified": "verified", "partly": "partly verified"}


def note_claims(notes_html):
    """Each row note's claims, in its chips' order, by the note's id."""
    return {m["id"]: re.findall(r'href="sources/#src-([a-z]+-\d{3})"', m["body"]) for m in NOTE_BLOCK.finditer(notes_html)}


def claim_span(c, claims):
    """One claim as the Tables print it: its status glyph, its id linked to its receipt, and its status word."""
    return (f'<span class="x-claim"><span class="st st-{"p" if claims[c]["status"] == "partly" else "v"}" aria-hidden="true"></span>'
            f'<a href="sources/#src-{c}" data-claim="{c}">{c}</a> {STATUS_WORDS[claims[c]["status"]]}</span>')


def claims_cell(ids, claims):
    """A Table's last cell: each of the row's claims as a link to its receipt, with its status glyph and word, so every figure reaches its claim and status in one
    press, with scripts or without, and on paper."""
    if not ids:
        return '<td data-c="claims">Modeled; no claim</td>'
    return f'<td data-c="claims">{"; ".join(claim_span(c, claims) for c in dict.fromkeys(ids))}</td>'


FACTOR_HEADS = (("g", "For the CO2e column, the grid factors: "), ("ml", "For the water column, the water factors: "))  # explorer.js factorsInto writes the same


def factors_foot(keys, st, claims, cols):
    """The Table's foot: the grid and water factors its rows' CO2e and water are multiplied by at these settings, each with its claim and status, said once for
    the Table rather than in every row (explorer-03 hard line). The selected row's chips name its own; explorer.js factorsInto redraws this when a setting moves."""
    groups = []
    for m, head in FACTOR_HEADS:
        ids = list(dict.fromkeys(c for k in keys for c in st["factors"][k][m]))
        if ids:
            groups.append(f'<span class="x-claim-for">{head}{"; ".join(claim_span(c, claims) for c in ids)}.</span>')
    return f'<tfoot><tr><td colspan="{cols}" data-factors>{"".join(groups)}</td></tr></tfoot>' if groups else ""


def rows_table(data, keys, st, caption, row_ids, claims):
    cols = "".join(f"<th scope=\"col\">{c}</th>" for c in ("Row", "Energy", "Price, with its basis", "CO2e", "Water, by basin", "Claims and status"))
    head = f"<thead><tr>{cols}</tr></thead>"
    body = []
    for key in keys:
        t = st["tables"][key]
        hidden = " hidden" if key == "use.seat" else ""
        body.append(f'<tr data-tr="{attr(key)}"{hidden}><th scope="row">{escape(label_text(data, key, st))}</th><td data-c="wh">{escape(t["wh"])}</td><td data-c="usd">{escape(t["usd"])}</td><td data-c="g">{escape(t["g"])}</td><td data-c="ml">{escape(t["ml"])}</td>'
                    f'{claims_cell(row_ids.get(data["rows"][key]["note"], []), claims)}</tr>')
    foot = factors_foot([k for k in keys if k != "use.seat"], st, claims, 6)
    return f'<table class="data-table plate-table"><caption>{escape(caption)}</caption>{head}<tbody>{"".join(body)}</tbody>{foot}</table>'


def chips(ids, claims):
    out = []
    for claim_id in dict.fromkeys(ids):
        c = claims[claim_id]
        hollow = " is-hollow" if c["status"] == "partly" else ""
        out.append(f'<a class="receipt{hollow}" href="sources/#src-{claim_id}"><span class="receipt-mark"></span><span>{claim_id}</span></a>')
    return f'<p class="plate-chips">{"".join(out)}</p>' if out else ""


NOTES = {}  # each row note as data for the page's window, {id: {t: title, l: lines, c: claims}}: explorer.js builds the selected one as text (explorer-19)


def note_html(note_id, label, lines, ids, claims, limits):
    """A row's note as the Sources page prints it; the same note goes to the page's data block, which builds only the selected row's."""
    NOTES[note_id] = {"t": label, "l": [line for line in lines if line], "c": list(dict.fromkeys(ids))}
    body = "".join(f"<p>{escape(line)}</p>" for line in lines if line)
    return f'<div class="x-note" id="{note_id}"><p class="x-note-title">{escape(label)}</p>{body}{chips(list(dict.fromkeys(ids)), claims)}</div>'


def limit_of(claim_id, claims, limits):
    sentence = claims[claim_id].get("limit") or limits.get(claim_id)
    if not sentence:
        raise BuildError(f"partly verified claim {claim_id} has no public limit sentence; add it to {LIMITS.name}")
    return sentence


def claim_words(ids, claims, limits, link):
    """What each claim's status is and, for a partly verified one, its limit. scripts/build_home.py says its figures' the same way."""
    verified = [claim_id for claim_id in ids if claims[claim_id]["status"] != "partly"]
    return " ".join(([f'{", ".join(map(link, verified))}: verified against the source.'] if verified else []) +
                    [f'{link(claim_id)}: partly verified. Limit: {escape(limit_of(claim_id, claims, limits))}' for claim_id in ids if claims[claim_id]["status"] == "partly"])


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
        out.append(f'<div class="x-waffle" data-group="waffle:{key}"><figure><div class="x-waffle-art" role="img" aria-label="{attr(w["label"])}: {attr(figure)} AI of one hundred squares">{waffle_svg(filled, hollow)}</div>'
                   f'<figcaption><strong>{escape(w["label"])}: {escape(figure)}</strong><span>{escape(line)}.</span>'
                   f'<span class="x-waffle-rest">The rest: search, video, storage, email, business software: not split in the record.</span></figcaption></figure></div>')
    return "".join(out)


def waffle_detail(claims, limits):
    out = []
    for key, w in WAFFLES.items():
        claim = claims[w["claim"]]
        value = f'{w["low"]} to {w["high"]}' if "low" in w else str(round(100 * w["ai"] / w["of"]))
        limit = limit_of(w["claim"], claims, limits) if claim["status"] == "partly" else ""
        limit_line = '<p class="caption">Limit: ' + escape(limit) + "</p>" if limit else ""
        status = "1 partly verified" if claim["status"] == "partly" else "1 verified"
        out.append(f'<div data-group="waffle:{key}">{readout_html(value, "percent", w["label"], marks=False)}<p class="reading">{escape(w["def"])}</p>'
                   f'{limit_line}<p class="x-this-figure"><a href="#about-{key}" data-about>This figure: {status}</a>; <a class="x-c" href="sources/#src-{w["claim"]}">{w["claim"]}</a></p>'
                   f'<details class="plate-more" id="about-{key}" open><summary>About this figure</summary><p class="caption">{escape(claim["source"]["publisher"])}. {escape(claim["boundary"] or "")}</p></details></div>')
    return "".join(out)


def strip_svg(values, per=0.05):
    """One 12px square per unit, five to a row, so the columns can be counted; the last square is cut to its fraction."""
    pitch, size, across = 14, 12, 5
    n = values / per
    whole = int(n)
    d = "".join(f"M{(i % across) * pitch} {(i // across) * pitch}h{size}v{size}h-{size}z" for i in range(whole))
    frac = n - whole
    if frac > 0.02:
        i = whole
        d += f"M{(i % across) * pitch} {(i // across) * pitch}h{max(2, round(size * frac))}v{size}h-{max(2, round(size * frac))}z"
    rows = max(1, (whole + (1 if frac > 0.02 else 0) + across - 1) // across)
    return f'<svg viewBox="0 0 {across * pitch - 2} {rows * pitch - 2}" width="{across * pitch - 2}" height="{rows * pitch - 2}" aria-hidden="true"><path class="x-w-ai" d="{d}"/></svg>'


def place_columns(pub):
    """The same short prompt, one square per 0.05 Wh. Three places run the same model; the devices run a small one, added energy only."""
    places = {p["key"]: p for p in pub["places"]}
    tree = {f"where.prompt.{place}.wh": r["energy_wh"]["value"] for place, r in pub["where_it_runs"]["prompt"]["places"].items()}
    tree.update({r["key"] + ".wh": r["energy_wh"]["value"] for r in pub["architectures"]["D"]["options"]})
    pues = lambda p: f'PUE {p["pue"]["value"]:g}' if p.get("pue") else "PUE not applicable"
    water = lambda p: f'site water {p["site_water"]["value"]:g} L per kWh'
    return [
        ("Hyperscale", tree["where.prompt.hyper.wh"], f'{pues(places["hyper"])}, utilization {places["hyper"]["u"]["value"]}, {water(places["hyper"])}; {places["hyper"]["grid_default"]}.', ""),
        ("Regional colocation", tree["where.prompt.colo.wh"], f'{pues(places["colo"])}, utilization {places["colo"]["u"]["value"]}, {water(places["colo"])}; {places["colo"]["grid_default"]}.', ""),
        ("Community node", tree["where.prompt.node.wh"], f'{pues(places["node"])}, utilization {places["node"]["u"]["value"]}, {water(places["node"])}; the local grid; a low utilization is its idle floor.', ""),
        ("Laptop", tree["arch.D.laptop.wh"] / 1000, "Small model; the reader's grid; no site water.", "device"),
        ("Phone", tree["arch.D.phone.wh"] / 1000, f'Small model; the reader\'s grid; no site water; {num(tree["arch.D.phone_wall.wh"] / 1000)} Wh at the wall.', "device"),
    ]


def place_strip(pub):
    return "".join(f'<li class="x-place{" is-device" if kind else ""}"><strong>{escape(label)}</strong><span class="x-place-art">{strip_svg(wh)}</span><span class="x-place-wh">{num(wh)} Wh</span></li>' for label, wh, _, kind in place_columns(pub))


def place_notes(pub):
    return "".join(f"<li><strong>{escape(label)}.</strong> {escape(words_)}</li>" for label, _, words_, _ in place_columns(pub))


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
    return (f'<div class="x-admin-row"><div class="x-field" data-js hidden><label for="a-admin">Cloud admin hours a month</label><input id="a-admin" type="number" min="0" max="{pub["typed_limits"]["most"]:.15g}" step="any" inputmode="decimal" value="{hours:g}" data-input="{name}"></div>'
            f'<p class="caption"><strong>The price order flips by {flip} hours a month.</strong> <span data-admin-tie>{escape(st["adminWords"])}</span></p></div>'
            f'<p class="caption" role="status" data-input-why></p>'
            # Folded, so the claim column keeps to a few lines and the plot starts near the title (explorer-31); open without scripts and on paper.
            f'<details class="plate-more" open><summary>What the hours assume</summary><p class="caption">Cloud seats need an administrator too. With no source for it, this page assumes {hours:g} paid hours a month, against {local["value"]:g} for the local suite ({", ".join(local["claims"])}). '
            'It also assumes, with no source, that a cloud seat\'s price includes sign-in, permissions, and access control, which a local suite has to provide itself; '
            f'the record does not say how much of the {local["value"]:g} hours that work takes. Above the tie point beside the input, the local suite is the cheaper.</p></details>')  # the tie prints live in the line above


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


NESTED_READINGS = {"s3": "S3", "r2": "R2", "b2": "B2", "node": "the Nation's own node", "federated": "the federated set"}


def reads_words(reads, label, pub):
    """A derived figure's receipts, from the model's trace at the default settings: the claims of the inputs it reads that its label does not already name, and the
    assumptions it rests on. Returns the claim ids in parentheses and the sentences after them, so the figure's own claims and limits are a click away."""
    name = lambda k: INPUT_NAMES.get(k) or pub["inputs"][k]["unit"]
    ids = [c for c in reads["claims"] if c not in label]
    tails = [f'{head}: {"; ".join(name(k) for k in keys)}.' for head, keys in (("Assumed", reads["assumed"]), ("Assumed, with no source", reads["no_source"])) if keys]
    return (f' ({", ".join(ids)})' if ids else ""), " ".join(tails)


def exit_note(pub):
    """Comparison E's typed fields, off the address as every typed number is. The hours and the other bill have no source, so they stay visible and say so."""
    hours, other = pub["inputs"]["exit_admin_h"], pub["inputs"]["exit_other_usd"]
    limit, most = pub["typed_limits"]["exit_tb"], pub["typed_limits"]["most"]  # the field's ceiling is the model's, the same one resource-model.js enforces live and on a file
    field = lambda name, label, value, top=most: (f'<div class="x-field"><label for="e-{name}">{escape(label)}</label><input id="e-{name}" type="number" min="0" max="{top:.15g}" step="any" inputmode="decimal" '
                                                  f'value="{value:g}" data-input="{name}"></div>')
    return (f'<div class="x-fields x-exit-fields" data-js hidden>{field("exit_tb", "Terabytes", pub["scenario"]["exit_tb"], limit)}{field("exit_admin_h", "Paid hours per copy", hours["value"])}{field("exit_other_usd", "Other bill, dollars", other["value"])}</div>'
            f'<p class="caption" role="status" data-input-why></p>'
            f'<p class="caption">{escape(pub["scenario_labels"]["exit_tb"])} The model counts one four-bay box per copy at any size and adds no box as the data grows, so the size goes up to {limit:,g} TB, '
            f'the most one box holds at an assumed {pub["scenario"]["nas_box_max_raw_tb"]:,g} raw TB, which has no source. '
            f'The hours ({hours["value"]:g}; {hours["low"]:g} to {hours["high"]:g}) and any other bill (${other["value"]:g}; ${other["low"]:g} to ${other["high"]:,g}) have no source: labeled assumptions.</p>')


def paybacks_html(st):
    """Years for the move to pay back, for the selected row's holder: one sentence under the Reading. A payback can be never, so each prints as a crossover does, and a one-time price never joins a year's."""
    return f'<p class="x-payback-line" data-group="comparison:E" data-payback-line>{escape(st["paybackLine"])}</p>'


def paybacks_table(st):
    """All six paybacks, for the Table view, where the first screen has no budget to keep."""
    rows = "".join(f'<li><span>{escape(PAYBACKS[k])}:</span> <strong data-payback="{k}">{escape(st["paybacks"][k])}</strong></li>' for k in PAYBACKS)
    return f'<div class="x-paybacks" data-group="comparison:E"><p class="label">Years for the move to pay back</p><ul class="x-readings">{rows}</ul><p class="caption">Each range is one change at a time. Never means not at these settings.</p></div>'


def custody_html(pub, st):
    """What each rule leaves out, for the page without scripts and for print. The live page writes the same words at its own settings, from the same function in resource-model.js."""
    out = []
    for rule, by_letter in st["custody"].items():
        for letter, block in by_letter.items():
            left = "".join(f'<li><strong>{escape(r["label"])}.</strong> {escape(r["figures"])}. {escape(r["reason"])}</li>' for r in block["left"])
            notes = "".join(f'<li><strong>{escape(r["label"])}.</strong> {escape(r["note"])}</li>' for r in block["notes"])
            rows = "".join(f'<tr><th scope="row">{escape(c["label"])}</th><td>{escape(c["kept"])}</td><td>{escape(c["left"])}</td></tr>' for c in block["cost"] or [])
            cost = (f'<div class="table-scroll" tabindex="0" role="group" aria-label="Table, scrolls sideways"><table class="data-table x-custody-cost"><caption>What the rule costs, at the default settings</caption>'
                    f'<thead><tr><th scope="col">Line</th><th scope="col">Rows that stay</th><th scope="col">Rows that leave</th></tr></thead><tbody>{rows}</tbody></table></div>') if rows else ""
            said = "".join(f'<p class="caption">{escape(x)}</p>' for x in (block["said"], block["oneTime"]) if x)
            stays = f'<p class="label">Rows that stay, with a note</p><ul class="x-named">{notes}</ul>' if notes else ""
            out.append(f'<div class="x-custody-block" data-group="comparison:{letter}"><h3 class="x-custody-title">What This Rule Leaves Out</h3><p class="caption">{escape(COMPARISONS[letter])}. {escape(pub["custody"]["label"])}: {escape(block["label"])}.</p>'
                       f'<div class="x-custody-grid"><div><p class="label">{escape(WORDS["leaves"])}</p><ul class="x-named">{left}</ul>{stays}</div><div>{cost}{said}</div></div></div>')
    return "".join(out)


def damage_method(pub):
    """The published families, for the page without scripts and for print: each one's own currency and year, none converted. It lifts out with the model's own block."""
    spec = pub.get("carbon_damage")
    if not spec:
        return ""
    rows = [(f["label"], f["low"], "none in the source" if f["central"] is None else f["central"], f["high"], f["unit"], f["kind"], f'{f["spread"]} {f["limit"]} {", ".join(f["claims"])}') for f in spec["families"].values()]
    return (f'<h3>Illustrative Carbon Damage, Off by Default</h3><p>{escape(spec["federal_status"])} {escape(spec["never"])} {escape(spec["tonnes_first"])} The column reads &ldquo;{escape(spec["column"])}&rdquo;, as of {escape(spec["as_of"])}. It is never added to a price or ranked against one.</p>'
            + table_of(("Family", "Low", "Central", "High", "Unit", "What it is", "Spread, limit, and claims"), rows))


def arch_words(pub, data, st):
    """Wins, loses, and the readings, one comparison at a time. Words for the default settings."""
    out = []
    for letter, spec in pub["architectures"].items():
        def reading_label(k, r):
            if "." not in k:
                return r["label"]
            stop = k.split(".")[1]
            if stop in NESTED_READINGS:
                return f'{r["label"]}: {NESTED_READINGS[stop]}'
            counts = {"node_100k": pub["scenario"]["node_prompts_100k"], "node_1m": pub["scenario"]["node_prompts_1m"]}
            return f'{r["label"]}: {counts[stop] if stop in counts else int(stop):,}'
        def reading_line(k, r):
            ids, tails = reads_words(r["reads"], r["label"], pub)
            return (f'<li>{escape(reading_label(k, r))}: <strong data-reading="arch.{letter}.readings.{k}">{escape(st["readings"][f"arch.{letter}.readings.{k}"])}</strong>'
                    f'{escape(ids)}{escape(". " + tails) if tails else ""}</li>')
        readings = "".join(reading_line(k, r) for k, r in spec["readings"].items())
        payback_label = ""
        if "payback_label" in spec:
            ids, tails = reads_words(spec["payback_reads"], spec["payback_label"], pub)
            payback_label = f'<p class="caption">{escape(spec["payback_label"])}{escape(ids)}.{escape(" " + tails) if tails else ""}</p>'
        out.append(f'<div class="x-arch-words" data-group="comparison:{letter}"><p class="label">Wins, at the default settings</p><p class="caption">{escape(wins_words(letter, spec, pub))}</p><p class="label">Loses, at the default settings</p><p class="caption">{escape(spec["loses"])}</p>'
                   f'<p class="caption">{escape(spec["note"])}</p>{payback_label}'
                   f'<details class="plate-more"><summary>Figures beside the rows</summary><ul class="x-readings">{readings}</ul>'
                   '<p class="caption">Each figure names the claims of the inputs it reads at the default settings, beyond those its label names, and the assumptions it rests on.</p></details></div>')
    return "".join(out)


def receipts_of(ids, claims, limits):
    """Each claim the page names, as its receipt on explorer/sources/; short, title, status, limit, and url also ride in the page's data for the chips and the card."""
    out = {}
    for claim_id in sorted(ids):
        c, s = claims[claim_id], claims[claim_id]["source"]
        out[claim_id] = bp.compact({
            "short": re.split(r"[,(;]", s.get("publisher") or "source")[0].strip()[:26], "title": s.get("title") or s.get("publisher") or claim_id, "publisher": s.get("publisher") or "",
            "url": s["url"], "published": bp.us_date(s.get("published")), "kind": s.get("kind"), "year": c.get("year"), "boundary": c.get("boundary") or "", "quote": c["quote"],  # a date with words after it stays as written
            "derived": c.get("derived"), "status": c["status"], "limit": limit_of(claim_id, claims, limits) if c["status"] == "partly" else c.get("limit"),
        })
    return out


X_LINK = re.compile(r"<a class=\"x-c\" href=\"(?:sources/)?#src-[^\"]+\">([^<]+)</a>")


def linkify(html, to="sources/"):
    """Claim ids in running text become links to their receipts, on the Sources page (to="sources/") or on that page itself (to=""). Idempotent: an id already
    inside a link or a tag is left alone."""
    parts = re.split(r"(<[^>]+>)", X_LINK.sub(r"\1", html))
    inside = 0
    for i, part in enumerate(parts):
        if part.startswith("<"):
            if re.match(r"<a\b", part):
                inside += 1
            elif re.match(r"</a\s*>", part):
                inside -= 1
        elif not inside and CLAIM.search(part):
            parts[i] = CLAIM.sub(lambda m: f'<a class="x-c" href="{to}#src-{m[0]}">{m[0]}</a>', part)
    return "".join(parts)


TYPED_DIGIT = re.compile(r"\d")


def check_typed_digits(page, start="<main", end="</main>"):
    """Digits our prose may type: years, dates, names like CO2, and claim ids. Every quantity is poured."""
    body = page[page.index(start):page.index(end)]
    body = MARKER.sub(" ", body)
    body = re.sub(r"<script.*?</script>|<code>.*?</code>|<span data-setting-line[^>]*>[^<]*</span>", " ", body, flags=re.S)
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
    shell = SOURCES.read_text(encoding="utf-8")  # the Explorer's Sources page: its method, each plate's sources and notes, and its receipts
    data = inline_data(pub)
    pours = {m["spec"] for m in POUR.finditer(page + shell)}
    here = {spec: local_pour(spec, claims, pub) for spec in pours if spec.split(":")[0] in ("cl", "pub")}
    st = run_static(data, pours - set(here))
    st["pours"].update(here)
    data["first"]["lever"] = st["bestLever"] or data["first"]["lever"]  # Savings opens on the row its answer names (explorer-18)
    NOTES.clear()
    notes = {tab: notes_for(pub, tab, claims, limits) for tab in ("use", "where", "arch", "lever", "cross", "catalog")}
    data["notes"] = dict(NOTES)  # in the data block, so linkify never touches it and its claims ship with the receipts
    row_ids = {k: v for html in notes.values() for k, v in note_claims(html).items()}
    of_row = lambda key: row_ids.get(data["rows"][key]["note"], [])  # noqa: E731

    def table_for(tab):
        d = data["boards"]
        if tab == "use":
            return rows_table(data, d["use"]["rows"], st, "One week at the settings shown. Water is by basin, never summed.", row_ids, claims)
        if tab == "where":
            return "".join(f'<div data-group="workload:{w}">{rows_table(data, d["where." + w]["rows"], st, spec["label"], row_ids, claims)}</div>' for w, spec in pub["where_it_runs"].items())
        if tab == "arch":
            return "".join(f'<div data-group="comparison:{letter}">{rows_table(data, d["arch." + letter]["rows"], st, spec["title"], row_ids, claims)}</div>' for letter, spec in pub["architectures"].items())
        if tab == "catalog":
            return rows_table(data, d["catalog.hour"]["rows"] + d["catalog.unit"]["rows"], st, "Every row at the settings shown. The price column is not sortable: prices are not ranked across bases.", row_ids, claims)
        if tab == "lever":
            head = "".join(f'<th scope="col">{c}</th>' for c in ("Lever", "Energy", "Price", "CO2e", "Water", "Claims and status"))
            body = []
            for key in d["lever"]["rows"]:
                cells = "".join(f'<td data-c="{m}">{escape(st["levers"][key][m]["before_text"])} then {escape(st["levers"][key][m]["after_text"])}{", " + st["levers"][key][m]["ratio_text"] if st["levers"][key][m]["ratio_text"] else ""}</td>' for m in MS)
                body.append(f'<tr data-tr="{attr(key)}"><th scope="row">{escape(data["rows"][key]["label"])}</th>{cells}{claims_cell(of_row(key), claims)}</tr>')
            return f'<table class="data-table plate-table"><caption>Before, then after, and after as a share of before, at the same setting.</caption><thead><tr>{head}</tr></thead><tbody>{"".join(body)}</tbody>{factors_foot(d["lever"]["rows"], st, claims, 6)}</table>'
        if tab == "cross":
            body = []
            for board in ("cross.prompts", "cross.views"):
                for key in d[board]["rows"]:
                    c = st["cross"][board]["items"][key]
                    body.append(f'<tr data-tr="{attr(key)}"><th scope="row">{escape(data["rows"][key]["label"])}</th><td data-c="count">{escape(c["text"])}</td><td data-c="ends">{escape(c["ends"])}</td>{claims_cell(of_row(key), claims)}</tr>')
            return (f'<table class="data-table plate-table"><caption>Annual count at which the local option catches up, with the range from one change.</caption><thead><tr><th scope="col">Crossover</th>'
                    f'<th scope="col">Count</th><th scope="col">What sets each end</th><th scope="col">Claims and status</th></tr></thead><tbody>{"".join(body)}</tbody></table>')
        return ""

    def lever_first():
        key = data["first"]["lever"]
        r = st["levers"][key]["wh"]
        v = lever_value(r)
        return (readout_html(v["num"], "percent" if r["pct_text"] else "", "of before, energy") +
                f'<p class="reading" data-d="reading">{escape(data["rows"][key]["label"])}: {escape(r["before_text"])} before, {escape(r["after_text"])} after, at the same setting. Modeled, not measured; a per-unit saving is not a total one.</p>')

    def lever_lines():
        r = st["levers"][data["first"]["lever"]]
        lines = "".join(f'<li>{WORDS["measure"][m]}: {escape(r[m]["before_text"])} then {escape(r[m]["after_text"])}{", " + r[m]["ratio_text"] if r[m]["ratio_text"] else ""}</li>' for m in MS)
        return f'<ul class="x-lines" data-d="lines">{lines}</ul>'

    def cross_first():
        key = data["first"]["cross"]
        c = st["cross"]["cross.prompts"]["items"][key]
        day = f' That is about {c["day"]} prompts a day.' if c.get("day") else ""  # explorer.js crossDay: a count a year in a day's terms (explorer-36)
        return (readout_html(c["words"]["num"], c["words"]["unit"], c["words"]["tag"][1:-1]) +
                f'<p class="reading" data-d="reading">{escape(data["rows"][key]["label"])}: {escape(c["text"])}. A range from one change at a time, not a forecast.{escape(day)}</p>')

    def cross_ends():
        c = st["cross"]["cross.prompts"]["items"][data["first"]["cross"]]
        return f'<p class="caption" data-d="ends">{escape(c["ends"])}</p>'

    blocks = {
        "checked": lambda: escape(pub["price_date"]),
        "answer:use": lambda: escape(st["answers"]["use"]),
        "answer:where": lambda: escape(st["answers"]["where"]),
        "answer:savings": lambda: escape(st["answers"]["savings"]),
        "eyebrow:use": lambda: f'Your week, modeled {pub["price_date"][:2]}/{pub["price_date"][6:]}',
        "settings:list": lambda: "".join(f'<li>{escape(SETTING_NAMES[n])}: {escape(data["sel"][n]["say"][data["sel"][n]["def"]])}</li>' for n in data["sel"]),
        "qual:ai": lambda: "".join(f"<li>{escape(x)}</li>" for x in pub["qualitative"]["ai_is_not_data_centers"]),
        "project:formula": lambda: f'<p class="x-formula">{escape(pub["project_scale"]["formula"])}</p>',
        "data": lambda: f'<script type="application/json" id="explorer-data">{bp.inline_json(data)}</script>',
        "drawer": lambda: drawer_html(pub, data),
        "controls:use": lambda: fields_html(data),
        "plot:use": lambda: wall_html(data, "use", st),
        "detail:use": lambda: detail_html("use", st, data, lead=week_html(st)),
        "table:use": lambda: table_view_html(table_for("use")),
        "waffle:plot": lambda: waffles_html(claims, limits),
        "waffle:control": lambda: segmented("waffle", "Which figure", [(k, w["label"]) for k, w in WAFFLES.items()], "iea_2025", 'data-opt="waffle"') + '<p class="sr-only" role="status" data-waffle-status></p>',
        "waffle:detail": lambda: waffle_detail(claims, limits),
        "places": lambda: place_strip(pub),
        "places:notes": lambda: place_notes(pub),
        "controls:where": lambda: segmented("workload", "Workload", [(w, s["label"]) for w, s in pub["where_it_runs"].items()], "prompt", 'data-opt="workload"'),
        "plot:where": lambda: "".join(f'<div data-group="workload:{w}">{wall_html(data, "where." + w, st)}</div>' for w in pub["where_it_runs"]),
        "detail:where": lambda: detail_html("where", st, data),
        "table:where": lambda: table_view_html(table_for("where")),
        "controls:arch": lambda: segmented("comparison", "Comparison", [(k, f"{k}. {t}") for k, t in COMPARISONS.items()], "A", 'data-opt="comparison"'),
        "controls:arch-money": lambda: setting_html(pub, data, "wage", "arch-", why=False) + setting_html(pub, data, "node_already_on", "arch-", why=False),
        "plot:arch": lambda: "".join(f'<div data-group="comparison:{letter}">{wall_html(data, "arch." + letter, st)}</div>' for letter in pub["architectures"]),
        "detail:arch": lambda: detail_html("arch", st, data, lead=paybacks_html(st)),
        "table:arch": lambda: table_view_html(table_for("arch"), paybacks_table(st)),
        "arch:verdict": lambda: f'{arch_words(pub, data, st)}{arch_pairs(pub, data)}',
        "controls:custody": lambda: segmented("custody", pub["custody"]["label"], [(k, o["label"]) for k, o in pub["custody"]["options"].items()], pub["custody"]["default"], "data-custody"),
        "custody:line": lambda: escape(pub["custody"]["fixed_line"]),
        "custody:left": lambda: custody_html(pub, st),
        "exit:note": lambda: exit_note(pub),
        "plot:lever": lambda: lever_html(data, st),
        "detail:lever": lambda: detail_html("lever", st, data, extra=lever_first(), kind="custom", modeled=lever_lines()),
        "table:lever": lambda: table_view_html(table_for("lever")),
        "controls:cross": lambda: segmented("crossover", "Comparison", [("prompts", "Prompts"), ("views", "Views")], "prompts", 'data-opt="crossover"'),
        "plot:cross": lambda: cross_html(data, "cross.prompts", st) + cross_html(data, "cross.views", st),
        "detail:cross": lambda: detail_html("cross", st, data, extra=cross_first(), kind="custom", modeled=cross_ends()),
        "table:cross": lambda: table_view_html(table_for("cross")),
        "controls:catalog": lambda: segmented("scale", "View", [("hour", "By the hour"), ("unit", "By the unit")], "hour", 'data-opt="scale"') + segmented("sort", "Sort within a ruler", [("value", "By value"), ("tag", "By price basis")], "value", 'data-opt="sort"'),
        "plot:catalog": lambda: f'<div data-group="scale:hour"><p class="ladder-group-label">By the hour, the whole chain</p>{wall_html(data, "catalog.hour", st)}</div><div data-group="scale:unit"><p class="ladder-group-label">By the unit, data center only</p>{ruler_html(data, "catalog.unit", st)}</div>',
        "detail:catalog": lambda: detail_html("catalog", st, data),
        "table:catalog": lambda: table_view_html(table_for("catalog")),
        "project:cooling": lambda: "".join(f'<button type="button" class="slider-presets-button" data-preset="{v}" data-for="wue">{escape(t)}</button>' for v, t in (
            (pub["inputs"]["wue_local"]["value"], f'Dry, {pub["inputs"]["wue_local"]["value"]:g}'), (pub["inputs"]["wue_site"]["value"], f'Operator average, {pub["inputs"]["wue_site"]["value"]:g}'), (pub["inputs"]["wue_tower"]["value"], f'Cooling tower midpoint, {pub["inputs"]["wue_tower"]["value"]:g}'))),
        "project:grids": lambda: "".join(f'<option value="{v}" data-claims="{" ".join(grid_claims(data, o))}">{escape(GRID_NAMES.get(o, o))}, {v:g} g per kWh</option>' for o, v in project_grids(pub)),
        "project:example": lambda: project_example(pub, claims, limits)[0],
        "project:example-note": lambda: project_example(pub, claims, limits)[1],
        "qual:no-number": lambda: "".join(f"<li>{escape(x)}</li>" for x in no_number_words(pub, claims)),
        "admin:note": lambda: admin_html(pub, st),
        "qual:other-side": lambda: "".join(f"<li>{escape(x)}</li>" for x in pub["qualitative"]["on_the_other_side"]),
        "qual:loses": lambda: "".join(f"<li>{escape(x)}</li>" for x in pub["qualitative"]["where_local_or_federated_systems_lose"]),
        "qual:rebound": lambda: f'<p>{escape(pub["qualitative"]["rebound"])}</p>',
    }
    collars = {f"collar:{name}" for name in PLATE_IDS}
    method = {  # on the Sources page (DIRECTION-R2 section 4): the method, the downloads, and the disclaimer
        "method:disclaimer": lambda: disclaimer_html(pub["disclaimer"]),
        "method:backtest": lambda: backtest_html(pub),
        "method:calibration": lambda: calibration_html(pub),
        "method:regression": lambda: regression_html(pub),
        "method:sensitivity": lambda: sensitivity_html(pub),
        "method:version": lambda: f'<p>Model version: schema {pub["schema"]}, built {pub["built"][5:7]}/{pub["built"][8:10]}/{pub["built"][:4]}, prices as of {pub["price_date"]}, inputs hash {data["hash"]}. {len(pub["inputs"])} inputs.</p>',
        "method:damage": lambda: damage_method(pub),
        "method:illustrations": lambda: "".join(f"<li>{escape(x)}</li>" for x in pub["scenario_labels"].values()),
        "checked": blocks["checked"],
    }
    later = {"sources", "census", "plates"}  # the Sources page's parts that count the finished page

    def filled(text, own, rel, skip=()):
        missing = sorted(set(own) - {m["name"] for m in MARKER.finditer(text)})
        if missing:
            raise BuildError(f"{rel} lacks markers: {missing}")
        unknown = sorted({m["name"] for m in MARKER.finditer(text)} - set(own) - set(skip))
        if unknown:
            raise BuildError(f"{rel}: no content for markers {unknown}")
        text = MARKER.sub(lambda m: f"{m[1]}{own[m['name']]()}{m[4]}" if m["name"] in own else m[0], text)
        return POUR.sub(lambda m: f'<span data-m="{m["spec"]}">{st["pours"][m["spec"]]}</span>', text)

    main = filled(page, blocks, "explorer/index.html", collars)
    # The bar names fewer settings (explorer-35); each plate's line, for print and the page without scripts, names them all.
    main = re.sub(r'(<span data-setting-line(="bar")?>)[^<]*(</span>)', lambda m: m[1] + escape(st["barLine"] if m[2] else st["line"]) + m[3], main)
    check_typed_digits(main)
    # Linkify the running text, never the data block, then write the receipts of what the page names on its Sources page (owner ruling 39).
    head, sep, tail = main.partition('<script type="application/json" id="explorer-data">')
    json_block, end, rest = tail.partition("</script>")
    body, rest = linkify(head), linkify(rest)
    found = lambda text: set(re.findall(r'href="(?:sources/)?#src-([a-z]+-\d{3})"', text))  # noqa: E731
    src = filled(shell, method, "explorer/sources/index.html", later)
    check_typed_digits(src, 'id="method"', 'id="receipts"')
    src = linkify(src, "")
    own_text = MARKER.sub(lambda m: m[1] + m[4] if m["name"] in later else m[0], src)  # a part this build writes again counts nothing from the last build
    ids = found(body + rest) | set(CLAIM.findall(json_block)) | found(own_text)  # row notes in the data block name their claims through the chips
    unknown = sorted(i for i in ids if i not in claims)
    if unknown:
        raise BuildError(f"the page names claims that do not ship: {unknown}")
    receipts = receipts_of(ids, claims, limits)
    # The chips' names and the in-place card come from the data block, so the page holds no copy of the list.
    json_block = bp.inline_json({**json.loads(json_block), "receipts": {c: bp.compact({k: r.get(k) for k in ("short", "title", "status", "limit", "url")}) for c, r in receipts.items()}})
    final = body + sep + json_block + end + rest
    # Each plate's claims: what its own zones name, and its rows' notes. Its collar counts them, and its section on the Sources page lists them.
    boards_of = {"use": ("use",), "catalog": ("catalog.",), "where": ("where.",), "arch": ("arch.",), "cross": ("cross.",), "lever": ("lever",), "building": (), "project": ()}
    owned = {}
    for name, plate in PLATE_IDS.items():
        start = final.index(f'data-plate-x="{name}"')
        zone = final[start:final.index(f"<!-- explorer:collar:{name} -->", start)]
        rows = [k for b, spec in data["boards"].items() if b.startswith(boards_of[name]) for k in spec["rows"]] if boards_of[name] else []
        feeds = {c for o, _ in project_grids(pub) for c in grid_claims(data, o)} if name == "project" else set()  # every feed the proposal lists prints its factor
        owned[name] = sorted(found(zone) | {c for k in rows for c in of_row(k)} | feeds)
    final = MARKER.sub(lambda m: f"{m[1]}{collar_html(m['name'].split(':')[1], {c: receipts[c] for c in owned[m['name'].split(':')[1]]})}{m[4]}" if m["name"] in collars else m[0], final)
    listed = f'<p class="caption">{escape(bp.tally_words(receipts))}</p>{bp.documents_html("explorer", receipts, claims, set())}'
    parts = {"sources": listed, "census": bp.census_html(receipts), "plates": plates_html(owned, notes, receipts)}
    sources = src
    for name, block in parts.items():
        sources = bp.region(sources, f"explorer:{name}", block, "explorer/sources/index.html")
    PAGE.write_bytes(final.encode("utf-8"))
    SOURCES.write_bytes(sources.encode("utf-8"))
    return {"page_bytes": len(final.encode("utf-8")), "sources_bytes": len(sources.encode("utf-8")), "inline_data_bytes": len(json_block), "claims_on_page": len(ids), "partly": sum(claims[i]["status"] == "partly" for i in ids)}


# The Explorer's plates on its Sources page, under its four questions (DIRECTION-R2 3.14, after sources_region): the plates are the page's own, not the kit's,
# so each section lists its claims and links each to its one receipt below, where the quote, boundary, and date stand once.
SOURCE_GROUPS = (("Your use", ("use", "catalog", "building")), ("Where it runs", ("where", "arch", "cross")), ("Savings", ("lever",)), ("A proposal", ("project",)))
SOURCE_TITLES = {"use": "Your use, row by row", "catalog": "Each activity by the hour and by the unit", "building": "AI is not the building", "where": "Where one workload runs",
                 "arch": "Five ways to run the work", "cross": "When a local option catches up", "lever": "What each lever moves", "project": "A proposed data center's year"}
NOTE_HEADS = {"use": "How each row of your use is counted", "catalog": "How each activity is counted", "where": "How each place and workload is counted", "arch": "How each option is counted",
              "cross": "How each crossover is reached", "lever": "What each lever moves"}


def collar_html(name, receipts):
    """The plate's foot, as the kit's collar: its sources line, the link to its section of the Sources page (whose address prints on paper), and what leaves the page."""
    plate = PLATE_IDS[name]
    out = '<button type="button" data-print-plate>Print this plate</button>' + ('<button type="button" data-csv>Download CSV</button>' if name in TABLED else "")
    return (f'<div class="plate-collar-sources"><p class="caption plate-source-line">{escape(bp.tally_words(receipts))}</p>'
            f'<p class="plate-sources-link"><a href="sources/#{plate}" data-url="{vp.OWN_ORIGIN}explorer/sources/#{plate}">All sources for this plate</a></p></div>'
            f'<div class="plate-out" data-js>{out}</div>')


def plates_html(owned, notes, receipts):
    """A section per plate: its sources line, a way back to it, its claims each linked to its receipt with its status, and how each row is counted."""
    out = []
    for group, names in SOURCE_GROUPS:
        for name in names:
            plate, ids = PLATE_IDS[name], owned[name]
            items = "".join(f'<li data-status="{receipts[c]["status"]}"><span class="st st-{"p" if receipts[c]["status"] == "partly" else "v"}" aria-hidden="true"></span> '
                            f'<a href="#src-{c}">{c}</a>, {escape(receipts[c]["short"])}, {STATUS_WORDS[receipts[c]["status"]]}</li>' for c in ids)
            counted = ""
            if name in NOTE_HEADS:
                here = linkify(notes[name], "").replace('href="sources/#src-', 'href="#src-')  # the chips point at their receipts on this page
                counted = f'<details class="disclosure"><summary>{escape(NOTE_HEADS[name])}</summary><div class="x-notes">{here}</div></details>'
            out.append(f'<section class="sources-plate" id="{plate}" aria-labelledby="{plate}-sources-title"><p class="eyebrow">{escape(group)}</p><h3 id="{plate}-sources-title">{escape(SOURCE_TITLES[name])}</h3>'
                       f'<p class="caption">{escape(bp.tally_words({c: receipts[c] for c in ids}))} <a href="../#{plate}">Open the plate</a>.</p><ul class="x-claim-list">{items}</ul>{counted}</section>')
    return "\n".join(out)


def grid_claims(data, option):
    """A proposal's feed's claims: the grid factor the option reads, the same under either grid setting that lists it."""
    sel = data["factor_claims"]["sel"]
    return sel["grid_dc"].get(option) or sel["grid_local"][option]


def project_grids(pub):
    seen = {}
    for name in ("grid_dc", "grid_local"):
        for option, setting in pub["assumptions"][name]["options"].items():
            seen.setdefault(option, setting[name])
    return list(seen.items())


def week_html(st):
    w = st["weekWords"]
    line = lambda label, key, hidden="": f'<p class="caption x-week-line"{hidden}><span>{label}</span> <strong data-w="{key}">{escape(w[key])}</strong></p>'
    return ('<div class="x-week" data-d="week"><h4 class="x-week-title">This week, across the rows</h4>' +
            line("At API list", "list") + line("What platforms earn in those hours; revenue, not a cost", "earned") + line("Seat and storage list", "seat", " hidden") +
            f'<p class="caption x-week-line"><span>CO2e across layers, <span data-w="grids">{escape(w["grids"])}</span></span> <strong data-w="g">{escape(w["g"])}</strong></p>'
            f'<p class="caption x-week-line"><span data-w="cloud-tag">{escape(w["cloud-tag"])}</span> <strong data-w="cloud">{escape(w["cloud"])}</strong></p>'
            f'<p class="caption x-week-line"><span data-w="home-tag">{escape(w["home-tag"])}</span> <strong data-w="home">{escape(w["home"])}</strong></p>'
            '<p class="caption x-check" data-check hidden></p></div>')


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
