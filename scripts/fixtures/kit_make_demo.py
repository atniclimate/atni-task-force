"""Writes the kit's new demonstration plates and page sections into scripts/fixtures/plate-demo, the fixture scripts/page_check.js
(page_checks/plate.js) reads. Numbers come from claims and the model. It patches the existing plate-demo/index.html and demo.js
(the frozen base page); it does not create them, so it cannot rebuild the fixture from nothing."""
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[2]
DEMO = ROOT / "scripts" / "fixtures" / "plate-demo"
PLATES = DEMO / "data" / "plates"


def plate(**fields):
    PLATES.joinpath(f'{fields["id"]}.json').write_text(json.dumps({"schema": 1, "tier": "T0", "page": "index.html", **fields}, indent=1), encoding="utf-8")


plate(id="project-demo", fit=True, eyebrow="A proposed project",
      title="{mw} MW at a load factor of {lf} uses about {twh[text]} TWh a year, {share[text]} percent of the region's {region} aMW",
      subtitle="An illustration from the reader's inputs.",
      inputs={"region": {"claim": "dem-058"}, "ms": {"claim": "tr-028"}, "lbnl": {"claim": "tr-009"}, "gen": {"claim": "tr-005"}},
      controls=[{"type": "range", "name": "mw", "label": "Project size, MW", "min": 10, "max": 2000, "step": 5, "default": 125},
                {"type": "range", "name": "lf", "label": "Load factor", "min": 0.5, "max": 1, "step": 0.05, "default": 0.8},
                {"type": "number", "name": "lkwh", "label": "Applicant's liters per kWh", "min": 0, "max": 20, "step": 0.01},
                {"type": "segmented", "name": "plant", "label": "Count water at the power plant", "default": "off", "options": [{"value": "off", "label": "No"}, {"value": "on", "label": "Yes"}]},
                {"type": "segmented", "name": "cool", "label": "Cooling", "default": "ms", "options": [{"value": "ms", "label": "At Microsoft", "is": "ms"}, {"value": "lbnl", "label": "At LBNL", "is": "lbnl"}, {"value": "dry", "label": "Closed loop or dry"}]}],
      plot={"type": "instrument", "groups": [{"id": "context", "label": "For context, fixed"}]},
      reading="{mw} MW at {lf} load factor is {amw[text]} aMW, about {twh[text]} TWh a year and {share[text]} percent of the region's {region} aMW; site water {site[text]} million liters a year. Modeled from the reader's inputs.",
      foot=[{"text": "This comparison does not decide a proposal.", "href": "#sessions", "link": "Read the questions"}],
      details=["A fleet average cannot describe a stream in a low-flow August."],
      rows=[{"id": "amw", "label": "Average megawatts", "unit": "aMW", "formula": {"value": "mw * lf"}, "equation": "aMW = MW x load factor"},
            {"id": "twh", "label": "Energy a year", "unit": "TWh", "digits": 2, "formula": {"value": "amw * 8.76 / 1000"}, "equation": "TWh = aMW x 8.76 / 1000"},
            {"id": "share", "label": "Share of the region", "unit": "percent", "digits": 2, "formula": {"value": "amw / region * 100"}},
            {"id": "site", "label": "Site water", "unit": "million liters", "digits": 2, "formula": {"low": "twh * ifblank(lkwh, ms) * 1000", "high": "twh * ifblank(lkwh, lbnl) * 1000"}},
            {"id": "plantwater", "label": "Water at the power plant", "unit": "million liters", "digits": 2, "formula": {"value": "twh * gen * 1000"}, "show": {"plant": "on"}, "gap": "Off: the reservoir convention is unstated"},
            {"id": "cooled", "label": "Water by cooling choice", "unit": "million liters", "digits": 2, "formula": {"value": "twh * cool * 1000"}, "gap": "None on site; the energy penalty is not in the public record"},
            {"id": "naics", "group": "context", "label": "Industry employment", "spark": ["jb-041", "jb-042", "jb-043", "jb-044", "jb-045"]},
            {"id": "montana", "group": "context", "label": "Montana direct jobs", "modeled": True, "figures": [{"claim": "jb-028", "name": "at 500 MW", "limit": "A modeled hypothetical, not a built project."}, {"claim": "jb-029", "name": "at 1,000 MW", "limit": "A modeled hypothetical, not a built project."}]}])

