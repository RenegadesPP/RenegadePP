/* CivicLens backend — paste this whole file into Apps Script (Code.gs). Generated 2026-11-21 11:53 IST. */

/* ======== js/config.js ======== */
/* CivicLens — configuration.
 * Categories, departments and severity rules live here as plain data, so a new
 * city can change routing without touching any AI or UI code.
 */
(function (root) {
  const CATEGORIES = {
    roads:         { label: "Roads & footpaths",   dept: "ENG_ROADS",  baseSeverity: "Medium" },
    waste:         { label: "Garbage & waste",     dept: "SWM",        baseSeverity: "Medium" },
    water:         { label: "Water supply",        dept: "WATER",      baseSeverity: "Medium" },
    drainage:      { label: "Drainage & sewage",   dept: "DRAINAGE",   baseSeverity: "Medium" },
    streetlights:  { label: "Streetlights",        dept: "ELEC_SL",    baseSeverity: "Low" },
    electricity:   { label: "Electrical hazard / power", dept: "DISCOM", baseSeverity: "High" },
    trees:         { label: "Trees",               dept: "HORTI",      baseSeverity: "Medium" },
    stray_animals: { label: "Stray animals",       dept: "VET",        baseSeverity: "Medium" },
    public_health: { label: "Public health",       dept: "HEALTH",     baseSeverity: "Medium" },
    encroachment:  { label: "Encroachment / building", dept: "TOWN_PLAN", baseSeverity: "Low" },
    other:         { label: "Other",               dept: "GRIEVANCE",  baseSeverity: "Low" },
  };

  const DEPARTMENTS = {
    ENG_ROADS: { name: "Engineering – Roads & Infrastructure", short: "Roads" },
    SWM:       { name: "Sanitation – Solid Waste Management", short: "Sanitation" },
    WATER:     { name: "Water Supply Wing",                  short: "Water" },
    DRAINAGE:  { name: "Drainage & Sewerage Wing",           short: "Drainage" },
    ELEC_SL:   { name: "Electrical Wing – Street Lighting",  short: "Streetlights" },
    DISCOM:    { name: "Power DISCOM (Electricity Distribution Co.) – via Municipal Electrical Wing", short: "DISCOM" },
    HORTI:     { name: "Urban Forestry & Horticulture",      short: "Horticulture" },
    VET:       { name: "Veterinary & Animal Control",        short: "Veterinary" },
    HEALTH:    { name: "Public Health & Entomology",         short: "Health" },
    TOWN_PLAN: { name: "Town Planning",                      short: "Town Planning" },
    GRIEVANCE: { name: "Citizen Grievance Cell (manual review)", short: "Grievance Cell" },
  };

  const SEVERITIES = ["Low", "Medium", "High", "Critical"];

  // Points used for the priority score, and the time each level has to be acted on.
  const SEVERITY_META = {
    Critical: { points: 100, slaHours: 4 },
    High:     { points: 70,  slaHours: 24 },
    Medium:   { points: 40,  slaHours: 72 },
    Low:      { points: 15,  slaHours: 168 },
  };

  const HAZARDS = {
    live_electricity: "Live electricity",
    open_manhole: "Open manhole / pit",
    blocking_road: "Blocking road",
    traffic_hazard: "Traffic hazard",
    near_school: "Near school / children",
    near_hospital: "Near hospital",
    health_risk: "Health risk",
    flooding: "Flooding",
    injury_reported: "Injury reported",
  };

  const LANGUAGES = [
    { code: "en-IN", label: "English" },
    { code: "te-IN", label: "తెలుగు Telugu" },
    { code: "hi-IN", label: "हिन्दी Hindi" },
    { code: "kn-IN", label: "ಕನ್ನಡ Kannada" },
    { code: "ta-IN", label: "தமிழ் Tamil" },
  ];

  const MODELS = ["gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-3.8-flash", "gemini-2.5-flash"];

  const CONFIG = { CATEGORIES, DEPARTMENTS, SEVERITIES, SEVERITY_META, HAZARDS, LANGUAGES, MODELS };
  root.CL_CONFIG = CONFIG;
  if (typeof module !== "undefined") module.exports = CONFIG;
})(typeof window !== "undefined" ? window : globalThis);

/* ======== js/prompt.js ======== */
/* CivicLens — the triage prompt sent to Gemini.
 * Structure: role → task → category definitions → severity rubric → duplicate check
 * → output rules → worked examples. The output is forced into a JSON schema with
 * fixed enums, so the model can only answer with values the app understands.
 */
