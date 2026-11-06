"""Fit the idle term of one machine from plug-meter readings. Nothing leaves this machine through the site; any release is that Nation's decision.

Reads a CSV of wall watts at measured utilization, fits watts = P_idle + (P_max - P_idle) x utilization by least squares, and prints the idle fraction a = P_idle / P_max,
the utilization U, and the Resource Use Explorer's energy multiplier at that a and U, each with its error and beside the model's default. docs/FIELD-PROTOCOL.md says how to take the readings.

    python scripts/fit_idle.py READINGS.csv [--compare node_w] [--model site/data/resource-model.json]
    python scripts/fit_idle.py --self-test

Columns: utilization (0 to 1) and watts. Optional: seconds (how long a reading lasted, weights U) and phase (sweep, a step of a load test, fits a; log, ordinary use, sets U).
With no phase column every reading does both, and U is only the mean of those readings; with one, every row carries a phase. --compare reads the model's default beside
the figure that input stands for: the idle watts for node_w, nas_w, and mini_w, and for office_w, which the model counts as the server's whole year at one draw, the ordinary
week's average watts. Standard library only.
"""
import argparse
import csv
import io
import json
import math
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from resource_model import idle_mult  # noqa: E402  the one formula the page and the model use

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "site" / "data" / "resource-model.json"
LIMIT = "Limit: one device's readings do not generalize."
COMPARE = {"node_w": "AI node idle", "office_w": "office server, a year's average draw", "nas_w": "NAS idle", "mini_w": "media box idle"}
AVERAGE = {"office_w"}  # the model counts this server's whole year at one draw, so it takes the ordinary week's average watts and never the idle watts
POOR_FIT = 0.05  # a convention, not a test: over 5 percent of full load the straight line is a poor description of this machine
NEAR_END = 0.1  # a convention: a sweep reading within 10 percent of idle or of full load anchors that end of the line; without one the fit extrapolates to it


class BadReadings(ValueError):
    """Readings the fit cannot use, with the way to fix them."""


def read_rows(text):
    reader = csv.DictReader(io.StringIO(text))
    names = {(n or "").strip().lower() for n in (reader.fieldnames or [])}
    if not {"utilization", "watts"} <= names:
        raise BadReadings("the file needs a header with utilization and watts columns; it has: %s" % (", ".join(sorted(names)) or "no header"))
    rows = []
    for line, raw in enumerate(reader, 2):
        row = {(k or "").strip().lower(): (v or "").strip() if isinstance(v, str) else v for k, v in raw.items()}
        try:
            u, w, s = float(row["utilization"]), float(row["watts"]), float(row.get("seconds") or 1)
        except (TypeError, ValueError):
            raise BadReadings("line %d: utilization, watts, and seconds must be numbers" % line) from None
        if not 0 <= u <= 1:
            raise BadReadings("line %d: utilization runs from 0 to 1, so write 50 percent as 0.5" % line)
        if not (0 <= w < math.inf and 0 < s < math.inf):
            raise BadReadings("line %d: watts must be zero or more and seconds more than zero" % line)
        phase = (row.get("phase") or "").lower()
        if phase not in ("", "sweep", "log"):
            raise BadReadings("line %d: phase is sweep or log, and a blank phase is allowed only when no row has one" % line)
        rows.append({"u": u, "w": w, "s": s, "phase": phase, "line": line})
    blank = [r["line"] for r in rows if not r["phase"]]
    if blank and len(blank) < len(rows):  # a blank row in a phased file would join neither the sweep nor the log, and its hours would vanish
        raise BadReadings("line %d: this file marks some rows sweep or log, so mark every row, or remove the phase column so every row does both" % blank[0])
    return rows


