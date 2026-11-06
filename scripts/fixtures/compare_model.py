"""Computes the chat-versus-video comparison model from work/site-refresh/evidence/comparison-model.json.
Imported by ai_oracle.py, which builds the fixture work/site-refresh/tmp/ai-oracle.json that scripts/page_check.js reads.
Usage: compare_model.py [--write]   (--write stores computed_defaults in the JSON; default mode checks them and the method doc)
"""
import io, json, sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ROOT = (REPO / "work" / "site-refresh").as_posix()
JP = ROOT + "/evidence/comparison-model.json"
DOC = (REPO / "docs" / "COMPARISON-METHOD.md").as_posix()
M = json.load(io.open(JP, encoding="utf-8"))
I, A = M["inputs"], M["assumptions"]
VIDEO_DC = A["video_dc_intensity"]["options"]


def fmt(x):
    if x >= 100: return f"{x:,.0f}"
    if x >= 10: return f"{x:.1f}"
    if x >= 1: return f"{x:.2f}"
    return f"{x:.2g}"


def defaults():
    return {k: v["default"] for k, v in A.items()}


def net_intensity(s, which):  # which: value | low | high
    key = ("net_fixed_" if s["connection"] == "wifi" else "net_mobile_") + ("avg" if s["network_mode"] == "average" else "marginal") + "_wh_per_gb"
    return I[key][which]


def same_hour(s, which="value"):
    """Segments in Wh for one hour, per row. which picks value, low or high of every input (settings stay fixed)."""
    dev = s["device"]
    chat_gb = s["prompts_per_hour"] * I["chat_kb_per_prompt"][which] / 1e6
    gb = {"chat": chat_gb, "video": I["video_gb_per_hour"][dev][which], "short": I["short_gb_per_hour"][which]}
    e_prompt = s["chat_wh_per_prompt"] if which == "value" else I["chat_wh_per_prompt"][which]
    dc_per_gb = VIDEO_DC[s["video_dc_intensity"]] if which == "value" else I["video_dc_wh_per_gb"][which]
    # shortcut: the feed is charged delivery per GB like streaming (ranking compute unmeasured), capped at Meta's ceiling; upgrade when a feed is metered
    dc = {"chat": s["prompts_per_hour"] * e_prompt, "video": gb["video"] * dc_per_gb,
          "short": min(gb["short"] * dc_per_gb, I["short_dc_ceiling_wh_per_hour"]["value"])}
    out = {}
    for row in ("chat", "video", "short"):
        if s["connection"] == "cellular" or s["router_allocation"] == "excluded":
            router = 0.0
        elif s["router_allocation"] == "by_time":
            router = I["router_watts"][which] * 1.0
        else:
            router = I["router_wh_per_gb"]["value"] * gb[row]
        seg = {"data_center": dc[row], "network": gb[row] * net_intensity(s, which), "router": router, "device": I["device_wh_per_hour"][dev][which]}
        seg["activity_added"] = seg["data_center"] + seg["network"]
        seg["total"] = seg["activity_added"] + seg["router"] + seg["device"]
        out[row] = seg
    return out


def per_person_day(s):
    e, C, P = s["chat_wh_per_prompt"], I["chat_messages_per_day"], I["chat_wh_per_prompt"]
    dc_gb = VIDEO_DC[s["video_dc_intensity"]]
    vmin, smin = I["video_minutes_per_day"]["value"] / 60, I["short_minutes_per_day"]["value"] / 60
    phone_gb, meta = I["video_gb_per_hour"]["phone"]["value"], I["meta_wh_per_person_day"]["value"]
    rows = {
        "chat_day": C["value"] * e,
        "chat_day_low": C["low"] * P["low"],
        "chat_day_mean": C["value"] * P["mean"],
        "chat_day_high": C["high"] * P["high"],
        "meta_person": meta,
        "video_day": vmin * phone_gb * dc_gb,
        "video_day_desnz": vmin * phone_gb * VIDEO_DC["desnz_followup"],
        "video_day_high": vmin * phone_gb * I["video_dc_wh_per_gb"]["high"],
        "short_day": smin * I["short_gb_per_hour"]["value"] * dc_gb,
        "short_day_desnz": smin * I["short_gb_per_hour"]["value"] * VIDEO_DC["desnz_followup"],
        "short_day_high": min(smin * I["short_dc_ceiling_wh_per_hour"]["value"], meta),
        "short_ceiling_per_hour_at_minutes": meta / smin,
    }
    hh = I["household_wh_per_day"]["value"]
    rows["chat_day_household_pct"] = rows["chat_day"] / hh * 100
    rows["meta_household_pct"] = rows["meta_person"] / hh * 100
    return rows