plate(id="matrix-demo", eyebrow="Tradeoffs", title="Of two tradeoffs, each has a national figure and an open question",
      subtitle="A filled square is an agency figure; a hollow one is modeled or a preprint.",
      plot={"type": "matrix", "columns": [{"id": "national", "label": "National scale"}, {"id": "unit", "label": "Per unit"}, {"id": "open", "label": "Open question"}],
            "units": {"billion liters (nearly)": "billion liters", "PUE (ratio)": "PUE"}},
      default="water--national",
      rows=[{"id": "water", "label": "Water", "cells": {
          "national": [{"claim": "tr-001", "say": "{display} on site"}, {"claim": "tr-004", "say": "about {display} at power plants"}],
          "unit": [{"claim": "tr-009", "range": False, "say": "{display} on site"}, {"claim": "tr-005", "say": "{display} at the plant"}],
          "open": "Watershed and season"}},
            {"id": "power", "label": "Power", "cells": {
                "national": [{"claim": "dem-028"}], "unit": [{"claim": "tr-065", "modeled": True}], "open": "Workload split, which no operator discloses"}}])

plate(id="hour-demo", fit=True, model="comparison-model", by="edge", eyebrow="The same hour", title="Ten text prompts add about {now[chat][activity_added]:.0f} Wh in the data center (modeled, 11/2026)",
      subtitle="One boundary at a time, on one log ruler.",
      inputs={"now": {"model": "computed_defaults.same_hour.default"}, "lo": {"model": "computed_defaults.same_hour.low"}, "hi": {"model": "computed_defaults.same_hour.high"},
              "prompt": {"model": "inputs.chat_wh_per_prompt.value"}, "phone": {"model": "computed_defaults.heavy_ai.yardsticks.same_device_total"}, "household": {"model": "inputs.household_wh_per_day.value"}},
      controls=[{"type": "segmented", "name": "edge", "label": "Boundary", "default": "whole", "options": [{"value": "dc", "label": "Data center only"}, {"value": "whole", "label": "Whole hour"}]},
                {"type": "range", "name": "prompts", "label": "Prompts in the hour, the reader's assumption", "min": 1, "max": 60, "step": 1, "default": 10, "presets": [2.52, 10, 30, 60]},
                {"type": "segmented", "name": "device", "label": "Device", "default": "phone", "more": True, "options": [{"value": "phone", "label": "Phone"}, {"value": "laptop", "label": "Laptop"}]}],
      plot={"type": "ladder", "scale": "log", "domain": [0.01, 100000], "count": {"unit": "prompt", "noun": "text prompt"},
            "marks": [{"id": "phone-hour", "label": "Phone video hour", "value": "phone", "unit": "Wh", "digits": 3}], "units": {"Wh per hour": "Wh", "Wh per household per day": "Wh"}},
      reading="{label}: about {display} for the hour, or {prompts_equal} text prompts. {boundary}",
      fields={"prompts_equal": {"formula": "value / prompt", "digits": 3}},
      default="chat", boundary="One boundary at a time.",
      rows=[{"id": "chat", "label": "Chat, at the prompts set", "unit": "Wh", "cites": ["fp-001", "fp-017"], "note": "The prompts are the reader's assumption.",
             "formula": {"dc": {"value": "now.chat.data_center", "low": "lo.chat.data_center", "high": "hi.chat.data_center"}, "whole": {"value": "now.chat.total", "low": "lo.chat.total", "high": "hi.chat.total"}},
             "segments": [{"label": "Data center", "value": "now.chat.data_center"}, {"label": "Network", "value": "now.chat.network", "modeled": True}, {"label": "Router", "value": "now.chat.router", "modeled": True}, {"label": "Device", "value": "now.chat.device"}]},
            {"id": "video", "label": "Streamed video, one hour", "unit": "Wh", "cites": ["fp-122", "fp-130"],
             "formula": {"dc": {"value": "now.video.data_center", "low": "lo.video.data_center", "high": "hi.video.data_center"}, "whole": {"value": "now.video.total", "low": "lo.video.total", "high": "hi.video.total"}}},
            {"id": "charge", "label": "Phone charge", "claims": {"dc": None, "whole": "fp-073"}},
            {"id": "household", "label": "Household day", "unit": "Wh", "digits": 4, "cites": ["fp-075"], "formula": {"dc": None, "whole": {"value": "household"}}}],
      table={"columns": [{"label": "Row", "field": "label"}, {"label": "Boundary", "field": "setting"}, {"label": "Wh", "field": "display"}, {"label": "Prompts", "field": "prompts_equal"}, {"label": "Claims", "field": "claims"}]})

