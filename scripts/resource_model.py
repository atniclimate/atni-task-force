"""Resource Use Explorer model: what a unit of digital work uses, in energy, price, CO2e, and water.

Said aloud: every unit of work pays its own energy plus its share of the hardware that sits idle waiting for
it; where it runs sets the carbon and the water, and who bills it sets the price.

Every number lives in the parameters file, each with evidence ids, low, central, high, and a kind (measured,
modeled, or assumed). Same-hour inputs are read by key from the comparison model, never copied. This file holds
equations only. Ranges are input extremes run through the same equations: a spread, not a confidence interval.

    python scripts/resource_model.py [--params FILE] [--comparison FILE] [--out FILE]
    python scripts/resource_model.py --self-test
    python scripts/resource_model.py --export    the public JSON and CSV in site/data/
    python scripts/resource_model.py --oracle    300 seeded settings with Python's answers, for the page's check

Standard library only.
"""
import argparse
import json
import math
import statistics
import sys
from pathlib import Path

HOURS = 8760.0
ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "work" / "site-refresh" / "evidence"
PARAMS = EVIDENCE / "resource-model-params.json"
COMPARISON = EVIDENCE / "comparison-model.json"
OUT = EVIDENCE / "resource-model.json"
PRICE_BASES = {"api_list", "seat_list", "paid_subscription", "revenue_standin", "self_run", "none"}
MEASURES = ("wh", "usd", "g", "ml")


# ---------------------------------------------------------------- the equations

def idle_mult(u, a):
    """Energy per unit of work at utilization u, relative to the hyperscale reference u = 0.5."""
    return (a / u + 1 - a) / (1 + a)


def solve_idle_fraction(power_ratio, u1, u2):
    """Idle fraction a of a linear power curve P(u) = a + (1 - a) u that gives P(u2) / P(u1) = power_ratio."""
    return (u2 - power_ratio * u1) / (power_ratio - 1 - power_ratio * u1 + u2)


def w_gen_nw(share, convention, gas):
    """Generation water of a hydro and gas mix, L per kWh: built from the mix, not borrowed."""
    # shortcut: all non-hydro counts as gas, which understates coal and nuclear; upgrade with a full mix table
    return share * convention + (1 - share) * gas


def chain_wh(t_in, t_out, t_cache, ei_in, ei_out, c, pue):
    return (t_in * ei_in + t_cache * ei_in * c + t_out * ei_out) / 1000 * pue


def tokens_wh(t_in, t_out, t_cache, p):
    return chain_wh(t_in, t_out, t_cache, p["ei_in"], p["ei_out"], p["cache_share"], p["pue_hyper"])


def tokens_usd(t_in, t_out, t_cache, p_in, p_out, p_cache=0.0):
    return (t_in * p_in + t_cache * p_cache + t_out * p_out) / 1e6


def token_run(p, total, cached_share, output_share):
    """A logged agent run: total tokens split into cache reads, output, and fresh input. Returns (Wh, USD)."""
    cached, out = total * cached_share, total * output_share
    fresh = total - cached - out
    return tokens_wh(fresh, out, cached, p), tokens_usd(fresh, out, cached, p["p_in"], p["p_out"], p["p_cache"])


def self_run_price(hardware_per_year, kwh, tariff, hours, wage, support=0.0):
    return hardware_per_year + kwh * tariff + hours * wage + support


def layer(wh, grid, site, gen, place="cloud"):
    return (wh, grid, site, gen, place)


def four(layers, usd=None):
    """Energy, price, carbon, and water of a list of layers; carbon and water follow each layer's place."""
    wh = sum(l[0] for l in layers)
    g = sum(l[0] * l[1] for l in layers) / 1000
    ml = None if any(l[3] is None for l in layers) else sum(l[0] * (l[2] + l[3]) for l in layers)
    out = {"wh": wh, "usd": usd, "g": g, "ml": ml}
    places = sorted({l[4] for l in layers})
    if ml is not None and len(places) > 1:  # water is never summed across basins on the page, so keep the parts
        out["ml_by_place"] = {pl: sum(l[0] * (l[2] + l[3]) for l in layers if l[4] == pl) for pl in places}
    return out


def gen_water(p, kind):
    """L per kWh for a grid choice. None where the record holds no claim, so the page prints no water."""
    if kind == "mix":
        return w_gen_nw(p["hydro_share"], p["hydro_conv"], p["gas_water"])
    if kind == "fixed":  # a national or ERCOT average, the dc_generation_water selector
        return p["w_gen_dc"]
    return p["hydro_conv"] if kind == "hydro" else None


def project_scale(mw, load_factor, wue_site, grid_g, load_mwh=None):
    """A proposed data center, no defaults: the reader enters site megawatts, load factor, site water in L per kWh,
    and a grid factor in g per kWh. Returns a year of energy, site water, and carbon, and the share of a load the
    reader enters. Hosting a building and serving a Nation's own computing are separate decisions."""
    mwh = mw * load_factor * HOURS
    out = {"mwh_per_year": mwh, "site_water_l_per_year": mwh * 1000 * wue_site, "co2e_t_per_year": mwh * grid_g / 1000}
    if load_mwh:
        out["share_of_load"] = mwh / load_mwh
    return out


def net_intensity(p):
    avg = p["network_mode"] == "average"
    if p["connection"] == "wifi":
        return p["net_fixed_avg"] if avg else p["net_fixed_marg"]
    return p["net_mobile_avg"] if avg else p["net_mobile_marg"]


def router_wh(p, gb):
    if p["connection"] != "wifi" or p["router_allocation"] == "excluded":
        return 0.0
    return p["router_w"] if p["router_allocation"] == "by_time" else p["router_wh_per_gb"] * gb


def chat_wh(p):
    """Energy per prompt on chat rows: the text input, unless the reader picked another kind of chat."""
    return p["e_prompt"] if p["chat_kind"] == "short_text" else p["chat_kind_wh"]


def same_hour(p):
    """The same-hour comparison: one hour on one device, by layer, in the comparison model's shape."""
    device = p["device"]
    i_net, kb = net_intensity(p), p["kb_prompt"]
    gb = {"chat": p["prompts_per_hour"] * kb / 1e6, "video": p["gb_" + device], "short": p["short_gb"]}
    dc = {"chat": p["prompts_per_hour"] * chat_wh(p), "video": gb["video"] * p["i_dc"],
          "short": min(p["short_gb"] * p["i_dc"], p["short_ceiling"])}
    out = {}
    for row in ("chat", "video", "short"):
        network, router = gb[row] * i_net, router_wh(p, gb[row])
        added = dc[row] + network
        out[row] = {"data_center": dc[row], "network": network, "router": router, "device": p["dev_" + device],
                    "activity_added": added, "total": added + router + p["dev_" + device]}
    return out


def catalog(p, sh, dc, net, home):
    i_net = net_intensity(p)
    device = p["dev_" + p["device"]]
    prompt_usd = tokens_usd(p["tok_in_short"], p["tok_out_short"], 0, p["p_in"], p["p_out"])
    turn_wh = tokens_wh(p["coding_fresh"], p["coding_out"], p["coding_cached"], p)
    turn_usd = tokens_usd(p["coding_fresh"], p["coding_out"], p["coding_cached"], p["p_in"], p["p_out"], p["p_cache"])
    # anything scaled by a count uses the mean turn; the median turn is typical, a floor for totals
    mean_turn_wh = tokens_wh(p["coding_fresh_mean"], p["coding_out_mean"], p["coding_cached_mean"], p)
    mean_turn_usd = tokens_usd(p["coding_fresh_mean"], p["coding_out_mean"], p["coding_cached_mean"], p["p_in"], p["p_out"], p["p_cache"])
    code_gb, code_router = p["coding_gb_per_hour"], router_wh(p, p["coding_gb_per_hour"])
    # the 2011 vendor figure reads as whole-service energy, storage inside; storage is printed beside, not added
    seat_wh = p["seat_kwh_yr"] * 1000 / 12
    storage_wh = p["seat_gb"] / 1000 * p["stor_wh_tb_h"] * HOURS / 12 * p["replicas"] * p["pue_hyper"]
    gb_view = p["gb_phone"]

    def hour_row(row, usd):
        s = sh[row]
        out = four([dc(s["data_center"]), net(s["network"]), home(s["router"]), home(s["device"])], usd)
        out["layers"] = {k: s[k] for k in ("data_center", "network", "router", "device")}
        if p["device"] == "phone":  # the phone line is battery energy; the wall figure prints beside it
            out["device_at_wall_wh"] = s["device"] * (1 + p["charger_overhead"])
        return out

    rows = {
        "chat_prompt": four([dc(chat_wh(p))], prompt_usd),
        "chat_hour": hour_row("chat", p["prompts_per_hour"] * prompt_usd),
        "coding_session": four([dc(p["coding_turns"] * turn_wh)], p["coding_turns"] * turn_usd),
        "coding_hour": four([dc(p["turns_per_hour"] * mean_turn_wh), net(code_gb * i_net), home(code_router),
                             home(device)], p["turns_per_hour"] * mean_turn_usd),
        "image": four([dc(p["image_wh"])], p["p_image"]),
        "clip": four([dc(p["clip_wh"])], p["clip_seconds"] * p["p_clip_s"]),
        "search_ai": four([dc(p["search_base_wh"] + p["e_prompt"])], p["p_search"] + prompt_usd),
        "short_hour": hour_row("short", p["rev_meta"]),
        "video_hour": hour_row("video", p["rev_netflix"]),
        "seat_month": four([dc(seat_wh)], p["seat_usd"]),
        "video_delivery": four([dc(gb_view * p["i_dc"]), net(gb_view * i_net)], p["p_delivery"]),
    }
    rows["coding_hour"]["layers"] = {"data_center": p["turns_per_hour"] * mean_turn_wh, "network": code_gb * i_net,
                                     "router": code_router, "device": device}
    rows["coding_hour"]["top_down_usd"] = p["coding_usd_per_active_day"] / p["coding_hours_per_active_day"]
    rows["coding_hour"]["median_turn_wh"] = turn_wh
    rows["coding_session"]["mean_session_wh"] = p["coding_turns_mean"] * mean_turn_wh
    rows["coding_session"]["mean_session_usd"] = p["coding_turns_mean"] * mean_turn_usd
    rows["seat_month"]["laptop_beside_wh"] = p["seat_hours_month"] * p["dev_laptop"]
    rows["seat_month"]["storage_beside_wh"] = storage_wh
    rows["chat_hour"]["at_mean_prompt_wh"] = rows["chat_hour"]["wh"] + p["prompts_per_hour"] * (p["e_prompt_mean"] - chat_wh(p))
    rows["chat_hour"]["paid_plan_usd"] = p["paid_chat_month"] / p["chat_hours_month"]
    rows["video_hour"]["youtube_ads_usd"] = p["rev_youtube"]
    rows["video_hour"]["paid_plan_usd"] = p["paid_video_month"] / p["video_hours_month"]
    rows["search_ai"]["search_revenue_usd"] = p["rev_search"]
    rows["chat_prompt"]["per_m_output"] = {"wh": chat_wh(p) / p["tok_out_short"] * 1e6,
                                           "usd": prompt_usd / p["tok_out_short"] * 1e6}
    rows["coding_session"]["per_m_output"] = {"wh": turn_wh / p["coding_out"] * 1e6, "usd": turn_usd / p["coding_out"] * 1e6}
    return rows, {"prompt_usd": prompt_usd, "turn_wh": turn_wh, "turn_usd": turn_usd, "seat_wh": seat_wh, "i_net": i_net}


