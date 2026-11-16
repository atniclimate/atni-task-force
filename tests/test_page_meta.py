"""Link-preview tags: scripts/add_page_meta.py is idempotent, every page carries them, and the public check allows only this site's own canonical address."""
import importlib.util
import json
import posixpath
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import add_page_meta as meta  # noqa: E402

spec = importlib.util.spec_from_file_location("validate_public", ROOT / "scripts" / "validate_public.py")
validate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validate)

PAGE = '<!doctype html>\n<head>\n  <title>About | ATNI</title>\n  <meta name="description" content="About the work.">\n  <meta name="color-scheme" content="dark light">\n</head>\n'


def test_a_page_gets_its_tags_once_and_keeps_its_line_endings():
    once = meta.apply_meta(PAGE, "about/index.html")
    assert once.count('rel="canonical"') == 1 and f'href="{meta.SITE_URL}about/"' in once
    for tag in ('og:title" content="About | ATNI"', 'og:description" content="About the work."', f'og:image" content="{meta.SITE_URL}assets/img/share-card.png"'):
        assert tag in once
    assert meta.apply_meta(once, "about/index.html") == once
    assert once.index('name="description"') < once.index("page-meta") < once.index("color-scheme")
    crlf = meta.apply_meta(PAGE.replace("\n", "\r\n"), "index.html")
    assert "\n" not in crlf.replace("\r\n", "") and f'href="{meta.SITE_URL}"' in crlf
    assert meta.apply_meta(crlf, "index.html") == crlf


def test_a_page_with_a_lead_plate_takes_its_card_and_its_sentence_as_alt():
    cards = {"ai-same-hour": {"file": "assets/img/cards/ai-same-hour.png", "alt": 'An hour of "chat" & video'}}
    once = meta.apply_meta(PAGE, "ai/index.html", cards)
    assert f'og:image" content="{meta.SITE_URL}assets/img/cards/ai-same-hour.png"' in once and 'og:image:alt" content="An hour of &quot;chat&quot; &amp; video"' in once
    other = meta.apply_meta(PAGE, "about/index.html", cards)
    assert f'og:image" content="{meta.SITE_URL}{meta.CARD_PATH}"' in other and meta.CARD_ALT in other, "a page with no lead plate keeps the default"
    assert meta.PAGE_CARDS["index.html"] == "ai-same-hour", "home leads with the same plate as the AI page"


def test_a_changed_title_replaces_the_old_tags():
    once = meta.apply_meta(PAGE, "index.html")
    again = meta.apply_meta(once.replace("<title>About | ATNI</title>", "<title>New</title>"), "index.html")
    assert 'og:title" content="New"' in again and "About | ATNI" not in again


def test_a_page_with_nothing_to_preview_fails_by_name():
    with pytest.raises(ValueError, match="x/index.html"):
        meta.apply_meta("<title>Only</title>", "x/index.html")


def test_run_writes_then_has_nothing_left_to_do(tmp_path):
    (tmp_path / "ai").mkdir()
    (tmp_path / "ai" / "index.html").write_text(PAGE, encoding="utf-8", newline="")
    assert meta.run(tmp_path, check=True) == ["ai/index.html", "sitemap.txt", "robots.txt"]
    assert not (tmp_path / "sitemap.txt").exists()
    assert meta.run(tmp_path) == ["ai/index.html", "sitemap.txt", "robots.txt"]
    assert meta.run(tmp_path) == []
    assert (tmp_path / "sitemap.txt").read_text(encoding="utf-8") == f"{meta.SITE_URL}ai/\n"
    assert f"Sitemap: {meta.SITE_URL}sitemap.txt" in (tmp_path / "robots.txt").read_text(encoding="utf-8")


def test_the_real_site_is_up_to_date():
    assert meta.run(check=True) == [], "run python scripts/add_page_meta.py"


def test_the_footer_names_the_newest_whats_new_date(tmp_path):
    (tmp_path / "data").mkdir()
    (tmp_path / "data" / "whats-new.json").write_text(json.dumps({"items": [{"date": "2026-11-03"}, {"date": "2026-11-12"}, {"date": "soon"}, {}]}), encoding="utf-8")
    assert meta.newest_day(tmp_path) == "11/12/2026" and meta.newest_day(tmp_path / "none") is None
    page = PAGE + '<footer><p class="footer-updated">Updated 01/01/2020.</p></footer>\n'
    assert '<p class="footer-updated">Updated 11/12/2026.</p>' in meta.stamp_footer(page, "11/12/2026")
    assert meta.stamp_footer(page, None) == page, "no date in the file leaves the footer as it stands"


SHELL = re.compile(r'<header class="site-header"[^>]*>.*?</header>|<footer class="site-footer">.*?</footer>', re.S)
LINK = re.compile(r'(href|src)="(?![a-z]+:|#)([^"]*)"')


def shell_of(rel, text):
    """A page's header and footer with every relative address resolved from the site's root and the current-page marks set aside."""
    here = posixpath.dirname(rel)

    def resolve(m):
        target = posixpath.normpath(posixpath.join(here, m[2]))
        target = "" if target == "." else target + ("/" if m[2].endswith("/") else "")
        return f'{m[1]}="/{target}"'
    return LINK.sub(resolve, re.sub(r' aria-current="(?:page|true)"', "", "\n".join(SHELL.findall(text))))


def test_every_page_carries_one_shell():
    """DIRECTION-R2 3.13: the header, nav, and footer are hand-copied into every page, and each copy is the same once its paths are read from the site's
    root and its current-page marks are set aside. The nav marks one section at most."""
    shells = {}
    for path in sorted((ROOT / "site").rglob("*.html")):
        rel = path.relative_to(ROOT / "site").as_posix()
        text = path.read_text(encoding="utf-8")
        assert len(SHELL.findall(text)) == 2, f"{rel}: one site header and one site footer"
        assert len(re.findall(r'aria-current="(?:page|true)"', re.search(r'<nav class="site-nav".*?</nav>', text, re.S)[0])) <= 1, f"{rel}: one current section"
        shells.setdefault(shell_of(rel, text), []).append(rel)
    assert len(shells) == 1, {k[:200]: v for k, v in shells.items()}


def test_speculation_rules_name_only_this_sites_pages_and_pass_the_public_check():
    page = validate.Page()
    page.feed(meta.apply_meta(PAGE, "ai/index.html"))
    (script,) = page.scripts
    errors = []
    validate.check_js("the rules", script, errors)
    assert not errors and not page.refs, "inline JSON that loads nothing and names no other address"
    assert all(p.startswith("/atni-task-force/") for p in re.findall(r'"(/[^"]*)"', script)), "never the origin's root, which serves other repositories"
    rules = json.loads(script)
    for action in ("prefetch", "prerender"):
        (rule,) = rules[action]
        pages, *unless = rule["where"]["and"]
        assert all(p.endswith(("/", ".html")) for p in pages["href_matches"]), "pages only: no data file, PDF, or image"
        assert {"not": {"href_matches": "/atni-task-force/briefing*"}} in unless
    assert {"not": {"href_matches": "/atni-task-force/library*"}} in rules["prerender"][0]["where"]["and"], "the Library's script records a visit as it runs"


def test_validate_allows_only_this_sites_canonical():
    own = validate.Page()
    own.feed(f'<link rel="canonical" href="{meta.SITE_URL}ai/">')
    assert own.refs == []
    for other in (f'<link rel="canonical" href="https://elsewhere.org/ai/">', f'<link rel="stylesheet" href="{meta.SITE_URL}x.css">'):
        page = validate.Page()
        page.feed(other)
        assert page.refs, other
