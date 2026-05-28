#!/usr/bin/env python3
"""
geo-label-incidents.py — derive a country (ISO-3) for each incident, for the
VIZ 03 choropleth.

Two outputs per incident, written to data/incident-countries.json:
  - affected   : where the harm landed (country of the harmed parties)
  - developer  : country of origin of the named developer/deployer org

PIPELINE (offline, deterministic — no API needed, so it always reproduces):
  1. CSET-first   : trust Location Country from classifications_CSETv1.csv
  2. Text signals : scan title + description for, in priority order,
                    explicit country names -> demonyms -> major cities ->
                    US state names. Conservative: only labels on a clear hit,
                    otherwise leaves the incident unlabeled (better a blank
                    country than a wrong one).
  3. Developer    : map the named org -> HQ country via a curated table.

This mirrors Bastiaan's "generate then sweep" plan but does the generation
with transparent rules so the labels are auditable. An LLM pass can refine
this later; the browser only ever reads the committed JSON.

Usage:
    python3 scripts/geo-label-incidents.py
"""

import csv
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
INCIDENTS = os.path.join(ROOT, "data", "incidents.csv")
CSET = os.path.join(ROOT, "data", "classifications_CSETv1.csv")
OUT = os.path.join(ROOT, "data", "incident-countries.json")

# ----------------------------------------------------------------------
# ISO-2 -> ISO-3 (covers CSET location codes + extras)
# ----------------------------------------------------------------------
ISO2_TO_ISO3 = {
    "AR": "ARG", "AU": "AUS", "BR": "BRA", "CA": "CAN", "CH": "CHE",
    "CN": "CHN", "DE": "DEU", "ES": "ESP", "FR": "FRA", "GB": "GBR",
    "GR": "GRC", "ID": "IDN", "IE": "IRL", "IL": "ISR", "IN": "IND",
    "IT": "ITA", "JP": "JPN", "KR": "KOR", "LY": "LBY", "MX": "MEX",
    "NL": "NLD", "NZ": "NZL", "PS": "PSE", "RS": "SRB", "RU": "RUS",
    "SE": "SWE", "US": "USA", "VN": "VNM", "UA": "UKR", "PL": "POL",
    "TR": "TUR", "SA": "SAU", "AE": "ARE", "EG": "EGY", "NG": "NGA",
    "ZA": "ZAF", "KE": "KEN", "PH": "PHL", "TH": "THA", "MY": "MYS",
    "SG": "SGP", "PK": "PAK", "BD": "BGD", "IR": "IRN", "AT": "AUT",
    "BE": "BEL", "DK": "DNK", "FI": "FIN", "NO": "NOR", "PT": "PRT",
    "CZ": "CZE", "HU": "HUN", "RO": "ROU", "TW": "TWN", "HK": "HKG",
    "CO": "COL", "CL": "CHL", "PE": "PER", "VE": "VEN",
}

# ----------------------------------------------------------------------
# Country name -> ISO-3 (explicit mentions, highest-confidence text signal)
# Longer / more specific names first so they win during matching.
# ----------------------------------------------------------------------
COUNTRY_NAMES = {
    "united states of america": "USA", "united states": "USA", "u.s.a": "USA",
    "u.s.": "USA", " usa ": "USA", "america": "USA",
    "united kingdom": "GBR", "great britain": "GBR", " u.k.": "GBR",
    "england": "GBR", "scotland": "GBR", "wales": "GBR", "britain": "GBR",
    "china": "CHN", "hong kong": "HKG", "taiwan": "TWN",
    "india": "IND", "japan": "JPN", "south korea": "KOR", "north korea": "PRK",
    "germany": "DEU", "france": "FRA", "italy": "ITA", "spain": "ESP",
    "netherlands": "NLD", "belgium": "BEL", "switzerland": "CHE",
    "sweden": "SWE", "norway": "NOR", "denmark": "DNK", "finland": "FIN",
    "ireland": "IRL", "portugal": "PRT", "austria": "AUT", "poland": "POL",
    "russia": "RUS", "ukraine": "UKR", "turkey": "TUR", "greece": "GRC",
    "czech republic": "CZE", "hungary": "HUN", "romania": "ROU",
    "serbia": "SRB", "croatia": "HRV",
    "canada": "CAN", "mexico": "MEX", "brazil": "BRA", "argentina": "ARG",
    "chile": "CHL", "colombia": "COL", "peru": "PER", "venezuela": "VEN",
    "australia": "AUS", "new zealand": "NZL",
    "israel": "ISR", "palestine": "PSE", "saudi arabia": "SAU",
    "united arab emirates": "ARE", "iran": "IRN", "iraq": "IRQ",
    "egypt": "EGY", "libya": "LBY", "syria": "SYR", "lebanon": "LBN",
    "south africa": "ZAF", "nigeria": "NGA", "kenya": "KEN", "ethiopia": "ETH",
    "ghana": "GHA", "morocco": "MAR",
    "indonesia": "IDN", "philippines": "PHL", "thailand": "THA",
    "vietnam": "VNM", "malaysia": "MYS", "singapore": "SGP",
    "pakistan": "PAK", "bangladesh": "BGD", "sri lanka": "LKA",
    "afghanistan": "AFG", "myanmar": "MMR", "cambodia": "KHM",
}

