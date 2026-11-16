"""The countdown plot kind (DIRECTION-R2 3.7, item 5; docs/PLATE-KIT.md, "The system as built"). Standard library only; build_plates.py calls it.

A 24-month ruler from plot.from, the day the build counts from. Each row is one program: its date is its claim's "date" (ISO), so a deadline is sourced
the way a figure is. A dated row is drawn on its own track, its mark at its date, with its days and its date in a gutter, so no stem crosses a row; a row
dated before plot.from goes to the Passed lane, a row whose claim has no date to the No date lane, each counted in its gutter. plot.from is written by the
plate's generator (the day its dates were checked), never the clock, so a rebuild on another day writes the same page; plate.js then moves only the today
needle, the day counts in their fixed slots, and a deadline passed since (its countdown section). Errors are ValueError; build_plates.py names the plate.
"""
import calendar
from datetime import date
from html import escape

MONTHS = 24
LANES = (("passed", "Passed"), ("undated", "No date"))


def day(text, what):
    try:
        return date.fromisoformat(str(text))
    except ValueError:
        raise ValueError(f"{what} must be a date written YYYY-MM-DD, not {text!r}") from None


def months_on(start, n):
    month = start.month - 1 + n
    year, month = start.year + month // 12, month % 12 + 1
    return date(year, month, min(start.day, calendar.monthrange(year, month)[1]))


def us(when):
    return f"{when.month:02d}/{when.day:02d}/{when.year}"


def days_html(n):
    if n == 0:
        return '<span class="countdown-n">today</span>'
    return f'<span class="countdown-n">{n:,}</span> {"day" if n == 1 else "days"}'


def finish(defn, rows, claims, plot, gap):
    """Puts the rows in the order the plot draws them, which the keyboard and the Table follow: dated soonest first, then those passed by plot.from, latest
    first, then those with no date as listed. Gives each its date (ISO), due (house style), and lane; a row with no figure of its own reads its due date,
    or "No date", where it would have read the plate's gap (gap). Writes plot["to"]."""
    if defn.get("by"):
        raise ValueError("a countdown does not take a by control: each row is one program")
    start = day(plot.get("from"), "plot.from (the day the build counts from)")
    plot["to"] = months_on(start, MONTHS).isoformat()
    lanes = {"dated": [], "passed": [], "undated": []}
    for r in rows:
        if not r.get("claim"):
            raise ValueError(f"row '{r['key']}' needs a claim: a countdown row's date is its claim's")
        iso = claims[r["claim"]].get("date")
        when = day(iso, f"claim {r['claim']}'s date") if iso else None
        r["lane"] = "undated" if when is None else "passed" if when < start else "dated"
        if when:
            r["date"], r["due"] = when.isoformat(), us(when)
        if not r.get("text") and r.get("display") == gap:
            r["display"] = r.get("due") or "No date"
        lanes[r["lane"]].append(r)
    lanes["dated"].sort(key=lambda r: r["date"])
    lanes["passed"].sort(key=lambda r: r["date"], reverse=True)
    rows[:] = lanes["dated"] + lanes["passed"] + lanes["undated"]


def html(plate, rows, plot):
    """The plot: the ruler, a row per dated deadline, the lanes, and the line that says which day the days count from."""
    start, end = day(plot["from"], "plot.from"), day(plot["to"], "plot.to")
    span = (end - start).days
    at = lambda when: round(min(1, (when - start).days / span), 4)  # noqa: E731
    first = date(start.year, start.month, 1)
    marks = []
    for i in range(1, MONTHS + 1):
        when = months_on(first, i)
        if when > end:
            break
        t = at(when)
        marks.append(f'<i style="--t:{t}"></i>')
        if when.month in (1, 7) and 0.06 < t < 0.94:  # a half-year label, never at an end, where it would leave the ruler
            marks.append(f'<span class="countdown-month" style="--t:{t}">{when.month:02d}/{when.year}</span>')
    ruler = (f'<div class="countdown-ruler" aria-hidden="true"><span class="countdown-scale">{"".join(marks)}'
             '<span class="countdown-today"><span class="needle-label">today</span></span></span></div>')
    dated = []
    for r in rows:
        if r["lane"] != "dated":
            continue
        when = day(r["date"], "date")
        beyond = " is-beyond" if when > end else ""
        dated.append(f'<li class="countdown-row{beyond}" data-row="{escape(r["key"])}" data-date="{r["date"]}" style="--t:{at(when)}">'
                     f'<span class="countdown-when"><span class="countdown-days">{days_html((when - start).days)}</span> <span class="countdown-date">{r["due"]}</span></span> '
                     f'<span class="countdown-name">{escape(r["label"])}</span><span class="countdown-track" aria-hidden="true"><b class="countdown-mark"></b></span></li>')
    lanes = []
    for name, words in LANES:
        members = [r for r in rows if r["lane"] == name]
        if name == "undated" and not members:
            continue  # the Passed lane always stands, since plate.js counts into it a deadline passed since the build
        due = lambda r: f' <span class="countdown-date">{r["due"]}</span>' if r.get("due") else ""  # noqa: E731
        items = "".join(f'<li data-row="{escape(r["key"])}"><span class="countdown-name">{escape(r["label"])}</span>{due(r)}</li>' for r in members)
        lanes.append(f'<div class="countdown-lane" data-lane="{name}"><p class="countdown-when" id="{plate}-lane-{name}"><span class="countdown-days">'
                     f'<span class="countdown-n" data-built="{len(members)}">{len(members):,}</span></span> <span class="countdown-date">{words}</span></p>'
                     f'<ul class="countdown-names">{items}</ul></div>')
    return (f'<div class="countdown" data-from="{plot["from"]}" data-to="{plot["to"]}">{ruler}<ol class="countdown-rows">{"".join(dated)}</ol>{"".join(lanes)}'
            f'<p class="countdown-note">Days counted from {us(start)}.</p></div>')
