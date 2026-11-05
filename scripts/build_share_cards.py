#!/usr/bin/env python3
"""Builds the link-preview cards in site/assets/img/cards/, one for each lead plate, offline with VectorCraft. Each is 1200 by 630: the ground, the header lockup, the plate's own claim
sentence at its default, poured here and never typed, one orange needle, and a foot giving the date, the source, and the claims with their status. The number on a card is never its only
carrier: the page holds it.

Run after scripts/build_index.py; scripts/add_page_meta.py then points each page's og:image at its card. Both modes print which claim ids each card uses:
   python scripts/build_share_cards.py           # needs vectorcraft-cli on PATH, or its path in VECTORCRAFT_CLI, and League Spartan and Noto Sans in VectorCraft's font list
   python scripts/build_share_cards.py --check   # needs nothing; exit 1 if a card's sentence or foot no longer matches its plate and claims
"""
from html import escape
import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import textwrap

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import build_plates as bp  # noqa: E402

SITE = ROOT / "site"
CARDS = SITE / "assets" / "img" / "cards"
LEAD_PLATES = ("ai-same-hour", "dc-pnw-load", "energy-types-by-stage")
MODEL_SOURCE = "ATNI Energy Task Forces model"
FIRST_CLAIMS = 4  # a card names the lead claims; its page holds the rest
FOOT_CHARS = 88  # shortcut: counts characters, not glyph widths; a changed foot still needs a look at the render
MAX_BYTES = 150_000
FONTS = ("League Spartan", "Noto Sans")  # a family VectorCraft lacks falls back silently, so the build asks first
GROUND, INK, SECONDARY, NEEDLE = "#010B13", "#FFFFFF", "#C6CBD4", "#FF914C"  # tokens: black-bg, heading on dark, de-emphasized, the Energy mark


def figure(value):
    return bp.number(bp.rounded(value))


def all_claims(site):
    out = {}
    for path in (site / "data" / "claims").glob("*.json"):
        out.update({c["id"]: c for c in json.loads(path.read_text(encoding="utf-8")).get("claims", [])})
    return out


def modeled_foot(date, ids, claims):
    """A figure computed from many claims: the model is the source, and the receipts are counted by status."""
    verified = sum(claims[i]["status"] == "verified" for i in ids)
    named = ", ".join(ids[:FIRST_CLAIMS]) + (" and more" if len(ids) > FIRST_CLAIMS else "")
    return f"{date}. Source: {MODEL_SOURCE}\n{len(ids)} claims, {verified} verified, {len(ids) - verified} partly verified: {named}"


def named_foot(date, lead, claims):
    """A figure read from named claims: their publisher, each one's status, and the limit of any that is only partly verified."""
    publishers = list(dict.fromkeys(claims[i]["source"]["publisher"] for i in lead))
    limits = list(dict.fromkeys(claims[i]["limit"].split(";")[0] for i in lead if claims[i]["status"] != "verified"))
    status = ", ".join(f"{i} {'verified' if claims[i]['status'] == 'verified' else 'partly verified'}" for i in lead)
    return "\n".join([f"{date}. Source: {'; '.join(publishers)}", status, *limits])


def explorer_card(site, claims):
    """The Explorer's streamed hour: the words are this card's, and every figure is the model's, at the model's own rounding."""
    model = json.loads((site / "data" / "resource-model.json").read_text(encoding="utf-8"))
    row = next(r for r in model["catalog"] if r["key"] == "catalog.video_hour")
    energy, layers = row["energy_wh"], row["layers"]
    title = f"A streamed hour on a phone: about {figure(energy['value'])} Wh ({figure(energy['low'])} to {figure(energy['high'])}), {figure(layers['router'] + layers['device'])} Wh of it your own screen and router"
    year, month, day = model["built"].split("-")
    date = f"Modeled, {month}/{year}; model built {month}/{day}/{year}"
    ids = [i for i in row["claims"] if not i.startswith("px-")]  # the row's px- claims stand behind its price, and this card prints only energy
    return {"id": "explorer", "title": title, "foot": modeled_foot(date, ids, claims), "lead": ids[:FIRST_CLAIMS], "claims": ids}


def plate_cards(site, claims):
    index = json.loads((site / "data" / "index.json").read_text(encoding="utf-8"))
    out = []
    for plate_id in LEAD_PLATES:
        plate = next(p for p in index["plates"] if p["id"] == plate_id)
        template = json.loads((site / "data" / "plates" / f"{plate_id}.json").read_text(encoding="utf-8"))["title"]
        lead = list(dict.fromkeys(re.findall(r"\bc\[([a-z]+-\d+)\]", template)))  # the claims the sentence itself pours
        modeled = re.search(r"modeled[, ]+(\d{2}/\d{4})", plate.get("eyebrow") or "")
        date = f"Modeled, {modeled[1]}; sources checked {plate['checked']}" if modeled else f"Sources checked {plate['checked']}"
        foot = named_foot(date, lead, claims) if lead else modeled_foot(date, plate["claim_ids"], claims)
        out.append({"id": plate_id, "title": plate["title"], "foot": foot, "lead": lead or plate["claim_ids"][:FIRST_CLAIMS], "claims": plate["claim_ids"]})
    return out


