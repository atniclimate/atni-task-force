"""Each font face is two files that site.css joins by unicode-range, cut by scripts/subset_fonts.py: a Latin core and a Latin-extended file. A browser
draws a character from a file only when that file's rule names it in its unicode-range, so every character site/ draws must be in one of its face's two
files and inside that file's range. Node decompresses the WOFF2 files: its zlib has brotli, and Python's standard library has none."""
import html
import json
import re
import shutil
import struct
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
FONTS = SITE / "assets" / "fonts"
NODE = shutil.which("node")
FONT_FACE = re.compile(r"@font-face\s*\{([^}]*)\}")
JS_ESCAPE = re.compile(r"\\u\{([0-9a-fA-F]+)\}|\\u([0-9a-fA-F]{4})|\\x([0-9a-fA-F]{2})")
CSS_ESCAPE = re.compile(r"\\([0-9a-fA-F]{1,6})")
# Drawn by no face, whole or cut, and kept as they are: U+F09F and U+F0B7 are Word's Symbol-font bullets and U+FFFD three replacement characters, all in
# the generated data/energy-potential.json (to be fixed at its source, never in that file); U+FEFF is the byte order mark plate.js puts at a CSV's head.
EXCEPTIONS = {0xF09F, 0xF0B7, 0xFFFD, 0xFEFF}
# Never in the vendored faces (Noto Sans 2.015, League Spartan 2.002), so a browser draws these from the next font in the stack, as it always has:
# fractions, arrows, ∼ ≈ ≤, ▶ ●. League Spartan's own gaps fall to Noto Sans, the next face in the display stack.
NOTO_NEVER = {0x2156, 0x2157, 0x2191, 0x2192, 0x2193, 0x223C, 0x2248, 0x2264, 0x25B6, 0x25CF}
NEVER = {"Noto Sans": NOTO_NEVER, "League Spartan": NOTO_NEVER - {0x2264} | {0x2010, 0x2011, 0x2076, 0x2079, 0x2082}}
WOFF2_TAGS = {0: b"cmap", 10: b"glyf", 11: b"loca"}  # the known-tag indexes this reader needs
INFLATE = "process.stdout.write(require('zlib').brotliDecompressSync(require('fs').readFileSync(0)))"


def drawn(site=SITE):
    """Every character site/ can draw: the text of its pages, SVGs, data, and scripts, with character references and escapes read, and what its
    stylesheets write in content. shortcut: a character a script builds from a number is not seen; scan for String.fromCharCode if one ever is."""
    found = set()
    for path in site.rglob("*"):
        suffix = path.suffix.lower()
        if suffix in (".html", ".svg", ".js"):
            text = path.read_text(encoding="utf-8")
            text = html.unescape(text) if suffix != ".js" else text
            found.update(text, (chr(int(a or b or c, 16)) for a, b, c in JS_ESCAPE.findall(text)))
        elif suffix == ".json":
            found.update(json.dumps(json.loads(path.read_text(encoding="utf-8")), ensure_ascii=False))
        elif suffix == ".css":
            found.update(chr(int(code, 16)) for code in CSS_ESCAPE.findall(path.read_text(encoding="utf-8")))
    return {ord(c) for c in found if ord(c) >= 0x20}


def faces(css=SITE / "assets" / "css" / "site.css"):
    """{(family, style, weight): [(file, ranges)]} from the stylesheet's @font-face rules."""
    out = {}
    for body in FONT_FACE.findall(css.read_text(encoding="utf-8")):
        get = lambda name: re.search(rf"{name}:\s*([^;]+);", body)[1].strip()  # noqa: E731
        ranges = []
        for part in re.findall(r"U\+([0-9A-Fa-f]+(?:-[0-9A-Fa-f]+)?)", get("unicode-range")):
            lo, _, hi = part.partition("-")
            ranges.append((int(lo, 16), int(hi or lo, 16)))
        file = re.search(r'url\("\.\./fonts/([^"]+)"\)', body)[1]
        out.setdefault((get("font-family").strip('"'), get("font-style"), get("font-weight")), []).append((file, ranges))
    return out


def base128(data, at):
    value = 0
    while True:
        byte = data[at]
        at += 1
        value = value << 7 | byte & 127
        if byte < 128:
            return value, at