def heavy_ai(s):
    e, whole = s["chat_wh_per_prompt"], I["stream_whole_chain_wh_per_hour"]
    hour = same_hour(s)["video"]
    yard = {"same_device_total": hour["total"], "same_device_dc": hour["data_center"],
            "desnz_dc": I["video_gb_per_hour"][s["device"]]["value"] * VIDEO_DC["desnz_followup"], "published": whole["value"]}
    out = {"yardsticks": yard, "text_prompt_seconds": {k: e / v * 3600 for k, v in yard.items()}}
    for h in I["heavy_ai"]:
        v = h["value"]
        out[h["key"]] = {"wh": v, "prompts": v / e, "hours_same_device": v / yard["same_device_total"],
                         "hours_published": v / whole["value"], "hours_published_low": v / whole["high"], "hours_published_high": v / whole["low"],
                         "hours_dc_delivery": v / yard["same_device_dc"], "hours_dc_desnz": v / yard["desnz_dc"]}
    return out


def scale(s):
    e, S, P = s["chat_wh_per_prompt"], I["scale"], I["chat_wh_per_prompt"]
    msgs = S["chatgpt_messages_per_day"]["value"]
    chat = msgs * 365 * e / 1e12
    chat_lo, chat_mean, chat_hi = (msgs * 365 * P[k] / 1e12 for k in ("low", "mean", "high"))
    yt_gb = S["youtube_hours_per_day"]["value"] * 365 * I["video_gb_per_hour"]["mix"]["value"]
    yt_h = S["youtube_hours_per_day"]["value"] * 365
    nw = S["nw_dc_only_2030_amw"]["value"] * 8.76 / 1000
    return {
        "chat_twh": chat, "chat_twh_low": chat_lo, "chat_twh_mean": chat_mean, "chat_twh_high": chat_hi,
        "chat_amw": msgs * e / 24 / 1e6,
        "chat_pct_iea_2025": chat / S["iea_world_2025_twh"]["value"] * 100,
        "chat_pct_iea_2025_high": chat_hi / S["iea_world_2025_twh"]["value"] * 100,
        "chat_pct_lbnl_2024": chat / S["lbnl_us_2024_twh"]["value"] * 100,
        "youtube_dc_twh_delivery": yt_gb * VIDEO_DC["measured_delivery"] / 1e12,
        "youtube_dc_twh_desnz": yt_gb * VIDEO_DC["desnz_followup"] / 1e12,
        "youtube_dc_twh_top": yt_gb * VIDEO_DC["top_down"] / 1e12,
        "youtube_whole_twh": yt_h * I["stream_whole_chain_wh_per_hour"]["value"] / 1e12,
        "youtube_whole_twh_low": yt_h * I["stream_whole_chain_wh_per_hour"]["low"] / 1e12,
        "youtube_whole_twh_high": yt_h * I["stream_whole_chain_wh_per_hour"]["high"] / 1e12,
        "nw_dc_twh_2030": nw, "nw_dc_twh_2030_low": S["nw_dc_only_2030_amw"]["low"] * 8.76 / 1000, "nw_dc_twh_2030_high": S["nw_dc_only_2030_amw"]["high"] * 8.76 / 1000,
        "nw_dc_pct_of_region": S["nw_dc_only_2030_amw"]["value"] / S["nw_region_amw"]["value"] * 100,
        "iea_growth_2025_2030_twh": S["iea_world_2030_twh"]["value"] - S["iea_world_2025_twh"]["value"],
        "lbnl_growth_2024_2030_twh": S["lbnl_us_2030_twh"]["value"] - S["lbnl_us_2024_twh"]["value"],
    }