(function (root) {
  const C = root.CL_CONFIG || require("./config.js");

  function buildSystemPrompt(cityName) {
    const catLines = Object.entries(C.CATEGORIES)
      .map(([k, v]) => `- ${k}: ${v.label}`)
      .join("\n");

    return `You are CivicLens, the complaint-triage officer of ${cityName}, an Indian municipal corporation.
Citizens send complaints as free text (English, Telugu, Hindi, Kannada, Tamil, or mixed / transliterated like "Hinglish"), sometimes with a photo.
Your job: turn ONE complaint into ONE structured ticket a municipal officer can act on immediately.

## Categories (pick exactly one)
${catLines}
Disambiguation rules:
- A streetlight that is off or flickering = streetlights. A live, fallen, hanging or sparking wire, transformer problem, electric shock risk or area power cut = electricity.
- Sewage, blocked drains, overflowing gutters, waterlogging, open or missing manhole covers = drainage. Drinking-water pipe leaks, no supply, contaminated tap water = water.
- Garbage piles, uncollected bins, debris dumping = waste. Mosquito breeding, dead animals, disease outbreaks = public_health.
- Potholes, damaged roads, broken footpaths, road cave-ins = roads. Fallen trees or dangerous branches = trees (even if blocking a road).
- If the text is not a civic complaint (spam, greeting, unrelated question), set is_valid_complaint=false and category=other.

## Severity rubric (pick exactly one)
- Critical: immediate risk to life — live/sparking/fallen electric wires, open manhole on a used road, road cave-in, tree fallen on people/vehicles/live wires, sewage entering drinking water, any of these near a school or hospital.
- High: serious hazard or large impact — big pothole on a main road, fallen tree blocking a road, no water supply for an area for over a day, dog bites, injuries already reported, overflowing sewage on a road.
- Medium: real nuisance that must be fixed within days — uncollected garbage, minor leaks, blocked drain, mosquito breeding, a few streetlights out.
- Low: minor, cosmetic or single-household issue with no safety risk.
Raise severity one level when the issue is next to a school, hospital, or affects children, elderly or disabled people. Never lower severity because the complaint is badly written or vague.
severity_reason must be ONE short line (max 20 words) naming the concrete risk, e.g. "Exposed live wire beside a school gate — electrocution risk to children."

## Hazards
List every hazard flag that applies: ${Object.keys(C.HAZARDS).join(", ")}. Use an empty list if none.

## Photo
If a photo is attached, describe in photo_observation what it actually shows (max 20 words), and set photo_matches_text to false if it clearly contradicts the text. Use the photo to decide category and severity when the text is vague. If there is no photo, photo_observation="" and photo_matches_text=true.

## Duplicate check
You will receive a list of OPEN tickets. If this complaint describes the SAME physical problem at the SAME place as one of them (even if written in a different language), put that ticket id in duplicate_of. Same category but a different place is NOT a duplicate. If unsure, leave duplicate_of "".

## Output rules
- english_summary: an officer-ready title in English, max 12 words, e.g. "Live wire hanging near ZP High School gate, Gandhi Nagar".
- location_text: the place exactly as the citizen described it (landmark, street, area), translated to English. "" if no location is given.
- missing_info: the single most important detail the officer still needs (usually exact location); "" if nothing is missing.
- language: the language the citizen wrote in (English, Telugu, Hindi, Kannada, Tamil, Hinglish, Mixed...).
- citizen_reply: 1–2 short, polite sentences IN THE CITIZEN'S OWN LANGUAGE AND SCRIPT confirming the complaint, naming the department in that language, and including the literal token {TICKET_ID}. If missing_info is not empty, also ask for it.
- confidence: 0 to 1, how sure you are about category and severity.
- Never invent facts that are not in the text or photo.

## Examples
Complaint: "Current wire fell on the road near Govt school Ramnagar, sparks coming"
→ category=electricity, severity=Critical, hazards=[live_electricity, near_school], severity_reason="Fallen sparking live wire beside a school — electrocution risk to children."
Complaint: "మా వీధిలో మూడు రోజులుగా చెత్త తీయలేదు" (Telugu: garbage not collected in our street for three days)
→ category=waste, severity=Medium, hazards=[health_risk], location_text="", missing_info="Street name or nearby landmark", citizen_reply in Telugu script.
Complaint: "streetlight not working"
→ category=streetlights, severity=Low, missing_info="Exact location or pole number".`;
  }

  function buildUserMessage(text, openTickets, hasPhoto) {
    const list = openTickets.length
      ? openTickets.map(t => `${t.id} | ${t.category} | ${t.summary} | ${t.location || "-"}`).join("\n")
      : "(none)";
    return `OPEN TICKETS (id | category | summary | location):
${list}

NEW COMPLAINT${hasPhoto ? " (photo attached)" : ""}:
"""${text || "(no text — photo only)"}"""`;
  }

  // JSON schema handed to Gemini (OpenAPI subset). Enums keep answers inside our taxonomy.
  const RESPONSE_SCHEMA = {
    type: "OBJECT",
    properties: {
      is_valid_complaint: { type: "BOOLEAN" },
      language: { type: "STRING" },
      english_summary: { type: "STRING" },
      category: { type: "STRING", enum: Object.keys(C.CATEGORIES) },
      severity: { type: "STRING", enum: C.SEVERITIES },
      severity_reason: { type: "STRING" },
      hazards: { type: "ARRAY", items: { type: "STRING", enum: Object.keys(C.HAZARDS) } },
      location_text: { type: "STRING" },
      missing_info: { type: "STRING" },
      photo_observation: { type: "STRING" },
      photo_matches_text: { type: "BOOLEAN" },
      duplicate_of: { type: "STRING" },
      confidence: { type: "NUMBER" },
      citizen_reply: { type: "STRING" },
    },
    required: ["is_valid_complaint", "language", "english_summary", "category", "severity",
      "severity_reason", "hazards", "location_text", "missing_info", "duplicate_of",
      "confidence", "citizen_reply"],
  };

  const PROMPT = { buildSystemPrompt, buildUserMessage, RESPONSE_SCHEMA };
  root.CL_PROMPT = PROMPT;
  if (typeof module !== "undefined") module.exports = PROMPT;
})(typeof window !== "undefined" ? window : globalThis);

/* ======== js/rules.js ======== */
/* CivicLens — rule engine.
 * Two jobs:
 *  1. Offline fallback: classify a complaint with multilingual keywords when the AI is unavailable.
 *  2. Safety guardrail: after the AI answers, enforce minimum severities for life-safety hazards,
 *     so a model mistake can never bury a live wire near a school.
 */
