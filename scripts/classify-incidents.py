#!/usr/bin/env python3
"""
Offline incident classifier for Incident Lens.

Assigns each incident one primary harm category (7-category taxonomy).
CSET annotations are applied first; remaining rows use --openai or rubric fallback.

Usage:
  python3 scripts/classify-incidents.py
      CSET rules + rubric fallback for unannotated rows (no API).

  python3 scripts/classify-incidents.py --openai
      CSET rules first, then OpenAI for any row not classified by CSET.

Requires: stdlib for default mode; pip install openai for --openai.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INCIDENTS_CSV = ROOT / "data" / "incidents.csv"
CLASSIFICATIONS_CSV = ROOT / "data" / "classifications_CSETv1.csv"
OUTPUT_JSON = ROOT / "data" / "incident-categories.json"

VALID_IDS = (
    "discrimination",
    "privacy",
    "misinformation",
    "safety",
    "economic",
    "harmful_content",
    "malicious",
)

RUBRIC = """
Taxonomy (assign exactly one id):

- discrimination: Unfair or disparate treatment tied to protected characteristics,
  bias in rankings/scores/search, civil-rights or anti-discrimination framing.

- privacy: Biometrics, facial recognition, surveillance, stalking, unauthorized
  identification, BIPA-style privacy harms, data exposure.

- misinformation: False or manipulated information, deepfakes, disinformation
  campaigns, synthetic media used to deceive (not just toxic speech).

- safety: Physical injury risk or harm, autonomous vehicles, robotics, drones,
  clinical/operational safety failures, near-misses with bodily harm.

- economic: Employment, hiring, benefits, welfare scoring, lending, housing,
  criminal-justice or government decision systems affecting socioeconomic status.

- harmful_content: Platform moderation failures, hate speech, toxic amplification,
  harmful content to minors, brand-safety / policy enforcement gaps.

- malicious: AI or actors intentionally designed or deployed to scam, attack,
  harass, or cause deliberate harm (not merely negligent bias).
