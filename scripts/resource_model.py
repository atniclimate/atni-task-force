"""Resource Use Explorer model: what a unit of digital work uses, in energy, price, CO2e, and water.

Said aloud: every unit of work pays its own energy plus its share of the hardware that sits idle waiting for
it; where it runs sets the carbon and the water, and who bills it sets the price.

Every number lives in the parameters file, each with evidence ids, low, central, high, and a kind (measured,
modeled, or assumed). Same-hour inputs are read by key from the comparison model, never copied. This file holds
equations only. Ranges are input extremes run through the same equations: a spread, not a confidence interval.

    python scripts/resource_model.py [--params FILE] [--comparison FILE] [--out FILE]
    python scripts/resource_model.py --self-test
    python scripts/resource_model.py --export    the public JSON and CSV in site/data/ (--out-dir FOLDER writes them elsewhere)
    python scripts/resource_model.py --oracle    300 seeded settings with Python's answers, for the page's check (--oracle-file FILE writes it elsewhere)

Standard library only.
"""
import argparse
import json
import math
import statistics
import sys
from pathlib import Path

HOURS = 8760.0
B2_PERIODS = HOURS / 720  # B2 lists dollars per TB per 30 days, and the model's year is 8,760 hours: 365/30 of those periods, not 12
TYPED_MOST = 1e9  # the largest count or figure a page field or a scenario file takes, so no figure can overflow
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


def _store_year(p, n, tb_each, hours, net_wh=0.0):
    """n local nodes each holding tb_each for a year: whole boxes, or drives only when the nodes are already on. Returns Wh at the nodes and dollars."""
    on = p["already_on"]
    wh = n * (tb_each * p["stor_wh_tb_h"] * HOURS * p["pue_room"] if on else p["nas_w"] * HOURS * p["pue_room"])
    hardware = n * (tb_each * p["hdd_usd_tb"] + (0.0 if on else p["nas_chassis_usd"])) / p["life"]
    return wh, self_run_price(hardware, (wh + net_wh) / 1000, p["tariff"], hours, p["wage"])