(function (root) {
  const C = root.CL_CONFIG || require("./config.js");

  // Keyword lists per category: English (incl. transliterated), Hindi, Telugu, Kannada, Tamil.
  const CATEGORY_KEYWORDS = {
    electricity: ["live wire", "electric wire", "current wire", "wire hanging", "hanging wire", "wire fell", "fallen wire",
      "sparking", "spark", "transformer", "electric pole", "power cut", "no power", "no current", "shock", "electrocut",
      "बिजली", "करंट", "तार", "ट्रांसफार्मर", "కరెంట్", "విద్యుత్", "తీగ", "వైర్", "ట్రాన్స్‌ఫార్మర్", "ట్రాన్స్ఫార్మర్",
      "ವಿದ್ಯುತ್", "ಕರೆಂಟ್", "ತಂತಿ", "ಟ್ರಾನ್ಸ್‌ಫಾರ್ಮರ್", "மின்சார", "மின் கம்பி", "மின்கம்பி", "கரண்ட்", "டிரான்ஸ்பார்மர்"],
    streetlights: ["streetlight", "street light", "street-light", "lamp post", "light not working", "lights not working",
      "स्ट्रीट लाइट", "बत्ती", "వీధి దీపం", "వీధి దీపాలు", "వీధి లైట్", "స్ట్రీట్ లైట్", "ಬೀದಿ ದೀಪ", "ಸ್ಟ್ರೀಟ್ ಲೈಟ್",
      "தெரு விளக்கு", "தெருவிளக்கு"],
    roads: ["pothole", "pot hole", "road damage", "damaged road", "broken road", "footpath", "crater", "speed breaker",
      "road caved", "cave-in", "road", "गड्ढा", "गड्ढे", "सड़क", "రోడ్డు", "గుంత", "గుంతలు", "రహదారి", "ಗುಂಡಿ", "ರಸ್ತೆ",
      "குழி", "சாலை", "ரோடு"],
    waste: ["garbage", "trash", "waste", "dump", "dustbin", "bin ", "litter", "rubbish", "debris", "kachra", "kooda",
      "कचरा", "कूड़ा", "చెత్త", "ಕಸ", "குப்பை"],
    water: ["water leak", "pipe burst", "pipeline", "no water", "water supply", "drinking water", "tap water", "leaking pipe",
      "contaminated water", "dirty water", "paani", "पानी", "पाइप", "नल", "నీరు", "నీళ్లు", "నీటి", "పైపు", "నల్లా",
      "ನೀರು", "ಪೈಪ್", "ಕುಡಿಯುವ", "தண்ணீர்", "குடிநீர்", "குழாய்"],
    drainage: ["drain", "drainage", "sewage", "sewer", "manhole", "gutter", "waterlogging", "water logging", "waterlogged",
      "nala", "naali", "नाली", "सीवर", "गटर", "मैनहोल", "డ్రైనేజీ", "మురుగు", "మ్యాన్‌హోల్", "మ్యాన్ హోల్", "ಚರಂಡಿ",
      "ಒಳಚರಂಡಿ", "ಮ್ಯಾನ್‌ಹೋಲ್", "சாக்கடை", "கழிவுநீர்", "வடிகால்", "மேன்ஹோல்"],
    trees: ["tree", "branch", "uprooted", "पेड़", "डाल", "చెట్టు", "కొమ్మ", "ಮರ", "ಕೊಂಬೆ", "மரம்", "கிளை"],
    stray_animals: ["stray dog", "stray dogs", "dogs", "dog bite", "cattle", "cows", "monkey", "आवारा", "कुत्ते", "కుక్కలు",
      "కుక్క", "పశువులు", "ನಾಯಿ", "நாய்"],
    public_health: ["mosquito", "dengue", "malaria", "dead animal", "carcass", "fogging", "stagnant water", "मच्छर",
      "దోమలు", "దోమల", "ಸೊಳ್ಳೆ", "கொசு"],
    encroachment: ["encroach", "illegal construction", "unauthorised construction", "unauthorized construction",
      "अतिक्रमण", "ఆక్రమణ", "ಒತ್ತುವರಿ", "ஆக்கிரமிப்பு"],
  };

  // Words that make a match more specific outrank generic ones like "road".
  const WEAK = new Set(["road", "रोड", "सड़क", "రోడ్డు", "ರಸ್ತೆ", "சாலை", "ரோடு", "dogs", "spark", "bin "]);

  const HAZARD_PATTERNS = {
    live_electricity: [/live wire/, /(wire|cable).{0,25}(hang|dangl|fall|fell|fallen|spark|expos|broken|cut|road)/,
      /(hang|dangl|fallen|exposed|broken).{0,15}(wire|cable)/, /sparking|electrocut|shock/,
      /(current|electric).{0,10}(wire|pole fell|pole fallen)/,
      /(तार).*(करंट|बिजली|गिर|लटक|टूट)|(करंट|बिजली).*(तार)/,
      /(తీగ|వైర్).*(కరెంట్|విద్యుత్|తెగి|వేలాడ|పడి)|(కరెంట్|విద్యుత్).*(తీగ|వైర్)/,
      /(ತಂತಿ|ವೈರ್).*(ಕರೆಂಟ್|ವಿದ್ಯುತ್|ಬಿದ್ದ|ನೇತಾಡ)|(ಕರೆಂಟ್|ವಿದ್ಯುತ್).*(ತಂತಿ|ವೈರ್)/,
      /(கம்பி|வயர்).*(மின்|கரண்ட்|அறுந்து|தொங்க)|(மின்|கரண்ட்).*(கம்பி|வயர்)/],
    open_manhole: [/(open|missing|uncovered|broken|no).{0,15}manhole/, /manhole.{0,20}(open|missing|uncovered|cover)/,
      /मैनहोल/, /మ్యాన్‌?\s?హోల్/, /ಮ್ಯಾನ್‌?ಹೋಲ್/, /மேன்ஹோல்/, /cave.?in|caved/],
    blocking_road: [/block(ing|ed)?.{0,15}(road|street|way|traffic)/, /(fell|fallen|lying).{0,20}(on|across).{0,10}(road|street)/,
      /can'?t (pass|go)|cannot pass|vehicles (can'?t|cannot)/, /ರಸ್ತೆಗೆ ಬಿದ್ದ|ಹೋಗಲು ಆಗುತ್ತಿಲ್ಲ/, /రోడ్డు మీద పడ/, /சாலையில் விழுந்த/],
    traffic_hazard: [/main road|highway|junction|accident|bike.{0,20}(fall|fell|slip)|falling/, /పడిపోతున్నారు/, /दुर्घटना/, /ಅಪಘಾತ/, /விபத்து/],
    near_school: [/school|college|anganwadi|children|kids/, /स्कूल|विद्यालय|बच्चे/, /పాఠశాల|స్కూల్|బడి|పిల్లలు/,
      /ಶಾಲೆ|ಸ್ಕೂಲ್|ಮಕ್ಕಳು/, /பள்ளி|ஸ்கூல்|குழந்தைகள்/],
    near_hospital: [/hospital|clinic|\bphc\b/, /अस्पताल/, /ఆసుపత్రి|హాస్పిటల్/, /ಆಸ್ಪತ್ರೆ/, /மருத்துவமனை/],
    health_risk: [/sewage|contaminat|dirty water|smell|stink|mosquito|dengue|disease|dead animal/, /बदबू|मच्छर|गंदा पानी/,
      /దుర్వాసన|దోమ|మురుగు/, /ವಾಸನೆ|ಸೊಳ್ಳೆ/, /நாற்றம்|கொசு/, /ganda paani/],
    flooding: [/flood|waterlog|knee.?deep|inundat/, /जलभराव/, /వరద/, /ಪ್ರವಾಹ/, /வெள்ள/],
    injury_reported: [/injur|bitten|bite|hurt|fell down|accident/, /घायल|काट/, /గాయ|కరిచ/, /ಗಾಯ|ಕಚ್ಚ/, /காயம்|கடித்த/],
  };

  // Minimum severities. These run AFTER the AI and can only raise severity, never lower it.
  const GUARDRAILS = [
    { when: h => h.has("live_electricity"), min: "Critical", why: "live electricity hazard" },
    { when: h => h.has("open_manhole") && (h.has("near_school") || h.has("near_hospital")), min: "Critical", why: "open manhole near school/hospital" },
    { when: h => h.has("open_manhole"), min: "High", why: "open manhole / road cave-in" },
    { when: h => h.has("blocking_road"), min: "High", why: "road blocked" },
    { when: h => h.has("injury_reported"), min: "High", why: "injury already reported" },
  ];

  const rank = s => C.SEVERITIES.indexOf(s);
  const maxSev = (a, b) => (rank(a) >= rank(b) ? a : b);

  function detectScript(text) {
    if (/[ఀ-౿]/.test(text)) return "Telugu";
    if (/[ऀ-ॿ]/.test(text)) return "Hindi";
    if (/[ಀ-೿]/.test(text)) return "Kannada";
    if (/[஀-௿]/.test(text)) return "Tamil";
    if (/\b(hai|ho raha|nahi|bhai|mein|me |kya|paani|kachra)\b/i.test(text)) return "Hinglish";
    return "English";
  }

  function detectHazards(text) {
    const t = (text || "").toLowerCase();
    return Object.keys(HAZARD_PATTERNS).filter(h => HAZARD_PATTERNS[h].some(rx => rx.test(t)));
  }

  function classifyCategory(text) {
    const t = (text || "").toLowerCase();
    let best = "other", bestScore = 0;
    for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) {
      let score = 0;
      for (const w of words) if (t.includes(w.toLowerCase())) score += WEAK.has(w) ? 1 : 3;
      if (score > bestScore) { best = cat; bestScore = score; }
    }
    return { category: best, score: bestScore };
  }

  // Raise severity to the guardrail minimum. Returns {severity, overrides[]}.
  function applyGuardrails(severity, hazards) {
    const h = new Set(hazards);
    let sev = severity, overrides = [];
    for (const g of GUARDRAILS) {
      if (g.when(h) && rank(g.min) > rank(sev)) {
        overrides.push(`Raised ${sev} → ${g.min}: ${g.why}`);
        sev = g.min;
      }
    }
    return { severity: sev, overrides };
  }

  const REPLY_TEMPLATES = {
    English: "Your complaint is registered as {TICKET_ID} and sent to {DEPT}. We will update you soon.",
    Hinglish: "Aapki complaint {TICKET_ID} number se register ho gayi hai aur {DEPT} ko bhej di gayi hai.",
    Hindi: "आपकी शिकायत {TICKET_ID} नंबर से दर्ज हो गई है और {DEPT} विभाग को भेज दी गई है।",
    Telugu: "మీ ఫిర్యాదు {TICKET_ID} నంబర్‌తో నమోదైంది. దీన్ని {DEPT} విభాగానికి పంపాము.",
    Kannada: "ನಿಮ್ಮ ದೂರು {TICKET_ID} ಸಂಖ್ಯೆಯೊಂದಿಗೆ ದಾಖಲಾಗಿದೆ ಮತ್ತು {DEPT} ವಿಭಾಗಕ್ಕೆ ಕಳುಹಿಸಲಾಗಿದೆ.",
    Tamil: "உங்கள் புகார் {TICKET_ID} எண்ணில் பதிவு செய்யப்பட்டு {DEPT} துறைக்கு அனுப்பப்பட்டுள்ளது.",
  };

  // Full offline triage — same output shape as the AI.
  function offlineTriage(text, hasPhoto) {
    const language = detectScript(text || "");
    const hazards = detectHazards(text);
    let { category, score } = classifyCategory(text);
    // A hanging/sparking wire is an electrical hazard even if the citizen mentions "streetlight" or "road".
    if (hazards.includes("live_electricity")) category = "electricity";
    if (hazards.includes("open_manhole") && category === "roads") category = "drainage";

    let severity = C.CATEGORIES[category].baseSeverity;
    if (hazards.includes("near_school") || hazards.includes("near_hospital")) {
      if (hazards.some(h => ["health_risk", "traffic_hazard", "blocking_road", "injury_reported"].includes(h)))
        severity = C.SEVERITIES[Math.min(3, rank(severity) + 1)];
    }
    if (hazards.includes("traffic_hazard") && category === "roads") severity = maxSev(severity, "High");
    if (hazards.includes("health_risk") && category === "water") severity = maxSev(severity, "High");

    const reasonBits = hazards.map(h => C.HAZARDS[h].toLowerCase());
    const severity_reason = reasonBits.length
      ? `Risk flags: ${reasonBits.join(", ")}.`
      : `${C.CATEGORIES[category].label} issue, no safety risk stated.`;

    const clean = (text || "").replace(/\s+/g, " ").trim();
    const summary = clean ? (clean.length > 70 ? clean.slice(0, 67) + "…" : clean) : "Photo-only complaint — needs review";
    const hasLocation = /\b(near|opposite|opp|beside|behind|outside|hospital|school|park|temple|market|bus stand|nagar|colony|sector|ward|layout|lane|cross|main road|\d+(st|nd|rd|th) street)\b|నగర్|कॉलोनी|ನಗರ|நகர்|தெரு|ರಸ್ತೆ|गली/i.test(clean);

    return {
      is_valid_complaint: score > 0 || hasPhoto,
      language,
      english_summary: summary,
      category,
      severity,
      severity_reason,
      hazards,
      location_text: (clean.match(/\b(?:near|outside|opposite|beside|behind|in front of|in)\s+(?:the\s+)?([A-Z0-9][^,.!?]{2,45})/) || [])[1]?.trim() || "",
      missing_info: hasLocation ? "" : "Exact location or nearby landmark",
      photo_observation: "",
      photo_matches_text: true,
      duplicate_of: "",
      confidence: score >= 3 ? 0.6 : score > 0 ? 0.4 : 0.2,
      citizen_reply: REPLY_TEMPLATES[language] || REPLY_TEMPLATES.English,
    };
  }

  // Simple word-overlap similarity for offline duplicate detection.
  function tokens(s) {
    return new Set((s || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(w => w.length > 2));
  }
  function similarity(a, b) {
    const A = tokens(a), B = tokens(b);
    if (!A.size || !B.size) return 0;
    let inter = 0;
    A.forEach(w => { if (B.has(w)) inter++; });
    return inter / Math.min(A.size, B.size);
  }

  const RULES = { detectScript, detectHazards, classifyCategory, applyGuardrails, offlineTriage, similarity, maxSev, rank, REPLY_TEMPLATES };
  root.CL_RULES = RULES;
  if (typeof module !== "undefined") module.exports = RULES;
})(typeof window !== "undefined" ? window : globalThis);