def hour_baseline(p, cat, dc, net, home, c):
    """The single baseline: one person-hour, whole chain, for rows the catalog prices per unit."""
    device = p["dev_" + p["device"]]

    def row(added, usd, gb=0.0):
        router = router_wh(p, gb)
        out = four([dc(added), net(gb * c["i_net"]), home(router), home(device)], usd)
        out.update({"added": added + gb * c["i_net"], "router": router, "device": device})
        return out

    search_gb = p["searches_per_hour"] * p["kb_prompt"] / 1e6
    return {
        "image": row(p["images_per_hour"] * cat["image"]["wh"], p["images_per_hour"] * cat["image"]["usd"]),
        "clip": row(p["clips_per_hour"] * cat["clip"]["wh"], p["clips_per_hour"] * cat["clip"]["usd"]),
        "search": row(p["searches_per_hour"] * cat["search_ai"]["wh"], p["searches_per_hour"] * cat["search_ai"]["usd"], search_gb),
        "office": row(cat["seat_month"]["wh"] / p["seat_hours_month"], p["seat_usd"] / p["seat_hours_month"]),
    }


def where_it_runs(p, cat):
    """Move one workload between places: PUE, utilization, site water, and grid change, nothing else."""
    a = p["a_idle"]
    ref = idle_mult(p["u_hyper"], a)
    colo_x = p["pue_colo"] / p["pue_hyper"] * idle_mult(p["u_colo"], a) / ref
    room_x = p["pue_room"] / p["pue_hyper"] * idle_mult(p["u_room"], a) / ref
    device_x = (1 - a) / (1 + a) * p["local_penalty"] / p["pue_hyper"]
    colo_water = gen_water(p, p["gen_colo"])
    work = {
        "prompt": (cat["chat_prompt"], tokens_usd(p["tok_in_short"], p["tok_out_short"], 0, p["p_open_in"], p["p_open_out"])),
        "coding_session": (cat["coding_session"], p["coding_turns"] * tokens_usd(
            p["coding_fresh"], p["coding_out"], p["coding_cached"], p["p_open_in"], p["p_open_out"], p["p_open_cache"])),
        "image": (cat["image"], None),
        "clip": (cat["clip"], None),
    }
    out = {}
    for name, (row, colo_usd) in work.items():
        e = row["wh"]
        room_wh = e * room_x
        out[name] = {
            "hyper": four([layer(e, p["grid_dc"], p["wue_site"], p["w_gen_dc"])], row["usd"]),
            "colo": four([layer(e * colo_x, p["grid_colo"], p["wue_site"], colo_water)], colo_usd),
            # no price: a self-run price needs a yearly count, which this view does not set; comparison D prices the node
            "node": four([layer(room_wh, p["grid_local"], p["wue_local"], gen_water(p, p["gen_local"]))], None),
            "device": four([layer(e * device_x, p["grid_home"], p["wue_local"], gen_water(p, p["gen_home"]))],
                           e * device_x / 1000 * p["tariff_home"]),
        }
    return out


def office_comparison(p, c, dc, home, room, hydro):
    users, seat_wh = p["office_users"], c["seat_wh"]
    cloud_wh = seat_wh * 12 * users
    sync_wh = p["sync_w"] * p["active_hours"] * users
    server_wh = p["office_w"] * HOURS * p["pue_room"]
    hardware = (p["office_box_usd"] + p["office_tb"] * p["hdd_usd_tb"]) / p["life"]
    hours = p["office_admin_h_month"] * 12
    support = p["support_usd_user_yr"] * users

    def price(wage, boxes=1):
        return self_run_price(boxes * hardware, boxes * server_wh / 1000, p["tariff"], hours, wage, support)

    cloud_admin = p["cloud_admin_h_month"] * 12 * p["wage"]  # the cloud's own paid hours, an assumption
    cloud_usd = p["seat_usd"] * 12 * users + cloud_admin
    embodied = (p["emb_desktop_kg"] + p["office_tb"] * p["emb_hdd_kg_tb"]) / p["life"] * 1000
    return {
        "cloud": four([dc(cloud_wh)], cloud_usd),
        "cloud_with_sync": four([dc(cloud_wh), home(sync_wh)], cloud_usd),
        "cloud_same_grid": four([layer(cloud_wh, p["grid_local"], p["wue_site"], gen_water(p, p["gen_local"]), "local")], cloud_usd),
        "local": four([room(server_wh)], price(p["wage"])),
        "local_hydro": four([hydro(server_wh)], price(p["wage"])),
        "local_two_boxes": four([room(2 * server_wh)], price(p["wage"], 2)),
        "readings": {
            "sync_wh": sync_wh,
            "cloud_admin_usd": cloud_admin,
            "vendor_all_scopes_g": p["m365_g_month"] * 12 * users,
            "vendor_scope3_g": p["m365_g_month"] * 12 * users * p["m365_scope3_share"],
            "ratio_energy_local_over_cloud": server_wh / cloud_wh,
            "ratio_energy_two_boxes_over_cloud": 2 * server_wh / cloud_wh,
            "ratio_energy_local_over_cloud_with_sync": server_wh / (cloud_wh + sync_wh),
            "embodied_local_g": embodied,
            "embodied_local_g_low_hdd": (p["emb_desktop_kg"] + p["office_tb"] * p["emb_hdd_low_kg_tb"]) / p["life"] * 1000,
            "water_no_hydro_ml": server_wh * w_gen_nw(p["hydro_share"], 0.0, p["gas_water"]),
            "usd_at_wage": {str(int(w)): price(w) for w in p["wage_readings"]},
            "wage_at_price_tie": _positive(p["seat_usd"] * 12 * users - hardware - server_wh / 1000 * p["tariff"] - support, hours - p["cloud_admin_h_month"] * 12),
            "sync_w_at_energy_tie": (server_wh - cloud_wh) / (p["active_hours"] * users),
        },
    }


def video_comparison(p, c, dc, net, room):
    views_block, gb = p["views_block"], p["gb_phone"]
    idle_on = 1 - p["already_on"]
    platform = four([dc(views_block * gb * p["i_dc"]), net(views_block * gb * c["i_net"])], views_block * p["p_delivery"])
    out = {"platform": platform}
    per_view, idle_view = {}, {}
    box = p["mini_box_usd"] / p["life"]
    hours = p["mini_admin_h_month"] * 12
    for v in p["views"]:
        idle = idle_on * p["mini_w"] * HOURS / v * p["pue_room"]
        wh = p["stream_w"] * p["pue_room"] + idle
        annual = self_run_price(box, wh * v / 1000, p["tariff"], hours, p["wage"])
        # same network on both sides is the default pair; node-only and a marginal-network credit print beside
        row = four([room(views_block * wh), net(views_block * gb * c["i_net"])], annual / v * views_block)
        row["node_only_wh"] = views_block * wh
        row["with_marginal_network_wh"] = views_block * wh + views_block * gb * p["net_fixed_marg"]
        out["local_%d" % v] = row
        per_view[str(v)], idle_view[str(v)] = wh, idle
    first = p["views"][0]
    wh_first = per_view[str(first)]
    cache_wh_gb = p["oca_w"] / (p["oca_gbps"] / 8 * p["oca_load"]) / 3600
    out["cache"] = four([room(views_block * gb * cache_wh_gb + gb * c["i_net"])], None)
    out["readings"] = {
        "platform_ad_revenue_usd": views_block * p["rev_youtube"],
        "viewer_side_wh_per_view": router_wh(p, gb) + p["dev_" + p["device"]],
        "local_wh_per_view": per_view,
        "local_idle_wh_per_view": idle_view,
        "local_usd_per_year": self_run_price(box, wh_first * first / 1000, p["tariff"], hours, p["wage"]),
        "local_usd_per_year_no_staff": self_run_price(box, wh_first * first / 1000, p["tariff"], hours, 0.0),
        "embodied_local_g_per_year": p["emb_mini_kg"] / p["life"] * 1000,
        "cache_wh_per_gb": cache_wh_gb,
    }
    return out


def data_comparison(p, c, dc, net, room):
    """One storage coefficient and one boundary on every row; the already-on setting reaches every local row."""
    n, tb = p["nations"], p["shared_tb"]
    gb_total = tb * 1000
    on = p["already_on"]
    nas_wh = p["nas_w"] * HOURS * p["pue_room"]
    pull_wh = n * gb_total * c["i_net"]
    query_wh = p["fed_moved_share"] * gb_total * 12 * c["i_net"]
    admin = p["nas_admin_h_month"] * 12
    central_wh = tb * p["replicas"] * p["stor_wh_tb_h"] * HOURS * p["pue_hyper"]
    central_admin = p["central_admin_h_month"] * 12 * p["wage"]
    s3 = gb_total * p["p_s3"] * 12 + central_admin
    egress = n * gb_total * p["p_egress"]
    fed_hours = n * p["fed_admin_h_month"] * 12

    def drives_wh(tb_held):
        return tb_held * p["stor_wh_tb_h"] * HOURS * p["pue_room"]

    def local(tb_each, hours, label):
        """n local nodes each holding tb_each: whole boxes, or drives only when the nodes are already on."""
        wh = n * (drives_wh(tb_each) if on else nas_wh)
        hardware = n * (tb_each * p["hdd_usd_tb"] + (0.0 if on else p["nas_chassis_usd"])) / p["life"]
        net_wh = pull_wh if label == "copies" else query_wh
        return four([room(wh), net(net_wh)], self_run_price(hardware, (wh + net_wh) / 1000, p["tariff"], hours, p["wage"]))

    fed_tb = p["fed_tb"] * p["fed_copies"]
    return {
        "ten_copies": local(p["nas_raw_tb"], n * admin, "copies"),
        "central_s3": four([dc(central_wh)], s3),
        "central_s3_with_pulls": four([dc(central_wh), net(pull_wh)], s3 + egress),
        "central_r2": four([dc(central_wh)], gb_total * p["p_r2"] * 12 + central_admin),
        "central_b2": four([dc(central_wh)], tb * p["p_b2_tb"] * 12 + central_admin),
        "federated": local(fed_tb, fed_hours, "query"),
        "federated_replicas": local(p["fed_tb"] * p["replicas"], fed_hours, "query"),
        "readings": {
            "network_one_pull_each_wh": pull_wh,
            "query_wh_per_year": query_wh,
            "federated_wh_nodes_on": n * drives_wh(fed_tb) + query_wh,
            "federated_wh_nodes_not_on": n * nas_wh + query_wh,
            "egress_one_pull_each_usd": egress,
            "central_admin_usd": central_admin,
            "labor_ten_copies_usd": n * admin * p["wage"],
            "embodied_ten_copies_g": n * p["nas_raw_tb"] * p["emb_hdd_kg_tb"] / p["life"] * 1000,
            "embodied_ten_copies_g_low_hdd": n * p["nas_raw_tb"] * p["emb_hdd_low_kg_tb"] / p["life"] * 1000,
            "embodied_federated_g": n * fed_tb * p["emb_hdd_kg_tb"] / p["life"] * 1000,
            "duplicate_bytes_removed_gb": n * gb_total * p["dedupe"],
        },
    }


