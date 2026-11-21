# CivicLens — AI triage for citizen complaints

CivicLens turns a messy citizen complaint (text or voice in English, Telugu, Hindi, Kannada or Tamil, with an optional photo and automatic GPS location) into a structured, prioritised ticket routed to the right municipal department. Officers log in to see their own department's queue sorted by priority.

Built during the *Prompt to Product* hackathon (21 Nov 2026, 10:30 AM–2:30 PM).

**Live demo:** https://renegadespp.github.io/RenegadePP/

## Features

| Required feature | How CivicLens does it |
|---|---|
| 1. Free-text complaint in English or a regional language, optional photo | Text box, voice input in 5 Indian languages, photo upload / phone camera, **automatic GPS location turned into a street address** |
| 2. Classify the issue | Gemini picks one of 11 categories from a fixed list (JSON schema with enums) |
| 3. Severity Low / Medium / High / Critical with a one-line reason | Gemini rates severity against a written rubric; a **safety guardrail** then enforces minimums (e.g. any live wire → Critical) |
| 4. Route to the correct department | Category → department routing table in `config.js`. Live-wire hazards go to the power DISCOM, not the streetlight wing |
| 5. Dashboard sorted by priority | Officer dashboard (login required) with priority score, deadlines, filters, status updates, CSV export |

Also:
- **No setup for citizens.** The Gemini key lives on the server, never in the website.
- **Officer logins per department.** The commissioner sees everything; a Roads officer sees only Roads tickets and can only update those.
- **Shared database.** A complaint filed on any phone appears on every officer's dashboard (auto-refresh every 20 s).
- **Track my complaint.** Citizens check status by ticket number; complaints filed from their phone are listed automatically.
- **Duplicate merging**, even across languages. More reports → higher priority.
- **Reply to the citizen in their own language** with their ticket number.
- **Photo check.** The AI describes the photo and flags it if it contradicts the text.
- **Never stops.** If the server or AI is unreachable, an on-device multilingual rule engine triages the complaint.

## Architecture

```
Citizen phone / laptop (GitHub Pages: index.html, app.js …)
   │  text, voice, photo, GPS
   ▼
Google Apps Script web app (backend-Code.gs)  ── holds GEMINI_API_KEY secretly
   ├─ Reverse geocoding (Google Maps service, OpenStreetMap fallback)
   ├─ Gemini triage (prompt.js) → safety guardrails + rule cross-check (rules.js)
   ├─ Routing table (config.js) → duplicate check + priority (pipeline.js)
   ├─ Google Sheet "Tickets" = database;  "Officers" = logins (SHA-256 hashed passwords)
   └─ Sessions for officers (6 h), department-level access control
   ▼
Officer dashboard (login) — sorted by priority score
```

`backend-Code.gs` is generated from the same `config.js`, `prompt.js`, `rules.js` and `pipeline.js` the website uses, plus the server code, so both sides classify identically.

**Priority score** = severity points (Critical 100, High 70, Medium 40, Low 15) + 8 per extra citizen report (max 5) + 10 if near a school/hospital + up to 10 for waiting time + 15 if past its deadline.
**Deadlines**: Critical 4 h, High 24 h, Medium 3 days, Low 7 days.

## Set up your own copy

**Backend (Google Apps Script, free):**
1. Create a Google Sheet → **Extensions → Apps Script** → replace the code with `backend-Code.gs` → Save.
2. **Project Settings → Script Properties → Add property** `GEMINI_API_KEY` = your key from https://aistudio.google.com/apikey.
3. Run the `setup` function once and allow the permissions. It creates the *Tickets* and *Officers* sheets and the officer accounts.
4. **Deploy → New deployment → Web app**, Execute as **Me**, Who has access **Anyone** → copy the URL ending in `/exec`.

**Website (GitHub Pages):** put the URL into `server-url.js`, then enable Pages (Settings → Pages → branch `main`, `/root`).

To change an officer's password, type the new one into column E (*set_new_password*) of the Officers sheet; it is hashed on the next login.
After changing `backend-Code.gs`, use **Deploy → Manage deployments → Edit → Version: New version**, or the old code keeps running.

## Files

| File | Purpose |
|---|---|
| `index.html`, `style.css` | Pages: report, track, officer login, dashboard |
| `app.js` | Website logic: location, photo, voice, server calls, dashboard |
| `server-url.js` | Address of the Apps Script backend |
| `config.js` | Categories, departments, routing table, severity points and deadlines |
| `prompt.js` | The system prompt, worked examples and JSON schema sent to Gemini |
| `rules.js` | Offline classifier, hazard detection, safety guardrails, language detection |
| `pipeline.js` | AI output + guardrails + routing + duplicate check + priority score |
| `samples.js` | Demo complaints in 5 languages, including duplicates |
| `backend-Code.gs` | The Apps Script backend (paste into the Apps Script editor) |

## Limitations
- Apps Script and Google Sheets suit a pilot of a few thousand tickets; a city-wide rollout needs a proper database and server.
- Officer accounts are managed by editing the Officers sheet; there is no self-service password reset.
- Laptop locations come from the network and can be kilometres off; phone GPS is accurate.
- Severity rules and deadlines are our assumptions, not an official municipal policy.

## Credits
- Google Gemini API; Google Apps Script, Sheets and Maps services; OpenStreetMap Nominatim (fallback geocoding, © OpenStreetMap contributors).
- Fonts: Archivo and Noto Sans (Google Fonts, SIL Open Font License).
- No third-party code libraries. AI assistants used during the build are listed in the prompt log.
