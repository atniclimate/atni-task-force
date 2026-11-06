#!/usr/bin/env python3
"""Writes canonical and link-preview tags into every page's head, and site/robots.txt and site/sitemap.txt.

Idempotent: the tags sit between two markers and are replaced on each run, so run it again after anyone adds a page or changes a title.
   python scripts/add_page_meta.py          # write
   python scripts/add_page_meta.py --check  # write nothing; exit 1 and name what is out of date

The default share card is site/assets/img/share-card.png, 1200 by 630, a one-time render of the ATNI Energy on-dark lockup on #010B13 with vectorcraft-cli convert. A page with a
lead plate takes that plate's card instead, from scripts/build_share_cards.py, whose alt text is the plate's own sentence.
"""
from html import escape, unescape
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
SITE_URL = "https://atniclimate.github.io/atni-task-force/"
CARD_PATH = "assets/img/share-card.png"
CARD_ALT = "The ATNI Energy logo, the ATNI seal beside the words ATNI Energy, on a dark ground."
PAGE_CARDS = {"index.html": "ai-same-hour", "ai/index.html": "ai-same-hour", "data-centers/index.html": "dc-pnw-load", "energy/index.html": "energy-types-by-stage", "explorer/index.html": "explorer"}
BLOCK = re.compile(r"[ \t]*<!-- page-meta -->.*?<!-- /page-meta -->\r?\n", re.S)
TITLE = re.compile(r"<title>(.*?)</title>", re.S)
DESCRIPTION = re.compile(r'[ \t]*<meta name="description" content="([^"]*)">\r?\n')


def url_of(rel):
    """The public address of a page, from its path under site/."""
    return SITE_URL + re.sub(r"(^|/)index\.html$", r"\1", rel)


def load_cards(site):
    """The cards scripts/build_share_cards.py has written; none yet means every page keeps the default."""
    path = Path(site) / "assets" / "img" / "cards" / "cards.json"
    return json.loads(path.read_text(encoding="utf-8"))["cards"] if path.is_file() else {}


def meta_block(title, description, url, eol="\n", card=None):
    # The description comes from an attribute, so it is already escaped for one; apply_meta escapes the title, which was element text.
    image, alt = (card["file"], escape(card["alt"])) if card else (CARD_PATH, CARD_ALT)
    tags = [
        "<!-- page-meta -->",
        f'<link rel="canonical" href="{url}">',
        '<meta property="og:type" content="website">',
        '<meta property="og:site_name" content="ATNI Energy Task Forces">',
        f'<meta property="og:title" content="{title}">',
        f'<meta property="og:description" content="{description}">',
        f'<meta property="og:url" content="{url}">',
        f'<meta property="og:image" content="{SITE_URL}{image}">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        f'<meta property="og:image:alt" content="{alt}">',
        '<meta name="twitter:card" content="summary_large_image">',
        "<!-- /page-meta -->",
    ]
    return "".join(f"  {tag}{eol}" for tag in tags)


def apply_meta(html, rel, cards=None):
    """The page with its tags in place, right after its description. Raises if the page has no title or description to preview."""
    title, description = TITLE.search(html), DESCRIPTION.search(html)
    if not title or not description:
        raise ValueError(f"{rel} needs a <title> and a <meta name=\"description\"> on one line")
    eol = "\r\n" if "\r\n" in html else "\n"
    title = escape(unescape(" ".join(title.group(1).split())), quote=True)  # a quote mark is plain text in <title> and would end the attribute
    block = meta_block(title, description.group(1), url_of(rel), eol, (cards or {}).get(PAGE_CARDS.get(rel)))
    html = BLOCK.sub("", html)
    at = DESCRIPTION.search(html).end()
    return html[:at] + block + html[at:]


def pages(site):
    return sorted(path.relative_to(site).as_posix() for path in site.rglob("*.html"))


def sitemap(site):
    return "".join(url_of(rel) + "\n" for rel in pages(site))


def robots():
    return ("# GitHub Pages serves this site under a path, and crawlers read robots.txt only at a host's root, so this file is a record of intent.\n"
            f"User-agent: *\nAllow: /\nSitemap: {SITE_URL}sitemap.txt\n")


def run(site=SITE, check=False):
    """Writes what is out of date and returns the paths it wrote; with check, writes nothing."""
    stale = []

    def put(path, text):
        if path.exists() and path.read_bytes().decode("utf-8") == text:
            return
        stale.append(path.relative_to(site).as_posix())
        if not check:
            path.write_bytes(text.encode("utf-8"))

    cards = load_cards(site)
    for rel in pages(site):
        path = site / rel
        put(path, apply_meta(path.read_bytes().decode("utf-8"), rel, cards))
    put(site / "sitemap.txt", sitemap(site))
    put(site / "robots.txt", robots())
    return stale


if __name__ == "__main__":
    checking = "--check" in sys.argv
    try:
        changed = run(check=checking)
    except ValueError as error:
        sys.exit(f"add_page_meta: {error}")
    print(f"{'out of date' if checking else 'wrote'}: {', '.join(changed) if changed else 'nothing'}")
    if checking and changed:
        sys.exit("add_page_meta: run python scripts/add_page_meta.py")