def compute_comparison(p, dc, room, hydro, home):
    block, t_in, t_out = p["prompts_block"], p["tok_in_median"], p["tok_out_median"]
    a = p["a_idle"]
    effective = t_out + p["prefill_share"] * t_in
    marg = p["j_node"] * effective / 3600 * p["pue_room"]
    idle_on = 1 - p["already_on"]
    fixed = p["node_usd"] / p["life"] + p["node_admin_h_year"] * p["wage"]
    hyper_usd = tokens_usd(t_in, t_out, 0, p["p_in"], p["p_out"])
    open_usd = tokens_usd(t_in, t_out, 0, p["p_open_in"], p["p_open_out"])
    colo_wh = block * p["e_prompt"] / p["pue_hyper"] * p["pue_colo"] * idle_mult(p["u_colo"], a) / idle_mult(p["u_hyper"], a)
    hyper_wh = block * p["e_prompt"]
    fallback_wh = (1 - p["local_coverage"]) * block * p["e_prompt"]
    fallback_usd = (1 - p["local_coverage"]) * block * hyper_usd
    out = {
        "hyper": four([dc(hyper_wh)], block * hyper_usd),
        # the same work on the node's own grid: the only fair carbon pair, since a feed is a place, not an architecture
        "hyper_same_grid": four([layer(hyper_wh, p["grid_local"], p["wue_site"], gen_water(p, p["gen_local"]), "local")], block * hyper_usd),
        "colo": four([layer(colo_wh, p["grid_colo"], p["wue_site"], gen_water(p, p["gen_colo"]))], block * open_usd),
    }
    idle_read = {}
    for name, n in (("node_100k", p["node_prompts_100k"]), ("node_1m", p["node_prompts_1m"])):
        idle = idle_on * p["node_w"] * HOURS / n * p["pue_room"]
        wh = block * (marg + idle)
        annual_kwh = wh / 1000 * n / block
        usd = (fixed + annual_kwh * p["tariff"]) / n * block
        out[name] = four([room(wh)], usd)
        out[name + "_hydro"] = four([hydro(wh)], usd)  # a declared arrangement: the node is behind a hydro meter
        out[name + "_fallback"] = four([room(wh), dc(fallback_wh)], usd + fallback_usd)
        idle_read[name] = block * idle
    laptop_wh = block * p["j_laptop"] * effective / 3600
    phone_wh = block * p["j_phone_query"] / 3600
    phone_wall = phone_wh * p["phone_source_charge_eff"] * (1 + p["charger_overhead"])
    out["laptop"] = four([home(laptop_wh)], laptop_wh / 1000 * p["tariff_home"])
    out["laptop_with_fallback"] = four([home(laptop_wh), dc(fallback_wh)], laptop_wh / 1000 * p["tariff_home"] + fallback_usd)
    out["phone"] = four([home(phone_wh)], phone_wh / 1000 * p["tariff_home"])
    out["phone_wall"] = four([home(phone_wall)], phone_wall / 1000 * p["tariff_home"])
    out["phone_wall_fallback"] = four([home(phone_wall), dc(fallback_wh)], phone_wall / 1000 * p["tariff_home"] + fallback_usd)
    out["readings"] = {
        "token_chain_wh": block * tokens_wh(t_in, t_out, 0, p),
        "hyper_at_mean_prompt_wh": block * p["e_prompt_mean"],
        "hyper_small_model_usd": block * tokens_usd(t_in, t_out, 0, p["p_small_in"], p["p_small_out"]),
        "node_marginal_wh": block * marg,
        "node_idle_wh": idle_read,
        "fallback_wh": fallback_wh,
        "embodied_hyper_g": block * (t_in + t_out) / 1e6 * p["emb_tokens_kg_m"] * 1000,
        "embodied_node_g_100k": p["emb_desktop_kg"] / p["life"] * 1000 / p["node_prompts_100k"] * block,
        "embodied_node_g_1m": p["emb_desktop_kg"] / p["life"] * 1000 / p["node_prompts_1m"] * block,
        "gpu_cost_swing": p["gpu_cost_high"] / p["gpu_cost_low"],
    }
    return out, {"marg": marg, "fixed": fixed, "hyper_usd": hyper_usd, "open_usd": open_usd}


def _positive(numerator, denominator):
    """A crossover exists only when the per-unit gap favors the local option; otherwise it never happens."""
    return numerator / denominator if denominator > 0 else None


def crossovers(p, d):
    """Annual counts above which a local box beats the platform or the hyperscaler. None means never."""
    box_wh = p["mini_w"] * HOURS * p["pue_room"]
    stream = p["stream_w"] * p["pue_room"]
    gb = p["gb_phone"]
    measured, desnz = p["i_dc_measured"] * gb, p["i_dc_desnz"] * gb
    plat_net, marg_net = gb * p["net_fixed_avg"], gb * p["net_fixed_marg"]
    node_wh = p["node_w"] * HOURS * p["pue_room"]
    marg, fixed = d["marg"], d["fixed"]
    e, node_g = p["e_prompt"], marg * p["grid_hydro"]
    hyper_g = e * p["grid_dc"]
    emb_hyper = (p["tok_in_median"] + p["tok_out_median"]) / 1e6 * p["emb_tokens_kg_m"] * 1e6
    emb_node = p["emb_desktop_kg"] / p["life"] * 1e6
    marg_usd = marg / 1000 * p["tariff"]
    return {
        "views_measured_same_network": _positive(box_wh, measured - stream),
        "views_desnz_same_network": _positive(box_wh, desnz - stream),
        "views_measured_network_credit": _positive(box_wh, measured + plat_net - stream - marg_net),
        "views_desnz_network_credit": _positive(box_wh, desnz + plat_net - stream - marg_net),
        "prompts_energy_vs_hyper": _positive(node_wh, e - marg),
        # on one feed the carbon crossover is the energy crossover; the hydro lines are a declared arrangement
        "prompts_carbon_same_grid": _positive(node_wh * p["grid_local"], (e - marg) * p["grid_local"]),
        "prompts_carbon_on_hydro_vs_hyper_us": _positive(node_wh * p["grid_hydro"], hyper_g - node_g),
        "prompts_carbon_on_hydro_with_embodied": _positive(node_wh * p["grid_hydro"] + emb_node, hyper_g + emb_hyper - node_g),
        "prompts_price_vs_hyper_list": _positive(fixed, d["hyper_usd"] - marg_usd),
        "prompts_price_vs_open_weight_host": _positive(fixed, d["open_usd"] - marg_usd),
    }


def lever_rows(p, cat, c, a_opt, b_opt, c_opt, d_opt, dc, net, room):
    block = p["prompts_block"]
    prompt_usd = c["prompt_usd"]
    it = block * p["e_prompt"] / p["pue_hyper"]
    no_cache_wh = p["coding_turns"] * tokens_wh(p["coding_fresh"] + p["coding_cached"], p["coding_out"], 0, p)
    no_cache_usd = p["coding_turns"] * tokens_usd(p["coding_fresh"] + p["coding_cached"], p["coding_out"], 0, p["p_in"], p["p_out"])
    views, gb = p["views_block"], p["gb_phone"]
    plain = four([dc(block * p["e_prompt"])], block * prompt_usd)

    def only_carbon(share):
        out = dict(plain)
        out["g"] = plain["g"] * (1 - share)
        return out

    solar = four([layer(d_opt["node_1m"]["wh"], p["grid_solar"], p["wue_local"], None)], d_opt["node_1m"]["usd"])
    # open_suite is comparison A, not a lever: it raises energy and price, so it has no place in an abatement table
    return {
        "route_small": {
            "before": plain,
            "after": four([dc(block * p["e_prompt"] / p["small_model_factor"])],
                          block * tokens_usd(p["tok_in_short"], p["tok_out_short"], 0, p["p_small_in"], p["p_small_out"])),
        },
        "reasoning_off": {
            "before": four([dc(block * p["e_prompt"] * p["reasoning_energy_mult"])],
                           block * tokens_usd(p["tok_in_short"], p["tok_out_short"] * p["reasoning_output_mult"], 0, p["p_in"], p["p_out"])),
            "after": plain,
        },
        "cache_prefix": {
            "before": four([dc(no_cache_wh)], no_cache_usd),
            "after": {k: cat["coding_session"][k] for k in MEASURES},
        },
        "cache_title": {
            "before": b_opt["platform"],
            "after": four([dc(views * gb * p["i_dc"] * (1 - p["cache_hit"])), net((views * (1 - p["cache_hit"]) + 1) * gb * c["i_net"]),
                           room(views * gb * p["cache_hit"] * b_opt["readings"]["cache_wh_per_gb"])], b_opt["platform"]["usd"]),
        },
        "pool_demand": {"before": d_opt["node_100k"], "after": d_opt["node_1m"]},
        "carbon_time": {"before": plain, "after": only_carbon(p["carbon_temporal"])},
        "carbon_place": {"before": plain, "after": only_carbon(p["carbon_spatial"])},
        "cooling": {
            "before": four([layer(it * p["pue_tower"], p["grid_dc"], p["wue_tower"], gen_water(p, p["gen_dc"]))], plain["usd"]),
            "after": four([layer(it * p["pue_dry"], p["grid_dc"], p["wue_local"], gen_water(p, p["gen_dc"]))], plain["usd"]),
        },
        "local_clean_power": {"before": d_opt["node_1m"], "after": d_opt["node_1m_hydro"], "solar_g": solar["g"]},
        "query_in_place": {"before": c_opt["ten_copies"], "after": c_opt["federated"]},
    }


def top_down(p, cat, sh):
    out = {}
    pairs = {"chat_prompt": cat["chat_prompt"]["wh"], "coding_session": cat["coding_session"]["wh"],
             "seat_month": cat["seat_month"]["wh"], "video_hour": sh["video"]["activity_added"]}
    for key, model_wh in pairs.items():
        usd = cat[key]["usd"]
        revenue_wh = usd * p["eps"] * 1000
        spend_g = usd * p["spend_kg_usd"] * 1000
        model_g = model_wh * p["grid_dc"] / 1000
        out[key] = {"revenue_reading_wh": revenue_wh, "over_model": revenue_wh / model_wh,
                    "spend_reading_g": spend_g, "spend_over_model": spend_g / model_g}
    chat_kilotokens = (p["tok_in_short"] + p["tok_out_short"]) / 1000
    per_hour = p["meta_wh_person_day"] / (p["short_minutes_day"] / 60)
    out["google_ceiling"] = {"wh": chat_kilotokens * p["google_wh_per_1k"],
                             "over_prompt": chat_kilotokens * p["google_wh_per_1k"] / p["e_prompt"]}
    out["meta_ceiling"] = {"wh_per_hour": per_hour, "over_short_data_center": per_hour / sh["short"]["data_center"]}
    return out


