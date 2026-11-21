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
    if (geo) {
      const t = open.find(x => x.category === fields.category && x.geo && haversineM(geo, x.geo) < 120);
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