def fit_line(points):
    """Least squares through (utilization, watts), with plain standard errors from the residuals. They assume independent readings on a straight line, so serial dependence
    between readings, meter error, a machine whose curve the line does not follow, and few readings all make them read low."""
    n = len(points)
    if n < 3:
        raise BadReadings("the fit needs at least 3 readings; it has %d" % n)
    mean_u, mean_w = sum(u for u, _ in points) / n, sum(w for _, w in points) / n
    sxx = sum((u - mean_u) ** 2 for u, _ in points)
    if sxx == 0:
        raise BadReadings("every reading sits at one utilization; take them from idle to full load")
    slope = sum((u - mean_u) * (w - mean_w) for u, w in points) / sxx
    intercept = mean_w - slope * mean_u
    rss = sum((w - intercept - slope * u) ** 2 for u, w in points)
    s2 = rss / (n - 2)
    return {"intercept": intercept, "slope": slope, "n": n, "df": n - 2, "rmse": math.sqrt(rss / n), "var_slope": s2 / sxx, "var_intercept": s2 * (1 / n + mean_u ** 2 / sxx), "cov": -mean_u * s2 / sxx}


def idle_fraction(line):
    """a = P_idle / P_max and its standard error by the delta method; None when the line gives no meaningful idle."""
    i, s = line["intercept"], line["slope"]
    if i < 0 or s <= 0:
        return None, None
    total = i + s
    d_i, d_s = s / total ** 2, -i / total ** 2
    return i / total, math.sqrt(max(0.0, d_i ** 2 * line["var_intercept"] + d_s ** 2 * line["var_slope"] + 2 * d_i * d_s * line["cov"]))


def utilization(rows):
    """U and the average watts as time-weighted means of the readings, with U's spread and the time they cover."""
    if not rows:
        return None
    total = sum(r["s"] for r in rows)
    mean = sum(r["u"] * r["s"] for r in rows) / total
    return {"u": mean, "sd": math.sqrt(sum(r["s"] * (r["u"] - mean) ** 2 for r in rows) / total), "n": len(rows), "days": total / 86400,
            "w": sum(r["w"] * r["s"] for r in rows) / total}


def fit(rows):
    """The whole fit from read rows. Sweep rows fit a and log rows set U; with no phases, every row does both."""
    phased = any(r["phase"] for r in rows)
    sweep = [r for r in rows if r["phase"] == "sweep"] if phased else rows
    log = [r for r in rows if r["phase"] == "log"] if phased else rows
    if not sweep:
        raise BadReadings("no sweep readings: a is fit from a load test from idle to full load, marked sweep in the phase column")
    line = fit_line([(r["u"], r["w"]) for r in sweep])
    a, a_se = idle_fraction(line)
    use = utilization(log)
    us = [r["u"] for r in sweep]
    p_max = line["intercept"] + line["slope"]
    ends = {"idle": min(us) > NEAR_END, "full": max(us) < 1 - NEAR_END, "lowest": min(us), "highest": max(us)}  # which end of the line no reading anchors
    warnings = []
    if a is None:
        warnings.append("The line gives no meaningful idle (idle under zero, or watts that do not rise with utilization), so a is not printed. Check the readings, and take some near idle.")
    if ends["idle"]:
        warnings.append("No sweep reading at 10 percent utilization or less, so idle is extrapolated, and the idle watts and a rest on the line past the readings. Add a reading at idle.")
    if ends["full"]:
        warnings.append("No sweep reading at 90 percent utilization or more, so full load is extrapolated, and the full-load watts and a rest on the line past the readings. Add a reading at full load.")
    if p_max > 0 and line["rmse"] / p_max > POOR_FIT:
        warnings.append("The straight line misses by over 5 percent of full load. The model's curve is a simplification, and this machine shows it.")
    if not phased:
        warnings.append("No phase column, so U is only the mean of these readings, not a measure of ordinary use.")
    elif not log:
        warnings.append("No log readings, so no U: a load test is not ordinary use.")
    if use and use["u"] == 0:
        warnings.append("U is zero in these readings, so the multiplier is not printed.")
    return {"line": line, "a": a, "a_se": a_se, "p_idle": line["intercept"], "p_max": p_max, "use": use, "ends": ends, "warnings": warnings}


