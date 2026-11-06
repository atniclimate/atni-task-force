#!/usr/bin/env python3
"""Cuts each vendored font face into the two files site.css joins with unicode-range: a Latin core every page loads, and a Latin-extended file a
browser fetches only for a page that draws one of its letters, so a Tribal-language name with a letter such as ʷ, ə, or ƛ, or a combining mark,
still renders in Noto Sans. Greek, and every block the site does not use, is left out.

Build-time only, never published: needs fontTools and brotli (pip install fonttools brotli). The whole faces are read from git at WHOLE, the last
commit that served them, and both files of each face are written into site/assets/fonts/, where the OFL texts stay; neither license names a
Reserved Font Name, so the cut faces keep their names. tests/test_fonts.py checks the files against every character site/ uses.
   python scripts/subset_fonts.py
"""
import io
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "site" / "assets" / "fonts"
WHOLE = "5f0f2ced70a4ef572dec32c07a362bc20a80ea2f"  # Noto Sans 2.015 and League Spartan 2.002, whole
FACES = ("LeagueSpartan-Medium", "LeagueSpartan-SemiBold", "NotoSans-Regular", "NotoSans-Italic", "NotoSans-Medium", "NotoSans-Bold")
# Each face's two @font-face rules in site.css carry these as their unicode-range. The combining marks are in both files, since a browser shapes a
# letter and its marks with one font: x̌ takes its caron from the core, and ƛ̓ its comma from the extended file.
CORE = ((0x0000, 0x00FF), (0x0300, 0x036F), (0x2000, 0x22FF))  # Latin-1, combining marks; punctuation, super- and subscripts, currency, letterlike, number forms, arrows, math
EXT = ((0x0100, 0x036F), (0x1E00, 0x1EFF))  # Latin Extended-A and B, IPA, spacing modifiers, combining marks, Latin Extended Additional


def cut(whole, ranges):
    """The face cut to the codepoints in ranges, as WOFF2, with every layout feature, hint, and name record kept."""
    from fontTools import subset  # only this step needs it

    options = subset.Options(flavor="woff2", layout_features=["*"], name_IDs=["*"], name_languages=["*"], name_legacy=True, notdef_outline=True)
    font = subset.load_font(io.BytesIO(whole), options)
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=[cp for lo, hi in ranges for cp in range(lo, hi + 1)])
    subsetter.subset(font)
    out = io.BytesIO()
    subset.save_font(font, out, options)
    return out.getvalue()


def main():
    for name in FACES:
        whole = subprocess.run(["git", "-C", str(ROOT), "show", f"{WHOLE}:site/assets/fonts/{name}.woff2"], capture_output=True, check=True).stdout
        for suffix, ranges in (("", CORE), ("-LatinExt", EXT)):
            data = cut(whole, ranges)
            (FONTS / f"{name}{suffix}.woff2").write_bytes(data)
            print(f"{name}{suffix}.woff2: {len(data):,} bytes, from {len(whole):,} whole")


if __name__ == "__main__":
    main()
