"""Builds the county drawing that the Land and Climate plates share, and the record list by state, from the Census 1:20,000,000 county file and
site/data/projects.json.

    python -B scripts/build_project_map.py           (writes)        python -B scripts/build_project_map.py --check   (exit 1 if the page or the SVG is stale)

Reads   work/site-refresh/n6/cb_2024_us_county_20m.zip (local; sha256 recorded in projects.json), site/data/projects.json
Writes  site/data-centers/index.html between <!-- map:sprite --> (the first thing in <main>) and between <!-- records:projects -->, and
        site/assets/img/maps/projects.svg, the Land drawing as a file that stands alone.
Sprite  <svg class="county-sprite"> holds one <path id="co-FIPS"> per county drawn and one <path id="st-xx"> per state outline. A plate's map shows them with
        <use href="#co-FIPS">, so one copy serves both plates and draws in a hidden tab panel too. Beside it, <script id="county-layout"> gives
        scripts/build_plates.py the rest: the viewBox, each state name's place, and each named county's tile (its key, as dc-climate-counties keys its rows,
        its centre, and where its leader starts when it has one). build_plates.py draws each plate's map from these, so its figures come from claims.
        The record list by state is the drawing's text, one entry per record, each MW figure a claim mark (pj-, scripts/project_claims.py), and each entry
        names its counties in data-fips so the map can mark them. No script that runs, no font, image, or external reference.
Draws   WA, OR, ID and MT in full, and the NV and CA counties whose largest ring's mean latitude is at or north of 38.0 N, plus any county a record names.
        Each state's outline is the dissolved edge of its counties (shared edges cancel). One tile for each county a record names, centred on that county's
        interior point (the point farthest from its edge, found on the Census polygon). A tile is 20 units, which the page scales to 20 CSS px at any width;
        the build pushes tiles apart on a 42-unit footprint (the 1280 case, 39 units, plus a 3-unit gap), and a tile that moved more than 8 units, or whose
        centre left its county, keeps a 1-unit line back from the interior point.
No coordinate is guessed: nothing is placed except at a Census county's interior point, or pushed from it with a line back. Standard library only.
"""
import argparse
import gzip
import html
import json
import math
import re
import struct
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import project_claims as pc  # noqa: E402

ROOT = HERE.parent
COUNTIES_ZIP = ROOT / "work" / "site-refresh" / "n6" / "cb_2024_us_county_20m.zip"
PAGE = ROOT / "site" / "data-centers" / "index.html"
SVG_OUT = ROOT / "site" / "assets" / "img" / "maps" / "projects.svg"
STATE_NAMES, KIND_SAY = pc.STATE_NAMES, pc.KIND_SAY


# The Census county file: a zipped shapefile, polygons only (shape type 5). Every ring is kept; outer and hole rings need no telling apart here.
def _dbf(raw):
    nrec, hlen, rlen = struct.unpack("<IHH", raw[4:12])
    fields, off = [], 32
    while raw[off] != 0x0D:
        fields.append((raw[off:off + 11].split(b"\x00")[0].decode("ascii"), raw[off + 16]))
        off += 32
    out = []
    for i in range(nrec):
        rec, pos, row = raw[hlen + i * rlen: hlen + (i + 1) * rlen], 1, {}
        for name, ln in fields:
            row[name] = rec[pos:pos + ln].decode("utf-8", "replace").strip()
            pos += ln
        out.append(row)
    return out


def _shp(raw):
    pos, out = 100, []
    while pos < len(raw):
        _num, words = struct.unpack(">ii", raw[pos:pos + 8])
        body = raw[pos + 8: pos + 8 + words * 2]
        pos += 8 + words * 2
        stype = struct.unpack("<i", body[:4])[0]
        if stype == 0:
            out.append([])
            continue
        if stype != 5:
            raise ValueError(f"shape type {stype} is not a polygon")
        nparts, npts = struct.unpack("<ii", body[36:44])
        parts = list(struct.unpack(f"<{nparts}i", body[44:44 + 4 * nparts])) + [npts]
        flat = struct.unpack(f"<{2 * npts}d", body[44 + 4 * nparts: 44 + 4 * nparts + 16 * npts])
        pts = [(flat[2 * i], flat[2 * i + 1]) for i in range(npts)]
        out.append([pts[parts[i]:parts[i + 1]] for i in range(nparts)])
    return out


