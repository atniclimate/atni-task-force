"""Builds the fixture work/site-refresh/tmp/ai-oracle.json, which scripts/page_check.js (page_checks/ai.js) reads.
Runs compare_model.py's own functions over settings that computed_defaults does not store, to compare against ai.js."""
import contextlib
import io
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
with contextlib.redirect_stdout(io.StringIO()):
    import compare_model as cm

BASE = {"prompts_per_hour": 10, "device": "phone", "connection": "wifi", "network_mode": "average", "router_allocation": "by_time", "video_dc_intensity": "measured_delivery", "chat_wh_per_prompt": 0.3}
CASES = [
    {"prompts_per_hour": 37, "device": "laptop", "connection": "cellular", "network_mode": "marginal", "video_dc_intensity": "desnz_followup", "chat_wh_per_prompt": 0.45},
    {"prompts_per_hour": 2.52, "device": "tv", "router_allocation": "by_data", "chat_wh_per_prompt": 3.91},
    {"prompts_per_hour": 60, "device": "phone", "router_allocation": "excluded", "network_mode": "marginal", "chat_wh_per_prompt": 17.15},
    {"prompts_per_hour": 1, "device": "laptop", "video_dc_intensity": "desnz_followup", "chat_wh_per_prompt": 0.24},
]
out = []
for change in CASES:
    s = {**BASE, **change}
    out.append({"settings": s, "same_hour": {"value": cm.same_hour(s), "low": cm.same_hour(s, "low"), "high": cm.same_hour(s, "high")}, "per_person_day": cm.per_person_day(s), "heavy_ai": cm.heavy_ai(s), "scale": cm.scale(s)})
json.dump({"cases": out, "project": cm.project(250)}, open(ROOT / "work" / "site-refresh" / "tmp" / "ai-oracle.json", "w", encoding="utf-8"), indent=1)
print("oracle cases", len(out))