/* ======== js/pipeline.js ======== */
/* CivicLens — triage pipeline.
 * Raw AI (or offline) output → guardrails → routing → duplicate check → final ticket.
 * Pure functions with no browser APIs, so they can be tested in Node.
 */
(function (root) {
  const C = root.CL_CONFIG || require("./config.js");
  const R = root.CL_RULES || require("./rules.js");

  function normaliseRaw(raw) {
    const cat = C.CATEGORIES[raw.category] ? raw.category : "other";
    const sev = C.SEVERITIES.includes(raw.severity) ? raw.severity : C.CATEGORIES[cat].baseSeverity;
    const hazards = Array.isArray(raw.hazards) ? raw.hazards.filter(h => C.HAZARDS[h]) : [];
    return { ...raw, category: cat, severity: sev, hazards };
  }

  /**
   * Builds the ticket fields from a raw triage result.
   * `text` is the citizen's original text (used for the rule cross-check).
   */
  function buildTicketFields(rawIn, text, engine) {
    const raw = normaliseRaw(rawIn);
    // Cross-check: rules look at the same text independently.
    const ruleHazards = R.detectHazards(text);
    const ruleCat = R.classifyCategory(text);
    const hazards = Array.from(new Set([...raw.hazards, ...ruleHazards]));

    // A wire hazard must go to the power utility, whatever the model said.
    let category = raw.category;
    const notes = [];
    if (hazards.includes("live_electricity") && category === "streetlights") {
      category = "electricity";
      notes.push("Re-routed streetlights → electricity: live wire belongs to the power utility");
    }

    const g = R.applyGuardrails(raw.severity, hazards);
    const dept = C.CATEGORIES[category].dept;

    return {
      category,
      department: dept,
      severity: g.severity,
      aiSeverity: raw.severity,
      severityReason: (raw.severity_reason || "").trim() || `${C.CATEGORIES[category].label} issue.`,
      overrides: [...notes, ...g.overrides],
      hazards,
      summary: (raw.english_summary || "").trim() || (text || "").slice(0, 70),
      location: (raw.location_text || "").trim(),
      missingInfo: (raw.missing_info || "").trim(),
      language: raw.language || R.detectScript(text || ""),
      photoObservation: raw.photo_observation || "",
      photoMismatch: raw.photo_matches_text === false,
      confidence: typeof raw.confidence === "number" ? Math.max(0, Math.min(1, raw.confidence)) : null,
      isValid: raw.is_valid_complaint !== false,
      citizenReplyTemplate: raw.citizen_reply || R.REPLY_TEMPLATES.English,
      duplicateHint: (raw.duplicate_of || "").trim(),
      engine,
      ruleCheck: { category: ruleCat.score > 0 ? ruleCat.category : null, agrees: ruleCat.score === 0 || ruleCat.category === category },
    };
  }

  function haversineM(a, b) {
    const toRad = d => (d * Math.PI) / 180, Rm = 6371000;
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * Rm * Math.asin(Math.sqrt(x));
  }

  /** Returns the open ticket this complaint duplicates, or null. */
  function findDuplicate(fields, text, geo, tickets) {
    const open = tickets.filter(t => t.status !== "Resolved");
    // 1. AI said it's a duplicate — verify the ticket exists and the category matches.
    if (fields.duplicateHint) {
      const t = open.find(x => x.id === fields.duplicateHint);
      if (t && t.category === fields.category) return { ticket: t, method: "AI semantic match (cross-language)" };
    }
    // 2. Same category within ~120 m (when both have GPS).
    // Only trust precise fixes (phone GPS); laptop Wi-Fi/IP locations can be kilometres off.
    const precise = g => g && (g.acc == null || g.acc <= 100);
    if (precise(geo)) {
      const t = open.find(x => x.category === fields.category && precise(x.geo) && haversineM(geo, x.geo) < 120);
      if (t) return { ticket: t, method: "Same category within 120 m" };
    }
    // 3. Word overlap of summary + location + original text.
    const probe = `${fields.summary} ${fields.location} ${text}`;
    let best = null, bestSim = 0;
    for (const t of open) {
      if (t.category !== fields.category) continue;
      const sim = R.similarity(probe, `${t.summary} ${t.location} ${t.reports.map(r => r.text).join(" ")}`);
      if (sim > bestSim) { best = t; bestSim = sim; }
    }
    if (best && bestSim >= 0.6) return { ticket: best, method: `Text similarity ${Math.round(bestSim * 100)}%` };
    return null;
  }

  /** Priority score used to sort the dashboard. Higher = act first. */
  function priorityScore(t, now) {
    if (t.status === "Resolved") return -1;
    const meta = C.SEVERITY_META[t.severity];
    const ageH = (now - t.createdAt) / 3600000;
    let s = meta.points;
    s += Math.min(t.reports.length - 1, 5) * 8;                         // more citizens reporting it
    if (t.hazards.includes("near_school") || t.hazards.includes("near_hospital")) s += 10;
    s += Math.min(ageH / meta.slaHours, 1) * 10;                         // waiting longer
    if (ageH > meta.slaHours) s += 15;                                   // SLA breached
    return Math.round(s);
  }

  function slaInfo(t, now) {
    const meta = C.SEVERITY_META[t.severity];
    const due = t.createdAt + meta.slaHours * 3600000;
    return { due, breached: now > due && t.status !== "Resolved", hoursLeft: (due - now) / 3600000 };
  }

  const PIPE = { buildTicketFields, findDuplicate, priorityScore, slaInfo, haversineM };
  root.CL_PIPE = PIPE;
  if (typeof module !== "undefined") module.exports = PIPE;
})(typeof window !== "undefined" ? window : globalThis);

