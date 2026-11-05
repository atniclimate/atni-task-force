"""Pour shipped claims into plates, and export checked claims for shipping. Standard library only.

Build: reads site/data/plates/<plate>.json and site/data/claims/<cluster>.json, then writes between
<!-- plate:ID --> and <!-- /plate:ID --> in the target page: the three zones, the table, a default static
plot, the default Reading, every source, and an inline data block with exactly the values and receipts
that plate uses. Numbers come only from claims with status verified or partly, from a model file, or from a
formula over those and the reader's settings; a row with no claim id fails the build; a partly claim must
carry a limit written for the public. Re-running changes nothing. A page's <!-- bench:ID --> rows and
data-pour elements fill from the same sources. work/site-refresh/design/PLATE-KIT.md has the usage.

Export: copies verified and partly claims from work/site-refresh/evidence/<cluster>.json into
site/data/claims/<cluster>.json with tier and schema added. Working notes stay local. It fails, and
writes nothing, on a local path, an email address, or our own prose out of house style.

  python scripts/build_plates.py                  build every plate in site/
  python scripts/build_plates.py --page ai/index.html   build one page's plates, bench rows, and figures
  python scripts/build_plates.py --site DIR       build a copy of the site's data and pages
  python scripts/build_plates.py --export-claims [CLUSTER ...] [--evidence DIR] [--out DIR]
  python scripts/build_plates.py --self-test
"""
import argparse
import ast
from decimal import Decimal
from html import escape
import json
import math
import operator
from pathlib import Path
import posixpath
import re
import string
import sys
import tempfile
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent))
import validate_public as vp  # noqa: E402  (the release rules; it reads no PDF on import)

EVIDENCE = vp.ROOT / "work" / "site-refresh" / "evidence"
LOCAL_ONLY = {"note", "recheck"}  # working notes and check logs; a public limit travels as "limit"
# Our own arithmetic with no source quote (ec-055, ec-056), and the one Tribally owned facility the owner has not yet worded (lf-059, lf-070, lf-071, sf-053, sf-054).
HELD_BACK = {"ec-055", "ec-056", "lf-059", "lf-070", "lf-071", "sf-053", "sf-054"}
HOUSE_WORDS = re.compile(r"\b(?:tribes?|tribal|indigenous|[iI]ntertribal|treat(?:y|ies))\b")
LINE_KINDS = {"lines", "multiples"}
RULER_KINDS = {"ladder", "bars"}
PLOT_KINDS = LINE_KINDS | RULER_KINDS | {"instrument", "matrix"}
BINARY = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv}
CALLS = {"min", "max", "ifblank"}
# Digits our own sentences may type: years, dates, resolution numbers, and names like CO2, GPT-5, or Scope 2. shortcut: a bare
# quantity shaped like a year ("2000 MW") passes; the house style groups thousands, so it would read "2,000" and fail.
NAMED_DIGITS = re.compile(r"#\d{4}-\d{3}|\b\d{2}/\d{2}/\d{4}\b|\b\d{2}/\d{4}\b|\b(?:19|20)\d{2}\b|\b[A-Za-z][A-Za-z-]*\d[\w.]*|\bScope \d\b")
BENCH = re.compile(r"<!-- bench:(?P<id>[a-z0-9-]+) -->")
POURABLE = re.compile(r'<(?P<tag>[a-z][a-z0-9]*)(?P<attrs>[^<>]*\sdata-pour="(?P<id>[^"]+)"[^<>]*)>[^<]*</(?P=tag)>')
NO_MEASUREMENT = "No public measurement"
VALUE_WITH_RANGE = re.compile(r"^(\S+) (\([^)]*\))(?: (.+))?$")
NOT_COUNTED = "Not counted at this boundary"
EVIDENCE_LABEL = {
    "agency": "Agency figure", "filing": "Company filing", "company-report": "Company-reported figure",
    "peer-reviewed": "Peer-reviewed study", "preprint": "Preprint, not peer reviewed", "press": "Press report",
    "model": "Modeled estimate", "blog": "Blog post",
}


class BuildError(Exception):
    pass


# Export ---------------------------------------------------------------------------------------------

def export_claims(evidence=EVIDENCE, out=vp.SITE / "data" / "claims", clusters=None):
    """Writes one claims file per cluster, or raises BuildError listing every problem and writes nothing."""
    evidence, out = Path(evidence), Path(out)
    names = clusters or sorted(p.stem for p in evidence.glob("*.json") if is_cluster(p))
    errors, shipped, seen = [], {}, {}
    limits_file = evidence / "claim-limits.json"  # public limit sentences kept apart, so a claim's working notes stay local
    limits = json.loads(limits_file.read_text(encoding="utf-8"))["limits"] if limits_file.is_file() else {}
    for name in names:
        if not (evidence / f"{name}.json").is_file():
            raise BuildError(f"no evidence file for cluster {name}")
        source = json.loads((evidence / f"{name}.json").read_text(encoding="utf-8"))
        data = {"schema": 1, "tier": "T0", "cluster": name, "claims": [
            {k: v for k, v in {**({"limit": limits[claim["id"]]} if claim.get("status") == "partly" and claim["id"] in limits else {}), **claim}.items() if k not in LOCAL_ONLY}
            for claim in source["claims"] if claim.get("status") in vp.CLAIM_STATUS and claim["id"] not in HELD_BACK
        ]}
        rel = f"data/claims/{name}.json"
        vp.check_claim_file(data, rel, seen, errors)
        text = json.dumps(data, ensure_ascii=False, indent=1) + "\n"
        vp.check_text(rel, text, errors)
        for claim in data["claims"]:
            for prose in vp.our_prose(claim):
                if vp.EM_DASH.search(prose):
                    errors.append(f"{rel} claim '{claim['id']}': em dash in our own prose: {prose[:80]}")
                if HOUSE_WORDS.search(vp.HTTPS_URL.sub(" ", prose)):
                    errors.append(f"{rel} claim '{claim['id']}': lowercase house-style word in our own prose: {prose[:80]}")
        shipped[name] = text
    if errors:
        raise BuildError("; ".join(errors))
    out.mkdir(parents=True, exist_ok=True)
    for name, text in shipped.items():
        (out / f"{name}.json").write_bytes(text.encode("utf-8"))
    return {name: len(json.loads(text)["claims"]) for name, text in shipped.items()}


def is_cluster(path):
    data = json.loads(path.read_text(encoding="utf-8"))
    return isinstance(data, dict) and data.get("cluster") == path.stem and isinstance(data.get("claims"), list)


# Words and numbers ----------------------------------------------------------------------------------

def verbatim(text):
    """Source words keep their own dashes, as character references, so the page check still reads our prose."""
    return escape(str(text)).replace("\u2014", "&#8212;").replace(" -- ", " &#45;- ")


def inline_json(data):
    text = json.dumps(data, ensure_ascii=True, separators=(",", ":"))
    return text.replace("<", "\\u003c").replace("--", "-\\u002d")


def number(value):
    """As the claim states it: grouped, with no invented precision."""
    return f"{int(value):,}" if float(value).is_integer() else format(Decimal(str(value)), ",f")


def value_text(value, low, high, plus=False):
    def n(v):
        return f"+{number(v)}" if plus and v > 0 else number(v)
    if value is not None:
        return f"{n(value)} ({n(low)} to {n(high)})" if low is not None and high is not None else n(value)
    if low is not None and high is not None:
        return n(low) if low == high else f"{n(low)} to {n(high)}"
    if low is not None:
        return f"at least {n(low)}"
    return f"up to {n(high)}" if high is not None else None


def us_date(text):
    if not text:
        return "undated"
    match = re.fullmatch(r"(\d{4})-(\d{2})(?:-(\d{2}))?", str(text))
    if not match:
        return str(text)
    return f"{match[2]}/{match[3]}/{match[1]}" if match[3] else f"{match[2]}/{match[1]}"


def sentence(text):
    text = str(text or "").strip()
    return text if not text or text[-1] in ".!?" else f"{text}."


def compact(record):
    return {k: v for k, v in record.items() if v is not None}


def nice_step(span, count=5):
    raw = span / count
    mag = 10 ** math.floor(math.log10(raw))
    norm = raw / mag
    return (1 if norm <= 1 else 2 if norm <= 2 else 5 if norm <= 5 else 10) * mag


def nice_ticks(lo, hi, count=5):
    step = nice_step(hi - lo, count)
    first = math.ceil(lo / step)
    return [round(i * step, 10) for i in range(first, math.floor((hi + step / 1e6) / step) + 1)]


def nice_domain(numbers):
    def ceiling(v):
        if v <= 0:
            return 0
        step = nice_step(v)
        return round(math.ceil(v / step) * step, 10)
    return [-ceiling(-min(numbers)), ceiling(max(numbers))] if min(numbers) < 0 else [0, ceiling(max(numbers)) or 1]


def tick_text(value, top):
    if top < 1e4:
        return number(value)
    for size, suffix in ((1e12, "T"), (1e9, "B"), (1e6, "M"), (1e3, "K")):
        if abs(value) >= size:
            return f"{value / size:.1f}".removesuffix(".0") + suffix
    return f"{value:g}"


def own_text(plate, field, text):
    if vp.EM_DASH.search(str(text)):
        raise BuildError(f"plate {plate}: em dash in {field}; our own prose keeps the house style")
    return str(text)


def fill(plate, field, template, fields):
    """Fills a sentence of ours. Its numbers must arrive through placeholders, so they come from claims."""
    own_text(plate, field, template)
    try:
        literals = [literal for literal, *_ in string.Formatter().parse(template)]
        text = template.format_map(fields)
    except (KeyError, IndexError, ValueError, TypeError, AttributeError) as error:
        raise BuildError(f"plate {plate}: {field} has a bad placeholder: {error!r}") from error
    if any(re.search(r"\d", NAMED_DIGITS.sub(" ", literal)) for literal in literals):
        raise BuildError(f"plate {plate}: {field} writes a number in its own words; use a placeholder so it comes from a claim")
    return text


# Formulas: the same small grammar in plate.js ---------------------------------------------------------

def evaluate(expr, env):
    """Numbers, names (dots reach into a model branch), + - * / ( ), min, max, ifblank. A blank input gives a blank."""
    def walk(node):
        if isinstance(node, ast.Constant) and type(node.value) in (int, float):
            return node.value
        if isinstance(node, (ast.Name, ast.Attribute)):
            value = vp.lookup(env, dotted(node))
            if value is not None and (isinstance(value, (bool, str, dict, list))):
                raise ValueError(f"{dotted(node)} is not one number")
            return value
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
            value = walk(node.operand)
            return None if value is None else -value
        if isinstance(node, ast.BinOp) and type(node.op) in BINARY:
            left, right = walk(node.left), walk(node.right)
            if left is None or right is None or (isinstance(node.op, ast.Div) and right == 0):
                return None
            return BINARY[type(node.op)](left, right)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id in CALLS and not node.keywords:
            args = [walk(arg) for arg in node.args]
            if node.func.id == "ifblank":
                return next((arg for arg in args if arg is not None), None)
            return None if None in args else (min if node.func.id == "min" else max)(args)
        raise ValueError(f"cannot read {ast.dump(node)[:60]}")

    def dotted(node):
        return node.id if isinstance(node, ast.Name) else f"{dotted(node.value)}.{node.attr}"

    return walk(ast.parse(str(expr), mode="eval").body)


def names_in(expr):
    return {n.id for n in ast.walk(ast.parse(str(expr), mode="eval")) if isinstance(n, ast.Name)} - CALLS


def calc(plate, where, expr, env):
    try:
        return evaluate(expr, env)
    except (SyntaxError, ValueError, KeyError, TypeError) as error:
        raise BuildError(f"plate {plate}: {where}: bad formula {expr!r}: {error!r}") from error


def rounded(value, digits=3):
    """As plate.js rounds a computed figure: significant digits."""
    return None if value is None else float(f"{value:.{digits}g}")


class Fig(float):
    """A number in a sentence: grouped as claims are, or by a format spec such as {x:.0f}."""
    def __format__(self, spec):
        return float.__format__(self, spec) if spec else number(float(self))


