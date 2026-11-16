"""Bakes the Northwest relief under the Data Centers atlas (the Where tab): four webp files, dark and paper-light, 1600 and 2520 pixels wide.

    python scripts/bake_relief.py            bake from the inputs in H:/raw-data/relief/ (or --raw DIR); writes the images and the provenance record
    python scripts/bake_relief.py --check    needs no inputs and no numpy: exit 1 naming each image whose bytes, or the recipe, differ from the record

Reads   etopo2022_15s_pnw.nc, NOAA NCEI ETOPO 2022 15 arc-second relief (free to use and redistribute), and four Natural Earth 10m GeoJSON files, rivers
        and lakes (public domain). Their sources, terms and hashes are in scripts/fixtures/relief/PROVENANCE.json; the files stay in H:/raw-data/relief/.
Writes  site/assets/img/relief/nw-{dark,light}-{1600,2520}.webp and scripts/fixtures/relief/PROVENANCE.json (the recipe's hash and each image's hash).
Draws   physical features only: the land as a hillshade, rivers and lakes. No boundary of any kind and no name: the labels are the page's own text,
        placed by scripts/build_project_map.py with px() below. The ocean is the page's ground, so the page is the Pacific.
The sheet is equirectangular, 41.5 to 49.5 N and 125.5 to 110.5 W, 2520 by 1920: 168 pixels a degree of longitude and 240 of latitude, true at 45.57 N.
Ported from the Field Atlas comp (work/site-refresh/r2/comps/field-atlas/tools/bake_relief.py); the rivers and lakes are baked in here, not drawn as paths.
"""
import argparse
import datetime
import hashlib
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = Path("H:/raw-data/relief")
OUT = ROOT / "site" / "assets" / "img" / "relief"
RECORD = ROOT / "scripts" / "fixtures" / "relief" / "PROVENANCE.json"
LON0, LON1, LAT0, LAT1 = -125.5, -110.5, 41.5, 49.5
W, H = 2520, 1920

# Everything that decides a pixel. Its hash is recorded, so a changed recipe reads as stale until the images are baked again.
RECIPE = {
    "extent": [LON0, LAT0, LON1, LAT1], "size": [W, H], "exaggeration": 2.0, "smooth": [2.6, 1.0], "mix": [0.58, 0.42],
    "lights": [[315, 38, 0.6], [280, 46, 0.22], [350, 52, 0.18]],
    "dark": {"shadow": [3, 10, 17], "lit": [55, 70, 86], "sea": [1, 11, 19], "gamma": 1.9, "high": [14, 17, 21], "snow": [22, 25, 29], "water": [90, 155, 213]},
    "light": {"shadow": [168, 181, 198], "lit": [252, 253, 255], "sea": [244, 247, 251], "gamma": 1.1, "high": [-8, -7, -4], "snow": [10, 9, 6], "water": [47, 127, 193]},
    "rivers": {"centerlines_rank": 8, "north_america_rank": 10, "skip": ["Madison", "Missouri", "Yellowstone", "Bear", "Pit"],
               "width": {"main": 4.5, "rank6": 3.2, "rank8": 2.4, "minor": 1.8}, "alpha": {"main": 1.0, "rank6": 0.9, "rank8": 0.8, "minor": 0.7}},
    "lakes": {"rank": 11, "skip": ["Great Salt Lake"], "fill": 0.35, "edge": 0.85},
    "fade": 0.07, "widths": [1600, 2520], "quality": {"dark": [70, 52], "light": [72, 45]},  # by width: the 2x file is under 120 KB (tests/budgets.json)
}
INPUTS = {
    "etopo2022_15s_pnw.nc": {"dataset": "ETOPO 2022 15 arc-second global relief model (ETOPO_2022_v1_15s), subset 41.5 to 49.5 N, 125.5 to 110.5 W",
                             "publisher": "NOAA National Centers for Environmental Information, served by NOAA CoastWatch ERDDAP",
                             "url": "https://coastwatch.pfeg.noaa.gov/erddap/griddap/ETOPO_2022_v1_15s.nc?z[(41.5):1:(49.5)][(-125.5):1:(-110.5)]",
                             "terms": "Free to use and redistribute, as the dataset's attributes state; not for legal use, and no warranty."},
    "ne_10m_rivers_lake_centerlines.geojson": {"dataset": "Natural Earth 10m rivers and lake centerlines", "publisher": "Natural Earth",
                                               "url": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_rivers_lake_centerlines.geojson",
                                               "terms": "Public domain (Natural Earth terms of use)."},
    "ne_10m_rivers_north_america.geojson": {"dataset": "Natural Earth 10m rivers, North America supplement", "publisher": "Natural Earth",
                                            "url": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_rivers_north_america.geojson",
                                            "terms": "Public domain (Natural Earth terms of use)."},
    "ne_10m_lakes.geojson": {"dataset": "Natural Earth 10m lakes", "publisher": "Natural Earth",
                             "url": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_lakes.geojson",
                             "terms": "Public domain (Natural Earth terms of use)."},
    "ne_10m_lakes_north_america.geojson": {"dataset": "Natural Earth 10m lakes, North America supplement", "publisher": "Natural Earth",
                                           "url": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_lakes_north_america.geojson",
                                           "terms": "Public domain (Natural Earth terms of use)."},
}
CREDITS = [
    "Relief: NOAA National Centers for Environmental Information, ETOPO 2022 15 arc-second global relief model, retrieved 11/15/2026; free to use and redistribute.",
    "Rivers and lakes: Natural Earth 10m physical vectors; public domain.",
]


