/* CivicLens — user interface: citizen form, ticket view, officer dashboard. */
(function () {
  const C = window.CL_CONFIG, R = window.CL_RULES, P = window.CL_PIPE, AI = window.CL_AI;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- storage ----------
  const LS = { tickets: "cl.tickets", seq: "cl.seq", settings: "cl.settings" };
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (_) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn("Storage full", e); } };

  let tickets = load(LS.tickets, []);
  let settings = Object.assign({ city: "City Municipal Corporation", apiKey: "", model: C.MODELS[0], offline: false }, load(LS.settings, {}));
  let photo = null;      // { mimeType, base64, thumb }
  let geo = null;        // { lat, lng }
  let busy = false;

  const nextId = () => { const n = load(LS.seq, 1000) + 1; save(LS.seq, n); return `CL-${n}`; };
  const persist = () => { save(LS.tickets, tickets); renderCounts(); };
  const aiReady = () => !settings.offline && !!settings.apiKey;

  // ---------- header / settings ----------
  function renderEngine() {
    const pill = $("#enginePill");
    pill.textContent = aiReady() ? `Gemini · ${settings.model}` : "Offline rules";
    pill.classList.toggle("is-ai", aiReady());
    $("#cityLabel").textContent = settings.city;
  }

  function openSettings() {
    $("#sCity").value = settings.city;
    $("#sKey").value = settings.apiKey;
    $("#sModel").value = settings.model;
    $("#sOffline").checked = settings.offline;
    $("#testKeyOut").textContent = "";
    $("#settingsDlg").showModal();
  }

  $("#modelList").innerHTML = C.MODELS.map(m => `<option value="${m}">`).join("");
  $("#enginePill").addEventListener("click", openSettings);
  $("#settingsDlg").addEventListener("close", () => {
    if ($("#settingsDlg").returnValue !== "save") return;
    settings = {
      city: $("#sCity").value.trim() || "City Municipal Corporation",
      apiKey: $("#sKey").value.trim(),
      model: $("#sModel").value.trim() || C.MODELS[0],
      offline: $("#sOffline").checked,
    };
    save(LS.settings, settings);
    renderEngine();
  });
  $("#testKeyBtn").addEventListener("click", async () => {
    const out = $("#testKeyOut");
    out.textContent = "Testing…";
    try {
      await AI.testKey($("#sKey").value.trim(), $("#sModel").value.trim() || C.MODELS[0]);
      out.textContent = "Connected.";
    } catch (e) { out.textContent = e.message; }
  });

  // ---------- tabs ----------
  function showView(name) {
    document.querySelectorAll(".tab").forEach(b => {
      const on = b.dataset.view === name;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", on);
    });
    $("#view-report").hidden = name !== "report";
    $("#view-dashboard").hidden = name !== "dashboard";
    if (name === "dashboard") renderBoard();
  }
  document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));

  // ---------- citizen form ----------
  $("#voiceLang").innerHTML = C.LANGUAGES.map(l => `<option value="${l.code}">${l.label}</option>`).join("");
  $("#samplePicker").innerHTML += window.CL_SAMPLES.map((s, i) => `<option value="${i}">${esc(s.label)}</option>`).join("");
  $("#samplePicker").addEventListener("change", e => {
    const s = window.CL_SAMPLES[e.target.value];
    if (!s) return;
    $("#complaintText").value = s.text;
    $("#voiceLang").value = s.lang;
    e.target.value = "";
  });

  // Voice input (Web Speech API, works in Chrome / Edge)
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  if (!SR) { $("#micBtn").disabled = true; $("#micBtn").title = "Voice input needs Chrome or Edge"; }
  $("#micBtn").addEventListener("click", () => {
    if (!SR) return;
    if (rec) { rec.stop(); return; }
    rec = new SR();
    rec.lang = $("#voiceLang").value;
    rec.interimResults = false;
    rec.onresult = e => {
      const said = Array.from(e.results).map(r => r[0].transcript).join(" ");
      const ta = $("#complaintText");
      ta.value = (ta.value ? ta.value + " " : "") + said;
    };
    rec.onend = () => { rec = null; $("#micBtn").classList.remove("is-live"); $("#micBtn").lastChild.textContent = "Speak"; };
    rec.onerror = e => { $("#formError").textContent = `Voice input stopped: ${e.error}`; };
    rec.start();
    $("#micBtn").classList.add("is-live");
    $("#micBtn").lastChild.textContent = "Listening… tap to stop";
  });

  // Photo: resize to keep the request and storage small
  function resizeImage(file, maxSide, quality) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, maxSide / Math.max(img.width, img.height));
        const cv = document.createElement("canvas");
        cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL("image/jpeg", quality));
        URL.revokeObjectURL(img.src);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }
  async function setPhoto(file) {
    if (!file || !file.type.startsWith("image/")) return;
    const big = await resizeImage(file, 1024, 0.82);
    const thumb = await resizeImage(file, 360, 0.7);
    photo = { mimeType: "image/jpeg", base64: big.split(",")[1], thumb };
    $("#photoPreview").src = thumb; $("#photoPreview").hidden = false;
    $("#photoHint").hidden = true; $("#clearPhoto").hidden = false;
  }
  function clearPhoto() {
    photo = null; $("#photoInput").value = "";
    $("#photoPreview").hidden = true; $("#photoHint").hidden = false; $("#clearPhoto").hidden = true;
  }
  $("#photoInput").addEventListener("change", e => setPhoto(e.target.files[0]));
  $("#clearPhoto").addEventListener("click", clearPhoto);
  const drop = $("#photoDrop");
  drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("is-over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
  drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("is-over"); setPhoto(e.dataTransfer.files[0]); });

  $("#geoBtn").addEventListener("click", () => {
    const st = $("#geoStatus");
    if (!navigator.geolocation) { st.textContent = "Location not available in this browser"; return; }
    st.textContent = "Finding you…";
    navigator.geolocation.getCurrentPosition(
      p => { geo = { lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5) }; st.textContent = `GPS ${geo.lat}, ${geo.lng}`; },
      e => { st.textContent = `Location blocked (${e.message || "permission denied"})`; },
      { timeout: 8000 }
    );
  });

  // ---------- triage ----------
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function triageComplaint(text, ph, gp, onStep = () => {}) {
    onStep("read");
    const openTickets = tickets.filter(t => t.status !== "Resolved").slice(0, 25)
      .map(t => ({ id: t.id, category: t.category, summary: t.summary, location: t.location }));
    let raw, engine, aiError = null;
    onStep("classify");
    if (aiReady()) {
      try {
        const r = await AI.triage({ apiKey: settings.apiKey, model: settings.model, cityName: settings.city, text, photo: ph, openTickets });
        raw = r.result; engine = r.model;
      } catch (e) { aiError = e.message; }
    }
    if (!raw) { raw = R.offlineTriage(text, !!ph); engine = "offline-rules"; }

    onStep("guard");
    const f = P.buildTicketFields(raw, text, engine);
    f.aiError = aiError;
    await sleep(250);

    onStep("route");
    const now = Date.now();
    const report = { at: now, text, language: f.language, photo: ph ? ph.thumb : null };
    const dup = P.findDuplicate(f, text, gp, tickets);
    if (dup) {
      const t = dup.ticket;
      t.reports.push(report);
      const before = t.severity;
      t.severity = R.maxSev(t.severity, f.severity);
      if (t.severity !== before) t.severityReason = f.severityReason;
      t.hazards = Array.from(new Set([...t.hazards, ...f.hazards]));
      if (!t.photo && ph) t.photo = ph.thumb;
      if (!t.location && f.location) t.location = f.location;
      t.updatedAt = now;
      t.log.push({ at: now, what: `Duplicate report merged (${dup.method})` });
      persist();
      const reply = f.citizenReplyTemplate.replaceAll("{TICKET_ID}", t.id).replaceAll("{DEPT}", C.DEPARTMENTS[t.department].short);
      return { ticket: t, merged: dup.method, fields: f, reply };
    }
    const id = nextId();
    const t = {
      id, createdAt: now, updatedAt: now, status: "Open",
      ...f,
      citizenReply: f.citizenReplyTemplate.replaceAll("{TICKET_ID}", id).replaceAll("{DEPT}", C.DEPARTMENTS[f.department].short),
      geo: gp, photo: ph ? ph.thumb : null,
      reports: [report],
      log: [{ at: now, what: `Created by ${engine}` }],
    };
    delete t.citizenReplyTemplate; delete t.duplicateHint;
    tickets.unshift(t);
    persist();
    return { ticket: t, merged: null, fields: f };
  }

  function setStep(name) {
    const order = ["read", "classify", "guard", "route"];
    const i = order.indexOf(name);
    document.querySelectorAll("#steps li").forEach((li, j) => {
      li.classList.toggle("done", j < i);
      li.classList.toggle("active", j === i);
    });
  }

  $("#complaintForm").addEventListener("submit", async e => {
    e.preventDefault();
    if (busy) return;
    const text = $("#complaintText").value.trim();
    $("#formError").textContent = "";
    if (!text && !photo) { $("#formError").textContent = "Describe the problem or add a photo to file a complaint."; return; }
    busy = true;
    $("#submitBtn").disabled = true; $("#submitBtn").textContent = "Triaging…";
    $("#resultEmpty").hidden = true; $("#ticketOut").innerHTML = ""; $("#steps").hidden = false;
    try {
      const out = await triageComplaint(text, photo, geo, setStep);
      document.querySelectorAll("#steps li").forEach(li => { li.classList.add("done"); li.classList.remove("active"); });
      await sleep(200);
      $("#steps").hidden = true;
      $("#ticketOut").innerHTML = ticketSlip(out);
      if (window.innerWidth < 900) $("#ticketOut").scrollIntoView({ behavior: "smooth", block: "start" });
      $("#complaintText").value = ""; clearPhoto(); geo = null; $("#geoStatus").textContent = "";
    } catch (err) {
      $("#steps").hidden = true;
      $("#formError").textContent = `Could not file the complaint: ${err.message}`;
    } finally {
      busy = false;
      $("#submitBtn").disabled = false; $("#submitBtn").textContent = "Triage complaint";
    }
  });

  // ---------- rendering helpers ----------
  const sevClass = s => `sev-${String(s).toLowerCase()}`;
  const deptName = d => C.DEPARTMENTS[d]?.name || d;
  const catLabel = c => C.CATEGORIES[c]?.label || c;
  function fmtLeft(h) {
    if (h <= 0) { const o = -h; return o < 1 ? `${Math.round(o * 60)} min overdue` : `${Math.round(o)} h overdue`; }
    if (h < 1) return `${Math.round(h * 60)} min`;
    if (h < 48) return `${Math.round(h)} h`;
    return `${Math.round(h / 24)} days`;
  }
  const hazardChips = hs => hs.map(h => `<span class="chip">${esc(C.HAZARDS[h])}</span>`).join("");

  function ticketSlip({ ticket: t, merged, fields: f, reply }) {
    const sla = P.slaInfo(t, Date.now());
    return `
    <article class="slip ${sevClass(t.severity)}">
      <div class="slip-band"><span>${t.severity}</span></div>
      <div class="slip-body">
        <div class="slip-top">
          <span class="ticket-id">${t.id}</span>
          <span class="engine-tag">${f.engine === "offline-rules" ? "Offline rules" : "Gemini"}${f.confidence != null ? ` · ${Math.round(f.confidence * 100)}% sure` : ""}</span>
        </div>
        ${merged ? `<p class="merged">Merged into an existing ticket — ${t.reports.length} citizens have now reported this. <small>${esc(merged)}</small></p>` : ""}
        ${f.aiError ? `<p class="warn">Gemini unavailable (${esc(f.aiError)}). Triaged with offline rules — officer should review.</p>` : ""}
        ${!f.isValid ? `<p class="warn">This may not be a civic complaint. Sent to the Grievance Cell for manual review.</p>` : ""}
        <h2 class="slip-title">${esc(t.summary)}</h2>
        <dl class="facts">
          <div><dt>Category</dt><dd>${esc(catLabel(t.category))}</dd></div>
          <div><dt>Routed to</dt><dd>${esc(deptName(t.department))}</dd></div>
          <div><dt>Why ${t.severity.toLowerCase()}</dt><dd>${esc(t.severityReason)}</dd></div>
          <div><dt>Location</dt><dd>${esc(t.location || "Not given")}${t.geo ? ` <small>(GPS ${t.geo.lat}, ${t.geo.lng})</small>` : ""}</dd></div>
          <div><dt>Act within</dt><dd>${fmtLeft(sla.hoursLeft)}</dd></div>
          <div><dt>Language</dt><dd>${esc(t.language)}</dd></div>
        </dl>
        ${t.hazards.length ? `<div class="chips">${hazardChips(t.hazards)}</div>` : ""}
        ${f.overrides.length ? `<p class="guard"><strong>Safety guardrail:</strong> ${f.overrides.map(esc).join("; ")}. ${f.engine === "offline-rules" ? "Initial rating" : "The AI said"} ${esc(f.aiSeverity)}.</p>` : ""}
        ${f.photoObservation ? `<p class="photo-obs"><strong>Photo shows:</strong> ${esc(f.photoObservation)}${f.photoMismatch ? " — <em>doesn't match the text, flagged for review</em>" : ""}</p>` : ""}
        ${t.missingInfo ? `<p class="ask"><strong>Officer needs:</strong> ${esc(t.missingInfo)}</p>` : ""}
        <div class="reply"><div class="reply-label">Message sent to the citizen</div><p>${esc(reply || t.citizenReply)}</p></div>
        ${!f.ruleCheck.agrees && f.ruleCheck.category ? `<p class="crosscheck">Rule engine would have chosen <em>${esc(catLabel(f.ruleCheck.category))}</em> — category kept from AI.</p>` : ""}
      </div>
    </article>`;
  }

  // ---------- dashboard ----------
  function renderCounts() {
    $("#openCount").textContent = tickets.filter(t => t.status !== "Resolved").length;
  }

  $("#fDept").innerHTML += Object.entries(C.DEPARTMENTS).map(([k, v]) => `<option value="${k}">${esc(v.short)}</option>`).join("");
  $("#fSev").innerHTML += C.SEVERITIES.slice().reverse().map(s => `<option>${s}</option>`).join("");
  ["#fDept", "#fSev", "#fStatus"].forEach(s => $(s).addEventListener("change", renderBoard));
  $("#fSearch").addEventListener("input", renderBoard);

  function filtered() {
    const d = $("#fDept").value, s = $("#fSev").value, st = $("#fStatus").value, q = $("#fSearch").value.toLowerCase();
    return tickets.filter(t =>
      (!d || t.department === d) && (!s || t.severity === s) &&
      (!st || (st === "active" ? t.status !== "Resolved" : t.status === st)) &&
      (!q || `${t.id} ${t.summary} ${t.location} ${t.reports.map(r => r.text).join(" ")}`.toLowerCase().includes(q)));
  }

  function renderKpis() {
    const now = Date.now();
    const open = tickets.filter(t => t.status !== "Resolved");
    const by = s => open.filter(t => t.severity === s).length;
    const breached = open.filter(t => P.slaInfo(t, now).breached).length;
    const merged = tickets.reduce((n, t) => n + t.reports.length - 1, 0);
    $("#kpis").innerHTML = [
      ["Critical open", by("Critical"), "sev-critical"],
      ["High open", by("High"), "sev-high"],
      ["Medium + low open", by("Medium") + by("Low"), ""],
      ["Past deadline", breached, breached ? "alert" : ""],
      ["Duplicate reports merged", merged, ""],
    ].map(([l, v, c]) => `<div class="kpi ${c}"><div class="kpi-v">${v}</div><div class="kpi-l">${l}</div></div>`).join("");
  }

  function renderBoard() {
    renderKpis();
    const now = Date.now();
    const rows = filtered().map(t => ({ t, score: P.priorityScore(t, now) })).sort((a, b) => b.score - a.score);
    $("#boardEmpty").hidden = rows.length > 0;
    $("#ticketRows").innerHTML = rows.map(({ t, score }, i) => {
      const sla = P.slaInfo(t, now);
      return `<tr class="${sevClass(t.severity)} ${t.status === "Resolved" ? "is-done" : ""}" data-id="${t.id}" tabindex="0">
        <td class="rank"><span>${t.status === "Resolved" ? "–" : i + 1}</span><small title="Priority score">${score < 0 ? "" : score}</small></td>
        <td><span class="sev-tag ${sevClass(t.severity)}">${t.severity}</span></td>
        <td class="tid">${t.id}${t.photo ? ' <span class="has-photo" title="Has photo">◩</span>' : ""}</td>
        <td class="issue"><div class="issue-title">${esc(t.summary)}</div>
          <div class="issue-meta">${esc(catLabel(t.category))}${t.location ? ` — ${esc(t.location)}` : ""}${t.language !== "English" ? ` <span class="lang">${esc(t.language)}</span>` : ""}</div>
          <div class="issue-reason">${esc(t.severityReason)}</div></td>
        <td>${esc(C.DEPARTMENTS[t.department]?.short)}</td>
        <td class="num">${t.reports.length > 1 ? `<strong>${t.reports.length}</strong>` : "1"}</td>
        <td class="${sla.breached ? "overdue" : ""}">${t.status === "Resolved" ? "Done" : fmtLeft(sla.hoursLeft)}</td>
        <td><select class="status" data-id="${t.id}" aria-label="Status of ${t.id}">
          ${["Open", "In progress", "Resolved"].map(s => `<option ${s === t.status ? "selected" : ""}>${s}</option>`).join("")}
        </select></td></tr>`;
    }).join("");
  }

  $("#ticketRows").addEventListener("change", e => {
    if (!e.target.matches("select.status")) return;
    const t = tickets.find(x => x.id === e.target.dataset.id);
    t.status = e.target.value; t.updatedAt = Date.now();
    t.log.push({ at: t.updatedAt, what: `Status → ${t.status}` });
    persist(); renderBoard();
  });
  function openDetail(id) {
    const t = tickets.find(x => x.id === id);
    if (!t) return;
    $("#detailBody").innerHTML = `
      ${ticketSlip({ ticket: t, merged: null, fields: { ...t, citizenReplyTemplate: t.citizenReply } })}
      <h3 class="sub">Citizen reports (${t.reports.length})</h3>
      <ul class="reports">${t.reports.map(r => `<li><time>${new Date(r.at).toLocaleString()}</time> <span class="lang">${esc(r.language)}</span><p>${esc(r.text || "(photo only)")}</p>${r.photo ? `<img src="${r.photo}" alt="Citizen photo">` : ""}</li>`).join("")}</ul>
      <h3 class="sub">History</h3>
      <ul class="log">${t.log.map(l => `<li><time>${new Date(l.at).toLocaleString()}</time> ${esc(l.what)}</li>`).join("")}</ul>`;
    $("#detailDlg").showModal();
  }
  $("#ticketRows").addEventListener("click", e => {
    if (e.target.closest("select")) return;
    const tr = e.target.closest("tr[data-id]"); if (tr) openDetail(tr.dataset.id);
  });
  $("#ticketRows").addEventListener("keydown", e => {
    if (e.key === "Enter" && e.target.matches("tr[data-id]")) openDetail(e.target.dataset.id);
  });

  $("#csvBtn").addEventListener("click", () => {
    const now = Date.now();
    const head = ["priority", "id", "severity", "reason", "category", "department", "summary", "location", "reports", "status", "created", "language", "engine"];
    const rows = tickets.map(t => [P.priorityScore(t, now), t.id, t.severity, t.severityReason, t.category, deptName(t.department), t.summary,
      t.location, t.reports.length, t.status, new Date(t.createdAt).toISOString(), t.language, t.engine])
      .sort((a, b) => b[0] - a[0]);
    const csv = [head, ...rows].map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
    a.download = `civiclens-tickets-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  });

  $("#resetBtn").addEventListener("click", () => {
    if (!confirm("Delete every ticket in this browser?")) return;
    tickets = []; save(LS.seq, 1000); persist(); renderBoard();
  });

  $("#batchBtn").addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    const btn = $("#batchBtn");
    const list = window.CL_SAMPLES;
    for (let i = 0; i < list.length; i++) {
      btn.textContent = `Triaging ${i + 1} of ${list.length}…`;
      await triageComplaint(list[i].text, null, null);
      renderBoard();
      if (aiReady()) await sleep(1200); // stay under free-tier rate limits
    }
    btn.textContent = "Triage all samples";
    busy = false;
  });

  // ---------- start ----------
  renderEngine(); renderCounts();
  if (location.hash === "#dashboard") showView("dashboard");
  setInterval(() => { if (!$("#view-dashboard").hidden) renderBoard(); }, 60000);
  window.CL_APP = { triageComplaint, get tickets() { return tickets; } };
})();