def compute(p):
    """The whole model at one setting: a tree of numbers (None where nothing is printed)."""
    dc = lambda wh: layer(wh, p["grid_dc"], p["wue_site"], gen_water(p, p["gen_dc"]))
    net = lambda wh: layer(wh, p["grid_dc"], 0.0, gen_water(p, p["gen_dc"]))
    home = lambda wh: layer(wh, p["grid_home"], 0.0, gen_water(p, p["gen_home"]), "home")
    room = lambda wh: layer(wh, p["grid_local"], p["wue_local"], gen_water(p, p["gen_local"]), "local")
    hydro = lambda wh: layer(wh, p["grid_hydro"], p["wue_local"], p["hydro_conv"], "local")
    sh = same_hour(p)
    cat, c = catalog(p, sh, dc, net, home)
    a_opt = office_comparison(p, c, dc, home, room, hydro)
    b_opt = video_comparison(p, c, dc, net, room)
    c_opt = data_comparison(p, c, dc, net, room)
    d_opt, d_c = compute_comparison(p, dc, room, hydro, home)
    return {
        "same_hour": sh,
        "catalog": cat,
        "hour": hour_baseline(p, cat, dc, net, home, c),
        "where": where_it_runs(p, cat),
        "arch": {"A": a_opt, "B": b_opt, "C": c_opt, "D": d_opt},
        "cross": crossovers(p, d_c),
        "lever": lever_rows(p, cat, c, a_opt, b_opt, c_opt, d_opt, dc, net, room),
        "topdown": top_down(p, cat, sh),
    }


# ---------------------------------------------------------------- loading

def resolve(doc, cm):
    """Inputs by key (same-hour ones read from the comparison model), selectors with options, and base values."""
    inputs = {}
    for key, spec in doc["same_hour_refs"].items():
        node = cm["inputs"]
        for part in spec["path"]:
            node = node[part]
        value = node[spec.get("field", "value")]
        spread = "field" not in spec  # a mean read from the comparison model carries no spread of its own
        inputs[key] = {"central": value, "low": value if not spread or node.get("low") is None else node["low"],
                       "high": value if not spread or node.get("high") is None else node["high"], "unit": node["unit"],
                       "kind": spec["kind"], "status": "same-hour input", "claims": node["claims"],
                       "note": node.get("basis", ""), "segment": node.get("segment", spec.get("segment", ""))}
    inputs.update(doc["params"])
    base = {k: v["central"] for k, v in inputs.items()}
    base.update(doc["scenario"])

    selectors = {}
    for name, sel in doc["selectors"].items():
        sel = dict(sel)
        src = sel.pop("from_comparison", None)
        if src:
            node = cm["assumptions"][src["assumption"]]
            if "presets" in node:
                sel["options"] = {str(v): {src["sets"]: v} for v in node["presets"]}
                sel["default"] = str(node["default"])
            else:
                sel["options"] = {k: {src["sets"]: v, **src.get("also", {}), **({src["names"]: k} if "names" in src else {})} for k, v in node["options"].items()}
                sel["default"] = node["default"]
            sel["why"] = node.get("why", sel.get("why", ""))
        sel["options"] = {o: {k: inputs[v[1:]]["central"] if isinstance(v, str) and v.startswith("@") else v for k, v in setting.items()}
                          for o, setting in sel["options"].items()}
        selectors[name] = sel
        base.update(sel["options"][sel["default"]])
    for key, (selector, option, setting) in doc["scenario_from_selectors"].items():
        base[key] = selectors[selector]["options"][option][setting]
    return inputs, selectors, base


def load(params=PARAMS, comparison=COMPARISON):
    return (json.loads(Path(params).read_text(encoding="utf-8")),
            json.loads(Path(comparison).read_text(encoding="utf-8")))


# ---------------------------------------------------------------- spreads and sensitivity

def flatten(tree, prefix=""):
    out = {}
    for k, v in tree.items():
        key = prefix + "." + k if prefix else k
        if isinstance(v, dict):
            out.update(flatten(v, key))
        elif isinstance(v, (int, float)) and not isinstance(v, bool):
            out[key] = float(v)
    return out


def swept(inputs):
    return [k for k, v in inputs.items() if v["low"] != v["central"] or v["high"] != v["central"]]


def one_at_a_time(inputs, base):
    """Each input alone at its low and at its high, the others central."""
    return {k: (flatten(compute({**base, k: inputs[k]["low"]})), flatten(compute({**base, k: inputs[k]["high"]})))
            for k in swept(inputs)}


def input_extremes(inputs, base, central, oat):
    """Low and high of every result: every input at whichever end lowers or raises that result, the settings fixed."""
    # shortcut: assumes each result moves one way with each input; upgrade to a search if a row stops being monotonic
    keys = list(oat)
    cache, ranges = {}, {}
    for r, c in central.items():
        if r.startswith("cross."):
            continue
        ups = []
        for k in keys:
            lo, hi = oat[k][0].get(r), oat[k][1].get(r)
            ups.append(True if lo is None or hi is None else hi >= lo)
        ups = tuple(ups)
        if ups not in cache:
            lows = {k: inputs[k]["low"] if up else inputs[k]["high"] for k, up in zip(keys, ups)}
            highs = {k: inputs[k]["high"] if up else inputs[k]["low"] for k, up in zip(keys, ups)}
            cache[ups] = (flatten(compute({**base, **lows})), flatten(compute({**base, **highs})))
        vals = [c] + [v for v in (cache[ups][0].get(r), cache[ups][1].get(r)) if v is not None]
        ranges[r] = (min(vals), max(vals))
    return ranges


def selector_runs(selectors, base):
    return {name: {o: flatten(compute({**base, **setting})) for o, setting in sel["options"].items()}
            for name, sel in selectors.items()}


def rank_drivers(result, central, oat, runs, inputs):
    """Inputs and reader settings that move one result, largest swing first."""
    c = central.get(result)
    entries = []
    for k, (lo, hi) in oat.items():
        a, b = lo.get(result), hi.get(result)
        if a is None or b is None or a == b:
            continue
        entries.append({"name": k, "type": "input", "kind": inputs[k]["kind"], "at_low": a, "at_high": b, "swing": abs(b - a)})
    for name, options in runs.items():
        vals = {o: r[result] for o, r in options.items() if result in r}
        if len(set(vals.values())) > 1:
            lo_o, hi_o = min(vals, key=vals.get), max(vals, key=vals.get)
            entries.append({"name": name, "type": "setting", "kind": "setting", "at_low": vals[lo_o], "at_high": vals[hi_o],
                            "low_option": lo_o, "high_option": hi_o, "swing": vals[hi_o] - vals[lo_o]})
    entries.sort(key=lambda e: -e["swing"])
    for e in entries:
        e["swing_over_central"] = e["swing"] / abs(c) if c else None
    return entries


def global_ranking(rows, central, oat, runs, inputs, top=8):
    """Across a set of rows: how often each driver is the largest, and its mean swing over the central value."""
    table = {}
    for m in MEASURES:
        tally = {}
        for row in rows:
            result = "%s.%s" % (row, m)
            if result not in central or not central[result]:
                continue
            ranked = rank_drivers(result, central, oat, runs, inputs)
            for i, e in enumerate(ranked):
                t = tally.setdefault(e["name"], {"name": e["name"], "type": e["type"], "rows_first": 0, "rows_moved": 0, "sum": 0.0})
                t["rows_moved"] += 1
                t["rows_first"] += 1 if i == 0 else 0
                t["sum"] += e["swing_over_central"] or 0.0
        ordered = sorted(tally.values(), key=lambda t: (-t["rows_first"], -t["sum"]))[:top]
        table[m] = [{"name": t["name"], "type": t["type"], "rows_first": t["rows_first"], "rows_moved": t["rows_moved"],
                     "mean_swing_over_central": t["sum"] / t["rows_moved"]} for t in ordered]
    return table


def stability(comparisons, inputs, selectors, base, central, oat, runs):
    """Who wins each printed comparison, and which single input or setting reverses it."""
    out = []
    keys = list(oat)
    for cmp in comparisons:
        a, b = cmp["a"], cmp["b"]
        d0 = central[a] - central[b]
        flips_in, flips_set = [], []
        ups = []
        for k in keys:
            lo, hi = oat[k]
            dl, dh = lo.get(a, central[a]) - lo.get(b, central[b]), hi.get(a, central[a]) - hi.get(b, central[b])
            ups.append(dh >= dl)
            if dl * d0 < 0:
                flips_in.append("%s at %s" % (k, _num(inputs[k]["low"])))
            if dh * d0 < 0:
                flips_in.append("%s at %s" % (k, _num(inputs[k]["high"])))
        for name, options in runs.items():
            for o, r in options.items():
                if a in r and b in r and (r[a] - r[b]) * d0 < 0:
                    flips_set.append("%s = %s" % (name, o))
        lows = {k: inputs[k]["low"] if up else inputs[k]["high"] for k, up in zip(keys, ups)}
        highs = {k: inputs[k]["high"] if up else inputs[k]["low"] for k, up in zip(keys, ups)}
        fa, fb = flatten(compute({**base, **lows})), flatten(compute({**base, **highs}))
        d_lo, d_hi = fa[a] - fa[b], fb[a] - fb[b]
        out.append({"id": cmp["id"], "label": cmp["label"], "a": central[a], "b": central[b],
                    "a_is_lower": d0 < 0, "ratio_a_over_b": central[a] / central[b] if central[b] else None,
                    "flips_on_one_input": flips_in, "flips_on_one_setting": flips_set,
                    "flips_with_all_inputs_at_extremes": d_lo * d_hi < 0,
                    "stable": not flips_in and not flips_set})
    return out


def _num(x):
    return "%g" % x


def crossover_spread(central_tree, oat, runs):
    out = {}
    for key, value in central_tree["cross"].items():
        r = "cross." + key
        vals, never = [], []
        if value is None:
            never.append("central")
        else:
            vals.append(value)
        for k, (lo, hi) in oat.items():
            for end, flat in (("low", lo), ("high", hi)):
                if r in flat:
                    vals.append(flat[r])
                elif value is not None:
                    never.append("%s %s" % (k, end))
        for name, options in runs.items():
            for o, flat in options.items():
                if r in flat:
                    vals.append(flat[r])
                elif value is not None:
                    never.append("%s = %s" % (name, o))
        out[key] = {"value": value, "low_one_input_or_setting": min(vals) if vals else None,
                    "high_one_input_or_setting": max(vals) if vals else None, "never_under": never}
    return out


# ---------------------------------------------------------------- calibration and regression

def t95(df):
    """Two-sided 95 percent t critical value: exact for one and two degrees of freedom, Cornish-Fisher above."""
    if df <= 2:
        return {1: 12.706, 2: 4.303}[df]
    z = statistics.NormalDist().inv_cdf(0.975)
    return (z + (z ** 3 + z) / (4 * df) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df ** 2)
            + (3 * z ** 7 + 19 * z ** 5 + 17 * z ** 3 - 15 * z) / (384 * df ** 3))


def within_fe(rows):
    """One regressor with group fixed effects, closed form. rows: (group, x, y). Plain standard error."""
    groups = {}
    for g, x, y in rows:
        groups.setdefault(g, []).append((x, y))
    points = []
    for values in groups.values():
        mx = sum(v[0] for v in values) / len(values)
        my = sum(v[1] for v in values) / len(values)
        points += [(x - mx, y - my) for x, y in values]
    sxx = sum(x * x for x, _ in points)
    b = sum(x * y for x, y in points) / sxx
    rss = sum((y - b * x) ** 2 for x, y in points)
    tss = sum(y * y for _, y in points)
    df = len(points) - len(groups) - 1
    se = math.sqrt(rss / df / sxx) if df > 0 else None
    half = t95(df) * se if df > 0 else None
    return {"b": b, "se": se, "t": b / se if se else None, "ci95": [b - half, b + half] if half is not None else None,
            "n": len(points), "groups": len(groups), "df": df, "r2_within": 1 - rss / tss if tss else None}