def px(lon, lat):
    """A place on the master sheet, in its pixels from the top left."""
    return (lon - LON0) / (LON1 - LON0) * W, (LAT1 - lat) / (LAT1 - LAT0) * H


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def recipe_hash():
    return hashlib.sha256(json.dumps(RECIPE, sort_keys=True).encode("utf-8")).hexdigest()


def outputs():
    return [OUT / f"nw-{theme}-{width}.webp" for theme in ("dark", "light") for width in RECIPE["widths"]]


def stale():
    """What a fresh bake would change, read from the record alone: a missing or edited image, or a recipe changed since the last bake."""
    if not RECORD.is_file():
        return [str(RECORD.relative_to(ROOT))]
    record = json.loads(RECORD.read_text(encoding="utf-8"))
    out = [] if record.get("recipe_sha256") == recipe_hash() else ["recipe (bake_relief.py RECIPE changed since the last bake)"]
    want = {o["path"]: o["sha256"] for o in record.get("outputs", [])}
    for path in outputs():
        rel = path.relative_to(ROOT).as_posix()
        if not path.is_file() or want.get(rel) != sha256(path):
            out.append(rel)
    return out


# The bake: numpy, scipy, Pillow and shapely, imported here so --check and the page builder that reads px() need none of them.
def load_dem(path):
    import numpy as np
    from scipy import ndimage
    from scipy.io import netcdf_file
    f = netcdf_file(path, "r", mmap=False)
    z = np.array(f.variables["z"].data, dtype=np.float32)[::-1]  # the file runs south to north; the image runs north down
    f.close()
    return ndimage.zoom(z, (H / z.shape[0], W / z.shape[1]), order=1)