def data_comparison(p, c, dc, net, room):
    """One storage coefficient and one boundary on every row; the already-on setting reaches every local row."""
    n, tb = p["nations"], p["shared_tb"]
    gb_total = tb * 1000
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
        net_wh = pull_wh if label == "copies" else query_wh
        wh, usd = _store_year(p, n, tb_each, hours, net_wh)
        return four([room(wh), net(net_wh)], usd)

    fed_tb = p["fed_tb"] * p["fed_copies"]
    return {
        "ten_copies": local(p["nas_raw_tb"], n * admin, "copies"),
        "central_s3": four([dc(central_wh)], s3),
        "central_s3_with_pulls": four([dc(central_wh), net(pull_wh)], s3 + egress),
        "central_r2": four([dc(central_wh)], gb_total * p["p_r2"] * 12 + central_admin),
        "central_b2": four([dc(central_wh)], tb * p["p_b2_tb"] * B2_PERIODS + central_admin),
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


def exit_comparison(p, dc, net, room, same_grid):
    """One Nation leaves a cloud store, once, for its own node or a federated set of Nations' nodes, on comparison C's coefficient and boundary.
    A move row is one time and counts only the move; a year row is a year of holding the data, before or after. Nothing here adds the two."""
    i_net = net_intensity({**p, "connection": "wifi"})  # a Nation's move runs on its fixed link, whatever the reader's own connection is
    tb, gb = p["exit_tb"], p["exit_tb"] * 1000
    raw = tb * p["nas_raw_tb"] / p["shared_tb"]
    box = raw * p["hdd_usd_tb"] + (0.0 if p["already_on"] else p["nas_chassis_usd"])
    cloud_wh = tb * p["replicas"] * p["stor_wh_tb_h"] * HOURS * p["pue_hyper"]
    admin = p["central_admin_h_month"] * 12 * p["wage"]
    stay = {"s3": gb * p["p_s3"] * 12 + admin, "r2": gb * p["p_r2"] * 12 + admin, "b2": tb * p["p_b2_tb"] * B2_PERIODS + admin}
    rate = {"s3": p["p_egress"], "r2": p["p_r2_egress"], "b2": p["p_b2_egress"]}
    node_copies, fed_copies = p["exit_node_copies"], p["replicas"]  # the set takes the cloud row's replica count: an assumption about how many copies, not about durability, which nothing here models
    node_wh, node_usd = _store_year(p, node_copies, raw, node_copies * p["nas_admin_h_month"] * 12)
    fed_wh, fed_usd = _store_year(p, fed_copies, raw, fed_copies * p["fed_admin_h_month"] * 12)
    out = {"year_%s" % s: four([dc(cloud_wh)], usd) for s, usd in stay.items()}
    out["year_cloud_same_grid"] = four([same_grid(cloud_wh)], stay["s3"])
    out["year_node"] = four([room(node_wh)], node_usd)
    out["year_federated"] = four([room(fed_wh)], fed_usd)
    payback = {}
    # the node takes one copy over the wire and any second copy across its own room; the federated set takes every copy over the wire, and only the billed pulls pay egress
    for dest, wire, pulls, year_usd in (("node", 1.0, 1.0, node_usd), ("federated", fed_copies, p["exit_fed_pulls"], fed_usd)):
        for s in stay:
            egress, labor = pulls * gb * rate[s], wire * p["exit_admin_h"] * p["wage"]
            row = four([net(wire * gb * i_net)], egress + labor + p["exit_other_usd"])
            row.update(egress_usd=egress, labor_usd=labor, other_bill_usd=p["exit_other_usd"])
            out["move_%s_%s" % (s, dest)] = row
            payback["%s_vs_%s" % (dest, s)] = _positive(row["usd"], stay[s] - year_usd)
    out["payback"] = payback
    embodied = p["emb_hdd_kg_tb"] / p["life"] * 1000
    per_tb = p["replicas"] * p["stor_wh_tb_h"] * HOURS * p["pue_hyper"]
    # the size where a year on whole boxes meets the cloud's drives-only figure, which grows with the data while one box per copy does not; drives only, both grow, so no size ties
    whole_boxes = lambda copies: None if p["already_on"] else copies * p["nas_w"] * HOURS * p["pue_room"] / per_tb
    out["readings"] = {
        "egress_per_pull_usd": {s: gb * rate[s] for s in rate},
        "copies": {"node": node_copies, "federated": fed_copies},
        "transfer_days_one_copy": tb * 8e6 / p["exit_link_mbps"] / 86400,
        "hardware_usd": {"node": node_copies * box, "federated": fed_copies * box},
        "embodied_own_node_g": node_copies * raw * embodied,
        "embodied_federated_set_g": fed_copies * raw * embodied,
        "embodied_cloud_replicas_g": tb * p["replicas"] * embodied,
        "node_w_at_energy_tie": cloud_wh / (node_copies * HOURS * p["pue_room"]),
        "tb_at_energy_tie": {"node": whole_boxes(node_copies), "federated": whole_boxes(fed_copies)},
        "cloud_service_boundary_g": tb * p["whole_service_kg_tb"] * 1000,  # a reading on another boundary, one agency's four data centers, printed beside the drives-only floor and never as the row or as a bound
    }
    return out


def exit_tb_limit(p):
    """The largest size comparison E takes: the model counts one four-bay box per copy at any size, so the most raw terabytes one box holds (an assumption with no source)
    over the raw terabytes each terabyte of data needs. A typed size above it is refused, on the page and in a scenario file."""
    return p["nas_box_max_raw_tb"] * p["shared_tb"] / p["nas_raw_tb"]


def upkeep(p):
    """What each architecture row asks of the Nation that runs it: the idle watts it carries all year and the paid hours the row counts. A vendor's idle sits inside
    the vendor's own figure, so the Nation carries none of it. These are the lines the custody view prints; they score nothing."""
    off, n = 1 - p["already_on"], p["nations"]
    held = lambda tb: p["stor_wh_tb_h"] * tb if p["already_on"] else p["nas_w"]
    year = lambda month: month * 12
    raw = p["exit_tb"] * p["nas_raw_tb"] / p["shared_tb"]
    cloud_a = (0.0, year(p["cloud_admin_h_month"]))
    local_a = (p["office_w"], year(p["office_admin_h_month"]))
    central = (0.0, year(p["central_admin_h_month"]))
    node_d = (off * p["node_w"], p["node_admin_h_year"])
    node_copies, fed_copies = p["exit_node_copies"], p["replicas"]
    table = {
        "A": {"cloud": cloud_a, "cloud_with_sync": cloud_a, "cloud_same_grid": cloud_a, "local": local_a, "local_hydro": local_a, "local_two_boxes": (2 * local_a[0], local_a[1])},
        "B": {"platform": (0.0, 0.0), "cache": (0.0, 0.0), **{"local_%d" % v: (off * p["mini_w"], year(p["mini_admin_h_month"])) for v in p["views"]}},
        "C": {"ten_copies": (n * held(p["nas_raw_tb"]), n * year(p["nas_admin_h_month"])), "central_s3": central, "central_s3_with_pulls": central, "central_r2": central, "central_b2": central,
              "federated": (n * held(p["fed_tb"] * p["fed_copies"]), n * year(p["fed_admin_h_month"])), "federated_replicas": (n * held(p["fed_tb"] * p["replicas"]), n * year(p["fed_admin_h_month"]))},
        "D": {"hyper": (0.0, 0.0), "hyper_same_grid": (0.0, 0.0), "colo": (0.0, 0.0), "laptop": (0.0, 0.0), "laptop_with_fallback": (0.0, 0.0), "phone": (0.0, 0.0), "phone_wall": (0.0, 0.0), "phone_wall_fallback": (0.0, 0.0),
              **{name + end: node_d for name in ("node_100k", "node_1m") for end in ("", "_hydro", "_fallback")}},
        "E": {"year_s3": central, "year_r2": central, "year_b2": central, "year_cloud_same_grid": central, "year_node": (node_copies * held(raw), node_copies * year(p["nas_admin_h_month"])),
              "year_federated": (fed_copies * held(raw), fed_copies * year(p["fed_admin_h_month"])),
              **{"move_%s_node" % s: (0.0, p["exit_admin_h"]) for s in ("s3", "r2", "b2")}, **{"move_%s_federated" % s: (0.0, fed_copies * p["exit_admin_h"]) for s in ("s3", "r2", "b2")}},
    }
    return {letter: {k: {"idle_w": i, "admin_h": h} for k, (i, h) in rows.items()} for letter, rows in table.items()}


def _watts_for(times, row_wh, watts, per_w):
    """Idle watts at which a row reaches times its energy; None when idle alone cannot take it there."""
    if not per_w:
        return None
    w = (times * row_wh - (row_wh - watts * per_w)) / per_w
    return w if w > 0 else None


def field_lines(p, cat, arch):
    """What a field reading would change, worked from the defaults. The page and the field protocol read these, so their sentences cannot drift from the model."""
    off, room = 1 - p["already_on"], HOURS * p["pue_room"]
    rows = {"office_server": (arch["A"]["local"], "office_w", room),
            "nas_ten_nations": (arch["C"]["federated"], "nas_w", off * p["nations"] * room),
            "nas_own_node": (arch["E"]["year_node"], "nas_w", off * p["exit_node_copies"] * room),
            "node_100k": (arch["D"]["node_100k"], "node_w", off * room * p["prompts_block"] / p["node_prompts_100k"]),
            "node_1m": (arch["D"]["node_1m"], "node_w", off * room * p["prompts_block"] / p["node_prompts_1m"]),
            **{"media_box_%d" % v: (arch["B"]["local_%d" % v], "mini_w", off * room * p["views_block"] / v) for v in p["views"]}}
    idle = {}
    for name, (row, key, per_w) in rows.items():  # a row at zero energy, from a typed zero, has no idle share
        idle[name] = {"default_w": p[key], "idle_share": p[key] * per_w / row["wh"] if row["wh"] else None, "halves_at_w": _watts_for(0.5, row["wh"], p[key], per_w), "doubles_at_w": _watts_for(2.0, row["wh"], p[key], per_w)}
    top = {**p, "cache_share": p["cache_share_top"]}
    median = (p["coding_fresh"], p["coding_out"], p["coding_cached"])
    mean = (p["coding_fresh_mean"], p["coding_out_mean"], p["coding_cached_mean"])
    hour = cat["coding_hour"]
    return {"idle": idle,
            "cache_share_top": {"session_times": tokens_wh(*median, top) / tokens_wh(*median, p),
                                "hour_times": (hour["wh"] - hour["layers"]["data_center"] + p["turns_per_hour"] * tokens_wh(*mean, top)) / hour["wh"]},
            "coding_usd_miss_times": hour["top_down_usd"] / hour["usd"]}


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
    same_grid = lambda wh: layer(wh, p["grid_local"], p["wue_site"], gen_water(p, p["gen_local"]), "local")
    e_opt = exit_comparison(p, dc, net, room, same_grid)
    arch = {"A": a_opt, "B": b_opt, "C": c_opt, "D": d_opt, "E": e_opt}
    return {
        "same_hour": sh,
        "catalog": cat,
        "hour": hour_baseline(p, cat, dc, net, home, c),
        "where": where_it_runs(p, cat),
        "arch": arch,
        "cross": crossovers(p, d_c),
        "lever": lever_rows(p, cat, c, a_opt, b_opt, c_opt, d_opt, dc, net, room),
        "topdown": top_down(p, cat, sh),
        "upkeep": upkeep(p),
        "field": field_lines(p, cat, arch),
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
    return "0" if not x else "%g" % x  # a typed -0 prints 0, as the page prints it


def crossover_spread(central_tree, oat, runs, where=("cross",)):
    out = {}
    node = central_tree
    for part in where:
        node = node[part]
    for key, value in node.items():
        r = ".".join(where) + "." + key
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


def trace(inputs, selectors, base, central, runs, keys):
    """What each figure reads at these settings, for its receipt: an input is read when moving it moves the figure, a setting when one of its options does. The figure then names
    its inputs' and settings' claims and the assumptions it rests on, so a figure derived from others carries their receipts. Words only: no number changes here."""
    moved = {k: flatten(compute({**base, k: base[k] * 1.5 + 1})) for k in inputs}
    out = {}
    for r in keys:
        reads = [k for k, flat in moved.items() if flat.get(r) != central.get(r)]
        claims = {c for k in reads for c in inputs[k]["claims"]}
        claims |= {c for name, options in runs.items() if any(flat.get(r) != central.get(r) for flat in options.values()) for c in selectors[name].get("claims", [])}
        out[r] = {"claims": sorted(claims), "assumed": [k for k in reads if inputs[k]["kind"] == "assumed" and inputs[k]["claims"]],
                  "no_source": [k for k in reads if inputs[k]["kind"] == "assumed" and not inputs[k]["claims"]]}
    return out


def merged(traces):
    """Several figures' receipts as one, in order, for a label that stands over all of them."""
    out = {"claims": [], "assumed": [], "no_source": []}
    for t in traces:
        for field, items in t.items():
            out[field] += [x for x in items if x not in out[field]]
    out["claims"].sort()
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

    paybacks = ["arch.%s.payback.%s" % (letter, k) for letter, a in tree["arch"].items() for k in a.get("payback", {})]
    reads = trace(inputs, selectors, base, central, runs, [k for k in central if k.startswith("arch.") and ".readings." in k] + paybacks)
    architectures = {}
    for letter, spec in doc["architectures"].items():
        options = []
        for name, meta in spec["options"].items():
            options.append(row_out("arch.%s.%s" % (letter, name), meta, ctx, labels))
        readings = {}
        for k, v in flatten(tree["arch"][letter].get("readings", {})).items():
            low, high = ranges.get("arch.%s.readings.%s" % (letter, k), (v, v))
            readings[k] = dict(doc["reading_labels"][k.split(".")[0]], value=v, low=low, high=high, reads=reads["arch.%s.readings.%s" % (letter, k)])
            if "basis" in readings[k]:
                readings[k]["date"] = doc["price_date"]
        architectures[letter] = {"title": spec["title"], "unit_of_comparison": spec["unit"], "options": options, "readings": readings,
                                 "wins": spec["wins"], "loses": spec["loses"], "note": spec.get("note", "")}
        if "payback" in tree["arch"][letter]:  # a payback can be never, so it prints as a crossover does, not as a low and a high
            architectures[letter].update(payback=crossover_spread(tree, oat, runs, ("arch", letter, "payback")), payback_label=spec["payback_label"],
                                         payback_reads=merged(reads[k] for k in paybacks if k.startswith("arch.%s." % letter)))

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
    # comparison E mixes one-time rows with year rows, so it sits out of the ranking across all rows
    ranked_paths = ["arch.%s.%s" % (l, n) for l, s in doc["architectures"].items() if s.get("in_driver_ranking", True) for n in s["options"]]
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
                        "global_architectures": global_ranking(ranked_paths, central, oat, runs, inputs)},
        "stability": {"method": doc["stability_method"], "comparisons": stable},
        "upkeep": tree["upkeep"], "field_lines": tree["field"], "scenario_labels": doc["scenario_labels"],
        "typed_limits": {"most": TYPED_MOST, "exit_tb": exit_tb_limit(base)},
        "custody": custody_block(doc, tree), "measured": doc["measured"],
        "computed_defaults": {
            "settings": {name: sel["default"] for name, sel in selectors.items()},
            "same_hour": sh_out,
            "catalog": {"default": catalog_snapshot(tree, cat_names), "low": snap(0), "high": snap(1)},
            "selectors": selector_out,
            "crossovers": tree["cross"],
        },
    }
    if "carbon_damage" in doc:  # the one line that joins the damage layer to the file; see its block below
        output["carbon_damage"] = doc["carbon_damage"]
    same = output["computed_defaults"].pop("same_hour")
    output = rounded(output)
    output["computed_defaults"]["same_hour"] = same  # kept exact: the tests compare it to the comparison model
    return output


