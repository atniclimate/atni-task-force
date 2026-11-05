"""Link-preview tags: scripts/add_page_meta.py is idempotent, every page carries them, and the public check allows only this site's own canonical address."""
import importlib.util
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


def test_validate_allows_only_this_sites_canonical():
    own = validate.Page()
    own.feed(f'<link rel="canonical" href="{meta.SITE_URL}ai/">')
    assert own.refs == []
    for other in (f'<link rel="canonical" href="https://elsewhere.org/ai/">', f'<link rel="stylesheet" href="{meta.SITE_URL}x.css">'):
        page = validate.Page()
        page.feed(other)
        assert page.refs, other