def hillshade(z):
    import numpy as np
    from scipy import ndimage
    land = np.where(z > 0, z, 0.0)
    dy = (LAT1 - LAT0) / H * 110574.0
    lat = np.linspace(LAT1, LAT0, H)[:, None]
    dx = (LON1 - LON0) / W * 111320.0 * np.cos(np.radians(lat))

    def shade_of(sigma):
        gy, gx = np.gradient(ndimage.gaussian_filter(land, sigma) * RECIPE["exaggeration"])
        gx, gy = gx / dx, gy / dy
        total = 0
        for az, alt, weight in RECIPE["lights"]:  # lit from the northwest, as relief maps are, softened by two neighbours so no slope goes black
            a, h = math.radians(az), math.radians(alt)
            nx, ny = -gx, gy  # gy runs down the image (south), so a north-facing slope is +gy
            n = np.sqrt(nx * nx + ny * ny + 1.0)
            total = total + weight * np.clip((nx * math.sin(a) * math.cos(h) + ny * math.cos(a) * math.cos(h) + math.sin(h)) / n, 0, 1)
        return total

    # Generalized relief: the broad forms from a smoothed surface and a little detail on top, so ranges read as ranges, not crumpled paper.
    (s1, s2), (m1, m2) = RECIPE["smooth"], RECIPE["mix"]
    return m1 * shade_of(s1) + m2 * shade_of(s2), land


def tone(hs, land, sea_mask, theme):
    import numpy as np
    from scipy import ndimage
    t = RECIPE[theme]
    lit = np.clip((hs - 0.18) / (1.0 - 0.18), 0, 1)
    elev = np.clip((land - 900.0) / 2600.0, 0, 1)[..., None]
    snow = np.clip((land - 2300.0) / 900.0, 0, 1)[..., None]  # the volcanoes and the high Rockies, the landmarks a Northwest reader knows
    shadow, high = np.array(t["shadow"], float), np.array(t["lit"], float)
    rgb = shadow + (high - shadow) * (lit ** t["gamma"])[..., None] + elev * np.array(t["high"], float) + snow * np.array(t["snow"], float)
    soft = ndimage.gaussian_filter(sea_mask.astype(np.float32), 0.8)[..., None]  # an antialiased coast
    return rgb * (1 - soft) + np.array(t["sea"], float) * soft


def water_layers(raw):
    """Rivers and lakes as two coverage masks on the master, drawn at twice its size and boxed down, so every line is antialiased."""
    import numpy as np
    from PIL import Image, ImageDraw
    from shapely import clip_by_rect
    from shapely.geometry import box, shape
    k = 2
    bbox = box(LON0 - 0.5, LAT0 - 0.5, LON1 + 0.5, LAT1 + 0.5)
    rv, lk = RECIPE["rivers"], RECIPE["lakes"]

    def features(name, keep):
        for ft in json.loads((raw / name).read_text(encoding="utf-8"))["features"]:
            if not ft["geometry"]:
                continue
            g = shape(ft["geometry"])
            pr = ft["properties"]
            rank = pr.get("scalerank") or 99
            if g.intersects(bbox) and keep(pr, rank):
                yield pr.get("name") or "", rank, clip_by_rect(g, LON0 - 0.2, LAT0 - 0.2, LON1 + 0.2, LAT1 + 0.2)

    def parts(g):
        if g.is_empty:
            return []
        return [g] if g.geom_type in ("LineString", "Polygon") else [q for p in g.geoms for q in parts(p)]

    def pts(coords):
        return [(x * k, y * k) for x, y in (px(lon, lat) for lon, lat in coords)]

    rivers = [*features("ne_10m_rivers_lake_centerlines.geojson", lambda pr, r: r <= rv["centerlines_rank"] and pr.get("name") not in rv["skip"]),
              *features("ne_10m_rivers_north_america.geojson", lambda pr, r: r <= rv["north_america_rank"])]
    lakes = [g for name in ("ne_10m_lakes.geojson", "ne_10m_lakes_north_america.geojson")
             for _n, _r, g in features(name, lambda pr, r: r <= lk["rank"] and pr.get("name") not in lk["skip"])]
    masks = {}
    for cls in ("main", "rank6", "rank8", "minor"):
        canvas = Image.new("L", (W * k, H * k), 0)
        draw = ImageDraw.Draw(canvas)
        for name, rank, g in rivers:
            kind = "main" if name in ("Columbia", "Snake") else "rank6" if rank <= 6 else "rank8" if rank <= 8 else "minor"
            if kind != cls:
                continue
            for line in parts(g):
                draw.line(pts(line.coords), fill=255, width=max(1, round(rv["width"][kind] * k)), joint="curve")
        masks[cls] = canvas
    fill, edge = Image.new("L", (W * k, H * k), 0), Image.new("L", (W * k, H * k), 0)
    fd, ed = ImageDraw.Draw(fill), ImageDraw.Draw(edge)
    for g in lakes:
        for poly in parts(g):
            if poly.geom_type != "Polygon":
                continue
            ring = pts(poly.exterior.coords)
            fd.polygon(ring, fill=255)
            ed.line(ring, fill=255, width=2 * k)
    down = lambda m: np.asarray(m.resize((W, H), Image.BOX), dtype=np.float32) / 255.0  # noqa: E731
    river = np.max([down(masks[c]) * rv["alpha"][c] for c in masks], axis=0)
    return np.maximum(river, np.maximum(down(fill) * lk["fill"], down(edge) * lk["edge"]))


