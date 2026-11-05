"""The Council Briefing's PDF: site/briefing/atni-energy-briefing.pdf against the packet the Briefing makes now, and what the file promises, read back. No browser."""
from pathlib import Path
import re
import shutil
import sys

import fitz

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import build_briefing_pdf as bpdf  # noqa: E402
import validate_public as vp  # noqa: E402

FILE = ROOT / "site" / "briefing" / bpdf.NAME


def test_the_real_pdf_is_the_packet_the_briefing_makes_now():
    assert bpdf.stale() == [], "run python scripts/build_briefing_pdf.py"


def test_a_pdf_built_from_another_packet_is_named_stale(tmp_path):
    copy = tmp_path / bpdf.NAME
    shutil.copyfile(FILE, copy)
    with fitz.open(copy) as doc:
        doc.set_metadata({**doc.metadata, "keywords": f"packet-sha256={'0' * 64}"})
        doc.saveIncr()
    assert any("changed since" in reason for reason in bpdf.stale(pdf=copy))
    with fitz.open(copy) as doc:
        doc.set_metadata({**doc.metadata, "keywords": ""})
        doc.saveIncr()
    assert any("carries no packet hash" in reason for reason in bpdf.stale(pdf=copy))
    assert bpdf.stale(pdf=tmp_path / "missing.pdf")[0].startswith("missing.pdf is not in")


def test_the_link_counts_megabytes_as_a_million_bytes():
    assert "1.2 MB" in bpdf.link_html({"pages": 3, "bytes": 1_200_000}), "binary megabytes would read 1.1"


def test_the_hash_follows_the_stylesheets_scripts_and_fonts_the_page_is_drawn_with(tmp_path):
    site = tmp_path / "site"
    files = {"briefing/index.html": '<link rel="stylesheet" href="../assets/css/a.css"><link rel="icon" href="../assets/img/f.svg"><script defer src="../assets/js/b.js"></script>',
             "assets/css/a.css": '@font-face { src: url("../fonts/f.woff2"); } .h { background: url("../img/bg/p.webp"); } .m { background: url(../img/m.svg); }',
             "assets/js/b.js": "one();", "assets/js/other.js": "other();", "assets/fonts/f.woff2": "font", "assets/img/m.svg": "<svg/>", "assets/img/bg/p.webp": "photo", "assets/img/f.svg": "<svg/>"}
    for rel, text in files.items():
        (site / rel).parent.mkdir(parents=True, exist_ok=True)
        (site / rel).write_text(text, encoding="utf-8")
    assert [p.relative_to(site.resolve()).as_posix() for p in bpdf.drawn_with(site)] == ["assets/css/a.css", "assets/fonts/f.woff2", "assets/img/m.svg", "assets/js/b.js"]
    before = bpdf.drawn_with_digest(site)
    (site / "assets/js/other.js").write_text("changed();", encoding="utf-8")
    (site / "assets/img/bg/p.webp").write_text("changed", encoding="utf-8")
    assert bpdf.drawn_with_digest(site) == before, "a script the page does not load, and a photograph it does not print, are not part of the sheet"
    (site / "assets/js/b.js").write_bytes(b"one();\r\ntwo();")
    crlf = bpdf.drawn_with_digest(site)
    (site / "assets/js/b.js").write_bytes(b"one();\ntwo();")
    assert bpdf.drawn_with_digest(site) == crlf != before, "a script it loads is, and a checkout's line ends are not"


def test_every_sheet_says_default_settings_and_the_day_and_every_link_is_https_or_inside_the_pdf():
    with fitz.open(FILE) as doc:
        built = re.search(r"Built (\d{2}/\d{2}/\d{4})\.", doc.metadata["subject"])[1]
        meta = " ".join(str(value) for value in doc.metadata.values())
        links = [link for page in doc for link in page.get_links()]
    errors, _ = bpdf.verify(FILE, built)
    assert not errors, errors
    assert any(link.get("nameddest") for link in links) and any(str(link.get("uri")).startswith(vp.OWN_ORIGIN) for link in links), "contents jump inside the PDF; other pages are the public site's"
    assert not re.search(r"(?i)claude|anthropic|openai|chatgpt|codex|copilot|gemini", meta), "no AI tool is credited in the file"


def test_the_validator_reads_a_pdf_for_local_paths_and_addresses(tmp_path):
    def make(name, text, uri):
        doc = fitz.open()
        page = doc.new_page()
        page.insert_text((72, 72), text)
        page.insert_link({"kind": fitz.LINK_URI, "from": fitz.Rect(72, 60, 300, 80), "uri": uri})
        doc.save(tmp_path / name)
        errors = []
        vp.check_pdf(tmp_path / name, name, errors)
        return errors

    assert make("clean.pdf", "Read it at https://atniclimate.github.io/atni-task-force/briefing/", f"{vp.OWN_ORIGIN}briefing/") == []
    bad = make("local.pdf", "Saved from C:/Users/someone/briefing.html, printed from http://127.0.0.1:8000/briefing/", "http://localhost:8000/ai/")
    assert [kind for kind in ("Local path in PDF text", "Local address in PDF text", "Local address in a PDF link") if any(e.startswith(kind) for e in bad)] == ["Local path in PDF text", "Local address in PDF text", "Local address in a PDF link"], bad