/* ======== server/server.js ======== */
/* ===================================================================
 * CivicLens server — Google Apps Script web app
 * - Keeps the Gemini API key secret (Script Properties → GEMINI_API_KEY)
 * - Stores tickets in the Google Sheet this script is attached to
 * - Officer logins with per-department access
 * - Reverse-geocodes citizen GPS into a readable address
 * The config / prompt / rules / pipeline code above this section is the
 * same code the website uses, so both sides classify identically.
 * =================================================================== */

var CITY_NAME = "Greater Bengaluru Authority";   // change to your municipal body
var SERVER_MODELS = ["gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-2.5-flash"];
var TICKET_HEADERS = ["id", "created", "updated", "status", "severity", "category", "department", "summary",
  "location", "address", "reports", "language", "engine", "ticket_json", "photo"];
var OFFICER_HEADERS = ["username", "name", "department", "password_hash", "set_new_password"];
var STATUSES = ["Open", "In progress", "Resolved"];

// Demo officer accounts created by setup(). Change passwords in the Officers sheet (column E).
var DEFAULT_OFFICERS = [
  ["commissioner", "Commissioner (all departments)", "ALL", "civic@2026"],
  ["roads", "Roads & Infrastructure officer", "ENG_ROADS", "roads@123"],
  ["sanitation", "Solid Waste Management officer", "SWM", "swm@123"],
  ["water", "Water Supply officer", "WATER", "water@123"],
  ["drainage", "Drainage & Sewerage officer", "DRAINAGE", "drain@123"],
  ["streetlights", "Street Lighting officer", "ELEC_SL", "light@123"],
  ["power", "Power DISCOM liaison officer", "DISCOM", "power@123"],
  ["horticulture", "Urban Forestry officer", "HORTI", "tree@123"],
  ["veterinary", "Animal Control officer", "VET", "vet@123"],
  ["health", "Public Health officer", "HEALTH", "health@123"],
  ["townplanning", "Town Planning officer", "TOWN_PLAN", "plan@123"],
  ["grievance", "Grievance Cell officer", "GRIEVANCE", "help@123"],
];