def read_counties(zip_path):
    z = zipfile.ZipFile(zip_path)
    base = [n for n in z.namelist() if n.endswith(".shp")][0][:-4]
    rows, shapes = _dbf(z.read(base + ".dbf")), _shp(z.read(base + ".shp"))
    if len(rows) != len(shapes):
        raise ValueError("dbf and shp record counts differ")
    return [{"statefp": r["STATEFP"], "fips": r["STATEFP"] + r["COUNTYFP"], "name": r["NAME"], "rings": rings} for r, rings in zip(rows, shapes)]


class Albers:
    """Albers equal-area conic on a sphere (R = 6371.0088 km). Returns kilometres east and north of the origin."""

    def __init__(self, lat0, lon0, lat1, lat2, radius=6371.0088):
        r = math.radians
        self.R, self.lon0 = radius, r(lon0)
        p0, p1, p2 = r(lat0), r(lat1), r(lat2)
        self.n = (math.sin(p1) + math.sin(p2)) / 2
        self.C = math.cos(p1) ** 2 + 2 * self.n * math.sin(p1)
        self.rho0 = radius * math.sqrt(self.C - 2 * self.n * math.sin(p0)) / self.n

    def __call__(self, lon, lat):
        lam, phi = math.radians(lon), math.radians(lat)
        rho = self.R * math.sqrt(self.C - 2 * self.n * math.sin(phi)) / self.n
        th = self.n * (lam - self.lon0)
        return rho * math.sin(th), self.rho0 - rho * math.cos(th)


ALBERS = Albers(40.0, -114.5, 38.0, 46.0)

STATES = {"53": "WA", "41": "OR", "16": "ID", "30": "MT", "32": "NV", "06": "CA"}
PARTIAL = {"NV", "CA"}
LAT_CUT = 38.0
W = 1200
PAD = 8
TOL_STATE, TOL_COUNTY = 1.5, 1.2
TILE, FOOT, MOVED = 20, 42, 8  # see the docstring: drawn size, the footprint tiles are pushed apart on, and the move past which a tile keeps a line back
SPRITE_GZ = 20 * 1024  # the sprite rides on every load of the page
FILE_GZ = 24 * 1024


def dp(points, tol):
    """Douglas-Peucker on a polyline (iterative)."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        (x1, y1), (x2, y2) = points[a], points[b]
        dx, dy = x2 - x1, y2 - y1
        norm = math.hypot(dx, dy) or 1e-9
        best, idx = -1.0, None
        for i in range(a + 1, b):
            d = abs(dy * (points[i][0] - x1) - dx * (points[i][1] - y1)) / norm
            if d > best:
                best, idx = d, i
        if best > tol and idx is not None:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(points, keep) if k]


def simplify(rings, tol, min_extent=2.5):
    """Each ring by Douglas-Peucker, rounded to a tenth of a unit, open (the path's z closes it). A ring under min_extent both ways is left out."""
    out = []
    for ring in rings:
        xs, ys = [p[0] for p in ring], [p[1] for p in ring]
        if max(xs) - min(xs) < min_extent and max(ys) - min(ys) < min_extent:
            continue
        far = max(range(len(ring)), key=lambda i: (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2)  # a closed ring is split at its farthest point
        s = dp(ring[:far + 1], tol)[:-1] + dp(ring[far:], tol)
        if len(s) >= 4:
            out.append([(round(x, 1), round(y, 1)) for x, y in s[:-1]])
    return out


def d_of(rings):
    """A path: each ring's first point, then relative steps of a tenth."""
    out = []
    for pts in rings:
        d = f"M{pts[0][0]:g},{pts[0][1]:g}"
        for (px, py), (x, y) in zip(pts, pts[1:]):
            d += f"l{round(x - px, 1):g},{round(y - py, 1):g}"
        out.append(d + "z")
    return "".join(out)


def closed(ring):
    return ring + ring[:1]


def inside(pt, ring):
    x, y = pt
    c = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def edge_dist(pt, ring):
    x, y = pt
    best = 1e18
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        dx, dy = x2 - x1, y2 - y1
        t = 0 if dx == dy == 0 else max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
        best = min(best, math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)))
    return best