def ols(X, y):
    """Least squares by normal equations, X'X inverted by Gauss-Jordan; coefficients and plain standard errors."""
    k, n = len(X[0]), len(y)
    m = [[sum(r[i] * r[j] for r in X) for j in range(k)] + [1.0 if i == j else 0.0 for j in range(k)] for i in range(k)]
    for i in range(k):
        piv = max(range(i, k), key=lambda r: abs(m[r][i]))
        m[i], m[piv] = m[piv], m[i]
        d = m[i][i]
        if abs(d) < 1e-12:
            raise ValueError("singular design: a regressor is collinear")
        m[i] = [v / d for v in m[i]]
        for r in range(k):
            if r != i and m[r][i]:
                f = m[r][i]
                m[r] = [a - f * b for a, b in zip(m[r], m[i])]
    inv = [row[k:] for row in m]
    xty = [sum(r[i] * yi for r, yi in zip(X, y)) for i in range(k)]
    b = [sum(inv[i][j] * xty[j] for j in range(k)) for i in range(k)]
    rss = sum((yi - sum(bi * xi for bi, xi in zip(b, r))) ** 2 for r, yi in zip(X, y))
    df = n - k
    s2 = rss / df if df > 0 else None
    return {"b": b, "se": [math.sqrt(s2 * inv[i][i]) if s2 is not None else None for i in range(k)], "n": n, "df": df}


def trend_controlled(rows):
    """The cloud panel with a time control, four ways. Each slope on log revenue is a descriptive partial
    correlation inside a common growth trend, not an elasticity; with three firms no significance test exists."""
    firms, years = sorted({r["company"] for r in rows}), sorted({r["year"] for r in rows})
    y = [math.log(r["twh"]) for r in rows]
    x = [math.log(r["revenue_usd_billion"]) for r in rows]
    t = [float(r["year"] - years[0]) for r in rows]
    fd = [[1.0 if r["company"] == f else 0.0 for f in firms[1:]] for r in rows]
    yd = [[1.0 if r["year"] == yr else 0.0 for yr in years[1:]] for r in rows]

    def run(extra):
        f = ols([[1.0, xi] + e for xi, e in zip(x, extra)], y)
        return {"b": f["b"][1], "se": f["se"][1], "n": f["n"], "df": f["df"]}

    by = sorted(rows, key=lambda r: (r["company"], r["year"]))
    pairs = [(math.log(b["revenue_usd_billion"] / a["revenue_usd_billion"]), math.log(b["twh"] / a["twh"]))
             for a, b in zip(by, by[1:]) if a["company"] == b["company"] and b["year"] == a["year"] + 1]
    f = ols([[1.0, dx] for dx, _ in pairs], [dy for _, dy in pairs])
    return {
        "common_trend": run([d + [ti] for d, ti in zip(fd, t)]),
        "firm_trends": run([d + [ti if r["company"] == fm else 0.0 for fm in firms] for d, ti, r in zip(fd, t, rows)]),
        "year_effects": run([d + yi for d, yi in zip(fd, yd)]),
        "first_differences": {"b": f["b"][1], "se": f["se"][1], "intercept_log_per_year": f["b"][0], "intercept_se": f["se"][0],
                              "n": f["n"], "df": f["df"]},
    }


def panel_rows(panel):
    return [dict(r, twh=r["mwh"] / 1e6, kwh_per_usd=r["mwh"] * 1000 / (r["revenue_usd_billion"] * 1e9)) for r in panel["rows"]]


def slope(rows):
    """A within-firm slope with its plain standard error only: no t, interval, or R2, which read as inference."""
    return {k: v for k, v in within_fe(rows).items() if k not in ("t", "ci95", "r2_within")}


def regression(panel):
    rows = panel_rows(panel)
    cloud = [r for r in rows if r["company"] in panel["cloud_ai_firms"]]
    log = lambda sub: [(r["company"], math.log(r["revenue_usd_billion"]), math.log(r["twh"])) for r in sub]
    latest = {}
    for r in cloud:
        if r["company"] not in latest or r["year"] > latest[r["company"]]["year"]:
            latest[r["company"]] = r
    ratios = sorted(r["kwh_per_usd"] for r in latest.values())
    per_firm = {}
    for company in sorted({r["company"] for r in rows}):
        sub = [r for r in rows if r["company"] == company]
        per_firm[company] = slope(log(sub)) if len(sub) >= 3 else {"b": None, "n": len(sub)}
        per_firm[company]["first_year"], per_firm[company]["last_year"] = sub[0]["year"], sub[-1]["year"]
        per_firm[company]["first_kwh_per_usd"], per_firm[company]["last_kwh_per_usd"] = sub[0]["kwh_per_usd"], sub[-1]["kwh_per_usd"]
    trend = trend_controlled(cloud)
    return {
        "model": "log electricity on log revenue, company fixed effects: a descriptive within-firm slope, not an elasticity; "
                 "the trend-controlled table is the reading that matters",
        "cloud_ai_firms": slope(log(cloud)),
        "all_firms": slope(log(rows)),
        "trend_controlled": trend,
        "growth_per_year_whatever_revenue_did": math.exp(trend["first_differences"]["intercept_log_per_year"]) - 1,
        "leave_one_firm_out": {f: slope(log([r for r in cloud if r["company"] != f])) for f in panel["cloud_ai_firms"]},
        "per_firm": per_firm,
        "drift_per_year": slope([(r["company"], r["year"], math.log(r["kwh_per_usd"])) for r in cloud]),
        "eps_latest": {f: {"year": r["year"], "kwh_per_usd": r["kwh_per_usd"]} for f, r in latest.items()},
        "eps_median": statistics.median(ratios),
        "eps_spread": [ratios[0], ratios[-1]],
        "not_supported": panel["not_supported"],
    }


def profile_ratio(figures, grid=None):
    """Fit one scale and one decode-to-prefill ratio in logs: ln E = ln s + ln(t_in + r t_out). Profile over r."""
    grid = grid or [1 + i * 0.1 for i in range(391)]
    n = len(figures)

    def sse(r):
        res = [math.log(f["published"]) - math.log(f["t_in"] + r * f["t_out"]) for f in figures]
        mean = sum(res) / n
        return sum((x - mean) ** 2 for x in res), math.exp(mean)

    values = [(r, *sse(r)) for r in grid]
    best = min(values, key=lambda v: v[1])
    limit = best[1] * (1 + t95(n - 2) ** 2 / (n - 2)) if n > 2 else None
    inside = [v[0] for v in values if limit is not None and v[1] <= limit]
    return {"n": n, "free_parameters": 2, "df": n - 2, "best_ratio": best[0], "scale_wh_per_1k_input": best[2] * 1000,
            "rmse_log": math.sqrt(best[1] / (n - 2)) if n > 2 else None,
            "sse_at_best": best[1], "sse_at_3": sse(3.0)[0], "sse_at_10": sse(10.0)[0],
            "ci95_ratio": [min(inside), max(inside)] if inside else None}


def linear_fit(figures):
    """Least squares on relative error: E = x t_in + y t_out, facility included. Standard errors from the residual."""
    a = [f["t_in"] / f["published"] for f in figures]
    b = [f["t_out"] / f["published"] for f in figures]
    saa, sab, sbb = sum(x * x for x in a), sum(x * y for x, y in zip(a, b)), sum(y * y for y in b)
    sa, sb = sum(a), sum(b)
    det = saa * sbb - sab * sab
    x, y = (sa * sbb - sab * sb) / det, (saa * sb - sab * sa) / det
    rss = sum((x * p + y * q - 1) ** 2 for p, q in zip(a, b))
    df = len(figures) - 2
    s2 = rss / df if df > 0 else None
    return {"n": len(figures), "df": df, "wh_per_1k_input": x * 1000, "wh_per_1k_output": y * 1000,
            "se_input": math.sqrt(s2 * sbb / det) * 1000 if s2 is not None else None,
            "se_output": math.sqrt(s2 * saa / det) * 1000 if s2 is not None else None,
            "ratio": y / x if x else None, "rmse_relative": math.sqrt(rss / len(figures))}


def calibrate(p, cal):
    """Only these, only on these figures. Nothing here sets a coefficient on a held-out row."""
    s = cal["sf008"]
    a_sf = solve_idle_fraction(s["power_ratio"], s["u1"], s["u2"])
    a_block = {
        "from_sf008": a_sf, "from_sv039": cal["sv039_idle_fraction"], "midpoint": (a_sf + cal["sv039_idle_fraction"]) / 2,
        "central_used": p["a_idle"], "gpu_floor_ec020": cal["ec020_gpu_idle_w"] / cal["ec020_gpu_max_w"], "guide_ceiling_lf024": cal["lf024_idle_fraction"],
        "standard_error": None, "n": 2,
        "note": "Two anchors, neither a sample, so no standard error exists. The central value is chosen between them, not estimated.",
        "idle_mult_at_room_u": {"low_a": idle_mult(p["u_room"], cal["a_low"]), "central_a": idle_mult(p["u_room"], p["a_idle"]), "high_a": idle_mult(p["u_room"], cal["a_high"])},
    }
    ei_out, pue, c = p["ei_out"], p["pue_hyper"], p["cache_share"]
    anchor = cal["google_anchor"]
    rows = []
    for f in cal["ratio_figures"]:
        ti, to, pub = f["t_in"], f["t_out"], f["published"]
        anch = {}
        for r in (3.0, 10.0):
            ei = anchor["it_wh"] * 1000 / (anchor["t_in"] + anchor["t_out"] * r)
            anch[r] = chain_wh(ti, to, 0, ei, r * ei, c, pue) / pub
        rows.append({"id": f["id"], "label": f["label"], "t_in": ti, "t_out": to, "published_wh": pub,
                     "ratio_3": chain_wh(ti, to, 0, p["ei_in"], ei_out, c, pue) / pub,
                     "ratio_10": chain_wh(ti, to, 0, ei_out / 10, ei_out, c, pue) / pub,
                     "ratio_10_anchored_to_google": anch[10.0], "ratio_3_anchored_to_google": anch[3.0]})
    return {
        "idle_fraction": a_block,
        "decode_to_prefill": {
            "kept": p["decode_ratio"], "figures": rows,
            "profile_all": profile_ratio(cal["ratio_figures"]),
            "profile_without_small_model": profile_ratio([f for f in cal["ratio_figures"] if f["id"] != cal["small_model_id"]]),
            "linear_all": linear_fit(cal["ratio_figures"]),
            "linear_without_small_model": linear_fit([f for f in cal["ratio_figures"] if f["id"] != cal["small_model_id"]]),
            "decision": cal["ratio_decision"],
        },
        "cache_share": {"central": p["cache_share"], "note": cal["cache_note"]},
    }


# ---------------------------------------------------------------- back-test

def backtest_model(fig, p, tree):
    kind = fig["model"]
    if kind == "token_chain":
        return tokens_wh(fig["t_in"], fig["t_out"], 0, p)
    if kind == "video_dc":
        return fig["gb"] * p["i_dc_measured"]
    if kind == "tv_hour":
        return same_hour({**p, "device": "tv"})["video"]["total"]
    if kind == "storage_device":
        return p["stor_wh_tb_h"] * HOURS / 1000
    if kind == "office_server_per_user":
        return p["office_w"] * HOURS * p["pue_room"] / 1000 / p["office_users"]
    if kind == "seat_g":
        return tree["catalog"]["seat_month"]["g"]
    if kind == "revenue_reading":
        return p["eps"] * 1000
    if kind == "typed_prompt":
        return token_run(p, fig["tokens"] / fig["prompts"], fig["cached_share"], fig["output_share"])[0]
    if kind == "coding_hour_usd":
        return tree["catalog"]["coding_hour"]["usd"]
    raise ValueError(kind)