def cards_of(site=SITE):
    claims = all_claims(site)
    return [*plate_cards(site, claims), explorer_card(site, claims)]


def card_svg(card, lockup):
    """The card as one SVG. Past four lines at 56px the sentence steps down to 48px, since a card must not run past four."""
    size, width = 56, 40
    lines = textwrap.wrap(card["title"], width)
    if len(lines) > 4:
        size, width = 48, 46
        lines = textwrap.wrap(card["title"], width)
    if len(lines) > 4:
        raise bp.BuildError(f"{card['id']}: its sentence runs past four lines at 48px; shorten the plate's title")
    foot = card["foot"].split("\n")
    if max(map(len, foot)) > FOOT_CHARS or len(foot) > 3:
        raise bp.BuildError(f"{card['id']}: its foot runs past the card: {foot}")
    leading = size + 8
    top = 300 - (len(lines) * leading) / 2 + size * 0.75
    text = "".join(f'<text x="120" y="{top + i * leading:.0f}" font-family="League Spartan" font-weight="600" font-size="{size}" letter-spacing="{-size / 100}" fill="{INK}">{escape(line)}</text>' for i, line in enumerate(lines))
    spans = "".join(f'<tspan x="120" y="{586 - (len(foot) - 1 - i) * 32}">{escape(line)}</tspan>' for i, line in enumerate(foot))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="{GROUND}"/>'
            f'<rect x="95" y="0" width="2" height="630" fill="{NEEDLE}"/><g transform="translate(120 48) scale({48 / 880})">{lockup}</g>{text}'
            f'<text font-family="Noto Sans" font-size="24" fill="{SECONDARY}">{spans}</text></svg>')


def lockup_inner(site):
    """The header lockup's own drawing, without its svg element or title."""
    svg = (site / "assets" / "img" / "atni-energy-header-on-dark.svg").read_text(encoding="utf-8")
    return re.sub(r"<title>.*?</title>", "", svg[svg.index(">") + 1:svg.rindex("</svg>")], flags=re.S)


def check_png(path):
    data = path.read_bytes()
    if struct.unpack(">II", data[16:24]) != (1200, 630) or len(data) > MAX_BYTES:
        raise bp.BuildError(f"{path.name}: {struct.unpack('>II', data[16:24])} at {len(data)} bytes; a card is 1200 by 630 and under {MAX_BYTES}")


def build(site=SITE):
    cli = os.environ.get("VECTORCRAFT_CLI") or shutil.which("vectorcraft-cli")
    if not cli:
        raise bp.BuildError("vectorcraft-cli is not on PATH: set VECTORCRAFT_CLI to its path")
    for family in FONTS:
        if subprocess.run([cli, "run", "--cmd", "text.fontList", "--params", json.dumps({"family": family})], capture_output=True, check=False).returncode:
            raise bp.BuildError(f"VectorCraft lacks {family}: add its .ttf with text.findFontFiles and text.addFontFiles")
    folder = site / "assets" / "img" / "cards"
    folder.mkdir(parents=True, exist_ok=True)
    cards, lockup = cards_of(site), lockup_inner(site)
    with tempfile.TemporaryDirectory() as tmp:
        for card in cards:
            source = Path(tmp) / f"{card['id']}.svg"
            source.write_text(card_svg(card, lockup), encoding="utf-8")
            done = subprocess.run([cli, "convert", str(source), str(folder / f"{card['id']}.png")], capture_output=True, text=True, check=False)
            if done.returncode:
                raise bp.BuildError(f"{card['id']}: vectorcraft-cli failed: {done.stderr or done.stdout}")
            check_png(folder / f"{card['id']}.png")
    write_list(site, cards)
    return cards


def write_list(site, cards):
    data = {"schema": 1, "tier": "T0", "cards": {c["id"]: {"file": f"assets/img/cards/{c['id']}.png", "alt": c["title"], "foot": c["foot"], "lead": c["lead"], "claims": c["claims"]} for c in cards}}
    (site / "assets" / "img" / "cards" / "cards.json").write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")


def stale(site=SITE):
    """The cards whose sentence or foot no longer matches what they were poured from."""
    written = json.loads((site / "assets" / "img" / "cards" / "cards.json").read_text(encoding="utf-8"))["cards"]
    return [c["id"] for c in cards_of(site) if (written.get(c["id"], {}).get("alt"), written.get(c["id"], {}).get("foot")) != (c["title"], c["foot"])]


def used(cards):
    return {c["id"]: {"lead": c["lead"], "claims": c["claims"]} for c in cards}


if __name__ == "__main__":
    try:
        if "--check" in sys.argv:
            old = stale()
            print(json.dumps({"stale": old, "cards": used(cards_of())}))
            sys.exit(f"build_share_cards: run python scripts/build_share_cards.py: {old}" if old else 0)
        print(json.dumps({"built": used(build())}))
    except (bp.BuildError, KeyError) as error:  # KeyError: a card names a claim the site does not hold, or one with no limit printed
        sys.exit(f"build_share_cards: {error!r}")