def average_watts(r, inputs):
    """The figure office_w stands for, a year's average draw: the readings' time-weighted watts, or, with no log rows, the fitted line at the model's U, which is no reading."""
    if r["use"]:
        return r["use"]["w"], " over %s of the log" % span(r["use"]["days"])
    if inputs:
        u = inputs["u_room"]["value"]
        return r["p_idle"] + (r["p_max"] - r["p_idle"]) * u, " from the fitted line at the model's U of %s, not a reading of ordinary use" % fmt(u)
    return None, ""


def result_lines(r, inputs, compare="node_w"):
    """Every result, each with the limit beside it. A figure that rests on an end of the line no reading reached says so."""
    line = r["line"]
    say = lambda name, text: "%-28s %s | %s" % (name, text, LIMIT)
    default = lambda key: " | model %s (%s to %s)" % (fmt(inputs[key]["value"]), fmt(inputs[key]["low"]), fmt(inputs[key]["high"])) if inputs else ""
    beside = lambda key: default(key) + ", " + COMPARE[key] if inputs else ""
    past = lambda end, side: ", extrapolated past the %s reading at %s percent" % (side, fmt(100 * r["ends"][side])) if r["ends"][end] else ""
    out = [say("Idle watts", "%s W (se %s)%s%s" % (fmt(r["p_idle"]), fmt(math.sqrt(line["var_intercept"])), past("idle", "lowest"), "" if compare in AVERAGE else beside(compare))),
           say("Full-load watts", "%s W (se %s)%s" % (fmt(r["p_max"]), fmt(math.sqrt(line["var_intercept"] + line["var_slope"] + 2 * line["cov"])), past("full", "highest")))]
    if compare in AVERAGE:
        watts, how = average_watts(r, inputs)
        if watts is not None:
            out.append(say("Average watts, ordinary use", "%s W%s%s" % (fmt(watts), how, beside(compare))))
    if r["a"] is not None:
        on_line = ", on a line extrapolated past the readings" if r["ends"]["idle"] or r["ends"]["full"] else ""
        out.append(say("Idle fraction a", "%s (se %s)%s%s" % (fmt(r["a"]), fmt(r["a_se"]), on_line, default("a_idle"))))
    use = r["use"]
    if use:
        out.append(say("Utilization U", "%s (sd %s, n %d, %s)%s" % (fmt(use["u"]), fmt(use["sd"]), use["n"], span(use["days"]), default("u_room"))))
    if r["a"] is not None and use and use["u"] > 0:
        at = idle_mult(use["u"], r["a"])
        lo, hi = idle_mult(use["u"], max(0.0, r["a"] - r["a_se"])), idle_mult(use["u"], min(1.0, r["a"] + r["a_se"]))
        base = " | model %s at its a and U" % fmt(idle_mult(inputs["u_room"]["value"], inputs["a_idle"]["value"])) if inputs else ""
        out.append(say("Energy per unit of work", "%s times the hyperscale reference (%s to %s with a at one se)%s" % (fmt(at), fmt(min(lo, hi)), fmt(max(lo, hi)), base)))
    out.append(say("Fit", "rmse %s W, %s of full load, n %d, df %d" % (fmt(line["rmse"]), "%.1f percent" % (100 * line["rmse"] / r["p_max"]) if r["p_max"] > 0 else "no share", line["n"], line["df"])))
    return out


def fmt(x):
    return "%.3g" % x


def span(days):
    """The time the readings cover, in the largest unit it fills, so a short file reads in seconds, not as a fraction of a day."""
    seconds = days * 86400
    for unit, size in (("day", 86400), ("hour", 3600), ("minute", 60), ("second", 1)):
        if seconds >= size or unit == "second":
            n = fmt(seconds / size)
            return "%s %s%s" % (n, unit, "" if n == "1" else "s")


def load_inputs(path):
    """The model's defaults from its public file; a machine with only this script can pass --model or read the fit alone."""
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))["inputs"]
    except (OSError, ValueError, KeyError):
        return None


CLOSING = ("To try these in the Explorer, type them into its measured fields. Every row they move carries the label: your measurement, not verified by ATNI.",
           "These readings stay with you. They never leave your machine through this site, and any release is that Nation's decision.")