/* ---------------- entry points ---------------- */

function doGet() {
  return json_({ ok: true, service: "CivicLens", city: CITY_NAME, ai: !!getKey_() });
}

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: "Bad request" }); }
  var handler = HANDLERS[req.action];
  if (!handler) return json_({ ok: false, error: "Unknown action" });
  try {
    var out = handler(req) || {};
    out.ok = true;
    return json_(out);
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

var HANDLERS = {
  ping: function () { return { city: CITY_NAME, ai: !!getKey_() }; },
  geocode: function (req) { return { address: reverseGeocode_(req.lat, req.lng) }; },
  triage: triage_,
  track: track_,
  login: login_,
  logout: function (req) { CacheService.getScriptCache().remove("s_" + req.token); return {}; },
  list: list_,
  update: update_,
  reset: reset_,
};

/* ---------------- run these from the editor ---------------- */

// Run once after pasting the code: creates the sheets and officer accounts.
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty("SPREADSHEET_ID", ss.getId());
  sheet_("Tickets", TICKET_HEADERS);
  var off = sheet_("Officers", OFFICER_HEADERS);
  if (off.getLastRow() < 2) {
    var rows = DEFAULT_OFFICERS.map(function (o) { return [o[0], o[1], o[2], hash_(o[0], o[3]), ""]; });
    off.getRange(2, 1, rows.length, OFFICER_HEADERS.length).setValues(rows);
  }
  Logger.log("Setup done. Gemini key present: " + !!getKey_());
  Logger.log("Officer logins: " + DEFAULT_OFFICERS.map(function (o) { return o[0] + " / " + o[3]; }).join(",  "));
}

// Run to check the Gemini key works.
function testGemini() {
  var r = callGemini_("Live wire hanging near the government school gate, sparks coming", null, [], "");
  Logger.log(r.model + " → " + JSON.stringify(r.result));
}

/* ---------------- triage ---------------- */