""".strip()

# Rubric-aligned patterns for rows without CSET (fallback only). Order = priority.
RUBRIC_RULES: list[tuple[str, list[str]]] = [
    ("malicious", [
        r"\bintentionally\b.*\bharm\b", r"\bscam\b", r"\bdeepfake\b.*\b(non-)?consensual\b",
        r"\badversarial attack\b", r"\bweapon\b", r"\bdeepfake porn\b",
    ]),
    ("misinformation", [
        r"\bdeepfake\b", r"\bmisinformation\b", r"\bdisinformation\b",
        r"\bfake news\b", r"\bsynthetic (media|image|video)\b",
        r"\bmanipulated (image|video|photo)\b",
    ]),
    ("privacy", [
        r"\bfacial recognition\b", r"\bface recognition\b", r"\bbiometric\b",
        r"\bsurveillance\b", r"\bprivacy\b", r"\bpimeyes\b", r"\bbipa\b",
        r"\bstalking\b",
    ]),
    ("safety", [
        r"\bself[- ]driving\b", r"\bautonomous (vehicle|car|bus|shuttle)\b",
        r"\bautopilot\b", r"\bkilled\b", r"\bpedestrian\b", r"\bcollision\b",
        r"\brobot\b.*\b(hit|strike|injur)\b", r"\bdrone\b.*\b(strike|attack)\b",
        r"\bnuclear\b", r"\bclinical\b.*\b(harm|error|wrong)\b",
    ]),
    ("harmful_content", [
        r"\bhate speech\b", r"\bcontent moderation\b", r"\bmoderation\b.*\bfail",
        r"\btoxic\b", r"\bharassment\b", r"\beating disorder\b",
        r"\bviolating content\b", r"\bremoved\b.*\b(post|video|content)\b",
    ]),
    ("discrimination", [
        r"\bbias\b", r"\bbiased\b", r"\bdiscriminat", r"\bracist\b", r"\bsexist\b",
        r"\bgender bias\b", r"\bdisparate\b", r"\bprotected characteristic\b",
        r"\bunfair\b.*\b(hiring|lending|score|search|ranking)\b",
    ]),
    ("economic", [
        r"\bhiring\b", r"\bemployment\b", r"\bwelfare\b", r"\bbenefits\b",
        r"\bcredit score\b", r"\blending\b", r"\bhousing\b", r"\bparole\b",
        r"\bbail\b", r"\binsurance\b.*\b(score|rate)\b", r"\bworkplace\b",
    ]),
]


def load_classifications() -> dict[str, dict]:
    by_id: dict[str, dict] = {}
    if not CLASSIFICATIONS_CSV.exists():
        return by_id
    with CLASSIFICATIONS_CSV.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            inc_num = (row.get("Incident Number") or "").strip()
            if inc_num:
                by_id[inc_num] = row
    return by_id


def load_incidents() -> list[dict]:
    with INCIDENTS_CSV.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def yn(val: str) -> str:
    return (val or "").strip().lower()


def cset_blob(row: dict) -> str:
    keys = (
        "Sector of Deployment",
        "AI Task",
        "AI System Description",
        "Notes (special interest intangible harm)",
        "Notes (AI special interest intangible harm)",
        "AI Tangible Harm Level Notes",
        "Notes (Information about AI System)",
        "Intentional Harm",
        "Harm Distribution Basis",
        "Infrastructure Sectors",
        "Entities",
    )
    parts = []
    for key in keys:
        v = (row.get(key) or "").strip()
        if v and v.lower() not in ("no", "yes", "maybe", "false", "true", "--"):
            parts.append(v)
    return " ".join(parts).lower()


def classify_from_cset(row: dict) -> str | None:
    """CSET-first decision tree. Returns None if inconclusive."""
    text = cset_blob(row)
    intentional = (row.get("Intentional Harm") or "").strip()
    if re.match(r"^yes\b", intentional, re.I) and "intentionally" in intentional.lower():
        return "malicious"

    rights = yn(row.get("Rights Violation"))
    protected = yn(row.get("Protected Characteristic"))
    basis = yn(row.get("Harm Distribution Basis"))
    if rights == "yes" or protected == "yes" or (basis and basis != "none"):
        return "discrimination"

    if re.search(
        r"facial recognition|face recognition|biometric|bipa|surveillance|"
        r"privacy infringement|pimeyes|stalking|scraping.*face",
        text,
    ):
        return "privacy"

    if re.search(
        r"misinformation|disinformation|deepfake|fact-check|fact check|"
        r"synthetic media|manipulated (image|video)|fake news",
        text,
    ):
        return "misinformation"

    tangible = (row.get("Tangible Harm") or "").lower()
    physical = yn(row.get("Physical Objects"))
    sector = (row.get("Sector of Deployment") or "").lower()
    infra = (row.get("Infrastructure Sectors") or "").lower()
    ai_task = (row.get("AI Task") or "").lower()
    lives = (row.get("Lives Lost") or "0").strip()
    injuries = (row.get("Injuries") or "0").strip()

    try:
        lives_n = int(float(lives)) if lives else 0
    except ValueError:
        lives_n = 0
    try:
        inj_n = int(float(injuries)) if injuries else 0
    except ValueError:
        inj_n = 0

    physical_risk = (
        "tangible harm definitively" in tangible
        or "imminent risk" in tangible
        or "near miss" in tangible
        or lives_n > 0
        or inj_n > 0
    )
    safety_context = (
        physical == "yes"
        or "transportation" in sector
        or "transportation" in infra
        or "autonom" in ai_task
        or "autonomous" in ai_task
        or re.search(r"\b(robot|drone|vehicle|airplane|aircraft|surgical)\b", text)
        or (
            "health" in sector
            and re.search(r"\b(patient|clinical|diagnos|hospital|medical device)\b", text)
            and not re.search(r"\b(bias|discriminat|score|risk score)\b", text)
        )
    )
    if physical_risk and safety_context:
        return "safety"

    if yn(row.get("Detrimental Content")) == "yes":
        return "harmful_content"
    if re.search(
        r"hate speech|content moderation|toxic|harassment|eating disorder|"
        r"violating content|brand safety|csam|child safety",
        text,
    ):
        return "harmful_content"

    if re.search(
        r"administrative and support|employment|welfare|hiring|recruit|"
        r"human resources|financial and insurance|parole|bail|sentencing|"
        r"criminal justice|public administration|education.*\b(hiring|admission|grade)\b",
        sector + " " + text,
    ):
        return "economic"
    if re.search(
        r"\b(hiring|employment|welfare|benefits|lending|credit|housing|"
        r"parole|workplace|job applicant)\b",
        text,
    ):
        return "economic"

    return None


def classify_rubric_fallback(title: str, description: str) -> str:
    blob = f"{title} {description}".lower()
    for cat_id, patterns in RUBRIC_RULES:
        for pat in patterns:
            if re.search(pat, blob, re.I):
                return cat_id
    return "economic"


def classify_openai_batch(
    incidents: list[dict],
    cset_map: dict[str, dict],
    only_ids: set[str] | None = None,
) -> dict[str, str]:
    try:
        from openai import OpenAI
    except ImportError:
        print(
            "OpenAI package not found for this Python.\n"
            f"  Interpreter: {sys.executable}\n"
            "  Fix: python3 -m pip install openai\n"
            "  (Use the same python3 you run this script with.)",
            file=sys.stderr,
        )
        sys.exit(1)

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("Set OPENAI_API_KEY for --openai mode", file=sys.stderr)
        sys.exit(1)

    client = OpenAI(api_key=api_key)
    result: dict[str, str] = {}
    batch_size = 20
    todo = [
        inc
        for inc in incidents
        if (inc.get("incident_id") or "").strip()
        and (only_ids is None or (inc.get("incident_id") or "").strip() in only_ids)
    ]

    for i in range(0, len(todo), batch_size):
        batch = todo[i : i + batch_size]
        lines = []
        for inc in batch:
            inc_id = (inc.get("incident_id") or "").strip()
            cset = cset_map.get(inc_id)
            extra = f"\nCSET annotations: {cset_blob(cset)}" if cset else ""
            lines.append(
                f"id={inc_id}\ntitle: {inc.get('title', '')}\n"
                f"description: {(inc.get('description') or '')[:600]}{extra}"
            )

        prompt = (
            f"{RUBRIC}\n\n"
            f"Valid ids: {', '.join(VALID_IDS)}\n"
            "Return JSON object mapping each incident id to exactly one id.\n\n"
            + "\n---\n".join(lines)
        )

        resp = client.chat.completions.create(
            model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
            messages=[
                {
                    "role": "system",
                    "content": "You classify AI incidents into one harm category. JSON only.",
                },
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0,
        )
        parsed = json.loads(resp.choices[0].message.content or "{}")
        for k, v in parsed.items():
            kid = str(k).strip()
            vid = str(v).strip().lower().replace(" ", "_")
            if vid in VALID_IDS:
                result[kid] = vid
        print(f"  OpenAI batch {min(i + batch_size, len(todo))}/{len(todo)}")

    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--openai",
        action="store_true",
        help="Use OpenAI for rows not classified via CSET rules",
    )
    args = parser.parse_args()

    incidents = load_incidents()
    cset_map = load_classifications()
    mapping: dict[str, str] = {}
    needs_llm: set[str] = set()

    print("Pass 1: CSET-first rules…")
    for inc in incidents:
        inc_id = (inc.get("incident_id") or "").strip()
        if not inc_id:
            continue
        cset = cset_map.get(inc_id)
        if cset:
            cat = classify_from_cset(cset)
            if cat:
                mapping[inc_id] = cat
                continue
        needs_llm.add(inc_id)

    print(f"  CSET classified: {len(mapping)}")
    print(f"  Remaining: {len(needs_llm)}")

    if args.openai and needs_llm:
        print("Pass 2: OpenAI…")
        llm = classify_openai_batch(incidents, cset_map, needs_llm)
        mapping.update(llm)
        needs_llm -= set(llm.keys())

    if needs_llm:
        print("Pass 2: Rubric fallback (title + description)…")
        for inc in incidents:
            inc_id = (inc.get("incident_id") or "").strip()
            if inc_id in needs_llm:
                mapping[inc_id] = classify_rubric_fallback(
                    inc.get("title") or "",
                    inc.get("description") or "",
                )

    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_JSON.open("w", encoding="utf-8") as f:
        json.dump(mapping, f, indent=2, sort_keys=True)
        f.write("\n")

    counts: dict[str, int] = {c: 0 for c in VALID_IDS}
    for v in mapping.values():
        counts[v] = counts.get(v, 0) + 1
    print(f"\nWrote {len(mapping)} entries to {OUTPUT_JSON}")
    for cat in VALID_IDS:
        print(f"  {cat}: {counts.get(cat, 0)}")


if __name__ == "__main__":
    main()