def report(text, inputs, compare="node_w"):
    r = fit(read_rows(text))
    lines = result_lines(r, inputs, compare)
    if inputs is None:
        lines.append("No model file found, so no default is compared. Pass --model with the path to resource-model.json.")
    if compare in AVERAGE and r["use"] is None:
        r["warnings"].append("%s is a year's average draw, and with no log readings the average watts come from the fitted line, or not at all. Log an ordinary week to replace it." % compare)
    return lines + ["Warning: " + w for w in r["warnings"]] + list(CLOSING)


EXACT = "utilization,watts\n0,30\n0.25,72.5\n0.5,115\n1,200\n"
FIXTURE = "utilization,watts,seconds,phase\n0,30.4,600,sweep\n0.1,47,600,sweep\n0.3,81.2,600,sweep\n0.5,115,600,sweep\n1,199.8,600,sweep\n0.05,38,3600,log\n0.1,47.1,10800,log\n0.2,64,3600,log\n"
FAKE_MODEL = {"a_idle": {"value": 0.11, "low": 0.11, "high": 0.36}, "u_room": {"value": 0.1, "low": 0.05, "high": 0.15}, "node_w": {"value": 40, "low": 30, "high": 250},
              "office_w": {"value": 45, "low": 30, "high": 60}}
# an office server idling at 30 W that works at half load all week: its year runs at 115 W, so office_w takes 115 and never the 30 (review of 11/05/2026, finding 3)
OFFICE = "utilization,watts,seconds,phase\n0,30,600,sweep\n0.1,47,600,sweep\n0.3,81,600,sweep\n0.5,115,600,sweep\n1,200,600,sweep\n0.5,115,86400,log\n"
MIXED = "utilization,watts,seconds,phase\n0,30,600,sweep\n0.5,115,600,sweep\n1,200,600,sweep\n0.1,47,3600,log\n0.9,183,82800,\n"
HALF = "utilization,watts\n0,30\n0.1,47\n0.5,115\n"


