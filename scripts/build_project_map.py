"""Builds the inline SVG map of where named proposals sit, and the record list by state, from the Census 1:20,000,000 county file and site/data/projects.json.

    python -B scripts/build_project_map.py           (writes)        python -B scripts/build_project_map.py --check   (exit 1 if the page or the SVG is stale)

Reads   work/site-refresh/n6/cb_2024_us_county_20m.zip (local; sha256 recorded in projects.json), site/data/projects.json
Writes  site/data-centers/index.html between <!-- map:projects --> and between <!-- records:projects -->, and site/assets/img/maps/projects.svg.
        The SVG is aria-hidden: the record list by state is its text, one entry per record, with each MW figure a claim mark (pj-, scripts/project_claims.py).
        No script, font, image or external reference; light and dark through currentColor and CSS variables, its rules scoped to .project-map.
Draws   WA, OR, ID and MT in full, and the NV and CA counties whose interior point is at or north of 38.0 N. A county with no record is not drawn on its own: each state's
        outline is the dissolved edge of its counties (shared edges cancel). A county with a record is drawn and shaded by how many records name it. One square per record
        and county sits at that county's interior point (the point farthest from its edge, found on the Census polygon), laid out in a small grid when a county holds
        several. A filled square is a record whose MW claim is verified; a hollow square is a figure from press, a sum, no MW at all, or a status page.
No coordinate is guessed: nothing is placed except at a Census county's interior point. Standard library only (map_preview.py draws the PNG from the SVG with Pillow).
"""
import argparse
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
STATE_NAMES = {"WA": "Washington", "OR": "Oregon", "ID": "Idaho", "MT": "Montana", "NV": "Nevada", "CA": "California"}
KIND_SAY = {"data center": "a data center", "generation": "generation", "storage": "storage", "transmission": "a transmission line", "substation": "a substation"}


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
W = 720
PAD = 8
TOL_STATE, TOL_COUNTY = 0.9, 0.7
MARK, GAP = 6, 7  # about 7px at a 1440 screen; 7 units put squares outside crowded counties, and tests/test_projects.py holds every square inside its county
KIND_KEY = {"data center": "dc", "generation": "gs", "storage": "gs", "transmission": "tx", "substation": "tx"}


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


