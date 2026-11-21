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