def _inputs_out(inputs):
    return {k: {"value": v["central"], "low": v["low"], "high": v["high"], "unit": v["unit"], "basis": v["kind"], "status": v["status"],
                "claims": v["claims"], "segment": v.get("segment", ""), "note": v.get("note", "")} for k, v in inputs.items()}


def _selectors_out(selectors):
    return {k: {"default": s["default"], "options": s["options"], "label": s["label"], "why": s.get("why", ""), **({"claims": s["claims"]} if s.get("claims") else {})} for k, s in selectors.items()}


# ---------------------------------------------------------------- the custody setting

def _span(values):
    found = [v for v in values if v is not None]
    return [min(found), max(found)] if found else None


def custody_view(doc, tree, rule):
    """What one custody setting keeps and what leaves, and what the rule costs in idle watts, paid hours, price, and energy. A row that breaches the rule leaves the comparison
    whole, with its reason, and its figures do not change: nothing is scored lower, and no number here stands for consent or custody."""
    spec = doc["custody"]
    allowed = set(spec["options"][rule]["allows"])
    out = {"rule": rule, "label": spec["options"][rule]["label"], "fixed_line": spec["fixed_line"], "comparisons": {}}
    for letter, arch in doc["architectures"].items():
        kept, left, costed, one_time = [], [], {"kept": [], "left": []}, []
        for name in arch["options"]:
            key = "arch.%s.%s" % (letter, name)
            row = spec["rows"][key]
            stays = row["holder"] in allowed
            if stays:
                kept.append({"key": key, **({"note": row["note"]} if row.get("note") else {})})
            else:
                left.append({"key": key, "reason": row.get("reason") or spec["reasons"][row["holder"]]})
            if row.get("cost") == "one_time":
                if stays:
                    one_time.append(name)
            elif row.get("cost") != "skip":
                costed["kept" if stays else "left"].append(name)
        view = {"kept": kept, "left": left, "cost": None}
        if left:
            lines = {}
            for field in ("idle_w", "admin_h"):
                lines[field] = {side: _span(tree["upkeep"][letter][n][field] for n in names) for side, names in costed.items()}
            for field in ("usd", "wh"):
                lines[field] = {side: _span(tree["arch"][letter][n][field] for n in names) for side, names in costed.items()}
            lines["usd"]["bases"] = {side: sorted({arch["options"][n]["price_basis"] for n in names}) for side, names in costed.items()}
            both = [(f, l) for f, l in lines.items() if l["kept"] and l["left"]]
            view["cost"] = {"lines": lines, "kept_higher_on": [f for f, l in both if l["kept"][0] > l["left"][0]], "kept_lower_on": [f for f, l in both if l["kept"][0] < l["left"][0]]}
        if one_time:
            view["one_time"] = {"usd": _span(tree["arch"][letter][n]["usd"] for n in one_time), "wh": _span(tree["arch"][letter][n]["wh"] for n in one_time),
                                "admin_h": _span(tree["upkeep"][letter][n]["admin_h"] for n in one_time)}
        out["comparisons"][letter] = view
    return out