def cmap(path):
    """The codepoints a WOFF2 file maps to a glyph. shortcut: reads a format 4 cmap only, the one a font of the Basic Multilingual Plane carries;
    add format 12 if a face ever maps a codepoint above U+FFFF."""
    data = path.read_bytes()
    assert data[:4] == b"wOF2", f"{path.name} is not WOFF2"
    count, packed = struct.unpack_from(">H", data, 12)[0], struct.unpack_from(">I", data, 20)[0]
    at, offset, where = 48, 0, None
    for _ in range(count):  # the table directory: each table's length in the decompressed stream, in order
        flags = data[at]
        tag, at = (data[at + 1:at + 5], at + 5) if flags & 63 == 63 else (WOFF2_TAGS.get(flags & 63), at + 1)
        length, at = base128(data, at)
        if (flags >> 6 == 0) == (tag in (b"glyf", b"loca")):  # transformed, so stored at its transformed length
            length, at = base128(data, at)
        if tag == b"cmap":
            where = (offset, length)
        offset += length
    stream = subprocess.run([NODE, "-e", INFLATE], input=data[at:at + packed], capture_output=True, check=True).stdout
    table = stream[where[0]:where[0] + where[1]]
    records = {struct.unpack_from(">HH", table, 4 + 8 * i): struct.unpack_from(">I", table, 8 + 8 * i)[0] for i in range(struct.unpack_from(">H", table, 2)[0])}
    sub = records.get((3, 1), records.get((0, 3)))
    assert sub is not None and struct.unpack_from(">H", table, sub)[0] == 4, f"{path.name}: no format 4 cmap"
    segs = struct.unpack_from(">H", table, sub + 6)[0] // 2
    ends = struct.unpack_from(f">{segs}H", table, sub + 14)
    starts, deltas, offsets = (struct.unpack_from(f">{segs}H", table, sub + 16 + 2 * k * segs) for k in (1, 2, 3))  # past a two-byte pad
    ranges_at = sub + 16 + 6 * segs
    found = set()
    for i in range(segs):
        for cp in range(starts[i], ends[i] + 1):
            if offsets[i]:
                glyph = struct.unpack_from(">H", table, ranges_at + 2 * i + offsets[i] + 2 * (cp - starts[i]))[0]
                glyph = glyph and (glyph + deltas[i]) & 0xFFFF
            else:
                glyph = (cp + deltas[i]) & 0xFFFF
            if glyph and cp != 0xFFFF:
                found.add(cp)
    return found


def inside(cp, ranges):
    return any(lo <= cp <= hi for lo, hi in ranges)


@pytest.fixture(scope="module")
def maps():
    if not NODE:
        pytest.skip("node is not installed: it decompresses the WOFF2 files")
    return {path.name: cmap(path) for path in FONTS.glob("*.woff2")}


def test_each_face_is_a_core_and_an_extended_file_with_nothing_outside_its_range(maps):
    found = faces()
    assert len(found) == 6 and all(len(files) == 2 for files in found.values()), "two files a face, the core first"
    named = {file for files in found.values() for file, _ in files}
    assert named == set(maps), f"a font file no rule names, or a rule naming no file: {sorted(named ^ set(maps))}"
    for face, files in found.items():
        (core, core_ranges), (ext, ext_ranges) = files
        assert inside(ord("A"), core_ranges) and not inside(ord("A"), ext_ranges) and inside(0x0259, ext_ranges), f"{face}: the core rule, then the extended"
        for file, ranges in files:
            outside = sorted(cp for cp in maps[file] if not inside(cp, ranges))
            assert not outside, f"{file} holds {len(outside)} codepoints its unicode-range never lets a browser draw, from U+{outside[0]:04X}"


def test_every_character_the_site_draws_is_in_one_of_its_faces_two_files(maps):
    used = drawn()
    for (family, style, weight), files in faces().items():
        covered = set().union(*({cp for cp in maps[file] if inside(cp, ranges)} for file, ranges in files))
        missing = sorted(used - covered - EXCEPTIONS - NEVER[family])
        assert not missing, (f"{family} {style} {weight} cannot draw {', '.join(f'U+{cp:04X}' for cp in missing)}: add its block to CORE or EXT in "
                             "scripts/subset_fonts.py and to the rules in site.css, then rerun the script; if the whole face lacks it, add it to NEVER here")


def test_the_scan_reads_references_escapes_and_stylesheet_content(tmp_path):
    (tmp_path / "a.html").write_text("<p>x&#x30C;&rarr;</p>", encoding="utf-8")
    (tmp_path / "b.json").write_text('{"name": "d\\u0078\\u02b7l\\u0259\\u0161ucid"}', encoding="utf-8")
    (tmp_path / "c.js").write_text("const minus = '\\u2212';", encoding="utf-8")
    (tmp_path / "d.css").write_text('.x::before { content: "\\2193  people"; }', encoding="utf-8")
    assert {0x030C, 0x2192, 0x02B7, 0x0259, 0x0161, 0x2212, 0x2193} <= drawn(tmp_path)