def fade_edges(rgb, sea):
    """The sheet fades into the ground at its north, east and south edges, so the data's rectangle never shows; the west edge is open sea already."""
    import numpy as np
    hgt, wid = rgb.shape[:2]
    frac = RECIPE["fade"]
    fy = np.clip(np.minimum(np.arange(hgt), np.arange(hgt)[::-1]) / (frac * hgt), 0, 1)[:, None]
    fx = np.clip((wid - 1 - np.arange(wid)) / (frac * wid), 0, 1)[None, :]
    k = ((fy * fx) ** 1.4)[..., None]
    return rgb * k + np.array(sea, dtype=np.float32) * (1 - k)


def bake(raw):
    import numpy as np
    from PIL import Image
    missing = [name for name in INPUTS if not (raw / name).is_file()]
    if missing:
        sys.exit(f"bake_relief: inputs missing from {raw}: {', '.join(missing)} (PROVENANCE.json names where each comes from)")
    z = load_dem(raw / "etopo2022_15s_pnw.nc")
    hs, land = hillshade(z)
    water = water_layers(raw)[..., None]
    OUT.mkdir(parents=True, exist_ok=True)
    for theme in ("dark", "light"):
        t = RECIPE[theme]
        rgb = tone(hs, land, z <= 0.0, theme)
        rgb = rgb * (1 - water) + np.array(t["water"], float) * water
        sheet = Image.fromarray(np.clip(fade_edges(rgb, t["sea"]), 0, 255).astype(np.uint8))
        for width, quality in zip(RECIPE["widths"], RECIPE["quality"][theme]):
            img = sheet if width == W else sheet.resize((width, round(H * width / W)), Image.LANCZOS)
            img.save(OUT / f"nw-{theme}-{width}.webp", "WEBP", quality=quality, method=6)
    record = {
        "purpose": "Inputs and outputs of scripts/bake_relief.py, the relief under the Data Centers atlas. Public data only (T0); the inputs stay in H:/raw-data/relief/.",
        "tier": "T0",
        "baked_on": datetime.date.today().isoformat(),
        "recipe_sha256": recipe_hash(),
        "credits": CREDITS,
        "inputs": [{"name": name, **meta, "retrieved_on": "2026-11-15", "sha256": sha256(raw / name), "bytes": (raw / name).stat().st_size} for name, meta in INPUTS.items()],
        "outputs": [{"path": p.relative_to(ROOT).as_posix(), "sha256": sha256(p), "bytes": p.stat().st_size} for p in outputs()],
    }
    RECORD.parent.mkdir(parents=True, exist_ok=True)
    RECORD.write_text(json.dumps(record, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({o["path"]: o["bytes"] for o in record["outputs"]}))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--check", action="store_true", help="write nothing and read no inputs; exit 1 naming each stale image")
    ap.add_argument("--raw", type=Path, default=RAW, help="the folder holding the inputs (default H:/raw-data/relief)")
    a = ap.parse_args()
    if a.check:
        out = stale()
        print(json.dumps({"stale": out}))
        sys.exit(1 if out else 0)
    bake(a.raw)


if __name__ == "__main__":
    main()