def interior_point(rings):
    """The point of the largest ring that is farthest from its edge (a grid search with one refinement)."""
    ring = max(rings, key=lambda r: (max(p[0] for p in r) - min(p[0] for p in r)) * (max(p[1] for p in r) - min(p[1] for p in r)))
    xs, ys = [p[0] for p in ring], [p[1] for p in ring]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    best, bp = -1.0, (sum(xs) / len(xs), sum(ys) / len(ys))
    for span, n, cx, cy in ((None, 28, (x0 + x1) / 2, (y0 + y1) / 2), (1, 14, None, None)):
        if span is None:
            gx = [x0 + (x1 - x0) * (i + 0.5) / n for i in range(n)]
            gy = [y0 + (y1 - y0) * (j + 0.5) / n for j in range(n)]
        else:
            sx, sy = (x1 - x0) / 14, (y1 - y0) / 14
            gx = [bp[0] + sx * (i - n / 2) / (n / 2) for i in range(n)]
            gy = [bp[1] + sy * (j - n / 2) / (n / 2) for j in range(n)]
        for x in gx:
            for y in gy:
                if inside((x, y), ring):
                    d = edge_dist((x, y), ring)
                    if d > best:
                        best, bp = d, (x, y)
    return bp


def dissolve(county_rings):
    """The outer edge of a set of counties: shared edges (same two points, opposite directions) cancel; the rest is chained into rings of (lon, lat)."""
    key = lambda p: (round(p[0] * 1e5), round(p[1] * 1e5))  # noqa: E731
    coords, edges = {}, {}
    for rings in county_rings:
        for ring in rings:
            for a, b in zip(ring, ring[1:]):
                ka, kb = key(a), key(b)
                coords[ka], coords[kb] = a, b
                if ka != kb:
                    edges[(ka, kb)] = edges.get((ka, kb), 0) + 1
    left = {}
    for (a, b), n in edges.items():
        back = edges.get((b, a), 0)
        if n > back:
            left.setdefault(a, []).extend([b] * (n - back))
    rings = []
    while left:
        start = next(iter(left))
        ring, cur = [start], start
        while True:
            nxt = left[cur].pop()
            if not left[cur]:
                del left[cur]
            ring.append(nxt)
            cur = nxt
            if cur == start or cur not in left:
                break
        if ring[0] == ring[-1] and len(ring) > 3:
            rings.append([coords[k] for k in ring])
    return rings


def overlap(a, b, foot=FOOT):
    return abs(a[0] - b[0]) < foot and abs(a[1] - b[1]) < foot


def push_apart(points, foot=FOOT, passes=200):
    """Squares of side foot centred on the points, moved until none overlap or the passes run out: each overlapping pair moves apart along the
    line between its centres, half each, as far as clears it."""
    pts = [list(p) for p in points]
    for _ in range(passes):
        moved = False
        for i, a in enumerate(pts):
            for b in pts[i + 1:]:
                if not overlap(a, b, foot):
                    continue
                dx, dy = b[0] - a[0], b[1] - a[1]
                d = math.hypot(dx, dy)
                ux, uy = (dx / d, dy / d) if d > 1e-9 else (1.0, 0.0)
                half = (foot / max(abs(ux), abs(uy)) - d + 0.01) / 2  # along this line, a square clears the other at foot on its longer axis
                a[0], a[1], b[0], b[1] = a[0] - ux * half, a[1] - uy * half, b[0] + ux * half, b[1] + uy * half
                moved = True
        if not moved:
            break
    return pts