def self_test():
    close = lambda x, y, t=1e-9: abs(x - y) <= t
    # an exact line: a is 30 over 200, with no error
    r = fit(read_rows(EXACT))
    assert close(r["a"], 0.15) and close(r["p_idle"], 30) and close(r["p_max"], 200) and close(r["line"]["rmse"], 0) and close(r["a_se"], 0, 1e-7)
    # three points worked by hand: slope 23, intercept 9.5, residuals 0.5, -1, 0.5, one degree of freedom
    h = fit_line([(0, 10), (0.5, 20), (1, 33)])
    assert close(h["slope"], 23) and close(h["intercept"], 9.5) and close(h["df"], 1) and close(h["var_slope"], 3) and close(h["var_intercept"], 1.25) and close(h["cov"], -1.5)
    a, se = idle_fraction(h)
    assert close(a, 9.5 / 32.5) and close(se, 0.03772, 1e-4)
    # the fixture: sweep rows fit a, log rows set U, weighted by time
    r = fit(read_rows(FIXTURE))
    assert r["line"]["n"] == 5 and 0.14 < r["a"] < 0.17 and r["use"]["n"] == 3 and close(r["use"]["u"], (0.05 * 3600 + 0.1 * 10800 + 0.2 * 3600) / 18000) and close(r["use"]["days"], 18000 / 86400)
    assert not [w for w in r["warnings"] if "extrapolated" in w or "phase" in w]
    # every result prints the limit beside it, and the multiplier uses the model's own formula
    lines = report(FIXTURE, FAKE_MODEL)
    results = [x for x in lines if not x.startswith("Warning") and x not in CLOSING]
    assert len(results) == 6 and all(x.endswith(LIMIT) for x in results), lines
    assert any("Idle fraction a" in x and "model 0.11 (0.11 to 0.36)" in x for x in lines) and any("Energy per unit of work" in x for x in lines)
    assert close(idle_mult(0.5, r["a"]), 1.0) and "never leave your machine through this site" in lines[-1]
    assert any("No model file" in x for x in report(FIXTURE, None))
    # readings the fit cannot use say what to do
    for bad, word in (("watts\n1\n", "utilization"), ("utilization,watts\n0.5,10\n0.5,20\n0.5,30\n", "one utilization"), ("utilization,watts\n0,1\n1,2\n", "at least 3"), ("utilization,watts\n50,10\n", "0 to 1"),
                      ("utilization,watts\nhigh,10\n", "numbers"), ("utilization,watts\n0.5,-1\n", "zero or more"), ("utilization,watts,phase\n0,1,x\n", "phase"), ("utilization,watts,phase\n0,1,log\n1,2,log\n0.5,3,log\n", "no sweep"),
                      ("utilization,watts\n0.5,nan\n", "zero or more"), ("utilization,watts\n0.5,inf\n", "zero or more")):
        try:
            report(bad, None)
        except BadReadings as e:
            assert word in str(e), (word, str(e))
        else:
            raise AssertionError("bad readings passed: %r" % bad)
    # a line with no meaningful idle prints no a, and says why
    r = fit(read_rows("utilization,watts\n0.5,10\n0.6,20\n0.7,30\n"))
    assert r["a"] is None and any("no meaningful idle" in w for w in r["warnings"]) and any("10 percent utilization or less" in w for w in r["warnings"])
    # office_w is a year's average draw: it is read beside the ordinary week's watts, never beside the idle watts
    lines = report(OFFICE, FAKE_MODEL, "office_w")
    average = [x for x in lines if x.startswith("Average watts")]
    assert len(average) == 1 and " 115 W over 1 day of the log | model 45 (30 to 60)" in average[0], lines
    assert not [x for x in lines if x.startswith("Idle watts") and "model 45" in x], "the idle watts are not office_w"
    assert "model 40" in [x for x in report(OFFICE, FAKE_MODEL, "node_w") if x.startswith("Idle watts")][0], "the idle inputs still read beside the idle watts"
    no_log = report(OFFICE.replace(",log", ",sweep"), FAKE_MODEL, "office_w")
    assert any(x.startswith("Average watts") and "not a reading of ordinary use" in x for x in no_log) and any("office_w is a year's average draw" in x for x in no_log)
    assert (span(3 / 86400), span(18000 / 86400), span(1.0), span(2.5)) == ("3 seconds", "5 hours", "1 day", "2.5 days"), "a log's time in the unit it fills"
    # a phased file with a blank phase is refused at that line, since the row would join neither the sweep nor the log
    try:
        read_rows(MIXED)
    except BadReadings as e:
        assert "line 6" in str(e), str(e)
    else:
        raise AssertionError("a blank phase in a phased file passed")
    # a sweep that stops at half load extrapolates full load, says so, and marks the full-load watts and a
    lines = report(HALF, None)
    assert any("90 percent utilization or more" in x and "extrapolated" in x for x in lines), lines
    assert any(x.startswith("Full-load watts") and "extrapolated past the highest reading at 50 percent" in x for x in lines)
    assert any(x.startswith("Idle fraction a") and "extrapolated past the readings" in x for x in lines)
    assert not [x for x in report(EXACT, None) if "extrapolated" in x], "a sweep from idle to full load extrapolates nothing"
    print("self-test passed")


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("readings", nargs="?", help="the CSV of plug-meter readings")
    parser.add_argument("--compare", default="node_w", choices=sorted(COMPARE), help="the model's default to read beside this machine's figure: idle watts, or for office_w the ordinary week's average watts")
    parser.add_argument("--model", default=str(MODEL), help="the model's public file, for its defaults")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if not args.readings:
        parser.error("name the CSV of readings, or run --self-test")
    try:
        text = Path(args.readings).read_text(encoding="utf-8-sig")
        print("\n".join(report(text, load_inputs(args.model), args.compare)))
    except (OSError, UnicodeDecodeError, BadReadings) as e:
        print("fit_idle: %s" % e, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