plate(id="cases-demo", eyebrow="Servers", title="{series} reaches {display} in {year}", subtitle="A band from the lowest to the highest case. Dashed is a projection.",
      plot={"type": "lines", "highlight_by": "case", "projected_from": 2026, "band": {"across": "series"}, "band_label": "Range of the cases", "units": {"BkWh": "billion kWh"}},
      controls=[{"type": "segmented", "name": "case", "label": "Case", "default": "Baseline", "options": [{"value": "Baseline", "label": "Baseline"}, {"value": "High demand", "label": "High demand"}]}],
      reading="{series}: {display} in {year}; the cases span {band_low} to {band_high}.", boundary="Servers only.",
      rows=[{"series": "Baseline", "claim": "dem-001", "points": "series"}, {"series": "High demand", "claim": "dem-004", "points": "series"}],
      also=[{"claim": "dem-016", "label": "Servers' share of commercial sales"}])

plate(id="money-demo", fit=True, eyebrow="Money", title="{series} in fiscal {year}: {display}", subtitle="Three panels, each with its own axis. Fiscal years differ.",
      plot={"type": "multiples", "highlight_by": "company", "units": {"USD billion": "billion dollars"},
            "panels": [{"id": "capex", "label": "Capital spending"}, {"id": "ocf", "label": "Operating cash flow"}, {"id": "cash", "label": "Cash and securities"}]},
      controls=[{"type": "segmented", "name": "company", "label": "Company", "default": "Amazon", "options": [{"value": "Amazon", "label": "Amazon"}, {"value": "Microsoft", "label": "Microsoft"}, {"value": "Apple", "label": "Apple"}]}],
      reading_group="{series}, fiscal {year} (ends {end}): capital spending {capex}, operating cash flow {ocf}, cash and securities {cash}, billion dollars.", boundary="SEC filings, cash basis.",
      rows=[{"panel": "capex", "series": "Microsoft", "claim": "fin-001", "points": "series_fiscal_year_ends"}, {"panel": "capex", "series": "Amazon", "claim": "fin-003", "points": "series_fiscal_year_ends"}, {"panel": "capex", "series": "Apple", "claim": "fin-005", "points": "series_fiscal_year_ends"},
            {"panel": "ocf", "series": "Microsoft", "claim": "fin-008", "points": "series_fiscal_year_ends"}, {"panel": "ocf", "series": "Amazon", "claim": "fin-010", "points": "series_fiscal_year_ends"}, {"panel": "ocf", "series": "Apple", "claim": "fin-012", "points": "series_fiscal_year_ends"},
            {"panel": "cash", "series": "Microsoft", "claim": "fin-035", "points": "series_fiscal_year_ends"}, {"panel": "cash", "series": "Amazon", "claim": "fin-037", "points": "series_fiscal_year_ends"}, {"panel": "cash", "series": "Apple", "claim": "fin-039", "points": "series_fiscal_year_ends"}],
      table={"by": ["series", "year", "end"], "across": "panel", "labels": {"series": "Company", "year": "Fiscal year", "end": "Year ends"}})