def project(amw):
    """View 5: a proposed project. amw = MW x load factor, entered by the reader."""
    twh, W = amw * 8.76 / 1000, I["water_carbon"]
    return {"amw": amw, "twh": twh, "pct_of_region": amw / I["scale"]["nw_region_amw"]["value"] * 100,
            "site_water_ml_low": twh * 1e9 * W["microsoft_wue_l_per_kwh"]["value"] / 1e6,
            "site_water_ml_high": twh * 1e9 * W["google_fleet_wue_l_per_kwh"]["value"] / 1e6}


def compute():
    d, kind, presets = defaults(), A["chat_kind"]["options"], A["prompts_per_hour"]["presets"]
    alt = {
        "laptop": dict(d, device="laptop"), "tv": dict(d, device="tv"),
        "router_by_data": dict(d, router_allocation="by_data"), "router_excluded": dict(d, router_allocation="excluded"),
        "cellular": dict(d, connection="cellular"), "marginal": dict(d, network_mode="marginal"),
        "desnz": dict(d, video_dc_intensity="desnz_followup"),
        "prompts_2_5": dict(d, prompts_per_hour=presets[0]), "prompts_30": dict(d, prompts_per_hour=presets[2]), "prompts_60": dict(d, prompts_per_hour=presets[3]),
        "kind_medium": dict(d, chat_wh_per_prompt=kind["medium_prompt"]), "kind_reasoning": dict(d, chat_wh_per_prompt=kind["reasoning"]),
        "kind_high": dict(d, chat_wh_per_prompt=kind["high_reasoning"]),
    }
    return {
        "settings": d,
        "same_hour": {"default": same_hour(d), "low": same_hour(d, "low"), "high": same_hour(d, "high"), **{k: same_hour(v) for k, v in alt.items()}},
        "per_person_day": per_person_day(d), "heavy_ai": heavy_ai(d), "scale": scale(d),
        "project": project(M["views"]["project"]["illustration_amw"]),
    }


def flat(o, p=""):
    if isinstance(o, dict):
        for k, v in o.items():
            yield from flat(v, f"{p}.{k}" if p else k)
    elif isinstance(o, (int, float)) and not isinstance(o, bool):
        yield p, float(o)


C = compute()
if "--write" in sys.argv:
    M["computed_defaults"] = C
    io.open(JP, "w", encoding="utf-8", newline="\n").write(json.dumps(M, indent=1, ensure_ascii=False) + "\n")
    print("wrote computed_defaults")
    sys.exit(0)

# 1. JSON computed_defaults match a fresh computation.
stored = dict(flat(M["computed_defaults"]))
fresh = dict(flat(C))
assert stored.keys() == fresh.keys(), "computed_defaults keys differ; run --write"
bad = [k for k in fresh if abs(stored[k] - fresh[k]) > 1e-9 * max(1.0, abs(fresh[k]))]
assert not bad, f"computed_defaults stale: {bad[:5]}"

# The Sora row and its claim carry the paper's mean, so the plate and the model cannot disagree.
sora = next(h for h in I["heavy_ai"] if h["key"] == "sora2pro_8s")
fp137 = next(c for c in json.load(io.open(ROOT + "/evidence/footprint.json", encoding="utf-8"))["claims"] if c["id"] == "fp-137")
assert (sora["value"], sora["low"], sora["high"]) == (fp137["value"], fp137["low"], fp137["high"]), "the model's Sora row differs from fp-137"

