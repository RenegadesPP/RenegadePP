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
      location_text: "",
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