def backtest(figures, p, tree):
    rows = []
    for f in figures:
        model = backtest_model(f, p, tree)
        ratio = model / f["published"]
        rows.append({"id": f["id"], "label": f["label"], "unit": f["unit"], "published": f["published"], "model": model,
                     "ratio": ratio, "factor": max(ratio, 1 / ratio), "within_2x": 0.5 <= ratio <= 2.0,
                     "independent": f["independent"], "known_miss": f.get("known_miss", ""), "note": f["note"]})
    return rows


def backtest_summary(rows):
    def stats(sub):
        factors = [r["factor"] for r in sub]
        return {"n": len(sub), "median_factor": statistics.median(factors), "within_2x": sum(r["within_2x"] for r in sub),
                "worst_factor": max(factors), "geometric_mean_factor": math.exp(sum(math.log(x) for x in factors) / len(factors))}
    return {"all": stats(rows), "independent": stats([r for r in rows if r["independent"]])}


# ---------------------------------------------------------------- assembly

def sig(x, n=6):
    if x is None or x == 0 or not isinstance(x, (int, float)) or isinstance(x, bool):
        return x
    return float("%.*g" % (n, x))


def rounded(obj, n=6):
    if isinstance(obj, dict):
        return {k: rounded(v, n) for k, v in obj.items()}
    if isinstance(obj, list):
        return [rounded(v, n) for v in obj]
    return sig(obj, n) if isinstance(obj, float) else obj


def measure_block(path, m, central, ranges):
    key = "%s.%s" % (path, m)
    value = central.get(key)
    low, high = ranges.get(key, (None, None))
    return {"value": value, "low": low, "high": high}


def drivers_block(path, central, oat, runs, inputs, top=3):
    out = {}
    for m in MEASURES:
        result = "%s.%s" % (path, m)
        if result in central:
            out[m] = [{k: e.get(k) for k in ("name", "type", "at_low", "at_high", "low_option", "high_option", "swing_over_central") if e.get(k) is not None}
                      for e in rank_drivers(result, central, oat, runs, inputs)[:top]]
    return out


def row_out(path, meta, ctx, labels):
    central, ranges, tree = ctx["central"], ctx["ranges"], ctx["tree"]
    label_set = labels[meta["labels"]]
    node = tree
    for part in path.split("."):
        node = node[part]
    drivers = drivers_block(path, central, ctx["oat"], ctx["runs"], ctx["inputs"])
    out = {"key": path, "label": meta["label"], "unit": meta.get("unit", ""), "counted": meta.get("counted", ""), "basis": meta.get("basis", ctx["default_basis"]),
           "energy_wh": measure_block(path, "wh", central, ranges),
           "price_usd": dict(measure_block(path, "usd", central, ranges), basis=meta["price_basis"], date=ctx["price_date"], note=meta.get("price_note", "")),
           "co2e_g": dict(measure_block(path, "g", central, ranges), grid=label_set["grid"]),
           "water_ml": dict(measure_block(path, "ml", central, ranges), convention=label_set["water"]),
           "claims": meta.get("claims", []), "drivers": drivers,
           "moves_most": {m: d[0]["name"] for m, d in drivers.items() if d}}
    for extra in ("rate", "note", "quality"):
        if extra in meta:
            out[extra] = meta[extra]
    for k, v in node.items():
        if k in MEASURES:
            continue
        if k.endswith("_usd"):
            spec = ctx["price_readings"][k]
            low, high = ranges.get("%s.%s" % (path, k), (v, v))
            out.setdefault("price_readings", []).append({"label": spec["label"], "value": v, "low": low, "high": high, "basis": spec["basis"], "date": ctx["price_date"]})
        else:
            out[k] = v
    return out


def catalog_snapshot(tree, rows):
    return {r: {m: tree["catalog"][r][m] for m in MEASURES} for r in rows}


def build(doc, cm):
    inputs, selectors, base = resolve(doc, cm)
    tree = compute(base)
    central = flatten(tree)
    oat = one_at_a_time(inputs, base)
    ranges = input_extremes(inputs, base, central, oat)
    runs = selector_runs(selectors, base)
    ctx = {"central": central, "ranges": ranges, "tree": tree, "oat": oat, "runs": runs, "inputs": inputs, "price_date": doc["price_date"], "price_readings": doc["price_readings"], "default_basis": doc["default_basis"]}
    labels, rows = doc["labels"], doc["rows"]
    cat_keys = [k for k in rows if k.startswith("catalog.")]
    cat_names = [k.split(".")[1] for k in cat_keys]

    # the same-hour rows must reproduce the comparison model at default, low, and high
    sh_keys = list(doc["same_hour_refs"])
    all_low = {**base, **{k: inputs[k]["low"] for k in sh_keys}}
    all_high = {**base, **{k: inputs[k]["high"] for k in sh_keys}}
    variants = dict(doc["same_hour_variants"])
    sh_out = {"default": same_hour(base), "low": same_hour(all_low), "high": same_hour(all_high)}
    for name, change in variants.items():
        overrides = {}
        for selector, option in change.items():
            overrides.update(selectors[selector]["options"][option])
        sh_out[name] = same_hour({**base, **overrides})
    target = cm["computed_defaults"]["same_hour"]
    for name in target:
        for row in target[name]:
            for field, value in target[name][row].items():
                if abs(sh_out[name][row][field] - value) > 1e-6:
                    raise AssertionError("same-hour drift at %s %s %s: %r against %r" % (name, row, field, sh_out[name][row][field], value))

    architectures = {}
    for letter, spec in doc["architectures"].items():
        options = []
        for name, meta in spec["options"].items():
            options.append(row_out("arch.%s.%s" % (letter, name), meta, ctx, labels))
        readings = {}
        for k, v in flatten(tree["arch"][letter].get("readings", {})).items():
            low, high = ranges.get("arch.%s.readings.%s" % (letter, k), (v, v))
            readings[k] = dict(doc["reading_labels"][k.split(".")[0]], value=v, low=low, high=high)
            if "basis" in readings[k]:
                readings[k]["date"] = doc["price_date"]
        architectures[letter] = {"title": spec["title"], "unit_of_comparison": spec["unit"], "options": options, "readings": readings,
                                 "wins": spec["wins"], "loses": spec["loses"], "note": spec.get("note", "")}

    where = {}
    for w, wm in doc["workloads"].items():
        where[w] = {"label": wm["label"], "places": {}}
        for pl, pm in doc["place_rows"].items():
            meta = dict(pm)
            if w in ("image", "clip") and pl == "colo":
                meta["price_basis"], meta["price_note"] = "none", "No open-weight host list price in the record for this work."
            where[w]["places"][pl] = row_out("where.%s.%s" % (w, pl), meta, ctx, labels)

    levers = []
    for key, spec in doc["levers"].items():
        lever = {k: spec[k] for k in ("label", "term", "size_in_record", "evidence", "reference", "note") if k in spec}
        lever["key"] = key
        for side in ("before", "after"):
            lever[side] = row_out("lever.%s.%s" % (key, side), dict(spec[side], label=spec[side].get("label", spec["label"] + ", " + side)), ctx, labels)
        for extra, v in tree["lever"][key].items():
            if extra not in ("before", "after"):
                lever[extra] = v
        before, after = tree["lever"][key]["before"], tree["lever"][key]["after"]
        lever["after_over_before"] = {m: after[m] / before[m] for m in MEASURES if before[m] and after[m] is not None}
        levers.append(lever)

    hour = []
    for key, meta in doc["hour_rows"].items():
        row = row_out("hour." + key, meta, ctx, labels)
        hour.append(row)

    places = []
    for key, pl in doc["places"].items():
        out = dict(pl)
        for field in ("pue", "u", "site_water"):
            if pl.get(field):
                spec = inputs[pl[field]]
                out[field] = {"value": spec["central"], "low": spec["low"], "high": spec["high"], "input": pl[field]}
        places.append(dict(out, key=key))

    cat_rows = [row_out(k, rows[k], ctx, labels) for k in cat_keys]
    p0 = {**base}
    calibration = calibrate(p0, doc["calibration_figures"])
    reg = regression(doc["panel"])
    bt = backtest(doc["backtest_figures"], p0, tree)
    stable = stability(doc["comparisons"], inputs, selectors, base, central, oat, runs)
    cross_spread = crossover_spread(tree, oat, runs)

    arch_paths = ["arch.%s.%s" % (l, n) for l, s in doc["architectures"].items() for n in s["options"]]
    selector_out = {}
    for name, options in runs.items():
        selector_out[name] = {}
        for o, flat in options.items():
            changed = {}
            for path in cat_keys + arch_paths:
                row = {m: flat.get("%s.%s" % (path, m)) for m in MEASURES}
                if any(row[m] != central.get("%s.%s" % (path, m)) for m in MEASURES):
                    changed[path] = row
            selector_out[name][o] = changed

    snap = lambda suffix: {r: {m: ranges.get("catalog.%s.%s" % (r, m), (None, None))[suffix] for m in MEASURES} for r in cat_names}
    sens_rows = {k: drivers_block(k, central, oat, runs, inputs, top=3) for k in cat_keys}
    output = {
        "schema": 1, "tier": "T0", "built": doc["built"], "price_date": doc["price_date"], "purpose": doc["purpose"],
        "units": doc["units"], "said_aloud": doc["said_aloud"], "baseline": doc["baseline"], "range_label": doc["range_label"],
        "kinds": doc["kinds"], "inputs": _inputs_out(inputs), "assumptions": _selectors_out(selectors), "places": places,
        "catalog": cat_rows, "hour_baseline": hour, "where_it_runs": where, "architectures": architectures, "levers": levers,
        "crossovers": cross_spread, "top_down": {"label": doc["top_down_label"], "rows": flatten(tree["topdown"])},
        "qualitative": doc["qualitative"], "disclaimer": doc["disclaimer"], "project_scale": doc["project_scale"],
        "calibration": calibration, "regression": reg,
        "backtest": {"rows": bt, "summary": backtest_summary(bt), "note": doc["backtest_note"]},
        "sensitivity": {"method": doc["sensitivity_method"], "rows": sens_rows,
                        "global_catalog": global_ranking(cat_keys, central, oat, runs, inputs),
                        "global_architectures": global_ranking(arch_paths, central, oat, runs, inputs)},
        "stability": {"method": doc["stability_method"], "comparisons": stable},
        "computed_defaults": {
            "settings": {name: sel["default"] for name, sel in selectors.items()},
            "same_hour": sh_out,
            "catalog": {"default": catalog_snapshot(tree, cat_names), "low": snap(0), "high": snap(1)},
            "selectors": selector_out,
            "crossovers": tree["cross"],
        },
    }
    same = output["computed_defaults"].pop("same_hour")
    output = rounded(output)
    output["computed_defaults"]["same_hour"] = same  # kept exact: the tests compare it to the comparison model
    return output