def path(rings, tol, min_extent=2.5):
    out = []
    for ring in rings:
        xs, ys = [p[0] for p in ring], [p[1] for p in ring]
        if max(xs) - min(xs) < min_extent and max(ys) - min(ys) < min_extent:
            continue
        far = max(range(len(ring)), key=lambda i: (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2)  # a closed ring is split at its farthest point
        s = dp(ring[:far + 1], tol)[:-1] + dp(ring[far:], tol)
        if len(s) < 4:
            continue
        pts = [(round(x, 1), round(y, 1)) for x, y in s[:-1]]
        d = f"M{pts[0][0]:g},{pts[0][1]:g}"
        for (px, py), (x, y) in zip(pts, pts[1:]):
            d += f"l{round(x - px, 1):g},{round(y - py, 1):g}"
        out.append(d + "z")
    return "".join(out)


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


def build_svg(proj, counties):
    """The map SVG and its marks' positions, (record id, fips) -> (x, y) of the square's corner."""
    albers = ALBERS
    have = {}
    for p in proj["projects"]:
        for c in p["counties"]:
            have.setdefault(c["fips"], []).append(p)
    for c in counties:
        c["state"] = STATES[c["statefp"]]
        c["pr"] = [[albers(lon, lat) for lon, lat in ring] for ring in c["rings"]]
        c["ip"] = interior_point(c["pr"])
    keepc = []
    for c in counties:
        if c["state"] in PARTIAL and c["fips"] not in have:
            ring = max(c["rings"], key=len)  # the mean latitude of the largest ring decides whether a county with no record is drawn
            if sum(p[1] for p in ring) / len(ring) < LAT_CUT:
                continue
        keepc.append(c)
    missing = [f for f in have if f not in {c["fips"] for c in keepc}]
    if missing:
        sys.exit(f"counties named by a record are not in the drawn set: {missing}")
    xs = [x for c in keepc for r in c["pr"] for x, _ in r]
    ys = [y for c in keepc for r in c["pr"] for _, y in r]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    s = (W - 2 * PAD) / (maxx - minx)
    H = int(round((maxy - miny) * s + 2 * PAD))
    tf = lambda pt: ((pt[0] - minx) * s + PAD, (maxy - pt[1]) * s + PAD)  # noqa: E731
    outlines = [path([[tf(albers(lon, lat)) for lon, lat in r] for r in dissolve([c["rings"] for c in keepc if c["state"] == st])], TOL_STATE) for st in STATES.values()]
    cpaths = []
    for c in keepc:
        if c["fips"] in have:
            n = len({p["id"] for p in have[c["fips"]]})
            cls = "c1" if n == 1 else "c2" if n <= 3 else "c3" if n <= 6 else "c4"
            cpaths.append(f'<path class="{cls}" data-fips="{c["fips"]}" data-n="{n}" d="{path([[tf(pt) for pt in r] for r in c["pr"]], TOL_COUNTY)}"/>')
    rows_of = {p["id"]: pc.row_of(p) for p in proj["projects"]}
    marks, mark_pos = [], {}
    for c in keepc:
        if c["fips"] not in have:
            continue
        ps = sorted({p["id"]: p for p in have[c["fips"]]}.values(), key=lambda p: p["id"])
        n = len(ps)
        ring = max(c["pr"], key=len)
        wide = (max(x for x, _ in ring) - min(x for x, _ in ring)) / max(1e-9, max(y for _, y in ring) - min(y for _, y in ring))
        cols = max(1, min(n, round(math.sqrt(n * wide))))  # the grid takes the county's shape, so a long, low county gets a long, low row of squares
        rows = math.ceil(n / cols)
        cx, cy = tf(c["ip"])
        for i, p in enumerate(ps):
            r, k = divmod(i, cols)
            in_row = cols if r < rows - 1 else n - r * cols
            x = cx + (k - (in_row - 1) / 2) * GAP - MARK / 2
            y = cy + (r - (rows - 1) / 2) * GAP - MARK / 2
            hollow = not (p["mw_claim"] and p["mw_claim"]["status"] == "verified")
            mark_pos[(p["id"], c["fips"])] = (round(x, 1), round(y, 1))
            marks.append(f'<rect class="m{" h" if hollow else ""}" data-id="{p["id"]}" data-fips="{c["fips"]}" data-row="{rows_of[p["id"]]}" data-kind="{KIND_KEY[p["kind"]]}" '
                         f'x="{x:.1f}" y="{y:.1f}" width="{MARK}" height="{MARK}"/>')
    pm = ".project-map "
    css = (f"<style>{pm}.s{{fill:none;stroke:currentColor;stroke-opacity:.4;stroke-width:.8;stroke-linejoin:round}}"
           f"{pm}.k path{{stroke:currentColor;stroke-opacity:.55;stroke-width:.8;fill:currentColor;stroke-linejoin:round}}"
           f"{pm}.c1{{fill-opacity:.1}}{pm}.c2{{fill-opacity:.2}}{pm}.c3{{fill-opacity:.32}}{pm}.c4{{fill-opacity:.45}}"
           f"{pm}.m{{fill:var(--mark,#FF914C);stroke:var(--mark-edge,#010B13);stroke-width:.6}}"
           f"{pm}.m.h{{fill:none;stroke:var(--mark,#FF914C);stroke-width:1.3}}"
           f"{pm}.m.is-selected{{stroke:currentColor;stroke-width:1.5}}{pm}.m.is-dim{{opacity:.45}}</style>")
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" class="project-map" viewBox="0 0 {W} {H}" aria-hidden="true" focusable="false">{css}'
           f'<g class="s"><path d="{"".join(outlines)}"/></g><g class="k">{"".join(cpaths)}</g><g class="mk">{"".join(marks)}</g></svg>')
    return svg, mark_pos


def us(iso):
    if not iso:
        return ""
    p = iso.split("-")
    if len(p) == 1:
        return iso  # a year only, when that is all the source prints
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
            items.append(f'<li id="rec-{e(p["id"].lower())}"><p><strong>{e(p["name"])}</strong>, {KIND_SAY[p["kind"]]}: {mw}. Status: {e(p["status"])}, {us(p["status_date"])}. '
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
    svg, mark_pos = build_svg(proj, counties)
    size = len(svg.encode("utf-8"))
    if size > 40 * 1024:
        sys.exit(f"the map is {size} bytes, over 40 KB")
    if re.search(r"https?://|<script|<image|xlink:href|@import|font-family", svg.replace('xmlns="http://www.w3.org/2000/svg"', "")):
        sys.exit("the map holds an external reference, script, image, or font")
    page = PAGE.read_text(encoding="utf-8")
    new = inject(inject(page, "map:projects", svg), "records:projects", records_html(proj))
    if a.check:
        unpoured = lambda t: re.sub(r' (?:data-status|aria-label)="[^"]*"', "", t)  # noqa: E731  (pour_claim_refs.py adds both to each claim mark after this runs)
        stale = [n for n, ok in ((PAGE.name, unpoured(new) == unpoured(page)), (SVG_OUT.name, SVG_OUT.is_file() and SVG_OUT.read_text(encoding="utf-8") == svg + "\n")) if not ok]
        print(json.dumps({"stale": stale}))
        sys.exit(1 if stale else 0)
    PAGE.write_text(new, encoding="utf-8", newline="\n")
    SVG_OUT.parent.mkdir(parents=True, exist_ok=True)
    SVG_OUT.write_text(svg + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"bytes": size, "marks": len(mark_pos), "records": len(proj["projects"])}))


if __name__ == "__main__":
    main()