# ----------------------------------------------------------------------
# Demonyms / adjectives -> ISO-3 (second priority)
# ----------------------------------------------------------------------
DEMONYMS = {
    "american": "USA", "chinese": "CHN", "british": "GBR", "english": "GBR",
    "indian": "IND", "japanese": "JPN", "korean": "KOR", "german": "DEU",
    "french": "FRA", "italian": "ITA", "spanish": "ESP", "dutch": "NLD",
    "swedish": "SWE", "norwegian": "NOR", "danish": "DNK", "finnish": "FIN",
    "irish": "IRL", "russian": "RUS", "ukrainian": "UKR", "turkish": "TUR",
    "greek": "GRC", "canadian": "CAN", "mexican": "MEX", "brazilian": "BRA",
    "argentine": "ARG", "argentinian": "ARG", "chilean": "CHL",
    "colombian": "COL", "australian": "AUS",
    "israeli": "ISR", "palestinian": "PSE", "saudi": "SAU", "iranian": "IRN",
    "egyptian": "EGY", "syrian": "SYR", "nigerian": "NGA", "kenyan": "KEN",
    "indonesian": "IDN", "filipino": "PHL", "thai": "THA",
    "vietnamese": "VNM", "malaysian": "MYS", "singaporean": "SGP",
    "pakistani": "PAK", "bangladeshi": "BGD",
}

# ----------------------------------------------------------------------
# Major cities / regions -> ISO-3 (third priority)
# ----------------------------------------------------------------------
CITIES = {
    "new york": "USA", "los angeles": "USA", "san francisco": "USA",
    "chicago": "USA", "boston": "USA", "seattle": "USA", "washington": "USA",
    "silicon valley": "USA", "detroit": "USA", "atlanta": "USA",
    "houston": "USA", "miami": "USA", "phoenix": "USA", "tempe": "USA",
    "london": "GBR", "manchester": "GBR", "birmingham": "GBR",
    "beijing": "CHN", "shanghai": "CHN", "shenzhen": "CHN", "guangzhou": "CHN",
    "mumbai": "IND", "delhi": "IND", "new delhi": "IND", "bangalore": "IND",
    "bengaluru": "IND", "hyderabad": "IND", "chennai": "IND",
    "tokyo": "JPN", "osaka": "JPN", "seoul": "KOR", "berlin": "DEU",
    "munich": "DEU", "paris": "FRA", "madrid": "ESP", "barcelona": "ESP",
    "rome": "ITA", "milan": "ITA", "amsterdam": "NLD", "stockholm": "SWE",
    "moscow": "RUS", "kyiv": "UKR", "kiev": "UKR", "toronto": "CAN",
    "vancouver": "CAN", "montreal": "CAN", "ottawa": "CAN",
    "mexico city": "MEX", "sao paulo": "BRA", "rio de janeiro": "BRA",
    "sydney": "AUS", "melbourne": "AUS", "tel aviv": "ISR",
    "jerusalem": "ISR", "gaza": "PSE", "dubai": "ARE", "tehran": "IRN",
    "cairo": "EGY", "lagos": "NGA", "nairobi": "KEN", "jakarta": "IDN",
    "manila": "PHL", "bangkok": "THA", "hanoi": "VNM", "singapore": "SGP",
}

# ----------------------------------------------------------------------
# US states -> USA (fourth priority; strong US signal)
# ----------------------------------------------------------------------
US_STATES = [
    "alabama", "alaska", "arizona", "arkansas", "california", "colorado",
    "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho",
    "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana",
    "maine", "maryland", "massachusetts", "michigan", "minnesota",
    "mississippi", "missouri", "montana", "nebraska", "nevada",
    "new hampshire", "new jersey", "new mexico", "ohio", "oklahoma",
    "oregon", "pennsylvania", "tennessee", "texas", "utah", "vermont",
    "virginia", "wisconsin", "wyoming",
]