def _inputs_out(inputs):
    return {k: {"value": v["central"], "low": v["low"], "high": v["high"], "unit": v["unit"], "basis": v["kind"], "status": v["status"],
                "claims": v["claims"], "segment": v.get("segment", ""), "note": v.get("note", "")} for k, v in inputs.items()}


def _selectors_out(selectors):
    return {k: {"default": s["default"], "options": s["options"], "label": s["label"], "why": s.get("why", "")} for k, s in selectors.items()}


# ---------------------------------------------------------------- report

def _range(block, fmt="%.3g"):
    if block["value"] is None:
        return "none"
    return (fmt + " (" + fmt + " to " + fmt + ")") % (block["value"], block["low"], block["high"])


def report(out):
    print("Resource Use Explorer model, built %s, prices as of %s" % (out["built"], out["price_date"]))
    print(out["range_label"])
    print("\nCATALOG at default settings; range is input extremes")
    for r in out["catalog"]:
        print("  %-34s %s Wh | $%s | %s g | %s mL" % (r["label"][:34], _range(r["energy_wh"]), _range(r["price_usd"]), _range(r["co2e_g"]), _range(r["water_ml"])))
        print("      moves most: " + ", ".join("%s %s" % (m, n) for m, n in r["moves_most"].items()))
    print("\nCALIBRATION")
    cal = out["calibration"]
    i = cal["idle_fraction"]
    print("  idle fraction a: sf-008 solves to %.3f, sv-039 states %.2f, midpoint %.3f, used %.2f; n = %d anchors, no standard error" % (i["from_sf008"], i["from_sv039"], i["midpoint"], i["central_used"], i["n"]))
    d = cal["decode_to_prefill"]
    for f in d["figures"]:
        print("  ratio test %-7s model over published: ratio 3 = %.2f, ratio 10 = %.2f, ratio 10 anchored to the Google prompt = %.2f" % (f["id"], f["ratio_3"], f["ratio_10"], f["ratio_10_anchored_to_google"]))
    for name in ("profile_all", "profile_without_small_model"):
        q = d[name]
        print("  %s: n = %d, df = %d, best ratio %.1f, rmse(log) %s, SSE at 3 %.3f, at 10 %.3f, 95 percent interval %s" % (name, q["n"], q["df"], q["best_ratio"], "%.2f" % q["rmse_log"] if q["rmse_log"] else "n/a", q["sse_at_3"], q["sse_at_10"], q["ci95_ratio"]))
    for name in ("linear_all", "linear_without_small_model"):
        q = d[name]
        print("  %s: n = %d, df = %d, Wh per 1k input %.3f (se %.3f), output %.3f (se %.3f), ratio %.1f" % (name, q["n"], q["df"], q["wh_per_1k_input"], q["se_input"], q["wh_per_1k_output"], q["se_output"], q["ratio"]))
    print("\nREGRESSION: " + out["regression"]["model"])
    for name in ("cloud_ai_firms", "all_firms"):
        q = out["regression"][name]
        print("  %-16s within slope b = %.2f, se %.2f, n = %d, firms = %d, df = %d (descriptive)" % (name, q["b"], q["se"], q["n"], q["groups"], q["df"]))
    for name, q in out["regression"]["trend_controlled"].items():
        print("  %-18s b = %.2f, se %.2f, n = %d, df = %d%s" % (name, q["b"], q["se"], q["n"], q["df"],
              "; intercept %.2f log points a year (se %.2f)" % (q["intercept_log_per_year"], q["intercept_se"]) if "intercept_log_per_year" in q else ""))
    print("  electricity grew about %.0f percent a year whatever revenue did" % (100 * out["regression"]["growth_per_year_whatever_revenue_did"]))
    q = out["regression"]["drift_per_year"]
    print("  drift of log kWh per dollar per year, cloud and AI firms: %.3f, se %.3f, n = %d, df = %d" % (q["b"], q["se"], q["n"], q["df"]))
    print("  eps median %.3f, spread %.3f to %.3f" % (out["regression"]["eps_median"], *out["regression"]["eps_spread"]))
    print("\nBACK-TEST, model over published")
    for r in out["backtest"]["rows"]:
        print("  %-7s %-52s %10.4g against %10.4g %-14s ratio %5.2f  factor %5.2f %s" % (r["id"], r["label"][:52], r["model"], r["published"], r["unit"][:14], r["ratio"], r["factor"], "" if r["independent"] else "(not independent)"))
    for name, s in out["backtest"]["summary"].items():
        print("  %-12s n = %d, median factor %.2f, within two times %d, worst %.1f" % (name, s["n"], s["median_factor"], s["within_2x"], s["worst_factor"]))
    print("\nSENSITIVITY: drivers across the catalog (rows first, mean swing over central)")
    for m in MEASURES:
        print("  %-3s " % m + ", ".join("%s (%d, %.1f)" % (e["name"], e["rows_first"], e["mean_swing_over_central"]) for e in out["sensitivity"]["global_catalog"][m][:6]))
    print("\nSTABILITY: comparisons that reverse")
    for s in out["stability"]["comparisons"]:
        if not s["stable"]:
            print("  %-58s a %.4g, b %.4g; reverses on: %s" % (s["label"][:58], s["a"], s["b"], "; ".join((s["flips_on_one_input"] + s["flips_on_one_setting"])[:5]) or "all inputs at extremes"))
    print("\nCROSSOVERS (annual count; never means the local option does not catch up)")
    for k, c in out["crossovers"].items():
        print("  %-42s %s (one change: %s to %s; never under %d changes)" % (k, _opt(c["value"]), _opt(c["low_one_input_or_setting"]), _opt(c["high_one_input_or_setting"]), len(c["never_under"])))


def _opt(x):
    return "never" if x is None else "%.3g" % x


# ---------------------------------------------------------------- self-test

def self_test():
    close = lambda x, y, t=1e-9: abs(x - y) <= t
    assert close(idle_mult(0.5, 0.3), 1.0) and idle_mult(0.1, 0.3) > idle_mult(0.3, 0.3) > 1.0
    assert close(idle_mult(0.5, 0.9), 1.0)
    a = solve_idle_fraction(1.7, 0.1, 0.4)
    assert close((a + (1 - a) * 0.4) / (a + (1 - a) * 0.1), 1.7)
    assert close(w_gen_nw(1.0, 7.0, 1.0), 7.0) and close(w_gen_nw(0.0, 7.0, 1.0), 1.0)
    assert close(chain_wh(1000, 1000, 1000, 1.0, 3.0, 0.1, 1.0), 4.1)
    assert close(tokens_usd(1e6, 1e6, 1e6, 2.0, 10.0, 0.1), 12.1)
    p = {"ei_in": 1.0, "ei_out": 3.0, "cache_share": 0.1, "pue_hyper": 1.0, "p_in": 2.0, "p_out": 10.0, "p_cache": 0.1}
    wh, usd = token_run(p, 1000, 0.9, 0.05)
    assert close(wh, (50 + 900 * 0.1 + 50 * 3) / 1000) and close(usd, (100 + 90 + 500) / 1e6)
    row = four([layer(1000, 300, 0.5, 2.0), layer(1000, 100, 0.0, None)], 1.0)
    assert row["wh"] == 2000 and close(row["g"], 400) and row["ml"] is None
    assert close(four([layer(1000, 0, 0.5, 2.0)])["ml"], 2500)
    assert close(self_run_price(10, 100, 0.1, 2, 50), 120)
    assert _positive(1, 0) is None and _positive(1, -1) is None and _positive(4, 2) == 2
    f = within_fe([("a", 1, 2), ("a", 2, 4.1), ("a", 3, 5.9), ("b", 1, 12), ("b", 2, 14), ("b", 3, 16.1)])
    assert 1.9 < f["b"] < 2.1 and f["df"] == 3 and f["n"] == 6 and f["se"] < 0.1 and f["r2_within"] > 0.99
    assert close(t95(13), 2.160, 0.002) and close(t95(30), 2.042, 0.002) and t95(1) > t95(2) > t95(3)
    figs = [{"t_in": t, "t_out": o, "published": 0.001 * (t + 4 * o)} for t, o in ((1000, 100), (100, 1000), (500, 500), (2000, 50))]
    prof = profile_ratio(figs)
    assert close(prof["best_ratio"], 4.0, 0.11) and prof["sse_at_best"] < 1e-3
    lin = linear_fit(figs)
    assert close(lin["ratio"], 4.0, 1e-6) and close(lin["wh_per_1k_input"], 1.0, 1e-6)
    assert flatten({"a": {"b": 1, "c": None}, "d": 2.5}) == {"a.b": 1.0, "d": 2.5}
    assert sig(123456.789, 3) == 123000.0 and sig(None) is None and sig(0) == 0
    o = ols([[1.0, 0.0], [1.0, 1.0], [1.0, 2.0], [1.0, 3.0]], [1.0, 3.1, 4.9, 7.0])
    assert close(o["b"][1], 1.98, 1e-9) and close(o["b"][0], 1.03, 1e-9) and o["df"] == 2 and close(o["se"][1], math.sqrt(0.009 / 5), 1e-9)
    tr = trend_controlled([{"company": c, "year": 2020 + i, "revenue_usd_billion": math.exp(g * i + k + 0.05 * (i * 7 % 3)), "twh": math.exp(2 * (g * i + k + 0.05 * (i * 7 % 3)))}
                           for k, (c, g) in enumerate((("a", 0.1), ("b", 0.3))) for i in range(4)])
    assert close(tr["first_differences"]["intercept_log_per_year"], 0.0, 1e-9) and close(tr["first_differences"]["b"], 2.0, 1e-9)
    ps = project_scale(100, 1.0, 0.36, 350, 2000000)
    assert close(ps["mwh_per_year"], 876000) and close(ps["site_water_l_per_year"], 315360000) and close(ps["co2e_t_per_year"], 306600) and close(ps["share_of_load"], 0.438)
    print("self-test passed")


# ---------------------------------------------------------------- the public files and the page's oracle

PUBLIC = ROOT / "site" / "data"
ORACLE = ROOT / "work" / "site-refresh" / "tmp" / "explorer-oracle.json"
WEEK_HOURS = 168.0
CLAIM_ID = r"\b(?:au|ec|fp|fin|gf|lf|px|rs|sf|sv|tr)-\d{3}\b"
# Words addressed to the builders of the page, and the facility the owner has not yet worded, stay out of the public file.
PUBLIC_WORDS = (
    ("No general field figure; one Tribally owned colocation facility self-reports 1.28 (lf-059 note), inside the range.", "No general field figure."),
    ("Tribally owned facilities exist (lf-059, sf-053, sf-054); one self-reports a PUE of 1.28, and none in the record publishes", "Tribally owned facilities exist, and none in the record publishes"),
    ("print in the calibration block", "appear in the calibration block"),
    ("A 2011 vendor bound on Gmail, in the claim's note, read as", "A 2011 vendor bound on Gmail, read as"),
    ("unresolved; print the spread.", "unresolved."),
    ("; never summed across basins on the page, see ml_by_place", "; kept apart by basin, never summed"),
    ("Print it as 'plus 0.30 Wh stand-in', never as a multiple of a search.", "It reads 'plus 0.30 Wh stand-in', never a multiple of a search."),
    ("(sf-016 note)", "(sf-016)"),
    ("grid selector", "grid setting"),
    ("selector: NWPP", "setting: NWPP"),
    ("; print the spread, never the central ratio", "; a spread, never the central ratio"),
    (" (readings embodied_node_g_100k against embodied_hyper_g)", ""),
    (" (readings embodied_node_g_1m against embodied_hyper_g)", ""),
    ("Print only where the back-test holds", "Shown only where the back-test holds"),
    ("Amazon publishes no electricity quantity (rs-076).", "Amazon publishes no electricity quantity in the documents checked."),
    ("With 100 in, the design document's shape, the ratio is 1.03; that shape is the price shape, not Joule's query.", "With 100 in, the ratio is 1.03; that shape is the price example's, not Joule's query."),
    ("Added to the design document's list: the record's measured", "The record's measured"),
    (" For scale, 100 MW for a year is 876 GWh, 315 million liters at 0.36 L per kWh and 1.86 billion at the cooling-tower midpoint.", ""),
    ("The text slider stops at", "The text figures stop at"),
)
NOT_PUBLIC = r"(?i)design document|see ml_by_place|lf-059|sf-053|sf-054|rs-076|note\)|scripts/|\bslider\b|\bselector\b"


