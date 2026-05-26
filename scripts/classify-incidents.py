#!/usr/bin/env python3
"""
Offline incident classifier for Incident Lens.

Writes data/incident-categories.json mapping incident_id -> category id.

Usage:
  python3 scripts/classify-incidents.py              # keyword + CSET rules (no API)
  python3 scripts/classify-incidents.py --openai     # use OPENAI_API_KEY for all rows

Requires: stdlib only for --keywords mode; openai package optional for --openai.
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

VALID_IDS = frozenset({
    "bias",
    "autonomy",
    "misinformation",
    "privacy",
    "healthcare",
    "moderation",
    "other",
})

# Priority order: first match wins
RULES: list[tuple[str, list[str]]] = [
    ("autonomy", [
        r"\bautonomous\b", r"\bself[- ]driving\b", r"\bself driving\b",
        r"\bav\b", r"\bautopilot\b", r"\brobot\b", r"\bdrone\b",
        r"\bunmanned\b", r"\btesla\b.*\b(full self|fsd|autopilot)\b",
    ]),
    ("misinformation", [
        r"\bdeepfake\b", r"\bmisinformation\b", r"\bdisinformation\b",
        r"\bfake news\b", r"\bmanipulated (image|video|media)\b",
        r"\bsynthetic media\b", r"\bai[- ]generated (image|photo|video)\b",
    ]),
    ("privacy", [
        r"\bfacial recognition\b", r"\bface recognition\b", r"\bsurveillance\b",
        r"\bprivacy\b", r"\bstalking\b", r"\bbiometric\b", r"\bpimeyes\b",
        r"\bscraping\b.*\bface\b",
    ]),
    ("healthcare", [
        r"\bhealth care\b", r"\bhealthcare\b", r"\bhospital\b", r"\bmedical\b",
        r"\bpatient\b", r"\bclinical\b", r"\bx-ray\b", r"\bchest x\b",
        r"\bdiagnos", r"\bwelfare determination\b", r"\brisk score\b.*\bhealth\b",
    ]),
    ("moderation", [
        r"\bcontent moderation\b", r"\bhate speech\b", r"\bmoderation\b",
        r"\bviolating content\b", r"\bremoved\b.*\b(post|content|video)\b",
        r"\btoxic\b", r"\bharassment\b",
    ]),
    ("bias", [
        r"\bbias\b", r"\bbiased\b", r"\bdiscriminat", r"\bracist\b", r"\bsexist\b",
        r"\bgender bias\b", r"\bminority\b", r"\bprotected characteristic\b",
        r"\bdisproportionat", r"\bunfair\b",
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


def cset_text(row: dict) -> str:
    parts = []
    for key in (
        "Sector of Deployment",
        "AI Task",
        "Notes (special interest intangible harm)",
        "AI System Description",
        "Harm Domain",
        "Rights Violation",
        "Detrimental Content",
        "Protected Characteristic",
    ):
        v = (row.get(key) or "").strip()
        if v and v.lower() not in ("no", "yes", "maybe", "false", "true"):
            parts.append(v)
    return " ".join(parts).lower()


def classify_text(text: str) -> str:
    text = text.lower()
    for cat_id, patterns in RULES:
        for pat in patterns:
            if re.search(pat, text, re.I):
                return cat_id
    return "other"


def classify_incident(inc: dict, cset: dict | None) -> str:
    title = (inc.get("title") or "").strip()
    desc = (inc.get("description") or "").strip()
    blob = f"{title} {desc}"
    if cset:
        blob = f"{blob} {cset_text(cset)}"
    return classify_text(blob)


def classify_openai_batch(incidents: list[dict], cset_map: dict[str, dict]) -> dict[str, str]:
    try:
        from openai import OpenAI
    except ImportError:
        print("Install openai: pip install openai", file=sys.stderr)
        sys.exit(1)

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("Set OPENAI_API_KEY for --openai mode", file=sys.stderr)
        sys.exit(1)

    client = OpenAI(api_key=api_key)
    result: dict[str, str] = {}
    batch_size = 25

    taxonomy = ", ".join(sorted(VALID_IDS - {"other"})) + ", other"

    for i in range(0, len(incidents), batch_size):
        batch = incidents[i : i + batch_size]
        lines = []
        for inc in batch:
            inc_id = (inc.get("incident_id") or "").strip()
            cset = cset_map.get(inc_id)
            extra = f"\nCSET: {cset_text(cset)}" if cset else ""
            lines.append(
                f"id={inc_id}\ntitle: {inc.get('title', '')}\n"
                f"description: {(inc.get('description') or '')[:500]}{extra}"
            )

        prompt = (
            f"Assign each incident exactly one primary category from: {taxonomy}.\n"
            "Respond with JSON object mapping incident id strings to category ids only.\n\n"
            + "\n---\n".join(lines)
        )

        resp = client.chat.completions.create(
            model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
            messages=[
                {
                    "role": "system",
                    "content": "You classify AI incidents. Output valid JSON only.",
                },
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0,
        )
        content = resp.choices[0].message.content or "{}"
        parsed = json.loads(content)
        for k, v in parsed.items():
            kid = str(k).strip()
            vid = str(v).strip().lower()
            if vid in VALID_IDS:
                result[kid] = vid
            else:
                result[kid] = "other"
        print(f"  classified {min(i + batch_size, len(incidents))}/{len(incidents)}")

    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--openai",
        action="store_true",
        help="Use OpenAI API (requires OPENAI_API_KEY)",
    )
    args = parser.parse_args()

    incidents = load_incidents()
    cset_map = load_classifications()
    mapping: dict[str, str] = {}

    if args.openai:
        print("Classifying with OpenAI…")
        mapping = classify_openai_batch(incidents, cset_map)
        for inc in incidents:
            inc_id = (inc.get("incident_id") or "").strip()
            if inc_id not in mapping:
                mapping[inc_id] = classify_incident(inc, cset_map.get(inc_id))
    else:
        print("Classifying with keyword + CSET rules…")
        for inc in incidents:
            inc_id = (inc.get("incident_id") or "").strip()
            if not inc_id:
                continue
            mapping[inc_id] = classify_incident(inc, cset_map.get(inc_id))

    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_JSON.open("w", encoding="utf-8") as f:
        json.dump(mapping, f, indent=2, sort_keys=True)
        f.write("\n")

    counts: dict[str, int] = {}
    for v in mapping.values():
        counts[v] = counts.get(v, 0) + 1
    print(f"Wrote {len(mapping)} entries to {OUTPUT_JSON}")
    for cat in sorted(VALID_IDS):
        print(f"  {cat}: {counts.get(cat, 0)}")


if __name__ == "__main__":
    main()