plate(id="rulers-demo", eyebrow="Water", title="Two bases, two rulers: {label} reports {display}", subtitle="Each ruler states its basis, and the two never share an axis.",
      plot={"type": "ladder", "units": {"L/kWh (withdrawal basis)": "L/kWh"},
            "groups": [{"id": "use", "label": "Consumption basis: water that evaporates", "domain": [0, 1.5], "mark": "bar"}, {"id": "draw", "label": "Withdrawal per IT kWh: water drawn, some returned", "domain": [0, 1.5]}]},
      rows=[{"id": "ms", "group": "use", "label": "Microsoft", "claim": "tr-028"}, {"id": "lbnl", "group": "use", "label": "LBNL model", "claim": "tr-009", "range": False},
            {"id": "meta", "group": "draw", "label": "Meta", "claim": "tr-025"}, {"id": "amazon", "group": "draw", "label": "Amazon", "claim": "rs-052", "limit": "Amazon's own definition of its figure."}])

plate(id="pair-demo", eyebrow="Spending against cash", title="{label}, fiscal {year}: {display}", subtitle="One row per company. The line runs between the two marks.",
      by="fy", plot={"type": "ladder", "units": {"USD billion": "billion dollars"}},
      controls=[{"type": "segmented", "name": "fy", "label": "Fiscal year", "default": "latest", "options": [{"value": "2023", "label": "2023"}, {"value": "2024", "label": "2024"}, {"value": "latest", "label": "Latest"}]}],
      reading_group="{label}, fiscal {year}: capital spending {capex} billion against {cash} billion of cash and marketable securities.",
      rows=[{"id": "amazon", "label": "Amazon", "pair": [{"id": "capex", "name": "Capital spending", "claim": "fin-003", "points": "series_fiscal_year_ends"}, {"id": "cash", "name": "Cash and securities", "claim": "fin-037", "points": "series_fiscal_year_ends"}]},
            {"id": "apple", "label": "Apple", "pair": [{"id": "capex", "name": "Capital spending", "claim": "fin-005", "points": "series_fiscal_year_ends"}, {"id": "cash", "name": "Cash and securities", "claim": "fin-039", "points": "series_fiscal_year_ends"}]}],
      table={"by": ["label", "when", "end"], "across": "series", "labels": {"label": "Company", "when": "Stop", "end": "Year ends"}})

plate(id="jobs-demo", eyebrow="Occupations", title="BLS projects {label} at {display} by 2035", subtitle="Percent change, 2025 to 2035. Every bar is a projection.",
      plot={"type": "bars", "sort": "order", "signed": True, "projected": True, "axis_label": "Projected percent change, 2025 to 2035", "marks": [{"id": "all", "label": "All occupations", "claim": "jb-010"}]},
      controls=[{"type": "segmented", "name": "order", "label": "Sort", "default": "value", "options": [{"value": "value", "label": "By change"}, {"value": "tag", "label": "By group"}]}],
      rows=[{"id": "keyers", "label": "Data entry keyers", "claim": "jb-007"}, {"id": "scientists", "label": "Data scientists", "claim": "jb-002"},
            {"id": "electricians", "label": "Electricians", "claim": "jb-011", "tag": "Buildout trade"}, {"id": "linemen", "label": "Line workers", "claim": "jb-013", "tag": "Buildout trade"}])