# 2. Every number quoted in the method document matches the model.
doc = io.open(DOC, encoding="utf-8").read()
sh, pp, ha, sc, pj = C["same_hour"], C["per_person_day"], C["heavy_ai"], C["scale"], C["project"]
D, Y, T = sh["default"], ha["yardsticks"], ha["text_prompt_seconds"]
quoted = {
    "chat default total": D["chat"]["total"], "video default total": D["video"]["total"], "short default total": D["short"]["total"],
    "chat dc": D["chat"]["data_center"], "chat dc low": sh["low"]["chat"]["data_center"], "chat dc high": sh["high"]["chat"]["data_center"],
    "chat net": D["chat"]["network"], "chat net high": sh["high"]["chat"]["network"],
    "video dc": D["video"]["data_center"], "video dc low": sh["low"]["video"]["data_center"], "video dc high": sh["high"]["video"]["data_center"],
    "video net": D["video"]["network"], "short dc": D["short"]["data_center"], "short net": D["short"]["network"],
    "chat added": D["chat"]["activity_added"], "video added": D["video"]["activity_added"], "short added": D["short"]["activity_added"],
    "chat total low": sh["low"]["chat"]["total"], "chat total high": sh["high"]["chat"]["total"],
    "video total low": sh["low"]["video"]["total"], "video total high": sh["high"]["video"]["total"],
    "short total low": sh["low"]["short"]["total"], "short total high": sh["high"]["short"]["total"],
    "desnz video dc": sh["desnz"]["video"]["data_center"], "desnz video total": sh["desnz"]["video"]["total"],
    "desnz short dc": sh["desnz"]["short"]["data_center"], "desnz short total": sh["desnz"]["short"]["total"],
    "tv video total": sh["tv"]["video"]["total"], "tv chat total": sh["tv"]["chat"]["total"], "tv short total": sh["tv"]["short"]["total"],
    "laptop video total": sh["laptop"]["video"]["total"], "laptop chat total": sh["laptop"]["chat"]["total"], "laptop short total": sh["laptop"]["short"]["total"],
    "router by data video": sh["router_by_data"]["video"]["total"], "router by data chat": sh["router_by_data"]["chat"]["total"], "router by data short": sh["router_by_data"]["short"]["total"],
    "excluded chat": sh["router_excluded"]["chat"]["total"], "excluded video": sh["router_excluded"]["video"]["total"], "excluded short": sh["router_excluded"]["short"]["total"],
    "cellular chat": sh["cellular"]["chat"]["total"], "cellular video": sh["cellular"]["video"]["total"], "cellular video net": sh["cellular"]["video"]["network"], "cellular short": sh["cellular"]["short"]["total"],
    "marginal video net": sh["marginal"]["video"]["network"], "marginal video total": sh["marginal"]["video"]["total"],
    "prompts 2.5 added": sh["prompts_2_5"]["chat"]["activity_added"], "prompts 30 added": sh["prompts_30"]["chat"]["activity_added"],
    "prompts 60 added": sh["prompts_60"]["chat"]["activity_added"], "prompts 60 chat total": sh["prompts_60"]["chat"]["total"],
    "kind medium dc": sh["kind_medium"]["chat"]["data_center"], "kind medium total": sh["kind_medium"]["chat"]["total"],
    "kind reasoning dc": sh["kind_reasoning"]["chat"]["data_center"], "kind reasoning total": sh["kind_reasoning"]["chat"]["total"],
    "kind high dc": sh["kind_high"]["chat"]["data_center"], "kind high total": sh["kind_high"]["chat"]["total"],
    "chat day": pp["chat_day"], "chat day low": pp["chat_day_low"], "chat day mean": pp["chat_day_mean"], "chat day high": pp["chat_day_high"],
    "video day": pp["video_day"], "video day desnz": pp["video_day_desnz"], "video day high": pp["video_day_high"],
    "short day": pp["short_day"], "short day desnz": pp["short_day_desnz"], "short day high": pp["short_day_high"], "short ceiling at minutes": pp["short_ceiling_per_hour_at_minutes"],
    "chat household pct": pp["chat_day_household_pct"], "meta household pct": pp["meta_household_pct"],
    "yard same device": Y["same_device_total"], "yard same device dc": Y["same_device_dc"], "yard desnz dc": Y["desnz_dc"],
    "prompt seconds same device": T["same_device_total"], "prompt seconds published": T["published"],
    "prompt minutes dc delivery": T["same_device_dc"] / 60, "prompt seconds dc desnz": T["desnz_dc"],
    "reasoning prompts": ha["reasoning_15x"]["prompts"], "reasoning hours same device": ha["reasoning_15x"]["hours_same_device"],
    "reasoning hours dc": ha["reasoning_15x"]["hours_dc_delivery"], "reasoning hours dc desnz": ha["reasoning_15x"]["hours_dc_desnz"],
    "gpt5 long prompts": ha["gpt5_high_long"]["prompts"], "gpt5 long hours same device": ha["gpt5_high_long"]["hours_same_device"],
    "image prompts": ha["image_sd3"]["prompts"], "image hours same device": ha["image_sd3"]["hours_same_device"],
    "veo prompts": ha["veo3_8s"]["prompts"], "veo hours same device": ha["veo3_8s"]["hours_same_device"], "veo minutes published": ha["veo3_8s"]["hours_published"] * 60,
    "veo hours dc": ha["veo3_8s"]["hours_dc_delivery"], "veo hours dc desnz": ha["veo3_8s"]["hours_dc_desnz"],
    "sora prompts": ha["sora2pro_8s"]["prompts"], "sora hours same device": ha["sora2pro_8s"]["hours_same_device"], "sora hours published": ha["sora2pro_8s"]["hours_published"],
    "wan13 prompts": ha["wan_1_3b"]["prompts"], "wan13 hours same device": ha["wan_1_3b"]["hours_same_device"], "wan13 minutes published": ha["wan_1_3b"]["hours_published"] * 60,
    "wan14 prompts": ha["wan_14b"]["prompts"], "wan14 hours same device": ha["wan_14b"]["hours_same_device"], "wan14 hours published": ha["wan_14b"]["hours_published"],
    "cogvideo prompts": ha["cogvideox_5s"]["prompts"], "cogvideo hours same device": ha["cogvideox_5s"]["hours_same_device"],
    "cogvideo hours published": ha["cogvideox_5s"]["hours_published"], "cogvideo hours published low": ha["cogvideox_5s"]["hours_published_low"],
    "cogvideo hours published high": ha["cogvideox_5s"]["hours_published_high"], "cogvideo hours dc": ha["cogvideox_5s"]["hours_dc_delivery"], "cogvideo hours dc desnz": ha["cogvideox_5s"]["hours_dc_desnz"],
    "agent prompt prompts": ha["agent_prompt"]["prompts"], "agent prompt hours same device": ha["agent_prompt"]["hours_same_device"], "agent prompt hours published": ha["agent_prompt"]["hours_published"],
    "agent session prompts": ha["agent_session"]["prompts"], "agent session hours same device": ha["agent_session"]["hours_same_device"], "agent session hours published": ha["agent_session"]["hours_published"],
    "agent day prompts": ha["agent_day"]["prompts"], "agent day hours same device": ha["agent_day"]["hours_same_device"], "agent day hours published": ha["agent_day"]["hours_published"],
    "chat twh": sc["chat_twh"], "chat twh low": sc["chat_twh_low"], "chat twh mean": sc["chat_twh_mean"], "chat twh high": sc["chat_twh_high"], "chat amw": sc["chat_amw"],
    "chat pct iea": sc["chat_pct_iea_2025"], "chat pct iea high": sc["chat_pct_iea_2025_high"], "chat pct lbnl": sc["chat_pct_lbnl_2024"],
    "yt dc delivery": sc["youtube_dc_twh_delivery"], "yt dc desnz": sc["youtube_dc_twh_desnz"],
    "yt whole": sc["youtube_whole_twh"], "yt whole low": sc["youtube_whole_twh_low"], "yt whole high": sc["youtube_whole_twh_high"],
    "nw dc twh": sc["nw_dc_twh_2030"], "nw dc twh low": sc["nw_dc_twh_2030_low"], "nw dc twh high": sc["nw_dc_twh_2030_high"], "nw dc pct region": sc["nw_dc_pct_of_region"],
    "iea growth": sc["iea_growth_2025_2030_twh"], "lbnl growth": sc["lbnl_growth_2024_2030_twh"],
    "project twh": pj["twh"], "project pct": pj["pct_of_region"], "project water low": pj["site_water_ml_low"], "project water high": pj["site_water_ml_high"],
}
missing = [(k, fmt(v)) for k, v in quoted.items() if fmt(v) not in doc]
for k, v in quoted.items():
    print(f"{k:32s} {fmt(v):>10s}")
assert not missing, f"method doc lacks: {missing}"
print(f"OK: computed_defaults current; {len(quoted)} quoted numbers found in COMPARISON-METHOD.md")