function triage_(req) {
  var C = globalThis.CL_CONFIG, R = globalThis.CL_RULES, PIPE = globalThis.CL_PIPE;
  var text = String(req.text || "").slice(0, 3000);
  var photo = req.photo && req.photo.base64 ? req.photo : null;
  var thumb = typeof req.thumb === "string" && req.thumb.length < 45000 ? req.thumb : "";
  var geo = cleanGeo_(req.geo);
  var address = String(req.address || "").slice(0, 200);
  if (!text && !photo) throw new Error("Describe the problem or add a photo.");

  // 1. Ask Gemini (outside the lock — it is the slow part).
  var before = readTickets_().filter(function (t) { return t.status !== "Resolved"; }).slice(-25)
    .map(function (t) { return { id: t.id, category: t.category, summary: t.summary, location: t.location }; });
  var raw, engine, aiError = null;
  try {
    var r = callGemini_(text, photo, before, address);
    raw = r.result; engine = r.model;
  } catch (err) {
    aiError = String(err.message || err);
    raw = R.offlineTriage(text, !!photo); engine = "offline-rules";
  }
  var f = PIPE.buildTicketFields(raw, text, engine);
  f.aiError = aiError;
  if (!f.location && address) f.location = "Near " + address;

  // 2. Duplicate check + save, under a lock so two citizens can't collide.
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var tickets = readTickets_();
    var now = Date.now();
    var report = { at: now, text: text, language: f.language, address: address };
    var dup = PIPE.findDuplicate(f, text, geo, tickets);
    if (dup) {
      var t = dup.ticket;
      t.reports.push(report);
      var sevBefore = t.severity;
      t.severity = R.maxSev(t.severity, f.severity);
      if (t.severity !== sevBefore) t.severityReason = f.severityReason;
      t.hazards = Array.from(new Set(t.hazards.concat(f.hazards)));
      if (!t.photo && thumb) t.photo = thumb;
      if (!t.location && f.location) t.location = f.location;
      t.updatedAt = now;
      t.log.push({ at: now, what: "Duplicate report merged (" + dup.method + ")" });
      writeTicket_(t);
      var reply = fill_(f.citizenReplyTemplate, t.id, C.DEPARTMENTS[t.department].short);
      return { ticket: public_(t), merged: dup.method, fields: publicFields_(f), reply: reply };
    }
    var id = nextId_();
    var nt = {};
    Object.keys(f).forEach(function (k) { nt[k] = f[k]; });
    nt.id = id; nt.createdAt = now; nt.updatedAt = now; nt.status = "Open";
    nt.citizenReply = fill_(f.citizenReplyTemplate, id, C.DEPARTMENTS[f.department].short);
    nt.geo = geo; nt.address = address; nt.photo = thumb || null;
    nt.reports = [report];
    nt.log = [{ at: now, what: "Created by " + engine }];
    delete nt.citizenReplyTemplate; delete nt.duplicateHint;
    writeTicket_(nt);
    return { ticket: public_(nt), merged: null, fields: publicFields_(f), reply: nt.citizenReply };
  } finally {
    lock.releaseLock();
  }
}

function track_(req) {
  var id = String(req.id || "").trim().toUpperCase();
  if (!/^CL-\d+$/.test(id)) throw new Error("Ticket numbers look like CL-1001.");
  var t = readTickets_().filter(function (x) { return x.id === id; })[0];
  if (!t) throw new Error("No ticket " + id + " found.");
  return { ticket: {
    id: t.id, status: t.status, severity: t.severity, category: t.category, department: t.department,
    summary: t.summary, location: t.location, createdAt: t.createdAt, updatedAt: t.updatedAt,
    reports: t.reports.length, log: t.log,
  } };
}

/* ---------------- officers ---------------- */

function login_(req) {
  var user = String(req.username || "").trim().toLowerCase();
  var pw = String(req.password || "");
  applyPasswordChanges_();
  var rows = sheet_("Officers", OFFICER_HEADERS).getDataRange().getValues().slice(1);
  var row = rows.filter(function (r) { return String(r[0]).trim().toLowerCase() === user; })[0];
  if (!row || row[3] !== hash_(user, pw)) {
    Utilities.sleep(700); // slow down guessing
    throw new Error("Wrong username or password.");
  }
  var token = Utilities.getUuid();
  var session = { user: user, name: row[1], dept: row[2] };
  CacheService.getScriptCache().put("s_" + token, JSON.stringify(session), 21600); // 6 hours
  return { token: token, name: session.name, dept: session.dept };
}

function session_(token) {
  var s = token && CacheService.getScriptCache().get("s_" + token);
  if (!s) throw new Error("SESSION_EXPIRED");
  return JSON.parse(s);
}

function canSee_(s, t) { return s.dept === "ALL" || s.dept === t.department; }

function list_(req) {
  var s = session_(req.token);
  var tickets = readTickets_().filter(function (t) { return canSee_(s, t); }).map(public_);
  return { tickets: tickets, name: s.name, dept: s.dept, city: CITY_NAME };
}

function update_(req) {
  var s = session_(req.token);
  if (STATUSES.indexOf(req.status) < 0) throw new Error("Unknown status");
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var t = readTickets_().filter(function (x) { return x.id === req.id; })[0];
    if (!t) throw new Error("Ticket not found");
    if (!canSee_(s, t)) throw new Error("This ticket belongs to another department.");
    t.status = req.status;
    t.updatedAt = Date.now();
    t.log.push({ at: t.updatedAt, what: "Status → " + t.status + " by " + s.name });
    writeTicket_(t);
    return { ticket: public_(t) };
  } finally { lock.releaseLock(); }
}

function reset_(req) {
  var s = session_(req.token);
  if (s.dept !== "ALL") throw new Error("Only the commissioner can clear tickets.");
  var sh = sheet_("Tickets", TICKET_HEADERS);
  if (sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
  PropertiesService.getScriptProperties().setProperty("SEQ", "1000");
  return {};
}

function applyPasswordChanges_() {
  var sh = sheet_("Officers", OFFICER_HEADERS);
  var vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    var np = String(vals[i][4] || "");
    if (np) {
      sh.getRange(i + 1, 4, 1, 2).setValues([[hash_(String(vals[i][0]).trim().toLowerCase(), np), ""]]);
    }
  }
}

function hash_(user, pw) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, "civiclens:" + user + ":" + pw, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ("0" + (b & 0xff).toString(16)).slice(-2); }).join("");
}

/* ---------------- Gemini ---------------- */