def custody_block(doc, tree):
    spec = doc["custody"]
    return {k: spec[k] for k in ("label", "default", "options", "fixed_line", "reasons", "cost_labels", "rows")} | {"by_rule": {rule: custody_view(doc, tree, rule) for rule in spec["options"]}}


# ---------------------------------------------------------------- the measured-by-us value

MEASURED_LABEL = "your measurement, not verified by ATNI"
ROW_TREES = ("catalog", "hour", "where", "arch", "lever")
# The grammar of a typed value in text, as resource-model.js reads it (its NUMBER_TEXT): plain digits 0 to 9, one point, an exponent, and the whitespace a browser trims.
# So an underscore, another script's digits, or a spelled infinity is refused here as it is there.
SPACES = "\t\n\v\f\r " + "".join(map(chr, (0xA0, 0x1680, *range(0x2000, 0x200B), 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF)))
NUMBER_TEXT = "[%s]*[+-]?([0-9]+[.]?[0-9]*|[.][0-9]+)([eE][+-]?[0-9]+)?[%s]*" % (SPACES, SPACES)


def apply_measured(doc, inputs, base, typed):
    """A typed value stands in for an input in this run and nowhere else. It takes no spread, keeps no claim, and carries the label; the label comes from here, never from
    what the reader or a file supplies. Nothing in this model or on the page writes to the claims record. Returns new inputs, new base values, and the records."""
    import re
    spec = doc["measured"]["inputs"]
    new_inputs, new_base, records = dict(inputs), dict(base), []
    for key, raw in typed.items():
        rule = spec.get(key)
        if rule is None:
            raise ValueError("%s does not take a measured value" % key)
        try:
            value = float(raw.strip(SPACES) if re.fullmatch(NUMBER_TEXT, raw) else "nan") if isinstance(raw, str) else float(raw)
        except (TypeError, ValueError):
            value = math.nan
        if isinstance(raw, bool) or not rule["min"] <= value <= rule["max"]:  # a NaN fails the comparison too
            raise ValueError("%s takes a number from %s to %s %s; %r was not used" % (rule["label"], _num(rule["min"]), _num(rule["max"]), rule["unit"], raw))
        records.append({"input": key, "label": rule["label"], "value": value, "unit": rule["unit"], "model_value": inputs[key]["central"], "replaces_claims": list(inputs[key]["claims"]), "note": MEASURED_LABEL})
        new_inputs[key] = dict(inputs[key], central=value, low=value, high=value, kind="your measurement", status=MEASURED_LABEL, claims=[])
        new_base[key] = value
    return new_inputs, new_base, sorted(records, key=lambda r: r["input"])


