"""Screen cleaned T1 notes, section by section, for a T1 -> T0 release recommendation.

Jev (TypeSafe System One) supplies typed judgments about each section; the release
recommendation is decided in code by `decide()`. The owner makes every release decision;
this only builds the queue. Run from the repository root:

    python scripts/jev_release_screen.py --notes planning-T1/ai-notes/cleaned --out planning-T1/ai-notes
    python scripts/jev_release_screen.py --self-test

Requires TYPESAFE_API_KEY. Sends section text to https://api.typesafe.ai; never run it on
material the owner has not cleared for Jev, and never on anything that may be T2 or T3.
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

API = "https://api.typesafe.ai/v1/systemone"
MODEL = "jev-latest"
YES, NO = 0.7, 0.3  # Noul thresholds; the band between them is "unsettled"

# All question wording lives here. `section` is the state field each question reads.
QUESTIONS = {
    "private_people": {
        "type": "noul",
        "instructions": "Does `section` name or identify private individuals, meaning people who are not public officials or public figures?",
        "criteria": {"true": "A private person is named or can be identified from the details given.",
                     "false": "Only public officials, public figures, organizations or roles appear, or no people at all."},
    },
    "internal_matters": {
        "type": "noul",
        "instructions": "Does `section` describe ATNI's internal plans, budgets, staffing, negotiations or decisions that have not been announced?",
    },
    "tribe_sensitive": {
        "type": "noul",
        "instructions": "Does `section` give details about a specific Tribe's lands, resources, cultural practices, sacred sites or internal affairs?",
        "criteria": {"true": "A specific Tribe's lands, resources, cultural practices, sacred sites or internal affairs are described in detail.",
                     "false": "Tribes are discussed in general, or only public facts such as a Tribe's name or a published plan are mentioned."},
    },
    "partner_confidential": {
        "type": "noul",
        "instructions": "Does `section` pass on information that a partner, agency or company shared in a meeting or privately?",
    },
    "personal_voice": {
        "type": "noul",
        "instructions": "Is `section` written as the author's personal reflection or opinion rather than as a statement an organization would publish?",
    },
    "copied_text": {
        "type": "noul",
        "instructions": "Does `section` reproduce long passages of another author's published writing?",
    },
    "finish": {
        "type": "score",
        "instructions": "How finished is the writing in `section`?",
        "criteria": [
            "Fragments, shorthand or one-word jottings",
            "Working notes in partial sentences",
            "Readable prose that needs editing",
            "Polished prose ready for readers",
        ],
    },
    "public_value": {
        "type": "noul",
        "instructions": "Would `section` help Tribal leaders or the public understand AI, data centers or Tribal energy?",
    },
    "practice_value": {
        "type": "noul",
        "instructions": "Would `section` help Tribal staff or leaders decide how to use AI tools well in their own work?",
    },
    "planning_value": {
        "type": "noul",
        "instructions": "Does `section` contain ideas that could shape a task force work plan or a meeting agenda?",
    },
    "report_value": {
        "type": "noul",
        "instructions": "Does `section` contain arguments or evidence that could support a policy report?",
    },
}


def decide(a):
    """Map Jev answers (dict of floats; `finish` is a 0-3 position) to (recommendation, tags)."""
    tags = [t for t, k in (("background-literature", "public_value"), ("practice-guidance", "practice_value"),
                           ("planning", "planning_value"), ("reports", "report_value")) if a[k] >= YES]
    if a["tribe_sensitive"] >= YES:
        return "HOLD: possible T2/T3 material; owner review; keep out of all shared outputs", tags
    guards = [a[k] for k in ("private_people", "internal_matters", "partner_confidential")]
    if max(guards) >= YES:
        return "T1: network only", tags
    if max(guards) > NO or a["tribe_sensitive"] > NO:
        return "T1: owner review (judgments unsettled)", tags
    if max(a["public_value"], a["practice_value"]) < YES:
        return "T1: internal use", tags
    if a["personal_voice"] >= YES or a["copied_text"] >= YES or a["finish"] < 1.5:
        return "T0 candidate after rewrite", tags
    return "T0 candidate", tags


# A capitalized proper name directly before a Nation word, e.g. "Yakama Nation", "Indian Reservation".
NATION = re.compile(r"\b([A-Z][A-Za-z'’-]+)\s+(?:Tribe|Nation|Band|Indian Community|Reservation|Rancheria|Pueblo)\b")
GENERIC = {"Tribal", "First", "Indigenous", "Affiliated", "Sovereign", "Native", "Federally", "Each", "Every",
           "The", "A", "Any", "One", "Member", "Host", "United", "Northwest", "American", "Recognized", "Our",
           "This", "That", "Its", "Their", "Sovereignty", "Partner", "Network", "Community"}


def hold_reason(text, terms):
    """Local pre-screen: name the specific Nations or flagged terms that keep a section away from Jev."""
    found = {m[1] + " ..." for m in NATION.finditer(text) if m[1] not in GENERIC}
    found |= {t for t in terms if re.search(r"(?<!\w)" + re.escape(t) + r"(?!\w)", text, re.I)}
    return sorted(found)


def sections(path):
    """Split a cleaned note into (heading, text) pairs at H2 headings."""
    text = path.read_text(encoding="utf-8")
    m = re.search(r"^# (.+)$", text, re.M)
    title = m[1].strip() if m else path.stem
    parts = re.split(r"^## +(.+)$", text, flags=re.M)
    return title, [(parts[i].strip(), parts[i + 1].strip()) for i in range(1, len(parts) - 1, 2) if parts[i + 1].strip()]


def ask(payload, cache, log):
    body = json.dumps(payload, sort_keys=True).encode()
    key = hashlib.sha256(body).hexdigest()
    hit = cache / f"{key}.json"
    if hit.exists():
        return json.loads(hit.read_text(encoding="utf-8"))
    req = urllib.request.Request(API, data=body, method="POST", headers={
        "Authorization": "Bearer " + os.environ["TYPESAFE_API_KEY"], "Content-Type": "application/json"})
    out = None
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                out = json.loads(r.read())
            break
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503, 504) or attempt == 4:
                raise RuntimeError(f"Jev call failed ({e.code}): {e.read()[:300]!r}") from e
        except urllib.error.URLError:
            if attempt == 4:
                raise
        time.sleep(2 ** attempt)
    assert out is not None
    hit.write_text(json.dumps(out, indent=1), encoding="utf-8")
    with log.open("a", encoding="utf-8") as f:
        f.write(json.dumps({"key": key, "payload": payload, "model": out.get("model")}) + "\n")
    return out


def flatten(answers):
    return {k: (v["score"] if v["type"] == "score" else v["noul"]) for k, v in answers.items()}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--notes", type=Path)
    p.add_argument("--out", type=Path, help="required: a folder git ignores, such as planning-T1/ai-notes")
    p.add_argument("--hold-terms", type=Path, help="file of names/terms (one per line) that keep a section local")
    p.add_argument("--hold-notes", default="", help="comma-separated note slugs never sent to Jev")
    p.add_argument("--self-test", action="store_true")
    args = p.parse_args()
    if args.self_test:
        return self_test()
    # The cache and log hold T1 text sent to Jev: they may only land where git ignores them.
    root = Path(__file__).resolve().parents[1]
    if args.out is None or subprocess.run(["git", "-C", str(root), "check-ignore", "-q", str(args.out.resolve())]).returncode != 0:
        sys.exit(f"--out must be a folder git ignores (for example planning-T1/ai-notes); refusing {args.out}: "
                 "the Jev cache and request log hold T1 text and must never be committable")
    terms = [t.strip() for t in args.hold_terms.read_text(encoding="utf-8").splitlines()
             if t.strip() and not t.startswith("#")] if args.hold_terms else []
    hold_notes = {s for s in args.hold_notes.split(",") if s}
    cache = args.out / "jev-cache"
    cache.mkdir(parents=True, exist_ok=True)
    log = args.out / "jev-requests.log"
    jobs, rows = [], []
    for path in sorted(args.notes.glob("*.md")):
        title, secs = sections(path)
        for heading, text in secs:
            why = ["whole note held"] if path.stem in hold_notes else hold_reason(heading + "\n" + text, terms)
            if why:
                rows.append({"note": path.stem, "title": title, "section": heading, "chars": len(text),
                             "recommendation": "HOLD: local pre-screen, not sent to Jev; owner review",
                             "tags": [], "answers": None, "held_for": why, "model": None})
                continue
            state = {"document": title, "heading": heading, "section": text[:12000]}
            jobs.append((path.stem, title, heading, len(text), {"model": MODEL, "state": state, "questions": QUESTIONS}))
    print(f"{len(jobs)} sections to Jev; {len(rows)} held locally")
    with ThreadPoolExecutor(4) as pool:
        results = list(pool.map(lambda j: ask(j[4], cache, log), jobs))
    for (slug, title, heading, chars, _), out in zip(jobs, results):
        a = flatten(out["answers"])
        rec, tags = decide(a)
        rows.append({"note": slug, "title": title, "section": heading, "chars": chars,
                     "recommendation": rec, "tags": tags, "answers": a, "model": out.get("model")})
    (args.out / "release-screen.json").write_text(json.dumps(rows, indent=1), encoding="utf-8")
    write_queue(rows, args.out / "RELEASE-QUEUE.md")
    print(json.dumps({r: sum(1 for x in rows if x["recommendation"] == r) for r in sorted({x["recommendation"] for x in rows})}, indent=1))


def write_queue(rows, path):
    lines = ["# AI notes release queue (T1)", "",
             "> Tier: T1. Jev judgments per section, release recommendation decided in code by",
             "> `scripts/jev_release_screen.py`. Recommendations only: every release is an owner decision,",
             "> recorded in `planning-T1/RELEASE-LOG.md`.", ""]
    for note in dict.fromkeys(r["note"] for r in rows):
        sub = [r for r in rows if r["note"] == note]
        lines += [f"## {sub[0]['title']}", "", "| Section | Recommendation | Uses | Signals |", "|---|---|---|---|"]
        for r in sub:
            a = r["answers"]
            if a is None:
                lines.append(f"| {r['section']} | {r['recommendation']} | - | held for: {', '.join(r['held_for'])} |")
                continue
            sig = ", ".join(f"{k} {a[k]:.2f}" for k in ("private_people", "internal_matters", "tribe_sensitive",
                                                          "partner_confidential", "personal_voice", "public_value")
                            if a[k] > NO) or "none above 0.3"
            lines.append(f"| {r['section']} | {r['recommendation']} | {', '.join(r['tags']) or '-'} | {sig}; finish {a['finish']:.1f}/3 |")
        lines.append("")
    path.write_text("\n".join(lines), encoding="utf-8")


def self_test():
    base = dict(private_people=0.05, internal_matters=0.05, tribe_sensitive=0.05, partner_confidential=0.05,
                personal_voice=0.1, copied_text=0.05, finish=2.6, public_value=0.9, practice_value=0.2,
                planning_value=0.8, report_value=0.2)
    assert decide(base) == ("T0 candidate", ["background-literature", "planning"])
    assert decide({**base, "public_value": 0.3, "practice_value": 0.8, "personal_voice": 0.8}) == \
        ("T0 candidate after rewrite", ["practice-guidance", "planning"])
    assert decide({**base, "tribe_sensitive": 0.8})[0].startswith("HOLD")
    assert decide({**base, "private_people": 0.9})[0] == "T1: network only"
    assert decide({**base, "internal_matters": 0.5})[0].startswith("T1: owner review")
    assert decide({**base, "public_value": 0.4})[0] == "T1: internal use"
    assert decide({**base, "public_value": 0.4, "practice_value": 0.75})[0] == "T0 candidate"
    assert decide({**base, "personal_voice": 0.8})[0] == "T0 candidate after rewrite"
    assert decide({**base, "finish": 0.9})[0] == "T0 candidate after rewrite"
    assert hold_reason("Tribal Nations and the Affiliated Tribes met.", []) == []
    assert hold_reason("The Yakama Nation and Confederated Tribes of the Umatilla Indian Reservation", []) == \
        ["Indian ...", "Yakama ..."]
    assert hold_reason("Work with ESIIL staff", ["esiil"]) == ["esiil"]
    assert hold_reason("a mosquito", ["MG"]) == []
    _, secs = sections(Path(__file__))  # this file has no H2 headings
    assert secs == []
    print("self-test passed")


if __name__ == "__main__":
    sys.exit(main())
