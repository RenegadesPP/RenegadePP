/* CivicLens — user interface: citizen form, complaint tracking, officer login + dashboard.
 * Talks to the Google Apps Script server (server-url.js). If the server can't be reached,
 * complaints are triaged on this device with the offline rule engine.
 */
(function () {
  const C = window.CL_CONFIG, R = window.CL_RULES, P = window.CL_PIPE;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const URL_ = (window.CL_BACKEND_URL || "").trim();
  const HAS_SERVER = /^https?:\/\//.test(URL_);

  // ---------- storage ----------
  const load = (k, d, store = localStorage) => { try { return JSON.parse(store.getItem(k)) ?? d; } catch (_) { return d; } };
  const save = (k, v, store = localStorage) => { try { store.setItem(k, JSON.stringify(v)); } catch (e) { console.warn("Storage full", e); } };
  const LS = { mine: "cl.mine", local: "cl.localTickets", seq: "cl.localSeq", session: "cl.session" };

  let photo = null;   // { mimeType, base64, thumb }
  let geo = null;     // { lat, lng, acc }
  let geoAddress = "";
  let busy = false;
  let session = load(LS.session, null, sessionStorage);   // { token, name, dept }
  let boardTickets = [];

  // ---------- server ----------
  async function api(action, payload = {}, timeoutMs = 45000) {
    if (!HAS_SERVER) throw new Error("Server not configured");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      // text/plain body = "simple" request, so Apps Script needs no CORS preflight.
      const res = await fetch(URL_, { method: "POST", body: JSON.stringify({ action, ...payload }), signal: ctrl.signal });
      const j = await res.json();
      if (!j.ok) { const e = new Error(j.error || "Server error"); e.server = true; throw e; }
      return j;
    } catch (e) {
      if (e.name === "AbortError") throw new Error("Server took too long to answer");
      throw e;
    } finally { clearTimeout(timer); }
  }

  async function checkServer() {
    const pill = $("#enginePill");
    if (!HAS_SERVER) { pill.textContent = "Offline mode"; pill.title = "No server configured — using on-device rules"; return; }
    try {
      const r = await api("ping", {}, 20000);
      pill.textContent = r.ai ? "AI online" : "Server online · AI key missing";
      pill.classList.toggle("is-ai", !!r.ai);
      if (r.city) $("#cityLabel").textContent = r.city;
    } catch (e) {
      pill.textContent = "Offline mode";
      pill.title = `Server unreachable (${e.message}) — using on-device rules`;
    }
  }

  // ---------- tabs ----------
  function showView(name) {
    const target = name === "dashboard" && !session ? "login" : name;
    document.querySelectorAll(".tab").forEach(b => {
      const on = b.dataset.view === name;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", on);
    });
    ["report", "track", "login", "dashboard"].forEach(v => { $(`#view-${v}`).hidden = v !== target; });
    if (target === "dashboard") loadBoard();
    if (target === "track") renderMine();
    if (target === "login") setTimeout(() => $("#loginUser").focus(), 50);
  }
  document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));
  function renderOfficerTab() {
    const tab = document.querySelector('.tab[data-view="dashboard"]');
    tab.firstChild.textContent = session ? "Officer dashboard " : "Officer login ";
    $("#openCount").hidden = !session;
  }

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
    const thumb = await resizeImage(file, 240, 0.6);
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

  // ---------- location (automatic) ----------
  const fmtAcc = a => (a >= 1000 ? `${(a / 1000).toFixed(1)} km` : `${a} m`);
  function renderGeo() {
    const st = $("#geoStatus");
    if (!geo) return;
    const rough = geo.acc > 500;
    st.innerHTML = `<strong>${esc(geoAddress || `${geo.lat}, ${geo.lng}`)}</strong><br>
      <small>±${fmtAcc(geo.acc)} · <a href="https://maps.google.com/?q=${geo.lat},${geo.lng}" target="_blank" rel="noopener">view on map</a> ·
      <button type="button" class="btn link" id="geoClear">remove</button></small>` +
      (rough ? `<br><small class="warn-inline">Approximate (from the network, not GPS). Mention a landmark in your complaint.</small>` : "");
    $("#geoClear").onclick = () => { geo = null; geoAddress = ""; st.textContent = "Location removed."; $("#geoBtn").hidden = false; };
    $("#geoBtn").hidden = true;
  }
  function detectLocation(fromClick) {
    const st = $("#geoStatus");
    if (!navigator.geolocation) { st.textContent = "This browser can't share location. Mention a landmark in your complaint."; return; }
    if (!window.isSecureContext) { st.textContent = "Location needs the https:// link."; return; }
    st.textContent = "Finding your location…";
    navigator.geolocation.getCurrentPosition(async p => {
      geo = { lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5), acc: Math.round(p.coords.accuracy) };
      geoAddress = "";
      renderGeo();
      if (HAS_SERVER) {
        try { geoAddress = (await api("geocode", { lat: geo.lat, lng: geo.lng }, 15000)).address; renderGeo(); } catch (_) {}
      }
    }, e => {
      st.textContent = {
        1: fromClick ? "Location is blocked. Tap the icon left of the web address → Permissions → Location → Allow, then try again."
                     : "Location not shared. Tap “Use my location” or mention a landmark.",
        2: "Couldn't find your position. Turn on location (GPS) on your phone, then try again.",
        3: "Location took too long. Try again, or mention a landmark.",
      }[e.code] || `Location error: ${e.message}`;
      $("#geoBtn").hidden = false;
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 120000 });
  }
  $("#geoBtn").addEventListener("click", () => detectLocation(true));

  // ---------- triage ----------
  function setStep(name) {
    const order = ["read", "classify", "guard", "route"];
    const i = order.indexOf(name);
    document.querySelectorAll("#steps li").forEach((li, j) => {
      li.classList.toggle("done", j < i);
      li.classList.toggle("active", j === i);
    });
  }

  // On-device fallback when the server can't be reached.
  function triageLocally(text, ph, gp, address, reason) {
    const raw = R.offlineTriage(text, !!ph);
    const f = P.buildTicketFields(raw, text, "offline-rules");
    f.aiError = reason;
    if (!f.location && address) f.location = "Near " + address;
    const n = load(LS.seq, 5000) + 1; save(LS.seq, n);
    const id = `CL-L${n}`, now = Date.now();
    const t = { id, createdAt: now, updatedAt: now, status: "Open", ...f, address, geo: gp, photo: ph ? ph.thumb : null,
      citizenReply: f.citizenReplyTemplate.split("{TICKET_ID}").join(id).split("{DEPT}").join(C.DEPARTMENTS[f.department].short),
      reports: [{ at: now, text, language: f.language }], log: [{ at: now, what: "Created on device (server unreachable)" }], localOnly: true };
    delete t.citizenReplyTemplate; delete t.duplicateHint;
    const list = load(LS.local, []); list.unshift(t); save(LS.local, list);
    return { ticket: t, merged: null, fields: { ...f, engine: "offline-rules" }, reply: t.citizenReply };
  }

  async function submitComplaint(text, ph, gp, address, onStep = () => {}) {
    onStep("read"); await sleep(150);
    onStep("classify");
    try {
      const timer = setTimeout(() => onStep("guard"), 2500);
      const out = await api("triage", { text, geo: gp, address,
        photo: ph ? { mimeType: ph.mimeType, base64: ph.base64 } : null, thumb: ph ? ph.thumb : "" });
      clearTimeout(timer);
      onStep("route"); await sleep(200);
      return out;
    } catch (e) {
      if (e.server) throw e; // the server answered with a real error, show it
      onStep("guard");
      const out = triageLocally(text, ph, gp, address, `server unreachable: ${e.message}`);
      onStep("route");
      return out;
    }
  }

  $("#complaintForm").addEventListener("submit", async e => {
    e.preventDefault();
    if (busy) return;
    const text = $("#complaintText").value.trim();
    $("#formError").textContent = "";
    if (!text && !photo) { $("#formError").textContent = "Describe the problem or add a photo to file a complaint."; return; }
    busy = true;
    $("#submitBtn").disabled = true; $("#submitBtn").textContent = "Filing complaint…";
    $("#resultEmpty").hidden = true; $("#ticketOut").innerHTML = ""; $("#steps").hidden = false;
    try {
      const out = await submitComplaint(text, photo, geo, geoAddress, setStep);
      document.querySelectorAll("#steps li").forEach(li => { li.classList.add("done"); li.classList.remove("active"); });
      await sleep(150);
      $("#steps").hidden = true;
      $("#ticketOut").innerHTML = ticketSlip(out, { citizen: true });
      const mine = load(LS.mine, []);
      if (!mine.includes(out.ticket.id)) { mine.unshift(out.ticket.id); save(LS.mine, mine.slice(0, 20)); }
      $("#complaintText").value = ""; clearPhoto();
      if (window.innerWidth < 900) $("#ticketOut").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      $("#steps").hidden = true; $("#resultEmpty").hidden = false;
      $("#formError").textContent = `Could not file the complaint: ${err.message}`;
    } finally {
      busy = false;
      $("#submitBtn").disabled = false; $("#submitBtn").textContent = "Triage complaint";
    }
  });

  // ---------- rendering helpers ----------
  const sevClass = s => `sev-${String(s).toLowerCase()}`;
  const deptName = d => C.DEPARTMENTS[d]?.name || d;
  const deptShort = d => (d === "ALL" ? "All departments" : C.DEPARTMENTS[d]?.short || d);
  const catLabel = c => C.CATEGORIES[c]?.label || c;
  function fmtLeft(h) {
    if (h <= 0) { const o = -h; return o < 1 ? `${Math.round(o * 60)} min overdue` : `${Math.round(o)} h overdue`; }
    if (h < 1) return `${Math.round(h * 60)} min`;
    if (h < 48) return `${Math.round(h)} h`;
    return `${Math.round(h / 24)} days`;
  }
  const hazardChips = hs => (hs || []).map(h => `<span class="chip">${esc(C.HAZARDS[h] || h)}</span>`).join("");
  const mapLink = g => (g ? ` <small>(<a href="https://maps.google.com/?q=${g.lat},${g.lng}" target="_blank" rel="noopener">${g.acc > 500 ? "approx. " : ""}map</a>)</small>` : "");

  function ticketSlip({ ticket: t, merged, fields: f, reply }, opts = {}) {
    f = f || t;
    const sla = P.slaInfo(t, Date.now());
    return `
    <article class="slip ${sevClass(t.severity)}">
      <div class="slip-band"><span>${t.severity}</span></div>
      <div class="slip-body">
        <div class="slip-top">
          <span class="ticket-id">${t.id}</span>
          <span class="engine-tag">${f.engine === "offline-rules" ? "Offline rules" : "Gemini AI"}${f.confidence != null ? ` · ${Math.round(f.confidence * 100)}% sure` : ""}</span>
        </div>
        ${merged ? `<p class="merged">This problem was already reported — your report was added to it. ${t.reports.length} citizens have now reported this, which raises its priority. <small>${esc(merged)}</small></p>` : ""}
        ${t.localOnly ? `<p class="warn">Saved on this device only — the server couldn't be reached. Please try again when you're online.</p>` : ""}
        ${f.aiError && !t.localOnly ? `<p class="warn">AI unavailable (${esc(f.aiError)}). Triaged with offline rules — an officer will review it.</p>` : ""}
        ${f.isValid === false ? `<p class="warn">This may not be a civic complaint. Sent to the Grievance Cell for manual review.</p>` : ""}
        <h2 class="slip-title">${esc(t.summary)}</h2>
        <dl class="facts">
          <div><dt>Category</dt><dd>${esc(catLabel(t.category))}</dd></div>
          <div><dt>Routed to</dt><dd>${esc(deptName(t.department))}</dd></div>
          <div><dt>Why ${t.severity.toLowerCase()}</dt><dd>${esc(t.severityReason)}</dd></div>
          <div><dt>Location</dt><dd>${esc(t.location || "Not given")}${mapLink(t.geo)}</dd></div>
          <div><dt>Act within</dt><dd>${t.status === "Resolved" ? "Resolved" : fmtLeft(sla.hoursLeft)}</dd></div>
          <div><dt>Status</dt><dd>${esc(t.status)}</dd></div>
        </dl>
        ${(t.hazards || []).length ? `<div class="chips">${hazardChips(t.hazards)}</div>` : ""}
        ${(f.overrides || []).length ? `<p class="guard"><strong>Safety guardrail:</strong> ${f.overrides.map(esc).join("; ")}. ${f.engine === "offline-rules" ? "Initial rating" : "The AI said"} ${esc(f.aiSeverity)}.</p>` : ""}
        ${f.photoObservation ? `<p class="photo-obs"><strong>Photo shows:</strong> ${esc(f.photoObservation)}${f.photoMismatch ? " — <em>doesn't match the text, flagged for review</em>" : ""}</p>` : ""}
        ${t.missingInfo ? `<p class="ask"><strong>${opts.citizen ? "Please also tell us" : "Officer needs"}:</strong> ${esc(t.missingInfo)}</p>` : ""}
        ${opts.citizen || opts.showReply ? `<div class="reply"><div class="reply-label">Message to the citizen</div><p>${esc(reply || t.citizenReply)}</p></div>` : ""}
        ${opts.citizen ? `<p class="hint">Save your ticket number <strong>${t.id}</strong> to track it under “Track my complaint”.</p>` : ""}
        ${!opts.citizen && f.ruleCheck && !f.ruleCheck.agrees && f.ruleCheck.category ? `<p class="crosscheck">Rule engine would have chosen <em>${esc(catLabel(f.ruleCheck.category))}</em> — category kept from AI.</p>` : ""}
      </div>
    </article>`;
  }

  // ---------- track ----------
  function trackCard(t) {
    return `<article class="track-card ${sevClass(t.severity)}">
      <div class="slip-top"><span class="ticket-id">${t.id}</span><span class="status-tag st-${t.status.replace(/\s/g, "").toLowerCase()}">${esc(t.status)}</span></div>
      <h3>${esc(t.summary)}</h3>
      <p class="issue-meta">${esc(catLabel(t.category))} · ${esc(deptName(t.department))}${t.location ? ` · ${esc(t.location)}` : ""}</p>
      <p class="issue-meta">Severity ${t.severity} · reported by ${t.reports} citizen${t.reports > 1 ? "s" : ""} · filed ${new Date(t.createdAt).toLocaleString()}</p>
      <ul class="log">${(t.log || []).map(l => `<li><time>${new Date(l.at).toLocaleString()}</time> ${esc(l.what)}</li>`).join("")}</ul>
    </article>`;
  }
  async function trackOne(id) {
    if (/^CL-L/i.test(id)) {
      const t = load(LS.local, []).find(x => x.id === id.toUpperCase());
      if (!t) throw new Error("Not found on this device");
      return { ...t, reports: t.reports.length };
    }
    return (await api("track", { id }, 20000)).ticket;
  }
  $("#trackForm").addEventListener("submit", async e => {
    e.preventDefault();
    const id = $("#trackId").value.trim();
    $("#trackError").textContent = ""; $("#trackOut").innerHTML = "<p class='hint'>Checking…</p>";
    try { $("#trackOut").innerHTML = trackCard(await trackOne(id)); }
    catch (err) { $("#trackOut").innerHTML = ""; $("#trackError").textContent = err.message; }
  });
  async function renderMine() {
    const mine = load(LS.mine, []);
    const ul = $("#myList");
    if (!mine.length) { ul.innerHTML = "<li class='hint'>No complaints filed from this device yet.</li>"; return; }
    ul.innerHTML = mine.map(id => `<li data-id="${id}"><button class="btn link" data-track="${id}">${id}</button> <span class="hint">loading…</span></li>`).join("");
    for (const id of mine) {
      const li = ul.querySelector(`li[data-id="${id}"] .hint`);
      try { const t = await trackOne(id); li.innerHTML = `${esc(t.status)} · ${esc(t.summary)}`; }
      catch (e) { li.textContent = "status unavailable"; }
    }
  }
  $("#myList").addEventListener("click", e => {
    const id = e.target.dataset.track; if (!id) return;
    $("#trackId").value = id; $("#trackForm").requestSubmit();
  });

  // ---------- officer login ----------
  $("#loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = $("#loginBtn");
    $("#loginError").textContent = "";
    if (!HAS_SERVER) { $("#loginError").textContent = "The server isn't connected yet, so officer login is unavailable."; return; }
    btn.disabled = true; btn.textContent = "Checking…";
    try {
      const r = await api("login", { username: $("#loginUser").value, password: $("#loginPass").value }, 20000);
      session = { token: r.token, name: r.name, dept: r.dept };
      save(LS.session, session, sessionStorage);
      $("#loginPass").value = "";
      renderOfficerTab();
      showView("dashboard");
    } catch (err) {
      $("#loginError").textContent = err.message;
    } finally { btn.disabled = false; btn.textContent = "Log in"; }
  });
  function logout(msg) {
    if (session && HAS_SERVER) api("logout", { token: session.token }).catch(() => {});
    session = null; sessionStorage.removeItem(LS.session); boardTickets = [];
    renderOfficerTab(); showView("dashboard");
    if (msg) $("#loginError").textContent = msg;
  }
  $("#logoutBtn").addEventListener("click", () => logout());

  // ---------- dashboard ----------
  $("#fDept").innerHTML += Object.entries(C.DEPARTMENTS).map(([k, v]) => `<option value="${k}">${esc(v.short)}</option>`).join("");
  $("#fSev").innerHTML += C.SEVERITIES.slice().reverse().map(s => `<option>${s}</option>`).join("");
  ["#fDept", "#fSev", "#fStatus"].forEach(s => $(s).addEventListener("change", renderBoard));
  $("#fSearch").addEventListener("input", renderBoard);

  async function loadBoard(quiet) {
    if (!session) return;
    const isAdmin = session.dept === "ALL";
    $("#whoAmI").textContent = `Signed in as ${session.name} — ${deptShort(session.dept)}`;
    document.querySelectorAll(".admin-only").forEach(el => { el.hidden = !isAdmin; });
    $("#fDept").hidden = !isAdmin;
    if (!quiet) $("#syncNote").textContent = "Loading…";
    try {
      const r = await api("list", { token: session.token }, 30000);
      boardTickets = r.tickets;
      $("#syncNote").textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
      renderBoard();
    } catch (e) {
      if (/SESSION_EXPIRED/.test(e.message)) return logout("Your session ended. Please log in again.");
      $("#syncNote").textContent = `Couldn't refresh: ${e.message}`;
    }
  }
  $("#refreshBtn").addEventListener("click", () => loadBoard());

  function filtered() {
    const d = $("#fDept").value, s = $("#fSev").value, st = $("#fStatus").value, q = $("#fSearch").value.toLowerCase();
    return boardTickets.filter(t =>
      (!d || t.department === d) && (!s || t.severity === s) &&
      (!st || (st === "active" ? t.status !== "Resolved" : t.status === st)) &&
      (!q || `${t.id} ${t.summary} ${t.location} ${(t.reports || []).map(r => r.text).join(" ")}`.toLowerCase().includes(q)));
  }

  function renderKpis() {
    const now = Date.now();
    const open = boardTickets.filter(t => t.status !== "Resolved");
    const by = s => open.filter(t => t.severity === s).length;
    const breached = open.filter(t => P.slaInfo(t, now).breached).length;
    const merged = boardTickets.reduce((n, t) => n + t.reports.length - 1, 0);
    $("#openCount").textContent = open.length;
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
    $("#boardEmpty").innerHTML = session && session.dept === "ALL"
      ? "<p>No tickets yet. File a complaint from any phone, or press <strong>Load demo complaints</strong>.</p>"
      : "<p>No tickets for your department right now.</p>";
    $("#ticketRows").innerHTML = rows.map(({ t, score }, i) => {
      const sla = P.slaInfo(t, now);
      return `<tr class="${sevClass(t.severity)} ${t.status === "Resolved" ? "is-done" : ""}" data-id="${t.id}" tabindex="0">
        <td class="rank"><span>${t.status === "Resolved" ? "–" : i + 1}</span><small title="Priority score">${score < 0 ? "" : score}</small></td>
        <td><span class="sev-tag ${sevClass(t.severity)}">${t.severity}</span></td>
        <td class="tid">${t.id}${t.photo ? ' <span class="has-photo" title="Has photo">◩</span>' : ""}</td>
        <td class="issue"><div class="issue-title">${esc(t.summary)}</div>
          <div class="issue-meta">${esc(catLabel(t.category))}${t.location ? ` — ${esc(t.location)}` : ""}${t.language && t.language !== "English" ? ` <span class="lang">${esc(t.language)}</span>` : ""}</div>
          <div class="issue-reason">${esc(t.severityReason)}</div></td>
        <td>${esc(deptShort(t.department))}</td>
        <td class="num">${t.reports.length > 1 ? `<strong>${t.reports.length}</strong>` : "1"}</td>
        <td class="${sla.breached ? "overdue" : ""}">${t.status === "Resolved" ? "Done" : fmtLeft(sla.hoursLeft)}</td>
        <td><select class="status" data-id="${t.id}" aria-label="Status of ${t.id}">
          ${["Open", "In progress", "Resolved"].map(s => `<option ${s === t.status ? "selected" : ""}>${s}</option>`).join("")}
        </select></td></tr>`;
    }).join("");
  }

  $("#ticketRows").addEventListener("change", async e => {
    if (!e.target.matches("select.status")) return;
    const sel = e.target, id = sel.dataset.id, status = sel.value;
    sel.disabled = true;
    try {
      const r = await api("update", { token: session.token, id, status }, 20000);
      boardTickets = boardTickets.map(t => (t.id === id ? r.ticket : t));
      renderBoard();
    } catch (err) {
      if (/SESSION_EXPIRED/.test(err.message)) return logout("Your session ended. Please log in again.");
      alert(`Couldn't update ${id}: ${err.message}`); loadBoard();
    }
  });

  function openDetail(id) {
    const t = boardTickets.find(x => x.id === id);
    if (!t) return;
    $("#detailBody").innerHTML = `
      ${ticketSlip({ ticket: t, merged: null, fields: t }, { showReply: true })}
      ${t.photo ? `<h3 class="sub">Photo</h3><img class="detail-photo" src="${t.photo}" alt="Citizen photo">` : ""}
      <h3 class="sub">Citizen reports (${t.reports.length})</h3>
      <ul class="reports">${t.reports.map(r => `<li><time>${new Date(r.at).toLocaleString()}</time> <span class="lang">${esc(r.language)}</span>${r.address ? ` <span class="hint">GPS: ${esc(r.address)}</span>` : ""}<p>${esc(r.text || "(photo only)")}</p></li>`).join("")}</ul>
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
    const rows = boardTickets.map(t => [P.priorityScore(t, now), t.id, t.severity, t.severityReason, t.category, deptName(t.department), t.summary,
      t.location, t.reports.length, t.status, new Date(t.createdAt).toISOString(), t.language, t.engine])
      .sort((a, b) => b[0] - a[0]);
    const csv = [head, ...rows].map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
    a.download = `civiclens-tickets-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  });

  $("#resetBtn").addEventListener("click", async () => {
    if (!confirm("Delete every ticket for all departments?")) return;
    try { await api("reset", { token: session.token }); loadBoard(); } catch (e) { alert(e.message); }
  });

  $("#batchBtn").addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    const btn = $("#batchBtn"), list = window.CL_SAMPLES;
    for (let i = 0; i < list.length; i++) {
      btn.textContent = `Filing ${i + 1} of ${list.length}…`;
      try { await api("triage", { text: list[i].text }); } catch (e) { console.warn(e); }
      await loadBoard(true);
      await sleep(1000); // stay under free-tier rate limits
    }
    btn.textContent = "Load demo complaints";
    busy = false;
  });

  // ---------- start ----------
  renderOfficerTab();
  checkServer();
  detectLocation(false);
  if (location.hash === "#officer") showView("dashboard");
  setInterval(() => { if (session && !$("#view-dashboard").hidden) loadBoard(true); }, 20000);
  window.CL_APP = { api, get board() { return boardTickets; } };
})();