def label_point(rings, name, tiles, size=28, n=40, room=4):
    """Where a state's name sits: the interior point (farthest from the state's edge) among the points whose name box clears every tile's footprint
    by room units, since a tile laid over the name at the plain interior point hid part of it (Oregon under Crook). With no such point, the one that
    clears most. The box is taken as 0.55 of the size a letter wide and the size tall."""
    ring = closed(max(rings, key=lambda r: (max(p[0] for p in r) - min(p[0] for p in r)) * (max(p[1] for p in r) - min(p[1] for p in r))))
    half_w, half_h = 0.55 * size * len(name) / 2, size / 2
    xs, ys = [p[0] for p in ring], [p[1] for p in ring]
    best, spot = None, None
    for i in range(n):
        for j in range(n):
            pt = (min(xs) + (max(xs) - min(xs)) * (i + 0.5) / n, min(ys) + (max(ys) - min(ys)) * (j + 0.5) / n)
            if not inside(pt, ring):
                continue
            clear = min((max(abs(pt[0] - t["x"]) - half_w, abs(pt[1] - t["y"]) - half_h) - FOOT / 2 for t in tiles), default=1e9)
            score = (clear >= room, edge_dist(pt, ring) if clear >= room else clear)
            if best is None or score > best:
                best, spot = score, pt
    return spot


def build_drawing(proj, counties):
    """The sprite's paths, by id, and the layout of the drawing: viewBox, state names, the counties drawn, and each named county's tile."""
    named = pc.named_counties(proj["projects"])
    want = {n["fips"] for n in named}
    for c in counties:
        c["state"] = STATES[c["statefp"]]
        c["pr"] = [[ALBERS(lon, lat) for lon, lat in ring] for ring in c["rings"]]
    keep = []
    for c in counties:
        if c["state"] in PARTIAL and c["fips"] not in want:
            ring = max(c["rings"], key=len)  # the mean latitude of the largest ring decides whether a county with no record is drawn
            if sum(p[1] for p in ring) / len(ring) < LAT_CUT:
                continue
        keep.append(c)
    missing = sorted(want - {c["fips"] for c in keep})
    if missing:
        sys.exit(f"counties named by a record are not in the drawn set: {missing}")
    xs = [x for c in keep for r in c["pr"] for x, _ in r]
    ys = [y for c in keep for r in c["pr"] for _, y in r]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    s = (W - 2 * PAD) / (maxx - minx)
    H = int(round((maxy - miny) * s + 2 * PAD))
    tf = lambda pt: ((pt[0] - minx) * s + PAD, (maxy - pt[1]) * s + PAD)  # noqa: E731
    paths, states, shapes, outlines = {}, [], {}, {}
    for st in STATES.values():
        outlines[st] = simplify([[tf(ALBERS(lon, lat)) for lon, lat in r] for r in dissolve([c["rings"] for c in keep if c["state"] == st])], TOL_STATE)
        paths[f"st-{st.lower()}"] = d_of(outlines[st])
    for c in sorted(keep, key=lambda c: c["fips"]):
        c["xy"] = [[tf(p) for p in ring] for ring in c["pr"]]
        shapes[c["fips"]] = simplify(c["xy"], TOL_COUNTY)
        if shapes[c["fips"]]:
            paths[f"co-{c['fips']}"] = d_of(shapes[c["fips"]])
    by_fips = {c["fips"]: c for c in keep}
    homes = [interior_point(by_fips[n["fips"]]["xy"]) for n in named]
    tiles = []
    for n, home, spot in zip(named, homes, push_apart(homes, FOOT + 0.2)):  # the margin outlasts rounding to a tenth
        x, y = round(spot[0], 1), round(spot[1], 1)
        start = [round(home[0], 1), round(home[1], 1)]
        inside_own = lambda pt: any(inside(pt, closed(r)) for r in shapes[n["fips"]])  # noqa: E731  (the drawn county, as the sprite holds it)
        if not inside_own(start):
            sys.exit(f"{n['key']}: its interior point is not inside its drawn county")
        tile = {"key": n["key"], "fips": n["fips"], "x": x, "y": y}
        if math.hypot(x - start[0], y - start[1]) > MOVED or not inside_own((x, y)):
            tile["from"] = start
        tiles.append(tile)
    crowded = [(a["key"], b["key"]) for i, a in enumerate(tiles) for b in tiles[i + 1:] if overlap((a["x"], a["y"]), (b["x"], b["y"]))]
    if crowded:
        print(f"warning: tiles still overlap on the {FOOT}-unit footprint after the passes: {crowded}", file=sys.stderr)
    for st in STATES.values():
        x, y = label_point(outlines[st], STATE_NAMES[st], tiles)
        states.append({"id": st.lower(), "name": STATE_NAMES[st], "x": round(x, 1), "y": round(y, 1)})
    layout = {"viewBox": [W, H], "states": states, "tiles": tiles, "counties": [f for f in by_fips if f"co-{f}" in paths]}
    return paths, layout