function getKey_() { return PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY"); }

function callGemini_(text, photo, openTickets, address) {
  var key = getKey_();
  if (!key) throw new Error("GEMINI_API_KEY is not set in Script Properties");
  var P = globalThis.CL_PROMPT;
  var msg = P.buildUserMessage(text, openTickets, !!photo);
  if (address) msg += "\n\nGPS address from the citizen's phone (approximate; use it for location_text only if the complaint names no place): " + address;
  var parts = [{ text: msg }];
  if (photo) parts.push({ inlineData: { mimeType: photo.mimeType || "image/jpeg", data: photo.base64 } });
  var body = {
    systemInstruction: { parts: [{ text: P.buildSystemPrompt(CITY_NAME) }] },
    contents: [{ role: "user", parts: parts }],
    generationConfig: { responseMimeType: "application/json", responseSchema: P.RESPONSE_SCHEMA },
  };
  var preferred = PropertiesService.getScriptProperties().getProperty("GEMINI_MODEL");
  var models = preferred ? [preferred].concat(SERVER_MODELS.filter(function (m) { return m !== preferred; })) : SERVER_MODELS;
  var lastErr = "";
  for (var i = 0; i < models.length; i++) {
    var m = models[i];
    var r = geminiPost_(m, key, body);
    if (r.code === 400 && /schema|Invalid JSON payload|Unknown name/i.test(r.text)) {
      var b2 = JSON.parse(JSON.stringify(body));
      delete b2.generationConfig.responseSchema;
      r = geminiPost_(m, key, b2);
    }
    if (r.code === 200) return { result: parseJson_(extractText_(r.json)), model: m };
    var msgErr = (r.json && r.json.error && r.json.error.message) || ("HTTP " + r.code);
    lastErr = m + ": " + msgErr;
    if (r.code === 404 || /not found|not supported|is not available/i.test(msgErr)) continue;
    if (r.code === 429) throw new Error("Gemini rate limit reached");
    throw new Error(lastErr);
  }
  throw new Error(lastErr || "No Gemini model available");
}

function geminiPost_(model, key, body) {
  var res = UrlFetchApp.fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", {
    method: "post", contentType: "application/json", headers: { "x-goog-api-key": key },
    payload: JSON.stringify(body), muteHttpExceptions: true,
  });
  var txt = res.getContentText();
  var j = null;
  try { j = JSON.parse(txt); } catch (e) {}
  return { code: res.getResponseCode(), text: txt, json: j };
}

function extractText_(j) {
  var parts = (j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
  return parts.filter(function (p) { return !p.thought && typeof p.text === "string"; }).map(function (p) { return p.text; }).join("");
}

function parseJson_(text) {
  try { return JSON.parse(text); } catch (e) {}
  var m = text.match(/\{[\s\S]*\}/);
  if (m) return JSON.parse(m[0]);
  throw new Error("Gemini reply was not valid JSON");
}

/* ---------------- location ---------------- */

function cleanGeo_(g) {
  if (!g || typeof g.lat !== "number" || typeof g.lng !== "number") return null;
  if (Math.abs(g.lat) > 90 || Math.abs(g.lng) > 180) return null;
  return { lat: g.lat, lng: g.lng, acc: typeof g.acc === "number" ? g.acc : null };
}

function reverseGeocode_(lat, lng) {
  lat = Number(lat); lng = Number(lng);
  if (!isFinite(lat) || !isFinite(lng)) throw new Error("Bad coordinates");
  var cache = CacheService.getScriptCache();
  var ck = "g_" + lat.toFixed(4) + "_" + lng.toFixed(4);
  var hit = cache.get(ck);
  if (hit) return hit;
  var addr = "";
  try {
    var r = Maps.newGeocoder().setLanguage("en").reverseGeocode(lat, lng);
    if (r && r.status === "OK" && r.results && r.results.length) addr = shortAddress_(r.results[0].formatted_address);
  } catch (e) {}
  if (!addr) {
    try {
      var res = UrlFetchApp.fetch("https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&lat=" + lat + "&lon=" + lng,
        { headers: { "User-Agent": "CivicLens-hackathon-prototype" }, muteHttpExceptions: true });
      var j = JSON.parse(res.getContentText());
      if (j && j.display_name) addr = shortAddress_(j.display_name);
    } catch (e) {}
  }
  if (!addr) addr = lat.toFixed(5) + ", " + lng.toFixed(5);
  cache.put(ck, addr, 21600);
  return addr;
}

function shortAddress_(a) {
  var parts = String(a).split(",").map(function (s) { return s.trim(); })
    .filter(function (s) { return s && !/^[A-Z0-9]{4,}\+[A-Z0-9]{2,}/.test(s) && !/^\d{6}$/.test(s) && s !== "India"; })
    .map(function (s) { return s.replace(/\s+\d{6}$/, ""); });
  return parts.slice(0, 4).join(", ");
}

/* ---------------- storage ---------------- */

function ss_() {
  var id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name, headers) {
  var ss = ss_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  return sh;
}

function readTickets_() {
  var sh = sheet_("Tickets", TICKET_HEADERS);
  var vals = sh.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < vals.length; i++) {
    var js = vals[i][13];
    if (!js) continue;
    try {
      var t = JSON.parse(js);
      t.status = vals[i][3] || t.status;      // officers may edit status directly in the sheet
      t.photo = vals[i][14] || null;
      t._row = i + 1;
      out.push(t);
    } catch (e) {}
  }
  return out;
}

function writeTicket_(t) {
  var sh = sheet_("Tickets", TICKET_HEADERS);
  var copy = {};
  Object.keys(t).forEach(function (k) { if (k !== "_row" && k !== "photo") copy[k] = t[k]; });
  var row = [t.id, new Date(t.createdAt), new Date(t.updatedAt), t.status, t.severity, t.category, t.department,
    t.summary, t.location || "", t.address || "", t.reports.length, t.language, t.engine, JSON.stringify(copy), t.photo || ""];
  if (t._row) sh.getRange(t._row, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);
}

function nextId_() {
  var p = PropertiesService.getScriptProperties();
  var n = Number(p.getProperty("SEQ") || "1000") + 1;
  p.setProperty("SEQ", String(n));
  return "CL-" + n;
}

/* ---------------- helpers ---------------- */

function public_(t) {
  var o = {};
  Object.keys(t).forEach(function (k) { if (k !== "_row") o[k] = t[k]; });
  return o;
}

function publicFields_(f) {
  var o = {};
  Object.keys(f).forEach(function (k) { if (k !== "citizenReplyTemplate" && k !== "duplicateHint") o[k] = f[k]; });
  return o;
}

function fill_(tpl, id, dept) {
  return String(tpl || "").split("{TICKET_ID}").join(id).split("{DEPT}").join(dept);
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