# ----------------------------------------------------------------------
# Company / org -> ISO-3 (developer view)
# ----------------------------------------------------------------------
COMPANY_COUNTRY = {
    # USA
    "openai": "USA", "google": "USA", "facebook": "USA", "meta": "USA",
    "tesla": "USA", "microsoft": "USA", "amazon": "USA", "apple": "USA",
    "youtube": "USA", "instagram": "USA", "whatsapp": "USA", "twitter": "USA",
    "x": "USA", "xai": "USA", "anthropic": "USA", "nvidia": "USA",
    "palantir": "USA", "ibm": "USA", "uber": "USA", "lyft": "USA",
    "cruise": "USA", "waymo": "USA", "snap": "USA", "snapchat": "USA",
    "pinterest": "USA", "linkedin": "USA", "netflix": "USA", "paypal": "USA",
    "salesforce": "USA", "oracle": "USA", "us-government": "USA",
    "reddit": "USA", "github": "USA", "adobe": "USA", "intel": "USA",
    "clearview-ai": "USA", "amazon-rekognition": "USA", "compas": "USA",
    "northpointe": "USA", "equivant": "USA", "character-ai": "USA",
    "replika": "USA", "roblox": "USA", "tinder": "USA",
    # China
    "tiktok": "CHN", "bytedance": "CHN", "baidu": "CHN", "tencent": "CHN",
    "alibaba": "CHN", "sensetime": "CHN", "huawei": "CHN", "didi": "CHN",
    "weibo": "CHN", "wechat": "CHN", "megvii": "CHN", "iflytek": "CHN",
    "china-government": "CHN",
    # UK
    "deepmind": "GBR", "stability-ai": "GBR", "uk-government": "GBR",
    "bbc": "GBR", "darktrace": "GBR",
    # France / Israel / Korea / Japan / Germany / Canada / India / others
    "mistral": "FRA", "mistral-ai": "FRA", "navya": "FRA", "criteo": "FRA",
    "mobileye": "ISR", "nso": "ISR", "nso-group": "ISR", "anyvision": "ISR",
    "samsung": "KOR", "naver": "KOR", "kakao": "KOR", "hyundai": "KOR",
    "sony": "JPN", "softbank": "JPN", "toyota": "JPN", "honda": "JPN",
    "nissan": "JPN", "nintendo": "JPN",
    "sap": "DEU", "bmw": "DEU", "volkswagen": "DEU", "siemens": "DEU",
    "aleph-alpha": "DEU",
    "cohere": "CAN", "shopify": "CAN",
    "infosys": "IND", "tcs": "IND", "wipro": "IND",
    "yandex": "RUS", "sberbank": "RUS",
    "atlassian": "AUS", "canva": "AUS",
    "spotify": "SWE", "ericsson": "SWE",
    "grab": "SGP",
}


def load_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def build_cset_index():
    """incident_id -> ISO3 from the CSET location field."""
    idx = {}
    for row in load_csv(CSET):
        iid = (row.get("Incident ID") or "").strip()
        iso2 = (row.get("Location Country (two letters)") or "").strip().upper()
        if iid and len(iso2) == 2 and iso2 in ISO2_TO_ISO3:
            idx[iid] = ISO2_TO_ISO3[iso2]
    return idx


def text_country(text):
    """Best-effort ISO-3 from free text, conservative priority order."""
    t = " " + text.lower() + " "

    # 1. Explicit country names (sorted longest-first to avoid partial hits)
    for name in sorted(COUNTRY_NAMES, key=len, reverse=True):
        if name in t:
            return COUNTRY_NAMES[name]

    # 2. Demonyms (word-boundary so "german" != "germane")
    for dem, iso in DEMONYMS.items():
        if re.search(r"\b" + re.escape(dem) + r"\b", t):
            return iso

    # 3. Major cities
    for city in sorted(CITIES, key=len, reverse=True):
        if re.search(r"\b" + re.escape(city) + r"\b", t):
            return CITIES[city]

    # 4. US states -> USA
    for st in US_STATES:
        if re.search(r"\b" + re.escape(st) + r"\b", t):
            return "USA"

    return None


def parse_list(raw):
    if not raw:
        return []
    try:
        return json.loads(raw.replace("'", '"'))
    except Exception:
        return []


def developer_country(row):
    names = parse_list(row.get("Alleged deployer of AI system")) + \
            parse_list(row.get("Alleged developer of AI system"))
    for n in names:
        c = COMPANY_COUNTRY.get((n or "").lower())
        if c:
            return c
    return None


def main():
    cset = build_cset_index()
    incidents = load_csv(INCIDENTS)

    out = {}
    src_counts = {"cset": 0, "text": 0, "none": 0}
    dev_counts = 0

    for row in incidents:
        iid = (row.get("incident_id") or "").strip()
        if not iid:
            continue

        # ---- affected country ----
        affected = cset.get(iid)
        source = "cset" if affected else None
        if not affected:
            text = (row.get("title") or "") + " " + (row.get("description") or "")
            affected = text_country(text)
            source = "text" if affected else None

        if source == "cset":
            src_counts["cset"] += 1
        elif source == "text":
            src_counts["text"] += 1
        else:
            src_counts["none"] += 1

        # ---- developer country ----
        dev = developer_country(row)
        if dev:
            dev_counts += 1

        out[iid] = {
            "affected": affected,        # ISO-3 or None
            "developer": dev,            # ISO-3 or None
            "affected_source": source,   # "cset" | "text" | None
        }

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))

    total = len(out)
    affected_total = src_counts["cset"] + src_counts["text"]
    print(f"Wrote {OUT}")
    print(f"  incidents:            {total}")
    print(f"  affected (CSET):      {src_counts['cset']}")
    print(f"  affected (text rule): {src_counts['text']}")
    print(f"  affected TOTAL:       {affected_total}  "
          f"({affected_total * 100 // total}% coverage)")
    print(f"  developer mapped:     {dev_counts}  "
          f"({dev_counts * 100 // total}% coverage)")


if __name__ == "__main__":
    main()