def sprite_html(paths, layout):
    """What sits between the map:sprite markers: the paths every map draws with use, then the layout build_plates.py reads (counties come from the ids)."""
    svg = ('<svg class="county-sprite" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute">'
           + "".join(f'<path id="{pid}" d="{d}"/>' for pid, d in paths.items()) + "</svg>")
    data = json.dumps({k: v for k, v in layout.items() if k != "counties"}, separators=(",", ":"))
    return f'{svg}\n<script type="application/json" id="county-layout">{data}</script>'


# The file stands alone, so it carries its own paint, on a light ground: the light theme's inks, the site's tokens as they render there.
FILE_CSS = (".states use{fill:none;stroke:#667085;stroke-opacity:.7;stroke-width:1}.county{stroke:#667085;stroke-opacity:.35;stroke-width:.6;stroke-linejoin:round}"
            ".county.is-ghost{fill:none}.county.is-named{fill:#010B13;fill-opacity:.08}"
            ".state-names text{font-size:28px;fill:#667085;fill-opacity:.55;text-anchor:middle;dominant-baseline:central}"
            ".leaders line{stroke:#667085;stroke-opacity:.7;stroke-width:1}.tile rect{fill:#FFFFFF;stroke:#667085;stroke-width:1.5}"
            ".tile{transform-box:fill-box;transform-origin:center;transform:scale(1.5)}"
            ".tile text{font-size:14px;font-weight:500;fill:#010B13;text-anchor:middle;dominant-baseline:central}")


def file_svg(paths, layout, proj):
    """The Land drawing as a file: every named county's tile and its count of records, no selection. Its desc names the claims the counts are,
    as the kit's Download SVG does, since a file that leaves the page leaves its receipts behind."""
    import build_plates as bp  # the plates' own drawing, so the file and the page cannot drift apart
    named = pc.named_counties(proj["projects"])
    counts = {n["key"]: len(n["ids"]) for n in named}
    ids = sorted(pc.pc_ids(named).values())
    width, height = layout["viewBox"]
    defs = "".join(f'<path id="{pid}" d="{d}"/>' for pid, d in paths.items())
    desc = (f"Each square counts the named records in projects.json whose sources name that county, claims {ids[0]} to {ids[-1]} in data/claims/projects.json, "
            f"partly verified. Limit: {pc.LD_LIMIT} The county a filing names, not the site; a request or an application is not an approval.")
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}"><title>Named proposals in public filings by county, read 11/05/2026</title>'
            f'<desc>{html.escape(desc)}</desc><style>{FILE_CSS}</style><rect width="{width}" height="{height}" fill="#FFFFFF"/><defs>{defs}</defs>'
            f'{bp.county_map(layout, counts, "projects")}</svg>')


def us(iso):
    if not iso:
        return ""
    p = iso.split("-")
    return f"{p[1]}/{p[2]}/{p[0]}" if len(p) == 3 else f"{p[1]}/{p[0]}"