class Branch(dict):
    """A claim or a model branch in a sentence: numbers read as figures, and a year works as an index."""
    def __getitem__(self, key):
        value = super().__getitem__(str(key))
        if isinstance(value, dict):
            return Branch(value)
        return Fig(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else value


class ClaimView:
    """{c[fp-001][display]} in a sentence. Each claim read this way joins the plate's receipts."""
    def __init__(self, claims, units):
        self.claims, self.units, self.used = claims, units or {}, set()

    def __getitem__(self, claim_id):
        claim = self.claims[claim_id]
        self.used.add(claim_id)
        text = value_text(claim.get("value"), claim.get("low"), claim.get("high")) or ""
        unit = self.units.get(claim.get("unit"), claim.get("unit") or "")
        return Branch({**claim, "text": text, "unit": unit, "display": f"{text} {unit}".strip()})


class Live:
    """A name plate.js fills when a setting moves, kept as a placeholder in the template it gets."""
    def __init__(self, name):
        self.name = name

    def __getitem__(self, part):
        return Live(f"{self.name}[{part}]")

    def __format__(self, spec):
        return f"{{{self.name}:{spec}}}" if spec else f"{{{self.name}}}"


def template_names(template):
    return {name.split("[")[0].split(".")[0] for _, name, *_ in string.Formatter().parse(template) if name}


# Rows -----------------------------------------------------------------------------------------------

def read_points(plate, name, claim, field):
    """A claim's own series: {year: value}, or a list of periods with an end date and one number. Gives (year, value, end)."""
    raw = claim.get(field)
    if isinstance(raw, dict):
        points = [(x, v, None) for x, v in raw.items()]
    elif isinstance(raw, list):
        points = [(item.get("end", "")[:4], next((v for v in item.values() if isinstance(v, (int, float))), None), item.get("end")) for item in raw]
    else:
        raise BuildError(f"plate {plate}: row '{name}': claim {claim['id']} has no series {field}")
    if not all(re.fullmatch(r"\d{4}", str(x)) and isinstance(v, (int, float)) for x, v, _ in points):
        raise BuildError(f"plate {plate}: row '{name}': {claim['id']}.{field} is not a series of years and numbers")
    return [(int(x), v, end) for x, v, end in points]


def usable(ctx, name, claim_id):
    if claim_id not in ctx.claims:
        raise BuildError(f"plate {ctx.plate}: row '{name}' names unknown claim {claim_id}")
    claim = ctx.claims[claim_id]
    if claim.get("status") not in vp.CLAIM_STATUS:
        raise BuildError(f"plate {ctx.plate}: row '{name}': claim {claim_id} has status {claim.get('status')!r}; only verified or partly may ship")
    return claim


def limit_of(ctx, name, claim, spec=None):
    limit = ((spec or {}).get("limit") or (ctx.defn.get("limits") or {}).get(claim["id"]) or claim.get("limit") or "").strip() or None
    if claim["status"] == "partly" and not limit:
        raise BuildError(f"plate {ctx.plate}: row '{name}': claim {claim['id']} is partly verified, so its limit must reach the page; "
                         "write one public sentence as the row's limit (the claim's note in the evidence file says what it is)")
    return limit


def row_extras(ctx, spec):
    extra = {key: spec[key] for key in ("group", "panel", "tag", "dx", "show", "slug") if spec.get(key) is not None}
    for key in ("note", "equation", "detail"):
        if spec.get(key):
            extra[key] = own_text(ctx.plate, key, spec[key])
    return extra


def row_key(ctx, spec, name):
    key = spec.get("id")
    if not (isinstance(key, str) and vp.SLUG.fullmatch(key)):
        raise BuildError(f"plate {ctx.plate}: row '{name}' needs an id in kebab case")
    if not spec.get("label"):
        raise BuildError(f"plate {ctx.plate}: row '{key}' needs a label")
    return key


def claim_rows(ctx, spec, stop, claim, key=None):
    """One row of the data block for each number the spec takes from this claim."""
    plate, plot, kind = ctx.plate, ctx.plot, ctx.plot["type"]
    name = spec.get("label") or spec.get("series") or spec.get("id") or "?"
    limit = limit_of(ctx, name, claim, spec)
    unit = claim.get("unit") if claim.get("unit") not in (None, "none") else ""
    unit = (plot.get("units") or {}).get(unit, unit)
    base = compact({"claim": claim["id"], "when": stop, "limit": limit if claim["status"] == "partly" else None, **row_extras(ctx, spec)})
    gap = spec.get("gap") or NO_MEASUREMENT
    projected = bool(spec.get("projected") or plot.get("projected"))
    modeled = spec.get("modeled", claim["source"].get("kind") == "model") or projected
    sign = -1 if spec.get("negate") else 1
    low, high = claim.get("low"), claim.get("high")
    if spec.get("range") is False:
        low, high = None, None
    elif spec.get("range_from"):
        other = usable(ctx, name, spec["range_from"])
        low, high = other.get("low"), other.get("high")
    if sign < 0:
        low, high = (-high if high is not None else None), (-low if low is not None else None)
    factor = None
    if spec.get("convert"):
        if not claim.get("derived"):
            raise BuildError(f"plate {plate}: row '{name}': a conversion needs its arithmetic on the receipt; claim {claim['id']} has no derived text")
        factor, unit = spec["convert"]["times"], spec["convert"]["to"]

    def row(key, value, low, high, year, extra):
        value = -value if sign < 0 and value is not None else value
        if factor:
            value, low, high = [None if v is None else v * factor for v in (value, low, high)]
            digits = spec.get("digits", 4)
            text = value_text(rounded(value, digits), rounded(low, digits), rounded(high, digits), plot.get("signed"))
        else:
            text = value_text(value, low, high, plot.get("signed"))
        return {**extra, "key": key, **base, "value": value, "low": low, "high": high, "year": year, "text": text, "unit": unit, "converted": factor,
                "display": f"{text} {unit}".strip() if text else gap, "hollow": modeled or None, "negated": sign < 0 or None, "projected": (projected and kind not in LINE_KINDS) or None}

    if kind in LINE_KINDS:
        series = spec.get("series")
        if not series:
            raise BuildError(f"plate {plate}: a {kind} row needs a series name (claim {claim['id']})")
        points = read_points(plate, series, claim, spec["points"]) if spec.get("points") else [(spec.get("x", claim.get("year")), claim.get("value"), None)]
        low_high = (None, None) if spec.get("points") else (low, high)
        out = []
        for x, value, end in points:
            if not isinstance(x, int):
                raise BuildError(f"plate {plate}: row '{series}': claim {claim['id']} has no year to plot")
            at_x = plot.get("projected_from") is not None and x >= plot["projected_from"]
            point_key = str(x)
            if plot.get("select") == "point":
                point_key = f"{row_key(ctx, {**spec, 'label': series}, series)}{f'-{x}' if spec.get('points') else ''}"
            made = row(point_key, value, *low_high, x, {"series": own_text(plate, "series", series), "label": series, "x": x, "end": us_date(end) if end else None, "projected": at_x or None})
            made["projected"] = at_x or None
            if at_x:
                made["hollow"] = True
            out.append(made)
        return out
    key = key or row_key(ctx, spec, name)
    value, year, extra = claim.get("value"), claim.get("year"), {"label": own_text(plate, "label", spec["label"])}
    if spec.get("series"):
        extra["series"] = own_text(plate, "series", spec["series"])
    if spec.get("points"):
        points = read_points(plate, name, claim, spec["points"])
        chosen = points[-1] if stop in (None, "latest") else next((p for p in points if str(p[0]) == str(stop)), None)
        if chosen is None:
            return []
        year, value, end = chosen
        low, high = None, None
        extra["end"] = us_date(end) if end else None
    return [row(key, value, low, high, year, extra)]


def spark_rows(ctx, spec):
    """A small trend as one row: points from several claims, or from one claim's series."""
    name = spec.get("label") or "?"
    key = row_key(ctx, spec, name)
    if isinstance(spec["spark"], str):
        claim = usable(ctx, name, spec.get("claim"))
        points = [(x, v) for x, v, _ in read_points(ctx.plate, name, claim, spec["spark"])]
        ids = [claim["id"]]
    else:
        ids = spec["spark"]
        claims = [usable(ctx, name, claim_id) for claim_id in ids]
        points = sorted((c["year"], c["value"]) for c in claims)
        claim = claims[-1]
    made = claim_rows(ctx, {k: v for k, v in spec.items() if k != "points"}, None, claim, key)[0]
    unit = made["unit"]
    made.update(value=points[-1][1], year=points[-1][0], spark=points, text=f"{number(points[0][1])} to {number(points[-1][1])}",
                display=f"{number(points[0][1])} to {number(points[-1][1])} {unit}, {points[0][0]} to {points[-1][0]}", cites=[c for c in ids if c != claim["id"]])
    return [made]


def figure_rows(ctx, spec, stop, figures, key):
    """Several claim figures under one key: a matrix cell, or a context row of an instrument."""
    out = []
    for figure in figures:
        name = spec.get("label") or key
        claim = usable(ctx, name, figure.get("claim"))
        made = claim_rows(ctx, {**spec, **figure, "label": spec.get("label") or key}, stop, claim, key)
        for r in made:
            words = figure.get("say") or "{display}"
            before, _, after = words.partition("{display}")
            r.update(before=fill(ctx.plate, "say", before, {"year": r["year"] or ""}) or None, after=fill(ctx.plate, "say", after, {"year": r["year"] or ""}) or None)
            r["display"] = f'{r.get("before") or ""}{r["display"]}{r.get("after") or ""}'
            if figure.get("name"):
                r["series"] = own_text(ctx.plate, "name", figure["name"])
        out += made
    return out


def matrix_rows(ctx):
    columns = ctx.plot.get("columns") or []
    if not columns:
        raise BuildError(f"plate {ctx.plate}: a matrix needs plot.columns, each with an id and a label")
    rows = []
    for spec in ctx.defn.get("rows") or []:
        label = row_key(ctx, spec, spec.get("label") or spec.get("id") or "?") and spec["label"]
        for column in columns:
            cell = (spec.get("cells") or {}).get(column["id"])
            key = f'{spec["id"]}--{column["id"]}'
            if cell is None or isinstance(cell, str):
                if {"value", "low", "high"} & set(spec):
                    raise BuildError(f"plate {ctx.plate}: row '{label}' states a number; numbers come only from claims")
                rows.append({"key": key, "label": own_text(ctx.plate, "label", label), "column": column["label"], "words": True, "unit": "", "value": None, "low": None, "high": None, "year": None,
                             "text": None, "display": own_text(ctx.plate, "words", cell or NO_MEASUREMENT)})
                continue
            figures = cell if isinstance(cell, list) else [cell]
            for r in figure_rows(ctx, {"id": spec["id"], "label": label}, None, figures, key):
                r["column"] = column["label"]
                rows.append(r)
    if not rows:
        raise BuildError(f"plate {ctx.plate}: has no rows")
    return rows


def computed_rows(ctx, spec, name):
    """A row whose numbers come from a printed formula. plate.js runs the same formula when a setting moves."""
    key = row_key(ctx, spec, name)
    formula = spec["formula"]
    choices = {None: formula}
    if not {"value", "low", "high"} & set(formula):
        if set(formula) != ctx.stops:
            raise BuildError(f"plate {ctx.plate}: row '{name}' must give a formula for every stop of {ctx.defn.get('by')} (use null for none): {sorted(ctx.stops)}")
        choices = formula
    plus = ctx.plot.get("signed")
    digits = spec.get("digits", 3)
    out, names = [], set()
    for stop, parts in choices.items():
        if not parts:
            continue
        exprs = {part: parts[part] for part in ("value", "low", "high") if parts.get(part)}
        names |= {n for expr in exprs.values() for n in names_in(expr)}
        showing = all(control_stop(ctx.defn, control) == wanted for control, wanted in (spec.get("show") or {}).items())
        values = {part: calc(ctx.plate, f"row '{name}'", expr, ctx.env) if showing else None for part, expr in exprs.items()}
        value, low, high = values.get("value"), values.get("low"), values.get("high")
        text = value_text(rounded(value, digits), rounded(low, digits), rounded(high, digits), plus)
        unit = own_text(ctx.plate, "unit", spec.get("unit", ""))
        out.append({"key": key, "label": own_text(ctx.plate, "label", spec["label"]), "f": exprs, "digits": digits if digits != 3 else None, "when": stop, "value": value, "low": low, "high": high,
                    "year": None, "text": text, "unit": unit, "display": f"{text} {unit}".strip() if text else spec.get("gap") or ctx.defn.get("not_counted") or NOT_COUNTED,
                    "gap": spec.get("gap"), "hollow": spec.get("modeled", True) or None, "projected": bool(spec.get("projected") or ctx.plot.get("projected")) or None, **row_extras(ctx, spec)})
        if stop is None or stop == default_stop(ctx.defn):
            ctx.env[key] = value if value is not None else low
            ctx.env[f"{key}_low"], ctx.env[f"{key}_high"] = low, high
    cited = [c for n in sorted(names) for c in ctx.cites.get(n, [])]
    ctx.cites[key] = cited
    if not cited and not spec.get("cites") and not names <= ctx.reader:
        raise BuildError(f"plate {ctx.plate}: row '{name}' has no claim id; list the claims behind its formula in cites")
    if not cited and not spec.get("cites"):
        ctx.reader.add(key)
    for r in out:
        r["cites"] = list(dict.fromkeys(cited))
    return out


def segment_parts(ctx, spec, name):
    """The parts of a row, for a thin segmented bar in the detail panel."""
    parts = []
    for part in spec.get("segments") or []:
        parts.append(compact({"label": own_text(ctx.plate, "segment label", part["label"]), "f": part["value"], "value": calc(ctx.plate, f"row '{name}' segment", part["value"], ctx.env),
                              "hollow": part.get("modeled") or None, "word": part.get("word") or None, "at": part.get("at")}))
    return parts


def expand_rows(ctx):
    plate, defn = ctx.plate, ctx.defn
    rows = []
    stops_list = [option["value"] for c in defn.get("controls") or [] if c.get("name") == defn.get("by") for option in c["options"]]
    for spec in defn.get("rows") or []:
        name = spec.get("label") or spec.get("series") or spec.get("id") or "?"
        if {"value", "low", "high"} & set(spec):
            raise BuildError(f"plate {plate}: row '{name}' states a number; numbers come only from claims")
        if spec.get("formula") is not None:
            made = computed_rows(ctx, spec, name)
        elif spec.get("spark"):
            made = spark_rows(ctx, spec)
        elif spec.get("figures"):
            made = figure_rows(ctx, spec, None, spec["figures"], row_key(ctx, spec, name))
        elif spec.get("pair"):
            made = []
            for stop in stops_list or [None]:
                for member in spec["pair"]:
                    claim = usable(ctx, name, member.get("claim"))
                    made += claim_rows(ctx, {**spec, **member, "series": member["name"], "slug": member.get("id")}, stop, claim, row_key(ctx, spec, name))
        elif spec.get("points") and stops_list and ctx.plot["type"] in RULER_KINDS:
            claim = usable(ctx, name, spec.get("claim"))
            made = [r for stop in stops_list for r in claim_rows(ctx, spec, stop, claim)]
        else:
            if "claims" in spec and not defn.get("by"):
                raise BuildError(f"plate {plate}: row '{name}' lists claims by setting, but the plate has no by control")
            if "claims" in spec and set(spec["claims"]) != ctx.stops:
                raise BuildError(f"plate {plate}: row '{name}' must name every stop of {defn['by']} (use null for none): {sorted(ctx.stops)}")
            choices = spec["claims"] if "claims" in spec else {None: spec.get("claim")}
            if not any(choices.values()):
                raise BuildError(f"plate {plate}: row '{name}' has no claim id")
            made = []
            for stop, claim_id in choices.items():
                if claim_id:
                    made += claim_rows(ctx, spec, stop, usable(ctx, name, claim_id))
        extra = [usable(ctx, name, c)["id"] for c in spec.get("cites") or []]
        if spec.get("range_from"):
            extra.append(spec["range_from"])
        parts = segment_parts(ctx, spec, name)
        for r in made:
            cites = list(dict.fromkeys([*(r.get("cites") or []), *extra]))
            r["cites"] = [c for c in cites if c != r.get("claim")] or None
            if parts:
                r["segments"] = parts
        rows += made
    if not rows:
        raise BuildError(f"plate {plate}: has no rows")
    seen = set()
    for row in rows:
        mark = (row.get("series"), row["key"], row.get("when"), row.get("panel"))
        if mark in seen:
            raise BuildError(f"plate {plate}: two rows for {row.get('series') or ''} {row['key']} at one setting")
        seen.add(mark)
    if ctx.plot["type"] in LINE_KINDS:
        order = {name: i for i, name in enumerate(dict.fromkeys(r["series"] for r in rows))}
        panels = {name: i for i, name in enumerate(dict.fromkeys(r.get("panel") for r in rows))}
        rows.sort(key=lambda r: (panels[r.get("panel")], order[r["series"]], r["x"]))  # series as the plate lists them, each in year order
    return rows


def stops_of(defn):
    if not defn.get("by"):
        return set()
    for control in defn.get("controls") or []:
        if control.get("name") == defn["by"] and control.get("type") == "segmented":
            return {option["value"] for option in control["options"]}
    raise BuildError(f"plate {defn['id']}: by names {defn['by']!r}, which is not a segmented control")


def control_default(control):
    if control.get("type") == "number":
        return control.get("default")
    return control.get("default", control["options"][0]["value"] if control.get("type") == "segmented" else control.get("min"))


def control_stop(defn, name):
    for control in defn.get("controls") or []:
        if control.get("name") == name:
            return control_default(control)
    raise BuildError(f"plate {defn['id']}: names control {name!r}, which the plate does not have")


def check_control(plate, control):
    if not control.get("name") or not control.get("label"):
        raise BuildError(f"plate {plate}: every control needs a name and a label")
    if control.get("type") in ("range", "number") and not {"min", "max"} <= set(control):
        raise BuildError(f"plate {plate}: control {control['name']} needs min and max")
    default = control_default(control)
    if control.get("type") == "segmented":
        good = default in {option["value"] for option in control["options"]}
    elif control.get("type") == "number" and default is None:
        good = True
    elif control.get("type") in ("range", "number"):
        steps = (default - control["min"]) / control.get("step", 1)
        good = control["min"] <= default <= control["max"] and (float(round(steps, 9)).is_integer() or default in (control.get("presets") or []))
    else:
        raise BuildError(f"plate {plate}: unknown control type {control.get('type')!r}")
    if not good:
        raise BuildError(f"plate {plate}: control {control.get('name')} has a default off its stops: {default!r}")


def default_stop(defn):
    for control in defn.get("controls") or []:
        if control.get("name") == defn.get("by"):
            return control_default(control)
    return None


def plate_env(ctx, models):
    """Named numbers for formulas and sentences: from a claim, from a model's file, and from the settings at their defaults."""
    defn, plate, env = ctx.defn, ctx.plate, ctx.env
    for name, spec in (defn.get("inputs") or {}).items():
        if not re.fullmatch(r"[A-Za-z_]\w*", name):
            raise BuildError(f"plate {plate}: input name {name!r} must be one word")
        if spec.get("claim"):
            claim = usable(ctx, f"input {name}", spec["claim"])
            try:
                env[name] = vp.lookup(claim, spec.get("field", "value"))
            except (KeyError, TypeError) as error:
                raise BuildError(f"plate {plate}: input {name}: claim {spec['claim']} has no {spec.get('field')}") from error
            if not isinstance(env[name], (int, float)):
                raise BuildError(f"plate {plate}: input {name}: claim {spec['claim']} holds no number at {spec.get('field', 'value')}")
            ctx.sources[name] = compact({"claim": spec["claim"], "field": spec.get("field")})
            ctx.cites[name] = [spec["claim"]]
        elif spec.get("model"):
            file = defn.get("model")
            model = models.get(file) if file else None
            if model is None:
                raise BuildError(f"plate {plate}: input {name} reads a model, so the plate needs \"model\" naming a file in data/")
            try:
                env[name] = vp.numeric_tree(vp.lookup(model, spec["model"]))
            except (KeyError, TypeError) as error:
                raise BuildError(f"plate {plate}: input {name}: model {file} has nothing at {spec['model']}") from error
            if env[name] is None:
                raise BuildError(f"plate {plate}: input {name}: model {file} holds no number at {spec['model']}")
            ctx.sources[name] = {"file": file, "model": spec["model"]}
            ctx.cites[name] = []
        else:
            raise BuildError(f"plate {plate}: input {name} needs a claim or a model path")
    controls = defn.get("controls") or []
    for control in controls:
        if control["name"] in env:
            raise BuildError(f"plate {plate}: control {control['name']} has the same name as an input")
        if control.get("type") != "segmented":
            env[control["name"]] = control_default(control)
            ctx.reader.add(control["name"])
    for control in controls:
        if control.get("type") == "segmented":
            stands = {o["value"]: o["is"] for o in control["options"] if o.get("is")}
            for name in stands.values():
                if name not in env:
                    raise BuildError(f"plate {plate}: control {control['name']}: a stop stands for {name}, which is not an input or another control")
            default = control_default(control)
            env[control["name"]] = env[stands[default]] if default in stands else None if stands else default  # with stands, a stop with none is blank
            if stands:
                ctx.stands[control["name"]] = stands
            ctx.cites[control["name"]] = [c for name in stands.values() for c in ctx.cites.get(name, [])]
            ctx.reader.add(control["name"])


def nice_axis(plate, scale, domain, numbers):
    """The domain and ticks of one axis, checked against the numbers it must hold."""
    if scale == "log":
        if numbers and min(numbers) <= 0:
            raise BuildError(f"plate {plate}: a log scale cannot hold zero or a negative number")
        lo, hi = domain or [10.0 ** math.floor(math.log10(min(numbers))), 10.0 ** math.ceil(math.log10(max(numbers)))]
        hi = hi * 10 if hi == lo else hi
        if lo <= 0:
            raise BuildError(f"plate {plate}: a log scale needs a positive domain")
        ticks = [10.0 ** e for e in range(math.ceil(math.log10(lo) - 1e-9), math.floor(math.log10(hi) + 1e-9) + 1)]
    else:
        lo, hi = domain or nice_domain(numbers)
        if hi <= lo:
            raise BuildError(f"plate {plate}: plot.domain must run low to high")
        ticks = nice_ticks(lo, hi)
    if numbers and (min(numbers) < lo or max(numbers) > hi):
        raise BuildError(f"plate {plate}: plot.domain {[lo, hi]} would clip a value; numbers run {min(numbers)} to {max(numbers)}")
    return {"scale": scale, "domain": [lo, hi], "ticks": ticks}


def numbers_of(rows):
    return [n for r in rows for n in (r["value"], r["low"], r["high"]) if n is not None]


def one_unit(plate, rows, where="one axis"):
    units = {r["unit"] for r in rows if r["text"]}
    if len(units) > 1:
        raise BuildError(f"plate {plate}: {where}, one unit; these rows hold {sorted(units)}. "
                         "plot.units renames a unit; a row's convert changes one, with the arithmetic in the claim's derived text")
    return next(iter(units), "")


def position(plot, value):
    lo, hi = plot["domain"]
    t = math.log10 if plot["scale"] == "log" else float
    return round((t(value) - t(lo)) / (t(hi) - t(lo)), 4)


def place_on(axis, rows):
    for r in rows:
        for key, source in (("frac", "value"), ("lo", "low"), ("hi", "high")):
            if r[source] is not None:
                r[key] = position(axis, r[source])
        if "frac" not in r and r.get("lo") == r.get("hi") and r.get("lo") is not None:
            r["frac"] = r["lo"]


def plot_marks(ctx):
    """Labeled reference ticks on a ruler: a yardstick, or a baseline such as all occupations."""
    out = []
    for mark in ctx.plot.get("marks") or []:
        made = {"id": mark.get("id") or mark["label"], "label": own_text(ctx.plate, "mark label", mark["label"]), "when": mark.get("when"), "group": mark.get("group"), "unit": mark.get("unit", "")}
        if mark.get("claim"):
            claim = usable(ctx, f"mark {mark['label']}", mark["claim"])
            ctx.plate_cites.add(mark["claim"])
            made.update(value=claim.get("value"), low=claim.get("low"), high=claim.get("high"), unit=(ctx.plot.get("units") or {}).get(claim.get("unit"), claim.get("unit") or ""))
        else:
            exprs = {part: mark[part] for part in ("value", "low", "high") if mark.get(part)}
            for expr in exprs.values():
                ctx.plate_cites.update(c for n in names_in(expr) for c in ctx.cites.get(n, []))
            made.update({part: calc(ctx.plate, f"mark {mark['label']}", expr, ctx.env) for part, expr in exprs.items()}, f=exprs, digits=mark.get("digits"))
        made.setdefault("low", None)
        made.setdefault("high", None)
        made.setdefault("value", None)
        digits = mark.get("digits", 3)
        low, high = (rounded(made["low"], digits), rounded(made["high"], digits)) if made.get("f") else (made["low"], made["high"])
        shown = rounded(made["value"], digits) if made.get("f") else made["value"]
        made["text"] = value_text(shown, low, high, ctx.plot.get("signed"))
        out.append(made)
    return out


def resolve_band(band, rows, projected_from):
    """The wash between a low and a high: two named series, the spread across series, or each point's own range."""
    if not band:
        return None
    points = {}
    if band.get("across") == "range":
        for r in rows:
            if r["low"] is not None and r["high"] is not None:
                points[r["x"]] = (r["low"], r["high"])
    elif band.get("across") == "series":
        by_x = {}
        for r in rows:
            if r["value"] is not None:
                by_x.setdefault(r["x"], []).append(r["value"])
        points = {x: (min(values), max(values)) for x, values in by_x.items() if len(values) > 1}
    else:
        low = {r["x"]: r["value"] for r in rows if r["series"] == band.get("low")}
        high = {r["x"]: r["value"] for r in rows if r["series"] == band.get("high")}
        points = {x: (low[x], high[x]) for x in sorted(low.keys() & high.keys())}
    return [[x, lo, hi, 1 if projected_from is not None and x >= projected_from else 0] for x, (lo, hi) in sorted(points.items())] or None


def finish_lines(ctx, rows, plot):
    plate = ctx.plate
    plot["scale"] = plot.get("scale") or "linear"
    if plot["scale"] == "log":
        raise BuildError(f"plate {plate}: a log scale carries squares, never bars; use a ladder")
    plot["xdomain"] = [min(r["x"] for r in rows), max(r["x"] for r in rows)]
    band = plot.pop("band", None)
    if plot.get("select") == "point":
        plot["dots"] = True
    if plot["type"] == "lines":
        numbers = numbers_of(rows)
        if not numbers:
            raise BuildError(f"plate {plate}: no row holds a number")
        plot.update(nice_axis(plate, "linear", plot.get("domain"), numbers), unit=one_unit(plate, rows))
        plot["band"] = resolve_band(band, rows, plot.get("projected_from"))
        return
    panels = plot.get("panels")
    own_axes = bool(panels) and plot.get("axis") != "shared"
    if not panels:
        panels = [{"id": name, "label": name} for name in dict.fromkeys(r["series"] for r in rows)]
        for r in rows:
            r["panel"] = r["series"]
    known = {p["id"] for p in panels}
    if any(r.get("panel") not in known for r in rows):
        raise BuildError(f"plate {plate}: every row needs a panel from plot.panels: {sorted(known)}")
    shared = nice_axis(plate, "linear", plot.get("domain"), numbers_of(rows)) if not own_axes else None
    if shared:
        plot.update(shared, unit=one_unit(plate, rows))
    finished = []
    for panel in panels:
        mine = [r for r in rows if r.get("panel") == panel["id"]]
        unit = one_unit(plate, mine, f"panel {panel['id']}")
        axis = shared or nice_axis(plate, "linear", panel.get("domain"), numbers_of(mine) or [0, 1])
        title = panel["label"] if (not unit or shared or unit in panel["label"]) else f'{panel["label"]} ({unit})'
        scope = (band or {}).get("panel")
        finished.append(compact({"id": panel["id"], "label": own_text(plate, "panel label", panel["label"]), "title": title, "unit": unit, **axis,
                                 "band": resolve_band(band, mine, plot.get("projected_from")) if not scope or scope == panel["id"] else None}))
    plot["panels"] = finished
    plot.setdefault("domain", finished[0]["domain"])
    plot.setdefault("ticks", finished[0]["ticks"])
    plot.setdefault("unit", finished[0]["unit"])


def finish_rulers(ctx, rows, plot):
    plate, kind = ctx.plate, plot["type"]
    marks = plot_marks(ctx)
    groups = [dict(g) for g in plot.get("groups") or [{"id": None}]]
    if not any(numbers_of([r for r in rows if r.get("group") == g["id"]]) for g in groups):
        raise BuildError(f"plate {plate}: no row holds a number")
    for group in groups:
        mine = [r for r in rows if r.get("group") == group["id"]]
        here = [m for m in marks if m.get("group") == group["id"]]
        scale = group.get("scale") or plot.get("scale") or "linear"
        mark = group.get("mark") or ("bar" if kind == "bars" else "square")
        if scale == "log" and mark == "bar":
            raise BuildError(f"plate {plate}: a log scale carries squares, never bars; use a ladder")
        numbers = numbers_of(mine) + [n for m in here for n in (m["value"], m["low"], m["high"]) if n is not None]
        axis = nice_axis(plate, scale, group.get("domain") or plot.get("domain"), numbers)
        group.update(axis, mark=mark, unit=one_unit(plate, mine, f"group {group['id']}" if group["id"] else "one axis"))
        group["zero"] = position(axis, 0) if axis["scale"] != "log" else None
        place_on(axis, mine)
        for m in here:
            place_on(axis, [m])
    for group in groups:
        group.update(diverging=group["domain"][0] < 0 or None)
    if plot.get("groups"):
        plot["groups"] = [compact(g) for g in groups]
    first = groups[0]
    plot.update(scale=first["scale"], domain=first["domain"], ticks=first["ticks"], unit=first["unit"], mark=first["mark"], zero=first["zero"], diverging=first.get("diverging"))
    if marks:
        plot["marks"] = [compact(m) for m in marks]
    if plot.get("sort"):
        order_rows(rows, control_stop(ctx.defn, plot["sort"]))


def order_rows(rows, by):
    """Biggest first; by a row's tag, tagged groups in the order they first appear. plate.js sorts the same way."""
    tags = {tag: i for i, tag in enumerate(dict.fromkeys(r.get("tag") or "" for r in rows))}
    rows.sort(key=lambda r: ((tags[r.get("tag") or ""] if by == "tag" else 0), -(r["value"] if r["value"] is not None else -math.inf)))


def finish_instrument(ctx, rows, plot):
    """Each computed row has its own thin ruler, from zero to what its formula reaches with the settings at their largest."""
    combos = setting_extremes(ctx)
    for env in combos:
        run_formulas(ctx, env)
    for r in rows:
        if not r.get("f"):
            continue
        spec = next((s for s in ctx.defn["rows"] if s.get("id") == r["key"]), {})
        numbers = [n for env in combos for n in (calc(ctx.plate, f"row '{r['key']}'", expr, env) for expr in r["f"].values()) if n is not None]
        r["axis"] = {"domain": spec.get("domain") or nice_domain(numbers or [1]), **({"scale": spec["scale"]} if spec.get("scale") else {})}
        place_on({"scale": "linear", **r["axis"]}, [r])


def setting_extremes(ctx, cap=64):
    base = dict(ctx.env)
    controls = ctx.defn.get("controls") or []
    for control in controls:
        if control.get("type") == "range" or (control.get("type") == "number" and base[control["name"]] is not None):
            base[control["name"]] = control["max"]
    combos = [base]
    for control in controls:
        stands = ctx.stands.get(control["name"])
        if stands:
            combos = [{**env, control["name"]: env[stands[o["value"]]] if o["value"] in stands else None} for env in combos for o in control["options"]][:cap]
    return combos


def run_formulas(ctx, env):
    for spec in ctx.defn.get("rows") or []:
        formula = spec.get("formula")
        if formula and {"value", "low", "high"} & set(formula) and spec.get("id"):
            values = {part: calc(ctx.plate, f"row '{spec['id']}'", formula[part], env) if formula.get(part) else None for part in ("value", "low", "high")}
            env[spec["id"]] = values["value"] if values["value"] is not None else values["low"]
            env[f"{spec['id']}_low"], env[f"{spec['id']}_high"] = values["low"], values["high"]


def finish_plot(ctx, rows):
    """Works out each axis: domain and ticks; rows on a ruler also get their positions on it."""
    defn = ctx.defn
    plot = {k: v for k, v in defn["plot"].items() if k != "units"}
    kind = plot["type"]
    if plot.get("highlight_by"):
        plot["highlight"] = control_stop(defn, plot["highlight_by"])
    if kind in LINE_KINDS:
        finish_lines(ctx, rows, plot)
    elif kind in RULER_KINDS:
        finish_rulers(ctx, rows, plot)
    elif kind == "instrument":
        finish_instrument(ctx, rows, plot)
    if plot.get("count"):
        count = plot["count"]
        ctx.plate_cites.update(c for n in names_in(count["unit"]) for c in ctx.cites.get(n, []))
        calc(ctx.plate, "count unit", count["unit"], ctx.env)
        plot["count"] = {"unit": count["unit"], "noun": own_text(ctx.plate, "noun", count["noun"]), "nouns": own_text(ctx.plate, "noun", count.get("nouns") or f'{count["noun"]}s'),
                         "cap": count.get("cap", 200), "control": f'{defn["id"]}-plot'}
    return compact(plot)


def evidence_text(claim, limit):
    label = EVIDENCE_LABEL.get(claim["source"].get("kind"), "Source")
    return f"{label}, partly verified. Limit: {limit}" if claim["status"] == "partly" else f"{label}, verified against the source."


def short_name(publisher):
    return re.sub(r"\s*\(.*\)$", "", str(publisher)).strip()


def row_fields(defn, row, spec_boundary, claims):
    """What a sentence can say about a row."""
    claim = claims.get(row.get("claim"))
    cited = [claims[c] for c in row.get("cites") or []]
    boundary = spec_boundary or defn.get("boundary") or (claim or {}).get("boundary") or ""
    evidence = evidence_text(claim, row.get("limit")) if claim else ("Modeled from the figures in its receipts." if cited else "Modeled from the reader's settings." if row.get("f") else "")
    source = short_name(claim["source"]["publisher"]) if claim else "; ".join(dict.fromkeys(short_name(c["source"]["publisher"]) for c in cited))
    published = us_date(claim["source"].get("published")) if claim else ""
    plain = {k: row.get(k) if row.get(k) is not None else "" for k in ("series", "end", "column", "tag")}
    panel = next((p.get("label") for p in defn["plot"].get("panels") or [] if p.get("id") == row.get("panel")), row.get("panel") or "")
    figure = lambda v: "" if v is None else Fig(rounded(v, row.get("digits") or 3) if row.get("f") else v)
    return {
        "label": row["label"], **plain, "panel": panel, "group": row.get("group") or "", "display": row["display"], "text": row["text"] or "",
        "unit": row["unit"], "year": row["year"] if row["year"] is not None else "", "boundary": sentence(boundary), "value": figure(row["value"]), "low": figure(row["low"]), "high": figure(row["high"]),
        "evidence": evidence, "source": source, "published": published, "limit": row.get("limit", ""),
    }


def tidy(text):
    """A sentence whose year or boundary came up empty."""
    return re.sub(r"\s+", " ", re.sub(r",\s*\.", ".", text)).strip()


def plate_field_values(ctx, row, fields):
    """Fields a plate computes per row, for its sentences and table columns."""
    scope = {**ctx.env, "value": row["value"], "low": row["low"], "high": row["high"]}
    return {name: number(rounded(result, spec.get("digits", 3))) if (result := calc(ctx.plate, f"field {name}", spec["formula"], scope)) is not None else ""
            for name, spec in fields.items()}


# Markup ---------------------------------------------------------------------------------------------

def controls_html(defn):
    plain, more = [], []
    for c in defn.get("controls") or []:
        name, label = escape(c["name"]), escape(own_text(defn["id"], "control label", c["label"]))
        default = control_default(c)
        if c.get("type") == "segmented":
            options = "".join(
                f'<label><input type="radio" name="{name}" value="{escape(o["value"])}"{" checked" if o["value"] == default else ""}>'
                f'<span>{escape(own_text(defn["id"], "control label", o["label"]))}</span></label>' for o in c["options"])
            part = f'<fieldset class="segmented" data-param="{name}"><legend>{label}</legend>{options}</fieldset>'
        elif c.get("type") == "range":
            lo, hi, step = c["min"], c["max"], c.get("step", 1)
            attrs = f'min="{lo}" max="{hi}" step="{step}" value="{default}"'
            presets = "".join(f'<button type="button" data-preset="{p}">{p}</button>' for p in c.get("presets") or [])
            presets_data = f' data-presets="{",".join(str(p) for p in c["presets"])}"' if c.get("presets") else ""
            part = (f'<div class="slider" data-param="{name}"{presets_data}><label for="{defn["id"]}-{name}">{label}</label>'
                    f'<input type="range" id="{defn["id"]}-{name}" {attrs}><input type="number" {attrs} aria-label="{label}, typed">'
                    f'<span class="slider-stops caption"><span>{lo}</span><span>{hi}</span></span>'
                    f'{f"""<span class="slider-presets" role="group" aria-label="{label}, presets">{presets}</span>""" if presets else ""}</div>')
        elif c.get("type") == "number":
            value = f' value="{default}"' if default is not None else ""
            part = (f'<div class="slider is-typed" data-param="{name}" data-blank><label for="{defn["id"]}-{name}">{label}</label>'
                    f'<input type="number" id="{defn["id"]}-{name}" min="{c["min"]}" max="{c["max"]}" step="{c.get("step", 1)}"{value}></div>')
        else:
            raise BuildError(f"plate {defn['id']}: unknown control type {c.get('type')!r}")
        (more if c.get("more") else plain).append(part)
    if more:
        plain.append(f'<details class="plate-more"><summary>{escape(own_text(defn["id"], "more", defn.get("more") or "More assumptions"))}</summary><div class="plate-controls">{"".join(more)}</div></details>')
    return f'<div class="plate-controls" data-js hidden>{"".join(plain)}</div>' if plain else ""


def control_words(control):
    default = control_default(control)
    return next((o["label"] for o in control.get("options", []) if o["value"] == default), default if default is not None else "blank")


def setting_data(defn):
    out = []
    for c in defn.get("controls") or []:
        if c.get("auto"):
            continue
        out.append(compact({"name": c["name"], "label": c["label"], "options": {o["value"]: o["label"] for o in c["options"]} if c.get("options") else None}))
    return out


def setting_line(defn):
    shown = [f"{c['label']}: {control_words(c)}" for c in defn.get("controls") or [] if not c.get("auto")]
    return f'<p class="caption plate-setting">Setting shown: {escape("; ".join(str(s) for s in shown))}.</p>' if shown else ""


def legend_html(data):
    items = []
    plot = data["plot"]
    names = list(dict.fromkeys(r["series"] for r in data["rows"] if r.get("series") and r.get("x") is not None))
    if plot["type"] == "lines" and len(names) >= 2:
        items += [f'<li data-series="{escape(n)}"><span class="plate-key{" is-on" if n == plot.get("highlight") else ""}"></span>{escape(n)}</li>' for n in names]
    if plot["type"] == "multiples" and plot.get("highlight_by"):
        items += ['<li><span class="plate-key is-on"></span>Selected</li>', '<li><span class="plate-key"></span>Others</li>']
    if any(p.get("band") for p in plot.get("panels") or []) or plot.get("band"):
        items.append(f'<li><span class="plate-key is-band"></span>{escape(plot.get("band_label") or "Range")}</li>')
    if plot.get("pair_names"):
        items += [f'<li><span class="plate-square"></span>{escape(plot["pair_names"][0])}</li>', f'<li><span class="plate-square is-b"></span>{escape(plot["pair_names"][1])}</li>']
    if any(r.get("projected") for r in data["rows"]):
        items.append('<li><span class="plate-key is-proj"></span>Projection</li>')
    hollow = {bool(r.get("hollow")) for r in data["rows"] if r.get("text")}
    if len(hollow) == 2:
        items += ['<li><span class="plate-square"></span>Measured or company-reported</li>', '<li><span class="plate-square is-hollow"></span>Modeled or estimated</li>']
    return f'<ul class="legend plate-legend">{"".join(items)}</ul>' if items else ""


def value_html(text):
    """Twin of plate.js valueCell: the figure and unit on one line, the range on the next, in the same words."""
    match = VALUE_WITH_RANGE.match(text or "")
    if not match:
        return escape(text)
    unit = f' <span class="ladder-unit">{escape(match[3])}</span>' if match[3] else ""
    return f'<span class="ladder-num">{escape(match[1])}</span> <span class="ladder-tag">{escape(match[2])}</span>{unit}'


def ladder_row(data, key, label, rows, axis, tag):
    r = rows[0] if rows else None
    second = rows[1] if len(rows) > 1 else None
    frac, lo, hi = (r.get("frac"), r.get("lo"), r.get("hi")) if r else (None, None, None)
    x2 = second.get("frac") if second else None
    if second and frac is not None and x2 is not None:
        lo, hi = min(frac, x2), max(frac, x2)
    spot = ";".join(f"--{name}:{at}" for name, at in (("x", frac), ("lo", lo), ("hi", hi), ("x2", x2)) if at is not None)
    style = f' style="{spot}"' if spot else ""
    sign = ""
    if axis.get("diverging") and r and r.get("value") is not None:
        sign = " is-neg" if r["value"] < 0 else " is-pos"
    bar = axis.get("mark") == "bar"
    projected = " is-proj" if r and r.get("projected") else ""
    hollow = " is-hollow" if r and r.get("hollow") else ""
    text = r["display"] if r else data["not_counted"]
    if second:
        text = f'{r.get("text") or ""} and {second.get("text") or ""} {r.get("unit") or ""}'.strip()
    marks = (f'<span class="ladder-bar{hollow}{projected}"{"" if frac is not None else " hidden"}></span>' if bar else "") + (
        f'<span class="ladder-range{projected}"{"" if lo is not None and hi is not None else " hidden"}></span>')
    if not bar:
        marks += f'<span class="ladder-mark{hollow}"{"" if frac is not None else " hidden"}></span>'
    if second or data["plot"].get("pair_names"):
        marks += f'<span class="ladder-mark is-b"{"" if x2 is not None else " hidden"}></span>'
    words = f'<span class="ladder-tag">{escape(tag)}</span>' if tag else ""
    gap = " is-gap" if frac is None and lo is None else ""
    return (f'<li class="ladder-row{sign}{gap}" data-row="{escape(key)}"{style}><span class="ladder-label">{escape(label)}{words}</span>'
            f'<span class="ladder-track">{marks}</span><span class="ladder-value">{value_html(text)}</span></li>')


def ladder_html(data, now):
    plot = data["plot"]
    groups = plot.get("groups") or [{"id": None, **{k: plot.get(k) for k in ("scale", "domain", "ticks", "unit", "mark", "zero", "diverging")}, "axis_label": plot.get("axis_label")}]
    keys = list(dict.fromkeys(r["key"] for r in data["rows"]))
    first = {}
    for r in data["rows"]:
        first.setdefault(r["key"], r)
    default_group = first[data["default"]].get("group")
    parts = []
    for group in groups:
        mine = [k for k in keys if first[k].get("group") == group.get("id")]
        rows = "".join(ladder_row(data, k, first[k]["label"], [r for r in now if r["key"] == k], group, first[k].get("tag")) for k in mine)
        top = max(abs(t) for t in group["domain"])
        grid = "".join(f'<i{" class=\"is-zero\"" if t == 0 else ""} style="--x:{position(group, t)}"></i>' for t in group["ticks"])
        for mark in plot.get("marks") or []:
            if mark.get("group") == group.get("id") and mark.get("frac") is not None:
                at = mark["frac"]
                active = all(data["stops_now"].get(control) == wanted for control, wanted in (mark.get("when") or {}).items())
                grid += (f'<i class="ladder-tick{" is-right" if at > 0.6 else ""}" data-mark="{escape(mark["id"])}" style="--x:{at}"{"" if active else " hidden"}>'
                         f'<span>{escape(f"{mark["label"]}, {mark.get("text") or ""} {mark.get("unit") or ""}".strip())}</span></i>')
        axis = "".join(f'<span style="--x:{position(group, t)}">{escape(tick_text(t, top))}</span>' for t in group["ticks"])
        needle = group.get("mark") == "bar" or group.get("id") != default_group or first[data["default"]].get("frac") is None
        label = "".join(f'<p class="ladder-group-label">{escape(text)}</p>' for text in [group.get("label") or group.get("axis_label")] if text)
        ticked = any(m.get("group") == group.get("id") for m in plot.get("marks") or [])
        zero = f' style="--z:{group["zero"]}"' if group.get("zero") is not None else ""
        parts.append(f'<div class="ladder-group" style="flex-grow:{max(1, len(mine))}">{label}'
                     f'<div class="ladder{" no-needle" if needle else ""}{" has-ticks" if ticked else ""}" data-form="{escape(group.get("mark") or "square")}"{zero}>'
                     f'<div class="ladder-grid" aria-hidden="true">{grid}<i class="ladder-needle"></i></div>'
                     f'<ol class="ladder-rows">{rows}</ol><div class="ladder-axis" aria-hidden="true">{axis}</div></div></div>')
    return f'<div class="ladder-groups">{"".join(parts)}</div>'


def spark_svg(points):
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    d = "".join(f'{"L" if i else "M"}{(x - x0) / ((x1 - x0) or 1) * 100:.1f} {22 - (y - y0) / ((y1 - y0) or 1) * 20:.1f}' for i, (x, y) in enumerate(points))
    return f'<svg class="spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><path class="m-line is-one" d="{d}"/></svg>'


def fixed_line(r):
    """One figure in a context row: the number apart from its words, so CSS can set it large. It reads the same aloud."""
    display, text = r["display"], r.get("text") or ""
    if "(" in text or not text or not display.startswith(text):
        return f'<span class="instrument-line">{value_html(display)}{f" {escape(r["series"])}" if r.get("series") else ""}</span>'
    words = " ".join(filter(None, [display[len(text):].strip(), r.get("series")]))
    return f'<span class="instrument-line"><span class="ladder-num">{escape(text)}</span> <span class="ladder-unit">{escape(words)}</span></span>'


def instrument_html(data, now, defn):
    keys = list(dict.fromkeys(r["key"] for r in now))
    groups = {g["id"]: g.get("label") for g in defn["plot"].get("groups") or []}
    parts, last_group = [], None
    for key in keys:
        rows = [r for r in now if r["key"] == key]
        r = rows[0]
        if r.get("group") != last_group and r.get("group") is not None:
            parts.append(f'<li class="instrument-group">{escape(groups.get(r["group"]) or r["group"])}</li>')
        last_group = r.get("group")
        label = f'<span class="ladder-label">{escape(r["label"])}{f"""<span class="ladder-tag">{escape(r["tag"])}</span>""" if r.get("tag") else ""}</span>'
        if r.get("spark"):
            track = f'<span class="instrument-spark">{spark_svg(r["spark"])}</span>'
        elif r.get("axis"):
            frac, lo, hi = r.get("frac"), r.get("lo"), r.get("hi")
            track = (f'<span class="ladder-track instrument-ruler"><span class="ladder-range{" is-proj" if r.get("projected") else ""}"{"" if lo is not None and hi is not None else " hidden"}></span>'
                     f'<span class="ladder-mark{" is-hollow" if r.get("hollow") else ""}"{"" if frac is not None else " hidden"}></span>'
                     f'<span class="instrument-ends" aria-hidden="true"><span>{number(r["axis"]["domain"][0])}</span><span>{number(r["axis"]["domain"][1])}</span></span></span>')
        else:
            track = '<span class="instrument-fixed"></span>'
        spot = ";".join(f"--{name}:{at}" for name, at in (("x", r.get("frac")), ("lo", r.get("lo")), ("hi", r.get("hi"))) if at is not None)
        style = f' style="{spot}"' if spot else ""
        value = "".join(fixed_line(x) for x in rows) if not r.get("axis") else value_html(r["display"])
        parts.append(f'<li class="instrument-row{"" if r.get("axis") else " is-fixed"}" data-row="{escape(key)}"{style}>{label}{track}<span class="ladder-value">{value}</span></li>')
    return f'<ol class="instrument">{"".join(parts)}</ol>'


def matrix_html(data, defn):
    columns = data["plot"]["columns"]
    head = "".join(f'<th scope="col">{escape(c["label"])}</th>' for c in columns)
    body = []
    for spec in defn["rows"]:
        cells = []
        for column in columns:
            key = f'{spec["id"]}--{column["id"]}'
            rows = [r for r in data["rows"] if r["key"] == key]
            if rows[0].get("words"):
                inner = f'<p class="matrix-words">{escape(rows[0]["display"])}</p>'
            else:
                # Bars only where a cell's figures share a unit, so length compares like with like.
                alike = len(rows) > 1 and len({r.get("unit") for r in rows}) == 1 and all(r.get("value") is not None for r in rows)
                top = max((r["value"] for r in rows), default=1) if alike else 1
                bar = lambda r: f'<span class="matrix-bar" style="--x:{round(r["value"] / top, 4)}"></span>' if alike else ""
                inner = '<ul class="matrix-figures">' + "".join(
                    f'<li class="matrix-figure{" is-hollow" if r.get("hollow") else ""}"><span class="plate-square"></span><span>{escape(r.get("before") or "")}'
                    f'<strong>{escape(f"{r.get("text")} {r.get("unit") or ""}".strip() if r.get("text") else NO_MEASUREMENT)}</strong>{escape(r.get("after") or "")}{bar(r)}</span></li>' for r in rows) + "</ul>"
            cells.append(f'<td data-row="{escape(key)}">{inner}</td>')
        body.append(f'<tr><th scope="row">{escape(spec["label"])}</th>{"".join(cells)}</tr>')
    return (f'<table class="matrix"><thead><tr><td></td>{head}</tr></thead><tbody>{"".join(body)}</tbody></table>')


def svg_open(data, width, height):
    return f'<svg class="plate-svg" viewBox="0 0 {width} {height}" role="img" aria-label="{escape(data["alt"])}">'


def trace(points, cls):
    """A series as a solid path, then a dashed one past the last historical year."""
    solid = [p for p in points if not p[2]]
    dashed = [p for p in points if p[2]]
    out = []
    for group, extra in ((solid, ""), (solid[-1:] + dashed if dashed else [], " is-proj")):
        if len(group) > 1:
            d = "".join(f'{"L" if i else "M"}{x:.1f} {y:.1f}' for i, (x, y, _) in enumerate(group))
            out.append(f'<path class="{cls}{extra}" d="{d}"/>')
    return "".join(out)


def line_marks(rows, plot, axis, x0, x1, y0, y1, needle, labels=True, width=10_000):
    """Grid, baseline, ticks, band, and lines for one plot area; static twin of plate.js chart()."""
    lo, hi = axis["domain"]
    xlo, xhi = plot["xdomain"]
    fx = lambda v: x0 + (v - xlo) / ((xhi - xlo) or 1) * (x1 - x0)
    fy = lambda v: y0 + (v - lo) / (hi - lo) * (y1 - y0)
    top = max(abs(lo), abs(hi))
    out = []
    for t in axis["ticks"]:
        out.append(f'<line class="m-grid" x1="{x0}" x2="{x1}" y1="{fy(t):.1f}" y2="{fy(t):.1f}"/>'
                   f'<text class="m-tick" x="{x0 - 8}" y="{fy(t):.1f}" dy=".32em" text-anchor="end">{escape(tick_text(t, top))}</text>')
    base = fy(max(lo, 0))
    out.append(f'<line class="m-base" x1="{x0}" x2="{x1}" y1="{base:.1f}" y2="{base:.1f}"/>')
    step = max(1, math.ceil((xhi - xlo) / max(1, (x1 - x0) // 72)))
    for year in range(xlo, xhi + 1, step):
        out.append(f'<text class="m-tick" x="{fx(year):.1f}" y="{y0 + 20}" text-anchor="{"end" if width - fx(year) < 24 else "middle"}">{year}</text>')
    band = axis.get("band")
    if band:
        upper = [(fx(b[0]), fy(b[2]), b[3]) for b in band]
        lower = [(fx(b[0]), fy(b[1]), b[3]) for b in band]
        d = "".join(f'{"L" if i else "M"}{x:.1f} {y:.1f}' for i, (x, y, _) in enumerate(upper + lower[::-1])) + "Z"
        out.append(f'<path class="m-band" d="{d}"/>{trace(upper, "m-band-edge")}{trace(lower, "m-band-edge")}')
    names = list(dict.fromkeys(r["series"] for r in rows))
    lead = plot.get("highlight")
    for name in sorted(names, key=lambda n: n == lead):
        points = [r for r in rows if r["series"] == name and r["value"] is not None]
        cls = "m-line" + (" is-on" if name == lead else "") + (" is-one" if len(names) == 1 and not lead else "")
        out.append(trace([(fx(r["x"]), fy(r["value"]), bool(r.get("projected"))) for r in points], cls))
        if len(points) == 1 or plot.get("dots"):
            for r in points:
                out.append(f'<rect class="m-dot is-solo{" is-hollow" if r.get("hollow") else ""}{" is-lead" if name == lead else ""}" x="{fx(r["x"]) - 5:.1f}" y="{fy(r["value"]) - 5:.1f}" width="10" height="10"/>')
        if labels and points and (len(names) <= 4 or name == lead):
            end = points[-1]
            out.append(f'<text class="m-label" x="{fx(end["x"]) + 8:.1f}" y="{fy(end["value"]):.1f}" dy=".32em">{escape(name)}</text>')
    for r in rows:
        if r["low"] is not None and r["high"] is not None:
            x = fx(r["x"]) + (r.get("dx") or 0)
            out.append(f'<line class="m-range" x1="{x:.1f}" x2="{x:.1f}" y1="{fy(r["low"]):.1f}" y2="{fy(r["high"]):.1f}"/>')
    if needle is not None:
        out.append(f'<line class="m-needle" x1="{fx(needle):.1f}" x2="{fx(needle):.1f}" y1="{y1}" y2="{y0}"/>')
    return "".join(out)


def lines_svg(data, now):
    needle = None if data["plot"].get("select") == "point" else int(data["default"])
    return f'{svg_open(data, 800, 450)}{line_marks(now, data["plot"], data["plot"], 72, 660, 422, 12, needle)}</svg>'


def multiples_svg(data, now):
    plot = data["plot"]
    panels = plot["panels"]
    cols = min(len(panels), 3)
    down = math.ceil(len(panels) / cols)
    cw, ch, gap = 248, 200, 24
    width, height = cols * cw + (cols - 1) * gap, down * ch + (down - 1) * gap
    needle = None if plot.get("select") == "point" else int(data["default"])
    cells = []
    for i, panel in enumerate(panels):
        rows = [r for r in now if r.get("panel") == panel["id"]]
        cells.append(f'<g transform="translate({(i % cols) * (cw + gap)} {(i // cols) * (ch + gap)})">'
                     f'<text class="m-title" x="0" y="14">{escape(panel["title"])}</text>{line_marks(rows, plot, panel, 48, cw - 8, ch - 24, 28, needle, labels=False, width=cw)}</g>')
    return f'{svg_open(data, width, height)}{"".join(cells)}</svg>'


def cell_text(r, field, data, by_label):
    if field == "setting":
        return by_label.get(r.get("when"), "")
    if field == "claims":
        return ", ".join(c for c in [r.get("claim"), *(r.get("cites") or [])] if c)
    if field == "source":
        return sources_of(r, data)
    if field == "boundary":
        return " ".join(dict.fromkeys(data["receipts"][c]["boundary"] for c in [r.get("claim"), *(r.get("cites") or [])] if c))
    if field in ("value", "low", "high"):
        value = r.get(field)
        return number(rounded(value, r.get("digits", 3)) if r.get("f") else value) if value is not None else ""
    if field == "panel":
        return next((p["label"] for p in data["plot"].get("panels") or [] if p["id"] == r.get("panel")), r.get("panel") or "")
    if field in (r.get("fields") or {}):
        return r["fields"][field]
    if field in (r.get("cols") or {}):
        return r["cols"][field]
    value = r.get(field)
    return "" if value is None else str(value)


def sources_of(r, data):
    names, partly = [], False
    for claim_id in [r.get("claim"), *(r.get("cites") or [])]:
        if claim_id:
            names.append(data["receipts"][claim_id]["short"])
            partly = partly or data["receipts"][claim_id]["status"] == "partly"
    return f'{"; ".join(dict.fromkeys(names))}{", partly verified" if partly else ""}'


def table_html(defn, data):
    spec = defn.get("table") or {}
    by_label = {}
    for c in defn.get("controls") or []:
        if c.get("name") == defn.get("by"):
            by_label = {o["value"]: o["label"] for o in c["options"]}
    rows = data["rows"]
    labels = spec.get("labels") or {}
    if spec.get("across"):
        across, by = spec["across"], spec.get("by") or ["series"]
        panels = {p["id"]: p["label"] for p in data["plot"].get("panels") or []}
        tops = list(dict.fromkeys(r.get(across) for r in rows))
        groups = {}
        for r in rows:
            groups.setdefault(tuple(cell_text(r, f, data, by_label) for f in by), {})[r.get(across)] = r
        head = "".join(f'<th scope="col">{escape(labels.get(f, f.capitalize()))}</th>' for f in by) + "".join(f'<th scope="col">{escape(panels.get(t, str(t)))}</th>' for t in tops) + '<th scope="col">Claims</th>'
        body = []
        for names, cells in groups.items():
            ids = list(dict.fromkeys(c for r in cells.values() for c in [r.get("claim"), *(r.get("cites") or [])] if c))
            first = f'<th scope="row">{escape(names[0])}</th>' + "".join(f"<td>{escape(n)}</td>" for n in names[1:])
            body.append(f'<tr>{first}{"".join(f"<td>{escape(cells[t].get("text") or "") if t in cells else ""}</td>" for t in tops)}<td>{escape(", ".join(ids))}</td></tr>')
    else:
        columns = spec.get("columns")
        if not columns:
            columns = [{"label": "Series" if data["plot"]["type"] in LINE_KINDS else "Row", "field": "label"}]
            if any(r.get("panel") for r in rows) and data["plot"].get("panels") and any(p["id"] != p["label"] for p in data["plot"]["panels"]):
                columns.append({"label": "Panel", "field": "panel"})
            if any(r.get("when") for r in rows):
                columns.append({"label": "Setting", "field": "setting"})
            if any(r.get("column") for r in rows):
                columns.append({"label": "Column", "field": "column"})
            if any(r.get("series") and r.get("x") is None for r in rows):
                columns.append({"label": "Part", "field": "series"})
            columns += [{"label": "Value", "field": "display"}, {"label": "Year", "field": "year"}, {"label": "Source", "field": "source"}]
        head = "".join(f'<th scope="col">{escape(c["label"])}</th>' for c in columns)
        body = []
        for r in rows:
            cells = []
            for i, c in enumerate(columns):
                field = c["field"]
                text = cell_text(r, field, data, by_label)
                if field == "display" and r.get("spark"):
                    text = "; ".join(f"{x}: {number(v)}" for x, v in r["spark"]) + f' {r["unit"]}'
                inner = verbatim(text) if field == "source" else escape(text)
                changes = (r.get("f") and field in ("display", "text", "value", "low", "high")) or field in (r.get("fields") or {})
                live = f' data-cell="{escape(r["key"])}|{escape(r.get("when") or "")}|{escape(field)}"' if changes else ""
                cells.append(f'<th scope="row"{live}>{inner}</th>' if i == 0 else f"<td{live}>{inner}</td>")
            body.append(f'<tr>{"".join(cells)}</tr>')
    caption = "<caption>Every value in this plate, with its source.</caption>"
    also = "".join(f'<li>{escape(a["label"])}: {escape(a["display"])}</li>' for a in data.get("also") or [])
    also = f'<ul class="plate-also caption">{also}</ul>' if also else ""
    return (f'<div class="table-scroll" tabindex="0" role="region" aria-label="Table of values"><table class="data-table plate-table">{caption}'
            f'<thead><tr>{head}</tr></thead><tbody>{"".join(body)}</tbody></table></div>{also}')


def sources_html(data):
    items = []
    for claim_id, r in data["receipts"].items():
        year = f" Value year {r['year']}." if r.get("year") else ""
        status = f"Partly verified. Limit: {escape(r['limit'])}" if r["status"] == "partly" else "Verified against the source."
        derived = f'<p class="caption">Arithmetic: {escape(r["derived"])}</p>' if r.get("derived") else ""
        items.append(
            f'<li id="{escape(data["id"])}-source-{escape(claim_id)}"><p class="plate-source-title"><a href="{escape(r["url"])}">{verbatim(r["title"])}</a></p>'
            f'<p class="caption">{verbatim(r["publisher"])}, published {escape(r["published"])}.{year}</p>'
            f'<p class="caption">Boundary: {escape(r["boundary"])}</p><blockquote class="plate-quote">{verbatim(r["quote"])}</blockquote>'
            f'<p class="caption">{status} Claim {escape(claim_id)}.</p>{derived}</li>')
    return f'<ol class="plate-sources">{"".join(items)}</ol>'


def facts_html(rows, data, key):
    """What the detail panel says about the default row, before and without scripts."""
    parts = []
    if len(rows) > 1:
        lead = data["plot"].get("highlight")
        parts.append('<ul class="plate-values">' + "".join(
            f'<li><span class="plate-key{" is-on" if r.get("series") == lead and lead else ""}"></span><strong>{escape(r["display"])}</strong><span>{escape(r.get("name") or r.get("series") or "")}</span></li>' for r in rows) + "</ul>")
    for r in rows:
        if r.get("segments"):
            counted = [p for p in r["segments"] if not p.get("at") or r.get("when") in p["at"]]  # twin of plate.js: only what this stop counts
            total = sum(p.get("value") or 0 for p in counted) or 1
            parts.append('<div class="plate-segments">' + "".join(
                f'<span class="plate-seg{" is-hollow" if p.get("hollow") else ""}" style="flex-grow:{round((p.get("value") or 0) / total, 4)}"></span>' for p in counted) + "</div>")
            parts.append('<ul class="plate-values">' + "".join(
                f'<li><span class="plate-square{" is-hollow" if p.get("hollow") else ""}"></span><strong>{number(rounded(p["value"]))} {escape(r["unit"])}</strong><span>{escape(p["label"])}, {escape(p.get("word") or ("modeled" if p.get("hollow") else "measured"))}</span></li>' for p in counted if p.get("value") is not None) + "</ul>")
            break
    for a in data.get("also") or []:
        if not a.get("at") or a["at"] == key:
            parts.append(f'<p class="caption">{escape(a["label"])}: {escape(a["display"])}</p>')
    # Twin of plate.js factNodes.
    notes = [*(f"Assumption: {t}" for t in dict.fromkeys(r["note"] for r in rows if r.get("note"))),
             *(f"Equation: {t}" for t in dict.fromkeys(r["equation"] for r in rows if r.get("equation"))),
             *dict.fromkeys(r["detail"] for r in rows if r.get("detail")), *(data.get("details") or [])]
    if notes:
        word = "How this is modeled" if any(r.get("hollow") or r.get("note") or r.get("equation") for r in rows) else "About this figure"
        parts.append(f'<details class="plate-more"><summary>{word}</summary>' + "".join(f'<p class="caption">{escape(t)}</p>' for t in notes) + "</details>")
    return "".join(parts)


def also_items(ctx, items, at):
    out = []
    for item in items:
        name = item.get("label") or "?"
        claim = usable(ctx, f"also {name}", item.get("claim"))
        text = value_text(claim.get("value"), claim.get("low"), claim.get("high")) or (item.get("gap") or NO_MEASUREMENT)
        unit = (ctx.plot.get("units") or {}).get(claim.get("unit"), claim.get("unit") or "")
        display = fill(ctx.plate, "also", item.get("say") or "{display}", {"display": f"{text} {unit}".strip(), "text": text, "unit": unit, "year": claim.get("year") or ""})
        limit = limit_of(ctx, f"also {name}", claim)
        if claim["status"] == "partly":
            display += f" Limit: {limit}"
        out.append(compact({"at": at, "label": own_text(ctx.plate, "also label", name), "display": display, "claim": claim["id"]}))
        ctx.plate_cites.add(claim["id"])
    return out


def foot_html(ctx, context):
    parts = []
    for item in ctx.defn.get("foot") or []:
        text = fill(ctx.plate, "foot", item["text"], context) if item.get("text") else ""
        link = f' <a href="{escape(item["href"])}">{escape(own_text(ctx.plate, "foot", item.get("link") or item["href"]))}</a>' if item.get("href") else ""
        parts.append(f'<p class="caption plate-foot">{escape(text)}{link}</p>')
    return "".join(parts)


def readout_html(head):
    """The big number stands alone; its range sits in small type beside it."""
    big, paren, rest = (head["text"] or "").partition(" (")
    small = f'({rest} {head["unit"]}'.strip() if paren else (head["unit"] if head["text"] else head["display"])
    return f'<p class="readout{" is-long" if len(big) >= 9 else ""}"><span class="readout-value">{escape(big)}</span> <span class="readout-unit">{escape(small)}</span></p>'


def plate_block(defn, claims, models=None):
    """Returns the HTML that goes between a plate's markers, and a short summary for bench rows."""
    plate = defn.get("id")
    if not (isinstance(plate, str) and vp.SLUG.fullmatch(plate)):
        raise BuildError(f"plate id must be kebab case: {plate!r}")
    kind = (defn.get("plot") or {}).get("type")
    if kind not in PLOT_KINDS:
        raise BuildError(f"plate {plate}: plot.type must be one of {sorted(PLOT_KINDS)}")
    if not defn.get("title"):
        raise BuildError(f"plate {plate}: needs a title, written as the finding at the default setting")
    if (defn["plot"].get("count")):
        defn = {**defn, "controls": [*(defn.get("controls") or []), {"type": "segmented", "name": f"{plate}-plot", "label": "View", "default": "ruler", "auto": True,
                                                                     "options": [{"value": "ruler", "label": "Ruler"}, {"value": "count", "label": "Count"}]}]}
    for control in defn.get("controls") or []:
        check_control(plate, control)
    if kind == "bars" and defn.get("by"):
        raise BuildError(f"plate {plate}: bars cannot change rows with a setting; a ladder keeps a missing row's place")
    if kind in ("instrument", "matrix") and defn.get("by"):
        raise BuildError(f"plate {plate}: a {kind} does not take a by control")
    ctx = SimpleNamespace(defn=defn, plate=plate, plot=defn["plot"], claims=claims, env={}, sources={}, cites={}, reader=set(), stands={}, stops=stops_of(defn), plate_cites=set(defn.get("cites") or []))
    plate_env(ctx, models or {})
    rows = matrix_rows(ctx) if kind == "matrix" else expand_rows(ctx)
    plot = finish_plot(ctx, rows)
    if any(spec.get("pair") for spec in defn.get("rows") or []):
        plot["pair_names"] = [m["name"] for m in next(s for s in defn["rows"] if s.get("pair"))["pair"]]
    stop = default_stop(defn)
    now = [r for r in rows if not r.get("when") or r["when"] == stop]
    keys = list(dict.fromkeys(r["key"] for r in rows))
    if defn.get("default") is not None:
        default = str(defn["default"])
    elif kind in LINE_KINDS and plot.get("select") != "point":
        lead = [r for r in now if r.get("series") == plot.get("highlight")] or now
        default = str(max(r["x"] for r in lead))
    else:
        default = now[0]["key"]
    if default not in keys or not any(r["key"] == default for r in now):
        raise BuildError(f"plate {plate}: default {default!r} has no row at the default setting")

    specs = {s.get("id"): s for s in defn["rows"] if s.get("id")}
    view = ClaimView(claims, defn["plot"].get("units"))
    fields_spec = {name: ({"formula": spec} if isinstance(spec, str) else spec) for name, spec in (defn.get("fields") or {}).items()}
    for r in rows:
        values = plate_field_values(ctx, r, fields_spec)
        if values:
            r["fields"] = values
        spec = specs.get(r["key"], {})
        if spec.get("cols"):
            r["cols"] = {name: own_text(plate, "cols", text) for name, text in spec["cols"].items()}
        if plot.get("panels") and r.get("panel"):
            r["name"] = next(p["label"] for p in plot["panels"] if p["id"] == r["panel"])
    readings = {}
    env_words = {name: Branch(value) if isinstance(value, dict) else Fig(value) if isinstance(value, (int, float)) else value if value is not None else "" for name, value in ctx.env.items()}
    for control in defn.get("controls") or []:
        env_words[control["name"]] = control_words(control)
    band_at = {(scope.get("id"), x): (lo, hi) for scope in [plot, *(plot.get("panels") or [])] for x, lo, hi, _ in scope.get("band") or []}

    def fields_of(r):
        low, high = band_at.get((r.get("panel"), r.get("x")), ("", ""))
        return {**row_fields(defn, r, specs.get(r["key"], {}).get("boundary"), claims), **(r.get("fields") or {}),
                "band_low": number(low) if low != "" else "", "band_high": number(high) if high != "" else ""}

    by_key = {}
    for r in rows:
        if r["key"] not in by_key and (not r.get("when") or r["when"] == stop):
            by_key[r["key"]] = fields_of(r)
    words_template = defn.get("reading_words") or "{label}, {column}: {display}."
    default_template = {"lines": "{series}: {display}, {year}.", "multiples": "{series}: {display}, {year}.", "matrix": "{label}, {column}: {display}, {year}. {boundary} {evidence}"}.get(kind) or "{label}: {display}, {year}. {boundary} {evidence}"
    live_names = set(fields_spec) | set(ctx.sources) | {c["name"] for c in defn.get("controls") or []} | {s["id"] for s in defn["rows"] if s.get("formula") is not None and s.get("id")}
    for r in rows:
        fields = fields_of(r)
        if r.get("words"):
            r["reading"] = fill(plate, "reading", words_template, fields)
            continue
        context = {**fields, **env_words, **by_key, "c": view}  # a setting named boundary outranks the boundary sentence
        template = defn.get("reading") if defn.get("reading") and (kind != "instrument" or r.get("f")) else default_template
        text = tidy(fill(plate, "reading", template, context))
        if r.get("limit") and r["limit"] not in text:
            text += f" Limit: {r['limit']}"
        r["reading"] = text
        if r.get("f") or fields_spec or template_names(template) & live_names:
            own = {name: Live(name) for name in live_names}
            if r.get("f"):
                own.update({name: Live(name) for name in ("display", "text", "value", "low", "high")})
            r["t"] = tidy(fill(plate, "reading", template, {**context, **own}))
    lead_key = default if default in by_key else next(iter(by_key))
    lead = by_key[lead_key]
    context = {**lead, **env_words, **{k: v for k, v in by_key.items() if k not in lead}, "c": view}
    if defn.get("reading_group"):
        slugs = [p["id"] for p in plot.get("panels") or []] or [m.get("id") for s in defn["rows"] for m in s.get("pair") or []]
        gap = defn.get("gap") or NO_MEASUREMENT
        group_of = lambda r: "|".join([r["key"], r.get("series") or "" if plot.get("panels") else "", r.get("when") or ""])
        groups = {}
        for r in rows:
            groups.setdefault(group_of(r), []).append(r)
        for name, members in groups.items():
            fields = {**{s: gap for s in slugs}, **row_fields(defn, members[0], None, claims), **{(r.get("slug") or r.get("panel")): r["text"] or gap for r in members}, "c": view}
            own = (defn.get("reading_for") or {}).get(members[0].get("series"))  # a sentence only one series can carry
            text = tidy(fill(plate, "reading_group", own or defn["reading_group"], fields))
            for r in members:
                if r.get("limit") and r["limit"] not in text:
                    text += f" Limit: {r['limit']}"
            readings[name] = text
        for r in rows:
            r.pop("reading", None)
    for r in rows:
        r.pop("slug", None)
    tail = ""
    if kind in LINE_KINDS:
        kinds = sorted({EVIDENCE_LABEL.get(claims[r["claim"]]["source"].get("kind"), "Source") for r in rows if r.get("claim")})
        checked = "partly verified" if any(claims[r["claim"]]["status"] == "partly" for r in rows if r.get("claim")) else "verified against the source"
        tail = fill(plate, "tail", defn["tail"], context) if defn.get("tail") else " ".join(filter(None, [sentence(defn.get("boundary")), f"{' and '.join(kinds)}, {checked}."]))
    elif defn.get("tail"):
        tail = fill(plate, "tail", defn["tail"], context)

    also = also_items(ctx, defn.get("also") or [], None)
    for spec in defn["rows"]:
        also += also_items(ctx, spec.get("also") or [], spec.get("id"))
    title = fill(plate, "title", defn["title"], context)
    paragraphs = "".join(f"<p>{escape(fill(plate, 'text', t, context))}</p>" for t in defn.get("text") or [])
    subtitle = f'<p class="caption">{escape(fill(plate, "subtitle", defn["subtitle"], context))}</p>' if defn.get("subtitle") else ""
    foot = foot_html(ctx, context)
    ctx.plate_cites |= view.used
    receipts = {}

    def receipt_of(claim_id, row=None):
        claim = claims.get(claim_id)
        if claim is None:
            raise BuildError(f"plate {plate}: names unknown claim {claim_id}")
        source = claim["source"]
        limit = (row or {}).get("limit") if (row or {}).get("claim") == claim_id else limit_of(ctx, claim_id, claim)
        series = (row or {}).get("series") if (row or {}).get("claim") == claim_id and (row or {}).get("x") is not None else None
        hollow = (row or {}).get("hollow") if (row or {}).get("claim") == claim_id else (source.get("kind") == "model" or None)
        return compact({
            "short": f'{series}: {short_name(source["publisher"])}' if series else short_name(source["publisher"]), "title": source["title"], "publisher": source["publisher"], "url": source["url"],
            "published": us_date(source.get("published")), "year": claim.get("year"), "boundary": claim["boundary"], "quote": claim["quote"],
            "derived": claim.get("derived"), "status": claim["status"], "limit": limit if claim["status"] == "partly" else None, "hollow": hollow,
        })
    for r in rows:
        if r.get("claim"):
            receipts.setdefault(r["claim"], receipt_of(r["claim"], r))
        for claim_id in r.get("cites") or []:
            receipts.setdefault(claim_id, receipt_of(claim_id))
    for claim_id in sorted(ctx.plate_cites):
        receipts.setdefault(claim_id, receipt_of(claim_id))
    block_rows = [compact(r) for r in rows]
    data = compact({
        "id": plate, "plot": plot, "by": defn.get("by"), "default": default, "not_counted": own_text(plate, "not_counted", defn.get("not_counted") or NOT_COUNTED),
        "tail": tail or None, "rows": block_rows, "receipts": receipts, "env": {k: v for k, v in ctx.env.items() if k in ctx.sources} or None, "sources": ctx.sources or None, "stands": ctx.stands or None,
        "fields": {name: [spec["formula"], spec.get("digits", 3)] for name, spec in fields_spec.items()} or None, "setting": setting_data(defn) or None, "readings": readings or None,
        "also": also or None, "cites": sorted(ctx.plate_cites) or None, "details": [own_text(plate, "details", t) for t in defn.get("details") or []] or None,
    })
    alt = {**data, "alt": f"{title} The table holds every value.", "stops_now": {c["name"]: control_default(c) for c in defn.get("controls") or []}}
    now_full = [r for r in rows if not r.get("when") or r["when"] == stop]
    if kind in RULER_KINDS:
        plot_html = ladder_html(alt, now_full)
    elif kind == "lines":
        plot_html = lines_svg(alt, now_full)
    elif kind == "multiples":
        plot_html = multiples_svg(alt, now_full)
    elif kind == "instrument":
        plot_html = instrument_html(alt, now_full, defn)
    else:
        plot_html = matrix_html(alt, defn)

    default_rows = [r for r in now_full if r["key"] == default]
    highlight = plot.get("highlight")
    head = next((r for r in default_rows if r.get("series") == highlight), default_rows[0])
    panelled = plot.get("panels") and plot.get("highlight_by")
    focus = [r for r in default_rows if r.get("series") == highlight] if panelled else default_rows
    speak = [r for r in focus if r.get("series") == highlight] if plot.get("highlight_by") else focus
    group_reading = readings.get("|".join([default, (highlight or "") if plot.get("panels") else "", stop or ""]))
    reading = group_reading or " ".join(r["reading"] for r in speak if r.get("reading"))
    reading += f" {tail}" if tail else ""
    log_note = '<p class="caption">Each mark is ten times the last.</p>' if plot.get("scale") == "log" and kind in RULER_KINDS else ""
    eyebrow = f'<p class="eyebrow">{escape(own_text(plate, "eyebrow", defn["eyebrow"]))}</p>' if defn.get("eyebrow") else ""
    views = "".join(f'<label><input type="radio" name="{plate}-view" value="{v.lower()}"{" checked" if v == "Reading" else ""}><span>{v}</span></label>' for v in ("Reading", "Sources", "Table"))
    chips = "".join(
        f'<button type="button" class="receipt{" is-hollow" if r.get("hollow") else ""}" data-claim="{escape(claim_id)}" aria-expanded="false" aria-controls="{plate}-receipt">'
        f'<span class="receipt-mark"></span><span>{verbatim(r["short"])}</span></button>' for claim_id, r in receipts.items())
    frac = head.get("frac")
    spot = f' style="--at:{frac}"' if frac is not None else ""
    needs_needle = kind == "ladder" and frac is not None or kind in LINE_KINDS and plot.get("select") != "point"
    # The Sources list holds each receipt's words once; scripts read only these.
    light_receipts = {claim_id: compact({"short": r["short"], "title": r["title"], "status": r["status"], "limit": r.get("limit")}) for claim_id, r in receipts.items()}
    block = "\n".join([
        f'<figure class="plate{" plate-fit" if defn.get("fit") else ""}" id="{plate}" data-plate="{plate}" data-kind="{kind}" aria-labelledby="{plate}-title">',
        f'<div class="plate-claim">{eyebrow}<h3 class="plate-title" id="{plate}-title">{escape(title)}</h3>'
        f'{subtitle}{log_note}{paragraphs}{controls_html(defn)}{legend_html({**data, "plot": plot})}{foot}</div>',
        f'<div class="plate-plot{"" if needs_needle else " no-needle"}"{spot}>{plot_html}</div>',
        '<div class="plate-detail">',
        f'<fieldset class="segmented plate-views" data-js hidden><legend class="sr-only">Detail view</legend>{views}</fieldset>',
        f'<div class="plate-view" data-view="reading">{readout_html(head)}<p class="reading">{escape(reading)}</p>'
        f'<div class="plate-facts">{facts_html(focus, data, default)}</div>'
        '<div class="plate-actions" data-js hidden><button type="button" class="button button-secondary" data-copy>Copy Reading</button>'
        '<button type="button" class="button button-secondary" data-reset>Reset</button><p class="caption plate-status" role="status"></p></div>'
        f'<div class="plate-chips" data-js hidden>{chips}</div><div class="plate-receipt" id="{plate}-receipt" hidden></div>{setting_line(defn)}</div>',
        f'<div class="plate-view" data-view="sources"><p class="label">Sources</p>{sources_html(data)}</div>',
        f'<div class="plate-view" data-view="table"><p class="label">Table</p>{table_html(defn, data)}</div>',
        '<output class="sr-only" aria-live="polite" aria-atomic="true"></output>',
        '</div>',
        '</figure>',
        f'<script type="application/json" id="plate-data-{plate}">{inline_json({**data, "receipts": light_receipts})}</script>',
    ])
    return block, {"id": plate, "reading": reading, "readout": head["text"] or "", "unit": head["unit"], "frac": frac, "title": title}


def inject(page, plate, block):
    start, end = f"<!-- plate:{plate} -->", f"<!-- /plate:{plate} -->"
    if page.count(start) != 1 or page.count(end) != 1 or page.index(end) < page.index(start):
        raise BuildError(f"plate {plate}: its page must hold one {start} and one {end}, in that order")
    return f"{page[:page.index(start) + len(start)]}\n{block}\n{page[page.index(end):]}"


def bench_html(summary, page, target):
    """A ruled row on another page: the plate's default Reading, its figure on a thin ruler, and a link to it."""
    href = f'{posixpath.relpath(target, posixpath.dirname(page) or ".")}#{summary["id"]}'
    ruler = f'<span class="bench-ruler" style="--x:{summary["frac"]}"></span>' if summary["frac"] is not None else ""
    figure = f'<span class="bench-value">{escape(summary["readout"])}</span> <span class="bench-unit">{escape(summary["unit"])}</span>' if summary["readout"] else ""
    return (f'<div class="bench-row"><div class="bench-figure">{figure}{ruler}</div><div class="bench-body"><p class="bench-reading">{escape(summary["reading"])}</p>'
            f'<p class="bench-link"><a href="{escape(href)}">Open the plate</a></p></div></div>')


def poured_text(claim, field):
    text = value_text(claim.get("value"), claim.get("low"), claim.get("high")) or ""
    unit = claim.get("unit") or ""
    return {"text": text, "unit": unit, "year": str(claim.get("year") or ""), "limit": claim.get("limit") or "", "source": short_name(claim["source"]["publisher"]), "display": f"{text} {unit}".strip()}.get(field)


def pour_figures(page, rel, claims):
    """Fills every element with data-pour from its claim, so a figure in a page's own text cannot drift from it."""
    def one(match):
        tag, attrs, claim_id = match["tag"], match["attrs"], match["id"]
        if claim_id not in claims:
            raise BuildError(f"{rel}: data-pour names unknown claim {claim_id}")
        claim = claims[claim_id]
        field = (re.search(r'data-field="([a-z]+)"', attrs) or [None, "display"])[1]
        text = poured_text(claim, field)
        if text is None:
            raise BuildError(f"{rel}: data-pour {claim_id} has an unknown data-field {field}")
        if field == "limit" and not text:
            raise BuildError(f"{rel}: data-pour {claim_id} has no public limit to print")
        if tag == "a" and field == "source":
            url = escape(claim["source"]["url"])
            attrs = re.sub(r'\shref="[^"]*"', "", attrs) + f' href="{url}"'
        return f"<{tag}{attrs}>{escape(text)}</{tag}>"

    filled = POURABLE.sub(one, page)
    for claim_id in set(vp.POURED.findall(filled)):
        if claims[claim_id].get("status") == "partly" and f'data-pour="{claim_id}" data-field="limit"' not in filled:
            raise BuildError(f'{rel}: data-pour {claim_id} is partly verified, so its limit must be on the page: <span data-pour="{claim_id}" data-field="limit"></span>')
    return filled


def load_claims(site):
    claims = {}
    for path in sorted((Path(site) / "data" / "claims").glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        for claim in data.get("claims") or []:
            claims[claim["id"]] = claim
    return claims


def page_name(page):
    return re.sub(r"^(\./)?(site/)?", "", str(page).replace("\\", "/"))


def build(site=vp.SITE, page=None):
    """Builds every plate, or one page's, then writes the pages that changed. Nothing is written if any plate fails."""
    site = Path(site)
    claims = load_claims(site)
    only = page_name(page) if page else None
    if only and not (site / only).is_file():
        raise BuildError(f"no page at {only}")
    definitions, models = {}, {}
    for path in sorted((site / "data" / "plates").glob("*.json")):
        rel = f"data/plates/{path.name}"
        try:
            defn = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            if only:
                continue  # another builder's plate, mid-edit
            raise BuildError(f"{rel}: not valid JSON: {error}") from error
        definitions[path.stem] = defn
        if defn.get("model") and defn["model"] not in models:
            models[defn["model"]] = vp.load_model(defn["model"], site)
    pages, names, built = {}, {}, 0
    summaries = {}
    for stem, defn in definitions.items():
        rel = f"data/plates/{stem}.json"
        if only and page_name(defn.get("page")) != only:
            continue
        if defn.get("tier") != "T0" or defn.get("schema") != 1:
            raise BuildError(f"{rel}: tier must be T0 and schema 1")
        if defn.get("id") != stem:
            raise BuildError(f"{rel}: id must match the file name")
        target = site / str(defn.get("page"))
        if not target.is_file():
            raise BuildError(f"{rel}: no page at {defn.get('page')}")
        # One address bar: settings and selections on a page need distinct names.
        for name in [defn["id"], *(c.get("name") for c in defn.get("controls") or [])]:
            if names.setdefault((target, name), defn["id"]) != defn["id"]:
                raise BuildError(f"{rel}: the name {name} is already used by plate {names[(target, name)]} on that page")
        if target not in pages:
            pages[target] = target.read_bytes().decode("utf-8")
        block, summaries[stem] = plate_block(defn, claims, models)
        pages[target] = inject(pages[target], defn["id"], block)
        built += 1
    extras = [site / only] if only else sorted(site.rglob("*.html"))
    for target in extras:
        text = pages.get(target) or target.read_bytes().decode("utf-8")
        if "data-pour=" not in text and "<!-- bench:" not in text:
            continue
        rel = target.relative_to(site).as_posix()
        for match in list(BENCH.finditer(text)):
            stem = match["id"]
            if stem not in definitions:
                raise BuildError(f"{rel}: a bench row names plate {stem}, which has no definition")
            if stem not in summaries:
                summaries[stem] = plate_block(definitions[stem], claims, models)[1]
            start, end = f"<!-- bench:{stem} -->", f"<!-- /bench:{stem} -->"
            if text.count(start) != 1 or text.count(end) != 1:
                raise BuildError(f"{rel}: a bench row needs one {start} and one {end}")
            text = f'{text[:text.index(start) + len(start)]}\n{bench_html(summaries[stem], rel, definitions[stem]["page"])}\n{text[text.index(end):]}'
        pages[target] = pour_figures(text, rel, claims)
    written = []
    for target, text in pages.items():
        if target.read_bytes().decode("utf-8") != text:
            target.write_bytes(text.encode("utf-8"))
            written.append(target.relative_to(site).as_posix())
    return {"plates": built, "pages_written": written}


# Self-test ------------------------------------------------------------------------------------------

def sample_claim(claim_id, value=0.24, status="verified", **extra):
    return {"id": claim_id, "entity": "Example", "metric": "energy per use", "value": value, "low": None, "high": None, "unit": "Wh", "year": 2025,
            "boundary": "Counted: the data center. Not counted: the network.",
            "source": {"title": "Example \u2014 a report", "publisher": "Example Agency (authors)", "url": "https://example.org/files/users/report.pdf",
                       "published": "2025-08-21", "kind": "agency"},
            "quote": "The figure \u2014 as stated -- is <b>0.24</b> Wh", "derived": None, "status": status, "note": "Adversarial check: fine.", **extra}


def sample_plate(**extra):
    return {"schema": 1, "tier": "T0", "id": "sample", "page": "page.html", "eyebrow": "Energy per use", "title": "{label} used {display} in {year}",
            "plot": {"type": "ladder", "scale": "log"}, "default": "a",
            "rows": [{"id": "a", "label": "Row A", "claim": "s-1"}, {"id": "b", "label": "Row B", "claim": "s-2", "limit": "The B figure is an old estimate."},
                     {"id": "c", "label": "Row C", "claim": "s-3"}], **extra}


def sample_site(root, plate=None, claims=None):
    """A small site tree: one claims file, one plate, one page with markers. Returns its root."""
    root = Path(root)
    (root / "data" / "claims").mkdir(parents=True, exist_ok=True)
    (root / "data" / "plates").mkdir(parents=True, exist_ok=True)
    claims = claims or [sample_claim("s-1"), sample_claim("s-2", 12, "partly"), sample_claim("s-3", None)]
    (root / "data" / "claims" / "sample.json").write_text(json.dumps({"schema": 1, "tier": "T0", "cluster": "sample", "claims": claims}), encoding="utf-8")
    plate = plate or sample_plate()
    (root / "data" / "plates" / f"{plate['id']}.json").write_text(json.dumps(plate), encoding="utf-8")
    (root / "page.html").write_text(f"<main>before\n<!-- plate:{plate['id']} -->\nold\n<!-- /plate:{plate['id']} -->\nafter</main>", encoding="utf-8")
    return root


def self_test():
    vp.self_test()
    assert number(0.24) == "0.24" and number(1234.5) == "1,234.5" and number(3600.0) == "3,600" and number(0.00001) == "0.00001"
    assert value_text(None, 2, 9) == "2 to 9" and value_text(5, 2, 9) == "5 (2 to 9)" and value_text(None, 20, None) == "at least 20" and value_text(None, None, None) is None
    assert us_date("2025-08-21") == "08/21/2025" and us_date("2021-06") == "06/2021"
    assert nice_domain([3, 87]) == [0, 100] and nice_ticks(0, 100) == [0, 20, 40, 60, 80, 100] and tick_text(20000, 40000) == "20K" and tick_text(0.25, 1) == "0.25"
    assert '</script' not in inline_json({"a": "</script> -- x"}) and json.loads(inline_json({"a": "</script> -- x"}))["a"] == "</script> -- x"
    with tempfile.TemporaryDirectory() as tmp:
        site = sample_site(Path(tmp) / "site")
        first = build(site)
        assert first == {"plates": 1, "pages_written": ["page.html"]}, first
        page = (site / "page.html").read_text(encoding="utf-8")
        assert build(site)["pages_written"] == [], "a second run must change nothing"
        assert (site / "page.html").read_text(encoding="utf-8") == page
        assert "The B figure is an old estimate." in page and NO_MEASUREMENT in page and "Row A used 0.24 Wh in 2025" in page
        errors = []
        vp.check_text("page", page, errors)
        assert not errors and not vp.EM_DASH.search(page), errors
        assert vp.check_plate_blocks("page", page, load_claims(site), errors) == 1 and not errors, errors
        evidence = Path(tmp) / "evidence"
        evidence.mkdir()
        cluster = {"cluster": "x", "claims": [sample_claim("x-1"), sample_claim("x-2", status="unverified")]}
        (evidence / "x.json").write_text(json.dumps(cluster), encoding="utf-8")
        (evidence / "x-jev.json").write_text("[]", encoding="utf-8")
        out = Path(tmp) / "out"
        assert export_claims(evidence, out) == {"x": 1}
        shipped = json.loads((out / "x.json").read_text(encoding="utf-8"))
        assert shipped["tier"] == "T0" and shipped["schema"] == 1 and "note" not in shipped["claims"][0] and "\u2014" in shipped["claims"][0]["quote"]
    return True


def main():
    parser = argparse.ArgumentParser(description="Build plates into pages, and export checked claims.")
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--export-claims", nargs="*", metavar="CLUSTER", help="copy verified and partly claims for shipping")
    parser.add_argument("--evidence", default=EVIDENCE)
    parser.add_argument("--out", default=vp.SITE / "data" / "claims")
    parser.add_argument("--site", default=vp.SITE)
    parser.add_argument("--page", help="build only this page, as its path under site/ (ai/index.html)")
    args = parser.parse_args()
    try:
        if args.self_test:
            self_test()
            print(json.dumps({"self_test": "passed"}))
        elif args.export_claims is not None:
            print(json.dumps({"exported": export_claims(args.evidence, args.out, args.export_claims or None)}))
        else:
            print(json.dumps(build(args.site, args.page)))
    except BuildError as error:
        print(f"FAILED: {error}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
