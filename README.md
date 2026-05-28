# Incident Lens

Dashboard for the [AI Incident Database](https://incidentdatabase.ai/). HTML, CSS, and D3 — no build step.

**Branch:** `josephine` · baseline: `main`

## Run locally

```bash
python3 -m http.server 8000
```

Open http://localhost:8000/pages/dashboard.html (not `file://`).

---

## What changed (`josephine`)

- **Category chips** (multi-select) replace Search / Sort by; colors match chart stacks
- **Year range:** two sliders; default **2010–2026** on load (**All** = 1983–2026)
- **Timeline:** stacked area by category; hover a color band for category + count; hover empty space for full year breakdown
- **Deployers:** bars stacked by category (top 12 orgs)
- Chart notes (ChatGPT, 2025 peak) only when **All** categories selected
- New files: `data/incident-categories.json`, `scripts/classify-incidents.py`, `js/categories.js`

### Added in merge (Aravind, VIZ 03)
- **`js/viz-harms.js`** — world choropleth answering the Zoom-meeting request for a map of people affected. Toggle pill in the top-left switches between **People affected** (country of harmed parties, from CSETv1) and **Developer / deployer** (company → HQ country). Reacts to the existing year-range + category filters.
- **`data/world-countries.geojson`** — Natural Earth world boundaries (ISO-3 ids).
- CSS for `.map-toggle` and `.viz__chart--map` is **appended** to `css/main.css`; none of Josephine's existing rules were modified.

---

## Did the data change?

| File | Changed? |
|------|----------|
| `data/incidents.csv` | No — original 1,457 AIID records |
| `data/classifications_CSETv1.csv` | No — ~214 CSET rows (helper for labeling) |
| `data/incident-categories.json` | **Yes (new)** — one harm label per incident |

---

## How categories were made

AIID has **no category column**. We assign one of **7 harm types** offline, then the dashboard loads `incident-categories.json`:

1. **Discrimination & fairness**
2. **Privacy & surveillance**
3. **Misinformation & media**
4. **Safety & autonomous systems**
5. **Economic & social systems**
6. **Harmful content & platforms**
7. **Malicious & intentional misuse**

**Pipeline:** `scripts/classify-incidents.py`

1. **CSET-first** (~180 incidents) — rules on CSET fields (rights, tangible harm, sector, AI task, notes)
2. **OpenAI batch** (recommended for the rest) — `python3 scripts/classify-incidents.py --openai` with `OPENAI_API_KEY`
3. Fallback without API — title/description rules only

The browser **never** calls OpenAI; only the committed JSON is used.

**Counts (current):** malicious 339 · misinformation 310 · safety 212 · discrimination 185 · harmful_content 173 · privacy 132 · economic 106

**Limits:** one primary label per incident; labels are our interpretation, not an official AIID field.

More detail: [Methodology](pages/methodology.html)

---

## Regenerate labels

```bash
python3 -m pip install openai
export OPENAI_API_KEY=your_key
python3 scripts/classify-incidents.py --openai
```

`main` on GitHub is unchanged until this branch is merged.