plate(id="shift-demo", eyebrow="Displacement", title="Studies disagree: {label} {display}", subtitle="Each row measures a different thing. Signs are printed.",
      plot={"type": "ladder", "signed": True},
      rows=[{"id": "stanford", "label": "Payroll study, ages 22 to 25, below trend", "claim": "jb-046", "negate": True}, {"id": "pwc", "label": "Job ads, entry level", "claim": "jb-070", "limit": "Job ads, not hires.", "modeled": True},
            {"id": "yale", "label": "Survey tracker", "claim": "jb-050", "gap": "No connection found"}])

plate(id="misses-demo", eyebrow="Forecast misses", title="{series}: {display} for {year}", subtitle="One panel per source, each on its own axis. Superseded editions are hollow.",
      plot={"type": "multiples", "select": "point", "projected_from": 2025, "panels": [{"id": "lbnl", "label": "LBNL, US data centers"}, {"id": "bnef", "label": "BNEF, installed capacity"}]},
      default="lbnl-2024", reading="{series}: {display} for {year}.", boundary="Each edition on its own axis.",
      rows=[{"id": "lbnl-2024", "panel": "lbnl", "series": "2025 edition", "claim": "dem-028"}, {"id": "lbnl-2028", "panel": "lbnl", "series": "2025 edition", "claim": "dem-033"},
            {"id": "lbnl-range", "panel": "lbnl", "series": "2024 edition", "claim": "dem-037", "modeled": True, "note": "Superseded by the 2025 edition."},
            {"id": "bnef-a", "panel": "bnef", "series": "12/2025 outlook", "claim": "dem-055", "modeled": True, "note": "Superseded by the 07/2026 outlook."}, {"id": "bnef-b", "panel": "bnef", "series": "07/2026 outlook", "claim": "dem-054"}])

# Fresh shipped claims and the model, and the page's new sections.
for path in (ROOT / "site" / "data" / "claims").glob("*.json"):
    shutil.copy(path, DEMO / "data" / "claims" / path.name)
shutil.copy(ROOT / "site" / "data" / "comparison-model.json", DEMO / "data" / "comparison-model.json")

page = DEMO / "index.html"
text = page.read_text(encoding="utf-8")
new = [("project", "Instrument", "project-demo"), ("matrix", "Matrix", "matrix-demo"), ("hour", "Count and model", "hour-demo"), ("cases", "Band", "cases-demo"),
       ("money", "Panels", "money-demo"), ("rulers", "Two rulers", "rulers-demo"), ("pair", "Dumbbell", "pair-demo"), ("jobs", "Diverging bars", "jobs-demo"), ("shift", "Diverging ladder", "shift-demo"), ("misses", "Points", "misses-demo")]
if "plate-svg.js" not in text:
    text = text.replace('<script defer src="../../../site/assets/js/plate.js"></script>', '<script defer src="../../../site/assets/js/plate-svg.js"></script>\n  <script defer src="../../../site/assets/js/plate.js"></script>')
for tab, label, plate_id in new:
    if f'href="#{tab}"' not in text:
        text = text.replace("    </ul></div></nav>", f'      <li><a href="#{tab}">{label}</a></li>\n    </ul></div></nav>')
        text = text.replace("  </main>", f'    <section id="{tab}" class="section panel"><div class="wrap">\n<!-- plate:{plate_id} -->\n<!-- /plate:{plate_id} -->\n    </div></section>\n  </main>')
if "<!-- bench:matrix-demo -->" not in text:
    text = text.replace('      <button class="theme-toggle"', '      <p>Region: <span data-pour="dem-058">old</span>, from <a class="receipt" data-pour="dem-058" data-field="source" href="#">old</a>.</p>\n'
                        '      <p><span data-pour="jb-070" data-field="text">old</span> <span data-pour="jb-070" data-field="limit">old</span></p>\n'
                        '      <!-- bench:matrix-demo -->\n      <!-- /bench:matrix-demo -->\n      <button class="theme-toggle"')
page.write_text(text, encoding="utf-8", newline="\n")
print("demo plates", len(list(PLATES.glob("*.json"))))