def moved_rows(before, after, probes=()):
    """The rows a typed value reaches, from flat trees: every row it changed, and every row that reads the typed input at all, which moves when that input sits at its
    model low or high (the probes, from reading_probes). So a reading equal to the model's figure, which only narrows a row's spread, still labels the rows that use it."""
    rows = set()
    for other in (after, *probes):
        for k in set(before) | set(other):
            head, _, measure = k.rpartition(".")
            if measure in MEASURES and k.split(".")[0] in ROW_TREES and before.get(k) != other.get(k):
                rows.add(head)
    return sorted(rows)


def reading_probes(inputs, base, typed):
    """The model with each typed input at its own low and at its own high, the rest as they stand: the trees moved_rows reads to find what depends on a reading."""
    return [flatten(compute({**base, k: inputs[k][end]})) for k in typed for end in ("low", "high")]


def measured_line(records, used=True):
    """The one sentence that travels with any figure a typed value touched: copy, print, and CSV all use it. Unused, it names the reading without saying the figures include it."""
    if not records:
        return ""
    items = "; ".join("%s %s %s (model %s)" % (r["label"], _num(r["value"]), r["unit"], _num(r["model_value"])) for r in records)
    return "Includes %s: %s." % (MEASURED_LABEL, items) if used else "%s%s: %s." % (MEASURED_LABEL[0].upper(), MEASURED_LABEL[1:], items)


def copied_reading(reading, row, records, moved):
    """Copy Reading: a moved row's Reading never leaves without the line."""
    return "%s %s" % (reading, measured_line(records)) if row in moved else reading