def _map_strings(node, fn):
    if isinstance(node, dict):
        return {k: _map_strings(v, fn) for k, v in node.items()}
    if isinstance(node, list):
        return [_map_strings(v, fn) for v in node]
    return fn(node) if isinstance(node, str) else node


def _strings(node):
    if isinstance(node, dict):
        for v in node.values():
            yield from _strings(v)
    elif isinstance(node, list):
        for v in node:
            yield from _strings(v)
    elif isinstance(node, str):
        yield node


def evidence_claims(folder=EVIDENCE):
    claims = {}
    for path in sorted(Path(folder).glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict) and data.get("cluster") == path.stem and isinstance(data.get("claims"), list):
            claims.update({c["id"]: c for c in data["claims"]})
    return claims


def export_public(doc, cm, out_dir=PUBLIC):
    """The file the page and readers use: tier T0, schema 1, exact inputs, every partly claim with its public limit, no working notes."""
    import csv
    import re
    inputs, selectors, base = resolve(doc, cm)
    out = build(doc, cm)
    out["inputs"], out["assumptions"] = _inputs_out(inputs), _selectors_out(selectors)  # unrounded: the page computes from these
    out["scenario"], out["scenario_from_selectors"] = doc["scenario"], doc["scenario_from_selectors"]
    out["purpose"] = "The Resource Use Explorer model: every number the page uses, with its low, high, kind, and evidence ids, and every row at the default settings. Modeled estimates, not measurements."
    high = compute({**base, **selectors["chat_kind"]["options"]["high_reasoning"]})
    words = PUBLIC_WORDS + (("moves this row from 15 to 172 Wh", "moves this row from 15 to %.0f Wh, %.0f of it in the data center" % (
        high["catalog"]["chat_hour"]["wh"], high["same_hour"]["chat"]["data_center"])),)

    def public_text(text):
        for old, new in words:
            text = text.replace(old, new)
        return text
    out = _map_strings(out, public_text)
    left = sorted({s[:90] for s in _strings(out) if re.search(NOT_PUBLIC, s)})
    if left:
        raise SystemExit("working notes left in the public file: %s" % left)
    claims = evidence_claims()
    limits = json.loads((EVIDENCE / "claim-limits.json").read_text(encoding="utf-8"))["limits"]
    used = sorted({i for s in _strings(out) for i in re.findall(CLAIM_ID, s)})
    bad = [i for i in used if claims.get(i, {}).get("status") not in ("verified", "partly")]
    if bad:
        raise SystemExit("claims used but not checked: %s" % bad)
    out["limits"] = {i: claims[i].get("limit") or limits.get(i) for i in used if claims[i]["status"] == "partly"}
    missing = [i for i, sentence in out["limits"].items() if not sentence]
    if missing:
        raise SystemExit("partly claims with no public limit: %s" % missing)
    out_dir = Path(out_dir)
    (out_dir / "resource-model.json").write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    with open(out_dir / "resource-model-inputs.csv", "w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(["input", "value", "low", "high", "unit", "kind", "status", "claims", "layer", "note"])
        for key, v in out["inputs"].items():
            writer.writerow([key, v["value"], v["low"], v["high"], v["unit"], v["basis"], v["status"], " ".join(v["claims"]), v["segment"], v["note"]])
    return {"inputs": len(out["inputs"]), "claims": len(used), "limits": len(out["limits"])}


def your_use(p, f):
    """Your Use, written apart from the page's code so it can check it: each row holds only the terms it owns, so time is counted once."""
    seats = f["seats"] if f["mode"] == "office" else 1
    i_net = net_intensity(p)
    gens = {"dc": (p["grid_dc"], p["wue_site"], gen_water(p, p["gen_dc"])), "net": (p["grid_dc"], 0.0, gen_water(p, p["gen_dc"])), "home": (p["grid_home"], 0.0, gen_water(p, p["gen_home"]))}

    def part(wh, where):
        grid, site, gen = gens[where]
        return {"wh": seats * wh, "g": seats * wh * grid / 1000, "ml": None if gen is None else seats * wh * (site + gen)}

    def row(dc_wh, gb, usd):
        by_data = router_wh(p, gb) if p["router_allocation"] == "by_data" else 0.0
        return {"dc": part(dc_wh, "dc"), "net": part(gb * i_net, "net"), "rou": part(by_data, "home"), "usd": seats * usd}

    prompt_usd = tokens_usd(p["tok_in_short"], p["tok_out_short"], 0, p["p_in"], p["p_out"])
    mean_wh = tokens_wh(p["coding_fresh_mean"], p["coding_out_mean"], p["coding_cached_mean"], p)
    mean_usd = tokens_usd(p["coding_fresh_mean"], p["coding_out_mean"], p["coding_cached_mean"], p["p_in"], p["p_out"], p["p_cache"])
    kb, week = p["kb_prompt"] / 1e6, WEEK_HOURS * 12 / HOURS
    gb_video = p["gb_" + p["device"]]
    rows = {
        "screen": {"dev": part(f["screen"] * p["dev_" + p["device"]], "home"),
                   "rou": part(f["screen"] * router_wh(p, 0.0) if p["router_allocation"] == "by_time" else 0.0, "home")},
        "chat": row(f["chat"] * chat_wh(p), f["chat"] * kb, f["chat"] * prompt_usd),
        "coding": row(f["coding"] * p["turns_per_hour"] * mean_wh, f["coding"] * p["coding_gb_per_hour"], f["coding"] * p["turns_per_hour"] * mean_usd),
        "images": row(f["images"] * p["image_wh"], 0.0, f["images"] * p["p_image"]),
        "clips": row(f["clips"] * p["clip_wh"], 0.0, f["clips"] * p["clip_seconds"] * p["p_clip_s"]),
        "searches": row(f["searches"] * (p["search_base_wh"] + p["e_prompt"]), f["searches"] * kb, f["searches"] * (p["p_search"] + prompt_usd)),
        "social": row(f["social"] * min(p["short_gb"] * p["i_dc"], p["short_ceiling"]), f["social"] * p["short_gb"], f["social"] * p["rev_meta"]),
        "streaming": row(f["streaming"] * gb_video * p["i_dc"], f["streaming"] * gb_video, f["streaming"] * p["rev_netflix"]),
        "gb": {"dc": part(f["gb"] / 1000 * p["stor_wh_tb_h"] * WEEK_HOURS * p["replicas"] * p["pue_hyper"], "dc"), "usd": seats * f["gb"] * p["p_s3"] * week},
    }
    if f["mode"] == "office":
        rows["seat"] = {"dc": part(p["seat_kwh_yr"] * 1000 / 12 * week, "dc"), "usd": seats * p["seat_usd"] * week}
    return rows


def write_oracle(doc, cm, path=ORACLE, cases=300, seed=20261104):
    """Seeded random settings and Your Use fields with what Python says: every number in the tree, spreads, what moves each catalog row, and crossovers."""
    import random
    import re
    inputs, selectors, base = resolve(doc, cm)
    rng = random.Random(seed)
    kept = re.compile(r"^(catalog|hour|where|arch|lever)\.[^ ]*\.(wh|usd|g|ml|ml_by_place\.\w+)$")
    near = lambda v: None if v is None else float("%.12g" % v)
    choices = {"screen": (0, 1, 7, 40), "chat": (0, 3, 10, 70, 400), "coding": (0, 0.5, 1, 8, 30), "images": (0, 10, 25), "clips": (0, 2, 9), "searches": (0, 10, 150),
               "social": (0, 1, 12), "streaming": (0, 1, 20), "gb": (0, 15, 100, 2000)}
    out = []
    for i in range(cases):
        settings = {n: s["default"] if i == 0 else rng.choice(sorted(s["options"])) for n, s in selectors.items()}
        fields = {k: 1 if i == 0 and k in ("coding", "social", "streaming") else v[0] for k, v in choices.items()}
        if i == 0:
            fields.update(screen=7, chat=10, images=10, clips=2, searches=10, gb=0, mode="person", seats=1)
        else:
            fields = {k: rng.choice(v) for k, v in choices.items()}
            fields.update(mode=rng.choice(("person", "office")), seats=rng.choice((1, 5, 50, 300)))
        p = dict(base)
        for n, o in settings.items():
            p.update(selectors[n]["options"][o])
        tree = compute(p)
        flat = flatten(tree)
        central = {k: v for k, v in flat.items() if kept.match(k)}
        oat = one_at_a_time(inputs, p)
        runs = selector_runs(selectors, p)
        ranges = input_extremes(inputs, p, central, oat)
        drivers = {"%s.%s" % (r, m): [e["name"] for e in rank_drivers("%s.%s" % (r, m), flat, oat, runs, inputs)[:3]]
                   for r in ("catalog." + k for k in tree["catalog"]) for m in MEASURES if "%s.%s" % (r, m) in flat}
        spread = crossover_spread(tree, oat, runs)
        out.append({
            "settings": settings, "fields": fields, "tree": {k: near(v) for k, v in flat.items() if not k.startswith("topdown.")},
            "ranges": {k: [near(a), near(b)] for k, (a, b) in ranges.items()}, "drivers": drivers,
            "crossovers": {k: [near(c["value"]), near(c["low_one_input_or_setting"]), near(c["high_one_input_or_setting"]), len(c["never_under"])] for k, c in spread.items()},
            "your_use": {k: {t: ({m: near(x) for m, x in v.items()} if isinstance(v, dict) else near(v)) for t, v in row.items()} for k, row in your_use(p, fields).items()},
        })
    Path(path).write_text(json.dumps({"seed": seed, "cases": out}, separators=(",", ":")), encoding="utf-8")
    return len(out)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--params", default=str(PARAMS))
    parser.add_argument("--comparison", default=str(COMPARISON))
    parser.add_argument("--out", default=str(OUT))
    parser.add_argument("--export", action="store_true", help="write site/data/resource-model.json and resource-model-inputs.csv")
    parser.add_argument("--oracle", action="store_true", help="write the page's oracle, seeded random settings with Python's answers")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    doc, cm = load(args.params, args.comparison)
    if args.export or args.oracle:
        if args.export:
            print(json.dumps(export_public(doc, cm)))
        if args.oracle:
            print(json.dumps({"oracle_cases": write_oracle(doc, cm)}))
        return
    out = build(doc, cm)
    Path(args.out).write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    report(out)
    print("\nwrote", Path(args.out).name)


if __name__ == "__main__":
    main()
