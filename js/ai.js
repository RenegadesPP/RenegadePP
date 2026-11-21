/* CivicLens — Gemini API client (called directly from the browser). */
(function (root) {
  const C = root.CL_CONFIG;
  const P = root.CL_PROMPT;
  const ENDPOINT = m => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`;

  async function post(model, apiKey, body, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(ENDPOINT(model), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const json = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, json };
    } finally {
      clearTimeout(timer);
    }
  }

  function extractText(json) {
    const parts = json?.candidates?.[0]?.content?.parts || [];
    return parts.filter(p => !p.thought && typeof p.text === "string").map(p => p.text).join("");
  }

  function parseJson(text) {
    try { return JSON.parse(text); } catch (_) {}
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("AI reply was not valid JSON");
  }

  /**
   * Triage one complaint. Tries the chosen model, then the other known models
   * if a model id is not available on this key. Throws on failure so the
   * caller can fall back to offline rules.
   */
  async function triage({ apiKey, model, cityName, text, photo, openTickets }) {
    if (!apiKey) throw new Error("No API key set");
    const userParts = [{ text: P.buildUserMessage(text, openTickets, !!photo) }];
    if (photo) userParts.push({ inlineData: { mimeType: photo.mimeType, data: photo.base64 } });

    const base = {
      systemInstruction: { parts: [{ text: P.buildSystemPrompt(cityName) }] },
      contents: [{ role: "user", parts: userParts }],
    };
    const withSchema = { ...base, generationConfig: { responseMimeType: "application/json", responseSchema: P.RESPONSE_SCHEMA } };
    const jsonOnly = { ...base, generationConfig: { responseMimeType: "application/json" } };

    const models = [model, ...C.MODELS.filter(m => m !== model)];
    let lastErr = "";
    for (const m of models) {
      let r = await post(m, apiKey, withSchema, 30000);
      // Some models reject a schema field — retry once with plain JSON mode.
      if (!r.ok && r.status === 400 && /schema|Invalid JSON payload|Unknown name/i.test(JSON.stringify(r.json))) {
        r = await post(m, apiKey, jsonOnly, 30000);
      }
      if (r.ok) {
        const out = parseJson(extractText(r.json));
        return { result: out, model: m };
      }
      const msg = r.json?.error?.message || `HTTP ${r.status}`;
      lastErr = `${m}: ${msg}`;
      if (r.status === 404 || /not found|not supported|is not available/i.test(msg)) continue; // try next model
      if (r.status === 400 && /API key/i.test(msg)) throw new Error("API key is not valid — check Settings");
      if (r.status === 429) throw new Error("Rate limit reached on this API key — wait a minute");
      throw new Error(lastErr);
    }
    throw new Error(lastErr || "No Gemini model available");
  }

  async function testKey(apiKey, model) {
    const r = await post(model, apiKey, { contents: [{ role: "user", parts: [{ text: "Reply with the word OK." }] }] }, 15000);
    if (!r.ok) throw new Error(r.json?.error?.message || `HTTP ${r.status}`);
    return extractText(r.json);
  }

  root.CL_AI = { triage, testKey };
})(window);