def outputs_csv(flat, records, moved):
    """Every row at the current settings. The line comes first and the label sits on every row it moved; the label holds a comma, so both are quoted. The page's Download writes the same two things."""
    lines = ['"# %s"' % measured_line(records)] if records else []
    lines.append("row,measure,value,measured")
    for k in sorted(flat):
        head, _, measure = k.rpartition(".")
        if measure in MEASURES and k.split(".")[0] in ROW_TREES:
            lines.append('%s,%s,%r,%s' % (head, measure, flat[k], '"%s"' % MEASURED_LABEL if head in moved else ""))
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------- the carbon damage layer
# Off by default, and the owner may yet rule it out. To remove it: delete this block, the carbon_damage section of the parameters, the line in build() that names it, the
# ex and mv-005 claim ids, and damage_cases in write_oracle(). compute() never reads it, so no row, price, or ranking changes.

def carbon_damage(g, family):
    """One family's low, central, and high for g grams of CO2e, in that family's own currency and year; never one number. A family with no central value keeps it None rather than a midpoint."""
    return {k: None if family[k] is None else g / 1e6 * family[k] for k in ("low", "central", "high")}


def damage_column(doc, g, choice="off"):
    """The damage column for one row: None until a reader turns it on and picks a family. It is its own column, never added to a price or ranked against one."""
    spec = doc["carbon_damage"]
    if choice == "off":
        return None
    family = spec["families"][choice]
    avoidance = family["kind"].startswith("avoidance")  # an avoidance cost never wears the damage head, in the line or the table
    column = spec.get("column_avoidance", spec["column"]) if avoidance else spec["column"]
    return {"column": column, "head": "Avoidance cost" if avoidance else "Damage", "as_of": spec["as_of"], "family": family["label"], "unit": family["unit"], "kind": family["kind"],
            "claims": family["claims"], **carbon_damage(g, family)}


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
    q = {"exit_tb": 2, "shared_tb": 10, "nas_raw_tb": 12, "replicas": 3, "stor_wh_tb_h": 1.0, "pue_hyper": 1.0, "pue_room": 1.0, "central_admin_h_month": 1, "wage": 10, "p_s3": 0.01, "p_r2": 0.005, "p_b2_tb": 2.0, "p_egress": 0.1,
         "p_r2_egress": 0.0, "p_b2_egress": 0.0, "exit_node_copies": 1, "nas_admin_h_month": 1, "fed_admin_h_month": 1, "already_on": 0, "nas_w": 10, "hdd_usd_tb": 10, "nas_chassis_usd": 100, "life": 5, "tariff": 0.1, "exit_fed_pulls": 1,
         "exit_admin_h": 10, "exit_other_usd": 5, "exit_link_mbps": 100, "emb_hdd_kg_tb": 20, "whole_service_kg_tb": 200}
    q.update(network_mode="average", connection="cellular", net_fixed_avg=2.0, net_fixed_marg=0.1)
    plain = lambda wh: layer(wh, 100, 0.0, 1.0)
    e = exit_comparison(q, plain, plain, plain, plain)
    assert close(B2_PERIODS, 365 / 30) and close(e["year_s3"]["usd"], 360) and close(e["year_r2"]["usd"], 240) and close(e["year_b2"]["usd"], 2 * 2 * 365 / 30 + 120), "B2's 30-day rate, over a 365-day year"
    assert close(e["readings"]["tb_at_energy_tie"]["federated"], 10) and close(e["readings"]["tb_at_energy_tie"]["node"], 10 / 3), "one box per copy against drives that grow with the data"
    assert exit_comparison({**q, "already_on": 1}, plain, plain, plain, plain)["readings"]["tb_at_energy_tie"] == {"node": None, "federated": None}, "drives only, both sides grow"
    assert close(exit_tb_limit({"nas_box_max_raw_tb": 96, "shared_tb": 10, "nas_raw_tb": 12}), 80)
    assert close(e["move_s3_node"]["usd"], 200 + 100 + 5) and close(e["move_s3_node"]["wh"], 4000) and close(e["move_r2_federated"]["usd"], 300 + 5) and close(e["move_r2_federated"]["wh"], 12000)
    assert close(e["move_s3_federated"]["egress_usd"], 200), "a peer copy pays no egress"
    assert close(e["readings"]["transfer_days_one_copy"], 16e6 / 100 / 86400) and close(e["year_node"]["wh"], 10 * HOURS)
    year_node = (2.4 * 10 + 100) / 5 + 87.6 * 0.1 + 12 * 10
    assert close(e["year_node"]["usd"], year_node) and close(e["payback"]["node_vs_s3"], 305 / (360 - year_node))
    assert _watts_for(0.5, 100, 10, 8) == 3.75 and _watts_for(0.5, 100, 10, 1) is None and _watts_for(2, 100, 10, 0) is None
    custody_doc = {"custody": {"options": {"any": {"label": "any", "allows": ["vendor", "node"]}, "node": {"label": "node", "allows": ["node"]}}, "fixed_line": "line", "reasons": {"vendor": "because"},
                               "rows": {"arch.X.a": {"holder": "vendor"}, "arch.X.b": {"holder": "node"}}},
                   "architectures": {"X": {"options": {"a": {"price_basis": "api_list"}, "b": {"price_basis": "self_run"}}}}}
    custody_tree = {"arch": {"X": {"a": {"usd": 1.0, "wh": 5.0}, "b": {"usd": 2.0, "wh": 4.0}}}, "upkeep": {"X": {"a": {"idle_w": 0.0, "admin_h": 1.0}, "b": {"idle_w": 9.0, "admin_h": 1.0}}}}
    v = custody_view(custody_doc, custody_tree, "node")["comparisons"]["X"]
    assert [r["key"] for r in v["kept"]] == ["arch.X.b"] and v["left"] == [{"key": "arch.X.a", "reason": "because"}]
    assert v["cost"]["kept_higher_on"] == ["idle_w", "usd"] and v["cost"]["kept_lower_on"] == ["wh"] and custody_view(custody_doc, custody_tree, "any")["comparisons"]["X"]["cost"] is None
    measured_doc = {"measured": {"inputs": {"w": {"label": "Idle", "unit": "W", "min": 0, "max": 100}}}}
    ins, b, rec = apply_measured(measured_doc, {"w": {"central": 40.0, "low": 30.0, "high": 50.0, "claims": ["sf-001"], "kind": "assumed", "status": "partly"}}, {"w": 40.0}, {"w": "62"})
    assert b["w"] == 62 and ins["w"]["low"] == ins["w"]["high"] == 62 and ins["w"]["claims"] == [] and rec[0]["replaces_claims"] == ["sf-001"]
    assert measured_line(rec) == "Includes your measurement, not verified by ATNI: Idle 62 W (model 40)."
    assert measured_line(rec, used=False) == "Your measurement, not verified by ATNI: Idle 62 W (model 40)."
    damage_doc = {"carbon_damage": {"column": "damage", "column_avoidance": "avoidance", "as_of": "x", "families": {"d": {"label": "D", "unit": "u", "kind": "damage estimate", "claims": [], "low": 1, "central": 2, "high": 3},
                                                                                                       "a": {"label": "A", "unit": "u", "kind": "avoidance cost, not a damage estimate", "claims": [], "low": 1, "central": 2, "high": 3}}}}
    assert damage_column(damage_doc, 1e6, "d")["column"] == "damage" and damage_column(damage_doc, 1e6, "a")["column"] == "avoidance" and damage_column(damage_doc, 1e6) is None
    assert damage_column(damage_doc, 1e6, "d")["head"] == "Damage" and damage_column(damage_doc, 1e6, "a")["head"] == "Avoidance cost"
    assert moved_rows({"arch.A.x.wh": 1.0, "arch.A.y.wh": 2.0}, {"arch.A.x.wh": 1.5, "arch.A.y.wh": 2.0}) == ["arch.A.x"]
    assert moved_rows({"arch.A.x.wh": 1.0, "arch.A.y.wh": 2.0}, {"arch.A.x.wh": 1.0, "arch.A.y.wh": 2.0}, [{"arch.A.x.wh": 1.2, "arch.A.y.wh": 2.0}]) == ["arch.A.x"], "an equal reading still labels the row that reads it"
    assert _num(12345.25) == "12345.2" and _num(-0.0) == "0" and _num(1234565) == "1.23456e+06", "an exact half rounds to the even figure, as resource-model.js prints it"
    for text, want in ((" 62 ", 62.0), ("6.2e1", 62.0), (".5", 0.5), ("62.", 62.0)):
        assert apply_measured(measured_doc, {"w": {"central": 40.0, "claims": []}}, {"w": 40.0}, {"w": text})[1]["w"] == want, text
    for bad in ({"w": -1}, {"w": "many"}, {"w": True}, {"w": float("nan")}, {"v": 1}, {"w": "1_0"}, {"w": chr(0xFF11) + chr(0xFF12)}, {"w": chr(0x661) + chr(0x662)}, {"w": "inf"}, {"w": "nan"}, {"w": " "}, {"w": "1,000"}):
        try:
            apply_measured(measured_doc, {"w": {"central": 40.0, "claims": []}}, {"w": 40.0}, bad)
        except ValueError:
            continue
        raise AssertionError("a bad typed value passed: %r" % bad)
    assert carbon_damage(1e6, {"low": 1, "central": None, "high": 7}) == {"low": 1.0, "central": None, "high": 7.0}
    print("self-test passed")


