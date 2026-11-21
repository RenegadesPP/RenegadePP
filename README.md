# CivicLens — AI triage for citizen complaints

CivicLens turns a messy citizen complaint (text in English, Telugu, Hindi, Kannada or Tamil, with an optional photo) into a structured, prioritised ticket routed to the right municipal department, then lists all tickets for officers sorted by priority.

Built during the *Prompt to Product* hackathon (21 Nov 2026, 10:30 AM–2:30 PM).

## What it does

| Required feature | How CivicLens does it |
|---|---|
| 1. Free-text complaint in English or a regional language, optional photo | Text box, voice input (Web Speech API in 5 Indian languages), photo upload / drag-and-drop / phone camera, optional GPS |
| 2. Classify the issue | Gemini picks one of 11 categories from a fixed list (JSON schema with enums) |
| 3. Severity Low / Medium / High / Critical with a one-line reason | Gemini rates severity against a written rubric; a **safety guardrail** then enforces minimums (e.g. any live wire → Critical) |
| 4. Route to the correct department | Category → department routing table in `js/config.js` (editable per city). Live-wire hazards go to the power DISCOM, not the streetlight wing |
| 5. Dashboard sorted by priority | Officer dashboard with priority score, SLA countdown, filters, status updates, CSV export |

Extras:
- **Duplicate merging** — repeat reports of the same problem are merged into one ticket, even across languages (a Telugu report can merge into an English ticket). More reports → higher priority.
- **Reply to the citizen in their own language** with their ticket number.
- **Photo check** — the AI describes the photo and flags it if it contradicts the text.
- **Offline fallback** — if there is no API key, no internet or a rate limit, a multilingual keyword rule engine triages the complaint so the system never stops.
- **Rule cross-check** — every AI answer is compared with the rule engine; disagreements are shown to the officer.

## Run it

No installation or build step.

1. Download or clone this repository.
2. Open `index.html` in Chrome or Edge (double-click it).
   For voice input and GPS, serve it over http instead: `python -m http.server 8000` in this folder, then open http://localhost:8000.
3. Click the pill at the top right (**Offline rules**) → paste a free Gemini API key from https://aistudio.google.com/apikey → **Test connection** → **Save**.
4. File a complaint, or go to **Officer dashboard → Triage all samples** to load 11 demo complaints.

Without a key the app still works using the offline rule engine.

### Publish on GitHub Pages (free live link)
Repository → **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main`, folder `/ (root)` → Save. The site appears at `https://<username>.github.io/civiclens/` within a minute or two.

## How it works

```
Citizen text / voice / photo / GPS
          │
          ▼
  Gemini (js/ai.js + js/prompt.js)  ── fails? ──▶ Offline rule engine (js/rules.js)
  structured JSON: category, severity,
  reason, hazards, location, duplicate_of,
  citizen reply in their language
          │
          ▼
  Safety guardrail + rule cross-check (js/rules.js, js/pipeline.js)
          │
          ▼
  Routing table: category → department (js/config.js)
          │
          ▼
  Duplicate check: AI match → GPS within 120 m → text similarity (js/pipeline.js)
          │
          ▼
  Ticket store (browser localStorage) → Officer dashboard sorted by priority score (js/app.js)
```

**Priority score** = severity points (Critical 100, High 70, Medium 40, Low 15) + 8 per extra citizen report (max 5) + 10 if near a school/hospital + up to 10 for waiting time + 15 if past its deadline.

**Deadlines (SLA)**: Critical 4 h, High 24 h, Medium 3 days, Low 7 days.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page layout: citizen form, ticket view, officer dashboard, settings |
| `css/style.css` | Visual design (road-sign blue, kerb yellow, hazard stripes for Critical) |
| `js/config.js` | Categories, departments, routing table, severity points and deadlines |
| `js/prompt.js` | The system prompt, worked examples and JSON schema sent to Gemini |
| `js/ai.js` | Gemini API call with model fallback and timeout |
| `js/rules.js` | Offline classifier, hazard detection, safety guardrails, language detection |
| `js/pipeline.js` | Combines AI output + guardrails + routing + duplicate check + priority score |
| `js/samples.js` | Demo complaints in 5 languages, including duplicates |
| `js/app.js` | User interface logic |
| `docs/` | Prompt log, write-up and slides |

## Limitations
- Tickets are stored in the browser (localStorage), so each device has its own list. A real deployment needs a shared database and officer logins.
- The API key is used from the browser; for production it should sit behind a small server.
- The offline rule engine cannot read photos and cannot match duplicates across languages.
- Location is free text unless the citizen shares GPS.

## Credits
- Google Gemini API for classification, severity, translation and photo understanding.
- Fonts: Archivo and Noto Sans (Google Fonts, SIL Open Font License).
- No third-party code libraries. AI assistants used during the build are listed in `docs/prompt-log.md`.