def records_html(proj):
    """One disclosure per state, one entry per record, in file order. Every MW figure is a claim mark; every other digit is a date or an identifier."""
    e = html.escape
    pj = pc.pj_ids(proj["projects"])
    classes = proj["land_classes"]
    by_state = {}
    for p in proj["projects"]:
        by_state.setdefault(p["id"][:2], []).append(p)
    out = []
    for st, name in STATE_NAMES.items():
        items = []
        for p in by_state.get(st, []):
            mw = (f'<a class="cr" data-claim="{pj[p["id"]]}" href="#src-{pj[p["id"]]}">{p["mw"]:,g} MW</a> as filed' if p["mw_claim"] else "no MW stated by the sources read")
            where = "; ".join(f'{e(c["name"])} County, {c["state"]}' for c in p["counties"]) or "No county named by the sources read"
            land = classes[p["land"]["class"]].split(",")[0].split(";")[0]
            land = e(land if land.startswith("Land") else "Land: " + re.sub(r"^(A|The) ", lambda x: x.group(1).lower() + " ", land))
            if p["land"].get("as_stated"):
                land += f' (“{e(p["land"]["as_stated"])}”)'
            parcels = "".join(f' Parcel {e(x["id"])}, as the county notice prints it.' for x in p["land"]["parcels"])
            quotes = "".join(f'<blockquote><p>“{e(t["text"])}”</p><p class="caption">{e(t["attribution"])}.</p></blockquote>' for t in p["tribal_context"] or [])
            links = "; ".join(f'<a href="{e(s["url"])}">{e(s["title"])}</a> ({e(s["publisher"])}{", " + us(s["date"]) if s.get("date") else ""})' for s in p["sources"])
            fips = f' data-fips="{" ".join(c["fips"] for c in p["counties"])}"' if p["counties"] else ""  # the map marks the records of the county picked
            items.append(f'<li id="rec-{e(p["id"].lower())}"{fips}><p><strong>{e(p["name"])}</strong>, {KIND_SAY[p["kind"]]}: {mw}. Status: {e(p["status"])}, {us(p["status_date"])}. '
                         f'{where}. {land}.{parcels} Developer as filed: {e(p["developer_as_filed"] or "not named by the sources read")}.</p>{quotes}'
                         f'<p class="caption">Sources: {links}.</p></li>')
        if items:
            out.append(f'<details class="disclosure" id="records-{st.lower()}"><summary><h3>{name}</h3><span>The named proposals whose filings sit in {name}, '
                       f'with the land each states.</span></summary><div class="disclosure-body"><ol class="dc-record-list">{"".join(items)}</ol></div></details>')
    return "\n".join(out)


def inject(page, name, body):
    start, end = f"<!-- {name} -->", f"<!-- /{name} -->"
    if page.count(start) != 1 or page.count(end) != 1:
        sys.exit(f"{PAGE.name}: needs exactly one {start} and one {end}")
    a, rest = page.split(start)
    _old, b = rest.split(end)
    return f"{a}{start}\n{body}\n{end}{b}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="exit 1 if the page or the SVG file differs from a fresh build; writes nothing")
    a = ap.parse_args()
    proj = json.loads(pc.PROJECTS.read_text(encoding="utf-8"))
    counties = [c for c in read_counties(COUNTIES_ZIP) if c["statefp"] in STATES]
    paths, layout = build_drawing(proj, counties)
    sprite, svg = sprite_html(paths, layout), file_svg(paths, layout, proj)
    sizes = {"sprite_gz": len(gzip.compress(sprite.encode("utf-8"), 9)), "file_gz": len(gzip.compress(svg.encode("utf-8"), 9))}
    if sizes["sprite_gz"] > SPRITE_GZ or sizes["file_gz"] > FILE_GZ:
        sys.exit(f"the drawing is past its guard ({SPRITE_GZ} bytes gzipped for the sprite, {FILE_GZ} for the file): {sizes}")
    for text in (sprite.split("<script")[0], svg):  # a use names an id in the same document (href="#..."), never a file
        if re.search(r"https?://|<script|<image|xlink:href|@import|font-family", text.replace('xmlns="http://www.w3.org/2000/svg"', "")):
            sys.exit("the drawing holds an external reference, script, image, or font")
    page = PAGE.read_text(encoding="utf-8")
    new = inject(inject(page, "map:sprite", sprite), "records:projects", records_html(proj))
    if a.check:
        unpoured = lambda t: re.sub(r' (?:data-status|aria-label)="[^"]*"', "", t)  # noqa: E731  (pour_claim_refs.py adds both to each claim mark after this runs)
        stale = [n for n, ok in ((PAGE.name, unpoured(new) == unpoured(page)), (SVG_OUT.name, SVG_OUT.is_file() and SVG_OUT.read_text(encoding="utf-8") == svg + "\n")) if not ok]
        print(json.dumps({"stale": stale}))
        sys.exit(1 if stale else 0)
    PAGE.write_text(new, encoding="utf-8", newline="\n")
    SVG_OUT.parent.mkdir(parents=True, exist_ok=True)
    SVG_OUT.write_text(svg + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({**sizes, "viewBox": layout["viewBox"], "counties": len(layout["counties"]), "tiles": len(layout["tiles"]),
                      "leaders": sum("from" in t for t in layout["tiles"]), "records": len(proj["projects"])}))


if __name__ == "__main__":
    main()