# ---------------------------------------------------------------- the public files and the page's oracle

PUBLIC = ROOT / "site" / "data"
ORACLE = ROOT / "work" / "site-refresh" / "tmp" / "explorer-oracle.json"
WEEK_HOURS = 168.0
CLAIM_ID = r"\b[a-z]{2,3}-\d{3}\b"  # validate_public.CLAIM_ID's pattern, held equal by tests/test_gates.py; this file stays standard library only
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
    out["purpose"] ="The Resource Use Explorer model: every number the page uses, with its low, high, kind, and evidence ids, and every row at the default settings. Modeled estimates, not measurements."
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
    out_dir.mkdir(parents=True, exist_ok=True)
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
    rule_rng = random.Random(seed + 1)  # its own stream, so every older case keeps the settings and fields it had
    kept = re.compile(r"^(catalog|hour|where|arch|lever)\.[^ ]*\.(wh|usd|g|ml|ml_by_place\.\w+)$")
    near = lambda v: None if v is None else float("%.12g" % v)

    def near_all(node):
        if isinstance(node, dict):
            return {k: near_all(v) for k, v in node.items()}
        if isinstance(node, list):
            return [near_all(v) for v in node]
        return near(node) if isinstance(node, float) else node

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
        assert p["exit_tb"] <= exit_tb_limit(p), "an oracle case at a size the page refuses"
        tree = compute(p)
        flat = flatten(tree)
        central = {k: v for k, v in flat.items() if kept.match(k)}
        oat = one_at_a_time(inputs, p)
        runs = selector_runs(selectors, p)
        ranges = input_extremes(inputs, p, central, oat)
        drivers = {"%s.%s" % (r, m): [e["name"] for e in rank_drivers("%s.%s" % (r, m), flat, oat, runs, inputs)[:3]]
                   for r in ("catalog." + k for k in tree["catalog"]) for m in MEASURES if "%s.%s" % (r, m) in flat}
        spread = crossover_spread(tree, oat, runs)
        rule = doc["custody"]["default"] if i == 0 else rule_rng.choice(sorted(doc["custody"]["options"]))
        payback = crossover_spread(tree, oat, runs, ("arch", "E", "payback"))
        out.append({
            "custody_rule": rule, "custody": near_all(custody_view(doc, tree, rule)),
            "payback": {k: [near(c["value"]), near(c["low_one_input_or_setting"]), near(c["high_one_input_or_setting"]), len(c["never_under"])] for k, c in payback.items()},
            "settings": settings, "fields": fields, "tree": {k: near(v) for k, v in flat.items() if not k.startswith("topdown.")},
            "ranges": {k: [near(a), near(b)] for k, (a, b) in ranges.items()}, "drivers": drivers,
            "crossovers": {k: [near(c["value"]), near(c["low_one_input_or_setting"]), near(c["high_one_input_or_setting"]), len(c["never_under"])] for k, c in spread.items()},
            "your_use": {k: {t: ({m: near(x) for m, x in v.items()} if isinstance(v, dict) else near(v)) for t, v in row.items()} for k, row in your_use(p, fields).items()},
        })
    typed_cases = []
    # a zero at the floor, values equal to the model's (which move no figure and narrow a spread), and an exact half at the sixth figure, beside ordinary readings
    for typed in ({"node_w": 62}, {"nas_w": 15, "mini_w": 5}, {"a_idle": 0.25, "u_room": 0.2}, {"dev_phone": 3.2, "router_w": 6}, {"cache_share": 0.25},
                  {"office_w": 0}, {"nas_w": 0}, {"nas_w": 46}, {"node_w": 40}, {"node_w": 12345.25}):
        ins, q, records = apply_measured(doc, inputs, base, typed)
        before, after_tree = flatten(compute(base)), compute(q)
        after = flatten(after_tree)
        moved = moved_rows(before, after, reading_probes(inputs, base, typed))
        central = {k: v for k, v in after.items() if kept.match(k) and k.rpartition(".")[0] in moved}
        typed_cases.append({"typed": typed, "line": measured_line(records), "line_unused": measured_line(records, used=False), "records": records, "moved": moved, "tree": {k: near(v) for k, v in central.items()},
                            "ranges": {k: [near(a), near(b)] for k, (a, b) in input_extremes(ins, q, central, one_at_a_time(ins, q)).items()}, "field": near_all(after_tree["field"])})
    refused = ({"node_w": -1}, {"node_w": "many"}, {"node_w": True}, {"u_room": 0}, {"pue_room": 0.5}, {"a_idle": 1.5}, {"p_in": 3}, {"node_w": "1_0"})
    extra = {"measured_cases": typed_cases, "measured_refused": list(refused), "typed_limits": {"most": TYPED_MOST, "exit_tb": exit_tb_limit(base)}}
    if "carbon_damage" in doc:  # part of the removable damage layer
        extra["damage_cases"] = [{"g": g, "family": name, "column": damage_column(doc, g, name)["column"], "head": damage_column(doc, g, name)["head"], **carbon_damage(g, family)}
                                 for name, family in doc["carbon_damage"]["families"].items() for g in (73.0, 306600e6)]
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps({"seed": seed, "cases": out, **extra}, separators=(",", ":")), encoding="utf-8")
    return len(out)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--params", default=str(PARAMS))
    parser.add_argument("--comparison", default=str(COMPARISON))
    parser.add_argument("--out", default=str(OUT))
    parser.add_argument("--export", action="store_true", help="write site/data/resource-model.json and resource-model-inputs.csv")
    parser.add_argument("--out-dir", default=str(PUBLIC), help="the folder --export writes to")
    parser.add_argument("--oracle", action="store_true", help="write the page's oracle, seeded random settings with Python's answers")
    parser.add_argument("--oracle-file", default=str(ORACLE), help="the file --oracle writes to")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    doc, cm = load(args.params, args.comparison)
    if args.export or args.oracle:
        if args.export:
            print(json.dumps(export_public(doc, cm, args.out_dir)))
        if args.oracle:
            print(json.dumps({"oracle_cases": write_oracle(doc, cm, args.oracle_file)}))
        return
    out = build(doc, cm)
    Path(args.out).write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    report(out)
    print("\nwrote", Path(args.out).name)


if __name__ == "__main__":
    main()
